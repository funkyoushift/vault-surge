"""Authenticated loopback bridge from the companion to the BL4 game thread."""

from __future__ import annotations

import hmac
import json
import re
import threading
import time
from collections import deque
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

from .config import bridge_token, config_path
from .effects import execute, process_resets, supported_effects

try:
    from mods_base import hook
except Exception:  # pragma: no cover - available only in-game
    hook = None  # type: ignore

try:
    from unrealsdk import logging
except Exception:  # pragma: no cover - available only in-game
    logging = None  # type: ignore

HOST = "127.0.0.1"
PORT = 49775
MAX_BODY_BYTES = 32 * 1024
MAX_QUEUE_DEPTH = 128
RESULT_TTL_SECONDS = 600
REPLAY_TTL_SECONDS = 900
ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$")
NONCE_PATTERN = re.compile(r"^[A-Za-z0-9_-]{16,128}$")

_server: ThreadingHTTPServer | None = None
_thread: threading.Thread | None = None
_lock = threading.RLock()
_queue: deque[dict[str, Any]] = deque()
_results: dict[str, tuple[float, dict[str, Any]]] = {}
_seen_ids: dict[str, float] = {}
_seen_nonces: dict[str, float] = {}
_started = False
_tick_registered = False
_last_error = ""
_last_effect = ""


def _log(message: str) -> None:
    text = f"[Vault Surge] {message}"
    try:
        if logging is not None:
            logging.info(text)
            return
    except Exception:
        pass
    print(text)


def _unix_expiry(value: Any) -> float:
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value or "").strip()
    if not text:
        return 0.0
    try:
        return float(text)
    except ValueError:
        return datetime.fromisoformat(text.replace("Z", "+00:00")).timestamp()


def _authorized(headers: Any) -> bool:
    expected = bridge_token()
    if not expected:
        return False
    supplied = str(headers.get("X-Vault-Surge-Token") or "").strip()
    authorization = str(headers.get("Authorization") or "").strip()
    if not supplied and authorization.lower().startswith("bearer "):
        supplied = authorization[7:].strip()
    return bool(supplied) and hmac.compare_digest(supplied, expected)


def _clean_old_state(now: float) -> None:
    for key, timestamp in list(_seen_ids.items()):
        if now - timestamp > REPLAY_TTL_SECONDS:
            _seen_ids.pop(key, None)
    for key, timestamp in list(_seen_nonces.items()):
        if now - timestamp > REPLAY_TTL_SECONDS:
            _seen_nonces.pop(key, None)
    for key, (timestamp, _) in list(_results.items()):
        if now - timestamp > RESULT_TTL_SECONDS:
            _results.pop(key, None)


def _validate_command(data: Any) -> tuple[dict[str, Any] | None, str]:
    if not isinstance(data, dict):
        return None, "Request body must be a JSON object."
    command_id = str(data.get("id") or "")
    nonce = str(data.get("nonce") or "")
    effect_key = str(data.get("effect_key") or "")
    if ID_PATTERN.fullmatch(command_id) is None:
        return None, "Invalid command id."
    if NONCE_PATTERN.fullmatch(nonce) is None:
        return None, "Invalid nonce."
    if effect_key not in supported_effects():
        return None, "Unsupported effect key."
    try:
        expires_at = _unix_expiry(data.get("expires_at"))
    except Exception:
        return None, "Invalid expiry."
    now_epoch = time.time()
    if expires_at <= now_epoch:
        return None, "Command expired."
    if expires_at > now_epoch + 300:
        return None, "Command expiry is too far in the future."
    parameters = data.get("parameters") or {}
    if not isinstance(parameters, dict):
        return None, "Parameters must be an object."
    safe_parameters: dict[str, str] = {}
    for key, value in parameters.items():
        if not isinstance(key, str) or len(key) > 40:
            return None, "Invalid parameter key."
        if not isinstance(value, str) or len(value) > 256:
            return None, "Invalid parameter value."
        safe_parameters[key] = value
    with _lock:
        _clean_old_state(time.monotonic())
        if command_id in _seen_ids or nonce in _seen_nonces:
            return None, "Replay rejected."
        if len(_queue) >= MAX_QUEUE_DEPTH:
            return None, "Game command queue is full."
        seen_at = time.monotonic()
        _seen_ids[command_id] = seen_at
        _seen_nonces[nonce] = seen_at
    return {
        "id": command_id,
        "effect_key": effect_key,
        "parameters": safe_parameters,
    }, ""


def _status() -> dict[str, Any]:
    with _lock:
        return {
            "ok": True,
            "name": "Vault Surge SDK Adapter",
            "version": "0.1.0",
            "host": HOST,
            "port": PORT,
            "started": _started,
            "paired": bool(bridge_token()),
            "config_path": str(config_path()),
            "queue_depth": len(_queue),
            "last_effect": _last_effect,
            "last_error": _last_error,
            "supported_effects": supported_effects(),
            "dependencies": {
                "MattsSDKBoostingTools": _module_available("MattsSDKBoostingTools"),
                "ActorScriptDeployer": _module_available("ActorScriptDeployer"),
                "Oak2LiveObjectViewer": _module_available("Oak2LiveObjectViewer"),
            },
        }


