Attribute VB_Name = "M3_PairBox"
Option Explicit

'   dedup 은 양쪽 페어 단위 (a,b) 로 _compact_쌍 에서 처리 (단일 박스만 보면 의미 없음).
Public Sub 선번박스_텍스트_파싱(ByVal txt As String, ByRef outArr() As Long, ByRef outCount As Long)
    outCount = 0
    Dim parts() As String: parts = Split(Trim(txt), ",")
    Dim p As Long
    Dim tempArr() As Long: ReDim tempArr(1 To 16)
    Dim cap As Long: cap = 16
    Dim cnt As Long: cnt = 0
    For p = LBound(parts) To UBound(parts)
        Dim seg As String: seg = Trim(parts(p))
        If Len(seg) = 0 Then GoTo NextPS
        Dim dash As Long: dash = InStr(seg, "-")
        Dim tilde As Long: tilde = InStr(seg, "~")
        Dim a As Long, b As Long
        If dash > 0 Then
            a = Val(Trim(Left(seg, dash - 1)))
            b = Val(Trim(Mid(seg, dash + 1)))
        ElseIf tilde > 0 Then
            a = Val(Trim(Left(seg, tilde - 1)))
            b = Val(Trim(Mid(seg, tilde + 1)))
        Else
            a = Val(seg): b = a
        End If
        If a <= 0 Or b <= 0 Or b < a Then GoTo NextPS
        Dim i As Long
        For i = a To b
            cnt = cnt + 1
            If cnt > cap Then
                cap = cap * 2
                ReDim Preserve tempArr(1 To cap)
            End If
            tempArr(cnt) = i
        Next i
NextPS:
    Next p
    outCount = cnt
    If cnt > 0 Then
        ReDim outArr(1 To cnt)
        For i = 1 To cnt
            outArr(i) = tempArr(i)
        Next i
    End If
End Sub

' 정렬된 코어 배열에 size<3 (연속 길이 2 이하) segment 가 하나라도 있는지.
'   owner 룰: 한쪽 박스가 콤마만 쓰면 (즉 모든 segment 가 size<3 또는 한 segment 만 있어도 size<3) 반대쪽도 콤마.
'   여기서는 "size<3 segment 가 하나라도 있나" 를 판정 — 양쪽 합쳐 한쪽이라도 true 면 둘 다 콤마전부 표기.
Public Function 선번박스_has_콤마세그먼트(ByRef arr() As Long, ByVal cnt As Long) As Boolean
    선번박스_has_콤마세그먼트 = False
    If cnt = 0 Then Exit Function
    Dim rs As Long: rs = arr(1)
    Dim rp As Long: rp = rs
    Dim ii As Long
    For ii = 2 To cnt
        Dim v As Long: v = arr(ii)
        If v = rp + 1 Then
            rp = v
        Else
            If rp - rs + 1 < 3 Then 선번박스_has_콤마세그먼트 = True: Exit Function
            rs = v: rp = v
        End If
    Next ii
    If rp - rs + 1 < 3 Then 선번박스_has_콤마세그먼트 = True
End Function

' compact: 연속 3+ → "a~b", 연속 1·2 → 콤마 분리.
Public Function 선번박스_compact_smart(ByRef arr() As Long, ByVal cnt As Long) As String
    If cnt = 0 Then 선번박스_compact_smart = "": Exit Function
    Dim result As String: result = ""
    Dim rs As Long: rs = arr(1)
    Dim rp As Long: rp = rs
    Dim ii As Long
    For ii = 2 To cnt
        Dim v As Long: v = arr(ii)
        If v = rp + 1 Then
            rp = v
        Else
            선번박스_compact_smart_emit result, rs, rp
            rs = v: rp = v
        End If
    Next ii
    선번박스_compact_smart_emit result, rs, rp
    선번박스_compact_smart = result
End Function

Public Sub 선번박스_compact_smart_emit(ByRef result As String, ByVal rs As Long, ByVal rp As Long)
    Dim segStr As String
    If rp - rs + 1 >= 3 Then
        segStr = rs & "~" & rp
    Else
        Dim k As Long: segStr = ""
        For k = rs To rp
            If Len(segStr) > 0 Then segStr = segStr & ","
            segStr = segStr & k
        Next k
    End If
    If Len(result) > 0 Then result = result & ","
    result = result & segStr
End Sub

' compact: 모두 콤마전부 ("1,2,3,4,5").
Public Function 선번박스_compact_콤마전부(ByRef arr() As Long, ByVal cnt As Long) As String
    If cnt = 0 Then 선번박스_compact_콤마전부 = "": Exit Function
    Dim result As String: result = ""
    Dim ii As Long
    For ii = 1 To cnt
        If Len(result) > 0 Then result = result & ","
        result = result & arr(ii)
    Next ii
    선번박스_compact_콤마전부 = result
End Function

' 박스에 텍스트 set + AutoSize/폭cap 동일 처리.
'   owner 2026-06-07 (8-62): 박스 자동 크기 — 텍스트가 길어 줄바꿈 되어도 height 자동 확장.
'   1단계: WordWrap=False + AutoSize → 한 줄로 자동 폭
'   2단계: 폭이 너무 크면 cap + WordWrap=True + AutoSize → height 자동 (줄바꿈 후 잘림 방지)
Public Sub 선번박스_텍스트_setShape(ByVal box As Shape, ByVal txt As String)
    Const MAX_WIDTH As Double = 120     ' 80 → 120 (owner 가 임의로 키워 쓰던 폭 반영)
    On Error Resume Next
    box.TextFrame2.TextRange.Text = txt
    box.TextFrame2.WordWrap = msoFalse
    box.TextFrame2.AutoSize = msoAutoSizeShapeToFitText
    If box.Width > MAX_WIDTH Then
        ' 폭 cap → WordWrap → AutoSize 재호출로 height 가 줄 수 만큼 자동 확장
        box.TextFrame2.AutoSize = msoAutoSizeNone
        box.Width = MAX_WIDTH
        box.TextFrame2.WordWrap = msoTrue
        box.TextFrame2.AutoSize = msoAutoSizeShapeToFitText
    End If
    On Error GoTo 0
End Sub

' 박스의 페어 박스 찾기 — anchor 도형 (alt: box1=...|box2=...) 순회. cascade 무관.
Public Function 선번박스_페어찾기(ByVal box As Shape, ByVal ws As Worksheet) As Shape
    Set 선번박스_페어찾기 = Nothing
    If box Is Nothing Or ws Is Nothing Then Exit Function
    Dim selfNm As String: selfNm = box.Name
    Dim sh As Shape, alt As String
    For Each sh In ws.Shapes
        If Left(sh.Name, Len(PREFIX_PAIRARROW)) = PREFIX_PAIRARROW Then
            alt = "": On Error Resume Next: alt = sh.AlternativeText: On Error GoTo 0
            Dim p1 As Long: p1 = InStr(alt, "box1=")
            Dim p2 As Long: p2 = InStr(alt, "|box2=")
            If p1 = 1 And p2 > p1 Then
                Dim b1Nm As String, b2Nm As String
                b1Nm = Mid(alt, p1 + 5, p2 - (p1 + 5))
                Dim p3 As Long: p3 = InStr(p2 + 6, alt, "|")
                If p3 = 0 Then p3 = Len(alt) + 1
                b2Nm = Mid(alt, p2 + 6, p3 - (p2 + 6))
                If b1Nm = selfNm Then
                    On Error Resume Next: Set 선번박스_페어찾기 = ws.Shapes(b2Nm): On Error GoTo 0
                    If Not 선번박스_페어찾기 Is Nothing Then Exit Function
                ElseIf b2Nm = selfNm Then
                    On Error Resume Next: Set 선번박스_페어찾기 = ws.Shapes(b1Nm): On Error GoTo 0
                    If Not 선번박스_페어찾기 Is Nothing Then Exit Function
                End If
            End If
        End If
    Next sh
End Function

' 양쪽 코어 배열을 1:1 매핑으로 보고 segment 분할 (양쪽 break points 의 합집합) → 각 segment 별로
'   양쪽 모두 연속 3+ 면 양쪽 ~ , 그 외는 양쪽 콤마 분리. 결과를 outA/outB 에 채움.
'   예: A=[1,2,3,5,6,8] B=[4,5,6,7,8,9] → A="1~3,5,6,8" B="4~6,7,8,9"
'   양쪽 코어 수가 다르면 fallback 으로 각자 smart compact (1:1 매핑 불가).
Public Sub 선번박스_compact_쌍(ByRef arrA() As Long, ByVal cntA As Long, _
                                 ByRef arrB() As Long, ByVal cntB As Long, _
                                 ByRef outA As String, ByRef outB As String)
    outA = "": outB = ""
    If cntA = 0 And cntB = 0 Then Exit Sub
    If cntA <> cntB Then
        ' 매핑 불가 — 각자 독립 smart compact
        outA = 선번박스_compact_smart(arrA, cntA)
        outB = 선번박스_compact_smart(arrB, cntB)
        Exit Sub
    End If

    ' owner 룰: 매핑 순서 유지 + 페어 단위 dedup ((a_i, b_i) 쌍 중복 = 첫 발견만)
    Dim dedA() As Long, dedB() As Long: ReDim dedA(1 To cntA): ReDim dedB(1 To cntA)
    Dim dCnt As Long: dCnt = 0
    Dim seen As Object: Set seen = CreateObject("Scripting.Dictionary")
    Dim di As Long
    For di = 1 To cntA
        Dim pairKey As String: pairKey = arrA(di) & "→" & arrB(di)
        If Not seen.Exists(pairKey) Then
            seen(pairKey) = True
            dCnt = dCnt + 1
            dedA(dCnt) = arrA(di)
            dedB(dCnt) = arrB(di)
        End If
    Next di

    Dim n As Long: n = dCnt
    If n = 0 Then Exit Sub

    ' Step 1: segment 분할 — 인접 페어가 양쪽 모두 연속이어야 같은 segment.
    '   각 segment 는 (sA, eA, sB, eB) — 양쪽 시작·끝 코어. dedA/dedB 의 매핑 순서 그대로 segment 식별.
    Dim sA() As Long, eA() As Long, sB() As Long, eB() As Long
    ReDim sA(1 To n): ReDim eA(1 To n): ReDim sB(1 To n): ReDim eB(1 To n)
    Dim segCount As Long: segCount = 0
    Dim segStart As Long: segStart = 1
    Dim i As Long
    For i = 1 To n
        Dim segEnd As Boolean: segEnd = False
        If i = n Then
            segEnd = True
        Else
            If dedA(i + 1) <> dedA(i) + 1 Then segEnd = True
            If dedB(i + 1) <> dedB(i) + 1 Then segEnd = True
        End If
        If segEnd Then
            segCount = segCount + 1
            sA(segCount) = dedA(segStart): eA(segCount) = dedA(i)
            sB(segCount) = dedB(segStart): eB(segCount) = dedB(i)
            segStart = i + 1
        End If
    Next i

    ' Step 2: sA 기준 정렬 시도. sB 도 정렬 후 monotonic + non-overlap 인 경우만 sort 채택.
    '   owner 룰 (8-62): 양쪽 매핑이 모두 연속(분리 후 sortable) 일 때만 정렬. 연속성 다르면 원래 순서 유지.
    Dim sA2() As Long, eA2() As Long, sB2() As Long, eB2() As Long
    ReDim sA2(1 To segCount): ReDim eA2(1 To segCount): ReDim sB2(1 To segCount): ReDim eB2(1 To segCount)
    Dim ii As Long
    For ii = 1 To segCount
        sA2(ii) = sA(ii): eA2(ii) = eA(ii): sB2(ii) = sB(ii): eB2(ii) = eB(ii)
    Next ii
    Dim si As Long, sj As Long, tA As Long, tB As Long
    For si = 1 To segCount - 1
        For sj = si + 1 To segCount
            If sA2(si) > sA2(sj) Then
                tA = sA2(si): sA2(si) = sA2(sj): sA2(sj) = tA
                tA = eA2(si): eA2(si) = eA2(sj): eA2(sj) = tA
                tB = sB2(si): sB2(si) = sB2(sj): sB2(sj) = tB
                tB = eB2(si): eB2(si) = eB2(sj): eB2(sj) = tB
            End If
        Next sj
    Next si
    ' sort 후 B 가 monotonic+non-overlap 인지 검증
    Dim canSort As Boolean: canSort = True
    For ii = 1 To segCount - 1
        If sB2(ii + 1) <= eB2(ii) Then canSort = False: Exit For
    Next ii

    ' Step 3: 정렬 채택 시 인접 segment 병합 (eA+1=sA' AND eB+1=sB')
    Dim outSA() As Long, outEA() As Long, outSB() As Long, outEB() As Long
    Dim outSegCount As Long
    ReDim outSA(1 To segCount): ReDim outEA(1 To segCount)
    ReDim outSB(1 To segCount): ReDim outEB(1 To segCount)
    If canSort Then
        outSegCount = 1
        outSA(1) = sA2(1): outEA(1) = eA2(1): outSB(1) = sB2(1): outEB(1) = eB2(1)
        For ii = 2 To segCount
            If outEA(outSegCount) + 1 = sA2(ii) And outEB(outSegCount) + 1 = sB2(ii) Then
                outEA(outSegCount) = eA2(ii)
                outEB(outSegCount) = eB2(ii)
            Else
                outSegCount = outSegCount + 1
                outSA(outSegCount) = sA2(ii): outEA(outSegCount) = eA2(ii)
                outSB(outSegCount) = sB2(ii): outEB(outSegCount) = eB2(ii)
            End If
        Next ii
    Else
        ' 원래 순서 유지
        outSegCount = segCount
        For ii = 1 To segCount
            outSA(ii) = sA(ii): outEA(ii) = eA(ii): outSB(ii) = sB(ii): outEB(ii) = eB(ii)
        Next ii
    End If

    ' Step 4: emit
    For ii = 1 To outSegCount
        Dim segSize As Long: segSize = outEA(ii) - outSA(ii) + 1
        Dim segAStr As String, segBStr As String
        If segSize >= 3 Then
            segAStr = outSA(ii) & "~" & outEA(ii)
            segBStr = outSB(ii) & "~" & outEB(ii)
        Else
            Dim k As Long
            segAStr = "": segBStr = ""
            For k = 0 To segSize - 1
                If Len(segAStr) > 0 Then segAStr = segAStr & ","
                segAStr = segAStr & (outSA(ii) + k)
                If Len(segBStr) > 0 Then segBStr = segBStr & ","
                segBStr = segBStr & (outSB(ii) + k)
            Next k
        End If
        If Len(outA) > 0 Then outA = outA & ","
        outA = outA & segAStr
        If Len(outB) > 0 Then outB = outB & ","
        outB = outB & segBStr
    Next ii
End Sub

' 박스 페어의 텍스트를 owner 룰로 재포맷:
'   양쪽 코어 배열 → 1:1 매핑 → segment 별 통합 break points → 양쪽 모두 연속 3+ 면 ~ , 아니면 콤마.
'   페어 없으면 박스 자체만 smart compact.
Public Sub 선번박스_페어_재포맷(ByVal box As Shape, ByVal ws As Worksheet)
    If box Is Nothing Then Exit Sub
    Dim peer As Shape: Set peer = 선번박스_페어찾기(box, ws)

    Dim txtA As String, txtB As String
    txtA = "": txtB = ""
    On Error Resume Next
    txtA = box.TextFrame2.TextRange.Text
    If Not peer Is Nothing Then txtB = peer.TextFrame2.TextRange.Text
    On Error GoTo 0

    Dim arrA() As Long, cntA As Long: cntA = 0
    Dim arrB() As Long, cntB As Long: cntB = 0
    선번박스_텍스트_파싱 txtA, arrA, cntA
    If Not peer Is Nothing Then 선번박스_텍스트_파싱 txtB, arrB, cntB

    If peer Is Nothing Then
        선번박스_텍스트_setShape box, 선번박스_compact_smart(arrA, cntA)
        Exit Sub
    End If

    Dim newA As String, newB As String
    선번박스_compact_쌍 arrA, cntA, arrB, cntB, newA, newB

    선번박스_텍스트_setShape box, newA
    선번박스_텍스트_setShape peer, newB
End Sub

' 박스 페어 + anchor + main arrow 일괄 삭제 (코어 0개 됐을 때 자동 삭제용).
'   anchor 의 box1=|box2= 매칭 + 같은 페어의 main arrow (alt 에 main=1|fac=|cblA=|cblB= 형식) 도 삭제.
Public Sub 선번박스_쌍_삭제(ByVal box As Shape, ByVal ws As Worksheet)
    If box Is Nothing Or ws Is Nothing Then Exit Sub
    Dim peer As Shape: Set peer = 선번박스_페어찾기(box, ws)

    ' 같은 페어의 anchor + (캐논일 때) main arrow 도 모두 삭제
    Dim peerNm As String: peerNm = ""
    If Not peer Is Nothing Then peerNm = peer.Name
    Dim selfNm As String: selfNm = box.Name

    ' 1) anchor 와 main arrow 수집 (즉시 삭제하면 collection 순회 깨짐)
    Dim toDelete As Collection: Set toDelete = New Collection
    Dim sh As Shape, alt As String
    For Each sh In ws.Shapes
        If Left(sh.Name, Len(PREFIX_PAIRARROW)) = PREFIX_PAIRARROW Then
            alt = "": On Error Resume Next: alt = sh.AlternativeText: On Error GoTo 0
            Dim isAnchor As Boolean: isAnchor = False
            Dim isMain As Boolean: isMain = False
            ' anchor: box1=...|box2=...
            Dim p1 As Long: p1 = InStr(alt, "box1=")
            Dim p2 As Long: p2 = InStr(alt, "|box2=")
            If p1 = 1 And p2 > p1 Then
                Dim b1Nm As String, b2Nm As String
                b1Nm = Mid(alt, p1 + 5, p2 - (p1 + 5))
                Dim p3 As Long: p3 = InStr(p2 + 6, alt, "|")
                If p3 = 0 Then p3 = Len(alt) + 1
                b2Nm = Mid(alt, p2 + 6, p3 - (p2 + 6))
                If (b1Nm = selfNm And b2Nm = peerNm) Or (b1Nm = peerNm And b2Nm = selfNm) Then
                    isAnchor = True
                End If
            End If
            ' main arrow: main=1|fac=...|cblA=...|cblB=... — 같은 페어의 모든 main 화살표 삭제 (다른 박스가 인접한 main 도 같이 정리)
            '   여기선 보수적으로 anchor 만 우선 삭제. 캐논 박스 삭제 시 main 도 함께. cascade 박스 삭제 시 main 은 박스정렬이 재계산.
            If isAnchor Then toDelete.Add sh
        End If
    Next sh
    Dim td As Long
    For td = 1 To toDelete.Count
        On Error Resume Next: toDelete(td).Delete: On Error GoTo 0
    Next td

    ' 2) 박스 본체 삭제
    On Error Resume Next: box.Delete: On Error GoTo 0
    If Not peer Is Nothing Then On Error Resume Next: peer.Delete: On Error GoTo 0

    ' 3) 박스정렬_silent True — 남은 cascade 박스들 stack 재정렬 + main arrow 재계산
    On Error Resume Next: 선번연결_도구_박스정렬_silent True: On Error GoTo 0
End Sub

' 기존 박스 텍스트에 새 코어 매핑 순서대로 append (sort 안 함, dedup 안 함).
'   owner 룰: 양쪽 박스가 같은 인덱스끼리 1:1 매핑이라 박스 안 코어 순서가 매핑 순서 = 페어 박스 순서.
'   호출자는 양쪽 박스에 차례로 합친 후 반드시 `선번박스_페어_재포맷 boxA, ws` 한 번 호출해 양쪽 동시 compact.
'   ByVal — 호출 시 Variant (Array element) 도 받을 수 있게 (mergeMatch(1) 등).
Public Sub 선번박스_텍스트_합치기(ByVal box As Shape, ByVal newCores As String)
    Dim cur As String: cur = ""
    On Error Resume Next
    cur = box.TextFrame2.TextRange.Text
    On Error GoTo 0
    Dim combined As String
    If Len(Trim(cur)) > 0 Then
        combined = Trim(cur) & "," & Trim(newCores)
    Else
        combined = Trim(newCores)
    End If
    선번박스_텍스트_setShape box, combined
End Sub

' 코어 박스 + 화살표 생성 — 네트웍구성도에서 같은 시설물에 연결된 케이블 2개를
'   Ctrl 누른 채 선택 후 호출. 각 케이블의 「먼 쪽 끝」 (시설물 반대편) 옆에 작은
'   텍스트박스(기본 "1", 자동 사이즈 → 「1-12」, 「1,3,5」 등 코어 선번 입력)를 만들고
'   두 박스 중심을 elbow 화살표로 연결.
'   같은 방향(같은 cable_a·cable_b 짝)의 기존 박스가 있으면 새 박스 안 만들고 기존 박스 텍스트에 합쳐 표시 (owner 요구).
Public Sub 선번박스_쌍_생성(Optional ByVal initialTxt1 As String = "1", Optional ByVal initialTxt2 As String = "1")
    Dim ws As Worksheet: Set ws = ActiveSheet
    If ws Is Nothing Or ws.Name <> SHEET_NETWORK Then
        MsgBox "네트웍구성도에서 케이블 2개를 선택한 뒤 실행하세요.", vbExclamation, "코어 박스"
        Exit Sub
    End If

    Dim selRange As Object
    On Error Resume Next
    Set selRange = Selection.ShapeRange
    On Error GoTo 0
    If selRange Is Nothing Then
        MsgBox "케이블 2개를 Ctrl 누른 채 선택한 뒤 다시 실행하세요." & vbLf & _
               "(현재 선택된 도형이 없습니다)", vbExclamation, "코어 박스"
        Exit Sub
    End If

    ' 선택 도형 중 cbl_ prefix 만 추출
    Dim cables As Collection: Set cables = New Collection
    Dim i As Long
    For i = 1 To selRange.Count
        If Left(selRange(i).Name, Len(PREFIX_CBL)) = PREFIX_CBL Then cables.Add selRange(i)
    Next i

    If cables.Count <> 2 Then
        MsgBox "선택된 케이블 = " & cables.Count & " 개." & vbLf & vbLf & _
               "정확히 2개의 케이블을 선택하세요 (Ctrl 누른 채 클릭).", _
               vbExclamation, "코어 박스"
        Exit Sub
    End If

    Dim cbl1 As Shape, cbl2 As Shape
    Set cbl1 = cables(1): Set cbl2 = cables(2)

    ' 메타에서 양 끝 시설물 id 추출
    Dim row1 As Variant, row2 As Variant
    row1 = MetaFindRow(SHEET_META_CBL, 1, cbl1.Name)
    row2 = MetaFindRow(SHEET_META_CBL, 1, cbl2.Name)
    If IsEmpty(row1) Or IsEmpty(row2) Then
        MsgBox "케이블 메타를 찾지 못했습니다.", vbExclamation, "코어 박스"
        Exit Sub
    End If
    Dim from1 As String, to1 As String, from2 As String, to2 As String
    from1 = CStr(row1(2)): to1 = CStr(row1(3))
    from2 = CStr(row2(2)): to2 = CStr(row2(3))

    ' 공통 시설물 찾기
    Dim commonFacId As String: commonFacId = ""
    If Len(from1) > 0 And (from1 = from2 Or from1 = to2) Then commonFacId = from1
    If Len(commonFacId) = 0 And Len(to1) > 0 And (to1 = from2 Or to1 = to2) Then commonFacId = to1
    If Len(commonFacId) = 0 Then
        MsgBox "선택한 두 케이블이 같은 시설물에 연결되어 있지 않습니다." & vbLf & _
               "한 시설물을 중심으로 양 옆 케이블 2개를 선택하세요.", _
               vbExclamation, "코어 박스"
        Exit Sub
    End If

    Dim facShp As Shape: Set facShp = Nothing
    On Error Resume Next
    Set facShp = ws.Shapes(commonFacId)
    On Error GoTo 0
    If facShp Is Nothing Then
        MsgBox "공통 시설물 도형을 못 찾았습니다: " & commonFacId, vbExclamation, "코어 박스"
        Exit Sub
    End If

    Dim fcx As Double, fcy As Double
    fcx = facShp.Left + facShp.Width / 2
    fcy = facShp.Top + facShp.Height / 2

    Dim wasProt As Boolean: wasProt = ws.ProtectContents Or ws.ProtectDrawingObjects
    On Error Resume Next
    ws.Unprotect
    On Error GoTo 0

    ' Owner: 같은 방향 (= 같은 cable_a·cable_b 짝) 이면 기존 박스에 합쳐 표시.
    Dim mergeMatch As Variant: mergeMatch = 선번박스_같은짝_찾기(ws, commonFacId, cbl1.Name, cbl2.Name)
    If IsArray(mergeMatch) Then
        선번박스_텍스트_합치기 mergeMatch(1), initialTxt1
        선번박스_텍스트_합치기 mergeMatch(2), initialTxt2
        선번박스_페어_재포맷 mergeMatch(1), ws         ' owner 2026-06-05: 양쪽 합친 후 매핑 순서 기반 compact
        선번박스_방사형_정렬 ws, commonFacId           ' owner 2026-06-11: 합침으로 박스 폭 변동 — 3방향+ 허브면 재정렬
        If wasProt Then ApplySheetProtection ws
        Application.StatusBar = "기존 짝에 코어 합침 — 박스 텍스트 갱신."
        Exit Sub
    End If

    Dim box1 As Shape, box2 As Shape
    ' 「상대 케이블」 을 함께 전달 → 각 박스가 상대 방향(안쪽 각) 으로 perp offset (owner 요구).
    Set box1 = 선번박스_단일생성(ws, cbl1, fcx, fcy, commonFacId, initialTxt1, cbl2)
    Set box2 = 선번박스_단일생성(ws, cbl2, fcx, fcy, commonFacId, initialTxt2, cbl1)
    If box1 Is Nothing Or box2 Is Nothing Then
        If wasProt Then ApplySheetProtection ws
        MsgBox "박스 생성 실패.", vbExclamation, "코어 박스"
        Exit Sub
    End If

    ' L-shape 라우팅 — 끝 연결선이 각 케이블과 평행 + 케이블 통과 회피 (owner 요구)
    Dim arrPts As Variant
    arrPts = 선번박스_경로_계산(ws, "cable", cbl1.Name, box1, "cable", cbl2.Name, box2, facShp)

    Dim arr As Shape
    Dim arrName As String: arrName = PREFIX_PAIRARROW & NewId8()
    Set arr = 선번박스_화살표생성(ws, arrPts)
    If arr Is Nothing Then
        Set arr = ws.Shapes.AddLine(box1.Left + box1.Width / 2, box1.Top + box1.Height / 2, _
                                     box2.Left + box2.Width / 2, box2.Top + box2.Height / 2)
    End If
    arr.Name = arrName
    arr.OnAction = ""
    arr.Placement = 3
    On Error Resume Next
    arr.AlternativeText = "box1=" & box1.Name & "|box2=" & box2.Name
    With arr.Line
        .ForeColor.RGB = 0                            ' owner — 검정
        .Weight = 0.5                                ' owner 요구 — 얇게
        .DashStyle = msoLineRoundDot                 ' owner — 둥근 점선
        .BeginArrowheadStyle = msoArrowheadTriangle
        .EndArrowheadStyle = msoArrowheadTriangle
    End With
    On Error GoTo 0

    ' Undo 기록 — 박스 2개 + 화살표 1개 ID
    Action_저장 "pairbox_add", _
                "box1=" & box1.Name & "`box2=" & box2.Name & "`arr=" & arrName, _
                "코어 박스 + 화살표 추가"

    ' 레이어 — 박스·화살표는 시설물 위 (설명선 아래)
    레이어_정리_시트 ws
    ' Z-order: cable < arrow < box (owner: 박스가 케이블·화살표에 안 가리게).
    '   먼저 arrow front → 그 위에 box1·box2 front → 박스가 최상단.
    On Error Resume Next
    arr.ZOrder msoBringToFront
    box1.ZOrder msoBringToFront
    box2.ZOrder msoBringToFront
    On Error GoTo 0

    ' owner 2026-06-11: 케이블 3방향+ 허브 — 선번박스 방사형 정렬 + 화살표 재생성 (2방향 이하는 내부에서 즉시 복귀)
    선번박스_방사형_정렬 ws, commonFacId

    If wasProt Then ApplySheetProtection ws
    Application.StatusBar = "코어 박스 생성 — 박스 클릭해 코어 번호 입력 (예: 1-12)."
End Sub

