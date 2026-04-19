import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { registerSW } from 'virtual:pwa-register'

// Registra o service worker com update automático
const updateSW = registerSW({
  onNeedRefresh() {
    // Quando há nova versão disponível
    if (confirm('Nova versão do fin.centro disponível! Atualizar agora?')) {
      updateSW(true)
    }
  },
  onOfflineReady() {
    console.log('fin.centro pronto para uso offline!')
  },
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
