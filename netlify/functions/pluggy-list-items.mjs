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
  try {
    return await request.json();
  } catch {
    return {};
  }
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

const normalize = (value) => String(value || '').trim().toLowerCase();

const listMeuPluggyItems = async (apiKey, clientUserId) => {
  const items = [];
  let next = '';

  do {
    const query = new URLSearchParams({
      clientUserId,
    });

    // A API retorna o valor de "next" pronto para ser anexado ao endpoint.
    // Na primeira chamada usamos os filtros; nas seguintes preservamos exatamente
    // o cursor retornado pela Pluggy.
    const path = next ? '/v2/items' + next : '/v2/items?' + query.toString();

    const response = await fetch(PLUGGY_API + path, {
      headers: { 'X-API-KEY': apiKey },
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const providerMessage = String(data.message || data.codeDescription || '').trim();
      const providerCode = String(data.code || '').toUpperCase();
      const normalizedProviderMessage = providerMessage.toLowerCase();

      const listItemsDisabled =
        providerCode === 'LIST_ITEMS_FEATURE_NOT_ENABLED'
        || normalizedProviderMessage.includes('not enabled to list its items')
        || normalizedProviderMessage.includes('não está habilitado para listar')
        || normalizedProviderMessage.includes('list items');

      if (response.status === 403 && listItemsDisabled) {
        const error = new Error(
          'A Pluggy não habilitou a listagem automática de Items para esta aplicação. O Arksuper continuará funcionando com os bancos do Meu Pluggy autorizados individualmente.'
        );
        error.code = 'LIST_ITEMS_FEATURE_NOT_ENABLED';
        error.status = 403;
        throw error;
      }

      const error = new Error(providerMessage || `Falha Pluggy ao listar conexões (${response.status}).`);
      error.code = data.code || null;
      error.status = response.status;
      throw error;
    }

    items.push(...(Array.isArray(data.results) ? data.results : []));
    next = data.next || null;
  } while (next);

  return items;
};

const sanitizeItem = (item) => ({
  id: item.id,
  connectorId: item.connector?.id || item.connectorId || null,
  connectorName: item.connector?.name || item.connectorName || 'Instituição financeira',
  status: item.status || null,
  executionStatus: item.executionStatus || null,
  lastUpdatedAt: item.lastUpdatedAt || item.updatedAt || null,
  clientUserId: item.clientUserId || null,
  isSandbox: Boolean(item.connector?.isSandbox ?? item.isSandbox),
  products: Array.isArray(item.products) ? item.products : [],
  error: item.error || null,
});

export default async function handler(request) {
  if (request.method !== 'POST') {
    return json({ error: 'Método não permitido.' }, 405);
  }

  try {
    const body = await readJson(request);
    const clientUserId = typeof body.clientUserId === 'string'
      ? body.clientUserId.trim().slice(0, 200)
      : '';

    if (!clientUserId) {
      return json({ error: 'clientUserId é obrigatório.' }, 400);
    }

    const apiKey = await getPluggyApiKey();
    const allItems = await listMeuPluggyItems(apiKey, clientUserId);

    // Somente proxy Items do MeuPluggy. Isso evita que uma eventual conexão
    // direta de outra instituição com o mesmo clientUserId seja incorporada.
    const items = allItems
      .filter(item => normalize(item.connector?.name || item.connectorName) === 'meupluggy')
      .filter(item => !Boolean(item.connector?.isSandbox ?? item.isSandbox))
      .map(sanitizeItem);

    return json({
      ok: true,
      items,
      count: items.length,
      clientUserId,
      retrievedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Pluggy list items error:', error.message);

    return json({
      error: error.message || 'Não foi possível listar as conexões do Meu Pluggy.',
      code: error.code || null,
      requiresIndividualAuthorization: error.code === 'LIST_ITEMS_FEATURE_NOT_ENABLED',
    }, error.status || 500);
  }
}

export const config = {
  path: '/.netlify/functions/pluggy-list-items',
};
