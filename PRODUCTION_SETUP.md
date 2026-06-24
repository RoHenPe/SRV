# Guia Rápido: Deploy em Produção na Vercel

## O que foi implementado

✅ **Autenticação**: Bearer token baseado em API_KEY  
✅ **Rate Limiting**: 10 req/min por IP (configurável)  
✅ **Audit Logging**: Todos os acessos logados em `/tmp/dashboard-audit.log`  
✅ **Segurança**: Todas as 19 rotas API protegidas  
✅ **Login**: Página de login com Material Design  
✅ **Validação**: Env vars validadas na inicialização  

## Steps para Deploy

### 1. Atualize o .env local

```bash
cd ~/rohenper-dashboard
cp .env.example .env.local
```

Edite `.env.local` com:
- `API_KEY` = uma string aleatória (use: `openssl rand -base64 32`)
- `SSH_HOST`, `SSH_USER`, `SSH_PRIVATE_KEY_B64` = configurações do servidor

### 2. Teste localmente

```bash
npm install
npm run dev
```

Acesse `http://localhost:3000` → vai redirecionar para login  
Faça login com a API_KEY

### 3. Deploy na Vercel

- Abra seu projeto na Vercel (Settings → Environment Variables)
- Adicione as mesmas variáveis do `.env.local`
- Faça push para main ou use "Deploy" direto na interface
- Acesse o URL → login com a API_KEY

## Fluxo de Autenticação

```
Usuário → Login (/login)
  ↓
POST /api/auth/validate + Bearer token
  ↓
Se válido: localStorage.setItem('dashboard-token')
  ↓
Redireciona para dashboard (/)
  ↓
Cada requisição leva o token no header
  ↓
API valida token: se inválido/expirado → 401
  ↓
Frontend redireciona para login se 401
```

## Arquivos Novos

- `lib/auth.js` — Validação de bearer token
- `lib/rateLimit.js` — Limite de requisições
- `lib/logger.js` — Audit log estruturado
- `lib/env.js` — Validação de variáveis
- `app/middleware.ts` — Next.js middleware
- `app/login/page.js` — Página de login
- `app/api/auth/validate/route.js` — Endpoint de validação

## Configuração Vercel Recomendada

**Environment Variables (Settings → Environment Variables)**

```
API_KEY = [sua-chave-aleatória]
SSH_HOST = [seu-servidor-ip]
SSH_HOST_VPN = [seu-vpn-ip]
SSH_USER = [seu-usuario-ssh]
SSH_PRIVATE_KEY_B64 = [sua-chave-em-base64]
NGROK_AUTHTOKEN = [seu-token-do-ngrok]  # Requerido para túneis HTTPS no acesso via Vercel
LOG_LEVEL = info
RATE_LIMIT_ENABLED = true
```

**Deployment Protection** (Settings → Deployment Protection)  
- Recomendado: Enable "Deployment Protection" para evitar logs com credenciais

## Segurança

🔐 API_KEY muda de ambiente para ambiente  
🔐 Rate limit: 10 req/min (evita brute force)  
🔐 Todas as ações são auditadas  
🔐 Nenhuma credencial no git  
🔐 HTTPS automático na Vercel  

## Troubleshooting

**"Invalid API key"**
- Verifique se a API_KEY está correta
- Se mudou, limpe o localStorage: F12 → Application → Clear all

**"Missing authorization header"**
- Frontend não está passando o token
- Verifique localStorage: `localStorage.getItem('dashboard-token')`

**"Too many requests"**
- Rate limit atingido (10 req/min)
- Aguarde 1 minuto

**SSH não conecta**
- Verifique `SSH_HOST` e `SSH_HOST_VPN`
- Confirme credenciais SSH
- Verifique logs: `cat /tmp/dashboard-audit.log`

## Monitoramento

Acesse os logs via SSH:

```bash
ssh [seu-usuario]@[seu-servidor]
tail -f /tmp/dashboard-audit.log
```

Exemplo de output:
```json
{"timestamp":"2026-06-21T14:30:00.123Z","level":"info","message":"API Request","method":"POST","route":"POST /api/docker/ps","apiKey":"xxxx...","status":200,"responseTime":"450ms"}
```
