import * as sdk from "./mod-sdk.js";

export const ModCommon = Object.freeze({
  ...sdk,
  ModSDK: sdk.ModSDK,
  version: sdk.ModSDK?.version || "1.2.0",
});

if (typeof window !== "undefined") {
  window.ModCommon = ModCommon;
  window.ModSDK = ModCommon;
  window.ModSDKInfo = sdk.ModSDK;
}

export * from "./mod-sdk.js";
