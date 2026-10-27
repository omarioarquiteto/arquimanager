const asText = value => String(value == null ? '' : value).trim();

const monthFromValue = value => {
  const raw = asText(value);
  if (!raw) return '';
  const match = raw.match(/^(\d{4})-(\d{2})(?:$|-)/);
  if (match) {
    const month = Number(match[2]);
    return month >= 1 && month <= 12 ? match[1] + '-' + match[2] : '';
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.getFullYear() + '-' + String(parsed.getMonth() + 1).padStart(2, '0');
};

const normalizedText = value => String(value == null ? '' : value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const normalizedPurchaseLabel = value => normalizedText(
  asText(value)
    .replace(/\b(?:parcela|parc(?:ela)?|installment)\s*#?\s*\d+\s*(?:\/|de|of)\s*\d+\b/gi, ' ')
    .replace(/\bparcela\s+\d+\s+\d+\b/gi, ' ')
    .replace(/\b\d+\s*\/\s*\d+\b/g, ' ')
);

const isCreditCardTransaction = (tx = {}) => (
  tx.accountType === 'CREDIT_CARD'
  || tx.isCreditCardTransaction === true
  || Boolean(tx.cardId && (
    tx.creditCardInstallmentNumber
    || tx.creditCardBillForecastDate
    || tx.creditCardPaymentType
  ))
);

const isPluggyTransaction = (tx = {}) => (
  String(tx.provider || '').toUpperCase() === 'PLUGGY'
  || String(tx.source || '').toUpperCase().startsWith('PLUGGY')
  || Boolean(tx.providerTransactionId)
  || String(tx.externalId || '').startsWith('pluggy-v2:')
);

const getTransactionProviderBillId = (tx = {}) => asText(
  tx.providerBillId
  || tx.creditCardBillId
  || tx.creditCardMetadata?.billId
  || tx.providerRawData?.creditCardMetadata?.billId
  || tx.providerRawData?.billId
);

export const getExplicitTransactionBillMonth = (tx = {}) => {
  const metadata = tx.creditCardMetadata || tx.providerRawData?.creditCardMetadata || {};
  const raw = tx.providerRawData || {};
  const candidates = [
    tx.creditCardBillForecastDate,
    metadata.billForecastDate,
    raw.billForecastDate,
    tx.creditCardBillPostDate,
    metadata.billPostDate,
    raw.billPostDate,
  ];
  for (const value of candidates) {
    const month = monthFromValue(value);
    if (month) return month;
  }
  return '';
};


const dateOnlyValue = value => {
  const raw = asText(value);
  if (!raw) return '';
  const directDate = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (directDate) return directDate[1];
  if (/^\d{4}-\d{2}$/.test(raw)) return raw + '-01';
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.getFullYear() + '-' + String(parsed.getMonth() + 1).padStart(2, '0') + '-' + String(parsed.getDate()).padStart(2, '0');
};

const getRawBillMonth = (bill = {}) => {
  const forecastMonth = asText(bill.billForecastDate).slice(0, 7);
  if (/^\d{4}-\d{2}$/.test(forecastMonth)) return forecastMonth;
  return monthFromValue(bill.dueDate) || monthFromValue(bill.billClosingDate);
};

/**
 * Corrects a provider's transaction-to-bill link when the transaction date is
 * after the linked bill's close date. A closed bill cannot receive a later
 * posting: the transaction belongs to the first subsequent bill that closes
 * on or after the posting date.
 *
 * Returns the corrected provider bill ID, or an empty string when the input
 * does not provide enough dates/bills to make an unambiguous correction.
 */
export const getCorrectedTransactionBillProviderId = (
  tx = {},
  accountId = '',
  allBills = []
) => {
  const bills = Array.isArray(allBills) ? allBills : [];
  const raw = tx.providerRawData || {};
  const metadata = tx.creditCardMetadata || raw.creditCardMetadata || {};
  const sourceAccountId = asText(accountId || tx.accountId);
  if (!sourceAccountId) return '';

  const providerBillId = asText(
    metadata.billId
    || tx.creditCardBillId
    || tx.billId
    || raw.creditCardMetadata?.billId
    || raw.billId
  );

  // Forecast cycle is the most direct signal for the bill receiving the
  // movement. A provider billId may still point at the prior/closed cycle.
  const explicitForecastMonth = [
    metadata.billForecastDate,
    tx.creditCardBillForecastDate,
    tx.billForecastDate,
    raw.creditCardMetadata?.billForecastDate,
    raw.billForecastDate,
  ].map(monthFromValue).find(Boolean) || '';

  const explicitMonth = [
    explicitForecastMonth,
    metadata.billPostDate,
    tx.creditCardBillPostDate,
    tx.billPostDate,
    raw.creditCardMetadata?.billPostDate,
    raw.billPostDate,
  ].map(monthFromValue).find(Boolean) || '';

  let linkedBill = providerBillId
    ? bills.find(bill => (
        asText(bill.id) === providerBillId
        && asText(bill.accountId) === sourceAccountId
      ))
    : null;

  // If Pluggy explicitly forecasts a later cycle, honor it only when exactly
  // one bill for this same card/account matches that cycle.
  if (linkedBill && explicitForecastMonth) {
    const linkedMonth = getRawBillMonth(linkedBill);
    if (linkedMonth && explicitForecastMonth > linkedMonth) {
      const forecastBills = bills.filter(bill => (
        asText(bill.accountId) === sourceAccountId
        && getRawBillMonth(bill) === explicitForecastMonth
      ));
      if (forecastBills.length === 1) return asText(forecastBills[0].id);
    }
  }

  if (!linkedBill && explicitMonth) {
    const matchingBills = bills.filter(bill => (
      asText(bill.accountId) === sourceAccountId
      && getRawBillMonth(bill) === explicitMonth
    ));
    if (matchingBills.length === 1) linkedBill = matchingBills[0];
  }

  if (!linkedBill) return '';

  // The transaction's real date is primary. Provider metadata can lag behind
  // and must not trap a later movement in a previously closed billing cycle.
  const postedDate = dateOnlyValue(
    tx.date
    || tx.transactionDateTime
    || raw.date
    || raw.transactionDateTime
    || metadata.transactionDateTime
    || metadata.billPostDate
    || tx.creditCardBillPostDate
    || tx.billPostDate
    || raw.creditCardMetadata?.billPostDate
    || raw.billPostDate
  );
  const linkedClosingDate = dateOnlyValue(linkedBill.billClosingDate);
  if (!postedDate || !linkedClosingDate || postedDate <= linkedClosingDate) return '';

  const linkedMonth = getRawBillMonth(linkedBill);
  const nextBills = bills
    .filter(bill => {
      if (asText(bill.id) === asText(linkedBill.id)) return false;
      if (asText(bill.accountId) !== sourceAccountId) return false;

      const billMonth = getRawBillMonth(bill);
      const closingDate = dateOnlyValue(bill.billClosingDate);
      return Boolean(
        billMonth
        && (!linkedMonth || billMonth > linkedMonth)
        && closingDate
        && closingDate >= postedDate
      );
    })
    .sort((left, right) => (
      dateOnlyValue(left.billClosingDate).localeCompare(dateOnlyValue(right.billClosingDate))
    ));

  if (!nextBills.length) return '';
  const earliestClosingDate = dateOnlyValue(nextBills[0].billClosingDate);
  const earliestBills = nextBills.filter(bill => dateOnlyValue(bill.billClosingDate) === earliestClosingDate);

  // Do not guess if two bills for this account have the same closest close date.
  return earliestBills.length === 1 ? asText(earliestBills[0].id) : '';
};

const getLinkedBillMonth = (tx = {}, allBills = []) => {
  const localBillId = asText(tx.billId);
  if (localBillId) {
    const linkedBill = allBills.find(bill => String(bill.id || '') === localBillId);
    if (linkedBill) return monthFromValue(linkedBill.referenceMonth);
  }

  const providerBillId = getTransactionProviderBillId(tx);
  if (providerBillId) {
    const linkedBill = allBills.find(bill =>
      String(bill.providerBillId || '') === providerBillId
    );
    if (linkedBill) return monthFromValue(linkedBill.referenceMonth);
  }
  return '';
};

const getTransactionBillMonth = (tx = {}, allBills = []) => (
  getLinkedBillMonth(tx, allBills) || getExplicitTransactionBillMonth(tx)
);

const transactionMatchesCard = (tx = {}, card = {}) => {
  const cardId = asText(card.id);
  const providerAccountId = asText(card.providerAccountId);
  return Boolean(
    (cardId && (asText(tx.cardId) === cardId || asText(tx.accountId) === cardId))
    || (providerAccountId && (
      asText(tx.providerAccountId) === providerAccountId
      || asText(tx.accountId) === providerAccountId
    ))
  );
};

const sameCardTransaction = (left = {}, right = {}) => {
  const leftProviderAccount = asText(left.providerAccountId);
  const rightProviderAccount = asText(right.providerAccountId);
  if (leftProviderAccount && rightProviderAccount) {
    return leftProviderAccount === rightProviderAccount;
  }

  const leftCardId = asText(left.cardId);
  const rightCardId = asText(right.cardId);
  if (leftCardId && rightCardId) return leftCardId === rightCardId;

  const leftAccountId = asText(left.accountId);
  const rightAccountId = asText(right.accountId);
  return Boolean(leftAccountId && leftAccountId === rightAccountId);
};

const getInstallmentInfo = (tx = {}) => {
  const metadata = tx.creditCardMetadata || tx.providerRawData?.creditCardMetadata || {};
  const installmentNumber = Number(tx.creditCardInstallmentNumber ?? metadata.installmentNumber ?? 0);
  const totalInstallments = Number(tx.creditCardTotalInstallments ?? metadata.totalInstallments ?? 0);
  const purchaseDate = asText(
    tx.creditCardPurchaseDate || metadata.purchaseDate
  ).slice(0, 10);
  const amountCents = Math.abs(Number(tx.amountCents ?? 0));
  const merchantValue = tx.normalizedMerchant || tx.merchant || tx.descriptionRaw || tx.description;
  const merchantKey = normalizedPurchaseLabel(merchantValue);
  const type = asText(tx.type).toUpperCase();

  if (
    !purchaseDate
    || !Number.isInteger(installmentNumber)
    || !Number.isInteger(totalInstallments)
    || totalInstallments < 2
    || installmentNumber < 1
    || installmentNumber > totalInstallments
    || amountCents <= 0
    || merchantKey.length < 3
  ) {
    return null;
  }

  return {
    installmentNumber,
    totalInstallments,
    purchaseDate,
    amountCents,
    merchantKey,
    type,
  };
};

const sameInstallmentPurchase = (left = {}, right = {}) => {
  const a = getInstallmentInfo(left);
  const b = getInstallmentInfo(right);
  return Boolean(
    a && b
    && a.purchaseDate === b.purchaseDate
    && a.totalInstallments === b.totalInstallments
    && a.amountCents === b.amountCents
    && a.merchantKey === b.merchantKey
    && a.type === b.type
    && sameCardTransaction(left, right)
  );
};

const shiftMonth = (value, delta) => {
  const month = monthFromValue(value);
  if (!month) return '';
  const parts = month.split('-').map(Number);
  const absoluteMonth = parts[0] * 12 + parts[1] - 1 + Number(delta || 0);
  const year = Math.floor(absoluteMonth / 12);
  const monthNumber = ((absoluteMonth % 12) + 12) % 12 + 1;
  if (year < 1) return '';
  return year + '-' + String(monthNumber).padStart(2, '0');
};

// Infere somente o mês de um lançamento real já importado. Nunca cria uma
// transação ausente nem atribui mês quando há âncoras conflitantes.
const inferInstallmentBillMonth = (tx, transactions = [], allBills = []) => {
  const target = getInstallmentInfo(tx);
  if (!target) return '';

  const candidateMonths = new Set();
  for (const anchor of Array.isArray(transactions) ? transactions : []) {
    if (!anchor || String(anchor.id || '') === String(tx.id || '')) continue;
    if (!isCreditCardTransaction(anchor) || !isPluggyTransaction(anchor)) continue;
    if (!sameInstallmentPurchase(tx, anchor)) continue;

    const anchorInfo = getInstallmentInfo(anchor);
    if (!anchorInfo || anchorInfo.installmentNumber === target.installmentNumber) continue;

    const anchorMonth = getTransactionBillMonth(anchor, allBills);
    if (!anchorMonth) continue;

    const inferredMonth = shiftMonth(
      anchorMonth,
      target.installmentNumber - anchorInfo.installmentNumber
    );
    if (inferredMonth) candidateMonths.add(inferredMonth);
  }

  return candidateMonths.size === 1 ? Array.from(candidateMonths)[0] : '';
};

export const transactionBelongsToBill = (
  tx = {},
  bill = {},
  card = {},
  allTransactions = [],
  allBills = []
) => {
  if (!isCreditCardTransaction(tx) || !isPluggyTransaction(tx)) return false;

  // Um vínculo local explícito é autoritativo: não redirecionamos o mesmo
  // lançamento para outra fatura apenas porque o mês parece coincidir.
  const localBillId = asText(tx.billId);
  if (localBillId) return localBillId === asText(bill.id);

  const transactionProviderBillId = getTransactionProviderBillId(tx);
  const providerBillId = asText(bill.providerBillId);
  if (transactionProviderBillId) {
    return Boolean(providerBillId && transactionProviderBillId === providerBillId);
  }

  if (!transactionMatchesCard(tx, card)) return false;

  const targetMonth = monthFromValue(bill.referenceMonth);
  if (!targetMonth) return false;

  // Quando a Pluggy informa o ciclo, respeitamos esse dado e não tentamos
  // deslocar a transação para outro mês pela sequência de parcelas.
  const explicitMonth = getExplicitTransactionBillMonth(tx);
  if (explicitMonth) return explicitMonth === targetMonth;

  const inferredMonth = inferInstallmentBillMonth(tx, allTransactions, allBills);
  return Boolean(inferredMonth && inferredMonth === targetMonth);
};

export const getBillTransactions = (
  bill,
  card,
  transactions = [],
  allBills = []
) => (
  (Array.isArray(transactions) ? transactions : [])
    .filter(tx => transactionBelongsToBill(tx, bill, card, transactions, allBills))
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
);
