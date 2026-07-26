# Vault Surge live channel test

## Start the local stack

1. Start Borderlands 4 and load a playable character into a map.
2. Double-click `Launch Vault Surge.cmd`.
3. In the companion, confirm all five setup checks are green:
   - Effect catalog loaded
   - BL4 SDK adapter paired
   - Local settings ready
   - Streamer session live
   - Twitch command boundary

The launcher starts the companion/EBS on `https://localhost:3000`, the Twitch
component's production-built static files on `https://localhost:8081`, and one
signed-command worker.

## Start the Twitch test

1. In Twitch Creator Dashboard, confirm Vault Surge 0.0.1 is active in a
   Component slot.
2. Start a short test broadcast from the normal streaming application.
3. Open `https://www.twitch.tv/funkyoushift` in a second browser or an
   incognito window to represent a viewer.
4. Open the Vault Surge video component and wait for **Connected**.
5. Use a low-impact confirmed effect first:
   - Cash Delivery
   - Loot Luck
   - Infinite Ammo
6. Confirm the command appears in the companion and completes in Borderlands 4.

## Current test-mode rules

- Sparks are development labels only. No Bits, Channel Points, or money are
  charged.
- Enabled effects dispatch automatically unless the streamer explicitly turns
  approval on later.
- Emergency Pause immediately stops new viewer requests.
- Effects marked `viewer inactive` remain available only in the companion's
  Live Test selector.

## If the component does not appear

- The channel must be live; Twitch does not mount video-component Extensions
  over the offline channel trailer.
- Confirm the local component server is listening on port 8081.
- Confirm Vault Surge remains active in a Twitch Component slot.
- Keep `https://localhost:3000` and `https://localhost:8081` trusted in the
  browser used for local testing.
