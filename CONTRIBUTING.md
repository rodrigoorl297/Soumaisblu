# Contribuir no SOU+BLU

Leia primeiro [o roteiro completo](docs/ROTEIRO-REPOSITORIO-E-PUBLICACAO.md) e [o estado da configuração](docs/ESTADO-DA-CONFIGURACAO.md).

## Fluxo obrigatório

```powershell
git switch main
git pull --ff-only
git switch -c fix/descricao-curta
# implementar e revisar
python tools/bump_assets.py
python tools/validate_repo.py
python -m unittest discover -s tests -p "test_release.py" -v
git add caminho/dos/arquivos
git diff --cached
git commit -m "fix: problema corrigido e comportamento final"
git push -u origin fix/descricao-curta
```

Abra PR para main usando o template. É necessária revisão; integre preferencialmente por squash após os testes. Integração usual às quintas; antecipação somente em incidente extremo autorizado pelo Plínio. Não usar `git add -A` sem revisar dados e segredos.

## Proibições

Nada direto na main, force push, credenciais no código, sincronização destrutiva de public_html, cópia integral do repositório por FTP ou SQL no deploy. Uma publicação não deve mexer nos uploads nem nas configurações privadas.

## Verificação

A CI executa sintaxe JS/PHP, padrões de credenciais, testes de release, comissões, dados bancários e exportação diária. Não equivale a uma suíte completa de navegador; a validação visual permanece obrigatória no PR.

## Publicação e emergência

Use o workflow manual `Publicar na Locaweb`; primeiro `plan`, depois `publish`, com autorização registrada e segredos do ambiente production. Retorno: `rollback` da release mais recente. Não usar publicação direta como atalho de revisão. Uma exceção deve conter a autorização, o responsável, os arquivos afetados, o backup e a validação posterior.

Para o bloqueio técnico da main, o administrador deve importar `deploy/main-ruleset.json`. O hook local em `.githooks/pre-push` é auxiliar e pode ser instalado com `git config core.hooksPath .githooks`; não substitui a proteção remota.
