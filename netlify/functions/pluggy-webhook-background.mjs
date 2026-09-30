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

const normalizeIds = (value) => {
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  if (value) return [String(value)];
  return [];
};

export default async function handler(request) {
  if (request.method === 'GET') {
    return json({
      ok: true,
      service: 'arquimanager-pluggy-webhook',
      status: 'ready',
    });
  }

  if (request.method !== 'POST') {
    return json({ error: 'Método não permitido.' }, 405);
  }

  const payload = await readJson(request);

  const event = String(payload.event || '').trim();
  const eventId = String(payload.eventId || '').trim();
  const itemId = String(payload.itemId || '').trim();
  const accountId = String(payload.accountId || '').trim();
  const transactionIds = normalizeIds(payload.transactionIds);

  // A Pluggy considera a entrega concluída quando recebe uma resposta 2xx
  // em até 10 segundos. Esta é uma Background Function do Netlify, então
  // a plataforma responde imediatamente e continua executando este handler.
  console.log('[Pluggy webhook]', {
    event,
    eventId,
    itemId,
    accountId,
    transactionIds,
    triggeredBy: payload.triggeredBy || null,
    clientUserId: payload.clientUserId || null,
    receivedAt: new Date().toISOString(),
  });

  // No momento a persistência definitiva dos dados continua centralizada
  // no fluxo de sincronização do ArquiManager. O webhook funciona como
  // receptor confiável dos eventos da Pluggy e já deixa identificados
  // item/account/transaction IDs para a próxima etapa de sincronização
  // automática no backend.
  return json({
    ok: true,
    received: true,
    event,
    eventId: eventId || null,
    itemId: itemId || null,
    accountId: accountId || null,
    transactionIds,
  }, 202);
}

export const config = {
  path: '/.netlify/functions/pluggy-webhook-background',
};
