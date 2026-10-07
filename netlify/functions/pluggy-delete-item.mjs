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

export default async function handler(request) {
  if (request.method !== 'POST') {
    return json({ error: 'Método não permitido.' }, 405);
  }

  try {
    const body = await readJson(request);
    const itemId = typeof body.itemId === 'string' ? body.itemId.trim() : '';
    const clientUserId = typeof body.clientUserId === 'string' ? body.clientUserId.trim() : '';

    if (!itemId) return json({ error: 'itemId é obrigatório.' }, 400);

    const apiKey = await getPluggyApiKey();

    // Valida o Item antes de removê-lo. Quando clientUserId é fornecido,
    // também impede exclusão de uma conexão pertencente a outro usuário.
    const itemResponse = await fetch(PLUGGY_API + '/items/' + encodeURIComponent(itemId), {
      headers: { 'X-API-KEY': apiKey },
    });
    const item = await itemResponse.json().catch(() => ({}));

    if (!itemResponse.ok) {
      if (itemResponse.status === 404) {
        return json({ ok: true, alreadyDeleted: true, itemId });
      }
      throw new Error(item.message || item.codeDescription || `Falha Pluggy ao consultar a conexão (${itemResponse.status}).`);
    }

    if (clientUserId && item.clientUserId && item.clientUserId !== clientUserId) {
      return json({ error: 'Esta conexão Pluggy não pertence ao usuário informado.' }, 403);
    }

    const deleteResponse = await fetch(PLUGGY_API + '/items/' + encodeURIComponent(itemId), {
      method: 'DELETE',
      headers: { 'X-API-KEY': apiKey },
    });
    const deleteData = await deleteResponse.json().catch(() => ({}));

    if (!deleteResponse.ok && deleteResponse.status !== 404) {
      throw new Error(
        deleteData.message
        || deleteData.codeDescription
        || `Não foi possível excluir a conexão Pluggy (${deleteResponse.status}).`
      );
    }

    return json({
      ok: true,
      deleted: deleteResponse.status !== 404,
      alreadyDeleted: deleteResponse.status === 404,
      itemId,
    });
  } catch (error) {
    console.error('Pluggy delete item error:', error.message);
    return json({ error: error.message || 'Não foi possível excluir a conexão Pluggy.' }, 500);
  }
}

export const config = {
  path: '/.netlify/functions/pluggy-delete-item',
};
