#!/usr/bin/env node
/**
 * sync-hoisted-deps.js
 *
 * This package is a member of an npm workspace, so most dependencies are
 * "hoisted" up to the monorepo-root node_modules. React Native's Android
 * build (settings.gradle / the react gradle plugin) resolves packages via the
 * project-LOCAL node_modules using relative paths like
 * `../node_modules/react-native`. When deps are hoisted, those local paths are
 * empty and Gradle fails with errors such as:
 *   - Included build '.../node_modules/@react-native/gradle-plugin' does not exist
 *   - .../node_modules/react-native/ReactAndroid/gradle.properties (No such file)
 *
 * This script links every package present in the monorepo-root node_modules
 * into this package's local node_modules, but only where a local copy does NOT
 * already exist (so workspace-specific installs are never clobbered).
 *
 * It is invoked from the "postinstall" script and is safe to run repeatedly.
 */
const fs = require('fs');
const path = require('path');

const localNodeModules = path.resolve(__dirname, '..', 'node_modules');

// Walk up from this package looking for an ancestor node_modules that actually
// contains the hoisted `react-native` (the monorepo root).
function findRootNodeModules(start) {
  let dir = path.resolve(start, '..', '..'); // skip our own node_modules' parent
  while (true) {
    const candidate = path.join(dir, 'node_modules');
    if (
      candidate !== localNodeModules &&
      fs.existsSync(path.join(candidate, 'react-native'))
    ) {
      return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

const rootNodeModules = findRootNodeModules(localNodeModules);
if (!rootNodeModules) {
  // Nothing hoisted (e.g. standalone install) — nothing to do.
  console.log('[sync-hoisted-deps] no hoisted root node_modules found; skipping');
  process.exit(0);
}

let linked = 0;
let skipped = 0;

function exists(p) {
  return !!fs.lstatSync(p, { throwIfNoEntry: false });
}

function linkPkg(rel) {
  const target = path.join(rootNodeModules, rel);
  const dest = path.join(localNodeModules, rel);
  if (exists(dest)) {
    skipped++;
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.symlinkSync(path.relative(path.dirname(dest), target), dest);
  linked++;
}

for (const entry of fs.readdirSync(rootNodeModules)) {
  if (entry.startsWith('.')) continue; // .bin, .cache, .package-lock.json
  const full = path.join(rootNodeModules, entry);
  if (!fs.statSync(full).isDirectory()) continue;
  if (entry.startsWith('@')) {
    for (const sub of fs.readdirSync(full)) linkPkg(path.join(entry, sub));
  } else {
    linkPkg(entry);
  }
}

console.log(
  `[sync-hoisted-deps] linked ${linked} hoisted package(s) into local node_modules (${skipped} already present)`
);

// --- Fix @react-native/metro-config version shadowing ----------------------
// react-native's CLI (community-cli-plugin) does a bare
// `require("@react-native/metro-config")` from inside the hoisted react-native,
// so it resolves the monorepo-root copy. Another workspace (e.g. docsite) can
// pull in an OLD metro-config (e.g. 0.73.x) that gets hoisted to the root,
// which lacks `setFrameworkDefaults` and makes `react-native start` fail with:
//   `@react-native/metro-config` does not have the expected API.
// Point react-native's NESTED resolution at this app's matching copy without
// disturbing the root version (so other workspaces keep their own).
try {
  const appMetroConfig = path.join(localNodeModules, '@react-native', 'metro-config');
  if (fs.existsSync(path.join(appMetroConfig, 'package.json'))) {
    const nestedScope = path.join(rootNodeModules, 'react-native', 'node_modules', '@react-native');
    const nestedLink = path.join(nestedScope, 'metro-config');
    if (fs.existsSync(nestedScope) && !exists(nestedLink)) {
      fs.symlinkSync(path.relative(nestedScope, appMetroConfig), nestedLink);
      console.log('[sync-hoisted-deps] linked @react-native/metro-config into react-native (version pin)');
    }
  }
} catch (e) {
  console.log('[sync-hoisted-deps] metro-config pin skipped:', e.message);
}
