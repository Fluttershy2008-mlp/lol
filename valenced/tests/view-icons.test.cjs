'use strict';
process.env.PLUGIN_TEST_TARGET = 'valenced';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createWorld, React, Renderer, FRIEND, ACCOUNT, GUILD } = require('../../revenge-next/tests/next-harness.cjs');

const h = React.createElement;
const profilePath = name => `modules/user_profile/native/${name}.tsx`;
const PROFILE = profilePath('UserProfileOverflowMenu');
const BOT = profilePath('BotUserProfileOverflowMenu');

function scenario(t) {
    const w = createWorld(), renders = [];
    t.after(async () => {
        for (const ui of renders.reverse()) await Renderer.act(async () => ui.unmount());
        for (const item of [...w.loaded.values()].reverse()) await w.stop(item);
        assert.equal(w.pathWaiters.size, 0);
        assert.deepEqual(w.errors, []);
    });
    w.openProfile = async (module, props) => {
        let ui;
        await Renderer.act(async () => { ui = Renderer.create(h(module.default, props)); });
        renders.push(ui);
        return ui.root.findByType('ContextMenu').props.items;
    };
    w.imagePaths = () => w.calls.filter(call => call[0] === 'openMedia')
        .map(call => new URL(call[1].initialSources[0].uri).pathname);
    return w;
}

function profileModule(w, shape, items) {
    const render = () => h(React.Fragment, null, h(w.RN.View, null,
        h('ContextMenu', { items }, h(w.RN.View))));
    if (shape === 'memo') return { default: React.memo(React.forwardRef(render)) };
    if (shape === 'class') return { default: class extends React.Component { render() { return render(); } } };
    return { default: render };
}

const main = Object.freeze([Object.freeze({ label: 'Copy Username' }), Object.freeze({ label: 'Apps' })]);
const danger = Object.freeze([Object.freeze({ label: 'Block' })]);
const groups = Object.freeze([main, danger]);
const action = (items, label) => items.flat().find(item => item.label === label);

test('ViewIcons attaches to the late-loaded, minified profile menu and opens each image', async t => {
    const w = scenario(t);
    const profile = profileModule(w, 'memo', groups);
    const unpatched = profile.default.type.render;
    w.users[FRIEND].avatar = 'a_user';
    w.stores.GuildMemberStore.getMember = () => ({ avatar: 'member' });
    const plugin = await w.start('view-icons');
    await w.advance(120000);
    w.addModule(profile, PROFILE);
    const displayProfile = {
        userId: FRIEND,
        guildId: GUILD,
        bannerUrl: `https://cdn.discordapp.com/guilds/${GUILD}/users/${FRIEND}/banners/a_member.png`,
        getBannerURL() { return this.bannerUrl; },
        avatarDecorationData: { asset: 'decoration' },
    };
    const items = await w.openProfile(profile, { displayProfile });
    assert.deepEqual(Array.from(items[0], item => item.label), [
        'Copy Username', 'Apps', 'View Avatar', 'View Banner', 'View Server Avatar', 'View Avatar Decoration',
    ]);
    assert.equal(items[1], danger);
    assert.equal(main.length, 2);
    for (const item of items[0].slice(2)) item.action();
    assert.deepEqual(w.imagePaths(), [
        `/avatars/${FRIEND}/a_user.gif`,
        `/guilds/${GUILD}/users/${FRIEND}/banners/a_member.gif`,
        `/guilds/${GUILD}/users/${FRIEND}/avatars/member.webp`,
        '/avatar-decoration-presets/decoration.png',
    ]);
    assert.equal(w.calls.some(call => call[0] === 'hideSheet'), false);
    await w.stop(plugin);
    assert.equal(profile.default.type.render, unpatched);
    action(items, 'View Avatar').action();
    assert.equal(w.imagePaths().length, 4);
});

test('ViewIcons handles a bot, default avatars, and native profile store objects', async t => {
    const w = scenario(t);
    const bot = profileModule(w, 'class', main);
    const profile = profileModule(w, 'function', groups);
    w.addModule(bot, BOT);
    w.addModule(profile, PROFILE);
    w.users[ACCOUNT].discriminator = '0003';
    w.stores.UserProfileStore = {
        getGuildMemberProfile: () => ({ banner: 'a_guild' }),
        getUserProfile: () => ({ banner: 'global' }),
    };
    await w.start('view-icons');
    const botItems = await w.openProfile(bot, { userId: ACCOUNT });
    action(botItems, 'View Avatar').action();
    action(botItems, 'View Banner').action();
    const userItems = await w.openProfile(profile, { userId: FRIEND, guildId: GUILD });
    action(userItems, 'View Avatar').action();
    action(userItems, 'View Banner').action();
    const defaultIndex = (BigInt(FRIEND) >> 22n) % 6n;
    assert.deepEqual(w.imagePaths(), [
        '/embed/avatars/3.png', `/banners/${ACCOUNT}/global.webp`,
        `/embed/avatars/${defaultIndex}.png`, `/guilds/${GUILD}/users/${FRIEND}/banners/a_guild.gif`,
    ]);
});

test('ViewIcons and Copy User ID compose in either load order', async t => {
    for (const order of [['view-icons', 'copy-user-id'], ['copy-user-id', 'view-icons']]) {
        const w = scenario(t);
        const profile = profileModule(w, 'function', groups);
        for (const slug of order) await w.start(slug);
        w.addModule(profile, PROFILE);
        const items = await w.openProfile(profile, { userId: FRIEND });
        assert.ok(action(items, 'View Avatar'));
        assert.ok(action(items, 'Copy User ID\n' + FRIEND));
        assert.equal(items[1], danger);
        await w.stop(w.loaded.get('view-icons'));
        const updated = await w.openProfile(profile, { userId: FRIEND });
        assert.ok(action(updated, 'Copy User ID\n' + FRIEND));
        assert.equal(action(updated, 'View Avatar'), undefined);
    }
});

test('ViewIcons keeps server actions and adds user actions to grouped context menus', async t => {
    const w = scenario(t);
    const menus = { showContextMenu: menu => menu, hideContextMenu: () => w.calls.push(['hideContext']) };
    w.addModule(menus);
    w.guilds[GUILD].icon = 'server';
    w.guilds[GUILD].banner = 'banner';
    w.users[FRIEND].avatar = 'user';
    await w.start('view-icons');

    const user = menus.showContextMenu(Object.freeze({ userId: FRIEND, guildId: GUILD, items: groups }));
    assert.equal(user.items[1], danger);
    assert.equal(action(user.items, 'View Server Icon'), undefined);
    action(user.items, 'View Avatar').action();
    assert.ok(w.calls.some(call => call[0] === 'hideContext'));

    const guild = menus.showContextMenu({ guild: w.guilds[GUILD], items: [] });
    action(guild.items, 'View Server Icon').action();
    action(guild.items, 'View Server Banner').action();
    assert.deepEqual(w.imagePaths(), [
        `/avatars/${FRIEND}/user.webp`, `/icons/${GUILD}/server.webp`, `/banners/${GUILD}/banner.webp`,
    ]);
});
