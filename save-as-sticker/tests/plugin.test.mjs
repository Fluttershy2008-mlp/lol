import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { GifReader } from 'omggif';
import { gifFixture } from './gif-fixture.mjs';

const source = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
// PNG header fixture: conversion and decoding are delegated to Discord's native cropper.
function png(width = 320, height = 320, bytes = 32) {
  const b = Buffer.alloc(bytes);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(b);
  b.writeUInt32BE(13, 8); b.write('IHDR', 12);
  b.writeUInt32BE(width, 16); b.writeUInt32BE(height, 20);
  return b.toString('base64');
}
const image = (name = 'pony.jpg') => ({ url: 'https://cdn.discordapp.com/attachments/1/2/' + name + '?ex=123&hm=signature', filename: name, content_type: 'image/jpeg' });
const selected = (name = 'pony.jpg') => ({ selectedMedia: { mediaType: 'image', mediaUrl: image(name).url, source: image(name) } });
const tick = () => new Promise(resolve => setImmediate(resolve));
async function settle() { for (let i = 0; i < 12; i++) await tick(); }
function nodes(tree) {
  if (!tree) return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (typeof tree !== 'object') return [];
  const rows = tree.props?.renderItem && tree.props?.data
    ? tree.props.data.map(item => tree.props.renderItem({ item })) : [];
  return [tree, ...nodes(tree.props?.children), ...nodes(tree.props?.leading), ...nodes(tree.props?.trailing), ...nodes(rows)];
}
function makeHarness(options = {}) {
  let hooks = [], hookIndex = 0, effects = [];
  const React = {
    createElement(type, input = {}, ...children) {
      const { key, ...props } = input ?? {};
      if (children.length) props.children = children.length === 1 ? children[0] : children;
      return Object.freeze({ type, key: key ?? null, props: Object.freeze(props) });
    },
    cloneElement(node, props) { return Object.freeze({ ...node, props: Object.freeze({ ...node.props, ...props }) }); },
    useState(initial) {
      const index = hookIndex++;
      if (!(index in hooks)) hooks[index] = initial;
      return [hooks[index], value => { hooks[index] = typeof value === 'function' ? value(hooks[index]) : value; }];
    },
    useEffect(fn) { if (!effects.length) effects.push(fn()); },
    memo: (type, compare) => ({ $$typeof: Symbol.for('react.memo'), type, compare }),
    forwardRef: render => ({ $$typeof: Symbol.for('react.forward_ref'), render }),
  };
  const h = React.createElement;
  const calls = { opens: [], hides: [], toasts: [], alerts: [], writes: [], deletes: [], crops: [], cleans: [], posts: [], gets: [], logs: [] };
  const guilds = options.guilds ?? [{ id: '1', name: 'Pony server', ownerId: 'me', premiumTier: 0 }];
  const store = {
    GuildStore: { getGuilds: () => Object.fromEntries(guilds.map(g => [g.id, g])), getGuild: id => guilds.find(g => g.id === id) },
    UserStore: { getCurrentUser: () => options.noUser ? null : { id: 'me' } },
    PermissionStore: { can: (permission, guild) => options.allowed?.(guild) ?? Boolean(guild.create) },
    StickersStore: { getStickersByGuildId: id => options.stickers?.[id] ?? [] },
  };
  const sheetHost = {
    openLazy(lazy, key, context) { calls.opens.push({ lazy, key, context }); },
    hideActionSheet(key) { calls.hides.push(key); },
  };
  function Row() {} Row.Icon = 'RowIcon'; Row.Group = 'RowGroup';
  const files = {
    async writeFile(dir, path, data, encoding) { calls.writes.push({ dir, path, data, encoding }); return '/cache/' + path; },
    async removeFile(dir, path) { calls.deletes.push(path); },
    async readFile() { return options.cropData ?? png(); },
  };
  const cropper = {
    async launchCropper(opts) {
      calls.crops.push(opts);
      if (options.crop) return options.crop(opts);
      return { data: options.cropData ?? png(), path: '/crop/result.png', mime: 'image/png' };
    },
    async cleanSingle(path) { calls.cleans.push(path); },
  };
  const uploader = {
    async createGuildSticker(opts) { calls.posts.push(opts); return options.post ? options.post(opts) : { id: 'new-sticker' }; },
  };
  const modules = [sheetHost, { ActionSheetRow: Row }, { ActionSheet: 'ActionSheet' }, files, cropper, uploader];
  if (options.nativeUI) modules.push(
    { ActionSheetTitleHeader: 'TitleHeader' }, { ActionSheetCloseButton: 'CloseButton' },
    { default: 'GuildIcon', GuildIconSizes: { MEDIUM: 44 } }, { BottomSheetFlatList: 'ServerList' },
  );
  async function fetcher(url) {
    calls.gets.push(url);
    return { ok: true, headers: { get: () => null }, blob: async () => ({ size: 80, type: options.downloadType ?? 'image/jpeg', data: options.downloadData ?? 'aW1hZ2U=' }) };
  }
  const RN = {
    View: 'View', Text: 'Text', TextInput: 'TextInput', ScrollView: 'ScrollView', Pressable: 'Pressable', Image: 'Image',
    Appearance: { getColorScheme: () => 'dark' }, Dimensions: { get: () => ({ height: 900 }) }, Keyboard: { dismiss() {} },
    Alert: { alert: (...args) => calls.alerts.push(args) },
  };
  const V = {
    metro: { common: { React, ReactNative: RN, constants: { Permissions: { CREATE_GUILD_EXPRESSIONS: 1n << 43n } } },
      findByProps: (...keys) => modules.find(m => keys.every(key => key in m)), findByStoreName: name => store[name] },
    patcher: { before(key, target, callback) {
      const old = target[key];
      target[key] = function (...args) { callback(args); return old.apply(this, args); };
      return () => { target[key] = old; };
    } },
    logger: { error: (...args) => calls.logs.push(args) },
    ui: { assets: { getAssetIDByName: () => 1 }, toasts: { showToast: message => calls.toasts.push(message) }, components: options.nativeUI ? { Forms: { FormRow: 'FormRow', FormIcon: 'FormIcon' } } : {} },
    utils: { safeFetch: fetcher },
  };
  class Reader { readAsDataURL(blob) { this.result = 'data:' + blob.type + ';base64,' + blob.data; this.onload(); } }
  const context = vm.createContext({ FileReader: Reader, console, setTimeout: fn => setImmediate(fn), fetch: fetcher });
  // Same expression wrapper as Revenge's core/vendetta/plugins.ts; no global API supplied.
  const plugin = vm.runInContext('vendetta=>{return ' + source + '\n}', context)(V);
  plugin.onLoad();
  const originalOpen = sheetHost.openLazy;
  const tree = () => h('Provider', null, h('ActionSheet', null,
    h(Row.Group, { children: Object.freeze([h(Row, { label: 'Reply', onPress() {} })]) }),
    h(Row.Group, { children: Object.freeze([h(Row, { label: 'Save Image', onPress() {} }), null, h(Row, { label: 'Copy Image Link', onPress() {} })]) })));
  function renderType(component, props = {}) {
    if (component.$$typeof === Symbol.for('react.memo')) return renderType(component.type, props);
    if (component.$$typeof === Symbol.for('react.forward_ref')) return component.render(props, null);
    return component(props);
  }
  async function menu(ctx = selected(), key = 'MessageLongPressActionSheet', props = {}, kind = 'function') {
    let component = tree;
    if (kind === 'memo') component = React.memo(tree);
    if (kind === 'forward') component = React.forwardRef(tree);
    const originalModule = { default: component };
    sheetHost.openLazy(Promise.resolve(originalModule), key, ctx);
    const mod = await calls.opens.at(-1).lazy;
    assert.equal(originalModule.default, component, 'cached module remains untouched');
    const rendered = renderType(mod.default, props);
    return { rendered, row: nodes(rendered).find(n => n.props?.label === 'Save as Sticker'), mod };
  }
  async function openPicker(menuResult) {
    menuResult.row.props.onPress();
    const mod = await calls.opens.at(-1).lazy;
    const element = mod.default();
    const render = () => { hookIndex = 0; return element.type(element.props); };
    return { render, button: (label, tree = render()) => nodes(tree).find(n => n.props?.accessibilityLabel === label) };
  }
  async function startUpload(ctx = selected(), customName = 'pony.v2') {
    const picker = await openPicker(await menu(ctx));
    picker.button(guilds[0].name).props.onPress();
    const form = picker.render();
    nodes(form).find(n => n.type === 'TextInput').props.onChangeText(customName);
    const action = picker.button('Add sticker');
    action.props.onPress();
    return { picker, action };
  }
  return { plugin, calls, menu, openPicker, startUpload, sheetHost, originalOpen, guilds, store, modules, h, Row, tree, renderType };
}

