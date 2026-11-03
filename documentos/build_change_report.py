from pathlib import Path
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

OUT = Path(__file__).parent / 'SOUmaisBLU_Relatorio_de_Alteracoes_2026-10-06.docx'
doc = Document()
section = doc.sections[0]
section.page_width = Inches(8.5)
section.page_height = Inches(11)
section.top_margin = section.bottom_margin = Inches(.65)
section.left_margin = section.right_margin = Inches(.75)
section.header_distance = section.footer_distance = Inches(.3)
normal = doc.styles['Normal']
normal.font.name = 'Calibri'
normal.font.size = Pt(11)
normal.paragraph_format.space_after = Pt(7)
normal.paragraph_format.line_spacing = 1.08
for name, size in [('Title',25),('Subtitle',12),('Heading 1',17),('Heading 2',13)]:
    style=doc.styles[name]
    style.font.name='Calibri'
    style.font.size=Pt(size)
    style.font.color.rgb=RGBColor(0,0,0)
    style.paragraph_format.space_before=Pt(12 if name.startswith('Heading') else 0)
    style.paragraph_format.space_after=Pt(7)

header=section.header.paragraphs[0]
header.text='SOU+BLU  |  Relatório de alterações'
header.runs[0].font.size=Pt(9)
header.runs[0].font.color.rgb=RGBColor(0,0,0)
footer=section.footer.paragraphs[0]
footer.alignment=2
footer.add_run('06 de outubro de 2026  •  Página ').font.size=Pt(9)
field=OxmlElement('w:fldSimple');field.set(qn('w:instr'),'PAGE');footer._p.append(field)

def p(text,style=None):
    return doc.add_paragraph(text,style)
def h(text,level=1):
    doc.add_heading(text,level)
def bullet(text):
    p(text,'List Bullet')
def page(title):
    doc.add_page_break();h(title)
def table(headers,rows,widths):
    t=doc.add_table(rows=1,cols=len(headers));t.autofit=False
    for i,w in enumerate(widths):
        t.columns[i].width=Inches(w)
    for i,v in enumerate(headers):t.rows[0].cells[i].text=v
    for values in rows:
        for cell,value in zip(t.add_row().cells,values):cell.text=value
    for ri,row in enumerate(t.rows):
        for ci,cell in enumerate(row.cells):
            cell.width=Inches(widths[ci]);cell.vertical_alignment=1
            props=cell._tc.get_or_add_tcPr()
            borders=OxmlElement('w:tcBorders')
            for side in ['top','left','bottom','right']:
                item=OxmlElement('w:'+side);item.set(qn('w:val'),'single');item.set(qn('w:sz'),'4');item.set(qn('w:color'),'D9D9D9');borders.append(item)
            props.append(borders)
            margin=OxmlElement('w:tcMar')
            for side in ['top','left','bottom','right']:
                item=OxmlElement('w:'+side);item.set(qn('w:w'),'100');item.set(qn('w:type'),'dxa');margin.append(item)
            props.append(margin)
            shade=OxmlElement('w:shd');shade.set(qn('w:fill'),'E8EDF2' if ri==0 else ('F7F9FB' if ri%2==0 else 'FFFFFF'));props.append(shade)
            for para in cell.paragraphs:
                para.paragraph_format.space_after=Pt(3)
                para.paragraph_format.line_spacing=1.02
                for run in para.runs:run.font.size=Pt(10.5);run.font.bold=ri==0;run.font.color.rgb=RGBColor(0,0,0)
            no_split=OxmlElement('w:cantSplit');row._tr.get_or_add_trPr().append(no_split)
    repeat=OxmlElement('w:tblHeader');t.rows[0]._tr.get_or_add_trPr().append(repeat)
    p('')
    return t

