const monthOf = (value) => String(value || '').slice(0, 7);

const dateOnly = (value) => {
  if (!value) return '';
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return text.slice(0, 10);
  return [
    parsed.getFullYear(),
    String(parsed.getMonth() + 1).padStart(2, '0'),
    String(parsed.getDate()).padStart(2, '0'),
  ].join('-');
};

const addMonths = (yearMonth, amount) => {
  const [year, month] = String(yearMonth || '').split('-').map(Number);
  if (!year || !month) return '';
  const date = new Date(year, month - 1 + Number(amount || 0), 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const dateForMonthDay = (yearMonth, day) => {
  const [year, month] = String(yearMonth || '').split('-').map(Number);
  if (!year || !month) return '';
  const safeDay = Math.min(Math.max(1, Number(day || 1)), new Date(year, month, 0).getDate());
  return `${year}-${String(month).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
};

const datesForCycle = (referenceMonth, card) => {
  const closingDay = Math.min(31, Math.max(1, Number(card?.closingDay || 1)));
  const dueDay = Math.min(31, Math.max(1, Number(card?.dueDay || 10)));
  const closingDate = dateForMonthDay(referenceMonth, closingDay);
  const dueMonth = dueDay > closingDay ? referenceMonth : addMonths(referenceMonth, 1);
  return {
    closingDate,
    dueDate: dateForMonthDay(dueMonth, dueDay),
  };
};

const hash = (value = '') => {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
};

const billIsOfficial = (bill = {}) => Boolean(
  bill.providerBillId
  || bill.officialTotalCents != null
  || (bill.provisional === false && (bill.source === 'PLUGGY_REBUILT' || bill.provider === 'PLUGGY'))
);

const billIdForCycle = ({ companyId, card, referenceMonth, bills }) => {
  const matching = bills.filter(bill =>
    bill.cardId === card.id && monthOf(bill.referenceMonth) === referenceMonth
  );
  const official = matching.find(bill => billIsOfficial(bill));
  if (official) return official.id;

  const managed = matching.find(bill => bill.forecastManaged === true);
  if (managed) return managed.id;

  if (card.providerItemId || card.provider === 'PLUGGY' || card.source === 'PLUGGY') {
    return `${companyId}_pluggy_v2_bill_${card.id}_${referenceMonth}`;
  }

  const manual = matching.find(bill => bill.source === 'MANUAL');
  if (manual) return manual.id;
  return `${companyId}_${card.id}_${referenceMonth}`;
};

const forecastTotal = (items = []) => items.reduce(
  (sum, item) => item?.excluded === true ? sum : sum + Number(item?.amountCents || 0),
  0
);

const shiftDateByMonths = (value, months = 0) => {
  const iso = dateOnly(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return '';
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const targetFirst = new Date(year, month - 1 + Number(months || 0), 1);
  const lastDay = new Date(targetFirst.getFullYear(), targetFirst.getMonth() + 1, 0).getDate();
  const targetMonth = String(targetFirst.getFullYear()) + '-' + String(targetFirst.getMonth() + 1).padStart(2, '0');
  return dateForMonthDay(targetMonth, Math.min(day, lastDay));
};

const normalizeInstallmentDescription = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/\b(?:parcela|parc\.?|prestacao|installment)\s*#?\s*\d{1,2}\s*[/-]\s*\d{1,2}\b/g, ' ')
  .replace(/\b\d{1,2}\s*[/-]\s*\d{1,2}\b/g, ' ')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()
  .replace(/\s+/g, ' ');

const isPluggyTransaction = (transaction = {}) => (
  String(transaction.provider || '').toUpperCase() === 'PLUGGY'
  || String(transaction.source || '').toUpperCase().startsWith('PLUGGY')
  || Boolean(transaction.providerTransactionId)
  || String(transaction.externalId || '').startsWith('pluggy-v2:')
);

const descriptionsMatch = (forecastItem, transaction) => {
  const projected = new Set(
    [forecastItem.description, forecastItem.merchant]
      .map(normalizeInstallmentDescription)
      .filter(value => value.length >= 3)
  );
  if (!projected.size) return false;
  return [transaction.description, transaction.merchant, transaction.normalizedMerchant]
    .map(normalizeInstallmentDescription)
    .some(value => value.length >= 3 && projected.has(value));
};

const matchesOfficialInstallmentDetails = ({ item, cardId, transaction }) => {
  if (!item?.expectedTransactionDate || !Number(item.installmentNumber) || !Number(item.totalInstallments)) return false;
  const expectedDate = dateOnly(item.expectedTransactionDate);
  if (!expectedDate) return false;

  return (
    isPluggyTransaction(transaction)
    && String(transaction.cardId || '') === String(cardId || '')
    && Number(transaction.creditCardInstallmentNumber || 0) === Number(item.installmentNumber)
    && Number(transaction.creditCardTotalInstallments || 0) === Number(item.totalInstallments)
    && dateOnly(transaction.date) === expectedDate
    && descriptionsMatch(item, transaction)
  );
};

const matchesOfficialInstallment = ({ item, cardId, transaction, transactions = [] }) => {
  const candidates = transaction ? [transaction] : transactions;
  return candidates.some(candidate => (
    matchesOfficialInstallmentDetails({ item, cardId, transaction: candidate })
    && Math.abs(Number(candidate.amountCents || 0)) === Math.abs(Number(item.amountCents || 0))
  ));
};

/**
 * Rebuilds the forward-looking installment plan without replacing official
 * bill fields. Forecast lines live on the bill document, separately from the
 * transactions actually imported from the bank.
 */
export const buildInstallmentForecastWrites = ({
  companyId,
  cards = [],
  transactions = [],
  bills = [],
}) => {
  const cardsById = new Map(cards.map(card => [card.id, card]));
  const billsById = new Map(bills.map(bill => [bill.id, bill]));
  const groups = new Map();

  const ensureGroup = ({ billId, card, referenceMonth }) => {
    const key = billId;
    if (!groups.has(key)) {
      groups.set(key, {
        billId,
        card,
        referenceMonth,
        generatedItems: [],
      });
    }
    return groups.get(key);
  };

  const plans = transactions.filter(transaction => {
    const card = cardsById.get(transaction.cardId);
    const paymentType = String(transaction.creditCardPaymentType || '').toUpperCase();
    const current = Number(transaction.creditCardInstallmentNumber || 0);
    const total = Number(transaction.creditCardTotalInstallments || 0);
    return Boolean(
      card
      && (transaction.accountType === 'CREDIT_CARD' || transaction.isCreditCardTransaction || transaction.cardId)
      && paymentType === 'INSTALLMENT'
      && current >= 1
      && total > current
      && total <= 48
    );
  }).sort((a, b) => (
    Number(a.creditCardInstallmentNumber || 0) - Number(b.creditCardInstallmentNumber || 0)
    || String(a.date || '').localeCompare(String(b.date || ''))
  ));

  const planIdentityFor = (transaction) => {
    const card = cardsById.get(transaction.cardId);
    const current = Number(transaction.creditCardInstallmentNumber || 0);
    const total = Number(transaction.creditCardTotalInstallments || 0);
    const rawPurchaseDate = transaction.providerRawData?.creditCardMetadata?.purchaseDate;
    const storedPurchaseDate = transaction.creditCardPurchaseDate;
    const explicitPurchaseDate = rawPurchaseDate
      || (transaction.creditCardPlanConfiguredManually === true ? storedPurchaseDate : '')
      || (storedPurchaseDate && dateOnly(storedPurchaseDate) !== dateOnly(transaction.date) ? storedPurchaseDate : '');
    const purchaseDate = dateOnly(explicitPurchaseDate)
      || shiftDateByMonths(transaction.date, -(current - 1))
      || dateOnly(storedPurchaseDate)
      || dateOnly(transaction.date);
    const purchaseDescription = normalizeInstallmentDescription(
      transaction.creditCardForecastMerchant
        || transaction.merchant
        || transaction.creditCardForecastDescription
        || transaction.description
    );
    return [card?.id || transaction.cardId, purchaseDescription, purchaseDate, total].join('|');
  };

  const sourceIdsByPlanIdentity = new Map();
  plans.forEach(transaction => {
    const identity = planIdentityFor(transaction);
    if (!sourceIdsByPlanIdentity.has(identity)) sourceIdsByPlanIdentity.set(identity, new Set());
    sourceIdsByPlanIdentity.get(identity).add(String(transaction.id));
  });

  for (const transaction of plans) {
    const card = cardsById.get(transaction.cardId);
    const currentNumber = Number(transaction.creditCardInstallmentNumber);
    const totalInstallments = Number(transaction.creditCardTotalInstallments);
    const planVersion = Number(transaction.creditCardForecastPlanVersion || 0);
    const planIdentity = planIdentityFor(transaction);
    const planSourceIds = sourceIdsByPlanIdentity.get(planIdentity) || new Set();
    const currentMonth = currentMonthForTransaction(transaction, card, bills);
    if (!currentMonth) continue;

    const perInstallmentCents = Math.abs(Number(
      transaction.creditCardForecastAmountCents ?? transaction.amountCents ?? 0
    ));
    if (!perInstallmentCents) continue;

    const currentTransactionDate = dateOnly(transaction.date)
      || shiftDateByMonths(
        transaction.creditCardPurchaseDate
          || transaction.providerRawData?.creditCardMetadata?.purchaseDate,
        currentNumber - 1
      );

    for (let offset = 1; offset <= totalInstallments - currentNumber; offset += 1) {
      const installmentNumber = currentNumber + offset;
      const referenceMonth = addMonths(currentMonth, offset);
      const billId = billIdForCycle({ companyId, card, referenceMonth, bills });
      const previousBill = billsById.get(billId);
      const canonicalItemId = `installment_${hash(`${planIdentity}|${installmentNumber}`)}`;
      const previousItem = (previousBill?.forecastItems || []).find(item => (
        item.id === canonicalItemId
        || (
          item.kind === 'INSTALLMENT_FORECAST'
          && Number(item.installmentNumber || 0) === installmentNumber
          && Number(item.totalInstallments || 0) === totalInstallments
          && (
            item.planIdentity === planIdentity
            || planSourceIds.has(String(item.sourceTransactionId || ''))
          )
        )
      ));
      if (
        previousItem?.excluded === true
        && Number(previousItem.planVersion || 0) === planVersion
      ) continue;
      const fallbackDates = datesForCycle(referenceMonth, card);
      const defaultItem = {
        id: previousItem?.id || canonicalItemId,
        kind: 'INSTALLMENT_FORECAST',
        sourceTransactionId: transaction.id,
        planIdentity,
        installmentNumber,
        totalInstallments,
        planVersion,
        description: transaction.creditCardForecastDescription || transaction.description || transaction.merchant || 'Compra parcelada',
        merchant: transaction.creditCardForecastMerchant || transaction.merchant || transaction.description || 'Compra parcelada',
        amountCents: perInstallmentCents,
        categoryId: transaction.categoryId || null,
        projectId: transaction.projectId || null,
      };
      const item = previousItem && Number(previousItem.planVersion || 0) === planVersion
        ? {
            ...defaultItem,
            ...previousItem,
            // Valores corrigidos manualmente permanecem até a correspondência
            // exata com a transação oficial ou até mudar o plano da compra.
            description: previousItem.manualOverride ? previousItem.description : defaultItem.description,
            merchant: previousItem.manualOverride ? previousItem.merchant : defaultItem.merchant,
            amountCents: previousItem.manualOverride ? Number(previousItem.amountCents || 0) : defaultItem.amountCents,
          }
        : defaultItem;

      const expectedTransactionDate = shiftDateByMonths(currentTransactionDate, offset)
        || previousItem?.expectedTransactionDate
        || '';
      const candidate = { ...item, planIdentity, expectedTransactionDate };
      const group = ensureGroup({ billId, card, referenceMonth });
      // Uma compra pode ter várias parcelas históricas importadas. Se a parcela
      // oficial já existe e coincide em todos os campos, retirar qualquer
      // projeção gerada anteriormente para a mesma compra/parcela.
      if (matchesOfficialInstallment({ item: candidate, cardId: card.id, transactions })) {
        group.generatedItems = group.generatedItems.filter(existingItem => !(
          existingItem.planIdentity === planIdentity
          && Number(existingItem.installmentNumber || 0) === installmentNumber
          && Number(existingItem.totalInstallments || 0) === totalInstallments
        ));
        continue;
      }

      const generatedIndex = group.generatedItems.findIndex(existingItem => (
        existingItem.planIdentity === planIdentity
        && Number(existingItem.installmentNumber || 0) === installmentNumber
        && Number(existingItem.totalInstallments || 0) === totalInstallments
      ));
      const generatedItem = {
        ...candidate,
        sourceTransactionId: transaction.id,
        dueDate: fallbackDates.dueDate,
      };
      // Como os planos estão ordenados pelo número de parcela, a fonte mais
      // recente substitui a mais antiga sem produzir linhas duplicadas.
      if (generatedIndex >= 0) group.generatedItems[generatedIndex] = generatedItem;
      else group.generatedItems.push(generatedItem);
    }
  }

  // Existing managed forecast bills must be updated too, so switching a
  // transaction to "à vista" or changing the installment count removes stale
  // projected installments but keeps separately-entered adjustment lines.
  for (const bill of bills.filter(item => item.forecastManaged === true)) {
    const card = cardsById.get(bill.cardId);
    if (!card) continue;
    if (!groups.has(bill.id)) {
      groups.set(bill.id, {
        billId: bill.id,
        card,
        referenceMonth: monthOf(bill.referenceMonth),
        generatedItems: [],
      });
    }
  }

  const registeredTotalsByBillId = new Map();
  for (const transaction of transactions) {
    const card = cardsById.get(transaction.cardId);
    if (!card || transaction.reconciliationType === 'CARD_BILL_PAYMENT') continue;

    let targetBillId = transaction.billId && billsById.has(transaction.billId)
      ? transaction.billId
      : '';
    if (!targetBillId) {
      const referenceMonth = currentMonthForTransaction(transaction, card, bills);
      if (!referenceMonth) continue;
      targetBillId = billIdForCycle({ companyId, card, referenceMonth, bills });
    }

    const generatedForBill = groups.get(targetBillId)?.generatedItems || [];
    const amount = Math.abs(Number(transaction.amountCents || 0));
    // If a provider row matches every identifier except amount, its still-open
    // forecast is the placeholder estimate. Do not count both in the invoice
    // total; once the amount is corrected, the forecast disappears and the
    // official transaction becomes part of the registered total.
    const hasUnresolvedForecastForTransaction = isPluggyTransaction(transaction)
      && generatedForBill.some(item => (
        matchesOfficialInstallmentDetails({ item, cardId: card.id, transaction })
        && Math.abs(Number(item.amountCents || 0)) !== amount
      ));
    if (hasUnresolvedForecastForTransaction) continue;

    const signedAmount = String(transaction.type || '').toUpperCase() === 'INCOME' ? -amount : amount;
    registeredTotalsByBillId.set(
      targetBillId,
      Number(registeredTotalsByBillId.get(targetBillId) || 0) + signedAmount
    );
  }

  const writes = [];
  for (const group of groups.values()) {
    const existing = billsById.get(group.billId) || {};
    const generatedIds = new Set(group.generatedItems.map(item => item.id));
    const manualItems = (existing.forecastItems || []).filter(item =>
      item.kind !== 'INSTALLMENT_FORECAST'
      || (item.excluded === true && !generatedIds.has(item.id))
    );
    const forecastItems = [
      ...group.generatedItems,
      ...manualItems,
    ];
    const totalCents = forecastTotal(forecastItems);
    const official = billIsOfficial(existing);
    const defaultDates = datesForCycle(group.referenceMonth, group.card);
    const forecastDueDate = existing.forecastDueDateCustom && existing.forecastDueDate
      ? dateOnly(existing.forecastDueDate)
      : defaultDates.dueDate;
    const forecastClosingDate = existing.forecastClosingDateCustom && existing.forecastClosingDate
      ? dateOnly(existing.forecastClosingDate)
      : defaultDates.closingDate;

    if (!forecastItems.length && !official && existing.source === 'ARQUIMANAGER_FORECAST') {
      writes.push({ id: group.billId, delete: true });
      continue;
    }

    const data = {
      companyId,
      cardId: group.card.id,
      referenceMonth: group.referenceMonth,
      forecastManaged: true,
      forecastItems,
      forecastTotalCents: totalCents,
      registeredTransactionsTotalCents: Number(registeredTotalsByBillId.get(group.billId) || 0),
      forecastDueDate,
      forecastClosingDate,
      forecastProviderItemId: group.card.providerItemId || null,
      updatedAt: null,
    };

    if (!official) {
      data.source = existing.source || 'ARQUIMANAGER_FORECAST';
      data.provisional = true;
      data.totalCents = totalCents;
      data.paidCents = Number(existing.paidCents || 0);
      data.closingDate = forecastClosingDate;
      data.dueDate = forecastDueDate;
      data.status = Number(existing.paidCents || 0) >= totalCents && totalCents > 0
        ? 'PAID'
        : 'OPEN';
      if (group.card.providerItemId) data.providerItemId = group.card.providerItemId;
      if (group.card.provider) data.provider = group.card.provider;
    }

    writes.push({ id: group.billId, data });
  }

  return writes;
};

export const getBillReconciliationDecision = (bill = {}) => {
  if (!billIsOfficial(bill) || bill.forecastManaged !== true || bill.forecastTotalCents == null) {
    return null;
  }

  const officialTotalCents = Number(bill.officialTotalCents ?? bill.totalCents ?? 0);
  const expectedTotalCents = Number(bill.forecastTotalCents || 0)
    + Number(bill.registeredTransactionsTotalCents || 0);
  const officialDueDate = dateOnly(bill.officialDueDate || bill.dueDate);
  const expectedDueDate = dateOnly(bill.forecastDueDate || bill.dueDate);
  const valuesMatch = officialTotalCents === expectedTotalCents;
  const datesMatch = Boolean(officialDueDate && expectedDueDate && officialDueDate === expectedDueDate);

  const manuallyConfirmedCurrent =
    bill.reconciliationStatus === 'MATCHED_MANUAL'
    && Number(bill.reconciledAgainstOfficialTotalCents) === officialTotalCents
    && dateOnly(bill.reconciledAgainstOfficialDueDate) === officialDueDate
    && Number(bill.reconciledAgainstForecastTotalCents) === expectedTotalCents
    && dateOnly(bill.reconciledAgainstForecastDueDate) === expectedDueDate;

  if (manuallyConfirmedCurrent) {
    return {
      status: 'MATCHED_MANUAL',
      officialTotalCents,
      expectedTotalCents,
      officialDueDate,
      expectedDueDate,
      valuesMatch,
      datesMatch,
    };
  }

  const forecastEditedAt = Date.parse(bill.forecastEditedAt || '') || 0;
  const officialSyncedAt = Date.parse(bill.officialSyncedAt || '') || 0;
  const waitingForManualConfirmation =
    bill.forecastManualReviewRequired === true
    && forecastEditedAt > officialSyncedAt;

  const status = valuesMatch && datesMatch
    ? (waitingForManualConfirmation ? 'READY_FOR_MANUAL' : 'MATCHED_AUTO')
    : 'NEEDS_REVIEW';

  return {
    status,
    officialTotalCents,
    expectedTotalCents,
    officialDueDate,
    expectedDueDate,
    valuesMatch,
    datesMatch,
  };
};

export const reconciliationSignature = (bills = []) => JSON.stringify(
  bills
    .map(bill => {
      const decision = getBillReconciliationDecision(bill);
      if (!decision) return null;
      return [
        bill.id,
        decision.officialTotalCents,
        decision.expectedTotalCents,
        Number(bill.registeredTransactionsTotalCents || 0),
        decision.officialDueDate,
        decision.expectedDueDate,
        bill.forecastEditedAt || '',
        bill.officialSyncedAt || '',
        bill.reconciliationStatus || '',
        bill.reconciledAgainstOfficialTotalCents ?? '',
        bill.reconciledAgainstOfficialDueDate || '',
        bill.reconciledAgainstForecastTotalCents ?? '',
        bill.reconciledAgainstForecastDueDate || '',
      ];
    })
    .filter(Boolean)
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
);
