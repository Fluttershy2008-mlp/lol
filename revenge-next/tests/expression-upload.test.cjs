'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createWorld, React, Renderer, ACCOUNT, FRIEND, GUILD } = require('./next-harness.cjs');
const { gifFixture } = require('../../save-as-sticker/tests/gif-fixture.mjs');
const { installServerPanelHost } = require('../../valenced/tests/server-info-fixture.cjs');
const { installNavigationHost } = require('./navigation-fixture.cjs');
const VALENCED = process.env.PLUGIN_TEST_TARGET === 'valenced';
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
function pickerCount(ui) {
    return ui.root.findAllByType('Modal').length + ui.root.findAll(n => n.type === 'View' && n.props.testID === 'StealmojiPage').length;
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
    if (options.nativeHost) w.panelHost = installServerPanelHost(w, { dismissMode: options.nativeHost });
    if (VALENCED) w.pageHost = installNavigationHost(w, { loadSettingsOnOpen: !!options.loadSettingsOnOpen });
    w.mount = async element => { let ui; await act(() => { ui = Renderer.create(element); }); renders.push(ui); return ui; };
    w.open = async (kind, { choose = true, advance = true } = {}) => {
        w.pageMode = VALENCED && kind === 'stealmoji';
        if (w.pageMode && !w.pageRoot) w.pageRoot = await w.mount(h(w.pageHost.Root));
        if (w.panelHost && !w.panelRoot) w.panelRoot = await w.mount(h(w.panelHost.Root));
        const item = w.loaded.get(kind) ?? await w.start(kind), Row = w.U.discord.design.Design.ActionSheetRow;
        const attachment = { filename: 'image.' + (options.gif ? 'gif' : options.jpeg ? 'jpg' : 'png'), content_type: mime,
            url: 'https://cdn.discordapp.com/attachments/1/2/image.' + (options.gif ? 'gif' : 'png') + '?ex=expiry&hm=signature' };
        const context = kind === 'save-as-sticker' ? { message: { attachments: [attachment] } }
            : { emojiNode: { id: EMOJI, name: 'pony', animated: !!options.gif } };
        const module = await w.sheets.openLazy(Promise.resolve({ default: () => h(w.RN.View, null,
            [h(Row, { key: 'original', label: 'Original item', onPress() {} })]) }), kind === 'save-as-sticker' ? 'MessageLongPressActionSheet' : 'MessageEmojiActionSheet', context);
        const menu = await w.mount(h(module.default, context));
        await act(button(menu, kind === 'save-as-sticker' ? 'Save as Sticker' : 'Stealmoji · Add / save emoji'));
        if (w.pageMode && advance) await act(() => w.advance(350));
        let ui;
        const panel = w.alerts.at(-1);
        if (w.pageMode) ui = w.pageRoot;
        else if (panel && /Picker\.panel\./.test(panel[0])) ui = w.panelRoot ?? await w.mount(panel[1]);
        else { const entry = w.openedSheets.at(-1), picker = await entry.promise; ui = await w.mount(h(picker.default, entry.context)); }
        if (!choose) return { item, ui };
        await act(button(ui, 'Test Guild'));
        const field = ui.root.findAll(n => n.type === 'TextInput' && n.props.placeholder === (kind === 'save-as-sticker' ? 'Sticker name' : 'Emoji name'))[0];
        assert.ok(field); await act(() => field.props.onChangeText('renamed'));
        return { item, ui, submit: button(ui, kind === 'save-as-sticker' ? 'Add sticker' : 'Add emoji') };
    };
    w.posts = () => w.calls.filter(c => c[0] === 'http' && c[1] === 'post');
    w.pickerKey = () => w.pageMode ? w.navigation.getCurrentRoute().params.__stealmojiPage : w.alerts.at(-1)[0];
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
        const list = ui.root.findByType('FlatList');
        if (w.pageMode) assert.equal(ui.root.findAllByType('Modal').length,0);
        else assert.equal(ui.root.findByType('Modal').props.visible,true);
        assert.equal(pickerCount(ui),1); assert.equal(ui.root.findAllByType('ScrollView').length,0);
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
    for (const closeMethod of ['Close', 'Android Back', 'Backdrop', 'Disable']) {
    if (VALENCED && kind === 'stealmoji' && closeMethod === 'Backdrop') continue; // A normal page has no backdrop.
    test(kind + ' closes and reopens its native picker using ' + closeMethod, async t => {
        const w = scenario(t);
        w.U.discord.actions.AlertActionCreators.dismissAlert = () => { throw new Error('retained alert host'); };
        const opened = await w.open(kind,{ choose: false }), key = w.pickerKey();
        if (closeMethod === 'Close') await act(button(opened.ui,'Close'));
        if (closeMethod === 'Android Back') await act(w.pageMode ? () => w.navigation.goBack() : opened.ui.root.findByType('Modal').props.onRequestClose);
        if (closeMethod === 'Backdrop') await act(button(opened.ui,kind === 'save-as-sticker' ? 'Close sticker picker' : 'Close emoji picker'));
        if (closeMethod === 'Disable') await act(() => w.stop(opened.item));
        assert.equal(pickerCount(opened.ui),0,'the picker closes even if the alert host retains nodes');
        const reopened = await w.open(kind,{ choose: false });
        assert.equal(pickerCount(reopened.ui),1);
        assert.notEqual(w.pickerKey(),key);
        assert.equal(w.posts().length,0);
    });
    }
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

for (const mode of ['retain', 'throw']) test('Stealmoji returns from its picker after copying an emoji with ' + mode + ' alert dismissal', async t => {
    const w = scenario(t,{ nativeHost: mode });
    const { ui, submit } = await w.open('stealmoji');
    const key = w.pickerKey(), close = button(ui,'Close');
    w.U.discord.actions.AlertActionCreators.openAlert('unrelated-alert',h(w.RN.Text,null,'Unrelated alert'));
    await w.submit({ submit });
    assert.equal(w.posts().length,1); assert.equal(pickerCount(ui),0);
    assert.equal(w.panelHost.nodes.has(key),false,'the alert entry and its possible input-blocking host must be removed');
    assert.equal(w.panelHost.nodes.has('unrelated-alert'),true);
    assert.ok(w.toasts.includes('renamed added to Test Guild.'));
    const reopened = await w.open('stealmoji',{ choose: false });
    await act(close); assert.equal(pickerCount(reopened.ui),1,'a stale Close must not close a new picker');
    await act(button(reopened.ui,'Close'));
    assert.deepEqual([...w.panelHost.nodes.keys()],['unrelated-alert']);
});

for (const tool of ['Copy emoji link','Copy image','Save image']) test('Stealmoji releases the picker after ' + tool, async t => {
    const w = scenario(t,{ nativeHost: 'retain' });
    if (tool === 'Copy emoji link') w.RN.Keyboard.dismiss = () => { throw new Error('Stale native input'); };
    if (tool === 'Copy image') w.RN.Platform.OS = 'ios';
    const { ui } = await w.open('stealmoji',{ choose: false });
    await act(button(ui,'Emoji tools')); await act(button(ui,tool));
    assert.equal(pickerCount(ui),0); assert.equal(w.panelHost.nodes.size,0);
    assert.equal(w.posts().length,0);
    if (tool === 'Copy emoji link') assert.match(w.clipboard.at(-1),new RegExp('/emojis/' + EMOJI));
    if (tool === 'Copy image') assert.equal(w.calls.filter(c => c[0] === 'copyImage').length,1);
    if (tool === 'Save image') assert.equal(w.calls.filter(c => c[0] === 'downloadMedia').length,1);
});

test('Stealmoji can close a pending write and a late success cannot block the reopened picker', async t => {
    const gate = deferred(), w = scenario(t,{ nativeHost: 'retain', post: () => gate.promise });
    const open = await w.open('stealmoji'); await w.submit(open); assert.equal(w.posts().length,1);
    await act(button(open.ui,'Close')); assert.equal(w.panelHost.nodes.size,0);
    const fresh = await w.open('stealmoji',{ choose: false });
    gate.resolve({ status: 201, body: { id: CREATED } }); await act();
    assert.equal(pickerCount(fresh.ui),1);
    assert.equal(w.posts().length,1); assert.equal(w.toasts.some(value => /renamed added/.test(value)),false);
    assert.equal(w.timers.size,0);
});

test('Stealmoji bounds an upload that completed remotely but never returns a response', async t => {
    const gate = deferred(), w = scenario(t,{ nativeHost: 'retain', post: () => gate.promise });
    const open = await w.open('stealmoji'); await w.submit(open);
    assert.ok(button(open.ui,'Close'),'Close remains available while Discord is pending');
    await act(() => w.advance(45000));
    assert.match(text(open.ui.toJSON()),/response timed out/); assert.equal(w.posts().length,1);
    assert.equal(w.timers.size,0); await act(button(open.ui,'Close'));
    assert.equal(w.panelHost.nodes.size,0);
    gate.resolve({ status: 201, body: { id: CREATED } }); await act();
    assert.equal(w.toasts.some(value => /renamed added/.test(value)),false);
});

test('Stealmoji cancels a download on Close and cannot upload its late image', async t => {
    const gate = deferred(); let signal;
    const w = scenario(t,{ nativeHost: 'retain', fetch: (_url, options) => { signal = options.signal; return gate.promise; } });
    const open = await w.open('stealmoji'); await w.submit(open);
    await act(button(open.ui,'Close')); assert.equal(signal.aborted,true);
    assert.equal(w.panelHost.nodes.size,0); assert.equal(w.timers.size,0);
    const fresh = await w.open('stealmoji',{ choose: false });
    gate.resolve(new Response(png,{ headers: { 'content-type': 'image/png' } })); await act();
    assert.equal(w.posts().length,0); assert.equal(pickerCount(fresh.ui),1);
});

test('Stealmoji cancels a preflight read before any write when its picker closes', async t => {
    const gate = deferred(), w = scenario(t,{ nativeHost: 'retain', read: () => gate.promise });
    const open = await w.open('stealmoji'); await w.submit(open);
    await act(button(open.ui,'Close'));
    gate.resolve({ status: 200, body: [] }); await act();
    assert.equal(w.posts().length,0); assert.equal(w.panelHost.nodes.size,0); assert.equal(w.timers.size,0);
});

test('Stealmoji opens the native image viewer after closing its own modal', async t => {
    const w = scenario(t,{ nativeHost: 'retain' }), { ui } = await w.open('stealmoji',{ choose: false });
    await act(button(ui,'Emoji tools')); await act(button(ui,'View emoji'));
    assert.equal(w.panelHost.nodes.size,0); assert.equal(w.calls.filter(c => c[0] === 'openMedia').length,0);
    await act(() => w.advance(350)); assert.equal(w.calls.filter(c => c[0] === 'openMedia').length,1);
    assert.equal(w.timers.size,0);
});

test('Stealmoji stops a delayed viewer and a stalled upload when disabled', async t => {
    const w = scenario(t,{ nativeHost: 'retain' }), first = await w.open('stealmoji',{ choose: false });
    await act(button(first.ui,'Emoji tools')); await act(button(first.ui,'View emoji'));
    await act(() => w.stop(first.item)); await act(() => w.advance(1000));
    assert.equal(w.calls.filter(c => c[0] === 'openMedia').length,0); assert.equal(w.timers.size,0);
    const gate = deferred(); w.addModule({ uploadEmoji: () => gate.promise });
    const second = await w.open('stealmoji'); await w.submit(second); await act(() => w.stop(second.item));
    assert.equal(w.panelHost.nodes.size,0); assert.equal(w.timers.size,0);
    gate.resolve({ id: CREATED }); await act(); assert.equal(w.toasts.some(value => /renamed added/.test(value)),false);
});

test('Stealmoji keeps one write in flight after Close while the rest of the picker remains usable', async t => {
    const gate = deferred(), w = scenario(t,{ nativeHost: 'retain', post: () => gate.promise });
    const first = await w.open('stealmoji'); await w.submit(first); await act(button(first.ui,'Close'));
    const fresh = await w.open('stealmoji',{ choose: false }); await act(button(fresh.ui,'Test Guild'));
    assert.match(text(fresh.ui.toJSON()),/already in progress/); assert.equal(w.posts().length,1);
    assert.ok(button(fresh.ui,'Close')); gate.resolve({ status: 201, body: { id: CREATED } }); await act();
    assert.equal(pickerCount(fresh.ui),1); assert.equal(w.timers.size,0);
    assert.equal(w.toasts.some(value => /renamed added/.test(value)),false);
    await act(button(fresh.ui,'Test Guild'));
    assert.ok(fresh.ui.root.findAll(n => n.type === 'TextInput' && n.props.placeholder === 'Emoji name').length);
    assert.equal(w.posts().length,1,'choosing a server does not repeat the previous write');
});

test('Stealmoji bounds a stalled clipboard action and can close without waiting for its late result', async t => {
    const gate = deferred(), w = scenario(t,{ nativeHost: 'retain' });
    w.U.externals.ReactNativeClipboard.Clipboard.setString = () => gate.promise;
    const { ui } = await w.open('stealmoji',{ choose: false }); await act(button(ui,'Emoji tools'));
    await act(() => { void button(ui,'Copy emoji link')(); }); assert.ok(button(ui,'Close'));
    await act(() => w.advance(15000)); assert.match(text(ui.toJSON()),/action timed out/);
    await act(button(ui,'Close')); assert.equal(w.panelHost.nodes.size,0); assert.equal(w.timers.size,0);
    gate.resolve(); await act(); assert.equal(w.toasts.includes('Emoji link copied.'),false);
});

test('Stealmoji cancels a delayed image viewer when another picker has already opened', async t => {
    const w = scenario(t,{ nativeHost: 'retain' }), first = await w.open('stealmoji',{ choose: false });
    await act(button(first.ui,'Emoji tools')); await act(button(first.ui,'View emoji'));
    const fresh = await w.open('stealmoji',{ choose: false }); await act(() => w.advance(350));
    assert.equal(w.calls.filter(c => c[0] === 'openMedia').length,0);
    assert.equal(pickerCount(fresh.ui),1); assert.equal(w.timers.size,0);
});

if (VALENCED) {
    test('Valenced Stealmoji uses a regular page with no alert, Modal or second action sheet', async t => {
        const w = scenario(t);
        w.RN.Modal = () => { assert.fail('Stealmoji must not open an OS modal'); };
        w.U.discord.actions.AlertActionCreators.openAlert = () => { assert.fail('Stealmoji must not open an alert host'); };
        const { ui } = await w.open('stealmoji',{ choose: false });
        assert.equal(pickerCount(ui),1); assert.equal(ui.root.findAllByType('Modal').length,0);
        assert.equal(w.alerts.length,0); assert.equal(w.openedSheets.length,1,'only the original Discord menu opens');
        assert.match(w.navigation.getCurrentRoute().name,/stealmoji\.legacy-page$/);
        assert.equal(w.pageHost.roots.at(-1).name,'settings');
        assert.deepEqual(w.pageHost.unhandled,[],'the custom settings route must not be sent to the root navigator');
        await act(button(ui,'Close'));
        assert.equal(w.navigation.getCurrentRoute().name,'Chat'); assert.equal(w.pageHost.subscribers.size,0);
        await act(button(ui,'Discord test control')); assert.equal(w.pageHost.taps(),1);
    });

    test('Valenced Stealmoji repeatedly uploads and returns to a responsive Discord screen', async t => {
        const w = scenario(t), guildListeners = w.stores.GuildStore.listeners.size;
        for (let n = 0; n < 8; n++) {
            const open = await w.open('stealmoji'); await w.submit(open);
            assert.equal(w.posts().length,n + 1); assert.equal(w.pageHost.stack.length,1);
            assert.equal(pickerCount(open.ui),0); assert.equal(w.pageHost.subscribers.size,0);
            assert.equal(w.stores.GuildStore.listeners.size,guildListeners); assert.equal(w.timers.size,0);
            await act(button(open.ui,'Discord test control'));
        }
        assert.equal(w.pageHost.taps(),8); assert.equal(w.alerts.length,0);
    });

    test('Valenced Stealmoji Android Back cancels preparation without leaving a window over Discord', async t => {
        const gate = deferred(); let signal;
        const w = scenario(t,{ fetch: (_url, options) => { signal = options.signal; return gate.promise; } });
        const open = await w.open('stealmoji'); await w.submit(open);
        await act(() => w.navigation.goBack());
        assert.equal(signal.aborted,true); assert.equal(w.timers.size,0); assert.equal(pickerCount(open.ui),0);
        await act(button(open.ui,'Discord test control'));
        gate.resolve(new Response(png,{ headers: { 'content-type': 'image/png' } })); await act();
        assert.equal(w.posts().length,0); assert.equal(w.pageHost.taps(),1); assert.equal(w.alerts.length,0);
    });

    test('Valenced Stealmoji late success cannot pop an unrelated Discord page', async t => {
        const gate = deferred(), w = scenario(t,{ post: () => gate.promise });
        const open = await w.open('stealmoji'); await w.submit(open);
        await act(() => w.navigation.navigate('UserProfile',{ userId: FRIEND }));
        const backCalls = w.calls.filter(c => c[0] === 'goBack').length;
        gate.resolve({ status: 201, body: { id: CREATED } }); await act();
        assert.equal(w.navigation.getCurrentRoute().name,'UserProfile');
        assert.equal(w.calls.filter(c => c[0] === 'goBack').length,backCalls);
        assert.equal(w.toasts.some(value => /renamed added/.test(value)),false);
        await act(button(open.ui,'Discord test control')); assert.equal(w.pageHost.taps(),1);
        await act(() => w.navigation.goBack());
        assert.equal(w.navigation.getCurrentRoute().name,'Chat','returning through an inactive picker removes only that picker');
        assert.equal(w.pageHost.subscribers.size,0);
    });

    test('Valenced Stealmoji disable cancels a queued page opening', async t => {
        const w = scenario(t), open = await w.open('stealmoji',{ choose: false, advance: false });
        await act(() => w.stop(open.item)); await act(() => w.advance(1000));
        assert.equal(w.navigation.getCurrentRoute().name,'Chat'); assert.equal(w.registeredScreens.size,0);
        assert.equal(w.pageHost.subscribers.size,0); assert.equal(w.timers.size,0); assert.equal(w.alerts.length,0);
        await act(button(open.ui,'Discord test control')); assert.equal(w.pageHost.taps(),1);
    });

    test('Valenced Stealmoji stops a page waiting for native settings registration', async t => {
        const w = scenario(t); w.setSettingsLoaded(false);
        const open = await w.open('stealmoji',{ choose: false });
        await act(() => w.stop(open.item)); await act(() => w.setSettingsLoaded(true)); await act(() => w.advance(1000));
        assert.equal(pickerCount(open.ui),0); assert.equal(w.registeredScreens.size,0);
        assert.equal(w.pageHost.subscribers.size,0); assert.equal(w.timers.size,0); assert.equal(w.alerts.length,0);
    });

    test('Valenced Stealmoji expires a page that never mounts and safely handles delayed registration', async t => {
        const w = scenario(t); w.setSettingsLoaded(false);
        const open = await w.open('stealmoji',{ choose: false }); await act(() => w.advance(8000));
        assert.ok(w.toasts.some(value => /page did not open/.test(value)));
        assert.equal(w.pageHost.subscribers.size,0); assert.equal(w.timers.size,0);
        await act(() => w.setSettingsLoaded(true)); await act(() => w.advance(0));
        assert.equal(w.navigation.getCurrentRoute().name,'SettingsOverview','a stale native registration must not open a cancelled page');
        const fresh = await w.open('stealmoji',{ choose: false });
        assert.equal(pickerCount(fresh.ui),1); await act(button(fresh.ui,'Close'));
        assert.equal(w.navigation.getCurrentRoute().name,'SettingsOverview'); assert.equal(w.alerts.length,0);
    });

    test('Valenced Stealmoji loads the Settings navigator before waiting for its cold modules', async t => {
        const w = scenario(t,{ loadSettingsOnOpen: true }); w.setSettingsLoaded(false);
        const open = await w.open('stealmoji',{ choose: false });
        assert.equal(pickerCount(open.ui),1); assert.deepEqual(w.pageHost.unhandled,[]);
        assert.equal(w.navigation.getRootState().routes.at(-1).name,'settings');
        assert.equal(w.timers.size,0); assert.equal(w.toasts.length,0);
        await act(button(open.ui,'Close'));
        assert.equal(w.navigation.getCurrentRoute().name,'SettingsOverview');
        await act(() => w.navigation.goBack()); assert.equal(w.navigation.getCurrentRoute().name,'Chat');
    });

    test('Valenced Stealmoji opens from existing Settings and returns to that page', async t => {
        const w = scenario(t); w.navigation.navigate('settings');
        const previous = w.navigation.getCurrentRoute();
        const open = await w.open('stealmoji',{ choose: false });
        assert.equal(pickerCount(open.ui),1); assert.equal(w.pageHost.roots.length,2);
        await act(button(open.ui,'Close'));
        assert.equal(w.navigation.getCurrentRoute(),previous); assert.deepEqual(w.pageHost.unhandled,[]);
    });

    test('Valenced Stealmoji Back during a cold Settings load cancels any later page opening', async t => {
        const w = scenario(t); w.setSettingsLoaded(false);
        const open = await w.open('stealmoji',{ choose: false });
        assert.equal(w.navigation.getCurrentRoute().name,'SettingsOverview');
        await act(() => w.navigation.goBack()); assert.equal(w.navigation.getCurrentRoute().name,'Chat');
        await act(() => w.setSettingsLoaded(true)); await act(() => w.advance(10000));
        assert.equal(pickerCount(open.ui),0); assert.equal(w.navigation.getCurrentRoute().name,'Chat');
        assert.equal(w.toasts.length,0); assert.equal(w.timers.size,0); assert.equal(w.pageHost.subscribers.size,0);
        const fresh = await w.open('stealmoji',{ choose: false }); assert.equal(pickerCount(fresh.ui),1);
        await act(button(fresh.ui,'Close')); assert.equal(w.navigation.getCurrentRoute().name,'Chat');
    });

    test('Valenced Stealmoji disable between registration and navigation cancels the queued dispatch', async t => {
        const w = scenario(t), open = await w.open('stealmoji',{ choose: false, advance: false });
        // Run only the source's 350ms opener, leaving the adapter's 0ms task queued.
        const timers = [...w.timers.entries()];
        assert.equal(timers.length,1);
        w.timers.delete(timers[0][0]); await act(timers[0][1].fn);
        assert.equal(w.registeredScreens.size,1); assert.equal(w.navigation.getCurrentRoute().name,'Chat');
        await act(() => w.stop(open.item)); await act(() => w.advance(10000));
        assert.equal(w.navigation.getCurrentRoute().name,'Chat'); assert.equal(w.timers.size,0);
        assert.equal(w.registeredScreens.size,0); assert.equal(pickerCount(open.ui),0);
    });

    test('Valenced Stealmoji can identify its page through nested native navigation state', async t => {
        const w = scenario(t); delete w.navigation.getCurrentRoute;
        w.navigation.getRootState = () => ({ index: 0, routes: [{ name: 'Settings', state: { index: w.pageHost.stack.length - 1, routes: w.pageHost.stack } }] });
        const open = await w.open('stealmoji'); await w.submit(open);
        assert.equal(w.pageHost.stack.length,1); assert.equal(pickerCount(open.ui),0); assert.equal(w.alerts.length,0);
    });
}

if (VALENCED) test('Valenced Stealmoji never falls back to a window when page navigation is unavailable', async t => {
    const w = scenario(t);
    for (let n = w.modules.length - 1; n >= 0; n--) if (w.modules[n]?.getRootNavigationRef) w.modules.splice(n,1);
    w.RN.Modal = () => { assert.fail('No modal fallback on Valenced'); };
    w.U.discord.actions.AlertActionCreators.openAlert = () => { assert.fail('No alert fallback on Valenced'); };
    const open = await w.open('stealmoji',{ choose: false });
    assert.equal(pickerCount(open.ui),0); assert.ok(w.toasts.some(value => /plugin settings/.test(value)));
    assert.equal(w.alerts.length,0); assert.equal(w.openedSheets.length,1); assert.equal(w.pageHost.stack.length,1);
    const settings = await w.mount(h(open.item.options.SettingsComponent,{ api: open.item.api }));
    const field = settings.root.findAll(n => n.type === 'TextInput' && n.props.placeholder === '<:emoji:123456789012345678>')[0];
    await act(() => field.props.onChangeText('<:pony:' + EMOJI + '>'));
    await act(button(settings,'Use emoji')); await act(button(settings,'Test Guild'));
    await act(button(settings,'Add emoji')); assert.equal(w.posts().length,1);
    assert.equal(w.toasts.some(value => /pony added/.test(value)),true); assert.equal(w.alerts.length,0);
});
