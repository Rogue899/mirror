from __future__ import annotations

import argparse
import json
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen


def load_meshy_api_key(repo_root: Path) -> str:
    env_path = repo_root / "backend" / ".env"
    for line in env_path.read_text(encoding="utf-8").splitlines():
        if line.startswith("MESHY_API_KEY="):
            api_key = line.split("=", 1)[1].strip().strip('"').strip("'")
            if api_key:
                return api_key
    raise RuntimeError("MESHY_API_KEY was not found in backend/.env")


def post_preview_task(api_key: str, prompt: str, target_polycount: int) -> str:
    payload = {
        "mode": "preview",
        "prompt": prompt,
        "ai_model": "latest",
        "model_type": "standard",
        "should_remesh": True,
        "topology": "quad",
        "target_polycount": target_polycount,
        "pose_mode": "a-pose",
        "target_formats": ["glb", "fbx"],
        "moderation": True,
    }
    request = Request(
        "https://api.meshy.ai/openapi/v2/text-to-3d",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=60) as response:
            return json.loads(response.read().decode("utf-8"))["result"]
    except HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Meshy create failed: {error.code} {detail[:500]}") from error


def stream_task(api_key: str, task_id: str) -> dict:
    request = Request(
        f"https://api.meshy.ai/openapi/v2/text-to-3d/{task_id}/stream",
        headers={"Authorization": f"Bearer {api_key}"},
    )

    event_data: list[str] = []
    final_task: dict | None = None
    last_seen: tuple[str | None, int | None] | None = None

    def handle_event(text: str) -> bool:
        nonlocal final_task, last_seen
        if not text.strip():
            return False
        payload = json.loads(text)
        if "message" in payload and "status_code" in payload:
            raise RuntimeError(f"Meshy stream error: {payload}")

        status = payload.get("status")
        progress = payload.get("progress")
        current = (status, progress)
        if status and current != last_seen:
            print(f"Meshy status: {status} / {progress}%", flush=True)
            last_seen = current

        if status in {"SUCCEEDED", "FAILED", "CANCELED"}:
            final_task = payload
            return True
        return False

    try:
        with urlopen(request, timeout=1200) as response:
            while True:
                raw_line = response.readline()
                if not raw_line:
                    break
                line = raw_line.decode("utf-8", errors="replace").rstrip("\r\n")
                if line == "":
                    if event_data:
                        if handle_event("\n".join(event_data)):
                            break
                        event_data = []
                    continue
                if line.startswith("data:"):
                    event_data.append(line[5:].strip())
    except HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Meshy stream failed: {error.code} {detail[:500]}") from error

    if final_task is None and event_data:
        handle_event("\n".join(event_data))

    if final_task is None:
        raise RuntimeError("Meshy stream ended without a final task object")
    if final_task.get("status") != "SUCCEEDED":
        raise RuntimeError(f"Meshy task did not succeed: {final_task.get('status')} {final_task.get('task_error')}")

    return final_task


def download_outputs(repo_root: Path, task: dict, basename: str) -> list[Path]:
    output_dir = repo_root / "frontend" / "public" / "garments"
    output_dir.mkdir(parents=True, exist_ok=True)

    downloaded: list[Path] = []
    model_urls = task.get("model_urls") or {}
    for extension in ("glb", "fbx"):
        url = model_urls.get(extension)
        if not url:
            print(f"No {extension.upper()} URL returned", flush=True)
            continue

        destination = output_dir / f"{basename}.{extension}"
        with urlopen(url, timeout=180) as response:
            with destination.open("wb") as handle:
                while True:
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    if chunk:
                        handle.write(chunk)

        downloaded.append(destination)
        print(f"Downloaded {extension.upper()}: {destination.relative_to(repo_root)} ({destination.stat().st_size:,} bytes)", flush=True)

    return downloaded


def write_metadata(repo_root: Path, basename: str, task_id: str, prompt: str, target_polycount: int, task: dict) -> Path:
    output_dir = repo_root / "frontend" / "public" / "garments"
    metadata_path = output_dir / f"{basename}-meta.json"
    metadata = {
        "source": "Meshy Text to 3D preview",
        "task_id": task_id,
        "prompt": prompt,
        "target_polycount": target_polycount,
        "topology": "quad",
        "pose_mode": "a-pose",
        "status": task.get("status"),
        "consumed_credits": task.get("consumed_credits"),
    }
    metadata_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote metadata: {metadata_path.relative_to(repo_root)}", flush=True)
    return metadata_path


def inspect_glb(path: Path) -> dict:
    data = path.read_bytes()
    if data[:4] != b"glTF":
        return {"valid_glb": False, "reason": "missing glTF magic"}

    offset = 12
    json_chunk = None
    while offset + 8 <= len(data):
        chunk_length = int.from_bytes(data[offset : offset + 4], "little")
        chunk_type = data[offset + 4 : offset + 8]
        offset += 8
        chunk_data = data[offset : offset + chunk_length]
        offset += chunk_length
        if chunk_type == b"JSON":
            json_chunk = chunk_data.rstrip(b" \x00\t\r\n")
            break

    if not json_chunk:
        return {"valid_glb": False, "reason": "missing JSON chunk"}

    document = json.loads(json_chunk.decode("utf-8"))
    meshes = document.get("meshes", [])
    nodes = document.get("nodes", [])
    skins = document.get("skins", [])
    animations = document.get("animations", [])
    primitives = [primitive for mesh in meshes for primitive in mesh.get("primitives", [])]
    named_nodes = [node.get("name", "") for node in nodes if node.get("name")]

    return {
        "valid_glb": True,
        "mesh_count": len(meshes),
        "node_count": len(nodes),
        "skin_count": len(skins),
        "animation_count": len(animations),
        "primitive_count": len(primitives),
        "has_joints_0": any("JOINTS_0" in primitive.get("attributes", {}) for primitive in primitives),
        "has_weights_0": any("WEIGHTS_0" in primitive.get("attributes", {}) for primitive in primitives),
        "named_nodes_sample": named_nodes[:12],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate and inspect a Meshy garment candidate.")
    parser.add_argument("--basename", default="meshy-white-shirt-a-pose")
    parser.add_argument("--target-polycount", type=int, default=15000)
    parser.add_argument(
        "--prompt",
        default=(
            "plain white long sleeve shirt garment only, hollow wearable clothing, no body, no mannequin, "
            "neutral A-pose sleeves, front facing, clean symmetrical topology, realistic cotton fabric folds, "
            "centered at torso, suitable for virtual try on"
        ),
    )
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parents[1]
    api_key = load_meshy_api_key(repo_root)
    task_id = post_preview_task(api_key, args.prompt, args.target_polycount)
    print(f"Meshy preview task created: {task_id}", flush=True)

    task = stream_task(api_key, task_id)
    download_outputs(repo_root, task, args.basename)
    write_metadata(repo_root, args.basename, task_id, args.prompt, args.target_polycount, task)

    glb_path = repo_root / "frontend" / "public" / "garments" / f"{args.basename}.glb"
    if glb_path.exists():
        print("GLB inspection:")
        print(json.dumps(inspect_glb(glb_path), indent=2), flush=True)


if __name__ == "__main__":
    main()