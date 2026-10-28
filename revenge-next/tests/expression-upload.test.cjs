'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createWorld, React, Renderer, ACCOUNT, FRIEND, GUILD } = require('./next-harness.cjs');
const { gifFixture } = require('../../save-as-sticker/tests/gif-fixture.mjs');
const h = React.createElement, EMOJI = '800000000000000008', CREATED = '800000000000000009';
const png = Buffer.alloc(32); Buffer.from([137,80,78,71,13,10,26,10]).copy(png);
png.writeUInt32BE(13, 8); png.write('IHDR', 12); png.writeUInt32BE(320, 16); png.writeUInt32BE(320, 20);
class NativeFormData {
    constructor() { this.parts = []; }
    append(...args) { assert.equal(args.length, 2); this.parts.push(args); }
    getParts() { return this.parts; }
}
class Reader {
    readAsDataURL(blob) { blob.arrayBuffer().then(bytes => {
        this.result = 'data:' + blob.type + ';base64,' + Buffer.from(bytes).toString('base64');
        this.onload?.(); this.onloadend?.();
    }, error => { this.error = error; this.onerror?.(); }); }
}
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { resolve, promise }; };
async function act(fn = () => {}) { await Renderer.act(async () => { await fn(); for (let n = 0; n < 4; n++) await new Promise(resolve => setImmediate(resolve)); }); }
function text(n) { return typeof n === 'string' ? n : Array.isArray(n) ? n.map(text).join('') : text(n?.children ?? []); }
function button(ui, label) {
    const n = ui.root.findAll(n => typeof n.type === 'string' && typeof n.props.onPress === 'function' &&
        [n.props.accessibilityLabel, n.props.label, n.props.text, text(n)].includes(label))[0];
    assert.ok(n, 'button exists: ' + label); assert.notEqual(n.props.disabled, true); return n.props.onPress;
}
function scenario(t, options = {}) {
    const bytes = options.bytes ?? (options.gif ? Buffer.from(gifFixture({ width: 320, height: 320 })) : options.jpeg ? Buffer.from([255,216,255,224,0]) : png);
    const mime = options.gif ? 'image/gif' : options.jpeg ? 'image/jpeg' : 'image/png';
    const w = createWorld({ splitHTTP: true, curatedOnly: true,
        globals: { FileReader: Reader, FormData: NativeFormData },
        fetch: options.fetch ?? (() => new Response(bytes, { headers: { 'content-type': mime } })),
        http: async (method, input) => {
            if (method === 'get') return options.read ? options.read(input) : { status: 200, body: [] };
            assert.equal(method, 'post');
            assert.ok(/^\/guilds\/\d+\/(stickers|emojis)$/.test(input.url));
            return options.post ? options.post(input) : { status: 201, body: { id: CREATED, name: 'renamed' } };
        } });
    for (let i = w.modules.length - 1; i >= 0; i--)
        if (w.modules[i]?.createGuildSticker || w.modules[i]?.uploadEmoji) w.modules.splice(i, 1);
    const renders = [], writes = [], deletes = [], crops = [], cleans = [], nativePosts = [];
    const files = { async writeFile(dir, name, data, encoding) {
        writes.push({ dir, name, data, encoding }); return options.write ? options.write(name) : '/cache/' + name;
    }, async removeFile(dir, name) { deletes.push({ dir, name }); } };
    // This API is the only file module: no Metro barrel or RN.NativeModules entry.
    w.U.discord.native = { FileModule: files };
    if (!options.noCropper) w.addModule({ async launchCropper(input) {
        crops.push(input); if (options.crop) return options.crop(input);
        return { path: '/crop/result.png', data: png.toString('base64') };
    }, async cleanSingle(path) { cleans.push(path); } });
    w.expectedErrors = 0;
    w.native = { async createGuildSticker(input) { nativePosts.push(input); return { id: CREATED }; },
        async uploadEmoji(input) { nativePosts.push(input); return { id: CREATED }; } };
    w.mount = async element => { let ui; await act(() => { ui = Renderer.create(element); }); renders.push(ui); return ui; };
    w.open = async (kind, { choose = true } = {}) => {
        const item = w.loaded.get(kind) ?? await w.start(kind), Row = w.U.discord.design.Design.ActionSheetRow;
        const attachment = { filename: 'image.' + (options.gif ? 'gif' : options.jpeg ? 'jpg' : 'png'), content_type: mime,
            url: 'https://cdn.discordapp.com/attachments/1/2/image.' + (options.gif ? 'gif' : 'png') + '?ex=expiry&hm=signature' };
        const context = kind === 'save-as-sticker' ? { message: { attachments: [attachment] } }
            : { emojiNode: { id: EMOJI, name: 'pony', animated: !!options.gif } };
        const module = await w.sheets.openLazy(Promise.resolve({ default: () => h(w.RN.View, null,
            [h(Row, { key: 'original', label: 'Original item', onPress() {} })]) }), kind === 'save-as-sticker' ? 'MessageLongPressActionSheet' : 'MessageEmojiActionSheet', context);
        const menu = await w.mount(h(module.default, context));
        await act(button(menu, kind === 'save-as-sticker' ? 'Save as Sticker' : 'Stealmoji · Add / save emoji'));
        let ui;
        const panel = w.alerts.at(-1);
        if (panel && /Picker\.panel\./.test(panel[0])) ui = await w.mount(panel[1]);
        else { const entry = w.openedSheets.at(-1), picker = await entry.promise; ui = await w.mount(h(picker.default, entry.context)); }
        if (!choose) return { item, ui };
        await act(button(ui, 'Test Guild'));
        const field = ui.root.findAll(n => n.type === 'TextInput' && n.props.placeholder === (kind === 'save-as-sticker' ? 'Sticker name' : 'Emoji name'))[0];
        assert.ok(field); await act(() => field.props.onChangeText('renamed'));
        return { item, ui, submit: button(ui, kind === 'save-as-sticker' ? 'Add sticker' : 'Add emoji') };
    };
    w.posts = () => w.calls.filter(c => c[0] === 'http' && c[1] === 'post');
    w.submit = async open => { await act(() => { void open.submit(); }); await act(() => w.advance(300)); };
    Object.assign(w, { bytes, writes, deletes, crops, cleans, nativePosts });
    t.after(async () => {
        for (const ui of renders.reverse()) await act(() => ui.unmount());
        for (const item of [...w.loaded.values()].reverse()) await act(() => w.stop(item));
        assert.equal(w.errors.length, w.expectedErrors);
        assert.equal(w.timers.size, 0); assert.equal(w.registeredScreens.size, 0);
        assert.deepEqual(deletes.map(x => x.name).sort(), writes.map(x => x.name).sort(), 'owned temporary files are cleaned');
        assert.ok(deletes.every(x => x.dir === 'cache' && x.name.startsWith('save-as-sticker-')));
    });
    return w;
}

