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
    throw new Error('Pluggy não configurada no servidor. Defina PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET nas variáveis de ambiente do Netlify.');
  }

  const now = Date.now();
  if (cachedApiKey && cachedApiKeyExpiresAt > now + 60_000) {
    return cachedApiKey;
  }

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

export default async function handler(request) {
  if (request.method === 'GET') {
    return json({
      ok: true,
      configured: Boolean(process.env.PLUGGY_CLIENT_ID && process.env.PLUGGY_CLIENT_SECRET),
    });
  }

  if (request.method !== 'POST') {
    return json({ error: 'Método não permitido.' }, 405);
  }

  try {
    const body = await readJson(request);
    const itemId = typeof body.itemId === 'string' && body.itemId.trim()
      ? body.itemId.trim()
      : undefined;
    const clientUserId = typeof body.clientUserId === 'string' && body.clientUserId.trim()
      ? body.clientUserId.trim().slice(0, 200)
      : undefined;

    const apiKey = await getPluggyApiKey();

    const options = {
      avoidDuplicates: body.avoidDuplicates !== false,
    };

    if (clientUserId) options.clientUserId = clientUserId;

    const webhookUrl = process.env.PLUGGY_WEBHOOK_URL;
    if (webhookUrl) options.webhookUrl = webhookUrl;

    const payload = { options };
    if (itemId) payload.itemId = itemId;

    const response = await fetch(PLUGGY_API + '/connect_token', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-API-KEY': apiKey,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.accessToken) {
      throw new Error(data.message || data.codeDescription || 'A Pluggy não forneceu um Connect Token.');
    }

    return json({
      accessToken: data.accessToken,
      expiresInMinutes: 30,
    });
  } catch (error) {
    console.error('Pluggy connect-token error:', error.message);
    return json({ error: error.message || 'Erro ao gerar Connect Token.' }, 500);
  }
}

export const config = {
  path: '/.netlify/functions/pluggy-connect-token',
};
