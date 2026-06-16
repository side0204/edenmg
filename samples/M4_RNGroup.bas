Attribute VB_Name = "M4_RNGroup"
Option Explicit


' alt 의 "rn=<tag>" 추출 헬퍼 (A/B/IN/OUT 중 하나). 없으면 빈 문자열.
Public Function 선번연결_도구_alt_rn_tag(alt As String) As String
    선번연결_도구_alt_rn_tag = ""
    Dim p As Long: p = InStr(alt, "rn=")
    If p = 0 Then Exit Function
    Dim e As Long: e = InStr(p, alt, "|")
    If e = 0 Then e = Len(alt) + 1
    선번연결_도구_alt_rn_tag = Mid(alt, p + 3, e - (p + 3))
End Function

' ============================================================================
'  Step 1 — 방사형 케이블 선택 화면
' ============================================================================
'   기준 시설물 중앙 + 연결된 케이블 N 개를 방사형 (360° / N 간격) 으로 그림.
'   각 케이블 끝에 다른 시설물 이름표. 케이블 클릭 = 선택 (최대 2개 토글).
'   2개 선택 후 「선택」 버튼 = Step 2 (코어 매핑) 진입.
Public Sub 선번연결_도구_방사형빌드(facName As String)
    Dim ws As Worksheet
    On Error Resume Next
    Set ws = ThisWorkbook.Worksheets(SHEET_PAIR_TOOL)
    On Error GoTo 0
    If ws Is Nothing Then
        Set ws = ThisWorkbook.Worksheets.Add(After:=ThisWorkbook.Worksheets(ThisWorkbook.Worksheets.Count))
        ws.Name = SHEET_PAIR_TOOL
    End If
    ws.Visible = xlSheetVisible
    On Error Resume Next
    ws.Unprotect
    On Error GoTo 0

    ' 기존 도구 도형 모두 제거 — Step 2 잔재 (PT_L/PT_R/PT_RIN/PT_ROUT/PT_LINE) 포함
    Dim sh As Shape, i As Long
    For i = ws.Shapes.Count To 1 Step -1
        Set sh = ws.Shapes(i)
        Dim nm As String: nm = sh.Name
        If Left(nm, Len(PREFIX_PT_L)) = PREFIX_PT_L Or _
           Left(nm, Len(PREFIX_PT_R)) = PREFIX_PT_R Or _
           Left(nm, Len(PREFIX_PT_RIN)) = PREFIX_PT_RIN Or _
           Left(nm, Len(PREFIX_PT_ROUT)) = PREFIX_PT_ROUT Or _
           Left(nm, Len(PREFIX_PT_LINE)) = PREFIX_PT_LINE Or _
           Left(nm, Len(PREFIX_PT_BTN)) = PREFIX_PT_BTN Or _
           Left(nm, Len(PREFIX_PT_RADIAL)) = PREFIX_PT_RADIAL Or _
           Left(nm, Len(PREFIX_PT_RADIALLBL)) = PREFIX_PT_RADIALLBL Then sh.Delete
    Next i
    ws.Cells.Clear
    ' Row 1-5 명시 높이 16pt (총 80pt) — 버튼 영역 (y=10-73) 위, 텍스트 row 6+ 가림 방지 (owner 요구)
    On Error Resume Next
    ws.Rows("1:5").RowHeight = 16
    On Error GoTo 0

    ' 시설물 이름 — callout 첫 줄
    Dim facName_disp As String: facName_disp = facName
    Dim wsNw As Worksheet: Set wsNw = ThisWorkbook.Worksheets(SHEET_NETWORK)
    Dim lblShp As Shape: Set lblShp = Nothing
    On Error Resume Next
    Set lblShp = wsNw.Shapes(PREFIX_LABEL & facName)
    On Error GoTo 0
    If Not lblShp Is Nothing Then
        On Error Resume Next
        Dim t As String: t = lblShp.TextFrame2.TextRange.Text
        If InStr(t, vbCr) > 0 Then t = Left(t, InStr(t, vbCr) - 1)
        If InStr(t, vbLf) > 0 Then t = Left(t, InStr(t, vbLf) - 1)
        If Len(Trim(t)) > 0 Then facName_disp = Trim(t)
        On Error GoTo 0
    End If

    ' 헤더 — 텍스트 셀은 row 6+ (버튼 아래) 로 이동 (owner 요구: 버튼이 글자 안 가리게)
    ' owner 2026-06-05: 설명 텍스트 오른쪽 아래로 이동 (B6-B9 → N28-N31). 캔버스가 5열 우측 이동된 자리에 충돌 회피.
    ws.Range("N28").Value = "코어 연결 - 케이블 선택 (Step 1 / 2)"
    With ws.Range("N28").Font: .Size = 14: .Bold = True: .Name = CALLOUT_FONT_NAME: End With
    ws.Range("N29").Value = "기준 시설물:"
    ws.Range("O29").Value = "「" & facName_disp & "」  ·  연결 케이블 " & g_pt_radial.Count & " 개"
    With ws.Range("N29").Font: .Bold = True: .Name = CALLOUT_FONT_NAME: End With
    With ws.Range("O29").Font: .Name = CALLOUT_FONT_NAME: End With
    ws.Range("N30").Value = "케이블을 클릭하면 강조 (최대 2개). 2개 선택 후 「선택」 클릭 = 코어 연결 단계로 이동."
    With ws.Range("N30").Font: .Italic = True: .Size = 9: .Color = RGB(100, 116, 139): End With

    ws.Range("N31").Value = "선택: 0 / 2"
    With ws.Range("N31").Font: .Bold = True: .Size = 11: .Name = CALLOUT_FONT_NAME: End With

    ' Step 1 버튼 — y=10 (최상단). 텍스트와 안 겹침. owner 요구.
    Dim btnY As Double: btnY = 10
    Dim btnX As Double: btnX = 36
    Const BTN_W As Double = 160
    Const BTN_H As Double = 28
    Const BTN_GAP As Double = 6

    Dim btnDefs As Variant
    btnDefs = Array( _
        Array("코어 선택", "선번연결_도구_케이블선택완료", RGB(59, 130, 246)), _
        Array("나가기", "선번연결_도구_취소", RGB(239, 68, 68)) _
    )
    Dim bi As Long
    For bi = LBound(btnDefs) To UBound(btnDefs)
        Dim btn As Shape
        Set btn = ws.Shapes.AddShape(msoShapeRoundedRectangle, btnX, btnY, BTN_W, BTN_H)
        btn.Name = PREFIX_PT_BTN & "s1_" & bi
        btn.OnAction = CStr(btnDefs(bi)(1))
        btn.Placement = 3
        With btn.Line: .Visible = msoFalse: End With
        With btn.Fill: .ForeColor.RGB = CLng(btnDefs(bi)(2)): .Visible = msoTrue: End With
        With btn.TextFrame2
            .MarginLeft = 4: .MarginRight = 4: .MarginTop = 2: .MarginBottom = 2
            .VerticalAnchor = msoAnchorMiddle
            .TextRange.Text = CStr(btnDefs(bi)(0))
            .TextRange.Font.Name = CALLOUT_FONT_NAME
            .TextRange.Font.Size = 11
            .TextRange.Font.Bold = msoTrue
            .TextRange.Font.Fill.ForeColor.RGB = RGB(255, 255, 255)
            .TextRange.ParagraphFormat.Alignment = 1
        End With
        btnX = btnX + BTN_W + BTN_GAP
    Next bi

    ' 방사형 좌표 — 절반 크기. owner 2026-06-05 후속: 5열 우측 (1004) 에서 3열 왼쪽으로 (1004-192=812). 3행 아래로 (50 → 98).
    Const CV_LEFT As Double = 812                    ' 캔버스 좌측 x
    Const CV_TOP As Double = 98                      ' 캔버스 상단 y (50 + 3*16)
    Const CV_W As Double = 440                       ' 캔버스 폭 (이전 880 의 절반)
    Const CV_H As Double = 260                       ' 캔버스 높이 (이전 520 의 절반)
    Const RADIUS As Double = 110                     ' 케이블 길이 (이전 220 의 절반)
    Const FAC_R As Double = 14                       ' 중앙 시설물 원 반지름 (이전 22 → 14)
    Const END_FAC_R As Double = 9                    ' 끝 시설물 원 반지름 (이전 14 → 9)
    Const LBL_W As Double = 80                       ' 이름표 폭 (이전 110 → 80)
    Const LBL_H As Double = 18                       ' 이름표 높이 (이전 22 → 18)
    Dim cx As Double: cx = CV_LEFT + CV_W / 2
    Dim cy As Double: cy = CV_TOP + CV_H / 2

    ' 캔버스 배경 (얇은 박스)
    Dim bg As Shape
    Set bg = ws.Shapes.AddShape(msoShapeRectangle, CV_LEFT, CV_TOP, CV_W, CV_H)
    bg.Name = PREFIX_PT_BTN & "s1_bg"
    bg.Placement = 3
    With bg.Line: .ForeColor.RGB = RGB(226, 232, 240): .Weight = 0.5: .Visible = msoTrue: End With
    With bg.Fill: .ForeColor.RGB = RGB(248, 250, 252): .Visible = msoTrue: End With

    ' 중앙 시설물 — RN 이면 빨간 ⓡ 원, 그 외는 ⊗ 모양 (원 + 내부 X). 클릭 가능.
    Dim facC As Shape
    Dim facIsRn As Boolean: facIsRn = 선번연결_도구_isRN()
    If facIsRn Then
        ' 빨간 원 + 가운데 'R' 글자 (실제 RN장비 도형과 비슷한 시각)
        Set facC = ws.Shapes.AddShape(msoShapeOval, cx - FAC_R, cy - FAC_R, FAC_R * 2, FAC_R * 2)
        facC.Name = PREFIX_PT_RADIAL & "center"
        facC.Placement = 3
        On Error Resume Next
        facC.Line.ForeColor.RGB = RGB(220, 38, 38)
        facC.Line.Weight = 2#
        facC.Fill.ForeColor.RGB = RGB(254, 226, 226)
        With facC.TextFrame2
            .MarginLeft = 0: .MarginRight = 0: .MarginTop = 0: .MarginBottom = 0
            .VerticalAnchor = msoAnchorMiddle
            .TextRange.Text = "R"
            .TextRange.Font.Name = CALLOUT_FONT_NAME
            .TextRange.Font.Size = 14
            .TextRange.Font.Bold = msoTrue
            .TextRange.Font.Fill.ForeColor.RGB = RGB(127, 29, 29)
            .TextRange.ParagraphFormat.Alignment = 2
        End With
        On Error GoTo 0
    Else
        ' owner 2026-06-12: 기준(중앙) 시설물도 네트웍구성도와 동일 모양 — 끝 시설물과 같은 복제 경로.
        '   범례 도형 우선 → 네트웍 도형 fallback → 둘 다 없으면 기존 ⊗ (legacy 시각 유지).
        Dim ctrLegendShp As Shape: Set ctrLegendShp = Nothing
        Dim ctrLabelStr As String: ctrLabelStr = ""
        Dim metaRowCtr As Variant
        metaRowCtr = MetaFindRow(SHEET_META_FAC, 1, facName)
        If Not IsEmpty(metaRowCtr) Then
            On Error Resume Next
            ctrLabelStr = CStr(metaRowCtr(2))
            On Error GoTo 0
        End If
        If Len(ctrLabelStr) > 0 Then Set ctrLegendShp = 선번연결_도구_범례도형_조회(ctrLabelStr)
        Dim ctrNwShp As Shape: Set ctrNwShp = Nothing
        If ctrLegendShp Is Nothing Then
            On Error Resume Next
            Set ctrNwShp = wsNw.Shapes(facName)
            On Error GoTo 0
        End If
        If Not ctrLegendShp Is Nothing Then
            Set facC = 선번연결_도구_시설물도형_복제(ws, PREFIX_PT_RADIAL & "center", cx, cy, FAC_R * 2, ctrLegendShp)
        ElseIf Not ctrNwShp Is Nothing Then
            Set facC = 선번연결_도구_시설물도형_복제(ws, PREFIX_PT_RADIAL & "center", cx, cy, FAC_R * 2, ctrNwShp)
        Else
            Set facC = 선번연결_도구_시설물도형(ws, PREFIX_PT_RADIAL & "center", cx, cy, FAC_R * 2, _
                RGB(255, 255, 255), RGB(29, 78, 192), 2#)
        End If
    End If
    facC.OnAction = "선번연결_도구_방사형클릭"
    facC.AlternativeText = "facCenter=1"

    ' owner 2026-06-12: 선택 강조 링 — 복제 도형의 원래 색을 덮어쓰지 않기 위해 별도 링 토글 방식.
    '   (이전엔 facC.Line 색을 주황/파랑으로 직접 변경 — 복제 도형·RN 빨간 원의 색이 망가지는 원인)
    Dim selRing As Shape
    Set selRing = ws.Shapes.AddShape(msoShapeOval, cx - FAC_R - 5, cy - FAC_R - 5, (FAC_R + 5) * 2, (FAC_R + 5) * 2)
    selRing.Name = PREFIX_PT_RADIAL & "center_sel"
    selRing.Placement = 3
    On Error Resume Next
    selRing.Fill.Visible = msoFalse
    With selRing.Line: .ForeColor.RGB = RGB(234, 88, 12): .Weight = 3: .Visible = msoTrue: End With
    selRing.Visible = msoFalse
    On Error GoTo 0

    ' 투명 hit area — owner 요구: 시설물 클릭 영역 확장 (작은 ⊗ 도형 클릭 어려움 해결).
    '   직경 약 50pt (FAC_R*2=28 → 1.8 배). Fill·Line 둘 다 투명이지만 클릭은 받음.
    '   ZOrder msoBringToFront 로 위에 올림 → 그 영역 클릭은 모두 hit area 가 받음.
    Dim facHitR As Double: facHitR = FAC_R + 12
    Dim facHit As Shape
    Set facHit = ws.Shapes.AddShape(msoShapeOval, cx - facHitR, cy - facHitR, facHitR * 2, facHitR * 2)
    facHit.Name = PREFIX_PT_RADIAL & "center_hit"
    facHit.OnAction = "선번연결_도구_방사형클릭"
    facHit.AlternativeText = "facCenter=1"
    facHit.Placement = 3
    On Error Resume Next
    facHit.Line.Visible = msoFalse
    facHit.Fill.Visible = msoTrue
    facHit.Fill.ForeColor.RGB = RGB(255, 255, 255)
    facHit.Fill.Transparency = 1#
    facHit.ZOrder msoBringToFront
    On Error GoTo 0

    ' 중앙 라벨 (작아진 캔버스에 맞춰 글자 작게). 클릭 가능 (편의)
    Dim centerLblShp As Shape
    Set centerLblShp = ws.Shapes.AddTextbox(msoTextOrientationHorizontal, _
        cx + FAC_R + 6, cy - 18, 120, 26)
    centerLblShp.Name = PREFIX_PT_RADIALLBL & "center"
    centerLblShp.OnAction = "선번연결_도구_방사형클릭"
    centerLblShp.AlternativeText = "facCenter=1"
    centerLblShp.Placement = 3
    On Error Resume Next
    centerLblShp.Line.Visible = msoFalse
    centerLblShp.Fill.Visible = msoFalse
    With centerLblShp.TextFrame2
        .MarginLeft = 0: .MarginRight = 0: .MarginTop = 0: .MarginBottom = 0
        .VerticalAnchor = msoAnchorMiddle
        .TextRange.Text = "기준" & vbCrLf & facName_disp
        .TextRange.Font.Name = CALLOUT_FONT_NAME
        .TextRange.Font.Size = 8
        .TextRange.Font.Bold = msoTrue
        .TextRange.Font.Fill.ForeColor.RGB = RGB(71, 85, 105)
    End With
    On Error GoTo 0

    ' 방사형 — 각 케이블 라인 + 끝 시설물 + 이름표
    ' Owner: 「코어구성도 케이블 순서로 배치」 — 네트웍 시트의 실제 각도 사용 (균등 분포 X)
    Dim wsNw_pos As Worksheet: Set wsNw_pos = ThisWorkbook.Worksheets(SHEET_NETWORK)
    Dim facShp_pos As Shape: Set facShp_pos = Nothing
    On Error Resume Next
    Set facShp_pos = wsNw_pos.Shapes(facName)
    On Error GoTo 0
    Dim facCx_pos As Double, facCy_pos As Double
    If Not facShp_pos Is Nothing Then
        facCx_pos = facShp_pos.Left + facShp_pos.Width / 2
        facCy_pos = facShp_pos.Top + facShp_pos.Height / 2
    End If

    Dim nKeys As Long: nKeys = g_pt_radial.Count
    Dim sortedKeys() As String: ReDim sortedKeys(0 To nKeys - 1)
    Dim sortedAngs() As Double: ReDim sortedAngs(0 To nKeys - 1)
    Dim si_pos As Long: si_pos = 0
    Dim kp As Variant
    Const PI_DBL As Double = 3.14159265358979
    For Each kp In g_pt_radial.Keys
        Dim cblNw As Shape: Set cblNw = Nothing
        On Error Resume Next
        Set cblNw = wsNw_pos.Shapes(CStr(kp))
        On Error GoTo 0
        Dim angCbl As Double: angCbl = -PI_DBL / 2 + si_pos * 2 * PI_DBL / nKeys  ' fallback: 균등 분포
        If Not cblNw Is Nothing And Not facShp_pos Is Nothing Then
            ' owner 2026-06-11: 스포크 방향 = 네트웍구성도에서 기준 시설물을 「나가는」 첫 segment 방향.
            '   ㄷ자/L자 다조 케이블도 실제 보이는 방향 그대로 (chord 금지 — 다조끼리 겹침의 원인).
            Dim dxA As Double, dyA As Double
            Dim hubOK_p As Boolean: hubOK_p = 케이블_허브방향(cblNw, facCx_pos, facCy_pos, dxA, dyA)
            If hubOK_p Then
                ' atan2 (VBA 에 없으므로 분기 구현)
                If Abs(dxA) < 0.001 Then
                    If dyA >= 0 Then angCbl = PI_DBL / 2 Else angCbl = -PI_DBL / 2
                Else
                    angCbl = Atn(dyA / dxA)
                    If dxA < 0 Then
                        If dyA >= 0 Then angCbl = angCbl + PI_DBL Else angCbl = angCbl - PI_DBL
                    End If
                End If
            End If
        End If
        sortedKeys(si_pos) = CStr(kp)
        sortedAngs(si_pos) = angCbl
        si_pos = si_pos + 1
    Next kp

    ' Insertion sort by angle (시계방향: -π/2 부터 시작해 +π/2 까지)
    Dim ii_s As Long, jj_s As Long
    For ii_s = 1 To nKeys - 1
        Dim kTmp As String: kTmp = sortedKeys(ii_s)
        Dim aTmp As Double: aTmp = sortedAngs(ii_s)
        jj_s = ii_s - 1
        Do While jj_s >= 0
            If sortedAngs(jj_s) <= aTmp Then Exit Do
            sortedKeys(jj_s + 1) = sortedKeys(jj_s)
            sortedAngs(jj_s + 1) = sortedAngs(jj_s)
            jj_s = jj_s - 1
        Loop
        sortedKeys(jj_s + 1) = kTmp
        sortedAngs(jj_s + 1) = aTmp
    Next ii_s

    ' owner 2026-06-11 다조: 스포크 방향은 위에서 「나가는 첫 segment」 기준이라 다조도 대부분 자연 분리.
    '   그래도 첫 segment 까지 같은 방향(예: 가로 구간 3조의 같은 쪽 ㄷ자 slot1·slot3)이면 정확히 겹치므로
    '   안전망: 근사 동일 각도(±0.03 rad) 그룹을 ±15°(0.26 rad) 부채꼴로 벌려 따로 보이고 클릭되게.
    '   (±π 경계 wrap 케이스는 미처리 — 정확히 뒤로 향한 다조는 희귀)
    Dim grpStart As Long: grpStart = 0
    Dim grpEnd As Long, gN As Long, gAvg As Double, gI As Long
    Do While grpStart <= nKeys - 1
        grpEnd = grpStart
        Do While grpEnd + 1 <= nKeys - 1
            If Abs(sortedAngs(grpEnd + 1) - sortedAngs(grpStart)) < 0.03 Then grpEnd = grpEnd + 1 Else Exit Do
        Loop
        gN = grpEnd - grpStart + 1
        If gN >= 2 Then
            gAvg = 0
            For gI = grpStart To grpEnd
                gAvg = gAvg + sortedAngs(gI)
            Next gI
            gAvg = gAvg / gN
            For gI = grpStart To grpEnd
                sortedAngs(gI) = gAvg + (gI - grpStart - (gN - 1) / 2#) * 0.26
            Next gI
        End If
        grpStart = grpEnd + 1
    Loop

    Dim n As Long: n = nKeys
    Dim idx As Long
    Dim k As Variant
    For idx = 0 To nKeys - 1
        k = sortedKeys(idx)
        Dim ang As Double: ang = sortedAngs(idx)
        Dim ex As Double, ey As Double
        ex = cx + RADIUS * Cos(ang)
        ey = cy + RADIUS * Sin(ang)

        ' value 형식: "otherId|otherName|spec|installation"
        Dim parts() As String: parts = Split(CStr(g_pt_radial(k)), "|")
        Dim otherName As String: otherName = parts(1)
        Dim spec As String: spec = parts(2)

        ' owner #5: 케이블 색상 = 네트웍구성도의 그 케이블 도형 색상 (범례 spec 별 색이 도형에 반영됨)
        Dim cblShpNw As Shape: Set cblShpNw = Nothing
        On Error Resume Next
        Set cblShpNw = wsNw_pos.Shapes(CStr(k))
        On Error GoTo 0
        Dim cblFavColor As Long: cblFavColor = CBL_DEFAULT_COLOR
        If Not cblShpNw Is Nothing Then
            On Error Resume Next
            cblFavColor = cblShpNw.Line.ForeColor.RGB
            On Error GoTo 0
        End If

        ' 케이블 라인 — 중앙에서 끝점까지
        ' 중심·끝 시설물 도형 반지름만큼 안쪽으로 끌어와 깔끔하게 만남
        Dim sx As Double, sy As Double
        sx = cx + FAC_R * Cos(ang)
        sy = cy + FAC_R * Sin(ang)
        Dim tx As Double, ty As Double
        tx = ex - END_FAC_R * Cos(ang)
        ty = ey - END_FAC_R * Sin(ang)

        ' owner #5: 케이블 라인 아래 노란 음영 박스 (선택 시 표시 — 색상 갱신 시 visible 토글). 라인보다 z-order back.
        '   owner 2026-06-05: 폭 = 실제 케이블 길이 (sx,sy ↔ tx,ty) — 이전 RADIUS*2 는 방사형 전체 폭이라 시설물 너머까지 침범.
        '   owner 후속 (중간 접속함체도 통과 보고): 양 끝 HILITE_MARGIN 만큼 더 축소 — 시설물 아이콘 가장자리와 분리.
        '   owner 후속2: 두께 10 → 15 (1.5배) — 케이블 위 하이라이트 더 잘 보이게.
        Const HILITE_MARGIN As Double = 6                 ' 양 끝 각 6pt 안쪽으로 (시설물 아이콘 침범 차단)
        Const HILITE_THICK As Double = 15                 ' 케이블 perp 방향 두께 (이전 10 → 15, 1.5배)
        Dim cableLen As Double: cableLen = Sqr((tx - sx) * (tx - sx) + (ty - sy) * (ty - sy))
        Dim hiliteW As Double: hiliteW = cableLen - HILITE_MARGIN * 2
        If hiliteW < 4 Then hiliteW = 4                   ' 케이블 너무 짧은 edge case (최소 가시 폭)
        Dim hilite As Shape
        Set hilite = ws.Shapes.AddShape(msoShapeRectangle, _
            (sx + tx) / 2 - hiliteW / 2, (sy + ty) / 2 - HILITE_THICK / 2, hiliteW, HILITE_THICK)
        hilite.Name = PREFIX_PT_RADIAL & "hilite_" & CStr(k)
        hilite.Placement = 3
        On Error Resume Next
        ' 라인 각도로 회전 (rotation 도 양해)
        Dim angDeg As Double: angDeg = ang * 180# / 3.14159265358979
        hilite.Rotation = angDeg
        hilite.Line.Visible = msoFalse
        hilite.Fill.ForeColor.RGB = RGB(253, 224, 71)  ' 노랑 (yellow-300)
        hilite.Fill.Visible = msoTrue
        hilite.Visible = msoFalse                       ' 기본 안 보임 — 선택 시 색상갱신에서 켜짐
        On Error GoTo 0

        Dim ln As Shape
        Set ln = ws.Shapes.AddLine(sx, sy, tx, ty)
        ln.Name = PREFIX_PT_RADIAL & CStr(k)
        ln.OnAction = "선번연결_도구_방사형클릭"
        ln.Placement = 3
        With ln.Line
            .ForeColor.RGB = cblFavColor
            .Weight = CBL_LINE_WEIGHT
            .Visible = msoTrue
        End With

        ' owner #6: 케이블 규격 라벨 (mlbl) — 삭제 (owner 요구)

        ' 끝 시설물 도형 — owner 2026-06-05: 범례 도형의 AutoShapeType + 색상으로 복제 (owner 제안).
        '   facId → SHEET_META_FAC row(2)=label → SHEET_META_LEG row(3)=label → row(1)=legendShapeName → 그 도형 찾음.
        '   범례 도형의 AutoShapeType·색 사용. 범례 못 찾으면 네트웍 도형 fallback, 그것도 실패하면 ⊗.
        Dim endLegendShp As Shape: Set endLegendShp = Nothing
        Dim endLabelStr As String: endLabelStr = ""
        Dim metaRowEnd As Variant
        metaRowEnd = MetaFindRow(SHEET_META_FAC, 1, parts(0))
        If Not IsEmpty(metaRowEnd) Then
            On Error Resume Next
            endLabelStr = CStr(metaRowEnd(2))
            On Error GoTo 0
        End If
        If Len(endLabelStr) > 0 Then
            Set endLegendShp = 선번연결_도구_범례도형_조회(endLabelStr)
        End If
        ' fallback — 네트웍 도형
        Dim endFacShpNw As Shape: Set endFacShpNw = Nothing
        If endLegendShp Is Nothing Then
            On Error Resume Next
            Set endFacShpNw = wsNw_pos.Shapes(parts(0))
            On Error GoTo 0
        End If

        Dim endFac As Shape
        If Not endLegendShp Is Nothing Then
            Set endFac = 선번연결_도구_시설물도형_복제(ws, PREFIX_PT_RADIAL & "end_" & CStr(k), _
                                                      ex, ey, END_FAC_R * 2, endLegendShp)
        Else
            Set endFac = 선번연결_도구_시설물도형_복제(ws, PREFIX_PT_RADIAL & "end_" & CStr(k), _
                                                      ex, ey, END_FAC_R * 2, endFacShpNw)
        End If
        endFac.OnAction = "선번연결_도구_방사형클릭"
        endFac.AlternativeText = "cbl=" & CStr(k)

        ' Owner: 끝 시설물에 배지번호 표시 (선택된 = 중앙 시설물은 제외 — 끝 시설물만)
        Dim otherId_b As String: otherId_b = parts(0)
        Dim badgeTxt As String: badgeTxt = ""
        On Error Resume Next
        badgeTxt = MetaLookupBadgeNo(otherId_b)
        On Error GoTo 0
        If Len(badgeTxt) > 0 Then
            Dim badgeShp As Shape
            ' 배지 = 작은 빨간 사각형 + 흰 글자. 끝 시설물 ⊗ 의 「라벨 반대쪽」 배치 — 라벨과 겹침 회피 (owner: 배지가 가려 안 보임).
            '   라벨 방향 (ang) 기준: 우측이면 배지를 좌상단, 그 외 (좌·상·하) 면 우상단.
            '   dxr/dyr 는 아래 이름표 섹션에서 다시 계산되므로 별도 변수로 inline 계산.
            Const BADGE_W As Double = 16
            Const BADGE_H As Double = 12
            Dim dxBadge As Double, dyBadge As Double
            dxBadge = Cos(ang): dyBadge = Sin(ang)
            Dim badgeX As Double, badgeY As Double
            If Abs(dxBadge) >= Abs(dyBadge) Then
                ' 라벨 = 가로방향 (좌·우) → 배지를 라벨 반대쪽 상단 모서리
                If dxBadge > 0 Then
                    ' 라벨 = 우측 → 배지 = 좌상단
                    badgeX = ex - END_FAC_R - BADGE_W + 4
                Else
                    ' 라벨 = 좌측 → 배지 = 우상단
                    badgeX = ex + END_FAC_R - 4
                End If
                badgeY = ey - END_FAC_R - BADGE_H + 2
            Else
                ' 라벨 = 세로방향 (상·하) → 배지를 ⊗ 옆 (오른쪽 가운데 높이) (owner: 위쪽 배지 가림 차단)
                badgeX = ex + END_FAC_R + 1
                badgeY = ey - BADGE_H / 2 + 1
            End If
            Set badgeShp = ws.Shapes.AddShape(msoShapeRectangle, badgeX, badgeY, BADGE_W, BADGE_H)
            badgeShp.Name = PREFIX_PT_RADIALLBL & "badge_" & CStr(k)
            badgeShp.OnAction = "선번연결_도구_방사형클릭"
            badgeShp.AlternativeText = "cbl=" & CStr(k)
            badgeShp.Placement = 3
            On Error Resume Next
            ' owner 요구 — 방사형 배지 바탕·글자색을 네트웍구성도와 동일 (밝은 청록 + 검정 글자, 테두리 없음).
            With badgeShp.Line: .Visible = msoFalse: End With
            With badgeShp.Fill: .ForeColor.RGB = BADGE_FILL_COLOR: .Visible = msoTrue: End With
            With badgeShp.TextFrame2
                .MarginLeft = 0: .MarginRight = 0: .MarginTop = 0: .MarginBottom = 0
                .VerticalAnchor = msoAnchorMiddle
                .WordWrap = msoFalse
                .TextRange.Text = badgeTxt
                .TextRange.Font.Name = CALLOUT_FONT_NAME
                .TextRange.Font.Size = 8
                .TextRange.Font.Bold = msoTrue
                .TextRange.Font.Fill.ForeColor.RGB = BADGE_TEXT_COLOR
                .TextRange.ParagraphFormat.Alignment = 1
            End With
            ' 배지 항상 최상단 — 라벨·시설물 도형에 가려 안 보이는 문제 차단
            badgeShp.ZOrder msoBringToFront
            On Error GoTo 0
        End If

        ' 이름표 — 끝 시설물 옆 (방향에 따라 좌/우/위/아래 자동 배치)
        Dim lblX As Double, lblY As Double
        Dim dxr As Double, dyr As Double
        dxr = Cos(ang): dyr = Sin(ang)
        If Abs(dxr) >= Abs(dyr) Then
            If dxr > 0 Then
                lblX = ex + END_FAC_R + 3
            Else
                lblX = ex - END_FAC_R - 3 - LBL_W
            End If
            lblY = ey - LBL_H / 2
        Else
            lblX = ex - LBL_W / 2
            If dyr > 0 Then lblY = ey + END_FAC_R + 2 Else lblY = ey - END_FAC_R - 2 - LBL_H
        End If
        Dim nameLbl As Shape
        Set nameLbl = ws.Shapes.AddShape(msoShapeRectangle, lblX, lblY, LBL_W, LBL_H)
        nameLbl.Name = PREFIX_PT_RADIALLBL & "name_" & CStr(k)
        nameLbl.OnAction = "선번연결_도구_방사형클릭"
        nameLbl.AlternativeText = "cbl=" & CStr(k)
        nameLbl.Placement = 3
        With nameLbl.Line: .ForeColor.RGB = RGB(148, 163, 184): .Weight = 0.5: .Visible = msoTrue: End With
        With nameLbl.Fill: .ForeColor.RGB = RGB(255, 255, 255): .Visible = msoTrue: End With
        ' owner #7: 시설물명에 ID (배지번호) 포함 — "[N] 이름" 형식
        ' owner 2026-06-06: MetaLookupBadgeNo 빈 결과 시 직접 시설물 메타 셀 (col E) 읽기 fallback
        Dim badgeForName As String: badgeForName = ""
        On Error Resume Next
        badgeForName = MetaLookupBadgeNo(CStr(parts(0)))
        On Error GoTo 0
        If Len(badgeForName) = 0 Then
            Dim wsFacR As Worksheet
            On Error Resume Next
            Set wsFacR = ThisWorkbook.Worksheets(SHEET_META_FAC)
            On Error GoTo 0
            If Not wsFacR Is Nothing Then
                Dim lastR As Long: lastR = wsFacR.Cells(wsFacR.Rows.Count, 1).End(xlUp).Row
                Dim rR As Long
                For rR = 2 To lastR
                    If CStr(wsFacR.Cells(rR, 1).Value) = CStr(parts(0)) Then
                        Dim colER As String: colER = CStr(wsFacR.Cells(rR, 5).Value)
                        If Len(colER) > 0 Then badgeForName = colER
                        Exit For
                    End If
                Next rR
            End If
        End If
        Dim nameTextFinal As String
        If Len(badgeForName) > 0 Then
            nameTextFinal = "[" & badgeForName & "] " & otherName
        Else
            nameTextFinal = otherName
        End If
        With nameLbl.TextFrame2
            .MarginLeft = 3: .MarginRight = 3: .MarginTop = 0: .MarginBottom = 0
            .VerticalAnchor = msoAnchorMiddle
            .WordWrap = msoFalse
            .TextRange.Text = nameTextFinal
            .TextRange.Font.Name = CALLOUT_FONT_NAME
            .TextRange.Font.Size = 8
            .TextRange.Font.Bold = msoTrue
            .TextRange.Font.Fill.ForeColor.RGB = RGB(30, 41, 59)
            .TextRange.ParagraphFormat.Alignment = 1
        End With

        ' owner 2026-06-07 (8-64): 「전체 매핑 X」 버튼 — 이 케이블의 모든 선번박스·화살표 일괄 삭제.
        '   라벨 바로 아래에 작은 빨강 버튼. AlternativeText 의 cbl=<케이블이름> 으로 대상 식별.
        Dim cblDelBtn As Shape
        Set cblDelBtn = ws.Shapes.AddShape(msoShapeRoundedRectangle, lblX, lblY + LBL_H + 1, LBL_W, 13)
        cblDelBtn.Name = PREFIX_PT_BTN & "cblDelAll_" & CStr(k)
        cblDelBtn.AlternativeText = "cbl=" & CStr(k)
        cblDelBtn.OnAction = "선번연결_도구_케이블전체연결삭제"
        cblDelBtn.Placement = 3
        On Error Resume Next
        With cblDelBtn.Line: .Visible = msoFalse: End With
        With cblDelBtn.Fill: .ForeColor.RGB = RGB(220, 38, 38): .Visible = msoTrue: End With
        With cblDelBtn.TextFrame2
            .MarginLeft = 1: .MarginRight = 1: .MarginTop = 0: .MarginBottom = 0
            .VerticalAnchor = msoAnchorMiddle
            .WordWrap = msoFalse
            .TextRange.Text = "전체 매핑 X"
            .TextRange.Font.Name = CALLOUT_FONT_NAME
            .TextRange.Font.Size = 7
            .TextRange.Font.Bold = msoTrue
            .TextRange.Font.Fill.ForeColor.RGB = RGB(255, 255, 255)
            .TextRange.ParagraphFormat.Alignment = 1
        End With
        On Error GoTo 0
    Next idx

    ' ──────────────────────────────────────────────────────────────────
    ' 기존 연결 목록 — Step 1 에서도 표시 (owner 요구).
    '   각 행: [X 삭제] 케이블A 「코어」 <-> 케이블B 「코어」
    '   케이블명은 cbl shape name 대신 다른 끝 시설물 이름으로 표시 (사용자 친화).
    ' ──────────────────────────────────────────────────────────────────
    Const LIST_TOP As Double = 145                   ' 텍스트 row 9 (y≈134) 아래
    Const LIST_X As Double = 36
    Const LIST_W As Double = 620                     ' 캔버스 (x=684) 왼쪽까지
    Const LIST_ROW_H As Double = 26
    Dim listExCount As Long: listExCount = 0
    If Not g_pt_existingConns Is Nothing Then listExCount = g_pt_existingConns.Count

    ' 헤더
    Dim listHdr As Shape
    Set listHdr = ws.Shapes.AddTextbox(msoTextOrientationHorizontal, LIST_X, LIST_TOP, LIST_W, 18)
    listHdr.Name = PREFIX_PT_BTN & "s1_listHdr"
    listHdr.Placement = 3
    On Error Resume Next
    listHdr.Line.Visible = msoFalse
    listHdr.Fill.Visible = msoFalse
    With listHdr.TextFrame2
        .MarginLeft = 0: .MarginRight = 0: .MarginTop = 0: .MarginBottom = 0
        .VerticalAnchor = msoAnchorMiddle
        Dim hdrTxt As String
        If listExCount > 0 Then
            hdrTxt = "[기존 연결 " & listExCount & " 건]   각 행 「X 삭제」 = 박스+화살표 영구 삭제"
        Else
            hdrTxt = "[기존 연결 0 건]   (이 시설물에 아직 만든 짝 없음)"
        End If
        .TextRange.Text = hdrTxt
        .TextRange.Font.Name = CALLOUT_FONT_NAME
        .TextRange.Font.Size = 11
        .TextRange.Font.Bold = msoTrue
        If listExCount > 0 Then
            .TextRange.Font.Fill.ForeColor.RGB = RGB(220, 38, 38)
        Else
            .TextRange.Font.Fill.ForeColor.RGB = RGB(100, 116, 139)
        End If
    End With
    On Error GoTo 0

    If listExCount > 0 Then
        ' 케이블별 「다른 끝 시설물 이름」 조회용 캐시 (Step 1 의 radial 정보 활용)
        Dim listIdx As Long: listIdx = 0
        Dim cKey As Variant
        For Each cKey In g_pt_existingConns.Keys
            Dim listRowY As Double: listRowY = LIST_TOP + 24 + listIdx * LIST_ROW_H
            Dim listParts() As String: listParts = Split(CStr(g_pt_existingConns(cKey)), "|")
            ' parts(0)=boxA, (1)=boxB, (2)=coresA, (3)=coresB, (4)=cableA, (5)=cableB
            If UBound(listParts) >= 5 Then
                Dim cableAName_s1 As String, cableBName_s1 As String
                cableAName_s1 = listParts(4): cableBName_s1 = listParts(5)
                Dim otherFacA As String, otherFacB As String
                otherFacA = 선번연결_도구_케이블타끝시설물명(cableAName_s1)
                otherFacB = 선번연결_도구_케이블타끝시설물명(cableBName_s1)
                Dim lblTxt_s1 As String
                lblTxt_s1 = "케이블 [→ " & otherFacA & "] 「" & listParts(2) & "」    <->    " & _
                            "케이블 [→ " & otherFacB & "] 「" & listParts(3) & "」"

                ' X 삭제 버튼 — 좌측
                Dim s1DelBtn As Shape
                Set s1DelBtn = ws.Shapes.AddShape(msoShapeRoundedRectangle, LIST_X, listRowY, 60, 22)
                s1DelBtn.Name = PREFIX_PT_BTN & "s1_exDel_" & listIdx
                s1DelBtn.AlternativeText = "arr=" & CStr(cKey)
                s1DelBtn.OnAction = "선번연결_도구_연결삭제"
                s1DelBtn.Placement = 3
                With s1DelBtn.Line: .Visible = msoFalse: End With
                With s1DelBtn.Fill: .ForeColor.RGB = RGB(239, 68, 68): .Visible = msoTrue: End With
                With s1DelBtn.TextFrame2
                    .MarginLeft = 2: .MarginRight = 2: .MarginTop = 0: .MarginBottom = 0
                    .VerticalAnchor = msoAnchorMiddle
                    .TextRange.Text = "X 삭제"
                    .TextRange.Font.Name = CALLOUT_FONT_NAME
                    .TextRange.Font.Size = 10
                    .TextRange.Font.Bold = msoTrue
                    .TextRange.Font.Fill.ForeColor.RGB = RGB(255, 255, 255)
                    .TextRange.ParagraphFormat.Alignment = 1
                End With

                ' 일부 해제 버튼 — X 삭제 옆 폭 55, 주황 (코어 단위 해제)
                Dim s1PartBtn As Shape
                Set s1PartBtn = ws.Shapes.AddShape(msoShapeRoundedRectangle, LIST_X + 64, listRowY, 55, 22)
                s1PartBtn.Name = PREFIX_PT_BTN & "s1_exPart_" & listIdx
                s1PartBtn.AlternativeText = "arr=" & CStr(cKey)
                s1PartBtn.OnAction = "선번연결_도구_연결부분해제"
                s1PartBtn.Placement = 3
                With s1PartBtn.Line: .Visible = msoFalse: End With
                With s1PartBtn.Fill: .ForeColor.RGB = RGB(245, 158, 11): .Visible = msoTrue: End With
                With s1PartBtn.TextFrame2
                    .MarginLeft = 2: .MarginRight = 2: .MarginTop = 0: .MarginBottom = 0
                    .VerticalAnchor = msoAnchorMiddle
                    .TextRange.Text = "일부"
                    .TextRange.Font.Name = CALLOUT_FONT_NAME
                    .TextRange.Font.Size = 10
                    .TextRange.Font.Bold = msoTrue
                    .TextRange.Font.Fill.ForeColor.RGB = RGB(255, 255, 255)
                    .TextRange.ParagraphFormat.Alignment = 1
                End With

                ' 선택 버튼 3개 — 「L」(좌측만) / 「양」(양쪽) / 「R」(우측만). owner 요구: 좌·우 개별 강조 가능.
                Dim selX As Double: selX = LIST_X + 123
                Dim selDefs As Variant
                selDefs = Array( _
                    Array("L", "L", RGB(99, 102, 241)), _
                    Array("양", "B", RGB(59, 130, 246)), _
                    Array("R", "R", RGB(168, 85, 247)) _
                )
                Dim si As Long
                For si = LBound(selDefs) To UBound(selDefs)
                    Dim s1SelBtn As Shape
                    Set s1SelBtn = ws.Shapes.AddShape(msoShapeRoundedRectangle, selX + si * 19, listRowY, 18, 22)
                    s1SelBtn.Name = PREFIX_PT_BTN & "s1_exSel" & CStr(selDefs(si)(1)) & "_" & listIdx
                    s1SelBtn.AlternativeText = "arr=" & CStr(cKey) & "|side=" & CStr(selDefs(si)(1))
                    s1SelBtn.OnAction = "선번연결_도구_연결강조"
                    s1SelBtn.Placement = 3
                    With s1SelBtn.Line: .Visible = msoFalse: End With
                    With s1SelBtn.Fill: .ForeColor.RGB = CLng(selDefs(si)(2)): .Visible = msoTrue: End With
                    With s1SelBtn.TextFrame2
                        .MarginLeft = 0: .MarginRight = 0: .MarginTop = 0: .MarginBottom = 0
                        .VerticalAnchor = msoAnchorMiddle
                        .TextRange.Text = CStr(selDefs(si)(0))
                        .TextRange.Font.Name = CALLOUT_FONT_NAME
                        .TextRange.Font.Size = 10
                        .TextRange.Font.Bold = msoTrue
                        .TextRange.Font.Fill.ForeColor.RGB = RGB(255, 255, 255)
                        .TextRange.ParagraphFormat.Alignment = 1
                    End With
                Next si

                ' 라벨 — 선택 버튼들 다음 (LIST_X + 123 + 3*19 = 180)
                Dim s1RowLbl As Shape
                Set s1RowLbl = ws.Shapes.AddTextbox(msoTextOrientationHorizontal, LIST_X + 184, listRowY, LIST_W - 184, 22)
                s1RowLbl.Name = PREFIX_PT_BTN & "s1_exRow_" & listIdx
                s1RowLbl.Placement = 3
                On Error Resume Next
                s1RowLbl.Line.Visible = msoFalse
                s1RowLbl.Fill.Visible = msoFalse
                On Error GoTo 0
                With s1RowLbl.TextFrame2
                    .MarginLeft = 0: .MarginRight = 0: .MarginTop = 0: .MarginBottom = 0
                    .VerticalAnchor = msoAnchorMiddle
                    .WordWrap = msoFalse                                 ' 8-62: 한 줄로 펼침
                    .TextRange.Text = lblTxt_s1
                    .TextRange.Font.Name = CALLOUT_FONT_NAME
                    .TextRange.Font.Size = 10
                    .TextRange.Font.Fill.ForeColor.RGB = RGB(51, 65, 85)
                    .AutoSize = msoAutoSizeShapeToFitText                ' 8-62: 텍스트 길이만큼 폭 자동
                End With
                On Error GoTo 0
            End If
            listIdx = listIdx + 1
        Next cKey
    End If

    On Error Resume Next
    ActiveWindow.DisplayGridlines = False
    ws.Range("A1").Select
    On Error GoTo 0

    ' owner 2026-06-07 (8-63): 도구 캔버스 도형 선택 차단 — 라벨·텍스트박스 선택 불가.
    '   DrawingObjects:=True + Locked=True(default) → 도형 선택·드래그·편집 모두 차단.
    '   OnAction 부착 버튼은 클릭 = 매크로 실행 정상 (선택 안 됨).
    ApplySheetProtection ws, True
End Sub

' 현재 기준 시설물 (g_pt_facId) 이 RN 종류인지 — 메타시트 kind 컬럼 OR 시설물명·라벨에서 fallback 검출.
'   RN 시설물은 입력 케이블·출력 케이블 두 개를 동시에 통과하므로 방사형 슬롯 한도 3 (케이블 2 + 시설물 1) 허용.
'   owner 환경에서 메타 kind 값이 "rn" 이 아닌 경우 (저장 누락·법인 카테고리 명) 의 fallback —
'     라벨(row(3)) 또는 시설물 콜아웃 텍스트에 "RN" 포함되면 RN 으로 인식.
' owner 2026-06-12: 판별 로직을 시설물_isRN (M2, 파라미터 버전) 으로 위임 — 단일 소스.
'   Step C 콤보 이후 「RN 이 양식 명칭에만 있는」 데이터 보정 (구분 substring + 범례 명칭 역조회) 포함.
Public Function 선번연결_도구_isRN() As Boolean
    선번연결_도구_isRN = False
    If Len(g_pt_facId) = 0 Then Exit Function
    Dim wsNw As Worksheet
    On Error Resume Next
    Set wsNw = ThisWorkbook.Worksheets(SHEET_NETWORK)
    On Error GoTo 0
    선번연결_도구_isRN = 시설물_isRN(wsNw, g_pt_facId)
End Function

' RN 시설물 규격 조회 — SHEET_META_FAC 의 6번째 컬럼 (spec).
'   형식: "2:16" / "1:3" / "1:16" (M:N) 또는 빈 문자열 (미설정).
'   라벨 prefix 동적 결정용 — 「i_1차_IN」 (2:16), 「m_2차_IN」 (1:3), 「s_3차_IN」 (1:16), 그 외 「rn_<spec>_IN」.
'   ⚠ 메타 컬럼: 1=facId / 2=kind / 3=name / 4=created_at / 5=badge_no / 6=spec (이 함수 대상).
'   MetaFindRow 의 row(5) 는 badge_no — spec 은 row(6). 안전 위해 cell 직접 접근으로 우회.
' owner 2026-06-05: RN 규격 조회 — 시설물 shape AlternativeText 에서 "rn_spec=M:N" 추출.
'   meta 시트 lookup 실패 위험 (row 누락, 캐시 미반영) 회피 — 시설물 자체에 spec 박힘.
'   하위호환: shape alt 에 없으면 meta col 6 도 시도 (기존 데이터 이전).
Public Function 선번연결_도구_RN규격조회() As String
    선번연결_도구_RN규격조회 = ""
    If Len(g_pt_facId) = 0 Then Exit Function

    ' 1차: 시설물 shape alt
    Dim wsNw As Worksheet
    On Error Resume Next
    Set wsNw = ThisWorkbook.Worksheets(SHEET_NETWORK)
    On Error GoTo 0
    If Not wsNw Is Nothing Then
        Dim shp As Shape: Set shp = Nothing
        On Error Resume Next
        Set shp = wsNw.Shapes(g_pt_facId)
        On Error GoTo 0
        If Not shp Is Nothing Then
            Dim alt As String: alt = ""
            On Error Resume Next: alt = shp.AlternativeText: On Error GoTo 0
            Dim p As Long: p = InStr(alt, "rn_spec=")
            If p > 0 Then
                Dim e As Long: e = InStr(p, alt, "|")
                If e = 0 Then e = Len(alt) + 1
                Dim vAlt As String: vAlt = Mid(alt, p + 8, e - (p + 8))
                If InStr(vAlt, ":") > 0 Then
                    선번연결_도구_RN규격조회 = vAlt
                    Exit Function
                End If
            End If
        End If
    End If

    ' 2차 (하위호환): meta 시트 col 6
    Dim ws As Worksheet
    On Error Resume Next
    Set ws = ThisWorkbook.Worksheets(SHEET_META_FAC)
    On Error GoTo 0
    If ws Is Nothing Then Exit Function
    Dim last As Long: last = ws.Cells(ws.Rows.Count, 1).End(xlUp).Row
    Dim r As Long
    For r = 2 To last
        If CStr(ws.Cells(r, 1).Value) = g_pt_facId Then
            Dim v As String: v = ""
            On Error Resume Next
            v = CStr(ws.Cells(r, 6).Value)
            On Error GoTo 0
            If InStr(v, ":") > 0 Then 선번연결_도구_RN규격조회 = v
            Exit Function
        End If
    Next r
End Function

' owner 2026-06-05: RN 규격 저장 — 시설물 shape AlternativeText 에 "rn_spec=M:N" 박음.
'   meta 시트 lookup 실패 위험 회피 (row 누락·캐시 미반영). 시설물 자체에 spec 영구 저장.
'   동시에 meta col 6 도 시도 (하위호환).
Public Sub 선번연결_도구_RN규격저장(spec As String)
    If Len(g_pt_facId) = 0 Then
        Application.StatusBar = "RN 규격저장 실패 — 시설물 ID 없음."
        Exit Sub
    End If

    ' === 1차: 시설물 shape alt ===
    Dim wsNw As Worksheet
    On Error Resume Next
    Set wsNw = ThisWorkbook.Worksheets(SHEET_NETWORK)
    On Error GoTo 0
    Dim shapeOk As Boolean: shapeOk = False
    If Not wsNw Is Nothing Then
        Dim shp As Shape: Set shp = Nothing
        On Error Resume Next
        Set shp = wsNw.Shapes(g_pt_facId)
        On Error GoTo 0
        If Not shp Is Nothing Then
            Dim alt As String: alt = ""
            On Error Resume Next: alt = shp.AlternativeText: On Error GoTo 0
            Dim p As Long: p = InStr(alt, "rn_spec=")
            Dim newAlt As String
            If p > 0 Then
                Dim e As Long: e = InStr(p, alt, "|")
                If e = 0 Then e = Len(alt) + 1
                Dim tail As String
                If e > Len(alt) Then tail = "" Else tail = Mid(alt, e)
                newAlt = Left(alt, p - 1) & "rn_spec=" & spec & tail
            Else
                If Len(alt) > 0 Then newAlt = alt & "|rn_spec=" & spec Else newAlt = "rn_spec=" & spec
            End If
            On Error Resume Next
            shp.AlternativeText = newAlt
            shapeOk = True
            On Error GoTo 0
        End If
    End If

    ' === 2차 (하위호환): meta 시트 col 6 ===
    Dim metaOk As Boolean: metaOk = False
    Dim ws As Worksheet
    On Error Resume Next
    Set ws = ThisWorkbook.Worksheets(SHEET_META_FAC)
    On Error GoTo 0
    If Not ws Is Nothing Then
        Dim last As Long: last = ws.Cells(ws.Rows.Count, 1).End(xlUp).Row
        Dim r As Long
        Dim found As Boolean: found = False
        For r = 2 To last
            If CStr(ws.Cells(r, 1).Value) = g_pt_facId Then
                ws.Cells(r, 6).Value = spec
                found = True
                metaOk = True
                Exit For
            End If
        Next r
        If Not found Then
            Dim newRow As Long: newRow = last + 1
            If newRow < 2 Then newRow = 2
            ws.Cells(newRow, 1).Value = g_pt_facId
            ws.Cells(newRow, 6).Value = spec
            metaOk = True
        End If
    End If

    If shapeOk Then
        Application.StatusBar = "RN 규격 저장됨 (shape) — " & g_pt_facId & " · " & spec
    ElseIf metaOk Then
        Application.StatusBar = "RN 규격 저장됨 (meta) — " & g_pt_facId & " · " & spec
    Else
        Application.StatusBar = "RN 규격저장 실패 — shape·meta 모두 접근 불가."
    End If
End Sub

' RN 규격 입력 다이얼로그 — 1/2/3 선택 또는 「M:N」 자유 입력.
'   1 = 1차 (2:16), 2 = 2차 (1:3), 3 = 3차 (1:16). owner 사양.
'   반환: 정규화된 spec 문자열 ("M:N") 또는 빈 문자열 (취소/잘못된 입력).
Public Function 선번연결_도구_RN규격입력() As String
    선번연결_도구_RN규격입력 = ""
    Dim prompt As String
    prompt = "RN 규격을 선택하세요:" & vbLf & vbLf & _
             "1 — 1차 RN  (2:16  —  i_1차_IN ↔ OUT_P 16개)" & vbLf & _
             "2 — 2차 RN  (1:3   —  m_2차_IN ↔ OUT_P 3개)" & vbLf & _
             "3 — 3차 RN  (1:16  —  s_3차_IN ↔ OUT_P 16개)" & vbLf & vbLf & _
             "또는 직접 입력 — 「M:N」 형식  (예: 1:8, 2:8, 1:4)"
    Dim inp As String
    inp = InputBox(prompt, "RN 규격 입력")
    If Len(Trim(inp)) = 0 Then Exit Function
    Dim t As String: t = Trim(inp)
    Select Case t
        Case "1": 선번연결_도구_RN규격입력 = "2:16"
        Case "2": 선번연결_도구_RN규격입력 = "1:3"
        Case "3": 선번연결_도구_RN규격입력 = "1:16"
        Case Else
            ' 자유 입력 검증 — "M:N" 형식만 허용
            Dim cp As Long: cp = InStr(t, ":")
            If cp > 1 Then
                Dim mPart As String, nPart As String
                mPart = Trim(Left(t, cp - 1))
                nPart = Trim(Mid(t, cp + 1))
                If IsNumeric(mPart) And IsNumeric(nPart) Then
                    If CLng(mPart) > 0 And CLng(nPart) > 0 Then
                        선번연결_도구_RN규격입력 = CStr(CLng(mPart)) & ":" & CStr(CLng(nPart))
                    End If
                End If
            End If
            If Len(선번연결_도구_RN규격입력) = 0 Then
                MsgBox "잘못된 규격 형식." & vbLf & "「1」/「2」/「3」 또는 「M:N」 형식 (예: 2:16) 입력하세요.", _
                       vbExclamation, "RN 규격"
            End If
    End Select
End Function

' RN 규격 → 라벨 prefix (i/m/s/rn) 결정. owner 사양 (소문자).
'   2:16 → "i_1차"  ·  1:3 → "m_2차"  ·  1:16 → "s_3차"  ·  그 외 → "rn_<spec>"
Public Function 선번연결_도구_RN규격라벨(spec As String) As String
    선번연결_도구_RN규격라벨 = ""
    If Len(spec) = 0 Then Exit Function
    Select Case spec
        Case "2:16": 선번연결_도구_RN규격라벨 = "i_1차"
        Case "1:3":  선번연결_도구_RN규격라벨 = "m_2차"
        Case "1:16": 선번연결_도구_RN규격라벨 = "s_3차"
        Case Else:   선번연결_도구_RN규격라벨 = "rn_" & Replace(spec, ":", "x")
    End Select
End Function

' 케이블 shape name → 케이블의 다른 끝 시설물 표시 (배지번호 + 이름) — radial 정보 캐시 활용.
'   cblName = facId 인 경우 (시설물 내부 박스 모드) → "내부"
'   배지번호 있으면 "[N] 이름" 형식 (owner 요구: 기존 연결 목록에 배지번호 표시).
Public Function 선번연결_도구_케이블타끝시설물명(cblName As String) As String
    선번연결_도구_케이블타끝시설물명 = "?"
    If cblName = g_pt_facId Then
        선번연결_도구_케이블타끝시설물명 = "내부"
        Exit Function
    End If
    If g_pt_radial Is Nothing Then Exit Function
    If g_pt_radial.Exists(cblName) Then
        ' value 형식: "otherId|otherName|spec|installation"
        Dim parts() As String: parts = Split(CStr(g_pt_radial(cblName)), "|")
        Dim otherId_l As String, otherName_l As String
        If UBound(parts) >= 0 Then otherId_l = parts(0)
        If UBound(parts) >= 1 Then otherName_l = parts(1) Else otherName_l = otherId_l
        Dim badge_l As String: badge_l = ""
        On Error Resume Next
        badge_l = MetaLookupBadgeNo(otherId_l)
        On Error GoTo 0
        If Len(badge_l) > 0 Then
            선번연결_도구_케이블타끝시설물명 = "[" & badge_l & "] " & otherName_l
        Else
            선번연결_도구_케이블타끝시설물명 = otherName_l
        End If
    End If
End Function

' ⊗ 모양 시설물 도형 — 원 + 안 X (msoShapeMathDivide 가까운 모양으로 fallback: 원 + 별도 라인 2개)
Public Function 선번연결_도구_시설물도형(ws As Worksheet, baseName As String, _
                                          cx As Double, cy As Double, diameter As Double, _
                                          fillC As Long, lineC As Long, lineW As Double) As Shape
    Dim r As Double: r = diameter / 2
    Dim sh As Shape
    Set sh = ws.Shapes.AddShape(msoShapeOval, cx - r, cy - r, diameter, diameter)
    sh.Name = baseName
    sh.Placement = 3
    On Error Resume Next
    With sh.Line: .ForeColor.RGB = lineC: .Weight = lineW: .Visible = msoTrue: End With
    With sh.Fill: .ForeColor.RGB = fillC: .Visible = msoTrue: End With
    On Error GoTo 0

    ' 안쪽 X — 두 선 (45° 대각선)
    Dim off As Double: off = r * 0.707
    Dim l1 As Shape, l2 As Shape
    Set l1 = ws.Shapes.AddLine(cx - off, cy - off, cx + off, cy + off)
    Set l2 = ws.Shapes.AddLine(cx + off, cy - off, cx - off, cy + off)
    l1.Name = baseName & "_x1"
    l2.Name = baseName & "_x2"
    l1.Placement = 3: l2.Placement = 3
    On Error Resume Next
    With l1.Line: .ForeColor.RGB = lineC: .Weight = lineW * 0.8: End With
    With l2.Line: .ForeColor.RGB = lineC: .Weight = lineW * 0.8: End With
    On Error GoTo 0
    Set 선번연결_도구_시설물도형 = sh
End Function

' owner 2026-06-05: label → 범례 도형 조회 (SHEET_META_LEG 역조회 + 도형 찾기).
'   row(3)=label 매치 + row(2)=kind 가 cable 이 아닌 행 (시설물 종류만) 의 row(1)=legendShapeName 으로 SHEET_ADMIN 에서 도형 찾음.
'   owner 후속: 「신설/가공」 같은 label 이 facility·cable 양쪽 사용 시 케이블 범례가 먼저 매치되던 버그 차단.
Public Function 선번연결_도구_범례도형_조회(label As String) As Shape
    Set 선번연결_도구_범례도형_조회 = Nothing
    If Len(Trim(label)) = 0 Then Exit Function

    Dim wsLeg As Worksheet
    On Error Resume Next
    Set wsLeg = ThisWorkbook.Worksheets(SHEET_META_LEG)
    On Error GoTo 0
    If wsLeg Is Nothing Then Exit Function

    Dim lastR As Long: lastR = wsLeg.Cells(wsLeg.Rows.Count, 1).End(xlUp).Row
    Dim r As Long
    Dim legendShapeName As String: legendShapeName = ""
    For r = 2 To lastR
        If CStr(wsLeg.Cells(r, 3).Value) = label Then
            Dim kindCheck As String: kindCheck = LCase(CStr(wsLeg.Cells(r, 2).Value))
            ' cable kind 제외 (시설물만)
            If kindCheck <> "cable" Then
                legendShapeName = CStr(wsLeg.Cells(r, 1).Value)
                Exit For
            End If
        End If
    Next r
    If Len(legendShapeName) = 0 Then Exit Function

    ' SHEET_ADMIN 에서 범례 도형 찾기
    Dim wsAdm As Worksheet
    On Error Resume Next
    Set wsAdm = ThisWorkbook.Worksheets(SHEET_ADMIN)
    On Error GoTo 0
    If wsAdm Is Nothing Then Exit Function

    Dim legShp As Shape: Set legShp = Nothing
    On Error Resume Next
    Set legShp = wsAdm.Shapes(legendShapeName)
    On Error GoTo 0
    Set 선번연결_도구_범례도형_조회 = legShp
End Function

' owner 2026-06-05: 방사형 끝 시설물을 네트웍 시설물 도형의 AutoShapeType + 실제 색상으로 복제.
'   가장 정확한 도형·색 재현 (kind 매핑 우회). nwShape Nothing 이면 fallback ⊗.
Public Function 선번연결_도구_시설물도형_복제(ws As Worksheet, baseName As String, _
                                              cx As Double, cy As Double, diameter As Double, _
                                              nwShape As Shape) As Shape
    Dim r As Double: r = diameter / 2
    Dim sh As Shape: Set sh = Nothing
    Dim shapeType As Long: shapeType = 0
    Dim lineC As Long: lineC = RGB(100, 116, 139)
    Dim fillC As Long: fillC = RGB(255, 255, 255)
    Dim addInnerX As Boolean: addInnerX = False

    ' 네트웍 도형 조회 — AutoShapeType + 색
    If Not nwShape Is Nothing Then
        On Error Resume Next
        shapeType = nwShape.AutoShapeType
        lineC = nwShape.Line.ForeColor.RGB
        fillC = nwShape.Fill.ForeColor.RGB
        On Error GoTo 0
    End If

    ' owner 2026-06-11: 그룹·자유형 (AutoShapeType 무효 — 양식 등록 복합 도형) 은 Copy/Paste 로 충실 재현.
    '   옛 동작은 fallback ⊗ 로 떨어져 「일부 시설물이 네트웍구성도 모양과 다르게」 보이던 원인.
    '   8-125-fix25 패턴: Paste 전 이름 집합 기록 → 새 이름 도형 = 진짜 pasted (폼컨트롤 오인 차단).
    If Not nwShape Is Nothing Then
        If shapeType <= 0 Then
            Dim beforeP As Object: Set beforeP = CreateObject("Scripting.Dictionary")
            Dim bsP As Shape
            On Error Resume Next
            For Each bsP In ws.Shapes
                beforeP(bsP.Name) = True
            Next bsP
            nwShape.Copy
            ws.Paste
            Dim pastedP As Shape: Set pastedP = Nothing
            For Each bsP In ws.Shapes
                If Not beforeP.Exists(bsP.Name) Then Set pastedP = bsP: Exit For
            Next bsP
            On Error GoTo 0
            If Not pastedP Is Nothing Then
                Dim clrDP As String: clrDP = ""
                On Error Resume Next
                ClearShapeOnActionRecursive pastedP, clrDP    ' 원본 핸들러·하이퍼링크 제거 (8-125-fix23)
                ' 크기 = diameter 에 맞춰 비례 축소 (큰 변 기준)
                Dim maxDimP As Double: maxDimP = pastedP.Width
                If pastedP.Height > maxDimP Then maxDimP = pastedP.Height
                If maxDimP > 0.001 Then
                    Dim scaleP As Double: scaleP = diameter / maxDimP
                    pastedP.LockAspectRatio = msoFalse
                    pastedP.Width = pastedP.Width * scaleP
                    pastedP.Height = pastedP.Height * scaleP
                End If
                pastedP.Left = cx - pastedP.Width / 2
                pastedP.Top = cy - pastedP.Height / 2
                pastedP.Name = baseName
                pastedP.Placement = 3
                On Error GoTo 0
                Set 선번연결_도구_시설물도형_복제 = pastedP
                Exit Function
            End If
        End If
    End If

    ' 도형 생성 — AutoShapeType 유효하면 그대로, 0 이면 fallback Oval+X
    If shapeType > 0 Then
        On Error Resume Next
        Set sh = ws.Shapes.AddShape(shapeType, cx - r, cy - r, diameter, diameter)
        On Error GoTo 0
    End If
    If sh Is Nothing Then
        ' fallback — Oval + X
        Set sh = ws.Shapes.AddShape(msoShapeOval, cx - r, cy - r, diameter, diameter)
        addInnerX = True
    End If

    sh.Name = baseName
    sh.Placement = 3
    On Error Resume Next
    With sh.Line: .ForeColor.RGB = lineC: .Weight = 1.5: .Visible = msoTrue: End With
    With sh.Fill: .ForeColor.RGB = fillC: .Visible = msoTrue: End With
    On Error GoTo 0

    If addInnerX Then
        Dim off As Double: off = r * 0.707
        Dim l1 As Shape, l2 As Shape
        Set l1 = ws.Shapes.AddLine(cx - off, cy - off, cx + off, cy + off)
        Set l2 = ws.Shapes.AddLine(cx + off, cy - off, cx - off, cy + off)
        l1.Name = baseName & "_x1"
        l2.Name = baseName & "_x2"
        l1.Placement = 3: l2.Placement = 3
        On Error Resume Next
        With l1.Line: .ForeColor.RGB = lineC: .Weight = 1.2: End With
        With l2.Line: .ForeColor.RGB = lineC: .Weight = 1.2: End With
        On Error GoTo 0
    End If

    Set 선번연결_도구_시설물도형_복제 = sh
End Function

' owner 2026-06-05: SHEET_META_FAC 의 row(2) 는 실제 kind 가 아닌 label (g_drawKind=g_legendLabel=MetaLookupLabel).
'   label → 실제 kind 매핑: SHEET_META_LEG 에서 row(3)=label 매치하는 행의 row(2)=kind 반환.
'   매치 실패 시 label 의 한국어 prefix 로 fallback (설치장소→facility, 시설물→station, 함체→closure, RN→rn).
Public Function 선번연결_도구_label_to_kind(label As String) As String
    선번연결_도구_label_to_kind = ""
    If Len(Trim(label)) = 0 Then Exit Function

    ' SHEET_META_LEG 역조회
    Dim wsLeg As Worksheet
    On Error Resume Next
    Set wsLeg = ThisWorkbook.Worksheets(SHEET_META_LEG)
    On Error GoTo 0
    If Not wsLeg Is Nothing Then
        Dim lastR As Long: lastR = wsLeg.Cells(wsLeg.Rows.Count, 1).End(xlUp).Row
        Dim r As Long
        For r = 2 To lastR
            If CStr(wsLeg.Cells(r, 3).Value) = label Then
                Dim kindV As String: kindV = CStr(wsLeg.Cells(r, 2).Value)
                ' owner 2026-06-12: 양식 명칭(9컬럼)에 "RN" 포함이면 rn 보정 —
                '   Step C 콤보 등록 시 kind 매핑이 명칭 정확일치만 처리해 "facility" 로 저장된 기존 데이터 대응.
                If LCase(kindV) <> "rn" And LCase(kindV) <> "cable" Then
                    Dim nmV As String: nmV = ""
                    On Error Resume Next
                    nmV = CStr(wsLeg.Cells(r, 9).Value)
                    On Error GoTo 0
                    If InStr(UCase(nmV), "RN") > 0 Then kindV = "rn"
                End If
                선번연결_도구_label_to_kind = kindV
                Exit Function
            End If
        Next r
    End If

    ' Fallback — label prefix 로 kind 추론 (역조회 실패 시)
    Dim t As String: t = LCase(Trim(label))
    If InStr(t, "rn") > 0 Then
        선번연결_도구_label_to_kind = "rn"
    ElseIf InStr(t, "함체") > 0 Then
        선번연결_도구_label_to_kind = "closure"
    ElseIf InStr(t, "설치장소") > 0 Then
        선번연결_도구_label_to_kind = "facility"
    ElseIf InStr(t, "시설물") > 0 Then
        선번연결_도구_label_to_kind = "station"
    End If
End Function

' owner 2026-06-05: 방사형 끝 시설물을 kind 별로 다른 도형·색상으로 그리는 helper.
'   범례 분류와 일치 — facility=설치장소(사각형), station=시설물(삼각형),
'                       closure=접속함체(원+X), rn=RN(원+R)
'   owner 후속: 색상은 케이블 색이 아닌 네트웍 시설물 도형의 실제 색 사용.
'   overrideLineC / overrideFillC: -1 이면 kind 기본 색, 그 외면 실제 색 (네트웍 도형에서 조회한 값)
Public Function 선번연결_도구_시설물도형_kind(ws As Worksheet, baseName As String, _
                                              cx As Double, cy As Double, diameter As Double, _
                                              kind As String, _
                                              Optional overrideLineC As Long = -1, _
                                              Optional overrideFillC As Long = -1) As Shape
    Dim r As Double: r = diameter / 2
    Dim sh As Shape
    Dim fillC As Long, lineC As Long
    Dim showInnerX As Boolean: showInnerX = False
    Dim innerText As String: innerText = ""
    Dim innerTextColor As Long: innerTextColor = 0

    Select Case LCase(Trim(kind))
        Case "facility"
            ' 설치장소 — 사각형
            Set sh = ws.Shapes.AddShape(msoShapeRectangle, cx - r, cy - r, diameter, diameter)
            fillC = RGB(255, 255, 255): lineC = RGB(59, 130, 246)
        Case "station"
            ' 시설물 (신규) — 삼각형 (꼭짓점 위)
            Set sh = ws.Shapes.AddShape(msoShapeIsoscelesTriangle, cx - r, cy - r, diameter, diameter)
            fillC = RGB(255, 255, 255): lineC = RGB(16, 185, 129)
        Case "rn"
            ' RN — 원 + R 글자
            Set sh = ws.Shapes.AddShape(msoShapeOval, cx - r, cy - r, diameter, diameter)
            fillC = RGB(254, 243, 199): lineC = RGB(245, 158, 11)
            innerText = "R": innerTextColor = RGB(180, 83, 9)
        Case "closure"
            ' 접속함체 — 원 + X
            Set sh = ws.Shapes.AddShape(msoShapeOval, cx - r, cy - r, diameter, diameter)
            fillC = RGB(255, 255, 255): lineC = RGB(168, 85, 247)
            showInnerX = True
        Case Else
            ' kind 미지정/미지원 — fallback ⊗ (회색)
            Set sh = ws.Shapes.AddShape(msoShapeOval, cx - r, cy - r, diameter, diameter)
            fillC = RGB(255, 255, 255): lineC = RGB(100, 116, 139)
            showInnerX = True
    End Select

    ' 네트웍 시설물 실제 색이 있으면 덮어쓰기 (owner: 범례 색 유지)
    If overrideLineC <> -1 Then lineC = overrideLineC
    If overrideFillC <> -1 Then fillC = overrideFillC

    sh.Name = baseName
    sh.Placement = 3
    On Error Resume Next
    With sh.Line: .ForeColor.RGB = lineC: .Weight = 1.5: .Visible = msoTrue: End With
    With sh.Fill: .ForeColor.RGB = fillC: .Visible = msoTrue: End With
    On Error GoTo 0

    If showInnerX Then
        ' 안쪽 X — 두 대각선
        Dim off As Double: off = r * 0.707
        Dim l1 As Shape, l2 As Shape
        Set l1 = ws.Shapes.AddLine(cx - off, cy - off, cx + off, cy + off)
        Set l2 = ws.Shapes.AddLine(cx + off, cy - off, cx - off, cy + off)
        l1.Name = baseName & "_x1"
        l2.Name = baseName & "_x2"
        l1.Placement = 3: l2.Placement = 3
        On Error Resume Next
        With l1.Line: .ForeColor.RGB = lineC: .Weight = 1.2: End With
        With l2.Line: .ForeColor.RGB = lineC: .Weight = 1.2: End With
        On Error GoTo 0
    End If

    If Len(innerText) > 0 Then
        ' 내부 글자 (RN 의 R 등)
        On Error Resume Next
        With sh.TextFrame2
            .MarginLeft = 0: .MarginRight = 0: .MarginTop = 0: .MarginBottom = 0
            .VerticalAnchor = msoAnchorMiddle
            .TextRange.Text = innerText
            .TextRange.Font.Name = CALLOUT_FONT_NAME
            .TextRange.Font.Size = CLng(diameter * 0.55)
            .TextRange.Font.Bold = msoTrue
            .TextRange.Font.Fill.ForeColor.RGB = innerTextColor
            .TextRange.ParagraphFormat.Alignment = 2
        End With
        On Error GoTo 0
    End If

    Set 선번연결_도구_시설물도형_kind = sh
End Function

' Step 1 방사형 클릭 핸들러 — 케이블 라인/끝시설물/이름표 클릭.
'   같은 케이블 두 번 선택 가능 (단일 케이블 내 접속 케이스). 슬롯 총 2개.
'   상태: dict<cblName, count> 에서 count 는 1 (한쪽 슬롯) 또는 2 (양쪽 슬롯).
'   동작:
'     - 빈 상태 → 클릭 X = {X:1}
'     - {X:1} → 같은 X 클릭 = {X:2} (단일 케이블 모드)
'     - {X:2} → 같은 X 클릭 = {} (해제)
'     - {X:1} → 다른 Y 클릭 = {X:1, Y:1}
'     - {X:1, Y:1} → X 또는 Y 클릭 = 그쪽 해제
'     - 슬롯 2개 모두 차면 다른 케이블 클릭 = 무시
Public Sub 선번연결_도구_방사형클릭()
    Dim nm As String: nm = Application.Caller
    Dim wsTool As Worksheet: Set wsTool = ThisWorkbook.Worksheets(SHEET_PAIR_TOOL)
    Dim sh As Shape: Set sh = Nothing
    On Error Resume Next
    Set sh = wsTool.Shapes(nm)
    On Error GoTo 0
    If sh Is Nothing Then Exit Sub

    Dim pickKey As String: pickKey = ""
    Dim isFacility As Boolean: isFacility = False

    ' 중앙 시설물 도형/라벨 — AlternativeText "facCenter=1"
    Dim alt As String: alt = ""
    On Error Resume Next
    alt = sh.AlternativeText
    On Error GoTo 0
    If InStr(alt, "facCenter=1") > 0 Then
        pickKey = g_pt_facId
        isFacility = True
    ElseIf Left(nm, Len(PREFIX_PT_RADIAL)) = PREFIX_PT_RADIAL Then
        pickKey = Mid(nm, Len(PREFIX_PT_RADIAL) + 1)
        If Left(pickKey, 4) = "end_" Then pickKey = Mid(pickKey, 5)
        If pickKey = "center" Then pickKey = g_pt_facId: isFacility = True
    ElseIf Left(nm, Len(PREFIX_PT_RADIALLBL)) = PREFIX_PT_RADIALLBL Then
        Dim pc As Long: pc = InStr(alt, "cbl=")
        If pc > 0 Then pickKey = Mid(alt, pc + 4)
    End If
    If Len(pickKey) = 0 Then Exit Sub
    If g_pt_radial Is Nothing Then Exit Sub
    ' 케이블 키는 g_pt_radial 에 있어야 함. 시설물 키는 패스.
    If Not isFacility Then
        If Not g_pt_radial.Exists(pickKey) Then Exit Sub
    End If

    If g_pt_pickedCables Is Nothing Then Set g_pt_pickedCables = CreateObject("Scripting.Dictionary")

    ' owner 변경 — RN 도 슬롯 한도 2 (RN + 케이블 1). 기존 3 슬롯 모드는 dead code 로 코드만 보존.
    Dim isRnNow As Boolean: isRnNow = 선번연결_도구_isRN()
    Dim maxSlots As Long: maxSlots = 2

    ' 현재 총 슬롯 수
    Dim total As Long: total = 선번연결_도구_총슬롯수()
    If g_pt_pickedCables.Exists(pickKey) Then
        Dim cur As Long: cur = CLng(g_pt_pickedCables(pickKey))
        If cur = 2 Then
            g_pt_pickedCables.Remove pickKey       ' 양쪽 슬롯 → 해제
        ElseIf cur = 1 Then
            ' RN 모드 — 단일 케이블 모드 비활성 (RN 통과는 항상 입력 ↔ 출력 케이블 2개 다른 것).
            '   같은 케이블 두 번째 클릭 = 토글 해제. 첫 클릭 후 다른 케이블 클릭으로 슬롯 채우는 흐름 보장.
            If isRnNow Then
                g_pt_pickedCables.Remove pickKey
            ElseIf total < maxSlots And Not isFacility Then
                g_pt_pickedCables(pickKey) = 2     ' 단일 케이블 모드 (시설물·RN 은 X)
            Else
                g_pt_pickedCables.Remove pickKey   ' 이쪽만 해제
            End If
        End If
    Else
        If total >= maxSlots Then
            Application.StatusBar = "이미 슬롯 " & maxSlots & " 개 차 있음. 선택 해제 후 다시 시도."
            Exit Sub
        End If
        ' 시설물은 슬롯 1개만 (RN 도 자기 자신 더블 카운트 X)
        g_pt_pickedCables(pickKey) = 1
    End If
    선번연결_도구_방사형색상갱신
End Sub

' 현재 선택된 총 슬롯 수 (Sum of counts)
Public Function 선번연결_도구_총슬롯수() As Long
    If g_pt_pickedCables Is Nothing Then 선번연결_도구_총슬롯수 = 0: Exit Function
    Dim n As Long: n = 0
    Dim k As Variant
    For Each k In g_pt_pickedCables.Keys: n = n + CLng(g_pt_pickedCables(k)): Next k
    선번연결_도구_총슬롯수 = n
End Function

' 방사형 라인·끝 시설물·라벨 색상 갱신.
'   count=1 → 빨강 강조 (한쪽 슬롯)
'   count=2 → 보라 강조 (양쪽 슬롯 — 단일 케이블 모드)
Public Sub 선번연결_도구_방사형색상갱신()
    Dim ws As Worksheet: Set ws = ThisWorkbook.Worksheets(SHEET_PAIR_TOOL)
    If g_pt_radial Is Nothing Then Exit Sub
    If g_pt_pickedCables Is Nothing Then Set g_pt_pickedCables = CreateObject("Scripting.Dictionary")

    ' owner #5: 케이블 기본 색상 = 네트웍구성도의 실제 케이블 색상 (범례 spec 별 색). 선택 시 노란 음영 hilite 토글.
    Dim wsNw As Worksheet
    On Error Resume Next
    Set wsNw = ThisWorkbook.Worksheets(SHEET_NETWORK)
    On Error GoTo 0

    Dim k As Variant
    For Each k In g_pt_radial.Keys
        Dim cnt As Long: cnt = 0
        If g_pt_pickedCables.Exists(k) Then cnt = CLng(g_pt_pickedCables(k))

        ' 기본 케이블 색 — 네트웍 시트 케이블 도형 색
        Dim baseCblColor As Long: baseCblColor = CBL_DEFAULT_COLOR
        If Not wsNw Is Nothing Then
            Dim cblShpRef As Shape: Set cblShpRef = Nothing
            On Error Resume Next
            Set cblShpRef = wsNw.Shapes(CStr(k))
            On Error GoTo 0
            If Not cblShpRef Is Nothing Then
                On Error Resume Next
                baseCblColor = cblShpRef.Line.ForeColor.RGB
                On Error GoTo 0
            End If
        End If

        Dim cblWeight As Double, nameLineW As Double, nameLineC As Long, nameFill As Long
        Dim badge As String: badge = ""
        Dim hiliteOn As Boolean: hiliteOn = False
        Select Case cnt
            Case 2
                cblWeight = CBL_LINE_WEIGHT + 2.5
                nameLineW = 2
                nameLineC = RGB(126, 34, 206)
                nameFill = RGB(233, 213, 255)
                badge = " *A=B"
                hiliteOn = True
            Case 1
                cblWeight = CBL_LINE_WEIGHT + 2
                nameLineW = 2
                nameLineC = RGB(220, 38, 38)
                nameFill = RGB(254, 226, 226)
                badge = " *"
                hiliteOn = True
            Case Else
                cblWeight = CBL_LINE_WEIGHT
                nameLineW = 0.5
                nameLineC = RGB(148, 163, 184)
                nameFill = RGB(255, 255, 255)
        End Select

        ' 노란 음영 토글 (owner #5: 선택 시 케이블 바닥에 노란 음영)
        Dim hilite As Shape: Set hilite = Nothing
        On Error Resume Next
        Set hilite = ws.Shapes(PREFIX_PT_RADIAL & "hilite_" & CStr(k))
        On Error GoTo 0
        If Not hilite Is Nothing Then
            On Error Resume Next
            hilite.Visible = IIf(hiliteOn, msoTrue, msoFalse)
            On Error GoTo 0
        End If

        Dim ln As Shape: Set ln = Nothing
        On Error Resume Next
        Set ln = ws.Shapes(PREFIX_PT_RADIAL & CStr(k))
        On Error GoTo 0
        If Not ln Is Nothing Then
            On Error Resume Next
            ln.Line.ForeColor.RGB = baseCblColor       ' 케이블 본연의 색상 유지 (owner #5)
            ln.Line.Weight = cblWeight
            On Error GoTo 0
        End If

        Dim endFac As Shape: Set endFac = Nothing
        On Error Resume Next
        Set endFac = ws.Shapes(PREFIX_PT_RADIAL & "end_" & CStr(k))
        On Error GoTo 0
        If Not endFac Is Nothing Then
            On Error Resume Next
            endFac.Line.ForeColor.RGB = baseCblColor   ' 시설물도 케이블 색상 동일 (owner #5)
            endFac.Line.Weight = nameLineW + 1
            On Error GoTo 0
            Dim x1 As Shape, x2 As Shape: Set x1 = Nothing: Set x2 = Nothing
            On Error Resume Next
            Set x1 = ws.Shapes(PREFIX_PT_RADIAL & "end_" & CStr(k) & "_x1")
            Set x2 = ws.Shapes(PREFIX_PT_RADIAL & "end_" & CStr(k) & "_x2")
            On Error GoTo 0
            If Not x1 Is Nothing Then x1.Line.ForeColor.RGB = baseCblColor
            If Not x2 Is Nothing Then x2.Line.ForeColor.RGB = baseCblColor
        End If

        Dim nameLbl As Shape: Set nameLbl = Nothing
        On Error Resume Next
        Set nameLbl = ws.Shapes(PREFIX_PT_RADIALLBL & "name_" & CStr(k))
        On Error GoTo 0
        If Not nameLbl Is Nothing Then
            On Error Resume Next
            ' owner #7: 이름 라벨에 ID 포함 — "[N] 이름 *"
            Dim parts() As String: parts = Split(CStr(g_pt_radial(k)), "|")
            Dim baseTxt As String: baseTxt = parts(1)
            Dim badgeId As String: badgeId = ""
            On Error Resume Next
            badgeId = MetaLookupBadgeNo(CStr(parts(0)))
            On Error GoTo 0
            Dim displayTxt As String
            If Len(badgeId) > 0 Then
                displayTxt = "[" & badgeId & "] " & baseTxt & badge
            Else
                displayTxt = baseTxt & badge
            End If
            nameLbl.TextFrame2.TextRange.Text = displayTxt
            nameLbl.Line.ForeColor.RGB = nameLineC
            nameLbl.Line.Weight = nameLineW
            nameLbl.Fill.ForeColor.RGB = nameFill
            On Error GoTo 0
        End If
    Next k

    ' 중앙 시설물 강조 — g_pt_facId 가 picked 에 있으면
    ' owner 2026-06-12: facC.Line 색 직접 변경 → 선택 링 (center_sel) visible 토글로 교체.
    '   중앙 도형이 네트웍 복제본이라 원래 색을 덮어쓰면 안 됨 (RN 빨간 원도 동일).
    Dim facSel As Boolean: facSel = g_pt_pickedCables.Exists(g_pt_facId)
    Dim facRing As Shape: Set facRing = Nothing
    On Error Resume Next
    Set facRing = ws.Shapes(PREFIX_PT_RADIAL & "center_sel")
    If Not facRing Is Nothing Then
        If facSel Then facRing.Visible = msoTrue Else facRing.Visible = msoFalse
    End If
    On Error GoTo 0

    ' 상태바 — 총 슬롯 + 모드 안내
    Dim total As Long: total = 선번연결_도구_총슬롯수()
    Dim hint As String: hint = ""
    Dim mk As Variant
    For Each mk In g_pt_pickedCables.Keys
        If CLng(g_pt_pickedCables(mk)) = 2 Then
            hint = "  ·  단일 케이블 모드 (같은 케이블 내 접속)"
            Exit For
        End If
    Next mk
    If Len(hint) = 0 And facSel Then
        If total = 2 Then
            hint = "  ·  시설물↔케이블 모드 (국사·RN 내부 접속)"
        Else
            hint = "  ·  중앙 시설물 선택됨 — 케이블 1개 더 선택"
        End If
    End If
    On Error Resume Next
    ws.Range("N31").Value = "선택 슬롯: " & total & " / 2" & hint
    On Error GoTo 0
End Sub

' Step 1 「✓ 선택」 버튼 — 슬롯 정확히 2개 충족 시 Step 2 진입.
'   3가지 모드:
'     - 일반 모드: 다른 케이블 2개 (count=1+1)
'     - 단일 케이블 모드: 같은 케이블 (count=2)
'     - 시설물↔케이블 모드: 중앙 시설물(count=1) + 케이블 1개(count=1)
Public Sub 선번연결_도구_케이블선택완료()
    If g_pt_pickedCables Is Nothing Then Set g_pt_pickedCables = CreateObject("Scripting.Dictionary")
    Dim total As Long: total = 선번연결_도구_총슬롯수()
    Dim isRN As Boolean: isRN = 선번연결_도구_isRN()
    Dim maxSlots As Long: maxSlots = 2          ' owner 변경 — RN 도 2 슬롯

    If total < 2 Or total > maxSlots Then
        MsgBox "선택 슬롯 2 개를 채워야 합니다." & vbLf & vbLf & _
               "현재 슬롯 " & total & " 개." & vbLf & _
               "• 서로 다른 케이블 2개 클릭, 또는" & vbLf & _
               "• 같은 케이블 두 번 클릭 (단일 케이블 모드), 또는" & vbLf & _
               "• 중앙 시설물 1개 + 케이블 1개 (시설물↔케이블 모드)" & _
               IIf(isRN, vbLf & "• [RN 모드] 중앙 RN 시설물 + 케이블 1개 (Cable ↔ RN IN/OUT 매핑)", ""), _
               vbExclamation, "코어 연결"
        Exit Sub
    End If

    ' owner 신규 — RN + 케이블 1개 (2 슬롯) RN1 모드.
    If isRN And total = 2 Then
        Dim has_fac_rn1 As Boolean: has_fac_rn1 = False
        Dim cblNameRn1 As String: cblNameRn1 = ""
        Dim kRn1 As Variant
        For Each kRn1 In g_pt_pickedCables.Keys
            If CStr(kRn1) = g_pt_facId Then
                has_fac_rn1 = True
            Else
                cblNameRn1 = CStr(kRn1)
            End If
        Next kRn1
        If has_fac_rn1 And Len(cblNameRn1) > 0 Then
            ' owner 2026-06-05: InputBox 흐름 제거 — 저장된 spec 있으면 사용, 없으면 빈 spec 전달.
            '   Step2진입_RN1 가 spec 비어있으면 시트 안 picker UI 로 자동 전환.
            Dim rnSpecRn1 As String: rnSpecRn1 = 선번연결_도구_RN규격조회()
            Dim rnLabelRn1 As String: rnLabelRn1 = 선번연결_도구_RN규격라벨(rnSpecRn1)
            선번연결_도구_Step2진입_RN1 cblNameRn1, rnSpecRn1, rnLabelRn1
            Exit Sub
        End If
        ' has_fac_rn1 = False 면 케이블 2개 → 일반 cable↔cable 진입 (아래로 폴백)
    End If

    ' === dead code (3-슬롯 RN 모드 — owner 보존 요청). maxSlots = 2 로 도달 안 함. ===
    If isRN And total = 3 Then
        Dim has_fac_rn As Boolean: has_fac_rn = False
        Dim cblName1 As String, cblName2 As String
        cblName1 = "": cblName2 = ""
        Dim kRN As Variant
        For Each kRN In g_pt_pickedCables.Keys
            If CStr(kRN) = g_pt_facId Then
                has_fac_rn = True
            Else
                If Len(cblName1) = 0 Then cblName1 = CStr(kRN) Else cblName2 = CStr(kRN)
            End If
        Next kRN
        If Not has_fac_rn Or Len(cblName1) = 0 Or Len(cblName2) = 0 Then
            MsgBox "RN 모드는 「중앙 RN 시설물 + 케이블 2개」 조합이어야 합니다.", vbExclamation, "코어 연결"
            Exit Sub
        End If
        ' owner 2026-06-05: InputBox 흐름 제거 — 저장된 spec 있으면 사용, 없으면 빈 spec 전달.
        '   Step2진입_RN 가 spec 비어있으면 시트 안 picker UI 로 자동 전환.
        Dim rnSpec As String: rnSpec = 선번연결_도구_RN규격조회()
        Dim rnLabel As String: rnLabel = 선번연결_도구_RN규격라벨(rnSpec)
        ' RN 3-column 모드로 진입 (Cable A | RN IN/OUT grid | Cable B)
        선번연결_도구_Step2진입_RN cblName1, cblName2, rnSpec, rnLabel
        Exit Sub
    End If

    Dim side1Type As String, side1Name As String
    Dim side2Type As String, side2Name As String
    side1Type = "": side1Name = "": side2Type = "": side2Name = ""

    Dim k As Variant
    For Each k In g_pt_pickedCables.Keys
        Dim cnt As Long: cnt = CLng(g_pt_pickedCables(k))
        Dim kType As String
        If CStr(k) = g_pt_facId Then kType = "facility" Else kType = "cable"

        If cnt = 2 Then
            ' 단일 케이블 모드 (시설물은 count=2 안 됨)
            side1Type = kType: side1Name = CStr(k)
            side2Type = kType: side2Name = CStr(k)
            Exit For
        Else
            If Len(side1Name) = 0 Then
                side1Type = kType: side1Name = CStr(k)
            Else
                side2Type = kType: side2Name = CStr(k)
            End If
        End If
    Next k

    ' 시설물 측을 항상 「side 1」 로 위치 (Cable A 슬롯에 표시되도록 — UI 일관성)
    If side2Type = "facility" And side1Type <> "facility" Then
        Dim tmpT As String, tmpN As String
        tmpT = side1Type: tmpN = side1Name
        side1Type = side2Type: side1Name = side2Name
        side2Type = tmpT: side2Name = tmpN
    End If

    선번연결_도구_Step2진입 side1Type, side1Name, side2Type, side2Name
End Sub

' ============================================================================
'  Step 2 — 코어 매핑 시트 빌드
' ============================================================================
'   세로 테이블 2개 (Cable A 좌·Cable B 우). 각 행 = 1 코어 (펼친 UNIT) / UNIT 라벨 1행 (접힘).
'   UNIT 기본 접힘 — UNIT 라벨 클릭 시 그 UNIT 의 코어 행만 펼침.
'   기존 박스 짝은 상단 「기존 연결」 섹션에 카드로 나열 (각각 X 삭제 버튼).
Public Sub 선번연결_도구_시트빌드()
    Dim ws As Worksheet
    On Error Resume Next
    Set ws = ThisWorkbook.Worksheets(SHEET_PAIR_TOOL)
    On Error GoTo 0
    If ws Is Nothing Then
        Set ws = ThisWorkbook.Worksheets.Add(After:=ThisWorkbook.Worksheets(ThisWorkbook.Worksheets.Count))
        ws.Name = SHEET_PAIR_TOOL
    End If
    ws.Visible = xlSheetVisible
    On Error Resume Next
    ws.Unprotect
    On Error GoTo 0

    ' Step 2 도형만 제거 — Step 1 (radial·navigation buttons) 만 보존.
    ' Step 1 의 「기존 연결 목록」 (s1_listHdr·s1_exDel_*·s1_exRow_*) 는 Step 2 의 row 11+ 와 겹치므로 제거 (owner: 글자 가림).
    Dim sh As Shape, i As Long
    For i = ws.Shapes.Count To 1 Step -1
        Set sh = ws.Shapes(i)
        Dim nm As String: nm = sh.Name
        ' Step 1 의 방사형 캔버스 도형 보존
        If Left(nm, Len(PREFIX_PT_RADIAL)) = PREFIX_PT_RADIAL Then GoTo NextShape
        If Left(nm, Len(PREFIX_PT_RADIALLBL)) = PREFIX_PT_RADIALLBL Then GoTo NextShape
        If Left(nm, Len(PREFIX_PT_BTN)) = PREFIX_PT_BTN Then
            ' owner 2026-06-12: 케이블별 「전체 매핑 X」 버튼 (cblDelAll_*) 은 Step 2 에서도 보존 —
            '   owner: Step 2 에서도 케이블 단위 매핑 일괄삭제 필요. 핸들러가 step 분기 재빌드 처리.
            '   (케이블 1개 시설물은 Step 1 을 건너뛰어 버튼이 생성 직후 여기서 삭제되던 것이
            '    「Step 1 빨간 버튼 안 보임」 보고의 원인이기도 했음)
            If InStr(nm, PREFIX_PT_BTN & "cblDelAll_") = 1 Then GoTo NextShape
            ' Step 1 의 list 흔적 (s1_listHdr / s1_ex*) 은 모두 제거 — Step 2 본문과 겹침
            ' owner 2026-06-06: s1_exSel 은 L/B/R 글자가 underscore 없이 붙어 매치 실패 (이전 s1_exSel_) →
            '   s1_ex 로 변경해 exDel/exRow/exSel{L/B/R}/exPart/exMerge 모두 매치.
            If InStr(nm, PREFIX_PT_BTN & "s1_listHdr") = 1 Or _
               InStr(nm, PREFIX_PT_BTN & "s1_ex") = 1 Then
                sh.Delete
                GoTo NextShape
            End If
            ' 그 외 s1_ (방사형 배경·내비 버튼) 보존
            If InStr(nm, PREFIX_PT_BTN & "s1_") = 1 Then GoTo NextShape
        End If
        ' 나머지 PT_ 흔적 (Step 2) 삭제 — RN 모드용 RIN/ROUT 도 포함
        If Left(nm, Len(PREFIX_PT_L)) = PREFIX_PT_L Or _
           Left(nm, Len(PREFIX_PT_R)) = PREFIX_PT_R Or _
           Left(nm, Len(PREFIX_PT_RIN)) = PREFIX_PT_RIN Or _
           Left(nm, Len(PREFIX_PT_ROUT)) = PREFIX_PT_ROUT Or _
           Left(nm, Len(PREFIX_PT_LINE)) = PREFIX_PT_LINE Or _
           Left(nm, Len(PREFIX_PT_BTN)) = PREFIX_PT_BTN Then sh.Delete
NextShape:
    Next i
    ' Row 1-15 명시 높이 — owner: B13 긴 italic 이 자동 wrap 으로 row 13 을 부풀려 row 15 status 가 exHdr 와 겹치던 버그 차단.
    On Error Resume Next
    ws.Rows("1:15").RowHeight = 16
    On Error GoTo 0

    ' owner 2026-06-05: RN 차수·규격 picker 모드 — 본 Step 2 빌드 생략, picker UI 만 렌더.
    '   사용자가 「확인」 → Step2진입_RN/RN1 재진입 → 본 빌드 자연 진행.
    If g_pt_rnPickerMode Then
        선번연결_도구_RN_picker렌더 ws
        On Error Resume Next
        Application.Goto ws.Range("A1"), True
        On Error GoTo 0
        Exit Sub
    End If

    ' Step 2 헤더 영역 — Step 1 cells (rows 6-9) 유지 + Step 2 정보 rows 11+ 에 (owner 요구: 버튼 안 가리게)
    Dim labelA As String, labelB As String
    If g_pt_side1Type = "facility" Then labelA = "시설물 A (내부):" Else labelA = "Cable A:"
    If g_pt_side2Type = "facility" Then labelB = "시설물 B (내부):" Else labelB = "Cable B:"
    ' owner 2026-06-05: Step 2 설명도 오른쪽 아래 (N33-N37) 로 이동.
    ws.Range("N33").Value = labelA
    ws.Range("O33").Value = "「" & g_pt_spec1 & "」 · " & g_pt_count1 & " 코어"
    ws.Range("N34").Value = labelB
    ws.Range("O34").Value = "「" & g_pt_spec2 & "」 · " & g_pt_count2 & " 코어"
    With ws.Range("N33:N34").Font: .Bold = True: .Name = CALLOUT_FONT_NAME: End With
    With ws.Range("O33:O34").Font: .Name = CALLOUT_FONT_NAME: End With

    ws.Range("N35").Value = "UNIT 「펼」 = 행 펼침/접기 (독립).  |  UNIT 「연결」 = UNIT 선택 (반대편 UNIT 과 1:1).  |  코어 클릭 = 추가/해제 토글.  |  Shift+코어 = 범위.  |  회색 = 잠금."
    With ws.Range("N35")
        With .Font: .Italic = True: .Size = 9: .Color = RGB(100, 116, 139): End With
        .WrapText = False
    End With

    ws.Range("N37").Value = "선택: A 0 / B 0     매핑: 0 쌍"
    With ws.Range("N37").Font: .Bold = True: .Size = 11: .Name = CALLOUT_FONT_NAME: End With

    ' Step 2 버튼 — y=45 (Step 1 버튼 y=10 바로 아래 row). 텍스트와 안 겹침.
    Dim btnY As Double: btnY = 45
    Dim btnX As Double: btnX = 36
    Const BTN_W As Double = 124
    Const BTN_H As Double = 28
    Const BTN_GAP As Double = 6

    Dim btnDefs As Variant
    If g_pt_releaseMode Or g_pt_rnReleaseMode Then
        ' 해제 모드 (일반 또는 RN) — 「해제 확인」 (rose) + 「취소」 (slate) 만 노출
        btnDefs = Array( _
            Array("해제 확인", "선번연결_도구_해제확인", RGB(220, 38, 38)), _
            Array("취소", "선번연결_도구_해제취소", RGB(100, 116, 139)) _
        )
    Else
        ' 박스추가 모드 — ON 시 보라 + "박스추가 ON" 라벨 (다음 「연결완료」 가 새 박스 페어 생성)
        Dim addBoxLabel As String, addBoxColor As Long
        If g_pt_addBoxMode Then
            addBoxLabel = "박스추가 ON"
            addBoxColor = RGB(168, 85, 247)              ' violet — 활성 상태 강조
        Else
            addBoxLabel = "+ 박스추가"
            addBoxColor = RGB(148, 163, 184)             ' slate — 비활성
        End If
        ' owner 2026-06-05: RN 모드일 때만 「RN 규격 변경」 버튼 노출 — 잘못 저장된 spec 정정용.
        If g_pt_rnMode Then
            btnDefs = Array( _
                Array("코어 연결", "선번연결_도구_다중선택", RGB(34, 197, 94)), _
                Array(addBoxLabel, "선번연결_도구_박스추가토글", addBoxColor), _
                Array("↺ 박스 정렬", "선번연결_도구_박스정렬", RGB(13, 148, 136)), _
                Array("RN 규격 변경", "선번연결_도구_RN규격변경", RGB(168, 85, 247)), _
                Array("전체 해제", "선번연결_도구_전체해제", RGB(100, 116, 139)), _
                Array("연결완료", "선번연결_도구_확인", RGB(59, 130, 246)), _
                Array("전체 펼치기/접기", "선번연결_도구_전체펼치기", RGB(217, 119, 6)) _
            )
        Else
            btnDefs = Array( _
                Array("코어 연결", "선번연결_도구_다중선택", RGB(34, 197, 94)), _
                Array(addBoxLabel, "선번연결_도구_박스추가토글", addBoxColor), _
                Array("↺ 박스 정렬", "선번연결_도구_박스정렬", RGB(13, 148, 136)), _
                Array("전체 해제", "선번연결_도구_전체해제", RGB(100, 116, 139)), _
                Array("연결완료", "선번연결_도구_확인", RGB(59, 130, 246)), _
                Array("전체 펼치기/접기", "선번연결_도구_전체펼치기", RGB(217, 119, 6)) _
            )
        End If
    End If
    Dim bi As Long
    For bi = LBound(btnDefs) To UBound(btnDefs)
        Dim btn As Shape
        Set btn = ws.Shapes.AddShape(msoShapeRoundedRectangle, btnX, btnY, BTN_W, BTN_H)
        btn.Name = PREFIX_PT_BTN & "main_" & bi
        btn.OnAction = CStr(btnDefs(bi)(1))
        btn.Placement = 3
        With btn.Line: .Visible = msoFalse: End With
        With btn.Fill
            .ForeColor.RGB = CLng(btnDefs(bi)(2))
            .Visible = msoTrue
        End With
        With btn.TextFrame2
            .MarginLeft = 4: .MarginRight = 4: .MarginTop = 2: .MarginBottom = 2
            .VerticalAnchor = msoAnchorMiddle
            .TextRange.Text = CStr(btnDefs(bi)(0))
            .TextRange.Font.Name = CALLOUT_FONT_NAME
            .TextRange.Font.Size = 11
            .TextRange.Font.Bold = msoTrue
            .TextRange.Font.Fill.ForeColor.RGB = RGB(255, 255, 255)
            .TextRange.ParagraphFormat.Alignment = 1
        End With
        btnX = btnX + BTN_W + BTN_GAP
    Next bi

    ' 기존 연결 섹션 (있는 경우만)
    ' row 1-15 각 16pt → 마지막 row 15 끝 y=240. 18pt 헤더 (EX_TOP-22) → y=258. status row (y≈225) 와 33pt clearance.
    Const EX_TOP As Double = 105                     ' owner 2026-06-05: 설명을 N28+ 로 옮긴 후 코어 연결 grid 를 위로 올리려 105 로 (이전 280)
    Const EX_ROW_H As Double = 30
    Const EX_X As Double = 36
    Const EX_W As Double = 540
    Dim tableTop As Double: tableTop = EX_TOP

    ' 기존 연결 헤더 — 항상 표시 (0 건이어도 owner 에게 섹션 존재 알림)
    Dim exCount As Long: exCount = 0
    If Not g_pt_existingConns Is Nothing Then exCount = g_pt_existingConns.Count

    Dim exHdrShp As Shape
    Set exHdrShp = ws.Shapes.AddTextbox(msoTextOrientationHorizontal, EX_X, EX_TOP - 22, EX_W, 18)
    exHdrShp.Name = PREFIX_PT_BTN & "exHdr"
    exHdrShp.Placement = 3
    On Error Resume Next
    exHdrShp.Line.Visible = msoFalse
    exHdrShp.Fill.Visible = msoFalse
    Dim hdrTxt As String
    If exCount > 0 Then
        hdrTxt = "[기존 연결 " & exCount & " 건]   회색 = 잠금.  「X 삭제」 = 박스+화살표 영구 삭제 + 잠금 해제."
    Else
        hdrTxt = "[기존 연결 0 건]   (아직 만든 짝 없음 — 매핑 후 「연결완료」 누르면 여기 카드 + 「X 삭제」 버튼 생김)"
    End If
    With exHdrShp.TextFrame2
        .MarginLeft = 0: .MarginRight = 0: .MarginTop = 0: .MarginBottom = 0
        .VerticalAnchor = msoAnchorMiddle
        .TextRange.Text = hdrTxt
        .TextRange.Font.Name = CALLOUT_FONT_NAME
        .TextRange.Font.Size = 11
        .TextRange.Font.Bold = msoTrue
        If exCount > 0 Then
            .TextRange.Font.Fill.ForeColor.RGB = RGB(220, 38, 38)
        Else
            .TextRange.Font.Fill.ForeColor.RGB = RGB(100, 116, 139)
        End If
    End With
    On Error GoTo 0

    ' owner 2026-06-11: 「매핑 전체 X」 — Step 2 에서도 기존 연결 일괄 삭제 (owner 요청).
    '   [기존 연결 N 건] 헤더 우측. 목록의 모든 건 (RN 그룹 포함) 을 confirm 후 한 번에 삭제.
    If exCount > 0 Then
        Dim exDelAllBtn As Shape
        Set exDelAllBtn = ws.Shapes.AddShape(msoShapeRoundedRectangle, EX_X + EX_W + 8, EX_TOP - 24, 96, 20)
        exDelAllBtn.Name = PREFIX_PT_BTN & "exDelAll"
        exDelAllBtn.OnAction = "선번연결_도구_매핑전체삭제"
        exDelAllBtn.Placement = 3
        On Error Resume Next
        With exDelAllBtn.Line: .Visible = msoFalse: End With
        With exDelAllBtn.Fill: .ForeColor.RGB = RGB(220, 38, 38): .Visible = msoTrue: End With
        With exDelAllBtn.TextFrame2
            .MarginLeft = 2: .MarginRight = 2: .MarginTop = 0: .MarginBottom = 0
            .VerticalAnchor = msoAnchorMiddle
            .TextRange.Text = "매핑 전체 X"
            .TextRange.Font.Name = CALLOUT_FONT_NAME
            .TextRange.Font.Size = 9
            .TextRange.Font.Bold = msoTrue
            .TextRange.Font.Fill.ForeColor.RGB = RGB(255, 255, 255)
            .TextRange.ParagraphFormat.Alignment = 1
        End With
        On Error GoTo 0
    End If

    If exCount > 0 Then
        Dim k As Variant, idx As Long: idx = 0
        For Each k In g_pt_existingConns.Keys
            Dim rowY As Double: rowY = EX_TOP + idx * EX_ROW_H
            Dim parts() As String: parts = Split(CStr(g_pt_existingConns(k)), "|")
            ' owner 2026-06-06: 「기존 연결」 row 라벨에 cable 반대편 시설물 배지 추가 (A, B 구분).
            '   parts(4) = cable A name, parts(5) = cable B name (RN1 모드는 facId).
            Dim badgeA_lbl As String: badgeA_lbl = 케이블_반대편_배지(parts(4))
            Dim badgeB_lbl As String: badgeB_lbl = 케이블_반대편_배지(parts(5))
            Dim aPfx As String: aPfx = "": If Len(badgeA_lbl) > 0 Then aPfx = "[" & badgeA_lbl & "] "
            Dim bPfx As String: bPfx = "": If Len(badgeB_lbl) > 0 Then bPfx = "[" & badgeB_lbl & "] "
            Dim labelTxt As String
            labelTxt = "A: " & aPfx & "「" & parts(2) & "」    <->    B: " & bPfx & "「" & parts(3) & "」"
            ' 메시지 라벨 — X 삭제(70) + 일부해제(75) 다음
            Dim rowLbl As Shape
            ' 라벨 위치 — X 삭제(70) + 일부 해제(75) + + 코어(60) = 우측 시작 EX_X + 211
            Set rowLbl = ws.Shapes.AddTextbox(msoTextOrientationHorizontal, EX_X + 215, rowY, EX_W - 215, 24)
            rowLbl.Name = PREFIX_PT_BTN & "exRow_" & idx
            rowLbl.Placement = 3
            On Error Resume Next
            rowLbl.Line.Visible = msoFalse
            rowLbl.Fill.Visible = msoFalse
            With rowLbl.TextFrame2
                .MarginLeft = 0: .MarginRight = 0: .MarginTop = 0: .MarginBottom = 0
                .VerticalAnchor = msoAnchorMiddle
                .WordWrap = msoFalse                                 ' 8-62: 한 줄로 펼침 (잘림 방지)
                .TextRange.Text = labelTxt
                .TextRange.Font.Name = CALLOUT_FONT_NAME
                .TextRange.Font.Size = 10
                .TextRange.Font.Fill.ForeColor.RGB = RGB(51, 65, 85)
                .AutoSize = msoAutoSizeShapeToFitText                ' 8-62: 텍스트 길이만큼 폭 자동 (긴 선번 안 잘림)
            End With
            On Error GoTo 0

            ' 「X 삭제」 버튼 — 폭 70, 빨강. owner 가 명확히 보고 누를 수 있게.
            Dim delBtn As Shape
            Set delBtn = ws.Shapes.AddShape(msoShapeRoundedRectangle, EX_X, rowY, 70, 24)
            delBtn.Name = PREFIX_PT_BTN & "exDel_" & idx
            delBtn.AlternativeText = "arr=" & CStr(k)
            delBtn.OnAction = "선번연결_도구_연결삭제"
            delBtn.Placement = 3
            With delBtn.Line: .Visible = msoFalse: End With
            With delBtn.Fill: .ForeColor.RGB = RGB(239, 68, 68): .Visible = msoTrue: End With
            With delBtn.TextFrame2
                .MarginLeft = 2: .MarginRight = 2: .MarginTop = 0: .MarginBottom = 0
                .VerticalAnchor = msoAnchorMiddle
                .TextRange.Text = "X 삭제"
                .TextRange.Font.Name = CALLOUT_FONT_NAME
                .TextRange.Font.Size = 10
                .TextRange.Font.Bold = msoTrue
                .TextRange.Font.Fill.ForeColor.RGB = RGB(255, 255, 255)
                .TextRange.ParagraphFormat.Alignment = 1
            End With

            ' 「일부 해제」 버튼 — X 삭제 옆 폭 75, 주황. 코어 일부만 해제.
            Dim partBtn As Shape
            Set partBtn = ws.Shapes.AddShape(msoShapeRoundedRectangle, EX_X + 74, rowY, 75, 24)
            partBtn.Name = PREFIX_PT_BTN & "exPart_" & idx
            partBtn.AlternativeText = "arr=" & CStr(k)
            partBtn.OnAction = "선번연결_도구_연결부분해제"
            partBtn.Placement = 3
            With partBtn.Line: .Visible = msoFalse: End With
            With partBtn.Fill: .ForeColor.RGB = RGB(245, 158, 11): .Visible = msoTrue: End With
            With partBtn.TextFrame2
                .MarginLeft = 2: .MarginRight = 2: .MarginTop = 0: .MarginBottom = 0
                .VerticalAnchor = msoAnchorMiddle
                .TextRange.Text = "일부 해제"
                .TextRange.Font.Name = CALLOUT_FONT_NAME
                .TextRange.Font.Size = 10
                .TextRange.Font.Bold = msoTrue
                .TextRange.Font.Fill.ForeColor.RGB = RGB(255, 255, 255)
                .TextRange.ParagraphFormat.Alignment = 1
            End With

            ' owner 2026-06-05: 「+ 코어」 버튼 — 일부 해제 옆 폭 60, teal. 클릭 시 다음 「연결완료」 가 이 entry 박스에 머지.
            '   머지 타깃이 현재 entry 면 보라 강조 (ON 표시).
            Dim addCoreBtn As Shape
            Set addCoreBtn = ws.Shapes.AddShape(msoShapeRoundedRectangle, EX_X + 153, rowY, 60, 24)
            addCoreBtn.Name = PREFIX_PT_BTN & "exMergeTo_" & idx
            addCoreBtn.AlternativeText = "arr=" & CStr(k)
            addCoreBtn.OnAction = "선번연결_도구_머지타깃설정"
            addCoreBtn.Placement = 3
            With addCoreBtn.Line: .Visible = msoFalse: End With
            Dim addCoreColor As Long
            If g_pt_mergeTargetArrName = CStr(k) Then
                addCoreColor = RGB(168, 85, 247)        ' violet — 활성
            Else
                addCoreColor = RGB(13, 148, 136)        ' teal — 비활성
            End If
            With addCoreBtn.Fill: .ForeColor.RGB = addCoreColor: .Visible = msoTrue: End With
            With addCoreBtn.TextFrame2
                .MarginLeft = 2: .MarginRight = 2: .MarginTop = 0: .MarginBottom = 0
                .VerticalAnchor = msoAnchorMiddle
                If g_pt_mergeTargetArrName = CStr(k) Then
                    .TextRange.Text = "+ 코어 ON"
                Else
                    .TextRange.Text = "+ 코어"
                End If
                .TextRange.Font.Name = CALLOUT_FONT_NAME
                .TextRange.Font.Size = 10
                .TextRange.Font.Bold = msoTrue
                .TextRange.Font.Fill.ForeColor.RGB = RGB(255, 255, 255)
                .TextRange.ParagraphFormat.Alignment = 1
            End With
            idx = idx + 1
        Next k
        ' owner 2026-06-06: 기존 연결 수 증가 시 패딩 확대 (16 → 40). 두 건째 row 의 버튼이 매핑 UI 헤더와 겹치던 문제 해결.
        tableTop = EX_TOP + exCount * EX_ROW_H + 40
    Else
        ' 0건이어도 헤더는 보이고, 테이블은 헤더 아래로
        tableTop = EX_TOP + 20
    End If

    ' 세로 테이블 — Cable A (좌) | Cable B (우). 각 행 = 1 코어 (펼친 UNIT) 또는 UNIT 라벨 (접힘).
    Const TBL_ROW_H As Double = 20
    Const TBL_UNIT_W As Double = 60                  ' UNIT 컬럼 폭
    Const TBL_NUM_W As Double = 56                   ' 선번 컬럼 폭
    Const TBL_HDR_H As Double = 22                   ' 헤더 행 높이
    Const TBL_AB_GAP As Double = 60                  ' A 테이블 ↔ B 테이블 사이
    Const TBL_X_A_LEFT As Double = 36

    Dim xA_unit As Double: xA_unit = TBL_X_A_LEFT
    Dim xA_num As Double: xA_num = xA_unit + TBL_UNIT_W
    ' owner 2026-06-05: 캔버스 위 정보 행 — 케이블별 양 끝 시설물·배지·선택코어 카운트.
    '   시트빌드 가 placeholder 텍스트박스 생성 → 시각갱신 이 매 클릭마다 텍스트 갱신.
    Const INFO_ROW_H As Double = 20
    Const INFO_ROW_GAP As Double = 4
    Dim infoTop As Double: infoTop = tableTop
    Dim hdrTop As Double: hdrTop = infoTop + INFO_ROW_H + INFO_ROW_GAP
    Dim bodyTop As Double

    If g_pt_rnMode Then
        ' owner 2026-06-05: 새 RN 레이아웃 — 좌(입출력 라벨 + 포트번호) | 우(Cable A 선번/UNIT) [+ Cable B]
        '   좌측 「입출력」 컬럼: in(i) 시안 + out(m·s·p) 핑크 (정보용 — 클릭 X)
        '   좌측 「{tier}차」 컬럼: 포트 번호 (클릭 가능)
        '   우측 Cable 테이블: 기존 사이드빌드 재사용 (선번/UNIT)
        Const RN_LBL_W As Double = 72                ' 입출력 라벨 컬럼 폭
        Const RN_PORT_W As Double = 56               ' 포트번호 컬럼 폭
        Const RN_LR_GAP As Double = 36               ' 좌 RN ↔ 우 Cable A 사이
        Const RN_AB_GAP As Double = 24               ' Cable A ↔ Cable B 사이

        Dim xRN_lbl As Double: xRN_lbl = xA_unit
        Dim xRN_port As Double: xRN_port = xRN_lbl + RN_LBL_W
        Dim xCA_num As Double: xCA_num = xRN_port + RN_PORT_W + RN_LR_GAP
        Dim xCA_unit As Double: xCA_unit = xCA_num + TBL_NUM_W

        Dim tier As Long: tier = g_pt_rnTier
        If tier <= 0 Or tier > 3 Then tier = 1
        Dim tierLbl As String: tierLbl = 선번연결_도구_RN차수표시(tier)   ' "1차" / "2차" / "3차"

        ' 좌측 RN 테이블 헤더
        선번연결_도구_헤더셀 ws, "hdrRLBL", xRN_lbl, hdrTop, RN_LBL_W, TBL_HDR_H, "입출력"
        선번연결_도구_헤더셀 ws, "hdrRPORT", xRN_port, hdrTop, RN_PORT_W, TBL_HDR_H, tierLbl

        ' 우측 Cable A 헤더
        선번연결_도구_헤더셀 ws, "hdrAN", xCA_num, hdrTop, TBL_NUM_W, TBL_HDR_H, "선번"
        선번연결_도구_헤더셀 ws, "hdrAU", xCA_unit, hdrTop, TBL_UNIT_W, TBL_HDR_H, "UNIT"

        ' Cable B (2-케이블 RN 모드 — RN1 모드면 g_pt_cbl2Name == g_pt_cbl1Name 이라 isTwoCable = False)
        Dim isTwoCable As Boolean
        isTwoCable = (Len(g_pt_cbl2Name) > 0 And g_pt_cbl2Name <> g_pt_cbl1Name)
        Dim xCB_num As Double, xCB_unit As Double
        If isTwoCable Then
            xCB_num = xCA_unit + TBL_UNIT_W + RN_AB_GAP
            xCB_unit = xCB_num + TBL_NUM_W
            선번연결_도구_헤더셀 ws, "hdrBN", xCB_num, hdrTop, TBL_NUM_W, TBL_HDR_H, "선번"
            선번연결_도구_헤더셀 ws, "hdrBU", xCB_unit, hdrTop, TBL_UNIT_W, TBL_HDR_H, "UNIT"
        End If

        bodyTop = hdrTop + TBL_HDR_H

        ' owner 2026-06-05: 캔버스 위 정보 행 (RN 모드) — 시각갱신 가 텍스트 채움.
        선번연결_도구_사이드정보빌드 ws, "info_rn", xRN_lbl, infoTop, RN_LBL_W + RN_PORT_W, INFO_ROW_H
        선번연결_도구_사이드정보빌드 ws, "info_cblA", xCA_num, infoTop, TBL_NUM_W + TBL_UNIT_W, INFO_ROW_H
        If isTwoCable Then
            선번연결_도구_사이드정보빌드 ws, "info_cblB", xCB_num, infoTop, TBL_NUM_W + TBL_UNIT_W, INFO_ROW_H
        End If

        ' 좌측 RN 포트 빌드 (in 위 + out 아래)
        선번연결_도구_RN사이드빌드 ws, xRN_lbl, xRN_port, bodyTop, RN_LBL_W, RN_PORT_W, TBL_ROW_H, tier

        ' 우측 Cable A 빌드
        선번연결_도구_사이드빌드 ws, "A", xCA_unit, xCA_num, bodyTop, TBL_UNIT_W, TBL_NUM_W, TBL_ROW_H, _
                                g_pt_count1, g_pt_unitSize1, g_pt_expandedA
        ' Cable B 빌드 (2-cable RN 모드만)
        If isTwoCable Then
            선번연결_도구_사이드빌드 ws, "B", xCB_unit, xCB_num, bodyTop, TBL_UNIT_W, TBL_NUM_W, TBL_ROW_H, _
                                    g_pt_count2, g_pt_unitSize2, g_pt_expandedB
        End If
    Else
        ' 일반 2-column 레이아웃 (기존)
        Dim xB_num As Double: xB_num = xA_num + TBL_NUM_W + TBL_AB_GAP
        Dim xB_unit As Double: xB_unit = xB_num + TBL_NUM_W

        ' owner 2026-06-05: 캔버스 위 정보 행 (cable-cable 모드)
        선번연결_도구_사이드정보빌드 ws, "info_cblA", xA_unit, infoTop, TBL_UNIT_W + TBL_NUM_W, INFO_ROW_H
        선번연결_도구_사이드정보빌드 ws, "info_cblB", xB_num, infoTop, TBL_NUM_W + TBL_UNIT_W, INFO_ROW_H

        선번연결_도구_헤더셀 ws, "hdrAU", xA_unit, hdrTop, TBL_UNIT_W, TBL_HDR_H, "UNIT"
        선번연결_도구_헤더셀 ws, "hdrAN", xA_num, hdrTop, TBL_NUM_W, TBL_HDR_H, "코어"
        선번연결_도구_헤더셀 ws, "hdrBN", xB_num, hdrTop, TBL_NUM_W, TBL_HDR_H, "코어"
        선번연결_도구_헤더셀 ws, "hdrBU", xB_unit, hdrTop, TBL_UNIT_W, TBL_HDR_H, "UNIT"

        bodyTop = hdrTop + TBL_HDR_H
        선번연결_도구_사이드빌드 ws, "A", xA_unit, xA_num, bodyTop, TBL_UNIT_W, TBL_NUM_W, TBL_ROW_H, _
                                g_pt_count1, g_pt_unitSize1, g_pt_expandedA
        선번연결_도구_사이드빌드 ws, "B", xB_unit, xB_num, bodyTop, TBL_UNIT_W, TBL_NUM_W, TBL_ROW_H, _
                                g_pt_count2, g_pt_unitSize2, g_pt_expandedB
    End If

    ' Gridlines off + scroll to top
    On Error Resume Next
    ActiveWindow.DisplayGridlines = False
    ws.Range("A1").Select
    On Error GoTo 0

    ' owner 2026-06-07 (8-63): Step 2 빌드 후에도 도형 선택 차단 (방사형빌드 와 동일 패턴).
    ApplySheetProtection ws, True
End Sub

' RN 가운데 컬럼 빌드 — IN N개 + OUT N개. 각 박스 클릭 시 선번연결_도구_클릭 가 RN_IN/RN_OUT 사이드로 인식.
'   shape name = PREFIX_PT_RIN & coreN  /  PREFIX_PT_ROUT & coreN
' owner 2026-06-05: 새 RN 포트 빌드 — owner 첨부 이미지 사양.
'   좌측 「입출력」 라벨 컬럼 (in(i) 시안 / out(m·s·p) 핑크 — 정보용, 클릭 X)
'   우측 「{tier}차」 포트번호 컬럼 (클릭 가능 — PREFIX_PT_RIN / PREFIX_PT_ROUT 이름 유지)
'   in 행 N 개 위 + out 행 M 개 아래 (세로로 연속).
Public Sub 선번연결_도구_RN사이드빌드(ws As Worksheet, lblX As Double, portX As Double, _
                                       topY As Double, lblW As Double, portW As Double, _
                                       rowH As Double, tier As Long)
    Dim outLbl As String: outLbl = 선번연결_도구_RN차수출력라벨(tier)   ' m / s / p

    Dim i As Long, y As Double
    y = topY

    ' === IN 행 N 개 (in(i) 시안) ===
    For i = 1 To g_pt_rnInCount
        ' 입출력 라벨 (정보용 — OnAction 없음)
        Dim inLblBx As Shape
        Set inLblBx = ws.Shapes.AddShape(msoShapeRectangle, lblX, y, lblW, rowH)
        inLblBx.Name = PREFIX_PT_BTN & "rnInLbl_" & i
        inLblBx.Placement = 3
        With inLblBx.Line: .ForeColor.RGB = RGB(148, 163, 184): .Weight = 0.5: .Visible = msoTrue: End With
        With inLblBx.Fill: .ForeColor.RGB = RGB(186, 230, 253): .Visible = msoTrue: End With  ' sky-200 (시안)
        With inLblBx.TextFrame2
            .MarginLeft = 2: .MarginRight = 2: .MarginTop = 0: .MarginBottom = 0
            .VerticalAnchor = msoAnchorMiddle
            .TextRange.Text = "in(i)"
            .TextRange.Font.Name = CALLOUT_FONT_NAME
            .TextRange.Font.Size = 10
            .TextRange.Font.Bold = msoTrue
            .TextRange.Font.Fill.ForeColor.RGB = RGB(15, 23, 42)        ' slate-900
            .TextRange.ParagraphFormat.Alignment = 2
        End With

        ' 포트번호 박스 (클릭 가능)
        Dim inBox As Shape
        Set inBox = ws.Shapes.AddShape(msoShapeRectangle, portX, y, portW, rowH)
        inBox.Name = PREFIX_PT_RIN & i
        inBox.OnAction = "선번연결_도구_클릭"
        inBox.Placement = 3
        With inBox.Line: .ForeColor.RGB = RGB(148, 163, 184): .Weight = 0.5: .Visible = msoTrue: End With
        With inBox.Fill: .ForeColor.RGB = RGB(255, 255, 255): .Visible = msoTrue: End With
        With inBox.TextFrame2
            .MarginLeft = 2: .MarginRight = 2: .MarginTop = 0: .MarginBottom = 0
            .VerticalAnchor = msoAnchorMiddle
            .TextRange.Text = CStr(i)
            .TextRange.Font.Name = CALLOUT_FONT_NAME
            .TextRange.Font.Size = 11
            .TextRange.Font.Bold = msoTrue
            .TextRange.ParagraphFormat.Alignment = 2
        End With
        y = y + rowH
    Next i

    ' === OUT 행 M 개 (out(m·s·p) 핑크) — IN 바로 아래 연속 ===
    For i = 1 To g_pt_rnOutCount
        ' 입출력 라벨 (정보용)
        Dim outLblBx As Shape
        Set outLblBx = ws.Shapes.AddShape(msoShapeRectangle, lblX, y, lblW, rowH)
        outLblBx.Name = PREFIX_PT_BTN & "rnOutLbl_" & i
        outLblBx.Placement = 3
        With outLblBx.Line: .ForeColor.RGB = RGB(148, 163, 184): .Weight = 0.5: .Visible = msoTrue: End With
        With outLblBx.Fill: .ForeColor.RGB = RGB(251, 207, 232): .Visible = msoTrue: End With  ' pink-200
        With outLblBx.TextFrame2
            .MarginLeft = 2: .MarginRight = 2: .MarginTop = 0: .MarginBottom = 0
            .VerticalAnchor = msoAnchorMiddle
            .TextRange.Text = "out(" & outLbl & ")"
            .TextRange.Font.Name = CALLOUT_FONT_NAME
            .TextRange.Font.Size = 10
            .TextRange.Font.Bold = msoTrue
            .TextRange.Font.Fill.ForeColor.RGB = RGB(15, 23, 42)
            .TextRange.ParagraphFormat.Alignment = 2
        End With

        ' 포트번호 박스 (클릭 가능)
        Dim outBox As Shape
        Set outBox = ws.Shapes.AddShape(msoShapeRectangle, portX, y, portW, rowH)
        outBox.Name = PREFIX_PT_ROUT & i
        outBox.OnAction = "선번연결_도구_클릭"
        outBox.Placement = 3
        With outBox.Line: .ForeColor.RGB = RGB(148, 163, 184): .Weight = 0.5: .Visible = msoTrue: End With
        With outBox.Fill: .ForeColor.RGB = RGB(255, 255, 255): .Visible = msoTrue: End With
        With outBox.TextFrame2
            .MarginLeft = 2: .MarginRight = 2: .MarginTop = 0: .MarginBottom = 0
            .VerticalAnchor = msoAnchorMiddle
            .TextRange.Text = CStr(i)
            .TextRange.Font.Name = CALLOUT_FONT_NAME
            .TextRange.Font.Size = 11
            .TextRange.Font.Bold = msoTrue
            .TextRange.ParagraphFormat.Alignment = 2
        End With
        y = y + rowH
    Next i
End Sub

' 한 사이드 (Cable A 또는 B) 세로 테이블 빌드.
'   접힌 UNIT = 한 행에 UNIT 라벨 1개 (선번 열 빈칸 — 안 그림).
'   펼친 UNIT = 한 행에 UNIT 라벨 + 코어 번호 박스 (코어 개수만큼 행).
Public Sub 선번연결_도구_사이드빌드(ws As Worksheet, sideKey As String, _
                                     unitX As Double, numX As Double, topY As Double, _
                                     unitW As Double, numW As Double, rowH As Double, _
                                     totalCores As Long, unitSize As Long, _
                                     expandedDict As Object)
    Dim totalUnits As Long: totalUnits = Int((totalCores - 1) / unitSize) + 1
    Dim y As Double: y = topY
    Dim u As Long, k As Long
    For u = 1 To totalUnits
        Dim startN As Long: startN = (u - 1) * unitSize + 1
        Dim endN As Long: endN = startN + unitSize - 1
        If endN > totalCores Then endN = totalCores
        Dim unitTotal As Long: unitTotal = endN - startN + 1
        Dim isExpanded As Boolean: isExpanded = expandedDict.Exists(u)

        ' UNIT 영역을 「펼」 + 「연결」 두 버튼으로 분리 (owner 요구)
        Const SEL_W As Double = 32
        Dim isUnitSel As Boolean: isUnitSel = 선번연결_도구_unit선택됨(sideKey, u)

        If isExpanded Then
            ' 펼침 — 코어 행 N 개. 각 행 = expand + select 버튼 + 코어 박스
            For k = startN To endN
                Dim expandX As Double, expandW As Double, selectX As Double
                If sideKey = "A" Then
                    expandX = unitX
                    expandW = unitW - SEL_W
                    selectX = unitX + expandW
                Else
                    selectX = unitX
                    expandX = unitX + SEL_W
                    expandW = unitW - SEL_W
                End If

                ' 「펼」 버튼 — UNIT 행 펼침/접기 토글
                Dim eBtn As Shape
                Set eBtn = ws.Shapes.AddShape(msoShapeRectangle, expandX, y, expandW, rowH)
                eBtn.Name = PREFIX_PT_BTN & "u" & sideKey & "_" & u & "_e_r" & k
                eBtn.OnAction = "선번연결_도구_UNIT클릭"
                eBtn.AlternativeText = "side=" & sideKey & "|unit=" & u
                eBtn.Placement = 3
                With eBtn.Line: .ForeColor.RGB = RGB(148, 163, 184): .Weight = 0.5: .Visible = msoTrue: End With
                With eBtn.Fill: .ForeColor.RGB = RGB(219, 234, 254): .Visible = msoTrue: End With
                Dim eTxt As String
                If k = startN Then eTxt = u & "U 펼" Else eTxt = u & "U"
                With eBtn.TextFrame2
                    .MarginLeft = 2: .MarginRight = 2: .MarginTop = 0: .MarginBottom = 0
                    .VerticalAnchor = msoAnchorMiddle
                    .TextRange.Text = eTxt
                    .TextRange.Font.Name = CALLOUT_FONT_NAME
                    .TextRange.Font.Size = 10
                    .TextRange.Font.Bold = msoTrue
                    .TextRange.Font.Fill.ForeColor.RGB = RGB(30, 64, 175)
                    .TextRange.ParagraphFormat.Alignment = 2
                End With

                ' 「연결」 버튼 — UNIT 선택 토글 (반대편 UNIT 과 1:1 매핑용)
                Dim sBtn As Shape
                Set sBtn = ws.Shapes.AddShape(msoShapeRectangle, selectX, y, SEL_W, rowH)
                sBtn.Name = PREFIX_PT_BTN & "u" & sideKey & "_" & u & "_s_r" & k
                sBtn.OnAction = "선번연결_도구_UNIT선택클릭"
                sBtn.AlternativeText = "side=" & sideKey & "|unit=" & u
                sBtn.Placement = 3
                Dim sLineC As Long, sFillC As Long, sTextC As Long, sLineW As Double
                If isUnitSel Then
                    sLineC = RGB(126, 34, 206): sLineW = 1.75
                    sFillC = RGB(233, 213, 255): sTextC = RGB(88, 28, 135)
                Else
                    sLineC = RGB(148, 163, 184): sLineW = 0.5
                    sFillC = RGB(241, 245, 249): sTextC = RGB(100, 116, 139)
                End If
                With sBtn.Line: .ForeColor.RGB = sLineC: .Weight = sLineW: .Visible = msoTrue: End With
                With sBtn.Fill: .ForeColor.RGB = sFillC: .Visible = msoTrue: End With
                Dim sBtnTxt As String
                If isUnitSel Then sBtnTxt = "*연결*" Else sBtnTxt = "연결"
                With sBtn.TextFrame2
                    .MarginLeft = 1: .MarginRight = 1: .MarginTop = 0: .MarginBottom = 0
                    .VerticalAnchor = msoAnchorMiddle
                    .TextRange.Text = sBtnTxt
                    .TextRange.Font.Name = CALLOUT_FONT_NAME
                    .TextRange.Font.Size = 9
                    .TextRange.Font.Bold = msoTrue
                    .TextRange.Font.Fill.ForeColor.RGB = sTextC
                    .TextRange.ParagraphFormat.Alignment = 2
                End With

                ' 코어 번호 박스
                Dim numBox As Shape
                Set numBox = ws.Shapes.AddShape(msoShapeRectangle, numX, y, numW, rowH)
                Dim numName As String
                If sideKey = "A" Then numName = PREFIX_PT_L & k Else numName = PREFIX_PT_R & k
                numBox.Name = numName
                numBox.OnAction = "선번연결_도구_클릭"
                numBox.Placement = 3
                With numBox.Line: .ForeColor.RGB = RGB(148, 163, 184): .Weight = 0.5: .Visible = msoTrue: End With
                With numBox.Fill: .ForeColor.RGB = RGB(255, 255, 255): .Visible = msoTrue: End With
                With numBox.TextFrame2
                    .MarginLeft = 2: .MarginRight = 2: .MarginTop = 0: .MarginBottom = 0
                    .VerticalAnchor = msoAnchorMiddle
                    .TextRange.Text = CStr(k)
                    .TextRange.Font.Name = CALLOUT_FONT_NAME
                    .TextRange.Font.Size = 11
                    .TextRange.Font.Bold = msoTrue
                    .TextRange.ParagraphFormat.Alignment = 2
                End With
                y = y + rowH
            Next k
        Else
            ' 접힘 — expand + select 버튼 (코어 박스 없음). 영역 = unitW + numW
            Dim eX2 As Double, eW2 As Double, sX2 As Double
            If sideKey = "A" Then
                eX2 = unitX
                eW2 = unitW + numW - SEL_W
                sX2 = unitX + eW2
            Else
                sX2 = numX
                eX2 = numX + SEL_W
                eW2 = numW + unitW - SEL_W
            End If

            ' 「펼」 버튼 (접힘 시 큰 라벨로 상세)
            Dim eBtn2 As Shape
            Set eBtn2 = ws.Shapes.AddShape(msoShapeRectangle, eX2, y, eW2, rowH)
            eBtn2.Name = PREFIX_PT_BTN & "u" & sideKey & "_" & u & "_e_c"
            eBtn2.OnAction = "선번연결_도구_UNIT클릭"
            eBtn2.AlternativeText = "side=" & sideKey & "|unit=" & u
            eBtn2.Placement = 3
            With eBtn2.Line: .ForeColor.RGB = RGB(148, 163, 184): .Weight = 0.5: .Visible = msoTrue: End With
            With eBtn2.Fill: .ForeColor.RGB = RGB(241, 245, 249): .Visible = msoTrue: End With
            Dim mappedInUnit As Long: mappedInUnit = 선번연결_도구_unit매핑수(sideKey, u, startN, endN)
            Dim existInUnit As Long: existInUnit = 선번연결_도구_unit기존수(sideKey, startN, endN)
            Dim badge As String: badge = ""
            If mappedInUnit > 0 Then badge = badge & "  매핑 " & mappedInUnit
            If existInUnit > 0 Then badge = badge & "  잠금 " & existInUnit
            With eBtn2.TextFrame2
                .MarginLeft = 4: .MarginRight = 4: .MarginTop = 0: .MarginBottom = 0
                .VerticalAnchor = msoAnchorMiddle
                .TextRange.Text = u & "U  [펼]  (" & unitTotal & " 코어)" & badge
                .TextRange.Font.Name = CALLOUT_FONT_NAME
                .TextRange.Font.Size = 10
                .TextRange.Font.Bold = msoTrue
                .TextRange.Font.Fill.ForeColor.RGB = RGB(51, 65, 85)
                .TextRange.ParagraphFormat.Alignment = 2
            End With

            ' 「연결」 버튼 (접힘 시에도)
            Dim sBtn2 As Shape
            Set sBtn2 = ws.Shapes.AddShape(msoShapeRectangle, sX2, y, SEL_W, rowH)
            sBtn2.Name = PREFIX_PT_BTN & "u" & sideKey & "_" & u & "_s_c"
            sBtn2.OnAction = "선번연결_도구_UNIT선택클릭"
            sBtn2.AlternativeText = "side=" & sideKey & "|unit=" & u
            sBtn2.Placement = 3
            Dim s2LineC As Long, s2FillC As Long, s2TextC As Long, s2LineW As Double
            If isUnitSel Then
                s2LineC = RGB(126, 34, 206): s2LineW = 1.75
                s2FillC = RGB(233, 213, 255): s2TextC = RGB(88, 28, 135)
            Else
                s2LineC = RGB(148, 163, 184): s2LineW = 0.5
                s2FillC = RGB(241, 245, 249): s2TextC = RGB(100, 116, 139)
            End If
            With sBtn2.Line: .ForeColor.RGB = s2LineC: .Weight = s2LineW: .Visible = msoTrue: End With
            With sBtn2.Fill: .ForeColor.RGB = s2FillC: .Visible = msoTrue: End With
            Dim sb2Txt As String
            If isUnitSel Then sb2Txt = "*연결*" Else sb2Txt = "연결"
            With sBtn2.TextFrame2
                .MarginLeft = 1: .MarginRight = 1: .MarginTop = 0: .MarginBottom = 0
                .VerticalAnchor = msoAnchorMiddle
                .TextRange.Text = sb2Txt
                .TextRange.Font.Name = CALLOUT_FONT_NAME
                .TextRange.Font.Size = 9
                .TextRange.Font.Bold = msoTrue
                .TextRange.Font.Fill.ForeColor.RGB = s2TextC
                .TextRange.ParagraphFormat.Alignment = 2
            End With
            y = y + rowH
        End If
    Next u
End Sub

' UNIT 선택 여부 체크 (g_pt_selUnitsA / g_pt_selUnitsB)
Public Function 선번연결_도구_unit선택됨(sideKey As String, u As Long) As Boolean
    Dim selU As Object
    If sideKey = "A" Then Set selU = g_pt_selUnitsA Else Set selU = g_pt_selUnitsB
    If selU Is Nothing Then 선번연결_도구_unit선택됨 = False: Exit Function
    선번연결_도구_unit선택됨 = selU.Exists(u)
End Function

' UNIT 안 「이번 세션 매핑」 수
Public Function 선번연결_도구_unit매핑수(sideKey As String, u As Long, startN As Long, endN As Long) As Long
    Dim n As Long: n = 0
    If g_pt_mappings Is Nothing Then 선번연결_도구_unit매핑수 = 0: Exit Function
    Dim k As Variant
    If sideKey = "A" Then
        For Each k In g_pt_mappings.Keys
            If CLng(k) >= startN And CLng(k) <= endN Then n = n + 1
        Next k
    Else
        For Each k In g_pt_mappings.Keys
            Dim v As Long: v = CLng(g_pt_mappings(k))
            If v >= startN And v <= endN Then n = n + 1
        Next k
    End If
    선번연결_도구_unit매핑수 = n
End Function

' UNIT 안 「기존 잠금」 수
Public Function 선번연결_도구_unit기존수(sideKey As String, startN As Long, endN As Long) As Long
    Dim ex As Object
    If sideKey = "A" Then Set ex = g_pt_existingA Else Set ex = g_pt_existingB
    If ex Is Nothing Then 선번연결_도구_unit기존수 = 0: Exit Function
    Dim n As Long: n = 0
    Dim k As Variant
    For Each k In ex.Keys
        If CLng(k) >= startN And CLng(k) <= endN Then n = n + 1
    Next k
    선번연결_도구_unit기존수 = n
End Function

' 헤더 셀 — UNIT / 선번 라벨
Public Sub 선번연결_도구_헤더셀(ws As Worksheet, suffix As String, x As Double, y As Double, w As Double, h As Double, txt As String)
    Dim sh As Shape
    Set sh = ws.Shapes.AddShape(msoShapeRectangle, x, y, w, h)
    sh.Name = PREFIX_PT_BTN & "hdr_" & suffix
    sh.Placement = 3
    On Error Resume Next
    With sh.Line: .ForeColor.RGB = RGB(71, 85, 105): .Weight = 0.75: .Visible = msoTrue: End With
    With sh.Fill: .ForeColor.RGB = RGB(226, 232, 240): .Visible = msoTrue: End With
    With sh.TextFrame2
        .MarginLeft = 2: .MarginRight = 2: .MarginTop = 0: .MarginBottom = 0
        .VerticalAnchor = msoAnchorMiddle
        .TextRange.Text = txt
        .TextRange.Font.Name = CALLOUT_FONT_NAME
        .TextRange.Font.Size = 10
        .TextRange.Font.Bold = msoTrue
        .TextRange.Font.Fill.ForeColor.RGB = RGB(30, 41, 59)
        .TextRange.ParagraphFormat.Alignment = 2
    End With
    On Error GoTo 0
End Sub

' owner 2026-06-05: 사이드 정보 텍스트박스 (캔버스 위 1줄) — 시트빌드 가 placeholder 생성, 시각갱신 이 텍스트 채움.
'   suffix = "info_cblA" / "info_cblB" / "info_rn".
'   WordWrap=False + AutoSize=msoAutoSizeShapeToFitText → 박스가 텍스트 길이에 맞춰 자동 확장 (잘림 방지).
Public Sub 선번연결_도구_사이드정보빌드(ws As Worksheet, suffix As String, x As Double, y As Double, w As Double, h As Double)
    Dim sh As Shape
    Set sh = ws.Shapes.AddTextbox(msoTextOrientationHorizontal, x, y, w, h)
    sh.Name = PREFIX_PT_BTN & suffix
    sh.Placement = 3
    On Error Resume Next
    sh.Line.Visible = msoFalse
    sh.Fill.Visible = msoFalse
    With sh.TextFrame2
        .MarginLeft = 2: .MarginRight = 2: .MarginTop = 0: .MarginBottom = 0
        .VerticalAnchor = msoAnchorMiddle
        .WordWrap = msoFalse                          ' 한 줄 강제 (줄바꿈 없음)
        .AutoSize = msoAutoSizeShapeToFitText         ' 텍스트 길이에 맞춰 박스 자동 확장
        .TextRange.Text = ""
        .TextRange.Font.Name = CALLOUT_FONT_NAME
        .TextRange.Font.Size = 10
        .TextRange.Font.Bold = msoTrue
        .TextRange.Font.Fill.ForeColor.RGB = RGB(15, 23, 42)
    End With
    On Error GoTo 0
End Sub

' owner 2026-06-05: 사이드 정보 텍스트 갱신 — 시각갱신 매 호출마다 라이브 갱신.
'   Cable: "Cable A · [배지] 시설명 · spec · 선택 N 코어"
'   RN:    "RN · [배지] 시설명 · spec · 선택 IN n / OUT m"
Public Sub 선번연결_도구_사이드정보갱신(ws As Worksheet)
    On Error Resume Next
    ' Cable A
    Dim infoA As String: infoA = 선번연결_도구_케이블사이드라벨(g_pt_cbl1Name, "A")
    Dim selACnt As Long: selACnt = 0
    If Not g_pt_selA Is Nothing Then selACnt = g_pt_selA.Count
    If selACnt > 0 Then infoA = infoA & "  ·  선택 " & selACnt & " 코어"
    Dim shA As Shape: Set shA = Nothing
    Set shA = ws.Shapes(PREFIX_PT_BTN & "info_cblA")
    If Not shA Is Nothing Then shA.TextFrame2.TextRange.Text = infoA

    ' Cable B — 단일 케이블 모드 (cblA == cblB) 면 라벨만, 그 외는 정보 + 선택카운트
    Dim shB As Shape: Set shB = Nothing
    Set shB = ws.Shapes(PREFIX_PT_BTN & "info_cblB")
    If Not shB Is Nothing Then
        Dim infoB As String
        If Len(g_pt_cbl2Name) > 0 And g_pt_cbl2Name <> g_pt_cbl1Name Then
            infoB = 선번연결_도구_케이블사이드라벨(g_pt_cbl2Name, "B")
            Dim selBCnt As Long: selBCnt = 0
            If Not g_pt_selB Is Nothing Then selBCnt = g_pt_selB.Count
            If selBCnt > 0 Then infoB = infoB & "  ·  선택 " & selBCnt & " 코어"
        Else
            infoB = "Cable B · (단일 케이블 모드)"
        End If
        shB.TextFrame2.TextRange.Text = infoB
    End If

    ' RN 정보 (RN 모드만) — owner 2026-06-05: 배지 + 카운트만 (시설명·spec 제거)
    If g_pt_rnMode Then
        Dim shRN As Shape: Set shRN = Nothing
        Set shRN = ws.Shapes(PREFIX_PT_BTN & "info_rn")
        If Not shRN Is Nothing Then
            Dim badgeFac As String: badgeFac = MetaLookupBadgeNo(g_pt_facId)
            Dim infoRN As String
            If Len(badgeFac) > 0 Then
                infoRN = "RN · [" & badgeFac & "]"
            Else
                infoRN = "RN"
            End If
            Dim selInCnt As Long: selInCnt = 0
            Dim selOutCnt As Long: selOutCnt = 0
            If Not g_pt_selRN_IN Is Nothing Then selInCnt = g_pt_selRN_IN.Count
            If Not g_pt_selRN_OUT Is Nothing Then selOutCnt = g_pt_selRN_OUT.Count
            If selInCnt > 0 Or selOutCnt > 0 Then
                infoRN = infoRN & " · 선택 IN " & selInCnt & " / OUT " & selOutCnt
            End If
            shRN.TextFrame2.TextRange.Text = infoRN
        End If
    End If

    On Error GoTo 0
End Sub

' owner 2026-06-06: cable name 또는 facility id 로 반대편 시설물 배지 조회.
'   cbl_ prefix 면 _케이블 메타에서 from/to 조회 → g_pt_facId 와 다른 쪽이 반대편 시설물
'   fac_ prefix 면 그 자체가 시설물 id → 메타 직접 조회
'   배지 못 찾으면 빈 문자열 반환
Public Function 케이블_반대편_배지(cblOrFacName As String) As String
    케이블_반대편_배지 = ""
    If Len(cblOrFacName) = 0 Then Exit Function

    Dim otherId As String: otherId = ""

    ' fac_ prefix 면 시설물 ID 직접 사용
    If Left(cblOrFacName, Len(PREFIX_FAC)) = PREFIX_FAC Then
        otherId = cblOrFacName
    Else
        ' cbl_ prefix — _케이블 메타에서 반대편 시설물 조회
        Dim row As Variant: row = MetaFindRow(SHEET_META_CBL, 1, cblOrFacName)
        If IsEmpty(row) Then Exit Function
        Dim fromId As String, toId As String
        fromId = "": toId = ""
        On Error Resume Next
        If UBound(row) >= 2 Then fromId = CStr(row(2))
        If UBound(row) >= 3 Then toId = CStr(row(3))
        On Error GoTo 0
        If Len(g_pt_facId) > 0 And fromId = g_pt_facId Then
            otherId = toId
        ElseIf Len(g_pt_facId) > 0 And toId = g_pt_facId Then
            otherId = fromId
        Else
            If Len(fromId) > 0 Then otherId = fromId Else otherId = toId
        End If
    End If

    If Len(otherId) = 0 Then Exit Function

    ' 배지 조회 — MetaLookupBadgeNo 우선, 빈 결과면 직접 셀 조회 fallback
    Dim badge As String: badge = MetaLookupBadgeNo(otherId)
    If Len(badge) = 0 Then
        Dim wsFac As Worksheet
        On Error Resume Next
        Set wsFac = ThisWorkbook.Worksheets(SHEET_META_FAC)
        On Error GoTo 0
        If Not wsFac Is Nothing Then
            Dim lastFac As Long: lastFac = wsFac.Cells(wsFac.Rows.Count, 1).End(xlUp).Row
            Dim rf As Long
            For rf = 2 To lastFac
                If CStr(wsFac.Cells(rf, 1).Value) = otherId Then
                    Dim colE As String: colE = CStr(wsFac.Cells(rf, 5).Value)
                    If Len(colE) > 0 Then badge = colE
                    Exit For
                End If
            Next rf
        End If
    End If
    케이블_반대편_배지 = badge
End Function

' Cable 사이드 라벨 헬퍼 — "Cable A · [반대편 시설물 배지]" (owner 2026-06-05: 시설명·spec 제거 — 너무 길어서).
'   owner 2026-06-06: g_pt_radial 누락 시 메타 시트 직접 조회 fallback 추가.
'     1차: g_pt_radial dict 의 cblName 값에서 otherId 추출
'     2차: _케이블 메타 시트 from/to 조회 → g_pt_facId 와 다른 쪽을 otherId 로
'   디버그: A60 셀에 단계별 결과 출력 (배지 추적용).
Public Function 선번연결_도구_케이블사이드라벨(cblName As String, sideLetter As String) As String
    Dim dbg As String: dbg = "cbl=" & cblName & " side=" & sideLetter
    선번연결_도구_케이블사이드라벨 = "Cable " & sideLetter
    If Len(cblName) = 0 Then GoTo Done

    Dim otherId As String: otherId = ""

    ' 1차 — g_pt_radial 에서 추출
    Dim radHas As Boolean: radHas = False
    If Not g_pt_radial Is Nothing Then
        If g_pt_radial.Exists(cblName) Then
            radHas = True
            Dim parts() As String: parts = Split(CStr(g_pt_radial(cblName)), "|")
            If UBound(parts) >= 0 Then otherId = CStr(parts(0))
        End If
    End If
    dbg = dbg & " | rad=" & radHas & " other1=" & otherId

    ' 2차 — 메타 시트 직접 조회 fallback
    If Len(otherId) = 0 Then
        Dim row As Variant: row = MetaFindRow(SHEET_META_CBL, 1, cblName)
        If Not IsEmpty(row) Then
            Dim fromId As String, toId As String
            fromId = "": toId = ""
            On Error Resume Next
            If UBound(row) >= 2 Then fromId = CStr(row(2))
            If UBound(row) >= 3 Then toId = CStr(row(3))
            On Error GoTo 0
            dbg = dbg & " | from=" & fromId & " to=" & toId & " fac=" & g_pt_facId
            If Len(g_pt_facId) > 0 And fromId = g_pt_facId Then
                otherId = toId
            ElseIf Len(g_pt_facId) > 0 And toId = g_pt_facId Then
                otherId = fromId
            Else
                ' g_pt_facId 매칭 안 됨 — from 우선 폴백
                If Len(fromId) > 0 Then otherId = fromId Else otherId = toId
            End If
        Else
            dbg = dbg & " | row=EMPTY"
        End If
    End If
    dbg = dbg & " | otherFinal=" & otherId

    If Len(otherId) > 0 Then
        Dim badge As String: badge = MetaLookupBadgeNo(otherId)
        dbg = dbg & " | badge=[" & badge & "]"

        ' 디버그 + fallback — MetaLookupBadgeNo 가 빈 결과면 직접 시설물 메타 셀 읽기
        If Len(badge) = 0 Then
            dbg = dbg & " | FALLBACK_ENTRY"
            Dim wsFac As Worksheet
            On Error Resume Next
            Set wsFac = ThisWorkbook.Worksheets(SHEET_META_FAC)
            On Error GoTo 0
            If wsFac Is Nothing Then
                dbg = dbg & " | wsFac=NOTHING(시트이름=" & SHEET_META_FAC & ")"
            Else
                dbg = dbg & " | wsFac=OK"
                Dim lastFac As Long: lastFac = wsFac.Cells(wsFac.Rows.Count, 1).End(xlUp).Row
                dbg = dbg & " | lastFac=" & lastFac
                Dim rf As Long
                Dim found As Boolean: found = False
                For rf = 2 To lastFac
                    If CStr(wsFac.Cells(rf, 1).Value) = otherId Then
                        found = True
                        ' col E = badge_no
                        Dim colE As String: colE = CStr(wsFac.Cells(rf, 5).Value)
                        dbg = dbg & " | facRow=" & rf & " colE=[" & colE & "]"
                        If Len(colE) > 0 Then badge = colE
                        Exit For
                    End If
                Next rf
                If Not found Then dbg = dbg & " | facRow=NOT_FOUND_IN_LOOP"
            End If
        End If

        If Len(badge) > 0 Then
            선번연결_도구_케이블사이드라벨 = "Cable " & sideLetter & " · [" & badge & "]"
        End If
    End If

Done:
    On Error Resume Next
    ThisWorkbook.Worksheets(SHEET_PAIR_TOOL).Range("A60").Value = dbg
    On Error GoTo 0
End Function

' 헤더 텍스트 라벨 (Cable A/B 그리드 위)
Public Sub 선번연결_도구_라벨생성(ws As Worksheet, suffix As String, x As Double, y As Double, txt As String)
    Dim sh As Shape
    Set sh = ws.Shapes.AddTextbox(msoTextOrientationHorizontal, x, y, 320, 18)
    sh.Name = PREFIX_PT_BTN & suffix
    sh.Placement = 3
    On Error Resume Next
    sh.Line.Visible = msoFalse
    sh.Fill.Visible = msoFalse
    With sh.TextFrame2
        .MarginLeft = 0: .MarginRight = 0: .MarginTop = 0: .MarginBottom = 0
        .VerticalAnchor = msoAnchorMiddle
        .TextRange.Text = txt
        .TextRange.Font.Name = CALLOUT_FONT_NAME
        .TextRange.Font.Size = 11
        .TextRange.Font.Bold = msoTrue
        .TextRange.Font.Fill.ForeColor.RGB = RGB(71, 85, 105)
    End With
    On Error GoTo 0
End Sub

' UNIT 행 라벨 (각 행 왼쪽 — 「UNIT N」). 클릭 시 일괄 매핑 핸들러로 진입.
Public Sub 선번연결_도구_unit라벨(ws As Worksheet, suffix As String, x As Double, y As Double, w As Double, h As Double, txt As String)
    Dim sh As Shape
    Set sh = ws.Shapes.AddShape(msoShapeRoundedRectangle, x, y, w, h)
    sh.Name = PREFIX_PT_BTN & suffix
    sh.OnAction = "선번연결_도구_UNIT클릭"
    sh.Placement = 3
    On Error Resume Next
    With sh.Line
        .ForeColor.RGB = RGB(148, 163, 184)
        .Weight = 0.5
        .Visible = msoTrue
    End With
    With sh.Fill
        .ForeColor.RGB = RGB(226, 232, 240)
        .Visible = msoTrue
    End With
    With sh.TextFrame2
        .MarginLeft = 2: .MarginRight = 2: .MarginTop = 0: .MarginBottom = 0
        .VerticalAnchor = msoAnchorMiddle
        .TextRange.Text = txt
        .TextRange.Font.Name = CALLOUT_FONT_NAME
        .TextRange.Font.Size = 9
        .TextRange.Font.Bold = msoTrue
        .TextRange.Font.Fill.ForeColor.RGB = RGB(51, 65, 85)
        .TextRange.ParagraphFormat.Alignment = 2     ' 가운데
    End With
    On Error GoTo 0
End Sub

' 코어 박스 클릭 핸들러 — 토글 모델 (Excel 이 Ctrl+클릭 을 multi-select 로 가로채서 OnAction 안 뜨는 한계 해결).
'   Plain click  = 토글 (선택 안 돼 있으면 추가, 돼 있으면 해제). anchor 갱신.
'   Shift+click  = anchor..coreN 범위를 해당 사이드 선택 set 에 추가 (잠금 제외).
'   기존 잠금 코어(g_pt_existingA/B) 클릭 = 무시 + 안내.
Public Sub 선번연결_도구_클릭()
    Dim nm As String: nm = Application.Caller
    If g_pt_mappings Is Nothing Then Set g_pt_mappings = CreateObject("Scripting.Dictionary")
    If g_pt_selA Is Nothing Then Set g_pt_selA = CreateObject("Scripting.Dictionary")
    If g_pt_selB Is Nothing Then Set g_pt_selB = CreateObject("Scripting.Dictionary")

    Dim sideKey As String, coreN As Long
    ' prefix 매칭 — 더 긴 prefix (RIN/ROUT) 를 먼저 검사. PT_L/PT_R 보다 우선.
    If Left(nm, Len(PREFIX_PT_RIN)) = PREFIX_PT_RIN Then
        sideKey = "RN_IN": coreN = CLng(Mid(nm, Len(PREFIX_PT_RIN) + 1))
    ElseIf Left(nm, Len(PREFIX_PT_ROUT)) = PREFIX_PT_ROUT Then
        sideKey = "RN_OUT": coreN = CLng(Mid(nm, Len(PREFIX_PT_ROUT) + 1))
    ElseIf Left(nm, Len(PREFIX_PT_L)) = PREFIX_PT_L Then
        sideKey = "A": coreN = CLng(Mid(nm, Len(PREFIX_PT_L) + 1))
    ElseIf Left(nm, Len(PREFIX_PT_R)) = PREFIX_PT_R Then
        sideKey = "B": coreN = CLng(Mid(nm, Len(PREFIX_PT_R) + 1))
    Else
        Exit Sub
    End If

    ' RN 부분 해제 모드 — Cable A·B + RN IN·OUT 모두 클릭 가능 (owner 2026-06-06).
    If g_pt_rnReleaseMode Then
        Dim rnRelDict As Object, rnTgtDict As Object
        Select Case sideKey
            Case "A":      Set rnRelDict = g_pt_rnReleaseSelA:   Set rnTgtDict = g_pt_rnReleaseTargetA
            Case "B":      Set rnRelDict = g_pt_rnReleaseSelB:   Set rnTgtDict = g_pt_rnReleaseTargetB
            Case "RN_IN":  Set rnRelDict = g_pt_rnReleaseSelIN:  Set rnTgtDict = g_pt_rnReleaseTargetIN
            Case "RN_OUT": Set rnRelDict = g_pt_rnReleaseSelOUT: Set rnTgtDict = g_pt_rnReleaseTargetOUT
            Case Else
                Application.StatusBar = "RN 부분 해제 모드 — Cable·RN 코어만 클릭 가능."
                Exit Sub
        End Select
        If rnTgtDict Is Nothing Then Exit Sub
        If Not rnTgtDict.Exists(coreN) Then
            Application.StatusBar = "이 코어는 이 RN 그룹의 해제 대상이 아닙니다."
            Exit Sub
        End If
        If rnRelDict Is Nothing Then
            Set rnRelDict = CreateObject("Scripting.Dictionary")
            Select Case sideKey
                Case "A":      Set g_pt_rnReleaseSelA = rnRelDict
                Case "B":      Set g_pt_rnReleaseSelB = rnRelDict
                Case "RN_IN":  Set g_pt_rnReleaseSelIN = rnRelDict
                Case "RN_OUT": Set g_pt_rnReleaseSelOUT = rnRelDict
            End Select
        End If
        If rnRelDict.Exists(coreN) Then
            rnRelDict.Remove coreN
        Else
            rnRelDict(coreN) = True
        End If
        선번연결_도구_시각갱신
        Exit Sub
    End If

    ' 해제 모드 — 코어 클릭은 release 토글. 짝의 코어만 클릭 가능, 그 외는 안내만.
    If g_pt_releaseMode And Not g_pt_releasePairs Is Nothing Then
        Dim targetA As Long: targetA = 0
        If sideKey = "A" Then
            If g_pt_releasePairs.Exists(coreN) Then targetA = coreN
        Else
            Dim mk As Variant
            For Each mk In g_pt_releasePairs.Keys
                If CLng(g_pt_releasePairs(mk)) = coreN Then
                    targetA = CLng(mk)
                    Exit For
                End If
            Next mk
        End If
        If targetA = 0 Then
            Application.StatusBar = "이 코어는 해제 대상이 아닙니다 (다른 짝의 코어). 「취소」 후 다시 시도하세요."
            Exit Sub
        End If
        If g_pt_releaseSelected Is Nothing Then Set g_pt_releaseSelected = CreateObject("Scripting.Dictionary")
        If g_pt_releaseSelected.Exists(targetA) Then
            g_pt_releaseSelected.Remove targetA
        Else
            g_pt_releaseSelected(targetA) = True
        End If
        선번연결_도구_시각갱신
        Exit Sub
    End If

    ' 잠금 코어 차단 — A/B/RN_IN/RN_OUT 4-side 분기
    Dim exDict As Object
    Select Case sideKey
        Case "A":      Set exDict = g_pt_existingA
        Case "B":      Set exDict = g_pt_existingB
        Case "RN_IN":  Set exDict = g_pt_existingRN_IN
        Case "RN_OUT": Set exDict = g_pt_existingRN_OUT
    End Select
    If Not exDict Is Nothing Then
        If exDict.Exists(coreN) Then
            Application.StatusBar = "코어 " & coreN & " 은 잠금 상태 — 「기존 연결」 「일부」 버튼으로 일부만 해제 가능."
            Exit Sub
        End If
    End If

    ' owner 2026-06-06: [V] (매핑) 코어 클릭 = 매핑 해제 (owner 보고: 클릭해도 해제 안 됨).
    '   3 dict 모두 검사 (cable-cable: g_pt_mappings, RN: mappingsA_IN, RN1: mappingsA_OUT).
    '   g_pt_rnMode 가 stale True 인 경우 대비해 모드 무관하게 모두 점검.
    Dim totalRemoved As Long: totalRemoved = 0
    Dim removedReport As String: removedReport = ""

    If sideKey = "A" Then
        ' Cable A side: 각 매핑 dict 의 key 매칭
        If Not g_pt_mappings Is Nothing Then
            If g_pt_mappings.Exists(coreN) Then
                g_pt_mappings.Remove coreN
                totalRemoved = totalRemoved + 1
                removedReport = removedReport & "mappings "
            End If
        End If
        If Not g_pt_mappingsA_IN Is Nothing Then
            If g_pt_mappingsA_IN.Exists(coreN) Then
                g_pt_mappingsA_IN.Remove coreN
                totalRemoved = totalRemoved + 1
                removedReport = removedReport & "A_IN "
            End If
        End If
        If Not g_pt_mappingsA_OUT Is Nothing Then
            If g_pt_mappingsA_OUT.Exists(coreN) Then
                g_pt_mappingsA_OUT.Remove coreN
                totalRemoved = totalRemoved + 1
                removedReport = removedReport & "A_OUT "
            End If
        End If
        ' selA 도 정리 (잔여 선택 흔적)
        If totalRemoved > 0 And Not g_pt_selA Is Nothing Then
            If g_pt_selA.Exists(coreN) Then g_pt_selA.Remove coreN
        End If
    ElseIf sideKey = "B" Then
        ' Cable B side: g_pt_mappings 의 value 매칭 + mappingsOUT_B 의 value 매칭
        If Not g_pt_mappings Is Nothing Then
            Dim mkPB As Variant, foundKeyA As Long: foundKeyA = 0
            For Each mkPB In g_pt_mappings.Keys
                If CLng(g_pt_mappings(mkPB)) = coreN Then
                    foundKeyA = CLng(mkPB)
                    Exit For
                End If
            Next mkPB
            If foundKeyA > 0 Then
                g_pt_mappings.Remove foundKeyA
                totalRemoved = totalRemoved + 1
                removedReport = removedReport & "mappings(A=" & foundKeyA & ") "
            End If
        End If
        If Not g_pt_mappingsOUT_B Is Nothing Then
            Dim mkOB As Variant, foundKeyOUT As Long: foundKeyOUT = 0
            For Each mkOB In g_pt_mappingsOUT_B.Keys
                If CLng(g_pt_mappingsOUT_B(mkOB)) = coreN Then
                    foundKeyOUT = CLng(mkOB)
                    Exit For
                End If
            Next mkOB
            If foundKeyOUT > 0 Then
                g_pt_mappingsOUT_B.Remove foundKeyOUT
                totalRemoved = totalRemoved + 1
                removedReport = removedReport & "OUT_B(OUT=" & foundKeyOUT & ") "
            End If
        End If
        If totalRemoved > 0 And Not g_pt_selB Is Nothing Then
            If g_pt_selB.Exists(coreN) Then g_pt_selB.Remove coreN
        End If
    End If

    If totalRemoved > 0 Then
        선번연결_도구_시각갱신
        Application.StatusBar = "코어 " & coreN & " (" & sideKey & ") 매핑 해제 — " & removedReport
        Exit Sub
    End If

    ' Shift+클릭은 OnAction 핸들러로 전달됨 (Excel 이 가로채지 않음). GetKeyState 로 감지.
    Dim isShift As Boolean: isShift = (PT_GetKeyState(PT_VK_SHIFT) < 0)

    Dim selDict As Object
    Select Case sideKey
        Case "A":      Set selDict = g_pt_selA
        Case "B":      Set selDict = g_pt_selB
        Case "RN_IN":  If g_pt_selRN_IN Is Nothing Then Set g_pt_selRN_IN = CreateObject("Scripting.Dictionary")
                       Set selDict = g_pt_selRN_IN
        Case "RN_OUT": If g_pt_selRN_OUT Is Nothing Then Set g_pt_selRN_OUT = CreateObject("Scripting.Dictionary")
                       Set selDict = g_pt_selRN_OUT
    End Select
    Dim anchor As Long
    Select Case sideKey
        Case "A":      anchor = g_pt_anchorA
        Case "B":      anchor = g_pt_anchorB
        Case "RN_IN":  anchor = g_pt_anchorRN_IN
        Case "RN_OUT": anchor = g_pt_anchorRN_OUT
    End Select

    If isShift And anchor > 0 Then
        ' Shift+클릭 — anchor..coreN 범위 추가 (잠금 코어 자동 스킵)
        Dim lo As Long, hi As Long
        If anchor <= coreN Then lo = anchor: hi = coreN Else lo = coreN: hi = anchor
        Dim k As Long
        For k = lo To hi
            If exDict Is Nothing Then
                selDict(k) = True
            ElseIf Not exDict.Exists(k) Then
                selDict(k) = True
            End If
        Next k
    Else
        ' Plain 클릭 = 토글 (선택돼 있으면 해제, 아니면 추가)
        '   owner 요구: Ctrl 모디파이어 없이 그냥 클릭 반복으로 다중 선택·해제 가능
        If selDict.Exists(coreN) Then
            selDict.Remove coreN
        Else
            selDict(coreN) = True
        End If
        Select Case sideKey
            Case "A":      g_pt_anchorA = coreN
            Case "B":      g_pt_anchorB = coreN
            Case "RN_IN":  g_pt_anchorRN_IN = coreN
            Case "RN_OUT": g_pt_anchorRN_OUT = coreN
        End Select
    End If

    선번연결_도구_시각갱신
End Sub

' UNIT 「펼」 버튼 핸들러 — 각 UNIT 독립 토글 (펼침/접기). 다른 UNIT 영향 X.
'   AlternativeText "side=A|unit=3" 에서 side·unit 추출.
Public Sub 선번연결_도구_UNIT클릭()
    Dim sideKey As String, unitN As Long
    If Not 선번연결_도구_UNIT파싱(sideKey, unitN) Then Exit Sub

    Dim ex As Object
    If sideKey = "A" Then Set ex = g_pt_expandedA Else Set ex = g_pt_expandedB
    If ex Is Nothing Then
        Set ex = CreateObject("Scripting.Dictionary")
        If sideKey = "A" Then Set g_pt_expandedA = ex Else Set g_pt_expandedB = ex
    End If
    If ex.Exists(unitN) Then ex.Remove unitN Else ex(unitN) = True

    선번연결_도구_시트빌드
    선번연결_도구_시각갱신
End Sub

' UNIT 「연결」 버튼 핸들러 — UNIT 선택 토글 (반대편 UNIT 과 1:1 매핑용).
'   owner 요구: Shift 없이 별도 버튼으로 명확히 구분.
Public Sub 선번연결_도구_UNIT선택클릭()
    Dim sideKey As String, unitN As Long
    If Not 선번연결_도구_UNIT파싱(sideKey, unitN) Then Exit Sub

    Dim selU As Object
    If sideKey = "A" Then Set selU = g_pt_selUnitsA Else Set selU = g_pt_selUnitsB
    If selU Is Nothing Then
        Set selU = CreateObject("Scripting.Dictionary")
        If sideKey = "A" Then Set g_pt_selUnitsA = selU Else Set g_pt_selUnitsB = selU
    End If
    If selU.Exists(unitN) Then selU.Remove unitN Else selU(unitN) = True

    선번연결_도구_시트빌드
    선번연결_도구_시각갱신
End Sub

' UNIT 버튼 AlternativeText 파싱 헬퍼 (공통)
Public Function 선번연결_도구_UNIT파싱(ByRef sideKey As String, ByRef unitN As Long) As Boolean
    선번연결_도구_UNIT파싱 = False
    Dim nm As String: nm = Application.Caller
    Dim sh As Shape: Set sh = Nothing
    Dim wsTool As Worksheet
    On Error Resume Next
    Set wsTool = ThisWorkbook.Worksheets(SHEET_PAIR_TOOL)
    Set sh = wsTool.Shapes(nm)
    On Error GoTo 0
    If sh Is Nothing Then Exit Function

    Dim alt As String: alt = ""
    On Error Resume Next
    alt = sh.AlternativeText
    On Error GoTo 0
    Dim ps As Long, pu As Long
    ps = InStr(alt, "side=")
    pu = InStr(alt, "unit=")
    If ps = 0 Or pu = 0 Then Exit Function
    sideKey = Mid(alt, ps + 5, pu - ps - 6)
    unitN = CLng(Mid(alt, pu + 5))
    선번연결_도구_UNIT파싱 = True
End Function

' 전체 UNIT 펼치기/접기 — owner #4. 양쪽 사이드 모두 다 펼쳐있으면 전체 접기, 아니면 전체 펼치기.
Public Sub 선번연결_도구_전체펼치기()
    If g_pt_expandedA Is Nothing Then Set g_pt_expandedA = CreateObject("Scripting.Dictionary")
    If g_pt_expandedB Is Nothing Then Set g_pt_expandedB = CreateObject("Scripting.Dictionary")

    Dim unitsA As Long: unitsA = Int((g_pt_count1 - 1) / g_pt_unitSize1) + 1
    Dim unitsB As Long: unitsB = Int((g_pt_count2 - 1) / g_pt_unitSize2) + 1
    Dim totalUnits As Long: totalUnits = unitsA + unitsB
    Dim expandedCount As Long: expandedCount = g_pt_expandedA.Count + g_pt_expandedB.Count

    If expandedCount >= totalUnits Then
        ' 전체 펼친 상태 → 전체 접기
        g_pt_expandedA.RemoveAll
        g_pt_expandedB.RemoveAll
        Application.StatusBar = "전체 UNIT 접음."
    Else
        ' 일부 펼침 or 전체 접힘 → 전체 펼치기
        Dim u As Long
        For u = 1 To unitsA: g_pt_expandedA(u) = True: Next u
        For u = 1 To unitsB: g_pt_expandedB(u) = True: Next u
        Application.StatusBar = "전체 UNIT 펼침."
    End If

    선번연결_도구_시트빌드
    선번연결_도구_시각갱신
End Sub

' owner 2026-06-06: cable A 측 코어 N 이 이번 세션 매핑됐는지 판정.
'   기존 ElseIf 한줄 식 `(... mappings.Exists(k)) Or (rnMode And ...) Or (rn1Mode And ...)` 가
'   VBA 의 비-short-circuit + On Error Resume Next 와 결합해 Nothing dict 접근에서 예측 불가
'   ([V] 잔존 / 매핑 0 인데 표시) 발생. nested If 로 명확히 분리.
Public Function 선번연결_도구_isMappedA(k As Long) As Boolean
    선번연결_도구_isMappedA = False
    If g_pt_rnMode Then
        ' RN 모드 — mappingsA_IN 또는 RN1 면 mappingsA_OUT
        If Not g_pt_mappingsA_IN Is Nothing Then
            If g_pt_mappingsA_IN.Exists(k) Then
                선번연결_도구_isMappedA = True
                Exit Function
            End If
        End If
        If g_pt_rn1Mode And Not g_pt_mappingsA_OUT Is Nothing Then
            If g_pt_mappingsA_OUT.Exists(k) Then
                선번연결_도구_isMappedA = True
                Exit Function
            End If
        End If
    Else
        ' Cable-cable mode — g_pt_mappings 만 검사
        If Not g_pt_mappings Is Nothing Then
            If g_pt_mappings.Exists(k) Then
                선번연결_도구_isMappedA = True
                Exit Function
            End If
        End If
    End If
End Function

' 박스 색상 + 매핑 연결선 + 상태 메시지 갱신.
'   - 잠금 코어(g_pt_existingA/B) = 짙은 회색 (X 표시 텍스트 prefix)
'   - 매핑된 코어 = 초록
'   - 선택된 코어 = 파랑
'   - 기본 = 흰색
Public Sub 선번연결_도구_시각갱신()
    Dim ws As Worksheet
    On Error Resume Next
    Set ws = ThisWorkbook.Worksheets(SHEET_PAIR_TOOL)
    On Error GoTo 0
    If ws Is Nothing Then Exit Sub
    If g_pt_mappings Is Nothing Then Set g_pt_mappings = CreateObject("Scripting.Dictionary")
    If g_pt_selA Is Nothing Then Set g_pt_selA = CreateObject("Scripting.Dictionary")
    If g_pt_selB Is Nothing Then Set g_pt_selB = CreateObject("Scripting.Dictionary")
    If g_pt_existingA Is Nothing Then Set g_pt_existingA = CreateObject("Scripting.Dictionary")
    If g_pt_existingB Is Nothing Then Set g_pt_existingB = CreateObject("Scripting.Dictionary")
    If g_pt_existingMappings Is Nothing Then Set g_pt_existingMappings = CreateObject("Scripting.Dictionary")
    ' owner 2026-06-06: RN 모드용 dict 들도 시각갱신에서 보장 — Nothing 인 채로 .Exists() 호출 시
    '   On Error Resume Next 와 결합해 예측 불가 동작 ([V] 잔존 등) 회피.
    If g_pt_mappingsA_IN Is Nothing Then Set g_pt_mappingsA_IN = CreateObject("Scripting.Dictionary")
    If g_pt_mappingsA_OUT Is Nothing Then Set g_pt_mappingsA_OUT = CreateObject("Scripting.Dictionary")
    If g_pt_mappingsOUT_B Is Nothing Then Set g_pt_mappingsOUT_B = CreateObject("Scripting.Dictionary")
    If g_pt_existingRN_IN Is Nothing Then Set g_pt_existingRN_IN = CreateObject("Scripting.Dictionary")
    If g_pt_existingRN_OUT Is Nothing Then Set g_pt_existingRN_OUT = CreateObject("Scripting.Dictionary")

    ' 기존 연결선 모두 제거
    Dim sh As Shape, i As Long
    For i = ws.Shapes.Count To 1 Step -1
        Set sh = ws.Shapes(i)
        If Left(sh.Name, Len(PREFIX_PT_LINE)) = PREFIX_PT_LINE Then sh.Delete
    Next i

    ' 우측 mapped 매핑 — leftN 으로 빠르게 조회용 reverse set
    Dim rightMapped As Object: Set rightMapped = CreateObject("Scripting.Dictionary")
    Dim mk As Variant
    For Each mk In g_pt_mappings.Keys
        rightMapped(CLng(g_pt_mappings(mk))) = True
    Next mk

    ' 해제 모드 — 짝의 B 코어 reverse set (right-side 시각화에 사용)
    Dim releaseBSet As Object: Set releaseBSet = CreateObject("Scripting.Dictionary")
    Dim releaseBSelSet As Object: Set releaseBSelSet = CreateObject("Scripting.Dictionary")
    If g_pt_releaseMode And Not g_pt_releasePairs Is Nothing Then
        Dim rmk As Variant
        For Each rmk In g_pt_releasePairs.Keys
            releaseBSet(CLng(g_pt_releasePairs(rmk))) = True
            If Not g_pt_releaseSelected Is Nothing Then
                If g_pt_releaseSelected.Exists(CLng(rmk)) Then
                    releaseBSelSet(CLng(g_pt_releasePairs(rmk))) = True
                End If
            End If
        Next rmk
    End If

    ' Cable A 박스 — 펼친 행만 존재
    Dim k As Long
    For k = 1 To g_pt_count1
        Dim boxL As Shape: Set boxL = Nothing
        On Error Resume Next
        Set boxL = ws.Shapes(PREFIX_PT_L & k)
        On Error GoTo 0
        If Not boxL Is Nothing Then
            On Error Resume Next
            ' 해제 모드 — 짝의 코어이면 amber (대기) 또는 rose (선택). RN 부분 해제도 동일 색상.
            Dim isReleaseTarget As Boolean
            isReleaseTarget = (g_pt_releaseMode And Not g_pt_releasePairs Is Nothing)
            If isReleaseTarget Then isReleaseTarget = g_pt_releasePairs.Exists(k)
            ' RN 부분 해제 — target A 도 amber
            If Not isReleaseTarget And g_pt_rnReleaseMode And Not g_pt_rnReleaseTargetA Is Nothing Then
                isReleaseTarget = g_pt_rnReleaseTargetA.Exists(k)
            End If
            Dim isReleaseSel As Boolean
            isReleaseSel = (isReleaseTarget And Not g_pt_releaseSelected Is Nothing)
            If isReleaseSel Then isReleaseSel = g_pt_releaseSelected.Exists(k)
            ' RN 부분 해제 — selA 도 rose
            If Not isReleaseSel And g_pt_rnReleaseMode And Not g_pt_rnReleaseSelA Is Nothing Then
                isReleaseSel = g_pt_rnReleaseSelA.Exists(k)
            End If
            If isReleaseSel Then
                boxL.Fill.ForeColor.RGB = RGB(254, 202, 202)        ' rose (해제 선택)
                boxL.Line.ForeColor.RGB = RGB(220, 38, 38)
                boxL.Line.Weight = 2
                boxL.TextFrame2.TextRange.Font.Fill.ForeColor.RGB = RGB(127, 29, 29)
                boxL.TextFrame2.TextRange.Text = "[해제] " & k
            ElseIf isReleaseTarget Then
                boxL.Fill.ForeColor.RGB = RGB(253, 230, 138)        ' amber (해제 대기 — 클릭 가능)
                boxL.Line.ForeColor.RGB = RGB(217, 119, 6)
                boxL.Line.Weight = 1.5
                boxL.TextFrame2.TextRange.Font.Fill.ForeColor.RGB = RGB(120, 53, 15)
                boxL.TextFrame2.TextRange.Text = "[?] " & k
            ElseIf g_pt_existingA.Exists(k) Then
                boxL.Fill.ForeColor.RGB = RGB(203, 213, 225)        ' 회색 (잠금)
                boxL.Line.ForeColor.RGB = RGB(100, 116, 139)
                boxL.Line.Weight = 0.75
                boxL.TextFrame2.TextRange.Font.Fill.ForeColor.RGB = RGB(71, 85, 105)
                boxL.TextFrame2.TextRange.Text = "[잠] " & k
            ElseIf 선번연결_도구_isMappedA(k) Then
                ' owner 2026-06-06: 모드별 매핑 판정 헬퍼로 분리 — 기존 Or/And 한줄 식이 VBA 단축 평가 미지원 +
                '   On Error Resume Next 와 결합 시 Nothing dict 접근에서 예측 불가 ([V] 잔존) 발생.
                boxL.Fill.ForeColor.RGB = RGB(187, 247, 208)        ' 초록 (매핑)
                boxL.Line.ForeColor.RGB = RGB(22, 163, 74)
                boxL.Line.Weight = 1.5
                boxL.TextFrame2.TextRange.Font.Fill.ForeColor.RGB = RGB(20, 83, 45)
                boxL.TextFrame2.TextRange.Text = "[V] " & k
            ElseIf g_pt_selA.Exists(k) Then
                boxL.Fill.ForeColor.RGB = RGB(191, 219, 254)        ' 파랑 (선택)
                boxL.Line.ForeColor.RGB = RGB(37, 99, 235)
                boxL.Line.Weight = 2
                boxL.TextFrame2.TextRange.Font.Fill.ForeColor.RGB = RGB(30, 64, 175)
                boxL.TextFrame2.TextRange.Text = CStr(k)
            Else
                boxL.Fill.ForeColor.RGB = RGB(255, 255, 255)
                boxL.Line.ForeColor.RGB = RGB(148, 163, 184)
                boxL.Line.Weight = 0.5
                boxL.TextFrame2.TextRange.Font.Fill.ForeColor.RGB = RGB(30, 41, 59)
                boxL.TextFrame2.TextRange.Text = CStr(k)
            End If
            On Error GoTo 0
        End If
    Next k

    ' Cable B 박스
    For k = 1 To g_pt_count2
        Dim boxR As Shape: Set boxR = Nothing
        On Error Resume Next
        Set boxR = ws.Shapes(PREFIX_PT_R & k)
        On Error GoTo 0
        If Not boxR Is Nothing Then
            On Error Resume Next
            Dim isRnBSel As Boolean, isRnBTgt As Boolean
            isRnBSel = (g_pt_rnReleaseMode And Not g_pt_rnReleaseSelB Is Nothing)
            If isRnBSel Then isRnBSel = g_pt_rnReleaseSelB.Exists(k)
            isRnBTgt = (g_pt_rnReleaseMode And Not g_pt_rnReleaseTargetB Is Nothing)
            If isRnBTgt Then isRnBTgt = g_pt_rnReleaseTargetB.Exists(k)
            If releaseBSelSet.Exists(k) Or isRnBSel Then
                boxR.Fill.ForeColor.RGB = RGB(254, 202, 202)
                boxR.Line.ForeColor.RGB = RGB(220, 38, 38)
                boxR.Line.Weight = 2
                boxR.TextFrame2.TextRange.Font.Fill.ForeColor.RGB = RGB(127, 29, 29)
                boxR.TextFrame2.TextRange.Text = "[해제] " & k
            ElseIf releaseBSet.Exists(k) Or isRnBTgt Then
                boxR.Fill.ForeColor.RGB = RGB(253, 230, 138)
                boxR.Line.ForeColor.RGB = RGB(217, 119, 6)
                boxR.Line.Weight = 1.5
                boxR.TextFrame2.TextRange.Font.Fill.ForeColor.RGB = RGB(120, 53, 15)
                boxR.TextFrame2.TextRange.Text = "[?] " & k
            ElseIf g_pt_existingB.Exists(k) Then
                boxR.Fill.ForeColor.RGB = RGB(203, 213, 225)
                boxR.Line.ForeColor.RGB = RGB(100, 116, 139)
                boxR.Line.Weight = 0.75
                boxR.TextFrame2.TextRange.Font.Fill.ForeColor.RGB = RGB(71, 85, 105)
                boxR.TextFrame2.TextRange.Text = "[잠] " & k
            ElseIf rightMapped.Exists(k) Then
                boxR.Fill.ForeColor.RGB = RGB(187, 247, 208)
                boxR.Line.ForeColor.RGB = RGB(22, 163, 74)
                boxR.Line.Weight = 1.5
                boxR.TextFrame2.TextRange.Font.Fill.ForeColor.RGB = RGB(20, 83, 45)
                boxR.TextFrame2.TextRange.Text = "[V] " & k
            ElseIf g_pt_selB.Exists(k) Then
                boxR.Fill.ForeColor.RGB = RGB(191, 219, 254)
                boxR.Line.ForeColor.RGB = RGB(37, 99, 235)
                boxR.Line.Weight = 2
                boxR.TextFrame2.TextRange.Font.Fill.ForeColor.RGB = RGB(30, 64, 175)
                boxR.TextFrame2.TextRange.Text = CStr(k)
            Else
                boxR.Fill.ForeColor.RGB = RGB(255, 255, 255)
                boxR.Line.ForeColor.RGB = RGB(148, 163, 184)
                boxR.Line.Weight = 0.5
                boxR.TextFrame2.TextRange.Font.Fill.ForeColor.RGB = RGB(30, 41, 59)
                boxR.TextFrame2.TextRange.Text = CStr(k)
            End If
            On Error GoTo 0
        End If
    Next k

    ' RN 모드 — IN/OUT 박스 색칠 + A↔IN, OUT↔B 매핑선
    If g_pt_rnMode Then
        ' RN IN 박스
        Dim ri As Long
        Dim rinSelMap As Object: Set rinSelMap = CreateObject("Scripting.Dictionary")
        Dim mka As Variant
        If Not g_pt_mappingsA_IN Is Nothing Then
            For Each mka In g_pt_mappingsA_IN.Keys
                rinSelMap(CLng(g_pt_mappingsA_IN(mka))) = True
            Next mka
        End If
        For ri = 1 To g_pt_rnInCount
            Dim inBox As Shape: Set inBox = Nothing
            On Error Resume Next
            Set inBox = ws.Shapes(PREFIX_PT_RIN & ri)
            On Error GoTo 0
            If Not inBox Is Nothing Then
                On Error Resume Next
                ' owner 2026-06-06: RN IN 도 부분해제 모드에서 amber/rose 표시
                Dim isRnInSel As Boolean, isRnInTgt As Boolean
                isRnInSel = (g_pt_rnReleaseMode And Not g_pt_rnReleaseSelIN Is Nothing)
                If isRnInSel Then isRnInSel = g_pt_rnReleaseSelIN.Exists(ri)
                isRnInTgt = (g_pt_rnReleaseMode And Not g_pt_rnReleaseTargetIN Is Nothing)
                If isRnInTgt Then isRnInTgt = g_pt_rnReleaseTargetIN.Exists(ri)
                If isRnInSel Then
                    inBox.Fill.ForeColor.RGB = RGB(254, 202, 202)        ' rose
                    inBox.Line.ForeColor.RGB = RGB(220, 38, 38)
                    inBox.Line.Weight = 2
                    inBox.TextFrame2.TextRange.Font.Fill.ForeColor.RGB = RGB(127, 29, 29)
                    inBox.TextFrame2.TextRange.Text = "[해제] " & ri
                ElseIf isRnInTgt Then
                    inBox.Fill.ForeColor.RGB = RGB(253, 230, 138)        ' amber
                    inBox.Line.ForeColor.RGB = RGB(217, 119, 6)
                    inBox.Line.Weight = 1.5
                    inBox.TextFrame2.TextRange.Font.Fill.ForeColor.RGB = RGB(120, 53, 15)
                    inBox.TextFrame2.TextRange.Text = "[?] " & ri
                ElseIf Not g_pt_existingRN_IN Is Nothing And g_pt_existingRN_IN.Exists(ri) Then
                    inBox.Fill.ForeColor.RGB = RGB(203, 213, 225)
                    inBox.Line.ForeColor.RGB = RGB(100, 116, 139)
                    inBox.Line.Weight = 0.75
                    inBox.TextFrame2.TextRange.Font.Fill.ForeColor.RGB = RGB(71, 85, 105)
                    inBox.TextFrame2.TextRange.Text = "[잠] " & ri
                ElseIf rinSelMap.Exists(ri) Then
                    inBox.Fill.ForeColor.RGB = RGB(187, 247, 208)
                    inBox.Line.ForeColor.RGB = RGB(22, 163, 74)
                    inBox.Line.Weight = 1.5
                    inBox.TextFrame2.TextRange.Font.Fill.ForeColor.RGB = RGB(20, 83, 45)
                    inBox.TextFrame2.TextRange.Text = "[V] " & ri
                ElseIf Not g_pt_selRN_IN Is Nothing And g_pt_selRN_IN.Exists(ri) Then
                    inBox.Fill.ForeColor.RGB = RGB(191, 219, 254)
                    inBox.Line.ForeColor.RGB = RGB(37, 99, 235)
                    inBox.Line.Weight = 2
                    inBox.TextFrame2.TextRange.Font.Fill.ForeColor.RGB = RGB(30, 64, 175)
                    inBox.TextFrame2.TextRange.Text = CStr(ri)
                Else
                    inBox.Fill.ForeColor.RGB = RGB(255, 255, 255)
                    inBox.Line.ForeColor.RGB = RGB(148, 163, 184)
                    inBox.Line.Weight = 0.5
                    inBox.TextFrame2.TextRange.Font.Fill.ForeColor.RGB = RGB(30, 41, 59)
                    inBox.TextFrame2.TextRange.Text = CStr(ri)
                End If
                On Error GoTo 0
            End If
        Next ri
        ' RN OUT 박스
        For ri = 1 To g_pt_rnOutCount
            Dim outBox As Shape: Set outBox = Nothing
            On Error Resume Next
            Set outBox = ws.Shapes(PREFIX_PT_ROUT & ri)
            On Error GoTo 0
            If Not outBox Is Nothing Then
                On Error Resume Next
                ' owner 2026-06-05: RN1 모드는 mappingsA_OUT (Cable A ↔ RN OUT) 의 value 도 확인.
                Dim outMappedRN1 As Boolean: outMappedRN1 = False
                If g_pt_rn1Mode And Not g_pt_mappingsA_OUT Is Nothing Then
                    Dim mkAO As Variant
                    For Each mkAO In g_pt_mappingsA_OUT.Keys
                        If CLng(g_pt_mappingsA_OUT(mkAO)) = ri Then outMappedRN1 = True: Exit For
                    Next mkAO
                End If

                ' owner 2026-06-06: RN OUT 도 부분해제 모드에서 amber/rose 표시
                Dim isRnOutSel As Boolean, isRnOutTgt As Boolean
                isRnOutSel = (g_pt_rnReleaseMode And Not g_pt_rnReleaseSelOUT Is Nothing)
                If isRnOutSel Then isRnOutSel = g_pt_rnReleaseSelOUT.Exists(ri)
                isRnOutTgt = (g_pt_rnReleaseMode And Not g_pt_rnReleaseTargetOUT Is Nothing)
                If isRnOutTgt Then isRnOutTgt = g_pt_rnReleaseTargetOUT.Exists(ri)
                If isRnOutSel Then
                    outBox.Fill.ForeColor.RGB = RGB(254, 202, 202)        ' rose
                    outBox.Line.ForeColor.RGB = RGB(220, 38, 38)
                    outBox.Line.Weight = 2
                    outBox.TextFrame2.TextRange.Font.Fill.ForeColor.RGB = RGB(127, 29, 29)
                    outBox.TextFrame2.TextRange.Text = "[해제] " & ri
                ElseIf isRnOutTgt Then
                    outBox.Fill.ForeColor.RGB = RGB(253, 230, 138)        ' amber
                    outBox.Line.ForeColor.RGB = RGB(217, 119, 6)
                    outBox.Line.Weight = 1.5
                    outBox.TextFrame2.TextRange.Font.Fill.ForeColor.RGB = RGB(120, 53, 15)
                    outBox.TextFrame2.TextRange.Text = "[?] " & ri
                ElseIf Not g_pt_existingRN_OUT Is Nothing And g_pt_existingRN_OUT.Exists(ri) Then
                    outBox.Fill.ForeColor.RGB = RGB(203, 213, 225)
                    outBox.Line.ForeColor.RGB = RGB(100, 116, 139)
                    outBox.Line.Weight = 0.75
                    outBox.TextFrame2.TextRange.Font.Fill.ForeColor.RGB = RGB(71, 85, 105)
                    outBox.TextFrame2.TextRange.Text = "[잠] " & ri
                ' owner 2026-06-05: RN1 모드면 mappingsOUT_B 체크 스킵 (RN1 은 mappingsA_OUT 만 사용)
                ElseIf (Not g_pt_rn1Mode And Not g_pt_mappingsOUT_B Is Nothing And g_pt_mappingsOUT_B.Exists(ri)) Or outMappedRN1 Then
                    outBox.Fill.ForeColor.RGB = RGB(187, 247, 208)
                    outBox.Line.ForeColor.RGB = RGB(22, 163, 74)
                    outBox.Line.Weight = 1.5
                    outBox.TextFrame2.TextRange.Font.Fill.ForeColor.RGB = RGB(20, 83, 45)
                    outBox.TextFrame2.TextRange.Text = "[V] " & ri
                ElseIf Not g_pt_selRN_OUT Is Nothing And g_pt_selRN_OUT.Exists(ri) Then
                    outBox.Fill.ForeColor.RGB = RGB(191, 219, 254)
                    outBox.Line.ForeColor.RGB = RGB(37, 99, 235)
                    outBox.Line.Weight = 2
                    outBox.TextFrame2.TextRange.Font.Fill.ForeColor.RGB = RGB(30, 64, 175)
                    outBox.TextFrame2.TextRange.Text = CStr(ri)
                Else
                    outBox.Fill.ForeColor.RGB = RGB(255, 255, 255)
                    outBox.Line.ForeColor.RGB = RGB(148, 163, 184)
                    outBox.Line.Weight = 0.5
                    outBox.TextFrame2.TextRange.Font.Fill.ForeColor.RGB = RGB(30, 41, 59)
                    outBox.TextFrame2.TextRange.Text = CStr(ri)
                End If
                On Error GoTo 0
            End If
        Next ri
    End If

    ' 매핑 연결선 그리기 — owner 2026-06-06: 현재 페어의 잠금 매핑선 PAIRARROW 직접 순회로 정확히 그리기.
    '   기존 dict 기반은 다른 cable 페어 매핑 (예: cable B 의 leftK=1) 이 현재 cable A 의 1 박스로 잘못 그려지는 문제.
    '   PAIRARROW 의 box1/box2 alt 직접 확인 → 현재 페어 (cbl1Name 매치) 만 그림.
    선번연결_도구_매핑선그리기_PAIR기반 ws, RGB(148, 163, 184), 1#, msoLineSolid, "exist"
    ' live (현재 selection) 매핑선은 selection 기반이라 페어 무관 — dict 그대로 사용
    선번연결_도구_매핑선그리기 ws, g_pt_mappings, RGB(22, 163, 74), 1.75, msoLineSolid, "live"
    If g_pt_rnMode Then
        선번연결_도구_RN매핑선 ws, g_pt_mappingsA_IN, "A", "IN", RGB(22, 163, 74), 1.75, "liveA_IN"
        If g_pt_rn1Mode Then
            선번연결_도구_RN매핑선 ws, g_pt_mappingsA_OUT, "A", "OUT", RGB(22, 163, 74), 1.75, "liveA_OUT"
        Else
            선번연결_도구_RN매핑선 ws, g_pt_mappingsOUT_B, "OUT", "B", RGB(22, 163, 74), 1.75, "liveOUT_B"
        End If
    End If

    ' 상태 메시지
    If g_pt_selUnitsA Is Nothing Then Set g_pt_selUnitsA = CreateObject("Scripting.Dictionary")
    If g_pt_selUnitsB Is Nothing Then Set g_pt_selUnitsB = CreateObject("Scripting.Dictionary")
    Dim statusMsg As String
    If g_pt_releaseMode Then
        Dim releaseSelCnt As Long: releaseSelCnt = 0
        If Not g_pt_releaseSelected Is Nothing Then releaseSelCnt = g_pt_releaseSelected.Count
        Dim releaseTotalCnt As Long: releaseTotalCnt = 0
        If Not g_pt_releasePairs Is Nothing Then releaseTotalCnt = g_pt_releasePairs.Count
        statusMsg = "★ 해제 모드 ★    선택: " & releaseSelCnt & " / " & releaseTotalCnt & " 코어 (amber 박스 클릭 = 해제 토글)"
        On Error Resume Next
        ws.Range("N37").Value = statusMsg
        On Error GoTo 0
        선번연결_도구_사이드정보갱신 ws
        Exit Sub
    End If
    If g_pt_rnReleaseMode Then
        Dim rnRelSelA As Long: rnRelSelA = 0
        Dim rnRelSelB As Long: rnRelSelB = 0
        Dim rnRelTgtA As Long: rnRelTgtA = 0
        Dim rnRelTgtB As Long: rnRelTgtB = 0
        If Not g_pt_rnReleaseSelA Is Nothing Then rnRelSelA = g_pt_rnReleaseSelA.Count
        If Not g_pt_rnReleaseSelB Is Nothing Then rnRelSelB = g_pt_rnReleaseSelB.Count
        If Not g_pt_rnReleaseTargetA Is Nothing Then rnRelTgtA = g_pt_rnReleaseTargetA.Count
        If Not g_pt_rnReleaseTargetB Is Nothing Then rnRelTgtB = g_pt_rnReleaseTargetB.Count
        statusMsg = "★ RN 부분 해제 모드 ★    A " & rnRelSelA & "/" & rnRelTgtA & " · B " & rnRelSelB & "/" & rnRelTgtB & "  (amber 박스 클릭 = 해제 토글)"
        On Error Resume Next
        ws.Range("N37").Value = statusMsg
        On Error GoTo 0
        선번연결_도구_사이드정보갱신 ws
        Exit Sub
    End If
    statusMsg = "선택: A 코어 " & g_pt_selA.Count & " / B 코어 " & g_pt_selB.Count
    If g_pt_selUnitsA.Count > 0 Or g_pt_selUnitsB.Count > 0 Then
        statusMsg = statusMsg & "  ·  UNIT A " & g_pt_selUnitsA.Count & " / B " & g_pt_selUnitsB.Count
    End If
    statusMsg = statusMsg & "     매핑: " & g_pt_mappings.Count & " 쌍"
    statusMsg = statusMsg & "     잠금: A " & g_pt_existingA.Count & " / B " & g_pt_existingB.Count
    If g_pt_selUnitsA.Count > 0 And g_pt_selUnitsB.Count > 0 Then
        If g_pt_selUnitsA.Count = g_pt_selUnitsB.Count Then
            statusMsg = statusMsg & "   ·   「다중선택」 = UNIT " & g_pt_selUnitsA.Count & " 쌍 1:1 연결"
        Else
            statusMsg = statusMsg & "   ·   ! UNIT 수 불일치 (A " & g_pt_selUnitsA.Count & " vs B " & g_pt_selUnitsB.Count & ")"
        End If
    ElseIf g_pt_selA.Count > 0 And g_pt_selB.Count > 0 Then
        If g_pt_selA.Count = g_pt_selB.Count Then
            statusMsg = statusMsg & "   ·   「다중선택」 = 코어 " & g_pt_selA.Count & " 쌍 매핑"
        Else
            statusMsg = statusMsg & "   ·   ! 코어 수 불일치 (A " & g_pt_selA.Count & " vs B " & g_pt_selB.Count & ")"
        End If
    End If
    On Error Resume Next
    ws.Range("N37").Value = statusMsg
    On Error GoTo 0

    ' owner 2026-06-05: 캔버스 위 사이드 정보 (시설물·배지·선택코어 카운트) 라이브 갱신
    선번연결_도구_사이드정보갱신 ws
End Sub

' owner 2026-06-06: 잠금 매핑선 PAIRARROW 직접 순회 기반 그리기.
'   기존 dict 기반은 다른 cable 페어 매핑까지 같은 coreN 박스에 그리는 문제.
'   여기서는 PAIRARROW 의 box1/box2 alt 직접 검사 → 현재 페어 (g_pt_cbl1Name + g_pt_facId) 매치 화살표만 처리.
'   각 화살표 양 박스의 텍스트를 파싱해 leftK→rightK 매핑 추출 후 시각화.
' owner 2026-06-06: 페어 매핑선 그릴 때 RN/cable 측 텍스트 → 토큰 확장.
'   필요성: cable B box 텍스트가 "3~6,7,8" 형식이면 단순 Split 으로는 3 토큰 ([3~6, 7, 8]) → A 측 6 개와 정렬 안 맞아
'   A:3↔B:3 매핑이 A:4↔B:7 로 잘못 그려짐.
'   규칙:
'     - "N" → "N"
'     - "N~M" 또는 "N-M" → "N", "N+1", ..., "M" 으로 확장
'     - "prefix_N" (RN i_/m_/s_/p_) → 그대로 보존 (한 토큰)
Public Sub 선번연결_도구_매핑토큰_확장(rawText As String, ByRef outTokens() As String)
    Dim items As Collection: Set items = New Collection
    Dim cleaned As String: cleaned = Replace(Trim(rawText), " ", "")
    Dim parts() As String: parts = Split(cleaned, ",")
    Dim i As Long
    For i = LBound(parts) To UBound(parts)
        Dim tk As String: tk = parts(i)
        If Len(tk) > 0 Then
            If InStr(tk, "_") > 0 Then
                ' RN prefix 토큰 — 그대로 보존
                items.Add tk
            Else
                ' 범위 확장 또는 단일 정수
                Dim rngPos As Long: rngPos = InStr(tk, "~")
                If rngPos = 0 Then rngPos = InStr(tk, "-")
                If rngPos > 0 Then
                    Dim aStr As String: aStr = Left(tk, rngPos - 1)
                    Dim bStr As String: bStr = Mid(tk, rngPos + 1)
                    If IsNumeric(aStr) And IsNumeric(bStr) Then
                        Dim aVal As Long: aVal = CLng(aStr)
                        Dim bVal As Long: bVal = CLng(bStr)
                        If aVal > 0 And bVal > 0 And aVal <= bVal Then
                            Dim j As Long
                            For j = aVal To bVal: items.Add CStr(j): Next j
                        End If
                    End If
                ElseIf IsNumeric(tk) Then
                    items.Add tk
                End If
            End If
        End If
    Next i

    If items.Count = 0 Then
        ReDim outTokens(0 To 0)
        outTokens(0) = ""
        Exit Sub
    End If
    ReDim outTokens(0 To items.Count - 1)
    Dim mi As Long
    For mi = 1 To items.Count
        outTokens(mi - 1) = CStr(items(mi))
    Next mi
End Sub

Public Sub 선번연결_도구_매핑선그리기_PAIR기반(ws As Worksheet, _
                                                  colorRgb As Long, weight As Double, _
                                                  dashStyle As MsoLineDashStyle, tag As String)
    Dim wsNw As Worksheet
    On Error Resume Next: Set wsNw = ThisWorkbook.Worksheets(SHEET_NETWORK): On Error GoTo 0
    If wsNw Is Nothing Then Exit Sub
    If Len(g_pt_facId) = 0 Then Exit Sub
    If Len(g_pt_cbl1Name) = 0 Then Exit Sub

    Dim facTag As String: facTag = "fac=" & g_pt_facId
    Dim tag1 As String: tag1 = "cbl=" & g_pt_cbl1Name

    Dim pairAgg As Object: Set pairAgg = CreateObject("Scripting.Dictionary")

    Dim arr As Shape, alt As String
    For Each arr In wsNw.Shapes
        If Left(arr.Name, Len(PREFIX_PAIRARROW)) = PREFIX_PAIRARROW Then
            alt = ""
            On Error Resume Next: alt = arr.AlternativeText: On Error GoTo 0
            Dim p1 As Long, p2 As Long
            p1 = InStr(alt, "box1=")
            p2 = InStr(alt, "box2=")
            If p1 > 0 And p2 > 0 Then
                Dim b1Name As String, b2Name As String
                b1Name = Mid(alt, p1 + 5, p2 - p1 - 6)
                Dim p2End As Long: p2End = InStr(p2, alt, "|")
                If p2End = 0 Then p2End = Len(alt) + 1
                b2Name = Mid(alt, p2 + 5, p2End - (p2 + 5))

                Dim shA As Shape, shB As Shape
                Set shA = Nothing: Set shB = Nothing
                On Error Resume Next
                Set shA = wsNw.Shapes(b1Name)
                Set shB = wsNw.Shapes(b2Name)
                On Error GoTo 0
                If Not shA Is Nothing And Not shB Is Nothing Then
                    Dim altA As String, altB As String
                    altA = "": altB = ""
                    On Error Resume Next
                    altA = shA.AlternativeText
                    altB = shB.AlternativeText
                    On Error GoTo 0

                    ' 페어 검증: 두 박스 모두 facId 매치 + 양쪽이 현재 페어 (cbl1Name + cbl2Name) 매치
                    '   RN1/cable-facility 단일 cable 모드 (cbl1==cbl2): 한쪽이 cbl1 매치 + 다른쪽이 cbl=facId (시설물 박스)
                    '   cable-cable 모드: 한쪽이 cbl1 + 다른쪽이 cbl2 매치 — 다른 cable 페어 (cbl1 + cbl3) 자동 제외
                    If InStr(altA, facTag) > 0 And InStr(altB, facTag) > 0 Then
                        Dim aHasCbl1 As Boolean: aHasCbl1 = (InStr(altA, tag1) > 0)
                        Dim bHasCbl1 As Boolean: bHasCbl1 = (InStr(altB, tag1) > 0)
                        Dim tag2 As String: tag2 = "cbl=" & g_pt_cbl2Name
                        Dim aHasCbl2 As Boolean: aHasCbl2 = (Len(g_pt_cbl2Name) > 0 And InStr(altA, tag2) > 0)
                        Dim bHasCbl2 As Boolean: bHasCbl2 = (Len(g_pt_cbl2Name) > 0 And InStr(altB, tag2) > 0)
                        Dim facBoxTag As String: facBoxTag = "cbl=" & g_pt_facId
                        Dim aHasFacBox As Boolean: aHasFacBox = (InStr(altA, facBoxTag) > 0)
                        Dim bHasFacBox As Boolean: bHasFacBox = (InStr(altB, facBoxTag) > 0)

                        Dim isPair As Boolean: isPair = False
                        If g_pt_cbl1Name = g_pt_cbl2Name Or Len(g_pt_cbl2Name) = 0 Then
                            ' 단일 cable 모드 (RN1/cable-facility) — 한쪽 cbl1 + 다른쪽 시설물박스
                            isPair = (aHasCbl1 And bHasFacBox) Or (bHasCbl1 And aHasFacBox)
                            ' fallback — 시설물 박스 검증 못 하는 옛 페어 (둘 다 cbl1 매치 시 처리)
                            If Not isPair Then isPair = (aHasCbl1 Or bHasCbl1)
                        Else
                            ' cable-cable 모드 — 한쪽 cbl1 + 다른쪽 cbl2 (다른 cable 페어 제외)
                            isPair = (aHasCbl1 And bHasCbl2) Or (bHasCbl1 And aHasCbl2)
                        End If

                        If isPair Then
                            ' 텍스트 추출
                            Dim txtA As String, txtB As String
                            txtA = "": txtB = ""
                            On Error Resume Next
                            txtA = shA.TextFrame2.TextRange.Text
                            txtB = shB.TextFrame2.TextRange.Text
                            On Error GoTo 0

                            ' cable A 측 (aHasCbl1 True) 가 left, 반대편이 right
                            Dim leftCoresTxt As String, rightCoresTxt As String
                            If aHasCbl1 Then
                                leftCoresTxt = txtA: rightCoresTxt = txtB
                            Else
                                leftCoresTxt = txtB: rightCoresTxt = txtA
                            End If

                            ' Cable A 측 정수 파싱
                            Dim numsL As Variant
                            선번_파싱 leftCoresTxt, numsL
                            ' RN/cable B 측 — 범위(~/-) 확장 + RN prefix 보존
                            '   owner 2026-06-06 fix: 기존엔 Split 만 해서 "3~6,7,8" → 3 토큰 → A 측 6 개와 정렬 안 맞아
                            '   A:4↔B:7 같은 잘못된 매핑선 생성. 신규 헬퍼 매핑토큰_확장 으로 "3~6" → "3","4","5","6" 풀어줌.
                            Dim rTokens() As String
                            선번연결_도구_매핑토큰_확장 rightCoresTxt, rTokens

                            If Not IsEmpty(numsL) Then
                                Dim mi As Long, mn As Long
                                mn = UBound(numsL)
                                Dim rUB As Long: rUB = UBound(rTokens) - LBound(rTokens)
                                If rUB < mn Then mn = rUB
                                For mi = 0 To mn
                                    Dim leftK As Long: leftK = CLng(numsL(mi))
                                    Dim rToken As String: rToken = Trim(rTokens(LBound(rTokens) + mi))
                                    Dim leftName As String, rightName As String
                                    leftName = 선번연결_도구_visible박스이름("A", leftK)
                                    rightName = ""

                                    ' rToken prefix 처리 — "i_N" → PT_RIN_N, "m/s/p_N" → PT_ROUT_N, 정수 → PT_R_N (일반 cable B)
                                    Dim usPos As Long: usPos = InStr(rToken, "_")
                                    If usPos > 0 Then
                                        Dim rPref As String: rPref = LCase(Left(rToken, usPos - 1))
                                        Dim rNumS As String: rNumS = Mid(rToken, usPos + 1)
                                        If IsNumeric(rNumS) Then
                                            Dim rightK As Long: rightK = CLng(rNumS)
                                            Select Case rPref
                                                Case "i":              rightName = PREFIX_PT_RIN & rightK
                                                Case "m", "s", "p":    rightName = PREFIX_PT_ROUT & rightK
                                            End Select
                                        End If
                                    ElseIf IsNumeric(rToken) Then
                                        rightName = 선번연결_도구_visible박스이름("B", CLng(rToken))
                                    End If

                                    If Len(leftName) > 0 And Len(rightName) > 0 Then
                                        Dim aggKey As String: aggKey = leftName & "||" & rightName
                                        Dim prev As Long: prev = 0
                                        If pairAgg.Exists(aggKey) Then prev = CLng(pairAgg(aggKey))
                                        pairAgg(aggKey) = prev + 1
                                    End If
                                Next mi
                            End If
                        End If
                    End If
                End If
            End If
        End If
    Next arr

    ' pairAgg 기반 매핑선 그리기
    Dim pk As Variant
    For Each pk In pairAgg.Keys
        Dim parts() As String: parts = Split(CStr(pk), "||")
        Dim shL As Shape, shR As Shape
        Set shL = Nothing: Set shR = Nothing
        On Error Resume Next
        Set shL = ws.Shapes(parts(0))
        Set shR = ws.Shapes(parts(1))
        On Error GoTo 0
        If shL Is Nothing Or shR Is Nothing Then GoTo NextPk
        ' 매핑선 좌표 — 박스 중심 비교로 자동 방향 판단. 박스 내부 통과 안 함.
        Dim cL As Double: cL = shL.Left + shL.Width / 2
        Dim cR As Double: cR = shR.Left + shR.Width / 2
        Dim x1 As Double, y1 As Double, x2 As Double, y2 As Double
        If cL <= cR Then
            x1 = shL.Left + shL.Width
            x2 = shR.Left
        Else
            x1 = shL.Left
            x2 = shR.Left + shR.Width
        End If
        y1 = shL.Top + shL.Height / 2
        y2 = shR.Top + shR.Height / 2
        Dim ln As Shape
        Set ln = ws.Shapes.AddLine(x1, y1, x2, y2)
        ln.Name = PREFIX_PT_LINE & tag & "_" & Replace(parts(0), "_", "") & "_" & Replace(parts(1), "_", "")
        ln.Placement = 3
        On Error Resume Next
        ln.Line.ForeColor.RGB = colorRgb
        ln.Line.Weight = weight
        ln.Line.DashStyle = dashStyle
        ln.ZOrder msoSendToBack
        On Error GoTo 0

        ' 묶음 카운트 배지 (2 쌍 이상)
        Dim cnt As Long: cnt = CLng(pairAgg(pk))
        If cnt >= 2 Then
            Dim mxx As Double, myy As Double
            mxx = (x1 + x2) / 2: myy = (y1 + y2) / 2
            Dim badge As Shape
            Set badge = ws.Shapes.AddShape(msoShapeRoundedRectangle, mxx - 14, myy - 8, 28, 16)
            badge.Name = PREFIX_PT_LINE & tag & "_b_" & Replace(parts(0), "_", "") & "_" & Replace(parts(1), "_", "")
            badge.Placement = 3
            On Error Resume Next
            badge.Line.ForeColor.RGB = colorRgb
            badge.Line.Weight = 0.75
            badge.Fill.ForeColor.RGB = RGB(255, 255, 255)
            With badge.TextFrame2
                .MarginLeft = 1: .MarginRight = 1: .MarginTop = 0: .MarginBottom = 0
                .VerticalAnchor = msoAnchorMiddle
                .TextRange.Text = cnt & "쌍"
                .TextRange.Font.Name = CALLOUT_FONT_NAME
                .TextRange.Font.Size = 8
                .TextRange.Font.Bold = msoTrue
                .TextRange.Font.Fill.ForeColor.RGB = colorRgb
                .TextRange.ParagraphFormat.Alignment = 2
            End With
            On Error GoTo 0
        End If
NextPk:
    Next pk
End Sub

' 매핑선 그리기 헬퍼 — mappings dict (leftCore→rightCore) 를 시트에 시각화.
'   각 매핑 쌍에 대해 visible shape 찾기 (펼친 코어 박스 OR 접힌 유닛 버튼).
'   같은 visible (leftShape, rightShape) pair 는 묶어서 1개 선만 + 합산 카운트 배지.
'   유닛↔유닛 매핑 (12 코어 동시) 시 12 선 겹침 방지 → 1 굵은 선 + "12쌍" 라벨.
Public Sub 선번연결_도구_매핑선그리기(ws As Worksheet, mDict As Object, _
                                       colorRgb As Long, weight As Double, _
                                       dashStyle As MsoLineDashStyle, tag As String)
    If mDict Is Nothing Then Exit Sub
    If mDict.Count = 0 Then Exit Sub
    Dim pairAgg As Object: Set pairAgg = CreateObject("Scripting.Dictionary")
    ' value = "leftShapeName|rightShapeName|count"
    Dim mk As Variant
    For Each mk In mDict.Keys
        Dim leftK As Long, rightK As Long
        leftK = CLng(mk): rightK = CLng(mDict(mk))
        Dim leftName As String, rightName As String
        leftName = 선번연결_도구_visible박스이름("A", leftK)
        rightName = 선번연결_도구_visible박스이름("B", rightK)
        If Len(leftName) = 0 Or Len(rightName) = 0 Then GoTo NextMk
        Dim key As String: key = leftName & "||" & rightName
        Dim prev As Long: prev = 0
        If pairAgg.Exists(key) Then prev = CLng(pairAgg(key))
        pairAgg(key) = prev + 1
NextMk:
    Next mk

    Dim pk As Variant
    For Each pk In pairAgg.Keys
        Dim parts() As String: parts = Split(CStr(pk), "||")
        Dim shL As Shape, shR As Shape
        Set shL = Nothing: Set shR = Nothing
        On Error Resume Next
        Set shL = ws.Shapes(parts(0))
        Set shR = ws.Shapes(parts(1))
        On Error GoTo 0
        If shL Is Nothing Or shR Is Nothing Then GoTo NextPk
        ' 매핑선 좌표 — 박스 중심 비교로 자동 방향 판단. 박스 내부 통과 안 함.
        Dim cL As Double: cL = shL.Left + shL.Width / 2
        Dim cR As Double: cR = shR.Left + shR.Width / 2
        Dim x1 As Double, y1 As Double, x2 As Double, y2 As Double
        If cL <= cR Then
            x1 = shL.Left + shL.Width
            x2 = shR.Left
        Else
            x1 = shL.Left
            x2 = shR.Left + shR.Width
        End If
        y1 = shL.Top + shL.Height / 2
        y2 = shR.Top + shR.Height / 2
        Dim ln As Shape
        Set ln = ws.Shapes.AddLine(x1, y1, x2, y2)
        ln.Name = PREFIX_PT_LINE & tag & "_" & Replace(parts(0), "_", "") & "_" & Replace(parts(1), "_", "")
        ln.Placement = 3
        On Error Resume Next
        ln.Line.ForeColor.RGB = colorRgb
        ln.Line.Weight = weight
        ln.Line.DashStyle = dashStyle
        ln.ZOrder msoSendToBack          ' 박스 뒤로 — 회색 잠금선이 박스 영역 침범해도 박스에 가려져 안 보임
        On Error GoTo 0

        ' 묶음 카운트 배지 (2 쌍 이상) — 선 중간에 작은 라벨
        Dim cnt As Long: cnt = CLng(pairAgg(pk))
        If cnt >= 2 Then
            Dim mxx As Double, myy As Double
            mxx = (x1 + x2) / 2: myy = (y1 + y2) / 2
            Dim badge As Shape
            Set badge = ws.Shapes.AddShape(msoShapeRoundedRectangle, mxx - 14, myy - 8, 28, 16)
            badge.Name = PREFIX_PT_LINE & tag & "_b_" & Replace(parts(0), "_", "") & "_" & Replace(parts(1), "_", "")
            badge.Placement = 3
            On Error Resume Next
            badge.Line.ForeColor.RGB = colorRgb
            badge.Line.Weight = 0.75
            badge.Fill.ForeColor.RGB = RGB(255, 255, 255)
            With badge.TextFrame2
                .MarginLeft = 1: .MarginRight = 1: .MarginTop = 0: .MarginBottom = 0
                .VerticalAnchor = msoAnchorMiddle
                .TextRange.Text = cnt & "쌍"
                .TextRange.Font.Name = CALLOUT_FONT_NAME
                .TextRange.Font.Size = 8
                .TextRange.Font.Bold = msoTrue
                .TextRange.Font.Fill.ForeColor.RGB = colorRgb
                .TextRange.ParagraphFormat.Alignment = 2
            End With
            On Error GoTo 0
        End If
NextPk:
    Next pk
End Sub

' RN 모드 매핑선 — A↔IN 또는 OUT↔B. left side / right side 분기.
'   leftSide·rightSide: "A"/"IN"/"OUT"/"B" 중 하나.
'   owner 2026-06-05: 새 레이아웃에선 RN 포트가 좌측·Cable 이 우측이라 leftSide 가 지리적으로 우측일 수 있음.
'   → 두 박스 x 좌표를 비교해 더 좌측 박스의 오른쪽 edge → 더 우측 박스의 왼쪽 edge 로 연결.
Public Sub 선번연결_도구_RN매핑선(ws As Worksheet, mDict As Object, leftSide As String, rightSide As String, _
                                   colorRgb As Long, weight As Double, tag As String)
    If mDict Is Nothing Then Exit Sub
    If mDict.Count = 0 Then Exit Sub
    Dim mk As Variant
    For Each mk In mDict.Keys
        Dim leftK As Long, rightK As Long
        leftK = CLng(mk): rightK = CLng(mDict(mk))
        Dim leftName As String, rightName As String
        leftName = 선번연결_도구_RN박스이름(leftSide, leftK)
        rightName = 선번연결_도구_RN박스이름(rightSide, rightK)
        If Len(leftName) = 0 Or Len(rightName) = 0 Then GoTo NextRMk
        Dim shL As Shape, shR As Shape
        Set shL = Nothing: Set shR = Nothing
        On Error Resume Next
        Set shL = ws.Shapes(leftName)
        Set shR = ws.Shapes(rightName)
        On Error GoTo 0
        If shL Is Nothing Or shR Is Nothing Then GoTo NextRMk
        Dim x1 As Double, y1 As Double, x2 As Double, y2 As Double
        ' 두 박스 중심 x 비교 — 더 좌측 박스의 right edge → 더 우측 박스의 left edge.
        Dim cL As Double: cL = shL.Left + shL.Width / 2
        Dim cR As Double: cR = shR.Left + shR.Width / 2
        If cL <= cR Then
            x1 = shL.Left + shL.Width: x2 = shR.Left
        Else
            x1 = shL.Left: x2 = shR.Left + shR.Width
        End If
        y1 = shL.Top + shL.Height / 2
        y2 = shR.Top + shR.Height / 2
        Dim ln As Shape
        Set ln = ws.Shapes.AddLine(x1, y1, x2, y2)
        ln.Name = PREFIX_PT_LINE & tag & "_" & leftK & "_" & rightK
        ln.Placement = 3
        On Error Resume Next
        ln.Line.ForeColor.RGB = colorRgb
        ln.Line.Weight = weight
        ln.ZOrder msoSendToBack          ' 박스 뒤로 — RN 매핑선이 IN/OUT/Cable 박스 영역에 침범 못 함
        On Error GoTo 0
NextRMk:
    Next mk
End Sub

' RN 사이드 코어번호 → 시트 shape 이름.
'   "A"/"B" → 기존 visible박스이름 위임 (유닛 폴백 포함).
'   "IN"/"OUT" → PREFIX_PT_RIN/PREFIX_PT_ROUT & coreN (RN 박스는 유닛 없음, 항상 펼침).
Public Function 선번연결_도구_RN박스이름(sideKey As String, coreN As Long) As String
    Select Case sideKey
        Case "A":   선번연결_도구_RN박스이름 = 선번연결_도구_visible박스이름("A", coreN)
        Case "B":   선번연결_도구_RN박스이름 = 선번연결_도구_visible박스이름("B", coreN)
        Case "IN":  선번연결_도구_RN박스이름 = PREFIX_PT_RIN & coreN
        Case "OUT": 선번연결_도구_RN박스이름 = PREFIX_PT_ROUT & coreN
        Case Else:  선번연결_도구_RN박스이름 = ""
    End Select
End Function

' 코어번호 → 시트에 현재 보이는 shape 이름 (펼친 코어 박스 또는 접힌 유닛 버튼).
'   sideKey = "A" 또는 "B". 펼침이면 PREFIX_PT_L/R & coreN, 접힘이면 PREFIX_PT_BTN & "u<side>_<unit>_e_c".
Public Function 선번연결_도구_visible박스이름(sideKey As String, coreN As Long) As String
    선번연결_도구_visible박스이름 = ""
    Dim unitSize As Long, expDict As Object, prefixCore As String
    If sideKey = "A" Then
        unitSize = g_pt_unitSize1: Set expDict = g_pt_expandedA: prefixCore = PREFIX_PT_L
    ElseIf sideKey = "B" Then
        unitSize = g_pt_unitSize2: Set expDict = g_pt_expandedB: prefixCore = PREFIX_PT_R
    Else
        Exit Function
    End If
    If unitSize < 1 Then unitSize = 1
    Dim u As Long: u = ((coreN - 1) \ unitSize) + 1
    If Not expDict Is Nothing Then
        If expDict.Exists(u) Then
            선번연결_도구_visible박스이름 = prefixCore & coreN
            Exit Function
        End If
    End If
    선번연결_도구_visible박스이름 = PREFIX_PT_BTN & "u" & sideKey & "_" & u & "_e_c"
End Function

' 다중선택 → 매핑 — 양 사이드의 현재 선택을 정렬 후 1:1 페어링.
'   selA.count = selB.count > 0 일 때만 작동. 결과는 g_pt_mappings 에 누적 (덮어쓰기).
'   매핑 후 선택 해제 (다음 묶음 진행 편의).
' 드래그 선택 핸들러 — Workbook_SheetSelectionChange 가 호출.
'   사용자가 시트에서 셀 영역을 드래그하면 그 사각 범위와 겹치는 코어 박스를 토글.
'   Step 2 일 때만 작동. Step 1 또는 1개 셀 선택은 무시 (네이티브 셀 클릭 자유).
'   잠금 코어(g_pt_existingA/B) 는 토글 대상에서 제외.
Public Sub 선번연결_도구_셀선택(target As Range)
    If Not 라이센스_게이트() Then Exit Sub        ' owner 2026-06-16: 미인증 시 차단
    On Error Resume Next
    If g_pt_step <> 2 Then Exit Sub
    If target Is Nothing Then Exit Sub
    If target.Cells.Count < 2 Then Exit Sub               ' 단일 셀 클릭 무시 (드래그만 토글)

    Dim ws As Worksheet: Set ws = ThisWorkbook.Worksheets(SHEET_PAIR_TOOL)
    If g_pt_selA Is Nothing Then Set g_pt_selA = CreateObject("Scripting.Dictionary")
    If g_pt_selB Is Nothing Then Set g_pt_selB = CreateObject("Scripting.Dictionary")

    ' 사각형 bounds (point 단위)
    Dim rLeft As Double, rTop As Double, rRight As Double, rBottom As Double
    rLeft = target.Left: rTop = target.Top
    rRight = rLeft + target.Width: rBottom = rTop + target.Height

    Dim sh As Shape
    Dim hits As Long: hits = 0
    For Each sh In ws.Shapes
        Dim isA As Boolean, isB As Boolean
        isA = (Left(sh.Name, Len(PREFIX_PT_L)) = PREFIX_PT_L)
        isB = (Left(sh.Name, Len(PREFIX_PT_R)) = PREFIX_PT_R)
        If isA Or isB Then
            Dim cx As Double, cy As Double
            cx = sh.Left + sh.Width / 2
            cy = sh.Top + sh.Height / 2
            If cx >= rLeft And cx <= rRight And cy >= rTop And cy <= rBottom Then
                Dim coreN As Long
                If isA Then
                    coreN = CLng(Mid(sh.Name, Len(PREFIX_PT_L) + 1))
                    If g_pt_existingA Is Nothing Then
                        g_pt_selA(coreN) = True: hits = hits + 1
                    ElseIf Not g_pt_existingA.Exists(coreN) Then
                        ' 토글 — 안 들어있으면 추가, 들어있으면 해제
                        If g_pt_selA.Exists(coreN) Then g_pt_selA.Remove coreN Else g_pt_selA(coreN) = True
                        hits = hits + 1
                    End If
                Else
                    coreN = CLng(Mid(sh.Name, Len(PREFIX_PT_R) + 1))
                    If g_pt_existingB Is Nothing Then
                        g_pt_selB(coreN) = True: hits = hits + 1
                    ElseIf Not g_pt_existingB.Exists(coreN) Then
                        If g_pt_selB.Exists(coreN) Then g_pt_selB.Remove coreN Else g_pt_selB(coreN) = True
                        hits = hits + 1
                    End If
                End If
            End If
        End If
    Next sh

    If hits > 0 Then 선번연결_도구_시각갱신
End Sub

Public Sub 선번연결_도구_다중선택()
    If g_pt_selA Is Nothing Then Set g_pt_selA = CreateObject("Scripting.Dictionary")
    If g_pt_selB Is Nothing Then Set g_pt_selB = CreateObject("Scripting.Dictionary")
    If g_pt_selUnitsA Is Nothing Then Set g_pt_selUnitsA = CreateObject("Scripting.Dictionary")
    If g_pt_selUnitsB Is Nothing Then Set g_pt_selUnitsB = CreateObject("Scripting.Dictionary")
    If g_pt_mappings Is Nothing Then Set g_pt_mappings = CreateObject("Scripting.Dictionary")
    If g_pt_existingA Is Nothing Then Set g_pt_existingA = CreateObject("Scripting.Dictionary")
    If g_pt_existingB Is Nothing Then Set g_pt_existingB = CreateObject("Scripting.Dictionary")

    ' RN 모드 — A↔IN 또는 OUT↔B (또는 둘 다) 동시 처리. 두 짝 모두 비어있으면 안내.
    If g_pt_rnMode Then
        If g_pt_selRN_IN Is Nothing Then Set g_pt_selRN_IN = CreateObject("Scripting.Dictionary")
        If g_pt_selRN_OUT Is Nothing Then Set g_pt_selRN_OUT = CreateObject("Scripting.Dictionary")
        If g_pt_mappingsA_IN Is Nothing Then Set g_pt_mappingsA_IN = CreateObject("Scripting.Dictionary")
        If g_pt_mappingsOUT_B Is Nothing Then Set g_pt_mappingsOUT_B = CreateObject("Scripting.Dictionary")

        Dim aOk As Boolean, inOk As Boolean, outOk As Boolean, bOk As Boolean
        aOk = (g_pt_selA.Count > 0)
        bOk = (g_pt_selB.Count > 0)
        inOk = (g_pt_selRN_IN.Count > 0)
        outOk = (g_pt_selRN_OUT.Count > 0)

        Dim aiAdded As Long: aiAdded = 0
        Dim obAdded As Long: obAdded = 0

        ' A ↔ IN
        If aOk And inOk Then
            If g_pt_selA.Count <> g_pt_selRN_IN.Count Then
                MsgBox "A " & g_pt_selA.Count & " 개  vs  RN IN " & g_pt_selRN_IN.Count & " 개" & vbLf & _
                       "개수가 일치해야 매핑됩니다.", vbExclamation, "RN 다중선택"
                Exit Sub
            End If
            Dim aArrR() As Long, inArrR() As Long
            선번연결_도구_dict정렬배열 g_pt_selA, aArrR
            선번연결_도구_dict정렬배열 g_pt_selRN_IN, inArrR
            Dim iia As Long
            For iia = 0 To UBound(aArrR)
                g_pt_mappingsA_IN(aArrR(iia)) = inArrR(iia)
                aiAdded = aiAdded + 1
            Next iia
            g_pt_selA.RemoveAll: g_pt_selRN_IN.RemoveAll
            g_pt_anchorA = 0: g_pt_anchorRN_IN = 0
        End If

        ' RN1 모드 — A ↔ OUT (Cable B 없음, A 사이드를 OUT 과 매핑). g_pt_mappingsA_OUT 사용.
        If g_pt_rn1Mode Then
            ' owner 2026-06-05: aOk 재평가 — A↔IN 분기가 위에서 selA 를 비웠을 수 있어 stale 방지.
            '   (cached aOk=True + selA.Count=0 으로 진입 시 카운트 mismatch 메시지 잘못 발생)
            Dim aOkR1 As Boolean: aOkR1 = (g_pt_selA.Count > 0)
            Dim outOkR1 As Boolean: outOkR1 = (g_pt_selRN_OUT.Count > 0)
            If aOkR1 And outOkR1 Then
                If g_pt_selA.Count <> g_pt_selRN_OUT.Count Then
                    MsgBox "A " & g_pt_selA.Count & " 개  vs  RN OUT " & g_pt_selRN_OUT.Count & " 개" & vbLf & _
                           "개수가 일치해야 매핑됩니다.", vbExclamation, "RN1 다중선택"
                    Exit Sub
                End If
                If g_pt_mappingsA_OUT Is Nothing Then Set g_pt_mappingsA_OUT = CreateObject("Scripting.Dictionary")
                Dim aArrR1 As Variant, outArrR1 As Variant
                Dim aArrR1L() As Long, outArrR1L() As Long
                선번연결_도구_dict정렬배열 g_pt_selA, aArrR1L
                선번연결_도구_dict정렬배열 g_pt_selRN_OUT, outArrR1L
                Dim iio As Long
                For iio = 0 To UBound(aArrR1L)
                    g_pt_mappingsA_OUT(aArrR1L(iio)) = outArrR1L(iio)
                    obAdded = obAdded + 1
                Next iio
                g_pt_selA.RemoveAll: g_pt_selRN_OUT.RemoveAll
                g_pt_anchorA = 0: g_pt_anchorRN_OUT = 0
            End If

            ' owner 2026-06-05: 양쪽 모두 0 이어도 차단 X — Cable·RN 한쪽만 선택했어도 결과 그대로 표시.
            '   에러 MsgBox 제거 → 상태바 안내만. 사용자가 한쪽 더 클릭 후 다시 「다중선택」 가능.
            If aiAdded = 0 And obAdded = 0 Then
                Application.StatusBar = "선택된 짝이 없습니다 — Cable 코어 + RN IN/OUT 포트 모두 클릭 후 「다중선택」 다시 누르세요."
                선번연결_도구_시각갱신
                Exit Sub
            End If

            Application.StatusBar = "RN1 매핑 추가 — Cable↔IN " & aiAdded & " 쌍 / Cable↔OUT " & obAdded & " 쌍. 「연결완료」 가능."
            선번연결_도구_시각갱신
            Exit Sub
        End If

        ' === 기존 RN (3-슬롯) — OUT ↔ B. dead code (owner 보존). ===
        If outOk And bOk Then
            If g_pt_selRN_OUT.Count <> g_pt_selB.Count Then
                MsgBox "RN OUT " & g_pt_selRN_OUT.Count & " 개  vs  B " & g_pt_selB.Count & " 개" & vbLf & _
                       "개수가 일치해야 매핑됩니다.", vbExclamation, "RN 다중선택"
                Exit Sub
            End If
            Dim outArrR() As Long, bArrR() As Long
            선번연결_도구_dict정렬배열 g_pt_selRN_OUT, outArrR
            선번연결_도구_dict정렬배열 g_pt_selB, bArrR
            Dim iib As Long
            For iib = 0 To UBound(outArrR)
                g_pt_mappingsOUT_B(outArrR(iib)) = bArrR(iib)
                obAdded = obAdded + 1
            Next iib
            g_pt_selRN_OUT.RemoveAll: g_pt_selB.RemoveAll
            g_pt_anchorRN_OUT = 0: g_pt_anchorB = 0
        End If

        ' owner 2026-06-05: 양쪽 모두 0 이어도 차단 X — 상태바 안내만.
        If aiAdded = 0 And obAdded = 0 Then
            Application.StatusBar = "선택된 짝이 없습니다 — A·B 코어 + 가운데 IN/OUT 포트 함께 클릭 후 「다중선택」 다시 누르세요."
            선번연결_도구_시각갱신
            Exit Sub
        End If

        Application.StatusBar = "RN 매핑 추가 — A↔IN " & aiAdded & " 쌍 / OUT↔B " & obAdded & " 쌍. 「연결완료」 가능."
        선번연결_도구_시각갱신
        Exit Sub
    End If

    ' UNIT 모드 우선 — UNIT 선택이 한쪽이라도 있으면 UNIT 매핑 처리 (owner #5 요구)
    If g_pt_selUnitsA.Count > 0 Or g_pt_selUnitsB.Count > 0 Then
        If g_pt_selUnitsA.Count = 0 Or g_pt_selUnitsB.Count = 0 Then
            MsgBox "UNIT 선택은 양쪽 모두 필요합니다." & vbLf & vbLf & _
                   "Shift+UNIT 라벨 클릭으로 양쪽 UNIT 을 골라주세요.", vbExclamation, "다중선택"
            Exit Sub
        End If
        If g_pt_selUnitsA.Count <> g_pt_selUnitsB.Count Then
            MsgBox "UNIT 수 불일치: A " & g_pt_selUnitsA.Count & " vs B " & g_pt_selUnitsB.Count, _
                   vbExclamation, "다중선택"
            Exit Sub
        End If

        Dim uArrA() As Long, uArrB() As Long
        선번연결_도구_dict정렬배열 g_pt_selUnitsA, uArrA
        선번연결_도구_dict정렬배열 g_pt_selUnitsB, uArrB

        Dim added As Long: added = 0
        Dim ui As Long
        For ui = 0 To UBound(uArrA)
            Dim startA As Long, endA As Long, startB As Long, endB As Long
            startA = (uArrA(ui) - 1) * g_pt_unitSize1 + 1
            endA = startA + g_pt_unitSize1 - 1
            If endA > g_pt_count1 Then endA = g_pt_count1
            startB = (uArrB(ui) - 1) * g_pt_unitSize2 + 1
            endB = startB + g_pt_unitSize2 - 1
            If endB > g_pt_count2 Then endB = g_pt_count2
            Dim sizeA As Long: sizeA = endA - startA + 1
            Dim sizeB As Long: sizeB = endB - startB + 1
            Dim minS As Long: If sizeA < sizeB Then minS = sizeA Else minS = sizeB
            Dim oi As Long
            For oi = 0 To minS - 1
                Dim coreA As Long: coreA = startA + oi
                Dim coreB As Long: coreB = startB + oi
                If Not g_pt_existingA.Exists(coreA) And Not g_pt_existingB.Exists(coreB) Then
                    g_pt_mappings(coreA) = coreB
                    added = added + 1
                End If
            Next oi
        Next ui

        g_pt_selA.RemoveAll
        g_pt_selB.RemoveAll
        g_pt_selUnitsA.RemoveAll
        g_pt_selUnitsB.RemoveAll
        g_pt_anchorA = 0: g_pt_anchorB = 0
        Application.StatusBar = "UNIT 매핑 " & added & " 쌍 추가 — 다음 묶음 또는 「연결완료」."
        선번연결_도구_시트빌드
        선번연결_도구_시각갱신
        Exit Sub
    End If

    ' 코어 모드 — 기존 동작
    If g_pt_selA.Count = 0 Or g_pt_selB.Count = 0 Then
        MsgBox "양쪽(A·B) 모두 선택돼 있어야 합니다." & vbLf & vbLf & _
               "코어 클릭 또는 Shift+UNIT 라벨로 선택 후 「다중선택」.", vbExclamation, "다중선택"
        Exit Sub
    End If
    If g_pt_selA.Count <> g_pt_selB.Count Then
        MsgBox "A 선택 " & g_pt_selA.Count & " 개  vs  B 선택 " & g_pt_selB.Count & " 개" & vbLf & _
               "개수가 일치해야 매핑됩니다.", vbExclamation, "다중선택"
        Exit Sub
    End If

    Dim aArr() As Long, bArr() As Long
    선번연결_도구_dict정렬배열 g_pt_selA, aArr
    선번연결_도구_dict정렬배열 g_pt_selB, bArr

    Dim i As Long
    For i = 0 To UBound(aArr)
        g_pt_mappings(aArr(i)) = bArr(i)
    Next i

    g_pt_selA.RemoveAll
    g_pt_selB.RemoveAll
    g_pt_anchorA = 0: g_pt_anchorB = 0
    Application.StatusBar = (UBound(aArr) + 1) & " 쌍 매핑 — 다음 묶음 선택하거나 「연결완료」."
    선번연결_도구_시각갱신
End Sub

' 정렬된 Long 배열 추출 헬퍼
Public Sub 선번연결_도구_dict정렬배열(d As Object, ByRef outArr() As Long)
    If d Is Nothing Then Exit Sub
    If d.Count = 0 Then Exit Sub
    ReDim outArr(0 To d.Count - 1)
    Dim idx As Long: idx = 0
    Dim k As Variant
    For Each k In d.Keys: outArr(idx) = CLng(k): idx = idx + 1: Next k
    Dim a As Long, b As Long, tmp As Long
    For a = 0 To UBound(outArr) - 1
        For b = a + 1 To UBound(outArr)
            If outArr(a) > outArr(b) Then
                tmp = outArr(a): outArr(a) = outArr(b): outArr(b) = tmp
            End If
        Next b
    Next a
End Sub

