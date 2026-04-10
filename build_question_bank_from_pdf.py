from __future__ import annotations

import argparse
import hashlib
import io
import json
import re
import shutil
import struct
import threading
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

from google import genai
from google.genai import types
from google.oauth2 import service_account
from pypdf import PdfReader, PdfWriter
try:
    import fitz
except ImportError:
    fitz = None

from build_topic_dataset import SUBJECTS, TOPIC_DEFINITIONS


ROOT = Path(__file__).resolve().parent
DEFAULT_PDF_PATH = r"G:\내 드라이브\정통\정처기\정보처리기사_필기기본서기출문제집.pdf"
DEFAULT_OUT_DIR = ROOT / "study-app" / "data" / "question-bank"
DEFAULT_ARTIFACTS_DIR = ROOT / "artifacts_pdf"
DEFAULT_FIGURE_SAMPLES_DIR = DEFAULT_ARTIFACTS_DIR / "crop_samples"
DEFAULT_MODEL = "gemini-3-flash-preview"
DEFAULT_LOCATION = "global"
DEFAULT_PAGES_PER_CHUNK = 6
DEFAULT_CHUNK_OVERLAP_PAGES = 1
DEFAULT_MAX_CHUNK_BYTES = 15 * 1024 * 1024
DEFAULT_MAX_OUTPUT_TOKENS = 65535
DEFAULT_TEMPERATURE = 0.2
DEFAULT_SAVE_EVERY = 5
DEFAULT_RETRIES = 3
DEFAULT_RETRY_WAIT_SECONDS = 8.0
DEFAULT_VISUAL_IMAGE_SCALE = 2.0

RAW_SCHEMA_VERSION = "question-bank-raw-chunk.v1"
MACHINE_CHUNK_SCHEMA_VERSION = "question-bank-chunk.v1"
MACHINE_MANIFEST_SCHEMA_VERSION = "question-bank-chunk-manifest.v1"
FINAL_MANIFEST_SCHEMA_VERSION = "question-bank-manifest.v1"
FINAL_TAXONOMY_SCHEMA_VERSION = "question-bank-taxonomy.v1"
FINAL_TOPIC_SCHEMA_VERSION = "question-bank-topic.v1"
FINAL_REVIEW_QUEUE_SCHEMA_VERSION = "question-bank-review-queue.v1"
FINAL_VISUAL_ASSETS_SCHEMA_VERSION = "question-bank-visual-assets.v1"
FINAL_FIGURE_CROPS_SCHEMA_VERSION = "question-bank-figure-crops.v1"

CLIENT_CACHE = threading.local()
VISUAL_REVIEW_REASON_MARKERS = (
    "diagram",
    "그림",
    "도표",
    "노드",
    "tree structure",
    "heap tree",
    "flowchart",
    "code block",
    "코드 블록",
)
VISUAL_STEM_MARKERS = (
    "그림",
    "도표",
    "diagram",
    "flowchart",
    "순서도",
    "트리",
    "tree",
    "heap",
    "uml",
    "erd",
    "e-r",
)

QUESTION_CHUNK_SCHEMA: dict[str, Any] = {
    "type": "OBJECT",
    "properties": {
        "chunk_summary": {"type": "STRING"},
        "questions": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "source_pages": {
                        "type": "ARRAY",
                        "items": {"type": "INTEGER"},
                    },
                    "source_chapter_path": {
                        "type": "ARRAY",
                        "items": {"type": "STRING"},
                    },
                    "question_type": {"type": "STRING"},
                    "stem": {"type": "STRING"},
                    "choices": {
                        "type": "ARRAY",
                        "items": {
                            "type": "OBJECT",
                            "properties": {
                                "label": {"type": "STRING"},
                                "text": {"type": "STRING"},
                            },
                            "required": ["label", "text"],
                        },
                    },
                    "answer": {
                        "type": "OBJECT",
                        "properties": {
                            "correct_labels": {
                                "type": "ARRAY",
                                "items": {"type": "STRING"},
                            },
                            "correct_text": {"type": "STRING"},
                        },
                        "required": ["correct_labels", "correct_text"],
                    },
                    "source_explanation": {"type": "STRING"},
                    "diagram_dependency": {"type": "STRING"},
                    "review_reasons": {
                        "type": "ARRAY",
                        "items": {"type": "STRING"},
                    },
                    "keywords": {
                        "type": "ARRAY",
                        "items": {"type": "STRING"},
                    },
                    "exam_taxonomy_draft": {
                        "type": "OBJECT",
                        "properties": {
                            "subject_name": {"type": "STRING"},
                            "topic_name": {"type": "STRING"},
                        },
                        "required": ["subject_name", "topic_name"],
                    },
                    "explanation_draft": {
                        "type": "OBJECT",
                        "properties": {
                            "summary": {"type": "STRING"},
                            "why_correct": {
                                "type": "ARRAY",
                                "items": {"type": "STRING"},
                            },
                            "why_others_wrong": {
                                "type": "ARRAY",
                                "items": {"type": "STRING"},
                            },
                            "key_concepts": {
                                "type": "ARRAY",
                                "items": {"type": "STRING"},
                            },
                            "memory_cues": {
                                "type": "ARRAY",
                                "items": {"type": "STRING"},
                            },
                        },
                        "required": [
                            "summary",
                            "why_correct",
                            "why_others_wrong",
                            "key_concepts",
                            "memory_cues",
                        ],
                    },
                },
                "required": [
                    "source_pages",
                    "source_chapter_path",
                    "question_type",
                    "stem",
                    "choices",
                    "answer",
                    "source_explanation",
                    "diagram_dependency",
                    "review_reasons",
                    "keywords",
                    "exam_taxonomy_draft",
                    "explanation_draft",
                ],
            },
        },
    },
    "required": ["chunk_summary", "questions"],
}

CHOICE_LABEL_MAP = {
    "①": "1",
    "②": "2",
    "③": "3",
    "④": "4",
    "⑤": "5",
    "⑥": "6",
    "⑦": "7",
    "⑧": "8",
    "⑨": "9",
    "⑩": "10",
    "❶": "1",
    "❷": "2",
    "❸": "3",
    "❹": "4",
    "❺": "5",
    "⑴": "1",
    "⑵": "2",
    "⑶": "3",
    "⑷": "4",
    "⑸": "5",
}

KNOWN_SHORT_TOKENS = {
    "db",
    "er",
    "ip",
    "os",
    "ui",
    "xp",
    "ai",
    "sw",
    "sql",
    "ddl",
    "dml",
    "dcl",
    "uml",
    "soa",
    "drm",
    "tcpip",
    "ipv6",
    "case",
    "baas",
    "wlan",
}

TOKEN_ALIASES = {
    "s/w": "소프트웨어",
    "sw": "소프트웨어",
    "software": "소프트웨어",
    "engineering": "공학",
    "db": "db",
    "dbms": "dbms",
    "database": "데이터베이스",
    "uml": "uml",
    "ui": "ui",
    "tcp/ip": "tcpip",
    "tcpip": "tcpip",
    "ip": "ip",
    "ipv6": "ipv6",
    "er": "er",
    "e-r": "er",
    "sql": "sql",
    "ddl": "ddl",
    "dml": "dml",
    "dcl": "dcl",
    "crud": "crud",
    "xp": "xp",
    "soa": "soa",
    "baas": "baas",
    "drm": "drm",
    "wlan": "wlan",
    "case": "case",
    "linux": "linux",
    "unix": "unix",
}

DIAGRAM_DEPENDENCY_VALUES = {"none", "helpful", "required", "unknown"}


