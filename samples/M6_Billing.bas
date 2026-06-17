Attribute VB_Name = "M6_Billing"
Option Explicit

' ── Phase 3a 체인 직렬화용 모듈 상태 (기별_체인_직렬화_미리보기 가 채움) ──
Private mFacName As Object, mFacKind As Object, mFacBadge As Object
Private mFacNo As Object, mFacCore As Object, mFacDay As Object, mFacNight As Object
Private mCblFrom As Object, mCblTo As Object, mCblSpec As Object, mCblGubun As Object, mCblDist As Object
Private mChildren As Object, mWeight As Object
Private mFacLegend As Object, mFacGyuk As Object  ' 범례명칭(직선형 등)·규격(콜아웃)
Private mSeq As Long, mOutR As Long, mSeg As Long
Private mWsOut As Worksheet
Private mCounted As Object                   ' 공종 집계 중복방지 (시설물 1회만)
Private mMatQty As Object                     ' 자재열(폼 열문자) → 수량 누적 (Phase 3c)
Private mSegList As Object                    ' 구간 리스트 Array(start,cbl,end) — 양식 채우기 공유 (Phase 3d)
Private mCollectOnly As Boolean               ' True 면 기별_구간_방출 이 emit 안 하고 mSegList 수집만
Private mUsedCols As Object                    ' 양식에서 값 기입한 열 (끝에 숨김 해제) (Phase 3d)
' ── 공종 누적 (Phase 3b 산출) — owner §7-3 ──
Private mSumHW As Long, mSumHX As Long      ' 함체작업 주간/야간
Private mSumIA As Long, mSumIB As Long      ' FTTH 광탭작업 주간/야간
Private mSumIDc As Long, mSumIEc As Long    ' 코어접속 주간/야간
Private mSumIFc As Long                      ' 코어접속 성단
Private mSumIJ As Long                       ' FTTH 레벨측정시험 (RN 코어연결 시, 개소)
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

' 시설 명칭/종류/규격 — 네트웍 우선, 없으면 행정도 폴백 (owner 2026-06-16).
'   철거 시설물은 네트웍구성도에 안 그려지고 행정도에만 있음 → 네트웍에서 못 읽으면 행정도 콜아웃에서 읽음.
'   신설 시설은 네트웍에서 그대로 해결되어 기존 동작 불변.
Public Function 기별_시설명칭_양도면(wsN As Worksheet, wsA As Worksheet, ByVal facId As String, ByVal fallbackGubun As String) As String
    Dim s As String: s = 기별_시설명칭(wsN, facId, fallbackGubun)
    If Len(s) = 0 Then s = 기별_시설명칭(wsA, facId, fallbackGubun)
    기별_시설명칭_양도면 = s
End Function
Public Function 기별_시설종류_양도면(wsN As Worksheet, wsA As Worksheet, ByVal facId As String, ByVal label As String) As String
    Dim k As String: k = 기별_시설종류(wsN, facId, label)
    If k = "그외" Then
        Dim k2 As String: k2 = 기별_시설종류(wsA, facId, label)
        If k2 <> "그외" Then k = k2
    End If
    기별_시설종류_양도면 = k
End Function
Public Function 기별_시설규격_양도면(wsN As Worksheet, wsA As Worksheet, ByVal facId As String) As String
    Dim g As String: g = 기별_시설규격(wsN, facId)
    If Len(g) = 0 Then g = 기별_시설규격(wsA, facId)
    기별_시설규격_양도면 = g
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
    Dim wsFac As Worksheet, wsCbl As Worksheet, wsNw As Worksheet, wsAdmin As Worksheet
    On Error Resume Next
    Set wsFac = ThisWorkbook.Worksheets(SHEET_META_FAC)
    Set wsCbl = ThisWorkbook.Worksheets(SHEET_META_CBL)
    Set wsNw = ThisWorkbook.Worksheets(SHEET_NETWORK)
    Set wsAdmin = ThisWorkbook.Worksheets(SHEET_ADMIN)
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
        Dim kind As String: kind = 기별_시설종류_양도면(wsNw, wsAdmin, facId, label)
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
        wsOut.Cells(outR, 10).Value = 기별_시설명칭_양도면(wsNw, wsAdmin, facId, label)
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
    wsOut.Cells(outR, 1).Value = "  신설 / 기설": wsOut.Cells(outR, 2).Value = nNew & " · " & nOld: outR = outR + 1
    wsOut.Cells(outR, 1).Value = "  RN / 접속함체": wsOut.Cells(outR, 2).Value = nRN & " · " & nClo: outR = outR + 1
    wsOut.Cells(outR, 1).Value = "케이블": wsOut.Cells(outR, 2).Value = cblCount: outR = outR + 1
    wsOut.Cells(outR, 1).Value = "  신설 / 철거 / 기설": wsOut.Cells(outR, 2).Value = nCNew & " · " & nCRem & " · " & nCOld: outR = outR + 1
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
'  검증 미리보기 (합계 대조 · 커버리지) — owner 2026-06-16
'  _케이블 메타의 모든 케이블이 실제로 신설/철거 시트에 반영되는지 대조.
'  신설/기설은 트리 직렬화(mSegList)에 들어가야 반영됨 → 비-트리 간선(병렬·순환)은 누락.
'  철거는 직접 스캔이라 항상 반영. 규격이 폼 열에 매핑 안 되면 자재열 누락 경고.
'  ※ 읽기전용. 실행: Alt+F8 → 기별_검증_미리보기
' ============================================================================
Public Sub 기별_검증_미리보기()
    Dim wsFac As Worksheet, wsCbl As Worksheet, wsNw As Worksheet, wsAdmin As Worksheet
    On Error Resume Next
    Set wsFac = ThisWorkbook.Worksheets(SHEET_META_FAC)
    Set wsCbl = ThisWorkbook.Worksheets(SHEET_META_CBL)
    Set wsNw = ThisWorkbook.Worksheets(SHEET_NETWORK)
    Set wsAdmin = ThisWorkbook.Worksheets(SHEET_ADMIN)
    On Error GoTo 0
    If wsFac Is Nothing Or wsCbl Is Nothing Then MsgBox "_시설물/_케이블 메타가 없습니다.", vbExclamation, "기별 검증": Exit Sub

    Application.ScreenUpdating = False

    ' 1) 시설 메타 — 직렬화(기별_루트선택·기별_가중치)가 mFacName/mFacKind/mFacCore 를 읽으므로 반드시 채움.
    '   (안 채우면 mFacName 이 Nothing → 기별_루트선택 의 mFacName.Exists 에서 런타임 오류 91)
    Set mFacName = CreateObject("Scripting.Dictionary")
    Set mFacKind = CreateObject("Scripting.Dictionary")
    Set mFacCore = CreateObject("Scripting.Dictionary")
    Dim lastF As Long: lastF = wsFac.Cells(wsFac.Rows.Count, 1).End(xlUp).Row
    Dim r As Long
    For r = 2 To lastF
        Dim fId0 As String: fId0 = CStr(wsFac.Cells(r, 1).Value)
        If Len(fId0) > 0 Then
            Dim lbl0 As String: lbl0 = CStr(wsFac.Cells(r, 2).Value)
            mFacName(fId0) = 기별_시설명(wsAdmin, wsNw, fId0, CStr(wsFac.Cells(r, 3).Value))
            mFacKind(fId0) = 기별_시설종류_양도면(wsNw, wsAdmin, fId0, lbl0)
            Dim cc0 As Long: cc0 = 0
            On Error Resume Next: cc0 = 시설물_연결코어수_계산(wsNw, fId0): On Error GoTo 0
            mFacCore(fId0) = cc0
        End If
    Next r

    ' 2) 케이블 메타 + 인접그래프 (직렬화로 신설/기설 커버리지 판정)
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

    ' 3) 직렬화 → mSegList. 신설/기설 커버리지 = mSegList 에 등장한 케이블 집합
    Set mChildren = CreateObject("Scripting.Dictionary")
    Set mWeight = CreateObject("Scripting.Dictionary")
    Set mSegList = New Collection
    Dim gv As Object: Set gv = CreateObject("Scripting.Dictionary")
    mCollectOnly = True
    Dim sk As Variant
    For Each sk In adj.Keys
        Dim sNode As String: sNode = CStr(sk)
        If Not gv.Exists(sNode) Then
            Dim comp As Object: Set comp = CreateObject("Scripting.Dictionary")
            기별_연결요소_수집 adj, sNode, comp
            Dim root As String: root = 기별_루트선택(adj, comp)
            기별_트리_구성 adj, root, gv
            기별_구간_방출 root, "", Empty, True
        End If
    Next sk
    mCollectOnly = False
    Dim inSeg As Object: Set inSeg = CreateObject("Scripting.Dictionary")
    Dim si As Long
    For si = 1 To mSegList.Count
        Dim rc0 As Variant: rc0 = mSegList(si)
        Dim cc As String: cc = CStr(rc0(1))
        If Len(cc) > 0 Then inSeg(cc) = True
    Next si

    ' 4) 출력 시트
    Dim wsOut As Worksheet: Set wsOut = 기별_미리보기_시트확보()
    wsOut.Cells.Clear
    Dim o As Long: o = 1
    wsOut.Cells(o, 1).Value = "■ 기별 검증 미리보기 (합계 대조·커버리지 · 읽기전용)": o = o + 2
    wsOut.Cells(o, 1).Value = "[케이블 반영 검증] — 메타의 모든 케이블이 신설/철거 시트에 반영되는지": o = o + 1
    Dim hh As Variant: hh = Array("ID(끝5)", "시작", "끝", "규격", "구분", "거리", "상태", "대상시트", "규격열", "반영", "사유")
    Dim c As Long: For c = 0 To UBound(hh): wsOut.Cells(o, c + 1).Value = hh(c): Next c
    o = o + 1

    Dim nOK As Long, nMiss As Long, nRem As Long, nNew As Long, nOld As Long
    Dim distNewSum As Double, distRemSum As Double
    For r = 2 To lastC
        Dim cbId As String: cbId = CStr(wsCbl.Cells(r, 1).Value)
        If Len(cbId) = 0 Then GoTo NextC
        Dim fId As String: fId = CStr(wsCbl.Cells(r, 2).Value)
        Dim tId As String: tId = CStr(wsCbl.Cells(r, 3).Value)
        Dim sp As String: sp = CStr(wsCbl.Cells(r, 4).Value)
        Dim gb As String: gb = CStr(wsCbl.Cells(r, 7).Value)
        Dim ds As String: ds = CStr(wsCbl.Cells(r, 8).Value)
        Dim isRem As Boolean: isRem = (InStr(gb, "철거") > 0 Or InStr(sp, "철거") > 0)
        Dim status As String, target As String, colTxt As String, ok As String, why As String
        status = "": target = "": colTxt = "": ok = "": why = ""
        If isRem Then
            status = "철거": target = "철거시트"
            colTxt = 기별_철거케이블열(sp, gb)
            ok = "O": why = "직접 스캔(항상 반영)"
            If Len(colTxt) = 0 Then why = "거리·철거공종은 반영, 규격 자재열 미매핑(" & sp & ")"
            nRem = nRem + 1
            If IsNumeric(ds) Then distRemSum = distRemSum + CDbl(ds)
        Else
            status = 기별_신설기설(gb)
            If status = "기설" Then
                target = "신설시트(공종만)": nOld = nOld + 1
            Else
                target = "신설시트": status = "신설": nNew = nNew + 1
                If IsNumeric(ds) Then distNewSum = distNewSum + CDbl(ds)
            End If
            Dim mc As String, mn As String: mc = "": mn = ""
            기별_케이블열 sp, gb, status, mc, mn
            colTxt = mc
            If inSeg.Exists(cbId) Then
                ok = "O": why = ""
                If status <> "기설" And Len(mc) = 0 Then why = "거리·포설은 반영, 규격 자재열 미매핑(" & mn & ")"
            Else
                ok = "X": why = "직렬화 누락 — 비-트리 간선(병렬·순환). 시작/끝 시설 확인 필요"
            End If
        End If

        Dim fNm As String: fNm = fId: If mFacName.Exists(fId) Then fNm = CStr(mFacName(fId))
        Dim tNm As String: tNm = tId: If mFacName.Exists(tId) Then tNm = CStr(mFacName(tId))
        wsOut.Cells(o, 1).Value = Right(cbId, 5)
        wsOut.Cells(o, 2).Value = fNm
        wsOut.Cells(o, 3).Value = tNm
        wsOut.Cells(o, 4).Value = sp
        wsOut.Cells(o, 5).Value = gb
        wsOut.Cells(o, 6).Value = ds
        wsOut.Cells(o, 7).Value = status
        wsOut.Cells(o, 8).Value = target
        wsOut.Cells(o, 9).Value = colTxt
        wsOut.Cells(o, 10).Value = ok
        wsOut.Cells(o, 11).Value = why
        If ok = "X" Then
            wsOut.Range(wsOut.Cells(o, 1), wsOut.Cells(o, 11)).Interior.Color = RGB(255, 220, 220)
            nMiss = nMiss + 1
        Else
            nOK = nOK + 1
        End If
        o = o + 1