p('Relatório de alterações do SOU mais BLU','Title')
p('Implementações da planilha e evolução dos módulos de propostas e financeiro','Subtitle')
p('Data de referência: 06 de outubro de 2026. Projeto local: C:\\BLU\\Soumaisblu.')
p('Este documento reúne as alterações feitas durante o trabalho com a planilha VERSAO SOU MAIS BLU.xlsx. Apresenta o comportamento dos módulos, os controles de acesso, os testes executados e as etapas necessárias para colocar as novas funções em operação na Locaweb.')
p('As mudanças estão no código local. Os testes automatizados passaram, mas não houve publicação na Locaweb nem validação das novas operações em um banco MySQL real. Cálculo de comissão, emissão de boleto e crédito em saldo são operações distintas neste relatório.')
h('Situação por módulo')
table(['Módulo','Situação registrada'],[
('Propostas internas','Fluxos e campos das linhas 1 a 90 implementados no código local.'),
('Propostas de parceiros','Fluxo das linhas 92 a 131 com restrições por perfil e organização.'),
('Menus por convênio','Seleção abre as opções correspondentes de órgão ou entidade.'),
('Financeiro e comissões','Cadastros, parâmetro de IRPF e cálculo previsto da empresa implementados.'),
('Prestadores','Portal, vínculo de login, notas fiscais e fila de chamados implementados; exigem servidor MySQL.'),
('Lançamentos futuros','Rotina transacional e comando de execução implementados; agendamento na hospedagem pendente.'),
('EFI e repasse do parceiro','Emissão EFI pendente. Enquadramento e retenção do parceiro excluídos desta etapa por solicitação do usuário.')
],[2,5])
h('Escopo da planilha',2)
p('Foram considerados os fluxos de propostas, comissionamento, conta corrente, Financeiro/RH, órgãos, horários e tabelas de agosto. Os itens já existentes foram separados das funcionalidades novas; este relatório não declara que toda a planilha foi concluída em produção.')

page('Gestão de propostas internas')
p('A implementação das linhas 1 a 90 organiza a tela de gestão conforme o produto e o perfil do usuário. O preenchimento específico é preservado nos dados adicionais da proposta, sem depender de um único formulário genérico para todos os produtos.')
h('Campos e documentos por produto',2)
bullet('Compra de dívida: dados de compra, banco comprado, matrícula, senhas de acesso, servidor, convênio, contatos, videochamada e protocolos. A fase operacional inclui notificações judiciais, Núvidio e acompanhamento de pós venda.')
bullet('Consignado: CNC, NOVO, CARTÃO, SAQUE COMPL e REFIN, com matrícula, convênio, órgão e subproduto. O deflator informado pelo perfil financeiro calcula o valor de produção e o valor final.')
bullet('TIM: dados da empresa, produto, quantidade de acessos, aparelho e controles operacionais de Radar, P2B e Easy Vendas.')
bullet('OSJ: subproduto, contatos, e-mail e número da ação. C6 PJ: dados da empresa e documentos correspondentes ao produto.')
bullet('Anexos organizados por produto, incluindo identidade, contracheque, extratos, boletos, procuração, contrato social, comprovantes e faturamento, conforme o fluxo. Os documentos obrigatórios são conferidos no cadastro da proposta.')
h('Prazos e acompanhamento',2)
bullet('BACEN e Consumidor GOV: cálculo de vencimento em 10 dias a partir da data informada. Protocolos de central podem ser registrados em múltiplas entradas, com suas próprias datas e vencimentos.')
bullet('E-mail judicial e reenvio: cálculo de prazo em 72 horas. O sistema calcula a data; esta alteração não representa envio automático de e-mail nem monitoramento externo do protocolo.')
bullet('Aviso na gestão para informar no WhatsApp a situação atual da proposta. A mensagem é um lembrete ao responsável, sem envio automático pelo sistema.')
h('Perfis e integridade',2)
p('Os grupos de campos de vendedor, backoffice e financeiro respeitam o perfil da sessão e as permissões da organização. A troca de vendedor segue o escopo permitido. Propostas pagas ficam em consulta. O histórico registra autor, perfil e alterações, ocultando valores de senha no registro de auditoria.')
p('Foi acrescentada proteção para evitar que cliques rápidos em propostas diferentes exibam dados da seleção anterior no modal. Os dados adicionais e o histórico foram contemplados no ajuste de persistência e na migração de banco.')