@dataclass(frozen=True)
class ChunkSpec:
    chunk_id: str
    start_page: int
    end_page: int
    pdf_bytes: bytes
    source_pdf: Path

    @property
    def page_numbers(self) -> list[int]:
        return list(range(self.start_page, self.end_page + 1))

    @property
    def page_count(self) -> int:
        return self.end_page - self.start_page + 1

    @property
    def byte_size(self) -> int:
        return len(self.pdf_bytes)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Extract a topic-grouped question bank from a PDF with Vertex AI Gemini."
    )
    parser.add_argument("--pdf", default=str(DEFAULT_PDF_PATH))
    parser.add_argument("--out-dir", default=str(DEFAULT_OUT_DIR))
    parser.add_argument("--artifacts-dir", default=str(DEFAULT_ARTIFACTS_DIR))
    parser.add_argument("--figure-samples-dir", default=str(DEFAULT_FIGURE_SAMPLES_DIR))
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--credentials-json")
    parser.add_argument("--project-id")
    parser.add_argument("--location", default=DEFAULT_LOCATION)
    parser.add_argument("--temperature", type=float, default=DEFAULT_TEMPERATURE)
    parser.add_argument("--max-output-tokens", type=int, default=DEFAULT_MAX_OUTPUT_TOKENS)
    parser.add_argument("--start-page", type=int, default=1)
    parser.add_argument("--end-page", type=int)
    parser.add_argument("--pages-per-chunk", type=int, default=DEFAULT_PAGES_PER_CHUNK)
    parser.add_argument("--chunk-overlap-pages", type=int, default=DEFAULT_CHUNK_OVERLAP_PAGES)
    parser.add_argument("--max-chunk-bytes", type=int, default=DEFAULT_MAX_CHUNK_BYTES)
    parser.add_argument("--save-every", type=int, default=DEFAULT_SAVE_EVERY)
    parser.add_argument("--retries", type=int, default=DEFAULT_RETRIES)
    parser.add_argument("--retry-wait-seconds", type=float, default=DEFAULT_RETRY_WAIT_SECONDS)
    visual_group = parser.add_mutually_exclusive_group()
    visual_group.add_argument("--render-visual-assets", dest="render_visual_assets", action="store_true")
    visual_group.add_argument("--skip-visual-assets", dest="render_visual_assets", action="store_false")
    parser.set_defaults(render_visual_assets=True)
    parser.add_argument("--visual-image-scale", type=float, default=DEFAULT_VISUAL_IMAGE_SCALE)
    parser.add_argument("--overwrite", action="store_true")
    return parser.parse_args()


def collapse_whitespace(value: Any) -> str:
    if value is None:
        return ""
    return re.sub(r"\s+", " ", str(value)).strip()


def normalize_multiline_text(value: Any) -> str:
    if value is None:
        return ""
    text = str(value).replace("\r\n", "\n").replace("\r", "\n")
    lines = [collapse_whitespace(line) for line in text.split("\n")]
    return "\n".join(line for line in lines if line)


def strip_code_fences(text: str) -> str:
    stripped = text.strip()
    if stripped.startswith("```"):
        stripped = re.sub(r"^```(?:json)?\s*", "", stripped)
        stripped = re.sub(r"\s*```$", "", stripped)
    return stripped.strip()


def unique_nonempty(items: list[str], *, limit: int | None = None) -> list[str]:
    output: list[str] = []
    seen: set[str] = set()
    for item in items:
        cleaned = collapse_whitespace(item)
        if not cleaned:
            continue
        key = cleaned.casefold()
        if key in seen:
            continue
        seen.add(key)
        output.append(cleaned)
        if limit is not None and len(output) >= limit:
            break
    return output


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def build_pdf_asset_namespace(pdf_path: Path) -> str:
    stat = pdf_path.stat()
    seed = f"{pdf_path.resolve()}|{stat.st_size}|{int(stat.st_mtime)}"
    return hashlib.sha1(seed.encode("utf-8")).hexdigest()[:12]


def build_visual_scale_token(scale: float) -> str:
    return f"x{str(scale).replace('.', '_')}"


def read_png_size(path: Path) -> tuple[int, int]:
    with path.open("rb") as handle:
        header = handle.read(24)
    if len(header) < 24 or header[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(f"Invalid PNG header: {path}")
    width, height = struct.unpack(">II", header[16:24])
    return int(width), int(height)


def should_link_visual_assets(question: dict[str, Any]) -> bool:
    quality = question.get("quality") or {}
    diagram_dependency = quality.get("diagram_dependency", "none")
    if diagram_dependency in {"helpful", "required"}:
        return True

    stem = collapse_whitespace((question.get("question") or {}).get("stem")).casefold()
    if any(marker in stem for marker in VISUAL_STEM_MARKERS):
        return True

    reasons = [collapse_whitespace(reason).casefold() for reason in quality.get("review_reasons", [])]
    return any(marker in reason for reason in reasons for marker in VISUAL_REVIEW_REASON_MARKERS)


def build_empty_visual_assets(question: dict[str, Any]) -> dict[str, Any]:
    return {
        "enabled": False,
        "visual_dependency": (question.get("quality") or {}).get("diagram_dependency", "none"),
        "usage_mode": "none",
        "page_numbers": [],
        "page_images": [],
        "question_figure_crops": [],
        "preferred_display_asset": None,
        "primary_image": None,
    }


def resolve_root_relative_path(path_value: str) -> Path:
    path = Path(path_value)
    if path.is_absolute():
        return path
    return ROOT / path


def make_root_relative_posix(path: Path) -> str:
    try:
        return path.resolve().relative_to(ROOT).as_posix()
    except Exception:
        return path.as_posix()


def render_visual_assets(
    questions: list[dict[str, Any]],
    pdf_path: Path,
    out_dir: Path,
    visual_image_scale: float,
) -> dict[str, Any]:
    manifest_generated_at = datetime.now().isoformat(timespec="seconds")
    asset_namespace = build_pdf_asset_namespace(pdf_path)
    assets_root = Path("images") / "pages" / asset_namespace / build_visual_scale_token(visual_image_scale)

    visual_questions = [question for question in questions if should_link_visual_assets(question)]
    if not visual_questions:
        for question in questions:
            question["visual_assets"] = build_empty_visual_assets(question)
        return {
            "schema_version": FINAL_VISUAL_ASSETS_SCHEMA_VERSION,
            "generated_at": manifest_generated_at,
            "source_pdf": str(pdf_path),
            "rendering": {
                "engine": "pymupdf",
                "image_format": "png",
                "scale": visual_image_scale,
            },
            "assets_root": assets_root.as_posix(),
            "visual_question_count": 0,
            "total_asset_count": 0,
            "items": [],
        }

    if fitz is None:
        raise RuntimeError(
            "Visual asset rendering requires PyMuPDF. Install dependencies with `python -m pip install -r requirements.txt`."
        )

    pages_to_render = sorted(
        {
            page_number
            for question in visual_questions
            for page_number in question["source"]["source_pages"]
            if isinstance(page_number, int) and page_number > 0
        }
    )
    images_dir = out_dir / assets_root
    images_dir.mkdir(parents=True, exist_ok=True)
    page_assets: dict[int, dict[str, Any]] = {}

    document = fitz.open(str(pdf_path))
    try:
        for page_number in pages_to_render:
            relative_path = (assets_root / f"page_{page_number:04d}.png").as_posix()
            absolute_path = out_dir / relative_path
            if absolute_path.exists():
                width, height = read_png_size(absolute_path)
            else:
                page = document.load_page(page_number - 1)
                pixmap = page.get_pixmap(matrix=fitz.Matrix(visual_image_scale, visual_image_scale), alpha=False)
                pixmap.save(str(absolute_path))
                width, height = pixmap.width, pixmap.height

            page_assets[page_number] = {
                "asset_id": f"page_{page_number:04d}",
                "page_number": page_number,
                "relative_path": relative_path,
                "content_type": "image/png",
                "width": width,
                "height": height,
                "file_size_bytes": absolute_path.stat().st_size,
                "render_scale": visual_image_scale,
            }
    finally:
        document.close()

    for question in questions:
        if not should_link_visual_assets(question):
            question["visual_assets"] = build_empty_visual_assets(question)
            continue

        page_images = [
            dict(page_assets[page_number])
            for page_number in question["source"]["source_pages"]
            if page_number in page_assets
        ]
        question["visual_assets"] = {
            "enabled": bool(page_images),
            "visual_dependency": question["quality"]["diagram_dependency"],
            "usage_mode": "shared_page_png" if page_images else "none",
            "page_numbers": [item["page_number"] for item in page_images],
            "page_images": page_images,
            "question_figure_crops": [],
            "preferred_display_asset": dict(page_images[0], kind="page_image") if page_images else None,
            "primary_image": dict(page_images[0]) if page_images else None,
        }

    linked_question_ids: dict[int, list[str]] = {page_number: [] for page_number in page_assets}
    for question in questions:
        if not question.get("visual_assets", {}).get("enabled"):
            continue
        for page_number in question["visual_assets"]["page_numbers"]:
            linked_question_ids.setdefault(page_number, []).append(question["question_id"])

    items = []
    for page_number in sorted(page_assets):
        item = dict(page_assets[page_number])
        item["linked_question_ids"] = sorted(set(linked_question_ids.get(page_number, [])))
        items.append(item)

    return {
        "schema_version": FINAL_VISUAL_ASSETS_SCHEMA_VERSION,
        "generated_at": manifest_generated_at,
        "source_pdf": str(pdf_path),
        "rendering": {
            "engine": "pymupdf",
            "image_format": "png",
            "scale": visual_image_scale,
        },
        "assets_root": assets_root.as_posix(),
        "visual_question_count": sum(1 for question in questions if question.get("visual_assets", {}).get("enabled")),
        "total_asset_count": len(items),
        "items": items,
    }


def load_question_figure_crops(samples_dir: Path, out_dir: Path) -> tuple[dict[str, list[dict[str, Any]]], dict[str, Any]]:
    mapping: dict[str, list[dict[str, Any]]] = {}
    items: list[dict[str, Any]] = []

    if not samples_dir.exists():
        return mapping, {
            "schema_version": FINAL_FIGURE_CROPS_SCHEMA_VERSION,
            "generated_at": datetime.now().isoformat(timespec="seconds"),
            "source_dir": make_root_relative_posix(samples_dir),
            "question_count": 0,
            "asset_count": 0,
            "items": [],
        }

    for metadata_path in sorted(samples_dir.glob("*.json")):
        try:
            payload = json.loads(metadata_path.read_text(encoding="utf-8"))
        except Exception:
            continue

        if payload.get("sample_type") != "question_figure_crop":
            continue

        question_id = collapse_whitespace(payload.get("question_id"))
        image_relative_path = collapse_whitespace(payload.get("image_relative_path"))
        if not question_id or not image_relative_path:
            continue

        source_image_path = resolve_root_relative_path(image_relative_path)
        if not source_image_path.exists():
            continue

        asset_index = len(mapping.get(question_id, [])) + 1
        asset_id = collapse_whitespace(payload.get("asset_id")) or f"{question_id}__figure_{asset_index:02d}"
        asset_role = collapse_whitespace(payload.get("asset_role")) or "diagram_only"
        extension = source_image_path.suffix.lower() or ".png"
        dest_relative_path = (
            Path("images")
            / "question-figures"
            / question_id
            / f"{asset_id}{extension}"
        )
        dest_path = out_dir / dest_relative_path
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source_image_path, dest_path)
        width, height = read_png_size(dest_path)

        asset = {
            "asset_id": asset_id,
            "question_id": question_id,
            "kind": "question_figure_crop",
            "asset_role": asset_role,
            "fidelity": "exact",
            "relative_path": dest_relative_path.as_posix(),
            "content_type": "image/png",
            "width": width,
            "height": height,
            "file_size_bytes": dest_path.stat().st_size,
            "source_page": payload.get("source_page"),
            "crop_rect_pdf_points": payload.get("crop_rect_pdf_points") or [],
            "render_scale": payload.get("render_scale"),
            "sample_metadata_relative_path": make_root_relative_posix(metadata_path),
            "sample_image_relative_path": make_root_relative_posix(source_image_path),
            "notes": payload.get("notes") or [],
        }
        mapping.setdefault(question_id, []).append(asset)
        items.append(asset)

    items.sort(key=lambda item: (item["question_id"], item["asset_id"]))
    return mapping, {
        "schema_version": FINAL_FIGURE_CROPS_SCHEMA_VERSION,
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "source_dir": make_root_relative_posix(samples_dir),
        "question_count": len(mapping),
        "asset_count": len(items),
        "items": items,
    }