test('Revenge loader, frozen React tree, insertion position, repeated renders and unload', async () => {
  const t = makeHarness();
  const menu = await t.menu();
  assert.ok(menu.row);
  assert.deepEqual(nodes(menu.rendered).filter(n => n.props?.label).map(n => n.props.label), ['Reply', 'Save Image', 'Save as Sticker', 'Copy Image Link']);
  assert.equal(nodes(t.tree()).filter(n => n.props?.label === 'Save as Sticker').length, 0);
  assert.equal(nodes(t.renderType(menu.mod.default)).filter(n => n.props?.label === 'Save as Sticker').length, 1);
  t.plugin.onUnload();
  assert.equal(nodes(t.renderType(menu.mod.default)).filter(n => n.props?.label === 'Save as Sticker').length, 0);
  assert.notEqual(t.sheetHost.openLazy, t.originalOpen);
});

test('selected image wins and reopening does not reuse the previous image', async () => {
  const t = makeHarness();
  await t.openPicker(await t.menu(selected('first.jpg')));
  const picker = await t.openPicker(await t.menu(selected('second.jpg')));
  picker.button('Pony server').props.onPress();
  assert.match(nodes(picker.render()).find(n => n.type === 'Image').props.source.uri, /second.jpg/);
});

test('videos and unrelated menus are untouched', async () => {
  const t = makeHarness();
  assert.equal((await t.menu({ selectedMedia: { mediaType: 'video', mediaUrl: 'https://example.com/v.mp4' }, message: { attachments: [image()] } })).row, undefined);
  assert.equal((await t.menu(selected(), 'UnrelatedSheet')).row, undefined);
});

