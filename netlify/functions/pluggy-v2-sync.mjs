import {
  compactAccount,
  compactBill,
  compactTransaction,
  getApiKey,
  getItem,
  json,
  listAccounts,
  listBills,
  listTransactions,
  mapWithConcurrency,
  normalizeItem,
  readBody,
  sleep,
} from './_pluggy_v2.mjs';

const assertClientOwnership = (item, clientUserId) => {
  const expected = String(clientUserId || '').trim();
  const actual = String(item?.clientUserId || '').trim();

  // Itens criados pela integração nova carregam clientUserId.
  // Para conexões antigas, o item pode não possuir esse campo; o itemId
  // continua sendo a referência explícita já armazenada no Firestore.
  if (actual && expected && actual !== expected) {
    const error = new Error('A conexão Pluggy não pertence ao usuário atual.');
    error.status = 403;
    error.code = 'ITEM_USER_MISMATCH';
    throw error;
  }
};

const waitForReadyItem = async (itemId, apiKey, initialItem) => {
  let item = initialItem;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const status = String(item?.status || '').toUpperCase();
    const executionStatus = String(item?.executionStatus || '').toUpperCase();

    if (status === 'LOGIN_ERROR' || (status === 'OUTDATED' && executionStatus === 'ERROR')) {
      return item;
    }

    if (status === 'UPDATED') {
      return item;
    }

    await sleep(2000);
    item = await getItem(itemId, apiKey);
  }

  return item;
};

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
    const initialItem = await getItem(itemId, apiKey);

    assertClientOwnership(initialItem, clientUserId);

    const item = await waitForReadyItem(itemId, apiKey, initialItem);

    assertClientOwnership(item, clientUserId);

    const status = String(item?.status || '').toUpperCase();
    const executionStatus = String(item?.executionStatus || '').toUpperCase();

    if (status === 'LOGIN_ERROR') {
      return json({
        error: item?.error?.message || 'A conexão Pluggy está com erro de credenciais.',
        code: item?.error?.code || 'LOGIN_ERROR',
        item: normalizeItem(item),
      }, 409);
    }

    if (status === 'OUTDATED' && executionStatus === 'ERROR') {
      return json({
        error: item?.error?.message || 'A Pluggy não conseguiu atualizar esta conexão.',
        code: item?.error?.code || 'ITEM_OUTDATED',
        item: normalizeItem(item),
      }, 409);
    }

    if (!['UPDATED'].includes(status)) {
      return json({
        error: 'A Pluggy ainda não terminou a sincronização desta conexão.',
        code: 'ITEM_NOT_READY',
        item: normalizeItem(item),
      }, 409);
    }

    const [bankAccountsRaw, creditAccountsRaw] = await Promise.all([
      listAccounts(itemId, 'BANK', apiKey),
      listAccounts(itemId, 'CREDIT', apiKey),
    ]);

    const bankAccounts = bankAccountsRaw.map(compactAccount);
    const creditAccounts = creditAccountsRaw.map(compactAccount);

    const allAccounts = [...bankAccounts, ...creditAccounts];

    const transactionGroups = await mapWithConcurrency(
      allAccounts,
      4,
      async account => {
        const transactions = await listTransactions(account.id, apiKey);
        return {
          accountId: account.id,
          accountType: account.type,
          transactions: transactions.map(compactTransaction),
        };
      }
    );

    const transactions = transactionGroups
      .filter(group => group.accountType === 'BANK')
      .flatMap(group => group.transactions);

    const creditTransactions = transactionGroups
      .filter(group => group.accountType === 'CREDIT')
      .flatMap(group => group.transactions);

    const billGroups = await mapWithConcurrency(
      creditAccounts,
      4,
      async account => {
        try {
          const bills = await listBills(account.id, apiKey);
          return bills.map(bill => compactBill(bill, account.id, itemId));
        } catch (error) {
          // Algumas conexões podem não oferecer o produto Bills. A conta e
          // as transações continuam sendo válidas.
          console.warn('[ArquiManager][PluggyV2] bills indisponíveis', account.id, error.message);
          return [];
        }
      }
    );

    return json({
      ok: true,
      item: normalizeItem(item),
      bankAccounts,
      creditAccounts,
      transactions,
      creditTransactions,
      bills: billGroups.flat(),
      fetchedAt: new Date().toISOString(),
      warnings: executionStatus === 'PARTIAL_SUCCESS'
        ? ['A Pluggy concluiu com PARTIAL_SUCCESS. Alguns produtos podem não estar disponíveis.']
        : [],
    });
  } catch (error) {
    console.error('[ArquiManager][PluggyV2] sync', error);
    return json({
      error: error.message || 'Não foi possível ler os dados da conexão Pluggy.',
      code: error.code || null,
      item: error.provider ? normalizeItem(error.provider) : null,
    }, Number(error.status) || 500);
  }
}

export const config = {
  path: '/.netlify/functions/pluggy-v2-sync',
};