def apply_question_figure_crops(
    questions: list[dict[str, Any]],
    figure_crops_by_question_id: dict[str, list[dict[str, Any]]],
) -> None:
    for question in questions:
        visual_assets = question.get("visual_assets") or build_empty_visual_assets(question)
        crops = [dict(item) for item in figure_crops_by_question_id.get(question["question_id"], [])]
        visual_assets["question_figure_crops"] = crops

        if crops:
            visual_assets["enabled"] = True
            visual_assets["usage_mode"] = "question_figure_crop"
            visual_assets["preferred_display_asset"] = dict(crops[0])
            visual_assets["primary_image"] = dict(crops[0])
        elif visual_assets.get("primary_image"):
            visual_assets["preferred_display_asset"] = dict(visual_assets["primary_image"], kind="page_image")
        else:
            visual_assets["preferred_display_asset"] = None

        question["visual_assets"] = visual_assets


def detect_default_credentials(cwd: Path) -> Path | None:
    for candidate in sorted(cwd.glob("*.json")):
        try:
            data = json.loads(candidate.read_text(encoding="utf-8"))
        except Exception:
            continue
        if data.get("type") == "service_account":
            return candidate
    return None


def read_project_id(credentials_path: Path) -> str:
    data = json.loads(credentials_path.read_text(encoding="utf-8"))
    project_id = data.get("project_id")
    if not project_id:
        raise ValueError(f"project_id not found in credentials file: {credentials_path}")
    return project_id


def build_client(credentials_path: Path, project_id: str, location: str) -> genai.Client:
    credentials = service_account.Credentials.from_service_account_file(
        str(credentials_path),
        scopes=["https://www.googleapis.com/auth/cloud-platform"],
    )
    return genai.Client(
        vertexai=True,
        project=project_id,
        location=location,
        credentials=credentials,
        http_options=types.HttpOptions(api_version="v1"),
    )


def get_thread_client(credentials_path: Path, project_id: str, location: str) -> genai.Client:
    cache_key = (str(credentials_path.resolve()), project_id, location)
    cached_key = getattr(CLIENT_CACHE, "cache_key", None)
    cached_client = getattr(CLIENT_CACHE, "client", None)
    if cached_key == cache_key and cached_client is not None:
        return cached_client
    client = build_client(credentials_path, project_id, location)
    CLIENT_CACHE.cache_key = cache_key
    CLIENT_CACHE.client = client
    return client


def normalize_token_text(text: str) -> str:
    normalized = normalize_multiline_text(text).lower()
    normalized = normalized.replace("tcp/ip", " tcpip ")
    normalized = normalized.replace("e-r", " er ")
    normalized = normalized.replace("/", " ")
    normalized = normalized.replace("·", " ")
    normalized = normalized.replace("(", " ")
    normalized = normalized.replace(")", " ")
    normalized = normalized.replace(",", " ")
    return normalized


def tokenize_text(text: str) -> set[str]:
    normalized = normalize_token_text(text)
    raw_tokens = re.findall(r"[0-9a-zA-Z가-힣.+-]+", normalized)
    tokens: set[str] = set()
    for token in raw_tokens:
        token = token.strip("._-+")
        if not token:
            continue
        token = TOKEN_ALIASES.get(token, token)
        if token.isdigit():
            continue
        if len(token) < 2 and token not in KNOWN_SHORT_TOKENS:
            continue
        tokens.add(token)
    return tokens


def normalize_choice_label(value: Any, fallback_index: int | None = None) -> str:
    label = collapse_whitespace(value)
    if not label and fallback_index is not None:
        return str(fallback_index)
    if not label:
        return ""
    label = CHOICE_LABEL_MAP.get(label, label)
    match = re.match(r"^([0-9]+|[A-Za-z]|[ㄱ-ㅎ])(?:[.)]|번)?$", label)
    if match:
        token = match.group(1)
        return token.upper() if token.isalpha() else token
    label = label.strip("()[]{}.")
    if label in CHOICE_LABEL_MAP:
        return CHOICE_LABEL_MAP[label]
    return label.upper()


def normalize_diagram_dependency(value: Any) -> str:
    token = collapse_whitespace(value).lower()
    if token in {"", "없음", "none", "no"}:
        return "none"
    if token in {"helpful", "partial", "보조", "참고"}:
        return "helpful"
    if token in {"required", "필수", "yes", "diagram"}:
        return "required"
    if token not in DIAGRAM_DEPENDENCY_VALUES:
        return "unknown"
    return token


def sort_pages(values: list[int]) -> list[int]:
    return sorted(set(value for value in values if value > 0))


def build_exam_topics() -> list[dict[str, Any]]:
    exam_topics: list[dict[str, Any]] = []
    for index, definition in enumerate(TOPIC_DEFINITIONS, start=1):
        subject = SUBJECTS[definition["subject_id"]]
        title = definition["title"]
        exam_topics.append(
            {
                "topic_id": f"topic_{index:03d}",
                "sequence": index,
                "subject_id": definition["subject_id"],
                "subject_name": subject["name"],
                "subject_emoji": subject["emoji"],
                "subject_color": subject["color"],
                "title": title,
                "topic_tokens": tokenize_text(title),
                "subject_tokens": tokenize_text(subject["name"]),
            }
        )
    return exam_topics


EXAM_TOPICS = build_exam_topics()


def build_pdf_chunk_bytes(reader: PdfReader, start_page: int, end_page: int) -> bytes:
    writer = PdfWriter()
    for page_index in range(start_page - 1, end_page):
        writer.add_page(reader.pages[page_index])
    buffer = io.BytesIO()
    writer.write(buffer)
    return buffer.getvalue()


