# -*- coding: utf-8 -*-
"""Build a clean PDF from the TZ markdown via reportlab (NTF with Cyrillic)."""
import re
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table,
                                TableStyle, ListFlowable, ListItem, HRFlowable)

SRC = r"E:\new-med-crm\docs\ТЗ_комплексные_услуги.md"
OUT = r"E:\new-med-crm\docs\ТЗ_комплексные_услуги.pdf"

pdfmetrics.registerFont(TTFont("ArialC", r"C:\Windows\Fonts\arial.ttf"))
pdfmetrics.registerFont(TTFont("ArialC-Bold", r"C:\Windows\Fonts\arialbd.ttf"))
pdfmetrics.registerFont(TTFont("ArialC-Italic", r"C:\Windows\Fonts\ariali.ttf"))
pdfmetrics.registerFont(TTFont("ArialC-BoldItalic", r"C:\Windows\Fonts\arialbi.ttf"))
registerFontFamily("ArialC", normal="ArialC", bold="ArialC-Bold",
                   italic="ArialC-Italic", boldItalic="ArialC-BoldItalic")

BLUE = colors.HexColor("#0b3d66")
GRID = colors.HexColor("#a0aec0")
HEADBG = colors.HexColor("#e8eef5")
QBG = colors.HexColor("#f6f8fa")

def st(name, **kw):
    base = dict(fontName="ArialC", fontSize=10.5, leading=15, textColor=colors.HexColor("#1a1a1a"))
    base.update(kw)
    return ParagraphStyle(name, **base)

S_H1 = st("h1", fontName="ArialC-Bold", fontSize=16.5, leading=20, textColor=BLUE, spaceAfter=8)
S_H2 = st("h2", fontName="ArialC-Bold", fontSize=12.5, leading=16, textColor=BLUE,
          spaceBefore=14, spaceAfter=5)
S_H3 = st("h3", fontName="ArialC-Bold", fontSize=11, leading=14,
          textColor=colors.HexColor("#14334f"), spaceBefore=10, spaceAfter=4)
S_P  = st("p")
S_BULL = st("b", leftIndent=16, bulletIndent=2, spaceAfter=2)
S_Q  = st("q", textColor=colors.HexColor("#333"), backColor=QBG, borderPadding=(6, 10, 6, 10),
          spaceBefore=6, spaceAfter=6)
S_TBL = st("t", fontSize=9, leading=12)
S_TBLH = st("th", fontName="ArialC-Bold", fontSize=9, leading=12, textColor=colors.HexColor("#233"), backColor=HEADBG)

def fm(t):
    """Inline markdown -> paragraph markup."""
    t = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", t)
    t = re.sub(r"(?<!\*)\*(?!\*)(.+?)\*(?!\*)", r"<i>\1</i>", t)
    t = re.sub(r"`([^`]+?)`", r"<font face='ArialC' color='#333'>\1</font>", t)
    return t

def build_table(rows):
    cols = max(len(r) for r in rows)
    data = [[Paragraph(c) if False else c for c in r] for r in rows]
    # header row bold via first style applied per cell wrapper
    body = [[Paragraph(str(c), S_TBLH) if i == 0 else Paragraph(str(c), S_TBL) for i, c in enumerate(r)]
            for r in rows]
    t = Table(body, hAlign="LEFT")
    t.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.5, GRID),
        ("BACKGROUND", (0, 0), (-1, 0), HEADBG),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]))
    return t

