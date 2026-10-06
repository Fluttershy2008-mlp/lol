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
        ReactNative: { ScrollView: 'ScrollView', View: 'View', Text: 'Text', Switch: 'Switch', TouchableOpacity: 'TouchableOpacity', useColorScheme: () => 'dark' } },
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
  await h.run('plugin-list', [flag('copy')]);
  await h.run();
  assert.equal(h.sent.length, 0); assert.equal(h.alerts.length, 1);
  await h.alerts[0].onConfirm(); await h.alerts[0].onConfirm();
  assert.ok(h.sent.length > 1);
  assert.ok(h.sent.every(message => message.content.length <= 2000 && message.content.length > 0));
  assert.equal(h.sent.map(message => message.content).join(''), h.copied[0]);
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
  assert.equal(h.copied.length, 1); assert.equal(h.sent.length, 0); assert.equal(h.alerts.length, 0);
  await h.run('plugin-list', [flag('private', false)]);
  assert.equal(h.alerts.length, 1);
});

test('emoji at message boundaries retain complete Unicode surrogate pairs', async () => {
  const h = setup(); h.plugin.onLoad();
  h.V.plugins.plugins = { x: { id: 'https://example.com/' + '😀'.repeat(2500), manifest: { name: 'Emoji', authors: [] } } };
  await h.run('plugin-list', [flag('detailed'), flag('copy')]);
  await h.run('plugin-list', [flag('detailed')]); await h.alerts[0].onConfirm();
  assert.equal(h.sent.map(m => m.content).join(''), h.copied[0]);
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
