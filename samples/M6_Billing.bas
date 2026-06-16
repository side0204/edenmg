Attribute VB_Name = "M6_Billing"
Option Explicit

' ============================================================================
'  기별명세서 자동 산출 — Phase 1: 추출 미리보기 (읽기 전용 진단)
'  계획: samples/기별명세서_산출_계획.md  ·  owner 확정 규칙 §7
'
'  설계(행정도+네트웍구성도)를 스캔 → 시설물·케이블·코어접속·주야 집계를
'  「_기별_미리보기」 시트에 덤프. ※ 행정도·네트웍 도형은 절대 변경 안 함(읽기 전용).
'  Phase 3(양식 채우기) 전에 추출 숫자/매핑이 맞는지 owner 가 눈으로 검증하는 단계.
'
'  실행: Alt+F8 → 기별_추출_미리보기
'
'  데이터 출처 (조사 확정):
'   - _시설물: col1=facId · col2=구분라벨("신설/가공/72C" 등) · col3=명칭 · col5=배지
'   - _케이블: col1=id · col2=from · col3=to · col4=규격 · col7=구분(신설/철거/기설) · col8=거리(m)
'   - 상태박스(_fac_status_): AltText "day=N;night=M" (주간/야간) — 상태박스_값_읽기
'   - 연결코어수: 시설물_연결코어수_계산(ws, facId)
'   - RN 판별: 시설물_isRN(ws, facId)
' ============================================================================

' 구분라벨("신설/가공/72C") 첫 토큰 → 신설/기설/철거.
Public Function 기별_신설기설(ByVal label As String) As String
    Dim s As String: s = Trim(label)
    Dim p As Long: p = InStr(s, "/")
    Dim first As String
    If p > 0 Then first = Trim(Left(s, p - 1)) Else first = s
    If InStr(first, "신설") > 0 Then
        기별_신설기설 = "신설"
    ElseIf InStr(first, "기설") > 0 Then
        기별_신설기설 = "기설"
    ElseIf InStr(first, "철거") > 0 Then
        기별_신설기설 = "철거"
    Else
        기별_신설기설 = first        ' 그대로 노출 — 라벨 형식 진단용
    End If
End Function

' 시설물 구분(label) → 범례(_범례) col3 매칭 → 명칭(col9) 반환.
'   owner 2026-06-16: 종류는 「범례 명칭」 으로 판정 (설치장소/시설물/접속함체/RN/광케이블이 명칭에 구분됨).
'   기존 시설물_isRN 의 느슨한 fallback 이 접속함체를 RN 으로 오판 → 명칭 직접 판정으로 교체.
' 구분 문자열의 첫 두 토큰 ("신설/가공/72C" → "신설/가공", "간이국사" → "간이국사").
Public Function 기별_토큰2(ByVal s As String) As String
    Dim parts() As String: parts = Split(Trim(s), "/")
    If UBound(parts) >= 1 Then
        기별_토큰2 = Trim(parts(0)) & "/" & Trim(parts(1))
    Else
        기별_토큰2 = Trim(s)
    End If
End Function

' 규격 문자열 복원 — "4.44E-02"(시간직렬) → "1:4". 그 외(72C 등)는 그대로.
Public Function 기별_규격복원(ByVal s As String) As String
    기별_규격복원 = Trim(s)
    Dim t As String: t = Trim(s)
    If Len(t) = 0 Then Exit Function
    If IsNumeric(t) Then
        Dim v As Double: v = 0
        On Error Resume Next: v = CDbl(t): On Error GoTo 0
        If v > 0 And v < 1 Then
            On Error Resume Next
            기별_규격복원 = Format(CDate(v), "h:m")
            On Error GoTo 0
        End If
    End If
End Function

