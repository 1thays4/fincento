# fin.centro PWA 📱

Dashboard financeiro pessoal como Progressive Web App — instala no celular, funciona offline.

## Estrutura do projeto

```
fincento-pwa/
├── public/
│   ├── favicon.svg
│   └── icons/
│       ├── icon-192.png   ← gerar com generate-icons.js
│       └── icon-512.png   ← gerar com generate-icons.js
├── src/
│   ├── main.jsx           ← entry point + registro do service worker
│   └── App.jsx            ← app completo (UI + Belvo + IA)
├── index.html
├── vite.config.js         ← config do PWA (manifest + workbox)
├── vercel.json
└── package.json
```

## Setup local (5 min)

```bash
# 1. Instalar dependências
npm install

# 2. Gerar ícones do app (opcional, precisa do pacote canvas)
npm install canvas --save-dev
node generate-icons.js

# 3. Rodar em dev
npm run dev
# → http://localhost:5173

# 4. Build para produção
npm run build
npm run preview
```

## Configurar Belvo (dados reais)

Edite `src/App.jsx` no topo:

```js
const BELVO_CONFIG = {
  secretId:       'seu-secret-id-aqui',
  secretPassword: 'seu-secret-password-aqui',
  env:            'sandbox', // mude para 'production' quando pronto
}
```

## Deploy no Vercel (grátis)

```bash
# Instalar Vercel CLI
npm install -g vercel

# Deploy (primeira vez)
vercel

# Deploy de atualização
vercel --prod
```

Ou conecte o repositório GitHub direto no dashboard do Vercel — ele detecta Vite automaticamente.

## Instalar no celular como app

### Android (Chrome)
1. Abra o site no Chrome
2. Menu (⋮) → "Adicionar à tela inicial"
3. Confirmar → ícone aparece na tela inicial

### iPhone (Safari)
1. Abra o site no Safari
2. Botão compartilhar (□↑) → "Adicionar à Tela de Início"
3. Confirmar → ícone aparece na tela inicial

## Features do PWA

- ✅ Funciona offline (dados em cache por 5 min)
- ✅ Ícone na tela inicial
- ✅ Tela cheia sem barra do browser
- ✅ Safe area para notch e home indicator do iPhone
- ✅ Atualização automática quando há nova versão
- ✅ Fonte em cache (carrega sem internet)

## Próximos passos

- [ ] Backend Node.js para esconder credenciais Belvo (segurança)
- [ ] Push notifications para alertas de gastos
- [ ] Autenticação por biometria (Face ID / Touch ID via WebAuthn)
- [ ] Modo Capacitor para publicar na Play Store