NextC:
    Next r

    ' 5) 요약
    o = o + 1
    wsOut.Cells(o, 1).Value = "[요약]": o = o + 1
    wsOut.Cells(o, 1).Value = "케이블 총": wsOut.Cells(o, 2).Value = (nNew + nOld + nRem): o = o + 1
    wsOut.Cells(o, 1).Value = "  신설 / 기설 / 철거": wsOut.Cells(o, 2).Value = nNew & " · " & nOld & " · " & nRem: o = o + 1
    wsOut.Cells(o, 1).Value = "반영 O / 누락 X": wsOut.Cells(o, 2).Value = nOK & " · " & nMiss: o = o + 1
    wsOut.Cells(o, 1).Value = "신설 거리합(m)": wsOut.Cells(o, 2).Value = distNewSum: o = o + 1
    wsOut.Cells(o, 1).Value = "철거 거리합(m)": wsOut.Cells(o, 2).Value = distRemSum: o = o + 1
    If nMiss > 0 Then
        o = o + 1
        wsOut.Cells(o, 1).Value = "⚠ 누락(X) 케이블이 있습니다 — 빨강 행 확인. 보통 시작/끝 시설 미연결 또는 병렬/순환 간선.": o = o + 1
    End If

    On Error Resume Next: wsOut.Columns("A:K").AutoFit: On Error GoTo 0
    Application.ScreenUpdating = True
    On Error Resume Next: wsOut.Activate: On Error GoTo 0

    MsgBox "기별 검증 미리보기 완료 (시트: _기별_미리보기)" & vbLf & vbLf & _
           "케이블 " & (nNew + nOld + nRem) & " (신설 " & nNew & " / 기설 " & nOld & " / 철거 " & nRem & ")" & vbLf & _
           "반영 " & nOK & " · 누락 " & nMiss & IIf(nMiss > 0, " ⚠ (빨강 행 확인)", "") & vbLf & _
           "신설 거리합 " & distNewSum & " m · 철거 거리합 " & distRemSum & " m", _
           IIf(nMiss > 0, vbExclamation, vbInformation), "기별 검증"
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
    Dim wsFac As Worksheet, wsCbl As Worksheet, wsNw As Worksheet, wsAdmin As Worksheet
    On Error Resume Next
    Set wsFac = ThisWorkbook.Worksheets(SHEET_META_FAC)
    Set wsCbl = ThisWorkbook.Worksheets(SHEET_META_CBL)
    Set wsNw = ThisWorkbook.Worksheets(SHEET_NETWORK)
    Set wsAdmin = ThisWorkbook.Worksheets(SHEET_ADMIN)
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
    Set mFacLegend = CreateObject("Scripting.Dictionary")
    Set mFacGyuk = CreateObject("Scripting.Dictionary")
    Set mMatQty = CreateObject("Scripting.Dictionary")
    Dim lastF As Long: lastF = wsFac.Cells(wsFac.Rows.Count, 1).End(xlUp).Row
    Dim r As Long
    For r = 2 To lastF
        Dim fId As String: fId = CStr(wsFac.Cells(r, 1).Value)
        If Len(fId) > 0 Then
            Dim lbl As String: lbl = CStr(wsFac.Cells(r, 2).Value)
            mFacName(fId) = 기별_시설명(wsAdmin, wsNw, fId, CStr(wsFac.Cells(r, 3).Value))
            mFacBadge(fId) = CStr(wsFac.Cells(r, 5).Value)
            mFacNo(fId) = 기별_신설기설(lbl)
            mFacKind(fId) = 기별_시설종류_양도면(wsNw, wsAdmin, fId, lbl)
            mFacLegend(fId) = 기별_시설명칭_양도면(wsNw, wsAdmin, fId, lbl)
            mFacGyuk(fId) = 기별_시설규격_양도면(wsNw, wsAdmin, fId)
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
    hh = Array("구간", "순번", "타입", "함체명/구간", "역할", "종류", "배지", "신설/기설", "코어수", "주간", "야간", "규격", "거리(m)", "거리반영", "비고(JM)", "함체작업/광탭", "코어접속", "포설", "자재열")
    Dim c As Long
    For c = 0 To UBound(hh): mWsOut.Cells(mOutR, c + 1).Value = hh(c): Next c
    mOutR = mOutR + 1
    mSeq = 0: mSeg = 0: mCollectOnly = False
    mSumHW = 0: mSumHX = 0: mSumIA = 0: mSumIB = 0: mSumIDc = 0: mSumIEc = 0: mSumIFc = 0: mSumIJ = 0: mSumGQ = 0

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
    기별_집계행 "함체작업 주간 (IR/추가51)", mSumHW, "개소"
    기별_집계행 "함체작업 야간 (IS/추가52)", mSumHX, "개소"
    기별_집계행 "FTTH 광탭작업 주간 (IV/추가55)", mSumIA, "개소"
    기별_집계행 "FTTH 광탭작업 야간 (IW/추가56)", mSumIB, "개소"
    기별_집계행 "FTTH 레벨측정시험 (IJ)", mSumIJ, "개소"
    기별_집계행 "코어접속 주간 (ID)", mSumIDc, "코어"
    기별_집계행 "코어접속 야간 (IE)", mSumIEc, "코어"
    기별_집계행 "코어접속 성단 (IF)", mSumIFc, "코어"
    기별_집계행 "광케이블 포설 (JF/추가65)", mSumGQ, "m"
    mOutR = mOutR + 1
    mWsOut.Cells(mOutR, 1).Value = "※ 주야 판정: 야간코어>0 이면 함체작업/광탭=야간, 아니면 주간 (owner 확인 필요)": mOutR = mOutR + 1
    mWsOut.Cells(mOutR, 1).Value = "※ 포설: 신설/미상 케이블 거리 → JF(추가65). 기설은 미반영·철거는 별도시트. 공종 중복 시 추가열 우선(포설 JF·함체작업 IR/IS·광탭 IV/IW)": mOutR = mOutR + 1

    ' === 자재 집계 (신설시트 자재열 → 수량 — Phase 3c) ===
    mOutR = mOutR + 1
    mWsOut.Cells(mOutR, 1).Value = "[자재 집계 — 신설시트 자재열 수량]": mOutR = mOutR + 1
    Dim mh As Variant: mh = Array("폼 열", "수량", "비고")
    For c = 0 To UBound(mh): mWsOut.Cells(mOutR, c + 1).Value = mh(c): Next c
    mOutR = mOutR + 1
    If mMatQty.Count = 0 Then
        mWsOut.Cells(mOutR, 1).Value = "(매핑된 자재 없음)": mOutR = mOutR + 1
    Else
        Dim mk As Variant
        For Each mk In mMatQty.Keys
            mWsOut.Cells(mOutR, 1).Value = CStr(mk)
            mWsOut.Cells(mOutR, 2).Value = mMatQty(mk)
            mWsOut.Cells(mOutR, 3).Value = 기별_열라벨(CStr(mk))
            mOutR = mOutR + 1
        Next mk
    End If
    mOutR = mOutR + 1
    mWsOut.Cells(mOutR, 1).Value = "※ 케이블열: 거리(M) 누적 · 함체/RN열: 개수(EA). 신설만 반영(기설·철거 제외)": mOutR = mOutR + 1
    mWsOut.Cells(mOutR, 1).Value = "※ RN 세분열(구내/옥외·포트)은 우리 데이터(비율+RN)로 자동 불가 → 「확인필요」. 12C 세경/광, 576C 양식부재도 확인 필요": mOutR = mOutR + 1

    On Error Resume Next: mWsOut.Columns("A:S").AutoFit: On Error GoTo 0
    Application.ScreenUpdating = True
    On Error Resume Next: mWsOut.Activate: On Error GoTo 0
    MsgBox "체인 직렬화 + 공종 산출 미리보기 완료 (시트: _기별_미리보기)" & vbLf & vbLf & _
           "체인 " & compCount & " 개" & vbLf & _
           "함체작업 주/야 " & mSumHW & " / " & mSumHX & " · 광탭 주/야 " & mSumIA & " / " & mSumIB & " · 레벨측정 " & mSumIJ & vbLf & _
           "코어접속 주/야/성단 " & mSumIDc & " / " & mSumIEc & " / " & mSumIFc & vbLf & _
           "포설 " & mSumGQ & " m" & vbLf & vbLf & _
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

    ' 2) 간선 단위 — owner 2026-06-16: 모든 구간을 시작~종료로. 케이블 1개 = 구간 1개.
    '    mCollectOnly=True (양식 채우기) 면 mSegList 수집만, 아니면 미리보기 emit.
    Dim total As Long: total = seqNode.Count
    Dim i As Long
    If total = 1 Then
        ' 간선 없는 단독 노드 (자식 없는 루트)
        If mCollectOnly Then
            mSegList.Add Array(CStr(seqNode(1)), "", "")
        Else
            mSeg = mSeg + 1
            기별_구간헤더 mSeg
            기별_방출_함체 CStr(seqNode(1)), mSeg, "시작·종료"
        End If
    Else
        For i = 1 To total - 1
            If mCollectOnly Then
                mSegList.Add Array(CStr(seqNode(i)), CStr(seqCbl(i + 1)), CStr(seqNode(i + 1)))
            Else
                mSeg = mSeg + 1
                기별_구간헤더 mSeg
                기별_방출_함체 CStr(seqNode(i)), mSeg, "시작"
                기별_방출_경간 CStr(seqCbl(i + 1)), mSeg
                기별_방출_함체 CStr(seqNode(i + 1)), mSeg, "종료"
            End If
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
        If kd = "RN" Then
            ' FTTH 광탭작업(IV/IW 추가) + 레벨측정(IJ) = RN 1건당 (코어수 무관). 코어접속은 코어 있을 때.
            If nightN > 0 Then
                workTxt = "광탭 IW(야간)=1": mSumIB = mSumIB + 1
            Else
                workTxt = "광탭 IV(주간)=1": mSumIA = mSumIA + 1
            End If
            workTxt = workTxt & " · 레벨측정 IJ=1": mSumIJ = mSumIJ + 1
            If total > 0 Then
                coreTxt = "ID(주)=" & dayN & " / IE(야)=" & nightN
                mSumIDc = mSumIDc + dayN: mSumIEc = mSumIEc + nightN
            End If
        ElseIf kd = "접속함체" Then
            If total > 0 Then
                ' 함체작업 = 1 (IR주 / IS야 추가, 하나만), 코어접속 주간 ID / 야간 IE
                If nightN > 0 Then
                    workTxt = "함체작업 IS(야간)=1": mSumHX = mSumHX + 1
                Else
                    workTxt = "함체작업 IR(주간)=1": mSumHW = mSumHW + 1
                End If
                coreTxt = "ID(주)=" & dayN & " / IE(야)=" & nightN
                mSumIDc = mSumIDc + dayN: mSumIEc = mSumIEc + nightN
            End If
        Else
            ' 그 외 시설물 — 성단 IF 에만 (코어 있을 때)
            If total > 0 Then
                coreTxt = "IF(성단)=" & total
                mSumIFc = mSumIFc + total
            End If
        End If
    End If
    ' 자재열 (Phase 3c) — 신설 접속함체/RN 만. firstTime 1회.
    Dim matTxt As String: matTxt = ""
    If firstTime Then
        Dim lg As String: lg = "": If mFacLegend.Exists(node) Then lg = CStr(mFacLegend(node))
        Dim gk As String: gk = "": If mFacGyuk.Exists(node) Then gk = CStr(mFacGyuk(node))
        Dim mCol As String, mNote As String: mCol = "": mNote = ""
        If kd = "접속함체" Then
            기별_함체열 lg, gk, no, mCol, mNote
        ElseIf kd = "RN" Then
            기별_RN열 gk, no, mCol, mNote
        End If
        If Len(mCol) > 0 Then
            matTxt = mCol & " (" & mNote & ") +1"
            기별_자재누적 mCol, 1
        ElseIf Len(mNote) > 0 Then
            matTxt = mNote
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
    mWsOut.Cells(mOutR, 19).Value = matTxt
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
    If InStr(gb, "철거") > 0 Then
        layTxt = "철거(별도시트)"
    ElseIf InStr(gb, "기설") > 0 Then
        layTxt = "기설(미반영)"
    Else
        ' 신설 또는 미상 → 포설 (JF/추가65)
        layTxt = "JF(포설)=" & ds
        mSumGQ = mSumGQ + distN
    End If
    ' 자재열 (Phase 3c) — 신설 케이블만 신설시트 규격열에 거리 누적.
    Dim matTxt As String: matTxt = ""
    Dim mCol As String, mNote As String: mCol = "": mNote = ""
    기별_케이블열 sp, gb, 기별_신설기설(gb), mCol, mNote
    If Len(mCol) > 0 Then
        matTxt = mCol & " (" & mNote & ") +" & ds
        기별_자재누적 mCol, distN
    ElseIf Len(mNote) > 0 Then
        matTxt = mNote
    End If
    mWsOut.Cells(mOutR, 1).Value = "구간 " & segNo
    mWsOut.Cells(mOutR, 2).Value = mSeq
    mWsOut.Cells(mOutR, 3).Value = "경간"
    mWsOut.Cells(mOutR, 4).Value = "    " & ffN & " ~ " & ttN
    mWsOut.Cells(mOutR, 12).Value = sp
    mWsOut.Cells(mOutR, 13).Value = ds
    mWsOut.Cells(mOutR, 14).Value = 기별_거리반영(gb)
    mWsOut.Cells(mOutR, 18).Value = layTxt
    mWsOut.Cells(mOutR, 19).Value = matTxt
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

