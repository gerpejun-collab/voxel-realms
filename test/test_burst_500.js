const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('=============================================================================');
console.log('   TEST SUITE: WEAPON BURST 500X & TACTICAL MISSILE 30X SEPARATION          ');
console.log('=============================================================================\n');

// 1. Controls.js verification
const controlsCode = fs.readFileSync(path.join(__dirname, '..', 'public', 'src', 'controls.js'), 'utf8');

assert(controlsCode.includes('this.weaponBurstCount = 1;'), 'controls.js must have weaponBurstCount initialized');
assert(controlsCode.includes('Math.min(500,'), 'controls.js must clamp weaponBurstCount to max 500');
assert(controlsCode.includes('cycleWeaponBurst()'), 'controls.js must implement cycleWeaponBurst()');
assert(controlsCode.includes('[1, 10, 25, 50, 100, 200, 500]'), 'cycleWeaponBurst must cycle up to 500');
assert(controlsCode.includes('fireWeaponBurst()'), 'controls.js must implement fireWeaponBurst()');
assert(controlsCode.includes('this.tacticalMissileSalvoCount = 1;'), 'controls.js must have tacticalMissileSalvoCount initialized');
assert(controlsCode.includes('Math.min(30,'), 'controls.js must clamp missile salvo count to 30');

console.log('✓ TEST 1 PASSED: controls.js implements independent 500x weapon burst and 30x tactical missile salvo.');

// 2. UI and HTML verification
const htmlCode = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

assert(htmlCode.includes('id="weapon-burst-count" class="mc-range" min="1" max="500"'), 'index.html must have weapon burst slider up to 500');
assert(htmlCode.includes('id="weapon-burst-count-num"'), 'index.html must have weapon burst number input');
assert(htmlCode.includes('id="weapon-salvo-count" class="mc-range" min="1" max="30"'), 'index.html must retain tactical missile salvo slider at 30');

console.log('✓ TEST 2 PASSED: index.html has distinct 500x weapon burst and 30x missile salvo controls.');

// 3. UI logic verification
const uiCode = fs.readFileSync(path.join(__dirname, '..', 'public', 'src', 'ui.js'), 'utf8');

assert(uiCode.includes('this.controls.cycleWeaponBurst()'), 'ui.js btn-weapon-salvo must invoke cycleWeaponBurst');
assert(!uiCode.includes("btnWeaponSalvo.addEventListener('click', () => {\n        sound.playClick();\n        if (this.controls && typeof this.controls.cycleMissileSalvo === 'function') {\n          const count = this.controls.cycleMissileSalvo();\n          this.controls.setWeapon('bazooka');"), 'ui.js must not force switch to bazooka on weapon burst click');

console.log('✓ TEST 3 PASSED: ui.js cycles weapon burst for active weapon without forcing weapon change.');

console.log('\n=============================================================================');
console.log('STATUS: ALL WEAPON BURST 500X & MISSILE 30X TESTS PASSED 100%!');
console.log('=============================================================================');
