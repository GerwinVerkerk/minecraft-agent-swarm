import minecraftData from "minecraft-data";
import minecraftProtocol from "minecraft-protocol";
import mineflayer from "mineflayer";

export function parseViaBackwards(value?: string): boolean {
  if (value === undefined || value === "" || value === "false") return false;
  if (value === "true") return true;
  throw new Error("MC_VIABACKWARDS must be unset, false or true.");
}

/** The bot speaks a client protocol, which may differ only in explicit bridge mode. */
export function resolveMinecraftProtocolVersion(
  serverVersion: string,
  protocolVersion?: string,
  viaBackwards = false,
): string {
  const clientVersion = protocolVersion || serverVersion;
  if (serverVersion === "26.3") {
    if (viaBackwards && clientVersion !== "26.1") {
      throw new Error(
        "MC_VIABACKWARDS=true requires MC_PROTOCOL_VERSION=26.1 for the legacy Paper 26.3 bridge.",
      );
    }
    if (!viaBackwards && clientVersion !== "26.3") {
      throw new Error("Native Paper 26.3 requires MC_PROTOCOL_VERSION absent or 26.3 and MC_VIABACKWARDS=false.");
    }
  } else if (protocolVersion && protocolVersion !== serverVersion) {
    throw new Error("MC_PROTOCOL_VERSION may differ from MC_VERSION only for the documented Paper 26.3 bridge.");
  } else if (viaBackwards) {
    throw new Error("MC_VIABACKWARDS=true is only valid for the Paper 26.3 bridge.");
  }

  if (!minecraftProtocol.supportedVersions.includes(clientVersion) || !minecraftData(clientVersion)) {
    throw new Error(
      `Minecraft client protocol ${clientVersion} is unsupported by installed PrismarineJS dependencies.`,
    );
  }
  if (serverVersion === "26.3" && !minecraftData(clientVersion)?.supportFeature("sendsClientTickEndPacket")) {
    throw new Error("The selected client protocol cannot send client_tick_end, required by Paper 26.3.");
  }
  if (serverVersion === "26.3" && !viaBackwards) {
    const data = minecraftData("26.3");
    if (data?.version?.version !== 777 || data?.version?.dataVersion !== 5023 || !data?.protocol ||
        !mineflayer.testedVersions.includes("26.3")) {
      throw new Error("Native Minecraft 26.3 requires Mineflayer support, protocol 777 and data version 5023 with packet schemas.");
    }
  }
  return clientVersion;
}