' 시설물 명칭(접속함체/RN/…) 판정 — owner 2026-06-16.
'   문제: 구분 "신설/가공" 이 접속함체(closure)·RN(rn) 양쪽에 있어 구분만으론 구별 불가.
'   해결: 시설물 callout("lbl_"&facId) 첫 줄 = "구분/규격"(예 신설/가공/72C) 을 읽어, _범례 를
'         (구분 토큰2 + 규격) 쌍으로 매칭 → col9 명칭. 규격이 접속함체(72C)·RN(1:4) 으로 달라 구별됨.
'         규격 매칭 실패 시 구분 토큰2 만으로 폴백(비충돌 구분: 신설/외벽 등).
Public Function 기별_시설명칭(ws As Worksheet, ByVal facId As String, ByVal fallbackGubun As String) As String
    기별_시설명칭 = ""
    Dim gubun As String, gyuk As String
    gubun = Trim(fallbackGubun): gyuk = ""
    ' 1) callout 첫 줄에서 구분/규격 파싱
    If Not ws Is Nothing And Len(facId) > 0 Then
        Dim lbl As Shape: Set lbl = Nothing
        On Error Resume Next: Set lbl = ws.Shapes(PREFIX_LABEL & facId): On Error GoTo 0
        If Not lbl Is Nothing Then
            Dim tx As String: tx = ""
            On Error Resume Next: tx = lbl.TextFrame2.TextRange.Text: On Error GoTo 0
            tx = Replace(Replace(tx, vbCrLf, vbCr), vbLf, vbCr)
            Dim p As Long: p = InStr(tx, vbCr)
            Dim line1 As String
            If p > 0 Then line1 = Left(tx, p - 1) Else line1 = tx
            line1 = Trim(line1)
            If Len(line1) > 0 Then
                Dim lp As Long: lp = InStrRev(line1, "/")
                If lp > 0 Then
                    gyuk = 기별_규격복원(Mid(line1, lp + 1))
                    gubun = Trim(Left(line1, lp - 1))
                Else
                    gubun = line1
                End If
            End If
        End If
    End If
    ' 2) _범례 매칭 — (구분 토큰2 + 규격) 우선, 없으면 (구분 토큰2)만 폴백
    Dim wsLeg As Worksheet
    On Error Resume Next: Set wsLeg = ThisWorkbook.Worksheets(SHEET_META_LEG): On Error GoTo 0
    If wsLeg Is Nothing Then Exit Function
    Dim fk2 As String: fk2 = 기별_토큰2(gubun)
    Dim lastR As Long: lastR = wsLeg.Cells(wsLeg.Rows.Count, 1).End(xlUp).Row
    Dim r As Long
    Dim pairName As String: pairName = ""
    Dim gubunName As String: gubunName = ""
    For r = 2 To lastR
        If LCase(CStr(wsLeg.Cells(r, 2).Value)) <> "cable" Then
            Dim g As String: g = Trim(CStr(wsLeg.Cells(r, 3).Value))
            If Len(g) > 0 Then
                If 기별_토큰2(g) = fk2 Then
                    Dim nm9 As String: nm9 = Trim(CStr(wsLeg.Cells(r, 9).Value))
                    If Len(nm9) > 0 Then
                        If Len(gubunName) = 0 Then gubunName = nm9
                        If Len(gyuk) > 0 Then
                            Dim lg As String: lg = 양식_셀_텍스트(wsLeg.Cells(r, 5))
                            If lg = gyuk Then pairName = nm9
                        End If
                    End If
                End If
            End If
        End If
    Next r
    If Len(pairName) > 0 Then
        기별_시설명칭 = pairName
    Else
        기별_시설명칭 = gubunName
    End If
End Function

' 시설물 종류 분류 — 범례 명칭(col9) 기준. RN / 접속함체 / 설치장소 / 케이블 / 그외.
Public Function 기별_시설종류(ws As Worksheet, ByVal facId As String, ByVal label As String) As String
    Dim nm As String: nm = 기별_시설명칭(ws, facId, label)
    If InStr(UCase(nm), "RN") > 0 Then
        기별_시설종류 = "RN"
    ElseIf InStr(nm, "접속함체") > 0 Then
        기별_시설종류 = "접속함체"
    ElseIf InStr(nm, "설치장소") > 0 Then
        기별_시설종류 = "설치장소"
    ElseIf InStr(nm, "광케이블") > 0 Then
        기별_시설종류 = "케이블"
    Else
        기별_시설종류 = "그외"        ' 국사·일반 시설물 등
    End If