page('Propostas de parceiros e menus por convênio')
h('Fluxo das linhas 92 a 131',2)
bullet('A identificação da proposta de parceiro considera o vínculo da proposta, o proprietário e a organização. O fluxo é acessível no painel do parceiro e nos acessos da equipe correspondente.')
bullet('A fase do vendedor inclui senha GOV e e-mail pessoal. Protocolos de BACEN e Consumidor GOV ficam na fase operacional do parceiro.')
bullet('No cadastro de compra de dívida do parceiro, o preenchimento inicial de BACEN não é obrigatório. A exigência do fluxo interno não é aplicada indistintamente ao parceiro.')
bullet('A tabela pode ser informada manualmente pelo perfil operacional autorizado. O boleto permanece sujeito ao acesso do backoffice.')
bullet('O vendedor fica restrito às próprias propostas. A gestão do parceiro segue o escopo da organização. Uma permissão apenas de visualização não libera edição.')
bullet('O fluxo reconhece propostas antigas vinculadas a parceiros e mantém o isolamento entre organizações. O modal necessário pode ser carregado no painel da equipe quando ainda não está presente.')
h('Menu correspondente ao convênio',2)
p('Ao escolher o convênio no formulário da proposta, o campo seguinte apresenta o menu de órgão ou entidade correspondente. Ao trocar o convênio, a seleção anterior é limpa. Sem convênio selecionado, o menu dependente fica oculto.')
table(['Convênio','Menu apresentado'],[
('Estadual','Órgãos estaduais e governos cadastrados.'),
('Municipal','Prefeituras e órgãos municipais cadastrados.'),
('Federal','SIAPE.'),
('INSS','INSS, aposentado, pensionista e BPC LOAS.'),
('CLT','CLT DATAPREV.')
],[1.6,5.4])
p('O cadastro de apoio foi ampliado com os governos das 27 unidades federativas e as capitais indicadas na planilha. As opções já existentes foram mantidas. Os horários de videochamada seguem a lista de intervalos informada na planilha.')
p('A alteração final é o menu dependente no formulário. O filtro de lista por convênio, desenvolvido na interpretação inicial, foi retirado após a correção do usuário.')

page('Cadastros financeiros e comissões')
h('Comissionamento e tabelas',2)
p('Foi acrescentada a seção Cadastros e parâmetros no Financeiro, com registro de banco, produto, convênio, vigência, tabela, prazo e percentual da empresa. O catálogo permite edição e importação das 73 entradas das tabelas de agosto, com percentual da empresa conforme a planilha. A importação usa identificadores estáveis para evitar repetir as mesmas entradas.')
p('O cadastro de enquadramentos reúne CNPJ, empresa, banco, tabela específica, enquadramento e retenção. Nesta etapa, o cadastro não determina automaticamente o repasse ao parceiro.')
h('Comissão prevista da empresa',2)
p('O cálculo busca uma regra compatível com o banco digitado, a tabela, o produto, o convênio ou órgão, o prazo quando informado e a vigência. A vigência cadastrada é tratada como o mês da criação da proposta. A base usa o valor final informado; na ausência dele, usa o valor da proposta.')
p('O resultado é registrado nos dados adicionais da proposta quando ela é salva pelos perfis internos autorizados. A tela de baixa financeira mostra a comissão prevista. Regras inexistentes, incompletas, inválidas ou conflitantes geram uma indicação em vez de um valor presumido.')
p('Exemplo verificado: valor final de R$ 800,00 e percentual da empresa de 18% resultam em comissão prevista de R$ 144,00. Esse cálculo não confirma recebimento do banco nem executa crédito automático. O crédito continua vinculado à baixa financeira aprovada já existente.')
p('Por orientação expressa do usuário, não foi implementado o cálculo automático de enquadramento do parceiro nem a retenção de 2%. Nenhuma base de cálculo para esses itens foi presumida.')
h('Retenção no saque e clube',2)
bullet('O percentual de IRPF dos saques de funcionários passou a ser um parâmetro persistido, com valor inicial de 1,89%. A avaliação do saque consulta o parâmetro e valida o intervalo permitido.')
bullet('A parametrização manual de parceiros permanece separada, no cadastro do parceiro.')
bullet('Despesas do clube podem ser registradas por colaborador, prestador, mês, valor e descrição. O fechamento reúne as despesas do mês por colaborador, com total e referências aos registros.')
bullet('O fechamento tem proteção contra duplicidade; despesas de um mês fechado não podem ser alteradas pelo fluxo. A situação permanece aguardando emissão EFI, porque o fechamento ainda não gera boleto.')

