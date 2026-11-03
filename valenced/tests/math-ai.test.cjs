'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const source = fs.readFileSync(path.join(__dirname, '../plugins/math-ai/index.js'), 'utf8');
function load(extra = {}) {
    const context = { setTimeout, clearTimeout, setInterval, clearInterval, AbortController, ...extra };
    const code = source.replace('return { default: { jsonStorage:', 'return { test: { calculate, inlineAnswer, rateRequest, currencyText, Composer, attachPreview, flatStyle, InlinePreview, MathButton, format, settingsOf, endpointOf, solveAI, cancel, addButton, getSession: () => current }, default: { jsonStorage:');
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
    assert.deepEqual(Object.keys(settingsOf({ key:'secret', question:'private', history:[] })).sort(),['angle','currency','endpoint','inline','model','steps']);
    assert.equal(endpointOf('https://api.openai.com/v1/chat/completions'),'https://api.openai.com/v1/chat/completions');
    for (const url of ['http://host/v1','https://user:pass@host/v1','https://host/path?key=secret','https://host/path#secret','https://host/\\evil']) assert.throws(() => endpointOf(url));
});
test('chat button loads the draft, appends only on request and rejects channel/account changes', async () => {
    const h = harness(); await h.default.start(h.api);
    const mod = { default: { type: () => h.React.createElement('View', {}, h.React.createElement('Right', {}, h.React.createElement('Actions',{onPressExpression:()=>{}}))) } };
    const original = mod.default.type;
    h.callbacks.get('modules/chat_input/native/ChatInput.tsx')(mod);
    const wrapped = mod.default.type(); assert.equal(wrapped.type.name, 'Composer');
    const tree = wrapped.props.children;
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
    const zip=path.join(__dirname,'../pool/dev.fluttershy2008.math-ai@1.1.1.zip');
    const script=execFileSync('python3',['-c','import sys,zipfile; print(zipfile.ZipFile(sys.argv[1]).read("index.js").decode())',zip],{encoding:'utf8'});
    const packaged=vm.runInNewContext(script,{setTimeout,clearTimeout,setInterval,clearInterval,AbortController});
    const h=harness(); await packaged.default.start(h.api);
    const panel=packaged.default.SettingsComponent({api:h.api});
    const rendered=panel.type(panel.props);
    const nodes=[]; function visit(n){if(Array.isArray(n))n.forEach(visit);else if(n&&typeof n==='object'){nodes.push(n);visit(n.props?.children);}} visit(rendered);
    const saveAngle=nodes.find(n=>n.props?.accessibilityLabel==='RAD'); assert.ok(saveAngle); saveAngle.props.onPress();
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(h.saved.at(-1).angle,'RAD'); assert.deepEqual(Object.keys(h.saved.at(-1)).sort(),['angle','currency','endpoint','inline','model','steps']);
    packaged.default.stop(); for(const fn of h.removers)fn();
});

