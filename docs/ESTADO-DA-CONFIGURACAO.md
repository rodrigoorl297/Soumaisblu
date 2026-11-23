# Estado real da configuração - 23/11/2026

## Concluído no código

- Snapshot de 295 arquivos de runtime recuperados, com hashes em deploy/production-baseline.json.
- HTML/JS/CSS/assets públicos recuperados por HTTP; fonte PHP recuperada por exportação autenticada api.zip do WebFTP.
- Commit base: f77fa421ff0dd37f0be8e6fcc754e3be648a71bf. Referência em deploy/initial-production-ref.
- Regras, CODEOWNERS, template, ruleset para importação, hook local auxiliar, CI e workflow manual FTPS.
- Allowlist de 246 caminhos de runtime; manutenção, dados, uploads e configurações privadas bloqueados.
- Comparação de bytes, backup fora da raiz pública, verificação após envio e retorno da última release.

## Limites da reconciliação

Não é cópia de todo o disco. Fontes locais ausentes da produção foram preservadas como históricas e não autorizadas para publicação automática. Apache da raiz não pôde ser exportado de modo confiável: o download retornou vazio e não foi usado para sobrescrever o arquivo local. Configurações privadas não foram importadas nem alteradas. Caminhos não verificados estão no manifesto. Não afirmar igualdade integral de todo o servidor, configurações ou banco.

A fotografia é pontual e não congela edições concorrentes. O preflight FTPS confere novamente cada arquivo que será alterado. Dados de runtime antes rastreados foram retirados do índice; o servidor foi preservado. Isso não reescreve o histórico antigo do Git.

## Não ativado: depende do administrador

A conta conectada tem push, mas não admin/maintain. A consulta de administração de Actions respondeu 403. Na auditoria, main não tinha ruleset ativo e não havia ambiente de publicação. Os arquivos de política não equivalem a proteção remota instalada.

O proprietário rodrigoorl297 precisa:

1. Revisar e integrar a branch consolidada por PR, escolhendo uma única entrega, pois inclui as mudanças dos PRs anteriores.
2. Importar deploy/main-ruleset.json e conferir os checks Sintaxe e seguranca e Testes de unidade. Se o autor for o proprietário, adicionar outro revisor confiável em vez de afrouxar a regra para aprovar a si próprio.
3. Criar environment production, limitado à main, com revisor autorizado.
4. Cadastrar segredos LOCAWEB_FTP_HOST, LOCAWEB_FTP_USER e LOCAWEB_FTP_PASSWORD.
5. Cadastrar LOCAWEB_FTP_PORT, LOCAWEB_WEBROOT, LOCAWEB_BACKUP_ROOT e LOCAWEB_DEPLOY_ENABLED=false.
6. Confirmar suporte a FTPS e certificado válido, diretórios e gravação de backups fora de public_html.
7. Executar plano offline e preflight remoto sem escrita; só depois habilitar LOCAWEB_DEPLOY_ENABLED=true.
8. Fazer a primeira publicação pequena, autorizada, e conferir o site e o retorno.

Não foi feito deploy real pela nova automação. A URL de autorização é registro humano, não valida automaticamente o conteúdo da aprovação. A revisão do ambiente e as permissões do GitHub são essenciais.

## Utilitários antigos

O export contém scripts históricos de migração, publicação e limpeza. São versionados como fonte recuperada, mas ficam fora do allowlist. O inventário antigo do servidor classifica Monitoria como lixo: não executar purge com essa regra. A Monitoria foi restaurada e está ativa. Corrigir a classificação em PR próprio antes de qualquer limpeza.

## Testes antigos fora da CI

O teste leads-distribution.test.cjs espera uma API pública buildDistributionPlan que a versão recuperada da produção não expõe (ela usa _buildDistributionPlan). Ele permanece no repositório, mas não foi marcado como aprovado nem incluído entre as checagens verdes desta entrega. A reconciliação não altera regras de distribuição para satisfazer um teste de outra versão. Revalidar esse módulo em uma tarefa própria antes de alterá-lo.

## Responsáveis pela autorização

Correções extremas e publicações podem ser autorizadas pelo Plínio OU pelo Rodrigo. A autorização deve constar da issue/PR; os nomes não concedem automaticamente acesso administrativo ao GitHub. Integrar um PR depende da revisão do fluxo e pode ser feito por quem tiver permissão de merge. Ativar rulesets e o ambiente/segredos depende das permissões administrativas adequadas. As credenciais FTPS ainda não foram fornecidas/configuradas; não houve teste de conexão real.
