import json
import re
from collections import Counter
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parent
SOURCE_DIR = ROOT / "artifacts_sample3_dense" / "machine_json"
OUTPUT_DIR = ROOT / "study-app" / "data" / "topics"
BUNDLE_PATH = ROOT / "study-app" / "data" / "topics-bundle.json"
BUNDLE_JS_PATH = ROOT / "study-app" / "data" / "topics-bundle.js"


SUBJECTS = {
    1: {"name": "소프트웨어 설계", "emoji": "📐", "color": "#3182F6"},
    2: {"name": "소프트웨어 개발", "emoji": "💻", "color": "#30C85E"},
    3: {"name": "데이터베이스 구축", "emoji": "🗄️", "color": "#FF9500"},
    4: {"name": "프로그래밍 언어 활용", "emoji": "⌨️", "color": "#8B5CF6"},
    5: {"name": "정보시스템 구축관리", "emoji": "🔒", "color": "#F04452"},
}


TOPIC_DEFINITIONS = [
    {"subject_id": 1, "title": "소프트웨어 공학 개요", "sequences": [(1, 2)]},
    {"subject_id": 1, "title": "개발 생명주기 모형", "sequences": [(3, 6)]},
    {"subject_id": 1, "title": "애자일, 스크럼, XP", "sequences": [(7, 12)]},
    {"subject_id": 1, "title": "현행 시스템 파악", "sequences": [(13, 15)]},
    {"subject_id": 1, "title": "요구사항 유형과 개발 프로세스", "sequences": [(16, 22)]},
    {"subject_id": 1, "title": "자료 흐름도와 구조적 분석 도구", "sequences": [(23, 27)]},
    {"subject_id": 1, "title": "UML 기본 관계", "sequences": [(28, 32)]},
    {"subject_id": 1, "title": "UML 다이어그램 개요", "sequences": [(33, 37)]},
    {"subject_id": 1, "title": "유스케이스 다이어그램", "sequences": [(38, 39), 51]},
    {"subject_id": 1, "title": "클래스·순차 다이어그램", "sequences": [(40, 42)]},
    {"subject_id": 1, "title": "UI 기본 개념과 설계 지침", "sequences": [(43, 49)]},
    {"subject_id": 1, "title": "목업과 UI 요소", "sequences": [50, 58]},
    {"subject_id": 1, "title": "품질 요구사항과 품질 표준", "sequences": [(52, 54)]},
    {"subject_id": 1, "title": "소프트웨어 품질 특성", "sequences": [(55, 57)]},
    {"subject_id": 1, "title": "상위·하위 설계와 모듈화", "sequences": [(59, 62)]},
    {"subject_id": 1, "title": "소프트웨어 아키텍처와 설계 계약", "sequences": [(63, 64)]},
    {"subject_id": 1, "title": "아키텍처 패턴", "sequences": [(65, 67)]},
    {"subject_id": 1, "title": "객체지향 개념과 설계 원칙", "sequences": [(68, 76)]},
    {"subject_id": 1, "title": "모듈 설계 품질", "sequences": [(77, 88)]},
    {"subject_id": 1, "title": "코드 체계와 디자인 패턴", "sequences": [(89, 95)]},
    {"subject_id": 1, "title": "시스템 인터페이스와 미들웨어", "sequences": [(96, 105)]},
    {"subject_id": 2, "title": "자료구조 개요와 연결 리스트", "sequences": [(106, 107)]},
    {"subject_id": 2, "title": "스택과 큐·데크", "sequences": [(108, 112)]},
    {"subject_id": 2, "title": "그래프와 트리", "sequences": [(113, 116)]},
    {"subject_id": 2, "title": "수식 표기법과 정렬", "sequences": [(117, 122)]},
    {"subject_id": 2, "title": "검색과 해싱", "sequences": [(123, 125)]},
    {"subject_id": 2, "title": "단위 모듈 구현과 테스트", "sequences": [(128, 132)]},
    {"subject_id": 2, "title": "개발 환경·빌드·패키징", "sequences": [(133, 136)]},
    {"subject_id": 2, "title": "DRM과 소프트웨어 문서화", "sequences": [(137, 142)]},
    {"subject_id": 2, "title": "형상 관리와 버전 관리", "sequences": [(143, 149)]},
    {"subject_id": 2, "title": "테스트 원리와 테스트 기법", "sequences": [(150, 157)]},
    {"subject_id": 2, "title": "테스트 단계와 통합 테스트", "sequences": [(158, 164)]},
    {"subject_id": 2, "title": "테스트 케이스와 오라클", "sequences": [(165, 167)]},
    {"subject_id": 2, "title": "테스트 자동화와 결함 관리", "sequences": [(168, 170)]},
    {"subject_id": 2, "title": "복잡도와 코드 품질", "sequences": [(171, 175)]},
    {"subject_id": 2, "title": "인터페이스 설계와 연계 방식", "sequences": [(176, 179)]},
    {"subject_id": 2, "title": "인터페이스 데이터 표준과 구현", "sequences": [(180, 182)]},
    {"subject_id": 2, "title": "인터페이스 보안과 검증", "sequences": [(183, 187)]},
    {"subject_id": 2, "title": "서버 개발 프레임워크와 배치", "sequences": [(273, 275)]},
    {"subject_id": 3, "title": "DBMS와 스키마", "sequences": [(126, 127)]},
    {"subject_id": 3, "title": "데이터베이스 설계 단계", "sequences": [(188, 191)]},
    {"subject_id": 3, "title": "데이터 모델과 E-R 다이어그램", "sequences": [(192, 194)]},
    {"subject_id": 3, "title": "릴레이션과 키", "sequences": [(195, 201)]},
    {"subject_id": 3, "title": "무결성과 관계 연산", "sequences": [(202, 206)]},
    {"subject_id": 3, "title": "정규화와 함수적 종속", "sequences": [(207, 212)]},
    {"subject_id": 3, "title": "반정규화와 중복 테이블", "sequences": [(213, 214)]},
    {"subject_id": 3, "title": "시스템 카탈로그와 트랜잭션", "sequences": [(215, 218)]},
    {"subject_id": 3, "title": "CRUD 분석과 인덱스", "sequences": [(219, 220)]},
    {"subject_id": 3, "title": "뷰·파티션·분산 데이터베이스", "sequences": [(221, 226)]},
    {"subject_id": 3, "title": "데이터베이스 보안·백업·스토리지", "sequences": [(227, 232)]},
    {"subject_id": 3, "title": "SQL 개요와 DDL·DML·DCL", "sequences": [(233, 235)]},
    {"subject_id": 3, "title": "테이블 정의와 권한 제어", "sequences": [(236, 239)]},
    {"subject_id": 3, "title": "트랜잭션 제어문", "sequences": [(240, 241)]},
    {"subject_id": 3, "title": "데이터 조작문", "sequences": [(242, 245)]},
    {"subject_id": 3, "title": "SELECT 기본 검색", "sequences": [(246, 249)]},
    {"subject_id": 3, "title": "하위 질의·그룹 함수·조인", "sequences": [(250, 256)]},
    {"subject_id": 3, "title": "프로시저·트리거·사용자 정의 함수", "sequences": [(257, 265)]},
    {"subject_id": 3, "title": "DB 접속과 데이터 전환", "sequences": [(266, 272)]},
    {"subject_id": 3, "title": "회복·병행제어·교착상태", "sequences": [(440, 446)]},
    {"subject_id": 4, "title": "자료형과 변수", "sequences": [(276, 279)]},
    {"subject_id": 4, "title": "연산자와 우선순위", "sequences": [(280, 284)]},
    {"subject_id": 4, "title": "입출력 함수", "sequences": [(285, 287)]},
    {"subject_id": 4, "title": "조건문과 반복문", "sequences": [(288, 294)]},
    {"subject_id": 4, "title": "배열·포인터·구조체", "sequences": [(295, 299)]},
    {"subject_id": 4, "title": "Python 입출력과 자료구조", "sequences": [(300, 303)]},
    {"subject_id": 4, "title": "Python 제어문과 클래스", "sequences": [(304, 308)]},
    {"subject_id": 4, "title": "자바스크립트와 파이썬 언어 개요", "sequences": [(309, 310)]},
    {"subject_id": 4, "title": "쉘 스크립트", "sequences": [311]},
    {"subject_id": 4, "title": "라이브러리와 C 표준 헤더", "sequences": [(312, 315), 356]},
    {"subject_id": 4, "title": "동적 메모리 할당", "sequences": [316]},
    {"subject_id": 4, "title": "Java 예외 처리", "sequences": [317]},
    {"subject_id": 5, "title": "운영체제 개요", "sequences": [(318, 320)]},
    {"subject_id": 5, "title": "Windows·UNIX와 파일 시스템 기초", "sequences": [(321, 325)]},
    {"subject_id": 5, "title": "배치 전략과 가상기억장치", "sequences": [(326, 331)]},
    {"subject_id": 5, "title": "Locality·워킹 셋·스래싱", "sequences": [(332, 334)]},
    {"subject_id": 5, "title": "프로세스와 스레드", "sequences": [(335, 339)]},
    {"subject_id": 5, "title": "CPU 스케줄링", "sequences": [(340, 343)]},
    {"subject_id": 5, "title": "UNIX·LINUX 환경 변수와 명령어", "sequences": [(344, 345)]},
    {"subject_id": 5, "title": "IP 주소와 IPv6", "sequences": [(346, 349)]},
    {"subject_id": 5, "title": "OSI 7계층과 네트워크 장비", "sequences": [(350, 355)]},
    {"subject_id": 5, "title": "TCP/IP와 네트워크 프로토콜", "sequences": [(357, 363), 414]},
    {"subject_id": 5, "title": "소프트웨어 개발 방법론", "sequences": [(364, 368)]},
    {"subject_id": 5, "title": "소프트웨어 재사용·재공학·CASE", "sequences": [(369, 375)]},
    {"subject_id": 5, "title": "비용 산정 기법", "sequences": [(376, 382)]},
    {"subject_id": 5, "title": "일정 계획과 프로젝트 관리", "sequences": [(383, 388)]},
    {"subject_id": 5, "title": "표준 프로세스와 방법론 테일러링", "sequences": [(389, 394)]},
    {"subject_id": 5, "title": "개발 프레임워크와 특성", "sequences": [(395, 396)]},
    {"subject_id": 5, "title": "차세대 인프라 기술", "sequences": [(397, 404)]},
    {"subject_id": 5, "title": "최신 플랫폼·응용 기술", "sequences": [(405, 409)]},
    {"subject_id": 5, "title": "네트워크 설치 구조와 WLAN 보안", "sequences": [(410, 413)]},
    {"subject_id": 5, "title": "라우팅과 흐름 제어", "sequences": [(415, 418)]},
    {"subject_id": 5, "title": "매시업과 SOA", "sequences": [(419, 421)]},
    {"subject_id": 5, "title": "디지털 트윈과 AI·컨테이너", "sequences": [(422, 424)]},
    {"subject_id": 5, "title": "스크래피와 BaaS", "sequences": [425, 427]},
    {"subject_id": 5, "title": "보안 솔루션과 Secure OS", "sequences": [426, (428, 435)]},
    {"subject_id": 5, "title": "빅데이터 분석 기술", "sequences": [(436, 439)]},
    {"subject_id": 5, "title": "보안 개발 원칙과 취약점", "sequences": [(447, 454)]},
    {"subject_id": 5, "title": "암호화와 해시", "sequences": [(455, 464)]},
    {"subject_id": 5, "title": "서비스 거부와 네트워크 공격", "sequences": [(465, 473)]},
    {"subject_id": 5, "title": "악성코드와 인증·보안 운영", "sequences": [(474, 486)]},
]


