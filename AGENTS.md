# Regras obrigatórias para pessoas e agentes

Estas regras substituem o bloqueio temporário de 19/11/2026 por um fluxo controlado.

1. Toda alteração nasce em branch: `feat/`, `fix/`, `style/`, `docs/` ou `chore/`.
2. Nunca fazer commit/push direto na `main`, force push ou apagar a branch principal.
3. Integrar por Pull Request, com revisão e checagens verdes. A integração usual é quinta-feira; incidente extremo autorizado pode ser integrado antes.
4. Exceção extrema exige autorização explícita do Plínio ou do Rodrigo, incidente registrado, escopo, backup e retorno. O rótulo `urgente` sozinho não autoriza nada. Preferir PR hotfix mesmo em urgência.
5. Não publicar automaticamente ao fazer push. Usar `Publicar na Locaweb`, manualmente, a partir da `main`, com ambiente production e autorização registrada.
6. Não usar WebFTP, FTP avulso, remote-deploy.php ou chunk-deploy.php no fluxo normal. Exceção apenas em incidente expressamente autorizado; depois reconciliar o servidor no mesmo dia.
7. Nunca sobrescrever arquivo divergente da versão base no servidor: exportar, comparar e reconciliar primeiro.
8. Nunca versionar/enviar senhas, chaves privadas, config.*.local.php, .env, uploads, documentos de clientes, caches ou dumps. Esses dados não entram no pacote nem no rollback.
9. Nunca executar migração, purge, repair ou limpeza em produção durante deploy de código. Planejar e autorizar separadamente.
10. Alterações visuais devem ser conferidas em computador e celular. Regras de negócio devem ser testadas em API, permissões e persistência, sem criar registros reais de teste sem autorização.
11. Atualizar as versões de assets com `python tools/bump_assets.py`; revisar o diff antes do commit.
12. Documentar problema, resultado, validação, riscos e retorno no PR. Não declarar como verificado o que só foi preparado.
13. Ler `docs/ROTEIRO-REPOSITORIO-E-PUBLICACAO.md` e `docs/ESTADO-DA-CONFIGURACAO.md` antes de trabalhar.
14. Não apagar Monitoria nem outro módulo apenas por classificação automática de lixo. A descontinuação exige pedido específico e preservação dos dados.

A proteção efetiva da main depende da ativação administrativa do ruleset. Enquanto pendente, estas regras não devem ser confundidas com bloqueio técnico já instalado no GitHub.
