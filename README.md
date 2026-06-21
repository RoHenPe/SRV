# ROHENPER Server Dashboard

Dashboard web para gerenciar o servidor remoto, hospedado na **Vercel**.

## Funcionalidades

| Módulo | Funções |
|--------|---------|
| ⚡ Energia | Desligar, Reiniciar |
| 🐳 Docker | Listar, Parar containers, Reiniciar serviço |
| 🧪 Sandbox | VS Code, Webtop, Steam |
| 🤖 IA Hub | Status Ollama, Listar modelos, Pull modelo |
| 💾 Backup | Backup Full, Status de Storage |
| 🔧 Manutenção | Limpar lixo, Update OS |
| 🔒 VPN | Status Tailscale |

> **Nota:** A função **LIGAR (Wake-on-LAN)** não está disponível via web — requer acesso de broadcast UDP na rede local.

## Setup

### 1. Clone e instale dependências

```bash
git clone https://github.com/RoHenPe/SRV.git
cd SRV
npm install
```

### 2. Configure as variáveis de ambiente

```bash
cp .env.example .env.local
```

Edite `.env.local` com os dados do seu servidor:

```env
SSH_HOST=192.168.15.109
SSH_HOST_VPN=100.119.122.10
SSH_USER=rodrigo
SSH_PRIVATE_KEY_B64=<base64 da chave privada>
```

#### Converter chave SSH para Base64 (PowerShell):
```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("$env:USERPROFILE\.ssh\id_rsa")) | Set-Clipboard
```

### 3. Rode localmente

```bash
npm run dev
```

Acesse: `http://localhost:3000`

## Deploy na Vercel

### 1. Preparar variáveis de ambiente

No painel da Vercel, em **Settings → Environment Variables**, adicione:

- `API_KEY` — Uma string aleatória e segura para autenticação (ex: `openssl rand -base64 32`)
- `SSH_HOST` — IP do servidor (LAN ou VPN)
- `SSH_HOST_VPN` — IP de fallback (opcional)
- `SSH_USER` — Usuário SSH
- `SSH_PRIVATE_KEY_B64` — Chave SSH em Base64
- `LOG_LEVEL` — (opcional, padrão: `info`)
- `RATE_LIMIT_ENABLED` — (opcional, padrão: `true`)

### 2. Autenticação no Dashboard

Após fazer deploy, acesse a URL e você será redirecionado para `/login`.

**Faça login com a API_KEY que você configurou nas variáveis de ambiente.**

> 🔐 Cada acesso é auditado e logging de todas as ações é feito automaticamente.

### 3. Segurança

- ✅ Todas as rotas requerem Bearer token (API_KEY)
- ✅ Rate limiting: 10 requisições por minuto por IP
- ✅ Audit logging: `/tmp/dashboard-audit.log`
- ✅ Autenticação validada em cada requisição

> ⚠️ **Importante:** 
> - Nunca compartilhe sua API_KEY
> - Use uma API_KEY única para cada ambiente
> - O servidor remoto deve aceitar conexões SSH pela internet (porta 22 aberta ou via VPN Tailscale).

## Estrutura do Projeto

```
app/
├── page.js              ← Dashboard principal
├── layout.js
├── globals.css
├── components/          ← Componentes React
└── api/                 ← Rotas SSH (serverless functions)
    ├── power/
    ├── docker/
    ├── sandbox/
    ├── ia/
    ├── backup/
    ├── maintenance/
    └── vpn/
```
