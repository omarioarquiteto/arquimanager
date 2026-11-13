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
  .replace(/\s+(?:(?:parcela|parc(?:ela)?)\s*)?\d+\s*(?:\/|de|of)\s*\d+\s*$/i, '')
  .trim();

const normalizeMerchantIdentity = value => {
  const tokens = normalizeText(stripInstallmentSuffix(value)).split(' ').filter(Boolean);
  return tokens.reduce((result, token) => {
    const previous = result[result.length - 1];
    const repeated = previous === token;
    const truncatedRepeat = token.length >= 4
      && previous
      && previous.length >= token.length + 2
      && previous.startsWith(token);
    if (!repeated && !truncatedRepeat) result.push(token);
    return result;
  }, []).join(' ');
};

const purchaseDateAnchor = value => {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/);
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
  const descriptionForInstallment = String(
    transaction.description || transaction.descriptionRaw || ''
  );
  const descriptionInstallment = descriptionForInstallment.match(/(?:\b(?:parcela|parc)\s*)?(\d+)\s*(?:\/|de|of)\s*(\d+)\s*$/i);
  const metadataTotalInstallments = Number(
    transaction.creditCardTotalInstallments || metadata.totalInstallments || 0
  );
  const totalInstallments = metadataTotalInstallments > 0
    ? metadataTotalInstallments
    : Number(descriptionInstallment?.[2] || 0);
  const metadataInstallmentNumber = Number(
    transaction.creditCardInstallmentNumber || metadata.installmentNumber || 0
  );
  const installmentNumber = metadataInstallmentNumber > 0
    ? metadataInstallmentNumber
    : Number(descriptionInstallment?.[1] || 0);
  let purchaseDate = purchaseDateAnchor(
    transaction.creditCardPurchaseDateTime
    || transaction.creditCardPurchaseDate
    || metadata.purchaseDate
    || transaction.purchaseDate
  );
  if (!purchaseDate && installmentNumber > 0) {
    const transactionDate = String(transaction.date || '').slice(0, 10);
    const dateMatch = transactionDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateMatch) {
      const monthDate = new Date(Number(dateMatch[1]), Number(dateMatch[2]) - 1 - (installmentNumber - 1), 1);
      purchaseDate = `month:${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`;
    }
  }
  if (!resolvedCardId || !purchaseDate || !Number.isInteger(totalInstallments) || totalInstallments < 2) {
    return '';
  }

  const cardNumber = String(
    transaction.creditCardCardLast4
    || metadata.cardNumber
    || transaction.cardNumber
    || ''
  ).replace(/\D/g, '');
  const cardLast4 = cardNumber.length >= 4 ? cardNumber.slice(-4) : '';
  const merchantCnpj = String(
    transaction.creditCardMerchantCnpj
    || transaction.merchant?.cnpj
    || ''
  ).replace(/\D/g, '');
  const description = String(
    transaction.description || transaction.merchant?.name || transaction.merchant || transaction.descriptionRaw || ''
  );
  const merchantKey = !purchaseDate.startsWith('instant:')
    ? (merchantCnpj
      ? `cnpj:${merchantCnpj}`
      : `merchant:${normalizeMerchantIdentity(description)}`)
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
    !purchaseDate.startsWith('instant:') ? amountCents : '',
  ].join('|');

  return `CMP-${stableHash(identity)}`;
};
