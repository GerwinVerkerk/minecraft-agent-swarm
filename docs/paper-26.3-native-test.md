# Native Paper 26.3 / protocol 777 test (Ubuntu or WSL2)

This branch is **experimental**. Its native path uses no ViaVersion,
ViaBackwards or protocol translation. PR #35's 26.1 bridge remains a separate
optional fallback. Never point these commands at an existing server or world.

## Temporary dependency stack

The lockfile pins the exact artifacts; run `npm ci`, not `npm update`.

| Package | Source snapshot | State / replacement |
| --- | --- | --- |
| `minecraft-data` | `PrismarineJS/minecraft-data` PR #1301 `924e26d` (includes #1300), packaged through `GerwinVerkerk/node-minecraft-data` `c4d5a65` with generated types; release SHA256 `46c8b956c81908706df9b50dedfa163ea84c644b5ace43276c29f1a821a9f142` | Open; replace with official `minecraft-data` npm release |
| `minecraft-protocol` | `PrismarineJS/node-minecraft-protocol` PR #1538 `a1a33809` (includes #1532) | Open; replace with official release |
| `mineflayer` | `GerwinVerkerk/mineflayer` `fbf668d1` based on upstream master plus focused 26.3 PR commits and a 26.3 teleport/respawn-tick fix (draft upstream PR #4194) | Temporary fork; replace after upstream patches merge |
| `prismarine-chunk` | `PrismarineJS/prismarine-chunk` PR #334 `7382b4fe` | Open; replace with official release |
| `prismarine-physics` | `PrismarineJS/prismarine-physics` PR #145 `b9286386` | Open; replace with official release |

These are PrismarineJS components or a fork thereof (`minecraft-protocol` is
BSD-3-Clause; the other pinned packages are MIT). Neither a
protocol-version string nor a successful login proves complete gameplay.

## Install in an existing WSL2 checkout

Use Node.js 22 and Java 25. The default Python combat policy uses only Python
standard-library modules; Python 3.14 is not required for this protocol test.
Optional VPT/MineStudio/PyTorch compatibility with Python 3.14 is unqualified.

```bash
cd ~/minecraft-agent-swarm-263
git remote add gerwin https://github.com/GerwinVerkerk/minecraft-agent-swarm.git 2>/dev/null || true
git fetch gerwin feature/native-minecraft-26.3
git switch -c feature/native-minecraft-26.3 --track gerwin/feature/native-minecraft-26.3
node --version                 # use v22.x
java -version                  # use 25.x
python3 --version
npm ci
npm run typecheck
npm run build
npm run lint
npm test
npm run test:native-packets
```

If the local branch already exists, use `git switch feature/native-minecraft-26.3`
and `git pull --ff-only gerwin feature/native-minecraft-26.3`; do not overwrite
local changes. A fresh checkout can use `git clone --branch
feature/native-minecraft-26.3 https://github.com/GerwinVerkerk/minecraft-agent-swarm.git`.

## Disposable unmodified Paper server

Create a fresh server under this checkout, **not** in your production server
directory. The official Paper 26.3 build 214 JAR below is SHA256-pinned. The
server binds only to `127.0.0.1`, has an empty plugins directory and uses a
fresh world. Offline-mode names are safe only under this loopback restriction.

```bash
mkdir -p local-paper-263-native/plugins
curl -fL https://fill-data.papermc.io/v1/objects/a9dad541bf083d5a5f0b65b6a6a98263c55344f22f254c31628b528cf22b9423/paper-26.3-214.jar -o local-paper-263-native/paper.jar
echo 'a9dad541bf083d5a5f0b65b6a6a98263c55344f22f254c31628b528cf22b9423  local-paper-263-native/paper.jar' | sha256sum -c -
printf 'server-ip=127.0.0.1\nserver-port=25577\nonline-mode=false\nenforce-secure-profile=false\nmax-players=5\nspawn-protection=0\nlevel-name=native-test-world\n' > local-paper-263-native/server.properties
```

Read and accept Minecraft's EULA yourself, then write `eula=true` to
`local-paper-263-native/eula.txt`. Start the server in a second terminal:

```bash
cd ~/minecraft-agent-swarm-263/local-paper-263-native
java -Xms512M -Xmx2G -jar paper.jar --nogui
```

Wait for `Done` and verify that the console says `Paper 26.3` and `0 plugins`.
Stop it with `stop` in its console when finished.

## Native tests

From the repository root, first test one bot for five minutes, then five for
ten minutes. The script observes the **outgoing framed handshake bytes**,
checks protocol 777, counts one `tick_end` per tick, detects duplicate
position-bearing packets in a tick, records chunk/entity packets and fails on
disconnect or no movement. Its socket observer does not translate or change
traffic. The five names are Atlas, Flora, Forge, Mason and Blade. These are
protocol/movement tests, **not** evidence of AI cooperation or survival work.

```bash
MC_HOST=127.0.0.1 MC_PORT=25577 MC_VERSION=26.3 BOT_COUNT=1 SMOKE_SECONDS=300 node scripts/paper-263-native-smoke.mjs
MC_HOST=127.0.0.1 MC_PORT=25577 MC_VERSION=26.3 BOT_COUNT=5 SMOKE_SECONDS=600 node scripts/paper-263-native-smoke.mjs
MC_HOST=127.0.0.1 MC_PORT=25577 MC_VERSION=26.3 node scripts/paper-263-native-reconnect.mjs
```

For a separate non-OP **direct-action** survival check (not AI behavior), run
`MC_HOST=127.0.0.1 MC_PORT=25577 MC_VERSION=26.3 node
scripts/paper-263-native-survival.mjs` while the five-bot run is stopped.
It attempts a natural oak log, ordinary pathfinding/dig/pickup, plank crafting
and placement, and fails clearly if any step cannot be proven. It does not
magically provision a tree or inventory. On a difficult terrain seed, choose
a different loaded oak log using `TARGET_LOG_INDEX=1` (or another index shown
by the probe); report each attempted route and result, rather than claiming
success from a skipped action. The first random test world in the validation
record had no reachable oak within the route budget. To reproduce the
**successful controlled forest-world** direct-action test without modifying
that world's data, stop Paper, switch only the disposable server's world
settings, and restart it:

```bash
python3 - <<'PY'
from pathlib import Path
p = Path('local-paper-263-native/server.properties')
settings = {
    'level-name': 'native-forest-world',
    'level-seed': '271828',
    'level-type': 'minecraft:single_biome_surface',
    'generator-settings': '{"biome":"minecraft:forest"}',
}
lines = p.read_text().splitlines()
updated = []
for line in lines:
    key, sep, value = line.partition('=')
    updated.append(key + '=' + settings[key] if sep and key in settings else line)
p.write_text('\n'.join(updated) + '\n')
PY
cd local-paper-263-native
java -Xms512M -Xmx2G -jar paper.jar --nogui
```

Use another terminal at the repository root to run the survival scripts. The
first world remains on disk under its previous level name. For the separate
collectblock plugin path and
ordinary chest construction/storage path, use the same disposable forest world
and run these only after gathering enough natural logs:

```bash
MC_HOST=127.0.0.1 MC_PORT=25577 MC_VERSION=26.3 node scripts/paper-263-native-collectblock.mjs
MC_HOST=127.0.0.1 MC_PORT=25577 MC_VERSION=26.3 node scripts/paper-263-native-chest.mjs
```

The chest test uses `CollectProbe`'s previously harvested wood and can resume
after a partial run; it does not inject wood. See the results record for the
distance-sensitive collectblock hang and server-confirmed storage readbacks.
Autonomous cooperation still needs a separate working AI backend.

For an autonomous test, create a private `.env` (never commit it) from
`.env.example`, change only the isolated server/LLM settings, and use:

```env
MC_HOST=127.0.0.1
MC_PORT=25577
MC_VERSION=26.3
MC_AUTH=offline
ALLOW_INTERVENTIONS=false
GENERATED_SKILLS_ENABLED=false
ENABLE_MULTI_BOT=false
BOT_COUNT=1
```

Leave `MC_PROTOCOL_VERSION` and `MC_VIABACKWARDS` unset. The server has no
translator. Do not grant OP, creative, `/give`, `/tp`, or world-altering gamerules.
The original author's stash/farm/tree sites are far from most fresh spawns;
set `SWARM_STASH_POS`, `SWARM_FARM_SITE`, and `SWARM_TREE_FARM` to surveyed,
reachable `x,y,z` locations in your **test** world before expecting the full
swarm to build shared infrastructure. The example values in `.env.example`
are syntax only, not verified sites. No materials or chests are spawned by
these overrides.
With a working LLM backend, run `npm start`; only then evaluate autonomous
mining, crafting, placing, chest use and collaboration. For five bots, stop the
one-bot process, change `ENABLE_MULTI_BOT=true` and `BOT_COUNT=5`, and restart.
Keep Mission Control/viewer/overlay accessible only from the test host: they
are not authenticated services.

Check the Paper console and bot logs for kicks, `invalid_player_movement`,
`PartialReadError`, registry failures and reconnects. Distinguish direct
protocol/action tests from actual LLM-driven behavior. `npm audit --omit=dev`
still reports high-severity transitive findings; do not expose this checkout's
web dashboards to an untrusted network.
