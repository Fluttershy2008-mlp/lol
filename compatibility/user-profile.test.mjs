import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { findUserProfileOpener, openUserProfile } from './user-profile.mjs';

const PATH = 'modules/user_profile/native/showUserProfileActionSheet.tsx';
const ID = '753962426407452713';

test('profile opening resolves an anonymous default export by imported path', async () => {
    const calls = [];
    const namespace = { default: function a(...args) { assert.equal(this, namespace); calls.push(args); } };
    const V = { metro: { findByImportedPath(path) { assert.equal(path, PATH); return namespace; } } };
    assert.equal(await openUserProfile(V, { userId: ID }), true);
    assert.deepEqual(calls, [[{ userId: ID }, 'stack']]);
});

test('namespace markers resolve the default profile opener without its function name', async () => {
    const calls = [];
    const namespace = { USER_PROFILE_ACTION_SHEET_KEY_PREFIX: 'UserProfile', getUserProfileActionSheetKey: id => 'UserProfile' + id,
        default: function a(...args) { calls.push(args); } };
    const V = { metro: { findByProps(...keys) {
        assert.deepEqual(keys, ['USER_PROFILE_ACTION_SHEET_KEY_PREFIX', 'getUserProfileActionSheetKey']);
        return namespace;
    } } };
    assert.equal(await openUserProfile(V, { userId: ID, guildId: '123456789012345678' }), true);
    assert.equal(calls[0][0].userId, ID);
    assert.equal(calls[0][1], 'stack');
});

test('legacy named exports and helper families keep their method receiver', async () => {
    for (const method of ['showUserProfileActionSheet', 'openUserProfileModal', 'openUserProfile', 'showUserProfile']) {
        let opened = false;
        const module = { [method](options, stack) {
            assert.equal(this, module); assert.equal(options.userId, ID); assert.equal(stack, 'stack'); opened = true;
        } };
        const V = { metro: { findByProps: (...keys) => keys.length === 1 && keys[0] === method ? module : undefined } };
        assert.equal(await openUserProfile(V, { userId: ID }), true);
        assert.equal(opened, true);
    }
});

test('unavailable openers return false and rejected openers preserve their failure', async () => {
    assert.equal(await openUserProfile({}, { userId: ID }), false);
    const failure = new Error('Profile fetch denied');
    const V = { metro: { findByName: () => () => Promise.reject(failure) } };
    await assert.rejects(openUserProfile(V, { userId: ID }), error => error === failure);
});

test('a disabled plugin cannot resolve or invoke a profile opener', async () => {
    const V = { metro: { findByImportedPath() { assert.fail('must not resolve after stop'); } } };
    assert.equal(await openUserProfile(V, { userId: ID }, () => false), false);
    let current = true, called = false;
    V.metro.findByImportedPath = () => { current = false; return { default() { called = true; } }; };
    assert.equal(await openUserProfile(V, { userId: ID }, () => current), false);
    assert.equal(called, false);
});

test('the scoped native API stays lexical and does not require a global Valenced object', async () => {
    const code = readFileSync(new URL('./user-profile.mjs', import.meta.url), 'utf8').replace(/^export /gm, '');
    const calls = [];
    const api = { modules: { finders: {} }, discord: { utils: { modules: { finders: {
        lookupModuleWithImportedPath: path => path === PATH ? [{ default: (...args) => calls.push(args) }, 10] : [],
    } } } } };
    const helper = new Function('valenced', code + '\nreturn {openUserProfile};')(api);
    assert.equal(await helper.openUserProfile({}, { userId: ID }), true);
    assert.equal(calls.length, 1);
    assert.equal(globalThis.valenced, undefined);
});

test('missing dependency IDs do not trigger a broad Metro factory lookup', () => {
    let lookups = 0;
    const client = { modules: { finders: { filters: { withProps: () => ({}), withDependencies() { assert.fail('cannot build a wildcard fingerprint'); } },
        lookupModule() { lookups++; return []; } } }, discord: { flux: { withStoreName: () => ({}) }, common: {} } };
    assert.equal(findUserProfileOpener({}, client), undefined);
    assert.equal(lookups, 2);
});
