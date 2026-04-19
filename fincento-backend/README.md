# fin.centro — Backend Node.js 🔐

Servidor Express que faz ponte com a API Belvo.
As credenciais ficam aqui — nunca chegam ao browser.

## Estrutura

```
fincento-backend/
├── src/
│   ├── server.js     ← Express + rotas + cache + rate limiting
│   └── belvo.js      ← Toda comunicação com a API Belvo
├── .env.example      ← Copie para .env e preencha
├── .gitignore        ← .env está aqui, nunca vai pro Git
└── package.json
```

## Rotas disponíveis

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/health` | Status do servidor |
| GET | `/api/links` | Lista bancos conectados |
| POST | `/api/links/refresh/:linkId` | Força resync de um banco |
| GET | `/api/accounts/:linkId` | Contas de um link |
| GET | `/api/transactions/:linkId?date_from=&date_to=` | Transações de um link |
| GET | `/api/transactions?date_from=&date_to=` | Transações de todos os links |
| POST | `/api/widget-token` | Token temporário para o Connect Widget |

## Setup local

```bash
# 1. Instalar dependências
npm install

# 2. Configurar variáveis
cp .env.example .env
# edite .env com suas credenciais Belvo

# 3. Rodar em modo dev (com hot reload)
npm run dev

# 4. Verificar se está no ar
curl http://localhost:3001/health
```

## Deploy em produção (Railway — grátis até 500h/mês)

```bash
# 1. Instalar Railway CLI
npm install -g @railway/cli

# 2. Login
railway login

# 3. Criar projeto
railway init

# 4. Configurar variáveis de ambiente no painel Railway:
#    BELVO_SECRET_ID=...
#    BELVO_SECRET_PASSWORD=...
#    BELVO_ENV=production
#    FRONTEND_URL=https://fincento.vercel.app

# 5. Deploy
railway up
```

Depois de fazer o deploy, pegue a URL gerada (ex: `https://fincento-backend.up.railway.app`)
e cole no `.env` do frontend:

```
VITE_API_URL=https://fincento-backend.up.railway.app
```

## Alternativas de hosting (todos têm plano grátis)

| Plataforma | Link | Observação |
|------------|------|------------|
| Railway | railway.app | Mais simples, 500h grátis/mês |
| Render | render.com | Grátis, dorme após 15min inativo |
| Fly.io | fly.io | Grátis com limites generosos |

## Segurança implementada

- ✅ Credenciais só no servidor (via variáveis de ambiente)
- ✅ CORS restrito ao domínio do frontend
- ✅ Rate limiting (60 req/min geral, 10 req/min para widget token)
- ✅ Helmet (headers de segurança HTTP)
- ✅ Cache em memória (5 min) — evita hits desnecessários na Belvo
- ✅ Validação de parâmetros nas rotas

## Adicionar o Belvo Widget no frontend

No `fincento-pwa/index.html`, antes de `</body>`:

```html
<script src="https://cdn.belvo.io/belvo-widget-1-stable.js"></script>
```

O botão "Conectar novo banco" na aba Contas do app abrirá o widget automaticamente.
