// Adaptador de dados bancários Pluggy -> modelo financeiro do ArquiManager.
// Não chama a API da Pluggy. Esta camada apenas normaliza os dados recebidos.
// A API/clientSecret continuarão exclusivamente no backend.

import { normalizeText, toCents, transactionKey } from './financialEngine.js';

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

const safeText = (value) => String(value || '').trim();

const sensitiveKeys = new Set([
  'cpf', 'cnpj', 'documentnumber', 'document_number',
  'accountnumber', 'account_number', 'branchnumber', 'branch_number',
  'routingnumber', 'routing_number', 'password', 'secret',
  'token', 'accesstoken', 'access_token', 'clientsecret', 'client_secret',
  'apikey', 'api_key', 'credentials',
]);

const sanitizeProviderValue = (value, key = '') => {
  if (Array.isArray(value)) {
    return value.map(item => sanitizeProviderValue(item));
  }

  if (value && typeof value === 'object') {
    const result = {};
    Object.entries(value).forEach(([childKey, childValue]) => {
      const normalizedKey = normalizeText(childKey).replace(/\\s+/g, '');
      if (sensitiveKeys.has(normalizedKey)) return;

      if (normalizedKey === 'cardnumber' || normalizedKey === 'card_number') {
        const digits = String(childValue || '').replace(/\\D/g, '');
        result[childKey] = digits ? digits.slice(-4) : null;
        return;
      }

      result[childKey] = sanitizeProviderValue(childValue, childKey);
    });
    return result;
  }

  if (value === undefined) return null;
  return value;
};

export const pluggyTransactionDetailsToFinancial = (transaction = {}) => {
  const credit = transaction.creditCardMetadata || {};
  const payment = transaction.paymentData || {};
  const boleto = transaction.boletoMetadata || {};

  const installmentNumber = Number(
    credit.installmentNumber ?? transaction.installmentNumber ?? 0
  );
  const totalInstallments = Number(
    credit.totalInstallments ?? transaction.totalInstallments ?? 0
  );
  const totalAmount = Number(
    credit.totalAmount ?? transaction.totalAmount ?? 0
  );

  return {
    providerRawData: sanitizeProviderValue(transaction),
    providerCreatedAt: safeText(transaction.createdAt) || null,
    providerUpdatedAt: safeText(transaction.updatedAt) || null,
    providerCategoryId: safeText(transaction.categoryId) || null,

    originalAmount: Number.isFinite(Number(transaction.amount)) ? Number(transaction.amount) : null,
    amountInAccountCurrency: Number.isFinite(Number(transaction.amountInAccountCurrency))
      ? Number(transaction.amountInAccountCurrency)
      : null,

    paymentMethod: safeText(payment.paymentMethod) || null,
    paymentReason: safeText(payment.reason) || null,
    paymentReferenceNumber: safeText(payment.referenceNumber) || null,
    boletoBaseAmount: Number.isFinite(Number(boleto.baseAmount)) ? Number(boleto.baseAmount) : null,
    boletoDiscountAmount: Number.isFinite(Number(boleto.discountAmount)) ? Number(boleto.discountAmount) : null,
    boletoInterestAmount: Number.isFinite(Number(boleto.interestAmount)) ? Number(boleto.interestAmount) : null,

    creditCardInstallmentNumber: installmentNumber > 0 ? installmentNumber : null,
    creditCardTotalInstallments: totalInstallments > 0 ? totalInstallments : null,
    creditCardTotalAmountCents: totalAmount > 0 ? toCents(totalAmount) : null,
    creditCardPayeeMcc: Number.isFinite(Number(credit.payeeMCC ?? transaction.payeeMCC))
      ? Number(credit.payeeMCC ?? transaction.payeeMCC)
      : null,
    creditCardLast4: safeText(credit.cardNumber || transaction.cardNumber).replace(/\\D/g, '').slice(-4) || null,
    creditCardBillId: safeText(credit.billId || transaction.billId) || null,
    creditCardPurchaseDate: safeText(credit.purchaseDate || transaction.purchaseDate) || null,

    providerType: safeText(transaction.type) || null,
    providerStatus: safeText(transaction.status) || null,
    operationType: safeText(transaction.operationType) || null,
    operationTypeAdditionalInfo: safeText(transaction.operationTypeAdditionalInfo) || null,
    merchantDetails: sanitizeProviderValue(transaction.merchant || null),
    paymentDetails: sanitizeProviderValue(transaction.paymentData || null),
    boletoDetails: sanitizeProviderValue(transaction.boletoMetadata || null),
  };
};

