const API_BASE = 'https://api.pluggy.ai';

let apiKeyCache = null;
let apiKeyExpiresAt = 0;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const jsonHeaders = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

export const json = (body, status = 200, extraHeaders = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...jsonHeaders, ...extraHeaders },
  });

const apiError = (data, status) => {
  const error = new Error(
    String(data?.message || data?.codeDescription || data?.error || `Pluggy HTTP ${status}`).trim()
  );
  error.code = data?.code || null;
  error.status = status;
  error.provider = data;
  return error;
};

export const readBody = async (request) => {
  try {
    const body = await request.json();
    return body && typeof body === 'object' ? body : {};
  } catch {
    return {};
  }
};

export const getApiKey = async () => {
  const clientId = String(process.env.PLUGGY_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.PLUGGY_CLIENT_SECRET || '').trim();

  if (!clientId || !clientSecret) {
    throw new Error('PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET não estão configurados no servidor.');
  }

  const now = Date.now();
  if (apiKeyCache && apiKeyExpiresAt > now + 60_000) {
    return apiKeyCache;
  }

  const response = await fetch(API_BASE + '/auth', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ clientId, clientSecret }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.apiKey) {
    throw apiError(data, response.status);
  }

  apiKeyCache = data.apiKey;
  apiKeyExpiresAt = now + 110 * 60 * 1000;
  return apiKeyCache;
};