SEARCH_TOKEN_RE = re.compile(r"[A-Za-z][A-Za-z0-9+#./-]*|[가-힣]{2,}")
KEYWORD_COLORS = {
    "primary": "#FFB020",
    "secondary": "#3182F6",
}
GENERIC_KEYWORDS = {
    "같이",
    "경우",
    "결과",
    "계속",
    "구분",
    "그다음",
    "그림",
    "기본",
    "기본원칙",
    "나눠지는",
    "나옵니다",
    "나와요",
    "나오는",
    "내용",
    "다음",
    "대한",
    "대해서",
    "등장",
    "루트가",
    "문제",
    "방법",
    "방식",
    "살펴보도록",
    "설명",
    "세가지",
    "소주제",
    "순서",
    "시간",
    "시험",
    "예시",
    "우리",
    "원리",
    "원칙",
    "운행",
    "이것",
    "이렇게",
    "이번",
    "이진",
    "이전",
    "있고요",
    "있다",
    "있습니다",
    "있어요",
    "정리",
    "정의",
    "종류",
    "지금",
    "트리를",
    "특징",
    "하나",
    "합니다",
    "하는",
    "활용",
}
GENERIC_PHRASES = {
    "시험에 나오는 것만 공부한다!",
    "시나공",
}


def expand_sequences(sequence_specs):
    values = []
    for spec in sequence_specs:
        if isinstance(spec, int):
            values.append(spec)
        else:
            start, end = spec
            values.extend(range(start, end + 1))
    return values


