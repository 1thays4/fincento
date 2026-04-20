// src/App.jsx — versão com backend
// Todas as chamadas Belvo passam pelo backend agora.
// Credenciais nunca chegam ao browser.

import { useState, useEffect, useCallback } from 'react'
import {
  AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'

// ─────────────────────────────────────────────────────────────────────────────
// ⚙️ CONFIG — apenas a URL do SEU backend (sem credenciais aqui!)
// Em desenvolvimento: http://localhost:3001
// Em produção: https://seu-backend.railway.app (ou Render, Fly.io, etc.)
// ─────────────────────────────────────────────────────────────────────────────
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

// ─────────────────────────────────────────────────────────────────────────────
// 🌐 API CLIENT — fala com o backend Node.js, não com a Belvo diretamente
// ─────────────────────────────────────────────────────────────────────────────
const api = {
  async get(path) {
    const res = await fetch(`${API_URL}${path}`)
    const json = await res.json()
    if (!json.ok) throw new Error(json.error || `Erro ${res.status}`)
    return json.data
  },
  async post(path, body = {}) {
    const res = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json()
    if (!json.ok) throw new Error(json.error || `Erro ${res.status}`)
    return json.data
  },
  async upload(path, file, fields = {}) {
    const fd = new FormData()
    fd.append('file', file)
    Object.entries(fields).forEach(([k, v]) => fd.append(k, v))
    const res = await fetch(`${API_URL}${path}`, { method: 'POST', body: fd })
    const json = await res.json()
    if (!json.ok) throw new Error(json.error || `Erro ${res.status}`)
    return json.data
  },
  async del(path) {
    const res = await fetch(`${API_URL}${path}`, { method: 'DELETE' })
    const json = await res.json()
    if (!json.ok) throw new Error(json.error || `Erro ${res.status}`)
    return json.data
  },
}

const monthStart = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}
const today = () => new Date().toISOString().slice(0, 10)

// ─────────────────────────────────────────────────────────────────────────────
// 🗂 CATEGORIAS
// ─────────────────────────────────────────────────────────────────────────────
const CATS = {
  'Food & Groceries': { key: 'alimentacao', label: 'Alimentação',  icon: '🍽️', color: '#FF6B6B' },
  'Restaurants':      { key: 'alimentacao', label: 'Alimentação',  icon: '🍽️', color: '#FF6B6B' },
  'Transport':        { key: 'transporte',  label: 'Transporte',   icon: '🚗', color: '#4ECDC4' },
  'Health':           { key: 'saude',       label: 'Saúde',        icon: '❤️', color: '#45B7D1' },
  'Entertainment':    { key: 'lazer',       label: 'Lazer',        icon: '🎬', color: '#96CEB4' },
  'Education':        { key: 'educacao',    label: 'Educação',     icon: '📚', color: '#FFEAA7' },
  'Housing':          { key: 'moradia',     label: 'Moradia',      icon: '🏠', color: '#DDA0DD' },
  'Subscriptions':    { key: 'assinaturas', label: 'Assinaturas',  icon: '📱', color: '#F0A500' },
  default:            { key: 'outros',      label: 'Outros',       icon: '📦', color: '#888' },
}
const cat = (c) => CATS[c] || CATS.default

