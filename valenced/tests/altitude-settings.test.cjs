'use strict';
process.env.PLUGIN_TEST_TARGET = 'valenced';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createWorld, React: R, Renderer } = require('../../revenge-next/tests/next-harness.cjs');
const h = R.createElement;
const NAV = 'modules/user_settings/core/native/SettingsNavigator.tsx';
const OVERVIEW = 'modules/user_settings/overview/native/SettingsOverviewScreen.tsx';
const LIST = 'modules/settings/native/renderer/SettingListRenderer.tsx';
const ID = 'dev.fluttershy2008.altitude-theme';
const flat = style => Object.assign({}, ...(Array.isArray(style) ? style.flat(Infinity).filter(Boolean) : [style]));

function fixture() {
  const w = createWorld();
  let state = { colors: { plugin: ID, theme: 'high' }, background: { source: 'theme' } };
  let revision = 0;
  const listeners = new Set();
  const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
  function useDisplay() {
    R.useSyncExternalStore(subscribe, () => revision, () => revision);
    return state.background.source === 'none' ? undefined : { baseTheme: 'dark', customTheme: {} };
  }
  w.U.modules.native.callNativeMethodSync = name => {
    assert.equal(name, 'valenced.themes.getState');
    return JSON.stringify(state);
  };
  const gradient = {
    CustomThemedGradient() {}, validateColors() {},
    default(props) {
      useDisplay();
      return h('WallpaperImage', { ...props, uri: state.background.source === 'custom' ? state.background.path : state.colors.theme,
        blur: state.background.blur ?? 0, opacity: state.background.opacity ?? 1 });
    }
  };
  const hooks = { useCustomThemeDisplaySettings: useDisplay };
  function Screen() { return null; }
  function Navigator({ children, ...props }) {
    return h('SettingsNavigator', props, children);
  }
  const originalOptions = function (args) {
    assert.equal(this.marker, 'receiver');
    return { title: args.title, gestureEnabled: true, headerStyle: { height: 48, backgroundColor: '#222222' },
      cardStyle: { paddingTop: 12, backgroundColor: '#444444' } };
  };
  const list = {
    SettingsList: R.memo(function SettingsList(props) {
      return h(w.RN.ScrollView, {
        testID: 'settings-scroll', style: { flex: 1, backgroundColor: '#404d59' },
        contentContainerStyle: { padding: 18, backgroundColor: '#404d59' }, onScroll: props.onScroll,
        ref: props.scrollRef, keyboardShouldPersistTaps: 'handled'
      }, h(w.RN.View, { testID: 'menu-card', style: { backgroundColor: '#51606c' } },
        h(w.RN.Pressable, { testID: 'menu-row', onPress: props.onPress }, 'Themes')));
    }),
    SearchableSettingsList: R.memo(function SearchableSettingsList(props) { return h(list.SettingsList, props); })
  };
  const overview = { default: function Overview(props) { return h(list.SettingsList, { node: { type: 'list', sections: [] }, ...props }); } };
  const nav = { default: R.memo(function SettingsNavigator(props) {
    return h(w.RN.View, { testID: 'navigator-shell', style: { flex: 1, backgroundColor: '#404d59' } },
      h(Navigator, { screenOptions: originalOptions },
        h(Screen, { name: 'SettingsOverview', component: overview.default }), h(overview.default, props)));
  }) };
  return { w, nav, overview, list, gradient, hooks, listeners, originalOptions,
    install() {
      w.addModule(gradient);
      w.addModule(hooks);
      w.addModule(list, LIST);
      w.addModule(overview, OVERVIEW);
      w.addModule(nav, NAV);
    },
    update(patch) {
      state = { ...state, ...patch }; revision++;
      for (const listener of listeners) listener();
    }
  };
}

