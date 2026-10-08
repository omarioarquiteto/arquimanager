const call = async (path, body, options = {}) => {
  const controller = new AbortController();
  const timeout = Number(options.timeoutMs || 60_000);
  const timer = window.setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(path, {
      method: options.method || 'POST',
      headers: { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: controller.signal,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const error = new Error(data?.error || `HTTP ${response.status}`);
      error.code = data?.code || null;
      error.status = response.status;
      error.provider = data;
      throw error;
    }

    return data;
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error('A comunicação com o servidor Pluggy expirou.');
      timeoutError.code = 'CLIENT_TIMEOUT';
      throw timeoutError;
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
};

export const createConnectToken = ({
  itemId = null,
  clientUserId = null,
}) => call('/.netlify/functions/pluggy-v2-token', {
  ...(itemId ? { itemId } : {}),
  ...(clientUserId ? { clientUserId } : {}),
}, { timeoutMs: 30_000 });

export const readItemData = ({
  itemId,
  clientUserId = null,
}) => call('/.netlify/functions/pluggy-v2-sync', {
  itemId,
  ...(clientUserId ? { clientUserId } : {}),
}, { timeoutMs: 180_000 });

export const revokeItem = ({
  itemId,
  clientUserId = null,
}) => call('/.netlify/functions/pluggy-v2-delete-item', {
  itemId,
  ...(clientUserId ? { clientUserId } : {}),
}, { timeoutMs: 60_000 });