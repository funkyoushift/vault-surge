"""Vault Surge game-side adapter for Borderlands 4."""

from __future__ import annotations

from mods_base import CoopSupport, Game, build_mod

from .bridge import start_bridge

__version__: str = "0.1.0"
__version_info__: tuple[int, int, int] = (0, 1, 0)

start_bridge()

build_mod(
    name="Vault Surge",
    author="FunkYouSHIFT",
    description=(
        "Authenticated local adapter for the Vault Surge Twitch Extension. "
        "Accepts only curated, server-approved effects from the local companion app."
    ),
    supported_games=Game.BL4,
    coop_support=CoopSupport.Unknown,
)