page('Lançamentos futuros e área do prestador')
h('Execução dos lançamentos',2)
p('A agenda permite registrar usuário, data, crédito ou débito, valor e descrição, além de editar ou cancelar um lançamento programado. O servidor valida a autorização financeira, a data, o valor e o destinatário ativo. Lançamentos já executados não podem ser alterados pelo fluxo.')
p('A rotina executa os vencidos com bloqueio do registro e do usuário no banco. Saldo, transação de extrato e situação do agendamento são gravados na mesma transação. Uma nova tentativa não repete o lançamento; se uma gravação falhar, a transação é revertida.')
p('Débitos sem saldo suficiente aguardam nova tentativa, sem desconto parcial. As carteiras de funcionários usam pontos inteiros; parceiros e prestadores podem receber valores em reais. A data de vencimento segue o horário de Brasília. A execução requer tabelas InnoDB.')
p('Há um botão para executar vencidos no Financeiro e um script de linha de comando para o agendador da hospedagem. O script não pode ser executado por uma visita pública à sua URL. A instalação dessa agenda na Locaweb continua pendente.')
h('Login e portal do prestador',2)
bullet('No cadastro de prestadores, a opção Acesso do prestador permite vincular um login ativo com perfil prestador ou criar um novo acesso com e-mail e senha inicial.')
bullet('Novas senhas de prestadores são armazenadas com hash. O login desses usuários é validado no servidor, e o encaminhamento passa a abrir a página própria do prestador.')
bullet('O portal apresenta o saldo, o extrato do próprio usuário e os pagamentos de serviços vinculados ao cadastro. Não permite escolher outro prestador para consultar.')
bullet('O prestador pode enviar notas fiscais em PDF, PNG ou JPG, de até 10 MB, vinculadas ao mês, e abrir chamados com assunto e mensagem ao Financeiro.')
bullet('A sessão e o vínculo são verificados no servidor. A conta precisa estar ativa e vinculada a um único cadastro ativo. As operações de alteração exigem o token de proteção da sessão.')
bullet('Os arquivos novos de nota fiscal ficam em diretório privado fora da pasta pública do site. O download verifica a sessão e o proprietário; o Financeiro tem acesso pelo fluxo autorizado de conferência.')
h('Conferência e cadastro de serviços',2)
p('O Financeiro recebe uma fila de notas fiscais e chamados, pode baixar a nota e registrar resposta com situação em análise, concluído ou devolvido. A resposta fica visível ao prestador. O formulário existente também recebeu o anexo de nota fiscal.')
p('Foi corrigido o salvamento de prestadores, que descartava protocolo, valor, data de pagamento, vigência, recorrência, situação e anexos. A rotina existente de recorrência recebeu verificação de perfil e identificador estável para a solicitação de pagamento.')