' ============================================================================
'  Phase 3c — 자재 열 매핑 (설계 규격/종류 → 신설시트 폼 열). 양식: _양식_열맵.txt
'  케이블: 규격+설치구분 → I~AA · 함체: 명칭(직선/다분기/중간분기)+규격 → AB~AI
'  RN: 우리 데이터(비율+RN)로 양식 세분열(구내/옥외·포트) 자동 불가 → 확인필요 플래그
' ============================================================================

' 자재열 수량 누적 (열문자 → Double).
Private Sub 기별_자재누적(ByVal col As String, ByVal qty As Double)
    If mMatQty.Exists(col) Then
        mMatQty(col) = CDbl(mMatQty(col)) + qty
    Else
        mMatQty(col) = qty
    End If
End Sub

' 규격 문자열 → 표준 코드 ("광케이블,144C,가공" 또는 "144C" → "144C").
Private Function 기별_규격코드(ByVal s As String) As String
    Dim up As String: up = UCase(Trim(s))
    Dim cand As Variant: cand = Array("576C", "288C", "144C", "72C", "48C", "36C", "24C", "12C", "4C", "2C", "1C")
    Dim i As Long
    For i = LBound(cand) To UBound(cand)
        If InStr(up, CStr(cand(i))) > 0 Then 기별_규격코드 = CStr(cand(i)): Exit Function
    Next i
    기별_규격코드 = Trim(s)
End Function

' 케이블 구분("신설/가공") → 설치구분 (가공/관로/일반). 지중→관로·구내→일반 기본.
Private Function 기별_설치(ByVal gubun As String) As String
    If InStr(gubun, "관로") > 0 Then
        기별_설치 = "관로"
    ElseIf InStr(gubun, "일반") > 0 Then
        기별_설치 = "일반"
    ElseIf InStr(gubun, "가공") > 0 Then
        기별_설치 = "가공"
    ElseIf InStr(gubun, "지중") > 0 Then
        기별_설치 = "관로"
    ElseIf InStr(gubun, "구내") > 0 Then
        기별_설치 = "일반"
    Else
        기별_설치 = "가공"
    End If
End Function

' 시설물 명칭 (함체명/시설물/RN명) — owner 2026-06-16: _시설물 col3 는 빈칸(placeholder).
'   실제 명칭은 콜아웃 2번째 줄(사용자 입력). 행정도 우선 → 네트웍 → col3 폴백.
Private Function 기별_시설명(wsA As Worksheet, wsN As Worksheet, ByVal facId As String, ByVal fallback As String) As String
    Dim nm As String
    nm = 기별_콜아웃_라인2(wsA, facId)
    If Len(nm) = 0 Then nm = 기별_콜아웃_라인2(wsN, facId)
    If Len(nm) = 0 Then nm = Trim(fallback)
    기별_시설명 = nm
End Function

' 시설물 콜아웃(lbl_) 2번째 줄 = 함체명. placeholder/ID 면 빈 문자열.
Private Function 기별_콜아웃_라인2(ws As Worksheet, ByVal facId As String) As String
    기별_콜아웃_라인2 = ""
    If ws Is Nothing Or Len(facId) = 0 Then Exit Function
    Dim lbl As Shape: Set lbl = Nothing
    On Error Resume Next: Set lbl = ws.Shapes(PREFIX_LABEL & facId): On Error GoTo 0
    If lbl Is Nothing Then Exit Function
    Dim tx As String: tx = ""
    On Error Resume Next: tx = lbl.TextFrame2.TextRange.Text: On Error GoTo 0
    tx = Replace(Replace(tx, vbCrLf, vbCr), vbLf, vbCr)
    Dim parts() As String: parts = Split(tx, vbCr)
    If UBound(parts) >= 1 Then
        Dim ln2 As String: ln2 = Trim(parts(1))
        If ln2 <> "함체명을 입력하세요" And ln2 <> "ID" And ln2 <> "" Then 기별_콜아웃_라인2 = ln2
    End If
