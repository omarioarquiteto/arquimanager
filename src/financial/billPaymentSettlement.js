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

/**
 * Determines whether a Pluggy bill has credible evidence of full settlement.
 *
 * Pluggy can explicitly classify a payment as FULL_PAYMENT even if the raw
 * amount differs slightly from the bill total. Its docs also describe verifying
 * bill N using payments in bill N+1, including finance charges in that next cycle.
 */
export const resolveBillPaymentSettlement = (bill = {}, allBills = []) => {
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