def split_range_to_chunks(
    reader: PdfReader,
    source_pdf: Path,
    start_page: int,
    end_page: int,
    max_chunk_bytes: int,
) -> list[ChunkSpec]:
    pdf_bytes = build_pdf_chunk_bytes(reader, start_page, end_page)
    if len(pdf_bytes) <= max_chunk_bytes or start_page == end_page:
        chunk_id = f"chunk_p{start_page:04d}_p{end_page:04d}"
        return [
            ChunkSpec(
                chunk_id=chunk_id,
                start_page=start_page,
                end_page=end_page,
                pdf_bytes=pdf_bytes,
                source_pdf=source_pdf,
            )
        ]

    mid = (start_page + end_page) // 2
    return split_range_to_chunks(reader, source_pdf, start_page, mid, max_chunk_bytes) + split_range_to_chunks(
        reader, source_pdf, mid + 1, end_page, max_chunk_bytes
    )


def build_chunk_specs(
    pdf_path: Path,
    start_page: int,
    end_page: int,
    pages_per_chunk: int,
    chunk_overlap_pages: int,
    max_chunk_bytes: int,
) -> tuple[list[ChunkSpec], int]:
    reader = PdfReader(str(pdf_path))
    total_pages = len(reader.pages)

    if total_pages <= 0:
        raise ValueError("The source PDF has no pages")
    if start_page < 1:
        raise ValueError("--start-page must be at least 1")
    if end_page > total_pages:
        raise ValueError(f"--end-page exceeds the PDF page count ({total_pages})")
    if start_page > end_page:
        raise ValueError("--start-page cannot be greater than --end-page")
    if pages_per_chunk < 1:
        raise ValueError("--pages-per-chunk must be at least 1")
    if chunk_overlap_pages < 0:
        raise ValueError("--chunk-overlap-pages cannot be negative")
    if max_chunk_bytes < 1024:
        raise ValueError("--max-chunk-bytes is too small")

    step = max(1, pages_per_chunk - chunk_overlap_pages)
    chunks: list[ChunkSpec] = []
    current = start_page
    while current <= end_page:
        range_end = min(end_page, current + pages_per_chunk - 1)
        chunks.extend(split_range_to_chunks(reader, pdf_path, current, range_end, max_chunk_bytes))
        if range_end >= end_page:
            break
        current += step
    return chunks, total_pages


def build_chunk_prompt(chunk: ChunkSpec) -> str:
    page_list = ", ".join(str(page) for page in chunk.page_numbers)
    subject_names = ", ".join(SUBJECTS[subject_id]["name"] for subject_id in sorted(SUBJECTS))
    topic_names = "; ".join(topic["title"] for topic in EXAM_TOPICS)
    return f"""
You are extracting a Korean exam question bank from a PDF chunk.

This chunk contains original PDF pages: {page_list}.
Always use those original PDF page numbers in source_pages.

Return JSON only and follow the schema exactly.

Tasks:
1. Extract only actual problems. Ignore cover pages, tables of contents, pure theory pages, and generic study tips unless they are directly part of a problem or its printed explanation.
2. Preserve the problem text faithfully in Korean.
3. If the question spans multiple pages, include every relevant original page number in source_pages.
4. source_chapter_path must be a top-down array, for example ["과목", "장", "절"]. If you can only identify part of the path, return the partial path.
5. question_type must be "single_choice" when numbered or lettered choices are visible. Otherwise use "unknown".
6. choices must preserve the visible choice text. If a choice label is missing but the choice is visible, still return the choice with an inferred sequential label.
7. answer.correct_labels should use normalized labels such as "1", "2", "A", "ㄱ". If the answer is not explicitly clear, return an empty array and add a review_reasons item.
8. source_explanation should capture the printed explanation or 해설 when present. If it is absent, return an empty string.
9. diagram_dependency must be one of: none, helpful, required, unknown.
10. review_reasons should mention OCR uncertainty, ambiguous answer, diagram dependency, page split risk, or anything that needs manual review.
11. keywords should contain 3 to 8 short study keywords.
12. exam_taxonomy_draft.subject_name should preferably be one of: {subject_names}
13. exam_taxonomy_draft.topic_name should be the closest detailed topic guess from the official taxonomy. Official topic names:
{topic_names}
14. explanation_draft must be concise, study-friendly Korean for later AI use.

Rules:
- Use Korean.
- Do not invent a question that is not actually present.
- Do not convert theory pages into synthetic questions.
- Keep empty arrays instead of hallucinating.
- If text is partly unclear, keep the readable portion and mention the issue in review_reasons.
""".strip()


def parse_json_response(response_text: str) -> dict[str, Any]:
    payload = json.loads(strip_code_fences(response_text))
    if not isinstance(payload, dict):
        raise ValueError("Model output is not a JSON object")
    return payload


def normalize_string_list(value: Any, *, limit: int | None = None) -> list[str]:
    if isinstance(value, list):
        items = [collapse_whitespace(item) for item in value]
    else:
        text = normalize_multiline_text(value)
        items = re.split(r"\n+|[;,]\s*", text) if text else []
    return unique_nonempty(items, limit=limit)


def normalize_chapter_path(value: Any) -> list[str]:
    if isinstance(value, list):
        items = [collapse_whitespace(item) for item in value]
    else:
        text = normalize_multiline_text(value)
        items = re.split(r"\s*[>›/|]\s*|\s*-\s*", text) if text else []
    return unique_nonempty(items, limit=8)


def normalize_choice_items(value: Any) -> list[dict[str, str]]:
    if not isinstance(value, list):
        return []
    choices: list[dict[str, str]] = []
    for index, item in enumerate(value, start=1):
        if not isinstance(item, dict):
            continue
        text = normalize_multiline_text(item.get("text"))
        if not text:
            continue
        label = normalize_choice_label(item.get("label"), fallback_index=index)
        choices.append({"label": label or str(index), "text": text})
    return choices


def normalize_question_type(value: Any, choices: list[dict[str, str]]) -> str:
    token = collapse_whitespace(value).lower()
    if choices:
        return "single_choice"
    if token in {"single_choice", "unknown"}:
        return token
    return "unknown"


def normalize_page_numbers(value: Any, allowed_pages: list[int]) -> tuple[list[int], bool]:
    pages: list[int] = []
    if isinstance(value, list):
        for item in value:
            try:
                page = int(item)
            except Exception:
                continue
            if page in allowed_pages:
                pages.append(page)
    normalized = sort_pages(pages)
    if normalized:
        return normalized, False
    return allowed_pages[:], True


def choice_text_lookup(choices: list[dict[str, str]]) -> dict[str, str]:
    return {choice["label"]: choice["text"] for choice in choices if choice.get("label")}


def infer_answer_fields(answer_payload: Any, choices: list[dict[str, str]]) -> dict[str, Any]:
    if not isinstance(answer_payload, dict):
        answer_payload = {}
    correct_labels = [
        normalize_choice_label(label)
        for label in (answer_payload.get("correct_labels") or [])
    ]
    correct_labels = [label for label in correct_labels if label]
    correct_labels = unique_nonempty(correct_labels)
    correct_text = normalize_multiline_text(answer_payload.get("correct_text"))
    choice_map = choice_text_lookup(choices)

    if not correct_labels and correct_text:
        normalized_target = collapse_whitespace(correct_text).casefold()
        for label, choice_text in choice_map.items():
            if collapse_whitespace(choice_text).casefold() == normalized_target:
                correct_labels = [label]
                break

    if correct_labels and not correct_text:
        resolved = [choice_map[label] for label in correct_labels if label in choice_map]
        correct_text = " / ".join(resolved)

    correct_choice_texts = [choice_map[label] for label in correct_labels if label in choice_map]
    return {
        "correct_labels": correct_labels,
        "correct_text": correct_text,
        "correct_choice_texts": correct_choice_texts,
    }


