// Separate plugin-path acceptance, distinct from the direct-action survival test.
import assert from "node:assert/strict";
import mineflayer from "mineflayer";
import collectblock from "mineflayer-collectblock";

const host = process.env.MC_HOST;
const port = Number(process.env.MC_PORT);
if (host !== "127.0.0.1" || !Number.isInteger(port) || port === 25565 || port < 1 || port > 65535 ||
    process.env.MC_VERSION !== "26.3" || process.env.MC_VIABACKWARDS === "true") {
  throw new Error("Collectblock test requires native 26.3 on a non-default loopback Paper port");
}
const bot = mineflayer.createBot({ host, port, username: "CollectProbe", version: "26.3", auth: "offline" });
bot.loadPlugin(collectblock.plugin);
bot.on("collectBlock_finished", () => console.log("event collectBlock_finished"));
bot.on("playerCollect", (_collector, item) => console.log("event playerCollect", item?.id));
let timeout;
try {
  await Promise.race([new Promise((resolve, reject) => {
    bot.once("spawn", resolve);
    bot.once("error", reject);
    bot.once("kicked", (reason) => reject(new Error(`kicked: ${JSON.stringify(reason)}`)));
  }), new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error("spawn timed out")), 30000); })]);
  clearTimeout(timeout);
  await new Promise((resolve) => setTimeout(resolve, 2500));
  const block = bot.findBlock({ matching: (candidate) => candidate.name === "oak_log", maxDistance: 48 });
  assert.ok(block, "no loaded oak log within 48 blocks");
  const before = bot.inventory.items().filter((item) => item.name === "oak_log").reduce((count, item) => count + item.count, 0);
  console.log("target", block.position.toString(), "distance", bot.entity.position.distanceTo(block.position));
  await Promise.race([bot.collectBlock.collect(block), new Promise((_, reject) => {
    timeout = setTimeout(() => reject(new Error("collectblock timed out")), 60000);
  })]);
  clearTimeout(timeout);
  const after = bot.inventory.items().filter((item) => item.name === "oak_log").reduce((count, item) => count + item.count, 0);
  assert.ok(after > before, `oak log inventory did not increase: ${before} -> ${after}`);
  assert.notEqual(bot.blockAt(block.position)?.name, "oak_log", "target log remains in world");
  console.log(`PASS collectblock: oak_log ${before} -> ${after}, world block removed`);
} catch (error) {
  console.error("FAIL collectblock", error.stack);
  console.error("diagnostic", JSON.stringify({
    position: bot.entity?.position?.toString(),
    inventory: bot.inventory?.items().map((item) => `${item.name}:${item.count}`),
    targets: bot.collectBlock?.targets?.targets.map((target) => ({ type: target.constructor.name, position: target.position.toString(), valid: target.isValid })),
    goal: bot.pathfinder?.goal?.constructor?.name,
  }));
  process.exitCode = 1;
} finally {
  clearTimeout(timeout);
  await bot.collectBlock?.cancelTask().catch(() => {});
  bot.quit();
}
