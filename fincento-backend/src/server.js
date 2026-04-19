// src/server.js
import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import * as Belvo from './belvo.js'

const app  = express()
const PORT = process.env.PORT || 3001

// ── Validação de config na inicialização ──────────────────────────────────────
if (!process.env.BELVO_SECRET_ID || process.env.BELVO_SECRET_ID === 'your_secret_id_here') {
  console.error('❌ BELVO_SECRET_ID não configurado. Copie .env.example para .env e preencha.')
  process.exit(1)
}

// ── Segurança ─────────────────────────────────────────────────────────────────
app.use(helmet())

// CORS: só aceita requisições do frontend configurado
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  methods: ['GET', 'POST', 'PATCH'],
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

    const allTxs = results
      .filter(r => r.status === 'fulfilled')
      .flatMap(r => r.value)

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

// ── 404 catch-all ─────────────────────────────────────────────────────────────
app.use((_, res) => res.status(404).json({ ok: false, error: 'Rota não encontrada.' }))

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════╗
║  fin.centro backend                ║
║  http://localhost:${PORT}             ║
║  Belvo env: ${(process.env.BELVO_ENV || 'sandbox').padEnd(21)}║
╚════════════════════════════════════╝
  `)
})
