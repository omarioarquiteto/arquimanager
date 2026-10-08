import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Landmark, Link2, RefreshCw, ShieldCheck, Trash2, XCircle, AlertTriangle, CheckCircle2 } from 'lucide-react';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  deleteDoc,
} from 'firebase/firestore';
import { createConnectToken, readItemData, revokeItem } from './pluggyV2Service.js';

const PLUGGY_WIDGET_SRC = 'https://cdn.pluggy.ai/pluggy-connect/latest/pluggy-connect.js';
const PLUGGY_SOURCE = 'PLUGGY_REBUILT';
const PLUGGY_INTEGRATION_VERSION = 2;

let pluggyWidgetPromise = null;

const loadPluggyWidget = () => {
  if (window.PluggyConnect) return Promise.resolve(window.PluggyConnect);
  if (pluggyWidgetPromise) return pluggyWidgetPromise;

  pluggyWidgetPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-arquimanager-pluggy-v2]');
    if (existing) {
      existing.addEventListener('load', () => {
        if (window.PluggyConnect) resolve(window.PluggyConnect);
        else reject(new Error('O Pluggy Connect foi carregado sem disponibilizar o widget.'));
      }, { once: true });
      existing.addEventListener('error', () => reject(new Error('Não foi possível carregar o Pluggy Connect.')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = PLUGGY_WIDGET_SRC;
    script.async = true;
    script.dataset.arquimanagerPluggyV2 = 'true';
    script.onload = () => {
      if (window.PluggyConnect) resolve(window.PluggyConnect);
      else reject(new Error('O Pluggy Connect foi carregado sem disponibilizar o widget.'));
    };
    script.onerror = () => reject(new Error('Não foi possível carregar o Pluggy Connect.'));
    document.head.appendChild(script);
  });

  return pluggyWidgetPromise;
};

const coll = (db, name) => collection(db, 'artifacts/arquimanager-producao/public/data', name);
const refDoc = (db, name, id) => doc(db, 'artifacts/arquimanager-producao/public/data', name, id);

const normalizeText = (value = '') =>
  String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const toCents = (value) => {
  if (value == null || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value * 100) : 0;
  let text = String(value).trim().replace(/R\$|\s/g, '');
  if (text.includes(',') && text.includes('.')) text = text.replace(/\./g, '').replace(',', '.');
  else if (text.includes(',')) text = text.replace(',', '.');
  const number = Number(text);
  return Number.isFinite(number) ? Math.round(number * 100) : 0;
};

const dateOnly = (value) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value).slice(0, 10);
  return [
    parsed.getFullYear(),
    String(parsed.getMonth() + 1).padStart(2, '0'),
    String(parsed.getDate()).padStart(2, '0'),
  ].join('-');
};

const hash = (value = '') => {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
};

const batchWrite = async (db, operations, chunkSize = 350) => {
  for (let start = 0; start < operations.length; start += chunkSize) {
    const batch = writeBatch(db);
    const chunk = operations.slice(start, start + chunkSize);

    chunk.forEach(operation => {
      const target = refDoc(db, operation.collection, operation.id);

      if (operation.type === 'delete') {
        batch.delete(target);
      } else if (operation.type === 'set') {
        batch.set(target, operation.data, { merge: true });
      } else if (operation.type === 'update') {
        batch.update(target, operation.data);
      }
    });

    await batch.commit();
  }
};

const financialAmount = (transaction) =>
  Math.abs(Number(transaction?.amountInAccountCurrency ?? transaction?.amount ?? 0));

const financialType = (transaction) => {
  const providerType = normalizeText(transaction?.type || '');
  if (providerType === 'credit' || providerType === 'income') return 'INCOME';
  if (providerType === 'debit' || providerType === 'expense') return 'EXPENSE';
  return Number(transaction?.amountInAccountCurrency ?? transaction?.amount ?? 0) < 0
    ? 'EXPENSE'
    : 'INCOME';
};

const merchantName = (transaction) =>
  String(
    transaction?.merchant?.name
    || transaction?.merchant?.businessName
    || transaction?.description
    || 'Movimentação bancária'
  ).trim();

const billPaymentLike = (transaction) => {
  const text = normalizeText(
    String(transaction?.description || '') + ' ' + String(transaction?.operationType || '')
  );
  return /(pagamento|pagto|fatura)/.test(text) && /(cartao|credito)/.test(text);
};

const transferLike = (transaction) => {
  const text = normalizeText(
    String(transaction?.description || '') + ' ' + String(transaction?.operationType || '')
  );
  return /(transferencia|ted|doc|pix)/.test(text);
};

const safeRuleMap = (rules) => {
  const map = new Map();
  (Array.isArray(rules) ? rules : []).forEach(rule => {
    const merchant = normalizeText(rule?.merchantNormalized || '');
    if (!merchant || !rule?.categoryId) return;
    map.set(merchant, {
      categoryId: rule.categoryId,
      projectId: rule.projectId || null,
    });
  });
  return map;
};

