import test from 'node:test';
import assert from 'node:assert/strict';
import { isRefundCreditTransaction, resolveBillPaymentSettlement } from '../src/financial/billPaymentSettlement.js';

test('uses Pluggy FULL_PAYMENT signal when its reported amount differs slightly from invoice total', () => {
  const bill = {
    id: 'bill-2026-10',
    accountId: 'c6-card',
    billForecastDate: '2026-10',
    totalAmount: 4782.62,
    payments: [{
      id: 'payment-full',
      valueType: 'FULL_PAYMENT',
      amount: 4776.79,
    }],
  };

  const result = resolveBillPaymentSettlement(bill, [bill]);

  assert.equal(result.settled, true);
  assert.equal(result.source, 'CURRENT_FULL_PAYMENT');
  assert.equal(result.totalCents, 478262);
  assert.equal(result.providerPaidCents, 477679);
  assert.equal(result.paidCents, 478262);
});

test('does not treat a minimum payment as a fully settled bill', () => {
  const bill = {
    id: 'bill-minimum',
    accountId: 'c6-card',
    billForecastDate: '2026-10',
    totalAmount: 4782.62,
    payments: [{
      id: 'payment-minimum',
      valueType: 'MINIMUM_PAYMENT',
      amount: 4776.79,
    }],
  };

  const result = resolveBillPaymentSettlement(bill, [bill]);

  assert.equal(result.settled, false);
  assert.equal(result.source, 'CURRENT_PARTIAL_PAYMENTS');
  assert.equal(result.paidCents, 477679);
});

test('confirms a previous bill using next-cycle payments and next-cycle finance charges', () => {
  const previousBill = {
    id: 'bill-2026-09',
    accountId: 'c6-card',
    billForecastDate: '2026-09',
    totalAmount: 5000,
    payments: [],
  };
  const nextBill = {
    id: 'bill-2026-10',
    accountId: 'c6-card',
    billForecastDate: '2026-10',
    totalAmount: 1000,
    payments: [{ id: 'next-payment', valueType: 'OTHER', amount: 5005.83 }],
    financeCharges: [{ id: 'charge', amount: 5.83 }],
  };

  const result = resolveBillPaymentSettlement(previousBill, [previousBill, nextBill]);

  assert.equal(result.settled, true);
  assert.equal(result.source, 'NEXT_CYCLE_SETTLEMENT');
  assert.equal(result.evidenceBillId, 'bill-2026-10');
  assert.equal(result.paidCents, 500000);
});

test('does not match next-cycle payments from a different account', () => {
  const previousBill = {
    id: 'bill-2026-09',
    accountId: 'c6-card',
    billForecastDate: '2026-09',
    totalAmount: 5000,
    payments: [],
  };
  const unrelatedBill = {
    id: 'other-account-bill-2026-10',
    accountId: 'different-card',
    billForecastDate: '2026-10',
    totalAmount: 1000,
    payments: [{ id: 'other-payment', amount: 5005.83 }],
    financeCharges: [{ id: 'charge', amount: 5.83 }],
  };

  const result = resolveBillPaymentSettlement(previousBill, [previousBill, unrelatedBill]);

  assert.equal(result.settled, false);
  assert.equal(result.paidCents, 0);
});

test('recognizes an October refund of R$ 5.83 as a credit reducing the net bill amount', () => {
  const bill = {
    id: 'bill-2026-10',
    accountId: 'c6-card',
    billForecastDate: '2026-10',
    totalAmount: 4782.62,
    payments: [{ id: 'payment', valueType: 'OTHER', amount: 4776.79 }],
  };
  const refund = {
    id: 'refund-583',
    accountId: 'c6-card',
    type: 'CREDIT',
    operationType: 'ESTORNO',
    description: 'Refund',
    amount: 5.83,
    creditCardMetadata: {
      billId: 'bill-2026-10',
      billForecastDate: '2026-10',
    },
  };

  const result = resolveBillPaymentSettlement(bill, [bill], [refund]);

  assert.equal(isRefundCreditTransaction(refund), true);
  assert.equal(result.settled, true);
  assert.equal(result.source, 'CURRENT_REFUND_NETTING');
  assert.equal(result.totalCents, 478262);
  assert.equal(result.effectiveTotalCents, 477679);
  assert.equal(result.providerPaidCents, 477679);
  assert.equal(result.paidCents, 477679);
  assert.equal(result.recognizedRefundCents, 583);
  assert.equal(result.appliedRefundCents, 583);
  assert.deepEqual(result.refundTransactionIds, ['refund-583']);
});

test('does not apply a refund belonging to another card or billing cycle', () => {
  const bill = {
    id: 'bill-2026-10',
    accountId: 'c6-card',
    billForecastDate: '2026-10',
    totalAmount: 4782.62,
    payments: [{ id: 'payment', valueType: 'OTHER', amount: 4776.79 }],
  };
  const refunds = [
    {
      id: 'wrong-account-refund',
      accountId: 'different-card',
      type: 'CREDIT',
      description: 'Refund',
      amount: 5.83,
      creditCardMetadata: { billId: 'bill-2026-10', billForecastDate: '2026-10' },
    },
    {
      id: 'wrong-month-refund',
      accountId: 'c6-card',
      type: 'CREDIT',
      description: 'Refund',
      amount: 5.83,
      creditCardMetadata: { billId: 'bill-2026-09', billForecastDate: '2026-09' },
    },
  ];

  const result = resolveBillPaymentSettlement(bill, [bill], refunds);

  assert.equal(result.settled, false);
  assert.equal(result.recognizedRefundCents, 0);
  assert.equal(result.appliedRefundCents, 0);
  assert.equal(result.effectiveTotalCents, 478262);
});

test('does not subtract a refund a second time when the official bill is already fully paid', () => {
  const bill = {
    id: 'bill-2026-10',
    accountId: 'c6-card',
    billForecastDate: '2026-10',
    totalAmount: 4782.62,
    payments: [{ id: 'payment-full', valueType: 'FULL_PAYMENT', amount: 4782.62 }],
  };
  const refund = {
    id: 'refund-583',
    accountId: 'c6-card',
    type: 'CREDIT',
    operationType: 'ESTORNO',
    description: 'Refund',
    amount: 5.83,
    creditCardMetadata: { billId: 'bill-2026-10', billForecastDate: '2026-10' },
  };

  const result = resolveBillPaymentSettlement(bill, [bill], [refund]);

  assert.equal(result.settled, true);
  assert.equal(result.effectiveTotalCents, 478262);
  assert.equal(result.appliedRefundCents, 0);
});