def normalize_space(text):
    return re.sub(r"\s+", " ", text).strip()


def clean_text(text):
    if not text:
        return ""
    cleaned = text.replace("시나공", "")
    cleaned = cleaned.replace("시험에 나오는 것만 공부한다!", "")
    cleaned = cleaned.replace("[ ]", "")
    cleaned = normalize_space(cleaned)
    cleaned = cleaned.strip(" -–—,:;")
    return cleaned


def unique_nonempty(items):
    seen = set()
    result = []
    for item in items:
        value = clean_text(item)
        if not value or value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result


def split_spoken_text(text):
    cleaned = clean_text(text)
    if not cleaned:
        return []
    parts = re.split(r"(?<=[.!?])\s+|(?<=다\.)\s+|(?<=요\.)\s+", cleaned)
    return [part.strip() for part in parts if part.strip()]


def extract_screen_lines(segment, lecture_title, limit=4):
    lines = []
    for line in segment.get("screen_text_lines", []):
        cleaned = clean_text(line)
        if not cleaned:
            continue
        if cleaned == lecture_title:
            continue
        lines.append(cleaned)
    return unique_nonempty(lines)[:limit]


def extract_spoken_sentences(segment):
    sentences = unique_nonempty(segment.get("spoken_sentences", []))
    if sentences:
        return sentences
    return split_spoken_text(segment.get("spoken_text", ""))


