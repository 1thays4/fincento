// src/server.js
import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import multer from 'multer'
import crypto from 'crypto'
import * as Belvo from './belvo.js'
import * as Parser from './parser.js'
import * as Storage from './storage.js'

const app  = express()
const PORT = process.env.PORT || 3001

app.set('trust proxy', 1)

// ── Validação de config na inicialização ──────────────────────────────────────
const BELVO_CONFIGURED = process.env.BELVO_SECRET_ID && process.env.BELVO_SECRET_ID !== 'sua_secret_id_aqui'
if (!BELVO_CONFIGURED) {
  console.warn('⚠️  Belvo não configurado. O app funciona apenas com importação de OFX/CSV.')
}

// ── Segurança ─────────────────────────────────────────────────────────────────
app.use(helmet())

// CORS: só aceita requisições do frontend configurado
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}))

app.use(express.json())

// Rate limiting: máx 60 requisições por minuto por IP
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Muitas requisições. Tente novamente em 1 minuto.' },
  standardHeaders: true,
  legacyHeaders: false,
})
app.use('/api/', limiter)

// ── Multer — upload de arquivos ──────────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = file.originalname.toLowerCase()
    if (ext.endsWith('.ofx') || ext.endsWith('.csv') || ext.endsWith('.qfx')) {
      cb(null, true)
    } else {
      cb(new Error('Formato não suportado. Use .ofx, .qfx ou .csv'))
    }
  },
})

// Rate limiting mais restrito para auth (evita brute force)
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { ok: false, error: 'Muitas tentativas. Aguarde 1 minuto.' },
})

// Rate limiting para o widget token
const widgetLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Limite de geração de tokens atingido.' },
})

// ── Autenticação PIN ─────────────────────────────────────────────────────────
const AUTH_PIN_HASH = process.env.AUTH_PIN_HASH || null
const AUTH_SECRET   = process.env.AUTH_SECRET   || 'dev-secret-change-me'

function generateToken() {
  const ts = Date.now().toString()
  const hmac = crypto.createHmac('sha256', AUTH_SECRET).update(ts).digest('hex')
  return `${ts}.${hmac}`
}

function validateToken(token) {
  if (!token) return false
  const [ts, hmac] = token.split('.')
  if (!ts || !hmac) return false
  const expected = crypto.createHmac('sha256', AUTH_SECRET).update(ts).digest('hex')
  if (hmac !== expected) return false
  // Token válido por 7 dias
  const age = Date.now() - parseInt(ts)
  return age < 7 * 24 * 60 * 60 * 1000
}

function authMiddleware(req, res, next) {
  // Se PIN não configurado, pula auth (dev mode)
  if (!AUTH_PIN_HASH) return next()

  const authHeader = req.headers.authorization
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!validateToken(token)) {
    return res.status(401).json({ ok: false, error: 'Token inválido ou expirado.' })
  }
  next()
}

// Aplica auth em todas as rotas /api/* exceto /api/auth
app.post('/api/auth', authLimiter, (req, res) => {
  if (!AUTH_PIN_HASH) {
    // Sem PIN configurado — retorna token direto (dev mode)
    return res.json({ ok: true, data: { token: generateToken() } })
  }

  const { pin } = req.body || {}
  if (!pin) return res.status(400).json({ ok: false, error: 'PIN obrigatório.' })

  const hash = crypto.createHash('sha256').update(pin.toString()).digest('hex')
  if (hash !== AUTH_PIN_HASH) {
    return res.status(401).json({ ok: false, error: 'PIN incorreto.' })
  }

  res.json({ ok: true, data: { token: generateToken() } })
})

// Protege todas as rotas /api/* (exceto /api/auth que já foi registrado acima)
app.use('/api/', authMiddleware)

// ── Cache em memória simples ──────────────────────────────────────────────────
const cache = new Map()
const TTL = {
  links:        5  * 60 * 1000,
  accounts:     5  * 60 * 1000,
  transactions: 5  * 60 * 1000,
}

function getCache(key) {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() - entry.ts > entry.ttl) { cache.delete(key); return null }
  return entry.data
}

function setCache(key, data, ttl) {
  cache.set(key, { data, ts: Date.now(), ttl })
}

function clearCache(prefix) {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key)
  }
}

// ── Helper de resposta ────────────────────────────────────────────────────────
const ok  = (res, data)    => res.json({ ok: true, data })
const err = (res, msg, code = 500) => {
  console.error(`[${new Date().toISOString()}] ❌ ${msg}`)
  res.status(code).json({ ok: false, error: msg })
}

// ── ROTAS ─────────────────────────────────────────────────────────────────────

// Health check (sem auth)
app.get('/health', (_, res) => {
  res.json({
    status: 'ok',
    env:    process.env.BELVO_ENV || 'sandbox',
    uptime: Math.floor(process.uptime()) + 's',
  })
})

// ── Links ─────────────────────────────────────────────────────────────────────