test('current media viewer, legacy syncer, analytics context, memo and forwardRef', async () => {
  for (const ctx of [{ source: { sourceURI: image().url } }, { syncer: { index: { value: 1 }, sources: [[{ uri: 'https://example.com/wrong.png' }], [{ uri: image().url }]] } }, { analyticsLocation: selected() }]) {
    const t = makeHarness();
    assert.ok((await t.menu(ctx, 'MediaShareActionSheet')).row);
  }
  for (const kind of ['memo', 'forward']) assert.ok((await makeHarness().menu(selected(), 'MessageLongPressActionSheet', {}, kind)).row);
  assert.ok((await makeHarness().menu({}, 'MessageLongPressActionSheet', { analyticsLocation: selected() })).row);
});

test('multiple images prompt for selection instead of silently uploading the first', async () => {
  const t = makeHarness(), p = await t.openPicker(await t.menu({ message: { attachments: [image('first.jpg'), image('second.jpg')] } }));
  assert.ok(p.button('Use image 1')); assert.ok(p.button('Use image 2'));
  p.button('Use image 2').props.onPress(); p.button('Pony server').props.onPress();
  assert.match(nodes(p.render()).find(n => n.type === 'Image').props.source.uri, /second.jpg/);
});

test('native picker matches reference layout, keeps full servers disabled and excludes unauthorized servers', async () => {
  const guilds = [
    { id: '1', name: 'Owner', ownerId: 'me' }, { id: '2', name: 'Creator', create: true },
    { id: '3', name: 'Manage only', manage: true }, { id: '4', name: 'Full', create: true },
    { id: '5', name: 'Boosted', create: true, premiumTier: 1 },
    { id: '6', name: 'Extra slots', create: true, premiumFeatures: { additionalStickerSlots: 5 } },
  ];
  const t = makeHarness({ nativeUI: true, guilds, stickers: { '4': Array(5).fill({}), '5': Array(5).fill({}), '6': Array(5).fill({}) } });
  const p = await t.openPicker(await t.menu());
  const tree = p.render();
  const rows = nodes(tree).filter(n => n.type === 'FormRow');
  assert.deepEqual(rows.map(n => n.props.label), ['Boosted', 'Creator', 'Extra slots', 'Full', 'Owner']);
  const full = rows.find(n => n.props.label === 'Full');
  assert.equal(full.props.disabled, true);
  assert.equal(full.props.subLabel, 'No slots available');
  assert.equal(full.props.accessibilityState.disabled, true);
  full.props.onPress();
  assert.equal(nodes(p.render()).some(n => n.type === 'TextInput'), false, 'full server cannot open the add form');
  for (const row of rows) {
    assert.equal(row.props.leading.type, 'GuildIcon');
    assert.equal(row.props.leading.props.size, 44);
    assert.equal(row.props.trailing.type, 'FormIcon');
  }
  assert.equal(rows[0].props.subLabel, undefined, 'available rows match the uncluttered reference');
  const header = nodes(tree).find(n => n.type === 'TitleHeader');
  assert.equal(header.props.title, 'Saving pony');
  assert.equal(header.props.leading.props.source.uri, image().url);
  assert.equal(header.props.trailing.type, 'CloseButton');
  header.props.trailing.props.onPress();
  assert.equal(t.calls.hides.at(-1), 'SaveAsStickerPicker');
});

