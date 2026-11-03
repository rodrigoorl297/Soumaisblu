# SOU+BLU
CRM e painel operacional da **SOU+BLU** (consignado / crédito): leads, propostas, esteiras, simulação, WhatsApp, financeiro, RH e clube de benefícios.
**Produção:** [www.soumaisblu.com.br](https://www.soumaisblu.com.br)  
**Repositório:** [rodrigoorl297/Soumaisblu](https://github.com/rodrigoorl297/Soumaisblu)
---
## O que é
Aplicação web **vanilla** (HTML + CSS + JS) com API **PHP** e banco **MySQL** (compatível com estilo PostgREST / Supabase, com failover Localweb).
Sem build step de frontend: abre no Apache/Nginx ou sobe PHP local.
### Painéis principais
| Página | Público |
|--------|---------|
| `index.html` | Login |
| `admin.html` / `pages/admin.html` | Gestão (master, BO, gerente, etc.) |
| `employee.html` / `pages/employee.html` | Vendedor |
| `financeiro.html` | Financeiro |
| `leads-manager.html` / `leads-employee.html` | Leads |
| `whatsapp.html` | WhatsApp CRM |
| `rh-manager.html` | RH |
| `clube-beneficios.html` | Clube de benefícios |
| `cadastro.html` | Cadastro de parceiro (LP) |
---
## Módulos (visão rápida)
- **Propostas** — cadastro, status, anexos, transferência de vendedor, ranking
- **Gestão de Crédito** — 2ª esteira (compra de dívida / CD-\*); no vendedor: lista + popup *Nova Proposta*
- **Pendências** — BO lança; vendedor trata; botão **Resolvido** com histórico antes de confirmar
- **Leads** — importação, distribuição, atendimento
- **Simulação** — tabelas / CPF / Corban (Fintech)
- **WhatsApp / Chipeira** — números, solicitações, Evolution API
- **Financeiro** — comissões, saque/PIX, bloqueios
- **RH** — folha, justificativas, treinamentos
- **ConsigBot** — assistente no painel
---
## Stack
| Camada | Tech |
|--------|------|
| Front | HTML/CSS/JS (Bootstrap bridge, CSS próprio) |
| Auth / dados client | `js/auth.js`, `js/db.js`, `js/config.js` |
| API | `api/*.php`, `api/rest/` (compat PostgREST) |
| DB | MySQL (Hostinger/Localweb); opcional Supabase com failover |
| Integrações | Evolution (WA), Fintech Corban, EFI/PIX, Hyperflow, FonteData |
---
## Estrutura do repo
```
api/           # PHP (REST, upload, integrações)
js/            # scripts do painel
css/           # estilos
pages/         # cópias/rotas alternativas dos HTMLs
mysql/         # migrations SQL (quando houver)
docs/          # planos e guias
config.*.local.php(.example)  # segredos locais (não versionar .local.php)
```
Scripts `_deploy-*.js`, `_bump-*.js` e `_probe-*.js` na raiz são **ferramentas de deploy/diagnóstico**, não fazem parte do runtime do site.
---
## Como rodar local
### Opção A — PHP embutido
```bash
php -S localhost:8080 -t .
```
Abra `http://localhost:8080/index.html`.
### Opção B — Apache / XAMPP
Aponte o DocumentRoot para esta pasta e garanta `mod_rewrite` (há `.htaccess`).
### Config local
Copie os examples e preencha (nunca commitar os `.local.php` com senha):
```text
config.db.local.php.example
config.supabase.local.php
config.pix.local.php.example
config.fintech-corban.local.php.example
config.evolution.local.php
…
```
No browser, `window.SOUBLU_CONFIG` (injetado nos HTMLs) define URLs/flags; o `js/config.js` faz failover Supabase → MySQL se o REST cair.
---
## Papéis (roles) comuns
- `vendedor` / `employee` — painel do colaborador  
- `backoffice` / `sup_backoffice` — esteiras e propostas  
- `supervisor` / `gerente` / `master` / `fundador` — gestão ampla  
- `financeiro` / `rh` / `diretoria` — módulos específicos  
A visibilidade de menus (ex.: Gestão de Crédito, Pendências) depende do role e de flags no JS.
---
## Deploy
Produção costuma ir por **chunk deploy** (`api/chunk-deploy.php` + scripts `_deploy-*.js`) por causa de limite/WAF (~5 KB por chunk).
Depois de alterar JS/HTML, **suba a versão** no `?v=` do `<script>` / CSS para quebrar cache (Ctrl+F5 no cliente).
```bash
# exemplo
node _deploy-pend-resolve.js
```
---
## Comentários de manutenção
Ao criar/alterar regra importante no JS, documente no código (JSDoc em PT): **o que é**, **o que faz**, **por que existe**. Ver `.cursor/rules/comentarios-manutencao.mdc`.
---
## Segurança
- Não versionar `config.*.local.php`, chaves API, certificados `.p12` com senha
- Deploy remoto exige `X-API-Key` configurada no servidor
- Uploads passam por `api/upload.php` / `api/file.php`
---
## Links úteis
- Login produção: https://www.soumaisblu.com.br/  
- Admin: `/admin.html` ou `/pages/admin.html`  
- Vendedor: `/employee.html` ou `/pages/employee.html`
