import argparse
import json
import math
import os
import time
from collections import deque
from datetime import UTC, datetime
from io import BytesIO
from pathlib import Path

from PIL import Image
from google import genai
from google.genai import types
from google.genai.types import GenerateContentConfig, Modality


ROOT = Path(__file__).resolve().parents[3]
DEFAULT_PLAN = ROOT / "study-app" / "assets" / "plan" / "lecture-guide-animation-v3-plan.json"
DEFAULT_SERVICE_ACCOUNT = ROOT / "eighth-pen-491412-c0-7ea3284c9fc6.json"


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def ensure_parent(path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)


def relative(path: Path) -> str:
    return str(path.resolve().relative_to(ROOT)).replace("\\", "/")


def guess_mime_type(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix == ".png":
        return "image/png"
    if suffix in {".jpg", ".jpeg"}:
        return "image/jpeg"
    if suffix == ".webp":
        return "image/webp"
    raise ValueError(f"Unsupported reference image type: {path}")


def load_reference_parts(reference_files: list[str]):
    parts = []
    for rel_path in reference_files:
        path = ROOT / rel_path
        if not path.exists():
            raise FileNotFoundError(f"Reference image not found: {path}")
        parts.append(types.Part.from_bytes(data=path.read_bytes(), mime_type=guess_mime_type(path)))
    return parts


def build_reference_prompt(plan: dict, asset: dict) -> str:
    direction = plan["visual_direction"]
    outfit = ", ".join(direction["outfit"])
    constraints = "; ".join(direction["global_constraints"])
    bg = direction["background_extraction"]["generation_background"]
    return "\n".join([
        "Use case: stylized-concept",
        f"Asset type: {asset['display_role']}",
        f"Primary request: {asset['concept']}",
        f"Subject: {direction['character_brief']}",
        f"Style/medium: {', '.join(direction['style_keywords'])}",
        "Composition/framing: single full-body character, centered, plenty of empty margin, not cropped",
        "Lighting/mood: soft studio lighting, warm and approachable, premium educational app mascot",
        f"Costume: {outfit}",
        f"Scene/backdrop: single solid background color {bg}, plain background only, no props, no stage",
        "Text (verbatim): none",
        f"Constraints: {constraints}",
        "Avoid: multiple characters, prop objects, speech bubble, text, photo realism, detailed scene, furniture, patterned background",
        f"Creative seed: {asset['prompt_seed']}",
    ])


def build_sheet_prompt(plan: dict, asset: dict, frame_total: int, rows: int, cols: int) -> str:
    direction = plan["visual_direction"]
    outfit = ", ".join(direction["outfit"])
    constraints = "; ".join(direction["global_constraints"])
    bg = direction["background_extraction"]["generation_background"]
    return "\n".join([
        "Use case: stylized-concept",
        f"Asset type: {asset['display_role']}",
        f"Primary request: {asset['concept']}",
        f"Subject: {direction['character_brief']}",
        f"Style/medium: {', '.join(direction['style_keywords'])}",
        (
            f"Composition/framing: create one sprite sheet with exactly {frame_total} cells arranged as "
            f"{cols} columns by {rows} rows, one full-body professor in each cell, centered, consistent scale"
        ),
        "Lighting/mood: soft studio lighting, friendly classroom presenter, smooth motion sequence",
        f"Costume: {outfit}",
        (
            f"Scene/backdrop: every cell must use the same single solid background color {bg}, "
            "plain background only, no props, no panel, no extra objects"
        ),
        "Text (verbatim): none",
        (
            "Constraints: the exact same one professor character in every cell; "
            f"{constraints}; keep camera angle and face identical across all cells"
        ),
        "Avoid: multiple different characters, scene composition, speech bubble, text, floor props, complex background, cropped body",
        f"Creative seed: {asset['prompt_seed']}",
    ])


def extract_first_image(response):
    for candidate in getattr(response, "candidates", []) or []:
        content = getattr(candidate, "content", None)
        if not content:
            continue
        for part in getattr(content, "parts", []) or []:
            inline = getattr(part, "inline_data", None)
            if inline and getattr(inline, "data", None):
                return inline.data
    return None


def color_close(a: tuple[int, int, int], b: tuple[int, int, int], tolerance: int) -> bool:
    return max(abs(a[0] - b[0]), abs(a[1] - b[1]), abs(a[2] - b[2])) <= tolerance


def remove_background_by_corners(image: Image.Image, tolerance: int) -> Image.Image:
    img = image.convert("RGBA")
    w, h = img.size
    px = img.load()
    seeds = [
        px[0, 0][:3],
        px[w - 1, 0][:3],
        px[0, h - 1][:3],
        px[w - 1, h - 1][:3],
    ]

    soft_tolerance = tolerance + 20
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            distance = min(max(abs(r - sr), abs(g - sg), abs(b - sb)) for sr, sg, sb in seeds)
            if distance <= tolerance:
                px[x, y] = (r, g, b, 0)
            elif distance <= soft_tolerance:
                alpha_scale = (distance - tolerance) / max(1, (soft_tolerance - tolerance))
                px[x, y] = (r, g, b, int(a * alpha_scale))

    return img


def trim_to_alpha(image: Image.Image) -> Image.Image:
    alpha = image.getchannel("A")
    bbox = alpha.getbbox()
    if not bbox:
        return image
    return image.crop(bbox)


def split_sheet_frames(image: Image.Image, rows: int, cols: int) -> list[Image.Image]:
    w, h = image.size
    frames = []
    for row in range(rows):
        for col in range(cols):
            left = round(col * w / cols)
            right = round((col + 1) * w / cols)
            top = round(row * h / rows)
            bottom = round((row + 1) * h / rows)
            frames.append(image.crop((left, top, right, bottom)))
    return frames


def normalize_frames(frames: list[Image.Image], pad: int = 24) -> list[Image.Image]:
    trimmed = [trim_to_alpha(frame.convert("RGBA")) for frame in frames]
    widths = [frame.size[0] for frame in trimmed]
    heights = [frame.size[1] for frame in trimmed]
    canvas_w = max(widths) + pad * 2
    canvas_h = max(heights) + pad * 2

    normalized = []
    for frame in trimmed:
        canvas = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
        x = (canvas_w - frame.size[0]) // 2
        y = canvas_h - pad - frame.size[1]
        canvas.alpha_composite(frame, dest=(x, y))
        normalized.append(canvas)
    return normalized


def generate_image(client: genai.Client, model: str, prompt: str, reference_files: list[str]):
    contents = [*load_reference_parts(reference_files), prompt] if reference_files else [prompt]
    last_error = None
    for attempt in range(1, 5):
        try:
            response = client.models.generate_content(
                model=model,
                contents=contents,
                config=GenerateContentConfig(response_modalities=[Modality.TEXT, Modality.IMAGE]),
            )
            image_bytes = extract_first_image(response)
            if not image_bytes:
                raise RuntimeError("No image returned from model")
            return Image.open(BytesIO(image_bytes)).convert("RGBA")
        except Exception as exc:
            last_error = exc
            if attempt >= 4:
                break
            time.sleep(6 * attempt)
    raise last_error


def save_png(image: Image.Image, path: Path):
    ensure_parent(path)
    image.save(path)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--plan", type=Path, default=DEFAULT_PLAN)
    parser.add_argument("--model", default="gemini-3.1-flash-image-preview")
    parser.add_argument("--credentials", type=Path, default=DEFAULT_SERVICE_ACCOUNT)
    parser.add_argument("--project", default="eighth-pen-491412-c0")
    parser.add_argument("--location", default="global")
    parser.add_argument("--overwrite", action="store_true")
    args = parser.parse_args()

    if not args.credentials.exists():
        raise FileNotFoundError(f"Credentials file not found: {args.credentials}")

    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(args.credentials)
    os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "True"
    os.environ["GOOGLE_CLOUD_PROJECT"] = args.project
    os.environ["GOOGLE_CLOUD_LOCATION"] = args.location

    plan = load_json(args.plan)
    client = genai.Client()
    tolerance = plan["visual_direction"]["background_extraction"]["tolerance"]

    manifest = {
      "generated_at": None,
      "plan_file": relative(args.plan),
      "feature_id": plan["feature"]["id"],
      "model_id": args.model,
      "assets": []
    }

    set_defs = {item["id"]: item for item in plan["animation_sets"]}

    for asset in plan["generation_sequence"]:
        if asset["type"] == "single_reference":
            raw_path = ROOT / asset["output_raw_file"]
            cutout_path = ROOT / asset["output_cutout_file"]

            if raw_path.exists() and cutout_path.exists() and not args.overwrite:
                manifest["assets"].append({
                    "id": asset["id"],
                    "status": "skipped_existing",
                    "output_cutout_file": asset["output_cutout_file"],
                })
                continue

            prompt = build_reference_prompt(plan, asset)
            raw_image = generate_image(client, args.model, prompt, [])
            cutout = trim_to_alpha(remove_background_by_corners(raw_image, tolerance))
            save_png(raw_image, raw_path)
            save_png(cutout, cutout_path)

            manifest["assets"].append({
                "id": asset["id"],
                "type": asset["type"],
                "status": "generated",
                "output_raw_file": asset["output_raw_file"],
                "output_cutout_file": asset["output_cutout_file"],
                "prompt": prompt,
            })
            continue

        state = asset["state"]
        set_def = set_defs[state]
        raw_path = ROOT / asset["output_raw_file"]
        cutout_path = ROOT / asset["output_cutout_file"]
        frames_dir = ROOT / asset["output_frames_dir"]
        frame_total = set_def["frame_total"]
        rows = set_def["rows"]
        cols = set_def["cols"]

        existing_frames = list(sorted(frames_dir.glob("*.png")))
        if raw_path.exists() and cutout_path.exists() and len(existing_frames) == frame_total and not args.overwrite:
            manifest["assets"].append({
                "id": asset["id"],
                "type": asset["type"],
                "status": "skipped_existing",
                "frame_total": frame_total,
                "output_frames_dir": asset["output_frames_dir"],
            })
            continue

        prompt = build_sheet_prompt(plan, asset, frame_total, rows, cols)
        raw_image = generate_image(client, args.model, prompt, asset.get("reference_files", []))
        cutout_sheet = remove_background_by_corners(raw_image, tolerance)
        frames = split_sheet_frames(cutout_sheet, rows, cols)[:frame_total]
        frames = normalize_frames(frames)

        save_png(raw_image, raw_path)
        save_png(cutout_sheet, cutout_path)
        frames_dir.mkdir(parents=True, exist_ok=True)

        frame_files = []
        for index, frame in enumerate(frames, start=1):
            frame_path = frames_dir / f"{asset['frame_prefix']}-f{index:02d}.png"
            save_png(frame, frame_path)
            frame_files.append(relative(frame_path))

        manifest["assets"].append({
            "id": asset["id"],
            "type": asset["type"],
            "status": "generated",
            "state": state,
            "frame_total": frame_total,
            "frame_duration_ms": set_def["frame_duration_ms"],
            "output_raw_file": asset["output_raw_file"],
            "output_cutout_file": asset["output_cutout_file"],
            "output_frames_dir": asset["output_frames_dir"],
            "frame_files": frame_files,
            "reference_files": asset.get("reference_files", []),
            "prompt": prompt,
        })

    manifest["generated_at"] = datetime.now(UTC).isoformat()
    out_path = ROOT / plan["storage_layout"]["manifest_file"]
    ensure_parent(out_path)
    out_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
