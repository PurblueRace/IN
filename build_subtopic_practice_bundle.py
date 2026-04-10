import json
import re
from collections import Counter
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parent
TOPIC_BUNDLE_PATH = ROOT / "study-app" / "data" / "topics-bundle.json"
QUESTION_BANK_TOPICS_DIR = ROOT / "study-app" / "data" / "question-bank" / "topics"
OUTPUT_JSON_PATH = ROOT / "study-app" / "data" / "subtopic-practice-bundle.json"
OUTPUT_JS_PATH = ROOT / "study-app" / "data" / "subtopic-practice-bundle.js"

SEARCH_TOKEN_RE = re.compile(r"[A-Za-z][A-Za-z0-9+#./-]*|[가-힣]{2,}")
GENERIC_TOKENS = {
    "같이",
    "개념",
    "결과",
    "기본",
    "내용",
    "다음",
    "대한",
    "문제",
    "방법",
    "방식",
    "설명",
    "순서",
    "시간",
    "정리",
    "정의",
    "종류",
    "특징",
    "활용",
}
MANUAL_OVERRIDES = {
    ("topic_024", 4): "qb_fd1fc65458aae6ed",
}


def normalize_space(text):
    return re.sub(r"\s+", " ", (text or "")).strip()


def unique_nonempty(items):
    seen = set()
    result = []
    for item in items:
        value = normalize_space(item)
        if not value or value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result


def tokenize(text):
    tokens = []
    for raw in SEARCH_TOKEN_RE.findall(normalize_space(text)):
        token = raw.strip("()[]{}<>\"'").lower()
        if len(token) < 2:
            continue
        if token in GENERIC_TOKENS:
            continue
        tokens.append(token)
    return unique_nonempty(tokens)


def add_weighted_text(counter, text, weight):
    for token in tokenize(text):
        counter[token] += weight


def build_answer_text(question):
    labels = question.get("answer", {}).get("correct_labels", [])
    texts = question.get("answer", {}).get("correct_choice_texts", [])
    answer_text = normalize_space(question.get("answer", {}).get("answer_text", ""))
    if labels and texts:
        return ", ".join(f"{label}번 {text}" for label, text in zip(labels, texts))
    if labels and answer_text:
        return f"{labels[0]}번 {answer_text}"
    return answer_text or ", ".join(f"{label}번" for label in labels)


def pick_preferred_figure_asset(question):
    visual_assets = question.get("visual_assets", {})
    asset = (
        visual_assets.get("preferred_display_asset")
        or visual_assets.get("primary_image")
        or (visual_assets.get("question_figure_crops") or [None])[0]
        or (visual_assets.get("page_images") or [None])[0]
    )
    return asset or {}


def build_resolved_question(question):
    explanation = question.get("explanation", {})
    asset = pick_preferred_figure_asset(question)
    return {
        "question": question.get("question", {}).get("stem", ""),
        "choices": question.get("question", {}).get("choices", []),
        "answer": build_answer_text(question),
        "correct_labels": question.get("answer", {}).get("correct_labels", []),
        "explanation": explanation.get("detailed_summary") or explanation.get("summary") or explanation.get("source_text", ""),
        "detailed_summary": explanation.get("detailed_summary", ""),
        "choice_analysis": explanation.get("choice_analysis", []),
        "solving_steps": explanation.get("solving_steps", []),
        "exam_traps": explanation.get("exam_traps", []),
        "answer_checklist": explanation.get("answer_checklist", []),
        "memory_cues": explanation.get("memory_cues", []),
        "figure_relative_path": asset.get("relative_path", ""),
        "figure_alt": f"{question.get('question', {}).get('stem', '')} 관련 그림" if asset else "",
    }


def load_question_records():
    records = []
    by_id = {}

    for topic_path in sorted(QUESTION_BANK_TOPICS_DIR.glob("*.json")):
        topic_payload = json.loads(topic_path.read_text(encoding="utf-8"))
        topic_file = f"topics/{topic_path.name}"
        for question in topic_payload.get("questions", []):
            weights = Counter()
            add_weighted_text(weights, question.get("source_taxonomy", {}).get("chapter_label", ""), 6)
            add_weighted_text(weights, question.get("source_taxonomy", {}).get("chapter_key", ""), 5)
            add_weighted_text(weights, question.get("exam_taxonomy", {}).get("topic_title", ""), 5)
            add_weighted_text(weights, question.get("exam_taxonomy", {}).get("draft_topic_name", ""), 5)
            add_weighted_text(weights, question.get("question", {}).get("stem", ""), 3)
            for keyword in question.get("keywords", []):
                add_weighted_text(weights, keyword, 7)
            for concept in question.get("explanation", {}).get("key_concepts", []):
                add_weighted_text(weights, concept, 4)

            record = {
                "question_id": question["question_id"],
                "topic_file": topic_file,
                "question": question,
                "subject_id": question.get("exam_taxonomy", {}).get("subject_id"),
                "chapter_label": question.get("source_taxonomy", {}).get("chapter_label", ""),
                "weights": weights,
                "keywords": unique_nonempty(question.get("keywords", [])),
            }
            records.append(record)
            by_id[record["question_id"]] = record

    return records, by_id


