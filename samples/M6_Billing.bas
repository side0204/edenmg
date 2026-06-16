Attribute VB_Name = "M6_Billing"
Option Explicit

' ── Phase 3a 체인 직렬화용 모듈 상태 (기별_체인_직렬화_미리보기 가 채움) ──
Private mFacName As Object, mFacKind As Object, mFacBadge As Object
Private mFacNo As Object, mFacCore As Object, mFacDay As Object, mFacNight As Object
Private mCblFrom As Object, mCblTo As Object, mCblSpec As Object, mCblGubun As Object, mCblDist As Object
Private mChildren As Object, mWeight As Object
Private mSeq As Long, mOutR As Long, mSeg As Long
Private mWsOut As Worksheet
Private mCounted As Object                   ' 공종 집계 중복방지 (시설물 1회만)
' ── 공종 누적 (Phase 3b 산출) — owner §7-3 ──
Private mSumHW As Long, mSumHX As Long      ' 함체작업 주간/야간
Private mSumIA As Long, mSumIB As Long      ' FTTH 광탭작업 주간/야간
Private mSumIDc As Long, mSumIEc As Long    ' 코어접속 주간/야간
Private mSumIFc As Long                      ' 코어접속 성단
Private mSumGQ As Double                     ' 포설(주간) 신설 거리합

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