End Function

' 시설물 콜아웃 규격 (line1 = "구분/규격" 의 마지막 토큰, 시간직렬 복원).
Private Function 기별_시설규격(ws As Worksheet, ByVal facId As String) As String
    기별_시설규격 = ""
    If ws Is Nothing Or Len(facId) = 0 Then Exit Function
    Dim lbl As Shape: Set lbl = Nothing
    On Error Resume Next: Set lbl = ws.Shapes(PREFIX_LABEL & facId): On Error GoTo 0
    If lbl Is Nothing Then Exit Function
    Dim tx As String: tx = ""
    On Error Resume Next: tx = lbl.TextFrame2.TextRange.Text: On Error GoTo 0
    tx = Replace(Replace(tx, vbCrLf, vbCr), vbLf, vbCr)
    Dim p As Long: p = InStr(tx, vbCr)
    Dim line1 As String
    If p > 0 Then line1 = Left(tx, p - 1) Else line1 = tx
    line1 = Trim(line1)
    Dim lp As Long: lp = InStrRev(line1, "/")
    If lp > 0 Then 기별_시설규격 = 기별_규격복원(Mid(line1, lp + 1))
End Function

' 케이블 → 신설시트 자재열. 신설만. outCol="" 면 대상아님/미매핑(outNote 사유).
Private Sub 기별_케이블열(ByVal spec As String, ByVal gubun As String, ByVal status As String, ByRef outCol As String, ByRef outNote As String)
    outCol = "": outNote = ""
    If InStr(status, "철거") > 0 Then outNote = "철거시트(별도)": Exit Sub
    If InStr(status, "기설") > 0 Then outNote = "기설(미반영)": Exit Sub
    ' 신설 또는 미상(status 토큰 없음) → 신설 자재열 매핑 진행
    Dim sp As String: sp = 기별_규격코드(spec)
    Dim inst As String: inst = 기별_설치(gubun)
    Dim slim As Boolean: slim = (InStr(gubun, "세경") > 0)
    Select Case sp
        Case "2C": outCol = "I": outNote = "세경2C인입용"
        Case "4C": outCol = "J": outNote = "세경4C가공"
        Case "12C"
            If slim Then
                outCol = "K": outNote = "세경12C가공"
            Else
                outCol = "L": outNote = "광12C가공"
            End If
        Case "24C"
            If inst = "관로" Then outCol = "N" Else outCol = "M"
            outNote = "24C" & inst
        Case "36C"
            If inst = "일반" Then
                outCol = "O"
            ElseIf inst = "관로" Then
                outCol = "Q"
            Else
                outCol = "P"
            End If
            outNote = "36C" & inst
        Case "48C"
            If inst = "관로" Then outCol = "S" Else outCol = "R"
            outNote = "48C" & inst
        Case "72C"
            If inst = "일반" Then
                outCol = "T"
            ElseIf inst = "관로" Then
                outCol = "V"
            Else
                outCol = "U"
            End If
            outNote = "72C" & inst
        Case "144C"
            If inst = "일반" Then
                outCol = "W"
            ElseIf inst = "관로" Then
                outCol = "Y"
            Else
                outCol = "X"
            End If
            outNote = "144C" & inst
        Case "288C"
            If inst = "관로" Then outCol = "AA" Else outCol = "Z"
            outNote = "288C" & inst
        Case "576C"
            outNote = "576C(양식 열부재-확인필요)"
        Case Else
            outNote = "미매핑(" & spec & ")"
    End Select
End Sub

' 접속함체 → 신설시트 자재열 (명칭 직선/다분기/중간분기 + 규격). 신설만.
Private Sub 기별_함체열(ByVal nm As String, ByVal gyuk As String, ByVal status As String, ByRef outCol As String, ByRef outNote As String)
    outCol = "": outNote = ""
    If InStr(status, "신설") = 0 Then outNote = "기설/철거(미반영)": Exit Sub
    Dim sp As String: sp = 기별_규격코드(gyuk)
    If InStr(nm, "중간분기") > 0 Then
        outCol = "AI": outNote = "중간분기함체"
    ElseIf InStr(nm, "다분기") > 0 Then
        outCol = "AH": outNote = "다분기72C"
    ElseIf InStr(nm, "직선") > 0 Then
        If sp = "144C" Then
            outCol = "AG": outNote = "직선형144C"
        Else
            outCol = "AF": outNote = "직선형72C"
        End If
    Else
        Select Case sp
            Case "36C": outCol = "AB"
            Case "72C": outCol = "AC"
            Case "144C": outCol = "AD"
            Case "288C": outCol = "AE"
            Case Else: outNote = "함체규격미매핑(" & gyuk & ")"
        End Select
        If Len(outCol) > 0 Then outNote = "접속함체" & sp
    End If
End Sub

' RN → 신설시트 자재열. 우리 데이터(비율+RN)로 양식 세분열 자동불가 → 확인필요.
Private Sub 기별_RN열(ByVal gyuk As String, ByVal status As String, ByRef outCol As String, ByRef outNote As String)
    outCol = ""
    If InStr(status, "신설") = 0 Then
        outNote = "기설RN(미반영)"
    Else
        outNote = "RN자재열 확인필요(비율 " & gyuk & ")"
    End If
End Sub

' 폼 열문자 → 라벨 (자재 집계 비고용).
Private Function 기별_열라벨(ByVal col As String) As String
    Select Case col
        Case "I": 기별_열라벨 = "세경2C인입용"
        Case "J": 기별_열라벨 = "세경4C가공"
        Case "K": 기별_열라벨 = "세경12C가공"
        Case "L": 기별_열라벨 = "광12C가공"
        Case "M": 기별_열라벨 = "24C가공"
        Case "N": 기별_열라벨 = "24C관로"
        Case "O": 기별_열라벨 = "36C일반"
        Case "P": 기별_열라벨 = "36C가공"
        Case "Q": 기별_열라벨 = "36C관로"
        Case "R": 기별_열라벨 = "48C가공"
        Case "S": 기별_열라벨 = "48C관로"
        Case "T": 기별_열라벨 = "72C일반"
        Case "U": 기별_열라벨 = "72C가공"
        Case "V": 기별_열라벨 = "72C관로"
        Case "W": 기별_열라벨 = "144C일반"
        Case "X": 기별_열라벨 = "144C가공"
        Case "Y": 기별_열라벨 = "144C관로"
        Case "Z": 기별_열라벨 = "288C가공"
        Case "AA": 기별_열라벨 = "288C관로"
        Case "AB": 기별_열라벨 = "접속함체36C"
        Case "AC": 기별_열라벨 = "접속함체72C"
        Case "AD": 기별_열라벨 = "접속함체144C"
        Case "AE": 기별_열라벨 = "접속함체288C"
        Case "AF": 기별_열라벨 = "직선형72C"
        Case "AG": 기별_열라벨 = "직선형144C"
        Case "AH": 기별_열라벨 = "다분기72C"
        Case "AI": 기별_열라벨 = "중간분기함체"
        Case Else: 기별_열라벨 = ""
    End Select
End Function

' ============================================================================
'  Phase 3d — 양식 채우기 (도식·네트웍 → 기별명세서양식.xlsx 신설시트)
'  미리보기와 같은 직렬화(기별_구간_방출, mCollectOnly 수집모드)를 재사용 → mSegList.
'  각 구간 = 4행 블록 (시작함체 / 경간거리 / 종료함체 / 소계). 끝에 합계.
'  양식 원본 불변 — 복사본 「기별명세서_채움_<일시>.xlsx」 로 SaveAs.
'  ※ 1차컷: 신설시트만. 철거 케이블은 건너뜀(철거시트 별도 — 후속). 종합시트 미반영.
'  실행: Alt+F8 → 기별_양식_채우기
' ============================================================================
Public Sub 기별_양식_채우기()
    ' 표준 양식 파일(기별명세서양식.xlsx) 복사본을 열어 채운 뒤 별도 파일로 SaveAs (단독 실행용).
    Dim wsFacChk As Worksheet, wsCblChk As Worksheet
    On Error Resume Next
    Set wsFacChk = ThisWorkbook.Worksheets(SHEET_META_FAC)
    Set wsCblChk = ThisWorkbook.Worksheets(SHEET_META_CBL)
    On Error GoTo 0
    If wsFacChk Is Nothing Or wsCblChk Is Nothing Then MsgBox "_시설물/_케이블 메타가 없습니다.", vbExclamation, "양식 채우기": Exit Sub

    Dim formPath As String: formPath = ThisWorkbook.Path & "\기별명세서양식.xlsx"
    If Len(Dir(formPath)) = 0 Then
        MsgBox "양식 파일이 없습니다:" & vbLf & formPath & vbLf & vbLf & _
               "「기별명세서양식.xlsx」 를 이 도구(.xlsm)와 같은 폴더에 두세요.", vbExclamation, "양식 채우기"
        Exit Sub
    End If

    Application.ScreenUpdating = False
    Dim wb As Workbook: Set wb = Workbooks.Open(formPath)
    Dim f As Long, rf As Long
    If Not 기별_채우기_코어(wb, f, rf) Then
        On Error Resume Next: wb.Close SaveChanges:=False: On Error GoTo 0
        Application.ScreenUpdating = True
        MsgBox "양식에 기별 시트(2.기별명세서(신설) 등)가 없습니다.", vbExclamation, "양식 채우기": Exit Sub
    End If

    Dim outPath As String
    outPath = ThisWorkbook.Path & "\기별명세서_채움_" & Format(Now, "yyyymmdd_hhnn") & ".xlsx"
    Application.DisplayAlerts = False
    On Error Resume Next: wb.SaveAs outPath, FileFormat:=51: On Error GoTo 0
    Application.DisplayAlerts = True
    Application.ScreenUpdating = True
    On Error Resume Next: wb.Worksheets("2.기별명세서(신설)").Activate: On Error GoTo 0

    MsgBox "양식 채우기 완료 (신설·철거)" & vbLf & vbLf & _
           "신설 구간 " & f & " 개 · 철거 구간 " & rf & " 개" & vbLf & _
           "저장: " & outPath, vbInformation, "양식 채우기"
