import test from 'node:test';
import assert from 'node:assert/strict';
import { getBillTransactions, transactionBelongsToBill } from '../src/financial/billTransactionMatching.js';

const card = { id: 'card-1', providerAccountId: 'account-1' };
const juneBill = { id: 'bill-june', providerBillId: 'provider-june', cardId: card.id, referenceMonth: '2026-06' };
const octoberBill = { id: 'bill-october', providerBillId: 'provider-october', cardId: card.id, referenceMonth: '2026-10' };

const installment = (number, cycle, extra = {}) => ({
  id: 'tx-' + number + '-' + (cycle || 'no-cycle'),
  source: 'PLUGGY_REBUILT',
  provider: 'PLUGGY',
  providerTransactionId: 'provider-tx-' + number,
  providerAccountId: card.providerAccountId,
  accountId: card.id,
  cardId: card.id,
  accountType: 'CREDIT_CARD',
  isCreditCardTransaction: true,
  type: 'EXPENSE',
  amountCents: 12500,
  merchant: 'Loja de Exemplo',
  normalizedMerchant: 'loja de exemplo',
  description: 'Loja de Exemplo parcela ' + number + '/24',
  creditCardInstallmentNumber: number,
  creditCardTotalInstallments: 24,
  creditCardPurchaseDate: '2024-11-12',
  creditCardBillForecastDate: cycle || null,
  ...extra,
});

test('associa pela data explícita do ciclo da fatura', () => {
  const tx = installment(23, '2026-10');
  assert.equal(transactionBelongsToBill(tx, octoberBill, card, [tx], [juneBill, octoberBill]), true);
  assert.equal(transactionBelongsToBill(tx, juneBill, card, [tx], [juneBill, octoberBill]), false);
});

test('respeita o vínculo local explícito mesmo quando o mês sugere outra fatura', () => {
  const tx = installment(23, '2026-06', { billId: octoberBill.id });
  assert.equal(transactionBelongsToBill(tx, juneBill, card, [tx], [juneBill, octoberBill]), false);
  assert.equal(transactionBelongsToBill(tx, octoberBill, card, [tx], [juneBill, octoberBill]), true);
});

test('associa parcela sem ciclo a partir da sequência da mesma compra', () => {
  const juneInstallment = installment(19, null);
  const octoberInstallment = installment(23, '2026-10');
  const transactions = [juneInstallment, octoberInstallment];

  assert.deepEqual(
    getBillTransactions(juneBill, card, transactions, [juneBill, octoberBill]).map(tx => tx.id),
    [juneInstallment.id]
  );
  assert.deepEqual(
    getBillTransactions(octoberBill, card, transactions, [juneBill, octoberBill]).map(tx => tx.id),
    [octoberInstallment.id]
  );
});

test('não associa quando a assinatura da compra não coincide', () => {
  const juneInstallment = installment(19, null);
  const octoberInstallment = installment(23, '2026-10', {
    creditCardPurchaseDate: '2024-11-13',
  });
  assert.equal(
    transactionBelongsToBill(
      juneInstallment,
      juneBill,
      card,
      [juneInstallment, octoberInstallment],
      [juneBill, octoberBill]
    ),
    false
  );
});

test('não infere o mês quando âncoras da mesma compra entram em conflito', () => {
  const juneInstallment = installment(19, null);
  const octoberInstallment = installment(23, '2026-10');
  const conflictingInstallment = installment(23, '2026-09', { id: 'tx-23-conflict' });
  const septemberBill = {
    id: 'bill-september',
    providerBillId: 'provider-september',
    cardId: card.id,
    referenceMonth: '2026-09',
  };

  assert.equal(
    transactionBelongsToBill(
      juneInstallment,
      juneBill,
      card,
      [juneInstallment, octoberInstallment, conflictingInstallment],
      [juneBill, octoberBill, septemberBill]
    ),
    false
  );
});

test('não inventa parcela ausente quando não existe transação real de junho', () => {
  const octoberInstallment = installment(23, '2026-10');
  assert.deepEqual(
    getBillTransactions(juneBill, card, [octoberInstallment], [juneBill, octoberBill]),
    []
  );
});