export const pluggyTypeToFinancialType = (type, amount = 0) => {
  const normalized = normalizeText(type);
  if (normalized === 'credit') return 'INCOME';
  if (normalized === 'debit') return 'EXPENSE';
  return Number(amount) < 0 ? 'EXPENSE' : 'INCOME';
};

export const pluggyTransactionToFinancial = ({
  transaction,
  companyId,
  financialAccountId,
  financialCardId = null,
}) => {
  if (!transaction?.id) throw new Error('Transação Pluggy sem id.');
  if (!companyId) throw new Error('companyId é obrigatório.');
  if (!financialAccountId) throw new Error('financialAccountId é obrigatório.');

  const rawAmount = Number(
    transaction.amountInAccountCurrency ?? transaction.amount ?? 0
  );
  const type = pluggyTypeToFinancialType(transaction.type, rawAmount);
  const amountCents = Math.abs(toCents(rawAmount));
  const description = safeText(transaction.description) || 'Movimentação bancária';
  const descriptionRaw = safeText(transaction.descriptionRaw);
  const merchantName = safeText(transaction.merchant?.name);
  const merchantBusinessName = safeText(transaction.merchant?.businessName);
  const merchant = merchantName || merchantBusinessName || description;

  const date = dateOnly(transaction.date);
  const providerId = safeText(transaction.providerId);
  const providerCode = safeText(transaction.providerCode);

  return {
    companyId,
    source: 'PLUGGY',
    externalId: `pluggy:${transaction.id}`,
    providerTransactionId: transaction.id,
    providerAccountId: safeText(transaction.accountId),
    providerId: providerId || null,
    providerCode: providerCode || null,

    financialAccountId,
    accountId: financialAccountId,
    cardId: financialCardId,

    date,
    actualDate: date,
    expectedDate: null,

    description,
    descriptionRaw: descriptionRaw || null,
    merchant,
    normalizedMerchant: normalizeText(merchant),

    amountCents,
    type,

    // Toda movimentação vinda do banco passa pelo mesmo motor de
    // identificação/conciliacão do ArquiManager.
    status: 'IDENTIFICATION_REQUIRED',
    reconciliationType: null,
    categoryId: null,
    projectId: null,
    clientId: null,
    supplierId: null,

    currencyCode: safeText(transaction.currencyCode) || 'BRL',
    providerStatus: safeText(transaction.status) || null,
    operationType: safeText(transaction.operationType) || null,
    operationTypeAdditionalInfo: safeText(transaction.operationTypeAdditionalInfo) || null,

    bankBalanceCents: Number.isFinite(Number(transaction.balance))
      ? toCents(transaction.balance)
      : null,

    ...pluggyTransactionDetailsToFinancial(transaction),

    notes: '',
    importedAt: new Date().toISOString(),
  };
};

export const pluggyTransactionKey = ({
  transaction,
  financialAccountId,
}) => {
  if (transaction?.id) return `pluggy:${transaction.id}`;

  return transactionKey({
    accountId: financialAccountId,
    date: dateOnly(transaction?.date),
    description: transaction?.description || '',
    amountCents: Math.abs(
      toCents(
        transaction?.amountInAccountCurrency ??
        transaction?.amount ??
        0
      )
    ),
  });
};

export const isPluggyTransfer = (transaction = {}) => {
  const operationType = normalizeText(transaction.operationType);
  const description = normalizeText(transaction.description);

  return [
    'ted',
    'doc',
    'pix',
    'transferencia',
    'transferencia mesma instituicao',
  ].some(term => operationType.includes(term))
    || /(transferencia|ted|doc|pix)/.test(description);
};

export const isPluggyCardBillPayment = (transaction = {}) => {
  const operationType = normalizeText(transaction.operationType);
  const description = normalizeText(transaction.description);

  return operationType.includes('pagamento fatura')
    || /(pagamento|pagto|fatura)/.test(description) && /(cartao|credito)/.test(description);
};

export const summarizePluggySync = (transactions = []) => {
  const summary = {
    total: transactions.length,
    income: 0,
    expense: 0,
    transferCandidates: 0,
    cardBillPaymentCandidates: 0,
  };

  transactions.forEach(transaction => {
    const amountCents = Math.abs(toCents(
      transaction?.amountInAccountCurrency ??
      transaction?.amount ??
      0
    ));
    const type = pluggyTypeToFinancialType(transaction?.type, transaction?.amount);

    if (type === 'INCOME') summary.income += amountCents;
    else summary.expense += amountCents;

    if (isPluggyTransfer(transaction)) summary.transferCandidates += 1;
    if (isPluggyCardBillPayment(transaction)) summary.cardBillPaymentCandidates += 1;
  });

  return summary;
};
