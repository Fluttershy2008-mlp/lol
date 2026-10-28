'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createWorld, React, Renderer, GUILD } = require('./next-harness.cjs');
const h = React.createElement;
const STICKER = '800000000000000008', CREATED = '800000000000000009';
const bytes = Buffer.from('fixture-sticker-bytes');
class NativeFormData {
    constructor() { this.parts = []; }
    append(name, value) { assert.equal(arguments.length, 2, 'native FormData takes a URI object, not a Blob/filename pair'); this.parts.push([name, value]); }
    getParts() { return this.parts; }
}
class Reader {
    readAsDataURL(blob) {
        blob.arrayBuffer().then(value => {
            this.result = 'data:' + (blob.type || 'application/octet-stream') + ';base64,' + Buffer.from(value).toString('base64');
            this.onloadend?.();
        }, error => { this.error = error; this.onerror?.(); });
    }
}
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
function button(ui, label) {
    const node = ui.root.findAll(n => typeof n.type === 'string' && typeof n.props.onPress === 'function'
        && [n.props.label, n.props.title, n.props.text, n.props.accessibilityLabel].includes(label))[0];
    assert.ok(node, 'button exists: ' + label); return node.props.onPress;
}
async function settle(callback = () => {}) {
    await Renderer.act(async () => { callback(); for (let n = 0; n < 3; n++) await new Promise(resolve => setImmediate(resolve)); });
}
function scenario(t, options = {}) {
    const w = createWorld({ splitHTTP: true, curatedOnly: true, http: options.http,
        fetch: options.fetch ?? (() => new Response(bytes, { headers: { 'content-type': options.mime ?? 'image/png' } })),
        globals: { FileReader: Reader, FormData: options.FormData ?? NativeFormData } });
    w.U.discord.design.Design.AlertModal = props => h('AlertModal', props, props.content, props.actions);
    for (let i = w.modules.length - 1; i >= 0; i--) if (w.modules[i]?.createGuildSticker) w.modules.splice(i, 1);
    const renders = [], files = {
        async writeFile(dir, name, data, encoding) {
            w.fileWrites.push({ dir, name, data, encoding });
            return options.write ? options.write(name) : '/cache/' + name;
        },
        async removeFile(dir, name) { w.fileDeletes.push({ dir, name }); },
    };
    w.fileWrites = []; w.fileDeletes = []; w.expectedErrors = 0;
    if (!options.noFiles) w.U.discord.native = { FileModule: files };
    w.nativeUploader = { async createGuildSticker(input) {
        w.calls.push(['nativeStickerPost', input]);
        return options.nativePost ? options.nativePost(input) : { id: CREATED };
    } };
    w.mount = async element => {
        let ui; await Renderer.act(async () => { ui = Renderer.create(element); });
        renders.push(ui); return ui;
    };
    w.openClone = async (format = 1) => {
        const Row = w.U.discord.design.Design.ActionSheetRow;
        const props = { message: { stickerItems: [{ id: STICKER, name: 'pony', format_type: format, tags: 'sparkles' }] } };
        const module = await w.sheets.openLazy(Promise.resolve({ default: () => h(w.RN.View, null,
            [h(Row, { key: 'reply', label: 'Reply', onPress() {} })]) }), 'MessageLongPressActionSheet', props);
        const menu = await w.mount(h(module.default, props));
        await settle(button(menu, 'Clone Sticker'));
        const pickerModule = await w.openedSheets.at(-1).promise;
        const picker = await w.mount(h(pickerModule.default));
        await settle(button(picker, 'Test Guild'));
        const prompt = await w.mount(w.alerts.at(-1)[1]);
        return button(prompt, 'Clone to Test Guild');
    };
    w.posts = () => w.calls.filter(c => c[0] === 'http' && c[1] === 'post');
    w.nativePosts = () => w.calls.filter(c => c[0] === 'nativeStickerPost');
    w.assertFailure = pattern => {
        w.expectedErrors = 1;
        assert.equal(w.toasts.some(value => /^Cloned /.test(value)), false);
        assert.ok(w.toasts.some(value => pattern.test(value)), 'failure explains the upload result');
    };
    t.after(async () => {
        for (const ui of renders.reverse()) await Renderer.act(async () => ui.unmount());
        for (const item of [...w.loaded.values()].reverse()) await w.stop(item);
        assert.equal(w.errors.length, w.expectedErrors);
        assert.equal(w.timers.size, 0);
        assert.equal(w.registeredScreens.size, 0);
        assert.equal(w.moduleWaiters.size, 0);
        assert.equal(w.pathWaiters.size, 0);
        assert.deepEqual(w.fileDeletes.map(x => x.name).sort(), w.fileWrites.map(x => x.name).sort());
        assert.ok(w.fileDeletes.every(x => x.dir === 'cache' && x.name.startsWith('expression-cloner-')));
    });
    return w;
}

