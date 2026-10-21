from __future__ import annotations

import asyncio
import json
import sys
from typing import Any, Dict

from .. import __version__
from .tools import CUA_TOOLS, invoke_cua_tool, result_content


async def handle_jsonrpc(request: Dict[str, Any], *, actor=None) -> Dict[str, Any] | None:
    method = request.get("method")
    req_id = request.get("id")

    if method == "initialize":
        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "result": {
                "protocolVersion": "2024-11-05",
                "capabilities": {"tools": {}},
                "serverInfo": {"name": "ara-cua", "version": __version__},
            },
        }

    elif method in ("notifications/initialized", "initialized"):
        return None

    elif method == "tools/list":
        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "result": {"tools": CUA_TOOLS},
        }

    elif method == "tools/call":
        params = request.get("params", {})
        tool_name = params.get("name", "")
        tool_args = params.get("arguments", {})

        import jsonschema
        tool = next((t for t in CUA_TOOLS if t["name"] == tool_name), None)
        if tool is None:
            return {"jsonrpc": "2.0", "id": req_id, "error": {"code": -32602, "message": "Unknown computer tool"}}
        try:
            jsonschema.validate(tool_args, tool["inputSchema"])
        except jsonschema.ValidationError:
            return {"jsonrpc": "2.0", "id": req_id, "error": {"code": -32602, "message": "Invalid computer tool arguments"}}
        try:
            result = await invoke_cua_tool(tool_name, tool_args, actor=actor)
        except Exception:
            result = {"success": False, "error": "Native computer action unavailable; inspect local driver and policy."}
        is_error = "error" in result and not result.get("success", False) and result.get("metadata", {}).get("state") != "pending"

        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "result": {
                "content": result_content(result),
                "isError": is_error,
            },
        }

    elif method == "ping":
        return {"jsonrpc": "2.0", "id": req_id, "result": {}}

    if req_id is not None:
        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "error": {"code": -32601, "message": f"Method not found: {method}"},
        }
    return None


async def run_stdio_server(actor=None):
    """Runs a standalone stdio JSON-RPC MCP server for local Hermes agents."""
    loop = asyncio.get_running_loop()
    reader = asyncio.StreamReader()
    protocol = asyncio.StreamReaderProtocol(reader)
    await loop.connect_read_pipe(lambda: protocol, sys.stdin)

    while True:
        line = await reader.readline()
        if not line:
            break
        text = line.decode().strip()
        if not text:
            continue

        try:
            req = json.loads(text)
            response = await handle_jsonrpc(req, actor=actor)
            if response:
                out = json.dumps(response) + "\n"
                sys.stdout.write(out)
                sys.stdout.flush()
        except Exception as e:
            err_resp = {
                "jsonrpc": "2.0",
                "id": None,
                "error": {"code": -32700, "message": f"Parse error or exception: {str(e)}"},
            }
            sys.stdout.write(json.dumps(err_resp) + "\n")
            sys.stdout.flush()


def main(actor=None):
    asyncio.run(run_stdio_server(actor))


if __name__ == "__main__":
    main()
