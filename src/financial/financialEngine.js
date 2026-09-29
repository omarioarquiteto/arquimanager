// Núcleo financeiro do ArquiManager.
// Regra central: movimentação bancária = fato ocorrido; planejamento e compras parceladas
// são entidades separadas e não devem duplicar o caixa.

export const MONEY_SCALE = 100;

export const toCents = (value) => {
  const n = Number(String(value ?? '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * MONEY_SCALE) : 0;
};

export const fromCents = (cents) => (Number(cents || 0) / MONEY_SCALE);

export const formatBRL = (cents) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(fromCents(cents));

export const todayLocal = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const normalizeText = (value = '') =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export const transactionKey = ({ accountId = '', date = '', description = '', amountCents = 0, externalId = '' }) =>
  externalId ||
  [accountId, date, normalizeText(description), amountCents].join('|');

export const DEFAULT_CATEGORIES = [
  ['receitas', 'Receitas'],
  ['alimentacao', 'Alimentação'],
  ['transporte', 'Transporte'],
  ['materiais', 'Materiais e Compras'],
  ['servicos', 'Serviços Terceirizados'],
  ['software', 'Software e Assinaturas'],
  ['impostos', 'Impostos e Taxas'],
  ['estrutura', 'Estrutura do Escritório'],
  ['pessoal', 'Pessoal / Pró-labore'],
  ['marketing', 'Marketing'],
  ['tarifas', 'Tarifas Bancárias'],
  ['outros', 'Outros'],
];

export const TYPE_LABELS = {
  EXPENSE: 'Despesa',
  INCOME: 'Entrada',
  TRANSFER: 'Transferência',
  ADJUSTMENT: 'Ajuste',
};

export const STATUS_LABELS = {
  RECONCILED: 'Conciliado',
  CLASSIFIED: 'Classificado',
  IDENTIFICATION_REQUIRED: 'Precisa de atenção',
  SCHEDULED: 'Previsto',
  CANCELLED: 'Cancelado',
};

export const parseCsvLine = (line, separator = ',') => {
  const cells = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (ch === separator && !quoted) {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
};

export const parseCsvAmount = (raw) => {
  if (raw == null) return 0;
  let s = String(raw).trim().replace(/R\$|\s/g, '');
  const hasComma = s.includes(',');
  if (hasComma) s = s.replace(/\./g, '').replace(',', '.');
  return toCents(s);
};

export const detectCsvHeader = (header = '') => {
  const h = normalizeText(header);
  const aliases = {
    date: ['data', 'date', 'dt'],
    description: ['descricao', 'descrição', 'historico', 'histórico', 'description', 'lancamento', 'lançamento'],
    amount: ['valor', 'amount', 'quantia', 'value'],
  };
  const separator = h.includes(';') ? ';' : ',';
  const parts = parseCsvLine(header, separator).map(normalizeText);
  const find = (names) => parts.findIndex((p) => names.some((name) => normalizeText(name) === p));
  return {
    date: find(aliases.date),
    description: find(aliases.description),
    amount: find(aliases.amount),
    separator,
  };
};
