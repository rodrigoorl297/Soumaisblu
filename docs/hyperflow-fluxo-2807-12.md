# Configuração de Credenciais — Hyperflow `fluxo-2807-12`

Link do Fluxo: https://integracoes.hyperflow.global/apps/cs-call-1/flows/fluxo-2807-12

---

## 1. Dados da Credencial

| Campo | Valor |
|---|---|
| **ID da Credencial** | `14529` |
| **Nome Operador** | `EDIANE DE FATIMA RIOS` |
| **Usuário / CPF** | `03083982119` |
| **Senha** | `170804Vh@` |
| **Limite** | `∞ (Infinito)` |
| **Status** | `Credencial disponível` |

---

## 2. Blocos Prontos para Copiar e Colar no Hyperflow

### A. Bloco para Nó "Definir Variáveis" (Set Variables)
Insira no início do fluxo para disponibilizar as credenciais em todas as etapas:

```json
{
  "credencial_id": "14529",
  "operador_nome": "EDIANE DE FATIMA RIOS",
  "usuario_login": "03083982119",
  "senha_acesso": "170804Vh@"
}
```

---

### B. Bloco para Nó "HTTP Request" (Body JSON)
Caso o fluxo envie os dados via POST para uma API externa ou de consulta:

```json
{
  "id": "{{flow.credencial_id}}",
  "nome": "{{flow.operador_nome}}",
  "username": "03083982119",
  "password": "170804Vh@"
}
```

---

### C. Cabeçalhos HTTP (Headers) — Se a API exigir no Header
* `X-User-CPF`: `03083982119`
* `X-User-Pass`: `170804Vh@`
* `X-Credential-ID`: `14529`

---

## 3. Configuração no Servidor SOU+BLU (`config.boleto.local.php`)

Se este fluxo receber dados do sistema SOU+BLU via Webhook:

```php
<?php
define('BOLETO_HYPERFLOW_APP', 'cs-call-1');
define('BOLETO_HYPERFLOW_FLOW', 'fluxo-2807-12');
define('BOLETO_HYPERFLOW_FLOW_URL', 'https://integracoes.hyperflow.global/apps/cs-call-1/flows/fluxo-2807-12');
define('BOLETO_HYPERFLOW_CLIENT_ID', '14529');
```