def join_titles(titles, limit=4):
    preview = titles[:limit]
    if len(titles) <= limit:
        return ", ".join(preview)
    return f"{', '.join(preview)} 등"


def build_topic_summary(topic_title, subject_name, source_titles):
    preview = join_titles(source_titles, limit=4)
    count = len(source_titles)
    sentences = [
        f"이 주제는 {preview}을 중심으로 정리합니다.",
        f"{subject_name} 과목에서 함께 출제되는 핵심 개념 {count}개를 한 묶음으로 압축했습니다.",
        "소주제별 요약을 순서대로 읽으며 빠르게 복습할 수 있습니다.",
    ]
    return {
        "overall_summary": " ".join(sentences),
        "overall_summary_sentences": sentences,
    }


def tokenize_terms(text):
    cleaned = clean_text(text)
    tokens = []
    for raw in SEARCH_TOKEN_RE.findall(cleaned):
        token = clean_text(raw).strip("()[]{}<>\"'")
        if len(token) < 2:
            continue
        if token.lower() in GENERIC_KEYWORDS:
            continue
        tokens.append(token)
    return unique_nonempty(tokens)


def looks_like_sentence(text):
    cleaned = clean_text(text)
    if len(cleaned) > 32:
        return True
    return any(
        marker in cleaned
        for marker in ("합니다", "입니다", "됩니다", "있습니다", "있다", "합니다.", "함.")
    )


def iter_phrase_candidates(text):
    cleaned = clean_text(text)
    if not cleaned or cleaned in GENERIC_PHRASES:
        return []

    phrases = []
    pieces = [clean_text(piece) for piece in re.split(r"[|·•]", cleaned)]
    for piece in pieces:
        if not piece or piece in GENERIC_PHRASES:
            continue

        if 2 <= len(piece) <= 24 and not looks_like_sentence(piece):
            phrases.append(piece)

        if ":" in piece:
            left, right = piece.split(":", 1)
            left = clean_text(left)
            right = clean_text(right)
            if 2 <= len(left) <= 24:
                phrases.append(left)
            if 2 <= len(right) <= 24 and not looks_like_sentence(right):
                phrases.append(right)

        for inner in re.findall(r"\(([^)]+)\)", piece):
            inner_clean = clean_text(inner)
            if 2 <= len(inner_clean) <= 24:
                phrases.append(inner_clean)

        for split_piece in re.split(r"[,/]", piece):
            split_clean = clean_text(split_piece)
            if 2 <= len(split_clean) <= 22 and not looks_like_sentence(split_clean):
                phrases.append(split_clean)

    return unique_nonempty(phrases)


def register_keyword_phrase(counter, metadata, phrase, score, source):
    candidate = clean_text(phrase)
    if not candidate or candidate in GENERIC_PHRASES:
        return
    if len(candidate) < 2 or len(candidate) > 28:
        return

    tokens = tokenize_terms(candidate)
    if not tokens:
        return

    token_signature = " ".join(token.lower() for token in tokens)
    if token_signature in GENERIC_KEYWORDS:
        return

    counter[candidate] += score
    info = metadata.setdefault(
        candidate,
        {
            "tokens": tokens,
            "sources": set(),
        },
    )
    info["sources"].add(source)


