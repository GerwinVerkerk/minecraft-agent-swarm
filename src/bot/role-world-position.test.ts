import assert from "node:assert/strict";
import { test } from "node:test";
import { worldPosition } from "./role.js";

test("fresh-world site overrides preserve old defaults and validate coordinates", () => {
  const original = { x: 286, y: 70, z: -314 };
  assert.deepEqual(worldPosition(undefined, original, "SWARM_STASH_POS"), original);
  assert.deepEqual(worldPosition(" 10, 72, -8 ", original, "SWARM_STASH_POS"), { x: 10, y: 72, z: -8 });
  assert.throws(() => worldPosition("10,NaN,-8", original, "SWARM_STASH_POS"), /SWARM_STASH_POS/);
  assert.throws(() => worldPosition("10,72", original, "SWARM_STASH_POS"), /three integer/);
  assert.throws(() => worldPosition("10,,3", original, "SWARM_STASH_POS"), /three integer/);
});
