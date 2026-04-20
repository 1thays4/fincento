// src/server.js
import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import multer from 'multer'
import * as Belvo from './belvo.js'
import * as Parser from './parser.js'
import * as Storage from './storage.js'

const app  = express()
const PORT = process.env.PORT || 3001

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
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type'],
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

// Rate limiting mais restrito para o widget token (evita abuso)
const widgetLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Limite de geração de tokens atingido.' },
})

// ── Cache em memória simples ──────────────────────────────────────────────────
// Evita bater na API Belvo a cada carregamento de tela.
// Em produção com múltiplos usuários, use Redis.
const cache = new Map()
const TTL = {
  links:        5  * 60 * 1000, //  5 min
  accounts:     5  * 60 * 1000, //  5 min
  transactions: 5  * 60 * 1000, //  5 min
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

// Health check
app.get('/health', (_, res) => {
  res.json({
    status: 'ok',
    env:    process.env.BELVO_ENV || 'sandbox',
    uptime: Math.floor(process.uptime()) + 's',
  })
})

// ── Links ─────────────────────────────────────────────────────────────────────

// GET /api/links — lista todos os links (bancos conectados)
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

// POST /api/links/refresh/:linkId — força resync de um link
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

// GET /api/accounts/:linkId — lista contas de um link
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

// GET /api/transactions/:linkId?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD
app.get('/api/transactions/:linkId', async (req, res) => {
  const { linkId } = req.params
  const { date_from, date_to } = req.query

  if (!date_from || !date_to) {
    return err(res, 'Parâmetros date_from e date_to são obrigatórios.', 400)
  }

  // Validação básica de formato de data
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

// GET /api/transactions/all?date_from=...&date_to=...
// Busca transações de TODOS os links de uma vez (útil para o dashboard)
app.get('/api/transactions', async (req, res) => {
  const { date_from, date_to } = req.query

  if (!date_from || !date_to) {
    return err(res, 'Parâmetros date_from e date_to são obrigatórios.', 400)
  }

  try {
    const cacheKey = `transactions:all:${date_from}:${date_to}`
    const cached = getCache(cacheKey)
    if (cached) return ok(res, cached)

    // Tenta buscar do Belvo (pode falhar se não configurado)
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
    } catch { /* Belvo indisponível, continua só com importados */ }

    // Merge com transações importadas via OFX/CSV (sem filtro de data — volume pequeno)
    const imported = Storage.loadAllImported()

    const allTxs = [...belvoTxs, ...imported]
    setCache(cacheKey, allTxs, TTL.transactions)
    ok(res, allTxs)
  } catch (e) {
    err(res, e.message)
  }
})

// ── Widget Token ──────────────────────────────────────────────────────────────

// POST /api/widget-token
// O frontend pede um token temporário para abrir o Belvo Connect Widget.
// O token expira em minutos — seguro para enviar ao browser.
app.post('/api/widget-token', widgetLimiter, async (req, res) => {
  const { linkId } = req.body // opcional: para reconectar um link existente
  try {
    const token = await Belvo.createWidgetToken(linkId || null)
    ok(res, { access: token.access })
  } catch (e) {
    err(res, e.message)
  }
})

// ── Import OFX/CSV ───────────────────────────────────────────────────────────

// POST /api/import/upload — Upload e parse de arquivo OFX/CSV
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

    // Seta instituição em cada transação
    transactions.forEach(t => { if (!t._institution) t._institution = bank })

    const batch = Storage.saveBatch(transactions, { bank, originalFilename: req.file.originalname })

    // Limpa cache de transações para incluir os importados
    clearCache('transactions')

    ok(res, { ...batch, transactions })
  } catch (e) {
    err(res, e.message, 400)
  }
})

// GET /api/import/transactions — Lista todas as transações importadas
app.get('/api/import/transactions', (req, res) => {
  try {
    const { date_from, date_to } = req.query
    let txs = Storage.loadAllImported()
    if (date_from && date_to) {
      txs = txs.filter(t => t.value_date >= date_from && t.value_date <= date_to)
    }
    ok(res, txs)
  } catch (e) {
    err(res, e.message)
  }
})

// GET /api/import/batches — Lista batches importados
app.get('/api/import/batches', (_, res) => {
  try {
    ok(res, Storage.listBatches())
  } catch (e) {
    err(res, e.message)
  }
})

// DELETE /api/import/batches/:batchId — Deleta um batch
app.delete('/api/import/batches/:batchId', (req, res) => {
  try {
    Storage.deleteBatch(req.params.batchId)
    clearCache('transactions')
    ok(res, { deleted: true })
  } catch (e) {
    err(res, e.message, 404)
  }
})

// ── 404 catch-all ─────────────────────────────────────────────────────────────
app.use((_, res) => res.status(404).json({ ok: false, error: 'Rota não encontrada.' }))

// ── Start ─────────────────────────────────────────────────────────────────────
Storage.initStorage()

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════╗
║  fin.centro backend                ║
║  http://localhost:${PORT}             ║
║  Belvo env: ${(process.env.BELVO_ENV || 'sandbox').padEnd(21)}║
╚════════════════════════════════════╝
  `)
})