for (const gif of [false, true]) test('SaveAsSticker uploads ' + (gif ? 'animated GIF' : 'PNG') + ' without Discord’s sticker upload module', async t => {
    const w = scenario(t, { gif }), open = await w.open('save-as-sticker');
    w.modules.unshift({ get() {}, post() { assert.fail('unrelated HTTP barrel'); }, del() {} });
    assert.equal(w.posts().length, 0); await w.submit(open);
    assert.equal(w.posts().length, 1); assert.equal(w.nativePosts.length, 0);
    const input = w.posts()[0][2], parts = input.body.getParts();
    assert.equal(input.url, '/guilds/' + GUILD + '/stickers');
    assert.equal(input.failImmediatelyWhenRateLimited, true);
    assert.equal(parts.find(([name]) => name === 'name')[1], 'renamed');
    assert.equal(parts.find(([name]) => name === 'tags')[1], 'slight_smile');
    const file = parts.find(([name]) => name === 'file')[1];
    assert.equal(file.type, gif ? 'image/gif' : 'image/png'); assert.match(file.uri, /^file:\/\/\/cache\/save-as-sticker-/);
    assert.equal(w.writes[0].data, w.bytes.toString('base64')); assert.equal(w.crops.length, 0);
    assert.ok(w.toasts.includes('Sticker added to Test Guild'));
});

for (const format of ['png', 'jpeg']) test('SaveAsSticker prepares a real ' + format + ' without any native cropper', async t => {
    const { encode, decode } = await import('fast-png'), jpeg = require('jpeg-js');
    const data = new Uint8Array(80 * 40 * 4); for (let p = 0; p < data.length; p += 4) data.set([255,0,0,255],p);
    const raw = { width: 80, height: 40, data, depth: 8, channels: 4 };
    const bytes = format === 'png' ? encode(raw) : jpeg.encode(raw,95).data;
    const w = scenario(t, { bytes, jpeg: format === 'jpeg', noCropper: true }), open = await w.open('save-as-sticker');
    await w.submit(open);
    assert.equal(w.posts().length,1); assert.equal(w.crops.length,0); assert.equal(w.writes.length,1);
    const result = decode(Buffer.from(w.writes[0].data,'base64'), { checkCrc: true });
    assert.equal(result.width,320); assert.equal(result.height,320); assert.equal(result.channels,4);
    assert.equal(result.data[(20 * 320 + 160) * 4 + 3],0,'padding remains transparent');
    assert.ok(result.data[(160 * 320 + 160) * 4] > 240,'image pixels survive the conversion');
    assert.ok(Buffer.from(w.writes[0].data,'base64').length < 512 * 1024);
    assert.ok(w.toasts.includes('Sticker added to Test Guild'));
});

