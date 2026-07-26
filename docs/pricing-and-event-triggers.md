# Pricing and Twitch event triggers

## Working Sparks price model

Sparks are still a prototype currency. The current balanced catalog uses these
starting ranges:

| Effect class | Working range | Examples |
| --- | ---: | --- |
| Small helpful effect | 100–250 | Health Drop, Ammo Refill, Cash Delivery |
| Strong helpful or light disruption | 250–450 | Super Jump, Grounded, Loot Luck |
| High-impact disruption | 450–700 | Fast Forward, Roadblock, Golden Chest Surprise |
| Boss or stream-changing event | 700–1,000 | Clean Sweep, Barrel Message, boss spawn |

The companion provides Lower, Balanced, and Higher price presets and still
allows every effect price to be edited individually. Cooldowns and maximum uses
remain separate controls; a high price must not be the only flood protection.

## Initial Twitch milestone mappings

All automatic mappings are disabled by default until production EventSub
delivery has durable message-ID deduplication.

| Twitch milestone | Suggested effect | Threshold | Cooldown | Max per stream |
| --- | --- | ---: | ---: | ---: |
| New follow | Health Drop | 1 | 15 seconds | 20 |
| New subscription | Red Chest | Tier 1 | 30 seconds | 12 |
| Incoming raid | Choose an Enemy | 5 viewers | 120 seconds | 5 |
| Hype Train begins | Overdrive | Level 1 | 300 seconds | 3 |

The streamer can change the effect, threshold, cooldown, and cap. Effects with
viewer inputs use their server-defined default input when triggered
automatically.

## Production safety requirements

- Verify Twitch EventSub signatures before reading an event.
- Deduplicate by Twitch message ID before creating a command.
- Apply the configured threshold, cooldown, and per-stream cap on the server.
- Resolve only server-catalog effect keys and server-defined default inputs.
- Never accept an actor definition or SDK argument from an EventSub payload.
- Treat Hype Train begin as one trigger. Do not trigger on every progress event.
- Keep Emergency Pause authoritative over automatic and viewer-purchased events.
