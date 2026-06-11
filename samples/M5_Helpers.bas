Attribute VB_Name = "M5_Helpers"
Option Explicit

' ===== owner 2026-06-08 (8-118): 방향키 hold 검사 — GetAsyncKeyState (user32) =====
'   하위 8 비트 = 키 토글 상태, 최상위 비트 = 누름 상태. & H8000 마스크.
'   사용처: 행정도 빈셀 클릭 시점에 W/E/R/S/F/Z/X/C 키 hold 여부 확인 → 네트웍 강제 방향 배치.
'   Windows 전용 (macOS Excel 미지원).
#If VBA7 Then
    Public Declare PtrSafe Function GetAsyncKeyState Lib "user32" (ByVal vKey As Long) As Integer
#Else
    Public Declare Function GetAsyncKeyState Lib "user32" (ByVal vKey As Long) As Integer
#End If

Public Function 키_눌림(vk As Long) As Boolean
    On Error Resume Next
    키_눌림 = (GetAsyncKeyState(vk) And &H8000) <> 0
    On Error GoTo 0
End Function

' 8 방향 키 중 「현재 눌린 키」 1 글자 반환 ("" = 없음). W/E/R/S/F/Z/X/C 우선순위.
Public Function 방향키_확인() As String
    방향키_확인 = ""
    If 키_눌림(Asc("W")) Then 방향키_확인 = "W": Exit Function
    If 키_눌림(Asc("E")) Then 방향키_확인 = "E": Exit Function
    If 키_눌림(Asc("R")) Then 방향키_확인 = "R": Exit Function
    If 키_눌림(Asc("S")) Then 방향키_확인 = "S": Exit Function
    If 키_눌림(Asc("F")) Then 방향키_확인 = "F": Exit Function
    If 키_눌림(Asc("Z")) Then 방향키_확인 = "Z": Exit Function
    If 키_눌림(Asc("X")) Then 방향키_확인 = "X": Exit Function
    If 키_눌림(Asc("C")) Then 방향키_확인 = "C": Exit Function
End Function

' 방향키 1 글자 → 셀 offset (dx, dy). owner 정본 (E=상, X=하).
Public Sub 방향키_offset(dirKey As String, ByRef dx As Long, ByRef dy As Long)
    dx = 0: dy = 0
    Select Case UCase(dirKey)
        Case "W": dx = -1: dy = -1
        Case "E": dx = 0:  dy = -1
        Case "R": dx = 1:  dy = -1
        Case "S": dx = -1: dy = 0
        Case "F": dx = 1:  dy = 0
        Case "Z": dx = -1: dy = 1
        Case "X": dx = 0:  dy = 1
        Case "C": dx = 1:  dy = 1
    End Select
End Sub

' 방향키 1 글자 → 한국어 라벨 (안내 메시지용)
Public Function 방향키_라벨(dirKey As String) As String
    Select Case UCase(dirKey)
        Case "W": 방향키_라벨 = "좌상 (대각선 ↖)"
        Case "E": 방향키_라벨 = "상 (↑)"
        Case "R": 방향키_라벨 = "우상 (대각선 ↗)"
        Case "S": 방향키_라벨 = "좌 (←)"
        Case "F": 방향키_라벨 = "우 (→)"
        Case "Z": 방향키_라벨 = "좌하 (대각선 ↙)"
        Case "X": 방향키_라벨 = "하 (↓)"
        Case "C": 방향키_라벨 = "우하 (대각선 ↘)"
        Case Else: 방향키_라벨 = dirKey
    End Select
End Function

' 전체 해제 — 선택 (코어 + UNIT) + 이번 세션 매핑 모두 클리어
Public Sub 선번연결_도구_전체해제()
    If g_pt_mappings Is Nothing Then Set g_pt_mappings = CreateObject("Scripting.Dictionary")
    If g_pt_selA Is Nothing Then Set g_pt_selA = CreateObject("Scripting.Dictionary")
    If g_pt_selB Is Nothing Then Set g_pt_selB = CreateObject("Scripting.Dictionary")
    If g_pt_selUnitsA Is Nothing Then Set g_pt_selUnitsA = CreateObject("Scripting.Dictionary")
    If g_pt_selUnitsB Is Nothing Then Set g_pt_selUnitsB = CreateObject("Scripting.Dictionary")
    g_pt_mappings.RemoveAll
    g_pt_selA.RemoveAll
    g_pt_selB.RemoveAll
    g_pt_selUnitsA.RemoveAll
    g_pt_selUnitsB.RemoveAll
    g_pt_anchorA = 0: g_pt_anchorB = 0
    선번연결_도구_시트빌드
    선번연결_도구_시각갱신
End Sub

' 기존 연결 삭제 — Application.Caller 의 AlternativeText "arr=<arrowName>" 디코딩.
'   네트웍 시트에서 해당 화살표 + 양 끝 박스 삭제 → g_pt_existingA/B/Conns 다시 빌드 → 시트 재빌드.
Public Sub 선번연결_도구_연결삭제()
    Dim nm As String: nm = Application.Caller
    Dim wsTool As Worksheet: Set wsTool = ThisWorkbook.Worksheets(SHEET_PAIR_TOOL)
    Dim btn As Shape: Set btn = Nothing
    On Error Resume Next
    Set btn = wsTool.Shapes(nm)
    On Error GoTo 0
    If btn Is Nothing Then Exit Sub
    Dim alt As String: alt = ""
    On Error Resume Next
    alt = btn.AlternativeText
    On Error GoTo 0
    Dim p As Long: p = InStr(alt, "arr=")
    If p = 0 Then Exit Sub
    Dim arrName As String: arrName = Mid(alt, p + 4)

    If MsgBox("기존 연결을 삭제하시겠습니까?" & vbLf & vbLf & _
              "박스 2개 + 화살표 1개가 네트웍구성도에서 영구 삭제됩니다.", _
              vbYesNo + vbExclamation, "기존 연결 삭제") <> vbYes Then Exit Sub

    Dim wsNw As Worksheet: Set wsNw = ThisWorkbook.Worksheets(SHEET_NETWORK)
    Dim wasProt As Boolean: wasProt = wsNw.ProtectContents Or wsNw.ProtectDrawingObjects
    On Error Resume Next
    wsNw.Unprotect
    On Error GoTo 0

    ' RN 그룹 ID 감지 — 같은 rngrp 의 모든 박스·화살표 일괄 삭제 (owner 요구: 수정/삭제)
    Dim arrShp As Shape: Set arrShp = Nothing
    On Error Resume Next
    Set arrShp = wsNw.Shapes(arrName)
    On Error GoTo 0
    If Not arrShp Is Nothing Then
        Dim arrAlt As String: arrAlt = ""
        On Error Resume Next: arrAlt = arrShp.AlternativeText: On Error GoTo 0
        Dim pGrp As Long: pGrp = InStr(arrAlt, "rngrp=")
        If pGrp > 0 Then
            ' RN 그룹 모드 — 전체 삭제 (라벨 IN/P + 코어 박스들 + 화살표들)
            Dim gEnd As Long: gEnd = InStr(pGrp, arrAlt, "|")
            If gEnd = 0 Then gEnd = Len(arrAlt) + 1
            Dim rnGrpId As String: rnGrpId = Mid(arrAlt, pGrp + 6, gEnd - (pGrp + 6))
            선번연결_도구_RNgrp_삭제 wsNw, rnGrpId
            If wasProt Then ApplySheetProtection wsNw
            선번연결_도구_기존수집
            If g_pt_step = 2 Then
                선번연결_도구_시트빌드
                선번연결_도구_시각갱신
            Else
                선번연결_도구_방사형빌드 g_pt_facId
            End If
            ' owner 2026-06-08 (8-113): RN 그룹 삭제 후 주간/야간 박스 자동 갱신.
            On Error Resume Next
            시설물_상태박스_주간_자동갱신 wsNw, g_pt_facId
            On Error GoTo 0
            Application.StatusBar = "RN 연결 그룹 1건 삭제 — 모든 박스·화살표 일괄 제거."
            Exit Sub
        End If
    End If

    ' value = "boxA|boxB|txtA|txtB"
    Dim val As String: val = ""
    On Error Resume Next
    val = CStr(g_pt_existingConns(arrName))
    On Error GoTo 0
    Dim parts() As String
    If Len(val) > 0 Then parts = Split(val, "|")

    ' owner 2026-06-06 fix: 박스 + 모든 anchor·main·cascade 화살표 일괄 삭제.
    '   기존엔 box1·box2·canonMain (3개) 만 삭제 → canonAnchor + 다른 cascade 화살표 잔존.
    '   2026-06-06 보강: existingConns 의 arrName 은 anchor 이름 (cable-cable canonical 의 경우 _anchor 접미사)
    '   이라 visible main 은 별도 이름 (anchor 이름에서 _anchor 제거). 모두 dict 에 모아 일괄 삭제.
    Dim delBox1 As String, delBox2 As String
    delBox1 = "": delBox2 = ""
    If Len(val) > 0 Then
        If UBound(parts) >= 1 Then
            delBox1 = parts(0): delBox2 = parts(1)
        End If
    End If

    ' Step 1: 삭제 대상 dict 초기 구성 (중복 방지)
    Dim toDel As Object: Set toDel = CreateObject("Scripting.Dictionary")
    If Len(delBox1) > 0 Then toDel(delBox1) = True
    If Len(delBox2) > 0 Then toDel(delBox2) = True
    ' arrName + 짝 (anchor↔main) 둘 다 추가
    If Len(arrName) > 0 Then
        toDel(arrName) = True
        If Right(arrName, 7) = "_anchor" Then
            ' arrName 이 anchor → main 도 추가 (이름 = arrName - _anchor)
            toDel(Left(arrName, Len(arrName) - 7)) = True
        Else
            ' arrName 이 main → anchor 도 추가 (이름 = arrName + _anchor)
            toDel(arrName & "_anchor") = True
        End If
    End If

    ' Step 2: orphan scan — box1=/box2= 가 삭제 박스 참조하는 PAIRARROW 모두 추가
    '   2026-06-06 보강: visible main (alt = main=1|fac=|cblA=|cblB=) 도 catch.
    '     box1=/box2= alt 가 없어서 기존 패턴으로 못 잡혀 잔존 → cblA/cblB 가 deleted pair 의 cable 이름과 매칭되면 orphan.
    '   동시에 각 발견된 도형의 짝 (anchor↔main) 도 추가.
    Dim delCblA As String, delCblB As String
    delCblA = "": delCblB = ""
    If UBound(parts) >= 5 Then
        delCblA = parts(4)
        delCblB = parts(5)
    End If

    Dim shOrp As Shape, altOrp As String
    For Each shOrp In wsNw.Shapes
        If Left(shOrp.Name, Len(PREFIX_PAIRARROW)) = PREFIX_PAIRARROW Then
            altOrp = "": On Error Resume Next: altOrp = shOrp.AlternativeText: On Error GoTo 0
            Dim refDel As Boolean: refDel = False
            If Len(delBox1) > 0 Then
                If InStr(altOrp, "box1=" & delBox1) > 0 Or InStr(altOrp, "box2=" & delBox1) > 0 Then refDel = True
            End If
            If Not refDel And Len(delBox2) > 0 Then
                If InStr(altOrp, "box1=" & delBox2) > 0 Or InStr(altOrp, "box2=" & delBox2) > 0 Then refDel = True
            End If
            ' visible main (main=1|cblA=|cblB=) — alt 에 box1/box2 없음. cable name 매칭.
            If Not refDel And InStr(altOrp, "main=1") > 0 And Len(delCblA) > 0 And Len(delCblB) > 0 Then
                Dim mA As String: mA = AltParseField(altOrp, "cblA=")
                Dim mB As String: mB = AltParseField(altOrp, "cblB=")
                If (mA = delCblA And mB = delCblB) Or (mA = delCblB And mB = delCblA) Then refDel = True
            End If
            If refDel Then
                toDel(shOrp.Name) = True
                ' 짝 (anchor↔main) 도 추가
                If Right(shOrp.Name, 7) = "_anchor" Then
                    toDel(Left(shOrp.Name, Len(shOrp.Name) - 7)) = True
                Else
                    toDel(shOrp.Name & "_anchor") = True
                End If
            End If
        End If
    Next shOrp

    ' Step 3: 실제 삭제
    Dim delK As Variant
    For Each delK In toDel.Keys
        On Error Resume Next
        wsNw.Shapes(CStr(delK)).Delete
        On Error GoTo 0
    Next delK

    ' owner 2026-06-06 (8-22): cable-cable 의 cascade 그룹에서 한 페어 삭제 후 즉시 재정렬.
    '   남은 anchor 개수가 ≥2 → 새 visible main 생성 (다음 closest-to-facility 박스로)
    '   남은 anchor 개수가 1 → 그 anchor 자체가 visible (단일 그룹 동작)
    '   남은 anchor 가 0 → 아무것도 안 함
    페어화살표_시설물페어_재정렬 wsNw

    If wasProt Then ApplySheetProtection wsNw

    ' 기존 정보 다시 수집 + 시트 재빌드 — step 별 분기 (owner 요구: Step 1 에서도 삭제 가능)
    선번연결_도구_기존수집
    If g_pt_step = 2 Then
        선번연결_도구_시트빌드
        선번연결_도구_시각갱신
    Else
        ' Step 1 — 방사형 + 기존 연결 목록 재빌드
        선번연결_도구_방사형빌드 g_pt_facId
    End If
    ' owner 2026-06-08 (8-113): 기존 연결 삭제 후 주간/야간 박스 자동 갱신.
    On Error Resume Next
    시설물_상태박스_주간_자동갱신 wsNw, g_pt_facId
    On Error GoTo 0
    Application.StatusBar = "기존 연결 1건 삭제 — 잠금 코어 해제."
End Sub

' owner 2026-06-07 (8-64-fix): 케이블이 관여한 모든 PAIR (양쪽 박스 + 화살표) 일괄 삭제.
'   각 PAIRARROW 순회 → box1 또는 box2 가 cbl=<cableName> 가진 PAIRBOX 인 경우:
'     - 그 화살표 + 양쪽 박스 (반대편 케이블 박스 포함) 모두 삭제 대상
'   8-60 의 네트웍_연결도형_정리 (cbl=<>만 매치) 는 한쪽만 지워 반대편 박스 잔존 → 이 helper 로 대체.
Public Sub 도구_케이블전체매핑_정리(wsNw As Worksheet, cableName As String)
    If wsNw Is Nothing Then Exit Sub
    If Len(cableName) = 0 Then Exit Sub

    Dim wasProt As Boolean: wasProt = wsNw.ProtectContents Or wsNw.ProtectDrawingObjects
    On Error Resume Next: wsNw.Unprotect: On Error GoTo 0

    Dim cblTag As String: cblTag = "cbl=" & cableName
    Dim delBoxes As Object: Set delBoxes = CreateObject("Scripting.Dictionary")
    Dim delArrows As Object: Set delArrows = CreateObject("Scripting.Dictionary")

    Dim i As Long, sh As Shape, alt As String

    ' Phase 1 — 모든 PAIRARROW 의 box1·box2 검사. 한쪽이라도 cbl=cable PAIRBOX 면 양쪽 박스 + 화살표 삭제 대상.
    For i = 1 To wsNw.Shapes.Count
        Set sh = wsNw.Shapes(i)
        If Left(sh.Name, Len(PREFIX_PAIRARROW)) = PREFIX_PAIRARROW Then
            alt = ""
            On Error Resume Next: alt = sh.AlternativeText: On Error GoTo 0
            Dim b1 As String: b1 = AltParseField(alt, "box1=")
            Dim b2 As String: b2 = AltParseField(alt, "box2=")

            Dim hit As Boolean: hit = False
            Dim probeBox As Shape

            If Len(b1) > 0 Then
                Set probeBox = Nothing
                On Error Resume Next: Set probeBox = wsNw.Shapes(b1): On Error GoTo 0
                If Not probeBox Is Nothing Then
                    Dim altB1 As String: altB1 = ""
                    On Error Resume Next: altB1 = probeBox.AlternativeText: On Error GoTo 0
                    If InStr(altB1, cblTag) > 0 Then hit = True
                End If
            End If
            If Not hit And Len(b2) > 0 Then
                Set probeBox = Nothing
                On Error Resume Next: Set probeBox = wsNw.Shapes(b2): On Error GoTo 0
                If Not probeBox Is Nothing Then
                    Dim altB2 As String: altB2 = ""
                    On Error Resume Next: altB2 = probeBox.AlternativeText: On Error GoTo 0
                    If InStr(altB2, cblTag) > 0 Then hit = True
                End If
            End If

            If hit Then
                delArrows(sh.Name) = True
                If Len(b1) > 0 Then delBoxes(b1) = True
                If Len(b2) > 0 Then delBoxes(b2) = True
            End If
        End If
    Next i

    ' Phase 2 — 화살표가 못 가리는 고아 박스 (cbl=cable, 화살표 없음) 도 함께 삭제
    For i = 1 To wsNw.Shapes.Count
        Set sh = wsNw.Shapes(i)
        If Left(sh.Name, Len(PREFIX_PAIRBOX)) = PREFIX_PAIRBOX Then
            If Not delBoxes.Exists(sh.Name) Then
                alt = ""
                On Error Resume Next: alt = sh.AlternativeText: On Error GoTo 0
                If InStr(alt, cblTag) > 0 Then delBoxes(sh.Name) = True
            End If
        End If
    Next i

    ' Phase 3 — 일괄 삭제 (역방향 순회)
    For i = wsNw.Shapes.Count To 1 Step -1
        Set sh = wsNw.Shapes(i)
        If delArrows.Exists(sh.Name) Or delBoxes.Exists(sh.Name) Then
            On Error Resume Next: sh.Delete: On Error GoTo 0
        End If
    Next i

    If wasProt Then ApplySheetProtection wsNw
End Sub

' owner 2026-06-07 (8-64): 선택한 케이블의 모든 매핑 (선번박스·화살표) 일괄 삭제.
'   - 방사형 뷰의 각 케이블 라벨 아래 「전체 매핑 X」 버튼 클릭으로 호출
'   - 8-60 의 네트웍_연결도형_정리 helper 재사용 (cbl=<cableName> 토큰 가진 모든 PAIRBOX + 그것을 가리키는 PAIRARROW 삭제)
'   - 케이블 본체 (행정도/네트웍의 cbl_* 도형) 는 유지 — 매핑만 초기화
'   - 삭제 후 기존수집 으로 g_pt_existingConns 새로고침 + 현재 step 에 맞춰 캔버스 재빌드
Public Sub 선번연결_도구_케이블전체연결삭제()
    Dim btnName As String: btnName = CStr(Application.Caller)
    Dim wsTool As Worksheet: Set wsTool = ThisWorkbook.Worksheets(SHEET_PAIR_TOOL)
    Dim btn As Shape: Set btn = Nothing
    On Error Resume Next: Set btn = wsTool.Shapes(btnName): On Error GoTo 0
    If btn Is Nothing Then Exit Sub

    Dim alt As String: alt = ""
    On Error Resume Next: alt = btn.AlternativeText: On Error GoTo 0
    Dim p As Long: p = InStr(alt, "cbl=")
    If p = 0 Then Exit Sub
    Dim cableName As String: cableName = Mid(alt, p + 4)
    Dim sep As Long: sep = InStr(cableName, "|")
    If sep > 0 Then cableName = Left(cableName, sep - 1)
    cableName = Trim(cableName)
    If Len(cableName) = 0 Then Exit Sub

    ' 사용자 친화 라벨 (예: "[7]")
    Dim cableLbl As String: cableLbl = ""
    On Error Resume Next: cableLbl = 케이블_반대편_배지(cableName): On Error GoTo 0
    Dim displayLbl As String
    If Len(cableLbl) > 0 Then displayLbl = "[" & cableLbl & "]" Else displayLbl = Right(cableName, 6)

    If MsgBox("케이블 " & displayLbl & " 의 모든 매핑을 삭제하시겠습니까?" & vbLf & vbLf & _
              "- 이 케이블에 붙은 선번박스·화살표가 모두 영구 삭제됩니다." & vbLf & _
              "- 케이블 본체는 유지되어 새로 매핑할 수 있습니다.", _
              vbYesNo + vbExclamation, "케이블 전체 매핑 삭제") <> vbYes Then Exit Sub

    Dim wsNw As Worksheet: Set wsNw = ThisWorkbook.Worksheets(SHEET_NETWORK)
    If wsNw Is Nothing Then Exit Sub

    ' 8-64-fix: 새 helper — 화살표 양끝 박스 모두 삭제 (반대편 케이블 박스 포함).
    '   기존 8-60 의 네트웍_연결도형_정리 는 cbl=<>만 매치라서 반대편 박스가 잔존하던 문제 해결.
    도구_케이블전체매핑_정리 wsNw, cableName

    ' 상태 새로고침
    선번연결_도구_기존수집

    ' 도구 캔버스 재빌드 (현재 step 에 맞춰)
    If g_pt_step = 2 Then
        선번연결_도구_시트빌드
        선번연결_도구_시각갱신
    Else
        선번연결_도구_방사형빌드 g_pt_facId
    End If

    ' owner 2026-06-08 (8-113): 케이블 전체 매핑 삭제 후 주간/야간 박스 자동 갱신.
    On Error Resume Next
    시설물_상태박스_주간_자동갱신 wsNw, g_pt_facId
    On Error GoTo 0

    Application.StatusBar = "케이블 " & displayLbl & " 매핑 모두 삭제 완료 — 케이블 본체는 유지."
End Sub

' 기존 연결 강조 — Step 1 list 의 「선택」 버튼 핸들러 (owner 요구).
'   클릭한 행의 cableA·cableB 를 방사형 캔버스에서 핑크 강조 + 두꺼움. 나머지 케이블은 기본색 복원.
'   value 형식 (g_pt_existingConns): "boxA|boxB|coresA|coresB|cableA|cableB"
' RN 그룹 전체 삭제 — 같은 rngrp 의 모든 박스·화살표 일괄 제거.
Public Sub 선번연결_도구_RNgrp_삭제(ws As Worksheet, rnGrpId As String)
    Dim targetTag As String: targetTag = "rngrp=" & rnGrpId
    Dim toDelete As Object: Set toDelete = CreateObject("Scripting.Dictionary")
    Dim sh As Shape, alt As String
    For Each sh In ws.Shapes
        alt = "": On Error Resume Next: alt = sh.AlternativeText: On Error GoTo 0
        If InStr(alt, targetTag) > 0 Then toDelete(sh.Name) = True
    Next sh
    Dim nm As Variant
    For Each nm In toDelete.Keys
        On Error Resume Next
        ws.Shapes(CStr(nm)).Delete
        On Error GoTo 0
    Next nm
End Sub

' owner 2026-06-06: RN 박스 텍스트에서 IN/OUT 코어를 추출 → targetCores 매칭 확인.
'   sideKey = "IN" 면 i_N prefix 매칭, "OUT" 면 m_N/s_N/p_N 매칭.
'   multi-token "i_1,m_2" 도 처리 — 콤마 split 후 각 토큰별 검증.
Public Function 선번연결_도구_RN박스_코어매칭(rnShp As Shape, sideKey As String, targetCores As Object) As Boolean
    선번연결_도구_RN박스_코어매칭 = False
    If rnShp Is Nothing Or targetCores Is Nothing Then Exit Function

    ' RN 측 박스 alt 의 rn= 태그 확인 — 잘못된 박스 (cable 측 A/B) 면 skip
    Dim alt As String: alt = ""
    On Error Resume Next: alt = rnShp.AlternativeText: On Error GoTo 0
    Dim tag As String: tag = 선번연결_도구_alt_rn_tag(alt)
    Dim isRnBox As Boolean
    isRnBox = (tag = "IN" Or tag = "OUT" Or tag = "i" Or tag = "m" Or tag = "s" Or tag = "p")
    If Not isRnBox Then Exit Function

    Dim txt As String: txt = ""
    On Error Resume Next: txt = rnShp.TextFrame2.TextRange.Text: On Error GoTo 0
    If Len(txt) = 0 Then Exit Function

    Dim toks() As String: toks = Split(txt, ",")
    Dim ki As Long
    For ki = LBound(toks) To UBound(toks)
        Dim tt As String: tt = Trim(toks(ki))
        If Len(tt) > 0 Then
            Dim usPos As Long: usPos = InStr(tt, "_")
            Dim pref As String, numStr As String
            If usPos > 0 Then
                pref = LCase(Left(tt, usPos - 1))
                numStr = Mid(tt, usPos + 1)
            Else
                pref = ""
                numStr = tt
            End If
            If IsNumeric(numStr) Then
                Dim n As Long: n = CLng(numStr)
                Dim matchIN As Boolean, matchOUT As Boolean
                matchIN = (pref = "i") Or (pref = "" And (tag = "IN" Or tag = "i"))
                matchOUT = (pref = "m" Or pref = "s" Or pref = "p") Or _
                           (pref = "" And (tag = "OUT" Or tag = "m" Or tag = "s" Or tag = "p"))
                If sideKey = "IN" And matchIN Then
                    If targetCores.Exists(n) Then
                        선번연결_도구_RN박스_코어매칭 = True
                        Exit Function
                    End If
                ElseIf sideKey = "OUT" And matchOUT Then
                    If targetCores.Exists(n) Then
                        선번연결_도구_RN박스_코어매칭 = True
                        Exit Function
                    End If
                End If
            End If
        End If
    Next ki
End Function

' RN 그룹 부분 삭제 — 같은 rngrp 안에서 지정된 (sideA core, sideRN core) 쌍만 삭제.
'   화살표 + 그 화살표의 양쪽 박스 (Cable A 또는 Cable B 박스 + 짝의 RN IN 또는 OUT 박스).
'   라벨 박스 (rn_lbl=IN/P) 는 그룹의 마지막 쌍 삭제 시에만 제거.
Public Sub 선번연결_도구_RNgrp_부분삭제(ws As Worksheet, rnGrpId As String, _
                                          targetCores As Object, sideKey As String)
    Dim targetTag As String: targetTag = "rngrp=" & rnGrpId
    ' 1) 화살표 찾아서 box1/box2 + 코어 일치하면 삭제 대상에 추가
    '   owner 2026-06-06 fix: Phase A (RN1_페어생성) 는 box1=cable·box2=RN, Phase B (RN2_화살표) 는 box1=RN·box2=cable.
    '   이전 코드는 box1 의 텍스트가 numeric (=cable 측) 임을 가정 → Phase B 화살표는 box1 이 RN port "i_1"/"m_2" 라
    '   IsNumeric 실패 → 삭제 안 됨 (cable·RN 모두 잠금 유지). rn= 태그로 케이블·RN 측 자동 식별.
    Dim toDelete As Object: Set toDelete = CreateObject("Scripting.Dictionary")
    Dim sh As Shape, alt As String
    For Each sh In ws.Shapes
        If Left(sh.Name, Len(PREFIX_PAIRARROW)) = PREFIX_PAIRARROW Then
            alt = "": On Error Resume Next: alt = sh.AlternativeText: On Error GoTo 0
            If InStr(alt, targetTag) > 0 Then
                Dim p1 As Long: p1 = InStr(alt, "box1=")
                Dim p2 As Long: p2 = InStr(alt, "box2=")
                If p1 > 0 And p2 > 0 Then
                    Dim b1Name As String: b1Name = Mid(alt, p1 + 5, p2 - p1 - 6)
                    Dim b2EndP As Long: b2EndP = InStr(p2, alt, "|")
                    If b2EndP = 0 Then b2EndP = Len(alt) + 1
                    Dim b2Name As String: b2Name = Mid(alt, p2 + 5, b2EndP - (p2 + 5))
                    Dim b1Shp As Shape: Set b1Shp = Nothing
                    Dim b2Shp As Shape: Set b2Shp = Nothing
                    On Error Resume Next
                    Set b1Shp = ws.Shapes(b1Name)
                    Set b2Shp = ws.Shapes(b2Name)
                    On Error GoTo 0

                    ' 어느 쪽이 케이블 측인지 rn= 태그로 자동 식별 (A/B = 케이블, i/m/s/p/IN/OUT = RN)
                    Dim cableShp As Shape: Set cableShp = Nothing
                    Dim b1Alt As String, b2Alt As String, b1Tag As String, b2Tag As String
                    b1Alt = "": b2Alt = "": b1Tag = "": b2Tag = ""
                    If Not b1Shp Is Nothing Then
                        On Error Resume Next: b1Alt = b1Shp.AlternativeText: On Error GoTo 0
                        b1Tag = 선번연결_도구_alt_rn_tag(b1Alt)
                    End If
                    If Not b2Shp Is Nothing Then
                        On Error Resume Next: b2Alt = b2Shp.AlternativeText: On Error GoTo 0
                        b2Tag = 선번연결_도구_alt_rn_tag(b2Alt)
                    End If
                    Dim b1IsCable As Boolean: b1IsCable = (b1Tag = "A" Or b1Tag = "B")
                    Dim b2IsCable As Boolean: b2IsCable = (b2Tag = "A" Or b2Tag = "B")
                    If b1IsCable Then
                        Set cableShp = b1Shp
                    ElseIf b2IsCable Then
                        Set cableShp = b2Shp
                    End If
                    ' fallback — 태그 없으면 numeric 텍스트로 추정 (legacy 호환)
                    If cableShp Is Nothing Then
                        If Not b1Shp Is Nothing Then
                            Dim t1 As String: t1 = "": On Error Resume Next: t1 = b1Shp.TextFrame2.TextRange.Text: On Error GoTo 0
                            If IsNumeric(Trim(t1)) Then Set cableShp = b1Shp
                        End If
                        If cableShp Is Nothing And Not b2Shp Is Nothing Then
                            Dim t2 As String: t2 = "": On Error Resume Next: t2 = b2Shp.TextFrame2.TextRange.Text: On Error GoTo 0
                            If IsNumeric(Trim(t2)) Then Set cableShp = b2Shp
                        End If
                    End If

                    ' sideKey 분기 — A/B = cable 측 매칭, IN/OUT = RN 측 매칭
                    Dim isCableSideKey As Boolean: isCableSideKey = (sideKey = "A" Or sideKey = "B")
                    Dim isRnSideKey As Boolean: isRnSideKey = (sideKey = "IN" Or sideKey = "OUT")

                    If isCableSideKey And Not cableShp Is Nothing Then
                        Dim cTxt As String: cTxt = ""
                        On Error Resume Next: cTxt = cableShp.TextFrame2.TextRange.Text: On Error GoTo 0
                        ' multi-token "1,2" 도 처리 — 콤마 split 후 각 토큰별 매칭 (한국어 locale 의 CLng("1,2")=12 트랩 회피)
                        Dim toksCC() As String: toksCC = Split(cTxt, ",")
                        Dim tkCC As Long
                        Dim matchedCC As Boolean: matchedCC = False
                        For tkCC = LBound(toksCC) To UBound(toksCC)
                            Dim ttCC As String: ttCC = Trim(toksCC(tkCC))
                            If Len(ttCC) > 0 And IsNumeric(ttCC) Then
                                If targetCores.Exists(CLng(ttCC)) Then
                                    matchedCC = True
                                    Exit For
                                End If
                            End If
                        Next tkCC
                        If matchedCC Then
                            ' 이 페어 삭제 대상 — 화살표 + 양쪽 박스 모두
                            toDelete(sh.Name) = True
                            toDelete(b1Name) = True
                            toDelete(b2Name) = True
                        End If
                    ElseIf isRnSideKey Then
                        ' RN 측 박스 — cableShp 가 아닌 다른 박스. 텍스트 prefix 파싱 ("i_1","m_2","s_3","p_4" or multi-token)
                        Dim rnShp As Shape: Set rnShp = Nothing
                        If Not cableShp Is Nothing Then
                            If b1Shp Is cableShp Then Set rnShp = b2Shp Else Set rnShp = b1Shp
                        Else
                            ' cable 측 자동식별 실패 — b1/b2 둘 다 RN 측일 수도. 둘 다 시도
                            If 선번연결_도구_RN박스_코어매칭(b1Shp, sideKey, targetCores) Or _
                               선번연결_도구_RN박스_코어매칭(b2Shp, sideKey, targetCores) Then
                                toDelete(sh.Name) = True
                                toDelete(b1Name) = True
                                toDelete(b2Name) = True
                            End If
                            GoTo NextArr2
                        End If
                        If Not rnShp Is Nothing Then
                            If 선번연결_도구_RN박스_코어매칭(rnShp, sideKey, targetCores) Then
                                toDelete(sh.Name) = True
                                toDelete(b1Name) = True
                                toDelete(b2Name) = True
                            End If
                        End If
NextArr2:
                    End If
                End If
            End If
        End If
    Next sh
    ' 2) 삭제 실행
    Dim nm As Variant
    For Each nm In toDelete.Keys
        On Error Resume Next
        ws.Shapes(CStr(nm)).Delete
        On Error GoTo 0
    Next nm
    ' 3) 그룹에 남은 코어 박스 없으면 라벨 박스 (IN/P) 도 삭제
    Dim hasRemaining As Boolean: hasRemaining = False
    Dim sh2 As Shape, alt2 As String
    For Each sh2 In ws.Shapes
        If Left(sh2.Name, Len(PREFIX_PAIRBOX)) = PREFIX_PAIRBOX Then
            alt2 = "": On Error Resume Next: alt2 = sh2.AlternativeText: On Error GoTo 0
            If InStr(alt2, targetTag) > 0 And InStr(alt2, "rn_lbl=") = 0 Then
                hasRemaining = True
                Exit For
            End If
        End If
    Next sh2
    If Not hasRemaining Then
        ' 그룹 빈 — 라벨 박스 정리
        Dim lblDelete As Object: Set lblDelete = CreateObject("Scripting.Dictionary")
        For Each sh2 In ws.Shapes
            alt2 = "": On Error Resume Next: alt2 = sh2.AlternativeText: On Error GoTo 0
            If InStr(alt2, targetTag) > 0 Then lblDelete(sh2.Name) = True
        Next sh2
        For Each nm In lblDelete.Keys
            On Error Resume Next
            ws.Shapes(CStr(nm)).Delete
            On Error GoTo 0
        Next nm
    End If
End Sub

' 기존 연결 부분 해제 — 「일부」 버튼 클릭 시 진입.
'   해제 모드 활성화 → 대상 화살표의 코어가 클릭으로 토글 가능해짐.
'   Step 1 (방사형) 에서 호출되면 자동으로 Step 2 진입 후 해제 모드 활성.
Public Sub 선번연결_도구_연결부분해제()
    Dim nm As String: nm = Application.Caller
    Dim wsTool As Worksheet: Set wsTool = ThisWorkbook.Worksheets(SHEET_PAIR_TOOL)
    Dim btn As Shape: Set btn = Nothing
    On Error Resume Next
    Set btn = wsTool.Shapes(nm)
    On Error GoTo 0
    If btn Is Nothing Then Exit Sub
    Dim alt As String: alt = ""
    On Error Resume Next
    alt = btn.AlternativeText
    On Error GoTo 0
    Dim p As Long: p = InStr(alt, "arr=")
    If p = 0 Then Exit Sub
    Dim arrName As String: arrName = Mid(alt, p + 4)

    ' RN 그룹 감지 — 화살표 alt 에 rngrp 있으면 RN 부분 해제 모드 진입
    Dim wsNwRn As Worksheet: Set wsNwRn = ThisWorkbook.Worksheets(SHEET_NETWORK)
    Dim arrShpRn As Shape: Set arrShpRn = Nothing
    On Error Resume Next
    Set arrShpRn = wsNwRn.Shapes(arrName)
    On Error GoTo 0
    If Not arrShpRn Is Nothing Then
        Dim arrAltRn As String: arrAltRn = ""
        On Error Resume Next: arrAltRn = arrShpRn.AlternativeText: On Error GoTo 0
        Dim pGrpRn As Long: pGrpRn = InStr(arrAltRn, "rngrp=")
        If pGrpRn > 0 Then
            Dim gEndRn As Long: gEndRn = InStr(pGrpRn, arrAltRn, "|")
            If gEndRn = 0 Then gEndRn = Len(arrAltRn) + 1
            Dim rnGrpIdRn As String: rnGrpIdRn = Mid(arrAltRn, pGrpRn + 6, gEndRn - (pGrpRn + 6))
            선번연결_도구_RN부분해제_진입 rnGrpIdRn
            Exit Sub
        End If
    End If

    Dim val As String: val = ""
    On Error Resume Next
    val = CStr(g_pt_existingConns(arrName))
    On Error GoTo 0
    If Len(val) = 0 Then Exit Sub
    Dim parts() As String: parts = Split(val, "|")
    If UBound(parts) < 5 Then Exit Sub

    ' Step 1 (방사형) 에서 호출 — 짝의 케이블 두 개로 Step 2 자동 진입
    If g_pt_step <> 2 Then
        Dim side1Type As String, side2Type As String
        Dim side1Name As String, side2Name As String
        side1Name = parts(4): side2Name = parts(5)
        If side1Name = g_pt_facId Then side1Type = "facility" Else side1Type = "cable"
        If side2Name = g_pt_facId Then side2Type = "facility" Else side2Type = "cable"
        선번연결_도구_Step2진입 side1Type, side1Name, side2Type, side2Name
    End If

    ' 해제 모드 진입 — releasePairs 빌드 + 관련 유닛 자동 펼침
    Dim wsNw As Worksheet: Set wsNw = ThisWorkbook.Worksheets(SHEET_NETWORK)
    Dim boxA As Shape, boxB As Shape
    On Error Resume Next
    Set boxA = wsNw.Shapes(parts(0))
    Set boxB = wsNw.Shapes(parts(1))
    On Error GoTo 0
    If boxA Is Nothing Or boxB Is Nothing Then Exit Sub

    Dim altA As String: altA = ""
    On Error Resume Next: altA = boxA.AlternativeText: On Error GoTo 0
    Dim aIsCbl1 As Boolean
    aIsCbl1 = (Len(g_pt_cbl1Name) > 0 And InStr(altA, "cbl=" & g_pt_cbl1Name) > 0)

    Dim leftTxt As String, rightTxt As String
    If aIsCbl1 Then
        leftTxt = parts(2): rightTxt = parts(3)
    Else
        leftTxt = parts(3): rightTxt = parts(2)
    End If

    Dim numsL As Variant, numsR As Variant
    선번_파싱 leftTxt, numsL
    선번_파싱 rightTxt, numsR
    If IsEmpty(numsL) Or IsEmpty(numsR) Then
        MsgBox "박스 텍스트 파싱 실패.", vbExclamation, "부분 해제"
        Exit Sub
    End If

    Set g_pt_releasePairs = CreateObject("Scripting.Dictionary")
    Set g_pt_releaseSelected = CreateObject("Scripting.Dictionary")
    g_pt_releaseArrName = arrName
    g_pt_releaseMode = True

    If g_pt_expandedA Is Nothing Then Set g_pt_expandedA = CreateObject("Scripting.Dictionary")
    If g_pt_expandedB Is Nothing Then Set g_pt_expandedB = CreateObject("Scripting.Dictionary")

    Dim mi As Long, mn As Long
    mn = UBound(numsL): If UBound(numsR) < mn Then mn = UBound(numsR)
    For mi = 0 To mn
        Dim aN As Long: aN = CLng(numsL(mi))
        Dim bN As Long: bN = CLng(numsR(mi))
        g_pt_releasePairs(aN) = bN
        ' 짝의 코어가 속한 유닛 자동 펼침 (사용자가 클릭할 수 있게)
        If g_pt_unitSize1 > 0 Then g_pt_expandedA(((aN - 1) \ g_pt_unitSize1) + 1) = True
        If g_pt_unitSize2 > 0 Then g_pt_expandedB(((bN - 1) \ g_pt_unitSize2) + 1) = True
    Next mi

    ' 진행 중 선택 초기화 (해제 모드에서 코어 클릭은 release 의미)
    If Not g_pt_selA Is Nothing Then g_pt_selA.RemoveAll
    If Not g_pt_selB Is Nothing Then g_pt_selB.RemoveAll
    If Not g_pt_selUnitsA Is Nothing Then g_pt_selUnitsA.RemoveAll
    If Not g_pt_selUnitsB Is Nothing Then g_pt_selUnitsB.RemoveAll
    If Not g_pt_mappings Is Nothing Then g_pt_mappings.RemoveAll

    선번연결_도구_시트빌드
    선번연결_도구_시각갱신
    Application.StatusBar = "해제 모드 — 해제할 코어를 클릭으로 선택 후 「해제 확인」. 「취소」 로 종료."
End Sub

' RN 그룹 부분 해제 모드 진입 — 그 그룹의 모든 Cable A·B 코어를 amber 로 표시 + 클릭 토글.
Public Sub 선번연결_도구_RN부분해제_진입(rnGrpId As String)
    Dim wsNw As Worksheet: Set wsNw = ThisWorkbook.Worksheets(SHEET_NETWORK)
    Dim targetTag As String: targetTag = "rngrp=" & rnGrpId

    ' 그룹의 모든 박스 → side 별 코어 추출 (Cable A/B + RN IN/OUT 모두)
    Set g_pt_rnReleaseTargetA = CreateObject("Scripting.Dictionary")
    Set g_pt_rnReleaseTargetB = CreateObject("Scripting.Dictionary")
    Set g_pt_rnReleaseSelA = CreateObject("Scripting.Dictionary")
    Set g_pt_rnReleaseSelB = CreateObject("Scripting.Dictionary")
    Set g_pt_rnReleaseTargetIN = CreateObject("Scripting.Dictionary")
    Set g_pt_rnReleaseTargetOUT = CreateObject("Scripting.Dictionary")
    Set g_pt_rnReleaseSelIN = CreateObject("Scripting.Dictionary")
    Set g_pt_rnReleaseSelOUT = CreateObject("Scripting.Dictionary")

    Dim sh As Shape, alt As String
    Dim cblAName As String, cblBName As String
    cblAName = "": cblBName = ""
    For Each sh In wsNw.Shapes
        If Left(sh.Name, Len(PREFIX_PAIRBOX)) = PREFIX_PAIRBOX Then
            alt = "": On Error Resume Next: alt = sh.AlternativeText: On Error GoTo 0
            If InStr(alt, targetTag) > 0 And InStr(alt, "rn_lbl=") = 0 Then
                Dim pRn As Long: pRn = InStr(alt, "rn=")
                If pRn > 0 Then
                    Dim rnEnd As Long: rnEnd = InStr(pRn, alt, "|")
                    If rnEnd = 0 Then rnEnd = Len(alt) + 1
                    Dim rnTag As String: rnTag = Mid(alt, pRn + 3, rnEnd - (pRn + 3))
                    Dim cTxt As String: cTxt = ""
                    On Error Resume Next: cTxt = sh.TextFrame2.TextRange.Text: On Error GoTo 0

                    ' cbl name 도 추출 (Step2진입용)
                    Dim pCbl As Long: pCbl = InStr(alt, "cbl=")
                    Dim cblName As String: cblName = ""
                    If pCbl > 0 Then
                        Dim cblEnd As Long: cblEnd = InStr(pCbl, alt, "|")
                        If cblEnd = 0 Then cblEnd = Len(alt) + 1
                        cblName = Mid(alt, pCbl + 4, cblEnd - (pCbl + 4))
                    End If

                    ' Cable 측: rn=A/B — owner 2026-06-06: multi-token "1,2" 도 처리 (콤마 split).
                    '   주의: 한국어 locale 에서 IsNumeric("1,2")=True · CLng("1,2")=12 라 단순 IsNumeric 검사 시
                    '   core 12 가 잘못 amber 로 등록되는 버그. 콤마로 split 후 각 토큰 별로 IsNumeric 검사.
                    If (rnTag = "A" Or rnTag = "B") Then
                        Dim toksC() As String: toksC = Split(cTxt, ",")
                        Dim tkC As Long
                        For tkC = LBound(toksC) To UBound(toksC)
                            Dim ttC As String: ttC = Trim(toksC(tkC))
                            If Len(ttC) > 0 And IsNumeric(ttC) Then
                                Dim coreVC As Long: coreVC = CLng(ttC)
                                If rnTag = "A" Then
                                    g_pt_rnReleaseTargetA(coreVC) = True
                                    If Len(cblAName) = 0 Then cblAName = cblName
                                Else
                                    g_pt_rnReleaseTargetB(coreVC) = True
                                    If Len(cblBName) = 0 Then cblBName = cblName
                                End If
                            End If
                        Next tkC
                    End If

                    ' RN 측: rn=IN/OUT/i/m/s/p — 텍스트는 numeric ("1") 또는 prefix ("i_1","m_2","s_3","p_4") 또는 multi-token ("i_1,m_2")
                    Dim isRnSide As Boolean
                    isRnSide = (rnTag = "IN" Or rnTag = "OUT" Or rnTag = "i" Or rnTag = "m" Or rnTag = "s" Or rnTag = "p")
                    If isRnSide Then
                        Dim toksR() As String: toksR = Split(cTxt, ",")
                        Dim tkR As Long
                        For tkR = LBound(toksR) To UBound(toksR)
                            Dim tt As String: tt = Trim(toksR(tkR))
                            If Len(tt) > 0 Then
                                Dim usP As Long: usP = InStr(tt, "_")
                                Dim prefT As String, numT As String
                                If usP > 0 Then
                                    prefT = LCase(Left(tt, usP - 1))
                                    numT = Mid(tt, usP + 1)
                                Else
                                    prefT = ""
                                    numT = tt
                                End If
                                If IsNumeric(numT) Then
                                    Dim coreVR As Long: coreVR = CLng(numT)
                                    Select Case prefT
                                        Case "i":              g_pt_rnReleaseTargetIN(coreVR) = True
                                        Case "m", "s", "p":    g_pt_rnReleaseTargetOUT(coreVR) = True
                                        Case Else
                                            ' prefix 없으면 rn= 값으로 fallback
                                            If rnTag = "IN" Or rnTag = "i" Then
                                                g_pt_rnReleaseTargetIN(coreVR) = True
                                            ElseIf rnTag = "OUT" Or rnTag = "m" Or rnTag = "s" Or rnTag = "p" Then
                                                g_pt_rnReleaseTargetOUT(coreVR) = True
                                            End If
                                    End Select
                                End If
                            End If
                        Next tkR
                    End If
                End If
            End If
        End If
    Next sh

    If g_pt_rnReleaseTargetA.Count = 0 And g_pt_rnReleaseTargetB.Count = 0 _
       And g_pt_rnReleaseTargetIN.Count = 0 And g_pt_rnReleaseTargetOUT.Count = 0 Then
        MsgBox "해제할 RN 코어 페어가 없습니다.", vbExclamation, "RN 부분 해제"
        Exit Sub
    End If

    ' Step 1 (방사형) 에서 호출 — 그룹의 케이블 두 개로 Step 2 진입
    If g_pt_step <> 2 Then
        If Len(cblAName) > 0 And Len(cblBName) > 0 Then
            선번연결_도구_Step2진입 "cable", cblAName, "cable", cblBName
        Else
            MsgBox "RN 부분 해제는 Step 2 (코어 매핑) 화면에서 진행하세요.", vbExclamation, "RN 부분 해제"
            Exit Sub
        End If
    End If

    g_pt_rnReleaseGrpId = rnGrpId
    g_pt_rnReleaseMode = True

    ' A·B 모두 유닛 펼침 (사용자 클릭 가능하게)
    If g_pt_expandedA Is Nothing Then Set g_pt_expandedA = CreateObject("Scripting.Dictionary")
    If g_pt_expandedB Is Nothing Then Set g_pt_expandedB = CreateObject("Scripting.Dictionary")
    Dim ck As Variant
    For Each ck In g_pt_rnReleaseTargetA.Keys
        If g_pt_unitSize1 > 0 Then g_pt_expandedA(((CLng(ck) - 1) \ g_pt_unitSize1) + 1) = True
    Next ck
    For Each ck In g_pt_rnReleaseTargetB.Keys
        If g_pt_unitSize2 > 0 Then g_pt_expandedB(((CLng(ck) - 1) \ g_pt_unitSize2) + 1) = True
    Next ck

    ' 진행 중 선택 초기화
    If Not g_pt_selA Is Nothing Then g_pt_selA.RemoveAll
    If Not g_pt_selB Is Nothing Then g_pt_selB.RemoveAll
    If Not g_pt_selUnitsA Is Nothing Then g_pt_selUnitsA.RemoveAll
    If Not g_pt_selUnitsB Is Nothing Then g_pt_selUnitsB.RemoveAll
    If Not g_pt_mappings Is Nothing Then g_pt_mappings.RemoveAll
    If Not g_pt_mappingsA_IN Is Nothing Then g_pt_mappingsA_IN.RemoveAll
    If Not g_pt_mappingsOUT_B Is Nothing Then g_pt_mappingsOUT_B.RemoveAll

    선번연결_도구_시트빌드
    선번연결_도구_시각갱신
    Application.StatusBar = "RN 부분 해제 모드 — A·B amber 박스 클릭으로 해제할 페어 선택 후 「해제 확인」."
End Sub

' 해제 모드 종료 — releaseSelected 가 비어있지 않으면 적용 후 종료. 비었으면 그냥 종료.
Public Sub 선번연결_도구_해제확인()
    ' RN 부분 해제 모드 분기 (owner 2026-06-06: IN·OUT 도 선택 가능)
    If g_pt_rnReleaseMode Then
        Dim rnSelACnt As Long, rnSelBCnt As Long, rnSelINCnt As Long, rnSelOUTCnt As Long
        rnSelACnt = 0: rnSelBCnt = 0: rnSelINCnt = 0: rnSelOUTCnt = 0
        If Not g_pt_rnReleaseSelA Is Nothing Then rnSelACnt = g_pt_rnReleaseSelA.Count
        If Not g_pt_rnReleaseSelB Is Nothing Then rnSelBCnt = g_pt_rnReleaseSelB.Count
        If Not g_pt_rnReleaseSelIN Is Nothing Then rnSelINCnt = g_pt_rnReleaseSelIN.Count
        If Not g_pt_rnReleaseSelOUT Is Nothing Then rnSelOUTCnt = g_pt_rnReleaseSelOUT.Count
        If rnSelACnt + rnSelBCnt + rnSelINCnt + rnSelOUTCnt = 0 Then
            Application.StatusBar = "해제할 코어를 amber 박스 클릭으로 먼저 선택하세요."
            Exit Sub
        End If
        Dim rnGrpId As String: rnGrpId = g_pt_rnReleaseGrpId
        Dim wsNwR As Worksheet: Set wsNwR = ThisWorkbook.Worksheets(SHEET_NETWORK)
        Dim wasProtR As Boolean: wasProtR = wsNwR.ProtectContents Or wsNwR.ProtectDrawingObjects
        On Error Resume Next
        wsNwR.Unprotect
        On Error GoTo 0

        ' Cable A·B 선택 — cable 측 코어 매칭으로 페어 삭제
        If rnSelACnt > 0 Then
            선번연결_도구_RNgrp_부분삭제 wsNwR, rnGrpId, g_pt_rnReleaseSelA, "A"
        End If
        If rnSelBCnt > 0 Then
            선번연결_도구_RNgrp_부분삭제 wsNwR, rnGrpId, g_pt_rnReleaseSelB, "B"
        End If
        ' RN IN·OUT 선택 — RN 측 코어 매칭으로 페어 삭제 (cable 선택 안 해도 RN 클릭만으로 동작)
        If rnSelINCnt > 0 Then
            선번연결_도구_RNgrp_부분삭제 wsNwR, rnGrpId, g_pt_rnReleaseSelIN, "IN"
        End If
        If rnSelOUTCnt > 0 Then
            선번연결_도구_RNgrp_부분삭제 wsNwR, rnGrpId, g_pt_rnReleaseSelOUT, "OUT"
        End If

        If wasProtR Then ApplySheetProtection wsNwR

        ' 모드 종료
        g_pt_rnReleaseMode = False
        g_pt_rnReleaseGrpId = ""
        Set g_pt_rnReleaseTargetA = Nothing: Set g_pt_rnReleaseTargetB = Nothing
        Set g_pt_rnReleaseSelA = Nothing: Set g_pt_rnReleaseSelB = Nothing
        Set g_pt_rnReleaseTargetIN = Nothing: Set g_pt_rnReleaseTargetOUT = Nothing
        Set g_pt_rnReleaseSelIN = Nothing: Set g_pt_rnReleaseSelOUT = Nothing

        선번연결_도구_기존수집
        선번연결_도구_시트빌드
        선번연결_도구_시각갱신
        ' owner 2026-06-08 (8-113): 코어 해제 후 주간/야간 박스 자동 갱신 (연결 추가와 동일 패턴).
        On Error Resume Next
        시설물_상태박스_주간_자동갱신 ThisWorkbook.Worksheets(SHEET_NETWORK), g_pt_facId
        On Error GoTo 0
        On Error Resume Next
        ThisWorkbook.Worksheets(SHEET_PAIR_TOOL).Activate
        On Error GoTo 0
        Application.StatusBar = "RN 부분 해제 완료 — Cable A·B " & (rnSelACnt + rnSelBCnt) & _
                                " · RN IN·OUT " & (rnSelINCnt + rnSelOUTCnt) & " 페어 삭제."
        Exit Sub
    End If
    If Not g_pt_releaseMode Then Exit Sub
    Dim relEmpty As Boolean: relEmpty = False
    If g_pt_releaseSelected Is Nothing Then
        relEmpty = True
    ElseIf g_pt_releaseSelected.Count = 0 Then
        relEmpty = True
    End If
    If relEmpty Then
        Application.StatusBar = "해제할 코어를 코어 박스 클릭으로 먼저 선택하세요."
        Exit Sub
    End If
    Dim arrName As String: arrName = g_pt_releaseArrName
    Dim selSet As Object: Set selSet = g_pt_releaseSelected
    Dim selCount As Long: selCount = selSet.Count

    ' 해제 모드 상태 정리 (재빌드 전에 해제해야 시트빌드에서 일반 행으로 그림)
    g_pt_releaseMode = False
    g_pt_releaseArrName = ""
    Set g_pt_releasePairs = Nothing
    Set g_pt_releaseSelected = Nothing

    Dim allMode As Boolean
    allMode = 선번연결_도구_연결부분해제_적용(arrName, selSet)

    ' owner 2026-06-08 (8-113): 코어 해제 후 주간/야간 박스 자동 갱신.
    On Error Resume Next
    시설물_상태박스_주간_자동갱신 ThisWorkbook.Worksheets(SHEET_NETWORK), g_pt_facId
    On Error GoTo 0

    If allMode Then
        Application.StatusBar = "전체 해제 — 박스·화살표 삭제 완료 (" & selCount & "쌍)."
    Else
        Application.StatusBar = "부분 해제 " & selCount & " 쌍 — 잠금 해제 완료."
    End If
End Sub

' 해제 모드 취소 — 변경 없이 종료. 일반 + RN release 둘 다 정리.
Public Sub 선번연결_도구_해제취소()
    g_pt_releaseMode = False
    g_pt_releaseArrName = ""
    Set g_pt_releasePairs = Nothing
    Set g_pt_releaseSelected = Nothing
    g_pt_rnReleaseMode = False
    g_pt_rnReleaseGrpId = ""
    Set g_pt_rnReleaseTargetA = Nothing: Set g_pt_rnReleaseTargetB = Nothing
    Set g_pt_rnReleaseSelA = Nothing: Set g_pt_rnReleaseSelB = Nothing
    Set g_pt_rnReleaseTargetIN = Nothing: Set g_pt_rnReleaseTargetOUT = Nothing
    Set g_pt_rnReleaseSelIN = Nothing: Set g_pt_rnReleaseSelOUT = Nothing
    선번연결_도구_시트빌드
    선번연결_도구_시각갱신
    Application.StatusBar = "해제 모드 취소."
End Sub

' 실제 해제 적용 — A 코어 set 받아 박스 텍스트 갱신 또는 박스+화살표 삭제.
'   selSet: Dictionary<aCore, True> — 해제 대상 (A 사이드 기준).
'   반환: True 면 전체 삭제 모드 (모든 코어 해제), False 면 부분 갱신.
Public Function 선번연결_도구_연결부분해제_적용(arrName As String, selSet As Object) As Boolean
    선번연결_도구_연결부분해제_적용 = False
    If selSet Is Nothing Then Exit Function
    If selSet.Count = 0 Then Exit Function

    Dim wsNw As Worksheet: Set wsNw = ThisWorkbook.Worksheets(SHEET_NETWORK)
    Dim val As String: val = ""
    On Error Resume Next
    val = CStr(g_pt_existingConns(arrName))
    On Error GoTo 0
    If Len(val) = 0 Then Exit Function
    Dim parts() As String: parts = Split(val, "|")
    If UBound(parts) < 5 Then Exit Function
    Dim boxAName As String, boxBName As String
    boxAName = parts(0): boxBName = parts(1)

    Dim boxA As Shape, boxB As Shape
    Set boxA = Nothing: Set boxB = Nothing
    On Error Resume Next
    Set boxA = wsNw.Shapes(boxAName)
    Set boxB = wsNw.Shapes(boxBName)
    On Error GoTo 0
    If boxA Is Nothing Or boxB Is Nothing Then Exit Function

    Dim txtA As String, txtB As String
    txtA = "": txtB = ""
    On Error Resume Next
    txtA = boxA.TextFrame2.TextRange.Text
    txtB = boxB.TextFrame2.TextRange.Text
    On Error GoTo 0

    Dim altA As String: altA = ""
    On Error Resume Next: altA = boxA.AlternativeText: On Error GoTo 0
    Dim aIsCbl1 As Boolean
    aIsCbl1 = (Len(g_pt_cbl1Name) > 0 And InStr(altA, "cbl=" & g_pt_cbl1Name) > 0)

    Dim leftCoresTxt As String, rightCoresTxt As String
    Dim leftBox As Shape, rightBox As Shape
    If aIsCbl1 Then
        leftCoresTxt = txtA: rightCoresTxt = txtB
        Set leftBox = boxA: Set rightBox = boxB
    Else
        leftCoresTxt = txtB: rightCoresTxt = txtA
        Set leftBox = boxB: Set rightBox = boxA
    End If

    Dim numsL As Variant, numsR As Variant
    선번_파싱 leftCoresTxt, numsL
    선번_파싱 rightCoresTxt, numsR
    If IsEmpty(numsL) Or IsEmpty(numsR) Then Exit Function

    ' selSet 의 A 코어 → index 변환
    Dim removeIdx As Object: Set removeIdx = CreateObject("Scripting.Dictionary")
    Dim pi As Long
    Dim sk As Variant
    For Each sk In selSet.Keys
        Dim wantedA As Long: wantedA = CLng(sk)
        For pi = 0 To UBound(numsL)
            If CLng(numsL(pi)) = wantedA Then
                removeIdx(pi) = True
                Exit For
            End If
        Next pi
    Next sk

    If removeIdx.Count = 0 Then Exit Function

    Dim wasProt As Boolean: wasProt = wsNw.ProtectContents Or wsNw.ProtectDrawingObjects
    On Error Resume Next
    wsNw.Unprotect
    On Error GoTo 0

    Dim allMode As Boolean: allMode = (removeIdx.Count > UBound(numsL))
    선번연결_도구_연결부분해제_적용 = allMode

    If allMode Then
        ' owner 2026-06-05: 코어 전체 해제 시 그 케이블 페어 전체 cleanup —
        '   같은 (fac + cbl1 + cbl2) 의 모든 anchor (box1=|box2=) + main arrow (main=1|...) + 박스 일괄 삭제.
        '   cascade 박스도 함께 삭제 (= 그 케이블 페어 다 비움 = 케이블 사이 박스·화살표 0개).
        Dim toDelete As Collection: Set toDelete = New Collection
        Dim boxNames As Object: Set boxNames = CreateObject("Scripting.Dictionary")

        Dim sh_ As Shape, alt_ As String
        For Each sh_ In wsNw.Shapes
            If Left(sh_.Name, Len(PREFIX_PAIRARROW)) = PREFIX_PAIRARROW Then
                alt_ = "": On Error Resume Next: alt_ = sh_.AlternativeText: On Error GoTo 0
                Dim isAnchor As Boolean: isAnchor = False
                Dim isMain As Boolean: isMain = False
                Dim ip1 As Long: ip1 = InStr(alt_, "box1=")
                Dim ip2 As Long: ip2 = InStr(alt_, "|box2=")
                If ip1 = 1 And ip2 > ip1 Then
                    ' anchor — box1·box2 의 alt 에서 fac+cbl 검사 후 매칭이면 삭제 대상
                    Dim b1Nm As String, b2Nm As String
                    b1Nm = Mid(alt_, ip1 + 5, ip2 - (ip1 + 5))
                    Dim ip3 As Long: ip3 = InStr(ip2 + 6, alt_, "|")
                    If ip3 = 0 Then ip3 = Len(alt_) + 1
                    b2Nm = Mid(alt_, ip2 + 6, ip3 - (ip2 + 6))
                    Dim b1Shp_ As Shape, b2Shp_ As Shape: Set b1Shp_ = Nothing: Set b2Shp_ = Nothing
                    On Error Resume Next
                    Set b1Shp_ = wsNw.Shapes(b1Nm)
                    Set b2Shp_ = wsNw.Shapes(b2Nm)
                    On Error GoTo 0
                    If Not b1Shp_ Is Nothing And Not b2Shp_ Is Nothing Then
                        Dim ba1 As String, ba2 As String: ba1 = "": ba2 = ""
                        On Error Resume Next
                        ba1 = b1Shp_.AlternativeText
                        ba2 = b2Shp_.AlternativeText
                        On Error GoTo 0
                        If InStr(ba1, "fac=" & g_pt_facId) > 0 And InStr(ba2, "fac=" & g_pt_facId) > 0 Then
                            ' cbl=cbl1 / cbl=cbl2 (또는 swap) 매칭
                            Dim cblA1 As Boolean, cblB1 As Boolean
                            cblA1 = (InStr(ba1, "cbl=" & g_pt_cbl1Name & "|") > 0 Or InStr(ba1 & "|", "cbl=" & g_pt_cbl1Name & "|") > 0)
                            cblB1 = (InStr(ba1, "cbl=" & g_pt_cbl2Name & "|") > 0 Or InStr(ba1 & "|", "cbl=" & g_pt_cbl2Name & "|") > 0)
                            Dim cblA2 As Boolean, cblB2 As Boolean
                            cblA2 = (InStr(ba2, "cbl=" & g_pt_cbl1Name & "|") > 0 Or InStr(ba2 & "|", "cbl=" & g_pt_cbl1Name & "|") > 0)
                            cblB2 = (InStr(ba2, "cbl=" & g_pt_cbl2Name & "|") > 0 Or InStr(ba2 & "|", "cbl=" & g_pt_cbl2Name & "|") > 0)
                            If (cblA1 And cblB2) Or (cblB1 And cblA2) Then
                                isAnchor = True
                                boxNames(b1Nm) = True
                                boxNames(b2Nm) = True
                            End If
                        End If
                    End If
                Else
                    ' main arrow — main=1|fac=...|cblA=...|cblB=...
                    If InStr(alt_, "main=1") > 0 And InStr(alt_, "fac=" & g_pt_facId) > 0 Then
                        Dim mAOk As Boolean, mBOk As Boolean
                        mAOk = (InStr(alt_, "cblA=" & g_pt_cbl1Name) > 0 And InStr(alt_, "cblB=" & g_pt_cbl2Name) > 0)
                        mBOk = (InStr(alt_, "cblA=" & g_pt_cbl2Name) > 0 And InStr(alt_, "cblB=" & g_pt_cbl1Name) > 0)
                        If mAOk Or mBOk Then isMain = True
                    End If
                End If
                If isAnchor Or isMain Then toDelete.Add sh_
            End If
        Next sh_

        ' 1) 모든 anchor + main arrow 삭제
        Dim td As Long
        For td = 1 To toDelete.Count
            On Error Resume Next: toDelete(td).Delete: On Error GoTo 0
        Next td

        ' 2) 박스 본체 삭제 (수집한 박스 + arrName 직접 페어 박스 보강)
        boxNames(boxAName) = True
        boxNames(boxBName) = True
        Dim bkv As Variant
        For Each bkv In boxNames.Keys
            On Error Resume Next: wsNw.Shapes(CStr(bkv)).Delete: On Error GoTo 0
        Next bkv

        ' 3) arrName 안전망 (이미 삭제됐을 수도)
        On Error Resume Next: wsNw.Shapes(arrName).Delete: On Error GoTo 0
    Else
        Dim newL() As Long, newR() As Long
        Dim keepCount As Long: keepCount = (UBound(numsL) + 1) - removeIdx.Count
        ReDim newL(0 To keepCount - 1)
        ReDim newR(0 To keepCount - 1)
        Dim ki As Long: ki = 0
        For pi = 0 To UBound(numsL)
            If Not removeIdx.Exists(pi) Then
                newL(ki) = CLng(numsL(pi))
                newR(ki) = CLng(numsR(pi))
                ki = ki + 1
            End If
        Next pi

        ' owner 2026-06-06: 페어 segment 압축 (연결완료 와 동일 로직)
        Dim nLTxt As String, nRTxt As String
        선번연결_도구_페어텍스트_빌드 newL, newR, nLTxt, nRTxt

        On Error Resume Next
        leftBox.TextFrame2.TextRange.Text = nLTxt
        leftBox.TextFrame2.WordWrap = False
        leftBox.TextFrame2.AutoSize = msoAutoSizeShapeToFitText
        If leftBox.Width > 80 Then
            leftBox.TextFrame2.AutoSize = msoAutoSizeNone
            leftBox.Width = 80
            leftBox.TextFrame2.WordWrap = msoTrue
        End If
        rightBox.TextFrame2.TextRange.Text = nRTxt
        rightBox.TextFrame2.WordWrap = False
        rightBox.TextFrame2.AutoSize = msoAutoSizeShapeToFitText
        If rightBox.Width > 80 Then
            rightBox.TextFrame2.AutoSize = msoAutoSizeNone
            rightBox.Width = 80
            rightBox.TextFrame2.WordWrap = msoTrue
        End If
        On Error GoTo 0
    End If

    If wasProt Then ApplySheetProtection wsNw

    ' 기존 다시 수집 + step 별 재빌드
    선번연결_도구_기존수집
    If g_pt_step = 2 Then
        선번연결_도구_시트빌드
        선번연결_도구_시각갱신
    Else
        선번연결_도구_방사형빌드 g_pt_facId
    End If
End Function

Public Sub 선번연결_도구_연결강조()
    Dim nm As String: nm = Application.Caller
    Dim wsTool As Worksheet: Set wsTool = ThisWorkbook.Worksheets(SHEET_PAIR_TOOL)
    Dim btn As Shape: Set btn = Nothing
    On Error Resume Next
    Set btn = wsTool.Shapes(nm)
    On Error GoTo 0
    If btn Is Nothing Then Exit Sub

    Dim alt As String: alt = ""
    On Error Resume Next
    alt = btn.AlternativeText
    On Error GoTo 0
    Dim p As Long: p = InStr(alt, "arr=")
    If p = 0 Then Exit Sub
    Dim arrName As String: arrName = Mid(alt, p + 4)

    ' side 인수 파싱 — "side=L|R|B" (기본 "B" 양쪽)
    Dim sideMode As String: sideMode = "B"
    Dim ps As Long: ps = InStr(alt, "side=")
    If ps > 0 Then
        Dim sEnd As Long: sEnd = InStr(ps, alt, "|")
        If sEnd = 0 Then sEnd = Len(alt) + 1
        sideMode = Mid(alt, ps + 5, sEnd - (ps + 5))
        If sideMode <> "L" And sideMode <> "R" Then sideMode = "B"
    End If

    Dim val As String: val = ""
    On Error Resume Next
    val = CStr(g_pt_existingConns(arrName))
    On Error GoTo 0
    If Len(val) = 0 Then Exit Sub
    Dim parts() As String: parts = Split(val, "|")
    If UBound(parts) < 5 Then Exit Sub
    Dim cableA As String, cableB As String
    cableA = parts(4): cableB = parts(5)

    ' sideMode 에 따라 강조 대상 케이블 집합 결정
    Dim hiA As Boolean, hiB As Boolean
    Select Case sideMode
        Case "L": hiA = True:  hiB = False
        Case "R": hiA = False: hiB = True
        Case Else: hiA = True: hiB = True
    End Select

    Dim sh As Shape
    For Each sh In wsTool.Shapes
        ' 방사형 캔버스의 케이블 라인만 (이름 = PREFIX_PT_RADIAL & cblName, 단 "center"·"end_..." 제외)
        If Left(sh.Name, Len(PREFIX_PT_RADIAL)) = PREFIX_PT_RADIAL Then
            Dim suffix As String: suffix = Mid(sh.Name, Len(PREFIX_PT_RADIAL) + 1)
            If suffix <> "center" And Left(suffix, 4) <> "end_" Then
                On Error Resume Next
                Dim matchHi As Boolean: matchHi = False
                If hiA And sh.Name = (PREFIX_PT_RADIAL & cableA) Then matchHi = True
                If hiB And sh.Name = (PREFIX_PT_RADIAL & cableB) Then matchHi = True
                If matchHi Then
                    sh.Line.ForeColor.RGB = RGB(236, 72, 153)        ' 핑크
                    sh.Line.Weight = CBL_LINE_WEIGHT + 2
                Else
                    sh.Line.ForeColor.RGB = CBL_DEFAULT_COLOR
                    sh.Line.Weight = CBL_LINE_WEIGHT
                End If
                On Error GoTo 0
            End If
        End If
    Next sh

    ' 양쪽 끝 시설물(⊗) 도 강조 — 끝 시설물 도형 이름 = PREFIX_PT_RADIAL & "end_" & cblName
    For Each sh In wsTool.Shapes
        If Left(sh.Name, Len(PREFIX_PT_RADIAL) + 4) = PREFIX_PT_RADIAL & "end_" Then
            Dim cblNm As String: cblNm = Mid(sh.Name, Len(PREFIX_PT_RADIAL) + 5)
            On Error Resume Next
            Dim matchEnd As Boolean: matchEnd = False
            If hiA And cblNm = cableA Then matchEnd = True
            If hiB And cblNm = cableB Then matchEnd = True
            If matchEnd Then
                sh.Line.ForeColor.RGB = RGB(236, 72, 153)
                sh.Line.Weight = 2.5
            Else
                sh.Line.ForeColor.RGB = CBL_DEFAULT_COLOR
                sh.Line.Weight = 1.5
            End If
            On Error GoTo 0
        End If
    Next sh

    Dim sideLabel As String
    Select Case sideMode
        Case "L": sideLabel = "왼쪽만 (" & 선번연결_도구_케이블타끝시설물명(cableA) & ")"
        Case "R": sideLabel = "오른쪽만 (" & 선번연결_도구_케이블타끝시설물명(cableB) & ")"
        Case Else: sideLabel = 선번연결_도구_케이블타끝시설물명(cableA) & " ↔ " & 선번연결_도구_케이블타끝시설물명(cableB)
    End Select
    Application.StatusBar = "연결 강조 — " & sideLabel & " (코어 「" & parts(2) & "」 ↔ 「" & parts(3) & "」)"
End Sub

' 연결완료 — 이번 세션 g_pt_mappings 로 선번박스_쌍_생성 호출
' 머지 타깃 설정 (owner 2026-06-05): 기존 연결 entry 의 「+ 코어」 클릭 → 다음 「연결완료」 가 그 entry 박스에 머지.
'   같은 entry 다시 누르면 OFF (토글). 다른 entry 누르면 새 타깃으로 전환.
Public Sub 선번연결_도구_머지타깃설정()
    Dim btnNm As String: btnNm = Application.Caller
    Dim wsTool As Worksheet: Set wsTool = ThisWorkbook.Worksheets(SHEET_PAIR_TOOL)
    Dim sh As Shape: Set sh = Nothing
    On Error Resume Next
    Set sh = wsTool.Shapes(btnNm)
    On Error GoTo 0
    If sh Is Nothing Then Exit Sub

    Dim alt As String: alt = ""
    On Error Resume Next: alt = sh.AlternativeText: On Error GoTo 0
    Dim pA As Long: pA = InStr(alt, "arr=")
    If pA = 0 Then Exit Sub
    Dim arrName As String: arrName = Mid(alt, pA + 4)

    ' 토글
    If g_pt_mergeTargetArrName = arrName Then
        g_pt_mergeTargetArrName = ""
        Application.StatusBar = "머지 타깃 해제 — 다음 연결완료는 기본 흐름 (캐논 머지 또는 박스추가)."
    Else
        g_pt_mergeTargetArrName = arrName
        Application.StatusBar = "머지 타깃 설정 — 다음 「연결완료」 가 이 entry 박스에 머지됩니다. 다시 누르면 OFF."
    End If
    선번연결_도구_시트빌드
    선번연결_도구_시각갱신
End Sub

' 박스 정렬 (owner 2026-06-05): 네트웍구성도의 박스 드래그 후 cascade 박스 stack 재정렬 + main 화살표 재라우팅.
'   캐논 박스 위치를 기준으로 cascade 박스들을 아래로 다시 stack (gap 0). main 화살표 = 가장 아래 박스 사이 L-shape.
'   현재 선택된 케이블 페어 (g_pt_cbl1Name ↔ g_pt_cbl2Name) 한정.
Public Sub 선번연결_도구_박스정렬()
    선번연결_도구_박스정렬_silent False
End Sub

' silent=True 면 MsgBox 없이 silent 종료 (자동 호출 — 예: 기존수집 안에서).
Public Sub 선번연결_도구_박스정렬_silent(silent As Boolean)
    Dim ws As Worksheet: Set ws = ThisWorkbook.Worksheets(SHEET_NETWORK)
    Dim facShp As Shape: Set facShp = Nothing
    On Error Resume Next
    Set facShp = ws.Shapes(g_pt_facId)
    On Error GoTo 0
    If facShp Is Nothing Then
        If Not silent Then MsgBox "기준 시설물을 찾지 못했습니다.", vbExclamation, "박스 정렬"
        Exit Sub
    End If
    If Len(g_pt_cbl1Name) = 0 Or Len(g_pt_cbl2Name) = 0 Then
        If Not silent Then MsgBox "케이블 선택이 없습니다 (Step 2 진입 후 사용 가능).", vbExclamation, "박스 정렬"
        Exit Sub
    End If

    Dim wasProt As Boolean: wasProt = ws.ProtectContents Or ws.ProtectDrawingObjects
    On Error Resume Next: ws.Unprotect: On Error GoTo 0

    ' 1) 같은 케이블 페어의 anchor 도형 모두 수집 (캐논 + cascade).
    '    anchor 도형 = PREFIX_PAIRARROW 이름 + alt 에 box1=|box2= (cascade=1 유무 무관)
    Dim facTagL As String: facTagL = "fac=" & g_pt_facId
    Dim aNameL As String: aNameL = g_pt_cbl1Name
    Dim bNameL As String: bNameL = g_pt_cbl2Name

    Dim canonB1 As Shape, canonB2 As Shape
    Set canonB1 = Nothing: Set canonB2 = Nothing
    Dim cascB1List As Collection: Set cascB1List = New Collection
    Dim cascB2List As Collection: Set cascB2List = New Collection

    Dim sh As Shape, alt As String
    For Each sh In ws.Shapes
        If Left(sh.Name, Len(PREFIX_PAIRARROW)) = PREFIX_PAIRARROW Then
            alt = "": On Error Resume Next: alt = sh.AlternativeText: On Error GoTo 0
            Dim ip1 As Long: ip1 = InStr(alt, "box1=")
            Dim ip2 As Long: ip2 = InStr(alt, "|box2=")
            If ip1 = 1 And ip2 > ip1 Then
                Dim b1Nm As String, b2Nm As String
                b1Nm = Mid(alt, ip1 + 5, ip2 - (ip1 + 5))
                Dim ip3 As Long: ip3 = InStr(ip2 + 6, alt, "|")
                If ip3 = 0 Then ip3 = Len(alt) + 1
                b2Nm = Mid(alt, ip2 + 6, ip3 - (ip2 + 6))
                Dim b1Shp As Shape, b2Shp As Shape: Set b1Shp = Nothing: Set b2Shp = Nothing
                On Error Resume Next
                Set b1Shp = ws.Shapes(b1Nm)
                Set b2Shp = ws.Shapes(b2Nm)
                On Error GoTo 0
                If Not b1Shp Is Nothing And Not b2Shp Is Nothing Then
                    Dim ba1 As String, ba2 As String: ba1 = "": ba2 = ""
                    On Error Resume Next
                    ba1 = b1Shp.AlternativeText
                    ba2 = b2Shp.AlternativeText
                    On Error GoTo 0
                    If InStr(ba1, facTagL) > 0 And InStr(ba2, facTagL) > 0 Then
                        ' A/B 정규화 (b1=cblA, b2=cblB)
                        Dim cbl1ForB1 As String, cbl1ForB2 As String
                        cbl1ForB1 = Mid(ba1, InStr(ba1, "cbl=") + 4)
                        Dim eP As Long: eP = InStr(cbl1ForB1, "|")
                        If eP > 0 Then cbl1ForB1 = Left(cbl1ForB1, eP - 1)
                        cbl1ForB2 = Mid(ba2, InStr(ba2, "cbl=") + 4)
                        eP = InStr(cbl1ForB2, "|")
                        If eP > 0 Then cbl1ForB2 = Left(cbl1ForB2, eP - 1)

                        Dim normB1 As Shape, normB2 As Shape
                        Set normB1 = Nothing: Set normB2 = Nothing
                        If cbl1ForB1 = aNameL And cbl1ForB2 = bNameL Then
                            Set normB1 = b1Shp: Set normB2 = b2Shp
                        ElseIf cbl1ForB1 = bNameL And cbl1ForB2 = aNameL Then
                            Set normB1 = b2Shp: Set normB2 = b1Shp
                        End If
                        If Not normB1 Is Nothing Then
                            ' cascade 여부 판정
                            If InStr(alt, "|cascade=") > 0 Then
                                cascB1List.Add normB1
                                cascB2List.Add normB2
                            Else
                                ' canonical (1개만 있어야 함)
                                Set canonB1 = normB1
                                Set canonB2 = normB2
                            End If
                        End If
                    End If
                End If
            End If
        End If
    Next sh

    If canonB1 Is Nothing Or canonB2 Is Nothing Then
        If wasProt Then ApplySheetProtection ws
        ' silent=True 면 박스 0개 (= 첫 연결 만들기 전) 도 정상 케이스 — 다이얼로그 없이 종료
        If Not silent Then MsgBox "이 케이블 페어의 캐논 박스를 찾지 못했습니다.", vbExclamation, "박스 정렬"
        Exit Sub
    End If

    ' 2) cascade 박스들을 캐논 아래로 stack — Y 순서대로 정렬해서 stack 차례 유지
    '    A 측·B 측 각각 정렬 (Y 오름차순)
    Dim cnt As Long: cnt = cascB1List.Count
    If cnt > 0 Then
        Dim idxArr() As Long: ReDim idxArr(1 To cnt)
        Dim yArr() As Double: ReDim yArr(1 To cnt)
        Dim ii As Long
        For ii = 1 To cnt
            idxArr(ii) = ii
            yArr(ii) = cascB1List(ii).Top
        Next ii
        ' bubble sort by Y
        Dim jj As Long, tmpI As Long, tmpY As Double
        For ii = 1 To cnt - 1
            For jj = 1 To cnt - ii
                If yArr(jj) > yArr(jj + 1) Then
                    tmpY = yArr(jj): yArr(jj) = yArr(jj + 1): yArr(jj + 1) = tmpY
                    tmpI = idxArr(jj): idxArr(jj) = idxArr(jj + 1): idxArr(jj + 1) = tmpI
                End If
            Next jj
        Next ii

        ' 정렬된 순서대로 캐논 아래에 stack
        Dim prevB1Y As Double, prevB2Y As Double
        prevB1Y = canonB1.Top + canonB1.Height
        prevB2Y = canonB2.Top + canonB2.Height
        Dim prevB1X As Double, prevB2X As Double
        prevB1X = canonB1.Left: prevB2X = canonB2.Left
        For ii = 1 To cnt
            Dim cB1 As Shape, cB2 As Shape
            Set cB1 = cascB1List(idxArr(ii))
            Set cB2 = cascB2List(idxArr(ii))
            cB1.Left = prevB1X
            cB1.Top = prevB1Y
            cB2.Left = prevB2X
            cB2.Top = prevB2Y
            prevB1Y = cB1.Top + cB1.Height
            prevB2Y = cB2.Top + cB2.Height
            ' owner 2026-06-06 (8-23): 시스템 이동 후 lastPos 동기화 — chain 평행 이동 처리에서 사용자 이동으로 오인 방지.
            On Error Resume Next
            AltSetLastPos cB1, cB1.Left, cB1.Top
            AltSetLastPos cB2, cB2.Left, cB2.Top
            On Error GoTo 0
        Next ii
        ' canonical 박스의 lastPos 도 갱신 (canon 위치 자체는 안 옮겼지만 비교 기준 일치)
        On Error Resume Next
        AltSetLastPos canonB1, canonB1.Left, canonB1.Top
        AltSetLastPos canonB2, canonB2.Left, canonB2.Top
        On Error GoTo 0
    End If

    ' 3) main 화살표 재라우팅 — 가장 아래 박스 (canon 또는 마지막 cascade) 사이 L-shape
    Dim bottomB1 As Shape, bottomB2 As Shape
    If cascB1List.Count > 0 Then
        Set bottomB1 = cascB1List(cascB1List.Count)
        Set bottomB2 = cascB2List(cascB2List.Count)
    Else
        Set bottomB1 = canonB1
        Set bottomB2 = canonB2
    End If

    Dim mainTagFwd As String, mainTagRev As String
    mainTagFwd = "main=1|fac=" & g_pt_facId & "|cblA=" & aNameL & "|cblB=" & bNameL
    mainTagRev = "main=1|fac=" & g_pt_facId & "|cblA=" & bNameL & "|cblB=" & aNameL

    Dim oldMainName As String: oldMainName = ""
    Dim pshM As Shape
    For Each pshM In ws.Shapes
        If Left(pshM.Name, Len(PREFIX_PAIRARROW)) = PREFIX_PAIRARROW Then
            Dim mAlt As String: mAlt = ""
            On Error Resume Next: mAlt = pshM.AlternativeText: On Error GoTo 0
            If mAlt = mainTagFwd Or mAlt = mainTagRev Then
                oldMainName = pshM.Name
                Exit For
            End If
        End If
    Next pshM
    If Len(oldMainName) > 0 Then
        On Error Resume Next
        ws.Shapes(oldMainName).Delete
        On Error GoTo 0
    End If

    ' 새 main 화살표
    Dim arrPtsM As Variant
    arrPtsM = 선번박스_경로_계산(ws, "cable", aNameL, bottomB1, "cable", bNameL, bottomB2, facShp)
    Dim newMain As Shape: Set newMain = 선번박스_화살표생성(ws, arrPtsM)
    If newMain Is Nothing Then
        Set newMain = ws.Shapes.AddLine(bottomB1.Left + bottomB1.Width / 2, bottomB1.Top + bottomB1.Height / 2, _
                                         bottomB2.Left + bottomB2.Width / 2, bottomB2.Top + bottomB2.Height / 2)
    End If
    newMain.Name = PREFIX_PAIRARROW & NewId8()
    newMain.OnAction = ""
    newMain.Placement = 3
    On Error Resume Next
    newMain.AlternativeText = mainTagFwd
    With newMain.Line
        .ForeColor.RGB = 0
        .Weight = 0.5
        .DashStyle = msoLineRoundDot
        .BeginArrowheadStyle = msoArrowheadTriangle
        .EndArrowheadStyle = msoArrowheadTriangle
    End With
    On Error GoTo 0

    If wasProt Then ApplySheetProtection ws
    Application.StatusBar = "박스 정렬 완료 — cascade 박스 stack 재정렬 + main 화살표 재라우팅."
End Sub

' 박스추가 토글 — owner 2026-06-05. ON 시 다음 「연결완료」 가 기존 같은짝 박스에 merge 하지 않고
'   같은 방향에 새 박스 페어 + cascading 화살표 (이전 박스 → 새 박스) 를 생성. 1회 사용 후 자동 OFF.
Public Sub 선번연결_도구_박스추가토글()
    g_pt_addBoxMode = Not g_pt_addBoxMode
    선번연결_도구_시트빌드
    선번연결_도구_시각갱신
    If g_pt_addBoxMode Then
        Application.StatusBar = "박스추가 모드 ON — 다음 「연결완료」 가 새 박스 페어를 추가합니다 (1회 사용 후 자동 OFF)."
    Else
        Application.StatusBar = "박스추가 모드 OFF — 「연결완료」 가 기존 같은짝 박스에 합쳐집니다."
    End If
End Sub

' 같은짝 박스 중 시설물에서 가장 먼 (cascading 끝) 짝 찾기. 박스추가 모드 cascade 시작점.
'   반환: Array(arrowShape, box1Shape, box2Shape) — box1 은 cblA, box2 는 cblB. 못 찾으면 Empty.
Public Function 선번박스_가장끝짝_찾기(ws As Worksheet, facId As String, cblAName As String, cblBName As String, fcx As Double, fcy As Double) As Variant
    선번박스_가장끝짝_찾기 = Empty
    Dim facTag As String: facTag = "fac=" & facId
    Dim cblATag As String: cblATag = "cbl=" & cblAName
    Dim cblBTag As String: cblBTag = "cbl=" & cblBName

    Dim bestArr As Shape, bestB1 As Shape, bestB2 As Shape
    Dim bestDist As Double: bestDist = -1
    Dim arr As Shape, alt As String
    For Each arr In ws.Shapes
        If Left(arr.Name, Len(PREFIX_PAIRARROW)) = PREFIX_PAIRARROW Then
            alt = ""
            On Error Resume Next
            alt = arr.AlternativeText
            On Error GoTo 0
            Dim p1 As Long: p1 = InStr(alt, "box1=")
            Dim p2 As Long: p2 = InStr(alt, "|box2=")
            If p1 = 1 And p2 > p1 Then
                Dim b1Name As String, b2Name As String
                b1Name = Mid(alt, p1 + 5, p2 - (p1 + 5))
                Dim p3 As Long: p3 = InStr(p2 + 6, alt, "|")
                If p3 = 0 Then p3 = Len(alt) + 1
                b2Name = Mid(alt, p2 + 6, p3 - (p2 + 6))
                Dim b1 As Shape, b2 As Shape: Set b1 = Nothing: Set b2 = Nothing
                On Error Resume Next
                Set b1 = ws.Shapes(b1Name)
                Set b2 = ws.Shapes(b2Name)
                On Error GoTo 0
                If Not b1 Is Nothing And Not b2 Is Nothing Then
                    Dim b1Alt As String, b2Alt As String: b1Alt = "": b2Alt = ""
                    On Error Resume Next
                    b1Alt = b1.AlternativeText
                    b2Alt = b2.AlternativeText
                    On Error GoTo 0
                    If InStr(b1Alt, facTag) > 0 And InStr(b2Alt, facTag) > 0 Then
                        Dim matched As Boolean: matched = False
                        Dim mb1 As Shape, mb2 As Shape: Set mb1 = Nothing: Set mb2 = Nothing
                        If InStr(b1Alt, cblATag) > 0 And InStr(b2Alt, cblBTag) > 0 Then
                            Set mb1 = b1: Set mb2 = b2: matched = True
                        ElseIf InStr(b1Alt, cblBTag) > 0 And InStr(b2Alt, cblATag) > 0 Then
                            Set mb1 = b2: Set mb2 = b1: matched = True               ' swap → mb1=cblA, mb2=cblB
                        End If
                        If matched Then
                            ' owner 2026-06-05: cascade 박스는 +Y 로 stack (세로 붙여서). 따라서 chain 끝 = 가장 아래 (max Y).
                            '   이전 「시설물 거리」 기준은 cascade 박스가 시설물에 더 가까워 항상 canonical 만 반환 → 새 cascade 겹침 버그.
                            Dim by1Bot As Double, by2Bot As Double
                            by1Bot = mb1.Top + mb1.Height                                 ' box1 의 bottom Y
                            by2Bot = mb2.Top + mb2.Height                                 ' box2 의 bottom Y
                            Dim bottomY As Double
                            If by1Bot > by2Bot Then bottomY = by1Bot Else bottomY = by2Bot
                            If bottomY > bestDist Then
                                bestDist = bottomY
                                Set bestArr = arr: Set bestB1 = mb1: Set bestB2 = mb2
                            End If
                        End If
                    End If
                End If
            End If
        End If
    Next arr

    If bestDist >= 0 Then
        선번박스_가장끝짝_찾기 = Array(bestArr, bestB1, bestB2)
    End If
End Function

' 박스↔박스 cascading 화살표 — 박스추가 모드에서 이전 박스 끝(가장자리) → 새 박스 가장자리.
'   owner 그림 사양: 케이블·페어 화살표와 같은 스타일 (검정 + 둥근점선) + 작은 화살촉.
'   ByVal — cascadePrev(idx) 가 Variant array element 라 ByRef 로 못 넘김 (컴파일 오류 "ByRef 형식 불일치").
Public Function 선번박스_cascading_화살표(ws As Worksheet, ByVal prevBox As Shape, ByVal newBox As Shape) As Shape
    Set 선번박스_cascading_화살표 = Nothing
    If prevBox Is Nothing Or newBox Is Nothing Then Exit Function

    Dim pcx As Double, pcy As Double, ncx As Double, ncy As Double
    pcx = prevBox.Left + prevBox.Width / 2
    pcy = prevBox.Top + prevBox.Height / 2
    ncx = newBox.Left + newBox.Width / 2
    ncy = newBox.Top + newBox.Height / 2

    ' 이전 박스 가장자리 → 새 박스 방향
    Dim ex1 As Double, ey1 As Double
    선번박스_경계점 prevBox, ncx, ncy, ex1, ey1
    Dim ex2 As Double, ey2 As Double
    선번박스_경계점 newBox, pcx, pcy, ex2, ey2

    Dim arr As Shape
    On Error Resume Next
    Set arr = ws.Shapes.AddLine(ex1, ey1, ex2, ey2)
    On Error GoTo 0
    If arr Is Nothing Then Exit Function

    arr.Name = PREFIX_PAIRARROW & "cas_" & NewId8()
    arr.OnAction = ""
    arr.Placement = 3
    On Error Resume Next
    arr.AlternativeText = "cas_from=" & prevBox.Name & "|cas_to=" & newBox.Name
    With arr.Line
        .ForeColor.RGB = 0
        .Weight = 0.5
        .DashStyle = msoLineRoundDot
        .BeginArrowheadStyle = msoArrowheadNone
        .EndArrowheadStyle = msoArrowheadTriangle
    End With
    On Error GoTo 0
    Set 선번박스_cascading_화살표 = arr
End Function

Public Sub 선번연결_도구_확인()
    ' RN 모드 — A↔IN 매핑 + OUT↔B 매핑이 한 쪽이라도 있으면 RN 박스 생성. owner 사양 (IN/P 라벨 + 코어별 박스).
    ' owner 변경 (RN1 모드) — Cable A ↔ RN IN / Cable A ↔ RN OUT 매핑 처리 후 새 박스 생성.
    If g_pt_rn1Mode Then
        Dim aiCntR1 As Long, aoCntR1 As Long
        aiCntR1 = 0: aoCntR1 = 0
        If Not g_pt_mappingsA_IN Is Nothing Then aiCntR1 = g_pt_mappingsA_IN.Count
        If Not g_pt_mappingsA_OUT Is Nothing Then aoCntR1 = g_pt_mappingsA_OUT.Count
        ' owner 2026-06-05: 매핑 0 건이어도 차단 X — 상태바 안내만.
        If aiCntR1 = 0 And aoCntR1 = 0 Then
            Application.StatusBar = "RN1 매핑이 없습니다 — Cable↔RN IN 또는 Cable↔RN OUT 짝을 「다중선택」 으로 먼저 만드세요."
            Exit Sub
        End If

        ' 잠금 충돌 검증 (cable A + RN IN/OUT)
        Dim mkR1 As Variant
        If aiCntR1 > 0 Then
            For Each mkR1 In g_pt_mappingsA_IN.Keys
                If Not g_pt_existingA Is Nothing And g_pt_existingA.Exists(CLng(mkR1)) Then
                    MsgBox "Cable 코어 " & mkR1 & " 은 잠금 상태입니다.", vbExclamation, "RN1": Exit Sub
                End If
                If Not g_pt_existingRN_IN Is Nothing And g_pt_existingRN_IN.Exists(CLng(g_pt_mappingsA_IN(mkR1))) Then
                    MsgBox "RN IN 코어 " & g_pt_mappingsA_IN(mkR1) & " 은 잠금 상태입니다.", vbExclamation, "RN1": Exit Sub
                End If
            Next mkR1
        End If
        If aoCntR1 > 0 Then
            For Each mkR1 In g_pt_mappingsA_OUT.Keys
                If Not g_pt_existingA Is Nothing And g_pt_existingA.Exists(CLng(mkR1)) Then
                    MsgBox "Cable 코어 " & mkR1 & " 은 잠금 상태입니다.", vbExclamation, "RN1": Exit Sub
                End If
                If Not g_pt_existingRN_OUT Is Nothing And g_pt_existingRN_OUT.Exists(CLng(g_pt_mappingsA_OUT(mkR1))) Then
                    MsgBox "RN OUT 코어 " & g_pt_mappingsA_OUT(mkR1) & " 은 잠금 상태입니다.", vbExclamation, "RN1": Exit Sub
                End If
            Next mkR1
        End If

        ' 신규 RN1 박스 + 화살표 생성 (owner 그림 사양)
        선번박스_쌍_생성_RN1 g_pt_cbl1Name, g_pt_rnLabel, g_pt_rnSpec, _
                              g_pt_mappingsA_IN, g_pt_mappingsA_OUT

        ' 잠금 추가
        Dim mkR1L As Variant
        If aiCntR1 > 0 Then
            For Each mkR1L In g_pt_mappingsA_IN.Keys
                g_pt_existingA(CLng(mkR1L)) = True
                g_pt_existingRN_IN(CLng(g_pt_mappingsA_IN(mkR1L))) = True
            Next mkR1L
        End If
        If aoCntR1 > 0 Then
            For Each mkR1L In g_pt_mappingsA_OUT.Keys
                g_pt_existingA(CLng(mkR1L)) = True
                g_pt_existingRN_OUT(CLng(g_pt_mappingsA_OUT(mkR1L))) = True
            Next mkR1L
        End If

        g_pt_mappingsA_IN.RemoveAll
        g_pt_mappingsA_OUT.RemoveAll
        g_pt_selA.RemoveAll: g_pt_selB.RemoveAll
        g_pt_selRN_IN.RemoveAll: g_pt_selRN_OUT.RemoveAll
        g_pt_anchorA = 0: g_pt_anchorB = 0
        g_pt_anchorRN_IN = 0: g_pt_anchorRN_OUT = 0

        선번연결_도구_기존수집
        선번연결_도구_시트빌드
        선번연결_도구_시각갱신
        ' owner 2026-06-06 (8-30) / 2026-06-07 (8-65): 주간 박스 자동 갱신 (RN1 모드 — RN 코어수도 합계 반영)
        On Error Resume Next
        시설물_상태박스_주간_자동갱신 ThisWorkbook.Worksheets(SHEET_NETWORK), g_pt_facId
        On Error GoTo 0
        On Error Resume Next
        ThisWorkbook.Worksheets(SHEET_PAIR_TOOL).Activate
        On Error GoTo 0
        Application.StatusBar = "RN1 연결 완료 — Cable↔IN " & aiCntR1 & " / Cable↔OUT " & aoCntR1 & " 쌍."
        Exit Sub
    End If

    If g_pt_rnMode Then
        Dim aiCnt As Long, obCnt As Long
        aiCnt = 0: obCnt = 0
        If Not g_pt_mappingsA_IN Is Nothing Then aiCnt = g_pt_mappingsA_IN.Count
        If Not g_pt_mappingsOUT_B Is Nothing Then obCnt = g_pt_mappingsOUT_B.Count
        ' owner 2026-06-05: 매핑 0 건이어도 차단 X — 상태바 안내만.
        If aiCnt = 0 And obCnt = 0 Then
            Application.StatusBar = "RN 매핑이 없습니다 — A↔IN 또는 OUT↔B 짝을 「다중선택」 으로 먼저 만드세요."
            Exit Sub
        End If

        ' 잠금 충돌 검증
        Dim mkRN As Variant
        If aiCnt > 0 Then
            For Each mkRN In g_pt_mappingsA_IN.Keys
                If Not g_pt_existingA Is Nothing Then
                    If g_pt_existingA.Exists(CLng(mkRN)) Then
                        MsgBox "Cable A 코어 " & mkRN & " 은 잠금 상태입니다.", vbExclamation, "RN 코어 연결"
                        Exit Sub
                    End If
                End If
                If Not g_pt_existingRN_IN Is Nothing Then
                    If g_pt_existingRN_IN.Exists(CLng(g_pt_mappingsA_IN(mkRN))) Then
                        MsgBox "RN IN 코어 " & g_pt_mappingsA_IN(mkRN) & " 은 잠금 상태입니다.", vbExclamation, "RN 코어 연결"
                        Exit Sub
                    End If
                End If
            Next mkRN
        End If
        If obCnt > 0 Then
            For Each mkRN In g_pt_mappingsOUT_B.Keys
                If Not g_pt_existingRN_OUT Is Nothing Then
                    If g_pt_existingRN_OUT.Exists(CLng(mkRN)) Then
                        MsgBox "RN OUT 코어 " & mkRN & " 은 잠금 상태입니다.", vbExclamation, "RN 코어 연결"
                        Exit Sub
                    End If
                End If
                If Not g_pt_existingB Is Nothing Then
                    If g_pt_existingB.Exists(CLng(g_pt_mappingsOUT_B(mkRN))) Then
                        MsgBox "Cable B 코어 " & g_pt_mappingsOUT_B(mkRN) & " 은 잠금 상태입니다.", vbExclamation, "RN 코어 연결"
                        Exit Sub
                    End If
                End If
            Next mkRN
        End If

        ' RN 박스+화살표 생성 (owner 사양 — 라벨 IN/P + 코어별 박스)
        선번박스_쌍_생성_RN g_pt_cbl1Name, g_pt_cbl2Name, _
                            g_pt_rnLabel, g_pt_rnSpec, _
                            g_pt_mappingsA_IN, g_pt_mappingsOUT_B

        ' 잠금 추가 (중복 매핑 방지)
        Dim mkLR As Variant
        If aiCnt > 0 Then
            For Each mkLR In g_pt_mappingsA_IN.Keys
                g_pt_existingA(CLng(mkLR)) = True
                g_pt_existingRN_IN(CLng(g_pt_mappingsA_IN(mkLR))) = True
            Next mkLR
        End If
        If obCnt > 0 Then
            For Each mkLR In g_pt_mappingsOUT_B.Keys
                g_pt_existingRN_OUT(CLng(mkLR)) = True
                g_pt_existingB(CLng(g_pt_mappingsOUT_B(mkLR))) = True
            Next mkLR
        End If

        g_pt_mappingsA_IN.RemoveAll
        g_pt_mappingsOUT_B.RemoveAll
        g_pt_selA.RemoveAll: g_pt_selB.RemoveAll
        g_pt_selRN_IN.RemoveAll: g_pt_selRN_OUT.RemoveAll
        g_pt_anchorA = 0: g_pt_anchorB = 0
        g_pt_anchorRN_IN = 0: g_pt_anchorRN_OUT = 0

        선번연결_도구_기존수집
        선번연결_도구_시트빌드
        선번연결_도구_시각갱신
        ' owner 2026-06-06 (8-30): 주간 박스 자동 갱신 (RN 모드)
        On Error Resume Next
        시설물_상태박스_주간_자동갱신 ThisWorkbook.Worksheets(SHEET_NETWORK), g_pt_facId
        On Error GoTo 0
        On Error Resume Next
        ThisWorkbook.Worksheets(SHEET_PAIR_TOOL).Activate
        On Error GoTo 0
        Application.StatusBar = "RN 연결 완료 — A↔IN " & aiCnt & " 쌍 / OUT↔B " & obCnt & " 쌍."
        Exit Sub
    End If

    Dim mapEmpty As Boolean: mapEmpty = False
    If g_pt_mappings Is Nothing Then
        mapEmpty = True
    ElseIf g_pt_mappings.Count = 0 Then
        mapEmpty = True
    End If
    If mapEmpty Then
        MsgBox "매핑이 없습니다." & vbLf & vbLf & _
               "양쪽 코어를 선택한 뒤 「다중선택」 을 눌러 매핑하세요.", _
               vbExclamation, "코어 연결"
        Exit Sub
    End If

    ' 이중 검증 — 잠금 코어와 충돌하는 매핑이 있으면 차단
    Dim mk2 As Variant
    For Each mk2 In g_pt_mappings.Keys
        Dim aN As Long: aN = CLng(mk2)
        Dim bN As Long: bN = CLng(g_pt_mappings(mk2))
        If Not g_pt_existingA Is Nothing Then
            If g_pt_existingA.Exists(aN) Then
                MsgBox "Cable A 코어 " & aN & " 은 잠금 상태입니다.", vbExclamation, "코어 연결"
                Exit Sub
            End If
        End If
        If Not g_pt_existingB Is Nothing Then
            If g_pt_existingB.Exists(bN) Then
                MsgBox "Cable B 코어 " & bN & " 은 잠금 상태입니다.", vbExclamation, "코어 연결"
                Exit Sub
            End If
        End If
    Next mk2

    ' owner 2026-06-06: 1:N 매핑 차단 — g_pt_mappings 안에서 B 값이 중복되면 (즉 여러 A 코어가 같은 B 코어 가리키면) 막음.
    '   예: A:13→B:1, A:17→B:1 같은 1:N 매핑이 그 동안 저장되던 케이스 (어제 이전 데이터의 「1,2,1-3」 형식).
    Dim seenB As Object: Set seenB = CreateObject("Scripting.Dictionary")
    Dim dupCheckMk As Variant
    For Each dupCheckMk In g_pt_mappings.Keys
        Dim dupBN As Long: dupBN = CLng(g_pt_mappings(dupCheckMk))
        If seenB.Exists(dupBN) Then
            MsgBox "1:N 매핑 차단 (cable B 코어 " & dupBN & " 가 중복됨)" & vbLf & vbLf & _
                   "Cable A 코어 " & seenB(dupBN) & " 가 이미 Cable B 코어 " & dupBN & " 에 매핑됨." & vbLf & _
                   "Cable A 코어 " & dupCheckMk & " → " & dupBN & " 매핑은 추가 불가." & vbLf & vbLf & _
                   "기존 매핑 ([V] 코어) 을 먼저 클릭으로 해제 후 다시 매핑하세요.", _
                   vbExclamation, "코어 연결 — 1:N 금지"
            Exit Sub
        End If
        seenB(dupBN) = CStr(dupCheckMk)
    Next dupCheckMk

    ' owner 2026-06-06: 머지 모드 — 기존 페어 박스의 B 측 코어와 새 B 값이 겹치면 차단 (페어 박스 내 1:N 금지).
    If Len(g_pt_mergeTargetArrName) > 0 Then
        Dim wsMV As Worksheet: Set wsMV = ThisWorkbook.Worksheets(SHEET_NETWORK)
        Dim mvArr As Shape: Set mvArr = Nothing
        On Error Resume Next: Set mvArr = wsMV.Shapes(g_pt_mergeTargetArrName): On Error GoTo 0
        If Not mvArr Is Nothing Then
            Dim mvAlt As String: mvAlt = ""
            On Error Resume Next: mvAlt = mvArr.AlternativeText: On Error GoTo 0
            Dim mvB1Nm As String, mvB2Nm As String
            mvB1Nm = AltParseField(mvAlt, "box1=")
            mvB2Nm = AltParseField(mvAlt, "box2=")
            ' 두 박스 중 cable B 측 (cbl=cbl2Name) 찾기
            Dim mvCblB As String: mvCblB = "cbl=" & g_pt_cbl2Name
            Dim mvBoxBSide As Shape: Set mvBoxBSide = Nothing
            Dim mvNames(0 To 1) As String
            mvNames(0) = mvB1Nm: mvNames(1) = mvB2Nm
            Dim mvI As Long
            For mvI = 0 To 1
                If Len(mvNames(mvI)) > 0 Then
                    Dim mvShp As Shape: Set mvShp = Nothing
                    On Error Resume Next: Set mvShp = wsMV.Shapes(mvNames(mvI)): On Error GoTo 0
                    If Not mvShp Is Nothing Then
                        Dim mvShpAlt As String: mvShpAlt = ""
                        On Error Resume Next: mvShpAlt = mvShp.AlternativeText: On Error GoTo 0
                        If InStr(mvShpAlt, mvCblB) > 0 Then
                            Set mvBoxBSide = mvShp
                            Exit For
                        End If
                    End If
                End If
            Next mvI
            If Not mvBoxBSide Is Nothing Then
                Dim mvBoxTxt As String: mvBoxTxt = ""
                On Error Resume Next: mvBoxTxt = mvBoxBSide.TextFrame2.TextRange.Text: On Error GoTo 0
                Dim mvBoxNums As Variant
                선번_파싱 mvBoxTxt, mvBoxNums
                If Not IsEmpty(mvBoxNums) Then
                    Dim mvKi As Long
                    For mvKi = LBound(mvBoxNums) To UBound(mvBoxNums)
                        Dim mvExistB As Long: mvExistB = CLng(mvBoxNums(mvKi))
                        If seenB.Exists(mvExistB) Then
                            MsgBox "머지 충돌 — Cable B 코어 " & mvExistB & " 가 기존 페어 박스에 이미 있음" & vbLf & vbLf & _
                                   "이 페어에 이미 Cable B 코어 " & mvExistB & " 매핑이 존재." & vbLf & _
                                   "새 매핑 Cable A 코어 " & seenB(mvExistB) & " → " & mvExistB & " 추가 불가 (1:N 금지)." & vbLf & vbLf & _
                                   "다른 Cable B 코어로 매핑 또는 「X 삭제」 후 재구성하세요.", _
                                   vbExclamation, "코어 연결 — 머지 1:N 금지"
                            Exit Sub
                        End If
                    Next mvKi
                End If
            End If
        End If
    End If

    ' 매핑 → 정렬된 leftN 배열 + 대응 rightN 추출
    Dim leftKeys() As Long
    ReDim leftKeys(0 To g_pt_mappings.Count - 1)
    Dim idx As Long: idx = 0
    Dim k As Variant
    For Each k In g_pt_mappings.Keys: leftKeys(idx) = CLng(k): idx = idx + 1: Next k
    ' Bubble sort
    Dim a As Long, b As Long, tmp As Long
    For a = 0 To UBound(leftKeys) - 1
        For b = a + 1 To UBound(leftKeys)
            If leftKeys(a) > leftKeys(b) Then
                tmp = leftKeys(a): leftKeys(a) = leftKeys(b): leftKeys(b) = tmp
            End If
        Next b
    Next a

    ' 텍스트 빌드 — owner 2026-06-06: 페어 segment 별 압축 (양쪽 모두 연속 ≥ 3 이면 ~, 그 외 콤마).
    '   기존: 양쪽 모두 연속이면 전체 ~, 한쪽이라도 break 있으면 양쪽 다 콤마 전부 — 긴 연속 구간이 압축 안 됨.
    '   신규: 페어 인덱스별로 segment 분할 → segment 길이 ≥ 3 만 압축.
    Dim txtA As String, txtB As String
    Dim rightArr() As Long: ReDim rightArr(0 To UBound(leftKeys))
    For a = 0 To UBound(leftKeys): rightArr(a) = CLng(g_pt_mappings(leftKeys(a))): Next a
    선번연결_도구_페어텍스트_빌드 leftKeys, rightArr, txtA, txtB

    ' 박스 + 화살표 생성 — 사이드 타입 (cable/facility) 별로 분기.
    '   도구 시트는 그대로 두고 추가 매핑을 위해 잠금 갱신 + 선택 초기화 (owner 요구).
    If Len(g_pt_side1Type) = 0 Then g_pt_side1Type = "cable"
    If Len(g_pt_side2Type) = 0 Then g_pt_side2Type = "cable"
    선번박스_쌍_생성_직접 g_pt_side1Type, g_pt_cbl1Name, _
                          g_pt_side2Type, g_pt_cbl2Name, _
                          txtA, txtB

    ' 이번 세션 매핑 코어들을 잠금으로 추가 (중복 매핑 방지) — owner 요구
    Dim mkLock As Variant
    For Each mkLock In g_pt_mappings.Keys
        g_pt_existingA(CLng(mkLock)) = True
        g_pt_existingB(CLng(g_pt_mappings(mkLock))) = True
    Next mkLock

    ' 매핑·선택 초기화 (다음 연결 사이클 준비). UNIT 펼침 상태는 유지 (편의)
    g_pt_mappings.RemoveAll
    g_pt_selA.RemoveAll
    g_pt_selB.RemoveAll
    If Not g_pt_selUnitsA Is Nothing Then g_pt_selUnitsA.RemoveAll
    If Not g_pt_selUnitsB Is Nothing Then g_pt_selUnitsB.RemoveAll
    g_pt_anchorA = 0: g_pt_anchorB = 0

    ' 기존 연결 섹션 갱신 위해 기존 박스 다시 수집 → 시트 재빌드 → 시각 갱신
    선번연결_도구_기존수집
    선번연결_도구_시트빌드
    선번연결_도구_시각갱신

    ' owner 2026-06-06 (8-30): 주간 박스 자동 갱신 (cable-cable 모드 — 가장 일반적인 케이스)
    On Error Resume Next
    시설물_상태박스_주간_자동갱신 ThisWorkbook.Worksheets(SHEET_NETWORK), g_pt_facId
    On Error GoTo 0

    ' 도구 시트 다시 활성화 (선번박스_쌍_생성_직접 가 네트웍 시트로 전환했을 수 있음)
    On Error Resume Next
    ThisWorkbook.Worksheets(SHEET_PAIR_TOOL).Activate
    On Error GoTo 0

    Application.StatusBar = "연결 완료 (잠금됨). 추가 연결 가능 — 새 코어 선택 또는 「취소·닫기」."
End Sub

' 취소 — 시트 숨기고 네트웍 복귀. RN 모드도 함께 해제 (다음 도구 진입 시 잔재 회피).
Public Sub 선번연결_도구_취소()
    g_pt_rnMode = False
    g_pt_rn1Mode = False
    g_pt_releaseMode = False
    g_pt_rnReleaseMode = False
    g_pt_addBoxMode = False
    g_pt_mergeTargetArrName = ""
    Dim wsTool As Worksheet: Set wsTool = ThisWorkbook.Worksheets(SHEET_PAIR_TOOL)
    On Error Resume Next
    wsTool.Visible = xlSheetVeryHidden
    On Error GoTo 0
    On Error Resume Next
    ThisWorkbook.Worksheets(SHEET_NETWORK).Activate
    On Error GoTo 0
    Application.StatusBar = "코어 연결 취소."
End Sub

' 정수 배열 → 모든 숫자 콤마로 연결 "1,2,3,4,5,6" (대칭 표기용 — ~ 사용 안 함)
Public Function 선번_배열_콤마전개(arr() As Long) As String
    Dim s As String: s = ""
    Dim i As Long
    For i = LBound(arr) To UBound(arr)
        If Len(s) > 0 Then s = s & ","
        s = s & arr(i)
    Next i
    선번_배열_콤마전개 = s
End Function

' owner 2026-06-06: 페어 텍스트 빌드 — 양쪽 모두 연속 ≥ 3 인 segment 만 ~ 압축, 그 외 콤마.
'   같은 인덱스의 (leftN, rightN) 페어가 매핑 기준. 양쪽이 동시에 break 안 일어나면 같은 segment 유지.
'   예1) L=2,3,4,5,9,10 / R=3,4,5,6,8,9
'        → segment[0..3] (양쪽 step=1, len=4) compress, segment[4..5] (len=2) 콤마
'        → "2~5,9,10" / "3~6,8,9"
'   예2) L=2,3,4,5,9,10 / R=3,4,7,8,10,11
'        → segment[0..1]·[2..3]·[4..5] 모두 len=2 → 콤마 전부 유지
'        → "2,3,4,5,9,10" / "3,4,7,8,10,11"
'   기존 `선번박스_compact_쌍` 의 1-based 인터페이스를 0-based 배열에 맞춤.
Public Sub 선번연결_도구_페어텍스트_빌드(arrL() As Long, arrR() As Long, _
                                            ByRef outL As String, ByRef outR As String)
    outL = "": outR = ""
    Dim cnt As Long: cnt = UBound(arrL) - LBound(arrL) + 1
    If cnt <= 0 Then Exit Sub
    Dim a1() As Long, b1() As Long
    ReDim a1(1 To cnt): ReDim b1(1 To cnt)
    Dim ti As Long
    For ti = 1 To cnt
        a1(ti) = arrL(LBound(arrL) + ti - 1)
        b1(ti) = arrR(LBound(arrR) + ti - 1)
    Next ti
    선번박스_compact_쌍 a1, cnt, b1, cnt, outL, outR
End Sub

' 정렬된 정수 배열 → "1~6", "1,3,5", "1~3,7" 형식 압축 문자열
Public Function 선번연결_도구_compact_array(arr() As Long) As String
    If UBound(arr) < LBound(arr) Then Exit Function
    Dim result As String: result = ""
    Dim rangeStart As Long: rangeStart = arr(LBound(arr))
    Dim rangePrev As Long: rangePrev = rangeStart
    Dim i As Long
    For i = LBound(arr) + 1 To UBound(arr)
        If arr(i) = rangePrev + 1 Then
            rangePrev = arr(i)
        Else
            ' 이전 구간 flush
            If Len(result) > 0 Then result = result & ","
            If rangeStart = rangePrev Then
                result = result & rangeStart
            Else
                result = result & rangeStart & "~" & rangePrev
            End If
            rangeStart = arr(i)
            rangePrev = arr(i)
        End If
    Next i
    ' 마지막 구간 flush
    If Len(result) > 0 Then result = result & ","
    If rangeStart = rangePrev Then
        result = result & rangeStart
    Else
        result = result & rangeStart & "~" & rangePrev
    End If
    선번연결_도구_compact_array = result
End Function

' 케이블 규격 문자열에서 코어 수 자동 추출.
'   지원 형식 — "12F", "12C", "144F", "24심", "12 코어", "12-core", "144 광심"
'   첫 번째 연속 숫자 구간을 코어 수로 해석. 숫자 없으면 0 반환.
Public Function 케이블규격_코어수_추출(spec As String) As Long
    Dim s As String: s = Trim(spec)
    If Len(s) = 0 Then Exit Function
    Dim numStr As String: numStr = ""
    Dim i As Long
    For i = 1 To Len(s)
        Dim ch As String: ch = Mid(s, i, 1)
        If ch >= "0" And ch <= "9" Then
            numStr = numStr & ch
        ElseIf Len(numStr) > 0 Then
            Exit For    ' 첫 연속 숫자 구간만
        End If
    Next i
    If Len(numStr) > 0 Then 케이블규격_코어수_추출 = CLng(numStr)
End Function

' 시설물 바로 옆에 자동 사이즈 텍스트박스 1개 생성. 케이블 방향을 따라 시설물 외곽에서
'   조금 떨어진 위치에 배치 (시설물 도형은 안 침범, 케이블 옆에 살짝 비킴).
'   commonFacId 는 박스 AlternativeText 에 저장 — 「코어 검증」 이 시설물별 그룹핑에 사용.
'   같은 케이블에 이미 박스가 있으면 → 케이블 방향을 따라 「시설물에서 더 멀리」 한 칸씩 stacked.
'     box[0]: 시설물 중심에서 NEAR_FAC_DIST (55pt) 떨어짐 (시설물 바로 옆)
'     box[1]: 시설물 중심에서 NEAR_FAC_DIST + 16 (그 바깥)
'     box[2]: 시설물 중심에서 NEAR_FAC_DIST + 32 ...
'   perp offset 동일 → 케이블 옆 한 줄로 stacked.
Public Function 선번박스_단일생성(ws As Worksheet, cbl As Shape, fcx As Double, fcy As Double, commonFacId As String, Optional ByVal initialText As String = "1", Optional otherCbl As Shape = Nothing) As Shape
    ' 케이블 두 끝점 (flip 고려)
    Dim ax As Double, ay As Double, bx As Double, by As Double
    GetLineEndpoints cbl, ax, ay, bx, by

    ' far-end = facility 와 거리가 더 먼 끝 — 케이블 방향 결정용 (좌표는 안 씀)
    Dim dA As Double, dB As Double
    dA = (ax - fcx) * (ax - fcx) + (ay - fcy) * (ay - fcy)
    dB = (bx - fcx) * (bx - fcx) + (by - fcy) * (by - fcy)
    Dim farX As Double, farY As Double
    If dA > dB Then farX = ax: farY = ay Else farX = bx: farY = by

    ' 방향 벡터 facility → far-end
    Dim dx As Double, dy As Double
    dx = farX - fcx: dy = farY - fcy

    ' owner 2026-06-11 다조 후속: ㄷ자/L자 폴리라인은 허브 쪽 첫 segment 방향으로 회전 (크기는 chord 유지 — len_ 의 거리 예산 의미 보존)
    Dim hubUx As Double, hubUy As Double
    If 케이블_허브방향(cbl, fcx, fcy, hubUx, hubUy) Then
        Dim chordL As Double: chordL = Sqr(dx * dx + dy * dy)
        If chordL < 0.001 Then chordL = 1
        dx = hubUx * chordL: dy = hubUy * chordL
    End If

    Const NEAR_FAC_DIST As Double = 55      ' 시설물 중심 → 박스 중심 거리 (시설물 바로 옆 = 시설물 외곽에서 ~15pt)
    Const PERP_OFFSET As Double = 15        ' 케이블 ↔ 박스 수직 기본 간격. 같은 perp side stack 시 PERP_STACK_GAP 만큼 추가.
    Const PERP_STACK_GAP As Double = 26     ' 같은 perp side 추가 박스마다 케이블에서 추가로 멀어지는 거리 (owner: 박스 겹침 차단).
    Const STACK_GAP As Double = 70          ' 같은 케이블 추가 박스마다 시설물에서 더 멀어지는 거리. AutoSize 박스 폭 (최대 80pt) 보다 약간 작게.
    Const ANGLE_SCALE As Double = 28        ' 안쪽각 기반 offset scale.  (1 + u1·u2) × ANGLE_SCALE.
    Const PAIR_RANK_GAP As Double = 10      ' 시설물 전체 priorPairs 작은 추가 stagger.
    Const BX_W As Double = 22               ' 박스 시작 폭 (자동 사이즈로 텍스트 길이에 따라 확장)
    Const BX_H As Double = 14

    ' 거리 stagger 계산 (owner 규칙 + 화살표 겹침 방지):
    '   1) 같은 케이블의 박스 (sameCableCount) — 케이블 따라 STACK_GAP 만큼
    '   2) 안쪽각 기반 offset (angleOffset) — 두 케이블 방향 dot(u1,u2) 사용. 안쪽각 클수록 시설물 가까이.
    '   3) 시설물-쌍 작은 stagger (priorPairs × PAIR_RANK_GAP) — 같은 각도 카테고리 안에서도 약간 흩어지게 (10pt).
    Dim sameCableCount As Long: sameCableCount = 0
    Dim facBoxCount As Long: facBoxCount = 0
    Dim existShp As Shape, altScan As String
    Dim cblTag As String: cblTag = "cbl=" & cbl.Name
    Dim facTag As String: facTag = "fac=" & commonFacId
    For Each existShp In ws.Shapes
        If Left(existShp.Name, Len(PREFIX_PAIRBOX)) = PREFIX_PAIRBOX Then
            altScan = ""
            On Error Resume Next
            altScan = existShp.AlternativeText
            On Error GoTo 0
            If InStr(altScan, facTag) > 0 Then
                facBoxCount = facBoxCount + 1
                If InStr(altScan, cblTag) > 0 Then sameCableCount = sameCableCount + 1
            End If
        End If
    Next existShp
    Dim priorPairs As Long: priorPairs = facBoxCount \ 2

    Dim len_ As Double: len_ = Sqr(dx * dx + dy * dy)

    ' 안쪽각 offset 계산 (otherCbl 가 주어진 경우만)
    Dim angleOffset As Double: angleOffset = 0
    If Not otherCbl Is Nothing And len_ > 0.001 Then
        Dim oax_ As Double, oay_ As Double, obx_ As Double, oby_ As Double
        GetLineEndpoints otherCbl, oax_, oay_, obx_, oby_
        Dim odA_ As Double, odB_ As Double
        odA_ = (oax_ - fcx) * (oax_ - fcx) + (oay_ - fcy) * (oay_ - fcy)
        odB_ = (obx_ - fcx) * (obx_ - fcx) + (oby_ - fcy) * (oby_ - fcy)
        Dim ofx_ As Double, ofy_ As Double
        If odA_ > odB_ Then ofx_ = oax_: ofy_ = oay_ Else ofx_ = obx_: ofy_ = oby_
        Dim odx_ As Double, ody_ As Double
        odx_ = ofx_ - fcx: ody_ = ofy_ - fcy
        ' owner 2026-06-11 다조 후속: 상대 케이블도 허브 쪽 첫 segment 방향 (안쪽각 = 보이는 두 선분 사이 각)
        Dim oHubUx As Double, oHubUy As Double
        If 케이블_허브방향(otherCbl, fcx, fcy, oHubUx, oHubUy) Then
            Dim oChordL As Double: oChordL = Sqr(odx_ * odx_ + ody_ * ody_)
            If oChordL < 0.001 Then oChordL = 1
            odx_ = oHubUx * oChordL: ody_ = oHubUy * oChordL
        End If
        Dim olen_ As Double: olen_ = Sqr(odx_ * odx_ + ody_ * ody_)
        If olen_ > 0.001 Then
            Dim cosAng As Double
            cosAng = ((dx / len_) * (odx_ / olen_)) + ((dy / len_) * (ody_ / olen_))
            If cosAng < -1 Then cosAng = -1
            If cosAng > 1 Then cosAng = 1
            angleOffset = (1 + cosAng) * ANGLE_SCALE
        End If
    End If

    ' 공선 (anti-parallel, cosAng ≈ -1, angleOffset ≈ 0) 이면 priorPairs stagger 무시 → 항상 최근접 (owner 규칙)
    Dim isColinear As Boolean: isColinear = (angleOffset < 5)
    Dim totalDist As Double
    If isColinear Then
        totalDist = NEAR_FAC_DIST + sameCableCount * STACK_GAP
    Else
        totalDist = NEAR_FAC_DIST + sameCableCount * STACK_GAP + angleOffset + priorPairs * PAIR_RANK_GAP
    End If

    ' 박스가 케이블 끝(far-end)을 넘어가지 않도록 cap — 케이블 길이의 95% 이내 (짧은 케이블 cap 도달 후에도 여유 확보, owner 위쪽 겹침 보고).
    Dim cappedByLen As Boolean: cappedByLen = False
    If len_ > 0.001 Then
        Dim maxDist As Double: maxDist = len_ * 0.95 - BX_H
        If maxDist < NEAR_FAC_DIST * 0.5 Then maxDist = NEAR_FAC_DIST * 0.5
        If totalDist > maxDist Then
            totalDist = maxDist
            cappedByLen = True                         ' cap 됐을 때만 perp 가중치 강화 (perpDist 계산에서 사용)
        End If
    End If

    ' 박스 perpendicular offset — 케이블 방향에 「진짜 수직」.
    '   otherCbl 가 주어지면 perp 두 후보 중 「상대 케이블 방향과 dot 가 양」 (= 상대 케이블 쪽 = 안쪽 각) 을 선택.
    '   상대 케이블 없거나 두 케이블이 평행하면 「위쪽 우선」 fallback.
    Dim ux As Double, uy As Double
    Dim perpX As Double, perpY As Double
    If len_ > 0.001 Then
        ux = dx / len_: uy = dy / len_
        Dim perpAX As Double, perpAY As Double, perpBX As Double, perpBY As Double
        perpAX = -uy: perpAY = ux          ' CCW 90°
        perpBX = uy: perpBY = -ux          ' CW 90° (반대)

        Dim chooseByOther As Boolean: chooseByOther = False
        If Not otherCbl Is Nothing Then
            Dim oax As Double, oay As Double, obx As Double, oby As Double
            GetLineEndpoints otherCbl, oax, oay, obx, oby
            Dim odA As Double, odB As Double
            odA = (oax - fcx) * (oax - fcx) + (oay - fcy) * (oay - fcy)
            odB = (obx - fcx) * (obx - fcx) + (oby - fcy) * (oby - fcy)
            Dim ofx As Double, ofy As Double
            If odA > odB Then ofx = oax: ofy = oay Else ofx = obx: ofy = oby
            Dim odx As Double, ody As Double
            odx = ofx - fcx: ody = ofy - fcy
            Dim olen As Double: olen = Sqr(odx * odx + ody * ody)
            If olen > 0.001 Then
                Dim oux As Double, ouy As Double
                oux = odx / olen: ouy = ody / olen
                Dim dotA As Double, dotB As Double
                dotA = perpAX * oux + perpAY * ouy
                dotB = perpBX * oux + perpBY * ouy
                ' 평행하지 않을 때만 (|dot| > 0.05 ≈ 약 3°) 안쪽 각 선택
                If Abs(dotA) > 0.05 Or Abs(dotB) > 0.05 Then
                    If dotA >= dotB Then
                        perpX = perpAX: perpY = perpAY
                    Else
                        perpX = perpBX: perpY = perpBY
                    End If
                    chooseByOther = True
                End If
            End If
        End If

        If Not chooseByOther Then
            ' 공선 (anti-parallel) 또는 otherCbl 없음 — owner 규칙 (2026-06-05) 의 일반화 (2026-06-10 약점1):
            '   수평 성향 (|ux| > |uy|) → 케이블 「진짜 수직」 중 아래쪽 (perpY > 0)
            '   수직 성향 (|uy| ≥ |ux|) → 케이블 「진짜 수직」 중 오른쪽 (perpX > 0)
            '   수평/수직 케이블은 기존 (0,1)/(1,0) 과 동일 결과. 대각 케이블만 축 방향 대신 진짜 수직으로 개선.
            '   (변경 전 = 커밋 98a88d0: 항상 (0,1)/(1,0) 축 고정)
            If Abs(ux) > Abs(uy) Then
                If perpAY > 0 Then
                    perpX = perpAX: perpY = perpAY
                Else
                    perpX = perpBX: perpY = perpBY
                End If
            Else
                If perpAX > 0 Then
                    perpX = perpAX: perpY = perpAY
                Else
                    perpX = perpBX: perpY = perpBY
                End If
            End If
        End If
    Else
        ux = 1: uy = 0
        perpX = 0: perpY = 1          ' 길이 0 fallback — 아래쪽
    End If

    ' Perp stagger — 같은 cable·같은 perp side 의 기존 박스 개수만큼 cable 에서 더 멀어지게.
    '   owner: 같은 cable 에서 여러 짝이 같은 위쪽 (또는 아래쪽) 으로 가는 경우 박스가 perp 방향으로도 흩어지게.
    Dim samePerpCount As Long: samePerpCount = 0
    Dim ePerpShp As Shape, ePerpAlt As String
    For Each ePerpShp In ws.Shapes
        If Left(ePerpShp.Name, Len(PREFIX_PAIRBOX)) = PREFIX_PAIRBOX Then
            ePerpAlt = ""
            On Error Resume Next
            ePerpAlt = ePerpShp.AlternativeText
            On Error GoTo 0
            If InStr(ePerpAlt, cblTag) > 0 Then
                Dim ePerpBx As Double, ePerpBy As Double
                ePerpBx = ePerpShp.Left + ePerpShp.Width / 2
                ePerpBy = ePerpShp.Top + ePerpShp.Height / 2
                ' 새 박스 perp 방향과 dot 양 = 같은 side
                If (ePerpBx - fcx) * perpX + (ePerpBy - fcy) * perpY > 0 Then
                    samePerpCount = samePerpCount + 1
                End If
            End If
        End If
    Next ePerpShp
    ' 공선 박스는 항상 PERP_OFFSET 만. 비공선은 samePerpCount stagger + cap 도달 시 추가 가중치 (owner: 위쪽 겹침 차단).
    Dim perpDist As Double
    If isColinear Then
        perpDist = PERP_OFFSET
    Else
        perpDist = PERP_OFFSET + samePerpCount * PERP_STACK_GAP
        ' cap 에 걸리면 along-cable 로 더 못 밀어내므로 perp 방향으로 추가 흩뜨림 (priorPairs × 8pt)
        If cappedByLen Then perpDist = perpDist + priorPairs * 8
    End If

    ' 박스 중심 = 시설물 중심 + 케이블 방향 × totalDist + perp offset
    Dim cx As Double, cy As Double
    cx = fcx + ux * totalDist + perpX * perpDist
    cy = fcy + uy * totalDist + perpY * perpDist

    ' ============================================================
    '  owner 2026-06-06 (8-27): cluster snap — BASE 위치 계산 후 같은 (fac, cbl) 의 기존 박스 cluster 가 있으면 Y 방향만 snap.
    '    되돌리려면 SNAP_ENABLED = False 로 변경 (X·Y 모두 기존 BASE 위치 그대로 사용).
    '    X 는 그대로 (내각 큰 쪽 케이블 가까이 perp side 보존) → 「화살표 정렬 기준」 유지.
    '    Y 만 조정 — BASE 가 cluster 아래면 nearest.bottom + 0.2cm, 위면 nearest.top - 0.2cm.
    '    같은 (fac, cbl) 박스 없으면 (= 첫 chain) BASE 위치 그대로.
    '    RN 박스 (rn= 키 또는 cbl=fac_) 는 제외.
    Const SNAP_ENABLED As Boolean = True
    Const SNAP_GAP As Double = 5.67                ' 0.2 cm
    If SNAP_ENABLED Then
        Dim snapNearest As Shape: Set snapNearest = Nothing
        Dim snapMinDist As Double: snapMinDist = 1E+30
        Dim snapFacTag As String: snapFacTag = "fac=" & commonFacId
        Dim snapCblTag As String: snapCblTag = "cbl=" & cbl.Name
        Dim snapSh As Shape, snapAlt As String
        For Each snapSh In ws.Shapes
            If Left(snapSh.Name, Len(PREFIX_PAIRBOX)) = PREFIX_PAIRBOX Then
                snapAlt = "": On Error Resume Next: snapAlt = snapSh.AlternativeText: On Error GoTo 0
                ' RN 박스 제외
                If InStr(snapAlt, "|rn=") = 0 And InStr(snapAlt, "rn=") <> 1 Then
                    ' 같은 facility + 같은 cable
                    If InStr(snapAlt, snapFacTag) > 0 And InStr(snapAlt, snapCblTag) > 0 Then
                        Dim snapBcx As Double, snapBcy As Double
                        snapBcx = snapSh.Left + snapSh.Width / 2
                        snapBcy = snapSh.Top + snapSh.Height / 2
                        Dim snapD As Double
                        snapD = (snapBcx - cx) * (snapBcx - cx) + (snapBcy - cy) * (snapBcy - cy)
                        If snapD < snapMinDist Then
                            snapMinDist = snapD
                            Set snapNearest = snapSh
                        End If
                    End If
                End If
            End If
        Next snapSh
        ' 기존 박스 있으면 Y 만 snap (X 그대로 보존)
        If Not snapNearest Is Nothing Then
            Dim snapNearCy As Double
            snapNearCy = snapNearest.Top + snapNearest.Height / 2
            If cy >= snapNearCy Then
                ' 아래 방향 — new.top = nearest.bottom + 0.2cm → new.cy = nearest.bottom + 0.2cm + BX_H/2
                cy = snapNearest.Top + snapNearest.Height + SNAP_GAP + BX_H / 2
            Else
                ' 위 방향 — new.bottom = nearest.top - 0.2cm → new.cy = nearest.top - 0.2cm - BX_H/2
                cy = snapNearest.Top - SNAP_GAP - BX_H / 2
            End If
        End If
    End If
    ' ============================================================

    Dim box As Shape
    Set box = ws.Shapes.AddShape(msoShapeRectangle, cx - BX_W / 2, cy - BX_H / 2, BX_W, BX_H)
    box.Name = PREFIX_PAIRBOX & NewId8()
    box.OnAction = ""
    box.Placement = 3
    box.Locked = False
    On Error Resume Next
    ' 시설물 id + 케이블 id 저장 — 검증 시 시설물별·케이블별 그룹핑에 사용
    '   형식: "fac=<facId>|cbl=<cblId>"
    box.AlternativeText = "fac=" & commonFacId & "|cbl=" & cbl.Name
    With box.Line
        .ForeColor.RGB = RGB(80, 80, 80)
        .Weight = 0.75
        .Visible = msoTrue
    End With
    With box.Fill
        .ForeColor.RGB = RGB(255, 255, 255)            ' owner: 박스 배경 흰색
        .Visible = msoTrue
    End With
    With box.TextFrame2
        .MarginLeft = 2.83465: .MarginRight = 2.83465: .MarginTop = 0.1: .MarginBottom = 0.1  ' 좌우 0.1cm · 상하 0.1pt
        .VerticalAnchor = msoAnchorMiddle
        .WordWrap = msoFalse
        .AutoSize = msoAutoSizeShapeToFitText        ' 텍스트 길이 따라 폭 확장
        .TextRange.Text = initialText
        .TextRange.Font.Name = CALLOUT_FONT_NAME
        .TextRange.Font.Size = 9                     ' owner 요구 — 글자 크기 9
        .TextRange.Font.Bold = msoTrue
        .TextRange.Font.Fill.ForeColor.RGB = 0
        .TextRange.ParagraphFormat.Alignment = 1     ' 가운데
    End With
    On Error GoTo 0

    ' AutoSize 폭 cap — 긴 텍스트 (예: "1,3,4,5,6,7,8,9,10,11,12") 가 박스를 200pt+ 로 키워 캔버스를 가로지르는 문제 차단.
    '   80pt 초과 시 AutoSize 해제 + 80pt 고정 + WordWrap=True (세로로 늘어남).
    On Error Resume Next
    If box.Width > 80 Then
        box.TextFrame2.AutoSize = msoAutoSizeNone
        box.Width = 80
        box.TextFrame2.WordWrap = msoTrue
    End If
    On Error GoTo 0

    ' 박스 맨 위로 (owner 요구: 케이블에 가려 선번 안 보이는 문제 차단)
    On Error Resume Next
    box.ZOrder msoBringToFront
    On Error GoTo 0

    ' ============================================================
    '  owner 2026-06-11: 다케이블 허브 충돌회피 — 기본 위치가 시설물·다른 케이블·다른 선번박스와
    '    겹칠 때만 「자기 케이블 방향 우선」 후보 탐색으로 빈 자리 재배치.
    '    (시설물에 케이블 6~7방향 수렴 시 박스가 시설물 위·다른 케이블 위에 겹치던 문제)
    '    기본 위치가 비어 있으면 종전 동작 100% 그대로 — 공선 캐스케이드 체인·cluster snap 보호.
    '    복원 = 이 블록 + 선번박스_위치충돌 함수 삭제 (변경 전 = 커밋 7dc1b1b).
    On Error Resume Next
    Dim fnlW As Double, fnlH As Double
    fnlW = box.Width: fnlH = box.Height
    If 선번박스_위치충돌(ws, box.Left, box.Top, fnlW, fnlH, cbl.Name, box.Name) Then
        Const RB_ALONG As Double = 26      ' 케이블 방향 한 단계 (박스 폭보다 약간 크게)
        Const RB_PERP As Double = 18       ' 수직 방향 한 단계
        Dim rbT As Long, rbK As Long, rbM As Long, rbS As Long
        Dim rbPx As Double, rbPy As Double, rbCx As Double, rbCy As Double
        Dim rbDone As Boolean: rbDone = False
        For rbT = 1 To 12
            ' 같은 단계 안에서는 케이블 방향(rbK) 이동을 수직(rbM) 이동보다 우선 — 박스가 자기 케이블 따라 분산
            For rbK = rbT To 0 Step -1
                rbM = rbT - rbK
                For rbS = 0 To 1
                    If rbS = 0 Then
                        rbPx = perpX: rbPy = perpY        ' 기본 side 우선 (침범 기준 일관)
                    Else
                        rbPx = -perpX: rbPy = -perpY      ' 반대 side
                    End If
                    rbCx = fcx + ux * (totalDist + rbK * RB_ALONG) + rbPx * (perpDist + rbM * RB_PERP)
                    rbCy = fcy + uy * (totalDist + rbK * RB_ALONG) + rbPy * (perpDist + rbM * RB_PERP)
                    If Not 선번박스_위치충돌(ws, rbCx - fnlW / 2, rbCy - fnlH / 2, fnlW, fnlH, cbl.Name, box.Name) Then
                        box.Left = rbCx - fnlW / 2
                        box.Top = rbCy - fnlH / 2
                        rbDone = True
                        Exit For
                    End If
                Next rbS
                If rbDone Then Exit For
            Next rbK
            If rbDone Then Exit For
        Next rbT
        ' 후보 전부 점유 — 기본 위치 그대로 (드묾)
    End If
    On Error GoTo 0
    ' ============================================================

    ' owner 2026-06-06 (8-23): lastPos 메타 즉시 초기화 — chain 평행 이동 처리에서 첫 비교 기준.
    On Error Resume Next: AltSetLastPos box, box.Left, box.Top: On Error GoTo 0

    Set 선번박스_단일생성 = box
End Function

' (bxL,bxT) 좌상단 w×h 선번박스가 장애물과 겹치는지 — 시설물(fac_) + 케이블(cbl_ 선분, 자기 케이블 제외) + 다른 선번박스.
'   자기 케이블은 perp 간격(PERP_OFFSET)이 이미 보장하므로 제외. cluster snap 의 0.2cm 간격 stack 은 inflate 1pt 라 통과.
'   owner 2026-06-11: 다케이블 허브 충돌회피용 (선번박스_단일생성 전용).
Private Function 선번박스_위치충돌(ws As Worksheet, bxL As Double, bxT As Double, _
                                    w As Double, h As Double, ownCblName As String, selfName As String) As Boolean
    선번박스_위치충돌 = True
    Dim bxR As Double: bxR = bxL + w
    Dim bxB As Double: bxB = bxT + h
    Dim sh As Shape
    Dim nm As String
    Dim cax As Double, cay As Double, cbx As Double, cby As Double
    For Each sh In ws.Shapes
        nm = sh.Name
        If nm <> selfName Then
            If Left(nm, Len(PREFIX_FAC)) = PREFIX_FAC Then
                ' 시설물 — bbox 겹침 (2pt 여유)
                If sh.Left - 2 < bxR Then
                    If sh.Left + sh.Width + 2 > bxL Then
                        If sh.Top - 2 < bxB Then
                            If sh.Top + sh.Height + 2 > bxT Then Exit Function
                        End If
                    End If
                End If
            ElseIf Left(nm, Len(PREFIX_PAIRBOX)) = PREFIX_PAIRBOX Then
                ' 다른 선번박스 — bbox 겹침 (1pt 여유)
                If sh.Left - 1 < bxR Then
                    If sh.Left + sh.Width + 1 > bxL Then
                        If sh.Top - 1 < bxB Then
                            If sh.Top + sh.Height + 1 > bxT Then Exit Function
                        End If
                    End If
                End If
            ElseIf Left(nm, Len(PREFIX_CBL)) = PREFIX_CBL Then
                ' 다른 케이블 선분 — Liang-Barsky (M2 선분_사각형_교차)
                If nm <> ownCblName Then
                    GetLineEndpoints sh, cax, cay, cbx, cby
                    If 선분_사각형_교차(cax, cay, cbx, cby, bxL - 1, bxT - 1, bxR + 1, bxB + 1) Then Exit Function
                End If
            End If
        End If
    Next sh
    선번박스_위치충돌 = False
End Function

' ============================================================================
'  코어 검증 — 한 시설물에 연결된 케이블들 사이 코어 중복 검사
' ============================================================================
'   입력 형식 (박스 텍스트):
'     • 콤마 구분 : "1,3,5"        → 코어 1·3·5
'     • 물결 범위 : "1~6"          → 코어 1·2·3·4·5·6
'     • 혼합     : "1,3~5,7~9"    → 코어 1·3·4·5·7·8·9
'   검증 룰: 한 시설물에 연결된 케이블들 사이에 같은 코어 번호가 2번 이상 나타나면 안 됨.
'     (같은 박스 안 중복 — 예: 「1,1,3」 — 도 같은 케이블에 같은 코어가 2번 들어간 셈이라 동일 룰로 잡힘)
'   AlternativeText 의 "fac=<facId>|cbl=<cblId>" 으로 박스 → 시설물·케이블 매핑.
Public Sub 선번_검증()
    Dim ws As Worksheet
    On Error Resume Next
    Set ws = ThisWorkbook.Worksheets(SHEET_NETWORK)
    On Error GoTo 0
    If ws Is Nothing Then
        MsgBox "네트웍구성도가 없습니다.", vbExclamation, "코어 검증"
        Exit Sub
    End If

    ' 검증 전 — 박스 이동으로 풀린 화살표 자동 재부착. 짝 검사가 connector 양 끝 박스를 정확히 보게 보장.
    선번화살표_재라우팅 ws

    ' 시설물별 코어 사용 이력 — facCoreOccurrences(facId)(coreNum) = Collection of (boxName, cblId)
    Dim facCoreOcc As Object: Set facCoreOcc = CreateObject("Scripting.Dictionary")
    Dim facSet As Object: Set facSet = CreateObject("Scripting.Dictionary")
    Dim totalBoxes As Long

    Dim sh As Shape, alt As String
    For Each sh In ws.Shapes
        If Left(sh.Name, Len(PREFIX_PAIRBOX)) = PREFIX_PAIRBOX Then
            totalBoxes = totalBoxes + 1
            alt = ""
            On Error Resume Next
            alt = sh.AlternativeText
            On Error GoTo 0
            Dim facId As String, cblId As String
            선번박스_alt_파싱 alt, facId, cblId
            If Len(facId) = 0 Then GoTo NextBox

            ' 박스 텍스트 → 코어 번호 배열 (중복 보존 — 같은 박스 안 중복도 카운트)
            Dim txt As String: txt = ""
            On Error Resume Next
            txt = sh.TextFrame2.TextRange.Text
            On Error GoTo 0
            Dim nums As Variant
            선번_파싱 txt, nums

            If Not facSet.Exists(facId) Then facSet.Add facId, True
            If IsEmpty(nums) Then GoTo NextBox

            If Not facCoreOcc.Exists(facId) Then facCoreOcc.Add facId, CreateObject("Scripting.Dictionary")
            Dim coreMap As Object: Set coreMap = facCoreOcc(facId)
            Dim ni As Long
            For ni = LBound(nums) To UBound(nums)
                Dim n As Long: n = nums(ni)
                Dim key As String: key = CStr(n)
                If Not coreMap.Exists(key) Then coreMap.Add key, New Collection
                coreMap(key).Add sh.Name & "|" & cblId
            Next ni
NextBox:
        End If
    Next sh

    If totalBoxes = 0 Then
        MsgBox "네트웍구성도에 코어 박스가 없습니다.", vbInformation, "코어 검증"
        Exit Sub
    End If

    ' 시설물별 중복 코어 (Collection.Count >= 2) 만 보고
    Dim report As String: report = ""
    Dim totalDupCores As Long: totalDupCores = 0
    Dim fk As Variant
    For Each fk In facCoreOcc.Keys
        Dim coreMap2 As Object: Set coreMap2 = facCoreOcc(fk)
        Dim facHeader As String: facHeader = ""
        Dim ck As Variant
        For Each ck In coreMap2.Keys
            Dim occList As Collection: Set occList = coreMap2(ck)
            If occList.Count >= 2 Then
                If Len(facHeader) = 0 Then
                    Dim facName As String: facName = MetaLookupName(SHEET_META_FAC, CStr(fk))
                    If Len(facName) = 0 Or facName = "(미지정)" Then facName = Right(CStr(fk), 6)
                    facHeader = "▶ 시설물 「" & facName & "」 케이블 중복 선번:" & vbLf
                End If
                ' 박스명 + 케이블 id 목록
                Dim cableList As String: cableList = ""
                Dim ii As Long, prevCbl As String, sameCblCount As Long
                Dim seenCbl As Object: Set seenCbl = CreateObject("Scripting.Dictionary")
                For ii = 1 To occList.Count
                    Dim pair As String: pair = CStr(occList(ii))
                    Dim sep As Long: sep = InStr(pair, "|")
                    Dim cId As String: cId = Mid(pair, sep + 1)
                    If Len(cId) = 0 Then cId = "(미지정 케이블)"
                    If seenCbl.Exists(cId) Then
                        seenCbl(cId) = seenCbl(cId) + 1
                    Else
                        seenCbl.Add cId, 1
                    End If
                Next ii
                Dim sk As Variant
                For Each sk In seenCbl.Keys
                    If Len(cableList) > 0 Then cableList = cableList & ", "
                    Dim cnt As Long: cnt = seenCbl(sk)
                    If cnt > 1 Then
                        cableList = cableList & Right(CStr(sk), 6) & "(×" & cnt & ")"
                    Else
                        cableList = cableList & Right(CStr(sk), 6)
                    End If
                Next sk
                facHeader = facHeader & "    코어 " & ck & " — 케이블 " & cableList & vbLf
                totalDupCores = totalDupCores + 1
            End If
        Next ck
        If Len(facHeader) > 0 Then report = report & facHeader & vbLf
    Next fk

    ' ========== 짝 코어수 검사 (양쪽 케이블의 선번 개수가 같아야 함) ==========
    '   각 화살표 → ConnectorFormat.Begin/EndConnectedShape 로 양 끝 박스 조회
    '   양 박스의 코어 수가 다르면 「짝 불일치」. 대응표(1→1, 2→2, ...) 와 함께 보고
    Dim pairReport As String: pairReport = ""
    Dim totalPairs As Long, totalPairMismatch As Long
    Dim mismatchArrows As Object: Set mismatchArrows = CreateObject("Scripting.Dictionary")
    Dim mismatchBoxes As Object: Set mismatchBoxes = CreateObject("Scripting.Dictionary")
    Dim allArrows As Object: Set allArrows = CreateObject("Scripting.Dictionary")

    Dim shArr As Shape
    For Each shArr In ws.Shapes
        If Left(shArr.Name, Len(PREFIX_PAIRARROW)) = PREFIX_PAIRARROW Then
            allArrows.Add shArr.Name, True
            Dim bx1 As Shape, bx2 As Shape
            Set bx1 = Nothing: Set bx2 = Nothing
            On Error Resume Next
            Set bx1 = shArr.ConnectorFormat.BeginConnectedShape
            Set bx2 = shArr.ConnectorFormat.EndConnectedShape
            On Error GoTo 0
            If bx1 Is Nothing Or bx2 Is Nothing Then GoTo NextArr
            If Left(bx1.Name, Len(PREFIX_PAIRBOX)) <> PREFIX_PAIRBOX Then GoTo NextArr
            If Left(bx2.Name, Len(PREFIX_PAIRBOX)) <> PREFIX_PAIRBOX Then GoTo NextArr
            totalPairs = totalPairs + 1

            Dim txt1 As String, txt2 As String
            txt1 = "": txt2 = ""
            On Error Resume Next
            txt1 = bx1.TextFrame2.TextRange.Text
            txt2 = bx2.TextFrame2.TextRange.Text
            On Error GoTo 0

            Dim nums1 As Variant, nums2 As Variant
            선번_파싱 txt1, nums1
            선번_파싱 txt2, nums2

            Dim c1 As Long, c2 As Long
            If IsEmpty(nums1) Then c1 = 0 Else c1 = UBound(nums1) - LBound(nums1) + 1
            If IsEmpty(nums2) Then c2 = 0 Else c2 = UBound(nums2) - LBound(nums2) + 1

            If c1 <> c2 Then
                totalPairMismatch = totalPairMismatch + 1
                mismatchArrows.Add shArr.Name, True
                If Not mismatchBoxes.Exists(bx1.Name) Then mismatchBoxes.Add bx1.Name, True
                If Not mismatchBoxes.Exists(bx2.Name) Then mismatchBoxes.Add bx2.Name, True

                ' 대응표 — 1→1, 2→2, ..., k→?, ?→k+1 형식
                Dim maxC As Long: If c1 > c2 Then maxC = c1 Else maxC = c2
                Dim pairing As String: pairing = ""
                Dim kk As Long
                For kk = 0 To maxC - 1
                    If Len(pairing) > 0 Then pairing = pairing & ", "
                    Dim aStr As String, bStr As String
                    If kk < c1 Then aStr = CStr(nums1(LBound(nums1) + kk)) Else aStr = "?"
                    If kk < c2 Then bStr = CStr(nums2(LBound(nums2) + kk)) Else bStr = "?"
                    pairing = pairing & aStr & "→" & bStr
                Next kk

                Dim diffMsg As String
                If c1 > c2 Then
                    diffMsg = "A 가 " & (c1 - c2) & " 개 많음 (마지막 " & (c1 - c2) & " 개 짝 없음)"
                Else
                    diffMsg = "B 가 " & (c2 - c1) & " 개 많음 (마지막 " & (c2 - c1) & " 개 짝 없음)"
                End If

                pairReport = pairReport & "  • A 「" & txt1 & "」 (" & c1 & " 코어) ↔ B 「" & txt2 & "」 (" & c2 & " 코어)" & vbLf
                pairReport = pairReport & "      → " & diffMsg & vbLf
                pairReport = pairReport & "      대응: " & pairing & vbLf & vbLf
            End If
NextArr:
        End If
    Next shArr

    ' ========== 시각 강조 — 빨강(불일치) / 기본(OK) 으로 색 갱신 ==========
    '   화살표: 불일치 = 빨강+굵게, OK = 검정+기본 두께
    '   박스 테두리: 불일치(짝 안 맞음 OR 중복 코어) = 빨강+굵게, OK = 회색+가는선
    '   중복 코어 박스도 함께 빨강 강조 (사용자가 즉시 보이게)
    Dim shFix As Shape, isMm As Boolean, isMmBox As Boolean
    ' 중복 코어 참여 박스 — facCoreOcc 재스캔
    Dim dupBoxes As Object: Set dupBoxes = CreateObject("Scripting.Dictionary")
    Dim fk2 As Variant
    For Each fk2 In facCoreOcc.Keys
        Dim coreMap3 As Object: Set coreMap3 = facCoreOcc(fk2)
        Dim ck2 As Variant
        For Each ck2 In coreMap3.Keys
            If coreMap3(ck2).Count >= 2 Then
                Dim oi As Long
                For oi = 1 To coreMap3(ck2).Count
                    Dim pp As String: pp = CStr(coreMap3(ck2)(oi))
                    Dim bn As String: bn = Left(pp, InStr(pp, "|") - 1)
                    If Not dupBoxes.Exists(bn) Then dupBoxes.Add bn, True
                Next oi
            End If
        Next ck2
    Next fk2

    On Error Resume Next
    For Each shFix In ws.Shapes
        If Left(shFix.Name, Len(PREFIX_PAIRARROW)) = PREFIX_PAIRARROW Then
            isMm = mismatchArrows.Exists(shFix.Name)
            If isMm Then
                shFix.Line.ForeColor.RGB = RGB(220, 38, 38)     ' 빨강
                shFix.Line.Weight = 2.5
            Else
                shFix.Line.ForeColor.RGB = 0                     ' 검정
                shFix.Line.Weight = 1.5
            End If
        ElseIf Left(shFix.Name, Len(PREFIX_PAIRBOX)) = PREFIX_PAIRBOX Then
            isMmBox = mismatchBoxes.Exists(shFix.Name) Or dupBoxes.Exists(shFix.Name)
            If isMmBox Then
                shFix.Line.ForeColor.RGB = RGB(220, 38, 38)     ' 빨강 테두리
                shFix.Line.Weight = 1.75
            Else
                shFix.Line.ForeColor.RGB = RGB(80, 80, 80)       ' 기본 회색
                shFix.Line.Weight = 0.75
            End If
        End If
    Next shFix
    On Error GoTo 0

    ' ========== 최종 보고 ==========
    Dim summary As String: summary = ""
    summary = "코어 박스 " & totalBoxes & " 개 · 짝 " & totalPairs & " 개 검사" & vbLf & vbLf
    If totalDupCores = 0 And totalPairMismatch = 0 Then
        MsgBox summary & "✓ 시설물별 중복 없음" & vbLf & _
               "✓ 양쪽 케이블 코어수 모두 일치" & vbLf & vbLf & _
               "검사 시설물: " & facSet.Count & " 개", _
               vbInformation, "코어 검증"
    Else
        Dim out2 As String: out2 = summary
        out2 = out2 & "발견: "
        If totalDupCores > 0 Then out2 = out2 & "중복 코어 " & totalDupCores & " 건"
        If totalDupCores > 0 And totalPairMismatch > 0 Then out2 = out2 & " · "
        If totalPairMismatch > 0 Then out2 = out2 & "짝 불일치 " & totalPairMismatch & " 건"
        out2 = out2 & vbLf & vbLf
        If Len(pairReport) > 0 Then
            out2 = out2 & "[ 짝 코어수 불일치 ]" & vbLf & pairReport
        End If
        If Len(report) > 0 Then
            out2 = out2 & "[ 시설물별 중복 코어 ]" & vbLf & report
            out2 = out2 & "(케이블 id ×N = 같은 케이블에 같은 선번 N 회)" & vbLf & vbLf
        End If
        out2 = out2 & "→ 화살표·박스 빨강 = 불일치. 수정 후 다시 「코어 검증」 누르면 색 갱신됩니다."
        MsgBox out2, vbExclamation, "코어 검증"
    End If
End Sub

' AlternativeText 파싱 — "fac=<facId>|cbl=<cblId>"
Public Sub 선번박스_alt_파싱(alt As String, ByRef facId As String, ByRef cblId As String)
    facId = "": cblId = ""
    If Len(alt) = 0 Then Exit Sub
    Dim parts() As String: parts = Split(alt, "|")
    Dim i As Long
    For i = LBound(parts) To UBound(parts)
        Dim kv As String: kv = parts(i)
        Dim eq As Long: eq = InStr(kv, "=")
        If eq > 0 Then
            Dim k As String: k = Left(kv, eq - 1)
            Dim v As String: v = Mid(kv, eq + 1)
            If k = "fac" Then facId = v
            If k = "cbl" Then cblId = v
        End If
    Next i
End Sub

' 선번 텍스트 파싱 — "1,3~5,7" → 정수 배열. 중복 보존 (같은 박스 안 「1,1,3」 이면 1·1·3 그대로).
'   공백 무시, 숫자 아닌 토큰 skip (사용자 오타 무시), 역순 범위 (5~3) 도 skip
Public Sub 선번_파싱(txt As String, ByRef nums As Variant)
    nums = Empty
    Dim cleaned As String: cleaned = Replace(Trim(txt), " ", "")
    If Len(cleaned) = 0 Then Exit Sub

    Dim ordered As Collection: Set ordered = New Collection
    Dim tokens() As String: tokens = Split(cleaned, ",")
    Dim i As Long
    For i = LBound(tokens) To UBound(tokens)
        Dim tk As String: tk = tokens(i)
        If Len(tk) > 0 Then
            ' owner 2026-06-05: range 구분자로 "~" 와 "-" 둘 다 인식 (텍스트_합치기 는 "-" 사용 → Phase 1 잠금 누락·부분해제 오류 원인)
            Dim rngPos As Long: rngPos = InStr(tk, "~")
            If rngPos = 0 Then rngPos = InStr(tk, "-")
            If rngPos > 0 Then
                Dim aStr As String: aStr = Left(tk, rngPos - 1)
                Dim bStr As String: bStr = Mid(tk, rngPos + 1)
                If IsNumeric(aStr) And IsNumeric(bStr) Then
                    Dim a As Long: a = CLng(aStr)
                    Dim b As Long: b = CLng(bStr)
                    If a > 0 And b > 0 And a <= b Then
                        Dim j As Long
                        For j = a To b: ordered.Add j: Next j
                    End If
                End If
            ElseIf IsNumeric(tk) Then
                Dim n As Long: n = CLng(tk)
                If n > 0 Then ordered.Add n
            End If
        End If
    Next i

    If ordered.Count = 0 Then Exit Sub
    Dim arr() As Long: ReDim arr(0 To ordered.Count - 1)
    Dim k As Long
    For k = 1 To ordered.Count: arr(k - 1) = ordered(k): Next k
    nums = arr
End Sub

Public Sub 케이블_삭제(cblId As String)
    ' Undo 기록 — 양 끝 시설물 + spec 직렬화 (단순 직선으로 복원). waypoints 손실
    '   cascade 호출 (시설물_삭제 안) 이면 별도 기록 안 함 — facility_delete 1회로 모두 복원
    If Not g_undo_cascade_suppress Then
        Action_저장 "cable_delete", Action_cable_delete_payload(cblId), _
                    "케이블 삭제: " & Right(cblId, 6)
    End If

    Dim wsAd As Worksheet: Set wsAd = ThisWorkbook.Worksheets(SHEET_ADMIN)
    Dim wsNw As Worksheet: Set wsNw = ThisWorkbook.Worksheets(SHEET_NETWORK)
    On Error Resume Next
    wsAd.Shapes(cblId).Delete
    wsNw.Shapes(cblId).Delete
    ' 케이블 설명선(말풍선 + 연결선) 함께 삭제
    wsAd.Shapes(PREFIX_LABEL & cblId).Delete
    wsAd.Shapes(PREFIX_LEADER & cblId).Delete
    wsNw.Shapes(PREFIX_LABEL & cblId).Delete
    wsNw.Shapes(PREFIX_LEADER & cblId).Delete
    On Error GoTo 0
    ' owner 2026-06-09 (8-125): 철거 케이블 X 마크 cascade — _cbl_x_<cblId>_* 모두 제거 (양 시트)
    케이블_X마크_제거 wsAd, cblId
    케이블_X마크_제거 wsNw, cblId
    MetaDeleteRow SHEET_META_CBL, 1, cblId

    ' owner 2026-06-07 (8-60): 네트웍구성도 선번박스·화살표 cascade — cbl=<cblId> 가진 PAIRBOX 와 그것을 가리키는 PAIRARROW 모두 삭제
    네트웍_연결도형_정리 wsNw, "cbl", cblId
End Sub

' owner 2026-06-09 (8-125-fix6): 시설물 이동 후 케이블 위치 변경 시 X 마크 추종 (재배치).
'   - X 마크가 없으면 (철거 케이블 아님) skip — 항상 호출해도 안전
'   - 있으면: 기존 X 모두 제거 + 현재 케이블 형태로 PlaceCableRemovalXMarks 재실행
'   - 호출 위치: 행정도_케이블_시설물_추종 + 네트웍_케이블_재라우팅 (M2_Facility.bas)
Public Sub 철거_X마크_케이블_갱신(ws As Worksheet, cbl As Shape, _
                                   fromAttached As Boolean, toAttached As Boolean)
    If ws Is Nothing Or cbl Is Nothing Then Exit Sub
    Dim cblId As String: cblId = cbl.Name
    If Len(cblId) = 0 Then Exit Sub
    If Left(cblId, Len(PREFIX_CBL)) <> PREFIX_CBL Then Exit Sub

    ' X 마크 존재 여부 — 첫 번째 (idx=0_a) 만 확인 (성능)
    Dim chk As Shape: Set chk = Nothing
    On Error Resume Next: Set chk = ws.Shapes(PREFIX_CBL_X & cblId & "_0_a"): On Error GoTo 0
    If chk Is Nothing Then Exit Sub    ' 철거 X 마크 없음 → skip

    ' 기존 X 마크 제거
    케이블_X마크_제거 ws, cblId

    ' 케이블 색·두께 추출
    Dim lc As Long: lc = vbBlack
    Dim lwt As Double: lwt = 1.5
    On Error Resume Next
    lc = cbl.Line.ForeColor.RGB
    lwt = cbl.Line.Weight
    On Error GoTo 0

    PlaceCableRemovalXMarks ws, cbl, cblId, lc, lwt, fromAttached, toAttached
End Sub

' owner 2026-06-09 (8-125): 특정 케이블의 철거 X 마크 일괄 제거.
'   이름 prefix: PREFIX_CBL_X & cblId & "_" → "_cbl_x_<cblId>_<idx>_a|b"
'   호출 시점에 X 가 없어도 안전 (Resume Next).
Public Sub 케이블_X마크_제거(ws As Worksheet, cblId As String)
    If ws Is Nothing Then Exit Sub
    If Len(cblId) = 0 Then Exit Sub
    Dim wasProt As Boolean: wasProt = ws.ProtectContents Or ws.ProtectDrawingObjects
    On Error Resume Next: ws.Unprotect: On Error GoTo 0

    Dim xPrefix As String: xPrefix = PREFIX_CBL_X & cblId & "_"
    Dim i As Long
    For i = ws.Shapes.Count To 1 Step -1
        On Error Resume Next
        If Left(ws.Shapes(i).Name, Len(xPrefix)) = xPrefix Then ws.Shapes(i).Delete
        On Error GoTo 0
    Next i

    If wasProt Then ApplySheetProtection ws
End Sub

' owner 2026-06-07 (8-60): 네트웍구성도에서 특정 시설물 또는 케이블에 연결된 PAIRBOX·PAIRARROW 일괄 정리.
'   kind = "fac" (시설물) 또는 "cbl" (케이블), id = 도형 이름 (예: "fac_abc12345" / "cbl_xyz98765").
'
'   Phase 1: PAIRBOX 중 alt 에 「kind=id」 토큰을 가진 모든 도형 수집·삭제 → 삭제된 박스 이름 dict 작성
'   Phase 2: PAIRARROW 중 alt 의 box1= 또는 box2= 가 삭제된 박스 이름인 도형 삭제
'
'   idempotent — 호출 시점에 이미 일부가 삭제됐어도 안전. cascade 가드 등 외부 상태와 독립.
'   PREFIX_PAIRBOX·PREFIX_PAIRARROW prefix 만 검사 → 다른 도형 (시설물·케이블·라벨·배지) 영향 없음.
Public Sub 네트웍_연결도형_정리(wsNw As Worksheet, kind As String, id As String)
    If wsNw Is Nothing Then Exit Sub
    If Len(kind) = 0 Or Len(id) = 0 Then Exit Sub

    Dim wasProt As Boolean: wasProt = wsNw.ProtectContents Or wsNw.ProtectDrawingObjects
    On Error Resume Next: wsNw.Unprotect: On Error GoTo 0

    Dim tag As String: tag = kind & "=" & id   ' 예: "fac=fac_abc12345"
    Dim deletedBoxes As Object: Set deletedBoxes = CreateObject("Scripting.Dictionary")
    Dim i As Long, sh As Shape, alt As String

    ' Phase 1 — PAIRBOX 중 tag 가진 것 삭제
    For i = wsNw.Shapes.Count To 1 Step -1
        Set sh = wsNw.Shapes(i)
        If Left(sh.Name, Len(PREFIX_PAIRBOX)) = PREFIX_PAIRBOX Then
            alt = ""
            On Error Resume Next: alt = sh.AlternativeText: On Error GoTo 0
            If InStr(alt, tag) > 0 Then
                deletedBoxes(sh.Name) = True
                On Error Resume Next: sh.Delete: On Error GoTo 0
            End If
        End If
    Next i

    ' Phase 2 — PAIRARROW 중 box1/box2 가 위 삭제된 박스 이름인 것 삭제
    If deletedBoxes.Count > 0 Then
        For i = wsNw.Shapes.Count To 1 Step -1
            Set sh = wsNw.Shapes(i)
            If Left(sh.Name, Len(PREFIX_PAIRARROW)) = PREFIX_PAIRARROW Then
                alt = ""
                On Error Resume Next: alt = sh.AlternativeText: On Error GoTo 0
                Dim b1 As String: b1 = AltParseField(alt, "box1=")
                Dim b2 As String: b2 = AltParseField(alt, "box2=")
                If deletedBoxes.Exists(b1) Or deletedBoxes.Exists(b2) Then
                    On Error Resume Next: sh.Delete: On Error GoTo 0
                End If
            End If
        Next i
    End If

    If wasProt Then ApplySheetProtection wsNw
End Sub

' ============================================================================
'  8. 정보 동기화
' ============================================================================
Public Sub 정보_적용()
    Dim wsAd As Worksheet: Set wsAd = ThisWorkbook.Worksheets(SHEET_ADMIN)
    Dim wsNw As Worksheet: Set wsNw = ThisWorkbook.Worksheets(SHEET_NETWORK)
    Dim activeIsNw As Boolean: activeIsNw = (ActiveSheet Is wsNw)
    Dim sh As Shape, peer As Shape, nm As String
    Dim synced As Long: synced = 0
    Dim calloutSynced As Long: calloutSynced = 0

    For Each sh In wsAd.Shapes
        nm = sh.Name
        If Left(nm, Len(PREFIX_FAC)) = PREFIX_FAC Or Left(nm, Len(PREFIX_CBL)) = PREFIX_CBL Then
            ' 시설물·케이블 도형 속성(색·선·글자): 행정도 → 네트웍
            Set peer = Nothing
            On Error Resume Next
            Set peer = wsNw.Shapes(nm)
            On Error GoTo 0
            If Not peer Is Nothing Then
                SyncShapeProps sh, peer
                synced = synced + 1
            End If
        ElseIf Left(nm, Len(PREFIX_LABEL)) = PREFIX_LABEL Then
            Set peer = Nothing
            On Error Resume Next
            Set peer = wsNw.Shapes(nm)
            On Error GoTo 0
            If Not peer Is Nothing Then
                ' 케이블 callout 인지 확인 — 이름이 「lbl_」 + 「cbl_」 + id 패턴이면 케이블
                Dim isCableCallout As Boolean: isCableCallout = False
                If Len(nm) >= Len(PREFIX_LABEL) + Len(PREFIX_CBL) Then
                    If Mid(nm, Len(PREFIX_LABEL) + 1, Len(PREFIX_CBL)) = PREFIX_CBL Then
                        isCableCallout = True
                    End If
                End If

                If isCableCallout Then
                    ' 케이블 callout — 행정도→네트웍 한방향 sync. 행정도 ID 는 보존 (라운드 6 의 「비움」 동작 제거)
                    '   사용자가 행정도 callout 첫줄에 선로ID 입력 → 네트웍 callout (1줄) 이 같은 ID 로 갱신
                    Dim adTC As String, nwTC As String
                    adTC = "": nwTC = ""
                    On Error Resume Next
                    adTC = sh.TextFrame2.TextRange.Text
                    nwTC = peer.TextFrame2.TextRange.Text
                    On Error GoTo 0

                    Dim adIdLine As String, adRest As String
                    SplitFirstLine adTC, adIdLine, adRest
                    Dim adIdTrim As String: adIdTrim = Trim(adIdLine)

                    ' 사용자가 행정도에서 ID 수정함 = 첫줄이 비어있지 않고 「선로ID」(템플릿) 도 아님
                    '   owner 2026-06-08 (8-84): legacy 「케이블ID」 도 템플릿으로 같이 인식 (이미 만든 도면 호환)
                    If Len(adIdTrim) > 0 And adIdTrim <> "선로ID" And adIdTrim <> "케이블ID" Then
                        Dim newNwText As String: newNwText = adIdTrim    ' 네트웍은 1줄 (선로ID)
                        If Trim(nwTC) <> newNwText Then
                            On Error Resume Next
                            peer.TextFrame2.TextRange.Text = newNwText
                            On Error GoTo 0
                            calloutSynced = calloutSynced + 1
                        End If
                    End If
                Else
                    ' 시설물 callout — 양 시트 중 「수정된 쪽」(템플릿이 아닌 쪽) 으로 양쪽 일치.
                    Dim adT As String, nwT As String, winner As String
                    adT = "": nwT = ""
                    On Error Resume Next
                    adT = sh.TextFrame2.TextRange.Text
                    nwT = peer.TextFrame2.TextRange.Text
                    On Error GoTo 0
                    If adT <> nwT Then
                        If IsCalloutTemplate(adT) And Not IsCalloutTemplate(nwT) Then
                            winner = nwT                       ' 네트웍에서 수정함
                        ElseIf IsCalloutTemplate(nwT) And Not IsCalloutTemplate(adT) Then
                            winner = adT                       ' 행정도에서 수정함
                        ElseIf activeIsNw Then
                            winner = nwT                       ' 둘 다 수정 → 현재 보는 시트 우선
                        Else
                            winner = adT
                        End If
                        On Error Resume Next
                        sh.TextFrame2.TextRange.Text = winner
                        peer.TextFrame2.TextRange.Text = winner
                        On Error GoTo 0
                        calloutSynced = calloutSynced + 1
                    End If
                End If
            End If
        End If
    Next sh

    ' 네트웍구성도 케이블 텍스트박스 위치 동기화 — 시설물 이동 → 케이블 reroute 후
    '   박스가 케이블 중앙에서 어긋난 경우 한꺼번에 따라잡음.
    네트웍_케이블박스_동기화 wsNw

    ' 배지 동기화 — 양 시트 텍스트 일치 + 메타 갱신 + 위치 재정렬
    Dim badgeSynced As Long: badgeSynced = 0
    Dim adShape As Shape, nwShape As Shape
    For Each adShape In wsAd.Shapes
        If Left(adShape.Name, Len(PREFIX_BADGE)) = PREFIX_BADGE Then
            Set nwShape = Nothing
            On Error Resume Next
            Set nwShape = wsNw.Shapes(adShape.Name)
            On Error GoTo 0
            If Not nwShape Is Nothing Then
                Dim adB As String, nwB As String, winB As String
                adB = "": nwB = ""
                On Error Resume Next
                adB = adShape.TextFrame2.TextRange.Text
                nwB = nwShape.TextFrame2.TextRange.Text
                On Error GoTo 0
                If Trim(adB) <> Trim(nwB) Then
                    ' 한쪽만 비어있으면 채워진 쪽 우선, 둘 다 다르면 활성 시트 우선
                    If Len(Trim(adB)) > 0 And Len(Trim(nwB)) = 0 Then
                        winB = adB
                    ElseIf Len(Trim(nwB)) > 0 And Len(Trim(adB)) = 0 Then
                        winB = nwB
                    ElseIf activeIsNw Then
                        winB = nwB
                    Else
                        winB = adB
                    End If
                    On Error Resume Next
                    adShape.TextFrame2.TextRange.Text = winB
                    nwShape.TextFrame2.TextRange.Text = winB
                    On Error GoTo 0
                    Dim facNm As String: facNm = Mid(adShape.Name, Len(PREFIX_BADGE) + 1)
                    MetaUpdateBadgeNo facNm, Trim(winB)
                    badgeSynced = badgeSynced + 1
                End If
            End If
        End If
    Next adShape
    배지_위치_동기화 wsAd
    배지_위치_동기화 wsNw
    시설물_태그_위치_동기화 wsNw

    Dim dupes As String: dupes = FindDuplicateBadges(wsAd)
    Dim dupesMsg As String: dupesMsg = ""
    If Len(dupes) > 0 Then dupesMsg = vbLf & vbLf & "⚠ 배지 번호 중복: " & dupes & vbLf & _
                                       "(중복 번호는 수동으로 정정해주세요. 자동 변경 안 함)"

    Application.StatusBar = "정보 동기화: 도형 " & synced & " · 설명선 " & calloutSynced & " · 배지 " & badgeSynced
    MsgBox "정보 동기화 완료." & vbLf & _
           "도형 속성: " & synced & " 개" & vbLf & _
           "설명선 내용: " & calloutSynced & " 개 (양 시트 일치)" & vbLf & _
           "배지 번호: " & badgeSynced & " 개 (양 시트 + 메타 갱신)" & vbLf & vbLf & _
           "설명선·배지는 두 시트 중 「수정한 쪽」 내용으로 맞춰집니다." & vbLf & _
           "(둘 다 수정했으면 현재 보고 있는 시트 우선. 위치·waypoint 는 동기화 안 함)" & dupesMsg, _
           vbInformation, "정보 적용"
End Sub

' owner 2026-06-08 (8-79): 정보_적용 의 silent 버전 — MsgBox·StatusBar 없이 텍스트만 동기화.
'   행정도 시트의 빈셀 클릭 시 시트_셀_클릭 가 자동 호출 → 사용자가 행정도 lbl 박스를 더블클릭
'   편집(엑셀 네이티브 텍스트 모드) 한 후 빈셀 클릭만 하면 네트웍구성도가 자동 따라잡음.
'   변경 없으면 아무 일도 안 일어남 (idempotent).
'   owner 2026-06-08 (8-93): 양방향 동기화. sourceSheetName 인자로 어느 시트가 편집 진원지인지 명시.
'   네트웍에서 편집 후 그 시트 빈셀 클릭하면 행정도가 따라잡음. 호출하는 시트가 src 가 됨.
Public Sub 정보_적용_silent(Optional ByVal sourceSheetName As String = "")
    Dim wsAd As Worksheet, wsNw As Worksheet
    On Error Resume Next
    Set wsAd = ThisWorkbook.Worksheets(SHEET_ADMIN)
    Set wsNw = ThisWorkbook.Worksheets(SHEET_NETWORK)
    On Error GoTo 0
    If wsAd Is Nothing Or wsNw Is Nothing Then Exit Sub

    ' 기본값 = 행정도 src (backward compat)
    If Len(sourceSheetName) = 0 Then sourceSheetName = SHEET_ADMIN

    Dim wsSrc As Worksheet, wsDst As Worksheet
    If sourceSheetName = SHEET_NETWORK Then
        Set wsSrc = wsNw: Set wsDst = wsAd
    Else
        Set wsSrc = wsAd: Set wsDst = wsNw
    End If

    Dim sh As Shape, peer As Shape, nm As String
    For Each sh In wsSrc.Shapes
        nm = sh.Name
        If Left(nm, Len(PREFIX_LABEL)) = PREFIX_LABEL Then
            Set peer = Nothing
            On Error Resume Next: Set peer = wsDst.Shapes(nm): On Error GoTo 0
            If Not peer Is Nothing Then
                Dim isCableCallout As Boolean: isCableCallout = False
                If Len(nm) >= Len(PREFIX_LABEL) + Len(PREFIX_CBL) Then
                    If Mid(nm, Len(PREFIX_LABEL) + 1, Len(PREFIX_CBL)) = PREFIX_CBL Then isCableCallout = True
                End If
                If isCableCallout Then
                    ' 케이블 callout: 행정도=3줄 (선로ID/규격/거리), 네트웍=1줄 (선로ID).
                    '   src 의 1번째 줄(선로ID) → dst 1번째 줄. dst 의 2,3번째 줄은 보존.
                    '   src 가 템플릿 (선로ID/케이블ID/빈문자열) 이면 sync skip.
                    Dim srcT As String, dstT As String
                    srcT = "": dstT = ""
                    On Error Resume Next
                    srcT = sh.TextFrame2.TextRange.Text
                    dstT = peer.TextFrame2.TextRange.Text
                    On Error GoTo 0
                    Dim srcIdLine As String, srcRest As String
                    SplitFirstLine srcT, srcIdLine, srcRest
                    Dim srcIdTrim As String: srcIdTrim = Trim(srcIdLine)
                    If Len(srcIdTrim) > 0 And srcIdTrim <> "선로ID" And srcIdTrim <> "케이블ID" Then
                        Dim dstIdLine As String, dstRest As String
                        SplitFirstLine dstT, dstIdLine, dstRest
                        If Trim(dstIdLine) <> srcIdTrim Then
                            Dim newDstText As String
                            If Len(dstRest) > 0 Then
                                newDstText = srcIdTrim & vbCr & dstRest
                            Else
                                newDstText = srcIdTrim
                            End If
                            On Error Resume Next
                            peer.TextFrame2.TextRange.Text = newDstText
                            On Error GoTo 0
                        End If
                    End If
                Else
                    ' 시설물 callout: 양 시트 모두 3줄. src 가 템플릿이고 dst 가 실데이터면 dst → src
                    '   (편집 진원지가 잘못 잡힘 = dst 가 실제 진원지). 그 외엔 src → dst.
                    Dim srcT2 As String, dstT2 As String
                    srcT2 = "": dstT2 = ""
                    On Error Resume Next
                    srcT2 = sh.TextFrame2.TextRange.Text
                    dstT2 = peer.TextFrame2.TextRange.Text
                    On Error GoTo 0
                    If srcT2 <> dstT2 Then
                        If IsCalloutTemplate(srcT2) And Not IsCalloutTemplate(dstT2) Then
                            On Error Resume Next: sh.TextFrame2.TextRange.Text = dstT2: On Error GoTo 0
                        Else
                            On Error Resume Next: peer.TextFrame2.TextRange.Text = srcT2: On Error GoTo 0
                        End If
                    End If
                End If
            End If
        ElseIf Left(nm, Len(PREFIX_BADGE)) = PREFIX_BADGE Then
            Set peer = Nothing
            On Error Resume Next: Set peer = wsDst.Shapes(nm): On Error GoTo 0
            If Not peer Is Nothing Then
                Dim srcB As String, dstB As String
                srcB = "": dstB = ""
                On Error Resume Next
                srcB = sh.TextFrame2.TextRange.Text
                dstB = peer.TextFrame2.TextRange.Text
                On Error GoTo 0
                If Trim(srcB) <> Trim(dstB) Then
                    Dim winB As String
                    If Len(Trim(srcB)) > 0 And Len(Trim(dstB)) = 0 Then
                        winB = srcB
                    ElseIf Len(Trim(dstB)) > 0 And Len(Trim(srcB)) = 0 Then
                        winB = dstB
                    Else
                        winB = srcB                  ' src 우선 (편집 진원지)
                    End If
                    On Error Resume Next
                    sh.TextFrame2.TextRange.Text = winB
                    peer.TextFrame2.TextRange.Text = winB
                    On Error GoTo 0
                    Dim facNm As String: facNm = Mid(sh.Name, Len(PREFIX_BADGE) + 1)
                    MetaUpdateBadgeNo facNm, Trim(winB)
                End If
            End If
        End If
    Next sh
End Sub

' 텍스트를 첫 줄 / 나머지로 분리. vbCr / vbLf / vbCrLf 모두 처리.
Public Sub SplitFirstLine(t As String, ByRef first As String, ByRef rest As String)
    Dim s As String: s = Replace(t, vbCrLf, vbCr)
    s = Replace(s, vbLf, vbCr)
    Dim p As Long: p = InStr(s, vbCr)
    If p <= 0 Then
        first = s: rest = ""
    Else
        first = Left(s, p - 1)
        rest = Mid(s, p + 1)
    End If
End Sub

' 설명선이 아직 기본 템플릿(미수정) 인지 — 공백·줄바꿈 제거 후 비교.
'   케이블은 spec 이 자동 채워진 가변 값이라 정확 일치 안 됨 → 「선로ID」 로 시작하고
'   「거리」 로 끝나는 패턴이면 사용자가 ID·거리 둘 다 미수정 = 템플릿.
'   owner 2026-06-08 (8-84): 「케이블ID」 → 「선로ID」 (네트웍구성도와 라벨 통일). legacy 도 같이 인식.
Public Function IsCalloutTemplate(t As String) As Boolean
    Dim s As String
    s = Replace(Replace(Replace(t, vbCr, ""), vbLf, ""), " ", "")
    If Len(s) = 0 Then IsCalloutTemplate = True: Exit Function
    ' 새 패턴 — 「함체명을입력하세요」 substring 있으면 템플릿 (범례명 자동 입력 후에도 인식)
    If InStr(s, "함체명을입력하세요") > 0 Then IsCalloutTemplate = True: Exit Function
    If s = "ID함체명구분" Then IsCalloutTemplate = True: Exit Function                ' 레거시 — 「을 입력하세요」 전
    If Left(s, Len("선로ID")) = "선로ID" And Right(s, Len("거리")) = "거리" Then
        IsCalloutTemplate = True: Exit Function
    End If
    ' 레거시 — 「케이블ID」 로 시작하는 옛 라벨
    If Left(s, Len("케이블ID")) = "케이블ID" And Right(s, Len("거리")) = "거리" Then
        IsCalloutTemplate = True: Exit Function
    End If
    ' 레거시 — 이전 「케이블ID/규격/구간」 그대로인 경우
    If s = "케이블ID규격구간" Or s = "선로ID규격구간" Then IsCalloutTemplate = True
End Function

Public Sub SyncShapeProps(src As Shape, dst As Shape)
    On Error Resume Next
    dst.Fill.ForeColor.RGB = src.Fill.ForeColor.RGB
    dst.Line.ForeColor.RGB = src.Line.ForeColor.RGB
    dst.Line.Weight = src.Line.Weight
    dst.TextFrame2.TextRange.Text = src.TextFrame2.TextRange.Text
    dst.TextFrame2.TextRange.Font.Name = src.TextFrame2.TextRange.Font.Name
    dst.TextFrame2.TextRange.Font.Size = src.TextFrame2.TextRange.Font.Size
    dst.TextFrame2.TextRange.Font.Bold = src.TextFrame2.TextRange.Font.Bold
    dst.TextFrame2.TextRange.Font.Fill.ForeColor.RGB = _
        src.TextFrame2.TextRange.Font.Fill.ForeColor.RGB
    On Error GoTo 0
End Sub

' ============================================================================
'  8.5 라벨 마스터 (자주 쓰는 라벨)
'      _라벨_마스터 시트 (kind, label, created_at). 시트 없으면 자동 생성 + 시드 채움.
'      범례 등록·「라벨로 그리기」 가 이 목록을 노출 → 직접 입력 부담 제거.
' ============================================================================
Public Sub EnsureLabelMaster()
    EnsureSheet SHEET_META_LABEL, xlSheetVeryHidden, Array("kind", "label", "created_at")
    Dim ws As Worksheet
    On Error Resume Next
    Set ws = ThisWorkbook.Worksheets(SHEET_META_LABEL)
    On Error GoTo 0
    If ws Is Nothing Then Exit Sub

    Dim last As Long
    last = ws.Cells(ws.Rows.Count, 1).End(xlUp).Row
    If last < 2 Then 라벨_마스터_시드_채우기 ws
End Sub

' 비어있을 때 한 번 — 5 분류 (설치장소·시설물·접속함체·RN·광케이블) 시드. 빌더와 동일 목록.
'   사용자가 직접 편집(`라벨_관리`) 또는 「범례 등록」 의 직접 입력으로 추가/삭제 가능.
Public Sub 라벨_마스터_시드_채우기(ws As Worksheet)
    Dim seedKinds As Variant, seedLabels As Variant
    seedKinds = Array( _
        "facility", "facility", "facility", "facility", _
        "facility", "facility", "facility", _
        "station", "station", "station", _
        "closure", "closure", _
        "rn", "rn", _
        "cable", "cable", "cable", "cable", "cable", "cable", "cable", "cable", "cable", "cable")
    seedLabels = Array( _
        "종합국사", "집중국사", "가입자국사", "간이국사", _
        "맨홀", "가입자시설", "설치장소", _
        "통신주", "MOFD", "OJC", _
        "접속함체", "분기함체", _
        "RN장비", "광MUX", _
        "1C", "2C", "12C", "24C", "36C", "72C", "144C", "288C", "576C", "드랍")

    Dim r As Long: r = 2
    Dim i As Long
    For i = LBound(seedKinds) To UBound(seedKinds)
        ws.Cells(r, 1).Value = seedKinds(i)
        ws.Cells(r, 2).Value = seedLabels(i)
        ws.Cells(r, 3).Value = Now
        r = r + 1
    Next i
End Sub

' 5 분류 (설치장소/시설물/접속함체/RN/광케이블) ↔ 한국어·번호·prefix·OnAction 매핑 헬퍼.
'   - "facility" / "station" / "closure" / "rn" / "cable"  (메타 시트 kind 값)
'   - 1 / 2 / 3 / 4                            (InputBox 번호)
'   - 설치장소·시설물·접속함체·RN·광케이블             (사용자 표시 라벨)
'   - 그리기 분기: cable 만 BeginCableDraw, 나머지는 BeginFacilityDraw

Public Function KindToKor(kind As String) As String
    Select Case kind
        Case "facility": KindToKor = "설치장소"   ' owner 요구 — 기존 「시설물」 라벨 → 「설치장소」
        Case "station":  KindToKor = "시설물"     ' owner 요구 — 신규 종류 「시설물」 (예: 통신주·전봇대·MOFD 등)
        Case "closure":  KindToKor = "접속함체"
        Case "rn":       KindToKor = "RN"
        Case "cable":    KindToKor = "광케이블"
        Case Else:       KindToKor = kind
    End Select
End Function

' owner 요구 — 5 종류 순서: 설치장소(1) / 시설물(2) / 접속함체(3) / RN(4) / 광케이블(5)
Public Function ParseKindChoice(num As String) As String
    Select Case Trim(num)
        Case "1": ParseKindChoice = "facility"
        Case "2": ParseKindChoice = "station"
        Case "3": ParseKindChoice = "closure"
        Case "4": ParseKindChoice = "rn"
        Case "5": ParseKindChoice = "cable"
        Case Else: ParseKindChoice = ""
    End Select
End Function

Public Function IsCableKind(kind As String) As Boolean
    IsCableKind = (kind = "cable")
End Function

' InputBox 본문에 넣을 종류 메뉴 (5 옵션 — owner 순서).
Public Function KindMenuText() As String
    KindMenuText = "  1 — 설치장소 (국사·맨홀·가입자시설·설치장소)" & vbLf & _
                   "  2 — 시설물 (통신주·MOFD·기타)" & vbLf & _
                   "  3 — 접속함체 (접속함체·분기함체)" & vbLf & _
                   "  4 — RN (RN장비·광MUX)" & vbLf & _
                   "  5 — 광케이블 (1C ~ 576C·드랍)"
End Function

' kind="facility"/"cable" 의 라벨 배열 반환. 시트 없으면 빈 배열.
Public Function GetLabelMaster(kind As String) As Variant
    EnsureLabelMaster
    Dim ws As Worksheet
    On Error Resume Next
    Set ws = ThisWorkbook.Worksheets(SHEET_META_LABEL)
    On Error GoTo 0
    Dim arr() As String: ReDim arr(-1 To -1)  ' empty 0-length
    If ws Is Nothing Then GetLabelMaster = Array(): Exit Function

    Dim last As Long: last = ws.Cells(ws.Rows.Count, 1).End(xlUp).Row
    Dim hits As Collection: Set hits = New Collection
    Dim r As Long, k As String, lbl As String
    For r = 2 To last
        k = CStr(ws.Cells(r, 1).Value)
        lbl = CStr(ws.Cells(r, 2).Value)
        If k = kind And Len(lbl) > 0 Then hits.Add lbl
    Next r

    If hits.Count = 0 Then GetLabelMaster = Array(): Exit Function
    Dim out() As String: ReDim out(0 To hits.Count - 1)
    Dim i As Long
    For i = 1 To hits.Count
        out(i - 1) = hits(i)
    Next i
    GetLabelMaster = out
End Function

' 라벨 마스터에 추가 — 같은 (kind,label) 이 이미 있으면 무시.
Public Sub AppendLabelMaster(kind As String, label As String)
    If Len(Trim(label)) = 0 Then Exit Sub
    EnsureLabelMaster
    Dim ws As Worksheet: Set ws = ThisWorkbook.Worksheets(SHEET_META_LABEL)
    Dim last As Long: last = ws.Cells(ws.Rows.Count, 1).End(xlUp).Row
    Dim r As Long
    For r = 2 To last
        If CStr(ws.Cells(r, 1).Value) = kind And _
           CStr(ws.Cells(r, 2).Value) = Trim(label) Then Exit Sub   ' 중복
    Next r
    Dim nr As Long: nr = last + 1
    ws.Cells(nr, 1).Value = kind
    ws.Cells(nr, 2).Value = Trim(label)
    ws.Cells(nr, 3).Value = Now
End Sub

' 라벨 마스터의 한 라벨 이름 수정 + 이미 그 라벨로 등록된 범례 메타·현재 선택 라벨도 함께 갱신.
'   콤보박스 옵션은 UpdateFloatingPanelPosition 호출 시 자동 새로고침 → 새 라벨로 노출.
Public Sub EditLabelMaster(kind As String, oldLabel As String, newLabel As String)
    If Len(Trim(newLabel)) = 0 Then Exit Sub
    Dim oldL As String: oldL = Trim(oldLabel)
    Dim newL As String: newL = Trim(newLabel)
    If oldL = newL Then Exit Sub

    EnsureLabelMaster

    ' 1) 라벨 마스터의 (kind, oldLabel) → newLabel
    Dim wsMaster As Worksheet: Set wsMaster = ThisWorkbook.Worksheets(SHEET_META_LABEL)
    Dim last As Long: last = wsMaster.Cells(wsMaster.Rows.Count, 1).End(xlUp).Row
    Dim r As Long
    For r = 2 To last
        If CStr(wsMaster.Cells(r, 1).Value) = kind And CStr(wsMaster.Cells(r, 2).Value) = oldL Then
            wsMaster.Cells(r, 2).Value = newL
            Exit For
        End If
    Next r

    ' 2) _범례 메타의 label 컬럼 (이미 그 라벨로 등록된 범례) — 같이 갱신
    Dim wsLeg As Worksheet
    On Error Resume Next
    Set wsLeg = ThisWorkbook.Worksheets(SHEET_META_LEG)
    On Error GoTo 0
    If Not wsLeg Is Nothing Then
        Dim lastLeg As Long: lastLeg = wsLeg.Cells(wsLeg.Rows.Count, 1).End(xlUp).Row
        For r = 2 To lastLeg
            If CStr(wsLeg.Cells(r, 2).Value) = kind And CStr(wsLeg.Cells(r, 3).Value) = oldL Then
                wsLeg.Cells(r, 3).Value = newL
            End If
        Next r
    End If

    ' 3) 카테고리별 현재 선택 라벨도 옛 라벨이면 새 라벨로 동기 (콤보 선택 유지)
    If GetSelectedLabel(kind) = oldL Then SetSelectedLabel kind, newL
    If g_drawLabel = oldL Then g_drawLabel = newL
End Sub

' 라벨 마스터에서 삭제. 등록된 범례가 그 라벨을 쓰고 있어도 영향 없음
'   (등록된 범례 메타는 그대로 — 마스터는 「자주 쓰는 라벨」 자동완성 목록일 뿐).
Public Sub RemoveLabelMaster(kind As String, label As String)
    If Len(Trim(label)) = 0 Then Exit Sub
    Dim ws As Worksheet
    On Error Resume Next
    Set ws = ThisWorkbook.Worksheets(SHEET_META_LABEL)
    On Error GoTo 0
    If ws Is Nothing Then Exit Sub

    Dim last As Long: last = ws.Cells(ws.Rows.Count, 1).End(xlUp).Row
    Dim r As Long
    For r = last To 2 Step -1
        If CStr(ws.Cells(r, 1).Value) = kind And _
           CStr(ws.Cells(r, 2).Value) = Trim(label) Then ws.Rows(r).Delete
    Next r
End Sub

' 라벨 목록을 「번호. 라벨」 줄로 묶어 InputBox 본문에 쓰기 좋은 문자열로 반환.
Public Function FormatLabelMenu(labels As Variant) As String
    Dim s As String, i As Long
    If IsArray(labels) Then
        For i = LBound(labels) To UBound(labels)
            s = s & "  " & (i - LBound(labels) + 1) & ". " & labels(i) & vbLf
        Next i
    End If
    FormatLabelMenu = s
End Function

' 사용자가 라벨 InputBox 에 입력한 값(번호 또는 직접 입력) 을 실제 라벨로 변환.
'   - 1~N: labels(N-1)
'   - 0 또는 숫자 아님: 입력 텍스트 자체 (Trim)
'   - 빈 칸: ""
Public Function ResolveLabelInput(ans As String, labels As Variant) As String
    Dim s As String: s = Trim(ans)
    If Len(s) = 0 Then ResolveLabelInput = "": Exit Function

    ' 숫자만으로 구성된 경우 → 메뉴 번호 선택
    If IsNumeric(s) Then
        Dim n As Long: n = CLng(s)
        If IsArray(labels) Then
            If n >= 1 And n <= (UBound(labels) - LBound(labels) + 1) Then
                ResolveLabelInput = CStr(labels(LBound(labels) + n - 1))
                Exit Function
            End If
        End If
        If n = 0 Then ResolveLabelInput = "": Exit Function   ' 0 = 직접 입력 신호 (별도 InputBox)
    End If
    ResolveLabelInput = s
End Function

' ============================================================================
'  9. 메타 헬퍼
' ============================================================================
Public Sub EnsureSheet(name As String, state As Long, Optional headers As Variant)
    Dim ws As Worksheet: Set ws = Nothing
    On Error Resume Next
    Set ws = ThisWorkbook.Worksheets(name)
    On Error GoTo 0

    Dim i As Long
    If ws Is Nothing Then
        Set ws = ThisWorkbook.Worksheets.Add(After:= _
                    ThisWorkbook.Worksheets(ThisWorkbook.Worksheets.Count))
        ws.Name = name
        If Not IsMissing(headers) Then
            For i = LBound(headers) To UBound(headers)
                ws.Cells(1, i - LBound(headers) + 1).Value = headers(i)
                ws.Cells(1, i - LBound(headers) + 1).Font.Bold = True
            Next i
        End If
    ElseIf Not IsMissing(headers) Then
        ' 기존 시트 — 헤더 부족하면 채움 (옛 시트 마이그. 기존 헤더는 덮어쓰지 않음)
        For i = LBound(headers) To UBound(headers)
            Dim col As Long: col = i - LBound(headers) + 1
            If Len(Trim(CStr(ws.Cells(1, col).Value))) = 0 Then
                ws.Cells(1, col).Value = headers(i)
                ws.Cells(1, col).Font.Bold = True
            End If
        Next i
    End If
    On Error Resume Next
    ws.Visible = state
    On Error GoTo 0
End Sub

Public Sub AppendMetaRow(sheetName As String, row As Variant)
    Dim ws As Worksheet
    On Error Resume Next
    ws.Visible = xlSheetVisible
    Set ws = ThisWorkbook.Worksheets(sheetName)
    On Error GoTo 0
    If ws Is Nothing Then Exit Sub

    Dim r As Long: r = ws.Cells(ws.Rows.Count, 1).End(xlUp).Row + 1
    Dim i As Long
    For i = LBound(row) To UBound(row)
        ws.Cells(r, i - LBound(row) + 1).Value = row(i)
    Next i
End Sub

Public Function MetaFindRow(sheetName As String, keyCol As Long, keyVal As String) As Variant
    Dim ws As Worksheet
    On Error Resume Next
    Set ws = ThisWorkbook.Worksheets(sheetName)
    On Error GoTo 0
    If ws Is Nothing Then Exit Function

    Dim last As Long: last = ws.Cells(ws.Rows.Count, keyCol).End(xlUp).Row
    Dim ncols As Long: ncols = ws.Cells(1, ws.Columns.Count).End(xlToLeft).Column
    Dim r As Long, c As Long
    For r = 2 To last
        If CStr(ws.Cells(r, keyCol).Value) = keyVal Then
            Dim arr() As Variant: ReDim arr(1 To ncols)
            For c = 1 To ncols
                arr(c) = ws.Cells(r, c).Value
            Next c
            MetaFindRow = arr
            Exit Function
        End If
    Next r
End Function

Public Sub MetaDeleteRow(sheetName As String, keyCol As Long, keyVal As String)
    Dim ws As Worksheet
    On Error Resume Next
    Set ws = ThisWorkbook.Worksheets(sheetName)
    On Error GoTo 0
    If ws Is Nothing Then Exit Sub

    Dim last As Long: last = ws.Cells(ws.Rows.Count, keyCol).End(xlUp).Row
    Dim r As Long
    For r = last To 2 Step -1
        If CStr(ws.Cells(r, keyCol).Value) = keyVal Then ws.Rows(r).Delete
    Next r
End Sub

Public Function MetaLookupLabel(legendShapeName As String) As String
    Dim row As Variant: row = MetaFindRow(SHEET_META_LEG, 1, legendShapeName)
    If Not IsEmpty(row) Then MetaLookupLabel = CStr(row(3))
End Function

' 범례 도형의 kind ("facility"/"closure"/"rn"/"cable") 메타 조회.
Public Function MetaLookupKind(legendShapeName As String) As String
    Dim row As Variant: row = MetaFindRow(SHEET_META_LEG, 1, legendShapeName)
    If Not IsEmpty(row) Then MetaLookupKind = CStr(row(2))
End Function

Public Function MetaLookupName(metaSheet As String, facId As String) As String
    Dim row As Variant: row = MetaFindRow(metaSheet, 1, facId)
    If Not IsEmpty(row) Then
        MetaLookupName = CStr(row(3))
    Else
        MetaLookupName = "(미지정)"
    End If
End Function

Public Function FindRelatedCables(facId As String) As Variant
    Dim ws As Worksheet
    On Error Resume Next
    Set ws = ThisWorkbook.Worksheets(SHEET_META_CBL)
    On Error GoTo 0
    If ws Is Nothing Then Exit Function

    Dim last As Long: last = ws.Cells(ws.Rows.Count, 1).End(xlUp).Row
    Dim hits As Collection: Set hits = New Collection
    Dim r As Long
    For r = 2 To last
        If CStr(ws.Cells(r, 2).Value) = facId Or CStr(ws.Cells(r, 3).Value) = facId Then
            hits.Add CStr(ws.Cells(r, 1).Value)
        End If
    Next r
    If hits.Count = 0 Then Exit Function

    Dim arr() As String: ReDim arr(0 To hits.Count - 1)
    Dim i As Long
    For i = 1 To hits.Count
        arr(i - 1) = hits(i)
    Next i
    FindRelatedCables = arr
End Function

Public Function CountRelatedCables(facId As String) As Long
    Dim arr As Variant: arr = FindRelatedCables(facId)
    If IsEmpty(arr) Then
        CountRelatedCables = 0
    Else
        CountRelatedCables = UBound(arr) - LBound(arr) + 1
    End If
End Function

' ============================================================================
'  10. ID 생성 (8자리 hex)
' ============================================================================
Public Function NewId8() As String
    Static seed As Long
    seed = seed + 1
    Randomize Timer + seed
    Dim s As String, i As Long, k As Long
    For i = 1 To 8
        k = Int(Rnd() * 16)
        s = s & Mid("0123456789abcdef", k + 1, 1)
    Next i
    NewId8 = s
End Function

' ============================================================================
'  11. 도형 선택 헬퍼
' ============================================================================
' Group 안전한 Glow 제거 — 그룹이면 자식 도형까지 재귀.
'   .Glow.Radius = 0 가 Group 의 일부 환경에서 오류를 던지는 케이스 대응.
'   On Error Resume Next 가 호출자 쪽에 깔려 있어야 함 (이 함수 자체도 한 번 더 보호).
Public Sub ClearGlowDeep(shp As Shape)
    On Error Resume Next
    shp.Glow.Radius = 0
    If shp.Type = 6 Then    ' msoGroup
        Dim i As Long
        For i = 1 To shp.GroupItems.Count
            ClearGlowDeep shp.GroupItems(i)
        Next i
    End If
    On Error GoTo 0
End Sub

Public Function GetSelectedShape(ws As Worksheet) As Shape
    Dim shp As Shape
    On Error Resume Next
    Set shp = ws.Shapes(Selection.Name)
    On Error GoTo 0
    If Not shp Is Nothing Then Set GetSelectedShape = shp: Exit Function

    ' ShapeRange / DrawingObjects 분기
    On Error Resume Next
    If Selection.Count >= 1 Then Set shp = ws.Shapes(Selection(1).Name)
    On Error GoTo 0
    If Not shp Is Nothing Then Set GetSelectedShape = shp
End Function

' ============================================================================
'  12. 이벤트 핸들러 주입
' ============================================================================
Public Sub InjectEventHandlers()
    Dim vbProj As Object
    On Error GoTo Trust
    Set vbProj = ThisWorkbook.VBProject
    On Error GoTo 0

    ' 한국어 Excel: ThisWorkbook → "현재_통합_문서" 로 localized
    Dim cm As Object
    On Error Resume Next
    Set cm = vbProj.VBComponents(ThisWorkbook.CodeName).CodeModule
    If cm Is Nothing Then Set cm = vbProj.VBComponents("ThisWorkbook").CodeModule
    If cm Is Nothing Then Set cm = vbProj.VBComponents("현재_통합_문서").CodeModule
    On Error GoTo 0

    If cm Is Nothing Then Err.Raise 9999, , "ThisWorkbook 코드 모듈 접근 실패"

    ' 기존 핸들러 강제 제거 (옛 버전의 모듈명 prefix 코드 정리)
    DeleteProc cm, "Workbook_SheetSelectionChange"
    DeleteProc cm, "Workbook_SheetBeforeRightClick"
    DeleteProc cm, "Workbook_SheetActivate"
    DeleteProc cm, "Workbook_Open"
    DeleteProc cm, "Workbook_BeforeClose"

    ' 새 코드 (모듈명 prefix 없이 함수명만 — 한글 함수명 호환)
    Dim code As String
    code = "Private Sub Workbook_SheetSelectionChange(ByVal Sh As Object, ByVal Target As Range)" & vbCrLf & _
           "    On Error Resume Next" & vbCrLf & _
           "    If Sh.Name = """ & SHEET_ADMIN & """ Or Sh.Name = """ & SHEET_NETWORK & """ Then 시트_셀_클릭 Target" & vbCrLf & _
           "    If Sh.Name = """ & SHEET_PAIR_TOOL & """ Then 선번연결_도구_셀선택 Target" & vbCrLf & _
           "End Sub" & vbCrLf & vbCrLf & _
           "Private Sub Workbook_SheetBeforeRightClick(ByVal Sh As Object, ByVal Target As Range, Cancel As Boolean)" & vbCrLf & _
           "    On Error Resume Next" & vbCrLf & _
           "    If Sh.Name = """ & SHEET_ADMIN & """ Then" & vbCrLf & _
           "        If 시트_우클릭_처리() Then Cancel = True" & vbCrLf & _
           "    End If" & vbCrLf & _
           "End Sub" & vbCrLf & vbCrLf & _
           "Private Sub Workbook_SheetActivate(ByVal Sh As Object)" & vbCrLf & _
           "    On Error Resume Next" & vbCrLf & _
           "    시트_활성화 Sh" & vbCrLf & _
           "End Sub" & vbCrLf & vbCrLf & _
           "Private Sub Workbook_Open()" & vbCrLf & _
           "    On Error Resume Next" & vbCrLf & _
           "    만료_검사" & vbCrLf & _
           "    리본_등록" & vbCrLf & _
           "End Sub" & vbCrLf & vbCrLf & _
           "Private Sub Workbook_BeforeClose(Cancel As Boolean)" & vbCrLf & _
           "    On Error Resume Next" & vbCrLf & _
           "    리본_제거" & vbCrLf & _
           "End Sub" & vbCrLf
    cm.AddFromString code

    Application.OnKey "{ESC}"                       ' ESC 가로채지 않음 — 엑셀 네이티브로 십자 그리기 취소(불필요한 추가 도형 방지). 안내막대는 다음 셀 클릭 시 닫힘
    Application.OnKey "{DELETE}", "도형_삭제키"   ' Delete 키 = 선택 시설물·케이블 삭제 (셀이면 기본 동작)
    Exit Sub

Trust:
    Dim manualCode As String
    manualCode = "Private Sub Workbook_SheetSelectionChange(ByVal Sh As Object, ByVal Target As Range)" & vbCrLf & _
                 "    On Error Resume Next" & vbCrLf & _
                 "    If Sh.Name = """ & SHEET_ADMIN & """ Or Sh.Name = """ & SHEET_NETWORK & """ Then AdminMapDesigner.시트_셀_클릭 Target" & vbCrLf & _
                 "    If Sh.Name = """ & SHEET_PAIR_TOOL & """ Then AdminMapDesigner.선번연결_도구_셀선택 Target" & vbCrLf & _
                 "End Sub" & vbCrLf & vbCrLf & _
                 "Private Sub Workbook_SheetBeforeRightClick(ByVal Sh As Object, ByVal Target As Range, Cancel As Boolean)" & vbCrLf & _
                 "    On Error Resume Next" & vbCrLf & _
                 "    If Sh.Name = """ & SHEET_ADMIN & """ Then" & vbCrLf & _
                 "        If AdminMapDesigner.시트_우클릭_처리() Then Cancel = True" & vbCrLf & _
                 "    End If" & vbCrLf & _
                 "End Sub" & vbCrLf & vbCrLf & _
                 "Private Sub Workbook_SheetActivate(ByVal Sh As Object)" & vbCrLf & _
                 "    On Error Resume Next" & vbCrLf & _
                 "    AdminMapDesigner.시트_활성화 Sh" & vbCrLf & _
                 "End Sub"

    MsgBox "이벤트 핸들러 자동 주입 실패 (VBA 프로젝트 개체 모델 액세스 미신뢰)." & vbLf & vbLf & _
           "[자동 해결]" & vbLf & _
           "  Excel 옵션 → 보안 센터 → 보안 센터 설정 → 매크로 설정" & vbLf & _
           "  → 「VBA 프로젝트 개체 모델 액세스 신뢰」 체크 → 「이벤트_재주입」 실행" & vbLf & vbLf & _
           "[수동 해결]" & vbLf & _
           "  Alt+F11 → 좌측 트리에서 ThisWorkbook 더블클릭 → 다음 코드 붙여넣기:" & vbLf & vbLf & _
           manualCode, vbExclamation, "이벤트 핸들러 주입 실패"

    ' 수동 추가 코드 클립보드 복사 시도 (DataObject 안 됨 → 별도 안내)
    Application.OnKey "{ESC}"                       ' ESC 가로채지 않음 — 엑셀 네이티브로 십자 그리기 취소(불필요한 추가 도형 방지). 안내막대는 다음 셀 클릭 시 닫힘
    Application.OnKey "{DELETE}", "도형_삭제키"   ' Delete 키 = 선택 시설물·케이블 삭제 (셀이면 기본 동작)
End Sub


Public Function CheckEventHandlerStatus() As String
    On Error GoTo NoAccess
    Dim vbProj As Object: Set vbProj = ThisWorkbook.VBProject
    On Error GoTo 0

    Dim cm As Object
    On Error Resume Next
    Set cm = vbProj.VBComponents(ThisWorkbook.CodeName).CodeModule
    If cm Is Nothing Then Set cm = vbProj.VBComponents("ThisWorkbook").CodeModule
    If cm Is Nothing Then Set cm = vbProj.VBComponents("현재_통합_문서").CodeModule
    On Error GoTo 0

    If cm Is Nothing Then
        CheckEventHandlerStatus = "ThisWorkbook 모듈 접근 불가"
        Exit Function
    End If

    Dim n As Long: n = 0
    On Error Resume Next
    n = cm.ProcStartLine("Workbook_SheetSelectionChange", 0)
    On Error GoTo 0

    If n > 0 Then
        CheckEventHandlerStatus = "✓ 정상 (SelectionChange 핸들러 등록됨)"
    Else
        CheckEventHandlerStatus = "✗ 누락 (「이벤트_재주입」 매크로 실행 필요)"
    End If
    Exit Function

NoAccess:
    CheckEventHandlerStatus = "✗ VBA 프로젝트 액세스 차단 — Excel 옵션에서 신뢰 활성 필요"
End Function


Public Sub 이벤트_재주입()
    InjectEventHandlers
    Dim status As String: status = CheckEventHandlerStatus()
    MsgBox "이벤트 핸들러 재주입 시도 완료." & vbLf & vbLf & _
           "결과: " & status & vbLf & vbLf & _
           "「✓ 정상」 이면 행정도 시트의 빈 셀 클릭 → 시설물 배치가 작동합니다.", _
           vbInformation, "이벤트 재주입"
End Sub

Public Sub DeleteProc(cm As Object, procName As String)
    On Error Resume Next
    Dim sLine As Long: sLine = cm.ProcStartLine(procName, 0)
    If sLine > 0 Then
        Dim cnt As Long: cnt = cm.ProcCountLines(procName, 0)
        cm.DeleteLines sLine, cnt
    End If
    On Error GoTo 0
End Sub

' ============================================================
'  owner 2026-06-06 (8-32): 코어 추적 도구 — Phase 1 (직접 하이라이트)
'  owner 2026-06-07 (8-44): 선번박스 단독 선택 mode 추가 (박스 alt 의 fac=/cbl= 자동 추출)
'  owner 2026-06-07 (8-45): 방향 prompt 제거 — 항상 전체 구간 (양쪽 끝까지) 추적
' ============================================================
'   진입 (둘 중 어느 쪽이든 OK):
'     (a) 시설물 1 개 + 케이블 1 개 선택 (Ctrl + 클릭)
'     (b) 선번이 들어있는 선번박스 1 개 선택
'   동작:
'     1. selection 종류 자동 감지 (박스 단독 → fac=/cbl= 추출, 그 외 → 시설물·케이블 추출)
'     2. 박스 mode + 박스 코어 ≤ 4 → 박스의 코어 전체 자동 추적 (InputBox skip)
'        박스 mode + 박스 코어 > 4 → InputBox (박스 코어를 default 채워둠, OK 만 누르면 전체)
'        기존 mode → InputBox 로 코어 번호 입력
'     3. 추적 경로 빌드 (splice 따라 양쪽 끝까지)
'     4. 케이블 + 페어 박스 직접 하이라이트 (원본 스타일 백업 후 강조색)
'     5. MsgBox 로 경로 텍스트 + 해제/유지 선택
'     6. 해제 → 원본 스타일 복원 / 유지 → 다음 추적까지 유지
'
'   RN/RN1/시설물측 박스 제외 (Q4 결정).
'   Phase 2 (클론 뷰) 는 후속.
'   ※ 전역 변수 g_track_originalStyles·g_track_persistMode 는 파일 상단 선언 섹션에 (~line 205) 정의됨.

Public Sub 코어_추적_도구()
    Dim ws As Worksheet: Set ws = ActiveSheet
    If ws Is Nothing Or ws.Name <> SHEET_NETWORK Then
        MsgBox "네트웍구성도에서 다음 중 하나를 선택한 뒤 실행하세요." & vbLf & _
               "  (a) 시설물 1 개 + 케이블 1 개" & vbLf & _
               "  (b) 선번이 들어있는 선번박스 1 개", vbExclamation, "코어 추적"
        Exit Sub
    End If

    ' selection 추출 — 박스 단독 또는 시설물+케이블 둘 다 수용
    Dim selR As Object: Set selR = Nothing
    On Error Resume Next
    Set selR = Selection.ShapeRange
    On Error GoTo 0
    If selR Is Nothing Then
        MsgBox "다음 중 하나를 선택하세요:" & vbLf & _
               "  (a) 시설물 1 개 + 케이블 1 개" & vbLf & _
               "  (b) 선번이 들어있는 선번박스 1 개", vbExclamation, "코어 추적"
        Exit Sub
    End If

    Dim facShp As Shape: Set facShp = Nothing
    Dim cblShp As Shape: Set cblShp = Nothing
    Dim boxOnly As Shape: Set boxOnly = Nothing
    Dim boxModeCores As Variant: boxModeCores = Empty
    Dim i As Long

    ' owner 2026-06-07 (8-44): 선번박스 1 개만 단독 선택 = 박스 mode (fac=/cbl= 자동 추출).
    '   기존 시설물+케이블 selection 흐름과 병행 — 어느 쪽이든 트레이스 가능.
    If selR.Count = 1 Then
        Dim onlyN As String: onlyN = selR(1).Name
        If Left(onlyN, Len(PREFIX_PAIRBOX)) = PREFIX_PAIRBOX Then
            Set boxOnly = selR(1)
        End If
    End If

    If Not boxOnly Is Nothing Then
        ' 박스 mode — alt 에서 fac=, cbl= 추출 + 박스 텍스트에서 코어 파싱
        Dim boxAlt As String: boxAlt = ""
        On Error Resume Next: boxAlt = boxOnly.AlternativeText: On Error GoTo 0
        Dim facId As String: facId = AltParseField(boxAlt, "fac=")
        Dim cblId As String: cblId = AltParseField(boxAlt, "cbl=")
        If Len(facId) = 0 Or Len(cblId) = 0 Then
            MsgBox "이 선번박스는 fac=/cbl= 정보가 없어 추적 시작점으로 쓸 수 없습니다." & vbLf & _
                   "시설물 + 케이블 직접 선택으로 시도하세요.", vbExclamation, "코어 추적"
            Exit Sub
        End If
        On Error Resume Next: Set facShp = ws.Shapes(facId): On Error GoTo 0
        On Error Resume Next: Set cblShp = ws.Shapes(cblId): On Error GoTo 0
        If facShp Is Nothing Or cblShp Is Nothing Then
            MsgBox "박스가 가리키는 시설물 또는 케이블이 시트에 없습니다.", vbExclamation, "코어 추적"
            Exit Sub
        End If
        ' 박스 텍스트에서 코어 추출 (선번이 비어있으면 추적 불가)
        Dim boxText As String: boxText = ""
        On Error Resume Next: boxText = boxOnly.TextFrame2.TextRange.Text: On Error GoTo 0
        선번_파싱 boxText, boxModeCores
        If Not IsArray(boxModeCores) Then
            MsgBox "이 선번박스에 추적 가능한 코어 번호가 없습니다." & vbLf & _
                   "(박스 텍스트: " & boxText & ")", vbExclamation, "코어 추적"
            Exit Sub
        End If
    Else
        ' 기존 mode — selection 에서 시설물 + 케이블 추출
        For i = 1 To selR.Count
            Dim shN As String: shN = selR(i).Name
            If Left(shN, Len(PREFIX_FAC)) = PREFIX_FAC Then
                If facShp Is Nothing Then Set facShp = selR(i)
            ElseIf Left(shN, Len(PREFIX_CBL)) = PREFIX_CBL Then
                If cblShp Is Nothing Then Set cblShp = selR(i)
            End If
        Next i

        If facShp Is Nothing Or cblShp Is Nothing Then
            MsgBox "다음 중 하나로 선택하세요:" & vbLf & vbLf & _
                   "  (a) 시설물 1 개 + 케이블 1 개 (Ctrl + 클릭)" & vbLf & _
                   "  (b) 선번이 들어있는 선번박스 1 개", vbExclamation, "코어 추적"
            Exit Sub
        End If
    End If

    ' 케이블이 이 시설물에 연결됐는지 검증 (양 mode 공통)
    Dim ends As Variant: ends = 코어_추적_케이블끝시설물(cblShp, ws)
    If Not IsArray(ends) Then
        MsgBox "케이블의 양 끝 시설물을 식별할 수 없습니다.", vbExclamation, "코어 추적"
        Exit Sub
    End If
    If ends(0) <> facShp.Name And ends(1) <> facShp.Name Then
        MsgBox "선택한 케이블은 선택한 시설물에 연결되지 않습니다.", vbExclamation, "코어 추적"
        Exit Sub
    End If

    ' 코어 번호 결정
    '   - 박스 mode + 박스 코어 ≤ 4 → 박스의 코어 전체 자동 추적
    '   - 박스 mode + 박스 코어 > 4 → InputBox (박스 코어 default 채워둠, OK 만 누르면 전체)
    '   - 기존 mode → 기존 InputBox
    Dim coreStr As String
    Dim coresArr As Variant: coresArr = Empty
    If Not boxOnly Is Nothing Then
        Dim boxCoreCount As Long: boxCoreCount = UBound(boxModeCores) - LBound(boxModeCores) + 1
        If boxCoreCount <= 4 Then
            coresArr = boxModeCores
        Else
            Dim boxCoresStr As String: boxCoresStr = ""
            Dim jj As Long
            For jj = LBound(boxModeCores) To UBound(boxModeCores)
                If Len(boxCoresStr) > 0 Then boxCoresStr = boxCoresStr & ","
                boxCoresStr = boxCoresStr & CStr(boxModeCores(jj))
            Next jj
            coreStr = InputBox("박스에 코어 " & boxCoreCount & " 개 (" & boxCoresStr & ")." & vbLf & _
                                "추적할 코어 번호 (단일: 5 / 복수: 1,3-5,7) — OK 만 누르면 전체:", _
                                "코어 추적 — 코어 선택", boxCoresStr)
            If Len(Trim(coreStr)) = 0 Then Exit Sub
            선번_파싱 coreStr, coresArr
            If Not IsArray(coresArr) Then
                MsgBox "유효한 코어 번호를 입력하세요." & vbLf & "예: 5  또는  1,3-5,7", vbExclamation, "코어 추적"
                Exit Sub
            End If
        End If
    Else
        coreStr = InputBox("추적할 코어 번호 (단일: 5 / 복수: 1,3-5,7)", "코어 추적 — 코어 번호", "")
        If Len(Trim(coreStr)) = 0 Then Exit Sub
        선번_파싱 coreStr, coresArr
        If Not IsArray(coresArr) Then
            MsgBox "유효한 코어 번호를 입력하세요." & vbLf & "예: 5  또는  1,3-5,7", vbExclamation, "코어 추적"
            Exit Sub
        End If
    End If
    Dim coreCount As Long: coreCount = UBound(coresArr) - LBound(coresArr) + 1

    ' owner 2026-06-07 (8-41): 복수 코어 입력 시 오름차순 정렬 → 배지 stack 순서 일관성.
    Dim sortI As Long, sortJ As Long, sortTmp As Long
    For sortI = LBound(coresArr) To UBound(coresArr) - 1
        For sortJ = sortI + 1 To UBound(coresArr)
            If CLng(coresArr(sortI)) > CLng(coresArr(sortJ)) Then
                sortTmp = CLng(coresArr(sortI))
                coresArr(sortI) = coresArr(sortJ)
                coresArr(sortJ) = sortTmp
            End If
        Next sortJ
    Next sortI
    If coreCount > 20 Then
        Dim warn As VbMsgBoxResult
        warn = MsgBox(coreCount & " 개 코어를 추적합니다 (느릴 수 있음). 계속 진행할까요?", _
                      vbOKCancel + vbQuestion, "코어 추적 — 다수 코어 경고")
        If warn <> vbOK Then Exit Sub
    End If

    ' owner 2026-06-07 (8-45): 항상 전체 구간 추적 (양쪽 끝까지). 방향 선택 prompt 제거.
    Dim direction As Long: direction = 2

    ' 기존 하이라이트 해제 (유지 모드 아니면)
    If Not g_track_persistMode Then
        코어_추적_해제
    End If

    ' 각 코어별 추적 + 하이라이트 적용 (코어 인덱스마다 badge 텍스트 색 다름)
    Dim summary As String: summary = "추적 결과 (" & coreCount & " 코어):" & vbLf & vbLf
    Dim totalSegs As Long: totalSegs = 0
    ' owner 2026-06-06 (8-38) → 2026-06-07 (8-43) → (8-50): 박스→배지 도형 컬렉션.
    '   module-level g_track_badgeShapes 로 승격 — 트레이스 간 누적해 같은 박스 재방문 시 직전 배지와 안 겹침.
    '   해제·지우기 시 RemoveAll.
    If g_track_badgeShapes Is Nothing Then Set g_track_badgeShapes = CreateObject("Scripting.Dictionary")

    ' owner 2026-06-07 (8-47): 직전 트레이스가 유지된 상태면 색상 인덱스를 이어 받음 (RED→ORANGE→GREEN…).
    '   유지 모드 OFF 거나 첫 트레이스면 0 부터.
    Dim baseColorOffset As Long: baseColorOffset = 0
    If g_track_persistMode Then baseColorOffset = g_track_colorOffset

    ' owner 2026-06-08 (8-80): 트레이스 코어 ≤4 → 박스 위 배지 세로 1줄 + 박스 양옆 endpoint 시설물 배지.
    Dim verticalMode As Boolean: verticalMode = (coreCount <= 4)
    If verticalMode Then
        If g_track_endpointBoxes Is Nothing Then Set g_track_endpointBoxes = CreateObject("Scripting.Dictionary")
        ' 유지 모드 OFF 면 직전 endpoint 배지 dedup 도 클린 (해제 함수가 도형은 이미 지움)
        If Not g_track_persistMode Then g_track_endpointBoxes.RemoveAll
        ' owner 2026-06-08 (8-100): endpoint 캐시는 이 trace 안에서만 공유 — 매 trace 시작 시 무조건 리셋.
        '   persist mode 일 때도 이전 trace 의 endpoint 가 다른 pair box 추적에 잘못 적용되는 것 방지.
        g_track_lastWstFacId = ""
        g_track_lastEstFacId = ""
    End If

    Dim coreIdx As Long
    For coreIdx = LBound(coresArr) To UBound(coresArr)
        Dim coreN As Long: coreN = CLng(coresArr(coreIdx))
        Dim relIdx As Long: relIdx = coreIdx - LBound(coresArr) + baseColorOffset
        Dim path As Collection: Set path = 코어_추적_경로빌드(facShp.Name, cblShp.Name, coreN, direction, ws)
        If Not path Is Nothing And path.Count > 0 Then
            코어_추적_하이라이트적용 path, ws, relIdx, g_track_badgeShapes, verticalMode
            summary = summary & "  • 코어 " & coreN & " — segments " & path.Count
            ' 색상 미리보기 — 9 종 cycle
            summary = summary & "  (" & 코어_추적_색상이름(relIdx) & ")" & vbLf
            totalSegs = totalSegs + path.Count
        Else
            summary = summary & "  • 코어 " & coreN & " — 경로 없음" & vbLf
        End If
    Next coreIdx
    summary = summary & vbLf & "총 segment: " & totalSegs

    ' owner 2026-06-07 (8-47): 다음 트레이스가 이어 받을 색상 인덱스 갱신.
    g_track_colorOffset = baseColorOffset + coreCount

    ' owner 2026-06-07 (8-46): 결과 MsgBox 제거 — 자동 「유지 모드」 ON (다음 추적까지 유지).
    '   summary 는 StatusBar 로 1 줄 표시 (추적 코어 수 + 총 segment).
    '   해제는 리본 「추적 지우기」 또는 다음 추적 시작 시 (유지 모드 OFF + 자동 해제) 로.
    g_track_persistMode = True
    Application.StatusBar = "코어 추적 완료 — " & coreCount & " 코어 / 총 segment " & totalSegs & _
                            ". 「추적 지우기」 로 해제 (다음 추적까지 유지)."
End Sub

' 케이블의 양 끝 시설물 — 끝점 좌표에 가장 가까운 facility 2개 반환.
Public Function 코어_추적_케이블끝시설물(cblShp As Shape, ws As Worksheet) As Variant
    코어_추적_케이블끝시설물 = Empty
    If cblShp Is Nothing Or ws Is Nothing Then Exit Function
    Dim ax As Double, ay As Double, bx As Double, by As Double
    ax = 0: ay = 0: bx = 0: by = 0
    On Error Resume Next: GetLineEndpoints cblShp, ax, ay, bx, by: On Error GoTo 0

    Dim facA As String, facB As String
    facA = "": facB = ""
    Dim minDistA As Double: minDistA = 1E+30
    Dim minDistB As Double: minDistB = 1E+30
    Dim sh As Shape
    For Each sh In ws.Shapes
        If Left(sh.Name, Len(PREFIX_FAC)) = PREFIX_FAC Then
            Dim fcx As Double, fcy As Double
            fcx = sh.Left + sh.Width / 2
            fcy = sh.Top + sh.Height / 2
            Dim dA As Double, dB As Double
            dA = (ax - fcx) * (ax - fcx) + (ay - fcy) * (ay - fcy)
            dB = (bx - fcx) * (bx - fcx) + (by - fcy) * (by - fcy)
            If dA < minDistA Then minDistA = dA: facA = sh.Name
            If dB < minDistB Then minDistB = dB: facB = sh.Name
        End If
    Next sh

    If Len(facA) > 0 And Len(facB) > 0 Then
        Dim ret(0 To 1) As String
        ret(0) = facA: ret(1) = facB
        코어_추적_케이블끝시설물 = ret
    End If
End Function

' 특정 시설물에서 (cableId, coreN) 의 splice 매핑 찾기.
'   반환: Array(otherCableName, otherCore) 또는 Empty.
Public Function 코어_추적_매핑찾기(facId As String, cableId As String, coreN As Long, ws As Worksheet) As Variant
    코어_추적_매핑찾기 = Empty
    Dim facTag As String: facTag = "fac=" & facId
    Dim cblTag As String: cblTag = "cbl=" & cableId

    Dim sh As Shape, alt As String
    For Each sh In ws.Shapes
        If Left(sh.Name, Len(PREFIX_PAIRARROW)) = PREFIX_PAIRARROW Then
            alt = "": On Error Resume Next: alt = sh.AlternativeText: On Error GoTo 0
            If InStr(alt, "box1=") > 0 And InStr(alt, "box2=") > 0 Then
                Dim b1Nm As String, b2Nm As String
                b1Nm = AltParseField(alt, "box1=")
                b2Nm = AltParseField(alt, "box2=")
                Dim b1S As Shape, b2S As Shape
                Set b1S = Nothing: Set b2S = Nothing
                On Error Resume Next
                Set b1S = ws.Shapes(b1Nm): Set b2S = ws.Shapes(b2Nm)
                On Error GoTo 0
                If Not b1S Is Nothing And Not b2S Is Nothing Then
                    Dim b1A As String, b2A As String
                    b1A = "": b2A = ""
                    On Error Resume Next
                    b1A = b1S.AlternativeText: b2A = b2S.AlternativeText
                    On Error GoTo 0

                    ' RN 박스 제외 (Q4)
                    If InStr(b1A, "|rn=") = 0 And InStr(b1A, "rn=") <> 1 And _
                       InStr(b2A, "|rn=") = 0 And InStr(b2A, "rn=") <> 1 Then
                        ' 해당 facility 의 박스만
                        If InStr(b1A, facTag) > 0 And InStr(b2A, facTag) > 0 Then
                            ' cableId 박스 식별
                            Dim boxForCable As Shape, boxForOther As Shape
                            Dim otherCblName As String: otherCblName = ""
                            Set boxForCable = Nothing: Set boxForOther = Nothing
                            If InStr(b1A, cblTag) > 0 Then
                                Set boxForCable = b1S
                                Set boxForOther = b2S
                                otherCblName = AltParseField(b2A, "cbl=")
                            ElseIf InStr(b2A, cblTag) > 0 Then
                                Set boxForCable = b2S
                                Set boxForOther = b1S
                                otherCblName = AltParseField(b1A, "cbl=")
                            End If
                            If Not boxForCable Is Nothing Then
                                ' 시설물측 박스 (cbl=fac_) 제외 — cable-cable 만
                                If Left(otherCblName, Len(PREFIX_FAC)) <> PREFIX_FAC Then
                                    Dim txt1 As String, txt2 As String
                                    txt1 = "": txt2 = ""
                                    On Error Resume Next
                                    txt1 = boxForCable.TextFrame2.TextRange.Text
                                    txt2 = boxForOther.TextFrame2.TextRange.Text
                                    On Error GoTo 0
                                    Dim cores1 As Variant, cores2 As Variant
                                    cores1 = Empty: cores2 = Empty
                                    선번_파싱 txt1, cores1
                                    선번_파싱 txt2, cores2
                                    If IsArray(cores1) And IsArray(cores2) Then
                                        Dim ii As Long
                                        For ii = LBound(cores1) To UBound(cores1)
                                            If cores1(ii) = coreN Then
                                                Dim relPos As Long: relPos = ii - LBound(cores1)
                                                Dim targetIdx As Long: targetIdx = LBound(cores2) + relPos
                                                If targetIdx <= UBound(cores2) Then
                                                    Dim ret(0 To 1) As Variant
                                                    ret(0) = otherCblName
                                                    ret(1) = cores2(targetIdx)
                                                    코어_추적_매핑찾기 = ret
                                                    Exit Function
                                                End If
                                            End If
                                        Next ii
                                    End If
                                End If
                            End If
                        End If
                    End If
                End If
            End If
        End If
    Next sh
End Function

' 추적 경로 빌드 — 시작점에서 splice 따라가기.
'   path = Collection of Array(facId, cableId, coreN, role) where role = "incoming" or "outgoing"
'   direction: 1 = forward only, 2 = both directions (forward + backward)
Public Function 코어_추적_경로빌드(startFac As String, startCable As String, startCore As Long, _
                                      direction As Long, ws As Worksheet) As Collection
    Dim path As Collection: Set path = New Collection
    Dim visited As Object: Set visited = CreateObject("Scripting.Dictionary")

    ' Forward 추적
    코어_추적_forward path, visited, startFac, startCable, startCore, ws

    ' Backward 추적 (전체방향 only)
    If direction = 2 Then
        Dim cblShp As Shape: Set cblShp = Nothing
        On Error Resume Next: Set cblShp = ws.Shapes(startCable): On Error GoTo 0
        If Not cblShp Is Nothing Then
            Dim ends As Variant: ends = 코어_추적_케이블끝시설물(cblShp, ws)
            If IsArray(ends) Then
                Dim otherFac As String: otherFac = ""
                If ends(0) = startFac Then
                    otherFac = ends(1)
                ElseIf ends(1) = startFac Then
                    otherFac = ends(0)
                End If
                If Len(otherFac) > 0 And otherFac <> startFac Then
                    ' Forward 추적 from other end
                    Dim backPath As Collection: Set backPath = New Collection
                    Dim backVisited As Object: Set backVisited = CreateObject("Scripting.Dictionary")
                    ' visited 에 시작점 추가하지 않음 (이미 forward 가 처리)
                    코어_추적_forward backPath, backVisited, otherFac, startCable, startCore, ws
                    ' backPath 를 path 앞에 역순으로 prepend
                    Dim bi As Long
                    For bi = backPath.Count To 1 Step -1
                        path.Add backPath(bi), Before:=1
                    Next bi
                End If
            End If
        End If
    End If

    Set 코어_추적_경로빌드 = path
End Function

' Forward 추적 재귀 — 시설물에서 splice 따라 다음 시설물로.
Public Sub 코어_추적_forward(path As Collection, visited As Object, _
                                facId As String, cableId As String, coreN As Long, ws As Worksheet)
    Dim key As String: key = facId & "|" & cableId & "|" & coreN
    If visited.Exists(key) Then Exit Sub
    visited(key) = True

    ' incoming 노드 추가
    Dim segIn(0 To 3) As Variant
    segIn(0) = facId: segIn(1) = cableId: segIn(2) = coreN: segIn(3) = "incoming"
    path.Add segIn

    ' splice 매핑 찾기
    Dim mapping As Variant: mapping = 코어_추적_매핑찾기(facId, cableId, coreN, ws)
    If Not IsArray(mapping) Then Exit Sub      ' splice 없음 — 끝

    Dim otherCable As String: otherCable = CStr(mapping(0))
    Dim otherCore As Long: otherCore = CLng(mapping(1))

    ' outgoing 노드 추가
    Dim segOut(0 To 3) As Variant
    segOut(0) = facId: segOut(1) = otherCable: segOut(2) = otherCore: segOut(3) = "outgoing"
    path.Add segOut

    ' 다음 시설물 찾기
    Dim cblShp As Shape: Set cblShp = Nothing
    On Error Resume Next: Set cblShp = ws.Shapes(otherCable): On Error GoTo 0
    If cblShp Is Nothing Then Exit Sub

    Dim ends As Variant: ends = 코어_추적_케이블끝시설물(cblShp, ws)
    If Not IsArray(ends) Then Exit Sub

    Dim nextFac As String: nextFac = ""
    If ends(0) = facId Then
        nextFac = ends(1)
    ElseIf ends(1) = facId Then
        nextFac = ends(0)
    End If
    If Len(nextFac) = 0 Or nextFac = facId Then Exit Sub

    ' 재귀
    코어_추적_forward path, visited, nextFac, otherCable, otherCore, ws
End Sub

' 경로 텍스트 — MsgBox 표시용. 시설물 이름은 callout 의 텍스트로 (가독성)
Public Function 코어_추적_경로텍스트(path As Collection, ws As Worksheet) As String
    If path Is Nothing Or path.Count = 0 Then
        코어_추적_경로텍스트 = "경로 없음."
        Exit Function
    End If
    Dim s As String: s = "추적 경로:" & vbLf & vbLf
    Dim i As Long, lastFac As String: lastFac = ""
    For i = 1 To path.Count
        Dim seg As Variant: seg = path(i)
        Dim segFac As String: segFac = CStr(seg(0))
        Dim segCbl As String: segCbl = CStr(seg(1))
        Dim segCore As Long: segCore = CLng(seg(2))
        Dim segRole As String: segRole = CStr(seg(3))

        If segFac <> lastFac Then
            If Len(lastFac) > 0 Then s = s & vbLf
            s = s & "  [" & 코어_추적_시설물라벨(segFac, ws) & "]"
            lastFac = segFac
        End If
        Dim cblLbl As String: cblLbl = 코어_추적_케이블라벨(segCbl, ws)
        If segRole = "incoming" Then
            s = s & vbLf & "    ← " & cblLbl & " core " & segCore
        Else
            s = s & vbLf & "    → " & cblLbl & " core " & segCore
        End If
    Next i
    s = s & vbLf & vbLf & "총 segment: " & path.Count
    코어_추적_경로텍스트 = s
End Function

' 시설물 라벨 — callout text 또는 fallback shape name 끝 6자
Public Function 코어_추적_시설물라벨(facId As String, ws As Worksheet) As String
    Dim callout As Shape: Set callout = Nothing
    On Error Resume Next: Set callout = ws.Shapes(PREFIX_LABEL & facId): On Error GoTo 0
    If Not callout Is Nothing Then
        Dim t As String: t = ""
        On Error Resume Next: t = callout.TextFrame2.TextRange.Text: On Error GoTo 0
        t = Trim(Replace(Replace(t, vbCr, " "), vbLf, " "))
        If Len(t) > 0 Then
            코어_추적_시설물라벨 = t
            Exit Function
        End If
    End If
    코어_추적_시설물라벨 = Right(facId, 6)
End Function

' 케이블 라벨 — label shape text 또는 shape name 끝 6자
Public Function 코어_추적_케이블라벨(cblId As String, ws As Worksheet) As String
    Dim lbl As Shape: Set lbl = Nothing
    On Error Resume Next: Set lbl = ws.Shapes(PREFIX_LABEL & cblId): On Error GoTo 0
    If Not lbl Is Nothing Then
        Dim t As String: t = ""
        On Error Resume Next: t = lbl.TextFrame2.TextRange.Text: On Error GoTo 0
        t = Trim(Replace(Replace(t, vbCr, " "), vbLf, " "))
        If Len(t) > 0 Then
            코어_추적_케이블라벨 = t
            Exit Function
        End If
    End If
    코어_추적_케이블라벨 = Right(cblId, 6)
End Function

' 하이라이트 적용 — 원본 스타일 백업 + 강조색 설정.
'   케이블: 굵은 빨강 (line color RGB(220,38,38), weight 3)
'   페어 박스: 노랑 fill (RGB(254,240,138))
Public Sub 코어_추적_하이라이트적용(path As Collection, ws As Worksheet, Optional ByVal coreIdx As Long = 0, Optional sharedBadgeShapes As Object = Nothing, Optional ByVal verticalMode As Boolean = False)
    If g_track_originalStyles Is Nothing Then Set g_track_originalStyles = CreateObject("Scripting.Dictionary")

    Dim wasProt As Boolean: wasProt = ws.ProtectContents Or ws.ProtectDrawingObjects
    On Error Resume Next: ws.Unprotect: On Error GoTo 0

    ' owner 2026-06-06 (8-34): 색상 — 기존 범례 (빨강/청록/파랑/노랑) 와 무겹침.
    '   케이블 = owner 지정 RGB(60, 250, 50) 형광 그린.
    '   박스 = 라임 RGB(190, 242, 100) — 노랑 (callout) 과 구분.
    '   badge = 자홍 RGB(217, 70, 239) + 흰 텍스트 — 박스 lime 대비 명확.
    Dim HILITE_LINE_COLOR As Long: HILITE_LINE_COLOR = RGB(60, 250, 50)        ' 형광 그린 — 케이블 강조
    Const HILITE_LINE_WEIGHT As Single = 3#
    Dim HILITE_FILL_COLOR As Long: HILITE_FILL_COLOR = RGB(190, 242, 100)      ' 라임 — 박스 fill
    ' owner 2026-06-06 (8-35) → 2026-06-07 (8-39): badge 배경색을 코어마다 다르게 (텍스트 색 변경은 자홍 위 구분 어려움).
    '   coreIdx → 9 색 cycle (포화·진한 색). 텍스트는 흰색 통일.
    Dim BADGE_FILL_COLOR As Long: BADGE_FILL_COLOR = 코어_추적_배지배경색(coreIdx)
    Dim BADGE_TEXT_COLOR As Long: BADGE_TEXT_COLOR = RGB(255, 255, 255)

    Dim cblTouched As Object: Set cblTouched = CreateObject("Scripting.Dictionary")
    Dim boxTouched As Object: Set boxTouched = CreateObject("Scripting.Dictionary")

    ' 1) 케이블 하이라이트 (path 의 모든 cable)
    Dim i As Long
    For i = 1 To path.Count
        Dim seg As Variant: seg = path(i)
        Dim cblNm As String: cblNm = CStr(seg(1))
        If Not cblTouched.Exists(cblNm) Then
            cblTouched(cblNm) = True
            Dim cblShp As Shape: Set cblShp = Nothing
            On Error Resume Next: Set cblShp = ws.Shapes(cblNm): On Error GoTo 0
            If Not cblShp Is Nothing Then
                ' 원본 백업 (dict — 빠른 in-session 복원용)
                If Not g_track_originalStyles.Exists(cblNm) Then
                    Dim origLineColor As Long: origLineColor = 0
                    Dim origLineWeight As Single: origLineWeight = 1
                    On Error Resume Next
                    origLineColor = cblShp.Line.ForeColor.RGB
                    origLineWeight = cblShp.Line.Weight
                    On Error GoTo 0
                    g_track_originalStyles(cblNm) = "type=cable|lineColor=" & origLineColor & "|lineWeight=" & origLineWeight

                    ' owner 2026-06-07 (8-42): 영구 backup — Excel 재시작 후에도 복원 가능하게 cable 자체 alt 에 저장.
                    Dim cAlt As String: cAlt = ""
                    On Error Resume Next: cAlt = cblShp.AlternativeText: On Error GoTo 0
                    If InStr(cAlt, "_TRC_C=") = 0 Then
                        Dim sepC As String: sepC = ""
                        If Len(cAlt) > 0 Then sepC = "|"
                        On Error Resume Next
                        cblShp.AlternativeText = cAlt & sepC & "_TRC_C=" & origLineColor & "|_TRC_W=" & origLineWeight
                        On Error GoTo 0
                    End If
                End If
                ' 강조
                On Error Resume Next
                cblShp.Line.ForeColor.RGB = HILITE_LINE_COLOR
                cblShp.Line.Weight = HILITE_LINE_WEIGHT
                On Error GoTo 0
            End If
        End If
    Next i

    ' 2) 페어 박스 하이라이트 + 추적 코어 번호 badge
    '   - 박스 fill = 라임 (기존 + 색 변경)
    '   - badge = 박스 우상단에 작은 자홍 사각형 + 흰 텍스트로 추적 코어 번호 표시
    '     박스에 "1-12" 같은 범위가 있어도 어느 코어인지 한눈에 확인 가능 (owner 2026-06-06 8-34)
    '   - 같은 박스에 다른 코어로 트레이스 중복 시 badge 누적 (offset 으로 옆에 배치)
    ' owner 2026-06-06 (8-38) → 2026-06-07 (8-43): box → 배지 도형 컬렉션.
    '   각 박스마다 추가된 배지 이름을 컬렉션에 누적 → 새 배지 추가 시마다 그 박스의 모든 배지를 재배치
    '   (왼쪽=작은 코어, 행당 최대 3 개, 4 개 이상은 윗줄로 wrap).
    Dim boxBadgeShapes As Object
    If sharedBadgeShapes Is Nothing Then
        Set boxBadgeShapes = CreateObject("Scripting.Dictionary")
    Else
        Set boxBadgeShapes = sharedBadgeShapes
    End If
    For i = 1 To path.Count
        Dim seg2 As Variant: seg2 = path(i)
        Dim facId2 As String: facId2 = CStr(seg2(0))
        Dim cblId2 As String: cblId2 = CStr(seg2(1))
        Dim core2 As Long: core2 = CLng(seg2(2))
        Dim foundBox As Shape: Set foundBox = 코어_추적_박스찾기(facId2, cblId2, core2, ws)
        If Not foundBox Is Nothing Then
            ' 박스 fill 강조 (한 박스당 1회)
            If Not boxTouched.Exists(foundBox.Name) Then
                boxTouched(foundBox.Name) = True
                If Not g_track_originalStyles.Exists(foundBox.Name) Then
                    Dim origFillColor As Long: origFillColor = RGB(255, 255, 255)
                    On Error Resume Next
                    origFillColor = foundBox.Fill.ForeColor.RGB
                    On Error GoTo 0
                    g_track_originalStyles(foundBox.Name) = "type=box|fillColor=" & origFillColor

                    ' owner 2026-06-07 (8-42): 영구 backup — box 자체 alt 에 저장.
                    Dim bAlt As String: bAlt = ""
                    On Error Resume Next: bAlt = foundBox.AlternativeText: On Error GoTo 0
                    If InStr(bAlt, "_TRC_F=") = 0 Then
                        Dim sepB As String: sepB = ""
                        If Len(bAlt) > 0 Then sepB = "|"
                        On Error Resume Next
                        foundBox.AlternativeText = bAlt & sepB & "_TRC_F=" & origFillColor
                        On Error GoTo 0
                    End If
                End If
                On Error Resume Next
                foundBox.Fill.ForeColor.RGB = HILITE_FILL_COLOR
                On Error GoTo 0
            End If

            ' owner 2026-06-07 (8-43): 박스별 배지 컬렉션 (재배치용)
            Dim badgeColl As Collection
            If boxBadgeShapes.Exists(foundBox.Name) Then
                Set badgeColl = boxBadgeShapes(foundBox.Name)
            Else
                Set badgeColl = New Collection
                boxBadgeShapes.Add foundBox.Name, badgeColl
            End If

            ' owner 2026-06-07 (8-39): 배지 크기 확대 + 코어별 배경색.
            Const BADGE_W As Double = 26
            Const BADGE_H As Double = 18
            Const BADGE_OFFSET_X As Double = 24     ' 같은 행 옆으로 stack 간격
            Const BADGE_ROW_GAP As Double = 2       ' 행 간격
            ' owner 2026-06-08 (8-80): verticalMode 일 때 perRow=1 → 코어가 세로로 1줄씩 stack.
            '   trace 코어 ≤4 시 호출자가 verticalMode=True 로 호출.
            Dim BADGES_PER_ROW As Long
            If verticalMode Then
                BADGES_PER_ROW = 1
            Else
                BADGES_PER_ROW = 3                  ' 4 번째부터 윗줄로 wrap
            End If
            Dim badgeName As String: badgeName = "_track_badge_" & NewId8()
            Dim badge As Shape: Set badge = Nothing
            ' 임시 위치 — 바로 아래 재배치에서 정확한 좌표로 이동
            On Error Resume Next
            Set badge = ws.Shapes.AddShape(msoShapeRectangle, foundBox.Left, foundBox.Top - BADGE_H + 2, BADGE_W, BADGE_H)
            On Error GoTo 0
            If Not badge Is Nothing Then
                badge.Name = badgeName
                badge.OnAction = ""
                badge.Placement = 3
                On Error Resume Next
                badge.Fill.ForeColor.RGB = BADGE_FILL_COLOR
                ' owner 2026-06-07 (8-39): 흰 테두리 — 인접 코어 배지 간 구분 명확
                badge.Line.ForeColor.RGB = RGB(255, 255, 255)
                badge.Line.Weight = 0.75
                With badge.TextFrame2
                    .MarginLeft = 0.5: .MarginRight = 0.5: .MarginTop = 0.1: .MarginBottom = 0.1
                    .VerticalAnchor = msoAnchorMiddle
                    .WordWrap = msoFalse
                    .AutoSize = msoAutoSizeNone
                    .TextRange.Text = CStr(core2)
                    .TextRange.Font.Size = 11
                    .TextRange.Font.Bold = msoTrue
                    .TextRange.Font.Fill.ForeColor.RGB = BADGE_TEXT_COLOR
                    .TextRange.ParagraphFormat.Alignment = 2
                End With
                badge.ZOrder msoBringToFront
                On Error GoTo 0
                ' 해제 시 삭제용 marker (type=badge → 코어_추적_해제 가 도형 자체 삭제)
                g_track_originalStyles(badgeName) = "type=badge"

                ' 컬렉션 추가 후 그 박스 모든 배지 재배치 (왼쪽=작은 코어, 4 개 이상 윗줄로 wrap)
                badgeColl.Add badgeName
                코어_추적_배지_재배치 ws, foundBox, badgeColl, BADGE_W, BADGE_H, BADGE_OFFSET_X, BADGE_ROW_GAP, BADGES_PER_ROW
            End If
        End If
    Next i

    ' owner 2026-06-07 (8-39): 모든 배지를 최상위로 일괄 z-order — 다른 도형 (anchor·main·박스 등) 가리는 것 방지.
    코어_추적_배지_최상위유지 ws

    ' owner 2026-06-08 (8-80): 4 코어 이하일 때 박스 양옆에 east/west 끝 시설물 배지 추가.
    '   같은 박스에 중복 추가 안 함 (g_track_endpointBoxes dict 로 dedup).
    If verticalMode Then 코어_추적_endpoint배지_적용 path, ws

    If wasProt Then ApplySheetProtection ws
End Sub

' owner 2026-06-08 (8-80): 4 코어 이하 추적 모드에서 경로의 east/west 끝 시설물 배지를
'   이 경로가 거치는 모든 PAIRBOX 양옆에 청록 배지로 표시.
'   기존 배지색상 (BADGE_FILL_COLOR = RGB(102,255,255)) 사용 — 추적 배지 색과 구분.
'   해제는 코어_추적_해제 가 type=epbadge 도형 일괄 삭제.
'   owner 2026-06-08 (8-85): (1) path 양 끝에서 1-step 확장 — splice 없이 케이블로 이어진 시설물까지
'                            추적해 "마지막 케이블 끝쪽 시설물" 의 배지 표시. (2) 배지 위치를
'                            host box 양옆 → 추적 배지 양옆 (host box 위) 으로 변경.
Public Sub 코어_추적_endpoint배지_적용(path As Collection, ws As Worksheet)
    If path Is Nothing Then Exit Sub
    If path.Count = 0 Then Exit Sub
    If g_track_endpointBoxes Is Nothing Then Set g_track_endpointBoxes = CreateObject("Scripting.Dictionary")
    If g_track_originalStyles Is Nothing Then Set g_track_originalStyles = CreateObject("Scripting.Dictionary")

    ' owner 2026-06-08 (8-85): path 의 시설물 dict 만들기 — 확장 시 path 내부 시설물 회피.
    Dim pathFacs As Object: Set pathFacs = CreateObject("Scripting.Dictionary")
    Dim pi As Long
    For pi = 1 To path.Count
        Dim ps As Variant: ps = path(pi)
        pathFacs(CStr(ps(0))) = True
    Next pi

    ' owner 2026-06-08 (8-91→8-95): path 의 실제 TERMINAL 시설물 (splice 끊겨 trace stop 한 곳) 만 후보.
    '   각 "incoming" 세그먼트가 다음 세그먼트의 같은 facility 의 "outgoing" 으로 이어지지 않으면 terminal.
    '   정상 chain 은 backward terminal + forward terminal 정확히 2 개.
    '   pathFacs 전체 max-x 는 mid-chain 의 더 동쪽 시설물 (예: 트리에 의해 path 가 facility 5(중간)→facility 6(끝)
    '   순서이지만 facility 5 의 actual x 좌표가 더 큰 경우) 을 잘못 잡음. terminal 만 후보로 → mid-chain 제외.
    Dim terminals As Object: Set terminals = CreateObject("Scripting.Dictionary")
    Dim ti As Long
    For ti = 1 To path.Count
        Dim segCur As Variant: segCur = path(ti)
        Dim curFac As String: curFac = CStr(segCur(0))
        Dim curRole As String: curRole = CStr(segCur(3))
        If curRole = "incoming" Then
            Dim isTerm As Boolean: isTerm = True
            If ti < path.Count Then
                Dim segNext As Variant: segNext = path(ti + 1)
                If CStr(segNext(0)) = curFac And CStr(segNext(3)) = "outgoing" Then isTerm = False
            End If
            If isTerm Then terminals(curFac) = True
        End If
    Next ti

    ' owner 2026-06-08 (8-101): cascade 재설계 — path 의 진짜 terminal 우선, badge 필터 제거.
    '   문제: 이전 cascade 가 Phase 1 (terminals + badge 필터) 실패 시 Phase 2/3 가 pathFacs 전체에서
    '     geographic extreme 픽 → mid-chain 의 큰 x 시설물 (예: 1차RN/f4) 이 path 진짜 endpoint (RN장비/f5)
    '     대신 잘못 선택. f5 가 f4 보다 남쪽-약간서쪽이라 x 좌표가 더 작은 케이스.
    '   해결: terminals 가 2 개 이상이면 badge 무관하게 terminals 만으로 geographic 결정.
    '     badge text 가 비어도 endpoint 배지는 그 facility 위치 자체로 의미 있음.
    Dim wstFacId As String, estFacId As String
    Dim westmostCx As Double: westmostCx = 1E+30
    Dim eastmostCx As Double: eastmostCx = -1E+30

    ' Phase 1: terminals 우선 (badge 필터 없음 — terminal 은 path 의 진짜 끝)
    If terminals.Count >= 2 Then
        Dim kk As Variant
        For Each kk In terminals.Keys
            Dim facIdKK As String: facIdKK = CStr(kk)
            Dim shpKK As Shape: Set shpKK = Nothing
            On Error Resume Next: Set shpKK = ws.Shapes(facIdKK): On Error GoTo 0
            If Not shpKK Is Nothing Then
                Dim cxKK As Double: cxKK = shpKK.Left + shpKK.Width / 2
                If cxKK < westmostCx Then westmostCx = cxKK: wstFacId = facIdKK
                If cxKK > eastmostCx Then eastmostCx = cxKK: estFacId = facIdKK
            End If
        Next kk
    End If

    ' Phase 2: terminals < 2 또는 terminal 시설물 도형 없음 → pathFacs 폴백 (badge 필터 없음)
    If Len(wstFacId) = 0 Or Len(estFacId) = 0 Or wstFacId = estFacId Then
        westmostCx = 1E+30
        eastmostCx = -1E+30
        wstFacId = "": estFacId = ""
        Dim kk2 As Variant
        For Each kk2 In pathFacs.Keys
            Dim facIdKK2 As String: facIdKK2 = CStr(kk2)
            Dim shpKK2 As Shape: Set shpKK2 = Nothing
            On Error Resume Next: Set shpKK2 = ws.Shapes(facIdKK2): On Error GoTo 0
            If Not shpKK2 Is Nothing Then
                Dim cxKK2 As Double: cxKK2 = shpKK2.Left + shpKK2.Width / 2
                If cxKK2 < westmostCx Then westmostCx = cxKK2: wstFacId = facIdKK2
                If cxKK2 > eastmostCx Then eastmostCx = cxKK2: estFacId = facIdKK2
            End If
        Next kk2
    End If

    ' owner 2026-06-08 (8-102): 8-96 의도 복원 — terminal 의 badge text 가 비어있으면 path 따라
    '   안쪽 (trace 중심 방향) 으로 walk 해 badge 있는 facility 로 대체.
    '   wst (geographic west) 는 path 시작 (path(1)) 부터 진행 방향으로,
    '   est (geographic east) 는 path 끝 (path(path.Count)) 부터 역방향으로 첫 badge 있는 facility 까지.
    '   대체 위치가 wst==est 되면 원래 terminal 유지 (badge 빈 채).
    If Len(wstFacId) > 0 Then
        If Len(코어_추적_배지텍스트(ws, wstFacId)) = 0 Then
            Dim altWst As String: altWst = ""
            Dim pwi As Long
            For pwi = 1 To path.Count
                Dim segPwi As Variant: segPwi = path(pwi)
                Dim pwiFac As String: pwiFac = CStr(segPwi(0))
                If pwiFac <> estFacId And Len(코어_추적_배지텍스트(ws, pwiFac)) > 0 Then
                    altWst = pwiFac
                    Exit For
                End If
            Next pwi
            If Len(altWst) > 0 Then wstFacId = altWst
        End If
    End If
    If Len(estFacId) > 0 Then
        If Len(코어_추적_배지텍스트(ws, estFacId)) = 0 Then
            Dim altEst As String: altEst = ""
            Dim pwi2 As Long
            For pwi2 = path.Count To 1 Step -1
                Dim segPwi2 As Variant: segPwi2 = path(pwi2)
                Dim pwiFac2 As String: pwiFac2 = CStr(segPwi2(0))
                If pwiFac2 <> wstFacId And Len(코어_추적_배지텍스트(ws, pwiFac2)) > 0 Then
                    altEst = pwiFac2
                    Exit For
                End If
            Next pwi2
            If Len(altEst) > 0 Then estFacId = altEst
        End If
    End If
    ' owner 2026-06-08 (8-100): cascade 실패 시 fallback 우선순위
    '   1) globals (이 trace 의 직전 코어 endpoint) — 같은 chain 안 멀티코어 통일 (8-98 의도)
    '   2) single-facility path — stub core 자기 자신 표시 (8-99 의도)
    '   3) Exit Sub — 데이터 이상
    '   globals 는 코어_추적_도구 진입 시 매번 리셋 (8-100) → 다른 pair box trace 에 잘못 적용 안 됨.
    If Len(wstFacId) = 0 Or Len(estFacId) = 0 Or wstFacId = estFacId Then
        If Len(g_track_lastWstFacId) > 0 And Len(g_track_lastEstFacId) > 0 _
           And g_track_lastWstFacId <> g_track_lastEstFacId Then
            wstFacId = g_track_lastWstFacId
            estFacId = g_track_lastEstFacId
        ElseIf pathFacs.Count = 1 Then
            Dim ffOnly As Variant
            For Each ffOnly In pathFacs.Keys
                wstFacId = CStr(ffOnly)
                estFacId = CStr(ffOnly)
                Exit For
            Next ffOnly
        Else
            Exit Sub
        End If
    Else
        g_track_lastWstFacId = wstFacId          ' 다음 코어 호출 fallback 용 (같은 trace 안)
        g_track_lastEstFacId = estFacId
    End If

    Dim wstFac As Shape, estFac As Shape
    Set wstFac = Nothing: Set estFac = Nothing
    On Error Resume Next
    Set wstFac = ws.Shapes(wstFacId)
    Set estFac = ws.Shapes(estFacId)
    On Error GoTo 0
    If wstFac Is Nothing Or estFac Is Nothing Then Exit Sub

    ' owner 2026-06-08 (8-85→8-89): 양 끝에서 multi-step 확장 (케이블 따라 chain 끝까지) — 8-94 에서 제거.
    '   원인: 확장이 branch off-chain 시설물 (예: facility 5 → 7 via 미하이라이트 케이블) 까지 잡아버림.
    '   path 가 chain 전체를 커버하는 경우 8-91 pathFacs 지오 극단만으로 정확. path 가 splice gap 으로
    '   짧게 끝나는 8-85 케이스는 chain extension 못하지만, 그게 branch 잘못 잡는 것보다 안전.
    '   코어_추적_endpoint_확장 함수 자체는 유지 (필요 시 재활성).

    ' 양 끝 시설물의 배지 텍스트 — badge_<facId> shape 의 text. 없으면 빈 문자열
    Dim wstText As String, estText As String
    wstText = 코어_추적_배지텍스트(ws, wstFacId)
    estText = 코어_추적_배지텍스트(ws, estFacId)

    ' path 가 거치는 PAIRBOX 마다 양옆 배지 추가.
    ' owner 2026-06-08 (8-85): 위치를 추적 배지 (host box 위) 양옆으로 변경. 크기도 추적 배지에 맞춤.
    ' owner 2026-06-08 (8-92): 코어마다 별도 endpoint 배지 — dedup 키 box+core 로 변경.
    '   추적 배지가 코어마다 vertical stack 하므로 endpoint 배지도 같은 row 에 배치.
    '   row idx = 이 box 의 현재 trace 배지 수 - 1 (이 코어 추가 후 카운트). vertical mode 라 perRow=1.
    Const EP_W As Double = 26                      ' 추적 배지 (BADGE_W) 와 일치
    Const EP_H As Double = 18                      ' 추적 배지 (BADGE_H) 와 일치
    Const EP_GAP As Double = 3
    Const TRACE_BADGE_W As Double = 26
    Const TRACE_BADGE_H As Double = 18
    Const TRACE_BADGE_OFFSET As Double = 2         ' 코어_추적_배지_재배치 의 오프셋
    Const TRACE_ROW_GAP As Double = 2              ' 코어_추적_하이라이트적용 의 BADGE_ROW_GAP
    Const EP_TEXT_COLOR As Long = 0                ' 검정 텍스트 — 청록 배경에 명확
    Dim ii As Long
    For ii = 1 To path.Count
        Dim seg As Variant: seg = path(ii)
        Dim facId As String: facId = CStr(seg(0))
        Dim cblId As String: cblId = CStr(seg(1))
        Dim coreN As Long: coreN = CLng(seg(2))
        Dim hostBox As Shape: Set hostBox = 코어_추적_박스찾기(facId, cblId, coreN, ws)
        If Not hostBox Is Nothing Then
            ' owner 2026-06-08 (8-92): box+core 로 dedup — 같은 박스에 코어마다 별도 endpoint 쌍.
            Dim epKey As String: epKey = hostBox.Name & "|" & coreN
            If Not g_track_endpointBoxes.Exists(epKey) Then
                g_track_endpointBoxes(epKey) = True

                ' row idx = 이 박스에 이미 누적된 trace 배지 수 - 1 (이 코어가 마지막 추가됨).
                Dim rowIdx As Long: rowIdx = 0
                If Not g_track_badgeShapes Is Nothing Then
                    If g_track_badgeShapes.Exists(hostBox.Name) Then
                        rowIdx = g_track_badgeShapes(hostBox.Name).Count - 1
                        If rowIdx < 0 Then rowIdx = 0
                    End If
                End If

                ' 추적 배지 row N 좌표 — host box 우측 정렬 + 그 위 (BADGE_H + offset + rowIdx*(BADGE_H+gap))
                Dim traceFirstX As Double, traceRowY As Double
                traceFirstX = hostBox.Left + hostBox.Width - TRACE_BADGE_W + TRACE_BADGE_OFFSET
                traceRowY = hostBox.Top - TRACE_BADGE_H + TRACE_BADGE_OFFSET - rowIdx * (TRACE_BADGE_H + TRACE_ROW_GAP)

                ' west 배지 — 추적 배지의 좌측에
                Dim wstNm As String: wstNm = "_track_ep_" & NewId8()
                Dim wstShp As Shape: Set wstShp = Nothing
                On Error Resume Next
                Set wstShp = ws.Shapes.AddShape(msoShapeRectangle, _
                                                traceFirstX - EP_W - EP_GAP, traceRowY, EP_W, EP_H)
                On Error GoTo 0
                If Not wstShp Is Nothing Then
                    코어_추적_endpoint배지_스타일 wstShp, wstNm, wstText, EP_TEXT_COLOR
                    g_track_originalStyles(wstNm) = "type=epbadge"
                End If
                ' east 배지 — 추적 배지의 우측에
                Dim estNm As String: estNm = "_track_ep_" & NewId8()
                Dim estShp As Shape: Set estShp = Nothing
                On Error Resume Next
                Set estShp = ws.Shapes.AddShape(msoShapeRectangle, _
                                                traceFirstX + TRACE_BADGE_W + EP_GAP, traceRowY, EP_W, EP_H)
                On Error GoTo 0
                If Not estShp Is Nothing Then
                    코어_추적_endpoint배지_스타일 estShp, estNm, estText, EP_TEXT_COLOR
                    g_track_originalStyles(estNm) = "type=epbadge"
                End If
            End If
        End If
    Next ii
End Sub

' owner 2026-06-08 (8-85 → 8-89): facId 에서 케이블로 multi-step 이동해 가장 극단 방향 (eastward=True
'   면 동쪽, False 면 서쪽) 의 시설물을 반환. splice 끊겨 path 가 짧아도 케이블만 이어졌으면 chain 의
'   실제 끝까지 walk. visited dict + 단방향 (x 증가/감소 보장) 으로 다른 분기로 안 샘. 안전 한도 30 step.
Public Function 코어_추적_endpoint_확장(facId As String, ws As Worksheet, pathFacs As Object, ByVal eastward As Boolean) As String
    코어_추적_endpoint_확장 = facId
    If ws Is Nothing Or Len(facId) = 0 Then Exit Function

    Dim currentId As String: currentId = facId
    Dim currentShp As Shape: Set currentShp = Nothing
    On Error Resume Next: Set currentShp = ws.Shapes(facId): On Error GoTo 0
    If currentShp Is Nothing Then Exit Function
    Dim currentCx As Double: currentCx = currentShp.Left + currentShp.Width / 2

    Dim visited As Object: Set visited = CreateObject("Scripting.Dictionary")
    visited(currentId) = True

    Const MAX_STEPS As Long = 30
    Dim step As Long
    For step = 1 To MAX_STEPS
        ' 한 step: currentId 와 케이블로 직접 연결된 시설물 중 visited X · path X · 더 극단 방향 (
        '   eastward 면 더 동쪽, 아니면 더 서쪽) 인 후보 픽업.
        Dim nextId As String: nextId = ""
        Dim nextCx As Double: nextCx = currentCx

        Dim sh As Shape
        For Each sh In ws.Shapes
            If Left(sh.Name, Len(PREFIX_CBL)) = PREFIX_CBL Then
                Dim cblEnds As Variant: cblEnds = 코어_추적_케이블끝시설물(sh, ws)
                If IsArray(cblEnds) Then
                    Dim otherId As String: otherId = ""
                    If cblEnds(0) = currentId Then
                        otherId = CStr(cblEnds(1))
                    ElseIf cblEnds(1) = currentId Then
                        otherId = CStr(cblEnds(0))
                    End If
                    If Len(otherId) > 0 And otherId <> currentId Then
                        Dim skipFac As Boolean: skipFac = False
                        If visited.Exists(otherId) Then skipFac = True
                        If Not skipFac And Not pathFacs Is Nothing Then
                            If pathFacs.Exists(otherId) Then skipFac = True
                        End If
                        If Not skipFac Then
                            Dim otherShp As Shape: Set otherShp = Nothing
                            On Error Resume Next: Set otherShp = ws.Shapes(otherId): On Error GoTo 0
                            If Not otherShp Is Nothing Then
                                Dim otherCx As Double: otherCx = otherShp.Left + otherShp.Width / 2
                                If eastward Then
                                    If otherCx > nextCx Then nextCx = otherCx: nextId = otherId
                                Else
                                    If otherCx < nextCx Then nextCx = otherCx: nextId = otherId
                                End If
                            End If
                        End If
                    End If
                End If
            End If
        Next sh

        If Len(nextId) = 0 Then Exit For        ' 더 이상 극단 방향 확장 불가 — chain 끝
        visited(nextId) = True
        currentId = nextId
        currentCx = nextCx
    Next step

    코어_추적_endpoint_확장 = currentId
End Function

' 시설물 facId 의 배지 (badge_<facId>) 텍스트 반환. 없으면 빈 문자열.
Public Function 코어_추적_배지텍스트(ws As Worksheet, facId As String) As String
    코어_추적_배지텍스트 = ""
    Dim b As Shape: Set b = Nothing
    On Error Resume Next: Set b = ws.Shapes(PREFIX_BADGE & facId): On Error GoTo 0
    If b Is Nothing Then Exit Function
    Dim t As String: t = ""
    On Error Resume Next: t = b.TextFrame2.TextRange.Text: On Error GoTo 0
    코어_추적_배지텍스트 = Trim(t)
End Function

' endpoint 배지 공통 스타일 적용.
Public Sub 코어_추적_endpoint배지_스타일(shp As Shape, nm As String, txt As String, textColor As Long)
    On Error Resume Next
    shp.Name = nm
    shp.OnAction = ""
    shp.Placement = 3
    shp.Fill.ForeColor.RGB = BADGE_FILL_COLOR              ' 청록 RGB(102,255,255) — 기존 배지색
    shp.Line.ForeColor.RGB = RGB(0, 0, 0)
    shp.Line.Weight = 0.75
    With shp.TextFrame2
        .MarginLeft = 0.5: .MarginRight = 0.5: .MarginTop = 0.1: .MarginBottom = 0.1
        .VerticalAnchor = msoAnchorMiddle
        .WordWrap = msoFalse
        .AutoSize = msoAutoSizeNone
        .TextRange.Text = txt
        .TextRange.Font.Size = 11
        .TextRange.Font.Bold = msoTrue
        .TextRange.Font.Fill.ForeColor.RGB = textColor
        .TextRange.ParagraphFormat.Alignment = 2
    End With
    shp.ZOrder msoBringToFront
    On Error GoTo 0
End Sub

' owner 2026-06-07 (8-40): SelectionChange 등 박스 재정렬 후 호출 — 배지를 항상 최상위로 유지.
'   페어화살표_시설물페어_재정렬 가 box.ZOrder msoBringToFront 를 호출해 박스가 배지 위로 올라가는 문제 차단.
'   owner 2026-06-08 (8-89): endpoint 배지 (`_track_ep_*`) 도 같이 최상위로 — 케이블·시설물에 가려지지 않도록.
Public Sub 코어_추적_배지_최상위유지(ws As Worksheet)
    If ws Is Nothing Then Exit Sub
    Dim zShp As Shape
    For Each zShp In ws.Shapes
        If Left(zShp.Name, Len("_track_badge_")) = "_track_badge_" Then
            On Error Resume Next: zShp.ZOrder msoBringToFront: On Error GoTo 0
        ElseIf Left(zShp.Name, Len("_track_ep_")) = "_track_ep_" Then
            On Error Resume Next: zShp.ZOrder msoBringToFront: On Error GoTo 0
        End If
    Next zShp
End Sub

' owner 2026-06-07 (8-43): 박스 상단의 배지들을 일괄 재배치.
'   - 왼쪽 → 오른쪽 = 컬렉션 인덱스 작은 순 (코어가 오름차순 정렬된 상태로 들어오므로 작은 코어 좌측)
'   - 행당 perRow 개, 초과는 윗줄로 wrap (위로 자랄수록 박스에서 멀어짐)
'   - 각 행은 박스 우측 모서리에 우측 정렬 (마지막 슬롯이 박스 우상단)
Public Sub 코어_추적_배지_재배치(ws As Worksheet, box As Shape, badgeColl As Collection, _
                                   ByVal badgeW As Double, ByVal badgeH As Double, _
                                   ByVal offsetX As Double, ByVal rowGap As Double, _
                                   ByVal perRow As Long)
    If badgeColl Is Nothing Then Exit Sub
    Dim total As Long: total = badgeColl.Count
    If total = 0 Or perRow < 1 Then Exit Sub

    Dim ii As Long, idx As Long, row As Long, col As Long
    Dim remaining As Long, colsInRow As Long
    Dim shp As Shape
    For ii = 1 To total
        Set shp = Nothing
        On Error Resume Next
        Set shp = ws.Shapes(CStr(badgeColl(ii)))
        On Error GoTo 0
        If Not shp Is Nothing Then
            idx = ii - 1
            row = idx \ perRow
            col = idx Mod perRow
            remaining = total - row * perRow
            If remaining > perRow Then
                colsInRow = perRow
            Else
                colsInRow = remaining
            End If
            On Error Resume Next
            shp.Left = box.Left + box.Width - badgeW + 2 - (colsInRow - 1 - col) * offsetX
            shp.Top = box.Top - badgeH + 2 - row * (badgeH + rowGap)
            On Error GoTo 0
        End If
    Next ii
End Sub

' (facId, cableId, coreN) 에 해당하는 PAIRBOX 찾기 (코어가 텍스트에 포함된 박스)
Public Function 코어_추적_박스찾기(facId As String, cableId As String, coreN As Long, ws As Worksheet) As Shape
    Set 코어_추적_박스찾기 = Nothing
    Dim facTag As String: facTag = "fac=" & facId
    Dim cblTag As String: cblTag = "cbl=" & cableId
    Dim sh As Shape, alt As String
    For Each sh In ws.Shapes
        If Left(sh.Name, Len(PREFIX_PAIRBOX)) = PREFIX_PAIRBOX Then
            alt = "": On Error Resume Next: alt = sh.AlternativeText: On Error GoTo 0
            If InStr(alt, "|rn=") = 0 And InStr(alt, "rn=") <> 1 Then
                If InStr(alt, facTag) > 0 And InStr(alt, cblTag) > 0 Then
                    Dim txt As String: txt = ""
                    On Error Resume Next: txt = sh.TextFrame2.TextRange.Text: On Error GoTo 0
                    Dim nums As Variant: nums = Empty
                    선번_파싱 txt, nums
                    If IsArray(nums) Then
                        Dim ii As Long
                        For ii = LBound(nums) To UBound(nums)
                            If nums(ii) = coreN Then
                                Set 코어_추적_박스찾기 = sh
                                Exit Function
                            End If
                        Next ii
                    End If
                End If
            End If
        End If
    Next sh
End Function

' 하이라이트 해제 — 저장된 원본 스타일 복원.
Public Sub 코어_추적_해제()
    If g_track_originalStyles Is Nothing Then Exit Sub
    If g_track_originalStyles.Count = 0 Then Exit Sub

    Dim ws As Worksheet: Set ws = Nothing
    On Error Resume Next: Set ws = ThisWorkbook.Worksheets(SHEET_NETWORK): On Error GoTo 0
    If ws Is Nothing Then Exit Sub

    Dim wasProt As Boolean: wasProt = ws.ProtectContents Or ws.ProtectDrawingObjects
    On Error Resume Next: ws.Unprotect: On Error GoTo 0

    Dim key As Variant
    For Each key In g_track_originalStyles.Keys
        Dim styleStr As String: styleStr = CStr(g_track_originalStyles(key))
        Dim sh As Shape: Set sh = Nothing
        On Error Resume Next: Set sh = ws.Shapes(CStr(key)): On Error GoTo 0
        If Not sh Is Nothing Then
            Dim sType As String: sType = AltParseField(styleStr, "type=")
            If sType = "cable" Then
                Dim oC As String, oW As String
                oC = AltParseField(styleStr, "lineColor=")
                oW = AltParseField(styleStr, "lineWeight=")
                If IsNumeric(oC) Then
                    On Error Resume Next: sh.Line.ForeColor.RGB = CLng(oC): On Error GoTo 0
                End If
                If IsNumeric(oW) Then
                    On Error Resume Next: sh.Line.Weight = CSng(oW): On Error GoTo 0
                End If
                ' owner 2026-06-07 (8-42): cable 의 alt 영구 backup (_TRC_C, _TRC_W) 도 cleanup
                Dim cAltClean As String: cAltClean = ""
                On Error Resume Next: cAltClean = sh.AlternativeText: On Error GoTo 0
                cAltClean = 코어_추적_alt_키제거(cAltClean, "_TRC_C=")
                cAltClean = 코어_추적_alt_키제거(cAltClean, "_TRC_W=")
                On Error Resume Next: sh.AlternativeText = cAltClean: On Error GoTo 0
            ElseIf sType = "box" Then
                Dim oF As String: oF = AltParseField(styleStr, "fillColor=")
                If IsNumeric(oF) Then
                    On Error Resume Next: sh.Fill.ForeColor.RGB = CLng(oF): On Error GoTo 0
                End If
                ' owner 2026-06-07 (8-42): box 의 alt 영구 backup (_TRC_F) cleanup
                Dim bAltClean As String: bAltClean = ""
                On Error Resume Next: bAltClean = sh.AlternativeText: On Error GoTo 0
                bAltClean = 코어_추적_alt_키제거(bAltClean, "_TRC_F=")
                On Error Resume Next: sh.AlternativeText = bAltClean: On Error GoTo 0
            ElseIf sType = "badge" Then
                ' owner 2026-06-06 (8-34): 추적 코어 번호 badge — 도형 자체 삭제 (원본 없음, 신규 생성)
                On Error Resume Next: sh.Delete: On Error GoTo 0
            ElseIf sType = "epbadge" Then
                ' owner 2026-06-08 (8-80): endpoint 시설물 배지 — 도형 자체 삭제 (원본 없음)
                On Error Resume Next: sh.Delete: On Error GoTo 0
            End If
        End If
    Next key

    g_track_originalStyles.RemoveAll
    ' owner 2026-06-07 (8-47): 색상 인덱스도 같이 리셋 — 다음 트레이스가 RED 부터 시작.
    g_track_colorOffset = 0
    ' owner 2026-06-07 (8-50): 박스→배지 dict 도 같이 리셋 — 다음 트레이스가 col 0 부터 깨끗히.
    If Not g_track_badgeShapes Is Nothing Then g_track_badgeShapes.RemoveAll
    ' owner 2026-06-08 (8-80): endpoint 박스 dedup dict 도 같이 리셋.
    If Not g_track_endpointBoxes Is Nothing Then g_track_endpointBoxes.RemoveAll
    ' owner 2026-06-08 (8-98): endpoint fallback globals 초기화.
    g_track_lastWstFacId = ""
    g_track_lastEstFacId = ""

    If wasProt Then ApplySheetProtection ws
End Sub

' owner 2026-06-06 (8-35): 코어 추적 badge — 복수 코어 시 코어마다 다른 색.
'   2026-06-07 (8-39): 텍스트색만 변경하니 자홍 배경 위 밝은 색들이 비슷해 보여 owner 보고.
'                       배경색을 코어마다 다르게 + 텍스트 흰색 통일로 변경.
'   2026-06-07 (8-49): 인접 인덱스끼리 색상환에서 멀어지도록 재배치 (hue 순서 0→4→8→3→7→2→6→1→5).
'                       step-4 순열 — 9 와 서로소 → 모든 색 1 번씩 방문 + 인접 거리 최대화.
'   9 색 (포화·진한 색) cycle. 모두 흰 텍스트 보장.
Public Function 코어_추적_배지배경색(ByVal idx As Long) As Long
    Select Case (idx Mod 9 + 9) Mod 9       ' negative-safe mod
        Case 0: 코어_추적_배지배경색 = RGB(220, 38, 38)     ' 빨강
        Case 1: 코어_추적_배지배경색 = RGB(37, 99, 235)     ' 파랑
        Case 2: 코어_추적_배지배경색 = RGB(120, 53, 15)     ' 갈색
        Case 3: 코어_추적_배지배경색 = RGB(8, 145, 178)     ' 시안
        Case 4: 코어_추적_배지배경색 = RGB(219, 39, 119)    ' 핫핑크
        Case 5: 코어_추적_배지배경색 = RGB(22, 163, 74)     ' 녹
        Case 6: 코어_추적_배지배경색 = RGB(217, 70, 239)    ' 자홍
        Case 7: 코어_추적_배지배경색 = RGB(234, 88, 12)     ' 주황
        Case 8: 코어_추적_배지배경색 = RGB(124, 58, 237)    ' 보라
    End Select
End Function

' 색상명 — MsgBox summary 에 표시 (어느 코어가 어느 색인지 안내). 8-49 재배치와 동기.
Public Function 코어_추적_색상이름(ByVal idx As Long) As String
    Select Case (idx Mod 9 + 9) Mod 9
        Case 0: 코어_추적_색상이름 = "빨강"
        Case 1: 코어_추적_색상이름 = "파랑"
        Case 2: 코어_추적_색상이름 = "갈색"
        Case 3: 코어_추적_색상이름 = "시안"
        Case 4: 코어_추적_색상이름 = "핫핑크"
        Case 5: 코어_추적_색상이름 = "녹"
        Case 6: 코어_추적_색상이름 = "자홍"
        Case 7: 코어_추적_색상이름 = "주황"
        Case 8: 코어_추적_색상이름 = "보라"
    End Select
End Function

' owner 2026-06-06 (8-33): 추적 지우기 (사용자 호출 — 리본/패널 버튼) — 하이라이트 일괄 해제 + 유지 모드 OFF.
'   「추적 유지」 선택 후 다음 추적 진행 전에 기존 강조 모두 해제하고 싶을 때 사용.
'   - 저장된 원본 스타일 복원 (코어_추적_해제 호출)
'   - g_track_persistMode = False 강제
'   - StatusBar 로 해제 개수 보고
Public Sub 코어_추적_지우기()
    Dim cnt As Long: cnt = 0
    If Not g_track_originalStyles Is Nothing Then cnt = g_track_originalStyles.Count

    ' 정상 복원 (state 가 살아있는 경우)
    If cnt > 0 Then 코어_추적_해제

    ' owner 2026-06-06 (8-36): Excel 재시작 후 state 가 reset 됐어도 잔존 badge 강제 삭제.
    '   _track_badge_ prefix 의 도형은 추적 도구가 만든 임시 도형이므로 안전하게 일괄 삭제.
    Dim ws As Worksheet: Set ws = Nothing
    On Error Resume Next: Set ws = ThisWorkbook.Worksheets(SHEET_NETWORK): On Error GoTo 0
    Dim orphanBadges As Long: orphanBadges = 0
    Dim altRestoredCables As Long: altRestoredCables = 0
    Dim altRestoredBoxes As Long: altRestoredBoxes = 0
    If Not ws Is Nothing Then
        Dim wasProt As Boolean: wasProt = ws.ProtectContents Or ws.ProtectDrawingObjects
        On Error Resume Next: ws.Unprotect: On Error GoTo 0
        Dim i As Long
        For i = ws.Shapes.Count To 1 Step -1
            Dim shN As String: shN = ws.Shapes(i).Name
            ' (a) 잔존 badge 강제 삭제
            If Left(shN, Len("_track_badge_")) = "_track_badge_" Then
                On Error Resume Next
                ws.Shapes(i).Delete
                On Error GoTo 0
                orphanBadges = orphanBadges + 1
            Else
                ' owner 2026-06-07 (8-42): alt 영구 backup 기반 복원 (Excel 재시작 후에도 작동).
                Dim altShp As Shape: Set altShp = ws.Shapes(i)
                Dim altStr As String: altStr = ""
                On Error Resume Next: altStr = altShp.AlternativeText: On Error GoTo 0
                ' (b) cable 복원
                If Left(shN, Len(PREFIX_CBL)) = PREFIX_CBL Then
                    If InStr(altStr, "_TRC_C=") > 0 Then
                        Dim cC As String: cC = AltParseField(altStr, "_TRC_C=")
                        Dim cW As String: cW = AltParseField(altStr, "_TRC_W=")
                        If IsNumeric(cC) Then
                            On Error Resume Next: altShp.Line.ForeColor.RGB = CLng(cC): On Error GoTo 0
                        End If
                        If IsNumeric(cW) Then
                            On Error Resume Next: altShp.Line.Weight = CSng(cW): On Error GoTo 0
                        End If
                        Dim cleanAlt As String: cleanAlt = 코어_추적_alt_키제거(altStr, "_TRC_C=")
                        cleanAlt = 코어_추적_alt_키제거(cleanAlt, "_TRC_W=")
                        On Error Resume Next: altShp.AlternativeText = cleanAlt: On Error GoTo 0
                        altRestoredCables = altRestoredCables + 1
                    End If
                ElseIf Left(shN, Len(PREFIX_PAIRBOX)) = PREFIX_PAIRBOX Then
                    ' (c) box 복원
                    If InStr(altStr, "_TRC_F=") > 0 Then
                        Dim bF As String: bF = AltParseField(altStr, "_TRC_F=")
                        If IsNumeric(bF) Then
                            On Error Resume Next: altShp.Fill.ForeColor.RGB = CLng(bF): On Error GoTo 0
                        End If
                        Dim cleanAlt2 As String: cleanAlt2 = 코어_추적_alt_키제거(altStr, "_TRC_F=")
                        On Error Resume Next: altShp.AlternativeText = cleanAlt2: On Error GoTo 0
                        altRestoredBoxes = altRestoredBoxes + 1
                    End If
                End If
            End If
        Next i
        If wasProt Then ApplySheetProtection ws
    End If

    g_track_persistMode = False
    ' owner 2026-06-07 (8-47): 색상 인덱스도 같이 리셋 (다음 트레이스 RED 부터).
    g_track_colorOffset = 0
    ' owner 2026-06-07 (8-50): 박스→배지 dict 도 같이 리셋 — 해제 path 안 거치는 경우 (cnt=0) 안전망.
    If Not g_track_badgeShapes Is Nothing Then g_track_badgeShapes.RemoveAll

    Dim totalAlt As Long: totalAlt = altRestoredCables + altRestoredBoxes
    If cnt > 0 Or orphanBadges > 0 Or totalAlt > 0 Then
        Application.StatusBar = "코어 추적 해제 — 복원 " & cnt & " 개 + alt-복원 " & totalAlt & " 개 (cable " & altRestoredCables & ", box " & altRestoredBoxes & ") + 잔존 badge " & orphanBadges & " 개. 유지 모드 OFF."
    Else
        Application.StatusBar = "코어 추적 — 해제할 항목 없음 (이미 깨끗한 상태)."
    End If
End Sub

' owner 2026-06-07 (8-42): alt 의 「key=value|」 항목 제거. trailing 이면 「|key=value」 도 같이 제거.
Public Function 코어_추적_alt_키제거(alt As String, keyEq As String) As String
    Dim p As Long: p = InStr(alt, keyEq)
    If p = 0 Then
        코어_추적_alt_키제거 = alt
        Exit Function
    End If
    ' 선행 「|」 도 같이 잘라내기
    Dim s As Long
    If p > 1 Then
        If Mid(alt, p - 1, 1) = "|" Then s = p - 1 Else s = p
    Else
        s = p
    End If
    ' 끝 = 다음 「|」 위치 또는 문자열 끝
    Dim e As Long: e = InStr(p, alt, "|")
    If e = 0 Then e = Len(alt) + 1
    ' 끝의 「|」 가 leading separator 였으면 그 「|」 는 살림 (다음 키와 정상 연결)
    If e <= Len(alt) And s = p Then
        ' s 가 keyEq 시작 = leading 이고 e 의 「|」 는 다음 키 separator → 「|」 도 제거해야 함
        e = e + 1
    End If
    If s = 1 Then
        코어_추적_alt_키제거 = Mid(alt, e)
    Else
        코어_추적_alt_키제거 = Left(alt, s - 1) & Mid(alt, e)
    End If
End Function


' ============================================================
'  owner 2026-06-06 (8-37): 라이센스 시스템 (배포본 보호)
' ============================================================
'   목적: .xlsm 무단 사용 차단 + 유출자 추적
'   동작:
'     1) Workbook_Open 시 라이센스_검증 자동 호출
'     2) 검증 실패 (없음·만료·HW 불일치·변조) → 모든 시트 숨김 + 안내 splash 시트 표시
'     3) 검증 성공 → 시트 복원 → 정상 사용
'
'   사용자 도구:
'     - 라이센스_정보_보기  : 현재 라이센스 상태 확인
'     - 라이센스_내_HW_ID_보기 : 발급 요청 시 owner 에게 전달할 HW ID 확인
'
'   관리자 도구 (owner 전용):
'     - 라이센스_발급  : 새 사용자용 라이센스 + 배포본 SaveAs
'     - 라이센스_갱신  : 만료 임박/만료된 라이센스 연장
'
'   DEV 모드:
'     - CustomDocumentProperty "LicenseDevMode" = "true" 이면 검증 skip (master 파일용)
'     - 배포본 SaveAs 시 자동으로 DEV 모드 OFF
'
'   ⚠ VBA 프로젝트 암호: 반드시 별도 설정 (VBE → 도구 > VBAProject 속성 > 보호 탭)
'      코드의 SALT 가 노출되면 라이센스 우회 가능. 암호 설정으로 1차 차단 필수.
'   ※ 모든 Private Const 는 파일 상단 declarations 섹션 (~line 208) 에 정의됨 (VBA 규칙).

' Entry point — Workbook_Open 에서 호출.
Public Function 라이센스_검증() As Boolean
    라이센스_검증 = False
    On Error GoTo Failed

    ' DEV mode (owner master 파일)
    If 라이센스_DEV모드() Then
        라이센스_시트_표시
        라이센스_검증 = True
        Exit Function
    End If

    Dim user As String, issued As String, expires As String, hwid As String, storedHash As String
    user = 라이센스_속성_읽기(LICENSE_USER_PROP)
    issued = 라이센스_속성_읽기(LICENSE_ISSUED_PROP)
    expires = 라이센스_속성_읽기(LICENSE_EXPIRES_PROP)
    hwid = 라이센스_속성_읽기(LICENSE_HWID_PROP)
    storedHash = 라이센스_속성_읽기(LICENSE_HASH_PROP)

    If Len(user) = 0 Or Len(issued) = 0 Or Len(expires) = 0 Or Len(storedHash) = 0 Then
        라이센스_차단 "라이센스 정보가 없습니다. 관리자에게 발급 요청 바랍니다."
        Exit Function
    End If

    Dim computed As String: computed = 라이센스_해시_계산(user, issued, expires)
    If computed <> storedHash Then
        라이센스_차단 "라이센스 변조 감지. 관리자에게 재발급 요청 바랍니다."
        Exit Function
    End If

    Dim expDate As Date
    On Error Resume Next
    expDate = CDate(expires)
    On Error GoTo Failed
    If expDate <= 0 Then
        라이센스_차단 "라이센스 만료일 형식 오류."
        Exit Function
    End If
    Dim daysLeft As Long: daysLeft = DateDiff("d", Date, expDate)
    If daysLeft < -LICENSE_GRACE_DAYS Then
        라이센스_차단 "라이센스가 " & expires & " 에 만료되었습니다 (유예 " & LICENSE_GRACE_DAYS & " 일 경과). 관리자에게 갱신 요청 바랍니다."
        Exit Function
    End If

    Dim currentHW As String: currentHW = 라이센스_현재_HW()
    If Len(hwid) = 0 Then
        라이센스_속성_쓰기 LICENSE_HWID_PROP, currentHW
        On Error Resume Next: ThisWorkbook.Save: On Error GoTo Failed
        Application.StatusBar = "라이센스 활성화 (" & user & ") — 이 PC 에 바인딩됨."
    Else
        If hwid <> currentHW Then
            라이센스_차단 "이 라이센스는 다른 PC 전용입니다." & vbLf & _
                          "등록된 HW: " & hwid & vbLf & _
                          "현재 HW: " & currentHW & vbLf & vbLf & _
                          "관리자에게 재발급 요청 바랍니다."
            Exit Function
        End If
    End If

    If daysLeft <= LICENSE_WARN_DAYS And daysLeft >= 0 Then
        Application.StatusBar = "라이센스가 " & daysLeft & " 일 후 만료 (" & expires & "). 관리자에게 갱신 요청 권장."
    ElseIf daysLeft < 0 Then
        Application.StatusBar = "라이센스 유예 기간 — " & (LICENSE_GRACE_DAYS + daysLeft) & " 일 후 차단. 즉시 갱신 요청."
    End If

    라이센스_시트_표시
    라이센스_검증 = True
    Exit Function

Failed:
    라이센스_차단 "라이센스 검증 중 오류 발생. 관리자에게 문의 바랍니다." & vbLf & "(" & Err.Description & ")"
End Function

Public Sub 라이센스_차단(msg As String)
    라이센스_시트_숨기기
    MsgBox msg & vbLf & vbLf & "이 파일은 사용할 수 없습니다.", vbCritical, "라이센스 오류"
End Sub

Public Function 라이센스_DEV모드() As Boolean
    Dim v As String: v = 라이센스_속성_읽기(LICENSE_DEV_FLAG_PROP)
    라이센스_DEV모드 = (LCase(Trim(v)) = "true" Or v = "1")
End Function

Public Function 라이센스_현재_HW() As String
    라이센스_현재_HW = Environ("COMPUTERNAME") & "|" & Environ("USERNAME")
End Function

Public Function 라이센스_해시_계산(user As String, issued As String, expires As String) As String
    Dim payload As String
    payload = user & "|" & issued & "|" & expires & "|" & LICENSE_SALT & "|" & LICENSE_BUILD
    라이센스_해시_계산 = 라이센스_djb2(payload)
End Function

' DJB2 polynomial hash (8 자리 HEX) — VBA 의존성 없음. cryptographic 강도는 낮으나
' SALT 가 VBA 프로젝트 암호로 가려지면 일반 사용자가 우회하기 어려움.
Public Function 라이센스_djb2(text As String) As String
    Dim h As Double: h = 5381
    Dim i As Long, c As Long
    For i = 1 To Len(text)
        c = Asc(Mid(text, i, 1))
        h = (h * 33) + c
        If h > 4294967295# Then h = h - (Int(h / 4294967296#) * 4294967296#)
    Next i
    라이센스_djb2 = Right("00000000" & Hex(CDec(h)), 8)
End Function

Public Function 라이센스_속성_읽기(propName As String) As String
    라이센스_속성_읽기 = ""
    On Error Resume Next
    라이센스_속성_읽기 = CStr(ThisWorkbook.CustomDocumentProperties(propName).value)
    On Error GoTo 0
End Function

Public Sub 라이센스_속성_쓰기(propName As String, value As String)
    On Error Resume Next
    ThisWorkbook.CustomDocumentProperties(propName).Delete
    On Error GoTo 0
    On Error Resume Next
    ThisWorkbook.CustomDocumentProperties.Add Name:=propName, LinkToContent:=False, _
        Type:=4, value:=value     ' 4 = msoPropertyTypeString
    On Error GoTo 0
End Sub

Public Sub 라이센스_시트_숨기기()
    Dim splash As Worksheet: Set splash = 라이센스_splash_확보()
    splash.Visible = xlSheetVisible
    Dim ws As Worksheet
    For Each ws In ThisWorkbook.Worksheets
        If ws.Name <> splash.Name Then
            On Error Resume Next: ws.Visible = xlSheetVeryHidden: On Error GoTo 0
        End If
    Next ws
End Sub

Public Sub 라이센스_시트_표시()
    Dim splash As Worksheet: Set splash = 라이센스_splash_확보()
    Dim ws As Worksheet
    For Each ws In ThisWorkbook.Worksheets
        If ws.Name <> splash.Name Then
            On Error Resume Next: ws.Visible = xlSheetVisible: On Error GoTo 0
        End If
    Next ws
    On Error Resume Next: splash.Visible = xlSheetVeryHidden: On Error GoTo 0
End Sub

Public Function 라이센스_splash_확보() As Worksheet
    Dim ws As Worksheet
    On Error Resume Next: Set ws = ThisWorkbook.Worksheets(LICENSE_SPLASH_SHEET): On Error GoTo 0
    If ws Is Nothing Then
        Set ws = ThisWorkbook.Worksheets.Add
        On Error Resume Next: ws.Name = LICENSE_SPLASH_SHEET: On Error GoTo 0
        ws.Range("B2").value = "edenMG — 라이센스 검증"
        ws.Range("B2").Font.Size = 18
        ws.Range("B2").Font.Bold = True
        ws.Range("B4").value = "이 파일은 라이센스로 보호되어 있습니다."
        ws.Range("B5").value = "관리자에게 발급/갱신 요청 후 사용하세요."
        ws.Range("B7").value = "Alt+F8 → 라이센스_정보_보기 : 라이센스 상태 확인"
        ws.Range("B8").value = "Alt+F8 → 라이센스_내_HW_ID_보기 : 발급 요청용 HW ID 확인"
    End If
    Set 라이센스_splash_확보 = ws
End Function

' === 관리자용 ===

Public Sub 라이센스_발급()
    If Not 라이센스_DEV모드() Then
        If MsgBox("이 워크북은 DEV 모드가 아닙니다. 발급은 master 파일에서 해야 정확합니다." & vbLf & vbLf & _
                  "계속하면 현재 워크북의 라이센스가 덮어쓰입니다. 계속?", vbYesNo + vbExclamation, "라이센스 발급") <> vbYes Then Exit Sub
    End If

    Dim user As String
    user = InputBox("수령자 이름 (예: 홍길동)", "라이센스 발급 — 1/3")
    If Len(Trim(user)) = 0 Then Exit Sub

    Dim daysStr As String
    daysStr = InputBox("유효 기간 (일 단위)", "라이센스 발급 — 2/3", "90")
    If Len(Trim(daysStr)) = 0 Then Exit Sub
    If Not IsNumeric(daysStr) Then
        MsgBox "숫자만 입력하세요.", vbExclamation: Exit Sub
    End If

    Dim bindHW As String
    bindHW = InputBox("사용자 PC 의 HW ID (예: PC01|USER1)" & vbLf & _
                       "비워두면 첫 launch 시 자동 바인딩 (단, 첫 launch 가 의도한 PC 에서 되어야 함)", _
                       "라이센스 발급 — 3/3", "")

    Dim issued As String: issued = Format(Date, "yyyy-mm-dd")
    Dim expires As String: expires = Format(Date + CLng(daysStr), "yyyy-mm-dd")
    Dim hash As String: hash = 라이센스_해시_계산(user, issued, expires)

    Dim choice As VbMsgBoxResult
    choice = MsgBox("발급 정보:" & vbLf & _
                     "  수령자: " & user & vbLf & _
                     "  발급일: " & issued & vbLf & _
                     "  만료일: " & expires & vbLf & _
                     "  HW 바인딩: " & IIf(Len(bindHW) > 0, bindHW, "(첫 launch 시 자동)") & vbLf & vbLf & _
                     "「예」 = 새 파일로 저장 (배포본 생성, master 는 DEV 모드 유지)" & vbLf & _
                     "「아니오」 = 현재 워크북에 직접 적용 (테스트용 — DEV OFF)" & vbLf & _
                     "「취소」 = 중단", _
                     vbYesNoCancel + vbQuestion, "라이센스 발급")
    If choice = vbCancel Then Exit Sub

    ' 라이센스 properties 적용
    라이센스_속성_쓰기 LICENSE_USER_PROP, user
    라이센스_속성_쓰기 LICENSE_ISSUED_PROP, issued
    라이센스_속성_쓰기 LICENSE_EXPIRES_PROP, expires
    라이센스_속성_쓰기 LICENSE_HWID_PROP, bindHW
    라이센스_속성_쓰기 LICENSE_HASH_PROP, hash
    라이센스_속성_쓰기 LICENSE_DEV_FLAG_PROP, "false"

    ' 워터마크 (유출 추적용 — 숨겨진 시트에 영구 embed)
    라이센스_워터마크_추가 user, issued

    If choice = vbYes Then
        Dim safeName As String: safeName = user
        safeName = Replace(safeName, " ", "_")
        safeName = Replace(safeName, "/", "-")
        safeName = Replace(safeName, "\", "-")
        Dim newPath As Variant
        newPath = Application.GetSaveAsFilename( _
            InitialFileName:="edenMG_" & safeName & "_" & issued & ".xlsm", _
            FileFilter:="Excel 매크로 포함 통합 문서 (*.xlsm), *.xlsm")
        If CStr(newPath) = "False" Then
            라이센스_속성_쓰기 LICENSE_DEV_FLAG_PROP, "true"     ' rollback
            MsgBox "저장 취소. DEV 모드 복원.", vbInformation
            Exit Sub
        End If
        On Error Resume Next
        ThisWorkbook.SaveCopyAs CStr(newPath)
        On Error GoTo 0
        ' master 는 DEV 모드 복원
        라이센스_속성_쓰기 LICENSE_DEV_FLAG_PROP, "true"
        MsgBox "배포본 저장 완료:" & vbLf & newPath & vbLf & vbLf & _
                "master 파일은 DEV 모드 복원됨.", vbInformation, "라이센스 발급"
    Else
        MsgBox "현재 워크북에 라이센스 적용 + DEV 모드 OFF." & vbLf & vbLf & _
                "다시 열면 라이센스 검증 시작.", vbInformation, "라이센스 발급"
    End If
End Sub

Public Sub 라이센스_갱신()
    Dim curUser As String: curUser = 라이센스_속성_읽기(LICENSE_USER_PROP)
    Dim curIssued As String: curIssued = 라이센스_속성_읽기(LICENSE_ISSUED_PROP)
    Dim curExpires As String: curExpires = 라이센스_속성_읽기(LICENSE_EXPIRES_PROP)
    If Len(curUser) = 0 Then
        MsgBox "현재 라이센스 정보 없음. 발급부터 진행하세요.", vbExclamation, "라이센스 갱신"
        Exit Sub
    End If
    Dim daysStr As String
    daysStr = InputBox("추가 유효 기간 (일)" & vbLf & "현재 만료일: " & curExpires, "라이센스 갱신", "90")
    If Len(Trim(daysStr)) = 0 Then Exit Sub
    If Not IsNumeric(daysStr) Then Exit Sub

    Dim baseDate As Date
    On Error Resume Next: baseDate = CDate(curExpires): On Error GoTo 0
    If baseDate <= Date Then baseDate = Date
    Dim newExpires As String: newExpires = Format(baseDate + CLng(daysStr), "yyyy-mm-dd")
    Dim newHash As String: newHash = 라이센스_해시_계산(curUser, curIssued, newExpires)
    라이센스_속성_쓰기 LICENSE_EXPIRES_PROP, newExpires
    라이센스_속성_쓰기 LICENSE_HASH_PROP, newHash

    MsgBox "라이센스 갱신:" & vbLf & "  " & curExpires & " → " & newExpires, vbInformation, "라이센스 갱신"
End Sub

' === 사용자용 ===

Public Sub 라이센스_정보_보기()
    Dim msg As String
    msg = "현재 라이센스:" & vbLf & vbLf
    msg = msg & "  수령자: " & 라이센스_속성_읽기(LICENSE_USER_PROP) & vbLf
    msg = msg & "  발급일: " & 라이센스_속성_읽기(LICENSE_ISSUED_PROP) & vbLf
    msg = msg & "  만료일: " & 라이센스_속성_읽기(LICENSE_EXPIRES_PROP) & vbLf
    msg = msg & "  바인딩 HW: " & 라이센스_속성_읽기(LICENSE_HWID_PROP) & vbLf
    msg = msg & "  현재 HW: " & 라이센스_현재_HW() & vbLf
    Dim exp As String: exp = 라이센스_속성_읽기(LICENSE_EXPIRES_PROP)
    Dim expDate As Date
    On Error Resume Next: expDate = CDate(exp): On Error GoTo 0
    If expDate > 0 Then
        Dim d As Long: d = DateDiff("d", Date, expDate)
        msg = msg & vbLf & "남은 일수: " & d & " 일"
        If d < 0 Then msg = msg & " (만료 — 유예 " & (LICENSE_GRACE_DAYS + d) & " 일 남음)"
    End If
    If 라이센스_DEV모드() Then msg = msg & vbLf & vbLf & "⚠ DEV 모드 — 검증 skip (master 파일)"
    MsgBox msg, vbInformation, "라이센스 정보"
End Sub

Public Sub 라이센스_내_HW_ID_보기()
    Dim hw As String: hw = 라이센스_현재_HW()
    Dim msg As String
    msg = "현재 PC HW ID:" & vbLf & vbLf & "  " & hw & vbLf & vbLf
    msg = msg & "이 값을 관리자에게 전달하여 라이센스 발급/재발급 요청 바랍니다."
    MsgBox msg, vbInformation, "내 HW ID"
End Sub

Public Sub 라이센스_워터마크_추가(user As String, issued As String)
    ' 유출 추적용 — splash 시트의 멀리 떨어진 셀에 사용자 정보 embed
    On Error Resume Next
    Dim ws As Worksheet: Set ws = 라이센스_splash_확보()
    ws.Range("Z1000").value = "WM:" & user & "|" & issued & "|" & 라이센스_djb2(user & issued & LICENSE_SALT)
    ws.Range("Z1000").Font.Color = RGB(255, 255, 255)        ' 흰색 (배경과 동일 — 안 보이게)
    On Error GoTo 0
End Sub

' ============================================================================
'  owner 2026-06-08 (8-81): 검색 기능
'    - 리본 「검색」 버튼 → InputBox → 행정도·네트웍 양 시트의 도형 텍스트 매칭
'    - 매칭 대상: 배지번호 (badge_*) · 시설물명 (lbl_fac_* line2) · 시설물ID (lbl_fac_* line3)
'                · 선로ID (lbl_cbl_* line1) — owner 2026-06-08 (8-84) 정정
'    - 매칭 시: 시트 활성화 + 화면 스크롤 + 노란 굵은 outline 강조 (도형) 또는 line 색·굵기 변경 (케이블)
'    - 해제: 빈셀 클릭 시 자동 (시트_셀_클릭 hook) — 원본 스타일 복원 + overlay 도형 삭제
'    - g_search_highlighted: Key = "overlay|<sheetName>|<shapeName>" 또는 "line|<sheetName>|<shapeName>"
'                            Value = "1" (overlay) 또는 "lineColor=N|lineWeight=N" (line)
' ============================================================================
Public Sub 검색_실행()
    ' 기존 강조가 남아있으면 먼저 해제 — 새 검색이 깨끗히 시작.
    On Error Resume Next: 검색_강조_해제: On Error GoTo 0

    ' owner 2026-06-08 (8-82): 4 항목 (배지번호·시설물명·시설물ID·선로ID) 동시 입력 UserForm.
    '   첫 호출 시 frm검색 동적 생성 (트러스트 ON 필요). 트러스트 OFF 면 InputBox 폴백 4 단계.
    g_search_form_qBadge = "": g_search_form_qName = ""
    g_search_form_qFacId = "": g_search_form_qCblId = ""
    g_search_form_confirmed = False

    Dim formOK As Boolean: formOK = False
    On Error Resume Next: formOK = 검색_폼_확보(): On Error GoTo 0
    If formOK Then
        On Error Resume Next
        VBA.UserForms.Add("frm검색").Show
        On Error GoTo 0
        If Not g_search_form_confirmed Then Exit Sub
    Else
        ' Fallback: 4 InputBox 순차 (Cancel 누르면 전체 중단)
        Dim s As String
        s = InputBox("포인트번호 (해당 없으면 비워두기):", "검색 1/4 — 포인트번호")
        If StrPtr(s) = 0 Then Exit Sub
        g_search_form_qBadge = Trim(s)
        s = InputBox("시설물명 (해당 없으면 비워두기):", "검색 2/4 — 시설물명")
        If StrPtr(s) = 0 Then Exit Sub
        g_search_form_qName = Trim(s)
        s = InputBox("시설물ID (해당 없으면 비워두기):", "검색 3/4 — 시설물ID")
        If StrPtr(s) = 0 Then Exit Sub
        g_search_form_qFacId = Trim(s)
        s = InputBox("선로ID (해당 없으면 비워두기):", "검색 4/4 — 선로ID")
        If StrPtr(s) = 0 Then Exit Sub
        g_search_form_qCblId = Trim(s)
        g_search_form_confirmed = True
    End If

    ' 최소 1 항목 검증
    If Len(Trim(g_search_form_qBadge)) = 0 And Len(Trim(g_search_form_qName)) = 0 And _
       Len(Trim(g_search_form_qFacId)) = 0 And Len(Trim(g_search_form_qCblId)) = 0 Then
        MsgBox "최소 1 개 항목을 입력해야 합니다.", vbExclamation, "검색"
        Exit Sub
    End If

    ' 필드별 정밀 매칭 + 강조 + 스크롤
    검색_수행
End Sub

' owner 2026-06-08 (8-82): 입력된 필드만 그 종류 도형에서 매칭. 여러 필드 입력 = OR (각자 매치 모두 강조).
'   - 배지번호 → badge_* 텍스트 substring (case-insensitive)
'   - 시설물명 → lbl_fac_* 본문 2 번째 줄 (callout 「구분/함체명/ID」 의 함체명)
'   - 시설물ID → lbl_fac_* 본문 3 번째 줄 (callout 「구분/함체명/ID」 의 ID — owner 2026-06-08 (8-84) 정정)
'   - 선로ID   → lbl_cbl_* 본문 1 번째 줄 (「선로ID」 필드)
Public Sub 검색_수행()
    Dim qBadge As String, qName As String, qFacId As String, qCblId As String
    qBadge = LCase(Trim(g_search_form_qBadge))
    qName = LCase(Trim(g_search_form_qName))
    qFacId = LCase(Trim(g_search_form_qFacId))
    qCblId = LCase(Trim(g_search_form_qCblId))

    Dim wsAd As Worksheet, wsNw As Worksheet
    On Error Resume Next
    Set wsAd = ThisWorkbook.Worksheets(SHEET_ADMIN)
    Set wsNw = ThisWorkbook.Worksheets(SHEET_NETWORK)
    On Error GoTo 0

    ' owner 2026-06-08 (8-105): 양 시트 각각 첫 매치 추적 → 양 시트 viewport 모두 중앙 정렬.
    '   기존 (단일 primaryShape) 은 한쪽 시트만 중앙으로 와서 다른 시트로 이동 시 위치를 다시 찾아야 했음.
    Dim firstShapeAd As Shape, firstShapeNw As Shape
    Set firstShapeAd = Nothing: Set firstShapeNw = Nothing
    Dim totalHits As Long: totalHits = 0

    ' owner 2026-06-08 (8-87): 현재 활성 시트를 우선 — 네트웍구성도에서 검색하면 그 시트의 매치가
    '   「대표」 가 되어 시트 이동 없음. 행정도에서 검색해도 마찬가지.
    Dim activeNm As String: activeNm = ""
    On Error Resume Next: activeNm = ActiveSheet.Name: On Error GoTo 0
    Dim sheetList(0 To 1) As Worksheet
    If activeNm = SHEET_NETWORK Then
        Set sheetList(0) = wsNw: Set sheetList(1) = wsAd
    Else
        Set sheetList(0) = wsAd: Set sheetList(1) = wsNw
    End If
    ' owner 2026-06-10: 정확 일치 우선 — 정확히 일치하는 도형이 하나라도 있으면 부분 일치는 강조 제외.
    '   (예: 「1」 검색 시 10·11·12 부분 일치는 「1」 정확 일치가 있으면 무시). 1차 수집(hit·exact) → 2차 강조.
    Dim matches As Collection: Set matches = New Collection
    Dim anyExact As Boolean: anyExact = False
    Dim si As Long
    For si = 0 To 1
        Dim ws As Worksheet: Set ws = sheetList(si)
        If Not ws Is Nothing Then
            Dim sh As Shape, nm As String, txt As String, hit As Boolean, exact As Boolean
            Dim line1 As String, line2 As String, line3 As String
            For Each sh In ws.Shapes
                nm = sh.Name
                hit = False: exact = False

                If Left(nm, Len(PREFIX_BADGE)) = PREFIX_BADGE Then
                    If Len(qBadge) > 0 Then
                        txt = "": On Error Resume Next: txt = sh.TextFrame2.TextRange.Text: On Error GoTo 0
                        Dim bt As String: bt = LCase(Trim(txt))
                        If InStr(bt, qBadge) > 0 Then hit = True
                        If bt = qBadge Then exact = True
                    End If
                ElseIf Left(nm, Len(PREFIX_LABEL)) = PREFIX_LABEL Then
                    ' lbl_fac_* / lbl_cbl_* 분기 — Mid 로 두 번째 prefix 검증
                    Dim isFacLbl As Boolean, isCblLbl As Boolean
                    isFacLbl = False: isCblLbl = False
                    If Len(nm) >= Len(PREFIX_LABEL) + Len(PREFIX_FAC) Then
                        If Mid(nm, Len(PREFIX_LABEL) + 1, Len(PREFIX_FAC)) = PREFIX_FAC Then isFacLbl = True
                    End If
                    If Not isFacLbl And Len(nm) >= Len(PREFIX_LABEL) + Len(PREFIX_CBL) Then
                        If Mid(nm, Len(PREFIX_LABEL) + 1, Len(PREFIX_CBL)) = PREFIX_CBL Then isCblLbl = True
                    End If

                    If isFacLbl And (Len(qFacId) > 0 Or Len(qName) > 0) Then
                        txt = "": On Error Resume Next: txt = sh.TextFrame2.TextRange.Text: On Error GoTo 0
                        검색_라인추출 txt, line1, line2, line3
                        ' owner 2026-06-08 (8-84): 시설물 callout = 「구분/함체명/ID」 → 시설물명=line2, 시설물ID=line3
                        If Len(qFacId) > 0 Then
                            If InStr(LCase(line3), qFacId) > 0 Then hit = True
                            If LCase(Trim(line3)) = qFacId Then exact = True
                        End If
                        If Len(qName) > 0 Then
                            If InStr(LCase(line2), qName) > 0 Then hit = True
                            If LCase(Trim(line2)) = qName Then exact = True
                        End If
                    ElseIf isCblLbl And Len(qCblId) > 0 Then
                        txt = "": On Error Resume Next: txt = sh.TextFrame2.TextRange.Text: On Error GoTo 0
                        검색_라인추출 txt, line1, line2, line3
                        ' 행정도 cable callout 은 3 줄 (선로ID/규격/거리), 네트웍은 1 줄 (선로ID) — 어느쪽이든 line1 매칭
                        If InStr(LCase(line1), qCblId) > 0 Then hit = True
                        If LCase(Trim(line1)) = qCblId Then exact = True
                    End If
                End If

                If hit Then
                    matches.Add Array(ws, sh, exact)
                    If exact Then anyExact = True
                End If
            Next sh
        End If
    Next si

    ' 2차: 강조 — 정확 일치가 있으면 정확만, 없으면 부분 포함 전부. 시트별 첫 매치 추적.
    Dim mi As Long
    For mi = 1 To matches.Count
        Dim mEntry As Variant: mEntry = matches(mi)
        Dim mws As Worksheet: Set mws = mEntry(0)
        Dim msh As Shape: Set msh = mEntry(1)
        Dim mex As Boolean: mex = mEntry(2)
        If (Not anyExact) Or mex Then
            검색_강조_적용 mws, msh
            totalHits = totalHits + 1
            If mws Is wsAd Then
                If firstShapeAd Is Nothing Then Set firstShapeAd = msh
            ElseIf mws Is wsNw Then
                If firstShapeNw Is Nothing Then Set firstShapeNw = msh
            End If
        End If
    Next mi

    If totalHits = 0 Then
        Dim msg As String: msg = "입력하신 조건과 일치하는 도형이 없습니다."
        If Len(qBadge) > 0 Then msg = msg & vbLf & "  포인트번호: " & g_search_form_qBadge
        If Len(qName) > 0 Then msg = msg & vbLf & "  시설물명: " & g_search_form_qName
        If Len(qFacId) > 0 Then msg = msg & vbLf & "  시설물ID: " & g_search_form_qFacId
        If Len(qCblId) > 0 Then msg = msg & vbLf & "  선로ID: " & g_search_form_qCblId
        MsgBox msg, vbInformation, "검색"
        Exit Sub
    End If

    ' owner 2026-06-08 (8-105 → 8-112): 양 시트 viewport 모두 중앙 정렬.
    '   ScrollIntoView 는 ActiveWindow 만 동작 → 시트 잠시 Activate 후 스크롤, 마지막에 원래 active 시트 복귀.
    '   8-112: ScreenUpdating=False 제거 — ScrollIntoView/Activate 의 viewport 갱신을 무효화시켜
    '          owner 환경에서 중앙 정렬 안 되는 문제 발생. EnableEvents 가드는 유지 (8-83).
    Dim oEvSrch As Boolean: oEvSrch = Application.EnableEvents
    Application.EnableEvents = False

    ' 원래 active 시트는 sheetList(0) (8-87 활성 시트 우선 — 검색 직전에 owner 가 보고 있던 시트)
    Dim originalActive As Worksheet: Set originalActive = sheetList(0)

    On Error Resume Next
    ' 비-원래-active 시트부터 (마지막에 originalActive 가 active 로 끝나게)
    If Not firstShapeAd Is Nothing And Not (wsAd Is originalActive) Then
        wsAd.Activate
        검색_도형으로_스크롤 firstShapeAd
    End If
    If Not firstShapeNw Is Nothing And Not (wsNw Is originalActive) Then
        wsNw.Activate
        검색_도형으로_스크롤 firstShapeNw
    End If
    ' 마지막: 원래 active 시트
    If originalActive Is wsAd And Not firstShapeAd Is Nothing Then
        wsAd.Activate
        검색_도형으로_스크롤 firstShapeAd
    ElseIf originalActive Is wsNw And Not firstShapeNw Is Nothing Then
        wsNw.Activate
        검색_도형으로_스크롤 firstShapeNw
    Else
        ' 원래 active 시트엔 hit 없음 → 원래 시트로 그냥 돌아옴
        originalActive.Activate
    End If
    On Error GoTo 0
    Application.EnableEvents = oEvSrch

    Dim primaryNm As String: primaryNm = ""
    If originalActive Is wsAd And Not firstShapeAd Is Nothing Then
        primaryNm = wsAd.Name & "!" & firstShapeAd.Name
    ElseIf originalActive Is wsNw And Not firstShapeNw Is Nothing Then
        primaryNm = wsNw.Name & "!" & firstShapeNw.Name
    ElseIf Not firstShapeNw Is Nothing Then
        primaryNm = wsNw.Name & "!" & firstShapeNw.Name
    ElseIf Not firstShapeAd Is Nothing Then
        primaryNm = wsAd.Name & "!" & firstShapeAd.Name
    End If
    Application.StatusBar = "검색: " & totalHits & " 건 (대표 = " & primaryNm & "). 양 시트 모두 중앙 정렬. 빈셀 클릭 시 강조 해제."
End Sub

' 텍스트에서 첫·둘·셋째줄 분리 (vbCrLf · vbCr · vbLf 모두 처리).
'   owner 2026-06-08 (8-84): 시설물 callout 의 ID 는 line3 — 3줄 추출 필요.
Public Sub 검색_라인추출(t As String, ByRef line1 As String, ByRef line2 As String, ByRef line3 As String)
    line1 = "": line2 = "": line3 = ""
    Dim s As String: s = Replace(Replace(t, vbCrLf, vbLf), vbCr, vbLf)
    Dim lines() As String: lines = Split(s, vbLf)
    If UBound(lines) >= 0 Then line1 = lines(0)
    If UBound(lines) >= 1 Then line2 = lines(1)
    If UBound(lines) >= 2 Then line3 = lines(2)
End Sub

' owner 2026-06-08 (8-82): frm검색 UserForm 동적 생성 + 재사용.
'   VBProject 트러스트 (= "VBA 프로젝트 개체 모델 액세스 신뢰") 필요. 이미 InjectEventHandlers 가
'   같은 트러스트 의존이므로 핸들러 작동 환경 = 이 함수도 작동.
'   첫 호출 시 form 생성 → workbook 저장하면 영구. 이후 호출은 기존 form 재사용.
Public Function 검색_폼_확보() As Boolean
    검색_폼_확보 = False

    Dim vbProj As Object
    On Error GoTo NoTrust
    Set vbProj = ThisWorkbook.VBProject
    On Error GoTo 0

    ' 이미 존재하면 재사용
    Dim vc As Object: Set vc = Nothing
    On Error Resume Next: Set vc = vbProj.VBComponents("frm검색"): On Error GoTo 0
    If Not vc Is Nothing Then
        검색_폼_확보 = True
        Exit Function
    End If

    ' 신규 form 생성
    On Error GoTo NoTrust
    Set vc = vbProj.VBComponents.Add(3)          ' 3 = vbext_ct_MSForm
    On Error GoTo 0

    With vc.Properties
        .Item("Name") = "frm검색"
        .Item("Caption") = "검색"
        .Item("Width") = 280
        .Item("Height") = 200
    End With

    Dim D As Object: Set D = vc.Designer
    Dim ctl As Object
    Dim y As Long: y = 12
    Const ROW_H As Long = 26
    Const LBL_W As Long = 64
    Const TXT_W As Long = 174
    Const LBL_LEFT As Long = 12
    Const TXT_LEFT As Long = 84

    Set ctl = D.Controls.Add("Forms.Label.1")
    ctl.Name = "lbl1": ctl.Caption = "포인트번호:"
    ctl.Left = LBL_LEFT: ctl.Top = y + 3: ctl.Width = LBL_W: ctl.Height = 16
    Set ctl = D.Controls.Add("Forms.TextBox.1")
    ctl.Name = "txtBadge"
    ctl.Left = TXT_LEFT: ctl.Top = y: ctl.Width = TXT_W: ctl.Height = 20
    y = y + ROW_H

    Set ctl = D.Controls.Add("Forms.Label.1")
    ctl.Name = "lbl2": ctl.Caption = "시설물명:"
    ctl.Left = LBL_LEFT: ctl.Top = y + 3: ctl.Width = LBL_W: ctl.Height = 16
    Set ctl = D.Controls.Add("Forms.TextBox.1")
    ctl.Name = "txtName"
    ctl.Left = TXT_LEFT: ctl.Top = y: ctl.Width = TXT_W: ctl.Height = 20
    y = y + ROW_H

    Set ctl = D.Controls.Add("Forms.Label.1")
    ctl.Name = "lbl3": ctl.Caption = "시설물ID:"
    ctl.Left = LBL_LEFT: ctl.Top = y + 3: ctl.Width = LBL_W: ctl.Height = 16
    Set ctl = D.Controls.Add("Forms.TextBox.1")
    ctl.Name = "txtFacId"
    ctl.Left = TXT_LEFT: ctl.Top = y: ctl.Width = TXT_W: ctl.Height = 20
    y = y + ROW_H

    Set ctl = D.Controls.Add("Forms.Label.1")
    ctl.Name = "lbl4": ctl.Caption = "선로ID:"
    ctl.Left = LBL_LEFT: ctl.Top = y + 3: ctl.Width = LBL_W: ctl.Height = 16
    Set ctl = D.Controls.Add("Forms.TextBox.1")
    ctl.Name = "txtCblId"
    ctl.Left = TXT_LEFT: ctl.Top = y: ctl.Width = TXT_W: ctl.Height = 20
    y = y + ROW_H + 8

    Set ctl = D.Controls.Add("Forms.CommandButton.1")
    ctl.Name = "btnOK": ctl.Caption = "검색"
    ctl.Left = TXT_LEFT: ctl.Top = y: ctl.Width = 80: ctl.Height = 26
    ctl.Default = True
    Set ctl = D.Controls.Add("Forms.CommandButton.1")
    ctl.Name = "btnCancel": ctl.Caption = "취소"
    ctl.Left = TXT_LEFT + 90: ctl.Top = y: ctl.Width = 80: ctl.Height = 26
    ctl.Cancel = True

    ' 이벤트 코드 — OK 면 module vars 채우고 Hide, Cancel/X 면 confirmed=False.
    '   Module vars (g_search_form_*) 는 M1_Setup.bas 의 Public 변수.
    Dim code As String
    code = "Private Sub btnOK_Click()" & vbCrLf & _
           "    g_search_form_qBadge = txtBadge.Text" & vbCrLf & _
           "    g_search_form_qName = txtName.Text" & vbCrLf & _
           "    g_search_form_qFacId = txtFacId.Text" & vbCrLf & _
           "    g_search_form_qCblId = txtCblId.Text" & vbCrLf & _
           "    g_search_form_confirmed = True" & vbCrLf & _
           "    Me.Hide" & vbCrLf & _
           "End Sub" & vbCrLf & vbCrLf & _
           "Private Sub btnCancel_Click()" & vbCrLf & _
           "    g_search_form_confirmed = False" & vbCrLf & _
           "    Me.Hide" & vbCrLf & _
           "End Sub" & vbCrLf & vbCrLf & _
           "Private Sub UserForm_QueryClose(Cancel As Integer, CloseMode As Integer)" & vbCrLf & _
           "    If CloseMode = 0 Then g_search_form_confirmed = False" & vbCrLf & _
           "End Sub" & vbCrLf
    vc.CodeModule.AddFromString code

    검색_폼_확보 = True
    Exit Function

NoTrust:
    검색_폼_확보 = False
End Function

' ============================================================================
'  owner 2026-06-08 (8-88): 4 필드별 단일 검색 — VBE 비번 켜진 환경 대응
'    - 트러스트 거부로 UserForm 동적 생성 불가 → 기존 「검색」(검색_실행) 이 InputBox 4 번 폴백
'      되는 불편함을 해소.
'    - 리본에 4 버튼 (배지검색·시설물검색·시설물ID검색·선로ID검색) 분리, 각 1 InputBox 직진.
'    - module-level g_search_form_* vars 재사용 — 검색_수행 이 그대로 동작.
' ============================================================================
Public Sub 검색_배지번호()
    Dim s As String
    s = InputBox("포인트번호 (부분 일치):", "포인트번호 검색")
    If StrPtr(s) = 0 Or Len(Trim(s)) = 0 Then Exit Sub
    On Error Resume Next: 검색_강조_해제: On Error GoTo 0
    g_search_form_qBadge = Trim(s)
    g_search_form_qName = "": g_search_form_qFacId = "": g_search_form_qCblId = ""
    g_search_form_confirmed = True
    검색_수행
End Sub

Public Sub 검색_시설물명()
    Dim s As String
    s = InputBox("명칭 (부분 일치):", "명칭 검색")
    If StrPtr(s) = 0 Or Len(Trim(s)) = 0 Then Exit Sub
    On Error Resume Next: 검색_강조_해제: On Error GoTo 0
    g_search_form_qBadge = "": g_search_form_qName = Trim(s)
    g_search_form_qFacId = "": g_search_form_qCblId = ""
    g_search_form_confirmed = True
    검색_수행
End Sub

' owner 2026-06-10: ID검색 — 시설물ID·선로ID 통합. 한 검색어를 qFacId·qCblId 둘 다 세팅 →
'   검색_수행 이 시설물 라벨(시설물ID 매칭)·케이블 라벨(선로ID 매칭) 양쪽을 OR 로 강조.
Public Sub 검색_ID()
    Dim s As String
    s = InputBox("ID (시설물ID·선로ID 부분 일치):", "ID 검색")
    If StrPtr(s) = 0 Or Len(Trim(s)) = 0 Then Exit Sub
    On Error Resume Next: 검색_강조_해제: On Error GoTo 0
    g_search_form_qBadge = "": g_search_form_qName = ""
    g_search_form_qFacId = Trim(s): g_search_form_qCblId = Trim(s)
    g_search_form_confirmed = True
    검색_수행
End Sub

Public Sub 검색_시설물ID()
    Dim s As String
    s = InputBox("시설물ID (부분 일치):", "시설물ID 검색")
    If StrPtr(s) = 0 Or Len(Trim(s)) = 0 Then Exit Sub
    On Error Resume Next: 검색_강조_해제: On Error GoTo 0
    g_search_form_qBadge = "": g_search_form_qName = ""
    g_search_form_qFacId = Trim(s): g_search_form_qCblId = ""
    g_search_form_confirmed = True
    검색_수행
End Sub

Public Sub 검색_선로ID()
    Dim s As String
    s = InputBox("선로ID (부분 일치):", "선로ID 검색")
    If StrPtr(s) = 0 Or Len(Trim(s)) = 0 Then Exit Sub
    On Error Resume Next: 검색_강조_해제: On Error GoTo 0
    g_search_form_qBadge = "": g_search_form_qName = ""
    g_search_form_qFacId = "": g_search_form_qCblId = Trim(s)
    g_search_form_confirmed = True
    검색_수행
End Sub

' 도형이 화면 정중앙에 오도록 스크롤. ActiveWindow.UsableWidth/Height (point 단위) 의
'   절반을 도형 중심에서 빼서 viewport 좌상단 좌표를 산출. ScrollIntoView Start:=True
'   는 그 좌표가 viewport 좌상단에 오도록 스크롤.
Public Sub 검색_도형으로_스크롤(shp As Shape)
    If shp Is Nothing Then Exit Sub
    Dim ws As Worksheet: Set ws = shp.Parent
    On Error Resume Next: ws.Activate: On Error GoTo 0

    ' owner 2026-06-10: ScrollIntoView 는 1행 틀고정 환경에서 중앙 정렬이 자주 실패 →
    '   ScrollRow/ScrollColumn 방식으로 변경. 도형이 들어있는 셀을 화면 중앙에 오도록 스크롤.
    '   틀고정 행(1행) 아래로 ScrollRow 클램프 (틀고정 pane 은 ScrollRow 가 2 이상이어야 함).
    Dim anchorRow As Long: anchorRow = 1
    Dim anchorCol As Long: anchorCol = 1
    On Error Resume Next
    anchorRow = shp.TopLeftCell.Row
    anchorCol = shp.TopLeftCell.Column
    On Error GoTo 0

    Dim winW As Double, winH As Double: winW = 0: winH = 0
    On Error Resume Next
    winW = ActiveWindow.UsableWidth
    winH = ActiveWindow.UsableHeight
    On Error GoTo 0

    ' 화면에 보이는 행·열 수 추정 = Usable 크기 ÷ 셀 크기
    Dim rhCell As Double: rhCell = CELL_PT
    Dim cwCell As Double: cwCell = CELL_PT
    On Error Resume Next
    rhCell = ws.Cells(anchorRow, 1).Height
    cwCell = ws.Cells(1, anchorCol).Width
    On Error GoTo 0
    If rhCell <= 0 Then rhCell = CELL_PT
    If cwCell <= 0 Then cwCell = CELL_PT

    Dim visRows As Long: visRows = 20
    Dim visCols As Long: visCols = 20
    If winH > 0 Then visRows = CLng(winH / rhCell)
    If winW > 0 Then visCols = CLng(winW / cwCell)
    If visRows < 2 Then visRows = 2
    If visCols < 2 Then visCols = 2

    Dim sr As Long: sr = anchorRow - visRows \ 2
    Dim sc As Long: sc = anchorCol - visCols \ 2
    Dim minRow As Long: minRow = LEGEND_ROWS + 1   ' 틀고정 1행 아래
    If sr < minRow Then sr = minRow
    If sc < 1 Then sc = 1

    On Error Resume Next
    ActiveWindow.ScrollRow = sr
    ActiveWindow.ScrollColumn = sc
    On Error GoTo 0
End Sub

' 단일 도형에 강조 적용 — line 색·굵기 직접 변경. 모든 도형 종류 통일 (8-112).
Public Sub 검색_강조_적용(ws As Worksheet, shp As Shape)
    If g_search_highlighted Is Nothing Then Set g_search_highlighted = CreateObject("Scripting.Dictionary")

    ' owner 2026-06-08 (8-83 → 8-87): 강조색 노랑 → 연보라 RGB(180,100,240).
    '   노랑이 기존 네트웍구성도 격자색 (노랑) 과 구분 안 됨 → 연보라로 변경. 추적 cyan/lime 과도 구분됨.
    Dim HL_LINE_COLOR As Long: HL_LINE_COLOR = RGB(180, 100, 240)
    Const HL_LINE_WEIGHT As Single = 4#

    ' owner 2026-06-08 (8-112): 모든 도형 line 직접 변경 — overlay 사용 안 함.
    '   원인: Excel 의 폼 컨트롤 (콤보박스/드롭다운/textbox) 은 일반 도형보다 z-order layer 가 위에 있어
    '         overlay 사각형이 ZOrder msoBringToFront 호출해도 콤보박스에 가려짐.
    '   해결: 매치 도형 자체의 line 색·굵기·Visible 직접 변경 → 도형 본체 outline 으로 강조.
    Dim oC As Long: oC = 0
    Dim oW As Single: oW = 1
    Dim oV As Long: oV = msoTrue
    On Error Resume Next
    oC = shp.Line.ForeColor.RGB
    oW = shp.Line.Weight
    oV = shp.Line.Visible
    On Error GoTo 0
    Dim keyL As String: keyL = "line|" & ws.Name & "|" & shp.Name
    If Not g_search_highlighted.Exists(keyL) Then
        g_search_highlighted(keyL) = "lineColor=" & oC & "|lineWeight=" & oW & "|lineVisible=" & oV
    End If
    On Error Resume Next
    shp.Line.Visible = msoTrue                  ' 배지 등 line.Visible=False 도형도 강조 시 표시
    shp.Line.ForeColor.RGB = HL_LINE_COLOR
    shp.Line.Weight = HL_LINE_WEIGHT
    On Error GoTo 0
End Sub

' 강조 해제 — 모든 overlay 도형 삭제 + 백업된 line 색·굵기 복원.
'   빈셀 클릭 시 시트_셀_클릭 가 자동 호출. 무성 (메시지 없음).
Public Sub 검색_강조_해제()
    If g_search_highlighted Is Nothing Then Exit Sub
    If g_search_highlighted.Count = 0 Then Exit Sub

    Dim key As Variant
    For Each key In g_search_highlighted.Keys
        Dim s As String: s = CStr(key)
        Dim parts() As String: parts = Split(s, "|")
        If UBound(parts) >= 2 Then
            Dim kind As String: kind = parts(0)
            Dim sheetName As String: sheetName = parts(1)
            Dim shapeName As String: shapeName = parts(2)
            Dim ws As Worksheet: Set ws = Nothing
            On Error Resume Next: Set ws = ThisWorkbook.Worksheets(sheetName): On Error GoTo 0
            If Not ws Is Nothing Then
                Dim wasProt As Boolean: wasProt = ws.ProtectContents Or ws.ProtectDrawingObjects
                On Error Resume Next: ws.Unprotect: On Error GoTo 0
                Dim shp As Shape: Set shp = Nothing
                On Error Resume Next: Set shp = ws.Shapes(shapeName): On Error GoTo 0
                If Not shp Is Nothing Then
                    If kind = "overlay" Then
                        On Error Resume Next: shp.Delete: On Error GoTo 0
                    ElseIf kind = "line" Then
                        Dim styleStr As String: styleStr = CStr(g_search_highlighted(key))
                        Dim oC As String: oC = AltParseField(styleStr, "lineColor=")
                        Dim oW As String: oW = AltParseField(styleStr, "lineWeight=")
                        Dim oV As String: oV = AltParseField(styleStr, "lineVisible=")
                        If IsNumeric(oC) Then
                            On Error Resume Next: shp.Line.ForeColor.RGB = CLng(oC): On Error GoTo 0
                        End If
                        If IsNumeric(oW) Then
                            On Error Resume Next: shp.Line.Weight = CSng(oW): On Error GoTo 0
                        End If
                        ' owner 2026-06-08 (8-112): line.Visible 도 복원 — 강조 시 강제 보이게 했으니 원본으로
                        If IsNumeric(oV) Then
                            On Error Resume Next: shp.Line.Visible = CLng(oV): On Error GoTo 0
                        End If
                    End If
                End If
                If wasProt Then ApplySheetProtection ws
            End If
        End If
    Next key

    g_search_highlighted.RemoveAll
End Sub

