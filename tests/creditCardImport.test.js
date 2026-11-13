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
