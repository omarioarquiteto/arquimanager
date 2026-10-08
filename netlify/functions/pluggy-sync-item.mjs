const PLUGGY_API = 'https://api.pluggy.ai';

let cachedApiKey = '';
let cachedApiKeyExpiresAt = 0;

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  },
});

const readJson = async (request) => {
  try { return await request.json(); } catch { return {}; }
};

const getPluggyApiKey = async () => {
  const clientId = process.env.PLUGGY_CLIENT_ID;
  const clientSecret = process.env.PLUGGY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Pluggy não configurada no servidor. Defina PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET no Netlify.');
  }

  const now = Date.now();
  if (cachedApiKey && cachedApiKeyExpiresAt > now + 60_000) return cachedApiKey;

  const response = await fetch(PLUGGY_API + '/auth', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ clientId, clientSecret }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.apiKey) {
    throw new Error(data.message || data.codeDescription || 'Não foi possível autenticar na Pluggy.');
  }

  cachedApiKey = data.apiKey;
  cachedApiKeyExpiresAt = now + (110 * 60 * 1000);
  return cachedApiKey;
};

const pluggyGet = async (path, apiKey) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  let response;

  try {
    response = await fetch(PLUGGY_API + path, {
      headers: { 'X-API-KEY': apiKey },
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`A Pluggy demorou mais de 30 segundos para responder à consulta ${path}. A sincronização foi interrompida para evitar travamento.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || data.codeDescription || `Falha Pluggy (${response.status}).`);
  }
  return data;
};

const listAccounts = async (itemId, apiKey) => {
  const accounts = [];
  let page = 1;

  while (true) {
    const query = new URLSearchParams({
      itemId,
      page: String(page),
      pageSize: '500',
    });
    const data = await pluggyGet('/accounts?' + query.toString(), apiKey);
    accounts.push(...(data.results || []));

    const totalPages = Number(data.totalPages || 1);
    if (page >= totalPages) break;
    page += 1;
  }

  return accounts;
};

const listTransactionsForAccount = async (accountId, apiKey) => {
  const results = [];
  let next = `?accountId=${encodeURIComponent(accountId)}`;
  
  while (next) {
    const data = await pluggyGet('/v2/transactions' + next, apiKey);
    results.push(...(data.results || []));
    next = data.next || null;
    if (results.length >= 10000) break;
  }

  return results.slice(0, 10000);
};

const listBillsForAccount = async (accountId, apiKey) => {
  const bills = [];
  let page = 1;

  while (true) {
    const query = new URLSearchParams({
      accountId,
      page: String(page),
      pageSize: '500',
    });
    const data = await pluggyGet('/bills?' + query.toString(), apiKey);
    bills.push(...(Array.isArray(data.results) ? data.results : []));

    const totalPages = Number(data.totalPages || 1);
    if (page >= totalPages) break;
    page += 1;
  }

  return bills;
};

const sanitizeBill = (bill, accountId, itemId) => ({
  id: bill.id,
  accountId,
  itemId,
  dueDate: bill.dueDate || null,
  billClosingDate: bill.billClosingDate || bill.closingDate || null,
  billForecastDate: bill.billForecastDate || null,
  totalAmount: bill.totalAmount ?? 0,
  totalAmountCurrencyCode: bill.totalAmountCurrencyCode || 'BRL',
  minimumPaymentAmount: bill.minimumPaymentAmount ?? null,
  allowsInstallments: Boolean(bill.allowsInstallments),
  financeCharges: Array.isArray(bill.financeCharges) ? bill.financeCharges : [],
  payments: Array.isArray(bill.payments) ? bill.payments : [],
});

const sanitizeAccount = (account) => ({
  id: account.id,
  itemId: account.itemId || null,
  type: account.type || null,
  subtype: account.subtype || null,
  name: account.name || account.marketingName || 'Conta',
  marketingName: account.marketingName || null,
  balance: account.balance ?? 0,
  currencyCode: account.currencyCode || 'BRL',
  createdAt: account.createdAt || null,
  updatedAt: account.updatedAt || null,
  creditData: account.creditData ? {
    level: account.creditData.level || null,
    brand: account.creditData.brand || null,
    balanceCloseDate: account.creditData.balanceCloseDate || null,
    balanceDueDate: account.creditData.balanceDueDate || null,
    availableCreditLimit: account.creditData.availableCreditLimit ?? null,
    minimumPayment: account.creditData.minimumPayment ?? null,
    creditLimit: account.creditData.creditLimit ?? null,
    status: account.creditData.status || null,
  } : null,
});

export default async function handler(request) {
  if (request.method !== 'POST') {
    return json({ error: 'Método não permitido.' }, 405);
  }

  try {
    const body = await readJson(request);
    const itemId = typeof body.itemId === 'string' ? body.itemId.trim() : '';
    const clientUserId = typeof body.clientUserId === 'string' ? body.clientUserId.trim() : '';

    if (!itemId) return json({ error: 'itemId é obrigatório.' }, 400);
    if (!clientUserId) return json({ error: 'clientUserId é obrigatório.' }, 400);

    const apiKey = await getPluggyApiKey();

    // Confirma que o Item pertence ao identificador enviado pelo ArquiManager.
    // Assim o endpoint não aceita arbitrariamente qualquer item do cliente Pluggy.
    const item = await pluggyGet('/items/' + encodeURIComponent(itemId), apiKey);
    if (item.clientUserId && item.clientUserId !== clientUserId) {
      return json({ error: 'Esta conexão Pluggy não pertence ao usuário informado.' }, 403);
    }
    if (!item.clientUserId) {
      return json({ error: 'A conexão Pluggy não possui vínculo com este usuário.' }, 403);
    }

    const accounts = await listAccounts(itemId, apiKey);
    const bankAccounts = accounts.filter(account => account.type === 'BANK');
    const creditAccounts = accounts.filter(account => account.type === 'CREDIT');

    const transactions = [];
    for (const account of bankAccounts) {
      const accountTransactions = await listTransactionsForAccount(account.id, apiKey);
      transactions.push(...accountTransactions);
    }

    // Contas CREDIT possuem transações próprias do cartão. Elas não devem
    // entrar no fluxo de caixa bancário, mas são indispensáveis para montar
    // cada fatura e para reconhecer parcelamentos.
    const creditTransactions = [];
    const bills = [];
    for (const account of creditAccounts) {
      const accountTransactions = await listTransactionsForAccount(account.id, apiKey);
      creditTransactions.push(...accountTransactions);

      try {
        const accountBills = await listBillsForAccount(account.id, apiKey);
        bills.push(...accountBills.map(bill => sanitizeBill(bill, account.id, itemId)));
      } catch (billError) {
        // Algumas instituições/conexões não expõem o produto Bills. Isso não
        // impede a sincronização das transações do cartão nem a projeção local.
        console.warn('Pluggy bills indisponíveis para a conta de crédito:', account.id, billError.message);
      }
    }

    return json({
      item: {
        id: item.id,
        connectorId: item.connector?.id || item.connectorId || null,
        connectorName: item.connector?.name || item.connectorName || 'Instituição financeira',
        status: item.status || null,
        clientUserId: item.clientUserId,
        updatedAt: item.updatedAt || null,
      },
      bankAccounts: bankAccounts.map(sanitizeAccount),
      creditAccounts: creditAccounts.map(sanitizeAccount),
      transactions,
      creditTransactions,
      bills,
      truncated: transactions.length >= 10000 || creditTransactions.length >= 10000,
      syncedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Pluggy sync error:', error.message);
    return json({ error: error.message || 'Falha ao sincronizar a conexão Pluggy.' }, 500);
  }
}

export const config = {
  path: '/.netlify/functions/pluggy-sync-item',
};
