// Render the real settings panel with Vencord's real switch/text components.
// Run with VENCORD_SOURCE=/path/to/Vencord and Playwright installed.
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('..', import.meta.url));
const upstream = process.env.VENCORD_SOURCE;
if (!upstream) throw new Error('Set VENCORD_SOURCE to a Vencord checkout.');
const out = process.env.PREVIEW_OUTPUT || mkdtempSync(path.join(tmpdir(), 'hbim-preview-'));
mkdirSync(out, { recursive: true });
const defaults = { blocked:true, ignored:true, removeReplies:true, removeBotCommands:true, removeMentions:true, whitelistEnabled:false, hiddenServerIds:'1462026187323871303', whitelistedIds:'', hideServers:true, hideServerChannels:true, hideServerIcons:true, hideServerPings:true };
await build({
    stdin: { contents: `import * as React from 'react';import {createRoot} from 'react-dom/client';import {SettingsPanel} from './hideBlockedAndIgnoredMessages/settings-panel';function App(){const [values,set]=React.useState(${JSON.stringify(defaults)});return <SettingsPanel values={values} onToggle={(k,v)=>set(s=>({...s,[k]:v}))} onSave={v=>set(s=>({...s,...v}))}/>;}createRoot(document.getElementById('root')).render(<App/>);`, resolveDir:root, sourcefile:'preview.tsx', loader:'tsx' },
    bundle:true, format:'iife', platform:'browser', jsx:'automatic', outfile:path.join(out,'app.js'),
    alias: {'react':path.dirname(require.resolve('react/package.json')), 'react-dom':path.dirname(require.resolve('react-dom/package.json'))},
    plugins:[{ name:'vencord-preview', setup(b){
        b.onResolve({filter:/^@webpack\/common$/},()=>({path:'react-host',namespace:'host'}));
        b.onResolve({filter:/^@utils\/misc$/},()=>({path:'classes',namespace:'host'}));
        b.onResolve({filter:/^@components\//},a=>({path:path.join(upstream,'src/components',a.path.slice('@components/'.length)+'.tsx')}));
        b.onResolve({filter:/^@utils\/css$/},()=>({path:path.join(upstream,'src/utils/css.ts')}));
        b.onLoad({filter:/.*/,namespace:'host'},a=>a.path==='classes'?{contents:'export const classes=(...xs)=>xs.filter(Boolean).join(" ");'}:{contents:'import * as React from "react";export {React};export const {useState,useEffect}=React;',resolveDir:root});
    }}]
});
writeFileSync(path.join(out,'index.html'),`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="app.css"><style>
:root{--font-primary:Arial,sans-serif;--background-primary:#202125;--background-secondary:#27282d;--background-tertiary:#191a1e;--background-base-low:#27282d;--input-background:#1d1e22;--text-normal:#dbdee1;--header-primary:#f2f3f5;--text-muted:#a4a6b2;--border-subtle:#ffffff12;--brand-500:#5865f2;--primary-400:#80848e}body{margin:0;background:var(--background-primary);font-family:Arial,sans-serif}main{max-width:760px;margin:auto;padding:32px;box-sizing:border-box}button{font-family:inherit} .light{--background-primary:#fff;--background-secondary:#f2f3f5;--background-tertiary:#ebedef;--background-base-low:#f2f3f5;--input-background:#fff;--text-normal:#2e3338;--header-primary:#060607;--text-muted:#5d6470;--border-subtle:#00000018}@media(max-width:480px){main{padding:16px}}
</style></head><body><main id="root"></main><script src="app.js"></script></body></html>`);
const server = createServer((req,res)=>{ const file = req.url === '/'?'index.html':req.url.slice(1);if(!['index.html','app.js','app.css'].includes(file)){res.writeHead(404).end();return;} res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'text/html');res.end(readFileSync(path.join(out,file))); });
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser = await chromium.launch({headless:true, executablePath:process.env.CHROMIUM_PATH, args:['--no-sandbox']});
const page = await browser.newPage({viewport:{width:950,height:1000},deviceScaleFactor:1});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try {
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.getByRole('tab',{name:'Users',exact:true}).waitFor();
    await page.locator('main').screenshot({path:path.join(out,'users.png')});
    await page.getByRole('tab',{name:'Servers'}).click();
    await page.locator('main').screenshot({path:path.join(out,'servers.png')});
    const serverField=page.getByRole('textbox',{name:'Hidden server IDs'});
    await serverField.fill('bad-id');
    await page.getByRole('button',{name:'Save IDs',exact:true}).click();
    assert.equal(await page.getByRole('alert').count(),1);
    await serverField.fill('1462026187323871303,1462026187323871303\n400000000000000002');
    await page.getByRole('tab',{name:'Whitelist'}).click();
    const userField=page.getByRole('textbox',{name:'Whitelisted user IDs'});
    await userField.fill('<@!400000000000000003>');
    await page.getByRole('button',{name:'Save IDs',exact:true}).click();
    assert.equal(await userField.inputValue(),'400000000000000003');
    await page.getByRole('tab',{name:'Servers'}).click();
    assert.equal(await serverField.inputValue(),'1462026187323871303\n400000000000000002');
    await page.getByRole('checkbox',{name:/Hide messages from selected servers/}).uncheck();
    assert.equal(await page.getByRole('checkbox',{name:/Hide their channels and forums/}).isDisabled(),true);
    assert.equal(await page.getByRole('checkbox',{name:/Hide selected server icons/}).isDisabled(),false);
    await page.getByRole('checkbox',{name:/Hide selected server icons/}).uncheck();
    assert.equal(await page.getByRole('checkbox',{name:/Hide their pings and notifications/}).isChecked(),true);
    await page.getByRole('tab',{name:'Whitelist'}).click();
    await page.locator('main').screenshot({path:path.join(out,'whitelist.png')});
    for(const width of [760,420,320]){
        await page.setViewportSize({width,height:1000});
        for(const name of ['Users','Servers','Whitelist']){
            await page.getByRole('tab',{name:name==='Users'?name:new RegExp(name),exact:name==='Users'}).click();
            assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${width}px ${name} overflow`);
            await page.locator('main').screenshot({path:path.join(out,`${name.toLowerCase()}-${width}.png`)});
        }
    }
    await page.setViewportSize({width:760,height:1000});
    await page.evaluate(()=>document.documentElement.classList.add('light'));
    await page.locator('main').screenshot({path:path.join(out,'whitelist-light.png')});
    await page.getByRole('tab',{name:'Users',exact:true}).focus();
    await page.keyboard.press('ArrowRight');
    assert.match(await page.locator('[role=tab][aria-selected=true]').innerText(),/Servers/);
    assert.equal(await page.locator('[role=tab]:focus').getAttribute('aria-selected'),'true');
    assert.deepEqual(errors,[]);
    console.log('PASS: real Vencord controls, three tabs, ID validation/save, independent switches, keyboard navigation, light/dark and 320/420/760px layouts.');
    console.log(`Preview files: ${out}`);
} finally {await browser.close();await new Promise(r=>server.close(r));}
