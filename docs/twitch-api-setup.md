# Twitch API setup

Vault Surge currently implements the local security foundation for Twitch. It
does not create rewards, EventSub subscriptions, Bits products, or production
transactions yet.

## Trust paths

The project keeps three Twitch credential paths separate:

1. **Broadcaster OAuth** grants the server scoped access to Helix. The current
   scopes are `channel:manage:redemptions`, `channel:read:subscriptions`,
   `channel:read:hype_train`, and `moderator:read:followers`.
2. **Extension viewer authorization** receives the rotating JWT from
   `Twitch.ext.onAuthorized`. The browser passes that JWT to the EBS, which
   verifies it with the server-only Extension secret.
3. **EventSub webhooks** are accepted only after validating Twitch’s HMAC
   signature and a ten-minute timestamp replay window.

Bits-in-Extensions will use the Extension Helper’s product catalog and
transaction receipt. A future EBS endpoint must verify that receipt before
creating any paid effect command.

Official references:

- [Twitch authentication](https://dev.twitch.tv/docs/authentication/)
- [OAuth authorization code flow](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/)
- [Extension authorization and JWT schema](https://dev.twitch.tv/docs/extensions/reference/)
- [EventSub webhook handling](https://dev.twitch.tv/docs/eventsub/handling-webhook-events/)
- [Channel Points redemption events](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/#channel-points-custom-reward-redemption-add)
- [EventSub subscription types](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/)
- [Channel Points reward API](https://dev.twitch.tv/docs/api/reference/#create-custom-rewards)
- [Bits in Extensions](https://dev.twitch.tv/docs/extensions/monetization/)

## Local configuration

Register a Twitch application and configure this exact OAuth redirect:

```text
http://localhost:3000/api/twitch/oauth/callback
```

Copy `.env.example` to the local ignored environment file used by the
development runtime. Fill these server-only values:

```text
TWITCH_CLIENT_ID
TWITCH_CLIENT_SECRET
TWITCH_REDIRECT_URI
TWITCH_SESSION_SECRET
TWITCH_EXTENSION_CLIENT_ID
TWITCH_EXTENSION_SECRET
TWITCH_EVENTSUB_SECRET
```

Use a cryptographically random value of at least 32 characters for
`TWITCH_SESSION_SECRET`. Twitch supplies the application and Extension
credentials. Choose a separate random EventSub secret.

Never expose the Extension secret, OAuth client secret, access token, refresh
token, EventSub secret, or command-signing secret to browser code.

Add separate random values for `COMMAND_SIGNING_SECRET` and
`STREAMER_COMPANION_TOKEN`. Set `VAULT_SURGE_LOCAL_SESSION_ACTIVE=true` only
while the local companion is accepting requests. If
`VAULT_SURGE_LOCAL_CHANNEL_ID` is set, requests from other channels are
rejected.

## Exact Local Test asset settings

Run the two surfaces in separate PowerShell windows:

```powershell
npm run dev
npm run extension:dev
```

In Twitch **Asset Hosting**, enter:

| Field | Value |
| --- | --- |
| Testing Base URI | `https://localhost:8081/` |
| Type | Video - Component |
| Video - Component Viewer Path | `viewer.html` |
| Config Path | `config.html` if setup help is enabled |
| Live Config Path | leave blank |

In **Capabilities**, use these exact values:

| Field | Value |
| --- | --- |
| Request Identity Link | No |
| Chat Capabilities | No |
| Configuration | No configuration |
| Required Per Channel Configuration | leave empty |
| Allowlist config URLs | `https://github.com/bl-sdk/oak2-mod-manager/releases/latest` |
| Allowlist panel URLs | leave empty |
| Allowlist for Image Domains | leave empty |
| Allowlist for Media Domains | leave empty |
| Allowlist for URL Fetching Domains | `https://localhost:3000` |

The Image and Media fields show Twitch-provided default sources as placeholder
text; do not enter those defaults. The component's own files are already
allowed by CSP `'self'`. The URL-fetching entry is required because the
component at `https://localhost:8081` calls the distinct local EBS origin at
`https://localhost:3000`.

Choose **No configuration** because Twitch's configuration location describes
where per-channel Extension configuration is stored. Vault Surge stores its
effect settings in the installed local companion; its EBS handles commands but
does not host an Extension configuration record. Every HTML view, including
`config.html`, must still load Twitch's Extension Helper.

The Twitch Config page is setup help only. Effect settings, OAuth, approvals,
cooldowns, and game status stay in the installed companion. Viewers install
nothing.

## Implemented routes

| Route | Purpose |
| --- | --- |
| `GET /api/twitch/oauth/start` | Starts broadcaster authorization with state protection |
| `GET /api/twitch/oauth/callback` | Exchanges and validates the code, then stores an encrypted HTTP-only session |
| `POST /api/twitch/oauth/logout` | Clears the local broadcaster session |
| `GET /api/twitch/status` | Returns non-secret connection and capability state |
| `POST /api/twitch/extension/session` | Verifies a Twitch Extension viewer JWT |
| `GET /api/twitch/extension/catalog` | Returns enabled, non-restricted viewer-safe catalog fields |
| `POST /api/twitch/extension/commands` | Validates a catalog request and creates a signed command |
| `GET/POST /api/streamer/commands` | Authenticated companion queue polling and lifecycle updates |
| `POST /api/twitch/eventsub` | Verifies webhook signatures and answers Twitch challenges |

The status route refreshes an expiring broadcaster token on the server. Twitch
tokens are never returned to the frontend.

## Next gated step

Creating EventSub webhook subscriptions requires a public HTTPS callback that
Twitch can challenge. After a deployment target is approved:

1. Add durable idempotency storage for EventSub message IDs and redemptions.
2. Create only Vault Surge-owned Channel Points rewards.
3. Subscribe to
   `channel.channel_points_custom_reward_redemption.add` version `1`.
4. Translate only recognized reward IDs into authoritative effect keys.
5. Mark a redemption fulfilled only after the game command completes, or
   canceled when the effect is rejected or cannot run.
6. Add Bits product retrieval and receipt verification separately.

## Planned automatic event mappings

The local companion now stores configurable prototype mappings for:

| Twitch event | EventSub type | Version | Suggested effect |
| --- | --- | --- | --- |
| Follow | `channel.follow` | `2` | Health Drop |
| Subscription | `channel.subscribe` | `1` | Red Chest |
| Incoming raid | `channel.raid` | `1` | Choose an Enemy |
| Hype Train begins | `channel.hype_train.begin` | `2` | Overdrive |

Each mapping has an enable switch, threshold, cooldown, and per-stream cap.
They remain disabled by default until production EventSub delivery has durable
message-ID deduplication. Reconnect Twitch OAuth after adding the follower and
Hype Train scopes.