function mountHooks(h, Component, props) {
    const state=[], effects=[], pending=[]; let cursor=0, dirty=true, tree;
    h.React.useState=initial=>{const at=cursor++;if(!(at in state))state[at]=typeof initial==='function'?initial():initial;
        return [state[at],next=>{const value=typeof next==='function'?next(state[at]):next;if(!Object.is(value,state[at])){state[at]=value;dirty=true;}}];};
    h.React.useEffect=(fn,deps)=>{const at=cursor++;const old=effects[at];if(!old||deps.some((x,i)=>!Object.is(x,old.deps[i])))pending.push(()=>{old?.remove?.();effects[at]={deps,remove:fn()};});};
    return {render(){let count=0;do{if(++count>20)throw Error('Render loop');cursor=0;dirty=false;tree=Component(props);for(const run of pending.splice(0))run();}while(dirty);return tree;},
        unmount(){for(const effect of effects)effect?.remove?.();}};
}
function flat(node) {const nodes=[];function walk(n){if(Array.isArray(n))n.forEach(walk);else if(n&&typeof n==='object'){nodes.push(n);walk(n.props?.children);}}walk(node);return nodes;}
test('inline sums and scientific notation only run after =; unit conversions are offline', () => {
    const {inlineAnswer:a}=load().test;
    assert.equal(a('normal text 5x5'),null);assert.equal(a('== 5x5'),null);assert.equal(a('= '),null);
    for(const [input,expected] of [['= 5x5','25'],['= 12 * 4.5','54'],['= sqrt(144) + sin(30)*8 + 3^2','25'],
        ['= 5 ft in cm','152.4 cm'],['= 1 inch to cm','2.54 cm'],['= 100 cm to m','1 m'],['= 2 kg to g','2000 g'],
        ['= 32 f to c','0 c'],['= 100 c in f','212 f'],['= 0 c to k','273.15 k'],['= 60 min to h','1 h'],
        ['= 36 km/h to m/s','10 m/s'],['= 1 bar to kpa','100 kpa'],['= 1 m2 to cm2','10000 cm2'],['= 1000 ml to l','1 l'],['= 1e-9 m to km','1e-12 km']])
        assert.equal(a(input).text,expected,input);
    for(const q of ['= 1 kg to m','= -274 c to f','= 5+','= fetch(1)'])assert.throws(()=>a(q));
    const fx=a('= 10 usd to aud');assert.equal(fx.kind,'currency');assert.equal(fx.amount,10);assert.equal(fx.from,'USD');assert.equal(fx.to,'AUD');
});
test('currency requests use only the pair; validate rates, cache results and honour currency precision', async () => {
    const calls=[];const h=harness({fetch:async(url,options)=>{calls.push([url,options]);return{ok:true,text:async()=>JSON.stringify({base:'USD',quote:'AUD',rate:1.424,date:'2026-11-02'})};}});
    await h.default.start(h.api);const s=h.test.getSession();
    const rate=await h.test.rateRequest(s,'USD','AUD').promise;
    assert.equal(h.test.currencyText(rate.rate*10,'AUD'),'14.24 AUD');assert.equal(h.test.currencyText(151.5,'JPY'),'152 JPY');
    await h.test.rateRequest(s,'USD','AUD').promise;assert.equal(calls.length,1);
    assert.equal(calls[0][0],'https://api.frankfurter.dev/v2/rate/usd/aud');assert.equal(calls[0][1].headers,undefined);
    assert.equal((await h.test.rateRequest(s,'SGD','SGD').promise).rate,1);assert.equal(calls.length,1);h.default.stop();
});
test('invalid, unavailable and stalled FX requests fail cleanly and stop cancels pending jobs', async () => {
    for(const response of [{ok:false,status:422},{ok:false,status:500},{ok:true,text:async()=>'bad'},
        {ok:true,text:async()=>JSON.stringify({base:'USD',quote:'EUR',rate:1.4,date:'2026-11-02'})},
        {ok:true,text:async()=>JSON.stringify({base:'USD',quote:'AUD',rate:-1,date:'2026-11-02'})}]){
        const h=harness({fetch:async()=>response});await h.default.start(h.api);const s=h.test.getSession();
        await assert.rejects(h.test.rateRequest(s,'USD','AUD').promise);assert.equal(s.rates.size,0);assert.equal(s.fxJobs.size,0);h.default.stop();
    }
    let timer;const h=harness({fetch:()=>new Promise(()=>{}),setTimeout:fn=>{timer=fn;return 1;},clearTimeout:()=>{}});
    await h.default.start(h.api);const s=h.test.getSession();let job=h.test.rateRequest(s,'USD','AUD');timer();await assert.rejects(job.promise,/timed out/);
    job=h.test.rateRequest(s,'USD','AUD');h.default.stop();await assert.rejects(job.promise,/Cancelled/);assert.equal(s.fxJobs.size,0);
});
test('live preview updates on draft events, hides for normal text, copies answers and cleans up listeners', async () => {
    const h=harness({fetch:()=>{throw Error('Offline expressions must not fetch');}});await h.default.start(h.api);const s=h.test.getSession();
    const subscriptions=new Set(), copied=[];
    for(const store of Object.values(h.api.unscoped.discord.flux.Stores)){store.addChangeListener=fn=>subscriptions.add(fn);store.removeChangeListener=fn=>subscriptions.delete(fn);}
    h.api.unscoped.externals={ReactNativeClipboard:{Clipboard:{setString:async text=>copied.push(text)}}};
    const ui=mountHooks(h,h.test.InlinePreview,{api:h.api,session:s});assert.equal(ui.render(),null);
    h.draft.text='= 5x5';for(const fn of subscriptions)fn();let tree=ui.render();
    const pill=flat(tree).find(n=>n.props?.accessibilityLabel==='= 25');assert.ok(pill);pill.props.onPress();await Promise.resolve();assert.equal(copied[0],'25');
    h.draft.text='= 5 ft in cm';for(const fn of subscriptions)fn();tree=ui.render();assert.ok(flat(tree).some(n=>n.props?.accessibilityLabel==='= 152.4 cm'));
    h.draft.text='ordinary message';for(const fn of subscriptions)fn();assert.equal(ui.render(),null);
    s.settings.inline=false;h.draft.text='= 1+2';for(const fn of subscriptions)fn();assert.equal(ui.render(),null);
    h.default.stop();assert.equal(subscriptions.size,0);assert.equal(s.draftSubscriptions.size,0);assert.equal(s.previewDisposers.size,0);ui.unmount();
});
test('FX preview is debounced, discards obsolete answers, displays the rate date and respects its toggle', async () => {
    const timers=new Map();let id=0, resolve, fetches=0;
    const h=harness({setTimeout:(fn,ms)=>{const next=++id;timers.set(next,{fn,ms});return next;},clearTimeout:id=>timers.delete(id),
        fetch:()=>{fetches++;return new Promise(r=>resolve=r);}});
    await h.default.start(h.api);const s=h.test.getSession(),events=new Set();
    for(const store of Object.values(h.api.unscoped.discord.flux.Stores)){store.addChangeListener=fn=>events.add(fn);store.removeChangeListener=fn=>events.delete(fn);}
    h.draft.text='= 10 USD to AUD';const ui=mountHooks(h,h.test.InlinePreview,{api:h.api,session:s});ui.render();assert.equal(fetches,0);
    [...timers.values()].find(t=>t.ms===550).fn();assert.equal(fetches,1);
    h.draft.text='= 5x5';for(const fn of events)fn();let tree=ui.render();assert.ok(flat(tree).some(n=>n.props?.accessibilityLabel==='= 25'));
    resolve({ok:true,text:async()=>JSON.stringify({base:'USD',quote:'AUD',rate:1.424,date:'2026-11-02'})});
    await new Promise(r=>setImmediate(r));tree=ui.render();assert.ok(flat(tree).some(n=>n.props?.accessibilityLabel==='= 25'));
    h.draft.text='= 10 USD to AUD';for(const fn of events)fn();ui.render();[...timers.values()].filter(t=>t.ms===550).at(-1).fn();
    resolve({ok:true,text:async()=>JSON.stringify({base:'USD',quote:'AUD',rate:1.424,date:'2026-11-02'})});await new Promise(r=>setImmediate(r));
    tree=ui.render();assert.ok(flat(tree).some(n=>n.props?.accessibilityLabel==='= 14.24 AUD'));assert.ok(JSON.stringify(tree).includes('2026-11-02'));
    s.settings.currency=false;tree=ui.render();assert.ok(JSON.stringify(tree).includes('Currency lookup is off'));
    ui.unmount();h.default.stop();assert.equal(s.fxJobs.size,0);
});
test('Sigma uses Discord action button with a fixed-size image instead of font baseline sizing', async () => {
    const h=harness();await h.default.start(h.api);const s=h.test.getSession();
    function NativeActionButton(){}h.callbacks.get('modules/chat_input/native/action_buttons/ChatInputActionButton.tsx')({default:NativeActionButton});
    const tree=h.test.MathButton({api:h.api,session:s}), button=tree.props.children[0];assert.equal(button.type,NativeActionButton);
    const icon=button.props.IconComponent({});assert.equal(icon.props.style[0].width,24);assert.equal(icon.props.style[0].height,24);
    assert.match(icon.props.source.uri,/^data:image\/png;base64,/);h.default.stop();
});
test('preview is inside the floating native layout, with an uncapped height and unchanged composer controls', () => {
    const h=harness(), RN={View:'View'}, {attachPreview,flatStyle}=h.test, el=h.React.createElement;
    const controls=el('Controls',{key:'fluttershy-math-ai'}),ref={current:null},onLayout=()=>{};
    const style={position:'absolute',bottom:0,left:0,right:0,flexDirection:'row',alignItems:'center',height:60,maxHeight:120,padding:8,backgroundColor:'#242429',borderRadius:20,overflow:'hidden'};
    const original=el('View',{ref,onLayout,style},controls), preview=el('Preview',{key:'math-ai-inline-preview'});
    const result=attachPreview(h.React,RN,original,preview),outer=flatStyle(RN,result.props.style),content=result.props.children[1];
    assert.equal(result.type,original.type);assert.equal(result.props.ref,ref);assert.equal(result.props.onLayout,onLayout);
    assert.equal(outer.position,'absolute');assert.equal(outer.bottom,0);assert.equal(outer.flexDirection,'column');
    assert.equal(outer.height,undefined);assert.equal(outer.maxHeight,undefined);assert.equal(outer.overflow,'visible');
    assert.equal(result.props.children[0],preview);assert.equal(content.props.children,controls);
    assert.equal(content.props.style.height,60);assert.equal(content.props.style.maxHeight,120);assert.equal(content.props.style.flexDirection,'row');
    assert.equal(content.props.style.padding,8);assert.equal(content.props.style.backgroundColor,'#242429');assert.equal(content.props.style.borderRadius,20);
    assert.equal(content.props.style.position,undefined);assert.equal(content.props.style.flexShrink,0);
    assert.equal(style.height,60);assert.equal(style.flexDirection,'row');assert.equal(attachPreview(h.React,RN,result,preview),result);
});
test('transparent wrappers keep their type and unrelated siblings; unsupported and disabled layouts are left alone', () => {
    const h=harness(), RN={View:'View'},el=h.React.createElement;
    const controls=el('Controls',{key:'fluttershy-math-ai'}),native=el('View',{},controls),sibling=el('Unrelated',{});
    const provider=el('Provider',{value:123},[sibling,native]),preview=el('Preview',{key:'math-ai-inline-preview'});
    const result=h.test.attachPreview(h.React,RN,provider,preview);
    assert.equal(result.type,'Provider');assert.equal(result.props.value,123);assert.equal(result.props.children[0],sibling);
    assert.equal(result.props.children[1].type,'View');assert.equal(result.props.children[1].props.children[0],preview);
    assert.equal(h.test.attachPreview(h.React,RN,sibling,preview),sibling);
    const api={unscoped:{react:{React:h.React,ReactNative:RN}}};
    assert.equal(h.test.Composer({api,session:{active:true,settings:{inline:false}},children:provider}),provider);
    assert.equal(h.test.Composer({api,session:{active:false,settings:{inline:true}},children:provider}),provider);
});
