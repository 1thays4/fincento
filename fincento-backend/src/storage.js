// src/storage.js — Persistência via Turso (SQLite na nuvem)
import { createClient } from '@libsql/client'
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'

let db

// ── Inicialização ────────────────────────────────────────────────────────────
export async function initStorage() {
  db = createClient({
    url:       process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  })

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
  ])

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
  const batchId = randomUUID()
  const bank = metadata.bank || 'Importado'
  const importedAt = new Date().toISOString()

  const stmts = [
    {
      sql: 'INSERT INTO batches (id, bank, original_filename, imported_at, count) VALUES (?, ?, ?, ?, ?)',
      args: [batchId, bank, metadata.originalFilename || null, importedAt, transactions.length],
    },
    ...transactions.map(t => ({
      sql: 'INSERT INTO transactions (id, batch_id, description, amount, value_date, type, category, link_id, institution) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      args: [t.id, batchId, t.description, t.amount, t.value_date, t.type, t.category || null, t._linkId || 'import', t._institution || null],
    })),
  ]

  await db.batch(stmts)
  return { id: batchId, count: transactions.length, bank, importedAt }
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

// ── Editar categoria ────────────────────────────────────────────────────────
export async function updateTransactionCategory(txId, category) {
  const { rowsAffected } = await db.execute({
    sql: 'UPDATE transactions SET category_override = ? WHERE id = ?',
    args: [category, txId],
  })
  if (rowsAffected === 0) throw new Error('Transação não encontrada.')
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
