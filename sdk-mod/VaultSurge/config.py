"""Local pairing configuration shared by the installer and companion app."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

CONFIG_FILENAME = "bridge.json"


def config_path() -> Path:
    base = os.environ.get("LOCALAPPDATA")
    if not base:
        base = str(Path.home() / "AppData" / "Local")
    return Path(base) / "VaultSurge" / CONFIG_FILENAME


def load_config() -> dict[str, Any]:
    path = config_path()
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        return raw if isinstance(raw, dict) else {}
    except Exception:
        return {}


def bridge_token() -> str:
    value = str(load_config().get("bridge_token") or "").strip()
    if value:
        return value
    # Useful only for developer launches where the game inherited the variable.
    return str(os.environ.get("VAULT_SURGE_SDK_TOKEN") or "").strip()
