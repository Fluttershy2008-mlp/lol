'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createWorld, Renderer } = require('./next-harness.cjs');
const ROOT = path.resolve(__dirname, '../..', process.env.PLUGIN_TEST_TARGET === 'valenced' ? 'valenced' : 'revenge-next');
const ports = Object.entries(JSON.parse(fs.readFileSync(path.join(ROOT, 'sources.json'), 'utf8')).plugins)
    .filter(([, info]) => info.kind === 'compatibility-preview').map(([id]) => id.slice('dev.fluttershy2008.'.length));

for (const slug of ports) test(slug + ': ' + (process.env.PLUGIN_TEST_TARGET === 'valenced' ? 'Valenced' : 'Next') + ' startup, React settings mount, stop and restart', async () => {
    const world = createWorld();
    let item, renderer;
    try {
        item = await world.start(slug);
        renderer = await world.render(item);
        assert.ok(renderer.toJSON(), 'settings screen rendered');
        await Renderer.act(async () => { renderer.unmount(); }); renderer = undefined;
        await world.stop(item); item = undefined;
        assert.equal(world.timers.size, 0, 'no plugin timer survives stop');
        assert.equal(world.appListeners.size, 0, 'no AppState listener survives stop');
        assert.equal([...world.subscriptions.values()].reduce((n, set) => n + set.size, 0), 0, 'no Flux subscription survives stop');
        assert.equal(Object.values(world.stores).reduce((n, store) => n + store.listeners.size, 0), 0, 'no store listener survives stop');
        item = await world.start(slug);
        await world.stop(item); item = undefined;
        assert.deepEqual(world.errors, [], 'no lifecycle or settings error was logged');
    } finally {
        if (renderer) await Renderer.act(async () => renderer.unmount());
        if (item) await world.stop(item);
    }
});
