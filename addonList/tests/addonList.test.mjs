import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const source = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
function setup(overrides = {}) {
  const commands = new Map(), sent = [], local = [], copied = [], alerts = [], toasts = [], errors = [];
  const actions = { sendMessage: async (id, message) => { sent.push({ id, ...message }); return { ok: true }; }, receiveMessage() {} };
  const bot = { sendBotMessage: (id, content) => { local.push({ id, content }); } };
  const clipboard = { setString: text => { copied.push(text); } };
  let lookups = 0, disposed = 0, registrations = 0;
  const V = {
    plugin: { storage: {} },
    plugins: { plugins: {} }, themes: { themes: {} },
    storage: { awaitSyncWrapper: async () => {}, useProxy() {} },
    metro: {
      common: { clipboard, React: { createElement: (type, props, ...children) => ({ type, props, children }) },
        ReactNative: { ScrollView: 'ScrollView', View: 'View', Text: 'Text', Switch: 'Switch', TouchableOpacity: 'TouchableOpacity', useColorScheme: () => 'dark',
          ToastAndroid: { SHORT: 0, show: text => { toasts.push(text); } } } },
      findByProps: (...props) => { lookups++; return props.includes('sendBotMessage') ? bot : props.includes('sendMessage') ? actions : props.includes('setString') ? clipboard : undefined; }
    },
    commands: { registerCommand: command => {
      registrations++;
      commands.set(command.name, command);
      return () => { disposed++; commands.delete(command.name); };
    } },
    ui: { alerts: { showConfirmationAlert: alert => { alerts.push(alert); } }, toasts: { showToast: text => { toasts.push(text); } } },
    logger: { error: (...args) => { errors.push(args); } }
  };
  Object.assign(V, overrides);
  const plugin = vm.runInNewContext(source, { vendetta: V });
  const ctx = { channel: { id: '123456789012345678' } };
  return { V, plugin, commands, sent, local, copied, alerts, toasts, errors, actions, bot,
    get lookups() { return lookups; }, get disposed() { return disposed; }, get registrations() { return registrations; },
    run: (name = 'plugin-list', args = [], context = ctx) => commands.get(name).execute(args, context) };
}
const flag = (name, value = true) => ({ name, value });
function many(h, count = 90) {
  for (let i = 0; i < count; i++) h.V.plugins.plugins[`https://example.com/${i}/`] = {
    enabled: i % 2 === 0,
    manifest: { name: `Plugin ${String(i).padStart(3, '0')}`, authors: [{ name: 'Author' }], description: 'Useful plugin.' }
  };
}

async function copyAll(h, args = []) {
  const start = h.copied.length;
  await h.run('plugin-list', [...args, flag('copy')]);
  const alert = h.alerts.at(-1);
  if (alert?.title === 'Copy addon list in parts') {
    h.alerts.pop();
    for (const button of alert.content.children.filter(c => c.type === 'TouchableOpacity').slice(1))
      await button.props.onPress();
  }
  return h.copied.slice(start).join('');
}

test('evaluation and startup do not look up Discord modules or current user; load/unload are idempotent', () => {
  const h = setup();
  Object.defineProperty(h.V.metro, 'findByStoreName', { get() { throw new Error('User not loaded'); } });
  h.plugin.onUnload();
  h.plugin.onLoad(); h.plugin.onLoad();
  assert.equal(h.lookups, 0);
  assert.equal(h.registrations, 2);
  h.plugin.onUnload(); h.plugin.onUnload();
  assert.equal(h.disposed, 2); assert.equal(h.commands.size, 0);
  h.plugin.onLoad(); assert.equal(h.commands.size, 2);
});

test('partial command registration is rolled back and can be retried', () => {
  const h = setup();
  const register = h.V.commands.registerCommand;
  let calls = 0;
  h.V.commands.registerCommand = command => { if (++calls === 2) throw new Error('Registration failed'); return register(command); };
  assert.throws(() => h.plugin.onLoad(), /Registration failed/);
  assert.equal(h.commands.size, 0); assert.equal(h.disposed, 1);
  h.V.commands.registerCommand = register;
  h.plugin.onLoad(); assert.equal(h.commands.size, 2);
});

