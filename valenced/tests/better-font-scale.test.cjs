'use strict';
process.env.PLUGIN_TEST_TARGET = 'valenced';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createWorld, React, Renderer } = require('../../revenge-next/tests/next-harness.cjs');
const { installChatButtonsHost } = require('./chat-buttons-fixture.cjs');

const h = React.createElement;
const slug = 'better-font-scale';

async function setup(t, initial) {
    const world = createWorld();
    const { patches } = installChatButtonsHost(world);
    const jsx = world.U.react.ReactJSXRuntime.jsx;
    const Design = world.U.discord.design.Design;
    const bridgeCalls = [];
    const screens = [];
    Design.Slider = 'Slider';
    world.U.modules.native.callNativeMethod = async (name, args) => {
        assert.equal(name, 'dev.fluttershy2008.better-font-scale.update');
        bridgeCalls.push(Array.from(args));
        return true;
    };
    world.addModule({
        Text: Design.Text,
        TextStyleSheet: { 'body-md/medium': { fontSize: 16, lineHeight: 20 } },
    }, 'design/components/Text/native/Text.tsx');
    const plugin = await world.start(slug, initial);
    const mount = async element => {
        let screen;
        await Renderer.act(async () => { screen = Renderer.create(element); });
        screens.push(screen);
        return screen;
    };
    t.after(async () => {
        await Renderer.act(async () => {
            for (const screen of screens) screen.unmount();
        });
        if (world.loaded.has(slug)) await world.stop(plugin);
        assert.equal(world.pathWaiters.size, 0);
        assert.equal(patches.size, 0);
        assert.deepEqual(world.errors, []);
    });
    return { world, plugin, bridgeCalls, jsx, Design, mount };
}

test('sliders preview while dragging, persist on release and reset all eleven values', async t => {
    const { plugin, bridgeCalls, mount } = await setup(t, { messages: 98, chatbox: 200, bio: '150' });
    const ui = await mount(h(plugin.options.SettingsComponent, { api: plugin.api }));
    const slider = label => ui.root.findAllByType('Slider').find(node => node.props.accessibilityLabel === label);
    const body = () => slider('Messages').props;
    assert.equal(ui.root.findAllByType('Slider').length, 11);
    assert.deepEqual(bridgeCalls, [[100, 180, 100, 100]]);
    assert.deepEqual([body().minValue, body().maxValue, body().step], [60, 180, 5]);
    assert.equal(slider('About Me').props.value, 100);
    await Renderer.act(async () => body().onChange(137));
    assert.equal(plugin.writes.length, 0);
    assert.ok(ui.root.findAllByType('Text').some(node => node.props.children === '135%'));
    await Renderer.act(async () => body().onChangeEnd(137));
    assert.equal(body().value, 135);
    assert.equal(plugin.writes.at(-1).messages, 135);
    assert.deepEqual(bridgeCalls.at(-1), [135, 180, 100, 100]);
    const reset = ui.root.findAllByType('Button').find(node => node.props.text === 'Reset all to default');
    await Renderer.act(async () => reset.props.onPress());
    assert.deepEqual(Object.values(plugin.writes.at(-1)), Array(11).fill(100));
    assert.deepEqual(bridgeCalls.at(-1), [100, 100, 100, 100]);
});

test('native-design channel text uses its own role and restores existing rows at 100%', async t => {
    const { world, plugin, jsx, Design, mount } = await setup(t, { voice: 125, thread: 80 });
    const label = children => jsx(Design.Text, {
        variant: 'body-md/medium', lineClamp: 1, children, experimental_useNativeText: true,
    });
    const ChannelItem = React.memo(({ channel }) => label(channel.name));
    world.addModule({ default: ChannelItem }, 'modules/guild_sidebar/native/ChannelItem.tsx');
    const rows = await mount(h(React.Fragment, null,
        jsx(ChannelItem, { channel: { type: 2, name: 'voice' } }),
        jsx(ChannelItem, { channel: { type: 11, name: 'thread' } }),
        jsx(ChannelItem, { channel: { type: 0, name: 'text channel' } }),
        label('outside the sidebar')));
    const size = name => rows.root.findAllByType('Text').find(node => node.props.children === name).props.style?.at(-1);
    assert.equal(size('voice').fontSize, 20);
    assert.equal(size('voice').lineHeight, 25);
    assert.equal(size('thread').fontSize, 12.8);
    assert.equal(size('text channel'), undefined);
    assert.equal(size('outside the sidebar'), undefined);

    const ui = await mount(h(plugin.options.SettingsComponent, { api: plugin.api }));
    const slider = label => ui.root.findAllByType('Slider').find(node => node.props.accessibilityLabel === label);
    await Renderer.act(async () => slider('Text Channel Names').props.onChangeEnd(150));
    assert.equal(size('text channel').fontSize, 24);
    await Renderer.act(async () => slider('Voice Channel Names').props.onChangeEnd(100));
    assert.equal(size('voice'), undefined);
    await Renderer.act(async () => world.stop(plugin));
    assert.equal(size('thread'), undefined);
    assert.equal(size('text channel'), undefined);
});
