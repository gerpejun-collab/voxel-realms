#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Dynamically resolve schema_validator from test/e2e/helpers or local
let validateSessionJson;
const possiblePaths = [
  path.join(__dirname, '..', '..', 'test', 'e2e', 'helpers', 'schema_validator.js'),
  path.join(__dirname, '..', '..', 'helpers', 'schema_validator.js'),
  path.join(__dirname, '..', '..', '..', 'helpers', 'schema_validator.js')
];

for (const p of possiblePaths) {
  if (fs.existsSync(p)) {
    validateSessionJson = require(p).validateSessionJson;
    break;
  }
}

if (!validateSessionJson) {
  try {
    validateSessionJson = require('../../test/e2e/helpers/schema_validator').validateSessionJson;
  } catch {
    validateSessionJson = require('../../../helpers/schema_validator').validateSessionJson;
  }
}

const targetFile = process.argv[2];

if (!targetFile) {
  console.error('Usage: node validate_dataset.js <path_to_session.json>');
  process.exit(1);
}

try {
  const content = fs.readFileSync(targetFile, 'utf8');
  const data = JSON.parse(content);
  const result = validateSessionJson(data);

  if (result.valid) {
    console.log(`[PASS] ${path.basename(targetFile)} conforms strictly to Draft 2020-12 schema.`);
    process.exit(0);
  } else {
    console.error(`[FAIL] Schema validation errors in ${path.basename(targetFile)}:`);
    result.errors.forEach(e => console.error(`  - ${e}`));
    process.exit(1);
  }
} catch (err) {
  console.error(`[ERROR] Failed to parse or validate dataset: ${err.message}`);
  process.exit(1);
}