test('missing manifests/authors, stale entries and empty lists are safe', async () => {
  const h = setup(); h.plugin.onLoad();
  h.V.plugins.plugins = { one: { enabled: true }, two: { manifest: { name: 'Named', authors: null } }, stale: null };
  assert.equal(await h.run(), undefined);
  assert.equal(h.sent.length, 1);
  assert.match(h.sent[0].content, /2 Plugins/);
  assert.match(h.sent[0].content, /Unknown author/);
  assert.match(h.sent[0].content, /Unnamed plugin/);
  await h.run('theme-list');
  assert.match(h.sent[1].content, /No themes installed/);
  assert.equal(h.errors.length, 0);
});

test('theme selection, sorting, descriptions and fallback URLs appear in detailed output', async () => {
  const h = setup(); h.plugin.onLoad();
  h.V.themes.themes = {
    'https://example.com/z.json': { selected: false, data: { name: 'Zebra', authors: ['Kitomanari'] } },
    'https://example.com/a.json': { selected: true, data: { name: 'Alpha', description: 'Soft colours', authors: [{ name: 'Me' }] } }
  };
  await h.run('theme-list', [flag('detailed')]);
  const text = h.sent[0].content;
  assert.ok(text.indexOf('Alpha') < text.indexOf('Zebra'));
  assert.match(text, /Selected\*\*: Selected/); assert.match(text, /Selected\*\*: Not selected/);
  assert.match(text, /Soft colours/); assert.match(text, /https:\/\/example.com\/a.json/);
});

test('metadata cannot insert mentions or unsafe install links', async () => {
  const h = setup(); h.plugin.onLoad();
  h.V.plugins.plugins = { x: { id: 'javascript:bad()', enabled: true, manifest: {
    name: '**@everyone**\n<@123>', description: '@here <@&123>', authors: [{ name: '@everyone' }]
  } } };
  await h.run('plugin-list', [flag('detailed')]);
  assert.ok(!h.sent[0].content.includes('@everyone'));
  assert.ok(!h.sent[0].content.includes('@here'));
  assert.ok(!h.sent[0].content.includes('<@123>'));
  assert.ok(!h.sent[0].content.includes('javascript:'));
  assert.equal(h.sent[0].allowedMentions.parse.length, 0);
});

test('long lists require confirmation, split without another plugin, preserve content and send exactly once', async () => {
  const h = setup(); h.plugin.onLoad(); many(h);
  const copied = await copyAll(h);
  await h.run();
  assert.equal(h.sent.length, 0); assert.equal(h.alerts.length, 1);
  await h.alerts[0].onConfirm(); await h.alerts[0].onConfirm();
  assert.ok(h.sent.length > 1);
  assert.ok(h.sent.every(message => message.content.length <= 2000 && message.content.length > 0));
  assert.equal(h.sent.map(message => message.content).join(''), copied);
});

test('cancelled or obsolete confirmations never send', async () => {
  const h = setup(); h.plugin.onLoad(); many(h);
  await h.run(); h.alerts[0].onCancel(); await h.alerts[0].onConfirm();
  assert.equal(h.sent.length, 0);
  await h.run(); h.plugin.onUnload(); h.plugin.onLoad(); await h.alerts[1].onConfirm();
  assert.equal(h.sent.length, 0);
});

test('private previews and clipboard copies never send public messages; options override saved defaults', async () => {
  const h = setup(); h.plugin.onLoad(); many(h);
  h.V.plugin.storage.privatePreview = true;
  h.V.plugin.storage.pluginListAlwaysDetailed = true;
  await h.run('plugin-list', [flag('detailed', false)]);
  assert.ok(h.local.length > 1); assert.ok(!h.local[0].content.includes('Description'));
  await h.run('plugin-list', [flag('copy'), flag('private')]);
  assert.equal(h.copied.length, 1); assert.equal(h.sent.length, 0);
  assert.equal(h.alerts.pop().title, 'Copy addon list in parts');
  await h.run('plugin-list', [flag('private', false)]);
  assert.equal(h.alerts.length, 1);
});

