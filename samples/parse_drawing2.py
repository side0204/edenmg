"""drawing2.xml (원본 시트) 도형 깊이 파싱."""
import sys, io, zipfile, json, re
from collections import Counter, defaultdict
from xml.etree import ElementTree as ET

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

SRC = r"c:\dev\edenmg\samples\코아구성도_수정용_170905.xlsx"
NSXDR = "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
NSA = "http://schemas.openxmlformats.org/drawingml/2006/main"

def Q(ns, t):
    return f"{{{ns}}}{t}"

def cell_anchor(anchor):
    """Return (fromCol, fromRow, toCol, toRow) or None for any anchor."""
    f = anchor.find(Q(NSXDR, "from"))
    t = anchor.find(Q(NSXDR, "to"))
    if f is None or t is None:
        return None
    def coord(e, tag):
        x = e.find(Q(NSXDR, tag))
        return int(x.text) if x is not None and x.text else 0
    return (coord(f, "col"), coord(f, "row"), coord(t, "col"), coord(t, "row"))

def shape_text(sp):
    """Extract concatenated text from a shape."""
    parts = []
    for t in sp.iter(Q(NSA, "t")):
        if t.text:
            parts.append(t.text)
    return "".join(parts).strip()

def shape_prst(sp):
    """Get preset geometry name."""
    pg = sp.find(f".//{Q(NSA, 'prstGeom')}")
    return pg.get("prst") if pg is not None else None

def shape_fill_color(sp):
    """Try to get fill color."""
    sf = sp.find(f".//{Q(NSA, 'solidFill')}/{Q(NSA, 'srgbClr')}")
    if sf is not None:
        return sf.get("val")
    sf2 = sp.find(f".//{Q(NSA, 'solidFill')}/{Q(NSA, 'schemeClr')}")
    if sf2 is not None:
        return f"scheme:{sf2.get('val')}"
    return None

with zipfile.ZipFile(SRC) as z:
    with z.open("xl/drawings/drawing2.xml") as f:
        tree = ET.parse(f)

root = tree.getroot()

shapes = []
for anchor in list(root):
    tag = anchor.tag.split("}")[-1]
    if tag not in ("twoCellAnchor", "oneCellAnchor"):
        continue
    box = cell_anchor(anchor)
    for sp in anchor.findall(Q(NSXDR, "sp")):
        shapes.append({
            "kind": "sp",
            "prst": shape_prst(sp),
            "text": shape_text(sp),
            "fill": shape_fill_color(sp),
            "box": box,
        })
    for cxn in anchor.findall(Q(NSXDR, "cxnSp")):
        shapes.append({
            "kind": "cxn",
            "prst": shape_prst(cxn),
            "text": shape_text(cxn),
            "fill": shape_fill_color(cxn),
            "box": box,
        })

print(f"=== drawing2 (원본): total shapes = {len(shapes)} ===\n")

# 도형 종류별 카운트
by_prst = Counter(s["prst"] for s in shapes)
print("=== 도형 모양별 분포 ===")
for prst, cnt in by_prst.most_common():
    print(f"  {prst!s:30s} {cnt}")

# 채움 색상별 분포 (사각형만)
rect_fills = Counter(s["fill"] for s in shapes if s["prst"] == "rect")
print("\n=== rect 채움 색상 분포 (상위 20) ===")
for c, n in rect_fills.most_common(20):
    print(f"  {c!s:25s} {n}")

# 텍스트 길이 분포
text_lens = [len(s["text"]) for s in shapes]
nonempty = [s for s in shapes if s["text"]]
print(f"\n=== 텍스트 통계 ===")
print(f"  텍스트 있는 도형: {len(nonempty)} / {len(shapes)}")
print(f"  최대 텍스트 길이: {max(text_lens)}")
print(f"  평균 텍스트 길이: {sum(text_lens)/len(text_lens):.1f}")

# 텍스트 패턴별 분류
print("\n=== 텍스트 패턴 분류 (휴리스틱) ===")
patterns = Counter()
samples_by_pattern = defaultdict(list)

# 패턴 후보
RE_CORE_CIRCUIT = re.compile(r'^\s*\d+(\.\d+)?(\.\d+)*\s*=\s*\d+')  # 1=5632751 또는 1.2=105431.105429
RE_FACILITY = re.compile(r'국사$|^[가-힣]+\s?\d*\s?[가-힣]+$')  # 시설명
RE_MANHOLE = re.compile(r'^\d+[A-Z]\s?\d+[A-Z]?\d+#?\d*$')  # 0025A 79M2#1
RE_CABLE_ID = re.compile(r'^\[[A-Z_0-9]+\]')  # [RN TRK] [RN 2:16]
RE_FLOOR = re.compile(r'\d+\s*층|\d+F|B\d+|옥상|M/H')  # 층·옥상·맨홀
RE_OK_ER = re.compile(r'\((OK|ER|확인|해지)\)')

for s in nonempty:
    txt = s["text"]
    if RE_CORE_CIRCUIT.search(txt):
        patterns["core_circuit"] += 1
        if len(samples_by_pattern["core_circuit"]) < 5:
            samples_by_pattern["core_circuit"].append(txt[:120])
    elif RE_OK_ER.search(txt):
        patterns["has_status"] += 1
        if len(samples_by_pattern["has_status"]) < 5:
            samples_by_pattern["has_status"].append(txt[:120])
    elif RE_CABLE_ID.search(txt):
        patterns["cable_spec"] += 1
        if len(samples_by_pattern["cable_spec"]) < 5:
            samples_by_pattern["cable_spec"].append(txt[:120])
    elif RE_MANHOLE.search(txt):
        patterns["manhole_id"] += 1
        if len(samples_by_pattern["manhole_id"]) < 5:
            samples_by_pattern["manhole_id"].append(txt[:120])
    elif "국사" in txt and len(txt) < 40:
        patterns["station_name"] += 1
        if len(samples_by_pattern["station_name"]) < 5:
            samples_by_pattern["station_name"].append(txt[:120])
    elif RE_FLOOR.search(txt) and len(txt) < 30:
        patterns["floor_label"] += 1
        if len(samples_by_pattern["floor_label"]) < 5:
            samples_by_pattern["floor_label"].append(txt[:120])
    elif len(txt) < 20:
        patterns["short_label"] += 1
        if len(samples_by_pattern["short_label"]) < 8:
            samples_by_pattern["short_label"].append(txt[:120])
    else:
        patterns["other"] += 1
        if len(samples_by_pattern["other"]) < 8:
            samples_by_pattern["other"].append(txt[:120])

for p, c in patterns.most_common():
    print(f"  {p:20s} {c}")
print()
for p, samples in samples_by_pattern.items():
    print(f"  [{p}] 샘플:")
    for sm in samples:
        print(f"    | {sm}")
    print()

# 도형 색상이 OK/ER 와 어떤 관계인가
print("=== prst='rect' 텍스트 + 색상 교차 분석 ===")
ok_fills = Counter()
er_fills = Counter()
for s in shapes:
    if s["prst"] != "rect":
        continue
    t = s["text"]
    if "(OK)" in t:
        ok_fills[s["fill"]] += 1
    if "(ER)" in t:
        er_fills[s["fill"]] += 1
print("  OK 텍스트가 들어간 사각형의 채움색:")
for c, n in ok_fills.most_common(8):
    print(f"    {c!s:25s} {n}")
print("  ER 텍스트가 들어간 사각형의 채움색:")
for c, n in er_fills.most_common(8):
    print(f"    {c!s:25s} {n}")
