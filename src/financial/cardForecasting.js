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

const currentMonthForTransaction = (transaction, card, bills) => {
  // A user-maintained anchor is explicit and can override provider heuristics.
  const manualAnchor = dateOnly(transaction.creditCardForecastAnchorDate || '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(manualAnchor)) return monthOf(manualAnchor);

  const linkedBill = transaction.billId
    ? bills.find(bill => bill.id === transaction.billId)
    : null;
  if (linkedBill?.referenceMonth) return monthOf(linkedBill.referenceMonth);

  // Pluggy's Open Finance billForecastDate is already the intended cycle,
  // formatted as YYYY-MM. Do not apply the closing-day rule to this value.
  const explicitForecastMonth = String(
    transaction.creditCardBillForecastDate
    || transaction.providerRawData?.creditCardMetadata?.billForecastDate
    || ''
  ).slice(0, 7);
  if (/^\d{4}-\d{2}$/.test(explicitForecastMonth)) return explicitForecastMonth;

  // billPostDate is the institution's actual posting date for the cycle.
  // Its month is already authoritative; don't shift it based on closing day.
  const billPostDate = dateOnly(
    transaction.creditCardBillPostDate
    || transaction.providerRawData?.creditCardMetadata?.billPostDate
    || ''
  );
  if (/^\d{4}-\d{2}-\d{2}$/.test(billPostDate)) return monthOf(billPostDate);

  const transactionDate = dateOnly(transaction.date);
  if (transactionDate) {
    const month = monthOf(transactionDate);
    const day = Number(transactionDate.slice(8, 10));
    // When no bill/forecast/posting date exists, approximate the current cycle
    // from the observed transaction date and card closing day.
    if (day && day > Number(card?.closingDay || 1)) return addMonths(month, 1);
    return month;
  }

  return monthOf(dateOnly(
    transaction.creditCardPurchaseDate
    || transaction.providerRawData?.creditCardMetadata?.purchaseDate
    || ''
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
  });

  for (const transaction of plans) {
    const card = cardsById.get(transaction.cardId);
    const currentNumber = Number(transaction.creditCardInstallmentNumber);
    const totalInstallments = Number(transaction.creditCardTotalInstallments);
    const planVersion = Number(transaction.creditCardForecastPlanVersion || 0);
    const currentMonth = currentMonthForTransaction(transaction, card, bills);
    if (!currentMonth) continue;

    const perInstallmentCents = Math.abs(Number(
      transaction.creditCardForecastAmountCents ?? transaction.amountCents ?? 0
    ));
    if (!perInstallmentCents) continue;

    for (let offset = 1; offset <= totalInstallments - currentNumber; offset += 1) {
      const installmentNumber = currentNumber + offset;
      const referenceMonth = addMonths(currentMonth, offset);
      const billId = billIdForCycle({ companyId, card, referenceMonth, bills });
      const previousBill = billsById.get(billId);
      const previousItem = (previousBill?.forecastItems || []).find(item =>
        item.id === `installment_${hash(`${transaction.id}|${installmentNumber}`)}`
      );
      if (
        previousItem?.excluded === true
        && Number(previousItem.planVersion || 0) === planVersion
      ) continue;
      const fallbackDates = datesForCycle(referenceMonth, card);
      const defaultItem = {
        id: `installment_${hash(`${transaction.id}|${installmentNumber}`)}`,
        kind: 'INSTALLMENT_FORECAST',
        sourceTransactionId: transaction.id,
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
            // Values edited inside an individual forecast invoice remain in
            // place until the source installment plan itself is changed.
            description: previousItem.manualOverride ? previousItem.description : defaultItem.description,
            merchant: previousItem.manualOverride ? previousItem.merchant : defaultItem.merchant,
            amountCents: previousItem.manualOverride ? Number(previousItem.amountCents || 0) : defaultItem.amountCents,
          }
        : defaultItem;

      const group = ensureGroup({ billId, card, referenceMonth });
      group.generatedItems.push({
        ...item,
        sourceTransactionId: transaction.id,
        dueDate: fallbackDates.dueDate,
      });
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
  const expectedTotalCents = Number(bill.forecastTotalCents || 0);
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