' ============================================================================
'  Phase 3a — 체인 직렬화 미리보기 (양식 채우기 전 행 순서 검증)
'  폼은 함체→경간→함체 선형. 케이블 인접그래프를 주경로(코어접속 누적 최다) 우선
'  DFS 로 직렬화 → _기별_미리보기 시트에 행 순서 덤프. 읽기전용(행정도/네트웍 미변경).
'  실행: Alt+F8 → 기별_체인_직렬화_미리보기
'  분기 처리(owner §3·§7-6): 분기점에서 가지를 코어접속 누적합 큰 쪽부터 재귀.
'  ※ 이원화/우회로의 여분 간선은 spanning tree 로 1개만 채택(미리보기 단계).
' ============================================================================
Public Sub 기별_체인_직렬화_미리보기()
    Dim wsFac As Worksheet, wsCbl As Worksheet, wsNw As Worksheet
    On Error Resume Next
    Set wsFac = ThisWorkbook.Worksheets(SHEET_META_FAC)
    Set wsCbl = ThisWorkbook.Worksheets(SHEET_META_CBL)
    Set wsNw = ThisWorkbook.Worksheets(SHEET_NETWORK)
    On Error GoTo 0
    If wsFac Is Nothing Then MsgBox "_시설물 메타 시트가 없습니다.", vbExclamation, "기별 직렬화": Exit Sub
    If wsCbl Is Nothing Then MsgBox "_케이블 메타 시트가 없습니다.", vbExclamation, "기별 직렬화": Exit Sub

    Application.ScreenUpdating = False

    ' 1) 시설물 메타 적재
    Set mFacName = CreateObject("Scripting.Dictionary")
    Set mFacKind = CreateObject("Scripting.Dictionary")
    Set mFacBadge = CreateObject("Scripting.Dictionary")
    Set mFacNo = CreateObject("Scripting.Dictionary")
    Set mFacCore = CreateObject("Scripting.Dictionary")
    Set mFacDay = CreateObject("Scripting.Dictionary")
    Set mFacNight = CreateObject("Scripting.Dictionary")
    Dim lastF As Long: lastF = wsFac.Cells(wsFac.Rows.Count, 1).End(xlUp).Row
    Dim r As Long
    For r = 2 To lastF
        Dim fId As String: fId = CStr(wsFac.Cells(r, 1).Value)
        If Len(fId) > 0 Then
            Dim lbl As String: lbl = CStr(wsFac.Cells(r, 2).Value)
            mFacName(fId) = CStr(wsFac.Cells(r, 3).Value)
            mFacBadge(fId) = CStr(wsFac.Cells(r, 5).Value)
            mFacNo(fId) = 기별_신설기설(lbl)
            mFacKind(fId) = 기별_시설종류(wsNw, fId, lbl)
            Dim dV As String, nV As String: dV = "": nV = ""
            On Error Resume Next: 상태박스_값_읽기 wsNw, fId, dV, nV: On Error GoTo 0
            mFacDay(fId) = dV: mFacNight(fId) = nV
            Dim cc As Long: cc = 0
            On Error Resume Next: cc = 시설물_연결코어수_계산(wsNw, fId): On Error GoTo 0
            mFacCore(fId) = cc
        End If
    Next r

    ' 2) 케이블 인접그래프 + 메타
    Set mCblFrom = CreateObject("Scripting.Dictionary")
    Set mCblTo = CreateObject("Scripting.Dictionary")
    Set mCblSpec = CreateObject("Scripting.Dictionary")
    Set mCblGubun = CreateObject("Scripting.Dictionary")
    Set mCblDist = CreateObject("Scripting.Dictionary")
    Dim adj As Object: Set adj = CreateObject("Scripting.Dictionary")
    Dim lastC As Long: lastC = wsCbl.Cells(wsCbl.Rows.Count, 1).End(xlUp).Row
    For r = 2 To lastC
        Dim cId As String: cId = CStr(wsCbl.Cells(r, 1).Value)
        Dim ff As String: ff = CStr(wsCbl.Cells(r, 2).Value)
        Dim tt As String: tt = CStr(wsCbl.Cells(r, 3).Value)
        If Len(cId) > 0 And Len(ff) > 0 And Len(tt) > 0 Then
            mCblFrom(cId) = ff: mCblTo(cId) = tt
            mCblSpec(cId) = CStr(wsCbl.Cells(r, 4).Value)
            mCblGubun(cId) = CStr(wsCbl.Cells(r, 7).Value)
            mCblDist(cId) = CStr(wsCbl.Cells(r, 8).Value)
            기별_adj_추가 adj, ff, tt, cId
            기별_adj_추가 adj, tt, ff, cId
        End If
    Next r

    ' 3) 출력 시트 헤더
    Set mWsOut = 기별_미리보기_시트확보()
    mWsOut.Cells.Clear
    mOutR = 1
    mWsOut.Cells(mOutR, 1).Value = "■ 기별 체인 직렬화 미리보기 (Phase 3a · 주경로 우선 · 읽기전용)": mOutR = mOutR + 2
    Dim hh As Variant
    hh = Array("구간", "순번", "타입", "함체명/구간", "역할", "종류", "배지", "신설/기설", "코어수", "주간", "야간", "규격", "거리(m)", "거리반영", "비고(JM)", "함체작업/광탭", "코어접속", "포설")
    Dim c As Long
    For c = 0 To UBound(hh): mWsOut.Cells(mOutR, c + 1).Value = hh(c): Next c
    mOutR = mOutR + 1
    mSeq = 0: mSeg = 0
    mSumHW = 0: mSumHX = 0: mSumIA = 0: mSumIB = 0: mSumIDc = 0: mSumIEc = 0: mSumIFc = 0: mSumGQ = 0

    ' 4) 연결요소별 직렬화
    Set mChildren = CreateObject("Scripting.Dictionary")
    Set mWeight = CreateObject("Scripting.Dictionary")
    Set mCounted = CreateObject("Scripting.Dictionary")
    Dim gv As Object: Set gv = CreateObject("Scripting.Dictionary")
    Dim compCount As Long: compCount = 0
    Dim startKey As Variant
    For Each startKey In adj.Keys
        Dim sNode As String: sNode = CStr(startKey)
        If Not gv.Exists(sNode) Then
            Dim comp As Object: Set comp = CreateObject("Scripting.Dictionary")
            기별_연결요소_수집 adj, sNode, comp
            Dim root As String: root = 기별_루트선택(adj, comp)
            기별_트리_구성 adj, root, gv
            compCount = compCount + 1
            mWsOut.Cells(mOutR, 1).Value = "■ 체인 " & compCount
            mWsOut.Cells(mOutR, 4).Value = "(루트: " & 기별_disp(root) & ")"
            mOutR = mOutR + 1
            기별_구간_방출 root, "", Empty, True
        End If
    Next startKey

    ' 5) 미연결 시설물 (케이블 없음)
    Dim orphanHeader As Boolean: orphanHeader = False
    For r = 2 To lastF
        Dim oId As String: oId = CStr(wsFac.Cells(r, 1).Value)
        If Len(oId) > 0 Then
            If Not adj.Exists(oId) Then
                If Not orphanHeader Then
                    mOutR = mOutR + 1
                    mWsOut.Cells(mOutR, 1).Value = "── 미연결 시설물 (케이블 없음) ──": mOutR = mOutR + 1
                    orphanHeader = True
                End If
                기별_방출_함체 oId, 0, "단독"
            End If
        End If
    Next r

    ' === 공종 집계 (양식에 들어갈 최종 수량 — owner §7-3) ===
    mOutR = mOutR + 1
    mWsOut.Cells(mOutR, 1).Value = "[공종 집계 — 양식 입력 수량]": mOutR = mOutR + 1
    기별_집계행 "함체작업 주간 (HW)", mSumHW, "개소"
    기별_집계행 "함체작업 야간 (HX)", mSumHX, "개소"
    기별_집계행 "FTTH 광탭작업 주간 (IA)", mSumIA, "개소"
    기별_집계행 "FTTH 광탭작업 야간 (IB)", mSumIB, "개소"
    기별_집계행 "코어접속 주간 (ID)", mSumIDc, "코어"
    기별_집계행 "코어접속 야간 (IE)", mSumIEc, "코어"
    기별_집계행 "코어접속 성단 (IF)", mSumIFc, "코어"
    기별_집계행 "광케이블 포설 주간 (GQ)", mSumGQ, "m"
    mOutR = mOutR + 1
    mWsOut.Cells(mOutR, 1).Value = "※ 주야 판정: 야간코어>0 이면 함체작업/광탭=야간, 아니면 주간 (owner 확인 필요)": mOutR = mOutR + 1
    mWsOut.Cells(mOutR, 1).Value = "※ 포설: 신설 케이블 거리만 GQ(주간). 철거·기설은 별도/미반영. 야간포설(GS)·이설(GT)은 설계 입력 추가 시 분기": mOutR = mOutR + 1
    mWsOut.Cells(mOutR, 1).Value = "※ 자재 열(케이블규격·함체규격·RN종류 → I~BR)은 매핑 확정 후 Phase 3c": mOutR = mOutR + 1

    On Error Resume Next: mWsOut.Columns("A:R").AutoFit: On Error GoTo 0
    Application.ScreenUpdating = True
    On Error Resume Next: mWsOut.Activate: On Error GoTo 0
    MsgBox "체인 직렬화 + 공종 산출 미리보기 완료 (시트: _기별_미리보기)" & vbLf & vbLf & _
           "체인 " & compCount & " 개" & vbLf & _
           "함체작업 주/야 " & mSumHW & " / " & mSumHX & " · 광탭 주/야 " & mSumIA & " / " & mSumIB & vbLf & _
           "코어접속 주/야/성단 " & mSumIDc & " / " & mSumIEc & " / " & mSumIFc & vbLf & _
           "포설(주간) " & mSumGQ & " m" & vbLf & vbLf & _
           "행 순서·공종 수량을 확인하세요.", vbInformation, "기별 산출"