test('ExpressionCloner discovers a standalone native uploader loaded after startup', async t => {
    const w = scenario(t); await w.start('expression-cloner');
    w.addModule(w.nativeUploader);
    await settle(await w.openClone());
    assert.equal(w.nativePosts().length, 1);
    assert.equal(w.posts().length, 0);
    const input = w.nativePosts()[0][1];
    assert.equal(input.guildId, GUILD); assert.equal(input.name, 'pony'); assert.equal(input.tags, 'sparkles');
    assert.match(input.uri, /^file:\/\/\/cache\/expression-cloner-.*\.png$/);
    assert.equal(input.mimeType, 'image/png'); assert.equal(input.platform, 'mobile');
    assert.equal(w.fileWrites[0].data, bytes.toString('base64')); assert.equal(w.fileWrites[0].encoding, 'base64');
    assert.ok(w.toasts.some(value => value === 'Cloned pony to Test Guild'));
});

for (const [format, ext, mime] of [[1, 'png', 'image/png'], [2, 'png', 'image/png'], [4, 'gif', 'image/gif']])
test('ExpressionCloner uploads ' + ext + ' format ' + format + ' without the old sticker module', async t => {
    const w = scenario(t, { mime });
    w.modules.unshift({ get() { assert.fail('tracked HTTP must not be used'); }, post() { assert.fail('tracked HTTP must not be used'); }, del() {} });
    await w.start('expression-cloner');
    await settle(await w.openClone(format));
    assert.equal(w.posts().length, 1); assert.equal(w.nativePosts().length, 0);
    const input = w.posts()[0][2], parts = input.body.getParts();
    assert.equal(input.url, '/guilds/' + GUILD + '/stickers'); assert.equal(input.oldFormErrors, true);
    assert.equal(input.failImmediatelyWhenRateLimited, true, 'do not queue a later sticker creation after a rate limit');
    assert.equal(parts.find(([name]) => name === 'name')[1], 'pony');
    assert.equal(parts.find(([name]) => name === 'tags')[1], 'sparkles');
    const file = parts.find(([name]) => name === 'file')[1];
    assert.match(file.uri, new RegExp('^file:///cache/expression-cloner-.*\\.' + ext + '$'));
    assert.equal(file.type, mime); assert.equal(file.name, 'sticker.' + ext);
    assert.equal(w.fileWrites[0].data, bytes.toString('base64'));
    const event = w.calls.find(c => c[0] === 'dispatch' && c[1].type === 'GUILD_STICKERS_CREATE_SUCCESS')[1];
    assert.equal(event.guildId, GUILD); assert.equal(event.sticker.user.id, w.accountId());
    assert.ok(w.toasts.some(value => value === 'Cloned pony to Test Guild'));
});

test('ExpressionCloner never retries a failed native creation through REST', async t => {
    const w = scenario(t, { nativePost: () => { throw new Error('Upload timed out; check the server before retrying'); } });
    w.addModule(w.nativeUploader); await w.start('expression-cloner');
    await settle(await w.openClone());
    assert.equal(w.nativePosts().length, 1); assert.equal(w.posts().length, 0);
    w.assertFailure(/Upload timed out/);
});

for (const status of [403, 429]) test('ExpressionCloner reports HTTP ' + status + ' without another creation attempt', async t => {
    const w = scenario(t, { http: () => ({ status, ok: false, body: { message: status === 403 ? 'Missing Permissions' : 'Rate limited' } }) });
    await w.start('expression-cloner'); await settle(await w.openClone());
    assert.equal(w.posts().length, 1); w.assertFailure(status === 403 ? /Missing Permissions/ : /Rate limited/);
});

