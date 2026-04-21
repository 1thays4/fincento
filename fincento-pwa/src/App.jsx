// src/App.jsx — fin.centro PWA
import { useState, useEffect, useCallback } from 'react'
import {
  AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

// ─────────────────────────────────────────────────────────────────────────────
// 🔐 API CLIENT (com auth)
// ─────────────────────────────────────────────────────────────────────────────
let _authToken = localStorage.getItem('fc_token')
let _onAuthFail = () => {}

const api = {
  _headers(extra = {}) {
    const h = { ...extra }
    if (_authToken) h['Authorization'] = `Bearer ${_authToken}`
    return h
  },
  async get(path) {
    const res = await fetch(`${API_URL}${path}`, { headers: this._headers() })
    if (res.status === 401) { _onAuthFail(); throw new Error('Não autorizado') }
    const json = await res.json()
    if (!json.ok) throw new Error(json.error || `Erro ${res.status}`)
    return json.data
  },
  async post(path, body = {}) {
    const res = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: this._headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    })
    if (res.status === 401) { _onAuthFail(); throw new Error('Não autorizado') }
    const json = await res.json()
    if (!json.ok) throw new Error(json.error || `Erro ${res.status}`)
    return json.data
  },
  async upload(path, file, fields = {}) {
    const fd = new FormData()
    fd.append('file', file)
    Object.entries(fields).forEach(([k, v]) => fd.append(k, v))
    const res = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: this._headers(),
      body: fd,
    })
    if (res.status === 401) { _onAuthFail(); throw new Error('Não autorizado') }
    const json = await res.json()
    if (!json.ok) throw new Error(json.error || `Erro ${res.status}`)
    return json.data
  },
  async patch(path, body = {}) {
    const res = await fetch(`${API_URL}${path}`, {
      method: 'PATCH',
      headers: this._headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    })
    if (res.status === 401) { _onAuthFail(); throw new Error('Não autorizado') }
    const json = await res.json()
    if (!json.ok) throw new Error(json.error || `Erro ${res.status}`)
    return json.data
  },
  async put(path, body = {}) {
    const res = await fetch(`${API_URL}${path}`, {
      method: 'PUT',
      headers: this._headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    })
    if (res.status === 401) { _onAuthFail(); throw new Error('Não autorizado') }
    const json = await res.json()
    if (!json.ok) throw new Error(json.error || `Erro ${res.status}`)
    return json.data
  },
  async del(path) {
    const res = await fetch(`${API_URL}${path}`, {
      method: 'DELETE',
      headers: this._headers(),
    })
    if (res.status === 401) { _onAuthFail(); throw new Error('Não autorizado') }
    const json = await res.json()
    if (!json.ok) throw new Error(json.error || `Erro ${res.status}`)
    return json.data
  },
  async fetchBlob(path) {
    const res = await fetch(`${API_URL}${path}`, { headers: this._headers() })
    if (res.status === 401) { _onAuthFail(); throw new Error('Não autorizado') }
    return res.blob()
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// 🗂 CATEGORIAS
// ─────────────────────────────────────────────────────────────────────────────
const CATS = {
  'Food & Groceries': { key: 'alimentacao', label: 'Alimentacao',  icon: '🍽️', color: '#FF6B6B' },
  'Restaurants':      { key: 'restaurantes', label: 'Restaurantes', icon: '🍔', color: '#E85D75' },
  'Transport':        { key: 'transporte',  label: 'Transporte',   icon: '🚗', color: '#4ECDC4' },
  'Health':           { key: 'saude',       label: 'Saude',        icon: '❤️', color: '#45B7D1' },
  'Entertainment':    { key: 'lazer',       label: 'Lazer',        icon: '🎬', color: '#96CEB4' },
  'Education':        { key: 'educacao',    label: 'Educacao',     icon: '📚', color: '#FFEAA7' },
  'Housing':          { key: 'moradia',     label: 'Moradia',      icon: '🏠', color: '#DDA0DD' },
  'Subscriptions':    { key: 'assinaturas', label: 'Assinaturas',  icon: '📱', color: '#F0A500' },
  default:            { key: 'outros',      label: 'Outros',       icon: '📦', color: '#888' },
}
const cat = (c) => CATS[c] || CATS.default
const UNIQUE_CATS = Object.entries(CATS).filter(([k]) => k !== 'default')

// ─────────────────────────────────────────────────────────────────────────────
// 📦 MOCK DATA
// ─────────────────────────────────────────────────────────────────────────────
const MOCK_TXS = [
  { id:1,  desc:'Mercado Municipal',     amount:187.40, date:'2025-04-02', cat:cat('Food & Groceries'), bank:'Inter' },
  { id:2,  desc:'iFood',                amount:68.90,  date:'2025-04-03', cat:cat('Restaurants'),      bank:'Cartao' },
  { id:3,  desc:'Uber',                 amount:32.50,  date:'2025-04-04', cat:cat('Transport'),         bank:'Cartao' },
  { id:4,  desc:'Farmacia Nissei',      amount:145.00, date:'2025-04-05', cat:cat('Health'),            bank:'Itau' },
  { id:5,  desc:'Netflix',              amount:44.90,  date:'2025-04-06', cat:cat('Subscriptions'),     bank:'Cartao' },
  { id:6,  desc:'Spotify',              amount:21.90,  date:'2025-04-06', cat:cat('Subscriptions'),     bank:'Cartao' },
  { id:7,  desc:'Cinema',               amount:60.00,  date:'2025-04-08', cat:cat('Entertainment'),     bank:'Inter' },
  { id:8,  desc:'Condominio',           amount:820.00, date:'2025-04-10', cat:cat('Housing'),           bank:'Itau' },
  { id:9,  desc:'Supermercado Bistek',  amount:312.70, date:'2025-04-12', cat:cat('Food & Groceries'), bank:'Inter' },
  { id:10, desc:'Gasolina Shell',       amount:180.00, date:'2025-04-13', cat:cat('Transport'),         bank:'Itau' },
  { id:11, desc:'iFood',                amount:45.80,  date:'2025-04-15', cat:cat('Restaurants'),      bank:'Cartao' },
  { id:12, desc:'Farmacia Catarinense', amount:89.00,  date:'2025-04-16', cat:cat('Health'),            bank:'Cartao' },
  { id:13, desc:'Amazon',               amount:127.30, date:'2025-04-17', cat:cat('default'),           bank:'Cartao' },
  { id:14, desc:'Restaurante Bistro',   amount:95.00,  date:'2025-04-18', cat:cat('Restaurants'),      bank:'Cartao' },
  { id:15, desc:'Agua SAMAE',           amount:68.40,  date:'2025-04-19', cat:cat('Housing'),           bank:'Itau' },
  { id:16, desc:'Energia Celesc',       amount:213.60, date:'2025-04-20', cat:cat('Housing'),           bank:'Itau' },
  { id:17, desc:'Uber Eats',            amount:52.90,  date:'2025-04-21', cat:cat('Restaurants'),      bank:'Cartao' },
  { id:18, desc:'Academia',             amount:89.90,  date:'2025-04-22', cat:cat('Health'),            bank:'Inter' },
  { id:19, desc:'Disney+',              amount:27.90,  date:'2025-04-26', cat:cat('Subscriptions'),     bank:'Cartao' },
  { id:20, desc:'Gasolina Petrobras',   amount:200.00, date:'2025-04-27', cat:cat('Transport'),         bank:'Itau' },
]
const MOCK_INFLOWS = [
  { id:'in1', desc:'Salario',        amount:4500.00, date:'2025-04-05', cat:cat('default'), bank:'Itau' },
  { id:'in2', desc:'Freelance',      amount:1300.00, date:'2025-04-15', cat:cat('default'), bank:'Inter' },
]
const MOCK_LINKS = [
  { id:'m1', institution:{ name:'Inter' },  status:'valid' },
  { id:'m2', institution:{ name:'Itau' },   status:'valid' },
  { id:'m3', institution:{ name:'Cartao' }, status:'valid' },
]
const MOCK_FLOW = [
  { month:'Nov', gasto:3200 }, { month:'Dez', gasto:4800 },
  { month:'Jan', gasto:3600 }, { month:'Fev', gasto:3100 },
  { month:'Mar', gasto:3750 }, { month:'Abr', gasto:2833 },
]

// ─────────────────────────────────────────────────────────────────────────────
// 🔧 HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const fmt = (n) => (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const mapTx = (t) => ({
  id:     t.id,
  desc:   t.description,
  amount: Math.abs(t.amount),
  date:   t.value_date,
  cat:    cat(t.category),
  bank:   t._institution || t.account?.institution?.name || '—',
  type:   t.type,
})

