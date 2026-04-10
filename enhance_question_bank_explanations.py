import json
import re
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parent
QUESTION_BANK_DIR = ROOT / "study-app" / "data" / "question-bank"
TOPICS_DIR = QUESTION_BANK_DIR / "topics"
MANIFEST_PATH = QUESTION_BANK_DIR / "manifest.json"

SPACE_RE = re.compile(r"\s+")


def normalize_space(text):
    return SPACE_RE.sub(" ", (text or "")).strip()


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


def build_answer_text(question):
    labels = question.get("answer", {}).get("correct_labels", [])
    choice_texts = question.get("answer", {}).get("correct_choice_texts", [])
    answer_text = normalize_space(question.get("answer", {}).get("answer_text", ""))
    if labels and choice_texts:
        pairs = [f"{label}번 {text}" for label, text in zip(labels, choice_texts)]
        return ", ".join(pairs)
    if labels and answer_text:
        return f"{labels[0]}번 {answer_text}"
    if answer_text:
        return answer_text
    if labels:
        return ", ".join(f"{label}번" for label in labels)
    return ""


def build_choice_analysis(question):
    choices = question.get("question", {}).get("choices", [])
    explanation = question.get("explanation", {})
    correct_labels = set(question.get("answer", {}).get("correct_labels", []))
    answer_text = build_answer_text(question)
    correct_reason = " ".join(explanation.get("why_correct", [])[:2]).strip()
    wrong_reason = " ".join(explanation.get("why_others_wrong", [])[:2]).strip()
    fallback_summary = normalize_space(explanation.get("summary", "") or explanation.get("source_text", ""))

    analyses = []
    for choice in choices:
        label = choice.get("label", "")
        text = normalize_space(choice.get("text", ""))
        is_correct = label in correct_labels
        if is_correct:
            analysis = (
                f"정답입니다. 이 선택지는 실제 정답인 '{answer_text or text}'와 일치합니다."
            )
            if correct_reason:
                analysis += f" {correct_reason}"
            elif fallback_summary:
                analysis += f" {fallback_summary}"
        else:
            analysis = (
                f"오답입니다. 정답은 '{answer_text}'인데 이 선택지는 '{text}'이므로 일치하지 않습니다."
            ).strip()
            if wrong_reason:
                analysis += f" {wrong_reason}"
            elif fallback_summary:
                analysis += f" 핵심 개념은 {fallback_summary}"

        analyses.append(
            {
                "label": label,
                "text": text,
                "is_correct": is_correct,
                "analysis": normalize_space(analysis),
            }
        )
    return analyses


def build_solving_steps(question):
    explanation = question.get("explanation", {})
    stem = normalize_space(question.get("question", {}).get("stem", ""))
    key_concepts = explanation.get("key_concepts", [])
    why_correct = explanation.get("why_correct", [])
    why_wrong = explanation.get("why_others_wrong", [])

    steps = [
        normalize_space(f"문제에서 묻는 대상이 무엇인지 먼저 확인합니다. {stem}"),
    ]

    if key_concepts:
        steps.append(
            normalize_space(
                f"핵심 개념을 떠올립니다. {', '.join(key_concepts[:4])}"
            )
        )

    if why_correct:
        steps.append(normalize_space(f"정답 판단 근거를 적용합니다. {why_correct[0]}"))

    if why_wrong:
        steps.append(normalize_space(f"나머지 보기와 비교해 오답을 제거합니다. {why_wrong[0]}"))

    return unique_nonempty(steps)


def build_exam_traps(question):
    explanation = question.get("explanation", {})
    keywords = [item.lower() for item in explanation.get("key_concepts", []) + question.get("keywords", [])]
    traps = []

    if any(term in keywords for term in ("preorder", "inorder", "postorder")):
        traps.append("트리 순회 문제는 Root 위치가 앞/중간/뒤 어디에 오는지 먼저 확인해야 합니다.")
    if any(term in keywords for term in ("ddl", "dml", "dcl", "sql")):
        traps.append("SQL 문제는 명령어의 목적이 정의인지 조작인지 제어인지부터 구분하면 실수가 줄어듭니다.")
    if any(term in keywords for term in ("정규화", "함수적 종속", "정규형")):
        traps.append("정규화 문제는 부분 함수 종속과 이행 함수 종속을 혼동하지 않도록 표를 나눠서 생각하는 것이 좋습니다.")

    why_wrong = explanation.get("why_others_wrong", [])
    if why_wrong:
        traps.append(why_wrong[0])

    if not traps:
        traps.append("보기 표현이 비슷할수록 문제의 핵심 기준을 먼저 정하고 하나씩 대조하는 편이 안전합니다.")

    return unique_nonempty(traps)


def build_answer_checklist(question):
    explanation = question.get("explanation", {})
    items = []
    for concept in explanation.get("key_concepts", [])[:4]:
        items.append(f"핵심 개념 '{concept}'을(를) 설명할 수 있는지 확인합니다.")
    for cue in explanation.get("memory_cues", [])[:2]:
        items.append(f"암기 포인트를 떠올립니다. {cue}")
    if not items:
        items.append("정답 근거를 한 문장으로 다시 말해 보며 개념이 남았는지 확인합니다.")
    return unique_nonempty(items)


def build_detailed_summary(question, choice_analysis, solving_steps, traps):
    explanation = question.get("explanation", {})
    parts = []
    summary = normalize_space(explanation.get("summary", ""))
    source_text = normalize_space(explanation.get("source_text", ""))

    if summary:
        parts.append(summary)
    if source_text and source_text not in parts:
        parts.append(source_text)
    if solving_steps:
        parts.append(f"풀이 순서는 {solving_steps[0]}")
    if choice_analysis:
        correct = next((item for item in choice_analysis if item["is_correct"]), None)
        if correct:
            parts.append(correct["analysis"])
    if traps:
        parts.append(f"시험 포인트는 {traps[0]}")

    return normalize_space(" ".join(parts))


def enrich_question(question):
    explanation = question.setdefault("explanation", {})
    question.setdefault("question", {})["interaction"] = {
        "selection_mode": "single_select",
        "selection_min": 1,
        "selection_max": 1,
        "submit_mode": "explicit_submit",
    }

    choice_analysis = build_choice_analysis(question)
    solving_steps = build_solving_steps(question)
    exam_traps = build_exam_traps(question)
    answer_checklist = build_answer_checklist(question)
    detailed_summary = build_detailed_summary(question, choice_analysis, solving_steps, exam_traps)

    explanation["choice_analysis"] = choice_analysis
    explanation["solving_steps"] = solving_steps
    explanation["exam_traps"] = exam_traps
    explanation["answer_checklist"] = answer_checklist
    explanation["detailed_summary"] = detailed_summary

    return question


def main():
    updated_topic_files = 0
    updated_questions = 0

    for topic_path in sorted(TOPICS_DIR.glob("*.json")):
        data = json.loads(topic_path.read_text(encoding="utf-8"))
        questions = data.get("questions", [])
        for question in questions:
            enrich_question(question)
            updated_questions += 1
        topic_path.write_text(
            json.dumps(data, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        updated_topic_files += 1

    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    manifest["explanation_enrichment"] = {
        "version": "question-bank-explanation.v1",
        "updated_at": datetime.now().isoformat(timespec="seconds"),
        "updated_topic_files": updated_topic_files,
        "updated_questions": updated_questions,
    }
    MANIFEST_PATH.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print("question bank explanation enrichment complete")
    print(f"- topic files: {updated_topic_files}")
    print(f"- questions: {updated_questions}")


if __name__ == "__main__":
    main()
