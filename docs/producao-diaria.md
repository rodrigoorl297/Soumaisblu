# Produção diária

O menu **Gestão → Produção diária** abre o formulário dos vendedores ou a visão geral dos gestores.

- Campos: dia selecionado em calendário, pessoa identificada pela sessão, supervisor, boletos solicitados, propostas digitadas e contratos pagos. Quando boletos ou propostas são maiores que zero, aparecem campos opcionais de detalhes para nomes, IDs ou outras referências, com até 2000 caracteres cada. Esses detalhes constam do relatório e do detalhamento exportado.
- Boletos e propostas com quantidade zero exigem justificativas separadas. Contratos pagos não exigem justificativa.
- Somente usuários ativos com perfil `vendedor` ficam sujeitos ao preenchimento e à restrição de navegação.
- O prazo é 16h40, de segunda a sexta, no fuso `America/Sao_Paulo`. Não há calendário adicional de feriados.
- A partir do prazo, o painel permite regularizar os dias vencidos. Só libera o restante da interface depois de preencher todos eles.
- A configuração inicial começa no dia de instalação do serviço. Vendedores existentes são inscritos nessa data; novos vendedores são inscritos no primeiro acesso ao serviço.
- A regularização não altera bloqueios de leads, desligamento ou outros bloqueios já existentes no sistema.
- Em **Meus registros**, o vendedor pode editar ou excluir somente os próprios registros. A exclusão pede confirmação e mantém auditoria. Se o dia excluído já venceu, volta a ficar pendente e restringe a navegação até ser preenchido novamente. Gestores continuam com acesso de consulta no seu escopo.

## Relatório e exportação

O relatório tem filtros de mês, período, nome, pessoa, supervisor e situação. Cada coluna também oferece um filtro no cabeçalho; clicar no título alterna a ordenação crescente ou decrescente em todos os registros. Indicadores, contagem e exportação acompanham os filtros da tabela. Campos numéricos sem valor ficam ao final da ordenação. As quantidades nulas significam dia não preenchido, não produção zero justificada. O exportador gera um XLSX simples com duas abas: **Resumo geral** (totais por pessoa e supervisor, dias preenchidos e pendentes) e **Produção diária** (registros por dia, quantidades, informações ou justificativas e situação). Inclui todos os registros filtrados, não apenas a página exibida, além de período, filtros aplicados, totais, datas do Excel e cabeçalhos congelados. As informações e as justificativas de cada indicador compartilham uma coluna, com justificativas identificadas pelo prefixo. Quantidades ausentes ficam em branco. Não há botão Sair dentro desta tela; a saída normal do sistema continua no menu principal.

Master, fundador, desenvolvimento, administração, gerência, diretoria, RH e Financeiro têm visão geral. Supervisores e parceiros ficam no escopo da própria equipe ou dos registros em que são o supervisor responsável. Vendedores consultam apenas os próprios dados.

## Persistência

O serviço PHP/MySQL cria `daily_production_settings`, `daily_production_enrollments`, `daily_production_reports` e `daily_production_history`. O registro é único por usuário e dia, com auditoria de revisões e gravação transacional. O nome da pessoa e o escopo de acesso vêm do servidor. A escolha de supervisor é validada na organização do vendedor.

O formulário usa uma sessão HTTP validada no login principal do SOU+BLU e token de proteção contra alterações externas. Não existe confirmação de senha dentro da Produção diária. Se a sessão do módulo expirar, ela é reconectada automaticamente usando a chave de API e a identificação da sessão principal, conforme o contrato já usado no sistema. Não há senha ou botão de login dentro da Produção diária; o servidor verifica a chave, a conta ativa e o perfil antes de estabelecer a sessão. Esse mecanismo mantém o modelo legado de confiança da API, não representa uma nova autenticação individual criptográfica do login principal. A restrição de navegação é aplicada pelo módulo carregado com `auth.js` e verificada pelo horário do servidor ao entrar, ao voltar à aba, a cada 30 segundos e no vencimento previsto para 16h40. A API legada com chave compartilhada não foi convertida em autenticação global por usuário nesta alteração; a restrição de interface não substitui essa migração de segurança.

## Verificação

- `php tests/daily-production.test.php`: horário, dias úteis, justificativas, nomes obtidos no servidor, escopo, unicidade e reversão por falha de auditoria com PDO simulado.
- `node tests/daily-production-ui.test.cjs`: menu, formulário, justificativas, liberação dos dias pendentes, paginação e arquivo XLSX completo com servidor simulado.
- PHP e JavaScript verificados por análise de sintaxe. O acesso do serviço ao MySQL é conferido separadamente no servidor publicado antes da ativação do carregamento do módulo.

O servidor local da porta 8080 encaminha as chamadas de API para a hospedagem. Essa consulta local utiliza dados reais.

Após a confirmação do servidor, cada salvamento apresenta o aviso **Dia salvo com sucesso**, com a data registrada. Falhas de salvamento não exibem esse aviso.

A tabela usa barra de rolagem discreta e setas de navegação de colunas no rodapé, além da paginação dos registros. As setas se desativam nos limites e se ajustam ao redimensionar a tela.
