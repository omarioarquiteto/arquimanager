import React, { useEffect, useMemo, useState } from 'react';
import {
  getFirestore, collection, doc, onSnapshot, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  serverTimestamp, increment, writeBatch
} from 'firebase/firestore';
import {
  ArrowDownCircle, ArrowUpCircle, ArrowLeftRight, CalendarDays, Check, ChevronLeft,
  ChevronRight, CircleAlert, FileUp, Filter, Landmark, Pencil, Plus, RefreshCw, Search,
  Sparkles, Tags, Trash2, WalletCards, X
} from 'lucide-react';
import {
  DEFAULT_CATEGORIES, detectCsvHeader, formatBRL, normalizeText, parseCsvLine,
  parseCsvAmount, toCents, transactionKey, todayLocal
} from './financialEngine.js';
import PluggyConnections from './PluggyConnections.jsx';
import { isPluggyCardBillPayment, isPluggyTransfer, pluggyTransactionToFinancial } from './pluggyAdapter.js';

const root = 'artifacts/arquimanager-producao/public/data';
const collectionPath = (db, name) => collection(db, root, name);
const docPath = (db, name, id) => doc(db, root, name, id);

const monthKey = (date) => (date || '').slice(0, 7);
const parseDate = (s) => {
  if (!s) return new Date();
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};
const dateLabel = (s) => {
  if (!s) return '—';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${String(y).slice(2)}`;
};

function Card({ children, className = '' }) {
  return <div className={`bg-white border border-slate-200 rounded-2xl shadow-sm ${className}`}>{children}</div>;
}

function Metric({ label, value, icon, tone = 'slate' }) {
  const tones = {
    slate: 'text-slate-800 bg-slate-50 border-slate-100',
    green: 'text-emerald-700 bg-emerald-50 border-emerald-100',
    red: 'text-red-700 bg-red-50 border-red-100',
    blue: 'text-blue-700 bg-blue-50 border-blue-100',
    amber: 'text-amber-700 bg-amber-50 border-amber-100',
  };
  return (
    <div className={`rounded-2xl border p-4 ${tones[tone]}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-black uppercase tracking-widest opacity-70">{label}</span>
        {icon}
      </div>
      <div className="text-xl font-black">{value}</div>
    </div>
  );
}

const buildBulkClassificationGroups = (attentionItems = [], bulkQuery = '') => {
  const groups = new Map();

  (Array.isArray(attentionItems) ? attentionItems : [])
    .filter(item => item?.kind === 'CLASSIFICATION' && item?.transaction && item.transaction.type === 'EXPENSE')
    .forEach(item => {
      const tx = item.transaction || {};
      const description = String(tx.description || '');
      const normalizedDescription = normalizeText(description);
      const isTransfer = /(transferencia|transfer|ted|doc)/.test(normalizedDescription)
        && !/(compra|pagamento|fatura|boleto|fornecedor|loja|restaurante)/.test(normalizedDescription);
      const isCardPayment = /(pagamento|pagto|fatura)/.test(normalizedDescription)
        && /(cartao|credito)/.test(normalizedDescription);
      if (isTransfer || isCardPayment) return;

      const merchant = String(tx.merchant || description || 'Movimentação').trim();
      const key = normalizeText(merchant);
      if (!key || key.length < 4) return;

      if (!groups.has(key)) {
        groups.set(key, {
          key,
          merchant,
          items: [],
          totalCents: 0,
          expenseCount: 0,
          incomeCount: 0,
          sampleDescriptions: [],
        });
      }

      const group = groups.get(key);
      group.items.push(item);
      group.totalCents += Number(tx.amountCents || 0);
      if (tx.type === 'INCOME') group.incomeCount += 1;
      else group.expenseCount += 1;

      if (group.sampleDescriptions.length < 3 && description && !group.sampleDescriptions.includes(description)) {
        group.sampleDescriptions.push(description);
      }
    });

  const query = normalizeText(String(bulkQuery || ''));
  return [...groups.values()]
    .filter(group => !query || normalizeText(String(group.merchant || '')).includes(query))
    .sort((a, b) => {
      const countDiff = b.items.length - a.items.length;
      if (countDiff) return countDiff;
      return b.totalCents - a.totalCents;
    });
};