test('SaveAsSticker still prepares JPEG when the native cropper exists but rejects opening', async t => {
    const jpeg = require('jpeg-js'), data = new Uint8Array(4 * 4 * 4).fill(255);
    const bytes = jpeg.encode({ width: 4, height: 4, data },95).data;
    const w = scenario(t, { bytes, jpeg: true, crop: async () => { throw new Error('Native cropper unavailable'); } });
    const open = await w.open('save-as-sticker'); await w.submit(open);
    assert.equal(w.crops.length,1); assert.equal(w.posts().length,1); assert.equal(w.writes.length,2);
    assert.ok(w.toasts.includes('Sticker added to Test Guild'));
});

test('SaveAsSticker crops static media and cleans both input/output files through the REST path', async t => {
    const w = scenario(t, { jpeg: true }), open = await w.open('save-as-sticker'); await w.submit(open);
    assert.equal(w.posts().length, 1); assert.equal(w.crops.length, 1); assert.equal(w.writes.length, 2); assert.equal(w.cleans.length, 1);
    assert.equal(w.posts()[0][2].body.getParts().find(([name]) => name === 'file')[1].type, 'image/png');
});

for (const gif of [false, true]) test('Stealmoji uploads ' + (gif ? 'animated GIF' : 'static PNG') + ' without Discord’s emoji upload module', async t => {
    const w = scenario(t, { gif }), open = await w.open('stealmoji'); await w.submit(open);
    assert.equal(w.posts().length, 1); const input = w.posts()[0][2];
    assert.equal(input.url, '/guilds/' + GUILD + '/emojis'); assert.equal(input.body.name, 'renamed');
    assert.equal(input.body.image, 'data:' + (gif ? 'image/gif' : 'image/png') + ';base64,' + w.bytes.toString('base64'));
    assert.deepEqual(Array.from(input.body.roles), []); assert.equal(input.failImmediatelyWhenRateLimited, true);
    assert.ok(w.toasts.includes('renamed added to Test Guild.')); assert.equal(w.writes.length, 0);
});

