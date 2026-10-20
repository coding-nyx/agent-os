"""Profile-scoped local swarm and computer tools, with no coordinator dependency."""
from __future__ import annotations

import asyncio
import json
import sys

from . import config, swarm_runner, swarm_policy, runtime


def configuration(name):
    return {"command": sys.executable, "args": ["-m", "ara_os.cli", "--state", str(config.STATE), "node", "mcp", "--profile", name]}


def install(name):
    import fcntl
    import yaml
    from .native_definition import atomic
    home = runtime.home({"native_name": name})
    path = home / "config.yaml"
    if home.is_symlink() or path.is_symlink():
        raise ValueError("Refusing linked native profile configuration")
    with (home / ".ara-policy.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        before = path.read_bytes()
        cfg = yaml.safe_load(before) or {}
        cfg.setdefault("mcp_servers", {})["ara-node"] = configuration(name)
        if path.read_bytes() != before:
            raise ValueError("Native configuration changed; retry node setup")
        atomic(path, yaml.safe_dump(cfg, sort_keys=False))


def tools():
    from .mcp import TOOLS
    return [t for t in TOOLS if t["name"] in {"ara_list_swarms", "ara_spawn_swarm", "ara_get_swarm", "ara_cancel_swarm"}
        or t["name"].startswith("ara_cua_")]


async def invoke(name, tool, args):
    profile = swarm_runner.profile(name)
    if tool.startswith("ara_cua_"):
        from .cua.tools import invoke_cua_tool
        return await invoke_cua_tool(tool, args, actor=name)
    if tool == "ara_list_swarms":
        from .swarms import SWARM_PRESETS
        cfg = swarm_policy.read(runtime.home(profile))
        return {"enabled": cfg["enabled"], "trigger_mode": cfg["trigger_mode"], "owner": "this_node",
            "allowed_presets": [p for p in SWARM_PRESETS if p["id"] in cfg["allowed_presets"]]}
    if tool == "ara_spawn_swarm":
        if args.get("machine_id"):
            raise ValueError("Standalone node tools execute on this machine; use dashboard deployment controls for another machine")
        request = swarm_runner.request_for(name, args["preset"], args["task"], args["operation_id"], args.get("custom_roles"))
        from .node_deployments import marker
        path = marker(name)
        if path.exists():
            request["deployment_generation"] = json.loads(path.read_text())["generation"]
        row = swarm_runner.admit(request)
        swarm_runner.launch(row["id"])
        return {"swarm_id": row["id"], "state": row["state"], "owner": "this_node"}
    row = swarm_runner.journal().read(args["swarm_id"])
    if row["request"]["native_name"] != name:
        raise ValueError("This profile does not own that local swarm")
    if tool == "ara_cancel_swarm":
        swarm_runner.journal().cancel(row["id"])
    return swarm_runner.journal().reconcile(row["id"])


async def serve(name):
    import jsonschema
    reader = asyncio.StreamReader(limit=1_000_000)
    await asyncio.get_running_loop().connect_read_pipe(lambda: asyncio.StreamReaderProtocol(reader), sys.stdin)
    while line := await reader.readline():
        id = None
        try:
            request = json.loads(line)
            id, method = request.get("id"), request.get("method")
            if id is None:
                continue
            if method == "initialize":
                result = {"protocolVersion": "2024-11-05", "capabilities": {"tools": {}},
                    "serverInfo": {"name": "ara-node", "version": "0.1.0"}}
            elif method == "ping":
                result = {}
            elif method == "tools/list":
                result = {"tools": tools()}
            elif method == "tools/call":
                params = request.get("params", {})
                tool = next((t for t in tools() if t["name"] == params.get("name")), None)
                if tool is None:
                    raise ValueError("Unknown node tool")
                args = params.get("arguments") or {}
                jsonschema.validate(args, tool["inputSchema"])
                value = await invoke(name, tool["name"], args)
                from .cua.tools import result_content
                content = result_content(value) if tool["name"].startswith("ara_cua_") else [{"type": "text", "text": json.dumps(value, default=str)}]
                result = {"content": content, "isError": bool(value.get("error"))}
            else:
                raise ValueError("Unknown node method")
            response = {"jsonrpc": "2.0", "id": id, "result": result}
        except Exception as exc:
            response = {"jsonrpc": "2.0", "id": id, "result": {"isError": True,
                "content": [{"type": "text", "text": getattr(exc, "detail", str(exc))[:1200]}]}}
        print(json.dumps(response, default=str), flush=True)
