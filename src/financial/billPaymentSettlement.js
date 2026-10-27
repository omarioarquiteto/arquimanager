const amountToCents = (value) => {
  if (value == null || value === '') return 0;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.round(value * 100) : 0;
  }

  let text = String(value).trim().replace(/R\$|\s/g, '');
  if (text.includes(',') && text.includes('.')) text = text.replace(/\./g, '').replace(',', '.');
  else if (text.includes(',')) text = text.replace(',', '.');
  const number = Number(text);
  return Number.isFinite(number) ? Math.round(number * 100) : 0;
};

const normalizeKey = (value) => String(value == null ? '' : value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toUpperCase()
  .replace(/[^A-Z0-9]/g, '');

const monthFromValue = (value) => {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{4}-\d{2})(?:$|-)/);
  return match ? match[1] : '';
};

const billMonth = (bill = {}) => (
  monthFromValue(bill.billForecastDate)
  || monthFromValue(bill.dueDate)
  || monthFromValue(bill.billClosingDate)
);

const transactionBillMonth = (transaction = {}) => {
  const metadata = transaction.creditCardMetadata || {};
  return (
    monthFromValue(metadata.billForecastDate)
    || monthFromValue(metadata.billPostDate)
    || monthFromValue(transaction.billForecastDate)
    || monthFromValue(transaction.billPostDate)
  );
};

