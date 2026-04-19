// src/belvo.js
// Toda comunicação com a API Belvo fica aqui.
// As credenciais nunca saem do servidor.

import fetch from 'node-fetch'

const BASE_URL = `https://${process.env.BELVO_ENV || 'sandbox'}.belvo.com`

const authHeader = () =>
  'Basic ' + Buffer.from(
    `${process.env.BELVO_SECRET_ID}:${process.env.BELVO_SECRET_PASSWORD}`
  ).toString('base64')

const headers = () => ({
  Authorization: authHeader(),
  'Content-Type': 'application/json',
})

// Faz a requisição e lança erro com mensagem útil se falhar
async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`
  const res = await fetch(url, { ...options, headers: headers() })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Belvo ${res.status} em ${path}: ${body}`)
  }

  return res.json()
}

// ── Exports ───────────────────────────────────────────────────────────────────

// Lista todos os links registrados na conta Belvo
export async function getLinks() {
  const data = await request('/api/links/?page_size=100')
  return data.results || []
}

// Busca detalhes de um link específico
export async function getLinkById(linkId) {
  return request(`/api/links/${linkId}/`)
}

// Lista contas de um link
export async function getAccounts(linkId) {
  const data = await request(`/api/accounts/?link=${linkId}`)
  return data.results || []
}

// Lista transações de um link dentro de um período
export async function getTransactions(linkId, dateFrom, dateTo) {
  const data = await request(
    `/api/transactions/?link=${linkId}&date_from=${dateFrom}&date_to=${dateTo}&page_size=200`
  )
  return data.results || []
}

// Força re-sincronização de um link com a instituição
export async function refreshLink(linkId) {
  await fetch(`${BASE_URL}/api/links/${linkId}/`, {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify({ fetch_resources: ['ACCOUNTS', 'TRANSACTIONS'] }),
  })
}

// Gera um access_token de curta duração para o Connect Widget do Belvo
// (o widget precisa desse token, mas ele expira em minutos — seguro para o frontend)
export async function createWidgetToken(linkId = null) {
  const body = {
    id: process.env.BELVO_SECRET_ID,
    password: process.env.BELVO_SECRET_PASSWORD,
    scopes: 'read_institutions,write_links,read_links',
  }
  if (linkId) body.link_id = linkId

  const res = await fetch(`${BASE_URL}/api/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Erro ao criar widget token: ${text}`)
  }

  return res.json()
}
