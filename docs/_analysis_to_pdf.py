# -*- coding: utf-8 -*-
import re
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, ListFlowable, HRFlowable, PageBreak, Image, KeepTogether

SRC = r"E:\new-med-crm\docs\Анализ_ТЗ_заказчика_комплексы_зерна_плевела.md"
OUT = r"E:\new-med-crm\docs\Анализ_ТЗ_заказчика_комплексы_зерна_плевела.pdf"

pdfmetrics.registerFont(TTFont("ArialC", r"C:\Windows\Fonts\arial.ttf"))
pdfmetrics.registerFont(TTFont("ArialC-Bold", r"C:\Windows\Fonts\arialbd.ttf"))
pdfmetrics.registerFont(TTFont("ArialC-Italic", r"C:\Windows\Fonts\ariali.ttf"))
pdfmetrics.registerFont(TTFont("ArialC-BoldItalic", r"C:\Windows\Fonts\arialbi.ttf"))
registerFontFamily("ArialC", normal="ArialC", bold="ArialC-Bold", italic="ArialC-Italic", boldItalic="ArialC-BoldItalic")

BLUE = colors.HexColor("#0b3d66")
GRID = colors.HexColor("#a0aec0")
HEADBG = colors.HexColor("#e8eef5")
LIGHT = colors.HexColor("#f6f8fa")

S_H1 = ParagraphStyle("h1", fontName="ArialC-Bold", fontSize=15, leading=19, textColor=BLUE, spaceAfter=8)
S_H2 = ParagraphStyle("h2", fontName="ArialC-Bold", fontSize=12, leading=15, textColor=BLUE, spaceBefore=12, spaceAfter=5)
S_P = ParagraphStyle("p", fontName="ArialC", fontSize=9.6, leading=13, textColor=colors.HexColor("#1a1a1a"), spaceAfter=4)
S_CELL = ParagraphStyle("cell", fontName="ArialC", fontSize=8.6, leading=11.5, textColor=colors.HexColor("#1a1a1a"))
S_CELLH = ParagraphStyle("cellh", fontName="ArialC-Bold", fontSize=8.8, leading=11.5, textColor=colors.HexColor("#233"), backColor=HEADBG)
S_QUOTE = ParagraphStyle("quote", parent=S_P, leftIndent=10, rightIndent=10, backColor=LIGHT, borderColor=BLUE, borderWidth=0.5, borderPadding=6, spaceBefore=4, spaceAfter=6)

def esc(t):
    return t.replace('&','&amp;').replace('<','&lt;').replace('>','&gt;')

def inline(t):
    t = esc(t)
    t = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", t)
    t = re.sub(r"`([^`]+?)`", r"<font face='ArialC' color='#333333'>\1</font>", t)
    return t

story = []
half_w = A4[0] - 3.4*cm
third_w = half_w / 3 - 2
with open(SRC, encoding='utf-8') as f:
    lines = f.read().splitlines()

i = 0
while i < len(lines):
    ln = lines[i].rstrip()
    if not ln.strip():
        i += 1; continue
    if ln.strip() == '---':
        story.append(HRFlowable(width='100%', thickness=0.5, color=colors.HexColor('#d8dee9'))); i += 1; continue
    if ln.startswith('# '):
        story.append(Paragraph(inline(ln[2:]), S_H1)); i += 1; continue
    if ln.startswith('## '):
        story.append(Paragraph(inline(ln[3:]), S_H2)); i += 1; continue
    if ln.startswith('### '):
        story.append(Paragraph(inline(ln[4:]), S_H2)); i += 1; continue
    if ln.startswith('>'):
        story.append(Paragraph(inline(ln.lstrip('>').strip()), S_QUOTE)); i += 1; continue
    if ln.startswith('|'):
        rows = []
        while i < len(lines) and lines[i].startswith('|'):
            cells = [inline(c.strip()) for c in lines[i].strip().strip('|').split('|')]
            if not all(re.fullmatch(r':?-{2,}:?', c.replace('&amp;','&')) for c in cells):
                rows.append(cells)
            i += 1
        if rows:
            # Estimate col widths by content length
            ncols = max(len(r) for r in rows)
            plain = [[re.sub(r'<[^>]+>','',c) for c in r] for r in rows]
            widths = []
            for col in range(ncols):
                m = max(len(r[col]) if col < len(r) else 0 for r in plain)
                widths.append(max(m*0.11*cm, 1.6*cm))
            # clamp to page width
            avail = A4[0] - 3.4*cm
            total = sum(widths)
            if total > avail:
                widths = [min(w, avail*0.4) for w in widths]
            data = [[Paragraph(c, S_CELLH if ri==0 else S_CELL) for c in row] for ri,row in enumerate(rows)]
            tbl = Table(data, colWidths=widths, hAlign='LEFT', repeatRows=1)
            tbl.setStyle(TableStyle([
                ('GRID',(0,0),(-1,-1),0.4,GRID),
                ('BACKGROUND',(0,0),(-1,0),HEADBG),
                ('VALIGN',(0,0),(-1,-1),'TOP'),
                ('TOPPADDING',(0,0),(-1,-1),3),('BOTTOMPADDING',(0,0),(-1,-1),3),
                ('LEFTPADDING',(0,0),(-1,-1),4),('RIGHTPADDING',(0,0),(-1,-1),4)]))
            story.append(Spacer(1,4)); story.append(tbl); story.append(Spacer(1,6))
        continue
    if ln.startswith('- '):
        items = []
        while i < len(lines) and lines[i].startswith('- '):
            items.append(Paragraph(inline(lines[i][2:]), S_P))
            i += 1
        story.append(ListFlowable(items, bulletType='bullet', start='•', leftIndent=12, bulletFontName='ArialC', bulletFontSize=7))
        continue
    if re.match(r'^\d+\.\s', ln):
        items = []
        while i < len(lines) and re.match(r'^\d+\.\s', lines[i]):
            items.append(Paragraph(inline(lines[i]), S_P))
            i += 1
        story.append(ListFlowable(items, bulletType='1', leftIndent=14, bulletFontName='ArialC', bulletFontSize=8))
        continue
    buf = [ln]
    i += 1
    while i < len(lines) and lines[i].strip() and not lines[i].startswith(('#','- ','|','>')) and lines[i].strip() != '---' and not re.match(r'^\d+\.\s', lines[i]):
        buf.append(lines[i].strip())
        i += 1
    story.append(Paragraph(inline(' '.join(buf)), S_P))

doc = SimpleDocTemplate(OUT, pagesize=A4, leftMargin=1.7*cm, rightMargin=1.7*cm, topMargin=1.5*cm, bottomMargin=1.5*cm, title='Анализ ТЗ заказчика: Комплексные услуги')
doc.build(story)
print('OK ->', OUT)