'use strict';
process.env.PLUGIN_TEST_TARGET = 'valenced';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createWorld, Renderer } = require('../../revenge-next/tests/next-harness.cjs');
const { installSettingsSection } = require('./settings-fixture.cjs');
const PREFIX = 'dev.fluttershy2008.long-video-share.';
const selected = { phase: 'selected', name: '45-minute-video.mp4', sourceBytes: 1500000000,
    durationSeconds: 2700, audioBytes: 43200000, width: 1920, height: 1080 };
const button = (ui, label) => ui.root.findAllByType('Pressable').find(node => node.props.accessibilityLabel === label);
const input = (ui, label) => ui.root.findAllByType('TextInput').find(node => node.props.accessibilityLabel === label);
const contents = ui => JSON.stringify(ui.toJSON());

function fixture(t, initialStatus = selected) {
    const w = createWorld(), renders = []; installSettingsSection(w);
    w.status = structuredClone(initialStatus); w.nativeCalls = []; w.nativeFailure = false;
    w.U.modules.native.callNativeMethod = async (name, args) => {
        assert.ok(name.startsWith(PREFIX)); const action = name.slice(PREFIX.length);
        w.nativeCalls.push([action, ...structuredClone(args)]);
        if (w.nativeFailure) throw Error('Missing native bridge');
        if (w.nativeAction) return w.nativeAction(action, args);
        if (action === 'compress') w.status = { ...w.status, phase: 'compressing', progress: 0, attempt: 1, limitBytes: args[0] };
        if (action === 'cancel') w.status = { ...w.status, phase: 'cancelling' };
        if (action === 'save') w.status = { ...w.status, phase: 'choosing-save' };
        if (action === 'pick') w.status = { phase: 'picking' };
        if (action === 'clear') w.status = { phase: 'idle' };
        return structuredClone(w.status);
    };
    w.page = async (settings = {}) => {
        const item = await w.start('long-video-share', settings), ui = await w.render(item);
        renders.push(ui); return { item, ui };
    };
    w.press = async (ui, label) => {
        const node = button(ui, label); assert.ok(node, label); assert.equal(node.props.disabled, false, label + ' enabled');
        await Renderer.act(async () => { await node.props.onPress(); await Promise.resolve(); });
    };
    w.poll = async () => { await Renderer.act(async () => { await w.advance(1000); }); };
    t.after(async () => {
        for (const item of [...w.loaded.values()]) await Renderer.act(async () => w.stop(item));
        for (const ui of renders.reverse()) await Renderer.act(async () => ui.unmount());
        assert.equal(w.timers.size, 0); assert.equal(w.registeredScreens.size, 0);
        assert.deepEqual(w.errors, []); assert.deepEqual(w.toasts, []);
        assert.equal(w.calls.some(call => ['fetch', 'sendMessage', 'login'].includes(call[0])), false);
    });
    return w;
}

test('a 45-minute video uses a conservative Nitro preset and sends only a size target to native compression', async t => {
    const w = fixture(t), { ui } = await w.page();
    assert.match(contents(ui), /45:00/); assert.match(contents(ui), /1500.0 MB/);
    assert.equal(input(ui, 'Target file size in megabytes').props.value, '500');
    assert.equal(button(ui, 'Save MP4').props.disabled, true);
    await w.press(ui, '480p'); await w.press(ui, 'Compress video');
    assert.deepEqual(w.nativeCalls.find(call => call[0] === 'compress'), ['compress', 500000000, 480]);
    assert.match(contents(ui), /Compressing: 0%/);
    assert.equal(button(ui, 'Choose video').props.disabled, true);
    assert.equal(button(ui, 'Compress video').props.disabled, true);
    assert.equal(button(ui, 'Cancel').props.disabled, false);
    await w.press(ui, 'Cancel'); assert.deepEqual(w.nativeCalls.at(-1), ['cancel']);
});

test('presets and custom limits persist while negative, nonnumeric and infinite targets cannot reach native code', async t => {
    const w = fixture(t), { item, ui } = await w.page();
    await w.press(ui, '1 GB');
    assert.equal(item.writes.at(-1).targetMB, '1000');
    for (const value of ['-1', 'Infinity', '0', 'bad', '10001']) {
        await Renderer.act(async () => input(ui, 'Target file size in megabytes').props.onChangeText(value));
        await w.press(ui, 'Compress video');
        assert.match(contents(ui), /Enter a size from 1 to 10,000 MB/);
    }
    assert.equal(w.nativeCalls.some(call => call[0] === 'compress'), false);
    await Renderer.act(async () => input(ui, 'Target file size in megabytes').props.onChangeText('450.5'));
    await w.press(ui, 'Compress video');
    assert.deepEqual(w.nativeCalls.at(-1), ['compress', 450500000, 720]);
    assert.ok(item.writes.every(value => Object.keys(value).sort().join(',') === 'shortSide,targetMB'));
});

