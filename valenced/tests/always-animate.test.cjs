'use strict';
const { test } = require('node:test');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

for (const suite of ['smoke.cjs', 'apng-gate.cjs', 'render-performance.cjs']) {
    test('Always Animate: ' + suite, () => {
        execFileSync(process.execPath, [path.join(__dirname, '../plugins/always-animate/tests', suite)], { stdio: 'pipe' });
    });
}
