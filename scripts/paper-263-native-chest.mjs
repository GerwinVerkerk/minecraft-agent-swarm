// Non-OP crafting-table/chest/storage test using previously harvested natural logs.
import assert from "node:assert/strict";
import mineflayer from "mineflayer";
import vec3 from "vec3";

const { Vec3 } = vec3;
const host = process.env.MC_HOST;
const port = Number(process.env.MC_PORT);
if (host !== "127.0.0.1" || !Number.isInteger(port) || port === 25565 || port < 1 || port > 65535 ||
    process.env.MC_VERSION !== "26.3" || process.env.MC_VIABACKWARDS === "true") {
  throw new Error("Chest test requires native 26.3 on a non-default loopback Paper port");
}
const bot = mineflayer.createBot({ host, port, username: "CollectProbe", version: "26.3", auth: "offline" });
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const count = (name) => bot.inventory.items().filter((item) => item.name === name).reduce((sum, item) => sum + item.count, 0);
async function waitForItem(name) {
  for (let attempt = 0; attempt < 30; attempt++) {
    if (count(name)) return;
    await pause(100);
  }
  throw new Error(`${name} did not appear in inventory after crafting`);
}
async function place(name) {
  await waitForItem(name);
  await bot.equip(bot.inventory.items().find((item) => item.name === name), "hand");
  const foot = bot.entity.position.floored();
  const offsets = [];
  for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
    if (Math.hypot(dx, dz) >= 1.5 && Math.hypot(dx, dz) <= 3.5) offsets.push([dx, dz]);
  }
  offsets.sort((a, b) => a[0] ** 2 + a[1] ** 2 - b[0] ** 2 - b[1] ** 2);
  for (const [dx, dz] of offsets) {
    const support = bot.blockAt(foot.offset(dx, -1, dz));
    const target = support?.position.offset(0, 1, 0);
    if (!support || support.boundingBox !== "block" || !target || bot.blockAt(target)?.name !== "air") continue;
    try {
      await bot.placeBlock(support, new Vec3(0, 1, 0));
      await pause(250);
      if (bot.blockAt(target)?.name === name) return bot.blockAt(target);
    } catch (error) { console.log("placement candidate", target.toString(), error.message); }
  }
  throw new Error(`no valid nearby placement for ${name}`);
}
let timer;
try {
  await Promise.race([new Promise((resolve, reject) => {
    bot.once("spawn", resolve);
    bot.once("error", reject);
    bot.once("kicked", (reason) => reject(new Error(`kicked: ${JSON.stringify(reason)}`)));
  }), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("spawn timeout")), 30000); })]);
  clearTimeout(timer);
  await pause(2500);
  const items = bot.registry.itemsByName;
  const existingChest = bot.findBlock({ matching: bot.registry.blocksByName.chest.id, maxDistance: 8 });
  const existingTable = bot.findBlock({ matching: bot.registry.blocksByName.crafting_table.id, maxDistance: 8 });
  const requiredPlanks = existingChest || count("chest") ? 1 : (count("crafting_table") || existingTable ? 9 : 13);
  assert.ok(count("oak_planks") + 4 * count("oak_log") >= requiredPlanks, "not enough natural wood for table, chest and deposit");
  console.log("spawn", bot.entity.position.toString(), "oak_log", count("oak_log"), "oak_planks", count("oak_planks"), "crafting_table", count("crafting_table"), "chest", count("chest"));
  while (count("oak_planks") < requiredPlanks && count("oak_log") > 0) {
    const plankRecipe = bot.recipesFor(items.oak_planks.id, null, 1, null)[0];
    assert.ok(plankRecipe, "oak plank recipe missing");
    await bot.craft(plankRecipe, 1, null);
    await pause(500);
    console.log("craft step", "oak_log", count("oak_log"), "oak_planks", count("oak_planks"));
  }
  assert.ok(count("oak_planks") >= requiredPlanks, "wood did not yield enough planks");
  console.log("crafted planks", count("oak_planks"));
  let chestBlock = existingChest;
  if (!chestBlock) {
    let table = existingTable;
    if (!table && !count("crafting_table")) {
      const tableRecipe = bot.recipesFor(items.crafting_table.id, null, 1, null)[0];
      assert.ok(tableRecipe, "crafting table recipe missing");
      await bot.craft(tableRecipe, 1, null);
      await waitForItem("crafting_table");
    }
    if (!table) table = await place("crafting_table");
    console.log("table", table.position.toString());
    if (!count("chest")) {
      const chestRecipe = bot.recipesFor(items.chest.id, null, 1, table)[0];
      assert.ok(chestRecipe, "chest recipe missing with ordinary crafting table");
      await bot.craft(chestRecipe, 1, table);
      await waitForItem("chest");
    }
    chestBlock = await place("chest");
  }
  console.log("chest", chestBlock.position.toString());
  assert.ok(count("oak_planks") >= 1, "no remaining plank to deposit");
  const chest = await bot.openContainer(chestBlock);
  const before = count("oak_planks");
  const beforeStored = chest.containerItems().filter((item) => item.name === "oak_planks").reduce((sum, item) => sum + item.count, 0);
  await chest.deposit(items.oak_planks.id, null, 1);
  await pause(1000); // click promises can resolve before server window updates arrive
  chest.close();
  await pause(300);
  const reopened = await bot.openContainer(bot.blockAt(chestBlock.position));
  const deposited = reopened.containerItems().filter((item) => item.name === "oak_planks").reduce((sum, item) => sum + item.count, 0);
  assert.equal(deposited, beforeStored + 1, "chest deposit not retained after reopen");
  assert.equal(count("oak_planks"), before - 1, "deposit did not change player inventory");
  console.log("deposited plank; reopened chest count", deposited);
  await reopened.withdraw(items.oak_planks.id, null, 1);
  await pause(1000);
  reopened.close();
  await pause(300);
  const finalOpen = await bot.openContainer(bot.blockAt(chestBlock.position));
  const finalStored = finalOpen.containerItems().filter((item) => item.name === "oak_planks").reduce((sum, item) => sum + item.count, 0);
  assert.equal(finalStored, beforeStored, "withdraw not retained after reopen");
  assert.equal(count("oak_planks"), before, "withdraw did not restore player inventory");
  finalOpen.close();
  console.log("PASS native non-OP crafting table, chest, deposit, reopen and withdraw");
} catch (error) {
  console.error("FAIL chest", error.stack);
  console.error("inventory", bot.inventory?.items().map((item) => `${item.name}:${item.count}`));
  process.exitCode = 1;
} finally {
  clearTimeout(timer);
  bot.quit();
}
