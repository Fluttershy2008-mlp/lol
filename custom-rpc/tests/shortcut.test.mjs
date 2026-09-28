import test from 'node:test';
import assert from 'node:assert/strict';
import { registerSettingsShortcut, SHORTCUT_KEY } from '../src/shortcut.js';

function setup(label = 'Revenge') {
  const rows = ['BUNNY', 'BUNNY_PLUGINS', 'BUNNY_THEMES', 'BUNNY_FONTS', 'BUNNY_DEVELOPER', 'ACCOUNT_SWITCHER']
    .map(key => ({ key }));
  const settingsAPI = { registeredSections: { [label]: rows, Bunny: [], Vendetta: [] } };
  const Settings = () => 'existing editor';
  return { rows, settingsAPI, Settings, getAssetID: name => name === 'WrenchIcon' ? 42 : undefined };
}

test('shortcut appears below Plugins and opens the existing editor via Revenge’s lazy render contract', async () => {
  const f = setup(), original = [...f.rows];
  const remove = registerSettingsShortcut(f);
  assert.deepEqual(f.rows.map(row => row.key), ['BUNNY', 'BUNNY_PLUGINS', SHORTCUT_KEY, 'BUNNY_THEMES', 'BUNNY_FONTS', 'BUNNY_DEVELOPER', 'ACCOUNT_SWITCHER']);
  const row = f.rows[2];
  assert.equal(row.title(), 'CustomRPC'); assert.equal(row.icon, 42);
  assert.equal((await row.render()).default, f.Settings);
  remove(); assert.deepEqual(f.rows, original);
  remove(); assert.deepEqual(f.rows, original);
});

test('translated section headings work and duplicate registration does not add a second row', () => {
  const f = setup('Localized heading');
  const remove = registerSettingsShortcut(f), removeDuplicate = registerSettingsShortcut(f);
  assert.equal(f.rows.filter(row => row.key === SHORTCUT_KEY).length, 1);
  removeDuplicate(); assert.equal(f.rows.filter(row => row.key === SHORTCUT_KEY).length, 1);
  remove(); assert.equal(f.rows.filter(row => row.key === SHORTCUT_KEY).length, 0);
});

test('cleanup handles section arrays replaced by another plugin without removing its rows', () => {
  const f = setup(), remove = registerSettingsShortcut(f), additional = { key: 'OTHER_PLUGIN' };
  f.settingsAPI.registeredSections.Revenge = [...f.rows, additional];
  remove();
  assert.equal(f.rows.some(row => row.key === SHORTCUT_KEY), false);
  assert.equal(f.settingsAPI.registeredSections.Revenge.some(row => row.key === SHORTCUT_KEY), false);
  assert.equal(f.settingsAPI.registeredSections.Revenge.at(-1), additional);
});

test('unavailable settings integration leaves the original settings intact', () => {
  const messages = [];
  assert.doesNotThrow(() => registerSettingsShortcut({ log: message => messages.push(message) })());
  assert.equal(messages.length, 1);
  const sections = { Other: [{ key: 'ACCOUNT' }] };
  registerSettingsShortcut({ settingsAPI: { registeredSections: sections } })();
  assert.deepEqual(sections, { Other: [{ key: 'ACCOUNT' }] });
});
