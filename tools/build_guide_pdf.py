"""Gera o guia em PDF a partir do Markdown. Requer reportlab."""
from pathlib import Path
import html
import re
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer

ROOT = Path(__file__).resolve().parents[1]
source = ROOT / "docs/ROTEIRO-REPOSITORIO-E-PUBLICACAO.md"
output = ROOT / "output/pdf/SOU-BLU-Guia-do-Repositorio.pdf"
output.parent.mkdir(parents=True, exist_ok=True)
styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="TitleBlu", fontName="Helvetica-Bold", fontSize=25, leading=29, textColor=colors.HexColor("#12345b"), spaceAfter=15))
styles.add(ParagraphStyle(name="SectionBlu", fontName="Helvetica-Bold", fontSize=13, leading=17, textColor=colors.HexColor("#12345b"), spaceBefore=15, spaceAfter=8, keepWithNext=True))
styles.add(ParagraphStyle(name="BodyBlu", fontName="Helvetica", fontSize=10, leading=15, textColor=colors.HexColor("#334960"), spaceAfter=8, alignment=TA_LEFT, splitLongWords=True))
styles.add(ParagraphStyle(name="CodeBlu", fontName="Courier", fontSize=8, leading=12, textColor=colors.HexColor("#12345b"), backColor=colors.HexColor("#f0f4f9"), borderPadding=7, spaceAfter=4))


def footer(canvas, doc):
    canvas.saveState()
    w, h = A4
    canvas.setStrokeColor(colors.HexColor("#ee823b"))
    canvas.setLineWidth(2)
    canvas.line(44, h-30, w-44, h-30)
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.HexColor("#7a8da3"))
    canvas.drawString(44, 25, "SOU+BLU | Repositorio e publicacao | 23/11/2026")
    canvas.drawRightString(w-44, 25, str(doc.page))
    canvas.restoreState()


story, code, buffer = [], False, []
def flush():
    if buffer:
        story.append(Paragraph(html.escape(" ".join(buffer)), styles["BodyBlu"]))
        buffer.clear()

for line in source.read_text(encoding="utf-8").splitlines():
    if line.startswith("```"):
        flush()
        code = not code
        continue
    if code:
        story.append(Paragraph(html.escape(line or " "), styles["CodeBlu"]))
    elif line.startswith("# "):
        flush()
        story.append(Paragraph(html.escape(line[2:]), styles["TitleBlu"]))
    elif line.startswith("## "):
        flush()
        story.append(Paragraph(html.escape(line[3:]), styles["SectionBlu"]))
    elif not line.strip():
        flush()
    elif line.startswith("- ") or re.match(r"\d+\. ", line):
        flush()
        story.append(Paragraph(html.escape(line), styles["BodyBlu"]))
    else:
        buffer.append(line)
flush()
SimpleDocTemplate(str(output), pagesize=A4, leftMargin=44, rightMargin=44, topMargin=46, bottomMargin=43, title="SOU+BLU - Roteiro do repositorio e publicacao", author="SOU+BLU").build(story, onFirstPage=footer, onLaterPages=footer)
print(output)