End Function

' 케이블 거리 반영 여부 (owner 2026-06-16): 기설 케이블은 거리(경간) 제외 — 공종만.
'   신설→신설시트 거리 반영, 철거→철거시트 거리 반영, 기설→거리 X(공종만).
Public Function 기별_거리반영(ByVal gubun As String) As String
    If InStr(gubun, "기설") > 0 Then
        기별_거리반영 = "X(기설)"
    ElseIf InStr(gubun, "철거") > 0 Then
        기별_거리반영 = "O(철거)"
    ElseIf InStr(gubun, "신설") > 0 Then
        기별_거리반영 = "O(신설)"
    Else
        기별_거리반영 = "?(" & gubun & ")"
    End If
End Function

Public Function 기별_미리보기_시트확보() As Worksheet
    Const NM As String = "_기별_미리보기"
    Dim ws As Worksheet: Set ws = Nothing
    On Error Resume Next: Set ws = ThisWorkbook.Worksheets(NM): On Error GoTo 0
    If ws Is Nothing Then
        Set ws = ThisWorkbook.Worksheets.Add
        On Error Resume Next: ws.Name = NM: On Error GoTo 0
    End If
    On Error Resume Next: ws.Visible = xlSheetVisible: On Error GoTo 0
    Set 기별_미리보기_시트확보 = ws
End Function

Public Sub 기별_추출_미리보기()
    Dim wsFac As Worksheet, wsCbl As Worksheet, wsNw As Worksheet
    On Error Resume Next
    Set wsFac = ThisWorkbook.Worksheets(SHEET_META_FAC)
    Set wsCbl = ThisWorkbook.Worksheets(SHEET_META_CBL)
    Set wsNw = ThisWorkbook.Worksheets(SHEET_NETWORK)
    On Error GoTo 0
    If wsFac Is Nothing Then MsgBox "_시설물 메타 시트가 없습니다.", vbExclamation, "기별 추출": Exit Sub

    Application.ScreenUpdating = False

    Dim facName As Object: Set facName = CreateObject("Scripting.Dictionary")

    Dim wsOut As Worksheet: Set wsOut = 기별_미리보기_시트확보()
    wsOut.Cells.Clear

    Dim outR As Long: outR = 1
    wsOut.Cells(outR, 1).Value = "■ 기별 추출 미리보기 (Phase 1 · 읽기전용 · 행정도/네트웍 미변경)": outR = outR + 2

    ' === 시설물 ===
    wsOut.Cells(outR, 1).Value = "[시설물]": outR = outR + 1
    Dim fh As Variant: fh = Array("ID(끝5)", "구분라벨", "명칭", "배지", "신설/기설", "종류", "주간(day)", "야간(night)", "연결코어수", "범례명칭")
    Dim c As Long
    For c = 0 To UBound(fh): wsOut.Cells(outR, c + 1).Value = fh(c): Next c
    outR = outR + 1

    Dim facCount As Long, nNew As Long, nOld As Long, nRN As Long, nClo As Long, coreSum As Long
    Dim lastF As Long: lastF = wsFac.Cells(wsFac.Rows.Count, 1).End(xlUp).Row
    Dim r As Long
    For r = 2 To lastF
        Dim facId As String: facId = CStr(wsFac.Cells(r, 1).Value)
        If Len(facId) = 0 Then GoTo NextFac
        Dim label As String: label = CStr(wsFac.Cells(r, 2).Value)
        Dim nm As String: nm = CStr(wsFac.Cells(r, 3).Value)
        Dim badge As String: badge = CStr(wsFac.Cells(r, 5).Value)
        facName(facId) = nm

        Dim no As String: no = 기별_신설기설(label)
        Dim kind As String: kind = 기별_시설종류(wsNw, facId, label)
        Dim dayV As String, nightV As String: dayV = "": nightV = ""
        On Error Resume Next: 상태박스_값_읽기 wsNw, facId, dayV, nightV: On Error GoTo 0
        Dim cores As Long: cores = 0
        On Error Resume Next: cores = 시설물_연결코어수_계산(wsNw, facId): On Error GoTo 0

        wsOut.Cells(outR, 1).Value = Right(facId, 5)
        wsOut.Cells(outR, 2).Value = label
        wsOut.Cells(outR, 3).Value = nm
        wsOut.Cells(outR, 4).Value = badge
        wsOut.Cells(outR, 5).Value = no
        wsOut.Cells(outR, 6).Value = kind
        wsOut.Cells(outR, 7).Value = dayV
        wsOut.Cells(outR, 8).Value = nightV
        wsOut.Cells(outR, 9).Value = cores
        wsOut.Cells(outR, 10).Value = 기별_시설명칭(wsNw, facId, label)
        outR = outR + 1

        facCount = facCount + 1: coreSum = coreSum + cores
        If no = "신설" Then
            nNew = nNew + 1
        ElseIf no = "기설" Then
            nOld = nOld + 1
        End If
        If kind = "RN" Then
            nRN = nRN + 1
        ElseIf kind = "접속함체" Then
            nClo = nClo + 1
        End If