End Sub

' 기별 채우기 코어 — wb 의 기별 3시트(1.종합·2.신설·3.철거)를 채운다. 메타는 ThisWorkbook 에서 읽음.
'   단독 양식 파일·내보내기(도구 내 시트 복사본) 양쪽에서 재사용. SaveAs/MsgBox 는 호출자 책임.
'   ScreenUpdating 은 호출자 관리. 반환 True=성공. outFilled/outRemFilled = 신설/철거 구간 수.
Public Function 기별_채우기_코어(wb As Workbook, ByRef outFilled As Long, ByRef outRemFilled As Long) As Boolean
    기별_채우기_코어 = False: outFilled = 0: outRemFilled = 0
    Dim wsFac As Worksheet, wsCbl As Worksheet, wsNw As Worksheet, wsAdmin As Worksheet
    On Error Resume Next
    Set wsFac = ThisWorkbook.Worksheets(SHEET_META_FAC)
    Set wsCbl = ThisWorkbook.Worksheets(SHEET_META_CBL)
    Set wsNw = ThisWorkbook.Worksheets(SHEET_NETWORK)
    Set wsAdmin = ThisWorkbook.Worksheets(SHEET_ADMIN)
    On Error GoTo 0
    If wsFac Is Nothing Or wsCbl Is Nothing Then Exit Function

    Dim wsNew As Worksheet, wsRem As Worksheet, wsSumP As Worksheet
    On Error Resume Next
    Set wsNew = wb.Worksheets("2.기별명세서(신설)")
    Set wsRem = wb.Worksheets("3.기별명세서(철거)")
    Set wsSumP = wb.Worksheets("1.종합기별명세서")
    On Error GoTo 0
    If wsNew Is Nothing Then Exit Function
    On Error Resume Next
    wsNew.Unprotect
    If Not wsRem Is Nothing Then wsRem.Unprotect
    If Not wsSumP Is Nothing Then wsSumP.Unprotect
    On Error GoTo 0


    ' 1) 시설물 메타 적재 (미리보기와 동일)
    Set mFacName = CreateObject("Scripting.Dictionary")
    Set mFacKind = CreateObject("Scripting.Dictionary")
    Set mFacBadge = CreateObject("Scripting.Dictionary")
    Set mFacNo = CreateObject("Scripting.Dictionary")
    Set mFacCore = CreateObject("Scripting.Dictionary")
    Set mFacDay = CreateObject("Scripting.Dictionary")
    Set mFacNight = CreateObject("Scripting.Dictionary")
    Set mFacLegend = CreateObject("Scripting.Dictionary")
    Set mFacGyuk = CreateObject("Scripting.Dictionary")
    Dim lastF As Long: lastF = wsFac.Cells(wsFac.Rows.Count, 1).End(xlUp).Row
    Dim r As Long
    For r = 2 To lastF
        Dim fId As String: fId = CStr(wsFac.Cells(r, 1).Value)
        If Len(fId) > 0 Then
            Dim lbl As String: lbl = CStr(wsFac.Cells(r, 2).Value)
            mFacName(fId) = 기별_시설명(wsAdmin, wsNw, fId, CStr(wsFac.Cells(r, 3).Value))
            mFacBadge(fId) = CStr(wsFac.Cells(r, 5).Value)
            mFacNo(fId) = 기별_신설기설(lbl)
            mFacKind(fId) = 기별_시설종류_양도면(wsNw, wsAdmin, fId, lbl)
            mFacLegend(fId) = 기별_시설명칭_양도면(wsNw, wsAdmin, fId, lbl)
            mFacGyuk(fId) = 기별_시설규격_양도면(wsNw, wsAdmin, fId)
            Dim dV As String, nV As String: dV = "": nV = ""
            On Error Resume Next: 상태박스_값_읽기 wsNw, fId, dV, nV: On Error GoTo 0
            mFacDay(fId) = dV: mFacNight(fId) = nV
            Dim cc As Long: cc = 0
            On Error Resume Next: cc = 시설물_연결코어수_계산(wsNw, fId): On Error GoTo 0
            mFacCore(fId) = cc
        End If
    Next r

    ' 2) 케이블 메타 + 인접그래프
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
            Dim cgb As String: cgb = CStr(wsCbl.Cells(r, 7).Value)
            mCblGubun(cId) = cgb
            mCblDist(cId) = CStr(wsCbl.Cells(r, 8).Value)
            기별_adj_추가 adj, ff, tt, cId
            기별_adj_추가 adj, tt, ff, cId
        End If
    Next r

    ' 3) 직렬화 수집 (mCollectOnly=True → mSegList)
    Set mChildren = CreateObject("Scripting.Dictionary")
    Set mWeight = CreateObject("Scripting.Dictionary")
    Set mSegList = New Collection
    Dim gv As Object: Set gv = CreateObject("Scripting.Dictionary")
    mCollectOnly = True
    Dim startKey As Variant
    For Each startKey In adj.Keys
        Dim sNode As String: sNode = CStr(startKey)
        If Not gv.Exists(sNode) Then
            Dim comp As Object: Set comp = CreateObject("Scripting.Dictionary")
            기별_연결요소_수집 adj, sNode, comp
            Dim root As String: root = 기별_루트선택(adj, comp)
            기별_트리_구성 adj, root, gv
            기별_구간_방출 root, "", Empty, True
        End If
    Next startKey
    mCollectOnly = False

    ' === 데이터 영역 채우기 (owner 2026-06-16: 원본 양식 서식·행높이 그대로) ===
    ' 비-철거 + 케이블 있는 구간만 4행 블록(시작/경간/종료/소계). 단독노드·철거 제외.
    ' 신설/기설 구간 = 트리 직렬화(mSegList) — 철거는 여기서 제외(아래 직접 스캔).
    Dim segs As Collection: Set segs = New Collection
    Dim skippedSolo As Long
    Dim si As Long
    For si = 1 To mSegList.Count
        Dim rec As Variant: rec = mSegList(si)
        Dim cblChk As String: cblChk = CStr(rec(1))
        If Len(cblChk) = 0 Then
            skippedSolo = skippedSolo + 1
        Else
            Dim cgub As String: cgub = ""
            If mCblGubun.Exists(cblChk) Then cgub = CStr(mCblGubun(cblChk))
            Dim cspc As String: cspc = "": If mCblSpec.Exists(cblChk) Then cspc = CStr(mCblSpec(cblChk))
            If InStr(cgub, "철거") > 0 Or InStr(cspc, "철거") > 0 Then
                ' 철거 — 직접 스캔이 담당 (트리 직렬화는 비-트리 간선 누락하므로 여기선 버림)
            Else
                segs.Add rec
            End If
        End If
    Next si
    Dim nBlk As Long: nBlk = segs.Count

    ' 철거 구간 = _케이블 메타 직접 스캔 (owner 2026-06-16: 철거는 네트웍에 없고 트리 직렬화에서도
    '   비-트리 간선으로 누락됨 → mSegList 의존하지 않고 케이블 메타를 직접 훑어 각 철거 케이블 1구간).
    '   철거 판정 = 구분(col7) 또는 규격(col4) 에 "철거" (owner: 철거는 구분에 들어가 있음).
    Dim segsRem As Collection: Set segsRem = New Collection
    Dim rc As Long
    For rc = 2 To lastC
        Dim cidR As String: cidR = CStr(wsCbl.Cells(rc, 1).Value)
        If Len(cidR) > 0 Then
            Dim gbR As String: gbR = CStr(wsCbl.Cells(rc, 7).Value)
            Dim spR As String: spR = CStr(wsCbl.Cells(rc, 4).Value)
            If InStr(gbR, "철거") > 0 Or InStr(spR, "철거") > 0 Then
                ' 경간쓰기가 읽는 dict 보강 (from/to 비어 트리 그래프에 안 들어간 케이블도 포함)
                If Not mCblSpec.Exists(cidR) Then mCblSpec(cidR) = spR
                If Not mCblGubun.Exists(cidR) Then mCblGubun(cidR) = gbR
                If Not mCblDist.Exists(cidR) Then mCblDist(cidR) = CStr(wsCbl.Cells(rc, 8).Value)
                segsRem.Add Array(CStr(wsCbl.Cells(rc, 2).Value), cidR, CStr(wsCbl.Cells(rc, 3).Value))
            End If
        End If
    Next rc
    Dim nBlkRem As Long: nBlkRem = segsRem.Count

    ' 원본 템플릿 행높이 캡처 (clear 전): 함체10·경간11·소계13·합계22
    Dim hFac As Double: hFac = wsNew.Rows(10).RowHeight
    Dim hSpan As Double: hSpan = wsNew.Rows(11).RowHeight
    Dim hSub As Double: hSub = 19.8    ' 소계 행높이 (owner 2026-06-16)
    Dim hTot As Double: hTot = 27.6    ' 합계 행높이 (owner 2026-06-16)
    ' 소계·합계 채움색 (owner 2026-06-16: .Interior.Color 읽기는 흰색 반환 → 하드코딩 설정).
    '   소계=FFCC99(살구, 직접 RGB) · 합계=인덱스 색 11(원본 양식 동일).
    Dim totRow As Long: totRow = 10 + 4 * nBlk

    ' (1) 서식 적용 — 원본 템플릿행에서 PasteSpecial(서식만)+행높이. 합계 먼저(원본 22 가 블록에 덮이기 전).
    '     서식만 복사 → 샘플 수동수식(아연도강연선 =G 등) 안 따라옴 → 장주 없이 조가선 계산되던 문제 동시 해결.
    Dim bi As Long, br As Long
    If nBlk > 0 Then 기별_행서식 wsNew, 22, totRow, hTot
    For bi = 1 To nBlk
        br = 10 + 4 * (bi - 1)
        기별_행서식 wsNew, 10, br, hFac
        기별_행서식 wsNew, 11, br + 1, hSpan
        기별_행서식 wsNew, 12, br + 2, hFac
        기별_행서식 wsNew, 13, br + 3, hSub
    Next bi

    ' (2) 데이터 영역 내용 비우기 (서식 유지)
    wsNew.Range(wsNew.Cells(10, 1), wsNew.Cells(880, 275)).ClearContents

    ' (3) 값 기입
    Dim dedup As Object: Set dedup = CreateObject("Scripting.Dictionary")
    Set mUsedCols = CreateObject("Scripting.Dictionary")
    Dim subRows As Collection: Set subRows = New Collection
    For bi = 1 To nBlk
        rec = segs(bi)
        Dim sFac As String: sFac = CStr(rec(0))
        Dim cbl As String: cbl = CStr(rec(1))
        Dim eFac As String: eFac = CStr(rec(2))
        br = 10 + 4 * (bi - 1)
        기별_양식_시설쓰기 wsNew, br, sFac, dedup
        기별_양식_경간쓰기 wsNew, br + 1, cbl
        기별_양식_시설쓰기 wsNew, br + 2, eFac, dedup
        ' 신설 케이블 구간: 양끝 기설 접속함체/RN 「그 함체 행」에 분기키트 1NT(FW) 1개 (owner 2026-06-16).
        '   경간 아니라 함체 행. 기설 구간 cable 은 제외. 같은 함체가 여러 신설구간이면 각 행 1씩(조수 합).
        Dim cgSeg As String: cgSeg = "": If mCblGubun.Exists(cbl) Then cgSeg = CStr(mCblGubun(cbl))
        If InStr(cgSeg, "기설") = 0 And InStr(cgSeg, "철거") = 0 Then
            If 기별_기설함체(sFac) Then 기별_셀W wsNew, "FW", br, 1
            If 기별_기설함체(eFac) Then 기별_셀W wsNew, "FW", br + 2, 1
        End If
        wsNew.Range("A" & (br + 3)).Value = "소  계"
        기별_양식_소계 wsNew, br + 3, br, br + 2, 기별_양식_합산열()
        기별_행채움 wsNew, br + 3, RGB(255, 204, 153), -1, False, 10, hSub, False, "JO", "JM", "JO"   ' 소계: 살구 FFCC99 · 비고 JM:JO 병합
        subRows.Add (br + 3)
    Next bi
    Dim filled As Long: filled = nBlk
    Dim rw As Long: rw = totRow

    ' 합계 — A="합 계"(공백1) → 종합 G열 INDEX/MATCH("합 계") 연동.
    If nBlk > 0 Then
        wsNew.Range("A" & rw).Value = "합 계"
        기별_양식_합계 wsNew, rw, subRows, 기별_양식_합산열()
        기별_행채움 wsNew, rw, RGB(0, 255, 0), -1, True, 11, hTot, True, "JO", "JM", "JO"   ' 합계: 가운데·테두리·비고 JM:JO 병합
    End If

    ' 값 들어간 열 숨김 해제 (owner 2026-06-16: 값 셀이 숨겨지지 않게). 메타열(A~H·JL·JM) 항상 표시.
    Dim alwaysVis As Variant
    alwaysVis = Array("A", "B", "C", "D", "E", "F", "G", "H", "JL", "JM")
    Dim av As Long
    For av = LBound(alwaysVis) To UBound(alwaysVis)
        On Error Resume Next: wsNew.Columns(CStr(alwaysVis(av))).Hidden = False: On Error GoTo 0
    Next av
    Dim uc As Variant
    For Each uc In mUsedCols.Keys
        On Error Resume Next
        wsNew.Columns(CStr(uc)).Hidden = False
        wsNew.Columns(CStr(uc)).AutoFit          ' ### 방지 — 값이 열폭보다 커서 잘리는 것 자동맞춤
        On Error GoTo 0
    Next uc
    ' 거리(G) 만 자동맞춤 (큰 숫자 ### 방지). H(여장)은 헤더 병합영역이 넓어 AutoFit 시 과확장 → 제외.
    On Error Resume Next
    wsNew.Columns("G").AutoFit
    On Error GoTo 0

    ' === 철거시트 채우기 (owner 2026-06-16: 철거 케이블 → 3.기별명세서(철거)) ===
    '   구조는 신설과 동일(4행 블록: 시작함체/경간/종료함체/소계 + 합계). 단 자재·공종 열 레이아웃 다름.
    '   시설 행: 명칭(A)·배지(EK)·비고(EL) 만 — 코어확인 공종 미반영(owner). 자재·공종은 경간 행에.
    '   경간 행: 거리(G) + 광케이블 철거(DR 폐기/DS 재사용, owner 규칙) + 규격 자재열(I~AL).
    '   합계 A="합 계(철거)" → 종합 G273+ INDEX/MATCH 자동 연동(×-1).
    Dim remFilled As Long: remFilled = 0
    Dim subRowsRem As Collection: Set subRowsRem = New Collection
    If nBlkRem > 0 And Not wsRem Is Nothing Then
        Dim remCols As Variant: remCols = 기별_철거_합산열()
        Dim hFacR As Double: hFacR = wsRem.Rows(10).RowHeight
        Dim hSpanR As Double: hSpanR = wsRem.Rows(11).RowHeight
        Dim totRowR As Long: totRowR = 10 + 4 * nBlkRem

        ' (1) 서식 — 원본 템플릿(블록 10-13·합계 18)에서 행복사. 합계 먼저.
        Dim biR As Long, brR As Long
        기별_행서식 wsRem, 18, totRowR, hTot
        For biR = 1 To nBlkRem
            brR = 10 + 4 * (biR - 1)
            기별_행서식 wsRem, 10, brR, hFacR
            기별_행서식 wsRem, 11, brR + 1, hSpanR
            기별_행서식 wsRem, 12, brR + 2, hFacR
            기별_행서식 wsRem, 13, brR + 3, hSub
        Next biR

        ' (2) 데이터 영역 비우기 (철거시트 145열)
        wsRem.Range(wsRem.Cells(10, 1), wsRem.Cells(880, 145)).ClearContents

        ' (3) 값 기입 (철거 시설 행은 dedup 불필요 — 자재·공종 누적 없이 명칭/배지/비고만)
        Set mUsedCols = CreateObject("Scripting.Dictionary")    ' 철거시트 전용 사용열 (신설과 별개)
        For biR = 1 To nBlkRem
            rec = segsRem(biR)
            Dim sFacR As String: sFacR = CStr(rec(0))
            Dim cblR As String: cblR = CStr(rec(1))
            Dim eFacR As String: eFacR = CStr(rec(2))
            brR = 10 + 4 * (biR - 1)
            기별_양식_시설쓰기_철거 wsRem, brR, sFacR
            기별_양식_경간쓰기_철거 wsRem, brR + 1, cblR
            기별_양식_시설쓰기_철거 wsRem, brR + 2, eFacR
            wsRem.Range("A" & (brR + 3)).Value = "소  계"
            기별_양식_소계 wsRem, brR + 3, brR, brR + 2, remCols
            기별_행채움 wsRem, brR + 3, RGB(255, 204, 153), -1, False, 10, hSub, False, "EN", "EL", "EN"   ' 소계: 살구 · 비고 EL:EN 병합
            subRowsRem.Add (brR + 3)
        Next biR
        remFilled = nBlkRem

        ' 합계 — A="합 계(철거)" (공백1+(철거)) → 종합 철거 INDEX/MATCH 연동.
        wsRem.Range("A" & totRowR).Value = "합 계(철거)"
        기별_양식_합계 wsRem, totRowR, subRowsRem, remCols
        기별_행채움 wsRem, totRowR, RGB(0, 255, 0), -1, True, 11, hTot, True, "EN", "EL", "EN"   ' 합계: 가운데·테두리·비고 EL:EN 병합

        ' 철거시트 숨김 해제 + AutoFit. 메타(A~H)·배지(EK)·비고(EL) 항상 표시.
        Dim remVis As Variant
        remVis = Array("A", "B", "C", "D", "E", "F", "G", "H", "EK", "EL")
        Dim rv As Long
        For rv = LBound(remVis) To UBound(remVis)
            On Error Resume Next: wsRem.Columns(CStr(remVis(rv))).Hidden = False: On Error GoTo 0
        Next rv
        Dim ucR As Variant
        For Each ucR In mUsedCols.Keys
            On Error Resume Next
            wsRem.Columns(CStr(ucR)).Hidden = False
            wsRem.Columns(CStr(ucR)).AutoFit
            On Error GoTo 0
        Next ucR
        On Error Resume Next: wsRem.Columns("G").AutoFit: On Error GoTo 0
    End If

    ' 종합 재계산 + 선택값(K=1) 필터 재적용 (owner 2026-06-16: 값 채워도 K=1 행 자동 표시)
    '   종합 G열이 신설 합계행 INDEX/MATCH 로 연동 → 강제 재계산 → K=IF(0<G,1) 갱신 → 필터 재적용.
    Application.CalculateFull
    Dim wsSum As Worksheet: Set wsSum = Nothing
    On Error Resume Next: Set wsSum = wb.Worksheets("1.종합기별명세서"): On Error GoTo 0
    If Not wsSum Is Nothing Then
        On Error Resume Next
        If wsSum.FilterMode Then wsSum.ShowAllData
        wsSum.Range("K4:M406").AutoFilter Field:=1, Criteria1:="1"
        On Error GoTo 0
    End If

    outFilled = filled: outRemFilled = remFilled
    기별_채우기_코어 = True
