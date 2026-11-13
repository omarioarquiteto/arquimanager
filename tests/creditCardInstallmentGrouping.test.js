import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInstallmentPurchases } from '../src/financial/creditCardInstallmentGrouping.js';
import { buildCreditCardPurchaseId } from '../src/financial/creditCardPurchaseIdentity.js';

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

test('agrupa pela descrição n/n quando a Pluggy não preenche os campos numéricos', () => {
  const purchases = buildInstallmentPurchases([
    {
      cardId: 'mercado-pago-card',
      accountType: 'CREDIT_CARD',
      type: 'EXPENSE',
      description: 'MERCADOPAGO*LOJA 1/5',
      amountCents: 9900,
      date: '2026-04-12',
    },
    {
      cardId: 'mercado-pago-card',
      accountType: 'CREDIT_CARD',
      type: 'EXPENSE',
      description: 'MERCADOPAGO*LOJA 2/5',
      amountCents: 9900,
      date: '2026-05-12',
    },
  ]);

  assert.equal(purchases.length, 1);
  assert.equal(purchases[0].totalInstallments, 5);
  assert.equal(purchases[0].observedInstallments, 2);
});

test('une a mesma compra quando a descrição vem abreviada ou com o nome repetido', () => {
  const purchases = buildInstallmentPurchases([
    tx(1, '2026-11-08', {
      id: 'mercado-pago-abbreviated',
      description: 'MERCADOLIVRE*MERC 1 de 2',
      amountCents: 4250,
      creditCardTotalInstallments: 2,
    }),
    tx(1, '2026-11-08', {
      id: 'mercado-pago-full',
      description: 'MERCADOLIVRE*MERCADOLIVRE 1 de 2',
      amountCents: 4250,
      creditCardTotalInstallments: 2,
    }),
  ]);

  assert.equal(purchases.length, 1);
  assert.equal(purchases[0].observedInstallments, 1);
  assert.equal(purchases[0].purchaseTotalCents, 8500);
  assert.equal(purchases[0].description, 'MERCADOLIVRE*MERCADOLIVRE');
});

test('gera o mesmo código interno para parcelas da mesma compra mesmo com descrições diferentes', () => {
  const purchaseDateTime = '2026-11-08T13:42:18.000Z';
  const common = {
    creditCardPurchaseDateTime: purchaseDateTime,
    creditCardCardLast4: '4321',
    creditCardMerchantCnpj: '12345678000199',
    creditCardTotalInstallments: 2,
  };
  const firstInstallment = tx(1, '2026-11-08', {
    ...common,
    description: 'MERCADOLIVRE*MERC',
    amountCents: 4250,
  });
  const secondInstallment = tx(2, '2026-12-08', {
    ...common,
    description: 'MERCADOLIVRE*MERCADOLIVRE',
    amountCents: 4250,
  });

  const firstCode = buildCreditCardPurchaseId({
    transaction: firstInstallment,
    cardId: firstInstallment.cardId,
  });
  const secondCode = buildCreditCardPurchaseId({
    transaction: secondInstallment,
    cardId: secondInstallment.cardId,
  });

  assert.ok(firstCode.startsWith('CMP-'));
  assert.equal(firstCode, secondCode);

  const purchases = buildInstallmentPurchases([
    { ...firstInstallment, creditCardPurchaseId: firstCode },
    { ...secondInstallment, creditCardPurchaseId: secondCode },
  ]);
  assert.equal(purchases.length, 1);
  assert.equal(purchases[0].purchaseId, firstCode);
  assert.equal(purchases[0].observedInstallments, 2);
  assert.equal(purchases[0].purchaseTotalCents, 8500);
});

test('mantém códigos separados para duas compras do mesmo dia em horários distintos', () => {
  const common = {
    creditCardCardLast4: '4321',
    creditCardMerchantCnpj: '12345678000199',
    creditCardTotalInstallments: 2,
  };
  const first = tx(1, '2026-11-08', {
    ...common,
    creditCardPurchaseDateTime: '2026-11-08T13:42:18.000Z',
    amountCents: 4250,
  });
  const second = tx(1, '2026-11-08', {
    ...common,
    creditCardPurchaseDateTime: '2026-11-08T17:08:02.000Z',
    amountCents: 4250,
  });

  assert.notEqual(
    buildCreditCardPurchaseId({ transaction: first, cardId: first.cardId }),
    buildCreditCardPurchaseId({ transaction: second, cardId: second.cardId })
  );
});
