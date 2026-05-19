"""원본 vs 수정본 비교 + 수정본 심층 분석."""
import sys, io, zipfile, re, json
from collections import Counter, defaultdict
from xml.etree import ElementTree as ET

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

SRC = r"c:\dev\edenmg\samples\코아구성도_수정용_170905.xlsx"
NSXDR = "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
NSA = "http://schemas.openxmlformats.org/drawingml/2006/main"
Q = lambda ns, t: f"{{{ns}}}{t}"


def parse_drawing(zf, path):
    with zf.open(path) as f:
        tree = ET.parse(f)
    shapes = []
    for anchor in list(tree.getroot()):
        tag = anchor.tag.split("}")[-1]
        if tag not in ("twoCellAnchor", "oneCellAnchor"):
            continue
        f_el, t_el = anchor.find(Q(NSXDR, "from")), anchor.find(Q(NSXDR, "to"))
        def coord(e, x):
            if e is None: return 0
            c = e.find(Q(NSXDR, x))
            return int(c.text) if c is not None and c.text else 0
        box = (coord(f_el, "col"), coord(f_el, "row"), coord(t_el, "col"), coord(t_el, "row"))
        for kind, q in (("sp", Q(NSXDR, "sp")), ("cxn", Q(NSXDR, "cxnSp"))):
            for el in anchor.findall(q):
                pg = el.find(f".//{Q(NSA, 'prstGeom')}")
                fill = el.find(f".//{Q(NSA, 'solidFill')}/{Q(NSA, 'srgbClr')}")
                texts = [t.text for t in el.iter(Q(NSA, "t")) if t.text]
                shapes.append({
                    "kind": kind,
                    "prst": pg.get("prst") if pg is not None else None,
                    "fill": fill.get("val") if fill is not None else None,
                    "text": "".join(texts).strip(),
                    "box": box,
                })
    return shapes


# 회선번호(7자리 숫자) 추출 — 거의 유일한 식별자
RE_CIRCUIT = re.compile(r'\b(\d{6,8})\b')
# 코어=회선번호 매핑
RE_CORE = re.compile(r'(\d+(?:\.\d+)*)\s*=\s*(\d+(?:\.\d+)*)\s*\((OK|ER)\)')
# 시설 식별자
RE_MANHOLE = re.compile(r'\b\d{4}[A-Z]\d?\s?\d+[A-Z]?\d+#?\d*\b')
RE_STATION = re.compile(r'([가-힣]+국사)')


def extract_circuits(shapes):
    """텍스트에서 회선번호·코어매핑 추출. 회선번호 -> 등장한 도형 텍스트 list."""
    circ_map = defaultdict(list)
    core_pairs = []
    for s in shapes:
        if not s["text"]:
            continue
        for m in RE_CIRCUIT.finditer(s["text"]):
            circ_map[m.group(1)].append(s["text"][:80])
        for m in RE_CORE.finditer(s["text"]):
            core_pairs.append((m.group(1), m.group(2), m.group(3)))
    return circ_map, core_pairs


with zipfile.ZipFile(SRC) as z:
    s_orig = parse_drawing(z, "xl/drawings/drawing2.xml")
    s_modi = parse_drawing(z, "xl/drawings/drawing3.xml")

print(f"원본 도형: {len(s_orig)}   수정본 도형: {len(s_modi)}")

# 1. 노란색 도형 의미 확인 — 텍스트가 어떤 패턴인지
print("\n=== 노란색(FFFF00) 도형의 텍스트 샘플 ===")
for label, shapes in [("원본", s_orig), ("수정본", s_modi)]:
    yellow = [s for s in shapes if s["fill"] == "FFFF00" and s["text"]]
    print(f"\n  {label}: 노란색 텍스트 도형 {len(yellow)}개")
    for s in yellow[:8]:
        print(f"    | {s['text'][:120]}")

# 2. 회선번호 단위 비교
circ_orig, cores_orig = extract_circuits(s_orig)
circ_modi, cores_modi = extract_circuits(s_modi)

orig_set = set(circ_orig.keys())
modi_set = set(circ_modi.keys())

print(f"\n=== 회선번호 (7~8자리 숫자) 추출 ===")
print(f"  원본 고유 회선번호: {len(orig_set)}")
print(f"  수정본 고유 회선번호: {len(modi_set)}")
print(f"  공통: {len(orig_set & modi_set)}")
print(f"  원본에만: {len(orig_set - modi_set)}  -> 수정본에서 삭제·교체")
print(f"  수정본에만: {len(modi_set - orig_set)}  -> 수정본에서 추가")

removed = sorted(orig_set - modi_set)[:10]
added = sorted(modi_set - orig_set)[:10]
print(f"\n  삭제된 회선번호 샘플:")
for c in removed:
    txt = circ_orig[c][0][:100] if circ_orig[c] else ""
    print(f"    {c} : {txt}")
print(f"\n  추가된 회선번호 샘플:")
for c in added:
    txt = circ_modi[c][0][:100] if circ_modi[c] else ""
    print(f"    {c} : {txt}")

# 3. 코어=회선 매핑 비교 (동일 회선번호가 다른 코어로?)
print(f"\n=== 코어=회선 매핑 패턴 ===")
print(f"  원본 코어매핑 수: {len(cores_orig)}")
print(f"  수정본 코어매핑 수: {len(cores_modi)}")

# OK / ER 비율
def status_ratio(cores):
    c = Counter(s for _, _, s in cores)
    return c
print(f"  원본 OK/ER: {dict(status_ratio(cores_orig))}")
print(f"  수정본 OK/ER: {dict(status_ratio(cores_modi))}")

# 4. 시설명(국사) 빈도 비교
print("\n=== 국사명 등장 빈도 (상위 15) ===")
def stations(shapes):
    c = Counter()
    for s in shapes:
        for m in RE_STATION.finditer(s["text"] or ""):
            c[m.group(1)] += 1
    return c
st_o = stations(s_orig)
st_m = stations(s_modi)
all_st = set(st_o) | set(st_m)
print(f"  {'국사명':20s} {'원본':>6s} {'수정본':>6s} {'차이':>6s}")
for name in sorted(all_st, key=lambda n: -(st_o[n] + st_m[n]))[:15]:
    diff = st_m[name] - st_o[name]
    print(f"  {name:20s} {st_o[name]:>6d} {st_m[name]:>6d} {diff:>+6d}")

# 5. 수정본만 깊이 — 도형 텍스트 통계
print("\n=== 수정본 텍스트 길이 분포 ===")
lengths = [len(s["text"]) for s in s_modi if s["text"]]
buckets = [0, 10, 30, 60, 100, 200, 500, 1000, 5000, 10000]
for i in range(len(buckets)-1):
    lo, hi = buckets[i], buckets[i+1]
    cnt = sum(1 for l in lengths if lo <= l < hi)
    print(f"  {lo:>5}~{hi:<5}: {cnt}")

# 6. 한 라벨에 들어있는 회선 수 분포
print("\n=== 수정본: 한 도형 라벨에 들어있는 회선번호 갯수 ===")
per_label = Counter()
for s in s_modi:
    n = len(set(RE_CIRCUIT.findall(s["text"] or "")))
    per_label[n] += 1
for k in sorted(per_label.keys()):
    print(f"  회선 {k}개: {per_label[k]} 도형")
