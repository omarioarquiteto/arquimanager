import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInstallmentPurchases } from '../src/financial/creditCardInstallmentGrouping.js';

const tx = (number, date, extra = {}) => ({
  id: `tx-${number}-${date}`,
  cardId: 'mercado-pago-card',
  accountType: 'CREDIT_CARD',
  type: 'EXPENSE',
  description: `MERCADOPAGO*LOJA ${number}/10`,
  amountCents: 12500,
  date,
  creditCardInstallmentNumber: number,
  creditCardTotalInstallments: 10,
  ...extra,
});

test('agrupa as parcelas da mesma compra removendo o sufixo n/n antes de normalizar', () => {
  const purchases = buildInstallmentPurchases([
    tx(1, '2026-01-12'),
    tx(2, '2026-02-12'),
    tx(3, '2026-03-12'),
  ]);

  assert.equal(purchases.length, 1);
  assert.equal(purchases[0].observedInstallments, 3);
  assert.deepEqual(purchases[0].monthly, {
    '2026-01': 12500,
    '2026-02': 12500,
    '2026-03': 12500,
  });
});

test('agrupa parcelas quando o dia de postagem muda entre meses', () => {
  const purchases = buildInstallmentPurchases([
    tx(1, '2026-01-31'),
    tx(2, '2026-02-28'),
    tx(3, '2026-03-31'),
  ]);

  assert.equal(purchases.length, 1);
  assert.equal(purchases[0].observedInstallments, 3);
});

test('remove também a palavra parcela antes de criar a identidade da compra', () => {
  const purchases = buildInstallmentPurchases([
    tx(1, '2026-01-10', { description: 'COMPRA LOJA ABC parcela 1/6', creditCardTotalInstallments: 6 }),
    tx(2, '2026-02-10', { description: 'COMPRA LOJA ABC parcela 2/6', creditCardTotalInstallments: 6 }),
  ]);

  assert.equal(purchases.length, 1);
  assert.equal(purchases[0].description, 'COMPRA LOJA ABC');
});

test('mantém separadas compras diferentes do mesmo estabelecimento e mês quando o valor difere', () => {
  const purchases = buildInstallmentPurchases([
    tx(1, '2026-01-10', { description: 'MERCADOPAGO*LOJA 1/6', creditCardTotalInstallments: 6, amountCents: 10000 }),
    tx(1, '2026-01-15', { description: 'MERCADOPAGO*LOJA 1/6', creditCardTotalInstallments: 6, amountCents: 25000 }),
    tx(2, '2026-02-10', { description: 'MERCADOPAGO*LOJA 2/6', creditCardTotalInstallments: 6, amountCents: 10000 }),
    tx(2, '2026-02-15', { description: 'MERCADOPAGO*LOJA 2/6', creditCardTotalInstallments: 6, amountCents: 25000 }),
  ]);

  assert.equal(purchases.length, 2);
  assert.deepEqual(purchases.map(item => item.referenceAmountCents), [undefined, undefined]);
  assert.deepEqual(purchases.map(item => item.purchaseTotalCents).sort((a, b) => a - b), [60000, 150000]);
});

test('não duplica a mesma parcela retornada em dois ciclos de sincronização', () => {
  const purchases = buildInstallmentPurchases([
    tx(2, '2026-02-12'),
    tx(2, '2026-02-12', { id: 'duplicate-pending', status: 'PENDING' }),
  ]);

  assert.equal(purchases.length, 1);
  assert.equal(purchases[0].observedInstallments, 1);
  assert.equal(purchases[0].monthly['2026-02'], 12500);
});

test('não mistura cartões diferentes', () => {
  const purchases = buildInstallmentPurchases([
    tx(1, '2026-01-12'),
    tx(2, '2026-02-12', { cardId: 'another-card' }),
  ]);

  assert.equal(purchases.length, 2);
});

test('usa o total informado pelo provedor quando disponível', () => {
  const purchases = buildInstallmentPurchases([
    tx(1, '2026-01-12', { creditCardTotalAmountCents: 125000 }),
    tx(2, '2026-02-12', { creditCardTotalAmountCents: 125000 }),
  ]);

  assert.equal(purchases.length, 1);
  assert.equal(purchases[0].purchaseTotalCents, 125000);
  assert.equal(purchases[0].purchaseTotalEstimated, false);
});
