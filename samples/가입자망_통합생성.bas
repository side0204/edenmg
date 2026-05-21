Option Explicit

'==============================================================
'  선번장 → 가입자망 통합 파일 자동 생성기  (Excel VBA)
'  ------------------------------------------------------------
'  [준비]          → 「안내」 시트 + [가입자망 생성] 버튼을 만든다.
'  이 파일과 같은 폴더에 케이블별 선번장 파일(*.xlsx)을 넣는다.
'  [가입자망 생성]  → 폴더의 선번장을 모두 모아 통합 파일을 만든다.
'      · 케이블 1개 = 시트 1장
'      · 코어ID(D열) 가 같은 코어를 케이블끼리 맞춰
'        접속표(다른 케이블의 선번)를 자동 계산해 채운다.
'  결과 파일은 「통합결과」 하위 폴더에 저장된다.
'
'==============================================================

Private Const HEADER_ROW   As Long = 7   ' 표 머리글 행
Private Const DATA_ROW     As Long = 8   ' 코어 데이터 시작 행
Private Const COL_SEONBEON As Long = 2   ' 선번 (B)
Private Const COL_COREID   As Long = 4   ' 코어ID (D)


'--------------------------------------------------------------
'  준비 — 「안내」 시트 + [가입자망 생성] 버튼 생성 (처음 1회)
'--------------------------------------------------------------
Sub 준비()
    Dim ws As Worksheet
    On Error Resume Next
    Set ws = ThisWorkbook.Worksheets("안내")
    On Error GoTo 0
    If ws Is Nothing Then
        Set ws = ThisWorkbook.Worksheets.Add(Before:=ThisWorkbook.Worksheets(1))
        ws.Name = "안내"
    End If

    ws.Cells.Clear
    On Error Resume Next
    ws.Buttons.Delete
    On Error GoTo 0

    ws.Range("A1").Value = "선번장 → 가입자망 통합 파일 자동 생성"
    ws.Range("A1").Font.Bold = True
    ws.Range("A1").Font.Size = 14

    Dim guide As Variant
    guide = Array( _
        "[ 사용 방법 ]", _
        " 1. 이 파일을 케이블 선번장들이 모인 폴더에 둔다.", _
        " 2. 같은 폴더에 케이블별 선번장 파일(.xlsx)을 넣는다.", _
        "    - 파일 1개 = 케이블 1개 (파일명은 선로ID 권장)", _
        " 3. 오른쪽 [가입자망 생성] 버튼을 누른다.", _
        "", _
        "[ 결과 ]", _
        " - 「통합결과」 폴더에 통합 파일이 만들어진다.", _
        " - 케이블 1개 = 시트 1장.", _
        " - 코어ID 가 같은 코어를 케이블끼리 맞춰", _
        "   접속표(다른 케이블의 선번)를 자동으로 채운다.", _
        " - 교차표는 코어ID 를 공유하는 케이블이 있는 시트에만 붙는다.")
    Dim i As Long
    For i = 0 To UBound(guide)
        ws.Cells(3 + i, 1).Value = guide(i)
    Next i
    ws.Columns("A").ColumnWidth = 64

    Dim btn As Button
    Set btn = ws.Buttons.Add(470, 40, 170, 52)
    btn.OnAction = "가입자망생성"
    btn.Caption = "가입자망 생성"
    btn.Font.Bold = True
    btn.Font.Size = 12

    ws.Range("A1").Select
    MsgBox "준비 완료." & vbCrLf & vbCrLf & _
           "이 파일과 같은 폴더에 케이블 선번장 파일들을 넣고" & vbCrLf & _
           "[가입자망 생성] 버튼을 누르세요.", vbInformation
End Sub


