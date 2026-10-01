#!/usr/bin/env python3
"""生成「MOD-WATCH 零件信息表」模板 —— 厂家填好，我按表导入。

    python tools/make_intake_template.py [输出路径]

四张表：怎么填 / 表壳清单 / 零件清单 / 兼容对照。
示例行取自当前 data.json 的真实条目，照着填即可（示例行请删掉或就地改写）。
"""
import json, os, sys
from collections import OrderedDict

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.utils import get_column_letter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser('~/Downloads/MOD-WATCH 零件信息表.xlsx')

FONT = 'PingFang SC'
BLUE = '1F63D6'
BLUE_DIM = '1749A0'
HEAD_FILL = PatternFill('solid', fgColor=BLUE)
NOTE_FILL = PatternFill('solid', fgColor='F2F5FB')
SAMPLE_FILL = PatternFill('solid', fgColor='F6F6F6')
BAND_FILL = PatternFill('solid', fgColor='FAFAFA')
REQ_FONT = Font(name=FONT, size=11, bold=True, color='FFFFFF')
CELL_FONT = Font(name=FONT, size=11)
SAMPLE_FONT = Font(name=FONT, size=11, color='8A8A8A')
TITLE_FONT = Font(name=FONT, size=16, bold=True, color='111111')
BODY_FONT = Font(name=FONT, size=11.5, color='333333')
NOTE_FONT = Font(name=FONT, size=10.5, color='666666')
THIN = Side(style='thin', color='DCDCDC')
BORDER = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)

d = json.load(open(os.path.join(ROOT, 'data.json')))
PARTS = d['parts']
CASES = d['caseSeries']
SERIES = list(OrderedDict.fromkeys(c['category'] for c in CASES))
CATEGORIES = ['表壳', '表圈', '内影圈', '插入', '表镜', '字面', '表针', '表冠', '后盖', '表带']
MATERIALS = ['Steel', 'Steel / PVD', 'Ceramic', 'Aluminum', 'Titanium', 'Sapphire', 'Brass', 'Nylon / Fabric', 'Leather', 'Rubber', 'Other']
COLORS = ['银色', '亮银', '哑光银', '黑色', '亮黑', '哑光黑', '金色', '玫瑰金', '哑光金', '蓝色', '绿色', '红色', '橙色', '黄色', '白色', '灰色', '钛色']


def style_header(ws, headers, widths=None, freeze='A2'):
    for i, h in enumerate(headers, start=1):
        c = ws.cell(row=1, column=i, value=h)
        c.font = REQ_FONT
        c.fill = HEAD_FILL
        c.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
        c.border = BORDER
    ws.row_dimensions[1].height = 30
    if widths:
        for i, w in enumerate(widths, start=1):
            ws.column_dimensions[get_column_letter(i)].width = w
    ws.freeze_panes = freeze


def write_row(ws, row, values, sample=False):
    for i, v in enumerate(values, start=1):
        c = ws.cell(row=row, column=i, value=v)
        c.font = SAMPLE_FONT if sample else CELL_FONT
        c.alignment = Alignment(vertical='top', wrap_text=True)
        c.border = BORDER
        if sample:
            c.fill = SAMPLE_FILL
    return row + 1


def add_validation(ws, col_letter, options, rows='2:400'):
    dv = DataValidation(type='list', formula1='"%s"' % ','.join(options), allow_blank=True, showDropDown=False)
    ws.add_data_validation(dv)
    dv.add('%s%s:%s%s' % (col_letter, rows.split(':')[0], col_letter, rows.split(':')[1]))


wb = Workbook()

# ============================ ① 怎么填 ============================
ws = wb.active
ws.title = '① 怎么填'
ws.column_dimensions['A'].width = 4
ws.column_dimensions['B'].width = 26
ws.column_dimensions['C'].width = 96
ws.sheet_view.showGridLines = False

