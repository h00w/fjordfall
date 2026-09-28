# Device acceptance checklist

Automated coverage lives in `scripts/test-game.mjs`. The following checks require real clients and should be recorded before a public release:

1. Open the same room invite on two separate devices. Confirm both names, ready states, movement, directions, and health update within a second.
2. Repeat the lobby with 2, 3, 4, and 10 people. Confirm an eleventh join shows **ROOM_FULL**, and an unknown code shows **ROOM_NOT_FOUND**.
3. Run a five-minute two-client session with both players moving and attacking; compare stage, enemy health, and roster on both screens.
4. Land 20 attacks. Count one health change per accepted server strike on both screens.
5. Let the AI down a player; have a teammate stand within revive range for three seconds. Confirm both see the restored health.
6. Let the AI down the whole crew. Confirm shared defeat and host replay in the same room.
7. Complete the five encounters, open each Rune Gate, defeat the dragon, and replay three times without duplicate players or stale scores.
8. Run a duel with two players, then test a larger room. Confirm a single winner and clean replay.
9. Use a phone and a laptop for movement, attack, interact, and revive without unwanted page scrolling or zoom.
10. Check browser consoles and server logs for uncaught errors during the above runs.

The automated route test is a server-flow simulation. It does not substitute for these device checks.