' 명시 시그니처 박스+화살표 생성 — 선번연결 도구의 Step 2 「연결완료」 가 호출.
'   side1Type/side2Type 각각 "cable" 또는 "facility".
'   facility 측은 시설물 중심 옆에 박스 직접 배치 (케이블 방향과 무관).
'   기준 시설물 id 는 g_pt_facId 사용.
Public Sub 선번박스_쌍_생성_직접(side1Type As String, side1Name As String, _
                                  side2Type As String, side2Name As String, _
                                  ByVal initialTxt1 As String, ByVal initialTxt2 As String)
    Dim ws As Worksheet: Set ws = ThisWorkbook.Worksheets(SHEET_NETWORK)
    Dim facId As String: facId = g_pt_facId
    Dim facShp As Shape: Set facShp = Nothing
    On Error Resume Next
    Set facShp = ws.Shapes(facId)
    On Error GoTo 0
    If facShp Is Nothing Then
        MsgBox "기준 시설물 도형을 찾지 못했습니다: " & facId, vbExclamation, "코어 박스"
        Exit Sub
    End If
    Dim fcx As Double, fcy As Double
    fcx = facShp.Left + facShp.Width / 2
    fcy = facShp.Top + facShp.Height / 2

    Dim wasProt As Boolean: wasProt = ws.ProtectContents Or ws.ProtectDrawingObjects
    On Error Resume Next
    ws.Unprotect
    On Error GoTo 0

    ' 양쪽 케이블 shape 를 먼저 resolve — 박스 생성 시 「상대 케이블」 로 전달해 안쪽 각 perp 선택 (owner 요구).
    Dim cbl1 As Shape: Set cbl1 = Nothing
    Dim cbl2 As Shape: Set cbl2 = Nothing
    If side1Type = "cable" Then
        On Error Resume Next
        Set cbl1 = ws.Shapes(side1Name)
        On Error GoTo 0
    End If
    If side2Type = "cable" Then
        On Error Resume Next
        Set cbl2 = ws.Shapes(side2Name)
        On Error GoTo 0
    End If

    ' Owner: 같은 방향 (= 같은 cable_a·cable_b 짝) 의 기존 박스가 있으면 합쳐 표시.
    '   facility-side (= side?Type = "facility") 는 cable 식별자가 facId 이므로 fac 도 cbl 도 같은 매칭에 들어감.
    '   박스추가 모드 (g_pt_addBoxMode) — merge 건너뛰고 cascading 새 박스 생성. 이전 박스와 cascading 화살표로 연결.
    Dim aName As String, bName As String
    If side1Type = "cable" Then aName = side1Name Else aName = facId
    If side2Type = "cable" Then bName = side2Name Else bName = facId

    ' owner 2026-06-05: 머지 타깃 (기존 연결 entry 의 「+ 코어」 클릭으로 설정) — 그 entry 박스에 직접 머지.
    '   cascade 박스에도 머지 가능 — 같은짝_찾기 의 cascade skip 우회.
    If Len(g_pt_mergeTargetArrName) > 0 Then
        Dim tgtArr As Shape: Set tgtArr = Nothing
        On Error Resume Next
        Set tgtArr = ws.Shapes(g_pt_mergeTargetArrName)
        On Error GoTo 0
        If Not tgtArr Is Nothing Then
            Dim tgtAlt As String: tgtAlt = ""
            On Error Resume Next: tgtAlt = tgtArr.AlternativeText: On Error GoTo 0
            Dim mtP1 As Long: mtP1 = InStr(tgtAlt, "box1=")
            Dim mtP2 As Long: mtP2 = InStr(tgtAlt, "|box2=")
            If mtP1 = 1 And mtP2 > mtP1 Then
                Dim mtB1Nm As String, mtB2Nm As String
                mtB1Nm = Mid(tgtAlt, mtP1 + 5, mtP2 - (mtP1 + 5))
                Dim mtP3 As Long: mtP3 = InStr(mtP2 + 6, tgtAlt, "|")
                If mtP3 = 0 Then mtP3 = Len(tgtAlt) + 1
                mtB2Nm = Mid(tgtAlt, mtP2 + 6, mtP3 - (mtP2 + 6))
                Dim mtB1Shp As Shape, mtB2Shp As Shape
                Set mtB1Shp = Nothing: Set mtB2Shp = Nothing
                On Error Resume Next
                Set mtB1Shp = ws.Shapes(mtB1Nm)
                Set mtB2Shp = ws.Shapes(mtB2Nm)
                On Error GoTo 0
                If Not mtB1Shp Is Nothing And Not mtB2Shp Is Nothing Then
                    ' 박스 alt 의 cbl 값으로 A/B 매칭해서 initialTxt1/Txt2 순서 맞춰 머지
                    Dim mtAlt1 As String, mtAlt2 As String: mtAlt1 = "": mtAlt2 = ""
                    On Error Resume Next
                    mtAlt1 = mtB1Shp.AlternativeText
                    mtAlt2 = mtB2Shp.AlternativeText
                    On Error GoTo 0
                    Dim mt_aName As String, mt_bName As String
                    If side1Type = "cable" Then mt_aName = side1Name Else mt_aName = facId
                    If side2Type = "cable" Then mt_bName = side2Name Else mt_bName = facId
                    If InStr(mtAlt1, "cbl=" & mt_aName) > 0 Then
                        선번박스_텍스트_합치기 mtB1Shp, initialTxt1
                        선번박스_텍스트_합치기 mtB2Shp, initialTxt2
                    Else
                        선번박스_텍스트_합치기 mtB1Shp, initialTxt2
                        선번박스_텍스트_합치기 mtB2Shp, initialTxt1
                    End If
                    선번박스_페어_재포맷 mtB1Shp, ws    ' owner 2026-06-05: 양쪽 합친 후 매핑 순서 기반 compact
                    g_pt_mergeTargetArrName = ""        ' 1회 사용 후 reset
                    선번박스_방사형_정렬 ws, facId      ' owner 2026-06-11: 3방향+ 허브면 재정렬
                    If wasProt Then ApplySheetProtection ws
                    Application.StatusBar = "머지 타깃 entry 에 코어 추가 완료."
                    Exit Sub
                End If
            End If
        End If
        ' 타깃 못 찾으면 일반 흐름으로 fallback (reset 후 진행)
        g_pt_mergeTargetArrName = ""
    End If

    Dim cascadePrev As Variant: cascadePrev = Empty
    If g_pt_addBoxMode Then
        ' 박스추가 모드 — cascade 시작점 (가장 끝의 같은짝) 만 기억하고 merge skip
        cascadePrev = 선번박스_가장끝짝_찾기(ws, facId, aName, bName, fcx, fcy)
        ' 진단: 박스추가 모드 ON 인데 cascadePrev 결과
        If IsArray(cascadePrev) Then
            Application.StatusBar = "[진단] 박스추가 ON · 가장끝짝 FOUND → cascade 분기 진입 예정"
        Else
            Application.StatusBar = "[진단] 박스추가 ON 인데 가장끝짝 NOT FOUND → 첫 페어 새로 생성 (cascade X)"
        End If
        ' 같은짝 없으면 first pair — cascade 화살표는 없지만 정상 생성 (owner: 박스추가 첫 시도는 일반 첫 박스와 동일)
    Else
        Dim mergeMatch As Variant: mergeMatch = 선번박스_같은짝_찾기(ws, facId, aName, bName)
        If IsArray(mergeMatch) Then
            선번박스_텍스트_합치기 mergeMatch(1), initialTxt1
            선번박스_텍스트_합치기 mergeMatch(2), initialTxt2
            선번박스_페어_재포맷 mergeMatch(1), ws     ' owner 2026-06-05: 양쪽 합친 후 매핑 순서 기반 compact
            선번박스_방사형_정렬 ws, facId             ' owner 2026-06-11: 합침으로 박스 폭 변동 — 3방향+ 허브면 재정렬
            If wasProt Then ApplySheetProtection ws
            Application.StatusBar = "기존 짝에 코어 합침 — 박스 텍스트 갱신."
            Exit Sub
        End If
    End If

    Dim box1 As Shape, box2 As Shape: Set box1 = Nothing: Set box2 = Nothing
    If side1Type = "cable" Then
        If Not cbl1 Is Nothing Then Set box1 = 선번박스_단일생성(ws, cbl1, fcx, fcy, facId, initialTxt1, cbl2)
    Else
        ' facility — 시설물 옆 직접 배치
        Set box1 = 선번박스_시설물생성(ws, facShp, facId, initialTxt1, "left")
    End If

    If side2Type = "cable" Then
        If Not cbl2 Is Nothing Then Set box2 = 선번박스_단일생성(ws, cbl2, fcx, fcy, facId, initialTxt2, cbl1)
    Else
        Set box2 = 선번박스_시설물생성(ws, facShp, facId, initialTxt2, "right")
    End If

    If box1 Is Nothing Or box2 Is Nothing Then
        If wasProt Then ApplySheetProtection ws
        MsgBox "박스 생성 실패.", vbExclamation, "코어 박스"
        Exit Sub
    End If

    ' L-shape 라우팅 — 각 segment 가 케이블과 평행 (owner 요구).
    '   AddPolyline 이 silent 실패할 수 있어 FreeformBuilder 로 명시적 다중 segment 생성.
    '   owner 2026-06-05: 박스추가 cascade 페어는 자체 pair 화살표 X — 케이블과 가장 가까운 첫 박스만 pair 화살표 보유.
    '   cascade 페어는 box↔prev_box cascading 화살표로 chain.
    Dim arr As Shape: Set arr = Nothing
    Dim arrName As String: arrName = PREFIX_PAIRARROW & NewId8()
    If Not IsArray(cascadePrev) Then
        ' owner 2026-06-05 후속: canonical 도 invisible anchor 별도 생성 — cascade 후 visible 삭제 시 entry 보존.
        '   visible main 화살표는 alt 에 main=1 태그 (box1=|box2= 없음) → Phase 2 skip.
        '   invisible anchor = box1=|box2= alt 가짐 (Phase 2 entry 생성).
        Dim canonAnchor As Shape
        Set canonAnchor = ws.Shapes.AddLine(box1.Left + box1.Width / 2, box1.Top + box1.Height / 2, _
                                             box2.Left + box2.Width / 2, box2.Top + box2.Height / 2)
        canonAnchor.Name = arrName & "_anchor"
        canonAnchor.OnAction = ""
        canonAnchor.Placement = 3
        On Error Resume Next
        canonAnchor.AlternativeText = "box1=" & box1.Name & "|box2=" & box2.Name
        With canonAnchor.Line
            .Visible = msoFalse
            .Transparency = 1
            .Weight = 0.25
            .DashStyle = msoLineSolid
        End With
        ' owner 2026-06-06 (8-25): Shape.Visible=msoFalse 로 마퀴/클릭 선택 차단.
        canonAnchor.Visible = msoFalse
        On Error GoTo 0
        선번박스_alt_peer스탬프 box1, box2, False    ' owner 2026-06-05: anchor 손실 대비 박스에 peer stamp
        Set arr = canonAnchor                                ' arr 변수에는 anchor 보관 (z-order 호환)

        ' visible main 화살표 — alt = main=1 (Phase 2 가 box1= 없으니 skip)
        ' owner 2026-06-06 v3: cable-facility 면 새 시설물페어 spec 적용. cable-cable 은 기존 path 유지.
        Dim arrPts As Variant
        If side1Type = "facility" Or side2Type = "facility" Then
            Dim cableSideName_a As String
            If side1Type = "cable" Then cableSideName_a = side1Name Else cableSideName_a = side2Name
            Dim cableShp_a As Shape: Set cableShp_a = Nothing
            On Error Resume Next
            Set cableShp_a = ws.Shapes(cableSideName_a)
            On Error GoTo 0
            If Not cableShp_a Is Nothing Then
                arrPts = 선번박스_경로_시설물페어(cableShp_a, box1, box2)
            Else
                arrPts = 선번박스_경로_계산(ws, side1Type, side1Name, box1, side2Type, side2Name, box2, facShp)
            End If
        Else
            arrPts = 선번박스_경로_계산(ws, side1Type, side1Name, box1, side2Type, side2Name, box2, facShp)
        End If
        Dim canonMain As Shape: Set canonMain = 선번박스_화살표생성(ws, arrPts)
        If canonMain Is Nothing Then
            Set canonMain = ws.Shapes.AddLine(box1.Left + box1.Width / 2, box1.Top + box1.Height / 2, _
                                               box2.Left + box2.Width / 2, box2.Top + box2.Height / 2)
        End If
        canonMain.Name = arrName
        canonMain.OnAction = ""
        canonMain.Placement = 3
        On Error Resume Next
        canonMain.AlternativeText = "main=1|fac=" & facId & "|cblA=" & aName & "|cblB=" & bName
        With canonMain.Line
            .ForeColor.RGB = 0
            .Weight = 0.5
            .DashStyle = msoLineRoundDot
            .BeginArrowheadStyle = msoArrowheadTriangle
            .EndArrowheadStyle = msoArrowheadTriangle
        End With
        On Error GoTo 0

        Action_저장 "pairbox_add", _
                    "box1=" & box1.Name & "`box2=" & box2.Name & "`arr=" & arrName, _
                    "코어 박스 + visible main + invisible anchor (cascade 후 entry 보존)"
    Else
        ' owner 2026-06-05 후속2 (두번째 첨부처럼): 케이블 페어당 화살표 1개만 — 양 stack 의 맨 아래박스 사이 L-shape.
        '   cascade 추가 시: (1) 이 케이블 페어의 기존 visible pair 화살표 찾아 삭제. (2) cascade 박스 사이 새 visible pair 화살표.
        '   (3) cascade invisible anchor 별도 생성 — 기존 연결 list 추적용 (각 cascade 마다 1개).
        '   ※ reposition 은 이 If 블록 밖에서 일어남 — 여기서는 단지 anchor·visible 화살표 생성. visible 화살표는 reposition 후 그려야 정확.

        ' (3-안1) invisible anchor 먼저 생성 (메타 추적, 위치는 reposition 이후 갱신됨)
        Set arr = ws.Shapes.AddLine(box1.Left + box1.Width / 2, box1.Top + box1.Height / 2, _
                                     box2.Left + box2.Width / 2, box2.Top + box2.Height / 2)
        arr.Name = arrName
        arr.OnAction = ""
        arr.Placement = 3
        On Error Resume Next
        arr.AlternativeText = "box1=" & box1.Name & "|box2=" & box2.Name & "|cascade=1"
        With arr.Line
            .Visible = msoFalse
            .Transparency = 1
            .Weight = 0.25
            .DashStyle = msoLineSolid
        End With
        ' owner 2026-06-06 (8-25): Shape.Visible=msoFalse 로 마퀴/클릭 선택 차단.
        arr.Visible = msoFalse
        On Error GoTo 0
        선번박스_alt_peer스탬프 box1, box2, True     ' owner 2026-06-05: anchor 손실 대비 박스에 peer stamp (cascade)
        Action_저장 "pairbox_add_cascade", _
                    "box1=" & box1.Name & "`box2=" & box2.Name & "`arr=" & arrName, _
                    "박스추가 cascade — invisible anchor (visible pair 화살표는 reposition 후 갱신)"
    End If

    ' 박스추가 모드 cascading — 새 박스를 이전 박스 「바로 아래」 + 「붙여서」 reposition.
    '   owner 2026-06-06 (8-26): per-side outermost (각 측의 max-bottomY 박스) 기준 + 0.2cm 간격.
    '     이전 (8-21): pair-based 「가장끝짝」 reference + gap=0 → A·B 가 서로 다른 위치로 분기된 경우 새 박스가 한 측에서 멀리 떨어짐.
    '     수정: A 측 cbl=aName 박스 중 max-bottomY 박스 → 0.2cm 아래에 new box1
    '            B 측 cbl=bName 박스 중 max-bottomY 박스 → 0.2cm 아래에 new box2
    '            기존 화살표/anchor/main 위치 절대 안 건드림 — 새 박스 좌표만 결정.
    '   cascading chain 화살표 X — 케이블과 가장 가까운 canonical pair 화살표 1개만 유지.
    Dim cascadeArr1 As Shape, cascadeArr2 As Shape         ' 보존 (z-order 코드 호환), 이제 항상 Nothing
    If IsArray(cascadePrev) Then
        Const CASCADE_GAP_VERT As Double = 5.67           ' 0.2 cm (≈ 5.67 pt). owner 2026-06-06 (8-26): 시인성 확보 + outermost 박스 식별 용이.

        ' per-side outermost 박스 찾기 (max bottomY, 새 box1/box2 자기 자신은 제외)
        Dim aOuter As Shape: Set aOuter = Nothing
        Dim bOuter As Shape: Set bOuter = Nothing
        Dim aMaxBot As Double: aMaxBot = -1#
        Dim bMaxBot As Double: bMaxBot = -1#
        Dim facTagOut As String: facTagOut = "fac=" & facId
        Dim cblATagOut As String: cblATagOut = "cbl=" & aName
        Dim cblBTagOut As String: cblBTagOut = "cbl=" & bName
        Dim outSh As Shape, outAlt As String
        For Each outSh In ws.Shapes
            If Left(outSh.Name, Len(PREFIX_PAIRBOX)) = PREFIX_PAIRBOX Then
                ' 새 박스 본인은 제외
                If outSh.Name <> box1.Name And outSh.Name <> box2.Name Then
                    outAlt = "": On Error Resume Next: outAlt = outSh.AlternativeText: On Error GoTo 0
                    ' RN 박스 제외
                    If InStr(outAlt, "|rn=") = 0 And InStr(outAlt, "rn=") <> 1 Then
                        If InStr(outAlt, facTagOut) > 0 Then
                            Dim outBot As Double: outBot = outSh.Top + outSh.Height
                            If InStr(outAlt, cblATagOut) > 0 Then
                                If outBot > aMaxBot Then
                                    aMaxBot = outBot
                                    Set aOuter = outSh
                                End If
                            ElseIf InStr(outAlt, cblBTagOut) > 0 Then
                                If outBot > bMaxBot Then
                                    bMaxBot = outBot
                                    Set bOuter = outSh
                                End If
                            End If
                        End If
                    End If
                End If
            End If
        Next outSh

        ' fallback — outermost 없으면 cascadePrev pair 사용 (안전망)
        If aOuter Is Nothing Then Set aOuter = cascadePrev(1)
        If bOuter Is Nothing Then Set bOuter = cascadePrev(2)

        ' Cable A 측 (box1) — A outermost 의 X 유지, Y 는 outermost.bottom + 0.2cm
        box1.Left = aOuter.Left
        box1.Top = aOuter.Top + aOuter.Height + CASCADE_GAP_VERT

        ' Cable B 측 (box2) — B outermost 의 X 유지, Y 는 outermost.bottom + 0.2cm
        box2.Left = bOuter.Left
        box2.Top = bOuter.Top + bOuter.Height + CASCADE_GAP_VERT

        ' owner 2026-06-06 (8-23): cascade reposition 후 lastPos 즉시 갱신 — chain 평행 이동 처리에서 「사용자가 옮긴 것」 으로 오인 방지.
        On Error Resume Next
        AltSetLastPos box1, box1.Left, box1.Top
        AltSetLastPos box2, box2.Left, box2.Top
        On Error GoTo 0

        ' invisible anchor line 위치도 새 박스 중심에 맞춰 갱신 (메타 일관성)
        On Error Resume Next
        If Not arr Is Nothing Then
            arr.Left = (box1.Left + box1.Width / 2 + box2.Left + box2.Width / 2) / 2 - 1
            arr.Top = (box1.Top + box1.Height / 2 + box2.Top + box2.Height / 2) / 2 - 1
        End If
        On Error GoTo 0

        ' owner 2026-06-05: 케이블 페어당 화살표 1개만 — 이 케이블 페어의 기존 visible main 화살표 (alt 에 main=1) 삭제 후
        '   cascade 박스 사이 새 visible main 화살표 생성. invisible anchor 와 별개.
        Dim oldVisNameC As String: oldVisNameC = ""
        Dim mainTagC As String: mainTagC = "main=1|fac=" & facId & "|cblA=" & aName & "|cblB=" & bName
        Dim mainTagAltC As String: mainTagAltC = "main=1|fac=" & facId & "|cblA=" & bName & "|cblB=" & aName   ' A/B 순서 반대도 매칭
        Dim pscvC As Shape
        For Each pscvC In ws.Shapes
            If Left(pscvC.Name, Len(PREFIX_PAIRARROW)) = PREFIX_PAIRARROW Then
                Dim pAltCM As String: pAltCM = ""
                On Error Resume Next: pAltCM = pscvC.AlternativeText: On Error GoTo 0
                If pAltCM = mainTagC Or pAltCM = mainTagAltC Then
                    oldVisNameC = pscvC.Name
                    Exit For
                End If
            End If
        Next pscvC
        If Len(oldVisNameC) > 0 Then
            On Error Resume Next
            ws.Shapes(oldVisNameC).Delete
            On Error GoTo 0
        End If

        ' 새 visible main 화살표 — cascade 박스 사이 L-shape, alt 에 main=1 태그 (box1=|box2= 없음 → Phase 2 skip)
        Dim arrPtsMain As Variant
        arrPtsMain = 선번박스_경로_계산(ws, side1Type, side1Name, box1, side2Type, side2Name, box2, facShp)
        Dim mainArrC As Shape: Set mainArrC = 선번박스_화살표생성(ws, arrPtsMain)
        If mainArrC Is Nothing Then
            Set mainArrC = ws.Shapes.AddLine(box1.Left + box1.Width / 2, box1.Top + box1.Height / 2, _
                                              box2.Left + box2.Width / 2, box2.Top + box2.Height / 2)
        End If
        mainArrC.Name = PREFIX_PAIRARROW & NewId8()
        mainArrC.OnAction = ""
        mainArrC.Placement = 3
        On Error Resume Next
        mainArrC.AlternativeText = mainTagC
        With mainArrC.Line
            .ForeColor.RGB = 0
            .Weight = 0.5
            .DashStyle = msoLineRoundDot
            .BeginArrowheadStyle = msoArrowheadTriangle
            .EndArrowheadStyle = msoArrowheadTriangle
        End With
        On Error GoTo 0

        Application.StatusBar = "박스추가 — cascade 박스 stack + 이전 main 화살표 삭제 + 새 main 화살표 (맨 아래박스 사이)."
    End If
    ' owner 2026-06-05: one-shot — 각 토글은 다음 연결완료 1회만 cascade. 자동 OFF 후 일반 머지 흐름 복귀.
    '   owner 보고 (박스 두번 → 두 박스만, 머지) 분석: 토글 두 번 누르면 OFF 가 되니 의도와 어긋남.
    '   이 모델: 「각 cascade 박스마다 박스추가 한 번」 — 사용자 멘탈 모델과 일치.
    g_pt_addBoxMode = False

    레이어_정리_시트 ws
    ' Z-order: cable < arrow < box (owner: 박스가 케이블·화살표에 안 가리게).
    '   먼저 arrow front → 그 위에 box1·box2 front → 박스가 최상단. arr 는 cascade 페어일 때 Nothing 가능.
    On Error Resume Next
    If Not arr Is Nothing Then arr.ZOrder msoBringToFront
    If Not cascadeArr1 Is Nothing Then cascadeArr1.ZOrder msoBringToFront
    If Not cascadeArr2 Is Nothing Then cascadeArr2.ZOrder msoBringToFront
    box1.ZOrder msoBringToFront
    box2.ZOrder msoBringToFront
    On Error GoTo 0
    ' owner 2026-06-11: 케이블 3방향+ 허브 — 선번박스 방사형 정렬 + 화살표 재생성 (2방향 이하는 내부에서 즉시 복귀)
    선번박스_방사형_정렬 ws, facId

    If wasProt Then ApplySheetProtection ws
    If Not IsArray(cascadePrev) Then Application.StatusBar = "코어 박스 생성 — 박스 클릭해 코어 번호 편집."
End Sub

' ============================================================================
'  owner 2026-06-11: 다방향 케이블 허브 — 선번박스 방사형(부채꼴) 정렬
'    케이블 3방향 이상 모이는 시설물의 cable-cable 선번박스를 각 케이블 각도 주변 부채꼴 슬롯에 재배치.
'    슬롯: 같은 케이블 k번째 박스 = 케이블 각도 ±13°×(1+0.55×ring), 반지름 115+ring×26pt (ring=k\2, 좌우 교대).
'    충돌(시설물·케이블 선분·다른 박스) 시 반지름 +20pt 씩 밖으로 양보 (최대 8회).
'    배치 후 페어화살표_시설물페어_재정렬 이 화살표 재생성 — L-shape corner(두 케이블 방향선 교점)가
'    시설물 근처에 떨어져 방사형 수렴 모양이 됨 (owner 첨부 이미지 2026-06-11).
'    2방향 이하(공선 체인·캐스케이드 stack)는 손대지 않음 — 기존 동작 보호. 복원 = 이 Sub + 헬퍼 + 호출 5곳 삭제.
' ============================================================================
Public Sub 선번박스_방사형_정렬(ws As Worksheet, facId As String)
    If ws Is Nothing Then Exit Sub
    If Len(facId) = 0 Then Exit Sub
    Dim facShp As Shape: Set facShp = Nothing
    On Error Resume Next: Set facShp = ws.Shapes(facId): On Error GoTo 0
    If facShp Is Nothing Then Exit Sub
    Dim fcx As Double, fcy As Double
    fcx = facShp.Left + facShp.Width / 2
    fcy = facShp.Top + facShp.Height / 2

    ' --- 1. fan 대상 박스 수집 — fac=facId + cbl=cbl_* (RN·facility 측 박스 제외), 케이블별 그룹 (생성 순서 유지) ---
    Dim byCbl As Object: Set byCbl = CreateObject("Scripting.Dictionary")    ' cblName → Collection(box Shape)
    Dim fanSet As Object: Set fanSet = CreateObject("Scripting.Dictionary")  ' boxName → True (장애물 수집에서 제외용)
    Dim sh As Shape, altS As String, cblNm As String
    For Each sh In ws.Shapes
        If Left(sh.Name, Len(PREFIX_PAIRBOX)) = PREFIX_PAIRBOX Then
            altS = "": On Error Resume Next: altS = sh.AlternativeText: On Error GoTo 0
            If InStr(altS, "|rn=") = 0 And InStr(altS, "rn=") <> 1 Then        ' RN 박스 제외 (기존 코드와 동일 패턴)
                If AltParseField(altS, "fac=") = facId Then
                    cblNm = AltParseField(altS, "cbl=")
                    If Left(cblNm, Len(PREFIX_CBL)) = PREFIX_CBL Then
                        If Not byCbl.Exists(cblNm) Then byCbl.Add cblNm, New Collection
                        byCbl(cblNm).Add sh
                        fanSet(sh.Name) = True
                    End If
                End If
            End If
        End If
    Next sh
    If byCbl.Count < 3 Then Exit Sub      ' 2방향 이하 = 기존 공선 체인·캐스케이드 동작 유지

    ' --- 2. 정적 장애물 수집 — 시설물 bbox + 케이블 선분 + fan 외 선번박스 bbox ---
    Dim obs As New Collection      ' Array(L, T, R, B)
    Dim segs As New Collection     ' Array(x1, y1, x2, y2)
    Dim cax As Double, cay As Double, cbx As Double, cby As Double
    For Each sh In ws.Shapes
        If Left(sh.Name, Len(PREFIX_FAC)) = PREFIX_FAC Then
            obs.Add Array(sh.Left - 2, sh.Top - 2, sh.Left + sh.Width + 2, sh.Top + sh.Height + 2)
        ElseIf Left(sh.Name, Len(PREFIX_CBL)) = PREFIX_CBL Then
            GetLineEndpoints sh, cax, cay, cbx, cby
            segs.Add Array(cax, cay, cbx, cby)
        ElseIf Left(sh.Name, Len(PREFIX_PAIRBOX)) = PREFIX_PAIRBOX Then
            If Not fanSet.Exists(sh.Name) Then
                obs.Add Array(sh.Left - 1, sh.Top - 1, sh.Left + sh.Width + 1, sh.Top + sh.Height + 1)
            End If
        End If
    Next sh

    ' --- 3. 케이블별 부채꼴 슬롯 배치 ---
    Const FAN_R As Double = 115           ' 시설물 중심 → 첫 ring 박스 중심
    Const FAN_RING_STEP As Double = 26    ' ring 마다 밖으로
    Const FAN_DELTA As Double = 0.2269    ' 13° (라디안) — 케이블 축에서 좌우로 벌어지는 기본 각
    Const FAN_BUMP As Double = 20         ' 충돌 시 반지름 양보 폭
    Dim ck As Variant
    Dim cShp As Shape
    Dim dA As Double, dB As Double
    Dim ux As Double, uy As Double, ulen As Double
    Dim fanBx As Shape
    Dim k As Long, ring As Long, bump As Long
    Dim sideSgn As Double, phi As Double
    Dim rx As Double, ry As Double, rr As Double
    Dim hw As Double, hh As Double, ccx As Double, ccy As Double
    For Each ck In byCbl.Keys
        Set cShp = Nothing
        On Error Resume Next: Set cShp = ws.Shapes(CStr(ck)): On Error GoTo 0
        If Not cShp Is Nothing Then
            ' 케이블 방향 단위벡터 (시설물 → far end)
            GetLineEndpoints cShp, cax, cay, cbx, cby
            dA = (cax - fcx) * (cax - fcx) + (cay - fcy) * (cay - fcy)
            dB = (cbx - fcx) * (cbx - fcx) + (cby - fcy) * (cby - fcy)
            If dA > dB Then
                ux = cax - fcx: uy = cay - fcy
            Else
                ux = cbx - fcx: uy = cby - fcy
            End If
            ulen = Sqr(ux * ux + uy * uy)
            If ulen < 0.001 Then
                ux = 1: uy = 0
            Else
                ux = ux / ulen: uy = uy / ulen
            End If

            k = 0
            For Each fanBx In byCbl(ck)
                ring = k \ 2
                If k Mod 2 = 0 Then sideSgn = 1 Else sideSgn = -1
                phi = sideSgn * FAN_DELTA * (1 + 0.55 * ring)
                rx = ux * Cos(phi) - uy * Sin(phi)        ' u 를 phi 만큼 회전
                ry = ux * Sin(phi) + uy * Cos(phi)
                hw = fanBx.Width / 2: hh = fanBx.Height / 2
                For bump = 0 To 8
                    rr = FAN_R + ring * FAN_RING_STEP + bump * FAN_BUMP
                    ccx = fcx + rx * rr
                    ccy = fcy + ry * rr
                    If Not 방사형_슬롯충돌(ccx - hw, ccy - hh, ccx + hw, ccy + hh, obs, segs) Then Exit For
                Next bump
                ' 전부 충돌이면 마지막 후보 그대로 (드묾)
                fanBx.Left = ccx - hw
                fanBx.Top = ccy - hh
                On Error Resume Next: AltSetLastPos fanBx, fanBx.Left, fanBx.Top: On Error GoTo 0
                obs.Add Array(fanBx.Left - 1, fanBx.Top - 1, fanBx.Left + fanBx.Width + 1, fanBx.Top + fanBx.Height + 1)
                k = k + 1
            Next fanBx
        End If
    Next ck

    ' --- 4. 화살표 재생성 — 현 박스 위치 기준 (single anchor·cascade main 모두 기존 로직이 처리) ---
    페어화살표_시설물페어_재정렬 ws
End Sub

' (rcL,rcT,rcR,rcB) 박스가 장애물 rect / 케이블 선분과 겹치는지 — 방사형 정렬 전용.
Private Function 방사형_슬롯충돌(rcL As Double, rcT As Double, rcR As Double, rcB As Double, _
                                  obs As Collection, segs As Collection) As Boolean
    방사형_슬롯충돌 = True
    Dim o As Variant
    For Each o In obs
        If o(0) < rcR Then
            If o(2) > rcL Then
                If o(1) < rcB Then
                    If o(3) > rcT Then Exit Function
                End If
            End If
        End If
    Next o
    For Each o In segs
        If 선분_사각형_교차(CDbl(o(0)), CDbl(o(1)), CDbl(o(2)), CDbl(o(3)), rcL - 1, rcT - 1, rcR + 1, rcB + 1) Then Exit Function
    Next o
    방사형_슬롯충돌 = False
End Function

' RN 모드 박스+화살표 생성 — owner 사양 (i_1차/m_2차/s_3차 그림 참조).
'   RN 시설물 양쪽에 IN 그룹 (라벨 "IN" + 코어 박스 N개) / P 그룹 (라벨 "P" + 코어 박스 N개) 배치.
'   각 그룹 위에 Cable A/B 코어 박스들 + 화살표 (코어 1개당 화살표 1개).
'   mapAIn  — Dictionary<aCore, rnInCore>
'   mapOutB — Dictionary<rnOutCore, bCore>
' owner 2026-06-05 (Phase B 재작성):
'   새 RN 박스 배치 — 좌측 패널 (RN 포트: in/out 세로) + 우측 패널 (케이블 코어: 1~N 세로).
'   1차/2차/3차 차수에 따라 out 라벨 m/s/p (g_pt_rnTier 사용).
'   alt 형식:
'     좌측 포트: fac=<facId>|cbl=<facId>|rn=<i|m|s|p>|port=<번호>|tier=<1|2|3>|rngrp=<id>
'     우측 코어: fac=<facId>|cbl=<cableName>|rn=A|core=<번호>|rngrp=<id>
'     헤더 라벨: fac=<facId>|cbl=<facId>|rn_lbl=<텍스트>|rngrp=<id>
'   매핑 화살표는 좌·우 박스 수평 연결 (선번박스_RN2_화살표).
Public Sub 선번박스_쌍_생성_RN(cblA As String, cblB As String, _
                              rnLabel As String, rnSpec As String, _
                              mapAIn As Object, mapOutB As Object)
    Dim ws As Worksheet: Set ws = ThisWorkbook.Worksheets(SHEET_NETWORK)
    Dim facId As String: facId = g_pt_facId
    Dim facShp As Shape: Set facShp = Nothing
    On Error Resume Next
    Set facShp = ws.Shapes(facId)
    On Error GoTo 0
    If facShp Is Nothing Then
        MsgBox "RN 시설물 도형을 못 찾음: " & facId, vbExclamation, "RN 코어 박스"
        Exit Sub
    End If

    Dim rnGrpId As String: rnGrpId = "rngrp_" & NewId8()
    Dim tier As Long: tier = g_pt_rnTier
    If tier <= 0 Or tier > 3 Then tier = 1
    Dim outLbl As String: outLbl = 선번연결_도구_RN차수출력라벨(tier)   ' m / s / p
    Dim inLbl As String: inLbl = "i"
    Dim tierShow As String: tierShow = 선번연결_도구_RN차수표시(tier)   ' 1차 / 2차 / 3차

    Dim wasProt As Boolean: wasProt = ws.ProtectContents Or ws.ProtectDrawingObjects
    On Error Resume Next
    ws.Unprotect
    On Error GoTo 0

    ' === 매핑 순서 보존 (owner 2026-06-05) ===
    Dim aArrR() As Long, inArrR() As Long
    Dim outArrR() As Long, bArrR() As Long
    Dim aCnt As Long, oCnt As Long
    aCnt = 0: oCnt = 0
    If Not mapAIn Is Nothing Then aCnt = mapAIn.Count
    If Not mapOutB Is Nothing Then oCnt = mapOutB.Count
    If aCnt > 0 Then
        ReDim aArrR(0 To aCnt - 1)
        ReDim inArrR(0 To aCnt - 1)
        Dim idxA As Long: idxA = 0
        Dim mkA As Variant
        For Each mkA In mapAIn.Keys
            aArrR(idxA) = CLng(mkA)
            inArrR(idxA) = CLng(mapAIn(mkA))
            idxA = idxA + 1
        Next mkA
    End If
    If oCnt > 0 Then
        ReDim outArrR(0 To oCnt - 1)
        ReDim bArrR(0 To oCnt - 1)
        Dim idxO As Long: idxO = 0
        Dim mkO As Variant
        For Each mkO In mapOutB.Keys
            outArrR(idxO) = CLng(mkO)
            bArrR(idxO) = CLng(mapOutB(mkO))
            idxO = idxO + 1
        Next mkO
    End If

    ' === 사이즈 / 위치 상수 ===
    Const RN_BX_W As Double = 28
    Const RN_BX_H As Double = 14
    Const RN_BX_GAP As Double = 2
    Const RN_HDR_GAP As Double = 4              ' 헤더 라벨 ↔ 첫 포트 박스
    Const RN_GROUP_GAP As Double = 10           ' in 그룹 ↔ out 그룹 (좌측) / cableA ↔ cableB (우측)
    Const RN_PANEL_GAP As Double = 28           ' 시설물 가장자리 ↔ 패널

    Dim fcy As Double: fcy = facShp.Top + facShp.Height / 2

    Dim inN As Long: inN = g_pt_rnInCount: If inN < 0 Then inN = 0
    Dim outN As Long: outN = g_pt_rnOutCount: If outN < 0 Then outN = 0

    ' === 좌측 패널 — RN 포트 (in 위 + out 아래, 세로) ===
    Dim leftH As Double: leftH = 0
    If inN > 0 Then leftH = leftH + RN_BX_H + RN_HDR_GAP + inN * RN_BX_H + (inN - 1) * RN_BX_GAP
    If outN > 0 Then
        If leftH > 0 Then leftH = leftH + RN_GROUP_GAP
        leftH = leftH + RN_BX_H + RN_HDR_GAP + outN * RN_BX_H + (outN - 1) * RN_BX_GAP
    End If
    Dim leftStartY As Double: leftStartY = fcy - leftH / 2
    Dim leftX As Double: leftX = facShp.Left - RN_PANEL_GAP - RN_BX_W

    Dim inBoxByPort As Object: Set inBoxByPort = CreateObject("Scripting.Dictionary")
    Dim outBoxByPort As Object: Set outBoxByPort = CreateObject("Scripting.Dictionary")

    Dim curY As Double: curY = leftStartY
    Dim p As Long

    If inN > 0 Then
        Dim inHdr As Shape
        Set inHdr = 선번박스_RN2_헤더박스(ws, leftX, curY, RN_BX_W, RN_BX_H, "입력 " & inLbl, facId, rnGrpId)
        curY = curY + RN_BX_H + RN_HDR_GAP
        For p = 1 To inN
            Dim inBox As Shape
            Set inBox = 선번박스_RN2_포트박스(ws, leftX, curY, RN_BX_W, RN_BX_H, _
                                              p, inLbl, tier, facId, rnGrpId)
            inBoxByPort(p) = inBox.Name
            curY = curY + RN_BX_H + RN_BX_GAP
        Next p
        curY = curY - RN_BX_GAP                 ' 마지막 GAP 제거
    End If

    If outN > 0 Then
        If inN > 0 Then curY = curY + RN_GROUP_GAP
        Dim outHdr As Shape
        Set outHdr = 선번박스_RN2_헤더박스(ws, leftX, curY, RN_BX_W, RN_BX_H, "출력 " & outLbl, facId, rnGrpId)
        curY = curY + RN_BX_H + RN_HDR_GAP
        For p = 1 To outN
            Dim outBox As Shape
            Set outBox = 선번박스_RN2_포트박스(ws, leftX, curY, RN_BX_W, RN_BX_H, _
                                               p, outLbl, tier, facId, rnGrpId)
            outBoxByPort(p) = outBox.Name
            curY = curY + RN_BX_H + RN_BX_GAP
        Next p
    End If

    ' === 우측 패널 — 케이블 코어 ===
    Dim coreA As Long: coreA = g_pt_count1
    If coreA <= 0 Then coreA = 12
    Dim isTwoCable As Boolean: isTwoCable = (Len(cblB) > 0 And cblB <> cblA)
    Dim coreB As Long: coreB = 0
    If isTwoCable Then
        coreB = g_pt_count2
        If coreB <= 0 Then coreB = 12
    End If

    Dim rightH As Double
    rightH = RN_BX_H + RN_HDR_GAP + coreA * RN_BX_H + (coreA - 1) * RN_BX_GAP
    If isTwoCable Then
        rightH = rightH + RN_GROUP_GAP _
                        + RN_BX_H + RN_HDR_GAP _
                        + coreB * RN_BX_H + (coreB - 1) * RN_BX_GAP
    End If
    Dim rightStartY As Double: rightStartY = fcy - rightH / 2
    Dim rightX As Double: rightX = facShp.Left + facShp.Width + RN_PANEL_GAP

    Dim aBoxByCore As Object: Set aBoxByCore = CreateObject("Scripting.Dictionary")
    Dim bBoxByCore As Object: Set bBoxByCore = CreateObject("Scripting.Dictionary")
    Dim rY As Double: rY = rightStartY

    Dim hdrA As Shape
    Set hdrA = 선번박스_RN2_헤더박스(ws, rightX, rY, RN_BX_W, RN_BX_H, cblA, facId, rnGrpId)
    rY = rY + RN_BX_H + RN_HDR_GAP
    Dim c As Long
    For c = 1 To coreA
        Dim aBox As Shape
        Set aBox = 선번박스_RN2_코어박스(ws, rightX, rY, RN_BX_W, RN_BX_H, _
                                         c, cblA, "A", facId, rnGrpId)
        aBoxByCore(c) = aBox.Name
        rY = rY + RN_BX_H + RN_BX_GAP
    Next c

    If isTwoCable Then
        rY = rY - RN_BX_GAP + RN_GROUP_GAP
        Dim hdrB As Shape
        Set hdrB = 선번박스_RN2_헤더박스(ws, rightX, rY, RN_BX_W, RN_BX_H, cblB, facId, rnGrpId)
        rY = rY + RN_BX_H + RN_HDR_GAP
        For c = 1 To coreB
            Dim bBox As Shape
            Set bBox = 선번박스_RN2_코어박스(ws, rightX, rY, RN_BX_W, RN_BX_H, _
                                             c, cblB, "B", facId, rnGrpId)
            bBoxByCore(c) = bBox.Name
            rY = rY + RN_BX_H + RN_BX_GAP
        Next c
    End If

    ' === 매핑 화살표: cableA core → in 포트 ===
    ' 변수명 iN 회피 — VBA In 키워드 (For Each ... In ...) 와 대소문자 무시로 충돌해 구문 오류.
    Dim i As Long
    For i = 0 To aCnt - 1
        Dim aN As Long: aN = aArrR(i)
        Dim iPort As Long: iPort = inArrR(i)
        If aBoxByCore.Exists(aN) And inBoxByPort.Exists(iPort) Then
            Dim aRef As Shape: Set aRef = ws.Shapes(aBoxByCore(aN))
            Dim iRef As Shape: Set iRef = ws.Shapes(inBoxByPort(iPort))
            Dim arr1 As Shape: Set arr1 = 선번박스_RN2_화살표(ws, iRef, aRef, rnGrpId)
        End If
    Next i

    ' === 매핑 화살표: out 포트 → cableB (또는 단일 케이블 모드에선 cableA) core ===
    ' 변수명 oN 회피 — VBA On 키워드 (On Error / On ... GoTo) 와 대소문자 무시로 충돌.
    For i = 0 To oCnt - 1
        Dim oPort As Long: oPort = outArrR(i)
        Dim bCore As Long: bCore = bArrR(i)
        If outBoxByPort.Exists(oPort) Then
            Dim target As Shape: Set target = Nothing
            If isTwoCable Then
                If bBoxByCore.Exists(bCore) Then Set target = ws.Shapes(bBoxByCore(bCore))
            Else
                If aBoxByCore.Exists(bCore) Then Set target = ws.Shapes(aBoxByCore(bCore))
            End If
            If Not target Is Nothing Then
                Dim oRef As Shape: Set oRef = ws.Shapes(outBoxByPort(oPort))
                Dim arr2 As Shape: Set arr2 = 선번박스_RN2_화살표(ws, oRef, target, rnGrpId)
            End If
        End If
    Next i

    If wasProt Then ApplySheetProtection ws
    레이어_정리_시트 ws
End Sub

' Phase B — 새 RN 헤더 라벨 박스 (패널 상단 "입력 i" / "출력 m·s·p" / 케이블명).
'   회색 배경 + 굵은 글씨로 그룹 구분.
Public Function 선번박스_RN2_헤더박스(ws As Worksheet, x As Double, y As Double, _
                                        w As Double, h As Double, lbl As String, _
                                        facId As String, rnGrpId As String) As Shape
    Dim bx As Shape
    Set bx = ws.Shapes.AddShape(msoShapeRectangle, x, y, w, h)
    bx.Name = PREFIX_PAIRBOX & "rn2hdr_" & NewId8()
    bx.Placement = 3
    On Error Resume Next
    bx.AlternativeText = "fac=" & facId & "|cbl=" & facId & "|rn_lbl=" & lbl & "|rngrp=" & rnGrpId
    With bx.Line: .ForeColor.RGB = 0: .Weight = 0.5: .Visible = msoTrue: End With
    With bx.Fill: .ForeColor.RGB = RGB(230, 230, 230): .Visible = msoTrue: End With
    With bx.TextFrame2
        .MarginLeft = 2.83465: .MarginRight = 2.83465: .MarginTop = 0.1: .MarginBottom = 0.1  ' 좌우 0.1cm · 상하 0.1pt
        .VerticalAnchor = msoAnchorMiddle
        .TextRange.Text = lbl
        .TextRange.Font.Name = CALLOUT_FONT_NAME
        .TextRange.Font.Size = 8
        .TextRange.Font.Bold = msoTrue
        .TextRange.Font.Fill.ForeColor.RGB = 0
        .TextRange.ParagraphFormat.Alignment = 2
    End With
    On Error GoTo 0
    Set 선번박스_RN2_헤더박스 = bx
End Function

' Phase B — 새 RN 포트 박스 (좌측 패널: in 또는 out 포트 1개).
'   텍스트: prefix + 포트번호 (예: "i_1", "m_3").
'   alt: fac|cbl=facId|rn=<i|m|s|p>|port=<번호>|tier=<1|2|3>|rngrp=<id>
Public Function 선번박스_RN2_포트박스(ws As Worksheet, x As Double, y As Double, _
                                        w As Double, h As Double, _
                                        portN As Long, rnTag As String, tier As Long, _
                                        facId As String, rnGrpId As String) As Shape
    Dim bx As Shape
    Set bx = ws.Shapes.AddShape(msoShapeRectangle, x, y, w, h)
    bx.Name = PREFIX_PAIRBOX & NewId8()
    bx.Placement = 3
    On Error Resume Next
    bx.AlternativeText = "fac=" & facId & "|cbl=" & facId & _
                         "|rn=" & rnTag & "|port=" & portN & _
                         "|tier=" & tier & "|rngrp=" & rnGrpId
    With bx.Line: .ForeColor.RGB = 0: .Weight = 0.5: .Visible = msoTrue: End With
    With bx.Fill: .ForeColor.RGB = RGB(255, 255, 255): .Visible = msoTrue: End With
    With bx.TextFrame2
        .MarginLeft = 2.83465: .MarginRight = 2.83465: .MarginTop = 0.1: .MarginBottom = 0.1  ' 좌우 0.1cm · 상하 0.1pt
        .VerticalAnchor = msoAnchorMiddle
        .TextRange.Text = rnTag & "_" & CStr(portN)
        .TextRange.Font.Name = CALLOUT_FONT_NAME
        .TextRange.Font.Size = 9
        .TextRange.Font.Bold = msoTrue
        .TextRange.Font.Fill.ForeColor.RGB = 0
        .TextRange.ParagraphFormat.Alignment = 2
    End With
    On Error GoTo 0
    Set 선번박스_RN2_포트박스 = bx
End Function

' Phase B — 새 RN 우측 코어 박스 (cable A/B 의 코어 1개).
'   텍스트: 코어 번호 ("1", "2", ...)
'   alt: fac|cbl=<cableName>|rn=A|B|core=<번호>|rngrp=<id>
Public Function 선번박스_RN2_코어박스(ws As Worksheet, x As Double, y As Double, _
                                        w As Double, h As Double, _
                                        coreN As Long, cblName As String, sideTag As String, _
                                        facId As String, rnGrpId As String) As Shape
    Dim bx As Shape
    Set bx = ws.Shapes.AddShape(msoShapeRectangle, x, y, w, h)
    bx.Name = PREFIX_PAIRBOX & NewId8()
    bx.Placement = 3
    On Error Resume Next
    bx.AlternativeText = "fac=" & facId & "|cbl=" & cblName & _
                         "|rn=" & sideTag & "|core=" & coreN & _
                         "|rngrp=" & rnGrpId
    With bx.Line: .ForeColor.RGB = 0: .Weight = 0.5: .Visible = msoTrue: End With
    With bx.Fill: .ForeColor.RGB = RGB(255, 255, 255): .Visible = msoTrue: End With
    With bx.TextFrame2
        .MarginLeft = 2.83465: .MarginRight = 2.83465: .MarginTop = 0.1: .MarginBottom = 0.1  ' 좌우 0.1cm · 상하 0.1pt
        .VerticalAnchor = msoAnchorMiddle
        .TextRange.Text = CStr(coreN)
        .TextRange.Font.Name = CALLOUT_FONT_NAME
        .TextRange.Font.Size = 9
        .TextRange.Font.Bold = msoTrue
        .TextRange.Font.Fill.ForeColor.RGB = 0
        .TextRange.ParagraphFormat.Alignment = 2
    End With
    On Error GoTo 0
    Set 선번박스_RN2_코어박스 = bx
