# Asset Workspace

이 폴더는 `study-app`에서 사용할 이미지 에셋 계획과 생성 결과를 정리하는 공간입니다.

## 현재 파일

- `plan/asset-plan.json`
  - 교체 대상, 공식 Vertex AI Gemini 모델명, 예상 개수, 저장 경로, 적용 위치를 정리한 기준 문서
- `scripts/generate_vertex_assets.py`
  - `asset-plan.json`을 읽어서 Vertex AI Gemini 이미지 에셋을 생성하고 `generated/generation-manifest.json`에 기록

## 생성 결과 저장 규칙

- 브랜드/로딩: `generated/branding/`
- 강의 가이드 캐릭터: `generated/characters/`
- 과목 아이콘: `generated/subjects/`
- 상태 일러스트: `generated/states/`
- 코드/SVG로 처리할 UI 메모: `generated/ui/`

## 파일명 규칙

- `<asset-id>-v1.png`
- 예시: `subject-software-design-v1.png`

## 다음 작업 순서

1. `plan/asset-plan.json` 기준으로 생성 우선순위 1부터 순차 제작
2. 생성된 파일을 `generated/...` 아래에 저장
3. 적용 시 `usage_map`에 적힌 파일/라인 순서대로 교체
4. 교체가 끝나면 최종 매핑 표를 별도 갱신
