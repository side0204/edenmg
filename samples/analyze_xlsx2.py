"""xlsx 시트명·도형 종류·텍스트 샘플 추출."""
import sys, io, zipfile, re
from collections import Counter
from xml.etree import ElementTree as ET

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
SRC = r"c:\dev\edenmg\samples\코아구성도_수정용_170905.xlsx"

NS = {
    "main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "xdr": "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
}

with zipfile.ZipFile(SRC) as z:
    # 시트명 (UTF-8)
    with z.open("xl/workbook.xml") as f:
        xml = f.read().decode("utf-8")
    print("=== Sheet names ===")
    for m in re.finditer(r'<sheet [^>]*name="([^"]+)"', xml):
        print(f"  {m.group(1)!r}")

    # workbook.rels 로 sheet -> rId -> file 매핑
    with z.open("xl/_rels/workbook.xml.rels") as f:
        rels = f.read().decode("utf-8")
    print("\n=== workbook rels ===")
    for m in re.finditer(r'<Relationship Id="([^"]+)" Type="[^"]*/(\w+)" Target="([^"]+)"', rels):
        print(f"  {m.group(1)} -> {m.group(2)} : {m.group(3)}")

    # sheet -> drawing 매핑
    print("\n=== sheet -> drawing ===")
    for i in range(1, 7):
        try:
            with z.open(f"xl/worksheets/_rels/sheet{i}.xml.rels") as f:
                srels = f.read().decode("utf-8")
            for m in re.finditer(r'Target="([^"]+drawing[^"]+)"', srels):
                print(f"  sheet{i} -> {m.group(1)}")
        except KeyError:
            pass

    # drawing1 의 도형 종류·텍스트 샘플
    print("\n=== drawing1.xml 도형 종류 분포 ===")
    with z.open("xl/drawings/drawing1.xml") as f:
        tree = ET.parse(f)
    root = tree.getroot()

    preset_geom = Counter()
    text_samples = []
    cxn_count = 0
    for sp in root.iter("{http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing}sp"):
        for pg in sp.iter("{http://schemas.openxmlformats.org/drawingml/2006/main}prstGeom"):
            preset_geom[pg.get("prst")] += 1
        # 텍스트 추출
        txts = []
        for t in sp.iter("{http://schemas.openxmlformats.org/drawingml/2006/main}t"):
            if t.text and t.text.strip():
                txts.append(t.text.strip())
        if txts and len(text_samples) < 30:
            text_samples.append(" | ".join(txts))
    for cxn in root.iter("{http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing}cxnSp"):
        cxn_count += 1
    print(f"  prstGeom (도형 모양) 상위:")
    for prst, cnt in preset_geom.most_common(15):
        print(f"    {prst:20s} {cnt}")
    print(f"  cxnSp (연결선): {cxn_count}")
    print(f"\n  텍스트 샘플 (30개):")
    for s in text_samples:
        print(f"    {s[:100]}")