End Sub

' 공종 집계 한 행 출력 (이름·수량·단위).
Private Sub 기별_집계행(ByVal nm As String, ByVal qty As Variant, ByVal unit As String)
    mWsOut.Cells(mOutR, 1).Value = nm
    mWsOut.Cells(mOutR, 2).Value = qty
    mWsOut.Cells(mOutR, 3).Value = unit
    mOutR = mOutR + 1
End Sub

' 인접리스트 추가 (M5 거리_인접추가 는 Private 라 M6 자체 보유).
Private Sub 기별_adj_추가(adj As Object, fromFac As String, toFac As String, cblId As String)
    Dim col As Collection
    If adj.Exists(fromFac) Then
        Set col = adj(fromFac)
    Else
        Set col = New Collection
        Set adj(fromFac) = col
    End If
    col.Add Array(toFac, cblId)
End Sub

' 연결요소 노드 수집 (BFS).
Private Sub 기별_연결요소_수집(adj As Object, startNode As String, comp As Object)
    Dim q As Collection: Set q = New Collection
    q.Add startNode
    comp(startNode) = True
    Do While q.Count > 0
        Dim cur As String: cur = CStr(q(1)): q.Remove 1
        If adj.Exists(cur) Then
            Dim nbrs As Collection: Set nbrs = adj(cur)
            Dim k As Long
            For k = 1 To nbrs.Count
                Dim e As Variant: e = nbrs(k)
                Dim nb As String: nb = CStr(e(0))
                If Not comp.Exists(nb) Then
                    comp(nb) = True
                    q.Add nb
                End If
            Next k
        End If
    Loop
