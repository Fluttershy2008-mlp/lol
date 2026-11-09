/* SPDX-License-Identifier: GPL-3.0-or-later */
// This measures this plugin's JS element-creation path under Node, not Android
// frame rate or total CPU. Set BASELINE_PLUGIN to an extracted older index.js
// to compare identical workloads; that older source is not bundled here.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { performance } = require('node:perf_hooks');

function load(path) {
  const runtime = { jsx: (type, props) => props, jsxs: (type, props) => props };
  const original = runtime.jsx;
  const cleanups = [];
  const timers = [];
  const cache = { images: true, emojis: true, stickers: true, cosmetics: true };
  const finders = {
    filters: {
      withProps: (...keys) => mod => keys.every(key => key in mod),
      withName: name => mod => mod.name === name,
      createFilterGenerator: predicate => () => mod => predicate([], 0, mod, true)
    },
    getModules(filter, callback) { if (filter(runtime)) callback(runtime); return () => {}; }
  };
  const patcher = {
    before(target, key, callback) {
      const old = target[key];
      const wrapped = function (...args) { return old.apply(this, callback(args)); };
      target[key] = wrapped;
      return () => { target[key] = old; };
    }
  };
  const valenced = { modules: { finders, native: { getNativeModule() { throw new Error('not installed'); } } }, patcher };
  const sandbox = {
    valenced, plugin: options => options,
    setTimeout(fn, delay) { timers.push({ fn, delay }); return timers.length; },
    clearTimeout() {}
  };
  const plugin = vm.runInNewContext(fs.readFileSync(path, 'utf8'), sandbox).default;
  plugin.init({ jsonStorage: { cache }, cleanup(fn) { cleanups.push(fn); } });
  return {
    runtime, cache, timers,
    close() { cleanups.reverse().forEach(fn => fn()); assert.equal(runtime.jsx, original); }
  };
}

function verify(currentPath) {
  const instance = load(currentPath);
  let classifications = 0;
  function Text() {}
  Object.defineProperty(Text, 'displayName', { get() { classifications++; return 'MessageText'; } });
  const ordinary = Object.freeze({ children: 'hello', style: { flex: 1 } });
  for (let i = 0; i < 10000; i++) assert.equal(instance.runtime.jsx(Text, ordinary), ordinary);
  assert.equal(classifications, 1, 'unrelated component classified once, not once per element');
  function Anonymous() {}
  assert.equal(instance.runtime.jsx(Anonymous, ordinary), ordinary);
  // A negative type result must NOT hide media later rendered by the same type.
  const source = Object.freeze([{ uri: 'https://example.com/static.png' }, { uri: 'https://cdn.discordapp.com/avatars/1/a_live.webp' }]);
  const image = Object.freeze({ source });
  assert.match(instance.runtime.jsx(Anonymous, image).source[1].uri, /a_live\.gif$/);
  assert.match(source[1].uri, /a_live\.webp$/);
  const plainSources = Object.freeze({ source: Object.freeze([{ uri: 'https://example.com/one.png' }]) });
  assert.equal(instance.runtime.jsx(Anonymous, plainSources), plainSources, 'unchanged sources retain references');
  for (const displayName of ['Avatar', 'Emoji', 'Nameplate']) {
    const type = { displayName };
    const group = displayName === 'Emoji' ? 'emojis' : displayName === 'Nameplate' ? 'cosmetics' : 'images';
    assert.equal(instance.runtime.jsx(type, { animate: false }).animate, true);
    instance.cache[group] = false;
    const off = Object.freeze({ animate: false });
    assert.equal(instance.runtime.jsx(type, off), off, 'cached classification still respects live switches');
    instance.cache[group] = true;
  }
  // Bound retry tasks finish after startup; they never schedule another task.
  const scheduled = instance.timers.length;
  instance.timers.slice().forEach(task => task.fn());
  assert.equal(instance.timers.length, scheduled);
  instance.close();
  console.log('PASS: one type classification across 10,000 unrelated renders; anonymous image reuse, immutable sources, independent live switches, bounded startup retries and cleanup.');
}

function benchmark(path) {
  const instance = load(path);
  const types = ['MessageText', 'View', 'Button', 'ScrollView'].map(displayName => ({ displayName }));
  const ordinary = Object.freeze({ children: 'hello', style: { flex: 1 } });
  const imageType = { displayName: 'Avatar' };
  const image = Object.freeze({ animate: false, source: { uri: 'https://cdn.discordapp.com/avatars/1/a_live.webp?size=128' } });
  const samples = [];
  const count = 200000;
  function run() {
    let touched = 0;
    const start = performance.now();
    for (let i = 0; i < count; i++) {
      // Mostly ordinary layout/text elements, with 5% animated image elements.
      const result = i % 20 === 0 ? instance.runtime.jsx(imageType, image) : instance.runtime.jsx(types[i % 4], ordinary);
      touched += result === ordinary ? 0 : 1;
    }
    assert.equal(touched, count / 20);
    return performance.now() - start;
  }
  run(); run();
  for (let i = 0; i < 7; i++) samples.push(run());
  instance.close();
  samples.sort((a, b) => a - b);
  return { calls: count, rounds: samples.length, medianMilliseconds: +samples[3].toFixed(2) };
}

const current = __dirname + '/../index.js';
verify(current);
if (process.env.BASELINE_PLUGIN) {
  const before = benchmark(process.env.BASELINE_PLUGIN);
  const after = benchmark(current);
  console.log(JSON.stringify({ workload: '95% layout/text; 5% animated avatar elements; warmed JS factory hook', before, after,
    medianReductionPercent: +(100 * (1 - after.medianMilliseconds / before.medianMilliseconds)).toFixed(1),
    limitation: 'Local Node harness; no phone FPS, end-to-end CPU or battery measurement.' }, null, 2));
}