def build_subtopic_profiles(bundle_topics):
    profiles = []
    for topic_id, payload in bundle_topics.items():
        lecture = payload.get("lecture", {})
        subject_id = lecture.get("subject_id")
        lecture_title = lecture.get("title", "")
        for subtopic in payload.get("subtopics", []):
            weights = Counter()
            add_weighted_text(weights, lecture_title, 3)
            add_weighted_text(weights, subtopic.get("title", ""), 7)
            for keyword in subtopic.get("highlight_keywords", []):
                add_weighted_text(weights, keyword.get("keyword", ""), 8)
            for keyword in subtopic.get("secondary_keywords", []):
                add_weighted_text(weights, keyword.get("keyword", ""), 4)
            for candidate in subtopic.get("blank_quiz_candidates", []):
                add_weighted_text(weights, candidate.get("answer", ""), 5)
                add_weighted_text(weights, candidate.get("original", ""), 2)

            profiles.append(
                {
                    "lecture_topic_id": topic_id,
                    "lecture_topic_title": lecture_title,
                    "subject_id": subject_id,
                    "subtopic_index": subtopic["subtopic_index"],
                    "subtopic_lecture_id": subtopic.get("lecture_id", ""),
                    "subtopic_title": subtopic.get("title", ""),
                    "highlight_keywords": [item.get("keyword", "") for item in subtopic.get("highlight_keywords", [])],
                    "secondary_keywords": [item.get("keyword", "") for item in subtopic.get("secondary_keywords", [])],
                    "blank_candidates": subtopic.get("blank_quiz_candidates", []),
                    "weights": weights,
                }
            )
    return profiles


def score_match(profile, question_record):
    score = 0
    if profile["subject_id"] == question_record["subject_id"]:
        score += 20
    else:
        score -= 12

    overlap_tokens = []
    common_tokens = set(profile["weights"]) & set(question_record["weights"])
    for token in common_tokens:
        token_score = min(profile["weights"][token], question_record["weights"][token])
        score += token_score * 3
        overlap_tokens.append(token)

    subtopic_title_tokens = set(tokenize(profile["subtopic_title"]))
    chapter_tokens = set(tokenize(question_record["chapter_label"]))
    score += len(subtopic_title_tokens & chapter_tokens) * 5

    matched_keywords = []
    question_keywords = set(tokenize(" ".join(question_record["keywords"])))
    for keyword in profile["highlight_keywords"]:
        keyword_tokens = set(tokenize(keyword))
        if keyword_tokens and keyword_tokens & question_keywords:
            score += 8
            matched_keywords.append(keyword)

    if not matched_keywords:
        matched_keywords = unique_nonempty(overlap_tokens)[:6]

    return score, unique_nonempty(matched_keywords)


def confidence_for_score(score):
    if score >= 70:
        return "high"
    if score >= 40:
        return "medium"
    return "low"


def choose_assignments(profiles, question_records, by_id):
    candidates_by_key = {}
    for profile in profiles:
        key = (profile["lecture_topic_id"], profile["subtopic_index"])
        override_question_id = MANUAL_OVERRIDES.get(key)
        if override_question_id and override_question_id in by_id:
            candidates_by_key[key] = [
                {
                    "record": by_id[override_question_id],
                    "score": 999,
                    "matched_keywords": profile["highlight_keywords"][:4],
                    "manual_override": True,
                }
            ]
            continue

        ranked = []
        for question_record in question_records:
            score, matched_keywords = score_match(profile, question_record)
            ranked.append(
                {
                    "record": question_record,
                    "score": score,
                    "matched_keywords": matched_keywords,
                    "manual_override": False,
                }
            )
        ranked.sort(key=lambda item: (-item["score"], item["record"]["question_id"]))
        candidates_by_key[key] = ranked[:25]

    allocations = {}
    used_questions = set()
    ordered_profiles = sorted(
        profiles,
        key=lambda profile: -candidates_by_key[(profile["lecture_topic_id"], profile["subtopic_index"])][0]["score"],
    )

    for profile in ordered_profiles:
        key = (profile["lecture_topic_id"], profile["subtopic_index"])
        candidates = candidates_by_key[key]
        selected = None
        for candidate in candidates:
            question_id = candidate["record"]["question_id"]
            if question_id not in used_questions:
                selected = candidate
                break
        if selected is None:
            selected = candidates[0]
        allocations[key] = selected
        used_questions.add(selected["record"]["question_id"])

    return allocations