test('ExpressionCloner does not claim success without a confirmed sticker ID', async t => {
    const w = scenario(t, { http: () => ({ status: 200, body: {} }) });
    await w.start('expression-cloner'); await settle(await w.openClone());
    assert.equal(w.posts().length, 1); w.assertFailure(/did not confirm/);
});

test('ExpressionCloner deduplicates confirmations while the download is pending', async t => {
    const download = deferred(), w = scenario(t, { fetch: () => download.promise });
    await w.start('expression-cloner'); const confirm = await w.openClone();
    await settle(() => { confirm(); confirm(); });
    assert.equal(w.calls.filter(c => c[0] === 'fetch').length, 1);
    download.resolve(new Response(bytes)); await settle();
    assert.equal(w.posts().length, 1);
});

test('ExpressionCloner cancels a pending download when disabled', async t => {
    const download = deferred(), w = scenario(t, { fetch: () => download.promise });
    const item = await w.start('expression-cloner'); await settle(await w.openClone());
    await w.stop(item); download.resolve(new Response(bytes)); await settle();
    assert.equal(w.posts().length, 0); assert.equal(w.fileWrites.length, 0);
    assert.equal(w.toasts.some(value => /^(Cloned |Clone failed:)/.test(value)), false);
});

for (const reason of ['stop', 'account switch']) test('ExpressionCloner cleans its file and cancels upload after ' + reason, async t => {
    const write = deferred(), w = scenario(t, { write: () => write.promise });
    const item = await w.start('expression-cloner'); await settle(await w.openClone());
    assert.equal(w.fileWrites.length, 1);
    if (reason === 'stop') await w.stop(item);
    else w.setAccount('200000000000000099');
    write.resolve('/cache/' + w.fileWrites[0].name); await settle();
    assert.equal(w.posts().length, 0); assert.equal(w.nativePosts().length, 0);
    assert.equal(w.toasts.some(value => /^(Cloned |Clone failed:)/.test(value)), false);
});

test('ExpressionCloner ignores a confirmation retained across stop/restart', async t => {
    const w = scenario(t), item = await w.start('expression-cloner'), confirm = await w.openClone();
    await w.stop(item); await w.start('expression-cloner'); await settle(confirm);
    assert.equal(w.calls.filter(c => c[0] === 'fetch').length, 0); assert.equal(w.posts().length, 0);
});

test('ExpressionCloner rechecks expression permission immediately before upload', async t => {
    const download = deferred(), w = scenario(t, { fetch: () => download.promise });
    await w.start('expression-cloner'); await settle(await w.openClone());
    w.guilds[GUILD].ownerId = 'another-user'; w.stores.PermissionStore.can = () => false;
    download.resolve(new Response(bytes)); await settle();
    assert.equal(w.posts().length, 0); w.assertFailure(/no longer have permission/);
});

test('ExpressionCloner rejects oversized sticker bytes without a POST', async t => {
    const w = scenario(t, { fetch: () => new Response(new Uint8Array(512 * 1024 + 1)) });
    await w.start('expression-cloner'); await settle(await w.openClone());
    assert.equal(w.posts().length, 0); assert.equal(w.fileWrites.length, 0); w.assertFailure(/upload limit/);
});

test('ExpressionCloner rejects fetched Lottie metadata before downloading an image', async t => {
    const w = scenario(t); w.addModule({ fetchSticker: async () => ({ id: STICKER, format_type: 3 }) });
    await w.start('expression-cloner'); await settle(await w.openClone());
    assert.equal(w.calls.filter(c => c[0] === 'fetch').length, 0); assert.equal(w.posts().length, 0);
    w.assertFailure(/Lottie stickers are not supported/);
});

test('ExpressionCloner retains the browser multipart path without a native file module', async t => {
    const w = scenario(t, { noFiles: true, FormData });
    await w.start('expression-cloner'); await settle(await w.openClone());
    assert.equal(w.posts().length, 1); assert.equal(w.fileWrites.length, 0);
    assert.ok(w.posts()[0][2].body.get('file') instanceof Blob);
});