End Function

' Phase B — 새 RN 화살표 (좌측 포트 ↔ 우측 코어 박스 수평 연결).
'   둥근 점선, 양쪽 화살촉, 검정.
Public Function 선번박스_RN2_화살표(ws As Worksheet, leftBox As Shape, rightBox As Shape, _
                                      rnGrpId As String) As Shape
    Dim x1 As Double, y1 As Double, x2 As Double, y2 As Double
    x1 = leftBox.Left + leftBox.Width
    y1 = leftBox.Top + leftBox.Height / 2
    x2 = rightBox.Left
    y2 = rightBox.Top + rightBox.Height / 2
    Dim arr As Shape
    Set arr = ws.Shapes.AddLine(x1, y1, x2, y2)
    arr.Name = PREFIX_PAIRARROW & NewId8()
    arr.OnAction = ""
    arr.Placement = 3
    On Error Resume Next
    arr.AlternativeText = "box1=" & leftBox.Name & "|box2=" & rightBox.Name & "|rngrp=" & rnGrpId
    With arr.Line
        .ForeColor.RGB = 0
        .Weight = 0.75
        .DashStyle = msoLineRoundDot
        .BeginArrowheadStyle = msoArrowheadTriangle
        .EndArrowheadStyle = msoArrowheadTriangle
    End With
    arr.ZOrder msoSendToBack
    On Error GoTo 0
    Set 선번박스_RN2_화살표 = arr
End Function

' 모든 RN 박스·화살표 alt 에 |rngrp=<id> 추가 — 그룹 단위 삭제·수정 가능하게.
Public Sub 선번박스_RN_grp추가(sh As Shape, rnGrpId As String)
    On Error Resume Next
    Dim cur As String: cur = ""
    cur = sh.AlternativeText
    If InStr(cur, "rngrp=") = 0 Then
        sh.AlternativeText = cur & "|rngrp=" & rnGrpId
    End If
    On Error GoTo 0
End Sub

' 화살표 반환형 — 기존 선번박스_RN_화살표 가 Sub 라 grp 추가 후 참조 필요.
Public Function 선번박스_RN_화살표Ret(ws As Worksheet, topBox As Shape, bottomBox As Shape) As Shape
    Dim x1 As Double, y1 As Double, x2 As Double, y2 As Double
    x1 = topBox.Left + topBox.Width / 2
    y1 = topBox.Top + topBox.Height
    x2 = bottomBox.Left + bottomBox.Width / 2
    y2 = bottomBox.Top
    Dim arr As Shape
    Set arr = ws.Shapes.AddLine(x1, y1, x2, y2)
    arr.Name = PREFIX_PAIRARROW & NewId8()
    arr.OnAction = ""
    arr.Placement = 3
    On Error Resume Next
    arr.AlternativeText = "box1=" & topBox.Name & "|box2=" & bottomBox.Name
    With arr.Line
        .ForeColor.RGB = 0                            ' owner — 검정 통일
        .Weight = 0.75
        .DashStyle = msoLineRoundDot                 ' owner — 둥근 점선
        .BeginArrowheadStyle = msoArrowheadTriangle
        .EndArrowheadStyle = msoArrowheadTriangle
    End With
    arr.ZOrder msoSendToBack
    On Error GoTo 0
    Set 선번박스_RN_화살표Ret = arr
End Function

' owner 변경 (RN1 모드) — Cable 1 개 + RN. owner 그림 사양:
'   각 매핑 페어 (Cable 코어 N ↔ RN IN/OUT 코어 M) 마다:
'     - Cable 옆 코어 박스 (선번박스_단일생성 — "N" 텍스트, 케이블 평행 화살표)
'     - RN 시설물 옆 박스 (선번박스_시설물생성 — IN="i/m/s_M" / OUT="P_M")
'     - 화살표 (선번박스_경로_계산 — 케이블 평행)
'   mapAIn:  Dictionary<aCore, rnInCore>
'   mapAOut: Dictionary<aCore, rnOutCore>
Public Sub 선번박스_쌍_생성_RN1(cblA As String, rnLabel As String, rnSpec As String, _
                                mapAIn As Object, mapAOut As Object)
    Dim ws As Worksheet: Set ws = ThisWorkbook.Worksheets(SHEET_NETWORK)
    Dim facId As String: facId = g_pt_facId
    Dim facShp As Shape: Set facShp = Nothing
    On Error Resume Next
    Set facShp = ws.Shapes(facId)
    On Error GoTo 0
    If facShp Is Nothing Then
        MsgBox "RN 시설물 도형을 못 찾음: " & facId, vbExclamation, "RN1 코어 박스"
        Exit Sub
    End If

    Dim cblShp As Shape: Set cblShp = Nothing
    On Error Resume Next
    Set cblShp = ws.Shapes(cblA)
    On Error GoTo 0
    If cblShp Is Nothing Then
        MsgBox "케이블 도형을 못 찾음: " & cblA, vbExclamation, "RN1 코어 박스"
        Exit Sub
    End If

    Dim wasProt As Boolean: wasProt = ws.ProtectContents Or ws.ProtectDrawingObjects
    On Error Resume Next
    ws.Unprotect
    On Error GoTo 0

    Dim fcx As Double, fcy As Double
    fcx = facShp.Left + facShp.Width / 2
    fcy = facShp.Top + facShp.Height / 2

    ' owner 2026-06-05: tier 기반 prefix — 1차 IN=i / OUT=m, 2차 IN=m / OUT=s, 3차 IN=s / OUT=p.
    '   (이전엔 OUT 이 항상 "P_" 하드코딩이라 차수 정보 손실)
    Dim tier As Long: tier = g_pt_rnTier
    If tier < 1 Or tier > 3 Then tier = 1
    Dim inPrefix As String
    Dim outPrefix As String: outPrefix = 선번연결_도구_RN차수출력라벨(tier)        ' m / s / p
    Select Case tier
        Case 1: inPrefix = "i"
        Case 2: inPrefix = "m"
        Case 3: inPrefix = "s"
    End Select

    Dim rnGrpId As String: rnGrpId = "rngrp_" & NewId8()

    ' === Cable A ↔ RN (IN + OUT 통합) ===
    '   owner 2026-06-05: 박스추가 모드 OFF (기본) → IN + OUT 모두 한 박스 쌍에 합침.
    '                     박스추가 모드 ON → 매핑마다 별도 박스 (cascade stack).
    '   RN 박스 텍스트 = "i_1,m_2,m_3" 같은 prefix 혼합. 기존수집이 prefix 로 IN/OUT 분리.
    선번박스_RN1_통합페어생성 ws, cblShp, facShp, fcx, fcy, cblA, facId, _
                              mapAIn, mapAOut, inPrefix, outPrefix, rnGrpId

    If wasProt Then ApplySheetProtection ws
    레이어_정리_시트 ws
End Sub

' RN1 페어 생성 헬퍼 — Cable 박스 + RN 박스 + 화살표 (케이블 평행).
Public Sub 선번박스_RN1_페어생성(ws As Worksheet, cblShp As Shape, facShp As Shape, _
                                  fcx As Double, fcy As Double, _
                                  cblName As String, facId As String, _
                                  cblText As String, rnText As String, _
                                  rnTag As String, rnCoreN As Long, rnGrpId As String)
    ' Cable 옆 코어 박스 (선번박스_단일생성 활용 — cable 평행 라우팅 메타 자동)
    Dim cblBox As Shape: Set cblBox = Nothing
    On Error Resume Next
    Set cblBox = 선번박스_단일생성(ws, cblShp, fcx, fcy, facId, cblText, Nothing)
    On Error GoTo 0
    If cblBox Is Nothing Then Exit Sub

    ' RN 시설물 옆 박스 (선번박스_시설물생성 — IN="left" / OUT="right")
    Dim sideDir As String: sideDir = IIf(rnTag = "IN", "left", "right")
    Dim rnBox As Shape: Set rnBox = Nothing
    On Error Resume Next
    Set rnBox = 선번박스_시설물생성(ws, facShp, facId, rnText, sideDir)
    On Error GoTo 0
    If rnBox Is Nothing Then Exit Sub

    ' alt 에 rn tag 추가 — 잠금 복원·그룹 식별
    On Error Resume Next
    rnBox.AlternativeText = rnBox.AlternativeText & "|rn=" & rnTag & "|rngrp=" & rnGrpId
    cblBox.AlternativeText = cblBox.AlternativeText & "|rn=A|rngrp=" & rnGrpId
    On Error GoTo 0

    ' owner 2026-06-06 v4 spec (기존 vertical stack 폐기) — 두 박스를 cable 방향에 정렬.
    '   2026-06-06 보강: cblBox·rnBox 위치 swap + 화살표 길이 2배 (PAIR_GAP 14 → 28).
    '     - rnBox: 단일생성 이 정한 anchor 위치 (cable 근처, facility 쪽)
    '     - cblBox: anchor 에서 cable 방향으로 (ext_rn + ext_cbl + 28) 이동 (facility 에서 더 먼 쪽)
    '   결과: rnBox 는 facility 가까이, cblBox 는 멀리. 두 박스 사이 화살표가 케이블과 평행.
    DoEvents
    Const PAIR_GAP As Double = 28                          ' 박스 간격 (owner 요구: 14 → 28, 화살표 길이 2배)

    ' 1. 케이블 단위벡터 — facility → far-end 방향 (cblBox 를 facility 에서 멀어지는 쪽에 배치)
    Dim cax As Double, cay As Double, cbx As Double, cby As Double
    GetLineEndpoints cblShp, cax, cay, cbx, cby
    Dim dAA As Double, dBB As Double
    dAA = (cax - fcx) * (cax - fcx) + (cay - fcy) * (cay - fcy)
    dBB = (cbx - fcx) * (cbx - fcx) + (cby - fcy) * (cby - fcy)
    Dim farX_ As Double, farY_ As Double                   ' facility 와 더 먼 끝
    If dAA > dBB Then farX_ = cax: farY_ = cay Else farX_ = cbx: farY_ = cby
    Dim uvx As Double, uvy As Double
    uvx = farX_ - fcx: uvy = farY_ - fcy                    ' facility → far-end 벡터
    Dim uvlen As Double: uvlen = Sqr(uvx * uvx + uvy * uvy)
    If uvlen < 0.001 Then
        uvx = 1: uvy = 0: uvlen = 1
    End If
    Dim ucx As Double, ucy As Double
    ucx = uvx / uvlen: ucy = uvy / uvlen                    ' facility 반대 방향 단위벡터

    ' 2. anchor = 단일생성 이 정한 cblBox 위치 (cable 근처 facility-side) — 이 위치는 rnBox 가 차지
    Dim anchorX As Double, anchorY As Double
    anchorX = cblBox.Left + cblBox.Width / 2
    anchorY = cblBox.Top + cblBox.Height / 2

    ' 3. rnBox 를 anchor 위치로 이동
    On Error Resume Next
    rnBox.Left = anchorX - rnBox.Width / 2
    rnBox.Top = anchorY - rnBox.Height / 2
    On Error GoTo 0

    ' 4. cblBox 중심 = anchor + (ext_rn + ext_cbl + PAIR_GAP) * u — facility 에서 더 먼 쪽
    Dim extA As Double, extB As Double
    extA = (rnBox.Width / 2) * Abs(ucx) + (rnBox.Height / 2) * Abs(ucy)
    extB = (cblBox.Width / 2) * Abs(ucx) + (cblBox.Height / 2) * Abs(ucy)
    Dim centerDist As Double: centerDist = extA + extB + PAIR_GAP
    Dim newCblCx As Double, newCblCy As Double
    newCblCx = anchorX + ucx * centerDist
    newCblCy = anchorY + ucy * centerDist
    On Error Resume Next
    cblBox.Left = newCblCx - cblBox.Width / 2
    cblBox.Top = newCblCy - cblBox.Height / 2
    On Error GoTo 0

    ' 화살표 = 두 박스 가장자리 직선 (자동으로 케이블 평행 — 경로_시설물페어 v4 가 처리)
    DoEvents
    Dim arrPts As Variant
    arrPts = 선번박스_경로_시설물페어(cblShp, cblBox, rnBox)
    Dim arr As Shape: Set arr = Nothing
    On Error Resume Next
    Set arr = 선번박스_화살표생성(ws, arrPts)
    If arr Is Nothing Then
        Set arr = ws.Shapes.AddLine(cblBox.Left + cblBox.Width / 2, cblBox.Top + cblBox.Height / 2, _
                                     rnBox.Left + rnBox.Width / 2, rnBox.Top + rnBox.Height / 2)
    End If
    arr.Name = PREFIX_PAIRARROW & NewId8()
    arr.OnAction = ""
    arr.Placement = 3
    arr.AlternativeText = "box1=" & cblBox.Name & "|box2=" & rnBox.Name & "|rngrp=" & rnGrpId
    With arr.Line
        .ForeColor.RGB = 0                            ' 검정 (owner 요구)
        .Weight = 0.5
        .DashStyle = msoLineRoundDot                 ' 둥근 점선
        ' owner 2026-06-06 보정: 양쪽 끝 모두 화살표 머리. Short/Narrow 작은 크기로 박스 안 침범 방지.
        .BeginArrowheadStyle = msoArrowheadTriangle
        .BeginArrowheadLength = msoArrowheadShort
        .BeginArrowheadWidth = msoArrowheadNarrow
        .EndArrowheadStyle = msoArrowheadTriangle
        .EndArrowheadLength = msoArrowheadShort
        .EndArrowheadWidth = msoArrowheadNarrow
    End With
    arr.ZOrder msoBringToFront
    cblBox.ZOrder msoBringToFront
    rnBox.ZOrder msoBringToFront
    On Error GoTo 0
End Sub

' owner 2026-06-05: IN + OUT 통합 페어 생성 — 박스추가 OFF 시 모든 매핑을 한 박스 쌍에 합침.
'   박스추가 ON 시 매핑마다 별도 박스 (기존 cascade 동작 유지).
'   RN 박스 텍스트: "i_1,m_2,m_3" 같은 prefix 혼합 — 기존수집이 prefix 로 IN/OUT 분리 가능.
Public Sub 선번박스_RN1_통합페어생성(ws As Worksheet, cblShp As Shape, facShp As Shape, _
                                      fcx As Double, fcy As Double, _
                                      cblName As String, facId As String, _
                                      mapIn As Object, mapOut As Object, _
                                      inPrefix As String, outPrefix As String, _
                                      rnGrpId As String)
    Dim hasIn As Boolean: hasIn = (Not mapIn Is Nothing)
    If hasIn Then hasIn = (mapIn.Count > 0)
    Dim hasOut As Boolean: hasOut = (Not mapOut Is Nothing)
    If hasOut Then hasOut = (mapOut.Count > 0)
    If Not hasIn And Not hasOut Then Exit Sub

    If g_pt_addBoxMode Then
        ' === 박스추가 모드 — 매핑마다 별도 박스 ===
        If hasIn Then
            Dim aiArr() As Long
            선번연결_도구_dict정렬배열 mapIn, aiArr
            Dim ai As Long
            For ai = 0 To UBound(aiArr)
                Dim cblCoreI As Long: cblCoreI = aiArr(ai)
                Dim portI As Long: portI = CLng(mapIn(cblCoreI))
                선번박스_RN1_페어생성 ws, cblShp, facShp, fcx, fcy, cblName, facId, _
                                      CStr(cblCoreI), inPrefix & "_" & CStr(portI), _
                                      "IN", portI, rnGrpId
            Next ai
        End If
        If hasOut Then
            Dim aoArr() As Long
            선번연결_도구_dict정렬배열 mapOut, aoArr
            Dim ao As Long
            For ao = 0 To UBound(aoArr)
                Dim cblCoreO As Long: cblCoreO = aoArr(ao)
                Dim portO As Long: portO = CLng(mapOut(cblCoreO))
                선번박스_RN1_페어생성 ws, cblShp, facShp, fcx, fcy, cblName, facId, _
                                      CStr(cblCoreO), outPrefix & "_" & CStr(portO), _
                                      "OUT", portO, rnGrpId
            Next ao
        End If
        Exit Sub
    End If

    ' === 기본 — IN + OUT 모두 한 페어 박스에 합침 (크로스-서밋: 기존 페어에 누적) ===
    Dim cblTextNew As String: cblTextNew = ""
    Dim rnTextNew As String: rnTextNew = ""
    ' IN 매핑 먼저
    If hasIn Then
        Dim aiArr2() As Long
        선번연결_도구_dict정렬배열 mapIn, aiArr2
        Dim i As Long
        For i = 0 To UBound(aiArr2)
            Dim cIn As Long: cIn = aiArr2(i)
            Dim pIn As Long: pIn = CLng(mapIn(cIn))
            If Len(cblTextNew) > 0 Then cblTextNew = cblTextNew & ","
            cblTextNew = cblTextNew & CStr(cIn)
            If Len(rnTextNew) > 0 Then rnTextNew = rnTextNew & ","
            rnTextNew = rnTextNew & inPrefix & "_" & CStr(pIn)
        Next i
    End If
    ' OUT 매핑 뒤
    If hasOut Then
        Dim aoArr2() As Long
        선번연결_도구_dict정렬배열 mapOut, aoArr2
        Dim j As Long
        For j = 0 To UBound(aoArr2)
            Dim cOut As Long: cOut = aoArr2(j)
            Dim pOut As Long: pOut = CLng(mapOut(cOut))
            If Len(cblTextNew) > 0 Then cblTextNew = cblTextNew & ","
            cblTextNew = cblTextNew & CStr(cOut)
            If Len(rnTextNew) > 0 Then rnTextNew = rnTextNew & ","
            rnTextNew = rnTextNew & outPrefix & "_" & CStr(pOut)
        Next j
    End If

    ' === 크로스-서밋 합치기 — 기존 같은 cable+fac 페어 있으면 텍스트 누적 ===
    Dim existingCbl As Shape: Set existingCbl = Nothing
    Dim existingRn As Shape: Set existingRn = Nothing
    선번박스_RN1_기존페어찾기 ws, cblName, facId, existingCbl, existingRn

    If Not existingCbl Is Nothing And Not existingRn Is Nothing Then
        ' 기존 페어에 텍스트 append
        Dim curCblTxt As String, curRnTxt As String
        curCblTxt = "": curRnTxt = ""
        On Error Resume Next
        curCblTxt = existingCbl.TextFrame2.TextRange.Text
        curRnTxt = existingRn.TextFrame2.TextRange.Text
        On Error GoTo 0
        Dim combinedCbl As String, combinedRn As String
        If Len(Trim(curCblTxt)) > 0 Then combinedCbl = Trim(curCblTxt) & "," & cblTextNew Else combinedCbl = cblTextNew
        If Len(Trim(curRnTxt)) > 0 Then combinedRn = Trim(curRnTxt) & "," & rnTextNew Else combinedRn = rnTextNew
        선번박스_텍스트_setShape existingCbl, combinedCbl
        선번박스_텍스트_setShape existingRn, combinedRn
        ' owner 2026-06-05: 박스가 가로로 커지면 기존 화살표가 옛 위치 기준이라 케이블 비평행 →
        '   메인 화살표 재라우팅 (cable 평행 경로 다시 계산).
        선번박스_RN1_화살표_재라우팅 ws, existingCbl, existingRn, cblName, facId, facShp, fcx, fcy
        Exit Sub
    End If

    ' 신규 페어 생성 — primaryTag 는 IN/OUT 중 첫 매핑 기준 (alt 의 rn= 값. 기존수집이 prefix 로 재분리)
    Dim primaryTag As String
    If hasIn Then primaryTag = "IN" Else primaryTag = "OUT"
    선번박스_RN1_페어생성 ws, cblShp, facShp, fcx, fcy, cblName, facId, _
                          cblTextNew, rnTextNew, primaryTag, 0, rnGrpId

    ' owner 2026-06-06: 신규 페어도 AutoSize 가 화살표 그린 후 적용될 수 있어 폭 어긋남 가능 →
    '   DoEvents 로 AutoSize flush 보장 + 갱신된 폭 기준으로 재라우팅 한 번 더.
    '   안 그러면 첫 화살표가 default 22px 폭 기준이라 텍스트 길어진 박스에서 옆 면으로 어긋남.
    DoEvents
    Dim freshCbl As Shape, freshRn As Shape
    Set freshCbl = Nothing: Set freshRn = Nothing
    선번박스_RN1_기존페어찾기 ws, cblName, facId, freshCbl, freshRn
    If Not freshCbl Is Nothing And Not freshRn Is Nothing Then
        선번박스_RN1_화살표_재라우팅 ws, freshCbl, freshRn, cblName, facId, facShp, fcx, fcy
    End If
End Sub

' owner 2026-06-05: 기존 RN1 페어 박스 찾기 — cable name + facId 매칭, cascade 아닌 canonical 페어 우선.
'   결과: cblBoxOut + rnBoxOut (둘 다 ByRef). 없으면 둘 다 Nothing.
Public Sub 선번박스_RN1_기존페어찾기(ws As Worksheet, cblName As String, facId As String, _
                                      ByRef cblBoxOut As Shape, ByRef rnBoxOut As Shape)
    Set cblBoxOut = Nothing: Set rnBoxOut = Nothing
    Dim facTagF As String: facTagF = "fac=" & facId
    Dim cblTagF As String: cblTagF = "cbl=" & cblName

    Dim sh As Shape, altSh As String
    For Each sh In ws.Shapes
        If Left(sh.Name, Len(PREFIX_PAIRBOX)) = PREFIX_PAIRBOX Then
            altSh = ""
            On Error Resume Next: altSh = sh.AlternativeText: On Error GoTo 0
            If InStr(altSh, facTagF) > 0 And InStr(altSh, cblTagF) > 0 And _
               InStr(altSh, "|rn=A") > 0 And InStr(altSh, "cascade=1") = 0 Then
                ' canonical Cable A 박스 — peer (rn 박스) 찾기
                Dim peer As Shape: Set peer = Nothing
                On Error Resume Next
                Set peer = 선번박스_페어찾기(sh, ws)
                On Error GoTo 0
                If Not peer Is Nothing Then
                    Set cblBoxOut = sh
                    Set rnBoxOut = peer
                    Exit Sub
                End If
            End If
        End If
    Next sh
End Sub

' owner 2026-06-05: RN1 메인 화살표 재라우팅 — 크로스-서밋 머지로 박스가 가로 커진 후 호출.
'   기존 화살표 찾아서 (box1=<cblBoxName>|box2=<rnBoxName>) 삭제하고 새 cable 평행 경로로 재생성.
'   이름·alt·스타일은 그대로 유지.
Public Sub 선번박스_RN1_화살표_재라우팅(ws As Worksheet, cblBox As Shape, rnBox As Shape, _
                                         cblName As String, facId As String, facShp As Shape, _
                                         fcx As Double, fcy As Double)
    If cblBox Is Nothing Or rnBox Is Nothing Then Exit Sub
    If facShp Is Nothing Then Exit Sub

    ' 기존 화살표 찾기
    Dim selfArr As Shape: Set selfArr = Nothing
    Dim sh As Shape
    For Each sh In ws.Shapes
        If Left(sh.Name, Len(PREFIX_PAIRARROW)) = PREFIX_PAIRARROW Then
            Dim alt As String: alt = ""
            On Error Resume Next: alt = sh.AlternativeText: On Error GoTo 0
            If InStr(alt, "box1=" & cblBox.Name & "|box2=" & rnBox.Name) > 0 Or _
               InStr(alt, "box1=" & rnBox.Name & "|box2=" & cblBox.Name) > 0 Then
                Set selfArr = sh
                Exit For
            End If
        End If
    Next sh
    If selfArr Is Nothing Then Exit Sub

    ' 기존 화살표 메타 백업 + 삭제
    Dim oldName As String: oldName = selfArr.Name
    Dim oldAlt As String: oldAlt = ""
    On Error Resume Next: oldAlt = selfArr.AlternativeText: On Error GoTo 0
    On Error Resume Next: selfArr.Delete: On Error GoTo 0

    ' 화살표 — owner 2026-06-06 v4 + swap: cable 과 평행. AutoSize flush 보장 후 위치 보정.
    '   페어생성 과 동일 swap 로직: rnBox 가 facility 가까이 (anchor), cblBox 가 멀리.
    '   재라우팅 시 anchor 는 rnBox 의 현재 위치를 그대로 유지 (cblBox 만 cable 방향에 재배치).
    DoEvents

    ' 케이블 단위벡터 (facility 반대편 향함) — 페어생성 과 동일 로직
    Dim cblShpRR As Shape: Set cblShpRR = Nothing
    On Error Resume Next
    Set cblShpRR = ws.Shapes(cblName)
    On Error GoTo 0
    Const PAIR_GAP_RR As Double = 28               ' 페어생성 과 일치 (2배 길이)
    If Not cblShpRR Is Nothing Then
        Dim caxRR As Double, cayRR As Double, cbxRR As Double, cbyRR As Double
        GetLineEndpoints cblShpRR, caxRR, cayRR, cbxRR, cbyRR
        Dim dAARR As Double, dBBRR As Double
        dAARR = (caxRR - fcx) * (caxRR - fcx) + (cayRR - fcy) * (cayRR - fcy)
        dBBRR = (cbxRR - fcx) * (cbxRR - fcx) + (cbyRR - fcy) * (cbyRR - fcy)
        Dim farXRR As Double, farYRR As Double
        If dAARR > dBBRR Then farXRR = caxRR: farYRR = cayRR Else farXRR = cbxRR: farYRR = cbyRR
        Dim uvxRR As Double, uvyRR As Double
        uvxRR = farXRR - fcx: uvyRR = farYRR - fcy
        Dim uvlenRR As Double: uvlenRR = Sqr(uvxRR * uvxRR + uvyRR * uvyRR)
        If uvlenRR < 0.001 Then uvxRR = 1: uvyRR = 0: uvlenRR = 1
        Dim ucxRR As Double, ucyRR As Double
        ucxRR = uvxRR / uvlenRR: ucyRR = uvyRR / uvlenRR
        ' anchor = rnBox 현재 위치 (재라우팅이라 rnBox 의 facility-side 위치 유지)
        Dim anchorXRR As Double, anchorYRR As Double
        anchorXRR = rnBox.Left + rnBox.Width / 2
        anchorYRR = rnBox.Top + rnBox.Height / 2
        Dim extARR As Double, extBRR As Double
        extARR = (rnBox.Width / 2) * Abs(ucxRR) + (rnBox.Height / 2) * Abs(ucyRR)
        extBRR = (cblBox.Width / 2) * Abs(ucxRR) + (cblBox.Height / 2) * Abs(ucyRR)
        Dim centerDistRR As Double: centerDistRR = extARR + extBRR + PAIR_GAP_RR
        On Error Resume Next
        cblBox.Left = (anchorXRR + ucxRR * centerDistRR) - cblBox.Width / 2
        cblBox.Top = (anchorYRR + ucyRR * centerDistRR) - cblBox.Height / 2
        On Error GoTo 0
    End If
    DoEvents
    Dim arrPts As Variant
    If Not cblShpRR Is Nothing Then
        arrPts = 선번박스_경로_시설물페어(cblShpRR, cblBox, rnBox)
    Else
        ' fallback — 케이블 도형 없으면 legacy clamp 경로
        arrPts = 선번박스_RN1_경로(cblBox, rnBox)
    End If
    Dim newArr As Shape: Set newArr = Nothing
    On Error Resume Next
    Set newArr = 선번박스_화살표생성(ws, arrPts)
    If newArr Is Nothing Then
        Set newArr = ws.Shapes.AddLine(cblBox.Left + cblBox.Width / 2, cblBox.Top + cblBox.Height / 2, _
                                       rnBox.Left + rnBox.Width / 2, rnBox.Top + rnBox.Height / 2)
    End If
    On Error GoTo 0
    If newArr Is Nothing Then Exit Sub

    ' 이름·alt·스타일 복원
    On Error Resume Next
    newArr.Name = oldName
    newArr.OnAction = ""
    newArr.Placement = 3
    newArr.AlternativeText = oldAlt
    With newArr.Line
        .ForeColor.RGB = 0
        .Weight = 0.5
        .DashStyle = msoLineRoundDot
        ' owner 2026-06-06 보정: 페어생성 과 일치 — 양쪽 끝 모두 화살표 머리 + Short/Narrow.
        .BeginArrowheadStyle = msoArrowheadTriangle
        .BeginArrowheadLength = msoArrowheadShort
        .BeginArrowheadWidth = msoArrowheadNarrow
        .EndArrowheadStyle = msoArrowheadTriangle
        .EndArrowheadLength = msoArrowheadShort
        .EndArrowheadWidth = msoArrowheadNarrow
    End With
    newArr.ZOrder msoBringToFront
    cblBox.ZOrder msoBringToFront
    rnBox.ZOrder msoBringToFront
    On Error GoTo 0
End Sub

' owner 2026-06-06 v3 spec: cable-facility 페어 화살표 (RN 포함, 시설물 내부 연결 공통).
'   cable-cable (접속함체 양쪽 케이블) 은 기존 path 유지 — 이 함수는 시설물 측 케이스 전용.
'
'   알고리즘:
'     1. 케이블 양 끝점 두 좌표로 기하 각도 (절대값 0~180°) 계산
'     2. 기울기 70°~110° (수직 부근) → 박스 가로 면 (top/bottom) 중앙 부착
'        그 외 (수평·대각선) → 박스 세로 면 (left/right) 중앙 부착
'     3. 어느 면 (top vs bottom 등) = 두 박스 상대 위치 (마주보는 방향) 로 결정
'     4. 화살표 = 단순 직선 1개 (양 부착점 직접 연결)
'
'   owner 2026-06-06 v4 spec (기존 v3 폐기): 화살표를 항상 케이블과 평행하게 유지.
'     1. 케이블 단위벡터 u 계산 (방향 무관 — 부호는 box1→box2 dot u 로 결정)
'     2. 화살표 = box1 가장자리 → box2 가장자리, 방향은 u 와 평행
'     3. 박스 가장자리 부착점 = box 중심 + ext * u (ext = (W/2)*|ux| + (H/2)*|uy|, axis-aligned 사각형 투영)
'     4. 두 박스 중심을 잇는 선이 u 와 어긋나도 화살표는 강제 평행 — 박스 위치 보정은 RN1_페어생성 가 담당
'
'   반환: arrPts(1 To 2, 1 To 2) — 2-point 직선
Public Function 선번박스_경로_시설물페어(cableShp As Shape, box1 As Shape, box2 As Shape) As Variant
    ' 1. 케이블 방향 단위벡터
    Dim ax As Double, ay As Double, bx As Double, by As Double
    GetLineEndpoints cableShp, ax, ay, bx, by
    Dim cdx As Double, cdy As Double
    cdx = bx - ax: cdy = by - ay
    Dim clen As Double: clen = Sqr(cdx * cdx + cdy * cdy)
    Dim ux As Double, uy As Double
    If clen < 0.001 Then
        ux = 1: uy = 0                                    ' fallback (길이 0 케이블)
    Else
        ux = cdx / clen: uy = cdy / clen
    End If

    ' 2. 박스 중심
    Dim b1x As Double, b1y As Double, b2x As Double, b2y As Double
    b1x = box1.Left + box1.Width / 2
    b1y = box1.Top + box1.Height / 2
    b2x = box2.Left + box2.Width / 2
    b2y = box2.Top + box2.Height / 2

    ' 3. box1 → box2 방향이 +u 인지 -u 인지 결정 (dot product 부호)
    '   주의: 변수명 sgn 은 VBA 내장함수 Sgn 과 충돌 (컴파일 오류) → dirSign 사용.
    Dim dotU As Double: dotU = (b2x - b1x) * ux + (b2y - b1y) * uy
    Dim dirSign As Double
    If dotU >= 0 Then dirSign = 1# Else dirSign = -1#
    Dim ex As Double, ey As Double
    ex = ux * dirSign: ey = uy * dirSign                  ' box1 → box2 향한 단위벡터

    ' 4. 박스 가장자리 부착점 — 축평행 사각형의 방향 투영 extent
    Dim ext1 As Double, ext2 As Double
    ext1 = (box1.Width / 2) * Abs(ex) + (box1.Height / 2) * Abs(ey)
    ext2 = (box2.Width / 2) * Abs(ex) + (box2.Height / 2) * Abs(ey)

    Dim e1x As Double, e1y As Double, e2x As Double, e2y As Double
    e1x = b1x + ext1 * ex: e1y = b1y + ext1 * ey
    e2x = b2x - ext2 * ex: e2y = b2y - ext2 * ey

    Dim pts() As Double
    ReDim pts(1 To 2, 1 To 2)
    pts(1, 1) = e1x: pts(1, 2) = e1y
    pts(2, 1) = e2x: pts(2, 2) = e2y
    선번박스_경로_시설물페어 = pts
End Function

' owner 2026-06-06: _시설물 시트 재생성 + 캔버스 시설물 도형/배지에서 메타 복원.
'   owner 가 _시설물 시트 삭제한 경우 호출. 캔버스의 시설물 (fac_*) 도형 + 배지 텍스트에서 id/type/name/created/badge 채움.
'   type = shape 의 색·모양 으로 추정 (정확하지 않을 수 있음 — owner 가 후속 정정 가능).
'   badge_no = 캔버스 배지 도형의 텍스트.
Public Sub 진단_시설물메타_재생성()
    Dim wsNw As Worksheet
    On Error Resume Next
    Set wsNw = ThisWorkbook.Worksheets(SHEET_NETWORK)
    On Error GoTo 0
    If wsNw Is Nothing Then
        MsgBox "네트웍구성도 시트 못 찾음.", vbExclamation, "메타 재생성"
        Exit Sub
    End If

    ' 1. 시트 재생성 (있으면 유지)
    Dim wsFac As Worksheet: Set wsFac = Nothing
    On Error Resume Next
    Set wsFac = ThisWorkbook.Worksheets(SHEET_META_FAC)
    On Error GoTo 0
    If wsFac Is Nothing Then
        Set wsFac = ThisWorkbook.Worksheets.Add(After:=ThisWorkbook.Worksheets(ThisWorkbook.Worksheets.Count))
        wsFac.Name = SHEET_META_FAC
    Else
        wsFac.Cells.Clear
    End If

    ' 2. 헤더 — id / type / name / created_at / badge_no / spec
    wsFac.Range("A1").Value = "id"
    wsFac.Range("B1").Value = "type"
    wsFac.Range("C1").Value = "name"
    wsFac.Range("D1").Value = "created_at"
    wsFac.Range("E1").Value = "badge_no"
    wsFac.Range("F1").Value = "spec"

    ' 3. 캔버스에서 시설물 도형 수집
    Dim r As Long: r = 2
    Dim sh As Shape, restoredCnt As Long, restoredBadgeCnt As Long
    restoredCnt = 0: restoredBadgeCnt = 0
    For Each sh In wsNw.Shapes
        If Left(sh.Name, Len(PREFIX_FAC)) = PREFIX_FAC Then
            wsFac.Cells(r, 1).Value = sh.Name             ' id
            wsFac.Cells(r, 2).Value = "복원됨"            ' type (정확하지 않음 — owner 후속 정정)
            wsFac.Cells(r, 3).Value = ""                  ' name (캔버스에 없으면 빈)
            wsFac.Cells(r, 4).Value = Now                 ' created_at (현재 시각으로 fallback)

            ' 배지 텍스트 추출 — PREFIX_LABEL & facId 또는 별도 배지 도형
            Dim badge As String: badge = ""
            Dim badgeShp As Shape: Set badgeShp = Nothing
            On Error Resume Next
            ' 시도 1: 배지 prefix
            Set badgeShp = wsNw.Shapes("badge_" & sh.Name)
            On Error GoTo 0
            If Not badgeShp Is Nothing Then
                On Error Resume Next
                badge = Trim(badgeShp.TextFrame2.TextRange.Text)
                On Error GoTo 0
            End If
            If Len(badge) > 0 Then
                wsFac.Cells(r, 5).Value = badge
                restoredBadgeCnt = restoredBadgeCnt + 1
            End If

            r = r + 1
            restoredCnt = restoredCnt + 1
        End If
    Next sh

    MsgBox "_시설물 메타 시트 재생성 완료." & vbLf & vbLf & _
           "시설물 " & restoredCnt & " 개 복원 (id 만 자동)." & vbLf & _
           "배지 자동 복원: " & restoredBadgeCnt & " 개." & vbLf & vbLf & _
           "다음 작업:" & vbLf & _
           "1. _시설물 시트의 col B (type) 와 col C (name) 를 직접 입력" & vbLf & _
           "2. 배지 안 찍힌 시설물은 col E (badge_no) 에 번호 직접 입력" & vbLf & _
           "3. 다시 「코어 연결」 진입 → A60 셀에 facRow=N colE=[배지] 표시되면 성공", _
           vbInformation, "메타 재생성"
End Sub

' owner 2026-06-06: 디버그 셀 클리어 — A50~A500 영역의 진단 dump 모두 지움.
' owner 2026-06-06: 현재 세션 매핑 상태 진단 — g_pt_mappings·g_pt_selA·g_pt_selB·existingA·existingB 모두 dump.
'   증상: [V] 코어가 선택 안 했는데 보임 / 클릭해도 안 해제됨 → 어디서 들어왔는지 확인용.
'   사용법: Alt+F8 → 진단_매핑상태.
Public Sub 진단_매핑상태()
    Dim msg As String
    msg = "=== 현재 세션 매핑 상태 ===" & vbLf & vbLf

    msg = msg & "g_pt_cbl1Name (A): " & g_pt_cbl1Name & vbLf
    msg = msg & "g_pt_cbl2Name (B): " & g_pt_cbl2Name & vbLf
    msg = msg & "g_pt_step: " & g_pt_step & vbLf
    msg = msg & "g_pt_rnMode: " & g_pt_rnMode & " · g_pt_rn1Mode: " & g_pt_rn1Mode & vbLf & vbLf

    msg = msg & "g_pt_mappings (이번 세션 신규 매핑 — [V] 표시 원인):" & vbLf
    If g_pt_mappings Is Nothing Then
        msg = msg & "  (Nothing)" & vbLf
    Else
        msg = msg & "  count = " & g_pt_mappings.Count & vbLf
        Dim mk As Variant
        For Each mk In g_pt_mappings.Keys
            msg = msg & "  " & mk & " → " & g_pt_mappings(mk) & vbLf
        Next mk
    End If
    msg = msg & vbLf

    msg = msg & "g_pt_selA (현재 파랑 선택 A): "
    If g_pt_selA Is Nothing Then msg = msg & "(Nothing)" Else msg = msg & g_pt_selA.Count & " 개 — "
    If Not g_pt_selA Is Nothing Then
        Dim mkS As Variant
        For Each mkS In g_pt_selA.Keys: msg = msg & mkS & ",": Next mkS
    End If
    msg = msg & vbLf

    msg = msg & "g_pt_selB (현재 파랑 선택 B): "
    If g_pt_selB Is Nothing Then msg = msg & "(Nothing)" Else msg = msg & g_pt_selB.Count & " 개 — "
    If Not g_pt_selB Is Nothing Then
        Dim mkSB As Variant
        For Each mkSB In g_pt_selB.Keys: msg = msg & mkSB & ",": Next mkSB
    End If
    msg = msg & vbLf & vbLf

    msg = msg & "g_pt_existingA (잠금 A — [잠] 원인): "
    If g_pt_existingA Is Nothing Then
        msg = msg & "(Nothing)"
    Else
        msg = msg & g_pt_existingA.Count & " 개 — "
        Dim mkExA As Variant
        For Each mkExA In g_pt_existingA.Keys: msg = msg & mkExA & ",": Next mkExA
    End If
    msg = msg & vbLf

    msg = msg & "g_pt_existingB (잠금 B): "
    If g_pt_existingB Is Nothing Then
        msg = msg & "(Nothing)"
    Else
        msg = msg & g_pt_existingB.Count & " 개 — "
        Dim mkExB As Variant
        For Each mkExB In g_pt_existingB.Keys: msg = msg & mkExB & ",": Next mkExB
    End If

    MsgBox msg, vbInformation, "진단 — 매핑 상태"