export const pluggyRequest = async ({
  method = 'GET',
  path,
  body,
  apiKey,
  timeoutMs = 60_000,
}) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(API_BASE + path, {
      method,
      headers: {
        'X-API-KEY': apiKey,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: controller.signal,
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw apiError(data, response.status);
    }
    return data;
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error(`A Pluggy não respondeu em ${Math.round(timeoutMs / 1000)} segundos: ${method} ${path}`);
      timeoutError.code = 'PLUGGY_TIMEOUT';
      timeoutError.status = 504;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};

const sanitize = (value, key = '') => {
  const normalizedKey = String(key)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

  const forbidden = new Set([
    'password', 'secret', 'clientsecret', 'apikey', 'accesstoken',
    'access_token', 'token', 'credentials', 'securitycode',
  ]);

  if (forbidden.has(normalizedKey)) return undefined;

  if (value == null) return value;

  if (Array.isArray(value)) {
    return value.map(item => sanitize(item)).filter(item => item !== undefined);
  }

  if (typeof value === 'object') {
    const output = {};
    for (const [childKey, childValue] of Object.entries(value)) {
      const childNormalized = String(childKey)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');

      if (childNormalized === 'cardnumber' || childNormalized === 'card_number') {
        const digits = String(childValue || '').replace(/\D/g, '');
        output[childKey] = digits ? digits.slice(-4) : null;
        continue;
      }

      const safeValue = sanitize(childValue, childKey);
      if (safeValue !== undefined) output[childKey] = safeValue;
    }
    return output;
  }

  return value;
};

const pageList = async ({ path, apiKey, maxPages = 1000 }) => {
  const results = [];
  let page = 1;

  while (page <= maxPages) {
    const separator = path.includes('?') ? '&' : '?';
    const response = await pluggyRequest({
      path: path + separator + new URLSearchParams({
        page: String(page),
        pageSize: '500',
      }).toString(),
      apiKey,
    });

    if (Array.isArray(response?.results)) results.push(...response.results);

    const totalPages = Number(response?.totalPages || 1);
    if (page >= totalPages) break;
    page += 1;
  }

  if (page > maxPages) {
    const error = new Error('A paginação da Pluggy excedeu o limite de segurança.');
    error.code = 'PAGINATION_LIMIT';
    throw error;
  }

  return results;
};

export const listAccounts = async (itemId, type, apiKey) =>
  pageList({
    path: '/accounts?' + new URLSearchParams({
      itemId,
      type,
    }).toString(),
    apiKey,
  });

export const listBills = async (accountId, apiKey) =>
  pageList({
    path: '/bills?' + new URLSearchParams({ accountId }).toString(),
    apiKey,
  });

export const listTransactions = async (accountId, apiKey) => {
  const results = [];
  let nextPath = '/v2/transactions?' + new URLSearchParams({ accountId }).toString();
  let pages = 0;

  while (nextPath && pages < 1000) {
    const response = await pluggyRequest({
      path: nextPath,
      apiKey,
    });

    if (Array.isArray(response?.results)) {
      results.push(...response.results);
    }

    const next = response?.next;
    nextPath = next ? '/v2/transactions' + next : null;
    pages += 1;
  }

  if (pages >= 1000) {
    const error = new Error('A paginação de transações da Pluggy excedeu o limite de segurança.');
    error.code = 'TRANSACTION_PAGINATION_LIMIT';
    throw error;
  }

  return results;
};

export const getItem = (itemId, apiKey) =>
  pluggyRequest({
    path: '/items/' + encodeURIComponent(itemId),
    apiKey,
  });

export const normalizeItem = (item) => ({
  id: item?.id || null,
  connectorId: item?.connector?.id || item?.connectorId || null,
  connectorName: item?.connector?.name || item?.connectorName || 'Instituição financeira',
  status: item?.status || null,
  executionStatus: item?.executionStatus || null,
  lastUpdatedAt: item?.lastUpdatedAt || null,
  updatedAt: item?.updatedAt || null,
  createdAt: item?.createdAt || null,
  clientUserId: item?.clientUserId || null,
  error: item?.error ? sanitize(item.error) : null,
  statusDetail: item?.statusDetail ? sanitize(item.statusDetail) : null,
  products: Array.isArray(item?.products) ? item.products : [],
  nextAutoSyncAt: item?.nextAutoSyncAt || null,
});

export const compactAccount = (account) => ({
  id: account?.id || null,
  itemId: account?.itemId || null,
  type: account?.type || null,
  subtype: account?.subtype || null,
  name: account?.name || account?.marketingName || 'Conta',
  marketingName: account?.marketingName || null,
  balance: account?.balance ?? 0,
  currencyCode: account?.currencyCode || 'BRL',
  createdAt: account?.createdAt || null,
  updatedAt: account?.updatedAt || null,
  creditData: account?.creditData ? sanitize(account.creditData) : null,
});

export const compactTransaction = (transaction) => ({
  ...sanitize(transaction),
  id: transaction?.id || null,
  accountId: transaction?.accountId || null,
  amount: transaction?.amount ?? 0,
  amountInAccountCurrency: transaction?.amountInAccountCurrency ?? null,
  date: transaction?.date || null,
  description: transaction?.description || transaction?.descriptionRaw || '',
  descriptionRaw: transaction?.descriptionRaw || null,
  merchant: transaction?.merchant ? sanitize(transaction.merchant) : null,
  currencyCode: transaction?.currencyCode || 'BRL',
  type: transaction?.type || null,
  status: transaction?.status || null,
  providerId: transaction?.providerId || null,
  providerCode: transaction?.providerCode || null,
  operationType: transaction?.operationType || null,
  createdAt: transaction?.createdAt || null,
  updatedAt: transaction?.updatedAt || null,
  creditCardMetadata: transaction?.creditCardMetadata ? sanitize(transaction.creditCardMetadata) : null,
  paymentData: transaction?.paymentData ? sanitize(transaction.paymentData) : null,
  boletoMetadata: transaction?.boletoMetadata ? sanitize(transaction.boletoMetadata) : null,
});

export const compactBill = (bill, accountId, itemId) => ({
  id: bill?.id || null,
  accountId,
  itemId,
  dueDate: bill?.dueDate || null,
  billClosingDate: bill?.billClosingDate || null,
  billForecastDate: bill?.billForecastDate || null,
  totalAmount: bill?.totalAmount ?? 0,
  totalAmountCurrencyCode: bill?.totalAmountCurrencyCode || 'BRL',
  minimumPaymentAmount: bill?.minimumPaymentAmount ?? null,
  allowsInstallments: Boolean(bill?.allowsInstallments),
  financeCharges: Array.isArray(bill?.financeCharges) ? sanitize(bill.financeCharges) : [],
  payments: Array.isArray(bill?.payments) ? sanitize(bill.payments) : [],
});

export const mapWithConcurrency = async (items, limit, worker) => {
  const output = new Array(items.length);
  let cursor = 0;

  const runWorker = async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      output[index] = await worker(items[index], index);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(limit, Math.max(1, items.length)) }, runWorker)
  );

  return output;
};

export { API_BASE, sleep };