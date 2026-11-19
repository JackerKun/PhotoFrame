#!/usr/bin/env python3
"""Build the Chinese PDF manual from README.md (requires reportlab).

Usage: python3 scripts/build-user-guide.py [--font /path/to/chinese.ttf]
The PDF is written to docs/PhotoFrame-使用说明.pdf. Pass a Chinese-capable
TrueType font or set PHOTOFRAME_DOC_FONT on systems without Arial Unicode.
"""
import argparse
import html
import os
import re
from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import BaseDocTemplate, Frame, PageTemplate, Paragraph, Spacer, Image, Table, TableStyle, PageBreak, KeepTogether
from reportlab.platypus.tableofcontents import TableOfContents

ROOT = Path(__file__).resolve().parent.parent
FONT_CANDIDATES = ['/System/Library/Fonts/Supplemental/Arial Unicode.ttf', '/usr/share/fonts/truetype/arphic/uming.ttc']
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--font', default=os.environ.get('PHOTOFRAME_DOC_FONT'))
args = parser.parse_args()
font = args.font or next((path for path in FONT_CANDIDATES if Path(path).exists()), None)
if not font:
    parser.error('Pass --font with a Chinese-capable TrueType font.')
pdfmetrics.registerFont(TTFont('Guide', font))
pdfmetrics.registerFontFamily('Guide', normal='Guide', bold='Guide', italic='Guide', boldItalic='Guide')
INK, MUTED, GREEN, LINE = map(colors.HexColor, ['#26352f', '#6b756f', '#3d5b50', '#dce2dc'])
WIDTH, HEIGHT, MARGIN = 595.28, 841.89, 46
CONTENT_W = WIDTH - MARGIN * 2
styles = {
    'body': ParagraphStyle('Body', fontName='Guide', fontSize=10, leading=17, textColor=INK, spaceAfter=8, wordWrap='CJK'),
    'h2': ParagraphStyle('Heading2', fontName='Guide', fontSize=19, leading=27, textColor=GREEN, spaceBefore=18, spaceAfter=12, keepWithNext=True, wordWrap='CJK'),
    'h3': ParagraphStyle('Heading3', fontName='Guide', fontSize=13, leading=21, textColor=GREEN, spaceBefore=15, spaceAfter=9, keepWithNext=True, wordWrap='CJK'),
    'h4': ParagraphStyle('Heading4', fontName='Guide', fontSize=11, leading=19, textColor=GREEN, spaceBefore=12, spaceAfter=8, keepWithNext=True, wordWrap='CJK'),
    'caption': ParagraphStyle('Caption', fontName='Guide', fontSize=8, leading=13, textColor=MUTED, spaceAfter=12, alignment=TA_CENTER, wordWrap='CJK'),
    'cell': ParagraphStyle('Cell', fontName='Guide', fontSize=8.5, leading=14, textColor=INK, wordWrap='CJK'),
    'code': ParagraphStyle('Code', fontName='Guide', fontSize=8.5, leading=14, textColor=MUTED, leftIndent=12, spaceAfter=3, wordWrap='CJK'),
}

def inline(text):
    text = html.escape(text).replace('–', '-').replace('—', '-')
    text = re.sub(r'`([^`]+)`', r'<font color="#3d5b50">\1</font>', text)
    text = re.sub(r'\*\*([^*]+)\*\*', r'<b>\1</b>', text)
    text = re.sub(r'(?<!!)\[([^\]]+)\]\([^)]+\)', r'\1', text)
    return text

class GuideDoc(BaseDocTemplate):
    def afterFlowable(self, flowable):
        if isinstance(flowable, Paragraph) and flowable.style.name in ['Heading2', 'Heading3']:
            title = flowable.getPlainText()
            key = 'section-' + str(self.seq.nextf('section'))
            level = 0 if flowable.style.name == 'Heading2' else 1
            self.canv.bookmarkPage(key)
            self.canv.addOutlineEntry(title, key, level=level, closed=False)
            self.notify('TOCEntry', (level, title, self.page, key))

