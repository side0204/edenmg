Attribute VB_Name = "M2_Facility"
Option Explicit

' owner 2026-06-08 (8-115·8-116·8-123): module-level 선언 — Public 변수·상수는 모든 procedure 보다 위에 위치.
'   g_placementMode: 배치 모드 (네트웍 데코 숨김/복원 토글). 파일 닫으면 리셋.
'   g_facOnlyMode: 시설물만 보기 (데코 + 배지 숨김/복원 토글, 배치 편의). 파일 닫으면 리셋. owner 2026-06-10
'   META_PLACEMENT_UNDO: 격자 확장 Undo 백업 메타 시트명.
'   SHEET_LEGEND_FORM: 「범례」 양식 시트 — owner 가 도형 그리고 「양식 스캔」 으로 일괄 등록.
Public g_placementMode As Boolean
Public g_facOnlyMode As Boolean
Public Const META_PLACEMENT_UNDO As String = "_placement_undo"
Public Const SHEET_LEGEND_FORM As String = "범례"

' 시트의 모든 시설물에 대해 배지 위치 = 시설물 우상단으로 재배치 (시설물 이동 후 따라잡기).
'   시트_셀_클릭 이벤트에서 호출 — 사용자가 시설물 드래그한 뒤 다른 셀 클릭 시점에 보정.
Public Sub 배지_위치_동기화(Optional wsArg As Worksheet)
    Dim ws As Worksheet
    If wsArg Is Nothing Then Set ws = ActiveSheet Else Set ws = wsArg
    If ws Is Nothing Then Exit Sub

    Dim wasProt As Boolean: wasProt = ws.ProtectContents Or ws.ProtectDrawingObjects
    On Error Resume Next
    ws.Unprotect
    On Error GoTo 0

    ' owner 2026-06-09 (8-125-fix13): 8-121 폐기 → 옛 동작 복원. anchor = 설명선(callout) 우선, 없으면 시설물.
    Dim sh As Shape, badge As Shape, anc As Shape
    For Each sh In ws.Shapes
        If Left(sh.Name, Len(PREFIX_FAC)) = PREFIX_FAC Then
            Set badge = Nothing: Set anc = Nothing
            On Error Resume Next
            Set badge = ws.Shapes(PREFIX_BADGE & sh.Name)
            Set anc = ws.Shapes(PREFIX_LABEL & sh.Name)     ' callout 우선
            On Error GoTo 0
            If anc Is Nothing Then Set anc = sh             ' callout 없으면 시설물 fallback
            If Not badge Is Nothing Then
                On Error Resume Next
                badge.Left = anc.Left
                badge.Top = anc.Top
                badge.ZOrder msoBringToFront
                On Error GoTo 0
            End If
        End If
    Next sh
    If wasProt Then ApplySheetProtection ws
End Sub

' 한 시트 안에서 같은 배지 번호가 2개 이상이면 그 번호들을 "1(2개), 5(3개)" 형식 문자열로 리턴.
'   「정보 동기화」 끝에 안내 메시지로 노출 — 강제 변경 X, 사용자가 수동 정정.
Public Function FindDuplicateBadges(ws As Worksheet) As String
    Dim sh As Shape, txt As String
    Dim dict As Object: Set dict = CreateObject("Scripting.Dictionary")
    For Each sh In ws.Shapes
        If Left(sh.Name, Len(PREFIX_BADGE)) = PREFIX_BADGE Then
            txt = ""
            On Error Resume Next
            txt = Trim(sh.TextFrame2.TextRange.Text)
            On Error GoTo 0
            If Len(txt) > 0 Then
                If dict.Exists(txt) Then dict(txt) = dict(txt) + 1 Else dict(txt) = 1
            End If
        End If
    Next sh
    Dim result As String, k As Variant
    For Each k In dict.Keys
        If dict(k) > 1 Then
            If Len(result) > 0 Then result = result & ", "
            result = result & k & "(" & dict(k) & "개)"
        End If
    Next k
    FindDuplicateBadges = result
End Function

' 배지 번호 자동 재정렬 — v5 「변경 보존 + swap + 중복 절대 금지」
'   owner 정책 (4 시나리오):
'     1) [1,2,3,4] → fac2 "2"→"3"          ⇒ [1, 3(보존), 2(swap), 4]   ← 안변 fac3 와 중복 → swap
'     2) [1,2,3,4] → fac1 배지 도형 삭제   ⇒ [공란, 1, 2, 3]           ← 압축
'     3) [1,2,3,4] → fac3 배지 도형 삭제   ⇒ [1, 2, 공란, 3]           ← 압축
'     4) [1,2,3,4] → fac4 "4"→"7"          ⇒ [1, 2, 3, 7(보존)]        ← 중복 없음, 다른 배지 손X
'   처리 단계:
'     A) 양 시트 배지 수집 + 변경/안변 분류 + 양 시트 통일 sync
'     B) 「배지 삭제」 (시설물 도형 있는데 배지 없음) 발생 시 → 압축 (1부터 메타 row 순, 변경 번호 skip)
'     C) 압축 안 함 + 변경 발생 시 → swap (변경 새 번호 ↔ 중복 안변의 변경 옛 번호)
'     D) 최종 중복 안전망 — 처리 후에도 중복 있으면 늦은 배지를 빈 번호로 재할당
Public Sub 배지_재정렬()
    Dim wsAd As Worksheet: Set wsAd = ThisWorkbook.Worksheets(SHEET_ADMIN)
    Dim wsNw As Worksheet
    On Error Resume Next
    Set wsNw = ThisWorkbook.Worksheets(SHEET_NETWORK)
    On Error GoTo 0

    Dim wsMeta As Worksheet
    On Error Resume Next
    Set wsMeta = ThisWorkbook.Worksheets(SHEET_META_FAC)
    On Error GoTo 0
    If wsMeta Is Nothing Then Exit Sub

    ' 메타 — facId → (badge_no, row 순서)
    Dim metaDict As Object: Set metaDict = CreateObject("Scripting.Dictionary")
    Dim metaOrder As Object: Set metaOrder = CreateObject("Scripting.Dictionary")
    Dim lastR As Long: lastR = wsMeta.Cells(wsMeta.Rows.Count, 1).End(xlUp).Row
    Dim r As Long, mfacId As String, mNo As String, ordSeq As Long
    For r = 2 To lastR
        mfacId = CStr(wsMeta.Cells(r, 1).Value)
        mNo = CStr(wsMeta.Cells(r, 5).Value)
        If Len(mfacId) > 0 Then
            metaDict(mfacId) = mNo
            ordSeq = ordSeq + 1
            metaOrder(mfacId) = ordSeq
        End If
    Next r

    ' 배지 수집 — 양 시트(행정도·네트웍) 모두 보고 변경 감지 (어느 쪽에서 변경했든 잡음)
    '   - 어느 한쪽이라도 curText ≠ metaNo (둘 다 의미있음) → 변경. 행정도 우선, 행정도 안변/공란이면 네트웍 채택
    '   - 양쪽 다 metaNo 와 같으면 안변. 자기 번호 used 등록
    '   - 「압축」 (1부터 재할당) = 「배지 도형 삭제로 결손」 발생 시만 (owner 요구)
    Dim sh As Shape, facId As String
    Dim adTextDict As Object: Set adTextDict = CreateObject("Scripting.Dictionary")
    Dim nwTextDict As Object: Set nwTextDict = CreateObject("Scripting.Dictionary")
    Dim presentFacIds As Object: Set presentFacIds = CreateObject("Scripting.Dictionary")

    For Each sh In wsAd.Shapes
        If Left(sh.Name, Len(PREFIX_BADGE)) = PREFIX_BADGE Then
            facId = Mid(sh.Name, Len(PREFIX_BADGE) + 1)
            presentFacIds(facId) = True
            Dim adTx As String: adTx = ""
            On Error Resume Next
            adTx = Trim(sh.TextFrame2.TextRange.Text)
            On Error GoTo 0
            adTextDict(facId) = adTx
        End If
    Next sh
    If Not wsNw Is Nothing Then
        For Each sh In wsNw.Shapes
            If Left(sh.Name, Len(PREFIX_BADGE)) = PREFIX_BADGE Then
                facId = Mid(sh.Name, Len(PREFIX_BADGE) + 1)
                presentFacIds(facId) = True
                Dim nwTx As String: nwTx = ""
                On Error Resume Next
                nwTx = Trim(sh.TextFrame2.TextRange.Text)
                On Error GoTo 0
                nwTextDict(facId) = nwTx
            End If
        Next sh
    End If

    ' 변경 분석 — facId 별로 「최종 보존 값」 (effective) 결정 + 안변/변경 분류
    Dim assigned As Object: Set assigned = CreateObject("Scripting.Dictionary")     ' facId → 새 텍스트 (양쪽에 set 할 값)
    Dim usedNumbers As Object: Set usedNumbers = CreateObject("Scripting.Dictionary")
    Dim unchangedList As Collection: Set unchangedList = New Collection
    Dim unchangedCurText As Object: Set unchangedCurText = CreateObject("Scripting.Dictionary")
    Dim changedNewText As Object: Set changedNewText = CreateObject("Scripting.Dictionary")    ' facId → 변경 새 번호
    Dim changedOldMeta As Object: Set changedOldMeta = CreateObject("Scripting.Dictionary")    ' facId → 변경 옛 메타값 (swap 시 안변에 부여)
    Dim fk As Variant
    For Each fk In presentFacIds.Keys
        facId = CStr(fk)
        Dim adC As String: adC = ""
        Dim nwC As String: nwC = ""
        If adTextDict.Exists(facId) Then adC = CStr(adTextDict(facId))
        If nwTextDict.Exists(facId) Then nwC = CStr(nwTextDict(facId))
        Dim metaNo As String: metaNo = ""
        If metaDict.Exists(facId) Then metaNo = CStr(metaDict(facId))
        Dim effective As String
        Dim isChanged As Boolean: isChanged = False
        If Len(adC) > 0 And adC <> metaNo Then
            ' 행정도 변경 우선
            effective = adC: isChanged = True
        ElseIf Len(nwC) > 0 And nwC <> metaNo Then
            ' 네트웍 변경
            effective = nwC: isChanged = True
        Else
            ' 안변 또는 공란
            If Len(adC) > 0 Then
                effective = adC
            Else
                effective = nwC
            End If
        End If
        If isChanged Then
            assigned(facId) = effective
            changedNewText(facId) = effective
            changedOldMeta(facId) = metaNo
            If IsNumeric(effective) Then usedNumbers(CLng(effective)) = True
        Else
            unchangedList.Add facId
            unchangedCurText(facId) = effective
            If Len(effective) > 0 And IsNumeric(effective) Then usedNumbers(CLng(effective)) = True
        End If
        ' 양쪽 도형 텍스트가 effective 와 다르면 즉시 통일 대상 (assigned 에 넣어 sync)
        If adTextDict.Exists(facId) And adC <> effective Then assigned(facId) = effective
        If nwTextDict.Exists(facId) And nwC <> effective Then assigned(facId) = effective
    Next fk

    ' 「배지 도형 삭제 = 결손 발생」 판정 — 메타에 있고 시설물 도형도 있는데 배지만 없으면 압축 필요
    '   (메타엔 있는데 시설물 자체가 사라진 facId 는 옛 잔재 → 압축 대상에서 제외)
    Dim adFacIds As Object: Set adFacIds = CreateObject("Scripting.Dictionary")
    Dim sh2 As Shape
    For Each sh2 In wsAd.Shapes
        If Left(sh2.Name, Len(PREFIX_FAC)) = PREFIX_FAC Then adFacIds(sh2.Name) = True
    Next sh2
    Dim deletionOccurred As Boolean: deletionOccurred = False
    Dim mk As Variant
    For Each mk In metaDict.Keys
        ' 시설물 도형이 실제로 있는 경우만 「배지 결손」 판정 대상
        If adFacIds.Exists(CStr(mk)) Then
            If Not presentFacIds.Exists(CStr(mk)) Then deletionOccurred = True: Exit For
        End If
    Next mk

    ' === v5 swap — 압축 아닐 때만 (변경된 새 번호가 안변 중복 → 안변에 변경 옛 번호 부여) ===
    If Not deletionOccurred And changedNewText.Count > 0 Then
        Dim ck As Variant, newN As String, oldN As String
        For Each ck In changedNewText.Keys
            newN = CStr(changedNewText(ck))
            oldN = CStr(changedOldMeta(ck))
            If Len(newN) > 0 And Len(oldN) > 0 And newN <> oldN Then
                ' 안변 배지 중 newN 보유한 facId 찾아 oldN 으로 swap
                Dim si As Long
                For si = 1 To unchangedList.Count
                    Dim uFid As String: uFid = CStr(unchangedList(si))
                    If CStr(unchangedCurText(uFid)) = newN Then
                        ' swap — 안변 배지를 변경의 옛 번호로 set
                        assigned(uFid) = oldN
                        unchangedCurText(uFid) = oldN     ' 다음 swap 검사에서 새 값 반영
                        ' used 갱신: newN 은 그대로 (변경 배지가 차지), oldN 도 used 등록
                        If IsNumeric(oldN) Then usedNumbers(CLng(oldN)) = True
                        Exit For    ' 한 변경당 첫 매칭만 swap
                    End If
                Next si
            End If
        Next ck
    End If

    If deletionOccurred Then
        ' 압축 — 안변 배지를 메타 row 순으로 정렬 후 1부터 재할당 (변경 배지 번호는 skip)
        Dim n As Long: n = unchangedList.Count
        If n > 0 Then
            ' 안변 배지의 자기 번호 used 등록 해제 (재할당 대상이라)
            Dim ii As Long
            For ii = 1 To n
                Dim ut As String: ut = CStr(unchangedCurText(unchangedList(ii)))
                If Len(ut) > 0 And IsNumeric(ut) Then
                    On Error Resume Next
                    usedNumbers.Remove CLng(ut)
                    On Error GoTo 0
                End If
            Next ii
            ' bubble sort by metaOrder
            Dim arr() As String: ReDim arr(1 To n)
            Dim jj As Long, tmp As String
            For ii = 1 To n
                arr(ii) = unchangedList(ii)
            Next ii
            For ii = 1 To n - 1
                For jj = 1 To n - ii
                    Dim oa As Long, ob As Long
                    oa = 0: ob = 0
                    If metaOrder.Exists(arr(jj)) Then oa = CLng(metaOrder(arr(jj)))
                    If metaOrder.Exists(arr(jj + 1)) Then ob = CLng(metaOrder(arr(jj + 1)))
                    If oa > ob Then
                        tmp = arr(jj): arr(jj) = arr(jj + 1): arr(jj + 1) = tmp
                    End If
                Next jj
            Next ii
            ' 1부터 차례 — 변경 배지의 번호는 건너뜀
            Dim seq As Long: seq = 1
            For ii = 1 To n
                Do While usedNumbers.Exists(seq)
                    seq = seq + 1
                Loop
                Dim curT As String: curT = CStr(unchangedCurText(arr(ii)))
                ' 자기 번호와 같으면 변경 불필요 — assigned 에 안 넣음
                If CStr(seq) <> curT Then assigned(arr(ii)) = CStr(seq)
                usedNumbers(seq) = True
                seq = seq + 1
            Next ii
        End If
    End If

    ' 변경 사항 없으면 종료 (텍스트·메타 건드림 0건)
    If assigned.Count = 0 Then Exit Sub

    ' Undo 기록 — 「사용자가 텍스트 직접 변경」 (changedNewText.Count > 0) 시점에만 1건 기록
    '   swap·압축으로 인한 부수 변경은 함께 직렬화. undo 시 모두 옛 값으로 복원.
    '   payload 형식: "fac1:old=1;fac2:old=3;..."
    If changedNewText.Count > 0 Then
        Dim oldPayload As String, ak As Variant
        For Each ak In assigned.Keys
            Dim aFid As String: aFid = CStr(ak)
            Dim oldText As String: oldText = ""
            If metaDict.Exists(aFid) Then oldText = CStr(metaDict(aFid))
            If Len(oldPayload) > 0 Then oldPayload = oldPayload & ";"
            oldPayload = oldPayload & aFid & ":" & oldText
        Next ak
        ' 첫 변경 라벨 = 사용자가 의도한 변경 표시
        Dim firstChanged As Variant, fcKey As Variant
        For Each fcKey In changedNewText.Keys
            firstChanged = fcKey
            Exit For
        Next fcKey
        Action_저장 "badge_change", oldPayload, _
                    "배지 변경: " & CStr(firstChanged) & "=" & CStr(changedNewText(firstChanged))
    End If

    ' 양 시트 + 메타 갱신
    Dim wasAd As Boolean: wasAd = wsAd.ProtectContents Or wsAd.ProtectDrawingObjects
    Dim wasNw As Boolean: wasNw = False
    If Not wsNw Is Nothing Then wasNw = wsNw.ProtectContents Or wsNw.ProtectDrawingObjects
    On Error Resume Next
    wsAd.Unprotect
    If Not wsNw Is Nothing Then wsNw.Unprotect
    On Error GoTo 0

    Dim key As Variant
    For Each key In assigned.Keys
        facId = CStr(key)
        Dim newText As String: newText = CStr(assigned(facId))
        Dim adBd As Shape, nwBd As Shape
        Set adBd = Nothing: Set nwBd = Nothing
        On Error Resume Next
        Set adBd = wsAd.Shapes(PREFIX_BADGE & facId)
        If Not wsNw Is Nothing Then Set nwBd = wsNw.Shapes(PREFIX_BADGE & facId)
        On Error GoTo 0
        If Not adBd Is Nothing Then
            On Error Resume Next
            adBd.TextFrame2.TextRange.Text = newText
            On Error GoTo 0
        End If
        If Not nwBd Is Nothing Then
            On Error Resume Next
            nwBd.TextFrame2.TextRange.Text = newText
            On Error GoTo 0
        End If
        MetaUpdateBadgeNo facId, newText
    Next key

    If wasAd Then ApplySheetProtection wsAd
    If wasNw And Not wsNw Is Nothing Then ApplySheetProtection wsNw
    Application.StatusBar = "[v4 배지] " & assigned.Count & "건 갱신 " & _
                            IIf(deletionOccurred, "(삭제 압축)", "(변경 보존+양시트 통일)")
End Sub

' === 진단 매크로 — owner 가 수동 호출 (Alt+F8 → 배지_진단) ===
' 현재 메타·행정도·네트웍 배지 상태와 v4 알고리즘 판단을 MsgBox 로 표시.
' 「원복된다」 보고 시: 변경 직후 1회 호출 → 텍스트·메타 상태 확인 → 셀 클릭 후 다시 호출 → 차이 비교
Public Sub 배지_진단()
    Dim wsAd As Worksheet: Set wsAd = ThisWorkbook.Worksheets(SHEET_ADMIN)
    Dim wsNw As Worksheet
    On Error Resume Next
    Set wsNw = ThisWorkbook.Worksheets(SHEET_NETWORK)
    On Error GoTo 0
    Dim wsMeta As Worksheet
    On Error Resume Next
    Set wsMeta = ThisWorkbook.Worksheets(SHEET_META_FAC)
    On Error GoTo 0
    If wsMeta Is Nothing Then MsgBox "메타 시트 없음": Exit Sub

    Dim msg As String
    msg = "=== 배지 진단 (v4) ===" & vbCrLf & vbCrLf

    ' 메타
    msg = msg & "[메타 시트 _시설물]" & vbCrLf
    Dim lastR As Long: lastR = wsMeta.Cells(wsMeta.Rows.Count, 1).End(xlUp).Row
    Dim r As Long, metaIdStr As String, metaNoStr As String
    For r = 2 To lastR
        metaIdStr = CStr(wsMeta.Cells(r, 1).Value)
        metaNoStr = CStr(wsMeta.Cells(r, 5).Value)
        If Len(metaIdStr) > 0 Then
            msg = msg & "  " & Right(metaIdStr, 6) & " → " & metaNoStr & vbCrLf
        End If
    Next r

    ' 행정도 배지
    msg = msg & vbCrLf & "[행정도 배지 도형]" & vbCrLf
    Dim sh As Shape, facId As String, txt As String
    For Each sh In wsAd.Shapes
        If Left(sh.Name, Len(PREFIX_BADGE)) = PREFIX_BADGE Then
            facId = Mid(sh.Name, Len(PREFIX_BADGE) + 1)
            txt = ""
            On Error Resume Next
            txt = Trim(sh.TextFrame2.TextRange.Text)
            On Error GoTo 0
            msg = msg & "  " & Right(facId, 6) & " → " & txt & vbCrLf
        End If
    Next sh

    ' 네트웍 배지
    If Not wsNw Is Nothing Then
        msg = msg & vbCrLf & "[네트웍 배지 도형]" & vbCrLf
        For Each sh In wsNw.Shapes
            If Left(sh.Name, Len(PREFIX_BADGE)) = PREFIX_BADGE Then
                facId = Mid(sh.Name, Len(PREFIX_BADGE) + 1)
                txt = ""
                On Error Resume Next
                txt = Trim(sh.TextFrame2.TextRange.Text)
                On Error GoTo 0
                msg = msg & "  " & Right(facId, 6) & " → " & txt & vbCrLf
            End If
        Next sh
    End If

    MsgBox msg, vbInformation, "배지 진단 — 모듈 버전 v4 확인용"
End Sub

' === 메타 정리 — 옛 잔재 row 삭제 (owner 가 수동 호출, Alt+F8 → 메타_정리) ===
'   삭제 대상:
'     (1) 메타 facId 가 있는데 행정도 시설물 도형(prefix fac_)이 없는 row → 시설물이 이미 삭제됨
'     (2) 메타 row 의 badge_no(5번 컬럼) 가 비어있는 row → 옛 데이터 (NextBadgeNo 잘못 카운트 방지)
'   삭제 전 confirm 으로 확인. 진단 매크로로 먼저 상태 보고 호출 권장.
Public Sub 메타_정리()
    Dim wsAd As Worksheet: Set wsAd = ThisWorkbook.Worksheets(SHEET_ADMIN)
    Dim wsMeta As Worksheet
    On Error Resume Next
    Set wsMeta = ThisWorkbook.Worksheets(SHEET_META_FAC)
    On Error GoTo 0
    If wsMeta Is Nothing Then MsgBox "메타 시트 없음": Exit Sub

    ' 행정도 시설물 도형 facId 모음
    Dim adFacIds As Object: Set adFacIds = CreateObject("Scripting.Dictionary")
    Dim sh As Shape
    For Each sh In wsAd.Shapes
        If Left(sh.Name, Len(PREFIX_FAC)) = PREFIX_FAC Then adFacIds(sh.Name) = True
    Next sh

    ' 삭제 후보 row 수집 (역순으로 삭제해야 row 번호 안 흔들림)
    Dim lastR As Long: lastR = wsMeta.Cells(wsMeta.Rows.Count, 1).End(xlUp).Row
    Dim toDelete As Collection: Set toDelete = New Collection
    Dim r As Long, fId As String, bNo As String, reason As String
    Dim previewMsg As String
    For r = 2 To lastR
        fId = CStr(wsMeta.Cells(r, 1).Value)
        bNo = CStr(wsMeta.Cells(r, 5).Value)
        reason = ""
        If Len(fId) = 0 Then
            reason = "빈 facId"
        ElseIf Not adFacIds.Exists(fId) Then
            reason = "시설물 없음"
        ElseIf Len(Trim(bNo)) = 0 Then
            reason = "배지 번호 비어있음"
        End If
        If Len(reason) > 0 Then
            toDelete.Add r
            previewMsg = previewMsg & "  row " & r & ": " & Right(fId, 6) & " (" & reason & ")" & vbCrLf
        End If
    Next r

    If toDelete.Count = 0 Then
        MsgBox "메타 정리 — 삭제할 잔재 row 없음. (메타 시트 정상)", vbInformation, "메타 정리"
        Exit Sub
    End If

    If MsgBox(toDelete.Count & " 개 row 가 옛 잔재로 판별됐습니다. 삭제할까요?" & vbCrLf & vbCrLf & _
              previewMsg, vbYesNo + vbQuestion, "메타 정리 확인") <> vbYes Then
        Exit Sub
    End If

    ' Undo 기록 — 삭제 직전에 row 들 직렬화 (역동작 = 그 row 들 다시 insert)
    Action_저장 "meta_cleanup", Action_meta_cleanup_payload(toDelete), _
                "메타 정리: " & toDelete.Count & "건"

    ' 역순으로 삭제
    Dim i As Long
    For i = toDelete.Count To 1 Step -1
        wsMeta.Rows(toDelete(i)).Delete
    Next i

    MsgBox toDelete.Count & " 개 row 삭제 완료. 이제 배지 재정렬이 정확히 동작합니다.", _
           vbInformation, "메타 정리"
End Sub

' ============================================================================
'  Undo / Redo — 「작업 기록 (B)」 방식
'  ----------------------------------------------------------------------
'  로그 시트 `_undo_log` 컬럼: id(1) · stack_type(2) · kind(3) · payload(4) · label(5) · timestamp(6)
'  kind 별 dispatcher:
'    - "facility_add"   : payload=facId  → undo: 시설물 삭제 / redo: 다시 그리기는 불가 → 본 단계는 「삭제」만 지원
'    - "facility_delete": payload=시설물 전체 정보 JSON → undo: 복원 / redo: 다시 삭제
'    - "meta_cleanup"   : payload=삭제된 row 들 직렬화 → undo: row 복원 / redo: 다시 삭제
'  payload 직렬화: "k1=v1`k2=v2`..." (` 구분자 — | / ; 와 충돌 회피)
' ============================================================================

' 로그 시트 확보 (없으면 생성)
Public Function Action_로그시트() As Worksheet
    Dim wb As Workbook: Set wb = ThisWorkbook
    On Error Resume Next
    Set Action_로그시트 = wb.Worksheets(UNDO_LOG_SHEET)
    On Error GoTo 0
    If Not Action_로그시트 Is Nothing Then Exit Function
    Dim sh As Worksheet
    Set sh = wb.Worksheets.Add(After:=wb.Sheets(wb.Sheets.Count))
    sh.Name = UNDO_LOG_SHEET
    sh.Visible = xlSheetVeryHidden
    sh.Cells(1, 1).Value = "id"
    sh.Cells(1, 2).Value = "stack_type"
    sh.Cells(1, 3).Value = "kind"
    sh.Cells(1, 4).Value = "payload"
    sh.Cells(1, 5).Value = "label"
    sh.Cells(1, 6).Value = "timestamp"
    Set Action_로그시트 = sh
End Function

' 다음 id (max + 1)
Public Function Action_다음id() As Long
    Dim sh As Worksheet: Set sh = Action_로그시트()
    Dim last As Long: last = sh.Cells(sh.Rows.Count, 1).End(xlUp).Row
    Dim r As Long, n As Long, maxId As Long: maxId = 0
    For r = 2 To last
        n = 0
        On Error Resume Next
        n = CLng(sh.Cells(r, 1).Value)
        On Error GoTo 0
        If n > maxId Then maxId = n
    Next r
    Action_다음id = maxId + 1
End Function

' 변경 기록 — 매크로 직전·직후에 호출. payload 는 역동작에 필요한 모든 정보 (자유 형식)
Public Sub Action_저장(kind As String, payload As String, label As String)
    On Error Resume Next
    ' redo 스택 비움 (새 action 발생)
    Action_redo_비우기
    Dim sh As Worksheet: Set sh = Action_로그시트()
    Dim id As Long: id = Action_다음id()
    Dim lastR As Long: lastR = sh.Cells(sh.Rows.Count, 1).End(xlUp).Row + 1
    sh.Cells(lastR, 1).Value = id
    sh.Cells(lastR, 2).Value = "undo"
    sh.Cells(lastR, 3).Value = kind
    sh.Cells(lastR, 4).Value = payload
    sh.Cells(lastR, 5).Value = label
    sh.Cells(lastR, 6).Value = Now
    Action_스택_트림
    Application.StatusBar = "[Undo 기록] " & label
End Sub

' 마지막 undo row 실행 → redo 로 이동
Public Sub Undo_실행()
    Dim sh As Worksheet: Set sh = Action_로그시트()
    Dim lastR As Long: lastR = sh.Cells(sh.Rows.Count, 1).End(xlUp).Row
    Dim undoRow As Long: undoRow = 0
    Dim r As Long
    For r = lastR To 2 Step -1
        If CStr(sh.Cells(r, 2).Value) = "undo" Then undoRow = r: Exit For
    Next r
    If undoRow = 0 Then
        MsgBox "되돌릴 동작이 없습니다.", vbInformation, "되돌리기"
        Exit Sub
    End If
    Dim kind As String: kind = CStr(sh.Cells(undoRow, 3).Value)
    Dim payload As String: payload = CStr(sh.Cells(undoRow, 4).Value)
    Dim label As String: label = CStr(sh.Cells(undoRow, 5).Value)

    Dim oEv As Boolean: oEv = Application.EnableEvents
    Application.EnableEvents = False
    Dim ok As Boolean: ok = Action_dispatch(kind, payload, True)
    Application.EnableEvents = oEv

    If ok Then
        ' undo → redo 로 stack_type 변경
        sh.Cells(undoRow, 2).Value = "redo"
        Application.StatusBar = "[Undo] 복원: " & label
    Else
        MsgBox "되돌리기 실패: " & label & vbCrLf & "(역동작 미지원 또는 데이터 손상)", _
               vbExclamation, "되돌리기"
    End If
End Sub

' 마지막 redo row 실행 → undo 로 이동
Public Sub Redo_실행()
    Dim sh As Worksheet: Set sh = Action_로그시트()
    Dim lastR As Long: lastR = sh.Cells(sh.Rows.Count, 1).End(xlUp).Row
    Dim redoRow As Long: redoRow = 0
    Dim r As Long
    For r = lastR To 2 Step -1
        If CStr(sh.Cells(r, 2).Value) = "redo" Then redoRow = r: Exit For
    Next r
    If redoRow = 0 Then
        MsgBox "다시 실행할 동작이 없습니다.", vbInformation, "다시 실행"
        Exit Sub
    End If
    Dim kind As String: kind = CStr(sh.Cells(redoRow, 3).Value)
    Dim payload As String: payload = CStr(sh.Cells(redoRow, 4).Value)
    Dim label As String: label = CStr(sh.Cells(redoRow, 5).Value)

    Dim oEv As Boolean: oEv = Application.EnableEvents
    Application.EnableEvents = False
    Dim ok As Boolean: ok = Action_dispatch(kind, payload, False)
    Application.EnableEvents = oEv

    If ok Then
        sh.Cells(redoRow, 2).Value = "undo"
        Application.StatusBar = "[Redo] 다시 실행: " & label
    Else
        MsgBox "다시 실행 실패: " & label, vbExclamation, "다시 실행"
    End If
End Sub

' kind 별 dispatcher. isUndo=True 이면 역동작, False 면 정동작 (redo)
Public Function Action_dispatch(kind As String, payload As String, isUndo As Boolean) As Boolean
    Action_dispatch = False
    Select Case kind
        Case "facility_add"
            ' undo = 추가된 시설물 삭제 / redo = 정보 부족으로 복원 불가
            If isUndo Then
                Action_dispatch = Action_시설물_삭제_조용히(Action_payload_get(payload, "facId"))
            Else
                MsgBox "시설물 추가 redo 는 지원하지 않습니다 (다시 그려주세요).", vbInformation, "다시 실행"
                Action_dispatch = True
            End If
        Case "cable_add"
            ' undo = 추가된 케이블 삭제 / redo = 미지원
            If isUndo Then
                Action_dispatch = Action_케이블_삭제_조용히(Action_payload_get(payload, "cblId"))
            Else
                MsgBox "케이블 추가 redo 는 지원하지 않습니다 (다시 그려주세요).", vbInformation, "다시 실행"
                Action_dispatch = True
            End If
        Case "facility_delete"
            If isUndo Then
                Action_dispatch = Action_facility_delete_복원(payload)
            Else
                ' Redo = 다시 삭제 (facId 만으로 충분)
                Action_dispatch = Action_시설물_삭제_조용히(Action_payload_get(payload, "facId"))
            End If
        Case "facility_delete_only"
            ' 시설물만 삭제 — 케이블 cascade 안 함
            If isUndo Then
                ' payload 의 cables 필드가 비어있어 복원 함수가 케이블 loop 자동 skip
                Action_dispatch = Action_facility_delete_복원(payload)
            Else
                Action_dispatch = Action_시설물_단독_삭제_조용히(Action_payload_get(payload, "facId"))
            End If
        Case "pairbox_add"
            ' undo = 박스2개 + 화살표 삭제 / redo = 미지원 (다시 그리도록)
            If isUndo Then
                Action_dispatch = Action_pairbox_제거(payload)
            Else
                MsgBox "코어 박스 추가 redo 는 지원하지 않습니다 (다시 만드세요).", vbInformation, "다시 실행"
                Action_dispatch = True
            End If
        Case "cable_delete"
            If isUndo Then
                Action_dispatch = Action_cable_delete_복원(payload)
            Else
                Action_dispatch = Action_케이블_삭제_조용히(Action_payload_get(payload, "cblId"))
            End If
        Case "meta_cleanup"
            If isUndo Then
                Action_dispatch = Action_meta_cleanup_복원(payload)
            Else
                Action_dispatch = Action_meta_cleanup_재실행(payload)
            End If
        Case "badge_change"
            ' undo = 옛 텍스트로 복원 / redo = 같은 동작 (payload 가 옛 값이라 정방향 의미 없음 → 안내)
            If isUndo Then
                Action_dispatch = Action_badge_change_복원(payload)
            Else
                MsgBox "배지 변경 redo 는 지원하지 않습니다 (다시 변경하세요).", vbInformation, "다시 실행"
                Action_dispatch = True
            End If
    End Select
End Function

' 배지 옛 텍스트 복원 — payload: "fac1:old=1;fac2:old=3;..."
Public Function Action_badge_change_복원(payload As String) As Boolean
    On Error GoTo Fail
    Dim wsAd As Worksheet: Set wsAd = ThisWorkbook.Worksheets(SHEET_ADMIN)
    Dim wsNw As Worksheet
    On Error Resume Next
    Set wsNw = ThisWorkbook.Worksheets(SHEET_NETWORK)
    On Error GoTo 0

    Dim wasAd As Boolean: wasAd = wsAd.ProtectContents Or wsAd.ProtectDrawingObjects
    Dim wasNw As Boolean: wasNw = False
    If Not wsNw Is Nothing Then wasNw = wsNw.ProtectContents Or wsNw.ProtectDrawingObjects
    On Error Resume Next
    wsAd.Unprotect
    If Not wsNw Is Nothing Then wsNw.Unprotect
    On Error GoTo Fail

    Dim entries() As String: entries = Split(payload, ";")
    Dim i As Long
    For i = LBound(entries) To UBound(entries)
        Dim entry As String: entry = entries(i)
        Dim colonPos As Long: colonPos = InStr(entry, ":")
        If colonPos > 0 Then
            Dim facId As String: facId = Left(entry, colonPos - 1)
            Dim rest As String: rest = Mid(entry, colonPos + 1)
            ' rest = "old=N"
            Dim oldText As String: oldText = ""
            If InStr(rest, "=") > 0 Then oldText = Mid(rest, InStr(rest, "=") + 1)
            ' 도형 + 메타 복원
            Dim adBd As Shape, nwBd As Shape
            Set adBd = Nothing: Set nwBd = Nothing
            On Error Resume Next
            Set adBd = wsAd.Shapes(PREFIX_BADGE & facId)
            If Not wsNw Is Nothing Then Set nwBd = wsNw.Shapes(PREFIX_BADGE & facId)
            On Error GoTo Fail
            If Not adBd Is Nothing Then
                On Error Resume Next
                adBd.TextFrame2.TextRange.Text = oldText
                On Error GoTo Fail
            End If
            If Not nwBd Is Nothing Then
                On Error Resume Next
                nwBd.TextFrame2.TextRange.Text = oldText
                On Error GoTo Fail
            End If
            MetaUpdateBadgeNo facId, oldText
        End If
    Next i

    If wasAd Then ApplySheetProtection wsAd
    If wasNw And Not wsNw Is Nothing Then ApplySheetProtection wsNw
    Action_badge_change_복원 = True
    Exit Function
Fail:
End Function

' 시설물 「조용히」 삭제 (Action_저장 호출 안 함 — undo 안에서 재귀 회피)
Public Function Action_시설물_삭제_조용히(facId As String) As Boolean
    On Error GoTo Fail
    If Len(facId) = 0 Then Exit Function
    Dim wsAd As Worksheet: Set wsAd = ThisWorkbook.Worksheets(SHEET_ADMIN)
    Dim wsNw As Worksheet: Set wsNw = ThisWorkbook.Worksheets(SHEET_NETWORK)
    On Error Resume Next
    wsAd.Unprotect: wsNw.Unprotect
    On Error GoTo Fail

    ' 관련 케이블도 삭제 (cascade)
    Dim cblList As Variant: cblList = FindRelatedCables(facId)
    Dim i As Long
    If Not IsEmpty(cblList) Then
        For i = LBound(cblList) To UBound(cblList)
            Dim cblId As String: cblId = CStr(cblList(i))
            On Error Resume Next
            wsAd.Shapes(cblId).Delete
            wsNw.Shapes(cblId).Delete
            wsAd.Shapes(PREFIX_LABEL & cblId).Delete
            wsNw.Shapes(PREFIX_LABEL & cblId).Delete
            On Error GoTo 0
            MetaDeleteRow SHEET_META_CBL, 1, cblId
        Next i
    End If

    On Error Resume Next
    wsAd.Shapes(facId).Delete
    wsNw.Shapes(facId).Delete
    wsAd.Shapes(PREFIX_LABEL & facId).Delete
    wsAd.Shapes(PREFIX_LEADER & facId).Delete
    wsAd.Shapes(PREFIX_BADGE & facId).Delete
    wsNw.Shapes(PREFIX_LABEL & facId).Delete
    wsNw.Shapes(PREFIX_LEADER & facId).Delete
    wsNw.Shapes(PREFIX_BADGE & facId).Delete
    wsNw.Shapes(PREFIX_FAC_TAG_DD & facId).Delete
    wsNw.Shapes(PREFIX_FAC_STATUS & facId).Delete
    On Error GoTo Fail
    MetaDeleteRow SHEET_META_FAC, 1, facId

    ApplySheetProtection wsAd
    ApplySheetProtection wsNw
    Action_시설물_삭제_조용히 = True
    Exit Function
Fail:
End Function

' === 시설물 삭제 — payload 직렬화 + 복원 ===
'   payload: facId, kind, name, badge, 양 시트 위치/크기, callout text, 상태박스 day/night
'   limitation: 관련 케이블은 cascade 삭제되지만 복원 안 함 (사용자가 다시 그려야)
'                callout 위치(사용자가 드래그한)도 복원 안 함 — AddFacilityCallout 가 기본 위치로 재생성

Public Function Action_facility_delete_payload(facId As String) As String
    On Error GoTo Fail
    Dim wsAd As Worksheet: Set wsAd = ThisWorkbook.Worksheets(SHEET_ADMIN)
    Dim wsNw As Worksheet: Set wsNw = ThisWorkbook.Worksheets(SHEET_NETWORK)

    ' 메타 row — 헤더 컬럼 수가 변동 (옛 시트는 4 컬럼) 가능. UBound 안전 체크 + 개별 fallback
    Dim metaRow As Variant: metaRow = MetaFindRow(SHEET_META_FAC, 1, facId)
    Dim kind As String, name As String, badge As String
    If Not IsEmpty(metaRow) Then
        Dim ub As Long: ub = 0
        On Error Resume Next
        ub = UBound(metaRow)
        On Error GoTo Fail
        If ub >= 2 Then kind = CStr(metaRow(2))
        If ub >= 3 Then name = CStr(metaRow(3))
        If ub >= 5 Then badge = CStr(metaRow(5))
    End If
    ' badge 가 비어있으면 행정도 배지 도형에서 직접 읽기 (메타 헤더 4 컬럼 환경 대비)
    If Len(badge) = 0 Then
        Dim bShp As Shape: Set bShp = Nothing
        On Error Resume Next
        Set bShp = wsAd.Shapes(PREFIX_BADGE & facId)
        On Error GoTo 0
        If Not bShp Is Nothing Then
            On Error Resume Next
            badge = Trim(bShp.TextFrame2.TextRange.Text)
            On Error GoTo 0
        End If
    End If

    ' 행정도 시설물 도형
    Dim adFac As Shape: Set adFac = Nothing
    On Error Resume Next
    Set adFac = wsAd.Shapes(facId)
    On Error GoTo 0
    Dim ad_l As Double, ad_t As Double, ad_w As Double, ad_h As Double
    If Not adFac Is Nothing Then
        ad_l = adFac.Left: ad_t = adFac.Top
        ad_w = adFac.Width: ad_h = adFac.Height
    End If

    ' 행정도 callout text + 위치 (사용자 드래그한 위치 보존)
    Dim adCl As Shape: Set adCl = Nothing
    On Error Resume Next
    Set adCl = wsAd.Shapes(PREFIX_LABEL & facId)
    On Error GoTo 0
    Dim cl_text As String
    Dim ad_cl_l As Double, ad_cl_t As Double
    If Not adCl Is Nothing Then
        On Error Resume Next
        cl_text = adCl.TextFrame2.TextRange.Text
        ad_cl_l = adCl.Left
        ad_cl_t = adCl.Top
        On Error GoTo 0
    End If
    ' 직렬화 안전 — ` 와 줄바꿈 치환
    cl_text = Replace(cl_text, "`", "##BT##")
    cl_text = Replace(cl_text, vbCr, "##NL##")
    cl_text = Replace(cl_text, vbLf, "")

    ' 네트웍 callout 위치
    Dim nwCl As Shape: Set nwCl = Nothing
    On Error Resume Next
    Set nwCl = wsNw.Shapes(PREFIX_LABEL & facId)
    On Error GoTo 0
    Dim nw_cl_l As Double, nw_cl_t As Double
    If Not nwCl Is Nothing Then
        On Error Resume Next
        nw_cl_l = nwCl.Left
        nw_cl_t = nwCl.Top
        On Error GoTo 0
    End If

    ' 네트웍 시설물 도형
    Dim nwFac As Shape: Set nwFac = Nothing
    On Error Resume Next
    Set nwFac = wsNw.Shapes(facId)
    On Error GoTo 0
    Dim nw_l As Double, nw_t As Double, nw_w As Double, nw_h As Double
    If Not nwFac Is Nothing Then
        nw_l = nwFac.Left: nw_t = nwFac.Top
        nw_w = nwFac.Width: nw_h = nwFac.Height
    End If

    ' 네트웍 상태박스 day/night
    Dim dayV As String, nightV As String
    상태박스_값_읽기 wsNw, facId, dayV, nightV

    ' 관련 케이블 (cascade 삭제 예정) — facility_delete 1회 undo 로 함께 복원
    '   형식: "cbl_xxx:from,to,spec,color,weight;cbl_yyy:..."
    Dim cablesField As String: cablesField = ""
    Dim cblList As Variant: cblList = FindRelatedCables(facId)
    If Not IsEmpty(cblList) Then
        Dim ci As Long
        For ci = LBound(cblList) To UBound(cblList)
            Dim oneCblId As String: oneCblId = CStr(cblList(ci))
            Dim cmRow As Variant: cmRow = MetaFindRow(SHEET_META_CBL, 1, oneCblId)
            Dim cFrom As String, cTo As String, cSpec As String
            cFrom = "": cTo = "": cSpec = ""
            If Not IsEmpty(cmRow) Then
                Dim cub As Long: cub = 0
                On Error Resume Next
                cub = UBound(cmRow)
                On Error GoTo Fail
                If cub >= 2 Then cFrom = CStr(cmRow(2))
                If cub >= 3 Then cTo = CStr(cmRow(3))
                If cub >= 4 Then cSpec = CStr(cmRow(4))
            End If
            ' 도형의 실제 색·두께 + 노드 좌표 (waypoints)
            Dim cShp As Shape: Set cShp = Nothing
            On Error Resume Next
            Set cShp = wsAd.Shapes(oneCblId)
            On Error GoTo 0
            Dim cColor As Long: cColor = -1
            Dim cWeight As Double: cWeight = -1
            Dim cNodes As String: cNodes = Action_cable_nodes_직렬화(cShp)
            If Not cShp Is Nothing Then
                On Error Resume Next
                cColor = cShp.Line.ForeColor.RGB
                cWeight = cShp.Line.Weight
                On Error GoTo 0
            End If
            If ci > LBound(cblList) Then cablesField = cablesField & ";"
            cablesField = cablesField & oneCblId & ":" & cFrom & "," & cTo & "," & cSpec & "," & cColor & "," & cWeight & "," & cNodes
        Next ci
    End If

    Action_facility_delete_payload = _
        "facId=" & facId & "`kind=" & kind & "`name=" & name & "`badge=" & badge & _
        "`ad_l=" & ad_l & "`ad_t=" & ad_t & "`ad_w=" & ad_w & "`ad_h=" & ad_h & _
        "`cl_text=" & cl_text & _
        "`ad_cl_l=" & ad_cl_l & "`ad_cl_t=" & ad_cl_t & _
        "`nw_l=" & nw_l & "`nw_t=" & nw_t & "`nw_w=" & nw_w & "`nw_h=" & nw_h & _
        "`nw_cl_l=" & nw_cl_l & "`nw_cl_t=" & nw_cl_t & _
        "`day=" & dayV & "`night=" & nightV & _
        "`cables=" & cablesField
    Exit Function
Fail:
    ' 직렬화 실패 — facId 만 담아 안내. 복원 시 「데이터 손상」 으로 안내됨
    Action_facility_delete_payload = "facId=" & facId
End Function

' 코어 박스 추가 undo — payload: "box1=...`box2=...`arr=..." → 3 도형 삭제
Public Function Action_pairbox_제거(payload As String) As Boolean
    On Error GoTo Fail
    Dim ws As Worksheet: Set ws = ThisWorkbook.Worksheets(SHEET_NETWORK)
    If ws Is Nothing Then Exit Function
    Dim wasProt As Boolean: wasProt = ws.ProtectContents Or ws.ProtectDrawingObjects
    On Error Resume Next
    ws.Unprotect
    On Error GoTo Fail

    Dim box1Nm As String, box2Nm As String, arrNm As String
    box1Nm = Action_payload_get(payload, "box1")
    box2Nm = Action_payload_get(payload, "box2")
    arrNm = Action_payload_get(payload, "arr")
    On Error Resume Next
    ws.Shapes(arrNm).Delete
    ws.Shapes(box1Nm).Delete
    ws.Shapes(box2Nm).Delete
    On Error GoTo Fail
    If wasProt Then ApplySheetProtection ws
    Action_pairbox_제거 = True
    Exit Function
Fail:
End Function

' 시설물만 삭제용 payload — cables 필드를 비워 「facility_delete 와 동일 복원 함수」 가
'   케이블 복원 loop 를 자동 skip 하게 만듦. 케이블은 실제로 안 지웠으므로 복원 불필요.
Public Function Action_facility_delete_only_payload(facId As String) As String
    Dim full As String: full = Action_facility_delete_payload(facId)
    ' "cables=..." 까지 (다음 ` 또는 끝) 를 "cables=" 로 치환
    Dim p As Long: p = InStr(full, "`cables=")
    If p > 0 Then
        ' `cables= 시작 위치부터 다음 ` 직전까지를 잘라 "`cables=" 만 남김
        Dim tailStart As Long: tailStart = p + Len("`cables=")
        Dim nextTick As Long: nextTick = InStr(tailStart, full, "`")
        If nextTick = 0 Then
            ' cables 가 마지막 필드 (현재 포맷) — 그냥 "`cables=" 로 끝
            Action_facility_delete_only_payload = Left(full, p - 1) & "`cables="
        Else
            Action_facility_delete_only_payload = Left(full, p - 1) & "`cables=" & Mid(full, nextTick)
        End If
    Else
        Action_facility_delete_only_payload = full
    End If
End Function

' 시설물 「단독」 조용히 삭제 (케이블 cascade 안 함) — undo 의 redo 경로에서 호출
Public Function Action_시설물_단독_삭제_조용히(facId As String) As Boolean
    On Error GoTo Fail
    If Len(facId) = 0 Then Exit Function
    Dim wsAd As Worksheet: Set wsAd = ThisWorkbook.Worksheets(SHEET_ADMIN)
    Dim wsNw As Worksheet: Set wsNw = ThisWorkbook.Worksheets(SHEET_NETWORK)
    On Error Resume Next
    wsAd.Unprotect: wsNw.Unprotect
    On Error GoTo Fail

    On Error Resume Next
    wsAd.Shapes(facId).Delete
    wsNw.Shapes(facId).Delete
    wsAd.Shapes(PREFIX_LABEL & facId).Delete
    wsAd.Shapes(PREFIX_LEADER & facId).Delete
    wsAd.Shapes(PREFIX_BADGE & facId).Delete
    wsNw.Shapes(PREFIX_LABEL & facId).Delete
    wsNw.Shapes(PREFIX_LEADER & facId).Delete
    wsNw.Shapes(PREFIX_BADGE & facId).Delete
    wsNw.Shapes(PREFIX_FAC_TAG_DD & facId).Delete
    wsNw.Shapes(PREFIX_FAC_STATUS & facId).Delete
    Dim ti As Long, tNm As String
    Dim tagPrefix As String: tagPrefix = PREFIX_FAC_TAG & facId & "_"
    For ti = wsNw.Shapes.Count To 1 Step -1
        tNm = wsNw.Shapes(ti).Name
        If Left(tNm, Len(tagPrefix)) = tagPrefix Then wsNw.Shapes(ti).Delete
    Next ti
    On Error GoTo Fail
    MetaDeleteRow SHEET_META_FAC, 1, facId

    ApplySheetProtection wsAd
    ApplySheetProtection wsNw
    Action_시설물_단독_삭제_조용히 = True
    Exit Function
Fail:
End Function

' 메타에서 kind 또는 라벨과 일치하는 첫 범례 도형 (시트 ws 안에서) 찾기 — 시설물 복원 시 도형 종류 식별용
'   시설물 메타의 「type」 컬럼은 사실 「라벨」 (신설/가공 등) 로 저장됨 → 라벨 매칭 우선,
'   못 찾으면 _범례 메타의 enum kind 매칭 (cable/facility/closure/rn) fallback
Public Function 첫범례_by_kind(ws As Worksheet, kindOrLabel As String) As Shape
    Dim wsMeta As Worksheet
    On Error Resume Next
    Set wsMeta = ThisWorkbook.Worksheets(SHEET_META_LEG)
    On Error GoTo 0
    If wsMeta Is Nothing Then Exit Function

    Dim lastR As Long: lastR = wsMeta.Cells(wsMeta.Rows.Count, 1).End(xlUp).Row
    Dim r As Long, legName As String, legKindEnum As String, legLabelStr As String

    ' 1차: 라벨 정확 매칭
    For r = 2 To lastR
        legName = CStr(wsMeta.Cells(r, 1).Value)
        legLabelStr = CStr(wsMeta.Cells(r, 3).Value)
        If legLabelStr = kindOrLabel Then
            On Error Resume Next
            Set 첫범례_by_kind = ws.Shapes(legName)
            On Error GoTo 0
            If Not 첫범례_by_kind Is Nothing Then Exit Function
        End If
    Next r

    ' 2차: enum kind 매칭 (cable 케이블 복원 등)
    For r = 2 To lastR
        legName = CStr(wsMeta.Cells(r, 1).Value)
        legKindEnum = CStr(wsMeta.Cells(r, 2).Value)
        If legKindEnum = kindOrLabel Then
            On Error Resume Next
            Set 첫범례_by_kind = ws.Shapes(legName)
            On Error GoTo 0
            If Not 첫범례_by_kind Is Nothing Then Exit Function
        End If
    Next r

    ' 3차: 같은 라벨 prefix 매칭 fallback (예: "신설/가공" → "신설" 으로 시작하는 라벨)
    Dim firstWord As String
    Dim slashPos As Long: slashPos = InStr(kindOrLabel, "/")
    If slashPos > 0 Then
        firstWord = Left(kindOrLabel, slashPos - 1)
    Else
        firstWord = kindOrLabel
    End If
    If Len(firstWord) > 0 Then
        For r = 2 To lastR
            legName = CStr(wsMeta.Cells(r, 1).Value)
            legLabelStr = CStr(wsMeta.Cells(r, 3).Value)
            If InStr(legLabelStr, firstWord) > 0 Then
                On Error Resume Next
                Set 첫범례_by_kind = ws.Shapes(legName)
                On Error GoTo 0
                If Not 첫범례_by_kind Is Nothing Then Exit Function
            End If
        Next r
    End If
End Function

Public Function Action_facility_delete_복원(payload As String) As Boolean
    On Error GoTo Fail
    Dim facId As String: facId = Action_payload_get(payload, "facId")
    Dim kind As String: kind = Action_payload_get(payload, "kind")
    Dim name As String: name = Action_payload_get(payload, "name")
    Dim badge As String: badge = Action_payload_get(payload, "badge")
    Dim ad_l As Double, ad_t As Double, ad_w As Double, ad_h As Double
    ad_l = CDbl(Action_payload_get(payload, "ad_l"))
    ad_t = CDbl(Action_payload_get(payload, "ad_t"))
    ad_w = CDbl(Action_payload_get(payload, "ad_w"))
    ad_h = CDbl(Action_payload_get(payload, "ad_h"))
    Dim nw_l As Double, nw_t As Double, nw_w As Double, nw_h As Double
    nw_l = CDbl(Action_payload_get(payload, "nw_l"))
    nw_t = CDbl(Action_payload_get(payload, "nw_t"))
    nw_w = CDbl(Action_payload_get(payload, "nw_w"))
    nw_h = CDbl(Action_payload_get(payload, "nw_h"))
    Dim cl_text As String: cl_text = Action_payload_get(payload, "cl_text")
    cl_text = Replace(cl_text, "##NL##", vbCr)
    cl_text = Replace(cl_text, "##BT##", "`")
    Dim dayV As String: dayV = Action_payload_get(payload, "day")
    Dim nightV As String: nightV = Action_payload_get(payload, "night")

    Dim wsAd As Worksheet: Set wsAd = ThisWorkbook.Worksheets(SHEET_ADMIN)
    Dim wsNw As Worksheet: Set wsNw = ThisWorkbook.Worksheets(SHEET_NETWORK)
    On Error Resume Next
    wsAd.Unprotect: wsNw.Unprotect
    On Error GoTo Fail

    ' 같은 라벨·kind 범례 도형 찾기 (도형 모양·색 복원용)
    Dim leg As Shape: Set leg = 첫범례_by_kind(wsAd, kind)
    If leg Is Nothing Then
        MsgBox "복원 불가 — 라벨 '" & kind & "' 의 범례가 없습니다." & vbCrLf & vbCrLf & _
               "범례를 삭제했다면 다시 등록 후 시도하거나, 수동으로 시설물을 다시 그려야 합니다.", _
               vbExclamation, "되돌리기"
        Exit Function
    End If
    Dim legLab As String: legLab = MetaLookupLabel(leg.Name)

    ' 메타 row 복원
    AppendMetaRow SHEET_META_FAC, Array(facId, kind, name, Now, badge)

    ' 행정도 시설물 도형 재생성
    Dim shAd As Shape: Set shAd = CloneLegendShape(leg, wsAd, ad_l, ad_t, ad_w, ad_h, "")
    shAd.Name = facId
    shAd.OnAction = ""
    shAd.Locked = False
    shAd.Placement = 3
    On Error Resume Next
    shAd.ZOrder msoBringToFront
    On Error GoTo 0

    ' 네트웍 시설물 도형 재생성
    Dim shNw As Shape: Set shNw = CloneLegendShape(leg, wsNw, nw_l, nw_t, nw_w, nw_h, "")
    shNw.Name = facId
    shNw.OnAction = ""
    shNw.Locked = False
    shNw.Placement = 3

    ' 양 시트 callout + 배지 + 네트웍 부속
    AddFacilityCallout wsAd, shAd, facId, cl_text, legLab
    AddBadge wsAd, shAd, facId, badge
    AddFacilityCallout wsNw, shNw, facId, cl_text, legLab
    AddBadge wsNw, shNw, facId, badge
    AddFacilityStatusBox wsNw, facId
    AddFacilityTagCombo wsNw, facId
    상태박스_값_쓰기 wsNw, facId, dayV, nightV
    시설물_태그_위치_동기화 wsNw, facId

    ' callout 위치 보정 — 사용자 드래그 위치 복원 (AddFacilityCallout 가 기본 위치로 생성하므로)
    Dim ad_cl_l As Double, ad_cl_t As Double
    Dim nw_cl_l As Double, nw_cl_t As Double
    On Error Resume Next
    ad_cl_l = CDbl(Action_payload_get(payload, "ad_cl_l"))
    ad_cl_t = CDbl(Action_payload_get(payload, "ad_cl_t"))
    nw_cl_l = CDbl(Action_payload_get(payload, "nw_cl_l"))
    nw_cl_t = CDbl(Action_payload_get(payload, "nw_cl_t"))
    On Error GoTo Fail
    Dim adClRest As Shape, nwClRest As Shape
    Set adClRest = Nothing: Set nwClRest = Nothing
    On Error Resume Next
    Set adClRest = wsAd.Shapes(PREFIX_LABEL & facId)
    Set nwClRest = wsNw.Shapes(PREFIX_LABEL & facId)
    On Error GoTo 0
    If Not adClRest Is Nothing And ad_cl_l > 0 Then
        On Error Resume Next
        adClRest.Left = ad_cl_l
        adClRest.Top = ad_cl_t
        On Error GoTo 0
    End If
    If Not nwClRest Is Nothing And nw_cl_l > 0 Then
        On Error Resume Next
        nwClRest.Left = nw_cl_l
        nwClRest.Top = nw_cl_t
        On Error GoTo 0
    End If

    배지_위치_동기화 wsAd
    배지_위치_동기화 wsNw

    ' 관련 케이블 복원 (payload 의 cables 필드 — 단순 직선 + 색·두께 보존)
    Dim cablesField As String: cablesField = Action_payload_get(payload, "cables")
    Dim restoredCbl As Long: restoredCbl = 0
    If Len(cablesField) > 0 Then
        Dim cblEntries() As String: cblEntries = Split(cablesField, ";")
        Dim ci As Long
        For ci = LBound(cblEntries) To UBound(cblEntries)
            If Len(cblEntries(ci)) > 0 Then
                Dim colonPos As Long: colonPos = InStr(cblEntries(ci), ":")
                If colonPos > 0 Then
                    Dim oneCblId As String: oneCblId = Left(cblEntries(ci), colonPos - 1)
                    Dim rest As String: rest = Mid(cblEntries(ci), colonPos + 1)
                    Dim parts() As String: parts = Split(rest, ",")
                    If UBound(parts) >= 4 Then
                        Dim cFrom As String: cFrom = parts(0)
                        Dim cTo As String: cTo = parts(1)
                        Dim cSpec As String: cSpec = parts(2)
                        Dim cColorStr As String: cColorStr = parts(3)
                        Dim cWeightStr As String: cWeightStr = parts(4)
                        Dim cNodes As String: cNodes = ""
                        If UBound(parts) >= 5 Then cNodes = parts(5)
                        If Action_케이블_단순복원(oneCblId, cFrom, cTo, cSpec, cColorStr, cWeightStr, cNodes) Then
                            restoredCbl = restoredCbl + 1
                        End If
                    End If
                End If
            End If
        Next ci
    End If

    ApplySheetProtection wsAd
    ApplySheetProtection wsNw
    Action_facility_delete_복원 = True
    Application.StatusBar = "시설물 복원 완료 — 관련 케이블 " & restoredCbl & "개 복원"
    Exit Function
Fail:
End Function

' 케이블 복원 헬퍼 — 시설물 복원 cascade 안에서 호출. nodes 있으면 polyline, 없으면 직선
Public Function Action_케이블_단순복원(cblId As String, fromId As String, toId As String, _
                                       spec As String, colorStr As String, weightStr As String, _
                                       Optional nodesField As String = "") As Boolean
    On Error GoTo Fail
    If Len(fromId) = 0 Or Len(toId) = 0 Then Exit Function

    Dim wsAd As Worksheet: Set wsAd = ThisWorkbook.Worksheets(SHEET_ADMIN)
    Dim wsNw As Worksheet: Set wsNw = ThisWorkbook.Worksheets(SHEET_NETWORK)

    Dim fAd As Shape, tAd As Shape, fNw As Shape, tNw As Shape
    On Error Resume Next
    Set fAd = wsAd.Shapes(fromId)
    Set tAd = wsAd.Shapes(toId)
    Set fNw = wsNw.Shapes(fromId)
    Set tNw = wsNw.Shapes(toId)
    On Error GoTo Fail
    If fAd Is Nothing Or tAd Is Nothing Then Exit Function

    On Error Resume Next
    wsAd.Unprotect: wsNw.Unprotect
    On Error GoTo Fail

    ' 색·두께 — payload 우선, 없으면 범례 fallback
    Dim lc As Long: lc = CBL_DEFAULT_COLOR
    Dim lwt As Double: lwt = CBL_LINE_WEIGHT
    If IsNumeric(colorStr) Then
        Dim cv As Long: cv = CLng(colorStr)
        If cv >= 0 Then lc = cv
    End If
    If IsNumeric(weightStr) Then
        Dim wv As Double: wv = CDbl(weightStr)
        If wv > 0 Then lwt = wv
    End If

    ' 행정도 — nodes 있으면 polyline (waypoints 보존), 없으면 직선
    Dim shAd As Shape: Set shAd = Nothing
    If Len(nodesField) > 0 Then
        Dim ptsArr As Variant: ptsArr = Action_cable_nodes_파싱(nodesField)
        If IsArray(ptsArr) Then
            On Error Resume Next
            Set shAd = wsAd.Shapes.AddPolyline(ptsArr)
            On Error GoTo 0
        End If
    End If
    If shAd Is Nothing Then
        Dim adX1 As Double, adY1 As Double, adX2 As Double, adY2 As Double
        adX1 = fAd.Left + fAd.Width / 2: adY1 = fAd.Top + fAd.Height / 2
        adX2 = tAd.Left + tAd.Width / 2: adY2 = tAd.Top + tAd.Height / 2
        Set shAd = wsAd.Shapes.AddLine(adX1, adY1, adX2, adY2)
    End If
    shAd.Name = cblId
    shAd.OnAction = ""
    shAd.Placement = 3
    shAd.Line.ForeColor.RGB = lc
    shAd.Line.Weight = lwt
    ' owner 2026-06-08 (8-84): 「케이블ID」 → 「선로ID」 (네트웍구성도와 라벨 통일)
    AddCableCallout wsAd, shAd, cblId, "선로ID" & vbCr & spec & vbCr & "거리", spec

    ' 네트웍 — line + 시설물 중심 (owner 요구)
    If Not fNw Is Nothing And Not tNw Is Nothing Then
        Dim fcx2 As Double, fcy2 As Double, tcx2 As Double, tcy2 As Double
        fcx2 = fNw.Left + fNw.Width / 2: fcy2 = fNw.Top + fNw.Height / 2
        tcx2 = tNw.Left + tNw.Width / 2: tcy2 = tNw.Top + tNw.Height / 2
        Dim shNw As Shape
        Set shNw = wsNw.Shapes.AddLine(fcx2, fcy2, tcx2, tcy2)
        shNw.Name = cblId
        shNw.OnAction = ""
        shNw.Placement = 3
        shNw.Line.ForeColor.RGB = lc
        shNw.Line.Weight = lwt
        AddCableCalloutBox wsNw, shNw, cblId, spec
    End If

    ' 메타 row 복원
    AppendMetaRow SHEET_META_CBL, Array(cblId, fromId, toId, spec, "", Now)
    Action_케이블_단순복원 = True
    Exit Function
Fail:
End Function

' === 케이블 삭제 — payload 직렬화 + 복원 (단순 — 양 끝 시설물 + spec + 단순 직선) ===
'   사용자가 그린 정확한 waypoints (도로 곡선 등) 는 복원 안 됨

Public Function Action_cable_delete_payload(cblId As String) As String
    On Error GoTo Fail
    Dim metaRow As Variant: metaRow = MetaFindRow(SHEET_META_CBL, 1, cblId)
    Dim fromId As String, toId As String, spec As String
    If Not IsEmpty(metaRow) Then
        Dim ub As Long: ub = 0
        On Error Resume Next
        ub = UBound(metaRow)
        On Error GoTo Fail
        If ub >= 2 Then fromId = CStr(metaRow(2))
        If ub >= 3 Then toId = CStr(metaRow(3))
        If ub >= 4 Then spec = CStr(metaRow(4))
    End If

    ' 행정도 케이블 도형의 실제 색·두께 + 노드 좌표 (waypoints) + callout text·위치 직렬화
    Dim wsAd As Worksheet: Set wsAd = ThisWorkbook.Worksheets(SHEET_ADMIN)
    Dim cblShp As Shape: Set cblShp = Nothing
    On Error Resume Next
    Set cblShp = wsAd.Shapes(cblId)
    On Error GoTo 0
    Dim lc As Long: lc = -1
    Dim lwt As Double: lwt = -1
    Dim nodesField As String: nodesField = Action_cable_nodes_직렬화(cblShp)
    If Not cblShp Is Nothing Then
        On Error Resume Next
        lc = cblShp.Line.ForeColor.RGB
        lwt = cblShp.Line.Weight
        On Error GoTo 0
    End If

    ' callout text 와 위치 (사용자 편집·드래그 보존)
    Dim adCl As Shape: Set adCl = Nothing
    On Error Resume Next
    Set adCl = wsAd.Shapes(PREFIX_LABEL & cblId)
    On Error GoTo 0
    Dim cl_text As String, cl_l As Double, cl_t As Double
    If Not adCl Is Nothing Then
        On Error Resume Next
        cl_text = adCl.TextFrame2.TextRange.Text
        cl_l = adCl.Left
        cl_t = adCl.Top
        On Error GoTo 0
    End If
    cl_text = Replace(cl_text, "`", "##BT##")
    cl_text = Replace(cl_text, vbCr, "##NL##")
    cl_text = Replace(cl_text, vbLf, "")

    Action_cable_delete_payload = "cblId=" & cblId & "`fromId=" & fromId & _
                                  "`toId=" & toId & "`spec=" & spec & _
                                  "`color=" & lc & "`weight=" & lwt & _
                                  "`nodes=" & nodesField & _
                                  "`cl_text=" & cl_text & "`cl_l=" & cl_l & "`cl_t=" & cl_t
    Exit Function
Fail:
    Action_cable_delete_payload = "cblId=" & cblId
End Function

' 케이블 도형의 노드 좌표를 "x1!y1|x2!y2|..." 형식으로 직렬화 — waypoints 보존용
Public Function Action_cable_nodes_직렬화(cblShp As Shape) As String
    If cblShp Is Nothing Then Exit Function
    Dim nc As Long: nc = 0
    On Error Resume Next
    nc = cblShp.Nodes.Count
    On Error GoTo 0
    If nc < 2 Then Exit Function
    Dim result As String, i As Long
    For i = 1 To nc
        Dim pt As Variant
        On Error Resume Next
        pt = cblShp.Nodes(i).Points
        On Error GoTo 0
        If IsArray(pt) Then
            If i > 1 Then result = result & "|"
            result = result & CDbl(pt(1, 1)) & "!" & CDbl(pt(1, 2))
        End If
    Next i
    Action_cable_nodes_직렬화 = result
End Function

' "x1!y1|x2!y2|..." 를 2D 점 배열로 파싱 (AddPolyline 용 1-based)
Public Function Action_cable_nodes_파싱(nodesField As String) As Variant
    If Len(nodesField) = 0 Then Exit Function
    Dim ptsArr() As String: ptsArr = Split(nodesField, "|")
    Dim n As Long: n = UBound(ptsArr) - LBound(ptsArr) + 1
    If n < 2 Then Exit Function
    Dim out() As Double: ReDim out(1 To n, 1 To 2)
    Dim i As Long
    For i = 0 To n - 1
        Dim xy() As String: xy = Split(ptsArr(i), "!")
        If UBound(xy) >= 1 Then
            On Error Resume Next
            out(i + 1, 1) = CDbl(xy(0))
            out(i + 1, 2) = CDbl(xy(1))
            On Error GoTo 0
        End If
    Next i
    Action_cable_nodes_파싱 = out
End Function

Public Function Action_cable_delete_복원(payload As String) As Boolean
    On Error GoTo Fail
    Dim cblId As String: cblId = Action_payload_get(payload, "cblId")
    Dim fromId As String: fromId = Action_payload_get(payload, "fromId")
    Dim toId As String: toId = Action_payload_get(payload, "toId")
    Dim spec As String: spec = Action_payload_get(payload, "spec")

    If Len(fromId) = 0 Or Len(toId) = 0 Then
        MsgBox "복원 불가 — 케이블의 양 끝 시설물 정보가 없습니다.", vbExclamation, "되돌리기"
        Exit Function
    End If

    Dim wsAd As Worksheet: Set wsAd = ThisWorkbook.Worksheets(SHEET_ADMIN)
    Dim wsNw As Worksheet: Set wsNw = ThisWorkbook.Worksheets(SHEET_NETWORK)

    Dim fAd As Shape, tAd As Shape, fNw As Shape, tNw As Shape
    On Error Resume Next
    Set fAd = wsAd.Shapes(fromId)
    Set tAd = wsAd.Shapes(toId)
    Set fNw = wsNw.Shapes(fromId)
    Set tNw = wsNw.Shapes(toId)
    On Error GoTo Fail
    If fAd Is Nothing Or tAd Is Nothing Then
        MsgBox "복원 불가 — 양 끝 시설물이 더 이상 존재하지 않습니다.", vbExclamation, "되돌리기"
        Exit Function
    End If

    On Error Resume Next
    wsAd.Unprotect: wsNw.Unprotect
    On Error GoTo Fail

    ' 색·두께 — payload 우선 (owner 변경값 보존), 없으면 범례 fallback
    Dim lc As Long: lc = CBL_DEFAULT_COLOR
    Dim lwt As Double: lwt = CBL_LINE_WEIGHT
    Dim colorStr As String: colorStr = Action_payload_get(payload, "color")
    Dim weightStr As String: weightStr = Action_payload_get(payload, "weight")
    If IsNumeric(colorStr) Then
        Dim cv As Long: cv = CLng(colorStr)
        If cv >= 0 Then lc = cv
    End If
    If IsNumeric(weightStr) Then
        Dim wv As Double: wv = CDbl(weightStr)
        If wv > 0 Then lwt = wv
    End If
    If lc = CBL_DEFAULT_COLOR Or lwt = CBL_LINE_WEIGHT Then
        ' payload 없으면 범례에서 추정
        Dim cleg As Shape: Set cleg = 첫범례_by_kind(wsAd, "cable")
        If Not cleg Is Nothing Then
            On Error Resume Next
            If lc = CBL_DEFAULT_COLOR Then lc = cleg.Line.ForeColor.RGB
            If lwt = CBL_LINE_WEIGHT And cleg.Line.Weight > 0 Then lwt = cleg.Line.Weight
            On Error GoTo 0
        End If
    End If

    ' 행정도 — waypoints 있으면 polyline (정확한 경로), 없으면 단순 직선
    Dim nodesField As String: nodesField = Action_payload_get(payload, "nodes")
    Dim shAd As Shape: Set shAd = Nothing
    If Len(nodesField) > 0 Then
        Dim ptsArr As Variant: ptsArr = Action_cable_nodes_파싱(nodesField)
        If IsArray(ptsArr) Then
            On Error Resume Next
            Set shAd = wsAd.Shapes.AddPolyline(ptsArr)
            On Error GoTo 0
        End If
    End If
    If shAd Is Nothing Then
        ' fallback — 양 끝 직선
        Dim adX1 As Double, adY1 As Double, adX2 As Double, adY2 As Double
        adX1 = fAd.Left + fAd.Width / 2: adY1 = fAd.Top + fAd.Height / 2
        adX2 = tAd.Left + tAd.Width / 2: adY2 = tAd.Top + tAd.Height / 2
        Set shAd = wsAd.Shapes.AddLine(adX1, adY1, adX2, adY2)
    End If
    shAd.Name = cblId
    shAd.OnAction = ""
    shAd.Placement = 3
    shAd.Line.ForeColor.RGB = lc
    shAd.Line.Weight = lwt
    ' callout text 복원 (사용자 편집 텍스트 있으면 그대로, 없으면 기본 템플릿)
    Dim cblClText As String: cblClText = Action_payload_get(payload, "cl_text")
    cblClText = Replace(cblClText, "##NL##", vbCr)
    cblClText = Replace(cblClText, "##BT##", "`")
    ' owner 2026-06-08 (8-84): 「케이블ID」 → 「선로ID」 (네트웍구성도와 라벨 통일)
    If Len(cblClText) = 0 Then cblClText = "선로ID" & vbCr & spec & vbCr & "거리"
    AddCableCallout wsAd, shAd, cblId, cblClText, spec
    ' callout 위치 복원 (사용자 드래그)
    Dim cblClL As Double, cblClT As Double
    On Error Resume Next
    cblClL = CDbl(Action_payload_get(payload, "cl_l"))
    cblClT = CDbl(Action_payload_get(payload, "cl_t"))
    On Error GoTo Fail
    If cblClL > 0 Then
        Dim adCblCl As Shape: Set adCblCl = Nothing
        On Error Resume Next
        Set adCblCl = wsAd.Shapes(PREFIX_LABEL & cblId)
        On Error GoTo 0
        If Not adCblCl Is Nothing Then
            On Error Resume Next
            adCblCl.Left = cblClL
            adCblCl.Top = cblClT
            On Error GoTo 0
        End If
    End If

    ' 네트웍 — line + 시설물 중심 (owner 요구)
    If Not fNw Is Nothing And Not tNw Is Nothing Then
        Dim fcxR As Double, fcyR As Double, tcxR As Double, tcyR As Double
        fcxR = fNw.Left + fNw.Width / 2: fcyR = fNw.Top + fNw.Height / 2
        tcxR = tNw.Left + tNw.Width / 2: tcyR = tNw.Top + tNw.Height / 2
        Dim shNw As Shape
        Set shNw = wsNw.Shapes.AddLine(fcxR, fcyR, tcxR, tcyR)
        shNw.Name = cblId
        shNw.OnAction = ""
        shNw.Placement = 3
        shNw.Line.ForeColor.RGB = lc
        shNw.Line.Weight = lwt
        AddCableCalloutBox wsNw, shNw, cblId, spec
    End If

    ' 메타 row 복원
    AppendMetaRow SHEET_META_CBL, Array(cblId, fromId, toId, spec, "", Now)

    ApplySheetProtection wsAd
    ApplySheetProtection wsNw
    Action_cable_delete_복원 = True
    Application.StatusBar = "케이블 복원 (단순 직선) — 정확한 경로는 다시 그려야 함"
    Exit Function
Fail:
End Function

' 케이블 「조용히」 삭제 (cable_add undo 용)
Public Function Action_케이블_삭제_조용히(cblId As String) As Boolean
    On Error GoTo Fail
    If Len(cblId) = 0 Then Exit Function
    Dim wsAd As Worksheet: Set wsAd = ThisWorkbook.Worksheets(SHEET_ADMIN)
    Dim wsNw As Worksheet: Set wsNw = ThisWorkbook.Worksheets(SHEET_NETWORK)
    On Error Resume Next
    wsAd.Unprotect: wsNw.Unprotect
    wsAd.Shapes(cblId).Delete
    wsNw.Shapes(cblId).Delete
    wsAd.Shapes(PREFIX_LABEL & cblId).Delete
    wsNw.Shapes(PREFIX_LABEL & cblId).Delete
    On Error GoTo Fail
    MetaDeleteRow SHEET_META_CBL, 1, cblId
    ApplySheetProtection wsAd
    ApplySheetProtection wsNw
    Action_케이블_삭제_조용히 = True
    Exit Function
Fail:
End Function

' 메타 정리 undo — payload 의 각 row 를 메타 시트에 다시 추가
Public Function Action_meta_cleanup_복원(payload As String) As Boolean
    On Error GoTo Fail
    Dim wsMeta As Worksheet: Set wsMeta = ThisWorkbook.Worksheets(SHEET_META_FAC)
    Dim rows() As String: rows = Split(payload, "@@@")    ' 각 row 는 @@@ 로 구분
    Dim i As Long
    For i = LBound(rows) To UBound(rows)
        If Len(rows(i)) > 0 Then
            Dim fields() As String: fields = Split(rows(i), "`")    ' 컬럼 ` 구분
            Dim newR As Long: newR = wsMeta.Cells(wsMeta.Rows.Count, 1).End(xlUp).Row + 1
            Dim j As Long
            For j = LBound(fields) To UBound(fields)
                wsMeta.Cells(newR, j + 1).Value = fields(j)
            Next j
        End If
    Next i
    Action_meta_cleanup_복원 = True
    Exit Function
Fail:
End Function

' 메타 정리 redo — payload 의 각 row 와 일치하는 facId 행 다시 삭제
Public Function Action_meta_cleanup_재실행(payload As String) As Boolean
    On Error GoTo Fail
    Dim wsMeta As Worksheet: Set wsMeta = ThisWorkbook.Worksheets(SHEET_META_FAC)
    Dim rows() As String: rows = Split(payload, "@@@")
    Dim targets As Object: Set targets = CreateObject("Scripting.Dictionary")
    Dim i As Long
    For i = LBound(rows) To UBound(rows)
        If Len(rows(i)) > 0 Then
            Dim fields() As String: fields = Split(rows(i), "`")
            If UBound(fields) >= 0 Then targets(CStr(fields(0))) = True
        End If
    Next i
    Dim lastR As Long: lastR = wsMeta.Cells(wsMeta.Rows.Count, 1).End(xlUp).Row
    Dim r As Long
    For r = lastR To 2 Step -1
        Dim fId As String: fId = CStr(wsMeta.Cells(r, 1).Value)
        If targets.Exists(fId) Or (Len(fId) = 0 And targets.Exists("")) Then
            wsMeta.Rows(r).Delete
        End If
    Next r
    Action_meta_cleanup_재실행 = True
    Exit Function
Fail:
End Function

' 메타 정리 직전 호출 — 삭제 대상 row 들을 직렬화해 payload 반환
Public Function Action_meta_cleanup_payload(rowsToDelete As Collection) As String
    Dim wsMeta As Worksheet: Set wsMeta = ThisWorkbook.Worksheets(SHEET_META_FAC)
    Dim result As String, i As Long, r As Long
    For i = 1 To rowsToDelete.Count
        r = rowsToDelete(i)
        If i > 1 Then result = result & "@@@"
        ' 5 컬럼 전부 직렬화 (id, type, name, created_at, badge_no)
        Dim c As Long, cellVal As String
        For c = 1 To 5
            cellVal = CStr(wsMeta.Cells(r, c).Value)
            If c > 1 Then result = result & "`"
            result = result & cellVal
        Next c
    Next i
    Action_meta_cleanup_payload = result
End Function

' payload 에서 key 값 추출 — payload 형식 "k1=v1`k2=v2`..."
Public Function Action_payload_get(payload As String, key As String) As String
    Dim parts() As String: parts = Split(payload, "`")
    Dim i As Long
    For i = LBound(parts) To UBound(parts)
        Dim kv() As String: kv = Split(parts(i), "=")
        If UBound(kv) >= 1 Then
            If Trim(kv(0)) = key Then Action_payload_get = kv(1): Exit Function
        End If
    Next i
End Function

' redo 스택 비움 (새 동작 시)
Public Sub Action_redo_비우기()
    Dim sh As Worksheet: Set sh = Action_로그시트()
    Dim lastR As Long: lastR = sh.Cells(sh.Rows.Count, 1).End(xlUp).Row
    Dim r As Long
    For r = lastR To 2 Step -1
        If CStr(sh.Cells(r, 2).Value) = "redo" Then sh.Rows(r).Delete
    Next r
End Sub

' undo 스택 20 초과 시 가장 오래된 row 삭제
Public Sub Action_스택_트림()
    Dim sh As Worksheet: Set sh = Action_로그시트()
    Dim lastR As Long: lastR = sh.Cells(sh.Rows.Count, 1).End(xlUp).Row
    Dim undoCount As Long: undoCount = 0
    Dim r As Long
    For r = 2 To lastR
        If CStr(sh.Cells(r, 2).Value) = "undo" Then undoCount = undoCount + 1
    Next r
    Do While undoCount > UNDO_MAX
        For r = 2 To lastR
            If CStr(sh.Cells(r, 2).Value) = "undo" Then
                sh.Rows(r).Delete
                undoCount = undoCount - 1
                lastR = lastR - 1
                Exit For
            End If
        Next r
    Loop
End Sub

' 로그 시트 통째 삭제 (행정도_초기화 등에서 호출)
Public Sub Undo_초기화()
    Dim wb As Workbook: Set wb = ThisWorkbook
    Dim sh As Worksheet
    On Error Resume Next
    Set sh = wb.Worksheets(UNDO_LOG_SHEET)
    On Error GoTo 0
    If sh Is Nothing Then Exit Sub
    Dim oAlerts As Boolean: oAlerts = Application.DisplayAlerts
    Application.DisplayAlerts = False
    On Error Resume Next
    sh.Delete
    On Error GoTo 0
    Application.DisplayAlerts = oAlerts
End Sub

' 네트웍구성도 옛 ← → 버튼 도형 정리 — owner 요구로 리본 「추가 기능」 탭으로 이전. 시트 도형 삭제
Public Sub 네트웍_패널_제거(ws As Worksheet)
    If ws Is Nothing Then Exit Sub
    If ws.Name <> SHEET_NETWORK Then Exit Sub

    Dim wasProt As Boolean: wasProt = ws.ProtectContents Or ws.ProtectDrawingObjects
    On Error Resume Next
    ws.Unprotect
    On Error GoTo 0

    Dim i As Long, nm As String
    For i = ws.Shapes.Count To 1 Step -1
        nm = ws.Shapes(i).Name
        If Left(nm, Len(PANEL_PREFIX)) = PANEL_PREFIX Then
            On Error Resume Next
            ws.Shapes(i).Delete
            On Error GoTo 0
        End If
    Next i

    If wasProt Then ApplySheetProtection ws
End Sub

' 배지 도형이 사라진 시설물의 부속(콤보·상태박스) 일괄 정리.
'   owner: 「배지를 삭제하면 네트웍 콤보박스·주야간박스도 같이 삭제」
'   양 시트 중 한쪽이라도 배지 도형 없으면 → 남은 쪽 배지·네트웍 콤보·상태박스 모두 삭제 (동기화)
Public Sub 배지없는_시설물_부속정리()
    Dim wsAd As Worksheet: Set wsAd = ThisWorkbook.Worksheets(SHEET_ADMIN)
    Dim wsNw As Worksheet
    On Error Resume Next
    Set wsNw = ThisWorkbook.Worksheets(SHEET_NETWORK)
    On Error GoTo 0

    Dim wsMeta As Worksheet
    On Error Resume Next
    Set wsMeta = ThisWorkbook.Worksheets(SHEET_META_FAC)
    On Error GoTo 0
    If wsMeta Is Nothing Then Exit Sub

    Dim wasAd As Boolean: wasAd = wsAd.ProtectContents Or wsAd.ProtectDrawingObjects
    Dim wasNw As Boolean: wasNw = False
    If Not wsNw Is Nothing Then wasNw = wsNw.ProtectContents Or wsNw.ProtectDrawingObjects
    On Error Resume Next
    wsAd.Unprotect
    If Not wsNw Is Nothing Then wsNw.Unprotect
    On Error GoTo 0

    Dim last As Long: last = wsMeta.Cells(wsMeta.Rows.Count, 1).End(xlUp).Row
    Dim r As Long, facId As String
    For r = 2 To last
        facId = CStr(wsMeta.Cells(r, 1).Value)
        If Len(facId) = 0 Then GoTo NextR

        Dim adBd As Shape, nwBd As Shape
        Set adBd = Nothing: Set nwBd = Nothing
        On Error Resume Next
        Set adBd = wsAd.Shapes(PREFIX_BADGE & facId)
        If Not wsNw Is Nothing Then Set nwBd = wsNw.Shapes(PREFIX_BADGE & facId)
        On Error GoTo 0

        Dim missing As Boolean
        missing = (adBd Is Nothing) Or (Not wsNw Is Nothing And nwBd Is Nothing)

        If missing Then
            On Error Resume Next
            If Not adBd Is Nothing Then adBd.Delete
            If Not nwBd Is Nothing Then nwBd.Delete
            If Not wsNw Is Nothing Then
                wsNw.Shapes(PREFIX_FAC_TAG_DD & facId).Delete
                wsNw.Shapes(PREFIX_FAC_STATUS & facId).Delete
            End If
            On Error GoTo 0
        End If
NextR:
    Next r

    If wasAd Then ApplySheetProtection wsAd
    If wasNw And Not wsNw Is Nothing Then ApplySheetProtection wsNw
End Sub

' ============================================================================
'  네트웍구성도 격자 (시설물 배치 가이드 — 20x20 셀이 한 칸의 노란 십자 격자)
'    - 신규 시설물 = 격자 셀 중앙 자동 스냅 (SnapToNetworkGrid)
'    - 사용자가 시설물을 자유롭게 옮길 수 있도록 격자는 시각 보조용만 (Locked=True)
' ============================================================================
' 네트웍구성도 좌표 (centerX, centerY) 를 가장 가까운 격자 「노랑 셀」 의 정중앙으로 스냅.
'   owner: 격자 = 20번째·40번째·60번째... 행/열 셀에 노랑 배경. 시설물 중심이 그 셀(폭=1셀) 의 정중앙.
'   좌표 산출: nx = K * gridW + cw/2 (K번째 노랑 col 의 중앙)
Public Sub SnapToNetworkGrid(wsNw As Worksheet, ax As Double, ay As Double, _
                              ByRef nx As Double, ByRef ny As Double)
    Dim cw As Double: cw = wsNw.Cells(1, 1).Width
    Dim rh As Double: rh = wsNw.Cells(LEGEND_ROWS + 1, 1).Height   ' 격자 셀 높이 = 2행 (1행=검색바). owner 2026-06-10
    If cw <= 0 Then cw = CELL_PT
    If rh <= 0 Then rh = CELL_PT
    Dim gridW As Double: gridW = cw * 네트웍_격자_단위가로cells()
    Dim gridH As Double: gridH = rh * 네트웍_격자_단위세로cells()
    If ax < 0 Then ax = 0
    If ay < 0 Then ay = 0
    Dim gridCol As Long: gridCol = CLng(ax / gridW)
    ' owner 2026-06-10: 격자 원점 Y = NW_TOP_H (1행=검색바, 격자 2행부터). gridRow 0 = 첫 격자 행(Top=NW_TOP_H).
    Dim gridRow As Long: gridRow = CLng((ay - NW_TOP_H) / gridH)
    ' owner 2026-06-07 (8-59): 첫 격자 열 (gridCol=0 = A열 영역) 스킵 — 행 클램프와 동일 정책.
    If gridCol < 1 Then gridCol = 1
    If gridRow < 0 Then gridRow = 0
    ' 노랑 셀 (col = gridCol*20 + 1) 의 중앙 좌표
    nx = gridCol * gridW + cw / 2
    ny = NW_TOP_H + gridRow * gridH + rh / 2
    ' 검색바(1행) 침범 방지 — 시설물 중심이 검색바 아래로 가도록 클램프.
    Dim minNy As Double
    minNy = NW_TOP_H + FAC_DEFAULT_H / 2 + 8
    If ny < minNy Then
        ny = NW_TOP_H + gridH + rh / 2   ' 첫 격자 행이 검색바와 겹치면 다음 격자 행으로
        If ny < minNy Then ny = minNy
    End If
End Sub

' owner 2026-06-07 (8-68): 네트웍구성도에서 매핑 좌표 (nx, ny) 와 가장 가까운 기존 시설물의 중심 좌표.
'   기준 시설물 = 새 시설물 배치 시 6 우선순위 위치의 anchor.
'   excludeFacId 자기 자신 제외. 못 찾으면 False (첫 시설물 케이스).
Public Function 네트웍_최근접_시설물(wsNw As Worksheet, nx As Double, ny As Double, _
                                       ByRef refCenterX As Double, ByRef refCenterY As Double, _
                                       Optional excludeFacId As String = "") As Boolean
    네트웍_최근접_시설물 = False
    If wsNw Is Nothing Then Exit Function
    Dim sh As Shape
    Dim bestDist As Double: bestDist = 1E+30
    Dim bestX As Double, bestY As Double
    For Each sh In wsNw.Shapes
        If Left(sh.Name, Len(PREFIX_FAC)) = PREFIX_FAC Then
            If Len(excludeFacId) = 0 Or sh.Name <> excludeFacId Then
                Dim cx As Double, cy As Double
                cx = sh.Left + sh.Width / 2
                cy = sh.Top + sh.Height / 2
                Dim ddx As Double, ddy As Double
                ddx = cx - nx: ddy = cy - ny
                Dim d As Double: d = ddx * ddx + ddy * ddy
                If d < bestDist Then
                    bestDist = d
                    bestX = cx: bestY = cy
                End If
            End If
        End If
    Next sh
    If bestDist < 1E+29 Then
        refCenterX = bestX
        refCenterY = bestY
        네트웍_최근접_시설물 = True
    End If
End Function

' owner 2026-06-07 (8-75): 행정도에서 (adminX, adminY) 와 가장 가까운 기존 시설물의 facId 반환.
'   기준 = 「행정도에서 가장 가까운」 시설물 → 그 시설물의 네트웍 위치 주변 8 cell 에 새 시설물 배치.
'   excludeFacId 자기 자신 제외 (방금 그린 신규 시설물 본인). 못 찾으면 False (첫 시설물).
Public Function 행정도_최근접_시설물(wsAd As Worksheet, adminX As Double, adminY As Double, _
                                       ByRef facId As String, _
                                       Optional excludeFacId As String = "") As Boolean
    행정도_최근접_시설물 = False
    facId = ""
    If wsAd Is Nothing Then Exit Function
    Dim sh As Shape
    Dim bestDist As Double: bestDist = 1E+30
    Dim bestId As String
    For Each sh In wsAd.Shapes
        If Left(sh.Name, Len(PREFIX_FAC)) = PREFIX_FAC Then
            If Len(excludeFacId) = 0 Or sh.Name <> excludeFacId Then
                Dim cx As Double, cy As Double
                cx = sh.Left + sh.Width / 2
                cy = sh.Top + sh.Height / 2
                Dim ddx As Double, ddy As Double
                ddx = cx - adminX: ddy = cy - adminY
                Dim d As Double: d = ddx * ddx + ddy * ddy
                If d < bestDist Then
                    bestDist = d
                    bestId = sh.Name
                End If
            End If
        End If
    Next sh
    If bestDist < 1E+29 Then
        facId = bestId
        행정도_최근접_시설물 = True
    End If
End Function

' owner 2026-06-07 (8-68): 단일 방향의 6 우선순위 offset 산출 — 「U」/「D」/「L」/「R」.
'   owner 그림 정본 (위쪽 예시, +y=위쪽 owner 좌표 / Excel 은 +y=아래):
'     1=(0, 1)     · 2=(0, 0.5)       · 3=(1, 1)
'     4=(0.5, 0.5) · 5=(-1, 1)        · 6=(-0.5, 0.5)
'   상·하·좌·우 동일 패턴 — 정면축 부호 + 측면축 정렬 유지 (축 대칭).
Public Sub 우선순위_offsets_방향(direction As String, ByVal gw As Double, ByVal gh As Double, _
                                  ByRef ox() As Double, ByRef oy() As Double)
    Dim sx As Long, sy As Long
    Select Case direction
        Case "U"
            sy = -1
            ox(1) = 0:       oy(1) = sy * gh
            ox(2) = 0:       oy(2) = sy * gh / 2
            ox(3) = gw:      oy(3) = sy * gh
            ox(4) = gw / 2:  oy(4) = sy * gh / 2
            ox(5) = -gw:     oy(5) = sy * gh
            ox(6) = -gw / 2: oy(6) = sy * gh / 2
        Case "D"
            sy = 1
            ox(1) = 0:       oy(1) = sy * gh
            ox(2) = 0:       oy(2) = sy * gh / 2
            ox(3) = gw:      oy(3) = sy * gh
            ox(4) = gw / 2:  oy(4) = sy * gh / 2
            ox(5) = -gw:     oy(5) = sy * gh
            ox(6) = -gw / 2: oy(6) = sy * gh / 2
        Case "R"
            sx = 1
            ox(1) = sx * gw:     oy(1) = 0
            ox(2) = sx * gw / 2: oy(2) = 0
            ox(3) = sx * gw:     oy(3) = gh
            ox(4) = sx * gw / 2: oy(4) = gh / 2
            ox(5) = sx * gw:     oy(5) = -gh
            ox(6) = sx * gw / 2: oy(6) = -gh / 2
        Case "L"
            sx = -1
            ox(1) = sx * gw:     oy(1) = 0
            ox(2) = sx * gw / 2: oy(2) = 0
            ox(3) = sx * gw:     oy(3) = gh
            ox(4) = sx * gw / 2: oy(4) = gh / 2
            ox(5) = sx * gw:     oy(5) = -gh
            ox(6) = sx * gw / 2: oy(6) = -gh / 2
    End Select
End Sub

' owner 2026-06-07 (8-68): 기준 시설물 주변 24 우선순위 위치 (4 방향 × 6 위치) 에서 빈 자리 찾기.
'   방향 (dirX, dirY) = 새 시설물 매핑 좌표 - 기준 좌표. 절대값 큰 축이 주 방향.
'   주 방향 1→6 다 점유 시 시계방향 다음 방향 1→6 시도 (URDL 순환).
'   못 찾으면 False.
Public Function 네트웍_우선순위_배치(wsNw As Worksheet, refX As Double, refY As Double, _
                                      dirX As Double, dirY As Double, _
                                      facW As Double, facH As Double, _
                                      ByRef outX As Double, ByRef outY As Double, _
                                      Optional excludeFacId As String = "") As Boolean
    네트웍_우선순위_배치 = False

    Dim cw As Double: cw = wsNw.Cells(1, 1).Width
    Dim rh As Double: rh = wsNw.Cells(LEGEND_ROWS + 1, 1).Height   ' 격자 셀 높이 = 2행 (1행=검색바). owner 2026-06-10
    If cw <= 0 Then cw = CELL_PT
    If rh <= 0 Then rh = CELL_PT
    Dim gw As Double: gw = cw * 네트웍_격자_단위가로cells()
    Dim gh As Double: gh = rh * 네트웍_격자_단위세로cells()

    ' 주 방향 결정 ("U"/"D"/"L"/"R")
    Dim primary As String
    If Abs(dirX) >= Abs(dirY) Then
        If dirX >= 0 Then primary = "R" Else primary = "L"
    Else
        If dirY >= 0 Then primary = "D" Else primary = "U"
    End If

    ' 시계방향 순서 — U→R→D→L→U. 주 방향부터 시계방향 3개를 차례로
    Dim cwOrder As String: cwOrder = "URDL"
    Dim startIdx As Long: startIdx = InStr(cwOrder, primary)
    Dim dirSeq(1 To 4) As String
    Dim s As Long
    For s = 1 To 4
        Dim k As Long: k = startIdx + s - 1
        If k > 4 Then k = k - 4
        dirSeq(s) = Mid(cwOrder, k, 1)
    Next s

    ' 클램프 (범례·A열 회피 — 기존 빈격자 검색과 동일 정책)
    Dim minTryY As Double: minTryY = NW_TOP_H + facH / 2 + 8   ' owner 2026-06-10: 검색바(1행) 아래
    Dim minTryX As Double: minTryX = gw + cw / 2

    Dim ox(1 To 6) As Double, oy(1 To 6) As Double
    Dim di As Long, i As Long
    For di = 1 To 4
        우선순위_offsets_방향 dirSeq(di), gw, gh, ox, oy
        For i = 1 To 6
            Dim tx As Double, ty As Double
            tx = refX + ox(i): ty = refY + oy(i)
            If tx >= minTryX And ty >= minTryY Then
                If Not 격자셀_시설물겹침(wsNw, tx, ty, facW, facH, excludeFacId) Then
                    outX = tx: outY = ty
                    네트웍_우선순위_배치 = True
                    Exit Function
                End If
            End If
        Next i
    Next di
End Function

' 네트웍구성도 시설물 겹침 회피 — owner 2026-06-07 (8-75) 정본
'   행정도 좌표 받으면 「행정도 거리순」 시설물 각각의 네트웍 위치 주변 8 cell (-1,-1)~(1,1) 안에서만 시도.
'   범위 벗어남 방지 — 가장 가까운 기준 8 cell 모두 점유 시 다음 가까운 기준 8 cell 시도.
'   → 「반드시 기존 시설물 인접 cell 에 배치」 보장.
'   8 cell 우선순위 (owner 정본 + (0,-1) fallback):
'     1.(-1,-1) 2.(-1,0) 3.(-1,1) 4.(0,1) 5.(1,1) 6.(1,0) 7.(1,-1) 8.(0,-1)
'   행정도 좌표 없으면 기존 spiral 흐름 폴백.
'   (nx, ny) = 시설물 중심 좌표 (in/out). facW/facH = 시설물 크기. excludeFacId = 자기 자신 제외.
Public Sub 네트웍_빈격자_찾기(wsNw As Worksheet, ByRef nx As Double, ByRef ny As Double, _
                              facW As Double, facH As Double, _
                              Optional excludeFacId As String = "", _
                              Optional adminX As Double = -1E+30, _
                              Optional adminY As Double = -1E+30, _
                              Optional wsAd As Worksheet = Nothing)
    Dim cw As Double: cw = wsNw.Cells(1, 1).Width
    Dim rh As Double: rh = wsNw.Cells(LEGEND_ROWS + 1, 1).Height   ' 격자 셀 높이 = 2행 (1행=검색바). owner 2026-06-10
    If cw <= 0 Then cw = CELL_PT
    If rh <= 0 Then rh = CELL_PT
    Dim gridW As Double: gridW = cw * 네트웍_격자_단위가로cells()
    Dim gridH As Double: gridH = rh * 네트웍_격자_단위세로cells()
    Dim minTryY As Double: minTryY = NW_TOP_H + facH / 2 + 8   ' owner 2026-06-10: 검색바(1행) 아래
    Dim minTryX As Double: minTryX = gridW + cw / 2

    ' === owner 2026-06-07 (8-75): 행정도 거리순 8-cell 탐색 ===
    If adminX > -1E+29 And adminY > -1E+29 And Not wsAd Is Nothing Then
        Dim facCount As Long: facCount = 0
        Dim ids() As String, dists() As Double
        ReDim ids(1 To 8)
        ReDim dists(1 To 8)
        Dim sh As Shape
        For Each sh In wsAd.Shapes
            If Left(sh.Name, Len(PREFIX_FAC)) = PREFIX_FAC Then
                If Len(excludeFacId) = 0 Or sh.Name <> excludeFacId Then
                    facCount = facCount + 1
                    If facCount > UBound(ids) Then
                        ReDim Preserve ids(1 To UBound(ids) * 2)
                        ReDim Preserve dists(1 To UBound(dists) * 2)
                    End If
                    Dim ccx As Double, ccy As Double
                    ccx = sh.Left + sh.Width / 2
                    ccy = sh.Top + sh.Height / 2
                    Dim ddx As Double, ddy As Double
                    ddx = ccx - adminX: ddy = ccy - adminY
                    ids(facCount) = sh.Name
                    dists(facCount) = ddx * ddx + ddy * ddy
                End If
            End If
        Next sh

        If facCount > 0 Then
            ' 거리 오름차순 정렬 (insertion sort)
            Dim ii As Long, jj As Long
            For ii = 2 To facCount
                Dim tmpId As String: tmpId = ids(ii)
                Dim tmpD As Double: tmpD = dists(ii)
                jj = ii - 1
                Do While jj >= 1
                    If dists(jj) > tmpD Then
                        ids(jj + 1) = ids(jj)
                        dists(jj + 1) = dists(jj)
                        jj = jj - 1
                    Else
                        Exit Do
                    End If
                Loop
                ids(jj + 1) = tmpId
                dists(jj + 1) = tmpD
            Next ii

            ' 8 cell offset 순서 (owner 정본 + (0,-1) fallback)
            Dim dxs(1 To 8) As Long, dys(1 To 8) As Long
            dxs(1) = -1: dys(1) = -1
            dxs(2) = -1: dys(2) = 0
            dxs(3) = -1: dys(3) = 1
            dxs(4) = 0:  dys(4) = 1
            dxs(5) = 1:  dys(5) = 1
            dxs(6) = 1:  dys(6) = 0
            dxs(7) = 1:  dys(7) = -1
            dxs(8) = 0:  dys(8) = -1

            ' 거리 가까운 기준부터 8 cell 시도
            Dim r As Long, k As Long
            For r = 1 To facCount
                Dim nwShp As Shape: Set nwShp = Nothing
                On Error Resume Next
                Set nwShp = wsNw.Shapes(ids(r))
                On Error GoTo 0
                If Not nwShp Is Nothing Then
                    Dim refX As Double, refY As Double
                    refX = nwShp.Left + nwShp.Width / 2
                    refY = nwShp.Top + nwShp.Height / 2
                    For k = 1 To 8
                        Dim tx As Double, ty As Double
                        tx = refX + dxs(k) * gridW
                        ty = refY + dys(k) * gridH
                        If tx >= minTryX And ty >= minTryY Then
                            If Not 격자셀_시설물겹침(wsNw, tx, ty, facW, facH, excludeFacId) Then
                                nx = tx: ny = ty
                                Exit Sub
                            End If
                        End If
                    Next k
                End If
            Next r
            ' 모든 기준의 8 cell 점유 → 가장 가까운 기준 위치로 spiral 폴백
            Dim firstShp As Shape: Set firstShp = Nothing
            On Error Resume Next
            Set firstShp = wsNw.Shapes(ids(1))
            On Error GoTo 0
            If Not firstShp Is Nothing Then
                nx = firstShp.Left + firstShp.Width / 2
                ny = firstShp.Top + firstShp.Height / 2
            End If
        End If
    End If

    ' === 기존 spiral 폴백 ===
    If Not 격자셀_시설물겹침(wsNw, nx, ny, facW, facH, excludeFacId) Then Exit Sub

    Dim ring As Long, dx As Long, dy As Long
    Dim tryX As Double, tryY As Double

    ' 1단계 — 격자 셀 가까운 3 ring 만
    For ring = 1 To 3
        For dy = -ring To ring
            For dx = -ring To ring
                If Abs(dx) = ring Or Abs(dy) = ring Then
                    tryX = nx + dx * gridW
                    tryY = ny + dy * gridH
                    If tryX >= minTryX And tryY >= minTryY Then
                        If Not 격자셀_시설물겹침(wsNw, tryX, tryY, facW, facH, excludeFacId) Then
                            nx = tryX: ny = tryY
                            Exit Sub
                        End If
                    End If
                End If
            Next dx
        Next dy
    Next ring

    ' 2단계 — 자유 좌표 (격자 무시). 시설물 크기 단위로 미세 이동
    Dim stepX As Double: stepX = facW * 0.6
    Dim stepY As Double: stepY = facH * 0.6
    For ring = 1 To 12
        For dy = -ring To ring
            For dx = -ring To ring
                If Abs(dx) = ring Or Abs(dy) = ring Then
                    tryX = nx + dx * stepX
                    tryY = ny + dy * stepY
                    If tryX >= minTryX And tryY >= minTryY Then
                        If Not 격자셀_시설물겹침(wsNw, tryX, tryY, facW, facH, excludeFacId) Then
                            nx = tryX: ny = tryY
                            Exit Sub
                        End If
                    End If
                End If
            Next dx
        Next dy
    Next ring
    ' 못 찾으면 원래 위치 유지 (겹쳐도 어쩔 수 없음 — 매우 드문 케이스)
End Sub

' (nx, ny) 중심에 facW × facH 배치 시 다른 시설물과 겹치는지
Public Function 격자셀_시설물겹침(wsNw As Worksheet, nx As Double, ny As Double, _
                                  facW As Double, facH As Double, _
                                  Optional excludeFacId As String = "") As Boolean
    Dim lft As Double: lft = nx - facW / 2
    Dim tp As Double: tp = ny - facH / 2
    Dim rgt As Double: rgt = nx + facW / 2
    Dim btm As Double: btm = ny + facH / 2
    Dim sh As Shape
    For Each sh In wsNw.Shapes
        If Left(sh.Name, Len(PREFIX_FAC)) = PREFIX_FAC Then
            If sh.Name <> excludeFacId Then
                Dim sL As Double, sT As Double, sR As Double, sB As Double
                sL = sh.Left: sT = sh.Top
                sR = sL + sh.Width: sB = sT + sh.Height
                ' bbox overlap 검사 (간단한 AABB)
                If Not (rgt <= sL Or lft >= sR Or btm <= sT Or tp >= sB) Then
                    격자셀_시설물겹침 = True
                    Exit Function
                End If
            End If
        End If
    Next sh
End Function

' callout (말풍선) 겹침 회피 — AddFacilityCallout · AddCableCallout · AddCableCalloutBox 끝에서 호출
'   다른 callout (prefix lbl_) 과 겹치면 spiral 검색으로 빈 자리. 행정도·네트웍 양쪽 적용
Public Sub callout_겹침회피(ws As Worksheet, cl As Shape, Optional excludeName As String = "")
    If cl Is Nothing Then Exit Sub
    Dim curX As Double, curY As Double, w As Double, h As Double
    On Error Resume Next
    curX = cl.Left: curY = cl.Top: w = cl.Width: h = cl.Height
    On Error GoTo 0
    If w <= 0 Or h <= 0 Then Exit Sub
    If Not callout_겹침(ws, curX, curY, w, h, excludeName) Then Exit Sub

    Dim stepX As Double: stepX = w * 0.55
    Dim stepY As Double: stepY = h * 0.85         ' 위·아래로 더 적극적 이동 (말풍선이 보통 가로 길어서)
    Dim ring As Long, dx As Long, dy As Long, tryX As Double, tryY As Double
    For ring = 1 To 15
        For dy = -ring To ring
            For dx = -ring To ring
                If Abs(dx) = ring Or Abs(dy) = ring Then
                    tryX = curX + dx * stepX
                    tryY = curY + dy * stepY
                    If tryX > 0 And tryY > 0 Then
                        If Not callout_겹침(ws, tryX, tryY, w, h, excludeName) Then
                            On Error Resume Next
                            cl.Left = tryX
                            cl.Top = tryY
                            On Error GoTo 0
                            Exit Sub
                        End If
                    End If
                End If
            Next dx
        Next dy
    Next ring
End Sub

' (x, y) 좌상단에 w × h callout 배치 시 다른 callout (lbl_ prefix) 과 겹치는지
Public Function callout_겹침(ws As Worksheet, x As Double, y As Double, _
                              w As Double, h As Double, _
                              Optional excludeName As String = "") As Boolean
    Dim lft As Double: lft = x
    Dim tp As Double: tp = y
    Dim rgt As Double: rgt = x + w
    Dim btm As Double: btm = y + h
    Dim sh As Shape
    For Each sh In ws.Shapes
        If Left(sh.Name, Len(PREFIX_LABEL)) = PREFIX_LABEL Then
            If sh.Name <> excludeName Then
                Dim sL As Double, sT As Double, sR As Double, sB As Double
                sL = sh.Left: sT = sh.Top
                sR = sL + sh.Width: sB = sT + sh.Height
                If Not (rgt <= sL Or lft >= sR Or btm <= sT Or tp >= sB) Then
                    callout_겹침 = True
                    Exit Function
                End If
            End If
        End If
    Next sh
End Function

' ============================================================================
'  네트웍구성도 시설물 callout 위 「태그 콤보박스」
'    - AddFacilityTagCombo: 시설물 신규 생성 + PlaceFacility 에서 호출
'    - 시설물_태그_변경: 콤보 OnAction — 옵션 선택 시 태그 추가/토글
'    - 시설물_태그_위치_동기화: 시트_셀_클릭 이벤트에서 호출 (시설물 이동 따라잡기)
'    - 시설물_삭제 시 cleanup (태그·콤보 모두 제거)
' ============================================================================
' 콤보 옵션 정의 — Array(옵션 ID, 표시 라벨). 콤보 선택 시 숫자 InputBox → 상태 박스 갱신
Public Function FacilityTagOptions() As Variant
    FacilityTagOptions = Array( _
        Array("day", "주간"), _
        Array("night", "야간") _
    )
End Function

' 시설물 callout 위에 콤보박스 추가 (이미 있으면 건너뜀).
Public Sub AddFacilityTagCombo(ws As Worksheet, facId As String)
    Dim callout As Shape
    On Error Resume Next
    Set callout = ws.Shapes(PREFIX_LABEL & facId)
    On Error GoTo 0
    If callout Is Nothing Then Exit Sub

    Dim cbName As String: cbName = PREFIX_FAC_TAG_DD & facId
    Dim existing As Shape
    On Error Resume Next
    Set existing = ws.Shapes(cbName)
    On Error GoTo 0
    If Not existing Is Nothing Then Exit Sub

    On Error GoTo CErr
    Dim cb As Shape
    Set cb = ws.Shapes.AddFormControl(xlDropDown, _
                                       callout.Left, callout.Top - FAC_TAG_DD_H - FAC_TAG_GAP, _
                                       callout.Width, FAC_TAG_DD_H)
    cb.Name = cbName
    cb.OnAction = "시설물_태그_변경"
    cb.Placement = 3
    cb.Locked = False

    Dim opts As Variant: opts = FacilityTagOptions()
    Dim i As Long
    For i = LBound(opts) To UBound(opts)
        On Error Resume Next
        cb.ControlFormat.AddItem CStr(opts(i)(1))
        On Error GoTo 0
    Next i
    On Error Resume Next
    cb.ControlFormat.Value = 0
    On Error GoTo 0
CErr:
End Sub

' 태그 텍스트박스 생성 (callout 위치에 임시 배치, 정렬은 시설물_태그_위치_동기화 가 담당).
Public Function CreateFacilityTag(ws As Worksheet, facId As String, tagName As String, text As String) As Shape
    Dim callout As Shape
    On Error Resume Next
    Set callout = ws.Shapes(PREFIX_LABEL & facId)
    On Error GoTo 0
    If callout Is Nothing Then Exit Function

    On Error GoTo TErr
    Dim tg As Shape
    Set tg = ws.Shapes.AddShape(msoShapeRectangle, callout.Left, callout.Top, callout.Width, FAC_TAG_H)
    tg.Name = tagName
    tg.Placement = 3
    tg.Locked = False
    tg.Fill.Visible = msoTrue
    tg.Fill.ForeColor.RGB = RGB(255, 255, 255)
    tg.Line.Visible = msoTrue
    tg.Line.ForeColor.RGB = RGB(100, 116, 139)
    tg.Line.Weight = 0.75
    On Error Resume Next
    With tg.TextFrame2
        .WordWrap = msoFalse
        .AutoSize = msoAutoSizeShapeToFitText
        .VerticalAnchor = msoAnchorMiddle
        .MarginLeft = 4: .MarginRight = 4: .MarginTop = 1: .MarginBottom = 1
        .TextRange.Text = text
        .TextRange.Font.Name = CALLOUT_FONT_NAME
        .TextRange.Font.Size = 9
        .TextRange.Font.Bold = False
        .TextRange.Font.Fill.ForeColor.RGB = RGB(15, 23, 42)
        .TextRange.ParagraphFormat.Alignment = 2     ' centered
    End With
    On Error GoTo 0
    Set CreateFacilityTag = tg
TErr:
End Function

' 콤보 OnAction — 옵션 선택 시 숫자 InputBox → 시설물 상태 박스 갱신.
'   주간/야간 각각 숫자값을 가짐. 빈 칸 입력 = 해당 값 제거.
Public Sub 시설물_태그_변경()
    Dim cbName As String: cbName = Application.Caller
    If Len(cbName) <= Len(PREFIX_FAC_TAG_DD) Then Exit Sub
    If Left(cbName, Len(PREFIX_FAC_TAG_DD)) <> PREFIX_FAC_TAG_DD Then Exit Sub
    Dim facId As String: facId = Mid(cbName, Len(PREFIX_FAC_TAG_DD) + 1)

    Dim wsNw As Worksheet: Set wsNw = ThisWorkbook.Worksheets(SHEET_NETWORK)
    Dim cb As Shape
    On Error Resume Next
    Set cb = wsNw.Shapes(cbName)
    On Error GoTo 0
    If cb Is Nothing Then Exit Sub

    Dim idx As Long: idx = 0
    On Error Resume Next
    idx = cb.ControlFormat.Value
    On Error GoTo 0
    If idx = 0 Then Exit Sub

    Dim opts As Variant: opts = FacilityTagOptions()
    If idx < 1 Or idx > UBound(opts) - LBound(opts) + 1 Then Exit Sub
    Dim opt As Variant: opt = opts(LBound(opts) + idx - 1)
    Dim optId As String: optId = CStr(opt(0))     ' "day" or "night"
    Dim optLabel As String: optLabel = CStr(opt(1))

    Dim wasProt As Boolean: wasProt = wsNw.ProtectContents Or wsNw.ProtectDrawingObjects
    On Error Resume Next
    wsNw.Unprotect
    On Error GoTo 0

    ' 상태 박스 확보 (없으면 생성)
    AddFacilityStatusBox wsNw, facId

    ' 현재 day/night 값 추출 (AlternativeText 에 "day=N;night=M" 저장)
    Dim curDay As String, curNight As String
    상태박스_값_읽기 wsNw, facId, curDay, curNight

    ' InputBox 로 새 값 입력. 빈 칸 = 제거
    Dim defaultVal As String
    If optId = "day" Then defaultVal = curDay Else defaultVal = curNight
    Dim userVal As String
    userVal = InputBox(optLabel & " 숫자 입력 (빈 칸 = 제거)", optLabel, defaultVal)
    ' 콤보 reset
    On Error Resume Next
    cb.ControlFormat.Value = 0
    On Error GoTo 0
    userVal = Trim(userVal)

    If optId = "day" Then curDay = userVal Else curNight = userVal
    상태박스_값_쓰기 wsNw, facId, curDay, curNight

    ' owner 2026-06-06 (8-30): 야간 변경 시 주간 자동 재계산 (= 총 연결코어수 - 새 야간).
    '   주간 직접 변경은 사용자 override 유지 (다음 코어연결 또는 야간 변경 때까지).
    If optId = "night" Then
        시설물_상태박스_주간_자동갱신 wsNw, facId
    End If

    시설물_태그_위치_동기화 wsNw, facId
    If wasProt Then ApplySheetProtection wsNw
End Sub

' 상태 박스 생성 (없을 때만). callout 위에 분홍 박스 + 빈 텍스트.
Public Sub AddFacilityStatusBox(ws As Worksheet, facId As String)
    Dim nm As String: nm = PREFIX_FAC_STATUS & facId
    Dim existing As Shape
    On Error Resume Next
    Set existing = ws.Shapes(nm)
    On Error GoTo 0
    If Not existing Is Nothing Then Exit Sub

    Dim callout As Shape
    On Error Resume Next
    Set callout = ws.Shapes(PREFIX_LABEL & facId)
    On Error GoTo 0
    If callout Is Nothing Then Exit Sub

    On Error GoTo StErr
    Dim box As Shape
    Set box = ws.Shapes.AddShape(msoShapeRectangle, callout.Left, callout.Top, FAC_STATUS_W, FAC_STATUS_H)
    box.Name = nm
    box.Placement = 3
    box.Locked = False
    box.Fill.ForeColor.RGB = FAC_STATUS_FILL
    box.Line.Visible = msoTrue
    box.Line.ForeColor.RGB = RGB(100, 116, 139)
    box.Line.Weight = 0.75
    On Error Resume Next
    With box.TextFrame2
        .WordWrap = msoFalse
        .AutoSize = msoAutoSizeShapeToFitText
        .VerticalAnchor = msoAnchorMiddle
        .MarginLeft = Application.CentimetersToPoints(0.1): .MarginRight = Application.CentimetersToPoints(0.1): .MarginTop = 0: .MarginBottom = 0   ' 좌·우 0.1cm (owner 2026-06-10)
        .TextRange.Text = " " & vbCr & " " & vbCr & " "      ' 빈 3줄 placeholder
        .TextRange.Font.Name = CALLOUT_FONT_NAME
        .TextRange.Font.Size = 6                             ' 주간·야간 글자 크기 (owner 요구)
        .TextRange.Font.Bold = True
        .TextRange.Font.Fill.ForeColor.RGB = FAC_STATUS_TEXT_DEFAULT
        .TextRange.ParagraphFormat.Alignment = 2
    End With
    box.AlternativeText = "day=;night="
    On Error GoTo 0
StErr:
End Sub

' 상태 박스의 AlternativeText 에 "day=N;night=M" 파싱
Public Sub 상태박스_값_읽기(ws As Worksheet, facId As String, ByRef dayV As String, ByRef nightV As String)
    dayV = "": nightV = ""
    Dim box As Shape
    On Error Resume Next
    Set box = ws.Shapes(PREFIX_FAC_STATUS & facId)
    On Error GoTo 0
    If box Is Nothing Then Exit Sub
    Dim s As String
    On Error Resume Next
    s = box.AlternativeText
    On Error GoTo 0
    Dim parts() As String: parts = Split(s, ";")
    Dim i As Long, kv() As String
    For i = LBound(parts) To UBound(parts)
        kv = Split(parts(i), "=")
        If UBound(kv) >= 1 Then
            Select Case Trim(kv(0))
                Case "day": dayV = Trim(kv(1))
                Case "night": nightV = Trim(kv(1))
            End Select
        End If
    Next i
End Sub

' owner 2026-06-07 (8-66): 임의 facId 가 RN 종류인지 — 메타시트 kind 컬럼 + 라벨/콜아웃 텍스트 fallback.
'   선번연결_도구_isRN (g_pt_facId 전용) 의 파라미터 버전. 상태박스 라벨 분기·기타 시설물 분류용.
Public Function 시설물_isRN(ws As Worksheet, facId As String) As Boolean
    시설물_isRN = False
    If Len(facId) = 0 Then Exit Function

    ' 1) 메타시트 kind 컬럼
    Dim row As Variant
    On Error Resume Next
    row = MetaFindRow(SHEET_META_FAC, 1, facId)
    On Error GoTo 0
    If Not IsEmpty(row) Then
        If UBound(row) >= 2 Then
            If LCase(CStr(row(2))) = "rn" Then 시설물_isRN = True: Exit Function
        End If
        ' label (row(3)) 에 "RN" 포함 fallback
        If UBound(row) >= 3 Then
            If InStr(UCase(CStr(row(3))), "RN") > 0 Then 시설물_isRN = True: Exit Function
        End If
    End If

    ' 2) 시설물 콜아웃 박스 (lbl_<facId>) 텍스트 fallback
    If ws Is Nothing Then Exit Function
    Dim lblShp As Shape: Set lblShp = Nothing
    On Error Resume Next
    Set lblShp = ws.Shapes(PREFIX_LABEL & facId)
    On Error GoTo 0
    If Not lblShp Is Nothing Then
        Dim lblTxt As String: lblTxt = ""
        On Error Resume Next
        lblTxt = lblShp.TextFrame2.TextRange.Text
        On Error GoTo 0
        If InStr(UCase(lblTxt), "RN") > 0 Then 시설물_isRN = True
    End If
End Function

' 상태 박스 값 저장 + 텍스트 + 줄별 폰트·색상 갱신
'   주간만/야간만 = 2줄 / 둘 다 = 3줄. AutoSize 가 줄 수 따라 박스 자동.
'   각 Paragraphs 마다 명시적으로 Font.Name·Size·Bold 재설정 (전체 .Font 만 설정하면 LG스마트체가
'   일부 줄에 적용 안 되는 환경 버그 우회)
Public Sub 상태박스_값_쓰기(ws As Worksheet, facId As String, dayV As String, nightV As String)
    Dim box As Shape
    On Error Resume Next
    Set box = ws.Shapes(PREFIX_FAC_STATUS & facId)
    On Error GoTo 0
    If box Is Nothing Then Exit Sub

    box.AlternativeText = "day=" & dayV & ";night=" & nightV

    Dim hasDay As Boolean: hasDay = (Len(dayV) > 0)
    ' owner 2026-06-07 (8-48): 주간 값이 「0」 인 경우도 공란과 동일하게 줄 숨김.
    '   alt 데이터 (day=0) 는 그대로 보존 — 표시만 숨김. 「함체:주간」/「주간:0」 두 줄이 정보 없이 자리만 차지하던 문제 해결.
    If hasDay Then
        If Trim(dayV) = "0" Then hasDay = False
    End If
    Dim hasNight As Boolean: hasNight = (Len(nightV) > 0)

    ' owner 2026-06-07 (8-66): RN 시설물이면 라벨 prefix 「RN:」, 그 외는 기존 「함체:」 유지.
    Dim prefix As String: prefix = "함체"
    If 시설물_isRN(ws, facId) Then prefix = "RN"

    ' 줄 + 색 배열 동적 구성 (1줄/2줄/3줄)
    Dim lines(1 To 3) As String, colors(1 To 3) As Long, n As Long: n = 0
    If hasNight And hasDay Then
        n = 3
        lines(1) = prefix & ":야간": colors(1) = FAC_STATUS_TEXT_BLUE
        lines(2) = "주간:" & dayV: colors(2) = FAC_STATUS_TEXT_DEFAULT
        lines(3) = "야간:" & nightV: colors(3) = FAC_STATUS_TEXT_BLUE
    ElseIf hasNight Then
        n = 2
        lines(1) = prefix & ":야간": colors(1) = FAC_STATUS_TEXT_BLUE
        lines(2) = "야간:" & nightV: colors(2) = FAC_STATUS_TEXT_BLUE
    ElseIf hasDay Then
        n = 2
        lines(1) = prefix & ":주간": colors(1) = FAC_STATUS_TEXT_DEFAULT
        lines(2) = "주간:" & dayV: colors(2) = FAC_STATUS_TEXT_DEFAULT
    Else
        n = 1
        lines(1) = " ": colors(1) = FAC_STATUS_TEXT_DEFAULT
    End If

    Dim fullText As String, i As Long
    For i = 1 To n
        If i > 1 Then fullText = fullText & vbCr
        fullText = fullText & lines(i)
    Next i

    On Error Resume Next
    box.TextFrame2.TextRange.Text = fullText
    On Error GoTo 0

    ' 줄별 폰트·색상 명시 적용 (LG스마트체 줄별 누락 우회) + 박스 좌·우 여백 0.1 강제 (owner 요구, 값 갱신 시도 마다 보장)
    On Error Resume Next
    With box.TextFrame2
        .MarginLeft = Application.CentimetersToPoints(0.1): .MarginRight = Application.CentimetersToPoints(0.1): .MarginTop = 0: .MarginBottom = 0   ' 좌·우 0.1cm (owner 2026-06-10)
    End With
    On Error GoTo 0
    For i = 1 To n
        On Error Resume Next
        With box.TextFrame2.TextRange.Paragraphs(i).Font
            .Name = CALLOUT_FONT_NAME
            .Size = 6                                ' 주간·야간 글자 크기 (owner 요구)
            .Bold = True
            .Fill.ForeColor.RGB = colors(i)
        End With
        On Error GoTo 0
    Next i

    ' owner 2026-06-07 (8-67): AutoSize 재적용 — 텍스트 길이 바뀐 박스 (RN ↔ 함체 prefix 전환·줄 수 변동) 가
    '   옛 크기 그대로 남아 글자 잘리는 문제 fix. AddFacilityStatusBox·시설물_상태박스_주간_자동갱신 의 동일 패턴.
    On Error Resume Next
    With box.TextFrame2
        .WordWrap = msoFalse
        .AutoSize = msoAutoSizeShapeToFitText
    End With
    On Error GoTo 0
End Sub

' owner 2026-06-06 (8-30) / 2026-06-07 (8-65): 시설물에 연결된 코어 수 합계.
'   각 anchor (alt 에 box1=|box2= 있는 PAIRARROW) 마다 케이블 측 박스의 텍스트 파싱 → 코어수 가산.
'   같은 facId 의 모든 페어 across 모든 cable·RN·시설물 페어 (cascade 포함) 합산.
'   (8-65) 변경: 접속함체(cable-cable) 외 RN·기타 시설물(cable-facility) 페어도 포함.
'                케이블 측 박스 (cbl != fac_prefix) 의 코어수 사용. 양쪽 모두 facility 측인
'                페어 (RN-IN ↔ RN-OUT 내부 매핑 등) 는 코어 번호가 없어 자동 skip.
Public Function 시설물_연결코어수_계산(ws As Worksheet, facId As String) As Long
    시설물_연결코어수_계산 = 0
    If ws Is Nothing Or Len(facId) = 0 Then Exit Function
    Dim total As Long: total = 0
    Dim facTag As String: facTag = "fac=" & facId
    Dim sh As Shape, alt As String
    For Each sh In ws.Shapes
        If Left(sh.Name, Len(PREFIX_PAIRARROW)) = PREFIX_PAIRARROW Then
            alt = "": On Error Resume Next: alt = sh.AlternativeText: On Error GoTo 0
            If InStr(alt, "box1=") > 0 And InStr(alt, "box2=") > 0 Then
                Dim b1Nm As String, b2Nm As String
                b1Nm = AltParseField(alt, "box1=")
                b2Nm = AltParseField(alt, "box2=")
                If Len(b1Nm) > 0 And Len(b2Nm) > 0 Then
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
                        ' 해당 facility 의 박스만
                        If InStr(b1A, facTag) > 0 And InStr(b2A, facTag) > 0 Then
                            ' owner 2026-06-07 (8-65): 케이블 측 박스 식별 (cbl != fac_prefix).
                            '   - cable-cable: 양쪽 모두 케이블 → box1 사용 (box2 도 동일 코어수)
                            '   - cable-RN/시설물: 한쪽만 케이블 → 그 박스 사용
                            '   - facility-facility 내부 매핑: 양쪽 모두 facility → 케이블 없음, skip
                            Dim c1Tag As String, c2Tag As String
                            c1Tag = AltParseField(b1A, "cbl=")
                            c2Tag = AltParseField(b2A, "cbl=")
                            Dim b1IsCable As Boolean
                            Dim b2IsCable As Boolean
                            b1IsCable = (Len(c1Tag) > 0 And Left(c1Tag, Len(PREFIX_FAC)) <> PREFIX_FAC)
                            b2IsCable = (Len(c2Tag) > 0 And Left(c2Tag, Len(PREFIX_FAC)) <> PREFIX_FAC)
                            Dim cableBox As Shape: Set cableBox = Nothing
                            If b1IsCable Then
                                Set cableBox = b1S
                            ElseIf b2IsCable Then
                                Set cableBox = b2S
                            End If
                            If Not cableBox Is Nothing Then
                                Dim txt1 As String: txt1 = ""
                                On Error Resume Next: txt1 = cableBox.TextFrame2.TextRange.Text: On Error GoTo 0
                                Dim nums As Variant: nums = Empty
                                선번_파싱 txt1, nums
                                If IsArray(nums) Then
                                    total = total + (UBound(nums) - LBound(nums) + 1)
                                End If
                            End If
                        End If
                    End If
                End If
            End If
        End If
    Next sh
    시설물_연결코어수_계산 = total
End Function

' owner 2026-06-06 (8-30): 코어연결 완료 시 자동 호출 — 주간 박스에 (총 연결코어수 - 야간) 자동 입력.
'   주간 = 총 연결코어수 - 야간 (야간은 사용자 입력값 유지)
'   야간 = 사용자 입력값 그대로 (자동 갱신 X)
'   총 연결코어수 = 시설물_연결코어수_계산 (cable-cable 합계, 매번 재계산)
'   상태 박스 없으면 자동 생성.
'   2026-06-06 후속 (8-31): sheet protection 해제 후 호출 — AutoSize 가 protection 으로 막히지 않게 (수동 InputBox 패턴과 동일).
'                            상태박스 AutoSize 재적용 명시 — 옛 박스 (AutoSize=None 으로 저장된) 도 자동 크기 복구.
Public Sub 시설물_상태박스_주간_자동갱신(ws As Worksheet, facId As String)
    If ws Is Nothing Or Len(facId) = 0 Then Exit Sub
    Dim totalCores As Long: totalCores = 시설물_연결코어수_계산(ws, facId)

    ' Sheet protection 해제 (있으면) — 수동 InputBox 흐름과 동일 패턴
    Dim wasProt As Boolean: wasProt = ws.ProtectContents Or ws.ProtectDrawingObjects
    On Error Resume Next
    ws.Unprotect
    On Error GoTo 0

    ' 상태 박스 확보
    AddFacilityStatusBox ws, facId

    ' 현재 야간 값 읽기
    Dim curDay As String, curNight As String
    상태박스_값_읽기 ws, facId, curDay, curNight

    ' 주간 = 총 - 야간 (야간 숫자 아니면 0 으로 간주)
    Dim nightN As Long: nightN = 0
    If Len(curNight) > 0 And IsNumeric(curNight) Then nightN = CLng(curNight)
    Dim dayN As Long: dayN = totalCores - nightN
    If dayN < 0 Then dayN = 0

    Dim newDay As String
    If totalCores > 0 Or nightN > 0 Then
        newDay = CStr(dayN)
    Else
        newDay = ""    ' 연결도 없고 야간도 없으면 비움
    End If

    상태박스_값_쓰기 ws, facId, newDay, curNight

    ' AutoSize 재적용 — 텍스트 갱신 후 박스 크기 자동 조정 보장.
    '   옛 박스가 AutoSize=msoAutoSizeNone 상태로 저장되어 있으면 크기 안 변하는 문제 fix.
    Dim sBox As Shape: Set sBox = Nothing
    On Error Resume Next: Set sBox = ws.Shapes(PREFIX_FAC_STATUS & facId): On Error GoTo 0
    If Not sBox Is Nothing Then
        On Error Resume Next
        With sBox.TextFrame2
            .WordWrap = msoFalse
            .AutoSize = msoAutoSizeShapeToFitText
        End With
        On Error GoTo 0
    End If

    시설물_태그_위치_동기화 ws, facId

    ' Sheet protection 원복
    If wasProt Then ApplySheetProtection ws
End Sub

' 시설물의 배지·상태박스·콤보를 callout 기준 레이아웃에 맞춰 재정렬.
'   레이아웃:
'     [콤보 ▼]
'     [배지(왼쪽) | 상태박스(오른쪽)]
'     [callout (하단)]
'   facId 비우면 시트 전체 시설물 처리.
Public Sub 시설물_태그_위치_동기화(ws As Worksheet, Optional facId As String = "")
    Dim ids As Collection: Set ids = New Collection
    If Len(facId) > 0 Then
        ids.Add facId
    Else
        Dim shf As Shape
        For Each shf In ws.Shapes
            If Left(shf.Name, Len(PREFIX_FAC)) = PREFIX_FAC Then ids.Add shf.Name
        Next shf
    End If

    Dim k As Long, id As String, callout As Shape
    Dim badge As Shape, statusBox As Shape, cb As Shape
    For k = 1 To ids.Count
        id = ids(k)
        Set callout = Nothing
        On Error Resume Next
        Set callout = ws.Shapes(PREFIX_LABEL & id)
        On Error GoTo 0
        If callout Is Nothing Then GoTo NextId

        Set badge = Nothing: Set statusBox = Nothing: Set cb = Nothing
        On Error Resume Next
        Set badge = ws.Shapes(PREFIX_BADGE & id)
        Set statusBox = ws.Shapes(PREFIX_FAC_STATUS & id)
        Set cb = ws.Shapes(PREFIX_FAC_TAG_DD & id)
        On Error GoTo 0

        ' owner 요구 — 시설물 이동 시 callout(+badge/statusBox/콤보) 도 같은 delta 만큼 자동 이동.
        '   alt 에 "_lpos=X,Y" 저장. 매 셀 클릭 시 시설물 현재 위치 vs alt 비교 → delta 적용.
        '   사용자가 callout 만 이동했으면 다음 시설물 이동에서도 그 새 상대 위치 유지.
        Dim facShp As Shape: Set facShp = Nothing
        On Error Resume Next
        Set facShp = ws.Shapes(id)
        On Error GoTo 0
        If Not facShp Is Nothing Then
            Dim facAlt As String: facAlt = ""
            On Error Resume Next: facAlt = facShp.AlternativeText: On Error GoTo 0
            Dim pLpos As Long: pLpos = InStr(facAlt, "_lpos=")
            If pLpos > 0 Then
                Dim lposEnd As Long: lposEnd = InStr(pLpos, facAlt, "|")
                If lposEnd = 0 Then lposEnd = Len(facAlt) + 1
                Dim lposVal As String: lposVal = Mid(facAlt, pLpos + 6, lposEnd - (pLpos + 6))
                Dim commaP As Long: commaP = InStr(lposVal, ",")
                If commaP > 0 Then
                    Dim lastFX As Double, lastFY As Double
                    lastFX = CDbl(Left(lposVal, commaP - 1))
                    lastFY = CDbl(Mid(lposVal, commaP + 1))
                    Dim dx As Double: dx = facShp.Left - lastFX
                    Dim dy As Double: dy = facShp.Top - lastFY
                    If Abs(dx) > 0.5 Or Abs(dy) > 0.5 Then
                        On Error Resume Next
                        callout.Left = callout.Left + dx
                        callout.Top = callout.Top + dy
                        If Not badge Is Nothing Then badge.Left = badge.Left + dx: badge.Top = badge.Top + dy
                        If Not statusBox Is Nothing Then statusBox.Left = statusBox.Left + dx: statusBox.Top = statusBox.Top + dy
                        If Not cb Is Nothing Then cb.Left = cb.Left + dx: cb.Top = cb.Top + dy
                        On Error GoTo 0
                    End If
                End If
            End If
            ' 현재 위치 저장 (_lpos= 만 갱신, 나머지 alt 보존)
            Dim newAlt As String
            If pLpos > 0 Then
                Dim p2 As Long: p2 = InStr(pLpos, facAlt, "|")
                If p2 = 0 Then
                    newAlt = Left(facAlt, pLpos - 1) & "_lpos=" & facShp.Left & "," & facShp.Top
                Else
                    newAlt = Left(facAlt, pLpos - 1) & "_lpos=" & facShp.Left & "," & facShp.Top & Mid(facAlt, p2)
                End If
                ' 앞이 "|" 로 끝나면 그대로, 아니면 정리 (간단화)
                If Right(newAlt, 1) = "|" Then newAlt = Left(newAlt, Len(newAlt) - 1)
            Else
                If Len(facAlt) > 0 Then
                    newAlt = facAlt & "|_lpos=" & facShp.Left & "," & facShp.Top
                Else
                    newAlt = "_lpos=" & facShp.Left & "," & facShp.Top
                End If
            End If
            On Error Resume Next
            facShp.AlternativeText = newAlt
            On Error GoTo 0
        End If

        ' 배지 크기 = 상태박스 높이 × 정사각형 (owner: 2줄·3줄 따라 배지도 같은 크기)
        If Not badge Is Nothing And Not statusBox Is Nothing Then
            On Error Resume Next
            badge.Height = statusBox.Height
            badge.Width = statusBox.Height
            On Error GoTo 0
        End If

        ' 상단 줄 높이 = max(배지 높이, 상태박스 높이)
        Dim topRowH As Double: topRowH = 0
        If Not badge Is Nothing Then If badge.Height > topRowH Then topRowH = badge.Height
        If Not statusBox Is Nothing Then If statusBox.Height > topRowH Then topRowH = statusBox.Height

        ' callout 바로 위 = 상단 줄
        Dim topRowY As Double: topRowY = callout.Top - topRowH - FAC_TAG_GAP

        If Not badge Is Nothing Then
            On Error Resume Next
            badge.Left = callout.Left
            badge.Top = topRowY + (topRowH - badge.Height) / 2
            badge.ZOrder msoBringToFront
            On Error GoTo 0
        End If
        If Not statusBox Is Nothing Then
            On Error Resume Next
            Dim sbLeft As Double: sbLeft = callout.Left
            If Not badge Is Nothing Then sbLeft = callout.Left + badge.Width + FAC_TAG_GAP
            statusBox.Left = sbLeft
            statusBox.Top = topRowY + (topRowH - statusBox.Height) / 2
            statusBox.ZOrder msoBringToFront
            On Error GoTo 0
        End If

        ' 콤보 = 상단 줄 위
        If Not cb Is Nothing Then
            On Error Resume Next
            cb.Left = callout.Left
            cb.Top = topRowY - FAC_TAG_DD_H - FAC_TAG_GAP
            cb.ZOrder msoBringToFront
            On Error GoTo 0
        End If
NextId:
    Next k
End Sub

' 네트웍구성도 케이블 callout 박스를 한 줄(선로ID) 로 일괄 정리.
'   - 이미 1줄이면 손대지 않음
'   - 2줄 이상이면 첫 줄만 남김 (사용자가 수정한 첫 줄 = 선로ID 보존)
'   - 텍스트가 「ID/...」 옛 템플릿 패턴이거나 빈 칸이면 「선로ID」 로 대체
Public Sub 네트웍_케이블박스_한줄변환()
    Dim wsNw As Worksheet
    On Error Resume Next
    Set wsNw = ThisWorkbook.Worksheets(SHEET_NETWORK)
    On Error GoTo 0
    If wsNw Is Nothing Then Exit Sub

    Dim wasProt As Boolean: wasProt = wsNw.ProtectContents Or wsNw.ProtectDrawingObjects
    On Error Resume Next
    wsNw.Unprotect
    On Error GoTo 0

    Dim sh As Shape, cnt As Long, n As String, oldText As String, firstLine As String, restLine As String
    For Each sh In wsNw.Shapes
        n = sh.Name
        If Len(n) >= Len(PREFIX_LABEL) + Len(PREFIX_CBL) Then
            If Left(n, Len(PREFIX_LABEL)) = PREFIX_LABEL And _
               Mid(n, Len(PREFIX_LABEL) + 1, Len(PREFIX_CBL)) = PREFIX_CBL Then
                oldText = ""
                On Error Resume Next
                oldText = sh.TextFrame2.TextRange.Text
                On Error GoTo 0
                SplitFirstLine oldText, firstLine, restLine
                Dim firstTrim As String: firstTrim = Trim(firstLine)
                Dim newText As String
                ' 빈 칸 / 옛 「ID/...」 템플릿이면 「선로ID」, 사용자 수정값이면 그대로 1줄
                If Len(firstTrim) = 0 Or firstTrim Like "ID/*" Or firstTrim = "ID" Then
                    newText = "선로ID"
                Else
                    newText = firstTrim
                End If
                If newText <> oldText Then
                    On Error Resume Next
                    sh.TextFrame2.TextRange.Text = newText
                    On Error GoTo 0
                    cnt = cnt + 1
                End If
            End If
        End If
    Next sh

    If wasProt Then ApplySheetProtection wsNw
    Application.StatusBar = "케이블 박스 한 줄 변환: " & cnt & " 개"
    MsgBox cnt & " 개 케이블 박스를 한 줄(선로ID) 로 정리했습니다." & vbLf & vbLf & _
           "• 빈 칸 또는 옛 「ID/규격」 템플릿은 「선로ID」 로 대체" & vbLf & _
           "• 사용자가 수정한 선로ID 는 그대로 보존 (첫 줄만 남김)", _
           vbInformation, "케이블 박스 정리"
End Sub

' ============================================================================
'  네트웍구성도 케이블 박스 「일괄 스타일」 — 사용자가 박스 1개를 기준으로 편집한 뒤
'    그 박스 선택 상태에서 매크로 호출 → 네트웍구성도의 모든 케이블 박스에 크기·폰트·색 복제.
'    호출 방법:
'      ① 네트웍구성도에서 박스 선택 → Ctrl+Shift+B (행정도_초기화 가 단축키 등록)
'      ② 또는 Alt+F8 → 케이블박스_일괄적용
'      ③ 행정도 패널 「박스 통일」 버튼은 안내 + 네트웍 자동 활성화 (사용자가 거기서 ① 또는 ② 진행)
' ============================================================================
Public Sub 케이블박스_일괄적용()
    Dim wsNw As Worksheet
    On Error Resume Next
    Set wsNw = ThisWorkbook.Worksheets(SHEET_NETWORK)
    On Error GoTo 0
    If wsNw Is Nothing Then Exit Sub

    ' 기준 박스: ActiveSheet 가 네트웍 + Selection 이 케이블 박스이면 그것 사용
    Dim refBox As Shape: Set refBox = Nothing
    If ActiveSheet.Name = SHEET_NETWORK Then
        On Error Resume Next
        Dim sel As Object: Set sel = Application.Selection
        If Not sel Is Nothing Then
            If TypeName(sel) <> "Range" Then
                Dim selName As String: selName = ""
                selName = sel.Name
                If Len(selName) >= Len(PREFIX_LABEL) + Len(PREFIX_CBL) Then
                    If Left(selName, Len(PREFIX_LABEL)) = PREFIX_LABEL And _
                       Mid(selName, Len(PREFIX_LABEL) + 1, Len(PREFIX_CBL)) = PREFIX_CBL Then
                        Set refBox = wsNw.Shapes(selName)
                    End If
                End If
            End If
        End If
        On Error GoTo 0
    End If

    ' 기준 박스 없으면 안내 + 네트웍 자동 활성화
    If refBox Is Nothing Then
        On Error Resume Next
        wsNw.Activate
        On Error GoTo 0
        MsgBox "네트웍구성도의 케이블 텍스트박스를 「기준」 으로 정해 모든 박스에 일괄 적용합니다." & vbLf & vbLf & _
               "사용 흐름:" & vbLf & _
               "  ① 네트웍구성도에서 케이블 텍스트박스 1개 클릭(선택)" & vbLf & _
               "  ② 그 박스의 크기·폰트·글자 크기를 자유롭게 편집" & vbLf & _
               "  ③ 박스 선택된 상태에서 다음 중 하나 실행:" & vbLf & _
               "       •  Ctrl + Shift + B  (단축키)" & vbLf & _
               "       •  Alt + F8 → 「케이블박스_일괄적용」" & vbLf & vbLf & _
               "기준 박스의 크기·폰트·색·여백이 네트웍구성도 전체 케이블 박스에 일괄 적용됩니다.", _
               vbInformation, "박스 통일"
        Exit Sub
    End If

    ' 기준 박스의 스타일 캡처
    Dim refW As Double: refW = refBox.Width
    Dim refH As Double: refH = refBox.Height
    Dim refAuto As Long: refAuto = msoAutoSizeNone
    Dim refFontName As String, refFontSize As Single, refFontBold As Long
    Dim refColor As Long, refLineColor As Long, refLineWeight As Single
    Dim refAlign As Long, refAnchor As Long
    Dim refML As Single, refMR As Single, refMT As Single, refMB As Single
    Dim refTextColor As Long
    On Error Resume Next
    refAuto = refBox.TextFrame2.AutoSize
    refFontName = refBox.TextFrame2.TextRange.Font.Name
    refFontSize = refBox.TextFrame2.TextRange.Font.Size
    refFontBold = refBox.TextFrame2.TextRange.Font.Bold
    refColor = refBox.Fill.ForeColor.RGB
    refLineColor = refBox.Line.ForeColor.RGB
    refLineWeight = refBox.Line.Weight
    refAlign = refBox.TextFrame2.TextRange.ParagraphFormat.Alignment
    refAnchor = refBox.TextFrame2.VerticalAnchor
    refML = refBox.TextFrame2.MarginLeft
    refMR = refBox.TextFrame2.MarginRight
    refMT = refBox.TextFrame2.MarginTop
    refMB = refBox.TextFrame2.MarginBottom
    refTextColor = refBox.TextFrame2.TextRange.Font.Fill.ForeColor.RGB
    On Error GoTo 0

    Dim wasProt As Boolean: wasProt = wsNw.ProtectContents Or wsNw.ProtectDrawingObjects
    On Error Resume Next
    wsNw.Unprotect
    On Error GoTo 0

    Dim sh As Shape, cnt As Long: cnt = 0
    For Each sh In wsNw.Shapes
        Dim n As String: n = sh.Name
        If n <> refBox.Name And Len(n) >= Len(PREFIX_LABEL) + Len(PREFIX_CBL) Then
            If Left(n, Len(PREFIX_LABEL)) = PREFIX_LABEL And _
               Mid(n, Len(PREFIX_LABEL) + 1, Len(PREFIX_CBL)) = PREFIX_CBL Then
                On Error Resume Next
                ' AutoSize 가 ToFitText 면 글자에 맞춰 자동, None 이면 명시적 크기 적용
                sh.TextFrame2.AutoSize = refAuto
                If refAuto = msoAutoSizeNone Then
                    sh.Width = refW
                    sh.Height = refH
                End If
                sh.Fill.ForeColor.RGB = refColor
                sh.Line.ForeColor.RGB = refLineColor
                sh.Line.Weight = refLineWeight
                sh.TextFrame2.TextRange.Font.Name = refFontName
                sh.TextFrame2.TextRange.Font.Size = refFontSize
                sh.TextFrame2.TextRange.Font.Bold = refFontBold
                sh.TextFrame2.TextRange.Font.Fill.ForeColor.RGB = refTextColor
                sh.TextFrame2.TextRange.ParagraphFormat.Alignment = refAlign
                sh.TextFrame2.VerticalAnchor = refAnchor
                sh.TextFrame2.MarginLeft = refML
                sh.TextFrame2.MarginRight = refMR
                sh.TextFrame2.MarginTop = refMT
                sh.TextFrame2.MarginBottom = refMB
                On Error GoTo 0
                cnt = cnt + 1
            End If
        End If
    Next sh

    ' 크기 변경 후 박스를 케이블 중심으로 재정렬 (검증된 동기화 재사용)
    네트웍_케이블박스_동기화 wsNw
    If wasProt Then ApplySheetProtection wsNw

    Application.StatusBar = "케이블 박스 통일: " & cnt & " 개 일괄 적용."
    MsgBox cnt & " 개 케이블 박스에 일괄 적용 완료." & vbLf & vbLf & _
           "기준 박스: " & refBox.Name & vbLf & _
           "크기 " & Format(refW, "0") & " × " & Format(refH, "0") & " pt · " & _
           "폰트 " & refFontName & " " & Format(refFontSize, "0.#") & "pt", _
           vbInformation, "박스 통일"
End Sub

' 범례 라벨에 「신설」 이 포함되어 있는지. 시설물·케이블 callout 색 분기에 사용.
Public Function IsNewLegendLabel(legendLabel As String) As Boolean
    If Len(legendLabel) = 0 Then Exit Function
    IsNewLegendLabel = (InStr(legendLabel, "신설") > 0)
End Function

' 설명선 박스 「일괄 스타일 적용」 — 기준 박스 1개 선택 후 같은 종류 모든 박스에 복제.
'   사용 흐름: 행정도 또는 네트웍구성도에서 설명선 박스 1개 선택 → 크기·폰트·색 자유 편집
'             → 단축키 Ctrl+Shift+L 또는 패널 「설명선 통일」 버튼
'   자동 분기:
'     - 시설물 callout (`lbl_fac_`) → 양 시트(행정도+네트웍) 모든 시설물 callout
'     - 케이블 callout (`lbl_cbl_`) → ActiveSheet 의 모든 케이블 callout (행정도 말풍선·네트웍 박스 디자인 분리)
Public Sub 설명선_일괄적용()
    Dim ws As Worksheet: Set ws = ActiveSheet
    If ws.Name <> SHEET_ADMIN And ws.Name <> SHEET_NETWORK Then
        MsgBox "행정도 또는 네트웍구성도에서 실행하세요.", vbExclamation
        Exit Sub
    End If

    ' 기준 박스 (Selection)
    Dim refBox As Shape: Set refBox = Nothing
    On Error Resume Next
    Dim sel As Object: Set sel = Application.Selection
    On Error GoTo 0
    If sel Is Nothing Then GoTo NoSel
    If TypeName(sel) = "Range" Then GoTo NoSel
    Dim selName As String: selName = ""
    On Error Resume Next
    selName = sel.Name
    On Error GoTo 0
    If Len(selName) = 0 Then GoTo NoSel
    On Error Resume Next
    Set refBox = ws.Shapes(selName)
    On Error GoTo 0
    If refBox Is Nothing Then GoTo NoSel

    Dim cnt As Long, scope As String

    ' prefix 분기 — 모두 「선택한 시트 안에서만」 일괄 적용 (행정도·네트웍 속성 별개 유지)
    If Left(selName, Len(PREFIX_BADGE)) = PREFIX_BADGE Then
        cnt = 설명선_스타일_복제(refBox, ws, PREFIX_BADGE)
        scope = "배지 (" & ws.Name & ")"
    ElseIf Left(selName, Len(PREFIX_FAC_STATUS)) = PREFIX_FAC_STATUS Then
        cnt = 설명선_스타일_복제(refBox, ws, PREFIX_FAC_STATUS)
        scope = "주간·야간 박스 (" & ws.Name & ")"
    ElseIf Left(selName, Len(PREFIX_LABEL)) = PREFIX_LABEL Then
        Dim subId As String: subId = Mid(selName, Len(PREFIX_LABEL) + 1)
        Dim isCable As Boolean, isFac As Boolean
        isCable = (Len(subId) >= Len(PREFIX_CBL) And Left(subId, Len(PREFIX_CBL)) = PREFIX_CBL)
        isFac = (Len(subId) >= Len(PREFIX_FAC) And Left(subId, Len(PREFIX_FAC)) = PREFIX_FAC)
        If isFac Then
            cnt = 설명선_스타일_복제(refBox, ws, PREFIX_LABEL & PREFIX_FAC)
            scope = "시설물 설명선 (" & ws.Name & ")"
        ElseIf isCable Then
            cnt = 설명선_스타일_복제(refBox, ws, PREFIX_LABEL & PREFIX_CBL)
            scope = "케이블 설명선 (" & ws.Name & ")"
        Else
            GoTo NoSel
        End If
    Else
        GoTo NoSel
    End If

    Application.StatusBar = "설명선 통일 — " & cnt & " 개 적용 (" & scope & ")"
    MsgBox cnt & " 개 설명선에 일괄 적용 완료." & vbLf & vbLf & _
           "기준 박스: " & selName & vbLf & _
           "범위: " & scope, _
           vbInformation, "설명선 통일"
    Exit Sub

NoSel:
    MsgBox "기준 도형 1개를 선택한 뒤 실행하세요." & vbLf & vbLf & _
           "지원 종류 (모두 「현재 시트」 안에서만 일괄 적용 — 양 시트 별개):" & vbLf & _
           "  • 시설물 설명선 (lbl_fac_)" & vbLf & _
           "  • 케이블 설명선 (lbl_cbl_)" & vbLf & _
           "  • 배지 (badge_)" & vbLf & _
           "  • 주간·야간 박스 (_fac_status_)" & vbLf & vbLf & _
           "사용 흐름:" & vbLf & _
           "  ① 기준 도형 1개 클릭(선택)" & vbLf & _
           "  ② 크기·폰트·색·여백 자유 편집" & vbLf & _
           "  ③ Ctrl+Shift+L 또는 「설명선 통일」 클릭" & vbLf & vbLf & _
           "양 시트에 각각 통일하려면 시트마다 1번씩 실행하세요.", _
           vbInformation, "설명선 통일"
End Sub

' owner 2026-06-08 (8-104): 양 시트 모든 시설물 설명선 (lbl_fac_*) 좌우 여백 0.1cm 일괄 적용.
'   기존 설명선들의 마진 통일 (신규 callout 은 AddFacilityCallout 에서 이미 0.1cm 자동).
Public Sub 설명선_여백_적용()
    Dim wsAd As Worksheet, wsNw As Worksheet
    On Error Resume Next
    Set wsAd = ThisWorkbook.Worksheets(SHEET_ADMIN)
    Set wsNw = ThisWorkbook.Worksheets(SHEET_NETWORK)
    On Error GoTo 0

    Dim CALLOUT_LR_MARGIN_PT As Single
    CALLOUT_LR_MARGIN_PT = Application.CentimetersToPoints(0.1)

    Dim wsList(0 To 1) As Worksheet
    Set wsList(0) = wsAd: Set wsList(1) = wsNw
    Dim totalAd As Long: totalAd = 0
    Dim totalNw As Long: totalNw = 0
    Dim si As Long
    For si = 0 To 1
        Dim ws As Worksheet: Set ws = wsList(si)
        If Not ws Is Nothing Then
            Dim wasProt As Boolean: wasProt = ws.ProtectContents Or ws.ProtectDrawingObjects
            On Error Resume Next: ws.Unprotect: On Error GoTo 0

            Dim cnt As Long: cnt = 0
            Dim shp As Shape
            For Each shp In ws.Shapes
                Dim nm As String: nm = shp.Name
                ' lbl_fac_* 만 — lbl_cbl_* 케이블 설명선은 별개
                If Len(nm) > Len(PREFIX_LABEL) + Len(PREFIX_FAC) Then
                    If Left(nm, Len(PREFIX_LABEL)) = PREFIX_LABEL Then
                        If Mid(nm, Len(PREFIX_LABEL) + 1, Len(PREFIX_FAC)) = PREFIX_FAC Then
                            On Error Resume Next
                            shp.TextFrame2.MarginLeft = CALLOUT_LR_MARGIN_PT
                            shp.TextFrame2.MarginRight = CALLOUT_LR_MARGIN_PT
                            On Error GoTo 0
                            cnt = cnt + 1
                        End If
                    End If
                End If
            Next shp
            If si = 0 Then totalAd = cnt Else totalNw = cnt

            If wasProt Then ApplySheetProtection ws
        End If
    Next si

    Application.StatusBar = "시설물 설명선 좌우 여백 0.1cm 적용 — 행정도 " & totalAd & " 개, 네트웍 " & totalNw & " 개."
    MsgBox "양 시트 시설물 설명선에 좌우 여백 0.1cm 일괄 적용 완료." & vbLf & vbLf & _
           "  • 행정도: " & totalAd & " 개" & vbLf & _
           "  • 네트웍구성도: " & totalNw & " 개", _
           vbInformation, "설명선 여백"
End Sub

' 기준 박스 스펙을 targetWs 의 같은 prefix 도형들에 일괄 복제. 17 속성 (케이블박스_일괄적용 동일).
Public Function 설명선_스타일_복제(refBox As Shape, targetWs As Worksheet, prefix As String) As Long
    Dim cnt As Long: cnt = 0
    If targetWs Is Nothing Then Exit Function

    ' 스펙 캡처
    Dim refW As Double: refW = refBox.Width
    Dim refH As Double: refH = refBox.Height
    Dim refAuto As Long: refAuto = msoAutoSizeShapeToFitText
    Dim refFontName As String, refFontSize As Single, refFontBold As Long
    Dim refFill As Long, refLineCol As Long, refLineWt As Single
    Dim refAlign As Long, refAnchor As Long, refTextCol As Long
    Dim refML As Single, refMR As Single, refMT As Single, refMB As Single
    On Error Resume Next
    refAuto = refBox.TextFrame2.AutoSize
    refFontName = refBox.TextFrame2.TextRange.Font.Name
    refFontSize = refBox.TextFrame2.TextRange.Font.Size
    refFontBold = refBox.TextFrame2.TextRange.Font.Bold
    refFill = refBox.Fill.ForeColor.RGB
    refLineCol = refBox.Line.ForeColor.RGB
    refLineWt = refBox.Line.Weight
    refAlign = refBox.TextFrame2.TextRange.ParagraphFormat.Alignment
    refAnchor = refBox.TextFrame2.VerticalAnchor
    refML = refBox.TextFrame2.MarginLeft
    refMR = refBox.TextFrame2.MarginRight
    refMT = refBox.TextFrame2.MarginTop
    refMB = refBox.TextFrame2.MarginBottom
    refTextCol = refBox.TextFrame2.TextRange.Font.Fill.ForeColor.RGB
    On Error GoTo 0

    Dim wasProt As Boolean: wasProt = targetWs.ProtectContents Or targetWs.ProtectDrawingObjects
    On Error Resume Next
    targetWs.Unprotect
    On Error GoTo 0

    Dim sh As Shape
    For Each sh In targetWs.Shapes
        If sh.Name <> refBox.Name And Len(sh.Name) >= Len(prefix) Then
            If Left(sh.Name, Len(prefix)) = prefix Then
                On Error Resume Next
                sh.TextFrame2.AutoSize = refAuto
                If refAuto = msoAutoSizeNone Then
                    sh.Width = refW
                    sh.Height = refH
                End If
                sh.Fill.ForeColor.RGB = refFill
                sh.Line.ForeColor.RGB = refLineCol
                sh.Line.Weight = refLineWt
                sh.TextFrame2.TextRange.Font.Name = refFontName
                sh.TextFrame2.TextRange.Font.Size = refFontSize
                sh.TextFrame2.TextRange.Font.Bold = refFontBold
                sh.TextFrame2.TextRange.Font.Fill.ForeColor.RGB = refTextCol
                sh.TextFrame2.TextRange.ParagraphFormat.Alignment = refAlign
                sh.TextFrame2.VerticalAnchor = refAnchor
                sh.TextFrame2.MarginLeft = refML
                sh.TextFrame2.MarginRight = refMR
                sh.TextFrame2.MarginTop = refMT
                sh.TextFrame2.MarginBottom = refMB
                On Error GoTo 0
                cnt = cnt + 1
            End If
        End If
    Next sh

    If wasProt Then ApplySheetProtection targetWs
    설명선_스타일_복제 = cnt
End Function

' 시설물(facId) 에 이미 다른 케이블이 연결돼 있는지 — _케이블 메타에서 from_id/to_id 검색.
'   신규 케이블 추가 시 to 시설물 위치 보정 여부 결정 (이미 연결되어 있으면 보정 안 함).
Public Function HasCableConnected(facId As String, excludeCblId As String) As Boolean
    Dim wsCbl As Worksheet
    On Error Resume Next
    Set wsCbl = ThisWorkbook.Worksheets(SHEET_META_CBL)
    On Error GoTo 0
    If wsCbl Is Nothing Then Exit Function
    Dim last As Long: last = wsCbl.Cells(wsCbl.Rows.Count, 1).End(xlUp).Row
    Dim r As Long, idv As String, fr As String, tr As String
    For r = 2 To last
        idv = CStr(wsCbl.Cells(r, 1).Value)
        If idv <> excludeCblId Then
            fr = CStr(wsCbl.Cells(r, 2).Value)
            tr = CStr(wsCbl.Cells(r, 3).Value)
            If fr = facId Or tr = facId Then
                HasCableConnected = True: Exit Function
            End If
        End If
    Next r
End Function

' 네트웍구성도 격자 생성 — 도형 X, 「20·40·60... 행/열 셀 배경색」 만 노랑으로.
'   owner: 옛 「선 도형 weight 6」 방식은 두꺼운 막대로 보여 시각 부담 → 셀 Interior.Color 로 깔끔하게.
'   옛 격자 _grid_ prefix 도형도 모두 제거 (잔재 정리).
Public Sub 네트웍_격자_생성()
    Dim ws As Worksheet
    On Error Resume Next
    Set ws = ThisWorkbook.Worksheets(SHEET_NETWORK)
    On Error GoTo 0
    If ws Is Nothing Then Exit Sub

    Dim wasProt As Boolean: wasProt = ws.ProtectContents Or ws.ProtectDrawingObjects
    On Error Resume Next
    ws.Unprotect
    On Error GoTo 0

    ' 옛 격자 「도형」 (선 weight 6) 모두 제거 — 막대 잔재 정리
    Dim i As Long
    For i = ws.Shapes.Count To 1 Step -1
        On Error Resume Next
        If Left(ws.Shapes(i).Name, Len(GRID_PREFIX)) = GRID_PREFIX Then ws.Shapes(i).Delete
        On Error GoTo 0
    Next i

    ' owner 2026-06-07 (8-58): 격자 칸 수를 CustomDocumentProperty 에서 읽음 (없으면 기본 상수).
    Dim cellsX As Long: cellsX = 네트웍_격자_가로칸수()
    Dim cellsY As Long: cellsY = 네트웍_격자_세로칸수()

    ' owner 2026-06-10: 격자는 2행부터 (1행 = 검색바 NW_TOP_H). 격자 행 = 2,22,42,...
    Dim gridTop As Long: gridTop = LEGEND_ROWS + 1
    Dim totalCols As Long: totalCols = cellsX * 네트웍_격자_단위가로cells() + 1
    Dim gridRowsN As Long: gridRowsN = cellsY * 네트웍_격자_단위세로cells() + 1   ' 격자 행 수
    Dim bottomRow As Long: bottomRow = gridTop + gridRowsN - 1
    On Error Resume Next
    ws.Range(ws.Cells(gridTop, 1), ws.Cells(bottomRow, totalCols)).Interior.ColorIndex = xlNone
    On Error GoTo 0

    ' 행 높이 — 1행 = 검색바(NW_TOP_H), 격자 행(2~) = CELL_PT 균일
    On Error Resume Next
    ws.Rows(1).RowHeight = NW_TOP_H
    ws.Rows(gridTop & ":" & bottomRow).RowHeight = CELL_PT
    On Error GoTo 0

    ' 노랑 col — gridTop ~ bottomRow 범위 세로줄. col = K*units + 1
    Dim c As Long, colNo As Long
    For c = 0 To cellsX
        colNo = c * 네트웍_격자_단위가로cells() + 1
        If colNo >= 1 And colNo <= totalCols Then
            On Error Resume Next
            ws.Range(ws.Cells(gridTop, colNo), ws.Cells(bottomRow, colNo)).Interior.Color = GRID_LINE_COLOR
            On Error GoTo 0
        End If
    Next c

    ' 노랑 row — gridTop, gridTop+units, ... (2,22,42,...)
    Dim r As Long, rowNo As Long
    For r = 0 To cellsY
        rowNo = gridTop + r * 네트웍_격자_단위세로cells()
        If rowNo >= gridTop And rowNo <= bottomRow Then
            On Error Resume Next
            ws.Range(ws.Cells(rowNo, 1), ws.Cells(rowNo, totalCols)).Interior.Color = GRID_LINE_COLOR
            On Error GoTo 0
        End If
    Next r

    ' 검색 3버튼 (1행) — 격자 갱신마다 보장
    네트웍_검색버튼_생성 ws

    If wasProt Then ApplySheetProtection ws
    Application.StatusBar = "네트웍구성도 격자 채우기 완료 (" & cellsX & " x " & cellsY & " 칸, 2행부터 · 검색바 포함)."
End Sub

' owner 2026-06-07 (8-58): 격자 가로/세로 칸 수 — CustomDocumentProperty 에서 읽음.
'   기본값 = GRID_CELLS_X / GRID_CELLS_Y (상수). 사용자가 「격자 확장」 으로 늘리면 그 값 사용.
' owner 2026-06-08 (8-114): 가드 `>= GRID_CELLS_X` 해제 — 사용자 설정값이 1 이상이면 그대로 사용.
'   「작은 격자(4×4)」 / 「격자 확장」 모두 GRID_CELLS_X/Y 기본값 미만도 허용.
Public Function 네트웍_격자_가로칸수() As Long
    네트웍_격자_가로칸수 = GRID_CELLS_X
    On Error Resume Next
    Dim v As Variant: v = ThisWorkbook.CustomDocumentProperties("network_grid_cells_x").Value
    If IsNumeric(v) Then
        If CLng(v) >= 1 Then 네트웍_격자_가로칸수 = CLng(v)
    End If
    On Error GoTo 0
End Function

Public Function 네트웍_격자_세로칸수() As Long
    네트웍_격자_세로칸수 = GRID_CELLS_Y
    On Error Resume Next
    Dim v As Variant: v = ThisWorkbook.CustomDocumentProperties("network_grid_cells_y").Value
    If IsNumeric(v) Then
        If CLng(v) >= 1 Then 네트웍_격자_세로칸수 = CLng(v)
    End If
    On Error GoTo 0
End Function

' ===== owner 2026-06-08 (8-122): 한 격자 칸 안 Excel cell 수 — 동적 조정 =====
'   owner: 「격자 한 칸이 20×20 cell 로 너무 넓다, 4×4 cell 로 줄여서 작게 그리고 싶음」
'   기본값 = GRID_COLS_PER_CELL / GRID_ROWS_PER_CELL (20). CustomDocumentProperty 로 영구 저장.
'   작은 값 = 격자 한 칸 자체가 좁아짐 (전체 영역도 같이 축소).
Public Function 네트웍_격자_단위가로cells() As Long
    네트웍_격자_단위가로cells = GRID_COLS_PER_CELL
    On Error Resume Next
    Dim v As Variant: v = ThisWorkbook.CustomDocumentProperties("cells_per_grid_x").Value
    If IsNumeric(v) Then
        If CLng(v) >= 1 Then 네트웍_격자_단위가로cells = CLng(v)
    End If
    On Error GoTo 0
End Function

Public Function 네트웍_격자_단위세로cells() As Long
    네트웍_격자_단위세로cells = GRID_ROWS_PER_CELL
    On Error Resume Next
    Dim v As Variant: v = ThisWorkbook.CustomDocumentProperties("cells_per_grid_y").Value
    If IsNumeric(v) Then
        If CLng(v) >= 1 Then 네트웍_격자_단위세로cells = CLng(v)
    End If
    On Error GoTo 0
End Function

Public Sub 네트웍_격자_단위cells_저장(x As Long, y As Long)
    Dim props As DocumentProperties: Set props = ThisWorkbook.CustomDocumentProperties
    On Error Resume Next
    props("cells_per_grid_x").Value = x
    If Err.Number <> 0 Then
        Err.Clear
        props.Add Name:="cells_per_grid_x", LinkToContent:=False, Type:=msoPropertyTypeNumber, Value:=x
    End If
    Err.Clear
    props("cells_per_grid_y").Value = y
    If Err.Number <> 0 Then
        Err.Clear
        props.Add Name:="cells_per_grid_y", LinkToContent:=False, Type:=msoPropertyTypeNumber, Value:=y
    End If
    On Error GoTo 0
End Sub

Public Sub 네트웍_격자_칸수_저장(x As Long, y As Long)
    Dim props As DocumentProperties: Set props = ThisWorkbook.CustomDocumentProperties
    On Error Resume Next
    props("network_grid_cells_x").Value = x
    If Err.Number <> 0 Then
        Err.Clear
        props.Add Name:="network_grid_cells_x", LinkToContent:=False, Type:=msoPropertyTypeNumber, Value:=x
    End If
    Err.Clear
    props("network_grid_cells_y").Value = y
    If Err.Number <> 0 Then
        Err.Clear
        props.Add Name:="network_grid_cells_y", LinkToContent:=False, Type:=msoPropertyTypeNumber, Value:=y
    End If
    On Error GoTo 0
End Sub

' owner 2026-06-07 (8-58): 격자 확장 — 사용자 입력으로 가로/세로 칸 수 늘리기.
'   8-114: 최소값 가드 `>= GRID_CELLS_X/Y` 해제 → 1 이상 허용. 「작은 격자(4×4) 시작」 워크플로우 지원.
'   늘린 값은 CustomDocumentProperty 에 저장 → 파일 재오픈 후에도 유지.
'   확장 후 UniformCellSize 재호출로 새 행/열 셀 크기도 적용, 격자 재생성.
Public Sub 네트웍_격자_확장()
    Dim ws As Worksheet
    On Error Resume Next: Set ws = ThisWorkbook.Worksheets(SHEET_NETWORK): On Error GoTo 0
    If ws Is Nothing Then
        MsgBox "네트웍구성도 시트를 찾을 수 없습니다.", vbExclamation, "격자 확장"
        Exit Sub
    End If

    Dim curX As Long: curX = 네트웍_격자_가로칸수()
    Dim curY As Long: curY = 네트웍_격자_세로칸수()

    Dim sx As String
    sx = InputBox("가로 칸 수 (현재 " & curX & " 칸 = " & (curX * 네트웍_격자_단위가로cells()) & " 열, 최소 1)", _
                   "격자 확장 — 가로", CStr(curX))
    If Len(Trim(sx)) = 0 Then Exit Sub
    If Not IsNumeric(sx) Then
        MsgBox "숫자만 입력하세요.", vbExclamation, "격자 확장"
        Exit Sub
    End If
    Dim newX As Long: newX = CLng(sx)
    If newX < 1 Then
        MsgBox "가로 칸 수는 최소 1 이상이어야 합니다.", vbExclamation, "격자 확장"
        Exit Sub
    End If

    Dim sy As String
    sy = InputBox("세로 칸 수 (현재 " & curY & " 칸 = " & (curY * 네트웍_격자_단위세로cells()) & " 행, 최소 1)", _
                   "격자 확장 — 세로", CStr(curY))
    If Len(Trim(sy)) = 0 Then Exit Sub
    If Not IsNumeric(sy) Then
        MsgBox "숫자만 입력하세요.", vbExclamation, "격자 확장"
        Exit Sub
    End If
    Dim newY As Long: newY = CLng(sy)
    If newY < 1 Then
        MsgBox "세로 칸 수는 최소 1 이상이어야 합니다.", vbExclamation, "격자 확장"
        Exit Sub
    End If

    If newX = curX And newY = curY Then
        MsgBox "값 변경 없음.", vbInformation, "격자 확장"
        Exit Sub
    End If

    ' owner 2026-06-08 (8-114): 시설물이 새 격자 밖이면 차단 — 시설물 자동 이동은 위험.
    Dim maxCol As Long, maxRow As Long, facCnt As Long
    네트웍_시설물_최대셀좌표 ws, maxCol, maxRow, facCnt
    If facCnt > 0 Then
        If maxCol > newX Or maxRow > newY Then
            MsgBox "이미 배치된 시설물 (총 " & facCnt & "개) 중 일부가 새 격자 (" & newX & "×" & newY & ") 밖에 있습니다." & vbLf & vbLf & _
                   "가장 큰 셀 좌표: (가로 " & maxCol & ", 세로 " & maxRow & ")" & vbLf & vbLf & _
                   "더 큰 칸수를 입력하거나, 「격자 확장」 으로 시설물을 먼저 정리하세요.", _
                   vbExclamation, "격자 확장"
            Exit Sub
        End If
    End If

    네트웍_격자_칸수_저장 newX, newY

    ' 새 영역에도 균일 셀 크기 적용 (행정도 시트는 미영향 — 자체 UniformCellSize 호출과 무관)
    Dim newTotalCols As Long: newTotalCols = newX * 네트웍_격자_단위가로cells() + 1
    Dim newTotalRows As Long: newTotalRows = newY * 네트웍_격자_단위세로cells() + 1
    On Error Resume Next
    UniformCellSize ws, newTotalCols, newTotalRows
    On Error GoTo 0

    ' 격자 재생성
    네트웍_격자_생성

    MsgBox "격자 확장 완료." & vbLf & vbLf & _
           "  • 가로: " & curX & " → " & newX & " 칸 (" & newTotalCols & " 열)" & vbLf & _
           "  • 세로: " & curY & " → " & newY & " 칸 (" & newTotalRows & " 행)" & vbLf & vbLf & _
           "파일 저장 시 설정이 보존됩니다.", _
           vbInformation, "격자 확장"
End Sub

' owner 2026-06-08 (8-114): 네트웍구성도 시설물의 가장 큰 (col, row) 셀 좌표 + 개수.
'   격자 축소·교체 시 시설물이 격자 밖으로 밀려나는지 사전 검사용.
Public Sub 네트웍_시설물_최대셀좌표(ws As Worksheet, ByRef maxCol As Long, ByRef maxRow As Long, ByRef facCnt As Long)
    maxCol = 0: maxRow = 0: facCnt = 0
    If ws Is Nothing Then Exit Sub
    Dim cw As Double: cw = ws.Cells(1, 1).Width
    Dim rh As Double: rh = ws.Cells(LEGEND_ROWS + 1, 1).Height   ' 격자 셀 높이 = 2행 (1행=검색바). owner 2026-06-10
    If cw <= 0 Then cw = CELL_PT
    If rh <= 0 Then rh = CELL_PT
    Dim gridW As Double: gridW = cw * 네트웍_격자_단위가로cells()
    Dim gridH As Double: gridH = rh * 네트웍_격자_단위세로cells()
    If gridW <= 0 Or gridH <= 0 Then Exit Sub
    Dim sh As Shape
    For Each sh In ws.Shapes
        If Left(sh.Name, Len(PREFIX_FAC)) = PREFIX_FAC Then
            facCnt = facCnt + 1
            Dim cx As Double, cy As Double
            cx = sh.Left + sh.Width / 2
            cy = sh.Top + sh.Height / 2
            Dim gc As Long, gr As Long
            gc = CLng(cx / gridW)
            gr = CLng(cy / gridH)
            If gc > maxCol Then maxCol = gc
            If gr > maxRow Then maxRow = gr
        End If
    Next sh
End Sub

' owner 2026-06-08 (8-122): 「작은 격자(4×4)」 — 한 격자 칸 안 Excel cell 수를 4×4 로 줄여서 격자 자체를 좁게.
'   기본은 한 격자 칸 = 20×20 Excel cell (= 300pt). 「작은 격자」 = 4×4 Excel cell (= 60pt, 1/5 크기).
'   격자 칸수 (12×10 default) 는 그대로 유지 — 전체 영역도 1/5 좁아짐.
'   기존 시설물은 절대 pt 좌표라 새 격자와 미정렬 가능 — 빈 프로젝트에서 시작 권장.
Public Sub 격자_최소화_4x4()
    Const TARGET_CELLS_PER_GRID As Long = 4

    Dim ws As Worksheet
    On Error Resume Next: Set ws = ThisWorkbook.Worksheets(SHEET_NETWORK): On Error GoTo 0
    If ws Is Nothing Then
        MsgBox "네트웍구성도 시트를 찾을 수 없습니다.", vbExclamation, "작은 격자(4×4)"
        Exit Sub
    End If

    ' 기존 시설물 개수
    Dim facCnt As Long: facCnt = 0
    Dim sh As Shape
    For Each sh In ws.Shapes
        If Left(sh.Name, Len(PREFIX_FAC)) = PREFIX_FAC Then facCnt = facCnt + 1
    Next sh

    If facCnt > 0 Then
        Dim resp As Long
        resp = MsgBox("이미 " & facCnt & "개 시설물이 배치되어 있습니다." & vbLf & vbLf & _
                      "한 격자 칸 = " & TARGET_CELLS_PER_GRID & "×" & TARGET_CELLS_PER_GRID & " Excel cell (= 1/5 크기) 로 줄이면" & vbLf & _
                      "기존 시설물 위치가 새 격자와 안 맞을 수 있습니다." & vbLf & vbLf & _
                      "계속할까요? (빈 프로젝트에서 시작 권장)", _
                      vbOKCancel + vbExclamation, "작은 격자(4×4)")
        If resp <> vbOK Then Exit Sub
    End If

    Dim wasProt As Boolean: wasProt = ws.ProtectContents Or ws.ProtectDrawingObjects
    On Error Resume Next: ws.Unprotect: On Error GoTo 0

    ' 한 격자 칸 안 cell 수 저장 (격자 칸수 와 별개의 property)
    네트웍_격자_단위cells_저장 TARGET_CELLS_PER_GRID, TARGET_CELLS_PER_GRID

    ' 격자 영역 = 격자칸수 × 한칸안cell수 + 1
    Dim cellsX As Long: cellsX = 네트웍_격자_가로칸수()
    Dim cellsY As Long: cellsY = 네트웍_격자_세로칸수()
    Dim newTotalCols As Long: newTotalCols = cellsX * TARGET_CELLS_PER_GRID + 1
    Dim newTotalRows As Long: newTotalRows = cellsY * TARGET_CELLS_PER_GRID + 1
    On Error Resume Next
    UniformCellSize ws, newTotalCols, newTotalRows
    On Error GoTo 0

    네트웍_격자_생성

    If wasProt Then ApplySheetProtection ws

    MsgBox "작은 격자 (한 칸 " & TARGET_CELLS_PER_GRID & "×" & TARGET_CELLS_PER_GRID & " cell) 적용 완료." & vbLf & vbLf & _
           "  • 한 격자 칸 = " & TARGET_CELLS_PER_GRID & "×" & TARGET_CELLS_PER_GRID & " Excel cell (기본 20×20 의 1/5 크기)" & vbLf & _
           "  • 격자 칸수: " & cellsX & "×" & cellsY & " (유지)" & vbLf & _
           "  • 전체 영역: " & newTotalCols & " 열 × " & newTotalRows & " 행" & vbLf & _
           "  • 시설물: " & facCnt & "개" & vbLf & vbLf & _
           "시설물 배치 후 「격자 한 칸 기본(20×20)」 으로 복원하면 격자가 다시 넓어집니다.", _
           vbInformation, "작은 격자(4×4)"
End Sub

' owner 2026-06-08 (8-122): 한 격자 칸 안 cell 수를 기본값(20×20)으로 복원.
Public Sub 격자_단위_기본()
    Dim ws As Worksheet
    On Error Resume Next: Set ws = ThisWorkbook.Worksheets(SHEET_NETWORK): On Error GoTo 0
    If ws Is Nothing Then
        MsgBox "네트웍구성도 시트를 찾을 수 없습니다.", vbExclamation, "격자 한 칸 기본"
        Exit Sub
    End If

    Dim wasProt As Boolean: wasProt = ws.ProtectContents Or ws.ProtectDrawingObjects
    On Error Resume Next: ws.Unprotect: On Error GoTo 0

    네트웍_격자_단위cells_저장 GRID_COLS_PER_CELL, GRID_ROWS_PER_CELL

    Dim cellsX As Long: cellsX = 네트웍_격자_가로칸수()
    Dim cellsY As Long: cellsY = 네트웍_격자_세로칸수()
    Dim newTotalCols As Long: newTotalCols = cellsX * GRID_COLS_PER_CELL + 1
    Dim newTotalRows As Long: newTotalRows = cellsY * GRID_ROWS_PER_CELL + 1
    On Error Resume Next
    UniformCellSize ws, newTotalCols, newTotalRows
    On Error GoTo 0

    네트웍_격자_생성
    If wasProt Then ApplySheetProtection ws

    MsgBox "한 격자 칸 = " & GRID_COLS_PER_CELL & "×" & GRID_ROWS_PER_CELL & " Excel cell (기본값) 으로 복원.", _
           vbInformation, "격자 한 칸 기본"
End Sub

' owner 2026-06-08 (8-122): 한 격자 칸 안 cell 수 직접 입력.
Public Sub 격자_단위_직접입력()
    Dim curX As Long: curX = 네트웍_격자_단위가로cells()
    Dim curY As Long: curY = 네트웍_격자_단위세로cells()

    Dim sx As String
    sx = InputBox("한 격자 칸 가로 cell 수 (현재 " & curX & ", 기본 " & GRID_COLS_PER_CELL & ", 최소 1)" & vbLf & vbLf & _
                  "작은 값 = 격자 한 칸 좁게. 큰 값 = 격자 한 칸 넓게.", _
                  "격자 한 칸 직접 입력 — 가로", CStr(curX))
    If Len(Trim(sx)) = 0 Then Exit Sub
    If Not IsNumeric(sx) Then
        MsgBox "숫자만 입력하세요.", vbExclamation, "격자 한 칸 직접 입력"
        Exit Sub
    End If
    Dim newX As Long: newX = CLng(sx)
    If newX < 1 Then
        MsgBox "최소 1 이상이어야 합니다.", vbExclamation, "격자 한 칸 직접 입력"
        Exit Sub
    End If

    Dim sy As String
    sy = InputBox("한 격자 칸 세로 cell 수 (현재 " & curY & ", 기본 " & GRID_ROWS_PER_CELL & ", 최소 1)", _
                  "격자 한 칸 직접 입력 — 세로", CStr(curY))
    If Len(Trim(sy)) = 0 Then Exit Sub
    If Not IsNumeric(sy) Then
        MsgBox "숫자만 입력하세요.", vbExclamation, "격자 한 칸 직접 입력"
        Exit Sub
    End If
    Dim newY As Long: newY = CLng(sy)
    If newY < 1 Then
        MsgBox "최소 1 이상이어야 합니다.", vbExclamation, "격자 한 칸 직접 입력"
        Exit Sub
    End If

    Dim ws As Worksheet
    On Error Resume Next: Set ws = ThisWorkbook.Worksheets(SHEET_NETWORK): On Error GoTo 0
    If ws Is Nothing Then Exit Sub

    Dim wasProt As Boolean: wasProt = ws.ProtectContents Or ws.ProtectDrawingObjects
    On Error Resume Next: ws.Unprotect: On Error GoTo 0

    네트웍_격자_단위cells_저장 newX, newY

    Dim cellsX As Long: cellsX = 네트웍_격자_가로칸수()
    Dim cellsY As Long: cellsY = 네트웍_격자_세로칸수()
    Dim newTotalCols As Long: newTotalCols = cellsX * newX + 1
    Dim newTotalRows As Long: newTotalRows = cellsY * newY + 1
    On Error Resume Next
    UniformCellSize ws, newTotalCols, newTotalRows
    On Error GoTo 0

    네트웍_격자_생성
    If wasProt Then ApplySheetProtection ws

    MsgBox "한 격자 칸 = " & newX & "×" & newY & " cell 적용 완료." & vbLf & vbLf & _
           "전체 영역: " & newTotalCols & " 열 × " & newTotalRows & " 행", _
           vbInformation, "격자 한 칸 직접 입력"
End Sub

' ===== owner 2026-06-10: 격자 줌 — 한 격자 칸 cell 수 ±2 단계 (전체 / 가로만 / 세로만) =====
'   한 격자 칸 안 Excel cell 수를 ±2 로 바꿔 격자 한 칸을 좁히거나(축소) 넓힘(확대). 최소 4, 최대 40.
'   격자 칸수(network_grid_cells)는 불변 — 한 칸 크기만 변함 → 전체 영역이 같은 비율로 줌.
'   재정렬: 시설물 등은 좌표만 비례 이동(크기 유지), 케이블은 부속정렬이 새 끝점으로 다시 그림(위치+크기).
'   confirm/완료 MsgBox 없음 — 반복 클릭 UX. 한계 도달 시에만 안내.
' 전체 줌 = 격자 밀도(한 칸 cell 수) ±2. 시설물 크기 유지 + 간격만 변경 (Excel 네이티브 줌엔 없는 동작). owner 2026-06-10
Public Sub 격자_줌_전체_축소()
    격자_줌_적용 True, True, -2
End Sub
Public Sub 격자_줌_전체_확대()
    격자_줌_적용 True, True, 2
End Sub
Public Sub 격자_줌_가로_축소()
    격자_줌_적용 True, False, -2
End Sub
Public Sub 격자_줌_가로_확대()
    격자_줌_적용 True, False, 2
End Sub
Public Sub 격자_줌_세로_축소()
    격자_줌_적용 False, True, -2
End Sub
Public Sub 격자_줌_세로_확대()
    격자_줌_적용 False, True, 2
End Sub

Public Sub 격자_줌_적용(axisX As Boolean, axisY As Boolean, delta As Long)
    Dim ws As Worksheet
    On Error Resume Next: Set ws = ThisWorkbook.Worksheets(SHEET_NETWORK): On Error GoTo 0
    If ws Is Nothing Then
        MsgBox "네트웍구성도 시트를 찾을 수 없습니다.", vbExclamation, "격자 줌"
        Exit Sub
    End If

    Dim oldX As Long: oldX = 네트웍_격자_단위가로cells()
    Dim oldY As Long: oldY = 네트웍_격자_단위세로cells()
    Dim newX As Long: newX = oldX
    Dim newY As Long: newY = oldY
    If axisX Then newX = 격자_줌_clamp(oldX + delta)
    If axisY Then newY = 격자_줌_clamp(oldY + delta)

    If newX = oldX And newY = oldY Then
        MsgBox "격자 한 칸이 이미 " & IIf(delta < 0, "최소(4)", "최대(40)") & " 입니다.", _
               vbInformation, "격자 줌"
        Exit Sub
    End If

    ' 줌 전 사용자 선택 셀 기억 — 격자 재생성(틀고정)이 커서를 A2 로 옮기므로 끝에 복원+중심이동. owner 2026-06-10
    Dim selRow As Long: selRow = 0
    Dim selCol As Long: selCol = 0
    On Error Resume Next
    If Not ActiveCell Is Nothing Then
        If ActiveCell.Worksheet.Name = SHEET_NETWORK Then selRow = ActiveCell.Row: selCol = ActiveCell.Column
    End If
    On Error GoTo 0

    Dim sx As Double: sx = newX / oldX
    Dim sy As Double: sy = newY / oldY

    Dim wasProt As Boolean: wasProt = ws.ProtectContents Or ws.ProtectDrawingObjects
    On Error Resume Next: ws.Unprotect: On Error GoTo 0
    Dim oUpd As Boolean: oUpd = Application.ScreenUpdating
    Dim oEv As Boolean: oEv = Application.EnableEvents
    Application.ScreenUpdating = False
    Application.EnableEvents = False

    ' [시설물 부속 따라가기 준비] 변환 전 — 시설물 중심 + 부속 도형(설명박스·배지·주야박스·콤보·코어박스) 위치·소속 시설물 기록.
    '   스케일하면 시설물에서 멀어지고 캐스케이드 stack(고정간격)도 깨짐 → 변환 후 「소속 시설물 이동량만큼 평행이동」으로 보존. owner 2026-06-10
    Dim facOldCx As Object: Set facOldCx = CreateObject("Scripting.Dictionary")
    Dim facOldCy As Object: Set facOldCy = CreateObject("Scripting.Dictionary")
    Dim facOldW As Object: Set facOldW = CreateObject("Scripting.Dictionary")
    Dim facOldH As Object: Set facOldH = CreateObject("Scripting.Dictionary")
    Dim boxFac As Object: Set boxFac = CreateObject("Scripting.Dictionary")
    Dim boxOldL As Object: Set boxOldL = CreateObject("Scripting.Dictionary")
    Dim boxOldT As Object: Set boxOldT = CreateObject("Scripting.Dictionary")
    Dim shRec As Shape
    ' Pass A — 「전 도형」 Placement=3 강제 + 시설물 중심·크기 기록.
    '   UniformCellSize 가 매 줌마다 ColumnWidth=2 임시 축소→복원 + 1행 높이 22↔15 진동을 일으켜
    '   Placement=이동·크기조정 도형(rename 실패 legend_fac_* 등 fac_ 보호 밖 도형 포함)을 찌그러뜨림 →
    '   시설물만이 아니라 시트 전체에 강제해 원천 차단. owner 2026-06-10 (일부 시설물 찌그러짐 보고)
    For Each shRec In ws.Shapes
        On Error Resume Next: shRec.Placement = 3: On Error GoTo 0
        If Left(shRec.Name, Len(PREFIX_FAC)) = PREFIX_FAC Then
            facOldCx(shRec.Name) = shRec.Left + shRec.Width / 2
            facOldCy(shRec.Name) = shRec.Top + shRec.Height / 2
            facOldW(shRec.Name) = shRec.Width
            facOldH(shRec.Name) = shRec.Height
        End If
    Next shRec
    ' Pass B — 부속 도형 수집 (이름 suffix = facId 인 데코 + alt fac= 인 코어박스)
    For Each shRec In ws.Shapes
        Dim fAttach As String: fAttach = 격자_줌_데코소속시설(shRec.Name, facOldCx)
        If Len(fAttach) = 0 Then
            If Left(shRec.Name, Len(PREFIX_PAIRBOX)) = PREFIX_PAIRBOX Then
                Dim altRec As String: altRec = ""
                On Error Resume Next: altRec = shRec.AlternativeText: On Error GoTo 0
                fAttach = 선번박스_alt추출(altRec, "fac=")
                If Not facOldCx.Exists(fAttach) Then fAttach = ""
            End If
        End If
        If Len(fAttach) > 0 Then
            boxFac(shRec.Name) = fAttach
            boxOldL(shRec.Name) = shRec.Left
            boxOldT(shRec.Name) = shRec.Top
        End If
    Next shRec

    ' 한 칸 cell 수 저장
    네트웍_격자_단위cells_저장 newX, newY

    ' 새 전체 영역 = 격자칸수 × 새 한칸cell수 + 1
    Dim cellsX As Long: cellsX = 네트웍_격자_가로칸수()
    Dim cellsY As Long: cellsY = 네트웍_격자_세로칸수()
    Dim newTotalCols As Long: newTotalCols = cellsX * newX + 1
    Dim newTotalRows As Long: newTotalRows = cellsY * newY + 1
    On Error Resume Next: UniformCellSize ws, newTotalCols, newTotalRows: On Error GoTo 0

    ' [시설물 재스냅] 스케일 누적 회피 — 현재 위치에서 격자 좌표(정수)를 구해 새 격자에 정확히 재배치.
    '   중심 = gridCol*gridW + cw/2 / NW_TOP_H + gridRow*gridH + rh/2 (SnapToNetworkGrid 동일 공식).
    '   20→18→20 반복해도 정수 좌표라 원위치 복귀 (부동소수점 누적 0). owner 2026-06-10
    Dim cwz As Double: cwz = ws.Cells(1, 1).Width
    Dim rhz As Double: rhz = ws.Cells(LEGEND_ROWS + 1, 1).Height
    If cwz <= 0 Then cwz = CELL_PT
    If rhz <= 0 Then rhz = CELL_PT
    Dim oldGW As Double: oldGW = cwz * oldX
    Dim oldGH As Double: oldGH = rhz * oldY
    Dim newGW As Double: newGW = cwz * newX
    Dim newGH As Double: newGH = rhz * newY
    Dim minNyZ As Double: minNyZ = NW_TOP_H + FAC_DEFAULT_H / 2 + 8
    Dim shFac As Shape
    For Each shFac In ws.Shapes
        If Left(shFac.Name, Len(PREFIX_FAC)) = PREFIX_FAC Then
            Dim ocx As Double: ocx = shFac.Left + shFac.Width / 2
            Dim ocy As Double: ocy = shFac.Top + shFac.Height / 2
            Dim gCol As Long: gCol = CLng((ocx - cwz / 2) / oldGW)
            Dim gRow As Long: gRow = CLng((ocy - NW_TOP_H - rhz / 2) / oldGH)
            If gCol < 1 Then gCol = 1
            If gRow < 0 Then gRow = 0
            Dim ncx As Double: ncx = gCol * newGW + cwz / 2
            Dim ncy As Double: ncy = NW_TOP_H + gRow * newGH + rhz / 2
            If ncy < minNyZ Then
                ncy = NW_TOP_H + newGH + rhz / 2
                If ncy < minNyZ Then ncy = minNyZ
            End If
            On Error Resume Next
            ' 크기 복원(찌그러짐 방지) 후 중심 기준 재배치
            If facOldW.Exists(shFac.Name) Then shFac.Width = CDbl(facOldW(shFac.Name))
            If facOldH.Exists(shFac.Name) Then shFac.Height = CDbl(facOldH(shFac.Name))
            shFac.Left = ncx - shFac.Width / 2
            shFac.Top = ncy - shFac.Height / 2
            On Error GoTo 0
            ' _lpos 를 새 위치로 갱신 → 부속도형_정렬 의 _lpos 델타 추종이 이중 이동 안 하게. owner 2026-06-10
            Dim fAltZ As String: fAltZ = ""
            On Error Resume Next: fAltZ = shFac.AlternativeText: On Error GoTo 0
            On Error Resume Next: shFac.AlternativeText = 격자_줌_lpos갱신(fAltZ, shFac.Left, shFac.Top): On Error GoTo 0
        End If
    Next shFac

    네트웍_격자_생성

    ' 케이블·리더·배지·콤보·태그 일괄 재정렬 (케이블은 새 끝점으로 다시 그림). 부속 위치는 아래 authoritative 가 덮어씀.
    On Error Resume Next: 네트웍_부속도형_정렬: On Error GoTo 0

    ' [시설물 부속 — 최종(authoritative) 배치] 위 모든 정렬 이후 「맨 마지막에 한 번만」 덮어쓰기.
    '   설명박스·배지·주야·콤보·코어박스 = 「시설물 재스냅 중심 + 옛 오프셋 × 줌비율(sx,sy)」.
    '   레거시 정렬(_lpos·배지=라벨·고정간격)이 먼저 건드려도 마지막에 덮어 → 모든 줌 레벨·반복에서 드리프트 0. owner 2026-06-10
    Dim bKey As Variant
    For Each bKey In boxFac.Keys
        Dim bShp As Shape: Set bShp = Nothing
        On Error Resume Next: Set bShp = ws.Shapes(CStr(bKey)): On Error GoTo 0
        If Not bShp Is Nothing Then
            Dim fId As String: fId = CStr(boxFac(bKey))
            If facOldCx.Exists(fId) Then
                Dim fShp As Shape: Set fShp = Nothing
                On Error Resume Next: Set fShp = ws.Shapes(fId): On Error GoTo 0
                If Not fShp Is Nothing Then
                    Dim offX As Double: offX = CDbl(boxOldL(bKey)) - CDbl(facOldCx(fId))
                    Dim offY As Double: offY = CDbl(boxOldT(bKey)) - CDbl(facOldCy(fId))
                    On Error Resume Next
                    bShp.Left = (fShp.Left + fShp.Width / 2) + offX * sx
                    bShp.Top = (fShp.Top + fShp.Height / 2) + offY * sy
                    On Error GoTo 0
                    ' 코어박스는 lastPos 도 새 위치로 갱신 → 다음 드래그 시 Cable_Chain_평행이동 이
                    '   줌 이동량을 「드래그」로 오인해 체인 박스 튀는 것 차단. owner 2026-06-10
                    If Left(CStr(bKey), Len(PREFIX_PAIRBOX)) = PREFIX_PAIRBOX Then
                        On Error Resume Next: AltSetLastPos bShp, bShp.Left, bShp.Top: On Error GoTo 0
                    End If
                End If
            End If
        End If
    Next bKey

    ' 최종 박스/라벨 위치 기준으로 리더·코어 화살표 다시 그림 (박스 위치 보존 — 고정간격 페어화살표는 줌에서 제외).
    On Error Resume Next: 시설물_leader_재라우팅 ws: On Error GoTo 0
    On Error Resume Next: 선번화살표_재라우팅 ws: On Error GoTo 0

    ' 줌 후 화면을 선택 셀 중심으로 이동(커서도 그 셀로 복원) + 검색버튼 가로추종 재계산. owner 2026-06-10
    격자_줌_화면중심이동 ws, selRow, selCol
    On Error Resume Next: 네트웍_검색버튼_위치갱신 ws: On Error GoTo 0

    If wasProt Then ApplySheetProtection ws
    Application.EnableEvents = oEv
    Application.ScreenUpdating = oUpd

    On Error Resume Next
    Application.StatusBar = "격자 한 칸 = " & newX & "×" & newY & " cell"
    On Error GoTo 0
End Sub

Private Function 격자_줌_clamp(v As Long) As Long
    격자_줌_clamp = v
    If 격자_줌_clamp < 4 Then 격자_줌_clamp = 4
    If 격자_줌_clamp > 40 Then 격자_줌_clamp = 40
End Function

' 시설물 부속 도형(설명박스·배지·주야박스·태그콤보·태그박스)의 소속 시설물 id 반환.
'   이름 규칙: badge_<facId> / _fac_status_<facId> / _fac_tag_dd_<facId> / _fac_tag_<facId>_<옵션> / lbl_<facId>.
'   facDict 에 존재하는 facId 만 인정 — 케이블 라벨(lbl_<cableId>)·기타는 "" 반환(제외).
'   태그박스는 facId 뒤 "_옵션" suffix 가 붙어 정확일치 실패 → 「facId & "_"」 prefix 매칭 fallback. owner 2026-06-10
Private Function 격자_줌_데코소속시설(nm As String, facDict As Object) As String
    격자_줌_데코소속시설 = ""
    Dim fid As String: fid = ""
    If Left(nm, Len(PREFIX_BADGE)) = PREFIX_BADGE Then
        fid = Mid(nm, Len(PREFIX_BADGE) + 1)
    ElseIf Left(nm, Len(PREFIX_FAC_STATUS)) = PREFIX_FAC_STATUS Then
        fid = Mid(nm, Len(PREFIX_FAC_STATUS) + 1)
    ElseIf Left(nm, Len(PREFIX_FAC_TAG_DD)) = PREFIX_FAC_TAG_DD Then
        fid = Mid(nm, Len(PREFIX_FAC_TAG_DD) + 1)     ' dd 가 _fac_tag_ 로 시작하므로 먼저 검사
    ElseIf Left(nm, Len(PREFIX_FAC_TAG)) = PREFIX_FAC_TAG Then
        fid = Mid(nm, Len(PREFIX_FAC_TAG) + 1)        ' = "<facId>_<옵션>" — 아래 fallback 이 facId 추출
    ElseIf Left(nm, Len(PREFIX_LABEL)) = PREFIX_LABEL Then
        fid = Mid(nm, Len(PREFIX_LABEL) + 1)     ' 설명박스 — 단 lbl_<cableId> 는 facDict 에 없어 제외됨
    End If
    If Len(fid) = 0 Then Exit Function
    If facDict.Exists(fid) Then
        격자_줌_데코소속시설 = fid
        Exit Function
    End If
    ' fallback — fid 가 "facId_옵션" 형태면 facDict 키 중 「key & "_"」 로 시작하는 것 찾기 (태그박스)
    Dim k As Variant
    For Each k In facDict.Keys
        If Left(fid, Len(CStr(k)) + 1) = CStr(k) & "_" Then
            격자_줌_데코소속시설 = CStr(k)
            Exit Function
        End If
    Next k
End Function

' 줌 후 화면을 줌 전 선택 셀(selRow,selCol) 중심으로 스크롤 + 커서 복원 (ScrollRow/Col — 틀고정 행 아래로 클램프). owner 2026-06-10
Private Sub 격자_줌_화면중심이동(ws As Worksheet, selRow As Long, selCol As Long)
    On Error Resume Next
    If selRow < 1 Or selCol < 1 Then Exit Sub
    Dim awin As Window: Set awin = ActiveWindow
    If awin Is Nothing Then Exit Sub
    ws.Cells(selRow, selCol).Select     ' 격자 재생성이 A2 로 옮긴 커서를 사용자 셀로 복원
    Dim rhC As Double: rhC = ws.Cells(LEGEND_ROWS + 1, 1).Height
    Dim cwC As Double: cwC = ws.Cells(1, 1).Width
    If rhC <= 0 Then rhC = CELL_PT
    If cwC <= 0 Then cwC = CELL_PT
    ' 화면 배율 반영 — 줌 시 한 셀이 화면에서 차지하는 크기 = 셀크기 × 배율. owner 2026-06-10
    Dim zf As Double: zf = 1
    On Error Resume Next: zf = awin.Zoom / 100#: On Error GoTo 0
    If zf <= 0 Then zf = 1
    Dim visRows As Long: visRows = CLng(awin.UsableHeight / (rhC * zf))
    Dim visCols As Long: visCols = CLng(awin.UsableWidth / (cwC * zf))
    Dim srC As Long: srC = selRow - visRows \ 2
    Dim scC As Long: scC = selCol - visCols \ 2
    If srC < LEGEND_ROWS + 1 Then srC = LEGEND_ROWS + 1     ' 틀고정(1행) 아래로
    If scC < 1 Then scC = 1
    awin.ScrollRow = srC
    awin.ScrollColumn = scC
    On Error GoTo 0
End Sub

' 시설물 alt 의 "_lpos=X,Y" 를 새 위치로 갱신(없으면 추가). 재스냅 후 호출 →
'   시설물_태그_위치_동기화 의 _lpos 델타 추종이 「안 움직임(dx=0)」으로 보게 해 부속 이중이동 차단. owner 2026-06-10
Private Function 격자_줌_lpos갱신(alt As String, newL As Double, newT As Double) As String
    Dim lposStr As String: lposStr = "_lpos=" & newL & "," & newT
    Dim p As Long: p = InStr(alt, "_lpos=")
    If p = 0 Then
        If Len(alt) = 0 Then 격자_줌_lpos갱신 = lposStr Else 격자_줌_lpos갱신 = alt & "|" & lposStr
    Else
        Dim e As Long: e = InStr(p, alt, "|")
        If e = 0 Then
            격자_줌_lpos갱신 = Left(alt, p - 1) & lposStr
        Else
            격자_줌_lpos갱신 = Left(alt, p - 1) & lposStr & Mid(alt, e)
        End If
    End If
End Function

' ===== owner 2026-06-08 (8-115): 배치 모드 — 네트웍구성도 데코 숨김/복원 토글 =====
'   목적: 처음 작은 격자(4×4) 에서 시설물만 빠르게 배치하기 위해 다른 데코를 임시로 숨김.
'   숨김 대상 prefix (네트웍구성도만, 행정도 영향 0):
'     · lbl_   = 시설물 설명선 / 케이블 라벨
'     · lead_  = 설명선 리더
'     · cbl_   = 케이블 connector
'     · _fac_status_ = 주간/야간 상태박스
'     · _fac_tag_    = 시설물 태그 콤보 (+ _fac_tag_dd_ 자동 포함)
'     · _pairbox_, _pairarrow_ = 코어 박스·화살표
'     · _pt_L_, _pt_R_, _pt_RIN_, _pt_ROUT_, _pt_line_, _pt_btn_ = 선번연결 도구 도형
'     · _pt_radial_, _pt_radlab_ = 방사형 도구
'   유지: fac_ (시설물) + badge_ (포인트 번호) + _grid_ (격자 잔재) + 그 외 시스템 도형
'   상태: module-level Public g_placementMode (파일 닫으면 리셋 — 데이터 손실 위험 0).
'   (선언은 module 최상단에 있음 — VBA 규칙)

Public Sub 배치모드_토글()
    Dim ws As Worksheet
    On Error Resume Next: Set ws = ThisWorkbook.Worksheets(SHEET_NETWORK): On Error GoTo 0
    If ws Is Nothing Then
        MsgBox "네트웍구성도 시트를 찾을 수 없습니다.", vbExclamation, "배치 모드"
        Exit Sub
    End If

    g_placementMode = Not g_placementMode

    Dim wasProt As Boolean: wasProt = ws.ProtectContents Or ws.ProtectDrawingObjects
    On Error Resume Next: ws.Unprotect: On Error GoTo 0

    네트웍_데코_가시성_적용 ws, Not g_placementMode      ' 모드 ON 이면 데코 숨김 (vis=False)

    If wasProt Then ApplySheetProtection ws

    If g_placementMode Then
        MsgBox "배치 모드 ON" & vbLf & vbLf & _
               "  • 네트웍구성도 데코 (설명선·콤보·주야·케이블·라벨·코어박스) 숨김" & vbLf & _
               "  • 시설물 + 포인트 번호만 표시" & vbLf & _
               "  • 행정도는 영향 없음" & vbLf & vbLf & _
               "다시 누르면 데코 복원.", _
               vbInformation, "배치 모드 ON"
    Else
        MsgBox "배치 모드 OFF — 모든 데코 복원 완료.", vbInformation, "배치 모드 OFF"
    End If
End Sub

' (ws, vis=True 면 보임 / vis=False 면 숨김). 네트웍 데코 prefix 전체 일괄 적용.
Public Sub 네트웍_데코_가시성_적용(ws As Worksheet, vis As Boolean)
    If ws Is Nothing Then Exit Sub
    Dim msoVis As Long: msoVis = IIf(vis, msoTrue, msoFalse)
    Dim sh As Shape
    For Each sh In ws.Shapes
        If 데코_prefix_여부(sh.Name) Then
            On Error Resume Next
            sh.Visible = msoVis
            On Error GoTo 0
        End If
    Next sh
End Sub

' ===== owner 2026-06-10: 시설물만 보기 — 데코 + 배지 숨김/복원 토글 (격자 축소 시 배치 편의) =====
'   배치 모드(데코만 숨김, 배지 유지)와 달리 배지(포인트 번호)까지 숨겨 「시설물 + 케이블」만 표시.
'   케이블 라인(cbl_)은 유지 — 연결관계 보며 배치. 한 번 = 시설물+케이블 / 다시 = 설명선·배지·주야·콤보 복원.
'   g_facOnlyMode (파일 닫으면 리셋). owner: 「케이블은 보여야 해」 2026-06-10.
Public Sub 시설물만보기_토글()
    Dim ws As Worksheet
    On Error Resume Next: Set ws = ThisWorkbook.Worksheets(SHEET_NETWORK): On Error GoTo 0
    If ws Is Nothing Then
        MsgBox "네트웍구성도 시트를 찾을 수 없습니다.", vbExclamation, "시설물만 보기"
        Exit Sub
    End If

    g_facOnlyMode = Not g_facOnlyMode

    Dim wasProt As Boolean: wasProt = ws.ProtectContents Or ws.ProtectDrawingObjects
    On Error Resume Next: ws.Unprotect: On Error GoTo 0

    시설물만보기_가시성_적용 ws, Not g_facOnlyMode      ' 모드 ON 이면 숨김 (vis=False)

    If wasProt Then ApplySheetProtection ws

    On Error Resume Next
    Application.StatusBar = IIf(g_facOnlyMode, "시설물만 보기 ON — 시설물만 표시 (다시 누르면 전체 복원)", "시설물만 보기 OFF — 전체 복원")
    On Error GoTo 0
End Sub

' (ws, vis=True 면 보임 / vis=False 면 숨김). 데코 prefix 전체 + 배지 — 단 케이블(cbl_)은 제외(항상 표시).
Public Sub 시설물만보기_가시성_적용(ws As Worksheet, vis As Boolean)
    If ws Is Nothing Then Exit Sub
    Dim msoVis As Long: msoVis = IIf(vis, msoTrue, msoFalse)
    Dim sh As Shape
    For Each sh In ws.Shapes
        ' 케이블 라인은 숨기지 않음 (owner: 케이블은 보여야 해)
        If Left(sh.Name, Len(PREFIX_CBL)) <> PREFIX_CBL Then
            If 데코_prefix_여부(sh.Name) Or Left(sh.Name, Len(PREFIX_BADGE)) = PREFIX_BADGE Then
                On Error Resume Next
                sh.Visible = msoVis
                On Error GoTo 0
            End If
        End If
    Next sh
End Sub

' 도형명이 「숨김 대상 데코」 prefix 인지 — 한 곳에서 관리.
Public Function 데코_prefix_여부(nm As String) As Boolean
    데코_prefix_여부 = False
    If Len(nm) = 0 Then Exit Function
    If Left(nm, Len(PREFIX_LABEL)) = PREFIX_LABEL Then 데코_prefix_여부 = True: Exit Function
    If Left(nm, Len(PREFIX_LEADER)) = PREFIX_LEADER Then 데코_prefix_여부 = True: Exit Function
    If Left(nm, Len(PREFIX_CBL)) = PREFIX_CBL Then 데코_prefix_여부 = True: Exit Function
    If Left(nm, Len(PREFIX_FAC_STATUS)) = PREFIX_FAC_STATUS Then 데코_prefix_여부 = True: Exit Function
    If Left(nm, Len(PREFIX_FAC_TAG)) = PREFIX_FAC_TAG Then 데코_prefix_여부 = True: Exit Function
    If Left(nm, Len(PREFIX_PAIRBOX)) = PREFIX_PAIRBOX Then 데코_prefix_여부 = True: Exit Function
    If Left(nm, Len(PREFIX_PAIRARROW)) = PREFIX_PAIRARROW Then 데코_prefix_여부 = True: Exit Function
    If Left(nm, Len(PREFIX_PT_L)) = PREFIX_PT_L Then 데코_prefix_여부 = True: Exit Function
    If Left(nm, Len(PREFIX_PT_R)) = PREFIX_PT_R Then 데코_prefix_여부 = True: Exit Function
    If Left(nm, Len(PREFIX_PT_RIN)) = PREFIX_PT_RIN Then 데코_prefix_여부 = True: Exit Function
    If Left(nm, Len(PREFIX_PT_ROUT)) = PREFIX_PT_ROUT Then 데코_prefix_여부 = True: Exit Function
    If Left(nm, Len(PREFIX_PT_LINE)) = PREFIX_PT_LINE Then 데코_prefix_여부 = True: Exit Function
    If Left(nm, Len(PREFIX_PT_BTN)) = PREFIX_PT_BTN Then 데코_prefix_여부 = True: Exit Function
    If Left(nm, Len(PREFIX_PT_RADIAL)) = PREFIX_PT_RADIAL Then 데코_prefix_여부 = True: Exit Function
    If Left(nm, Len(PREFIX_PT_RADIALLBL)) = PREFIX_PT_RADIALLBL Then 데코_prefix_여부 = True: Exit Function
End Function

' ===== owner 2026-06-08 (8-116): 격자 내부확장 + Undo =====
'   격자 칸수 × k 배 + 모든 영향 도형 좌표 × k 배. 시설물 간격 벌리기.
'   Undo 백업 1 회 자동 보장 — 직전 좌표 + 격자 칸수 복원.
'   waypoint 있는 케이블 connector 는 자동 재라우팅 (시설물 endpoint follow). nodes jsonb 미사용.
'   META_PLACEMENT_UNDO 상수 선언은 module 최상단 (VBA 규칙).

Public Sub 격자_내부확장_2()
    격자_내부확장_적용 2
End Sub

Public Sub 격자_내부확장_3()
    격자_내부확장_적용 3
End Sub

Public Sub 격자_내부확장_직접입력()
    Dim s As String
    s = InputBox("내부확장 배수 (정수 ≥ 2)" & vbLf & vbLf & "  • 2 = 시설물 간격 2 배" & vbLf & "  • 3 = 3 배 ...", _
                  "격자 내부확장", "2")
    If Len(Trim(s)) = 0 Then Exit Sub
    If Not IsNumeric(s) Then
        MsgBox "숫자만 입력하세요.", vbExclamation, "격자 내부확장"
        Exit Sub
    End If
    Dim k As Long: k = CLng(s)
    If k < 2 Then
        MsgBox "배수는 2 이상이어야 합니다.", vbExclamation, "격자 내부확장"
        Exit Sub
    End If
    격자_내부확장_적용 k
End Sub

Public Sub 격자_내부확장_적용(k As Long)
    If k < 2 Then Exit Sub
    Dim ws As Worksheet
    On Error Resume Next: Set ws = ThisWorkbook.Worksheets(SHEET_NETWORK): On Error GoTo 0
    If ws Is Nothing Then
        MsgBox "네트웍구성도 시트를 찾을 수 없습니다.", vbExclamation, "격자 내부확장"
        Exit Sub
    End If

    Dim curX As Long: curX = 네트웍_격자_가로칸수()
    Dim curY As Long: curY = 네트웍_격자_세로칸수()
    Dim newX As Long: newX = curX * k
    Dim newY As Long: newY = curY * k

    Dim resp As Long
    resp = MsgBox("격자 내부확장 ×" & k & " 적용:" & vbLf & vbLf & _
                  "  • 격자 " & curX & "×" & curY & " → " & newX & "×" & newY & vbLf & _
                  "  • 모든 영향 도형 좌표 ×" & k & vbLf & vbLf & _
                  "「격자 확장 되돌리기」 로 1 회 원복 가능. 계속할까요?", _
                  vbOKCancel + vbInformation, "격자 내부확장")
    If resp <> vbOK Then Exit Sub

    Dim wasProt As Boolean: wasProt = ws.ProtectContents Or ws.ProtectDrawingObjects
    On Error Resume Next: ws.Unprotect: On Error GoTo 0

    Dim oUpd As Boolean: oUpd = Application.ScreenUpdating
    Dim oEv As Boolean: oEv = Application.EnableEvents
    Application.ScreenUpdating = False
    Application.EnableEvents = False

    ' Undo 백업 (도형 좌표 + 격자 칸수)
    격자_확장_Undo_백업 ws

    ' 격자 칸수 + 셀 크기 갱신
    네트웍_격자_칸수_저장 newX, newY
    Dim newTotalCols As Long: newTotalCols = newX * 네트웍_격자_단위가로cells() + 1
    Dim newTotalRows As Long: newTotalRows = newY * 네트웍_격자_단위세로cells() + 1
    On Error Resume Next: UniformCellSize ws, newTotalCols, newTotalRows: On Error GoTo 0

    ' 도형 좌표 stretch (시설물 + 데코 + 케이블 라벨 등)
    네트웍_도형_좌표_변환 ws, CDbl(k), CDbl(k), 0#, 0#

    네트웍_격자_생성

    ' 케이블 connector·leader·배지·콤보·태그 일괄 재정렬
    On Error Resume Next: 네트웍_부속도형_정렬: On Error GoTo 0

    If wasProt Then ApplySheetProtection ws

    Application.EnableEvents = oEv
    Application.ScreenUpdating = oUpd

    MsgBox "격자 내부확장 ×" & k & " 완료." & vbLf & vbLf & _
           "  • 격자: " & curX & "×" & curY & " → " & newX & "×" & newY & vbLf & _
           "  • 영역: " & newTotalCols & " 열 × " & newTotalRows & " 행" & vbLf & vbLf & _
           "이상하면 「격자 확장 되돌리기」.", _
           vbInformation, "격자 내부확장"
End Sub

' 영향받는 모든 도형의 Left/Top 을 (sx, sy) 배 + (offX, offY) 더하기.
'   대상: 시설물 fac_, 배지 badge_, 라벨 lbl_, 리더 lead_, 콤보 _fac_tag_, 주야 _fac_status_, 케이블 cbl_, 코어 _pairbox_/_pairarrow_
'   제외: 격자 _grid_, 도구 _pt_*, 범례 legend_*/leglbl_
'   케이블 connector 는 endpoint 가 시설물에 BeginConnect 라 시설물 따라감 — Left/Top 직접 변경 X (시도해도 connector 는 무시).
Public Sub 네트웍_도형_좌표_변환(ws As Worksheet, sx As Double, sy As Double, _
                                  offX As Double, offY As Double)
    If ws Is Nothing Then Exit Sub
    Dim sh As Shape
    For Each sh In ws.Shapes
        If 좌표변환_대상_여부(sh.Name) Then
            On Error Resume Next
            sh.Left = sh.Left * sx + offX
            sh.Top = sh.Top * sy + offY
            On Error GoTo 0
        End If
    Next sh
End Sub

' 격자 확장 시 좌표 변환 대상 — 격자 잔재·도구 도형·범례 제외.
Public Function 좌표변환_대상_여부(nm As String) As Boolean
    좌표변환_대상_여부 = False
    If Len(nm) = 0 Then Exit Function
    If Left(nm, Len(GRID_PREFIX)) = GRID_PREFIX Then Exit Function
    If Left(nm, Len(PREFIX_PT_L)) = PREFIX_PT_L Then Exit Function
    If Left(nm, Len(PREFIX_PT_R)) = PREFIX_PT_R Then Exit Function
    If Left(nm, Len(PREFIX_PT_RIN)) = PREFIX_PT_RIN Then Exit Function
    If Left(nm, Len(PREFIX_PT_ROUT)) = PREFIX_PT_ROUT Then Exit Function
    If Left(nm, Len(PREFIX_PT_LINE)) = PREFIX_PT_LINE Then Exit Function
    If Left(nm, Len(PREFIX_PT_BTN)) = PREFIX_PT_BTN Then Exit Function
    If Left(nm, Len(PREFIX_PT_RADIAL)) = PREFIX_PT_RADIAL Then Exit Function
    If Left(nm, Len(PREFIX_PT_RADIALLBL)) = PREFIX_PT_RADIALLBL Then Exit Function
    If Left(nm, Len(PREFIX_LEG_FAC)) = PREFIX_LEG_FAC Then Exit Function
    If Left(nm, Len(PREFIX_LEG_CBL)) = PREFIX_LEG_CBL Then Exit Function
    If Left(nm, Len(PREFIX_LEG_LABEL)) = PREFIX_LEG_LABEL Then Exit Function
    좌표변환_대상_여부 = True
End Function

' 영향받는 모든 도형의 좌표 + 격자 칸수 백업 → 메타 시트 "_placement_undo"
Public Sub 격자_확장_Undo_백업(ws As Worksheet)
    If ws Is Nothing Then Exit Sub
    Dim metaWs As Worksheet: Set metaWs = Nothing
    On Error Resume Next: Set metaWs = ThisWorkbook.Worksheets(META_PLACEMENT_UNDO): On Error GoTo 0
    If metaWs Is Nothing Then
        On Error Resume Next
        Set metaWs = ThisWorkbook.Worksheets.Add
        metaWs.Name = META_PLACEMENT_UNDO
        metaWs.Visible = xlSheetHidden
        On Error GoTo 0
    End If
    If metaWs Is Nothing Then Exit Sub

    On Error Resume Next: metaWs.Cells.Clear: On Error GoTo 0

    Dim curX As Long: curX = 네트웍_격자_가로칸수()
    Dim curY As Long: curY = 네트웍_격자_세로칸수()
    metaWs.Cells(1, 1).Value = "cells_x"
    metaWs.Cells(1, 2).Value = curX
    metaWs.Cells(1, 3).Value = "cells_y"
    metaWs.Cells(1, 4).Value = curY

    Dim r As Long: r = 2
    Dim sh As Shape
    For Each sh In ws.Shapes
        If 좌표변환_대상_여부(sh.Name) Then
            On Error Resume Next
            metaWs.Cells(r, 1).Value = sh.Name
            metaWs.Cells(r, 2).Value = sh.Left
            metaWs.Cells(r, 3).Value = sh.Top
            r = r + 1
            On Error GoTo 0
        End If
    Next sh
End Sub

' ===== owner 2026-06-08 (8-117): 격자 추가확장 — 외곽 1 단위 추가 =====
'   상/좌 방향 = 기존 도형을 안쪽으로 shift (offset 만큼 Left/Top 증가)
'   하/우 방향 = 도형 그대로, 격자만 확장
'   Undo 백업 자동 (내부확장과 동일 메타).
Public Sub 격자_추가확장_위()
    격자_추가확장_적용 "U", 1
End Sub

Public Sub 격자_추가확장_아래()
    격자_추가확장_적용 "D", 1
End Sub

Public Sub 격자_추가확장_왼쪽()
    격자_추가확장_적용 "L", 1
End Sub

Public Sub 격자_추가확장_오른쪽()
    격자_추가확장_적용 "R", 1
End Sub

Public Sub 격자_추가확장_적용(direction As String, count As Long)
    If count < 1 Then count = 1
    Dim dir As String: dir = UCase(direction)
    If dir <> "U" And dir <> "D" And dir <> "L" And dir <> "R" Then Exit Sub

    Dim ws As Worksheet
    On Error Resume Next: Set ws = ThisWorkbook.Worksheets(SHEET_NETWORK): On Error GoTo 0
    If ws Is Nothing Then
        MsgBox "네트웍구성도 시트를 찾을 수 없습니다.", vbExclamation, "격자 추가확장"
        Exit Sub
    End If

    Dim curX As Long: curX = 네트웍_격자_가로칸수()
    Dim curY As Long: curY = 네트웍_격자_세로칸수()
    Dim newX As Long: newX = curX
    Dim newY As Long: newY = curY
    Select Case dir
        Case "U", "D": newY = curY + count
        Case "L", "R": newX = curX + count
    End Select

    Dim dirLabel As String
    Select Case dir
        Case "U": dirLabel = "위쪽 ↑ (" & count & " 칸)"
        Case "D": dirLabel = "아래쪽 ↓ (" & count & " 칸)"
        Case "L": dirLabel = "왼쪽 ← (" & count & " 칸)"
        Case "R": dirLabel = "오른쪽 → (" & count & " 칸)"
    End Select

    Dim resp As Long
    resp = MsgBox("격자 추가확장 " & dirLabel & ":" & vbLf & vbLf & _
                  "  • 격자 " & curX & "×" & curY & " → " & newX & "×" & newY & vbLf & _
                  IIf(dir = "U" Or dir = "L", "  • 기존 도형이 안쪽으로 shift (offset 적용)", "  • 기존 도형 좌표 그대로") & vbLf & vbLf & _
                  "「격자 확장 되돌리기」 로 1 회 원복 가능. 계속할까요?", _
                  vbOKCancel + vbInformation, "격자 추가확장")
    If resp <> vbOK Then Exit Sub

    Dim wasProt As Boolean: wasProt = ws.ProtectContents Or ws.ProtectDrawingObjects
    On Error Resume Next: ws.Unprotect: On Error GoTo 0

    Dim oUpd As Boolean: oUpd = Application.ScreenUpdating
    Dim oEv As Boolean: oEv = Application.EnableEvents
    Application.ScreenUpdating = False
    Application.EnableEvents = False

    ' Undo 백업 (좌표 + 격자 칸수)
    격자_확장_Undo_백업 ws

    ' 격자 칸수 + 셀 크기 갱신 — shift 전 셀 크기는 동일
    Dim cw As Double: cw = ws.Cells(1, 1).Width
    Dim rh As Double: rh = ws.Cells(LEGEND_ROWS + 1, 1).Height   ' 격자 셀 높이 = 2행 (1행=검색바). owner 2026-06-10
    If cw <= 0 Then cw = CELL_PT
    If rh <= 0 Then rh = CELL_PT
    Dim gridW As Double: gridW = cw * 네트웍_격자_단위가로cells()
    Dim gridH As Double: gridH = rh * 네트웍_격자_단위세로cells()

    네트웍_격자_칸수_저장 newX, newY
    Dim newTotalCols As Long: newTotalCols = newX * 네트웍_격자_단위가로cells() + 1
    Dim newTotalRows As Long: newTotalRows = newY * 네트웍_격자_단위세로cells() + 1
    On Error Resume Next: UniformCellSize ws, newTotalCols, newTotalRows: On Error GoTo 0

    ' 상/좌 방향이면 도형 shift
    If dir = "U" Then
        네트웍_도형_좌표_변환 ws, 1#, 1#, 0#, gridH * count
    ElseIf dir = "L" Then
        네트웍_도형_좌표_변환 ws, 1#, 1#, gridW * count, 0#
    End If
    ' D/R 은 도형 좌표 변동 없음 — 격자만 확장

    네트웍_격자_생성
    On Error Resume Next: 네트웍_부속도형_정렬: On Error GoTo 0

    If wasProt Then ApplySheetProtection ws
    Application.EnableEvents = oEv
    Application.ScreenUpdating = oUpd

    MsgBox "격자 추가확장 " & dirLabel & " 완료." & vbLf & vbLf & _
           "  • 격자: " & curX & "×" & curY & " → " & newX & "×" & newY & vbLf & _
           "  • 영역: " & newTotalCols & " 열 × " & newTotalRows & " 행" & vbLf & vbLf & _
           "이상하면 「격자 확장 되돌리기」.", _
           vbInformation, "격자 추가확장"
End Sub

' Undo — 직전 좌표 + 격자 칸수 1 회 복원. 백업 row 클리어.
Public Sub 격자_확장_Undo()
    Dim ws As Worksheet
    On Error Resume Next: Set ws = ThisWorkbook.Worksheets(SHEET_NETWORK): On Error GoTo 0
    If ws Is Nothing Then
        MsgBox "네트웍구성도 시트를 찾을 수 없습니다.", vbExclamation, "격자 확장 되돌리기"
        Exit Sub
    End If

    Dim metaWs As Worksheet: Set metaWs = Nothing
    On Error Resume Next: Set metaWs = ThisWorkbook.Worksheets(META_PLACEMENT_UNDO): On Error GoTo 0
    If metaWs Is Nothing Then
        MsgBox "되돌릴 백업이 없습니다.", vbInformation, "격자 확장 되돌리기"
        Exit Sub
    End If
    If CStr(metaWs.Cells(1, 1).Value) <> "cells_x" Then
        MsgBox "되돌릴 백업이 없습니다.", vbInformation, "격자 확장 되돌리기"
        Exit Sub
    End If

    Dim resp As Long
    resp = MsgBox("직전 격자 확장을 되돌립니다." & vbLf & vbLf & _
                  "  • 모든 도형 좌표 + 격자 칸수 복원" & vbLf & vbLf & "계속할까요?", _
                  vbOKCancel + vbQuestion, "격자 확장 되돌리기")
    If resp <> vbOK Then Exit Sub

    Dim wasProt As Boolean: wasProt = ws.ProtectContents Or ws.ProtectDrawingObjects
    On Error Resume Next: ws.Unprotect: On Error GoTo 0

    Dim oUpd As Boolean: oUpd = Application.ScreenUpdating
    Application.ScreenUpdating = False

    Dim oldX As Long: oldX = CLng(metaWs.Cells(1, 2).Value)
    Dim oldY As Long: oldY = CLng(metaWs.Cells(1, 4).Value)
    네트웍_격자_칸수_저장 oldX, oldY
    Dim newTotalCols As Long: newTotalCols = oldX * 네트웍_격자_단위가로cells() + 1
    Dim newTotalRows As Long: newTotalRows = oldY * 네트웍_격자_단위세로cells() + 1
    On Error Resume Next: UniformCellSize ws, newTotalCols, newTotalRows: On Error GoTo 0

    Dim r As Long: r = 2
    Dim cnt As Long: cnt = 0
    Do While Len(CStr(metaWs.Cells(r, 1).Value)) > 0
        Dim nm As String: nm = CStr(metaWs.Cells(r, 1).Value)
        Dim lf As Double: lf = CDbl(metaWs.Cells(r, 2).Value)
        Dim tp As Double: tp = CDbl(metaWs.Cells(r, 3).Value)
        Dim shp As Shape: Set shp = Nothing
        On Error Resume Next: Set shp = ws.Shapes(nm): On Error GoTo 0
        If Not shp Is Nothing Then
            On Error Resume Next
            shp.Left = lf: shp.Top = tp
            cnt = cnt + 1
            On Error GoTo 0
        End If
        r = r + 1
    Loop

    네트웍_격자_생성
    On Error Resume Next: 네트웍_부속도형_정렬: On Error GoTo 0

    On Error Resume Next: metaWs.Cells.Clear: On Error GoTo 0

    If wasProt Then ApplySheetProtection ws
    Application.ScreenUpdating = oUpd

    MsgBox "격자 확장 되돌리기 완료." & vbLf & vbLf & _
           "  • 복원된 도형: " & cnt & "개" & vbLf & "  • 격자: " & oldX & "×" & oldY, _
           vbInformation, "격자 확장 되돌리기"
End Sub

' 네트웍구성도 부속 도형(배지·콤보·태그·케이블박스·케이블 재라우팅) 일괄 동기화 한 발.
'   owner 가 callout/시설물 위치 변경 후 셀 클릭/시트 전환을 안 한 경우, 패널 「부속 정렬」 버튼 또는 Alt+F8 로 즉시 호출.
Public Sub 네트웍_부속도형_정렬()
    Dim ws As Worksheet
    On Error Resume Next
    Set ws = ThisWorkbook.Worksheets(SHEET_NETWORK)
    On Error GoTo 0
    If ws Is Nothing Then Exit Sub

    네트웍_케이블_재라우팅 ws       ' 시설물 이동 시 케이블 connector 가 가장 가까운 site 로 자동 재배치
    시설물_leader_재라우팅 ws        ' 시설물 callout leader (연결선) 도 동일하게 재라우팅
    배지_위치_동기화 ws
    시설물_태그_위치_동기화 ws
    네트웍_케이블박스_동기화 ws
    선번화살표_재라우팅 ws            ' 코어 박스 이동 시 화살표 connector 가 풀려도 원래 박스에 자동 재부착
    Application.StatusBar = "네트웍구성도 부속 정렬 완료 (케이블·leader·박스·코어 화살표 재라우팅)."
End Sub

' 코어 박스 화살표 재라우팅 — 박스 이동·복사·일괄 작업으로 connector 가 끊겨도 원래 박스에 재부착.
'   화살표의 AlternativeText 에 "box1=<n>|box2=<m>" 영구 저장되어 있어 원본 박스 식별 가능.
'   각 화살표마다:
'     1) AlternativeText 에서 원본 box1·box2 이름 읽기
'     2) 현재 connector 가 그 박스들에 부착돼 있는지 확인 (Begin/EndConnectedShape 비교)
'     3) 풀려있거나 다른 도형에 잘못 부착되어 있으면 → BeginConnect/EndConnect 다시 호출
'     4) 부착 후 RerouteConnections — 박스 connection site 자동 재선택
'   원본 박스 중 하나가 삭제됐다면 그 화살표는 건드리지 않음 (orphan — owner 가 수동 삭제).
Public Sub 선번화살표_재라우팅(Optional wsArg As Worksheet)
    Dim ws As Worksheet
    If wsArg Is Nothing Then
        On Error Resume Next
        Set ws = ThisWorkbook.Worksheets(SHEET_NETWORK)
        On Error GoTo 0
    Else
        Set ws = wsArg
    End If
    If ws Is Nothing Then Exit Sub

    Dim wasProt As Boolean: wasProt = ws.ProtectContents Or ws.ProtectDrawingObjects
    On Error Resume Next
    ws.Unprotect
    On Error GoTo 0

    ' 모든 PREFIX_PAIRARROW 도형 이름을 먼저 수집 (enumeration 중 수정 위험 회피)
    Dim arrowsToProcess As Collection: Set arrowsToProcess = New Collection
    Dim shScan As Shape
    For Each shScan In ws.Shapes
        If Left(shScan.Name, Len(PREFIX_PAIRARROW)) = PREFIX_PAIRARROW Then
            arrowsToProcess.Add shScan.Name
        End If
    Next shScan

    Dim arrIdx As Long
    For arrIdx = 1 To arrowsToProcess.Count
        Dim arrName As String: arrName = arrowsToProcess(arrIdx)
        Dim sh As Shape: Set sh = Nothing
        On Error Resume Next
        Set sh = ws.Shapes(arrName)
        On Error GoTo 0
        If sh Is Nothing Then GoTo NextArrow

        Dim alt As String: alt = ""
        On Error Resume Next
        alt = sh.AlternativeText
        On Error GoTo 0
        If Len(alt) = 0 Then GoTo NextArrow

        ' AlternativeText 파싱 — "box1=...|box2=..."
        Dim box1Name As String, box2Name As String
        box1Name = "": box2Name = ""
        Dim parts() As String: parts = Split(alt, "|")
        Dim i As Long
        For i = LBound(parts) To UBound(parts)
            Dim kv As String: kv = parts(i)
            Dim eq As Long: eq = InStr(kv, "=")
            If eq > 0 Then
                Dim k As String: k = Left(kv, eq - 1)
                Dim v As String: v = Mid(kv, eq + 1)
                If k = "box1" Then box1Name = v
                If k = "box2" Then box2Name = v
            End If
        Next i

        If Len(box1Name) = 0 Or Len(box2Name) = 0 Then GoTo NextArrow

        Dim box1Shp As Shape, box2Shp As Shape
        Set box1Shp = Nothing: Set box2Shp = Nothing
        On Error Resume Next
        Set box1Shp = ws.Shapes(box1Name)
        Set box2Shp = ws.Shapes(box2Name)
        On Error GoTo 0
        If box1Shp Is Nothing Or box2Shp Is Nothing Then GoTo NextArrow

        ' 도형 종류 감지 — Connector 인지 Freeform 인지
        Dim isConnector As Boolean: isConnector = False
        On Error Resume Next
        Dim ctype As Long: ctype = sh.ConnectorFormat.Type
        If Err.Number = 0 And ctype > 0 Then isConnector = True
        Err.Clear
        On Error GoTo 0

        If isConnector Then
            ' Legacy Connector — BeginConnect/EndConnect 재부착
            Dim curBox1 As Shape, curBox2 As Shape
            Set curBox1 = Nothing: Set curBox2 = Nothing
            Dim isOK As Boolean: isOK = False
            On Error Resume Next
            Set curBox1 = sh.ConnectorFormat.BeginConnectedShape
            Set curBox2 = sh.ConnectorFormat.EndConnectedShape
            On Error GoTo 0
            If Not curBox1 Is Nothing And Not curBox2 Is Nothing Then
                If (curBox1.Name = box1Name And curBox2.Name = box2Name) Or _
                   (curBox1.Name = box2Name And curBox2.Name = box1Name) Then
                    isOK = True
                End If
            End If
            If Not isOK Then
                On Error Resume Next
                sh.ConnectorFormat.BeginDisconnect
                sh.ConnectorFormat.EndDisconnect
                sh.ConnectorFormat.BeginConnect box1Shp, 1
                sh.ConnectorFormat.EndConnect box2Shp, 1
                sh.RerouteConnections
                On Error GoTo 0
            End If
        Else
            ' Freeform 폴리라인 — 박스 위치 기준 경로 재계산 + 도형 재생성
            '   owner 요구: 박스 옮기면 화살표 따라옴 → 부속 정렬 누르면 동기화
            Dim box1Alt As String, box2Alt As String
            box1Alt = "": box2Alt = ""
            On Error Resume Next
            box1Alt = box1Shp.AlternativeText
            box2Alt = box2Shp.AlternativeText
            On Error GoTo 0

            Dim facId As String: facId = 선번박스_alt추출(box1Alt, "fac=")
            Dim cbl1Nm As String: cbl1Nm = 선번박스_alt추출(box1Alt, "cbl=")
            Dim cbl2Nm As String: cbl2Nm = 선번박스_alt추출(box2Alt, "cbl=")
            If Len(facId) = 0 Or Len(cbl1Nm) = 0 Or Len(cbl2Nm) = 0 Then GoTo NextArrow

            Dim facShp As Shape: Set facShp = Nothing
            On Error Resume Next
            Set facShp = ws.Shapes(facId)
            On Error GoTo 0
            If facShp Is Nothing Then GoTo NextArrow

            ' 사이드 타입 — cblNm = facId 면 facility 내부 박스, 그 외는 cable
            Dim sideType1 As String, sideType2 As String
            If cbl1Nm = facId Then sideType1 = "facility" Else sideType1 = "cable"
            If cbl2Nm = facId Then sideType2 = "facility" Else sideType2 = "cable"

            ' g_pt_facId 가 임시로 필요 (헬퍼 호출 안전망)
            Dim oldFacId As String: oldFacId = g_pt_facId
            g_pt_facId = facId

            Dim arrPts As Variant
            arrPts = 선번박스_경로_계산(ws, sideType1, cbl1Nm, box1Shp, sideType2, cbl2Nm, box2Shp, facShp)
            g_pt_facId = oldFacId

            ' Save styling
            Dim lineColor As Long, lineWeight As Double
            lineColor = 0: lineWeight = 0.5
            On Error Resume Next
            lineColor = sh.Line.ForeColor.RGB
            lineWeight = sh.Line.Weight
            On Error GoTo 0

            ' Delete + recreate
            On Error Resume Next
            sh.Delete
            On Error GoTo 0

            Dim newArr As Shape: Set newArr = 선번박스_화살표생성(ws, arrPts)
            If newArr Is Nothing Then GoTo NextArrow
            newArr.Name = arrName
            newArr.OnAction = ""
            newArr.Placement = 3
            On Error Resume Next
            newArr.AlternativeText = alt
            With newArr.Line
                .ForeColor.RGB = 0                                       ' owner — 검정
                .Weight = lineWeight
                .DashStyle = msoLineRoundDot                              ' owner — 둥근 점선
                .BeginArrowheadStyle = msoArrowheadTriangle
                .EndArrowheadStyle = msoArrowheadTriangle
            End With
            On Error GoTo 0
        End If
NextArrow:
    Next arrIdx

    If wasProt Then ApplySheetProtection ws
End Sub

' AlternativeText 에서 key= 다음 값 추출 ("fac=AAA|cbl=BBB" 형식)
Public Function 선번박스_alt추출(alt As String, key As String) As String
    선번박스_alt추출 = ""
    Dim p As Long: p = InStr(alt, key)
    If p = 0 Then Exit Function
    Dim startPos As Long: startPos = p + Len(key)
    Dim endPos As Long: endPos = InStr(startPos, alt, "|")
    If endPos = 0 Then endPos = Len(alt) + 1
    선번박스_alt추출 = Mid(alt, startPos, endPos - startPos)
End Function

' 네트웍구성도 모든 케이블 connector 의 RerouteConnections 호출 — 양 끝 시설물의 가장 가까운
'   connection site 로 자동 재부착. owner 가 시설물을 위→아래·우→좌 등으로 옮기면 케이블이
'   기존 site (예: Top=1) 에서 자동으로 이동 방향의 가까운 site (예: Bottom=3) 로 재배치됨.
Public Sub 네트웍_케이블_재라우팅(Optional wsArg As Worksheet)
    Dim ws As Worksheet
    If wsArg Is Nothing Then
        On Error Resume Next
        Set ws = ThisWorkbook.Worksheets(SHEET_NETWORK)
        On Error GoTo 0
    Else
        Set ws = wsArg
    End If
    If ws Is Nothing Then Exit Sub

    ' 메타에서 cblId → (from_id, to_id) 매핑 로드
    Dim wsMeta As Worksheet
    On Error Resume Next
    Set wsMeta = ThisWorkbook.Worksheets(SHEET_META_CBL)
    On Error GoTo 0
    If wsMeta Is Nothing Then Exit Sub
    Dim metaFrom As Object: Set metaFrom = CreateObject("Scripting.Dictionary")
    Dim metaTo As Object: Set metaTo = CreateObject("Scripting.Dictionary")
    Dim lastR As Long: lastR = wsMeta.Cells(wsMeta.Rows.Count, 1).End(xlUp).Row
    Dim r As Long, cId As String
    For r = 2 To lastR
        cId = CStr(wsMeta.Cells(r, 1).Value)
        If Len(cId) > 0 Then
            metaFrom(cId) = CStr(wsMeta.Cells(r, 2).Value)
            metaTo(cId) = CStr(wsMeta.Cells(r, 3).Value)
        End If
    Next r

    Dim wasProt As Boolean: wasProt = ws.ProtectContents Or ws.ProtectDrawingObjects
    On Error Resume Next
    ws.Unprotect
    On Error GoTo 0

    ' 각 케이블 line 의 양 끝을 시설물 「정 중앙」 으로 재설정 (owner 요구)
    '   AddLine 의 끝점 이동: BeginPoint/EndPoint set 안 됨 → Left/Top/Width/Height 재계산
    '   Shape.Line.Visible / Line.ForeColor 는 line 도형의 line 속성. 좌표는 도형의 bbox
    '   line 의 두 끝점은 (Left, Top) 과 (Left+Width, Top+Height) — 단 한쪽 끝이 다른 쪽보다 크면 flip
    '   가장 안전한 방식 — line 도형 삭제 후 동일 이름 + 색·두께로 재생성
    Dim sh As Shape, fromId As String, toId As String
    Dim toRebuild As Collection: Set toRebuild = New Collection
    For Each sh In ws.Shapes
        If Left(sh.Name, Len(PREFIX_CBL)) = PREFIX_CBL Then
            toRebuild.Add sh.Name
        End If
    Next sh
    Dim i As Long
    For i = 1 To toRebuild.Count
        Dim nm As String: nm = toRebuild(i)
        Dim oldLine As Shape: Set oldLine = Nothing
        On Error Resume Next
        Set oldLine = ws.Shapes(nm)
        On Error GoTo 0
        If oldLine Is Nothing Then GoTo NextCbl
        fromId = "": toId = ""
        If metaFrom.Exists(nm) Then fromId = CStr(metaFrom(nm))
        If metaTo.Exists(nm) Then toId = CStr(metaTo(nm))
        If Len(fromId) = 0 Or Len(toId) = 0 Then GoTo NextCbl
        Dim fSh As Shape, tSh As Shape
        Set fSh = Nothing: Set tSh = Nothing
        On Error Resume Next
        Set fSh = ws.Shapes(fromId)
        Set tSh = ws.Shapes(toId)
        On Error GoTo 0
        If fSh Is Nothing Or tSh Is Nothing Then GoTo NextCbl
        Dim lc As Long: lc = 0
        Dim lwt As Double: lwt = 1
        On Error Resume Next
        lc = oldLine.Line.ForeColor.RGB
        lwt = oldLine.Line.Weight
        On Error GoTo 0
        Dim fcx As Double, fcy As Double, tcx As Double, tcy As Double
        fcx = fSh.Left + fSh.Width / 2: fcy = fSh.Top + fSh.Height / 2
        tcx = tSh.Left + tSh.Width / 2: tcy = tSh.Top + tSh.Height / 2
        ' 이미 정 중앙에 있으면 skip (line 양 끝과 일치)
        Dim curX1 As Double, curY1 As Double, curX2 As Double, curY2 As Double
        curX1 = oldLine.Left: curY1 = oldLine.Top
        curX2 = oldLine.Left + oldLine.Width: curY2 = oldLine.Top + oldLine.Height
        Dim aligned As Boolean
        aligned = (Abs(curX1 - fcx) < 0.5 And Abs(curY1 - fcy) < 0.5 And _
                   Abs(curX2 - tcx) < 0.5 And Abs(curY2 - tcy) < 0.5) Or _
                  (Abs(curX1 - tcx) < 0.5 And Abs(curY1 - tcy) < 0.5 And _
                   Abs(curX2 - fcx) < 0.5 And Abs(curY2 - fcy) < 0.5)
        If aligned Then GoTo NextCbl
        ' 재생성 — line 끝점 직접 set 불가 (AutoShape 와 달리) → 삭제 후 새로 그림
        oldLine.Delete
        Dim newLine As Shape
        Set newLine = ws.Shapes.AddLine(fcx, fcy, tcx, tcy)
        newLine.Name = nm
        newLine.OnAction = ""
        newLine.Placement = 3
        newLine.Line.ForeColor.RGB = lc
        newLine.Line.Weight = lwt
        ' owner 2026-06-09 (8-125-fix13): 철거 X 마크 추종 — 네트웍 케이블은 정의상 양 끝 시설물 (True, True)
        On Error Resume Next
        철거_X마크_케이블_갱신 ws, newLine, True, True
        On Error GoTo 0
NextCbl:
    Next i
    ' 케이블 재생성·기존 배치 모두 「맨 뒤」 로 — 시설물·배지·설명선 위에 케이블이 덮이지 않게 (owner 요구)
    '   레이어_정리_시트 가 전체 순서를 재정렬 (배경 < 케이블 < 시설물 < 설명선 < 범례 < 버튼)
    레이어_정리_시트 ws
    If wasProt Then ApplySheetProtection ws
End Sub

' 행정도 케이블의 양 끝점이 항상 from/to 시설물 중심을 따라가게 동기화.
'   메타(_케이블) 의 from_id/to_id 로 매핑 → 시설물 도형 현재 좌표 → Freeform 의 1번/마지막 노드 갱신.
'   중간 노드(waypoints) 는 사용자가 그린 그대로 보존. 시설물 끝점 매칭 안 된 케이블은 그대로 두기.
'   시트_셀_클릭·시트_활성화 가 호출 — 시설물 드래그 후 다른 셀 클릭 시점에 따라잡음.
Public Sub 행정도_케이블_시설물_추종(Optional wsArg As Worksheet)
    Dim ws As Worksheet
    If wsArg Is Nothing Then
        On Error Resume Next
        Set ws = ThisWorkbook.Worksheets(SHEET_ADMIN)
        On Error GoTo 0
    Else
        Set ws = wsArg
    End If
    If ws Is Nothing Then Exit Sub
    If ws.Name <> SHEET_ADMIN Then Exit Sub

    ' 메타 — cblId → (from_id, to_id)
    Dim wsMeta As Worksheet
    On Error Resume Next
    Set wsMeta = ThisWorkbook.Worksheets(SHEET_META_CBL)
    On Error GoTo 0
    If wsMeta Is Nothing Then Exit Sub
    Dim metaFrom As Object: Set metaFrom = CreateObject("Scripting.Dictionary")
    Dim metaTo As Object: Set metaTo = CreateObject("Scripting.Dictionary")
    Dim lastR As Long: lastR = wsMeta.Cells(wsMeta.Rows.Count, 1).End(xlUp).Row
    Dim r As Long, cId As String
    For r = 2 To lastR
        cId = CStr(wsMeta.Cells(r, 1).Value)
        If Len(cId) > 0 Then
            metaFrom(cId) = CStr(wsMeta.Cells(r, 2).Value)
            metaTo(cId) = CStr(wsMeta.Cells(r, 3).Value)
        End If
    Next r

    Dim wasProt As Boolean: wasProt = ws.ProtectContents Or ws.ProtectDrawingObjects
    On Error Resume Next
    ws.Unprotect
    On Error GoTo 0

    ' owner 2026-06-09 (8-125-fix13): cblIds 수집 후 post-loop 처리 — For Each 중 도형 추가 회피
    Dim cblIdsToRefresh As Collection: Set cblIdsToRefresh = New Collection
    Dim sh As Shape
    For Each sh In ws.Shapes
        If Left(sh.Name, Len(PREFIX_CBL)) = PREFIX_CBL Then
            Dim fromId As String: fromId = ""
            Dim toId As String: toId = ""
            If metaFrom.Exists(sh.Name) Then fromId = CStr(metaFrom(sh.Name))
            If metaTo.Exists(sh.Name) Then toId = CStr(metaTo(sh.Name))
            ' Freeform 만 노드 갱신 가능 (커넥터는 BeginConnect 가 자동)
            Dim ncBl As Long: ncBl = 0
            On Error Resume Next
            ncBl = sh.Nodes.Count
            On Error GoTo 0
            If ncBl >= 2 Then
                If Len(fromId) > 0 Then
                    Dim sfac As Shape
                    Set sfac = Nothing
                    On Error Resume Next
                    Set sfac = ws.Shapes(fromId)
                    On Error GoTo 0
                    If Not sfac Is Nothing Then
                        On Error Resume Next
                        sh.Nodes.SetPosition 1, sfac.Left + sfac.Width / 2, sfac.Top + sfac.Height / 2
                        On Error GoTo 0
                    End If
                End If
                If Len(toId) > 0 Then
                    Dim tfac As Shape
                    Set tfac = Nothing
                    On Error Resume Next
                    Set tfac = ws.Shapes(toId)
                    On Error GoTo 0
                    If Not tfac Is Nothing Then
                        On Error Resume Next
                        sh.Nodes.SetPosition ncBl, tfac.Left + tfac.Width / 2, tfac.Top + tfac.Height / 2
                        On Error GoTo 0
                    End If
                End If
                cblIdsToRefresh.Add sh.Name
            End If
        End If
    Next sh

    ' Post-loop — X 마크 갱신 (X 없는 케이블은 자동 skip)
    Dim k As Long
    For k = 1 To cblIdsToRefresh.Count
        Dim curId As String: curId = CStr(cblIdsToRefresh(k))
        Dim shCbl As Shape: Set shCbl = Nothing
        On Error Resume Next: Set shCbl = ws.Shapes(curId): On Error GoTo 0
        If Not shCbl Is Nothing Then
            Dim fId As String: fId = ""
            Dim tId As String: tId = ""
            If metaFrom.Exists(curId) Then fId = CStr(metaFrom(curId))
            If metaTo.Exists(curId) Then tId = CStr(metaTo(curId))
            On Error Resume Next
            철거_X마크_케이블_갱신 ws, shCbl, Len(fId) > 0, Len(tId) > 0
            On Error GoTo 0
        End If
    Next k

    If wasProt Then ApplySheetProtection ws
End Sub

' 행정도 케이블 callout(말풍선) 의 꼬리가 항상 케이블 「중앙」 을 가리키게 재정렬.
'   사용자가 케이블 옮기면 박스 위치는 그대로 + 꼬리(Adjustments)를 케이블 새 중앙으로.
'   Adjustments(1)·(2) = 박스 중심 기준 상대 오프셋 (1 = 박스 폭/높이 단위)
Public Sub 행정도_케이블_꼬리_재정렬(Optional wsArg As Worksheet)
    Dim ws As Worksheet
    If wsArg Is Nothing Then
        On Error Resume Next
        Set ws = ThisWorkbook.Worksheets(SHEET_ADMIN)
        On Error GoTo 0
    Else
        Set ws = wsArg
    End If
    If ws Is Nothing Then Exit Sub
    If ws.Name <> SHEET_ADMIN Then Exit Sub

    Dim wasProt As Boolean: wasProt = ws.ProtectContents Or ws.ProtectDrawingObjects
    On Error Resume Next
    ws.Unprotect
    On Error GoTo 0

    Dim sh As Shape
    For Each sh In ws.Shapes
        If Left(sh.Name, Len(PREFIX_LABEL)) = PREFIX_LABEL Then
            ' 케이블 callout 인지 (이름이 「lbl_」 + 「cbl_」 + id)
            If Len(sh.Name) >= Len(PREFIX_LABEL) + Len(PREFIX_CBL) Then
                If Mid(sh.Name, Len(PREFIX_LABEL) + 1, Len(PREFIX_CBL)) = PREFIX_CBL Then
                    Dim cblId As String: cblId = Mid(sh.Name, Len(PREFIX_LABEL) + 1)
                    Dim cbl As Shape
                    Set cbl = Nothing
                    On Error Resume Next
                    Set cbl = ws.Shapes(cblId)
                    On Error GoTo 0
                    If Not cbl Is Nothing Then
                        Dim pt As Variant: pt = CableCenterPoint(cbl)
                        If IsArray(pt) Then
                            Dim mx As Double, my As Double
                            mx = CDbl(pt(0)): my = CDbl(pt(1))
                            Dim boxCx As Double, boxCy As Double
                            boxCx = sh.Left + sh.Width / 2
                            boxCy = sh.Top + sh.Height / 2
                            On Error Resume Next
                            If sh.Width > 0 Then sh.Adjustments(1) = (mx - boxCx) / sh.Width
                            If sh.Height > 0 Then sh.Adjustments(2) = (my - boxCy) / sh.Height
                            On Error GoTo 0
                        End If
                    End If
                End If
            End If
        End If
    Next sh
    If wasProt Then ApplySheetProtection ws
End Sub

' owner 2026-06-10: 행정도 시설물 이동 시 설명박스(callout) 가 '이동한 만큼만' 따라오게 (delta 방식).
'   시설물 안 움직이고 callout 위치만 조정하면 그 위치 보존 (절대 재배치 X — owner 정정).
'   네트웍 시설물_태그_위치_동기화 의 _lpos delta 방식을 행정도 callout 에 그대로 적용.
'   시설물 AlternativeText 의 "_lpos=X,Y" 에 직전 위치 저장 → 매 셀 클릭 시 현재 위치와 비교해 delta 적용.
Public Sub 행정도_시설물_callout_추종(ws As Worksheet)
    If ws Is Nothing Then Exit Sub
    Dim sh As Shape
    For Each sh In ws.Shapes
        If Left(sh.Name, Len(PREFIX_FAC)) <> PREFIX_FAC Then GoTo NextFac
        Dim callout As Shape: Set callout = Nothing
        On Error Resume Next: Set callout = ws.Shapes(PREFIX_LABEL & sh.Name): On Error GoTo 0
        If callout Is Nothing Then GoTo NextFac

        Dim facAlt As String: facAlt = ""
        On Error Resume Next: facAlt = sh.AlternativeText: On Error GoTo 0
        Dim pLpos As Long: pLpos = InStr(facAlt, "_lpos=")
        If pLpos > 0 Then
            Dim lposEnd As Long: lposEnd = InStr(pLpos, facAlt, "|")
            If lposEnd = 0 Then lposEnd = Len(facAlt) + 1
            Dim lposVal As String: lposVal = Mid(facAlt, pLpos + 6, lposEnd - (pLpos + 6))
            Dim commaP As Long: commaP = InStr(lposVal, ",")
            If commaP > 0 Then
                Dim lastFX As Double, lastFY As Double
                lastFX = CDbl(Left(lposVal, commaP - 1))
                lastFY = CDbl(Mid(lposVal, commaP + 1))
                Dim dx As Double: dx = sh.Left - lastFX
                Dim dy As Double: dy = sh.Top - lastFY
                ' 시설물이 실제로 이동했을 때만 callout 같은 delta 이동 (안 움직이면 callout 보존)
                If Abs(dx) > 0.5 Or Abs(dy) > 0.5 Then
                    On Error Resume Next
                    callout.Left = callout.Left + dx
                    callout.Top = callout.Top + dy
                    On Error GoTo 0
                End If
            End If
        End If
        ' 현재 시설물 위치 저장 (_lpos= 만 갱신, alt 의 나머지 보존)
        Dim newAlt As String
        If pLpos > 0 Then
            Dim p2 As Long: p2 = InStr(pLpos, facAlt, "|")
            If p2 = 0 Then
                newAlt = Left(facAlt, pLpos - 1) & "_lpos=" & sh.Left & "," & sh.Top
            Else
                newAlt = Left(facAlt, pLpos - 1) & "_lpos=" & sh.Left & "," & sh.Top & Mid(facAlt, p2)
            End If
            If Right(newAlt, 1) = "|" Then newAlt = Left(newAlt, Len(newAlt) - 1)
        Else
            If Len(facAlt) > 0 Then
                newAlt = facAlt & "|_lpos=" & sh.Left & "," & sh.Top
            Else
                newAlt = "_lpos=" & sh.Left & "," & sh.Top
            End If
        End If
        On Error Resume Next: sh.AlternativeText = newAlt: On Error GoTo 0
NextFac:
    Next sh
End Sub

' 시설물 callout leader(연결선) 의 RerouteConnections 호출 — 시설물 이동 시 leader 가 새 가까운 site 로 자동.
'   owner: 시설물 위치 변경 시 callout 연결선(시설물 ↔ 박스) 도 변경된 방향으로 따라가야.
Public Sub 시설물_leader_재라우팅(Optional wsArg As Worksheet)
    Dim ws As Worksheet
    If wsArg Is Nothing Then
        On Error Resume Next
        Set ws = ThisWorkbook.Worksheets(SHEET_NETWORK)
        On Error GoTo 0
    Else
        Set ws = wsArg
    End If
    If ws Is Nothing Then Exit Sub

    Dim wasProt As Boolean: wasProt = ws.ProtectContents Or ws.ProtectDrawingObjects
    On Error Resume Next
    ws.Unprotect
    On Error GoTo 0

    Dim sh As Shape, facId As String, fac As Shape, tb As Shape
    For Each sh In ws.Shapes
        If Left(sh.Name, Len(PREFIX_LEADER)) = PREFIX_LEADER Then
            facId = Mid(sh.Name, Len(PREFIX_LEADER) + 1)
            Set fac = Nothing: Set tb = Nothing
            On Error Resume Next
            Set fac = ws.Shapes(facId)
            Set tb = ws.Shapes(PREFIX_LABEL & facId)
            On Error GoTo 0
            ' owner 재요청 — leader 투명 강제 (이전 가시화 코드 잔재 leader 도 매번 투명화)
            On Error Resume Next
            sh.Line.Visible = msoFalse
            sh.Line.Transparency = 1
            On Error GoTo 0
            ' 시설물·박스 위치 비교 후 좌/우 site 동적 부착 (없으면 Excel 기본 reroute)
            If Not fac Is Nothing And Not tb Is Nothing Then
                시설물_leader_site설정 sh, fac, tb
            Else
                On Error Resume Next
                sh.RerouteConnections
                On Error GoTo 0
            End If
        End If
    Next sh
    If wasProt Then ApplySheetProtection ws
End Sub

' leader 의 양 끝 부착점 설정 — 시설물 정중앙 ↔ 박스 가까운 모서리 (owner 요구).
'   기존: connector 의 BeginConnect/EndConnect 가 도형 외곽 site 만 지원 → 시설물 가장자리에서 leader 시작.
'   신규: connector endpoint 가 시설물 정중앙 좌표가 되도록 매번 강제. 시설물 내부 부분은 도형에 가려져 안 보임.
'        박스 쪽 끝점도 박스 외곽이 아니라 박스 정중앙 — leader 의 외부에 보이는 부분은 박스 모서리에서 시설물 가장자리까지로 자연스러움.
Public Sub 시설물_leader_site설정(cn As Shape, fac As Shape, tb As Shape)
    On Error Resume Next
    ' 1) connector attach 끊기 — 좌표 직접 set 위해
    cn.ConnectorFormat.BeginDisconnect
    cn.ConnectorFormat.EndDisconnect
    ' 2) endpoint 좌표 직접 set — 시설물 정중앙 ↔ 박스 정중앙
    Dim facCx As Double, facCy As Double
    facCx = fac.Left + fac.Width / 2
    facCy = fac.Top + fac.Height / 2
    Dim tbCx As Double, tbCy As Double
    tbCx = tb.Left + tb.Width / 2
    tbCy = tb.Top + tb.Height / 2
    ' VBA 의 connector 는 BeginX/Y, EndX/Y 직접 set 불가 → 도형 크기·위치 변경으로 endpoint 이동
    '   AddLine 의 BoundingBox 가 endpoint 좌표 그 자체 — Left/Top/Width/Height 로 양 끝점 결정
    Dim minX As Double, minY As Double, maxX As Double, maxY As Double
    If facCx < tbCx Then minX = facCx: maxX = tbCx Else minX = tbCx: maxX = facCx
    If facCy < tbCy Then minY = facCy: maxY = tbCy Else minY = tbCy: maxY = facCy
    cn.Left = minX
    cn.Top = minY
    cn.Width = maxX - minX
    cn.Height = maxY - minY
    ' Flip 으로 endpoint 방향 결정 — (Left,Top) → (Right,Bottom) 또는 (Right,Top) → (Left,Bottom)
    If (facCx <= tbCx And facCy > tbCy) Or (facCx > tbCx And facCy <= tbCy) Then
        cn.Rotation = 0
        cn.Flip msoFlipVertical
    End If
    On Error GoTo 0
End Sub


'   - 시설물 이동 → connector 자동 reroute → 케이블 중심 이동했을 때 박스가 따라옴.
'   - 시트_셀_클릭(SheetSelectionChange) 와 정보_적용 가 호출.
Public Sub 네트웍_케이블박스_동기화(Optional wsArg As Worksheet)
    Dim ws As Worksheet
    If wsArg Is Nothing Then
        On Error Resume Next
        Set ws = ThisWorkbook.Worksheets(SHEET_NETWORK)
        On Error GoTo 0
    Else
        Set ws = wsArg
    End If
    If ws Is Nothing Then Exit Sub
    If ws.Name <> SHEET_NETWORK Then Exit Sub

    Dim wasProt As Boolean: wasProt = ws.ProtectContents Or ws.ProtectDrawingObjects
    On Error Resume Next
    ws.Unprotect
    On Error GoTo 0

    Dim sh As Shape, cblId As String, box As Shape, pt As Variant
    For Each sh In ws.Shapes
        If Left(sh.Name, Len(PREFIX_CBL)) = PREFIX_CBL Then
            cblId = sh.Name
            Set box = Nothing
            On Error Resume Next
            Set box = ws.Shapes(PREFIX_LABEL & cblId)
            On Error GoTo 0
            If Not box Is Nothing Then
                pt = CableCenterPoint(sh)
                On Error Resume Next
                box.Left = CDbl(pt(0)) - box.Width / 2
                box.Top = CDbl(pt(1)) - box.Height / 2
                On Error GoTo 0
            End If
        End If
    Next sh

    If wasProt Then ApplySheetProtection ws
End Sub

' 네트웍구성도 전용 — 케이블 중앙에 노란 사각형 텍스트박스 (꼬리 없음).
'   텍스트 = "ID/{spec}". ID 는 사용자가 더블클릭해 직접 수정, spec 은 호출부에서 범례 선택값 자동.
'   이름 lbl_<cblId> (케이블_삭제 가 함께 제거).
Public Sub AddCableCalloutBox(ws As Worksheet, cbl As Shape, cblId As String, spec As String)
    Dim existing As Shape
    On Error Resume Next
    Set existing = ws.Shapes(PREFIX_LABEL & cblId)
    On Error GoTo 0
    If Not existing Is Nothing Then Exit Sub

    On Error GoTo BoxErr

    ' 케이블 중간점 — 자유형/polyline 이면 가운데 노드, 아니면 bbox 중심
    Dim mx As Double, my As Double, got As Boolean
    Dim ncx As Long: ncx = 0
    On Error Resume Next
    ncx = cbl.Nodes.Count
    On Error GoTo 0
    If ncx >= 1 Then
        Dim midIdx As Long: midIdx = (ncx + 1) \ 2
        If midIdx < 1 Then midIdx = 1
        Dim pmid As Variant
        On Error Resume Next
        pmid = cbl.Nodes(midIdx).Points
        On Error GoTo 0
        If Not IsEmpty(pmid) Then mx = CDbl(pmid(1, 1)): my = CDbl(pmid(1, 2)): got = True
    End If
    If Not got Then
        mx = cbl.Left + cbl.Width / 2
        my = cbl.Top + cbl.Height / 2
    End If

    ' 박스 중앙이 케이블 중간점에 오도록 (꼬리 없음). 높이는 직전 × 2/3 또 줄임 (owner 누적)
    Dim bw As Double: bw = LABEL_W * 2 / 3
    Dim bh As Double: bh = LABEL_H / 3 * 2 / 3 * 2 / 3      ' LABEL × 4/27
    Dim bx As Double: bx = mx - bw / 2
    Dim byy As Double: byy = my - bh / 2
    Dim topLimit As Double: topLimit = ws.Cells(LEGEND_ROWS + 1, 1).Top
    If byy < topLimit Then byy = topLimit

    ' owner 요구 — 윤곽선 없음 + 채우기 없음 + 글자 검정 (신설·기설 통일)
    Dim box As Shape
    Set box = ws.Shapes.AddShape(msoShapeRectangle, bx, byy, bw, bh)
    box.Name = PREFIX_LABEL & cblId
    box.Placement = 3
    box.Locked = False
    box.Fill.Visible = msoFalse                       ' 채우기 없음
    box.Line.Visible = msoFalse                       ' 윤곽선 없음

    On Error Resume Next
    With box.TextFrame2
        .WordWrap = msoFalse
        .AutoSize = msoAutoSizeNone                   ' 박스 크기 강제 (직전 1/3 * 2/3 = LABEL 의 2/9). 사용자가 직접 조정 가능
        .VerticalAnchor = msoAnchorMiddle
        .MarginLeft = 2: .MarginRight = 2: .MarginTop = 0: .MarginBottom = 0
        .TextRange.Text = "선로ID"                       ' 1줄 템플릿 — 사용자가 더블클릭해 실제 선로ID 로 수정
        .TextRange.Font.Name = CALLOUT_FONT_NAME
        .TextRange.Font.Size = 6
        .TextRange.Font.Bold = True
        .TextRange.Font.Fill.ForeColor.RGB = RGB(0, 0, 0)
        .TextRange.ParagraphFormat.Alignment = 2
    End With
    On Error GoTo 0

    ' 다른 callout 과 겹치면 빈 자리로 자동 이동
    callout_겹침회피 ws, box, box.Name
    Exit Sub

BoxErr:
End Sub

' 케이블 설명선 — 「말풍선:모서리가 둥근 사각형」(msoShapeRoundedRectangularCallout, 노랑 배경)
'   을 케이블 「중간점」 위에 부착. 꼬리가 아래(중간점)를 향함.
'   - 이름 lbl_<cblId> (케이블_삭제 가 함께 제거).
Public Sub AddCableCallout(ws As Worksheet, cbl As Shape, cblId As String, Optional labelText As String = "", Optional legendLabel As String = "")
    Dim existing As Shape
    On Error Resume Next
    Set existing = ws.Shapes(PREFIX_LABEL & cblId)
    On Error GoTo 0
    If Not existing Is Nothing Then Exit Sub

    On Error GoTo CcErr

    ' 케이블 중간점 — 자유형이면 가운데 노드, 아니면 bbox 중심
    Dim mx As Double, my As Double, got As Boolean
    Dim ncx As Long: ncx = 0
    On Error Resume Next
    ncx = cbl.Nodes.Count
    On Error GoTo 0
    If ncx >= 1 Then
        Dim midIdx As Long: midIdx = (ncx + 1) \ 2
        If midIdx < 1 Then midIdx = 1
        Dim pmid As Variant
        On Error Resume Next
        pmid = cbl.Nodes(midIdx).Points
        On Error GoTo 0
        If Not IsEmpty(pmid) Then mx = CDbl(pmid(1, 1)): my = CDbl(pmid(1, 2)): got = True
    End If
    If Not got Then
        mx = cbl.Left + cbl.Width / 2
        my = cbl.Top + cbl.Height / 2
    End If

    ' 박스를 중간점 위에 놓고 꼬리가 아래 (중간점) 방향. 박스 폭 LABEL_W × 높이 LABEL_H.
    ' owner 2026-06-08 (8-86): 케이블 바로 위 (gap 0) — 기존 16pt 떨어진 거 → 바로 위.
    '   박스 바닥 = 케이블 중간점. 꼬리는 Adjustments(2)=1.8 로 살짝 더 아래까지 내려가 케이블에 닿음.
    Dim bw As Double: bw = LABEL_W
    Dim bh As Double: bh = LABEL_H
    Dim bx As Double: bx = mx - bw / 2
    Dim byy As Double: byy = my - bh
    Dim topLimit As Double: topLimit = ws.Cells(LEGEND_ROWS + 1, 1).Top
    If byy < topLimit Then byy = topLimit

    ' owner 요구 — 신설·기설 모두 윤곽선·글자 검정 + 0.75pt 통일
    Dim cblLineColor As Long: cblLineColor = RGB(0, 0, 0)
    Dim cblTextColor As Long: cblTextColor = RGB(0, 0, 0)

    Dim cal As Shape
    Set cal = ws.Shapes.AddShape(msoShapeRoundedRectangularCallout, bx, byy, bw, bh)
    cal.Name = PREFIX_LABEL & cblId
    cal.Placement = 3
    cal.Locked = False
    cal.Fill.Visible = msoTrue
    cal.Fill.ForeColor.RGB = RGB(255, 235, 59)        ' 노랑 바탕 (네트웍구성도 callout 과 동일)
    cal.Line.Visible = msoTrue
    cal.Line.ForeColor.RGB = cblLineColor
    cal.Line.Weight = 0.75                            ' 윤곽선 3/4t (신설·기설 통일)
    ' Adjustments — RoundedRectangularCallout 의 꼬리 위치 (1=수평 0=가운데, 2=수직 1.8=아래)
    On Error Resume Next
    cal.Adjustments(1) = 0
    cal.Adjustments(2) = 1.8
    On Error GoTo 0
    On Error Resume Next
    With cal.TextFrame2
        .WordWrap = msoFalse
        .AutoSize = msoAutoSizeShapeToFitText        ' 글자 크기에 맞춰 박스 자동
        .VerticalAnchor = msoAnchorMiddle
        ' owner 2026-06-07 (8-71): 행정도 케이블 설명선 박스 여백 상·하·좌·우 0
        .MarginLeft = 0: .MarginRight = 0: .MarginTop = 0: .MarginBottom = 0
        .TextRange.Text = labelText
        .TextRange.Font.Name = CALLOUT_FONT_NAME
        .TextRange.Font.Size = 7
        .TextRange.Font.Bold = True
        .TextRange.Font.Fill.ForeColor.RGB = cblTextColor
        .TextRange.ParagraphFormat.Alignment = 2
    End With
    On Error GoTo 0

    ' 다른 callout 과 겹치면 빈 자리로 자동 이동
    callout_겹침회피 ws, cal, cal.Name
    Exit Sub

CcErr:
End Sub

' ============================================================================
'  6. 케이블 그리기
' ============================================================================
Public Sub DrawCable(fromId As String, toId As String, spec As String, waypoints As Collection)
    Dim wsAd As Worksheet: Set wsAd = ThisWorkbook.Worksheets(SHEET_ADMIN)
    Dim wsNw As Worksheet: Set wsNw = ThisWorkbook.Worksheets(SHEET_NETWORK)

    Dim shFrom As Shape: Set shFrom = wsAd.Shapes(fromId)
    Dim shTo As Shape: Set shTo = wsAd.Shapes(toId)

    Dim cblId As String: cblId = PREFIX_CBL & NewId8()

    ' 점 배열: 시작 중심 + 경로점들 + 도착 중심
    Dim n As Long: n = 2
    If Not waypoints Is Nothing Then n = n + waypoints.Count

    Dim pts() As Double
    ReDim pts(1 To n, 1 To 2)
    pts(1, 1) = shFrom.Left + shFrom.Width / 2
    pts(1, 2) = shFrom.Top + shFrom.Height / 2

    Dim i As Long
    If Not waypoints Is Nothing Then
        For i = 1 To waypoints.Count
            pts(i + 1, 1) = waypoints(i)(0)
            pts(i + 1, 2) = waypoints(i)(1)
        Next i
    End If

    pts(n, 1) = shTo.Left + shTo.Width / 2
    pts(n, 2) = shTo.Top + shTo.Height / 2

    ' 행정도 Polyline
    Dim shAd As Shape: Set shAd = wsAd.Shapes.AddPolyline(pts)
    shAd.Name = cblId
    shAd.OnAction = ""            ' OnAction 없음 → 선택·삭제(Del) 가능
    On Error Resume Next
    shAd.Line.Weight = CBL_LINE_WEIGHT
    shAd.Line.ForeColor.RGB = CBL_DEFAULT_COLOR
    On Error GoTo 0

    ' 네트웍구성도 — 직선 1개 (waypoint 분리)
    Dim shFromNw As Shape, shToNw As Shape
    On Error Resume Next
    Set shFromNw = wsNw.Shapes(fromId)
    Set shToNw = wsNw.Shapes(toId)
    On Error GoTo 0

    If Not shFromNw Is Nothing And Not shToNw Is Nothing Then
        Dim pts2(1 To 2, 1 To 2) As Double
        pts2(1, 1) = shFromNw.Left + shFromNw.Width / 2
        pts2(1, 2) = shFromNw.Top + shFromNw.Height / 2
        pts2(2, 1) = shToNw.Left + shToNw.Width / 2
        pts2(2, 2) = shToNw.Top + shToNw.Height / 2

        Dim shNw As Shape: Set shNw = wsNw.Shapes.AddPolyline(pts2)
        shNw.Name = cblId
        shNw.OnAction = ""            ' OnAction 없음 → 선택·삭제(Del) 가능
        On Error Resume Next
        shNw.Line.Weight = CBL_LINE_WEIGHT
        shNw.Line.ForeColor.RGB = CBL_DEFAULT_COLOR
        On Error GoTo 0
    End If

    ' 메타 저장
    Dim wpCsv As String: wpCsv = ""
    If Not waypoints Is Nothing Then
        For i = 1 To waypoints.Count
            wpCsv = wpCsv & waypoints(i)(0) & "," & waypoints(i)(1)
            If i < waypoints.Count Then wpCsv = wpCsv & ";"
        Next i
    End If
    AppendMetaRow SHEET_META_CBL, Array(cblId, fromId, toId, spec, wpCsv, Now)
End Sub

' ============================================================================
'  7. 정보 표시 + 삭제 (1단계: MsgBox 기반. 추후 우측 패널 도형으로 보완)
' ============================================================================
Public Sub Show시설물_정보(facId As String)
    Dim row As Variant: row = MetaFindRow(SHEET_META_FAC, 1, facId)
    If IsEmpty(row) Then
        MsgBox "메타 데이터를 찾지 못했습니다: " & facId, vbExclamation
        Exit Sub
    End If

    Dim cblCount As Long: cblCount = CountRelatedCables(facId)

    Dim ans As VbMsgBoxResult
    If cblCount = 0 Then
        ' 연결 케이블 없음 — 단순 Yes/No 확인
        ans = MsgBox("시설물 정보" & vbLf & vbLf & _
                     "이름: " & row(3) & vbLf & _
                     "종류: " & row(2) & vbLf & _
                     "연결 케이블: 0 개" & vbLf & vbLf & _
                     "이 시설물을 삭제하시겠습니까?", _
                     vbYesNo + vbQuestion, "시설물 정보")
        If ans = vbYes Then 시설물_삭제 facId
    Else
        ' 연결 케이블 있음 — 3가지 선택 (예=함께 / 아니요=시설물만 / 취소)
        ans = MsgBox("시설물 정보" & vbLf & vbLf & _
                     "이름: " & row(3) & vbLf & _
                     "종류: " & row(2) & vbLf & _
                     "연결 케이블: " & cblCount & " 개" & vbLf & vbLf & _
                     "삭제 방식을 선택하세요:" & vbLf & vbLf & _
                     "  [예] = 시설물 + 케이블 " & cblCount & " 개 모두 삭제" & vbLf & _
                     "  [아니요] = 시설물만 삭제 (케이블 " & cblCount & " 개 유지)" & vbLf & _
                     "  [취소] = 삭제 안 함", _
                     vbYesNoCancel + vbQuestion, "시설물 정보")
        Select Case ans
            Case vbYes:    시설물_삭제 facId               ' 기존 cascade
            Case vbNo:     시설물_삭제_단독 facId          ' 시설물만 — 케이블 유지
            Case vbCancel  ' 아무것도 안 함
        End Select
    End If
End Sub

Public Sub Show케이블_정보(cblId As String)
    Dim row As Variant: row = MetaFindRow(SHEET_META_CBL, 1, cblId)
    If IsEmpty(row) Then
        MsgBox "메타 데이터를 찾지 못했습니다: " & cblId, vbExclamation
        Exit Sub
    End If

    Dim fromName As String, toName As String
    fromName = MetaLookupName(SHEET_META_FAC, CStr(row(2)))
    toName = MetaLookupName(SHEET_META_FAC, CStr(row(3)))

    Dim ans As VbMsgBoxResult
    ans = MsgBox("케이블 정보" & vbLf & vbLf & _
                 "규격: " & row(4) & vbLf & _
                 "시작: " & fromName & vbLf & _
                 "도착: " & toName & vbLf & vbLf & _
                 "이 케이블을 삭제하시겠습니까?", _
                 vbYesNo + vbQuestion, "케이블 정보")
    If ans = vbYes Then 케이블_삭제 cblId
End Sub

Public Sub 시설물_삭제(facId As String)
    ' Undo 기록 — 시설물 전체 직렬화 (도형 + 메타 + callout text + 상태박스 day/night)
    '   주의: 관련 케이블은 cascade 삭제되지만 복원 안 함 (사용자가 다시 그려야 함)
    Dim labelInfo As String: labelInfo = MetaLookupLabel(facId)
    If Len(labelInfo) = 0 Then labelInfo = Right(facId, 6)
    Action_저장 "facility_delete", Action_facility_delete_payload(facId), _
                "시설물 삭제: " & labelInfo

    ' cascade 흐름 — 케이블_삭제 의 별도 undo 기록 차단 (시설물 1회 ← 로 다 복원되게)
    g_undo_cascade_suppress = True

    Dim wsAd As Worksheet: Set wsAd = ThisWorkbook.Worksheets(SHEET_ADMIN)
    Dim wsNw As Worksheet: Set wsNw = ThisWorkbook.Worksheets(SHEET_NETWORK)

    ' 연결 케이블 모두 삭제
    Dim cblList As Variant: cblList = FindRelatedCables(facId)
    Dim i As Long
    If Not IsEmpty(cblList) Then
        For i = LBound(cblList) To UBound(cblList)
            케이블_삭제 CStr(cblList(i))
        Next i
    End If

    On Error Resume Next
    wsAd.Shapes(facId).Delete
    wsNw.Shapes(facId).Delete
    ' 설명선(텍스트박스 + 연결선) + 번호 배지 함께 삭제
    wsAd.Shapes(PREFIX_LABEL & facId).Delete
    wsAd.Shapes(PREFIX_LEADER & facId).Delete
    wsAd.Shapes(PREFIX_BADGE & facId).Delete
    wsNw.Shapes(PREFIX_LABEL & facId).Delete
    wsNw.Shapes(PREFIX_LEADER & facId).Delete
    wsNw.Shapes(PREFIX_BADGE & facId).Delete
    ' 네트웍구성도 — 태그 콤보 + 상태 박스 + 옵션별 태그 박스 (prefix 스캔)
    wsNw.Shapes(PREFIX_FAC_TAG_DD & facId).Delete
    wsNw.Shapes(PREFIX_FAC_STATUS & facId).Delete
    Dim ti As Long, tNm As String
    Dim tagPrefix As String: tagPrefix = PREFIX_FAC_TAG & facId & "_"
    For ti = wsNw.Shapes.Count To 1 Step -1
        tNm = wsNw.Shapes(ti).Name
        If Left(tNm, Len(tagPrefix)) = tagPrefix Then wsNw.Shapes(ti).Delete
    Next ti
    On Error GoTo 0

    MetaDeleteRow SHEET_META_FAC, 1, facId

    ' owner 2026-06-07 (8-60): 네트웍구성도 선번박스·화살표 cascade — fac=<facId> 가진 PAIRBOX 와 그것을 가리키는 PAIRARROW 모두 삭제
    네트웍_연결도형_정리 wsNw, "fac", facId

CascadeDone:
    g_undo_cascade_suppress = False         ' cascade 가드 해제 (오류 발생해도 항상 reset)
End Sub

' owner 2026-06-07 (8-69): 전체 시설물 일괄 삭제.
'   - 삭제모드 ON 이어야 실행 (안전 가드 — 우발적 클릭 방지)
'   - 행정도·네트웍구성도의 모든 PREFIX_FAC 시설물 + 연결 케이블 cascade 삭제
'   - undo 는 시설물 수만큼 누적 (Ctrl+Z 로 하나씩 복원 가능)
Public Sub 시설물_일괄삭제()
    If Not g_deleteMode Then
        MsgBox "「전체 시설물 삭제」 는 「삭제 모드」 가 ON 일 때만 사용 가능합니다." & vbLf & vbLf & _
               "「삭제 모드」 버튼을 먼저 눌러 모드를 켠 후 다시 실행하세요.", _
               vbInformation, "전체 시설물 삭제"
        Exit Sub
    End If

    Dim wsAd As Worksheet: Set wsAd = ThisWorkbook.Worksheets(SHEET_ADMIN)
    Dim wsNw As Worksheet
    On Error Resume Next
    Set wsNw = ThisWorkbook.Worksheets(SHEET_NETWORK)
    On Error GoTo 0

    ' 시설물 ID 수집 (삭제 중 Shape 인덱스 변경 안전)
    Dim ids As Collection: Set ids = New Collection
    Dim sh As Shape
    For Each sh In wsAd.Shapes
        If Left(sh.Name, Len(PREFIX_FAC)) = PREFIX_FAC Then
            On Error Resume Next
            ids.Add sh.Name, sh.Name      ' key 로 중복 자동 제거
            On Error GoTo 0
        End If
    Next sh

    ' 케이블 카운트 (확인 dialog 참고용)
    Dim cblCount As Long: cblCount = 0
    For Each sh In wsAd.Shapes
        If Left(sh.Name, Len(PREFIX_CBL)) = PREFIX_CBL Then cblCount = cblCount + 1
    Next sh

    If ids.Count = 0 Then
        MsgBox "삭제할 시설물이 없습니다.", vbInformation, "전체 시설물 삭제"
        Exit Sub
    End If

    Dim prompt As String
    prompt = "행정도·네트웍구성도의 모든 시설물을 삭제하시겠습니까?" & vbLf & vbLf & _
            "  • 시설물: " & ids.Count & " 개" & vbLf & _
            "  • 연결 케이블: " & cblCount & " 개 (시설물 삭제 시 자동 cascade)" & vbLf & vbLf & _
            "되돌리기 (Ctrl+Z) 로 하나씩 복원 가능합니다."
    If MsgBox(prompt, vbYesNo + vbExclamation + vbDefaultButton2, "전체 시설물 삭제") <> vbYes Then Exit Sub

    Application.ScreenUpdating = False
    Dim oldEv As Boolean: oldEv = Application.EnableEvents
    Application.EnableEvents = False

    Dim i As Long, deleted As Long: deleted = 0
    For i = 1 To ids.Count
        On Error Resume Next
        시설물_삭제 CStr(ids(i))
        If Err.Number = 0 Then deleted = deleted + 1
        Err.Clear
        On Error GoTo 0
    Next i

    Application.EnableEvents = oldEv
    Application.ScreenUpdating = True

    MsgBox deleted & " / " & ids.Count & " 개 시설물 삭제 완료." & vbLf & _
           "연결 케이블도 cascade 로 함께 삭제되었습니다.", _
           vbInformation, "전체 시설물 삭제"
End Sub

' 시설물만 삭제 (케이블은 그대로 유지) — Show시설물_정보 의 [아니요] 분기에서 호출.
'   케이블은 from/to 가 deleted 시설물 id 를 가리키게 되어 orphan 상태로 남음 (시각적·메타 모두).
'   orphan 케이블은 화면 위치 그대로 유지 (재라우팅 함수가 시설물 못 찾으면 skip).
'   owner 가 나중에 케이블 양 끝 시설물을 새로 그려도 자동 재연결은 안 됨 (id 가 random) — 수동 정리 필요.
Public Sub 시설물_삭제_단독(facId As String)
    ' Undo 기록 — facility_delete_only 액션. payload 는 facility_delete 와 동일 포맷이나 cables 필드만 비움
    '   (복원 시 동일 Action_facility_delete_복원 호출 → 빈 cables → 케이블 복원 loop skip)
    Dim labelInfo As String: labelInfo = MetaLookupLabel(facId)
    If Len(labelInfo) = 0 Then labelInfo = Right(facId, 6)
    Action_저장 "facility_delete_only", Action_facility_delete_only_payload(facId), _
                "시설물만 삭제 (케이블 유지): " & labelInfo

    Dim wsAd As Worksheet: Set wsAd = ThisWorkbook.Worksheets(SHEET_ADMIN)
    Dim wsNw As Worksheet: Set wsNw = ThisWorkbook.Worksheets(SHEET_NETWORK)

    ' 케이블 cascade 안 함 — 시설물 본체와 부속만 정리
    On Error Resume Next
    wsAd.Shapes(facId).Delete
    wsNw.Shapes(facId).Delete
    wsAd.Shapes(PREFIX_LABEL & facId).Delete
    wsAd.Shapes(PREFIX_LEADER & facId).Delete
    wsAd.Shapes(PREFIX_BADGE & facId).Delete
    wsNw.Shapes(PREFIX_LABEL & facId).Delete
    wsNw.Shapes(PREFIX_LEADER & facId).Delete
    wsNw.Shapes(PREFIX_BADGE & facId).Delete
    wsNw.Shapes(PREFIX_FAC_TAG_DD & facId).Delete
    wsNw.Shapes(PREFIX_FAC_STATUS & facId).Delete
    Dim ti As Long, tNm As String
    Dim tagPrefix As String: tagPrefix = PREFIX_FAC_TAG & facId & "_"
    For ti = wsNw.Shapes.Count To 1 Step -1
        tNm = wsNw.Shapes(ti).Name
        If Left(tNm, Len(tagPrefix)) = tagPrefix Then wsNw.Shapes(ti).Delete
    Next ti
    On Error GoTo 0

    MetaDeleteRow SHEET_META_FAC, 1, facId

    ' owner 2026-06-07 (8-60): 네트웍구성도 선번박스·화살표 cascade — 시설물만 삭제 mode 에서도 동일 정리
    네트웍_연결도형_정리 wsNw, "fac", facId

    Application.StatusBar = "시설물만 삭제 완료 (케이블은 그대로 유지)."
End Sub

' 같은 방향 (= 같은 facility + 같은 cable_a/cable_b 짝) 의 기존 짝 박스 찾기.
'   owner 요구: 같은 cable_a ↔ cable_b 연결의 새 코어는 기존 박스에 합쳐 표시.
'   반환: arr 화살표 (= 0), box1 (= 1, cblA 쪽), box2 (= 2, cblB 쪽). 없으면 Empty.
Public Function 선번박스_같은짝_찾기(ws As Worksheet, facId As String, cblAName As String, cblBName As String) As Variant
    선번박스_같은짝_찾기 = Empty
    Dim facTag As String: facTag = "fac=" & facId
    Dim cblATag As String: cblATag = "cbl=" & cblAName
    Dim cblBTag As String: cblBTag = "cbl=" & cblBName
    Dim arr As Shape, alt As String
    For Each arr In ws.Shapes
        If Left(arr.Name, Len(PREFIX_PAIRARROW)) = PREFIX_PAIRARROW Then
            alt = ""
            On Error Resume Next
            alt = arr.AlternativeText
            On Error GoTo 0
            ' owner 2026-06-05: cascade anchor (alt 에 |cascade= 포함) 는 머지 후보 X — 일반 머지는 항상 canonical 첫 페어로.
            If InStr(alt, "|cascade=") > 0 Then GoTo NextArrowMerge
            ' arr 의 AlternativeText 형식: "box1=<name>|box2=<name>"
            Dim p1 As Long: p1 = InStr(alt, "box1=")
            Dim p2 As Long: p2 = InStr(alt, "|box2=")
            If p1 = 1 And p2 > p1 Then
                Dim b1Name As String, b2Name As String
                b1Name = Mid(alt, p1 + 5, p2 - (p1 + 5))
                ' box2 다음 「|」 까지 자르기 — RN 화살표 alt 끝의 |rngrp=<id> 가 이름에 포함되면 매칭 실패
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
                    ' 같은 facility 인지 확인
                    If InStr(b1Alt, facTag) > 0 And InStr(b2Alt, facTag) > 0 Then
                        ' (cblA, cblB) 또는 (cblB, cblA) 매칭
                        If InStr(b1Alt, cblATag) > 0 And InStr(b2Alt, cblBTag) > 0 Then
                            선번박스_같은짝_찾기 = Array(arr, b1, b2)
                            Exit Function
                        ElseIf InStr(b1Alt, cblBTag) > 0 And InStr(b2Alt, cblATag) > 0 Then
                            선번박스_같은짝_찾기 = Array(arr, b2, b1)              ' swap → box1=cblA, box2=cblB
                            Exit Function
                        End If
                    End If
                End If
            End If
        End If
NextArrowMerge:
    Next arr
End Function

' owner 2026-06-05: anchor (invisible line) 손실 대비 박스 alt 에 peer 정보 stamp.
'   사용자가 박스 옮기다 영역 선택으로 anchor 를 실수 삭제 → 박스 alt 의 peer 로 자동 복구.
'   형식: 기존 "fac=...|cbl=..." 뒤에 "|peer=<peer_box_name>|cascade=0|1" 추가.
Public Sub 선번박스_alt_peer스탬프(ByVal box1 As Shape, ByVal box2 As Shape, ByVal cascade As Boolean)
    If box1 Is Nothing Or box2 Is Nothing Then Exit Sub
    On Error Resume Next
    box1.AlternativeText = 선번박스_alt_peer값(box1.AlternativeText, box2.Name, cascade)
    box2.AlternativeText = 선번박스_alt_peer값(box2.AlternativeText, box1.Name, cascade)
    On Error GoTo 0
End Sub

Public Function 선번박스_alt_peer값(ByVal curAlt As String, ByVal peerName As String, ByVal cascade As Boolean) As String
    Dim alt As String: alt = curAlt
    alt = 선번박스_alt_키제거(alt, "peer=")
    alt = 선번박스_alt_키제거(alt, "cascade=")
    If Len(alt) > 0 And Right(alt, 1) <> "|" Then alt = alt & "|"
    alt = alt & "peer=" & peerName & "|cascade="
    If cascade Then alt = alt & "1" Else alt = alt & "0"
    선번박스_alt_peer값 = alt
End Function

Public Function 선번박스_alt_키제거(ByVal alt As String, ByVal keyEq As String) As String
    Dim p As Long: p = InStr(alt, keyEq)
    If p = 0 Then 선번박스_alt_키제거 = alt: Exit Function
    Dim eP As Long: eP = InStr(p + Len(keyEq), alt, "|")
    If eP = 0 Then
        If p > 1 And Mid(alt, p - 1, 1) = "|" Then
            선번박스_alt_키제거 = Left(alt, p - 2)
        Else
            선번박스_alt_키제거 = Left(alt, p - 1)
        End If
    Else
        선번박스_alt_키제거 = Left(alt, p - 1) & Mid(alt, eP + 1)
    End If
End Function

' invisible anchor 재생성 — 박스 alt 의 peer 정보로 손실된 anchor 복구.
'   두 박스 중심을 잇는 보이지 않는 line (Weight 0.25 + Transparency 1 + msoFalse).
'   기존수집의 Phase 2 가 이 anchor 를 발견해서 entry 빌드.
Public Function 선번박스_anchor_재생성(ByVal ws As Worksheet, ByVal box1 As Shape, ByVal box2 As Shape, ByVal cascade As Boolean) As Shape
    Set 선번박스_anchor_재생성 = Nothing
    If ws Is Nothing Or box1 Is Nothing Or box2 Is Nothing Then Exit Function
    Dim x1 As Double, y1 As Double, x2 As Double, y2 As Double
    x1 = box1.Left + box1.Width / 2: y1 = box1.Top + box1.Height / 2
    x2 = box2.Left + box2.Width / 2: y2 = box2.Top + box2.Height / 2
    Dim arr As Shape: Set arr = ws.Shapes.AddLine(x1, y1, x2, y2)
    arr.Name = PREFIX_PAIRARROW & NewId8()
    arr.OnAction = ""
    arr.Placement = 3
    Dim altStr As String: altStr = "box1=" & box1.Name & "|box2=" & box2.Name
    If cascade Then altStr = altStr & "|cascade=1"
    On Error Resume Next
    arr.AlternativeText = altStr
    With arr.Line
        .Visible = msoFalse
        .Transparency = 1
        .Weight = 0.25
        .DashStyle = msoLineSolid
    End With
    ' owner 2026-06-06 (8-25): Shape.Visible=msoFalse 로 마퀴/클릭 선택 차단.
    arr.Visible = msoFalse
    On Error GoTo 0
    Set 선번박스_anchor_재생성 = arr
End Function

' owner 2026-06-06: 기존 RN 연결정보 존재 여부 — Step2진입_RN/RN1 picker 건너뛰기 판정용.
'   기존수집 이 채운 3 개 dict (A_IN / OUT_B / A_OUT) 의 합계가 0 초과면 기존 연결 있음.
Public Function 선번연결_도구_existing연결개수() As Long
    Dim n As Long: n = 0
    If Not g_pt_existingMappingsA_IN Is Nothing Then n = n + g_pt_existingMappingsA_IN.Count
    If Not g_pt_existingMappingsOUT_B Is Nothing Then n = n + g_pt_existingMappingsOUT_B.Count
    If Not g_pt_existingMappingsA_OUT Is Nothing Then n = n + g_pt_existingMappingsA_OUT.Count
    선번연결_도구_existing연결개수 = n
End Function

' owner 2026-06-05: RN 차수별 출력 라벨 매핑.
'   입력 = "i" (공통), 출력 = 1차 "m" / 2차 "s" / 3차 "p"
Public Function 선번연결_도구_RN차수출력라벨(ByVal tier As Long) As String
    Select Case tier
        Case 1: 선번연결_도구_RN차수출력라벨 = "m"
        Case 2: 선번연결_도구_RN차수출력라벨 = "s"
        Case 3: 선번연결_도구_RN차수출력라벨 = "p"
        Case Else: 선번연결_도구_RN차수출력라벨 = "m"     ' fallback 1차
    End Select
End Function

' owner 2026-06-05: RN 차수 라벨 (사용자 표시용 "1차" / "2차" / "3차").
Public Function 선번연결_도구_RN차수표시(ByVal tier As Long) As String
    Select Case tier
        Case 1: 선번연결_도구_RN차수표시 = "1차"
        Case 2: 선번연결_도구_RN차수표시 = "2차"
        Case 3: 선번연결_도구_RN차수표시 = "3차"
        Case Else: 선번연결_도구_RN차수표시 = "1차"
    End Select
End Function

' owner 2026-06-05: RN 진입 시 차수·규격 결정 헬퍼.
'   tierIn / specIn 이 비어있으면 InputBox 로 사용자 입력 요청.
'   결과: outTier (1/2/3) + outSpec ("2:8", "1:8" 등). 사용자 취소 시 outTier=0 반환.
Public Sub 선번연결_도구_RN차수규격_결정(ByVal tierIn As Long, ByVal specIn As String, _
                                          ByRef outTier As Long, ByRef outSpec As String)
    outTier = 0: outSpec = ""

    ' 차수 결정 — 명시 안 됐으면 InputBox
    If tierIn >= 1 And tierIn <= 3 Then
        outTier = tierIn
    Else
        Dim tStr As String
        tStr = InputBox("RN 차수를 입력하세요 (1 / 2 / 3)" & vbLf & _
                        "  1차 = 출력 라벨 m" & vbLf & _
                        "  2차 = 출력 라벨 s" & vbLf & _
                        "  3차 = 출력 라벨 p", "RN 차수 선택", "1")
        If Len(Trim(tStr)) = 0 Then Exit Sub
        Dim tV As Long: tV = Val(Trim(tStr))
        If tV < 1 Or tV > 3 Then
            MsgBox "차수는 1 / 2 / 3 중 하나여야 합니다.", vbExclamation, "RN 차수"
            Exit Sub
        End If
        outTier = tV
    End If

    ' 규격 결정 — 명시 안 됐으면 InputBox
    If Len(Trim(specIn)) > 0 And InStr(specIn, ":") > 0 Then
        outSpec = specIn
    Else
        Dim sStr As String
        Dim defaultSpec As String
        If outTier = 1 Then defaultSpec = "2:8" Else defaultSpec = "1:8"
        sStr = InputBox("RN 규격을 입력하세요 (IN:OUT 형식)" & vbLf & _
                        "  예: 2:8  (2 입력, 8 출력)" & vbLf & _
                        "  예: 1:8  (1 입력, 8 출력)" & vbLf & _
                        "  예: 1:16 (1 입력, 16 출력)", _
                        선번연결_도구_RN차수표시(outTier) & " RN 규격 입력", defaultSpec)
        If Len(Trim(sStr)) = 0 Then outTier = 0: Exit Sub
        If InStr(sStr, ":") = 0 Then
            MsgBox "IN:OUT 형식으로 입력하세요 (예: 2:8).", vbExclamation, "RN 규격"
            outTier = 0: Exit Sub
        End If
        outSpec = Trim(sStr)
    End If
End Sub

' owner 2026-06-05: RN 규격 문자열 유효성 — "M:N" 형식 (M·N 모두 양의 정수).
Public Function 선번연결_도구_RN규격_유효(ByVal s As String) As Boolean
    선번연결_도구_RN규격_유효 = False
    Dim t As String: t = Trim(s)
    If Len(t) = 0 Then Exit Function
    Dim cp As Long: cp = InStr(t, ":")
    If cp <= 0 Then Exit Function
    Dim mStr As String, nStr As String
    mStr = Trim(Left(t, cp - 1))
    nStr = Trim(Mid(t, cp + 1))
    If Not IsNumeric(mStr) Then Exit Function
    If Not IsNumeric(nStr) Then Exit Function
    If CLng(mStr) <= 0 Then Exit Function
    If CLng(nStr) <= 0 Then Exit Function
    선번연결_도구_RN규격_유효 = True
End Function

' owner 2026-06-05: RN 차수·규격 picker UI — Step2진입_RN/RN1 진입 시 tier 또는 spec 미정인 경우 시트빌드가 호출.
'   InputBox 대체 — 사용자가 차수·규격 버튼을 클릭으로 선택.
'   현재 선택 = g_pt_rnTier·g_pt_rnSpec (draft 상태). 확정은 「확인」 버튼이 처리.
Public Sub 선번연결_도구_RN_picker렌더(ws As Worksheet)
    Const PICK_LEFT As Double = 36
    Const PICK_TOP As Double = 110
    Const PICK_BTN_W As Double = 80
    Const PICK_BTN_H As Double = 30
    Const PICK_GAP As Double = 6
    Const PICK_ROW_GAP As Double = 14

    ' 헤더
    Dim hdr As Shape
    Set hdr = ws.Shapes.AddTextbox(msoTextOrientationHorizontal, PICK_LEFT, PICK_TOP, 600, 22)
    hdr.Name = PREFIX_PT_BTN & "rnpick_hdr"
    hdr.Placement = 3
    On Error Resume Next
    hdr.Line.Visible = msoFalse
    hdr.Fill.Visible = msoFalse
    With hdr.TextFrame2
        .MarginLeft = 0: .MarginRight = 0: .MarginTop = 0: .MarginBottom = 0
        .VerticalAnchor = msoAnchorMiddle
        Dim hdrTxt As String
        If g_pt_rnPickerIsRN1 Then
            hdrTxt = "[RN1 규격 선택]  단일 케이블 — 차수와 규격을 버튼으로 고르세요."
        Else
            hdrTxt = "[RN 규격 선택]  Cable A↔IN + OUT↔Cable B — 차수와 규격을 버튼으로 고르세요."
        End If
        .TextRange.Text = hdrTxt
        .TextRange.Font.Name = CALLOUT_FONT_NAME
        .TextRange.Font.Size = 12
        .TextRange.Font.Bold = msoTrue
        .TextRange.Font.Fill.ForeColor.RGB = RGB(30, 41, 59)
    End With
    On Error GoTo 0

    ' === 차수 라벨 + 버튼 행 ===
    Dim tierRowTop As Double: tierRowTop = PICK_TOP + 30
    Dim tierLbl As Shape
    Set tierLbl = ws.Shapes.AddTextbox(msoTextOrientationHorizontal, PICK_LEFT, tierRowTop, 70, PICK_BTN_H)
    tierLbl.Name = PREFIX_PT_BTN & "rnpick_tierLbl"
    tierLbl.Placement = 3
    On Error Resume Next
    tierLbl.Line.Visible = msoFalse
    tierLbl.Fill.Visible = msoFalse
    With tierLbl.TextFrame2
        .MarginLeft = 0: .MarginRight = 4: .MarginTop = 0: .MarginBottom = 0
        .VerticalAnchor = msoAnchorMiddle
        .TextRange.Text = "차수:"
        .TextRange.Font.Name = CALLOUT_FONT_NAME
        .TextRange.Font.Size = 11
        .TextRange.Font.Bold = msoTrue
    End With
    On Error GoTo 0

    Dim tierBtnX As Double: tierBtnX = PICK_LEFT + 70
    Dim ti As Long
    For ti = 1 To 3
        Dim tBtn As Shape
        Set tBtn = ws.Shapes.AddShape(msoShapeRoundedRectangle, tierBtnX, tierRowTop, PICK_BTN_W, PICK_BTN_H)
        tBtn.Name = PREFIX_PT_BTN & "rnpick_tier_" & ti
        tBtn.OnAction = "선번연결_도구_RNTier선택"
        tBtn.AlternativeText = "tier=" & ti
        tBtn.Placement = 3
        Dim isTSel As Boolean: isTSel = (g_pt_rnTier = ti)
        With tBtn.Line: .Visible = msoFalse: End With
        If isTSel Then
            With tBtn.Fill: .ForeColor.RGB = RGB(59, 130, 246): .Visible = msoTrue: End With
        Else
            With tBtn.Fill: .ForeColor.RGB = RGB(226, 232, 240): .Visible = msoTrue: End With
        End If
        With tBtn.TextFrame2
            .MarginLeft = 4: .MarginRight = 4: .MarginTop = 2: .MarginBottom = 2
            .VerticalAnchor = msoAnchorMiddle
            .TextRange.Text = ti & "차 (" & 선번연결_도구_RN차수출력라벨(ti) & ")"
            .TextRange.Font.Name = CALLOUT_FONT_NAME
            .TextRange.Font.Size = 11
            .TextRange.Font.Bold = msoTrue
            If isTSel Then
                .TextRange.Font.Fill.ForeColor.RGB = RGB(255, 255, 255)
            Else
                .TextRange.Font.Fill.ForeColor.RGB = RGB(30, 41, 59)
            End If
            .TextRange.ParagraphFormat.Alignment = 1
        End With
        tierBtnX = tierBtnX + PICK_BTN_W + PICK_GAP
    Next ti

    ' === 규격 라벨 + 버튼 행 (presets + 직접입력) ===
    Dim specRowTop As Double: specRowTop = tierRowTop + PICK_BTN_H + PICK_ROW_GAP
    Dim specLbl As Shape
    Set specLbl = ws.Shapes.AddTextbox(msoTextOrientationHorizontal, PICK_LEFT, specRowTop, 70, PICK_BTN_H)
    specLbl.Name = PREFIX_PT_BTN & "rnpick_specLbl"
    specLbl.Placement = 3
    On Error Resume Next
    specLbl.Line.Visible = msoFalse
    specLbl.Fill.Visible = msoFalse
    With specLbl.TextFrame2
        .MarginLeft = 0: .MarginRight = 4: .MarginTop = 0: .MarginBottom = 0
        .VerticalAnchor = msoAnchorMiddle
        .TextRange.Text = "규격:"
        .TextRange.Font.Name = CALLOUT_FONT_NAME
        .TextRange.Font.Size = 11
        .TextRange.Font.Bold = msoTrue
    End With
    On Error GoTo 0

    Dim specPresets() As String
    specPresets = Split("2:8,2:16,1:3,1:4,1:8,1:16,1:32", ",")
    Dim specBtnX As Double: specBtnX = PICK_LEFT + 70
    Dim si As Long
    For si = LBound(specPresets) To UBound(specPresets)
        Dim sBtn As Shape
        Set sBtn = ws.Shapes.AddShape(msoShapeRoundedRectangle, specBtnX, specRowTop, 56, PICK_BTN_H)
        sBtn.Name = PREFIX_PT_BTN & "rnpick_spec_" & Replace(specPresets(si), ":", "x")
        sBtn.OnAction = "선번연결_도구_RNSpec선택"
        sBtn.AlternativeText = "spec=" & specPresets(si)
        sBtn.Placement = 3
        Dim isSSel As Boolean: isSSel = (g_pt_rnSpec = specPresets(si))
        With sBtn.Line: .Visible = msoFalse: End With
        If isSSel Then
            With sBtn.Fill: .ForeColor.RGB = RGB(59, 130, 246): .Visible = msoTrue: End With
        Else
            With sBtn.Fill: .ForeColor.RGB = RGB(226, 232, 240): .Visible = msoTrue: End With
        End If
        With sBtn.TextFrame2
            .MarginLeft = 2: .MarginRight = 2: .MarginTop = 2: .MarginBottom = 2
            .VerticalAnchor = msoAnchorMiddle
            .TextRange.Text = specPresets(si)
            .TextRange.Font.Name = CALLOUT_FONT_NAME
            .TextRange.Font.Size = 11
            .TextRange.Font.Bold = msoTrue
            If isSSel Then
                .TextRange.Font.Fill.ForeColor.RGB = RGB(255, 255, 255)
            Else
                .TextRange.Font.Fill.ForeColor.RGB = RGB(30, 41, 59)
            End If
            .TextRange.ParagraphFormat.Alignment = 1
        End With
        specBtnX = specBtnX + 56 + PICK_GAP
    Next si

    ' 직접입력 버튼 (preset 외 임의 M:N — InputBox 1회)
    Dim customBtn As Shape
    Set customBtn = ws.Shapes.AddShape(msoShapeRoundedRectangle, specBtnX, specRowTop, 80, PICK_BTN_H)
    customBtn.Name = PREFIX_PT_BTN & "rnpick_spec_custom"
    customBtn.OnAction = "선번연결_도구_RNSpec직접입력"
    customBtn.Placement = 3
    Dim isCustomSel As Boolean
    isCustomSel = (Len(g_pt_rnSpec) > 0)
    Dim isPresetSel As Boolean: isPresetSel = False
    Dim ck As Long
    For ck = LBound(specPresets) To UBound(specPresets)
        If g_pt_rnSpec = specPresets(ck) Then isPresetSel = True: Exit For
    Next ck
    isCustomSel = isCustomSel And Not isPresetSel
    With customBtn.Line: .Visible = msoFalse: End With
    If isCustomSel Then
        With customBtn.Fill: .ForeColor.RGB = RGB(168, 85, 247): .Visible = msoTrue: End With
    Else
        With customBtn.Fill: .ForeColor.RGB = RGB(148, 163, 184): .Visible = msoTrue: End With
    End If
    With customBtn.TextFrame2
        .MarginLeft = 2: .MarginRight = 2: .MarginTop = 2: .MarginBottom = 2
        .VerticalAnchor = msoAnchorMiddle
        If isCustomSel Then
            .TextRange.Text = "직접: " & g_pt_rnSpec
        Else
            .TextRange.Text = "직접입력"
        End If
        .TextRange.Font.Name = CALLOUT_FONT_NAME
        .TextRange.Font.Size = 11
        .TextRange.Font.Bold = msoTrue
        .TextRange.Font.Fill.ForeColor.RGB = RGB(255, 255, 255)
        .TextRange.ParagraphFormat.Alignment = 1
    End With

    ' === 현재 선택 안내 ===
    Dim statusTop As Double: statusTop = specRowTop + PICK_BTN_H + PICK_ROW_GAP
    Dim statusShp As Shape
    Set statusShp = ws.Shapes.AddTextbox(msoTextOrientationHorizontal, PICK_LEFT, statusTop, 600, 22)
    statusShp.Name = PREFIX_PT_BTN & "rnpick_status"
    statusShp.Placement = 3
    On Error Resume Next
    statusShp.Line.Visible = msoFalse
    statusShp.Fill.Visible = msoFalse
    Dim sumTier As String, sumSpec As String
    If g_pt_rnTier >= 1 And g_pt_rnTier <= 3 Then
        sumTier = g_pt_rnTier & "차 (" & 선번연결_도구_RN차수출력라벨(g_pt_rnTier) & ")"
    Else
        sumTier = "미선택"
    End If
    If Len(g_pt_rnSpec) > 0 Then sumSpec = g_pt_rnSpec Else sumSpec = "미선택"
    With statusShp.TextFrame2
        .MarginLeft = 0: .MarginRight = 0: .MarginTop = 0: .MarginBottom = 0
        .VerticalAnchor = msoAnchorMiddle
        .TextRange.Text = "현재 선택 — 차수: " & sumTier & "  ·  규격: " & sumSpec
        .TextRange.Font.Name = CALLOUT_FONT_NAME
        .TextRange.Font.Size = 11
        .TextRange.Font.Italic = msoTrue
        .TextRange.Font.Fill.ForeColor.RGB = RGB(71, 85, 105)
    End With
    On Error GoTo 0

    ' === 확인 / 취소 버튼 ===
    Dim actionTop As Double: actionTop = statusTop + 28
    Dim okBtn As Shape
    Set okBtn = ws.Shapes.AddShape(msoShapeRoundedRectangle, PICK_LEFT, actionTop, 120, 32)
    okBtn.Name = PREFIX_PT_BTN & "rnpick_ok"
    okBtn.OnAction = "선번연결_도구_RN확인"
    okBtn.Placement = 3
    With okBtn.Line: .Visible = msoFalse: End With
    With okBtn.Fill: .ForeColor.RGB = RGB(34, 197, 94): .Visible = msoTrue: End With
    With okBtn.TextFrame2
        .MarginLeft = 4: .MarginRight = 4: .MarginTop = 2: .MarginBottom = 2
        .VerticalAnchor = msoAnchorMiddle
        .TextRange.Text = "확인"
        .TextRange.Font.Name = CALLOUT_FONT_NAME
        .TextRange.Font.Size = 12
        .TextRange.Font.Bold = msoTrue
        .TextRange.Font.Fill.ForeColor.RGB = RGB(255, 255, 255)
        .TextRange.ParagraphFormat.Alignment = 1
    End With

    Dim cancelBtn As Shape
    Set cancelBtn = ws.Shapes.AddShape(msoShapeRoundedRectangle, PICK_LEFT + 126, actionTop, 100, 32)
    cancelBtn.Name = PREFIX_PT_BTN & "rnpick_cancel"
    cancelBtn.OnAction = "선번연결_도구_RN취소"
    cancelBtn.Placement = 3
    With cancelBtn.Line: .Visible = msoFalse: End With
    With cancelBtn.Fill: .ForeColor.RGB = RGB(100, 116, 139): .Visible = msoTrue: End With
    With cancelBtn.TextFrame2
        .MarginLeft = 4: .MarginRight = 4: .MarginTop = 2: .MarginBottom = 2
        .VerticalAnchor = msoAnchorMiddle
        .TextRange.Text = "취소"
        .TextRange.Font.Name = CALLOUT_FONT_NAME
        .TextRange.Font.Size = 12
        .TextRange.Font.Bold = msoTrue
        .TextRange.Font.Fill.ForeColor.RGB = RGB(255, 255, 255)
        .TextRange.ParagraphFormat.Alignment = 1
    End With
End Sub

' picker 차수 버튼 클릭 — AlternativeText "tier=1|2|3" 에서 차수 추출.
Public Sub 선번연결_도구_RNTier선택()
    Dim nm As String: nm = Application.Caller
    Dim sh As Shape
    On Error Resume Next
    Set sh = ThisWorkbook.Worksheets(SHEET_PAIR_TOOL).Shapes(nm)
    On Error GoTo 0
    If sh Is Nothing Then Exit Sub
    Dim alt As String: alt = "": On Error Resume Next: alt = sh.AlternativeText: On Error GoTo 0
    Dim p As Long: p = InStr(alt, "tier=")
    If p = 0 Then Exit Sub
    Dim tv As String: tv = Mid(alt, p + 5)
    If Not IsNumeric(tv) Then Exit Sub
    g_pt_rnTier = CLng(tv)
    선번연결_도구_시트빌드
End Sub

' picker 규격 preset 클릭 — AlternativeText "spec=M:N".
Public Sub 선번연결_도구_RNSpec선택()
    Dim nm As String: nm = Application.Caller
    Dim sh As Shape
    On Error Resume Next
    Set sh = ThisWorkbook.Worksheets(SHEET_PAIR_TOOL).Shapes(nm)
    On Error GoTo 0
    If sh Is Nothing Then Exit Sub
    Dim alt As String: alt = "": On Error Resume Next: alt = sh.AlternativeText: On Error GoTo 0
    Dim p As Long: p = InStr(alt, "spec=")
    If p = 0 Then Exit Sub
    g_pt_rnSpec = Trim(Mid(alt, p + 5))
    선번연결_도구_시트빌드
End Sub

' picker 직접입력 버튼 — InputBox 1회로 임의 M:N 입력.
Public Sub 선번연결_도구_RNSpec직접입력()
    Dim s As String
    s = InputBox("RN 규격 직접 입력 (IN:OUT)" & vbLf & _
                 "예: 2:8 / 1:8 / 1:16 / 1:32 / 3:6 ...", _
                 "RN 규격 직접 입력", g_pt_rnSpec)
    If Len(Trim(s)) = 0 Then Exit Sub
    If Not 선번연결_도구_RN규격_유효(s) Then
        MsgBox "IN:OUT 형식 (둘 다 양의 정수) 으로 입력하세요. 예: 2:8", vbExclamation, "RN 규격"
        Exit Sub
    End If
    g_pt_rnSpec = Trim(s)
    선번연결_도구_시트빌드
End Sub

' picker 확인 — 차수·규격 검증 후 picker 종료 + Step2진입_RN/RN1 재진입.
Public Sub 선번연결_도구_RN확인()
    If g_pt_rnTier < 1 Or g_pt_rnTier > 3 Then
        Application.StatusBar = "차수를 먼저 선택하세요 (1차 / 2차 / 3차)."
        Exit Sub
    End If
    If Not 선번연결_도구_RN규격_유효(g_pt_rnSpec) Then
        Application.StatusBar = "규격을 먼저 선택하세요 (preset 또는 직접입력)."
        Exit Sub
    End If
    Dim cblA As String: cblA = g_pt_rnPickerCblA
    Dim cblB As String: cblB = g_pt_rnPickerCblB
    Dim isRN1 As Boolean: isRN1 = g_pt_rnPickerIsRN1
    Dim curSpec As String: curSpec = g_pt_rnSpec
    Dim curTier As Long: curTier = g_pt_rnTier
    ' 차수 라벨 결정 — 픽커에서 명시한 차수 우선, 그 외 규격 기반 fallback
    Dim curLbl As String
    Select Case curTier
        Case 1: curLbl = "i_1차"
        Case 2: curLbl = "m_2차"
        Case 3: curLbl = "s_3차"
        Case Else: curLbl = 선번연결_도구_RN규격라벨(curSpec)
    End Select
    ' picker 종료
    g_pt_rnPickerMode = False
    g_pt_rnPickerCblA = "": g_pt_rnPickerCblB = "": g_pt_rnPickerIsRN1 = False
    ' spec 저장 — 같은 RN 시설물 재진입 시 picker 안 거치고 바로 본 UI
    선번연결_도구_RN규격저장 curSpec
    ' Step2 재진입 — tier/spec 유효해서 picker 분기 안 타고 본 setup 로 진행
    If isRN1 Then
        선번연결_도구_Step2진입_RN1 cblA, curSpec, curLbl
    Else
        선번연결_도구_Step2진입_RN cblA, cblB, curSpec, curLbl
    End If
End Sub

' owner 2026-06-05: 「RN 규격 변경」 버튼 핸들러 — 현재 cable+facility 로 picker 재호출.
'   잘못 저장된 spec (자동 추정 등) 을 정정하거나 차수 변경할 때 사용.
'   picker 확인 시 새 spec 이 meta 에 저장되고 본 RN UI 가 새 규격으로 재빌드됨.
Public Sub 선번연결_도구_RN규격변경()
    If Not g_pt_rnMode Then
        MsgBox "RN 모드일 때만 사용 가능합니다.", vbExclamation, "RN 규격 변경"
        Exit Sub
    End If
    If Len(g_pt_cbl1Name) = 0 Then
        MsgBox "케이블이 선택돼 있지 않습니다.", vbExclamation, "RN 규격 변경"
        Exit Sub
    End If
    g_pt_rnPickerMode = True
    g_pt_rnPickerCblA = g_pt_cbl1Name
    g_pt_rnPickerCblB = g_pt_cbl2Name
    g_pt_rnPickerIsRN1 = (g_pt_cbl1Name = g_pt_cbl2Name)
    ' 현재 차수·spec 을 picker 의 draft 로 유지 (사용자가 그대로 두고 확인하면 동일 값)
    선번연결_도구_시트빌드
    Application.StatusBar = "RN 규격 변경 — 차수·규격 다시 선택 후 「확인」 누르세요."
End Sub

' picker 취소.
'   owner 2026-06-05: 2가지 context 분기.
'     - 「RN 규격 변경」 으로 재호출된 picker (g_pt_rnMode 이미 True) — 기존 RN 설정 그대로 유지
'     - 신규 진입 picker (g_pt_rnMode 아직 False) — Step 1 복귀
Public Sub 선번연결_도구_RN취소()
    Dim wasRnActive As Boolean: wasRnActive = g_pt_rnMode
    g_pt_rnPickerMode = False
    g_pt_rnPickerCblA = "": g_pt_rnPickerCblB = "": g_pt_rnPickerIsRN1 = False
    If wasRnActive Then
        ' 재호출 picker 취소 — 기존 RN 모드 그대로
        선번연결_도구_시트빌드
        선번연결_도구_시각갱신
        Application.StatusBar = "RN 규격 변경 취소 — 기존 설정 유지."
    Else
        ' 신규 진입 picker 취소 — Step 1 복귀
        g_pt_rnTier = 0: g_pt_rnSpec = "": g_pt_rnLabel = ""
        g_pt_step = 1
        선번연결_도구_시트빌드
        Application.StatusBar = "RN 규격 선택 취소 — Step 1 복귀."
    End If
End Sub

' 박스 텍스트를 코어 배열로 파싱 (매핑 순서 유지 — sort 안 함, dedup 안 함).
'   입력: "1,3,5-7", "1~5", "1,2,3,4", "5,6,1,2" 등 매핑 순서대로 표기된 텍스트.
'   결과: 1-based array. owner 룰: 박스 안 코어는 매핑 순서대로 (양쪽 박스 같은 인덱스끼리 페어).

' ===== owner 2026-06-08 (8-123): 「범례」 양식 시트 생성 (Step A) =====
'   owner 요구: 별도 시트 「범례」 에 양식 정해두고, 도형 추가 → 「양식 스캔」 으로 일괄 등록.
'   양식 컬럼: A순번 / B명칭 / C구분 / D규격 / E추가 / F도형
'   명칭·구분·규격·추가 모두 자유 입력. 명칭 = "케이블" 이면 케이블, 그 외 시설물 (Step B 에서 처리).
'   헤더만 잠금, 데이터 row 자유 수정. row 추가/삭제 가능 (시트 보호 옵션).
Public Sub 범례_양식_생성()
    Dim ws As Worksheet
    Set ws = Nothing
    On Error Resume Next: Set ws = ThisWorkbook.Worksheets(SHEET_LEGEND_FORM): On Error GoTo 0

    If Not ws Is Nothing Then
        Dim resp As Long
        resp = MsgBox("「" & SHEET_LEGEND_FORM & "」 시트가 이미 있습니다." & vbLf & vbLf & _
                      "재생성하면 기존 양식 내용 (도형·데이터) 이 모두 삭제됩니다." & vbLf & _
                      "계속할까요?", vbOKCancel + vbExclamation, "범례 양식 생성")
        If resp <> vbOK Then Exit Sub

        On Error Resume Next
        Application.DisplayAlerts = False
        ws.Delete
        Application.DisplayAlerts = True
        On Error GoTo 0
        Set ws = Nothing
    End If

    ' 신규 시트 생성 — 맨 끝에
    Set ws = ThisWorkbook.Worksheets.Add(After:=ThisWorkbook.Sheets(ThisWorkbook.Sheets.Count))
    ws.Name = SHEET_LEGEND_FORM

    Dim wasProt As Boolean: wasProt = ws.ProtectContents
    If wasProt Then On Error Resume Next: ws.Unprotect: On Error GoTo 0

    ' 헤더 row 1
    ws.Cells(1, 1).Value = "순번"
    ws.Cells(1, 2).Value = "명칭"
    ws.Cells(1, 3).Value = "구분"
    ws.Cells(1, 4).Value = "규격"
    ws.Cells(1, 5).Value = "추가"
    ws.Cells(1, 6).Value = "도형"

    With ws.Range("A1:F1")
        .Font.Bold = True
        .Font.Size = 11
        .Interior.Color = RGB(217, 217, 217)
        .HorizontalAlignment = xlCenter
        .VerticalAlignment = xlCenter
    End With

    ' 컬럼 너비
    ws.Columns(1).ColumnWidth = 6       ' 순번
    ws.Columns(2).ColumnWidth = 12      ' 명칭
    ws.Columns(3).ColumnWidth = 18      ' 구분
    ws.Columns(4).ColumnWidth = 12      ' 규격
    ws.Columns(5).ColumnWidth = 12      ' 추가
    ws.Columns(6).ColumnWidth = 28      ' 도형

    ws.Rows(1).RowHeight = 24

    ' 예시 row 4 개 (owner 의 4 공용 명칭)
    ws.Cells(2, 1).Value = 1
    ws.Cells(2, 2).Value = "설치장소"
    ws.Cells(2, 3).Value = "광케이블함"

    ws.Cells(3, 1).Value = 2
    ws.Cells(3, 2).Value = "시설물"
    ws.Cells(3, 3).Value = "종합국사"

    ws.Cells(4, 1).Value = 3
    ws.Cells(4, 2).Value = "접속함체"
    ws.Cells(4, 3).Value = "가공형"

    ws.Cells(5, 1).Value = 4
    ws.Cells(5, 2).Value = "케이블"
    ws.Cells(5, 3).Value = "광케이블"
    ws.Cells(5, 4).Value = "12C"

    ' 데이터 row 높이 (도형 그릴 자리 — F 컬럼 셀 위에 도형 추가)
    ws.Rows("2:5").RowHeight = 55

    ' 셀 border
    With ws.Range("A1:F5").Borders
        .LineStyle = xlContinuous
        .Color = RGB(180, 180, 180)
        .Weight = xlThin
    End With

    ' 가운데 정렬 (A·B·C·D·E 데이터)
    ws.Range("A2:E5").HorizontalAlignment = xlCenter
    ws.Range("A2:E5").VerticalAlignment = xlCenter

    ' 「양식 스캔」 버튼 — 시트 상단 우측 H1 근처
    Dim btnLeft As Double, btnTop As Double
    btnLeft = ws.Cells(1, 8).Left
    btnTop = ws.Cells(1, 1).Top
    Dim btn As Shape
    Set btn = ws.Shapes.AddShape(msoShapeRoundedRectangle, btnLeft, btnTop, 140, 28)
    btn.Name = "_legend_form_scan_btn"
    btn.Placement = 3
    btn.Locked = False
    btn.Line.Visible = msoFalse
    btn.Fill.ForeColor.RGB = RGB(70, 130, 180)
    With btn.TextFrame2
        .HorizontalAnchor = msoAnchorCenter
        .VerticalAnchor = msoAnchorMiddle
        .MarginLeft = 0: .MarginRight = 0: .MarginTop = 0: .MarginBottom = 0
        With .TextRange
            .Text = "▶ 양식 스캔"
            .Font.Bold = True
            .Font.Size = 11
            .Font.Fill.ForeColor.RGB = RGB(255, 255, 255)
            .ParagraphFormat.Alignment = msoAlignCenter
        End With
    End With
    btn.OnAction = "범례_양식_스캔"

    ' owner 2026-06-10: 「범례 해제」 버튼 (양식 스캔 오른쪽 옆)
    양식_해제버튼_보장 ws

    ' 안내 문구 (도움말)
    With ws.Cells(7, 1)
        .Value = "■ 사용법: F 컬럼 (도형) 셀 위에 도형 그리기 → 「양식 스캔」 클릭 → 등록"
        .Font.Color = RGB(80, 80, 80)
        .Font.Size = 10
    End With
    With ws.Cells(8, 1)
        .Value = "■ 도형 안 글자 보존 + 여러 도형을 그룹화한 것도 등록 가능 (Step B 에서 구현)"
        .Font.Color = RGB(80, 80, 80)
        .Font.Size = 10
    End With
    With ws.Cells(9, 1)
        .Value = "■ 명칭 = 「케이블」 → 케이블 (선) / 그 외 → 시설물 (도형) 으로 자동 판단"
        .Font.Color = RGB(80, 80, 80)
        .Font.Size = 10
    End With
    With ws.Cells(10, 1)
        .Value = "■ 양식 row 삭제 후 「양식 스캔」 누르면 메타·콤보에서도 자동 제거"
        .Font.Color = RGB(80, 80, 80)
        .Font.Size = 10
    End With

    ' 시트 보호 — 헤더 (A1:F1) 만 잠금, 나머지는 자유 수정.
    '   AllowInsertingRows/DeletingRows 활성 → owner 가 row 추가/삭제 가능.
    ws.Cells.Locked = False
    ws.Range("A1:F1").Locked = True
    ws.Protect Password:="", DrawingObjects:=False, Contents:=True, _
               AllowFormattingCells:=True, AllowFormattingColumns:=True, AllowFormattingRows:=True, _
               AllowInsertingRows:=True, AllowDeletingRows:=True, AllowSorting:=True, AllowFiltering:=True

    ' 시트 활성화 + F2 셀 (첫 도형 그릴 자리) 선택
    ws.Activate
    On Error Resume Next: ws.Cells(2, 6).Select: On Error GoTo 0

    MsgBox "「" & SHEET_LEGEND_FORM & "」 시트 생성 완료." & vbLf & vbLf & _
           "  • 예시 row 4 개 (설치장소·시설물·접속함체·케이블)" & vbLf & _
           "  • F 컬럼 (도형) 셀 위에 도형 그리기 → 「양식 스캔」 클릭" & vbLf & _
           "  • 헤더만 잠금, row 추가/삭제 자유" & vbLf & vbLf & _
           "다음 단계: 「양식 스캔」 매크로 구현 (도형 글자 보존 + 그룹 도형 지원).", _
           vbInformation, "범례 양식 생성"
End Sub

' ===== owner 2026-06-08 (8-124): 양식 스캔 매크로 (Step B) =====
'   양식 시트 row 2 부터 walk → 각 row 의 F 셀 위 도형 검사 → 메타 등록.
'   도형 종류:
'     - 단일 Shape (사각형·마름모·원 등) — Name 변경 + OnAction 설정
'     - Group Shape (msoGroup) — 그룹 자체 Name 변경 + OnAction 설정
'   도형 글자 보존: 옛 「범례로_등록」 의 `shp.TextFrame2.TextRange.Text = ""` 동작 안 함.
'   케이블 판단: 명칭 = "케이블" → 케이블, 그 외 → 시설물
'   메타 row: (1)도형명·(2)kind·(3)구분·(4)시각·(5)규격·(6)추가·(7)양식row·(8)source="form"
'   기존 _범례 메타 호환 유지 (첫 4 컬럼 그대로 — MetaLookupLabel/Kind 작동).
' owner 2026-06-10: 양식 범례 해제 — 양식 시트 도형의 '그리기 기능(OnAction)' 을 일괄 제거.
'   해제 후엔 도형을 좌클릭으로 자유롭게 선택·수정·교체·삭제 가능 (행정도로 안 넘어감).
'   수정이 끝나면 「▶ 양식 스캔」 을 다시 눌러 재등록(OnAction·메타 부여). 옛 도형교체 매크로 대체.
Public Sub 양식_범례_해제()
    Dim ws As Worksheet
    On Error Resume Next: Set ws = ThisWorkbook.Worksheets(SHEET_LEGEND_FORM): On Error GoTo 0
    If ws Is Nothing Then
        MsgBox "「" & SHEET_LEGEND_FORM & "」 양식 시트가 없습니다.", vbExclamation, "범례 해제": Exit Sub
    End If

    On Error Resume Next: ws.Unprotect: On Error GoTo 0   ' 수정 가능하게 보호 해제 (양식 스캔이 끝에 복원)

    Dim cnt As Long: cnt = 0
    Dim sh As Shape
    For Each sh In ws.Shapes
        Dim ac As String: ac = ""
        On Error Resume Next: ac = sh.OnAction: On Error GoTo 0
        ' 양식 도형 핸들러만 해제 — 「양식 스캔」 버튼(범례_양식_스캔) 등 시스템 도형은 보존
        If ac = "범례_양식_시설물_선택" Or ac = "범례_양식_케이블_선택" Then
            On Error Resume Next
            sh.OnAction = ""
            sh.Locked = False
            sh.Placement = 3
            On Error GoTo 0
            cnt = cnt + 1
        End If
    Next sh

    MsgBox "범례 해제 완료 — " & cnt & " 개 도형." & vbLf & vbLf & _
           "이제 양식 시트에서 도형을 좌클릭으로 선택·수정·교체·삭제할 수 있습니다 (그리기 모드 안 됨)." & vbLf & vbLf & _
           "수정이 끝나면 「▶ 양식 스캔」 을 다시 눌러 재등록하세요.", vbInformation, "범례 해제"
End Sub

' owner 2026-06-10: 양식 시트 「양식 스캔」 버튼 옆에 「범례 해제」 버튼 생성 (idempotent — 있으면 갱신).
Public Sub 양식_해제버튼_보장(ws As Worksheet)
    If ws Is Nothing Then Exit Sub
    Dim scanBtn As Shape: Set scanBtn = Nothing
    On Error Resume Next: Set scanBtn = ws.Shapes("_legend_form_scan_btn"): On Error GoTo 0

    Dim bx As Double, by As Double, bw As Double, bh As Double
    bw = 140: bh = 28
    If Not scanBtn Is Nothing Then
        bx = scanBtn.Left + scanBtn.Width + 8   ' 스캔 버튼 오른쪽 옆
        by = scanBtn.Top
        bh = scanBtn.Height
    Else
        bx = ws.Cells(1, 8).Left + 148
        by = ws.Cells(1, 1).Top
    End If

    On Error Resume Next: ws.Shapes("_legend_form_release_btn").Delete: On Error GoTo 0   ' 재생성

    Dim btn As Shape
    Set btn = ws.Shapes.AddShape(msoShapeRoundedRectangle, bx, by, bw, bh)
    btn.Name = "_legend_form_release_btn"
    btn.Placement = 3
    btn.Locked = False
    btn.Line.Visible = msoFalse
    btn.Fill.ForeColor.RGB = RGB(217, 119, 6)   ' 주황 (스캔=파랑과 구분)
    With btn.TextFrame2
        .HorizontalAnchor = msoAnchorCenter
        .VerticalAnchor = msoAnchorMiddle
        .MarginLeft = 0: .MarginRight = 0: .MarginTop = 0: .MarginBottom = 0
        With .TextRange
            .Text = "범례 해제"
            .Font.Bold = True
            .Font.Size = 11
            .Font.Fill.ForeColor.RGB = RGB(255, 255, 255)
            .ParagraphFormat.Alignment = msoAlignCenter
        End With
    End With
    btn.OnAction = "양식_범례_해제"
End Sub

' owner 2026-06-10: 기존 양식 시트에 「범례 해제」 버튼 추가 (Alt+F8 로 한 번 실행).
Public Sub 양식_해제버튼_추가()
    Dim ws As Worksheet
    On Error Resume Next: Set ws = ThisWorkbook.Worksheets(SHEET_LEGEND_FORM): On Error GoTo 0
    If ws Is Nothing Then
        MsgBox "「" & SHEET_LEGEND_FORM & "」 양식 시트가 없습니다.", vbExclamation, "버튼 추가": Exit Sub
    End If
    Dim wasProt As Boolean: wasProt = ws.ProtectContents
    On Error Resume Next: ws.Unprotect: On Error GoTo 0
    양식_해제버튼_보장 ws
    If wasProt Then 범례_양식_보호_복원 ws
    MsgBox "「범례 해제」 버튼을 「양식 스캔」 옆에 추가했습니다." & vbLf & _
           "이제 양식 시트에서 그 버튼을 클릭하면 도형 수정 모드로 들어갑니다.", vbInformation, "버튼 추가"
End Sub

Public Sub 범례_양식_스캔()
    Dim ws As Worksheet
    Set ws = Nothing
    On Error Resume Next: Set ws = ThisWorkbook.Worksheets(SHEET_LEGEND_FORM): On Error GoTo 0
    If ws Is Nothing Then
        MsgBox "「" & SHEET_LEGEND_FORM & "」 시트가 없습니다." & vbLf & vbLf & _
               "「범례 양식」 메뉴로 먼저 생성하세요.", vbExclamation, "양식 스캔"
        Exit Sub
    End If

    Dim wasProt As Boolean: wasProt = ws.ProtectContents
    If wasProt Then
        On Error Resume Next: ws.Unprotect: On Error GoTo 0
    End If

    Dim lastRow As Long: lastRow = ws.Cells(ws.Rows.Count, 2).End(xlUp).Row
    If lastRow < 2 Then
        MsgBox "양식에 등록할 row 가 없습니다." & vbLf & "B 컬럼 (명칭) 을 채운 row 가 필요합니다.", _
               vbInformation, "양식 스캔"
        If wasProt Then 범례_양식_보호_복원 ws
        Exit Sub
    End If

    Dim oUpd As Boolean: oUpd = Application.ScreenUpdating
    Application.ScreenUpdating = False

    ' owner 2026-06-10: 스캔 전 기존 form 메타 전부 정리 — 양식에서 지운 도형이 콤보에 잔존하지 않게.
    '   (이름 기준 update 패턴은 삭제된 도형 메타를 못 지움 → 콤보 잔존. 통째 비우고 현재 도형만 재등록)
    Dim wsMetaC As Worksheet: Set wsMetaC = Nothing
    On Error Resume Next: Set wsMetaC = ThisWorkbook.Worksheets(SHEET_META_LEG): On Error GoTo 0
    If Not wsMetaC Is Nothing Then
        Dim mLastRow As Long: mLastRow = wsMetaC.Cells(wsMetaC.Rows.Count, 1).End(xlUp).Row
        Dim mr As Long
        For mr = mLastRow To 2 Step -1
            On Error Resume Next
            If CStr(wsMetaC.Cells(mr, 8).Value) = "form" Then wsMetaC.Rows(mr).Delete
            On Error GoTo 0
        Next mr
    End If
    ' owner 2026-06-10: 규격 등에 "1-4" 입력이 날짜로 변환되지 않게 B:E 텍스트 서식 (이미 날짜된 셀은 재입력 필요)
    On Error Resume Next: ws.Columns("B:E").NumberFormat = "@": On Error GoTo 0

    Dim addedCnt As Long: addedCnt = 0
    Dim updatedCnt As Long: updatedCnt = 0
    Dim skippedCnt As Long: skippedCnt = 0
    Dim skippedReasons As String: skippedReasons = ""
    Dim registeredList As String: registeredList = ""

    Dim r As Long
    For r = 2 To lastRow
        Dim nameVal As String, gubun As String, gyukgyeok As String, chuga As String
        nameVal = 양식_셀_텍스트(ws.Cells(r, 2))
        gubun = 양식_셀_텍스트(ws.Cells(r, 3))
        gyukgyeok = 양식_셀_텍스트(ws.Cells(r, 4))
        chuga = 양식_셀_텍스트(ws.Cells(r, 5))

        If Len(nameVal) = 0 Then
            skippedCnt = skippedCnt + 1
            ' owner 2026-06-08 (8-124-fix10): 한계 500/300 → 20000 (잘리지 않게 전체 표시)
            If Len(skippedReasons) < 20000 Then
                skippedReasons = skippedReasons & "  · row " & r & ": 명칭(B) 비어있음" & vbLf
            End If
            GoTo NextRow
        End If

        Dim shp As Shape
        Set shp = 양식_도형_찾기(ws, r, 6)

        If shp Is Nothing Then
            skippedCnt = skippedCnt + 1
            If Len(skippedReasons) < 20000 Then
                skippedReasons = skippedReasons & "  · row " & r & " (" & nameVal & "): F 셀 위 도형 없음" & vbLf
            End If
            GoTo NextRow
        End If

        ' 시스템 도형 (_legend_form_scan_btn 등) 제외 — 양식_도형_찾기 가 이미 처리하지만 이중 안전
        If Left(shp.Name, 1) = "_" Then
            skippedCnt = skippedCnt + 1
            GoTo NextRow
        End If

        ' owner 2026-06-08 (8-124-fix8): 명칭 (B 컬럼) 만으로 판단 — owner 명시 룰.
        '   명칭에 "케이블" 글자가 들어가면 케이블 (광케이블·접속케이블·전력케이블 모두).
        '   "케이블함체" 같은 모호한 경우는 명칭을 "함체" 로 입력하도록 owner 안내.
        Dim isCable As Boolean
        isCable = (InStr(nameVal, "케이블") > 0)

        ' 이미 양식 등록 도형인지 (prefix legend_fac_ / legend_cbl_)
        Dim wasRegistered As Boolean: wasRegistered = False
        If Len(shp.Name) >= Len(PREFIX_LEG_FAC) Then
            If Left(shp.Name, Len(PREFIX_LEG_FAC)) = PREFIX_LEG_FAC Then wasRegistered = True
        End If
        If Len(shp.Name) >= Len(PREFIX_LEG_CBL) Then
            If Left(shp.Name, Len(PREFIX_LEG_CBL)) = PREFIX_LEG_CBL Then wasRegistered = True
        End If

        Dim newName As String
        If wasRegistered Then
            newName = shp.Name
        Else
            If isCable Then
                newName = PREFIX_LEG_CBL & NewId8()
            Else
                newName = PREFIX_LEG_FAC & NewId8()
            End If
            On Error Resume Next: shp.Name = newName: On Error GoTo 0
        End If

        ' owner 2026-06-08 (8-124-fix): 양식 도형은 「양식 전용 place 모드」 OnAction 사용.
        '   기존 「범례_시설물_선택」/「범례_케이블_선택」 = draw 모드 (사용자 직접 그림 — 양식 모양 무시)
        '   신규 「범례_양식_시설물_선택」/「범례_양식_케이블_선택」 = place 모드 (양식 모양 그대로 복제)
        On Error Resume Next
        shp.OnAction = IIf(isCable, "범례_양식_케이블_선택", "범례_양식_시설물_선택")
        shp.Placement = 3
        shp.Locked = False
        On Error GoTo 0

        ' 도형 글자 보존 — 옛 「범례로_등록」 처럼 비우지 않음. 그대로 둠.

        ' kind 매핑
        Dim kindKey As String
        kindKey = 양식_명칭_kind_매핑(nameVal, isCable)

        ' 기존 메타 row 있으면 삭제 후 재추가 (update 패턴)
        Dim metaRow As Variant
        metaRow = MetaFindRow(SHEET_META_LEG, 1, newName)
        Dim isUpdate As Boolean: isUpdate = Not IsEmpty(metaRow)
        If isUpdate Then
            MetaDeleteRow SHEET_META_LEG, 1, newName
        End If

        ' 메타 등록 — 9 컬럼 (8 + owner 2026-06-10 Step C: 9번째 명칭 nameVal, 콤보 명칭별 그룹용)
        AppendMetaRow SHEET_META_LEG, _
            Array(newName, kindKey, gubun, Now, gyukgyeok, chuga, r, "form", nameVal)

        If isUpdate Then
            updatedCnt = updatedCnt + 1
        Else
            addedCnt = addedCnt + 1
        End If

        ' owner 2026-06-08 (8-124-fix10): 한계 500 → 20000 (전체 row 표시)
        If Len(registeredList) < 20000 Then
            registeredList = registeredList & "  · row " & r & ": " & nameVal & _
                             IIf(Len(gubun) > 0, "/" & gubun, "") & _
                             "  →  " & IIf(isCable, "[케이블]", "[시설물]") & vbLf
        End If

NextRow:
    Next r

    If wasProt Then 범례_양식_보호_복원 ws

    ' owner 2026-06-08 (8-124-fix9): 전체 결과를 별도 시트 「_scan_log」 에 출력 — MsgBox 길이 한계 우회.
    범례_양식_스캔_log_쓰기 addedCnt, updatedCnt, skippedCnt, registeredList, skippedReasons

    Application.ScreenUpdating = oUpd

    Dim msg As String
    msg = "양식 스캔 완료." & vbLf & vbLf
    msg = msg & "  • 신규 등록: " & addedCnt & " 건" & vbLf
    msg = msg & "  • 메타 업데이트: " & updatedCnt & " 건" & vbLf
    msg = msg & "  • 건너뜀: " & skippedCnt & " 건" & vbLf
    msg = msg & vbLf & "전체 분류 결과는 「_scan_log」 시트 확인 (자동 열림)." & vbLf
    msg = msg & "케이블 분류 조건: 명칭 (B 컬럼) 에 ""케이블"" 글자 포함."

    MsgBox msg, vbInformation, "양식 스캔"

    ' owner 2026-06-10 (Step C): 스캔 후 행정도 1행 콤보박스 자동 갱신 (데이터 있으면 조용히 생성)
    On Error Resume Next: 행정도_콤보_생성: On Error GoTo 0

    ' 결과 시트 자동 열기
    On Error Resume Next
    ThisWorkbook.Worksheets("_scan_log").Activate
    On Error GoTo 0
End Sub

' owner 2026-06-08 (8-124-fix10): 스캔 결과 별도 시트 출력 — 각 row 별 개별 row 로 표시 (cell wrap 의존 X).
Public Sub 범례_양식_스캔_log_쓰기(addedCnt As Long, updatedCnt As Long, skippedCnt As Long, _
                                    registeredList As String, skippedReasons As String)
    Dim wsLog As Worksheet: Set wsLog = Nothing
    On Error Resume Next: Set wsLog = ThisWorkbook.Worksheets("_scan_log"): On Error GoTo 0
    If wsLog Is Nothing Then
        Set wsLog = ThisWorkbook.Worksheets.Add(After:=ThisWorkbook.Sheets(ThisWorkbook.Sheets.Count))
        wsLog.Name = "_scan_log"
    Else
        On Error Resume Next: wsLog.Cells.Clear: On Error GoTo 0
    End If

    wsLog.Cells(1, 1).Value = "양식 스캔 결과 (" & Format(Now, "yyyy-mm-dd hh:mm:ss") & ")"
    wsLog.Cells(1, 1).Font.Bold = True
    wsLog.Cells(2, 1).Value = "신규 등록: " & addedCnt & " 건 / 메타 업데이트: " & updatedCnt & " 건 / 건너뜀: " & skippedCnt & " 건"

    Dim curRow As Long: curRow = 4
    wsLog.Cells(curRow, 1).Value = "■ 분류 결과:"
    wsLog.Cells(curRow, 1).Font.Bold = True
    curRow = curRow + 1

    ' registeredList 를 vbLf 로 분리해서 각 row 에 출력
    Dim regLines() As String
    regLines = Split(registeredList, vbLf)
    Dim i As Long
    For i = LBound(regLines) To UBound(regLines)
        If Len(Trim(regLines(i))) > 0 Then
            wsLog.Cells(curRow, 1).Value = regLines(i)
            curRow = curRow + 1
        End If
    Next i

    curRow = curRow + 2
    wsLog.Cells(curRow, 1).Value = "■ 건너뛴 사유:"
    wsLog.Cells(curRow, 1).Font.Bold = True
    curRow = curRow + 1

    Dim skipLines() As String
    skipLines = Split(skippedReasons, vbLf)
    For i = LBound(skipLines) To UBound(skipLines)
        If Len(Trim(skipLines(i))) > 0 Then
            wsLog.Cells(curRow, 1).Value = skipLines(i)
            curRow = curRow + 1
        End If
    Next i

    wsLog.Columns(1).ColumnWidth = 80
End Sub

' 양식 시트의 (row, col) 셀 위에 있는 도형 찾기.
'   owner 2026-06-08 (8-124-fix9): bbox overlap 매칭으로 변경 — 도형 중심이 셀 밖에 있어도 매칭.
'   작은 도형·셀 가장자리 도형 모두 잡힘. 가장 큰 overlap 면적의 도형 선택.
'   단일 Shape · Group 둘 다 처리. 시스템 도형 (_ prefix) 제외.
Public Function 양식_도형_찾기(ws As Worksheet, r As Long, c As Long) As Shape
    Set 양식_도형_찾기 = Nothing
    If ws Is Nothing Then Exit Function

    Dim cell As Range: Set cell = ws.Cells(r, c)
    Dim cL As Double, cT As Double, cR As Double, cB As Double
    cL = cell.Left: cT = cell.Top
    cR = cL + cell.Width: cB = cT + cell.Height

    Dim bestShp As Shape: Set bestShp = Nothing
    Dim bestOverlap As Double: bestOverlap = 0

    Dim sh As Shape
    For Each sh In ws.Shapes
        If Left(sh.Name, 1) <> "_" Then
            Dim sL As Double, sT As Double, sR As Double, sB As Double
            sL = sh.Left: sT = sh.Top
            sR = sL + sh.Width: sB = sT + sh.Height

            ' bbox overlap 계산
            Dim ovL As Double, ovT As Double, ovR As Double, ovB As Double
            ovL = IIf(sL > cL, sL, cL)
            ovT = IIf(sT > cT, sT, cT)
            ovR = IIf(sR < cR, sR, cR)
            ovB = IIf(sB < cB, sB, cB)

            If ovR > ovL And ovB > ovT Then
                Dim overlapArea As Double
                overlapArea = (ovR - ovL) * (ovB - ovT)
                If overlapArea > bestOverlap Then
                    bestOverlap = overlapArea
                    Set bestShp = sh
                End If
            Else
                ' owner 2026-06-09 (8-124-fix14): 직선·세로선 도형은 Width 또는 Height = 0 이라 bbox 면적 0.
                '   ovB > ovT 또는 ovR > ovL 검사 통과 못함. 중심점이 셀 안인지로 폴백.
                Dim isThin As Boolean
                isThin = (sh.Width < 1) Or (sh.Height < 1)
                If isThin Then
                    Dim ccx As Double, ccy As Double
                    ccx = (sL + sR) / 2: ccy = (sT + sB) / 2
                    If ccx >= cL And ccx <= cR And ccy >= cT And ccy <= cB Then
                        ' 면적 매칭이 아직 없을 때만 선택 (면적 도형 우선)
                        If bestOverlap = 0 And bestShp Is Nothing Then
                            Set bestShp = sh
                        End If
                    End If
                End If
            End If
        End If
    Next sh

    Set 양식_도형_찾기 = bestShp
End Function

' 명칭 → kind 매핑 (자유 입력 지원).
'   "케이블" → "cable" / "설치장소" → "station" / "시설물" → "facility" /
'   "접속함체" → "closure" / "RN"·"광MUX"·"IJP" → "rn"
'   그 외 자유 입력 → "facility" (시설물 일반 fallback)
Public Function 양식_명칭_kind_매핑(nameVal As String, isCable As Boolean) As String
    If isCable Then 양식_명칭_kind_매핑 = "cable": Exit Function
    Select Case nameVal
        Case "설치장소":           양식_명칭_kind_매핑 = "station"
        Case "시설물":              양식_명칭_kind_매핑 = "facility"
        Case "접속함체":           양식_명칭_kind_매핑 = "closure"
        Case "RN", "광MUX", "IJP": 양식_명칭_kind_매핑 = "rn"
        Case Else:                  양식_명칭_kind_매핑 = "facility"
    End Select
End Function

' owner 2026-06-10: 양식 셀 텍스트 — "1-4" 가 Excel 에서 날짜(Date)로 변환됐으면 "m-d" 로 복원 (규격 등).
'   텍스트 서식만으론 이미 날짜값이 된 셀은 못 고침 → 읽을 때 Date 타입이면 원본 "월-일" 복원.
Public Function 양식_셀_텍스트(c As Range) As String
    양식_셀_텍스트 = ""
    On Error Resume Next
    Dim raw As Variant: raw = c.Value
    If IsEmpty(raw) Then Exit Function
    ' "1-4" 가 Excel 에서 날짜로 변환된 케이스 (Date 타입이든 "2026-01-04" 텍스트든) → "월-일" 복원
    If IsDate(raw) Then
        양식_셀_텍스트 = Format(CDate(raw), "m-d")
    Else
        양식_셀_텍스트 = Trim(CStr(raw))
    End If
    On Error GoTo 0
End Function

' 양식 시트 보호 복원 — 헤더만 잠금, row 추가/삭제 자유.
Public Sub 범례_양식_보호_복원(ws As Worksheet)
    If ws Is Nothing Then Exit Sub
    On Error Resume Next
    ws.Cells.Locked = False
    ws.Range("A1:F1").Locked = True
    ws.Protect Password:="", DrawingObjects:=False, Contents:=True, _
               AllowFormattingCells:=True, AllowFormattingColumns:=True, AllowFormattingRows:=True, _
               AllowInsertingRows:=True, AllowDeletingRows:=True, AllowSorting:=True, AllowFiltering:=True
    On Error GoTo 0
End Sub