test('Settings draws the selected wallpaper without replacing scrolling, controls or navigation options', async t => {
  const f = fixture(), { w } = f;
  f.install();
  const originalNav = f.nav.default.type, originalList = f.list.SettingsList.type;
  const plugin = await w.start('altitude-theme');
  let ui, clicks = 0, scrolls = 0;
  const ref = R.createRef();
  t.after(async () => {
    if (ui) await Renderer.act(async () => ui.unmount());
    await w.stop(plugin);
  });
  await Renderer.act(async () => {
    ui = Renderer.create(h(f.nav.default, { onPress: () => clicks++, onScroll: () => scrolls++, scrollRef: ref }));
  });
  const wallpaper = ui.root.findByType('WallpaperImage');
  assert.equal(wallpaper.props.uri, 'high');
  assert.equal(wallpaper.props.blur, 0);
  assert.equal(wallpaper.props.mix, true);
  let backdrop = wallpaper.parent;
  while (backdrop && backdrop.props.pointerEvents !== 'none') backdrop = backdrop.parent;
  assert.ok(backdrop, 'the image is inside a layer that cannot intercept touches');
  const scroll = ui.root.findByProps({ testID: 'settings-scroll' });
  assert.equal(flat(scroll.props.style).backgroundColor, 'transparent');
  assert.equal(flat(scroll.props.contentContainerStyle).backgroundColor, 'transparent');
  assert.equal(flat(scroll.props.contentContainerStyle).padding, 18);
  assert.equal(scroll.props.keyboardShouldPersistTaps, 'handled');
  assert.equal(ui.root.findByProps({ testID: 'menu-card' }).props.style.backgroundColor, '#51606c');
  ui.root.findByProps({ testID: 'menu-row' }).props.onPress();
  scroll.props.onScroll();
  assert.equal(clicks, 1); assert.equal(scrolls, 1);
  const options = ui.root.findByType('SettingsNavigator').props.screenOptions.call({ marker: 'receiver' }, { title: 'Settings' });
  assert.equal(options.title, 'Settings'); assert.equal(options.gestureEnabled, true);
  assert.equal(flat(options.headerStyle).height, 48);
  assert.equal(flat(options.headerStyle).backgroundColor, 'transparent');
  assert.equal(flat(options.cardStyle).paddingTop, 12);
  assert.equal(flat(options.cardStyle).backgroundColor, 'transparent');
  assert.equal(options.headerTransparent, undefined);
  await Renderer.act(async () => f.update({ colors: { plugin: ID, theme: 'low' } }));
  assert.equal(ui.root.findByType('WallpaperImage').props.uri, 'low');
  await Renderer.act(async () => f.update({ background: { source: 'custom', path: '/cache/custom.jpg', opacity: 0.6, blur: 3 } }));
  assert.equal(ui.root.findByType('WallpaperImage').props.uri, '/cache/custom.jpg');
  assert.equal(ui.root.findByType('WallpaperImage').props.opacity, 0.6);
  assert.equal(ui.root.findByType('WallpaperImage').props.blur, 3);
  await Renderer.act(async () => f.update({ background: { source: 'none' } }));
  assert.equal(ui.root.findAllByType('WallpaperImage').length, 0);
  assert.equal(flat(ui.root.findByProps({ testID: 'settings-scroll' }).props.style).backgroundColor, '#404d59');
  await Renderer.act(async () => f.update({ colors: { plugin: 'another.theme', theme: 'other' }, background: { source: 'theme' } }));
  assert.equal(ui.root.findAllByType('WallpaperImage').length, 0);
  assert.equal(ui.root.findByType('SettingsNavigator').props.screenOptions, f.originalOptions);
  await Renderer.act(async () => f.update({ colors: { plugin: ID, theme: 'low' } }));
  await Renderer.act(async () => w.stop(plugin));
  assert.equal(f.nav.default.type, originalNav);
  assert.equal(f.list.SettingsList.type, originalList);
  assert.equal(ui.root.findAllByType('WallpaperImage').length, 0);
  assert.equal(f.listeners.size, 0);
  assert.equal(w.moduleWaiters.size, 0); assert.equal(w.pathWaiters.size, 0);
  assert.equal(w.timers.size, 0); assert.deepEqual(w.errors, []); assert.deepEqual(w.logs, []);
});

test('Settings discovery waits for modules and a stopped plugin ignores late callbacks', async () => {
  const f = fixture(), { w } = f;
  const plugin = await w.start('altitude-theme');
  assert.equal(w.pathWaiters.size, 3);
  assert.equal(w.moduleWaiters.size, 3);
  const queued = [...w.pathWaiters];
  await w.stop(plugin);
  for (const entry of queued) entry.cb(f.nav, 999);
  const original = f.nav.default.type;
  f.install();
  assert.equal(f.nav.default.type, original);
  assert.equal(w.moduleWaiters.size, 0); assert.equal(w.pathWaiters.size, 0);
  assert.equal(w.timers.size, 0); assert.deepEqual(w.errors, []);
});

test('already mounted Settings lists outside the Settings navigator keep their original surface', async t => {
  const f = fixture(); f.install();
  const plugin = await f.w.start('altitude-theme');
  let ui;
  t.after(async () => {
    if (ui) await Renderer.act(async () => ui.unmount());
    await f.w.stop(plugin);
  });
  await Renderer.act(async () => { ui = Renderer.create(h(f.list.SettingsList, { node: { type: 'list' } })); });
  assert.equal(flat(ui.root.findByProps({ testID: 'settings-scroll' }).props.style).backgroundColor, '#404d59');
  assert.equal(ui.root.findAllByType('WallpaperImage').length, 0);
});

test('a Settings page already open before gradient modules load can acquire its backdrop safely', async t => {
  const f = fixture(), { w } = f;
  w.addModule(f.list, LIST);
  w.addModule(f.overview, OVERVIEW);
  w.addModule(f.nav, NAV);
  const plugin = await w.start('altitude-theme');
  let ui;
  t.after(async () => {
    if (ui) await Renderer.act(async () => ui.unmount());
    await w.stop(plugin);
  });
  await Renderer.act(async () => { ui = Renderer.create(h(f.nav.default)); });
  assert.equal(ui.root.findAllByType('WallpaperImage').length, 0);
  await Renderer.act(async () => { w.addModule(f.gradient); w.addModule(f.hooks); });
  assert.equal(ui.root.findAllByType('WallpaperImage').length, 1);
  assert.equal(flat(ui.root.findByProps({ testID: 'settings-scroll' }).props.style).backgroundColor, 'transparent');
  assert.deepEqual(w.errors, []);
});

test('missing or invalid native theme state leaves the Settings screen usable', async t => {
  const f = fixture(); f.install();
  f.w.U.modules.native.callNativeMethodSync = () => { throw new Error('Native state unavailable'); };
  const plugin = await f.w.start('altitude-theme');
  let ui;
  t.after(async () => {
    if (ui) await Renderer.act(async () => ui.unmount());
    await f.w.stop(plugin);
  });
  await Renderer.act(async () => { ui = Renderer.create(h(f.nav.default)); });
  assert.equal(ui.root.findAllByType('WallpaperImage').length, 0);
  assert.equal(flat(ui.root.findByProps({ testID: 'settings-scroll' }).props.style).backgroundColor, '#404d59');
  assert.deepEqual(f.w.errors, []);
});
