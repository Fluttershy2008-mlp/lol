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
    const code = source.replace('return { default: { jsonStorage:', 'return { test: { calculate, solveOutgoing, inlineAnswer, currencyQuery, currencyLabel, rateRequest, currencyText, Composer, attachPreview, flatStyle, InlinePreview, MathButton, format, settingsOf, runNano, solveAI, cancel, addButton, getSession: () => current }, default: { jsonStorage:');
    return vm.runInNewContext(code, context);
}
function harness(extra = {}) {
    const callbacks = new Map(), removers = [], saved = [], patches = [];
    const draft = { channel: '123', account: '456', text: '2(3+4)' }, inserted = [];
    const React = { createElement: (type, props, ...children) => ({ type, key: props?.key, props: { ...props, children: children.length === 1 ? children[0] : children } }),
        cloneElement: (node, props, children) => ({ ...node, props: { ...node.props, ...props, children } }),
        isValidElement: node => !!node?.type, useState: value => [value, () => {}], useRef: value => ({ current: value }), useEffect: () => {} };
    const api = { cleanup: fn => removers.push(fn), jsonStorage: { loaded: true, cache: {}, set: async v => saved.push(v) },
        unscoped: { react: { React, ReactNative: {} }, modules: { finders: { filters: { withProps: (...props) => props },
            lookupModule: props => props.includes('dispatchToLastSubscribed') ? [{ dispatchToLastSubscribed: (...args) => inserted.push(args) }] : [] } },
            discord: { utils: { modules: { finders: { getModuleWithImportedPath: (p, fn) => { callbacks.set(p, fn); return () => callbacks.delete(p); } } } },
                flux: { Stores: { SelectedChannelStore: { getChannelId: () => draft.channel }, UserStore: { getCurrentUser: () => ({ id: draft.account }) }, DraftStore: { getDraft: () => draft.text } } } },
            patcher: {
                after: (holder, key, hook) => { const original = holder[key]; holder[key] = (...args) => hook(original(...args)); const remove = () => { holder[key] = original; }; patches.push(remove); return remove; },
                instead: (holder,key,hook) => {const original=holder[key];holder[key]=function(...args){return hook.call(this,args,original);};return()=>{holder[key]=original;};}
            } } };
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
test('settings remove old cloud fields, keys, questions and answer history', () => {
    const { settingsOf } = load().test;
    assert.deepEqual(Object.keys(settingsOf({ key:'secret', endpoint:'https://old.example/v1', model:'old-cloud-model', question:'private', history:[] })).sort(),['aiSend','angle','autoSend','currency','inline','steps']);

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
    h.default.stop(); assert.equal(mod.default.type,original); assert.equal(h.callbacks.size,0);
    for (const fn of h.removers) fn();
});
test('Nano solve uses the native bridge without a key or any cloud AI request', async () => {
    const h=harness({fetch:()=>{throw Error('Cloud inference must not be used');}}),calls=[];
    h.api.unscoped.modules.native={callNativeMethod:async(name,args)=>{calls.push([name,args]);return {phase:'done',jobId:'job-1',answer:'x = 3',availability:'ready'};}};
    await h.default.start(h.api);const session=h.test.getSession();session.question='Solve 2x+3=9';
    await h.test.solveAI(session);assert.equal(session.result,'x = 3');assert.match(session.resultKind,/Gemini Nano/);assert.equal(session.busy,false);
    assert.equal(calls[0][0],'dev.fluttershy2008.math-ai.nano.solve');assert.deepEqual(Array.from(calls[0][1]),['Solve 2x+3=9','DEG',true]);
    assert.equal(session.history.length,1);assert.equal(h.saved.length,0);h.default.stop();
});
test('Nano setup checks model readiness without a question or API fields', async () => {
    const h=harness(),calls=[];h.api.unscoped.modules.native={callNativeMethod:async(name,args)=>{calls.push([name,args]);return {result:{phase:'done',jobId:'setup',answer:'',availability:'ready'}};}};
    await h.default.start(h.api);const s=h.test.getSession();await h.test.runNano(s,true);assert.match(s.notice,/ready/);assert.equal(s.nanoAvailability,'ready');
    assert.equal(calls[0][0],'dev.fluttershy2008.math-ai.nano.setup');assert.equal(calls[0][1].length,0);h.default.stop();
});
test('Nano reports unavailable native bridge, missing companion and invalid answers without cloud fallback', async () => {
    const h=harness();await h.default.start(h.api);const s=h.test.getSession();s.question='2+2';await h.test.solveAI(s);assert.match(s.error,/Android Nano bridge/);h.default.stop();
    for(const status of [{phase:'error',error:'Install the Math Nano companion APK first',jobId:'one'},
        {phase:'done',answer:'',jobId:'one'},{phase:'cancelled',jobId:'one'},{phase:'done',answer:'x'.repeat(16001),jobId:'one'}]){
        const w=harness();w.api.unscoped.modules.native={callNativeMethod:async()=>status};await w.default.start(w.api);const session=w.test.getSession();session.question='2+2';
        await w.test.solveAI(session);assert.ok(session.error);assert.equal(session.result,'');assert.equal(session.busy,false);w.default.stop();
    }
});
test('Nano polls an identified job, ignores duplicate taps, and handles cancellation and plugin stop', async () => {
    const timers=new Map();let serial=0;const calls=[],statuses=[];
    const h=harness({setTimeout:(fn,delay)=>{const id=++serial;timers.set(id,{fn,delay});return id;},clearTimeout:id=>timers.delete(id)});
    h.api.unscoped.modules.native={callNativeMethod:async(name,args)=>{calls.push([name,args]);if(name.endsWith('.status'))return statuses.shift();return {phase:'opening',jobId:'nano-1'};}};
    await h.default.start(h.api);const s=h.test.getSession();s.question='2+2';let run=h.test.solveAI(s);await h.test.solveAI(s);
    for(let i=0;i<5;i++)await Promise.resolve();assert.equal(calls.filter(c=>c[0].endsWith('.solve')).length,1);
    statuses.push({phase:'done',jobId:'nano-1',answer:'4',availability:'ready'});[...timers.values()].find(t=>t.delay===500).fn();await run;assert.equal(s.result,'4');
    run=h.test.solveAI(s);for(let i=0;i<5;i++)await Promise.resolve();h.test.cancel(s);await run;assert.match(s.error,/cancelled/);
    assert.ok(calls.some(c=>c[0].endsWith('.cancel')&&c[1][0]==='nano-1'));
    run=h.test.solveAI(s);for(let i=0;i<5;i++)await Promise.resolve();h.default.stop();await run;assert.equal(s.question,'');assert.equal(s.result,'');assert.equal(s.history.length,0);assert.equal(timers.size,0);
});
test('Nano rejects a result from a different job instead of showing a stale answer', async () => {
    let poll;const h=harness({setTimeout:(fn,delay)=>{if(delay===500)poll=fn;return delay;},clearTimeout:()=>{}});
    h.api.unscoped.modules.native={callNativeMethod:async(name)=>name.endsWith('.status')?{phase:'done',jobId:'other-job',answer:'bad'}:{phase:'opening',jobId:'expected'}};
    await h.default.start(h.api);const s=h.test.getSession();s.question='2+2';const run=h.test.solveAI(s);for(let i=0;i<5;i++)await Promise.resolve();poll();await run;
    assert.match(s.error,/session changed/);assert.equal(s.result,'');h.default.stop();
});
test('packaged plugin starts, retains settings access, and saves no API key from panel actions', async () => {
    const zip=path.join(__dirname,'../pool/dev.fluttershy2008.math-ai@2.2.1.zip');
    const script=execFileSync('python3',['-c','import sys,zipfile; print(zipfile.ZipFile(sys.argv[1]).read("index.js").decode())',zip],{encoding:'utf8'});
    const packaged=vm.runInNewContext(script,{setTimeout,clearTimeout,setInterval,clearInterval,AbortController});
    const h=harness(); await packaged.default.start(h.api);
    const panel=packaged.default.SettingsComponent({api:h.api});
    const rendered=panel.type(panel.props);
    const nodes=[]; function visit(n){if(Array.isArray(n))n.forEach(visit);else if(n&&typeof n==='object'){nodes.push(n);visit(n.props?.children);}} visit(rendered);
    const saveAngle=nodes.find(n=>n.props?.accessibilityLabel==='RAD'); assert.ok(saveAngle); saveAngle.props.onPress();
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(h.saved.at(-1).angle,'RAD'); assert.deepEqual(Object.keys(h.saved.at(-1)).sort(),['aiSend','angle','autoSend','currency','inline','steps']);
    packaged.default.stop(); for(const fn of h.removers)fn();
});

function mountHooks(h, Component, props) {
    const state=[], effects=[], pending=[]; let cursor=0, dirty=true, tree;
    h.React.useState=initial=>{const at=cursor++;if(!(at in state))state[at]=typeof initial==='function'?initial():initial;
        return [state[at],next=>{const value=typeof next==='function'?next(state[at]):next;if(!Object.is(value,state[at])){state[at]=value;dirty=true;}}];};
    h.React.useRef=initial=>{const at=cursor++;if(!(at in state))state[at]={current:initial};return state[at];};
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
test('Sigma keeps native spacing but handles long press even when the native button discards it', async () => {
    const h=harness();await h.default.start(h.api);const s=h.test.getSession();
    const RN=h.api.unscoped.react.ReactNative;RN.Pressable='Pressable';RN.View='View';RN.Image='Image';
    function NativeActionButton({IconComponent,onPress}) {return h.React.createElement('NativePressable',{onPress},h.React.createElement(IconComponent,{}));}
    h.callbacks.get('modules/chat_input/native/action_buttons/ChatInputActionButton.tsx')({default:NativeActionButton});
    const tree=h.test.MathButton({api:h.api,session:s}), button=tree.props.children[0],visual=button.props.children;
    assert.equal(button.type,'Pressable');assert.equal(visual.props.pointerEvents,'none');assert.equal(visual.props.importantForAccessibility,'no-hide-descendants');
    const native=visual.props.children;assert.equal(native.type,NativeActionButton);
    assert.equal(NativeActionButton(native.props).props.onLongPress,undefined);
    button.props.onPressIn();button.props.onLongPress();assert.equal(s.visible,true);assert.equal(s.question,h.draft.text);
    button.props.onPress();assert.equal(s.settings.aiSend,false);
    const nativeStyle={width:24,height:24,marginHorizontal:2},frame=native.props.IconComponent({style:nativeStyle});
    assert.equal(h.test.flatStyle(RN,frame.props.style).marginHorizontal,2);
    assert.equal(h.test.flatStyle(RN,frame.props.style).alignItems,'center');
    const icon=frame.props.children;assert.equal(icon.props.style.width,20);assert.equal(icon.props.style.height,20);
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
test('normal send calculates whole scientific expressions, basic math in prose, and offline units', () => {
    const solve=load().test.solveOutgoing;
    for(const [input,result] of [['2+2','4'],['= 2+2','4'],['2(3+4)','14'],['2^3^2','512'],['5!','120'],
        ['sin(30)','0.5'],['√(81)','9'],['∛(27)','3'],['3²+2³','17'],['ncr(10,3)','120'],['2π','6.2831853071796'],
        ['pi/2','1.5707963267949'],['e^0','1'],['τ/2','3.1415926535898'],['= 5 ft in cm','152.4 cm'],['5 ft in cm','152.4 cm'],
        ['The answer is 2+2!','The answer is 2+2!'],['I got 2+2 today','I got 4 today'],['2+2 and 3*4','4 and 12'],
        ['Try 8÷2 please','Try 4 please'],['2+2, then 1/0','4, then 1/0']])assert.equal(solve(input),result,input);
    assert.equal(solve('cos(pi)','RAD'),'-1');assert.equal(solve('ans*2','DEG',7),'14');
});
test('send-time solving preserves literal text, dates, mentions, URLs, equations and invalid input', () => {
    const solve=load().test.solveOutgoing;
    for(const text of ['hello world','753962426407452713','+65 1234 5678','2026-11-03','10/11/2026','1-2-3','2+2 = 4',
        '`2+2`','```js\n2+2\n```','```\n2+2','https://example.com/2+2','<@123456789>','[2+2](https://example.com)',
        'item2+2','2+2cm','£2+2','sqrt(-1)','sqrt(2+2','1/0','2+','5 5+2','= 10 USD to SGD','10 USD to SGD','x+2=3'])
        assert.equal(solve(text),text,text);
    assert.equal(solve('Keep `2+2`, but solve 3+4 please'),'Keep `2+2`, but solve 7 please');
});
test('send hook forwards exactly one native send with its original receiver, metadata, options and return value', async () => {
    const h=harness();await h.default.start(h.api);const calls=[],answer=Promise.resolve('sent');
    const actions={sendMessage(...args){calls.push({receiver:this,args});return answer;},revealMessage(){}};
    const original=actions.sendMessage;const connect=h.callbacks.get('actions/MessageActionCreators.tsx');connect({default:actions});connect(actions);
    const msg={content:'2+2',attachments:[{id:'one'}],allowedMentions:{parse:[]},nonce:'123'},options={tts:false};
    assert.equal(actions.sendMessage('123',msg,options),answer);assert.equal(calls.length,1);assert.equal(calls[0].receiver,actions);
    assert.equal(calls[0].args[1].content,'4');assert.equal(msg.content,'2+2');assert.equal(calls[0].args[1].attachments,msg.attachments);
    assert.equal(calls[0].args[1].allowedMentions,msg.allowedMentions);assert.equal(calls[0].args[2],options);
    const s=h.test.getSession();assert.equal(s.sendReady,true);s.settings.autoSend=false;
    actions.sendMessage('123',msg,options);assert.equal(calls[1].args[1],msg);s.settings.autoSend=true;
    const ordinary={content:'hello'};actions.sendMessage('123',ordinary);assert.equal(calls[2].args[1],ordinary);
    h.default.stop();assert.equal(actions.sendMessage,original);actions.sendMessage('123',msg);assert.equal(calls[3].args[1],msg);
});
test('expanded scientific keys include roots, powers, inverse/hyperbolic trig, logs and sign change', async () => {
    const h=harness();await h.default.start(h.api);const s=h.test.getSession();
    const panel=h.default.SettingsComponent({api:h.api});const tree=panel.type(panel.props),nodes=flat(tree);
    for(const label of ['x²','x³','xʸ','√','∛','ⁿ√','sin⁻¹','sinh','asinh','log₂','10ˣ','eˣ','1/x','nCr','nPr','τ','±','EE'])
        assert.ok(nodes.some(n=>n.props?.accessibilityLabel===label),label);
    s.question='3';nodes.find(n=>n.props?.accessibilityLabel==='x²').props.onPress();assert.equal(s.question,'3²');
    nodes.find(n=>n.props?.accessibilityLabel==='±').props.onPress();assert.equal(s.question,'-(3²)');
    assert.equal(h.test.calculate(s.question),-9);assert.equal(h.test.calculate('asinh(0)+acosh(1)+atanh(0)'),0);h.default.stop();
});

function connectSender(h) {
    const sent=[];
    const actions={sendMessage(...args){sent.push({receiver:this,args});return Promise.resolve('sent');},revealMessage(){}};
    h.callbacks.get('actions/MessageActionCreators.tsx')({default:actions});
    return {actions,sent};
}
test('Sigma tap toggles and persists AI mode; hold opens the calculator without toggling', async () => {
    const h=harness();await h.default.start(h.api);const s=h.test.getSession();
    assert.equal(s.settings.aiSend,false);
    let b=h.test.MathButton({api:h.api,session:s}).props.children[0];
    assert.equal(b.props.accessibilityLabel,'Auto AI solve: OFF');
    b.props.onPressIn();b.props.onPress();assert.equal(s.settings.aiSend,true);assert.equal(s.visible,false);
    await new Promise(r=>setImmediate(r));assert.equal(h.saved.at(-1).aiSend,true);
    b=h.test.MathButton({api:h.api,session:s}).props.children[0];
    assert.equal(b.props.accessibilityState.selected,true);b.props.onLongPress();
    assert.equal(s.visible,true);assert.equal(s.settings.aiSend,true);assert.equal(s.question,h.draft.text);
    b.props.onPress();assert.equal(s.settings.aiSend,true);
    b.props.onPressIn();b.props.onPress();assert.equal(s.settings.aiSend,false);h.default.stop();
});
test('release after a long hold never toggles AI mode across the modal rerender', async () => {
    const h=harness();await h.default.start(h.api);const s=h.test.getSession();
    const ui=mountHooks(h,h.test.MathButton,{api:h.api,session:s});let b=ui.render().props.children[0];
    b.props.onPressIn();b.props.onLongPress();assert.equal(s.visible,true);
    b=ui.render().props.children[0];b.props.onPress();assert.equal(s.settings.aiSend,false);
    b.props.onPressIn();b.props.onPress();assert.equal(s.settings.aiSend,true);
    ui.unmount();h.default.stop();
});
test('AI Send solves the entire written question and sends only the answer once with metadata intact', async () => {
    const h=harness({fetch:()=>{throw Error('No cloud request');}}),nano=[];
    h.api.unscoped.modules.native={callNativeMethod:async(name,args)=>{nano.push([name,args]);return {phase:'done',jobId:'one',answer:'x = 3'};}};
    await h.default.start(h.api);const s=h.test.getSession();s.settings.aiSend=true;
    const {actions,sent}=connectSender(h),msg={content:'Solve 2x + 3 = 9',attachments:[],nonce:'1',allowedMentions:{parse:[]}},options={tts:false};
    const promise=actions.sendMessage('123',msg,options);assert.equal(sent.length,0);
    assert.equal(actions.sendMessage('123',msg,options),promise);
    msg.content='changed after send';assert.equal(await promise,'sent');assert.equal(sent.length,1);
    assert.equal(sent[0].receiver,actions);assert.equal(sent[0].args[0],'123');assert.equal(sent[0].args[1].content,'x = 3');
    assert.equal(sent[0].args[1].nonce,'1');assert.equal(sent[0].args[1].attachments,msg.attachments);
    assert.equal(sent[0].args[1].allowedMentions,msg.allowedMentions);assert.equal(sent[0].args[2],options);
    assert.match(nano[0][1][0],/plain, natural chat language/);
    assert.match(nano[0][1][0],/1–2 short sentences/);
    assert.match(nano[0][1][0],/No working steps, headings, lists, greetings or extra commentary/);
    assert.ok(nano[0][1][0].endsWith('\n\nQuestion: Solve 2x + 3 = 9'));
    assert.equal(nano[0][1][1],'DEG');assert.equal(nano[0][1][2],false);
    assert.equal(s.question,'Solve 2x + 3 = 9');assert.equal(s.history[0].question,'Solve 2x + 3 = 9');
    assert.equal(nano.filter(c=>c[0].endsWith('.solve')).length,1);assert.equal(s.pendingSend,undefined);h.default.stop();
});
test('AI mode computes complete local expressions immediately and bypasses Nano even if offline mode is off', async () => {
    const h=harness();await h.default.start(h.api);const s=h.test.getSession();s.settings.aiSend=true;s.settings.autoSend=false;
    h.api.unscoped.modules.native={callNativeMethod:()=>{throw Error('No Nano for local expression');}};
    const {actions,sent}=connectSender(h);await actions.sendMessage('123',{content:'2+2'});
    assert.equal(sent[0].args[1].content,'4');assert.equal(s.busy,false);h.default.stop();
});
test('AI mode does not partially replace sums inside word problems', async () => {
    const h=harness();let question;
    h.api.unscoped.modules.native={callNativeMethod:async(name,args)=>{if(name.endsWith('.solve'))question=args[0];return {phase:'done',jobId:'one',answer:'8 apples'};}};
    await h.default.start(h.api);h.test.getSession().settings.aiSend=true;const {actions,sent}=connectSender(h);
    await actions.sendMessage('123',{content:'I have 2+2 apples and double them. How many?'});
    assert.ok(question.endsWith('\n\nQuestion: I have 2+2 apples and double them. How many?'));assert.equal(sent[0].args[1].content,'8 apples');h.default.stop();
});
test('short reply instructions respect the native input limit without truncating the question', async () => {
    const h=harness();let nativeCalls=0;
    h.api.unscoped.modules.native={callNativeMethod:async()=>{nativeCalls++;return {phase:'done',jobId:'one',answer:'1'};}};
    await h.default.start(h.api);const s=h.test.getSession();s.settings.aiSend=true;
    const {actions,sent}=connectSender(h),question='Solve x+1=2. '+'a'.repeat(5970);
    await assert.rejects(actions.sendMessage('123',{content:question}),/too long for a short AI reply/);
    assert.equal(nativeCalls,0);assert.equal(sent.length,0);assert.equal(s.question,question);assert.equal(s.busy,false);h.default.stop();
});
test('missing Nano, inference failures and overlong output reject the send without sending raw questions', async () => {
    for(const status of [null,{phase:'error',jobId:'one',error:'Nano unavailable'},{phase:'done',jobId:'one',answer:'x'.repeat(1901)}]){
        const h=harness();if(status)h.api.unscoped.modules.native={callNativeMethod:async()=>status};
        await h.default.start(h.api);const s=h.test.getSession();s.settings.aiSend=true;const {actions,sent}=connectSender(h);
        await assert.rejects(actions.sendMessage('123',{content:'Solve this equation x+1=2'}));
        assert.equal(sent.length,0);assert.equal(s.visible,true);assert.ok(s.error);assert.equal(s.question,'Solve this equation x+1=2');
        assert.equal(s.pendingSend,undefined);h.default.stop();
    }
});
test('changing chat/account/mode, cancelling or stopping prevents late AI sends and removes subscriptions', async () => {
    for(const change of ['chat','account','mode','cancel','stop']){
        let finish;const subscriptions=new Set();const h=harness();
        h.api.unscoped.modules.native={callNativeMethod:(name)=>name.endsWith('.solve')?new Promise(r=>finish=r):Promise.resolve({phase:'done'})};
        for(const store of Object.values(h.api.unscoped.discord.flux.Stores)){store.addChangeListener=fn=>subscriptions.add(fn);store.removeChangeListener=fn=>subscriptions.delete(fn);}
        await h.default.start(h.api);const s=h.test.getSession();s.settings.aiSend=true;const {actions,sent}=connectSender(h);
        const promise=actions.sendMessage('123',{content:'Solve x+1=2',nonce:'a'});const rejected=assert.rejects(promise);
        if(change==='chat'){h.draft.channel='999';for(const fn of subscriptions)fn();h.draft.channel='123';}
        if(change==='account'){h.draft.account='999';for(const fn of subscriptions)fn();h.draft.account='456';}
        if(change==='mode')h.test.MathButton({api:h.api,session:s}).props.children[0].props.onPress();
        if(change==='cancel')h.test.cancel(s);
        if(change==='stop')h.default.stop();
        finish({phase:'done',jobId:'one',answer:'x = 1'});await rejected;
        assert.equal(sent.length,0,change);assert.equal(s.pendingSend,undefined);assert.equal(subscriptions.size,0);h.default.stop();
    }
});
test('a different send is blocked during inference and normal sending works again with AI mode off', async () => {
    let finish;const h=harness();h.api.unscoped.modules.native={callNativeMethod:name=>name.endsWith('.solve')?new Promise(r=>finish=r):Promise.resolve({phase:'done'})};
    await h.default.start(h.api);const s=h.test.getSession();s.settings.aiSend=true;const {actions,sent}=connectSender(h);
    const first=actions.sendMessage('123',{content:'Solve x+1=2',nonce:'a'});
    await assert.rejects(actions.sendMessage('123',{content:'Another question',nonce:'b'}),/already being prepared/);
    finish({phase:'done',jobId:'one',answer:'x = 1'});await first;assert.equal(sent.length,1);
    s.settings.aiSend=false;s.settings.autoSend=false;await actions.sendMessage('123',{content:'hello'});
    assert.equal(sent[1].args[1].content,'hello');h.default.stop();
});
test('a synchronous local send failure is not retried through Nano', async () => {
    const h=harness();await h.default.start(h.api);h.test.getSession().settings.aiSend=true;
    const actions={sendMessage(){throw Error('Native send failed');},revealMessage(){}};
    h.callbacks.get('actions/MessageActionCreators.tsx')(actions);
    assert.throws(()=>actions.sendMessage('123',{content:'2+2'}),/Native send failed/);assert.equal(h.test.getSession().busy,false);h.default.stop();
});

test('bare currency queries accept ISO codes without = and leave ordinary text, units and code alone', () => {
    const {currencyQuery:q,currencyLabel:label}=load().test;
    for(const text of ['10 myr to sgd','=10 MYR to SGD',' 10 MyR in sGd ']){
        const parsed=q(text);assert.equal(parsed.amount,10);assert.equal(parsed.from,'MYR');assert.equal(parsed.to,'SGD');
        assert.equal(label(parsed,{rate:0.31,date:'2026-11-03'}),'10 MYR ≈ 3.10 SGD · 2026-11-03');
    }
    for(const text of ['hello','10 myr','10 myr to','`10 MYR to SGD`','10 bar to psi','10 MYR to SGD please','2+2','https://example.com/10'])assert.equal(q(text),null,text);
});
test('currency appears inside the native chat input, refreshes the amount and clears on edits/unmount', async () => {
    const timers=new Map(),native=[],events=new Set();let id=0,fetches=0;
    const h=harness({setTimeout:(fn,ms)=>{const next=++id;timers.set(next,{fn,ms});return next;},clearTimeout:id=>timers.delete(id),
        fetch:async()=>{fetches++;return {ok:true,text:async()=>JSON.stringify({base:'MYR',quote:'SGD',rate:0.31,date:'2026-11-03'})};}});
    h.api.unscoped.modules.native={callNativeMethod:async(name,args)=>{native.push([name,Array.from(args)]);return {ready:true};}};
    await h.default.start(h.api);const s=h.test.getSession();
    for(const store of Object.values(h.api.unscoped.discord.flux.Stores)){store.addChangeListener=fn=>events.add(fn);store.removeChangeListener=fn=>events.delete(fn);}
    h.draft.text='10 myr to sgd';const ui=mountHooks(h,h.test.InlinePreview,{api:h.api,session:s});assert.equal(ui.render(),null);
    [...timers.values()].find(t=>t.ms===550).fn();await new Promise(r=>setImmediate(r));assert.equal(ui.render(),null);
    const first=native.find(c=>c[1][1]==='10 myr to sgd');assert.ok(first);assert.equal(first[0],'dev.fluttershy2008.math-ai.currency.preview');
    assert.equal(first[1][2],'3.10 SGD');assert.equal(h.draft.text,'10 myr to sgd');assert.equal(s.lastCurrencyLabel,'10 MYR ≈ 3.10 SGD · 2026-11-03');
    h.draft.text='20 myr to sgd';for(const fn of events)fn();ui.render();
    [...timers.values()].filter(t=>t.ms===550).at(-1).fn();await new Promise(r=>setImmediate(r));assert.equal(ui.render(),null);
    const second=native.find(c=>c[1][1]==='20 myr to sgd');assert.equal(second[1][2],'6.20 SGD');
    assert.ok(second[1][0]>first[1][0]);assert.equal(fetches,1);
    h.draft.text='hello';for(const fn of events)fn();assert.equal(ui.render(),null);
    assert.equal(native.at(-1)[1][1],'');assert.equal(native.at(-1)[1][2],'');ui.unmount();h.default.stop();
});
test('currency sends use fetched rates with Sigma either on or off and preserve send metadata', async () => {
    for(const aiSend of [false,true]){
        const requests=[];const h=harness({fetch:async(url)=>{requests.push(url);return {ok:true,text:async()=>JSON.stringify({base:'MYR',quote:'SGD',rate:0.31,date:'2026-11-03'})};}});
        h.api.unscoped.modules.native={callNativeMethod:()=>{throw Error('Currency must not use Nano');}};
        await h.default.start(h.api);const s=h.test.getSession();s.settings.aiSend=aiSend;
        const {actions,sent}=connectSender(h),message={content:'10 myr to sgd',nonce:'fx',attachments:[],allowedMentions:{parse:[]}},options={tts:false};
        const pending=actions.sendMessage('123',message,options);assert.equal(sent.length,0);assert.equal(actions.sendMessage('123',message,options),pending);
        await pending;assert.equal(sent.length,1);assert.equal(sent[0].args[1].content,'3.10 SGD');assert.equal(s.lastCurrencyLabel,'10 MYR ≈ 3.10 SGD · 2026-11-03');
        assert.equal(sent[0].args[1].attachments,message.attachments);assert.equal(sent[0].args[1].allowedMentions,message.allowedMentions);assert.equal(sent[0].args[2],options);
        assert.equal(message.content,'10 myr to sgd');assert.deepEqual(requests,['https://api.frankfurter.dev/v2/rate/myr/sgd']);
        assert.equal(s.busy,false);assert.equal(s.pendingSend,undefined);h.default.stop();
    }
});
test('failed currency lookup never sends the raw query or an AI-guessed rate', async () => {
    const h=harness({fetch:async()=>({ok:false,status:422})});await h.default.start(h.api);const {actions,sent}=connectSender(h);
    await assert.rejects(actions.sendMessage('123',{content:'10 ABC to SGD'}),/currency pair is unavailable/);
    assert.equal(sent.length,0);assert.equal(h.test.getSession().busy,false);h.default.stop();
});
test('changing chats cancels currency sends, including switching back before the rate returns', async () => {
    let finish;const events=new Set(),h=harness({fetch:()=>new Promise(r=>finish=r)});
    for(const store of Object.values(h.api.unscoped.discord.flux.Stores)){store.addChangeListener=fn=>events.add(fn);store.removeChangeListener=fn=>events.delete(fn);}
    await h.default.start(h.api);const {actions,sent}=connectSender(h),s=h.test.getSession();
    const pending=actions.sendMessage('123',{content:'10 MYR to SGD'}),rejected=assert.rejects(pending);
    h.draft.channel='999';for(const fn of events)fn();h.draft.channel='123';
    finish({ok:true,text:async()=>JSON.stringify({base:'MYR',quote:'SGD',rate:0.31,date:'2026-11-03'})});
    await rejected;assert.equal(sent.length,0);assert.equal(s.busy,false);assert.equal(s.pendingSend,undefined);h.default.stop();
});

