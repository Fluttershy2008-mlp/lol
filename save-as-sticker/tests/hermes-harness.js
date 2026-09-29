// Executed by the real Hermes CLI. pluginSource and fixtures are supplied by
// hermes.test.mjs. Discord APIs are mocked; the installed bundle runs unchanged.
var setTimeout = function (callback) { callback(); return 0; };
var console = { log: function () {} };

function elements(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.reduce(function (all, child) { return all.concat(elements(child)); }, []);
  return [tree].concat(elements(tree.props && tree.props.children));
}
function button(tree, label) {
  return elements(tree).find(function (node) {
    return node.props && (node.props.label === label || node.props.accessibilityLabel === label);
  });
}

async function exercise(fixture) {
  var states = [], hook = 0, opens = [], posts = [], writes = [], deletes = [], alerts = [], toasts = [];
  var React = {
    createElement: function (type, props) {
      props = Object.assign({}, props);
      var children = Array.prototype.slice.call(arguments, 2);
      if (children.length) props.children = children.length === 1 ? children[0] : children;
      return Object.freeze({ type: type, key: props.key, props: Object.freeze(props) });
    },
    cloneElement: function (node, props) {
      return Object.assign({}, node, { props: Object.assign({}, node.props, props) });
    },
    useState: function (initial) {
      var index = hook++;
      if (!(index in states)) states[index] = initial;
      return [states[index], function (value) { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
    },
    useEffect: function () {},
  };
  var h = React.createElement, guild = { id: '1', name: 'Test server', ownerId: 'me', premiumTier: 0 };
  var stores = {
    GuildStore: { getGuilds: function () { return { '1': guild }; }, getGuild: function () { return guild; } },
    UserStore: { getCurrentUser: function () { return { id: 'me' }; } },
    StickersStore: { getStickersByGuildId: function () { return []; } },
  };
  var host = { openLazy: function (lazy) { opens.push(lazy); }, hideActionSheet: function () {} };
  function Row() {}
  Row.Group = 'RowGroup'; Row.Icon = 'RowIcon';
  var files = {
    writeFile: function (dir, path, data) { writes.push({ path: path, data: data }); return Promise.resolve('/cache/' + path); },
    readFile: function () { throw new Error('GIF should not use the cropper'); },
    removeFile: function (dir, path) { deletes.push(path); return Promise.resolve(); },
  };
  var uploader = { createGuildSticker: function (options) { posts.push(options); return Promise.resolve({ id: 'new-sticker' }); } };
  var modules = [host, { ActionSheetRow: Row }, { ActionSheet: 'Sheet' }, files, uploader];
  var RN = {
    View: 'View', Text: 'Text', TextInput: 'TextInput', Pressable: 'Pressable', ScrollView: 'ScrollView', Image: 'Image',
    Appearance: { getColorScheme: function () { return 'dark'; } }, Dimensions: { get: function () { return { height: 900 }; } },
    Keyboard: { dismiss: function () {} }, Alert: { alert: function (title, message) { alerts.push(message); } },
  };
  var V = {
    metro: { common: { React: React, ReactNative: RN, constants: {} },
      findByStoreName: function (name) { return stores[name]; },
      findByProps: function () { var keys = Array.prototype.slice.call(arguments); return modules.find(function (m) { return keys.every(function (key) { return key in m; }); }); } },
    patcher: { before: function (key, target, callback) { var old = target[key]; target[key] = function () { var args = Array.prototype.slice.call(arguments); callback(args); return old.apply(this, args); }; return function () { target[key] = old; }; } },
    ui: { assets: { getAssetIDByName: function () { return 1; } }, components: {}, toasts: { showToast: function (message) { toasts.push(message); } } },
    utils: { safeFetch: function () { return Promise.resolve({ ok: true, headers: { get: function () { return null; } }, blob: function () { return Promise.resolve({ size: fixture.bytes, type: 'image/gif', data: fixture.base64 }); } }); } },
    logger: { error: function () {} },
  };
  // FileReader is a host API in React Native, not a Hermes built-in.
  globalThis.FileReader = function () {};
  globalThis.FileReader.prototype.readAsDataURL = function (blob) { this.result = 'data:image/gif;base64,' + blob.data; this.onload(); };
  var plugin = eval('(vendetta=>{return ' + pluginSource + '\n})')(V);
  plugin.onLoad();
  function sheet() { return h('Sheet', null, h(Row.Group, null, [h(Row, { label: 'Save Image', onPress: function () {} })])); }
  host.openLazy(Promise.resolve({ default: sheet }), 'MessageLongPressActionSheet', {
    selectedMedia: { mediaType: 'image', mediaUrl: 'https://example.com/moving.gif', source: { filename: 'moving.gif', content_type: 'image/gif' } },
  });
  var menu = await opens[opens.length - 1];
  button(menu.default(), 'Save as Sticker').props.onPress();
  var pickerModule = await opens[opens.length - 1], picker = pickerModule.default();
  function render() { hook = 0; return picker.type(picker.props); }
  button(render(), guild.name).props.onPress();
  button(render(), 'Add sticker').props.onPress();
  for (var i = 0; i < 200; i++) await Promise.resolve();
  plugin.onUnload();
  return { name: fixture.name, posts: posts, writes: writes, deletes: deletes, alerts: alerts, toasts: toasts };
}

async function run() {
  for (var i = 0; i < fixtures.length; i++) {
    print('HERMES_RESULT ' + JSON.stringify(await exercise(fixtures[i])));
  }
}
run().catch(function (error) { print('HERMES_FAILURE ' + error.message + '\n' + error.stack); });