// ─────────────────────────────────────────────────────────────────────────────
// 📦 MOCK DATA (ativo quando o backend está offline)
// ─────────────────────────────────────────────────────────────────────────────
const MOCK_TXS = [
  { id:1,  desc:'Mercado Municipal',     amount:187.40, date:'2025-04-02', cat:cat('Food & Groceries'), bank:'Inter' },
  { id:2,  desc:'iFood',                amount:68.90,  date:'2025-04-03', cat:cat('Restaurants'),      bank:'Cartão' },
  { id:3,  desc:'Uber',                 amount:32.50,  date:'2025-04-04', cat:cat('Transport'),         bank:'Cartão' },
  { id:4,  desc:'Farmácia Nissei',      amount:145.00, date:'2025-04-05', cat:cat('Health'),            bank:'Itaú' },
  { id:5,  desc:'Netflix',              amount:44.90,  date:'2025-04-06', cat:cat('Subscriptions'),     bank:'Cartão' },
  { id:6,  desc:'Spotify',              amount:21.90,  date:'2025-04-06', cat:cat('Subscriptions'),     bank:'Cartão' },
  { id:7,  desc:'Cinema',               amount:60.00,  date:'2025-04-08', cat:cat('Entertainment'),     bank:'Inter' },
  { id:8,  desc:'Condomínio',           amount:820.00, date:'2025-04-10', cat:cat('Housing'),           bank:'Itaú' },
  { id:9,  desc:'Supermercado Bistek',  amount:312.70, date:'2025-04-12', cat:cat('Food & Groceries'), bank:'Inter' },
  { id:10, desc:'Gasolina Shell',       amount:180.00, date:'2025-04-13', cat:cat('Transport'),         bank:'Itaú' },
  { id:11, desc:'iFood',                amount:45.80,  date:'2025-04-15', cat:cat('Restaurants'),      bank:'Cartão' },
  { id:12, desc:'Farmácia Catarinense', amount:89.00,  date:'2025-04-16', cat:cat('Health'),            bank:'Cartão' },
  { id:13, desc:'Amazon',               amount:127.30, date:'2025-04-17', cat:cat('default'),           bank:'Cartão' },
  { id:14, desc:'Restaurante Bistrô',   amount:95.00,  date:'2025-04-18', cat:cat('Restaurants'),      bank:'Cartão' },
  { id:15, desc:'Água SAMAE',           amount:68.40,  date:'2025-04-19', cat:cat('Housing'),           bank:'Itaú' },
  { id:16, desc:'Energia Celesc',       amount:213.60, date:'2025-04-20', cat:cat('Housing'),           bank:'Itaú' },
  { id:17, desc:'Uber Eats',            amount:52.90,  date:'2025-04-21', cat:cat('Restaurants'),      bank:'Cartão' },
  { id:18, desc:'Academia',             amount:89.90,  date:'2025-04-22', cat:cat('Health'),            bank:'Inter' },
  { id:19, desc:'Disney+',              amount:27.90,  date:'2025-04-26', cat:cat('Subscriptions'),     bank:'Cartão' },
  { id:20, desc:'Gasolina Petrobras',   amount:200.00, date:'2025-04-27', cat:cat('Transport'),         bank:'Itaú' },
]
const MOCK_LINKS = [
  { id:'m1', institution:{ name:'Inter' },  status:'valid' },
  { id:'m2', institution:{ name:'Itaú' },   status:'valid' },
  { id:'m3', institution:{ name:'Cartão' }, status:'valid' },
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

const processTxs = (raw) =>
  raw
    .filter(t => t.type === 'OUTFLOW')
    .map(t => ({
      id:     t.id,
      desc:   t.description,
      amount: Math.abs(t.amount),
      date:   t.value_date,
      cat:    cat(t.category),
      bank:   t._institution || t.account?.institution?.name || '—',
    }))

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
  const [tab, setTab]             = useState('home')
  const [txs, setTxs]             = useState([])
  const [links, setLinks]         = useState([])
  const [flow]                    = useState(MOCK_FLOW)
  const [loading, setLoading]     = useState(true)
  const [syncing, setSyncing]     = useState(false)
  const [lastSync, setLastSync]   = useState(null)
  const [isMock, setIsMock]       = useState(false)
  const [error, setError]         = useState(null)
  const [aiOpen, setAiOpen]       = useState(false)
  const [aiText, setAiText]       = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [filterCat, setFilterCat] = useState('all')
  const [uploading, setUploading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState(null)
  const [uploadBank, setUploadBank] = useState('')
  const [batches, setBatches]     = useState([])

  // ── Carrega dados via backend ───────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const health = await fetch(`${API_URL}/health`).catch(() => null)

      if (!health?.ok) {
        // Backend offline → fallback para modo demo
        setIsMock(true)
        setTxs(MOCK_TXS)
        setLinks(MOCK_LINKS)
      } else {
        setIsMock(false)
        const [allLinks, rawTxs] = await Promise.all([
          api.get('/api/links'),
          api.get(`/api/transactions?date_from=${monthStart()}&date_to=${today()}`),
        ])
        setLinks(allLinks)
        setTxs(processTxs(rawTxs))
      }
      setLastSync(new Date())
    } catch (e) {
      setError(e.message)
      setIsMock(true)
      setTxs(MOCK_TXS)
      setLinks(MOCK_LINKS)
    }
    setLoading(false)
  }, [])

  const sync = async () => {
    setSyncing(true)
    if (!isMock) {
      try {
        await Promise.all(links.map(l => api.post(`/api/links/refresh/${l.id}`)))
        await new Promise(r => setTimeout(r, 2000))
      } catch { /* continua mesmo se refresh falhar */ }
    } else {
      await new Promise(r => setTimeout(r, 1000))
    }
    await load()
    setSyncing(false)
  }

  useEffect(() => { load() }, [load])

  // ── Abre o Belvo Connect Widget via token temporário do backend ─────────────
  const openWidget = async (linkId = null) => {
    try {
      const { access } = await api.post('/api/widget-token', linkId ? { linkId } : {})
      if (typeof window.belvoSDK === 'undefined') {
        alert('Script do Belvo Widget não encontrado. Adicione no index.html (ver README).')
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

  // ── Upload OFX/CSV ──────────────────────────────────────────────────────────
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
    try {
      const b = await api.get('/api/import/batches')
      setBatches(b)
    } catch { /* backend offline */ }
  }

  const deleteBatch = async (batchId) => {
    try {
      await api.del(`/api/import/batches/${batchId}`)
      await loadBatches()
      await load()
    } catch (e) {
      setError('Erro ao deletar: ' + e.message)
    }
  }

  useEffect(() => { loadBatches() }, [])

  // ── Análise de IA ───────────────────────────────────────────────────────────
  const askAI = async () => {
    setAiLoading(true)
    setAiOpen(true)
    setAiText('')

    // Análise local baseada nos dados reais do usuário
    await new Promise(r => setTimeout(r, 1200))

    const catData = byCat(txs)
    const totalGasto = txs.reduce((s, t) => s + t.amount, 0)
    const pct = ((totalGasto / totalReceita) * 100).toFixed(0)
    const top = catData[0]
    const tips = []

    if (top) tips.push(`🔍 Sua maior categoria é ${top.icon} ${top.label} com ${fmt(top.value)} (${((top.value / totalGasto) * 100).toFixed(0)}% dos gastos). Revise se há itens que podem ser reduzidos.`)
    if (catData.find(c => c.key === 'assinaturas')) tips.push(`📱 Você tem gastos com assinaturas. Verifique se todas estão sendo usadas — cancelar 1 ou 2 pode economizar até ${fmt(catData.find(c => c.key === 'assinaturas').value)} por mês.`)
    if (catData.find(c => c.key === 'alimentacao')) tips.push(`🍽️ Alimentação fora de casa pesa no orçamento. Cozinhar mais em casa pode reduzir esse gasto em até 30%.`)
    if (pct > 80) tips.push(`⚠️ Você está gastando ${pct}% da receita. O ideal é manter abaixo de 70% para ter margem de segurança.`)
    if (pct <= 80) tips.push(`✅ Você está usando ${pct}% da receita — bom controle! Tente manter ou melhorar esse patamar.`)
    tips.push(`💡 Dica: defina um limite mensal por categoria e acompanhe aqui no fin.centro para manter o controle.`)

    setAiText(tips.join('\n\n'))
    setAiLoading(false)
  }

  // ── Derived ─────────────────────────────────────────────────────────────────
  const totalGasto   = txs.reduce((s, t) => s + t.amount, 0)
  const totalReceita = 5800
  const saldo        = totalReceita - totalGasto
  const catData      = byCat(txs)
  const filteredTxs  = txs
    .filter(t => filterCat === 'all' || t.cat.key === filterCat)
    .sort((a, b) => new Date(b.date) - new Date(a.date))

  // ── STYLES ──────────────────────────────────────────────────────────────────
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
    txRow:      { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 0', borderBottom:`1px solid ${BORDER}` },
    txIcon:     (c) => ({ width:38, height:38, borderRadius:11, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:17, background:c+'18', marginRight:12 }),
    badge:      (c) => ({ fontSize:9, padding:'2px 7px', borderRadius:20, fontWeight:700, background:c+'22', color:c, textTransform:'uppercase', letterSpacing:'0.5px' }),
    chip:       (a) => ({ padding:'7px 14px', borderRadius:20, fontSize:12, fontWeight:600, border:`1px solid ${a?ACCENT:BORDER}`, background:a?'rgba(255,107,0,0.12)':'transparent', color:a?ACCENT:'#666', cursor:'pointer', whiteSpace:'nowrap' }),
    aiBtn:      { width:'100%', padding:'16px', borderRadius:14, border:'none', background:`linear-gradient(135deg,${ACCENT},#FF8C42)`, color:'#fff', fontSize:15, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8, boxShadow:'0 4px 20px rgba(255,107,0,0.3)', marginBottom:16 },
    overlay:    { position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', zIndex:100, display:'flex', alignItems:'flex-end', backdropFilter:'blur(6px)' },
    sheet:      { background:'#13132A', borderRadius:'20px 20px 0 0', padding:'24px 20px', paddingBottom:'calc(env(safe-area-inset-bottom,0px) + 24px)', width:'100%', maxHeight:'80dvh', overflowY:'auto', border:`1px solid rgba(255,107,0,0.15)` },
    connectBtn: { width:'100%', padding:'13px', borderRadius:12, border:`1px solid rgba(78,205,196,0.3)`, background:'rgba(78,205,196,0.08)', color:'#4ECDC4', cursor:'pointer', fontSize:13, fontWeight:700, marginTop:8 },
  }

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
    { id:'home',   icon:'🏠', label:'Início' },
    { id:'txs',    icon:'📋', label:'Gastos' },
    { id:'ia',     icon:'✦',  label:'IA' },
    { id:'contas', icon:'🏦', label:'Contas' },
  ]

  if (loading) return (
    <div style={{ ...s.root, alignItems:'center', justifyContent:'center' }}>
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
        <button style={s.syncBtn} onClick={sync} disabled={syncing} aria-label="Sincronizar">
          <span className={syncing ? 'spin' : ''}>⟳</span>
        </button>
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
              <div style={s.saldoCard}>
                <div style={{ fontSize:11, color:'rgba(255,107,0,0.7)', textTransform:'uppercase', letterSpacing:'1px', marginBottom:6 }}>Saldo do mês</div>
                <div style={{ fontSize:34, fontWeight:800, color:saldo>=0?'#fff':'#FF6B6B', fontVariantNumeric:'tabular-nums' }}>{fmt(saldo)}</div>
                <div style={{ fontSize:12, color:'rgba(255,255,255,0.3)', marginTop:4 }}>{new Date().toLocaleString('pt-BR',{month:'long',year:'numeric'})}</div>
              </div>
              <div style={s.kpiGrid}>
                <div style={s.kpiCard('#4ECDC4')}>
                  <div style={s.kpiLbl}>Receita</div>
                  <div style={s.kpiVal('#4ECDC4')}>{fmt(totalReceita)}</div>
                  <div style={s.kpiSub}>entradas</div>
                </div>
                <div style={s.kpiCard('#FF6B6B')}>
                  <div style={s.kpiLbl}>Gastos</div>
                  <div style={s.kpiVal('#FF6B6B')}>{fmt(totalGasto)}</div>
                  <div style={s.kpiSub}>{((totalGasto/totalReceita)*100).toFixed(0)}% da receita</div>
                </div>
              </div>
              <div style={s.card}>
                <div style={s.cardT}>Histórico de gastos</div>
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
              <div style={s.card}>
                <div style={s.cardT}>Por categoria</div>
                <div style={{ display:'flex', gap:16, alignItems:'center' }}>
                  <ResponsiveContainer width={120} height={120}>
                    <PieChart>
                      <Pie data={catData} dataKey="value" cx="50%" cy="50%" innerRadius={32} outerRadius={55} paddingAngle={3} startAngle={90} endAngle={-270}>
                        {catData.map((e,i) => <Cell key={i} fill={e.color} stroke="none"/>)}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ flex:1 }}>
                    {catData.slice(0,4).map(c => (
                      <div key={c.key} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:12 }}>
                          <span style={{ width:8, height:8, borderRadius:'50%', background:c.color, display:'inline-block', flexShrink:0 }}/>
                          {c.icon} {c.label}
                        </div>
                        <span style={{ fontSize:11, color:'#888', fontFamily:'DM Mono,monospace' }}>{fmt(c.value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div style={s.card}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                  <div style={s.cardT}>Recentes</div>
                  <button onClick={()=>setTab('txs')} style={{ fontSize:12, color:ACCENT, background:'none', border:'none', cursor:'pointer', fontWeight:600 }}>ver todos →</button>
                </div>
                {[...txs].sort((a,b) => new Date(b.date)-new Date(a.date)).slice(0,5).map(t => (
                  <div key={t.id} style={s.txRow}>
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

        {/* ── TRANSAÇÕES ── */}
        {tab === 'txs' && (
          <div className="slide">
            <div style={s.section}>
              <div style={{ fontSize:18, fontWeight:800, color:'#fff', marginBottom:14 }}>Transações</div>
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
                  <div key={t.id} style={s.txRow}>
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
            </div>
          </div>
        )}

        {/* ── IA ── */}
        {tab === 'ia' && (
          <div className="slide">
            <div style={s.section}>
              <div style={{ fontSize:18, fontWeight:800, color:'#fff', marginBottom:4 }}>IA Financeira</div>
              <div style={{ fontSize:12, color:'#555', marginBottom:20 }}>Análise dos seus {txs.length} gastos deste mês</div>
              <button style={s.aiBtn} onClick={askAI}>✦ Analisar com IA</button>
              <div style={s.card}>
                <div style={s.cardT}>Resumo</div>
                {[
                  { label:'Maior categoria',    value: catData[0] ? `${catData[0].icon} ${catData[0].label} (${fmt(catData[0].value)})` : '—' },
                  { label:'Nº de transações',   value: txs.length },
                  { label:'Ticket médio',        value: txs.length ? fmt(totalGasto/txs.length) : '—' },
                  { label:'% da receita gasta', value: `${((totalGasto/totalReceita)*100).toFixed(1)}%` },
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
              {/* ── Importar extrato ── */}
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
                  style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:`1px solid ${BORDER}`, background:'rgba(255,255,255,0.04)', color:'#ccc', fontSize:13, marginBottom:8, outline:'none', boxSizing:'border-box' }}
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

              {/* ── Batches importados ── */}
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
                  Credenciais Belvo ficam no servidor Node.js — nunca chegam ao browser.
                  O frontend recebe apenas tokens temporários para abrir o widget.
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Nav */}
      <nav style={s.bottomNav}>
        {TABS.map(t => (
          <button key={t.id} style={s.navItem(tab===t.id)} onClick={()=>setTab(t.id)}>
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
            <div style={{ fontSize:15, fontWeight:800, color:ACCENT, marginBottom:14 }}>✦ Análise da IA</div>
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
    </div>
  )
}
