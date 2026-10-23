import assert from "node:assert/strict";
import { test } from "node:test";
import { parseViaBackwards, resolveMinecraftProtocolVersion } from "./minecraft-compat.js";

test("retains the previously configured native 1.21.4 protocol", () => {
  assert.equal(resolveMinecraftProtocolVersion("1.21.4"), "1.21.4");
});

test("Paper 26.3 defaults to native protocol 777", () => {
  assert.equal(resolveMinecraftProtocolVersion("26.3"), "26.3");
  assert.equal(resolveMinecraftProtocolVersion("26.3", "26.3", false), "26.3");
  assert.throws(() => resolveMinecraftProtocolVersion("26.3", "26.1"), /Native Paper 26.3/);
  assert.throws(() => resolveMinecraftProtocolVersion("26.3", "26.3", true), /requires MC_PROTOCOL_VERSION=26.1/);
});

test("retains the explicit 26.1 ViaBackwards bridge", () => {
  assert.throws(() => resolveMinecraftProtocolVersion("26.3", "26.1"), /MC_VIABACKWARDS=false/);
  assert.equal(resolveMinecraftProtocolVersion("26.3", "26.1", true), "26.1");
});

test("rejects unsupported native versions and undocumented protocol mismatches", () => {
  assert.throws(() => resolveMinecraftProtocolVersion("26.4"), /unsupported/);
  assert.throws(() => resolveMinecraftProtocolVersion("1.21.4", "26.1", true), /may differ/);
  assert.throws(() => resolveMinecraftProtocolVersion("1.21.4", undefined, true), /only valid/);
});

test("bridge flag accepts only explicit boolean text", () => {
  assert.equal(parseViaBackwards(undefined), false);
  assert.equal(parseViaBackwards("false"), false);
  assert.equal(parseViaBackwards("true"), true);
  assert.throws(() => parseViaBackwards("yes"), /MC_VIABACKWARDS/);
});
