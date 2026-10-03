/* SPDX-License-Identifier: GPL-3.0-or-later */
import { QR_VENDOR_SOURCE, QR_RUNTIME_SOURCE } from './qr-assets.mjs';

export const QR_BASE_URL = 'https://discord.com/';
export function allowedQrNavigation(url) { return url === 'about:blank' || url === QR_BASE_URL || url === 'https://discord.com'; }
export function parseQrMessage(event, session) {
    const raw = event?.nativeEvent;
    if (!raw || !allowedQrNavigation(raw.url) || typeof raw.data !== 'string' || raw.data.length > 8192) return;
    let data;
    try { data = JSON.parse(raw.data); } catch { return; }
    if (data?.provider !== 'more-alts-qr' || data.session !== session) return;
    if (data.type === 'complete' && typeof data.token === 'string' && data.token.length >= 20 && data.token.length <= 4096
        && !/\s/.test(data.token) && typeof data.userId === 'string' && /^\d{15,22}$/.test(data.userId)) return data;
    if (data.type === 'error' && ['crypto','connection','timeout','expired','cancelled','protocol','verification','rate-limit','rejected'].includes(data.code))
        return { type: 'error', code: data.code, retryAfter: Math.max(1, Number(data.retryAfter) || 60) };
    if (data.type === 'status' && ['connecting','ready','scanned','approved'].includes(data.status)) return { type: 'status', status: data.status };
}
export function qrErrorMessage(code, retryAfter) {
    const messages = {
        crypto: 'QR login needs an updated Android System WebView or Chrome with secure encryption support.',
        connection: 'Could not connect to Discord’s QR login service. Check your connection, then refresh the code.',
        timeout: 'Discord took too long to respond. Refresh the code to try again.',
        expired: 'This QR code expired. Tap Refresh QR code to make a new one.',
        cancelled: 'The sign-in was cancelled in Discord. Refresh the code when you are ready.',
        protocol: 'Discord could not complete this QR login. Refresh the code or use email and password.',
        verification: 'Discord requires extra verification for this sign-in. Complete it through Discord’s normal login.',
        rejected: 'Discord did not accept the approved QR session. Refresh the code or use email and password.'
    };
    return code === 'rate-limit' ? `Discord asked you to wait ${Math.ceil(retryAfter || 60)} seconds before refreshing.` : messages[code] || messages.protocol;
}
export function makeQrHtml(session) {
    if (!/^[a-z0-9-]{1,80}$/i.test(session)) throw new Error('Invalid QR session');
    const runtime = `${QR_VENDOR_SOURCE}\n${QR_RUNTIME_SOURCE}`.replace(/<\/script/gi, '<\\/script');
    return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${session}'; style-src 'unsafe-inline'; connect-src wss://remote-auth-gateway.discord.gg https://discord.com/api/v9/users/@me/remote-auth/login; img-src data:; base-uri 'none'; form-action 'none'; frame-src 'none'; object-src 'none'">
<style>html,body{margin:0;padding:0;background:#fff;color:#242429;font:14px system-ui,sans-serif;text-align:center}body{padding:10px}#qr{width:min(224px,calc(100vw - 20px));height:min(224px,calc(100vw - 20px));margin:0 auto;display:flex;align-items:center;justify-content:center}svg{width:100%;height:100%;image-rendering:pixelated}#status{margin:8px auto 0;line-height:20px;max-width:260px}.waiting{font-size:16px;padding:20px}</style></head>
<body><div id="qr" class="waiting">Connecting to Discord…</div><div id="status">Creating a fresh sign-in code</div>
<script nonce="${session}">${runtime}
(function(){
var box=document.getElementById('qr'),status=document.getElementById('status');
var flow=startRemoteAuth({crypto:window.crypto,socketFactory:function(url){return new WebSocket(url);},fetcher:function(url,options){return fetch(url,options);},
renderCode:function(url){var qr=qrcode(0,'M');qr.addData(url,'Byte');qr.make();box.className='';box.innerHTML=qr.createSvgTag({cellSize:4,margin:16,scalable:true});},
clearCode:function(){box.textContent='';},
emit:function(value){
if(value.type==='status'){var labels={connecting:'Connecting to Discord…',ready:'Scan and approve on your other device',scanned:'Scanned! Approve this login in Discord.',approved:'Approved! Saving your account…'};status.textContent=labels[value.status]||'';if(value.status==='scanned'||value.status==='approved'){box.className='waiting';box.textContent=value.status==='scanned'?'Waiting for your approval':'Signing in…';}}
if(value.type==='error'){box.className='waiting';box.textContent=value.code==='expired'?'Code expired':'QR sign-in stopped';status.textContent='Use Refresh QR code below to try again.';}
if(value.type==='complete'){box.className='waiting';box.textContent='Approved';status.textContent='Checking the approved account…';}
window.ReactNativeWebView.postMessage(JSON.stringify(Object.assign({provider:'more-alts-qr',session:'${session}'},value)));
}});
window.stopMoreAltsQr=function(){flow.stop();};window.addEventListener('pagehide',window.stopMoreAltsQr);window.addEventListener('beforeunload',window.stopMoreAltsQr);
})();</script></body></html>`;
}