test('absent current user is not treated as server owner', async () => {
  const t = makeHarness({ noUser: true, guilds: [{ id: '1', name: 'Unauthorized' }] });
  const p = await t.openPicker(await t.menu()); assert.equal(p.button('Unauthorized'), undefined);
});

test('upload converts JPEG, keeps edited name, uses local PNG and cleans files after completion', async () => {
  const t = makeHarness(); const { action } = await t.startUpload(); action.props.onPress(); await settle();
  assert.equal(t.calls.posts.length, 1, 'double tap cannot create duplicates');
  assert.match(t.calls.gets[0], /hm=signature/);
  assert.equal(t.calls.crops[0].width, 320); assert.equal(t.calls.crops[0].mimeType, 'image/png');
  const post = t.calls.posts[0];
  assert.equal(post.name, 'pony.v2'); assert.equal(post.guildId, '1'); assert.equal(post.tags, 'slight_smile');
  assert.match(post.uri, /^file:\/\/\/cache\/.+-sticker.png$/); assert.equal(post.platform, 'mobile');
  assert.equal(t.calls.deletes.length, 2); assert.equal(t.calls.cleans.length, 1);
  assert.ok(t.calls.toasts.includes('Sticker added to Pony server')); assert.deepEqual(t.calls.alerts, []);
});

test('valid 320x320 PNG skips cropping and still uploads via a local file', async () => {
  const t = makeHarness({ downloadData: png() }); await t.startUpload(); await settle();
  assert.equal(t.calls.crops.length, 0); assert.equal(t.calls.posts.length, 1); assert.equal(t.calls.deletes.length, 1);
});

test('GIF upload keeps animation, uses image/gif and skips the static cropper', async () => {
  const t = makeHarness({ downloadData: Buffer.from(gifFixture()).toString('base64'), downloadType: 'image/gif' });
  await t.startUpload(selected('moving.gif')); await settle();
  assert.equal(t.calls.crops.length, 0);
  assert.equal(t.calls.posts.length, 1);
  assert.equal(t.calls.posts[0].mimeType, 'image/gif');
  assert.match(t.calls.posts[0].uri, /-sticker.gif$/);
  const reader = new GifReader(Buffer.from(t.calls.writes[0].data, 'base64'));
  assert.equal(reader.numFrames(), 2); assert.equal(reader.width, 320); assert.equal(reader.height, 320);
  assert.equal(t.calls.deletes.length, 1); assert.deepEqual(t.calls.alerts, []);
});

test('GIF source takes priority over a video preview and preserves signed URL parameters', async () => {
  const t = makeHarness({ downloadData: Buffer.from(gifFixture()).toString('base64'), downloadType: 'image/gif' });
  await t.startUpload({ selectedMedia: { mediaType: 'video', mediaUrl: 'https://example.com/preview.mp4',
    source: { url: image('moving.gif').url + '&format=webp&animated=false', content_type: 'video/mp4' } } });
  await settle();
  assert.equal(t.calls.gets[0], image('moving.gif').url);
  assert.equal(t.calls.posts.length, 1);
});

