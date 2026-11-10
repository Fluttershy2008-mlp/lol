import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerSettingsSidebar } from '../hideBlockedAndIgnoredMessages/settings-sidebar.js';

test('registers a native sidebar entry with the real page and icon; cleanup preserves neighbours', () => {
    const before = { key: 'blocked_users' }, after = { key: 'panic_purge' };
    const host = { customEntries: [before], customSections: [] }, Page = () => null, Icon = () => null;
    const stop = registerSettingsSidebar(host, Page, Icon);
    const entry = host.customEntries[1];
    assert.equal(entry.key, 'vencord_hidden_users_servers');
    assert.equal(entry.title, 'Hidden users & servers');
    assert.equal(entry.Component, Page); assert.equal(entry.Icon, Icon);
    assert.equal(host.customSections.length, 0);
    host.customEntries.push(after); stop(); stop();
    assert.deepEqual(host.customEntries, [before, after]);
});
test('older Vencord settings use a working custom section without altering other sections', () => {
    const other = () => ({ section: 'Blocked Users' });
    const host = { customSections: [other] }, Page = () => null;
    const stop = registerSettingsSidebar(host, Page, () => null);
    const entry = host.customSections[1]({ HEADER: 'HEADER' });
    assert.equal(entry.section, 'Hidden users & servers');
    assert.equal(entry.label, 'Hidden users & servers'); assert.equal(entry.element, Page);
    stop(); assert.deepEqual(host.customSections, [other]);
});