const processTxs = (raw) => raw.filter(t => t.type === 'OUTFLOW').map(mapTx)
const processInflows = (raw) => raw.filter(t => t.type === 'INFLOW').map(mapTx)

const byCat = (txs) => {
  const m = {}
  txs.forEach(t => {
    if (!m[t.cat.key]) m[t.cat.key] = { ...t.cat, value: 0 }
    m[t.cat.key].value += t.amount
  })
  return Object.values(m).sort((a, b) => b.value - a.value)
}

// ─────────────────────────────────────────────────────────────────────────────
// 🏗 APP
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  // ── Auth ──
  const [authToken, setAuthToken]   = useState(() => localStorage.getItem('fc_token'))
  const [pinInput, setPinInput]     = useState('')
  const [authError, setAuthError]   = useState(null)
  const [authLoading, setAuthLoading] = useState(false)
  const [needsAuth, setNeedsAuth]   = useState(false)

  // ── Data ──
  const [tab, setTab]               = useState('home')
  const [txs, setTxs]               = useState([])
  const [inflows, setInflows]       = useState([])
  const [links, setLinks]           = useState([])
  const [flow, setFlow]             = useState([])
  const [loading, setLoading]       = useState(true)
  const [syncing, setSyncing]       = useState(false)
  const [lastSync, setLastSync]     = useState(null)
  const [isMock, setIsMock]         = useState(false)
  const [error, setError]           = useState(null)
  const [filterCat, setFilterCat]   = useState('all')
  const [uploading, setUploading]   = useState(false)
  const [uploadMsg, setUploadMsg]   = useState(null)
  const [uploadBank, setUploadBank] = useState('')
  const [batches, setBatches]       = useState([])

  // ── Mês selecionado ──
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date()
    return { year: d.getFullYear(), month: d.getMonth() }
  })

  // ── AI ──
  const [aiOpen, setAiOpen]         = useState(false)
  const [aiText, setAiText]         = useState('')
  const [aiLoading, setAiLoading]   = useState(false)

  // ── Busca ──
  const [searchTerm, setSearchTerm] = useState('')

  // ── Gastos/Receitas toggle ──
  const [txViewMode, setTxViewMode] = useState('gastos')

  // ── Editar categoria ──
  const [editingTx, setEditingTx]   = useState(null)

  // ── Transação manual ──
  const [showAddTx, setShowAddTx]   = useState(false)
  const [newTx, setNewTx]           = useState({ desc: '', amount: '', date: '', cat: '', type: 'OUTFLOW' })

  // ── Orçamento ──
  const [budgets, setBudgets]       = useState({})
  const [showBudgetEditor, setShowBudgetEditor] = useState(false)
  const [budgetInputs, setBudgetInputs] = useState({})

  // ── Auth fail handler ──
  _onAuthFail = () => {
    localStorage.removeItem('fc_token')
    setAuthToken(null)
    _authToken = null
  }

  // ── Date helpers ──
  const selDateFrom = `${selectedMonth.year}-${String(selectedMonth.month + 1).padStart(2, '0')}-01`
  const selDateTo = (() => {
    const d = new Date(selectedMonth.year, selectedMonth.month + 1, 0)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })()
  const selMonthLabel = new Date(selectedMonth.year, selectedMonth.month).toLocaleString('pt-BR', { month: 'long', year: 'numeric' })
  const isCurrentMonth = (() => {
    const now = new Date()
    return selectedMonth.year === now.getFullYear() && selectedMonth.month === now.getMonth()
  })()

  const prevMonth = () => setSelectedMonth(p => {
    const m = p.month - 1
    return m < 0 ? { year: p.year - 1, month: 11 } : { ...p, month: m }
  })
  const nextMonth = () => {
    if (isCurrentMonth) return
    setSelectedMonth(p => {
      const m = p.month + 1
      return m > 11 ? { year: p.year + 1, month: 0 } : { ...p, month: m }
    })
  }

  // ── Check if auth is needed ──
  useEffect(() => {
    fetch(`${API_URL}/health`).then(r => r.json()).then(data => {
      if (data.status === 'ok') {
        // Try an authenticated request to see if auth is required
        fetch(`${API_URL}/api/links`, {
          headers: authToken ? { 'Authorization': `Bearer ${authToken}` } : {},
        }).then(r => {
          if (r.status === 401) {
            setNeedsAuth(true)
            if (authToken) _onAuthFail() // token expired
          }
        }).catch(() => {})
      }
    }).catch(() => {})
  }, [])

  // ── Login ──
  const handleLogin = async () => {
    setAuthLoading(true)
    setAuthError(null)
    try {
      const res = await fetch(`${API_URL}/api/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pinInput }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error)
      localStorage.setItem('fc_token', json.data.token)
      _authToken = json.data.token
      setAuthToken(json.data.token)
      setNeedsAuth(false)
      setPinInput('')
    } catch (e) {
      setAuthError(e.message)
    }
    setAuthLoading(false)
  }

  const logout = () => {
    localStorage.removeItem('fc_token')
    _authToken = null
    setAuthToken(null)
    setNeedsAuth(true)
  }

  // ── Carrega dados via backend ───────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const health = await fetch(`${API_URL}/health`).catch(() => null)

      if (!health?.ok) {
        setIsMock(true)
        setTxs(MOCK_TXS)
        setInflows(MOCK_INFLOWS)
        setLinks(MOCK_LINKS)
        setFlow(MOCK_FLOW)
      } else {
        setIsMock(false)
        const [allLinks, rawTxs, flowData, budgetData] = await Promise.all([
          api.get('/api/links'),
          api.get(`/api/transactions?date_from=${selDateFrom}&date_to=${selDateTo}`),
          api.get('/api/stats/monthly-flow?months=6'),
          api.get('/api/budgets'),
        ])
        setLinks(allLinks)
        setTxs(processTxs(rawTxs))
        setInflows(processInflows(rawTxs))
        setFlow(flowData)
        const bMap = {}
        budgetData.forEach(b => { bMap[b.category_key] = b.limit_amount })
        setBudgets(bMap)
      }
      setLastSync(new Date())
    } catch (e) {
      if (e.message === 'Não autorizado') return
      setError(e.message)
      setIsMock(true)
      setTxs(MOCK_TXS)
      setInflows(MOCK_INFLOWS)
      setLinks(MOCK_LINKS)
      setFlow(MOCK_FLOW)
    }
    setLoading(false)
  }, [selDateFrom, selDateTo])

  const sync = async () => {
    setSyncing(true)
    if (!isMock) {
      try {
        await Promise.all(links.map(l => api.post(`/api/links/refresh/${l.id}`)))
        await new Promise(r => setTimeout(r, 2000))
      } catch { /* continua */ }
    } else {
      await new Promise(r => setTimeout(r, 1000))
    }
    await load()
    setSyncing(false)
  }

  useEffect(() => {
    if (needsAuth && !authToken) return
    load()
  }, [load, needsAuth, authToken])

  // ── Belvo Widget ──
  const openWidget = async (linkId = null) => {
    try {
      const { access } = await api.post('/api/widget-token', linkId ? { linkId } : {})
      if (typeof window.belvoSDK === 'undefined') {
        alert('Script do Belvo Widget não encontrado.')
        return
      }
      window.belvoSDK.createWidget(access, {
        country: 'BR',
        callback: async () => await load(),
        onExit: () => {},
      }).build()
    } catch (e) {
      setError('Erro ao abrir widget: ' + e.message)
    }
  }

  // ── Upload OFX/CSV ──
  const handleFileUpload = async (file) => {
    setUploading(true)
    setUploadMsg(null)
    try {
      const result = await api.upload('/api/import/upload', file, { bank: uploadBank || 'Importado' })
      setUploadMsg(`${result.count} transações importadas!`)
      setUploadBank('')
      await loadBatches()
      await load()
    } catch (e) {
      setUploadMsg('Erro: ' + e.message)
    }
    setUploading(false)
  }

  const loadBatches = async () => {
    try { setBatches(await api.get('/api/import/batches')) } catch { /* */ }
  }

  const deleteBatch = async (batchId) => {
    try {
      await api.del(`/api/import/batches/${batchId}`)
      await loadBatches()
      await load()
    } catch (e) { setError('Erro ao deletar: ' + e.message) }
  }

  useEffect(() => {
    if (needsAuth && !authToken) return
    loadBatches()
  }, [needsAuth, authToken])

  // ── Editar categoria ──
  const saveCategoryEdit = async (txId, newCat) => {
    try {
      await api.patch(`/api/transactions/${txId}/category`, { category: newCat })
      setTxs(prev => prev.map(t => t.id === txId ? { ...t, cat: cat(newCat) } : t))
      setInflows(prev => prev.map(t => t.id === txId ? { ...t, cat: cat(newCat) } : t))
      setEditingTx(null)
    } catch (e) { setError(e.message) }
  }

  // ── Transação manual ──
  const submitManualTx = async () => {
    try {
      await api.post('/api/transactions/manual', {
        description: newTx.desc,
        amount: parseFloat(newTx.amount),
        value_date: newTx.date,
        type: newTx.type,
        category: newTx.cat || null,
      })
      setShowAddTx(false)
      setNewTx({ desc: '', amount: '', date: '', cat: '', type: 'OUTFLOW' })
      await load()
    } catch (e) { setError('Erro: ' + e.message) }
  }

  // ── Orçamento ──
  const saveBudgets = async () => {
    try {
      for (const [key, val] of Object.entries(budgetInputs)) {
        const num = parseFloat(val)
        if (num > 0) {
          await api.put(`/api/budgets/${key}`, { limit: num })
        } else {
          await api.del(`/api/budgets/${key}`).catch(() => {})
        }
      }
      await load()
      setShowBudgetEditor(false)
    } catch (e) { setError(e.message) }
  }

  // ── Exportar CSV ──
  const exportCSV = async () => {
    try {
      const blob = await api.fetchBlob(`/api/export/csv?date_from=${selDateFrom}&date_to=${selDateTo}`)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `fincento-${selDateFrom}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) { setError('Erro ao exportar: ' + e.message) }
  }

  // ── IA ──
  const askAI = async () => {
    setAiLoading(true)
    setAiOpen(true)
    setAiText('')
    await new Promise(r => setTimeout(r, 1200))

    const catData = byCat(txs)
    const total = txs.reduce((s, t) => s + t.amount, 0)
    const pct = totalReceita > 0 ? ((total / totalReceita) * 100).toFixed(0) : 0
    const top = catData[0]
    const tips = []

    if (top) tips.push(`🔍 Sua maior categoria é ${top.icon} ${top.label} com ${fmt(top.value)} (${((top.value / total) * 100).toFixed(0)}% dos gastos). Revise se há itens que podem ser reduzidos.`)
    const subs = catData.find(c => c.key === 'assinaturas')
    if (subs) tips.push(`📱 Você tem gastos com assinaturas (${fmt(subs.value)}). Verifique se todas estão sendo usadas.`)
    if (catData.find(c => c.key === 'alimentacao')) tips.push(`🍽️ Alimentacao pesa no orçamento. Cozinhar mais em casa pode reduzir esse gasto em até 30%.`)

    // Check budgets
    for (const c of catData) {
      const limit = budgets[c.key]
      if (limit && c.value > limit) {
        tips.push(`⚠️ ${c.icon} ${c.label} estourou o orçamento: ${fmt(c.value)} de ${fmt(limit)} (${((c.value / limit) * 100).toFixed(0)}%).`)
      }
    }

    if (pct > 80) tips.push(`⚠️ Você está gastando ${pct}% da receita. O ideal é manter abaixo de 70%.`)
    else if (totalReceita > 0) tips.push(`✅ Você está usando ${pct}% da receita — bom controle!`)
    tips.push(`💡 Dica: defina um limite mensal por categoria e acompanhe aqui no fin.centro.`)

    setAiText(tips.join('\n\n'))
    setAiLoading(false)
  }

  // ── Derived ──
  const totalGasto   = txs.reduce((s, t) => s + t.amount, 0)
  const totalReceita = inflows.reduce((s, t) => s + t.amount, 0)
  const saldo        = totalReceita - totalGasto
  const catData      = byCat(txs)
  const filteredTxs  = txs
    .filter(t => filterCat === 'all' || t.cat.key === filterCat)
    .filter(t => !searchTerm || t.desc.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => new Date(b.date) - new Date(a.date))
  const filteredInflows = inflows
    .filter(t => !searchTerm || t.desc.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => new Date(b.date) - new Date(a.date))
  const pctReceita = totalReceita > 0 ? ((totalGasto / totalReceita) * 100).toFixed(0) : 0

  // ── STYLES ──
  const BG = '#0D0D1A', CARD = 'rgba(255,255,255,0.04)', BORDER = 'rgba(255,255,255,0.08)', ACCENT = '#FF6B00'

  const s = {
    root:       { minHeight:'100dvh', background:BG, color:'#E0E0FF', fontFamily:"'DM Sans','Segoe UI',sans-serif", display:'flex', flexDirection:'column', maxWidth:430, margin:'0 auto', position:'relative', overflowX:'hidden' },
    header:     { padding:'16px 20px 12px', paddingTop:'calc(env(safe-area-inset-top,0px) + 16px)', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:`1px solid ${BORDER}`, background:'rgba(13,13,26,0.95)', backdropFilter:'blur(20px)', position:'sticky', top:0, zIndex:50 },
    logo:       { fontSize:20, fontWeight:800, color:'#fff' },
    logoA:      { color:ACCENT },
    syncBtn:    { width:36, height:36, borderRadius:10, border:`1px solid rgba(255,107,0,0.3)`, background:'rgba(255,107,0,0.1)', color:ACCENT, fontSize:16, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' },
    scroll:     { flex:1, overflowY:'auto', padding:'0 0 90px' },
    bottomNav:  { position:'fixed', bottom:0, left:'50%', transform:'translateX(-50%)', width:'100%', maxWidth:430, background:'rgba(13,13,26,0.97)', backdropFilter:'blur(20px)', borderTop:`1px solid ${BORDER}`, display:'flex', paddingBottom:'env(safe-area-inset-bottom,0px)', zIndex:50 },
    navItem:    (a) => ({ flex:1, display:'flex', flexDirection:'column', alignItems:'center', padding:'10px 0 8px', color:a?ACCENT:'#555', border:'none', background:'transparent', cursor:'pointer', fontSize:9, fontWeight:700, letterSpacing:'0.5px', textTransform:'uppercase', gap:4 }),
    section:    { padding:'20px 16px 0' },
    card:       { background:CARD, border:`1px solid ${BORDER}`, borderRadius:16, padding:'16px 18px', marginBottom:12 },
    cardT:      { fontSize:11, color:'#555', textTransform:'uppercase', letterSpacing:'1px', marginBottom:10 },
    kpiGrid:    { display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:12 },
    kpiCard:    (c) => ({ background:CARD, border:`1px solid ${c}33`, borderRadius:14, padding:'14px 16px' }),
    kpiLbl:     { fontSize:10, color:'#555', textTransform:'uppercase', letterSpacing:'1px', marginBottom:6 },
    kpiVal:     (c) => ({ fontSize:22, fontWeight:800, color:c, fontVariantNumeric:'tabular-nums', lineHeight:1 }),
    kpiSub:     { fontSize:10, color:'#444', marginTop:4 },
    saldoCard:  { background:`linear-gradient(135deg,rgba(255,107,0,0.12),rgba(255,107,0,0.05))`, border:`1px solid rgba(255,107,0,0.2)`, borderRadius:16, padding:'18px 20px', marginBottom:12 },
    txRow:      { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 0', borderBottom:`1px solid ${BORDER}`, cursor:'pointer' },
    txIcon:     (c) => ({ width:38, height:38, borderRadius:11, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:17, background:c+'18', marginRight:12 }),
    badge:      (c) => ({ fontSize:9, padding:'2px 7px', borderRadius:20, fontWeight:700, background:c+'22', color:c, textTransform:'uppercase', letterSpacing:'0.5px' }),
    chip:       (a) => ({ padding:'7px 14px', borderRadius:20, fontSize:12, fontWeight:600, border:`1px solid ${a?ACCENT:BORDER}`, background:a?'rgba(255,107,0,0.12)':'transparent', color:a?ACCENT:'#666', cursor:'pointer', whiteSpace:'nowrap' }),
    aiBtn:      { width:'100%', padding:'16px', borderRadius:14, border:'none', background:`linear-gradient(135deg,${ACCENT},#FF8C42)`, color:'#fff', fontSize:15, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8, boxShadow:'0 4px 20px rgba(255,107,0,0.3)', marginBottom:16 },
    overlay:    { position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', zIndex:100, display:'flex', alignItems:'flex-end', backdropFilter:'blur(6px)' },
    sheet:      { background:'#13132A', borderRadius:'20px 20px 0 0', padding:'24px 20px', paddingBottom:'calc(env(safe-area-inset-bottom,0px) + 24px)', width:'100%', maxHeight:'80dvh', overflowY:'auto', border:`1px solid rgba(255,107,0,0.15)` },
    connectBtn: { width:'100%', padding:'13px', borderRadius:12, border:`1px solid rgba(78,205,196,0.3)`, background:'rgba(78,205,196,0.08)', color:'#4ECDC4', cursor:'pointer', fontSize:13, fontWeight:700, marginTop:8 },
    input:      { width:'100%', padding:'10px 12px', borderRadius:10, border:`1px solid ${BORDER}`, background:'rgba(255,255,255,0.04)', color:'#ccc', fontSize:13, outline:'none', boxSizing:'border-box' },
  }

  const monthNav = (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:16, marginBottom:14 }}>
      <button onClick={prevMonth} style={{ width:32, height:32, borderRadius:8, border:`1px solid ${BORDER}`, background:'transparent', color:'#888', fontSize:16, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>‹</button>
      <div style={{ fontSize:14, fontWeight:700, color:'#ccc', textTransform:'capitalize', minWidth:160, textAlign:'center' }}>{selMonthLabel}</div>
      <button onClick={nextMonth} disabled={isCurrentMonth} style={{ width:32, height:32, borderRadius:8, border:`1px solid ${BORDER}`, background:'transparent', color:isCurrentMonth?'#333':'#888', fontSize:16, cursor:isCurrentMonth?'default':'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>›</button>
    </div>
  )

  const CT = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    return (
      <div style={{ background:'#1A1A2E', border:'1px solid #2A2A4A', borderRadius:8, padding:'8px 12px', fontSize:12 }}>
        <div style={{ color:'#666', marginBottom:4 }}>{label}</div>
        {payload.map((p,i) => <div key={i} style={{ color:p.color }}>{fmt(p.value)}</div>)}
      </div>
    )
  }

  const TABS = [
    { id:'home',   icon:'🏠', label:'Inicio' },
    { id:'txs',    icon:'📋', label:'Gastos' },
    { id:'ia',     icon:'✦',  label:'IA' },
    { id:'contas', icon:'🏦', label:'Contas' },
  ]

  // ── PIN Screen ──
  if (needsAuth && !authToken) {
    return (
      <div style={{ ...s.root, alignItems:'center', justifyContent:'center', padding:20 }}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
          *{box-sizing:border-box;margin:0;padding:0} body{background:#0D0D1A}
        `}</style>
        <div style={{ textAlign:'center', width:'100%', maxWidth:280 }}>
          <div style={{ fontSize:28, fontWeight:800, color:'#fff', marginBottom:8 }}>fin<span style={{ color:ACCENT }}>.</span>centro</div>
          <div style={{ fontSize:13, color:'#555', marginBottom:32 }}>Digite seu PIN para acessar</div>
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={pinInput}
            onChange={e => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
            onKeyDown={e => e.key === 'Enter' && pinInput.length === 4 && handleLogin()}
            placeholder="••••"
            style={{ ...s.input, textAlign:'center', fontSize:32, letterSpacing:16, padding:'16px', marginBottom:16 }}
          />
          {authError && <div style={{ fontSize:12, color:'#FF6B6B', marginBottom:12 }}>{authError}</div>}
          <button
            onClick={handleLogin}
            disabled={pinInput.length !== 4 || authLoading}
            style={{ ...s.aiBtn, opacity: pinInput.length !== 4 ? 0.5 : 1 }}
          >
            {authLoading ? '...' : 'Entrar'}
          </button>
        </div>
      </div>
    )
  }

  // ── Loading ──
  if (loading) return (
    <div style={{ ...s.root, alignItems:'center', justifyContent:'center' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} .spin{animation:spin 1s linear infinite;display:inline-block}`}</style>
      <div style={{ textAlign:'center' }}>
        <div className="spin" style={{ fontSize:32, marginBottom:12 }}>⟳</div>
        <div style={{ color:'#444', fontSize:13 }}>Carregando{isMock ? ' (demo)' : ''}...</div>
      </div>
    </div>
  )

  return (
    <div style={s.root}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@500&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
        body{background:#0D0D1A;overscroll-behavior:none}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes slideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:.3}}
        .spin{animation:spin 1s linear infinite;display:inline-block}
        .slide{animation:slideUp .3s ease both}
        .blink{animation:blink 2s ease infinite}
        ::-webkit-scrollbar{display:none}
      `}</style>

      {isMock && (
        <div style={{ background:'rgba(255,107,0,0.1)', padding:'7px 16px', textAlign:'center', fontSize:11, color:ACCENT, borderBottom:`1px solid rgba(255,107,0,0.15)` }}>
          ⚠ Backend offline — modo demo
        </div>
      )}

      <header style={s.header}>
        <div>
          <div style={s.logo}>fin<span style={s.logoA}>.</span>centro</div>
          {lastSync && (
            <div style={{ fontSize:10, color:'#444', marginTop:2 }}>
              sync {lastSync.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' })}
              {!isMock && <span className="blink" style={{ marginLeft:6, color:'#4ECDC4' }}>●</span>}
            </div>
          )}
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          {authToken && needsAuth !== false && (
            <button onClick={logout} style={{ ...s.syncBtn, fontSize:12, border:`1px solid rgba(255,107,107,0.3)`, background:'rgba(255,107,107,0.08)', color:'#FF6B6B' }} title="Sair">⏻</button>
          )}
          <button style={s.syncBtn} onClick={sync} disabled={syncing} aria-label="Sincronizar">
            <span className={syncing ? 'spin' : ''}>⟳</span>
          </button>
        </div>
      </header>

      {error && (
        <div style={{ margin:'10px 16px 0', background:'rgba(255,107,107,0.1)', border:'1px solid rgba(255,107,107,0.2)', borderRadius:10, padding:'10px 14px', fontSize:12, color:'#FF6B6B' }}>
          ⚠ {error}
        </div>
      )}

      <div style={s.scroll}>

        {/* ── HOME ── */}
        {tab === 'home' && (
          <div className="slide">
            <div style={s.section}>
              {monthNav}
              <div style={s.saldoCard}>
                <div style={{ fontSize:11, color:'rgba(255,107,0,0.7)', textTransform:'uppercase', letterSpacing:'1px', marginBottom:6 }}>Saldo do mes</div>
                <div style={{ fontSize:34, fontWeight:800, color:saldo>=0?'#fff':'#FF6B6B', fontVariantNumeric:'tabular-nums' }}>{fmt(saldo)}</div>
                <div style={{ fontSize:12, color:'rgba(255,255,255,0.3)', marginTop:4, textTransform:'capitalize' }}>{selMonthLabel}</div>
              </div>
              <div style={s.kpiGrid}>
                <div style={s.kpiCard('#4ECDC4')}>
                  <div style={s.kpiLbl}>Receita</div>
                  <div style={s.kpiVal('#4ECDC4')}>{fmt(totalReceita)}</div>
                  <div style={s.kpiSub}>{inflows.length} entrada{inflows.length !== 1 ? 's' : ''}</div>
                </div>
                <div style={s.kpiCard('#FF6B6B')}>
                  <div style={s.kpiLbl}>Gastos</div>
                  <div style={s.kpiVal('#FF6B6B')}>{fmt(totalGasto)}</div>
                  <div style={s.kpiSub}>{totalReceita > 0 ? `${pctReceita}% da receita` : `${txs.length} transações`}</div>
                </div>
              </div>

              {/* Histórico de gastos */}
              <div style={s.card}>
                <div style={s.cardT}>Historico de gastos</div>
                <ResponsiveContainer width="100%" height={140}>
                  <AreaChart data={flow}>
                    <defs>
                      <linearGradient id="ag" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#FF6B6B" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#FF6B6B" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false}/>
                    <XAxis dataKey="month" tick={{fill:'#555',fontSize:10}} axisLine={false} tickLine={false}/>
                    <YAxis hide/>
                    <Tooltip content={<CT/>}/>
                    <Area type="monotone" dataKey="gasto" name="Gasto" stroke="#FF6B6B" fill="url(#ag)" strokeWidth={2} dot={false}/>
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Por categoria com orçamento */}
              <div style={s.card}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                  <div style={s.cardT}>Por categoria</div>
                  {!isMock && <button onClick={() => { setBudgetInputs({...budgets}); setShowBudgetEditor(true) }} style={{ fontSize:10, color:ACCENT, background:'none', border:'none', cursor:'pointer', fontWeight:600 }}>Limites</button>}
                </div>
                <div style={{ display:'flex', gap:16, alignItems:'center' }}>
                  <ResponsiveContainer width={120} height={120}>
                    <PieChart>
                      <Pie data={catData} dataKey="value" cx="50%" cy="50%" innerRadius={32} outerRadius={55} paddingAngle={3} startAngle={90} endAngle={-270}>
                        {catData.map((e,i) => <Cell key={i} fill={e.color} stroke="none"/>)}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ flex:1 }}>
                    {catData.slice(0,5).map(c => {
                      const limit = budgets[c.key]
                      const pct = limit ? Math.min((c.value / limit) * 100, 100) : null
                      const over = limit && c.value > limit
                      return (
                        <div key={c.key} style={{ marginBottom:8 }}>
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                            <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:12 }}>
                              <span style={{ width:8, height:8, borderRadius:'50%', background:c.color, display:'inline-block', flexShrink:0 }}/>
                              {c.icon} {c.label}
                            </div>
                            <span style={{ fontSize:11, color:'#888', fontFamily:'DM Mono,monospace' }}>{fmt(c.value)}</span>
                          </div>
                          {limit != null && (
                            <>
                              <div style={{ marginTop:3, height:3, borderRadius:2, background:'rgba(255,255,255,0.06)' }}>
                                <div style={{ height:'100%', borderRadius:2, width:`${pct}%`, background:over?'#FF6B6B':'#4ECDC4', transition:'width 0.3s' }} />
                              </div>
                              <div style={{ fontSize:9, color:over?'#FF6B6B':'#555', marginTop:1 }}>
                                {fmt(c.value)} / {fmt(limit)} {over ? '(estourou!)' : ''}
                              </div>
                            </>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* Recentes */}
              <div style={s.card}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                  <div style={s.cardT}>Recentes</div>
                  <button onClick={()=>setTab('txs')} style={{ fontSize:12, color:ACCENT, background:'none', border:'none', cursor:'pointer', fontWeight:600 }}>ver todos →</button>
                </div>
                {[...txs].sort((a,b) => new Date(b.date)-new Date(a.date)).slice(0,5).map(t => (
                  <div key={t.id} style={s.txRow} onClick={() => setEditingTx(t)}>
                    <div style={{ display:'flex', alignItems:'center' }}>
                      <div style={s.txIcon(t.cat.color)}>{t.cat.icon}</div>
                      <div>
                        <div style={{ fontSize:13, fontWeight:600, marginBottom:2 }}>{t.desc}</div>
                        <div style={{ display:'flex', gap:5, alignItems:'center' }}>
                          <span style={s.badge(t.cat.color)}>{t.cat.label}</span>
                          <span style={{ fontSize:10, color:'#444' }}>{t.date?.slice(8)}/{t.date?.slice(5,7)}</span>
                        </div>
                      </div>
                    </div>
                    <div style={{ fontSize:14, fontWeight:700, color:'#FF6B6B', fontFamily:'DM Mono,monospace', flexShrink:0 }}>-{fmt(t.amount)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── TRANSACOES ── */}
        {tab === 'txs' && (
          <div className="slide">
            <div style={s.section}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
                <div style={{ fontSize:18, fontWeight:800, color:'#fff' }}>Transações</div>
                <div style={{ display:'flex', gap:8 }}>
                  {!isMock && <button onClick={exportCSV} style={{ padding:'6px 12px', borderRadius:8, border:`1px solid ${BORDER}`, background:'transparent', color:'#666', fontSize:11, fontWeight:600, cursor:'pointer' }}>CSV ↓</button>}
                  {!isMock && <button onClick={() => { setNewTx({ desc:'', amount:'', date:selDateFrom.slice(0,8) + String(new Date().getDate()).padStart(2,'0'), cat:'', type:'OUTFLOW' }); setShowAddTx(true) }} style={{ ...s.syncBtn, width:32, height:32, fontSize:18 }}>+</button>}
                </div>
              </div>

              {monthNav}

              {/* Toggle Gastos / Receitas */}
              <div style={{ display:'flex', gap:8, marginBottom:12 }}>
                <button style={s.chip(txViewMode==='gastos')} onClick={()=>setTxViewMode('gastos')}>Gastos</button>
                <button style={s.chip(txViewMode==='receitas')} onClick={()=>setTxViewMode('receitas')}>Receitas</button>
              </div>

              {/* Busca */}
              <input
                type="text"
                placeholder="Buscar transação..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{ ...s.input, marginBottom:10 }}
              />

              {txViewMode === 'gastos' && (
                <>
                  <div style={{ display:'flex', gap:8, overflowX:'auto', marginBottom:14, paddingBottom:4 }}>
                    <button style={s.chip(filterCat==='all')} onClick={()=>setFilterCat('all')}>Todas</button>
                    {catData.map(c => (
                      <button key={c.key} style={s.chip(filterCat===c.key)} onClick={()=>setFilterCat(c.key)}>
                        {c.icon} {c.label}
                      </button>
                    ))}
                  </div>
                  <div style={{ fontSize:11, color:'#444', marginBottom:10 }}>
                    {filteredTxs.length} transações · {fmt(filteredTxs.reduce((s,t)=>s+t.amount,0))}
                  </div>
                  <div style={s.card}>
                    {filteredTxs.length === 0 && <div style={{ color:'#444', fontSize:13, textAlign:'center', padding:'20px 0' }}>Nenhuma transação</div>}
                    {filteredTxs.map(t => (
                      <div key={t.id} style={s.txRow} onClick={() => setEditingTx(t)}>
                        <div style={{ display:'flex', alignItems:'center', minWidth:0 }}>
                          <div style={s.txIcon(t.cat.color)}>{t.cat.icon}</div>
                          <div style={{ minWidth:0 }}>
                            <div style={{ fontSize:13, fontWeight:600, marginBottom:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:160 }}>{t.desc}</div>
                            <div style={{ display:'flex', gap:5 }}>
                              <span style={s.badge(t.cat.color)}>{t.cat.label}</span>
                              <span style={{ fontSize:10, color:'#444' }}>{t.bank}</span>
                            </div>
                          </div>
                        </div>
                        <div style={{ fontSize:14, fontWeight:700, color:'#FF6B6B', fontFamily:'DM Mono,monospace', flexShrink:0, marginLeft:8 }}>-{fmt(t.amount)}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {txViewMode === 'receitas' && (
                <>
                  <div style={{ fontSize:11, color:'#444', marginBottom:10 }}>
                    {filteredInflows.length} entrada{filteredInflows.length !== 1 ? 's' : ''} · {fmt(filteredInflows.reduce((s,t)=>s+t.amount,0))}
                  </div>
                  <div style={s.card}>
                    {filteredInflows.length === 0 && <div style={{ color:'#444', fontSize:13, textAlign:'center', padding:'20px 0' }}>Nenhuma receita</div>}
                    {filteredInflows.map(t => (
                      <div key={t.id} style={s.txRow} onClick={() => setEditingTx(t)}>
                        <div style={{ display:'flex', alignItems:'center', minWidth:0 }}>
                          <div style={s.txIcon('#4ECDC4')}>💰</div>
                          <div style={{ minWidth:0 }}>
                            <div style={{ fontSize:13, fontWeight:600, marginBottom:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:160 }}>{t.desc}</div>
                            <div style={{ display:'flex', gap:5 }}>
                              <span style={s.badge('#4ECDC4')}>receita</span>
                              <span style={{ fontSize:10, color:'#444' }}>{t.bank}</span>
                            </div>
                          </div>
                        </div>
                        <div style={{ fontSize:14, fontWeight:700, color:'#4ECDC4', fontFamily:'DM Mono,monospace', flexShrink:0, marginLeft:8 }}>+{fmt(t.amount)}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── IA ── */}
        {tab === 'ia' && (
          <div className="slide">
            <div style={s.section}>
              <div style={{ fontSize:18, fontWeight:800, color:'#fff', marginBottom:4 }}>IA Financeira</div>
              <div style={{ fontSize:12, color:'#555', marginBottom:20 }}>Analise dos seus {txs.length} gastos deste mês</div>
              <button style={s.aiBtn} onClick={askAI}>✦ Analisar com IA</button>
              <div style={s.card}>
                <div style={s.cardT}>Resumo</div>
                {[
                  { label:'Maior categoria',    value: catData[0] ? `${catData[0].icon} ${catData[0].label} (${fmt(catData[0].value)})` : '—' },
                  { label:'No de transações',   value: txs.length },
                  { label:'Ticket medio',        value: txs.length ? fmt(totalGasto/txs.length) : '—' },
                  { label:'% da receita gasta', value: totalReceita > 0 ? `${pctReceita}%` : '—' },
                ].map(r => (
                  <div key={r.label} style={{ display:'flex', justifyContent:'space-between', padding:'10px 0', borderBottom:`1px solid ${BORDER}` }}>
                    <span style={{ fontSize:13, color:'#666' }}>{r.label}</span>
                    <span style={{ fontSize:13, fontWeight:700, color:'#ccc' }}>{r.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── CONTAS ── */}
        {tab === 'contas' && (
          <div className="slide">
            <div style={s.section}>
              <div style={{ fontSize:18, fontWeight:800, color:'#fff', marginBottom:4 }}>Contas</div>
              <div style={{ fontSize:12, color:'#555', marginBottom:16 }}>
                {isMock ? 'Modo demo — backend offline' : `${links.length} links via Belvo`}
              </div>
              {links.map((l, i) => (
                <div key={l.id||i} style={{ ...s.card, display:'flex', alignItems:'center', gap:14 }}>
                  <div style={{ fontSize:26 }}>🏦</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:14, fontWeight:700 }}>{l.institution?.name || l.id}</div>
                    <div style={{ fontSize:11, color:'#555', marginTop:2 }}>{l.status==='valid'?'Conectado':'Inativo'}</div>
                  </div>
                  <span style={s.badge(l.status==='valid'?'#4ECDC4':'#888')}>{l.status==='valid'?'● ativo':'○ off'}</span>
                </div>
              ))}
              {!isMock && (
                <button style={s.connectBtn} onClick={() => openWidget()}>
                  + Conectar novo banco
                </button>
              )}

              {/* Importar extrato */}
              <div style={{ ...s.card, marginTop:12 }}>
                <div style={s.cardT}>Importar extrato</div>
                <div style={{ fontSize:12, color:'#555', marginBottom:12 }}>
                  Envie um arquivo .ofx, .qfx ou .csv do seu banco
                </div>
                <input
                  type="text"
                  placeholder="Nome do banco (ex: Inter)"
                  value={uploadBank}
                  onChange={e => setUploadBank(e.target.value)}
                  style={{ ...s.input, marginBottom:8 }}
                />
                <label style={{ ...s.connectBtn, display:'flex', alignItems:'center', justifyContent:'center', gap:8, cursor: uploading ? 'wait' : 'pointer', opacity: uploading ? 0.6 : 1, marginTop:0 }}>
                  {uploading ? <span className="spin">⟳</span> : '📄'}
                  {uploading ? 'Importando...' : 'Selecionar arquivo'}
                  <input
                    type="file"
                    accept=".ofx,.qfx,.csv"
                    style={{ display:'none' }}
                    disabled={uploading}
                    onChange={e => { if (e.target.files[0]) handleFileUpload(e.target.files[0]); e.target.value = '' }}
                  />
                </label>
                {uploadMsg && (
                  <div style={{ fontSize:12, marginTop:8, padding:'8px 12px', borderRadius:8, background: uploadMsg.startsWith('Erro') ? 'rgba(255,107,107,0.1)' : 'rgba(78,205,196,0.1)', color: uploadMsg.startsWith('Erro') ? '#FF6B6B' : '#4ECDC4' }}>
                    {uploadMsg}
                  </div>
                )}
              </div>

              {/* Batches importados */}
              {batches.length > 0 && (
                <div style={{ ...s.card, marginTop:8 }}>
                  <div style={s.cardT}>Importações</div>
                  {batches.map(b => (
                    <div key={b.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 0', borderBottom:`1px solid ${BORDER}` }}>
                      <div>
                        <div style={{ fontSize:13, fontWeight:600 }}>{b.bank}</div>
                        <div style={{ fontSize:10, color:'#555' }}>{b.count} transações · {new Date(b.importedAt).toLocaleDateString('pt-BR')}</div>
                      </div>
                      <button
                        onClick={() => deleteBatch(b.id)}
                        style={{ padding:'6px 10px', borderRadius:8, border:`1px solid rgba(255,107,107,0.3)`, background:'rgba(255,107,107,0.08)', color:'#FF6B6B', fontSize:11, fontWeight:600, cursor:'pointer' }}
                      >
                        Remover
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ ...s.card, borderColor:'rgba(255,107,0,0.12)', marginTop:8 }}>
                <div style={{ fontSize:12, fontWeight:700, color:ACCENT, marginBottom:8 }}>🔒 Segurança ativa</div>
                <div style={{ fontSize:12, color:'#555', lineHeight:1.7 }}>
                  Credenciais ficam no servidor Node.js — nunca chegam ao browser.
                  Dados persistidos no Turso (SQLite na nuvem).
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Nav */}
      <nav style={s.bottomNav}>
        {TABS.map(t => (
          <button key={t.id} style={s.navItem(tab===t.id)} onClick={()=>{ setTab(t.id); setSearchTerm('') }}>
            <span style={{ fontSize:20 }}>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>

      {/* AI Bottom Sheet */}
      {aiOpen && (
        <div style={s.overlay} onClick={()=>!aiLoading&&setAiOpen(false)}>
          <div style={s.sheet} onClick={e=>e.stopPropagation()}>
            <div style={{ width:36, height:4, borderRadius:2, background:'rgba(255,255,255,0.1)', margin:'0 auto 20px' }}/>
            <div style={{ fontSize:15, fontWeight:800, color:ACCENT, marginBottom:14 }}>✦ Analise da IA</div>
            {aiLoading ? (
              <div style={{ textAlign:'center', padding:'30px 0' }}>
                <div className="spin" style={{ fontSize:28, marginBottom:12 }}>⟳</div>
                <div style={{ color:'#444', fontSize:13 }}>Analisando {txs.length} transações...</div>
              </div>
            ) : (
              <>
                <div style={{ fontSize:14, color:'#bbb', lineHeight:1.8, whiteSpace:'pre-wrap', background:'rgba(255,255,255,0.03)', borderRadius:12, padding:14, border:`1px solid ${BORDER}`, marginBottom:14, maxHeight:300, overflowY:'auto' }}>
                  {aiText}
                </div>
                <button onClick={()=>setAiOpen(false)} style={{ width:'100%', padding:'13px', borderRadius:12, border:`1px solid ${BORDER}`, background:'transparent', color:'#666', cursor:'pointer', fontSize:13, fontWeight:600 }}>
                  Fechar
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Edit Category Bottom Sheet */}
      {editingTx && (
        <div style={s.overlay} onClick={() => setEditingTx(null)}>
          <div style={s.sheet} onClick={e => e.stopPropagation()}>
            <div style={{ width:36, height:4, borderRadius:2, background:'rgba(255,255,255,0.1)', margin:'0 auto 20px' }}/>
            <div style={{ fontSize:15, fontWeight:800, color:'#fff', marginBottom:4 }}>{editingTx.desc}</div>
            <div style={{ fontSize:13, color:'#666', marginBottom:16 }}>{fmt(editingTx.amount)} · {editingTx.date}</div>
            <div style={{ fontSize:12, color:'#555', marginBottom:12, textTransform:'uppercase', letterSpacing:'1px' }}>Alterar categoria</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              {UNIQUE_CATS.map(([belvoKey, info]) => (
                <button
                  key={belvoKey}
                  onClick={() => saveCategoryEdit(editingTx.id, belvoKey)}
                  style={{
                    padding:'12px 10px', borderRadius:12,
                    border: `1px solid ${editingTx.cat.key === info.key ? info.color : BORDER}`,
                    background: editingTx.cat.key === info.key ? info.color + '22' : 'transparent',
                    color: editingTx.cat.key === info.key ? info.color : '#888',
                    cursor:'pointer', fontSize:13, fontWeight:600, display:'flex', alignItems:'center', gap:6,
                  }}
                >
                  {info.icon} {info.label}
                </button>
              ))}
            </div>
            <button onClick={() => setEditingTx(null)} style={{ width:'100%', padding:'13px', borderRadius:12, border:`1px solid ${BORDER}`, background:'transparent', color:'#666', cursor:'pointer', fontSize:13, fontWeight:600, marginTop:12 }}>
              Fechar
            </button>
          </div>
        </div>
      )}

      {/* Add Transaction Bottom Sheet */}
      {showAddTx && (
        <div style={s.overlay} onClick={() => setShowAddTx(false)}>
          <div style={s.sheet} onClick={e => e.stopPropagation()}>
            <div style={{ width:36, height:4, borderRadius:2, background:'rgba(255,255,255,0.1)', margin:'0 auto 20px' }}/>
            <div style={{ fontSize:15, fontWeight:800, color:'#fff', marginBottom:16 }}>Nova transação</div>

            <div style={{ display:'flex', gap:8, marginBottom:12 }}>
              <button style={s.chip(newTx.type==='OUTFLOW')} onClick={() => setNewTx(p => ({...p, type:'OUTFLOW'}))}>Gasto</button>
              <button style={s.chip(newTx.type==='INFLOW')} onClick={() => setNewTx(p => ({...p, type:'INFLOW'}))}>Receita</button>
            </div>

            <input placeholder="Descrição" value={newTx.desc} onChange={e => setNewTx(p => ({...p, desc:e.target.value}))} style={{ ...s.input, marginBottom:8 }} />
            <input placeholder="Valor" inputMode="decimal" value={newTx.amount} onChange={e => setNewTx(p => ({...p, amount:e.target.value}))} style={{ ...s.input, marginBottom:8 }} />
            <input type="date" value={newTx.date} onChange={e => setNewTx(p => ({...p, date:e.target.value}))} style={{ ...s.input, marginBottom:12, colorScheme:'dark' }} />

            <div style={{ fontSize:11, color:'#555', marginBottom:8, textTransform:'uppercase', letterSpacing:'1px' }}>Categoria</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginBottom:16 }}>
              {UNIQUE_CATS.map(([belvoKey, info]) => (
                <button key={belvoKey} onClick={() => setNewTx(p => ({...p, cat:belvoKey}))} style={{ padding:'10px 8px', borderRadius:10, border:`1px solid ${newTx.cat===belvoKey?info.color:BORDER}`, background:newTx.cat===belvoKey?info.color+'22':'transparent', color:newTx.cat===belvoKey?info.color:'#888', cursor:'pointer', fontSize:12, fontWeight:600, display:'flex', alignItems:'center', gap:4 }}>
                  {info.icon} {info.label}
                </button>
              ))}
            </div>

            <button
              onClick={submitManualTx}
              disabled={!newTx.desc || !newTx.amount || !newTx.date}
              style={{ ...s.aiBtn, opacity: (!newTx.desc || !newTx.amount || !newTx.date) ? 0.5 : 1 }}
            >
              Salvar
            </button>
          </div>
        </div>
      )}

      {/* Budget Editor Bottom Sheet */}
      {showBudgetEditor && (
        <div style={s.overlay} onClick={() => setShowBudgetEditor(false)}>
          <div style={s.sheet} onClick={e => e.stopPropagation()}>
            <div style={{ width:36, height:4, borderRadius:2, background:'rgba(255,255,255,0.1)', margin:'0 auto 20px' }}/>
            <div style={{ fontSize:15, fontWeight:800, color:'#fff', marginBottom:4 }}>Limites por categoria</div>
            <div style={{ fontSize:12, color:'#555', marginBottom:16 }}>Defina o limite mensal para cada categoria. Deixe vazio para remover.</div>

            {UNIQUE_CATS.map(([, info]) => (
              <div key={info.key} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
                <div style={{ fontSize:14, width:30, textAlign:'center' }}>{info.icon}</div>
                <div style={{ flex:1, fontSize:13, color:'#ccc' }}>{info.label}</div>
                <input
                  type="number"
                  inputMode="decimal"
                  placeholder="0"
                  value={budgetInputs[info.key] || ''}
                  onChange={e => setBudgetInputs(p => ({...p, [info.key]: e.target.value}))}
                  style={{ ...s.input, width:110, textAlign:'right' }}
                />
              </div>
            ))}

            <button onClick={saveBudgets} style={{ ...s.aiBtn, marginTop:16 }}>Salvar limites</button>
          </div>
        </div>
      )}
    </div>
  )
}
