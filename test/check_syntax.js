const fs = require('fs');
const path = require('path');
const vm = require('vm');

if (!vm.SourceTextModule) {
  const { execFileSync } = require('child_process');
  try {
    execFileSync(process.execPath, ['--experimental-vm-modules', __filename], { stdio: 'inherit' });
    process.exit(0);
  } catch (err) {
    process.exit(err.status || 1);
  }
}

function getJsFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getJsFiles(fullPath));
    } else if (file.endsWith('.js')) {
      results.push(fullPath);
    }
  }
  return results;
}

const dir = path.resolve(__dirname, '../public/src');
const files = getJsFiles(dir);

let errors = 0;
for (const fullPath of files) {
  const relative = path.relative(dir, fullPath).replace(/\\/g, '/');
  const code = fs.readFileSync(fullPath, 'utf8');
  try {
    // Check syntax as ES module using vm.SourceTextModule
    new vm.SourceTextModule(code, { initializeImportMeta() {} });
    console.log(`✓ OK: ${relative}`);
  } catch (err) {
    console.error(`✗ SYNTAX ERROR in ${relative}:`, err.message);
    errors++;
  }
}

if (errors > 0) {
  console.error(`\nFound ${errors} syntax error(s)!`);
  process.exit(1);
} else {
  console.log(`\nAll ${files.length} client files have valid syntax!`);
}
