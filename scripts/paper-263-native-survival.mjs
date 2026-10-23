// Non-OP direct-action acceptance test on a disposable loopback Paper world.
// Tests the bot's ordinary pathfinder, dig, pickup, craft and place APIs.
import assert from "node:assert/strict";
import mineflayer from "mineflayer";
import pathfinderModule from "mineflayer-pathfinder";
import vec3 from "vec3";

const { pathfinder, Movements, goals } = pathfinderModule;
const { Vec3 } = vec3;
const host = process.env.MC_HOST;
const port = Number(process.env.MC_PORT);
if (host !== "127.0.0.1" || !Number.isInteger(port) || port === 25565 || port < 1 || port > 65535 ||
    process.env.MC_VERSION !== "26.3" || process.env.MC_VIABACKWARDS === "true") {
  throw new Error("Survival test requires native 26.3 and a non-default loopback test port");
}

const bot = mineflayer.createBot({ host, port, username: "SurvivalProbe", version: "26.3", auth: "offline" });
bot.loadPlugin(pathfinder);
let kicked;
bot.on("kicked", (reason) => { kicked = reason; console.error("KICK", JSON.stringify(reason)); });
bot.on("error", (error) => console.error("ERROR", error.message));
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const bounded = async (name, operation, ms = 60000) => {
  let timer;
  try {
    return await Promise.race([operation, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${name} timed out`)), ms);
    })]);
  } finally { clearTimeout(timer); }
};
const itemCount = (name) => bot.inventory.items().filter((item) => item.name === name).reduce((n, item) => n + item.count, 0);

try {
  await bounded("spawn", new Promise((resolve) => bot.once("spawn", resolve)), 30000);
  await pause(3000);
  console.log("spawn", bot.entity.position.toString(), "health", bot.health, "food", bot.food);
  const movements = new Movements(bot);
  bot.pathfinder.setMovements(movements);
  const logs = bot.findBlocks({ matching: (block) => block.name === "oak_log", maxDistance: 64, count: 25 });
  assert.ok(logs.length, "no loaded oak log within 64 blocks");
  console.log("oak log candidates", logs.map((position, candidate) => ({ candidate, position: position.toString() })));
  const index = Number(process.env.TARGET_LOG_INDEX || 0);
  assert.ok(Number.isInteger(index) && index >= 0 && index < logs.length, "invalid TARGET_LOG_INDEX");
  const pos = logs[index];
  console.log("target", pos.toString(), "distance", bot.entity.position.distanceTo(pos));
  await bounded("pathfinding to log", bot.pathfinder.goto(new goals.GoalNear(pos.x, pos.y, pos.z, 2)), 45000);
  assert.ok(bot.entity.position.distanceTo(pos) < 5, "pathfinder did not reach log");
  await bounded("dig log", bot.dig(bot.blockAt(pos)), 20000);
  assert.notEqual(bot.blockAt(pos)?.name, "oak_log", "log still in world after dig");
  console.log("mined", pos.toString(), "at", bot.entity.position.toString());
  await bounded("pickup", (async () => {
    while (!itemCount("oak_log")) {
      const drop = Object.values(bot.entities).find((entity) => entity.name === "item" && entity.position.distanceTo(bot.entity.position) < 8);
      if (drop) await bot.pathfinder.goto(new goals.GoalNear(drop.position.x, drop.position.y, drop.position.z, 1));
      await pause(400);
    }
  })(), 30000);
  console.log("pickup oak_log", itemCount("oak_log"));
  const plankId = bot.registry.itemsByName.oak_planks.id;
  const recipes = bot.recipesFor(plankId, null, 1, null);
  assert.ok(recipes.length, "no oak plank recipe after pickup");
  await bounded("craft planks", bot.craft(recipes[0], 1, null), 15000);
  assert.ok(itemCount("oak_planks") >= 4, "planks missing after crafting");
  console.log("crafted oak_planks", itemCount("oak_planks"));
  const plank = bot.inventory.items().find((item) => item.name === "oak_planks");
  await bot.equip(plank, "hand");
  const foot = bot.entity.position.floored();
  let placed = false;
  for (const [dx, dz] of [[2,0],[-2,0],[0,2],[0,-2],[1,1],[-1,-1]]) {
    const support = bot.blockAt(foot.offset(dx, -1, dz));
    const above = support && bot.blockAt(support.position.offset(0, 1, 0));
    if (!support || support.boundingBox !== "block" || !above || above.name !== "air") continue;
    try {
      await bounded("place plank", bot.placeBlock(support, new Vec3(0, 1, 0)), 10000);
      await pause(300);
      assert.equal(bot.blockAt(support.position.offset(0, 1, 0))?.name, "oak_planks");
      console.log("placed oak_planks", support.position.offset(0, 1, 0).toString());
      placed = true;
      break;
    } catch (error) { console.log("placement candidate failed", error.message); }
  }
  assert.ok(placed, "no valid nearby survival placement");
  assert.equal(kicked, undefined, "bot kicked during survival actions");
  console.log("PASS native non-OP pathfinding, mining, pickup, crafting, placing");
} catch (error) {
  console.error("FAIL", error.stack);
  process.exitCode = 1;
} finally {
  bot.pathfinder.stop();
  bot.quit();
}
