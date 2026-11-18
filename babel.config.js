const fs = require("fs");
const path = require("path");

// This config doubles as the entry point for a monorepo setup where the repo
// sits two levels below a MediaPipe library (src/index.ts) that JS code can
// import by the root package's name. When cloned standalone (no monorepo
// root above), that library isn't present, so skip the alias instead of
// crashing Metro on a missing require.
const mediapipeRoot = path.join(__dirname, "../..");
const mediapipePkgPath = path.join(mediapipeRoot, "package.json");
const mediapipeEntry = path.join(mediapipeRoot, "src/index.ts");
const hasMediapipeLib = fs.existsSync(mediapipePkgPath) && fs.existsSync(mediapipeEntry);

const plugins = [
  ["react-native-worklets-core/plugin"],
];

if (hasMediapipeLib) {
  const pak = require(mediapipePkgPath);
  plugins.push([
    "module-resolver",
    {
      extensions: [".tsx", ".ts", ".js", ".json"],
      alias: {
        [pak.name]: mediapipeEntry,
      },
    },
  ]);
}

plugins.push("react-native-reanimated/plugin");

// Strip console.* calls from RELEASE builds only — dev/debug builds keep them
// for actual debugging. Several hot loops (GPS watcher firing every 2-5s,
// the camera/liveness polling loop firing every ~120ms) log on every tick;
// individually cheap, but constant overhead in exactly the code paths users
// complained feel laggy. process.env.NODE_ENV is 'production' for a release
// bundle (react-native bundle --dev false), so this only ever removes logs
// from what actually ships.
module.exports = function (api) {
  const isProduction = api.env('production') || process.env.NODE_ENV === 'production';
  return {
    presets: ["module:@react-native/babel-preset"],
    plugins: isProduction
      ? [...plugins, ["transform-remove-console", { exclude: ["error", "warn"] }]]
      : plugins,
  };
};