def collect_keyword_candidates(counter, metadata, text, score, source):
    cleaned = clean_text(text)
    if not cleaned:
        return

    register_keyword_phrase(counter, metadata, cleaned, score, source)
    for phrase in iter_phrase_candidates(cleaned):
        register_keyword_phrase(counter, metadata, phrase, score, source)
    for token in tokenize_terms(cleaned):
        register_keyword_phrase(counter, metadata, token, max(1, score - 2), source)


def pick_top_keywords(counter, metadata, limit=6, used=None):
    used = used or set()
    selected = []
    ranked_items = sorted(
        counter.items(),
        key=lambda item: (
            -item[1],
            -(1 if (" " in item[0] or any(ch.isupper() for ch in item[0])) else 0),
            -len(item[0]),
            item[0],
        ),
    )
    for phrase, score in ranked_items:
        normalized = phrase.lower()
        if normalized in used:
            continue
        tokens = metadata.get(phrase, {}).get("tokens", [])
        if not tokens:
            continue
        if len(tokens) == 1:
            token = tokens[0].lower()
            redundant = False
            for other_phrase, other_score in counter.items():
                if other_phrase == phrase:
                    continue
                other_tokens = [item.lower() for item in metadata.get(other_phrase, {}).get("tokens", [])]
                if token in other_tokens and len(other_phrase) > len(phrase) and other_score >= score:
                    redundant = True
                    break
            if redundant:
                continue
        used.add(normalized)
        used.update(token.lower() for token in tokens)
        selected.append(
            {
                "keyword": phrase,
                "tokens": tokens,
                "score": score,
                "sources": sorted(metadata.get(phrase, {}).get("sources", [])),
            }
        )
        if len(selected) >= limit:
            break
    return selected


def build_blank_candidates(segment_sources, highlight_keywords, fallback_keywords):
    candidates = []
    seen_prompts = set()
    keyword_pool = highlight_keywords + fallback_keywords

    for keyword_info in keyword_pool:
        keyword = keyword_info["keyword"]
        if len(keyword) < 2:
            continue
        if len(keyword) < 3 and any(len(item["keyword"]) >= 3 for item in keyword_pool):
            continue

        for source in segment_sources:
            source_text = clean_text(source["text"])
            if keyword not in source_text:
                continue
            if len(source_text) < 8 or len(source_text) > 120:
                continue

            prompt = source_text.replace(keyword, "______", 1)
            if prompt == source_text or prompt in seen_prompts:
                continue
            if len(prompt.replace("______", "").strip(" -:>")) < 4:
                continue

            seen_prompts.add(prompt)
            candidates.append(
                {
                    "candidate_id": f"{source['segment_id']}::{len(candidates) + 1:02d}",
                    "prompt": prompt,
                    "answer": keyword,
                    "original": source_text,
                    "keyword": keyword,
                    "source_segment_id": source["segment_id"],
                    "source_type": source["source_type"],
                    "emphasis": keyword_info["emphasis"],
                    "explanation": (
                        f"정답은 '{keyword}'입니다. "
                        f"{source['source_type']}에서 반복되는 핵심 표현이라 소주제 복습에 적합합니다."
                    ),
                }
            )
            break

        if len(candidates) >= 4:
            break

    return candidates