'--------------------------------------------------------------
'  가입자망 생성 — [가입자망 생성] 버튼에 연결
'--------------------------------------------------------------
Sub 가입자망생성()
    Dim baseFolder As String
    baseFolder = ThisWorkbook.Path
    If baseFolder = "" Then
        MsgBox "먼저 이 파일을 폴더에 저장한 뒤 실행하세요.", vbExclamation
        Exit Sub
    End If

    Dim sep As String
    sep = Application.PathSeparator

    ' --- 입력 파일 수집 (.xlsx, 출력·임시 파일 제외) ---
    Dim files As Collection
    Set files = New Collection
    Dim fn As String
    fn = Dir(baseFolder & sep & "*.xlsx")
    Do While fn <> ""
        If Left(fn, 2) <> "~$" And Left(fn, 4) <> "가입자망" Then
            files.Add fn
        End If
        fn = Dir
    Loop

    If files.Count = 0 Then
        MsgBox "같은 폴더에 케이블 선번장 파일(.xlsx)이 없습니다.", vbExclamation
        Exit Sub
    End If

    If MsgBox(files.Count & "개의 .xlsx 파일을 읽어 가입자망 통합 파일을 만듭니다." & vbCrLf & _
              "계속할까요?", vbQuestion + vbYesNo) <> vbYes Then Exit Sub

    Application.ScreenUpdating = False
    Application.DisplayAlerts = False
    On Error GoTo CleanFail

    ' --- 출력 워크북 ---
    Dim outWb As Workbook
    Set outWb = Workbooks.Add
    Dim blankCount As Long
    blankCount = outWb.Worksheets.Count

    ' coreMaps : 케이블이름 -> Dictionary(코어ID -> 선번)
    Dim coreMaps As Object
    Set coreMaps = CreateObject("Scripting.Dictionary")
    Dim cableNames As Collection
    Set cableNames = New Collection
    Dim skipped As String

    ' ===== PASS 1 — 선번장 읽기 + 시트 복사 + 코어맵 작성 =====
    Dim idx As Long
    For idx = 1 To files.Count
        Dim srcWb As Workbook
        Set srcWb = Nothing
        On Error Resume Next
        Set srcWb = Workbooks.Open(fileName:=baseFolder & sep & files(idx), ReadOnly:=True)
        On Error GoTo CleanFail

        If srcWb Is Nothing Then
            skipped = skipped & vbCrLf & " - " & files(idx) & " (열기 실패)"
        Else
            Dim srcWs As Worksheet
            Set srcWs = FindSeonbeonjangSheet(srcWb)
            If srcWs Is Nothing Then
                skipped = skipped & vbCrLf & " - " & files(idx) & " (선번장 아님)"
            Else
                Dim cmap As Object
                Set cmap = ReadCoreMap(srcWs)
                srcWs.Copy After:=outWb.Worksheets(outWb.Worksheets.Count)
                Dim newWs As Worksheet
                Set newWs = outWb.Worksheets(outWb.Worksheets.Count)
                Dim cableName As String
                cableName = MakeUniqueSheetName(outWb, srcWs.Name)
                newWs.Name = cableName
                coreMaps.Add cableName, cmap
                cableNames.Add cableName
            End If
            srcWb.Close SaveChanges:=False
        End If
    Next idx

    If cableNames.Count = 0 Then
        outWb.Close SaveChanges:=False
        Application.DisplayAlerts = True
        Application.ScreenUpdating = True
        MsgBox "유효한 선번장 파일을 찾지 못했습니다." & skipped, vbExclamation
        Exit Sub
    End If

    ' 출력 워크북의 기본 빈 시트 삭제
    Dim b As Long
    For b = 1 To blankCount
        outWb.Worksheets(1).Delete
    Next b

    ' ===== PASS 2 — 접속 교차표 계산 + 삽입 =====
    Dim ci As Long
    For ci = 1 To cableNames.Count
        Dim thisName As String
        thisName = cableNames(ci)
        Dim ws As Worksheet
        Set ws = outWb.Worksheets(thisName)
        Dim myMap As Object
        Set myMap = coreMaps(thisName)

        ' 코어ID 를 공유하는 다른 케이블 찾기
        Dim linked As Collection
        Set linked = New Collection
        Dim cj As Long
        For cj = 1 To cableNames.Count
            If cj <> ci Then
                Dim otherName As String
                otherName = cableNames(cj)
                If SharesCore(myMap, coreMaps(otherName)) Then
                    linked.Add otherName
                End If
            End If
        Next cj

        If linked.Count > 0 Then
            InsertCrossRef ws, linked, coreMaps
        End If
    Next ci

    ' ===== 저장 =====
    Dim outDir As String
    outDir = baseFolder & sep & "통합결과"
    If Dir(outDir, vbDirectory) = "" Then MkDir outDir

    Dim outPath As String
    outPath = outDir & sep & "가입자망통합_" & Format(Now, "yyyymmdd_hhnn") & ".xlsx"
    outWb.Worksheets(1).Activate
    outWb.SaveAs fileName:=outPath, FileFormat:=xlOpenXMLWorkbook

    Application.DisplayAlerts = True
    Application.ScreenUpdating = True

    Dim doneMsg As String
    doneMsg = cableNames.Count & "개 케이블로 가입자망 통합 파일을 만들었습니다." & vbCrLf & vbCrLf & _
              outPath
    If skipped <> "" Then
        doneMsg = doneMsg & vbCrLf & vbCrLf & "건너뛴 파일:" & skipped
    End If
    MsgBox doneMsg, vbInformation
    Exit Sub

CleanFail:
    Application.DisplayAlerts = True
    Application.ScreenUpdating = True
    MsgBox "처리 중 오류가 발생했습니다:" & vbCrLf & Err.Description, vbCritical
End Sub


'--------------------------------------------------------------
'  내부 함수
'--------------------------------------------------------------

