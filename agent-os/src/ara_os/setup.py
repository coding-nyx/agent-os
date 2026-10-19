"""Installation onboarding: provision presets, then one native provider/model wizard."""
from __future__ import annotations

import asyncio
import hashlib
import subprocess
import sys

import httpx
import yaml

from . import config, profiles, runtime
from .catalog import PRESETS
from .store import Problem, change, listing, transaction


async def ensure_presets():
    # A running API owns restart/outcome reconciliation. Never run initialize()
    # against it: that would mark its executing runs unknown.
    async with httpx.AsyncClient(timeout=5, trust_env=False) as client:
        try:
            response = await client.get(config.API_URL + "/api/v1/health")
        except httpx.TransportError:
            response = None
    if response is None:
        from .store import initialize
        await asyncio.to_thread(initialize)
    elif response.status_code != 200 or response.json().get("product") != "ARA Agent OS":
        raise Problem("setup_service_not_ready", "The local API is unavailable or belongs to another service. Check it before setup.", 409)
    await profiles.seed()
    with transaction() as session:
        installed = listing(session, "profile")
    # Only the original instance for each preset, never clones/custom/retained profiles.
    selected = [next(p for p in installed if p["preset"] == spec["id"]) for spec in PRESETS]
    if any(p.get("provision_state") != "ready" for p in selected):
        raise Problem("setup_profiles_not_ready", "Some presets could not be provisioned. Inspect their setup errors before configuring models.", 409)
    return selected


async def apply_model(selected, replace=False, source_hash=None):
    targets = []
    kept = []
    for p in selected:
        if profiles.resolve_model_connection(p) and not replace:
            kept.append(p["name"])
            continue
        path = runtime.home(p) / "config.yaml"
        targets.append({"native_name": p["native_name"], "config_hash": hashlib.sha256(path.read_bytes()).hexdigest()})
    if not targets:
        return {"applied": [], "kept": kept, "model": None}
    source_hash = source_hash or hashlib.sha256((config.RUNTIME_HOME / "config.yaml").read_bytes()).hexdigest()
    result = await runtime.call({"operation": "setup-model", "targets": targets, "source_hash": source_hash})
    applied = set(result["applied"])
    with transaction() as session:
        for p in selected:
            if p["native_name"] in applied:
                change(session, p["id"], {"model_connection": profiles.resolve_model_connection(p)})
    if result.get("failed"):
        raise Problem("setup_model_partial", f"Applied to {len(applied)} presets; setup stopped at {result['failed']}. "
                      + result["detail"], 409)
    return {**result, "kept": kept}


def run_setup(args):
    installed = asyncio.run(ensure_presets())
    print("Preset runtimes ready: " + ", ".join(p["name"] for p in installed))
    if args.skip_model:
        print("Model setup skipped. Run `ara setup` when ready.")
        return
    interactive = sys.stdin.isatty() and sys.stdout.isatty() and not args.non_interactive
    if not args.use_existing and not interactive:
        print("No interactive terminal: model setup skipped. Run `ara setup` in a terminal, "
              "or `ara setup --use-existing` to apply an already-configured shared model.")
        return
    configured = [p for p in installed if profiles.resolve_model_connection(p)]
    replace = args.replace_models
    if interactive and configured and not replace:
        print("Existing model choices: " + ", ".join(p["name"] for p in configured))
        replace = input("Replace these choices with one shared model? [y/N] ").strip().lower() in {"y", "yes"}
    targets = installed if replace else [p for p in installed if p not in configured]
    if not targets:
        print("All presets already have models; existing choices kept. Use --replace-models to change them together.")
        return
    print("Shared model targets: " + ", ".join(p["name"] for p in targets))
    if not args.use_existing:
        print("Configure the provider/account once in the native wizard. "
              "It will be shared on this machine; roles, history and data permissions stay separate.")
        env = config.runtime_env()
        env.pop("HERMES_PROFILE", None)
        code = subprocess.call([str(config.RUNTIME_PYTHON), "-m", "hermes_cli.main", "--profile", "default", "model"],
                               cwd=config.RUNTIME_SOURCE, env=env)
        if code:
            raise Problem("model_setup_cancelled", "Model setup did not finish. Existing profile settings were kept.", 409)
    path = config.RUNTIME_HOME / "config.yaml"
    source_hash = hashlib.sha256(path.read_bytes()).hexdigest()
    shared = (yaml.safe_load(path.read_text()) or {}).get("model")
    if not isinstance(shared, dict) or not shared.get("default"):
        raise Problem("model_setup_incomplete", "No shared model was selected. Preset model settings were kept.", 409)
    if interactive and not args.use_existing:
        answer = input(f"Apply {shared.get('provider')} / {shared.get('default')} to the listed presets? [y/N] ")
        if answer.strip().lower() not in {"y", "yes"}:
            print("Shared model was not applied. Preset model settings were kept.")
            return
    result = asyncio.run(apply_model(installed, replace=replace, source_hash=source_hash))
    model = result.get("model") or {}
    print(f"Shared model: {model.get('provider', 'unchanged')} / {model.get('default', 'unchanged')}")
    print(f"Applied to {len(result['applied'])} presets; kept {len(result['kept'])} existing choices. "
          "New conversations use these settings. No inference was submitted.")
