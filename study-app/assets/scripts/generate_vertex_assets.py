import argparse
import json
import os
from io import BytesIO
from pathlib import Path

from PIL import Image
from google import genai
from google.genai import types
from google.genai.types import GenerateContentConfig, Modality


ROOT = Path(__file__).resolve().parents[3]
DEFAULT_PLAN = ROOT / "study-app" / "assets" / "plan" / "asset-plan.json"
DEFAULT_MANIFEST = ROOT / "study-app" / "assets" / "generated" / "generation-manifest.json"
DEFAULT_SERVICE_ACCOUNT = ROOT / "eighth-pen-491412-c0-7ea3284c9fc6.json"


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def ensure_parent(path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)


def guess_mime_type(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix == ".png":
        return "image/png"
    if suffix in {".jpg", ".jpeg"}:
        return "image/jpeg"
    if suffix == ".webp":
        return "image/webp"
    raise ValueError(f"Unsupported reference image type: {path}")


def build_prompt(asset: dict, plan: dict) -> str:
    direction = plan["visual_direction"]
    constraints = direction.get("global_constraints", [])
    palette = direction.get("palette", {})

    lines = [
        "Use case: stylized-concept",
        f"Asset type: {asset['display_role']}",
        f"Primary request: {asset['concept']}",
        "Scene/backdrop: transparent background, no environment, centered asset",
        f"Subject: {asset['concept']}",
        f"Style/medium: {', '.join(direction['style_keywords'])}",
        "Composition/framing: single centered asset, clean silhouette, mobile UI friendly, no cropping",
        "Lighting/mood: soft studio lighting, calm premium educational feel",
        (
            "Color palette: "
            f"primary blue {palette.get('primary_blue')}, green {palette.get('green')}, "
            f"orange {palette.get('orange')}, violet {palette.get('violet')}, red {palette.get('red')}"
        ),
        "Text (verbatim): none",
        f"Constraints: {'; '.join(constraints)}",
        "Avoid: watermark, text, extra props, busy background, photoreal face, uncanny face, low-detail hands",
        f"Creative seed: {asset['prompt_seed']}",
    ]

    if asset.get("animation_set"):
        lines.append(f"Animation set: {asset['animation_set']}")
    if asset.get("frame_index") and asset.get("frame_total"):
        lines.append(f"Frame: {asset['frame_index']} of {asset['frame_total']}")
    if asset.get("motion_note"):
        lines.append(f"Motion note: {asset['motion_note']}")
    if asset.get("continuity_note"):
        lines.append(f"Continuity: {asset['continuity_note']}")
    if asset.get("reference_files"):
        lines.append("Reference images: preserve the exact same professor character identity, costume, head proportion, camera angle, and render style.")

    return "\n".join(lines)


def load_reference_parts(asset: dict):
    parts = []
    for reference_file in asset.get("reference_files", []):
        reference_path = ROOT / reference_file
        if not reference_path.exists():
            raise FileNotFoundError(f"Reference file not found: {reference_path}")
        parts.append(
            types.Part.from_bytes(
                data=reference_path.read_bytes(),
                mime_type=guess_mime_type(reference_path),
            )
        )
    return parts


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


def select_assets(plan: dict, asset_ids: list[str], family: str | None):
    assets = plan["assets_to_generate"]
    if asset_ids:
        wanted = set(asset_ids)
        return [asset for asset in assets if asset["id"] in wanted]
    if family:
        return [asset for asset in assets if asset["family"] == family]
    return assets


def save_manifest(path: Path, manifest: dict):
    ensure_parent(path)
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")


def relative_to_root(path: Path) -> str:
    resolved = path.resolve()
    try:
        return str(resolved.relative_to(ROOT))
    except ValueError:
        return str(path)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--plan", type=Path, default=DEFAULT_PLAN)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--model", default="gemini-3.1-flash-image-preview")
    parser.add_argument("--family", default=None)
    parser.add_argument("--asset-id", action="append", default=[])
    parser.add_argument("--overwrite", action="store_true")
    parser.add_argument("--project", default="eighth-pen-491412-c0")
    parser.add_argument("--location", default="global")
    parser.add_argument("--credentials", type=Path, default=DEFAULT_SERVICE_ACCOUNT)
    args = parser.parse_args()

    if not args.credentials.exists():
        raise FileNotFoundError(f"Credentials file not found: {args.credentials}")

    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(args.credentials)
    os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "True"
    os.environ["GOOGLE_CLOUD_PROJECT"] = args.project
    os.environ["GOOGLE_CLOUD_LOCATION"] = args.location

    plan = load_json(args.plan)
    assets = select_assets(plan, args.asset_id, args.family)
    if not assets:
        raise ValueError("No matching assets found in plan")

    client = genai.Client()

    manifest = {
        "generated_at": None,
        "model": args.model,
        "project": args.project,
        "location": args.location,
        "plan_file": relative_to_root(args.plan),
        "assets": [],
    }

    for asset in assets:
        output_path = ROOT / asset["output_file"]
        if output_path.exists() and not args.overwrite:
            manifest["assets"].append({
                "id": asset["id"],
                "status": "skipped_existing",
                "output_file": asset["output_file"],
            })
            continue

        prompt = build_prompt(asset, plan)
        contents = [*load_reference_parts(asset), prompt]
        response = client.models.generate_content(
            model=args.model,
            contents=contents,
            config=GenerateContentConfig(
                response_modalities=[Modality.TEXT, Modality.IMAGE],
            ),
        )

        image_bytes = extract_first_image(response)
        if not image_bytes:
            manifest["assets"].append({
                "id": asset["id"],
                "status": "failed_no_image",
                "output_file": asset["output_file"],
                "prompt": prompt,
            })
            continue

        ensure_parent(output_path)
        image = Image.open(BytesIO(image_bytes))
        image.save(output_path)

        manifest["assets"].append({
            "id": asset["id"],
            "status": "generated",
            "output_file": asset["output_file"],
            "prompt": prompt,
            "display_role": asset["display_role"],
            "usage_map": asset.get("usage_map", []),
            "reference_files": asset.get("reference_files", []),
        })

    from datetime import datetime, UTC
    manifest["generated_at"] = datetime.now(UTC).isoformat()
    save_manifest(args.manifest, manifest)
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