app.get('/api/links', async (_, res) => {
  if (!BELVO_CONFIGURED) return ok(res, [])
  try {
    const cached = getCache('links')
    if (cached) return ok(res, cached)

    const links = await Belvo.getLinks()
    setCache('links', links, TTL.links)
    ok(res, links)
  } catch (e) {
    err(res, e.message)
  }
})

app.post('/api/links/refresh/:linkId', async (req, res) => {
  const { linkId } = req.params
  try {
    await Belvo.refreshLink(linkId)
    clearCache('links')
    clearCache(`accounts:${linkId}`)
    clearCache(`transactions:${linkId}`)
    ok(res, { refreshed: true })
  } catch (e) {
    err(res, e.message)
  }
})

// ── Contas ────────────────────────────────────────────────────────────────────

app.get('/api/accounts/:linkId', async (req, res) => {
  const { linkId } = req.params
  const cacheKey = `accounts:${linkId}`
  try {
    const cached = getCache(cacheKey)
    if (cached) return ok(res, cached)

    const accounts = await Belvo.getAccounts(linkId)
    setCache(cacheKey, accounts, TTL.accounts)
    ok(res, accounts)
  } catch (e) {
    err(res, e.message)
  }
})

// ── Transações ────────────────────────────────────────────────────────────────

app.get('/api/transactions/:linkId', async (req, res) => {
  const { linkId } = req.params
  const { date_from, date_to } = req.query

  if (!date_from || !date_to) {
    return err(res, 'Parâmetros date_from e date_to são obrigatórios.', 400)
  }

  const dateRe = /^\d{4}-\d{2}-\d{2}$/
  if (!dateRe.test(date_from) || !dateRe.test(date_to)) {
    return err(res, 'Formato de data inválido. Use YYYY-MM-DD.', 400)
  }

  const cacheKey = `transactions:${linkId}:${date_from}:${date_to}`
  try {
    const cached = getCache(cacheKey)
    if (cached) return ok(res, cached)

    const txs = await Belvo.getTransactions(linkId, date_from, date_to)
    setCache(cacheKey, txs, TTL.transactions)
    ok(res, txs)
  } catch (e) {
    err(res, e.message)
  }
})

// GET /api/transactions?date_from=...&date_to=...
app.get('/api/transactions', async (req, res) => {
  const { date_from, date_to } = req.query

  if (!date_from || !date_to) {
    return err(res, 'Parâmetros date_from e date_to são obrigatórios.', 400)
  }

  try {
    const cacheKey = `transactions:all:${date_from}:${date_to}`
    const cached = getCache(cacheKey)
    if (cached) return ok(res, cached)

    let belvoTxs = []
    try {
      const links = await Belvo.getLinks()
      const results = await Promise.allSettled(
        links.map(link =>
          Belvo.getTransactions(link.id, date_from, date_to)
            .then(txs => txs.map(t => ({
              ...t,
              _linkId:      link.id,
              _institution: link.institution?.name || link.id,
            })))
        )
      )
      belvoTxs = results
        .filter(r => r.status === 'fulfilled')
        .flatMap(r => r.value)
    } catch { /* Belvo indisponível */ }

    const imported = (await Storage.loadAllImported())
      .filter(t => t.value_date >= date_from && t.value_date <= date_to)

    const allTxs = [...belvoTxs, ...imported]
    setCache(cacheKey, allTxs, TTL.transactions)
    ok(res, allTxs)
  } catch (e) {
    err(res, e.message)
  }
})

// ── Widget Token ──────────────────────────────────────────────────────────────

app.post('/api/widget-token', widgetLimiter, async (req, res) => {
  const { linkId } = req.body
  try {
    const token = await Belvo.createWidgetToken(linkId || null)
    ok(res, { access: token.access })
  } catch (e) {
    err(res, e.message)
  }
})

// ── Import OFX/CSV ───────────────────────────────────────────────────────────

app.post('/api/import/upload', (req, res, next) => {
  upload.single('file')(req, res, (uploadErr) => {
    if (uploadErr) return err(res, uploadErr.message, 400)
    next()
  })
}, async (req, res) => {
  try {
    if (!req.file) return err(res, 'Nenhum arquivo enviado.', 400)

    const bank = req.body.bank || 'Importado'
    const transactions = await Parser.parseFile(req.file.buffer, req.file.originalname)
    transactions.forEach(t => { if (!t._institution) t._institution = bank })

    const batch = await Storage.saveBatch(transactions, { bank, originalFilename: req.file.originalname })
    clearCache('transactions')

    ok(res, { ...batch, transactions })
  } catch (e) {
    err(res, e.message, 400)
  }
})

app.get('/api/import/transactions', async (req, res) => {
  try {
    const { date_from, date_to } = req.query
    let txs = await Storage.loadAllImported()
    if (date_from && date_to) {
      txs = txs.filter(t => t.value_date >= date_from && t.value_date <= date_to)
    }
    ok(res, txs)
  } catch (e) {
    err(res, e.message)
  }
})

