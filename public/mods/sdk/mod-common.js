import * as sdk from "./mod-sdk.js";

export const ModCommon = Object.freeze({
  ...sdk,
  ModSDK: sdk.ModSDK,
  version: sdk.ModSDK?.version || "1.1.0",
});

if (typeof window !== "undefined") {
  window.ModCommon = ModCommon;
  window.ModSDK = sdk.ModSDK || ModCommon;
}

export * from "./mod-sdk.js";