for (const kind of ['save-as-sticker', 'stealmoji']) {
    for (const shape of ['text', 'data', 'empty']) test(kind + ' confirms a ' + shape + ' response with exactly one upload', async t => {
        const rows = [{ id: 'old', name: 'renamed' }];
        const w = scenario(t, {
            read: () => ({ body: JSON.stringify(rows) }),
            post: () => { rows.push({ id: CREATED, name: 'renamed', user: { id: ACCOUNT } });
                return shape === 'text' ? { status: 201, text: JSON.stringify(rows.at(-1)) }
                    : shape === 'data' ? { status: 201, data: rows.at(-1) } : { status: 201 }; },
        });
        const open = await w.open(kind); await w.submit(open);
        assert.equal(w.posts().length,1);
        assert.ok(w.toasts.some(value => /^(Sticker added|renamed added)/.test(value)));
        assert.equal(w.calls.filter(c => c[0] === 'http' && c[1] === 'get').length,shape === 'empty' ? 2 : 1);
    });
    test(kind + ' gives a long server list its own bounded scroll area with fixed header and search', async t => {
        const w = scenario(t);
        for (let n = 0; n < 195; n++) { const id = String(500000000000000000n + BigInt(n));
            w.guilds[id] = { id, name: 'Server ' + String(n).padStart(3,'0'), ownerId: ACCOUNT }; }
        const { ui } = await w.open(kind,{ choose: false });
        const modal = ui.root.findByType('Modal'), list = ui.root.findByType('FlatList');
        assert.equal(modal.props.visible,true); assert.equal(ui.root.findAllByType('ScrollView').length,0);
        assert.equal(ui.root.findAllByType('ActionSheet').length,0);
        assert.equal(ui.root.findByType(w.RN.FlatList).props.data.length,196);
        assert.equal(list.props.removeClippedSubviews,false);
        const field = ui.root.findAll(n => n.type === 'TextInput' && /Search server/.test(n.props.placeholder))[0];
        assert.ok(field); await act(() => field.props.onChangeText('Server 170'));
        assert.equal(ui.root.findByType('FlatList'),list,'search does not remount the scrolling list');
        assert.equal(ui.root.findByType(w.RN.FlatList).props.data.length,1);
        await act(button(ui,'Server 170'));
        assert.equal(ui.root.findAllByType('FlatList').length,0);
        await act(button(ui,'Choose another server'));
        assert.equal(ui.root.findAllByType('FlatList').length,1);
        assert.equal(w.posts().length,0);
    });
    for (const closeMethod of ['Close', 'Android Back', 'Backdrop', 'Disable'])
    test(kind + ' closes and reopens its native picker using ' + closeMethod, async t => {
        const w = scenario(t);
        w.U.discord.actions.AlertActionCreators.dismissAlert = () => { throw new Error('retained alert host'); };
        const opened = await w.open(kind,{ choose: false }), key = w.alerts.at(-1)[0];
        if (closeMethod === 'Close') await act(button(opened.ui,'Close'));
        if (closeMethod === 'Android Back') await act(opened.ui.root.findByType('Modal').props.onRequestClose);
        if (closeMethod === 'Backdrop') await act(button(opened.ui,kind === 'save-as-sticker' ? 'Close sticker picker' : 'Close emoji picker'));
        if (closeMethod === 'Disable') await act(() => w.stop(opened.item));
        assert.equal(opened.ui.toJSON(),null,'dismissal hides the native Modal even if its alert node remains');
        const reopened = await w.open(kind,{ choose: false });
        assert.equal(reopened.ui.root.findByType('Modal').props.visible,true);
        assert.notEqual(w.alerts.at(-1)[0],key);
        assert.equal(w.posts().length,0);
    });
    test(kind + ' keeps dark Discord text readable when the system theme is light', async t => {
        const w = scenario(t); w.RN.Appearance.getColorScheme = () => 'light';
        const open = await w.open(kind);
        const label = open.ui.root.findAll(n => n.type === 'Text' && text(n) === 'Server: Test Guild')[0];
        assert.ok(label); assert.equal(w.RN.StyleSheet.flatten(label.props.style).color, '#f2f3f5');
    });
    test(kind + ' discovers a native action loaded after opening and does not also POST', async t => {
        const w = scenario(t), open = await w.open(kind); w.addModule(w.native); await w.submit(open);
        assert.equal(w.nativePosts.length, 1); assert.equal(w.posts().length, 0);
    });
    for (const result of [{ status: 429, body: { message: 'Upload rate limited' } }, { status: 200, body: {} }])
    test(kind + ' rejects unconfirmed REST creation without retry: ' + JSON.stringify(result), async t => {
        const w = scenario(t, { post: () => result }), open = await w.open(kind);
        if (kind === 'save-as-sticker') w.expectedErrors = 1;
        await w.submit(open); assert.equal(w.posts().length, 1);
        assert.equal(w.toasts.some(value => /^(Sticker added|renamed added)/.test(value)), false);
        const shown = kind === 'save-as-sticker' ? JSON.stringify(w.alerts) : text(open.ui.toJSON());
        assert.match(shown, /rate limit|did not confirm/i);
    });
    test(kind + ' blocks a pending upload after the Discord account changes', async t => {
        const gate = deferred(), w = scenario(t, { fetch: () => gate.promise }), open = await w.open(kind);
        await w.submit(open); await act(() => w.setAccount(FRIEND));
        gate.resolve(new Response(png, { headers: { 'content-type': 'image/png' } })); await act();
        assert.equal(w.posts().length, 0); assert.equal(w.nativePosts.length, 0);
    });
    test(kind + ' rechecks permission after image preparation', async t => {
        const gate = deferred(), w = scenario(t, { fetch: () => gate.promise }), open = await w.open(kind);
        if (kind === 'save-as-sticker') w.expectedErrors = 1;
        await w.submit(open); w.guilds[GUILD].ownerId = FRIEND; w.stores.PermissionStore.can = () => false;
        gate.resolve(new Response(png, { headers: { 'content-type': 'image/png' } })); await act();
        assert.equal(w.posts().length, 0); assert.equal(w.nativePosts.length, 0);
    });
    test(kind + ' rapid confirmations dispatch one REST write', async t => {
        const gate = deferred(), w = scenario(t, { post: () => gate.promise }), open = await w.open(kind);
        await w.submit(open); await act(() => { void open.submit(); });
        assert.equal(w.posts().length, 1);
        gate.resolve({ status: 201, body: { id: CREATED } }); await act(); assert.equal(w.posts().length, 1);
    });
}
