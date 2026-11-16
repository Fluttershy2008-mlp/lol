'use strict';
process.env.PLUGIN_TEST_TARGET = 'valenced';
process.env.TZ = 'Asia/Singapore';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createWorld, React, Renderer, ACCOUNT, FRIEND, BLOCKED, CHANNEL } = require('../../revenge-next/tests/next-harness.cjs');
const { installChatButtonsHost } = require('./chat-buttons-fixture.cjs');
const { installSettingsSection } = require('./settings-fixture.cjs');

const slug = 'streak-tracker';
const route = 'dev.fluttershy2008.streak-tracker.valenced-settings';
const previewPath = 'modules/main_tabs_v2/native/shared_components/ChannelRowPreview.tsx';
const dm = '300000000000000019', group = '300000000000000020';
const dayMS = 86400000;
const h = React.createElement;
const time = new Date('2027-01-15T23:59:59+08:00').getTime();
const day = Date.UTC(2027, 0, 15) / dayMS;
const snowflake = time => ((BigInt(time) - 1420070400000n) << 22n).toString();
const text = ui => ui.root.findAllByType('Text').map(node => node.props.children);
const fire = ui => text(ui).filter(value => typeof value === 'string' && value.startsWith('🔥 '));

async function setup(t, initial = {}, { hideFirst, hideLast, nested } = {}) {
    const w = createWorld();
    const host = installChatButtonsHost(w);
    const settings = installSettingsSection(w);
    const jsx = w.U.react.ReactJSXRuntime.jsx;
    w.channels[dm] = { id: dm, type: 1, recipients: [FRIEND] };
    w.channels[group] = { id: group, type: 3, recipients: [FRIEND, BLOCKED] };
    await w.advance(time - 1800000000000);
    if (hideFirst) await w.start('hide-blocked-and-ignored-messages');
    const item = await w.start(slug, initial);
    if (hideLast) await w.start('hide-blocked-and-ignored-messages');
    const Plain = ({ message }) => h(w.RN.Text, null, message.content);
    const Native = React.memo(props => nested ? jsx(Plain, props) : h(w.RN.Text, null, props.message.content));
    w.addModule({ ChannelRowPreview: Plain, NativeMessageChannelRowPreview: Native }, previewPath);
    const views = [];
    const mount = async element => {
        let ui;
        await Renderer.act(async () => { ui = Renderer.create(element); });
        views.push(ui);
        return ui;
    };
    t.after(async () => {
        for (const ui of views.reverse()) await Renderer.act(async () => ui.unmount());
        for (const plugin of [...w.loaded.values()].reverse()) await w.stop(plugin);
        assert.equal(w.subscriptions.get('MESSAGE_CREATE')?.size ?? 0, 0);
        assert.equal(w.appListeners.size, 0);
        assert.equal(w.pathWaiters.size, 0);
        assert.equal(host.patches.size, 0);
        assert.deepEqual(w.errors, []);
    });
    const send = opts => {
        const { channel = dm, sender = w.accountId(), at = time, optimistic, ...fields } = opts ?? {};
        const message = Object.freeze({ id: snowflake(at), channel_id: channel, author: w.users[sender],
            content: 'private text that must not be saved', type: 0, ...fields });
        return Renderer.act(async () => w.dispatcher.dispatch({ type: 'MESSAGE_CREATE', optimistic, message }));
    };
    const preview = (type, channel, author = FRIEND) => jsx(type, {
        message: { channel_id: channel, author: w.users[author], content: 'A native preview' },
    });
    return { w, item, settings, send, mount, Plain, Native, preview };
}

