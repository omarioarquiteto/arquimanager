const normalizePaymentType = value => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toUpperCase()
  .replace(/[\s-]+/g, '_');

export const getInstallmentDetails = (transaction = {}) => {
  const metadata = transaction.creditCardMetadata || {};
  const description = String(
    transaction.description || transaction.descriptionRaw || transaction.merchant || ''
  ).trim();
  const descriptionMatch = description.match(/(?:\b(?:parcela|parc)\s*)?(\d+)\s*(?:\/|de|of)\s*(\d+)\s*$/i);
  const installmentNumber = Number(
    metadata.installmentNumber ?? transaction.creditCardInstallmentNumber ?? descriptionMatch?.[1] ?? 0
  );
  const totalInstallments = Number(
    metadata.totalInstallments ?? transaction.creditCardTotalInstallments ?? descriptionMatch?.[2] ?? 0
  );
  const paymentType = normalizePaymentType(metadata.paymentType || transaction.creditCardPaymentType);

  if (['SINGLE', 'A_VISTA', 'AVISTA'].includes(paymentType)) return null;
  if (
    !Number.isInteger(installmentNumber)
    || !Number.isInteger(totalInstallments)
    || totalInstallments < 2
    || installmentNumber < 1
    || installmentNumber > totalInstallments
  ) return null;

  return { installmentNumber, totalInstallments, paymentType };
};

export const isInstallmentCreditTransaction = transaction =>
  Boolean(getInstallmentDetails(transaction));
