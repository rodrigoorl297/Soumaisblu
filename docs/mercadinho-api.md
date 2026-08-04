# API do Mercadinho ZS — integração com o Clube de Benefícios

Endpoint único para o sistema externo do mercadinho consultar o limite do
funcionário pelo **código do crachá** e cobrar a compra debitando do Clube de
Benefícios (o débito vira voucher e aparece no extrato normal do colaborador).

## Endpoint

```
POST https://www.soumaisblu.com.br/api/mercadinho-charge.php
Content-Type: application/json
X-API-Key: soublu_api_52e8c7a6b3df4019
```

- Autenticação pelo header `X-API-Key` (mesma chave da API REST do sistema,
  `API_INTERNAL_KEY` em `config.db.local.php` no servidor).
- Corpo sempre JSON com o campo `action`: `"consulta"` ou `"cobrar"`.
- O código do crachá é o campo **"Código do Crachá (Mercadinho)"** cadastrado
  pelo RH no funcionário (Gerenciador de RH → Funcionário).

## `action: "consulta"` — funcionário + saldo

```bash
curl -s -X POST 'https://www.soumaisblu.com.br/api/mercadinho-charge.php' \
  -H 'Content-Type: application/json' \
  -H 'X-API-Key: soublu_api_52e8c7a6b3df4019' \
  -d '{"action":"consulta","cracha_codigo":"12345"}'
```

Resposta `200`:

```json
{
  "ok": true,
  "funcionario": { "nome": "FULANO DA SILVA", "employee_id": "abc123" },
  "limite": { "aprovado": 600, "utilizado": 150.5, "disponivel": 449.5 }
}
```

## `action: "cobrar"` — debita e emite voucher

Campos: `cracha_codigo` (obrigatório), `valor` (obrigatório, > 0),
`itens` (array opcional, formato livre — vai para o detalhe do voucher),
`operador` (string opcional, nome de quem operou o caixa).

```bash
curl -s -X POST 'https://www.soumaisblu.com.br/api/mercadinho-charge.php' \
  -H 'Content-Type: application/json' \
  -H 'X-API-Key: soublu_api_52e8c7a6b3df4019' \
  -d '{
    "action": "cobrar",
    "cracha_codigo": "12345",
    "valor": 23.5,
    "operador": "Portaria",
    "itens": [
      {"nome": "Salgadinho 90g", "preco": 8.5, "qty": 1},
      {"nome": "Refrigerante lata", "preco": 7.5, "qty": 2}
    ]
  }'
```

Resposta `200`:

```json
{ "ok": true, "voucher_no": "ZS-17072026-A1B2", "saldo_restante": 426.0 }
```

A cobrança é transacional no servidor (lock da linha do limite + UPDATE
condicional): se o voucher falhar, o débito é desfeito; duas cobranças
simultâneas não estouram o limite.

## Erros

Sempre `{ "ok": false, "error": "mensagem" }` com o HTTP status:

| HTTP | Quando |
|------|--------|
| 400  | JSON inválido, `action` desconhecida, `cracha_codigo` vazio ou `valor` <= 0 |
| 401  | `X-API-Key` ausente/errada |
| 404  | Crachá não encontrado (ou funcionário demitido) / funcionário sem limite aprovado no Clube |
| 405  | Método diferente de POST |
| 409  | Saldo insuficiente (a mensagem traz o disponível atual) |
| 500  | Erro interno (banco etc.) |

Dica de fluxo no PDV: use `consulta` ao escanear o crachá (mostrar nome +
saldo para conferência) e `cobrar` só na confirmação da venda.
