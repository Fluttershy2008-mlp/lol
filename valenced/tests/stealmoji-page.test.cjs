'use strict';
process.env.PLUGIN_TEST_TARGET = 'valenced';
const test = require('node:test');
const assert = require('node:assert/strict');
const { React, Renderer } = require('../../revenge-next/tests/next-harness.cjs');

test('a cached closed page pops only itself when its native screen receives focus again', async () => {
  const { createPickerPage } = await import('../../stealmoji/src/page.mjs');
  const h = React.createElement, listeners = new Set(), timers = new Map();
  let route = { key: 'chat', params: {} }, own, Page, removed = 0, closed = 0;
  const changed = () => { for (const fn of [...listeners]) fn(); };
  const nav = {
    getCurrentRoute: () => route, canGoBack: () => true,
    addListener(_name, fn) { listeners.add(fn); return () => listeners.delete(fn); },
    navigate(_name, params) { own = { key: 'picker', params }; route = own; Page = params.render; changed(); },
    goBack() { removed++; route = { key: 'chat', params: {} }; changed(); },
  };
  const RN = { View: 'View', Text: 'Text' };
  const V = { metro: { common: { React, ReactNative: RN, NavigationNative: {
    useIsFocused: () => React.useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn); }, () => route === own),
  } }, findByProps: () => ({ getRootNavigationRef: () => nav }), findByStoreName: () => ({ theme: 'dark' }) } };
  const env = { setTimeout(fn) { const key = {}; timers.set(key,fn); return key; }, clearTimeout: key => timers.delete(key) };
  const page = createPickerPage(V,env); page.open(() => h('Text',null,'Picker'), () => closed++);
  const open = [...timers.values()][0]; timers.clear(); open();
  let ui; await Renderer.act(async () => { ui = Renderer.create(h(Page)); });
  await Renderer.act(async () => { route = { key: 'profile', params: {} }; changed(); });
  assert.equal(closed,1); assert.equal(removed,0,'blur must not pop the unrelated profile');
  assert.ok(JSON.stringify(ui.toJSON()).includes('Stealmoji is closed'));
  await Renderer.act(async () => { route = own; changed(); });
  assert.equal(removed,1); assert.equal(route.key,'chat');
  await Renderer.act(async () => ui.unmount()); page.closeAll();
  assert.equal(listeners.size,0); assert.equal(timers.size,0);
});