const nextMonth = (month) => {
  if (!/^\d{4}-\d{2}$/.test(month)) return '';
  const [year, monthNumber] = month.split('-').map(Number);
  const next = new Date(year, monthNumber, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
};

const sumPaymentsCents = (bill = {}) => (
  (Array.isArray(bill.payments) ? bill.payments : [])
    .reduce((sum, payment) => sum + Math.abs(amountToCents(payment?.amount)), 0)
);

const sumFinanceChargesCents = (bill = {}) => (
  (Array.isArray(bill.financeCharges) ? bill.financeCharges : [])
    .reduce((sum, charge) => sum + Math.abs(amountToCents(charge?.amount)), 0)
);

export const isRefundCreditTransaction = (transaction = {}) => {
  const direction = normalizeKey(transaction.type);
  if (!['CREDIT', 'INCOME'].includes(direction)) return false;

  const operationType = normalizeKey(
    transaction.operationType || transaction.providerRawData?.operationType || ''
  );

  // Do not treat a card bill payment as a refund even if a provider's free-text
  // description happens to contain the word "refund".
  if (['PAGAMENTOFATURA', 'PAGAMENTO', 'BILLPAYMENT', 'PAYMENT'].includes(operationType)) {
    return false;
  }

  const merchant = transaction.merchant;
  const merchantName = typeof merchant === 'string'
    ? merchant
    : (merchant?.name || merchant?.businessName || '');

  const description = [
    transaction.description,
    transaction.descriptionRaw,
    transaction.operationTypeAdditionalInfo,
    transaction.providerRawData?.description,
    transaction.providerRawData?.descriptionRaw,
    transaction.providerRawData?.operationTypeAdditionalInfo,
    merchantName,
  ].filter(Boolean).join(' ');

  const normalizedDescription = String(description)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  return ['ESTORNO', 'REFUND', 'REVERSAL', 'REEMBOLSO'].includes(operationType)
    || /\b(refund|estorno|reembolso|reversal)\b/.test(normalizedDescription);
};

const getRefundTransactionsForBill = (bill = {}, transactions = []) => {
  const accountId = String(bill.accountId || '').trim();
  const targetBillId = String(bill.id || '').trim();
  const targetMonth = billMonth(bill);
  if (!accountId) return [];

  const matched = (Array.isArray(transactions) ? transactions : []).filter(transaction => {
    if (!isRefundCreditTransaction(transaction)) return false;
    if (String(transaction.accountId || '').trim() !== accountId) return false;

    const metadata = transaction.creditCardMetadata || {};
    const explicitBillId = String(
      metadata.billId
      || transaction.billId
      || transaction.providerRawData?.creditCardMetadata?.billId
      || transaction.providerRawData?.billId
      || ''
    ).trim();

    // A provider-supplied bill ID is authoritative. Do not attach the refund
    // to another invoice by month if the explicit ID points elsewhere.
    if (explicitBillId) return explicitBillId === targetBillId;

    const transactionMonth = transactionBillMonth(transaction);
    return Boolean(targetMonth && transactionMonth && transactionMonth === targetMonth);
  });

  // Protect against duplicate rows in an API response.
  const unique = new Map();
  matched.forEach((transaction, index) => {
    const id = String(transaction.id || transaction.providerId || '').trim()
      || [
        transaction.date || '',
        transaction.description || '',
        transaction.amountInAccountCurrency ?? transaction.amount ?? '',
        index,
      ].join('|');
    if (!unique.has(id)) unique.set(id, transaction);
  });

  return [...unique.values()];
};

/**
 * Determine the effective amount due using payment evidence from Pluggy and
 * explicitly identified credit-card refunds. The official total is preserved.
 *
 * Refunds are applied only to the unpaid gap. If payments already cover the
 * official bill total, a refund cannot reduce the bill a second time.
 */
export const resolveBillPaymentSettlement = (bill = {}, allBills = [], transactions = []) => {
  const totalCents = Math.abs(amountToCents(bill.totalAmount));
  const providerPaidCents = sumPaymentsCents(bill);
  const payments = Array.isArray(bill.payments) ? bill.payments : [];
  const refundTransactions = getRefundTransactionsForBill(bill, transactions);
  const recognizedRefundCents = refundTransactions.reduce((sum, transaction) => (
    sum + Math.abs(amountToCents(
      transaction.amountInAccountCurrency ?? transaction.amount
    ))
  ), 0);

  const unpaidGapCents = Math.max(0, totalCents - providerPaidCents);
  const appliedRefundCents = Math.min(recognizedRefundCents, unpaidGapCents);
  const effectiveTotalCents = Math.max(0, totalCents - appliedRefundCents);
  const refundTransactionIds = refundTransactions
    .map(transaction => String(transaction.id || '').trim())
    .filter(Boolean);

  const common = {
    totalCents,
    effectiveTotalCents,
    providerPaidCents,
    recognizedRefundCents,
    appliedRefundCents,
    refundTransactionIds,
  };

  // This is the user's case: the institution reports payment short by exactly
  // a refund credit; the credit reduces the net amount that was payable.
  if (
    totalCents > 0
    && appliedRefundCents > 0
    && effectiveTotalCents > 0
    && providerPaidCents >= effectiveTotalCents
    && providerPaidCents < totalCents
  ) {
    return {
      ...common,
      settled: true,
      paidCents: providerPaidCents,
      source: 'CURRENT_REFUND_NETTING',
      evidenceBillId: bill.id || null,
      evidenceCents: providerPaidCents,
    };
  }

  if (totalCents > 0 && payments.some(payment => (
    normalizeKey(payment?.valueType) === 'FULLPAYMENT'
  ))) {
    return {
      ...common,
      settled: true,
      paidCents: effectiveTotalCents,
      source: appliedRefundCents > 0 ? 'CURRENT_REFUND_NETTING' : 'CURRENT_FULL_PAYMENT',
      evidenceBillId: bill.id || null,
      evidenceCents: providerPaidCents,
    };
  }

  if (totalCents > 0 && providerPaidCents >= totalCents) {
    return {
      ...common,
      settled: true,
      paidCents: totalCents,
      source: 'CURRENT_PAYMENT_TOTAL',
      evidenceBillId: bill.id || null,
      evidenceCents: providerPaidCents,
    };
  }

  const accountId = String(bill.accountId || '').trim();
  const month = billMonth(bill);
  const followingMonth = nextMonth(month);
  if (totalCents > 0 && accountId && followingMonth) {
    const nextCycleBills = (Array.isArray(allBills) ? allBills : []).filter(candidate => (
      String(candidate?.id || '') !== String(bill.id || '')
      && String(candidate?.accountId || '').trim() === accountId
      && billMonth(candidate) === followingMonth
    ));

    // Require a single next-cycle bill to avoid attributing payments to the
    // wrong bill when a provider returns multiple bills for the same period.
    if (nextCycleBills.length === 1) {
      const nextCycleBill = nextCycleBills[0];
      const nextCyclePaymentsCents = sumPaymentsCents(nextCycleBill);
      const nextCycleChargesCents = sumFinanceChargesCents(nextCycleBill);
      const requiredPaymentCents = effectiveTotalCents + nextCycleChargesCents;

      if (nextCyclePaymentsCents >= requiredPaymentCents) {
        return {
          ...common,
          settled: true,
          paidCents: effectiveTotalCents,
          source: 'NEXT_CYCLE_SETTLEMENT',
          evidenceBillId: nextCycleBill.id || null,
          evidenceCents: nextCyclePaymentsCents,
        };
      }
    }
  }

  return {
    ...common,
    settled: false,
    paidCents: providerPaidCents,
    source: providerPaidCents > 0 ? 'CURRENT_PARTIAL_PAYMENTS' : null,
    evidenceBillId: bill.id || null,
    evidenceCents: providerPaidCents,
  };
};
