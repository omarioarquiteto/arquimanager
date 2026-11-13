const normalizePaymentType = value => String(value || '')
  .trim()
  .toUpperCase()
  .replace(/[\\s-]+/g, '_');

export const getInstallmentDetails = (transaction = {}) => {
  const metadata = transaction.creditCardMetadata || {};
  const installmentNumber = Number(
    metadata.installmentNumber ?? transaction.creditCardInstallmentNumber ?? 0
  );
  const totalInstallments = Number(
    metadata.totalInstallments ?? transaction.creditCardTotalInstallments ?? 0
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
