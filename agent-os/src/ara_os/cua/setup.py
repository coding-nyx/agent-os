"""Explicit operator setup, separate from agent desktop capabilities."""
from __future__ import annotations

from .. import config, runtime
from ..node_install import atomic, read
from .models import local_platform

CONTRACT = "ara-computer-setup/1"


def cached():
    return read(config.STATE / "computer-setup-status.json")


async def perform(action):
    result = await runtime.call({"operation": "computer-setup", "action": action})
    atomic(config.STATE / "computer-setup-status.json", result.get("diagnostics"))
    return result


def local_status():
    return {"supported": True, "contract": CONTRACT, "platform": local_platform(), "online": True, "diagnostics": cached()}