NextFac:
    Next r

    outR = outR + 1
    ' === 케이블 ===
    wsOut.Cells(outR, 1).Value = "[케이블]": outR = outR + 1
    Dim ch As Variant: ch = Array("ID(끝5)", "시작", "끝", "규격", "구분(상태)", "거리(m)", "거리반영")
    For c = 0 To UBound(ch): wsOut.Cells(outR, c + 1).Value = ch(c): Next c
    outR = outR + 1

    Dim cblCount As Long, nCNew As Long, nCRem As Long, nCOld As Long
    Dim distSum As Double: distSum = 0
    If Not wsCbl Is Nothing Then
        Dim lastC As Long: lastC = wsCbl.Cells(wsCbl.Rows.Count, 1).End(xlUp).Row
        For r = 2 To lastC
            Dim cblId As String: cblId = CStr(wsCbl.Cells(r, 1).Value)
            If Len(cblId) = 0 Then GoTo NextCbl
            Dim fId As String: fId = CStr(wsCbl.Cells(r, 2).Value)
            Dim tId As String: tId = CStr(wsCbl.Cells(r, 3).Value)
            Dim spec As String: spec = CStr(wsCbl.Cells(r, 4).Value)
            Dim gubun As String: gubun = CStr(wsCbl.Cells(r, 7).Value)
            Dim distS As String: distS = CStr(wsCbl.Cells(r, 8).Value)

            Dim fNm As String: fNm = fId
            If facName.Exists(fId) Then fNm = CStr(facName(fId))
            Dim tNm As String: tNm = tId
            If facName.Exists(tId) Then tNm = CStr(facName(tId))

            Dim reflect As String: reflect = 기별_거리반영(gubun)

            wsOut.Cells(outR, 1).Value = Right(cblId, 5)
            wsOut.Cells(outR, 2).Value = fNm
            wsOut.Cells(outR, 3).Value = tNm
            wsOut.Cells(outR, 4).Value = spec
            wsOut.Cells(outR, 5).Value = gubun
            wsOut.Cells(outR, 6).Value = distS
            wsOut.Cells(outR, 7).Value = reflect
            outR = outR + 1

            cblCount = cblCount + 1
            ' 거리 합계는 「거리 반영」 케이블만 (기설 제외 — owner 2026-06-16)
            If IsNumeric(distS) And InStr(gubun, "기설") = 0 Then distSum = distSum + CDbl(distS)
            If InStr(gubun, "신설") > 0 Then
                nCNew = nCNew + 1
            ElseIf InStr(gubun, "철거") > 0 Then
                nCRem = nCRem + 1
            ElseIf InStr(gubun, "기설") > 0 Then
                nCOld = nCOld + 1
            End If