def build_fill_blank_activity(profile):
    candidate = (profile["blank_candidates"] or [None])[0]
    if not candidate:
        fallback_keyword = (profile["highlight_keywords"] or [profile["subtopic_title"]])[0]
        candidate = {
            "prompt": f"{profile['subtopic_title']}에서 가장 중요한 용어는 ______ 입니다.",
            "answer": fallback_keyword,
            "original": f"{profile['subtopic_title']}에서 가장 중요한 용어는 {fallback_keyword} 입니다.",
            "explanation": f"정답은 '{fallback_keyword}'입니다. 소주제 제목과 핵심 키워드를 먼저 묶어서 기억하면 복습 속도가 빨라집니다.",
            "candidate_id": f"{profile['lecture_topic_id']}-subtopic-{profile['subtopic_index']:03d}-fallback",
            "source_type": "generated_fallback",
        }

    return {
        "activity_id": f"{profile['lecture_topic_id']}__subtopic_{profile['subtopic_index']:03d}__blank_01",
        "kind": "fill_blank",
        "type_label": "빈칸 추론 문제",
        "prompt": candidate["prompt"],
        "answer": candidate["answer"],
        "original": candidate["original"],
        "explanation": candidate["explanation"],
        "source_type": candidate.get("source_type", "screen_text"),
        "source_candidate_id": candidate.get("candidate_id", ""),
    }


def build_objective_activity(profile, allocation):
    question = allocation["record"]["question"]
    preferred_asset = pick_preferred_figure_asset(question)
    matched_keywords = allocation.get("matched_keywords", [])
    score = allocation.get("score", 0)

    notes = []
    if allocation.get("manual_override"):
        notes.append("수동 샘플 매핑이 우선 적용되었습니다.")
    if matched_keywords:
        notes.append(f"겹치는 키워드: {', '.join(matched_keywords[:6])}")
    if question.get("source_taxonomy", {}).get("chapter_label"):
        notes.append(f"원본 챕터: {question['source_taxonomy']['chapter_label']}")

    return {
        "activity_id": f"{profile['lecture_topic_id']}__subtopic_{profile['subtopic_index']:03d}__objective_01",
        "kind": "question_bank_ref",
        "type_label": "객관식 문제",
        "question_id": question["question_id"],
        "question_bank_topic_id": question.get("exam_taxonomy", {}).get("topic_id", ""),
        "question_bank_topic_file": allocation["record"]["topic_file"],
        "preferred_figure_asset_id": preferred_asset.get("asset_id", ""),
        "mapping_reason": f"{profile['subtopic_title']}와 문제 키워드를 비교해 자동 매핑했습니다.",
        "mapping_confidence": confidence_for_score(score),
        "mapping_score": score,
        "matched_keywords": matched_keywords,
        "resolved_question": build_resolved_question(question),
        "mapping_notes": notes,
    }


def main():
    bundle = json.loads(TOPIC_BUNDLE_PATH.read_text(encoding="utf-8"))
    question_records, by_id = load_question_records()
    profiles = build_subtopic_profiles(bundle.get("topics", {}))
    allocations = choose_assignments(profiles, question_records, by_id)

    items = []
    for profile in profiles:
        key = (profile["lecture_topic_id"], profile["subtopic_index"])
        allocation = allocations[key]
        fill_blank = build_fill_blank_activity(profile)
        objective = build_objective_activity(profile, allocation)

        items.append(
            {
                "mapping_id": f"{profile['lecture_topic_id']}__subtopic_{profile['subtopic_index']:03d}",
                "lecture_topic_id": profile["lecture_topic_id"],
                "lecture_topic_title": profile["lecture_topic_title"],
                "subtopic_index": profile["subtopic_index"],
                "subtopic_lecture_id": profile["subtopic_lecture_id"],
                "subtopic_title": profile["subtopic_title"],
                "trigger": "after_subtopic",
                "lecture_keywords": profile["highlight_keywords"][:6],
                "mapping_notes": objective.get("mapping_notes", []),
                "activities": [fill_blank, objective],
            }
        )

    payload = {
        "schema_version": "study-subtopic-practice.v2",
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "item_count": len(items),
        "mapping_strategy": "keyword_overlap_greedy_v1",
        "items": items,
    }

    OUTPUT_JSON_PATH.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    OUTPUT_JS_PATH.write_text(
        "window.__STUDY_SUBTOPIC_PRACTICE_BUNDLE__ = "
        + json.dumps(payload, ensure_ascii=False, indent=2)
        + ";\n",
        encoding="utf-8",
    )

    print("subtopic practice bundle generated")
    print(f"- items: {len(items)}")
    print(f"- json: {OUTPUT_JSON_PATH}")
    print(f"- js: {OUTPUT_JS_PATH}")


if __name__ == "__main__":
    main()
