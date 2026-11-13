import test from 'node:test';
import assert from 'node:assert/strict';
import { getInstallmentDetails, isInstallmentCreditTransaction } from '../src/financial/creditCardImport.js';

test('identifica uma parcela com metadados completos da Pluggy', () => {
  const transaction = {
    creditCardMetadata: {
      paymentType: 'INSTALLMENT',
      installmentNumber: 3,
      totalInstallments: 10,
    },
  };
  assert.deepEqual(getInstallmentDetails(transaction), {
    installmentNumber: 3,
    totalInstallments: 10,
    paymentType: 'INSTALLMENT',
  });
  assert.equal(isInstallmentCreditTransaction(transaction), true);
});

test('aceita parcelas válidas mesmo quando a instituição omite paymentType', () => {
  assert.equal(isInstallmentCreditTransaction({
    creditCardMetadata: { installmentNumber: 2, totalInstallments: 6 },
  }), true);
});

test('não importa compras à vista mesmo se vierem com contagem inconsistente', () => {
  assert.equal(isInstallmentCreditTransaction({
    creditCardMetadata: {
      paymentType: 'SINGLE',
      installmentNumber: 1,
      totalInstallments: 12,
    },
  }), false);
});

test('não trata uma compra em parcela única como compra parcelada', () => {
  assert.equal(isInstallmentCreditTransaction({
    creditCardMetadata: { paymentType: 'INSTALLMENT', installmentNumber: 1, totalInstallments: 1 },
  }), false);
});

test('rejeita metadados incompletos ou inválidos', () => {
  assert.equal(isInstallmentCreditTransaction({ creditCardMetadata: { installmentNumber: 0, totalInstallments: 8 } }), false);
  assert.equal(isInstallmentCreditTransaction({ creditCardMetadata: { installmentNumber: 9, totalInstallments: 8 } }), false);
  assert.equal(isInstallmentCreditTransaction({ creditCardMetadata: { installmentNumber: 2, totalInstallments: 0 } }), false);
});
test('reconhece variações acentuadas de compra à vista', () => {
  assert.equal(isInstallmentCreditTransaction({
    creditCardMetadata: {
      paymentType: 'À vista',
      installmentNumber: 1,
      totalInstallments: 10,
    },
  }), false);
});
test('identifica parcelamento quando a instituição só informa n/n na descrição', () => {
  assert.deepEqual(getInstallmentDetails({
    description: 'COMPRA NA LOJA DO FULANO 3/10',
  }), {
    installmentNumber: 3,
    totalInstallments: 10,
    paymentType: '',
  });
});

test('metadado explícito à vista prevalece sobre texto com aparência de parcela', () => {
  assert.equal(isInstallmentCreditTransaction({
    creditCardMetadata: { paymentType: 'SINGLE' },
    description: 'COMPRA 1/10',
  }), false);
});

test('rejeita uma sequência numérica longa que não pode ser um plano de cartão válido', () => {
  assert.equal(isInstallmentCreditTransaction({
    description: 'MODELO 14/128',
  }), false);
});

test('usa a descrição como fallback quando a instituição envia contadores zerados', () => {
  assert.deepEqual(getInstallmentDetails({
    creditCardMetadata: { installmentNumber: 0, totalInstallments: 0 },
    description: 'COMPRA 2/8',
  }), {
    installmentNumber: 2,
    totalInstallments: 8,
    paymentType: '',
  });
});

test('aceita planos longos quando a quantidade foi informada explicitamente pelo provedor', () => {
  assert.equal(isInstallmentCreditTransaction({
    creditCardMetadata: { paymentType: 'INSTALLMENT', installmentNumber: 1, totalInstallments: 60 },
  }), true);
});
