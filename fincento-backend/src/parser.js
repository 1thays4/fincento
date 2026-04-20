// src/parser.js — Parser de OFX e CSV para formato Belvo-compatível
import { parse as parseOFXLib } from 'ofx-js'
import { parse as csvParseSync } from 'csv-parse/sync'
import { v4 as uuid } from 'uuid'

// ── Detecta tipo e delega ────────────────────────────────────────────────────
export function parseFile(buffer, filename) {
  const ext = filename.toLowerCase().split('.').pop()
  const content = buffer.toString('utf-8')

  if (ext === 'ofx' || ext === 'qfx') return parseOFX(content)
  if (ext === 'csv') return parseCSV(content)
  throw new Error('Formato não suportado. Use .ofx, .qfx ou .csv')
}

// ── OFX Parser ───────────────────────────────────────────────────────────────
export async function parseOFX(content) {
  const data = await parseOFXLib(content)

  // Navega na árvore OFX — bancos usam BANKMSGSRSV1, cartões usam CREDITCARDMSGSRSV1
  const bankStmt = data.OFX?.BANKMSGSRSV1?.STMTTRNRS?.STMTRS?.BANKTRANLIST?.STMTTRN
  const ccStmt = data.OFX?.CREDITCARDMSGSRSV1?.CCSTMTTRNRS?.CCSTMTRS?.BANKTRANLIST?.STMTTRN

  let entries = bankStmt || ccStmt
  if (!entries) throw new Error('Nenhuma transação encontrada no arquivo OFX.')

  // Garante array (OFX com uma única transação retorna objeto)
  if (!Array.isArray(entries)) entries = [entries]

  // Tenta extrair nome do banco do OFX
  const fiOrg = data.OFX?.SIGNONMSGSRSV1?.SONRS?.FI?.ORG || null

  return entries.map(e => {
    const desc = (e.NAME || e.MEMO || 'Sem descrição').trim()
    return {
      id: `imp_${uuid()}`,
      description: desc,
      amount: parseFloat(e.TRNAMT) || 0,
      value_date: parseOFXDate(e.DTPOSTED),
      type: parseFloat(e.TRNAMT) < 0 ? 'OUTFLOW' : 'INFLOW',
      category: categorize(desc),
      _linkId: 'import',
      _institution: fiOrg,
    }
  })
}

// ── CSV Parser ───────────────────────────────────────────────────────────────
export function parseCSV(content) {
  // Tenta com ponto-e-vírgula primeiro (padrão brasileiro), depois vírgula
  let records = tryParseCSV(content, ';')
  if (!records || (records.length > 0 && Object.keys(records[0]).length <= 1)) {
    records = tryParseCSV(content, ',')
  }
  if (!records || records.length === 0) throw new Error('Não foi possível ler o CSV. Verifique o formato.')

  const cols = detectColumns(Object.keys(records[0]))
  if (!cols.date || !cols.amount) {
    throw new Error('CSV inválido: não encontrei colunas de data e valor. Colunas esperadas: data/date, valor/amount, descricao/description.')
  }

  // Detecta padrão: se maioria é positiva, trata positivos como gastos (fatura de cartão)
  // Se maioria é negativa, trata negativos como gastos (extrato bancário)
  const amounts = records.map(r => parseBRLAmount(r[cols.amount])).filter(a => !isNaN(a))
  const positiveCount = amounts.filter(a => a > 0).length
  const negativeCount = amounts.filter(a => a < 0).length
  // Maioria positiva = fatura (positivo = gasto). Maioria negativa = extrato (negativo = gasto).
  const positiveIsOutflow = positiveCount >= negativeCount

  return records.map(row => {
    const rawAmount = parseBRLAmount(row[cols.amount])
    const type = positiveIsOutflow
      ? (rawAmount > 0 ? 'OUTFLOW' : 'INFLOW')
      : (rawAmount < 0 ? 'OUTFLOW' : 'INFLOW')
    const desc = (row[cols.desc] || 'Sem descrição').trim()
    return {
      id: `imp_${uuid()}`,
      description: desc,
      amount: rawAmount,
      value_date: parseBRLDate(row[cols.date]),
      type,
      category: categorize(desc),
      _linkId: 'import',
      _institution: null,
    }
  }).filter(t => t.value_date && !isNaN(t.amount))
}