End Function

' 라벨 셀("■ 공사번호 : 12345") → 콜론 뒤 값("12345"). 콜론 없으면 전체 trim.
Public Function 기별_라벨값(ByVal s As String) As String
    Dim p As Long: p = InStrRev(s, ":")
    If p > 0 Then 기별_라벨값 = Trim(Mid(s, p + 1)) Else 기별_라벨값 = Trim(s)
End Function

' 파일명 금지문자 제거 + 공백 → "_" (owner 2026-06-16: 공백대신 언더스코어).
'   Windows 금지: \ / : * ? " < > | · Excel 추가 금지: [ ] (외부참조 문법). 탭·줄바꿈도 제거.
Public Function 기별_파일명_정리(ByVal s As String) As String
    Dim bad As Variant: bad = Array("\", "/", ":", "*", "?", """", "<", ">", "|", "[", "]", vbTab, vbCr, vbLf)
    Dim i As Long
    For i = LBound(bad) To UBound(bad): s = Replace(s, CStr(bad(i)), " "): Next i
    s = Trim(s)
    s = Replace(s, " ", "_")                       ' 공백 → "_"
    Do While InStr(s, "__") > 0: s = Replace(s, "__", "_"): Loop   ' 연속 "_" 축약
    Do While Len(s) > 0 And Left(s, 1) = "_": s = Mid(s, 2): Loop  ' 앞 "_" 제거
    Do While Len(s) > 0 And Right(s, 1) = "_": s = Left(s, Len(s) - 1): Loop   ' 뒤 "_" 제거
    기별_파일명_정리 = s
End Function

' 시설물 행 — A·JL·JM 항상, 공종·자재는 첫 등장(dedup) 1회.
Private Sub 기별_양식_시설쓰기(ws As Worksheet, rowNum As Long, facId As String, dedup As Object)
    Dim nm As String: nm = "": If mFacName.Exists(facId) Then nm = CStr(mFacName(facId))
    Dim bg As String: bg = "": If mFacBadge.Exists(facId) Then bg = CStr(mFacBadge(facId))
    Dim no As String: no = "": If mFacNo.Exists(facId) Then no = CStr(mFacNo(facId))
    Dim kd As String: kd = "": If mFacKind.Exists(facId) Then kd = CStr(mFacKind(facId))
    ws.Range("A" & rowNum).Value = nm
    If Len(bg) > 0 Then ws.Range("JL" & rowNum).Value = bg
    ws.Range("JM" & rowNum).Value = 기별_비고(no, kd)
    ' 비고: 신설이면 글자색 빨강 (owner 2026-06-16). 기설은 기본(검정).
    If InStr(no, "신설") > 0 Then
        On Error Resume Next: ws.Range("JM" & rowNum).Font.Color = RGB(255, 0, 0): On Error GoTo 0
    End If
    If dedup.Exists(facId) Then Exit Sub
    dedup(facId) = True

    ' 자재 (신설 접속함체/RN → +1)
    Dim mCol As String, mNote As String: mCol = "": mNote = ""
    If kd = "접속함체" Then
        Dim lg As String: lg = "": If mFacLegend.Exists(facId) Then lg = CStr(mFacLegend(facId))
        Dim gk As String: gk = "": If mFacGyuk.Exists(facId) Then gk = CStr(mFacGyuk(facId))
        기별_함체열 lg, gk, no, mCol, mNote
    ElseIf kd = "RN" Then
        Dim gk2 As String: gk2 = "": If mFacGyuk.Exists(facId) Then gk2 = CStr(mFacGyuk(facId))
        기별_RN열 gk2, no, mCol, mNote
    End If
    If Len(mCol) > 0 Then 기별_셀W ws, mCol, rowNum, 1

    ' 공종 — 종류별. RN은 광탭+레벨을 코어수 무관 1 (owner 2026-06-16: RN이면 포함).
    Dim total As Long: total = 0: If mFacCore.Exists(facId) Then total = CLng(mFacCore(facId))
    Dim nightN As Long: nightN = 0: If mFacNight.Exists(facId) Then nightN = 기별_숫자(CStr(mFacNight(facId)))
    Dim dayN As Long
    Dim dv As String: dv = "": If mFacDay.Exists(facId) Then dv = CStr(mFacDay(facId))
    If Len(dv) > 0 And IsNumeric(dv) Then dayN = CLng(dv) Else dayN = total - nightN
    If dayN < 0 Then dayN = 0
    If kd = "RN" Then
        ' FTTH 광탭작업(IV주/IW야 추가55·56) + 레벨측정(IJ) = RN 1건당 (코어수 0 이어도 기입)
        If nightN > 0 Then 기별_셀W ws, "IW", rowNum, 1 Else 기별_셀W ws, "IV", rowNum, 1
        기별_셀W ws, "IJ", rowNum, 1
        If dayN > 0 Then 기별_셀W ws, "ID", rowNum, dayN
        If nightN > 0 Then 기별_셀W ws, "IE", rowNum, nightN
    ElseIf kd = "접속함체" Then
        If total > 0 Then
            ' 함체작업 IR주/IS야 (추가51·52). 추가열 우선 (owner 2026-06-16)
            If nightN > 0 Then 기별_셀W ws, "IS", rowNum, 1 Else 기별_셀W ws, "IR", rowNum, 1
            If dayN > 0 Then 기별_셀W ws, "ID", rowNum, dayN
            If nightN > 0 Then 기별_셀W ws, "IE", rowNum, nightN
        End If
    Else
        If total > 0 Then 기별_셀W ws, "IF", rowNum, total
    End If
    ' 기설 접속함체/RN + 코어접속 → 컬러 열수축슬리브(FL) = 접속코어수 (owner 2026-06-16, RN 포함).
    '   ※ 분기키트(FW)는 신설 케이블 구간의 기설 함체/RN 행에 기록 — 양식 채우기 루프.
    If (kd = "접속함체" Or kd = "RN") And InStr(no, "기설") > 0 And total > 0 Then
        기별_셀W ws, "FL", rowNum, total
    End If
End Sub

' 기설 접속함체 또는 기설 RN 여부 (분기키트 산출용 — owner 2026-06-16: RN도 포함).
Private Function 기별_기설함체(ByVal facId As String) As Boolean
    기별_기설함체 = False
    If Len(facId) = 0 Then Exit Function
    Dim no As String: no = "": If mFacNo.Exists(facId) Then no = CStr(mFacNo(facId))
    Dim kd As String: kd = "": If mFacKind.Exists(facId) Then kd = CStr(mFacKind(facId))
    If InStr(no, "기설") > 0 And (kd = "접속함체" Or kd = "RN") Then 기별_기설함체 = True
End Function

' 값 기입 + 사용열 기록 (끝에 숨김 해제용).
Private Sub 기별_셀W(ws As Worksheet, ByVal col As String, ByVal rowNum As Long, ByVal val As Variant)
    ws.Range(col & rowNum).Value = val
    If Not mUsedCols Is Nothing Then mUsedCols(col) = True
End Sub

' 원본 템플릿행 → 대상행 「전체 복사」(서식·채움·굵기·테두리·행높이 모두) + 행높이(h) 명시.
'   owner 2026-06-16: 행복사 방식. 내용(수식)도 따라오지만, 이후 내용비우기+값기입으로 덮어씀.
'   ※ PasteSpecial(서식만)은 채움·행높이 누락되던 문제 → 전체 행 Copy Destination 으로 변경.
Private Sub 기별_행서식(ws As Worksheet, ByVal srcRow As Long, ByVal dstRow As Long, ByVal h As Double)
    On Error Resume Next
    If srcRow <> dstRow Then ws.Rows(srcRow).Copy Destination:=ws.Rows(dstRow)
    If h > 0 Then ws.Rows(dstRow).RowHeight = h
    Application.CutCopyMode = False
    On Error GoTo 0
End Sub

' 소계/합계 행 채움·굵기·폰트·행높이 직접 적용. colorIdx>=0 면 ColorIndex, 아니면 RGB(fillColor).
'   lastCol = 채움/테두리 끝열 (신설 "JO" · 철거 "EN" — 시트 폭·비고 병합에 맞춤. owner 2026-06-16).
'   allBorder=True(합계용): 가운데정렬(가로·세로) + 모든 테두리.
'   bigoL/bigoR 주어지면 그 행의 비고 셀 병합 (신설 JM:JO · 철거 EL:EN).
Private Sub 기별_행채움(ws As Worksheet, ByVal rowNum As Long, ByVal fillColor As Long, ByVal colorIdx As Long, ByVal bold As Boolean, ByVal sz As Double, ByVal h As Double, Optional ByVal allBorder As Boolean = False, Optional ByVal lastCol As String = "JM", Optional ByVal bigoL As String = "", Optional ByVal bigoR As String = "")
    On Error Resume Next
    ' 비고 병합 먼저 (테두리가 병합셀을 한 칸으로 감싸도록)
    If Len(bigoL) > 0 And Len(bigoR) > 0 Then ws.Range(bigoL & rowNum & ":" & bigoR & rowNum).Merge
    With ws.Range("A" & rowNum & ":" & lastCol & rowNum).Interior
        .Pattern = xlSolid
        .PatternColorIndex = xlAutomatic
        If colorIdx >= 0 Then .ColorIndex = colorIdx Else .Color = fillColor
    End With
    With ws.Range("A" & rowNum & ":" & lastCol & rowNum).Font
        .Bold = bold
        If sz > 0 Then .Size = sz
    End With
    If allBorder Then
        With ws.Range("A" & rowNum & ":" & lastCol & rowNum)
            .HorizontalAlignment = xlCenter
            .VerticalAlignment = xlCenter
            .Borders(xlEdgeTop).LineStyle = xlContinuous
            .Borders(xlEdgeBottom).LineStyle = xlContinuous
            .Borders(xlEdgeLeft).LineStyle = xlContinuous
            .Borders(xlEdgeRight).LineStyle = xlContinuous
            .Borders(xlInsideVertical).LineStyle = xlContinuous
            .Borders(xlInsideHorizontal).LineStyle = xlContinuous
        End With
    End If
    If h > 0 Then ws.Rows(rowNum).RowHeight = h
    On Error GoTo 0
End Sub

' 경간거리 행 — A="경간거리", G=거리, 신설이면 포설 GQ + 케이블 자재열.
Private Sub 기별_양식_경간쓰기(ws As Worksheet, rowNum As Long, cblId As String)
    ws.Range("A" & rowNum).Value = "경간거리"
    Dim sp As String: sp = "": If mCblSpec.Exists(cblId) Then sp = CStr(mCblSpec(cblId))
    Dim gb As String: gb = "": If mCblGubun.Exists(cblId) Then gb = CStr(mCblGubun(cblId))
    Dim ds As String: ds = "": If mCblDist.Exists(cblId) Then ds = CStr(mCblDist(cblId))
    Dim distN As Double: distN = 0: If Len(ds) > 0 And IsNumeric(ds) Then distN = CDbl(ds)
    Dim status As String: status = 기별_신설기설(gb)
    If distN > 0 Then 기별_셀W ws, "G", rowNum, distN
    ' 기설·철거 아닌 케이블(=신설/미상)은 포설 + 케이블 자재열. 기설은 거리만(§7-9), 철거는 철거시트.
    '   포설 공종 = JF(추가65, 광케이블 포설, 2024090007). 구버전 GQ(주간) 대신 추가열 우선 (owner 2026-06-16).
    If InStr(status, "기설") = 0 And InStr(status, "철거") = 0 Then
        If distN > 0 Then 기별_셀W ws, "JF", rowNum, distN
        Dim mCol As String, mNote As String: mCol = "": mNote = ""
        기별_케이블열 sp, gb, status, mCol, mNote
        If Len(mCol) > 0 And distN > 0 Then 기별_셀W ws, mCol, rowNum, distN
    End If
End Sub

' 소계 행 — 합산열별 =SUM(블록 3행). cols = 대상 열 배열(신설/철거 시트별).
Private Sub 기별_양식_소계(ws As Worksheet, subRow As Long, r1 As Long, r2 As Long, cols As Variant)
    Dim k As Long
    For k = LBound(cols) To UBound(cols)
        Dim cl As String: cl = CStr(cols(k))
        ws.Range(cl & subRow).Formula = "=SUM(" & cl & r1 & ":" & cl & r2 & ")"
    Next k
End Sub

' 합계 행 — 합산열별 소계행들의 합. cols = 대상 열 배열.
Private Sub 기별_양식_합계(ws As Worksheet, totRow As Long, subRows As Collection, cols As Variant)
    If subRows.Count = 0 Then Exit Sub
    Dim k As Long
    For k = LBound(cols) To UBound(cols)
        Dim cl As String: cl = CStr(cols(k))
        Dim f As String: f = ""
        Dim z As Long
        For z = 1 To subRows.Count
            If Len(f) > 0 Then f = f & "+"
            f = f & cl & subRows(z)
        Next z
        ws.Range(cl & totRow).Formula = "=" & f
    Next k
End Sub

' 소계·합계 대상 열 (메타 G·H + 케이블 I~AA + 함체 AB~AI + 공종).
Private Function 기별_양식_합산열() As Variant
    기별_양식_합산열 = Array("G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "AA", "AB", "AC", "AD", "AE", "AF", "AG", "AH", "AI", "FW", "FL", "JF", "IR", "IS", "IV", "IW", "ID", "IE", "IF", "IJ")
End Function

' ============================================================================
'  철거시트 (3.기별명세서(철거)) 전용 — owner 2026-06-16
'   시설 행: 명칭(A)·배지(EK)·비고(EL) 만. 코어확인 공종·조가선 철거 미반영(owner).
'   경간 행: 거리(G) + 광케이블 철거(DR 폐기/DS 재사용) + 규격 자재열(I~AL).
' ============================================================================

' 철거시트 소계·합계 대상 열 (메타 G·H + 케이블 규격 I~AL + 광케이블 철거 DR·DS).
Private Function 기별_철거_합산열() As Variant
    기별_철거_합산열 = Array("G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "AA", "AB", "AC", "AD", "AE", "AF", "AG", "AH", "AI", "AJ", "AK", "AL", "DR", "DS")
End Function

' 철거 시설 행 — 명칭(A)·배지(EK)·비고(EL). 자재·공종 없음(owner: 코어확인 미반영).
Private Sub 기별_양식_시설쓰기_철거(ws As Worksheet, rowNum As Long, facId As String)
    Dim nm As String: nm = "": If mFacName.Exists(facId) Then nm = CStr(mFacName(facId))
    Dim bg As String: bg = "": If mFacBadge.Exists(facId) Then bg = CStr(mFacBadge(facId))
    Dim no As String: no = "": If mFacNo.Exists(facId) Then no = CStr(mFacNo(facId))
    Dim kd As String: kd = "": If mFacKind.Exists(facId) Then kd = CStr(mFacKind(facId))
    ws.Range("A" & rowNum).Value = nm
    If Len(bg) > 0 Then ws.Range("EK" & rowNum).Value = bg      ' 철거시트 배지열 = EK
    ws.Range("EL" & rowNum).Value = 기별_비고(no, kd)            ' 철거시트 비고열 = EL
    ' 철거이면 글자색 빨강 (신설시트 비고 신설=빨강 패턴 준용).
    If InStr(no, "철거") > 0 Then
        On Error Resume Next: ws.Range("EL" & rowNum).Font.Color = RGB(255, 0, 0): On Error GoTo 0
    End If
End Sub

' 철거 경간 행 — A="경간거리", G=거리, 광케이블 철거(DR/DS)=거리, 규격 자재열(I~AL)=거리.
Private Sub 기별_양식_경간쓰기_철거(ws As Worksheet, rowNum As Long, cblId As String)
    ws.Range("A" & rowNum).Value = "경간거리"
    Dim sp As String: sp = "": If mCblSpec.Exists(cblId) Then sp = CStr(mCblSpec(cblId))
    Dim gb As String: gb = "": If mCblGubun.Exists(cblId) Then gb = CStr(mCblGubun(cblId))
    Dim ds As String: ds = "": If mCblDist.Exists(cblId) Then ds = CStr(mCblDist(cblId))
    Dim distN As Double: distN = 0: If Len(ds) > 0 And IsNumeric(ds) Then distN = CDbl(ds)
    If distN > 0 Then 기별_셀W ws, "G", rowNum, distN
    If distN > 0 Then
        ' 광케이블 철거 공종 — 12C이하 폐기·12C초과는 200m미만 폐기/200m이상 재사용 (owner).
        Dim lay As String: lay = 기별_철거포설열(sp, distN)
        기별_셀W ws, lay, rowNum, distN
        ' 규격 자재열 (I~AL) — 철거시트 전용 레이아웃.
        Dim mCol As String: mCol = 기별_철거케이블열(sp, gb)
        If Len(mCol) > 0 Then 기별_셀W ws, mCol, rowNum, distN
    End If
End Sub

' 광케이블 철거 공종 열 (owner 2026-06-16): 12C이하→폐기(DR). 12C초과→200m미만 폐기(DR)/200m이상 재사용(DS).
Private Function 기별_철거포설열(ByVal spec As String, ByVal distN As Double) As String
    Dim core As Long: core = 기별_규격코어수(spec)
    If core <= 12 Then
        기별_철거포설열 = "DR"          ' 폐기
    ElseIf distN < 200 Then
        기별_철거포설열 = "DR"          ' 폐기 (200m 미만)
    Else
        기별_철거포설열 = "DS"          ' 재사용 (200m 이상)
    End If
End Function

' 규격 → 코어수 (정수). "광케이블,72C,가공" / "12C" → 72 / 12. 미상 0.
Private Function 기별_규격코어수(ByVal spec As String) As Long
    Dim code As String: code = 기별_규격코드(spec)     ' "72C" 등
    Dim n As String: n = ""
    Dim i As Long, ch As String
    For i = 1 To Len(code)
        ch = Mid(code, i, 1)
        If ch >= "0" And ch <= "9" Then n = n & ch Else Exit For
    Next i
    If Len(n) > 0 Then 기별_규격코어수 = CLng(n) Else 기별_규격코어수 = 0
End Function

' 철거 케이블 규격 자재열 (철거시트 I~AL). 규격+설치구분+세경여부 → 열문자. 미매핑 "".
Private Function 기별_철거케이블열(ByVal spec As String, ByVal gubun As String) As String
    Dim sp As String: sp = 기별_규격코드(spec)
    Dim inst As String: inst = 기별_설치(gubun)
    Dim slim As Boolean: slim = (InStr(gubun, "세경") > 0)
    기별_철거케이블열 = ""
    Select Case sp
        Case "2C": 기별_철거케이블열 = "Q"                         ' 세경2C인입용
        Case "4C"
            If inst = "관로" Then
                If slim Then 기별_철거케이블열 = "S" Else 기별_철거케이블열 = "T"
            Else
                기별_철거케이블열 = "R"                            ' 세경4C가공
            End If
        Case "12C"
            If slim Then 기별_철거케이블열 = "U" Else 기별_철거케이블열 = "V"
        Case "24C"
            If inst = "관로" Then 기별_철거케이블열 = "X" Else 기별_철거케이블열 = "W"
        Case "36C"
            If inst = "일반" Then
                기별_철거케이블열 = "Z"
            ElseIf inst = "관로" Then
                기별_철거케이블열 = "AA"
            Else
                기별_철거케이블열 = "Y"
            End If
        Case "48C"
            If inst = "일반" Then
                기별_철거케이블열 = "AC"
            ElseIf inst = "관로" Then
                기별_철거케이블열 = "AD"
            Else
                기별_철거케이블열 = "AB"
            End If
        Case "72C"
            If inst = "일반" Then
                기별_철거케이블열 = "AF"
            ElseIf inst = "관로" Then
                기별_철거케이블열 = "AG"
            Else
                기별_철거케이블열 = "AE"
            End If
        Case "144C"
            If inst = "일반" Then
                기별_철거케이블열 = "AI"
            ElseIf inst = "관로" Then
                기별_철거케이블열 = "AJ"
            Else
                기별_철거케이블열 = "AH"
            End If
        Case "288C"
            If inst = "일반" Then 기별_철거케이블열 = "AL" Else 기별_철거케이블열 = "AK"
        Case Else
            기별_철거케이블열 = ""                                 ' 1C/576C 등 미매핑
    End Select
End Function