def build_subtopic_analysis(topic_id, subtopic_index, lecture_data):
    lecture = lecture_data["lecture"]
    lecture_title = lecture["title"]
    keyword_scores = Counter()
    keyword_metadata = {}
    segment_inputs = []
    playable_segments = []

    collect_keyword_candidates(keyword_scores, keyword_metadata, lecture_title, 9, "lecture_title")

    playable_segment_index = 0
    for source_segment in lecture_data.get("segments", []):
        spoken_sentences = extract_spoken_sentences(source_segment)
        if not spoken_sentences:
            continue

        screen_lines = extract_screen_lines(source_segment, lecture_title)
        timeline_summary = clean_text(source_segment.get("timeline_summary", "")) or lecture_title
        segment_id = f"{topic_id}-subtopic-{subtopic_index:03d}-source-seg-{playable_segment_index + 1:03d}"
        segment_inputs.append(
            {
                "segment_id": segment_id,
                "source_type": "timeline_summary",
                "text": timeline_summary,
            }
        )
        collect_keyword_candidates(keyword_scores, keyword_metadata, timeline_summary, 5, "timeline_summary")

        for line in screen_lines:
            segment_inputs.append(
                {
                    "segment_id": segment_id,
                    "source_type": "screen_text",
                    "text": line,
                }
            )
            collect_keyword_candidates(keyword_scores, keyword_metadata, line, 4, "screen_text")

        for sentence in spoken_sentences[:3]:
            segment_inputs.append(
                {
                    "segment_id": segment_id,
                    "source_type": "spoken_sentence",
                    "text": sentence,
                }
            )
            collect_keyword_candidates(keyword_scores, keyword_metadata, sentence, 2, "spoken_sentence")

        playable_segments.append(
            {
                "segment_id": segment_id,
                "segment_index_within_subtopic": playable_segment_index,
                "timeline_summary": timeline_summary,
                "screen_lines": screen_lines,
                "spoken_sentences": spoken_sentences,
            }
        )
        playable_segment_index += 1

    primary_keywords = pick_top_keywords(keyword_scores, keyword_metadata, limit=5)
    used = {item["keyword"].lower() for item in primary_keywords}
    secondary_keywords = pick_top_keywords(keyword_scores, keyword_metadata, limit=6, used=used)

    for item in primary_keywords:
        item["emphasis"] = "primary"
        item["color_token"] = "primary"
        item["color_hex"] = KEYWORD_COLORS["primary"]
    for item in secondary_keywords:
        item["emphasis"] = "secondary"
        item["color_token"] = "secondary"
        item["color_hex"] = KEYWORD_COLORS["secondary"]

    blank_candidates = build_blank_candidates(segment_inputs, primary_keywords, secondary_keywords)

    segment_highlights = {}
    keyword_pool = primary_keywords + secondary_keywords
    for playable in playable_segments:
        combined = " ".join(
            [playable["timeline_summary"], *playable["screen_lines"], *playable["spoken_sentences"]]
        ).lower()
        matches = []
        for keyword_info in keyword_pool:
            if keyword_info["keyword"].lower() in combined:
                matches.append(
                    {
                        "keyword": keyword_info["keyword"],
                        "emphasis": keyword_info["emphasis"],
                        "color_token": keyword_info["color_token"],
                        "color_hex": keyword_info["color_hex"],
                        "score": keyword_info["score"],
                    }
                )
        segment_highlights[playable["segment_index_within_subtopic"]] = matches[:4]

    return {
        "primary_keywords": primary_keywords,
        "secondary_keywords": secondary_keywords,
        "blank_candidates": blank_candidates,
        "segment_highlights": segment_highlights,
        "keyword_counts": {
            "primary": len(primary_keywords),
            "secondary": len(secondary_keywords),
            "blank_candidates": len(blank_candidates),
        },
    }


def build_subtopic_analyses(topic_id, source_lectures):
    analyses = {}
    for subtopic_index, lecture_data in enumerate(source_lectures, start=1):
        analyses[subtopic_index] = build_subtopic_analysis(topic_id, subtopic_index, lecture_data)
    return analyses


def build_subtopics(source_lectures, subtopic_analyses):
    subtopics = []
    for subtopic_index, lecture_data in enumerate(source_lectures, start=1):
        lecture = lecture_data["lecture"]
        segments = lecture_data.get("segments", [])
        analysis = subtopic_analyses[subtopic_index]
        playable_segment_count = 0
        for segment in segments:
            if extract_spoken_sentences(segment):
                playable_segment_count += 1

        subtopics.append(
            {
                "subtopic_index": subtopic_index,
                "lecture_id": lecture["lecture_id"],
                "sequence": lecture["sequence"],
                "number": lecture["number"],
                "course_code": lecture.get("course_code", ""),
                "title": lecture["title"],
                "duration_seconds": lecture_data.get("summary", {}).get("duration_seconds") or 0,
                "youtube_url_normalized": lecture.get("youtube_url_normalized", ""),
                "segment_count": playable_segment_count,
                "highlight_keywords": analysis["primary_keywords"],
                "secondary_keywords": analysis["secondary_keywords"],
                "blank_quiz_candidates": analysis["blank_candidates"],
                "keyword_summary": analysis["keyword_counts"],
            }
        )
    return subtopics