def page_frame(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(LINE); canvas.line(MARGIN, HEIGHT-36, WIDTH-MARGIN, HEIGHT-36)
    canvas.setFillColor(MUTED); canvas.setFont('Guide', 8)
    canvas.drawString(MARGIN, HEIGHT-26, 'PHOTOFRAME  /  使用说明')
    canvas.drawRightString(WIDTH-MARGIN, HEIGHT-26, '2026.11 更新')
    canvas.line(MARGIN, 35, WIDTH-MARGIN, 35)
    canvas.drawString(MARGIN, 22, '本地照片排版与成套交付')
    canvas.drawRightString(WIDTH-MARGIN, 22, str(doc.page))
    canvas.restoreState()

out = ROOT / 'docs/PhotoFrame-使用说明.pdf'
doc = GuideDoc(str(out), pagesize=(WIDTH,HEIGHT), title='PhotoFrame 使用说明', author='PhotoFrame', leftMargin=MARGIN, rightMargin=MARGIN, topMargin=53, bottomMargin=49)
doc.addPageTemplates(PageTemplate(id='guide', frames=[Frame(MARGIN,49,CONTENT_W,HEIGHT-102,leftPadding=0,rightPadding=0,topPadding=0,bottomPadding=0)], onPage=page_frame))
story = [Spacer(1,34), Paragraph('PhotoFrame', ParagraphStyle('Cover',fontName='Guide',fontSize=38,leading=46,textColor=GREEN)), Spacer(1,10), Paragraph('使用说明', ParagraphStyle('Subtitle',fontName='Guide',fontSize=25,leading=36,textColor=INK)), Spacer(1,16), Paragraph('胶片画幅 · 照片配色 · 字体与签名 · 联系表 · 连续多页',styles['body']),Paragraph('2026 年 11 月更新 / 包含新版作品工具',styles['body']),Spacer(1,20)]

def add_image(path, caption='', max_height=250):
    image = ROOT / path
    if not image.exists():
        raise FileNotFoundError(image)
    width, height = ImageReader(str(image)).getSize()
    scale = min(CONTENT_W/width, max_height/height)
    content = [Image(str(image), width=width*scale, height=height*scale), Spacer(1,6)]
    if caption: content.append(Paragraph(inline(caption),styles['caption']))
    story.append(KeepTogether(content))

add_image('docs/screenshots/creative-tools.webp','新版作品工具：固定导航、处理范围与功能卡片',300)
story.extend([Spacer(1,16),Paragraph('照片在本机解码、编辑和导出，无需上传原片或注册账号。',styles['body']),Paragraph('网页版：https://jackerkun.github.io/PhotoFrame/',styles['body']),PageBreak(),Paragraph('目录',ParagraphStyle('TOCTitle',parent=styles['h2']))])
toc = TableOfContents()
toc.levelStyles = [ParagraphStyle('TOC0',fontName='Guide',fontSize=11,leading=21,textColor=GREEN,spaceBefore=7),ParagraphStyle('TOC1',fontName='Guide',fontSize=9,leading=17,leftIndent=13,textColor=MUTED)]
story.extend([toc,PageBreak()])
text = (ROOT/'README.md').read_text()
text = text[text.index('## 可以做什么'):text.index('## 开发与检查')]
lines = text.splitlines(); i=0; in_code=False
while i<len(lines):
    line=lines[i].strip()
    if not line: i+=1; continue
    if line.startswith('```'):
        in_code=not in_code;i+=1;continue
    if in_code:
        story.append(Paragraph(inline(line),styles['code']));i+=1;continue
    if line.startswith('|'):
        rows=[]
        while i<len(lines) and lines[i].strip().startswith('|'):
            row=[cell.strip() for cell in lines[i].strip().strip('|').split('|')]
            if not all(re.fullmatch(r'[-: ]+',cell) for cell in row): rows.append(row)
            i+=1
        cols=len(rows[0]); widths=[CONTENT_W*.28,CONTENT_W*.72] if cols==2 else [CONTENT_W*.26,CONTENT_W*.46,CONTENT_W*.28]
        table=Table([[Paragraph(inline(cell),styles['cell']) for cell in row] for row in rows],colWidths=widths,repeatRows=1,hAlign='LEFT')
        table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#edf3ef')),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),9),('RIGHTPADDING',(0,0),(-1,-1),9),('TOPPADDING',(0,0),(-1,-1),8),('BOTTOMPADDING',(0,0),(-1,-1),8),('LINEBELOW',(0,0),(-1,-1),.4,LINE)]))
        story.extend([table,Spacer(1,12)]);continue
    if line.startswith('#### '): story.append(Paragraph(inline(line[5:]),styles['h4']))
    elif line.startswith('### '): story.append(Paragraph(inline(line[4:]),styles['h3']))
    elif line.startswith('## '):
        if line[3:] in ['界面导览','作品工具：成套设计与交付','导出与离线说明']: story.append(PageBreak())
        story.append(Paragraph(inline(line[3:]),styles['h2']))
    elif line.startswith('!['):
        match=re.match(r'!\[(.*?)\]\((.*?)\)',line)
        if match:add_image(match[2],match[1],250)
    elif line.startswith('<img '):
        src=re.search(r'src="([^"]+)"',line); alt=re.search(r'alt="([^"]+)"',line)
        if src and not src[1].endswith('creative-tools-mobile.webp'):add_image(src[1],alt[1] if alt else '',240)
    elif line.startswith('<'): pass
    else:
        # Keep numbered instructions and explanatory paragraphs in the source order.
        line=re.sub(r'^- ', '• ',line)
        if line.startswith('_') and line.endswith('_'): line=line[1:-1]
        story.append(Paragraph(inline(line),styles['body']))
    i+=1
# Keep short instructions together rather than leaving their heading or final
# steps on a separate continuation page.
keep_titles = {'快速开始', '推荐工作流', '从照片自动配色', '导入字体与保存签名',
               '选片：保留、待定与排除', '保存与打开完整工程', '生成胶卷联系表',
               '一次导出多个规格', '连续多页图文与切页导出'}
ranges = []
for start, item in enumerate(story):
    if isinstance(item, Paragraph) and item.style.name in ['Heading2', 'Heading3'] and item.getPlainText() in keep_titles:
        end = next((i for i in range(start + 1, len(story)) if isinstance(story[i], PageBreak) or (isinstance(story[i], Paragraph) and story[i].style.name in ['Heading2', 'Heading3'])), len(story))
        ranges.append((start, end))
for start, end in reversed(ranges):
    story[start:end] = [KeepTogether(story[start:end])]
doc.multiBuild(story)
print(out)
