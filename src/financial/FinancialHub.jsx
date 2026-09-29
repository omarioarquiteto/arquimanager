import React, { useEffect, useMemo, useState } from 'react';
import {
  getFirestore, collection, doc, onSnapshot, setDoc, addDoc, updateDoc,
  serverTimestamp, increment
} from 'firebase/firestore';
import {
  ArrowDownCircle, ArrowUpCircle, ArrowLeftRight, CalendarDays, Check, ChevronLeft,
  ChevronRight, CircleAlert, FileUp, Filter, Landmark, Plus, RefreshCw, Search,
  Sparkles, Tags, WalletCards, X
} from 'lucide-react';
import {
  DEFAULT_CATEGORIES, detectCsvHeader, formatBRL, normalizeText, parseCsvLine,
  parseCsvAmount, toCents, transactionKey, todayLocal
} from './financialEngine.js';

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

export default function FinancialHub({ appUser, projects = [], clients = [], db }) {
  const companyId = appUser?.companyId || 'legado';
  const [tab, setTab] = useState('overview');
  const [accounts, setAccounts] = useState([]);
  const [cards, setCards] = useState([]);
  const [bills, setBills] = useState([]);
  const [categories, setCategories] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [inbox, setInbox] = useState([]);
  const [rules, setRules] = useState([]);
  const [queryText, setQueryText] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(todayLocal().slice(0, 7));
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

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

  const attentionCount = inbox.filter(i => i.status !== 'RESOLVED').length;

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

  const findCardBillForPayment = ({ amountCents, date, description, accountId }) => {
    const normalizedDescription = normalizeText(description);
    const paymentHint = /(pagamento|pagto|pagamento de fatura|fatura|cartao|cartão)/.test(normalizedDescription);
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
  const openNewTransaction = (type = 'EXPENSE') =>
    setModal({ type: 'transaction', initial: { type, date: todayLocal(), status: 'CLASSIFIED', amount: '', description: '' } });

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
      const amountCents = toCents(data.amount);
      const type = data.type;
      const normalizedMerchant = normalizeText(data.merchant || data.description);
      const rememberedRule = rules.find(r => r.merchantNormalized === normalizedMerchant);
      const effectiveCategoryId = data.categoryId || rememberedRule?.categoryId || null;
      const effectiveProjectId = data.projectId || rememberedRule?.projectId || null;
      const category = categories.find(c => c.id === effectiveCategoryId);
      const status = type === 'INCOME' ? 'IDENTIFICATION_REQUIRED' : (effectiveCategoryId ? 'CLASSIFIED' : 'IDENTIFICATION_REQUIRED');
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

      let reconciled = false;
      if (type === 'EXPENSE') {
        const result = await reconcileCardPayment({
          transactionId: ref.id, amountCents, date: data.date,
          description: data.description.trim(), accountId: data.accountId
        });
        reconciled = result.status === 'MATCHED';
      }

      if (status === 'IDENTIFICATION_REQUIRED' && !reconciled) {
        await addDoc(collectionPath(db, 'financial_inbox'), {
          companyId, transactionId: ref.id,
          reason: type === 'INCOME' ? 'Identificar entrada' : 'Classificar movimentação',
          confidence: 0, status: 'OPEN', createdAt: serverTimestamp(),
        });
      }
      setModal(null);
      setNotice(reconciled ? 'Pagamento de fatura identificado e conciliado automaticamente.' : 'Movimentação registrada.');
    } finally { setBusy(false); }
  };

  const resolveInbox = async (item, data) => {
    const tx = transactions.find(t => t.id === item.transactionId);
    if (!tx) return;
    setBusy(true);
    try {
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
        const rememberedRule = rules.find(r => r.merchantNormalized === normalizedMerchant);
        const externalId = transactionKey({ accountId, date: isoDate, description, amountCents: normalizedAmount });
        if (existing.has(externalId)) { skipped += 1; continue; }

        const ref = await addDoc(collectionPath(db, 'financial_transactions'), {
          companyId, source: 'CSV', externalId, accountId, cardId: null,
          date: isoDate, actualDate: isoDate, expectedDate: null, description,
          merchant: description, normalizedMerchant,
          amountCents: normalizedAmount, type,
          status: (type === 'EXPENSE' && rememberedRule?.categoryId) ? 'CLASSIFIED' : 'IDENTIFICATION_REQUIRED',
          categoryId: rememberedRule?.categoryId || null, projectId: rememberedRule?.projectId || null,
          clientId: null, supplierId: null,
          importedAt: serverTimestamp(), createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        });
        let reconciled = false;
        if (type === 'EXPENSE') {
          const result = await reconcileCardPayment({
            transactionId: ref.id, amountCents: normalizedAmount, date: isoDate,
            description, accountId
          });
          reconciled = result.status === 'MATCHED';
        }

        if (!(type === 'EXPENSE' && rememberedRule?.categoryId) && !reconciled) {
          await addDoc(collectionPath(db, 'financial_inbox'), {
            companyId, transactionId: ref.id, reason: type === 'INCOME' ? 'Identificar entrada importada' : 'Classificar despesa importada',
            confidence: 0, status: 'OPEN', createdAt: serverTimestamp(),
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
                const income = dayTx.filter(t => t.type === 'INCOME').reduce((s,t)=>s+Number(t.amountCents||0),0);
                const expense = dayTx.filter(t => t.type === 'EXPENSE').reduce((s,t)=>s+Number(t.amountCents||0),0);
                return <div key={`${day || 'blank'}-${idx}`} className="min-h-[76px] bg-slate-50 border border-slate-100 rounded-lg p-2">
                  {day && <div className="text-xs font-black text-slate-700">{Number(day.slice(8))}</div>}
                  {income > 0 && <div className="mt-2 text-[10px] font-bold text-emerald-600">+{formatBRL(income)}</div>}
                  {expense > 0 && <div className="text-[10px] font-bold text-red-600">-{formatBRL(expense)}</div>}
                  {dayTx.length > 0 && <div className="mt-1 text-[9px] text-slate-400">{dayTx.length} movimento(s)</div>}
                </div>;
              })}
            </div>
          </Card>
        </div>
      )}

      {tab === 'calendar' && (
        <Card className="p-5 flex-1 overflow-auto">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <div>
              <h4 className="font-black text-xl text-slate-800">Calendário financeiro</h4>
              <p className="text-xs text-slate-400">Entradas e saídas reais; o modelo já separa data prevista de data realizada.</p>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => shiftMonth(-1)} className="p-2 border rounded-lg"><ChevronLeft size={16}/></button>
              <span className="px-3 text-sm font-black text-slate-700">{selectedMonth}</span>
              <button onClick={() => shiftMonth(1)} className="p-2 border rounded-lg"><ChevronRight size={16}/></button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1 text-[10px] font-black uppercase text-slate-400 mb-2">{['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'].map(d => <div key={d} className="p-2 text-center">{d}</div>)}</div>
          <div className="grid grid-cols-7 gap-1">
            {days.map((day, idx) => {
              const dayTx = day ? monthTransactions.filter(t => (t.date || '') === day) : [];
              return <div key={`${day || 'blank2'}-${idx}`} className="min-h-[120px] border border-slate-100 rounded-lg p-2 bg-white">
                {day && <div className="font-black text-slate-700 text-xs mb-2">{Number(day.slice(8))}</div>}
                <div className="space-y-1">
                  {dayTx.slice(0,4).map(t => <div key={t.id} className={`text-[10px] px-2 py-1 rounded-lg font-bold ${t.type === 'INCOME' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                    {t.type === 'INCOME' ? '+' : '-'} {formatBRL(t.amountCents)} · {t.description}
                  </div>)}
                  {dayTx.length > 4 && <div className="text-[9px] text-slate-400">+{dayTx.length-4} outros</div>}
                </div>
              </div>;
            })}
          </div>
        </Card>
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
            {filteredTransactions.map(t => <TransactionRow key={t.id} tx={t} accounts={accounts} categories={categories} detailed/> )}
            {!filteredTransactions.length && <EmptyState text="Nenhuma movimentação encontrada."/>}
          </div>
        </Card>
      )}

      {tab === 'attention' && (
        <Card className="p-5 flex-1 overflow-auto">
          <div className="flex items-center gap-2 mb-5">
            <CircleAlert className="text-amber-500" size={22}/>
            <div>
              <h4 className="font-black text-xl text-slate-800">Caixa de atenção</h4>
              <p className="text-xs text-slate-400">O sistema trabalha sozinho no que sabe; você resolve só as exceções.</p>
            </div>
          </div>
          <div className="space-y-3">
            {inbox.filter(i=>i.status !== 'RESOLVED').map(item => (
              <AttentionItem key={item.id} item={item} transaction={transactions.find(t=>t.id===item.transactionId)} categories={categories} projects={projects} clients={clients} onResolve={resolveInbox}/>
            ))}
            {!attentionCount && <div className="p-6 text-center bg-emerald-50 rounded-xl text-emerald-700 font-bold">Nenhum item aguardando tratamento.</div>}
          </div>
        </Card>
      )}

      {tab === 'accounts' && (
        <div className="space-y-5 flex-1 overflow-auto pb-4">
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
        projects={projects} clients={clients} onClose={()=>setModal(null)} onSave={createTransaction} busy={busy}
      />}
      {modal?.type === 'account' && <AccountModal onClose={()=>setModal(null)} onSave={createAccount} busy={busy}/>}
      {modal?.type === 'card' && <CardModal accounts={accounts} onClose={()=>setModal(null)} onSave={createCard} busy={busy}/>}
      {modal?.type === 'cardPurchase' && <CardPurchaseModal cards={cards} categories={categories} projects={projects} onClose={()=>setModal(null)} onSave={createCardPurchase} busy={busy}/>}
      {modal?.type === 'csv' && <CsvModal accounts={accounts} onClose={()=>setModal(null)} onImport={importCsv} busy={busy}/>}
    </div>
  );
}

function TransactionRow({ tx, accounts, categories, detailed = false }) {
  const category = categories.find(c=>c.id===tx.categoryId);
  const account = accounts.find(a=>a.id===tx.accountId);
  const isIncome = tx.type === 'INCOME';
  return (
    <div className="py-3 flex items-center gap-3">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isIncome ? 'bg-emerald-50 text-emerald-600' : tx.type === 'TRANSFER' ? 'bg-blue-50 text-blue-600' : 'bg-red-50 text-red-600'}`}>
        {isIncome ? <ArrowUpCircle size={18}/> : tx.type === 'TRANSFER' ? <ArrowLeftRight size={18}/> : <ArrowDownCircle size={18}/>}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap gap-x-2 items-center">
          <p className="font-bold text-slate-800 truncate">{tx.description}</p>
          {tx.status === 'IDENTIFICATION_REQUIRED' && <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">atenção</span>}
          {tx.status === 'RECONCILED' && <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">conciliado</span>}
        </div>
        <p className="text-[10px] text-slate-400">{dateLabel(tx.date)} · {account?.name || 'Conta não informada'} {category ? `· ${category.nome}` : ''}</p>
        {detailed && tx.projectId && <p className="text-[10px] text-indigo-500 font-bold mt-0.5">Projeto vinculado</p>}
      </div>
      <div className={`font-black text-sm shrink-0 ${isIncome ? 'text-emerald-600' : 'text-red-600'}`}>
        {isIncome ? '+' : '-'}{formatBRL(tx.amountCents)}
      </div>
    </div>
  );
}

function AttentionItem({ item, transaction, categories, projects, clients, onResolve }) {
  const [categoryId, setCategoryId] = useState(transaction?.categoryId || '');
  const [projectId, setProjectId] = useState(transaction?.projectId || '');
  const [clientId, setClientId] = useState(transaction?.clientId || '');
  const [rememberMerchant, setRememberMerchant] = useState(true);
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
          <p className="text-[10px] uppercase font-black text-amber-700 mt-2">{item.reason}</p>
        </div>
        <div className="grid sm:grid-cols-3 gap-2 lg:w-[52%]">
          <select value={categoryId} onChange={e=>setCategoryId(e.target.value)} className="p-2.5 bg-white border border-amber-200 rounded-xl text-xs font-bold">
            <option value="">Categoria</option>
            {categories.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
          {transaction.type === 'INCOME' && <select value={clientId} onChange={e=>setClientId(e.target.value)} className="p-2.5 bg-white border border-amber-200 rounded-xl text-xs font-bold">
            <option value="">Cliente / origem</option>
            {clients.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>}
          <select value={projectId} onChange={e=>setProjectId(e.target.value)} className="p-2.5 bg-white border border-amber-200 rounded-xl text-xs font-bold">
            <option value="">Projeto</option>
            {projects.map(p=><option key={p.id} value={p.id}>{p.nomeProjeto}</option>)}
          </select>
        </div>
        <div className="flex lg:flex-col gap-2">
          <label className="flex items-center gap-2 text-[10px] font-bold text-slate-600">
            <input type="checkbox" checked={rememberMerchant} onChange={e=>setRememberMerchant(e.target.checked)}/>
            lembrar regra
          </label>
          <button onClick={()=>onResolve(item,{categoryId,projectId,clientId,rememberMerchant})} className="bg-emerald-600 text-white px-3 py-2 rounded-xl text-xs font-black flex items-center gap-1"><Check size={14}/> Resolver</button>
        </div>
      </div>
    </div>
  );
}

function TransactionModal({ initial, accounts, cards, categories, projects, clients, onClose, onSave, busy }) {
  const [data, setData] = useState(initial);
  const [newProjectOnly, setNewProjectOnly] = useState(false);
  const update = (k,v) => setData(prev=>({...prev,[k]:v}));
  return (
    <Modal title={data.type === 'INCOME' ? 'Nova entrada' : 'Nova despesa'} onClose={onClose}>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Descrição *"><input value={data.description||''} onChange={e=>update('description',e.target.value)} className={inputCls}/></Field>
        <Field label="Valor (R$) *"><input value={data.amount||''} onChange={e=>update('amount',e.target.value)} type="number" min="0" step="0.01" className={inputCls}/></Field>
        <Field label={data.status === 'SCHEDULED' ? 'Data prevista' : 'Data *'}><input type="date" value={data.date||todayLocal()} onChange={e=>update('date',e.target.value)} className={inputCls}/></Field>
        <Field label="Conta"><select value={data.accountId||''} onChange={e=>update('accountId',e.target.value)} className={inputCls}><option value="">Selecione...</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.name} · {a.institution}</option>)}</select></Field>
        <Field label="Categoria"><select value={data.categoryId||''} onChange={e=>update('categoryId',e.target.value)} className={inputCls}><option value="">A definir</option>{categories.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}</select></Field>
        <Field label="Projeto"><select value={data.projectId||''} onChange={e=>update('projectId',e.target.value)} className={inputCls}><option value="">Sem projeto</option>{projects.map(p=><option key={p.id} value={p.id}>{p.nomeProjeto}</option>)}</select></Field>
        {data.type === 'INCOME' && <Field label="Cliente / origem"><select value={data.clientId||''} onChange={e=>update('clientId',e.target.value)} className={inputCls}><option value="">Não identificado</option>{clients.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}</select></Field>}
        <Field label="Estágio"><select value={data.status||'CLASSIFIED'} onChange={e=>update('status',e.target.value)} className={inputCls}><option value="CLASSIFIED">Realizada / classificada</option><option value="SCHEDULED">Prevista</option><option value="IDENTIFICATION_REQUIRED">Aguardando identificação</option></select></Field>
        <div className="sm:col-span-2"><Field label="Observação"><textarea value={data.notes||''} onChange={e=>update('notes',e.target.value)} rows={3} className={inputCls}/></Field></div>
      </div>
      <div className="mt-5 p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-800 font-medium">
        Cartões, compras parceladas e faturas terão entidades próprias nesta nova estrutura. Este lançamento registra apenas o fato financeiro informado agora.
      </div>
      <div className="mt-5 flex justify-end gap-2"><button onClick={onClose} className="px-4 py-2.5 border rounded-xl text-xs font-bold">Cancelar</button><button disabled={busy} onClick={()=>onSave(data)} className="px-4 py-2.5 bg-[#1e5aa0] text-white rounded-xl text-xs font-black disabled:opacity-50">{busy ? 'Salvando...' : 'Salvar movimentação'}</button></div>
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

