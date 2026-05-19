"""xls -> xlsx 변환 + 시트/도형 요약."""
import os
import sys
import win32com.client as win32

SRC = r"c:\dev\edenmg\코아구성도_수정용_170905.xls"
DST = r"c:\dev\edenmg\samples\코아구성도_수정용_170905.xlsx"

os.makedirs(os.path.dirname(DST), exist_ok=True)

excel = win32.DispatchEx("Excel.Application")
excel.Visible = False
excel.DisplayAlerts = False

try:
    wb = excel.Workbooks.Open(SRC, ReadOnly=True)
    # FileFormat=51 -> xlOpenXMLWorkbook (.xlsx)
    wb.SaveAs(DST, FileFormat=51)
    print(f"saved: {DST}")
    print(f"sheets: {wb.Sheets.Count}")
    for i in range(1, wb.Sheets.Count + 1):
        ws = wb.Sheets(i)
        shape_count = ws.Shapes.Count
        used = ws.UsedRange
        print(f"  [{i}] name={ws.Name!r} rows={used.Rows.Count} cols={used.Columns.Count} shapes={shape_count}")
    wb.Close(SaveChanges=False)
finally:
    excel.Quit()
