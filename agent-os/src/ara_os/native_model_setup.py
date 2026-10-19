"""Native-only shared setup. Credentials never cross the worker's JSON transport."""
from __future__ import annotations

import hashlib
import re
import copy


MODEL_FIELDS = {"default", "provider", "base_url", "api_mode", "context_length", "openai_runtime"}
ROUTE_FIELDS = {"name", "base_url", "api_mode", "model", "default_model", "context_length"}


def shared_source(root):
    from agent.secret_scope import build_profile_secret_scope, set_secret_scope, reset_secret_scope
    token = set_secret_scope(build_profile_secret_scope(root), profile_home=str(root))
    try:
        return _shared_source(root)
    finally:
        reset_secret_scope(token)


def _shared_source(root):
    from hermes_cli.config import get_compatible_custom_providers
    from hermes_cli.config_effective import load_user_config_effective
    from agent.secret_scope import get_secret_str
    from hermes_cli.runtime_provider import resolve_runtime_provider
    from agent.credential_pool import load_pool, get_custom_provider_pool_key, PooledCredential
    from hermes_cli.auth import read_credential_pool, write_credential_pool, PROVIDER_REGISTRY
    from hermes_cli.auth_oauth_grants import SINGLE_USE_REFRESH_POOL_PROVIDERS

    cfg = load_user_config_effective(root / "config.yaml", fail_closed=True)
    selected = cfg.get("model")
    if not isinstance(selected, dict) or not str(selected.get("default") or "").strip():
        raise ValueError("No shared model selected. Run ara setup interactively first.")
    provider = selected.get("provider")
    if not isinstance(provider, str) or not provider.strip() or provider == "auto":
        raise ValueError("Select an explicit provider in the shared model wizard.")
    # A previous shared fallback must not shadow a newly entered API key in the
    # wizard. Resolve the selected owner's explicit key reference first.
    explicit_key = selected.get("api_key")
    key_env = selected.get("key_env")
    if key_env:
        explicit_key = get_secret_str(key_env)
    spec = PROVIDER_REGISTRY.get(provider)
    if not explicit_key and spec and spec.auth_type == "api_key":
        explicit_key = next((get_secret_str(k) for k in spec.api_key_env_vars if get_secret_str(k)), None)
    resolved = resolve_runtime_provider(requested=provider, target_model=selected["default"],
                                        explicit_api_key=explicit_key or None)
    pool_key = get_custom_provider_pool_key(selected.get("base_url"), provider) or provider
    pool = load_pool(pool_key)  # Materialize the root-owned OAuth pool for native fallback.
    key = resolved.get("api_key")
    oauth = (provider in SINGLE_USE_REFRESH_POOL_PROVIDERS or provider.endswith("-oauth")
             or any(e.auth_type == "oauth" and e.access_token == key for e in pool.entries())
             or isinstance(key, str) and key.startswith("sk-ant-oat"))
    if not oauth and isinstance(key, str) and key and key != "no-key-required":
        # Env-backed entries are profile-local references. A deliberate, root-owned
        # manual entry lets native fallback share the key without copying .env files.
        label = "Agent OS shared setup"
        shared_id = "ara-setup-" + hashlib.sha256(pool_key.encode()).hexdigest()[:16]
        rows = [r for r in read_credential_pool(pool_key) if r.get("id") != shared_id]
        entry = PooledCredential(provider=pool_key, id=shared_id,
            label=label, auth_type="api_key", priority=-1, source="manual", access_token=key,
            base_url=resolved.get("base_url") or selected.get("base_url"))
        write_credential_pool(pool_key, [entry.to_dict(), *rows])
    model = {k: v for k, v in selected.items() if k in MODEL_FIELDS}
    if resolved.get("api_mode"):
        model["api_mode"] = resolved["api_mode"]
    routes = []
    for route in get_compatible_custom_providers(cfg):
        if (route.get("provider_key") == provider or
                route.get("name") in {provider, provider.removeprefix("custom:")} or
                (selected.get("base_url") and route.get("base_url", "").rstrip("/") == selected["base_url"].rstrip("/"))):
            routes.append(({k: v for k, v in route.items() if k in ROUTE_FIELDS}, route.get("provider_key")))
            break
    return model, routes


def apply_shared_model(request):
    from hermes_constants import get_hermes_home
    from hermes_cli.config import read_user_config_raw, atomic_config_replace

    root = get_hermes_home().resolve()
    profiles_root = root / "profiles"
    if profiles_root.is_symlink() or profiles_root.resolve() != profiles_root:
        raise ValueError("Preset homes must be inside this installation, not a linked profiles directory.")
    if request.get("source_hash") != hashlib.sha256((root / "config.yaml").read_bytes()).hexdigest():
        raise ValueError("The shared model changed during setup. Review the selection and retry.")
    targets = request.get("targets", [])
    checked = []
    for target in targets:
        name = target["native_name"]
        if not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,63}", name):
            raise ValueError("Invalid native preset profile name")
        home = profiles_root / name
        if home.is_symlink() or home.resolve().parent != profiles_root:
            raise ValueError("Preset profile must stay inside this installation")
        path = home / "config.yaml"
        if path.is_symlink() or hashlib.sha256(path.read_bytes()).hexdigest() != target["config_hash"]:
            raise ValueError("A model configuration changed during setup. Rerun setup to review it.")
        checked.append((name, path, target["config_hash"]))
    if not checked:
        return {"applied": [], "model": None}
    model, routes = shared_source(root)
    applied = []
    for name, path, expected in checked:
        previous = None
        try:
            if hashlib.sha256(path.read_bytes()).hexdigest() != expected:
                raise ValueError("Configuration changed")
            cfg = read_user_config_raw(path) or {}
            previous = copy.deepcopy(cfg)
            cfg["model"] = dict(model)  # Replace stale protocol/key fields, not unrelated config.
            for route, key in routes:
                if key:
                    cfg.setdefault("providers", {})[key] = route
                else:
                    entries = cfg.setdefault("custom_providers", [])
                    entries[:] = [r for r in entries if r.get("name") != route.get("name")]
                    entries.append(route)
            atomic_config_replace(path, cfg)
            path.chmod(0o600)
            # Resolve the account under the actual owning profile before claiming
            # setup succeeded. This is configuration validation, not inference.
            from gateway.run import _profile_runtime_scope
            from hermes_cli.runtime_provider import resolve_runtime_provider
            with _profile_runtime_scope(path.parent):
                resolved = resolve_runtime_provider(requested=model["provider"], target_model=model["default"])
                if resolved.get("api_mode") == "anthropic_messages":
                    from agent.anthropic_adapter import _require_sdk
                    _require_sdk("shared model setup")
            applied.append(name)
        except Exception:
            if previous is not None:
                try:
                    atomic_config_replace(path, previous)
                except Exception:
                    return {"applied": applied, "model": model, "failed": name,
                            "detail": "The update failed and restoring this profile's configuration could not be confirmed. "
                                      "Inspect its native config before retrying; earlier successful updates are retained."}
            return {"applied": applied, "model": model, "failed": name,
                    "detail": "Native configuration changed, could not be written, or its account could not be resolved. "
                              "This profile's prior configuration was retained; review native account setup before retrying."}
    return {"applied": applied, "model": model, "credentials": "native_root_pool", "effective": "new_sessions"}
