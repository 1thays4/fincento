// src/storage.js — Persistência de transações importadas via JSON
import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync, existsSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'

const DATA_DIR = join(process.cwd(), 'data', 'imports')

export function initStorage() {
  mkdirSync(DATA_DIR, { recursive: true })
}

export function saveBatch(transactions, metadata = {}) {
  const batchId = randomUUID()
  const batch = {
    id: batchId,
    bank: metadata.bank || 'Importado',
    originalFilename: metadata.originalFilename || null,
    importedAt: new Date().toISOString(),
    count: transactions.length,
    transactions,
  }

  writeFileSync(join(DATA_DIR, `${batchId}.json`), JSON.stringify(batch, null, 2))
  return { id: batchId, count: transactions.length, bank: batch.bank, importedAt: batch.importedAt }
}

export function loadAllImported() {
  if (!existsSync(DATA_DIR)) return []

  const files = readdirSync(DATA_DIR).filter(f => f.endsWith('.json'))
  const all = []

  for (const file of files) {
    try {
      const batch = JSON.parse(readFileSync(join(DATA_DIR, file), 'utf-8'))
      if (Array.isArray(batch.transactions)) {
        all.push(...batch.transactions)
      }
    } catch { /* arquivo corrompido, ignora */ }
  }

  return all
}

export function listBatches() {
  if (!existsSync(DATA_DIR)) return []

  const files = readdirSync(DATA_DIR).filter(f => f.endsWith('.json'))
  return files.map(file => {
    try {
      const batch = JSON.parse(readFileSync(join(DATA_DIR, file), 'utf-8'))
      return { id: batch.id, bank: batch.bank, importedAt: batch.importedAt, count: batch.count }
    } catch {
      return null
    }
  }).filter(Boolean)
}

export function deleteBatch(batchId) {
  const filePath = join(DATA_DIR, `${batchId}.json`)
  if (!existsSync(filePath)) throw new Error('Batch não encontrado.')
  unlinkSync(filePath)
}