End Sub

' 루트 선택 — 국사(명칭/종류) > 차수1(말단) > 첫 노드.
Private Function 기별_루트선택(adj As Object, comp As Object) As String
    Dim rootStation As String: rootStation = ""
    Dim rootLeaf As String: rootLeaf = ""
    Dim firstNode As String: firstNode = ""
    Dim kk As Variant
    For Each kk In comp.Keys
        Dim node As String: node = CStr(kk)
        If Len(firstNode) = 0 Then firstNode = node
        Dim nm As String: nm = ""
        If mFacName.Exists(node) Then nm = CStr(mFacName(node))
        Dim kd As String: kd = ""
        If mFacKind.Exists(node) Then kd = CStr(mFacKind(node))
        If Len(rootStation) = 0 Then
            If InStr(nm, "국사") > 0 Or InStr(kd, "국사") > 0 Then rootStation = node
        End If
        If Len(rootLeaf) = 0 Then
            Dim deg As Long: deg = 0
            If adj.Exists(node) Then deg = adj(node).Count
            If deg = 1 Then rootLeaf = node
        End If
    Next kk
    If Len(rootStation) > 0 Then
        기별_루트선택 = rootStation
    ElseIf Len(rootLeaf) > 0 Then
        기별_루트선택 = rootLeaf
    Else
        기별_루트선택 = firstNode
    End If
End Function

' 스패닝 트리 구성 (BFS) — mChildren 채움 + gv(전역 방문) 갱신.
Private Sub 기별_트리_구성(adj As Object, root As String, gv As Object)
    Dim q As Collection: Set q = New Collection
    q.Add root
    gv(root) = True
    Set mChildren(root) = New Collection
    Do While q.Count > 0
        Dim cur As String: cur = CStr(q(1)): q.Remove 1
        If adj.Exists(cur) Then
            Dim nbrs As Collection: Set nbrs = adj(cur)
            Dim k As Long
            For k = 1 To nbrs.Count
                Dim e As Variant: e = nbrs(k)
                Dim nb As String: nb = CStr(e(0))
                Dim cb As String: cb = CStr(e(1))
                If Not gv.Exists(nb) Then
                    gv(nb) = True
                    mChildren(cur).Add Array(nb, cb)
                    Set mChildren(nb) = New Collection
                    q.Add nb
                End If
            Next k
        End If
    Loop
End Sub

' 서브트리 가중치(코어접속 누적합) — 메모이즈.
Private Function 기별_가중치(node As String) As Long
    If mWeight.Exists(node) Then 기별_가중치 = CLng(mWeight(node)): Exit Function
    Dim w As Long: w = 0
    If mFacCore.Exists(node) Then w = CLng(mFacCore(node))
    If mChildren.Exists(node) Then
        Dim ch As Collection: Set ch = mChildren(node)
        Dim k As Long
        For k = 1 To ch.Count
            Dim e As Variant: e = ch(k)
            w = w + 기별_가중치(CStr(e(0)))
        Next k
    End If
    mWeight(node) = w
    기별_가중치 = w
End Function

' 자식을 가중치 내림차순 정렬 (큰 가지부터). 삽입정렬(안정).
Private Function 기별_자식정렬(node As String) As Collection
    Dim out As Collection: Set out = New Collection
    Set 기별_자식정렬 = out
    If Not mChildren.Exists(node) Then Exit Function
    Dim ch As Collection: Set ch = mChildren(node)
    Dim n As Long: n = ch.Count
    If n = 0 Then Exit Function
    Dim items() As Variant: ReDim items(1 To n)
    Dim wts() As Long: ReDim wts(1 To n)
    Dim k As Long
    For k = 1 To n
        Dim e As Variant: e = ch(k)
        items(k) = e
        wts(k) = 기별_가중치(CStr(e(0)))
    Next k
    Dim i As Long, j As Long
    For i = 2 To n
        Dim keyItem As Variant: keyItem = items(i)
        Dim keyW As Long: keyW = wts(i)
        j = i - 1
        Do While j >= 1
            If wts(j) >= keyW Then Exit Do
            items(j + 1) = items(j)
            wts(j + 1) = wts(j)
            j = j - 1
        Loop
        items(j + 1) = keyItem
        wts(j + 1) = keyW
    Next i
    For k = 1 To n: out.Add items(k): Next k
