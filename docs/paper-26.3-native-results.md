# Native 26.3 validation record (2026-10-23)

This is an experimental protocol/dependency integration, **not yet an accepted
five-bot survival implementation**. Tests used a fresh disposable Paper
26.3-214 server on `127.0.0.1:25577`, Java 25.0.4, survival/easy, offline test
identities, no OP and an empty `plugins/` directory (no ViaVersion,
ViaBackwards or translator). Server JAR SHA256:
`a9dad541bf083d5a5f0b65b6a6a98263c55344f22f254c31628b528cf22b9423`.
The test host ran Node 24.21.0 and Python 3.13.5; targeted packet/version
tests also ran on Node 22.23.4. Python 3.14 and the optional VPT/MineStudio
path were **not tested**. `python3 -m py_compile neural_server.py` passed on
3.13.5; its default heuristic path uses only standard-library modules.

## Automated/static

| Command | Result |
| --- | --- |
| `npm ci --no-audit --no-fund` | PASS, 418 packages from lockfile; canvas/esbuild/Mineflayer imports verified afterward |
| `npm run typecheck` | PASS after `npm ci` |
| `npm run build` | PASS |
| `npm run lint` | PASS with 31 existing warnings, no errors |
| `npm test` | PASS, 1,050 tests after `npm ci` |
| `npm run test:native-packets` | PASS, 5 tests (777 handshake, data/registries, teleport layout, flat/stepped entity movement, movement flags and malformed data) |
| `npx -y node@22 --test scripts/test-native-263-packets.mjs` | PASS, 5 tests on Node 22.23.4 |
| `npx -y node@22 node_modules/tsx/dist/cli.mjs --test src/minecraft-compat.test.ts` | PASS, 5 tests on Node 22.23.4 |

The focused Mineflayer draft PR #4194 had green upstream lint and existing
Minecraft-version CI jobs (1.8.8 through 26.1). Its CI does **not** yet run
native 26.3 because the broader PrismarineJS 26.3 stack is still open.

`npm audit --omit=dev --json` reported 24 runtime findings: 15 moderate,
9 high, 0 critical. High-severity transitive packages are `axios`,
`compression`, `engine.io`, `engine.io-client`, `follow-redirects`,
`form-data`, `socket.io-adapter`, `socket.io-parser`, and `ws` (principally
TTS and viewer/dashboard paths). Core `mineflayer`/`minecraft-protocol`
chains also have moderate advisories. No force-upgrade or unrelated
security refactor was attempted. Keep unauthenticated web services loopback
or firewalled and review authentication/TTS paths before deployment.
The full `npm audit --json` reported 26 total (1 low, 15 moderate, 10 high,
0 critical); the extra high is dev-only `brace-expansion`. The user's earlier
local report of 27 including one critical was not reproduced with this pinned
lockfile and host; re-audit the WSL2 install rather than assuming the risk
vanished across environments.

## Real Paper observations

The server console stated `Paper version 26.3-214-main@e65c076`,
`Starting Minecraft server on 127.0.0.1:25577`, `Default game type: SURVIVAL`.
The packet observer printed the outgoing handshake
`10008906093132372e302e302e3163e902` (frame length `0x10`, handshake
packet ID `0x00`, protocol VarInt `0x89 0x06` = **777**). It forwarded the
exact bytes to Paper without translation.

