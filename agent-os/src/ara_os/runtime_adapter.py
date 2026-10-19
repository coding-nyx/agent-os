"""Versioned ARA execution boundary. Only this adapter knows native operations."""
from __future__ import annotations

from . import runtime

CONTRACT = "ara-execution/1"


async def worker(profile, request):
    result = await runtime.call({"operation": "swarm-worker", "contract": CONTRACT, **request}, profile)
    if not isinstance(result, dict) or result.get("status") not in {"completed", "failed", "error", "interrupted"}:
        raise ValueError("The runtime returned no valid worker completion receipt.")
    return result


async def computer(request):
    return await runtime.call({"operation": "computer-control", "contract": CONTRACT, **request})