test('emoji at message boundaries retain complete Unicode surrogate pairs', async () => {
  const h = setup(); h.plugin.onLoad();
  h.V.plugins.plugins = { x: { id: 'https://example.com/emoji/', manifest: { name: 'Emoji', authors: [], description: '😀*'.repeat(1500) } } };
  const copied = await copyAll(h, [flag('detailed')]);
  await h.run('plugin-list', [flag('detailed')]); await h.alerts[0].onConfirm();
  assert.equal(h.sent.map(m => m.content).join(''), copied);
  for (const m of h.sent) {
    assert.ok(!/[\ud800-\udbff]$/.test(m.content));
    assert.ok(!/^[\udc00-\udfff]/.test(m.content));
  }
});

test('failed chunk stops further sends, reports partial progress, releases lock for retry', async () => {
  const h = setup(); h.plugin.onLoad(); many(h, 120);
  let calls = 0;
  h.actions.sendMessage = async () => { if (++calls === 2) return { ok: false }; return { ok: true }; };
  await h.run(); await h.alerts[0].onConfirm();
  assert.equal(calls, 2); assert.match(h.local.at(-1).content, /1\/\d+ messages sent/);
  h.actions.sendMessage = async () => { calls++; };
  await h.run(); await h.alerts[1].onConfirm(); assert.ok(calls > 2);
});

test('duplicate invocations are blocked during sends, unloading stops remaining chunks', async () => {
  const h = setup(); h.plugin.onLoad(); many(h);
  let release, calls = 0;
  h.actions.sendMessage = () => { calls++; return new Promise(resolve => { release = resolve; }); };
  await h.run(); await h.run();
  const pending = h.alerts[0].onConfirm();
  await h.alerts[1].onConfirm();
  assert.equal(calls, 1); assert.match(h.local.at(-1).content, /already being sent/);
  h.plugin.onUnload(); release(); await pending; assert.equal(calls, 1);
});

test('missing APIs and thrown lookups produce local errors without public sends', async () => {
  const h = setup(); h.plugin.onLoad(); many(h);
  delete h.V.ui.alerts.showConfirmationAlert;
  await h.run(); assert.equal(h.sent.length, 0); assert.match(h.local.at(-1).content, /confirmation is unavailable/);
  h.V.metro.findByProps = () => { throw new Error('Module unavailable'); };
  await h.run('plugin-list', [flag('private')]); assert.equal(h.sent.length, 0); assert.ok(h.toasts.length > 0);
  h.V.themes.themes = undefined;
  await h.run('theme-list'); assert.match(h.toasts.at(-1), /storage is unavailable/);
  await h.run('plugin-list', [], {}); assert.match(h.toasts.at(-1), /Open a channel/);
});

test('settings render using basic React Native controls and safely initialize old storage', () => {
  const h = setup(); h.plugin.onLoad();
  const tree = h.plugin.settings();
  assert.equal(tree.type, 'ScrollView');
  const switches = tree.children.filter(c => c.type === 'View').map(row => row.children[1]);
  assert.equal(switches.length, 3);
  assert.ok(switches.every(s => s.props.value === false));
  switches[2].props.onValueChange(true); assert.equal(h.V.plugin.storage.privatePreview, true);
});


