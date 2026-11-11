const fs = require('fs');
const path = require('path');
const vm = require('vm');

const dir = path.resolve(__dirname, '../public/src');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));

let errors = 0;
for (const file of files) {
  const fullPath = path.join(dir, file);
  const code = fs.readFileSync(fullPath, 'utf8');
  try {
    // Check syntax as ES module using vm.SourceTextModule
    new vm.SourceTextModule(code, { initializeImportMeta() {} });
    console.log(`✓ OK: ${file}`);
  } catch (err) {
    console.error(`✗ SYNTAX ERROR in ${file}:`, err.message);
    errors++;
  }
}

if (errors > 0) {
  console.error(`\nFound ${errors} syntax error(s)!`);
  process.exit(1);
} else {
  console.log(`\nAll ${files.length} client files have valid syntax!`);
}