def build_topic_segments(topic_id, source_lectures, subtopic_analyses):
    segments = []
    global_segment_index = 1
    for subtopic_index, lecture_data in enumerate(source_lectures, start=1):
        lecture = lecture_data["lecture"]
        lecture_title = lecture["title"]
        analysis = subtopic_analyses[subtopic_index]
        playable_segment_index = 0
        for source_segment in lecture_data.get("segments", []):
            spoken_sentences = extract_spoken_sentences(source_segment)
            if not spoken_sentences:
                continue

            screen_lines = extract_screen_lines(source_segment, lecture_title)
            segment = {
                "segment_id": f"{topic_id}-seg-{global_segment_index:03d}",
                "segment_index": global_segment_index,
                "subtopic_index": subtopic_index,
                "subtopic_id": lecture["lecture_id"],
                "subtopic_title": lecture_title,
                "subtopic_sequence": lecture["sequence"],
                "subtopic_number": lecture["number"],
                "youtube_url_normalized": lecture.get("youtube_url_normalized", ""),
                "start_time_hms": source_segment.get("start_time_hms", ""),
                "end_time_hms": source_segment.get("end_time_hms", ""),
                "start_seconds": source_segment.get("start_seconds") or 0,
                "end_seconds": source_segment.get("end_seconds") or 0,
                "duration_seconds": source_segment.get("duration_seconds") or 0,
                "timeline_summary": clean_text(source_segment.get("timeline_summary", "")) or lecture_title,
                "screen_text_lines": screen_lines,
                "screen_text": "\n".join(screen_lines),
                "spoken_sentences": spoken_sentences,
                "spoken_text": " ".join(spoken_sentences),
                "highlight_keywords": analysis["segment_highlights"].get(playable_segment_index, []),
            }
            segments.append(segment)
            global_segment_index += 1
            playable_segment_index += 1
    return segments


def build_keyword_preview(source_titles):
    keywords = []
    for title in source_titles:
        for part in re.split(r"[·,/()\- ]+", title):
            token = clean_text(part)
            if not token or len(token) < 2:
                continue
            keywords.append(token)
    common = [token for token, _ in Counter(keywords).most_common(8)]
    return unique_nonempty(common)[:5]


def load_source_manifest():
    manifest_path = SOURCE_DIR / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    items = {
        item["sequence"]: item
        for item in manifest["items"]
        if item.get("status") == "success"
    }
    return manifest, items


def load_lecture_data(sequence, manifest_items):
    item = manifest_items[sequence]
    json_path = SOURCE_DIR / item["json_file"]
    return json.loads(json_path.read_text(encoding="utf-8"))


def validate_topic_map():
    all_sequences = []
    for topic in TOPIC_DEFINITIONS:
        expanded = expand_sequences(topic["sequences"])
        if len(expanded) != len(set(expanded)):
            raise ValueError(f"중복 강의가 포함된 주제: {topic['title']}")
        all_sequences.extend(expanded)

    unique_sequences = set(all_sequences)
    missing = sorted(set(range(1, 487)) - unique_sequences)
    duplicates = sorted(seq for seq, count in Counter(all_sequences).items() if count > 1)

    if missing or duplicates:
        raise ValueError(
            f"주제 맵 검증 실패 - missing={missing[:20]}, duplicates={duplicates[:20]}"
        )

    if len(TOPIC_DEFINITIONS) != 100:
        raise ValueError(f"주제 개수가 100개가 아닙니다: {len(TOPIC_DEFINITIONS)}")


def ensure_output_dir():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for path in OUTPUT_DIR.glob("*.json"):
        path.unlink()