def validate_chunk_analysis(data: dict[str, Any], chunk: ChunkSpec) -> dict[str, Any]:
    summary = collapse_whitespace(data.get("chunk_summary"))
    questions_input = data.get("questions")
    if not isinstance(questions_input, list):
        raise ValueError("questions is missing")

    questions: list[dict[str, Any]] = []
    for item in questions_input:
        if not isinstance(item, dict):
            continue
        stem = normalize_multiline_text(item.get("stem"))
        if not stem:
            continue

        choices = normalize_choice_items(item.get("choices"))
        question_type = normalize_question_type(item.get("question_type"), choices)
        source_pages, used_page_fallback = normalize_page_numbers(item.get("source_pages"), chunk.page_numbers)
        source_chapter_path = normalize_chapter_path(item.get("source_chapter_path"))
        source_explanation = normalize_multiline_text(item.get("source_explanation"))
        answer = infer_answer_fields(item.get("answer"), choices)
        review_reasons = normalize_string_list(item.get("review_reasons"), limit=12)
        if used_page_fallback:
            review_reasons.append("source_pages를 청크 전체 페이지로 보정함")
        if not answer["correct_labels"] and not answer["correct_text"]:
            review_reasons.append("정답을 확정하지 못함")
        if not source_chapter_path:
            review_reasons.append("교재 챕터 경로를 확정하지 못함")

        explanation_draft = item.get("explanation_draft") if isinstance(item.get("explanation_draft"), dict) else {}
        normalized_question = {
            "source_pages": source_pages,
            "source_chapter_path": source_chapter_path,
            "question_type": question_type,
            "stem": stem,
            "choices": choices,
            "answer": answer,
            "source_explanation": source_explanation,
            "diagram_dependency": normalize_diagram_dependency(item.get("diagram_dependency")),
            "review_reasons": unique_nonempty(review_reasons, limit=16),
            "keywords": normalize_string_list(item.get("keywords"), limit=10),
            "exam_taxonomy_draft": {
                "subject_name": collapse_whitespace(
                    (item.get("exam_taxonomy_draft") or {}).get("subject_name")
                ),
                "topic_name": collapse_whitespace(
                    (item.get("exam_taxonomy_draft") or {}).get("topic_name")
                ),
            },
            "explanation_draft": {
                "summary": normalize_multiline_text(explanation_draft.get("summary")),
                "why_correct": normalize_string_list(explanation_draft.get("why_correct"), limit=6),
                "why_others_wrong": normalize_string_list(explanation_draft.get("why_others_wrong"), limit=8),
                "key_concepts": normalize_string_list(explanation_draft.get("key_concepts"), limit=8),
                "memory_cues": normalize_string_list(explanation_draft.get("memory_cues"), limit=8),
            },
        }
        questions.append(normalized_question)

    return {
        "chunk_summary": summary,
        "questions": questions,
    }


def analyze_chunk(
    client: genai.Client,
    chunk: ChunkSpec,
    model: str,
    max_output_tokens: int,
    temperature: float,
) -> tuple[dict[str, Any], str]:
    pdf_part = types.Part.from_bytes(data=chunk.pdf_bytes, mime_type="application/pdf")
    config = types.GenerateContentConfig(
        response_mime_type="application/json",
        response_schema=QUESTION_CHUNK_SCHEMA,
        temperature=temperature,
        candidate_count=1,
        max_output_tokens=max_output_tokens,
    )
    response = client.models.generate_content(
        model=model,
        contents=[pdf_part, build_chunk_prompt(chunk)],
        config=config,
    )
    response_text = (response.text or "").strip()
    if not response_text:
        raise ValueError("Empty response received from model")
    return validate_chunk_analysis(parse_json_response(response_text), chunk), response_text


def build_raw_payload(
    chunk: ChunkSpec,
    status: str,
    error_text: str,
    model: str,
    project_id: str,
    location: str,
    analyzed_at: str,
    response_text: str,
    analysis: dict[str, Any],
) -> dict[str, Any]:
    return {
        "schema_version": RAW_SCHEMA_VERSION,
        "source": {
            "chunk_id": chunk.chunk_id,
            "pdf_path": str(chunk.source_pdf),
            "start_page": chunk.start_page,
            "end_page": chunk.end_page,
            "page_numbers": chunk.page_numbers,
            "page_count": chunk.page_count,
            "byte_size": chunk.byte_size,
        },
        "status": status,
        "error": error_text,
        "model": model,
        "project_id": project_id,
        "location": location,
        "analyzed_at": analyzed_at,
        "response_text": response_text,
        "analysis": analysis,
    }


def build_machine_chunk_payload(raw_payload: dict[str, Any], raw_path: Path) -> dict[str, Any]:
    source = raw_payload.get("source") or {}
    analysis = raw_payload.get("analysis") or {}
    questions = analysis.get("questions") if isinstance(analysis, dict) else []
    if not isinstance(questions, list):
        questions = []

    chapter_keys = sorted(
        {
            " > ".join(question.get("source_chapter_path") or [])
            for question in questions
            if question.get("source_chapter_path")
        }
    )
    review_count = sum(1 for question in questions if question.get("review_reasons"))
    return {
        "schema_version": MACHINE_CHUNK_SCHEMA_VERSION,
        "chunk": {
            "chunk_id": collapse_whitespace(source.get("chunk_id")),
            "pdf_path": collapse_whitespace(source.get("pdf_path")),
            "start_page": source.get("start_page"),
            "end_page": source.get("end_page"),
            "page_numbers": source.get("page_numbers") or [],
            "page_count": source.get("page_count") or 0,
            "byte_size": source.get("byte_size") or 0,
        },
        "processing": {
            "status": collapse_whitespace(raw_payload.get("status")) or "pending",
            "error": collapse_whitespace(raw_payload.get("error")),
            "model": collapse_whitespace(raw_payload.get("model")),
            "project_id": collapse_whitespace(raw_payload.get("project_id")),
            "location": collapse_whitespace(raw_payload.get("location")),
            "analyzed_at": collapse_whitespace(raw_payload.get("analyzed_at")),
        },
        "summary": {
            "chunk_summary": collapse_whitespace(analysis.get("chunk_summary")) if isinstance(analysis, dict) else "",
        },
        "questions": questions,
        "aggregates": {
            "question_count": len(questions),
            "review_count": review_count,
            "chapter_paths": chapter_keys,
        },
        "files": {
            "raw_response_json": str(raw_path.resolve()),
        },
    }


def load_cached_raw_payload(raw_path: Path) -> dict[str, Any] | None:
    if not raw_path.exists():
        return None
    try:
        payload = json.loads(raw_path.read_text(encoding="utf-8"))
    except Exception:
        return None
    if payload.get("schema_version") != RAW_SCHEMA_VERSION:
        return None
    return payload


def process_chunk(
    chunk: ChunkSpec,
    raw_dir: Path,
    machine_chunk_dir: Path,
    credentials_path: Path,
    project_id: str,
    location: str,
    model: str,
    max_output_tokens: int,
    temperature: float,
    overwrite: bool,
    retries: int,
    retry_wait_seconds: float,
) -> dict[str, Any]:
    raw_path = raw_dir / f"{chunk.chunk_id}.json"
    machine_path = machine_chunk_dir / f"{chunk.chunk_id}.json"

    cached = None if overwrite else load_cached_raw_payload(raw_path)
    if cached is None:
        client = get_thread_client(credentials_path, project_id, location)
        for attempt in range(1, retries + 1):
            try:
                analysis, response_text = analyze_chunk(
                    client=client,
                    chunk=chunk,
                    model=model,
                    max_output_tokens=max_output_tokens,
                    temperature=temperature,
                )
                cached = build_raw_payload(
                    chunk=chunk,
                    status="success",
                    error_text="",
                    model=model,
                    project_id=project_id,
                    location=location,
                    analyzed_at=datetime.now().isoformat(timespec="seconds"),
                    response_text=response_text,
                    analysis=analysis,
                )
                break
            except Exception as exc:
                if attempt >= retries:
                    cached = build_raw_payload(
                        chunk=chunk,
                        status="error",
                        error_text=f"{type(exc).__name__}: {exc}",
                        model=model,
                        project_id=project_id,
                        location=location,
                        analyzed_at=datetime.now().isoformat(timespec="seconds"),
                        response_text="",
                        analysis={},
                    )
                    break
                time.sleep(retry_wait_seconds)

        if cached is None:
            raise RuntimeError(f"Unexpected empty chunk result for {chunk.chunk_id}")
        write_json(raw_path, cached)

    machine_payload = build_machine_chunk_payload(cached, raw_path)
    write_json(machine_path, machine_payload)
    return machine_payload


def build_machine_manifest(machine_chunks: list[dict[str, Any]], machine_json_dir: Path, pdf_path: Path) -> None:
    items = []
    for machine_chunk in machine_chunks:
        chunk_meta = machine_chunk["chunk"]
        processing = machine_chunk["processing"]
        items.append(
            {
                "chunk_id": chunk_meta["chunk_id"],
                "start_page": chunk_meta["start_page"],
                "end_page": chunk_meta["end_page"],
                "page_count": chunk_meta["page_count"],
                "status": processing["status"],
                "question_count": machine_chunk["aggregates"]["question_count"],
                "review_count": machine_chunk["aggregates"]["review_count"],
                "json_file": f"chunks/{chunk_meta['chunk_id']}.json",
            }
        )
    payload = {
        "schema_version": MACHINE_MANIFEST_SCHEMA_VERSION,
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "source_pdf": str(pdf_path),
        "chunk_count": len(machine_chunks),
        "items": items,
    }
    write_json(machine_json_dir / "manifest.json", payload)


