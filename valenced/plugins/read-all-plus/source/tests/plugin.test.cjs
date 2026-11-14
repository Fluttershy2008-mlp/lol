"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pluginFixture } = require("./plugin-fixture.cjs");
const { id } = require("./fixtures.cjs");
const flush = () => new Promise(resolve => setImmediate(resolve));

test("the installation manifest points to a valid Valenced factory expression", async () => {
    const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../manifest.json"), "utf8"));
    assert.equal(manifest.format, 1); assert.equal(manifest.dist.script, "index.js");
    assert.equal(manifest.dependencies["valenced.api"].version, ">=1 <2");
    const f = pluginFixture();
    assert.equal(typeof f.plugin.init, "function"); assert.equal(typeof f.plugin.SettingsComponent, "function");
    await f.init();
    assert.equal(f.items.get("ReadAllPlusPanel").useTitle(), "Read All Plus");
});

test("enabling the plugin creates no read actions or startup popups", async () => {
    const f = pluginFixture(); await f.init(); f.render();
    assert.equal(f.f.sent.length, 0); assert.equal(f.alerts.length, 0); assert.equal(f.toasts.length, 0);
});

test("native settings panel shows all actions and a preview gates bulk execution", async () => {
    const f = pluginFixture(); await f.init(); const tree = f.render();
    for (const label of ["Servers only", "DMs + groups", "Current channel", "Current server", "Choose individual channels"]) assert(f.findButton(tree, label));
    const clear = f.findButton(tree, "Mark everything read (6)"); assert(clear); clear.props.onPress();
    assert.equal(f.f.sent.length, 0);
    assert.equal(f.alerts[0][0], "Mark 6 conversations as read?");
    f.alerts[0][2].find(b => b.text === "Mark as read").onPress();
    await flush();
    assert.equal(f.f.sent[0].channels.length, 6); assert.equal(f.saved.at(-1).history[0].confirmed, 6);
    assert.equal(f.toasts.length, 1);
});

test("the dedicated DM action includes both private and group chats", async () => {
    const f = pluginFixture(); await f.init();
    f.findButton(f.render(), "DMs + groups").props.onPress();
    assert.equal(f.alerts[0][0], "Mark 2 conversations as read?");
    assert.match(f.alerts[0][1], /1 DM.*1 group chat/s);
    f.alerts[0][2][1].onPress(); await flush();
    assert.deepEqual(new Set(f.f.sent[0].channels.map(c => c.channelId)), new Set([f.f.dm.id, f.f.group.id]));
});

test("the Messages shortcut preserves the original element and tap handler", async () => {
    const f = pluginFixture(); await f.init();
    const onPress = () => {};
    let originalCalls = 0;
    const shortcut = f.mountShortcut({ onPress, onLongPress: () => { originalCalls++; } });
    let item = shortcut.render().children[0];
    assert.equal(item.type, shortcut.item.type);
    assert.equal(item.props.config.onPress, onPress);
    item.props.config.onLongPress();
    f.plugin.stop();
    const tree = shortcut.render();
    assert.equal(tree.children.length, 1);
    item = tree.children[0];
    item.props.config.onLongPress();
    assert.equal(originalCalls, 1);
    await f.init();
    assert.equal(shortcut.render().children.length, 1, "reenabling does not reopen the previous modal");
    assert.equal(f.f.sent.length, 0);
    shortcut.unmount();
});

test("both close controls remove the only overlay and leave the Messages row interactive", async () => {
    const f = pluginFixture(); await f.init();
    let taps = 0;
    const shortcut = f.mountShortcut({ onPress: () => { taps++; } });
    for (const method of ["Close", "Android Back", "Close"]) {
        shortcut.render().children[0].props.config.onLongPress();
        const [, modal] = shortcut.render().children;
        assert.equal(modal.type, "Modal");
        assert.equal(modal.props.presentationStyle, "fullScreen");
        assert.equal(modal.children[0].type, "SafeAreaProvider");
        const screen = f.render(modal.children[0].children[0].props);
        assert.deepEqual(screen.props.edges, ["top", "right", "bottom", "left"]);

        if (method === "Close") f.findButton(screen, "Close").props.onPress();
        else modal.props.onRequestClose();

        const closed = shortcut.render();
        assert.equal(closed.children.length, 1);
        closed.children[0].props.config.onPress();
    }
    assert.equal(taps, 3);
    assert.deepEqual(f.panels, [], "the shortcut never opens a Discord action sheet");
    shortcut.unmount();
});

test("Valenced Settings uses a normal route whose Close button goes back", async () => {
    const f = pluginFixture(); await f.init();
    const entry = f.items.get("ReadAllPlusPanel");
    assert.equal(entry.type, "route");
    assert.equal(entry.screen.route, "ReadAllPlusPanel");
    let options, backs = 0;
    const navigation = { setOptions: value => { options = value; }, goBack: () => { backs++; } };
    const page = entry.screen.getComponent()({ navigation });
    assert.equal(options.headerShown, false);
    const screen = f.render(page.props);
    f.findButton(screen, "Close").props.onPress();
    assert.equal(backs, 1);
    assert.deepEqual(f.panels, []);
});

