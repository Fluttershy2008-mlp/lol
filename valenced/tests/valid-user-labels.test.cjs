'use strict';
process.env.PLUGIN_TEST_TARGET = 'valenced';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createWorld, CHANNEL, FRIEND } = require('../../revenge-next/tests/next-harness.cjs');

const USER = '100000000000000004';
const OTHER = '100000000000000005';
const LOG = '900000000000000002';
const mention = (id = USER, extra = {}) => ({ type: 'mention', parsedUserId: id, channelId: CHANNEL,
    content: [{ type: 'text', content: `<@${id}>` }], ...extra });
const label = ast => ast[0].content[0].content;
const row = message => ({ type: 1, changeType: 0, message: { id: LOG, channelId: CHANNEL, ...message } });
const text = content => ({ type: 'text', content });
function verification(value, id = USER) {
    return { type: 'rich', title: [text('Verification Approved')], fields: [
        { rawName: 'User', rawValue: `submitted_user\n(<@${USER}>)`, name: [text('User')], value },
        { name: [text('User ID')], value: [text(id)] },
        { name: [text('Score')], value: [text('4/4')] },
    ] };
}
async function advance(w, duration) {
    for (let elapsed = 0; elapsed < duration; elapsed += 50) {
        await w.advance(50);
        for (let tick = 0; tick < 20; tick++) await Promise.resolve();
    }
}

function fixture(t, http = (_method, { url }) => ({ status: 200, body: { id: url.split('/').at(-1), username: 'log_user', global_name: 'Display Name' } })) {
    const w = createWorld({ splitHTTP: true, http });
    w.dispatcher.subscribe('USER_UPDATE', ({ user }) => {
        w.users[user.id] = user;
        w.stores.UserStore.emitChange();
    });
    class ChatManager { createRow(value) { return value; } }
    const chat = new ChatManager(), createRow = ChatManager.prototype.createRow;
    const redraws = [], nativeRows = [], chatRef = { current: {} };
    let source;
    const hook = { default: () => ({ updateRows: options => {
        redraws.push(options);
        if (options.updateMessageIds.has(LOG) && source) nativeRows.push(chat.createRow(source));
    } }) };
    const originalHook = hook.default;
    const rowManagerPath = 'modules/messages/native/hooks/useRowManager.tsx';
    w.addModule({ default: ChatManager }, 'modules/messages/native/renderer/ChatManager.tsx');
    t.after(async () => {
        for (const item of [...w.loaded.values()]) await w.stop(item);
        assert.equal(ChatManager.prototype.createRow, createRow);
        assert.equal(hook.default, originalHook);
        assert.equal(w.timers.size, 0);
        assert.equal(w.pathWaiters.size, 0);
        assert.deepEqual(w.errors, []);
    });
    return { w, chat, nativeRows, redraws, mount(value) {
        source = value;
        w.addModule(hook, rowManagerPath);
        hook.default({ channelId: CHANNEL, chatRef });
    } };
}