app.get('/api/import/batches', async (_, res) => {
  try {
    ok(res, await Storage.listBatches())
  } catch (e) {
    err(res, e.message)
  }
})

app.delete('/api/import/batches/:batchId', async (req, res) => {
  try {
    await Storage.deleteBatch(req.params.batchId)
    clearCache('transactions')
    ok(res, { deleted: true })
  } catch (e) {
    err(res, e.message, 404)
  }
})

// ── Editar categoria ─────────────────────────────────────────────────────────

app.patch('/api/transactions/:txId/category', async (req, res) => {
  try {
    const { category } = req.body
    await Storage.updateTransactionCategory(req.params.txId, category || null)
    clearCache('transactions')
    ok(res, { updated: true })
  } catch (e) {
    err(res, e.message, 400)
  }
})

// ── Transação manual ─────────────────────────────────────────────────────────

app.post('/api/transactions/manual', async (req, res) => {
  try {
    const { description, amount, value_date, type, category } = req.body
    if (!description || amount == null || !value_date || !type) {
      return err(res, 'Campos obrigatórios: description, amount, value_date, type.', 400)
    }

    const id = `manual_${crypto.randomUUID()}`
    await Storage.addManualTransaction({ id, description, amount: parseFloat(amount), value_date, type, category })
    clearCache('transactions')
    ok(res, { id, description, amount, value_date, type, category })
  } catch (e) {
    err(res, e.message, 400)
  }
})

// ── Estatísticas mensais ─────────────────────────────────────────────────────

const MONTH_LABELS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

app.get('/api/stats/monthly-flow', async (req, res) => {
  try {
    const months = parseInt(req.query.months) || 6
    const now = new Date()
    const from = new Date(now.getFullYear(), now.getMonth() - months + 1, 1)
    const dateFrom = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-01`
    const dateTo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()).padStart(2, '0')}`

    const rows = await Storage.getMonthlyAggregates(dateFrom, dateTo)

    // Garante todos os meses presentes (mesmo sem transações)
    const result = []
    for (let i = 0; i < months; i++) {
      const d = new Date(from.getFullYear(), from.getMonth() + i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const row = rows.find(r => r.month === key)
      result.push({
        month: MONTH_LABELS[d.getMonth()],
        gasto: row?.gasto || 0,
        receita: row?.receita || 0,
      })
    }

    ok(res, result)
  } catch (e) {
    err(res, e.message)
  }
})

// ── Orçamento ────────────────────────────────────────────────────────────────

app.get('/api/budgets', async (_, res) => {
  try {
    ok(res, await Storage.getBudgets())
  } catch (e) {
    err(res, e.message)
  }
})

app.put('/api/budgets/:categoryKey', async (req, res) => {
  try {
    const { limit } = req.body
    if (!limit || limit <= 0) return err(res, 'Limite deve ser maior que zero.', 400)
    await Storage.saveBudget(req.params.categoryKey, parseFloat(limit))
    ok(res, { saved: true })
  } catch (e) {
    err(res, e.message)
  }
})

app.delete('/api/budgets/:categoryKey', async (req, res) => {
  try {
    await Storage.deleteBudget(req.params.categoryKey)
    ok(res, { deleted: true })
  } catch (e) {
    err(res, e.message)
  }
})

// ── Exportar CSV ─────────────────────────────────────────────────────────────

app.get('/api/export/csv', async (req, res) => {
  try {
    const { date_from, date_to } = req.query
    const txs = await Storage.getTransactionsForExport(date_from, date_to)

    const header = 'Data;Descrição;Valor;Tipo;Categoria;Banco'
    const rows = txs.map(t => {
      const valor = t.amount.toFixed(2).replace('.', ',')
      const tipo = t.type === 'OUTFLOW' ? 'Gasto' : 'Receita'
      const cat = t.category || 'Outros'
      const banco = t.institution || 'Manual'
      return `${t.value_date};${t.description};${valor};${tipo};${cat};${banco}`
    })

    const csv = '\uFEFF' + [header, ...rows].join('\n')
    const filename = `fincento-export-${date_from || 'all'}.csv`

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.send(csv)
  } catch (e) {
    err(res, e.message)
  }
})

// ── 404 catch-all ─────────────────────────────────────────────────────────────
app.use((_, res) => res.status(404).json({ ok: false, error: 'Rota não encontrada.' }))

// ── Start (async para aguardar Turso) ────────────────────────────────────────
async function start() {
  await Storage.initStorage()
  app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════╗
║  fin.centro backend                ║
║  http://localhost:${PORT}             ║
║  Belvo env: ${(process.env.BELVO_ENV || 'sandbox').padEnd(21)}║
║  Auth: ${AUTH_PIN_HASH ? 'PIN ativo' : 'desabilitado'}              ║
╚════════════════════════════════════╝
    `)
  })
}

start().catch(e => {
  console.error('❌ Falha ao iniciar:', e.message)
  process.exit(1)
})