def build_dataset():
    validate_topic_map()
    _, manifest_items = load_source_manifest()
    ensure_output_dir()

    manifest_items_out = []
    subject_counts = Counter()
    bundle_topics = {}

    for topic_index, definition in enumerate(TOPIC_DEFINITIONS, start=1):
        sequences = expand_sequences(definition["sequences"])
        source_lectures = [load_lecture_data(sequence, manifest_items) for sequence in sequences]
        source_titles = [lecture["lecture"]["title"] for lecture in source_lectures]
        source_ids = [lecture["lecture"]["lecture_id"] for lecture in source_lectures]
        subject = SUBJECTS[definition["subject_id"]]
        topic_id = f"topic_{topic_index:03d}"
        topic_number = f"{topic_index:02d}"
        topic_summary = build_topic_summary(definition["title"], subject["name"], source_titles)
        subtopic_analyses = build_subtopic_analyses(topic_id, source_lectures)
        topic_segments = build_topic_segments(topic_id, source_lectures, subtopic_analyses)
        subtopics = build_subtopics(source_lectures, subtopic_analyses)
        duration_seconds = sum(
            lecture.get("summary", {}).get("duration_seconds") or 0 for lecture in source_lectures
        )
        preview_titles = source_titles[:3]
        preview_text = join_titles(source_titles, limit=3)
        keywords = build_keyword_preview(source_titles)
        topic_primary_keywords = unique_nonempty(
            keyword["keyword"]
            for subtopic in subtopics
            for keyword in subtopic.get("highlight_keywords", [])
        )[:10]
        topic_secondary_keywords = unique_nonempty(
            keyword["keyword"]
            for subtopic in subtopics
            for keyword in subtopic.get("secondary_keywords", [])
        )[:12]

        topic_payload = {
            "schema_version": "study-topic.v1",
            "topic": {
                "topic_id": topic_id,
                "subject_id": definition["subject_id"],
                "subject_name": subject["name"],
                "source_count": len(source_titles),
                "source_sequences": sequences,
                "source_lecture_ids": source_ids,
                "source_titles": source_titles,
                "keywords": keywords,
                "highlight_keywords": topic_primary_keywords,
                "secondary_keywords": topic_secondary_keywords,
                "emphasis_palette": KEYWORD_COLORS,
            },
            "subtopics": subtopics,
            "lecture": {
                "lecture_id": topic_id,
                "sequence": topic_index,
                "number": topic_number,
                "title": definition["title"],
                "title_raw": definition["title"],
                "subject_id": definition["subject_id"],
                "subject_name": subject["name"],
                "source_count": len(source_titles),
                "source_sequences": sequences,
                "source_titles": source_titles,
                "preview_text": preview_text,
                "segment_count": len(topic_segments),
                "youtube_url": "",
                "youtube_url_normalized": "",
                "youtube_video_id": "",
            },
            "summary": {
                **topic_summary,
                "duration_hms": "",
                "duration_seconds": duration_seconds,
                "source_titles_preview": preview_titles,
                "highlight_keywords": topic_primary_keywords,
            },
            "segments": topic_segments,
        }

        output_name = f"{topic_id}.json"
        (OUTPUT_DIR / output_name).write_text(
            json.dumps(topic_payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        bundle_topics[topic_id] = topic_payload

        manifest_items_out.append(
            {
                "lecture_id": topic_id,
                "topic_id": topic_id,
                "sequence": topic_index,
                "number": topic_number,
                "title": definition["title"],
                "subject_id": definition["subject_id"],
                "subject_name": subject["name"],
                "status": "success",
                "source_count": len(source_titles),
                "source_sequences": sequences,
                "preview_titles": preview_titles,
                "preview_text": preview_text,
                "keywords": keywords,
                "json_file": output_name,
            }
        )
        subject_counts[definition["subject_id"]] += 1

    manifest_payload = {
        "schema_version": "study-topic-manifest.v1",
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "source_manifest": str((SOURCE_DIR / "manifest.json").relative_to(ROOT)),
        "source_lecture_count": 486,
        "topic_count": len(TOPIC_DEFINITIONS),
        "subject_topic_counts": {
            SUBJECTS[subject_id]["name"]: count for subject_id, count in sorted(subject_counts.items())
        },
        "items": manifest_items_out,
    }

    (OUTPUT_DIR / "manifest.json").write_text(
        json.dumps(manifest_payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    bundle_payload = {
        "schema_version": "study-topic-bundle.v1",
        "generated_at": manifest_payload["generated_at"],
        "manifest": manifest_payload,
        "topics": bundle_topics,
    }

    BUNDLE_PATH.write_text(
        json.dumps(bundle_payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    BUNDLE_JS_PATH.write_text(
        "window.__STUDY_TOPIC_BUNDLE__ = "
        + json.dumps(bundle_payload, ensure_ascii=False, indent=2)
        + ";\n",
        encoding="utf-8",
    )

    print("주제 데이터셋 생성 완료")
    print(f"- 출력 경로: {OUTPUT_DIR}")
    print(f"- 번들 파일: {BUNDLE_PATH}")
    print(f"- 로컬 번들 스크립트: {BUNDLE_JS_PATH}")
    print(f"- 주제 수: {len(TOPIC_DEFINITIONS)}")
    for subject_id in sorted(subject_counts):
        print(f"- {SUBJECTS[subject_id]['name']}: {subject_counts[subject_id]}개 주제")


if __name__ == "__main__":
    build_dataset()
