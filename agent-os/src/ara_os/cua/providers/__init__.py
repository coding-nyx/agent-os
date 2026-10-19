from __future__ import annotations

from typing import Dict, List, Optional

from .base import BaseDeviceProvider
from .native import NativeDeviceProvider


_REGISTRY: Dict[str, BaseDeviceProvider] = {}


def register_device(provider: BaseDeviceProvider) -> None:
    _REGISTRY[provider.device_id] = provider


def get_device_provider(device_id: str) -> Optional[BaseDeviceProvider]:
    return _REGISTRY.get(device_id)


async def discover_all_devices() -> List[BaseDeviceProvider]:
    """Auto-discovers locally available devices (macOS host, Linux host, connected Android devices via ADB)."""
    if "local_desktop" not in _REGISTRY:
        register_device(NativeDeviceProvider())

    return list(_REGISTRY.values())


__all__ = [
    "BaseDeviceProvider",
    "NativeDeviceProvider",
    "register_device",
    "get_device_provider",
    "discover_all_devices",
]