page('Validações e pendências de ativação')
h('Recursos existentes conferidos',2)
p('O relatório de logins do dia no RH e a vinculação de funcionários às empresas cadastradas já estavam no projeto. Foram identificados durante a revisão, sem que uma substituição desses módulos fosse necessária. O fluxo existente de parceiros para empresas não vinculadas também foi considerado no escopo.')
h('Testes executados',2)
table(['Conjunto','Verificação e resultado'],[
('Fluxos de propostas','Perfis internos e parceiros, documentos, prazos, histórico, isolamento de redes e menus dependentes. Passou.'),
('Cadastros financeiros','IRPF, despesa, fechamento, duplicidade e permissão de escrita. Passou.'),
('Comissão da empresa','Base final, vigência, prazo, convênio, produto, conflitos e ausência de retenção. Passou.'),
('Rotina de lançamentos','Execução, repetição sem duplicidade, reversão por falha, saldo insuficiente, data e autor financeiro. Passou com PDO simulado.'),
('Sessão financeira','Sessão expirada ou ausente, perfil, vínculo exclusivo, conta inativa e proteção das alterações. Passou com PDO simulado.'),
('Portal do prestador','Login obrigatório, extrato, envio de nota e chamado com proteção de sessão. Passou com respostas de servidor simuladas.')
],[2,5])
p('Também foram executadas verificações de sintaxe PHP e JavaScript nos módulos alterados. Esses resultados verificam o comportamento programado, mas não substituem testes no banco e nos serviços da hospedagem.')
h('O que ainda precisa ser feito',2)
bullet('Publicar os arquivos alterados e configurar o banco MySQL do servidor. O ambiente local consultado não tem config.db.local.php nem driver PDO de banco habilitado no PHP.')
bullet('Validar as migrações e o funcionamento com o banco real, incluindo sessões, novos cadastros, notas fiscais, pagamentos vinculados e lançamentos simultâneos.')
bullet('Garantir permissão de escrita no diretório privado de notas fiscais e configurar FINANCE_PRIVATE_DIR quando o caminho padrão fora da pasta pública não puder ser usado.')
bullet('Ativar no agendador da hospedagem o comando PHP do script api/finance-schedule-cron.php. Sem essa configuração, a execução automática não fica ativa; resta o botão manual autorizado.')
bullet('Configurar a integração de cobrança EFI para emissão de boletos. A emissão de termos e notas promissórias, a consulta externa de margem e o envio automático por WhatsApp continuam fora do que foi concluído.')

page('Referência dos arquivos alterados')
p('Os caminhos abaixo são relativos à pasta C:\\BLU\\Soumaisblu. O objetivo é identificar os arquivos para manutenção e publicação; não é uma lista de arquivos já enviados à hospedagem.')
h('Propostas e telas',2)
p('js/proposal-workflow.js; js/proposals.js; js/masterProposal.js; admin.html; pages/admin.html; employee.html; pages/employee.html; pages/financeiro.html.')
p('Incluem formulários por produto, permissões, dados adicionais, parceiros, anexos, prazos e menus por convênio, além do carregamento dos módulos nas telas.')
h('Financeiro e login',2)
p('js/db.js; js/auth.js; js/withdrawal-rules.js; js/finance-workbook.js; js/financeiro-boot.js; js/financeiro-propostas.js; js/prestador-servicos.js; js/commission-engine.js; js/commission-seed.json; index.html; .gitignore.')
p('Incluem persistência de cadastros, consulta de IRPF, cálculo da empresa, agenda financeira, acesso de prestadores e atualização das referências de scripts. O arquivo de tabelas passou a ser incluído no controle de arquivos do projeto.')
h('Portal e acesso no servidor',2)
p('pages/prestador.html; css/provider-portal.css; js/provider-portal.js; js/finance-access.js; api/finance.php; api/finance-schedule-cron.php; api/lib/FinanceSession.php; api/lib/FinanceSchedule.php.')
p('Incluem a página do prestador, sessão validada no servidor, notas fiscais, chamados, criação e vínculo de login e execução dos agendamentos.')
h('Banco de dados',2)
p('api/rest/index.php; api/lib/PostgRestCompat.php; api/lib/ProposalMysqlSchema.php; api/lib/FinanceWorkbookMysqlSchema.php; supabase/migrations/20261006_proposal_workflow_meta.sql; supabase/migrations/20261006_finance_workbook.sql.')
p('Os ajustes contemplam dados adicionais de propostas, registros financeiros, campos de prestadores, vínculo de usuário e metadados de extrato. As novas operações autenticadas e a rotina de execução foram desenvolvidas para o backend PHP com MySQL; as migrações Supabase não demonstram funcionamento desses serviços sem esse backend.')
h('Testes incluídos',2)
p('tests/proposal-workflow.test.cjs; tests/finance-workbook.test.cjs; tests/commission-engine.test.cjs; tests/finance-schedule.test.php; tests/finance-session.test.php; tests/provider-portal.test.cjs.')
p('O teste do filtro de lista por convênio foi retirado junto com aquela interpretação da solicitação. A cobertura atual testa o menu dependente correspondente ao convênio.')

doc.save(OUT)
print(OUT)