def build_question_dedupe_key(candidate: dict[str, Any]) -> str:
    normalized_choices = "||".join(
        f"{collapse_whitespace(choice['label']).casefold()}:{collapse_whitespace(choice['text']).casefold()}"
        for choice in candidate["choices"]
    )
    pages_key = ",".join(str(page) for page in candidate["source_pages"])
    return f"{collapse_whitespace(candidate['stem']).casefold()}##{normalized_choices}##{pages_key}"


def choose_better_path(left: list[str], right: list[str]) -> list[str]:
    if len(right) > len(left):
        return right
    if len(right) == len(left) and len(" ".join(right)) > len(" ".join(left)):
        return right
    return left


def choose_longer_text(left: str, right: str) -> str:
    return right if len(normalize_multiline_text(right)) > len(normalize_multiline_text(left)) else left


def merge_explanation_lists(left: list[str], right: list[str], limit: int) -> list[str]:
    return unique_nonempty(left + right, limit=limit)


def merge_diagram_dependency(left: str, right: str) -> str:
    rank = {"required": 3, "helpful": 2, "none": 1, "unknown": 0}
    return left if rank.get(left, 0) >= rank.get(right, 0) else right


def merge_answer_fields(left: dict[str, Any], right: dict[str, Any], review_reasons: list[str]) -> dict[str, Any]:
    left_labels = left.get("correct_labels") or []
    right_labels = right.get("correct_labels") or []
    merged_labels = unique_nonempty(left_labels + right_labels)
    if left_labels and right_labels and set(left_labels) != set(right_labels):
        review_reasons.append("중복 청크 간 정답 표기가 다름")

    merged_choice_texts = unique_nonempty(
        (left.get("correct_choice_texts") or []) + (right.get("correct_choice_texts") or [])
    )
    return {
        "correct_labels": merged_labels,
        "correct_text": choose_longer_text(
            collapse_whitespace(left.get("correct_text")),
            collapse_whitespace(right.get("correct_text")),
        ),
        "correct_choice_texts": merged_choice_texts,
    }


def merge_candidate_questions(left: dict[str, Any], right: dict[str, Any]) -> dict[str, Any]:
    review_reasons = unique_nonempty((left.get("review_reasons") or []) + (right.get("review_reasons") or []))
    answer = merge_answer_fields(left["answer"], right["answer"], review_reasons)
    return {
        "stem": left["stem"],
        "question_type": left["question_type"] if left["question_type"] != "unknown" else right["question_type"],
        "choices": left["choices"] if len(left["choices"]) >= len(right["choices"]) else right["choices"],
        "answer": answer,
        "source_pages": sort_pages((left.get("source_pages") or []) + (right.get("source_pages") or [])),
        "source_chapter_path": choose_better_path(
            left.get("source_chapter_path") or [],
            right.get("source_chapter_path") or [],
        ),
        "source_explanation": choose_longer_text(
            left.get("source_explanation", ""),
            right.get("source_explanation", ""),
        ),
        "diagram_dependency": merge_diagram_dependency(
            left.get("diagram_dependency", "unknown"),
            right.get("diagram_dependency", "unknown"),
        ),
        "review_reasons": unique_nonempty(review_reasons, limit=16),
        "keywords": unique_nonempty((left.get("keywords") or []) + (right.get("keywords") or []), limit=12),
        "draft_subject_name": choose_longer_text(
            left.get("draft_subject_name", ""),
            right.get("draft_subject_name", ""),
        ),
        "draft_topic_name": choose_longer_text(
            left.get("draft_topic_name", ""),
            right.get("draft_topic_name", ""),
        ),
        "explanation_draft": {
            "summary": choose_longer_text(
                left["explanation_draft"].get("summary", ""),
                right["explanation_draft"].get("summary", ""),
            ),
            "why_correct": merge_explanation_lists(
                left["explanation_draft"].get("why_correct", []),
                right["explanation_draft"].get("why_correct", []),
                8,
            ),
            "why_others_wrong": merge_explanation_lists(
                left["explanation_draft"].get("why_others_wrong", []),
                right["explanation_draft"].get("why_others_wrong", []),
                10,
            ),
            "key_concepts": merge_explanation_lists(
                left["explanation_draft"].get("key_concepts", []),
                right["explanation_draft"].get("key_concepts", []),
                10,
            ),
            "memory_cues": merge_explanation_lists(
                left["explanation_draft"].get("memory_cues", []),
                right["explanation_draft"].get("memory_cues", []),
                10,
            ),
        },
        "chunk_ids": unique_nonempty((left.get("chunk_ids") or []) + (right.get("chunk_ids") or [])),
    }


def detect_subject_id(text: str) -> int | None:
    if not text:
        return None
    normalized_text = collapse_whitespace(text)
    tokens = tokenize_text(text)
    best_subject_id = None
    best_score = 0
    for subject_id, subject in SUBJECTS.items():
        subject_name = subject["name"]
        subject_tokens = tokenize_text(subject_name)
        score = 0
        if normalized_text == subject_name:
            score += 100
        if subject_name in normalized_text or normalized_text in subject_name:
            score += 40
        score += len(tokens & subject_tokens) * 12
        if score > best_score:
            best_subject_id = subject_id
            best_score = score
    return best_subject_id if best_score > 0 else None


def topic_match_score(candidate: dict[str, Any], topic: dict[str, Any], draft_subject_id: int | None) -> float:
    corpus_parts = [
        candidate["stem"],
        " ".join(choice["text"] for choice in candidate["choices"]),
        candidate.get("source_explanation", ""),
        " ".join(candidate.get("source_chapter_path") or []),
        " ".join(candidate.get("keywords") or []),
        candidate.get("draft_subject_name", ""),
        candidate.get("draft_topic_name", ""),
        candidate["explanation_draft"].get("summary", ""),
    ]
    corpus_text = "\n".join(part for part in corpus_parts if part)
    corpus_tokens = tokenize_text(corpus_text)
    chapter_tokens = tokenize_text(" ".join(candidate.get("source_chapter_path") or []))
    draft_topic_tokens = tokenize_text(candidate.get("draft_topic_name", ""))
    score = 0.0

    if draft_subject_id is not None:
        score += 45 if topic["subject_id"] == draft_subject_id else -30

    score += len(corpus_tokens & topic["topic_tokens"]) * 10
    score += len(chapter_tokens & topic["topic_tokens"]) * 6
    score += len(draft_topic_tokens & topic["topic_tokens"]) * 14

    normalized_title = collapse_whitespace(topic["title"]).casefold()
    normalized_draft_topic = collapse_whitespace(candidate.get("draft_topic_name", "")).casefold()
    if normalized_draft_topic and (
        normalized_draft_topic in normalized_title or normalized_title in normalized_draft_topic
    ):
        score += 28
    if topic["title"] in corpus_text:
        score += 18
    if topic["subject_name"] in corpus_text:
        score += 12
    return score