End Sub

' owner 2026-06-06: 이번 세션 매핑 + 선택 일괄 초기화 — g_pt_mappings·selA·selB·RN dict 모두 비움.
'   증상: 의도치 않게 [V] 코어가 보일 때 빠른 reset.
'   잠금(g_pt_existingA/B) 은 그대로 — 기존 연결은 유지.
'   사용법: Alt+F8 → 진단_세션_초기화 → 시트빌드 + 시각 자동 갱신.
'   2026-06-06 보강: RN 매핑 dict + 시트빌드 호출 추가 — stale shape 텍스트 (다른 흐름에서 남은 [V]) 도 초기화.
Public Sub 진단_세션_초기화()
    Dim msg As String
    Dim wasMap As Long, wasSelA As Long, wasSelB As Long
    Dim wasMapAIN As Long, wasMapAOUT As Long, wasMapOUTB As Long
    wasMap = 0: wasSelA = 0: wasSelB = 0
    wasMapAIN = 0: wasMapAOUT = 0: wasMapOUTB = 0
    If Not g_pt_mappings Is Nothing Then wasMap = g_pt_mappings.Count: g_pt_mappings.RemoveAll
    If Not g_pt_selA Is Nothing Then wasSelA = g_pt_selA.Count: g_pt_selA.RemoveAll
    If Not g_pt_selB Is Nothing Then wasSelB = g_pt_selB.Count: g_pt_selB.RemoveAll
    If Not g_pt_selUnitsA Is Nothing Then g_pt_selUnitsA.RemoveAll
    If Not g_pt_selUnitsB Is Nothing Then g_pt_selUnitsB.RemoveAll
    ' RN 매핑 dict 도 일괄 비움 (cable-cable mode 에서도 stale 잔재 가능)
    If Not g_pt_mappingsA_IN Is Nothing Then wasMapAIN = g_pt_mappingsA_IN.Count: g_pt_mappingsA_IN.RemoveAll
    If Not g_pt_mappingsA_OUT Is Nothing Then wasMapAOUT = g_pt_mappingsA_OUT.Count: g_pt_mappingsA_OUT.RemoveAll
    If Not g_pt_mappingsOUT_B Is Nothing Then wasMapOUTB = g_pt_mappingsOUT_B.Count: g_pt_mappingsOUT_B.RemoveAll
    If Not g_pt_selRN_IN Is Nothing Then g_pt_selRN_IN.RemoveAll
    If Not g_pt_selRN_OUT Is Nothing Then g_pt_selRN_OUT.RemoveAll
    g_pt_anchorA = 0: g_pt_anchorB = 0
    g_pt_anchorRN_IN = 0: g_pt_anchorRN_OUT = 0
    ' 시트빌드 = 모든 코어 박스 재생성 → stale "[V] N" 텍스트도 깨끗하게 "N" 으로
    If g_pt_step = 2 Then
        선번연결_도구_시트빌드
        선번연결_도구_시각갱신
    End If
    msg = "세션 매핑·선택 초기화 + 시트 재빌드 완료." & vbLf & vbLf & _
          "g_pt_mappings: " & wasMap & " 개 제거" & vbLf & _
          "g_pt_mappingsA_IN: " & wasMapAIN & " 개 제거" & vbLf & _
          "g_pt_mappingsA_OUT: " & wasMapAOUT & " 개 제거" & vbLf & _
          "g_pt_mappingsOUT_B: " & wasMapOUTB & " 개 제거" & vbLf & _
          "g_pt_selA: " & wasSelA & " 개 제거" & vbLf & _
          "g_pt_selB: " & wasSelB & " 개 제거" & vbLf & vbLf & _
          "(잠금 = 기존 연결은 유지)"
    MsgBox msg, vbInformation, "진단 — 세션 초기화"
End Sub

' owner 2026-06-06: 모든 cable-cable / cable-facility 페어 화살표 강제 재정렬.
'   증상: 빈 셀 클릭해도 일부 화살표가 stale (마지막 연결만 따라옴).
'   원인 가능성: SelectionChange 가 어떤 이유로 일부 anchors 만 처리, OR 이벤트 미발화.
'   매크로로 수동 호출 가능: Alt+F8 → 진단_화살표_재정렬.
Public Sub 진단_화살표_재정렬()
    Dim ws As Worksheet: Set ws = ThisWorkbook.Worksheets(SHEET_NETWORK)
    If ws Is Nothing Then
        MsgBox "네트웍구성도 시트 없음.", vbExclamation, "진단"
        Exit Sub
    End If
    Dim wasProt As Boolean: wasProt = ws.ProtectContents Or ws.ProtectDrawingObjects
    On Error Resume Next: ws.Unprotect: On Error GoTo 0

    Dim before As Long: before = ws.Shapes.Count
    페어화살표_시설물페어_재정렬 ws
    Dim after As Long: after = ws.Shapes.Count

    ' anchor 개수 카운트 (PAIRARROW + box1=|box2=)
    Dim anchorCount As Long: anchorCount = 0
    Dim mainCount As Long: mainCount = 0
    Dim sh As Shape, alt As String
    For Each sh In ws.Shapes
        If Left(sh.Name, Len(PREFIX_PAIRARROW)) = PREFIX_PAIRARROW Then
            alt = "": On Error Resume Next: alt = sh.AlternativeText: On Error GoTo 0
            If InStr(alt, "box1=") > 0 And InStr(alt, "box2=") > 0 Then
                anchorCount = anchorCount + 1
            ElseIf InStr(alt, "main=1") > 0 Then
                mainCount = mainCount + 1
            End If
        End If
    Next sh

    If wasProt Then ApplySheetProtection ws

    MsgBox "화살표 재정렬 완료." & vbLf & vbLf & _
           "도형 총 개수: " & before & " → " & after & vbLf & _
           "anchor (box1=|box2=) 발견: " & anchorCount & " 개" & vbLf & _
           "visible main (main=1) 발견: " & mainCount & " 개", _
           vbInformation, "진단 — 화살표 재정렬"
End Sub

' owner 2026-06-06 (8-23·8-24): chain 평행 이동 처리 진단 — 매크로로 수동 호출 가능.
'   Alt+F8 → 진단_체인_상태 → anchor 기반 chain 별 박스 개수 + lastPos 등록 여부 출력.
'   8-24 보강: 같은 cable 공유 다른 페어 박스 분리 검증 (anchor 기반 그룹핑 vs 박스 fac|cbl 그룹핑 차이 표시)
Public Sub 진단_체인_상태()
    Dim ws As Worksheet: Set ws = ThisWorkbook.Worksheets(SHEET_NETWORK)
    If ws Is Nothing Then
        MsgBox "네트웍구성도 시트 없음.", vbExclamation, "진단"
        Exit Sub
    End If

    ' 1) anchor 스캔 → box → chain key 매핑 (Cable_Chain_평행이동_처리 와 동일 로직)
    Dim boxChainMap As Object: Set boxChainMap = CreateObject("Scripting.Dictionary")
    Dim shA As Shape, altA As String
    For Each shA In ws.Shapes
        If Left(shA.Name, Len(PREFIX_PAIRARROW)) = PREFIX_PAIRARROW Then
            altA = "": On Error Resume Next: altA = shA.AlternativeText: On Error GoTo 0
            If InStr(altA, "box1=") > 0 And InStr(altA, "box2=") > 0 Then
                Dim b1N As String, b2N As String
                b1N = AltParseField(altA, "box1=")
                b2N = AltParseField(altA, "box2=")
                If Len(b1N) > 0 And Len(b2N) > 0 Then
                    Dim b1S As Shape, b2S As Shape
                    Set b1S = Nothing: Set b2S = Nothing
                    On Error Resume Next
                    Set b1S = ws.Shapes(b1N): Set b2S = ws.Shapes(b2N)
                    On Error GoTo 0
                    If Not b1S Is Nothing And Not b2S Is Nothing Then
                        Dim b1A As String, b2A As String
                        b1A = "": b2A = ""
                        On Error Resume Next: b1A = b1S.AlternativeText: b2A = b2S.AlternativeText: On Error GoTo 0
                        If InStr(b1A, "|rn=") = 0 And InStr(b1A, "rn=") <> 1 And _
                           InStr(b2A, "|rn=") = 0 And InStr(b2A, "rn=") <> 1 Then
                            Dim facD As String, c1D As String, c2D As String
                            facD = AltParseField(b1A, "fac=")
                            If Len(facD) = 0 Then facD = AltParseField(b2A, "fac=")
                            c1D = AltParseField(b1A, "cbl=")
                            c2D = AltParseField(b2A, "cbl=")
                            If Len(facD) > 0 And Len(c1D) > 0 And Len(c2D) > 0 Then
                                If Left(c1D, Len(PREFIX_FAC)) <> PREFIX_FAC And _
                                   Left(c2D, Len(PREFIX_FAC)) <> PREFIX_FAC Then
                                    Dim kAD As String, kBD As String
                                    If c1D < c2D Then kAD = c1D: kBD = c2D Else kAD = c2D: kBD = c1D
                                    Dim pBase As String: pBase = facD & "|" & kAD & "|" & kBD
                                    boxChainMap(b1N) = pBase & "|" & c1D
                                    boxChainMap(b2N) = pBase & "|" & c2D
                                End If
                            End If
                        End If
                    End If
                End If
            End If
        End If
    Next shA

    ' 2) 박스 스캔 → chain 그룹핑 + lastPos 등록 카운트
    Dim chains As Object: Set chains = CreateObject("Scripting.Dictionary")
    Dim totalCount As Long: totalCount = 0
    Dim withLastPos As Long: withLastPos = 0
    Dim orphanCount As Long: orphanCount = 0
    Dim sh As Shape, alt As String
    For Each sh In ws.Shapes
        If Left(sh.Name, Len(PREFIX_PAIRBOX)) = PREFIX_PAIRBOX Then
            alt = "": On Error Resume Next: alt = sh.AlternativeText: On Error GoTo 0
            If InStr(alt, "|rn=") = 0 And InStr(alt, "rn=") <> 1 Then
                Dim facV As String, cblV As String
                facV = AltParseField(alt, "fac=")
                cblV = AltParseField(alt, "cbl=")
                If Len(facV) > 0 And Len(cblV) > 0 Then
                    If Left(cblV, Len(PREFIX_FAC)) <> PREFIX_FAC Then
                        totalCount = totalCount + 1
                        If InStr(alt, "lastPos=") > 0 Then withLastPos = withLastPos + 1
                        If boxChainMap.Exists(sh.Name) Then
                            Dim cKey As String: cKey = CStr(boxChainMap(sh.Name))
                            If chains.Exists(cKey) Then
                                chains(cKey) = chains(cKey) + 1
                            Else
                                chains.Add cKey, 1
                            End If
                        Else
                            orphanCount = orphanCount + 1     ' anchor 없는 박스 (sync 문제)
                        End If
                    End If
                End If
            End If
        End If
    Next sh

    Dim msg As String
    msg = "cable-cable chain (anchor 기반 — fac|kA|kB|thisCbl) 박스 개수:" & vbLf & vbLf
    Dim ck As Variant
    For Each ck In chains.Keys
        msg = msg & "  " & CStr(ck) & " — " & chains(ck) & " 개" & vbLf
    Next ck
    msg = msg & vbLf & _
          "총 cable-cable PAIRBOX: " & totalCount & " 개" & vbLf & _
          "lastPos 등록된 박스: " & withLastPos & " 개" & vbLf & _
          "anchor 매핑 없는 박스 (orphan): " & orphanCount & " 개"
    If totalCount > withLastPos Then
        msg = msg & vbLf & vbLf & _
              "ℹ lastPos 미등록 박스 — 빈 셀 클릭 1회로 자동 초기화."
    End If
    If orphanCount > 0 Then
        msg = msg & vbLf & "⚠ anchor 없는 박스 — 「X 삭제」 후 잔존 가능성. 수동 점검 필요."
    End If

    MsgBox msg, vbInformation, "진단 — chain 평행 이동 상태"
End Sub

Public Sub 진단_셀_클리어()
    Dim ws As Worksheet
    On Error Resume Next
    Set ws = ThisWorkbook.Worksheets(SHEET_PAIR_TOOL)
    On Error GoTo 0
    If ws Is Nothing Then Exit Sub
    On Error Resume Next
    ws.Range("A50:A500").ClearContents
    On Error GoTo 0
    MsgBox "도구 시트 A50~A500 디버그 셀 클리어 완료.", vbInformation, "진단"
End Sub

' owner 2026-06-06: 도구 시트의 모든 도형 이름 dump (A200 부터).
'   매핑선 그리기 시 visible 박스 못 찾는 원인 추적용.
'   사용법: 매핑 UI 진입 후 Alt+F8 → 진단_도구시트_도형목록 실행.
Public Sub 진단_도구시트_도형목록()
    Dim ws As Worksheet
    On Error Resume Next
    Set ws = ThisWorkbook.Worksheets(SHEET_PAIR_TOOL)
    On Error GoTo 0
    If ws Is Nothing Then
        MsgBox "_선번연결_도구 시트 없음.", vbExclamation, "진단"
        Exit Sub
    End If

    ' A200:A500 클리어 후 dump
    On Error Resume Next
    ws.Range("A200:A500").ClearContents
    On Error GoTo 0
    Dim i As Long
    For i = 1 To ws.Shapes.Count
        On Error Resume Next
        ws.Range("A" & (199 + i)).Value = i & ": " & ws.Shapes(i).Name
        On Error GoTo 0
        If 199 + i >= 500 Then Exit For
    Next i

    MsgBox "도구 시트 도형 " & ws.Shapes.Count & " 개. A200 부터 dump 완료.", vbInformation, "진단"
End Sub

