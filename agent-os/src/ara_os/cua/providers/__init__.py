from __future__ import annotations

import platform
from typing import Dict, List, Optional

from .android import AndroidDeviceProvider
from .base import BaseDeviceProvider
from .linux import LinuxDeviceProvider
from .macos import MacOSDeviceProvider


_REGISTRY: Dict[str, BaseDeviceProvider] = {}


def register_device(provider: BaseDeviceProvider) -> None:
    _REGISTRY[provider.device_id] = provider


def get_device_provider(device_id: str) -> Optional[BaseDeviceProvider]:
    return _REGISTRY.get(device_id)


async def discover_all_devices() -> List[BaseDeviceProvider]:
    """Auto-discovers locally available devices (macOS host, Linux host, connected Android devices via ADB)."""
    current_os = platform.system().lower()

    # Host OS registration
    if current_os == "darwin":
        if "macos_local" not in _REGISTRY:
            register_device(MacOSDeviceProvider("macos_local", "Mac System"))
    elif current_os == "linux":
        if "linux_local" not in _REGISTRY:
            register_device(LinuxDeviceProvider("linux_local", "Linux Workstation"))

    # Android ADB discovery
    android_devices = await AndroidDeviceProvider.discover_devices()
    for dev in android_devices:
        register_device(dev)

    return list(_REGISTRY.values())


__all__ = [
    "BaseDeviceProvider",
    "MacOSDeviceProvider",
    "AndroidDeviceProvider",
    "LinuxDeviceProvider",
    "register_device",
    "get_device_provider",
    "discover_all_devices",
]
