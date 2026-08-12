# API SOU+BLU → Hyperflow (puxa da base)

Fluxo: https://integracoes.hyperflow.global/apps/cs-call-1/flows/fluxo-flow-1

## Endpoint

```
https://www.soumaisblu.com.br/api/hyperflow-boleto.php
```

Header obrigatório:

```
X-API-Key: <mesmo token da API SOU+BLU / API_INTERNAL_KEY>
```

## Ações

### 1) Listar boletos validados (base real)

```
GET /api/hyperflow-boleto.php?action=list&limit=100
```

### 2) Prontos para contato (validados há 3+ dias)

```
GET /api/hyperflow-boleto.php?action=due&days=3
```

Resposta (exemplo):

```json
{
  "ok": true,
  "count": 2,
  "items": [
    {
      "id": "...",
      "numero": "123",
      "nome": "Cliente",
      "telefone": "11999999999",
      "phone1": "11999999999",
      "mensagem": "Olá Cliente! Passaram 3 dias...",
      "validated_at": "2026-08-01T10:00:00-03:00",
      "age_days": 5,
      "follow_up_done": false
    }
  ]
}
```

No Hyperflow use: `{{input.telefone}}`, `{{input.nome}}`, `{{input.mensagem}}`.

### 3) Marcar como já contatado (evita reenviar)

```
POST /api/hyperflow-boleto.php?action=mark_sent
Content-Type: application/json
{ "id": "ID_DA_PROPOSTA" }
```

## Como montar no Hyperflow

**Opção recomendada (Schedule diário):**

1. Nó **Schedule** (1x por dia)
2. Nó **HTTP Request** → `GET .../hyperflow-boleto.php?action=due&days=3` + header `X-API-Key`
3. Nó **Split** / loop em `items`
4. Nó WhatsApp / Ativar usuário com `telefone` + `mensagem`
5. HTTP Request `mark_sent` com o `id`

**Opção push (na hora da validação):**

Continua existindo `api/boleto-webhook.php?action=notify` se você criar rota no API Gateway e configurar `BOLETO_WEBHOOK_URL`.
