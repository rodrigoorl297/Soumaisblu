from pathlib import Path
from xml.sax.saxutils import escape
from docx import Document
from docx.text.paragraph import Paragraph as WordParagraph
from docx.table import Table as WordTable
from docx.oxml.ns import qn
from reportlab.platypus import SimpleDocTemplate,Paragraph,Spacer,Table,TableStyle,PageBreak
from reportlab.lib.styles import getSampleStyleSheet,ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import pypdfium2 as pdfium
folder=Path(r'C:\BLU\Soumaisblu\documentos')
source=folder/'SOUmaisBLU_Relatorio_de_Alteracoes_2026-10-06.docx'
out=source.with_suffix('.pdf')
pdfmetrics.registerFont(TTFont('Report',r'C:\Windows\Fonts\arial.ttf'))
pdfmetrics.registerFont(TTFont('ReportBold',r'C:\Windows\Fonts\arialbd.ttf'))
styles=getSampleStyleSheet()
styles.add(ParagraphStyle('Report',fontName='Report',fontSize=10.5,leading=14.2,spaceAfter=7))
styles.add(ParagraphStyle('ReportTitle',fontName='ReportBold',fontSize=23,leading=28,spaceAfter=12))
styles.add(ParagraphStyle('ReportSubtitle',fontName='Report',fontSize=12,leading=16,spaceAfter=12))
styles.add(ParagraphStyle('ReportH1',fontName='ReportBold',fontSize=16,leading=20,spaceAfter=10,spaceBefore=10,keepWithNext=True))
styles.add(ParagraphStyle('ReportH2',fontName='ReportBold',fontSize=12,leading=16,spaceAfter=7,spaceBefore=10,keepWithNext=True))
styles.add(ParagraphStyle('ReportBullet',parent=styles['Report'],leftIndent=12,firstLineIndent=-8))
styles.add(ParagraphStyle('Cell',fontName='Report',fontSize=10,leading=13))
styles.add(ParagraphStyle('CellHead',parent=styles['Cell'],fontName='ReportBold'))
doc=Document(source);story=[]
for item in doc.element.body:
 if item.tag==qn('w:p'):
  p=WordParagraph(item,doc)
  if item.xpath('.//w:br[@w:type="page"]'):
   story.append(PageBreak());continue
  if not p.text.strip():continue
  style={'Title':'ReportTitle','Subtitle':'ReportSubtitle','Heading 1':'ReportH1','Heading 2':'ReportH2','List Bullet':'ReportBullet'}.get(p.style.name,'Report')
  text=escape(p.text)
  if p.style.name=='List Bullet':text='• '+text
  story.append(Paragraph(text,styles[style]))
 elif item.tag==qn('w:tbl'):
  t=WordTable(item,doc);data=[[Paragraph(escape(c.text),styles['CellHead' if i==0 else 'Cell']) for c in row.cells] for i,row in enumerate(t.rows)]
  first=145 if 'Situação' in t.rows[0].cells[1].text else (115 if t.rows[0].cells[0].text=='Convênio' else 145)
  table=Table(data,colWidths=[first,504-first],repeatRows=1,hAlign='LEFT')
  table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#E8EDF2')),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,colors.HexColor('#F7F9FB')]),('GRID',(0,0),(-1,-1),.4,colors.HexColor('#D9D9D9')),('VALIGN',(0,0),(-1,-1),'MIDDLE'),('LEFTPADDING',(0,0),(-1,-1),9),('RIGHTPADDING',(0,0),(-1,-1),9),('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7)]));story.extend([table,Spacer(1,10)])
def header(canvas,document):
 canvas.setFont('Report',8);canvas.drawString(54,765,'SOU+BLU  |  Relatório de alterações');canvas.drawRightString(558,23,f'06 de outubro de 2026  •  Página {document.page}')
SimpleDocTemplate(str(out),pagesize=letter,leftMargin=54,rightMargin=54,topMargin=47,bottomMargin=43,title='Relatório de alterações do SOU mais BLU',author='SOU mais BLU').build(story,onFirstPage=header,onLaterPages=header)
qa=folder/'qa_pdf';qa.mkdir(exist_ok=True)
pdf=pdfium.PdfDocument(str(out))
for i,page in enumerate(pdf):page.render(scale=1.7).to_pil().save(qa/f'page-{i+1}.png')
print(f'{out} | {len(pdf)} páginas')