test('confirmed outgoing DMs count once per calendar day and expire only after a missed day', async t => {
    const { w, send, item, mount, Plain, Native, preview } = await setup(t, {}, { nested: true });
    const rows = await mount(h(React.Fragment, null, preview(Native, dm), preview(Plain, group), preview(Plain, CHANNEL)));
    await send({ sender: FRIEND });
    await send({ channel: CHANNEL });
    await send({ channel: group });
    await send({ optimistic: true });
    await send({ state: 'SENDING' });
    await send({ state: 'SEND_FAILED' });
    await send({ type: 6 });
    assert.equal(item.writes.length, 0);
    assert.deepEqual(fire(rows), []);

    await send();
    await send({ at: time - 1000, type: 19 });
    assert.deepEqual(fire(rows), ['🔥 1']);
    assert.equal(item.writes.length, 1);
    assert.equal(item.writes[0].accounts[ACCOUNT][dm].lastDay, day);
    assert.equal(JSON.stringify(item.writes[0]).includes('private text'), false);

    await Renderer.act(async () => w.advance(2000));
    await send({ at: time + 2000, type: 19 });
    assert.deepEqual(fire(rows), ['🔥 2']);
    await Renderer.act(async () => w.advance(dayMS));
    assert.deepEqual(fire(rows), ['🔥 2']);
    await Renderer.act(async () => w.advance(dayMS));
    assert.deepEqual(fire(rows), []);
    await send({ at: time + 2 * dayMS + 2000 });
    assert.deepEqual(fire(rows), ['🔥 1']);
    assert.equal(item.writes.at(-1).accounts[ACCOUNT][dm].best, 2);
});

test('native settings show saved stats, scope account changes and clear only the active account', async t => {
    const initial = { accounts: {
        [ACCOUNT]: { [dm]: { recipientId: FRIEND, lastDay: day - 1, days: 9, best: 9 } },
        [FRIEND]: { [dm]: { recipientId: ACCOUNT, lastDay: day, days: 2, best: 2 } },
    } };
    const { w, item, settings, mount, send, Plain, preview } = await setup(t, initial);
    assert.ok(settings.section.settings.includes(route));
    const page = w.registeredScreens.get(route).screen.getComponent();
    const ui = await mount(h(page));
    const row = await mount(preview(Plain, dm));
    const toggle = label => ui.root.findAllByType('Switch').find(node => node.props.accessibilityLabel === label);
    const clear = () => ui.root.findByType('Button').props.onPress();
    assert.ok(text(ui).includes('Test Friend'));
    await send();
    await send();
    assert.deepEqual(w.toasts, ['🔥 10-day DM streak!']);
    assert.deepEqual(fire(ui), ['🔥 10']);
    await Renderer.act(async () => toggle('Show badges in Messages').props.onValueChange(false));
    assert.deepEqual(fire(row), []);
    assert.deepEqual(fire(ui), ['🔥 10']);
    await Renderer.act(async () => toggle('Show badges in Messages').props.onValueChange(true));
    assert.deepEqual(fire(row), ['🔥 10']);

    clear();
    const staleConfirm = w.alerts.at(-1)[2][1].onPress;
    await Renderer.act(async () => w.setAccount(FRIEND));
    await Renderer.act(async () => staleConfirm());
    assert.ok(text(ui).includes('Test Owner'));
    assert.deepEqual(fire(row), ['🔥 2']);
    clear();
    await Renderer.act(async () => w.alerts.at(-1)[2][1].onPress());
    assert.deepEqual(fire(row), []);
    assert.equal(item.writes.at(-1).accounts[ACCOUNT][dm].days, 10);
    assert.equal(item.writes.at(-1).accounts[FRIEND], undefined);

    const saved = item.writes.at(-1);
    await Renderer.act(async () => w.stop(item));
    assert.equal(settings.section.settings.includes(route), false);
    assert.equal(w.timers.size, 0);
    const restarted = await w.start(slug, saved);
    await Renderer.act(async () => w.setAccount(ACCOUNT));
    const reopened = await mount(h(restarted.options.SettingsComponent, { api: restarted.api }));
    assert.deepEqual(fire(reopened), ['🔥 10']);
});

for (const order of ['hideFirst', 'hideLast']) {
    test('works alongside Hide Blocked & Ignored Messages when it starts ' + order, async t => {
        const { send, mount, Plain, preview } = await setup(t, {}, { [order]: true });
        await send();
        const visible = await mount(preview(Plain, dm));
        const hidden = await mount(preview(Plain, dm, BLOCKED));
        assert.deepEqual(text(visible), ['A native preview', '🔥 1']);
        assert.equal(text(hidden).includes('A native preview'), false);
    });
}