def choose_exam_topic(candidate: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
    draft_subject_id = detect_subject_id(candidate.get("draft_subject_name", ""))
    scored_topics = [
        (topic_match_score(candidate, topic, draft_subject_id), topic)
        for topic in EXAM_TOPICS
    ]
    scored_topics.sort(key=lambda item: item[0], reverse=True)
    best_score, best_topic = scored_topics[0]
    second_score = scored_topics[1][0] if len(scored_topics) > 1 else -999.0

    if best_score >= 70:
        confidence = "high"
    elif best_score >= 42:
        confidence = "medium"
    else:
        confidence = "low"

    review_reasons: list[str] = []
    if confidence == "low":
        review_reasons.append("시험 토픽 분류 신뢰도가 낮음")
    if best_score - second_score < 6:
        review_reasons.append("시험 토픽 분류 후보가 서로 비슷함")
    if draft_subject_id is not None and best_topic["subject_id"] != draft_subject_id:
        review_reasons.append("모델 초안 과목과 최종 과목 분류가 다름")

    classification = {
        "subject_id": best_topic["subject_id"],
        "subject_name": best_topic["subject_name"],
        "topic_id": best_topic["topic_id"],
        "topic_title": best_topic["title"],
        "draft_subject_name": candidate.get("draft_subject_name", ""),
        "draft_topic_name": candidate.get("draft_topic_name", ""),
        "match_score": round(best_score, 2),
        "match_confidence": confidence,
    }
    return classification, review_reasons


def build_question_id(candidate: dict[str, Any]) -> str:
    digest = hashlib.sha1(build_question_dedupe_key(candidate).encode("utf-8")).hexdigest()
    return f"qb_{digest[:16]}"


def build_source_chapter_key(path: list[str]) -> str:
    return " > ".join(path)


def build_final_questions(machine_chunks: list[dict[str, Any]], pdf_path: Path) -> list[dict[str, Any]]:
    deduped: dict[str, dict[str, Any]] = {}

    for machine_chunk in machine_chunks:
        if machine_chunk["processing"]["status"] != "success":
            continue
        chunk_id = machine_chunk["chunk"]["chunk_id"]
        for question in machine_chunk["questions"]:
            candidate = {
                "stem": question["stem"],
                "question_type": question["question_type"],
                "choices": question["choices"],
                "answer": question["answer"],
                "source_pages": question["source_pages"],
                "source_chapter_path": question["source_chapter_path"],
                "source_explanation": question["source_explanation"],
                "diagram_dependency": question["diagram_dependency"],
                "review_reasons": question["review_reasons"],
                "keywords": question["keywords"],
                "draft_subject_name": question["exam_taxonomy_draft"]["subject_name"],
                "draft_topic_name": question["exam_taxonomy_draft"]["topic_name"],
                "explanation_draft": question["explanation_draft"],
                "chunk_ids": [chunk_id],
            }
            dedupe_key = build_question_dedupe_key(candidate)
            if dedupe_key in deduped:
                deduped[dedupe_key] = merge_candidate_questions(deduped[dedupe_key], candidate)
            else:
                deduped[dedupe_key] = candidate

    final_questions: list[dict[str, Any]] = []
    for candidate in deduped.values():
        exam_taxonomy, taxonomy_review_reasons = choose_exam_topic(candidate)
        review_reasons = unique_nonempty((candidate.get("review_reasons") or []) + taxonomy_review_reasons, limit=20)
        needs_review = bool(review_reasons) or candidate["diagram_dependency"] == "required"
        chapter_key = build_source_chapter_key(candidate.get("source_chapter_path") or [])

        final_questions.append(
            {
                "question_id": build_question_id(candidate),
                "source": {
                    "pdf_path": str(pdf_path),
                    "chunk_ids": unique_nonempty(candidate.get("chunk_ids") or []),
                    "source_pages": candidate["source_pages"],
                    "page_span": {
                        "start_page": min(candidate["source_pages"]) if candidate["source_pages"] else None,
                        "end_page": max(candidate["source_pages"]) if candidate["source_pages"] else None,
                    },
                    "source_explanation": candidate.get("source_explanation", ""),
                },
                "source_taxonomy": {
                    "source_chapter_path": candidate.get("source_chapter_path") or [],
                    "chapter_label": (candidate.get("source_chapter_path") or [""])[-1] if candidate.get("source_chapter_path") else "",
                    "chapter_key": chapter_key,
                },
                "exam_taxonomy": exam_taxonomy,
                "question": {
                    "question_type": candidate["question_type"],
                    "stem": candidate["stem"],
                    "choices": candidate["choices"],
                },
                "answer": {
                    "correct_labels": candidate["answer"]["correct_labels"],
                    "correct_choice_texts": candidate["answer"]["correct_choice_texts"],
                    "answer_text": candidate["answer"]["correct_text"],
                },
                "explanation": {
                    "source_text": candidate.get("source_explanation", ""),
                    "summary": candidate["explanation_draft"].get("summary", ""),
                    "why_correct": candidate["explanation_draft"].get("why_correct", []),
                    "why_others_wrong": candidate["explanation_draft"].get("why_others_wrong", []),
                    "key_concepts": candidate["explanation_draft"].get("key_concepts", []),
                    "memory_cues": candidate["explanation_draft"].get("memory_cues", []),
                },
                "quality": {
                    "diagram_dependency": candidate["diagram_dependency"],
                    "needs_review": needs_review,
                    "review_reasons": review_reasons,
                },
                "keywords": candidate.get("keywords") or [],
            }
        )

    final_questions.sort(
        key=lambda item: (
            item["exam_taxonomy"]["topic_id"],
            item["source"]["page_span"]["start_page"] or 0,
            item["question_id"],
        )
    )
    return final_questions


def clear_output_dir(out_dir: Path) -> None:
    topics_dir = out_dir / "topics"
    topics_dir.mkdir(parents=True, exist_ok=True)
    for path in topics_dir.glob("*.json"):
        path.unlink()
    for filename in ("manifest.json", "taxonomy.json", "review_queue.json", "visual_assets.json", "figure_crops.json"):
        target = out_dir / filename
        if target.exists():
            target.unlink()


def build_source_chapters(questions: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, str]]:
    counts: dict[str, int] = {}
    path_lookup: dict[str, list[str]] = {}
    for question in questions:
        path = question["source_taxonomy"]["source_chapter_path"]
        if not path:
            continue
        key = build_source_chapter_key(path)
        counts[key] = counts.get(key, 0) + 1
        path_lookup[key] = path

    chapter_id_by_key: dict[str, str] = {}
    chapter_items: list[dict[str, Any]] = []
    for index, chapter_key in enumerate(sorted(counts), start=1):
        chapter_id = f"chapter_{index:03d}"
        chapter_id_by_key[chapter_key] = chapter_id
        path = path_lookup[chapter_key]
        chapter_items.append(
            {
                "chapter_id": chapter_id,
                "path": path,
                "label": path[-1] if path else "",
                "depth": len(path),
                "question_count": counts[chapter_key],
            }
        )
    return chapter_items, chapter_id_by_key


