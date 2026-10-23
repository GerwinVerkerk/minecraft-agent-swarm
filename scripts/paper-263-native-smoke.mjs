// Byte-observing native protocol smoke. The socket and packets are not altered.
// Run only against a disposable, loopback-bound Paper 26.3 server with no plugins.
import net from "node:net";
import mineflayer from "mineflayer";

const host = process.env.MC_HOST || "127.0.0.1";
const port = Number(process.env.MC_PORT);
const count = Number(process.env.BOT_COUNT || 1);
const seconds = Number(process.env.SMOKE_SECONDS || (count === 1 ? 300 : 600));
if (host !== "127.0.0.1" || !Number.isInteger(port) || port === 25565 || port < 1 || port > 65535 ||
    !Number.isInteger(count) || count < 1 || count > 5 || !Number.isInteger(seconds) || seconds < (count === 5 ? 600 : 300) ||
    process.env.MC_VERSION !== "26.3" ||
    (process.env.MC_PROTOCOL_VERSION && process.env.MC_PROTOCOL_VERSION !== "26.3") ||
    (process.env.MC_VIABACKWARDS && process.env.MC_VIABACKWARDS !== "false")) {
  throw new Error("Native smoke requires MC_VERSION=26.3, loopback non-default Paper port, protocol 26.3, no bridge, 1..5 bots, at least 300 seconds (600 for five bots)");
}

function varint(buffer, offset) {
  let value = 0;
  for (let i = 0; i < 5; i++) {
    const byte = buffer[offset + i];
    if (byte === undefined) throw new Error("Truncated handshake VarInt");
    value |= (byte & 0x7f) << (7 * i);
    if (!(byte & 0x80)) return { value, next: offset + i + 1 };
  }
  throw new Error("Invalid handshake VarInt");
}

const names = ["Atlas", "Flora", "Forge", "Mason", "Blade"];
const bots = [];
const results = [];
let failure = false;
let stopEarly;
const earlyFailure = new Promise((resolve) => { stopEarly = resolve; });
for (let i = 0; i < count; i++) {
  const result = { name: names[i], spawned: false, moved: false, handshakeProtocol: null,
    tickEnd: 0, maxPositionsPerTick: 0, packets: {}, errors: [] };
  results.push(result);
  const bot = mineflayer.createBot({ host, port, username: names[i], version: "26.3", auth: "offline",
    connect(client) {
      client.framer.once("data", (frame) => {
        try {
          const length = varint(frame, 0);
          const id = varint(frame, length.next);
          const protocol = varint(frame, id.next);
          if (id.value !== 0 || protocol.value !== 777 || length.value !== frame.length - length.next) {
            throw new Error(`Unexpected handshake frame: id=${id.value} protocol=${protocol.value}`);
          }
          result.handshakeProtocol = protocol.value;
          console.log(`${result.name}: outgoing wire handshake protocol=${protocol.value} frame=${frame.toString("hex")}`);
        } catch (error) { result.errors.push(error.message); failure = true; stopEarly(); }
      });
      client.setSocket(net.connect(port, host));
    },
  });
  bots.push(bot);
  const originalWrite = bot._client.write.bind(bot._client);
  let positionsThisTick = 0;
  bot._client.write = (name, params) => {
    if (["position", "position_look"].includes(name)) {
      positionsThisTick++;
      result.maxPositionsPerTick = Math.max(result.maxPositionsPerTick, positionsThisTick);
    }
    if (name === "tick_end") { result.tickEnd++; positionsThisTick = 0; }
    if (process.env.TRACE_PACKETS === "1" && ["tick_end", "position", "position_look", "look", "flying", "teleport_confirm"].includes(name) && result.tickEnd < 8) {
      console.log(`${result.name}: outgoing ${name} ${JSON.stringify(params)}`);
    }
    return originalWrite(name, params);
  };
  bot._client.on("packet", (_data, meta) => {
    if (["login", "configuration", "play"].includes(meta.state)) result.packets[meta.name] = (result.packets[meta.name] || 0) + 1;
  });
  bot.once("spawn", () => {
    result.spawned = true;
    const start = bot.entity.position.clone();
    console.log(`${result.name}: spawned at ${start}`);
    void (async () => {
      for (const direction of ["forward", "back", "left", "right"]) {
        if (result.moved) break;
        bot.setControlState(direction, true);
        bot.setControlState("jump", true);
        await new Promise((resolve) => setTimeout(resolve, 4000));
        bot.clearControlStates();
        if (Math.hypot(bot.entity.position.x - start.x, bot.entity.position.z - start.z) > 1) result.moved = true;
      }
    })().catch((error) => { result.errors.push(error.message); failure = true; stopEarly(); });
  });
  bot.on("error", (error) => { result.errors.push(error.message); failure = true; stopEarly(); });
  bot.on("kicked", (reason) => { result.errors.push(`kicked: ${JSON.stringify(reason)}`); failure = true; stopEarly(); });
  bot.on("end", () => {
    if (!result.closing) { result.errors.push("disconnected early"); failure = true; stopEarly(); }
  });
  await new Promise((resolve) => setTimeout(resolve, 1500));
}
await Promise.race([new Promise((resolve) => setTimeout(resolve, seconds * 1000)), earlyFailure]);
for (const [i, bot] of bots.entries()) {
  const result = results[i];
  result.closing = true;
  if (!result.spawned || !result.moved || result.handshakeProtocol !== 777 || result.tickEnd < seconds * 10 || result.maxPositionsPerTick > 1) failure = true;
  console.log(JSON.stringify({ ...result, packetTypes: Object.keys(result.packets).length }));
  bot.quit();
}
process.exitCode = failure ? 1 : 0;