export default function FinancialHub({ appUser, projects = [], clients = [], db }) {
  const companyId = appUser?.companyId || 'legado';
  const [tab, setTab] = useState('overview');
  const [accounts, setAccounts] = useState([]);
  const [cards, setCards] = useState([]);
  const [bills, setBills] = useState([]);
  const [payables, setPayables] = useState([]);
  const [receivables, setReceivables] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [connections, setConnections] = useState([]);
  const [categories, setCategories] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [inbox, setInbox] = useState([]);
  const [rules, setRules] = useState([]);
  const [queryText, setQueryText] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(todayLocal().slice(0, 7));
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [bulkQuery, setBulkQuery] = useState('');
  const [bulkLimit, setBulkLimit] = useState(20);
  const [bulkBusyKey, setBulkBusyKey] = useState('');

  useEffect(() => {
    if (!companyId) return;
    const attach = (name, setter) => onSnapshot(collectionPath(db, name), snap => {
      setter(
        snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(item => !item.companyId || item.companyId === companyId)
      );
    }, err => console.error(`Erro ao carregar ${name}`, err));

    const unsubs = [
      attach('financial_accounts', setAccounts),
      attach('financial_cards', setCards),
      attach('financial_bills', setBills),
      attach('financial_payables', setPayables),
      attach('financial_receivables', setReceivables),
      attach('financial_transfers', setTransfers),
      attach('financial_connections', setConnections),
      attach('financial_categories', setCategories),
      attach('financial_transactions', setTransactions),
      attach('financial_inbox', setInbox),
      attach('financial_rules', setRules),
    ];
    return () => unsubs.forEach(u => u());
  }, [companyId]);

  useEffect(() => {
    DEFAULT_CATEGORIES.forEach(async ([id, nome]) => {
      try {
        await setDoc(docPath(db, 'financial_categories', `${companyId}_${id}`), {
          companyId, nome, active: true, system: true, updatedAt: serverTimestamp(),
        }, { merge: true });
      } catch (err) {
        console.error('Falha ao criar categoria padrão', err);
      }
    });
  }, [companyId]);

  const monthTransactions = useMemo(
    () => transactions.filter(t => monthKey(t.date || t.actualDate || t.expectedDate) === selectedMonth),
    [transactions, selectedMonth]
  );

  const totals = useMemo(() => {
    let income = 0, expense = 0;
    monthTransactions.forEach(t => {
      if (t.status === 'CANCELLED') return;
      if (t.type === 'INCOME') income += Number(t.amountCents || 0);
      if (t.type === 'EXPENSE') expense += Number(t.amountCents || 0);
    });
    return { income, expense, result: income - expense };
  }, [monthTransactions]);

  const attentionItems = useMemo(() => {
    const priority = {
      CARD_BILL_PAYMENT: 1,
      PAYABLE_PAYMENT: 2,
      RECEIVABLE_RECEIPT: 2,
      CLASSIFICATION: 3,
    };
    return inbox
      .filter(item => item.status !== 'RESOLVED')
      .map(item => ({
        ...item,
        transaction: transactions.find(t => t.id === item.transactionId) || null,
      }))
      .sort((a, b) => {
        const priorityDiff = (priority[a.kind] || 9) - (priority[b.kind] || 9);
        if (priorityDiff) return priorityDiff;
        const confidenceDiff = Number(b.confidence || 0) - Number(a.confidence || 0);
        if (confidenceDiff) return confidenceDiff;
        return String(a.createdAt?.seconds || 0).localeCompare(String(b.createdAt?.seconds || 0));
      });
  }, [inbox, transactions]);

  const attentionCount = inbox.filter(item => item.status !== 'RESOLVED').length;

  const bulkClassificationGroups = tab === 'attention'
    ? buildBulkClassificationGroups(attentionItems, bulkQuery)
    : [];

  const visibleBulkGroups = bulkClassificationGroups.slice(0, bulkLimit);

  const accountBalance = useMemo(
    () => accounts.reduce((sum, a) => sum + Number(a.balanceCents || 0), 0),
    [accounts]
  );

  const filteredTransactions = useMemo(() => {
    const q = normalizeText(queryText);
    return [...transactions]
      .filter(t => !q || normalizeText(`${t.description || ''} ${t.merchant || ''}`).includes(q))
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  }, [transactions, queryText]);

  const days = useMemo(() => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const first = new Date(year, month - 1, 1);
    const last = new Date(year, month, 0);
    const start = (first.getDay() + 6) % 7;
    const values = [];
    for (let i = 0; i < start; i += 1) values.push(null);
    for (let d = 1; d <= last.getDate(); d += 1) {
      const key = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      values.push(key);
    }
    return values;
  }, [selectedMonth]);

  const isCardPaymentDescription = (description = '') => {
    const text = normalizeText(description);
    return /(pagamento|pagto|fatura)/.test(text) && /(cartao|cartão|credito|crédito)/.test(text);
  };

  const findCardBillForPayment = ({ amountCents, date, description, accountId }) => {
    const normalizedDescription = normalizeText(description);
    const paymentHint = isCardPaymentDescription(description);
    if (!paymentHint || !amountCents) return { status: 'NO_MATCH' };

    const scored = bills
      .filter(b => b.companyId === companyId && Number(b.totalCents || 0) > Number(b.paidCents || 0))
      .map(b => {
        const card = cards.find(c => c.id === b.cardId);
        if (!card) return null;
        const remaining = Number(b.totalCents || 0) - Number(b.paidCents || 0);
        const cardName = normalizeText(card.name || '');
        const cardInstitution = normalizeText(card.institution || '');
        const dateDiff = Math.abs(parseDate(date).getTime() - parseDate(b.dueDate).getTime()) / 86400000;
        let score = 0;
        if (amountCents === remaining) score += 100;
        else if (amountCents < remaining) score += 40;
        if (card.paymentAccountId && card.paymentAccountId === accountId) score += 40;
        if (cardName && normalizedDescription.includes(cardName)) score += 30;
        if (cardInstitution && normalizedDescription.includes(cardInstitution)) score += 10;
        if (dateDiff <= 10) score += 15;
        return { bill: b, card, remaining, score, exact: amountCents === remaining, dateDiff };
      })
      .filter(Boolean)
      .filter(x => x.score >= 115)
      .sort((a,b) => b.score - a.score);

    if (!scored.length) return { status: 'NO_MATCH' };
    const top = scored[0];
    const second = scored[1];
    if (!top.exact) return { status: 'AMBIGUOUS', candidates: scored.slice(0, 5) };
    if (second && second.score === top.score) return { status: 'AMBIGUOUS', candidates: scored.slice(0, 5) };
    return { status: 'MATCH', ...top };
  };

  const reconcileCardPayment = async ({ transactionId, amountCents, date, description, accountId }) => {
    const match = findCardBillForPayment({ amountCents, date, description, accountId });
    if (match.status !== 'MATCH') return match;
    const paidCents = Number(match.bill.paidCents || 0) + amountCents;
    const totalCents = Number(match.bill.totalCents || 0);
    await updateDoc(docPath(db, 'financial_bills', match.bill.id), {
      paidCents, status: paidCents >= totalCents ? 'PAID' : 'PARTIALLY_PAID',
      lastPaymentTransactionId: transactionId, lastPaidAt: date, updatedAt: serverTimestamp(),
    });
    await updateDoc(docPath(db, 'financial_transactions', transactionId), {
      status: 'RECONCILED', reconciliationType: 'CARD_BILL_PAYMENT',
      billId: match.bill.id, cardId: match.bill.cardId, updatedAt: serverTimestamp(),
    });
    return { ...match, paidCents, status: 'MATCHED' };
  };
  const matchPlannedItem = ({ items, amountCents, date, description, type }) => {
    const normalizedDescription = normalizeText(description);
    const isPayable = type === 'PAYABLE';
    const candidates = items
      .filter(item => item.companyId === companyId)
      .filter(item => {
        const total = Number(item.amountCents || 0);
        const settled = Number(isPayable ? item.paidCents || 0 : item.receivedCents || 0);
        return item.status !== (isPayable ? 'PAID' : 'RECEIVED') && total > settled;
      })
      .map(item => {
        const total = Number(item.amountCents || 0);
        const settled = Number(isPayable ? item.paidCents || 0 : item.receivedCents || 0);
        const remaining = total - settled;
        const dueDate = item.expectedDate || item.dueDate;
        const dateDiff = Math.abs(parseDate(date).getTime() - parseDate(dueDate).getTime()) / 86400000;
        const itemText = normalizeText([
          item.description || '',
          item.supplierName || '',
          item.clientName || '',
        ].join(' '));
        let score = 0;
        const exact = amountCents === remaining;
        if (exact) score += 100;
        if (dateDiff <= 3) score += 30;
        else if (dateDiff <= 7) score += 20;
        else if (dateDiff <= 15) score += 10;
        const words = normalizedDescription.split(' ').filter(w => w.length >= 4);
        const hits = words.filter(word => itemText.includes(word)).length;
        if (hits >= 2) score += 30;
        else if (hits === 1) score += 15;
        if (item.projectId && normalizedDescription.includes(normalizeText(item.description || ''))) score += 10;
        return { item, remaining, score, exact, dateDiff };
      })
      .filter(x => x.exact)
      .sort((a,b) => b.score - a.score);

    if (!candidates.length) return { status: 'NO_MATCH' };
    const top = candidates[0];
    const second = candidates[1];
    if (second && second.score === top.score) return { status: 'AMBIGUOUS', candidates: candidates.slice(0, 5) };
    if (top.score < 120) return { status: 'AMBIGUOUS', candidates: candidates.slice(0, 5) };
    return { status: 'MATCH', ...top };
  };

  const reconcilePlannedPayment = async ({ transactionId, amountCents, date, description, type }) => {
    const items = type === 'PAYABLE' ? payables : receivables;
    const match = matchPlannedItem({ items, amountCents, date, description, type });
    if (match.status !== 'MATCH') return match;
    if (type === 'PAYABLE') {
      await updateDoc(docPath(db, 'financial_payables', match.item.id), {
        paidCents: Number(match.item.paidCents || 0) + amountCents,
        status: 'PAID',
        paymentTransactionId: transactionId,
        actualDate: date,
        updatedAt: serverTimestamp(),
      });
      await updateDoc(docPath(db, 'financial_transactions', transactionId), {
        status: 'RECONCILED',
        reconciliationType: 'PAYABLE_PAYMENT',
        payableId: match.item.id,
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(docPath(db, 'financial_receivables', match.item.id), {
        receivedCents: Number(match.item.receivedCents || 0) + amountCents,
        status: 'RECEIVED',
        receiptTransactionId: transactionId,
        actualDate: date,
        updatedAt: serverTimestamp(),
      });
      await updateDoc(docPath(db, 'financial_transactions', transactionId), {
        status: 'RECONCILED',
        reconciliationType: 'RECEIVABLE_RECEIPT',
        receivableId: match.item.id,
        updatedAt: serverTimestamp(),
      });
    }
    return { ...match, status: 'MATCHED' };
  };

  const isTransferDescription = (description = '') => {
    const text = normalizeText(description);
    return /(transferencia|transfer|ted|doc)/.test(text) && !/(compra|pagamento|fatura|boleto|fornecedor|loja|restaurante)/.test(text);
  };

  const findRememberedRule = (merchantValue = '') => {
    const normalized = normalizeText(merchantValue);
    if (!normalized) return { status: 'NO_MATCH' };

    const words = normalized.split(' ').filter(word => word.length >= 3);
    const candidates = rules
      .filter(rule => rule.companyId === companyId && rule.merchantNormalized && rule.categoryId)
      .map(rule => {
        const merchant = normalizeText(rule.merchantNormalized);
        if (!merchant) return null;

        let score = 0;
        if (merchant === normalized) score = 100;
        else if (normalized.includes(merchant) && merchant.length >= 4) score = 85;
        else if (merchant.includes(normalized) && normalized.length >= 5) score = 75;
        else {
          const ruleWords = merchant.split(' ').filter(word => word.length >= 3);
          const hits = ruleWords.filter(word => words.includes(word)).length;
          if (ruleWords.length && hits === ruleWords.length) score = 70;
          else if (hits >= 2) score = 60;
        }

        return score ? { rule, score } : null;
      })
      .filter(Boolean)
      .sort((a,b) => b.score - a.score);

    if (!candidates.length) return { status: 'NO_MATCH' };
    const top = candidates[0];
    const second = candidates[1];
    if (second && second.score === top.score && second.rule.id !== top.rule.id) {
      return { status: 'AMBIGUOUS', candidates: candidates.slice(0, 5) };
    }
    return { status: 'MATCH', rule: top.rule, score: top.score };
  };

  const findDuplicateTransaction = ({ accountId, date, amountCents, type, description, excludeId = null }) => {
    const normalizedDescription = normalizeText(description);
    if (!accountId || !date || !amountCents || !normalizedDescription) return null;

    return transactions
      .filter(tx => tx.companyId === companyId)
      .filter(tx => tx.id !== excludeId)
      .filter(tx => tx.accountId === accountId && tx.date === date)
      .filter(tx => tx.type === type && tx.status !== 'CANCELLED')
      .filter(tx => Number(tx.amountCents || 0) === Number(amountCents))
      .find(tx => normalizeText(tx.description || tx.merchant || '') === normalizedDescription) || null;
  };

  const findTransferCandidate = ({ amountCents, date, description, accountId, type, pool = transactions }) => {
    if (!isTransferDescription(description) || !amountCents) return { status: 'NO_MATCH' };
    const oppositeType = type === 'EXPENSE' ? 'INCOME' : 'EXPENSE';
    const candidates = (Array.isArray(pool) ? pool : [])
      .filter(tx => tx && tx.companyId === companyId)
      .filter(tx => tx?.id && tx?.accountId && tx.accountId !== accountId)
      .filter(tx => tx?.type === oppositeType && tx?.status !== 'CANCELLED')
      .filter(tx => tx?.reconciliationType !== 'TRANSFER' && !tx?.transferId)
      .map(tx => {
        const sameAmount = Number(tx.amountCents || 0) === Number(amountCents);
        const dayDiff = Math.abs(parseDate(date).getTime() - parseDate(tx.date).getTime()) / 86400000;
        const descHit = isTransferDescription(tx.description);
        let score = 0;
        if (sameAmount) score += 100;
        if (dayDiff === 0) score += 30;
        else if (dayDiff <= 1) score += 20;
        if (descHit) score += 40;
        return { tx, score, sameAmount, dayDiff };
      })
      .filter(x => x.sameAmount && x.dayDiff <= 1)
      .sort((a,b) => b.score - a.score);

    if (!candidates.length) return { status: 'NO_MATCH' };
    if (candidates[1] && candidates[1].score === candidates[0].score) {
      return { status: 'AMBIGUOUS', candidates: candidates.slice(0, 5) };
    }
    if (candidates[0].score < 150) return { status: 'NO_MATCH' };
    return { status: 'MATCH', ...candidates[0] };
  };

  const reconcileTransfer = async ({ transactionId, amountCents, date, description, accountId, type, pool }) => {
    const match = findTransferCandidate({ amountCents, date, description, accountId, type, pool });
    if (match.status !== 'MATCH' || !match.tx?.id || !match.tx?.accountId) {
      return { status: 'NO_MATCH' };
    }
    const currentRef = docPath(db, 'financial_transactions', transactionId);
    const candidateRef = docPath(db, 'financial_transactions', match.tx.id);
    const transferRef = doc(collectionPath(db, 'financial_transfers'));

    const fromAccountId = type === 'EXPENSE' ? accountId : match.tx.accountId;
    const toAccountId = type === 'EXPENSE' ? match.tx.accountId : accountId;
    const batch = writeBatch(db);
    batch.set(transferRef, {
      companyId,
      fromAccountId,
      toAccountId,
      amountCents,
      date,
      description: description.trim(),
      source: 'AUTO_RECONCILIATION',
      outgoingTransactionId: type === 'EXPENSE' ? transactionId : match.tx.id,
      incomingTransactionId: type === 'EXPENSE' ? match.tx.id : transactionId,
      status: 'RECONCILED',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.update(currentRef, {
      status: 'RECONCILED',
      reconciliationType: 'TRANSFER',
      transferId: transferRef.id,
      categoryId: null,
      projectId: null,
      updatedAt: serverTimestamp(),
    });
    batch.update(candidateRef, {
      status: 'RECONCILED',
      reconciliationType: 'TRANSFER',
      transferId: transferRef.id,
      categoryId: null,
      projectId: null,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
    return { ...match, status: 'MATCHED', transferId: transferRef.id };
  };

  const createTransfer = async (data) => {
    const amountCents = Math.abs(toCents(data.amount));
    if (!data.fromAccountId || !data.toAccountId || data.fromAccountId === data.toAccountId || !amountCents || !data.date) return;
    const description = data.description?.trim() || 'Transferência entre contas';
    setBusy(true);
    try {
      const transferRef = doc(collectionPath(db, 'financial_transfers'));
      const outgoingRef = doc(collectionPath(db, 'financial_transactions'));
      const incomingRef = doc(collectionPath(db, 'financial_transactions'));
      const batch = writeBatch(db);

      batch.set(transferRef, {
        companyId,
        fromAccountId: data.fromAccountId,
        toAccountId: data.toAccountId,
        amountCents,
        date: data.date,
        description,
        source: 'MANUAL',
        outgoingTransactionId: outgoingRef.id,
        incomingTransactionId: incomingRef.id,
        status: 'RECONCILED',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.set(outgoingRef, {
        companyId, source: 'MANUAL',
        externalId: null,
        accountId: data.fromAccountId,
        cardId: null,
        date: data.date,
        actualDate: data.date,
        expectedDate: null,
        description,
        merchant: description,
        normalizedMerchant: normalizeText(description),
        amountCents,
        type: 'EXPENSE',
        status: 'RECONCILED',
        reconciliationType: 'TRANSFER',
        transferId: transferRef.id,
        categoryId: null,
        projectId: null,
        clientId: null,
        supplierId: null,
        notes: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.set(incomingRef, {
        companyId, source: 'MANUAL',
        externalId: null,
        accountId: data.toAccountId,
        cardId: null,
        date: data.date,
        actualDate: data.date,
        expectedDate: null,
        description,
        merchant: description,
        normalizedMerchant: normalizeText(description),
        amountCents,
        type: 'INCOME',
        status: 'RECONCILED',
        reconciliationType: 'TRANSFER',
        transferId: transferRef.id,
        categoryId: null,
        projectId: null,
        clientId: null,
        supplierId: null,
        notes: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      setModal(null);
      setNotice('Transferência registrada entre as contas.');
    } finally {
      setBusy(false);
    }
  };

  const createPayable = async (data) => {
    if (!data.description.trim() || !data.amount || !data.dueDate) return;
    setBusy(true);
    try {
      await addDoc(collectionPath(db, 'financial_payables'), {
        companyId,
        description: data.description.trim(),
        amountCents: Math.abs(toCents(data.amount)),
        dueDate: data.dueDate,
        expectedDate: data.dueDate,
        status: 'OPEN',
        paidCents: 0,
        supplierName: data.supplierName?.trim() || '',
        categoryId: data.categoryId || null,
        projectId: data.projectId || null,
        notes: data.notes?.trim() || '',
        source: 'MANUAL',
        paymentTransactionId: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setModal(null);
      setNotice('Conta a pagar cadastrada como obrigação prevista.');
    } finally {
      setBusy(false);
    }
  };

  const createReceivable = async (data) => {
    if (!data.description.trim() || !data.amount || !data.dueDate) return;
    setBusy(true);
    try {
      await addDoc(collectionPath(db, 'financial_receivables'), {
        companyId,
        description: data.description.trim(),
        amountCents: Math.abs(toCents(data.amount)),
        dueDate: data.dueDate,
        expectedDate: data.dueDate,
        status: 'OPEN',
        receivedCents: 0,
        clientId: data.clientId || null,
        projectId: data.projectId || null,
        notes: data.notes?.trim() || '',
        source: 'MANUAL',
        receiptTransactionId: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setModal(null);
      setNotice('Conta a receber cadastrada como entrada prevista.');
    } finally {
      setBusy(false);
    }
  };

  const payableOpenTotal = useMemo(
    () => payables.filter(p => p.status !== 'PAID').reduce((sum, p) => sum + Number(p.amountCents || 0), 0),
    [payables]
  );

  const receivableOpenTotal = useMemo(
    () => receivables.filter(r => r.status !== 'RECEIVED').reduce((sum, r) => sum + Number(r.amountCents || 0), 0),
    [receivables]
  );

  const plannedEvents = useMemo(() => {
    const payableEvents = payables
      .filter(p => p.status !== 'PAID')
      .map(p => ({
        id: 'payable_' + p.id,
        sourceId: p.id,
        kind: 'PAYABLE',
        date: p.expectedDate || p.dueDate,
        type: 'PAYABLE',
        description: p.description,
        amountCents: Math.max(0, Number(p.amountCents || 0) - Number(p.paidCents || 0)),
      }));

    const receivableEvents = receivables
      .filter(r => r.status !== 'RECEIVED')
      .map(r => ({
        id: 'receivable_' + r.id,
        sourceId: r.id,
        kind: 'RECEIVABLE',
        date: r.expectedDate || r.dueDate,
        type: 'RECEIVABLE',
        description: r.description,
        amountCents: Math.max(0, Number(r.amountCents || 0) - Number(r.receivedCents || 0)),
      }));

    const cardBillEvents = bills
      .filter(b => b.status !== 'PAID')
      .map(b => {
        const card = cards.find(c => c.id === b.cardId);
        const remainingCents = Math.max(0, Number(b.totalCents || 0) - Number(b.paidCents || 0));
        return {
          id: 'card_bill_' + b.id,
          sourceId: b.id,
          kind: 'CARD_BILL',
          date: b.dueDate,
          type: 'CARD_BILL',
          description: `Fatura ${card?.name || 'cartão'}`,
          amountCents: remainingCents,
        };
      });

    return [...payableEvents, ...receivableEvents, ...cardBillEvents]
      .filter(event => event.date && event.amountCents > 0);
  }, [payables, receivables, bills, cards]);

  const projection = useMemo(() => {
    const today = todayLocal();
    const eventMap = {};

    plannedEvents
      .filter(event => event.date)
      .forEach(event => {
        // Obrigações vencidas continuam representando saída/entrada pendente e,
        // na projeção, entram como um evento para hoje.
        const date = event.date < today ? today : event.date;
        if (!eventMap[date]) eventMap[date] = [];
        eventMap[date].push(event);
      });

    const daily = [];
    let balance = Number(accountBalance || 0);
    const dayMs = 86400000;
    const todayDate = parseDate(today);

    for (let index = 0; index <= 90; index += 1) {
      const dateObj = new Date(todayDate.getTime() + index * dayMs);
      const date = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
      const events = eventMap[date] || [];
      const income = events
        .filter(event => event.type === 'RECEIVABLE')
        .reduce((sum, event) => sum + Number(event.amountCents || 0), 0);
      const expense = events
        .filter(event => event.type === 'PAYABLE' || event.type === 'CARD_BILL')
        .reduce((sum, event) => sum + Number(event.amountCents || 0), 0);

      balance += income - expense;
      daily.push({ date, events, income, expense, balance });
    }

    const next30 = daily.slice(0, 31);
    const next90 = daily.slice(0, 91);
    const totalIncome30 = next30.reduce((sum, day) => sum + day.income, 0);
    const totalExpense30 = next30.reduce((sum, day) => sum + day.expense, 0);
    const minimumDay = next90.reduce((min, day) => day.balance < min.balance ? day : min, next90[0]);

    return {
      today,
      daily,
      byDate: Object.fromEntries(daily.map(day => [day.date, day])),
      balanceToday: daily[0]?.balance ?? Number(accountBalance || 0),
      totalIncome30,
      totalExpense30,
      net30: totalIncome30 - totalExpense30,
      minimumBalance90: minimumDay?.balance ?? Number(accountBalance || 0),
      minimumBalance90Date: minimumDay?.date || today,
    };
  }, [plannedEvents, accountBalance]);

  const openNewTransaction = (type = 'EXPENSE') =>
    setModal({ type: 'transaction', initial: { type, date: todayLocal(), status: 'CLASSIFIED', amount: '', description: '' } });

  const openEditTransaction = (tx) => {
    const lockedCore = tx.status === 'RECONCILED' || tx.reconciliationType === 'TRANSFER' || !!tx.billId || !!tx.payableId || !!tx.receivableId;
    setModal({
      type: 'transaction',
      initial: {
        editing: true,
        transactionId: tx.id,
        lockedCore,
        type: tx.type,
        date: tx.date || tx.actualDate || todayLocal(),
        status: tx.status || 'CLASSIFIED',
        amount: (Number(tx.amountCents || 0) / 100).toFixed(2),
        description: tx.description || '',
        merchant: tx.merchant || '',
        accountId: tx.accountId || '',
        categoryId: tx.categoryId || '',
        projectId: tx.projectId || '',
        clientId: tx.clientId || '',
        notes: tx.notes || '',
        reconciliationType: tx.reconciliationType || null,
        transferId: tx.transferId || null,
        billId: tx.billId || null,
        payableId: tx.payableId || null,
        receivableId: tx.receivableId || null,
      }
    });
  };

  const updateTransaction = async (data) => {
    const tx = transactions.find(t => t.id === data.transactionId);
    if (!tx) return;
    if (!data.description?.trim()) return;

    const lockedCore = tx.status === 'RECONCILED' || tx.reconciliationType === 'TRANSFER' || !!tx.billId || !!tx.payableId || !!tx.receivableId;
    const description = data.description.trim();
    const merchant = data.merchant?.trim() || description;
    const baseChanges = {
      description,
      merchant,
      normalizedMerchant: normalizeText(merchant),
      notes: data.notes?.trim() || '',
      updatedAt: serverTimestamp(),
    };

    if (!lockedCore) {
      const amountCents = Math.abs(toCents(data.amount));
      if (!amountCents || !data.accountId || !data.date) return;
      const nextType = data.type === 'INCOME' ? 'INCOME' : 'EXPENSE';
      const nextStatus = data.status === 'SCHEDULED'
        ? 'SCHEDULED'
        : (nextType === 'EXPENSE' && (data.categoryId || data.projectId) ? 'CLASSIFIED' : (data.status || 'IDENTIFICATION_REQUIRED'));
      Object.assign(baseChanges, {
        amountCents,
        type: nextType,
        accountId: data.accountId,
        date: data.date,
        actualDate: nextStatus === 'SCHEDULED' ? null : data.date,
        expectedDate: nextStatus === 'SCHEDULED' ? data.date : null,
        categoryId: data.categoryId || null,
        projectId: data.projectId || null,
        clientId: data.clientId || null,
        status: nextStatus,
      });
    }

    setBusy(true);
    try {
      if (tx.reconciliationType === 'TRANSFER' && tx.transferId) {
        const transfer = transfers.find(t => t.id === tx.transferId);
        const batch = writeBatch(db);
        batch.update(docPath(db, 'financial_transactions', tx.id), baseChanges);
        if (transfer?.outgoingTransactionId && transfer.outgoingTransactionId !== tx.id) {
          batch.update(docPath(db, 'financial_transactions', transfer.outgoingTransactionId), {
            description,
            merchant,
            normalizedMerchant: normalizeText(merchant),
            notes: data.notes?.trim() || '',
            updatedAt: serverTimestamp(),
          });
        }
        if (transfer) {
          batch.update(docPath(db, 'financial_transfers', transfer.id), {
            description,
            updatedAt: serverTimestamp(),
          });
        }
        await batch.commit();
      } else {
        await updateDoc(docPath(db, 'financial_transactions', tx.id), baseChanges);
      }
      setModal(null);
      setNotice('Movimentação atualizada.');
    } finally {
      setBusy(false);
    }
  };

  const deleteTransaction = async (tx) => {
    if (!tx?.id) return;
    const transfer = tx.transferId ? transfers.find(t => t.id === tx.transferId) : null;
    const linkedText = transfer
      ? 'Esta movimentação faz parte de uma transferência. As duas pontas e o vínculo serão removidos.'
      : tx.billId
        ? 'O pagamento será retirado da fatura antes da movimentação ser excluída.'
        : tx.payableId
          ? 'O pagamento será retirado da conta a pagar antes da movimentação ser excluída.'
          : tx.receivableId
            ? 'O recebimento será retirado da conta a receber antes da movimentação ser excluída.'
            : 'A movimentação será excluída definitivamente.';
    if (!window.confirm(`${linkedText}\\n\\nDeseja continuar?`)) return;

    setBusy(true);
    try {
      const batch = writeBatch(db);
      const inboxItems = inbox.filter(i => i.transactionId === tx.id);
      inboxItems.forEach(item => batch.delete(docPath(db, 'financial_inbox', item.id)));

      if (transfer) {
        const outgoingId = transfer.outgoingTransactionId;
        const incomingId = transfer.incomingTransactionId;
        batch.delete(docPath(db, 'financial_transfers', transfer.id));
        if (outgoingId) batch.delete(docPath(db, 'financial_transactions', outgoingId));
        if (incomingId && incomingId !== outgoingId) batch.delete(docPath(db, 'financial_transactions', incomingId));
        await batch.commit();
        setModal(null);
        setNotice('Transferência excluída com as duas movimentações vinculadas.');
        return;
      }

      if (tx.billId) {
        const bill = bills.find(b => b.id === tx.billId);
        if (bill) {
          const nextPaid = Math.max(0, Number(bill.paidCents || 0) - Number(tx.amountCents || 0));
          const billChange = {
            paidCents: nextPaid,
            status: nextPaid <= 0 ? 'OPEN' : (nextPaid >= Number(bill.totalCents || 0) ? 'PAID' : 'PARTIALLY_PAID'),
            updatedAt: serverTimestamp(),
          };
          if (bill.lastPaymentTransactionId === tx.id) billChange.lastPaymentTransactionId = null;
          if (bill.lastPaymentTransactionId === tx.id) billChange.lastPaidAt = null;
          batch.update(docPath(db, 'financial_bills', bill.id), billChange);
        }
      }

      if (tx.payableId) {
        const payable = payables.find(p => p.id === tx.payableId);
        if (payable) {
          const nextPaid = Math.max(0, Number(payable.paidCents || 0) - Number(tx.amountCents || 0));
          const payableChange = {
            paidCents: nextPaid,
            status: nextPaid <= 0 ? 'OPEN' : (nextPaid >= Number(payable.amountCents || 0) ? 'PAID' : 'PARTIALLY_PAID'),
            updatedAt: serverTimestamp(),
          };
          if (payable.paymentTransactionId === tx.id) payableChange.paymentTransactionId = null;
          batch.update(docPath(db, 'financial_payables', payable.id), payableChange);
        }
      }

      if (tx.receivableId) {
        const receivable = receivables.find(r => r.id === tx.receivableId);
        if (receivable) {
          const nextReceived = Math.max(0, Number(receivable.receivedCents || 0) - Number(tx.amountCents || 0));
          const receivableChange = {
            receivedCents: nextReceived,
            status: nextReceived <= 0 ? 'OPEN' : (nextReceived >= Number(receivable.amountCents || 0) ? 'RECEIVED' : 'PARTIALLY_RECEIVED'),
            updatedAt: serverTimestamp(),
          };
          if (receivable.receiptTransactionId === tx.id) receivableChange.receiptTransactionId = null;
          batch.update(docPath(db, 'financial_receivables', receivable.id), receivableChange);
        }
      }

      batch.delete(docPath(db, 'financial_transactions', tx.id));
      await batch.commit();
      setModal(null);
      setNotice('Movimentação excluída e vínculos financeiros revertidos.');
    } finally {
      setBusy(false);
    }
  };

  const createCard = async (data) => {
    if (!data.name.trim() || !data.institution.trim()) return;
    const limitCents = toCents(data.limit);
    const closingDay = Math.min(28, Math.max(1, Number(data.closingDay || 1)));
    const dueDay = Math.min(28, Math.max(1, Number(data.dueDay || 1)));
    setBusy(true);
    try {
      await addDoc(collectionPath(db, 'financial_cards'), {
        companyId, name: data.name.trim(), institution: data.institution.trim(),
        limitCents, closingDay, dueDay, paymentAccountId: data.paymentAccountId || null,
        active: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      setModal(null);
      setNotice('Cartão cadastrado.');
    } finally { setBusy(false); }
  };

  const createCardPurchase = async (data) => {
    if (!data.cardId || !data.description.trim() || !data.amount || !data.purchaseDate) return;
    const totalCents = Math.abs(toCents(data.amount));
    const installmentsCount = Math.max(1, Math.min(48, Number(data.installments || 1)));
    const card = cards.find(c => c.id === data.cardId);
    if (!card || !totalCents) return;

    const basePart = Math.floor(totalCents / installmentsCount);
    const remainder = totalCents - (basePart * installmentsCount);
    const addMonths = (baseDate, amount) => {
      const d = new Date(baseDate.getTime()); d.setDate(1); d.setMonth(d.getMonth() + amount); return d;
    };
    const monthString = d => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
    const dateForDay = (year, monthIndex, day) => {
      const last = new Date(year, monthIndex + 1, 0).getDate();
      return year + '-' + String(monthIndex + 1).padStart(2,'0') + '-' + String(Math.min(day,last)).padStart(2,'0');
    };

    setBusy(true);
    try {
      const purchaseRef = await addDoc(collectionPath(db, 'financial_purchases'), {
        companyId, cardId: data.cardId, merchant: data.merchant?.trim() || data.description.trim(),
        description: data.description.trim(), purchaseDate: data.purchaseDate, totalCents,
        installmentsCount, categoryId: data.categoryId || null, projectId: data.projectId || null,
        status: 'ACTIVE', source: 'MANUAL', createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });

      const purchaseDate = new Date(data.purchaseDate + 'T12:00:00');
      const firstOffset = purchaseDate.getDate() > Number(card.closingDay || 1) ? 1 : 0;

      for (let index = 0; index < installmentsCount; index += 1) {
        const billMonthDate = addMonths(purchaseDate, firstOffset + index);
        const referenceMonth = monthString(billMonthDate);
        const closingDay = Number(card.closingDay || 1);
        const dueDay = Number(card.dueDay || 10);
        const closingDate = dateForDay(billMonthDate.getFullYear(), billMonthDate.getMonth(), closingDay);
        const dueMonthDate = addMonths(billMonthDate, dueDay > closingDay ? 0 : 1);
        const dueDate = dateForDay(dueMonthDate.getFullYear(), dueMonthDate.getMonth(), dueDay);
        const amountCents = basePart + (index < remainder ? 1 : 0);
        const billId = companyId + '_' + data.cardId + '_' + referenceMonth;

        await setDoc(docPath(db, 'financial_bills', billId), {
          companyId, cardId: data.cardId, referenceMonth, closingDate, dueDate,
          totalCents: increment(amountCents), updatedAt: serverTimestamp(),
        }, { merge: true });

        await setDoc(docPath(db, 'financial_installments', purchaseRef.id + '_' + (index + 1)), {
          companyId, purchaseId: purchaseRef.id, billId, cardId: data.cardId,
          number: index + 1, total: installmentsCount, amountCents, dueDate, status: 'OPEN',
          createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        });
      }
      setModal(null);
      setNotice('Compra registrada em ' + installmentsCount + ' parcela(s).');
    } finally { setBusy(false); }
  };
  const savePluggyConnection = async (connection) => {
    if (!connection?.itemId) return;

    const connectionId = `${companyId}_${connection.itemId}`;
    await setDoc(docPath(db, 'financial_connections', connectionId), {
      companyId,
      itemId: connection.itemId,
      connectorId: connection.connectorId || null,
      connectorName: connection.connectorName || 'Instituição financeira',
      status: connection.status || 'CONNECTED',
      clientUserId: connection.clientUserId || (appUser?.id ? `arquimanager:${appUser.id}` : null),
      lastConnectedAt: connection.lastConnectedAt || new Date().toISOString(),
      updatedAt: serverTimestamp(),
    }, { merge: true });

    setNotice(`Banco conectado: ${connection.connectorName || 'instituição financeira'}.`);
  };

  const syncPluggyConnection = async (connection) => {
    if (!connection?.itemId) return;

    setBusy(true);
    try {
      const response = await fetch('/.netlify/functions/pluggy-sync-item', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          itemId: connection.itemId,
          clientUserId: connection.clientUserId || (appUser?.id ? `arquimanager:${appUser.id}` : ''),
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Não foi possível sincronizar o banco.');

      // 1) Atualiza/insere as contas bancárias vindas do Pluggy.
      const accountBatch = writeBatch(db);
      (data.bankAccounts || []).forEach(account => {
        const financialId = `${companyId}_pluggy_account_${account.id}`;
        accountBatch.set(docPath(db, 'financial_accounts', financialId), {
          companyId,
          name: account.name || 'Conta bancária',
          institution: connection.connectorName || 'Instituição financeira',
          type: account.subtype === 'SAVINGS_ACCOUNT' ? 'CONTA_POUPANCA' : 'CONTA_CORRENTE',
          balanceCents: toCents(account.balance),
          currencyCode: account.currencyCode || 'BRL',
          provider: 'PLUGGY',
          providerAccountId: account.id,
          providerItemId: connection.itemId,
          balanceSource: 'PLUGGY',
          lastBalanceSyncAt: data.syncedAt || new Date().toISOString(),
          active: true,
          updatedAt: serverTimestamp(),
        }, { merge: true });
      });
      await accountBatch.commit();

      // 2) Descobre novas movimentações usando o estado REAL do Firestore.
      // Não usamos apenas o estado React, porque após uma sincronização grande
      // ele pode ainda não ter recebido o snapshot mais recente.
      //
      // Também saneamos duplicatas antigas: a chave externa da Pluggy é única
      // para cada lançamento e deve existir apenas uma vez no ArquiManager.
      const serverTransactionsSnapshot = await getDocs(collectionPath(db, 'financial_transactions'));
      const companyTransactions = serverTransactionsSnapshot.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(tx => tx.companyId === companyId);

      const transactionsByExternalId = new Map();
      const duplicateTransactionIds = [];

      const transactionPriority = (tx) => {
        if (tx?.status === 'RECONCILED' || tx?.reconciliationType) return 3;
        if (tx?.status === 'CLASSIFIED') return 2;
        if (tx?.status === 'IDENTIFICATION_REQUIRED') return 1;
        return 0;
      };

      companyTransactions
        .filter(tx => tx.externalId)
        .forEach(tx => {
          const key = String(tx.externalId);
          const current = transactionsByExternalId.get(key);

          if (!current) {
            transactionsByExternalId.set(key, tx);
            return;
          }

          const currentScore = transactionPriority(current);
          const nextScore = transactionPriority(tx);

          if (nextScore > currentScore) {
            duplicateTransactionIds.push(current.id);
            transactionsByExternalId.set(key, tx);
          } else {
            duplicateTransactionIds.push(tx.id);
          }
        });

      // A caixa de Atenção também pode ter sido duplicada durante uma
      // sincronização concorrente/rápida. Reaproveitamos apenas uma ocorrência
      // aberta por transactionId e removemos itens órfãos das transações que
      // forem descartadas acima.
      const serverInboxSnapshot = await getDocs(collectionPath(db, 'financial_inbox'));
      const companyInbox = serverInboxSnapshot.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(item => item.companyId === companyId);

      const canonicalTransactionIds = new Set(
        [...transactionsByExternalId.values()].map(tx => tx.id)
      );

      const duplicateInboxIds = [];
      const openInboxByTransactionServer = new Map();

      companyInbox
        .filter(item => item.status !== 'RESOLVED')
        .forEach(item => {
          if (!canonicalTransactionIds.has(item.transactionId)) {
            duplicateInboxIds.push(item.id);
            return;
          }

          const existingItems = openInboxByTransactionServer.get(item.transactionId) || [];
          if (existingItems.length) {
            // Mantém a primeira ocorrência e exclui as demais.
            duplicateInboxIds.push(item.id);
          } else {
            existingItems.push(item);
            openInboxByTransactionServer.set(item.transactionId, existingItems);
          }
        });

      const cleanupIds = [...new Set([
        ...duplicateTransactionIds,
        ...duplicateInboxIds,
      ])];

      for (let start = 0; start < cleanupIds.length; start += 400) {
        const cleanupBatch = writeBatch(db);

        cleanupIds.slice(start, start + 400).forEach(id => {
          if (duplicateTransactionIds.includes(id)) {
            cleanupBatch.delete(docPath(db, 'financial_transactions', id));
          } else if (duplicateInboxIds.includes(id)) {
            cleanupBatch.delete(docPath(db, 'financial_inbox', id));
          }
        });

        await cleanupBatch.commit();
      }

      const existingByExternalId = transactionsByExternalId;
      const importedItems = [];
      const newTransactionsBatch = writeBatch(db);
      let newImported = 0;
      let alreadyPresent = 0;

      (data.transactions || []).forEach(rawTransaction => {
        if (!rawTransaction?.id) return;

        const externalId = `pluggy:${rawTransaction.id}`;
        const existing = existingByExternalId.get(externalId);
        const financialAccountId = `${companyId}_pluggy_account_${rawTransaction.accountId}`;

        if (existing) {
          alreadyPresent += 1;
          importedItems.push({
            ref: docPath(db, 'financial_transactions', existing.id),
            id: existing.id,
            data: existing,
            rawTransaction,
            isNew: false,
          });
          return;
        }

        try {
          const normalized = pluggyTransactionToFinancial({
            transaction: rawTransaction,
            companyId,
            financialAccountId,
          });

          const ref = doc(collectionPath(db, 'financial_transactions'));
          const item = {
            ref,
            id: ref.id,
            data: {
              ...normalized,
              importedAt: serverTimestamp(),
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            },
            rawTransaction,
            isNew: true,
          };

          newTransactionsBatch.set(ref, item.data);
          importedItems.push(item);
          existingByExternalId.set(externalId, {
            ...item.data,
            id: ref.id,
          });
          newImported += 1;
        } catch (err) {
          console.error('Transação Pluggy ignorada:', err);
        }
      });

      if (newImported > 0) {
        await newTransactionsBatch.commit();
      }

      // O pool local já contém os lançamentos novos, mesmo antes do onSnapshot
      // do Firestore chegar ao React. Isso permite parear uma transferência
      // importada nas duas pontas no mesmo ciclo de sincronização.
      const pool = transactions
        .filter(tx => tx.companyId === companyId)
        .concat(importedItems.map(item => ({
          ...item.data,
          id: item.id,
        })));

      const openInboxByTransaction = new Map();
      companyInbox
        .filter(item => item.status !== 'RESOLVED')
        .forEach(item => {
          if (!openInboxByTransaction.has(item.transactionId)) {
            openInboxByTransaction.set(item.transactionId, []);
          }
          openInboxByTransaction.get(item.transactionId).push(item);
        });

      const pendingInbox = [];
      const resolvedInbox = [];
      let classifiedAutomatically = 0;
      let reconciledAutomatically = 0;
      let transferMatches = 0;
      let cardMatches = 0;
      let payableMatches = 0;
      let receivableMatches = 0;
      let attentionQueued = 0;

      const processPluggyTransaction = async ({ item, rawTransaction }) => {
        const poolVersion = pool.find(candidate => candidate.id === item.id);
        const tx = {
          ...item.data,
          ...(poolVersion || {}),
          id: item.id,
        };
        const description = tx.description || rawTransaction?.description || 'Movimentação bancária';
        const merchant = tx.merchant || description;
        const transferLike = isPluggyTransfer(rawTransaction) || isTransferDescription(description);
        const cardLike = isPluggyCardBillPayment(rawTransaction) || isCardPaymentDescription(description);
        const remembered = findRememberedRule(merchant);
        const rememberedRule = remembered.status === 'MATCH' ? remembered.rule : null;

        const shouldPreserveReconciled =
          tx.status === 'RECONCILED'
          || tx.reconciliationType === 'TRANSFER'
          || !!tx.billId
          || !!tx.payableId
          || !!tx.receivableId;

        // Reclassifica automaticamente apenas fatos que ainda não foram
        // conciliados. Transferências nunca recebem categoria/projeto.
        let nextCategoryId = tx.categoryId || null;
        let nextProjectId = tx.projectId || null;
        let nextStatus = tx.status || 'IDENTIFICATION_REQUIRED';

        if (!shouldPreserveReconciled) {
          if (transferLike) {
            nextCategoryId = null;
            nextProjectId = null;
            nextStatus = 'IDENTIFICATION_REQUIRED';
          } else if (rememberedRule) {
            nextCategoryId = rememberedRule.categoryId || null;
            nextProjectId = rememberedRule.projectId || null;
            nextStatus = (nextCategoryId || nextProjectId) ? 'CLASSIFIED' : 'IDENTIFICATION_REQUIRED';
            if (nextStatus === 'CLASSIFIED' && tx.status !== 'CLASSIFIED') {
              classifiedAutomatically += 1;
            }
          } else {
            nextCategoryId = null;
            nextProjectId = null;
            nextStatus = 'IDENTIFICATION_REQUIRED';
          }

          const classificationChanged =
            nextCategoryId !== (tx.categoryId || null)
            || nextProjectId !== (tx.projectId || null)
            || nextStatus !== (tx.status || 'IDENTIFICATION_REQUIRED');

          if (classificationChanged) {
            await updateDoc(docPath(db, 'financial_transactions', item.id), {
              categoryId: nextCategoryId,
              projectId: nextProjectId,
              status: nextStatus,
              updatedAt: serverTimestamp(),
            });
          }
        }

        let reconciliationResult = { status: 'NO_MATCH' };

        if (!shouldPreserveReconciled) {
          if (transferLike) {
            reconciliationResult = await reconcileTransfer({
              transactionId: item.id,
              amountCents: Number(tx.amountCents || 0),
              date: tx.date,
              description,
              accountId: tx.accountId,
              type: tx.type,
              pool,
            });

            if (reconciliationResult.status === 'MATCHED') {
              transferMatches += 1;
            }
          }

          if (reconciliationResult.status !== 'MATCHED' && !transferLike && tx.type === 'EXPENSE') {
            if (cardLike) {
              reconciliationResult = await reconcileCardPayment({
                transactionId: item.id,
                amountCents: Number(tx.amountCents || 0),
                date: tx.date,
                description,
                accountId: tx.accountId,
              });

              if (reconciliationResult.status === 'MATCHED') {
                cardMatches += 1;
              }
            }

            if (reconciliationResult.status !== 'MATCHED') {
              const plannedResult = await reconcilePlannedPayment({
                transactionId: item.id,
                amountCents: Number(tx.amountCents || 0),
                date: tx.date,
                description,
                type: 'PAYABLE',
              });
              reconciliationResult = plannedResult;

              if (plannedResult.status === 'MATCHED') {
                payableMatches += 1;
              }
            }
          }

          if (reconciliationResult.status !== 'MATCHED' && !transferLike && tx.type === 'INCOME') {
            reconciliationResult = await reconcilePlannedPayment({
              transactionId: item.id,
              amountCents: Number(tx.amountCents || 0),
              date: tx.date,
              description,
              type: 'RECEIVABLE',
            });

            if (reconciliationResult.status === 'MATCHED') {
              receivableMatches += 1;
            }
          }
        }

        if (reconciliationResult.status === 'MATCHED') {
          reconciledAutomatically += 1;
          const existingAttention = openInboxByTransaction.get(item.id) || [];
          existingAttention.forEach(attention => resolvedInbox.push(attention));

          // O objeto local é atualizado para impedir que a outra ponta de uma
          // transferência tente reutilizar este lançamento no mesmo ciclo.
          tx.status = 'RECONCILED';
          tx.reconciliationType =
            reconciliationResult.transferId ? 'TRANSFER'
            : reconciliationResult.item?.status === 'PAID' || reconciliationResult.item?.status === 'PARTIALLY_PAID'
              ? 'PAYABLE_PAYMENT'
              : reconciliationResult.item?.status === 'RECEIVED' || reconciliationResult.item?.status === 'PARTIALLY_RECEIVED'
                ? 'RECEIVABLE_RECEIPT'
                : 'CARD_BILL_PAYMENT';

          const poolIndex = pool.findIndex(candidate => candidate.id === item.id);
          if (poolIndex >= 0) {
            pool[poolIndex] = {
              ...pool[poolIndex],
              ...tx,
              status: 'RECONCILED',
              reconciliationType: tx.reconciliationType,
              transferId: reconciliationResult.transferId || pool[poolIndex].transferId || null,
              billId: reconciliationResult.bill?.id || pool[poolIndex].billId || null,
              payableId: reconciliationResult.item?.id && tx.type === 'EXPENSE'
                ? reconciliationResult.item.id
                : (pool[poolIndex].payableId || null),
              receivableId: reconciliationResult.item?.id && tx.type === 'INCOME'
                ? reconciliationResult.item.id
                : (pool[poolIndex].receivableId || null),
            };
          }

          if (reconciliationResult.transferId) {
            const candidateIndex = pool.findIndex(candidate => candidate.id === reconciliationResult.tx?.id);
            if (candidateIndex >= 0) {
              pool[candidateIndex] = {
                ...pool[candidateIndex],
                status: 'RECONCILED',
                reconciliationType: 'TRANSFER',
                transferId: reconciliationResult.transferId,
                categoryId: null,
                projectId: null,
              };
            }
          }
          return;
        }

        if (shouldPreserveReconciled) {
          const existingAttention = openInboxByTransaction.get(item.id) || [];
          existingAttention.forEach(attention => resolvedInbox.push(attention));
          return;
        }

        const classificationNeedsAttention =
          transferLike
          || cardLike
          || remembered.status === 'AMBIGUOUS'
          || reconciliationResult.status === 'AMBIGUOUS'
          || nextStatus === 'IDENTIFICATION_REQUIRED';

        if (!classificationNeedsAttention) return;

        let kind = 'CLASSIFICATION';
        let reason = tx.type === 'INCOME'
          ? 'Identificar entrada importada'
          : 'Classificar movimentação importada';
        let confidence = 0;

        if (cardLike) {
          kind = 'CARD_BILL_PAYMENT';
          reason = 'Conciliar pagamento de cartão';
          confidence = 50;
        } else if (reconciliationResult.status === 'AMBIGUOUS' && tx.type === 'EXPENSE') {
          kind = 'PAYABLE_PAYMENT';
          reason = 'Conciliar conta a pagar';
          confidence = 60;
        } else if (reconciliationResult.status === 'AMBIGUOUS' && tx.type === 'INCOME') {
          kind = 'RECEIVABLE_RECEIPT';
          reason = 'Conciliar conta a receber';
          confidence = 60;
        } else if (transferLike) {
          reason = 'Verificar possível transferência entre contas';
          confidence = 40;
        } else if (remembered.status === 'AMBIGUOUS') {
          confidence = 65;
        }

        const existingAttention = openInboxByTransaction.get(item.id) || [];
        if (!existingAttention.length) {
          const attentionRef = doc(collectionPath(db, 'financial_inbox'));
          pendingInbox.push({
            ref: attentionRef,
            data: {
              companyId,
              transactionId: item.id,
              kind,
              reason,
              confidence,
              source: 'PLUGGY',
              status: 'OPEN',
              createdAt: serverTimestamp(),
            },
          });
          openInboxByTransaction.set(item.id, [{
            id: attentionRef.id,
            transactionId: item.id,
            status: 'OPEN',
          }]);
          attentionQueued += 1;
        }
      };

      // Processa em ordem. As duas pontas de uma transferência ficam no pool
      // e podem se reconciliar automaticamente sem depender de um novo snapshot.
      for (const item of importedItems) {
        try {
          await processPluggyTransaction(item);
        } catch (transactionError) {
          // Um lançamento problemático não pode interromper a sincronização
          // das demais movimentações do banco.
          console.error('Falha ao processar transação Pluggy', item?.id, transactionError);
          if (item?.id) {
            const attentionRef = doc(collectionPath(db, 'financial_inbox'));
            pendingInbox.push({
              ref: attentionRef,
              data: {
                companyId,
                transactionId: item.id,
                kind: 'CLASSIFICATION',
                reason: 'Verificar movimentação importada automaticamente',
                confidence: 0,
                source: 'PLUGGY',
                status: 'OPEN',
                createdAt: serverTimestamp(),
              },
            });
            attentionQueued += 1;
          }
        }
      }

      // Fecha automaticamente itens antigos de Atenção quando uma sincronização
      // posterior conseguiu resolver o fato.
      for (let start = 0; start < resolvedInbox.length; start += 400) {
        const batch = writeBatch(db);
        resolvedInbox
          .slice(start, start + 400)
          .forEach(item => {
            if (item?.id) {
              batch.update(docPath(db, 'financial_inbox', item.id), {
                status: 'RESOLVED',
                resolvedAt: serverTimestamp(),
                resolvedBy: 'SYSTEM_PLUGGY_SYNC',
              });
            }
          });
        await batch.commit();
      }

      for (let start = 0; start < pendingInbox.length; start += 400) {
        const batch = writeBatch(db);
        pendingInbox
          .slice(start, start + 400)
          .forEach(item => batch.set(item.ref, item.data));
        await batch.commit();
      }

      await setDoc(docPath(db, 'financial_connections', `${companyId}_${connection.itemId}`), {
        companyId,
        itemId: connection.itemId,
        connectorId: data.item?.connectorId || connection.connectorId || null,
        connectorName: data.item?.connectorName || connection.connectorName || 'Instituição financeira',
        clientUserId: connection.clientUserId || null,
        status: data.item?.status || connection.status || 'UPDATED',
        lastConnectedAt: connection.lastConnectedAt || new Date().toISOString(),
        lastSyncedAt: data.syncedAt || new Date().toISOString(),
        lastSyncTransactions: (data.transactions || []).length,
        lastSyncAccounts: (data.bankAccounts || []).length,
        lastSyncCreditAccounts: (data.creditAccounts || []).length,
        syncTruncated: Boolean(data.truncated),
        autoClassified: classifiedAutomatically,
        autoReconciled: reconciledAutomatically,
        attentionQueued,
        updatedAt: serverTimestamp(),
      }, { merge: true });

      const detail = [
        `${data.bankAccounts?.length || 0} conta(s) sincronizada(s)`,
        `${newImported} movimentação(ões) nova(s)`,
        `${reconciledAutomatically} conciliação(ões) automática(s)`,
        `${classifiedAutomatically} classificação(ões) automática(s)`,
        attentionQueued ? `${attentionQueued} item(ns) enviado(s) para Atenção` : 'nenhum novo item de Atenção',
      ].join(' · ');

      setNotice(
        `Pluggy sincronizado: ${detail}.${data.truncated ? ' A sincronização atingiu o limite técnico de 10.000 movimentações.' : ''}`
      );
    } catch (err) {
      setNotice(err.message || 'Falha ao sincronizar a conexão Pluggy.');
    } finally {
      setBusy(false);
    }
  };

  const createAccount = async (data) => {
    const name = data.name.trim();
    if (!name) return;
    setBusy(true);
    try {
      await addDoc(collectionPath(db, 'financial_accounts'), {
        companyId, name, institution: data.institution.trim(), type: data.type,
        balanceCents: toCents(data.balance), active: true,
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      setModal(null);
      setNotice('Conta adicionada.');
    } finally { setBusy(false); }
  };

  const createTransaction = async (data) => {
    if (!data.description.trim() || !data.accountId || !data.amount) return;
    setBusy(true);
    try {
      const amountCents = Math.abs(toCents(data.amount));
      const type = data.type;
      const duplicate = findDuplicateTransaction({
        accountId: data.accountId,
        date: data.date,
        amountCents,
        type,
        description: data.description
      });
      if (duplicate) {
        setNotice(`Esta movimentação já existe: "${duplicate.description}" em ${dateLabel(duplicate.date)}. Nenhum duplicado foi criado.`);
        return;
      }

      const normalizedMerchant = normalizeText(data.merchant || data.description);
      const remembered = findRememberedRule(data.merchant || data.description);
      const rememberedRule = remembered.status === 'MATCH' ? remembered.rule : null;
      const effectiveCategoryId = data.categoryId || rememberedRule?.categoryId || null;
      const effectiveProjectId = data.projectId || rememberedRule?.projectId || null;
      const category = categories.find(c => c.id === effectiveCategoryId);
      const status = type === 'INCOME'
        ? (effectiveCategoryId || data.clientId ? 'CLASSIFIED' : 'IDENTIFICATION_REQUIRED')
        : (effectiveCategoryId ? 'CLASSIFIED' : 'IDENTIFICATION_REQUIRED');
      const ref = await addDoc(collectionPath(db, 'financial_transactions'), {
        companyId, source: 'MANUAL', externalId: null,
        accountId: data.accountId, cardId: data.cardId || null,
        date: data.date, actualDate: data.date, expectedDate: null,
        description: data.description.trim(), merchant: data.merchant?.trim() || data.description.trim(),
        normalizedMerchant, amountCents, type, status,
        categoryId: category?.id || null, projectId: effectiveProjectId || null,
        clientId: data.clientId || null, supplierId: data.supplierId || null,
        notes: data.notes?.trim() || '', createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });

      let reconciliationResult = { status: 'NO_MATCH' };
      if (isTransferDescription(data.description)) {
        reconciliationResult = await reconcileTransfer({
          transactionId: ref.id, amountCents, date: data.date,
          description: data.description.trim(), accountId, type,
          pool: transactions
        });
      }
      if (reconciliationResult.status !== 'MATCHED' && type === 'EXPENSE') {
        reconciliationResult = await reconcileCardPayment({
          transactionId: ref.id, amountCents, date: data.date,
          description: data.description.trim(), accountId
        });
        if (reconciliationResult.status !== 'MATCHED') {
          reconciliationResult = await reconcilePlannedPayment({
            transactionId: ref.id, amountCents, date: data.date,
            description: data.description.trim(), type: 'PAYABLE'
          });
        }
      } else if (reconciliationResult.status !== 'MATCHED' && type === 'INCOME') {
        reconciliationResult = await reconcilePlannedPayment({
          transactionId: ref.id, amountCents, date: data.date,
          description: data.description.trim(), type: 'RECEIVABLE'
        });
      }

      const reconciled = reconciliationResult.status === 'MATCHED';
      const cardPayment = type === 'EXPENSE' && isCardPaymentDescription(data.description);
      if (!reconciled && (status === 'IDENTIFICATION_REQUIRED' || remembered.status === 'AMBIGUOUS' || reconciliationResult.status === 'AMBIGUOUS' || cardPayment)) {
        const plannedKind = !cardPayment && type === 'EXPENSE' && reconciliationResult.status === 'AMBIGUOUS' ? 'PAYABLE_PAYMENT' : (
          type === 'INCOME' && reconciliationResult.status === 'AMBIGUOUS' ? 'RECEIVABLE_RECEIPT' : 'CLASSIFICATION'
        );
        await addDoc(collectionPath(db, 'financial_inbox'), {
          companyId, transactionId: ref.id,
          kind: cardPayment ? 'CARD_BILL_PAYMENT' : plannedKind,
          reason: cardPayment ? 'Conciliar pagamento de cartão' : (
            isTransferDescription(data.description) ? 'Verificar possível transferência' :
            plannedKind === 'PAYABLE_PAYMENT' ? 'Conciliar conta a pagar' :
            plannedKind === 'RECEIVABLE_RECEIPT' ? 'Conciliar conta a receber' :
            (type === 'INCOME' ? 'Identificar entrada' : 'Classificar movimentação')
          ),
          confidence: cardPayment ? 50 : (
            reconciliationResult.status === 'AMBIGUOUS' ? 60 :
            remembered.status === 'AMBIGUOUS' ? 65 : 0
          ),
          status: 'OPEN', createdAt: serverTimestamp(),
        });
      }
      setModal(null);
      const noticeText = reconciliationResult.status === 'MATCHED'
        ? (type === 'INCOME' ? 'Recebimento identificado e conciliado automaticamente.' : 'Pagamento identificado e conciliado automaticamente.')
        : 'Movimentação registrada.';
      setNotice(noticeText);
    } finally { setBusy(false); }
  };

  const bulkClassifyGroup = async ({ group, categoryId, projectId, clientId, rememberMerchant }) => {
    if (!group?.items?.length || !categoryId) return;

    setBulkBusyKey(group.key);
    try {
      if (rememberMerchant) {
        const ruleId = `${companyId}_${group.key.replace(/[^a-z0-9_-]+/g, '_').slice(0, 120)}`;
        await setDoc(docPath(db, 'financial_rules', ruleId), {
          companyId,
          merchantNormalized: group.key,
          categoryId,
          projectId: projectId || null,
          updatedAt: serverTimestamp(),
        }, { merge: true });
      }

      const safeItems = group.items.filter(item => item?.id && item?.transaction?.id);
      for (let start = 0; start < safeItems.length; start += 240) {
        const batch = writeBatch(db);
        safeItems.slice(start, start + 240).forEach(item => {
          batch.update(docPath(db, 'financial_transactions', item.transaction.id), {
            categoryId,
            projectId: projectId || null,
            clientId: clientId || null,
            status: 'CLASSIFIED',
            updatedAt: serverTimestamp(),
          });
          batch.update(docPath(db, 'financial_inbox', item.id), {
            status: 'RESOLVED',
            resolvedAt: serverTimestamp(),
            resolvedBy: appUser?.id || 'SYSTEM_BULK_CLASSIFICATION',
          });
        });
        await batch.commit();
      }

      setNotice(`${safeItems.length} movimentação(ões) de “${group.merchant}” classificada(s) de uma vez.${rememberMerchant ? ' Regra salva para próximos lançamentos.' : ''}`);
    } catch (err) {
      setNotice(err.message || 'Não foi possível classificar este grupo.');
    } finally {
      setBulkBusyKey('');
    }
  };

  const resolveInbox = async (item, data) => {
    const tx = transactions.find(t => t.id === item.transactionId);
    if (!tx) return;
    setBusy(true);
    try {
      if (item.kind === 'PAYABLE_PAYMENT' && data.payableId) {
        const payable = payables.find(p => p.id === data.payableId);
        if (!payable) throw new Error('Conta a pagar selecionada não foi encontrada.');
        const remaining = Number(payable.amountCents || 0) - Number(payable.paidCents || 0);
        if (tx.type !== 'EXPENSE' || Number(tx.amountCents || 0) <= 0 || Number(tx.amountCents || 0) > remaining) {
          throw new Error('O valor do pagamento não pode ser maior que o saldo da conta.');
        }
        const paidCents = Number(payable.paidCents || 0) + Number(tx.amountCents || 0);
        await updateDoc(docPath(db, 'financial_payables', payable.id), {
          paidCents,
          status: paidCents >= Number(payable.amountCents || 0) ? 'PAID' : 'PARTIALLY_PAID',
          paymentTransactionId: tx.id,
          actualDate: tx.date,
          updatedAt: serverTimestamp(),
        });
        await updateDoc(docPath(db, 'financial_transactions', tx.id), {
          status: 'RECONCILED',
          reconciliationType: 'PAYABLE_PAYMENT',
          payableId: payable.id,
          updatedAt: serverTimestamp(),
        });
        await updateDoc(docPath(db, 'financial_inbox', item.id), {
          status: 'RESOLVED', resolvedAt: serverTimestamp(), resolvedBy: appUser?.id || null,
        });
        setNotice(paidCents >= Number(payable.amountCents || 0) ? 'Conta a pagar conciliada e marcada como paga.' : 'Pagamento parcial conciliado.');
        return;
      }

      if (item.kind === 'RECEIVABLE_RECEIPT' && data.receivableId) {
        const receivable = receivables.find(r => r.id === data.receivableId);
        if (!receivable) throw new Error('Conta a receber selecionada não foi encontrada.');
        const remaining = Number(receivable.amountCents || 0) - Number(receivable.receivedCents || 0);
        if (tx.type !== 'INCOME' || Number(tx.amountCents || 0) <= 0 || Number(tx.amountCents || 0) > remaining) {
          throw new Error('O valor do recebimento não pode ser maior que o saldo previsto.');
        }
        const receivedCents = Number(receivable.receivedCents || 0) + Number(tx.amountCents || 0);
        await updateDoc(docPath(db, 'financial_receivables', receivable.id), {
          receivedCents,
          status: receivedCents >= Number(receivable.amountCents || 0) ? 'RECEIVED' : 'PARTIALLY_RECEIVED',
          receiptTransactionId: tx.id,
          actualDate: tx.date,
          updatedAt: serverTimestamp(),
        });
        await updateDoc(docPath(db, 'financial_transactions', tx.id), {
          status: 'RECONCILED',
          reconciliationType: 'RECEIVABLE_RECEIPT',
          receivableId: receivable.id,
          updatedAt: serverTimestamp(),
        });
        await updateDoc(docPath(db, 'financial_inbox', item.id), {
          status: 'RESOLVED', resolvedAt: serverTimestamp(), resolvedBy: appUser?.id || null,
        });
        setNotice(receivedCents >= Number(receivable.amountCents || 0) ? 'Conta a receber conciliada e marcada como recebida.' : 'Recebimento parcial conciliado.');
        return;
      }

      if (item.kind === 'CARD_BILL_PAYMENT' && data.billId) {
        const bill = bills.find(b => b.id === data.billId);
        if (!bill) throw new Error('Fatura selecionada não foi encontrada.');
        const remaining = Number(bill.totalCents || 0) - Number(bill.paidCents || 0);
        if (tx.type !== 'EXPENSE' || Number(tx.amountCents || 0) <= 0 || Number(tx.amountCents || 0) > remaining) {
          throw new Error('O valor do pagamento não pode ser maior que o saldo da fatura.');
        }
        const paidCents = Number(bill.paidCents || 0) + Number(tx.amountCents || 0);
        await updateDoc(docPath(db, 'financial_bills', bill.id), {
          paidCents,
          status: paidCents >= Number(bill.totalCents || 0) ? 'PAID' : 'PARTIALLY_PAID',
          lastPaymentTransactionId: tx.id,
          lastPaidAt: tx.date,
          updatedAt: serverTimestamp(),
        });
        await updateDoc(docPath(db, 'financial_transactions', tx.id), {
          status: 'RECONCILED',
          reconciliationType: 'CARD_BILL_PAYMENT',
          billId: bill.id,
          cardId: bill.cardId,
          updatedAt: serverTimestamp(),
        });
        await updateDoc(docPath(db, 'financial_inbox', item.id), {
          status: 'RESOLVED',
          resolvedAt: serverTimestamp(),
          resolvedBy: appUser?.id || null,
        });
        setNotice(paidCents >= Number(bill.totalCents || 0) ? 'Fatura conciliada e marcada como paga.' : 'Pagamento parcial conciliado.');
        return;
      }

      await updateDoc(docPath(db, 'financial_transactions', tx.id), {
        categoryId: data.categoryId || null,
        projectId: data.projectId || null,
        clientId: data.clientId || null,
        status: data.categoryId || data.projectId || data.clientId ? 'CLASSIFIED' : 'IDENTIFICATION_REQUIRED',
        updatedAt: serverTimestamp(),
      });
      await updateDoc(docPath(db, 'financial_inbox', item.id), {
        status: 'RESOLVED', resolvedAt: serverTimestamp(), resolvedBy: appUser?.id || null,
      });
      if (data.rememberMerchant && tx.normalizedMerchant && data.categoryId) {
        await setDoc(docPath(db, 'financial_rules', `${companyId}_${tx.normalizedMerchant}`), {
          companyId, merchantNormalized: tx.normalizedMerchant, categoryId: data.categoryId,
          projectId: data.projectId || null, updatedAt: serverTimestamp(),
        }, { merge: true });
      }
      setNotice('Movimentação conciliada e regra de classificação salva.');
    } finally { setBusy(false); }
  };

  const importCsv = async (file, accountId) => {
    if (!file || !accountId) return;
    setBusy(true);
    try {
      const raw = await file.text();
      const lines = raw.split(/\r?\n/).filter(Boolean);
      if (lines.length < 2) throw new Error('CSV sem linhas de dados.');
      const header = detectCsvHeader(lines[0]);
      if (header.date < 0 || header.description < 0 || header.amount < 0) {
        throw new Error('Não encontrei Data, Descrição e Valor no CSV.');
      }

      const existing = new Set(transactions.map(t => transactionKey(t)));
      let imported = 0, skipped = 0;
      for (const line of lines.slice(1)) {
        const cells = parseCsvLine(line, header.separator);
        const date = cells[header.date];
        const description = cells[header.description] || 'Movimentação importada';
        const amountCents = parseCsvAmount(cells[header.amount]);
        if (!date || !amountCents) { skipped += 1; continue; }

        const isoDate = date.includes('/') ? date.split('/').reverse().join('-') : date;
        const type = amountCents >= 0 ? 'INCOME' : 'EXPENSE';
        const normalizedAmount = Math.abs(amountCents);
        const normalizedMerchant = normalizeText(description);
        const remembered = findRememberedRule(description);
        const rememberedRule = remembered.status === 'MATCH' ? remembered.rule : null;
        const externalId = transactionKey({ accountId, date: isoDate, description, amountCents: normalizedAmount });
        if (existing.has(externalId)) { skipped += 1; continue; }

        const duplicate = findDuplicateTransaction({
          accountId,
          date: isoDate,
          amountCents: normalizedAmount,
          type,
          description
        });
        if (duplicate) {
          skipped += 1;
          continue;
        }

        const ref = await addDoc(collectionPath(db, 'financial_transactions'), {
          companyId, source: 'CSV', externalId, accountId, cardId: null,
          date: isoDate, actualDate: isoDate, expectedDate: null, description,
          merchant: description, normalizedMerchant,
          amountCents: normalizedAmount, type,
          status: isTransferDescription(description)
            ? 'IDENTIFICATION_REQUIRED'
            : (rememberedRule?.categoryId ? 'CLASSIFIED' : 'IDENTIFICATION_REQUIRED'),
          categoryId: isTransferDescription(description) ? null : (rememberedRule?.categoryId || null),
          projectId: isTransferDescription(description) ? null : (rememberedRule?.projectId || null),
          clientId: null, supplierId: null,
          importedAt: serverTimestamp(), createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        });
        let reconciliationResult = { status: 'NO_MATCH' };
        if (type === 'EXPENSE') {
          reconciliationResult = await reconcileCardPayment({
            transactionId: ref.id, amountCents: normalizedAmount, date: isoDate,
            description, accountId
          });
          if (reconciliationResult.status !== 'MATCHED') {
            reconciliationResult = await reconcilePlannedPayment({
              transactionId: ref.id, amountCents: normalizedAmount, date: isoDate,
              description, type: 'PAYABLE'
            });
          }
        } else if (type === 'INCOME') {
          reconciliationResult = await reconcilePlannedPayment({
            transactionId: ref.id, amountCents: normalizedAmount, date: isoDate,
            description, type: 'RECEIVABLE'
          });
        }

        const reconciled = reconciliationResult.status === 'MATCHED';
        const cardPayment = type === 'EXPENSE' && isCardPaymentDescription(description);
        if (!reconciled && (
          (!rememberedRule?.categoryId && !isTransferDescription(description)) ||
          remembered.status === 'AMBIGUOUS' ||
          reconciliationResult.status === 'AMBIGUOUS' ||
          cardPayment ||
          isTransferDescription(description)
        )) {
          const plannedKind = !cardPayment && type === 'EXPENSE' && reconciliationResult.status === 'AMBIGUOUS' ? 'PAYABLE_PAYMENT' : (
            type === 'INCOME' && reconciliationResult.status === 'AMBIGUOUS' ? 'RECEIVABLE_RECEIPT' : 'CLASSIFICATION'
          );
          await addDoc(collectionPath(db, 'financial_inbox'), {
            companyId, transactionId: ref.id,
            kind: cardPayment ? 'CARD_BILL_PAYMENT' : plannedKind,
            reason: cardPayment ? 'Conciliar pagamento de cartão' : (
              plannedKind === 'PAYABLE_PAYMENT' ? 'Conciliar conta a pagar' :
              plannedKind === 'RECEIVABLE_RECEIPT' ? 'Conciliar conta a receber' :
              (type === 'INCOME' ? 'Identificar entrada importada' : 'Classificar despesa importada')
            ),
            confidence: cardPayment ? 50 : (
              reconciliationResult.status === 'AMBIGUOUS' ? 60 :
              remembered.status === 'AMBIGUOUS' ? 65 :
              isTransferDescription(description) ? 40 : 0
            ),
            status: 'OPEN', createdAt: serverTimestamp(),
          });
        }
        existing.add(externalId);
        imported += 1;
      }
      setModal(null);
      setNotice(`${imported} movimentações importadas. ${skipped} linhas ignoradas/duplicadas.`);
    } catch (err) {
      setNotice(err.message || 'Não foi possível importar o arquivo.');
    } finally { setBusy(false); }
  };

  const shiftMonth = (delta) => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  return (
    <div className="h-full flex flex-col animate-in fade-in">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 mb-5">
        <div>
          <div className="flex items-center gap-2">
            <WalletCards className="text-[#1e5aa0]" size={25}/>
            <h3 className="text-2xl font-black text-slate-800 tracking-tight">Financeiro</h3>
          </div>
          <p className="text-slate-500 text-sm font-medium">Seu dinheiro, suas obrigações e o que precisa de atenção — em um só lugar.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setModal({ type: 'csv' })} className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl font-bold text-xs text-slate-700 flex items-center gap-2 hover:bg-slate-50">
            <FileUp size={16}/> Importar CSV
          </button>
          <button onClick={() => openNewTransaction('INCOME')} className="px-3 py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-xs flex items-center gap-2 hover:bg-emerald-700">
            <Plus size={16}/> Entrada
          </button>
          <button onClick={() => setModal({type:'transfer'})} className="px-3 py-2.5 bg-slate-800 text-white rounded-xl font-bold text-xs flex items-center gap-2 hover:bg-slate-900">
            <ArrowLeftRight size={16}/> Transferência
          </button>
          <button onClick={() => openNewTransaction('EXPENSE')} className="px-3 py-2.5 bg-[#1e5aa0] text-white rounded-xl font-bold text-xs flex items-center gap-2 hover:bg-[#154278]">
            <Plus size={16}/> Despesa
          </button>
        </div>
      </div>

      {notice && (
        <button onClick={() => setNotice('')} className="mb-4 w-full text-left bg-blue-50 border border-blue-100 text-blue-800 rounded-xl p-3 text-xs font-bold">
          {notice} <span className="float-right">×</span>
        </button>
      )}

      <div className="flex flex-wrap gap-2 mb-5">
        {[
          ['overview', 'Visão geral'],
          ['calendar', 'Calendário'],
          ['transactions', 'Movimentações'],
          ['attention', `Atenção ${attentionCount ? `(${attentionCount})` : ''}`],
          ['planning', 'A pagar / A receber'],
          ['transfers', 'Transferências'],
          ['accounts', 'Contas e cartões'],
        ].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wide border transition-colors ${tab === id ? 'bg-[#1e5aa0] text-white border-[#1e5aa0]' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="space-y-5 overflow-auto pb-4">
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            <Metric label="Saldo cadastrado" value={formatBRL(accountBalance)} icon={<Landmark size={18}/>} tone="blue"/>
            <Metric label="Entradas no mês" value={formatBRL(totals.income)} icon={<ArrowUpCircle size={18}/>} tone="green"/>
            <Metric label="Saídas no mês" value={formatBRL(totals.expense)} icon={<ArrowDownCircle size={18}/>} tone="red"/>
            <Metric label="Resultado do mês" value={formatBRL(totals.result)} icon={<ArrowLeftRight size={18}/>} tone={totals.result >= 0 ? 'green' : 'red'}/>
            <Metric label="Em aberto a pagar" value={formatBRL(payableOpenTotal)} icon={<ArrowDownCircle size={18}/>} tone="amber"/>
            <Metric label="Em aberto a receber" value={formatBRL(receivableOpenTotal)} icon={<ArrowUpCircle size={18}/>} tone="blue"/>
          </div>

          <div className="grid lg:grid-cols-[1.35fr_.65fr] gap-5">
            <Card className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <h4 className="font-black text-slate-800">Fluxo recente</h4>
                  <p className="text-xs text-slate-400 font-medium">Fatos que já aconteceram.</p>
                </div>
                <button onClick={() => setTab('transactions')} className="text-xs font-black text-[#1e5aa0]">Ver tudo</button>
              </div>
              <div className="space-y-2">
                {transactions.slice(0, 6).map(t => (
                  <TransactionRow key={t.id} tx={t} accounts={accounts} categories={categories}/>
                ))}
                {!transactions.length && <EmptyState text="Comece cadastrando uma conta e importando suas movimentações."/>}
              </div>
            </Card>

            <Card className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <CircleAlert className={attentionCount ? 'text-amber-500' : 'text-emerald-500'} size={19}/>
                <h4 className="font-black text-slate-800">O que precisa de você</h4>
              </div>
              {attentionCount ? (
                <div className="space-y-3">
                  <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl">
                    <div className="text-2xl font-black text-amber-800">{attentionCount}</div>
                    <div className="text-xs font-bold text-amber-700 mt-1">movimentações aguardando identificação/classificação.</div>
                  </div>
                  <button onClick={() => setTab('attention')} className="w-full bg-amber-500 text-white font-black text-xs py-3 rounded-xl uppercase">Resolver agora</button>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-100 text-sm font-bold text-emerald-700">
                  Tudo que entrou no sistema está identificado.
                </div>
              )}
            </Card>
          </div>

          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h4 className="font-black text-slate-800">Mês em foco</h4>
                <p className="text-xs text-slate-400">{selectedMonth}</p>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => shiftMonth(-1)} className="p-2 border rounded-lg hover:bg-slate-50"><ChevronLeft size={16}/></button>
                <button onClick={() => setSelectedMonth(todayLocal().slice(0, 7))} className="px-3 py-2 border rounded-lg text-xs font-bold hover:bg-slate-50">Hoje</button>
                <button onClick={() => shiftMonth(1)} className="p-2 border rounded-lg hover:bg-slate-50"><ChevronRight size={16}/></button>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1 text-[10px] font-black uppercase text-slate-400 mb-2">
              {['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'].map(d => <div key={d} className="p-2 text-center">{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {days.map((day, idx) => {
                const dayTx = day ? monthTransactions.filter(t => (t.date || '') === day) : [];
                const dayPlanned = day ? plannedEvents.filter(t => (t.date || '') === day) : [];
                const income = dayTx.filter(t => t.type === 'INCOME').reduce((s,t)=>s+Number(t.amountCents||0),0);
                const expense = dayTx.filter(t => t.type === 'EXPENSE').reduce((s,t)=>s+Number(t.amountCents||0),0);
                const plannedIncome = dayPlanned.filter(t => t.type === 'RECEIVABLE').reduce((s,t)=>s+Number(t.amountCents||0),0);
                const plannedExpense = dayPlanned.filter(t => t.type === 'PAYABLE' || t.type === 'CARD_BILL').reduce((s,t)=>s+Number(t.amountCents||0),0);
                return <div key={`${day || 'blank'}-${idx}`} className="min-h-[76px] bg-slate-50 border border-slate-100 rounded-lg p-2">
                  {day && <div className="text-xs font-black text-slate-700">{Number(day.slice(8))}</div>}
                  {income > 0 && <div className="mt-2 text-[10px] font-bold text-emerald-600">+{formatBRL(income)}</div>}
                  {expense > 0 && <div className="text-[10px] font-bold text-red-600">-{formatBRL(expense)}</div>}
                  {plannedIncome > 0 && <div className="text-[10px] font-bold text-blue-600">↗ previsto {formatBRL(plannedIncome)}</div>}
                  {plannedExpense > 0 && <div className="text-[10px] font-bold text-amber-600">↘ previsto {formatBRL(plannedExpense)}</div>}
                  {(dayTx.length + dayPlanned.length) > 0 && <div className="mt-1 text-[9px] text-slate-400">{dayTx.length} real · {dayPlanned.length} previsto(s)</div>}
                </div>;
              })}
            </div>
          </Card>
        </div>
      )}

      {tab === 'calendar' && (
        <div className="space-y-5 flex-1 overflow-auto pb-4">
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            <Metric label="Saldo projetado hoje" value={formatBRL(projection.balanceToday)} icon={<Landmark size={18}/>} tone="blue"/>
            <Metric label="Entradas 30 dias" value={formatBRL(projection.totalIncome30)} icon={<ArrowUpCircle size={18}/>} tone="green"/>
            <Metric label="Saídas 30 dias" value={formatBRL(projection.totalExpense30)} icon={<ArrowDownCircle size={18}/>} tone="red"/>
            <Metric label="Mínimo projetado · 90d" value={formatBRL(projection.minimumBalance90)} icon={<CircleAlert size={18}/>} tone={projection.minimumBalance90 >= 0 ? 'amber' : 'red'}/>
          </div>

          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h4 className="font-black text-xl text-slate-800">Calendário financeiro</h4>
                <p className="text-xs text-slate-400">Eventos reais e previstos, com saldo projetado a partir do saldo cadastrado das contas.</p>
              </div>
              <div className="flex items-center gap-3 text-[10px] font-bold text-slate-500">
                <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500"></span>entrada real</span>
                <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500"></span>saída real</span>
                <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500"></span>previsto</span>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => shiftMonth(-1)} className="p-2 border rounded-lg hover:bg-slate-50"><ChevronLeft size={16}/></button>
                <button onClick={() => setSelectedMonth(todayLocal().slice(0, 7))} className="px-3 py-2 border rounded-lg text-xs font-bold hover:bg-slate-50">Hoje</button>
                <span className="px-3 text-sm font-black text-slate-700">{selectedMonth}</span>
                <button onClick={() => shiftMonth(1)} className="p-2 border rounded-lg hover:bg-slate-50"><ChevronRight size={16}/></button>
              </div>
            </div>

            <div className="mb-4 p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs font-medium text-slate-600">
              <strong className="text-slate-800">Projeção de 30 dias:</strong> {projection.net30 >= 0 ? 'saldo previsto para crescer' : 'saldo previsto para cair'} em <strong>{formatBRL(Math.abs(projection.net30))}</strong>, considerando apenas contas a pagar, contas a receber e faturas ainda em aberto. Transferências entre contas não alteram o resultado da empresa.
            </div>

            <div className="grid grid-cols-7 gap-1 text-[10px] font-black uppercase text-slate-400 mb-2">
              {['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'].map(d => <div key={d} className="p-2 text-center">{d}</div>)}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {days.map((day, idx) => {
                const dayTx = day ? monthTransactions.filter(t => (t.date || '') === day) : [];
                const dayPlanned = day ? plannedEvents.filter(t => (t.date || '') === day) : [];
                const dayProjection = day ? projection.byDate[day] : null;
                const actualIncome = dayTx.filter(t => t.type === 'INCOME').reduce((s,t)=>s+Number(t.amountCents||0),0);
                const actualExpense = dayTx.filter(t => t.type === 'EXPENSE').reduce((s,t)=>s+Number(t.amountCents||0),0);

                return <div key={`${day || 'blank2'}-${idx}`} className="min-h-[142px] border border-slate-100 rounded-lg p-2 bg-white">
                  {day && (
                    <div className="flex items-center justify-between">
                      <div className="font-black text-slate-700 text-xs">{Number(day.slice(8))}</div>
                      {dayProjection && <div className={`text-[9px] font-black ${dayProjection.balance < 0 ? 'text-red-600' : 'text-slate-400'}`}>saldo {formatBRL(dayProjection.balance)}</div>}
                    </div>
                  )}

                  <div className="space-y-1 mt-2">
                    {actualIncome > 0 && <div className="text-[9px] px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 font-bold">+ real {formatBRL(actualIncome)}</div>}
                    {actualExpense > 0 && <div className="text-[9px] px-2 py-1 rounded-lg bg-red-50 text-red-700 font-bold">− real {formatBRL(actualExpense)}</div>}

                    {dayPlanned.slice(0, 4).map(event => {
                      const isIncome = event.type === 'RECEIVABLE';
                      const label = event.type === 'CARD_BILL' ? 'fatura' : event.type === 'PAYABLE' ? 'a pagar' : 'a receber';
                      return <div key={event.id} className="text-[9px] px-2 py-1 rounded-lg border border-dashed border-slate-200 bg-blue-50 text-blue-700 font-bold">
                        {isIncome ? '↗' : '↘'} {label} {formatBRL(event.amountCents)} · {event.description}
                      </div>;
                    })}
                    {dayPlanned.length > 4 && <div className="text-[9px] text-slate-400">+{dayPlanned.length - 4} previstos</div>}
                  </div>
                </div>;
              })}
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h4 className="font-black text-slate-800">Próximos compromissos de caixa</h4>
                <p className="text-xs text-slate-400">Vencimentos e recebimentos que ainda podem alterar o caixa.</p>
              </div>
              <span className="text-[10px] font-black uppercase tracking-wide text-slate-400">90 dias</span>
            </div>
            <div className="space-y-2">
              {projection.daily
                .filter(day => day.events.length)
                .slice(0, 12)
                .map(day => (
                  <div key={day.date} className="border border-slate-100 rounded-xl p-3 flex flex-col md:flex-row md:items-center gap-3">
                    <div className="w-20 shrink-0">
                      <div className="text-[10px] font-black uppercase text-slate-400">{dateLabel(day.date)}</div>
                      <div className={`text-xs font-black ${day.balance < 0 ? 'text-red-600' : 'text-slate-700'}`}>{formatBRL(day.balance)}</div>
                    </div>
                    <div className="flex-1 space-y-1">
                      {day.events.map(event => (
                        <div key={event.id} className="flex items-center justify-between gap-3 text-xs">
                          <span className={`font-bold ${event.type === 'RECEIVABLE' ? 'text-emerald-700' : 'text-amber-700'}`}>{event.description}</span>
                          <span className="font-black">{event.type === 'RECEIVABLE' ? '+' : '−'} {formatBRL(event.amountCents)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              {!projection.daily.some(day => day.events.length) && (
                <div className="p-6 text-center bg-emerald-50 rounded-xl text-emerald-700 font-bold text-xs">Nenhum compromisso futuro registrado.</div>
              )}
            </div>
          </Card>
        </div>
      )}
      {tab === 'transactions' && (
        <Card className="p-5 flex-1 overflow-auto">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-5">
            <div>
              <h4 className="font-black text-xl text-slate-800">Movimentações</h4>
              <p className="text-xs text-slate-400">Aqui ficam os fatos financeiros, separados de contas, compras e planejamento.</p>
            </div>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 text-slate-400" size={16}/>
                <input value={queryText} onChange={e=>setQueryText(e.target.value)} placeholder="Buscar..." className="pl-9 pr-3 py-2.5 border rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-100"/>
              </div>
              <button onClick={() => openNewTransaction('EXPENSE')} className="bg-[#1e5aa0] text-white px-3 py-2 rounded-xl text-xs font-black flex items-center gap-2"><Plus size={15}/> Nova</button>
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {filteredTransactions.map(t => <TransactionRow key={t.id} tx={t} accounts={accounts} categories={categories} detailed onEdit={openEditTransaction} onDelete={deleteTransaction}/> )}
            {!filteredTransactions.length && <EmptyState text="Nenhuma movimentação encontrada."/>}
          </div>
        </Card>
      )}

      {tab === 'attention' && (
        <div className="space-y-5 flex-1 overflow-auto pb-4">
          <Card className="p-5">
            <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <Tags className="text-[#1e5aa0]" size={21}/>
                  <h4 className="font-black text-xl text-slate-800">Classificação em massa</h4>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Agrupe despesas semelhantes, escolha a categoria uma única vez e o ArquiManager resolve o grupo inteiro.
                  Transferências, pagamentos de fatura e entradas ficam fora deste fluxo.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 text-slate-400" size={15}/>
                  <input
                    value={bulkQuery}
                    onChange={e => setBulkQuery(e.target.value)}
                    placeholder="Buscar estabelecimento..."
                    className="pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-100 w-56"
                  />
                </div>
                <span className="px-3 py-2.5 rounded-xl bg-slate-100 text-slate-600 text-[10px] font-black">
                  {bulkClassificationGroups.length} grupo(s)
                </span>
              </div>
            </div>

            {bulkClassificationGroups.length ? (
              <>
                <div className="mt-4 space-y-2">
                  {visibleBulkGroups.map(group => (
                    <BulkClassificationRow
                      key={group.key}
                      group={group}
                      categories={categories}
                      projects={projects}
                      clients={clients}
                      busy={bulkBusyKey === group.key}
                      onApply={bulkClassifyGroup}
                    />
                  ))}
                </div>
                {bulkClassificationGroups.length > bulkLimit && (
                  <button
                    onClick={() => setBulkLimit(limit => limit + 20)}
                    className="mt-4 w-full py-2.5 border border-slate-200 rounded-xl text-xs font-black text-slate-600 hover:bg-slate-50"
                  >
                    Mostrar mais grupos ({bulkClassificationGroups.length - bulkLimit} restantes)
                  </button>
                )}
              </>
            ) : (
              <div className="mt-4 p-6 rounded-xl bg-emerald-50 border border-emerald-100 text-center text-emerald-700 font-bold text-xs">
                Nenhum grupo de classificação em massa disponível.
              </div>
            )}
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2 mb-5">
            <CircleAlert className="text-amber-500" size={22}/>
            <div>
              <h4 className="font-black text-xl text-slate-800">Caixa de atenção</h4>
              <p className="text-xs text-slate-400">O sistema trabalha sozinho no que sabe; você resolve só as exceções. Os casos mais críticos aparecem primeiro.</p>
          <div className="flex flex-wrap gap-2 mt-3 text-[10px] font-black uppercase tracking-wide">
            <span className="px-2 py-1 rounded-lg bg-red-50 text-red-700">Pagamento de cartão</span>
            <span className="px-2 py-1 rounded-lg bg-amber-50 text-amber-700">Conciliação</span>
            <span className="px-2 py-1 rounded-lg bg-slate-100 text-slate-600">Classificação</span>
          </div>
            </div>
          </div>
          <div className="space-y-3">
            {attentionItems.map(item => (
              <AttentionItem
                key={item.id}
                item={item}
                transaction={item.transaction}
                categories={categories}
                projects={projects}
                clients={clients}
                bills={bills}
                cards={cards}
                onResolve={resolveInbox}
              />
            ))}
            {!attentionCount && <div className="p-6 text-center bg-emerald-50 rounded-xl text-emerald-700 font-bold">Nenhum item aguardando tratamento.</div>}
          </div>
        </Card>
        </div>
      )}

      {tab === 'planning' && (
        <div className="space-y-5 flex-1 overflow-auto pb-4">
          <div className="grid lg:grid-cols-2 gap-5">
            <Card className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <h4 className="font-black text-xl text-slate-800">A pagar</h4>
                  <p className="text-xs text-slate-400">Obrigações previstas. Não alteram o saldo até o pagamento real.</p>
                </div>
                <button onClick={() => setModal({type:'payable'})} className="bg-[#1e5aa0] text-white px-3 py-2.5 rounded-xl text-xs font-black flex items-center gap-2"><Plus size={15}/> Nova</button>
              </div>
              <div className="mb-4 p-4 rounded-xl bg-amber-50 border border-amber-100">
                <p className="text-[10px] font-black uppercase text-amber-700">Em aberto</p>
                <p className="text-2xl font-black text-amber-900 mt-1">{formatBRL(payableOpenTotal)}</p>
              </div>
              <div className="space-y-2">
                {[...payables].sort((a,b)=>String(a.dueDate||'').localeCompare(String(b.dueDate||''))).map(p => (
                  <div key={p.id} className="p-3 rounded-xl border border-slate-100 bg-slate-50 flex items-center gap-3">
                    <ArrowDownCircle size={18} className="text-red-500 shrink-0"/>
                    <div className="flex-1 min-w-0"><p className="font-black text-slate-800 truncate">{p.description}</p><p className="text-[10px] text-slate-400">Vence {dateLabel(p.dueDate)} · {p.status === 'PAID' ? 'Paga' : 'Em aberto'}</p></div>
                    <span className="font-black text-red-600 text-sm">{formatBRL(p.amountCents)}</span>
                  </div>
                ))}
                {!payables.length && <EmptyState text="Nenhuma conta a pagar cadastrada."/>}
              </div>
            </Card>

            <Card className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <h4 className="font-black text-xl text-slate-800">A receber</h4>
                  <p className="text-xs text-slate-400">Valores esperados. Não alteram o saldo até o recebimento real.</p>
                </div>
                <button onClick={() => setModal({type:'receivable'})} className="bg-emerald-600 text-white px-3 py-2.5 rounded-xl text-xs font-black flex items-center gap-2"><Plus size={15}/> Nova</button>
              </div>
              <div className="mb-4 p-4 rounded-xl bg-blue-50 border border-blue-100">
                <p className="text-[10px] font-black uppercase text-blue-700">Em aberto</p>
                <p className="text-2xl font-black text-blue-900 mt-1">{formatBRL(receivableOpenTotal)}</p>
              </div>
              <div className="space-y-2">
                {[...receivables].sort((a,b)=>String(a.dueDate||'').localeCompare(String(b.dueDate||''))).map(r => (
                  <div key={r.id} className="p-3 rounded-xl border border-slate-100 bg-slate-50 flex items-center gap-3">
                    <ArrowUpCircle size={18} className="text-emerald-500 shrink-0"/>
                    <div className="flex-1 min-w-0"><p className="font-black text-slate-800 truncate">{r.description}</p><p className="text-[10px] text-slate-400">Vence {dateLabel(r.dueDate)} · {r.status === 'RECEIVED' ? 'Recebido' : 'Em aberto'}</p></div>
                    <span className="font-black text-emerald-600 text-sm">{formatBRL(r.amountCents)}</span>
                  </div>
                ))}
                {!receivables.length && <EmptyState text="Nenhuma conta a receber cadastrada."/>}
              </div>
            </Card>
          </div>
        </div>
      )}

      {tab === 'transfers' && (
        <Card className="p-5 flex-1 overflow-auto">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <div>
              <h4 className="font-black text-xl text-slate-800">Transferências</h4>
              <p className="text-xs text-slate-400">Movimentações entre suas próprias contas. Não entram como receita ou despesa.</p>
            </div>
            <button onClick={() => setModal({type:'transfer'})} className="bg-slate-800 text-white px-4 py-2.5 rounded-xl text-xs font-black flex items-center gap-2"><ArrowLeftRight size={16}/> Nova transferência</button>
          </div>
          <div className="space-y-2">
            {[...transfers].sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))).map(t => {
              const from = accounts.find(a=>a.id===t.fromAccountId);
              const to = accounts.find(a=>a.id===t.toAccountId);
              return <div key={t.id} className="p-3 border border-slate-100 rounded-xl bg-slate-50 flex flex-col md:flex-row md:items-center gap-3">
                <ArrowLeftRight size={19} className="text-blue-600 shrink-0"/>
                <div className="flex-1">
                  <p className="font-black text-slate-800">{t.description}</p>
                  <p className="text-[10px] text-slate-400">{dateLabel(t.date)} · {from?.name || 'Conta origem'} → {to?.name || 'Conta destino'}</p>
                </div>
                <span className="font-black text-blue-700">{formatBRL(t.amountCents)}</span>
              </div>;
            })}
            {!transfers.length && <EmptyState text="Nenhuma transferência registrada."/>}
          </div>
        </Card>
      )}

      {tab === 'accounts' && (
        <div className="space-y-5 flex-1 overflow-auto pb-4">
          <Card className="p-5">
            <PluggyConnections
              appUser={appUser}
              connections={connections}
              onSaveConnection={savePluggyConnection}
              onSyncConnection={syncPluggyConnection}
            />
          </Card>

          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
              <div>
                <h4 className="font-black text-xl text-slate-800">Contas bancárias</h4>
                <p className="text-xs text-slate-400">Contas, caixa e saldos.</p>
              </div>
              <button onClick={() => setModal({type:'account'})} className="bg-[#1e5aa0] text-white px-4 py-2.5 rounded-xl text-xs font-black flex items-center gap-2"><Plus size={16}/> Nova conta</button>
            </div>
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
              {accounts.map(a => (
                <div key={a.id} className="border border-slate-200 rounded-2xl p-4 bg-slate-50">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2"><Landmark size={19} className="text-[#1e5aa0]"/><span className="font-black text-slate-800">{a.name}</span></div>
                    <span className="text-[9px] font-black uppercase text-slate-400">{a.type}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">{a.institution || 'Instituição não informada'}</p>
                  <p className="text-xl font-black text-slate-800 mt-3">{formatBRL(a.balanceCents)}</p>
                </div>
              ))}
              {!accounts.length && <EmptyState text="Nenhuma conta cadastrada ainda."/>}
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
              <div>
                <h4 className="font-black text-xl text-slate-800">Cartões</h4>
                <p className="text-xs text-slate-400">Compra, parcela e fatura ficam separadas do pagamento.</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setModal({type:'cardPurchase'})} disabled={!cards.length} className="bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 disabled:opacity-40"><Plus size={16}/> Nova compra</button>
                <button onClick={() => setModal({type:'card'})} className="bg-[#1e5aa0] text-white px-4 py-2.5 rounded-xl text-xs font-black flex items-center gap-2"><Plus size={16}/> Novo cartão</button>
              </div>
            </div>
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
              {cards.map(card => {
                const openBills = bills.filter(b => b.cardId === card.id && b.status !== 'PAID');
                const openTotal = openBills.reduce((s,b) => s + Number(b.totalCents || 0) - Number(b.paidCents || 0), 0);
                return <div key={card.id} className="border border-slate-200 rounded-2xl p-4 bg-white shadow-sm">
                  <div className="flex items-start justify-between gap-2"><div><p className="font-black text-slate-800">{card.name}</p><p className="text-xs text-slate-400">{card.institution}</p></div><WalletCards size={19} className="text-[#1e5aa0]"/></div>
                  <div className="grid grid-cols-2 gap-3 mt-4 text-xs">
                    <div><span className="text-slate-400 block">Limite</span><strong>{formatBRL(card.limitCents)}</strong></div>
                    <div><span className="text-slate-400 block">Em aberto</span><strong className="text-red-600">{formatBRL(openTotal)}</strong></div>
                    <div><span className="text-slate-400 block">Fecha</span><strong>dia {card.closingDay}</strong></div>
                    <div><span className="text-slate-400 block">Vence</span><strong>dia {card.dueDay}</strong></div>
                  </div>
                </div>;
              })}
              {!cards.length && <EmptyState text="Cadastre um cartão para controlar compras parceladas e faturas."/>}
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div><h4 className="font-black text-xl text-slate-800">Faturas</h4><p className="text-xs text-slate-400">As parcelas entram na fatura; o caixa só muda no pagamento.</p></div>
              <span className="text-[10px] font-black uppercase text-slate-400">{bills.length} fatura(s)</span>
            </div>
            <div className="space-y-2">
              {[...bills].sort((a,b)=>String(a.dueDate||'').localeCompare(String(b.dueDate||''))).map(b => {
                const card = cards.find(c=>c.id===b.cardId);
                const remaining = Math.max(0, Number(b.totalCents||0) - Number(b.paidCents||0));
                const paid = remaining === 0 && Number(b.totalCents||0) > 0;
                return <div key={b.id} className="flex flex-col md:flex-row md:items-center gap-3 p-3 border border-slate-100 rounded-xl bg-slate-50">
                  <div className="flex-1"><p className="font-black text-slate-800">{card?.name || 'Cartão não identificado'} · {b.referenceMonth}</p><p className="text-[10px] text-slate-400">Fechamento {dateLabel(b.closingDate)} · Vencimento {dateLabel(b.dueDate)}</p></div>
                  <div className="text-right"><p className="font-black text-slate-800">{formatBRL(b.totalCents)}</p><p className={paid ? 'text-[10px] font-black text-emerald-600' : 'text-[10px] font-black text-amber-600'}>{paid ? 'Paga' : 'Aberta · restante ' + formatBRL(remaining)}</p></div>
                </div>;
              })}
              {!bills.length && <EmptyState text="As faturas aparecerão aqui quando você lançar compras no cartão."/>}
            </div>
          </Card>
        </div>
      )}

      {modal?.type === 'transaction' && <TransactionModal
        initial={modal.initial} accounts={accounts} cards={cards} categories={categories}
        projects={projects} clients={clients} onClose={()=>setModal(null)}
        onSave={modal.initial?.editing ? updateTransaction : createTransaction}
        busy={busy}
      />}
      {modal?.type === 'account' && <AccountModal onClose={()=>setModal(null)} onSave={createAccount} busy={busy}/>}
      {modal?.type === 'card' && <CardModal accounts={accounts} onClose={()=>setModal(null)} onSave={createCard} busy={busy}/>}
      {modal?.type === 'cardPurchase' && <CardPurchaseModal cards={cards} categories={categories} projects={projects} onClose={()=>setModal(null)} onSave={createCardPurchase} busy={busy}/>}
      {modal?.type === 'payable' && <PayableModal categories={categories} projects={projects} onClose={()=>setModal(null)} onSave={createPayable} busy={busy}/>}
      {modal?.type === 'receivable' && <ReceivableModal clients={clients} projects={projects} onClose={()=>setModal(null)} onSave={createReceivable} busy={busy}/>}
      {modal?.type === 'transfer' && <TransferModal accounts={accounts} onClose={()=>setModal(null)} onSave={createTransfer} busy={busy}/>}
      {modal?.type === 'csv' && <CsvModal accounts={accounts} onClose={()=>setModal(null)} onImport={importCsv} busy={busy}/>}
    </div>
  );
}

function TransactionRow({ tx, accounts, categories, detailed = false, onEdit, onDelete }) {
  const category = categories.find(c=>c.id===tx.categoryId);
  const account = accounts.find(a=>a.id===tx.accountId);
  const isIncome = tx.type === 'INCOME';
  const isTransfer = tx.reconciliationType === 'TRANSFER';
  return (
    <div className="py-3 flex items-center gap-3">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isTransfer ? 'bg-blue-50 text-blue-600' : isIncome ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
        {isTransfer ? <ArrowLeftRight size={18}/> : isIncome ? <ArrowUpCircle size={18}/> : <ArrowDownCircle size={18}/>}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap gap-x-2 items-center">
          <p className="font-bold text-slate-800 truncate">{tx.description}</p>
          {tx.status === 'IDENTIFICATION_REQUIRED' && <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">atenção</span>}
          {isTransfer && <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">transferência</span>}
          {tx.status === 'RECONCILED' && !isTransfer && <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">conciliado</span>}
        </div>
        <p className="text-[10px] text-slate-400">{dateLabel(tx.date)} · {account?.name || 'Conta não informada'} {category ? `· ${category.nome}` : ''}</p>
        {detailed && tx.projectId && <p className="text-[10px] text-indigo-500 font-bold mt-0.5">Projeto vinculado</p>}
      </div>
      <div className={`font-black text-sm shrink-0 ${isIncome ? 'text-emerald-600' : 'text-red-600'}`}>
        {isIncome ? '+' : '-'}{formatBRL(tx.amountCents)}
      </div>
      {detailed && (
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => onEdit?.(tx)} className="p-2 rounded-lg text-slate-400 hover:text-[#1e5aa0] hover:bg-blue-50" title="Editar">
            <Pencil size={15}/>
          </button>
          <button onClick={() => onDelete?.(tx)} className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50" title="Excluir">
            <Trash2 size={15}/>
          </button>
        </div>
      )}
    </div>
  );
}

function BulkClassificationRow({ group, categories, projects, clients, busy, onApply }) {
  const [categoryId, setCategoryId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [clientId, setClientId] = useState('');
  const [rememberMerchant, setRememberMerchant] = useState(true);

  const isMixedType = group.expenseCount > 0 && group.incomeCount > 0;

  return (
    <div className="border border-slate-200 rounded-2xl p-3 bg-slate-50">
      <div className="flex flex-col xl:flex-row xl:items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-[#1e5aa0]">
              <Tags size={15}/>
            </div>
            <div className="min-w-0">
              <p className="font-black text-slate-800 truncate">{group.merchant}</p>
              <p className="text-[10px] text-slate-400">
                {group.items.length} lançamento(s) · total {formatBRL(group.totalCents)}
                {isMixedType ? ' · entradas e saídas' : group.incomeCount ? ' · entradas' : ' · saídas'}
              </p>
            </div>
          </div>
          {group.sampleDescriptions.length > 0 && (
            <p className="text-[10px] text-slate-500 mt-2 truncate">
              Exemplos: {group.sampleDescriptions.map(value => String(value || '')).join(' · ')}
            </p>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-2 xl:w-[48%]">
          <select
            value={categoryId}
            onChange={e => setCategoryId(e.target.value)}
            disabled={busy}
            className="flex-1 p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold"
          >
            <option value="">Escolha a categoria...</option>
            {categories.map(category => (
              <option key={category.id} value={category.id}>{category.nome}</option>
            ))}
          </select>

          <select
            value={projectId}
            onChange={e => setProjectId(e.target.value)}
            disabled={busy}
            className="flex-1 p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold"
          >
            <option value="">Sem projeto</option>
            {projects.map(project => (
              <option key={project.id} value={project.id}>{project.nomeProjeto}</option>
            ))}
          </select>

          {group.incomeCount > 0 && !isMixedType && (
            <select
              value={clientId}
              onChange={e => setClientId(e.target.value)}
              disabled={busy}
              className="flex-1 p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold"
            >
              <option value="">Sem cliente/origem</option>
              {clients.map(client => (
                <option key={client.id} value={client.id}>{client.nome}</option>
              ))}
            </select>
          )}
        </div>

        <div className="flex items-center justify-between xl:justify-end gap-3 xl:w-[22%]">
          <label className="flex items-center gap-2 text-[10px] font-bold text-slate-600">
            <input
              type="checkbox"
              checked={rememberMerchant}
              onChange={e => setRememberMerchant(e.target.checked)}
              disabled={busy}
            />
            lembrar regra
          </label>
          <button
            disabled={!categoryId || busy}
            onClick={() => onApply({
              group,
              categoryId,
              projectId,
              clientId: isMixedType ? '' : clientId,
              rememberMerchant
            })}
            className="bg-emerald-600 text-white px-3 py-2.5 rounded-xl text-xs font-black whitespace-nowrap disabled:opacity-40"
          >
            {busy ? 'Aplicando...' : `Aplicar em ${group.items.length}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function AttentionItem({ item, transaction, categories, projects, clients, bills, cards, onResolve }) {
  const [categoryId, setCategoryId] = useState(transaction?.categoryId || '');
  const [projectId, setProjectId] = useState(transaction?.projectId || '');
  const [clientId, setClientId] = useState(transaction?.clientId || '');
  const [rememberMerchant, setRememberMerchant] = useState(true);
  const [billId, setBillId] = useState('');
  const [payableId, setPayableId] = useState('');
  const [receivableId, setReceivableId] = useState('');
  if (!transaction) return null;
  return (
    <div className="border border-amber-200 bg-amber-50/60 rounded-2xl p-4">
      <div className="flex flex-col lg:flex-row gap-4 lg:items-center">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <CircleAlert className="text-amber-500" size={18}/>
            <p className="font-black text-slate-800">{transaction.description}</p>
          </div>
          <p className="text-xs text-slate-500 mt-1">{dateLabel(transaction.date)} · {transaction.type === 'INCOME' ? 'Entrada' : 'Saída'} · {formatBRL(transaction.amountCents)}</p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <p className="text-[10px] uppercase font-black text-amber-700">{item.reason}</p>
            <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-white border border-amber-200 text-slate-500">
              {transaction.source === 'CSV' ? 'importado' : 'manual'}
            </span>
            {Number(item.confidence || 0) > 0 && (
              <span className="text-[9px] font-black text-slate-500">confiança {Number(item.confidence)}%</span>
            )}
          </div>
          <p className="text-[10px] text-slate-500 mt-1">
            {item.kind === 'CARD_BILL_PAYMENT'
              ? 'O sistema suspeita que esta saída seja o pagamento de uma fatura.'
              : item.kind === 'PAYABLE_PAYMENT'
                ? 'Existe uma conta a pagar compatível, mas a correspondência não foi suficientemente única.'
                : item.kind === 'RECEIVABLE_RECEIPT'
                  ? 'Existe um recebível compatível, mas a correspondência não foi suficientemente única.'
                  : 'Nenhuma regra suficientemente confiável identificou esta movimentação.'}
          </p>
        </div>
        <div className={`grid gap-2 lg:w-[52%] ${['CARD_BILL_PAYMENT','PAYABLE_PAYMENT','RECEIVABLE_RECEIPT'].includes(item.kind) ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`}>
          {item.kind === 'CARD_BILL_PAYMENT' ? (
            <select value={billId} onChange={e=>setBillId(e.target.value)} className="p-2.5 bg-white border border-amber-200 rounded-xl text-xs font-bold">
              <option value="">Escolha a fatura...</option>
              {[...bills]
                .filter(b => b.status !== 'PAID' && Number(b.totalCents || 0) > Number(b.paidCents || 0))
                .sort((a,b)=>String(a.dueDate||'').localeCompare(String(b.dueDate||'')))
                .map(b => {
                  const card = cards.find(c=>c.id===b.cardId);
                  const remaining = Number(b.totalCents || 0) - Number(b.paidCents || 0);
                  return <option key={b.id} value={b.id}>{card?.name || 'Cartão'} · {b.referenceMonth} · {formatBRL(remaining)} restante</option>;
                })}
            </select>
          ) : item.kind === 'PAYABLE_PAYMENT' ? (
            <select value={payableId} onChange={e=>setPayableId(e.target.value)} className="p-2.5 bg-white border border-amber-200 rounded-xl text-xs font-bold">
              <option value="">Escolha a conta...</option>
              {[...payables]
                .filter(p => p.status !== 'PAID' && Number(p.amountCents || 0) > Number(p.paidCents || 0))
                .sort((a,b)=>String(a.dueDate||'').localeCompare(String(b.dueDate||'')))
                .map(p => {
                  const remaining = Number(p.amountCents || 0) - Number(p.paidCents || 0);
                  return <option key={p.id} value={p.id}>{p.description} · {formatBRL(remaining)} restante</option>;
                })}
            </select>
          ) : item.kind === 'RECEIVABLE_RECEIPT' ? (
            <select value={receivableId} onChange={e=>setReceivableId(e.target.value)} className="p-2.5 bg-white border border-amber-200 rounded-xl text-xs font-bold">
              <option value="">Escolha o recebível...</option>
              {[...receivables]
                .filter(r => r.status !== 'RECEIVED' && Number(r.amountCents || 0) > Number(r.receivedCents || 0))
                .sort((a,b)=>String(a.dueDate||'').localeCompare(String(b.dueDate||'')))
                .map(r => {
                  const remaining = Number(r.amountCents || 0) - Number(r.receivedCents || 0);
                  return <option key={r.id} value={r.id}>{r.description} · {formatBRL(remaining)} restante</option>;
                })}
            </select>
          ) : null}
          {item.kind !== 'CARD_BILL_PAYMENT' && <select value={categoryId} onChange={e=>setCategoryId(e.target.value)} className="p-2.5 bg-white border border-amber-200 rounded-xl text-xs font-bold">
            <option value="">Categoria</option>
            {categories.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>}
          {item.kind !== 'CARD_BILL_PAYMENT' && transaction.type === 'INCOME' && <select value={clientId} onChange={e=>setClientId(e.target.value)} className="p-2.5 bg-white border border-amber-200 rounded-xl text-xs font-bold">
            <option value="">Cliente / origem</option>
            {clients.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>}
          {item.kind !== 'CARD_BILL_PAYMENT' && <select value={projectId} onChange={e=>setProjectId(e.target.value)} className="p-2.5 bg-white border border-amber-200 rounded-xl text-xs font-bold">
            <option value="">Projeto</option>
            {projects.map(p=><option key={p.id} value={p.id}>{p.nomeProjeto}</option>)}
          </select>}
        </div>
        <div className="flex lg:flex-col gap-2">
          {item.kind === 'CLASSIFICATION' && <label className="flex items-center gap-2 text-[10px] font-bold text-slate-600">
            <input type="checkbox" checked={rememberMerchant} onChange={e=>setRememberMerchant(e.target.checked)}/>
            lembrar regra
          </label>}
          <button
            disabled={
              (item.kind === 'CARD_BILL_PAYMENT' && !billId) ||
              (item.kind === 'PAYABLE_PAYMENT' && !payableId) ||
              (item.kind === 'RECEIVABLE_RECEIPT' && !receivableId)
            }
            onClick={()=>onResolve(item,{categoryId,projectId,clientId,billId,payableId,receivableId,rememberMerchant})} className="bg-emerald-600 text-white px-3 py-2 rounded-xl text-xs font-black flex items-center gap-1"><Check size={14}/> Resolver</button>
        </div>
      </div>
    </div>
  );
}

function TransactionModal({ initial, accounts, cards, categories, projects, clients, onClose, onSave, busy }) {
  const [data, setData] = useState(initial);
  const update = (k,v) => setData(prev=>({...prev,[k]:v}));
  const editing = !!data.editing;
  const lockedCore = !!data.lockedCore;
  const isTransfer = data.reconciliationType === 'TRANSFER';
  return (
    <Modal title={editing ? 'Editar movimentação' : (data.type === 'INCOME' ? 'Nova entrada' : 'Nova despesa')} onClose={onClose}>
      <div className="grid sm:grid-cols-2 gap-4">
        {editing && <Field label="Tipo">
          <select value={data.type||'EXPENSE'} onChange={e=>update('type',e.target.value)} disabled={lockedCore} className={inputCls}>
            <option value="EXPENSE">Despesa</option>
            <option value="INCOME">Entrada</option>
          </select>
        </Field>}
        <Field label="Descrição *"><input value={data.description||''} onChange={e=>update('description',e.target.value)} className={inputCls}/></Field>
        <Field label="Valor (R$) *">
          <input value={data.amount||''} onChange={e=>update('amount',e.target.value)} type="number" min="0" step="0.01" disabled={lockedCore} className={inputCls}/>
        </Field>
        <Field label={data.status === 'SCHEDULED' ? 'Data prevista' : 'Data *'}>
          <input type="date" value={data.date||todayLocal()} onChange={e=>update('date',e.target.value)} disabled={lockedCore} className={inputCls}/>
        </Field>
        <Field label="Conta">
          <select value={data.accountId||''} onChange={e=>update('accountId',e.target.value)} disabled={lockedCore} className={inputCls}>
            <option value="">Selecione...</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.name} · {a.institution}</option>)}
          </select>
        </Field>
        {!isTransfer && <Field label="Categoria">
          <select value={data.categoryId||''} onChange={e=>update('categoryId',e.target.value)} disabled={false} className={inputCls}>
            <option value="">A definir</option>{categories.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </Field>}
        {!isTransfer && <Field label="Projeto">
          <select value={data.projectId||''} onChange={e=>update('projectId',e.target.value)} className={inputCls}>
            <option value="">Sem projeto</option>{projects.map(p=><option key={p.id} value={p.id}>{p.nomeProjeto}</option>)}
          </select>
        </Field>}
        {data.type === 'INCOME' && !isTransfer && <Field label="Cliente / origem">
          <select value={data.clientId||''} onChange={e=>update('clientId',e.target.value)} className={inputCls}>
            <option value="">Não identificado</option>{clients.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </Field>}
        <Field label="Estágio">
          <select value={data.status||'CLASSIFIED'} onChange={e=>update('status',e.target.value)} disabled={lockedCore} className={inputCls}>
            <option value="CLASSIFIED">Realizada / classificada</option>
            <option value="SCHEDULED">Prevista</option>
            <option value="IDENTIFICATION_REQUIRED">Aguardando identificação</option>
            <option value="RECONCILED">Conciliada</option>
          </select>
        </Field>
        <div className="sm:col-span-2"><Field label="Observação"><textarea value={data.notes||''} onChange={e=>update('notes',e.target.value)} rows={3} className={inputCls}/></Field></div>
      </div>
      {editing && lockedCore && (
        <div className="mt-5 p-3 bg-amber-50 border border-amber-100 rounded-xl text-xs text-amber-800 font-medium">
          Esta movimentação já está conciliada. Conta, valor, data e tipo ficam bloqueados para preservar a conciliação. Você pode corrigir descrição, categoria, projeto, cliente e observações.
        </div>
      )}
      {editing && isTransfer && (
        <div className="mt-3 p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-800 font-medium">
          Como é uma transferência, a descrição e observação serão sincronizadas nas duas pontas.
        </div>
      )}
      {!editing && <div className="mt-5 p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-800 font-medium">
        Cartões, compras parceladas e faturas terão entidades próprias nesta nova estrutura. Este lançamento registra apenas o fato financeiro informado agora.
      </div>}
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="px-4 py-2.5 border rounded-xl text-xs font-bold">Cancelar</button>
        <button disabled={busy} onClick={()=>onSave(data)} className="px-4 py-2.5 bg-[#1e5aa0] text-white rounded-xl text-xs font-black disabled:opacity-50">
          {busy ? 'Salvando...' : (editing ? 'Salvar alterações' : 'Salvar movimentação')}
        </button>
      </div>
    </Modal>
  );
}

function AccountModal({ onClose, onSave, busy }) {
  const [data,setData]=useState({name:'',institution:'',type:'CONTA_CORRENTE',balance:''});
  const update=(k,v)=>setData(p=>({...p,[k]:v}));
  return <Modal title="Nova conta financeira" onClose={onClose}>
    <div className="grid sm:grid-cols-2 gap-4">
      <Field label="Nome *"><input value={data.name} onChange={e=>update('name',e.target.value)} placeholder="Ex.: Conta Itaú" className={inputCls}/></Field>
      <Field label="Instituição"><input value={data.institution} onChange={e=>update('institution',e.target.value)} placeholder="Ex.: Itaú" className={inputCls}/></Field>
      <Field label="Tipo"><select value={data.type} onChange={e=>update('type',e.target.value)} className={inputCls}><option value="CONTA_CORRENTE">Conta corrente</option><option value="CONTA_POUPANCA">Poupança</option><option value="DINHEIRO">Caixa / dinheiro</option></select></Field>
      <Field label="Saldo inicial"><input value={data.balance} onChange={e=>update('balance',e.target.value)} type="number" step="0.01" className={inputCls}/></Field>
    </div>
    <div className="mt-5 flex justify-end gap-2"><button onClick={onClose} className="px-4 py-2.5 border rounded-xl text-xs font-bold">Cancelar</button><button disabled={busy} onClick={()=>onSave(data)} className="px-4 py-2.5 bg-[#1e5aa0] text-white rounded-xl text-xs font-black">{busy?'Salvando...':'Criar conta'}</button></div>
  </Modal>;
}

function PayableModal({ categories, projects, onClose, onSave, busy }) {
  const [data,setData]=useState({description:'',amount:'',dueDate:todayLocal(),categoryId:'',projectId:'',supplierName:'',notes:''});
  const update=(k,v)=>setData(p=>({...p,[k]:v}));
  return <Modal title="Nova conta a pagar" onClose={onClose}>
    <div className="grid sm:grid-cols-2 gap-4">
      <Field label="Descrição *"><input value={data.description} onChange={e=>update('description',e.target.value)} placeholder="Ex.: Serviço de renderização" className={inputCls}/></Field>
      <Field label="Valor (R$) *"><input value={data.amount} onChange={e=>update('amount',e.target.value)} type="number" min="0" step="0.01" className={inputCls}/></Field>
      <Field label="Vencimento *"><input value={data.dueDate} onChange={e=>update('dueDate',e.target.value)} type="date" className={inputCls}/></Field>
      <Field label="Fornecedor"><input value={data.supplierName} onChange={e=>update('supplierName',e.target.value)} placeholder="Ex.: Empresa XYZ" className={inputCls}/></Field>
      <Field label="Categoria"><select value={data.categoryId} onChange={e=>update('categoryId',e.target.value)} className={inputCls}><option value="">A definir</option>{categories.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}</select></Field>
      <Field label="Projeto"><select value={data.projectId} onChange={e=>update('projectId',e.target.value)} className={inputCls}><option value="">Sem projeto</option>{projects.map(p=><option key={p.id} value={p.id}>{p.nomeProjeto}</option>)}</select></Field>
      <div className="sm:col-span-2"><Field label="Observação"><textarea value={data.notes} onChange={e=>update('notes',e.target.value)} rows={3} className={inputCls}/></Field></div>
    </div>
    <div className="mt-4 p-3 bg-amber-50 border border-amber-100 rounded-xl text-xs text-amber-800">A obrigação fica prevista no calendário, mas o saldo bancário só muda com um pagamento real.</div>
    <div className="mt-5 flex justify-end gap-2"><button onClick={onClose} className="px-4 py-2.5 border rounded-xl text-xs font-bold">Cancelar</button><button disabled={busy} onClick={()=>onSave(data)} className="px-4 py-2.5 bg-[#1e5aa0] text-white rounded-xl text-xs font-black">{busy?'Salvando...':'Cadastrar'}</button></div>
  </Modal>;
}

function ReceivableModal({ clients, projects, onClose, onSave, busy }) {
  const [data,setData]=useState({description:'',amount:'',dueDate:todayLocal(),clientId:'',projectId:'',notes:''});
  const update=(k,v)=>setData(p=>({...p,[k]:v}));
  return <Modal title="Nova conta a receber" onClose={onClose}>
    <div className="grid sm:grid-cols-2 gap-4">
      <Field label="Descrição *"><input value={data.description} onChange={e=>update('description',e.target.value)} placeholder="Ex.: Parcela de projeto" className={inputCls}/></Field>
      <Field label="Valor (R$) *"><input value={data.amount} onChange={e=>update('amount',e.target.value)} type="number" min="0" step="0.01" className={inputCls}/></Field>
      <Field label="Vencimento *"><input value={data.dueDate} onChange={e=>update('dueDate',e.target.value)} type="date" className={inputCls}/></Field>
      <Field label="Cliente"><select value={data.clientId} onChange={e=>update('clientId',e.target.value)} className={inputCls}><option value="">Não vinculado</option>{clients.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}</select></Field>
      <Field label="Projeto"><select value={data.projectId} onChange={e=>update('projectId',e.target.value)} className={inputCls}><option value="">Sem projeto</option>{projects.map(p=><option key={p.id} value={p.id}>{p.nomeProjeto}</option>)}</select></Field>
      <div className="sm:col-span-2"><Field label="Observação"><textarea value={data.notes} onChange={e=>update('notes',e.target.value)} rows={3} className={inputCls}/></Field></div>
    </div>
    <div className="mt-4 p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-800">O recebimento fica previsto no calendário, mas o saldo bancário só aumenta quando o dinheiro realmente entrar.</div>
    <div className="mt-5 flex justify-end gap-2"><button onClick={onClose} className="px-4 py-2.5 border rounded-xl text-xs font-bold">Cancelar</button><button disabled={busy} onClick={()=>onSave(data)} className="px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-black">{busy?'Salvando...':'Cadastrar'}</button></div>
  </Modal>;
}

function CardModal({ accounts, onClose, onSave, busy }) {
  const [data,setData]=useState({name:'',institution:'',limit:'',closingDay:1,dueDay:10,paymentAccountId:''});
  const update=(k,v)=>setData(p=>({...p,[k]:v}));
  return <Modal title="Novo cartão" onClose={onClose}>
    <div className="grid sm:grid-cols-2 gap-4">
      <Field label="Nome *"><input value={data.name} onChange={e=>update('name',e.target.value)} placeholder="Ex.: Nubank Black" className={inputCls}/></Field>
      <Field label="Instituição *"><input value={data.institution} onChange={e=>update('institution',e.target.value)} placeholder="Ex.: Nubank" className={inputCls}/></Field>
      <Field label="Limite"><input value={data.limit} onChange={e=>update('limit',e.target.value)} type="number" min="0" step="0.01" className={inputCls}/></Field>
      <Field label="Conta que paga a fatura"><select value={data.paymentAccountId} onChange={e=>update('paymentAccountId',e.target.value)} className={inputCls}><option value="">Selecionar depois</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.name} · {a.institution}</option>)}</select></Field>
      <Field label="Dia de fechamento"><input value={data.closingDay} onChange={e=>update('closingDay',e.target.value)} type="number" min="1" max="28" className={inputCls}/></Field>
      <Field label="Dia de vencimento"><input value={data.dueDay} onChange={e=>update('dueDay',e.target.value)} type="number" min="1" max="28" className={inputCls}/></Field>
    </div>
    <div className="mt-4 p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-800">O cartão é o meio da compra. O dinheiro sai da conta somente no pagamento da fatura.</div>
    <div className="mt-5 flex justify-end gap-2"><button onClick={onClose} className="px-4 py-2.5 border rounded-xl text-xs font-bold">Cancelar</button><button disabled={busy} onClick={()=>onSave(data)} className="px-4 py-2.5 bg-[#1e5aa0] text-white rounded-xl text-xs font-black">{busy?'Salvando...':'Criar cartão'}</button></div>
  </Modal>;
}

function CardPurchaseModal({ cards, categories, projects, onClose, onSave, busy }) {
  const [data,setData]=useState({cardId:cards[0]?.id||'',description:'',merchant:'',amount:'',purchaseDate:todayLocal(),installments:1,categoryId:'',projectId:''});
  const update=(k,v)=>setData(p=>({...p,[k]:v}));
  return <Modal title="Nova compra no cartão" onClose={onClose}>
    <div className="grid sm:grid-cols-2 gap-4">
      <Field label="Cartão *"><select value={data.cardId} onChange={e=>update('cardId',e.target.value)} className={inputCls}>{cards.map(c=><option key={c.id} value={c.id}>{c.name} · {c.institution}</option>)}</select></Field>
      <Field label="Valor total (R$) *"><input value={data.amount} onChange={e=>update('amount',e.target.value)} type="number" min="0" step="0.01" className={inputCls}/></Field>
      <Field label="Descrição *"><input value={data.description} onChange={e=>update('description',e.target.value)} placeholder="Ex.: Notebook" className={inputCls}/></Field>
      <Field label="Estabelecimento"><input value={data.merchant} onChange={e=>update('merchant',e.target.value)} placeholder="Ex.: Loja ABC" className={inputCls}/></Field>
      <Field label="Data da compra"><input value={data.purchaseDate} onChange={e=>update('purchaseDate',e.target.value)} type="date" className={inputCls}/></Field>
      <Field label="Parcelas"><select value={data.installments} onChange={e=>update('installments',e.target.value)} className={inputCls}>{Array.from({length:24},(_,i)=>i+1).map(n=><option key={n} value={n}>{n}x</option>)}</select></Field>
      <Field label="Categoria"><select value={data.categoryId} onChange={e=>update('categoryId',e.target.value)} className={inputCls}><option value="">A definir</option>{categories.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}</select></Field>
      <Field label="Projeto"><select value={data.projectId} onChange={e=>update('projectId',e.target.value)} className={inputCls}><option value="">Sem projeto</option>{projects.map(p=><option key={p.id} value={p.id}>{p.nomeProjeto}</option>)}</select></Field>
    </div>
    <div className="mt-4 p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-xs text-emerald-800">Ex.: R$ 1.200 em 6x gera uma compra de R$ 1.200, seis parcelas e seis entradas nas faturas. O caixa não é reduzido pela compra.</div>
    <div className="mt-5 flex justify-end gap-2"><button onClick={onClose} className="px-4 py-2.5 border rounded-xl text-xs font-bold">Cancelar</button><button disabled={busy||!cards.length} onClick={()=>onSave(data)} className="px-4 py-2.5 bg-[#1e5aa0] text-white rounded-xl text-xs font-black">{busy?'Gerando...':'Registrar compra'}</button></div>
  </Modal>;
}
function TransferModal({ accounts, onClose, onSave, busy }) {
  const [data,setData]=useState({fromAccountId:'',toAccountId:'',amount:'',date:todayLocal(),description:'Transferência entre contas'});
  const update=(k,v)=>setData(p=>({...p,[k]:v}));
  const destinationAccounts = accounts.filter(a=>a.id !== data.fromAccountId);
  return <Modal title="Nova transferência" onClose={onClose}>
    <div className="grid sm:grid-cols-2 gap-4">
      <Field label="Conta de origem *"><select value={data.fromAccountId} onChange={e=>update('fromAccountId',e.target.value)} className={inputCls}><option value="">Selecione...</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.name} · {a.institution}</option>)}</select></Field>
      <Field label="Conta de destino *"><select value={data.toAccountId} onChange={e=>update('toAccountId',e.target.value)} className={inputCls}><option value="">Selecione...</option>{destinationAccounts.map(a=><option key={a.id} value={a.id}>{a.name} · {a.institution}</option>)}</select></Field>
      <Field label="Valor (R$) *"><input value={data.amount} onChange={e=>update('amount',e.target.value)} type="number" min="0" step="0.01" className={inputCls}/></Field>
      <Field label="Data *"><input value={data.date} onChange={e=>update('date',e.target.value)} type="date" className={inputCls}/></Field>
      <div className="sm:col-span-2"><Field label="Descrição"><input value={data.description} onChange={e=>update('description',e.target.value)} className={inputCls}/></Field></div>
    </div>
    <div className="mt-4 p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-800">A transferência gera automaticamente uma saída na origem e uma entrada no destino, ambas vinculadas. O resultado financeiro da empresa permanece neutro.</div>
    <div className="mt-5 flex justify-end gap-2"><button onClick={onClose} className="px-4 py-2.5 border rounded-xl text-xs font-bold">Cancelar</button><button disabled={busy||accounts.length<2} onClick={()=>onSave(data)} className="px-4 py-2.5 bg-slate-800 text-white rounded-xl text-xs font-black">{busy?'Salvando...':'Registrar transferência'}</button></div>
  </Modal>;
}

function CsvModal({ accounts, onClose, onImport, busy }) {
  const [accountId,setAccountId]=useState(accounts[0]?.id||'');
  const [file,setFile]=useState(null);
  return <Modal title="Importar movimentações CSV" onClose={onClose}>
    <div className="space-y-4">
      <div className="p-4 bg-slate-50 border rounded-xl text-xs text-slate-600">
        O importador procura colunas <strong>Data</strong>, <strong>Descrição</strong> e <strong>Valor</strong>. Valores positivos entram como entrada; negativos entram como despesa.
      </div>
      <Field label="Conta de destino"><select value={accountId} onChange={e=>setAccountId(e.target.value)} className={inputCls}><option value="">Selecione...</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.name} · {a.institution}</option>)}</select></Field>
      <Field label="Arquivo CSV"><input type="file" accept=".csv,text/csv" onChange={e=>setFile(e.target.files?.[0]||null)} className="w-full text-xs"/></Field>
      <div className="flex justify-end gap-2"><button onClick={onClose} className="px-4 py-2.5 border rounded-xl text-xs font-bold">Cancelar</button><button disabled={!file||!accountId||busy} onClick={()=>onImport(file,accountId)} className="px-4 py-2.5 bg-[#1e5aa0] text-white rounded-xl text-xs font-black">{busy?'Importando...':'Importar'}</button></div>
    </div>
  </Modal>;
}

function Modal({title,onClose,children}) {
  return <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-auto">
      <div className="px-5 py-4 border-b flex items-center justify-between"><h3 className="font-black text-slate-800">{title}</h3><button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100"><X size={18}/></button></div>
      <div className="p-5">{children}</div>
    </div>
  </div>;
}
const inputCls = 'w-full p-2.5 border border-slate-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-100';
function Field({label,children}) { return <div><label className="block text-[10px] font-black uppercase tracking-wide text-slate-500 mb-1">{label}</label>{children}</div>; }
function EmptyState({text}) { return <div className="p-8 text-center text-slate-400 font-bold text-xs border border-dashed rounded-xl">{text}</div>; }