// src/storage.js — Persistência via Turso (SQLite na nuvem)
import { createClient } from '@libsql/client'
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { setLearnedRules } from './parser.js'

let db

// ── Inicialização ────────────────────────────────────────────────────────────
export async function initStorage() {
  const tursoUrl = process.env.TURSO_DATABASE_URL
  if (tursoUrl && !tursoUrl.includes('seu-banco')) {
    db = createClient({ url: tursoUrl, authToken: process.env.TURSO_AUTH_TOKEN })
    console.log('💾 Turso conectado.')
  } else {
    const localPath = join(process.cwd(), 'data', 'local.db')
    const { mkdirSync } = await import('fs')
    mkdirSync(join(process.cwd(), 'data'), { recursive: true })
    db = createClient({ url: `file:${localPath}` })
    console.log(`💾 SQLite local: ${localPath}`)
  }

  await db.batch([
    `CREATE TABLE IF NOT EXISTS batches (
      id TEXT PRIMARY KEY,
      bank TEXT NOT NULL,
      original_filename TEXT,
      imported_at TEXT NOT NULL DEFAULT (datetime('now')),
      count INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      batch_id TEXT,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      value_date TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('OUTFLOW', 'INFLOW')),
      category TEXT,
      category_override TEXT,
      link_id TEXT,
      institution TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS budgets (
      category_key TEXT PRIMARY KEY,
      limit_amount REAL NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(value_date)`,
    `CREATE INDEX IF NOT EXISTS idx_tx_batch ON transactions(batch_id)`,
    `CREATE INDEX IF NOT EXISTS idx_tx_type ON transactions(type)`,
    `CREATE TABLE IF NOT EXISTS category_rules (
      description TEXT PRIMARY KEY,
      category TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS recurring_transactions (
      id TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('OUTFLOW', 'INFLOW')),
      category TEXT,
      day_of_month INTEGER NOT NULL,
      active INTEGER NOT NULL DEFAULT 1
    )`,
    `CREATE TABLE IF NOT EXISTS savings_goals (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      target_amount REAL NOT NULL,
      current_amount REAL NOT NULL DEFAULT 0,
      deadline TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
  ])

  // Carrega regras aprendidas para o parser
  await loadLearnedRules()

  // Migra dados do filesystem antigo (se existirem)
  await migrateFromFilesystem()
}

// ── Migração do filesystem → Turso ──────────────────────────────────────────
async function migrateFromFilesystem() {
  const dataDir = join(process.cwd(), 'data', 'imports')
  if (!existsSync(dataDir)) return

  const files = readdirSync(dataDir).filter(f => f.endsWith('.json'))
  if (files.length === 0) return

  // Só migra se a tabela estiver vazia
  const { rows } = await db.execute('SELECT COUNT(*) AS c FROM batches')
  if (rows[0].c > 0) return

  console.log(`📦 Migrando ${files.length} batch(es) do filesystem para Turso...`)

  for (const file of files) {
    try {
      const batch = JSON.parse(readFileSync(join(dataDir, file), 'utf-8'))
      if (!batch.id || !Array.isArray(batch.transactions)) continue

      const stmts = [
        {
          sql: 'INSERT OR IGNORE INTO batches (id, bank, original_filename, imported_at, count) VALUES (?, ?, ?, ?, ?)',
          args: [batch.id, batch.bank || 'Importado', batch.originalFilename || null, batch.importedAt, batch.count || batch.transactions.length],
        },
        ...batch.transactions.map(t => ({
          sql: 'INSERT OR IGNORE INTO transactions (id, batch_id, description, amount, value_date, type, category, link_id, institution) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          args: [t.id, batch.id, t.description, t.amount, t.value_date, t.type, t.category || null, t._linkId || 'import', t._institution || null],
        })),
      ]
      await db.batch(stmts)
    } catch (e) {
      console.warn(`⚠ Falha ao migrar ${file}: ${e.message}`)
    }
  }

  console.log('✅ Migração concluída.')
}

// ── Batches ──────────────────────────────────────────────────────────────────
export async function saveBatch(transactions, metadata = {}) {
  // Deduplica: ignora transações que já existem (mesma descrição + valor + data)
  const { rows: existing } = await db.execute(
    `SELECT description, amount, value_date FROM transactions WHERE link_id IN ('import', 'manual')`
  )
  const existingSet = new Set(existing.map(r => `${r.description}|${r.amount}|${r.value_date}`))
  const unique = transactions.filter(t => !existingSet.has(`${t.description}|${t.amount}|${t.value_date}`))

  if (unique.length === 0) {
    return { id: null, count: 0, bank: metadata.bank || 'Importado', importedAt: new Date().toISOString(), skipped: transactions.length }
  }

  const batchId = randomUUID()
  const bank = metadata.bank || 'Importado'
  const importedAt = new Date().toISOString()

  const stmts = [
    {
      sql: 'INSERT INTO batches (id, bank, original_filename, imported_at, count) VALUES (?, ?, ?, ?, ?)',
      args: [batchId, bank, metadata.originalFilename || null, importedAt, unique.length],
    },
    ...unique.map(t => ({
      sql: 'INSERT INTO transactions (id, batch_id, description, amount, value_date, type, category, link_id, institution) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      args: [t.id, batchId, t.description, t.amount, t.value_date, t.type, t.category || null, t._linkId || 'import', t._institution || null],
    })),
  ]

  await db.batch(stmts)
  const skipped = transactions.length - unique.length
  return { id: batchId, count: unique.length, bank, importedAt, skipped }
}

export async function listBatches() {
  const { rows } = await db.execute('SELECT id, bank, imported_at AS importedAt, count FROM batches ORDER BY imported_at DESC')
  return rows
}

export async function deleteBatch(batchId) {
  const { rowsAffected } = await db.execute({ sql: 'DELETE FROM batches WHERE id = ?', args: [batchId] })
  if (rowsAffected === 0) throw new Error('Batch não encontrado.')
  // Transactions são deletadas via CASCADE
  await db.execute({ sql: 'DELETE FROM transactions WHERE batch_id = ?', args: [batchId] })
}

// ── Transações importadas ───────────────────────────────────────────────────
export async function loadAllImported() {
  const { rows } = await db.execute(
    `SELECT id, description, amount, value_date, type,
            COALESCE(category_override, category) AS category,
            link_id AS _linkId, institution AS _institution
     FROM transactions
     WHERE link_id IN ('import', 'manual')
     ORDER BY value_date DESC`
  )
  return rows
}

// ── Regras aprendidas ───────────────────────────────────────────────────────
async function loadLearnedRules() {
  const { rows } = await db.execute('SELECT description, category FROM category_rules')
  setLearnedRules(rows)
}

async function saveLearnedRule(description, category) {
  await db.execute({
    sql: 'INSERT OR REPLACE INTO category_rules (description, category) VALUES (?, ?)',
    args: [description.toLowerCase().trim(), category],
  })
  await loadLearnedRules() // atualiza cache no parser
}

// ── Editar categoria ────────────────────────────────────────────────────────
export async function updateTransactionCategory(txId, category) {
  // Atualiza a transação
  const { rowsAffected } = await db.execute({
    sql: 'UPDATE transactions SET category_override = ? WHERE id = ?',
    args: [category, txId],
  })
  if (rowsAffected === 0) throw new Error('Transação não encontrada.')

  // Aprende: salva a descrição → categoria para uso futuro
  const { rows } = await db.execute({ sql: 'SELECT description FROM transactions WHERE id = ?', args: [txId] })
  if (rows.length > 0) {
    await saveLearnedRule(rows[0].description, category)
  }
}

// ── Transação manual ────────────────────────────────────────────────────────
export async function addManualTransaction({ id, description, amount, value_date, type, category }) {
  await db.execute({
    sql: `INSERT INTO transactions (id, batch_id, description, amount, value_date, type, category, link_id, institution)
          VALUES (?, NULL, ?, ?, ?, ?, ?, 'manual', 'Manual')`,
    args: [id, description, amount, value_date, type, category || null],
  })
}

// ── Orçamento ───────────────────────────────────────────────────────────────
export async function getBudgets() {
  const { rows } = await db.execute('SELECT category_key, limit_amount FROM budgets')
  return rows
}

export async function saveBudget(categoryKey, limitAmount) {
  await db.execute({
    sql: 'INSERT OR REPLACE INTO budgets (category_key, limit_amount) VALUES (?, ?)',
    args: [categoryKey, limitAmount],
  })
}

export async function deleteBudget(categoryKey) {
  await db.execute({ sql: 'DELETE FROM budgets WHERE category_key = ?', args: [categoryKey] })
}

// ── Estatísticas mensais ────────────────────────────────────────────────────
export async function getMonthlyAggregates(dateFrom, dateTo) {
  const { rows } = await db.execute({
    sql: `SELECT strftime('%Y-%m', value_date) AS month,
                 SUM(CASE WHEN type = 'OUTFLOW' THEN ABS(amount) ELSE 0 END) AS gasto,
                 SUM(CASE WHEN type = 'INFLOW'  THEN ABS(amount) ELSE 0 END) AS receita
          FROM transactions
          WHERE value_date BETWEEN ? AND ?
          GROUP BY month
          ORDER BY month`,
    args: [dateFrom, dateTo],
  })
  return rows
}

// ── Deletar transação individual ────────────────────────────────────────────
export async function deleteTransaction(txId) {
  const { rowsAffected } = await db.execute({ sql: 'DELETE FROM transactions WHERE id = ?', args: [txId] })
  if (rowsAffected === 0) throw new Error('Transação não encontrada.')
}

// ── Editar transação ────────────────────────────────────────────────────────
export async function updateTransaction(txId, fields) {
  const sets = []
  const args = []
  if (fields.description !== undefined) { sets.push('description = ?'); args.push(fields.description) }
  if (fields.amount !== undefined)      { sets.push('amount = ?');      args.push(fields.amount) }
  if (fields.value_date !== undefined)  { sets.push('value_date = ?');  args.push(fields.value_date) }
  if (fields.type !== undefined)        { sets.push('type = ?');        args.push(fields.type) }
  if (sets.length === 0) throw new Error('Nenhum campo para atualizar.')
  args.push(txId)
  const { rowsAffected } = await db.execute({ sql: `UPDATE transactions SET ${sets.join(', ')} WHERE id = ?`, args })
  if (rowsAffected === 0) throw new Error('Transação não encontrada.')
}

// ── Transações recorrentes ─────────────────────────────────────────────────
export async function getRecurringTransactions() {
  const { rows } = await db.execute('SELECT id, description, amount, type, category, day_of_month, active FROM recurring_transactions ORDER BY description')
  return rows
}

export async function addRecurringTransaction({ id, description, amount, type, category, day_of_month }) {
  await db.execute({
    sql: 'INSERT INTO recurring_transactions (id, description, amount, type, category, day_of_month, active) VALUES (?, ?, ?, ?, ?, ?, 1)',
    args: [id, description, amount, type, category || null, day_of_month],
  })
}

export async function deleteRecurringTransaction(id) {
  await db.execute({ sql: 'DELETE FROM recurring_transactions WHERE id = ?', args: [id] })
}

// ── Metas de economia ──────────────────────────────────────────────────────
export async function getSavingsGoals() {
  const { rows } = await db.execute('SELECT id, name, target_amount, current_amount, deadline, created_at FROM savings_goals ORDER BY created_at DESC')
  return rows
}

export async function addSavingsGoal({ id, name, target_amount, deadline }) {
  await db.execute({
    sql: 'INSERT INTO savings_goals (id, name, target_amount, current_amount, deadline) VALUES (?, ?, ?, 0, ?)',
    args: [id, name, target_amount, deadline || null],
  })
}

export async function updateSavingsGoal(id, current_amount) {
  const { rowsAffected } = await db.execute({ sql: 'UPDATE savings_goals SET current_amount = ? WHERE id = ?', args: [current_amount, id] })
  if (rowsAffected === 0) throw new Error('Meta não encontrada.')
}

export async function deleteSavingsGoal(id) {
  await db.execute({ sql: 'DELETE FROM savings_goals WHERE id = ?', args: [id] })
}

// ── Settings ───────────────────────────────────────────────────────────────
export async function getSetting(key) {
  const { rows } = await db.execute({ sql: 'SELECT value FROM settings WHERE key = ?', args: [key] })
  return rows.length > 0 ? rows[0].value : null
}

export async function setSetting(key, value) {
  await db.execute({
    sql: 'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
    args: [key, value],
  })
}

// ── Backup ─────────────────────────────────────────────────────────────────
export async function getFullBackup() {
  const [batches, transactions, budgets, rules, recurring, goals, settings] = await Promise.all([
    db.execute('SELECT * FROM batches'),
    db.execute('SELECT * FROM transactions'),
    db.execute('SELECT * FROM budgets'),
    db.execute('SELECT * FROM category_rules'),
    db.execute('SELECT * FROM recurring_transactions').catch(() => ({ rows: [] })),
    db.execute('SELECT * FROM savings_goals').catch(() => ({ rows: [] })),
    db.execute('SELECT * FROM settings'),
  ])
  return {
    version: 1,
    exported_at: new Date().toISOString(),
    batches: batches.rows,
    transactions: transactions.rows,
    budgets: budgets.rows,
    category_rules: rules.rows,
    recurring_transactions: recurring.rows,
    savings_goals: goals.rows,
    settings: settings.rows,
  }
}

export async function restoreBackup(data) {
  if (data.version !== 1) throw new Error('Versão de backup não suportada.')
  // Limpa todas as tabelas
  await db.batch([
    'DELETE FROM transactions',
    'DELETE FROM batches',
    'DELETE FROM budgets',
    'DELETE FROM category_rules',
    'DELETE FROM recurring_transactions',
    'DELETE FROM savings_goals',
    'DELETE FROM settings',
  ])
  // Restaura dados
  const stmts = []
  for (const b of (data.batches || [])) {
    stmts.push({ sql: 'INSERT INTO batches (id, bank, original_filename, imported_at, count) VALUES (?, ?, ?, ?, ?)', args: [b.id, b.bank, b.original_filename, b.imported_at, b.count] })
  }
  for (const t of (data.transactions || [])) {
    stmts.push({ sql: 'INSERT INTO transactions (id, batch_id, description, amount, value_date, type, category, category_override, link_id, institution, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', args: [t.id, t.batch_id, t.description, t.amount, t.value_date, t.type, t.category, t.category_override, t.link_id, t.institution, t.created_at] })
  }
  for (const b of (data.budgets || [])) {
    stmts.push({ sql: 'INSERT INTO budgets (category_key, limit_amount) VALUES (?, ?)', args: [b.category_key, b.limit_amount] })
  }
  for (const r of (data.category_rules || [])) {
    stmts.push({ sql: 'INSERT INTO category_rules (description, category) VALUES (?, ?)', args: [r.description, r.category] })
  }
  for (const r of (data.recurring_transactions || [])) {
    stmts.push({ sql: 'INSERT INTO recurring_transactions (id, description, amount, type, category, day_of_month, active) VALUES (?, ?, ?, ?, ?, ?, ?)', args: [r.id, r.description, r.amount, r.type, r.category, r.day_of_month, r.active] })
  }
  for (const g of (data.savings_goals || [])) {
    stmts.push({ sql: 'INSERT INTO savings_goals (id, name, target_amount, current_amount, deadline, created_at) VALUES (?, ?, ?, ?, ?, ?)', args: [g.id, g.name, g.target_amount, g.current_amount, g.deadline, g.created_at] })
  }
  for (const s of (data.settings || [])) {
    stmts.push({ sql: 'INSERT INTO settings (key, value) VALUES (?, ?)', args: [s.key, s.value] })
  }
  if (stmts.length > 0) await db.batch(stmts)
  await loadLearnedRules()
}

// ── Exportação ──────────────────────────────────────────────────────────────
export async function getTransactionsForExport(dateFrom, dateTo) {
  let sql = `SELECT id, description, amount, value_date, type,
                    COALESCE(category_override, category) AS category, institution
             FROM transactions`
  const args = []
  if (dateFrom && dateTo) {
    sql += ' WHERE value_date BETWEEN ? AND ?'
    args.push(dateFrom, dateTo)
  }
  sql += ' ORDER BY value_date DESC'
  const { rows } = await db.execute({ sql, args })
  return rows
}