' owner 2026-06-06: 워크북 시트 이름 모두 출력 — _시설물 시트 못 찾는 원인 추적용.
'   라벨 함수의 wsFac=NOTHING 결과 → 시트 이름 mismatch 확인용.
Public Sub 진단_시트목록()
    Dim msg As String
    msg = "ThisWorkbook 시트 목록 (총 " & ThisWorkbook.Worksheets.Count & " 개):" & vbLf & vbLf
    Dim i As Long
    For i = 1 To ThisWorkbook.Worksheets.Count
        Dim sht As Worksheet: Set sht = ThisWorkbook.Worksheets(i)
        Dim vis As String
        Select Case sht.Visible
            Case xlSheetVisible: vis = "보임"
            Case xlSheetHidden: vis = "숨김"
            Case xlSheetVeryHidden: vis = "매우숨김"
        End Select
        msg = msg & i & ". [" & sht.Name & "]  " & vis & vbLf
    Next i
    msg = msg & vbLf & "코드 상수:" & vbLf
    msg = msg & "SHEET_NETWORK = [" & SHEET_NETWORK & "]" & vbLf
    msg = msg & "SHEET_META_FAC = [" & SHEET_META_FAC & "]" & vbLf
    msg = msg & "SHEET_META_CBL = [" & SHEET_META_CBL & "]" & vbLf
    msg = msg & "SHEET_PAIR_TOOL = [" & SHEET_PAIR_TOOL & "]" & vbLf & vbLf

    ' 직접 시트 접근 시도
    Dim wsTry As Worksheet
    On Error Resume Next
    Set wsTry = ThisWorkbook.Worksheets(SHEET_META_FAC)
    On Error GoTo 0
    If wsTry Is Nothing Then
        msg = msg & "ThisWorkbook.Worksheets(""" & SHEET_META_FAC & """) = NOTHING ❌"
    Else
        msg = msg & "ThisWorkbook.Worksheets(""" & SHEET_META_FAC & """) = OK ✓"
    End If
    MsgBox msg, vbInformation, "진단 — 시트 목록"
End Sub

' owner 2026-06-06: 사이드정보_갱신 강제 호출 — 라벨 함수 호출 트리거 + A60 진단 결과 갱신.
'   매핑 UI 진입 후에도 A60 의 디버그가 갱신 안 될 때 사용. Alt+F8 → 진단_사이드정보_재갱신 실행.
Public Sub 진단_사이드정보_재갱신()
    Dim ws As Worksheet
    On Error Resume Next
    Set ws = ThisWorkbook.Worksheets(SHEET_PAIR_TOOL)
    On Error GoTo 0
    If ws Is Nothing Then
        MsgBox "_선번연결_도구 시트 없음. 먼저 코어 연결 진입.", vbExclamation, "진단"
        Exit Sub
    End If
    선번연결_도구_사이드정보갱신 ws
    MsgBox "사이드정보_갱신 강제 호출 완료." & vbLf & _
           "도구 시트의 A60 셀 (라벨 함수 디버그) + A50-A54 셀 (사이드정보 디버그) 확인.", _
           vbInformation, "진단"
End Sub

' owner 2026-06-06: 선택된 도형의 식별 정보 출력 — 도구 시트 박스 위치 진단용.
'   사용법: 매핑 UI 의 겹친 컬러 박스 클릭 → Alt+F8 → 선번연결_도형_식별 실행.
'   → 메시지에 이름·위치·크기·색상 표시. 어느 함수가 그린 박스인지 추적 가능.
Public Sub 선번연결_도형_식별()
    Dim sel As Object: Set sel = Nothing
    On Error Resume Next: Set sel = Application.Selection: On Error GoTo 0

    Dim trialName As String: trialName = ""
    If TypeName(sel) = "ShapeRange" Then
        If sel.Count >= 1 Then
            On Error Resume Next: trialName = sel(1).Name: On Error GoTo 0
        End If
    Else
        On Error Resume Next: trialName = sel.Name: On Error GoTo 0
    End If
    If Len(trialName) = 0 Then
        MsgBox "도형 1개 선택 후 실행하세요.", vbExclamation, "도형 식별"
        Exit Sub
    End If

    ' 도구 시트 + 네트웍 시트 둘 다 검색
    Dim wsTry(1) As Worksheet
    On Error Resume Next
    Set wsTry(0) = ThisWorkbook.Worksheets(SHEET_PAIR_TOOL)
    Set wsTry(1) = ThisWorkbook.Worksheets(SHEET_NETWORK)
    On Error GoTo 0

    Dim shp As Shape: Set shp = Nothing
    Dim foundWsName As String: foundWsName = ""
    Dim wi As Long
    For wi = 0 To 1
        If Not wsTry(wi) Is Nothing Then
            On Error Resume Next: Set shp = wsTry(wi).Shapes(trialName): On Error GoTo 0
            If Not shp Is Nothing Then
                foundWsName = wsTry(wi).Name
                Exit For
            End If
        End If
    Next wi
    If shp Is Nothing Then
        MsgBox "도형 못 찾음: " & trialName, vbExclamation, "도형 식별"
        Exit Sub
    End If

    Dim altT As String: altT = ""
    On Error Resume Next: altT = shp.AlternativeText: On Error GoTo 0
    Dim onAct As String: onAct = ""
    On Error Resume Next: onAct = shp.OnAction: On Error GoTo 0
    Dim lineRgb As Long: lineRgb = -1
    On Error Resume Next: lineRgb = shp.Line.ForeColor.RGB: On Error GoTo 0
    Dim fillRgb As Long: fillRgb = -1
    On Error Resume Next: fillRgb = shp.Fill.ForeColor.RGB: On Error GoTo 0
    Dim txt As String: txt = ""
    On Error Resume Next: txt = shp.TextFrame2.TextRange.Text: On Error GoTo 0

    Dim msg As String
    msg = "시트: " & foundWsName & vbLf & _
          "이름: " & shp.Name & vbLf & _
          "위치: Left=" & shp.Left & " · Top=" & shp.Top & vbLf & _
          "크기: W=" & shp.Width & " · H=" & shp.Height & vbLf & _
          "OnAction: " & IIf(Len(onAct) = 0, "(없음)", onAct) & vbLf & _
          "alt: " & IIf(Len(altT) = 0, "(없음)", altT) & vbLf & _
          "텍스트: " & IIf(Len(txt) = 0, "(없음)", txt) & vbLf & _
          "Line.RGB: " & lineRgb & vbLf & _
          "Fill.RGB: " & fillRgb
    MsgBox msg, vbInformation, "도형 식별"
End Sub

' owner 2026-06-06: 선택된 박스의 실제 여백 값 (pt + cm) 확인.
'   Excel UI 도형 속성 패널은 cm 단위, VBA 는 pt 단위. 단위 차이로 0.2pt = 0.007cm 가 「0 cm」 으로 반올림 표시되는 문제 확인용.
'   사용법: 박스 1개 클릭 → Alt+F8 → 선번박스_여백_확인 실행.
Public Sub 선번박스_여백_확인()
    Dim sel As Object: Set sel = Nothing
    On Error Resume Next: Set sel = Application.Selection: On Error GoTo 0

    Dim trialName As String: trialName = ""
    Dim trialShp As Shape: Set trialShp = Nothing
    If TypeName(sel) = "ShapeRange" Then
        If sel.Count >= 1 Then
            On Error Resume Next: trialName = sel(1).Name: On Error GoTo 0
        End If
    Else
        On Error Resume Next: trialName = sel.Name: On Error GoTo 0
    End If
    If Len(trialName) = 0 Then
        MsgBox "도형 1개 선택 후 실행하세요.", vbExclamation, "여백 확인"
        Exit Sub
    End If

    Dim ws As Worksheet: Set ws = ThisWorkbook.Worksheets(SHEET_NETWORK)
    On Error Resume Next: Set trialShp = ws.Shapes(trialName): On Error GoTo 0
    If trialShp Is Nothing Then
        MsgBox "캔버스에서 도형 못 찾음: " & trialName, vbExclamation, "여백 확인"
        Exit Sub
    End If

    Dim mL As Double, mR As Double, mT As Double, mB As Double
    On Error Resume Next
    mL = trialShp.TextFrame2.MarginLeft
    mR = trialShp.TextFrame2.MarginRight
    mT = trialShp.TextFrame2.MarginTop
    mB = trialShp.TextFrame2.MarginBottom
    On Error GoTo 0

    ' 1 pt = 1/72 inch = 2.54/72 cm = 0.03528 cm
    Const PT_TO_CM As Double = 0.0352778
    Dim msg As String
    msg = "도형: " & trialName & vbLf & vbLf & _
          "왼쪽 여백:   " & mL & " pt  (" & Format(mL * PT_TO_CM, "0.0000") & " cm)" & vbLf & _
          "오른쪽 여백: " & mR & " pt  (" & Format(mR * PT_TO_CM, "0.0000") & " cm)" & vbLf & _
          "위쪽 여백:   " & mT & " pt  (" & Format(mT * PT_TO_CM, "0.0000") & " cm)" & vbLf & _
          "아래쪽 여백: " & mB & " pt  (" & Format(mB * PT_TO_CM, "0.0000") & " cm)" & vbLf & vbLf & _
          "비고: VBA 단위 = pt. Excel UI 도형 속성 패널은 cm 으로 표시 → 0.2pt = 0.0071cm 이라 0 cm 으로 반올림 보임. 적용은 정상."
    MsgBox msg, vbInformation, "선번박스 여백 확인"
End Sub

' owner 2026-06-06: 모든 캔버스 선번박스 (PREFIX_PAIRBOX) 의 텍스트 여백 + 시설물박스 외곽선 색상 일괄 적용.
'   여백: 좌우 0.1 cm (= 2.83465 pt) · 상하 0.1 pt
'   색상: 시설물생성 박스 (alt 의 cbl=fac_ prefix) → 외곽선 검정. 단일생성 박스는 그대로.
'   시트_셀_클릭 이 silent=True 로 호출 — 빈셀 클릭 시 자동 적용. 기존 박스도 신규 spec 으로 통일.
Public Sub 선번박스_여백_0_1_일괄(Optional silent As Boolean = False)
    Dim ws As Worksheet: Set ws = ThisWorkbook.Worksheets(SHEET_NETWORK)
    If ws Is Nothing Then Exit Sub
    Dim sh As Shape, cnt As Long: cnt = 0
    For Each sh In ws.Shapes
        If Left(sh.Name, Len(PREFIX_PAIRBOX)) = PREFIX_PAIRBOX Then
            On Error Resume Next
            ' 좌우 0.1 cm = 2.83465 pt · 상하 0.1 pt
            With sh.TextFrame2
                .MarginLeft = 2.83465
                .MarginRight = 2.83465
                .MarginTop = 0.1
                .MarginBottom = 0.1
            End With
            ' 시설물생성 박스 (alt: cbl=fac_*) — 외곽선 검정 갱신
            Dim altT As String: altT = ""
            altT = sh.AlternativeText
            If InStr(altT, "cbl=" & PREFIX_FAC) > 0 Then
                sh.Line.ForeColor.RGB = 0
            End If
            On Error GoTo 0
            cnt = cnt + 1
        End If
    Next sh
    If Not silent Then
        MsgBox cnt & " 개 선번박스 여백·색상 적용 완료" & vbLf & _
               "(좌우 0.1 cm · 상하 0.1 pt · 시설물박스 외곽선 검정)", _
               vbInformation, "선번박스 여백·색상"
    End If
End Sub

' owner 2026-06-06: cable-cable 페어의 visible main 화살표 (alt: main=1|fac=|cblA=|cblB=) 일괄 재정렬.
'   디자인: 박스가 N 개 stack 되어도 visible main 1개만 — 「케이블과 가장 가까운」 (top-most, 가장 작은 Y) 박스 페어 사이.
'   stack 은 +Y 방향으로 cascade (8691·8694) — 첫 추가 박스가 가장 위 = 가장 케이블 가까움.
'   사용자가 top-most 박스를 이동하면 main 화살표가 자동 따라옴. 중간/맨 아래 박스 이동 시 main 위치 그대로 (chain 시각화 만 박스 stacking 으로).
'   2026-06-06 후속: L-shape 라우팅 (선번박스_경로_계산) 사용 — AddLine 직선 대신 케이블 평행 L-shape.
Public Sub 선번박스_케이블페어_main재정렬(ws As Worksheet)
    If ws Is Nothing Then Exit Sub
    Dim mainList As New Collection
    Dim sh As Shape, alt As String, i As Long
    For i = 1 To ws.Shapes.Count
        Set sh = ws.Shapes(i)
        If Left(sh.Name, Len(PREFIX_PAIRARROW)) = PREFIX_PAIRARROW Then
            alt = "": On Error Resume Next: alt = sh.AlternativeText: On Error GoTo 0
            ' main=1 + cblA= + cblB= (cable-cable 의 visible main)
            If InStr(alt, "main=1") > 0 And InStr(alt, "cblA=") > 0 And InStr(alt, "cblB=") > 0 Then
                ' fac= 가 cblA 또는 cblB 와 같으면 cable-facility (RN) → skip (이미 v3 spec 함수가 처리)
                Dim facV As String, aV As String, bV As String
                facV = AltParseField(alt, "fac=")
                aV = AltParseField(alt, "cblA=")
                bV = AltParseField(alt, "cblB=")
                If aV <> facV And bV <> facV Then
                    ' cable-cable
                    mainList.Add sh.Name
                End If
            End If
        End If
    Next i

    Dim mi As Long
    For mi = 1 To mainList.Count
        Dim mNm As String: mNm = mainList(mi)
        Dim mShp As Shape: Set mShp = Nothing
        On Error Resume Next: Set mShp = ws.Shapes(mNm): On Error GoTo 0
        If mShp Is Nothing Then GoTo NextMain
        Dim mAlt As String: mAlt = ""
        On Error Resume Next: mAlt = mShp.AlternativeText: On Error GoTo 0
        Dim mFac As String, mA As String, mB As String
        mFac = AltParseField(mAlt, "fac=")
        mA = AltParseField(mAlt, "cblA=")
        mB = AltParseField(mAlt, "cblB=")
        If Len(mFac) = 0 Or Len(mA) = 0 Or Len(mB) = 0 Then GoTo NextMain

        ' fac=mFac + cbl=mA 인 박스 중 bottom-most 찾기
        Dim botABox As Shape: Set botABox = Nothing
        Dim botBBox As Shape: Set botBBox = Nothing
        Dim shB As Shape, altB As String
        For Each shB In ws.Shapes
            If Left(shB.Name, Len(PREFIX_PAIRBOX)) = PREFIX_PAIRBOX Then
                altB = "": On Error Resume Next: altB = shB.AlternativeText: On Error GoTo 0
                If InStr(altB, "fac=" & mFac) > 0 Then
                    If InStr(altB, "cbl=" & mA) > 0 Then
                        If botABox Is Nothing Then
                            Set botABox = shB
                        ElseIf shB.Top > botABox.Top Then
                            Set botABox = shB
                        End If
                    ElseIf InStr(altB, "cbl=" & mB) > 0 Then
                        If botBBox Is Nothing Then
                            Set botBBox = shB
                        ElseIf shB.Top > botBBox.Top Then
                            Set botBBox = shB
                        End If
                    End If
                End If
            End If
        Next shB

        If botABox Is Nothing Or botBBox Is Nothing Then GoTo NextMain

        ' 새 위치로 main 화살표 재생성
        Dim mx1 As Double, my1 As Double, mx2 As Double, my2 As Double
        mx1 = botABox.Left + botABox.Width / 2
        my1 = botABox.Top + botABox.Height / 2
        mx2 = botBBox.Left + botBBox.Width / 2
        my2 = botBBox.Top + botBBox.Height / 2

        On Error Resume Next: mShp.Delete: On Error GoTo 0
        Dim newM As Shape
        On Error Resume Next
        Set newM = ws.Shapes.AddLine(mx1, my1, mx2, my2)
        On Error GoTo 0
        If Not newM Is Nothing Then
            newM.Name = mNm
            newM.OnAction = ""
            newM.Placement = 3
            On Error Resume Next
            newM.AlternativeText = mAlt
            With newM.Line
                .ForeColor.RGB = 0
                .Weight = 0.5
                .DashStyle = msoLineRoundDot
                .BeginArrowheadStyle = msoArrowheadTriangle
                .EndArrowheadStyle = msoArrowheadTriangle
            End With
            newM.ZOrder msoBringToFront
            On Error GoTo 0
        End If
NextMain:
    Next mi
End Sub

' owner 2026-06-06: cable-cable 페어 재정렬 — anchor + 같은 짝의 visible main 화살표 둘 다 박스 중심 따라가게 재생성.
'   anchor: alt 에 box1=|box2=, 이름 "_pt_arrow_xxxx_anchor"
'   visible main: alt 에 main=1, 이름 "_pt_arrow_xxxx" (anchor 이름에서 "_anchor" 접미사 제거)
Public Sub 선번박스_케이블페어_재정렬(ws As Worksheet, anchorShp As Shape, box1 As Shape, box2 As Shape)
    If anchorShp Is Nothing Or box1 Is Nothing Or box2 Is Nothing Then Exit Sub

    Dim oldAnchorName As String: oldAnchorName = anchorShp.Name
    Dim oldAnchorAlt As String: oldAnchorAlt = ""
    On Error Resume Next: oldAnchorAlt = anchorShp.AlternativeText: On Error GoTo 0

    Dim x1 As Double, y1 As Double, x2 As Double, y2 As Double
    x1 = box1.Left + box1.Width / 2
    y1 = box1.Top + box1.Height / 2
    x2 = box2.Left + box2.Width / 2
    y2 = box2.Top + box2.Height / 2

    ' 1) anchor 재생성 (invisible 직선)
    On Error Resume Next: anchorShp.Delete: On Error GoTo 0
    Dim newAnchor As Shape
    On Error Resume Next
    Set newAnchor = ws.Shapes.AddLine(x1, y1, x2, y2)
    On Error GoTo 0
    If Not newAnchor Is Nothing Then
        newAnchor.Name = oldAnchorName
        newAnchor.OnAction = ""
        newAnchor.Placement = 3
        On Error Resume Next
        newAnchor.AlternativeText = oldAnchorAlt
        With newAnchor.Line
            .Visible = msoFalse
            .Transparency = 1
            .Weight = 0.25
            .DashStyle = msoLineSolid
        End With
        On Error GoTo 0
    End If

    ' 2) visible main 화살표 재생성 — 이름 = anchor 이름에서 "_anchor" 제거
    If Right(oldAnchorName, 7) = "_anchor" Then
        Dim mainArrName As String: mainArrName = Left(oldAnchorName, Len(oldAnchorName) - 7)
        Dim mainShp As Shape: Set mainShp = Nothing
        On Error Resume Next: Set mainShp = ws.Shapes(mainArrName): On Error GoTo 0
        If Not mainShp Is Nothing Then
            Dim mainAlt As String: mainAlt = ""
            On Error Resume Next: mainAlt = mainShp.AlternativeText: On Error GoTo 0
            On Error Resume Next: mainShp.Delete: On Error GoTo 0

            Dim newMain As Shape
            On Error Resume Next
            Set newMain = ws.Shapes.AddLine(x1, y1, x2, y2)
            On Error GoTo 0
            If Not newMain Is Nothing Then
                newMain.Name = mainArrName
                newMain.OnAction = ""
                newMain.Placement = 3
                On Error Resume Next
                newMain.AlternativeText = mainAlt
                With newMain.Line
                    .ForeColor.RGB = 0
                    .Weight = 0.5
                    .DashStyle = msoLineRoundDot
                    .BeginArrowheadStyle = msoArrowheadTriangle
                    .BeginArrowheadLength = msoArrowheadShort
                    .BeginArrowheadWidth = msoArrowheadNarrow
                    .EndArrowheadStyle = msoArrowheadTriangle
                    .EndArrowheadLength = msoArrowheadShort
                    .EndArrowheadWidth = msoArrowheadNarrow
                End With
                newMain.ZOrder msoBringToFront
                On Error GoTo 0
            End If
        End If
    End If
End Sub

' owner 2026-06-06 v3: 시설물 페어 화살표 일괄 재정렬 — 박스 이동 후 빈셀 클릭 시 자동 재정렬.
'   cable-cable (접속함체) 페어는 다른 시스템이 처리 — 이 함수는 cable-facility (시설물 내부 연결, RN 포함) 만.
'   동작: 모든 PREFIX_PAIRARROW 도형 검사 → box1/box2 alt 추출 → 한쪽이 fac_ prefix 면 cable-facility → 새 spec 재계산.
'   삭제 후 재생성 (Freeform 좌표 직접 수정 불가).
Public Sub 페어화살표_시설물페어_재정렬(ws As Worksheet)
    If ws Is Nothing Then Exit Sub

    ' owner 2026-06-06 후속 (8-22): cable-cable 페어당 visible main 1개 디자인 — 그룹 단위로만 처리.
    '   1. anchor 를 (fac, kA, kB) 키로 그룹핑 — 다른 cable 페어 절대 안 건드림 (owner 강조)
    '   2. main 정리 — 단일 그룹은 모든 main 삭제 (anchor 자체가 visible), 다중 그룹은 1개 keep candidate
    '   3. 메인 루프 cable-cable 분기에서 그룹 크기에 따라 visible/invisible 분기
    '   4. 사후 — 다중 그룹 마다 visible main 보장 (topABox↔topBBox L-shape)
    '   cable-facility (cblA=fac 또는 cblB=fac) 는 그룹핑 제외 — v3 spec 함수가 별도 처리
    '   anchor 메타 (box1=|box2=) 는 항상 보존 — Phase 2 매핑 + 미래 코어 추적용

    ' --- 사전 그룹핑 ---
    '   ccGroupSize(key) = anchor 개수
    '   ccGroupAnchors(key) = "name1`name2`..." (백틱 join)
    '   ccGroupMeta(key) = "fac|cblA|cblB" (sorted)
    Dim ccGroupSize As Object: Set ccGroupSize = CreateObject("Scripting.Dictionary")
    Dim ccGroupAnchors As Object: Set ccGroupAnchors = CreateObject("Scripting.Dictionary")
    Dim ccGroupMeta As Object: Set ccGroupMeta = CreateObject("Scripting.Dictionary")
    Dim ccAnchorKey As Object: Set ccAnchorKey = CreateObject("Scripting.Dictionary")    ' anchor name → group key
    Dim hubCache As Object: Set hubCache = CreateObject("Scripting.Dictionary")          ' facId → 케이블 수 (owner 2026-06-11: 3방향+ 허브 V자 라우팅)

    Dim shPre As Shape, altPre As String
    For Each shPre In ws.Shapes
        If Left(shPre.Name, Len(PREFIX_PAIRARROW)) = PREFIX_PAIRARROW Then
            altPre = "": On Error Resume Next: altPre = shPre.AlternativeText: On Error GoTo 0
            If InStr(altPre, "box1=") > 0 And InStr(altPre, "box2=") > 0 Then
                Dim preB1 As String, preB2 As String
                preB1 = AltParseField(altPre, "box1=")
                preB2 = AltParseField(altPre, "box2=")
                If Len(preB1) > 0 And Len(preB2) > 0 Then
                    Dim preB1Shp As Shape, preB2Shp As Shape
                    Set preB1Shp = Nothing: Set preB2Shp = Nothing
                    On Error Resume Next
                    Set preB1Shp = ws.Shapes(preB1): Set preB2Shp = ws.Shapes(preB2)
                    On Error GoTo 0
                    If Not preB1Shp Is Nothing And Not preB2Shp Is Nothing Then
                        Dim preAlt1 As String, preAlt2 As String
                        preAlt1 = "": preAlt2 = ""
                        On Error Resume Next
                        preAlt1 = preB1Shp.AlternativeText: preAlt2 = preB2Shp.AlternativeText
                        On Error GoTo 0
                        Dim preFac As String, preC1 As String, preC2 As String
                        preFac = AltParseField(preAlt1, "fac=")
                        If Len(preFac) = 0 Then preFac = AltParseField(preAlt2, "fac=")
                        preC1 = AltParseField(preAlt1, "cbl=")
                        preC2 = AltParseField(preAlt2, "cbl=")
                        ' cable-cable 만 — 양쪽 cbl 모두 fac_ prefix 아님
                        If Len(preFac) > 0 And Len(preC1) > 0 And Len(preC2) > 0 Then
                            If Left(preC1, Len(PREFIX_FAC)) <> PREFIX_FAC And _
                               Left(preC2, Len(PREFIX_FAC)) <> PREFIX_FAC Then
                                Dim preKA As String, preKB As String
                                If preC1 < preC2 Then preKA = preC1: preKB = preC2 Else preKA = preC2: preKB = preC1
                                Dim preKey As String: preKey = preFac & "|" & preKA & "|" & preKB
                                If ccGroupSize.Exists(preKey) Then
                                    ccGroupSize(preKey) = ccGroupSize(preKey) + 1
                                    ccGroupAnchors(preKey) = ccGroupAnchors(preKey) & "`" & shPre.Name
                                Else
                                    ccGroupSize(preKey) = 1
                                    ccGroupAnchors(preKey) = shPre.Name
                                    ccGroupMeta(preKey) = preFac & "|" & preKA & "|" & preKB
                                End If
                                ccAnchorKey(shPre.Name) = preKey
                            End If
                        End If
                    End If
                End If
            End If
        End If
    Next shPre

    ' --- main 정리 (cable-cable 만) ---
    '   각 그룹의 main 개수 카운트 → 다중 그룹은 1개 keep, 단일 그룹은 모두 삭제 (anchor 가 visible)
    Dim ccGroupKeptMain As Object: Set ccGroupKeptMain = CreateObject("Scripting.Dictionary")    ' key → main name (keep candidate)
    Dim ccMainsDel As New Collection
    Dim shMm As Shape, altMm As String
    For Each shMm In ws.Shapes
        If Left(shMm.Name, Len(PREFIX_PAIRARROW)) = PREFIX_PAIRARROW Then
            altMm = "": On Error Resume Next: altMm = shMm.AlternativeText: On Error GoTo 0
            If InStr(altMm, "main=1") > 0 And InStr(altMm, "cblA=") > 0 And InStr(altMm, "cblB=") > 0 Then
                Dim mFc As String, mAa As String, mBb As String
                mFc = AltParseField(altMm, "fac=")
                mAa = AltParseField(altMm, "cblA=")
                mBb = AltParseField(altMm, "cblB=")
                ' cable-cable 만 (RN 의 main=1 은 보존)
                If mAa <> mFc And mBb <> mFc Then
                    Dim mKA As String, mKB As String
                    If mAa < mBb Then mKA = mAa: mKB = mBb Else mKA = mBb: mKB = mAa
                    Dim mKey As String: mKey = mFc & "|" & mKA & "|" & mKB
                    If ccGroupSize.Exists(mKey) Then
                        If ccGroupSize(mKey) >= 2 Then
                            ' 다중 그룹 — 첫 main 만 keep, 나머지 삭제
                            If Not ccGroupKeptMain.Exists(mKey) Then
                                ccGroupKeptMain(mKey) = shMm.Name
                            Else
                                ccMainsDel.Add shMm.Name
                            End If
                        Else
                            ' 단일 그룹 — anchor 가 visible 책임, main 은 leftover 라 삭제
                            ccMainsDel.Add shMm.Name
                        End If
                    Else
                        ' 그룹에 매치되는 anchor 없음 (orphan main) → 삭제
                        ccMainsDel.Add shMm.Name
                    End If
                End If
            End If
        End If
    Next shMm
    Dim mDi As Long
    For mDi = 1 To ccMainsDel.Count
        On Error Resume Next: ws.Shapes(ccMainsDel(mDi)).Delete: On Error GoTo 0
    Next mDi

    ' 1차 검색 — 후보 모으기 (재정렬 중 shape index 변경 회피)
    Dim cands As New Collection
    Dim sh As Shape, i As Long
    For i = 1 To ws.Shapes.Count
        Set sh = ws.Shapes(i)
        If Left(sh.Name, Len(PREFIX_PAIRARROW)) = PREFIX_PAIRARROW Then
            Dim alt As String: alt = ""
            On Error Resume Next: alt = sh.AlternativeText: On Error GoTo 0
            If InStr(alt, "box1=") > 0 And InStr(alt, "box2=") > 0 Then
                cands.Add sh.Name
            End If
        End If
    Next i

    ' 2차 처리 — 각 후보별 box1/box2 + cable shape 식별 + 재생성
    Dim ci As Long
    For ci = 1 To cands.Count
        Dim arrName As String: arrName = cands(ci)
        Dim arrShp As Shape: Set arrShp = Nothing
        On Error Resume Next: Set arrShp = ws.Shapes(arrName): On Error GoTo 0
        If arrShp Is Nothing Then GoTo NextCand
        Dim alt2 As String: alt2 = ""
        On Error Resume Next: alt2 = arrShp.AlternativeText: On Error GoTo 0

        Dim box1Name As String, box2Name As String
        box1Name = AltParseField(alt2, "box1=")
        box2Name = AltParseField(alt2, "box2=")
        If Len(box1Name) = 0 Or Len(box2Name) = 0 Then GoTo NextCand

        Dim box1 As Shape, box2 As Shape
        Set box1 = Nothing: Set box2 = Nothing
        On Error Resume Next
        Set box1 = ws.Shapes(box1Name)
        Set box2 = ws.Shapes(box2Name)
        On Error GoTo 0
        If box1 Is Nothing Or box2 Is Nothing Then GoTo NextCand

        ' box alt 에서 cbl= 추출 (cblBox 의 cbl=cableId / rnBox 의 cbl=facId)
        Dim alt1Box As String, alt2Box As String
        alt1Box = "": alt2Box = ""
        On Error Resume Next
        alt1Box = box1.AlternativeText
        alt2Box = box2.AlternativeText
        On Error GoTo 0
        Dim cblTag1 As String, cblTag2 As String
        cblTag1 = AltParseField(alt1Box, "cbl=")
        cblTag2 = AltParseField(alt2Box, "cbl=")

        ' 한쪽이 fac_ prefix 면 cable-facility 페어 — cable shape 식별 + 위치 재정렬 후 path 재계산
        Dim hasFac As Boolean: hasFac = False
        Dim cableShpName As String: cableShpName = ""
        Dim facIdRA As String: facIdRA = ""
        Dim cblBoxRA As Shape, rnBoxRA As Shape
        Set cblBoxRA = Nothing: Set rnBoxRA = Nothing
        If Left(cblTag1, Len(PREFIX_FAC)) = PREFIX_FAC Then
            hasFac = True: cableShpName = cblTag2: facIdRA = cblTag1
            Set rnBoxRA = box1: Set cblBoxRA = box2
        ElseIf Left(cblTag2, Len(PREFIX_FAC)) = PREFIX_FAC Then
            hasFac = True: cableShpName = cblTag1: facIdRA = cblTag2
            Set rnBoxRA = box2: Set cblBoxRA = box1
        End If
        If Not hasFac Then
            ' owner 2026-06-06 (8-22): cable-cable 페어 — 그룹 크기에 따라 visible/invisible 분기.
            '   단일 그룹 (anchor 1개) — anchor 자체를 visible 로 (8-19 동작 그대로, 변경 없음).
            '   다중 그룹 (anchor 2 이상, cascade) — anchor 는 invisible 메타 보존. visible main 1개는 사후 처리에서 별도 생성.
            Dim ccGrpKey As String: ccGrpKey = ""
            If ccAnchorKey.Exists(arrShp.Name) Then ccGrpKey = ccAnchorKey(arrShp.Name)
            Dim ccGrpSize As Long: ccGrpSize = 1
            If Len(ccGrpKey) > 0 Then
                If ccGroupSize.Exists(ccGrpKey) Then ccGrpSize = ccGroupSize(ccGrpKey)
            End If

            ' 미이동 skip (bbox 거의 같으면 도형 손 안 댐)
            Dim ccArr_L As Double, ccArr_T As Double, ccArr_R As Double, ccArr_B As Double
            ccArr_L = arrShp.Left
            ccArr_T = arrShp.Top
            ccArr_R = arrShp.Left + arrShp.Width
            ccArr_B = arrShp.Top + arrShp.Height
            Dim ccBox_L As Double, ccBox_T As Double, ccBox_R As Double, ccBox_B As Double
            Dim b1cx As Double, b1cy As Double, b2cx As Double, b2cy As Double
            b1cx = box1.Left + box1.Width / 2
            b1cy = box1.Top + box1.Height / 2
            b2cx = box2.Left + box2.Width / 2
            b2cy = box2.Top + box2.Height / 2
            If b1cx < b2cx Then ccBox_L = b1cx Else ccBox_L = b2cx
            If b1cy < b2cy Then ccBox_T = b1cy Else ccBox_T = b2cy
            If b1cx > b2cx Then ccBox_R = b1cx Else ccBox_R = b2cx
            If b1cy > b2cy Then ccBox_B = b1cy Else ccBox_B = b2cy
            Dim ccSkipBbox As Boolean
            ccSkipBbox = (Abs(ccArr_L - ccBox_L) < 1 And Abs(ccArr_T - ccBox_T) < 1 And _
                          Abs(ccArr_R - ccBox_R) < 1 And Abs(ccArr_B - ccBox_B) < 1)

            Dim ccFacId As String, ccCblA As String, ccCblB As String
            ccFacId = AltParseField(alt1Box, "fac=")
            If Len(ccFacId) = 0 Then ccFacId = AltParseField(alt2Box, "fac=")
            ccCblA = cblTag1: ccCblB = cblTag2

            Dim ccFacShp As Shape: Set ccFacShp = Nothing
            If Len(ccFacId) > 0 Then
                On Error Resume Next: Set ccFacShp = ws.Shapes(ccFacId): On Error GoTo 0
            End If

            ' 메타 백업 (visible/invisible 양쪽에서 사용)
            Dim ccOldName As String: ccOldName = arrShp.Name
            Dim ccOldAlt As String: ccOldAlt = alt2

            If ccGrpSize >= 2 Then
                ' === 다중 그룹 — anchor invisible (메타 보존, 시각만 숨김) ===
                ' anchor 가 이미 invisible (Line + Shape 양쪽) 이고 bbox 가 박스와 맞으면 skip.
                ' owner 2026-06-06 (8-25): Shape.Visible 도 체크 — 옛 파일 (Line 만 hidden) 은 강제 재생성 → 마퀴 선택 차단.
                Dim ccAlreadyHidden As Boolean: ccAlreadyHidden = False
                Dim ccShapeHidden As Boolean: ccShapeHidden = False
                On Error Resume Next
                ccAlreadyHidden = (arrShp.Line.Visible = msoFalse)
                ccShapeHidden = (arrShp.Visible = msoFalse)
                On Error GoTo 0
                If ccAlreadyHidden And ccShapeHidden And ccSkipBbox Then GoTo NextCand

                On Error Resume Next: arrShp.Delete: On Error GoTo 0
                Dim ccHide As Shape: Set ccHide = Nothing
                On Error Resume Next
                Set ccHide = ws.Shapes.AddLine(b1cx, b1cy, b2cx, b2cy)
                On Error GoTo 0
                If Not ccHide Is Nothing Then
                    ccHide.Name = ccOldName
                    ccHide.OnAction = ""
                    ccHide.Placement = 3
                    On Error Resume Next
                    ccHide.AlternativeText = ccOldAlt
                    With ccHide.Line
                        .Visible = msoFalse
                        .Transparency = 1
                        .Weight = 0.25
                        .DashStyle = msoLineSolid
                    End With
                    ' owner 2026-06-06 (8-25): Shape.Visible=msoFalse 로 마퀴/클릭 선택 차단.
                    ccHide.Visible = msoFalse
                    On Error GoTo 0
                End If
                GoTo NextCand
            End If

            ' === 단일 그룹 — anchor 자체를 visible (8-19 동작) ===
            If ccSkipBbox Then GoTo NextCand
            If ccFacShp Is Nothing Then GoTo NextCand            ' facility 못 찾으면 skip — anchor 그대로 두기

            ' 원본 path 계산 — 케이블 방향 따라 L-shape 또는 직선 자동 선택
            ' owner 2026-06-11: 3방향+ 허브는 V자(박스→시설물 중심→박스) — 방사선끼리 교차 불가 (화살표 교차 최소화, owner 첨부)
            Dim ccPts As Variant
            If Not hubCache.Exists(ccFacId) Then hubCache(ccFacId) = 선번박스_허브_케이블수(ws, ccFacId)
            If CLng(hubCache(ccFacId)) >= 3 Then
                ccPts = 선번박스_경로_V(box1, box2, ccFacShp)
            Else
                ccPts = 선번박스_경로_계산(ws, "cable", ccCblA, box1, "cable", ccCblB, box2, ccFacShp)
            End If

            On Error Resume Next: arrShp.Delete: On Error GoTo 0

            ' 새 visible 화살표 — 화살표생성 헬퍼가 freeform multi-segment 처리
            Dim ccNewArr As Shape: Set ccNewArr = Nothing
            On Error Resume Next
            Set ccNewArr = 선번박스_화살표생성(ws, ccPts)
            On Error GoTo 0
            If ccNewArr Is Nothing Then
                ' fallback — AddLine 직선
                On Error Resume Next
                Set ccNewArr = ws.Shapes.AddLine(b1cx, b1cy, b2cx, b2cy)
                On Error GoTo 0
            End If
            If Not ccNewArr Is Nothing Then
                ccNewArr.Name = ccOldName
                ccNewArr.OnAction = ""
                ccNewArr.Placement = 3
                On Error Resume Next
                ccNewArr.AlternativeText = ccOldAlt
                With ccNewArr.Line
                    .ForeColor.RGB = 0
                    .Weight = 0.5
                    .DashStyle = msoLineRoundDot
                    .BeginArrowheadStyle = msoArrowheadTriangle
                    .BeginArrowheadLength = msoArrowheadShort
                    .BeginArrowheadWidth = msoArrowheadNarrow
                    .EndArrowheadStyle = msoArrowheadTriangle
                    .EndArrowheadLength = msoArrowheadShort
                    .EndArrowheadWidth = msoArrowheadNarrow
                End With
                ccNewArr.ZOrder msoBringToFront
                On Error GoTo 0
                box1.ZOrder msoBringToFront
                box2.ZOrder msoBringToFront
            End If
            GoTo NextCand
        End If

        Dim cableShp As Shape: Set cableShp = Nothing
        On Error Resume Next: Set cableShp = ws.Shapes(cableShpName): On Error GoTo 0
        If cableShp Is Nothing Then GoTo NextCand

        ' owner 2026-06-06 v4 + swap: rnBox 가 facility 가까이, cblBox 가 멀리.
        '   재정렬 시 anchor = rnBox 의 현재 위치 (facility 쪽) 유지, cblBox 만 cable 방향 재배치.
        Dim facShpRA As Shape: Set facShpRA = Nothing
        On Error Resume Next: Set facShpRA = ws.Shapes(facIdRA): On Error GoTo 0
        If Not facShpRA Is Nothing Then
            Dim fcxRA As Double, fcyRA As Double
            fcxRA = facShpRA.Left + facShpRA.Width / 2
            fcyRA = facShpRA.Top + facShpRA.Height / 2
            Dim caxRA As Double, cayRA As Double, cbxRA As Double, cbyRA As Double
            GetLineEndpoints cableShp, caxRA, cayRA, cbxRA, cbyRA
            Dim dAARA As Double, dBBRA As Double
            dAARA = (caxRA - fcxRA) * (caxRA - fcxRA) + (cayRA - fcyRA) * (cayRA - fcyRA)
            dBBRA = (cbxRA - fcxRA) * (cbxRA - fcxRA) + (cbyRA - fcyRA) * (cbyRA - fcyRA)
            Dim farXRA As Double, farYRA As Double
            If dAARA > dBBRA Then farXRA = caxRA: farYRA = cayRA Else farXRA = cbxRA: farYRA = cbyRA
            Dim uvxRA As Double, uvyRA As Double
            uvxRA = farXRA - fcxRA: uvyRA = farYRA - fcyRA
            Dim uvlenRA As Double: uvlenRA = Sqr(uvxRA * uvxRA + uvyRA * uvyRA)
            If uvlenRA < 0.001 Then uvxRA = 1: uvyRA = 0: uvlenRA = 1
            Dim ucxRA As Double, ucyRA As Double
            ucxRA = uvxRA / uvlenRA: ucyRA = uvyRA / uvlenRA
            ' owner 2026-06-10 「간격 기억」 — 28pt 고정 대신 현재 간격(케이블 방향 투영)을 유지하고 방향만 재정렬.
            '   드래그로 늘린 간격·줌이 스케일한 간격이 셀클릭 후에도 유지. 겹침 방지 최소 간격만 강제.
            '   ※ 복원 방법: cdRA 계산을 「cdRA = extARA + extBRA + PAIR_GAP_RA」 로 바꾸면 옛(28pt 고정) 동작. (변경 전 = 커밋 98a88d0)
            Const PAIR_GAP_RA As Double = 28          ' (복원용 보존 — 간격 기억 방식에선 미사용)
            ' anchor = rnBox 현재 위치 (facility 쪽)
            Dim anchorXRA As Double, anchorYRA As Double
            anchorXRA = rnBoxRA.Left + rnBoxRA.Width / 2
            anchorYRA = rnBoxRA.Top + rnBoxRA.Height / 2
            Dim extARA As Double, extBRA As Double
            extARA = (rnBoxRA.Width / 2) * Abs(ucxRA) + (rnBoxRA.Height / 2) * Abs(ucyRA)
            extBRA = (cblBoxRA.Width / 2) * Abs(ucxRA) + (cblBoxRA.Height / 2) * Abs(ucyRA)
            Dim minGapRA As Double: minGapRA = extARA + extBRA + 8
            Dim curProjRA As Double
            curProjRA = ((cblBoxRA.Left + cblBoxRA.Width / 2) - anchorXRA) * ucxRA + _
                        ((cblBoxRA.Top + cblBoxRA.Height / 2) - anchorYRA) * ucyRA
            Dim cdRA As Double: cdRA = curProjRA
            If cdRA < minGapRA Then cdRA = minGapRA
            Dim newLRA As Double, newTRA As Double
            newLRA = (anchorXRA + ucxRA * cdRA) - cblBoxRA.Width / 2
            newTRA = (anchorYRA + ucyRA * cdRA) - cblBoxRA.Height / 2
            If Abs(newLRA - cblBoxRA.Left) > 0.5 Or Abs(newTRA - cblBoxRA.Top) > 0.5 Then
                On Error Resume Next
                cblBoxRA.Left = newLRA
                cblBoxRA.Top = newTRA
                AltSetLastPos cblBoxRA, cblBoxRA.Left, cblBoxRA.Top   ' 재정렬 이동을 다음 클릭 chain 평행이동이 「드래그」로 오인 방지
                On Error GoTo 0
            End If
        End If

        ' 새 spec 으로 좌표 재계산 (위치 재정렬 후)
        Dim newPts As Variant
        newPts = 선번박스_경로_시설물페어(cableShp, box1, box2)

        ' 기존 화살표 메타 백업 + 삭제
        Dim oldName As String, oldAlt As String
        oldName = arrShp.Name: oldAlt = alt2
        On Error Resume Next: arrShp.Delete: On Error GoTo 0

        ' 새 화살표 생성 — 이름·alt·스타일 복원
        Dim newArr As Shape: Set newArr = Nothing
        On Error Resume Next
        Set newArr = 선번박스_화살표생성(ws, newPts)
        On Error GoTo 0
        If newArr Is Nothing Then GoTo NextCand
        On Error Resume Next
        newArr.Name = oldName
        newArr.OnAction = ""
        newArr.Placement = 3
        newArr.AlternativeText = oldAlt
        With newArr.Line
            .ForeColor.RGB = 0
            .Weight = 0.5
            .DashStyle = msoLineRoundDot
            ' owner 2026-06-06 보정: 양쪽 끝 모두 화살표 머리 + Short/Narrow
            .BeginArrowheadStyle = msoArrowheadTriangle
            .BeginArrowheadLength = msoArrowheadShort
            .BeginArrowheadWidth = msoArrowheadNarrow
            .EndArrowheadStyle = msoArrowheadTriangle
            .EndArrowheadLength = msoArrowheadShort
            .EndArrowheadWidth = msoArrowheadNarrow
        End With
        newArr.ZOrder msoBringToFront
        box1.ZOrder msoBringToFront
        box2.ZOrder msoBringToFront
        On Error GoTo 0
NextCand:
    Next ci

    ' === 사후 처리 — 다중 그룹마다 visible main 1개 보장 ===
    '   cblA 측 박스 중 facility 가장 가까운 + cblB 측 박스 중 facility 가장 가까운 → 그 두 박스 사이 L-shape
    '   기존 keep candidate main 있으면 reposition, 없으면 새로 생성
    Dim gKey As Variant
    For Each gKey In ccGroupSize.Keys
        If ccGroupSize(gKey) >= 2 Then
            Dim gMeta As String: gMeta = ccGroupMeta(gKey)
            Dim gParts() As String: gParts = Split(gMeta, "|")
            If UBound(gParts) >= 2 Then
                Dim gFac As String, gCA As String, gCB As String
                gFac = gParts(0): gCA = gParts(1): gCB = gParts(2)

                Dim gFacShp As Shape: Set gFacShp = Nothing
                On Error Resume Next: Set gFacShp = ws.Shapes(gFac): On Error GoTo 0
                If Not gFacShp Is Nothing Then
                    Dim gFcx As Double, gFcy As Double
                    gFcx = gFacShp.Left + gFacShp.Width / 2
                    gFcy = gFacShp.Top + gFacShp.Height / 2

                    ' owner 2026-06-06 (8-24): 이 그룹의 anchor 가 가리키는 박스만 대상 — 다른 페어 박스 절대 안 섞임.
                    '   ccGroupAnchors(gKey) = "anchorName1`anchorName2`..." (백틱 join, 사전 그룹핑에서 저장됨)
                    '   각 anchor 의 box1/box2 alt → 이 그룹 박스 집합 구성
                    Dim gBoxSet As Object: Set gBoxSet = CreateObject("Scripting.Dictionary")
                    Dim anchorsStr As String: anchorsStr = CStr(ccGroupAnchors(CStr(gKey)))
                    Dim anchorNames() As String: anchorNames = Split(anchorsStr, "`")
                    Dim aI As Long
                    For aI = 0 To UBound(anchorNames)
                        Dim aNm As String: aNm = anchorNames(aI)
                        If Len(aNm) > 0 Then
                            Dim aShp As Shape: Set aShp = Nothing
                            On Error Resume Next: Set aShp = ws.Shapes(aNm): On Error GoTo 0
                            If Not aShp Is Nothing Then
                                Dim aAlt As String: aAlt = ""
                                On Error Resume Next: aAlt = aShp.AlternativeText: On Error GoTo 0
                                Dim aBox1 As String, aBox2 As String
                                aBox1 = AltParseField(aAlt, "box1=")
                                aBox2 = AltParseField(aAlt, "box2=")
                                If Len(aBox1) > 0 Then gBoxSet(aBox1) = True
                                If Len(aBox2) > 0 Then gBoxSet(aBox2) = True
                            End If
                        End If
                    Next aI

                    ' cblA / cblB 측 박스 중 facility 가장 가까운 박스 찾기 (anchor 박스 set 내에서만)
                    Dim gTopA As Shape: Set gTopA = Nothing
                    Dim gTopB As Shape: Set gTopB = Nothing
                    Dim gMinA As Double: gMinA = 1E+30
                    Dim gMinB As Double: gMinB = 1E+30
                    Dim gBxKey As Variant
                    For Each gBxKey In gBoxSet.Keys
                        Dim gShpB As Shape: Set gShpB = Nothing
                        On Error Resume Next: Set gShpB = ws.Shapes(CStr(gBxKey)): On Error GoTo 0
                        If Not gShpB Is Nothing Then
                            Dim gAltB As String: gAltB = ""
                            On Error Resume Next: gAltB = gShpB.AlternativeText: On Error GoTo 0
                            Dim gCbl As String: gCbl = AltParseField(gAltB, "cbl=")
                            If gCbl = gCA Or gCbl = gCB Then
                                Dim gBcx As Double, gBcy As Double
                                gBcx = gShpB.Left + gShpB.Width / 2
                                gBcy = gShpB.Top + gShpB.Height / 2
                                Dim gDist As Double
                                gDist = (gBcx - gFcx) * (gBcx - gFcx) + (gBcy - gFcy) * (gBcy - gFcy)
                                If gCbl = gCA Then
                                    If gDist < gMinA Then
                                        gMinA = gDist
                                        Set gTopA = gShpB
                                    End If
                                Else
                                    If gDist < gMinB Then
                                        gMinB = gDist
                                        Set gTopB = gShpB
                                    End If
                                End If
                            End If
                        End If
                    Next gBxKey

                    If Not gTopA Is Nothing And Not gTopB Is Nothing Then
                        ' L-shape path 계산 — 케이블 방향에 평행한 L
                        ' owner 2026-06-11: 3방향+ 허브는 V자 (single anchor 와 동일 규칙)
                        Dim gPts As Variant
                        If Not hubCache.Exists(gFac) Then hubCache(gFac) = 선번박스_허브_케이블수(ws, gFac)
                        If CLng(hubCache(gFac)) >= 3 Then
                            gPts = 선번박스_경로_V(gTopA, gTopB, gFacShp)
                        Else
                            gPts = 선번박스_경로_계산(ws, "cable", gCA, gTopA, "cable", gCB, gTopB, gFacShp)
                        End If

                        ' 기존 keep candidate main 있으면 삭제 + 재생성 (path 갱신)
                        Dim gMainName As String: gMainName = ""
                        Dim gMainAlt As String: gMainAlt = ""
                        If ccGroupKeptMain.Exists(CStr(gKey)) Then
                            gMainName = ccGroupKeptMain(CStr(gKey))
                            Dim gOldMain As Shape: Set gOldMain = Nothing
                            On Error Resume Next: Set gOldMain = ws.Shapes(gMainName): On Error GoTo 0
                            If Not gOldMain Is Nothing Then
                                On Error Resume Next: gMainAlt = gOldMain.AlternativeText: On Error GoTo 0
                                On Error Resume Next: gOldMain.Delete: On Error GoTo 0
                            End If
                        End If
                        If Len(gMainName) = 0 Then gMainName = PREFIX_PAIRARROW & NewId8()
                        If Len(gMainAlt) = 0 Then
                            gMainAlt = "main=1|fac=" & gFac & "|cblA=" & gCA & "|cblB=" & gCB
                        End If

                        Dim gNewMain As Shape: Set gNewMain = Nothing
                        On Error Resume Next
                        Set gNewMain = 선번박스_화살표생성(ws, gPts)
                        On Error GoTo 0
                        If gNewMain Is Nothing Then
                            ' fallback — AddLine
                            Dim gAx As Double, gAy As Double, gBx As Double, gBy As Double
                            gAx = gTopA.Left + gTopA.Width / 2: gAy = gTopA.Top + gTopA.Height / 2
                            gBx = gTopB.Left + gTopB.Width / 2: gBy = gTopB.Top + gTopB.Height / 2
                            On Error Resume Next
                            Set gNewMain = ws.Shapes.AddLine(gAx, gAy, gBx, gBy)
                            On Error GoTo 0
                        End If
                        If Not gNewMain Is Nothing Then
                            gNewMain.Name = gMainName
                            gNewMain.OnAction = ""
                            gNewMain.Placement = 3
                            On Error Resume Next
                            gNewMain.AlternativeText = gMainAlt
                            With gNewMain.Line
                                .ForeColor.RGB = 0
                                .Weight = 0.5
                                .DashStyle = msoLineRoundDot
                                .BeginArrowheadStyle = msoArrowheadTriangle
                                .BeginArrowheadLength = msoArrowheadShort
                                .BeginArrowheadWidth = msoArrowheadNarrow
                                .EndArrowheadStyle = msoArrowheadTriangle
                                .EndArrowheadLength = msoArrowheadShort
                                .EndArrowheadWidth = msoArrowheadNarrow
                            End With
                            gNewMain.ZOrder msoBringToFront
                            gTopA.ZOrder msoBringToFront
                            gTopB.ZOrder msoBringToFront
                            On Error GoTo 0
                        End If
                    End If
                End If
            End If
        End If
    Next gKey
End Sub

' AlternativeText 의 「key=value」 형식 파싱 헬퍼.
'   예: alt="box1=A|box2=B|rngrp=X" + key="box1=" → "A"
Public Function AltParseField(alt As String, key As String) As String
    AltParseField = ""
    If Len(alt) = 0 Or Len(key) = 0 Then Exit Function
    Dim p As Long: p = InStr(alt, key)
    If p = 0 Then Exit Function
    Dim s As Long: s = p + Len(key)
    Dim e As Long: e = InStr(s, alt, "|")
    If e = 0 Then e = Len(alt) + 1
    AltParseField = Mid(alt, s, e - s)
End Function

' owner 2026-06-06 (8-23): 박스 alt 의 「lastPos=X,Y」 키 정밀 교체.
'   다른 키 (fac=, cbl=, rn=, port=, core=, tier=, rngrp= 등) 는 절대 손 안 댐.
'   기존 lastPos 가 있으면 같은 키 영역만 replace, 없으면 alt 끝에 |lastPos= 추가.
Public Sub AltSetLastPos(box As Shape, x As Double, y As Double)
    If box Is Nothing Then Exit Sub
    Dim alt As String: alt = ""
    On Error Resume Next: alt = box.AlternativeText: On Error GoTo 0
    Dim newPos As String: newPos = "lastPos=" & CStr(x) & "," & CStr(y)
    Dim p As Long: p = InStr(alt, "lastPos=")
    If p > 0 Then
        Dim eP As Long: eP = InStr(p, alt, "|")
        Dim newAlt As String
        If eP = 0 Then
            ' alt 끝 영역
            newAlt = Left(alt, p - 1) & newPos
        Else
            newAlt = Left(alt, p - 1) & newPos & Mid(alt, eP)
        End If
        On Error Resume Next: box.AlternativeText = newAlt: On Error GoTo 0
    Else
        Dim sep As String: sep = ""
        If Len(alt) > 0 Then sep = "|"
        On Error Resume Next: box.AlternativeText = alt & sep & newPos: On Error GoTo 0
    End If
End Sub

' lastPos 파싱 — 있으면 (lastX, lastY) 반환, 없으면 hasPos=False.
Public Sub AltGetLastPos(box As Shape, ByRef hasPos As Boolean, _
                          ByRef lastX As Double, ByRef lastY As Double)
    hasPos = False: lastX = 0: lastY = 0
    If box Is Nothing Then Exit Sub
    Dim alt As String: alt = ""
    On Error Resume Next: alt = box.AlternativeText: On Error GoTo 0
    Dim v As String: v = AltParseField(alt, "lastPos=")
    If Len(v) = 0 Then Exit Sub
    Dim parts() As String: parts = Split(v, ",")
    If UBound(parts) < 1 Then Exit Sub
    If Not IsNumeric(parts(0)) Or Not IsNumeric(parts(1)) Then Exit Sub
    lastX = CDbl(parts(0))
    lastY = CDbl(parts(1))
    hasPos = True
End Sub

' owner 2026-06-06 (8-23): cable-cable chain 평행 이동 처리.
'   - chain = 같은 (fac, cbl) 의 모든 PAIRBOX (canonical + cascade 통합)
' owner 2026-06-06 (8-28·8-29): 박스 invalid 이동 차단 — 케이블 길이 범위 + 다른 케이블 cross 두 검사.
'   1) 길이 범위 — 박스 중심을 own cable 에 투영해 parametric t 계산. t < 0 또는 t > 1 → 케이블 끝점 밖.
'   2) 다른 케이블 cross — lastPos→current 이동 선분이 own cable 외 다른 PREFIX_CBL 선분과 교차하면 cross 발생.
'   둘 중 하나라도 발견 → lastPos 메타 (8-23) 의 (X, Y) 로 박스 위치 복귀.
'
'   Cable_Chain_평행이동_처리 보다 먼저 실행 — invalid 드래그를 「유효 이동」 으로 인식하지 않게.
'   RN 박스 / cable-facility 제외 (cbl=fac_ prefix).
'   비활성화: VALIDATION_ENABLED = False 로 1줄 변경 (예상대로 안 되면 즉시 복귀).
Public Sub Cable_Range_Validation(ws As Worksheet)
    If ws Is Nothing Then Exit Sub
    Const VALIDATION_ENABLED As Boolean = True
    If Not VALIDATION_ENABLED Then Exit Sub

    Dim sh As Shape, alt As String
    For Each sh In ws.Shapes
        If Left(sh.Name, Len(PREFIX_PAIRBOX)) = PREFIX_PAIRBOX Then
            alt = "": On Error Resume Next: alt = sh.AlternativeText: On Error GoTo 0
            ' RN 박스 제외 (cable-cable PAIRBOX 만)
            If InStr(alt, "|rn=") = 0 And InStr(alt, "rn=") <> 1 Then
                Dim cblV As String: cblV = AltParseField(alt, "cbl=")
                If Len(cblV) > 0 Then
                    If Left(cblV, Len(PREFIX_FAC)) <> PREFIX_FAC Then
                        ' 박스 현재 위치
                        Dim bcx As Double, bcy As Double
                        bcx = sh.Left + sh.Width / 2
                        bcy = sh.Top + sh.Height / 2

                        Dim restoreFlag As Boolean: restoreFlag = False

                        ' === 1) own cable 길이 범위 검사 ===
                        Dim ownCbl As Shape: Set ownCbl = Nothing
                        On Error Resume Next: Set ownCbl = ws.Shapes(cblV): On Error GoTo 0
                        If Not ownCbl Is Nothing Then
                            Dim ax As Double, ay As Double, bx As Double, by As Double
                            ax = 0: ay = 0: bx = 0: by = 0
                            On Error Resume Next: GetLineEndpoints ownCbl, ax, ay, bx, by: On Error GoTo 0
                            Dim cdx As Double, cdy As Double
                            cdx = bx - ax: cdy = by - ay
                            Dim clen2 As Double: clen2 = cdx * cdx + cdy * cdy
                            If clen2 > 0.001 Then
                                Dim tParam As Double
                                tParam = ((bcx - ax) * cdx + (bcy - ay) * cdy) / clen2
                                If tParam < 0# Or tParam > 1# Then restoreFlag = True
                            End If
                        End If

                        ' === 2) 다른 케이블 cross 검사 (own cable 제외) ===
                        '   이동 선분 (lastPos.cx, lastPos.cy) → (bcx, bcy) 가 다른 CBL 선분과 교차하면 cross.
                        '   lastPos 없으면 cross 판정 skip (첫 등록 시점).
                        If Not restoreFlag Then
                            Dim hasPosX As Boolean, lpxX As Double, lpyX As Double
                            AltGetLastPos sh, hasPosX, lpxX, lpyX
                            If hasPosX Then
                                ' 박스 중심 vs lastPos 의 박스 중심 (lastPos 는 박스 Left/Top 저장이라 + Width/2, Height/2 보정)
                                Dim lcx As Double, lcy As Double
                                lcx = lpxX + sh.Width / 2
                                lcy = lpyX + sh.Height / 2
                                ' 이동 거리 0 이면 skip
                                Dim mdx As Double, mdy As Double
                                mdx = bcx - lcx: mdy = bcy - lcy
                                If (mdx * mdx + mdy * mdy) > 1# Then
                                    Dim otherCbl As Shape, otherName As String
                                    For Each otherCbl In ws.Shapes
                                        otherName = otherCbl.Name
                                        If Left(otherName, Len(PREFIX_CBL)) = PREFIX_CBL Then
                                            If otherName <> cblV Then
                                                Dim oax As Double, oay As Double, obx As Double, oby As Double
                                                oax = 0: oay = 0: obx = 0: oby = 0
                                                On Error Resume Next: GetLineEndpoints otherCbl, oax, oay, obx, oby: On Error GoTo 0
                                                ' 선분 교차 판정 — 4 cross product sign
                                                Dim cd1 As Double, cd2 As Double, cd3 As Double, cd4 As Double
                                                cd1 = (obx - oax) * (lcy - oay) - (oby - oay) * (lcx - oax)
                                                cd2 = (obx - oax) * (bcy - oay) - (oby - oay) * (bcx - oax)
                                                cd3 = (bcx - lcx) * (oay - lcy) - (bcy - lcy) * (oax - lcx)
                                                cd4 = (bcx - lcx) * (oby - lcy) - (bcy - lcy) * (obx - lcx)
                                                If ((cd1 > 0 And cd2 < 0) Or (cd1 < 0 And cd2 > 0)) And _
                                                   ((cd3 > 0 And cd4 < 0) Or (cd3 < 0 And cd4 > 0)) Then
                                                    restoreFlag = True
                                                    Exit For
                                                End If
                                            End If
                                        End If
                                    Next otherCbl
                                End If
                            End If
                        End If

                        ' === 복귀 ===
                        If restoreFlag Then
                            Dim hasPos As Boolean, lpx As Double, lpy As Double
                            AltGetLastPos sh, hasPos, lpx, lpy
                            If hasPos Then
                                On Error Resume Next
                                sh.Left = lpx
                                sh.Top = lpy
                                On Error GoTo 0
                            End If
                        End If
                    End If
                End If
            End If
        End If
    Next sh
End Sub

'   - 한 박스 옮긴 후 셀 클릭 → 그 박스의 (dx, dy) 만큼 chain 내 다른 박스 평행 이동
'   - 순서·간격 유지 — stack 재정렬 아님
'   - 도구 닫힌 상태에서도 작동 (g_pt 전역 무관)
'   - cable-facility (cbl=fac_xxx) 박스는 제외 — RN 박스는 별도 로직
'   - 임계치 3pt 미만 delta 무시 (미세 떨림 차단)
'   - 모든 chain 박스의 lastPos 메타 갱신 (이동/미이동 무관)
Public Sub Cable_Chain_평행이동_처리(ws As Worksheet)
    If ws Is Nothing Then Exit Sub
    Const MOVE_THRESHOLD As Double = 3#

    ' owner 2026-06-06 (8-24): chain key 를 anchor 기반으로 정밀 부여.
    '   같은 cable 을 공유하는 다른 페어 (예: pair A-B 와 pair A-C 모두 cableA 박스 가짐) 의 박스가
    '   같은 chain 으로 잘못 묶이는 문제 해결.
    '
    '   chain key = "fac|kA|kB|thisCbl" — (kA, kB) 는 cable 페어 (sorted, A 측·B 측 어느 쪽이든 같은 pair),
    '                                       thisCbl 은 박스 자체의 cbl (A 측 OR B 측 구분)
    '   anchor 로 box1·box2 매핑 → 박스 이름별 chain key dictionary 구축
    '   → 같은 cable 을 공유해도 페어 (kA, kB) 가 다르면 다른 chain
    '   RN/RN2 박스 (rn= 키 또는 cbl=fac_ prefix) 는 제외 (별도 로직)
    Dim boxChainMap As Object: Set boxChainMap = CreateObject("Scripting.Dictionary")
    Dim shAm As Shape, altAm As String
    For Each shAm In ws.Shapes
        If Left(shAm.Name, Len(PREFIX_PAIRARROW)) = PREFIX_PAIRARROW Then
            altAm = "": On Error Resume Next: altAm = shAm.AlternativeText: On Error GoTo 0
            If InStr(altAm, "box1=") > 0 And InStr(altAm, "box2=") > 0 Then
                Dim b1Am As String, b2Am As String
                b1Am = AltParseField(altAm, "box1=")
                b2Am = AltParseField(altAm, "box2=")
                If Len(b1Am) > 0 And Len(b2Am) > 0 Then
                    Dim b1AmShp As Shape, b2AmShp As Shape
                    Set b1AmShp = Nothing: Set b2AmShp = Nothing
                    On Error Resume Next
                    Set b1AmShp = ws.Shapes(b1Am): Set b2AmShp = ws.Shapes(b2Am)
                    On Error GoTo 0
                    If Not b1AmShp Is Nothing And Not b2AmShp Is Nothing Then
                        Dim b1AltAm As String, b2AltAm As String
                        b1AltAm = "": b2AltAm = ""
                        On Error Resume Next
                        b1AltAm = b1AmShp.AlternativeText: b2AltAm = b2AmShp.AlternativeText
                        On Error GoTo 0
                        ' RN 박스 제외 (rn= 키 있으면 cable-cable 아님)
                        If InStr(b1AltAm, "|rn=") = 0 And InStr(b1AltAm, "rn=") <> 1 And _
                           InStr(b2AltAm, "|rn=") = 0 And InStr(b2AltAm, "rn=") <> 1 Then
                            Dim facAm As String, c1Am As String, c2Am As String
                            facAm = AltParseField(b1AltAm, "fac=")
                            If Len(facAm) = 0 Then facAm = AltParseField(b2AltAm, "fac=")
                            c1Am = AltParseField(b1AltAm, "cbl=")
                            c2Am = AltParseField(b2AltAm, "cbl=")
                            ' cable-cable 만 (양쪽 cbl 모두 fac_ prefix 아님)
                            If Len(facAm) > 0 And Len(c1Am) > 0 And Len(c2Am) > 0 Then
                                If Left(c1Am, Len(PREFIX_FAC)) <> PREFIX_FAC And _
                                   Left(c2Am, Len(PREFIX_FAC)) <> PREFIX_FAC Then
                                    Dim kAAm As String, kBAm As String
                                    If c1Am < c2Am Then kAAm = c1Am: kBAm = c2Am Else kAAm = c2Am: kBAm = c1Am
                                    Dim pairBase As String: pairBase = facAm & "|" & kAAm & "|" & kBAm
                                    ' box1 chain key (this side = c1Am)
                                    boxChainMap(b1Am) = pairBase & "|" & c1Am
                                    boxChainMap(b2Am) = pairBase & "|" & c2Am
                                End If
                            End If
                        End If
                    End If
                End If
            End If
        End If
    Next shAm

    ' 박스 스캔 → boxChainMap 으로 chain 그룹핑
    Dim chains As Object: Set chains = CreateObject("Scripting.Dictionary")
    Dim sh As Shape
    For Each sh In ws.Shapes
        If Left(sh.Name, Len(PREFIX_PAIRBOX)) = PREFIX_PAIRBOX Then
            If boxChainMap.Exists(sh.Name) Then
                Dim cKey As String: cKey = CStr(boxChainMap(sh.Name))
                Dim col As Collection
                If chains.Exists(cKey) Then
                    Set col = chains(cKey)
                Else
                    Set col = New Collection
                    chains.Add cKey, col
                End If
                col.Add sh
            End If
        End If
    Next sh

    ' 2) 각 chain 처리
    Dim ck As Variant
    For Each ck In chains.Keys
        Dim chCol As Collection: Set chCol = chains(ck)
        If chCol.Count >= 2 Then
            ' 2-a) lastPos 있는 박스만 비교 대상. 없는 박스는 초기 등록만.
            Dim maxDelta As Double: maxDelta = 0
            Dim moverDx As Double: moverDx = 0
            Dim moverDy As Double: moverDy = 0
            Dim moverShp As Shape: Set moverShp = Nothing
            Dim ii As Long
            For ii = 1 To chCol.Count
                Dim cShp As Shape: Set cShp = chCol(ii)
                Dim hasPos As Boolean, lpx As Double, lpy As Double
                AltGetLastPos cShp, hasPos, lpx, lpy
                If hasPos Then
                    Dim dxC As Double, dyC As Double
                    dxC = cShp.Left - lpx
                    dyC = cShp.Top - lpy
                    Dim mag As Double: mag = Sqr(dxC * dxC + dyC * dyC)
                    If mag > maxDelta Then
                        maxDelta = mag
                        moverDx = dxC
                        moverDy = dyC
                        Set moverShp = cShp
                    End If
                End If
            Next ii

            ' 2-b) 임계치 이상 이동한 박스가 있으면 → 다른 박스도 같은 (dx, dy) 적용
            If Not moverShp Is Nothing And maxDelta >= MOVE_THRESHOLD Then
                For ii = 1 To chCol.Count
                    Dim cShp2 As Shape: Set cShp2 = chCol(ii)
                    If cShp2.Name <> moverShp.Name Then
                        On Error Resume Next
                        cShp2.Left = cShp2.Left + moverDx
                        cShp2.Top = cShp2.Top + moverDy
                        On Error GoTo 0
                    End If
                Next ii
            End If

            ' 2-c) lastPos 일괄 갱신 (이동·미이동 무관)
            For ii = 1 To chCol.Count
                Dim cShp3 As Shape: Set cShp3 = chCol(ii)
                AltSetLastPos cShp3, cShp3.Left, cShp3.Top
            Next ii
        ElseIf chCol.Count = 1 Then
            ' 단일 박스 chain — lastPos 만 동기화 (cascade 추가 시 첫 비교 대비)
            AltSetLastPos chCol(1), chCol(1).Left, chCol(1).Top
        End If
    Next ck
End Sub

' owner 2026-06-06: cable-RN 페어 전용 직각 라우팅 (clamp 방식 v2) — v3 spec 로 대체. legacy 유지.
'   목표: box2 (시설물 옆 큰 박스) 의 면 중앙으로 항상 직각 진입. box1 의 exit 도 box2 중심에 맞춰 정렬.
'         두 박스가 어긋나 있으면 box1 면 안으로 clamp → 완벽한 일자 (대부분 케이스).
'         box1 너무 멀리 어긋나면 작은 L (box1 의 가장자리에서 시작 → box2 면 중앙 진입).
'
'   알고리즘:
'     dx = b2x - b1x, dy = b2y - b1y
'     |dy| >= |dx|  →  세로 dominant
'                     e2x = b2x (box2 위/아래 중앙 진입), e2y = box2 의 box1 쪽 변 (top or bottom)
'                     e1x = clamp(b2x, box1.Left+2, box1.Right-2) — box1 면 안이면 일자, 밖이면 가장자리
'                     e1y = box1 의 box2 쪽 변
'     가로 dominant  →  대칭 (좌우 변, b2y clamp)
'     e1x == e2x (또는 e1y == e2y) → 2-point 일자
'     아니면 3-point L (corner = (e1x, e2y) — 마지막 segment 가 box2 면 방향)
'
'   반환: arrPts(1 To N, 1 To 2) — 선번박스_화살표생성 형식
Public Function 선번박스_RN1_경로(box1 As Shape, box2 As Shape) As Variant
    Dim b1x As Double, b1y As Double, b2x As Double, b2y As Double
    b1x = box1.Left + box1.Width / 2
    b1y = box1.Top + box1.Height / 2
    b2x = box2.Left + box2.Width / 2
    b2y = box2.Top + box2.Height / 2

    Dim dx As Double, dy As Double
    dx = b2x - b1x
    dy = b2y - b1y

    Dim e1x As Double, e1y As Double, e2x As Double, e2y As Double
    Dim vertical As Boolean: vertical = (Abs(dy) >= Abs(dx))

    If vertical Then
        ' 세로 dominant — box2 위/아래 중앙으로 진입 (e2x = b2x)
        e2x = b2x
        If dy >= 0 Then
            ' box2 가 box1 아래 → box1 bottom → box2 top
            e1y = box1.Top + box1.Height
            e2y = box2.Top
        Else
            ' box2 가 box1 위 → box1 top → box2 bottom
            e1y = box1.Top
            e2y = box2.Top + box2.Height
        End If
        ' e1x = box1 면 안으로 clamp 한 b2x — box1 폭이 충분히 넓거나 b2x 가 가까우면 일자
        Dim minX1 As Double, maxX1 As Double
        minX1 = box1.Left + 2
        maxX1 = box1.Left + box1.Width - 2
        If maxX1 < minX1 Then maxX1 = minX1            ' 박스 폭 4 미만 가드
        If b2x < minX1 Then
            e1x = minX1
        ElseIf b2x > maxX1 Then
            e1x = maxX1
        Else
            e1x = b2x                                    ' box1 면 안 → 일자
        End If
    Else
        ' 가로 dominant — box2 좌/우 중앙으로 진입 (e2y = b2y)
        e2y = b2y
        If dx >= 0 Then
            ' box2 가 box1 오른쪽 → box1 right → box2 left
            e1x = box1.Left + box1.Width
            e2x = box2.Left
        Else
            e1x = box1.Left
            e2x = box2.Left + box2.Width
        End If
        Dim minY1 As Double, maxY1 As Double
        minY1 = box1.Top + 2
        maxY1 = box1.Top + box1.Height - 2
        If maxY1 < minY1 Then maxY1 = minY1
        If b2y < minY1 Then
            e1y = minY1
        ElseIf b2y > maxY1 Then
            e1y = maxY1
        Else
            e1y = b2y
        End If
    End If

    ' 정렬 여부 — 0.5pt 이내면 직선
    Dim aligned As Boolean
    If vertical Then
        aligned = (Abs(e1x - e2x) < 0.5)
    Else
        aligned = (Abs(e1y - e2y) < 0.5)
    End If

    If aligned Then
        Dim pts2() As Double
        ReDim pts2(1 To 2, 1 To 2)
        pts2(1, 1) = e1x: pts2(1, 2) = e1y
        pts2(2, 1) = e2x: pts2(2, 2) = e2y
        선번박스_RN1_경로 = pts2
    Else
        ' 3-point L — 마지막 segment 가 box2 면에 직각 진입해야 화살표 머리가 면 중앙에 깔끔히 닿음
        '   세로 dominant: 마지막 segment 세로 → corner = (e2x, e1y)
        '                  e1→corner 가로, corner→e2 세로 (box2 top/bottom 직각 진입) ✓
        '   가로 dominant: 마지막 segment 가로 → corner = (e1x, e2y)
        '                  e1→corner 세로, corner→e2 가로 (box2 left/right 직각 진입) ✓
        Dim cx As Double, cy As Double
        If vertical Then
            cx = e2x: cy = e1y
        Else
            cx = e1x: cy = e2y
        End If
        Dim pts3() As Double
        ReDim pts3(1 To 3, 1 To 2)
        pts3(1, 1) = e1x: pts3(1, 2) = e1y
        pts3(2, 1) = cx:  pts3(2, 2) = cy
        pts3(3, 1) = e2x: pts3(3, 2) = e2y
        선번박스_RN1_경로 = pts3
    End If
End Function

' owner 2026-06-05: 박스의 가장자리 교점 — 박스 중심에서 (tx, ty) 방향으로 ray 가 박스 경계와 만나는 점.
'   L-shape 화살표가 박스 안으로 들어가지 않게 가장자리에서 정지시키는 용도.
Public Sub 선번박스_가장자리점(ByVal box As Shape, ByVal tx As Double, ByVal ty As Double, _
                                ByRef ex As Double, ByRef ey As Double)
    Dim bcx As Double: bcx = box.Left + box.Width / 2
    Dim bcy As Double: bcy = box.Top + box.Height / 2
    Dim dx As Double, dy As Double
    dx = tx - bcx: dy = ty - bcy
    If dx = 0 And dy = 0 Then ex = bcx: ey = bcy: Exit Sub
    Dim halfW As Double: halfW = box.Width / 2
    Dim halfH As Double: halfH = box.Height / 2
    Dim absDx As Double: absDx = Abs(dx)
    Dim absDy As Double: absDy = Abs(dy)
    Dim sX As Double, sY As Double
    If absDx = 0 Then sX = 1E+18 Else sX = halfW / absDx
    If absDy = 0 Then sY = 1E+18 Else sY = halfH / absDy
    Dim s As Double
    If sX < sY Then s = sX Else s = sY
    ex = bcx + dx * s
    ey = bcy + dy * s
End Sub

' RN 라벨 박스 — "IN" / "P". AlternativeText 없음 (구분만 시각용).
Public Function 선번박스_RN_라벨박스(ws As Worksheet, x As Double, y As Double, _
                                     w As Double, h As Double, lbl As String) As Shape
    Dim bx As Shape
    Set bx = ws.Shapes.AddShape(msoShapeRectangle, x, y, w, h)
    bx.Name = PREFIX_PAIRBOX & "rnlbl_" & NewId8()
    bx.Placement = 3
    On Error Resume Next
    bx.AlternativeText = "fac=" & g_pt_facId & "|cbl=" & g_pt_facId & "|rn_lbl=" & lbl
    With bx.Line: .ForeColor.RGB = 0: .Weight = 0.5: .Visible = msoTrue: End With
    With bx.Fill: .ForeColor.RGB = RGB(255, 255, 255): .Visible = msoTrue: End With
    With bx.TextFrame2
        .MarginLeft = 2.83465: .MarginRight = 2.83465: .MarginTop = 0.1: .MarginBottom = 0.1  ' 좌우 0.1cm · 상하 0.1pt
        .VerticalAnchor = msoAnchorMiddle
        .TextRange.Text = lbl
        .TextRange.Font.Name = CALLOUT_FONT_NAME
        .TextRange.Font.Size = 9
        .TextRange.Font.Bold = msoTrue
        .TextRange.Font.Fill.ForeColor.RGB = 0
        .TextRange.ParagraphFormat.Alignment = 2
    End With
    On Error GoTo 0
    Set 선번박스_RN_라벨박스 = bx
End Function

' RN 코어 박스 — IN/OUT/A/B 4 종류. AlternativeText 에 fac/cbl/rn 태그.
'   cblOrFacId: Cable side 면 cable name, RN side 면 facId.
'   tag: "A"/"B"/"IN"/"OUT"
Public Function 선번박스_RN_코어박스(ws As Worksheet, x As Double, y As Double, _
                                    w As Double, h As Double, txt As String, _
                                    cblOrFacId As String, tag As String) As Shape
    Dim bx As Shape
    Set bx = ws.Shapes.AddShape(msoShapeRectangle, x, y, w, h)
    bx.Name = PREFIX_PAIRBOX & NewId8()
    bx.Placement = 3
    On Error Resume Next
    bx.AlternativeText = "fac=" & g_pt_facId & "|cbl=" & cblOrFacId & "|rn=" & tag
    With bx.Line: .ForeColor.RGB = 0: .Weight = 0.5: .Visible = msoTrue: End With
    With bx.Fill: .ForeColor.RGB = RGB(255, 255, 255): .Visible = msoTrue: End With
    With bx.TextFrame2
        .MarginLeft = 2.83465: .MarginRight = 2.83465: .MarginTop = 0.1: .MarginBottom = 0.1  ' 좌우 0.1cm · 상하 0.1pt
        .VerticalAnchor = msoAnchorMiddle
        .TextRange.Text = txt
        .TextRange.Font.Name = CALLOUT_FONT_NAME
        .TextRange.Font.Size = 9
        .TextRange.Font.Bold = msoTrue
        .TextRange.Font.Fill.ForeColor.RGB = 0
        .TextRange.ParagraphFormat.Alignment = 2
    End With
    On Error GoTo 0
    Set 선번박스_RN_코어박스 = bx
End Function

' RN 화살표 — 위 박스(케이블 측)와 아래 박스(RN 측) 수직 연결. 양방향 화살표 머리.
Public Sub 선번박스_RN_화살표(ws As Worksheet, topBox As Shape, bottomBox As Shape)
    Dim x1 As Double, y1 As Double, x2 As Double, y2 As Double
    x1 = topBox.Left + topBox.Width / 2
    y1 = topBox.Top + topBox.Height
    x2 = bottomBox.Left + bottomBox.Width / 2
    y2 = bottomBox.Top
    Dim arr As Shape
    Set arr = ws.Shapes.AddLine(x1, y1, x2, y2)
    arr.Name = PREFIX_PAIRARROW & NewId8()
    arr.OnAction = ""
    arr.Placement = 3
    On Error Resume Next
    arr.AlternativeText = "box1=" & topBox.Name & "|box2=" & bottomBox.Name
    With arr.Line
        .ForeColor.RGB = 0                            ' owner — 검정 통일
        .Weight = 0.75
        .DashStyle = msoLineRoundDot                 ' owner — 둥근 점선
        .BeginArrowheadStyle = msoArrowheadTriangle
        .EndArrowheadStyle = msoArrowheadTriangle
    End With
    arr.ZOrder msoSendToBack
    On Error GoTo 0
End Sub

' 화살표 폴리라인 경로 계산 — L-shape (3점) 또는 stair (4점, 평행 케이블 fallback).
'   owner 요구:
'     - 끝 segment 가 케이블과 정확히 평행 (각 segment 가 cable 방향 단위벡터 그대로)
'     - 화살표 끝이 박스 안 안 들어감 (박스 경계에서 정지)
'   corner = 박스1 의 cable 평행선 ∩ 박스2 의 cable 평행선.
'     box 가 cable 에서 perp 거리만큼 떨어져 있으므로 corner 도 그 거리만큼 cable 에서 떨어짐 (자동).
'     (이전 EXTRA_OFFSET 추가는 corner 를 a1·a2 의 평행선에 두어 box→corner segment 가 평행 깨짐 — 제거)
Public Function 선번박스_경로_계산(ws As Worksheet, _
                                    side1Type As String, side1Name As String, box1 As Shape, _
                                    side2Type As String, side2Name As String, box2 As Shape, _
                                    facShp As Shape) As Variant
    Dim fcx As Double, fcy As Double
    fcx = facShp.Left + facShp.Width / 2
    fcy = facShp.Top + facShp.Height / 2

    Dim b1x As Double, b1y As Double, b2x As Double, b2y As Double
    b1x = box1.Left + box1.Width / 2: b1y = box1.Top + box1.Height / 2
    b2x = box2.Left + box2.Width / 2: b2y = box2.Top + box2.Height / 2

    ' 각 박스의 케이블 방향 단위벡터 (시설물 → 끝점)
    Dim u1x As Double, u1y As Double, u2x As Double, u2y As Double
    선번박스_방향계산 ws, side1Type, side1Name, b1x, b1y, fcx, fcy, u1x, u1y
    선번박스_방향계산 ws, side2Type, side2Name, b2x, b2y, fcx, fcy, u2x, u2y

    ' 두 평행직선 교점: line1 = (box1, u1), line2 = (box2, u2)
    Dim dx As Double, dy As Double
    dx = b2x - b1x: dy = b2y - b1y
    Dim det As Double: det = u2x * u1y - u1x * u2y

    Dim useLShape As Boolean: useLShape = False
    Dim cx As Double, cy As Double
    If Abs(det) >= 0.01 Then
        Dim t As Double
        t = (u2x * dy - u2y * dx) / det
        cx = b1x + t * u1x: cy = b1y + t * u1y
        Dim dC1 As Double, dC2 As Double
        dC1 = Sqr((cx - b1x) ^ 2 + (cy - b1y) ^ 2)
        dC2 = Sqr((cx - b2x) ^ 2 + (cy - b2y) ^ 2)
        If dC1 <= 800 And dC2 <= 800 Then useLShape = True
    End If

    If useLShape Then
        ' L-shape — 3점 [box1_edge, corner, box2_edge]
        '   끝 점은 박스 중심이 아니라 박스 가장자리 (corner 쪽 면) → 화살표 머리가 박스 안 안 들어감
        '   corner 가 box1 의 cable 평행선 위에 정확히 있으므로 box1_edge → corner 는 완전 평행
        Dim e1x As Double, e1y As Double, e2x As Double, e2y As Double
        선번박스_경계점 box1, cx, cy, e1x, e1y
        선번박스_경계점 box2, cx, cy, e2x, e2y

        Dim pts3() As Double
        ReDim pts3(1 To 3, 1 To 2)
        pts3(1, 1) = e1x: pts3(1, 2) = e1y
        pts3(2, 1) = cx:  pts3(2, 2) = cy
        pts3(3, 1) = e2x: pts3(3, 2) = e2y
        선번박스_경로_계산 = pts3
    Else
        ' det ≈ 0 — 두 케이블 평행 (det = u2.x*u1.y - u1.x*u2.y = 0).
        '   하위 케이스 1: 안티평행 (u1·u2 < -0.5) = 공선 (시설물 통과 LEFT+RIGHT) → 4점 stair 가 케이블 far-end 까지 exit 해 화살표가 캔버스 가로지름.
        '                    → 양 박스 경계 직선 1개로 단순 연결 (owner 보고: 「단일/UNIT 마찬가지로 이상하게 나옴」)
        '   하위 케이스 2: 평행 같은 방향 (u1·u2 > 0.5) → 4점 stair 유지
        Dim u1u2 As Double: u1u2 = u1x * u2x + u1y * u2y
        If u1u2 < -0.5 Then
            ' 대각 공선 (owner 2026-06-10 약점1) — 아래 axis 가정(가로/세로 edge 선택)이 대각 케이블엔 안 맞음
            '   → 상대 박스를 향한 경계점끼리 직선 연결. 수평/수직 공선은 기존 튜닝 그대로 유지. (변경 전 = 커밋 98a88d0)
            If Abs(u1x) > 0.35 And Abs(u1y) > 0.35 Then
                Dim dgAx As Double, dgAy As Double, dgBx As Double, dgBy As Double
                선번박스_경계점 box1, b2x, b2y, dgAx, dgAy
                선번박스_경계점 box2, b1x, b1y, dgBx, dgBy
                Dim ptsD() As Double
                ReDim ptsD(1 To 2, 1 To 2)
                ptsD(1, 1) = dgAx: ptsD(1, 2) = dgAy
                ptsD(2, 1) = dgBx: ptsD(2, 2) = dgBy
                선번박스_경로_계산 = ptsD
                Exit Function
            End If
            ' 공선 — 양 박스의 「케이블 쪽 edge」 (cable-facing corner) 를 잇는 직선 (owner: 화살표가 박스 아래쪽 = 케이블 쪽 에 붙어야).
            '   x: 상대 박스 방향 edge (right or left)
            '   y: 케이블 (facility) 쪽 edge — 박스가 케이블 위에 있으면 box bottom, 아래에 있으면 box top
            '   가로 cable (LEFT+RIGHT) 케이스에서: 두 박스가 above cable → 두 끝점 모두 box bottom-corner.
            '   세로 cable (TOP+BOTTOM) 케이스에서: 두 박스가 right of cable → 두 끝점 모두 box left-corner (cable-facing 측).
            Dim eax As Double, eay As Double, ebx As Double, eby As Double
            Dim dirX_co As Double: dirX_co = Sgn(b2x - b1x)
            Dim dirY_co As Double: dirY_co = Sgn(b2y - b1y)
            ' 가로 cable 인지 세로 cable 인지 — u1 의 dominant 성분으로
            If Abs(u1x) >= Abs(u1y) Then
                ' 가로 cable: x = 상대 박스 방향 edge, y = 케이블 쪽 (box1/box2 의 fcy 대비 위·아래에 따라 결정)
                If dirX_co >= 0 Then
                    eax = box1.Left + box1.Width: ebx = box2.Left
                Else
                    eax = box1.Left: ebx = box2.Left + box2.Width
                End If
                If b1y < fcy Then eay = box1.Top + box1.Height - 2 Else eay = box1.Top + 2
                If b2y < fcy Then eby = box2.Top + box2.Height - 2 Else eby = box2.Top + 2
            Else
                ' 세로 cable: y = 상대 박스 방향 edge, x = 케이블 쪽 (box1/box2 의 fcx 대비 좌·우 에 따라 결정)
                If dirY_co >= 0 Then
                    eay = box1.Top + box1.Height: eby = box2.Top
                Else
                    eay = box1.Top: eby = box2.Top + box2.Height
                End If
                If b1x < fcx Then eax = box1.Left + box1.Width - 2 Else eax = box1.Left + 2
                If b2x < fcx Then ebx = box2.Left + box2.Width - 2 Else ebx = box2.Left + 2
            End If
            Dim pts2() As Double
            ReDim pts2(1 To 2, 1 To 2)
            pts2(1, 1) = eax: pts2(1, 2) = eay
            pts2(2, 1) = ebx: pts2(2, 2) = eby
            선번박스_경로_계산 = pts2
        Else
            ' 평행 케이블 fallback — 4점 stair
            Dim ex1x As Double, ex1y As Double, ex2x As Double, ex2y As Double
            선번박스_exit계산 ws, side1Type, side1Name, b1x, b1y, fcx, fcy, ex1x, ex1y
            선번박스_exit계산 ws, side2Type, side2Name, b2x, b2y, fcx, fcy, ex2x, ex2y

            Dim s1x As Double, s1y As Double, s2x As Double, s2y As Double
            선번박스_경계점 box1, ex1x, ex1y, s1x, s1y
            선번박스_경계점 box2, ex2x, ex2y, s2x, s2y

            Dim pts4() As Double
            ReDim pts4(1 To 4, 1 To 2)
            pts4(1, 1) = s1x:  pts4(1, 2) = s1y
            pts4(2, 1) = ex1x: pts4(2, 2) = ex1y
            pts4(3, 1) = ex2x: pts4(3, 2) = ex2y
            pts4(4, 1) = s2x:  pts4(4, 2) = s2y
            선번박스_경로_계산 = pts4
        End If
    End If
End Function

' 박스의 perp 방향 단위벡터 — cable 에서 박스로 향하는 방향 (cable 으로부터 +방향).
'   = box - facility 의 cable 평행성분 제외 → 정규화
Public Sub 선번박스_perp방향(bx As Double, by As Double, fcx As Double, fcy As Double, _
                               ux As Double, uy As Double, ByRef px As Double, ByRef py As Double)
    ' Box - facility 벡터
    Dim vx As Double, vy As Double
    vx = bx - fcx: vy = by - fcy
    ' 케이블 평행 성분 제거: v_perp = v - (v·u)u
    Dim dotv As Double: dotv = vx * ux + vy * uy
    Dim perpx As Double, perpy As Double
    perpx = vx - dotv * ux
    perpy = vy - dotv * uy
    Dim plen As Double: plen = Sqr(perpx * perpx + perpy * perpy)
    If plen > 0.001 Then
        px = perpx / plen: py = perpy / plen
    Else
        ' 박스가 cable 축 위에 정확히 있는 케이스 — perp 방향 임의 (90° 회전)
        px = -uy: py = ux
    End If
End Sub

' 박스 가장자리 점 — 박스 중심에서 (tx, ty) 방향으로 가다가 박스 사각형 가장자리와 만나는 점.
'   화살표 끝이 박스 안 안 들어가게 하려는 owner 요구.
Public Sub 선번박스_경계점(bx As Shape, tx As Double, ty As Double, _
                            ByRef ex As Double, ByRef ey As Double)
    Dim cx As Double, cy As Double
    cx = bx.Left + bx.Width / 2: cy = bx.Top + bx.Height / 2
    Dim hw As Double, hh As Double
    hw = bx.Width / 2: hh = bx.Height / 2

    Dim dx As Double, dy As Double
    dx = tx - cx: dy = ty - cy

    If Abs(dx) < 0.001 And Abs(dy) < 0.001 Then
        ex = cx: ey = cy: Exit Sub
    End If

    ' Find scale t such that (cx + t*dx, cy + t*dy) is on box edge.
    '   t*|dx| = hw → t = hw/|dx|
    '   t*|dy| = hh → t = hh/|dy|
    '   smaller t = first edge hit
    Dim tx2 As Double, ty2 As Double
    If Abs(dx) > 0.001 Then tx2 = hw / Abs(dx) Else tx2 = 1E+10
    If Abs(dy) > 0.001 Then ty2 = hh / Abs(dy) Else ty2 = 1E+10
    Dim tmin As Double
    If tx2 < ty2 Then tmin = tx2 Else tmin = ty2

    ex = cx + tmin * dx
    ey = cy + tmin * dy
End Sub

' 화살표 도형 생성 — FreeformBuilder 로 명시적 다중 segment polyline.
'   AddPolyline 이 silent 실패해서 직선 fallback 되는 케이스 방지 (owner 보고: 평행 아닌 직선 출력)
'   arrPts = (1..n, 1..2) 2D 점 배열
Public Function 선번박스_화살표생성(ws As Worksheet, arrPts As Variant) As Shape
    Set 선번박스_화살표생성 = Nothing
    If IsEmpty(arrPts) Or Not IsArray(arrPts) Then Exit Function
    Dim lo As Long, hi As Long
    On Error Resume Next
    lo = LBound(arrPts, 1): hi = UBound(arrPts, 1)
    On Error GoTo 0
    Dim numPts As Long: numPts = hi - lo + 1
    If numPts < 2 Then Exit Function

    ' FreeformBuilder 시작점 = 첫 점
    Dim ffb As FreeformBuilder
    On Error Resume Next
    Set ffb = ws.Shapes.BuildFreeform(msoEditingAuto, arrPts(lo, 1), arrPts(lo, 2))
    On Error GoTo 0
    If ffb Is Nothing Then
        ' Fallback — 첫 점·마지막 점 잇는 직선 (AddPolyline 대체)
        On Error Resume Next
        Set 선번박스_화살표생성 = ws.Shapes.AddLine(arrPts(lo, 1), arrPts(lo, 2), _
                                                    arrPts(hi, 1), arrPts(hi, 2))
        On Error GoTo 0
        Exit Function
    End If

    ' 나머지 점들을 segmentLine 으로 추가 → 다중 segment 폴리라인
    Dim pi As Long
    On Error Resume Next
    For pi = lo + 1 To hi
        ffb.AddNodes msoSegmentLine, msoEditingAuto, arrPts(pi, 1), arrPts(pi, 2)
    Next pi
    Set 선번박스_화살표생성 = ffb.ConvertToShape
    On Error GoTo 0
End Function

' owner 2026-06-11: 3방향+ 허브 V자 경로 — [box1 경계점 → 시설물 중심 → box2 경계점].
'   모든 화살표가 시설물 중심에서 뻗는 방사선 2개로 구성 → 방사선끼리 교차 불가 (owner 첨부: 교차 최소화).
'   시설물 도형이 최상단(z-order)이라 중심 통과 구간은 도형 뒤로 가려짐.
Public Function 선번박스_경로_V(box1 As Shape, box2 As Shape, facShp As Shape) As Variant
    Dim fcx As Double, fcy As Double
    fcx = facShp.Left + facShp.Width / 2
    fcy = facShp.Top + facShp.Height / 2
    Dim e1x As Double, e1y As Double, e2x As Double, e2y As Double
    선번박스_경계점 box1, fcx, fcy, e1x, e1y
    선번박스_경계점 box2, fcx, fcy, e2x, e2y
    Dim pts() As Double
    ReDim pts(1 To 3, 1 To 2)
    pts(1, 1) = e1x: pts(1, 2) = e1y
    pts(2, 1) = fcx: pts(2, 2) = fcy
    pts(3, 1) = e2x: pts(3, 2) = e2y
    선번박스_경로_V = pts
End Function

' 시설물에 모이는 케이블 방향 수 — cable-cable 선번박스(fac=facId)의 서로 다른 cbl_* 개수.
'   3 이상 = 허브 → 방사형 배치 + V자 화살표. (RN·facility 측 박스 제외)
Public Function 선번박스_허브_케이블수(ws As Worksheet, facId As String) As Long
    선번박스_허브_케이블수 = 0
    If ws Is Nothing Then Exit Function
    If Len(facId) = 0 Then Exit Function
    Dim cnt As Object: Set cnt = CreateObject("Scripting.Dictionary")
    Dim sh As Shape, altS As String, cblNm As String
    For Each sh In ws.Shapes
        If Left(sh.Name, Len(PREFIX_PAIRBOX)) = PREFIX_PAIRBOX Then
            altS = "": On Error Resume Next: altS = sh.AlternativeText: On Error GoTo 0
            If InStr(altS, "|rn=") = 0 And InStr(altS, "rn=") <> 1 Then
                If AltParseField(altS, "fac=") = facId Then
                    cblNm = AltParseField(altS, "cbl=")
                    If Left(cblNm, Len(PREFIX_CBL)) = PREFIX_CBL Then cnt(cblNm) = True
                End If
            End If
        End If
    Next sh
    선번박스_허브_케이블수 = cnt.Count
End Function

' 박스가 속한 케이블의 단위벡터 (시설물 → 케이블 끝점). facility 모드면 (시설물 → 박스) 방향.
Public Sub 선번박스_방향계산(ws As Worksheet, sideType As String, sideName As String, _
                              bx As Double, by As Double, fcx As Double, fcy As Double, _
                              ByRef ux As Double, ByRef uy As Double)
    If sideType = "cable" Then
        Dim cbl As Shape: Set cbl = Nothing
        On Error Resume Next
        Set cbl = ws.Shapes(sideName)
        On Error GoTo 0
        If Not cbl Is Nothing Then
            Dim ax As Double, ay As Double, bx2 As Double, by2 As Double
            GetLineEndpoints cbl, ax, ay, bx2, by2
            Dim dA As Double, dB As Double
            dA = (ax - fcx) * (ax - fcx) + (ay - fcy) * (ay - fcy)
            dB = (bx2 - fcx) * (bx2 - fcx) + (by2 - fcy) * (by2 - fcy)
            Dim farX As Double, farY As Double
            If dA > dB Then farX = ax: farY = ay Else farX = bx2: farY = by2

            Dim dirX As Double, dirY As Double, len_ As Double
            dirX = farX - fcx: dirY = farY - fcy
            len_ = Sqr(dirX * dirX + dirY * dirY)
            If len_ > 0.001 Then
                ux = dirX / len_: uy = dirY / len_
            Else
                ux = 1: uy = 0
            End If
            Exit Sub
        End If
    End If

    ' Facility 모드 또는 케이블 못 찾음 → facility → box 방향
    Dim dxF As Double, dyF As Double, lenF As Double
    dxF = bx - fcx: dyF = by - fcy
    lenF = Sqr(dxF * dxF + dyF * dyF)
    If lenF > 0.001 Then ux = dxF / lenF: uy = dyF / lenF Else ux = 1: uy = 0
End Sub

' 한 박스의 exit point 계산. side="cable" → 그 케이블 끝을 지나도록 / side="facility" → 시설물에서 박스 방향으로.
'   owner 요구: 끝 segment 가 케이블과 평행하게 보여야 함 → MIN_EXIT 충분히 크게.
Public Sub 선번박스_exit계산(ws As Worksheet, sideType As String, sideName As String, _
                              bx As Double, by As Double, fcx As Double, fcy As Double, _
                              ByRef ex As Double, ByRef ey As Double)
    Const MARGIN As Double = 30                  ' 케이블 끝을 지나 외측 공간 여유
    Const MIN_EXIT As Double = 60                ' 평행 segment 최소 길이 (시각 강조)
    Const FAC_EXIT_LEN As Double = 60            ' 시설물 모드 exit 거리

    If sideType = "cable" Then
        Dim cbl As Shape: Set cbl = Nothing
        On Error Resume Next
        Set cbl = ws.Shapes(sideName)
        On Error GoTo 0
        If Not cbl Is Nothing Then
            Dim ax As Double, ay As Double, bx2 As Double, by2 As Double
            GetLineEndpoints cbl, ax, ay, bx2, by2
            ' Far end = facility 와 거리가 먼 끝
            Dim dA As Double, dB As Double
            dA = (ax - fcx) * (ax - fcx) + (ay - fcy) * (ay - fcy)
            dB = (bx2 - fcx) * (bx2 - fcx) + (by2 - fcy) * (by2 - fcy)
            Dim farX As Double, farY As Double
            If dA > dB Then farX = ax: farY = ay Else farX = bx2: farY = by2

            Dim ux As Double, uy As Double, len_ As Double
            ux = farX - fcx: uy = farY - fcy
            len_ = Sqr(ux * ux + uy * uy)
            If len_ > 0.001 Then
                ux = ux / len_: uy = uy / len_
            Else
                ux = 1: uy = 0: len_ = 1
            End If

            ' 박스 위치의 케이블축 거리 (projection)
            Dim boxOnCable As Double
            boxOnCable = (bx - fcx) * ux + (by - fcy) * uy
            ' Exit 거리 = max(케이블 끝 너머 마진, MIN_EXIT)
            Dim exitDist As Double
            exitDist = (len_ - boxOnCable) + MARGIN
            If exitDist < MIN_EXIT Then exitDist = MIN_EXIT
            ex = bx + ux * exitDist
            ey = by + uy * exitDist
            Exit Sub
        End If
    End If

    ' Facility 모드 또는 케이블 못 찾음 → facility → box 방향으로 exit
    Dim dx As Double, dy As Double, lenF As Double
    dx = bx - fcx: dy = by - fcy
    lenF = Sqr(dx * dx + dy * dy)
    If lenF > 0.001 Then dx = dx / lenF: dy = dy / lenF Else dx = 1: dy = 0
    ex = bx + dx * FAC_EXIT_LEN
    ey = by + dy * FAC_EXIT_LEN
End Sub

' 시설물 내부 박스 생성 — 시설물 도형 옆 (방향 hint: "left"|"right"|"top"|"bottom")
'   AlternativeText 의 "cbl=" 자리에 facId 를 동일 prefix 로 저장 → 기존수집·검증과 호환.
'   같은 시설물 여러 박스는 stack 거리 늘려 안 겹치게.
Public Function 선번박스_시설물생성(ws As Worksheet, facShp As Shape, facId As String, _
                                      ByVal initialText As String, ByVal sideHint As String) As Shape
    Const BASE_DIST As Double = 38              ' 시설물 외곽 → 박스 거리
    Const STACK_GAP As Double = 16
    Const BX_W As Double = 22
    Const BX_H As Double = 14

    Dim fcx As Double, fcy As Double
    fcx = facShp.Left + facShp.Width / 2
    fcy = facShp.Top + facShp.Height / 2
    Dim halfW As Double, halfH As Double
    halfW = facShp.Width / 2: halfH = facShp.Height / 2

    ' 같은 시설물에 이미 있는 시설물-모드 박스 개수 (= cbl=<facId> 매칭, side hint 무관)
    Dim existingCount As Long: existingCount = 0
    Dim existShp As Shape, altScan As String
    Dim facTag As String: facTag = "cbl=" & facId
    For Each existShp In ws.Shapes
        If Left(existShp.Name, Len(PREFIX_PAIRBOX)) = PREFIX_PAIRBOX Then
            altScan = ""
            On Error Resume Next
            altScan = existShp.AlternativeText
            On Error GoTo 0
            If InStr(altScan, facTag) > 0 Then existingCount = existingCount + 1
        End If
    Next existShp

    ' 방향 벡터 + 거리
    Dim dirX As Double, dirY As Double
    Select Case sideHint
        Case "left":    dirX = -1: dirY = 0
        Case "right":   dirX = 1:  dirY = 0
        Case "top":     dirX = 0:  dirY = -1
        Case "bottom":  dirX = 0:  dirY = 1
        Case Else:      dirX = 1:  dirY = 0
    End Select
    Dim dist As Double: dist = BASE_DIST + existingCount * STACK_GAP
    Dim cx As Double, cy As Double
    cx = fcx + dirX * (halfW + dist)
    cy = fcy + dirY * (halfH + dist)

    Dim box As Shape
    Set box = ws.Shapes.AddShape(msoShapeRectangle, cx - BX_W / 2, cy - BX_H / 2, BX_W, BX_H)
    box.Name = PREFIX_PAIRBOX & NewId8()
    box.OnAction = ""
    box.Placement = 3
    box.Locked = False
    On Error Resume Next
    ' 형식 "fac=<facId>|cbl=<facId>" — cbl 자리에 시설물 id 로 동작
    box.AlternativeText = "fac=" & facId & "|cbl=" & facId
    With box.Line
        .ForeColor.RGB = 0                      ' owner 2026-06-06: 주황 → 검정
        .Weight = 0.75
        .Visible = msoTrue
    End With
    With box.Fill
        .ForeColor.RGB = RGB(255, 255, 255)            ' owner: 박스 배경 흰색 (시설물 모드 동일)
        .Visible = msoTrue
    End With
    With box.TextFrame2
        .MarginLeft = 2.83465: .MarginRight = 2.83465: .MarginTop = 0.1: .MarginBottom = 0.1  ' 좌우 0.1cm · 상하 0.1pt
        .VerticalAnchor = msoAnchorMiddle
        .WordWrap = msoFalse
        .AutoSize = msoAutoSizeShapeToFitText
        .TextRange.Text = initialText
        .TextRange.Font.Name = CALLOUT_FONT_NAME
        .TextRange.Font.Size = 9
        .TextRange.Font.Bold = msoTrue
        .TextRange.Font.Fill.ForeColor.RGB = 0
        .TextRange.ParagraphFormat.Alignment = 1
    End With
    On Error GoTo 0

    ' 박스 맨 위로 (owner: 케이블·시설물 도형에 가려 선번 안 보이는 문제 차단)
    On Error Resume Next
    box.ZOrder msoBringToFront
    On Error GoTo 0
    Set 선번박스_시설물생성 = box
End Function

' owner 2026-06-06: 진단 매크로 — 선택한 시설물에 메타 등록된 케이블 모두 + 캔버스 도형 존재 여부 출력.
'   "캔버스엔 1개인데 도구에 2개로 나옴" 같은 mismatch 추적용. 같은 좌표에 두 케이블 겹쳐 한 개로 보이는 경우도 알 수 있음.
'   사용법: 캔버스에서 시설물 1개 선택 → 이 매크로 실행. 결과 messagebox.
Public Sub 선번연결_진단_시설물케이블()
    Dim ws As Worksheet: Set ws = ThisWorkbook.Worksheets(SHEET_NETWORK)
    ' owner 2026-06-06: Selection 은 VBA 클래스가 아니라 Application.Selection property 반환 — Object 로 받음.
    '   TypeName 으로 ShapeRange / Range 분기. ShapeRange 인 경우 그대로 iterate, Range 면 facility 없음.
    Dim sel As Object: Set sel = Nothing
    On Error Resume Next
    Set sel = Application.Selection
    On Error GoTo 0
    ' owner 2026-06-06: Excel 의 단일 도형 선택 시 sel TypeName 은 도형 종류 (Oval/Rectangle/Line/Freeform/등) 다양.
    '   직접 Shape 캐스트는 type mismatch 위험 → name 만 추출해 ws.Shapes(name) 으로 재조회.
    Dim facNames As New Collection                      ' 이름만 보관 (Shape 객체 직접 보관 시 cast 위험)
    If TypeName(sel) = "ShapeRange" Then
        Dim i As Long
        For i = 1 To sel.Count
            Dim shpNm As String: shpNm = ""
            On Error Resume Next
            shpNm = sel(i).Name
            On Error GoTo 0
            If Len(shpNm) > 0 Then
                If Left(shpNm, Len(PREFIX_FAC)) = PREFIX_FAC Then facNames.Add shpNm
            End If
        Next i
    Else
        ' Shape 단일 선택 — Name property 시도
        Dim trialName As String: trialName = ""
        On Error Resume Next
        trialName = sel.Name
        On Error GoTo 0
        If Len(trialName) > 0 Then
            If Left(trialName, Len(PREFIX_FAC)) = PREFIX_FAC Then facNames.Add trialName
        End If
    End If
    If facNames.Count <> 1 Then
        MsgBox "시설물 1개를 선택하세요. (현재 선택 타입: " & TypeName(sel) & ")", vbExclamation, "진단"
        Exit Sub
    End If
    Dim facId As String: facId = CStr(facNames(1))
    Dim facShp As Shape: Set facShp = Nothing
    On Error Resume Next
    Set facShp = ws.Shapes(facId)
    On Error GoTo 0
    If facShp Is Nothing Then
        MsgBox "선택한 시설물 도형을 캔버스에서 찾지 못함: " & facId, vbExclamation, "진단"
        Exit Sub
    End If

    Dim wsCbl As Worksheet: Set wsCbl = ThisWorkbook.Worksheets(SHEET_META_CBL)
    Dim lastRow As Long: lastRow = wsCbl.Cells(wsCbl.Rows.Count, 1).End(xlUp).Row
    Dim msg As String
    msg = "시설물 facId: " & facId & vbLf & vbLf
    Dim total As Long, withShape As Long, stale As Long
    total = 0: withShape = 0: stale = 0
    Dim r As Long
    For r = 2 To lastRow
        Dim cId As String, fId As String, tId As String, spec As String
        cId = CStr(wsCbl.Cells(r, 1).Value)
        fId = CStr(wsCbl.Cells(r, 2).Value)
        tId = CStr(wsCbl.Cells(r, 3).Value)
        spec = CStr(wsCbl.Cells(r, 4).Value)
        If fId = facId Or tId = facId Then
            total = total + 1
            Dim other As String
            If fId = facId Then other = tId Else other = fId
            Dim shp As Shape: Set shp = Nothing
            Dim shapeFlag As String
            On Error Resume Next
            Set shp = ws.Shapes(cId)
            On Error GoTo 0
            If shp Is Nothing Then
                shapeFlag = "[X 도형 없음 — stale]"
                stale = stale + 1
            Else
                shapeFlag = "[O 도형 존재]"
                withShape = withShape + 1
            End If
            msg = msg & "[" & total & "] " & cId & " · " & spec & " ↔ " & other & "  " & shapeFlag & vbLf
        End If
    Next r

    msg = msg & vbLf & "총: " & total & "건 (도형 존재 " & withShape & " / stale " & stale & ")"
    MsgBox msg, vbInformation, "진단 — 시설물 케이블 메타·도형 매칭"
End Sub

' owner 2026-06-06: 도구 진입 후 g_pt_radial dict 내용 출력 — 도구 화면과 dict 일치 여부 확인용.
'   사용법: 시설물 선택 → 코어 연결 → 도구 화면 뜬 후 Alt+F8 → 「선번연결_진단_도구상태」 실행.
'   메시지에 facId + 모든 케이블 키·값 노출. 도구 화면의 [N] 개수와 dict 키 개수 mismatch 검출.
Public Sub 선번연결_진단_도구상태()
    Dim msg As String
    msg = "g_pt_facId: " & g_pt_facId & vbLf
    msg = msg & "g_pt_rnMode: " & g_pt_rnMode & " / g_pt_rn1Mode: " & g_pt_rn1Mode & vbLf
    msg = msg & "g_pt_step: " & g_pt_step & vbLf & vbLf

    If g_pt_radial Is Nothing Then
        msg = msg & "g_pt_radial = Nothing (도구 미진입)"
    Else
        msg = msg & "g_pt_radial.Count: " & g_pt_radial.Count & vbLf
        Dim k As Variant, idx As Long: idx = 0
        For Each k In g_pt_radial.Keys
            idx = idx + 1
            msg = msg & "[" & idx & "] " & CStr(k) & "  →  " & CStr(g_pt_radial(k)) & vbLf
        Next k
    End If
    MsgBox msg, vbInformation, "진단 — 도구 dict 상태"
End Sub

' ============================================================================
'  코어 연결 — 시각적 매핑 도구
' ============================================================================
'   별도 시트 「_선번연결_도구」 에 양 케이블의 코어를 박스(클릭 가능)로 그려두고
'   왼쪽 박스 클릭 → 오른쪽 박스 클릭 = 매핑 추가 (가운데 초록 연결선 표시).
'   이미 매핑된 박스를 다시 클릭하면 매핑 해제. 자동 1:1 / 전체 해제 / 확인 / 취소 버튼.
'   확인 클릭 → 매핑된 코어 번호들로 선번박스_쌍_생성 자동 호출.
'   시트는 작업 종료 시 VeryHidden 으로 숨겨 owner UI 흐름에서 안 보이게.
'   (관련 상수·module state 는 모듈 최상단 declarations section 으로 이동 — VBA 규칙)

' owner 2026-06-08 (8-90): facId 에 연결된 케이블 목록을 SHEET_META_CBL 에서 g_pt_radial 에 재스캔.
'   원래 코어 연결 fresh 진입에서만 inline 으로 실행됐음 → 복원 진입에서도 호출 가능하도록 분리.
'   복원 후 owner 가 「코어 선택」 버튼으로 Step 1 돌아가면 새로 그린 케이블이 즉시 보임.
'   stale row (메타에만 있고 캔버스 도형 없는 경우) 자동 skip → stale 카운트 반환.
Public Function 선번연결_도구_radial_재스캔(facId As String, ws As Worksheet) As Long
    선번연결_도구_radial_재스캔 = 0
    Set g_pt_radial = CreateObject("Scripting.Dictionary")
    Dim wsCbl As Worksheet: Set wsCbl = ThisWorkbook.Worksheets(SHEET_META_CBL)
    Dim lastRow As Long: lastRow = wsCbl.Cells(wsCbl.Rows.Count, 1).End(xlUp).Row
    Dim staleCount As Long: staleCount = 0
    Dim r As Long
    For r = 2 To lastRow
        Dim cblId As String, fromId As String, toId As String, spec As String
        cblId = CStr(wsCbl.Cells(r, 1).value)
        fromId = CStr(wsCbl.Cells(r, 2).value)
        toId = CStr(wsCbl.Cells(r, 3).value)
        spec = CStr(wsCbl.Cells(r, 4).value)
        If fromId = facId Or toId = facId Then
            Dim cblShp As Shape: Set cblShp = Nothing
            On Error Resume Next: Set cblShp = ws.Shapes(cblId): On Error GoTo 0
            If cblShp Is Nothing Then
                staleCount = staleCount + 1
            Else
                Dim otherId As String
                If fromId = facId Then otherId = toId Else otherId = fromId
                Dim otherName As String: otherName = otherId
                Dim lblShp As Shape: Set lblShp = Nothing
                On Error Resume Next: Set lblShp = ws.Shapes(PREFIX_LABEL & otherId): On Error GoTo 0
                If Not lblShp Is Nothing Then
                    On Error Resume Next
                    Dim t As String: t = lblShp.TextFrame2.TextRange.Text
                    If InStr(t, vbCr) > 0 Then t = Left(t, InStr(t, vbCr) - 1)
                    If InStr(t, vbLf) > 0 Then t = Left(t, InStr(t, vbLf) - 1)
                    If Len(Trim(t)) > 0 Then otherName = Trim(t)
                    On Error GoTo 0
                End If
                g_pt_radial(cblId) = otherId & "|" & otherName & "|" & spec & "|"
            End If
        End If
    Next r
    선번연결_도구_radial_재스캔 = staleCount
End Function

Public Sub 선번연결_도구()
    ' 해제 모드만 항상 reset (잔재 회피). RN 모드·Step 2 state 는 같은 시설물 다시 진입 시 자동 복원용으로 유지.
    g_pt_releaseMode = False
    g_pt_rnReleaseMode = False
    g_pt_rn1Mode = False                            ' RN1 도 매 진입 시 reset (Step2진입_RN1 이 다시 활성)
    g_pt_addBoxMode = False                         ' 박스추가 모드 매 진입 시 reset
    g_pt_mergeTargetArrName = ""                    ' 머지 타깃 reset
    Dim ws As Worksheet: Set ws = ActiveSheet
    If ws Is Nothing Or ws.Name <> SHEET_NETWORK Then
        MsgBox "네트웍구성도에서 기준 시설물 1개를 선택한 뒤 실행하세요.", vbExclamation, "코어 연결"
        Exit Sub
    End If

    Dim selRange As Object
    On Error Resume Next
    Set selRange = Selection.ShapeRange
    On Error GoTo 0
    If selRange Is Nothing Then
        MsgBox "기준 시설물을 선택한 뒤 다시 실행하세요.", vbExclamation, "코어 연결"
        Exit Sub
    End If

    ' 선택 도형 중 시설물 1개 추출
    Dim facShps As Collection: Set facShps = New Collection
    Dim i As Long
    For i = 1 To selRange.Count
        If Left(selRange(i).Name, Len(PREFIX_FAC)) = PREFIX_FAC Then facShps.Add selRange(i)
    Next i
    If facShps.Count <> 1 Then
        MsgBox "선택된 시설물 = " & facShps.Count & " 개. 정확히 1개의 시설물을 선택하세요." & vbLf & vbLf & _
               "새 흐름: 시설물 선택 → 「코어 연결」 → 방사형 케이블 그림 → 케이블 2개 선택 → 「선택」 → 코어 매핑.", _
               vbExclamation, "코어 연결"
        Exit Sub
    End If
    Dim facShp As Shape: Set facShp = facShps(1)

    ' 같은 시설물 + 이전 Step 2 state 있으면 자동 복원 (owner 요구: 「취소·닫기」 후 다시 진입 시 잠금 정보 다시 표시).
    '   다른 시설물 선택 시는 신규 진입 — 모든 mode·state reset.
    Dim wsToolRes As Worksheet
    On Error Resume Next
    Set wsToolRes = ThisWorkbook.Worksheets(SHEET_PAIR_TOOL)
    On Error GoTo 0
    If Not wsToolRes Is Nothing And g_pt_facId = facShp.Name And g_pt_step = 2 _
       And Len(g_pt_cbl1Name) > 0 And Len(g_pt_cbl2Name) > 0 Then
        ' owner 2026-06-05: RN 모드 자동 복원 — 「나가기」 가 g_pt_rnMode/rn1Mode 를 reset 한 뒤
        '   같은 시설물 재진입 시 cable↔cable 레이아웃이 잘못 렌더되던 버그 수정.
        '   복원 순서: 기존수집(캔버스 RN 박스 → existingRN_IN/OUT dict 채움) → RN 박스 존재 시 RN 모드 강제 활성.
        '   spec 도 우선 saved meta, 없으면 existing dict 의 최대값으로 추정.
        wsToolRes.Visible = xlSheetVisible
        ' owner 2026-06-08 (8-90): 복원 시점에도 radial 케이블 재스캔 → 「코어 선택」 으로 Step 1 돌아가도
        '   새로 그린 케이블 보임. 이전 g_pt_radial 갯수와 비교해 신규 케이블 카운트 status 표시.
        Dim prevRadialCount As Long: prevRadialCount = 0
        If Not g_pt_radial Is Nothing Then prevRadialCount = g_pt_radial.Count
        선번연결_도구_radial_재스캔 facShp.Name, ws
        Dim addedRadialCount As Long: addedRadialCount = 0
        If g_pt_radial.Count > prevRadialCount Then addedRadialCount = g_pt_radial.Count - prevRadialCount

        선번연결_도구_기존수집

        Dim hasRnBoxes As Boolean: hasRnBoxes = False
        If Not g_pt_existingRN_IN Is Nothing Then
            If g_pt_existingRN_IN.Count > 0 Then hasRnBoxes = True
        End If
        If Not hasRnBoxes And Not g_pt_existingRN_OUT Is Nothing Then
            If g_pt_existingRN_OUT.Count > 0 Then hasRnBoxes = True
        End If

        If hasRnBoxes Then
            g_pt_rnMode = True
            g_pt_rn1Mode = (g_pt_cbl1Name = g_pt_cbl2Name)
            ' spec 복원: 1) saved meta, 2) 추정 (existing dict 최대값)
            Dim restoredSpec As String: restoredSpec = 선번연결_도구_RN규격조회()
            If Not 선번연결_도구_RN규격_유효(restoredSpec) Then
                Dim maxIn As Long: maxIn = 0
                Dim mki As Variant
                If Not g_pt_existingRN_IN Is Nothing Then
                    For Each mki In g_pt_existingRN_IN.Keys
                        If CLng(mki) > maxIn Then maxIn = CLng(mki)
                    Next mki
                End If
                Dim maxOut As Long: maxOut = 0
                Dim mko As Variant
                If Not g_pt_existingRN_OUT Is Nothing Then
                    For Each mko In g_pt_existingRN_OUT.Keys
                        If CLng(mko) > maxOut Then maxOut = CLng(mko)
                    Next mko
                End If
                ' 최소 보장 — 라벨에 차수 힌트 있으면 표준 spec
                If maxIn = 0 Then maxIn = 1
                If maxOut = 0 Then maxOut = 8
                restoredSpec = maxIn & ":" & maxOut
            End If
            g_pt_rnSpec = restoredSpec
            Dim cpRes As Long: cpRes = InStr(restoredSpec, ":")
            g_pt_rnInCount = CLng(Trim(Left(restoredSpec, cpRes - 1)))
            g_pt_rnOutCount = CLng(Trim(Mid(restoredSpec, cpRes + 1)))
            ' 차수 복원 — 기존 g_pt_rnTier 살아있으면 그것, 그 외 spec→tier 추정
            If g_pt_rnTier <= 0 Or g_pt_rnTier > 3 Then
                Select Case restoredSpec
                    Case "2:16": g_pt_rnTier = 1
                    Case "1:3":  g_pt_rnTier = 2
                    Case "1:16": g_pt_rnTier = 3
                    Case Else:   g_pt_rnTier = 1
                End Select
            End If
            If Len(g_pt_rnLabel) = 0 Then g_pt_rnLabel = 선번연결_도구_RN규격라벨(restoredSpec)
            Set g_pt_selRN_IN = CreateObject("Scripting.Dictionary")
            Set g_pt_selRN_OUT = CreateObject("Scripting.Dictionary")
            If g_pt_mappingsA_IN Is Nothing Then Set g_pt_mappingsA_IN = CreateObject("Scripting.Dictionary")
            If g_pt_mappingsA_OUT Is Nothing Then Set g_pt_mappingsA_OUT = CreateObject("Scripting.Dictionary")
            If g_pt_mappingsOUT_B Is Nothing Then Set g_pt_mappingsOUT_B = CreateObject("Scripting.Dictionary")
            g_pt_anchorRN_IN = 0: g_pt_anchorRN_OUT = 0
            ' owner 2026-06-05: 추정값은 로컬만 — meta 덮어쓰기 금지.
            '   (이전엔 추정 spec 을 saved 해 owner 가 picker 에서 2:8 골랐어도 다음 재진입 때 1:4 로 덮어쓰던 버그)
            '   잘못된 spec 정정은 도구 시트의 「RN 규격 변경」 버튼으로 picker 재호출.
        End If

        선번연결_도구_시트빌드
        선번연결_도구_시각갱신
        ThisWorkbook.Worksheets(SHEET_PAIR_TOOL).Activate
        ' owner 2026-06-08 (8-90): 신규 케이블 감지 메시지 추가.
        Dim addedMsg As String: addedMsg = ""
        If addedRadialCount > 0 Then addedMsg = " · 신규 케이블 " & addedRadialCount & "개 감지 (「코어 선택」 으로 Step 1 진입)"
        Application.StatusBar = "코어 연결 — 이전 Step 2 복원 (같은 시설물)." & addedMsg & " 새 케이블 짝 하려면 「취소·닫기」 후 시설물 재선택."
        Exit Sub
    End If

    ' 신규 진입 — 모든 모드·state 초기화
    g_pt_rnMode = False
    g_pt_facId = facShp.Name

    ' 시설물에 연결된 모든 케이블 수집 (SHEET_META_CBL 에서 from_id 또는 to_id = facId)
    '   owner 2026-06-06: 캔버스 도형 존재 검증 추가 — 메타에만 있는 stale row (삭제됐지만 메타 잔존) 는
    '   캔버스에 도형이 없어도 코어 연결 도구에 잡혀 owner 가 「하나뿐인데 두 개로 나와」 인식. 도형 없으면 skip.
    Set g_pt_radial = CreateObject("Scripting.Dictionary")
    Dim wsCbl As Worksheet: Set wsCbl = ThisWorkbook.Worksheets(SHEET_META_CBL)
    Dim lastRow As Long: lastRow = wsCbl.Cells(wsCbl.Rows.Count, 1).End(xlUp).Row
    Dim staleCount As Long: staleCount = 0
    Dim r As Long
    For r = 2 To lastRow
        Dim cblId As String, fromId As String, toId As String, spec As String
        cblId = CStr(wsCbl.Cells(r, 1).Value)
        fromId = CStr(wsCbl.Cells(r, 2).Value)
        toId = CStr(wsCbl.Cells(r, 3).Value)
        spec = CStr(wsCbl.Cells(r, 4).Value)
        If fromId = g_pt_facId Or toId = g_pt_facId Then
            ' 캔버스 케이블 도형 존재 검증 — 없으면 stale row 로 간주, skip
            Dim cblShp As Shape: Set cblShp = Nothing
            On Error Resume Next
            Set cblShp = ws.Shapes(cblId)
            On Error GoTo 0
            If cblShp Is Nothing Then
                staleCount = staleCount + 1
                GoTo NextCblRow
            End If

            Dim otherId As String
            If fromId = g_pt_facId Then otherId = toId Else otherId = fromId
            Dim otherName As String: otherName = otherId
            ' 시설물 설명선의 첫 줄을 시설물 이름으로 사용 (있으면)
            Dim lblShp As Shape: Set lblShp = Nothing
            On Error Resume Next
            Set lblShp = ws.Shapes(PREFIX_LABEL & otherId)
            On Error GoTo 0
            If Not lblShp Is Nothing Then
                On Error Resume Next
                Dim t As String: t = lblShp.TextFrame2.TextRange.Text
                If InStr(t, vbCr) > 0 Then t = Left(t, InStr(t, vbCr) - 1)
                If InStr(t, vbLf) > 0 Then t = Left(t, InStr(t, vbLf) - 1)
                If Len(Trim(t)) > 0 Then otherName = Trim(t)
                On Error GoTo 0
            End If
            ' installation_type — 메타에 없으면 ""
            Dim installation As String: installation = ""
            ' value 형식: "otherId|otherName|spec|installation"
            g_pt_radial(cblId) = otherId & "|" & otherName & "|" & spec & "|" & installation
        End If
NextCblRow:
    Next r

    ' 진단 — stale 메타 있으면 status bar 에 표시 (owner 가 메타 정리 가능)
    If staleCount > 0 Then
        Application.StatusBar = "코어 연결 — 메타에 stale 케이블 " & staleCount & "건 (캔버스 도형 없음) 발견·무시. 실제 케이블 " & g_pt_radial.Count & "건."
    End If

    If g_pt_radial.Count = 0 Then
        MsgBox "이 시설물에 연결된 케이블이 없습니다.", vbExclamation, "코어 연결"
        Exit Sub
    End If

    ' owner 2026-06-06: 케이블 1개만 연결된 시설물 — Step 1 (케이블 2개 선택) 건너뛰고 자동 Step 2 직행.
    '   분기: RN 시설물 → Step2진입_RN1 (spec 비워 picker UI 자동 — InputBox 없음)
    '         일반 시설물 → Step2진입(cable, facility) — facility 코어수 InputBox
    '   기존 가드 (count < 2 차단) 제거 — 단일 케이블 종단점에서도 코어 연결 가능.
    If g_pt_radial.Count = 1 Then
        Dim onlyCblId As String: onlyCblId = ""
        Dim kOnly As Variant
        For Each kOnly In g_pt_radial.Keys
            onlyCblId = CStr(kOnly)
            Exit For
        Next kOnly
        ' Step 1 state 최소 채움 (기존수집·UI 가 cbl1Name 참조)
        '   owner 2026-06-06: picked dict 에 cable + facility 둘 다 1 씩 채움 → 총슬롯 = 2.
        '     사용자가 매핑 UI 진입 후 다시 「코어 선택」 버튼 눌러도 케이블선택완료 가 차단 안 함 (RN1/시설물 모드 자동 분기).
        g_pt_step = 1
        Set g_pt_pickedCables = CreateObject("Scripting.Dictionary")
        g_pt_pickedCables(onlyCblId) = 1
        g_pt_pickedCables(g_pt_facId) = 1
        g_pt_cbl1Name = onlyCblId
        g_pt_cbl2Name = ""
        선번연결_도구_기존수집

        ' owner 2026-06-06: 방사형 캔버스 새로 그리기 — 이전 시설물 잔재 도형 정리 + 셀 텍스트 갱신 + 현재 시설물의 방사형 렌더.
        '   방사형빌드 가 자체적으로 PT_RADIAL/PT_RADIALLBL 정리 + 헤더(N28-N31 셀) 갱신 + 새 도형 그리기 모두 처리.
        '   count==1 도 캔버스에 RN 중심 + 케이블 1개 시각 표시 필요 (owner: 빈 화면이면 컨텍스트 안 보임).
        '   호출 후 Step2진입 이 시트빌드로 RN1 picker / 매핑 UI 를 위에 덮어 그림 → 최종: 방사형 캔버스 + Step 2 UI 공존.
        선번연결_도구_방사형빌드 g_pt_facId

        ' owner 2026-06-06 보정: 「코어 선택」 / 「나가기」 버튼은 유지 (이전에 삭제했었음).
        '   매핑 UI 진입 후에도 사용자가 도구를 종료하거나 다른 흐름으로 돌아갈 때 필요.

        If 선번연결_도구_isRN() Then
            ' RN 시설물 — RN1 모드. saved spec/label 있으면 그대로, 없으면 picker 자동 진입 (Step2진입_RN1 내부 분기)
            Dim savedSpec As String: savedSpec = 선번연결_도구_RN규격조회()
            Dim savedLbl As String: savedLbl = g_pt_rnLabel
            선번연결_도구_Step2진입_RN1 onlyCblId, savedSpec, savedLbl
        Else
            ' 일반 시설물 — Side A = cable, Side B = facility
            선번연결_도구_Step2진입 "cable", onlyCblId, "facility", g_pt_facId
        End If
        Exit Sub
    End If

    ' Step 1 상태 — 케이블 선택 (2개)
    g_pt_step = 1
    Set g_pt_pickedCables = CreateObject("Scripting.Dictionary")

    ' Step 2 상태 (placeholder — 케이블 2개 선택 후 채워짐)
    Dim cbl1 As Shape, cbl2 As Shape: Set cbl1 = Nothing: Set cbl2 = Nothing
    Dim row1 As Variant, row2 As Variant: row1 = Empty: row2 = Empty
    Dim spec1 As String, spec2 As String: spec1 = "": spec2 = ""

    ' Step 1 에서도 기존 연결 수집 (owner 요구: Step 1 에서 연결 목록 + 삭제)
    '   cbl1Name/cbl2Name 은 아직 없으므로 빈 문자열 — Phase 1 잠금 set 은 비고 Phase 2 만 채움
    g_pt_cbl1Name = "": g_pt_cbl2Name = ""
    선번연결_도구_기존수집

    ' 방사형 도구 시트 빌드
    선번연결_도구_방사형빌드 facShp.Name
    ThisWorkbook.Worksheets(SHEET_PAIR_TOOL).Activate
    Application.StatusBar = "코어 연결 — 케이블 2개를 클릭으로 선택 후 「선택」 버튼."
End Sub

' Step 2 진입 — Step 1 의 「선택」 버튼이 호출. side1·side2 각각 ("cable"|"facility", name).
'   시설물 측은 InputBox 로 코어 수 직접 입력 (몇 코어 연결인지).
'   케이블 측은 메타에서 spec 추출 + 자동 파싱 + 실패 시 InputBox.
Public Sub 선번연결_도구_Step2진입(side1Type As String, side1Name As String, _
                                     side2Type As String, side2Name As String)
    ' 기본 진입은 RN 모드가 아님 — RN 진입은 선번연결_도구_Step2진입_RN 가 호출 후 다시 활성화
    g_pt_rnMode = False
    g_pt_rn1Mode = False
    Dim ws As Worksheet: Set ws = ThisWorkbook.Worksheets(SHEET_NETWORK)

    ' Side 1 — spec·cores
    Dim spec1 As String, totalCores1 As Long
    spec1 = "": totalCores1 = 0
    If Not 선번연결_도구_사이드정보(ws, side1Type, side1Name, "A", spec1, totalCores1) Then Exit Sub
    ' Side 2 — spec·cores
    Dim spec2 As String, totalCores2 As Long
    spec2 = "": totalCores2 = 0
    If Not 선번연결_도구_사이드정보(ws, side2Type, side2Name, "B", spec2, totalCores2) Then Exit Sub

    ' state 초기화
    Set g_pt_mappings = CreateObject("Scripting.Dictionary")
    Set g_pt_expandedA = CreateObject("Scripting.Dictionary")
    Set g_pt_expandedB = CreateObject("Scripting.Dictionary")
    Set g_pt_selA = CreateObject("Scripting.Dictionary")
    Set g_pt_selB = CreateObject("Scripting.Dictionary")
    Set g_pt_selUnitsA = CreateObject("Scripting.Dictionary")
    Set g_pt_selUnitsB = CreateObject("Scripting.Dictionary")
    g_pt_anchorA = 0: g_pt_anchorB = 0
    g_pt_count1 = totalCores1
    g_pt_count2 = totalCores2
    g_pt_cbl1Name = side1Name
    g_pt_cbl2Name = side2Name
    g_pt_side1Type = side1Type
    g_pt_side2Type = side2Type
    g_pt_spec1 = spec1
    g_pt_spec2 = spec2
    If totalCores1 <= 36 Then g_pt_unitSize1 = 6 Else g_pt_unitSize1 = 12
    If totalCores2 <= 36 Then g_pt_unitSize2 = 6 Else g_pt_unitSize2 = 12

    ' 기존 박스 수집 (시설물↔케이블 모드는 cable side 만 매칭 — limitation 보고됨)
    선번연결_도구_기존수집

    ' Step 2 전환
    g_pt_step = 2
    선번연결_도구_시트빌드
    선번연결_도구_시각갱신
    Application.StatusBar = "코어 연결 — UNIT 클릭으로 펼침 / 코어 클릭(Shift·Ctrl) 으로 다중 선택."
End Sub

' RN 3-column 모드 진입 — Cable A | RN IN/OUT grid | Cable B.
'   기존 Step2진입 을 그대로 호출해 좌·우 케이블 setup → 그 다음 RN 변수 셋업 + 재빌드.
Public Sub 선번연결_도구_Step2진입_RN(cblA As String, cblB As String, rnSpec As String, rnLabel As String)
    ' 일반 Step2 setup (cable↔cable). g_pt_rnMode = False 로 들어감
    선번연결_도구_Step2진입 "cable", cblA, "cable", cblB
    If g_pt_step <> 2 Then Exit Sub                ' setup 도중 사용자 취소

    ' owner 2026-06-05: 차수·규격 결정 — InputBox → 시트 안 picker 버튼.
    '   rnLabel 에 차수 정보 ("1차"/"2차"/"3차") 있으면 자동 채움, 그 외는 picker UI 진입.
    Dim tierGuess As Long: tierGuess = 0
    If InStr(rnLabel, "1차") > 0 Then tierGuess = 1
    If InStr(rnLabel, "2차") > 0 Then tierGuess = 2
    If InStr(rnLabel, "3차") > 0 Then tierGuess = 3
    Dim specOk As Boolean: specOk = 선번연결_도구_RN규격_유효(rnSpec)

    ' owner 2026-06-06: 기존 RN 연결정보가 있으면 picker 건너뛰고 바로 매핑 UI 진입.
    '   tier 는 기존수집이 m/s/p prefix 에서 추출한 g_pt_existingTier 우선 → 0 이면 saved spec 라벨 → fallback 1차
    '   spec 은 인자 rnSpec → saved 메타 → fallback (tier 1 = 2:16 / 2 = 1:3 / 3 = 1:16)
    Dim hasExisting As Boolean: hasExisting = (선번연결_도구_existing연결개수() > 0)
    If hasExisting Then
        If tierGuess = 0 And g_pt_existingTier >= 1 And g_pt_existingTier <= 3 Then
            tierGuess = g_pt_existingTier
        End If
        If Not specOk Then
            Dim resSpec As String: resSpec = 선번연결_도구_RN규격조회()
            If 선번연결_도구_RN규격_유효(resSpec) Then
                rnSpec = resSpec
                specOk = True
            End If
        End If
        If specOk And tierGuess = 0 Then
            Dim derivedLbl As String: derivedLbl = 선번연결_도구_RN규격라벨(rnSpec)
            If InStr(derivedLbl, "1차") > 0 Then tierGuess = 1
            If InStr(derivedLbl, "2차") > 0 Then tierGuess = 2
            If InStr(derivedLbl, "3차") > 0 Then tierGuess = 3
            If tierGuess = 0 Then tierGuess = 1                    ' 최종 fallback — 임의 1차
        End If
        If tierGuess >= 1 And tierGuess <= 3 And Not specOk Then
            Select Case tierGuess
                Case 1: rnSpec = "2:16"
                Case 2: rnSpec = "1:3"
                Case 3: rnSpec = "1:16"
            End Select
            specOk = True
        End If
        If Len(rnLabel) = 0 And specOk Then rnLabel = 선번연결_도구_RN규격라벨(rnSpec)
    End If

    If tierGuess = 0 Or Not specOk Then
        ' 시트 안 picker 진입 — 사용자가 버튼으로 차수·규격 선택 후 「확인」 누르면 본 함수 재진입.
        g_pt_rnPickerMode = True
        g_pt_rnPickerCblA = cblA
        g_pt_rnPickerCblB = cblB
        g_pt_rnPickerIsRN1 = False
        g_pt_rnLabel = rnLabel
        g_pt_rnTier = tierGuess
        If specOk Then g_pt_rnSpec = Trim(rnSpec) Else g_pt_rnSpec = ""
        선번연결_도구_시트빌드
        On Error Resume Next
        ThisWorkbook.Worksheets(SHEET_PAIR_TOOL).Activate
        On Error GoTo 0
        Application.StatusBar = "RN 차수·규격 선택 — 버튼으로 고른 뒤 「확인」 을 누르세요."
        Exit Sub
    End If

    Dim outTier As Long, outSpec As String
    outTier = tierGuess: outSpec = Trim(rnSpec)

    ' RN spec 파싱
    Dim cp As Long: cp = InStr(outSpec, ":")
    Dim inN As Long, outN As Long
    inN = 0: outN = 0
    If cp > 0 Then
        Dim mStr As String, nStr As String
        mStr = Trim(Left(outSpec, cp - 1))
        nStr = Trim(Mid(outSpec, cp + 1))
        If IsNumeric(mStr) And IsNumeric(nStr) Then
            inN = CLng(mStr): outN = CLng(nStr)
        End If
    End If
    If inN <= 0 Or outN <= 0 Then
        MsgBox "RN 규격 파싱 실패: " & outSpec, vbExclamation, "RN 모드"
        Exit Sub
    End If

    g_pt_rnSpec = outSpec
    g_pt_rnLabel = rnLabel
    g_pt_rnTier = outTier
    g_pt_rnInCount = inN
    g_pt_rnOutCount = outN
    Set g_pt_selRN_IN = CreateObject("Scripting.Dictionary")
    Set g_pt_selRN_OUT = CreateObject("Scripting.Dictionary")
    Set g_pt_mappingsA_IN = CreateObject("Scripting.Dictionary")
    Set g_pt_mappingsOUT_B = CreateObject("Scripting.Dictionary")
    ' owner 2026-06-05: RN1 모드의 stale 매핑 정리 — 2-cable RN 진입 시 mappingsA_OUT 이 이전 세션 값 보존하고 있으면
    '   Cable A·OUT 박스가 잘못 [V] 로 표시됨. 명시 초기화.
    Set g_pt_mappingsA_OUT = CreateObject("Scripting.Dictionary")
    ' owner 2026-06-05: existing 잠금 dict 는 기존수집 이 이미 채워둠 — 덮어쓰기 금지.
    If g_pt_existingMappingsA_OUT Is Nothing Then Set g_pt_existingMappingsA_OUT = CreateObject("Scripting.Dictionary")
    If g_pt_existingRN_IN Is Nothing Then Set g_pt_existingRN_IN = CreateObject("Scripting.Dictionary")
    If g_pt_existingRN_OUT Is Nothing Then Set g_pt_existingRN_OUT = CreateObject("Scripting.Dictionary")
    g_pt_anchorRN_IN = 0: g_pt_anchorRN_OUT = 0
    g_pt_rnMode = True

    ' RN 3-column 시트 재빌드
    선번연결_도구_시트빌드
    선번연결_도구_시각갱신
    Dim outLbl As String: outLbl = 선번연결_도구_RN차수출력라벨(outTier)
    Application.StatusBar = "RN 모드 [" & 선번연결_도구_RN차수표시(outTier) & " · " & outSpec & _
                            " · 입력 i / 출력 " & outLbl & "] — A↔IN + OUT↔B 매핑 후 「연결완료」."
End Sub

' owner 변경 (RN1 모드) — RN + 케이블 1개. Cable A 코어 ↔ RN IN/OUT 매핑.
'   Cable A 만 사용 (Cable B 없음). 가운데 RN IN/OUT 박스 그대로 + 우 영역 비활성.
Public Sub 선번연결_도구_Step2진입_RN1(cblA As String, rnSpec As String, rnLabel As String)
    ' 단일 케이블 모드로 Step 2 setup (Cable B = Cable A 동일 — 기존 단일 케이블 패턴)
    선번연결_도구_Step2진입 "cable", cblA, "cable", cblA
    If g_pt_step <> 2 Then Exit Sub

    ' owner 2026-06-05: 차수·규격 결정 — InputBox → 시트 안 picker 버튼.
    Dim tierGuess1 As Long: tierGuess1 = 0
    If InStr(rnLabel, "1차") > 0 Then tierGuess1 = 1
    If InStr(rnLabel, "2차") > 0 Then tierGuess1 = 2
    If InStr(rnLabel, "3차") > 0 Then tierGuess1 = 3
    Dim specOk1 As Boolean: specOk1 = 선번연결_도구_RN규격_유효(rnSpec)

    ' owner 2026-06-06: 기존 RN 연결정보가 있으면 picker 건너뛰고 바로 매핑 UI 진입 (Step2진입_RN 와 동일 로직).
    Dim hasExisting1 As Boolean: hasExisting1 = (선번연결_도구_existing연결개수() > 0)
    If hasExisting1 Then
        If tierGuess1 = 0 And g_pt_existingTier >= 1 And g_pt_existingTier <= 3 Then
            tierGuess1 = g_pt_existingTier
        End If
        If Not specOk1 Then
            Dim resSpec1 As String: resSpec1 = 선번연결_도구_RN규격조회()
            If 선번연결_도구_RN규격_유효(resSpec1) Then
                rnSpec = resSpec1
                specOk1 = True
            End If
        End If
        If specOk1 And tierGuess1 = 0 Then
            Dim derivedLbl1 As String: derivedLbl1 = 선번연결_도구_RN규격라벨(rnSpec)
            If InStr(derivedLbl1, "1차") > 0 Then tierGuess1 = 1
            If InStr(derivedLbl1, "2차") > 0 Then tierGuess1 = 2
            If InStr(derivedLbl1, "3차") > 0 Then tierGuess1 = 3
            If tierGuess1 = 0 Then tierGuess1 = 1                    ' 최종 fallback — 임의 1차
        End If
        If tierGuess1 >= 1 And tierGuess1 <= 3 And Not specOk1 Then
            Select Case tierGuess1
                Case 1: rnSpec = "2:16"
                Case 2: rnSpec = "1:3"
                Case 3: rnSpec = "1:16"
            End Select
            specOk1 = True
        End If
        If Len(rnLabel) = 0 And specOk1 Then rnLabel = 선번연결_도구_RN규격라벨(rnSpec)
    End If

    If tierGuess1 = 0 Or Not specOk1 Then
        g_pt_rnPickerMode = True
        g_pt_rnPickerCblA = cblA
        g_pt_rnPickerCblB = cblA               ' RN1 — 단일 케이블
        g_pt_rnPickerIsRN1 = True
        g_pt_rnLabel = rnLabel
        g_pt_rnTier = tierGuess1
        If specOk1 Then g_pt_rnSpec = Trim(rnSpec) Else g_pt_rnSpec = ""
        선번연결_도구_시트빌드
        On Error Resume Next
        ThisWorkbook.Worksheets(SHEET_PAIR_TOOL).Activate
        On Error GoTo 0
        Application.StatusBar = "RN1 차수·규격 선택 — 버튼으로 고른 뒤 「확인」 을 누르세요."
        Exit Sub
    End If

    Dim outTier1 As Long, outSpec1 As String
    outTier1 = tierGuess1: outSpec1 = Trim(rnSpec)

    ' RN spec 파싱
    Dim cp As Long: cp = InStr(outSpec1, ":")
    Dim inN As Long, outN As Long
    inN = 0: outN = 0
    If cp > 0 Then
        Dim mStr As String, nStr As String
        mStr = Trim(Left(outSpec1, cp - 1))
        nStr = Trim(Mid(outSpec1, cp + 1))
        If IsNumeric(mStr) And IsNumeric(nStr) Then
            inN = CLng(mStr): outN = CLng(nStr)
        End If
    End If
    If inN <= 0 Or outN <= 0 Then
        MsgBox "RN 규격 파싱 실패: " & outSpec1, vbExclamation, "RN1 모드"
        Exit Sub
    End If

    g_pt_rnSpec = outSpec1
    g_pt_rnLabel = rnLabel
    g_pt_rnTier = outTier1
    g_pt_rnInCount = inN
    g_pt_rnOutCount = outN
    ' selection·매핑 dict 는 새 세션이라 초기화 (이전 매핑은 already-committed 라 existing 으로 이동)
    Set g_pt_selRN_IN = CreateObject("Scripting.Dictionary")
    Set g_pt_selRN_OUT = CreateObject("Scripting.Dictionary")
    Set g_pt_mappingsA_IN = CreateObject("Scripting.Dictionary")
    Set g_pt_mappingsA_OUT = CreateObject("Scripting.Dictionary")    ' 신규 RN1 매핑 dict
    ' owner 2026-06-05: 2-cable 모드의 stale 매핑 정리 — RN1 진입 시 mappingsOUT_B 가 이전 세션 값 보존하고 있으면
    '   OUT 박스가 잘못 [V] 로 표시됨. 명시 초기화.
    Set g_pt_mappingsOUT_B = CreateObject("Scripting.Dictionary")
    ' owner 2026-06-05: existing 잠금 dict 들은 기존수집 이 이미 채워둠 — 덮어쓰기 금지 (있을 때만 그대로 사용).
    '   이전엔 여기서 빈 dict 로 reset → existing OUT 매핑 사라져 연결선 안 그려지던 버그.
    If g_pt_existingRN_IN Is Nothing Then Set g_pt_existingRN_IN = CreateObject("Scripting.Dictionary")
    If g_pt_existingRN_OUT Is Nothing Then Set g_pt_existingRN_OUT = CreateObject("Scripting.Dictionary")
    If g_pt_existingMappingsA_OUT Is Nothing Then Set g_pt_existingMappingsA_OUT = CreateObject("Scripting.Dictionary")
    g_pt_anchorRN_IN = 0: g_pt_anchorRN_OUT = 0
    g_pt_rnMode = True             ' 시트빌드 RN 3-column 사용 (가운데 IN/OUT)
    g_pt_rn1Mode = True             ' RN1 추가 분기 활성 (Cable B 영역 비활성 + 클릭 분기)

    ' 시트 재빌드 + 시각갱신
    선번연결_도구_시트빌드
    선번연결_도구_시각갱신
    Application.StatusBar = "RN1 모드 [" & rnLabel & " " & rnSpec & "] — Cable 코어 ↔ RN IN/OUT 매핑 후 「연결완료」."
End Sub

' 사이드 정보 추출 — 케이블이면 메타·자동파싱·InputBox 폴백, 시설물이면 InputBox 직접.
'   결과: outSpec·outCores 설정. 사용자 취소 시 False 반환.
Public Function 선번연결_도구_사이드정보(ws As Worksheet, sType As String, sName As String, _
                                          sideLabel As String, ByRef outSpec As String, _
                                          ByRef outCores As Long) As Boolean
    선번연결_도구_사이드정보 = False
    outSpec = "": outCores = 0

    If sType = "cable" Then
        Dim cbl As Shape: Set cbl = Nothing
        On Error Resume Next
        Set cbl = ws.Shapes(sName)
        On Error GoTo 0
        If cbl Is Nothing Then
            MsgBox "케이블 도형을 찾지 못했습니다: " & sName, vbExclamation, "코어 연결"
            Exit Function
        End If
        Dim row1 As Variant
        row1 = MetaFindRow(SHEET_META_CBL, 1, sName)
        If IsEmpty(row1) Then
            MsgBox "케이블 메타를 못 찾았습니다: " & sName, vbExclamation, "코어 연결"
            Exit Function
        End If
        On Error Resume Next
        outSpec = CStr(row1(4))
        On Error GoTo 0
        outCores = 케이블규격_코어수_추출(outSpec)
        If outCores <= 0 Then
            Dim inp As String
            inp = InputBox("Cable " & sideLabel & " 규격: 「" & outSpec & "」" & vbLf & _
                           "규격에서 코어 수가 자동 파싱되지 않습니다." & vbLf & _
                           "총 코어 수를 입력하세요 (예: 12, 24, 144):", _
                           "코어 연결 — Cable " & sideLabel & " 코어 수", "")
            If Len(Trim(inp)) = 0 Or Not IsNumeric(inp) Then Exit Function
            outCores = CLng(inp)
            If outCores <= 0 Then Exit Function
        End If
        선번연결_도구_사이드정보 = True
        Exit Function
    End If

    ' sType = "facility" — 시설물 내부 접속 (국사·RN). 코어 수를 사용자가 직접 입력.
    Dim facName As String: facName = sName
    Dim lblShp As Shape: Set lblShp = Nothing
    On Error Resume Next
    Set lblShp = ws.Shapes(PREFIX_LABEL & sName)
    On Error GoTo 0
    If Not lblShp Is Nothing Then
        On Error Resume Next
        Dim t As String: t = lblShp.TextFrame2.TextRange.Text
        If InStr(t, vbCr) > 0 Then t = Left(t, InStr(t, vbCr) - 1)
        If InStr(t, vbLf) > 0 Then t = Left(t, InStr(t, vbLf) - 1)
        If Len(Trim(t)) > 0 Then facName = Trim(t)
        On Error GoTo 0
    End If

    Dim facInp As String
    facInp = InputBox("기준 시설물: 「" & facName & "」" & vbLf & _
                      "내부 접속 코어 수를 입력하세요 (예: 6, 12, 24, 48):" & vbLf & _
                      "(국사 MOFD·OJC, RN 내부 포트 등)", _
                      "코어 연결 — 시설물 내부 코어 수", "12")
    If Len(Trim(facInp)) = 0 Or Not IsNumeric(facInp) Then Exit Function
    outCores = CLng(facInp)
    If outCores <= 0 Then Exit Function
    outSpec = "내부 " & outCores & "C"
    선번연결_도구_사이드정보 = True
End Function

' 기존 박스 수집 — 같은 (cbl1, cbl2, facId) 짝의 _pairbox_ / _pairarrow_ 를 검색.
'   같은 화살표로 묶인 두 박스의 텍스트를 파싱해 점유 코어 set 빌드.
'   결과: g_pt_existingA / g_pt_existingB (잠금된 코어), g_pt_existingConns (삭제 목록).
Public Sub 선번연결_도구_기존수집()
    Set g_pt_existingA = CreateObject("Scripting.Dictionary")
    Set g_pt_existingB = CreateObject("Scripting.Dictionary")
    Set g_pt_existingConns = CreateObject("Scripting.Dictionary")
    Set g_pt_existingMappings = CreateObject("Scripting.Dictionary")
    Set g_pt_existingRN_IN = CreateObject("Scripting.Dictionary")
    Set g_pt_existingRN_OUT = CreateObject("Scripting.Dictionary")
    Set g_pt_existingMappingsA_IN = CreateObject("Scripting.Dictionary")
    Set g_pt_existingMappingsOUT_B = CreateObject("Scripting.Dictionary")
    Set g_pt_existingMappingsA_OUT = CreateObject("Scripting.Dictionary")    ' RN1 모드 — A↔OUT 잠금 매핑
    g_pt_existingTier = 0                                                    ' owner 2026-06-06: 기존 m/s/p prefix 발견 시 1/2/3 으로 갱신

    Dim wsNw As Worksheet
    On Error Resume Next
    Set wsNw = ThisWorkbook.Worksheets(SHEET_NETWORK)
    On Error GoTo 0
    If wsNw Is Nothing Then Exit Sub

    Dim facTag As String: facTag = "fac=" & g_pt_facId
    Dim tag1 As String: tag1 = "cbl=" & g_pt_cbl1Name
    Dim tag2 As String: tag2 = "cbl=" & g_pt_cbl2Name

    ' ──────────────────────────────────────────────────────────────────
    ' Phase 0: anchor 자동 복구 (owner 2026-06-05) —
    '   사용자가 박스 옮기다 영역 선택으로 invisible anchor 를 실수 삭제한 경우,
    '   박스 alt 의 peer 정보로 anchor 자동 재생성. 데이터 손실 0.
    ' ──────────────────────────────────────────────────────────────────
    Dim anchorPairs As Object: Set anchorPairs = CreateObject("Scripting.Dictionary")
    Dim boxesWithArrow As Object: Set boxesWithArrow = CreateObject("Scripting.Dictionary")    ' owner 2026-06-07 (8-78): 고아 PAIRBOX 정리용
    Dim phShp As Shape, phAlt As String
    For Each phShp In wsNw.Shapes
        If Left(phShp.Name, Len(PREFIX_PAIRARROW)) = PREFIX_PAIRARROW Then
            phAlt = "": On Error Resume Next: phAlt = phShp.AlternativeText: On Error GoTo 0
            Dim ap1 As Long: ap1 = InStr(phAlt, "box1=")
            Dim ap2 As Long: ap2 = InStr(phAlt, "|box2=")
            If ap1 = 1 And ap2 > ap1 Then
                Dim ab1 As String, ab2 As String
                ab1 = Mid(phAlt, ap1 + 5, ap2 - (ap1 + 5))
                Dim ap3 As Long: ap3 = InStr(ap2 + 6, phAlt, "|")
                If ap3 = 0 Then ap3 = Len(phAlt) + 1
                ab2 = Mid(phAlt, ap2 + 6, ap3 - (ap2 + 6))
                anchorPairs(ab1 & "|" & ab2) = True
                anchorPairs(ab2 & "|" & ab1) = True
                ' owner 2026-06-07 (8-78): 짝 화살표 있는 박스 이름 따로 기록 — Phase 0.5 고아 정리에서 사용
                boxesWithArrow(ab1) = True
                boxesWithArrow(ab2) = True
                ' backfill — 살아있는 anchor 의 box1/box2 에 peer 정보 stamp (기존 박스 retroactive)
                Dim bf1 As Shape, bf2 As Shape: Set bf1 = Nothing: Set bf2 = Nothing
                On Error Resume Next
                Set bf1 = wsNw.Shapes(ab1)
                Set bf2 = wsNw.Shapes(ab2)
                On Error GoTo 0
                If Not bf1 Is Nothing And Not bf2 Is Nothing Then
                    Dim bf1Alt As String, bf2Alt As String: bf1Alt = "": bf2Alt = ""
                    On Error Resume Next
                    bf1Alt = bf1.AlternativeText
                    bf2Alt = bf2.AlternativeText
                    On Error GoTo 0
                    If InStr(bf1Alt, "peer=") = 0 Or InStr(bf2Alt, "peer=") = 0 Then
                        Dim bfCasc As Boolean: bfCasc = (InStr(phAlt, "|cascade=") > 0)
                        선번박스_alt_peer스탬프 bf1, bf2, bfCasc
                    End If
                End If
            End If
        End If
    Next phShp

    Dim pBoxShp As Shape, pBoxAlt As String
    For Each pBoxShp In wsNw.Shapes
        If Left(pBoxShp.Name, Len(PREFIX_PAIRBOX)) = PREFIX_PAIRBOX Then
            pBoxAlt = "": On Error Resume Next: pBoxAlt = pBoxShp.AlternativeText: On Error GoTo 0
            Dim pPeer As Long: pPeer = InStr(pBoxAlt, "peer=")
            If pPeer > 0 Then
                Dim sPeer As Long: sPeer = pPeer + 5
                Dim ePeer As Long: ePeer = InStr(sPeer, pBoxAlt, "|")
                If ePeer = 0 Then ePeer = Len(pBoxAlt) + 1
                Dim peerName As String: peerName = Mid(pBoxAlt, sPeer, ePeer - sPeer)
                If Len(peerName) > 0 Then
                    Dim pairKey As String: pairKey = pBoxShp.Name & "|" & peerName
                    If Not anchorPairs.Exists(pairKey) Then
                        Dim peerShp As Shape: Set peerShp = Nothing
                        On Error Resume Next: Set peerShp = wsNw.Shapes(peerName): On Error GoTo 0
                        If Not peerShp Is Nothing Then
                            ' peer 박스의 alt 도 자기를 가리키는지 확인 (양방향 일치)
                            Dim peerAlt As String: peerAlt = ""
                            On Error Resume Next: peerAlt = peerShp.AlternativeText: On Error GoTo 0
                            If InStr(peerAlt, "peer=" & pBoxShp.Name) > 0 Then
                                ' cascade 여부 추출 (둘 중 cascade=1 있으면 cascade)
                                Dim isCasc As Boolean: isCasc = False
                                If InStr(pBoxAlt, "cascade=1") > 0 Or InStr(peerAlt, "cascade=1") > 0 Then isCasc = True
                                선번박스_anchor_재생성 wsNw, pBoxShp, peerShp, isCasc
                                anchorPairs(pairKey) = True
                                anchorPairs(peerName & "|" & pBoxShp.Name) = True
                                ' owner 2026-06-07 (8-78): 복구된 anchor 의 두 박스도 boxesWithArrow 에 기록
                                boxesWithArrow(pBoxShp.Name) = True
                                boxesWithArrow(peerName) = True
                            End If
                        End If
                    End If
                End If
            End If
        End If
    Next pBoxShp

    ' ──────────────────────────────────────────────────────────────────
    ' Phase 1: 잠금 set 빌드 — 같은 케이블에 속한 모든 박스 (시설물 무관!)
    '   Step 1 (cbl1Name/cbl2Name 빈 문자열) 일 때는 건너뜀 (코어 선택 전이라 불필요).
    ' ──────────────────────────────────────────────────────────────────
    Dim sh As Shape, alt As String
    If Len(g_pt_cbl1Name) = 0 Or Len(g_pt_cbl2Name) = 0 Then GoTo SkipPhase1

    ' ──────────────────────────────────────────────────────────────────
    ' Phase 0.5: 고아 PAIRBOX 정리 (owner 2026-06-07 (8-78)) —
    '   짝 화살표(PAIRARROW) 없는 PAIRBOX 는 Phase 1 잠금 표시 (「[잠] N」) 만 잡히고
    '   「기존 연결 N 건」 카운트엔 안 잡힘 → UX 모순 (사용자에게 안 보이는데 잠금만 잡힘).
    '   Step 2 진입 시점 (cbl1/cbl2 둘 다 set) 에만 실행 — Step 1 에선 건너뜀.
    ' ──────────────────────────────────────────────────────────────────
    Dim orphanColl As Collection: Set orphanColl = New Collection
    Dim oShp As Shape
    For Each oShp In wsNw.Shapes
        If Left(oShp.Name, Len(PREFIX_PAIRBOX)) = PREFIX_PAIRBOX Then
            If Not boxesWithArrow.Exists(oShp.Name) Then
                orphanColl.Add oShp
            End If
        End If
    Next oShp
    Dim oi As Long
    For oi = 1 To orphanColl.Count
        On Error Resume Next: orphanColl(oi).Delete: On Error GoTo 0
    Next oi

    ' owner 2026-06-05: 견고한 매칭 — fac=facId 필수 필터 + cbl 값 추출 후 cbl1Name/cbl2Name 직접 비교.
    '   이전 InStr 기반 substring 매칭은 cbl 이름이 비슷할 때 오작동 가능 + 다른 facility 의 박스도 매칭될 수 있음.
    For Each sh In wsNw.Shapes
        If Left(sh.Name, Len(PREFIX_PAIRBOX)) = PREFIX_PAIRBOX Then
            alt = "": On Error Resume Next: alt = sh.AlternativeText: On Error GoTo 0
            If Len(alt) = 0 Then GoTo NextLockBox
            ' fac=facId 필수
            If InStr(alt, facTag) = 0 Then GoTo NextLockBox

            ' alt 에서 cbl 값 추출
            Dim pCblL As Long: pCblL = InStr(alt, "cbl=")
            If pCblL = 0 Then GoTo NextLockBox
            Dim sCblL As Long: sCblL = pCblL + 4
            Dim eCblL As Long: eCblL = InStr(sCblL, alt, "|")
            If eCblL = 0 Then eCblL = Len(alt) + 1
            Dim cblNameL As String: cblNameL = Mid(alt, sCblL, eCblL - sCblL)

            ' 현재 선택된 cbl1/cbl2 와 직접 비교
            Dim onA As Boolean, onB As Boolean
            onA = (cblNameL = g_pt_cbl1Name)
            onB = (cblNameL = g_pt_cbl2Name)
            ' 단일 케이블 모드 (cbl1==cbl2)면 onA=onB=True → 같은 박스 코어가 양쪽 잠금에 들어감

            If onA Or onB Then
                Dim txt As String: txt = ""
                On Error Resume Next
                txt = sh.TextFrame2.TextRange.Text
                On Error GoTo 0
                Dim nums As Variant
                선번_파싱 txt, nums
                If Not IsEmpty(nums) Then
                    Dim ki As Long
                    For ki = LBound(nums) To UBound(nums)
                        If onA Then g_pt_existingA(CLng(nums(ki))) = True
                        If onB Then g_pt_existingB(CLng(nums(ki))) = True
                    Next ki
                End If
            End If
NextLockBox:
        End If
    Next sh
SkipPhase1:

    ' ──────────────────────────────────────────────────────────────────
    ' Phase 2: 「기존 연결」 카드 목록 — 이 시설물의 모든 짝 (cbl1/cbl2 한정 X, owner 요구).
    '   Step 1: Step 2 진입 전에도 모든 연결 보이게 / Step 2: 화면에 모두 표시.
    '   value 형식: "boxA|boxB|coresA|coresB|cableA_name|cableB_name"
    ' ──────────────────────────────────────────────────────────────────
    Dim boxFacMatch As Object: Set boxFacMatch = CreateObject("Scripting.Dictionary")
    Dim boxCableName As Object: Set boxCableName = CreateObject("Scripting.Dictionary")
    For Each sh In wsNw.Shapes
        If Left(sh.Name, Len(PREFIX_PAIRBOX)) = PREFIX_PAIRBOX Then
            alt = "": On Error Resume Next: alt = sh.AlternativeText: On Error GoTo 0
            If InStr(alt, facTag) > 0 Then
                ' 이 시설물 박스. cbl=<name> 추출
                Dim pCbl As Long: pCbl = InStr(alt, "cbl=")
                If pCbl > 0 Then
                    Dim startPos As Long: startPos = pCbl + 4
                    Dim endPos As Long: endPos = InStr(startPos, alt, "|")
                    If endPos = 0 Then endPos = Len(alt) + 1
                    boxCableName(sh.Name) = Mid(alt, startPos, endPos - startPos)
                    boxFacMatch(sh.Name) = True
                End If
            End If
        End If
    Next sh

    Dim arr As Shape, b1 As String, b2 As String
    For Each arr In wsNw.Shapes
        If Left(arr.Name, Len(PREFIX_PAIRARROW)) = PREFIX_PAIRARROW Then
            alt = "": On Error Resume Next: alt = arr.AlternativeText: On Error GoTo 0
            b1 = "": b2 = ""
            Dim p1 As Long, p2 As Long
            p1 = InStr(alt, "box1=")
            p2 = InStr(alt, "box2=")
            If p1 > 0 And p2 > 0 Then
                b1 = Mid(alt, p1 + 5, p2 - p1 - 6)
                ' box2 다음 「|」 까지 자르기 — RN 화살표는 alt 끝에 |rngrp=<id> 가 추가돼서 그게 b2 에 포함되면 도형 매칭 실패
                Dim p2End As Long: p2End = InStr(p2, alt, "|")
                If p2End = 0 Then p2End = Len(alt) + 1
                b2 = Mid(alt, p2 + 5, p2End - (p2 + 5))
            End If
            If Len(b1) > 0 And Len(b2) > 0 Then
                If boxFacMatch.Exists(b1) And boxFacMatch.Exists(b2) Then
                    Dim shA As Shape, shB As Shape
                    Set shA = Nothing: Set shB = Nothing
                    On Error Resume Next
                    Set shA = wsNw.Shapes(b1)
                    Set shB = wsNw.Shapes(b2)
                    On Error GoTo 0
                    If shA Is Nothing Or shB Is Nothing Then GoTo NextArr

                    Dim txtA As String, txtB As String
                    txtA = "": txtB = ""
                    On Error Resume Next
                    txtA = shA.TextFrame2.TextRange.Text
                    txtB = shB.TextFrame2.TextRange.Text
                    On Error GoTo 0

                    Dim cblAName As String, cblBName As String
                    cblAName = CStr(boxCableName(b1))
                    cblBName = CStr(boxCableName(b2))

                    ' 형식: boxA|boxB|coresA|coresB|cableA|cableB
                    g_pt_existingConns(arr.Name) = b1 & "|" & b2 & "|" & txtA & "|" & txtB & "|" & cblAName & "|" & cblBName

                    ' g_pt_existingMappings — 코어 1:1 매핑 추출 (잠금 시각화용).
                    '   coresA 와 coresB 는 같은 순서로 짝지어진 배열이라고 가정 (확인 함수 동작 일관).
                    '   Cable A 가 tag1 매치인 쪽으로 정규화 (cable 1↔A, 2↔B 가 박스 순서로 뒤바뀔 수 있으므로)
                    Dim altA As String, altB As String
                    altA = "": altB = ""
                    On Error Resume Next
                    altA = shA.AlternativeText
                    altB = shB.AlternativeText
                    On Error GoTo 0
                    Dim aIsCbl1 As Boolean, aIsCbl2 As Boolean
                    aIsCbl1 = (Len(g_pt_cbl1Name) > 0 And InStr(altA, tag1) > 0)
                    aIsCbl2 = (Len(g_pt_cbl2Name) > 0 And InStr(altA, tag2) > 0)
                    Dim leftCoresTxt As String, rightCoresTxt As String
                    If aIsCbl1 Then
                        leftCoresTxt = txtA: rightCoresTxt = txtB
                    ElseIf aIsCbl2 Then
                        leftCoresTxt = txtB: rightCoresTxt = txtA
                    Else
                        ' Step 1 (cbl 미선택) 이면 매핑 사이드 결정 불가 — 건너뜀
                        GoTo NextArr
                    End If
                    Dim numsL As Variant, numsR As Variant
                    선번_파싱 leftCoresTxt, numsL
                    선번_파싱 rightCoresTxt, numsR
                    If Not IsEmpty(numsL) And Not IsEmpty(numsR) Then
                        Dim mi As Long, mn As Long
                        mn = UBound(numsL): If UBound(numsR) < mn Then mn = UBound(numsR)
                        For mi = 0 To mn
                            g_pt_existingMappings(CLng(numsL(mi))) = CLng(numsR(mi))
                        Next mi
                    End If
                End If
            End If
NextArr:
        End If
    Next arr

    ' ──────────────────────────────────────────────────────────────────
    ' Phase 3: RN IN/OUT 잠금 복원 — 시트 저장·재오픈 후에도 잠금 정보 유지.
    '   기준 시설물의 모든 RN 박스 (alt 에 fac=facId + rn=IN/OUT) 텍스트에서 코어 번호 추출.
    '   라벨 박스 (rn_lbl=IN/P) 는 제외 — 텍스트가 "IN"/"P" 라 코어 번호 아님.
    ' ──────────────────────────────────────────────────────────────────
    Dim shRn As Shape, altRn As String
    For Each shRn In wsNw.Shapes
        If Left(shRn.Name, Len(PREFIX_PAIRBOX)) = PREFIX_PAIRBOX Then
            altRn = "": On Error Resume Next: altRn = shRn.AlternativeText: On Error GoTo 0
            If InStr(altRn, facTag) > 0 And InStr(altRn, "rn_lbl=") = 0 Then
                Dim pRn As Long: pRn = InStr(altRn, "rn=")
                If pRn > 0 Then
                    Dim rnEnd As Long: rnEnd = InStr(pRn, altRn, "|")
                    If rnEnd = 0 Then rnEnd = Len(altRn) + 1
                    Dim rnTag As String: rnTag = Mid(altRn, pRn + 3, rnEnd - (pRn + 3))
                    If rnTag = "IN" Or rnTag = "OUT" Then
                        Dim rnTxt As String: rnTxt = ""
                        On Error Resume Next: rnTxt = shRn.TextFrame2.TextRange.Text: On Error GoTo 0
                        ' owner 2026-06-05: RN1 박스는 IN+OUT 통합 가능 — "i_1,m_2,m_3" 등.
                        '   token 별로 prefix 검사해 IN/OUT 분리.
                        Dim tokens() As String: tokens = Split(rnTxt, ",")
                        Dim tk As Long
                        For tk = LBound(tokens) To UBound(tokens)
                            Dim tt As String: tt = Trim(tokens(tk))
                            If Len(tt) > 0 Then
                                Dim usP As Long: usP = InStr(tt, "_")
                                Dim pref As String, numStr As String
                                If usP > 0 Then
                                    pref = LCase(Left(tt, usP - 1))
                                    numStr = Mid(tt, usP + 1)
                                Else
                                    pref = ""
                                    numStr = tt
                                End If
                                If IsNumeric(numStr) Then
                                    Dim nn As Long: nn = CLng(numStr)
                                    Select Case pref
                                        Case "i":              g_pt_existingRN_IN(nn) = True
                                        Case "m", "s", "p":    g_pt_existingRN_OUT(nn) = True
                                        Case Else
                                            ' prefix 없음 — 박스 alt 의 rn= 값으로 fallback (legacy 호환)
                                            If rnTag = "IN" Then g_pt_existingRN_IN(nn) = True _
                                            Else g_pt_existingRN_OUT(nn) = True
                                    End Select
                                End If
                            End If
                        Next tk
                    End If
                End If
            End If
        End If
    Next shRn

    ' ──────────────────────────────────────────────────────────────────
    ' Phase 4: RN 그룹 매핑 복원 — 그룹 안 화살표 (box1=Cable side · box2=RN side) 페어 추출.
    '   결과: g_pt_existingMappingsA_IN (aCore→inCore) · g_pt_existingMappingsOUT_B (outCore→bCore).
    '   시각갱신이 회색 매핑선으로 표시 (잠금 상태에서 어느 코어가 어느 코어와 짝인지 시각 확인).
    ' ──────────────────────────────────────────────────────────────────
    Dim shRnArr As Shape, altRnArr As String
    For Each shRnArr In wsNw.Shapes
        If Left(shRnArr.Name, Len(PREFIX_PAIRARROW)) = PREFIX_PAIRARROW Then
            altRnArr = "": On Error Resume Next: altRnArr = shRnArr.AlternativeText: On Error GoTo 0
            If InStr(altRnArr, "rngrp=") > 0 Then
                ' RN 그룹 화살표 — box1=Cable A 또는 B, box2=RN IN 또는 OUT 추출
                Dim pBox1 As Long, pBox2 As Long
                pBox1 = InStr(altRnArr, "box1=")
                pBox2 = InStr(altRnArr, "box2=")
                If pBox1 > 0 And pBox2 > 0 Then
                    Dim b1NmRn As String, b2NmRn As String
                    b1NmRn = Mid(altRnArr, pBox1 + 5, pBox2 - pBox1 - 6)
                    Dim b2EndRn As Long: b2EndRn = InStr(pBox2, altRnArr, "|")
                    If b2EndRn = 0 Then b2EndRn = Len(altRnArr) + 1
                    b2NmRn = Mid(altRnArr, pBox2 + 5, b2EndRn - (pBox2 + 5))
                    Dim sh1Rn As Shape, sh2Rn As Shape
                    Set sh1Rn = Nothing: Set sh2Rn = Nothing
                    On Error Resume Next
                    Set sh1Rn = wsNw.Shapes(b1NmRn)
                    Set sh2Rn = wsNw.Shapes(b2NmRn)
                    On Error GoTo 0
                    If Not sh1Rn Is Nothing And Not sh2Rn Is Nothing Then
                        Dim alt1Rn As String, alt2Rn As String
                        alt1Rn = "": alt2Rn = ""
                        On Error Resume Next: alt1Rn = sh1Rn.AlternativeText: On Error GoTo 0
                        On Error Resume Next: alt2Rn = sh2Rn.AlternativeText: On Error GoTo 0
                        Dim txt1Rn As String, txt2Rn As String
                        txt1Rn = "": txt2Rn = ""
                        On Error Resume Next: txt1Rn = sh1Rn.TextFrame2.TextRange.Text: On Error GoTo 0
                        On Error Resume Next: txt2Rn = sh2Rn.TextFrame2.TextRange.Text: On Error GoTo 0
                        ' owner 2026-06-05: 통합 페어 박스 (콤마 텍스트) — multi-token 분기.
                        Dim hasMulti As Boolean
                        hasMulti = (InStr(txt1Rn, ",") > 0 Or InStr(txt2Rn, ",") > 0)
                        If hasMulti Then
                            Dim s1TagM As String, s2TagM As String
                            s1TagM = 선번연결_도구_alt_rn_tag(alt1Rn)
                            s2TagM = 선번연결_도구_alt_rn_tag(alt2Rn)
                            Dim cblSideTxt As String, rnSideTxt As String
                            cblSideTxt = "": rnSideTxt = ""
                            If s1TagM = "A" Then
                                cblSideTxt = txt1Rn: rnSideTxt = txt2Rn
                            ElseIf s2TagM = "A" Then
                                cblSideTxt = txt2Rn: rnSideTxt = txt1Rn
                            End If
                            If Len(cblSideTxt) > 0 Then
                                Dim cblNums As Variant
                                선번_파싱 cblSideTxt, cblNums
                                ' owner 2026-06-06 fix: rnSide 가 "3~6,7,8" 같은 범위 + 평순 혼합 가능 → 토큰 확장 필요.
                                '   기존 Split 만 → cable 측 (선번_파싱이 풀어준) 과 정렬 안 맞아 잘못된 매핑 저장.
                                Dim rnToks() As String
                                선번연결_도구_매핑토큰_확장 rnSideTxt, rnToks
                                If Not IsEmpty(cblNums) Then
                                    Dim maxK As Long: maxK = UBound(cblNums)
                                    If UBound(rnToks) - LBound(rnToks) < maxK Then maxK = UBound(rnToks) - LBound(rnToks)
                                    Dim kM As Long
                                    For kM = 0 To maxK
                                        Dim cblC As Long: cblC = CLng(cblNums(kM))
                                        Dim rnTok As String: rnTok = Trim(rnToks(LBound(rnToks) + kM))
                                        Dim usK As Long: usK = InStr(rnTok, "_")
                                        Dim prefK As String, numK As String
                                        If usK > 0 Then
                                            prefK = LCase(Left(rnTok, usK - 1))
                                            numK = Mid(rnTok, usK + 1)
                                        Else
                                            prefK = "": numK = rnTok
                                        End If
                                        If IsNumeric(numK) Then
                                            Dim portK As Long: portK = CLng(numK)
                                            Select Case prefK
                                                Case "i":              g_pt_existingMappingsA_IN(cblC) = portK
                                                Case "m":              g_pt_existingMappingsA_OUT(cblC) = portK: If g_pt_existingTier = 0 Then g_pt_existingTier = 1
                                                Case "s":              g_pt_existingMappingsA_OUT(cblC) = portK: If g_pt_existingTier = 0 Then g_pt_existingTier = 2
                                                Case "p":              g_pt_existingMappingsA_OUT(cblC) = portK: If g_pt_existingTier = 0 Then g_pt_existingTier = 3
                                            End Select
                                        End If
                                    Next kM
                                End If
                            End If
                            GoTo NextRnArrPhase4
                        End If
                        ' === single-token (legacy) — RN1 박스 텍스트 "i_1"/"P_3" 등 prefix 제거 ===
                        Dim usPos1 As Long: usPos1 = InStr(txt1Rn, "_")
                        Dim prefLeg1 As String: prefLeg1 = ""
                        If usPos1 > 0 Then
                            prefLeg1 = LCase(Left(txt1Rn, usPos1 - 1))
                            txt1Rn = Mid(txt1Rn, usPos1 + 1)
                        End If
                        Dim usPos2 As Long: usPos2 = InStr(txt2Rn, "_")
                        Dim prefLeg2 As String: prefLeg2 = ""
                        If usPos2 > 0 Then
                            prefLeg2 = LCase(Left(txt2Rn, usPos2 - 1))
                            txt2Rn = Mid(txt2Rn, usPos2 + 1)
                        End If
                        ' owner 2026-06-06: 기존 연결정보에서 차수 추출 (m/s/p) — Step2진입_RN/RN1 picker 건너뛰기용
                        If g_pt_existingTier = 0 Then
                            Dim prefLegPick As String: prefLegPick = ""
                            If prefLeg1 = "m" Or prefLeg1 = "s" Or prefLeg1 = "p" Then prefLegPick = prefLeg1
                            If Len(prefLegPick) = 0 And (prefLeg2 = "m" Or prefLeg2 = "s" Or prefLeg2 = "p") Then prefLegPick = prefLeg2
                            Select Case prefLegPick
                                Case "m": g_pt_existingTier = 1
                                Case "s": g_pt_existingTier = 2
                                Case "p": g_pt_existingTier = 3
                            End Select
                        End If
                        If IsNumeric(Trim(txt1Rn)) And IsNumeric(Trim(txt2Rn)) Then
                            ' rn= 태그로 sideKey 판별
                            Dim s1Tag As String, s2Tag As String
                            s1Tag = 선번연결_도구_alt_rn_tag(alt1Rn)
                            s2Tag = 선번연결_도구_alt_rn_tag(alt2Rn)
                            Dim v1 As Long, v2 As Long
                            v1 = CLng(Trim(txt1Rn)): v2 = CLng(Trim(txt2Rn))
                            ' A → IN
                            If s1Tag = "A" And s2Tag = "IN" Then
                                g_pt_existingMappingsA_IN(v1) = v2
                            ElseIf s1Tag = "IN" And s2Tag = "A" Then
                                g_pt_existingMappingsA_IN(v2) = v1
                            ' OUT → B (g_pt_existingMappingsOUT_B 의 key 는 OUT)
                            ElseIf s1Tag = "OUT" And s2Tag = "B" Then
                                g_pt_existingMappingsOUT_B(v1) = v2
                            ElseIf s1Tag = "B" And s2Tag = "OUT" Then
                                g_pt_existingMappingsOUT_B(v2) = v1
                            ' owner 2026-06-05: RN1 모드 — A → OUT (g_pt_existingMappingsA_OUT 의 key 는 A)
                            ElseIf s1Tag = "A" And s2Tag = "OUT" Then
                                g_pt_existingMappingsA_OUT(v1) = v2
                            ElseIf s1Tag = "OUT" And s2Tag = "A" Then
                                g_pt_existingMappingsA_OUT(v2) = v1
                            End If
                        End If
                    End If
                End If
            End If
        End If
NextRnArrPhase4:
    Next shRnArr

    ' owner 2026-06-05: 자동 박스 정렬 — 도구 refresh 마다 cascade stack + main 화살표 동기화.
    '   네트웍 시트에서 박스를 드래그한 후 도구로 돌아오거나 어떤 도구 버튼을 누르면 자동 sync.
    '   silent=True 라 상태/에러 메시지 없음 — 조건 미충족 (cable 미선택 등) 시 조용히 skip.
    선번연결_도구_박스정렬_silent True
End Sub