End Function

' 구간 방출 (heavy-path 분해, 재귀) — owner 2026-06-16.
'   폼은 구간 단위 (함체→경간→…→함체 선형). 분기가 갈라지면 분기점 함체를 다시 「시작」으로
'   재기재한 새 구간을 만든다. 예) 함체2 는 구간1 에선 경유, 구간2(함체2~함체5) 에선 시작.
'   headNode = 이 구간의 시작 함체. inCable = head 진입 케이블("" — 시작은 앞 경간 없음).
'   firstEdge = head 에서 첫 내려갈 자식 간선(Array(child,cbl)). 분기 구간은 그 분기 자식으로 강제,
'     루트 구간은 Empty → head 의 heaviest child 자동. 이후는 매 노드 heaviest child 로 연장.
'   headOwns = head 의 「나머지 자식」도 이 구간이 분기로 소유하는가. 루트=True, 분기구간=False
'     (분기구간의 head 자식들은 부모 구간 소유 → 중복 방지).
Private Sub 기별_구간_방출(headNode As String, inCable As String, ByVal firstEdge As Variant, headOwns As Boolean)
    ' 1) 구간 경로 노드 수집 (진입케이블, 노드)
    Dim seqCbl As Collection: Set seqCbl = New Collection
    Dim seqNode As Collection: Set seqNode = New Collection
    seqCbl.Add inCable: seqNode.Add headNode
    Dim cur As String: cur = headNode
    Dim forced As Variant: forced = firstEdge
    Do
        Dim nextEdge As Variant
        If Not IsEmpty(forced) Then
            nextEdge = forced: forced = Empty
        Else
            Dim kk As Collection: Set kk = 기별_자식정렬(cur)
            If kk.Count > 0 Then nextEdge = kk(1) Else nextEdge = Empty
        End If
        If IsEmpty(nextEdge) Then Exit Do
        seqCbl.Add CStr(nextEdge(1)): seqNode.Add CStr(nextEdge(0))
        cur = CStr(nextEdge(0))
    Loop

    ' 2) 간선 단위 방출 — owner 2026-06-16: 모든 구간을 시작~종료로. 케이블 1개 = 구간 1개.
    Dim total As Long: total = seqNode.Count
    Dim i As Long
    If total = 1 Then
        ' 간선 없는 단독 노드 (자식 없는 루트)
        mSeg = mSeg + 1
        기별_구간헤더 mSeg
        기별_방출_함체 CStr(seqNode(1)), mSeg, "시작·종료"
    Else
        For i = 1 To total - 1
            mSeg = mSeg + 1
            기별_구간헤더 mSeg
            기별_방출_함체 CStr(seqNode(i)), mSeg, "시작"
            기별_방출_경간 CStr(seqCbl(i + 1)), mSeg
            기별_방출_함체 CStr(seqNode(i + 1)), mSeg, "종료"
        Next i
    End If

    ' 3) 분기 수집 — 노드 순서대로, 노드당 가중치 내림차순. 분기구간은 head(index1) 제외.
    Dim startIdx As Long
    If headOwns Then startIdx = 1 Else startIdx = 2
    Dim branches As Collection: Set branches = New Collection
    For i = startIdx To total
        Dim bNode As String: bNode = CStr(seqNode(i))
        Dim contChild As String: contChild = ""
        If i < total Then contChild = CStr(seqNode(i + 1))
        Dim kids2 As Collection: Set kids2 = 기별_자식정렬(bNode)
        Dim j As Long
        For j = 1 To kids2.Count
            Dim ke As Variant: ke = kids2(j)
            If CStr(ke(0)) <> contChild Then branches.Add Array(bNode, ke)
        Next j
    Next i

    ' 4) 재귀 — 각 분기는 branchNode(시작)에서 그 자식 간선으로 내려감 (head 미소유).
    Dim b As Long
    For b = 1 To branches.Count
        Dim br As Variant: br = branches(b)
        기별_구간_방출 CStr(br(0)), "", br(1), False
    Next b