const makeTransactionPayload = ({
  companyId,
  itemId,
  accountId,
  transaction,
  existing,
  cardId = null,
  billId = null,
}) => {
  const type = financialType(transaction);
  const amountCents = financialAmount(transaction)
    ? toCents(financialAmount(transaction))
    : 0;
  const description = String(transaction?.description || transaction?.descriptionRaw || 'Movimentação bancária').trim();
  const merchant = merchantName(transaction);
  const externalId = `pluggy-v2:${transaction.id}`;

  const base = {
    companyId,
    source: PLUGGY_SOURCE,
    integrationVersion: PLUGGY_INTEGRATION_VERSION,
    provider: 'PLUGGY',
    providerItemId: itemId,
    providerTransactionId: transaction.id,
    providerAccountId: accountId || transaction.accountId || null,
    externalId,
    accountId: cardId || `${companyId}_pluggy_v2_account_${accountId}`,
    financialAccountId: cardId || `${companyId}_pluggy_v2_account_${accountId}`,
    cardId,
    billId,
    accountType: cardId ? 'CREDIT_CARD' : 'BANK_ACCOUNT',
    isCreditCardTransaction: Boolean(cardId),
    cashImpact: !cardId,
    date: dateOnly(transaction.date),
    actualDate: cardId ? null : dateOnly(transaction.date),
    expectedDate: null,
    description,
    descriptionRaw: transaction?.descriptionRaw || null,
    merchant,
    normalizedMerchant: normalizeText(merchant),
    amountCents,
    type,
    currencyCode: transaction?.currencyCode || 'BRL',
    bankBalanceCents: transaction?.balance == null ? null : toCents(transaction.balance),
    providerStatus: transaction?.status || null,
    providerType: transaction?.type || null,
    providerId: transaction?.providerId || null,
    providerCode: transaction?.providerCode || null,
    operationType: transaction?.operationType || null,
    providerRawData: transaction,
    importedAt: existing?.importedAt || new Date().toISOString(),
    updatedAt: serverTimestamp(),
  };

  if (!existing) {
    base.status = 'IDENTIFICATION_REQUIRED';
    base.categoryId = null;
    base.projectId = null;
    base.clientId = null;
    base.supplierId = null;
    base.notes = '';
    base.reconciliationType = null;
  }

  return base;
};

const cardIdFor = (companyId, accountId) =>
  `${companyId}_pluggy_v2_card_${accountId}`;

const bankAccountIdFor = (companyId, accountId) =>
  `${companyId}_pluggy_v2_account_${accountId}`;

const billIdFor = (companyId, cardId, referenceMonth) =>
  `${companyId}_pluggy_v2_bill_${cardId}_${referenceMonth}`;

const reconcileExactRule = (ruleMap, merchant) => {
  const exact = ruleMap.get(normalizeText(merchant));
  return exact || null;
};

const statusForBill = (totalCents, paidCents, dueDate) => {
  if (totalCents > 0 && paidCents >= totalCents) return 'PAID';
  if (paidCents > 0) return 'PARTIALLY_PAID';
  if (dueDate && dueDate < new Date().toISOString().slice(0, 10)) return 'OVERDUE';
  return 'OPEN';
};

