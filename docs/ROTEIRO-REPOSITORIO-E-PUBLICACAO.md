# Roteiro do repositório e publicação - SOU+BLU

Versão 1.0 | 23/11/2026 | Para equipe técnica, colaboradores e agentes de IA.

## 1. Regra principal

Fluxo oficial: branch de trabalho -> Pull Request -> revisão e testes -> main -> plano de publicação -> publicação manual -> conferência.

Nunca fazer commits novos diretamente na main, force push ou apagar a branch principal. Exceção somente em incidente extremo com autorização explícita do Plínio, responsável, escopo, backup e retorno registrados. Mesmo em urgência, preferir branch hotfix com PR curto. O rótulo urgente sozinho não autoriza publicação nem bypass.

Leia também AGENTS.md, CONTRIBUTING.md e ESTADO-DA-CONFIGURACAO.md. As regras anteriores de bloqueio temporário foram substituídas por este fluxo controlado. A integração usual é quinta-feira; incidentes extremos autorizados podem ser antecipados.

## 2. Começar uma alteração

Atualize a main, crie uma branch nova e faça o menor ajuste que resolva o problema. Prefixos: feat/ para funcionalidade; fix/ para correção; style/ para interface; docs/ para documentação; chore/ para manutenção.

```powershell
git switch main
git pull --ff-only
git switch -c fix/descricao-curta
# implementar e revisar
python tools/bump_assets.py
python tools/validate_repo.py
python -m unittest discover -s tests -p "test_release.py" -v
git add arquivos-revisados
git diff --cached
git commit -m "fix: problema corrigido e comportamento final"
git push -u origin fix/descricao-curta
```

Pré-requisitos: Git, Python 3.12+, Node 20+ e PHP 8.3. O teste de exportação usa openpyxl 3.1.5. O front é HTML/CSS/JavaScript com API PHP e MySQL, sem compilação obrigatória.

## 3. O que pode entrar no Git

Código, testes, migrações revisadas, documentação técnica e metadados de releases. Nunca incluir .env, config.*.local.php, senhas, chaves privadas, dumps, dados pessoais, anexos, uploads, caches ou backups. Não usar git add -A sem revisar o conteúdo. Configurações de exemplo usam valores fictícios.

Arquivos de runtime preservam bytes por .gitattributes para permitir comparação com o servidor. Não reformatar arquivos inteiros por acidente. Retirar um dado do índice não remove versões antigas do histórico: eventual saneamento do histórico é tarefa separada e coordenada.

## 4. Testar e revisar

Execute tools/validate_repo.py e os testes pertinentes. A CI verifica sintaxe JS/PHP, padrões conhecidos de credenciais e testes de unidade. Não equivale a auditoria completa de segurança nem a teste visual.

Para interface, confira computador e celular. Para cadastro, confira API, permissões e persistência. Não criar registros financeiros, RH ou propostas reais apenas para testar sem autorização. Alterou JS ou CSS? Rode tools/bump_assets.py e revise os parâmetros ?v= nos HTMLs, incluindo raiz e pages/ quando existirem cópias. Ctrl+F5 não é a solução de publicação para todos os usuários.

No PR, descreva problema, resultado final, telas/arquivos afetados, validação, riscos e retorno. Anexe evidências visuais. API, permissões e deploy precisam da revisão do responsável indicado no CODEOWNERS. Integre por squash ou rebase, mantendo histórico linear.

## 5. Configuração única do administrador

As proteções não ficam ativas só por existir um arquivo no repositório. O proprietário deve importar deploy/main-ruleset.json em Settings > Rules > Rulesets e conferir revisão obrigatória, bloqueio de exclusão/force push e checks Sintaxe e seguranca e Testes de unidade.

Criar o ambiente production em Settings > Environments, permitir somente main e configurar revisor autorizado. Cadastrar os segredos LOCAWEB_FTP_HOST, LOCAWEB_FTP_USER e LOCAWEB_FTP_PASSWORD. Nunca colocar senha no chat, código ou PR.

Variáveis: LOCAWEB_FTP_PORT=21; LOCAWEB_WEBROOT=/public_html; LOCAWEB_BACKUP_ROOT=/.soublu-backups. Ajustar aos caminhos reais da conta. O backup precisa ficar fora de public_html, em diretório privado gravável pela mesma conta FTPS. A raiz pública não pode ser / no modelo entregue.

Deixar LOCAWEB_DEPLOY_ENABLED=false até confirmar conexão, certificado TLS, permissões, caminhos e preflight. A conta GitHub desta entrega possui push, mas não admin. A proteção remota e os segredos ainda dependem do proprietário; ver o estado da configuração.

## 6. Publicar pelo GitHub