// ── Categorização automática por palavras-chave ─────────────────────────────
const CATEGORY_RULES = [
  { category: 'Food & Groceries', keywords: ['mercado', 'supermercado', 'hortifruti', 'sacolão', 'sacolao', 'açougue', 'acougue', 'padaria', 'mercearia', 'atacadão', 'atacadao', 'assaí', 'assai', 'bistek', 'carrefour', 'extra', 'pão de açúcar', 'pao de acucar', 'big', 'walmart', 'sam\'s', 'sams'] },
  { category: 'Restaurants',      keywords: ['ifood', 'restaurante', 'lanchonete', 'pizzaria', 'hamburgueria', 'sushi', 'uber eats', 'rappi', 'bistrô', 'bistro', 'bar ', 'churrascaria', 'cantina', 'cafeteria', 'café', 'cafe', 'mcdonald', 'burger king', 'subway', 'starbucks', 'outback'] },
  { category: 'Transport',        keywords: ['uber', 'lyft', '99', '99app', 'gasolina', 'combustível', 'combustivel', 'posto', 'shell', 'petrobras', 'ipiranga', 'estacionamento', 'parking', 'pedágio', 'pedagio', 'sem parar', 'conectcar', 'move mais'] },
  { category: 'Health',           keywords: ['farmácia', 'farmacia', 'drogaria', 'hospital', 'clínica', 'clinica', 'médico', 'medico', 'dentista', 'laboratorio', 'laboratório', 'unimed', 'amil', 'hapvida', 'sulamerica', 'sulamerica', 'academia', 'smart fit', 'gympass', 'wellhub', 'droga raia', 'drogasil', 'nissei', 'catarinense', 'panvel'] },
  { category: 'Entertainment',    keywords: ['cinema', 'teatro', 'show', 'ingresso', 'parque', 'diversão', 'diversao', 'jogo', 'game', 'steam', 'playstation', 'xbox', 'nintendo', 'cinemark', 'cinépolis', 'cinepolis'] },
  { category: 'Education',        keywords: ['escola', 'faculdade', 'universidade', 'curso', 'udemy', 'alura', 'coursera', 'livro', 'livraria', 'mensalidade escolar', 'material escolar'] },
  { category: 'Housing',          keywords: ['aluguel', 'condomínio', 'condominio', 'iptu', 'água', 'agua', 'samae', 'sanepar', 'copasa', 'sabesp', 'energia', 'celesc', 'enel', 'cpfl', 'cemig', 'copel', 'light', 'eletropaulo', 'gás', 'gas', 'comgas', 'internet', 'vivo fibra', 'claro', 'tim', 'oi'] },
  { category: 'Subscriptions',    keywords: ['netflix', 'spotify', 'disney', 'hbo', 'amazon prime', 'apple', 'youtube premium', 'globoplay', 'deezer', 'paramount', 'star+', 'crunchyroll', 'xbox game pass', 'icloud', 'google one', 'chatgpt', 'notion'] },
]

function categorize(description) {
  if (!description) return null
  const lower = description.toLowerCase()
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some(kw => lower.includes(kw))) return rule.category
  }
  return null
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function tryParseCSV(content, delimiter) {
  try {
    return csvParseSync(content, {
      delimiter,
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    })
  } catch {
    return null
  }
}

const COL_MAP = {
  date: ['data', 'date', 'dt', 'data_transacao', 'data lançamento', 'data lancamento', 'data movimento'],
  amount: ['valor', 'amount', 'value', 'vlr', 'valor (r$)', 'montante'],
  desc: ['descricao', 'descrição', 'description', 'historico', 'histórico', 'memo', 'lancamento', 'lançamento', 'detalhe'],
}

function detectColumns(headers) {
  const lower = headers.map(h => h.toLowerCase().trim())
  const find = (candidates) => {
    for (const c of candidates) {
      const idx = lower.findIndex(h => h.includes(c))
      if (idx !== -1) return headers[idx]
    }
    return null
  }
  return { date: find(COL_MAP.date), amount: find(COL_MAP.amount), desc: find(COL_MAP.desc) }
}

function parseOFXDate(raw) {
  if (!raw) return null
  // Formato: YYYYMMDD ou YYYYMMDDHHMMSS
  const d = raw.replace(/\[.*$/, '').trim()
  if (d.length >= 8) return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
  return null
}

function parseBRLDate(raw) {
  if (!raw) return null
  const s = raw.trim()

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s

  // DD/MM/YYYY
  const m1 = s.match(/^(\d{2})[/.-](\d{2})[/.-](\d{4})$/)
  if (m1) return `${m1[3]}-${m1[2]}-${m1[1]}`

  // DD/MM/YY
  const m2 = s.match(/^(\d{2})[/.-](\d{2})[/.-](\d{2})$/)
  if (m2) {
    const year = parseInt(m2[3]) > 50 ? `19${m2[3]}` : `20${m2[3]}`
    return `${year}-${m2[2]}-${m2[1]}`
  }

  return null
}

function parseBRLAmount(raw) {
  if (!raw) return NaN
  let s = raw.toString().trim().replace(/^R\$\s*/, '')

  // Formato brasileiro: 1.234,56 → 1234.56
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.')
  }

  return parseFloat(s)
}