End Sub

' 구간 헤더 한 줄.
Private Sub 기별_구간헤더(ByVal segNo As Long)
    mWsOut.Cells(mOutR, 1).Value = "구간 " & segNo
    mWsOut.Cells(mOutR, 4).Value = "── 구간 " & segNo & " ──"
    mOutR = mOutR + 1
End Sub

Private Sub 기별_방출_함체(node As String, segNo As Long, role As String)
    mSeq = mSeq + 1
    ' 중복 등장 판정 — 같은 시설물이 인접 구간의 종료·시작으로 두 번 이상 나옴. 공종은 첫 회만 집계.
    Dim firstTime As Boolean: firstTime = True
    If mCounted.Exists(node) Then
        firstTime = False
    Else
        mCounted(node) = True
    End If
    Dim nm As String: nm = "": If mFacName.Exists(node) Then nm = CStr(mFacName(node))
    Dim kd As String: kd = "": If mFacKind.Exists(node) Then kd = CStr(mFacKind(node))
    Dim bg As String: bg = "": If mFacBadge.Exists(node) Then bg = CStr(mFacBadge(node))
    Dim no As String: no = "": If mFacNo.Exists(node) Then no = CStr(mFacNo(node))
    Dim dv As String: dv = "": If mFacDay.Exists(node) Then dv = CStr(mFacDay(node))
    Dim nv As String: nv = "": If mFacNight.Exists(node) Then nv = CStr(mFacNight(node))
    Dim ccS As String: ccS = "": If mFacCore.Exists(node) Then ccS = CStr(mFacCore(node))
    ' 공종 산출 (owner §7-3) — 코어접속 발생 시 종류별. 주야 = 상태박스 day/night.
    '   같은 시설물이 여러 구간에 시작/종료로 중복 등장 → 공종은 첫 등장(firstTime) 1회만 집계.
    Dim workTxt As String: workTxt = ""
    Dim coreTxt As String: coreTxt = ""
    If Not firstTime Then
        workTxt = "(중복-집계제외)"
    Else
        Dim total As Long: total = 0: If Len(ccS) > 0 And IsNumeric(ccS) Then total = CLng(ccS)
        Dim nightN As Long: nightN = 기별_숫자(nv)
        Dim dayN As Long
        If Len(dv) > 0 And IsNumeric(dv) Then dayN = CLng(dv) Else dayN = total - nightN
        If dayN < 0 Then dayN = 0
        If total > 0 Then
            If kd = "RN" Then
                ' FTTH 광탭작업 = 1 (주간 IA / 야간 IB), 코어접속 주간 ID / 야간 IE
                If nightN > 0 Then
                    workTxt = "광탭 IB(야간)=1": mSumIB = mSumIB + 1
                Else
                    workTxt = "광탭 IA(주간)=1": mSumIA = mSumIA + 1
                End If
                coreTxt = "ID(주)=" & dayN & " / IE(야)=" & nightN
                mSumIDc = mSumIDc + dayN: mSumIEc = mSumIEc + nightN
            ElseIf kd = "접속함체" Then
                ' 함체작업 = 1 (주간 HW / 야간 HX, 하나만), 코어접속 주간 ID / 야간 IE
                If nightN > 0 Then
                    workTxt = "함체작업 HX(야간)=1": mSumHX = mSumHX + 1
                Else
                    workTxt = "함체작업 HW(주간)=1": mSumHW = mSumHW + 1
                End If
                coreTxt = "ID(주)=" & dayN & " / IE(야)=" & nightN
                mSumIDc = mSumIDc + dayN: mSumIEc = mSumIEc + nightN
            Else
                ' 그 외 시설물 — 성단 IF 에만
                coreTxt = "IF(성단)=" & total
                mSumIFc = mSumIFc + total
            End If
        End If
    End If
    If segNo > 0 Then mWsOut.Cells(mOutR, 1).Value = "구간 " & segNo
    mWsOut.Cells(mOutR, 2).Value = mSeq
    mWsOut.Cells(mOutR, 3).Value = "함체"
    mWsOut.Cells(mOutR, 4).Value = nm
    mWsOut.Cells(mOutR, 5).Value = role
    mWsOut.Cells(mOutR, 6).Value = kd
    mWsOut.Cells(mOutR, 7).Value = bg
    mWsOut.Cells(mOutR, 8).Value = no
    mWsOut.Cells(mOutR, 9).Value = ccS
    mWsOut.Cells(mOutR, 10).Value = dv
    mWsOut.Cells(mOutR, 11).Value = nv
    mWsOut.Cells(mOutR, 15).Value = 기별_비고(no, kd)
    mWsOut.Cells(mOutR, 16).Value = workTxt
    mWsOut.Cells(mOutR, 17).Value = coreTxt
    mOutR = mOutR + 1