1. Integrar o PR aprovado na main e anotar o SHA completo.
2. Abrir Actions > Publicar na Locaweb > Run workflow, selecionando main.
3. Executar mode=plan. É uma comparação offline dos commits e não escreve na hospedagem. Revisar arquivos incluídos e ignorados.
4. Na primeira publicação, usar a base de deploy/initial-production-ref. Nas seguintes, usar o SHA atualmente publicado, mostrado no resumo da execução anterior. Não chutar a base.
5. Executar mode=publish com base_sha e a URL da issue/PR que registra a autorização explícita do Plínio. A URL é referência de auditoria: a revisão humana confirma o conteúdo e o ambiente restringe quem pode publicar.
6. Aprovar o ambiente, se solicitado. Conferir o resumo e guardar o release_id.
7. Abrir o site e conferir login, tela alterada, permissões e anexos relevantes. Registrar resultado e evidências no PR ou incidente.

O envio usa apenas os arquivos alterados e revisados em deploy/allowed-paths.json. Novos caminhos entram na lista por PR. Não envia o repositório inteiro, executa SQL ou apaga diretórios. A exclusão de arquivos de runtime exige procedimento separado.

Antes da primeira publicação, é possível fazer preflight remoto sem escrita: python tools/locaweb_release.py plan --base SHA_BASE --target SHA_ALVO, com as variáveis FTPS em ambiente privado. O plano offline não prova conexão ou igualdade no servidor.

## 7. Proteções e limites da automação

A ferramenta compara os bytes de cada arquivo que pretende alterar com a versão base. Se houver hotfix no servidor, para antes de gravar. Backups e estágios são verificados fora do diretório público. Cada arquivo promovido é relido e conferido. Há apenas uma publicação por vez.

FTPS exige certificado válido e canal de controle e dados criptografados. Não recua para FTP sem TLS. Se a hospedagem não oferecer FTPS compatível, é preciso configurar outro transporte seguro antes de habilitar a automação.

O FTP não oferece troca atômica da aplicação inteira. Cada arquivo é promovido por rename, com HTML depois dos assets; pode existir mistura breve de versões. Mudanças incompatíveis de PHP/banco devem ser divididas em etapas compatíveis ou ter janela operacional autorizada. Migrações nunca são executadas automaticamente pelo deploy.

O administrador define retenção e monitora espaço dos backups. A ferramenta não apaga releases antigas automaticamente. Não colocar senhas nem dados de clientes nos logs.

## 8. Se houver divergência ou falha

Não forçar o envio nem remover a comparação. Exportar o arquivo atual, comparar e reconciliar em uma branch. Atualizar a base só depois de registrar o código real. Em falha de promoção, a ferramenta tenta restaurar os arquivos já alterados se não houver edição concorrente. Se esse retorno falhar, interromper e chamar o responsável; não prometer recuperação automática garantida.

## 9. Retornar à versão anterior

Executar o mesmo workflow com mode=rollback e o release_id da última publicação, com autorização registrada. Só a release mais recente pode ser revertida, e seus arquivos devem continuar iguais aos publicados. O retorno não mexe no banco, uploads ou configurações privadas.

Depois, conferir o site e abrir PR de revert/correção para alinhar o Git ao que está rodando. Se alguém alterou o servidor após publicar, parar e reconciliar primeiro. Não apagar registros de usuários para desfazer uma alteração visual.

## 10. Incidente extremo

Registrar impacto, autorização do Plínio, responsável, escopo, backup e plano de retorno. Só então aplicar o menor hotfix possível. Se for indispensável WebFTP ou commit direto, registrar a exceção e reconciliar no mesmo dia. Ajuste temporário de proteção é feito apenas por administrador autorizado, com restauração ao terminar e sem bypass permanente.

Não usar remote-deploy.php, chunk-deploy.php, FTP avulso ou purges no fluxo normal. Não classificar módulo como lixo apenas por um script antigo: Monitoria está ativa. A Esteira de Chamados foi ocultada, preservando registros.

## 11. Checklist de encerramento

- PR e commit identificados; testes verdes e revisão concluída.
- Autorização, base, destino e release_id registrados.
- Interface conferida em computador/celular quando aplicável.
- Nenhum erro novo de login, API ou anexo na tela alterada.
- Nenhum dado ou configuração privada no Git ou pacote.
- Cache e documentação atualizados; nenhuma divergência escondida.
- Pendências declaradas: preparado não significa ativo ou testado em produção.

## 12. Referências oficiais

Locaweb: https://www.locaweb.com.br/ajuda/wiki/deploy-automatico-como-publicar-seu-site-lovable-na-locaweb/

GitHub Actions: https://docs.github.com/en/actions/get-started/continuous-deployment

Rulesets: https://docs.github.com/en/rest/repos/rules