test('a Carl-bot embed redraws by message ID after lookup, preserving the mention target and original data', async t => {
    const f = fixture(t);
    const original = row({ embeds: [{ type: 'rich', title: 'Avatar update', description: [mention()],
        fields: [{ name: 'Actor', value: [mention()] }], footer: { content: `ID: ${USER} | <@!${USER}>` },
        rawDescription: `<@${USER}>`, image: { url: 'https://example.test/avatar.png' } }] });
    const grouped = { type: 2, content: [original] };
    f.w.messages.push({ id: LOG, channel_id: CHANNEL, author: { bot: true }, embeds: [{ rawDescription: `<@${USER}>` }] });
    const item = await f.w.start('valid-user');
    f.mount(grouped);
    assert.equal(f.chat.createRow(grouped), grouped);
    assert.equal(label(original.message.embeds[0].description), `<@${USER}>`);
    await advance(f.w, 200);
    assert.equal(f.redraws.length, 1);
    assert.deepEqual([...f.redraws[0].updateMessageIds], [LOG]);
    const redrawn = f.nativeRows[0].content[0], embed = redrawn.message.embeds[0];
    assert.equal(redrawn.changeType, 2);
    assert.equal(label(embed.description), '@log_user');
    assert.equal(embed.description[0].userId, USER);
    assert.equal(embed.description[0].channelId, CHANNEL);
    assert.equal(label(embed.fields[0].value), '@log_user');
    assert.equal(embed.footer.content, `ID: ${USER} | @log_user`);
    assert.equal(embed.rawDescription, `<@${USER}>`);
    assert.equal(embed.image, original.message.embeds[0].image);
    assert.equal(label(original.message.embeds[0].description), `<@${USER}>`);
    assert.equal(f.w.calls.filter(([kind]) => kind === 'http').length, 1);
    assert.equal(f.w.calls.some(([kind, data]) => kind === 'dispatch' && data.type === 'MESSAGE_UPDATE'), false);
    await f.w.stop(item);
    assert.equal(f.nativeRows.at(-1), grouped);
});

test('applies cached usernames across native message surfaces while preserving roles, links, text and nicknames', async t => {
    const { w, chat } = fixture(t);
    w.users[USER] = { id: USER, username: 'log_user', globalName: 'Display Name' };
    await w.start('valid-user', { autoResolve: false });
    const role = mention(USER, { roleId: USER, roleName: '@role' });
    const existing = mention(FRIEND, { userId: FRIEND, content: [{ type: 'text', content: '@guild-nickname' }] });
    const code = { type: 'inlineCode', content: `<@${USER}>` };
    const link = { type: 'link', target: `https://discord.com/users/${USER}`, content: [mention()] };
    const escaped = { type: 'text', content: `<@${USER}>` };
    const original = row({ content: [mention(), role, existing, code, link, escaped],
        components: [{ type: 17, components: [{ type: 10, content: [mention()] }] }],
        referencedMessage: { message: { content: [mention()] } } });
    const { message } = chat.createRow(original);
    assert.equal(label(message.content), '@log_user');
    assert.equal(label(message.components[0].components[0].content), '@log_user');
    assert.equal(label(message.referencedMessage.message.content), '@log_user');
    assert.deepEqual(message.content.slice(1), original.message.content.slice(1));
    for (let i = 1; i < message.content.length; i++) assert.equal(message.content[i], original.message.content[i]);
    assert.equal(label(original.message.content), `<@${USER}>`);
    await w.advance(100);
    assert.equal(w.calls.some(([kind]) => kind === 'http'), false);
});

test('a denied lookup leaves its native label in place and does not block the other mentions', async t => {
    const f = fixture(t, (_method, { url }) => url.endsWith(USER) ? { status: 403, body: {} }
        : { status: 200, body: { id: OTHER, username: 'second.user' } });
    const original = row({ content: [mention(), mention(OTHER)] });
    f.w.messages.push({ id: LOG, channel_id: CHANNEL, content: `<@${USER}> <@${OTHER}>` });
    await f.w.start('valid-user');
    f.mount(original);
    assert.equal(f.chat.createRow(original), original);
    await advance(f.w, 1000);
    const resolved = f.nativeRows.at(-1).message.content;
    assert.equal(resolved[0], original.message.content[0]);
    assert.equal(resolved[1].content[0].content, '@second.user');
    assert.equal(f.w.calls.filter(([kind]) => kind === 'http').length, 2);
    assert.deepEqual(f.w.toasts, []);
});

