'use strict';
const { test } = require('node:test');
const { execFileSync } = require('node:child_process');

test('ShowHiddenChannels native runtime regressions', () => {
    execFileSync(process.execPath, [require.resolve('../plugins/show-hidden-channels/tests/runtime.test.cjs')], { stdio: 'inherit' });
});
