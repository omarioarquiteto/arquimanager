import { getApiKey, json, readBody, pluggyRequest } from './_pluggy_v2.mjs';

export default async function handler(request) {
  if (request.method === 'GET') {
    return json({
      ok: true,
      service: 'arquimanager-pluggy-v2',
      configured: Boolean(
        String(process.env.PLUGGY_CLIENT_ID || '').trim()
        && String(process.env.PLUGGY_CLIENT_SECRET || '').trim()
      ),
    });
  }

  if (request.method !== 'POST') {
    return json({ error: 'Método não permitido.' }, 405);
  }

  try {
    const body = await readBody(request);
    const itemId = typeof body.itemId === 'string' && body.itemId.trim()
      ? body.itemId.trim()
      : null;
    const clientUserId = typeof body.clientUserId === 'string' && body.clientUserId.trim()
      ? body.clientUserId.trim().slice(0, 200)
      : null;

    const apiKey = await getApiKey();

    const options = {
      clientUserId: clientUserId || undefined,
      // Meu Pluggy creates a separate proxy Item for each connected bank.
      // Do not block an additional bank because another Item already exists.
      avoidDuplicates: false,
    };

    const webhookUrl = String(process.env.PLUGGY_V2_WEBHOOK_URL || '').trim();
    if (webhookUrl) options.webhookUrl = webhookUrl;

    const payload = { options };
    if (itemId) payload.itemId = itemId;

    const data = await pluggyRequest({
      method: 'POST',
      path: '/connect_token',
      body: payload,
      apiKey,
      timeoutMs: 30_000,
    });

    if (!data?.accessToken) {
      return json({ error: 'A Pluggy não retornou um Connect Token.' }, 502);
    }

    return json({
      ok: true,
      accessToken: data.accessToken,
      expiresInMinutes: 30,
    });
  } catch (error) {
    console.error('[ArquiManager][PluggyV2] token', error);
    return json({
      error: error.message || 'Não foi possível gerar o Connect Token.',
      code: error.code || null,
    }, Number(error.status) || 500);
  }
}

export const config = {
  path: '/.netlify/functions/pluggy-v2-token',
};