import test from 'node:test';
import assert from 'node:assert/strict';
import { getCorrectedTransactionBillProviderId } from '../src/financial/billTransactionMatching.js';

const bills = [
  {
    id: 'bill-oct',
    accountId: 'c6-card',
    billForecastDate: '2026-10',
    billClosingDate: '2026-09-25',
  },
  {
    id: 'bill-nov',
    accountId: 'c6-card',
    billForecastDate: '2026-11',
    billClosingDate: '2026-10-25',
  },
  {
    id: 'bill-dec',
    accountId: 'c6-card',
    billForecastDate: '2026-12',
    billClosingDate: '2026-11-25',
  },
];

test('moves a credit posted after the October close from October to November', () => {
  const refund = {
    accountId: 'c6-card',
    date: '2026-10-08',
    operationType: 'ESTORNO',
    creditCardMetadata: {
      billId: 'bill-oct',
      billForecastDate: '2026-10',
      billPostDate: '2026-10-08',
    },
  };

  assert.equal(
    getCorrectedTransactionBillProviderId(refund, 'c6-card', bills),
    'bill-nov',
  );
});

test('uses posting date to assign a refund even when the provider omits billId', () => {
  const refund = {
    accountId: 'c6-card',
    date: '2026-10-08',
    operationType: 'ESTORNO',
    creditCardMetadata: {
      billForecastDate: '2026-10',
      billPostDate: '2026-10-08',
    },
  };

  assert.equal(
    getCorrectedTransactionBillProviderId(refund, 'c6-card', bills),
    'bill-nov',
  );
});

test('does not move a transaction posted on or before the linked bill close date', () => {
  const transaction = {
    accountId: 'c6-card',
    date: '2026-09-25',
    creditCardMetadata: {
      billId: 'bill-oct',
      billForecastDate: '2026-10',
      billPostDate: '2026-09-25',
    },
  };

  assert.equal(
    getCorrectedTransactionBillProviderId(transaction, 'c6-card', bills),
    '',
  );
});

test('chooses the first subsequent bill whose close date is on or after posting', () => {
  const refund = {
    accountId: 'c6-card',
    date: '2026-10-29',
    operationType: 'ESTORNO',
    creditCardMetadata: {
      billId: 'bill-oct',
      billForecastDate: '2026-10',
      billPostDate: '2026-10-29',
    },
  };

  assert.equal(
    getCorrectedTransactionBillProviderId(refund, 'c6-card', bills),
    'bill-dec',
  );
});

test('does not attach a transaction to a bill from another card account', () => {
  const refund = {
    accountId: 'another-card',
    date: '2026-10-08',
    operationType: 'ESTORNO',
    creditCardMetadata: {
      billId: 'bill-oct',
      billForecastDate: '2026-10',
      billPostDate: '2026-10-08',
    },
  };

  assert.equal(
    getCorrectedTransactionBillProviderId(refund, 'another-card', bills),
    '',
  );
});


test('uses the real movement date when Pluggy billPostDate metadata is stale', () => {
  const refund = {
    accountId: 'c6-card',
    date: '2026-10-08',
    operationType: 'ESTORNO',
    creditCardMetadata: {
      billId: 'bill-oct',
      billForecastDate: '2026-10',
      billPostDate: '2026-09-08',
    },
  };

  assert.equal(
    getCorrectedTransactionBillProviderId(refund, 'c6-card', bills),
    'bill-nov',
  );
});

test('prioritizes an explicit November forecast over a stale October billId', () => {
  const billsWithStaleLink = [
    {
      id: 'bill-oct',
      accountId: 'c6-card',
      billForecastDate: '2026-10',
      billClosingDate: '2026-10-25',
    },
    {
      id: 'bill-nov',
      accountId: 'c6-card',
      billForecastDate: '2026-11',
      billClosingDate: '2026-11-25',
    },
  ];
  const refund = {
    accountId: 'c6-card',
    date: '2026-10-08',
    operationType: 'ESTORNO',
    creditCardMetadata: {
      billId: 'bill-oct',
      billForecastDate: '2026-11',
      billPostDate: '2026-09-08',
    },
  };

  assert.equal(
    getCorrectedTransactionBillProviderId(refund, 'c6-card', billsWithStaleLink),
    'bill-nov',
  );
});

test('reads nested provider metadata when the normalized field is absent', () => {
  const refund = {
    accountId: 'c6-card',
    date: '2026-10-08',
    providerRawData: {
      creditCardMetadata: {
        billId: 'bill-oct',
        billForecastDate: '2026-11',
        billPostDate: '2026-09-08',
      },
    },
  };

  assert.equal(
    getCorrectedTransactionBillProviderId(refund, 'c6-card', bills),
    'bill-nov',
  );
});
