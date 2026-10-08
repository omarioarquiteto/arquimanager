import { getApiKey, getItem, json, pluggyRequest, readBody } from './_pluggy_v2.mjs';

export default async function handler(request) {
  if (request.method !== 'POST') {
    return json({ error: 'Método não permitido.' }, 405);
  }

  try {
    const body = await readBody(request);
    const itemId = typeof body.itemId === 'string' ? body.itemId.trim() : '';
    const clientUserId = typeof body.clientUserId === 'string' ? body.clientUserId.trim() : '';

    if (!itemId) return json({ error: 'itemId é obrigatório.' }, 400);

    const apiKey = await getApiKey();
    let item = null;

    try {
      item = await getItem(itemId, apiKey);
    } catch (error) {
      if (Number(error.status) === 404) {
        return json({ ok: true, alreadyDeleted: true, itemId });
      }
      throw error;
    }

    if (
      item?.clientUserId
      && clientUserId
      && String(item.clientUserId).trim() !== clientUserId
    ) {
      return json({
        error: 'A conexão Pluggy não pertence ao usuário atual.',
        code: 'ITEM_USER_MISMATCH',
      }, 403);
    }

    const response = await pluggyRequest({
      method: 'DELETE',
      path: '/items/' + encodeURIComponent(itemId),
      apiKey,
      timeoutMs: 45_000,
    });

    return json({
      ok: true,
      itemId,
      deletedCount: Number(response?.count || 0),
    });
  } catch (error) {
    console.error('[ArquiManager][PluggyV2] delete', error);
    return json({
      error: error.message || 'Não foi possível excluir a conexão na Pluggy.',
      code: error.code || null,
    }, Number(error.status) || 500);
  }
}

export const config = {
  path: '/.netlify/functions/pluggy-v2-delete-item',
};