' 선번장 시트 찾기 — A1 에 "선번장" 이 있는 시트, 없으면 7행에 "선번" 머리글이 있는 시트
Private Function FindSeonbeonjangSheet(wb As Workbook) As Worksheet
    Dim ws As Worksheet
    For Each ws In wb.Worksheets
        If InStr(CStr(ws.Range("A1").Value), "선번장") > 0 Then
            Set FindSeonbeonjangSheet = ws
            Exit Function
        End If
    Next ws
    For Each ws In wb.Worksheets
        Dim c As Long
        For c = 1 To 12
            If CStr(ws.Cells(HEADER_ROW, c).Value) = "선번" Then
                Set FindSeonbeonjangSheet = ws
                Exit Function
            End If
        Next c
    Next ws
    Set FindSeonbeonjangSheet = Nothing
End Function

' 코어ID -> 선번 맵 작성
Private Function ReadCoreMap(ws As Worksheet) As Object
    Dim d As Object
    Set d = CreateObject("Scripting.Dictionary")
    Dim lastRow As Long
    lastRow = ws.Cells(ws.Rows.Count, COL_SEONBEON).End(xlUp).Row
    Dim r As Long
    For r = DATA_ROW To lastRow
        Dim sb As Variant, cid As Variant
        sb = ws.Cells(r, COL_SEONBEON).Value
        cid = ws.Cells(r, COL_COREID).Value
        If IsNumeric(sb) And Trim(CStr(sb)) <> "" Then
            Dim key As String
            key = Trim(CStr(cid))
            If key <> "" And key <> "(연결)" Then
                d(key) = sb
            End If
        End If
    Next r
    Set ReadCoreMap = d
End Function

' 두 코어맵이 코어ID 를 하나라도 공유하는가
Private Function SharesCore(mapA As Object, mapB As Object) As Boolean
    Dim k As Variant
    For Each k In mapA.Keys
        If mapB.Exists(k) Then
            SharesCore = True
            Exit Function
        End If
    Next k
    SharesCore = False
End Function

' 접속 교차표 열 삽입 — 코어명 열 앞에 linked 케이블 수만큼
Private Sub InsertCrossRef(ws As Worksheet, linked As Collection, coreMaps As Object)
    Dim n As Long
    n = linked.Count

    ' "코어명" 머리글 열 찾기
    Dim insertAt As Long
    insertAt = 0
    Dim c As Long
    For c = 1 To 80
        If CStr(ws.Cells(HEADER_ROW, c).Value) = "코어명" Then
            insertAt = c
            Exit For
        End If
    Next c
    If insertAt = 0 Then insertAt = 7

    ws.Range(ws.Columns(insertAt), ws.Columns(insertAt + n - 1)).Insert Shift:=xlToRight

    Dim lastRow As Long
    lastRow = ws.Cells(ws.Rows.Count, COL_SEONBEON).End(xlUp).Row

    Dim j As Long
    For j = 1 To n
        Dim col As Long
        col = insertAt + j - 1
        Dim oMap As Object
        Set oMap = coreMaps(linked(j))

        ws.Cells(HEADER_ROW, col).Value = linked(j)

        Dim r As Long
        For r = DATA_ROW To lastRow
            Dim sb As Variant
            sb = ws.Cells(r, COL_SEONBEON).Value
            If IsNumeric(sb) And Trim(CStr(sb)) <> "" Then
                Dim cid As String
                cid = Trim(CStr(ws.Cells(r, COL_COREID).Value))
                If cid <> "" And cid <> "(연결)" Then
                    If oMap.Exists(cid) Then
                        ws.Cells(r, col).Value = oMap(cid)
                    Else
                        ws.Cells(r, col).Value = "#N/A"
                    End If
                End If
            End If
        Next r
    Next j

    With ws.Range(ws.Cells(HEADER_ROW, insertAt), ws.Cells(lastRow, insertAt + n - 1))
        .Borders.LineStyle = xlContinuous
        .HorizontalAlignment = xlCenter
    End With
    With ws.Range(ws.Cells(HEADER_ROW, insertAt), ws.Cells(HEADER_ROW, insertAt + n - 1))
        .Font.Bold = True
        .Interior.Color = RGB(255, 242, 204)
    End With
End Sub

' 시트명 정리(특수문자·길이) + 중복 회피
Private Function MakeUniqueSheetName(wb As Workbook, baseName As String) As String
    Dim nm As String
    nm = baseName
    Dim bad As Variant, i As Long
    bad = Array("\", "/", "?", "*", "[", "]", ":")
    For i = 0 To UBound(bad)
        nm = Replace(nm, CStr(bad(i)), "_")
    Next i
    nm = Trim(nm)
    If nm = "" Then nm = "선번장"
    If Len(nm) > 28 Then nm = Left(nm, 28)

    Dim candidate As String, suffix As Long
    candidate = nm
    suffix = 1
    Do While SheetExists(wb, candidate)
        suffix = suffix + 1
        candidate = nm & "(" & suffix & ")"
    Loop
    MakeUniqueSheetName = candidate
End Function

Private Function SheetExists(wb As Workbook, nm As String) As Boolean
    Dim ws As Worksheet
    For Each ws In wb.Worksheets
        If ws.Name = nm Then
            SheetExists = True
            Exit Function
        End If
    Next ws
    SheetExists = False
End Function