End Sub

' 숫자 문자열 → Long (비숫자/공란 = 0).
Private Function 기별_숫자(ByVal s As String) As Long
    기별_숫자 = 0
    s = Trim(s)
    If Len(s) > 0 And IsNumeric(s) Then 기별_숫자 = CLng(s)
End Function

Private Sub 기별_방출_경간(cblId As String, segNo As Long)
    mSeq = mSeq + 1
    Dim sp As String: sp = "": If mCblSpec.Exists(cblId) Then sp = CStr(mCblSpec(cblId))
    Dim gb As String: gb = "": If mCblGubun.Exists(cblId) Then gb = CStr(mCblGubun(cblId))
    Dim ds As String: ds = "": If mCblDist.Exists(cblId) Then ds = CStr(mCblDist(cblId))
    Dim ffN As String: ffN = "": If mCblFrom.Exists(cblId) Then ffN = 기별_disp(CStr(mCblFrom(cblId)))
    Dim ttN As String: ttN = "": If mCblTo.Exists(cblId) Then ttN = 기별_disp(CStr(mCblTo(cblId)))
    ' 포설 (owner §7-3·§7-9): 신설 케이블 거리 → 주간 GQ. 철거는 별도 시트, 기설은 미반영.
    Dim layTxt As String: layTxt = ""
    Dim distN As Double: distN = 0: If Len(ds) > 0 And IsNumeric(ds) Then distN = CDbl(ds)
    If InStr(gb, "신설") > 0 Then
        layTxt = "GQ(주간)=" & ds
        mSumGQ = mSumGQ + distN
    ElseIf InStr(gb, "철거") > 0 Then
        layTxt = "철거(별도시트)"
    ElseIf InStr(gb, "기설") > 0 Then
        layTxt = "기설(미반영)"
    End If
    mWsOut.Cells(mOutR, 1).Value = "구간 " & segNo
    mWsOut.Cells(mOutR, 2).Value = mSeq
    mWsOut.Cells(mOutR, 3).Value = "경간"
    mWsOut.Cells(mOutR, 4).Value = "    " & ffN & " ~ " & ttN
    mWsOut.Cells(mOutR, 12).Value = sp
    mWsOut.Cells(mOutR, 13).Value = ds
    mWsOut.Cells(mOutR, 14).Value = 기별_거리반영(gb)
    mWsOut.Cells(mOutR, 18).Value = layTxt
    mOutR = mOutR + 1
End Sub

' 표시명 — 시설명 있으면 그대로, 없으면 ID 끝5자.
Private Function 기별_disp(facId As String) As String
    If mFacName.Exists(facId) Then
        Dim nm As String: nm = CStr(mFacName(facId))
        If Len(nm) > 0 Then 기별_disp = nm: Exit Function
    End If
    기별_disp = Right(facId, 5)
End Function

' 비고(JM) = 신설/기설 + 종류 → 신설함체·기설RN 등.
Private Function 기별_비고(no As String, kind As String) As String
    Dim t As String
    If kind = "RN" Then
        t = "RN"
    ElseIf kind = "접속함체" Then
        t = "함체"
    Else
        t = kind
    End If
    기별_비고 = no & t
End Function
