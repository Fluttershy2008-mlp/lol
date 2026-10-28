'use strict';
process.env.PLUGIN_TEST_TARGET = 'valenced';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createWorld, React, Renderer } = require('../../revenge-next/tests/next-harness.cjs');
const h = React.createElement, LABEL = 'Stealmoji · Add / save emoji';
const emoji = { id: '800000000000000008', name: 'Geek_Muah' };

test('Stealmoji adds one bottom action without altering a deferred emoji header', async () => {
    const w = createWorld(), item = await w.start('stealmoji');
    function Header() {
        return h(w.RN.View,{ testID: 'original-emoji-header' },[
            h(w.RN.Image,{ key: 'avatar', source: { uri: 'original' } }),
            h(w.RN.Text,{ key: 'name' },':Geek_Muah:'),
            h(w.RN.Text,{ key: 'description' },'This emoji is from one of your servers.'),
        ]);
    }
    function Body() {
        return h(w.RN.View,null,[h(w.RN.Text,{ key: 'server' },'Land of The Tryhards'),null]);
    }
    // Discord passes the header through a composite before it reaches the
    // sheet's native View. The previous recursive wrapper patched both levels.
    function SheetContent({ header, children }) {
        return h(w.RN.View,{ testID: 'emoji-sheet-content' },[header,...children]);
    }
    function Original() { return h(SheetContent,{ header: h(Header,{ key: 'header' }) },[h(Body,{ key: 'body' })]); }
    let ui;
    try {
        for (let opening = 0; opening < 3; opening++) {
            const module = await w.sheets.openLazy(Promise.resolve({ default: Original }),'MessageEmojiActionSheet',{ emojiNode: emoji });
            await Renderer.act(async () => { ui = Renderer.create(h(module.default,{ emojiNode: emoji })); });
            for (let n = 0; n < 3; n++) {
                const actions = ui.root.findAll(node => typeof node.type === 'string' && node.props.label === LABEL);
                assert.equal(actions.length,1,'exactly one action across every rendered component');
                const header = ui.root.findAll(node => node.type === 'View' && node.props.testID === 'original-emoji-header')[0];
                assert.ok(header); assert.equal(header.findAll(node => node.props.label === LABEL).length,0,'no action inside the avatar/title header');
                let container = actions[0].parent;
                while (container && container.type !== 'View') container = container.parent;
                assert.equal(container?.props.testID,'emoji-sheet-content','the action belongs at the bottom of the sheet content');
                await Renderer.act(async () => ui.update(h(module.default,{ emojiNode: emoji, revision: n })));
            }
            await Renderer.act(async () => ui.unmount()); ui = undefined;
        }
    } finally {
        if (ui) await Renderer.act(async () => ui.unmount());
        await w.stop(item);
    }
    assert.equal(w.timers.size,0); assert.deepEqual(w.errors,[]);
});

test('sibling copies of one deferred component cannot each claim the Stealmoji action', async () => {
    const w = createWorld(), item = await w.start('stealmoji');
    function Child() { return h(w.RN.View,null,[h(w.RN.Text,{ key: 'name' },'Emoji details'),null]); }
    function Original({ hideFirst }) { return h(React.Fragment,null,hideFirst ? null : h(Child,{ key: 'first' }),h(Child,{ key: 'second' })); }
    let ui;
    try {
        const module = await w.sheets.openLazy(Promise.resolve({ default: Original }),'MessageEmojiActionSheet',{ emojiNode: emoji });
        await Renderer.act(async () => { ui = Renderer.create(h(module.default,{})); });
        assert.equal(ui.root.findAll(node => typeof node.type === 'string' && node.props.label === LABEL).length,1);
        await Renderer.act(async () => ui.update(h(module.default,{ revision: 1 })));
        assert.equal(ui.root.findAll(node => typeof node.type === 'string' && node.props.label === LABEL).length,1);
        await Renderer.act(async () => ui.update(h(module.default,{ hideFirst: true })));
        assert.equal(ui.root.findAll(node => typeof node.type === 'string' && node.props.label === LABEL).length,1,'a removed keyed owner cannot hide the remaining action');
    } finally {
        if (ui) await Renderer.act(async () => ui.unmount());
        await w.stop(item);
    }
    assert.deepEqual(w.errors,[]);
});