def _module_available(name: str) -> bool:
    try:
        __import__(name)
        return True
    except Exception:
        return False


def _process_game_thread(*_args: Any, **_kwargs: Any) -> None:
    global _last_effect, _last_error
    for reset_result in process_resets():
        if not reset_result.get("ok"):
            _last_error = str(reset_result.get("message") or "Timed reset failed.")
    for _ in range(8):
        with _lock:
            if not _queue:
                break
            command = _queue.popleft()
        command_id = str(command["id"])
        effect_key = str(command["effect_key"])
        try:
            result = execute(effect_key, dict(command["parameters"]))
        except Exception as exc:
            result = {"ok": False, "message": repr(exc)}
        _last_effect = effect_key
        if not result.get("ok"):
            _last_error = str(result.get("message") or "Effect failed.")
        result["id"] = command_id
        result["effect_key"] = effect_key
        with _lock:
            _results[command_id] = (time.monotonic(), result)


def _register_tick_hook() -> None:
    global _tick_registered, _last_error
    if _tick_registered or hook is None:
        return
    registered = 0
    errors: list[str] = []
    # UI ticks are useful in menus, but they are not guaranteed to exist on every
    # BL4 screen. CameraModifier is the proven BL4 gameplay/render heartbeat used
    # by BLImGui. Sharing the id suffix keeps each registration independent.
    for suffix, target in (
        ("ui", "/Script/GbxUIUMG.GbxUIUMGTickWidget:BP_TickWidget"),
        ("camera", "/Script/Engine.CameraModifier:BlueprintModifyCamera"),
    ):
        try:
            hook(
                target,
                immediately_enable=True,
                hook_identifier=f"vault_surge_game_adapter_tick_v2_{suffix}",
            )(_process_game_thread)
            registered += 1
        except Exception as exc:
            errors.append(f"{target}: {exc!r}")
    _tick_registered = registered > 0
    if not _tick_registered:
        _last_error = f"Tick hook failed: {'; '.join(errors)}"


class _Handler(BaseHTTPRequestHandler):
    server_version = "VaultSurgeSDK/0.1"

    def log_message(self, _format: str, *_args: Any) -> None:
        return

    def _send(self, status: int, data: Any) -> None:
        body = json.dumps(data, separators=(",", ":")).encode("utf-8")
        try:
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except OSError:
            return

    def do_GET(self) -> None:
        path = self.path.split("?", 1)[0]
        if path == "/v1/status":
            self._send(200, _status())
            return
        if not _authorized(self.headers):
            self._send(401, {"ok": False, "message": "Unauthorized."})
            return
        if path.startswith("/v1/commands/"):
            command_id = path.rsplit("/", 1)[-1]
            with _lock:
                stored = _results.get(command_id)
            if stored is None:
                self._send(404, {"ok": False, "message": "Command result not found."})
            else:
                self._send(200, stored[1])
            return
        self._send(404, {"ok": False, "message": "Not found."})

    def do_POST(self) -> None:
        if self.path.split("?", 1)[0] != "/v1/commands":
            self._send(404, {"ok": False, "message": "Not found."})
            return
        if not _authorized(self.headers):
            self._send(401, {"ok": False, "message": "Unauthorized."})
            return
        try:
            length = int(self.headers.get("Content-Length", "0") or "0")
            if length <= 0 or length > MAX_BODY_BYTES:
                self._send(413, {"ok": False, "message": "Invalid request size."})
                return
            data = json.loads(self.rfile.read(length).decode("utf-8"))
            command, error = _validate_command(data)
            if command is None:
                self._send(409 if error == "Replay rejected." else 400, {"ok": False, "message": error})
                return
            with _lock:
                _queue.append(command)
            self._send(202, {"ok": True, "queued": True, "id": command["id"]})
        except Exception as exc:
            self._send(400, {"ok": False, "message": repr(exc)})


def start_bridge() -> None:
    global _server, _thread, _started, _last_error
    if _started:
        return
    _register_tick_hook()
    try:
        _server = ThreadingHTTPServer((HOST, PORT), _Handler)
        _thread = threading.Thread(
            target=_server.serve_forever,
            name="VaultSurgeSDKBridge",
            daemon=True,
        )
        _thread.start()
        _started = True
        _log(f"SDK adapter listening on http://{HOST}:{PORT}")
    except Exception as exc:
        _last_error = repr(exc)
        _started = False
        _log(f"SDK adapter failed to start: {_last_error}")


def stop_bridge() -> None:
    global _server, _thread, _started
    try:
        if _server is not None:
            _server.shutdown()
            _server.server_close()
    except Exception:
        pass
    _server = None
    _thread = None
    _started = False
