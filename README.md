# Vertex AI 강의 분석 파이프라인

이 폴더는 `시나공정처_강의리스트.xlsx`의 486개 유튜브 강의를 `Vertex AI`의 `Gemini 3.1 Pro`로 분석해서 다음 결과를 엑셀로 정리합니다.

- 타임라인
- 영상 화면 텍스트
- 음성 텍스트

결과 엑셀은 보기 좋게 줄바꿈, 자동 필터, 고정 헤더, 색상 스타일을 적용합니다.
또한 컴퓨터가 바로 읽기 쉬운 강의별 JSON 파일도 함께 생성합니다.

## 입력 파일

- `시나공정처_강의리스트.xlsx`
- `eighth-pen-491412-c0-7ea3284c9fc6.json`

엑셀 컬럼은 아래 3개를 사용합니다.

- `번호`
- `영상 제목`
- `링크`

## 생성 결과

- `시나공정처_강의분석.xlsx`
- `artifacts/raw/*.json`
- `artifacts/machine_json/*.json`
- `artifacts/machine_json/manifest.json`
- `artifacts/run_state.json`

엑셀 시트는 2개입니다.

- `강의목록`: 강의 목록
- 강의별 시트: 강의 1개당 시트 1개

기계용 JSON은 강의 1개당 파일 1개입니다.
스키마 설명은 `lecture_analysis.schema.json`을 보면 됩니다.

## 실행 방법

### 1개만 테스트

```powershell
python analyze_videos.py --start 1 --end 1 --save-every 1
```

### 전체 486개 실행

```powershell
python analyze_videos.py --save-every 5
```

### 기존 JSON으로 엑셀만 다시 생성

```powershell
python analyze_videos.py --rebuild-only
```

## 주요 옵션

- `--model`: 기본값 `gemini-3-flash-preview`
- `--location`: 기본값 `global`
- `--temperature`: 기본값 `1.0`
- `--start`, `--end`: 처리할 데이터 행 범위
- `--limit`: 앞에서부터 일부만 처리
- `--overwrite`: 이미 성공한 JSON이 있어도 다시 분석
- `--save-every`: 몇 건마다 엑셀 저장할지 지정
- `--machine-json-dir`: 기계용 JSON 출력 폴더 지정

## 사전 조건

- Google Cloud 프로젝트에서 Vertex AI API 활성화
- `Gemini 3.1 Pro` 사용 권한
- 과금 활성화
- 서비스 계정 키에 Vertex AI 호출 권한 부여

## 설치 패키지

```powershell
pip install -r requirements.txt
```

## GitHub Pages 배포

스터디 앱은 `study-app` 폴더만으로 정적 배포가 가능합니다.

추가한 워크플로:

- `.github/workflows/deploy-pages.yml`

배포 방법:

1. 저장소를 GitHub에 올립니다.
2. GitHub 저장소의 `Settings > Pages`로 이동합니다.
3. `Build and deployment`를 `GitHub Actions`로 선택합니다.
4. `main` 또는 `master` 브랜치에 푸시하면 `study-app` 폴더가 자동으로 Pages에 배포됩니다.

배포 결과:

- 앱 진입 파일: `study-app/index.html`
- 앱 데이터: `study-app/data/topics/*.json`
