import { json, readBody } from './_pluggy_v2.mjs';

export default async function handler(request) {
  if (request.method === 'GET') {
    return json({
      ok: true,
      service: 'arquimanager-pluggy-v2-webhook',
      status: 'ready',
    });
  }

  if (request.method !== 'POST') {
    return json({ error: 'Método não permitido.' }, 405);
  }

  const payload = await readBody(request);

  console.log('[ArquiManager][PluggyV2][Webhook]', {
    event: payload?.event || null,
    eventId: payload?.eventId || null,
    itemId: payload?.itemId || null,
    accountId: payload?.accountId || null,
    transactionIds: Array.isArray(payload?.transactionIds)
      ? payload.transactionIds.map(String)
      : [],
    receivedAt: new Date().toISOString(),
  });

  return json({
    ok: true,
    received: true,
  }, 200);
}

export const config = {
  path: '/.netlify/functions/pluggy-v2-webhook',
};