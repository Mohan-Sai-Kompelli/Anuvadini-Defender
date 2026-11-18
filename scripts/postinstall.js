const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('Running postinstall tasks...');

// 1. Run patch-package
try {
  console.log('Running patch-package...');
  execSync('npx patch-package', { stdio: 'inherit' });
} catch (error) {
  console.error('Error running patch-package:', error.message);
}

// 2. Run optional scripts if they exist
const optionalScripts = [
  'ensure-nitro-codegen-stub',
  'sync-hoisted-deps',
  'copy-skia-native-libs'
];

for (const scriptName of optionalScripts) {
  const scriptPath = path.join(__dirname, `${scriptName}.js`);
  if (fs.existsSync(scriptPath)) {
    console.log(`Running script: ${scriptName}.js...`);
    try {
      execSync(`node "${scriptPath}"`, { stdio: 'inherit' });
    } catch (error) {
      console.error(`Error running ${scriptName}.js:`, error.message);
    }
  } else {
    console.log(`Optional script ${scriptName}.js does not exist, skipping.`);
  }
}

console.log('Postinstall tasks completed.');
