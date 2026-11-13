import { normalizeText } from './financialEngine.js';

const hash32 = value => {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
};

const stableHash = value => {
  const reversed = Array.from(value).reverse().join('');
  return `${hash32(value)}${hash32(reversed)}`;
};

const stripInstallmentSuffix = value => String(value || '')
  .trim()
  .replace(/\\s+(?:(?:parcela|parc(?:ela)?)\\s*)?\\d+\\s*(?:\\/|de|of)\\s*\\d+\\s*$/i, '')
  .trim();

const purchaseDateAnchor = value => {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\\d{4}-\\d{2}-\\d{2})(?:[T ](\\d{2}:\\d{2}))?/);
  if (!match) return '';
  if (match[2]) {
    const parsed = Date.parse(raw);
    return Number.isNaN(parsed) ? `instant:${raw}` : `instant:${new Date(parsed).toISOString()}`;
  }
  return `date:${match[1]}`;
};

export const buildCreditCardPurchaseId = ({ transaction = {}, cardId = '' } = {}) => {
  const metadata = transaction.creditCardMetadata || {};
  const resolvedCardId = String(cardId || transaction.cardId || transaction.accountId || '').trim();
  const totalInstallments = Number(
    transaction.creditCardTotalInstallments ?? metadata.totalInstallments ?? 0
  );
  const purchaseDate = purchaseDateAnchor(
    transaction.creditCardPurchaseDateTime
    || transaction.creditCardPurchaseDate
    || metadata.purchaseDate
    || transaction.purchaseDate
  );
  if (!resolvedCardId || !purchaseDate || !Number.isInteger(totalInstallments) || totalInstallments < 2) {
    return '';
  }

  const cardNumber = String(
    transaction.creditCardCardLast4
    || metadata.cardNumber
    || transaction.cardNumber
    || ''
  ).replace(/\\D/g, '');
  const cardLast4 = cardNumber.length >= 4 ? cardNumber.slice(-4) : '';
  const merchantCnpj = String(
    transaction.creditCardMerchantCnpj
    || transaction.merchant?.cnpj
    || ''
  ).replace(/\\D/g, '');
  const description = String(
    transaction.description || transaction.merchant?.name || transaction.merchant || transaction.descriptionRaw || ''
  );
  const merchantKey = merchantCnpj
    ? `cnpj:${merchantCnpj}`
    : purchaseDate.startsWith('date:')
      ? `merchant:${normalizeText(stripInstallmentSuffix(description))}`
      : 'merchant:timestamp-anchored';

  const amountCents = Math.abs(Number(
    transaction.amountCents != null
      ? transaction.amountCents
      : Math.round(Number(transaction.amount || 0) * 100)
  ));

  // O Open Finance não fornece um ID de grupo da compra. Este código interno
  // usa a data/hora original, cartão, estabelecimento quando necessário e
  // número total de parcelas; a descrição deixa de interferir quando há hora
  // original, pois pode variar entre as parcelas da mesma compra.
  const identity = [
    resolvedCardId,
    cardLast4,
    purchaseDate,
    merchantKey,
    totalInstallments,
    purchaseDate.startsWith('date:') ? amountCents : '',
    String(transaction.type || 'EXPENSE').toUpperCase(),
  ].join('|');

  return `CMP-${stableHash(identity)}`;
};
