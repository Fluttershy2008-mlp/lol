'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const script = fs.readFileSync(path.join(__dirname, '../themes/fluttershy/index.js'), 'utf8');

function boot({ themeId = 'fluttershy-theme', ready = false } = {}) {
  const provider = vm.runInNewContext(script, {}, { timeout: 1000 }).default;
  let palette = { TEXT_NORMAL: '#FFF5FA', CHANNEL_ICON: '#E8B7D0' };
  let definition;
  let onTokens;
  let stop;

  provider.preInit({
    themes: {
      registerGroup(id) {
        assert.equal(id, 'fluttershy');
      },
      registerTheme(group, id, theme) {
        assert.equal(group, 'fluttershy');
        definition = theme;
        // Themes API can refresh a matching saved selection only after the tokens are ready.
        if (ready && id === themeId) palette = theme.getColors().semantic.dark;
      },
    },
    unscoped: {
      modules: {
        finders: {
          filters: {
            withProps(...props) {
              assert.deepEqual(props, ['RawColor', 'SemanticColor']);
              return props;
            },
          },
          getModules(filter, callback, { max }) {
            assert.equal(max, 1);
            onTokens = callback;
            return () => { onTokens = undefined; };
          },
        },
      },
    },
    cleanup(cancel) {
      stop = cancel;
    },
  });

  return {
    get palette() { return palette; },
    definition,
    finishLoadingTokens() {
      ready = true;
      const callback = onTokens;
      onTokens = undefined;
      callback?.();
    },
    stop,
  };
}

test('reapplies the saved Fluttershy palette after Discord loads colour tokens', () => {
  const app = boot();
  assert.equal(app.palette.TEXT_NORMAL, '#FFF5FA');
  assert.equal(app.definition.name, 'Fluttershy · Rainbow Skies');
  app.finishLoadingTokens();
  assert.equal(app.palette.TEXT_NORMAL, '#D8F1FFFF');
  assert.equal(app.palette.CHANNEL_ICON, '#A0E6FFFF');
  assert.equal(app.palette.REDESIGN_CHANNEL_NAME_TEXT, '#D2EFFFFF');
  assert.equal(app.palette.BACKGROUND_SECONDARY, '#14263FFF');
});

test('refreshes safely when Discord colour tokens were already ready', () => {
  const app = boot({ ready: true });
  const palette = app.palette;
  assert.equal(palette.TEXT_NORMAL, '#D8F1FFFF');
  app.finishLoadingTokens();
  assert.equal(app.palette, palette);
});

test('does not change another selected palette or refresh after unloading', () => {
  const other = boot({ themeId: 'another-theme' });
  other.finishLoadingTokens();
  assert.equal(other.palette.TEXT_NORMAL, '#FFF5FA');
  const stopped = boot();
  stopped.stop();
  stopped.finishLoadingTokens();
  assert.equal(stopped.palette.TEXT_NORMAL, '#FFF5FA');
});