export default function PluggyConnectionsV2({
  appUser,
  companyId,
  db,
  connections = [],
  onNotice,
}) {
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(null);
  const [selectedForClear, setSelectedForClear] = useState(null);
  const [selectedForDelete, setSelectedForDelete] = useState(null);
  const widgetRef = useRef(null);
  const clientUserId = appUser?.id ? `arquimanager:${appUser.id}` : '';

  useEffect(() => () => {
    try { widgetRef.current?.destroy?.(); } catch {}
    widgetRef.current = null;
  }, []);

  const showNotice = (message) => {
    if (message) onNotice?.(message);
  };

  const setFailure = (message) => {
    const text = message || 'Não foi possível concluir a operação Pluggy.';
    setError(text);
    showNotice(text);
  };

  const saveConnectionRecord = async (item) => {
    const itemId = item?.id;
    if (!itemId) throw new Error('A Pluggy concluiu a conexão sem informar o itemId.');

    await setDoc(
      refDoc(db, 'financial_connections', `${companyId}_${itemId}`),
      {
        companyId,
        itemId,
        connectorId: item?.connectorId || null,
        connectorName: item?.connectorName || 'Instituição financeira',
        clientUserId: item?.clientUserId || clientUserId || null,
        status: item?.status || 'UPDATED',
        executionStatus: item?.executionStatus || null,
        integrationVersion: PLUGGY_INTEGRATION_VERSION,
        integrationSource: PLUGGY_SOURCE,
        lastConnectedAt: new Date().toISOString(),
        lastUpdatedAt: item?.lastUpdatedAt || null,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  };

  const materialize = async (connection, data) => {
    const itemId = connection.itemId;
    const bankAccounts = Array.isArray(data.bankAccounts) ? data.bankAccounts : [];
    const creditAccounts = Array.isArray(data.creditAccounts) ? data.creditAccounts : [];
    const bankTransactions = Array.isArray(data.transactions) ? data.transactions : [];
    const creditTransactions = Array.isArray(data.creditTransactions) ? data.creditTransactions : [];
    const rawBills = Array.isArray(data.bills) ? data.bills : [];

    const [transactionSnapshot, rulesSnapshot, inboxSnapshot] = await Promise.all([
      getDocs(query(
        coll(db, 'financial_transactions'),
        where('providerItemId', '==', itemId)
      )),
      getDocs(query(
        coll(db, 'financial_rules'),
        where('companyId', '==', companyId)
      )),
      getDocs(query(
        coll(db, 'financial_inbox'),
        where('source', '==', PLUGGY_SOURCE)
      )),
    ]);

    const existingTransactions = transactionSnapshot.docs
      .map(item => ({ id: item.id, ...item.data() }))
      .filter(item =>
        item.companyId === companyId
        && (
          item.providerItemId === itemId
          || (
            item.source === PLUGGY_SOURCE
            && item.providerItemId === itemId
          )
        )
      );

    const existingById = new Map(existingTransactions.map(item => [item.id, item]));
    const ruleMap = safeRuleMap(
      rulesSnapshot.docs
        .map(item => item.data())
        .filter(item => item.companyId === companyId)
    );

    const operations = [];
    let newTransactions = 0;
    let classified = 0;

    for (const account of bankAccounts) {
      if (!account?.id) continue;
      operations.push({
        collection: 'financial_accounts',
        id: bankAccountIdFor(companyId, account.id),
        type: 'set',
        data: {
          companyId,
          name: account.name || account.marketingName || 'Conta bancária',
          institution: connection.connectorName || data.item?.connectorName || 'Instituição financeira',
          type: account.subtype === 'SAVINGS_ACCOUNT' ? 'CONTA_POUPANCA' : 'CONTA_CORRENTE',
          balanceCents: toCents(account.balance),
          currencyCode: account.currencyCode || 'BRL',
          provider: 'PLUGGY',
          source: PLUGGY_SOURCE,
          integrationVersion: PLUGGY_INTEGRATION_VERSION,
          providerAccountId: account.id,
          providerItemId: itemId,
          balanceSource: 'PLUGGY',
          lastBalanceSyncAt: data.fetchedAt,
          active: true,
          updatedAt: serverTimestamp(),
        },
      });
    }

    const cardByAccount = new Map();
    for (const account of creditAccounts) {
      if (!account?.id) continue;
      const cardId = cardIdFor(companyId, account.id);
      cardByAccount.set(account.id, cardId);

      const credit = account.creditData || {};
      operations.push({
        collection: 'financial_cards',
        id: cardId,
        type: 'set',
        data: {
          companyId,
          name: account.name || account.marketingName || 'Cartão de crédito',
          institution: connection.connectorName || data.item?.connectorName || 'Instituição financeira',
          source: PLUGGY_SOURCE,
          provider: 'PLUGGY',
          integrationVersion: PLUGGY_INTEGRATION_VERSION,
          providerCardId: account.id,
          providerAccountId: account.id,
          providerItemId: itemId,
          brand: credit.brand || null,
          limitCents: credit.creditLimit == null ? null : toCents(credit.creditLimit),
          availableCreditCents: credit.availableCreditLimit == null ? null : toCents(credit.availableCreditLimit),
          balanceCents: Math.abs(toCents(account.balance)),
          closingDay: credit.balanceCloseDate ? Number(dateOnly(credit.balanceCloseDate).slice(8, 10)) : 1,
          dueDay: credit.balanceDueDate ? Number(dateOnly(credit.balanceDueDate).slice(8, 10)) : 10,
          creditStatus: credit.status || null,
          lastBalanceSyncAt: data.fetchedAt,
          active: true,
          updatedAt: serverTimestamp(),
        },
      });
    }

    const billByProviderId = new Map();
    for (const rawBill of rawBills) {
      if (!rawBill?.id || !rawBill?.accountId) continue;
      const cardId = cardByAccount.get(rawBill.accountId);
      if (!cardId) continue;

      const closingDate = dateOnly(rawBill.billClosingDate || rawBill.billForecastDate || rawBill.dueDate);
      const dueDate = dateOnly(rawBill.dueDate);
      const referenceMonth = (closingDate || dueDate || '').slice(0, 7);
      if (!referenceMonth) continue;

      const billId = billIdFor(companyId, cardId, referenceMonth);
      billByProviderId.set(String(rawBill.id), billId);

      const totalCents = Math.abs(toCents(rawBill.totalAmount));
      const paidCents = Array.isArray(rawBill.payments)
        ? rawBill.payments.reduce((sum, payment) => sum + Math.abs(toCents(payment?.amount)), 0)
        : 0;

      operations.push({
        collection: 'financial_bills',
        id: billId,
        type: 'set',
        data: {
          companyId,
          cardId,
          source: PLUGGY_SOURCE,
          provider: 'PLUGGY',
          integrationVersion: PLUGGY_INTEGRATION_VERSION,
          providerBillId: rawBill.id,
          providerAccountId: rawBill.accountId,
          providerItemId: itemId,
          referenceMonth,
          closingDate: closingDate || null,
          dueDate: dueDate || null,
          officialTotalCents: totalCents,
          projectedCents: 0,
          totalCents,
          paidCents,
          minimumPaymentCents: rawBill.minimumPaymentAmount == null ? null : toCents(rawBill.minimumPaymentAmount),
          allowsInstallments: Boolean(rawBill.allowsInstallments),
          financeCharges: Array.isArray(rawBill.financeCharges) ? rawBill.financeCharges : [],
          payments: Array.isArray(rawBill.payments) ? rawBill.payments : [],
          providerRawData: rawBill,
          provisional: false,
          status: statusForBill(totalCents, paidCents, dueDate),
          updatedAt: serverTimestamp(),
        },
      });
    }

    const allTx = [
      ...bankTransactions.map(transaction => ({
        transaction,
        accountId: transaction.accountId,
        cardId: null,
      })),
      ...creditTransactions.map(transaction => ({
        transaction,
        accountId: transaction.accountId,
        cardId: cardByAccount.get(transaction.accountId) || null,
      })),
    ];

    const transactionIds = new Set();

    for (const entry of allTx) {
      const transaction = entry.transaction;
      const accountId = entry.accountId;
      if (!transaction?.id || !accountId) continue;

      const cardId = entry.cardId;
      const providerBillId = String(
        transaction?.creditCardMetadata?.billId
        || transaction?.billId
        || ''
      ).trim();
      const localBillId = providerBillId
        ? (billByProviderId.get(providerBillId) || null)
        : null;

      const transactionId = `${companyId}_pluggy_v2_tx_${hash(`pluggy-v2:${transaction.id}`)}`;
      transactionIds.add(transactionId);

      const existing = existingById.get(transactionId) || null;
      const payload = makeTransactionPayload({
        companyId,
        itemId,
        accountId,
        transaction,
        existing,
        cardId,
        billId: localBillId,
      });

      if (!existing) {
        const rule = reconcileExactRule(ruleMap, payload.merchant);
        if (rule) {
          payload.categoryId = rule.categoryId || null;
          payload.projectId = payload.type === 'EXPENSE' ? null : (rule.projectId || null);
          payload.status = payload.categoryId || payload.projectId ? 'CLASSIFIED' : 'IDENTIFICATION_REQUIRED';
          classified += payload.status === 'CLASSIFIED' ? 1 : 0;
        }
        newTransactions += 1;
      }

      operations.push({
        collection: 'financial_transactions',
        id: transactionId,
        type: 'set',
        data: payload,
      });
    }

    // Remove itens de Atenção criados pela nova integração quando o lançamento
    // agora tem classificação automática ou já não está mais pendente.
    const inboxOperations = [];

    inboxSnapshot.docs.forEach(item => {
      const data = item.data();
      if (
        data.companyId === companyId
        && data.source === PLUGGY_SOURCE
        && transactionIds.has(data.transactionId)
      ) {
        const currentTransaction = existingById.get(data.transactionId);
        if (currentTransaction?.status === 'CLASSIFIED') {
          inboxOperations.push({
            collection: 'financial_inbox',
            id: item.id,
            type: 'update',
            data: {
              status: 'RESOLVED',
              resolvedAt: serverTimestamp(),
              resolvedBy: 'PLUGGY_V2_SYNC',
            },
          });
        }
      }
    });

    // Cada novo lançamento bancário sem classificação automática recebe apenas
    // um item de Atenção determinístico, sem duplicar em sincronizações seguintes.
    const existingInboxKeys = new Set(
      inboxSnapshot.docs
        .map(item => ({ id: item.id, ...item.data() }))
        .filter(item => item.companyId === companyId && item.source === PLUGGY_SOURCE)
        .map(item => String(item.transactionId || ''))
        .filter(Boolean)
    );

    for (const entry of allTx) {
      const transaction = entry.transaction;
      const accountId = entry.accountId;
      if (!transaction?.id || !accountId) continue;

      const transactionId = `${companyId}_pluggy_v2_tx_${hash(`pluggy-v2:${transaction.id}`)}`;
      const current = existingById.get(transactionId);
      const isUnclassified = !current
        ? !reconcileExactRule(ruleMap, merchantName(transaction))
        : current.status === 'IDENTIFICATION_REQUIRED';

      if (!isUnclassified) continue;
      if (existingInboxKeys.has(transactionId)) continue;

      inboxOperations.push({
        collection: 'financial_inbox',
        id: `${companyId}_pluggy_v2_attention_${hash(transactionId)}`,
        type: 'set',
        data: {
          companyId,
          transactionId,
          kind: billPaymentLike(transaction)
            ? 'CARD_BILL_PAYMENT'
            : transferLike(transaction)
              ? 'TRANSFER'
              : 'CLASSIFICATION',
          reason: billPaymentLike(transaction)
            ? 'Verificar pagamento de cartão'
            : transferLike(transaction)
              ? 'Verificar possível transferência'
              : 'Classificar movimentação importada',
          confidence: 0,
          source: PLUGGY_SOURCE,
          status: 'OPEN',
          createdAt: serverTimestamp(),
        },
      });
    }

    operations.push(...inboxOperations);

    // A conexão é a fonte da referência do usuário para o Item.
    operations.push({
      collection: 'financial_connections',
      id: `${companyId}_${itemId}`,
      type: 'set',
      data: {
        companyId,
        itemId,
        connectorId: data.item?.connectorId || connection.connectorId || null,
        connectorName: data.item?.connectorName || connection.connectorName || 'Instituição financeira',
        clientUserId: data.item?.clientUserId || connection.clientUserId || clientUserId || null,
        status: data.item?.status || null,
        executionStatus: data.item?.executionStatus || null,
        integrationVersion: PLUGGY_INTEGRATION_VERSION,
        integrationSource: PLUGGY_SOURCE,
        lastConnectedAt: connection.lastConnectedAt || new Date().toISOString(),
        lastUpdatedAt: data.item?.lastUpdatedAt || null,
        lastSyncedAt: data.fetchedAt,
        lastSyncAccounts: bankAccounts.length,
        lastSyncTransactions: bankTransactions.length,
        lastSyncCreditAccounts: creditAccounts.length,
        lastSyncCreditTransactions: creditTransactions.length,
        lastSyncBills: rawBills.length,
        autoClassified: classified,
        warningCount: Array.isArray(data.warnings) ? data.warnings.length : 0,
        updatedAt: serverTimestamp(),
      },
    });

    setProgress({
      percent: 58,
      status: 'Gravando dados no ArquiManager...',
    });

    await batchWrite(db, operations);

    setProgress({
      percent: 84,
      status: 'Finalizando sincronização...',
    });

    await batchWrite(db, [{
      collection: 'financial_sync_runs',
      id: `${companyId}_pluggy_v2_${hash(`${itemId}|${data.fetchedAt}`)}`,
      type: 'set',
      data: {
        companyId,
        source: PLUGGY_SOURCE,
        integrationVersion: PLUGGY_INTEGRATION_VERSION,
        itemId,
        connectorName: data.item?.connectorName || connection.connectorName || 'Instituição financeira',
        fetchedAt: data.fetchedAt,
        bankAccounts: bankAccounts.length,
        transactions: bankTransactions.length,
        creditAccounts: creditAccounts.length,
        creditTransactions: creditTransactions.length,
        bills: rawBills.length,
        newTransactions,
        classified,
        warnings: data.warnings || [],
        status: 'COMPLETED',
        completedAt: serverTimestamp(),
      },
    }]);

    return {
      newTransactions,
      classified,
      bankAccounts: bankAccounts.length,
      transactions: bankTransactions.length,
      creditAccounts: creditAccounts.length,
      creditTransactions: creditTransactions.length,
      bills: rawBills.length,
      warnings: data.warnings || [],
    };
  };

  const openWidget = async ({ existingConnection = null, forceCredentials = false }) => {
    setError('');
    setBusyId(existingConnection?.itemId || 'new');
    setProgress({
      percent: 5,
      status: existingConnection ? 'Preparando atualização do banco...' : 'Preparando nova conexão...',
    });

    try {
      const PluggyConnect = await loadPluggyWidget();
      setProgress({
        percent: 12,
        status: 'Gerando autorização segura...',
      });

      const tokenData = await createConnectToken({
        itemId: existingConnection?.itemId || null,
        clientUserId,
      });

      const itemId = existingConnection?.itemId || null;

      try { widgetRef.current?.destroy?.(); } catch {}

      const widget = new PluggyConnect({
        connectToken: tokenData.accessToken,
        ...(itemId ? { updateItem: itemId } : {}),
        language: 'pt',
        theme: 'light',
        ...(forceCredentials ? { forceAskForCredentials: true } : {}),
        onOpen: () => {
          setProgress({
            percent: existingConnection ? 18 : 20,
            status: existingConnection
              ? 'Pluggy aberta. Atualizando a conexão...'
              : 'Pluggy aberta. Conecte seu banco...',
          });
        },
        onSuccess: async (payload) => {
          try {
            const item = payload?.item || payload;
            if (!item?.id) throw new Error('A Pluggy não retornou o itemId da conexão.');

            setProgress({
              percent: 35,
              status: 'Conexão concluída. Lendo os dados bancários...',
            });

            await saveConnectionRecord({
              id: item.id,
              connectorId: item?.connector?.id || item?.connectorId || null,
              connectorName: item?.connector?.name || item?.connectorName || existingConnection?.connectorName || 'Instituição financeira',
              clientUserId: item?.clientUserId || clientUserId || null,
              status: item?.status || 'UPDATED',
              executionStatus: item?.executionStatus || null,
              lastUpdatedAt: item?.lastUpdatedAt || null,
            });

            const connection = {
              ...(existingConnection || {}),
              itemId: item.id,
              connectorId: item?.connector?.id || item?.connectorId || existingConnection?.connectorId || null,
              connectorName: item?.connector?.name || item?.connectorName || existingConnection?.connectorName || 'Instituição financeira',
              clientUserId: item?.clientUserId || clientUserId || null,
              lastConnectedAt: existingConnection?.lastConnectedAt || new Date().toISOString(),
            };

            const data = await readItemData({
              itemId: item.id,
              clientUserId,
            });

            setProgress({
              percent: 50,
              status: 'Dados recebidos. Atualizando contas, cartões e faturas...',
            });

            const summary = await materialize(connection, data);

            setProgress({
              percent: 100,
              status: 'Sincronização concluída.',
            });

            showNotice(
              `Pluggy sincronizado: ${summary.transactions + summary.creditTransactions} movimentação(ões), ${summary.bankAccounts} conta(s), ${summary.creditAccounts} cartão(ões) e ${summary.bills} fatura(s).`
            );
          } catch (error) {
            setFailure(error.message);
          } finally {
            setBusyId('');
            widgetRef.current = null;
            window.setTimeout(() => setProgress(null), 1200);
          }
        },
        onError: (widgetError) => {
          setFailure(widgetError?.message || 'A Pluggy não conseguiu concluir a operação.');
          setBusyId('');
          widgetRef.current = null;
          setProgress(null);
        },
        onClose: () => {
          setBusyId('');
          widgetRef.current = null;
        },
      });

      widgetRef.current = widget;
      widget.init();
    } catch (error) {
      setFailure(error.message);
      setBusyId('');
      setProgress(null);
    }
  };

  const syncConnection = (connection) => {
    if (!connection?.itemId) {
      setFailure('Esta conexão não possui itemId.');
      return;
    }
    openWidget({ existingConnection: connection });
  };

  const reconnectConnection = (connection) => {
    if (!connection?.itemId) {
      setFailure('Esta conexão não possui itemId.');
      return;
    }
    openWidget({ existingConnection: connection, forceCredentials: true });
  };

  const readCurrentData = async (connection) => {
    if (!connection?.itemId) return;

    setError('');
    setBusyId(`read:${connection.itemId}`);
    setProgress({ percent: 10, status: 'Lendo os dados já coletados na Pluggy...' });

    try {
      const data = await readItemData({
        itemId: connection.itemId,
        clientUserId,
      });

      setProgress({ percent: 45, status: 'Gravando dados no ArquiManager...' });
      const summary = await materialize(connection, data);

      setProgress({ percent: 100, status: 'Dados atualizados.' });
      showNotice(
        `Dados do ${connection.connectorName || 'banco'} atualizados: ${summary.transactions + summary.creditTransactions} movimentação(ões).`
      );
      window.setTimeout(() => setProgress(null), 1200);
    } catch (error) {
      setFailure(error.message);
      setProgress(null);
    } finally {
      setBusyId('');
    }
  };

  const loadFreshScope = async (connection) => {
    const itemId = String(connection?.itemId || '');
    if (!itemId) throw new Error('itemId ausente.');

    const itemRef = refDoc(db, 'financial_connections', `${companyId}_${itemId}`);

    // A limpeza nova é dirigida pelos índices naturais da integração:
    // providerItemId identifica diretamente cada registro pertencente ao banco.
    // Não varremos coleções financeiras inteiras quando isso pode ser evitado.
    const [
      accountsSnapshot,
      cardsSnapshot,
      billsSnapshot,
      transactionsSnapshot,
      inboxSnapshot,
      purchasesSnapshot,
      syncRunsSnapshot,
      connectionSnapshot,
    ] = await Promise.all([
      getDocs(query(coll(db, 'financial_accounts'), where('providerItemId', '==', itemId))),
      getDocs(query(coll(db, 'financial_cards'), where('providerItemId', '==', itemId))),
      getDocs(query(coll(db, 'financial_bills'), where('providerItemId', '==', itemId))),
      getDocs(query(coll(db, 'financial_transactions'), where('providerItemId', '==', itemId))),
      getDocs(query(coll(db, 'financial_inbox'), where('source', '==', PLUGGY_SOURCE))),
      getDocs(query(coll(db, 'financial_purchases'), where('providerItemId', '==', itemId))),
      getDocs(query(coll(db, 'financial_sync_runs'), where('itemId', '==', itemId))),
      getDoc(itemRef),
    ]);

    const providerAccounts = accountsSnapshot.docs
      .map(item => ({ id: item.id, ...item.data() }))
      .filter(item => item.companyId === companyId);
    const providerAccountIds = new Set(
      providerAccounts.map(item => String(item.providerAccountId || '')).filter(Boolean)
    );

    // O cartão e a fatura podem carregar o providerItemId diretamente. O
    // fallback por providerAccountId cobre registros válidos criados antes
    // desse campo ter sido persistido.
    const [fallbackCardsSnapshot, fallbackBillsSnapshot] = await Promise.all([
      providerAccountIds.size
        ? getDocs(query(coll(db, 'financial_cards'), where('providerAccountId', 'in', Array.from(providerAccountIds).slice(0, 30))))
        : Promise.resolve({ docs: [] }),
      providerAccountIds.size
        ? getDocs(query(coll(db, 'financial_bills'), where('providerAccountId', 'in', Array.from(providerAccountIds).slice(0, 30))))
        : Promise.resolve({ docs: [] }),
    ]);

    const providerCards = [
      ...cardsSnapshot.docs.map(item => ({ id: item.id, ...item.data() })),
      ...fallbackCardsSnapshot.docs.map(item => ({ id: item.id, ...item.data() })),
    ]
      .filter(item => item.companyId === companyId)
      .reduce((unique, item) => unique.set(item.id, item), new Map());
    const providerCardList = Array.from(providerCards.values());
    const cardIds = new Set(providerCardList.map(item => String(item.id)));

    const providerBills = [
      ...billsSnapshot.docs.map(item => ({ id: item.id, ...item.data() })),
      ...fallbackBillsSnapshot.docs.map(item => ({ id: item.id, ...item.data() })),
    ]
      .filter(item => item.companyId === companyId)
      .reduce((unique, item) => unique.set(item.id, item), new Map());
    const providerBillList = Array.from(providerBills.values()).filter(item =>
      String(item.providerItemId || '') === itemId
      || providerAccountIds.has(String(item.providerAccountId || ''))
      || (
        cardIds.has(String(item.cardId || ''))
        && (
          item.source === PLUGGY_SOURCE
          || item.source === 'PLUGGY'
          || item.provider === 'PLUGGY'
        )
      )
    );
    const billIds = new Set(providerBillList.map(item => String(item.id)));

    const providerTransactions = transactionsSnapshot.docs
      .map(item => ({ id: item.id, ...item.data() }))
      .filter(item => item.companyId === companyId);

    const providerTransactionIds = new Set(providerTransactions.map(item => String(item.id)));

    const idGroups = (values, size = 30) => {
      const list = Array.from(values);
      const groups = [];
      for (let index = 0; index < list.length; index += size) {
        groups.push(list.slice(index, index + size));
      }
      return groups;
    };

    const inboxSnapshots = providerTransactionIds.size
      ? await Promise.all(
          idGroups(providerTransactionIds).map(ids =>
            getDocs(query(coll(db, 'financial_inbox'), where('transactionId', 'in', ids)))
          )
        )
      : [];

    const providerInbox = inboxSnapshots
      .flatMap(snapshot => snapshot.docs.map(item => ({ id: item.id, ...item.data() })))
      .filter(item =>
        item.companyId === companyId
        && item.source === PLUGGY_SOURCE
        && providerTransactionIds.has(String(item.transactionId || ''))
      )
      .reduce((unique, item) => unique.set(item.id, item), new Map());

    const transactionIdList = Array.from(providerTransactionIds);
    const outgoingSnapshots = transactionIdList.length
      ? await Promise.all(
          idGroups(transactionIdList).map(ids =>
            getDocs(query(coll(db, 'financial_transfers'), where('outgoingTransactionId', 'in', ids)))
          )
        )
      : [];
    const incomingSnapshots = transactionIdList.length
      ? await Promise.all(
          idGroups(transactionIdList).map(ids =>
            getDocs(query(coll(db, 'financial_transfers'), where('incomingTransactionId', 'in', ids)))
          )
        )
      : [];

    const providerTransfers = [
      ...outgoingSnapshots.flatMap(snapshot => snapshot.docs.map(item => ({ id: item.id, ...item.data() }))),
      ...incomingSnapshots.flatMap(snapshot => snapshot.docs.map(item => ({ id: item.id, ...item.data() }))),
    ]
      .filter(item =>
        item.companyId === companyId
        && item.source === 'AUTO_RECONCILIATION'
      )
      .reduce((unique, item) => unique.set(item.id, item), new Map());

    const providerInboxList = Array.from(providerInbox.values());
    const providerTransfersList = Array.from(providerTransfers.values());

    // O restante da limpeza trabalha apenas com registros já associados
    // ao itemId escolhido. Não fazemos leitura global de Atenção/transferências.
    const providerConnections = connectionSnapshot.exists()
      ? [{ id: connectionSnapshot.id, ...connectionSnapshot.data() }]
      : [];

    const purchases = purchasesSnapshot.docs
      .map(item => ({ id: item.id, ...item.data() }))
      .filter(item => item.companyId === companyId);
    const purchaseIds = new Set(purchases.map(item => String(item.id)));

    const installments = purchaseIds.size
      ? (await Promise.all(
          Array.from(purchaseIds).reduce((groups, id, index) => {
            const groupIndex = Math.floor(index / 30);
            groups[groupIndex] ||= [];
            groups[groupIndex].push(id);
            return groups;
          }, []).map(ids =>
            getDocs(query(coll(db, 'financial_installments'), where('purchaseId', 'in', ids)))
          )
        )).flatMap(snapshot =>
          snapshot.docs.map(item => ({ id: item.id, ...item.data() }))
        ).filter(item => item.companyId === companyId)
      : [];

    const syncRuns = syncRunsSnapshot.docs
      .map(item => ({ id: item.id, ...item.data() }))
      .filter(item => item.companyId === companyId && String(item.itemId || '') === itemId);

    const finalTransactions = providerTransactions
      .filter(item => item.companyId === companyId);

    return {
      itemId,
      providerAccounts,
      providerCards: providerCardList,
      providerBills: providerBillList,
      providerTransactions: finalTransactions,
      providerInbox: providerInboxList,
      providerTransfers: providerTransfersList,
      providerConnections,
      purchases,
      installments,
      syncRuns,
    };
  };

  const clearLocalData = async (scope) => {
    const transactionIds = new Set(scope.providerTransactions.map(tx => String(tx.id)));

    const payableChanges = [];
    const receivableChanges = [];
    const billChanges = [];

    for (const tx of scope.providerTransactions) {
      const amount = Math.abs(Number(tx.amountCents || 0));
      if (!amount) continue;

      if (
        tx.reconciliationType === 'PAYABLE_PAYMENT'
        && tx.payableId
      ) {
        payableChanges.push({
          collection: 'financial_payables',
          id: tx.payableId,
          type: 'update',
          data: {
            paidCents: 0,
            status: 'OPEN',
            paymentTransactionId: null,
            actualDate: null,
            updatedAt: serverTimestamp(),
          },
        });
      }

      if (
        tx.reconciliationType === 'RECEIVABLE_RECEIPT'
        && tx.receivableId
      ) {
        receivableChanges.push({
          collection: 'financial_receivables',
          id: tx.receivableId,
          type: 'update',
          data: {
            receivedCents: 0,
            status: 'OPEN',
            receiptTransactionId: null,
            actualDate: null,
            updatedAt: serverTimestamp(),
          },
        });
      }

      if (
        tx.reconciliationType === 'CARD_BILL_PAYMENT'
        && tx.billId
      ) {
        billChanges.push({
          collection: 'financial_bills',
          id: tx.billId,
          type: 'update',
          data: {
            paidCents: 0,
            status: 'OPEN',
            lastPaymentTransactionId: null,
            lastPaidAt: null,
            updatedAt: serverTimestamp(),
          },
        });
      }
    }

    await batchWrite(db, [
      ...payableChanges,
      ...receivableChanges,
      ...billChanges,
    ]);

    const deleteOps = [
      ...scope.providerTransfers.map(item => ({
        collection: 'financial_transfers',
        id: item.id,
        type: 'delete',
      })),
      ...scope.providerTransactions.map(item => ({
        collection: 'financial_transactions',
        id: item.id,
        type: 'delete',
      })),
      ...scope.providerBills.map(item => ({
        collection: 'financial_bills',
        id: item.id,
        type: 'delete',
      })),
      ...scope.installments.map(item => ({
        collection: 'financial_installments',
        id: item.id,
        type: 'delete',
      })),
      ...scope.purchases.map(item => ({
        collection: 'financial_purchases',
        id: item.id,
        type: 'delete',
      })),
      ...scope.providerInbox.map(item => ({
        collection: 'financial_inbox',
        id: item.id,
        type: 'delete',
      })),
      ...scope.providerCards.map(item => ({
        collection: 'financial_cards',
        id: item.id,
        type: 'delete',
      })),
      ...scope.providerAccounts.map(item => ({
        collection: 'financial_accounts',
        id: item.id,
        type: 'delete',
      })),
      ...scope.providerConnections.map(item => ({
        collection: 'financial_connections',
        id: item.id,
        type: 'delete',
      })),
      ...(scope.syncRuns || []).map(item => ({
        collection: 'financial_sync_runs',
        id: item.id,
        type: 'delete',
      })),
    ];

    await batchWrite(db, deleteOps);
    return {
      transactions: scope.providerTransactions.length,
      bills: scope.providerBills.length,
      cards: scope.providerCards.length,
      accounts: scope.providerAccounts.length,
      inbox: scope.providerInbox.length,
      purchases: scope.purchases.length,
      syncRuns: (scope.syncRuns || []).length,
    };
  };

  const clearConnection = async (connection, revokeRemote = false) => {
    if (!connection?.itemId) return;

    setError('');
    setBusyId(`clear:${connection.itemId}`);
    setProgress({ percent: 5, status: 'Lendo o estado atual do banco...' });

    try {
      const scope = await loadFreshScope(connection);

      if (
        !scope.providerTransactions.length
        && !scope.providerAccounts.length
        && !scope.providerCards.length
        && !scope.providerBills.length
        && !scope.providerInbox.length
        && !scope.providerTransfers.length
      ) {
        showNotice(`Não existem dados sincronizados para ${connection.connectorName || 'este banco'}.`);
        return;
      }

      setProgress({
        percent: 25,
        status: 'Removendo somente os dados deste banco...',
      });

      const summary = await clearLocalData(scope);

      if (revokeRemote) {
        setProgress({
          percent: 78,
          status: 'Revogando a autorização no Pluggy...',
        });

        await revokeItem({
          itemId: connection.itemId,
          clientUserId,
        });
      }

      setProgress({
        percent: 100,
        status: revokeRemote
          ? 'Conexão excluída.'
          : 'Dados sincronizados removidos.',
      });

      showNotice(
        revokeRemote
          ? `Conexão ${connection.connectorName || 'bancária'} removida do ArquiManager e revogada na Pluggy.`
          : `Dados de ${connection.connectorName || 'este banco'} removidos: ${summary.transactions} lançamento(s), ${summary.bills} fatura(s), ${summary.cards} cartão(ões) e ${summary.accounts} conta(s).`
      );

      window.setTimeout(() => setProgress(null), 1200);
    } catch (error) {
      setFailure(
        error.message
          || (revokeRemote
            ? 'Não foi possível excluir a conexão.'
            : 'Não foi possível limpar os dados sincronizados.')
      );
      setProgress(null);
    } finally {
      setBusyId('');
      setSelectedForClear(null);
      setSelectedForDelete(null);
    }
  };

  const totalConnections = useMemo(() => connections.length, [connections]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <h4 className="font-black text-xl text-slate-800">Conexões bancárias</h4>
          <p className="text-xs text-slate-400 mt-1">
            Integração Pluggy reconstruída: cada Item é uma conexão independente e o ArquiManager usa o itemId como referência.
          </p>
        </div>
        <button
          onClick={() => openWidget({})}
          disabled={busyId !== ''}
          className="bg-[#1e5aa0] text-white px-4 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 disabled:opacity-50"
        >
          <Link2 size={16}/>
          {busyId === 'new' ? 'Abrindo...' : 'Conectar banco'}
        </button>
      </div>

      {progress && (
        <div className="p-4 rounded-2xl bg-blue-50 border border-blue-100">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black text-blue-900">{progress.status}</p>
              <p className="text-[10px] text-blue-600 mt-1">Operação Pluggy em andamento</p>
            </div>
            <span className="text-lg font-black text-blue-800">{Math.round(progress.percent)}%</span>
          </div>
          <div className="mt-3 h-2.5 rounded-full bg-white overflow-hidden border border-blue-100">
            <div className="h-full rounded-full bg-[#1e5aa0] transition-all duration-300" style={{ width: `${Math.max(0, Math.min(100, progress.percent))}%` }}/>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-100 text-red-700 text-xs font-bold">
          <AlertTriangle size={17} className="shrink-0 mt-0.5"/>
          <span>{error}</span>
        </div>
      )}

      {!totalConnections ? (
        <div className="p-8 border border-dashed border-slate-200 rounded-2xl bg-slate-50 text-center">
          <Landmark size={30} className="mx-auto text-slate-300 mb-3"/>
          <p className="font-black text-slate-600">Nenhum banco conectado</p>
          <p className="text-xs text-slate-400 mt-1">Conecte cada banco uma única vez. O itemId fica salvo no ArquiManager.</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          {connections.map(connection => {
            const isBusy = busyId === connection.itemId
              || busyId === `read:${connection.itemId}`
              || busyId === `clear:${connection.itemId}`;

            return (
              <div key={connection.id || connection.itemId} className="border border-slate-200 rounded-2xl p-4 bg-white shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="p-2 rounded-xl bg-blue-50 text-[#1e5aa0]"><Landmark size={18}/></div>
                    <div className="min-w-0">
                      <p className="font-black text-slate-800 truncate">{connection.connectorName || 'Instituição financeira'}</p>
                      <p className="text-[10px] text-slate-400 truncate">{connection.itemId}</p>
                    </div>
                  </div>
                  <span className="text-[9px] font-black uppercase px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700">
                    {connection.status || 'conectado'}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    onClick={() => syncConnection(connection)}
                    disabled={busyId !== ''}
                    className="px-3 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-black flex items-center justify-center gap-1 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <RefreshCw size={14} className={busyId === connection.itemId ? 'animate-spin' : ''}/>
                    Atualizar banco
                  </button>
                  <button
                    onClick={() => readCurrentData(connection)}
                    disabled={busyId !== ''}
                    className="px-3 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-black flex items-center justify-center gap-1 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <CheckCircle2 size={14}/>
                    Ler dados
                  </button>
                  <button
                    onClick={() => reconnectConnection(connection)}
                    disabled={busyId !== ''}
                    className="px-3 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-black flex items-center justify-center gap-1 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <Link2 size={14}/>
                    Reautenticar
                  </button>
                  <button
                    onClick={() => setSelectedForClear(connection)}
                    disabled={busyId !== ''}
                    className="px-3 py-2 rounded-xl border border-amber-200 text-amber-700 text-xs font-black flex items-center justify-center gap-1 hover:bg-amber-50 disabled:opacity-50"
                  >
                    <Trash2 size={14}/>
                    Limpar dados
                  </button>
                  <button
                    onClick={() => setSelectedForDelete(connection)}
                    disabled={busyId !== ''}
                    className="col-span-2 px-3 py-2 rounded-xl border border-red-200 text-red-600 text-xs font-black flex items-center justify-center gap-1 hover:bg-red-50 disabled:opacity-50"
                  >
                    <XCircle size={14}/>
                    Excluir conexão e revogar
                  </button>
                </div>

                <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2 text-[10px] text-slate-400 font-medium">
                  <ShieldCheck size={13} className="text-emerald-500"/>
                  Credenciais tratadas exclusivamente pelo Pluggy Connect
                </div>

                {selectedForClear?.itemId === connection.itemId && (
                  <div className="mt-3 p-3 rounded-xl bg-amber-50 border border-amber-200">
                    <p className="text-xs font-black text-amber-900">Limpar somente os dados sincronizados deste banco?</p>
                    <p className="text-[10px] text-amber-700 mt-1">A conexão com o banco continuará autorizada na Pluggy.</p>
                    <div className="mt-3 flex gap-2 justify-end">
                      <button
                        onClick={() => setSelectedForClear(null)}
                        disabled={isBusy}
                        className="px-3 py-2 rounded-lg border border-slate-200 text-[10px] font-black bg-white"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={() => clearConnection(connection, false)}
                        disabled={isBusy}
                        className="px-3 py-2 rounded-lg bg-amber-600 text-white text-[10px] font-black"
                      >
                        {isBusy ? 'Limpando...' : 'Sim, limpar'}
                      </button>
                    </div>
                  </div>
                )}

                {selectedForDelete?.itemId === connection.itemId && (
                  <div className="mt-3 p-3 rounded-xl bg-red-50 border border-red-200">
                    <p className="text-xs font-black text-red-900">Excluir a conexão inteira?</p>
                    <p className="text-[10px] text-red-700 mt-1">Isso limpa os dados locais e revoga o Item na Pluggy.</p>
                    <div className="mt-3 flex gap-2 justify-end">
                      <button
                        onClick={() => setSelectedForDelete(null)}
                        disabled={isBusy}
                        className="px-3 py-2 rounded-lg border border-slate-200 text-[10px] font-black bg-white"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={() => clearConnection(connection, true)}
                        disabled={isBusy}
                        className="px-3 py-2 rounded-lg bg-red-600 text-white text-[10px] font-black"
                      >
                        {isBusy ? 'Excluindo...' : 'Sim, excluir'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}