test('GIF embeds expose their original GIF from selected media and message context', async () => {
  const gif = { type: 'gifv', url: 'https://example.com/view/pony',
    video: { url: 'https://example.com/pony.mp4' }, thumbnail: { url: 'https://example.com/pony.gif' } };
  for (const context of [{ selectedMedia: { mediaType: 'video', mediaUrl: gif.video.url, source: gif } }, { message: { embeds: [gif] } }]) {
    const t = makeHarness({ downloadData: Buffer.from(gifFixture()).toString('base64'), downloadType: 'image/gif' });
    await t.startUpload(context); await settle();
    assert.equal(t.calls.gets[0], gif.thumbnail.url);
    assert.equal(t.calls.posts.length, 1); assert.equal(t.calls.posts[0].mimeType, 'image/gif');
  }
});

test('GIF link returning a static or video preview fails without silently flattening it', async () => {
  const t = makeHarness({ downloadData: png(), downloadType: 'image/png' });
  await t.startUpload(selected('moving.gif')); await settle();
  assert.equal(t.calls.posts.length, 0); assert.equal(t.calls.crops.length, 0);
  assert.match(t.calls.alerts[0][1], /original .gif/);
});

test('GIF exceeding animation limit is rejected before creating files or posting', async () => {
  const t = makeHarness({ downloadData: Buffer.from(gifFixture({ frames: [{ delay: 501 }] })).toString('base64'), downloadType: 'image/gif' });
  await t.startUpload(selected('moving.gif')); await settle();
  assert.equal(t.calls.posts.length, 0); assert.equal(t.calls.writes.length, 0);
  assert.match(t.calls.alerts[0][1], /5 seconds/);
});

test('cropper cancellation, invalid format/dimensions and oversized output never upload', async () => {
  const cases = [
    { crop: async () => { throw Object.assign(new Error('User cancelled'), { code: 'E_PICKER_CANCELLED' }); }, cancelled: true },
    { cropData: 'aW52YWxpZA==' }, { cropData: png(640, 320) }, { cropData: png(320, 320, 512 * 1024 + 1) },
  ];
  for (const options of cases) {
    const t = makeHarness(options); await t.startUpload(); await settle();
    assert.equal(t.calls.posts.length, 0); assert.equal(t.calls.deletes.length, 1);
    assert.equal(t.calls.alerts.length, options.cancelled ? 0 : 1);
    assert.ok(!t.calls.toasts.includes('Sticker added to Pony server'));
  }
});

test('cropper path-only result is read as base64', async () => {
  const t = makeHarness({ crop: async () => ({ path: '/crop/result.png' }) });
  await t.startUpload(); await settle(); assert.equal(t.calls.posts.length, 1);
});

test('permission or capacity changing during crop blocks the POST', async () => {
  for (const capacity of [false, true]) {
    let t;
    const slots = { '1': [] };
    t = makeHarness({ stickers: slots, crop: async () => {
      if (capacity) slots['1'] = Array(5).fill({}); else t.guilds[0].ownerId = 'someone-else';
      return { data: png(), path: '/crop/result.png' };
    } });
    await t.startUpload(); await settle(); assert.equal(t.calls.posts.length, 0); assert.equal(t.calls.alerts.length, 1);
  }
});

test('HTTP failure has no automatic retry and no false success message', async () => {
  const t = makeHarness({ post: async () => { throw { body: { code: 30039 } }; } });
  await t.startUpload(); await settle();
  assert.equal(t.calls.posts.length, 1); assert.match(t.calls.alerts[0][1], /no free sticker slots/);
  assert.ok(!t.calls.toasts.includes('Sticker added to Pony server')); assert.equal(t.calls.deletes.length, 2);
});

test('unload while cropper is pending prevents upload and still cleans up', async () => {
  let finish;
  const t = makeHarness({ crop: () => new Promise(resolve => { finish = resolve; }) });
  await t.startUpload(); await settle(); assert.ok(finish);
  t.plugin.onUnload(); finish({ data: png(), path: '/crop/result.png' }); await settle();
  assert.equal(t.calls.posts.length, 0); assert.equal(t.calls.cleans.length, 1); assert.equal(t.calls.deletes.length, 1);
});
