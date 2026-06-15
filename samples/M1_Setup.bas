Attribute VB_Name = "M1_Setup"
Option Explicit

' ============================================================================
'  AdminMapDesigner — 행정도 설계 매크로 모듈
'
'  사용 순서:
'    1. 매크로 「행정도_초기화」 한 번 실행 (시트 구성 확인 + 이벤트 핸들러 주입)
'    2. 행정도 시트에 캡처 이미지 붙여넣기 → 매크로 「배경_잠그기」
'    3. Excel 「삽입 > 도형」 으로 시설물·케이블 도형 그림 → 「범례로_등록」
'    4. 범례 도형 클릭 → 셀 클릭으로 배치 / 케이블 그리기
'    5. 도형 클릭 → 정보 + 「✕ 삭제」 (양방향 cascade)
'    6. 「정보_적용」 — 행정도 ↔ 네트웍구성도 정보 동기화 (위치 제외)
'
'  주의:
'    - 「행정도_초기화」 가 ThisWorkbook 에 이벤트 핸들러를 주입합니다.
'      Excel 옵션 → 보안 센터 → 「VBA 프로젝트 개체 모델 액세스 신뢰」 체크 필요.
'    - 임포트 실패 시 .bas 메모장에서 첫 줄 Attribute 만 제거 후 새 모듈에 붙여넣기.
' ============================================================================

' ===== 시트명 / prefix =====
Public Const SHEET_ADMIN As String = "행정도"
Public Const SHEET_NETWORK As String = "네트웍구성도"
Public Const SHEET_META_FAC As String = "_시설물"
Public Const SHEET_META_CBL As String = "_케이블"
Public Const SHEET_META_LEG As String = "_범례"
Public Const SHEET_META_LABEL As String = "_라벨_마스터"  ' 자주 쓰는 라벨 (kind, label, created_at)

Public Const PREFIX_FAC As String = "fac_"
Public Const PREFIX_CBL As String = "cbl_"
Public Const PREFIX_LEG_FAC As String = "legend_fac_"
Public Const PREFIX_LEG_CBL As String = "legend_cbl_"
Public Const PREFIX_LEG_LABEL As String = "leglbl_"   ' 범례 왼쪽 이름 텍스트 (심볼 좌측)
Public Const PREFIX_WP_TMP As String = "_wp_tmp_"
Public Const PREFIX_LABEL As String = "lbl_"     ' 시설물 설명선 (텍스트박스 3줄)
Public Const PREFIX_LEADER As String = "lead_"   ' 설명선 리더 (연결선)
Public Const PREFIX_CBL_X As String = "_cbl_x_"  ' owner 2026-06-09 (8-125): 철거 케이블 위 X자 마크
Public Const BG_NAME As String = "_background"
Public Const PREFIX_BG_PIECE As String = "_bg_piece_"
Public Const PRINT_BG_NAME As String = "_print_bg"
Public Const PRINT_BG_EMBED_NAME As String = "_print_bg_embed"
Public Const PANEL_PREFIX As String = "_panel_btn_"
Public Const PANEL_BTN_W As Double = 80
Public Const PANEL_BTN_H As Double = 26
Public Const PANEL_BTN_GAP As Double = 4
Public Const PANEL_OFFSET As Double = 6
Public Const PANEL_LEGEND_DD_PREFIX As String = "_panel_legend_dd_"           ' Form Control 콤보박스 (xlDropDown)
Public Const PANEL_LEGEND_DD_LABEL_PREFIX As String = "_panel_legend_ddlbl_"  ' 콤보박스 왼쪽 카테고리 라벨
Public Const PANEL_DROPDOWN_W As Double = 110
Public Const PANEL_DROPDOWN_H As Double = 22                                   ' 콤보박스 높이 (Form Control 표준)

' owner 2026-06-10 (Step C): 행정도 1행 콤보박스 — 양식 시트 도형을 명칭별 구분·규격·추가 콤보로 선택.
'   기존 콤보(110×22)의 0.6 배. PREFIX_ADMIN_COMBO 가 _LBL/_PV 의 substring 이므로 Left 비교 시 순서 주의.
Public Const PREFIX_ADMIN_COMBO As String = "_admin_combo_"          ' 콤보박스 (xlDropDown)
Public Const PREFIX_ADMIN_COMBO_LBL As String = "_admin_combo_lbl_"  ' 명칭 라벨 텍스트박스
Public Const PREFIX_ADMIN_COMBO_PV As String = "_admin_combo_pv_"    ' 선택 도형 미리보기
Public Const ADMIN_COMBO_W As Double = 66                            ' 110 * 0.6
Public Const ADMIN_COMBO_H As Double = 13.2                          ' 22 * 0.6
Public Const ADMIN_COMBO_LBL_W As Double = 60                        ' 명칭 라벨 — 잘림 방지 (콤보만 0.6, 라벨은 명칭 길이 맞춤)
' owner 2026-06-10: 행정도 1행 검색 3버튼 (콤보 다음 배치) — 콤보·버튼 모두 가로 스크롤 추종(_콤보_위치갱신).
Public Const PREFIX_ADMIN_SEARCH_BTN As String = "_admin_sbtn_"      ' 검색 버튼 (xlButtonControl)
Public Const ADMIN_SBTN_W As Double = 60
Public Const ADMIN_SBTN_H As Double = 18
' owner 2026-06-10: 네트웍구성도 1행 = 검색버튼 높이(격자는 2행부터). 네트웍 격자 원점 Y = NW_TOP_H.
Public Const PREFIX_NW_SEARCH_BTN As String = "_nw_sbtn_"            ' 네트웍 검색 버튼
Public Const NW_TOP_H As Double = 22                                 ' 네트웍 1행(검색바) 높이 = 버튼 18 + 여백

' 범례 옵션 콤보 — 선택된 범례 도형 옆에 표시. 시설물=크기% 4단계, 케이블=두께 가산 7단계.
'   콤보값 → 그 범례 도형의 AlternativeText 에 저장 → FinalizeDrawnFacility/Cable 가 읽어 새 도형에 적용.
Public Const PANEL_LEGEND_OPT_PREFIX As String = "_panel_legopt_"     ' xlDropDown — _panel_legopt_facility 등
Public Const PANEL_LEGEND_OPT_W As Double = 70
Public Const PANEL_LEGEND_OPT_H As Double = 22

' Undo cascade 가드 — 시설물_삭제 안에서 케이블_삭제 가 호출될 때 「별도 undo 기록 안 함」
Public g_undo_cascade_suppress As Boolean

' Undo / Redo 스택 — 「작업 기록 (B)」 방식
'   변경 매크로마다 「Action_저장 kind, payload, label」 호출 → 변경분만 row 1개로 기록
'   ← (되돌리기): 마지막 undo row 보고 kind 별 역동작 실행 + redo 스택으로 이동
'   → (다시 실행): 마지막 redo row 보고 kind 별 정동작 실행 + undo 스택으로 이동
'   스택 크기 20 초과 시 가장 오래된 것 삭제. 새 동작 시 redo 스택 비움
'   시트 snapshot 방식 (A) 대비 100배 빠름 (시설물 많아도 변경분만 기록)
Public Const UNDO_MAX As Long = 20
Public Const UNDO_LOG_SHEET As String = "_undo_log"

' 리본 (CommandBars) 식별자 — 「추가 기능」 탭의 매크로 바 이름
Public Const RIBBON_BAR_NAME As String = "행정도설계_매크로바"
Public Const PANEL_DD_LABEL_W As Double = 50                                   ' 카테고리 라벨 폭

' 네트웍구성도 격자 — 시설물 배치 가이드 (노란 십자 격자, 20x20 셀이 한 칸)
Public Const GRID_PREFIX As String = "_grid_"          ' 격자 보조선 이름 prefix
Public Const GRID_COLS_PER_CELL As Long = 20            ' 격자 한 칸 가로 셀 수
Public Const GRID_ROWS_PER_CELL As Long = 20            ' 격자 한 칸 세로 셀 수
Public Const GRID_CELLS_X As Long = 12                  ' 가로 격자 칸 수 (12 칸 → 240 col)
Public Const GRID_CELLS_Y As Long = 10                  ' 세로 격자 칸 수 (10 칸 → 200 row)
Public Const GRID_LINE_WEIGHT As Double = 6             ' 격자선 굵기 (point)
Public Const GRID_LINE_COLOR As Long = 60415            ' RGB(255, 235, 0) 노랑 = 255 + 235*256

' 시설물 번호 배지 (네트웍: 큰 청록 사각형 + 검정 / 행정도: 파랑 작은 박스 + 흰 글자)
Public Const PREFIX_BADGE As String = "badge_"
Public Const BADGE_W As Double = 38                    ' 네트웍 기본 (상태박스에 맞춰 동적)
Public Const BADGE_H As Double = 38
Public Const BADGE_FILL_COLOR As Long = 16777062       ' RGB(102,255,255) 청록 (owner 2026-06-07 8-72)
Public Const BADGE_TEXT_COLOR As Long = 0              ' RGB(0,0,0) 검정 (네트웍)
Public Const BADGE_FILL_COLOR_ADMIN As Long = 16777062 ' RGB(102,255,255) 청록 — 행정도·네트웍 통일 (owner 2026-06-07 8-72)
Public Const BADGE_TEXT_COLOR_ADMIN As Long = 0        ' RGB(0,0,0) 검정 (행정도 — 밝은 청록 배경 가독성)
Public Const BADGE_FONT_SIZE_ADMIN As Single = 11      ' 행정도 폰트
Public Const BADGE_FONT_SIZE_NETWORK As Single = 12    ' 네트웍 폰트 (owner 요구 — 작게)

' 시설물 상태 박스 — callout 위 분홍 박스. 콤보 「주간/야간」 선택값을 3줄 표시
Public Const PREFIX_FAC_STATUS As String = "_fac_status_"
Public Const FAC_STATUS_W As Double = 90
Public Const FAC_STATUS_H As Double = 50
Public Const FAC_STATUS_FILL As Long = 16751103        ' RGB(255,153,255) 연분홍 (owner 2026-06-07 8-72)
Public Const FAC_STATUS_TEXT_BLUE As Long = 13107200   ' RGB(0,0,200) 진한 파랑 (야간 줄)
Public Const FAC_STATUS_TEXT_DEFAULT As Long = 0       ' RGB(0,0,0) 검정 (주간·기본)
Public Const CALLOUT_FONT_NAME As String = "LG스마트체 Regular"
Public Const CALLOUT_FONT_SIZE As Single = 11

' 네트웍구성도 시설물 callout 위 「태그 콤보박스」 + 태그 텍스트박스 누적
'   콤보 옵션: 함체작업:주간 / 함체작업:야간 / 코어접속 (코어접속은 InputBox 로 값 받음)
'   주간·야간 = 토글 (있으면 삭제, 없으면 추가), 코어접속 = 값 입력 (빈 칸 = 삭제)
Public Const PREFIX_FAC_TAG As String = "_fac_tag_"           ' 태그 텍스트박스 (옵션별 1개)
Public Const PREFIX_FAC_TAG_DD As String = "_fac_tag_dd_"     ' 콤보박스 (시설물별 1개)

' 코어 박스 — 시설물 공유 케이블 2개 끝에 「코어 선번」 박스 + 두 박스 사이 화살표
Public Const PREFIX_PAIRBOX As String = "_pairbox_"           ' 코어 박스 (텍스트박스, 자동 사이즈)
Public Const PREFIX_PAIRARROW As String = "_pairarrow_"       ' 코어 박스 사이 화살표 (elbow connector)

' 코어 연결 — 시각적 매핑 도구 (별도 시트 「_선번연결_도구」)
Public Const SHEET_PAIR_TOOL As String = "_선번연결_도구"
Public Const PREFIX_PT_L As String = "_pt_L_"                 ' Cable A 코어 박스
Public Const PREFIX_PT_R As String = "_pt_R_"                 ' Cable B 코어 박스
Public Const PREFIX_PT_RIN As String = "_pt_RIN_"             ' RN IN 코어 박스 (RN 3-column 모드)
Public Const PREFIX_PT_ROUT As String = "_pt_ROUT_"           ' RN OUT 코어 박스 (RN 3-column 모드)
Public Const PREFIX_PT_LINE As String = "_pt_line_"           ' 매핑 연결선
Public Const PREFIX_PT_BTN As String = "_pt_btn_"             ' 도구 버튼·헤더·UNIT 라벨

' 코어 연결 도구 state (volatile, module-scope)
Public g_pt_mappings As Object              ' Dictionary: leftCoreNo -> rightCoreNo (이번 세션 신규)
Public g_pt_count1 As Long                  ' Cable A 총 코어 수
Public g_pt_count2 As Long                  ' Cable B 총 코어 수
Public g_pt_cbl1Name As String              ' Cable A shape name (네트웍구성도)
Public g_pt_cbl2Name As String              ' Cable B shape name
Public g_pt_facId As String                 ' 공통 시설물 id (기존 박스 검색 기준)
Public g_pt_spec1 As String
Public g_pt_spec2 As String
Public g_pt_unitSize1 As Long               ' Cable A 의 UNIT 당 코어 수 (≤36C → 6, >36C → 12)
Public g_pt_unitSize2 As Long               ' Cable B 의 UNIT 당 코어 수
Public g_pt_expandedA As Object             ' Dictionary<unitN, True> — Cable A 펼친 UNIT 집합
Public g_pt_expandedB As Object             ' Dictionary<unitN, True> — Cable B 펼친 UNIT
Public g_pt_selA As Object                  ' Dictionary<coreN, True> — Cable A 현재 선택 코어
Public g_pt_selB As Object                  ' Dictionary<coreN, True> — Cable B 현재 선택 코어
Public g_pt_anchorA As Long                 ' shift+click 범위 시작점 (마지막 plain-click) — A
Public g_pt_anchorB As Long                 ' shift+click 범위 시작점 — B
Public g_pt_existingA As Object             ' Dictionary<coreA, True> — 기존 박스로 이미 사용된 코어 (잠금)
Public g_pt_existingB As Object             ' Dictionary<coreB, True>
Public g_pt_existingConns As Object         ' Dictionary<arrowName, "boxA|boxB|coresA|coresB"> — 기존 연결 목록 (삭제 가능)
Public g_pt_existingMappings As Object      ' Dictionary<leftCoreN, rightCoreN> — 기존 연결의 코어 1:1 매핑 (잠금 시각화용)
Public g_pt_releaseMode As Boolean          ' 해제 모드 — true 일 때 코어 클릭은 해제 토글
Public g_pt_releaseArrName As String        ' 해제 모드 대상 화살표 이름
Public g_pt_releasePairs As Object          ' Dictionary<aCore, bCore> — 대상 화살표의 모든 코어 짝
Public g_pt_releaseSelected As Object       ' Dictionary<aCore, True> — 해제하기로 선택한 코어 (A 기준)
' RN 3-column 모드 — 좌(Cable A) | 중(RN IN/OUT grid) | 우(Cable B)
Public g_pt_rnMode As Boolean               ' true 일 때 시트빌드 가 3-column 으로 그림
Public g_pt_rnSpec As String                ' RN 규격 ("2:16" / "1:3" / "1:16" / "M:N")
Public g_pt_rnTier As Long                  ' owner 2026-06-05: RN 차수 (1=1차 m / 2=2차 s / 3=3차 p)
Public g_pt_rnInCount As Long               ' RN IN 코어 수
Public g_pt_rnOutCount As Long              ' RN OUT 코어 수
Public g_pt_rnLabel As String               ' RN 라벨 prefix ("i_1차" / "m_2차" / "s_3차" / "rn_<spec>")
Public g_pt_selRN_IN As Object              ' Dictionary<rnInN, True> — RN IN 선택
Public g_pt_selRN_OUT As Object             ' Dictionary<rnOutN, True> — RN OUT 선택
Public g_pt_mappingsA_IN As Object          ' Dictionary<aCore, rnInCore> — Cable A ↔ RN IN 이번 세션 매핑
Public g_pt_mappingsOUT_B As Object         ' Dictionary<rnOutCore, bCore> — RN OUT ↔ Cable B 이번 세션 매핑
Public g_pt_anchorRN_IN As Long             ' shift+click anchor for RN IN
Public g_pt_anchorRN_OUT As Long            ' shift+click anchor for RN OUT
Public g_pt_existingRN_IN As Object         ' Dictionary<rnInCore, True> — 기존 잠금 RN IN
Public g_pt_existingRN_OUT As Object        ' Dictionary<rnOutCore, True> — 기존 잠금 RN OUT
Public g_pt_existingMappingsA_IN As Object  ' Dictionary<aCore, rnInCore> — 기존 RN 잠금 매핑 (회색 선 시각화)
Public g_pt_existingMappingsOUT_B As Object ' Dictionary<rnOutCore, bCore> — 기존 RN 잠금 매핑
' RN1 모드 (owner 변경) — RN + Cable 1 개 만 선택. Cable 코어 ↔ RN IN OR Cable 코어 ↔ RN OUT 매핑.
Public g_pt_rn1Mode As Boolean
Public g_pt_mappingsA_OUT As Object         ' Dictionary<aCore, rnOutCore> — Cable A ↔ RN OUT (이번 세션)
Public g_pt_existingMappingsA_OUT As Object ' Dictionary<aCore, rnOutCore> — 기존 잠금 RN1 매핑
' owner 2026-06-06: 기존 RN 연결정보에서 추출한 차수 (m/s/p prefix 발견 시 1/2/3). 0=미발견.
'   Step2진입_RN/RN1 가 picker 진입 여부 판정 시 사용 — 기존 연결정보가 있으면 picker 건너뛰고 바로 매핑 UI.
Public g_pt_existingTier As Long
' owner 2026-06-05: RN 차수·규격 picker (InputBox 대체) — 시트 안 버튼으로 선택.
'   Step2진입_RN/RN1 가 tier 또는 spec 미정인 채 진입하면 picker 모드로 들어가 시트빌드가 picker UI 렌더.
'   사용자가 차수·규격 버튼 클릭 + 「확인」 → picker 모드 해제 + Step2진입_RN/RN1 재진입.
Public g_pt_rnPickerMode As Boolean         ' True 동안 시트빌드 는 picker UI 만 렌더
Public g_pt_rnPickerCblA As String          ' picker 진입 시 저장한 cable A 이름 (확인 시 Step2 재진입 인자)
Public g_pt_rnPickerCblB As String          ' picker 진입 시 저장한 cable B 이름 (RN1 면 cblA 와 동일)
Public g_pt_rnPickerIsRN1 As Boolean        ' True 면 RN1 (단일 케이블) 모드 picker
' 박스추가 모드 (owner 2026-06-05) — ON 인 상태에서 「연결완료」 누르면 기존 같은짝 박스에 merge 하지 않고
'   같은 방향에 새 박스 페어 생성 + 이전 박스와 cascading 화살표 연결. 1회 사용 후 자동 OFF (다음 합치기 흐름 복귀).
Public g_pt_addBoxMode As Boolean
' 머지 타깃 (owner 2026-06-05) — 「기존 연결」 entry 의 「+ 코어」 버튼 클릭 시 그 entry 의 arrow.Name 저장.
'   다음 「연결완료」 가 그 entry 의 박스 (canonical 또는 cascade) 에 머지. 머지 완료 후 자동 reset.
Public g_pt_mergeTargetArrName As String
' RN 그룹 부분 해제 모드 — 「일부」 버튼 → 그룹의 페어 클릭으로 선택 → 「해제 확인」 시 페어 단위 삭제
Public g_pt_rnReleaseMode As Boolean
Public g_pt_rnReleaseGrpId As String         ' 부분 해제 중인 그룹 ID
Public g_pt_rnReleaseTargetA As Object       ' Dictionary<aCore, True> — 그룹의 Cable A 코어 (amber)
Public g_pt_rnReleaseTargetB As Object       ' Dictionary<bCore, True> — 그룹의 Cable B 코어 (amber)
Public g_pt_rnReleaseSelA As Object          ' Dictionary<aCore, True> — 선택된 A (rose)
Public g_pt_rnReleaseSelB As Object          ' Dictionary<bCore, True> — 선택된 B (rose)
' owner 2026-06-06: RN 측 (IN·OUT) 도 부분 해제 모드에서 amber/rose 가능. cable 측과 동일 패턴.
Public g_pt_rnReleaseTargetIN As Object      ' Dictionary<rnInCore, True> — 그룹의 RN IN 코어 (amber)
Public g_pt_rnReleaseTargetOUT As Object     ' Dictionary<rnOutCore, True> — 그룹의 RN OUT 코어 (amber)
Public g_pt_rnReleaseSelIN As Object         ' Dictionary<rnInCore, True> — 선택된 IN (rose)
Public g_pt_rnReleaseSelOUT As Object        ' Dictionary<rnOutCore, True> — 선택된 OUT (rose)
Public g_pt_step As Long                    ' 1 = 방사형 케이블 선택, 2 = 코어 매핑
Public g_pt_radial As Object                ' Dictionary<cblName, "otherFacName|spec|installation"> — 연결된 케이블 정보
Public g_pt_pickedCables As Object          ' Dictionary<key, count> — 케이블 이름 또는 시설물 ID (= g_pt_facId). count 1 또는 2
Public g_pt_side1Type As String             ' "cable" 또는 "facility" — Step2 진입 시 결정
Public g_pt_side2Type As String
Public g_pt_selUnitsA As Object             ' Dictionary<unitN, True> — Cable A 선택된 UNIT
Public g_pt_selUnitsB As Object             ' Dictionary<unitN, True> — Cable B 선택된 UNIT

' owner 2026-06-06 (8-32): 코어 추적 도구 state (Phase 1 — 직접 하이라이트)
Public g_track_originalStyles As Object     ' Dictionary<shapeName, "type|lineColor|lineWeight|fillColor">
Public g_track_persistMode As Boolean       ' 추적 유지 모드 (다음 추적까지 하이라이트 보존)
' owner 2026-06-07 (8-47): 트레이스 간 색상 구분 — 다음 트레이스가 직전 마지막 색의 다음 인덱스부터 시작.
'   해제·지우기 시 0 으로 리셋.
Public g_track_colorOffset As Long
' owner 2026-06-07 (8-50): 박스→배지 shape 이름 Collection 을 트레이스 간 누적.
'   local dict 면 매 트레이스마다 0 슬롯부터 재시작 → 직전 배지와 겹침. module-level 로 승격해 8-43 재배치가 양쪽 다 인지.
Public g_track_badgeShapes As Object
' owner 2026-06-08 (8-80): 코어 추적 ≤4 코어 모드에서 박스 양옆에 추가된 endpoint 배지 dedup.
'   Key = 박스명, Value = True. 코어_추적_해제 시 RemoveAll.
Public g_track_endpointBoxes As Object
' owner 2026-06-08 (8-98): 직전 코어 호출에서 성공한 endpoint facId 캐시 — single-facility path 코어 (3,4,13 등)
'   가 자체 path 로 endpoint 못 찾을 때 이 글로벌로 fallback. 코어_추적_해제 시 초기화.
Public g_track_lastWstFacId As String
Public g_track_lastEstFacId As String
' owner 2026-06-08 (8-81): 검색 강조 — 강조된 도형 원본 스타일 백업.
'   Key = "<sheetName>|<shapeName>", Value = "lineColor=<x>|lineWeight=<y>"
Public g_search_highlighted As Object
' owner 2026-06-08 (8-82): 검색 UserForm 입력값 전달용 module-level vars.
'   form 의 OK 버튼이 값을 채워넣은 후 Hide → 호출자가 읽어서 검색.
Public g_search_form_qBadge As String
Public g_search_form_qName As String
Public g_search_form_qFacId As String
Public g_search_form_qCblId As String
Public g_search_form_confirmed As Boolean

' owner 2026-06-06 (8-37): 라이센스 시스템 상수 — 모든 Private Const 는 파일 상단 declarations 섹션에 와야 함 (VBA 규칙).
Public Const LICENSE_SALT As String = "edenMG_2026_FiberDesign_v1_SecretSalt_DoNotShare_q9Z7$kP"
Public Const LICENSE_BUILD As String = "v1"
Public Const LICENSE_GRACE_DAYS As Long = 7
Public Const LICENSE_WARN_DAYS As Long = 14
Public Const LICENSE_SPLASH_SHEET As String = "_라이센스_안내"
Public Const LICENSE_DEV_FLAG_PROP As String = "LicenseDevMode"
Public Const LICENSE_USER_PROP As String = "LicenseUser"
Public Const LICENSE_ISSUED_PROP As String = "LicenseIssued"
Public Const LICENSE_EXPIRES_PROP As String = "LicenseExpires"
Public Const LICENSE_HWID_PROP As String = "LicenseHWID"
Public Const LICENSE_HASH_PROP As String = "LicenseHash"

#If VBA7 Then
Public Declare PtrSafe Function PT_GetKeyState Lib "user32" Alias "GetKeyState" (ByVal nVirtKey As Long) As Integer
#Else
Public Declare Function PT_GetKeyState Lib "user32" Alias "GetKeyState" (ByVal nVirtKey As Long) As Integer
#End If
Public Const PT_VK_SHIFT As Long = &H10
Public Const PT_VK_CONTROL As Long = &H11
Public Const PREFIX_PT_RADIAL As String = "_pt_radial_"      ' 방사형 케이블 도형
Public Const PREFIX_PT_RADIALLBL As String = "_pt_radlab_"   ' 방사형 끝점 시설물명 라벨
Public Const FAC_TAG_H As Double = 18                          ' 태그 1줄 높이
Public Const FAC_TAG_DD_H As Double = 18                       ' 콤보 높이
Public Const FAC_TAG_GAP As Double = 1                         ' 박스 간 간격

' ===== 셀 격자 =====
Public Const CELL_PT As Double = 15#         ' 셀 가로·세로 = 15 point ≈ 20 px
Public Const LEGEND_ROWS As Long = 1         ' 1행=범례(카테고리 콤보 + 옵션 콤보 세로 2단). 2행부터 행정도. (매크로 버튼은 리본 「추가 기능」 탭)
Public Const LEGEND_ROW_HEIGHT As Double = 55      ' 1행 높이 (카테고리 콤보 22 + 간격 2 + 옵션 콤보 22 = 46 + 여유 9)

' ===== 도형 크기 =====
Public Const FAC_DEFAULT_W As Double = 80    ' 시설물 기본 80×80 point
Public Const FAC_DEFAULT_H As Double = 80
Public Const LABEL_W As Double = 130         ' 설명선 텍스트박스 폭
Public Const LABEL_H As Double = 66          ' 설명선 텍스트박스 높이 (3줄 — 잘림 방지 여유)
Public Const CBL_LINE_WEIGHT As Double = 2.5
Public Const CBL_DEFAULT_COLOR As Long = 12614173 ' RGB(29, 78, 192) 파랑 계열

' ===== 모드 상태 (휘발성) =====
Public g_mode As String                       ' "" / "place_facility" / "place_cable"
Public g_legendShape As String                ' 선택된 범례 도형 이름
Public g_legendLabel As String                ' 범례 라벨 (사용자 입력)
Public g_cableFromId As String                ' 케이블 시작 시설물 도형 이름
Public g_cableSpec As String                  ' 케이블 규격 라벨 (메타 spec 4번 컬럼 — 코어연결 코어수 파싱원. 깨끗하게 유지)
Public g_cableGubun As String                 ' 케이블 구분 (메타 7번 컬럼 별도 저장 — 기별명세서 추출용. owner 2026-06-10)
Public g_cableWaypoints As Collection         ' 경로점 ((Left, Top) Array)
' owner 2026-06-08 (8-118): 방향키 hold chain 의 「기준 시설물」 — 마지막 그린 시설물 자동 / 「기준 시설물 설정」 메뉴로 점프.
'   비어있으면 (= "") 다음 키 hold + 빈셀 클릭 시 「시작 격자 좌표」 InputBox 진입.
Public g_selectedFacId As String

' owner 2026-06-09 (8-125-fix3): 철거 X 마크 실시간 조절 — 매크로 「철거_X마크_조정」 으로 변경 가능
Public g_xRemovalInterval As Double    ' X 사이 간격(pt), 0 이면 기본값 8.33
Public g_xRemovalHalf As Double         ' X 한 팔 길이(pt), 0 이면 기본값 1.75
Public g_xRemovalWeightRatio As Double  ' X 두께 / 케이블 두께, 0 이면 기본값 0.5

' ===== 네이티브 그리기(십자) 자동 감지 상태 (휘발성) =====
Public g_drawKind As String                   ' 그리기 대기 시설물 종류(라벨)
Public g_drawLegendName As String             ' 그리기 대기 범례 도형 이름
Public g_drawBaseline As Object               ' 그리기 직전 도형 이름 스냅샷 (Scripting.Dictionary — Exists 로 비-오류 룩업)
Public g_drawPolls As Long                    ' 남은 자동 감지 polling 횟수
Public g_deleteMode As Boolean                ' 삭제 모드 (클릭=양 시트 동시 삭제)
Public g_legendDeleteMode As Boolean          ' 범례 삭제 모드 (범례 클릭=그 범례 삭제)
Public g_legendUnregisterMode As Boolean      ' 범례 해제 모드 (범례 클릭=등록만 풀기, 도형 유지)

' ===== 라벨 필터 (휘발성) =====
' 「라벨로 그리기」 진입 시 그 라벨로 설정 → UpdateFloatingPanelPosition 이 그 라벨의 범례만
'   visible 로 두고 나머지는 숨김. ResetMode 가 비우면 전체 복귀.
Public g_drawLabel As String

' ===== 5 분류 드롭다운 선택 상태 (휘발성) — 각 카테고리별 독립 =====
'   각 드롭다운에서 선택한 라벨을 카테고리별로 저장. UpdateFloatingPanelPosition 이 4개 모두 visible 처리.
Public g_selectedLabel_facility As String
Public g_selectedLabel_station As String     ' owner — 신규 「시설물」 종류
Public g_selectedLabel_closure As String
Public g_selectedLabel_rn As String
Public g_selectedLabel_cable As String

' ============================================================================
'  1. 셋업
' ============================================================================
Public Sub 행정도_초기화()
    ' Undo 스택 전체 정리 (옛 snapshot 시트 잔재 안 남게)
    Undo_초기화
    EnsureSheet SHEET_ADMIN, xlSheetVisible
    EnsureSheet SHEET_NETWORK, xlSheetVisible
    EnsureSheet SHEET_META_FAC, xlSheetVeryHidden, _
                Array("id", "type", "name", "created_at", "badge_no")
    EnsureSheet SHEET_META_CBL, xlSheetVeryHidden, _
                Array("id", "from_id", "to_id", "spec", "waypoints_csv", "created_at", "gubun")
    EnsureSheet SHEET_META_LEG, xlSheetVeryHidden, _
                Array("legend_shape_name", "kind", "label", "created_at")

    ' 라벨 마스터 — 자주 쓰는 라벨 시드 자동 채움 (기존 파일에도 적용 — 시트 없으면 생성)
    EnsureLabelMaster

    ' 격자선 숨김 + 셀 기본 폰트 LG스마트체
    Dim ws As Worksheet
    For Each ws In ThisWorkbook.Worksheets
        If ws.Name = SHEET_ADMIN Or ws.Name = SHEET_NETWORK Then
            ws.Activate
            ActiveWindow.DisplayGridlines = False
            On Error Resume Next
            ws.Cells.Font.Name = CALLOUT_FONT_NAME    ' 시트 전체 셀 기본 폰트 = LG스마트체
            On Error GoTo 0
        End If
    Next ws
    ThisWorkbook.Worksheets(SHEET_ADMIN).Activate

    ' 이벤트 핸들러 주입
    InjectEventHandlers

    ' 버튼 패널 생성 (행정도 시트)
    On Error Resume Next
    버튼패널_생성
    On Error GoTo 0

    ' 상단 2행 틀고정 — 아래쪽을 그릴 때도 버튼·범례가 화면 맨 위에 고정
    상단2행_틀고정

    ' 네트웍구성도 — 시설물 배치 가이드 격자 (20x20 셀 십자, 노랑) 자동 생성
    On Error Resume Next
    네트웍_격자_생성
    On Error GoTo 0

    ' 단축키 — Ctrl+Shift+B = 네트웍구성도 케이블 박스 일괄 스타일 적용
    '   (네트웍에서 기준 박스 선택 후 누르면 즉시 모든 박스에 적용. ButtonDefs 의 「박스 통일」 와 동일 매크로)
    On Error Resume Next
    Application.OnKey "^+B", "케이블박스_일괄적용"
    ' Ctrl+Shift+F = 네트웍구성도 부속 도형 일괄 정렬 (hook 실패 환경 안전망)
    Application.OnKey "^+F", "네트웍_부속도형_정렬"
    ' Ctrl+Shift+L = 설명선 박스 일괄 스타일 적용 (시설물/케이블 자동 분기)
    Application.OnKey "^+L", "설명선_일괄적용"
    On Error GoTo 0

    ' 리본 「추가 기능」 탭에 매크로 버튼 등록 (CommandBars 방식)
    리본_등록

    ' 모드 변수 강제 초기화 + 범례 OnAction 정상 복귀 (옛 「범례 지우기·해제 모드」 잔재 청소)
    g_legendDeleteMode = False
    g_legendUnregisterMode = False
    g_deleteMode = False
    On Error Resume Next
    범례_삭제모드_적용 False
    범례_해제모드_적용 False
    On Error GoTo 0

    Application.StatusBar = False
    MsgBox "행정도 설계 초기화 완료." & vbLf & vbLf & _
           "다음 단계:" & vbLf & _
           "  ① 행정도 시트에 캡처 이미지 붙여넣기 (Ctrl+V)" & vbLf & _
           "  ② 「배경_잠그기」 (또는 상단 버튼) 실행" & vbLf & _
           "  ③ 「잠금」 → Excel 「삽입 > 도형」 으로 시설물·케이블 도형 그림 (다시 누르면 잠금 적용)" & vbLf & _
           "  ④ 도형 선택 후 「범례」 → 1 등록 — 5 종류 (설치장소·시설물·접속함체·RN·광케이블) + 자주 쓰는 라벨 선택" & vbLf & _
           "  ⑤ 설치장소·시설물·접속함체·RN·광케이블 5 콤보박스 클릭 → 옵션 펼침 → 좌클릭으로 선택" & vbLf & _
           "       → 콤보박스 오른쪽 옆 도형 클릭 → 십자 모드 진입 (5 카테고리 동시 선택 가능)" & vbLf & _
           "  ⑥ 「범례」 → 2 해제 (등록만 풀기·도형 유지) / 3 지우기 (범례+도형 삭제)" & vbLf & vbLf & _
           "버튼 패널과 드롭다운은 셀 클릭 시 현재 화면 좌상단으로 자동 이동합니다.", _
           vbInformation, "행정도 설계"
End Sub

Public Sub 배경_잠그기()
    Dim ws As Worksheet: Set ws = ThisWorkbook.Worksheets(SHEET_ADMIN)
    Dim sh As Shape, big As Shape
    Dim sourceSheet As Worksheet

    ' 시트 보호되어 있으면 해제 (작업 후 다시 적용)
    On Error Resume Next
    ws.Unprotect
    On Error GoTo 0

    ' 0단계: 이미 _background 가 있으면 그것을 재인식 (재실행 지원)
    On Error Resume Next
    Set big = ws.Shapes(BG_NAME)
    On Error GoTo 0
    Set sourceSheet = ws

    ' 1단계: 행정도 시트에서 큰 도형 찾기 (Picture·OLE Object 등 모두 허용)
    If big Is Nothing Then
        Set big = FindBackgroundCandidate(ws)
        Set sourceSheet = ws
    End If

    ' 2단계: 행정도에 없으면 다른 시트들 검색
    If big Is Nothing Then
        Dim wsAny As Worksheet
        For Each wsAny In ThisWorkbook.Worksheets
            If wsAny.Name = UNDO_LOG_SHEET Then GoTo NextWs
            If wsAny.Name <> SHEET_META_FAC And wsAny.Name <> SHEET_META_CBL And _
               wsAny.Name <> SHEET_META_LEG Then
                Dim cand As Shape: Set cand = FindBackgroundCandidate(wsAny)
                If Not cand Is Nothing Then
                    Set big = cand
                    Set sourceSheet = wsAny
                    Exit For
                End If
            End If
NextWs:
        Next wsAny
    End If

    If big Is Nothing Then
        MsgBox "이미지를 찾지 못했습니다." & vbLf & vbLf & _
               "1) 행정도 시트에서 Ctrl+V 로 캡처 이미지 붙여넣기 확인" & vbLf & _
               "2) 캡처 도구가 Excel 호환 클립보드 형식이 아닐 수 있음 — Win+Shift+S 권장", _
               vbExclamation
        ApplySheetProtection ws
        Exit Sub
    End If

    ' 다른 시트에서 찾았으면 행정도로 이동
    If Not sourceSheet Is ws Then
        big.Cut
        ws.Paste
        Set big = ws.Shapes(ws.Shapes.Count)
    End If

    ' 셀 격자 자동 조절
    Dim totalCols As Long, totalRows As Long
    totalCols = CLng(Application.WorksheetFunction.Ceiling_Math(big.Width / CELL_PT, 1)) + 10
    totalRows = CLng(Application.WorksheetFunction.Ceiling_Math(big.Height / CELL_PT, 1)) + LEGEND_ROWS + 10

    UniformCellSize ws, totalCols, totalRows
    UniformCellSize ThisWorkbook.Worksheets(SHEET_NETWORK), totalCols, totalRows

    ' 이미지 위치: 범례 영역 아래
    big.Top = ws.Cells(LEGEND_ROWS + 1, 1).Top
    big.Left = ws.Cells(1, 1).Left
    big.Name = BG_NAME
    big.LockAspectRatio = msoTrue
    big.Placement = 3 ' xlFreeFloating
    On Error Resume Next
    big.ZOrder 1 ' msoSendToBack
    big.Locked = True
    On Error GoTo 0

    ' 모든 기존 도형은 잠금 해제 (배경만 잠금)
    Dim sh2 As Shape
    For Each sh2 In ws.Shapes
        On Error Resume Next
        If sh2.Name = BG_NAME Then
            sh2.Locked = True
        Else
            sh2.Locked = False
        End If
        On Error GoTo 0
    Next sh2

    ' 버튼 패널 생성 + floating 위치 정렬
    버튼패널_생성

    ' 상단 2행 틀고정 — 아래쪽 그릴 때도 버튼·범례가 화면 맨 위에 고정
    상단2행_틀고정

    ' 시트 보호 활성화 (UserInterfaceOnly 로 매크로는 자유)
    ApplySheetProtection ws

    Application.StatusBar = False
    MsgBox "배경 이미지 잠금 + 셀 격자 자동 조절 + 시트 보호 + 버튼 패널 완료." & vbLf & _
           "이미지 크기: " & Format(big.Width, "0") & " × " & Format(big.Height, "0") & " pt" & vbLf & _
           "격자: " & totalCols & " 열 × " & totalRows & " 행" & vbLf & vbLf & _
           "다음: 상단 「잠금 해제」 → 「삽입 > 도형」 으로 시설물 도형 그림 → 「범례 등록」", _
           vbInformation, "행정도 설계"
End Sub

' 배경 이미지 후보 찾기 — Picture·OLE Object·기타 큰 도형 모두 허용
Public Function FindBackgroundCandidate(ws As Worksheet) As Shape
    Dim sh As Shape, big As Shape
    Dim maxArea As Double: maxArea = 0
    Dim minSize As Double: minSize = 200  ' 200pt 이상이면 배경 후보

    For Each sh In ws.Shapes
        If sh.Name <> BG_NAME Then
            ' Picture·LinkedPicture·EmbeddedOLEObject·LinkedOLEObject 또는 충분히 큰 도형
            Dim isImg As Boolean
            isImg = (sh.Type = msoPicture) Or _
                    (sh.Type = msoLinkedPicture) Or _
                    (sh.Type = msoEmbeddedOLEObject) Or _
                    (sh.Type = msoLinkedOLEObject)
            ' AutoShape 가 아닌데 (= 사용자가 그린 도형이 아닌데) 큰 도형
            If Not isImg And sh.Type <> msoAutoShape And sh.Type <> msoLine And _
               sh.Type <> msoFreeform And sh.Type <> msoTextBox Then
                If sh.Width >= minSize And sh.Height >= minSize Then isImg = True
            End If

            If isImg Then
                If sh.Width * sh.Height > maxArea Then
                    maxArea = sh.Width * sh.Height
                    Set big = sh
                End If
            End If
        End If
    Next sh
    Set FindBackgroundCandidate = big
End Function

' lockObjects=False(기본): 편집 모드 — 도형·설명선 이동·글자편집 허용 (작업 중 자동 보호).
' lockObjects=True: 잠금 모드 — DrawingObjects 보호. Locked=True 도형(배경)이 실제로 잠김.
'   (DrawingObjects:=True 면 Locked=False 라도 글자 입력이 막히는 환경이 있어, 평소엔 False 로 두고
'    「잠금 적용」 버튼에서만 True 로 배경을 고정. 배경은 _background Picture 도형이라 이게 있어야 잠김)
Public Sub ApplySheetProtection(ws As Worksheet, Optional lockObjects As Boolean = False)
    On Error Resume Next
    ws.Unprotect
    ws.EnableSelection = 0    ' xlNoRestrictions — 모든 셀 선택 가능
    ws.ScrollArea = ""        ' 스크롤 영역 제한 해제
    On Error GoTo 0
    ws.Protect Password:="", _
               UserInterfaceOnly:=True, _
               DrawingObjects:=lockObjects, _
               Contents:=False, _
               Scenarios:=False, _
               AllowFormattingCells:=True, _
               AllowFormattingColumns:=True, _
               AllowFormattingRows:=True
    On Error Resume Next
    ws.EnableSelection = 0    ' 보호 적용 후 재확정
    On Error GoTo 0
End Sub


Public Sub 잠금_해제()
    Dim ws As Worksheet: Set ws = ThisWorkbook.Worksheets(SHEET_ADMIN)
    On Error Resume Next
    ws.Unprotect
    On Error GoTo 0
    Application.StatusBar = "시트 보호 해제됨 — 도형 추가/편집 가능."
    버튼_상태_반영
    MsgBox "시트 보호 해제 완료." & vbLf & vbLf & _
           "[도형 그리는 방법]" & vbLf & _
           "  ① Excel 상단 「삽입」 탭 클릭" & vbLf & _
           "  ② 「도형」 갤러리 펼치기" & vbLf & _
           "  ③ 시설물용: 사각형 · 타원 · 마름모 · 삼각형 등 닫힌 도형" & vbLf & _
           "     케이블용: 직선 · 화살표 · 사선" & vbLf & _
           "  ④ 행정도 시트 빈 영역에서 마우스 드래그로 크기 만큼 그림" & vbLf & _
           "  ⑤ 그린 도형의 색·외곽선·텍스트 자유 편집" & vbLf & vbLf & _
           "[등록]" & vbLf & _
           "  도형을 클릭(테두리에 8개 작은 점이 보이면 선택된 상태)한 뒤" & vbLf & _
           "  → 상단 「범례 등록」 버튼 클릭" & vbLf & _
           "  → 자동으로 시트 보호 복원", _
           vbInformation, "잠금 해제 + 도형 그리기 가이드"
End Sub

Public Sub 잠금_적용()
    Dim ws As Worksheet: Set ws = ThisWorkbook.Worksheets(SHEET_ADMIN)
    On Error Resume Next
    ws.Unprotect
    ' 배경·시설물·케이블·설명선을 Locked=True 로 (DrawingObjects 보호와 함께 실제 고정).
    '   버튼·범례·이름표·모드표시는 건드리지 않음 (계속 클릭해야 함).
    Dim sh As Shape, nm As String
    For Each sh In ws.Shapes
        nm = sh.Name
        If nm = BG_NAME _
           Or Left(nm, Len(PREFIX_FAC)) = PREFIX_FAC _
           Or Left(nm, Len(PREFIX_CBL)) = PREFIX_CBL _
           Or Left(nm, Len(PREFIX_LABEL)) = PREFIX_LABEL _
           Or Left(nm, Len(PREFIX_LEADER)) = PREFIX_LEADER Then
            sh.Locked = True
        End If
    Next sh
    On Error GoTo 0
    ApplySheetProtection ws, True    ' DrawingObjects:=True → 위에서 Locked=True 한 도형 고정
    Application.StatusBar = "잠금 적용 — 배경·시설물·케이블 고정. 편집하려면 「잠금」 다시."
    버튼_상태_반영
    MsgBox "잠금 적용 완료." & vbLf & _
           "배경·시설물·케이블·설명선이 잠겼습니다 (이동·편집 불가)." & vbLf & vbLf & _
           "설명선 글자 수정·도형 이동·그리기를 하려면 「잠금」 버튼을 다시 누르세요.", _
           vbInformation, "잠금 적용"
End Sub

' 「잠금」 통합 토글 — 현재 시트 보호 상태 보고 적용/해제를 한 버튼으로 전환.
'   ButtonDefs 에서 「잠금 해제」+「잠금 적용」 두 버튼을 합쳐 「잠금」 1개로 노출.
'   기존 잠금_해제 / 잠금_적용 매크로는 dead code 가 아니라 내부 호출용으로 그대로 유지.
Public Sub 잠금_토글()
    Dim ws As Worksheet: Set ws = ThisWorkbook.Worksheets(SHEET_ADMIN)
    Dim isLocked As Boolean
    isLocked = ws.ProtectContents Or ws.ProtectDrawingObjects
    If isLocked Then
        잠금_해제
    Else
        잠금_적용
    End If
End Sub

' ============================================================================
'  모드 상태 함수 — 「버튼_상태_반영」 이 시각을 진짜 모드 변수에 맞추기 위해 호출.
'    반전(흰 채움 + 색 글자 + 굵은 테두리) = True 반환 / 기본(색 채움 + 흰 글자) = False 반환.
'    버튼 def 의 4번째 요소(상태 함수명) 가 빈 문자열이면 액션 버튼 → 항상 기본 표시.
' ============================================================================
Public Function 잠금_상태() As Boolean
    Dim ws As Worksheet: Set ws = ThisWorkbook.Worksheets(SHEET_ADMIN)
    잠금_상태 = ws.ProtectContents Or ws.ProtectDrawingObjects
End Function

Public Function 범례_해제모드_상태() As Boolean
    범례_해제모드_상태 = g_legendUnregisterMode
End Function

Public Function 삭제모드_상태() As Boolean
    삭제모드_상태 = g_deleteMode
End Function

' ============================================================================
'  floating 버튼 패널 + 범례 정렬 — 화면 스크롤 시 visible range 좌상단으로 추종
' ============================================================================
Public Sub 버튼패널_생성()
    Dim ws As Worksheet: Set ws = ThisWorkbook.Worksheets(SHEET_ADMIN)
    Dim wasProt As Boolean
    wasProt = ws.ProtectContents Or ws.ProtectDrawingObjects
    On Error Resume Next
    ws.Unprotect
    On Error GoTo 0

    ' 기존 버튼 패널 제거 + 옛 단일 「범례 선택 ▼」 도형(라운드 3) 정리
    '   + 라운드 4 의 콤보박스(`_panel_legend_dd_*`) 와 라벨(`_panel_legend_ddlbl_*`) 도 재생성 위해 제거
    Dim i As Long
    For i = ws.Shapes.Count To 1 Step -1
        Dim panelNm As String: panelNm = ws.Shapes(i).Name
        If Left(panelNm, Len(PANEL_PREFIX)) = PANEL_PREFIX Then ws.Shapes(i).Delete
        If panelNm = "_panel_legend_dropdown" Then ws.Shapes(i).Delete
        If Left(panelNm, Len(PANEL_LEGEND_DD_LABEL_PREFIX)) = PANEL_LEGEND_DD_LABEL_PREFIX Then ws.Shapes(i).Delete
        If Left(panelNm, Len(PANEL_LEGEND_DD_PREFIX)) = PANEL_LEGEND_DD_PREFIX Then ws.Shapes(i).Delete
        If Left(panelNm, Len(PANEL_LEGEND_OPT_PREFIX)) = PANEL_LEGEND_OPT_PREFIX Then ws.Shapes(i).Delete
    Next i

    ' 시트 매크로 버튼 생성은 skip — owner 요구로 리본 「추가 기능」 탭만 사용
    '   (기존 버튼 도형은 위 정리 루프에서 이미 삭제됨)

    ' 범례 콤보박스 5개 — 설치장소·시설물·접속함체·RN·광케이블 각각 (Form Control xlDropDown).
    '   클릭 → 옵션 펼침 → 좌클릭 선택 → 콤보박스_변경 호출 → 옆에 선택된 도형 표시.
    드롭다운_도형_생성 ws

    UpdateFloatingPanelPosition ws

    If wasProt Then ApplySheetProtection ws
    버튼_상태_반영    ' 초기 시각을 현재 모드 변수 상태(잠금·범례 해제·삭제 모드)에 맞춤
    Application.StatusBar = "버튼 패널 생성 완료 — 화면 이동 시 클릭하면 따라옵니다."
End Sub

' 상단 LEGEND_ROWS(1)행 틀고정 — 행정도 아래쪽을 그릴 때도 범례가 화면 맨 위에 고정.
'   기존 파일을 1행 레이아웃으로 옮기는 마이그레이션 겸용 — 1행 = LEGEND_ROW_HEIGHT, 2행 = CELL_PT 강제.
'   (LEGEND_ROWS 가 2 → 1 로 줄어든 환경에서 owner 가 Alt+F8 → 상단2행_틀고정 한 번 실행으로 기존 파일 보정)
Public Sub 상단2행_틀고정()
    Dim ws As Worksheet: Set ws = ThisWorkbook.Worksheets(SHEET_ADMIN)
    On Error Resume Next
    ws.Activate
    ' 행 높이 — 범례 영역(1행)은 LEGEND_ROW_HEIGHT, 그 다음 행은 CELL_PT (기존 2행=55 잔재 정리)
    ws.Rows("1:" & LEGEND_ROWS).RowHeight = LEGEND_ROW_HEIGHT
    ws.Rows(LEGEND_ROWS + 1).RowHeight = CELL_PT
    ' 네트웍구성도 — owner 2026-06-07 (8-57): 1행도 CELL_PT (노랑 격자 1행 균일 높이)
    Dim wsNw As Worksheet
    Set wsNw = ThisWorkbook.Worksheets(SHEET_NETWORK)
    If Not wsNw Is Nothing Then
        wsNw.Rows("1:" & LEGEND_ROWS).RowHeight = NW_TOP_H   ' owner 2026-06-10: 네트웍 1행 = 검색버튼 높이 (격자는 2행부터)
        wsNw.Rows(LEGEND_ROWS + 1).RowHeight = CELL_PT
    End If
    ' 네트웍구성도 1행(검색바) 틀고정 — owner 2026-06-10 (먼저 처리, 마지막에 행정도로 복귀)
    If Not wsNw Is Nothing Then
        wsNw.Activate
        ActiveWindow.FreezePanes = False
        ActiveWindow.ScrollRow = 1
        ActiveWindow.ScrollColumn = 1
        wsNw.Cells(LEGEND_ROWS + 1, 1).Select
        ActiveWindow.FreezePanes = True
    End If
    ' 행정도 1행 틀고정 (마지막 — 행정도로 복귀)
    ws.Activate
    ActiveWindow.FreezePanes = False         ' 기존 고정 해제 후 재설정
    ActiveWindow.ScrollRow = 1               ' 맨 위로 스크롤한 상태에서 고정해야 1행이 고정됨
    ActiveWindow.ScrollColumn = 1
    ws.Cells(LEGEND_ROWS + 1, 1).Select      ' A2 (LEGEND_ROWS=1 → 2행 위로 고정)
    ActiveWindow.FreezePanes = True
    On Error GoTo 0
End Sub

' 버튼 정의 — (라벨, 실행매크로, 색, 상태함수명). 버튼패널_생성·버튼_상태_반영 가 공유.
'   상태함수명 = 빈 문자열 → 일회성 액션 (반전 안 함, 항상 기본색).
'   상태함수명 = 함수 이름 → 토글 모드. 매크로 실행 후 그 함수 반환값(True/False)에 시각 sync.
Public Function ButtonDefs() As Variant
    ButtonDefs = Array( _
        Array("← 되돌리기", "Undo_실행", RGB(100, 116, 139), ""), _
        Array("→ 다시 실행", "Redo_실행", RGB(100, 116, 139), ""), _
        Array("잠금", "잠금_토글", RGB(34, 197, 94), "잠금_상태"), _
        Array("범례", "범례_메뉴", RGB(59, 130, 246), ""), _
        Array("범례 해제", "범례_해제_토글", RGB(217, 119, 6), "범례_해제모드_상태"), _
        Array("라벨 관리", "라벨_관리", RGB(2, 132, 199), ""), _
        Array("삭제 모드", "삭제모드_토글", RGB(239, 68, 68), "삭제모드_상태"), _
        Array("전체 시설물 삭제", "시설물_일괄삭제", RGB(220, 38, 38), ""), _
        Array("정보 동기화", "정보_적용", RGB(14, 165, 233), ""), _
        Array("박스 통일", "케이블박스_일괄적용", RGB(168, 85, 247), ""), _
        Array("설명선 통일", "설명선_일괄적용", RGB(192, 38, 211), ""), _
        Array("부속 정렬", "네트웍_부속도형_정렬", RGB(13, 148, 136), ""), _
        Array("코어 박스", "선번박스_쌍_생성", RGB(217, 70, 239), ""), _
        Array("코어 연결", "선번연결_도구", RGB(244, 114, 182), ""), _
        Array("코어 추적", "코어_추적_도구", RGB(236, 72, 153), ""), _
        Array("추적 지우기", "코어_추적_지우기", RGB(248, 113, 113), ""), _
        Array("코어 검증", "선번_검증", RGB(168, 85, 247), ""), _
        Array("내보내기", "새파일_내보내기", RGB(22, 163, 74), "") _
    )
End Function

' ============================================================================
'  리본 (CommandBars) — 「추가 기능」 탭의 메뉴 명령 영역에 매크로 버튼 자동 등록
'  Workbook_Open 시 자동 호출. xlsm 열면 「추가 기능 > 메뉴 명령」 에 버튼들 표시
'  (RIBBON_BAR_NAME 상수는 모듈 상단 declarations section 에 정의됨)
' ============================================================================
' 리본 그룹 정의 — (그룹 라벨, 버튼 배열)
'   버튼 = (캡션, 매크로, 툴팁)
'   그룹 안 1개 → 단일 버튼 (캡션 그대로 표시)
'   그룹 안 2~3개 → popup 메뉴 (그룹 라벨 = popup 캡션, 클릭 시 sub-button drop-down)
'                     단 「되돌리기」 그룹만 예외 — 짧으니 popup 안 만들고 가로 2개
Public Function RibbonGroupDefs() As Variant
    ' VBA 의 line continuation(_) 한도(25) 회피 — 그룹마다 중간 변수에 할당 후 Array 합산.
    '   기존엔 단일 Array(...) 안에 9 그룹 × 평균 3 line 으로 27 연속행 → 「연속된 행이 너무 많습니다」 오류.
    Dim g0 As Variant, g1 As Variant, g2 As Variant, g3 As Variant, g4 As Variant
    Dim g5 As Variant, g6 As Variant, g7 As Variant, g8 As Variant

    g0 = Array("되돌리기", Array( _
            Array("< 되돌리기", "Undo_실행", "마지막 동작 되돌리기 (20단계)"), _
            Array("> 다시 실행", "Redo_실행", "되돌린 동작 다시 실행")), True)

    g1 = Array("잠금", Array( _
            Array("잠금", "잠금_토글", "시트 보호 토글 (도형 편집 가능/불가)")), False)

    g2 = Array("범례", Array( _
            Array("범례 양식",  "범례_양식_생성",   "신규 시트 「범례」 생성 — 양식에 도형 그리기 + 「양식 스캔」 으로 일괄 등록. 8-123."), _
            Array("범례",       "범례_메뉴",        "범례 등록/해제/지우기 메뉴 (옛 흐름 — Step E 에서 제거 예정)"), _
            Array("범례 해제",  "범례_해제_토글",   "범례 등록만 풀기 (도형 유지)"), _
            Array("라벨 관리",  "라벨_관리",        "자주 쓰는 라벨 마스터 편집")), False)

    g3 = Array("삭제 모드", Array( _
            Array("삭제 모드", "삭제모드_토글", "시설물·케이블 클릭 = 양 시트 동시 삭제"), _
            Array("전체 시설물 삭제", "시설물_일괄삭제", "행정도·네트웍구성도 모든 시설물 일괄 삭제 (삭제 모드 ON 일 때만 활성)")), False)

    g4 = Array("정보 동기화", Array( _
            Array("정보 동기화", "정보_적용", "행정도 ↔ 네트웍 정보·배지 동기화")), False)

    g5 = Array("정렬·서식", Array( _
            Array("부속 정렬", "네트웍_부속도형_정렬", "네트웍 케이블·배지·콤보 일괄 동기화"), _
            Array("설명박스 정리", "행정도_설명박스_일괄정리", "행정도 모든 설명박스를 시설물·케이블과 충돌 없는 접점 가까운 자리로 일괄 재배치"), _
            Array("박스 통일", "케이블박스_일괄적용", "네트웍 케이블 박스 스타일 통일"), _
            Array("설명선 통일", "설명선_일괄적용", "시설물 설명선 스타일 통일"), _
            Array("설명선 여백 0.1cm", "설명선_여백_적용", "양 시트 모든 시설물 설명선 좌우 여백 0.1cm 일괄 적용"), _
            Array("위치 속성", "네트웍_위치속성_설정", "네트웍구성도 케이블=위치와크기변함 / 나머지=위치만변함 + 선로ID 맨앞. 셀 클릭 후 자동 유지."), _
            Array("위치 속성 해제", "네트웍_위치속성_초기화", "네트웍구성도 도형 Placement 를 원래대로 (변하지 않음). 자동 분기 해제.")), False)

    g6 = Array("코어", Array( _
            Array("코어 박스", "선번박스_쌍_생성", "선택한 케이블 2개 끝에 코어 박스 + 화살표 (기본값 「1」)"), _
            Array("코어 연결", "선번연결_도구", "기준 시설물 1개 선택 → 방사형 케이블 그림 → 2개 선택 → 코어 매핑 (같은 케이블 두번 클릭 = 단일 케이블 모드)"), _
            Array("코어 추적", "코어_추적_도구", "(a) 시설물 1개+케이블 1개 또는 (b) 선번 들어있는 선번박스 1개 선택 → 전체 구간 추적. 박스 코어 4개 이하면 자동."), _
            Array("추적 지우기", "코어_추적_지우기", "코어 추적 하이라이트 모두 해제 + 유지 모드 OFF (추적 유지 후 다음 추적 전 호출)"), _
            Array("코어 검증", "선번_검증", "시설물별 케이블 코어 중복 + 짝 코어수 검사 + 대응표")), False)

    g7 = Array("진단", Array( _
            Array("배지 진단", "배지_진단", "메타·도형·배지 상태 확인"), _
            Array("메타 정리", "메타_정리", "옛 잔재 row 삭제"), _
            Array("이벤트 복구", "이벤트_복구", "셀클릭 추종(배지·설명박스·콤보 동기화)이 멈췄을 때 — 이벤트·화면갱신 강제 복구")), False)

    g8 = Array("내보내기", Array( _
            Array("내보내기", "새파일_내보내기", "제출·공유용 매크로 없는 .xlsx 생성")), False)

    Dim g9 As Variant
    g9 = Array("라이센스", Array( _
            Array("라이센스 정보", "라이센스_정보_보기", "현재 라이센스 상태 — 수령자/만료일/HW 바인딩"), _
            Array("내 HW ID", "라이센스_내_HW_ID_보기", "현재 PC HW ID 확인 (관리자에게 발급 요청 시 전달)"), _
            Array("라이센스 발급", "라이센스_발급", "[관리자] 새 사용자용 라이센스 + 배포본 SaveAs (DEV 모드 master 에서)"), _
            Array("라이센스 갱신", "라이센스_갱신", "[관리자] 만료된/임박 라이센스 만료일 연장")), False)

    ' owner 2026-06-08 (8-81 → 8-88 → 8-109 → 2026-06-10): 검색 — 3 버튼 통합.
    '   포인트검색 / 명칭검색(옛 시설물검색) / ID검색(옛 시설물ID+선로ID 통합 — 한 검색어로 둘 다 강조).
    Dim g10 As Variant
    g10 = Array("검색", Array( _
            Array("포인트검색", "검색_배지번호", "포인트번호 단일 InputBox 검색"), _
            Array("명칭검색", "검색_시설물명", "시설물 명칭 단일 InputBox 검색"), _
            Array("ID검색", "검색_ID", "시설물ID·선로ID 동시 검색 (부분 일치)")), False)

    ' owner 2026-06-08 (8-103 → 8-108): 시설물 포인트 번호 토글 — 양 시트 일괄 삭제/재추가.
    '   선택 도형 종류와 무관 (fac_/badge_/lbl_fac_ 어느쪽이든 facId 추출). 메타의 badge_no 우선,
    '   없으면 NextBadgeNo 자동. 8-108: 라벨 "배지" → "포인트 번호" (owner 요구).
    Dim g11 As Variant
    g11 = Array("포인트 번호", Array( _
            Array("포인트 번호 삭제", "배지_삭제", "선택한 시설물의 양 시트 포인트 번호 일괄 삭제 (메타 보존)"), _
            Array("포인트 번호 추가", "배지_추가", "선택한 시설물의 포인트 번호를 양 시트에 재추가 (메타 badge_no 우선)")), False)

    ' owner 2026-06-08 (8-119): 격자·배치 그룹 — 4×4 시작 + 확장 (내부/추가) + Undo + 배치 모드 + 방향키 chain.
    '   Step A·B·C·D·E·F (8-114~118) 통합. g5 「정렬·서식」 에서 격자/배치 메뉴 이동.
    Dim g12 As Variant
    g12 = Array("격자·배치", Array( _
            Array("작은 격자(4×4)",   "격자_최소화_4x4",         "한 격자 칸 = 4×4 cell (기본 20×20 의 1/5). 격자 자체가 좁아짐. 8-122."), _
            Array("격자 한 칸 기본",  "격자_단위_기본",           "한 격자 칸 = 20×20 cell (기본값) 복원."), _
            Array("격자 한 칸 직접",  "격자_단위_직접입력",       "한 격자 칸 안 가로/세로 cell 수 InputBox."), _
            Array("격자 칸수 입력",   "네트웍_격자_확장",         "가로/세로 격자 칸 수 변경 (한 칸 cell 수와 별개). 최소 1."), _
            Array("비례 재배치",      "네트웍_비례_전체재배치",   "전 시설물을 행정도(배경지도) 비례 위치로 재배치. 「확장 되돌리기」로 1회 복원."), _
            Array("가로 축소 −2",     "격자_줌_가로_축소",        "가로 격자 한 칸 −2 cell (좁게). 시설물 위치만, 케이블 다시 그림. 최소 4."), _
            Array("가로 확대 +2",     "격자_줌_가로_확대",        "가로 격자 한 칸 +2 cell (넓게). 최대 40."), _
            Array("세로 축소 −2",     "격자_줌_세로_축소",        "세로 격자 한 칸 −2 cell (좁게). 최소 4."), _
            Array("세로 확대 +2",     "격자_줌_세로_확대",        "세로 격자 한 칸 +2 cell (넓게). 최대 40."), _
            Array("내부확장 ×2",      "격자_내부확장_2",          "시설물 간격 2배. 좌표·격자 모두 ×2. 「확장 되돌리기」로 원복."), _
            Array("내부확장 ×3",      "격자_내부확장_3",          "시설물 간격 3배. 좌표·격자 모두 ×3. 「확장 되돌리기」로 원복."), _
            Array("내부확장 직접",    "격자_내부확장_직접입력",   "내부확장 배수 InputBox (정수 ≥2)."), _
            Array("추가확장 ↑ 위",    "격자_추가확장_위",         "위쪽 1칸 추가 (기존 도형 아래로 shift)"), _
            Array("추가확장 ↓ 아래",  "격자_추가확장_아래",       "아래쪽 1칸 추가 (도형 그대로)"), _
            Array("추가확장 ← 왼쪽",  "격자_추가확장_왼쪽",       "왼쪽 1칸 추가 (기존 도형 오른쪽으로 shift)"), _
            Array("추가확장 → 오른쪽","격자_추가확장_오른쪽",     "오른쪽 1칸 추가 (도형 그대로)"), _
            Array("확장 되돌리기",    "격자_확장_Undo",           "직전 1회 확장 원복 (좌표 + 격자 칸수)"), _
            Array("배치 모드",        "배치모드_토글",            "네트웍 데코 (설명선·콤보·주야·케이블·라벨·코어박스) 숨김/복원 토글. 8-115."), _
            Array("기준 시설물 설정", "기준_시설물_설정",         "선택한 시설물을 방향키 chain 의 기준으로 (점프). 도형 선택 후 누름."), _
            Array("기준 시설물 해제", "기준_시설물_해제",         "기준 시설물 해제. 다음 키 hold = 「시작 격자」 InputBox.")), False)

    RibbonGroupDefs = Array(g0, g1, g2, g3, g4, g5, g6, g7, g8, g9, g10, g11, g12)
End Function

' owner 2026-06-10: 셀클릭 추종(배지·설명박스·콤보 동기화)이 안 될 때 복구.
'   어떤 매크로가 에러로 중단되면 Application.EnableEvents=False 가 잔류 → SelectionChange 가 안 와서
'   모든 셀클릭 동기화(배지 추종 등)가 멈춤. 증상: 빈 셀 클릭해도 상태표시줄 「셀 클릭 [...]」 문구가 안 갱신됨.
'   리본 「진단 > 이벤트 복구」 또는 Alt+F8 로 실행. (Excel 완전 재시작도 같은 효과)
Public Sub 이벤트_복구()
    On Error Resume Next
    Application.EnableEvents = True
    Application.ScreenUpdating = True
    Application.Cursor = xlDefault
    Application.StatusBar = False
    On Error GoTo 0
    MsgBox "이벤트·화면 갱신 복구 완료." & vbLf & vbLf & _
           "이제 셀 클릭 시 배지·설명박스 동기화가 다시 작동합니다." & vbLf & _
           "(빈 셀 클릭 시 상태표시줄에 「셀 클릭 [...]」 문구가 갱신되면 정상)", _
           vbInformation, "이벤트 복구"
End Sub

' owner 2026-06-07 (8-76 → 8-77): 사용기간 만료 검사 — Workbook_Open 에서 자동 호출.
'   - master 파일 (LicenseDevMode=True) 은 skip
'   - 만료일 지났으면 경고 후 파일 닫음
'   - 만료 1 개월 (30 일) 전부터 사전 경고 (파일은 열림)
Public Sub 만료_검사()
    Const EXPIRE_DATE As String = "2026-12-07"
    Const WARN_DAYS As Long = 30

    ' master 파일은 만료 검사 면제 (라이센스 시스템과 동일 플래그 재사용 — 라이센스_DEV모드)
    Dim isDev As Boolean: isDev = False
    On Error Resume Next
    isDev = 라이센스_DEV모드()
    On Error GoTo 0
    If isDev Then Exit Sub

    Dim expiry As Date: expiry = 0
    On Error Resume Next
    expiry = CDate(EXPIRE_DATE)
    On Error GoTo 0
    If expiry = 0 Then Exit Sub      ' 만료일 파싱 실패 — 안전망

    Dim daysLeft As Long: daysLeft = DateDiff("d", Date, expiry)

    If daysLeft < 0 Then
        MsgBox "사용 기간 만료 (~" & EXPIRE_DATE & ")." & vbLf & vbLf & _
               "관리자에게 갱신 요청 후 다시 사용하세요.", _
               vbCritical, "기간 만료"
        On Error Resume Next
        ThisWorkbook.Close SaveChanges:=False
        On Error GoTo 0
    ElseIf daysLeft <= WARN_DAYS Then
        MsgBox "사용 기간 만료 " & daysLeft & " 일 남음 (~" & EXPIRE_DATE & ")." & vbLf & vbLf & _
               "기간이 다 되기 전에 관리자에게 갱신 요청하세요.", _
               vbExclamation, "곧 만료"
    End If
End Sub

Public Sub 리본_등록()
    On Error Resume Next
    Application.CommandBars(RIBBON_BAR_NAME).Delete    ' 옛 잔재 제거
    On Error GoTo 0

    On Error GoTo Fail
    Dim bar As CommandBar
    Set bar = Application.CommandBars.Add(Name:=RIBBON_BAR_NAME, _
                                          Position:=msoBarTop, Temporary:=True)

    Dim groups As Variant: groups = RibbonGroupDefs()
    Dim gi As Long, bi As Long
    For gi = LBound(groups) To UBound(groups)
        ' 첫 그룹 빼고는 dummy 구분 버튼 (|) 삽입 — 시각 그룹 분리
        If gi > LBound(groups) Then
            Dim sep As CommandBarButton
            Set sep = bar.Controls.Add(Type:=msoControlButton, Temporary:=True)
            sep.Caption = " | "
            sep.Style = msoButtonCaption
            sep.Enabled = False
        End If

        Dim grpLabel As String: grpLabel = CStr(groups(gi)(0))
        Dim btns As Variant: btns = groups(gi)(1)
        Dim forceFlat As Boolean: forceFlat = CBool(groups(gi)(2))
        Dim btnCount As Long: btnCount = UBound(btns) - LBound(btns) + 1

        If btnCount = 1 Or forceFlat Then
            ' 단일 버튼 또는 가로 강제 — 각 버튼 별도 표시
            For bi = LBound(btns) To UBound(btns)
                Dim btn As CommandBarButton
                Set btn = bar.Controls.Add(Type:=msoControlButton, Temporary:=True)
                btn.Caption = CStr(btns(bi)(0))
                btn.OnAction = CStr(btns(bi)(1))
                btn.Style = msoButtonCaption
                btn.TooltipText = CStr(btns(bi)(2))
                btn.Tag = CStr(btns(bi)(0))
            Next bi
        Else
            ' popup 메뉴 — 그룹 라벨 캡션. 클릭 시 sub-button drop-down
            Dim pop As CommandBarPopup
            Set pop = bar.Controls.Add(Type:=msoControlPopup, Temporary:=True)
            pop.Caption = grpLabel
            pop.TooltipText = grpLabel & " 그룹"
            For bi = LBound(btns) To UBound(btns)
                Dim subBtn As CommandBarButton
                Set subBtn = pop.Controls.Add(Type:=msoControlButton, Temporary:=True)
                subBtn.Caption = CStr(btns(bi)(0))
                subBtn.OnAction = CStr(btns(bi)(1))
                subBtn.Style = msoButtonCaption
                subBtn.TooltipText = CStr(btns(bi)(2))
                subBtn.Tag = CStr(btns(bi)(0))
            Next bi
        End If
    Next gi

    bar.Visible = True
    Application.StatusBar = "[리본] 「추가 기능」 탭에 매크로 버튼 등록 완료"
    Exit Sub
Fail:
End Sub

Public Sub 리본_제거()
    On Error Resume Next
    Application.CommandBars(RIBBON_BAR_NAME).Delete
    On Error GoTo 0
End Sub

' 모든 모드 즉시 OFF + 범례 OnAction 정상 복귀 — owner 가 「범례 지우기」 모드 갇혔을 때 비상 탈출
'   Alt+F8 → 「모드_초기화」 실행
Public Sub 모드_초기화()
    g_legendDeleteMode = False
    g_legendUnregisterMode = False
    g_deleteMode = False
    On Error Resume Next
    범례_삭제모드_적용 False
    범례_해제모드_적용 False
    삭제모드_도형_복귀
    Application.OnKey "{ESC}"
    On Error GoTo 0
    MsgBox "모든 모드 OFF — 범례 클릭이 그리기 모드로 정상 복귀됩니다.", _
           vbInformation, "모드 초기화"
End Sub

' ESC 키 = 모드 OFF (모드 ON 시점에 OnKey 로 등록됨)
'   owner 2026-06-09 (8-125-fix13): 토글 함수 직접 호출 — OFF 분기 일관성 (OnAction reset + 버튼 + ESC unhook 검사)
Public Sub 모드중_ESC취소()
    Dim msg As String
    On Error Resume Next
    If g_legendUnregisterMode Then
        범례_해제_토글       ' 토글 → OFF 분기 (적용 + ESC unhook 검사)
        msg = "범례 해제 모드 OFF (ESC)"
    End If
    If g_legendDeleteMode Then
        범례_지우기         ' 토글 → OFF 분기
        msg = "범례 지우기 모드 OFF (ESC)"
    End If
    If g_deleteMode Then
        삭제모드_토글       ' 토글 → OFF 분기 (OnAction reset + ESC unhook 검사 + StatusBar)
        msg = "삭제 모드 OFF (ESC)"
    End If
    On Error GoTo 0
    If Len(msg) > 0 Then Application.StatusBar = msg
End Sub

' owner 2026-06-10 (8-125-fix26): 그리기 모드 ESC 종료 — 연속 그리기 후 ESC 한 번으로 깔끔히 종료.
'   기존: 그리기 모드에서 ESC = Excel 네이티브(십자 취소)만, g_drawLegendName/폴링은 60초 카운트다운까지
'   잔존 → "사각형 하나 더 그려야 종료" 증상. 해결: 그리기 진입 시 ESC 를 이 매크로에 바인딩.
'   g_drawLegendName 비우면 StartDrawMode(Len=0 Exit)·DetectDrawnFacility/Cable(Len=0 Exit) 가드로
'   폴링·십자 모두 정리. 십자 그리기 대기는 빈 셀 선택으로 취소(M5 의 "추가 도형 방지" 의도 보존) + ESC 네이티브 복원.
Public Sub 그리기_종료()
    On Error Resume Next
    Dim wasDrawing As Boolean
    wasDrawing = (Len(g_drawLegendName) > 0) Or (g_mode = "draw_facility") Or (g_mode = "draw_cable")
    g_drawLegendName = ""
    g_drawKind = ""
    g_mode = ""
    HighlightSelectedLegend ""
    UpdateModeIndicator
    Dim ws As Worksheet: Set ws = ThisWorkbook.Worksheets(SHEET_ADMIN)
    If Not ws Is Nothing Then
        ' owner 2026-06-10: 행정도 콤보 값 placeholder 로 리셋 — 같은 규격 재선택 시에도 OnAction 발동하게.
        '   단 크기/굵기(size) 콤보는 유지 — 한 번 정하면 다시 바꿀 때까지 보존 (owner 2026-06-10).
        Dim cbr As Shape
        For Each cbr In ws.Shapes
            Dim cn As String: cn = cbr.Name
            If Left(cn, Len(PREFIX_ADMIN_COMBO)) = PREFIX_ADMIN_COMBO _
               And Left(cn, Len(PREFIX_ADMIN_COMBO_LBL)) <> PREFIX_ADMIN_COMBO_LBL _
               And Left(cn, Len(PREFIX_ADMIN_COMBO_PV)) <> PREFIX_ADMIN_COMBO_PV Then
                Dim altr As String: altr = ""
                On Error Resume Next: altr = cbr.AlternativeText: On Error GoTo 0
                If 행정도_콤보_alt파싱(altr, "tp") <> "size" Then
                    On Error Resume Next: cbr.ControlFormat.Value = 1: On Error GoTo 0
                End If
            End If
        Next cbr
        행정도_콤보_미리보기 ws, "", Nothing   ' 미리보기 제거
        Application.GoTo ws.Cells(1, 1), False   ' 빈 셀 선택 = 십자 그리기 대기 취소
        ApplySheetProtection ws
    End If
    Application.OnKey "{ESC}"                     ' ESC 네이티브 복원 (그리기 끝났으니)
    If wasDrawing Then
        Application.StatusBar = "그리기 종료 (ESC)"
    Else
        Application.StatusBar = False
    End If
    On Error GoTo 0
End Sub

' 삭제 모드 OFF 시 시설물·케이블 도형 OnAction 복귀
Public Sub 삭제모드_도형_복귀()
    Dim ws As Worksheet
    On Error Resume Next
    Set ws = ThisWorkbook.Worksheets(SHEET_ADMIN)
    On Error GoTo 0
    If ws Is Nothing Then Exit Sub
    Dim wasProt As Boolean: wasProt = ws.ProtectContents Or ws.ProtectDrawingObjects
    On Error Resume Next
    ws.Unprotect
    On Error GoTo 0
    Dim sh As Shape
    For Each sh In ws.Shapes
        If Left(sh.Name, Len(PREFIX_FAC)) = PREFIX_FAC Then
            On Error Resume Next
            sh.OnAction = ""
            On Error GoTo 0
        ElseIf Left(sh.Name, Len(PREFIX_CBL)) = PREFIX_CBL Then
            On Error Resume Next
            sh.OnAction = ""
            On Error GoTo 0
        End If
    Next sh
    If wasProt Then ApplySheetProtection ws
End Sub

' ============================================================================
'  리본 (customUI) 디스패처 — 별도 탭 「행정도 설계」 의 버튼이 호출 (방법 B 용)
'  customUI XML 의 onAction 은 모두 "Ribbon_Click" 으로 통일. control.Id 로 분기
' ============================================================================
Public Sub Ribbon_Click(control As Object)
    Dim id As String
    On Error Resume Next
    id = control.Id
    On Error GoTo 0
    Select Case id
        Case "btnUndo":         Undo_실행
        Case "btnRedo":         Redo_실행
        Case "btnLock":         잠금_토글
        Case "btnLegend":       범례_메뉴
        Case "btnLegendUnreg":  범례_해제_토글
        Case "btnLabel":        라벨_관리
        Case "btnDelete":       삭제모드_토글
        Case "btnSync":         정보_적용
        Case "btnCableBox":     케이블박스_일괄적용
        Case "btnCallout":      설명선_일괄적용
        Case "btnPlacement":    네트웍_위치속성_설정
        Case "btnPlacementReset": 네트웍_위치속성_초기화
        Case "btnGridExpand":   네트웍_격자_확장
        Case "btnNetwork":      네트웍_부속도형_정렬
        Case "btnPairBox":      선번박스_쌍_생성
        Case "btnPairConnect":  선번연결_도구
        Case "btnCoreTrack":    코어_추적_도구
        Case "btnPairCheck":    선번_검증
        Case "btnExport":       새파일_내보내기
        Case "btnDiag":         배지_진단
        Case "btnMetaClean":    메타_정리
        Case Else:              MsgBox "리본 버튼 미정의: " & id, vbExclamation
    End Select
End Sub

' 버튼 클릭 디스패처 — 매크로 실행 후 「버튼_상태_반영」 으로 시각을 진짜 모드 변수에 맞춤.
'   토글 모드 버튼: 매크로 실행 → 모드 변수 갱신 → 시각도 그 값에 맞춰 반전/기본 결정.
'   일회성 액션 버튼: ButtonDefs 의 상태함수명 빈칸 → 항상 기본색.
'   → 「반전 = 모드 ON」 / 「기본 = 모드 OFF」 1:1 거울. 헷갈림 제거.
Public Sub 버튼_클릭()
    Dim nm As String: nm = Application.Caller
    Dim ws As Worksheet: Set ws = ThisWorkbook.Worksheets(SHEET_ADMIN)
    Dim btn As Shape
    On Error Resume Next
    Set btn = ws.Shapes(nm)
    On Error GoTo 0
    If btn Is Nothing Then Exit Sub

    Dim target As String
    On Error Resume Next
    target = btn.AlternativeText
    On Error GoTo 0

    If Len(target) > 0 Then
        On Error Resume Next
        Application.Run target
        On Error GoTo 0
    End If

    ' 매크로 실행 후 — 모든 모드 버튼의 시각을 「실제 모드 변수」 에 맞춰 강제 동기화
    버튼_상태_반영
End Sub

' 모든 패널 버튼의 시각을 「ButtonDefs 의 상태 함수 반환값」 에 맞춰 일괄 적용.
'   상태함수명 = "" (액션 버튼) → 항상 기본색
'   상태함수명 != "" 인데 True → 반전 (흰 채움 + 색 글자 + 굵은 색 테두리)
'   상태함수명 != "" 인데 False → 기본 (색 채움 + 흰 글자 + 테두리 없음)
'   여러 모드 동시 ON 도 표현 가능 (잠금·범례 해제·삭제 모드 셋 다 ON 이면 셋 다 반전).
Public Sub 버튼_상태_반영()
    Dim ws As Worksheet: Set ws = ThisWorkbook.Worksheets(SHEET_ADMIN)
    Dim defs As Variant: defs = ButtonDefs()
    Dim sh As Shape, idx As Long, baseColor As Long
    Dim stateFn As String, isOn As Boolean

    For Each sh In ws.Shapes
        If Left(sh.Name, Len(PANEL_PREFIX)) = PANEL_PREFIX Then
            idx = -1
            On Error Resume Next
            idx = CLng(Mid(sh.Name, Len(PANEL_PREFIX) + 1))
            On Error GoTo 0
            If idx < 0 Or idx > UBound(defs) Then GoTo NextBtn

            baseColor = defs(idx)(2)
            stateFn = ""
            On Error Resume Next
            stateFn = CStr(defs(idx)(3))    ' 4번째 요소 — 없을 수도 있어 Resume Next
            On Error GoTo 0

            isOn = False
            If Len(stateFn) > 0 Then
                On Error Resume Next
                isOn = CBool(Application.Run(stateFn))
                On Error GoTo 0
            End If

            On Error Resume Next
            If isOn Then
                sh.Fill.ForeColor.RGB = RGB(255, 255, 255)
                sh.Line.Visible = msoTrue
                sh.Line.ForeColor.RGB = baseColor
                sh.Line.Weight = 2.25
                sh.TextFrame2.TextRange.Font.Fill.ForeColor.RGB = baseColor
            Else
                sh.Fill.ForeColor.RGB = baseColor
                sh.Line.Visible = msoFalse
                sh.TextFrame2.TextRange.Font.Fill.ForeColor.RGB = RGB(255, 255, 255)
            End If
            On Error GoTo 0
        End If
NextBtn:
    Next sh
End Sub

' ============================================================================
'  범례 옵션 (시설물 크기%, 케이블 두께t) — 범례 도형 AlternativeText 에 저장
' ============================================================================
' AlternativeText 형식: "scale=80;weight=1.5" (시설물 범례엔 scale, 케이블 범례엔 weight 의미. 양쪽 다 저장돼도 무해)
Public Sub 범례_옵션_읽기(leg As Shape, ByRef scalePct As Long, ByRef weightDelta As Double)
    scalePct = 100         ' 기본 = 최초 크기
    weightDelta = 0        ' 기본 = 최초 두께
    Dim s As String: s = ""
    On Error Resume Next
    s = leg.AlternativeText
    On Error GoTo 0
    If Len(s) = 0 Then Exit Sub
    Dim parts() As String: parts = Split(s, ";")
    Dim i As Long, kv() As String
    For i = LBound(parts) To UBound(parts)
        kv = Split(parts(i), "=")
        If UBound(kv) >= 1 Then
            Select Case Trim(kv(0))
                Case "scale"
                    If IsNumeric(kv(1)) Then scalePct = CLng(kv(1))
                Case "weight"
                    If IsNumeric(kv(1)) Then weightDelta = CDbl(kv(1))
            End Select
        End If
    Next i
End Sub

Public Sub 범례_옵션_쓰기(leg As Shape, scalePct As Long, weightDelta As Double)
    On Error Resume Next
    leg.AlternativeText = "scale=" & scalePct & ";weight=" & weightDelta
    On Error GoTo 0
End Sub

' 콤보박스 선택값 → 카테고리의 현재 「선택된 범례」 도형 AlternativeText 에 저장.
'   OnAction = "범례_옵션_콤보_변경". ApplicationCaller 이름에서 curKind 추출 → GetSelectedLabel 로 범례 도형 찾기.
Public Sub 범례_옵션_콤보_변경()
    On Error Resume Next
    Dim ws As Worksheet: Set ws = ActiveSheet
    If ws Is Nothing Then Exit Sub
    If ws.Name <> SHEET_ADMIN Then Exit Sub

    Dim callerName As String: callerName = Application.Caller
    If Left(callerName, Len(PANEL_LEGEND_OPT_PREFIX)) <> PANEL_LEGEND_OPT_PREFIX Then Exit Sub
    Dim curKind As String: curKind = Mid(callerName, Len(PANEL_LEGEND_OPT_PREFIX) + 1)

    ' 콤보 ListIndex → 옵션 값
    Dim dd As DropDown
    Set dd = ws.DropDowns(callerName)
    If dd Is Nothing Then Exit Sub
    Dim idx As Long: idx = dd.ListIndex
    If idx <= 0 Then Exit Sub

    ' 현재 선택된 범례 도형 찾기
    Dim selLabel As String: selLabel = GetSelectedLabel(curKind)
    If Len(selLabel) = 0 Then
        Application.StatusBar = "이 카테고리에 선택된 범례 없음 — 먼저 위 범례 선택 ▼ 에서 라벨 선택 필요"
        Exit Sub
    End If
    Dim shapeName As String: shapeName = FindLegendByLabel(curKind, selLabel)
    If Len(shapeName) = 0 Then Exit Sub
    Dim leg As Shape
    On Error Resume Next
    Set leg = ws.Shapes(shapeName)
    On Error GoTo 0
    If leg Is Nothing Then Exit Sub

    ' 옵션 적용 — 카테고리별 분기
    Dim scalePct As Long, weightDelta As Double
    범례_옵션_읽기 leg, scalePct, weightDelta
    If IsCableKind(curKind) Then
        ' 옵션 ["0t","0.5t","1t","1.5t","2t","2.5t","3t"] → idx 1..7 → delta = (idx-1) * 0.5
        weightDelta = (idx - 1) * 0.5
    Else
        ' 옵션 ["100%","80%","60%","40%"] → idx 1..4 → 100/80/60/40
        Dim scaleOpts As Variant: scaleOpts = Array(100, 80, 60, 40)
        If idx >= 1 And idx <= UBound(scaleOpts) + 1 Then scalePct = CLng(scaleOpts(idx - 1))
    End If
    범례_옵션_쓰기 leg, scalePct, weightDelta

    Application.StatusBar = "범례 옵션 변경: [" & selLabel & "] " & _
                            IIf(IsCableKind(curKind), "두께 +" & weightDelta & "t", "크기 " & scalePct & "%")
End Sub

' 옵션 콤보 생성 (lazy) — 카테고리별 1개. UpdateFloatingPanelPosition 이 매번 위치만 갱신.
Public Sub 범례_옵션_콤보_생성(ws As Worksheet, kind As String)
    Dim cbName As String: cbName = PANEL_LEGEND_OPT_PREFIX & kind
    Dim existing As Shape
    On Error Resume Next
    Set existing = ws.Shapes(cbName)
    On Error GoTo 0
    If Not existing Is Nothing Then Exit Sub

    On Error Resume Next
    ws.Unprotect
    On Error GoTo 0

    Dim dd As DropDown
    Set dd = ws.DropDowns.Add(0, 0, PANEL_LEGEND_OPT_W, PANEL_LEGEND_OPT_H)
    dd.Name = cbName
    dd.OnAction = "범례_옵션_콤보_변경"
    dd.Placement = 3
    Dim opts As Variant
    If IsCableKind(kind) Then
        opts = Array("0t (최초)", "0.5t", "1t", "1.5t", "2t", "2.5t", "3t")
    Else
        opts = Array("100% (최초)", "80%", "60%", "40%")
    End If
    Dim i As Long
    For i = LBound(opts) To UBound(opts)
        dd.AddItem CStr(opts(i))
    Next i
    dd.ListIndex = 1                  ' 기본 첫 옵션 (최초 크기/두께)
    ApplySheetProtection ws
End Sub

' 콤보 ListIndex 를 「선택된 범례 도형」 의 현재 저장값에 sync (카테고리 선택 변경 시 호출).
Public Sub 범례_옵션_콤보_sync(ws As Worksheet, kind As String, leg As Shape)
    Dim cbName As String: cbName = PANEL_LEGEND_OPT_PREFIX & kind
    Dim dd As DropDown
    On Error Resume Next
    Set dd = ws.DropDowns(cbName)
    On Error GoTo 0
    If dd Is Nothing Then Exit Sub
    Dim scalePct As Long, weightDelta As Double
    범례_옵션_읽기 leg, scalePct, weightDelta
    Dim target As Long: target = 1
    If IsCableKind(kind) Then
        ' delta 0 → 1, 0.5 → 2, 1 → 3, ...
        target = CLng(weightDelta / 0.5) + 1
        If target < 1 Then target = 1
        If target > 7 Then target = 7
    Else
        Select Case scalePct
            Case 100: target = 1
            Case 80:  target = 2
            Case 60:  target = 3
            Case 40:  target = 4
            Case Else: target = 1
        End Select
    End If
    On Error Resume Next
    dd.ListIndex = target
    On Error GoTo 0
End Sub

' 버튼 + 범례를 visible range 좌상단 영역에 재정렬
'   row 0 (1행): 버튼 패널
'   row 1 (2행): 범례 한 줄 (시설물 → 케이블, 생성순)
Public Sub UpdateFloatingPanelPosition(Optional wsArg As Worksheet)
    On Error GoTo Done
    Dim ws As Worksheet
    If wsArg Is Nothing Then
        Set ws = ActiveSheet
    Else
        Set ws = wsArg
    End If
    If ws Is Nothing Then Exit Sub
    If ws.Name <> SHEET_ADMIN Then Exit Sub

    Dim vr As Range
    On Error Resume Next
    Set vr = ActiveWindow.VisibleRange
    On Error GoTo 0
    If vr Is Nothing Then Exit Sub

    ' 세로 위치 = 절대 상단(1행). 「상단 1행 틀고정」 과 함께 쓰면 스크롤해도 패널이
    '   화면 맨 위(틀고정 영역)에 그대로 남음. (vr.Top 쓰면 스크롤 시 틀고정 아래로 내려가 버림)
    '   row0/row1 둘 다 1행 안 (매크로 버튼은 리본으로 이전 — 1행 전체가 범례 영역)
    Dim row0Top As Double, row1Top As Double
    row0Top = ws.Cells(1, 1).Top + PANEL_OFFSET
    row1Top = row0Top                            ' 1행 안에서 카테고리 콤보 시작 (옵션 콤보는 카테고리 콤보 바로 아래)

    Dim leftStart As Double: leftStart = vr.Left + PANEL_OFFSET   ' 가로는 화면 따라 이동

    ' row 0 (1행) — 매크로 버튼은 리본 「추가 기능」 탭으로 이전. 시트 매크로 버튼 도형 없음 (LayoutLine skip)

    ' row 1 (2행) 새 UX (2026-06-01 라운드 3):
    '   - 「범례 선택 ▼」 드롭다운 도형이 항상 표시 (vr.Left + PANEL_OFFSET)
    '   - g_drawLabel 매칭 1 개만 드롭다운 오른쪽 옆에 visible (다른 범례는 모두 hidden)
    '   - g_drawLabel 비어있으면 드롭다운만 표시 (범례 도형 0 개)
    ' (이전 UX: 모든 범례를 가로로 펼쳐 표시 — 너무 길어지는 문제로 드롭다운으로 압축)
    Dim legs As Collection: Set legs = New Collection
    Dim kinds4 As Variant: kinds4 = Array("facility", "station", "closure", "rn", "cable")
    Dim ki As Long, subLegs As Collection, si As Long
    Dim k As Long
    For ki = LBound(kinds4) To UBound(kinds4)
        Set subLegs = CollectLegendsByMeta(ws, CStr(kinds4(ki)))
        For si = 1 To subLegs.Count: legs.Add subLegs(si): Next si
    Next ki

    Const LEG_BAND_H As Double = 56                ' 범례 띠 높이 — 카테고리 콤보(상) + 옵션 콤보(하) 세로 2단
    Const LEG_GAP As Double = 18      ' 다음 범례까지 간격
    Const LEG_LBL_GAP As Double = 4   ' 이름 텍스트 ↔ 심볼 간격
    ' 범례 가로 시작 = G열 (버튼은 A열부터, 범례는 G열부터). 화면 스크롤 따라옴.
    Dim cur As Double
    cur = vr.Left + (ws.Cells(1, 7).Left - ws.Cells(1, 1).Left)
    ' 새 UX (2026-06-01 라운드 4):
    '   5 카테고리 드롭다운 (설치장소·시설물·접속함체·RN·광케이블) + 각 드롭다운 오른쪽 옆에 그 카테고리의
    '   선택된 범례 1개씩 visible. 나머지 모든 범례는 hidden.
    '   동시에 4개까지 표시 가능 (카테고리마다 독립 선택).

    ' 1) 모든 범례 + leglbl_ 먼저 hidden 초기화 (이후 selected 만 visible 처리)
    '   line/connector(광케이블) 도형은 일부 환경에서 .Visible=msoFalse 가 안 먹힘 →
    '   화면 밖(-10000, -10000) 위치 이동 fallback 으로 사라짐 보장.
    '   leglbl_ 도 일괄 hidden (콤보 옵션이 이미 라벨 표시. 옆 텍스트박스 중복 제거).
    Dim sAll As Shape, lblAll As Shape, idpAll As String
    Dim isCloInit As Boolean
    For k = 1 To legs.Count
        Set sAll = legs(k)
        If Left(sAll.Name, Len(PREFIX_LEG_FAC)) = PREFIX_LEG_FAC Then
            idpAll = Mid(sAll.Name, Len(PREFIX_LEG_FAC) + 1)
        Else
            idpAll = Mid(sAll.Name, Len(PREFIX_LEG_CBL) + 1)
        End If
        Set lblAll = Nothing
        On Error Resume Next
        Set lblAll = ws.Shapes(PREFIX_LEG_LABEL & idpAll)
        On Error GoTo 0
        ' 심볼 안 글자 비움 — 단 ⊗(closure) 는 ✕ 가 심볼이라 유지
        ' (AlternativeText 는 범례 옵션 저장용으로 이전됨 → 메타 시트 kind 컬럼으로 판단)
        isCloInit = False
        On Error Resume Next
        isCloInit = (MetaLookupKind(sAll.Name) = "closure")
        On Error GoTo 0
        If Not isCloInit Then
            On Error Resume Next
            sAll.TextFrame2.TextRange.Text = ""
            On Error GoTo 0
        End If

        On Error Resume Next
        sAll.Visible = msoFalse
        sAll.Left = -10000      ' off-screen — line/connector 안전망
        sAll.Top = -10000
        If Not lblAll Is Nothing Then
            lblAll.Visible = msoFalse
            lblAll.Left = -10000
            lblAll.Top = -10000
        End If
        On Error GoTo 0
    Next k

    ' 2) 5 카테고리 묶음 가로 배치 — [카테고리 라벨][Form Control 콤보박스][선택된 범례 라벨+심볼]
    Dim ddCur As Double: ddCur = vr.Left + PANEL_OFFSET
    Dim kindsRow As Variant: kindsRow = Array("facility", "station", "closure", "rn", "cable")
    Dim ki2 As Long, curKind As String, cbName As String, ddLblName As String
    Dim cb As Shape, ddLbl As Shape
    Dim selLabelStr As String, selShapeName As String
    Dim sel As Shape, selLbl As Shape, selIdp As String
    For ki2 = LBound(kindsRow) To UBound(kindsRow)
        curKind = CStr(kindsRow(ki2))
        cbName = PANEL_LEGEND_DD_PREFIX & curKind
        ddLblName = PANEL_LEGEND_DD_LABEL_PREFIX & curKind

        ' 콤보박스 + 라벨 lazy 생성 (둘 다 없으면 한 번에 생성)
        Set cb = Nothing
        Set ddLbl = Nothing
        On Error Resume Next
        Set cb = ws.Shapes(cbName)
        Set ddLbl = ws.Shapes(ddLblName)
        On Error GoTo 0
        If cb Is Nothing Or ddLbl Is Nothing Then
            드롭다운_도형_생성_하나 ws, curKind
            On Error Resume Next
            Set cb = ws.Shapes(cbName)
            Set ddLbl = ws.Shapes(ddLblName)
            On Error GoTo 0
        End If
        If cb Is Nothing Then GoTo NextKind

        ' 옵션 list 새로고침 (등록·삭제 후에도 자동 반영, 선택은 보존)
        콤보박스_옵션_갱신 ws, curKind

        ' (a) 카테고리 라벨 도형 (콤보박스 왼쪽) — 상단 (옵션 콤보 자리 확보 위해)
        If Not ddLbl Is Nothing Then
            On Error Resume Next
            ddLbl.Placement = 3
            ddLbl.Left = ddCur
            ddLbl.Top = row1Top + 2
            ddLbl.ZOrder 0
            On Error GoTo 0
            ddCur = ddCur + ddLbl.Width + 2
        End If

        ' (b) 카테고리 콤보박스 — 상단 (이 콤보 바로 아래에 옵션 콤보가 들어감)
        On Error Resume Next
        cb.Placement = 3
        cb.Left = ddCur
        cb.Top = row1Top + 2
        cb.ZOrder 0
        On Error GoTo 0
        ddCur = ddCur + cb.Width + LEG_LBL_GAP

        ' (c) 선택된 라벨 있으면 그 범례 도형만 콤보박스 오른쪽 옆에 visible (라벨 텍스트는 콤보 옵션이 이미 담당)
        selLabelStr = GetSelectedLabel(curKind)
        Dim selLegOpt As Shape: Set selLegOpt = Nothing
        If Len(selLabelStr) > 0 Then
            selShapeName = FindLegendByLabel(curKind, selLabelStr)
            If Len(selShapeName) > 0 Then
                Set sel = Nothing
                On Error Resume Next
                Set sel = ws.Shapes(selShapeName)
                On Error GoTo 0
                If Not sel Is Nothing Then
                    ' (c) 도형 = 카테고리 콤보 우측 (콤보와 「세로 중앙」 정렬 — 케이블 같은 얇은 선이 위로 치우치지 않게)
                    On Error Resume Next
                    sel.Visible = msoTrue
                    sel.Placement = 3
                    sel.Left = ddCur
                    sel.Top = cb.Top + (cb.Height - sel.Height) / 2
                    sel.ZOrder 0
                    On Error GoTo 0
                    ddCur = ddCur + sel.Width + LEG_GAP

                    ' (d) 옵션 콤보 — 「카테고리 콤보 바로 아래」 (도형 아래 X). 가로 영역은 카테고리 콤보가 이미 차지
                    범례_옵션_콤보_생성 ws, curKind
                    Dim optName As String: optName = PANEL_LEGEND_OPT_PREFIX & curKind
                    On Error Resume Next
                    Set selLegOpt = ws.Shapes(optName)
                    On Error GoTo 0
                    If Not selLegOpt Is Nothing Then
                        범례_옵션_콤보_sync ws, curKind, sel
                        On Error Resume Next
                        selLegOpt.Visible = msoTrue
                        selLegOpt.Placement = 3
                        ' 카테고리 콤보(cb) 가로 중앙 + 카테고리 콤보 바로 아래
                        selLegOpt.Left = cb.Left + (cb.Width - selLegOpt.Width) / 2
                        selLegOpt.Top = cb.Top + cb.Height + 2
                        selLegOpt.ZOrder 0
                        On Error GoTo 0
                    End If
                End If
            End If
        Else
            ' 선택된 라벨 없음 → 옵션 콤보 숨김 (있다면)
            Dim hideOpt As Shape
            On Error Resume Next
            Set hideOpt = ws.Shapes(PANEL_LEGEND_OPT_PREFIX & curKind)
            On Error GoTo 0
            If Not hideOpt Is Nothing Then
                On Error Resume Next
                hideOpt.Visible = msoFalse
                hideOpt.Left = -10000
                hideOpt.Top = -10000
                On Error GoTo 0
            End If
        End If

NextKind:
    Next ki2

    ' 모드 indicator 도 같이 따라옴
    UpdateModeIndicator
Done:
End Sub

' 범례 왼쪽 이름 텍스트 도형 생성 — 채움·테두리 없는 텍스트박스, 글자 크기에 맞춰 자동 폭.
Public Function CreateLegendLabel(ws As Worksheet, lblName As String, text As String) As Shape
    Dim lbl As Shape
    Set lbl = ws.Shapes.AddTextbox(msoTextOrientationHorizontal, 0, 0, 80, 22)
    lbl.Name = lblName
    lbl.Placement = 3
    lbl.Locked = False
    On Error Resume Next
    lbl.Fill.Visible = msoFalse
    lbl.Line.Visible = msoFalse
    With lbl.TextFrame2
        .WordWrap = msoFalse
        .AutoSize = msoAutoSizeShapeToFitText           ' 글자 길이만큼 폭 자동
        .VerticalAnchor = msoAnchorMiddle
        .MarginLeft = 2: .MarginRight = 2: .MarginTop = 0: .MarginBottom = 0
        .TextRange.Text = text
        .TextRange.Font.Name = CALLOUT_FONT_NAME
        .TextRange.Font.Size = 11
        .TextRange.Font.Fill.ForeColor.RGB = RGB(15, 23, 42)
        .TextRange.ParagraphFormat.Alignment = 1         ' 왼쪽 정렬
    End With
    On Error GoTo 0
    Set CreateLegendLabel = lbl
End Function

' _범례 메타 시트 순서(= 생성순)대로 해당 kind("facility"/"cable") 범례 도형을 모아 반환.
'   범례를 생성 순서대로 가로 정렬하기 위함 (z-order 변경으로 ws.Shapes 순서가 뒤섞이는 문제 회피).
Public Function CollectLegendsByMeta(ws As Worksheet, kindFilter As String) As Collection
    Dim out As Collection: Set out = New Collection
    Dim meta As Worksheet
    On Error Resume Next
    Set meta = ThisWorkbook.Worksheets(SHEET_META_LEG)
    On Error GoTo 0
    If meta Is Nothing Then Set CollectLegendsByMeta = out: Exit Function

    Dim lastRow As Long
    On Error Resume Next
    lastRow = meta.Cells(meta.Rows.Count, 1).End(xlUp).Row
    On Error GoTo 0

    Dim r As Long, nm As String, kd As String, sh As Shape
    For r = 2 To lastRow
        nm = CStr(meta.Cells(r, 1).Value)   ' legend_shape_name
        kd = CStr(meta.Cells(r, 2).Value)   ' kind
        If kd = kindFilter And Len(nm) > 0 Then
            Set sh = Nothing
            On Error Resume Next
            Set sh = ws.Shapes(nm)
            On Error GoTo 0
            If Not sh Is Nothing Then out.Add sh
        End If
    Next r
    Set CollectLegendsByMeta = out
End Function

Public Function CollectByPrefix(ws As Worksheet, prefix As String) As Collection
    Dim out As Collection: Set out = New Collection
    Dim sh As Shape
    For Each sh In ws.Shapes
        If Left(sh.Name, Len(prefix)) = prefix Then out.Add sh
    Next sh
    Set CollectByPrefix = out
End Function

' fixedSize=True: 모든 도형을 fixedW/fixedH 로 강제. False: 각 도형 현재 크기 유지
Public Sub LayoutLine(shapes As Collection, leftStart As Double, topPos As Double, _
                      fixedW As Double, fixedH As Double, gap As Double, fixedSize As Boolean)
    If shapes Is Nothing Then Exit Sub
    Dim cur As Double: cur = leftStart
    Dim sh As Shape
    Dim i As Long
    For i = 1 To shapes.Count
        Set sh = shapes(i)
        On Error Resume Next
        sh.Placement = 3 ' xlFreeFloating
        If fixedSize Then
            sh.Width = fixedW
            sh.Height = fixedH
        End If
        sh.Left = cur
        sh.Top = topPos
        sh.ZOrder 0 ' msoBringToFront
        On Error GoTo 0
        cur = cur + sh.Width + gap
    Next i
End Sub

Public Sub UniformCellSize(ws As Worksheet, totalCols As Long, totalRows As Long)
    Application.ScreenUpdating = False

    ' 행 높이
    ws.Rows("1:" & totalRows).RowHeight = CELL_PT
    ' owner 2026-06-07 (8-57): 행정도 만 1행이 LEGEND_ROW_HEIGHT (콤보 영역).
    '   네트웍구성도는 1행도 CELL_PT 로 유지 → 노랑 격자 1행이 다른 행과 같은 높이로 보임.
    If ws.Name <> SHEET_NETWORK Then
        ws.Rows("1:" & LEGEND_ROWS).RowHeight = LEGEND_ROW_HEIGHT
    End If

    ' 열 폭 ('문자 너비' 단위 → 시험 후 비례 보정)
    Dim col As Range: Set col = ws.Range(ws.Columns(1), ws.Columns(totalCols))
    col.ColumnWidth = 2
    Dim actualPt As Double: actualPt = ws.Cells(1, 1).Width
    If actualPt > 0 Then col.ColumnWidth = 2 * (CELL_PT / actualPt)

    Application.ScreenUpdating = True
End Sub

' ============================================================================
'  2. 범례
' ============================================================================
Public Sub 범례로_등록()
    Dim ws As Worksheet: Set ws = ThisWorkbook.Worksheets(SHEET_ADMIN)

    ' 선택된 도형 가져오기
    Dim shp As Shape: Set shp = GetSelectedShape(ws)
    If shp Is Nothing Then
        MsgBox "행정도 시트의 도형을 먼저 선택한 뒤 매크로를 실행하세요." & vbLf & vbLf & _
               "Excel 「삽입 > 도형」 으로 그린 뒤 그 도형을 클릭(선택)한 상태에서 실행.", _
               vbExclamation
        Exit Sub
    End If

    ' 종류 선택 — 5 분류 (설치장소·시설물·접속함체·RN·광케이블)
    Dim kindNum As String
    kindNum = InputBox("이 도형을 무엇으로 등록할까요?" & vbLf & vbLf & _
                       KindMenuText(), _
                       "범례로 등록", "1")
    If Len(kindNum) = 0 Then Exit Sub

    Dim kind As String: kind = ParseKindChoice(kindNum)
    If Len(kind) = 0 Then
        MsgBox "1 ~ 4 중에서 입력하세요.", vbExclamation: Exit Sub
    End If

    ' 라벨 선택 — 라벨 마스터에서 「번호로 선택」 또는 「직접 입력」.
    '   직접 입력한 라벨은 마스터에 자동 추가되어 다음번부터 목록에 노출됨.
    EnsureLabelMaster
    Dim labels As Variant: labels = GetLabelMaster(kind)
    Dim menu As String: menu = FormatLabelMenu(labels)

    Dim kindKor As String: kindKor = KindToKor(kind)
    Dim ans As String
    Dim promptBody As String
    promptBody = "[" & kindKor & "] 라벨을 선택하세요." & vbLf & vbLf
    If Len(menu) > 0 Then
        promptBody = promptBody & "자주 쓰는 라벨:" & vbLf & menu & vbLf & _
                     "번호를 입력하거나, 새 라벨을 직접 입력하세요." & vbLf & _
                     "(0 = 직접 입력 안내)"
    Else
        promptBody = promptBody & "등록된 라벨이 없습니다. 새 라벨을 직접 입력하세요." & vbLf & _
                     "(예: " & ExampleLabelsFor(kind) & ")"
    End If

    ans = InputBox(promptBody, "범례 라벨 선택")
    If Len(Trim(ans)) = 0 Then Exit Sub

    Dim label As String: label = ResolveLabelInput(ans, labels)
    If Len(label) = 0 Then
        ' 0 입력 또는 빈 결과 → 직접 입력 한 번 더
        label = InputBox("라벨을 직접 입력하세요." & vbLf & _
                         "(저장 후 다음번 목록에 자동으로 추가됩니다)", _
                         "라벨 직접 입력")
        If Len(Trim(label)) = 0 Then Exit Sub
    End If
    label = Trim(label)

    ' 직접 입력한 라벨(메뉴 번호로 고른 게 아닌 경우) 은 마스터에 자동 추가
    AppendLabelMaster kind, label

    ' Shape.Name 부여 + OnAction. (도형 모양은 사용자가 그린 그대로 사용 — 강제 변환 안 함)
    '   5 분류 중 cable 만 케이블 그리기·prefix, 나머지(facility/station/closure/rn) 는 시설물 그리기·prefix.
    Dim newName As String
    If IsCableKind(kind) Then
        newName = PREFIX_LEG_CBL & NewId8()
        shp.OnAction = "범례_케이블_선택"
    Else
        newName = PREFIX_LEG_FAC & NewId8()
        shp.OnAction = "범례_시설물_선택"
    End If
    shp.Name = newName

    ' 심볼 안 글자는 비움 — 범례 이름은 심볼 「왼쪽」 별도 텍스트로 표시.
    On Error Resume Next
    shp.TextFrame2.TextRange.Text = ""
    On Error GoTo 0

    ' 메타 시트 저장
    AppendMetaRow SHEET_META_LEG, Array(newName, kind, label, Now)

    ' 새로 그린 도형은 잠금 해제 (배경만 잠금)
    On Error Resume Next
    shp.Locked = False
    shp.Placement = 3 ' xlFreeFloating
    On Error GoTo 0

    ' floating 범례 정렬 — 새 범례가 패널 라인에 자동 배치
    UpdateFloatingPanelPosition ws

    ' 시트 보호 자동 복원
    ApplySheetProtection ws

    Application.StatusBar = "범례 등록: " & label & " (" & KindToKor(kind) & ")"
    MsgBox "범례 등록 완료." & vbLf & vbLf & _
           "라벨: " & label & vbLf & _
           "종류: " & KindToKor(kind) & vbLf & vbLf & _
           "이제 이 도형을 클릭하면 배치/그리기 모드가 시작됩니다." & vbLf & _
           "화면 스크롤 후 행정도 셀을 클릭하면 범례가 따라옵니다.", _
           vbInformation, "범례 등록"
End Sub

' 라벨 마스터가 비어있을 때 InputBox 안내 예시.
Public Function ExampleLabelsFor(kind As String) As String
    Select Case kind
        Case "facility": ExampleLabelsFor = "종합국사, 맨홀, 가입자시설"
        Case "station":  ExampleLabelsFor = "통신주, MOFD, OJC"
        Case "closure":  ExampleLabelsFor = "접속함체, 분기함체"
        Case "rn":       ExampleLabelsFor = "RN장비, 광MUX"
        Case "cable":    ExampleLabelsFor = "24C, 36C, 드랍"
        Case Else:       ExampleLabelsFor = "예시 없음"
    End Select
End Function

' 라벨 마스터 추가/삭제 — Alt+F8 또는 「라벨 관리」 버튼.
'   목록 보기 + 「+라벨명」 으로 추가, 「-번호」 로 삭제, 「번호」 선택은 안 함.
Public Sub 라벨_관리()
    Dim kindNum As String
    kindNum = InputBox("관리할 라벨 종류:" & vbLf & vbLf & KindMenuText(), _
                       "라벨 관리", "1")
    If Len(kindNum) = 0 Then Exit Sub

    Dim kind As String: kind = ParseKindChoice(kindNum)
    If Len(kind) = 0 Then MsgBox "1 ~ 4 중에서 입력하세요.", vbExclamation: Exit Sub

    EnsureLabelMaster
    Dim labels As Variant: labels = GetLabelMaster(kind)
    Dim kindKor As String: kindKor = KindToKor(kind)

    Dim menu As String: menu = FormatLabelMenu(labels)
    Dim promptBody As String
    promptBody = "[" & kindKor & "] 라벨 마스터" & vbLf & vbLf
    If Len(menu) > 0 Then
        promptBody = promptBody & menu & vbLf
    Else
        promptBody = promptBody & "(등록된 라벨 없음)" & vbLf & vbLf
    End If
    promptBody = promptBody & _
                 "조작:" & vbLf & _
                 "  +라벨명        →  추가     (예: +가입자맨홀)" & vbLf & _
                 "  -번호          →  삭제     (예: -3)" & vbLf & _
                 "  번호=새이름    →  편집     (예: 3=가입자맨홀_특수)" & vbLf & _
                 "  빈 칸          →  종료"

    Dim ans As String: ans = InputBox(promptBody, "라벨 관리")
    Dim s As String: s = Trim(ans)
    If Len(s) = 0 Then Exit Sub

    Dim n As Long
    If Left(s, 1) = "+" Then
        Dim newLabel As String: newLabel = Trim(Mid(s, 2))
        If Len(newLabel) = 0 Then MsgBox "라벨명이 비었습니다.", vbExclamation: Exit Sub
        AppendLabelMaster kind, newLabel
        MsgBox "추가 완료: " & newLabel, vbInformation, "라벨 관리"
    ElseIf Left(s, 1) = "-" Then
        Dim rest As String: rest = Trim(Mid(s, 2))
        If Not IsNumeric(rest) Then MsgBox "번호를 입력하세요. (예: -3)", vbExclamation: Exit Sub
        n = CLng(rest)
        If Not IsArray(labels) Then MsgBox "삭제할 라벨이 없습니다.", vbExclamation: Exit Sub
        If n < 1 Or n > (UBound(labels) - LBound(labels) + 1) Then
            MsgBox "번호 범위가 잘못되었습니다.", vbExclamation: Exit Sub
        End If
        Dim target As String: target = CStr(labels(LBound(labels) + n - 1))
        RemoveLabelMaster kind, target
        MsgBox "삭제 완료: " & target, vbInformation, "라벨 관리"
    ElseIf InStr(s, "=") > 0 Then
        ' 편집: 번호=새이름 — 라벨 마스터 + 등록된 범례 메타 + 현재 선택 동시 갱신
        Dim eqPos As Long: eqPos = InStr(s, "=")
        Dim numStr As String: numStr = Trim(Left(s, eqPos - 1))
        Dim newName As String: newName = Trim(Mid(s, eqPos + 1))
        If Len(numStr) = 0 Or Len(newName) = 0 Then
            MsgBox "형식: 번호=새이름  (예: 3=가입자맨홀_특수)", vbExclamation: Exit Sub
        End If
        If Not IsNumeric(numStr) Then MsgBox "번호를 입력하세요. (예: 3=새이름)", vbExclamation: Exit Sub
        n = CLng(numStr)
        If Not IsArray(labels) Then MsgBox "편집할 라벨이 없습니다.", vbExclamation: Exit Sub
        If n < 1 Or n > (UBound(labels) - LBound(labels) + 1) Then
            MsgBox "번호 범위가 잘못되었습니다.", vbExclamation: Exit Sub
        End If
        Dim oldLab As String: oldLab = CStr(labels(LBound(labels) + n - 1))
        EditLabelMaster kind, oldLab, newName
        ' 패널 재배치 → 콤보박스 옵션 새로고침
        Dim wsAd As Worksheet: Set wsAd = ThisWorkbook.Worksheets(SHEET_ADMIN)
        UpdateFloatingPanelPosition wsAd
        MsgBox "편집 완료: " & oldLab & "  →  " & newName, vbInformation, "라벨 관리"
    Else
        ' + 없는 텍스트도 추가로 해석 (편의)
        AppendLabelMaster kind, s
        MsgBox "추가 완료: " & s, vbInformation, "라벨 관리"
    End If
End Sub

' (kind, label) 매칭되는 첫 번째 범례 shape name 반환. 없으면 "".
'   _범례 메타는 (legend_shape_name, kind, label, created_at) — 생성순으로 검색.
Public Function FindLegendByLabel(kind As String, label As String) As String
    Dim ws As Worksheet
    On Error Resume Next
    Set ws = ThisWorkbook.Worksheets(SHEET_META_LEG)
    On Error GoTo 0
    If ws Is Nothing Then Exit Function

    Dim last As Long: last = ws.Cells(ws.Rows.Count, 1).End(xlUp).Row
    Dim r As Long
    For r = 2 To last
        If CStr(ws.Cells(r, 2).Value) = kind And _
           CStr(ws.Cells(r, 3).Value) = label Then
            FindLegendByLabel = CStr(ws.Cells(r, 1).Value)
            Exit Function
        End If
    Next r
End Function

' ============================================================================
'  범례 드롭다운 (2026-06-01 라운드 3 — 「라벨로 그리기」 대체)
'    범례 영역에 항상 표시되는 「범례 선택 ▼」 도형. 클릭 시 등록된 범례 목록 노출.
'    선택한 범례 도형 1개만 드롭다운 오른쪽 옆에 표시 (나머지는 hidden).
'    그 도형을 클릭하면 기존 흐름대로 그리기 시작 (범례_시설물_선택 / 범례_케이블_선택).
' ============================================================================
' 5 분류 드롭다운 5개를 모두 생성/재생성 — 설치장소·시설물·접속함체·RN·광케이블.
Public Sub 드롭다운_도형_생성(ws As Worksheet)
    Dim kinds4 As Variant: kinds4 = Array("facility", "station", "closure", "rn", "cable")
    Dim i As Long
    For i = LBound(kinds4) To UBound(kinds4)
        드롭다운_도형_생성_하나 ws, CStr(kinds4(i))
    Next i
End Sub

' 한 카테고리의 드롭다운 = Form Control xlDropDown + 카테고리 라벨 도형.
'   Form Control 콤보박스는 표준 Excel UI 라 클릭→옵션 펼침→좌클릭으로 선택. ActiveX 아니라 32/64bit 안전.
Public Sub 드롭다운_도형_생성_하나(ws As Worksheet, kind As String)
    Dim cbName As String: cbName = PANEL_LEGEND_DD_PREFIX & kind
    Dim lblName As String: lblName = PANEL_LEGEND_DD_LABEL_PREFIX & kind

    ' 기존 도형 삭제 (콤보 + 라벨)
    On Error Resume Next
    Dim existing As Shape
    Set existing = ws.Shapes(cbName)
    If Not existing Is Nothing Then existing.Delete
    Set existing = ws.Shapes(lblName)
    If Not existing Is Nothing Then existing.Delete
    On Error GoTo 0

    ' 카테고리 라벨 도형 — 콤보박스 왼쪽에 "시설물:" 같은 안내
    Dim lbl As Shape
    Set lbl = ws.Shapes.AddTextbox(msoTextOrientationHorizontal, 0, 0, PANEL_DD_LABEL_W, PANEL_DROPDOWN_H)
    lbl.Name = lblName
    lbl.Placement = 3
    lbl.Locked = False
    On Error Resume Next
    lbl.Fill.Visible = msoFalse
    lbl.Line.Visible = msoFalse
    With lbl.TextFrame2
        .WordWrap = msoFalse
        .AutoSize = msoAutoSizeShapeToFitText
        .VerticalAnchor = msoAnchorMiddle
        .MarginLeft = 2: .MarginRight = 4: .MarginTop = 0: .MarginBottom = 0
        .TextRange.Text = KindToKor(kind) & ":"
        .TextRange.Font.Name = CALLOUT_FONT_NAME
        .TextRange.Font.Size = 10
        .TextRange.Font.Bold = True
        .TextRange.Font.Fill.ForeColor.RGB = DropdownColor(kind)
        .TextRange.ParagraphFormat.Alignment = 1
    End With
    On Error GoTo 0

    ' Form Control 콤보박스 (xlDropDown) — 클릭→옵션 펼침→좌클릭 선택
    Dim cb As Shape
    On Error Resume Next
    Set cb = ws.Shapes.AddFormControl(xlDropDown, 0, 0, PANEL_DROPDOWN_W, PANEL_DROPDOWN_H)
    On Error GoTo 0
    If cb Is Nothing Then Exit Sub
    cb.Name = cbName
    cb.OnAction = "콤보박스_변경"
    cb.Placement = 3
    cb.Locked = False

    ' 옵션 채우기 — 등록된 _범례 메타에서 그 카테고리의 라벨
    콤보박스_옵션_갱신 ws, kind
End Sub

' 콤보박스 옵션을 _범례 메타의 그 카테고리 라벨로 재채움.
'   현재 선택값(라벨 텍스트)을 보존 시도 — 새 옵션 list 에서 같은 라벨 찾아 인덱스 재설정.
Public Sub 콤보박스_옵션_갱신(ws As Worksheet, kind As String)
    Dim cb As Shape
    On Error Resume Next
    Set cb = ws.Shapes(PANEL_LEGEND_DD_PREFIX & kind)
    On Error GoTo 0
    If cb Is Nothing Then Exit Sub

    ' 현재 선택 라벨 (보존용)
    Dim currentLabel As String: currentLabel = GetSelectedLabel(kind)

    On Error Resume Next
    cb.ControlFormat.RemoveAllItems
    On Error GoTo 0

    Dim wsMeta As Worksheet
    On Error Resume Next
    Set wsMeta = ThisWorkbook.Worksheets(SHEET_META_LEG)
    On Error GoTo 0
    If wsMeta Is Nothing Then Exit Sub

    Dim last As Long: last = wsMeta.Cells(wsMeta.Rows.Count, 1).End(xlUp).Row
    Dim r As Long, added As Long, newIdx As Long
    added = 0: newIdx = 0
    For r = 2 To last
        If CStr(wsMeta.Cells(r, 2).Value) = kind Then
            On Error Resume Next
            cb.ControlFormat.AddItem CStr(wsMeta.Cells(r, 3).Value)
            On Error GoTo 0
            added = added + 1
            If Len(currentLabel) > 0 And CStr(wsMeta.Cells(r, 3).Value) = currentLabel Then
                newIdx = added
            End If
        End If
    Next r

    ' 선택 보존 (옵션 list 가 바뀌어도 기존 선택을 잃지 않도록)
    On Error Resume Next
    If newIdx > 0 Then cb.ControlFormat.Value = newIdx Else cb.ControlFormat.Value = 0
    On Error GoTo 0
End Sub

' 카테고리별 드롭다운 색 — 시각적 구분.
Public Function DropdownColor(kind As String) As Long
    Select Case kind
        Case "facility": DropdownColor = RGB(59, 130, 246)    ' blue (설치장소)
        Case "station":  DropdownColor = RGB(16, 185, 129)    ' emerald (시설물 — 신규)
        Case "closure":  DropdownColor = RGB(168, 85, 247)    ' purple
        Case "rn":       DropdownColor = RGB(245, 158, 11)    ' amber
        Case "cable":    DropdownColor = RGB(13, 148, 136)    ' teal
        Case Else:       DropdownColor = RGB(100, 116, 139)
    End Select
End Function

' 드롭다운 도형 이름에서 kind 추출 (Application.Caller 분기용).
Public Function ParseDropdownKind(shapeName As String) As String
    If Left(shapeName, Len(PANEL_LEGEND_DD_PREFIX)) = PANEL_LEGEND_DD_PREFIX Then
        ParseDropdownKind = Mid(shapeName, Len(PANEL_LEGEND_DD_PREFIX) + 1)
    End If
End Function

' 카테고리별 선택 라벨 get/set — 5 전역 변수 분기.
Public Function GetSelectedLabel(kind As String) As String
    Select Case kind
        Case "facility": GetSelectedLabel = g_selectedLabel_facility
        Case "station":  GetSelectedLabel = g_selectedLabel_station
        Case "closure":  GetSelectedLabel = g_selectedLabel_closure
        Case "rn":       GetSelectedLabel = g_selectedLabel_rn
        Case "cable":    GetSelectedLabel = g_selectedLabel_cable
    End Select
End Function

Public Sub SetSelectedLabel(kind As String, label As String)
    Select Case kind
        Case "facility": g_selectedLabel_facility = label
        Case "station":  g_selectedLabel_station = label
        Case "closure":  g_selectedLabel_closure = label
        Case "rn":       g_selectedLabel_rn = label
        Case "cable":    g_selectedLabel_cable = label
    End Select
End Sub

' Form Control 콤보박스 선택 변경 시 호출 (OnAction 핸들러).
'   Application.Caller = 콤보박스 도형 이름. ParseDropdownKind 로 kind 추출.
'   ControlFormat.Value = 선택 인덱스(1-based). List(idx) = 선택된 옵션 텍스트.
Public Sub 콤보박스_변경()
    Dim caller As String: caller = Application.Caller
    Dim kind As String: kind = ParseDropdownKind(caller)
    If Len(kind) = 0 Then Exit Sub

    Dim ws As Worksheet: Set ws = ThisWorkbook.Worksheets(SHEET_ADMIN)
    Dim cb As Shape
    On Error Resume Next
    Set cb = ws.Shapes(caller)
    On Error GoTo 0
    If cb Is Nothing Then Exit Sub

    Dim idx As Long: idx = 0
    On Error Resume Next
    idx = cb.ControlFormat.Value
    On Error GoTo 0

    Dim kindKor As String: kindKor = KindToKor(kind)
    If idx = 0 Then
        ' 선택 없음 (xlNone)
        SetSelectedLabel kind, ""
        UpdateFloatingPanelPosition ws
        Application.StatusBar = kindKor & " 선택 해제."
        Exit Sub
    End If

    Dim selLabel As String
    On Error Resume Next
    selLabel = cb.ControlFormat.List(idx)
    On Error GoTo 0
    If Len(selLabel) = 0 Then Exit Sub

    SetSelectedLabel kind, selLabel
    g_drawLabel = selLabel
    g_legendShape = FindLegendByLabel(kind, selLabel)

    UpdateFloatingPanelPosition ws
    Application.StatusBar = kindKor & " [" & selLabel & "] 선택 — 오른쪽 옆 도형 클릭 → 그리기."
End Sub

Public Sub 범례_시설물_선택()
    ' 그리기 진입 시 「범례 지우기·해제 모드」 강제 OFF (안전망 — 다른 범례 클릭 충돌 방지)
    If g_legendDeleteMode Then g_legendDeleteMode = False: 범례_삭제모드_적용 False
    If g_legendUnregisterMode Then g_legendUnregisterMode = False: 범례_해제모드_적용 False
    Dim callerName As String: callerName = Application.Caller
    g_mode = "draw_facility"
    g_legendShape = callerName
    g_legendLabel = MetaLookupLabel(callerName)
    HighlightSelectedLegend callerName
    UpdateModeIndicator
    ' 「삽입 > 도형」 처럼 십자 그리기 모드 진입 → 그린 도형을 자동 감지·등록
    BeginFacilityDraw callerName
End Sub

' 네이티브 그리기(십자) 모드 진입 + 그린 도형 자동 감지 예약
Public Sub BeginFacilityDraw(legendName As String)
    Dim ws As Worksheet: Set ws = ThisWorkbook.Worksheets(SHEET_ADMIN)

    ' 그리기 직전 도형 이름 스냅샷 (신규 도형 = 스냅샷에 없는 도형) — Dictionary 로 비-오류 룩업
    Set g_drawBaseline = CreateObject("Scripting.Dictionary")
    Dim sh As Shape
    On Error Resume Next
    For Each sh In ws.Shapes
        g_drawBaseline(sh.Name) = True
    Next sh
    On Error GoTo 0

    g_drawKind = g_legendLabel
    g_drawLegendName = legendName
    g_drawPolls = 60    ' 약 60초 동안 그리기 대기 (ESC 후 표시줄 자동 정리 시간도 겸함)

    ' 그리기 가능하도록 시트 보호 해제 — 보호(DrawingObjects:=True) 상태에선
    '   사용자가 새 도형을 드로잉할 수 없음. ExecuteMso 가 실패해도 이 해제 덕에
    '   「삽입 > 도형」 수동 그리기는 그대로 됨. 등록·시간초과 시 다시 보호.
    On Error Resume Next
    ws.Unprotect
    On Error GoTo 0

    Application.StatusBar = "지도에 [" & g_drawKind & "] 그리기 — 곧 마우스가 십자로 바뀝니다. 드래그해서 그리면 자동 등록. (안 바뀌면 「삽입>도형」 으로 그린 뒤 「방금 그린 등록」)"

    ' 핵심 수정: ExecuteMso 를 OnAction(범례 클릭) 컨텍스트 밖에서 실행.
    '   OnAction 안에서 직접 호출하면 클릭 처리가 끝나며 그리기 모드가 곧바로 취소됨
    '   (= 십자가 안 뜸). OnTime 으로 「현재 이벤트 종료 후 idle」 시점에 실행하면
    '   「삽입 > 도형」 과 동일하게 십자 그리기 모드로 정상 진입.
    On Error Resume Next
    Application.OnTime Now, "StartDrawMode"
    Application.OnTime Now + TimeSerial(0, 0, 1), "DetectDrawnFacility"
    Application.OnKey "{ESC}", "그리기_종료"   ' owner 2026-06-10 (8-125-fix26): ESC = 그리기 모드 종료
    On Error GoTo 0
End Sub

' OnTime 지연 호출 — 「삽입 > 도형」 과 동일한 네이티브 십자 그리기 모드 진입
'   (반드시 OnAction 핸들러 밖, idle 상태에서 실행돼야 모드가 유지됨)
Public Sub StartDrawMode()
    If Len(g_drawLegendName) = 0 Then Exit Sub
    Dim idMso As String, fallback As String
    If g_mode = "draw_cable" Then
        idMso = "ShapeFreeform"                 ' 자유형 — 도로 따라 중간 점 클릭 가능
        fallback = "ShapeStraightConnector"     ' 실패 시 직선
    Else
        idMso = MapAutoShapeToIdMso(g_drawLegendName)
        If Len(idMso) = 0 Then idMso = "ShapeRectangle"
        fallback = "ShapeRectangle"
    End If

    Dim ok As Boolean: ok = False
    On Error Resume Next
    Application.CommandBars.ExecuteMso idMso
    ok = (Err.Number = 0)
    If Not ok Then
        Err.Clear
        Application.CommandBars.ExecuteMso fallback
        ok = (Err.Number = 0)
    End If
    On Error GoTo 0

    If Not ok Then
        Application.StatusBar = "자동 그리기 모드 진입 실패 — 「삽입 > 도형」 으로 직접 그린 뒤 등록/연결하세요. (시트 보호는 해제됨)"
    End If
End Sub

' 범례 도형의 AutoShapeType → 「삽입 > 도형」 idMso (그리기 명령) 매핑.
' 매핑 없으면 빈 문자열 → 호출부에서 ShapeRectangle 로 폴백.
Public Function MapAutoShapeToIdMso(legendName As String) As String
    Dim ws As Worksheet: Set ws = ThisWorkbook.Worksheets(SHEET_ADMIN)
    Dim leg As Shape
    On Error Resume Next
    Set leg = ws.Shapes(legendName)
    On Error GoTo 0
    If leg Is Nothing Then Exit Function

    Dim ast As Long: ast = 0
    On Error Resume Next
    ast = leg.AutoShapeType
    On Error GoTo 0

    Select Case ast
        Case msoShapeRectangle:            MapAutoShapeToIdMso = "ShapeRectangle"
        Case msoShapeRoundedRectangle:     MapAutoShapeToIdMso = "ShapeRoundedRectangle"
        Case msoShapeOval:                 MapAutoShapeToIdMso = "ShapeOval"
        Case msoShapeDiamond:              MapAutoShapeToIdMso = "ShapeDiamond"
        Case msoShapeIsoscelesTriangle:    MapAutoShapeToIdMso = "ShapeIsoscelesTriangle"
        Case msoShapeRightTriangle:        MapAutoShapeToIdMso = "ShapeRightTriangle"
        Case msoShapeParallelogram:        MapAutoShapeToIdMso = "ShapeParallelogram"
        Case msoShapeTrapezoid:            MapAutoShapeToIdMso = "ShapeTrapezoid"
        Case msoShapeHexagon:              MapAutoShapeToIdMso = "ShapeHexagon"
        Case msoShapePentagon:             MapAutoShapeToIdMso = "ShapePentagon"
        Case msoShapeOctagon:              MapAutoShapeToIdMso = "ShapeOctagon"
        Case Else:                         MapAutoShapeToIdMso = "ShapeRectangle"
    End Select
End Function

' OnTime 콜백 — 새로 그려진 도형 자동 감지 후 시설물로 등록
Public Sub DetectDrawnFacility()
    On Error Resume Next
    Static reentry As Boolean
    If reentry Then Exit Sub   ' 재진입 가드 — 다른 매크로 실행 중 OnTime 중복 발화 차단
    reentry = True
    DetectDrawnFacility_Body
    reentry = False
End Sub

Public Sub DetectDrawnFacility_Body()
    On Error Resume Next
    If g_mode <> "draw_facility" Then Exit Sub   ' 케이블 모드면 DetectDrawnCable 이 처리
    If Len(g_drawLegendName) = 0 Then Exit Sub   ' 취소·완료됨
    If g_drawBaseline Is Nothing Then Exit Sub

    Dim ws As Worksheet: Set ws = ThisWorkbook.Worksheets(SHEET_ADMIN)
    Dim sh As Shape, found As Shape
    For Each sh In ws.Shapes
        If IsNewDrawnShape(sh) Then
            Set found = sh
            Exit For
        End If
    Next sh

    If Not found Is Nothing Then
        FinalizeDrawnFacility found
        Exit Sub
    End If

    ' 아직 안 그림 — 재예약
    g_drawPolls = g_drawPolls - 1
    If g_drawPolls > 0 Then
        Application.OnTime Now + TimeSerial(0, 0, 1), "DetectDrawnFacility"
    Else
        Application.StatusBar = "그리기 종료."
        g_drawLegendName = ""
        g_drawKind = ""
        g_mode = ""
        HighlightSelectedLegend ""
        UpdateModeIndicator        ' 모드 표시줄 숨김
        ApplySheetProtection ws    ' 보호 복원 (그리기 위해 해제했던 것)
    End If
End Sub

' 도형이 「방금 그린 미등록 도형」 인지 판별 (스냅샷에 없고 시스템 도형 아님)
Public Function IsNewDrawnShape(sh As Shape) As Boolean
    On Error Resume Next
    Dim nm As String: nm = sh.Name

    ' 시스템·기등록 도형 제외
    If nm = BG_NAME Or nm = PRINT_BG_NAME Or nm = PRINT_BG_EMBED_NAME Or nm = "_mode_indicator" Then Exit Function
    If Left(nm, Len(PANEL_LEGEND_DD_LABEL_PREFIX)) = PANEL_LEGEND_DD_LABEL_PREFIX Then Exit Function
    If Left(nm, Len(PANEL_LEGEND_DD_PREFIX)) = PANEL_LEGEND_DD_PREFIX Then Exit Function
    If Left(nm, Len(PANEL_LEGEND_OPT_PREFIX)) = PANEL_LEGEND_OPT_PREFIX Then Exit Function
    If Left(nm, Len(PANEL_PREFIX)) = PANEL_PREFIX Then Exit Function
    If Left(nm, Len(PREFIX_LEG_FAC)) = PREFIX_LEG_FAC Then Exit Function
    If Left(nm, Len(PREFIX_LEG_CBL)) = PREFIX_LEG_CBL Then Exit Function
    If Left(nm, Len(PREFIX_LEG_LABEL)) = PREFIX_LEG_LABEL Then Exit Function
    If Left(nm, Len(PREFIX_FAC)) = PREFIX_FAC Then Exit Function
    If Left(nm, Len(PREFIX_CBL)) = PREFIX_CBL Then Exit Function
    If Left(nm, Len(PREFIX_WP_TMP)) = PREFIX_WP_TMP Then Exit Function
    If Left(nm, Len(PREFIX_LABEL)) = PREFIX_LABEL Then Exit Function
    If Left(nm, Len(PREFIX_LEADER)) = PREFIX_LEADER Then Exit Function
    If Left(nm, Len(PREFIX_BG_PIECE)) = PREFIX_BG_PIECE Then Exit Function
    If Left(nm, Len(PREFIX_CBL_X)) = PREFIX_CBL_X Then Exit Function   ' owner 2026-06-09 (8-125): 철거 X 마크 제외
    If Left(nm, Len(PREFIX_ADMIN_COMBO)) = PREFIX_ADMIN_COMBO Then Exit Function   ' owner 2026-06-10 (Step C): 행정도 콤보·라벨·미리보기 제외

    ' 그리기 가능한 도형만 (AutoShape·Freeform)
    If sh.Type <> msoAutoShape And sh.Type <> msoFreeform Then Exit Function

    ' 스냅샷에 있으면 기존 도형 → 신규 아님 (Dictionary.Exists 는 비-오류)
    Dim existed As Boolean: existed = False
    If Not g_drawBaseline Is Nothing Then existed = g_drawBaseline.Exists(nm)

    IsNewDrawnShape = Not existed
End Function

' 그려진 도형을 시설물로 확정 등록 (이름·메타·네트웍 복제·설명선)
Public Sub FinalizeDrawnFacility(shp As Shape)
    Dim ws As Worksheet: Set ws = ThisWorkbook.Worksheets(SHEET_ADMIN)
    Dim kind As String: kind = g_drawKind
    Dim legendName As String: legendName = g_drawLegendName

    ' 중복 처리 방지 — 즉시 대기 상태 해제
    g_drawLegendName = ""
    g_drawKind = ""

    Dim wasProt As Boolean
    wasProt = ws.ProtectContents Or ws.ProtectDrawingObjects
    On Error Resume Next
    ws.Unprotect
    On Error GoTo 0

    ' 그린 도형의 위치만 사용(크기·모양·색은 범례 그대로). 그린 박스 중심에 범례 크기로 배치.
    Dim dLeft As Double, dTop As Double, dW As Double, dH As Double
    dLeft = shp.Left: dTop = shp.Top: dW = shp.Width: dH = shp.Height

    ' owner 2026-06-08 (8-124-fix4): leg 찾기 — 행정도 우선, 없으면 양식 시트 fallback.
    Dim leg As Shape: Set leg = Nothing
    On Error Resume Next
    Set leg = ws.Shapes(legendName)
    On Error GoTo 0
    If leg Is Nothing Then
        Dim wsForm As Worksheet
        On Error Resume Next: Set wsForm = ThisWorkbook.Worksheets(SHEET_LEGEND_FORM): On Error GoTo 0
        If Not wsForm Is Nothing Then
            On Error Resume Next: Set leg = wsForm.Shapes(legendName): On Error GoTo 0
        End If
    End If

    ' 범례 크기 (없으면 기본). 그린 박스 중심에 맞춰 배치
    Dim lw As Double, lh As Double
    lw = FAC_DEFAULT_W: lh = FAC_DEFAULT_H
    On Error Resume Next
    If Not leg Is Nothing Then lw = leg.Width: lh = leg.Height
    On Error GoTo 0

    ' 범례 옵션 콤보 (시설물 크기 %) — 100% 가 최초, 80/60/40 은 축소
    Dim facScalePct As Long, facWeightDelta As Double
    If Not leg Is Nothing Then 범례_옵션_읽기 leg, facScalePct, facWeightDelta Else facScalePct = 100
    If facScalePct <= 0 Then facScalePct = 100
    lw = lw * facScalePct / 100
    lh = lh * facScalePct / 100
    ' 그린 영역의 「좌측 최상단」 에 범례 크기로 배치 (가운데 정렬 X — owner 요청)
    Dim cLeft As Double, cTop As Double
    cLeft = dLeft
    cTop = dTop

    ' 그린 임시 도형 제거
    On Error Resume Next
    shp.Delete
    On Error GoTo 0

    ' 이름·ID 는 묻지 않음 — 설명선의 「구분」 자리는 범례 명칭 자동 입력 (owner 요구).
    '   「함체명을 입력하세요」 / 「ID」 자리는 그대로 → 사용자가 더블클릭해 채움
    Dim name As String: name = ""
    Dim legLab As String: legLab = MetaLookupLabel(legendName)
    If Len(legLab) = 0 Then legLab = "구분"
    Dim calloutText As String
    calloutText = legLab & vbCr & "함체명을 입력하세요" & vbCr & "ID"

    Dim facId As String: facId = PREFIX_FAC & NewId8()

    ' 시설물 도형 = 사용자가 그린 범례 모양·색·크기 그대로 복제 (강제 변환 없음)
    Dim newShp As Shape
    Set newShp = CloneLegendShape(leg, ws, cLeft, cTop, lw, lh, "")
    newShp.Name = facId
    newShp.OnAction = ""            ' OnAction 없음 → 클릭 선택·이동·더블클릭 편집 (네이티브)
    newShp.Locked = False
    newShp.Placement = 3
    On Error Resume Next
    newShp.ZOrder msoBringToFront   ' 시설물은 케이블 위(맨 앞)
    On Error GoTo 0

    Dim badgeNo As Long: badgeNo = NextBadgeNo()
    AppendMetaRow SHEET_META_FAC, Array(facId, kind, name, Now, badgeNo)

    ' 행정도 배지 부착 — 시설물 우상단 빨간 사각형 + 흰 번호
    AddBadge ws, newShp, facId, CStr(badgeNo)

    ' 네트웍구성도 복제 — 행정도 좌표를 20x20 격자 셀 「중앙」 으로 자동 스냅 (시설물이 항상 격자 안에 들어가게)
    Dim wsNw As Worksheet: Set wsNw = ThisWorkbook.Worksheets(SHEET_NETWORK)
    Dim wasProtNw As Boolean
    wasProtNw = wsNw.ProtectContents Or wsNw.ProtectDrawingObjects
    On Error Resume Next
    wsNw.Unprotect
    On Error GoTo 0
    ' 격자 중앙 좌표 산출 → 시설물 좌상단 = 중앙 - 크기/2
    Dim nwCenterX As Double, nwCenterY As Double
    SnapToNetworkGrid wsNw, cLeft + lw / 2, cTop + lh / 2, nwCenterX, nwCenterY
    ' owner 2026-06-10 v3: 배경지도 있으면 「확대된 행정도」 비례 배치 — 이상위치 + 1링 방향 재배치 + 밀집 시 격자 자동확장·전체 재배치.
    '   배경 없으면 레거시 B안(행정도 기준-방향 8-cell). [복원 지점 = 커밋 1928ee2 — 이 If 블록을 옛 2줄(비례좌표+빈격자_찾기)로]
    If Not 네트웍_비례_배치(ws, wsNw, cLeft + lw / 2, cTop + lh / 2, lw, lh, facId, nwCenterX, nwCenterY) Then
        네트웍_빈격자_찾기 wsNw, nwCenterX, nwCenterY, lw, lh, facId, cLeft + lw / 2, cTop + lh / 2, ws
    End If
    Dim nwLeft As Double, nwTop As Double
    nwLeft = nwCenterX - lw / 2
    nwTop = nwCenterY - lh / 2
    Dim shNw As Shape
    On Error Resume Next
    Set shNw = CloneLegendShape(leg, wsNw, nwLeft, nwTop, lw, lh, "")
    shNw.Name = facId
    shNw.OnAction = ""
    shNw.Locked = False
    shNw.Placement = 3
    On Error GoTo 0
    ' owner 2026-06-10: 복제 도형의 「실제」 크기가 lw/lh 와 미세하게 달라질 수 있어(그룹 스케일 등)
    '   좌상단 기준 배치 시 중심이 십자보다 약간 아래/옆으로 어긋남 → 실제 bbox 기준 중앙 재정렬.
    If Not shNw Is Nothing Then
        On Error Resume Next
        shNw.Left = nwCenterX - shNw.Width / 2
        shNw.Top = nwCenterY - shNw.Height / 2
        On Error GoTo 0
    End If
    ' 네트웍구성도 시설물 — 설명선 + 배지 + 상태 박스 + 태그 콤보 부착 (행정도와 같은 번호)
    '   legLab 은 calloutText 생성 시 이미 계산됨
    If Not shNw Is Nothing Then
        AddFacilityCallout wsNw, shNw, facId, calloutText, legLab
        AddBadge wsNw, shNw, facId, CStr(badgeNo)
        AddFacilityStatusBox wsNw, facId
        AddFacilityTagCombo wsNw, facId
        시설물_태그_위치_동기화 wsNw, facId
    End If
    If wasProtNw Then ApplySheetProtection wsNw

    ' 설명선(박스 + 연결선) 자동 부착 (행정도). callout 생성 후 배지를 callout 좌상단으로 이동
    AddFacilityCallout ws, newShp, facId, calloutText, legLab
    배지_위치_동기화 ws

    If wasProt Then ApplySheetProtection ws

    ' Undo 기록 — 시설물 추가 완료 시점에 facId 만 기록 (역동작 = 그 facId 삭제)
    Action_저장 "facility_add", "facId=" & facId, "시설물 추가: " & kind

    ' 반복 모드 — 같은 범례로 계속 그리기. (다른 범례 선택 또는 ESC 로 중단)
    g_mode = "draw_facility"
    g_legendShape = legendName
    g_legendLabel = kind
    HighlightSelectedLegend legendName
    UpdateModeIndicator
    BeginFacilityDraw legendName   ' baseline 재스냅샷 + 십자 재진입 + 자동 감지 재예약
    Application.StatusBar = "[" & name & "] 등록 완료 — 같은 종류 계속 그리세요. 멈추려면 ESC."
End Sub

' ============================================================================
'  케이블 — 네이티브 선 그리기 자동 감지 (시설물과 동일 패턴)
' ============================================================================
' OnTime 콜백 — 새로 그린 선/커넥터 감지 → 양 끝 최근접 시설물로 케이블 등록
Public Sub DetectDrawnCable()
    On Error Resume Next
    Static reentry As Boolean
    If reentry Then Exit Sub
    reentry = True
    DetectDrawnCable_Body
    reentry = False
End Sub

Public Sub DetectDrawnCable_Body()
    On Error Resume Next
    If g_mode <> "draw_cable" Then Exit Sub
    If Len(g_drawLegendName) = 0 Then Exit Sub
    If g_drawBaseline Is Nothing Then Exit Sub

    Dim ws As Worksheet: Set ws = ThisWorkbook.Worksheets(SHEET_ADMIN)
    Dim sh As Shape, found As Shape
    For Each sh In ws.Shapes
        If IsNewDrawnLine(sh) Then Set found = sh: Exit For
    Next sh

    If Not found Is Nothing Then
        FinalizeDrawnCable found
        Exit Sub
    End If

    g_drawPolls = g_drawPolls - 1
    If g_drawPolls > 0 Then
        Application.OnTime Now + TimeSerial(0, 0, 1), "DetectDrawnCable"
    Else
        Application.StatusBar = "케이블 그리기 종료."
        g_drawLegendName = ""
        g_mode = ""
        HighlightSelectedLegend ""
        UpdateModeIndicator        ' 모드 표시줄 숨김
        ApplySheetProtection ws
    End If
End Sub

' 새로 그린 선/커넥터인지 (스냅샷에 없고 시스템 도형 아님).
'   케이블 모드에선 사용자가 그리는 것은 선뿐이므로, 타입을 까다롭게 보지 않고
'   「스냅샷에 없는 새 비-시스템 도형」 이면 케이블 후보로 인식 (커넥터 타입 환경차 회피).
Public Function IsNewDrawnLine(sh As Shape) As Boolean
    On Error Resume Next
    Dim nm As String: nm = sh.Name
    If nm = BG_NAME Or nm = PRINT_BG_NAME Or nm = PRINT_BG_EMBED_NAME Or nm = "_mode_indicator" Then Exit Function
    If Left(nm, Len(PREFIX_FAC)) = PREFIX_FAC Then Exit Function
    If Left(nm, Len(PREFIX_CBL)) = PREFIX_CBL Then Exit Function
    If Left(nm, Len(PREFIX_LEG_FAC)) = PREFIX_LEG_FAC Then Exit Function
    If Left(nm, Len(PREFIX_LEG_CBL)) = PREFIX_LEG_CBL Then Exit Function
    If Left(nm, Len(PREFIX_LEG_LABEL)) = PREFIX_LEG_LABEL Then Exit Function
    If Left(nm, Len(PREFIX_LABEL)) = PREFIX_LABEL Then Exit Function
    If Left(nm, Len(PREFIX_LEADER)) = PREFIX_LEADER Then Exit Function
    If Left(nm, Len(PREFIX_WP_TMP)) = PREFIX_WP_TMP Then Exit Function
    If Left(nm, Len(PREFIX_BG_PIECE)) = PREFIX_BG_PIECE Then Exit Function
    If Left(nm, Len(PANEL_PREFIX)) = PANEL_PREFIX Then Exit Function
    If Left(nm, Len(GRID_PREFIX)) = GRID_PREFIX Then Exit Function    ' 네트웍구성도 격자 보조선
    If Left(nm, Len(PREFIX_BADGE)) = PREFIX_BADGE Then Exit Function  ' 시설물 번호 배지
    If Left(nm, Len(PREFIX_FAC_TAG)) = PREFIX_FAC_TAG Then Exit Function  ' 시설물 태그 (_fac_tag_ 와 _fac_tag_dd_ 모두 prefix 일치)
    If Left(nm, Len(PREFIX_FAC_STATUS)) = PREFIX_FAC_STATUS Then Exit Function  ' 시설물 상태 박스
    If Left(nm, Len(PREFIX_CBL_X)) = PREFIX_CBL_X Then Exit Function   ' owner 2026-06-09 (8-125): 철거 X 마크 제외
    If Left(nm, Len(PREFIX_ADMIN_COMBO)) = PREFIX_ADMIN_COMBO Then Exit Function   ' owner 2026-06-10 (Step C): 행정도 콤보·라벨·미리보기 제외

    Dim existed As Boolean: existed = False
    If Not g_drawBaseline Is Nothing Then existed = g_drawBaseline.Exists(nm)
    IsNewDrawnLine = Not existed
End Function

' 그린 선을 케이블로 확정.
'   - 사용자가 그린 자유형 선을 「그대로」 케이블로 사용 (삭제·재그리기 안 함 → 사라짐 방지).
'     이름·색만 바꿈. 경로점(가운데 클릭점)도 그대로 보존됨.
'   - 양 끝이 시설물 근처(250pt)면 그 시설물을 from/to 로 기록 + 네트웍에 직선 복제.
'     시설물 없으면 그냥 그린 그대로 (자유 끝점).
Public Sub FinalizeDrawnCable(ln As Shape)
    Dim ws As Worksheet: Set ws = ThisWorkbook.Worksheets(SHEET_ADMIN)
    Dim wsNw As Worksheet: Set wsNw = ThisWorkbook.Worksheets(SHEET_NETWORK)
    Dim legendName As String: legendName = g_drawLegendName
    Dim spec As String: spec = g_cableSpec
    g_drawLegendName = ""   ' 중복 처리 방지

    ' 양 끝점 좌표 — 자유형 첫/끝 노드, 없으면 bbox 끝점
    Dim fx As Double, fy As Double, tx As Double, ty As Double
    Dim nc As Long: nc = 0
    On Error Resume Next
    nc = ln.Nodes.Count
    On Error GoTo 0
    If nc >= 2 Then
        Dim pA As Variant, pB As Variant
        On Error Resume Next
        pA = ln.Nodes(1).Points
        pB = ln.Nodes(nc).Points
        On Error GoTo 0
        fx = CDbl(pA(1, 1)): fy = CDbl(pA(1, 2))
        tx = CDbl(pB(1, 1)): ty = CDbl(pB(1, 2))
    Else
        GetLineEndpoints ln, fx, fy, tx, ty
    End If

    Dim fromId As String: fromId = NearestFacilityId(ws, fx, fy)
    Dim toId As String: toId = NearestFacilityId(ws, tx, ty)
    ' 매칭 실패 시 bbox 끝점으로 재시도 (자유형 노드 좌표가 안 맞는 환경 대비)
    If Len(fromId) = 0 And Len(toId) = 0 Then
        Dim gx1 As Double, gy1 As Double, gx2 As Double, gy2 As Double
        GetLineEndpoints ln, gx1, gy1, gx2, gy2
        fromId = NearestFacilityId(ws, gx1, gy1)
        toId = NearestFacilityId(ws, gx2, gy2)
    End If
    If Len(fromId) > 0 And fromId = toId Then toId = ""

    ' 케이블 범례의 선 색·두께 (글로우 강조라 Line 원본 유지됨)
    ' owner 2026-06-08 (8-124-fix4): cleg 찾기 — 행정도 우선, 없으면 양식 시트 fallback.
    Dim lc As Long: lc = CBL_DEFAULT_COLOR
    Dim lwt As Double: lwt = CBL_LINE_WEIGHT
    Dim cleg As Shape: Set cleg = Nothing
    On Error Resume Next
    Set cleg = ws.Shapes(legendName)
    On Error GoTo 0
    If cleg Is Nothing Then
        Dim wsFormC As Worksheet
        On Error Resume Next: Set wsFormC = ThisWorkbook.Worksheets(SHEET_LEGEND_FORM): On Error GoTo 0
        If Not wsFormC Is Nothing Then
            On Error Resume Next: Set cleg = wsFormC.Shapes(legendName): On Error GoTo 0
        End If
    End If

    ' owner 2026-06-08 (8-124-fix11): Group 이면 안에서 첫 직선 자식 찾기 — Line.ForeColor 가 default 인 문제 해결.
    '   msoConnector 는 msoShapeType enum 에 없음 (connector 도형은 msoLine 으로 분류). 변수명 단순화.
    Dim legLine As Shape: Set legLine = cleg
    Dim cLegT As Long: cLegT = 0
    On Error Resume Next: cLegT = cleg.Type: On Error GoTo 0
    If cLegT = msoGroup Then
        Dim grpIdx As Long
        For grpIdx = 1 To cleg.GroupItems.Count
            Dim grpKid As Shape: Set grpKid = Nothing
            On Error Resume Next: Set grpKid = cleg.GroupItems(grpIdx): On Error GoTo 0
            If Not grpKid Is Nothing Then
                Dim grpKidT As Long: grpKidT = 0
                On Error Resume Next: grpKidT = grpKid.Type: On Error GoTo 0
                If grpKidT = msoLine Then
                    Set legLine = grpKid
                    Exit For
                ElseIf grpKidT = msoFreeform Then
                    Set legLine = grpKid
                    Exit For
                End If
            End If
        Next grpIdx
    End If

    Dim lds As Long: lds = msoLineSolid   ' owner 2026-06-10: 양식 케이블 점선/실선 스타일 복제 (지중=점선 등)
    On Error Resume Next
    If Not legLine Is Nothing Then
        lc = legLine.Line.ForeColor.RGB
        If legLine.Line.Weight > 0 Then lwt = legLine.Line.Weight
        lds = legLine.Line.DashStyle
    End If
    On Error GoTo 0

    ' 범례 옵션 콤보 (케이블 두께 가산 t) — 0t 가 최초, 0.5~3t 는 더 두껍게
    Dim cblScalePct As Long, cblWeightDelta As Double
    If Not cleg Is Nothing Then 범례_옵션_읽기 cleg, cblScalePct, cblWeightDelta Else cblWeightDelta = 0
    If cblWeightDelta > 0 Then lwt = lwt + cblWeightDelta

    Dim wasProt As Boolean: wasProt = ws.ProtectContents Or ws.ProtectDrawingObjects
    On Error Resume Next
    ws.Unprotect
    On Error GoTo 0

    ' 그린 자유형을 그대로 케이블로 사용 (삭제 X) → 사라짐 방지. 범례 색 적용.
    Dim cblId As String: cblId = PREFIX_CBL & NewId8()
    On Error Resume Next
    ln.Name = cblId
    ln.OnAction = ""
    ln.Placement = 3
    ln.Line.ForeColor.RGB = lc
    ln.Line.Weight = lwt
    ln.Line.DashStyle = lds   ' owner 2026-06-10: 양식 점선 반영
    ' 끝 노드를 시설물 중심으로 스냅 (연결점에 붙게)
    If nc >= 2 Then
        If Len(fromId) > 0 Then
            Dim sfac As Shape: Set sfac = ws.Shapes(fromId)
            ln.Nodes.SetPosition 1, sfac.Left + sfac.Width / 2, sfac.Top + sfac.Height / 2
        End If
        If Len(toId) > 0 Then
            Dim tfac As Shape: Set tfac = ws.Shapes(toId)
            ln.Nodes.SetPosition nc, tfac.Left + tfac.Width / 2, tfac.Top + tfac.Height / 2
        End If
    End If
    ' 케이블 설명선(말풍선) — 행정도 중간점에. 규격은 범례 선택값(spec) 자동, ID·거리는 사용자가 채움.
    ' owner 2026-06-08 (8-84): 「케이블ID」 → 「선로ID」 (네트웍구성도와 라벨 통일)
    ' owner 2026-06-11: 규격 줄 = 「규격/구분」 (예: 36C/가공). 구분 콤보 미선택·규격과 동일하면 규격만.
    Dim specDisp As String: specDisp = spec
    If Len(g_cableGubun) > 0 Then
        If g_cableGubun <> spec Then specDisp = spec & "/" & g_cableGubun
    End If
    AddCableCallout ws, ln, cblId, "선로ID" & vbCr & specDisp & vbCr & "거리", spec

    ' 레이어 정렬 — 배경(맨뒤) < 케이블 < 시설물 < 설명선 < 범례·버튼 (검증된 순서 함수 재사용)
    레이어_정리_시트 ws

    If wasProt Then ApplySheetProtection ws

    ' 네트웍 — 양 끝 모두 시설물일 때 「직선」 커넥터로 연결 (꺽은선 X). 시설물 따라 이동.
    '   방향: 행정도의 |dx| vs |dy| 비교 — 가로 우세면 to 시설물 Y 를 from Y 에, 세로 우세면 X 를 from X 에 맞춰
    '         케이블이 가로/세로 직선으로 자연스럽게 보이도록 to 시설물 위치 보정. (이미 다른 케이블 있으면 보정 안 함)
    If Len(fromId) > 0 And Len(toId) > 0 Then
        Dim wasProtNw As Boolean: wasProtNw = wsNw.ProtectContents Or wsNw.ProtectDrawingObjects
        On Error Resume Next
        wsNw.Unprotect
        Dim fnw As Shape: Set fnw = wsNw.Shapes(fromId)
        Dim tnw As Shape: Set tnw = wsNw.Shapes(toId)
        On Error GoTo 0
        If Not fnw Is Nothing And Not tnw Is Nothing Then
            ' owner 요구 — 시설물 정 중앙 연결. Connector 는 site(가장자리) 만 부착 가능 → AddLine 사용
            ' 양 끝 좌표 = 시설물 중심. 시설물 이동 시 「네트웍_케이블_재라우팅」 가 매번 좌표 재설정
            On Error Resume Next
            Dim fcx As Double, fcy As Double, tcx As Double, tcy As Double
            fcx = fnw.Left + fnw.Width / 2: fcy = fnw.Top + fnw.Height / 2
            tcx = tnw.Left + tnw.Width / 2: tcy = tnw.Top + tnw.Height / 2
            Dim shNw As Shape
            Set shNw = wsNw.Shapes.AddLine(fcx, fcy, tcx, tcy)
            shNw.Name = cblId
            shNw.OnAction = ""
            shNw.Placement = 3
            shNw.Line.ForeColor.RGB = lc
            shNw.Line.DashStyle = lds
            shNw.Line.Weight = lwt
            On Error GoTo 0
            AddCableCalloutBox wsNw, shNw, cblId, spec
        End If
        레이어_정리_시트 wsNw
        If wasProtNw Then ApplySheetProtection wsNw
    End If

    ' 메타 헤더에 구분(7번) 컬럼 보장 — 기존 워크북(6컬럼)도 MetaFindRow 가 7번을 읽게. owner 2026-06-10
    On Error Resume Next
    Dim wsCblHdr As Worksheet: Set wsCblHdr = ThisWorkbook.Worksheets(SHEET_META_CBL)
    If Not wsCblHdr Is Nothing Then
        If Len(CStr(wsCblHdr.Cells(1, 7).Value)) = 0 Then wsCblHdr.Cells(1, 7).Value = "gubun"
    End If
    On Error GoTo 0
    ' spec(4)=규격(코어연결·코어수 파싱) · gubun(7)=구분(기별명세서). 화면 표시 아님 — 저장만. owner 2026-06-10
    AppendMetaRow SHEET_META_CBL, Array(cblId, fromId, toId, spec, "", Now, g_cableGubun)

    ' owner 2026-06-11: 같은 구간 다조 케이블 — 메타 등록 직후 ㄷ자/L자 분리 즉시 적용
    If Len(fromId) > 0 And Len(toId) > 0 Then 네트웍_케이블_재라우팅 wsNw

    ' owner 2026-06-09 (8-125): 철거 케이블 — 케이블 위에 X자 마크 배치 (간격 균등, 기울기 추종)
    '   판단: 범례 메타의 「구분」(MetaLookupLabel) 에 "철거" 포함 시
    '   적용: 행정도(Freeform 경로) + 네트웍구성도(직선) 양 시트 모두
    '   owner 2026-06-09 (8-125-fix1): X 배치 중 에러 발생해도 케이블 등록 흐름 계속 — Resume Next 가드
    '   owner 2026-06-09 (8-125-fix4): fromId/toId 있으면 그 끝은 시설물 부착 → 첫/끝 X 생략
    Dim cblGubun As String: cblGubun = MetaLookupLabel(legendName)
    If InStr(cblGubun, "철거") > 0 Then
        On Error Resume Next
        PlaceCableRemovalXMarks ws, ln, cblId, lc, lwt, Len(fromId) > 0, Len(toId) > 0
        If Len(fromId) > 0 And Len(toId) > 0 Then
            Dim shNwX As Shape: Set shNwX = Nothing
            Set shNwX = wsNw.Shapes(cblId)
            ' 네트웍 케이블은 정의상 양 끝 시설물 (직선)
            If Not shNwX Is Nothing Then PlaceCableRemovalXMarks wsNw, shNwX, cblId, lc, lwt, True, True
        End If
        On Error GoTo 0
    End If

    ' Undo 기록 — 케이블 추가 (역동작 = cblId 로 케이블 삭제)
    Action_저장 "cable_add", "cblId=" & cblId, "케이블 추가: " & spec

    ' 반복 — 같은 규격으로 계속
    g_mode = "draw_cable"
    g_legendShape = legendName
    HighlightSelectedLegend legendName
    UpdateModeIndicator
    BeginCableDraw legendName
    Application.StatusBar = "케이블 그림 완료 — 계속 그리세요. 멈추려면 ESC."
End Sub

' owner 2026-06-09 (8-125-fix3): X 간격·크기·두께 InputBox 조절 + 즉시 전체 갱신.
'   매번 import 재실행 없이 즉시 시각 결과 확인 가능.
'   ESC·Cancel 누르면 값 변경 안 함 (그대로 갱신만 실행).
Public Sub 철거_X마크_조정()
    Dim curIv As Double, curHf As Double, curWr As Double
    curIv = g_xRemovalInterval: If curIv <= 0 Then curIv = 20
    curHf = g_xRemovalHalf: If curHf <= 0 Then curHf = 4
    curWr = g_xRemovalWeightRatio: If curWr <= 0 Then curWr = 0.7

    Dim sIv As String
    sIv = InputBox("X 사이 간격 (pt) — 작을수록 촘촘" & vbLf & vbLf & _
                   "현재: " & curIv & vbLf & _
                   "참고: 50=듬성 · 25=중간 · 20=권장 · 10=촘촘", _
                   "철거 X 마크 — 간격", CStr(curIv))
    If Len(sIv) = 0 Then Exit Sub
    Dim newIv As Double: newIv = Val(sIv)
    If newIv <= 0 Or newIv > 1000 Then
        MsgBox "간격은 0 보다 크고 1000 이하여야 합니다.", vbExclamation: Exit Sub
    End If

    Dim sHf As String
    sHf = InputBox("X 한 팔 길이 (pt) — 작을수록 작은 X" & vbLf & vbLf & _
                   "현재: " & curHf & vbLf & _
                   "참고: 7=큼 · 5=중간 · 4=권장 · 2=작음", _
                   "철거 X 마크 — 크기", CStr(curHf))
    If Len(sHf) = 0 Then Exit Sub
    Dim newHf As Double: newHf = Val(sHf)
    If newHf <= 0 Or newHf > 100 Then
        MsgBox "크기는 0 보다 크고 100 이하여야 합니다.", vbExclamation: Exit Sub
    End If

    Dim sWr As String
    sWr = InputBox("X 두께 비율 (0.1~2.0) — 케이블 두께 대비" & vbLf & vbLf & _
                   "현재: " & curWr & vbLf & _
                   "참고: 0.5=절반 · 0.7=권장 · 1.0=동일 · 2.0=두배", _
                   "철거 X 마크 — 두께", CStr(curWr))
    If Len(sWr) = 0 Then Exit Sub
    Dim newWr As Double: newWr = Val(sWr)
    If newWr <= 0 Or newWr > 5 Then
        MsgBox "두께 비율은 0 보다 크고 5 이하여야 합니다.", vbExclamation: Exit Sub
    End If

    g_xRemovalInterval = newIv
    g_xRemovalHalf = newHf
    g_xRemovalWeightRatio = newWr

    철거_X마크_전체_갱신
End Sub

' owner 2026-06-09 (8-125-fix1): 모든 철거 케이블 X자 마크 갱신.
'   현재 PlaceCableRemovalXMarks 상수(간격·크기·두께) 로 모든 철거 케이블의 X 재배치.
'   - 메타 SHEET_META_CBL 의 모든 cblId 순회 → 회선 ID 매칭으로 범례 찾고 「구분」 조회
'   - "철거" 라면 기존 X 마크 cascade 제거 + PlaceCableRemovalXMarks 재실행
'   - 행정도·네트웍구성도 양 시트 모두
Public Sub 철거_X마크_전체_갱신()
    Dim wsAd As Worksheet: Set wsAd = ThisWorkbook.Worksheets(SHEET_ADMIN)
    Dim wsNw As Worksheet: Set wsNw = Nothing
    On Error Resume Next: Set wsNw = ThisWorkbook.Worksheets(SHEET_NETWORK): On Error GoTo 0

    Dim wsMeta As Worksheet
    On Error Resume Next: Set wsMeta = ThisWorkbook.Worksheets(SHEET_META_CBL): On Error GoTo 0
    If wsMeta Is Nothing Then
        MsgBox "케이블 메타 시트가 없습니다.", vbExclamation
        Exit Sub
    End If

    Dim oUpd As Boolean: oUpd = Application.ScreenUpdating
    Application.ScreenUpdating = False

    Dim lastRow As Long: lastRow = wsMeta.Cells(wsMeta.Rows.Count, 1).End(xlUp).Row
    Dim updated As Long: updated = 0
    Dim r As Long
    For r = 2 To lastRow
        Dim cblId As String: cblId = CStr(wsMeta.Cells(r, 1).Value)
        If Len(cblId) = 0 Then GoTo NextCbl

        ' 케이블 도형 (행정도) 가져오기
        Dim cbl As Shape: Set cbl = Nothing
        On Error Resume Next: Set cbl = wsAd.Shapes(cblId): On Error GoTo 0
        If cbl Is Nothing Then GoTo NextCbl

        ' 케이블의 범례 찾기 — 메타 spec(col 4) 로 매칭은 부정확 → 케이블 시트 보조 정보 없음.
        '   해결: 케이블 색·두께로 추정 어려움. 대신 모든 케이블의 X 마크 우선 제거 후
        '         「구분」=철거 판단 가능한 케이블만 재배치.
        '   현재 케이블 spec 으로 메타_범례 시트에서 spec 일치 + 구분=철거 인 row 찾기.
        Dim cblSpec As String: cblSpec = CStr(wsMeta.Cells(r, 4).Value)

        ' owner 2026-06-09 (8-125-fix2): _케이블 메타의 spec(col 4) 가 사실은 legend 의 구분
        '   (FinalizeDrawnCable 에서 g_cableSpec = MetaLookupLabel = 구분).
        '   양식 시스템에선 「철거」 같은 단어가 spec 컬럼에 저장됨. 직접 검사.
        Dim isRemoval As Boolean: isRemoval = (InStr(cblSpec, "철거") > 0)
        If Not isRemoval Then GoTo NextCbl

        ' owner 2026-06-09 (8-125-fix4): 시설물 부착 여부 — 메타의 fromId·toId 컬럼 (col 2·3)
        Dim fromFac As String: fromFac = CStr(wsMeta.Cells(r, 2).Value)
        Dim toFac As String: toFac = CStr(wsMeta.Cells(r, 3).Value)
        Dim fAtt As Boolean: fAtt = (Len(fromFac) > 0)
        Dim tAtt As Boolean: tAtt = (Len(toFac) > 0)

        ' 기존 X 마크 cascade 제거 (양 시트)
        케이블_X마크_제거 wsAd, cblId
        If Not wsNw Is Nothing Then 케이블_X마크_제거 wsNw, cblId

        ' 케이블 색·두께 추출 후 X 재배치
        Dim lc As Long: lc = vbBlack
        Dim lwt As Double: lwt = 1.5
        On Error Resume Next
        lc = cbl.Line.ForeColor.RGB
        lwt = cbl.Line.Weight
        On Error GoTo 0

        PlaceCableRemovalXMarks wsAd, cbl, cblId, lc, lwt, fAtt, tAtt

        ' 네트웍 케이블도 (있으면) — 정의상 양 끝 시설물 (True, True)
        If Not wsNw Is Nothing Then
            Dim cblNw As Shape: Set cblNw = Nothing
            On Error Resume Next: Set cblNw = wsNw.Shapes(cblId): On Error GoTo 0
            If Not cblNw Is Nothing Then
                PlaceCableRemovalXMarks wsNw, cblNw, cblId, lc, lwt, True, True
            End If
        End If

        updated = updated + 1
NextCbl:
    Next r

    Application.ScreenUpdating = oUpd
    MsgBox "철거 케이블 X 마크 갱신 완료: " & updated & " 건", vbInformation, "X 마크 갱신"
End Sub

' 케이블 규격 한 가지로 「철거 케이블 」 여부 판단 — 메타_범례 에서 cable kind + 구분=철거 + 규격 일치 검색
Public Function 철거_케이블_여부(cblSpec As String) As Boolean
    철거_케이블_여부 = False
    Dim wsLeg As Worksheet
    On Error Resume Next: Set wsLeg = ThisWorkbook.Worksheets(SHEET_META_LEG): On Error GoTo 0
    If wsLeg Is Nothing Then Exit Function

    Dim last As Long: last = wsLeg.Cells(wsLeg.Rows.Count, 1).End(xlUp).Row
    Dim i As Long
    For i = 2 To last
        Dim k As String: k = CStr(wsLeg.Cells(i, 2).Value)        ' kind
        Dim g As String: g = CStr(wsLeg.Cells(i, 3).Value)        ' 구분
        Dim s As String: s = CStr(wsLeg.Cells(i, 5).Value)        ' 규격
        If k = "cable" And InStr(g, "철거") > 0 And s = cblSpec Then
            철거_케이블_여부 = True
            Exit Function
        End If
    Next i
End Function

' owner 2026-06-09 (8-125): 철거 케이블 위에 X자 마크 일정 간격 배치.
'   - ln 이 Freeform(다중 노드) 이면 노드 segment 별로 길이·기울기 계산
'   - ln 이 msoLine(직선) 이면 양 끝점 1 segment 로 처리
'   - 각 X 마크는 케이블의 그 위치 segment 의 기울기에 맞춰 회전
'   - X 마크 이름: PREFIX_CBL_X & cblId & "_<idx>_a|b" (cascade 삭제용)
'   - Line.ForeColor / Weight 은 케이블과 동일 (시각적 일체감)
'   - owner 2026-06-09 (8-125-fix4): fromAttached/toAttached True 이면 그 끝 첫 X 생략 (다음 X 부터 표시)
Public Sub PlaceCableRemovalXMarks(ws As Worksheet, ln As Shape, cblId As String, _
                                   lineColor As Long, lineWt As Double, _
                                   Optional fromAttached As Boolean = False, _
                                   Optional toAttached As Boolean = False)
    On Error Resume Next
    If ws Is Nothing Or ln Is Nothing Then Exit Sub

    ' owner 2026-06-09 (8-125-fix3·fix4): 실시간 조절 — g_xRemoval* 우선, 0 이면 새 기본값(20·4·0.7)
    Dim X_INTERVAL As Double: X_INTERVAL = g_xRemovalInterval
    If X_INTERVAL <= 0 Then X_INTERVAL = 20
    Dim X_HALF As Double: X_HALF = g_xRemovalHalf
    If X_HALF <= 0 Then X_HALF = 4
    Dim X_WEIGHT_RATIO As Double: X_WEIGHT_RATIO = g_xRemovalWeightRatio
    If X_WEIGHT_RATIO <= 0 Then X_WEIGHT_RATIO = 0.7
    Const X_MAX_COUNT As Long = 300       ' owner 2026-06-09 (8-125-fix1): 무한 루프·과대 도형 방지

    ' 1) 케이블 경로점 수집 — Freeform 우선, 실패 시 bbox 두 끝점
    Dim pts() As Double
    Dim np As Long: np = 0
    Dim nc As Long: nc = 0
    nc = ln.Nodes.Count
    If nc >= 2 Then
        ReDim pts(1 To nc, 1 To 2)
        Dim i As Long
        For i = 1 To nc
            Dim ndp As Variant
            ndp = ln.Nodes(i).Points
            pts(i, 1) = CDbl(ndp(1, 1))
            pts(i, 2) = CDbl(ndp(1, 2))
        Next i
        np = nc
    Else
        ReDim pts(1 To 2, 1 To 2)
        Dim ax As Double, ay As Double, bx As Double, by As Double
        GetLineEndpoints ln, ax, ay, bx, by
        pts(1, 1) = ax: pts(1, 2) = ay
        pts(2, 1) = bx: pts(2, 2) = by
        np = 2
    End If

    If np < 2 Then Exit Sub

    ' 2) segment 길이 + 총 길이
    Dim segLen() As Double
    ReDim segLen(1 To np - 1)
    Dim totalLen As Double: totalLen = 0
    Dim k As Long
    For k = 1 To np - 1
        Dim dx As Double, dy As Double
        dx = pts(k + 1, 1) - pts(k, 1)
        dy = pts(k + 1, 2) - pts(k, 2)
        segLen(k) = Sqr(dx * dx + dy * dy)
        totalLen = totalLen + segLen(k)
    Next k
    If totalLen < 25 Then Exit Sub      ' 너무 짧으면 X 생략

    ' 3) 시트 보호 해제 (필요 시)
    Dim wasProt As Boolean
    wasProt = ws.ProtectContents Or ws.ProtectDrawingObjects
    On Error Resume Next: ws.Unprotect: On Error GoTo 0

    ' 4) 균등 간격 — 첫 X 는 0.5 * INTERVAL 위치부터
    '   owner 2026-06-09 (8-125-fix4): 시설물에 닿는 끝은 첫 X 생략 (다음 X 부터 표시)
    Dim startAcc As Double: startAcc = X_INTERVAL / 2
    If fromAttached Then startAcc = X_INTERVAL * 1.5
    Dim endLimit As Double: endLimit = totalLen
    If toAttached Then endLimit = totalLen - X_INTERVAL

    Dim acc As Double: acc = startAcc
    Dim xIdx As Long: xIdx = 0
    Dim xPrefix As String: xPrefix = PREFIX_CBL_X & cblId & "_"

    ' owner 2026-06-09 (8-125-fix1): 그리기 가속 — ScreenUpdating OFF
    Dim oUpd As Boolean: oUpd = Application.ScreenUpdating
    Application.ScreenUpdating = False

    Do While acc < endLimit And xIdx < X_MAX_COUNT
        ' 누적 거리 acc 가 속한 segment 찾기
        Dim cum As Double: cum = 0
        Dim sIdx As Long: sIdx = 1
        For k = 1 To np - 1
            If cum + segLen(k) >= acc Then
                sIdx = k
                Exit For
            End If
            cum = cum + segLen(k)
        Next k

        ' segment 내 보간
        Dim rem_ As Double: rem_ = acc - cum
        Dim t As Double
        If segLen(sIdx) > 0 Then
            t = rem_ / segLen(sIdx)
        Else
            t = 0
        End If
        Dim cx As Double, cy As Double
        cx = pts(sIdx, 1) + t * (pts(sIdx + 1, 1) - pts(sIdx, 1))
        cy = pts(sIdx, 2) + t * (pts(sIdx + 1, 2) - pts(sIdx, 2))

        ' segment 단위 벡터 (정규화)
        Dim ux As Double, uy As Double, segL As Double
        segL = segLen(sIdx)
        If segL = 0 Then segL = 1
        ux = (pts(sIdx + 1, 1) - pts(sIdx, 1)) / segL
        uy = (pts(sIdx + 1, 2) - pts(sIdx, 2)) / segL
        ' 수직 벡터 (90도 회전)
        Dim vx As Double, vy As Double
        vx = -uy: vy = ux

        ' X 의 두 팔: 케이블 방향 ±45 도
        '   arm A: (u + v) 방향, arm B: (u - v) 방향
        Dim hax As Double, hay As Double, hbx As Double, hby As Double
        hax = (ux + vx): hay = (uy + vy)
        hbx = (ux - vx): hby = (uy - vy)
        ' 정규화 (|u+v| = |u-v| = sqrt(2))
        Dim norm As Double: norm = Sqr(2)
        hax = hax / norm: hay = hay / norm
        hbx = hbx / norm: hby = hby / norm

        ' A 팔: 중심 ± X_HALF
        Dim a1x As Double, a1y As Double, a2x As Double, a2y As Double
        a1x = cx - X_HALF * hax: a1y = cy - X_HALF * hay
        a2x = cx + X_HALF * hax: a2y = cy + X_HALF * hay
        ' B 팔
        Dim b1x As Double, b1y As Double, b2x As Double, b2y As Double
        b1x = cx - X_HALF * hbx: b1y = cy - X_HALF * hby
        b2x = cx + X_HALF * hbx: b2y = cy + X_HALF * hby

        Dim lnA As Shape, lnB As Shape
        Set lnA = Nothing: Set lnB = Nothing
        On Error Resume Next
        Set lnA = ws.Shapes.AddLine(a1x, a1y, a2x, a2y)
        Set lnB = ws.Shapes.AddLine(b1x, b1y, b2x, b2y)
        On Error GoTo 0

        Dim xWt As Double: xWt = lineWt * X_WEIGHT_RATIO
        If xWt < 0.25 Then xWt = 0.25   ' Excel 최소 선 두께 보장

        If Not lnA Is Nothing Then
            On Error Resume Next
            lnA.Name = xPrefix & xIdx & "_a"
            lnA.Line.ForeColor.RGB = lineColor
            lnA.Line.Weight = xWt
            lnA.Placement = 3
            lnA.OnAction = ""
            lnA.Locked = True
            On Error GoTo 0
        End If
        If Not lnB Is Nothing Then
            On Error Resume Next
            lnB.Name = xPrefix & xIdx & "_b"
            lnB.Line.ForeColor.RGB = lineColor
            lnB.Line.Weight = xWt
            lnB.Placement = 3
            lnB.OnAction = ""
            lnB.Locked = True
            On Error GoTo 0
        End If

        xIdx = xIdx + 1
        acc = acc + X_INTERVAL
    Loop

    Application.ScreenUpdating = oUpd

    If wasProt Then ApplySheetProtection ws
End Sub

' 선/커넥터의 두 끝점 (flip 고려한 대각선)
Public Sub GetLineEndpoints(sh As Shape, ByRef ax As Double, ByRef ay As Double, _
                            ByRef bx As Double, ByRef by As Double)
    ' owner 2026-06-11 다조: ㄷ자/L자 케이블(freeform) — 첫/마지막 「노드」 가 실제 끝점.
    '   bbox+flip 방식은 꺾인 도형에서 끝점이 어긋남. 노드 있으면 노드 우선, 직선 line 은 기존 방식 (무변경).
    Dim ncGLE As Long: ncGLE = 0
    On Error Resume Next
    ncGLE = sh.Nodes.Count
    On Error GoTo 0
    If ncGLE >= 2 Then
        Dim nodeOK As Boolean: nodeOK = False
        Dim pvGLE As Variant
        On Error Resume Next
        Err.Clear
        pvGLE = sh.Nodes.Item(1).Points
        If Err.Number = 0 Then
            ax = pvGLE(1, 1): ay = pvGLE(1, 2)
            pvGLE = sh.Nodes.Item(ncGLE).Points
            If Err.Number = 0 Then
                bx = pvGLE(1, 1): by = pvGLE(1, 2)
                nodeOK = True
            End If
        End If
        Err.Clear
        On Error GoTo 0
        If nodeOK Then Exit Sub
    End If
    ax = sh.Left: ay = sh.Top
    bx = sh.Left + sh.Width: by = sh.Top + sh.Height
    Dim hf As Boolean, vf As Boolean
    On Error Resume Next
    hf = (sh.HorizontalFlip = msoTrue)
    vf = (sh.VerticalFlip = msoTrue)
    On Error GoTo 0
    If hf Xor vf Then
        ax = sh.Left + sh.Width: ay = sh.Top
        bx = sh.Left: by = sh.Top + sh.Height
    End If
End Sub

' owner 2026-06-11 다조 후속: 케이블의 「허브(시설물) 쪽 첫 segment」 방향 단위벡터.
'   직선 케이블 = 기존 (far end - 허브) 방향과 동일 결과. ㄷ자/L자 폴리라인 = 허브 쪽 끝 노드 → 인접 노드 방향.
'   선번박스·화살표가 눈에 보이는 segment 에 밀착·평행하도록 (chord 방향 사용 금지).
Public Function 케이블_허브방향(sh As Shape, fcx As Double, fcy As Double, _
                                 ByRef oux As Double, ByRef ouy As Double) As Boolean
    케이블_허브방향 = False
    If sh Is Nothing Then Exit Function
    Dim dirX As Double, dirY As Double
    Dim ncHD As Long: ncHD = 0
    On Error Resume Next
    ncHD = sh.Nodes.Count
    On Error GoTo 0
    If ncHD >= 3 Then
        ' 폴리라인 — 허브에 가까운 끝 노드와 그 인접 노드로 첫 segment 방향
        Dim okHD As Boolean: okHD = False
        Dim pH1 As Variant, pH2 As Variant, qH1 As Variant, qH2 As Variant
        On Error Resume Next
        Err.Clear
        pH1 = sh.Nodes.Item(1).Points
        pH2 = sh.Nodes.Item(2).Points
        qH1 = sh.Nodes.Item(ncHD).Points
        qH2 = sh.Nodes.Item(ncHD - 1).Points
        If Err.Number = 0 Then okHD = True
        Err.Clear
        On Error GoTo 0
        If okHD Then
            Dim dH1 As Double, dH2 As Double
            dH1 = (pH1(1, 1) - fcx) * (pH1(1, 1) - fcx) + (pH1(1, 2) - fcy) * (pH1(1, 2) - fcy)
            dH2 = (qH1(1, 1) - fcx) * (qH1(1, 1) - fcx) + (qH1(1, 2) - fcy) * (qH1(1, 2) - fcy)
            If dH1 <= dH2 Then
                dirX = pH2(1, 1) - pH1(1, 1): dirY = pH2(1, 2) - pH1(1, 2)
            Else
                dirX = qH2(1, 1) - qH1(1, 1): dirY = qH2(1, 2) - qH1(1, 2)
            End If
            Dim lenHD As Double: lenHD = Sqr(dirX * dirX + dirY * dirY)
            If lenHD > 0.001 Then
                oux = dirX / lenHD: ouy = dirY / lenHD
                케이블_허브방향 = True
                Exit Function
            End If
        End If
    End If
    ' 직선 (또는 Nodes 실패) — 기존 far-end 방식
    Dim axHD As Double, ayHD As Double, bxHD As Double, byHD As Double
    GetLineEndpoints sh, axHD, ayHD, bxHD, byHD
    Dim dA_HD As Double, dB_HD As Double
    dA_HD = (axHD - fcx) * (axHD - fcx) + (ayHD - fcy) * (ayHD - fcy)
    dB_HD = (bxHD - fcx) * (bxHD - fcx) + (byHD - fcy) * (byHD - fcy)
    If dA_HD > dB_HD Then
        dirX = axHD - fcx: dirY = ayHD - fcy
    Else
        dirX = bxHD - fcx: dirY = byHD - fcy
    End If
    Dim lenF_HD As Double: lenF_HD = Sqr(dirX * dirX + dirY * dirY)
    If lenF_HD < 0.001 Then Exit Function
    oux = dirX / lenF_HD: ouy = dirY / lenF_HD
    케이블_허브방향 = True
End Function

' (x,y) 에 중심이 가장 가까운 시설물 id. 150pt 보다 멀면 매칭 안 함("")
Public Function NearestFacilityId(ws As Worksheet, x As Double, y As Double) As String
    Dim sh As Shape, best As String, bestD As Double
    bestD = 1E+15
    For Each sh In ws.Shapes
        If Left(sh.Name, Len(PREFIX_FAC)) = PREFIX_FAC Then
            Dim cx As Double, cy As Double
            cx = sh.Left + sh.Width / 2
            cy = sh.Top + sh.Height / 2
            Dim d As Double: d = (cx - x) * (cx - x) + (cy - y) * (cy - y)
            If d < bestD Then bestD = d: best = sh.Name
        End If
    Next sh
    If bestD > 250# * 250# Then best = ""   ' 너무 멀면 매칭 안 함
    NearestFacilityId = best
End Function

' 선택한 시설물·케이블 삭제 (버튼). 시설물 클릭해 선택 → 이 버튼 (또는 Delete 키).
Public Sub 선택시설물_삭제()
    Dim shp As Shape: Set shp = GetSelectedShape(ActiveSheet)
    If shp Is Nothing Then
        MsgBox "삭제할 시설물·케이블을 먼저 클릭해 선택한 뒤 누르세요." & vbLf & _
               "(또는 선택한 상태에서 Delete 키)", vbExclamation
        Exit Sub
    End If
    삭제_도형 shp
End Sub

' Delete 키 핸들러 — 도형 선택 시 삭제(cascade), 셀 선택 시 기본 동작(내용 지우기)
Public Sub 도형_삭제키()
    Dim ws As Worksheet: Set ws = ActiveSheet
    If ws Is Nothing Then Exit Sub
    Dim shp As Shape: Set shp = Nothing
    If ws.Name = SHEET_ADMIN Or ws.Name = SHEET_NETWORK Then
        Set shp = GetSelectedShape(ws)
    ElseIf ws.Name = SHEET_LEGEND_FORM Then
        ' owner 2026-06-10: 양식 시트에서도 Del 로 선택 도형 삭제 (범례 해제 후 수정·삭제 가능하게).
        '   양식 도형은 단순 삭제 (시설물 cascade 불필요). 양식 버튼(스캔·해제)은 보호.
        Set shp = GetSelectedShape(ws)
        If Not shp Is Nothing Then
            If shp.Name = "_legend_form_scan_btn" Or shp.Name = "_legend_form_release_btn" Then
                MsgBox "양식 버튼은 삭제할 수 없습니다.", vbExclamation: Exit Sub
            End If
            On Error Resume Next: shp.Delete: On Error GoTo 0
        Else
            On Error Resume Next: Selection.ClearContents: On Error GoTo 0
        End If
        Exit Sub
    End If
    If shp Is Nothing Then
        On Error Resume Next
        Selection.ClearContents     ' 셀 선택 → 기본 Delete 동작 유지
        On Error GoTo 0
        Exit Sub
    End If
    삭제_도형 shp
End Sub

' 공용 삭제 — 시설물/케이블은 정보+확인 후 cascade, 그 외 도형은 단순 삭제 확인
Public Sub 삭제_도형(shp As Shape)
    If Left(shp.Name, Len(PREFIX_FAC)) = PREFIX_FAC Then
        Show시설물_정보 shp.Name
    ElseIf Left(shp.Name, Len(PREFIX_CBL)) = PREFIX_CBL Then
        Show케이블_정보 shp.Name
    Else
        ' 설명선·범례·기타 도형은 시스템 도형이 아니면 단순 삭제
        If shp.Name = BG_NAME Or Left(shp.Name, Len(PANEL_PREFIX)) = PANEL_PREFIX _
           Or shp.Name = "_mode_indicator" Then
            MsgBox "시스템 도형(배경·버튼)은 삭제할 수 없습니다.", vbExclamation
            Exit Sub
        End If
        Dim ans As VbMsgBoxResult
        ans = MsgBox("이 도형을 삭제할까요?", vbYesNo + vbQuestion, "삭제")
        If ans = vbYes Then
            On Error Resume Next
            shp.Delete
            On Error GoTo 0
        End If
    End If
End Sub

' 삭제 모드 토글 — 키보드 Delete 는 도형 선택 시 양 시트 동시삭제가 안 되는 환경이 있어,
'   OnAction 기반 클릭삭제로 「행정도+네트웍구성도 동시 삭제」를 보장.
'   ON: 모든 시설물·케이블에 「클릭=삭제」 부착. OFF: 해제(클릭=선택·이동 복귀).
Public Sub 삭제모드_토글()
    g_deleteMode = Not g_deleteMode
    Dim ws As Worksheet: Set ws = ThisWorkbook.Worksheets(SHEET_ADMIN)
    Dim wasProt As Boolean: wasProt = ws.ProtectContents Or ws.ProtectDrawingObjects
    On Error Resume Next
    ws.Unprotect
    On Error GoTo 0
    Dim sh As Shape
    For Each sh In ws.Shapes
        If Left(sh.Name, Len(PREFIX_FAC)) = PREFIX_FAC Then
            On Error Resume Next
            sh.OnAction = IIf(g_deleteMode, "시설물_삭제클릭", "")
            On Error GoTo 0
        ElseIf Left(sh.Name, Len(PREFIX_CBL)) = PREFIX_CBL Then
            On Error Resume Next
            sh.OnAction = IIf(g_deleteMode, "케이블_삭제클릭", "")
            On Error GoTo 0
        End If
    Next sh
    If wasProt Then ApplySheetProtection ws
    버튼_상태_반영
    If g_deleteMode Then
        Application.OnKey "{ESC}", "모드중_ESC취소"     ' ESC = 모드 OFF
        Application.StatusBar = "삭제 모드 ON — 시설물/케이블 클릭 = 양 시트 동시 삭제 (ESC = 모드 OFF)"
        MsgBox "삭제 모드 ON." & vbLf & vbLf & _
               "지울 시설물·케이블을 클릭하면 확인 후 행정도·네트웍구성도에서 함께 삭제됩니다." & vbLf & _
               "끝나면 「삭제 모드」 다시 누름 또는 ESC.", vbInformation, "삭제 모드"
    Else
        If Not (g_legendDeleteMode Or g_legendUnregisterMode) Then Application.OnKey "{ESC}"
        Application.StatusBar = "삭제 모드 OFF — 클릭=선택·이동, 더블클릭=글자 편집."
    End If
End Sub

Public Sub 시설물_삭제클릭()
    Show시설물_정보 CStr(Application.Caller)   ' fac_ + 메타 있으면 cascade, 없으면 고아도형_삭제(안전 단일/그룹)
End Sub
Public Sub 케이블_삭제클릭()
    Show케이블_정보 CStr(Application.Caller)
End Sub

' sh.Type = msoGroup 안전 판정 (일부 도형은 Type 접근 시 오류 가능). owner 2026-06-15
Public Function 도형_그룹여부(sh As Shape) As Boolean
    도형_그룹여부 = False
    On Error Resume Next
    도형_그룹여부 = (sh.Type = msoGroup)
    On Error GoTo 0
End Function

' 그룹 직속 자식 중 childName 이 있는지. owner 2026-06-15
Public Function 그룹_자식있음(grp As Shape, childName As String) As Boolean
    그룹_자식있음 = False
    On Error Resume Next
    Dim it As Shape
    For Each it In grp.GroupItems
        If it.Name = childName Then 그룹_자식있음 = True: Exit For
    Next it
    On Error GoTo 0
End Function

' 도형의 최상위(top-level) 조상 반환 — 그룹 자식이면 부모 그룹(엑셀에서 「선택」 단위)으로 타고 올라감.
'   클릭한 자식 1개만 지우지 말고 그룹 전체를 한 단위로 다루기 위함. 부모는 유일 → 이웃 오삭제 0. owner 2026-06-15
Public Function 최상위_도형(sh As Shape) As Shape
    Set 최상위_도형 = sh
    If sh Is Nothing Then Exit Function
    Dim cur As Shape: Set cur = sh
    Dim guard As Long: guard = 0
    Do
        Dim p As Shape: Set p = Nothing
        On Error Resume Next: Set p = cur.ParentGroup: On Error GoTo 0
        If p Is Nothing Then Exit Do
        Set cur = p
        guard = guard + 1
    Loop While guard < 20
    Set 최상위_도형 = cur
End Function

' 범례 지우기 — 범례는 OnAction(클릭=그리기 모드)이라 직접 선택이 어려워 「번호 목록」 방식
' 범례 지우기 = 토글. ON 이면 「범례 목록(위쪽 패널)에서 범례를 클릭」 하면 그 범례가 삭제됨.
'   OFF 면 평소대로 (범례 클릭 = 그리기 모드). 다시 누르면 해제.
Public Sub 범례_지우기()
    g_legendDeleteMode = Not g_legendDeleteMode
    범례_삭제모드_적용 g_legendDeleteMode
    If g_legendDeleteMode Then
        Application.OnKey "{ESC}", "모드중_ESC취소"     ' ESC = 모드 OFF
        Application.StatusBar = "범례 삭제 모드 ON — 위쪽 범례 목록에서 지울 범례 클릭 (ESC = 모드 OFF)"
        MsgBox "범례 삭제 모드가 켜졌습니다." & vbLf & vbLf & _
               "위쪽 범례 목록에서 지울 범례를 클릭하면 (확인 후) 삭제됩니다." & vbLf & _
               "여러 개 지운 뒤 끝나면 「범례 지우기」 다시 누름 또는 ESC.", _
               vbInformation, "범례 지우기"
    Else
        If Not (g_legendUnregisterMode Or g_deleteMode) Then Application.OnKey "{ESC}"
        Application.StatusBar = "범례 삭제 모드 OFF — 범례 클릭 = 그리기 모드로 복귀."
    End If
End Sub

' 삭제 모드 on/off 에 따라 모든 범례의 OnAction 전환 (on=삭제클릭 / off=그리기).
Public Sub 범례_삭제모드_적용(turnOn As Boolean)
    Dim ws As Worksheet: Set ws = ThisWorkbook.Worksheets(SHEET_ADMIN)
    Dim wasProt As Boolean: wasProt = ws.ProtectContents Or ws.ProtectDrawingObjects
    On Error Resume Next
    ws.Unprotect
    On Error GoTo 0
    Dim sh As Shape
    For Each sh In ws.Shapes
        On Error Resume Next
        If Left(sh.Name, Len(PREFIX_LEG_FAC)) = PREFIX_LEG_FAC Then
            sh.OnAction = IIf(turnOn, "범례_삭제클릭", "범례_시설물_선택")
        ElseIf Left(sh.Name, Len(PREFIX_LEG_CBL)) = PREFIX_LEG_CBL Then
            sh.OnAction = IIf(turnOn, "범례_삭제클릭", "범례_케이블_선택")
        End If
        On Error GoTo 0
    Next sh
    If wasProt Then ApplySheetProtection ws
End Sub

' 삭제 모드에서 범례 클릭 → 그 범례 + 왼쪽 이름 + 메타 삭제 (확인 후).
Public Sub 범례_삭제클릭()
    Dim ws As Worksheet: Set ws = ThisWorkbook.Worksheets(SHEET_ADMIN)
    Dim target As String: target = Application.Caller
    Dim labelTxt As String: labelTxt = MetaLookupLabel(target)

    Dim ans As VbMsgBoxResult
    ans = MsgBox("범례 「" & labelTxt & "」 을(를) 지울까요?", vbYesNo + vbQuestion, "범례 지우기")
    If ans <> vbYes Then Exit Sub

    Dim tIdp As String
    If Left(target, Len(PREFIX_LEG_CBL)) = PREFIX_LEG_CBL Then
        tIdp = Mid(target, Len(PREFIX_LEG_CBL) + 1)
    Else
        tIdp = Mid(target, Len(PREFIX_LEG_FAC) + 1)
    End If
    Dim wasProt As Boolean: wasProt = ws.ProtectContents Or ws.ProtectDrawingObjects
    On Error Resume Next
    ws.Unprotect
    ws.Shapes(target).Delete
    ws.Shapes(PREFIX_LEG_LABEL & tIdp).Delete
    On Error GoTo 0
    MetaDeleteRow SHEET_META_LEG, 1, target
    ' 한 범례 지운 후 모드 자동 OFF — owner 요구. 다음 범례 클릭 = 그리기 모드 복귀
    g_legendDeleteMode = False
    범례_삭제모드_적용 False
    UpdateFloatingPanelPosition ws
    If wasProt Then ApplySheetProtection ws
    Application.StatusBar = "범례 삭제됨: " & labelTxt & " — 삭제 모드 자동 OFF (재삭제 시 「범례 지우기」 재누름)"
End Sub

' ============================================================================
'  범례 해제 (등록만 풀기 — 도형은 시트에 남김)
'    삭제와 달리 도형 자체는 보존. OnAction·이름·메타·leglbl_ 만 제거.
'    해제 후 사용자가 그 도형을 다시 선택해 「범례 등록」 가능.
' ============================================================================
Public Sub 범례_해제_토글()
    g_legendUnregisterMode = Not g_legendUnregisterMode
    범례_해제모드_적용 g_legendUnregisterMode
    버튼_상태_반영
    If g_legendUnregisterMode Then
        Application.OnKey "{ESC}", "모드중_ESC취소"     ' ESC = 모드 OFF
        Application.StatusBar = "범례 해제 모드 ON — 위쪽 범례 클릭 = 등록 풀기 (ESC = 모드 OFF)"
        MsgBox "범례 해제 모드가 켜졌습니다." & vbLf & vbLf & _
               "위쪽 범례를 클릭하면 그 범례의 등록만 풀립니다." & vbLf & _
               "(도형 자체는 시트에 그대로 남음 → 다시 「범례 등록」 가능)" & vbLf & vbLf & _
               "끝나면 「범례 해제」 다시 누름 또는 ESC.", _
               vbInformation, "범례 해제"
    Else
        If Not (g_legendDeleteMode Or g_deleteMode) Then Application.OnKey "{ESC}"
        Application.StatusBar = "범례 해제 모드 OFF — 범례 클릭 = 그리기 모드로 복귀."
    End If
End Sub

' 해제 모드 on/off 에 따라 모든 범례의 OnAction 전환 (on=해제클릭 / off=그리기).
'   삭제 모드(g_legendDeleteMode) 와 동시에 켤 수 없도록 한쪽만 활성.
Public Sub 범례_해제모드_적용(turnOn As Boolean)
    Dim ws As Worksheet: Set ws = ThisWorkbook.Worksheets(SHEET_ADMIN)
    Dim wasProt As Boolean: wasProt = ws.ProtectContents Or ws.ProtectDrawingObjects
    On Error Resume Next
    ws.Unprotect
    On Error GoTo 0
    Dim sh As Shape
    For Each sh In ws.Shapes
        On Error Resume Next
        If Left(sh.Name, Len(PREFIX_LEG_FAC)) = PREFIX_LEG_FAC Then
            sh.OnAction = IIf(turnOn, "범례_해제클릭", "범례_시설물_선택")
        ElseIf Left(sh.Name, Len(PREFIX_LEG_CBL)) = PREFIX_LEG_CBL Then
            sh.OnAction = IIf(turnOn, "범례_해제클릭", "범례_케이블_선택")
        End If
        On Error GoTo 0
    Next sh
    If wasProt Then ApplySheetProtection ws
End Sub

' 해제 모드에서 범례 클릭 → 그 범례 등록만 풀기 (도형 유지).
'   - OnAction 비우고 이름을 released_<id> 로 변경 (다른 범례 prefix 와 충돌 방지)
'   - leglbl_ 텍스트박스 삭제
'   - _범례 메타 row 삭제
'   - Glow 강조 풀기
Public Sub 범례_해제클릭()
    Dim ws As Worksheet: Set ws = ThisWorkbook.Worksheets(SHEET_ADMIN)
    Dim target As String: target = Application.Caller
    Dim labelTxt As String: labelTxt = MetaLookupLabel(target)

    Dim ans As VbMsgBoxResult
    ans = MsgBox("범례 「" & labelTxt & "」 의 등록을 해제할까요?" & vbLf & vbLf & _
                 "(도형은 시트에 그대로 남고, 등록·이름만 풀립니다 → 다시 「범례 등록」 가능)", _
                 vbYesNo + vbQuestion, "범례 해제")
    If ans <> vbYes Then Exit Sub

    Dim tIdp As String, isCbl As Boolean
    isCbl = (Left(target, Len(PREFIX_LEG_CBL)) = PREFIX_LEG_CBL)
    If isCbl Then
        tIdp = Mid(target, Len(PREFIX_LEG_CBL) + 1)
    Else
        tIdp = Mid(target, Len(PREFIX_LEG_FAC) + 1)
    End If

    ' 도형이 패널 영역(row 1)에 남아있으면 새 콤보박스·선택 심볼에 가려져 사용자 시각엔 안 보임.
    '   시트 작업 영역(LEGEND_ROWS+2 행 부근의 화면 좌측) 으로 이동 + 가장 앞으로 + visible 확실히.
    '   ⚠️ 좌표 계산은 unprotect 블록 「밖」 에서 수행 — 안에서 중첩 On Error GoTo 0 를 쓰면
    '       바깥 Resume Next 까지 같이 풀려서 Group 도형의 .Glow/.Locked 등에서 사용자 오류 노출됨.
    Dim destLeft As Double, destTop As Double
    On Error Resume Next
    destLeft = ActiveWindow.VisibleRange.Left + 30
    On Error GoTo 0
    If destLeft <= 0 Then destLeft = ws.Cells(LEGEND_ROWS + 2, 2).Left
    destTop = ws.Cells(LEGEND_ROWS + 2, 1).Top + 8

    Dim wasProt As Boolean: wasProt = ws.ProtectContents Or ws.ProtectDrawingObjects
    On Error Resume Next
    ws.Unprotect
    ws.Shapes(PREFIX_LEG_LABEL & tIdp).Delete   ' leglbl_ 텍스트박스 삭제
    Dim shp As Shape: Set shp = ws.Shapes(target)
    If Not shp Is Nothing Then
        shp.OnAction = ""
        shp.Name = "released_" & NewId8()       ' prefix 풀기 — 다음 「범례 등록」 시 새 이름 부여
        ' Group 도형은 .Glow 가 직접 응답 안 할 수 있음 → 자식 도형까지 재귀로 정리 (Resume Next 가 보호)
        ClearGlowDeep shp
        shp.Placement = 3
        shp.Locked = False
        shp.Left = destLeft
        shp.Top = destTop
        shp.Visible = msoTrue
        shp.ZOrder 0    ' msoBringToFront — 다른 도형보다 앞으로
    End If
    On Error GoTo 0

    MetaDeleteRow SHEET_META_LEG, 1, target
    ' 한 범례 해제 후 모드 자동 OFF — owner 요구. 다음 범례 클릭 = 그리기 모드 복귀
    g_legendUnregisterMode = False
    범례_해제모드_적용 False
    UpdateFloatingPanelPosition ws
    If wasProt Then ApplySheetProtection ws

    Application.StatusBar = "범례 해제됨: " & labelTxt & " — 도형이 화면 좌상단 작업 영역으로 이동했습니다."
End Sub

' ============================================================================
'  「범례」 통합 메뉴 — 패널의 단일 「범례」 버튼이 호출.
'    1 등록 / 2 해제 / 3 지우기 / 4 순서 변경 (콤보박스 옵션 순서)
' ============================================================================
Public Sub 범례_메뉴()
    Dim ans As String
    ans = InputBox("범례 작업을 선택하세요:" & vbLf & vbLf & _
                   "  1 — 등록     (도형 선택 후 새 범례로 등록)" & vbLf & _
                   "  2 — 해제     (등록만 풀기 — 도형은 시트에 남김 / 토글 모드)" & vbLf & _
                   "  3 — 지우기   (범례 + 도형 모두 삭제 / 토글 모드)" & vbLf & _
                   "  4 — 순서 변경 (콤보박스 옵션 순서 정렬)", _
                   "범례", "1")
    If Len(Trim(ans)) = 0 Then Exit Sub

    Select Case Trim(ans)
        Case "1": 범례로_등록
        Case "2": 범례_해제_토글
        Case "3": 범례_지우기
        Case "4": 범례_순서_관리
        Case Else: MsgBox "1·2·3·4 중에서 입력하세요.", vbExclamation
    End Select
End Sub

' 「범례」→4 선택 시 — 콤보박스 옵션 순서를 위/아래로 정렬.
'   콤보박스 옵션 = _범례 메타 시트의 row 순서. 두 row 의 모든 컬럼을 swap 해 순서 변경.
'   한 번 매크로 호출 안에서 여러 step 처리 가능 (빈 칸 입력 시 종료).
Public Sub 범례_순서_관리()
    Dim kindNum As String
    kindNum = InputBox("정렬할 범례 종류:" & vbLf & vbLf & KindMenuText(), _
                       "범례 순서", "1")
    If Len(kindNum) = 0 Then Exit Sub
    Dim kind As String: kind = ParseKindChoice(kindNum)
    If Len(kind) = 0 Then MsgBox "1~4 중 입력.", vbExclamation: Exit Sub

    Dim wsLeg As Worksheet
    On Error Resume Next
    Set wsLeg = ThisWorkbook.Worksheets(SHEET_META_LEG)
    On Error GoTo 0
    If wsLeg Is Nothing Then Exit Sub

    Dim kindKor As String: kindKor = KindToKor(kind)
    Dim wsAd As Worksheet: Set wsAd = ThisWorkbook.Worksheets(SHEET_ADMIN)

    Do
        ' 매 step 마다 현재 순서 다시 모으기 (직전 swap 반영)
        Dim items As Collection: Set items = New Collection
        Dim last As Long: last = wsLeg.Cells(wsLeg.Rows.Count, 1).End(xlUp).Row
        Dim r As Long
        For r = 2 To last
            If CStr(wsLeg.Cells(r, 2).Value) = kind Then
                items.Add Array(r, CStr(wsLeg.Cells(r, 3).Value))
            End If
        Next r

        If items.Count <= 1 Then
            MsgBox "[" & kindKor & "] 정렬할 범례가 부족합니다 (" & items.Count & "개).", vbInformation
            Exit Sub
        End If

        Dim msg As String, i As Long
        msg = "[" & kindKor & "] 현재 순서:" & vbLf & vbLf
        For i = 1 To items.Count
            msg = msg & "  " & i & ". " & items(i)(1) & vbLf
        Next i
        msg = msg & vbLf & _
                    "조작:" & vbLf & _
                    "  +번호  →  위로 1칸  (예: +3)" & vbLf & _
                    "  -번호  →  아래로 1칸 (예: -3)" & vbLf & _
                    "  빈 칸  →  종료" & vbLf & vbLf & _
                    "여러번 연속 입력 가능."

        Dim ans As String: ans = InputBox(msg, "범례 순서")
        Dim s As String: s = Trim(ans)
        If Len(s) = 0 Then Exit Do

        Dim dir As Long: dir = 0
        If Left(s, 1) = "+" Then
            dir = -1
        ElseIf Left(s, 1) = "-" Then
            dir = 1
        Else
            MsgBox "+번호 (위로) 또는 -번호 (아래로) 로 입력하세요.", vbExclamation
            GoTo NextStep
        End If

        Dim numStr As String: numStr = Trim(Mid(s, 2))
        If Not IsNumeric(numStr) Then MsgBox "번호를 입력하세요.", vbExclamation: GoTo NextStep
        Dim n As Long: n = CLng(numStr)
        If n < 1 Or n > items.Count Then MsgBox "번호 범위가 잘못됨.", vbExclamation: GoTo NextStep

        Dim targetRow As Long: targetRow = CLng(items(n)(0))
        Dim swapRow As Long
        If dir = -1 Then
            If n = 1 Then MsgBox "이미 맨 위입니다.", vbExclamation: GoTo NextStep
            swapRow = CLng(items(n - 1)(0))
        Else
            If n = items.Count Then MsgBox "이미 맨 아래입니다.", vbExclamation: GoTo NextStep
            swapRow = CLng(items(n + 1)(0))
        End If

        SwapMetaRows wsLeg, targetRow, swapRow
        UpdateFloatingPanelPosition wsAd
NextStep:
    Loop
    Application.StatusBar = kindKor & " 범례 순서 정렬 완료."
End Sub

' 두 메타 row 의 모든 컬럼 값을 swap.
Public Sub SwapMetaRows(ws As Worksheet, r1 As Long, r2 As Long)
    If r1 = r2 Then Exit Sub
    Dim ncols As Long: ncols = ws.Cells(1, ws.Columns.Count).End(xlToLeft).Column
    Dim c As Long, tmp As Variant
    For c = 1 To ncols
        tmp = ws.Cells(r1, c).Value
        ws.Cells(r1, c).Value = ws.Cells(r2, c).Value
        ws.Cells(r2, c).Value = tmp
    Next c
End Sub

' 행정도·네트웍구성도를 매크로 없는 새 통합문서로 복사 (제출·공유용).
'   - 새 파일의 행정도에서 범례·버튼·모드표시 도형을 모두 제거 (깨끗한 도면).
'   - 모든 도형의 OnAction(매크로 연결) 제거 → 새 파일에서 클릭해도 매크로 안 찾음.
'   - 새 파일은 보호 해제 상태. 사용자가 .xlsx 로 저장.
Public Sub 새파일_내보내기()
    Dim ans As VbMsgBoxResult
    ans = MsgBox("행정도·네트웍구성도를 매크로 없는 새 파일로 복사합니다." & vbLf & _
                 "(새 파일의 행정도에서 범례·버튼은 모두 제거됩니다)" & vbLf & vbLf & _
                 "계속할까요?", vbOKCancel + vbQuestion, "새 파일로 내보내기")
    If ans <> vbOK Then Exit Sub

    Application.ScreenUpdating = False

    Dim okCopy As Boolean: okCopy = False
    On Error Resume Next
    ThisWorkbook.Worksheets(Array(SHEET_ADMIN, SHEET_NETWORK)).Copy   ' 인수 없는 Copy → 새 워크북
    okCopy = (Err.Number = 0)
    On Error GoTo 0
    If Not okCopy Then
        Application.ScreenUpdating = True
        MsgBox "시트 복사에 실패했습니다. 행정도·네트웍구성도 시트가 있는지 확인하세요.", vbExclamation
        Exit Sub
    End If

    Dim newWb As Workbook: Set newWb = ActiveWorkbook

    ' owner 2026-06-07 (8-52): 내보낸 파일의 시트명에 「(후)」 suffix — 설계본과 시각 구분.
    '   rename 후 SHEET_NETWORK 로 룩업하면 못 찾으므로 객체 참조를 캐시해서 8-51 그룹화에 그대로 사용.
    Dim wsAdminNew As Worksheet: Set wsAdminNew = Nothing
    Dim wsNetworkNew As Worksheet: Set wsNetworkNew = Nothing
    On Error Resume Next
    Set wsAdminNew = newWb.Worksheets(SHEET_ADMIN): If Not wsAdminNew Is Nothing Then wsAdminNew.Name = SHEET_ADMIN & "(후)"
    Set wsNetworkNew = newWb.Worksheets(SHEET_NETWORK): If Not wsNetworkNew Is Nothing Then wsNetworkNew.Name = SHEET_NETWORK & "(후)"
    On Error GoTo 0

    Dim ws As Worksheet, i As Long, nm As String
    For Each ws In newWb.Worksheets
        On Error Resume Next
        ws.Unprotect
        On Error GoTo 0
        ' owner 요구 — 노랑 격자 (cell 배경색) 제거. 사용된 영역만 안전하게 처리.
        On Error Resume Next
        ws.UsedRange.Interior.ColorIndex = xlNone
        On Error GoTo 0
        For i = ws.Shapes.Count To 1 Step -1
            nm = ws.Shapes(i).Name
            If Left(nm, Len(PREFIX_LEG_FAC)) = PREFIX_LEG_FAC _
               Or Left(nm, Len(PREFIX_LEG_CBL)) = PREFIX_LEG_CBL _
               Or Left(nm, Len(PREFIX_LEG_LABEL)) = PREFIX_LEG_LABEL _
               Or Left(nm, Len(PANEL_PREFIX)) = PANEL_PREFIX _
               Or Left(nm, Len(PANEL_LEGEND_DD_LABEL_PREFIX)) = PANEL_LEGEND_DD_LABEL_PREFIX _
               Or Left(nm, Len(PANEL_LEGEND_DD_PREFIX)) = PANEL_LEGEND_DD_PREFIX _
               Or Left(nm, Len(PANEL_LEGEND_OPT_PREFIX)) = PANEL_LEGEND_OPT_PREFIX _
               Or Left(nm, Len(PREFIX_FAC_TAG_DD)) = PREFIX_FAC_TAG_DD _
               Or Left(nm, Len(PREFIX_WP_TMP)) = PREFIX_WP_TMP _
               Or Left(nm, Len(PREFIX_ADMIN_COMBO)) = PREFIX_ADMIN_COMBO _
               Or Left(nm, Len(PREFIX_ADMIN_SEARCH_BTN)) = PREFIX_ADMIN_SEARCH_BTN _
               Or Left(nm, Len(PREFIX_NW_SEARCH_BTN)) = PREFIX_NW_SEARCH_BTN _
               Or nm = "_mode_indicator" Then
                On Error Resume Next
                ws.Shapes(i).Delete                 ' 범례·콤보·검색버튼·모드표시 제거 (owner 2026-06-15: 내보낸 파일에 버튼 안 남게)
                On Error GoTo 0
            Else
                On Error Resume Next
                ws.Shapes(i).OnAction = ""           ' 매크로 연결 제거
                On Error GoTo 0
            End If
        Next i
    Next ws

    ' owner 2026-06-07 (8-51): 네트웍구성도 시설물별 라벨 3 종 (배지·주간야간·시설물명) 그룹화.
    '   내보낸 파일에서 라벨을 한 덩어리로 이동 가능. 시설물 도형 자체·설명선(LEADER) 는 그룹 외 (owner 결정).
    '   8-52 의 시트명 변경 이후라 SHEET_NETWORK 로 룩업 불가 — 위 캐시된 객체 참조 사용.
    Dim groupedCount As Long: groupedCount = 0
    If Not wsNetworkNew Is Nothing Then groupedCount = 네트웍_라벨_그룹화(wsNetworkNew)

    ' owner 2026-06-07 (8-53) → (8-55) → (8-55-revert): Placement 분기 설정은 원본 네트웍구성도에
    '   적용하는 별도 유틸 「네트웍_위치속성_설정」 으로 이동. 내보내기 복제본은 원본의 Placement 를 그대로 상속.

    ' owner 2026-06-07 (8-54): 네트웍구성도 케이블 선로ID 박스 (lbl_cbl_*) 를 맨 앞으로.
    '   PREFIX_LABEL "lbl_" 은 시설물명(lbl_fac_*)·케이블ID(lbl_cbl_*) 공유. "lbl_cbl_" prefix 로 정확 필터링.
    '   배경 지도·케이블 선 위에 항상 노출되도록.
    Dim zCount As Long: zCount = 0
    If Not wsNetworkNew Is Nothing Then
        Const LBL_CBL_PREFIX As String = "lbl_cbl_"
        Dim zShp As Shape
        For Each zShp In wsNetworkNew.Shapes
            If Left(zShp.Name, Len(LBL_CBL_PREFIX)) = LBL_CBL_PREFIX Then
                On Error Resume Next
                zShp.ZOrder msoBringToFront
                If Err.Number = 0 Then zCount = zCount + 1
                Err.Clear
                On Error GoTo 0
            End If
        Next zShp
    End If

    Application.ScreenUpdating = True
    On Error Resume Next
    newWb.Activate
    On Error GoTo 0

    MsgBox "매크로 없는 새 통합문서로 복사 완료." & vbLf & _
           "행정도의 범례·버튼·모드표시는 모두 제거되었습니다." & vbLf & _
           "네트웍구성도 시설물 " & groupedCount & " 개의 라벨이 그룹화되었습니다." & vbLf & _
           "네트웍구성도 케이블 선로ID " & zCount & " 개를 맨 앞으로 설정했습니다." & vbLf & vbLf & _
           "이 새 창에서 「다른 이름으로 저장」 → 「Excel 통합 문서(*.xlsx)」 로 저장하세요.", _
           vbInformation, "새 파일로 내보내기"
End Sub

' owner 2026-06-07 (8-55): 원본 네트웍구성도 도형 Placement 분기 + 케이블 선로ID 맨 앞.
'   - 케이블 (cbl_*) → xlMoveAndSize (위치와 크기 변함)
'   - 나머지 도형 → xlMove (위치만 변함)
'   - 케이블 선로ID (lbl_cbl_*) → ZOrder msoBringToFront
'   ThisWorkbook 의 SHEET_NETWORK 에 직접 적용. 내보내기 복제본은 자동 상속.
'   ★ SelectionChange 가 「네트웍_부속도형_정렬」 호출 시 Placement·ZOrder 가 원복되는 문제 (owner 보고)
'     해결을 위해 silent helper 를 같은 SelectionChange 흐름 안에서 매번 재적용.
Public Sub 네트웍_위치속성_설정()
    Dim ws As Worksheet: Set ws = Nothing
    On Error Resume Next: Set ws = ThisWorkbook.Worksheets(SHEET_NETWORK): On Error GoTo 0
    If ws Is Nothing Then
        MsgBox "네트웍구성도 시트를 찾을 수 없습니다.", vbExclamation, "위치 속성 설정"
        Exit Sub
    End If

    ' owner 2026-06-07 (8-56): mode = "split" 저장 → SelectionChange 가 매 클릭마다 재적용.
    네트웍_위치속성_모드_저장 "split"

    Dim wasProt As Boolean: wasProt = ws.ProtectContents Or ws.ProtectDrawingObjects
    On Error Resume Next: ws.Unprotect: On Error GoTo 0

    Dim cableCount As Long, otherCount As Long, zCount As Long
    네트웍_위치속성_적용_silent ws, cableCount, otherCount, zCount

    If wasProt Then ApplySheetProtection ws

    MsgBox "네트웍구성도 도형 속성 설정 완료." & vbLf & vbLf & _
           "  • 케이블 " & cableCount & " 개 → 「위치와 크기 변함」" & vbLf & _
           "  • 나머지 " & otherCount & " 개 → 「위치만 변함」" & vbLf & _
           "  • 케이블 선로ID " & zCount & " 개 → 맨 앞" & vbLf & vbLf & _
           "셀 클릭 후에도 자동 유지됩니다.", _
           vbInformation, "위치 속성 설정"
End Sub

' owner 2026-06-07 (8-55-fix): silent helper — MsgBox·protection 없이 Placement + ZOrder 적용.
'   SelectionChange 에서 매번 호출. 외부 호출자 (위 button) 는 unprotect/MsgBox 만 wrap.
Public Sub 네트웍_위치속성_적용_silent(ws As Worksheet, _
                                       Optional ByRef cableCount As Long, _
                                       Optional ByRef otherCount As Long, _
                                       Optional ByRef zCount As Long)
    If ws Is Nothing Then Exit Sub
    cableCount = 0: otherCount = 0: zCount = 0
    Const LBL_CBL_PREFIX As String = "lbl_cbl_"
    Dim shp As Shape
    Dim isCable As Boolean, isLblCbl As Boolean
    For Each shp In ws.Shapes
        isCable = (Left(shp.Name, Len(PREFIX_CBL)) = PREFIX_CBL)
        isLblCbl = (Left(shp.Name, Len(LBL_CBL_PREFIX)) = LBL_CBL_PREFIX)
        On Error Resume Next
        If isCable Then
            shp.Placement = xlMoveAndSize
            If Err.Number = 0 Then cableCount = cableCount + 1
        Else
            shp.Placement = xlMove
            If Err.Number = 0 Then otherCount = otherCount + 1
        End If
        Err.Clear
        If isLblCbl Then
            shp.ZOrder msoBringToFront
            If Err.Number = 0 Then zCount = zCount + 1
        End If
        Err.Clear
        On Error GoTo 0
    Next shp
End Sub

' owner 2026-06-07 (8-57): 선로ID (lbl_cbl_*) ZOrder 만 따로 — Placement 와 분리.
'   이전 8-55-fix 는 mode = "split" 일 때만 ZOrder 가 적용되어, 「위치 속성 설정」 버튼을
'   안 눌렀거나 「초기화」 누른 상태에서는 선로ID 가 다시 맨뒤로 가는 문제 (owner 보고).
'   ZOrder(맨앞) 는 Placement 분기 (위치만 / 위치+크기) 와 무관하게 항상 적용해야 함.
Public Sub 네트웍_선로ID_맨앞_silent(ws As Worksheet)
    If ws Is Nothing Then Exit Sub
    Const LBL_CBL_PREFIX As String = "lbl_cbl_"
    Dim shp As Shape
    For Each shp In ws.Shapes
        If Left(shp.Name, Len(LBL_CBL_PREFIX)) = LBL_CBL_PREFIX Then
            On Error Resume Next: shp.ZOrder msoBringToFront: On Error GoTo 0
        End If
    Next shp
End Sub

' owner 2026-06-07 (8-56): 위치 속성을 원래대로 (전 도형 Placement = 3 xlFreeFloating).
'   설정/초기화 두 mode 는 CustomDocumentProperty 「network_placement_mode」 ("split" / "free") 로 추적.
'   SelectionChange hook 이 이 값을 읽어 자동 재적용 여부 결정.
Public Sub 네트웍_위치속성_초기화()
    Dim ws As Worksheet: Set ws = Nothing
    On Error Resume Next: Set ws = ThisWorkbook.Worksheets(SHEET_NETWORK): On Error GoTo 0
    If ws Is Nothing Then
        MsgBox "네트웍구성도 시트를 찾을 수 없습니다.", vbExclamation, "위치 속성 해제"
        Exit Sub
    End If

    네트웍_위치속성_모드_저장 "free"

    Dim wasProt As Boolean: wasProt = ws.ProtectContents Or ws.ProtectDrawingObjects
    On Error Resume Next: ws.Unprotect: On Error GoTo 0

    Dim cnt As Long
    네트웍_위치속성_초기화_silent ws, cnt

    If wasProt Then ApplySheetProtection ws

    MsgBox "네트웍구성도 모든 도형의 위치 속성을 원래대로 (변하지 않음) 설정했습니다." & vbLf & vbLf & _
           "  • 처리 도형 " & cnt & " 개" & vbLf & vbLf & _
           "셀 클릭 후 자동 분기 (8-55) 도 해제됐습니다.", _
           vbInformation, "위치 속성 해제"
End Sub

Public Sub 네트웍_위치속성_초기화_silent(ws As Worksheet, Optional ByRef cnt As Long)
    If ws Is Nothing Then Exit Sub
    cnt = 0
    Dim shp As Shape
    For Each shp In ws.Shapes
        On Error Resume Next
        shp.Placement = xlFreeFloating
        If Err.Number = 0 Then cnt = cnt + 1
        Err.Clear
        On Error GoTo 0
    Next shp
End Sub

' owner 2026-06-07 (8-56): mode 저장·읽기 헬퍼.
'   CustomDocumentProperty 「network_placement_mode」: "split" (cable / non-cable 분기) 또는 "free" (모두 xlFreeFloating).
'   기본 (속성 없음) = "free" — 사용자가 명시 호출하기 전엔 기존 동작 유지.
Public Sub 네트웍_위치속성_모드_저장(mode As String)
    On Error Resume Next
    ThisWorkbook.CustomDocumentProperties("network_placement_mode").Value = mode
    If Err.Number <> 0 Then
        Err.Clear
        ThisWorkbook.CustomDocumentProperties.Add Name:="network_placement_mode", _
            LinkToContent:=False, Type:=msoPropertyTypeString, Value:=mode
    End If
    On Error GoTo 0
End Sub

Public Function 네트웍_위치속성_모드_읽기() As String
    네트웍_위치속성_모드_읽기 = "free"
    On Error Resume Next
    Dim v As String: v = CStr(ThisWorkbook.CustomDocumentProperties("network_placement_mode").Value)
    On Error GoTo 0
    If Len(v) > 0 Then 네트웍_위치속성_모드_읽기 = v
End Function

' owner 2026-06-07 (8-51): 시설물별로 「배지 + 주간야간박스 + 시설물명(PREFIX_LABEL)」 3 종을 그룹화.
'   - 한 시설물에 2 개 이상 라벨이 있어야 그룹 가능 (Group 의 최소 요건). 1 개면 skip.
'   - 시설물 도형 자체·설명선 leader 선은 그룹 외 (owner 결정 — 라벨만 이동 가능하게).
'   - 그룹 이름: "_facgrp_<facId>".
'   - 반환: 성공 그룹 개수.
Public Function 네트웍_라벨_그룹화(ws As Worksheet) As Long
    네트웍_라벨_그룹화 = 0
    If ws Is Nothing Then Exit Function

    ' Pass 1 — 시설물 ID 모음 (그룹화로 컬렉션 변형 영향 회피)
    ' owner 2026-06-07 (8-51 fix): facId 는 도형 이름 「fac_xyz」 그대로가 ID — Mid 로 prefix 자르지 말 것.
    '   배지 = PREFIX_BADGE & facId = "badge_fac_xyz", status = "_fac_status_fac_xyz" 처럼 facId 가 prefix 포함.
    Dim facIds As Collection: Set facIds = New Collection
    Dim shp As Shape
    For Each shp In ws.Shapes
        If Left(shp.Name, Len(PREFIX_FAC)) = PREFIX_FAC Then
            ' "fac_" 만 정확히 매치 — PREFIX_FAC_STATUS·PREFIX_FAC_TAG 는 "_fac_..." 로 시작해서 자동 제외
            facIds.Add shp.Name
        End If
    Next shp

    ' Pass 2 — 시설물마다 라벨 3 종 수집 후 Group
    Dim facId As Variant
    Dim shpTry As Shape
    Dim nameArr() As Variant
    Dim cnt As Long
    Dim grpShp As Shape
    For Each facId In facIds
        ReDim nameArr(2)
        cnt = 0

        Set shpTry = Nothing
        On Error Resume Next: Set shpTry = ws.Shapes(PREFIX_BADGE & CStr(facId)): On Error GoTo 0
        If Not shpTry Is Nothing Then
            nameArr(cnt) = shpTry.Name: cnt = cnt + 1
        End If

        Set shpTry = Nothing
        On Error Resume Next: Set shpTry = ws.Shapes(PREFIX_FAC_STATUS & CStr(facId)): On Error GoTo 0
        If Not shpTry Is Nothing Then
            nameArr(cnt) = shpTry.Name: cnt = cnt + 1
        End If

        Set shpTry = Nothing
        On Error Resume Next: Set shpTry = ws.Shapes(PREFIX_LABEL & CStr(facId)): On Error GoTo 0
        If Not shpTry Is Nothing Then
            nameArr(cnt) = shpTry.Name: cnt = cnt + 1
        End If

        If cnt >= 2 Then
            ReDim Preserve nameArr(cnt - 1)
            Set grpShp = Nothing
            On Error Resume Next
            Set grpShp = ws.Shapes.Range(nameArr).Group
            On Error GoTo 0
            If Not grpShp Is Nothing Then
                On Error Resume Next: grpShp.Name = "_facgrp_" & CStr(facId): On Error GoTo 0
                네트웍_라벨_그룹화 = 네트웍_라벨_그룹화 + 1
            End If
        End If
    Next facId
End Function

Public Sub 레이어_정리_시트(ws As Worksheet)
    ' owner 2026-06-05: 시설물 설명선(LABEL·LEADER)이 시설물 위에 있어 클릭이 막힘 →
    '   설명선을 가장 먼저 호출해 맨 아래(배경 바로 위)로. CBL·FAC 는 그 위.
    BringGroupToFront ws, PREFIX_LABEL      ' 설명선 박스 (배경 바로 위 — 맨 아래)
    BringGroupToFront ws, PREFIX_LEADER     ' 설명선 연결선 (LABEL 위)
    BringGroupToFront ws, PREFIX_CBL        ' 케이블 (설명선 위)
    BringGroupToFront ws, PREFIX_FAC        ' 시설물 (케이블 위 — 클릭 우선)
    BringGroupToFront ws, PREFIX_LEG_FAC    ' 범례(시설물)
    BringGroupToFront ws, PREFIX_LEG_CBL    ' 범례(케이블)
    BringGroupToFront ws, PREFIX_LEG_LABEL  ' 범례 이름 텍스트
    BringGroupToFront ws, PANEL_PREFIX      ' 버튼
    On Error Resume Next
    ws.Shapes("_mode_indicator").ZOrder msoBringToFront
    ws.Shapes(BG_NAME).Placement = 3        ' 배경도 위치 고정 (행/열 삭제 무관)
    ws.Shapes(BG_NAME).ZOrder msoSendToBack ' 배경 Picture 맨 뒤
    On Error GoTo 0
End Sub

' 접두어 그룹 도형을 모두 앞으로 (iteration 중 순서변경 회피 위해 이름 먼저 수집)
Public Sub BringGroupToFront(ws As Worksheet, prefix As String)
    Dim names() As String, n As Long, sh As Shape
    ReDim names(1 To 1000)
    For Each sh In ws.Shapes
        If Left(sh.Name, Len(prefix)) = prefix Then
            n = n + 1
            If n > UBound(names) Then ReDim Preserve names(1 To n + 200)
            names(n) = sh.Name
        End If
    Next sh
    Dim i As Long
    For i = 1 To n
        On Error Resume Next
        ws.Shapes(names(i)).Placement = 3      ' xlFreeFloating — 행/열 삭제 시 위치 고정
        ws.Shapes(names(i)).ZOrder msoBringToFront
        On Error GoTo 0
    Next i
End Sub

' ===== owner 2026-06-08 (8-124-fix4): 양식 등록 도형 전용 OnAction =====
'   owner 요구: 옛 「draw 모드」 (마우스 십자 → 드래그) 그대로 + 그린 자리에 양식 도형 모양 복제.
'   → 옛 「범례_시설물_선택」/「범례_케이블_선택」 와 동일하게 draw 모드 진입.
'   FinalizeDrawnFacility 의 leg 찾기를 admin + 양식 시트 양쪽 검색으로 확장 (8-124-fix4)
'     → 그린 자리에 양식 도형 모양 그대로 배치됨.
Public Sub 범례_양식_시설물_선택()
    If g_legendDeleteMode Then g_legendDeleteMode = False: 범례_삭제모드_적용 False
    If g_legendUnregisterMode Then g_legendUnregisterMode = False: 범례_해제모드_적용 False
    ' owner 2026-06-08 (8-124-fix12): 시설물 일괄 삭제 모드도 강제 OFF — 시설물 클릭 시 삭제 박스 차단
    If g_deleteMode Then 삭제모드_토글

    Dim callerName As String: callerName = Application.Caller
    g_mode = "draw_facility"
    g_legendShape = callerName
    g_legendLabel = MetaLookupLabel(callerName)

    ' 자동으로 행정도 시트로 전환 — 양식 시트에선 그리기 안 됨
    On Error Resume Next
    Dim wsAd As Worksheet: Set wsAd = ThisWorkbook.Worksheets(SHEET_ADMIN)
    If Not wsAd Is Nothing Then
        Dim oEv As Boolean: oEv = Application.EnableEvents
        Application.EnableEvents = False
        wsAd.Activate
        Application.EnableEvents = oEv
    End If
    HighlightSelectedLegend callerName
    UpdateModeIndicator
    On Error GoTo 0

    ' 옛 동작과 동일 — 십자 그리기 모드 진입 + 그린 도형 자동 감지·등록.
    BeginFacilityDraw callerName
End Sub

Public Sub 범례_양식_케이블_선택()
    If g_legendDeleteMode Then g_legendDeleteMode = False: 범례_삭제모드_적용 False
    If g_legendUnregisterMode Then g_legendUnregisterMode = False: 범례_해제모드_적용 False
    ' owner 2026-06-08 (8-124-fix12): 시설물 일괄 삭제 모드도 강제 OFF — 시설물 클릭 시 삭제 박스 차단
    If g_deleteMode Then 삭제모드_토글

    Dim callerName As String: callerName = Application.Caller
    g_mode = "draw_cable"
    g_legendShape = callerName
    g_cableSpec = MetaLookupLabel(callerName)

    On Error Resume Next
    Dim wsAd2 As Worksheet: Set wsAd2 = ThisWorkbook.Worksheets(SHEET_ADMIN)
    If Not wsAd2 Is Nothing Then
        Dim oEv2 As Boolean: oEv2 = Application.EnableEvents
        Application.EnableEvents = False
        wsAd2.Activate
        Application.EnableEvents = oEv2
    End If
    HighlightSelectedLegend callerName
    UpdateModeIndicator
    On Error GoTo 0

    BeginCableDraw callerName
End Sub

Public Sub 범례_케이블_선택()
    ' 그리기 진입 시 「범례 지우기·해제 모드」 강제 OFF (안전망)
    If g_legendDeleteMode Then g_legendDeleteMode = False: 범례_삭제모드_적용 False
    If g_legendUnregisterMode Then g_legendUnregisterMode = False: 범례_해제모드_적용 False
    Dim callerName As String: callerName = Application.Caller
    g_mode = "draw_cable"
    g_legendShape = callerName
    g_cableSpec = MetaLookupLabel(callerName)
    HighlightSelectedLegend callerName
    UpdateModeIndicator
    ' 시설물과 동일한 네이티브 선 그리기 → 그린 선의 양 끝에 가장 가까운 시설물로 자동 연결
    BeginCableDraw callerName
End Sub

' 네이티브 선 그리기(십자) 모드 진입 + 그린 선 자동 감지 예약 (케이블용)
Public Sub BeginCableDraw(legendName As String)
    Dim ws As Worksheet: Set ws = ThisWorkbook.Worksheets(SHEET_ADMIN)
    Set g_drawBaseline = CreateObject("Scripting.Dictionary")
    Dim sh As Shape
    On Error Resume Next
    For Each sh In ws.Shapes
        g_drawBaseline(sh.Name) = True
    Next sh
    On Error GoTo 0

    g_drawLegendName = legendName
    g_drawPolls = 60

    On Error Resume Next
    ws.Unprotect
    On Error GoTo 0

    Application.StatusBar = "케이블 [" & g_cableSpec & "] — 시작 시설물에서 클릭 시작 → 도로 따라 점 클릭 → 도착 시설물에서 더블클릭으로 끝. ESC=취소."

    On Error Resume Next
    Application.OnTime Now, "StartDrawMode"
    Application.OnTime Now + TimeSerial(0, 0, 1), "DetectDrawnCable"
    Application.OnKey "{ESC}", "그리기_종료"   ' owner 2026-06-10 (8-125-fix26): ESC = 그리기 모드 종료
    On Error GoTo 0
End Sub

' 선택된 범례 도형 강조 — 글로우(Glow)로. 테두리(Line)를 건드리지 않으므로
'   배치 시 복제되는 시설물이 범례의 원래 테두리 색을 그대로 유지함.
'   (예전엔 Line 을 노랑으로 바꿔 복제본까지 노랑 테두리가 되던 문제 해결)
Public Sub HighlightSelectedLegend(legendName As String)
    Dim ws As Worksheet: Set ws = ThisWorkbook.Worksheets(SHEET_ADMIN)
    Dim sh As Shape, isLeg As Boolean
    For Each sh In ws.Shapes
        isLeg = (Left(sh.Name, Len(PREFIX_LEG_FAC)) = PREFIX_LEG_FAC) Or _
                (Left(sh.Name, Len(PREFIX_LEG_CBL)) = PREFIX_LEG_CBL)
        If isLeg Then
            On Error Resume Next
            If sh.Name = legendName Then
                sh.Glow.Color.RGB = RGB(250, 204, 21)   ' 노랑 글로우
                sh.Glow.Transparency = 0
                sh.Glow.Radius = 10
            Else
                sh.Glow.Radius = 0                       ' 글로우 제거
            End If
            On Error GoTo 0
        End If
    Next sh
End Sub

' 화면 상단에 큰 floating 모드 indicator 표시
Public Sub UpdateModeIndicator()
    Dim ws As Worksheet: Set ws = ThisWorkbook.Worksheets(SHEET_ADMIN)
    Dim ind As Shape
    On Error Resume Next
    Set ind = ws.Shapes("_mode_indicator")
    On Error GoTo 0

    If g_mode = "" Then
        If Not ind Is Nothing Then
            On Error Resume Next
            ind.Visible = msoFalse
            On Error GoTo 0
        End If
        Exit Sub
    End If

    Dim wasProt As Boolean
    wasProt = ws.ProtectContents Or ws.ProtectDrawingObjects
    On Error Resume Next
    ws.Unprotect
    On Error GoTo 0

    If ind Is Nothing Then
        Set ind = ws.Shapes.AddShape(msoShapeRoundedRectangle, 0, 0, 520, 32)
        ind.Name = "_mode_indicator"
        ind.Placement = 3 ' xlFreeFloating
        ind.Locked = False
        ind.OnAction = "ResetMode"
    End If

    Dim msg As String, bg As Long
    Select Case g_mode
        Case "place_facility"
            msg = "● 시설물 배치 [" & g_legendLabel & "]  —  빈 셀 클릭으로 배치 · ESC 또는 이 막대 클릭으로 취소"
            bg = RGB(59, 130, 246)
        Case "draw_facility"
            msg = "● 시설물 그리기 [" & g_legendLabel & "]  —  지도에 드래그해서 그리면 자동 등록 · ESC 취소"
            bg = RGB(59, 130, 246)
        Case "draw_cable"
            msg = "● 케이블 그리기 [" & g_cableSpec & "]  —  시작 시설물에서 클릭 → 도로 따라 점 → 도착 시설물에서 더블클릭 · ESC 취소"
            bg = RGB(14, 165, 233)
        Case "place_cable"
            If g_cableFromId = "" Then
                msg = "● 케이블 [" & g_cableSpec & "]  —  시작 시설물 클릭 · ESC 취소"
            Else
                msg = "● 케이블 [" & g_cableSpec & "] (시작 ✓)  —  경로점 좌클릭 · 도착 시설물 클릭으로 완료 · 우클릭=마지막 점 취소"
            End If
            bg = RGB(14, 165, 233)
    End Select

    On Error Resume Next
    ind.Visible = msoTrue
    ind.Fill.ForeColor.RGB = bg
    ind.Line.Visible = msoFalse
    ind.TextFrame2.TextRange.Text = msg
    ind.TextFrame2.TextRange.Font.Fill.ForeColor.RGB = RGB(255, 255, 255)
    ind.TextFrame2.TextRange.Font.Name = CALLOUT_FONT_NAME
    ind.TextFrame2.TextRange.Font.Size = 11
    ind.TextFrame2.TextRange.Font.Bold = True
    ind.TextFrame2.TextRange.ParagraphFormat.Alignment = 2
    ind.TextFrame2.VerticalAnchor = 3
    ind.ZOrder 0 ' msoBringToFront
    On Error GoTo 0

    ' 위치: 버튼 패널 아래 (row 0.5 위치)
    Dim vr As Range
    On Error Resume Next
    Set vr = ActiveWindow.VisibleRange
    On Error GoTo 0
    If Not vr Is Nothing Then
        ind.Left = vr.Left + PANEL_OFFSET
        ind.Top = vr.Top + PANEL_OFFSET + PANEL_BTN_H + 4
    End If

    If wasProt Then ApplySheetProtection ws
End Sub

' ============================================================================
'  3. 도형 클릭 (OnAction)
' ============================================================================
Public Sub 시설물_클릭()
    Dim facId As String: facId = Application.Caller

    If g_mode = "place_cable" Then
        If g_cableFromId = "" Then
            g_cableFromId = facId
            Application.StatusBar = "케이블 [" & g_cableSpec & "] — " & _
                                    "도로 따라 빈 셀을 좌클릭하여 경로점 찍기, 도착 시설물 클릭으로 완료. " & _
                                    "우클릭 = 마지막 경로점 취소, ESC = 전체 취소."
        Else
            If facId = g_cableFromId Then
                MsgBox "시작과 도착이 같은 시설물입니다. 다른 시설물을 클릭하세요.", vbExclamation
                Exit Sub
            End If
            DrawCable g_cableFromId, facId, g_cableSpec, g_cableWaypoints
            ResetMode
        End If
    Else
        Show시설물_정보 facId   ' fac_ + 메타 있으면 cascade, 없으면 고아도형_삭제(안전 단일/그룹)
    End If
End Sub

Public Sub 케이블_클릭()
    Dim cblId As String: cblId = Application.Caller
    Show케이블_정보 cblId
End Sub

' ============================================================================
'  4. 시트 이벤트 핸들러 (ThisWorkbook 에서 호출)
' ============================================================================
' 시트 활성화 — 시트 진입 시 자동 동기화 (셀 클릭 hook 누락 대비 안전망).
'   네트웍 진입 시 케이블박스·배지·콤보·태그가 callout 위치로 강제 재정렬.
'   행정도 진입 시 배지 위치 재정렬.
Public Sub 시트_활성화(Sh As Object)
    Static busy As Boolean
    If busy Then Exit Sub
    busy = True
    On Error GoTo Done

    Dim oEv As Boolean: oEv = Application.EnableEvents
    Application.EnableEvents = False
    If TypeName(Sh) = "Worksheet" Then
        If Sh.Name = SHEET_NETWORK Then
            네트웍_패널_제거 Sh                       ' 옛 ← → 버튼 도형 정리 (리본으로 이전)
            네트웍_케이블_재라우팅 Sh
            네트웍_케이블박스_동기화 Sh
            배지_위치_동기화 Sh
            시설물_태그_위치_동기화 Sh
            선번화살표_재라우팅 Sh                    ' 코어 박스 이동 → 화살표 자동 재부착
        ElseIf Sh.Name = SHEET_ADMIN Then
            UpdateFloatingPanelPosition Sh
            배지_위치_동기화 Sh
            시설물_leader_재라우팅 Sh
            행정도_케이블_시설물_추종 Sh
            행정도_케이블_꼬리_재정렬 Sh
        End If
    End If
    Application.EnableEvents = oEv
Done:
    busy = False
End Sub

' owner 2026-06-09 (8-125-fix15): 기존 시설물 OnAction 일괄 정리 — 재귀적 walk + 진단 메시지.
'   행정도·네트웍 시트의 모든 시설물 (fac_*) 의 OnAction 을 모든 자식까지 재귀로 비움.
'   양식 시트의 legend 는 보존 (legend_fac_* / legend_cbl_* 또는 양식 시트 자체).
'   진단 — 정리 전 OnAction 값을 미리보기로 보여줌 (어디서 OnAction 이 살아있는지 확인).
Public Sub 시설물_OnAction_정리()
    Dim diag As String: diag = ""
    Dim totalCnt As Long: totalCnt = 0
    Dim sheets As Variant: sheets = Array(SHEET_ADMIN, SHEET_NETWORK)
    Dim s As Variant
    For Each s In sheets
        Dim ws As Worksheet: Set ws = Nothing
        On Error Resume Next: Set ws = ThisWorkbook.Worksheets(CStr(s)): On Error GoTo 0
        If ws Is Nothing Then GoTo NextSheet

        Dim wasProt As Boolean: wasProt = ws.ProtectContents Or ws.ProtectDrawingObjects
        On Error Resume Next: ws.Unprotect: On Error GoTo 0

        diag = diag & "── " & ws.Name & " ──" & vbCrLf
        Dim sh As Shape
        For Each sh In ws.Shapes
            ' 양식 legend 는 건드리지 않음
            If Left(sh.Name, Len(PREFIX_LEG_FAC)) = PREFIX_LEG_FAC Then GoTo NextSh
            If Left(sh.Name, Len(PREFIX_LEG_CBL)) = PREFIX_LEG_CBL Then GoTo NextSh
            ' 시스템 도형 건드리지 않음
            If Left(sh.Name, 1) = "_" Then GoTo NextSh

            ' 시설물 (fac_*) 또는 OnAction 이 양식 legend 핸들러인 도형 = 정리 대상
            Dim isFac As Boolean: isFac = (Left(sh.Name, Len(PREFIX_FAC)) = PREFIX_FAC)
            Dim curAct As String: curAct = ""
            On Error Resume Next: curAct = sh.OnAction: On Error GoTo 0
            Dim hasLegAct As Boolean
            hasLegAct = (InStr(curAct, "범례_양식_") > 0) Or _
                        (InStr(curAct, "범례_시설물_선택") > 0) Or _
                        (InStr(curAct, "범례_케이블_선택") > 0)

            If isFac Or hasLegAct Then
                ' 진단: 정리 전 OnAction 값 기록
                If Len(curAct) > 0 Then
                    diag = diag & "  · " & sh.Name & " OnAction=" & curAct & vbCrLf
                End If
                ' 재귀 클리어
                ClearShapeOnActionRecursive sh, diag
                totalCnt = totalCnt + 1
            End If
NextSh:
        Next sh

        If wasProt Then ApplySheetProtection ws
NextSheet:
    Next s

    Dim msg As String
    msg = "OnAction 정리 완료: " & totalCnt & " 개" & vbCrLf & vbCrLf
    msg = msg & "진단 (정리 전 OnAction 값):" & vbCrLf & diag
    MsgBox msg, vbInformation, "OnAction 정리"
End Sub

' 도형 + 모든 자식 (Group 안 Group 까지 재귀) OnAction 비움.
Public Sub ClearShapeOnActionRecursive(sh As Shape, ByRef diag As String)
    On Error Resume Next
    sh.OnAction = ""
    ' owner 2026-06-09 (8-125-fix15): Hyperlink 도 제거 — sheet 전환 메커니즘일 수 있음
    sh.Hyperlink.Delete
    Dim shTy As Long: shTy = 0
    shTy = sh.Type
    On Error GoTo 0
    If shTy = msoGroup Then
        Dim gi As Long
        For gi = 1 To sh.GroupItems.Count
            Dim child As Shape: Set child = Nothing
            On Error Resume Next: Set child = sh.GroupItems(gi): On Error GoTo 0
            If Not child Is Nothing Then
                Dim chAct As String: chAct = ""
                On Error Resume Next: chAct = child.OnAction: On Error GoTo 0
                If Len(chAct) > 0 Then
                    diag = diag & "    └ 자식 " & child.Name & " OnAction=" & chAct & vbCrLf
                End If
                ' 자식의 Hyperlink 도 확인
                Dim hlAddr As String: hlAddr = ""
                On Error Resume Next: hlAddr = child.Hyperlink.SubAddress: On Error GoTo 0
                If Len(hlAddr) > 0 Then
                    diag = diag & "    └ 자식 " & child.Name & " Hyperlink=" & hlAddr & vbCrLf
                End If
                On Error Resume Next: child.Hyperlink.Delete: On Error GoTo 0
                ClearShapeOnActionRecursive child, diag
            End If
        Next gi
    End If
End Sub

' owner 2026-06-09 (8-125-fix20): 시설물 동기화 진단 — 배지·설명선 안 따라오는 도형 식별.
'   각 시설물의 이름·메타 등록·배지·설명선 존재 여부 dump.
'   정상 시설물: 이름 fac_xxx + 메타 등록 O + badge_fac_xxx 도형 O + lbl_fac_xxx 도형 O
'   비정상: 이름 legend_fac_xxx (rename 실패) OR 메타 없음 OR 배지 없음 OR 설명선 없음
Public Sub 시설물_동기화_진단()
    Dim msg As String: msg = "시설물 동기화 진단" & vbCrLf & vbCrLf
    Dim sheets As Variant: sheets = Array(SHEET_ADMIN, SHEET_NETWORK)
    Dim s As Variant

    ' 메타 등록 list 먼저 수집
    Dim metaSet As Object: Set metaSet = CreateObject("Scripting.Dictionary")
    Dim wsMeta As Worksheet: Set wsMeta = Nothing
    On Error Resume Next: Set wsMeta = ThisWorkbook.Worksheets(SHEET_META_FAC): On Error GoTo 0
    If Not wsMeta Is Nothing Then
        Dim lastR As Long: lastR = wsMeta.Cells(wsMeta.Rows.Count, 1).End(xlUp).Row
        Dim r As Long
        For r = 2 To lastR
            Dim mid_ As String: mid_ = CStr(wsMeta.Cells(r, 1).Value)
            If Len(mid_) > 0 Then metaSet(mid_) = True
        Next r
    End If

    For Each s In sheets
        Dim ws As Worksheet: Set ws = Nothing
        On Error Resume Next: Set ws = ThisWorkbook.Worksheets(CStr(s)): On Error GoTo 0
        If ws Is Nothing Then GoTo NextSheet

        msg = msg & "── " & ws.Name & " ──" & vbCrLf
        Dim cnt As Long: cnt = 0
        Dim sh As Shape
        For Each sh In ws.Shapes
            Dim n As String: n = sh.Name
            Dim isFac As Boolean: isFac = (Left(n, Len(PREFIX_FAC)) = PREFIX_FAC)
            Dim isLegFac As Boolean: isLegFac = (Left(n, Len(PREFIX_LEG_FAC)) = PREFIX_LEG_FAC)
            If isFac Or isLegFac Then
                cnt = cnt + 1
                Dim hasMeta As Boolean: hasMeta = metaSet.Exists(n)
                Dim hasBadge As Boolean: hasBadge = False
                Dim hasLabel As Boolean: hasLabel = False
                On Error Resume Next
                hasBadge = Not (ws.Shapes(PREFIX_BADGE & n) Is Nothing)
                hasLabel = Not (ws.Shapes(PREFIX_LABEL & n) Is Nothing)
                On Error GoTo 0
                msg = msg & "  · [" & n & "]" & _
                      " 메타=" & IIf(hasMeta, "O", "X") & _
                      " 배지=" & IIf(hasBadge, "O", "X") & _
                      " 설명선=" & IIf(hasLabel, "O", "X") & vbCrLf
            End If
        Next sh
        If cnt = 0 Then msg = msg & "  (시설물 없음)" & vbCrLf
NextSheet:
    Next s

    msg = msg & vbCrLf & "해석:" & vbCrLf
    msg = msg & "  - 모두 'O' = 정상 (이동 시 배지·설명선 따라옴)" & vbCrLf
    msg = msg & "  - 이름이 'legend_fac_' = fix7 rename 실패 (잘못 복제됨)" & vbCrLf
    msg = msg & "  - 메타 X = 메타 미등록 (옛 잔재 가능)" & vbCrLf
    msg = msg & "  - 배지/설명선 X = 부속 도형 누락"

    MsgBox msg, vbInformation, "시설물 동기화 진단"
End Sub

' owner 2026-06-09 (8-125-fix19): 양식 핸들러 매크로만 골라서 강제 클리어.
'   행정도+네트웍의 모든 도형 + group 자식 (재귀, 어느 깊이든) 처리.
'   양식 OnAction (범례_양식_*, 범례_시설물_선택, 범례_케이블_선택) 만 클리어, 다른 OnAction (콤보박스_변경 등) 은 보존.
Public Sub 양식핸들러_강제_클리어()
    Dim totalCnt As Long: totalCnt = 0
    Dim diag As String: diag = ""
    Dim sheets As Variant: sheets = Array(SHEET_ADMIN, SHEET_NETWORK)
    Dim s As Variant
    For Each s In sheets
        Dim ws As Worksheet: Set ws = Nothing
        On Error Resume Next: Set ws = ThisWorkbook.Worksheets(CStr(s)): On Error GoTo 0
        If ws Is Nothing Then GoTo NextSheet

        Dim wasProt As Boolean: wasProt = ws.ProtectContents Or ws.ProtectDrawingObjects
        On Error Resume Next: ws.Unprotect: On Error GoTo 0

        diag = diag & "── " & ws.Name & " ──" & vbCrLf
        Dim sh As Shape
        For Each sh In ws.Shapes
            양식핸들러_재귀_클리어 sh, totalCnt, diag
        Next sh

        If wasProt Then ApplySheetProtection ws
NextSheet:
    Next s

    Dim msg As String
    msg = "양식 핸들러 OnAction " & totalCnt & " 개 클리어 완료" & vbCrLf & vbCrLf
    If totalCnt > 0 Then
        msg = msg & "클리어된 도형 (이전에 범례_양식_*·범례_시설물_선택·범례_케이블_선택 가졌던 것):" & vbCrLf & diag
    Else
        msg = msg & "양식 OnAction 가진 도형이 발견되지 않음 — 이미 모두 클리어된 상태" & vbCrLf & vbCrLf & _
              "그래도 RN 클릭 시 그리기 모드 진입하면 → 도형 우클릭 → 매크로 지정 → 매크로 이름 비우기 → 확인 (수동)"
    End If
    MsgBox msg, vbInformation, "양식 핸들러 클리어"
End Sub

' 도형 + 모든 group 자식 (재귀) — 양식 OnAction 만 클리어, 다른 OnAction 보존.
Public Sub 양식핸들러_재귀_클리어(sh As Shape, ByRef cnt As Long, ByRef diag As String)
    Dim ac As String: ac = ""
    On Error Resume Next: ac = sh.OnAction: On Error GoTo 0
    If InStr(ac, "범례_양식_") > 0 Or InStr(ac, "범례_시설물_선택") > 0 Or InStr(ac, "범례_케이블_선택") > 0 Then
        On Error Resume Next: sh.OnAction = "": On Error GoTo 0
        diag = diag & "  · [" & sh.Name & "] OnAction=「" & ac & "」 → 클리어" & vbCrLf
        cnt = cnt + 1
    End If

    ' Group 자식 재귀
    Dim shTy As Long: shTy = 0
    On Error Resume Next: shTy = sh.Type: On Error GoTo 0
    If shTy = msoGroup Then
        Dim gi As Long
        For gi = 1 To sh.GroupItems.Count
            Dim child As Shape: Set child = Nothing
            On Error Resume Next: Set child = sh.GroupItems(gi): On Error GoTo 0
            If Not child Is Nothing Then
                양식핸들러_재귀_클리어 child, cnt, diag
            End If
        Next gi
    End If
End Sub

' owner 2026-06-09 (8-125-fix18): 행정도 + 네트웍 옛 panel/legend 잔재 일괄 제거.
'   - 양식 시트는 절대 건드리지 않음 (legend_fac_* 가 양식 시트에 정상 존재)
'   - 행정도·네트웍 시트의 legend_fac_*, legend_cbl_*, leglbl_*, _panel_legend_*, _panel_legopt_* 모두 제거
'   - prefix 매칭 + literal 매칭 둘 다 적용 (PANEL_LEGEND_DD_PREFIX 등 상수 값 차이 회피)
Public Sub 옛_panel_legend_제거()
    Dim totalCnt As Long: totalCnt = 0
    Dim sheets As Variant: sheets = Array(SHEET_ADMIN, SHEET_NETWORK)   ' 양식 시트 제외!
    Dim s As Variant
    For Each s In sheets
        Dim ws As Worksheet: Set ws = Nothing
        On Error Resume Next: Set ws = ThisWorkbook.Worksheets(CStr(s)): On Error GoTo 0
        If ws Is Nothing Then GoTo NextSheet

        Dim wasProt As Boolean: wasProt = ws.ProtectContents Or ws.ProtectDrawingObjects
        On Error Resume Next: ws.Unprotect: On Error GoTo 0

        Dim namesToDelete As Collection: Set namesToDelete = New Collection
        Dim sh As Shape
        For Each sh In ws.Shapes
            Dim n As String: n = sh.Name
            Dim isOld As Boolean: isOld = False

            ' Const prefix 매칭
            If Left(n, Len(PREFIX_LEG_FAC)) = PREFIX_LEG_FAC Then isOld = True
            If Left(n, Len(PREFIX_LEG_CBL)) = PREFIX_LEG_CBL Then isOld = True
            If Left(n, Len(PREFIX_LEG_LABEL)) = PREFIX_LEG_LABEL Then isOld = True
            If Left(n, Len(PANEL_LEGEND_OPT_PREFIX)) = PANEL_LEGEND_OPT_PREFIX Then isOld = True
            If Left(n, Len(PANEL_LEGEND_DD_PREFIX)) = PANEL_LEGEND_DD_PREFIX Then isOld = True
            If Left(n, Len(PANEL_LEGEND_DD_LABEL_PREFIX)) = PANEL_LEGEND_DD_LABEL_PREFIX Then isOld = True

            ' literal prefix 보강 — 상수 값 차이로 위 매칭이 빗나갈 경우 대비
            If InStr(n, "_panel_legend_dd_") = 1 Then isOld = True
            If InStr(n, "_panel_legopt_") = 1 Then isOld = True
            If InStr(n, "_panel_legend_") = 1 Then isOld = True

            If isOld Then namesToDelete.Add n
        Next sh

        Dim i As Long
        For i = 1 To namesToDelete.Count
            On Error Resume Next
            ws.Shapes(namesToDelete(i)).Delete
            On Error GoTo 0
        Next i
        totalCnt = totalCnt + namesToDelete.Count

        If wasProt Then ApplySheetProtection ws
NextSheet:
    Next s

    MsgBox "옛 panel/legend 잔재 " & totalCnt & " 개 제거 완료 (행정도+네트웍)" & vbCrLf & _
           "양식 시트의 legend 는 그대로 보존됐습니다." & vbCrLf & _
           "이제 시설물 클릭 시 정상 선택·이동 가능합니다.", vbInformation, "옛 panel 제거"
End Sub

' owner 2026-06-09 (8-125-fix16): 네트웍의 모든 OnAction 있는 도형 dump — 숨어있는 form legend 잔재 찾기
Public Sub 도형_OnAction_전체_dump()
    Dim msg As String: msg = ""
    Dim sheets As Variant: sheets = Array(SHEET_ADMIN, SHEET_NETWORK, SHEET_LEGEND_FORM)
    Dim s As Variant
    For Each s In sheets
        Dim ws As Worksheet: Set ws = Nothing
        On Error Resume Next: Set ws = ThisWorkbook.Worksheets(CStr(s)): On Error GoTo 0
        If ws Is Nothing Then GoTo NextSheet

        msg = msg & "── " & ws.Name & " ──" & vbCrLf
        Dim sh As Shape
        For Each sh In ws.Shapes
            Dim ac As String: ac = ""
            On Error Resume Next: ac = sh.OnAction: On Error GoTo 0
            ' OnAction 있는 도형만 표시
            If Len(ac) > 0 Then
                msg = msg & "  · " & sh.Name & " Type=" & sh.Type & " OnAction=「" & ac & "」" & vbCrLf
            End If
        Next sh
        msg = msg & vbCrLf
NextSheet:
    Next s

    If Len(msg) = 0 Then msg = "OnAction 설정된 도형 없음"
    MsgBox msg, vbInformation, "OnAction 전체 dump"
End Sub

' owner 2026-06-10 (8-125-fix24-진단): 시설물 OnAction 정밀 진단 — "마지막만 정상" 원인 확정용.
'   양 시트의 fac_* + legend_fac_* 도형마다: 이름·Type(그룹 6/단일)·부모 OnAction·자식 OnAction(2레벨).
'   import 후 새로 그린 6개 중 5개에 OnAction 남으면 그 위치(부모/자식·이름)가 진짜 근본 원인.
Public Sub 시설물_OnAction_정밀진단()
    Dim sheets As Variant: sheets = Array(SHEET_ADMIN, SHEET_NETWORK)
    Dim s As Variant
    Dim msg As String: msg = ""
    For Each s In sheets
        Dim ws As Worksheet: Set ws = Nothing
        On Error Resume Next: Set ws = ThisWorkbook.Worksheets(CStr(s)): On Error GoTo 0
        If ws Is Nothing Then GoTo NextSheet

        msg = msg & "── " & ws.Name & " ──" & vbCrLf
        Dim sh As Shape
        For Each sh In ws.Shapes
            Dim nm As String: nm = sh.Name
            Dim isFac As Boolean: isFac = False
            If Left(nm, Len(PREFIX_FAC)) = PREFIX_FAC Then isFac = True
            If Left(nm, Len(PREFIX_LEG_FAC)) = PREFIX_LEG_FAC Then isFac = True
            If Not isFac Then GoTo NextShape

            Dim ac As String: ac = ""
            On Error Resume Next: ac = sh.OnAction: On Error GoTo 0
            Dim ty As Long: ty = 0
            On Error Resume Next: ty = sh.Type: On Error GoTo 0
            msg = msg & "· [" & nm & "] Type=" & ty & " 부모OnAction=「" & ac & "」" & vbCrLf

            ' 자식 OnAction (그룹이면 2레벨)
            If ty = msoGroup Then
                Dim gi As Long
                On Error Resume Next
                For gi = 1 To sh.GroupItems.Count
                    Dim ch As Shape: Set ch = sh.GroupItems(gi)
                    If Not ch Is Nothing Then
                        Dim cac As String: cac = ch.OnAction
                        If Len(cac) > 0 Then msg = msg & "    └ 자식" & gi & " [" & ch.Name & "] 「" & cac & "」" & vbCrLf
                        ' 손자 (중첩 그룹)
                        If ch.Type = msoGroup Then
                            Dim gj As Long
                            For gj = 1 To ch.GroupItems.Count
                                Dim gc As Shape: Set gc = ch.GroupItems(gj)
                                If Not gc Is Nothing Then
                                    Dim gac As String: gac = gc.OnAction
                                    If Len(gac) > 0 Then msg = msg & "        └ 손자" & gj & " 「" & gac & "」" & vbCrLf
                                End If
                            Next gj
                        End If
                    End If
                Next gi
                On Error GoTo 0
            End If
NextShape:
        Next sh
        msg = msg & vbCrLf
NextSheet:
    Next s

    If Len(msg) = 0 Then msg = "fac_/legend_fac_ 시설물 없음"
    MsgBox msg, vbInformation, "시설물 OnAction 정밀진단"
End Sub

' owner 2026-06-09 (8-125-fix15-진단): 네트웍 시설물 진단 — 클릭 시 sheet 전환 원인 찾기
'   각 시설물의 OnAction·Hyperlink·Macro 모두 dump.
Public Sub 시설물_진단_네트웍()
    Dim ws As Worksheet
    On Error Resume Next: Set ws = ThisWorkbook.Worksheets(SHEET_NETWORK): On Error GoTo 0
    If ws Is Nothing Then
        MsgBox "네트웍구성도 시트가 없습니다.", vbExclamation: Exit Sub
    End If

    Dim msg As String: msg = "네트웍구성도 시설물 진단:" & vbCrLf & vbCrLf
    Dim cnt As Long: cnt = 0
    Dim sh As Shape
    For Each sh In ws.Shapes
        If Left(sh.Name, Len(PREFIX_FAC)) = PREFIX_FAC Then
            cnt = cnt + 1
            msg = msg & cnt & ". [" & sh.Name & "] Type=" & sh.Type
            Dim acT As String: acT = ""
            On Error Resume Next: acT = sh.OnAction: On Error GoTo 0
            msg = msg & " · OnAction=「" & acT & "」"
            Dim hlA As String: hlA = ""
            On Error Resume Next: hlA = sh.Hyperlink.SubAddress: On Error GoTo 0
            If Len(hlA) > 0 Then msg = msg & " · Hyperlink=「" & hlA & "」"
            Dim hlEm As String: hlEm = ""
            On Error Resume Next: hlEm = sh.Hyperlink.EmailSubject: On Error GoTo 0
            msg = msg & vbCrLf

            ' Group 자식 dump
            If sh.Type = msoGroup Then
                Dim gi As Long
                For gi = 1 To sh.GroupItems.Count
                    Dim ch As Shape: Set ch = Nothing
                    On Error Resume Next: Set ch = sh.GroupItems(gi): On Error GoTo 0
                    If Not ch Is Nothing Then
                        Dim cAcT As String: cAcT = ""
                        On Error Resume Next: cAcT = ch.OnAction: On Error GoTo 0
                        Dim cHl As String: cHl = ""
                        On Error Resume Next: cHl = ch.Hyperlink.SubAddress: On Error GoTo 0
                        msg = msg & "    └ 자식 " & gi & " [" & ch.Name & "] OnAction=「" & cAcT & "」 Hyperlink=「" & cHl & "」" & vbCrLf
                    End If
                Next gi
            End If
        End If
    Next sh
    msg = msg & vbCrLf & "총 " & cnt & " 개 시설물"
    MsgBox msg, vbInformation, "네트웍 시설물 진단"
End Sub

' owner 2026-06-09 (8-125-fix12): 디버그 — 시설물 이동 후 cable follow 직접 호출 시험.
'   Alt+F8 → 「케이블_추종_디버그」 실행 → 어느 단계에서 실패하는지 메시지로 확인.
Public Sub 케이블_추종_디버그()
    Dim msg As String
    msg = "1. 행정도 활성 시트: " & ActiveSheet.Name & vbCrLf
    msg = msg & "2. _케이블 시트 존재? "
    Dim wsMeta As Worksheet: Set wsMeta = Nothing
    On Error Resume Next: Set wsMeta = ThisWorkbook.Worksheets(SHEET_META_CBL): On Error GoTo 0
    If wsMeta Is Nothing Then
        msg = msg & "NO — 케이블 메타 없음" & vbCrLf
    Else
        Dim lastR As Long: lastR = wsMeta.Cells(wsMeta.Rows.Count, 1).End(xlUp).Row
        msg = msg & "YES, 케이블 등록 수: " & (lastR - 1) & vbCrLf
    End If

    msg = msg & "3. 행정도 시트의 케이블 도형 수: "
    Dim wsAd As Worksheet: Set wsAd = ThisWorkbook.Worksheets(SHEET_ADMIN)
    Dim cnt As Long: cnt = 0
    Dim sh As Shape
    For Each sh In wsAd.Shapes
        If Left(sh.Name, Len(PREFIX_CBL)) = PREFIX_CBL Then cnt = cnt + 1
    Next sh
    msg = msg & cnt & vbCrLf

    msg = msg & "4. 행정도 시설물 도형 수: "
    cnt = 0
    For Each sh In wsAd.Shapes
        If Left(sh.Name, Len(PREFIX_FAC)) = PREFIX_FAC Then cnt = cnt + 1
    Next sh
    msg = msg & cnt & vbCrLf

    msg = msg & "5. 행정도_케이블_시설물_추종 직접 호출…"
    On Error Resume Next
    행정도_케이블_시설물_추종 wsAd
    If Err.Number <> 0 Then
        msg = msg & " ✕ 오류 " & Err.Number & ": " & Err.Description & vbCrLf
        Err.Clear
    Else
        msg = msg & " OK" & vbCrLf
    End If
    On Error GoTo 0

    msg = msg & "6. 행정도_케이블_꼬리_재정렬 직접 호출…"
    On Error Resume Next
    행정도_케이블_꼬리_재정렬 wsAd
    If Err.Number <> 0 Then
        msg = msg & " ✕ 오류 " & Err.Number & ": " & Err.Description & vbCrLf
        Err.Clear
    Else
        msg = msg & " OK" & vbCrLf
    End If
    On Error GoTo 0

    msg = msg & vbCrLf & "결과:" & vbCrLf
    msg = msg & "  - 5·6 OK 이면 → 시트_셀_클릭 이벤트 라우팅 문제 (이벤트_재주입 필요)" & vbCrLf
    msg = msg & "  - 5·6 OK 인데 시각적으로 안 따라오면 → 캐시 새로고침 필요" & vbCrLf
    msg = msg & "  - 오류 있으면 → 그 모듈의 코드 손상"

    MsgBox msg, vbInformation, "케이블 추종 진단"
End Sub

Public Sub 시트_셀_클릭(Target As Range)
    ' Reentry guard — 핸들러가 자기 자신을 재진입하지 못하게
    Static busy As Boolean
    If busy Then Exit Sub
    busy = True
    On Error GoTo Done

    ' 진단용 — 핸들러 도달 확인 (상태바 표시 — 가장 가벼운 작업)
    Application.StatusBar = "셀 클릭 [" & Target.Worksheet.Name & "!" & Target.Address & _
                            "] 모드=" & IIf(g_mode = "", "(없음)", g_mode) & _
                            " · 범례=" & IIf(g_legendLabel = "", "(없음)", g_legendLabel)

    ' 버튼·범례가 항상 현재 화면 좌상단을 따라오도록 재배치 (모드 무관, 행정도 시트만).
    '   엑셀에 순수 스크롤 이벤트가 없어 「셀 클릭」 마다 현재 보이는 영역 기준으로 위치 갱신.
    If Target.Worksheet.Name = SHEET_ADMIN Then
        Dim oEvP As Boolean: oEvP = Application.EnableEvents
        Application.EnableEvents = False
        UpdateFloatingPanelPosition Target.Worksheet
        행정도_콤보_위치갱신 Target.Worksheet     ' owner 2026-06-10: Step C 콤보·검색버튼 가로 스크롤 추종
        배지_위치_동기화 Target.Worksheet
        행정도_시설물_callout_추종 Target.Worksheet     ' owner 2026-06-10: 설명박스를 시설물 테두리에 붙여 따라오게 (callout 박스 이동 먼저)
        시설물_leader_재라우팅 Target.Worksheet         ' 시설물 이동 시 callout 연결선 자동 재배치 (callout 새 위치 기준)
        행정도_케이블_시설물_추종 Target.Worksheet     ' 시설물 이동 시 케이블 양 끝점도 따라가게
        행정도_케이블_꼬리_재정렬 Target.Worksheet     ' 케이블 옮겨도 말풍선 꼬리가 케이블 중앙을
        ' owner 2026-06-08 (8-79 → 8-93): 행정도 빈셀 클릭 → 네트웍구성도와 텍스트 자동 동기화.
        '   사용자가 lbl_fac_* / lbl_cbl_* / badge_* 박스를 더블클릭해 편집 (엑셀 네이티브)
        '   한 뒤 빈셀 클릭만 하면 네트웍구성도가 자동으로 따라잡음 (변경 없으면 no-op).
        '   8-93: sourceSheet = SHEET_ADMIN 명시 (양방향 동기화 — 네트웍 분기는 따로).
        Dim isEmptyAd As Boolean
        isEmptyAd = (Len(CStr(Target.Cells(1, 1).Value2)) = 0)
        If isEmptyAd Then 정보_적용_silent SHEET_ADMIN
        Application.EnableEvents = oEvP
    End If

    ' owner 2026-06-08 (8-79): 검색 강조 해제 — 양 시트 빈셀 클릭 시.
    '   검색 후 강조된 도형의 원본 스타일을 복원. 강조가 없으면 no-op.
    If Target.Worksheet.Name = SHEET_ADMIN Or Target.Worksheet.Name = SHEET_NETWORK Then
        Dim isEmptySrch As Boolean
        isEmptySrch = (Len(CStr(Target.Cells(1, 1).Value2)) = 0)
        If isEmptySrch Then
            On Error Resume Next: 검색_강조_해제: On Error GoTo 0
        End If
    End If

    ' 네트웍구성도 — 셀 클릭마다 케이블 텍스트박스를 케이블 중앙으로 동기화.
    '   엑셀에 도형 이동 이벤트가 없어, 사용자가 시설물·케이블 드래그 후 다른 셀을 클릭하는
    '   시점에 박스 위치를 따라잡는다. 박스가 오래 어긋나 있지 않게 보장.
    '   배지도 같은 이유로 시설물 우상단 위치 재정렬.
    If Target.Worksheet.Name = SHEET_NETWORK Then
        Dim oEvN As Boolean: oEvN = Application.EnableEvents
        Application.EnableEvents = False
        네트웍_검색버튼_위치갱신 Target.Worksheet     ' owner 2026-06-10: 네트웍 검색버튼 가로·세로 스크롤 추종
        ' 일괄 동기화 — 케이블 재라우팅·박스·배지·콤보·태그
        네트웍_부속도형_정렬
        ' owner 2026-06-06 (8-28): 박스가 케이블 길이 범위 벗어나면 lastPos 로 복귀 — Cable_Chain_평행이동_처리 보다 먼저.
        '   유효한 드래그만 평행 이동에 반영.
        Cable_Range_Validation Target.Worksheet
        ' owner 2026-06-06 (8-23): cable-cable chain 평행 이동 — 박스정렬_silent 보다 먼저.
        '   같은 (fac, cbl) chain 의 박스 중 하나 옮기면 → 다른 박스도 같은 (dx, dy) 만큼 이동 → 순서·간격 유지.
        '   도구 상태와 무관 (g_pt 전역 사용 X) — 도구 닫힌 평상시에도 작동.
        Cable_Chain_평행이동_처리 Target.Worksheet
        ' owner 2026-06-05: 선번박스를 드래그한 후 빈 셀 클릭 시 cascade stack 과 main arrow 자동 재정렬.
        '   Step 2 + 케이블 페어 선택된 상태에서만 의미. silent=True 라 박스 0개여도 조용히 종료.
        '   2026-06-06 (8-23): 이 함수가 박스 옮긴 후 AltSetLastPos 도 같이 호출 — chain 평행 이동 처리와 lastPos 동기.
        If g_pt_step = 2 And Len(g_pt_cbl1Name) > 0 And Len(g_pt_cbl2Name) > 0 Then
            선번연결_도구_박스정렬_silent True
        End If
        ' owner 2026-06-06: 모든 선번박스 여백 0.1 일괄 적용 (silent — 신규/기존 모두 균일하게).
        선번박스_여백_0_1_일괄 True
        ' owner 2026-06-06 v3: 시설물 페어 화살표 (cable-facility, RN 포함) 자동 재정렬.
        '   사용자가 선번박스 위치 이동 후 빈셀 클릭 시 새 spec (케이블 기울기 70~110° = 가로 면 / 그 외 = 세로 면) 으로 재배치.
        '   cable-cable (접속함체) 은 미해당 — 위 박스정렬_silent 가 처리.
        페어화살표_시설물페어_재정렬 Target.Worksheet
        ' owner 2026-06-07 (8-57): 선로ID (lbl_cbl_*) 는 mode 무관하게 항상 맨앞.
        '   8-55-fix 는 mode = "split" 일 때만 ZOrder 가 적용돼 선로ID 가 다시 맨뒤로 가는
        '   문제 (owner 보고). ZOrder 와 Placement 는 별개의 관심사라 분리.
        '   배지 최상위유지 (다음 라인) 보다 먼저 호출 → 트레이스 배지가 lbl_cbl_* 위에 남도록.
        네트웍_선로ID_맨앞_silent Target.Worksheet
        ' Placement 분기는 「위치 속성 설정」 버튼 누른 경우만 (mode = "split")
        If 네트웍_위치속성_모드_읽기() = "split" Then
            네트웍_위치속성_적용_silent Target.Worksheet
        End If
        ' owner 2026-06-07 (8-40): 코어 추적 배지를 항상 최상위로 — 위 재정렬 함수가 박스 z-order 변경 후 배지가 가려지는 것 차단.
        코어_추적_배지_최상위유지 Target.Worksheet
        ' owner 2026-06-08 (8-93): 네트웍구성도 빈셀 클릭 → 행정도와 텍스트 자동 동기화 (양방향).
        '   사용자가 네트웍 lbl 박스를 더블클릭해 편집한 뒤 빈셀 클릭 → 행정도 자동 따라잡음.
        '   sourceSheet = SHEET_NETWORK 명시 → 네트웍 값 우선, 행정도가 덮어쓰지 않음.
        Dim isEmptyNw As Boolean
        isEmptyNw = (Len(CStr(Target.Cells(1, 1).Value2)) = 0)
        If isEmptyNw Then 정보_적용_silent SHEET_NETWORK
        Application.EnableEvents = oEvN
    End If

    ' 배지 자동 재정렬 + 배지 없는 시설물의 콤보·상태박스 cleanup
    Dim oEvB As Boolean: oEvB = Application.EnableEvents
    Application.EnableEvents = False
    배지없는_시설물_부속정리      ' 배지 삭제 → 콤보·상태박스도 동시 제거
    배지_재정렬                    ' 남은 배지 번호 1부터 재정렬
    Application.EnableEvents = oEvB

    ' 모드 없으면 여기서 종료 (배치/그리기 분기는 아래)
    If g_mode = "" Then GoTo Done
    If Target.Worksheet.Name <> SHEET_ADMIN Then GoTo Done
    If Target.Row <= LEGEND_ROWS Then
        Application.StatusBar = "셀 클릭이 범례 영역(" & LEGEND_ROWS & "행 이하)이라 무시. 그 아래 행 클릭 필요."
        GoTo Done
    End If

    ' 그리기 모드(십자)에서 빈 셀이 선택됨 = ESC 로 십자 취소된 뒤 클릭 → 그리기 종료(안내막대 숨김).
    '   단, 방금 그린 새 도형이 있으면 폴링이 등록하도록 두고 리셋 안 함(드래그/단일클릭 그리기 보호).
    If g_mode = "draw_facility" Or g_mode = "draw_cable" Then
        Dim hasNew As Boolean: hasNew = False
        Dim dshp As Shape
        For Each dshp In Target.Worksheet.Shapes
            If g_mode = "draw_facility" Then
                If IsNewDrawnShape(dshp) Then hasNew = True: Exit For
            Else
                If IsNewDrawnLine(dshp) Then hasNew = True: Exit For
            End If
        Next dshp
        If Not hasNew Then ResetMode      ' 십자 취소 후 빈 셀 클릭 → 반복 그리기 종료 + 막대 숨김
        GoTo Done
    End If

    ' 무거운 작업 시작 전 화면 갱신·이벤트 잠시 차단
    Dim oldEv As Boolean: oldEv = Application.EnableEvents
    Dim oldSU As Boolean: oldSU = Application.ScreenUpdating
    Application.EnableEvents = False
    Application.ScreenUpdating = False

    ' 모드 있을 때만 floating 패널 위치 보정
    UpdateFloatingPanelPosition Target.Worksheet

    Dim ptLeft As Double, ptTop As Double
    ptLeft = Target.Left
    ptTop = Target.Top

    If g_mode = "place_facility" Then
        Dim name As String
        ' InputBox 호출 전 잠시 이벤트·화면 복귀 (다이얼로그 정상 표시)
        Application.EnableEvents = oldEv
        Application.ScreenUpdating = oldSU
        name = InputBox("시설물 이름을 입력하세요:", "시설물 배치", g_legendLabel)
        Application.EnableEvents = False
        Application.ScreenUpdating = False
        If Len(Trim(name)) = 0 Then GoTo Done

        ' owner 2026-06-08 (8-118): 방향키 hold (W/E/R/S/F/Z/X/C) 면 강제 방향 배치 흐름.
        '   행정도 = ptLeft/ptTop 그대로, 네트웍 = 기준 시설물 + 키 offset (없으면 「시작 격자 좌표」 InputBox).
        '   키 안 누름 = 기존 자동 8-cell 흐름 그대로.
        Dim handled As Boolean: handled = False
        On Error Resume Next
        handled = 방향키_hold_분기_처리(ptLeft, ptTop, name)
        On Error GoTo 0
        If handled Then GoTo Done

        PlaceFacility ptLeft, ptTop, g_legendShape, g_legendLabel, name
        Application.StatusBar = "시설물 [" & g_legendLabel & "] 배치 + 설명선 부착 — 박스 클릭해 3줄 입력. 다음 위치 클릭, ESC = 종료."
    ElseIf g_mode = "place_cable" Then
        If g_cableFromId = "" Then GoTo Done
        Dim cx As Double, cy As Double
        cx = ptLeft + Target.Width / 2
        cy = ptTop + Target.Height / 2
        g_cableWaypoints.Add Array(cx, cy)

        Dim ws As Worksheet: Set ws = Target.Worksheet
        Dim mk As Shape
        Set mk = ws.Shapes.AddShape(msoShapeOval, cx - 4, cy - 4, 8, 8)
        mk.Name = PREFIX_WP_TMP & g_cableWaypoints.Count
        On Error Resume Next
        mk.Fill.ForeColor.RGB = RGB(220, 38, 38)
        mk.Line.ForeColor.RGB = RGB(255, 255, 255)
        mk.Line.Weight = 1.5
        On Error GoTo 0

        Application.StatusBar = "케이블 [" & g_cableSpec & "] 경로점 " & g_cableWaypoints.Count & " 추가."
    End If

Done:
    On Error Resume Next
    Application.EnableEvents = True
    Application.ScreenUpdating = True
    On Error GoTo 0
    busy = False
End Sub

Public Function 시트_우클릭_처리() As Boolean
    If g_mode <> "place_cable" Then Exit Function
    If g_cableWaypoints Is Nothing Then Exit Function
    If g_cableWaypoints.Count = 0 Then Exit Function

    Dim ws As Worksheet: Set ws = ThisWorkbook.Worksheets(SHEET_ADMIN)
    Dim idx As Long: idx = g_cableWaypoints.Count
    g_cableWaypoints.Remove idx
    On Error Resume Next
    ws.Shapes(PREFIX_WP_TMP & idx).Delete
    On Error GoTo 0

    Application.StatusBar = "마지막 경로점 취소 — 남은 경로점 " & g_cableWaypoints.Count
    시트_우클릭_처리 = True
End Function

' ESC = 그리기 모드·안내막대 즉시 닫기. OnKey 로 ESC 에 바인딩됨.
'   - SendKeys "{ESC}" 는 절대 쓰지 않음 (VBA 매크로 중단=디버그 키라 디버그 모드로 빠짐).
'   - ResetMode 로 안내막대(indicator)·범례 강조·시트 보호 정리.
'   - 셀 선택으로 네이티브 「도형 그리기 대기(십자)」 를 취소 (OnKey 가 네이티브 ESC 를
'     가로채므로 십자가 안 사라지는 것을 셀 선택이 대신 해제).
Public Sub ESC_누름()
    On Error Resume Next
    ResetMode
    ' owner 2026-06-08 (8-118): ESC 도 방향키 chain 의 기준 시설물 해제 — 다음 키 hold = 「시작 격자」 InputBox.
    g_selectedFacId = ""
    Dim ws As Worksheet: Set ws = ThisWorkbook.Worksheets(SHEET_ADMIN)
    If ActiveSheet Is ws Then ws.Cells(LEGEND_ROWS + 2, 1).Select
    Application.StatusBar = "취소됨 (기준 시설물도 해제)."
End Sub

Public Sub ResetMode()
    Dim ws As Worksheet: Set ws = ThisWorkbook.Worksheets(SHEET_ADMIN)
    Dim i As Long
    For i = ws.Shapes.Count To 1 Step -1
        If Left(ws.Shapes(i).Name, Len(PREFIX_WP_TMP)) = PREFIX_WP_TMP Then ws.Shapes(i).Delete
    Next i

    g_mode = ""
    g_legendShape = ""
    g_legendLabel = ""
    g_cableFromId = ""
    g_cableSpec = ""
    g_cableGubun = ""
    Set g_cableWaypoints = Nothing

    ' 그리기 자동 감지 중단
    g_drawLegendName = ""
    g_drawKind = ""
    Set g_drawBaseline = Nothing
    g_drawPolls = 0

    ' 라벨 필터 해제 — 그리기 끝나면 패널 전체 복귀
    Dim hadFilter As Boolean: hadFilter = (Len(g_drawLabel) > 0)
    g_drawLabel = ""

    ' 범례 외곽선 복원 + indicator 숨김
    HighlightSelectedLegend ""
    UpdateModeIndicator

    ' 필터가 켜져 있었으면 패널을 다시 그려 숨겼던 범례 복원
    If hadFilter Then UpdateFloatingPanelPosition ws

    ' 그리기 위해 해제했을 수 있는 시트 보호 복원
    ApplySheetProtection ws
    Application.StatusBar = False
End Sub

' ============================================================================
'  5. 시설물 배치
' ============================================================================
' owner 2026-06-08 (8-118): forceNwLeft/forceNwTop 옵션 — 네트웍 위치를 직접 지정 (방향키 hold 흐름).
'   기본값 -1E+30 = 자동 (기존 SnapToNetworkGrid + 네트웍_빈격자_찾기).
'   값이 명시되면 그 좌표를 그대로 사용. 격자 안 검사는 호출 측에서 수행.
Public Sub PlaceFacility(ptLeft As Double, ptTop As Double, _
                         legendName As String, kind As String, label As String, _
                         Optional forceNwLeft As Double = -1E+30, _
                         Optional forceNwTop As Double = -1E+30)
    Dim wsAd As Worksheet: Set wsAd = ThisWorkbook.Worksheets(SHEET_ADMIN)
    Dim wsNw As Worksheet: Set wsNw = ThisWorkbook.Worksheets(SHEET_NETWORK)

    ' 시트 보호 임시 해제 (UserInterfaceOnly 만료 대응)
    Dim wasProtAd As Boolean, wasProtNw As Boolean
    wasProtAd = wsAd.ProtectContents Or wsAd.ProtectDrawingObjects
    wasProtNw = wsNw.ProtectContents Or wsNw.ProtectDrawingObjects
    On Error Resume Next
    wsAd.Unprotect
    wsNw.Unprotect
    On Error GoTo 0

    On Error GoTo PlaceErr

    ' owner 2026-06-08 (8-124-fix): leg 찾기 — 행정도 우선, 없으면 양식 시트 fallback.
    Dim leg As Shape: Set leg = Nothing
    On Error Resume Next: Set leg = wsAd.Shapes(legendName): On Error GoTo 0
    If leg Is Nothing Then
        Dim wsForm As Worksheet
        On Error Resume Next: Set wsForm = ThisWorkbook.Worksheets(SHEET_LEGEND_FORM): On Error GoTo 0
        If Not wsForm Is Nothing Then
            On Error Resume Next: Set leg = wsForm.Shapes(legendName): On Error GoTo 0
        End If
    End If
    On Error GoTo PlaceErr
    If leg Is Nothing Then Err.Raise 9001, , "범례 도형을 찾지 못함: " & legendName

    Dim facId As String: facId = PREFIX_FAC & NewId8()

    Dim shAd As Shape
    Set shAd = CloneLegendShape(leg, wsAd, ptLeft, ptTop, FAC_DEFAULT_W, FAC_DEFAULT_H, label)
    shAd.Name = facId
    shAd.OnAction = ""            ' OnAction 없음 → 네이티브 선택·이동
    shAd.Locked = False

    ' 네트웍구성도 — owner 2026-06-08 (8-118): forceNwLeft/Top 명시되면 그대로, 아니면 자동 스냅.
    Dim nwLeft2 As Double, nwTop2 As Double
    If forceNwLeft > -1E+29 And forceNwTop > -1E+29 Then
        nwLeft2 = forceNwLeft
        nwTop2 = forceNwTop
    Else
        Dim nwCenterX2 As Double, nwCenterY2 As Double
        SnapToNetworkGrid wsNw, ptLeft + FAC_DEFAULT_W / 2, ptTop + FAC_DEFAULT_H / 2, nwCenterX2, nwCenterY2
        네트웍_빈격자_찾기 wsNw, nwCenterX2, nwCenterY2, FAC_DEFAULT_W, FAC_DEFAULT_H, facId, _
                           ptLeft + FAC_DEFAULT_W / 2, ptTop + FAC_DEFAULT_H / 2, wsAd
        nwLeft2 = nwCenterX2 - FAC_DEFAULT_W / 2
        nwTop2 = nwCenterY2 - FAC_DEFAULT_H / 2
    End If
    Dim shNw As Shape
    Set shNw = CloneLegendShape(leg, wsNw, nwLeft2, nwTop2, FAC_DEFAULT_W, FAC_DEFAULT_H, label)
    shNw.Name = facId
    shNw.OnAction = ""            ' OnAction 없음 → 네이티브 선택·이동
    shNw.Locked = False

    Dim badgeNo2 As Long: badgeNo2 = NextBadgeNo()
    AppendMetaRow SHEET_META_FAC, Array(facId, kind, label, Now, badgeNo2)

    ' 시설물 좌상단 번호 배지 (양 시트)
    AddBadge wsAd, shAd, facId, CStr(badgeNo2)
    AddBadge wsNw, shNw, facId, CStr(badgeNo2)

    ' 설명선 자동 부착 — 양 시트. 「구분」 자리에 범례 명칭(label) 자동 입력
    Dim calloutTextP As String
    calloutTextP = label & vbCr & "함체명을 입력하세요" & vbCr & "ID"
    AddFacilityCallout wsAd, shAd, facId, calloutTextP, label
    AddFacilityCallout wsNw, shNw, facId, calloutTextP, label

    ' callout 생성 후 배지를 callout 좌상단으로 재정렬
    배지_위치_동기화 wsAd
    배지_위치_동기화 wsNw

    ' 네트웍구성도 시설물 callout 위 상태 박스 + 태그 콤보
    AddFacilityStatusBox wsNw, facId
    AddFacilityTagCombo wsNw, facId
    시설물_태그_위치_동기화 wsNw, facId

    ' owner 2026-06-08 (8-115): 배치 모드 ON 중에 신규 시설물이면 새 데코도 즉시 숨김.
    '   토글 OFF 누르기 전까지 시설물·배지만 보이는 상태 유지.
    On Error Resume Next
    If g_placementMode Then
        Dim wasProt2 As Boolean: wasProt2 = wsNw.ProtectContents Or wsNw.ProtectDrawingObjects
        wsNw.Unprotect
        네트웍_데코_가시성_적용 wsNw, False
        If wasProt2 Then ApplySheetProtection wsNw
    End If
    On Error GoTo 0

    ' owner 2026-06-08 (8-118): 방향키 hold chain 의 「기준 시설물」 자동 갱신.
    '   마지막 그린 시설물이 다음 키 hold 의 기준 (PlaceFacility 호출 경로 무관 — 자동 8-cell/forced 모두).
    g_selectedFacId = facId

    ' owner 2026-06-08 (8-121): 시설물 자동 선택 해제 — Excel 은 AddShape 후 새 도형을 자동 선택함.
    '   이 상태에서 키 누르면 도형 텍스트 편집 모드로 들어가 글자가 도형에 입력됨 (owner 보고).
    '   안전한 셀로 선택 이동 → 다음 키 hold 가 도형 글자 입력으로 새지 않음.
    On Error Resume Next
    If ActiveSheet Is wsAd Then wsAd.Cells(LEGEND_ROWS + 2, 1).Select
    On Error GoTo 0

    If wasProtAd Then ApplySheetProtection wsAd
    If wasProtNw Then ApplySheetProtection wsNw
    Exit Sub

PlaceErr:
    Dim errMsg As String: errMsg = "시설물 배치 실패: " & Err.Number & " " & Err.Description
    If wasProtAd Then ApplySheetProtection wsAd
    If wasProtNw Then ApplySheetProtection wsNw
    MsgBox errMsg, vbExclamation, "PlaceFacility 오류"
End Sub

' ===== owner 2026-06-08 (8-118): 기준 시설물 설정·해제 (점프) =====
'   시설물 좌클릭으로 도형 선택 후 「기준 시설물 설정」 메뉴 → g_selectedFacId 갱신.
'   ESC 또는 「기준 시설물 해제」 → "" 로 리셋 (다음 키 hold 는 「시작 격자 좌표」 InputBox).
'   8-106 의 「선택_시설물ID추출」 재사용 (fac_/badge_/lbl_fac_ 어느쪽이든 facId 추출).
Public Sub 기준_시설물_설정()
    Dim facId As String: facId = 선택_시설물ID추출()
    If Len(facId) = 0 Then
        MsgBox "시설물·포인트번호·설명선 중 하나를 먼저 선택하세요." & vbLf & vbLf & _
               "선택 후 「기준 시설물 설정」 을 다시 누르면 그 시설물이 chain 의 기준이 됩니다.", _
               vbExclamation, "기준 시설물 설정"
        Exit Sub
    End If
    g_selectedFacId = facId
    Dim nm As String: nm = ""
    On Error Resume Next: nm = MetaLookupName(SHEET_META_FAC, facId): On Error GoTo 0
    Application.StatusBar = "기준 시설물 = " & facId & IIf(Len(nm) > 0 And nm <> "(미지정)", " (" & nm & ")", "") & _
                            " — 다음 W/E/R/S/F/Z/X/C 키 hold + 행정도 빈셀 클릭이 chain"
End Sub

Public Sub 기준_시설물_해제()
    g_selectedFacId = ""
    Application.StatusBar = "기준 시설물 해제 — 다음 키 hold 는 「시작 격자 좌표」 InputBox"
End Sub

' owner 2026-06-08 (8-118): 행정도 빈셀 클릭 + 방향키 hold 분기 — 시트_셀_클릭 에서 호출.
'   g_selectedFacId 있으면 → 기준 시설물의 네트웍 좌표 + 키 offset → forced placement
'   g_selectedFacId 없으면 → 「시작 격자 좌표」 InputBox ("3,5" 형식)
'   점유 시 안내 + 시설물 생성 취소 (g_selectedFacId 유지 — 사용자가 다른 키 누를 수 있게)
'   반환: True = 방향키 분기 처리 완료 (호출측은 기존 흐름 skip) / False = 키 hold 없음 (기존 흐름 진행)
Public Function 방향키_hold_분기_처리(ptLeft As Double, ptTop As Double, label As String) As Boolean
    방향키_hold_분기_처리 = False
    Dim dirKey As String: dirKey = 방향키_확인()
    If Len(dirKey) = 0 Then Exit Function

    Dim wsNw As Worksheet
    On Error Resume Next: Set wsNw = ThisWorkbook.Worksheets(SHEET_NETWORK): On Error GoTo 0
    If wsNw Is Nothing Then Exit Function

    ' 격자 셀 크기
    Dim cw As Double: cw = wsNw.Cells(1, 1).Width
    Dim rh As Double: rh = wsNw.Cells(LEGEND_ROWS + 1, 1).Height   ' 격자 셀 높이 = 2행 (1행은 검색바). owner 2026-06-10
    If cw <= 0 Then cw = CELL_PT
    If rh <= 0 Then rh = CELL_PT
    Dim gridW As Double: gridW = cw * 네트웍_격자_단위가로cells()
    Dim gridH As Double: gridH = rh * 네트웍_격자_단위세로cells()

    Dim nwCenterX As Double, nwCenterY As Double

    If Len(g_selectedFacId) = 0 Then
        ' 첫 시설물 — 시작 격자 좌표 InputBox
        Dim s As String
        s = InputBox("첫 시설물의 네트웍구성도 시작 격자 좌표 (가로,세로):" & vbLf & vbLf & _
                     "  예: 3,5 = 가로 3번째, 세로 5번째 격자" & vbLf & _
                     "  현재 격자: " & 네트웍_격자_가로칸수() & " × " & 네트웍_격자_세로칸수() & vbLf & vbLf & _
                     "이후 시설물은 자동 chain (마지막 그린 시설물 기준 + 키 방향).", _
                     "방향키 시작 — 시작 격자 좌표", "1,1")
        If Len(Trim(s)) = 0 Then
            Application.StatusBar = "시작 격자 좌표 입력 취소."
            방향키_hold_분기_처리 = True   ' 키 hold 가 있었으므로 기존 흐름 skip (사용자가 취소)
            Exit Function
        End If
        Dim parts() As String: parts = Split(s, ",")
        If UBound(parts) < 1 Then
            MsgBox "「가로,세로」 형식으로 입력하세요. 예: 3,5", vbExclamation, "시작 격자 좌표"
            방향키_hold_분기_처리 = True
            Exit Function
        End If
        If Not IsNumeric(Trim(parts(0))) Or Not IsNumeric(Trim(parts(1))) Then
            MsgBox "숫자만 입력하세요. 예: 3,5", vbExclamation, "시작 격자 좌표"
            방향키_hold_분기_처리 = True
            Exit Function
        End If
        Dim gc As Long: gc = CLng(Trim(parts(0)))
        Dim gr As Long: gr = CLng(Trim(parts(1)))
        If gc < 1 Or gc > 네트웍_격자_가로칸수() Or gr < 1 Or gr > 네트웍_격자_세로칸수() Then
            MsgBox "격자 좌표가 범위 밖입니다." & vbLf & "현재 격자: " & 네트웍_격자_가로칸수() & " × " & 네트웍_격자_세로칸수(), _
                   vbExclamation, "시작 격자 좌표"
            방향키_hold_분기_처리 = True
            Exit Function
        End If
        ' gc, gr 격자의 중앙 좌표 — Y 원점 = NW_TOP_H (1행 검색바, 격자 2행부터). owner 2026-06-10 십자 어긋남 수정
        nwCenterX = gc * gridW + cw / 2
        nwCenterY = NW_TOP_H + gr * gridH + rh / 2
    Else
        ' chain — 기준 시설물 + 키 offset
        Dim refShp As Shape: Set refShp = Nothing
        On Error Resume Next: Set refShp = wsNw.Shapes(g_selectedFacId): On Error GoTo 0
        If refShp Is Nothing Then
            ' 기준 시설물이 사라짐 (삭제 등) — 자동 해제 + 첫 시설물 흐름으로 재진입
            g_selectedFacId = ""
            Application.StatusBar = "기준 시설물 " & g_selectedFacId & " 이(가) 사라져 해제. 다시 키 hold + 클릭하면 시작 격자 좌표 InputBox."
            방향키_hold_분기_처리 = True
            Exit Function
        End If
        Dim refCX As Double, refCY As Double
        refCX = refShp.Left + refShp.Width / 2
        refCY = refShp.Top + refShp.Height / 2
        Dim dx As Long, dy As Long
        방향키_offset dirKey, dx, dy
        nwCenterX = refCX + dx * gridW
        nwCenterY = refCY + dy * gridH
        ' 기준 시설물이 어긋나 있어도 신규는 정확히 십자 위 (M2 헬퍼). owner 2026-06-10
        격자_교차점_스냅 wsNw, nwCenterX, nwCenterY
    End If

    ' 점유 검사
    If 격자셀_시설물겹침(wsNw, nwCenterX, nwCenterY, FAC_DEFAULT_W, FAC_DEFAULT_H, "") Then
        MsgBox dirKey & " " & 방향키_라벨(dirKey) & " 방향에 이미 시설물이 있습니다." & vbLf & vbLf & _
               "다른 키 (W/E/R/S/F/Z/X/C) 를 누른 상태에서 다시 클릭하세요.", _
               vbExclamation, "방향키 — 자리 점유"
        방향키_hold_분기_처리 = True       ' 키 hold 분기 처리 완료 — 시설물 생성 안 함
        Exit Function
    End If

    ' 격자 범위 검사 — 새 시설물의 셀 좌표가 격자 안인가 (Y 원점 = NW_TOP_H. owner 2026-06-10)
    Dim newGc As Long, newGr As Long
    newGc = CLng((nwCenterX - cw / 2) / gridW)
    newGr = CLng((nwCenterY - NW_TOP_H - rh / 2) / gridH)
    If newGc < 1 Or newGc > 네트웍_격자_가로칸수() Or newGr < 0 Or newGr > 네트웍_격자_세로칸수() Then
        MsgBox dirKey & " " & 방향키_라벨(dirKey) & " 방향이 격자 밖입니다. (셀 좌표 " & newGc & "," & newGr & ")" & vbLf & vbLf & _
               "「격자 추가확장」 으로 그 방향으로 격자 확장 후 다시 시도하세요.", _
               vbExclamation, "방향키 — 격자 밖"
        방향키_hold_분기_처리 = True
        Exit Function
    End If

    ' 시설물 배치 (행정도 = ptLeft/ptTop 그대로, 네트웍 = 강제)
    Dim nwLeft As Double: nwLeft = nwCenterX - FAC_DEFAULT_W / 2
    Dim nwTop As Double: nwTop = nwCenterY - FAC_DEFAULT_H / 2
    PlaceFacility ptLeft, ptTop, g_legendShape, g_legendLabel, label, nwLeft, nwTop

    Application.StatusBar = "방향키 chain — " & dirKey & " " & 방향키_라벨(dirKey) & " 방향에 시설물 [" & label & "] 배치. 기준 = " & g_selectedFacId

    방향키_hold_분기_처리 = True
End Function

' forceType<>0 면 그 도형 종류로 강제 (예: 접속함체 → 순서도 가산접합 ⊗).
' leg Is Nothing 이어도 동작 (forceType 또는 사각형으로 생성, 색 복제는 생략).
' owner 2026-06-08 (8-124-fix): 그룹 도형 지원 + leg 글자 보존.
'   - Group 도형 = Copy/Paste 로 그룹 그대로 복제 (AutoShapeType 무효 → 옛 코드는 사각형 fallback)
'   - leg 의 텍스트 있으면 보존 (양식 등록 도형용). 없으면 label 사용 (기존 호환)
' ============================================================================
'  owner 2026-06-10 (Step C): 행정도 1행 콤보박스 — 양식 도형 명칭별 선택 → 그리기
' ============================================================================
' 메인 — _범례 메타(form)를 명칭별 그룹으로 읽어 행정도 1행에 [명칭][구분▼][규격▼][추가▼] 배치.
Public Sub 행정도_콤보_생성()
    Dim ws As Worksheet: Set ws = ThisWorkbook.Worksheets(SHEET_ADMIN)
    If ws Is Nothing Then Exit Sub
    Dim wsMeta As Worksheet: Set wsMeta = Nothing
    On Error Resume Next: Set wsMeta = ThisWorkbook.Worksheets(SHEET_META_LEG): On Error GoTo 0
    If wsMeta Is Nothing Then
        MsgBox "양식 등록 정보(_범례)가 없습니다. 먼저 「양식 스캔」 하세요.", vbExclamation, "콤보 생성": Exit Sub
    End If

    Dim wasProt As Boolean: wasProt = ws.ProtectContents Or ws.ProtectDrawingObjects
    On Error Resume Next: ws.Unprotect: On Error GoTo 0

    행정도_콤보_제거 ws
    행정도_패널콤보_숨김 ws

    ' 명칭별 옵션 수집 (메타: 1 newName · 3 gubun · 5 gyuk · 6 chuga · 8 src · 9 명칭)
    Dim nameOrder As Collection: Set nameOrder = New Collection
    Dim gubunMap As Object: Set gubunMap = CreateObject("Scripting.Dictionary")
    Dim gyukMap As Object: Set gyukMap = CreateObject("Scripting.Dictionary")
    Dim chugaMap As Object: Set chugaMap = CreateObject("Scripting.Dictionary")

    Dim lastRow As Long: lastRow = wsMeta.Cells(wsMeta.Rows.Count, 1).End(xlUp).Row
    Dim r As Long
    For r = 2 To lastRow
        If CStr(wsMeta.Cells(r, 8).Value) <> "form" Then GoTo NextR
        Dim nm As String: nm = Trim(CStr(wsMeta.Cells(r, 9).Value))
        If Len(nm) = 0 Then GoTo NextR
        Dim gb As String: gb = 양식_셀_텍스트(wsMeta.Cells(r, 3))
        Dim gy As String: gy = 양식_셀_텍스트(wsMeta.Cells(r, 5))   ' 규격 — _범례 시트에서 날짜 변환됐어도 "1-4" 복원
        Dim ch As String: ch = 양식_셀_텍스트(wsMeta.Cells(r, 6))
        If Not gubunMap.Exists(nm) Then
            nameOrder.Add nm
            gubunMap(nm) = "": gyukMap(nm) = "": chugaMap(nm) = ""
        End If
        gubunMap(nm) = 행정도_콤보_옵션추가(CStr(gubunMap(nm)), gb)
        gyukMap(nm) = 행정도_콤보_옵션추가(CStr(gyukMap(nm)), gy)
        chugaMap(nm) = 행정도_콤보_옵션추가(CStr(chugaMap(nm)), ch)
NextR:
    Next r

    If nameOrder.Count = 0 Then
        If wasProt Then ApplySheetProtection ws
        MsgBox "등록된 양식 도형이 없거나 명칭 정보가 없습니다." & vbLf & _
               "「양식 스캔」 을 한 번 더 눌러 명칭을 보강한 뒤 다시 시도하세요.", vbExclamation, "콤보 생성"
        Exit Sub
    End If

    Dim startX As Double: startX = ws.Cells(1, 1).Left + 4
    Dim curX As Double: curX = startX
    Dim curY As Double: curY = ws.Cells(1, 1).Top + 2
    Dim rowH As Double: rowH = ADMIN_COMBO_H + 5
    Dim maxX As Double: maxX = startX + 1100
    Dim seq As Long: seq = 0

    Dim ni As Long
    For ni = 1 To nameOrder.Count
        Dim nmv As String: nmv = nameOrder(ni)
        Dim hasGubun As Boolean: hasGubun = (Len(CStr(gubunMap(nmv))) > 0)
        Dim hasGyuk As Boolean: hasGyuk = (Len(CStr(gyukMap(nmv))) > 0)
        Dim hasChuga As Boolean: hasChuga = (Len(CStr(chugaMap(nmv))) > 0)
        Dim groupW As Double
        groupW = ADMIN_COMBO_LBL_W + 12 + (행정도_콤보_폭("size") + 2)   ' 라벨 + size 콤보(항상)
        If hasGubun Then groupW = groupW + 행정도_콤보_폭L("gubun", CStr(gubunMap(nmv))) + 2
        If hasGyuk Then groupW = groupW + 행정도_콤보_폭L("gyuk", CStr(gyukMap(nmv))) + 2
        If hasChuga Then groupW = groupW + 행정도_콤보_폭L("chuga", CStr(chugaMap(nmv))) + 2
        If curX + groupW > maxX Then
            curX = startX
            curY = curY + rowH
        End If

        Dim lbl As Shape
        Set lbl = ws.Shapes.AddTextbox(msoTextOrientationHorizontal, curX, curY, ADMIN_COMBO_LBL_W, ADMIN_COMBO_H)
        lbl.Name = PREFIX_ADMIN_COMBO_LBL & seq
        lbl.Placement = 3
        lbl.Line.Visible = msoFalse
        lbl.Fill.Visible = msoFalse
        On Error Resume Next
        With lbl.TextFrame2
            .WordWrap = msoFalse
            .AutoSize = msoAutoSizeShapeToFitText   ' 명칭 길이에 맞춰 라벨 폭 자동 — 콤보가 명칭 바로 옆에 붙음
            .MarginLeft = 0: .MarginRight = 2: .MarginTop = 0: .MarginBottom = 0
            .VerticalAnchor = msoAnchorMiddle
            With .TextRange
                .Text = nmv & ":"
                .Font.Size = 8
                .Font.Bold = True
                .Font.Name = CALLOUT_FONT_NAME
            End With
        End With
        On Error GoTo 0
        Dim lblW As Double: lblW = ADMIN_COMBO_LBL_W
        On Error Resume Next: lblW = lbl.Width: On Error GoTo 0
        On Error Resume Next: lbl.AlternativeText = "dx=" & CLng(lbl.Left - ws.Cells(1, 1).Left): On Error GoTo 0   ' 가로 스크롤 추종
        curX = lbl.Left + lblW + 3

        ' 데이터 있는 콤보만 생성 (규격 없으면 규격 콤보 X — owner 2026-06-10)
        If hasGubun Then
            행정도_콤보_하나생성 ws, nmv, "gubun", CStr(gubunMap(nmv)), curX, curY, seq
            curX = curX + 행정도_콤보_폭L("gubun", CStr(gubunMap(nmv))) + 2: seq = seq + 1
        End If
        If hasGyuk Then
            행정도_콤보_하나생성 ws, nmv, "gyuk", CStr(gyukMap(nmv)), curX, curY, seq
            curX = curX + 행정도_콤보_폭L("gyuk", CStr(gyukMap(nmv))) + 2: seq = seq + 1
        End If
        If hasChuga Then
            행정도_콤보_하나생성 ws, nmv, "chuga", CStr(chugaMap(nmv)), curX, curY, seq
            curX = curX + 행정도_콤보_폭L("chuga", CStr(chugaMap(nmv))) + 2: seq = seq + 1
        End If
        ' 크기/굵기 콤보 (항상) — 시설물 크기% / 케이블 굵기 가산. owner 2026-06-10 ⑤
        행정도_콤보_하나생성 ws, nmv, "size", "", curX, curY, seq
        curX = curX + 행정도_콤보_폭("size") + 2: seq = seq + 1
        curX = curX + 12
    Next ni

    ' 검색 3버튼 — 마지막 콤보 + 콤보 1개 폭 간격 두고 (owner 2026-06-10)
    curX = curX + ADMIN_COMBO_W
    행정도_검색버튼_생성 ws, curX, curY

    ' 콤보·버튼 가로 스크롤 추종 위치 적용 (현재 보이는 영역 기준)
    행정도_콤보_위치갱신 ws

    If wasProt Then ApplySheetProtection ws
    Application.StatusBar = "행정도 콤보박스 생성 완료 — 명칭별 구분·규격을 선택하면 그 도형으로 그리기. (검색 버튼 포함)"
End Sub

' 검색 3버튼 (포인트검색·명칭검색·ID검색) 생성 — 콤보 다음에 배치. dx 저장으로 스크롤 추종. owner 2026-06-10
Public Sub 행정도_검색버튼_생성(ws As Worksheet, x As Double, y As Double)
    Dim defs As Variant
    defs = Array(Array("포인트검색", "검색_배지번호"), _
                 Array("명칭검색", "검색_시설물명"), _
                 Array("ID검색", "검색_ID"), _
                 Array("내보내기", "새파일_내보내기"))
    Dim bx As Double: bx = x
    Dim i As Long
    For i = LBound(defs) To UBound(defs)
        Dim bn As String: bn = PREFIX_ADMIN_SEARCH_BTN & i
        On Error Resume Next: ws.Shapes(bn).Delete: On Error GoTo 0
        Dim btn As Shape: Set btn = Nothing
        On Error Resume Next
        Set btn = ws.Shapes.AddFormControl(xlButtonControl, bx, y, ADMIN_SBTN_W, ADMIN_SBTN_H)
        On Error GoTo 0
        If Not btn Is Nothing Then
            btn.Name = bn
            btn.Placement = 3
            On Error Resume Next
            btn.TextFrame.Characters.Text = defs(i)(0)
            btn.TextFrame.Characters.Font.Size = 9
            btn.OnAction = defs(i)(1)
            btn.AlternativeText = "dx=" & CLng(bx - ws.Cells(1, 1).Left)
            On Error GoTo 0
            bx = bx + ADMIN_SBTN_W + 3
        End If
    Next i
End Sub

' 콤보·검색버튼을 현재 화면 좌측 기준으로 재배치 (가로 스크롤 추종). 셀 클릭마다 호출. owner 2026-06-10
'   각 도형 AlternativeText 의 dx(=생성 시 A열 기준 오프셋) 를 vr.Left 에 더해 위치 갱신. Top 은 1행 고정이라 불변.
Public Sub 행정도_콤보_위치갱신(ws As Worksheet)
    If ws Is Nothing Then Exit Sub
    If ws.Name <> SHEET_ADMIN Then Exit Sub
    Dim vr As Range
    On Error Resume Next: Set vr = ActiveWindow.VisibleRange: On Error GoTo 0
    If vr Is Nothing Then Exit Sub
    Dim baseLeft As Double: baseLeft = vr.Left
    Dim sh As Shape
    For Each sh In ws.Shapes
        Dim nm As String: nm = sh.Name
        Dim isCombo As Boolean: isCombo = (Left(nm, Len(PREFIX_ADMIN_COMBO)) = PREFIX_ADMIN_COMBO)
        Dim isBtn As Boolean: isBtn = (Left(nm, Len(PREFIX_ADMIN_SEARCH_BTN)) = PREFIX_ADMIN_SEARCH_BTN)
        If (isCombo Or isBtn) And Left(nm, Len(PREFIX_ADMIN_COMBO_PV)) <> PREFIX_ADMIN_COMBO_PV Then
            Dim alt As String: alt = ""
            On Error Resume Next: alt = sh.AlternativeText: On Error GoTo 0
            Dim dxs As String: dxs = 행정도_콤보_alt파싱(alt, "dx")
            If Len(dxs) > 0 And IsNumeric(dxs) Then
                On Error Resume Next: sh.Left = baseLeft + CDbl(dxs): On Error GoTo 0
            End If
        End If
    Next sh
End Sub

' 네트웍 1행 검색3 + 코어3 + 포인트2 + 전체줌2(축소·확대) + 시설물만 토글, 각 그룹 0.5칸 띄움. 가로/세로 줌은 리본. dx 스크롤 추종. owner 2026-06-10
Public Sub 네트웍_검색버튼_생성(wsNw As Worksheet)
    If wsNw Is Nothing Then Exit Sub
    Dim wasProt As Boolean: wasProt = wsNw.ProtectContents Or wsNw.ProtectDrawingObjects
    On Error Resume Next: wsNw.Unprotect: On Error GoTo 0
    ' 기존 검색버튼 일괄 제거 (버튼 수 변경 시 orphan 방지). owner 2026-06-10
    Dim oldSh As Shape, j As Long
    For j = wsNw.Shapes.Count To 1 Step -1
        Set oldSh = wsNw.Shapes(j)
        If Left(oldSh.Name, Len(PREFIX_NW_SEARCH_BTN)) = PREFIX_NW_SEARCH_BTN Then
            On Error Resume Next: oldSh.Delete: On Error GoTo 0
        End If
    Next j
    ' 검색 3버튼 + 0.5칸 간격 + 코어 3버튼 + 포인트 2버튼 + 전체줌 2버튼 + 시설물만. owner 2026-06-10
    Dim defs As Variant
    defs = Array(Array("포인트검색", "검색_배지번호"), _
                 Array("명칭검색", "검색_시설물명"), _
                 Array("ID검색", "검색_ID"), _
                 Array("__gap__", ""), _
                 Array("코어연결", "선번연결_도구"), _
                 Array("코어추적", "코어_추적_도구"), _
                 Array("추적지우기", "코어_추적_지우기"), _
                 Array("__gap__", ""), _
                 Array("포인트추가", "배지_추가"), _
                 Array("포인트삭제", "배지_삭제"), _
                 Array("__gap__", ""), _
                 Array("전체축소", "격자_줌_전체_축소"), _
                 Array("전체확대", "격자_줌_전체_확대"), _
                 Array("시설물만", "시설물만보기_토글"), _
                 Array("__gap__", ""), _
                 Array("내보내기", "새파일_내보내기"))
    Dim bx As Double: bx = wsNw.Cells(1, 1).Left + PANEL_OFFSET
    Dim by As Double: by = wsNw.Cells(1, 1).Top + 2
    Dim i As Long
    For i = LBound(defs) To UBound(defs)
        If defs(i)(0) = "__gap__" Then
            bx = bx + ADMIN_SBTN_W * 0.5 + 3       ' 버튼 0.5개 간격 (owner 2026-06-10)
        Else
            Dim bn As String: bn = PREFIX_NW_SEARCH_BTN & i
            On Error Resume Next: wsNw.Shapes(bn).Delete: On Error GoTo 0
            Dim btn As Shape: Set btn = Nothing
            On Error Resume Next
            Set btn = wsNw.Shapes.AddFormControl(xlButtonControl, bx, by, ADMIN_SBTN_W, ADMIN_SBTN_H)
            On Error GoTo 0
            If Not btn Is Nothing Then
                btn.Name = bn
                btn.Placement = 3
                On Error Resume Next
                btn.TextFrame.Characters.Text = defs(i)(0)
                btn.TextFrame.Characters.Font.Size = 9
                btn.OnAction = defs(i)(1)
                btn.AlternativeText = "dx=" & CLng(bx - wsNw.Cells(1, 1).Left) & "|dy=" & CLng(by - wsNw.Cells(1, 1).Top)
                On Error GoTo 0
                bx = bx + ADMIN_SBTN_W + 3
            End If
        End If
    Next i
    ' 1행(검색바) 틀고정 — 네트웍이 active 일 때만 (격자/버튼 생성은 보통 네트웍에서 실행).
    '   틀고정으로 세로 스크롤에도 검색바 고정 + 가로는 _위치갱신 보강. 이벤트 가드(.Select 재귀 방지). owner 2026-06-10
    On Error Resume Next
    If ActiveSheet.Name = SHEET_NETWORK Then
        Dim oEvF As Boolean: oEvF = Application.EnableEvents
        Application.EnableEvents = False
        ActiveWindow.FreezePanes = False
        ActiveWindow.ScrollRow = 1
        ActiveWindow.ScrollColumn = 1
        wsNw.Cells(LEGEND_ROWS + 1, 1).Select
        ActiveWindow.FreezePanes = True
        Application.EnableEvents = oEvF
    End If
    On Error GoTo 0
    네트웍_검색버튼_위치갱신 wsNw
    If wasProt Then ApplySheetProtection wsNw
End Sub

' 네트웍 검색버튼을 현재 화면 좌상단 기준 재배치 (가로·세로 스크롤 추종 — 네트웍은 틀고정 없음). owner 2026-06-10
Public Sub 네트웍_검색버튼_위치갱신(wsNw As Worksheet)
    If wsNw Is Nothing Then Exit Sub
    If wsNw.Name <> SHEET_NETWORK Then Exit Sub
    ' 가로 기준 = 화면에 보이는 가장 왼쪽 열의 Left (ScrollColumn). 틀고정 시 VisibleRange.Left 가
    '   고정 셀(A1)을 가리켜 안 따라오는 문제 회피 — ScrollColumn 은 스크롤 영역 첫 열이라 가로 스크롤 추종. owner 2026-06-10
    Dim leftCol As Long: leftCol = 1
    On Error Resume Next: leftCol = ActiveWindow.ScrollColumn: On Error GoTo 0
    If leftCol < 1 Then leftCol = 1
    Dim baseLeft As Double: baseLeft = wsNw.Cells(1, leftCol).Left
    Dim sh As Shape
    For Each sh In wsNw.Shapes
        If Left(sh.Name, Len(PREFIX_NW_SEARCH_BTN)) = PREFIX_NW_SEARCH_BTN Then
            Dim alt As String: alt = ""
            On Error Resume Next: alt = sh.AlternativeText: On Error GoTo 0
            ' Top 은 1행 틀고정으로 고정 — 가로(dx)만 추종 (행정도와 동일).
            Dim dxs As String: dxs = 행정도_콤보_alt파싱(alt, "dx")
            If Len(dxs) > 0 And IsNumeric(dxs) Then
                On Error Resume Next: sh.Left = baseLeft + CDbl(dxs): On Error GoTo 0
            End If
        End If
    Next sh
End Sub

' 콤보 1개 생성 + 옵션 채움.
Public Sub 행정도_콤보_하나생성(ws As Worksheet, 명칭 As String, tp As String, optList As String, x As Double, y As Double, seq As Long)
    Dim cb As Shape: Set cb = Nothing
    On Error Resume Next
    Set cb = ws.Shapes.AddFormControl(xlDropDown, x, y, 행정도_콤보_폭L(tp, optList), ADMIN_COMBO_H)
    On Error GoTo 0
    If cb Is Nothing Then Exit Sub
    cb.Name = PREFIX_ADMIN_COMBO & seq
    cb.Placement = 3
    On Error Resume Next
    cb.ControlFormat.RemoveAllItems
    If tp = "size" Then
        ' 크기/굵기 — 명칭이 케이블이면 굵기 가산, 아니면 크기%. (index1=placeholder=기본)
        If InStr(명칭, "케이블") > 0 Then
            cb.ControlFormat.AddItem "(굵기)"
            cb.ControlFormat.AddItem "+0t"
            cb.ControlFormat.AddItem "+0.5t"
            cb.ControlFormat.AddItem "+1t"
            cb.ControlFormat.AddItem "+1.5t"
            cb.ControlFormat.AddItem "+2t"
            cb.ControlFormat.AddItem "+2.5t"
            cb.ControlFormat.AddItem "+3t"
        Else
            cb.ControlFormat.AddItem "(크기)"
            cb.ControlFormat.AddItem "100%"
            cb.ControlFormat.AddItem "80%"
            cb.ControlFormat.AddItem "60%"
            cb.ControlFormat.AddItem "40%"
        End If
    Else
        cb.ControlFormat.AddItem "(" & 행정도_콤보_타입라벨(tp) & ")"
        Dim parts() As String
        If Len(optList) > 0 Then
            parts = Split(optList, "|")
            Dim i As Long
            For i = LBound(parts) To UBound(parts)
                If Len(parts(i)) > 0 Then cb.ControlFormat.AddItem parts(i)
            Next i
        End If
    End If
    cb.ControlFormat.Value = 1
    cb.AlternativeText = "nm=" & 명칭 & "|tp=" & tp & "|dx=" & CLng(x - ws.Cells(1, 1).Left)   ' dx = 가로 스크롤 추종 오프셋(정수 px)
    On Error GoTo 0
    cb.OnAction = "행정도_콤보_변경"
End Sub

' 옵션 리스트("|" join)에 값 추가 — 빈 값·중복 제외. (optVal: Val 내장함수와 이름 충돌 회피)
Public Function 행정도_콤보_옵션추가(existing As String, optVal As String) As String
    행정도_콤보_옵션추가 = existing
    If Len(optVal) = 0 Then Exit Function
    If Len(existing) = 0 Then
        행정도_콤보_옵션추가 = optVal
        Exit Function
    End If
    Dim cur() As String: cur = Split(existing, "|")
    Dim i As Long
    For i = LBound(cur) To UBound(cur)
        If cur(i) = optVal Then Exit Function   ' 이미 있음 — 그대로
    Next i
    행정도_콤보_옵션추가 = existing & "|" & optVal
End Function

Public Function 행정도_콤보_타입라벨(tp As String) As String
    Select Case tp
        Case "gubun": 행정도_콤보_타입라벨 = "구분"
        Case "gyuk":  행정도_콤보_타입라벨 = "규격"
        Case "chuga": 행정도_콤보_타입라벨 = "추가"
        Case Else:    행정도_콤보_타입라벨 = "선택"
    End Select
End Function

' 콤보 타입별 폭 — 규격·크기(size)는 0.5배로 좁게. owner 2026-06-10
Public Function 행정도_콤보_폭(tp As String) As Double
    Select Case tp
        Case "gyuk", "size": 행정도_콤보_폭 = ADMIN_COMBO_W * 0.5
        Case Else:           행정도_콤보_폭 = ADMIN_COMBO_W
    End Select
End Function

' 콤보 폭 — placeholder·옵션 중 가장 긴 글자에 맞춰 확장 (RN "1-2-8-4"·"(규격)" 잘림 방지). owner 2026-06-15
'   최소폭은 기존 행정도_콤보_폭(tp) 유지. 크기/굵기(size)는 고정(컴팩트 유지 — owner).
'   생성 loop 의 groupW·curX 전진과 행정도_콤보_하나생성 의 AddFormControl 이 같은 폭을 써야 겹침 없음.
Public Function 행정도_콤보_폭L(tp As String, optList As String) As Double
    Dim base As Double: base = 행정도_콤보_폭(tp)
    If tp = "size" Then 행정도_콤보_폭L = base: Exit Function
    Dim maxW As Double: maxW = 행정도_콤보_글자폭("(" & 행정도_콤보_타입라벨(tp) & ")")
    If Len(optList) > 0 Then
        Dim parts() As String: parts = Split(optList, "|")
        Dim i As Long
        For i = LBound(parts) To UBound(parts)
            Dim w As Double: w = 행정도_콤보_글자폭(parts(i))
            If w > maxW Then maxW = w
        Next i
    End If
    Dim need As Double: need = maxW + 20    ' 드롭다운 화살표 + 좌우 여백
    If need > base Then 행정도_콤보_폭L = need Else 행정도_콤보_폭L = base
End Function

' 문자열의 대략 픽셀폭 (콤보 폰트 기준) — 한글/전각은 넓게 계산. 잘림 방지 위해 약간 넉넉히. owner 2026-06-15
Public Function 행정도_콤보_글자폭(s As String) As Double
    Dim total As Double: total = 0
    Dim i As Long
    For i = 1 To Len(s)
        Dim c As Long: c = AscW(Mid(s, i, 1))
        If c < 0 Then c = c + 65536
        If c > 255 Then
            total = total + 9.5      ' 한글·전각
        Else
            total = total + 5.5      ' 숫자·영문·하이픈
        End If
    Next i
    행정도_콤보_글자폭 = total
End Function

' 행정도 1행 콤보·라벨·미리보기 일괄 제거 (PREFIX_ADMIN_COMBO 가 _LBL/_PV 포함 — 한 줄로 커버).
Public Sub 행정도_콤보_제거(ws As Worksheet)
    If ws Is Nothing Then Exit Sub
    Dim names As Collection: Set names = New Collection
    Dim sh As Shape
    For Each sh In ws.Shapes
        If Left(sh.Name, Len(PREFIX_ADMIN_COMBO)) = PREFIX_ADMIN_COMBO _
           Or Left(sh.Name, Len(PREFIX_ADMIN_SEARCH_BTN)) = PREFIX_ADMIN_SEARCH_BTN Then names.Add sh.Name
    Next sh
    Dim i As Long
    For i = 1 To names.Count
        On Error Resume Next: ws.Shapes(names(i)).Delete: On Error GoTo 0
    Next i
End Sub

' 기존 패널 콤보(4개)·라벨 숨김 — 새 콤보로 대체 (owner 결정).
Public Sub 행정도_패널콤보_숨김(ws As Worksheet)
    If ws Is Nothing Then Exit Sub
    Dim sh As Shape
    For Each sh In ws.Shapes
        Dim n As String: n = sh.Name
        If Left(n, Len(PANEL_LEGEND_DD_PREFIX)) = PANEL_LEGEND_DD_PREFIX _
           Or Left(n, Len(PANEL_LEGEND_DD_LABEL_PREFIX)) = PANEL_LEGEND_DD_LABEL_PREFIX Then
            On Error Resume Next: sh.Visible = msoFalse: On Error GoTo 0
        End If
    Next sh
End Sub

' 콤보 OnAction — 같은 명칭 콤보들 값으로 도형 특정 → 미리보기 + 그리기 모드.
Public Sub 행정도_콤보_변경()
    Dim ws As Worksheet: Set ws = ThisWorkbook.Worksheets(SHEET_ADMIN)
    Dim callerName As String: callerName = ""
    On Error Resume Next: callerName = Application.Caller: On Error GoTo 0
    If Len(callerName) = 0 Then Exit Sub
    Dim cb As Shape: Set cb = Nothing
    On Error Resume Next: Set cb = ws.Shapes(callerName): On Error GoTo 0
    If cb Is Nothing Then Exit Sub

    Dim alt As String: alt = ""
    On Error Resume Next: alt = cb.AlternativeText: On Error GoTo 0
    Dim 명칭 As String: 명칭 = 행정도_콤보_alt파싱(alt, "nm")
    If Len(명칭) = 0 Then Exit Sub

    ' 구분을 바꾸면 같은 명칭의 규격·추가 콤보를 그 구분 값만으로 재구성 (cascade). owner 2026-06-15
    '   기존엔 "명칭에 있는 모든 규격" 이 나왔음 — 구분 선택 시 그 구분에 해당하는 규격만 남도록.
    Dim callerTp As String: callerTp = 행정도_콤보_alt파싱(alt, "tp")
    If callerTp = "gubun" Then
        행정도_콤보_종속필터 ws, 명칭, 행정도_콤보_선택값(cb)
    End If

    ' 같은 명칭 콤보 수집 + 전체/선택 개수 (owner: 마지막 콤보까지 다 골라야 그리기)
    Dim selGubun As String, selGyuk As String, selChuga As String
    Dim selSize As String
    selGubun = "": selGyuk = "": selChuga = "": selSize = ""
    Dim totalCnt As Long: totalCnt = 0
    Dim selCnt As Long: selCnt = 0
    Dim sh As Shape
    For Each sh In ws.Shapes
        Dim n As String: n = sh.Name
        If Left(n, Len(PREFIX_ADMIN_COMBO)) <> PREFIX_ADMIN_COMBO Then GoTo NextSh
        If Left(n, Len(PREFIX_ADMIN_COMBO_LBL)) = PREFIX_ADMIN_COMBO_LBL Then GoTo NextSh
        If Left(n, Len(PREFIX_ADMIN_COMBO_PV)) = PREFIX_ADMIN_COMBO_PV Then GoTo NextSh
        Dim a2 As String: a2 = ""
        On Error Resume Next: a2 = sh.AlternativeText: On Error GoTo 0
        If 행정도_콤보_alt파싱(a2, "nm") <> 명칭 Then GoTo NextSh
        Dim tp As String: tp = 행정도_콤보_alt파싱(a2, "tp")
        Dim selV As String: selV = 행정도_콤보_선택값(sh)
        If tp = "size" Then
            selSize = selV   ' 크기/굵기 — 선택 필수 아님 (totalCnt 제외)
        Else
            totalCnt = totalCnt + 1
            If Len(selV) > 0 Then selCnt = selCnt + 1
            Select Case tp
                Case "gubun": selGubun = selV
                Case "gyuk":  selGyuk = selV
                Case "chuga": selChuga = selV
            End Select
        End If
NextSh:
    Next sh

    Dim shapeName As String
    shapeName = 행정도_콤보_도형찾기(명칭, selGubun, selGyuk, selChuga)

    ' 케이블 여부 — 명칭에 "케이블" 포함 (양식 스캔 isCable 과 동일 룰)
    Dim isCable As Boolean: isCable = (InStr(명칭, "케이블") > 0)

    ' 모든 콤보 선택 완료 + 도형 있을 때만 미리보기 + 그리기 (구분만 골라선 진입 안 함 — owner)
    If totalCnt > 0 And selCnt >= totalCnt And Len(shapeName) > 0 Then
        행정도_콤보_크기적용 shapeName, selSize, isCable   ' ⑤ 크기/굵기 → 양식 도형 AlternativeText (그리기 시점에 읽힘)
        Dim szTxt As String
        If Len(selSize) > 0 Then szTxt = " · " & IIf(isCable, "굵기 ", "크기 ") & selSize Else szTxt = ""
        행정도_콤보_미리보기 ws, shapeName, cb, isCable
        If isCable Then
            ' 케이블 = 선 그리기 (시설물 도형 X — owner)
            g_legendShape = shapeName
            ' 케이블 규격 = 선택한 규격만 (메타 spec 4번 컬럼 = 코어연결이 코어수 파싱 → 깨끗하게 유지). owner 2026-06-10
            '   규격 콤보 없으면 구분 폴백, 그것도 없으면 메타 구분(MetaLookupLabel).
            '   구분은 g_cableGubun 에 별도 보존 → 메타 7번 컬럼(기별명세서 추출용). 화면(선로ID) 표시는 안 바뀜.
            Dim cblSpec As String: cblSpec = selGyuk
            If Len(cblSpec) = 0 Then cblSpec = selGubun
            If Len(cblSpec) = 0 Then cblSpec = MetaLookupLabel(shapeName)
            g_cableSpec = cblSpec
            g_cableGubun = selGubun
            g_mode = "draw_cable"
            HighlightSelectedLegend shapeName
            UpdateModeIndicator
            BeginCableDraw shapeName
            Application.StatusBar = "[" & 명칭 & "]" & szTxt & " 케이블 — 시작 시설물에서 클릭 → 도착 시설물 더블클릭. ESC=종료."
        Else
            g_legendShape = shapeName
            g_legendLabel = MetaLookupLabel(shapeName)
            g_mode = "draw_facility"
            HighlightSelectedLegend shapeName
            UpdateModeIndicator
            BeginFacilityDraw shapeName
            Application.StatusBar = "[" & 명칭 & "]" & szTxt & " 그리기 — 행정도에 클릭/드래그로 배치. ESC=종료."
        End If
    Else
        행정도_콤보_미리보기 ws, "", cb, isCable   ' 미완료 — 미리보기 제거, 그리기 안 함
        Application.StatusBar = "[" & 명칭 & "] 나머지 콤보(규격 등)도 선택하면 그리기가 시작됩니다 (" & selCnt & "/" & totalCnt & ")."
    End If
End Sub

' 구분 선택 시 같은 명칭의 규격·추가 콤보를 그 구분 값만으로 재구성 (cascade). owner 2026-06-15
'   selGubun="" (placeholder 복귀) 이면 그 명칭 전체 규격·추가 복원.
'   _범례 셀은 양식_셀_텍스트 로 읽음 — 날짜화 트랩 회피 (행정도_콤보_생성·도형찾기 와 동일).
Public Sub 행정도_콤보_종속필터(ws As Worksheet, 명칭 As String, selGubun As String)
    If ws Is Nothing Then Exit Sub
    Dim wsMeta As Worksheet: Set wsMeta = Nothing
    On Error Resume Next: Set wsMeta = ThisWorkbook.Worksheets(SHEET_META_LEG): On Error GoTo 0
    If wsMeta Is Nothing Then Exit Sub

    Dim gyukList As String: gyukList = ""
    Dim chugaList As String: chugaList = ""
    Dim lastRow As Long: lastRow = wsMeta.Cells(wsMeta.Rows.Count, 1).End(xlUp).Row
    Dim r As Long
    For r = 2 To lastRow
        If CStr(wsMeta.Cells(r, 8).Value) <> "form" Then GoTo NextR
        If Trim(CStr(wsMeta.Cells(r, 9).Value)) <> 명칭 Then GoTo NextR
        Dim gb As String: gb = 양식_셀_텍스트(wsMeta.Cells(r, 3))
        If Len(selGubun) > 0 Then
            If gb <> selGubun Then GoTo NextR
        End If
        gyukList = 행정도_콤보_옵션추가(gyukList, 양식_셀_텍스트(wsMeta.Cells(r, 5)))
        chugaList = 행정도_콤보_옵션추가(chugaList, 양식_셀_텍스트(wsMeta.Cells(r, 6)))
NextR:
    Next r

    행정도_콤보_재옵션 ws, 명칭, "gyuk", gyukList
    행정도_콤보_재옵션 ws, 명칭, "chuga", chugaList
End Sub

' 명칭+tp 콤보를 찾아 옵션 재구성 (placeholder 유지, 선택은 placeholder 로 리셋). owner 2026-06-15
Public Sub 행정도_콤보_재옵션(ws As Worksheet, 명칭 As String, tp As String, optList As String)
    If ws Is Nothing Then Exit Sub
    Dim sh As Shape
    For Each sh In ws.Shapes
        Dim n As String: n = sh.Name
        If Left(n, Len(PREFIX_ADMIN_COMBO)) <> PREFIX_ADMIN_COMBO Then GoTo NextSh
        If Left(n, Len(PREFIX_ADMIN_COMBO_LBL)) = PREFIX_ADMIN_COMBO_LBL Then GoTo NextSh
        If Left(n, Len(PREFIX_ADMIN_COMBO_PV)) = PREFIX_ADMIN_COMBO_PV Then GoTo NextSh
        Dim a2 As String: a2 = ""
        On Error Resume Next: a2 = sh.AlternativeText: On Error GoTo 0
        If 행정도_콤보_alt파싱(a2, "nm") <> 명칭 Then GoTo NextSh
        If 행정도_콤보_alt파싱(a2, "tp") <> tp Then GoTo NextSh
        ' 일치하는 콤보 — 옵션 재구성
        On Error Resume Next
        sh.ControlFormat.RemoveAllItems
        sh.ControlFormat.AddItem "(" & 행정도_콤보_타입라벨(tp) & ")"
        Dim parts() As String
        If Len(optList) > 0 Then
            parts = Split(optList, "|")
            Dim i As Long
            For i = LBound(parts) To UBound(parts)
                If Len(parts(i)) > 0 Then sh.ControlFormat.AddItem parts(i)
            Next i
        End If
        sh.ControlFormat.Value = 1
        On Error GoTo 0
        Exit Sub   ' 명칭+tp 콤보는 하나뿐 — 찾으면 종료
NextSh:
    Next sh
End Sub

' AlternativeText "nm=..|tp=.." 파싱 (keyName: Key 예약어 회피)
Public Function 행정도_콤보_alt파싱(alt As String, keyName As String) As String
    행정도_콤보_alt파싱 = ""
    If Len(alt) = 0 Then Exit Function
    Dim parts() As String: parts = Split(alt, "|")
    Dim i As Long
    For i = LBound(parts) To UBound(parts)
        Dim kv As String: kv = parts(i)
        Dim eq As Long: eq = InStr(kv, "=")
        If eq > 0 Then
            If Left(kv, eq - 1) = keyName Then
                행정도_콤보_alt파싱 = Mid(kv, eq + 1)
                Exit Function
            End If
        End If
    Next i
End Function

' 콤보 현재 선택 텍스트 (placeholder=1 이면 빈 문자열).
Public Function 행정도_콤보_선택값(cb As Shape) As String
    행정도_콤보_선택값 = ""
    On Error Resume Next
    Dim idx As Long: idx = cb.ControlFormat.Value
    If idx >= 2 Then 행정도_콤보_선택값 = cb.ControlFormat.List(idx)
    On Error GoTo 0
End Function

' ⑤ 크기/굵기 콤보 선택값 → 양식 도형 AlternativeText 의 scale/weight 에 기록.
'   BeginFacilityDraw·FinalizeDrawnCable 이 그리기 시점에 범례_옵션_읽기 로 가져옴.
'   placeholder(selSize="") 이면 기본(시설물 100% · 케이블 +0t) 적용.
Public Sub 행정도_콤보_크기적용(shapeName As String, selSize As String, isCable As Boolean)
    If Len(shapeName) = 0 Then Exit Sub
    Dim wsForm As Worksheet: Set wsForm = Nothing
    On Error Resume Next: Set wsForm = ThisWorkbook.Worksheets(SHEET_LEGEND_FORM): On Error GoTo 0
    If wsForm Is Nothing Then Exit Sub
    Dim leg As Shape: Set leg = Nothing
    On Error Resume Next: Set leg = wsForm.Shapes(shapeName): On Error GoTo 0
    If leg Is Nothing Then Exit Sub
    Dim scalePct As Long, weightDelta As Double
    범례_옵션_읽기 leg, scalePct, weightDelta
    If isCable Then
        weightDelta = 행정도_콤보_굵기값(selSize)
    Else
        scalePct = 행정도_콤보_크기값(selSize)
    End If
    범례_옵션_쓰기 leg, scalePct, weightDelta
End Sub

' "100%"/"80%"/… → 크기%. 빈 값·해석 불가 = 기본 100.
Public Function 행정도_콤보_크기값(selSize As String) As Long
    행정도_콤보_크기값 = 100
    Dim s As String: s = Trim(Replace(selSize, "%", ""))
    If IsNumeric(s) Then 행정도_콤보_크기값 = CLng(s)
    If 행정도_콤보_크기값 <= 0 Then 행정도_콤보_크기값 = 100
End Function

' "+0.5t"/"+1t"/… → 굵기 가산 t. 빈 값·해석 불가 = 기본 0.
Public Function 행정도_콤보_굵기값(selSize As String) As Double
    행정도_콤보_굵기값 = 0
    Dim s As String: s = Replace(selSize, "t", "")
    s = Trim(Replace(s, "+", ""))
    If IsNumeric(s) Then 행정도_콤보_굵기값 = CDbl(s)
    If 행정도_콤보_굵기값 < 0 Then 행정도_콤보_굵기값 = 0
End Function

' 명칭+구분+규격+추가(선택된 것만)로 양식 도형 이름 특정. 더 많이 매칭하는 행 우선.
Public Function 행정도_콤보_도형찾기(명칭 As String, gb As String, gy As String, ch As String) As String
    행정도_콤보_도형찾기 = ""
    Dim wsMeta As Worksheet: Set wsMeta = Nothing
    On Error Resume Next: Set wsMeta = ThisWorkbook.Worksheets(SHEET_META_LEG): On Error GoTo 0
    If wsMeta Is Nothing Then Exit Function
    Dim lastRow As Long: lastRow = wsMeta.Cells(wsMeta.Rows.Count, 1).End(xlUp).Row
    Dim bestName As String: bestName = ""
    Dim bestScore As Long: bestScore = -1
    Dim r As Long
    For r = 2 To lastRow
        If CStr(wsMeta.Cells(r, 8).Value) <> "form" Then GoTo NextR
        If Trim(CStr(wsMeta.Cells(r, 9).Value)) <> 명칭 Then GoTo NextR
        Dim mGb As String: mGb = 양식_셀_텍스트(wsMeta.Cells(r, 3))
        Dim mGy As String: mGy = 양식_셀_텍스트(wsMeta.Cells(r, 5))   ' 규격 — 날짜 변환 복원
        Dim mCh As String: mCh = 양식_셀_텍스트(wsMeta.Cells(r, 6))
        Dim score As Long: score = 0
        If Len(gb) > 0 Then
            If mGb <> gb Then GoTo NextR
            score = score + 1
        End If
        If Len(gy) > 0 Then
            If mGy <> gy Then GoTo NextR
            score = score + 1
        End If
        If Len(ch) > 0 Then
            If mCh <> ch Then GoTo NextR
            score = score + 1
        End If
        If score > bestScore Then
            bestScore = score
            bestName = CStr(wsMeta.Cells(r, 1).Value)
        End If
NextR:
    Next r
    행정도_콤보_도형찾기 = bestName
End Function

' 선택 도형 미리보기 — 콤보 근처에 작게 복제.
Public Sub 행정도_콤보_미리보기(ws As Worksheet, shapeName As String, nearCombo As Shape, Optional isCable As Boolean = False)
    If ws Is Nothing Then Exit Sub
    Dim names As Collection: Set names = New Collection
    Dim s As Shape
    For Each s In ws.Shapes
        If Left(s.Name, Len(PREFIX_ADMIN_COMBO_PV)) = PREFIX_ADMIN_COMBO_PV Then names.Add s.Name
    Next s
    Dim i As Long
    For i = 1 To names.Count
        On Error Resume Next: ws.Shapes(names(i)).Delete: On Error GoTo 0
    Next i

    If Len(shapeName) = 0 Then Exit Sub   ' 미완료 — 미리보기 제거만

    Dim wsForm As Worksheet: Set wsForm = Nothing
    On Error Resume Next: Set wsForm = ThisWorkbook.Worksheets(SHEET_LEGEND_FORM): On Error GoTo 0
    If wsForm Is Nothing Then Exit Sub
    Dim leg As Shape: Set leg = Nothing
    On Error Resume Next: Set leg = wsForm.Shapes(shapeName): On Error GoTo 0
    If leg Is Nothing Then Exit Sub

    ' 콤보 '아래'에 미리보기 (옆에 두면 다음 콤보 가림 — owner 2026-06-10)
    Dim pvX As Double, pvY As Double
    pvX = nearCombo.Left
    pvY = nearCombo.Top + nearCombo.Height + 3
    Dim pv As Shape: Set pv = Nothing
    If isCable Then
        ' 케이블 = 가로 직선 직접 (CloneLegendShape 는 양식 선 방향대로 복제해 대각선 — owner)
        Dim legLn As Shape: Set legLn = leg
        On Error Resume Next
        If leg.Type = msoGroup Then
            Dim gi2 As Long
            For gi2 = 1 To leg.GroupItems.Count
                If leg.GroupItems(gi2).Type = msoLine Or leg.GroupItems(gi2).Type = msoFreeform Then
                    Set legLn = leg.GroupItems(gi2): Exit For
                End If
            Next gi2
        End If
        On Error GoTo 0
        Dim pcolor As Long: pcolor = RGB(0, 0, 0)
        Dim pdash As Long: pdash = msoLineSolid
        Dim pwt As Double: pwt = 1.5
        On Error Resume Next
        pcolor = legLn.Line.ForeColor.RGB
        pdash = legLn.Line.DashStyle
        If legLn.Line.Weight > 0 Then pwt = legLn.Line.Weight
        Set pv = ws.Shapes.AddLine(pvX, pvY + 3, pvX + 28, pvY + 3)   ' 가로 직선 (작게)
        pv.Line.ForeColor.RGB = pcolor
        pv.Line.DashStyle = pdash
        pv.Line.Weight = pwt
        On Error GoTo 0
    Else
        On Error Resume Next: Set pv = CloneLegendShape(leg, ws, pvX, pvY, 16, 16, ""): On Error GoTo 0
    End If
    If Not pv Is Nothing Then
        pv.Name = PREFIX_ADMIN_COMBO_PV & "0"
        On Error Resume Next
        pv.OnAction = ""
        pv.Locked = True
        pv.Placement = 3
        On Error GoTo 0
    End If
End Sub

Public Function CloneLegendShape(leg As Shape, target As Worksheet, _
                                 ptLeft As Double, ptTop As Double, _
                                 w As Double, h As Double, _
                                 label As String, Optional forceType As Long = 0) As Shape
    ' owner 2026-06-09 (8-125-fix13): Copy/Paste 를 단일·그룹 모두에 적용 — 텍스트 색·폰트·테마 보존.
    '   그룹은 옛 동작 유지 (크기 보존, 위치만), 단일은 사용자 드래그 크기 적용.
    If forceType = 0 And Not leg Is Nothing Then
        Dim pasted As Shape: Set pasted = Nothing
        ' owner 2026-06-10 (8-125-fix25): pasted 정확 추적 — Shapes.Count 는 네트웍의 폼컨트롤(태그콤보)·
        '   부속 도형이 섞이면 Paste된 도형이 아닌 엉뚱한 도형을 가리킴. 진단 증거: Type=8 폼컨트롤이
        '   시설물 이름(fac_)을 받고, 진짜 Paste된 시설물은 legend_fac_ 이름+OnAction 그대로 잔존.
        '   → Paste 전 이름 집합 기록 → Paste 후 새 이름 도형을 진짜 pasted 로 탐지.
        Dim beforePaste As Object: Set beforePaste = CreateObject("Scripting.Dictionary")
        Dim bsx As Shape
        On Error Resume Next
        For Each bsx In target.Shapes
            beforePaste(bsx.Name) = True
        Next bsx
        leg.Copy
        target.Paste
        Dim bsy As Shape
        For Each bsy In target.Shapes
            If Not beforePaste.Exists(bsy.Name) Then Set pasted = bsy: Exit For
        Next bsy
        On Error GoTo 0
        If Not pasted Is Nothing Then
            Dim isGroup As Boolean: isGroup = False
            On Error Resume Next: isGroup = (pasted.Type = msoGroup): On Error GoTo 0

            ' owner 2026-06-10 (8-125-fix23): 근본 수정 — 복제 시점 OnAction·Hyperlink 완전 재귀 제거.
            '   옛 인라인(fix14)은 1레벨 그룹 자식까지만 + Hyperlink 누락 → 중첩 그룹·Hyperlink 도형
            '   (RN 등)이 핸들러 품고 복제 → 네트웍 클릭 시 화면전환(그리기 모드). 진원지.
            '   완전판 ClearShapeOnActionRecursive 로 부모+모든 자식·손자 OnAction·Hyperlink 차단.
            '   → 새로 그리는 모든 시설물이 처음부터 핸들러 없이 태어남 (사후 청소 불필요).
            Dim clrDiag As String: clrDiag = ""
            ClearShapeOnActionRecursive pasted, clrDiag

            On Error Resume Next
            pasted.Left = ptLeft
            pasted.Top = ptTop
            If Not isGroup Then
                pasted.Width = w
                pasted.Height = h
            End If
            On Error GoTo 0

            Dim pasteText As String: pasteText = ""
            On Error Resume Next: pasteText = pasted.TextFrame2.TextRange.Text: On Error GoTo 0
            If Len(pasteText) = 0 And Len(label) > 0 Then
                On Error Resume Next
                pasted.TextFrame2.TextRange.Text = label
                On Error GoTo 0
            End If

            Set CloneLegendShape = pasted
            Exit Function
        End If
    End If

    Dim shp As Shape
    Dim ast As Long: ast = msoShapeRectangle
    If forceType <> 0 Then
        ast = forceType
    ElseIf Not leg Is Nothing Then
        On Error Resume Next
        ast = leg.AutoShapeType
        On Error GoTo 0
        If ast = 0 Then ast = msoShapeRectangle
    End If

    Set shp = target.Shapes.AddShape(ast, ptLeft, ptTop, w, h)

    On Error Resume Next
    If Not leg Is Nothing Then
        ' 채우기 · 선
        shp.Fill.ForeColor.RGB = leg.Fill.ForeColor.RGB
        shp.Line.ForeColor.RGB = leg.Line.ForeColor.RGB
        shp.Line.Weight = leg.Line.Weight

        ' owner 2026-06-08 (8-124-fix6): 텍스트 속성 광범위 복제 — 글자색·크기·정렬 등.
        ' TextFrame2 레벨 — 가로/세로 앵커, 여백, WordWrap
        shp.TextFrame2.HorizontalAnchor = leg.TextFrame2.HorizontalAnchor
        shp.TextFrame2.VerticalAnchor = leg.TextFrame2.VerticalAnchor
        shp.TextFrame2.MarginLeft = leg.TextFrame2.MarginLeft
        shp.TextFrame2.MarginRight = leg.TextFrame2.MarginRight
        shp.TextFrame2.MarginTop = leg.TextFrame2.MarginTop
        shp.TextFrame2.MarginBottom = leg.TextFrame2.MarginBottom
        shp.TextFrame2.WordWrap = leg.TextFrame2.WordWrap
        shp.TextFrame2.AutoSize = leg.TextFrame2.AutoSize
    End If

    ' owner 2026-06-08 (8-124-fix13): 텍스트 먼저 설정 후 폰트 속성 적용.
    '   폰트 속성 먼저 + 그 다음 Text 설정 → Text 설정이 폰트 default 로 리셋함 (R 글자 흰색·얇게 원인).
    '   순서 변경: Text → Font.* → ParagraphFormat
    Dim legText As String: legText = ""
    If Not leg Is Nothing Then
        On Error Resume Next: legText = leg.TextFrame2.TextRange.Text: On Error GoTo 0
    End If
    On Error Resume Next
    If Len(legText) > 0 Then
        shp.TextFrame2.TextRange.Text = legText
    Else
        shp.TextFrame2.TextRange.Text = label
    End If

    If Not leg Is Nothing Then
        ' 폰트 — 이름·크기·굵게·기울임·밑줄 (Text 설정 후 적용)
        shp.TextFrame2.TextRange.Font.Name = leg.TextFrame2.TextRange.Font.Name
        shp.TextFrame2.TextRange.Font.Size = leg.TextFrame2.TextRange.Font.Size
        shp.TextFrame2.TextRange.Font.Bold = leg.TextFrame2.TextRange.Font.Bold
        shp.TextFrame2.TextRange.Font.Italic = leg.TextFrame2.TextRange.Font.Italic
        shp.TextFrame2.TextRange.Font.UnderlineStyle = leg.TextFrame2.TextRange.Font.UnderlineStyle

        ' 폰트 색상 — Fill.Visible/Solid 강제 후 RGB
        shp.TextFrame2.TextRange.Font.Fill.Visible = msoTrue
        shp.TextFrame2.TextRange.Font.Fill.Solid
        shp.TextFrame2.TextRange.Font.Fill.ForeColor.RGB = _
            leg.TextFrame2.TextRange.Font.Fill.ForeColor.RGB
        shp.TextFrame2.TextRange.Font.Fill.Transparency = _
            leg.TextFrame2.TextRange.Font.Fill.Transparency

        ' 단락 정렬
        shp.TextFrame2.TextRange.ParagraphFormat.Alignment = _
            leg.TextFrame2.TextRange.ParagraphFormat.Alignment
    End If
    On Error GoTo 0

    Set CloneLegendShape = shp
End Function

' 시설물 종류(라벨) → 접속함체류인지 판별. 0 이 아니면 접속함체(⊗) 로 그림.
'   (이 엑셀은 순서도 가산접합 preset 을 사각형으로 그려서, ⊗ 는 BuildClosureSymbol 로 직접 조합)
Public Function FacilityForceShapeType(kind As String) As Long
    If InStr(kind, "함체") > 0 Or InStr(kind, "접속") > 0 Then
        FacilityForceShapeType = 1     ' 접속함체 표시(값 자체는 의미 없음, 0/비0 플래그)
    Else
        FacilityForceShapeType = 0
    End If
End Function

' ⊗(원 안에 X) 를 「원 1개 + 가운데 ✕ 글자」 단일 도형으로 생성 → 도형 1개 반환.
'   - 순서도 가산접합 preset 은 이 엑셀에서 사각형으로 나오고(owner 확인),
'     원+선 그룹은 그리기 자동감지(OnTime 콜백) 안에서 그룹화가 실패해 아무것도 안 그려짐.
'   → 그룹 없이 원 하나에 ✕ 를 큰 글자로 넣어 ⊗ 모양. 클론·이동·삭제·연결 모두 단일 도형이라 안전.
Public Function BuildClosureSymbol(target As Worksheet, l As Double, t As Double, _
                                   w As Double, h As Double, _
                                   fillColor As Long, lineColor As Long) As Shape
    Dim s As Shape
    Set s = target.Shapes.AddShape(msoShapeOval, l, t, w, h)   ' 9 = 원 (기본 도형, 확실히 그려짐)
    On Error Resume Next
    s.Fill.Visible = msoTrue
    s.Fill.ForeColor.RGB = fillColor
    s.Line.ForeColor.RGB = lineColor
    s.Line.Weight = 2
    With s.TextFrame2
        .WordWrap = msoFalse
        .AutoSize = msoAutoSizeNone
        .VerticalAnchor = msoAnchorMiddle
        .MarginLeft = 0: .MarginRight = 0: .MarginTop = 0: .MarginBottom = 0
        .TextRange.Text = "X"                        ' ASCII X — 특수문자(✕)는 폰트·복붙에서 ? 로 깨짐
        .TextRange.Font.Name = CALLOUT_FONT_NAME
        .TextRange.Font.Size = CSng(h * 0.6)         ' 원 크기에 비례한 큰 X
        .TextRange.Font.Bold = True
        .TextRange.Font.Fill.ForeColor.RGB = lineColor
        .TextRange.ParagraphFormat.Alignment = 2     ' 가로 가운데
    End With
    On Error GoTo 0
    Set BuildClosureSymbol = s
End Function

' ----------------------------------------------------------------------------
'  시설물 설명선 — 사각형 박스 + 시설물에 「연결된」 커넥터(연결선). 행정도·네트웍 공용.
'   - owner 선택(박스+연결선): 네이티브 설명선:선 은 연결점이 없어 함체에 안 붙음 →
'     커넥터의 BeginConnect(시설물)/EndConnect(박스) 로 진짜 연결. 함체 이동 시 선 자동 추종.
'   - 박스 AutoSize=ShapeToFitText → 글자 크기·줄 수에 비례해 크기 자동.
'   - Locked=False → 시트 보호 상태에서도 더블클릭해 「ID/함체명/구분」 직접 입력.
' ----------------------------------------------------------------------------
Public Sub AddFacilityCallout(ws As Worksheet, fac As Shape, facId As String, Optional labelText As String = "", Optional legendLabel As String = "")
    ' 이미 있으면 중복 생성 안 함
    Dim existing As Shape
    On Error Resume Next
    Set existing = ws.Shapes(PREFIX_LABEL & facId)
    On Error GoTo 0
    If Not existing Is Nothing Then Exit Sub

    On Error GoTo CalloutErr

    Dim bw As Double: bw = LABEL_W
    Dim bh As Double: bh = LABEL_H
    ' owner 요구 — callout 초기 위치
    '   행정도 = 시설물 위 바로 (owner 2026-06-08 8-86 정정 — 기존 3행 위 떨어진 거 → 바로 위 gap 0)
    '            라벨 가로 중앙 = 시설물 가로 중앙 정렬, 라벨 바닥 = 시설물 위 바로
    '   네트웍구성도 = 시설물 좌측 바로위 (owner 2026-06-07 8-70 → 8-74 정정)
    '                  라벨 좌측 = 시설물 좌측 정렬, 라벨 바닥 = 시설물 위 바로 (gap 0)
    Dim bx As Double, byy As Double
    If ws.Name = SHEET_NETWORK Then
        bx = fac.Left
        byy = fac.Top - bh
    Else
        bx = fac.Left + (fac.Width - bw) / 2
        byy = fac.Top - bh
    End If
    Dim topLimit As Double: topLimit = ws.Cells(LEGEND_ROWS + 1, 1).Top
    If byy < topLimit Then byy = topLimit

    ' 「신설」 라벨이면 박스 윤곽선·글자·leader 모두 빨강
    Dim isNew As Boolean: isNew = IsNewLegendLabel(legendLabel)
    Dim lineColor As Long: lineColor = IIf(isNew, RGB(220, 38, 38), RGB(100, 116, 139))
    Dim textColor As Long: textColor = IIf(isNew, RGB(220, 38, 38), RGB(15, 23, 42))

    ' 설명선 박스 = 사각형 (글자 크기 비례 AutoSize)
    Dim tb As Shape
    Set tb = ws.Shapes.AddShape(msoShapeRectangle, bx, byy, bw, bh)
    tb.Name = PREFIX_LABEL & facId
    tb.Placement = 3
    tb.Locked = False
    tb.Fill.Visible = msoTrue
    tb.Fill.ForeColor.RGB = RGB(255, 255, 255)
    tb.Line.Visible = msoTrue
    tb.Line.ForeColor.RGB = lineColor
    tb.Line.Weight = 0.75                            ' 윤곽선 두께 3/4t (신설·기설 통일)

    ' owner 2026-06-08 (8-104): 시설물 설명선 좌우 여백 0.1cm (행정도·네트웍 양 시트 통일).
    Dim CALLOUT_LR_MARGIN_PT As Single
    CALLOUT_LR_MARGIN_PT = Application.CentimetersToPoints(0.1)

    On Error Resume Next
    With tb.TextFrame2
        .WordWrap = msoFalse
        .AutoSize = msoAutoSizeShapeToFitText        ' 글자 크기·양에 맞춰 박스 자동 조정
        .VerticalAnchor = msoAnchorMiddle
        .MarginLeft = CALLOUT_LR_MARGIN_PT: .MarginRight = CALLOUT_LR_MARGIN_PT: .MarginTop = 0: .MarginBottom = 0
        .TextRange.Text = labelText
        .TextRange.Font.Name = CALLOUT_FONT_NAME    ' LG스마트체 Regular
        .TextRange.Font.Size = 7                     ' 시설물 설명선 글자 (행정도·네트웍 통일, owner 요구)
        .TextRange.Font.Bold = True                  ' 굵게
        .TextRange.Font.Fill.ForeColor.RGB = textColor
        .TextRange.ParagraphFormat.Alignment = 2
    End With
    On Error GoTo CalloutErr

    ' 연결선(커넥터) — 시설물 ↔ 박스. owner 요구: 연청색 0.5pt, 가시화.
    '   부착점: 시설물이 박스 왼쪽이면 박스 좌측 모서리, 오른쪽이면 박스 우측 모서리.
    '   owner 환경에서 connection site 인덱스가 문서 표준(1=Top/2=Right/3=Bottom/4=Left)과 달라
    '   site 2 가 좌측, site 4 가 우측 — 시설물_leader_site설정 헬퍼로 일원화.
    Dim cn As Shape
    Set cn = ws.Shapes.AddConnector(msoConnectorStraight, fac.Left, fac.Top, tb.Left, tb.Top)
    cn.Name = PREFIX_LEADER & facId
    cn.Placement = 3
    cn.Locked = False
    ' owner 2026-06-12: 투명 꼬리가 빈셀·다른 시설물 클릭 시 잡히는 문제 — OnAction(빈 매크로) 으로
    '   클릭 시 선택 차단. leader 는 자동 재라우팅이라 사용자가 직접 선택할 일 없음.
    cn.OnAction = "리더_클릭_무시"
    cn.Line.Weight = 0.5
    ' owner 재요청 — leader 투명 (보이지 않음, 도형은 살아있어 콜아웃 위치 동기화는 유지)
    On Error Resume Next
    cn.Line.Visible = msoFalse
    cn.Line.Transparency = 1
    On Error GoTo 0
    시설물_leader_site설정 cn, fac, tb

    ' 겹침 회피 — 행정도는 시설물·케이블·설명박스 모두 피해 접점 가장 가까운 방향 (owner 2026-06-10),
    '   네트웍은 기존 (설명박스끼리만 회피 — 격자 기반이라 기존 규칙 유지).
    If ws.Name = SHEET_NETWORK Then
        callout_겹침회피 ws, tb, tb.Name
    Else
        설명박스_최적배치 ws, tb, fac.Left + fac.Width / 2, fac.Top + fac.Height / 2, tb.Name
    End If
    Exit Sub

CalloutErr:
    ' 설명선 부착 실패는 시설물 배치 자체를 막지 않음 (조용히 통과)
End Sub

' 케이블(자유형·polyline·connector) 의 「중앙점」 (x, y) 반환.
'   arc-length 기반 — 전체 거리의 정확한 중간점 (waypoints 모두 반영). 노드 2개도 정확 중간
'   노드 없으면 bbox 중심 fallback
Public Function CableCenterPoint(cbl As Shape) As Variant
    Dim mx As Double, my As Double, got As Boolean
    Dim ncx As Long: ncx = 0
    On Error Resume Next
    ncx = cbl.Nodes.Count
    On Error GoTo 0

    If ncx >= 2 Then
        ' 모든 노드 좌표 수집
        Dim pts() As Double: ReDim pts(1 To ncx, 1 To 2)
        Dim i As Long
        For i = 1 To ncx
            Dim p As Variant
            On Error Resume Next
            p = cbl.Nodes(i).Points
            On Error GoTo 0
            If IsArray(p) Then
                pts(i, 1) = CDbl(p(1, 1))
                pts(i, 2) = CDbl(p(1, 2))
            End If
        Next i

        ' segment 별 거리 + 총 거리
        Dim total As Double: total = 0
        Dim segLen() As Double: ReDim segLen(1 To ncx - 1)
        For i = 1 To ncx - 1
            Dim dx As Double, dy As Double
            dx = pts(i + 1, 1) - pts(i, 1)
            dy = pts(i + 1, 2) - pts(i, 2)
            segLen(i) = Sqr(dx * dx + dy * dy)
            total = total + segLen(i)
        Next i

        If total > 0 Then
            ' arc-length 50% 지점 = 누적 거리가 half 에 도달한 segment 안 비율 보간
            Dim half As Double: half = total / 2
            Dim acc As Double: acc = 0
            For i = 1 To ncx - 1
                If acc + segLen(i) >= half Then
                    Dim ratio As Double
                    If segLen(i) > 0 Then ratio = (half - acc) / segLen(i) Else ratio = 0
                    mx = pts(i, 1) + (pts(i + 1, 1) - pts(i, 1)) * ratio
                    my = pts(i, 2) + (pts(i + 1, 2) - pts(i, 2)) * ratio
                    got = True
                    Exit For
                End If
                acc = acc + segLen(i)
            Next i
        End If
    End If

    If Not got Then
        mx = cbl.Left + cbl.Width / 2
        my = cbl.Top + cbl.Height / 2
    End If
    CableCenterPoint = Array(mx, my)
End Function

' 네트웍구성도 시트의 모든 케이블 텍스트박스 위치를 케이블 중앙으로 재동기화.
' ============================================================================
'  시설물 번호 배지 — 우상단 빨간 사각형 + 흰 글자. 양 시트(행정도·네트웍구성도) 모두.
'    - 시설물 신규 생성 시 자동 부여 (NextBadgeNo = 메타 최대값 + 1)
'    - 사용자가 배지 텍스트 직접 수정 가능 → 「정보 동기화」 가 양 시트 일치 + 메타 갱신 + 중복 안내
'    - 배지를 비워도 자동 재부여 안 함 (owner 의도: 공란 보존)
'    - 시설물 이동 시 셀 클릭 이벤트에서 배지 위치 자동 따라감
' ============================================================================
' 메타에서 사용 중인 모든 badge_no 중 최대값 + 1
'   메타 잔재(시설물 도형 없는 facId) 영향 차단 — 실제 시설물 있는 row 만 max 계산
Public Function NextBadgeNo() As Long
    Dim ws As Worksheet
    On Error Resume Next
    Set ws = ThisWorkbook.Worksheets(SHEET_META_FAC)
    On Error GoTo 0
    If ws Is Nothing Then NextBadgeNo = 1: Exit Function

    ' 행정도 시설물 도형 facId 모음 (잔재 row 무시용)
    Dim adFacIds As Object: Set adFacIds = CreateObject("Scripting.Dictionary")
    Dim wsAd As Worksheet
    On Error Resume Next
    Set wsAd = ThisWorkbook.Worksheets(SHEET_ADMIN)
    On Error GoTo 0
    If Not wsAd Is Nothing Then
        Dim sh As Shape
        For Each sh In wsAd.Shapes
            If Left(sh.Name, Len(PREFIX_FAC)) = PREFIX_FAC Then adFacIds(sh.Name) = True
        Next sh
    End If

    Dim last As Long: last = ws.Cells(ws.Rows.Count, 1).End(xlUp).Row
    Dim r As Long, n As Long, maxNo As Long: maxNo = 0
    Dim fId As String
    For r = 2 To last
        fId = CStr(ws.Cells(r, 1).Value)
        ' 시설물 도형이 실제로 있는 row 만 (잔재 무시)
        If Len(fId) > 0 And adFacIds.Exists(fId) Then
            n = 0
            On Error Resume Next
            n = CLng(ws.Cells(r, 5).Value)
            On Error GoTo 0
            If n > maxNo Then maxNo = n
        End If
    Next r

    ' owner 2026-06-08 (8-110): 메타에 row 없는 시설물 (또는 badge_no 미저장 시설물) 의 배지 중복 차단.
    '   실제 시트의 badge_* 도형 텍스트도 max 후보로 — 메타 무관하게 진짜 사용 중인 번호 반영.
    '   증상: 배지_추가 시 NextBadgeNo() 가 메타 max(=0) 만 보고 항상 1 반환 → 여러 시설물 모두 "1".
    Dim wsNw As Worksheet
    On Error Resume Next: Set wsNw = ThisWorkbook.Worksheets(SHEET_NETWORK): On Error GoTo 0
    Dim wsList(0 To 1) As Worksheet
    Set wsList(0) = wsAd: Set wsList(1) = wsNw
    Dim si As Long, shp As Shape
    For si = 0 To 1
        If Not wsList(si) Is Nothing Then
            For Each shp In wsList(si).Shapes
                If Left(shp.Name, Len(PREFIX_BADGE)) = PREFIX_BADGE Then
                    Dim t As String: t = ""
                    On Error Resume Next: t = shp.TextFrame2.TextRange.Text: On Error GoTo 0
                    Dim shN As Long: shN = 0
                    On Error Resume Next: shN = CLng(Trim(t)): On Error GoTo 0
                    If shN > maxNo Then maxNo = shN
                End If
            Next shp
        End If
    Next si

    NextBadgeNo = maxNo + 1
End Function

' 메타 5번째 컬럼 (badge_no) 조회
Public Function MetaLookupBadgeNo(facId As String) As String
    Dim row As Variant: row = MetaFindRow(SHEET_META_FAC, 1, facId)
    If Not IsEmpty(row) Then
        If UBound(row) >= 5 Then MetaLookupBadgeNo = CStr(row(5))
    End If
End Function

' 메타 5번째 컬럼 (badge_no) 갱신 — 「정보 동기화」 에서 사용자가 배지 텍스트 변경 시 호출
Public Sub MetaUpdateBadgeNo(facId As String, newVal As String)
    Dim ws As Worksheet
    On Error Resume Next
    Set ws = ThisWorkbook.Worksheets(SHEET_META_FAC)
    On Error GoTo 0
    If ws Is Nothing Then Exit Sub
    Dim last As Long: last = ws.Cells(ws.Rows.Count, 1).End(xlUp).Row
    Dim r As Long
    For r = 2 To last
        If CStr(ws.Cells(r, 1).Value) = facId Then
            ws.Cells(r, 5).Value = newVal
            Exit Sub
        End If
    Next r
End Sub

' 설명선(callout) 좌상단에 노란 번호 배지 추가 (이미 있으면 위치만 갱신).
'   배지는 callout 안쪽 좌상단에 딱 붙음. callout 없으면 시설물 좌상단 fallback.
'   callout 이 AddBadge 호출 시점에 아직 없을 수 있어 (FinalizeDrawnFacility 의 행정도 흐름) → 배지_위치_동기화 가 추후 재정렬
Public Sub AddBadge(ws As Worksheet, fac As Shape, facId As String, badgeText As String)
    ' owner 2026-06-09 (8-125-fix13): 8-121 폐기 → 옛 동작 복원. 배지 anchor = 설명선(callout) 우선, 없으면 시설물.
    Dim anchor As Shape
    On Error Resume Next
    Set anchor = ws.Shapes(PREFIX_LABEL & facId)
    On Error GoTo 0
    If anchor Is Nothing Then Set anchor = fac

    Dim bx As Double, by As Double
    bx = anchor.Left
    by = anchor.Top

    Dim existing As Shape
    On Error Resume Next
    Set existing = ws.Shapes(PREFIX_BADGE & facId)
    On Error GoTo 0
    If Not existing Is Nothing Then
        On Error Resume Next
        existing.Left = bx: existing.Top = by
        existing.ZOrder msoBringToFront
        On Error GoTo 0
        Exit Sub
    End If

    ' 시트별 스펙 분기: 행정도 = 파랑 + 폰트 11 + AutoSize, 네트웍 = 청록 38×38 + 폰트 22 + 고정
    Dim isAdmin As Boolean: isAdmin = (ws.Name = SHEET_ADMIN)
    Dim fillC As Long, textC As Long, fontSz As Single, autoSz As Long
    If isAdmin Then
        fillC = BADGE_FILL_COLOR_ADMIN
        textC = BADGE_TEXT_COLOR_ADMIN
        fontSz = BADGE_FONT_SIZE_ADMIN
        autoSz = msoAutoSizeShapeToFitText    ' 글자 크기에 맞춰 박스 자동
    Else
        fillC = BADGE_FILL_COLOR
        textC = BADGE_TEXT_COLOR
        fontSz = BADGE_FONT_SIZE_NETWORK
        autoSz = msoAutoSizeNone               ' 네트웍은 고정 크기 (상태박스 따라 후속 조정)
    End If

    On Error GoTo BadgeErr
    Dim bd As Shape
    Set bd = ws.Shapes.AddShape(msoShapeRectangle, bx, by, BADGE_W, BADGE_H)
    bd.Name = PREFIX_BADGE & facId
    bd.Placement = 3
    bd.Locked = False
    bd.Fill.Visible = msoTrue
    bd.Fill.ForeColor.RGB = fillC
    bd.Line.Visible = msoFalse
    On Error Resume Next
    With bd.TextFrame2
        .WordWrap = msoFalse
        .AutoSize = autoSz
        .VerticalAnchor = msoAnchorMiddle
        .MarginLeft = 0: .MarginRight = 0: .MarginTop = 0: .MarginBottom = 0
        .TextRange.Text = badgeText
        .TextRange.Font.Name = CALLOUT_FONT_NAME    ' LG스마트체 Regular
        .TextRange.Font.Size = fontSz
        .TextRange.Font.Bold = True
        .TextRange.Font.Fill.ForeColor.RGB = textC
        .TextRange.ParagraphFormat.Alignment = 2     ' centered
    End With
    bd.ZOrder msoBringToFront
    On Error GoTo 0
    Exit Sub
BadgeErr:
End Sub

' owner 2026-06-08 (8-103): 선택 도형에서 facId 추출 — fac_/badge_/lbl_fac_ 어느쪽이든 받아냄.
'   설명선 (lbl_cbl_*) 은 케이블용이라 제외.
' owner 2026-06-08 (8-106): 도형 1개 선택 시 TypeName(Selection) 은 그 도형의 type ("Rectangle"/"Picture"/
'   "Group" 등) 이지 "ShapeRange" 가 아님. 기존 설명선_일괄적용 패턴대로 sel.Name 직접 사용.
Public Function 선택_시설물ID추출() As String
    선택_시설물ID추출 = ""
    Dim sel As Object
    On Error Resume Next: Set sel = Application.Selection: On Error GoTo 0
    If sel Is Nothing Then Exit Function
    If TypeName(sel) = "Range" Then Exit Function    ' 셀 선택 — 도형 아님

    Dim selName As String: selName = ""
    On Error Resume Next: selName = sel.Name: On Error GoTo 0
    If Len(selName) = 0 Then Exit Function

    Dim nm As String: nm = selName
    If Left(nm, Len(PREFIX_FAC)) = PREFIX_FAC Then
        선택_시설물ID추출 = nm
    ElseIf Left(nm, Len(PREFIX_BADGE)) = PREFIX_BADGE Then
        선택_시설물ID추출 = Mid(nm, Len(PREFIX_BADGE) + 1)
    ElseIf Left(nm, Len(PREFIX_LABEL)) = PREFIX_LABEL Then
        ' lbl_fac_* 만 — lbl_cbl_* 은 케이블이라 제외
        Dim rest As String: rest = Mid(nm, Len(PREFIX_LABEL) + 1)
        If Left(rest, Len(PREFIX_FAC)) = PREFIX_FAC Then 선택_시설물ID추출 = rest
    End If
End Function

' owner 2026-06-08 (8-103): 양 시트의 시설물 배지를 일괄 삭제. 메타의 badge_no 는 보존
'   (재추가 시 같은 번호 사용). 도형만 제거.
Public Sub 배지_삭제()
    Dim facId As String: facId = 선택_시설물ID추출()
    If Len(facId) = 0 Then
        MsgBox "시설물 (또는 그 포인트 번호·설명선) 을 먼저 선택하세요.", vbInformation, "포인트 번호 삭제"
        Exit Sub
    End If

    Dim wsAd As Worksheet, wsNw As Worksheet
    On Error Resume Next
    Set wsAd = ThisWorkbook.Worksheets(SHEET_ADMIN)
    Set wsNw = ThisWorkbook.Worksheets(SHEET_NETWORK)
    On Error GoTo 0

    Dim removed As Long: removed = 0
    Dim wsList(0 To 1) As Worksheet
    Set wsList(0) = wsAd: Set wsList(1) = wsNw
    Dim si As Long
    For si = 0 To 1
        Dim ws As Worksheet: Set ws = wsList(si)
        If Not ws Is Nothing Then
            Dim wasProt As Boolean: wasProt = ws.ProtectContents Or ws.ProtectDrawingObjects
            On Error Resume Next: ws.Unprotect: On Error GoTo 0
            Dim bd As Shape: Set bd = Nothing
            On Error Resume Next: Set bd = ws.Shapes(PREFIX_BADGE & facId): On Error GoTo 0
            If Not bd Is Nothing Then
                On Error Resume Next
                bd.Delete
                On Error GoTo 0
                removed = removed + 1
            End If
            If wasProt Then ApplySheetProtection ws
        End If
    Next si

    If removed > 0 Then
        Application.StatusBar = "시설물 포인트 번호 삭제 — " & removed & " 개 (양 시트). 메타 badge_no 보존."
    Else
        Application.StatusBar = "삭제할 포인트 번호 없음 (이미 삭제된 상태)."
    End If
End Sub

' owner 2026-06-08 (8-103 → 8-111): 양 시트의 시설물 포인트 번호를 추가/재발급.
'   8-111: 메타 무관하게 항상 NextBadgeNo() 로 새 번호 발급 + 기존 도형 텍스트 강제 갱신.
'   기존 흐름 (메타 lookup 우선) 은 메타에 잘못 저장된 중복 번호를 그대로 사용 → 중복 미해결.
'   또한 AddBadge 가 기존 도형 텍스트 갱신 안 함 → 텍스트 강제 갱신 추가.
Public Sub 배지_추가()
    Dim facId As String: facId = 선택_시설물ID추출()
    If Len(facId) = 0 Then
        MsgBox "시설물 (또는 그 설명선) 을 먼저 선택하세요.", vbInformation, "포인트 번호 추가"
        Exit Sub
    End If

    ' owner 2026-06-08 (8-111): 항상 새 번호 발급 — 중복 방지.
    Dim badgeText As String: badgeText = CStr(NextBadgeNo())
    MetaUpdateBadgeNo facId, badgeText    ' row 있으면 갱신, 없으면 no-op (메타엔 보존만)

    Dim wsAd As Worksheet, wsNw As Worksheet
    On Error Resume Next
    Set wsAd = ThisWorkbook.Worksheets(SHEET_ADMIN)
    Set wsNw = ThisWorkbook.Worksheets(SHEET_NETWORK)
    On Error GoTo 0

    Dim added As Long: added = 0
    Dim updatedTxt As Long: updatedTxt = 0
    Dim wsList(0 To 1) As Worksheet
    Set wsList(0) = wsAd: Set wsList(1) = wsNw
    Dim si As Long
    For si = 0 To 1
        Dim ws As Worksheet: Set ws = wsList(si)
        If Not ws Is Nothing Then
            Dim fac As Shape: Set fac = Nothing
            On Error Resume Next: Set fac = ws.Shapes(facId): On Error GoTo 0
            If Not fac Is Nothing Then
                Dim wasProt As Boolean: wasProt = ws.ProtectContents Or ws.ProtectDrawingObjects
                On Error Resume Next: ws.Unprotect: On Error GoTo 0

                ' owner 2026-06-08 (8-111): 기존 도형 있으면 텍스트 강제 갱신 (AddBadge 는 위치만 갱신).
                Dim chk As Shape: Set chk = Nothing
                On Error Resume Next: Set chk = ws.Shapes(PREFIX_BADGE & facId): On Error GoTo 0
                If chk Is Nothing Then
                    AddBadge ws, fac, facId, badgeText
                    added = added + 1
                Else
                    On Error Resume Next
                    chk.TextFrame2.TextRange.Text = badgeText
                    On Error GoTo 0
                    AddBadge ws, fac, facId, badgeText    ' 위치 갱신
                    updatedTxt = updatedTxt + 1
                End If

                ' callout 좌상단 정렬
                On Error Resume Next: 배지_위치_동기화 ws: On Error GoTo 0

                ' owner 2026-06-08 (8-107): 네트웍구성도면 상태박스 + 태그콤보도 같이 보강.
                If ws Is wsNw Then
                    On Error Resume Next
                    AddFacilityStatusBox wsNw, facId
                    AddFacilityTagCombo wsNw, facId
                    시설물_태그_위치_동기화 wsNw, facId
                    On Error GoTo 0
                End If

                If wasProt Then ApplySheetProtection ws
            End If
        End If
    Next si

    If added > 0 And updatedTxt = 0 Then
        Application.StatusBar = "시설물 포인트 번호 추가 — 새 도형 " & added & " 개 (badge=" & badgeText & ")."
    ElseIf updatedTxt > 0 And added = 0 Then
        Application.StatusBar = "시설물 포인트 번호 재발급 — 텍스트 갱신 " & updatedTxt & " 개 (badge=" & badgeText & ")."
    Else
        Application.StatusBar = "시설물 포인트 번호 — 신규 " & added & ", 갱신 " & updatedTxt & " (badge=" & badgeText & ")."
    End If
End Sub

