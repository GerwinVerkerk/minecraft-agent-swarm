import assert from "node:assert/strict";
import mineflayer from "mineflayer";

const host = process.env.MC_HOST;
const port = Number(process.env.MC_PORT);
if (host !== "127.0.0.1" || !Number.isInteger(port) || port === 25565 || port < 1 || port > 65535 ||
    process.env.MC_VERSION !== "26.3" || process.env.MC_VIABACKWARDS === "true") {
  throw new Error("Reconnect test requires native 26.3 on a non-default loopback Paper port");
}

async function withTimeout(promise, ms, label) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    })]);
  } finally { clearTimeout(timer); }
}

for (let attempt = 1; attempt <= 2; attempt++) {
  const bot = mineflayer.createBot({ host, port, username: "ReconnectProbe", version: "26.3", auth: "offline" });
  const result = await withTimeout(
    new Promise((resolve, reject) => {
      bot.once("spawn", () => resolve({ version: bot.version, position: bot.entity.position.toString() }));
      bot.once("error", reject);
      bot.once("kicked", (reason) => reject(new Error(`kicked: ${JSON.stringify(reason)}`)));
    }), 30000, "spawn");
  assert.equal(result.version, "26.3");
  console.log(`attempt ${attempt}: spawned ${JSON.stringify(result)}`);
  await new Promise((resolve) => setTimeout(resolve, 5000));
  const ended = new Promise((resolve) => bot.once("end", resolve));
  bot.quit();
  await withTimeout(ended, 10000, "quit");
}
console.log("PASS controlled native 26.3 disconnect and reconnect");
