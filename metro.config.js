const { getDefaultConfig } = require("@react-native/metro-config");
const fs = require("fs");
const path = require("path");

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * Keep this project on the default resolver behavior so dependencies can be
 * resolved from the app and its parent `node_modules` folders.
 *
 * @type {import('metro-config').MetroConfig}
 */
// Start from Metro defaults, then overwrite the parts that affect filesystem watchers.
// Using `mergeConfig` can end up concatenating watchFolders, which triggers the Windows
// `metro-file-map` watch-mode crash.
const defaultConfig = getDefaultConfig(__dirname);

const hoistedNodeModules = path.resolve(__dirname, "../../node_modules");

const existingWatchFolders = [
  path.resolve(__dirname, "../../src"),
  hoistedNodeModules,
].filter(p => fs.existsSync(p));

defaultConfig.watchFolders = existingWatchFolders;

defaultConfig.watcher = {
  watchman: false,
};

const localNodeModules = path.resolve(__dirname, "node_modules");
const nodeResolvePaths = [localNodeModules, hoistedNodeModules];

/**
 * Monorepo root (../../node_modules) may ship older React / RN for other packages.
 * If Metro mixes those with this app's React 19 + RN 0.84, hooks break:
 * "Cannot read property 'useRef' of null" (two Reacts in one bundle).
 */
function packageDir(name) {
  const local = path.join(localNodeModules, name);
  if (fs.existsSync(path.join(local, "package.json"))) {
    return local;
  }
  return path.join(hoistedNodeModules, name);
}

/**
 * Resolve a package using ONLY the app's node_modules (never ../../node_modules).
 * Required when dependencies live under D:/llatest/node_modules: hierarchical
 * resolution from there loads React 18 while this app uses React 19 → hooks crash.
 */
function resolveFromAppNodeModules(moduleName) {
  return require.resolve(moduleName, { paths: [localNodeModules] });
}

defaultConfig.resolver = {
  ...(defaultConfig.resolver || {}),
  // Bundle TensorFlow Lite models (the on-device anti-spoof / PAD model) as
  // assets so `require('../assets/antispoof.tflite')` resolves for
  // react-native-fast-tflite. Without this, Metro treats .tflite as source and
  // the require throws at bundle time.
  assetExts: [...(defaultConfig.resolver?.assetExts || []), "tflite"],
  // Dependencies are installed at D:/llatest/node_modules in this workspace.
  nodeModulesPaths: [localNodeModules, hoistedNodeModules],
  extraNodeModules: {
    react: packageDir("react"),
    "react-native": packageDir("react-native"),
    scheduler: packageDir("scheduler"),
  },
  /**
   * Metro sometimes fails to resolve hoisted deps on Windows even when
   * nodeModulesPaths is set. Node's resolver agrees with the same paths.
   */
  resolveRequest(context, moduleName, platform) {
    if (
      path.isAbsolute(moduleName) ||
      moduleName.startsWith(".") ||
      moduleName.startsWith("..")
    ) {
      return context.resolveRequest(context, moduleName, platform);
    }

    // Pin React / RN stack to this app's versions before default resolution (see header comment).
    const pinExact = new Set([
      "react",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "scheduler",
      "react-native",
    ]);
    const pinReactSubpath =
      moduleName.startsWith("react/") && !moduleName.startsWith("react-native");
    if (pinExact.has(moduleName) || pinReactSubpath) {
      try {
        const filePath = resolveFromAppNodeModules(moduleName);
        return { type: "sourceFile", filePath };
      } catch {
        /* fall through to Metro default */
      }
    }

    // Navigation + safe area: must match one install (avoid hoisted copies fighting app).
    if (moduleName.startsWith("@react-navigation/")) {
      try {
        return {
          type: "sourceFile",
          filePath: resolveFromAppNodeModules(moduleName),
        };
      } catch {
        /* fall through */
      }
    }
    if (
      moduleName === "react-native-safe-area-context" ||
      moduleName.startsWith("react-native-safe-area-context/")
    ) {
      try {
        return {
          type: "sourceFile",
          filePath: resolveFromAppNodeModules(moduleName),
        };
      } catch {
        /* fall through */
      }
    }
    if (
      moduleName === "react-native-screens" ||
      moduleName.startsWith("react-native-screens/")
    ) {
      try {
        return {
          type: "sourceFile",
          filePath: resolveFromAppNodeModules(moduleName),
        };
      } catch {
        /* fall through */
      }
    }

    try {
      return context.resolveRequest(context, moduleName, platform);
    } catch (e) {
      try {
        const filePath = require.resolve(moduleName, {
          paths: nodeResolvePaths,
        });
        return { type: "sourceFile", filePath };
      } catch {
        throw e;
      }
    }
  },
};

module.exports = defaultConfig;
