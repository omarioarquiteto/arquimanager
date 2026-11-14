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

test('mesclagem manual une lançamentos de compras diferentes e conserva os IDs originais', () => {
  const purchases = buildInstallmentPurchases([
    tx(1, '2026-11-08', {
      id: 'doc-mercado-1',
      description: 'MERCADOLIVRE*MERC 1/6',
      amountCents: 4250,
      creditCardTotalInstallments: 6,
      manualPurchaseGroupId: 'manual-same-purchase',
    }),
    tx(2, '2026-12-08', {
      id: 'doc-mercado-2',
      description: 'MERCADOLIVRE*MERCADOLIVRE 2/6',
      amountCents: 4250,
      creditCardTotalInstallments: 6,
      manualPurchaseGroupId: 'manual-same-purchase',
    }),
  ]);

  assert.equal(purchases.length, 1);
  assert.equal(purchases[0].manuallyMerged, true);
  assert.equal(purchases[0].manualPurchaseGroupId, 'manual-same-purchase');
  assert.equal(purchases[0].observedInstallments, 2);
  assert.deepEqual(purchases[0].transactionIds.sort(), ['doc-mercado-1', 'doc-mercado-2']);
  assert.deepEqual(purchases[0].monthly, {
    '2026-11': 4250,
    '2026-12': 4250,
  });
});

test('uma mesclagem manual também incorpora parcelas futuras da mesma referência original', () => {
  const first = tx(1, '2026-11-08', {
    id: 'doc-loja-a-1',
    description: 'LOJA A 1/6',
    creditCardTotalInstallments: 6,
  });
  const second = tx(2, '2026-12-08', {
    id: 'doc-loja-b-2',
    description: 'LOJA B 2/6',
    creditCardTotalInstallments: 6,
  });
  const aliases = Array.from(new Set([
    ...buildInstallmentPurchases([first])[0].manualPurchaseGroupAliases,
    ...buildInstallmentPurchases([second])[0].manualPurchaseGroupAliases,
  ]));
  const merged = [
    { ...first, manualPurchaseGroupId: 'manual-abc', manualPurchaseGroupAliases: aliases },
    { ...second, manualPurchaseGroupId: 'manual-abc', manualPurchaseGroupAliases: aliases },
  ];
  const futureInstallment = tx(3, '2027-01-08', {
    id: 'doc-loja-a-3',
    description: 'LOJA A 3/6',
    creditCardTotalInstallments: 6,
  });

  const purchases = buildInstallmentPurchases([...merged, futureInstallment]);

  assert.equal(purchases.length, 1);
  assert.equal(purchases[0].manuallyMerged, true);
  assert.equal(purchases[0].observedInstallments, 3);
  assert.deepEqual(purchases[0].transactionIds.sort(), [
    'doc-loja-a-1',
    'doc-loja-a-3',
    'doc-loja-b-2',
  ]);
});

test('completa 10 parcelas ausentes e faz a soma fechar exatamente com o total da compra', () => {
  const purchases = buildInstallmentPurchases([
    tx(1, '2026-01-10', {
      id: 'purchase-ten-1',
      creditCardTotalInstallments: 10,
      creditCardTotalAmountCents: 10001,
      amountCents: 1000,
    }),
    tx(2, '2026-02-10', {
      id: 'purchase-ten-2',
      creditCardTotalInstallments: 10,
      creditCardTotalAmountCents: 10001,
      amountCents: 1000,
    }),
  ]);

  const purchase = purchases[0];
  assert.equal(purchases.length, 1);
  assert.equal(purchase.totalInstallments, 10);
  assert.equal(purchase.observedInstallments, 2);
  assert.equal(purchase.projectedInstallments, 8);
  assert.equal(purchase.installmentSchedule.length, 10);
  assert.equal(purchase.installmentSchedule.filter(item => item.projected).length, 8);
  assert.ok(purchase.installmentSchedule.filter(item => item.projected).every(item => !item.transactionId));
  assert.equal(purchase.planSumCents, 10001);
  assert.equal(
    purchase.installmentSchedule.reduce((sum, item) => sum + item.amountCents, 0),
    purchase.purchaseTotalCents
  );
  assert.equal(Object.keys(purchase.monthly).length, 10);
});

test('completa planos de 18 parcelas mesmo quando só uma parcela foi importada', () => {
  const purchase = buildInstallmentPurchases([
    tx(1, '2026-03-15', {
      id: 'purchase-eighteen-1',
      creditCardTotalInstallments: 18,
      creditCardTotalAmountCents: 17999,
      amountCents: 1000,
    }),
  ])[0];

  assert.equal(purchase.totalInstallments, 18);
  assert.equal(purchase.observedInstallments, 1);
  assert.equal(purchase.projectedInstallments, 17);
  assert.equal(purchase.installmentSchedule.length, 18);
  assert.equal(purchase.planSumCents, 17999);
  assert.equal(Object.keys(purchase.monthly).length, 18);
});

test('quando todas as parcelas chegaram sem total do provedor, usa a soma real como total', () => {
  const purchase = buildInstallmentPurchases([
    tx(1, '2026-01-10', {
      creditCardTotalInstallments: 3,
      amountCents: 3333,
    }),
    tx(2, '2026-02-10', {
      creditCardTotalInstallments: 3,
      amountCents: 3333,
    }),
    tx(3, '2026-03-10', {
      creditCardTotalInstallments: 3,
      amountCents: 3334,
    }),
  ])[0];

  assert.equal(purchase.observedInstallments, 3);
  assert.equal(purchase.projectedInstallments, 0);
  assert.equal(purchase.purchaseTotalCents, 10000);
  assert.equal(purchase.purchaseTotalEstimated, false);
  assert.equal(purchase.planSumCents, purchase.purchaseTotalCents);
});

test('ajusta apenas a visualização quando o total do provedor diverge da soma das parcelas importadas', () => {
  const purchase = buildInstallmentPurchases([
    tx(1, '2026-01-10', {
      creditCardTotalInstallments: 3,
      creditCardTotalAmountCents: 2900,
      amountCents: 1000,
    }),
    tx(2, '2026-02-10', {
      creditCardTotalInstallments: 3,
      creditCardTotalAmountCents: 2900,
      amountCents: 1000,
    }),
    tx(3, '2026-03-10', {
      creditCardTotalInstallments: 3,
      creditCardTotalAmountCents: 2900,
      amountCents: 1000,
    }),
  ])[0];

  assert.equal(purchase.purchaseTotalCents, 2900);
  assert.equal(purchase.planSumCents, 2900);
  assert.equal(purchase.amountsAdjusted, true);
  assert.deepEqual(
    purchase.installmentSchedule.map(item => item.amountCents),
    [967, 967, 966]
  );
});

test('completa plano de 8 parcelas e mantém a soma exata em centavos', () => {
  const purchase = buildInstallmentPurchases([
    tx(1, '2026-05-10', {
      creditCardTotalInstallments: 8,
      creditCardTotalAmountCents: 8003,
      amountCents: 1000,
    }),
    tx(2, '2026-06-10', {
      creditCardTotalInstallments: 8,
      creditCardTotalAmountCents: 8003,
      amountCents: 1000,
    }),
  ])[0];

  assert.equal(purchase.installmentSchedule.length, 8);
  assert.equal(purchase.projectedInstallments, 6);
  assert.equal(purchase.planSumCents, 8003);
  assert.equal(purchase.monthly['2026-07'], 1001);
  assert.equal(
    Object.values(purchase.monthly).reduce((sum, value) => sum + value, 0),
    purchase.purchaseTotalCents
  );
});
