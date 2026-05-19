"""xlsx 시트·도형 구조 요약."""
import os
import zipfile
from xml.etree import ElementTree as ET

SRC = r"c:\dev\edenmg\samples\코아구성도_수정용_170905.xlsx"

NS = {
    "main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "xdr": "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
}

with zipfile.ZipFile(SRC) as z:
    names = z.namelist()
    print(f"=== ZIP entries ({len(names)}) ===")
    interesting = [n for n in names if any(k in n for k in ("workbook", "sheet", "drawing", "media", "chart"))]
    for n in sorted(interesting):
        info = z.getinfo(n)
        print(f"  {n:60s} {info.file_size:>10} bytes")

    # workbook.xml -> sheet names
    print("\n=== Sheets (workbook.xml) ===")
    with z.open("xl/workbook.xml") as f:
        tree = ET.parse(f)
    for s in tree.getroot().findall(".//main:sheet", NS):
        print(f"  sheetId={s.get('sheetId')} name={s.get('name')!r} rId={s.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')}")

    # drawing files
    print("\n=== Drawings ===")
    drawings = [n for n in names if n.startswith("xl/drawings/drawing") and n.endswith(".xml")]
    for dn in sorted(drawings):
        with z.open(dn) as f:
            dtree = ET.parse(f)
        anchors = dtree.getroot().findall("xdr:twoCellAnchor", NS) + \
                  dtree.getroot().findall("xdr:oneCellAnchor", NS) + \
                  dtree.getroot().findall("xdr:absoluteAnchor", NS)
        print(f"  {dn}: {len(anchors)} anchors")
        # count shape types
        types = {}
        for a in anchors:
            for child in a:
                tag = child.tag.split('}')[-1]
                types[tag] = types.get(tag, 0) + 1
        for t, c in types.items():
            print(f"      {t}: {c}")
