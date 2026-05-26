-- 캔버스 시설물 라벨·케이블 선 스타일 사용자 정의 (마이그 0081).
--   상단 floating 「서식」 툴바에서 글자 크기/색/굵기/기울임/폰트, 케이블 두께를
--   선택해 저장한다. 시설별·케이블별 개별 적용. 둘 다 jsonb 로 확장 여지 보존.
--
-- relocation_facilities.label_style 형식 — 누락된 키는 캔버스 기본값 사용
--   {
--     "font_size_scale": 1.25,     // 기본 라벨 크기에 곱하는 배수
--     "color": "#dc2626",          // CSS 색상
--     "font_family": "monospace",  // 'Pretendard' | 'monospace' | 'serif'
--     "bold": true,                // 굵게
--     "italic": false              // 기울임
--   }
--
-- relocation_cables.line_style 형식
--   {
--     "width_scale": 2            // 1=얇음, 2=얇은보통, 3=보통, 4=굵음, 5=매우굵음
--   }
--
-- 멱등.

alter table public.relocation_facilities
  add column if not exists label_style jsonb not null default '{}'::jsonb;

alter table public.relocation_cables
  add column if not exists line_style jsonb not null default '{}'::jsonb;