| Scenario / exact command | Status and evidence |
| --- | --- |
| `MC_HOST=127.0.0.1 MC_PORT=25577 MC_VERSION=26.3 BOT_COUNT=1 SMOKE_SECONDS=300 TRACE_PACKETS=1 node scripts/paper-263-native-smoke.mjs` | **PASS**: Atlas spawned, moved, stayed 300 seconds, sent 6,017 `tick_end` packets; 228 `map_chunk` packets and many entity packets parsed; no kick, disconnect or parser error. |
| Initial five-bot run using `BOT_COUNT=5 SMOKE_SECONDS=600` | **FAIL** after about 90 seconds: Mason died and respawned, then wrote two position packets before `tick_end`; Paper kicked him for `invalid_player_movement`. Four other bots were still connected. This led to the 26.3-only queued respawn reply fix in Mineflayer draft PR #4194. |
| `MC_HOST=127.0.0.1 MC_PORT=25577 MC_VERSION=26.3 node scripts/paper-263-native-survival.mjs` | **FAIL**: the nearest loaded natural oak log was roughly 38 blocks from spawn; Pathfinder did not reach it within 45 seconds. No log pickup, plank crafting, block placement or chest operation was claimed. |
| `MC_HOST=127.0.0.1 MC_PORT=25577 MC_VERSION=26.3 BOT_COUNT=5 SMOKE_SECONDS=600 node scripts/paper-263-native-smoke.mjs` after respawn fix | **PASS (protocol/movement only)**: Atlas, Flora, Forge, Mason and Blade each advertised 777, spawned, moved and completed the ten-minute interval with zero bot errors. `tick_end` counts were 12,139 / 12,118 / 12,086 / 12,057 / 12,027 respectively; `maxPositionsPerTick=1` for all five. Several natural mob deaths and respawns occurred without a kick. Paper reported five online during the run and zero only after the script's orderly quit at 07:34:38 UTC. No tasks, shared chest or AI coordination were exercised by this smoke. |
| `MC_HOST=127.0.0.1 MC_PORT=25577 MC_VERSION=26.3 npx -y node@22 scripts/paper-263-native-reconnect.mjs` | **PASS**: same offline test identity spawned as client 26.3 twice at `(-1.5, 77, 10.5)` with a controlled quit between attempts; no kick or parser error. The script's timeout cleanup was simplified after this run without changing the connection action. |
| `MC_HOST=127.0.0.1 MC_PORT=25577 MC_VERSION=26.3 npx -y node@22 scripts/paper-263-native-survival.mjs` on a second fresh `minecraft:single_biome_surface` forest world, seed `271828` | **PASS**: SurvivalProbe spawned at `(-9.5,71,0.5)`, pathfound about 22 blocks to natural oak at `(-4,70,-21)`, mined it, inventory rose to one log, crafted four oak planks and placed a plank at `(-2,70,-20)`. The bot's inventory/world readbacks confirmed the actions; Paper console had no error. No OP, `/give`, `/tp`, creative or translator. |
| `MC_HOST=127.0.0.1 MC_PORT=25577 MC_VERSION=26.3 npx -y node@22 scripts/paper-263-native-collectblock.mjs` on forest world, first run | **FAIL / partial**: from ~18 blocks away, target oak at `(-4,69,-21)` was broken and one log appeared in CollectProbe inventory, but `mineflayer-collectblock.collect()` did not resolve within 60 seconds. |
| Same collectblock command, second run | **PASS nearby only**: from ~1.7 blocks away, a second oak at `(-4,68,-21)` was removed; `playerCollect` and `collectBlock_finished` fired, the promise resolved, inventory rose from 1 to 2 logs and world readback showed air. This does not erase the long-range hang above. |
| Two further nearby collectblock runs | **PASS nearby**: the same non-OP identity harvested the remaining logs at `(-4,67,-21)` and `(-4,66,-21)`, increasing its inventory from 2 to 4 logs; both plugin promises completed. |
| `MC_HOST=127.0.0.1 MC_PORT=25577 MC_VERSION=26.3 npx -y node@22 scripts/paper-263-native-chest.mjs` on forest world | **PASS after test-harness correction**: the four naturally harvested logs were crafted into planks; an ordinary crafting table was placed at `(-6,66,-20)` and a chest at `(-2,66,-22)`. The bot opened the chest, deposited one plank, closed/reopened it and observed the stored count rise (2→3), withdrew one, reopened and observed the count return to 2; player inventory also returned to its starting count. Initial attempts had asserted immediately after Mineflayer click promises and falsely failed before asynchronous server window updates; a later server-state probe showed the changes did arrive. The final script verifies via reopen/readback. |

## Acceptance boundary

**PASS:** real native 777 handshake and one-bot login/configuration/spawn,
five-minute connection, basic movement, chunk/entity decoding and tick-end
cadence; five simultaneous bots for ten minutes with movement and natural
respawns but no tasks; a separate forest-world direct-action pathfinding,
log mining/pickup, plank crafting and placing chain. **FAIL/UNRESOLVED:** the
first world's long route to a natural tree, plus reliable long-range
collectblock completion. **NOT TESTED:** five-bot meaningful tasks/shared
storage, and LLM-driven coordination. Real mob damage/death and respawn were
observed in the five-bot run; combat competence was not evaluated. Native
26.3 must not be described as complete survival-compatible until those
actions succeed without OP on an untranslated Paper 26.3 server. The direct
forest-world chain meets the narrow login/move/mine/collect/craft/place native
protocol definition, but does not certify broader swarm functionality.