test('an already-rendered verification embed uses its paired User and User ID fields even when profile lookup fails', async t => {
    const f = fixture(t, () => ({ status: 404, body: {} }));
    const token = mention();
    const embed = verification([text('submitted_user\n('), token, text(')')]);
    const original = row({ embeds: [embed] });
    f.w.messages.push({ id: LOG, channel_id: CHANNEL, embeds: [{ fields: [
        { name: 'User', value: `submitted_user\n(<@${USER}>)` },
        { name: 'User ID', value: USER },
    ] }] });
    await f.w.start('valid-user');
    f.mount(original);
    await advance(f.w, 200);
    assert.equal(f.redraws.length, 1);
    const rendered = f.nativeRows[0].message.embeds[0].fields;
    assert.equal(rendered[0].value[1].content[0].content, '@submitted_user');
    assert.equal(rendered[0].value[1].parsedUserId, USER);
    assert.equal(rendered[0].value[1].userId, undefined);
    assert.equal(rendered[0].rawValue, embed.fields[0].rawValue);
    assert.equal(rendered[1], embed.fields[1]);
    assert.equal(rendered[2], embed.fields[2]);
    assert.equal(token.content[0].content, `<@${USER}>`);
    assert.equal(f.w.users[USER], undefined);
    assert.equal(f.w.calls.some(([kind, data]) => kind === 'dispatch' && data.type === 'USER_UPDATE'), false);
    f.w.users[USER] = { id: USER, username: 'current_user' };
    f.w.stores.UserStore.emitChange();
    await advance(f.w, 100);
    const updated = f.nativeRows.at(-1).message.embeds[0].fields[0].value[1];
    assert.equal(updated.content[0].content, '@current_user');
    assert.equal(updated.userId, USER);
});

test('verification display also covers literal mention tokens and prefers a username from Discord', async t => {
    const { w, chat } = fixture(t);
    w.users[USER] = { id: USER, username: 'current_user' };
    await w.start('valid-user', { autoResolve: false });
    const fields = [text('submitted_user\n('), { type: 'inlineCode', content: `<@${USER}>` }, text(')')];
    const original = row({ embeds: [verification(fields), verification(`submitted_user\n(<@!${USER}>)`)] });
    const rendered = chat.createRow(original).message.embeds;
    assert.equal(rendered[0].fields[0].value[1].content, '@current_user');
    assert.equal(rendered[0].fields[0].value[1].type, 'inlineCode');
    assert.equal(rendered[1].fields[0].value, 'submitted_user\n(@current_user)');
    assert.equal(fields[1].content, `<@${USER}>`);
});

test('a mismatched or ambiguous verification ID never supplies a label to a mention', async t => {
    const { w, chat } = fixture(t);
    await w.start('valid-user', { autoResolve: false });
    const value = [text('submitted_user\n('), mention(), text(')')];
    const ambiguous = verification(value);
    ambiguous.fields.push({ name: [text('User ID')], value: [text(OTHER)] });
    const mismatched = row({ embeds: [verification(value, OTHER), ambiguous], content: [mention()] });
    assert.equal(chat.createRow(mismatched), mismatched);
});

test('a mounted native text display updates its serialized AST without replacing its tap behavior', async t => {
    const { w } = fixture(t);
    const { React, Renderer } = w;
    const originalTap = event => w.calls.push(['originalTap', event]);
    const model = JSON.stringify({ type: 10, content: [mention()] });
    const item = await w.start('valid-user');
    let view;
    await Renderer.act(async () => {
        view = Renderer.create(React.createElement('NativeTextDisplay', {
            model, markdownTextRenderOptions: {}, onTapMention: originalTap,
        }));
    });
    assert.equal(view.root.findByType('NativeTextDisplay').props.model, model);
    await Renderer.act(async () => { await advance(w, 150); });
    const props = view.root.findByType('NativeTextDisplay').props;
    assert.equal(label(JSON.parse(props.model).content), '@log_user');
    const roleTap = { nativeEvent: { roleId: USER, parsedUserId: USER } };
    props.onTapMention(roleTap);
    assert.deepEqual(w.calls.find(([kind]) => kind === 'originalTap'), ['originalTap', roleTap]);
    await Renderer.act(async () => { await w.stop(item); });
    assert.equal(view.root.findByType('NativeTextDisplay').props.model, model);
    await Renderer.act(async () => { view.unmount(); });
});
