// Adds the iOS 18 dark and tinted app icons to the Xcode asset catalog (run after `npm run assets`).
const fs = require("fs"), path = require("path");
const dir = path.join(__dirname, "../ios/App/App/Assets.xcassets/AppIcon.appiconset");
fs.copyFileSync(path.join(__dirname, "../assets/icon-dark.png"), path.join(dir, "AppIcon-dark.png"));
fs.copyFileSync(path.join(__dirname, "../assets/icon-tinted.png"), path.join(dir, "AppIcon-tinted.png"));
const base = { idiom: "universal", platform: "ios", size: "1024x1024" };
fs.writeFileSync(path.join(dir, "Contents.json"), JSON.stringify({ images: [
  { ...base, filename: "AppIcon-512@2x.png" },
  { ...base, filename: "AppIcon-dark.png", appearances: [{ appearance: "luminosity", value: "dark" }] },
  { ...base, filename: "AppIcon-tinted.png", appearances: [{ appearance: "luminosity", value: "tinted" }] }
], info: { author: "xcode", version: 1 } }, null, 2) + "\n");
console.log("iOS dark and tinted icons added");