NextCbl:
        Next r
    End If

    ' === 집계 ===
    outR = outR + 1
    wsOut.Cells(outR, 1).Value = "[집계]": outR = outR + 1
    wsOut.Cells(outR, 1).Value = "시설물": wsOut.Cells(outR, 2).Value = facCount: outR = outR + 1
    wsOut.Cells(outR, 1).Value = "  신설 / 기설": wsOut.Cells(outR, 2).Value = nNew & " / " & nOld: outR = outR + 1
    wsOut.Cells(outR, 1).Value = "  RN / 접속함체": wsOut.Cells(outR, 2).Value = nRN & " / " & nClo: outR = outR + 1
    wsOut.Cells(outR, 1).Value = "케이블": wsOut.Cells(outR, 2).Value = cblCount: outR = outR + 1
    wsOut.Cells(outR, 1).Value = "  신설 / 철거 / 기설": wsOut.Cells(outR, 2).Value = nCNew & " / " & nCRem & " / " & nCOld: outR = outR + 1
    wsOut.Cells(outR, 1).Value = "  반영거리 합(m, 기설제외)": wsOut.Cells(outR, 2).Value = distSum: outR = outR + 1
    wsOut.Cells(outR, 1).Value = "총 연결코어수": wsOut.Cells(outR, 2).Value = coreSum: outR = outR + 1

    ' === 범례 (검증용 — kind/구분/명칭. 종류 판정은 명칭 기준) ===
    outR = outR + 1
    wsOut.Cells(outR, 1).Value = "[범례 _범례 (kind·구분·명칭)]": outR = outR + 1
    Dim lh As Variant: lh = Array("도형명(끝5)", "kind", "구분", "명칭")
    For c = 0 To UBound(lh): wsOut.Cells(outR, c + 1).Value = lh(c): Next c
    outR = outR + 1
    Dim wsLeg As Worksheet: Set wsLeg = Nothing
    On Error Resume Next: Set wsLeg = ThisWorkbook.Worksheets(SHEET_META_LEG): On Error GoTo 0
    If Not wsLeg Is Nothing Then
        Dim lastL As Long: lastL = wsLeg.Cells(wsLeg.Rows.Count, 1).End(xlUp).Row
        For r = 2 To lastL
            wsOut.Cells(outR, 1).Value = Right(CStr(wsLeg.Cells(r, 1).Value), 5)
            wsOut.Cells(outR, 2).Value = CStr(wsLeg.Cells(r, 2).Value)
            wsOut.Cells(outR, 3).Value = CStr(wsLeg.Cells(r, 3).Value)
            wsOut.Cells(outR, 4).Value = CStr(wsLeg.Cells(r, 9).Value)
            outR = outR + 1
        Next r
    End If

    On Error Resume Next: wsOut.Columns("A:J").AutoFit: On Error GoTo 0
    Application.ScreenUpdating = True
    On Error Resume Next: wsOut.Activate: On Error GoTo 0

    MsgBox "기별 추출 미리보기 생성 완료 (시트: _기별_미리보기)" & vbLf & vbLf & _
           "시설물 " & facCount & " (신설 " & nNew & " / 기설 " & nOld & ", RN " & nRN & " / 접속함체 " & nClo & ")" & vbLf & _
           "케이블 " & cblCount & " (신설 " & nCNew & " / 철거 " & nCRem & " / 기설 " & nCOld & ")" & vbLf & _
           "반영거리 합 " & distSum & " m (기설 제외), 총 연결코어수 " & coreSum, vbInformation, "기별 추출 미리보기"
End Sub
