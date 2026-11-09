const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const subscriptions = [];
const modules = [];
const cleanups = [];
const cache = { images: true, emojis: true, stickers: true, cosmetics: true };
const storage = { cache, set(patch) { Object.assign(cache, patch); } };
function addModule(mod) {
  modules.push(mod);
  for (const sub of subscriptions) if (sub.active && sub.filter(mod)) sub.cb(mod);
}
const finders = {
  filters: {
    createFilterGenerator: predicate => (...args) => mod => predicate(args, 0, mod, true),
    withProps: (...keys) => mod => keys.every(key => key in mod),
    withName: name => mod => mod.name === name
  },
  getModules(filter, cb) {
    const sub = { filter, cb, active: true };
    subscriptions.push(sub);
    for (const mod of modules) if (filter(mod)) cb(mod);
    return () => { sub.active = false; };
  }
};
const patcher = {
  instead(target, key, cb) {
    const old = target[key];
    const wrapped = function (...args) { return cb.call(this, args, old); };
    target[key] = wrapped;
    return () => { if (target[key] === wrapped) target[key] = old; };
  },
  before(target, key, cb) {
    const old = target[key];
    const wrapped = function (...args) { return old.apply(this, cb(args)); };
    target[key] = wrapped;
    return () => { if (target[key] === wrapped) target[key] = old; };
  },
  after(target, key, cb) {
    const old = target[key];
    const wrapped = function (...args) { return cb(old.apply(this, args)); };
    target[key] = wrapped;
    return () => { if (target[key] === wrapped) target[key] = old; };
  }
};
const runtime = { jsx: (type, props, key) => ({ type, props, key }), jsxs: (type, props) => ({ type, props }) };
const originalJSX = runtime.jsx;
let avatarAnimationArgument;
const images = { getUserAvatarURL: (user, animate) => { avatarAnimationArgument = animate; return user.url; } };
const directAvatar = { getStatusSize() {}, default: { type: props => props.animate === true } };
class GuildIcon {
  constructor(props) { this.props = props; }
  render() { return this.props.animate === true; }
}
const originalIconRender = GuildIcon.prototype.render;
const originalAvatarType = directAvatar.default.type;
class User { getAvatarURL() { return 'https://cdn.discordapp.com/avatars/5/a_user.webp?size=64'; } }
addModule(User);
const originalUserAvatar = User.prototype.getAvatarURL;
const nativeChat = { updateRows(ref, data) { return { ref, data }; } };
const originalNativeUpdate = nativeChat.updateRows;
addModule(directAvatar);
addModule(GuildIcon);
addModule(runtime);
addModule(images);
const script = fs.readFileSync(__dirname + '/../index.js', 'utf8');
// This is Valenced createOptionsFactory's actual expression/default contract.
const context = { valenced: { modules: { finders, native: { getNativeModule(name) { if(name==='NativeChatModule')return nativeChat;throw new Error('not available'); } } }, patcher }, plugin: options => options };
const factory = vm.runInNewContext('(function (valenced, plugin) { return ' + script + '\n})', {});
const plugin = factory(context.valenced, context.plugin).default;
assert.equal(typeof plugin.start, 'function');
const api = { jsonStorage: storage, cleanup(...fns) { cleanups.push(...fns); } };
plugin.init(api);
plugin.start(api);
assert.equal(new User().getAvatarURL(), 'https://cdn.discordapp.com/avatars/5/a_user.gif?size=64');
// Rows may be created/cached outside RowManager. The final chat handoff must
// still fix their URLs immediately before the native serializer receives them.
const commands = {
  updateRows(ref, data) { return { ref, data }; },
  clearRows() {}, scrollToBottom() {}
};
const originalCommandsUpdate = commands.updateRows;
addModule(commands);
const animatedURL = 'https://cdn.discordapp.com/avatars/7/a_final.webp?size=80&format=webp&animated=false';
const textLink = 'https://cdn.discordapp.com/avatars/7/a_text.webp';
const payload = Object.freeze({ rows: Object.freeze([Object.freeze({
  message: Object.freeze({
    avatarURL: animatedURL,
    content: Object.freeze([{ type: 'text', content: textLink }]),
    attachments: Object.freeze([{ url: textLink }]),
    referencedMessage: { message: { avatar_url: 'https://cdn.discordapp.com/guilds/2/users/7/avatars/a_member.png' } },
    author: { avatar: { source: { uri: 'https://cdn.discordapp.com/avatars/7/a_nested.png' } } }
  })
})]), unrelated: 'keep' });
const handoff = commands.updateRows('view-ref', payload);
assert.equal(handoff.ref, 'view-ref');
assert.equal(handoff.data.rows[0].message.avatarURL, 'https://cdn.discordapp.com/avatars/7/a_final.gif?size=80');
assert.equal(payload.rows[0].message.avatarURL, animatedURL);
assert.equal(handoff.data.rows[0].message.content, payload.rows[0].message.content);
assert.equal(handoff.data.rows[0].message.attachments, payload.rows[0].message.attachments);
assert.equal(handoff.data.rows[0].message.referencedMessage.message.avatar_url.endsWith('.gif'), true);
assert.equal(handoff.data.rows[0].message.author.avatar.source.uri.endsWith('.gif'), true);
assert.equal(handoff.data.unrelated, 'keep');
const serialized = JSON.stringify(payload.rows);
const sent = nativeChat.updateRows('legacy', serialized);
assert.equal(typeof sent.data, 'string');
assert.equal(JSON.parse(sent.data)[0].message.avatarURL, 'https://cdn.discordapp.com/avatars/7/a_final.gif?size=80');
assert.equal(JSON.parse(sent.data)[0].message.content[0].content, textLink);
const wrapped = commands.updateRows('wrapped', { rows: JSON.stringify(payload.rows) });
assert.equal(typeof wrapped.data.rows, 'string');
assert.equal(JSON.parse(wrapped.data.rows)[0].message.avatarURL, 'https://cdn.discordapp.com/avatars/7/a_final.gif?size=80');
const unchanged = { rows: [{ message: { avatarURL: 'https://cdn.discordapp.com/avatars/7/static.webp' } }] };
assert.equal(commands.updateRows(1, unchanged).data, unchanged);
assert.equal(nativeChat.updateRows(1, '{bad-json').data, '{bad-json');
// Chat may deliberately omit decoration URLs even though cached users have
// decoration assets (the beta12 phone report: 209 binds, zero frame loads).
const decoratedUsers = {
  '101': { avatarDecorationData: { asset: 'a_fixture', skuId: 'unrelated-sku' } },
  '102': { avatar_decoration_data: { asset: 'a_other' } },
  '103': { avatarDecorationData: null }
};
addModule({ getUser(id) { return decoratedUsers[id]; }, getCurrentUser() { return {}; } });
addModule({ getMember(guild,id) { return guild==='guild' && id==='101' ? {avatarDecorationData:{asset:'a_server'}} : undefined; }, getMembers() { return []; } });
const missingDecoration = Object.freeze({rows:Object.freeze([{message:Object.freeze({
  authorId:'101',avatarURL:'https://cdn.discordapp.com/avatars/101/static.png',avatarDecorationURL:null,
  content:Object.freeze([{type:'text',content:'do not change'}]),attachments:Object.freeze([{url:'https://example.com/file.png'}])
}) }]) });
const filled = commands.updateRows('decorated',missingDecoration).data;
assert.equal(filled.rows[0].message.avatarDecorationURL,'https://cdn.discordapp.com/avatar-decoration-presets/a_fixture.png?size=256&passthrough=true');
assert.equal(missingDecoration.rows[0].message.avatarDecorationURL,null);
assert.equal(filled.rows[0].message.content,missingDecoration.rows[0].message.content);
assert.equal(filled.rows[0].message.attachments,missingDecoration.rows[0].message.attachments);
const implicitAuthor = {rows:[{message:{avatarURL:'https://cdn.discordapp.com/avatars/102/static.webp'}}]};
assert.equal(commands.updateRows('infer-author',implicitAuthor).data.rows[0].message.avatarDecorationURL,'https://cdn.discordapp.com/avatar-decoration-presets/a_other.png?size=256&passthrough=true');
const memberDecoration = {rows:[{message:{authorId:'101',guildId:'guild',avatarURL:'https://cdn.discordapp.com/avatars/101/static.png'}}]};
assert.match(commands.updateRows('member',memberDecoration).data.rows[0].message.avatarDecorationURL,/a_server\.png/);
const preserveDecoration = {rows:[{message:{authorId:'101',avatarURL:'https://cdn.discordapp.com/avatars/101/static.png',avatarDecorationURL:'already-provided'}}]};
assert.equal(commands.updateRows('preserve',preserveDecoration).data,preserveDecoration);
const explicitlyNone = {rows:[{message:{authorId:'101',avatarURL:'https://cdn.discordapp.com/avatars/101/static.png',avatarDecorationData:null}}]};
assert.equal(commands.updateRows('none',explicitlyNone).data,explicitlyNone);
const serializedDecoration = JSON.parse(nativeChat.updateRows('json-decoration',JSON.stringify(missingDecoration.rows)).data);
assert.match(serializedDecoration[0].message.avatarDecorationURL,/a_fixture\.png/);
const shopStill='https://cdn.discordapp.com/media/v1/collectibles-shop/12345/default/static?size=256';
const shopMessage=Object.freeze({rows:[{message:Object.freeze({avatarURL:'https://cdn.discordapp.com/avatars/101/static.png',avatarDecorationURL:shopStill,content:[{type:'text',content:shopStill}],attachments:[{url:shopStill}]})}]});
const shopAnimated=commands.updateRows('shop',shopMessage).data;
assert.equal(shopAnimated.rows[0].message.avatarDecorationURL,'https://cdn.discordapp.com/media/v1/collectibles-shop/12345/default/animated?size=256');
assert.equal(shopAnimated.rows[0].message.content,shopMessage.rows[0].message.content);
assert.equal(shopAnimated.rows[0].message.attachments,shopMessage.rows[0].message.attachments);
const presetStill={rows:[{message:{avatarURL:'https://cdn.discordapp.com/avatars/103/static.png',avatarDecorationURL:'https://cdn.discordapp.com/avatar-decoration-presets/a_frame.png?size=128&passthrough=false'}}]};
assert.equal(commands.updateRows('preset',presetStill).data.rows[0].message.avatarDecorationURL,'https://cdn.discordapp.com/avatar-decoration-presets/a_frame.png?size=128&passthrough=true');
decoratedUsers['404']={avatarDecorationData:{skuId:'987654'}};
const skuOnly={rows:[{message:{authorId:'404',avatarURL:'https://cdn.discordapp.com/avatars/404/static.png'}}]};
assert.equal(commands.updateRows('sku-only',skuOnly).data.rows[0].message.avatarDecorationURL,'https://cdn.discordapp.com/media/v1/collectibles-shop/987654/animated');
console.log('PASS: shop static-to-animated URLs, preset APNG passthrough, SKU-only cached decorations, frozen records and content preservation.');
for(const override of [{avatarURL:null},{avatarURL:''},{avatarURL:undefined},{isFirst:false},{showAvatar:false},{shouldShowAvatar:false}]) {
  const message=Object.freeze({authorId:'101',avatarURL:'https://cdn.discordapp.com/avatars/101/static.png',avatarDecorationURL:null,...override});
  const group={rows:[{type:1,message}]};
  assert.equal(commands.updateRows('grouped',group).data.rows[0].message.avatarDecorationURL,null,'avatar-less/grouped records cannot acquire a cached frame');
}
cache.images=false;
assert.equal(commands.updateRows('disabled-decoration',missingDecoration).data,missingDecoration);
cache.images=true;
console.log('PASS: missing chat decoration URLs restored from cached user/member data, inferred author, explicit metadata precedence, frozen inputs, serialization, text/attachment preservation and settings.');
cache.images=false;
assert.equal(commands.updateRows(1, payload).data, payload);
assert.equal(nativeChat.updateRows(1, serialized).data, serialized);
cache.images=true;
assert.equal(directAvatar.default.type(Object.freeze({})), true);
const guildIconProps = Object.freeze({});
const guildIcon = new GuildIcon(guildIconProps);
assert.equal(guildIcon.render(), true);
assert.equal(guildIcon.props, guildIconProps);
const input = Object.freeze({ animate: false, source: Object.freeze({ uri: 'https://cdn.discordapp.com/avatars/12/a_abc.webp?size=128' }) });
const avatar = { displayName: 'Avatar' };
const animated = runtime.jsx(avatar, input, 'key');
assert.equal(animated.props.animate, true);
assert.equal(animated.props.source.uri, 'https://cdn.discordapp.com/avatars/12/a_abc.gif?size=128');
assert.equal(animated.key, 'key');
assert.equal(input.animate, false);
assert.equal(input.source.uri.endsWith('.webp?size=128'), true);
const unrelated = Object.freeze({ visible: false, source: { uri: 'https://example.com/test.png' } });
assert.equal(runtime.jsx({ displayName: 'Modal' }, unrelated).props, unrelated);
assert.equal(runtime.jsx(() => null, input).props.source.uri.endsWith('.gif?size=128'), true);
assert.equal(runtime.jsx(avatar, Object.freeze({})).props.animate, true);
assert.equal(images.getUserAvatarURL({ url: 'https://cdn.discordapp.com/avatars/12/static.webp' }), 'https://cdn.discordapp.com/avatars/12/static.webp');
assert.equal(images.getUserAvatarURL({ url: 'https://example.com/avatars/12/a_abc.webp' }), 'https://example.com/avatars/12/a_abc.webp');
assert.equal(images.getUserAvatarURL({ url: 3 }), 3);
assert.equal(avatarAnimationArgument, true);
assert.equal(images.getUserAvatarURL({ url: 'https://cdn.discordapp.com/guilds/2/users/12/avatars/a_def.png' }), 'https://cdn.discordapp.com/guilds/2/users/12/avatars/a_def.gif');
cache.images = false;
assert.equal(runtime.jsx(avatar, input).props, input);
assert.equal(directAvatar.default.type({}), false);
assert.equal(guildIcon.render(), false);
images.getUserAvatarURL({ url: '' }, false);
assert.equal(avatarAnimationArgument, false);
cache.images = true;
const resolver = {
  getAvatarDecorationURL: options => options.canAnimate,
  getGuildMemberAvatarURLSimple: options => options.canAnimate
};
addModule(resolver);
const frozenOptions = Object.freeze({ canAnimate: false });
assert.equal(resolver.getAvatarDecorationURL(frozenOptions), true);
assert.equal(resolver.getGuildMemberAvatarURLSimple(frozenOptions), true);
assert.equal(frozenOptions.canAnimate, false);
// Modules first loaded after startup must be patched as well.
const laterImages = { getGuildIconURL: () => 'https://cdn.discordapp.com/icons/2/a_abc.png' };
addModule(laterImages);
assert.equal(laterImages.getGuildIconURL(), 'https://cdn.discordapp.com/icons/2/a_abc.gif');
addModule({ getCustomEmojiById: id => ({ animated: id === '123' }) });
class RowManager { generate(row) { return row; } }
const originalGenerate = RowManager.prototype.generate;
addModule(RowManager);
const animatedEmoji = Object.freeze({ type: 'customEmoji', id: '123', src: 'https://cdn.discordapp.com/emojis/123.webp?size=48', frozenSrc: 'https://cdn.discordapp.com/emojis/123.png' });
const staticEmoji = Object.freeze({ type: 'customEmoji', id: '456', src: 'https://cdn.discordapp.com/emojis/456.webp' });
const spoiler = Object.freeze({ type: 'spoiler', content: [animatedEmoji] });
const row = Object.freeze({ type: 1, message: Object.freeze({
  content: [animatedEmoji, staticEmoji, spoiler],
  stickers: [Object.freeze({ format_type: 3, renderMode: 1 }), Object.freeze({ format_type: 1, renderMode: 1 })],
  referencedMessage: { message: { content: [animatedEmoji] } }
}) });
const out = new RowManager().generate(row);
assert.notEqual(out, row);
assert.equal(out.message.content[0].src, 'https://cdn.discordapp.com/emojis/123.gif?size=48');
assert.equal(out.message.content[0].frozenSrc, animatedEmoji.frozenSrc);
assert.equal(out.message.animateEmoji, true);
assert.equal(out.message.content[1], staticEmoji);
assert.equal(out.message.content[2], spoiler);
assert.equal(out.message.stickers[0].renderMode, 0);
assert.equal(out.message.stickers[1].renderMode, 1);
assert.equal(row.message.stickers[0].renderMode, 1);
assert.equal(out.message.referencedMessage.message.content[0].src.endsWith('.gif?size=48'), true);
for (const tag of ['type', 'rowType']) {
  const avatarRow = Object.freeze({ [tag]: 1, message: Object.freeze({ avatarURL: 'https://cdn.discordapp.com/avatars/1/a_abc.webp' }) });
  assert.equal(new RowManager().generate(avatarRow).message.avatarURL.endsWith('.gif'), true);
  assert.equal(avatarRow.message.avatarURL.endsWith('.webp'), true);
}
cache.emojis = false; cache.stickers = false;
assert.equal(new RowManager().generate(row), row);
cache.emojis = true; cache.stickers = true;
const nativeEmoji={rows:[{type:1,message:{authorId:'101',avatarURL:null,isFirst:false,animateEmoji:false,content:[animatedEmoji]}}]};
const nativeEmojiOut=commands.updateRows('emoji-handoff',nativeEmoji).data;
assert.equal(nativeEmojiOut.rows[0].message.animateEmoji,true);
assert.equal(nativeEmojiOut.rows[0].message.content[0].frozenSrc,animatedEmoji.frozenSrc);
assert.equal(nativeEmojiOut.rows[0].message.content[0].src,'https://cdn.discordapp.com/emojis/123.gif?size=48');
assert.equal(nativeEmoji.rows[0].message.animateEmoji,false);
const emojiSettings={AnimateEmoji:{getSetting:()=>false,useSetting:()=>false}};addModule(emojiSettings);
assert.equal(emojiSettings.AnimateEmoji.getSetting(),true);assert.equal(emojiSettings.AnimateEmoji.useSetting(),true);
cache.emojis=false;assert.equal(emojiSettings.AnimateEmoji.getSetting(),false);cache.emojis=true;
cache.images=false;assert.equal(commands.updateRows('emoji-without-images',nativeEmoji).data.rows[0].message.animateEmoji,true);cache.images=true;
const suppressedAvatar=Object.freeze({hidden:true,animate:false,source:{uri:'https://cdn.discordapp.com/avatars/1/a_hidden.png'}});
assert.equal(runtime.jsx(avatar,suppressedAvatar).props,suppressedAvatar);
console.log('PASS: grouped/hidden avatar preservation, native emoji animation flag, unchanged frozenSrc, canonical emoji settings and independent image/emoji switches.');
// Vencord parity: status emoji, banners, role gradients and nameplate loops.
const anonymous = function a() {};
const ordinaryAnimation = Object.freeze({ animate: false, loop: false });
assert.equal(runtime.jsx(anonymous, ordinaryAnimation).props, ordinaryAnimation);
for (const [name, group] of [
  ['CustomStatus', 'emojis'], ['UserStatus', 'emojis'], ['StatusEmoji', 'emojis'],
  ['GuildBanner', 'images'], ['RoleGradient', 'cosmetics'], ['GradientRole', 'cosmetics'],
  ['Nameplate', 'cosmetics'], ['Sticker', 'stickers']
]) {
  const type = { displayName: name };
  const props = Object.freeze({ animate: false, canAnimate: false, loop: false });
  const result = runtime.jsx(type, props).props;
  assert.equal(result.animate, true, name);
  assert.equal(result.canAnimate, true, name);
  if (group === 'emojis') assert.equal(result.animateEmoji, true, name);
  if (group === 'cosmetics' || group === 'stickers') {
    assert.equal(result.loop, true, name);
    assert.equal(runtime.jsx(type, Object.freeze({})).props.loop, true, 'default loop: ' + name);
  }
  cache[group] = false;
  assert.equal(runtime.jsx(type, props).props, props, name + ' respects its switch');
  cache[group] = true;
  for (const hidden of [{hidden:true}, {visible:false}, {isHidden:true}]) {
    const input = Object.freeze({...props, ...hidden});
    assert.equal(runtime.jsx(type, input).props, input, name + ' stays hidden');
  }
}
for (const [flag, group] of [['animateEmoji', 'emojis'], ['animateGradient', 'cosmetics'], ['canAnimate', 'images']]) {
  const props = Object.freeze({ [flag]: false });
  assert.equal(runtime.jsx(anonymous, props).props[flag], true, flag);
  assert.equal(props[flag], false, 'never mutate incoming props');
  cache[group] = false;
  assert.equal(runtime.jsx(anonymous, props).props, props, 'anonymous switch: ' + group);
  cache[group] = true;
}
const gradients = Object.freeze({animateGradient:false, canAnimate:false});
cache.cosmetics = false;
assert.equal(runtime.jsx(anonymous, gradients).props, gradients, 'images cannot override disabled roles');
cache.cosmetics = true;
const statusFlags = Object.freeze({animateEmoji:false, canAnimate:false});
cache.emojis = false;
assert.equal(runtime.jsx(anonymous, statusFlags).props, statusFlags, 'images cannot override disabled emoji');
cache.emojis = true;
assert.equal(runtime.jsx(anonymous, ordinaryAnimation).props, ordinaryAnimation, 'anonymous classification remains per-prop');
const mixed = Object.freeze({animateGradient:false, animateEmoji:false, source:{uri:'https://cdn.discordapp.com/avatars/1/a_mixed.webp'}});
const mixedResult = runtime.jsx(anonymous, mixed).props;
assert.equal(mixedResult.animateGradient, true);
assert.equal(mixedResult.animateEmoji, true);
assert.match(mixedResult.source.uri, /a_mixed\.gif$/);
assert.equal(mixed.animateGradient, false);
assert.match(mixed.source.uri, /a_mixed\.webp$/);
console.log('PASS: Vencord status/banner/role/nameplate parity, absent loop defaults, anonymous media flags, category switches, hidden props and frozen inputs.');
for (const fn of cleanups.reverse()) fn();
assert.equal(runtime.jsx, originalJSX);
assert.equal(RowManager.prototype.generate, originalGenerate);
assert.equal(GuildIcon.prototype.render, originalIconRender);
assert.equal(directAvatar.default.type, originalAvatarType);
assert.equal(resolver.getAvatarDecorationURL(frozenOptions), false);
assert.equal(commands.updateRows, originalCommandsUpdate);
assert.equal(nativeChat.updateRows, originalNativeUpdate);
assert.equal(User.prototype.getAvatarURL, originalUserAvatar);
assert.equal(subscriptions.every(sub => !sub.active), true);
assert.equal(new RowManager().generate(row), row);
console.log('PASS: final structured/serialized native chat handoff, a_ GIF conversion, CDN static overrides, cached/frozen rows, nested/reply avatars, text/attachment/static preservation, User model methods, existing animation hooks, switches and cleanup.');