test('detailed clipboard output shows one visible URL and falls back from invalid entry IDs', async () => {
  const h = setup(); h.plugin.onLoad();
  h.V.plugins.plugins['https://example.com/plugin_(test)/'] = {
    id: 'not-a-url', enabled: true, manifest: { name: 'Useful', description: 'Does useful things.', authors: ['Me'] }
  };
  await h.run('plugin-list', [flag('detailed'), flag('copy')]);
  assert.match(h.copied[0], /> \*\*URL\*\*: <https:\/\/example.com\/plugin_%28test%29\/>/);
  assert.equal((h.copied[0].match(/https:\/\//g) || []).length, 1);
  assert.ok(!h.copied[0].includes('[Install]'));
  assert.match(h.toasts.at(-1), /Copied part 1\/1 \(\d+\/2000 characters\)/);
  assert.equal(h.sent.length, 0);
  h.V.themes.themes['https://example.com/theme.json'] = { selected: true, data: { name: 'Theme' } };
  await h.run('theme-list', [flag('detailed'), flag('copy')]);
  assert.match(h.copied[1], /> \*\*URL\*\*: <https:\/\/example.com\/theme.json>/);
});

test('long copies expose individual parts, preserve all details and never post publicly', async () => {
  const h = setup(); h.plugin.onLoad(); many(h, 45);
  await h.run('plugin-list', [flag('detailed'), flag('copy')]);
  assert.equal(h.copied.length, 1);
  const picker = h.alerts[0];
  assert.equal(picker.title, 'Copy addon list in parts');
  const buttons = picker.content.children.filter(c => c.type === 'TouchableOpacity');
  assert.ok(buttons.length > 1);
  for (let i = 0; i < buttons.length; i++) {
    const before = h.copied.length;
    await buttons[i].props.onPress();
    const chunk = h.copied.at(-1);
    assert.equal(h.copied.length, before + 1);
    assert.ok(chunk.length > 0 && chunk.length <= 2000);
    assert.ok(buttons[i].children[0].children[0].includes(`${chunk.length}/2000 characters`));
    assert.ok(!chunk.startsWith('> **Description**'));
  }
  const text = h.copied.slice(1).join('');
  assert.equal((text.match(/> \*\*Name\*\*:/g) || []).length, 45);
  assert.equal((text.match(/> \*\*URL\*\*:/g) || []).length, 45);
  assert.ok(text.includes('https://example.com/44/'));
  picker.onConfirm();
  assert.equal(h.sent.length, 0); assert.equal(h.local.length, 0);
});

test('full Nitro copies and sends use 4000; free, Classic and Basic use 2000', async () => {
  for (const premiumType of [undefined, 0, 1, 2, 3]) {
    const h = setup(); h.plugin.onLoad(); many(h, 60);
    h.V.metro.findByStoreName = () => ({ getCurrentUser: () => ({ premiumType }) });
    const limit = premiumType === 2 ? 4000 : 2000;
    const copied = await copyAll(h, [flag('detailed')]);
    const parts = h.copied.slice();
    assert.ok(parts.every(p => p.length > 0 && p.length <= limit));
    assert.ok(parts.some(p => p.length > (limit === 4000 ? 2000 : 1500)));
    assert.match(h.toasts.at(-1), new RegExp(`/${limit} characters`));
    await h.run('plugin-list', [flag('detailed')]);
    await h.alerts[0].onConfirm();
    assert.equal(h.sent.map(m => m.content).join(''), copied);
    assert.ok(h.sent.every(m => m.content.length <= limit));
  }
});

test('Nitro detection is refreshed on each action and failing user lookups safely use 2000', async () => {
  const h = setup(); h.plugin.onLoad(); many(h, 60);
  let premiumType = 2;
  h.V.metro.findByStoreName = () => ({ getCurrentUser: () => ({ premiumType }) });
  await h.run('plugin-list', [flag('detailed'), flag('copy'), { name: 'part', value: 1 }]);
  assert.ok(h.copied[0].length > 2000);
  premiumType = 3;
  await h.run('plugin-list', [flag('detailed'), flag('copy'), { name: 'part', value: 1 }]);
  assert.ok(h.copied[1].length <= 2000);
  h.V.metro.findByStoreName = () => { throw new Error('UserStore unavailable'); };
  await h.run('plugin-list', [flag('detailed'), flag('copy'), { name: 'part', value: 1 }]);
  assert.ok(h.copied[2].length <= 2000); assert.equal(h.errors.length, 0);
});

test('explicit copy part works without a picker; invalid parts leave the clipboard alone', async () => {
  const h = setup(); h.plugin.onLoad(); many(h);
  await h.run('plugin-list', [flag('copy')]);
  const buttons = h.alerts[0].content.children.filter(c => c.type === 'TouchableOpacity');
  await buttons[1].props.onPress();
  const second = h.copied.at(-1);
  delete h.V.ui.alerts.showConfirmationAlert;
  await h.run('plugin-list', [flag('copy'), { name: 'part', value: 2 }]);
  assert.equal(h.copied.at(-1), second);
  const count = h.copied.length;
  for (const value of [0, -1, 1.5, 999, 'invalid'])
    await h.run('plugin-list', [flag('copy'), { name: 'part', value }]);
  assert.equal(h.copied.length, count);
  assert.match(h.local.at(-1).content, /Choose a copy part from 1/);
  await h.run('plugin-list', [flag('copy')]);
  assert.equal(h.copied.length, count);
  assert.match(h.local.at(-1).content, /Use copy with part: 1/);
  assert.equal(h.sent.length, 0);
});

test('a long URL remains complete at chunk boundaries; oversized URLs report an error', async () => {
  const h = setup(); h.plugin.onLoad();
  const url = 'https://example.com/' + 'x'.repeat(1850);
  h.V.plugins.plugins[url] = { enabled: true, manifest: { name: 'Long URL', description: 'Description '.repeat(40) } };
  const copied = await copyAll(h, [flag('detailed')]);
  assert.ok(copied.includes(`> **URL**: <${url}>`));
  assert.ok(h.copied.some(part => part.includes(`<${url}>`)));
  assert.ok(h.copied.every(part => part.length <= 2000));
  const count = h.copied.length;
  h.V.plugins.plugins = { ['https://example.com/' + 'x'.repeat(4000)]: { manifest: { name: 'Too long' } } };
  await h.run('plugin-list', [flag('detailed'), flag('copy')]);
  assert.equal(h.copied.length, count);
  assert.match(h.local.at(-1).content, /install URL exceeds the 2000-character message limit/);
  assert.equal(h.sent.length, 0);
});

test('settings copy respects detailed defaults and obsolete picker buttons cannot overwrite clipboard', async () => {
  const h = setup(); h.plugin.onLoad(); many(h, 45);
  h.V.plugin.storage.pluginListAlwaysDetailed = true;
  const button = h.plugin.settings().children.find(c => c.props?.accessibilityLabel === 'Copy plugin list');
  await button.props.onPress();
  assert.match(h.copied[0], /> \*\*URL\*\*:/);
  assert.ok(h.copied[0].length <= 2000);
  const pickerButton = h.alerts[0].content.children.find(c => c.type === 'TouchableOpacity');
  const count = h.copied.length;
  h.plugin.onUnload(); h.plugin.onLoad();
  await pickerButton.props.onPress();
  assert.equal(h.copied.length, count);
});


function setupCore() {
  const h = setup();
  let originalCalls = 0, patches = 0, unpatches = 0;
  const original = { name: 'plugins', id: '-3', applicationId: '-1', type: 1, inputType: 1,
    description: 'Send list of installed plugins',
    options: [{ name: 'ephemeral', type: 5, description: 'Only show to me' }],
    execute: () => { originalCalls++; }
  };
  const other = { ...original, id: '123', applicationId: '456', options: [] };
  const commandModule = { getBuiltInCommands: () => [original, other, ...h.commands.values()] };
  h.V.metro.common.commands = commandModule;
  h.V.patcher = { after(name, target, callback) {
    patches++;
    const previous = target[name];
    target[name] = function(...args) { return callback(args, previous.apply(this, args)); };
    return () => { unpatches++; target[name] = previous; };
  } };
  const core = () => commandModule.getBuiltInCommands(1, true, false).find(c => c.id === '-3');
  return { ...h, original, other, commandModule, core,
    get originalCalls() { return originalCalls; }, get patches() { return patches; }, get unpatches() { return unpatches; },
    runCore: (args = []) => core().execute(args, { channel: { id: '123456789012345678' } })
  };
}

test('existing /plugins is enhanced in place, exposes visible URLs by default and sends only once', async () => {
  const h = setupCore(); h.plugin.onLoad(); h.plugin.onLoad();
  h.V.plugins.plugins['https://example.com/one/'] = { enabled: true, manifest: { name: 'One', authors: ['Me'] } };
  const command = h.core();
  assert.equal(command.id, h.original.id); assert.equal(command.applicationId, '-1');
  assert.ok(command !== h.original); assert.equal(h.core(), command);
  assert.equal(h.commandModule.getBuiltInCommands().filter(c => c.applicationId === '-1' && c.name === 'plugins').length, 1);
  assert.ok(h.commandModule.getBuiltInCommands().includes(h.other));
  assert.equal(h.original.options.length, 1); assert.equal(h.patches, 1);
  assert.deepEqual(Array.from(command.options, o => o.name), ['ephemeral', 'detailed', 'private', 'copy', 'part']);
  assert.equal(await h.runCore(), undefined);
  assert.equal(h.sent.length, 1); assert.equal(h.originalCalls, 0);
  assert.match(h.sent[0].content, /> \*\*URL\*\*: <https:\/\/example.com\/one\/>/);
  await h.runCore([flag('detailed', false)]);
  assert.equal(h.sent.length, 2); assert.ok(!h.sent[1].content.includes('URL'));
});

test('/plugins keeps ephemeral preview, private override, copy priority and part selection', async () => {
  const h = setupCore(); h.plugin.onLoad(); many(h, 45);
  await h.runCore([flag('ephemeral')]);
  assert.ok(h.local.length > 1); assert.equal(h.sent.length, 0); assert.equal(h.alerts.length, 0);
  assert.ok(h.local.every(m => m.content.length <= 2000));
  assert.ok(h.local.some(m => m.content.includes('URL')));
  const localCount = h.local.length;
  await h.runCore([flag('ephemeral'), flag('copy'), { name: 'part', value: 2 }]);
  assert.equal(h.copied.length, 1); assert.ok(h.copied[0].length <= 2000);
  assert.equal(h.local.length, localCount); assert.equal(h.sent.length, 0);
  await h.runCore([flag('ephemeral'), flag('private', false)]);
  assert.equal(h.alerts.length, 1); assert.equal(h.alerts[0].title, 'Send addon list?');
  await h.alerts[0].onConfirm();
  assert.ok(h.sent.length > 1); assert.equal(h.originalCalls, 0);
});

test('/plugins uses Nitro limits and restores the original command on disable or cached invocation', async () => {
  const h = setupCore(); h.plugin.onLoad(); many(h, 60);
  h.V.metro.findByStoreName = () => ({ getCurrentUser: () => ({ premiumType: 2 }) });
  await h.runCore([flag('copy'), { name: 'part', value: 1 }]);
  assert.ok(h.copied[0].length > 2000 && h.copied[0].length <= 4000);
  const cached = h.core();
  h.plugin.onUnload();
  assert.equal(h.unpatches, 1); assert.equal(h.core(), h.original);
  await cached.execute([], {});
  assert.equal(h.originalCalls, 1);
  h.plugin.onLoad();
  assert.equal(h.patches, 2);
  await cached.execute([], {}); assert.equal(h.originalCalls, 2);
  assert.equal(h.copied.length, 1);
  await h.runCore([flag('copy'), { name: 'part', value: 1 }]);
  assert.equal(h.copied.length, 2);
});

test('an unavailable /plugins hook preserves Addon List commands and unload cleanup', async () => {
  const h = setupCore();
  h.V.patcher.after = () => { throw new Error('Unsupported command module'); };
  h.plugin.onLoad();
  assert.equal(h.commands.size, 2); assert.equal(h.core(), h.original);
  await h.run('plugin-list', [flag('copy')]); assert.equal(h.copied.length, 1);
  h.plugin.onUnload(); assert.equal(h.commands.size, 0);
});
