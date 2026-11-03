'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const source = fs.readFileSync(path.join(__dirname, '../plugins/math-ai/index.js'), 'utf8');
function load(extra = {}) {
    const context = { setTimeout, clearTimeout, AbortController, ...extra };
    const code = source.replace('return { default: { jsonStorage:', 'return { test: { calculate, format, settingsOf, endpointOf, solveAI, cancel, addButton, getSession: () => current }, default: { jsonStorage:');
    return vm.runInNewContext(code, context);
}
function harness(extra = {}) {
    const callbacks = new Map(), removers = [], saved = [], patches = [];
    const draft = { channel: '123', account: '456', text: '2(3+4)' }, inserted = [];
    const React = { createElement: (type, props, ...children) => ({ type, key: props?.key, props: { ...props, children: children.length === 1 ? children[0] : children } }),
        cloneElement: (node, props, children) => ({ ...node, props: { ...node.props, ...props, children } }),
        isValidElement: node => !!node?.type, useState: value => [value, () => {}], useEffect: () => {} };
    const api = { cleanup: fn => removers.push(fn), jsonStorage: { loaded: true, cache: {}, set: async v => saved.push(v) },
        unscoped: { react: { React, ReactNative: {} }, modules: { finders: { filters: { withProps: (...props) => props },
            lookupModule: props => props.includes('dispatchToLastSubscribed') ? [{ dispatchToLastSubscribed: (...args) => inserted.push(args) }] : [] } },
            discord: { utils: { modules: { finders: { getModuleWithImportedPath: (p, fn) => { callbacks.set(p, fn); return () => callbacks.delete(p); } } } },
                flux: { Stores: { SelectedChannelStore: { getChannelId: () => draft.channel }, UserStore: { getCurrentUser: () => ({ id: draft.account }) }, DraftStore: { getDraft: () => draft.text } } } },
            patcher: { after: (holder, key, hook) => { const original = holder[key]; holder[key] = (...args) => hook(original(...args)); const remove = () => { holder[key] = original; }; patches.push(remove); return remove; } } } };
    return { ...load(extra), api, callbacks, removers, saved, patches, draft, inserted, React };
}
test('scientific expressions, precedence, real domains, DEG/RAD and precision', () => {
    const { calculate: c, format } = load().test;
    for (const [q, expected] of [ ['2+3*4',14], ['2(3+4)',14], ['(2+3)(4+1)',25], ['2^3^2',512], ['-2^2',-4],
        ['2^-3',0.125], ['(-2)^2',4], ['5!',120], ['ncr(10,3)',120], ['npr(10,3)',720], ['sqrt(81)',9],
        ['root(3,-8)',-2], ['ln(e)',1], ['log(1000)',3], ['log2(8)',3], ['200*10%',20], ['200+10%',200.1],
        ['1e-3+2e-3',0.003], ['2×3÷2',3], ['3²+2³',17], ['mod(10,3)',1], ['abs(-9)',9], ['cbrt(-8)',-2] ])
        assert.ok(Math.abs(c(q)-expected) < 1e-10, q);
    assert.ok(Math.abs(c('sin(30)')-0.5)<1e-12);
    assert.ok(Math.abs(c('asin(0.5)')-30)<1e-12);
    assert.ok(Math.abs(c('cos(pi/3)','RAD')-0.5)<1e-12);
    assert.equal(c('ans*2','DEG',7),14);
    assert.equal(format(c('0.1+0.2')),'0.3');
});
test('rejects code, invalid domains, malformed expressions and excessive work', () => {
    const { calculate: c } = load().test;
    for (const q of ['', 'x+3=5', 'globalThis.fetch(1)', 'constructor(2)', 'sqrt(-1)', '1/0', 'log(0)', '171!', 'ncr(2,3)',
        '(-1)!', '2+', '(2+3', 'sin(1,2)', 'root(0,2)', 'tan(90)', '2^10000', '('.repeat(70)+'1'+')'.repeat(70),
        '2^'.repeat(100)+'2', '1+'.repeat(300)+'1', '1'.repeat(2001)]) assert.throws(() => c(q), undefined, q);
});
test('settings strip keys, questions and answer history; endpoint validation', () => {
    const { settingsOf, endpointOf } = load().test;
    assert.deepEqual(Object.keys(settingsOf({ key:'secret', question:'private', history:[] })).sort(),['angle','endpoint','model','steps']);
    assert.equal(endpointOf('https://api.openai.com/v1/chat/completions'),'https://api.openai.com/v1/chat/completions');
    for (const url of ['http://host/v1','https://user:pass@host/v1','https://host/path?key=secret','https://host/path#secret','https://host/\\evil']) assert.throws(() => endpointOf(url));
});
test('chat button loads the draft, appends only on request and rejects channel/account changes', async () => {
    const h = harness(); await h.default.start(h.api);
    const mod = { default: { type: () => h.React.createElement('View', {}, h.React.createElement('Right', {}, h.React.createElement('Actions',{onPressExpression:()=>{}}))) } };
    const original = mod.default.type;
    h.callbacks.get('modules/chat_input/native/ChatInput.tsx')(mod);
    const tree = mod.default.type();
    assert.equal(tree.props.children[0].key,'fluttershy-math-ai');
    assert.equal(tree.props.children.length,2);
    assert.equal(h.inserted.length,0);
    const s = h.test.getSession(); s.readDraft(); assert.equal(s.question,'2(3+4)');
    s.result = '14'; s.append(); assert.equal(h.inserted[0][0],'INSERT_TEXT'); assert.equal(h.inserted[0][1].rawText,'\n14');
    h.draft.channel = '789'; s.append(); assert.match(s.error,/original chat/); assert.equal(h.inserted.length,1);
    h.draft.channel = '123'; h.draft.account = '999'; s.append(); assert.equal(h.inserted.length,1);
    s.key = 'not-saved'; h.default.stop(); assert.equal(s.key,''); assert.equal(mod.default.type,original); assert.equal(h.callbacks.size,0);
    for (const fn of h.removers) fn();
});
test('AI sends only the selected question and instructions, parses answer and blocks duplicate taps', async () => {
    let resolve, count=0, sent;
    const h = harness({ fetch: (url, request) => { count++; sent={url,request}; return new Promise(r => { resolve=r; }); } });
    await h.default.start(h.api); const s=h.test.getSession(); s.question='Solve 2x+3=9'; s.key='test-key';
    const pending=h.test.solveAI(s); await h.test.solveAI(s); assert.equal(count,1); assert.equal(s.busy,true);
    const body=JSON.parse(sent.request.body); assert.equal(body.messages.length,2); assert.equal(body.messages[1].content,s.question);
    assert.equal(sent.request.headers.Authorization,'Bearer test-key'); assert.equal(sent.request.redirect,'error');
    resolve({ok:true,text:async()=>JSON.stringify({choices:[{message:{content:'x = 3'},finish_reason:'stop'}]})});
    await pending; assert.equal(s.result,'x = 3'); assert.equal(s.busy,false); assert.equal(s.history.length,1); assert.equal(h.saved.length,0);
    h.default.stop();
});
test('AI errors, no key, empty content, invalid JSON, cut-off answer and credit failures', async () => {
    for(const response of [ {ok:false,status:401}, {ok:false,status:429}, {ok:false,status:500},
        {ok:true,text:async()=>'bad json'}, {ok:true,text:async()=>'{}'},
        {ok:true,text:async()=>JSON.stringify({choices:[{finish_reason:'length',message:{content:'partial'}}]})} ]) {
        const h=harness({fetch:async()=>response}); await h.default.start(h.api); const s=h.test.getSession(); s.question='2+2';
        await h.test.solveAI(s); assert.match(s.error,/API key/); s.key='test-key'; await h.test.solveAI(s);
        assert.ok(s.error); assert.equal(s.result,''); assert.equal(s.busy,false); h.default.stop();
    }
});
test('AI timeout and cancel settle stalled fetch/body and stop clears all session data', async () => {
    for(const stage of ['fetch','body']) {
        let timer;
        const h=harness({fetch:async()=> stage==='fetch' ? new Promise(()=>{}) : {ok:true,text:()=>new Promise(()=>{})},
            setTimeout:fn=>{timer=fn;return 1;},clearTimeout:()=>{}});
        await h.default.start(h.api); const s=h.test.getSession(); s.question='2+2'; s.key='key';
        let pending=h.test.solveAI(s); timer(); await pending; assert.match(s.error,/timed out/);
        pending=h.test.solveAI(s); h.test.cancel(s); await pending; assert.match(s.error,/cancelled/);
        pending=h.test.solveAI(s); h.default.stop(); await pending;
        assert.equal(s.key,''); assert.equal(s.question,''); assert.equal(s.result,''); assert.equal(s.history.length,0);
    }
});
test('packaged plugin starts, retains settings access, and saves no API key from panel actions', async () => {
    const zip=path.join(__dirname,'../pool/dev.fluttershy2008.math-ai@1.0.0.zip');
    const script=execFileSync('python3',['-c','import sys,zipfile; print(zipfile.ZipFile(sys.argv[1]).read("index.js").decode())',zip],{encoding:'utf8'});
    const packaged=vm.runInNewContext(script,{setTimeout,clearTimeout,AbortController});
    const h=harness(); await packaged.default.start(h.api);
    const panel=packaged.default.SettingsComponent({api:h.api});
    const rendered=panel.type(panel.props);
    const nodes=[]; function visit(n){if(Array.isArray(n))n.forEach(visit);else if(n&&typeof n==='object'){nodes.push(n);visit(n.props?.children);}} visit(rendered);
    const saveAngle=nodes.find(n=>n.props?.accessibilityLabel==='RAD'); assert.ok(saveAngle); saveAngle.props.onPress();
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(h.saved.at(-1).angle,'RAD'); assert.deepEqual(Object.keys(h.saved.at(-1)).sort(),['angle','endpoint','model','steps']);
    packaged.default.stop(); for(const fn of h.removers)fn();
});
