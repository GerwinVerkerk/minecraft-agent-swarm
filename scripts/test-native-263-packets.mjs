import assert from "node:assert/strict";
import { test } from "node:test";
import minecraftData from "minecraft-data";
import minecraftProtocol from "minecraft-protocol";

function roundTrip(state, clientToServer, version, name, params) {
  const serializer = minecraftProtocol.createSerializer({ state, isServer: !clientToServer, version });
  const deserializer = minecraftProtocol.createDeserializer({ state, isServer: clientToServer, version });
  const bytes = serializer.createPacketBuffer({ name, params });
  const parsed = deserializer.parsePacketBuffer(bytes);
  assert.equal(parsed.metadata.size, bytes.length);
  if (name === "position") delete parsed.data.params.flags._value;
  assert.deepEqual(parsed.data, { name, params });
  return { bytes, serializer, deserializer };
}

test("26.3 resolves full protocol 777, data 5023 and survival registries", () => {
  const data = minecraftData("26.3");
  assert.equal(data.version.version, 777);
  assert.equal(data.version.dataVersion, 5023);
  for (const block of ["oak_log", "oak_planks", "chest", "crafting_table"]) assert.ok(data.blocksByName[block]);
  for (const item of ["oak_log", "oak_planks", "wooden_pickaxe"]) assert.ok(data.itemsByName[item]);
  assert.ok(data.recipes);
  assert.ok(data.protocol.play.toClient.types.packet_map_chunk);
});

test("26.3 handshake advertises 777 on wire", () => {
  const { bytes } = roundTrip("handshaking", true, "26.3", "set_protocol",
    { protocolVersion: 777, serverHost: "127.0.0.1", serverPort: 25577, nextState: 2 });
  assert.deepEqual([...bytes.subarray(0, 3)], [0, 0x89, 0x06]);
});

test("26.3 teleport confirm carries position and rotation; 1.21.4 stays unchanged", () => {
  roundTrip("play", true, "26.3", "teleport_confirm",
    { teleportId: 5, x: 12.5, y: 64, z: -7.5, yRot: 90, xRot: 20 });
  roundTrip("play", true, "1.21.4", "teleport_confirm", { teleportId: 5 });
});

test("26.3 flat and stepped entity movements round-trip", () => {
  for (const steps of [
    [{ dX: 10, dY: 0, dZ: -20, ticks: 0 }],
    [{ dX: 10, dY: 2, dZ: -20, ticks: 2 }, { dX: 4, dY: 0, dZ: 7, ticks: 3 }],
  ]) {
    const { bytes, deserializer } = roundTrip("play", false, "26.3", "entity_move_look",
      { entityId: 23, move: { onGround: true, steps }, yaw: 4, pitch: -2 });
    assert.throws(() => deserializer.parsePacketBuffer(bytes.subarray(0, bytes.length - 1)), /Read error|Unexpected buffer end/);
  }
});

test("26.3 movement flags round-trip and rejects out-of-range entity deltas", () => {
  roundTrip("play", true, "26.3", "position",
    { x: 2, y: 65, z: -4, flags: { onGround: true, hasHorizontalCollision: false } });
  const serializer = minecraftProtocol.createSerializer({ state: "play", isServer: true, version: "26.3" });
  assert.throws(() => serializer.createPacketBuffer({ name: "entity_move_look", params: {
    entityId: 1, move: { onGround: true, steps: [{ dX: 40000, dY: 0, dZ: 0, ticks: 0 }] }, yaw: 0, pitch: 0,
  } }), /out of range/);
});