def build():
    with open(SRC, encoding="utf-8") as f:
        lines = f.read().splitlines()

    doc = SimpleDocTemplate(OUT, pagesize=A4,
                            leftMargin=1.8*cm, rightMargin=1.8*cm,
                            topMargin=1.6*cm, bottomMargin=1.6*cm,
                            title="Техническое задание: Комплексные услуги")
    story = []
    i = 0
    n = len(lines)
    while i < n:
        ln = lines[i].rstrip()
        if not ln.strip():
            i += 1; continue
        if ln.startswith("|"):
            # table block
            rows = []
            while i < n and lines[i].startswith("|"):
                cells = [c.strip() for c in lines[i].strip().strip("|").split("|")]
                if not all(re.fullmatch(r":?-{2,}:?", c) for c in cells if "---" in c or "---" in ln) or rows == 0 or all(re.fullmatch(r"-{2,}", c) for c in cells):
                    rows.append(cells)
                i += 1
            # drop separator row (all d's)
            rows = [r for r in rows if not all(re.fullmatch(r"-{2,}", c.strip()) for c in r)]
            if rows:
                hdr, *body = rows
                tblrows = [ [h.replace("|","") for h in hdr] ] + body   # handle
                packed = [[Paragraph(c, S_TBLH if ri==0 else S_TBL) for c in row] for ri,row in enumerate(rows)]
                t = Table(packed, hAlign="LEFT")
                t.setStyle(TableStyle([
                    ("GRID",(0,0),(-1,-1),0.5,GRID),
                    ("BACKGROUND",(0,0),(-1,0),HEADBG),
                    ("VALIGN",(0,0),(-1,-1),"TOP"),
                    ("TOPPADDING",(0,0),(-1,-1),4),("BOTTOMPADDING",(0,0),(-1,-1),4),
                    ("LEFTPADDING",(0,0),(-1,-1),6),("RIGHTPADDING",(0,0),(-1,-1),6),
                ]))
                story.append(Spacer(1,4)); story.append(t); story.append(Spacer(1,8))
            i += 1
            continue
        if ln.startswith("# "):
            story.append(Paragraph(fm(inline(ln[2:])), S_H1)); i += 1; continue
        if ln.startswith("## "):
            story.append(Paragraph(fm(ln[3:]), S_H2)); i += 1; continue
        if ln.startswith("### "):
            story.append(Paragraph(fm(ln[4:]), S_H3)); i += 1; continue
        if ln.strip() in ("- [x]", "- [ ]") or ln.startswith("- [ ]"):
            # checkbox item
            txt = fm(ln.replace("- [ ]", "☐ ").replace("- [x]", "☑ "))
            story.append(Paragraph(txt, S_BULL)); i += 1; continue
        if ln.startswith("- "):
            # gather contiguous bullets for ListFlowable
            items = []
            while i < n and lines[i].strip().startswith("- "):
                items.append(Paragraph(fm(lines[i].strip()[2:]), S_P))
                i += 1
            story.append(ListFlowable(items, bulletType="bullet", start="•",
                                      bulletFontSize=7, leftIndent=12))
            continue
        if re.match(r"^\d+\.\s", ln):
            items = []
            while i < n and re.match(r"^\d+\.\s", lines[i].strip()):
                items.append(Paragraph(fm(lines[i].strip()), S_P))
                i += 1
            story.append(ListFlowable(items, bulletType="1", leftIndent=14))
            continue
        if ln.startswith(">"):
            story.append(Paragraph(fm(ln.lstrip(">").strip()), S_Q)); i += 1; continue
        # normal paragraph (maybe multiline)
        buf = [ln]
        while i+1 < n and lines[i+1].strip() and not lines[i+1].startswith(("# ","## ","### ","- ","|","---",">","* ")) and not re.match(r"^\d+\.\s", lines[i+1]) and lines[i+1].strip()!="- [ ]" and not lines[i+1].startswith("- ["):
            i += 1; buf.append(lines[i].strip())
        story.append(Paragraph(fm(" ".join(buf)), S_P))
        i += 1

    doc.build(story)
    print("OK ->", OUT)

def fm(t):  # inline markup
    t = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", t)
    t = re.sub(r"`([^`]+?)`", r"<font color='#333'>\1</font>", t)
    return t

def inline(t): return t.replace("|", " ")  # handle stray pipes inside plain
build()