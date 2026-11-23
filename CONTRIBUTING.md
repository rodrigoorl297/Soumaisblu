# Como contribuir no SOU+BLU

## Regras

1. **Nada direto na `main`.** Todo commit entra numa branch e vira Pull Request.
2. **Integração às quintas-feiras** (horário de Brasília). Os PRs prontos e com a esteira verde são integrados na quinta.
3. **Exceção: extrema necessidade.** Problema em produção que não pode esperar → rótulo `urgente` no PR, com o motivo na descrição. Aí ele pode entrar em qualquer dia.

## Nome das branches

| Tipo | Exemplo |
|---|---|
| Funcionalidade | `feat/gestao-credito-filtro` |
| Correção | `fix/upload-anexo-proposta` |
| Urgente em produção | `hotfix/login-429` |
| Ajuste visual | `style/dashboard-grafico` |

## Fluxo

```bash
git checkout main && git pull
git checkout -b fix/nome-curto
# ...alterações...
git add -A && git commit -m "fix: descrição curta"
git push -u origin fix/nome-curto
# abrir o Pull Request para a main no GitHub
```

## Esteira (GitHub Actions)

Roda em todo push e em todo PR:

- **CI** (`.github/workflows/ci.yml`): sintaxe de todos os `.js`/`.php`, testes de `tests/` (PHP, Node e de tela com Playwright + Edge) e bloqueio de credenciais no Git.
- **Janela de integração** (`.github/workflows/janela-integracao.yml`): só fica verde na quinta-feira ou com o rótulo `urgente`.

## Configuração no GitHub (uma vez, feita por um admin do repositório)

Em **Settings → Branches → Add branch ruleset** (ou *Branch protection rule*) para `main`:

- Exigir Pull Request antes de integrar
- Exigir as checagens: `Sintaxe JS/PHP e credenciais`, `Testes (Node e PHP)`, `Testes de tela (Playwright + Edge)` e `Quinta-feira ou urgente`
- Bloquear push direto e force push

E criar o rótulo `urgente` em **Issues → Labels**.