test("search, selection and account-specific exclusion controls render and persist", async () => {
    const f = pluginFixture(); await f.init();
    f.findButton(f.render(), "Channels").props.onPress();
    let tree = f.render();
    const input = f.allNodes(tree).find(n => n.type === "TextInput"); input.props.onChangeText("Fluttershy");
    tree = f.render();
    assert(f.textContent(tree).includes("Fluttershy")); assert(!f.textContent(tree).includes("Channel 1"));
    f.findButton(tree, "Select matches").props.onPress(); tree = f.render();
    assert(f.findButton(tree, "Read selected (1)"));
    f.findButton(tree, "Exclude channel").props.onPress(); await flush();
    assert.deepEqual(f.saved.at(-1).accounts[id(900)].channels, [f.f.dm.id]);
});

test("light and dark settings screens both expose accessible controls", async () => {
    for (const light of [true, false]) {
        const f = pluginFixture({ light }); await f.init(); f.findButton(f.render(), "Options").props.onPress();
        const tree = f.render(); const switches = f.allNodes(tree).filter(n => n.type === "Switch");
        assert.equal(switches.length, 6); assert(switches.every(n => n.props.accessibilityLabel));
        assert(f.findButton(tree, "Check compatibility"));
    }
});

test("quiet mode saves activity while suppressing completion notifications", async () => {
    const f = pluginFixture({ saved: { quiet: true, confirm: false } }); await f.init();
    f.findButton(f.render(), "DMs + groups").props.onPress(); await flush();
    assert.equal(f.f.sent.length, 1); assert.equal(f.alerts.length, 0); assert.equal(f.toasts.length, 0);
    assert.equal(f.saved.at(-1).history[0].confirmed, 2);
});

test("switching accounts while a confirmation is open prevents the old action from running", async () => {
    const f = pluginFixture(); await f.init(); f.findButton(f.render(), "DMs + groups").props.onPress();
    f.f.setAccount(id(901)); f.alerts[0][2][1].onPress(); await flush();
    assert.equal(f.f.sent.length, 0); assert.match(f.alerts.at(-1)[1], /account changed/);
});

test("cleanup removes settings and shortcut patches", async () => {
    const f = pluginFixture(); await f.init();
    f.plugin.stop(); for (const cleanup of f.cleanups.reverse()) cleanup();
    assert.equal(f.items.size, 0); assert.equal(f.sections.size, 0);
    assert(f.patches.every(p => p.removed));
    assert.deepEqual(f.panels, []);
});

test("every tab has a bounded native scroll viewport below the fixed tab bar", async () => {
    const f = pluginFixture({ width: 320, fontScale: 1.45 }); await f.init();
    for (const [label, type] of [["Home", "ScrollView"], ["Channels", "FlatList"], ["Exclusions", "FlatList"], ["Options", "ScrollView"]]) {
        f.findButton(f.render(), label).props.onPress();
        const tree = f.render();
        const body = tree.children.find(node => node.props.testID === "read-all-plus-scroll");
        assert.equal(body.type, type);
        assert.equal(tree.props.style.flex, 1);
        assert.equal(body.props.style.flex, 1);
        assert.equal(body.props.showsVerticalScrollIndicator, true);
        const tabs = f.allNodes(tree).filter(node => node.props.accessibilityRole === "tab");
        assert.equal(tabs.length, 4);
        assert(tabs.every(node => !f.allNodes(body).includes(node)));
        assert.equal(tabs.find(node => node.props.accessibilityState.selected).children[0].children[0], label);
    }
});

test("the selection remains actionable outside the conversation list", async () => {
    const f = pluginFixture(); await f.init();
    f.findButton(f.render(), "Channels").props.onPress();
    f.findButton(f.render(), "Select matches").props.onPress();
    let tree = f.render();
    const body = f.allNodes(tree).find(node => node.type === "FlatList");
    assert.equal(body.props.data.length, 6);
    const read = f.findButton(tree, "Read selected (6)");
    assert(read);
    assert.equal(f.findButton(body, "Read selected (6)"), undefined);
    f.findButton(tree, "Clear selection").props.onPress();
    tree = f.render();
    assert.equal(f.findButton(tree, "Read selected (6)"), undefined);
});

test("channel and exclusion lists include rows beyond the old 25-item page", async () => {
    const f = pluginFixture(); await f.init();
    for (let index = 20; index < 95; index++) f.f.add(index, 0, f.f.guildA);
    f.findButton(f.render(), "Channels").props.onPress();
    let list = f.allNodes(f.render()).find(node => node.type === "FlatList");
    assert.equal(list.props.data.length, 81);
    assert(list.props.data.some(entry => entry.id === id(94)));
    f.findButton(f.render(), "Exclusions").props.onPress();
    f.findButton(f.render(), "Conversations").props.onPress();
    list = f.allNodes(f.render()).find(node => node.type === "FlatList");
    assert.equal(list.props.data.length, 81);
    assert(list.props.data.some(entry => entry.id === id(94)));
});
