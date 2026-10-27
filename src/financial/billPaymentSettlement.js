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

const billMonth = (bill = {}) => {
  const forecast = String(bill.billForecastDate || '').trim().slice(0, 7);
  if (/^\d{4}-\d{2}$/.test(forecast)) return forecast;

  const due = String(bill.dueDate || '').trim().match(/^(\d{4}-\d{2})/);
  if (due) return due[1];

  const closing = String(bill.billClosingDate || '').trim().match(/^(\d{4}-\d{2})/);
  return closing ? closing[1] : '';
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

const normalizedPaymentText = (value) => String(value == null ? '' : value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const dateOnly = (value) => {
  const match = String(value == null ? '' : value).trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
};

const shiftDate = (value, days) => {
  const date = dateOnly(value);
  if (!date) return '';
  const parsed = new Date(date + 'T00:00:00Z');
  if (Number.isNaN(parsed.getTime())) return '';
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
};

const matchesExactBankBillPayment = (bill = {}, transactions = []) => {
  const totalCents = Math.abs(amountToCents(bill.totalAmount));
  const closingDate = dateOnly(bill.billClosingDate);
  const dueDate = dateOnly(bill.dueDate);
  if (!totalCents || (!closingDate && !dueDate)) return null;

  const startDate = shiftDate(closingDate || shiftDate(dueDate, -45), -3);
  const endDate = shiftDate(dueDate || shiftDate(closingDate, 45), 15);
  if (!startDate || !endDate) return null;

  const matches = (Array.isArray(transactions) ? transactions : []).filter(transaction => {
    const amountCents = Math.abs(amountToCents(
      transaction?.amountInAccountCurrency ?? transaction?.amount
    ));
    if (amountCents !== totalCents) return false;

    const type = normalizedPaymentText(transaction?.type);
    if (['credit', 'income', 'refund', 'estorno'].includes(type)) return false;

    const operation = normalizedPaymentText(transaction?.operationType);
    const description = normalizedPaymentText([
      transaction?.description,
      transaction?.descriptionRaw,
      transaction?.operationType,
    ].filter(Boolean).join(' '));

    // Do not treat refunds, reversals, or card purchases as invoice payments.
    if (/\b(refund|estorno|chargeback|reversao|cancelamento)\b/.test(operation + ' ' + description)) {
      return false;
    }

    const referencesCardOrBill = /\b(fatura|cartao|credito|card|bill)\b/.test(description);
    const referencesPayment = /\b(pagamento|pagto|pgto|payment|quitar|quitacao|debito automatico)\b/.test(description)
      || /\b(pagamento|payment)\b/.test(operation);
    if (!referencesCardOrBill || !referencesPayment) return false;

    const date = dateOnly(transaction?.date);
    return Boolean(date && date >= startDate && date <= endDate);
  });

  // Require one exact, date-compatible payment to avoid a false positive.
  return matches.length === 1 ? matches[0] : null;
};

/**
 * Determines whether a Pluggy bill has credible evidence of full settlement.
 *
 * Pluggy can explicitly classify a payment as FULL_PAYMENT even if the raw
 * amount differs slightly from the bill total. Its docs also describe verifying
 * bill N using payments in bill N+1, including finance charges in that next cycle.
 */
export const resolveBillPaymentSettlement = (bill = {}, allBills = [], bankTransactions = []) => {
  const totalCents = Math.abs(amountToCents(bill.totalAmount));
  const providerPaidCents = sumPaymentsCents(bill);
  const payments = Array.isArray(bill.payments) ? bill.payments : [];

  if (totalCents > 0 && payments.some(payment => (
    String(payment?.valueType || '').toUpperCase().replace(/[^A-Z]/g, '') === 'FULLPAYMENT'
  ))) {
    return {
      settled: true,
      totalCents,
      providerPaidCents,
      paidCents: totalCents,
      source: 'CURRENT_FULL_PAYMENT',
      evidenceBillId: bill.id || null,
      evidenceCents: providerPaidCents,
    };
  }

  if (totalCents > 0 && providerPaidCents >= totalCents) {
    return {
      settled: true,
      totalCents,
      providerPaidCents,
      paidCents: totalCents,
      source: 'CURRENT_PAYMENT_TOTAL',
      evidenceBillId: bill.id || null,
      evidenceCents: providerPaidCents,
    };
  }

  // The card statement may be fully paid even when Pluggy's bill.payments
  // metadata under-reports the amount. An exact matching bank debit for the
  // statement total is independent evidence; refunds must never count as payment.
  const exactBankPayment = matchesExactBankBillPayment(bill, bankTransactions);
  if (totalCents > 0 && exactBankPayment) {
    const evidenceCents = Math.abs(amountToCents(
      exactBankPayment.amountInAccountCurrency ?? exactBankPayment.amount
    ));
    return {
      settled: true,
      totalCents,
      providerPaidCents,
      paidCents: totalCents,
      source: 'BANK_TRANSACTION_EXACT_TOTAL',
      evidenceBillId: bill.id || null,
      evidenceCents,
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
      const requiredPaymentCents = totalCents + nextCycleChargesCents;

      if (nextCyclePaymentsCents >= requiredPaymentCents) {
        return {
          settled: true,
          totalCents,
          providerPaidCents,
          paidCents: totalCents,
          source: 'NEXT_CYCLE_SETTLEMENT',
          evidenceBillId: nextCycleBill.id || null,
          evidenceCents: nextCyclePaymentsCents,
        };
      }
    }
  }

  return {
    settled: false,
    totalCents,
    providerPaidCents,
    paidCents: providerPaidCents,
    source: providerPaidCents > 0 ? 'CURRENT_PARTIAL_PAYMENTS' : null,
    evidenceBillId: bill.id || null,
    evidenceCents: providerPaidCents,
  };
};
