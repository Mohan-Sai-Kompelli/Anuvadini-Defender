#!/usr/bin/env node
/**
 * ensure-nitro-codegen-stub.js
 *
 * React Native's autolinking treats `react-native-nitro-modules` as a codegen
 * module (its package.json declares `codegenConfig.name = "NitroModulesSpec"`),
 * so the generated Android-autolinking.cmake contains:
 *
 *   add_subdirectory(".../react-native-nitro-modules/android/build/generated/source/codegen/jni/"
 *                    NitroModulesSpec_autolinked_build)
 *   ... target_link_libraries(react_codegen_NitroModulesSpec common_flags)
 *
 * But nitro-modules uses its OWN codegen ("nitrogen") and never emits React
 * Native codegen artifacts, so that directory does not exist and the app's
 * `configureCMakeDebug` fails with:
 *
 *   add_subdirectory given source ".../codegen/jni/" which is not an existing directory
 *   Cannot specify link libraries for target "react_codegen_NitroModulesSpec"
 *
 * This script writes a minimal stub (an empty OBJECT library named
 * `react_codegen_NitroModulesSpec`) so CMake configuration succeeds. The real
 * nitro native code is linked separately via nitro-modules' prefab AAR, so the
 * stub having no sources is correct.
 *
 * Invoked from "postinstall"; safe to run repeatedly.
 */
const fs = require('fs');
const path = require('path');

// Resolve nitro-modules' real location (follows the workspace symlink to the
// hoisted copy in the monorepo-root node_modules).
let pkgJson;
try {
  pkgJson = require.resolve('react-native-nitro-modules/package.json', {
    paths: [path.resolve(__dirname, '..')],
  });
} catch (e) {
  console.log('[ensure-nitro-codegen-stub] react-native-nitro-modules not found; skipping');
  process.exit(0);
}

const nitroRoot = fs.realpathSync(path.dirname(pkgJson));
const jniDir = path.join(nitroRoot, 'android', 'build', 'generated', 'source', 'codegen', 'jni');

fs.mkdirSync(jniDir, { recursive: true });

// Header: declares the TurboModule provider that the generated
// app/build/generated/autolinking/src/main/jni/autolinking.cpp #includes
// (<NitroModulesSpec.h>) and calls (NitroModulesSpec_ModuleProvider).
fs.writeFileSync(
  path.join(jniDir, 'NitroModulesSpec.h'),
  [
    '// Auto-generated stub by ensure-nitro-codegen-stub.js.',
    '#pragma once',
    '',
    '#include <ReactCommon/JavaTurboModule.h>',
    '#include <ReactCommon/TurboModule.h>',
    '#include <jsi/jsi.h>',
    '',
    'namespace facebook::react {',
    '',
    'std::shared_ptr<TurboModule> NitroModulesSpec_ModuleProvider(',
    '    const std::string &moduleName, const JavaTurboModule::InitParams &params);',
    '',
    '} // namespace facebook::react',
    '',
  ].join('\n')
);

// Source: defines the provider as a no-op. react-native-nitro-modules does not
// expose a React Native TurboModule here; its HybridObjects register via the
// nitro prefab/runtime, so returning nullptr ("not my module") is correct.
//
// IMPORTANT: the provider is defined as a WEAK symbol. Newer RN/nitro versions
// DO emit a real NitroModulesSpec-generated.cpp (a strong definition) into this
// same directory, and the codegen CMakeLists globs every *.cpp here. A strong
// stub would then collide with the generated one ("ld.lld: duplicate symbol:
// NitroModulesSpec_ModuleProvider"). As a weak symbol the linker silently
// prefers the strong generated definition when present and falls back to this
// stub only when codegen emits nothing — correct in both cases.
fs.writeFileSync(
  path.join(jniDir, 'NitroModulesSpec-stub.cpp'),
  [
    '// Auto-generated stub by ensure-nitro-codegen-stub.js.',
    '#include "NitroModulesSpec.h"',
    '',
    'namespace facebook::react {',
    '',
    '__attribute__((weak))',
    'std::shared_ptr<TurboModule> NitroModulesSpec_ModuleProvider(',
    '    const std::string &moduleName, const JavaTurboModule::InitParams &params) {',
    '  (void)moduleName;',
    '  (void)params;',
    '  return nullptr;',
    '}',
    '',
    '} // namespace facebook::react',
    '',
  ].join('\n')
);

fs.writeFileSync(
  path.join(jniDir, 'CMakeLists.txt'),
  [
    'cmake_minimum_required(VERSION 3.13)',
    'set(CMAKE_VERBOSE_MAKEFILE on)',
    '',
    'file(GLOB react_codegen_SRCS CONFIGURE_DEPENDS *.cpp)',
    '',
    'add_library(',
    '  react_codegen_NitroModulesSpec',
    '  OBJECT',
    '  ${react_codegen_SRCS}',
    ')',
    '',
    'target_include_directories(react_codegen_NitroModulesSpec PUBLIC .)',
    '',
    'target_link_libraries(',
    '  react_codegen_NitroModulesSpec',
    '  fbjni',
    '  jsi',
    '  reactnative',
    ')',
    '',
    'target_compile_reactnative_options(react_codegen_NitroModulesSpec PRIVATE)',
    '',
  ].join('\n')
);

console.log(`[ensure-nitro-codegen-stub] wrote stub at ${jniDir}`);