def build_and_write_outputs(
    questions: list[dict[str, Any]],
    out_dir: Path,
    pdf_path: Path,
    total_pages: int,
    selected_start_page: int,
    selected_end_page: int,
    machine_chunks: list[dict[str, Any]],
    render_visual_assets_flag: bool,
    visual_image_scale: float,
    figure_samples_dir: Path,
) -> None:
    clear_output_dir(out_dir)
    topics_dir = out_dir / "topics"
    topics_dir.mkdir(parents=True, exist_ok=True)

    chapter_items, chapter_id_by_key = build_source_chapters(questions)

    grouped_questions: dict[str, list[dict[str, Any]]] = {}
    for question in questions:
        topic_id = question["exam_taxonomy"]["topic_id"]
        chapter_key = question["source_taxonomy"]["chapter_key"]
        question["source_taxonomy"]["chapter_id"] = chapter_id_by_key.get(chapter_key, "")
        grouped_questions.setdefault(topic_id, []).append(question)

    visual_assets_payload = {
        "schema_version": FINAL_VISUAL_ASSETS_SCHEMA_VERSION,
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "source_pdf": str(pdf_path),
        "rendering": {
            "engine": "pymupdf",
            "image_format": "png",
            "scale": visual_image_scale,
        },
        "assets_root": "",
        "visual_question_count": 0,
        "total_asset_count": 0,
        "items": [],
    }
    if render_visual_assets_flag:
        visual_assets_payload = render_visual_assets(
            questions=questions,
            pdf_path=pdf_path,
            out_dir=out_dir,
            visual_image_scale=visual_image_scale,
        )
    else:
        for question in questions:
            question["visual_assets"] = build_empty_visual_assets(question)

    figure_crops_by_question_id, figure_crops_payload = load_question_figure_crops(figure_samples_dir, out_dir)
    apply_question_figure_crops(questions, figure_crops_by_question_id)

    topic_file_items: list[dict[str, Any]] = []
    subject_counts: dict[int, int] = {subject_id: 0 for subject_id in SUBJECTS}
    review_items: list[dict[str, Any]] = []

    for topic in EXAM_TOPICS:
        topic_questions = grouped_questions.get(topic["topic_id"], [])
        if not topic_questions:
            continue

        for question in topic_questions:
            subject_counts[topic["subject_id"]] += 1
            if question["quality"]["needs_review"]:
                review_items.append(
                    {
                        "question_id": question["question_id"],
                        "topic_id": topic["topic_id"],
                        "topic_title": topic["title"],
                        "subject_id": topic["subject_id"],
                        "subject_name": topic["subject_name"],
                        "source_pages": question["source"]["source_pages"],
                        "source_chapter_path": question["source_taxonomy"]["source_chapter_path"],
                        "diagram_dependency": question["quality"]["diagram_dependency"],
                        "review_reasons": question["quality"]["review_reasons"],
                        "visual_assets": question["visual_assets"],
                    }
                )

        topic_questions.sort(
            key=lambda item: (
                item["source"]["page_span"]["start_page"] or 0,
                item["question_id"],
            )
        )
        topic_review_count = sum(1 for question in topic_questions if question["quality"]["needs_review"])
        topic_payload = {
            "schema_version": FINAL_TOPIC_SCHEMA_VERSION,
            "topic": {
                "topic_id": topic["topic_id"],
                "sequence": topic["sequence"],
                "title": topic["title"],
                "subject_id": topic["subject_id"],
                "subject_name": topic["subject_name"],
                "subject_emoji": topic["subject_emoji"],
                "subject_color": topic["subject_color"],
                "question_count": len(topic_questions),
                "review_count": topic_review_count,
                "source_chapter_ids": unique_nonempty(
                    [question["source_taxonomy"]["chapter_id"] for question in topic_questions if question["source_taxonomy"]["chapter_id"]]
                ),
            },
            "questions": topic_questions,
        }
        json_file = f"{topic['topic_id']}.json"
        write_json(topics_dir / json_file, topic_payload)
        topic_file_items.append(
            {
                "topic_id": topic["topic_id"],
                "title": topic["title"],
                "subject_id": topic["subject_id"],
                "subject_name": topic["subject_name"],
                "question_count": len(topic_questions),
                "review_count": topic_review_count,
                "json_file": f"topics/{json_file}",
            }
        )

    manifest_payload = {
        "schema_version": FINAL_MANIFEST_SCHEMA_VERSION,
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "source_pdf": str(pdf_path),
        "page_range": {
            "start_page": selected_start_page,
            "end_page": selected_end_page,
            "selected_page_count": selected_end_page - selected_start_page + 1,
            "pdf_total_pages": total_pages,
        },
        "chunk_count": len(machine_chunks),
        "topic_count": len(topic_file_items),
        "total_question_count": len(questions),
        "total_review_count": len(review_items),
        "visual_question_count": visual_assets_payload["visual_question_count"],
        "visual_asset_count": visual_assets_payload["total_asset_count"],
        "figure_crop_question_count": figure_crops_payload["question_count"],
        "figure_crop_asset_count": figure_crops_payload["asset_count"],
        "subject_question_counts": {
            SUBJECTS[subject_id]["name"]: subject_counts[subject_id]
            for subject_id in sorted(SUBJECTS)
        },
        "files": {
            "taxonomy": "taxonomy.json",
            "review_queue": "review_queue.json",
            "visual_assets": "visual_assets.json",
            "figure_crops": "figure_crops.json",
            "topics_dir": "topics",
            "images_root": visual_assets_payload["assets_root"],
            "topic_files": topic_file_items,
        },
    }

    exam_subjects = []
    for subject_id in sorted(SUBJECTS):
        subject = SUBJECTS[subject_id]
        exam_subjects.append(
            {
                "subject_id": subject_id,
                "name": subject["name"],
                "emoji": subject["emoji"],
                "color": subject["color"],
                "question_count": subject_counts[subject_id],
                "topics": [
                    {
                        "topic_id": topic["topic_id"],
                        "title": topic["title"],
                        "question_count": next(
                            (
                                item["question_count"]
                                for item in topic_file_items
                                if item["topic_id"] == topic["topic_id"]
                            ),
                            0,
                        ),
                        "json_file": next(
                            (
                                item["json_file"]
                                for item in topic_file_items
                                if item["topic_id"] == topic["topic_id"]
                            ),
                            "",
                        ),
                    }
                    for topic in EXAM_TOPICS
                    if topic["subject_id"] == subject_id
                ],
            }
        )

    taxonomy_payload = {
        "schema_version": FINAL_TAXONOMY_SCHEMA_VERSION,
        "generated_at": manifest_payload["generated_at"],
        "source_pdf": str(pdf_path),
        "exam_subjects": exam_subjects,
        "source_chapters": chapter_items,
    }
    visual_assets_payload["generated_at"] = manifest_payload["generated_at"]
    figure_crops_payload["generated_at"] = manifest_payload["generated_at"]

    review_queue_payload = {
        "schema_version": FINAL_REVIEW_QUEUE_SCHEMA_VERSION,
        "generated_at": manifest_payload["generated_at"],
        "source_pdf": str(pdf_path),
        "total_review_count": len(review_items),
        "items": review_items,
    }

    write_json(out_dir / "manifest.json", manifest_payload)
    write_json(out_dir / "taxonomy.json", taxonomy_payload)
    write_json(out_dir / "review_queue.json", review_queue_payload)
    write_json(out_dir / "visual_assets.json", visual_assets_payload)
    write_json(out_dir / "figure_crops.json", figure_crops_payload)


def main() -> None:
    args = parse_args()
    if args.render_visual_assets and fitz is None:
        raise RuntimeError(
            "Visual asset rendering is enabled but PyMuPDF is not installed. "
            "Run `python -m pip install -r requirements.txt` first."
        )

    pdf_path = Path(args.pdf)
    if not pdf_path.exists():
        raise FileNotFoundError(f"PDF not found: {pdf_path}")

    credentials_path = Path(args.credentials_json) if args.credentials_json else detect_default_credentials(ROOT)
    if credentials_path is None:
        raise FileNotFoundError("No service account credentials JSON found in the current workspace")
    project_id = args.project_id or read_project_id(credentials_path)

    out_dir = Path(args.out_dir)
    artifacts_dir = Path(args.artifacts_dir)
    figure_samples_dir = Path(args.figure_samples_dir)
    raw_dir = artifacts_dir / "raw"
    machine_json_dir = artifacts_dir / "machine_json"
    machine_chunk_dir = machine_json_dir / "chunks"
    raw_dir.mkdir(parents=True, exist_ok=True)
    machine_chunk_dir.mkdir(parents=True, exist_ok=True)

    reader = PdfReader(str(pdf_path))
    total_pages = len(reader.pages)
    selected_end_page = args.end_page or total_pages
    chunk_specs, total_pages = build_chunk_specs(
        pdf_path=pdf_path,
        start_page=args.start_page,
        end_page=selected_end_page,
        pages_per_chunk=args.pages_per_chunk,
        chunk_overlap_pages=args.chunk_overlap_pages,
        max_chunk_bytes=args.max_chunk_bytes,
    )

    machine_chunks: list[dict[str, Any]] = []
    for index, chunk in enumerate(chunk_specs, start=1):
        machine_payload = process_chunk(
            chunk=chunk,
            raw_dir=raw_dir,
            machine_chunk_dir=machine_chunk_dir,
            credentials_path=credentials_path,
            project_id=project_id,
            location=args.location,
            model=args.model,
            max_output_tokens=args.max_output_tokens,
            temperature=args.temperature,
            overwrite=args.overwrite,
            retries=args.retries,
            retry_wait_seconds=args.retry_wait_seconds,
        )
        machine_chunks.append(machine_payload)
        print(
            f"[{index}/{len(chunk_specs)}] {chunk.chunk_id} "
            f"status={machine_payload['processing']['status']} "
            f"questions={machine_payload['aggregates']['question_count']}"
        )

        if index % max(1, args.save_every) == 0:
            build_machine_manifest(machine_chunks, machine_json_dir, pdf_path)
            final_questions = build_final_questions(machine_chunks, pdf_path)
            build_and_write_outputs(
                questions=final_questions,
                out_dir=out_dir,
                pdf_path=pdf_path,
                total_pages=total_pages,
                selected_start_page=args.start_page,
                selected_end_page=selected_end_page,
                machine_chunks=machine_chunks,
                render_visual_assets_flag=args.render_visual_assets,
                visual_image_scale=args.visual_image_scale,
                figure_samples_dir=figure_samples_dir,
            )
            print(f"[SAVE] Updated outputs after {index} chunks")

    build_machine_manifest(machine_chunks, machine_json_dir, pdf_path)
    final_questions = build_final_questions(machine_chunks, pdf_path)
    build_and_write_outputs(
        questions=final_questions,
        out_dir=out_dir,
        pdf_path=pdf_path,
        total_pages=total_pages,
        selected_start_page=args.start_page,
        selected_end_page=selected_end_page,
        machine_chunks=machine_chunks,
        render_visual_assets_flag=args.render_visual_assets,
        visual_image_scale=args.visual_image_scale,
        figure_samples_dir=figure_samples_dir,
    )

    print("[DONE] Question bank generation completed")
    print(f"- Source PDF: {pdf_path}")
    print(f"- Output dir: {out_dir.resolve()}")
    print(f"- Artifacts dir: {artifacts_dir.resolve()}")
    print(f"- Chunks processed: {len(chunk_specs)}")
    print(f"- Questions generated: {len(final_questions)}")


if __name__ == "__main__":
    main()
