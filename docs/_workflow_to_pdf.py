# -*- coding: utf-8 -*-
import re
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, ListFlowable, HRFlowable, PageBreak, Image

SRC = r"E:\new-med-crm\docs\ТЗ_комплексные_услуги_workflow.md"
OUT = r"E:\new-med-crm\docs\ТЗ_комплексные_услуги_workflow.pdf"
SCREENSHOT = r"C:\Users\alex\AppData\Local\hermes\cache\images\img_6226d6a33bcd.jpg"

pdfmetrics.registerFont(TTFont("ArialC", r"C:\Windows\Fonts\arial.ttf"))
pdfmetrics.registerFont(TTFont("ArialC-Bold", r"C:\Windows\Fonts\arialbd.ttf"))
pdfmetrics.registerFont(TTFont("ArialC-Italic", r"C:\Windows\Fonts\ariali.ttf"))
pdfmetrics.registerFont(TTFont("ArialC-BoldItalic", r"C:\Windows\Fonts\arialbi.ttf"))
registerFontFamily("ArialC", normal="ArialC", bold="ArialC-Bold", italic="ArialC-Italic", boldItalic="ArialC-BoldItalic")

BLUE = colors.HexColor("#0b3d66")
GRID = colors.HexColor("#a0aec0")
HEADBG = colors.HexColor("#e8eef5")
LIGHT = colors.HexColor("#f6f8fa")

S_H1 = ParagraphStyle("h1", fontName="ArialC-Bold", fontSize=16, leading=20, textColor=BLUE, spaceAfter=8)
S_H2 = ParagraphStyle("h2", fontName="ArialC-Bold", fontSize=12.5, leading=16, textColor=BLUE, spaceBefore=12, spaceAfter=5)
S_H3 = ParagraphStyle("h3", fontName="ArialC-Bold", fontSize=11, leading=14, textColor=colors.HexColor("#14344f"), spaceBefore=9, spaceAfter=4)
S_P = ParagraphStyle("p", fontName="ArialC", fontSize=9.8, leading=13.5, textColor=colors.HexColor("#1a1a1a"), spaceAfter=4)
S_META = ParagraphStyle("meta", fontName="ArialC", fontSize=9, leading=12, textColor=colors.HexColor("#555"), spaceAfter=2)
S_CODE = ParagraphStyle("code", fontName="ArialC", fontSize=9.2, leading=12.5, leftIndent=10, rightIndent=10, backColor=LIGHT, borderColor=colors.HexColor("#d0d7de"), borderWidth=0.3, borderPadding=6, spaceBefore=4, spaceAfter=6)
S_QUOTE = ParagraphStyle("quote", parent=S_P, leftIndent=10, rightIndent=10, backColor=LIGHT, borderColor=BLUE, borderWidth=0.5, borderPadding=6, spaceBefore=4, spaceAfter=6)

def esc(t):
    return (t.replace('&','&amp;').replace('<','&lt;').replace('>','&gt;'))

def inline(t):
    t = esc(t)
    t = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", t)
    t = re.sub(r"`([^`]+?)`", r"<font color='#333333'>\1</font>", t)
    return t

story = []
with open(SRC, encoding='utf-8') as f:
    lines = f.read().splitlines()

i = 0
while i < len(lines):
    ln = lines[i].rstrip()
    if not ln.strip():
        i += 1
        continue
    if ln.strip() == '---':
        story.append(Spacer(1, 4))
        story.append(HRFlowable(width='100%', thickness=0.6, color=colors.HexColor('#d8dee9')))
        story.append(Spacer(1, 5))
        i += 1
        continue
    if ln.startswith('# '):
        story.append(Paragraph(inline(ln[2:]), S_H1)); i += 1; continue
    if ln.startswith('## '):
        story.append(Paragraph(inline(ln[3:]), S_H2)); i += 1; continue
    if ln.startswith('### '):
        story.append(Paragraph(inline(ln[4:]), S_H3)); i += 1; continue
    m_img = re.match(r'^!\[(.*?)\]\((.*?)\)$', ln)
    if m_img:
        caption, img_path = m_img.group(1), m_img.group(2)
        story.append(Spacer(1, 5))
        max_w = A4[0] - 3.4*cm
        img = Image(img_path, width=max_w, height=max_w * 792 / 953)
        story.append(img)
        story.append(Paragraph(f"<i>{inline(caption)}</i>", S_META))
        story.append(Spacer(1, 8))
        i += 1
        continue
    if ln.startswith('```'):
        i += 1
        buf = []
        while i < len(lines) and not lines[i].startswith('```'):
            buf.append(lines[i])
            i += 1
        i += 1
        story.append(Paragraph('<br/>'.join(esc(x) for x in buf), S_CODE))
        continue
    if ln.startswith('|'):
        rows = []
        while i < len(lines) and lines[i].startswith('|'):
            cells = [inline(c.strip()) for c in lines[i].strip().strip('|').split('|')]
            if not all(re.fullmatch(r':?-{2,}:?', c.replace('&amp;','&')) for c in cells):
                rows.append(cells)
            i += 1
        if rows:
            data = [[Paragraph(c, S_P) for c in row] for row in rows]
            tbl = Table(data, hAlign='LEFT')
            tbl.setStyle(TableStyle([
                ('GRID',(0,0),(-1,-1),0.4,GRID),('BACKGROUND',(0,0),(-1,0),HEADBG),
                ('FONTNAME',(0,0),(-1,0),'ArialC-Bold'),('VALIGN',(0,0),(-1,-1),'TOP'),
                ('TOPPADDING',(0,0),(-1,-1),4),('BOTTOMPADDING',(0,0),(-1,-1),4),
                ('LEFTPADDING',(0,0),(-1,-1),5),('RIGHTPADDING',(0,0),(-1,-1),5)]))
            story.append(tbl); story.append(Spacer(1,6))
        continue
    if ln.startswith('>'):
        story.append(Paragraph(inline(ln.lstrip('>').strip()), S_QUOTE)); i += 1; continue
    if ln.startswith('- '):
        items = []
        while i < len(lines) and lines[i].startswith('- '):
            items.append(Paragraph(inline(lines[i][2:]), S_P))
            i += 1
        story.append(ListFlowable(items, bulletType='bullet', start='•', leftIndent=13, bulletFontName='ArialC', bulletFontSize=7))
        continue
    if re.match(r'^\d+\.\s', ln):
        items = []
        while i < len(lines) and re.match(r'^\d+\.\s', lines[i]):
            items.append(Paragraph(inline(lines[i]), S_P))
            i += 1
        story.append(ListFlowable(items, bulletType='1', leftIndent=15, bulletFontName='ArialC', bulletFontSize=8))
        continue
    buf = [ln]
    i += 1
    while i < len(lines) and lines[i].strip() and not lines[i].startswith(('#','- ','|','>','```')) and lines[i].strip() != '---' and not re.match(r'^\d+\.\s', lines[i]):
        buf.append(lines[i].strip())
        i += 1
    style = S_META if any(x in ' '.join(buf) for x in ['Версия:', 'Статус:', 'Решение по учёту:']) else S_P
    story.append(Paragraph(inline(' '.join(buf)), style))

doc = SimpleDocTemplate(OUT, pagesize=A4, leftMargin=1.7*cm, rightMargin=1.7*cm, topMargin=1.5*cm, bottomMargin=1.5*cm, title='ТЗ: Комплексные услуги в MedCRM')
doc.build(story)
print('OK ->', OUT)
