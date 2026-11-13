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
  const metadataInstallmentNumber = Number(
    metadata.installmentNumber ?? transaction.creditCardInstallmentNumber ?? 0
  );
  const metadataTotalInstallments = Number(
    metadata.totalInstallments ?? transaction.creditCardTotalInstallments ?? 0
  );
  const installmentNumber = metadataInstallmentNumber > 0
    ? metadataInstallmentNumber
    : Number(descriptionMatch?.[1] || 0);
  const totalInstallments = metadataTotalInstallments > 0
    ? metadataTotalInstallments
    : Number(descriptionMatch?.[2] || 0);
  const paymentType = normalizePaymentType(metadata.paymentType || transaction.creditCardPaymentType);

  if (['SINGLE', 'A_VISTA', 'AVISTA'].includes(paymentType)) return null;
  if (
    !Number.isInteger(installmentNumber)
    || !Number.isInteger(totalInstallments)
    || totalInstallments < 2
    || (metadataTotalInstallments <= 0 && totalInstallments > 48)
    || installmentNumber < 1
    || installmentNumber > totalInstallments
  ) return null;

  return { installmentNumber, totalInstallments, paymentType };
};

export const isInstallmentCreditTransaction = transaction =>
  Boolean(getInstallmentDetails(transaction));