test('audio that cannot fit prevents a misleading compression request', async t => {
    const w = fixture(t), { ui } = await w.page({ targetMB: '20' });
    assert.match(contents(ui), /too small for this video and its audio/);
    assert.equal(button(ui, 'Compress video').props.disabled, true);
    assert.equal(w.nativeCalls.some(call => call[0] === 'compress'), false);
});

test('progress, oversize retry and verified export status come from native processing', async t => {
    const w = fixture(t), { ui } = await w.page();
    await w.press(ui, 'Compress video');
    w.status.progress = 61; w.status.attempt = 2; await w.poll();
    assert.match(contents(ui), /61%/); assert.match(contents(ui), /size retry 2\/3/);
    w.status = { ...w.status, phase: 'ready', progress: 100, outputBytes: 470000000 }; await w.poll();
    assert.match(contents(ui), /470.0 MB/); await w.press(ui, 'Save MP4');
    assert.deepEqual(w.nativeCalls.at(-1), ['save']);
    w.status.phase = 'saved'; await w.poll();
    assert.match(contents(ui), /tap \+ and attach the saved MP4/);
    w.status.outputBytes = 500000000; await w.poll();
    assert.equal(button(ui, 'Save MP4').props.disabled, true, 'the exact cap is not below the cap');
});

test('unsupported codecs and native errors are visible without success output', async t => {
    const w = fixture(t, { phase: 'error', error: 'This is an HDR video. Export an SDR copy first.' }), { ui } = await w.page();
    assert.match(contents(ui), /HDR video/); assert.equal(button(ui, 'Save MP4').props.disabled, true);
    await w.press(ui, 'Choose video'); assert.deepEqual(w.nativeCalls.at(-1), ['pick']);
});

test('missing native code gives restart guidance and keeps compression disabled', async t => {
    const w = fixture(t); w.nativeFailure = true;
    const { ui } = await w.page();
    assert.match(contents(ui), /Fully close and reopen Valenced/);
    assert.equal(button(ui, 'Choose video').props.disabled, true);
    assert.equal(button(ui, 'Compress video').props.disabled, true);
});

test('malformed bridge responses are rejected instead of being rendered as React children', async t => {
    const w = fixture(t); w.nativeAction = async () => ({ error: { code: 'UNKNOWN_METHOD' } });
    const { ui } = await w.page();
    assert.match(contents(ui), /Fully close and reopen Valenced/);
    assert.equal(button(ui, 'Choose video').props.disabled, true);
});

test('hosted links copy through Valenced’s actual clipboard API and are never sent or stored', async t => {
    const w = fixture(t), { item, ui } = await w.page();
    const url = 'https://youtu.be/example-video?t=20';
    await Renderer.act(async () => input(ui, 'Hosted video link').props.onChangeText(url));
    await w.press(ui, 'Copy video link'); assert.deepEqual(w.clipboard, [url]);
    assert.match(contents(ui), /Copied. Paste the link/);
    assert.equal(item.writes.length, 0);
    for (const value of ['javascript:alert(1)', 'http://example.com/video', 'https://user:password@example.com/video', 'https://example.com/video\n@everyone']) {
        await Renderer.act(async () => input(ui, 'Hosted video link').props.onChangeText(value));
        await w.press(ui, 'Copy video link');
    }
    assert.deepEqual(w.clipboard, [url]);
});

test('unmount, stop and restart remove polling and discard stale status responses', async t => {
    const w = fixture(t), { item, ui } = await w.page();
    let resolve;
    w.nativeAction = () => new Promise(done => { resolve = done; });
    await w.poll(); assert.equal(typeof resolve, 'function');
    await Renderer.act(async () => w.stop(item));
    assert.equal(w.timers.size, 0);
    await Renderer.act(async () => { resolve({ ...selected, phase: 'ready', outputBytes: 1 }); await Promise.resolve(); });
    assert.doesNotMatch(contents(ui), /MP4 ready/);
    w.nativeAction = undefined; await w.page();
    assert.equal(w.nativeCalls.filter(call => call[0] === 'compress').length, 0);
});
