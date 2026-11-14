import { normalizeText } from './financialEngine.js';

const isIsoDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').slice(0, 10));
const monthOf = value => String(value || '').slice(0, 7);

const shiftMonth = (value, offset) => {
  if (!isIsoDate(value)) return '';
  const [year, month, day] = String(value).slice(0, 10).split('-').map(Number);
  const target = new Date(year, month - 1 + Number(offset || 0), 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return [
    target.getFullYear(),
    String(target.getMonth() + 1).padStart(2, '0'),
    String(Math.min(day, lastDay)).padStart(2, '0'),
  ].join('-');
};

// Remove o sufixo enquanto a barra ainda existe. normalizeText transforma
// "3/10" em "3 10", portanto a ordem das operações é importante.
const stripInstallmentSuffix = value => String(value || '')
  .trim()
  .replace(/\s+(?:(?:parcela|parc(?:ela)?)\s*)?\d+\s*(?:\/|de|of)\s*\d+\s*$/i, '')
  .trim();

// Algumas instituições repetem o nome do estabelecimento no fim do descritor
// ou devolvem uma segunda cópia truncada (ex.: "MERCADOLIVRE MERC").
// Canonicalizamos somente repetições consecutivas e prefixos truncados claros.
const normalizeMerchantDescription = value => {
  const tokens = normalizeText(stripInstallmentSuffix(value)).split(' ').filter(Boolean);
  return tokens.reduce((result, token) => {
    const previous = result[result.length - 1];
    const repeated = previous === token;
    const truncatedRepeat = token.length >= 4
      && previous
      && previous.length >= token.length + 2
      && previous.startsWith(token);
    if (!repeated && !truncatedRepeat) result.push(token);
    return result;
  }, []).join(' ');
};

const creditCardTransaction = transaction => (
  transaction?.accountType === 'CREDIT_CARD'
  || transaction?.isCreditCardTransaction === true
  || Boolean(transaction?.cardId)
);

const amountTolerance = amountCents => Math.max(2, Math.round(Math.abs(Number(amountCents || 0)) * 0.0005));

const amountsCompatible = (left, right) => {
  const a = Math.abs(Number(left || 0));
  const b = Math.abs(Number(right || 0));
  return Math.abs(a - b) <= Math.max(amountTolerance(a), amountTolerance(b));
};

const bestInstallmentRecord = (current, candidate) => {
  if (!current) return candidate;
  const rank = record => {
    const status = String(record.status || '').toUpperCase();
    return (status === 'POSTED' ? 4 : status === 'PENDING' ? 2 : 1)
      + (record.hasBillId ? 1 : 0)
      + (record.hasExplicitCycle ? 0.5 : 0);
  };
  return rank(candidate) > rank(current) ? candidate : current;
};

const getInstallmentRecord = transaction => {
  if (!creditCardTransaction(transaction) || transaction.status === 'CANCELLED') return null;

  const metadata = transaction.creditCardMetadata || {};
  const descriptionRaw = String(
    transaction.description || transaction.merchant || transaction.descriptionRaw || ''
  ).trim();
  const descriptionWithoutSuffix = stripInstallmentSuffix(descriptionRaw);
  const description = descriptionWithoutSuffix || String(transaction.merchant || descriptionRaw).trim();
  const descriptionKey = normalizeMerchantDescription(description);
  const descriptionMatch = descriptionRaw.match(/(?:\b(?:parcela|parc)\s*)?(\d+)\s*(?:\/|de|of)\s*(\d+)\s*$/i);
  const metadataInstallmentNumber = Number(
    transaction.creditCardInstallmentNumber ?? metadata.installmentNumber ?? 0
  );
  const metadataTotalInstallments = Number(
    transaction.creditCardTotalInstallments ?? metadata.totalInstallments ?? 0
  );
  const installmentNumber = metadataInstallmentNumber > 0
    ? metadataInstallmentNumber
    : Number(descriptionMatch?.[1] || 0);
  const totalInstallments = metadataTotalInstallments > 0
    ? metadataTotalInstallments
    : Number(descriptionMatch?.[2] || 0);
  const amountCents = Math.abs(Number(transaction.amountCents || 0));
  const cardId = String(transaction.cardId || transaction.accountId || '');
  const transactionDate = String(transaction.date || '').slice(0, 10);

  if (
    !descriptionKey
    || !cardId
    || !isIsoDate(transactionDate)
    || !Number.isInteger(installmentNumber)
    || !Number.isInteger(totalInstallments)
    || totalInstallments < 2
    || installmentNumber < 1
    || installmentNumber > totalInstallments
    || amountCents <= 0
  ) return null;

  const explicitPurchaseDate = String(
    transaction.creditCardPurchaseDate || metadata.purchaseDate || ''
  ).slice(0, 10);
  const purchaseDate = isIsoDate(explicitPurchaseDate)
    ? explicitPurchaseDate
    : shiftMonth(transactionDate, -(installmentNumber - 1));
  if (!purchaseDate) return null;

  // A data de transação pode variar entre a data da compra e a postagem na
  // fatura. Sem data original explícita, a âncora é o mês inferido, não o dia.
  const purchaseAnchor = isIsoDate(explicitPurchaseDate)
    ? `date:${explicitPurchaseDate}`
    : `month:${monthOf(purchaseDate)}`;

  const explicitCycle = String(
    transaction.creditCardBillForecastDate
    || transaction.creditCardBillPostDate
    || metadata.billForecastDate
    || metadata.billPostDate
    || ''
  ).trim();
  const cycleMonth = /^\d{4}-\d{2}$/.test(explicitCycle)
    ? explicitCycle
    : isIsoDate(explicitCycle)
      ? monthOf(explicitCycle)
      : monthOf(transactionDate);
  if (!/^\d{4}-\d{2}$/.test(cycleMonth)) return null;

  const providerTotalAmount = Number(
    transaction.creditCardTotalAmountCents
    ?? (metadata.totalAmount == null ? 0 : Math.round(Number(metadata.totalAmount) * 100))
    ?? 0
  );
  const providerPurchaseTotalCents = Number.isFinite(providerTotalAmount) && providerTotalAmount > 0
    ? Math.abs(providerTotalAmount)
    : 0;

  return {
    cardId,
    description,
    descriptionKey,
    purchaseDate,
    purchaseAnchor,
    totalInstallments,
    amountCents,
    providerPurchaseTotalCents,
    cycleMonth,
    installmentNumber,
    type: String(transaction.type || 'EXPENSE').toUpperCase(),
    transactionId: String(transaction.id || transaction.providerTransactionId || ''),
    providerTransactionId: String(transaction.providerTransactionId || ''),
    manualPurchaseGroupId: String(transaction.manualPurchaseGroupId || ''),
    manualPurchaseGroupAliases: Array.isArray(transaction.manualPurchaseGroupAliases)
      ? transaction.manualPurchaseGroupAliases.map(String).filter(Boolean)
      : [],
    status: String(transaction.providerStatus || transaction.status || '').toUpperCase(),
    hasBillId: Boolean(transaction.providerBillId || transaction.billId || metadata.billId),
    hasExplicitCycle: Boolean(explicitCycle),
  };
};

const automaticGroupBaseKey = record => [
  record.cardId,
  record.descriptionKey,
  record.purchaseAnchor,
  record.totalInstallments,
  record.type,
].join('|');

const manualPurchaseAlias = record => (
  `${automaticGroupBaseKey(record)}|amount:${record.amountCents}`
);

const groupBaseKey = record => record.manualPurchaseGroupId
  ? [record.cardId, 'manual', record.manualPurchaseGroupId, record.type].join('|')
  : automaticGroupBaseKey(record);

const groupAcceptsRecord = (group, record) => {
  if (
    group.manualPurchaseGroupId
    && record.manualPurchaseGroupId
    && group.manualPurchaseGroupId === record.manualPurchaseGroupId
  ) return true;

  if (
    group.providerPurchaseTotalCents > 0
    && record.providerPurchaseTotalCents > 0
    && !amountsCompatible(group.providerPurchaseTotalCents, record.providerPurchaseTotalCents)
  ) return false;

  const existingSlot = group.installmentSlots.get(String(record.installmentNumber));
  if (existingSlot) return amountsCompatible(existingSlot.amountCents, record.amountCents);

  if (group.referenceAmountCents > 0 && !amountsCompatible(group.referenceAmountCents, record.amountCents)) {
    return false;
  }
  return true;
};

export const buildInstallmentPurchases = (transactions = []) => {
  const grouped = new Map();
  const records = (Array.isArray(transactions) ? transactions : [])
    .map(getInstallmentRecord)
    .filter(Boolean);

  // Reaplica os aliases salvos na mesclagem manual a parcelas importadas
  // futuramente, mesmo que ainda não tenham recebido o identificador manual.
  const manualGroupByAlias = new Map();
  records.forEach(record => {
    if (!record.manualPurchaseGroupId) return;
    record.manualPurchaseGroupAliases.forEach(alias => {
      manualGroupByAlias.set(alias, record.manualPurchaseGroupId);
    });
  });
  records.forEach(record => {
    if (record.manualPurchaseGroupId) return;
    const manualGroupId = manualGroupByAlias.get(manualPurchaseAlias(record));
    if (manualGroupId) record.manualPurchaseGroupId = manualGroupId;
  });

  records
    .sort((a, b) => (
      a.purchaseAnchor.localeCompare(b.purchaseAnchor)
      || a.installmentNumber - b.installmentNumber
      || a.cycleMonth.localeCompare(b.cycleMonth)
      || a.transactionId.localeCompare(b.transactionId)
    ))
    .forEach(record => {
      const baseKey = groupBaseKey(record);
      if (!grouped.has(baseKey)) grouped.set(baseKey, []);
      const candidates = grouped.get(baseKey);
      let group = candidates.find(candidate => groupAcceptsRecord(candidate, record));

      if (!group) {
        group = {
          baseKey,
          groupIndex: candidates.length,
          cardId: record.cardId,
          manualPurchaseGroupId: record.manualPurchaseGroupId,
          manualPurchaseGroupAliases: new Set(record.manualPurchaseGroupAliases),
          transactionIds: new Set(),
          description: record.description,
          descriptionKey: record.descriptionKey,
          purchaseDate: record.purchaseDate,
          purchaseAnchor: record.purchaseAnchor,
          totalInstallments: record.totalInstallments,
          providerPurchaseTotalCents: record.providerPurchaseTotalCents,
          referenceAmountCents: record.amountCents,
          installmentSlots: new Map(),
          monthly: {},
          observedInstallments: 0,
          endMonth: '',
        };
        candidates.push(group);
      }

      if (!group.providerPurchaseTotalCents && record.providerPurchaseTotalCents) {
        group.providerPurchaseTotalCents = record.providerPurchaseTotalCents;
      }
      if (record.transactionId) group.transactionIds.add(record.transactionId);
      group.manualPurchaseGroupAliases.add(manualPurchaseAlias(record));
      record.manualPurchaseGroupAliases.forEach(alias => group.manualPurchaseGroupAliases.add(alias));
      if (record.purchaseDate < group.purchaseDate) group.purchaseDate = record.purchaseDate;
      // Quando registros da mesma compra trazem descrições equivalentes,
      // conserva a versão mais completa para exibição na tabela.
      if (record.description.length > group.description.length) {
        group.description = record.description;
      }

      const slotKey = String(record.installmentNumber);
      const candidateSlot = {
        installmentNumber: record.installmentNumber,
        amountCents: record.amountCents,
        cycleMonth: record.cycleMonth,
        transactionId: record.transactionId,
        providerTransactionId: record.providerTransactionId,
        status: record.status,
        hasBillId: record.hasBillId,
        hasExplicitCycle: record.hasExplicitCycle,
      };
      group.installmentSlots.set(
        slotKey,
        bestInstallmentRecord(group.installmentSlots.get(slotKey), candidateSlot)
      );
    });

  return Array.from(grouped.values())
    .flatMap(groups => groups.map(group => {
      const observedByNumber = new Map(group.installmentSlots);
      const installmentNumbers = Array.from(
        { length: group.totalInstallments },
        (_, index) => index + 1
      );
      const missingNumbers = installmentNumbers.filter(number => !observedByNumber.has(String(number)));
      const observedTotalCents = Array.from(observedByNumber.values())
        .reduce((sum, slot) => sum + Number(slot.amountCents || 0), 0);
      const providerTotal = Number(group.providerPurchaseTotalCents || 0);

      // Sem total do provedor, usa as parcelas já observadas e estima cada
      // parcela ausente pelo valor de referência. Quando o plano está completo,
      // o total é a soma real de todas as parcelas recebidas.
      const estimatedTotalCents = missingNumbers.length
        ? observedTotalCents + (Math.abs(Number(group.referenceAmountCents || 0)) * missingNumbers.length)
        : observedTotalCents;
      const purchaseTotalCents = Math.max(
        0,
        Math.round(providerTotal > 0 ? providerTotal : estimatedTotalCents)
      );
      const purchaseTotalEstimated = !(providerTotal > 0) && missingNumbers.length > 0;
      const scheduledAmounts = new Map();
      observedByNumber.forEach((slot, key) => {
        scheduledAmounts.set(Number(key), Number(slot.amountCents || 0));
      });

      let amountsAdjusted = false;
      const remainingCents = purchaseTotalCents - observedTotalCents;
      if (missingNumbers.length > 0 && remainingCents > 0) {
        const baseAmount = Math.floor(remainingCents / missingNumbers.length);
        let extraCents = remainingCents % missingNumbers.length;
        missingNumbers.forEach(number => {
          scheduledAmounts.set(number, baseAmount + (extraCents > 0 ? 1 : 0));
          if (extraCents > 0) extraCents -= 1;
        });
      } else if (missingNumbers.length > 0 || observedTotalCents !== purchaseTotalCents) {
        // Se o total oficial for menor que as parcelas observadas, ou se todos
        // os registros chegarem mas houver divergência, rateia o total informado
        // pelo provedor proporcionalmente, sempre fechando os centavos.
        const weights = installmentNumbers.map(number => (
          Math.max(
            1,
            Number(observedByNumber.get(String(number))?.amountCents || group.referenceAmountCents || 1)
          )
        ));
        const weightTotal = weights.reduce((sum, weight) => sum + weight, 0) || 1;
        const allocations = weights.map(weight => Math.floor(purchaseTotalCents * weight / weightTotal));
        let centsLeft = purchaseTotalCents - allocations.reduce((sum, amount) => sum + amount, 0);
        const remainderOrder = weights
          .map((weight, index) => ({
            index,
            remainder: (purchaseTotalCents * weight) % weightTotal,
          }))
          .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
        for (let index = 0; index < centsLeft; index += 1) {
          allocations[remainderOrder[index % remainderOrder.length].index] += 1;
        }
        installmentNumbers.forEach((number, index) => scheduledAmounts.set(number, allocations[index]));
        amountsAdjusted = missingNumbers.length > 0 || observedTotalCents !== purchaseTotalCents;
      } else {
        missingNumbers.forEach(number => scheduledAmounts.set(number, 0));
      }

      const monthly = {};
      const projectedMonthly = {};
      const installmentSchedule = installmentNumbers.map(number => {
        const importedSlot = observedByNumber.get(String(number));
        const cycleMonth = importedSlot?.cycleMonth
          || monthOf(shiftMonth(group.purchaseDate, number - 1))
          || monthOf(group.purchaseDate);
        const amountCents = Number(scheduledAmounts.get(number) || 0);
        monthly[cycleMonth] = Number(monthly[cycleMonth] || 0) + amountCents;
        if (!importedSlot) {
          projectedMonthly[cycleMonth] = Number(projectedMonthly[cycleMonth] || 0) + amountCents;
        }
        return {
          installmentNumber: number,
          cycleMonth,
          amountCents,
          imported: Boolean(importedSlot),
          projected: !importedSlot,
          transactionId: importedSlot?.transactionId || '',
        };
      });

      const planSumCents = installmentSchedule.reduce((sum, installment) => sum + installment.amountCents, 0);
      const result = {
        key: `${group.baseKey}|${group.groupIndex}`,
        cardId: group.cardId,
        transactionIds: Array.from(group.transactionIds),
        manuallyMerged: Boolean(group.manualPurchaseGroupId),
        manualPurchaseGroupId: group.manualPurchaseGroupId || '',
        manualPurchaseGroupAliases: Array.from(group.manualPurchaseGroupAliases || []),
        description: group.description,
        totalInstallments: group.totalInstallments,
        purchaseDate: group.purchaseDate,
        purchaseTotalCents,
        purchaseTotalEstimated,
        observedInstallments: observedByNumber.size,
        projectedInstallments: missingNumbers.length,
        amountsAdjusted,
        monthly,
        projectedMonthly,
        installmentSchedule,
        planSumCents,
        endMonth: installmentSchedule.reduce(
          (latest, installment) => installment.cycleMonth > latest ? installment.cycleMonth : latest,
          ''
        ),
      };
      return result;
    }))
    .sort((a, b) => String(a.purchaseDate).localeCompare(String(b.purchaseDate))
      || String(a.description).localeCompare(String(b.description), 'pt-BR')
      || String(a.key).localeCompare(String(b.key)));
};