rows = [
    ('title', 'MOD-WATCH 零件信息表 · 填写说明'),
    ('gap', ''),
    ('h', '一、这套表怎么用'),
    ('p', '共 4 张表：本页 = 说明；「② 表壳清单」= 每个表壳一行（含规格）；「③ 零件清单」= 表壳以外的 9 类零件，'
          '每行一个；「④ 兼容对照」= 每个表壳系列一行，写清这个系列能用哪些零件。'),
    ('p', '灰底的几行是**示例**（取自网站现有数据），照着它的格式往下填即可；示例行可以删掉或直接改写。'),
    ('gap', ''),
    ('h', '二、最关键的一件事：编号 = 图片文件名'),
    ('p', '每个零件的「编号」就是工厂型号，同时也是它的图片文件名。我按编号自动把图片对上号，所以：'),
    ('p', '   · 图片文件名为  编号.png       例：B-C-1.png、D1019.png、WC-E-2.png'),
    ('p', '   · 表壳要三个视角时：正视图 编号.png、侧视图 编号-侧.png、背视图 编号-背.png'),
    ('p', '   · 没有编号的零件（光面表圈、表带这类）编号一栏写「—」，图片用中文名命名，例：橄榄绿 NATO 带.png'),
    ('p', '   · 图片放一个文件夹里，和这张表一起打包发我即可（PNG / JPG / PSD 都行）'),
    ('p', '   · 图片不必自己裁切或居中 —— 尺寸、透明底、居中、缩略图我这边统一处理'),
    ('gap', ''),
    ('h', '三、填表的三个要点'),
    ('p', '1. 带 * 的列必填；其余不清楚可以留空（尺寸、内径这类我会从图片里量）。'),
    ('p', '2. 「参数」一列按零件类别填写内容，格式见「③ 零件清单」表头下方的灰字提示。'),
    ('p', '3. 要修改网站上已有的零件：编号照原样填，备注里写「修改」（我会更新而不是新增）。'),
    ('gap', ''),
    ('h', '四、我拿到表之后会做什么'),
    ('p', '① 图片批量导入并按开孔居中（残差 ≤1px）→ 生成卡片缩略图；② 写进网站数据并跑一次体检'
          '（查缺图、编号重复、装不上的组合）；③ 本地与线上各验证一遍再上线；④ 给你一份「改了什么」的清单。'),
    ('gap', ''),
    ('h', '五、编号的写法约定（和网站现有零件保持一致）'),
    ('p', '表壳 SKX-B-1 · 表圈 B-C-1 · 内影圈 CR-H-1 · 插入 D-GMT-11 / SUB-13 · 表镜 SJG02C · '
          '字面 D1019 · 表针 H-11 · 表冠 WC-E-2 · 后盖 CB-B-1 · 表带（无编号）'),
    ('gap', ''),
    ('h', '六、这张表可以留空的地方'),
    ('p', '· 表壳的「表镜类型/机芯」这类参数，不确定就留空；\n'
          '· 「④ 兼容对照」如果没变化，整张表留空即可（我沿用现在的配置）。'),
]
r = 1
for kind, text in rows:
    if kind == 'title':
        ws.cell(row=r, column=2, value=text).font = TITLE_FONT
        ws.merge_cells(start_row=r, start_column=2, end_row=r, end_column=3)
    elif kind == 'h':
        c = ws.cell(row=r, column=2, value=text)
        c.font = Font(name=FONT, size=12.5, bold=True, color=BLUE_DIM)
        ws.merge_cells(start_row=r, start_column=2, end_row=r, end_column=3)
    elif kind == 'p':
        c = ws.cell(row=r, column=3, value=text.replace('**', ''))
        c.font = BODY_FONT
        c.alignment = Alignment(wrap_text=True, vertical='top')
        ws.row_dimensions[r].height = max(18, 16 * (1 + len(text) // 62))
    else:
        ws.row_dimensions[r].height = 10
    r += 1

# ============================ ② 表壳清单 ============================
ws = wb.create_sheet('② 表壳清单')
head = ['编号 *', '中文名称 *', '英文名称', '系列 *', '不支持的步骤', '表壳直径', '表耳间距\n(lug to lug)',
        '表耳宽度\n(lug width)', '厚度', '防水', '机芯', '中文说明', '英文说明', '备注']
style_header(ws, head, [12, 30, 30, 15, 20, 11, 12, 12, 10, 10, 13, 46, 46, 18])
add_validation(ws, 'D', SERIES)
# 表头下方一行提示
hints = ['图片文件名', '例：SKX 3.8 表壳 SKX-B-1 哑光 银色壳', '例：SKX 3.8 Case SKX-B-1', '下拉选择',
         '这个表壳装不了哪些零件？\n填：内影圈 / 插入 / 表镜 / 表冠…\n留空 = 都能装',
         '例：38mm', '例：45mm', '例：20mm', '例：11.5mm', '例：50m', '例：NH35 / NH36',
         '面向客户的一句话介绍', '英文版', '要改现有零件就写「修改」']
r = 2
for i, h in enumerate(hints, start=1):
    c = ws.cell(row=r, column=i, value=h)
    c.font = NOTE_FONT
    c.fill = NOTE_FILL
    c.alignment = Alignment(vertical='center', wrap_text=True)
ws.row_dimensions[r].height = 26
r = 3
for c in CASES[:3]:
    unsupported = [label for key, label in [('chapterRing', '内影圈'), ('insert', '插入'), ('crystal', '表镜')]
                   if not c['compatibleParts'].get(key)]
    r = write_row(ws, r, [c.get('code') or '—', c.get('nameZh'), c.get('name'), c.get('category'),
                          '、'.join(unsupported) or '—',
                          c.get('size'), c.get('lugToLug'), c.get('lugWidth'), c.get('thickness'),
                          c.get('waterResistance'), c.get('movement'), c.get('description'),
                          c.get('descriptionEn'), '示例'], sample=True)
r += 40

# ============================ ③ 零件清单 ============================
ws = wb.create_sheet('③ 零件清单')
head = ['类别 *', '编号 *', '中文名称 *', '英文名称', '颜色', '材质', '中文说明', '英文说明', '参数', '备注']
style_header(ws, head, [11, 14, 34, 32, 12, 15, 46, 46, 30, 16])
add_validation(ws, 'A', CATEGORIES)
add_validation(ws, 'F', MATERIALS)
add_validation(ws, 'E', COLORS)
hints = ['下拉选择', '图片文件名', '例：表圈 B-C-1（哑光 LX 银色）', '例：Bezel B-C-1 (Matte LX Silver)',
         '下拉或自己填', '下拉或自己填', '面向客户的一句话介绍', '英文版',
         '插入：斜面 / 平面　表镜：涂层=蓝色；配=平面插入　字面：尺寸档=d207　'
         '表针：三针（时/分/秒）　表冠：专属=Classic Retro　内影圈：刻度带=有/无　后盖：类型=透底/光面', '要改现有零件就写「修改」']
r = 2
for i, h in enumerate(hints, start=1):
    c = ws.cell(row=r, column=i, value=h)
    c.font = NOTE_FONT
    c.fill = NOTE_FILL
    c.alignment = Alignment(vertical='top', wrap_text=True)
ws.row_dimensions[r].height = 44

samples = [
    ('表圈', 'B-C-1', PARTS['bezel']),
    ('内影圈', 'CR-H-1', PARTS['chapterRing']),
    ('插入', 'SUB-13', PARTS['insert']),
    ('表镜', 'SJG06B', PARTS['crystal']),
    ('字面', 'D1019', PARTS['dial']),
    ('表针', 'H-11', PARTS['hands']),
    ('表冠', 'WC-E-2', PARTS['crown']),
    ('后盖', 'CB-B-1', PARTS['caseback']),
]
COLOR_WORDS = ['玫瑰金', '亮银', '哑光银', '银色', '亮黑', '哑光黑', '黑色', '金色', '哑光金',
               '蓝色', '绿色', '红色', '橙色', '黄色', '白色', '灰色']


def colour_of(part):
    text = (part.get('nameZh') or '') + (part.get('description') or '')
    for w in COLOR_WORDS:
        if w in text:
            return w
    return ''


r = 3
for label, code, pool in samples:
    p = next((x for x in pool if (x.get('code') or '') == code), None) or pool[0]
    r = write_row(ws, r, [label, p.get('code') or '—', p.get('nameZh'), p.get('name'), colour_of(p),
                          p.get('material'), p.get('description'), p.get('descriptionEn'), '', '示例'], sample=True)
st = next(x for x in PARTS['strap'] if 'NATO' in x['name'] and '橄榄' in (x.get('nameZh') or ''))
r = write_row(ws, r, ['表带', '—', st.get('nameZh'), st.get('name'), '绿色', 'Nylon / Fabric', '', '', '', '示例'], sample=True)
r += 60

# ============================ ④ 兼容对照 ============================
ws = wb.create_sheet('④ 兼容对照')
head = ['系列 *', '可用表圈', '可用内影圈', '可用表镜', '可用插入', '可用字面', '可用表针', '可用表冠', '可用后盖', '可用表带', '备注']
style_header(ws, head, [20, 30, 30, 30, 30, 26, 20, 30, 24, 20, 22])
hints = ['每个表壳系列一行（已填好，不用动）',
         '不填 = 沿用现在的', '不填 = 沿用现在的', '不填 = 沿用现在的', '不填 = 沿用现在的', '不填 = 沿用现在的',
         '不填 = 沿用现在的', '不填 = 沿用现在的', '不填 = 沿用现在的', '不填 = 沿用现在的',
         '写「全部斜面 / 全部平面 / 全部」也可以']
r = 2
for i, h in enumerate(hints, start=1):
    c = ws.cell(row=r, column=i, value=h)
    c.font = NOTE_FONT
    c.fill = NOTE_FILL
    c.alignment = Alignment(vertical='center', wrap_text=True)
ws.row_dimensions[r].height = 30

r = 3
for s in SERIES:
    cs = [c for c in CASES if c['category'] == s]
    def codes(ptype, limit=6):
        ids = OrderedDict()
        for c in cs:
            for i in c['compatibleParts'].get(ptype, []):
                ids[i] = None
        pool = {p['id']: p for p in PARTS.get(ptype, [])}

        def label_of(i):
            p = pool.get(i)
            return (p.get('code') or p.get('nameZh') or i) if p else i
        out = [label_of(i) for i in ids]
        if not out:
            return '（这个系列没有这一步）'
        if ptype == 'insert' and len(out) > 12:
            forms = {pool[i].get('insertType') for i in ids if i in pool}
            return '共 %d 个，全部%s' % (len(out), '斜面' if forms == {'sloped'} else '平面' if forms == {'flat'} else '（斜面 + 平面）')
        return '共 %d 个：' % len(out) + '、'.join(out[:limit]) + ('…' if len(out) > limit else '')
    ws.cell(row=r, column=1, value=s).font = Font(name=FONT, size=11, bold=True)
    ws.cell(row=r, column=1).border = BORDER
    for i, t in enumerate(['bezel', 'chapterRing', 'crystal', 'insert', 'dial', 'hands', 'crown', 'caseback', 'strap'], start=2):
        c = ws.cell(row=r, column=i, value=codes(t))
        c.font = CELL_FONT
        c.alignment = Alignment(vertical='top', wrap_text=True)
        c.border = BORDER
    ws.cell(row=r, column=11).border = BORDER
    ws.row_dimensions[r].height = 28
    r += 1
r += 20

# ============================ ⑤ 现有零件一览（只读参考）============================
ws = wb.create_sheet('⑤ 现有零件一览')
head = ['类别', '编号', '中文名称', '英文名称', '颜色', '材质', '中文说明', '适配系列（现在）', '图片', '状态']
style_header(ws, head, [11, 14, 36, 34, 12, 22, 52, 40, 30, 12])
c = ws.cell(row=2, column=1, value='下面是从网站上导出的现有零件，**仅供参考，不用在这里改**；'
                                   '要新增或修改请填「② 表壳清单」「③ 零件清单」。'
                                   '「状态」列标出我这边看到的缺口（缺编号 / 缺图），方便你优先补这些。'
                                   '编号写「—」的是网站上还没有型号的条目（表带、部分后盖/表圈）——'
                                   '如果你那边有型号，填上它这个零件就能在「我的配置」里按编号搜到。')
c.font = NOTE_FONT
c.fill = NOTE_FILL
c.alignment = Alignment(vertical='center', wrap_text=True)
ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=len(head))
ws.row_dimensions[2].height = 32

OWNER_LABEL = {}
for cs_ in CASES:
    for ptype, ids in cs_['compatibleParts'].items():
        for i in ids:
            OWNER_LABEL.setdefault((ptype, i), []).append(cs_['category'])


def owners(ptype, pid):
    fams = list(OrderedDict.fromkeys(OWNER_LABEL.get((ptype, pid), [])))
    if not fams:
        return '—'
    if len(fams) == 1:
        return fams[0]
    return '共 %d 个系列：' % len(fams) + '、'.join(fams[:4]) + ('…' if len(fams) > 4 else '')


LABEL_BY_TYPE = {'case': '表壳', 'bezel': '表圈', 'chapterRing': '内影圈', 'insert': '插入', 'crystal': '表镜',
                 'dial': '字面', 'hands': '表针', 'crown': '表冠', 'caseback': '后盖', 'strap': '表带'}

r = 3
for c_ in CASES:
    front = (c_.get('views') or {}).get('front') or ''
    img_ok = bool(front) and os.path.exists(os.path.join(ROOT, front))
    state = []
    if not c_.get('code') or c_.get('code') == 'FRONT':
        state.append('缺编号')
    if not img_ok:
        state.append('缺图')
    r = write_row(ws, r, ['表壳', c_.get('code') or '—', c_.get('nameZh'), c_.get('name'), colour_of(c_), '',
                          c_.get('description'), c_.get('category'), front or '—',
                          ' + '.join(state) or '正常'])

for ptype, lst in PARTS.items():
    for part in lst:
        img = part.get('image') or ''
        img_ok = bool(img) and os.path.exists(os.path.join(ROOT, img))
        state = '正常'
        if not part.get('code'):
            state = '缺编号'
        if not img_ok:
            state = '缺图' if state == '正常' else state + ' + 缺图'
        r = write_row(ws, r, [LABEL_BY_TYPE.get(ptype, ptype), part.get('code') or '—', part.get('nameZh'),
                              part.get('name'), colour_of(part), part.get('material'), part.get('description'),
                              owners(ptype, part['id']), img or '—', state])
ws.auto_filter.ref = 'A1:J%d' % (r - 1)
r += 3

os.makedirs(os.path.dirname(OUT), exist_ok=True)
wb.save(OUT)
print('saved', OUT, os.path.getsize(OUT), 'bytes')
print('sheets:', wb.sheetnames)
print('系列:', SERIES)
