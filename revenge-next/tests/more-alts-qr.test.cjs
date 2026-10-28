'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createWorld, React, Renderer } = require('./next-harness.cjs');
const { installSettingsSection } = require('../../valenced/tests/settings-fixture.cjs');
const { installColdWebViewModule } = require('../../more-alts/tests/webview-fixture.cjs');
const { installDiscordWebViewModule } = require('../../more-alts/tests/discord-webview-fixture.cjs');
const h = React.createElement;
const USER = { id: '100000000000000099', username: 'fixture-qr-account' };
const TOKEN = 'synthetic-qr-session-only-not-a-real-token';
const isValenced = process.env.PLUGIN_TEST_TARGET === 'valenced';
function button(ui, label) {
    const node = ui.root.findAll(n => typeof n.type === 'string' && typeof n.props.onPress === 'function'
        && n.props.accessibilityLabel === label)[0];
    assert.ok(node, 'button exists: ' + label); return node.props.onPress;
}
async function act(callback = () => {}) {
    await Renderer.act(async () => { await callback(); for (let n = 0; n < 5; n++) await Promise.resolve(); });
}
function completion(view) {
    return { nativeEvent: { url: 'https://discord.com/', data: JSON.stringify({ provider: 'more-alts-qr',
        session: view.props.source.html.match(/session:'([^']+)'/)[1], type: 'complete', token: TOKEN, userId: USER.id }) } };
}
function scenario(t) {
    const w = createWorld({ fetch(url) {
        assert.equal(url, 'https://discord.com/api/v9/users/@me');
        return new Response(JSON.stringify(USER), { headers: { 'content-type': 'application/json' } });
    } });
    const registry = installSettingsSection(w), renders = [];
    w.qrStops = []; w.badCalls = 0;
    w.WebView = React.forwardRef(function FixtureWebView(props, ref) {
        React.useImperativeHandle(ref, () => ({ injectJavaScript: script => w.qrStops.push(script) }), []);
        return h('WebView', props);
    });
    w.WebView.isFileUploadSupported = () => Promise.resolve(true);
    w.addWebView = (component = w.WebView, path) => {
        const namespace = Object.freeze({ __esModule: true, WebView: component, default: component });
        w.addModule(namespace, path); return namespace;
    };
    w.mount = async element => {
        let ui; await Renderer.act(async () => { ui = Renderer.create(element); }); renders.push(ui); return ui;
    };
    w.openManager = async () => {
        const item = await w.start('more-alts');
        const Page = isValenced ? w.registeredScreens.get('dev.fluttershy2008.more-alts.valenced-settings').screen.getComponent()
            : item.options.SettingsComponent;
        const ui = await w.mount(h(Page, { api: item.api }));
        await act(button(ui, 'Add another account'));
        return { item, ui };
    };
    w.browser = ui => ui.root.findAll(n => n.type === 'WebView')[0];
    t.after(async () => {
        for (const ui of renders.reverse()) await Renderer.act(async () => ui.unmount());
        for (const item of [...w.loaded.values()].reverse()) await w.stop(item);
        assert.equal(w.timers.size, 0);
        assert.equal(w.registeredScreens.size, 0);
        assert.equal(w.moduleWaiters.size, 0);
        assert.equal(w.pathWaiters.size, 0);
        assert.deepEqual(registry.section.settings, registry.core);
        assert.deepEqual(w.errors, []);
        assert.equal(w.calls.some(c => c[0] === 'switchAccount' || c[0] === 'login' || c[0] === 'logout'), false);
    });
    return w;
}

for (const shape of ['object', 'function']) test('More Alts QR ignores a translation ' + shape + ' exported as WebView', async t => {
    const w = scenario(t), message = { locale: 'en-US', ast: [{ type: 0, value: 'WebView' }] };
    w.addModule({ WebView: shape === 'object' ? message : function Translation() { w.badCalls++; return message; } });
    w.addWebView();
    const { ui } = await w.openManager();
    await act(button(ui, 'Log in with QR Code'));
    const view = w.browser(ui); assert.ok(view, 'the actual WebView renders');
    assert.match(view.props.source.html, /startRemoteAuth/);
    assert.equal(view.props.source.baseUrl, 'https://discord.com/');
    assert.equal(w.badCalls, 0); assert.equal(w.calls.some(c => c[0] === 'fetch'), false);
    assert.equal(view.props.onShouldStartLoadWithRequest({ url: 'https://example.invalid/' }), false);
    assert.equal(view.props.domStorageEnabled, false); assert.equal(view.props.allowFileAccess, false);
});

test('More Alts QR opens a memo/forward-ref WebView package', async t => {
    const w = scenario(t); w.addWebView(React.memo(w.WebView));
    const { ui } = await w.openManager(); await act(button(ui, 'Log in with QR Code'));
    assert.ok(w.browser(ui)); assert.ok(button(ui, 'Refresh QR code'));
});

test('More Alts QR opens the platform export by imported path or its native capability', async t => {
    const w = scenario(t); w.addModule({ WebView: () => ({ locale: 'en-US', ast: [] }) });
    w.addModule({ default: w.WebView }, 'react-native-webview');
    const { ui } = await w.openManager(); await act(button(ui, 'Log in with QR Code'));
    assert.ok(w.browser(ui));
});

test('More Alts QR verifies and saves only the approved account without switching accounts', async t => {
    const w = scenario(t); w.addModule({ WebView: { locale: 'en-US', ast: [] } }); w.addWebView();
    const { item, ui } = await w.openManager(); await act(button(ui, 'Log in with QR Code'));
    const view = w.browser(ui);
    await act(() => view.props.onMessage(completion(view)));
    assert.equal(item.api.jsonStorage.cache.accounts[USER.id].username, USER.username);
    assert.equal(w.calls.filter(c => c[0] === 'fetch').length, 1);
    assert.equal(ui.root.findAll(n => n.type === 'Modal').length, 0);
    assert.ok(w.qrStops.some(script => script.includes('stopMoreAltsQr')));
});

test('More Alts QR shows an inline error for translations alone and discovers a late real package', async t => {
    const w = scenario(t); w.addModule({ WebView: { locale: 'en-US', ast: [] } });
    const { ui } = await w.openManager(); await act(button(ui, 'Log in with QR Code'));
    assert.equal(w.browser(ui), undefined);
    assert.match(JSON.stringify(ui.toJSON()), /could not load Discord’s browser/);
    w.addWebView(); await act(button(ui, 'Log in with QR Code'));
    assert.ok(w.browser(ui), 'a failed lookup does not impose the generic five-second cooldown');
});

for (const close of ['Back', 'Close add account', 'Android Back']) test('More Alts QR stops and ignores approval after ' + close, async t => {
    const w = scenario(t); w.addWebView(); const { item, ui } = await w.openManager();
    await act(button(ui, 'Log in with QR Code')); const view = w.browser(ui), event = completion(view), onMessage = view.props.onMessage;
    await act(close === 'Android Back' ? ui.root.findByType('Modal').props.onRequestClose : button(ui, close));
    await act(() => onMessage(event));
    assert.equal(w.browser(ui), undefined); assert.equal(w.calls.some(c => c[0] === 'fetch'), false);
    assert.deepEqual(Object.keys(item.api.jsonStorage.cache.accounts), []); assert.equal(w.qrStops.length, 1);
});

test('More Alts QR refresh replaces its session and ignores old approval messages', async t => {
    const w = scenario(t); w.addWebView(); const { ui } = await w.openManager();
    await act(button(ui, 'Log in with QR Code')); const old = w.browser(ui), event = completion(old), onMessage = old.props.onMessage;
    await act(() => w.advance(3000)); await act(button(ui, 'Refresh QR code'));
    const current = w.browser(ui); assert.notEqual(completion(current).nativeEvent.data, event.nativeEvent.data);
    await act(() => onMessage(event)); assert.equal(w.calls.some(c => c[0] === 'fetch'), false);
    assert.equal(w.qrStops.length, 1);
});

test('More Alts QR stops and rejects saved approval callbacks after disable/restart', async t => {
    const w = scenario(t); w.addWebView(); const { item, ui } = await w.openManager();
    await act(button(ui, 'Log in with QR Code')); const view = w.browser(ui), event = completion(view), onMessage = view.props.onMessage;
    await act(() => w.stop(item)); await w.start('more-alts');
    await act(() => onMessage(event));
    assert.equal(w.calls.some(c => c[0] === 'fetch'), false); assert.equal(w.qrStops.length, 1);
});

test('More Alts QR failures stay inside the dialog and refresh can choose a healthy export', async t => {
    const w = scenario(t);
    w.addWebView(function BrokenWebView() { w.badCalls++; return { locale: 'en-US', ast: [] }; });
    const { ui } = await w.openManager(); await act(button(ui, 'Log in with QR Code'));
    assert.match(JSON.stringify(ui.toJSON()), /QR login view could not be displayed/);
    assert.ok(button(ui, 'Back')); assert.ok(button(ui, 'Close add account'));
    const before = w.badCalls;
    w.addWebView(); await act(() => w.advance(3000)); await act(button(ui, 'Refresh QR code'));
    assert.ok(w.browser(ui)); assert.equal(w.badCalls, before, 'the failed export is not rendered again');
    assert.equal(w.calls.some(c => c[0] === 'fetch'), false);
});

for (const legacyRegistry of [false, true]) test('More Alts QR initializes only its cold browser package with ' + (legacyRegistry ? 'legacy' : 'current') + ' native bridge imports', async t => {
    const w = scenario(t), graph = installColdWebViewModule(w, { legacyRegistry });
    w.addModule({ WebView: () => ({ locale: 'en-US', ast: [] }) });
    const { item, ui } = await w.openManager();
    assert.equal(graph.requires(), 0); assert.equal(graph.nativeProbes(), 0, 'opening settings does not load the browser');
    await act(button(ui, 'Log in with QR Code'));
    const browser = w.browser(ui); assert.ok(browser, 'the native QR browser is now available');
    assert.equal(graph.requires(), 1); assert.equal(graph.unrelated(), 0);
    await act(() => browser.props.onMessage(completion(browser)));
    assert.equal(item.api.jsonStorage.cache.accounts[USER.id].username, USER.username);
    assert.equal(w.calls.filter(c => c[0] === 'fetch').length, 1);
});

test('More Alts QR prefers an already loaded browser over initializing the cold package', async t => {
    const w = scenario(t), graph = installColdWebViewModule(w); w.addWebView();
    const { ui } = await w.openManager(); await act(button(ui, 'Log in with QR Code'));
    assert.ok(w.browser(ui)); assert.equal(graph.requires(), 0); assert.equal(graph.nativeProbes(), 0);
});

for (const mode of ['compiled', 'minifiedHelpers']) test('More Alts QR opens a cold browser with ' + mode + ' native commands', async t => {
    const w = scenario(t), graph = installColdWebViewModule(w, { [mode]: true });
    const { ui } = await w.openManager(); await act(button(ui, 'Log in with QR Code'));
    assert.ok(w.browser(ui)); assert.equal(graph.requires(), 1); assert.equal(graph.unrelated(), 0);
});

test('More Alts QR accepts an opaque platform component after verifying its browser dependency graph', async t => {
    const w = scenario(t); delete w.WebView.isFileUploadSupported;
    const graph = installColdWebViewModule(w);
    const { ui } = await w.openManager(); await act(button(ui, 'Log in with QR Code'));
    assert.ok(w.browser(ui)); assert.equal(graph.requires(), 1); assert.equal(graph.unrelated(), 0);
});

test('More Alts QR keeps its dialog usable when the cold package fails to initialize', async t => {
    const w = scenario(t), graph = installColdWebViewModule(w, { fail: true });
    const { ui } = await w.openManager(); await act(button(ui, 'Log in with QR Code'));
    assert.equal(w.browser(ui), undefined); assert.ok(button(ui, 'Close add account'));
    await act(button(ui, 'Log in with QR Code'));
    assert.equal(graph.requires(), 1); assert.equal(graph.unrelated(), 0);
    assert.equal(w.calls.some(c => c[0] === 'fetch'), false);
});

for (const coldBridge of [false, true]) test('More Alts QR loads Discord’s actual WebView fork with a ' + (coldBridge ? 'cold' : 'loaded') + ' callable bridge and handles approval', async t => {
    const w = scenario(t), graph = installDiscordWebViewModule(w, { coldBridge });
    w.addModule({ WebView: () => ({ locale: 'en-US', ast: [] }) });
    const { item, ui } = await w.openManager();
    assert.equal(graph.initializations.length, 0); assert.equal(graph.probes.length, 0);
    await act(button(ui, 'Log in with QR Code'));
    const browser = w.browser(ui); assert.ok(browser, 'the Discord fork loads without an EventEmitter import');
    assert.deepEqual(graph.probes, ['RNCWebViewModule', 'RNCWebView']);
    assert.ok(graph.initializations.includes(graph.mainId)); assert.equal(graph.unrelated(), 0);
    assert.deepEqual(graph.navigation, []);
    assert.equal(graph.messages.size, 1, 'the SDK registers its own messaging handler');
    assert.equal(browser.props.onShouldStartLoadWithRequest({ nativeEvent: { url: 'https://example.invalid/', lockIdentifier: 1 } }), undefined);
    assert.deepEqual(graph.navigation, [[false, 1]], 'the actual shared hook blocks external navigation');
    await act(() => [...graph.messages.values()][0].onMessage(completion(browser)));
    assert.equal(item.api.jsonStorage.cache.accounts[USER.id].username, USER.username);
    assert.equal(w.calls.filter(c => c[0] === 'fetch').length, 1);
    assert.ok(w.qrStops.some(script => script.includes('stopMoreAltsQr')));
});

test('More Alts QR closes Discord’s WebView fork and ignores a late callable-module approval', async t => {
    const w = scenario(t), graph = installDiscordWebViewModule(w);
    const { item, ui } = await w.openManager(); await act(button(ui, 'Log in with QR Code'));
    const browser = w.browser(ui); assert.ok(browser);
    const message = completion(browser), callbacks = [...graph.messages.values()][0];
    await act(button(ui, 'Close add account'));
    assert.equal(w.browser(ui), undefined); assert.equal(ui.root.findAll(n => n.type === 'Modal').length, 0);
    await act(() => callbacks.onMessage(message));
    assert.equal(w.calls.some(c => c[0] === 'fetch'), false);
    assert.deepEqual(Object.keys(item.api.jsonStorage.cache.accounts), []);
    assert.equal(w.qrStops.length, 1); assert.equal(graph.unrelated(), 0);
});

test('More Alts QR refreshes Discord’s WebView fork without accepting its previous approval', async t => {
    const w = scenario(t), graph = installDiscordWebViewModule(w);
    const { ui } = await w.openManager(); await act(button(ui, 'Log in with QR Code'));
    const old = w.browser(ui); assert.ok(old);
    const message = completion(old), callbacks = [...graph.messages.values()][0];
    await act(() => w.advance(3000)); await act(button(ui, 'Refresh QR code'));
    const browser = w.browser(ui); assert.ok(browser);
    assert.notEqual(completion(browser).nativeEvent.data, message.nativeEvent.data);
    assert.equal(graph.messages.size, 2, 'the SDK registers a separate native callback for the new browser');
    await act(() => callbacks.onMessage(message));
    assert.equal(w.calls.some(c => c[0] === 'fetch'), false);
    assert.equal(w.qrStops.length, 1); assert.equal(graph.unrelated(), 0);
});
