(() => {
// SPDX-License-Identifier: CC0-1.0
// Shared by the separately installable Revenge bundles; no global API changes.
function withRevengeCompatibility(api, factory, pluginName) {
    var active = true;
    var generation = 0;
    var disposers = new Set();
    var warnings = new Set();
    var delayKey = Symbol.for('bunny.api.patcher.delay');
    var raw = api.patcher;
    function warn(message, error) {
        if (warnings.has(message)) return;
        warnings.add(message);
        try { api.logger?.warn?.('[' + pluginName + '] ' + message, error); } catch (_) {}
    }
    function clear() {
        active = false;
        generation++;
        Array.from(disposers).reverse().forEach(function (dispose) { dispose(); });
    }
    function patchKind(kind) {
        function patch(method, parent, callback, once) {
            var epoch = generation;
            var cancelled = false;
            var unpatch;
            var unsubscribe;
            var uiPatch = method === 'render' || method === 'type' || method === 'default';
            function dispose() {
                if (cancelled) return;
                cancelled = true;
                disposers.delete(dispose);
                try { unsubscribe?.(); } catch (error) { warn('Could not cancel a module subscription.', error); }
                try { unpatch?.(); } catch (error) { warn('Could not remove a ' + method + ' patch.', error); }
            }
            if (!active) return dispose;
            disposers.add(dispose);
            function install(target) {
                if (cancelled || !active || epoch !== generation) return;
                try {
                    var owner = target;
                    var key = method;
                    // React memo/forwardRef exports are objects, not functions.
                    // Inspect the resolved module, not just the lazy proxy.
                    for (var depth = 0; uiPatch && depth < 8; depth++) {
                        var value = owner?.[key];
                        if (value?.$$typeof === Symbol.for('react.memo')) {
                            owner = value; key = 'type';
                        } else if (value?.$$typeof === Symbol.for('react.forward_ref')) {
                            owner = value; key = 'render';
                        } else break;
                    }
                    if (uiPatch && typeof owner?.[key] !== 'function') {
                        warn('Skipped unavailable Discord component method: ' + method);
                        dispose();
                        return;
                    }
                    var remove = raw[kind](key, owner, function () {
                        if (!active || cancelled || epoch !== generation) {
                            if (kind === 'after') return arguments[1];
                            if (kind === 'instead') return arguments[1].apply(this, arguments[0]);
                            return;
                        }
                        try { return callback.apply(this, arguments); }
                        finally { if (once) dispose(); }
                    });
                    // A module can synchronously unload the plugin while installing.
                    if (cancelled || !active || epoch !== generation) remove?.();
                    else unpatch = remove;
                } catch (error) {
                    dispose();
                    // Required data/action patches must still fail visibly.
                    // Only optional UI methods can safely be skipped.
                    if (!uiPatch) throw error;
                    warn('Skipped incompatible Discord component patch: ' + method, error);
                }
            }
            try {
                var delay = parent?.[delayKey];
                if (typeof delay === 'function') {
                    var cancel = delay.call(parent, function (target) {
                        try { install(target); }
                        catch (error) {
                            // The caller is now Discord's module loader, outside
                            // the plugin loader's onLoad error boundary.
                            warn('Deferred Discord method is unavailable: ' + method, error);
                        }
                    });
                    if (typeof cancel === 'function') {
                        if (cancelled) cancel();
                        else unsubscribe = cancel;
                    }
                } else install(parent);
            } catch (error) {
                dispose();
                if (!uiPatch) throw error;
                warn('Could not resolve Discord component: ' + method, error);
            }
            return dispose;
        }
        patch.await = function (method, promise, callback, once) {
            var epoch = generation;
            var cancelled = false;
            var remove;
            function dispose() {
                if (cancelled) return;
                cancelled = true;
                disposers.delete(dispose);
                remove?.();
            }
            if (!active) return dispose;
            disposers.add(dispose);
            Promise.resolve(promise).then(function (target) {
                if (!cancelled && active && epoch === generation) remove = patch(method, target, callback, once);
            }).catch(function (error) {
                warn('Deferred patch failed: ' + method, error);
                dispose();
            });
            return dispose;
        };
        return patch;
    }
    var guardedPatcher;
    function currentPatcher() {
        if (!guardedPatcher || raw !== api.patcher) {
            raw = api.patcher;
            guardedPatcher = Object.create(raw || null);
            ['before', 'after', 'instead'].forEach(function (kind) {
                if (typeof raw?.[kind] === 'function') Object.defineProperty(guardedPatcher, kind, { value: patchKind(kind), enumerable: true });
            });
        }
        return guardedPatcher;
    }
    var localAPI = Object.create(api);
    Object.defineProperty(localAPI, 'patcher', { get: currentPatcher, enumerable: true });
    // Discord's legacy JS toast bridge can queue a broken ToastContainer on
    // newer Android builds (useToastContainer reads .position of undefined).
    // Keep this adapter per-plugin. Never change api.ui or Discord's global UI.
    function safeToast(message) {
        var label = typeof message === 'string' || typeof message === 'number'
            ? String(message)
            : String(message?.message ?? message?.text ?? '');
        if (!label) return;
        try {
            var nativeToast = api.metro?.common?.ReactNative?.ToastAndroid;
            if (typeof nativeToast?.show === 'function') {
                return nativeToast.show(label, nativeToast.SHORT ?? 0);
            }
        } catch (error) {
            warn('Native Android notification failed.', error);
        }
        warn('Notification logged because the Discord toast bridge is unsafe: ' + label);
    }
    var lastUI, lastToasts, adaptedUI;
    function currentUI() {
        var ui = api.ui;
        if (!ui?.toasts) return ui;
        if (ui !== lastUI || ui.toasts !== lastToasts) {
            lastUI = ui;
            lastToasts = ui.toasts;
            adaptedUI = Object.create(ui);
            var toasts = Object.create(ui.toasts);
            Object.defineProperty(toasts, 'showToast', { value: safeToast, enumerable: true });
            Object.defineProperty(adaptedUI, 'toasts', { value: toasts, enumerable: true });
        }
        return adaptedUI;
    }
    Object.defineProperty(localAPI, 'ui', { get: currentUI, enumerable: true });
    var plugin;
    try { plugin = factory(localAPI); }
    catch (error) { clear(); throw error; }
    if (!plugin || typeof plugin !== 'object') { clear(); throw new Error(pluginName + ': invalid plugin exports'); }
    var result = Object.assign({}, plugin);
    result.onLoad = function () {
        active = true;
        var epoch = generation;
        function failed(error) {
            if (active && epoch === generation) {
                try { result.onUnload(); } catch (cleanupError) { warn('Startup cleanup failed.', cleanupError); }
            }
            throw error;
        }
        try {
            var pending = plugin.onLoad?.apply(this, arguments);
            if (pending && typeof pending.then === 'function') return Promise.resolve(pending).catch(failed);
            return pending;
        } catch (error) {
            return failed(error);
        }
    };
    result.onUnload = function () {
        clear();
        return plugin.onUnload?.apply(this, arguments);
    };
    return result;
}

return withRevengeCompatibility(vendetta, function(vendetta) {
return (() => {
/*!
omggif 1.0.10
omggif is a JavaScript implementation of a GIF 89a encoder and decoder.

https://github.com/deanm/omggif


(c) Dean McNamee <dean@gmail.com>, 2013.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to
deal in the Software without restriction, including without limitation the
rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
sell copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
IN THE SOFTWARE.


gifenc 1.0.3
The MIT License (MIT)
Copyright (c) 2017 Matt DesLauriers

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE
OR OTHER DEALINGS IN THE SOFTWARE.



base64-js 1.5.1
The MIT License (MIT)

Copyright (c) 2014 Jameson Little

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

*/
const module = { exports: {} };
var At=Object.create;var Te=Object.defineProperty;var It=Object.getOwnPropertyDescriptor;var Et=Object.getOwnPropertyNames;var _t=Object.getPrototypeOf,Ft=Object.prototype.hasOwnProperty;var Le=(e,t)=>()=>{try{return t||e((t={exports:{}}).exports,t),t.exports;}catch(n){throw t=0,n;}},Ct=(e,t)=>{for(var n in t)Te(e,n,{get:t[n],enumerable:!0});},Xe=(e,t,n,o)=>{if(t&&typeof t=="object"||typeof t=="function"){var _loop=function(r){!Ft.call(e,r)&&r!==n&&Te(e,r,{get:()=>t[r],enumerable:!(o=It(t,r))||o.enumerable});};for(var r of Et(t)){_loop(r);}}return e;};var De=(e,t,n)=>(n=e!=null?At(_t(e)):{},Xe(t||!e||!e.__esModule?Te(n,"default",{value:e,enumerable:!0}):n,e)),bt=e=>Xe(Te({},"__esModule",{value:!0}),e);var Je=Le(Ne=>{"use strict";function Bt(e,t,n,i){var r=0,i=i===void 0?{}:i,s=i.loop===void 0?null:i.loop,a=i.palette===void 0?null:i.palette;if(t<=0||n<=0||t>65535||n>65535)throw new Error("Width/Height invalid.");function u(g){var p=g.length;if(p<2||p>256||p&p-1)throw new Error("Invalid code/color length, must be power of 2 and 2 .. 256.");return p;}e[r++]=71,e[r++]=73,e[r++]=70,e[r++]=56,e[r++]=57,e[r++]=97;var c=0,d=0;if(a!==null){for(var f=u(a);f>>=1;)++c;if(f=1<<c,--c,i.background!==void 0){if(d=i.background,d>=f)throw new Error("Background index out of range.");if(d===0)throw new Error("Background index explicitly passed as 0.");}}if(e[r++]=t&255,e[r++]=t>>8&255,e[r++]=n&255,e[r++]=n>>8&255,e[r++]=(a!==null?128:0)|c,e[r++]=d,e[r++]=0,a!==null)for(var h=0,k=a.length;h<k;++h){var m=a[h];e[r++]=m>>16&255,e[r++]=m>>8&255,e[r++]=m&255;}if(s!==null){if(s<0||s>65535)throw new Error("Loop count invalid.");e[r++]=33,e[r++]=255,e[r++]=11,e[r++]=78,e[r++]=69,e[r++]=84,e[r++]=83,e[r++]=67,e[r++]=65,e[r++]=80,e[r++]=69,e[r++]=50,e[r++]=46,e[r++]=48,e[r++]=3,e[r++]=1,e[r++]=s&255,e[r++]=s>>8&255,e[r++]=0;}var w=!1;this.addFrame=function(g,p,R,I,E,F){if(w===!0&&(--r,w=!1),F=F===void 0?{}:F,g<0||p<0||g>65535||p>65535)throw new Error("x/y invalid.");if(R<=0||I<=0||R>65535||I>65535)throw new Error("Width/Height invalid.");if(E.length<R*I)throw new Error("Not enough pixels for the frame size.");var N=!0,C=F.palette;if(C==null&&(N=!1,C=a),C==null)throw new Error("Must supply either a local or global palette.");for(var O=u(C),M=0;O>>=1;)++M;O=1<<M;var V=F.delay===void 0?0:F.delay,W=F.disposal===void 0?0:F.disposal;if(W<0||W>3)throw new Error("Disposal out of range.");var U=!1,K=0;if(F.transparent!==void 0&&F.transparent!==null&&(U=!0,K=F.transparent,K<0||K>=O))throw new Error("Transparent color index.");if((W!==0||U||V!==0)&&(e[r++]=33,e[r++]=249,e[r++]=4,e[r++]=W<<2|(U===!0?1:0),e[r++]=V&255,e[r++]=V>>8&255,e[r++]=K,e[r++]=0),e[r++]=44,e[r++]=g&255,e[r++]=g>>8&255,e[r++]=p&255,e[r++]=p>>8&255,e[r++]=R&255,e[r++]=R>>8&255,e[r++]=I&255,e[r++]=I>>8&255,e[r++]=N===!0?128|M-1:0,N===!0)for(var J=0,H=C.length;J<H;++J){var X=C[J];e[r++]=X>>16&255,e[r++]=X>>8&255,e[r++]=X&255;}return r=Tt(e,r,M<2?2:M,E),r;},this.end=function(){return w===!1&&(e[r++]=59,w=!0),r;},this.getOutputBuffer=function(){return e;},this.setOutputBuffer=function(g){e=g;},this.getOutputBufferPosition=function(){return r;},this.setOutputBufferPosition=function(g){r=g;};}function Tt(e,t,n,o){e[t++]=n;var r=t++,i=1<<n,s=i-1,a=i+1,u=a+1,c=n+1,d=0,f=0;function h(F){for(;d>=F;)e[t++]=f&255,f>>=8,d-=8,t===r+256&&(e[r]=255,r=t++);}function k(F){f|=F<<d,d+=c,h(8);}var m=o[0]&s,w={};k(i);for(var g=1,p=o.length;g<p;++g){var R=o[g]&s,I=m<<8|R,E=w[I];if(E===void 0){for(f|=m<<d,d+=c;d>=8;)e[t++]=f&255,f>>=8,d-=8,t===r+256&&(e[r]=255,r=t++);u===4096?(k(i),u=a+1,c=n+1,w={}):(u>=1<<c&&++c,w[I]=u++),m=R;}else m=E;}return k(m),k(a),h(1),r+1===t?e[r]=0:(e[r]=t-r-1,e[t++]=0),t;}function Mt(e){var t=0;if(e[t++]!==71||e[t++]!==73||e[t++]!==70||e[t++]!==56||(e[t++]+1&253)!==56||e[t++]!==97)throw new Error("Invalid GIF 87a/89a header.");var n=e[t++]|e[t++]<<8,o=e[t++]|e[t++]<<8,r=e[t++],i=r>>7,s=r&7,a=1<<s+1,u=e[t++];e[t++];var c=null,d=null;i&&(c=t,d=a,t+=a*3);var f=!0,h=[],k=0,m=null,w=0,g=null;for(this.width=n,this.height=o;f&&t<e.length;)switch(e[t++]){case 33:switch(e[t++]){case 255:if(e[t]!==11||e[t+1]==78&&e[t+2]==69&&e[t+3]==84&&e[t+4]==83&&e[t+5]==67&&e[t+6]==65&&e[t+7]==80&&e[t+8]==69&&e[t+9]==50&&e[t+10]==46&&e[t+11]==48&&e[t+12]==3&&e[t+13]==1&&e[t+16]==0)t+=14,g=e[t++]|e[t++]<<8,t++;else for(t+=12;;){var p=e[t++];if(!(p>=0))throw Error("Invalid block size");if(p===0)break;t+=p;}break;case 249:if(e[t++]!==4||e[t+4]!==0)throw new Error("Invalid graphics extension block.");var R=e[t++];k=e[t++]|e[t++]<<8,m=e[t++],(R&1)===0&&(m=null),w=R>>2&7,t++;break;case 254:for(;;){var p=e[t++];if(!(p>=0))throw Error("Invalid block size");if(p===0)break;t+=p;}break;default:throw new Error("Unknown graphic control label: 0x"+e[t-1].toString(16));}break;case 44:var I=e[t++]|e[t++]<<8,E=e[t++]|e[t++]<<8,F=e[t++]|e[t++]<<8,N=e[t++]|e[t++]<<8,C=e[t++],O=C>>7,M=C>>6&1,V=C&7,W=1<<V+1,U=c,K=d,J=!1;if(O){var J=!0;U=t,K=W,t+=W*3;}var H=t;for(t++;;){var p=e[t++];if(!(p>=0))throw Error("Invalid block size");if(p===0)break;t+=p;}h.push({x:I,y:E,width:F,height:N,has_local_palette:J,palette_offset:U,palette_size:K,data_offset:H,data_length:t-H,transparent_index:m,interlaced:!!M,delay:k,disposal:w});break;case 59:f=!1;break;default:throw new Error("Unknown gif block: 0x"+e[t-1].toString(16));}this.numFrames=function(){return h.length;},this.loopCount=function(){return g;},this.frameInfo=function(X){if(X<0||X>=h.length)throw new Error("Frame index out of range.");return h[X];},this.decodeAndBlitFrameBGRA=function(X,j){var G=this.frameInfo(X),we=G.width*G.height,le=new Uint8Array(we);Ze(e,G.data_offset,le,we);var ue=G.palette_offset,he=G.transparent_index;he===null&&(he=256);var te=G.width,ce=n-te,ne=te,xe=(G.y*n+G.x)*4,_e=((G.y+G.height)*n+G.x)*4,q=xe,pe=ce*4;G.interlaced===!0&&(pe+=n*4*7);for(var ge=8,me=0,Ee=le.length;me<Ee;++me){var ie=le[me];if(ne===0&&(q+=pe,ne=te,q>=_e&&(pe=ce*4+n*4*(ge-1),q=xe+(te+ce)*(ge<<1),ge>>=1)),ie===he)q+=4;else{var Fe=e[ue+ie*3],l=e[ue+ie*3+1],x=e[ue+ie*3+2];j[q++]=x,j[q++]=l,j[q++]=Fe,j[q++]=255;}--ne;}},this.decodeAndBlitFrameRGBA=function(X,j){var G=this.frameInfo(X),we=G.width*G.height,le=new Uint8Array(we);Ze(e,G.data_offset,le,we);var ue=G.palette_offset,he=G.transparent_index;he===null&&(he=256);var te=G.width,ce=n-te,ne=te,xe=(G.y*n+G.x)*4,_e=((G.y+G.height)*n+G.x)*4,q=xe,pe=ce*4;G.interlaced===!0&&(pe+=n*4*7);for(var ge=8,me=0,Ee=le.length;me<Ee;++me){var ie=le[me];if(ne===0&&(q+=pe,ne=te,q>=_e&&(pe=ce*4+n*4*(ge-1),q=xe+(te+ce)*(ge<<1),ge>>=1)),ie===he)q+=4;else{var Fe=e[ue+ie*3],l=e[ue+ie*3+1],x=e[ue+ie*3+2];j[q++]=Fe,j[q++]=l,j[q++]=x,j[q++]=255;}--ne;}};}function Ze(e,t,n,o){for(var r=e[t++],i=1<<r,s=i+1,a=s+1,u=r+1,c=(1<<u)-1,d=0,f=0,h=0,k=e[t++],m=new Int32Array(4096),w=null;;){for(;d<16&&k!==0;)f|=e[t++]<<d,d+=8,k===1?k=e[t++]:--k;if(d<u)break;var g=f&c;if(f>>=u,d-=u,g===i){a=s+1,u=r+1,c=(1<<u)-1,w=null;continue;}else if(g===s)break;for(var p=g<a?g:w,R=0,I=p;I>i;)I=m[I]>>8,++R;var E=I,F=h+R+(p!==g?1:0);if(F>o){console.log("Warning, gif stream longer than expected.");return;}n[h++]=E,h+=R;var N=h;for(p!==g&&(n[h++]=E),I=p;R--;)I=m[I],n[--N]=I&255,I>>=8;w!==null&&a<4096&&(m[a++]=w<<8|E,a>=c+1&&u<12&&(++u,c=c<<1|1)),w=g;}return h!==o&&console.log("Warning, gif stream shorter than expected."),n;}try{Ne.GifWriter=Bt,Ne.GifReader=Mt;}catch{}});var dt=Le(We=>{var rt=Object.defineProperty,Gt=e=>rt(e,"__esModule",{value:!0}),Rt=(e,t)=>{for(var n in t)rt(e,n,{get:t[n],enumerable:!0});};Gt(We);Rt(We,{GIFEncoder:()=>ct,applyPalette:()=>jt,default:()=>Qt,nearestColor:()=>Vt,nearestColorIndex:()=>st,nearestColorIndexWithDistance:()=>lt,prequantize:()=>Ot,quantize:()=>Nt,snapColorsToPalette:()=>$t});var zt={signature:"GIF",version:"89a",trailer:59,extensionIntroducer:33,applicationExtensionLabel:255,graphicControlExtensionLabel:249,imageSeparator:44,signatureSize:3,versionSize:3,globalColorTableFlagMask:128,colorResolutionMask:112,sortFlagMask:8,globalColorTableSizeMask:7,applicationIdentifierSize:8,applicationAuthCodeSize:3,disposalMethodMask:28,userInputFlagMask:2,transparentColorFlagMask:1,localColorTableFlagMask:128,interlaceFlagMask:64,idSortFlagMask:32,localColorTableSizeMask:7};function nt(e=256){var t=0,n=new Uint8Array(e);return{get buffer(){return n.buffer;},reset(){t=0;},bytesView(){return n.subarray(0,t);},bytes(){return n.slice(0,t);},writeByte(r){o(t+1),n[t]=r,t++;},writeBytes(r,i=0,s=r.length){o(t+s);for(var a=0;a<s;a++)n[t++]=r[a+i];},writeBytesView(r,i=0,s=r.byteLength){o(t+s),n.set(r.subarray(i,i+s),t),t+=s;}};function o(r){var i=n.length;if(i>=r)return;var s=1024*1024;r=Math.max(r,i*(i<s?2:1.125)>>>0),i!=0&&(r=Math.max(r,256));var a=n;n=new Uint8Array(r),t>0&&n.set(a.subarray(0,t),0);}}var He=12,Qe=5003,Ut=[0,1,3,7,15,31,63,127,255,511,1023,2047,4095,8191,16383,32767,65535];function Pt(e,t,n,o,r=nt(512),i=new Uint8Array(256),s=new Int32Array(Qe),a=new Int32Array(Qe)){var u=s.length,c=Math.max(2,o);i.fill(0),a.fill(0),s.fill(-1);var d=0,f=0,h=c+1,k=h,m=!1,w=k,g=(1<<w)-1,p=1<<h-1,R=p+1,I=p+2,E=0,F=n[0],N=0;for(var M=u;M<65536;M*=2)++N;N=8-N,r.writeByte(c),O(p);var C=n.length;for(var _M=1;_M<C;_M++)e:{var V=n[_M],W=(V<<He)+F,U=V<<N^F;if(s[U]===W){F=a[U];break e;}var K=U===0?1:u-U;for(;s[U]>=0;)if(U-=K,U<0&&(U+=u),s[U]===W){F=a[U];break e;}O(F),F=V,I<1<<He?(a[U]=I++,s[U]=W):(s.fill(-1),I=p+2,m=!0,O(p));}return O(F),O(R),r.writeByte(0),r.bytesView();function O(M){for(d&=Ut[f],f>0?d|=M<<f:d=M,f+=w;f>=8;)i[E++]=d&255,E>=254&&(r.writeByte(E),r.writeBytesView(i,0,E),E=0),d>>=8,f-=8;if((I>g||m)&&(m?(w=k,g=(1<<w)-1,m=!1):(++w,g=w===He?1<<w:(1<<w)-1)),M==R){for(;f>0;)i[E++]=d&255,E>=254&&(r.writeByte(E),r.writeBytesView(i,0,E),E=0),d>>=8,f-=8;E>0&&(r.writeByte(E),r.writeBytesView(i,0,E),E=0);}}}var Lt=Pt;function it(e,t,n){return e<<8&63488|t<<2&992|n>>3;}function ot(e,t,n,o){return e>>4|t&240|(n&240)<<4|(o&240)<<8;}function at(e,t,n){return e>>4<<8|t&240|n>>4;}function Me(e,t,n){return e<t?t:e>n?n:e;}function Ce(e){return e*e;}function et(e,t,n){var o=0,r=1e100;var i=e[t],s=i.cnt,a=i.ac,u=i.rc,c=i.gc,d=i.bc;for(var f=i.fw;f!=0;f=e[f].fw){var k=e[f],m=k.cnt,w=s*m/(s+m);if(!(w>=r)){var h=0;n&&(h+=w*Ce(k.ac-a),h>=r)||(h+=w*Ce(k.rc-u),!(h>=r)&&(h+=w*Ce(k.gc-c),!(h>=r)&&(h+=w*Ce(k.bc-d),!(h>=r)&&(r=h,o=f))));}}i.err=r,i.nn=o;}function Oe(){return{ac:0,rc:0,gc:0,bc:0,cnt:0,nn:0,fw:0,bk:0,tm:0,mtm:0,err:0};}function Dt(e,t){var n=t==="rgb444"?4096:65536,o=new Array(n),r=e.length;if(t==="rgba4444")for(var i=0;i<r;++i){var s=e[i],a=s>>24&255,u=s>>16&255,c=s>>8&255,d=s&255,f=ot(d,c,u,a),h=f in o?o[f]:o[f]=Oe();h.rc+=d,h.gc+=c,h.bc+=u,h.ac+=a,h.cnt++;}else if(t==="rgb444")for(var _i=0;_i<r;++_i){var _s=e[_i],_a=_s>>16&255,_u=_s>>8&255,_c=_s&255,_d=at(_c,_u,_a),_f=_d in o?o[_d]:o[_d]=Oe();_f.rc+=_c,_f.gc+=_u,_f.bc+=_a,_f.cnt++;}else for(var _i2=0;_i2<r;++_i2){var _s2=e[_i2],_a2=_s2>>16&255,_u2=_s2>>8&255,_c2=_s2&255,_d2=it(_c2,_u2,_a2),_f2=_d2 in o?o[_d2]:o[_d2]=Oe();_f2.rc+=_c2,_f2.gc+=_u2,_f2.bc+=_a2,_f2.cnt++;}return o;}function Nt(e,t,n={}){var{format:o="rgb565",clearAlpha:r=!0,clearAlphaColor:i=0,clearAlphaThreshold:s=0,oneBitAlpha:a=!1}=n;if(!e||!e.buffer)throw new Error("quantize() expected RGBA Uint8Array data");if(!(e instanceof Uint8Array)&&!(e instanceof Uint8ClampedArray))throw new Error("quantize() expected RGBA Uint8Array data");var u=new Uint32Array(e.buffer),c=n.useSqrt!==!1,d=o==="rgba4444",f=Dt(u,o),h=f.length,k=h-1,m=new Uint32Array(h+1);for(var w=0,p=0;p<h;++p){var H=f[p];if(H!=null){var g=1/H.cnt;d&&(H.ac*=g),H.rc*=g,H.gc*=g,H.bc*=g,f[w++]=H;}}Ce(t)/w<.022&&(c=!1);for(var p=0;p<w-1;++p)f[p].fw=p+1,f[p+1].bk=p,c&&(f[p].cnt=Math.sqrt(f[p].cnt));c&&(f[p].cnt=Math.sqrt(f[p].cnt));var R,I,E;for(p=0;p<w;++p){et(f,p,!1);var F=f[p].err;for(I=++m[0];I>1&&(E=I>>1,!(f[R=m[E]].err<=F));I=E)m[I]=R;m[I]=p;}var N=w-t;for(p=0;p<N;){for(var C;;){var O=m[1];if(C=f[O],C.tm>=C.mtm&&f[C.nn].mtm<=C.tm)break;C.mtm==k?O=m[1]=m[m[0]--]:(et(f,O,!1),C.tm=p);var F=f[O].err;for(I=1;(E=I+I)<=m[0]&&(E<m[0]&&f[m[E]].err>f[m[E+1]].err&&E++,!(F<=f[R=m[E]].err));I=E)m[I]=R;m[I]=O;}var M=f[C.nn],V=C.cnt,W=M.cnt,g=1/(V+W);d&&(C.ac=g*(V*C.ac+W*M.ac)),C.rc=g*(V*C.rc+W*M.rc),C.gc=g*(V*C.gc+W*M.gc),C.bc=g*(V*C.bc+W*M.bc),C.cnt+=M.cnt,C.mtm=++p,f[M.bk].fw=M.fw,f[M.fw].bk=M.bk,M.mtm=k;}var U=[];var K=0;for(p=0;;++K){var J=Me(Math.round(f[p].rc),0,255),_H=Me(Math.round(f[p].gc),0,255),X=Me(Math.round(f[p].bc),0,255),j=255;d&&(j=Me(Math.round(f[p].ac),0,255),a&&(j=j<=(typeof a=="number"?a:127)?0:255),r&&j<=s&&(J=_H=X=i,j=0));var G=d?[J,_H,X,j]:[J,_H,X];if(Ht(U,G)||U.push(G),(p=f[p].fw)==0)break;}return U;}function Ht(e,t){for(var n=0;n<e.length;n++){var o=e[n],r=o[0]===t[0]&&o[1]===t[1]&&o[2]===t[2],i=o.length>=4&&t.length>=4?o[3]===t[3]:!0;if(r&&i)return!0;}return!1;}function Re(e,t){var n=0,o;for(o=0;o<e.length;o++){var r=e[o]-t[o];n+=r*r;}return n;}function Ge(e,t){return t>1?Math.round(e/t)*t:e;}function Ot(e,{roundRGB:t=5,roundAlpha:n=10,oneBitAlpha:o=null}={}){var r=new Uint32Array(e.buffer);for(var i=0;i<r.length;i++){var s=r[i],a=s>>24&255,u=s>>16&255,c=s>>8&255,d=s&255;a=Ge(a,n),o&&(a=a<=(typeof o=="number"?o:127)?0:255),d=Ge(d,t),c=Ge(c,t),u=Ge(u,t),r[i]=a<<24|u<<16|c<<8|d<<0;}}function jt(e,t,n="rgb565"){if(!e||!e.buffer)throw new Error("quantize() expected RGBA Uint8Array data");if(!(e instanceof Uint8Array)&&!(e instanceof Uint8ClampedArray))throw new Error("quantize() expected RGBA Uint8Array data");if(t.length>256)throw new Error("applyPalette() only works with 256 colors or less");var o=new Uint32Array(e.buffer),r=o.length,i=n==="rgb444"?4096:65536,s=new Uint8Array(r),a=new Array(i),u=n==="rgba4444";if(n==="rgba4444")for(var c=0;c<r;c++){var d=o[c],f=d>>24&255,h=d>>16&255,k=d>>8&255,m=d&255,w=ot(m,k,h,f),g=w in a?a[w]:a[w]=Wt(m,k,h,f,t);s[c]=g;}else{var _c3=n==="rgb444"?at:it;for(var _d3=0;_d3<r;_d3++){var _f3=o[_d3],_h=_f3>>16&255,_k=_f3>>8&255,_m=_f3&255,_w=_c3(_m,_k,_h),_g=_w in a?a[_w]:a[_w]=qt(_m,_k,_h,t);s[_d3]=_g;}}return s;}function Wt(e,t,n,o,r){var i=0,s=1e100;for(var a=0;a<r.length;a++){var u=r[a],c=u[3],d=Ae(c-o);if(d>s)continue;var f=u[0];if(d+=Ae(f-e),d>s)continue;var h=u[1];if(d+=Ae(h-t),d>s)continue;var k=u[2];d+=Ae(k-n),!(d>s)&&(s=d,i=a);}return i;}function qt(e,t,n,o){var r=0,i=1e100;for(var s=0;s<o.length;s++){var a=o[s],u=a[0],c=Ae(u-e);if(c>i)continue;var d=a[1];if(c+=Ae(d-t),c>i)continue;var f=a[2];c+=Ae(f-n),!(c>i)&&(i=c,r=s);}return r;}function $t(e,t,n=5){if(!e.length||!t.length)return;var o=e.map(s=>s.slice(0,3)),r=n*n,i=e[0].length;for(var s=0;s<t.length;s++){var a=t[s];a.length<i?a=[a[0],a[1],a[2],255]:a.length>i?a=a.slice(0,3):a=a.slice();var u=lt(o,a.slice(0,3),Re),c=u[0],d=u[1];d>0&&d<=r&&(e[c]=a);}}function Ae(e){return e*e;}function st(e,t,n=Re){var o=1/0,r=-1;for(var i=0;i<e.length;i++){var s=e[i],a=n(t,s);a<o&&(o=a,r=i);}return r;}function lt(e,t,n=Re){var o=1/0,r=-1;for(var i=0;i<e.length;i++){var s=e[i],a=n(t,s);a<o&&(o=a,r=i);}return[r,o];}function Vt(e,t,n=Re){return e[st(e,t,n)];}function ct(e={}){var{initialCapacity:t=4096,auto:n=!0}=e,o=nt(t),r=5003,i=new Uint8Array(256),s=new Int32Array(r),a=new Int32Array(r),u=!1;return{reset(){o.reset(),u=!1;},finish(){o.writeByte(zt.trailer);},bytes(){return o.bytes();},bytesView(){return o.bytesView();},get buffer(){return o.buffer;},get stream(){return o;},writeHeader:c,writeFrame(d,f,h,k={}){var{transparent:m=!1,transparentIndex:w=0,delay:g=0,palette:p=null,repeat:R=0,colorDepth:I=8,dispose:E=-1}=k,F=!1;if(n?u||(F=!0,c(),u=!0):F=!!k.first,f=Math.max(0,Math.floor(f)),h=Math.max(0,Math.floor(h)),F){if(!p)throw new Error("First frame must include a { palette } option");Yt(o,f,h,p,I),tt(o,p),R>=0&&Xt(o,R);}var N=Math.round(g/10);Kt(o,E,N,m,w);var C=!!p&&!F;Zt(o,f,h,C?p:null),C&&tt(o,p),Jt(o,d,f,h,I,i,s,a);}};function c(){ft(o,"GIF89a");}}function Kt(e,t,n,o,r){e.writeByte(33),e.writeByte(249),e.writeByte(4),r<0&&(r=0,o=!1);var i,s;o?(i=1,s=2):(i=0,s=0),t>=0&&(s=t&7),s<<=2,e.writeByte(0|s|0|i),ve(e,n),e.writeByte(r||0),e.writeByte(0);}function Yt(e,t,n,o,r=8){var a=je(o.length)-1,u=128|r-1<<4|0|a,c=0,d=0;ve(e,t),ve(e,n),e.writeBytes([u,c,d]);}function Xt(e,t){e.writeByte(33),e.writeByte(255),e.writeByte(11),ft(e,"NETSCAPE2.0"),e.writeByte(3),e.writeByte(1),ve(e,t),e.writeByte(0);}function tt(e,t){var n=1<<je(t.length);for(var o=0;o<n;o++){var r=[0,0,0];o<t.length&&(r=t[o]),e.writeByte(r[0]),e.writeByte(r[1]),e.writeByte(r[2]);}}function Zt(e,t,n,o){if(e.writeByte(44),ve(e,0),ve(e,0),ve(e,t),ve(e,n),o){var s=je(o.length)-1;e.writeByte(128|s);}else e.writeByte(0);}function Jt(e,t,n,o,r=8,i,s,a){Lt(n,o,t,r,e,i,s,a);}function ve(e,t){e.writeByte(t&255),e.writeByte(t>>8&255);}function ft(e,t){for(var n=0;n<t.length;n++)e.writeByte(t.charCodeAt(n));}function je(e){return Math.max(Math.ceil(Math.log2(e)),1);}var Qt=ct;});var pt=Le(ze=>{"use strict";ze.byteLength=tr;ze.toByteArray=nr;ze.fromByteArray=ar;var de=[],re=[],er=typeof Uint8Array<"u"?Uint8Array:Array,qe="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";for(Ie=0,ut=qe.length;Ie<ut;++Ie)de[Ie]=qe[Ie],re[qe.charCodeAt(Ie)]=Ie;var Ie,ut;re[45]=62;re[95]=63;function ht(e){var t=e.length;if(t%4>0)throw new Error("Invalid string. Length must be a multiple of 4");var n=e.indexOf("=");n===-1&&(n=t);var o=n===t?0:4-n%4;return[n,o];}function tr(e){var t=ht(e),n=t[0],o=t[1];return(n+o)*3/4-o;}function rr(e,t,n){return(t+n)*3/4-n;}function nr(e){var t,n=ht(e),o=n[0],r=n[1],i=new er(rr(e,o,r)),s=0,a=r>0?o-4:o,u;for(u=0;u<a;u+=4)t=re[e.charCodeAt(u)]<<18|re[e.charCodeAt(u+1)]<<12|re[e.charCodeAt(u+2)]<<6|re[e.charCodeAt(u+3)],i[s++]=t>>16&255,i[s++]=t>>8&255,i[s++]=t&255;return r===2&&(t=re[e.charCodeAt(u)]<<2|re[e.charCodeAt(u+1)]>>4,i[s++]=t&255),r===1&&(t=re[e.charCodeAt(u)]<<10|re[e.charCodeAt(u+1)]<<4|re[e.charCodeAt(u+2)]>>2,i[s++]=t>>8&255,i[s++]=t&255),i;}function ir(e){return de[e>>18&63]+de[e>>12&63]+de[e>>6&63]+de[e&63];}function or(e,t,n){for(var o,r=[],i=t;i<n;i+=3)o=(e[i]<<16&16711680)+(e[i+1]<<8&65280)+(e[i+2]&255),r.push(ir(o));return r.join("");}function ar(e){for(var t,n=e.length,o=n%3,r=[],i=16383,s=0,a=n-o;s<a;s+=i)r.push(or(e,s,s+i>a?a:s+i));return o===1?(t=e[n-1],r.push(de[t>>2]+de[t<<4&63]+"==")):o===2&&(t=(e[n-2]<<8)+e[n-1],r.push(de[t>>10]+de[t>>4&63]+de[t<<2&63]+"=")),r.join("");}});var gr={};Ct(gr,{default:()=>pr});module.exports=bt(gr);var wt=De(Je(),1),yt=De(dt(),1),be=De(pt(),1),{GIFEncoder:sr,quantize:lr,applyPalette:cr}=yt.default,vt=e=>/^R0lGOD[dl]h/.test(e),se=320,$e=512*1024,xt=()=>new Promise(e=>setTimeout(e,0));function fr(e){var t=()=>new Error("This GIF download is incomplete. Reopen the GIF or share the original file and try again.");if(e.length<13)throw t();if(!/^GIF8[79]a$/.test(String.fromCharCode(...e.subarray(0,6))))throw new Error("This file could not be read as an animated GIF.");var n=13,o=0,r=!1;function i(c){if(n+c>e.length)throw t();var d=n;return n+=c,d;}function s(c){c&128&&i(3*(1<<(c&7)+1));}function a(){for(;;){var c=e[i(1)];if(c===0)return;i(c);}}for(s(e[10]);n<e.length;){var c=e[i(1)];if(c===59){if(!o||r)throw t();return n===e.length?e:e.subarray(0,n);}if(c===33){var d=e[i(1)];a(),d===249&&(r=!0);}else if(c===44){var _d4=i(9);if(s(e[_d4+8]),i(1),a(),r=!1,++o>250)throw new Error("Use a GIF with 250 frames or fewer.");}else throw new Error("This GIF contains an invalid data block. Share the original GIF file and try again.");}if(!o||r)throw t();var u=new Uint8Array(e.length+1);return u.set(e),u[e.length]=59,u;}function dr(e){var t=fr(e),n;try{n=new wt.GifReader(t);}catch{throw new Error("This file could not be read as an animated GIF.");}var{width:o,height:r}=n,i=n.numFrames();if(!o||!r||o*r>4*1024*1024)throw new Error("This GIF is too large to resize on mobile. Use a GIF below 4 megapixels.");if(!i||i>250)throw new Error("Use a GIF with 250 frames or fewer.");var s=[],a=0;for(var u=0;u<i;u++){var c=n.frameInfo(u);if(!c.width||!c.height||c.x+c.width>o||c.y+c.height>r||c.data_offset+c.data_length>t.length||c.palette_offset==null||c.palette_offset+c.palette_size*3>t.length||t[c.data_offset]<2||t[c.data_offset]>8)throw new Error("This GIF contains an invalid frame.");var d=c.delay<2?100:c.delay*10;a+=d,s.push({...c,delayMs:d});}if(a>5e3)throw new Error("Discord stickers can be at most 5 seconds long. Use a shorter GIF; it has not been trimmed or uploaded.");return{bytes:t,reader:n,width:o,height:r,frames:s,duration:a};}function gt(e,t){if(t.transparent_index!=null||!(e[10]&128))return[0,0,0,0];var n=13+e[11]*3;return[e[n]??0,e[n+1]??0,e[n+2]??0,255];}function mt(e,t,n,o){for(var r=n.y;r<n.y+n.height;r++){var i=(r*t+n.x)*4;for(var s=0;s<n.width;s++,i+=4)e.set(o,i);}}function ur(e,t,n){var o=Math.min(se/t,se/n),r=Math.max(1,Math.round(t*o)),i=Math.max(1,Math.round(n*o)),s=Math.floor((se-r)/2),a=Math.floor((se-i)/2),u=new Uint8Array(se*se*4);for(var c=0;c<i;c++){var d=Math.min(n-1,Math.floor((c+.5)*n/i));for(var f=0;f<r;f++){var h=Math.min(t-1,Math.floor((f+.5)*t/r)),k=(d*t+h)*4,m=((c+a)*se+f+s)*4;u[m]=e[k],u[m+1]=e[k+1],u[m+2]=e[k+2],u[m+3]=e[k+3];}}return u;}async function hr(e,t,n,o){var{reader:r,width:i,height:s,frames:a}=t,u=new Uint8Array(i*s*4);mt(u,i,{x:0,y:0,width:i,height:s},gt(e,a[0]));var c=sr(),d,f;for(var h=0;h<a.length;h++){o(),d?.disposal===2?mt(u,i,d,gt(e,d)):d?.disposal===3&&f&&u.set(f);var k=a[h];f=k.disposal===3?u.slice():null,r.decodeAndBlitFrameRGBA(h,u);var m=ur(u,i,s),w=lr(m,n-1,{format:"rgba4444",oneBitAlpha:!0}),g=[[0,0,0,0],...w.filter(R=>R[3]!==0)];g.length===1&&g.push([0,0,0,255]);var p=cr(m,g,"rgba4444");if(c.writeFrame(p,se,se,{palette:g,delay:k.delayMs,repeat:r.loopCount()??-1,transparent:!0,transparentIndex:0,dispose:2}),c.bytesView().length>$e)return null;d=k,await xt();}return c.finish(),c.bytesView().length<=$e?c.bytes():null;}async function St(e,t=()=>{}){t(),e=e.replace(/\s/g,"");var n=(0,be.toByteArray)(e),o=dr(n),{bytes:r}=o;if(o.width===se&&o.height===se&&r.length<=$e)return{base64:r===n?e:(0,be.fromByteArray)(r),mimeType:"image/gif",extension:"gif"};if(o.width*o.height*o.frames.length>80*1024*1024)throw new Error("This GIF is too complex to resize on mobile. Use a smaller GIF.");for(var i of[256,128,64]){await xt(),t();var s=await hr(r,o,i,t);if(s)return{base64:(0,be.fromByteArray)(s),mimeType:"image/gif",extension:"gif"};}throw new Error("This animated GIF is still over 512 KiB after resizing. Use a shorter or simpler GIF.");}function kt(e,t=globalThis){var n=a=>{try{return a();}catch{}},o=(...a)=>n(()=>e.metro.findByProps(...a));function r(){var a=[()=>typeof valenced<"u"?valenced.discord?.native?.FileModule:void 0,()=>typeof revenge<"u"?revenge.discord?.native?.FileModule:void 0,()=>o("writeFile","removeFile"),...["NativeFileModule","RTNFileManager","DCDFileManager"].map(u=>()=>e.metro.common.ReactNative.NativeModules?.[u]??t.nativeModuleProxy?.[u])];for(var u of a){var c=n(u);if(typeof c?.writeFile=="function"&&typeof c?.removeFile=="function")return c;}}function i(){for(var a of[()=>e.metro.common.RestAPI,()=>e.metro.common.restAPI,()=>o("HTTP")?.HTTP,()=>o("get","post","del")]){var u=n(a);if(typeof u?.post=="function")return u;}}function s(a){if(a!=="sticker"&&a!=="emoji")throw new Error("Unknown expression type.");var u=a==="sticker"?"createGuildSticker":"uploadEmoji",c=o(u),d=typeof c?.[u]=="function",f=d?void 0:i();if(!d&&!f)throw new Error("Discord\u2019s signed-in upload API is unavailable. Restart Discord and try again.");return async(h,k=()=>{})=>{k();var m;if(d)m=await c[u](h);else{var g;if(a==="sticker"){if(typeof t.FormData!="function")throw new Error("Discord\u2019s multipart upload support is unavailable.");if(g=new t.FormData(),typeof g.getParts!="function")throw new Error("Discord\u2019s native multipart upload support is unavailable.");if(!/^(file|content):\/\//.test(h.uri))throw new Error("The sticker file is not ready to upload.");g.append("name",h.name),g.append("tags",h.tags),g.append("description",h.description??""),g.append("file",{uri:h.uri,name:h.mimeType==="image/gif"?"sticker.gif":"sticker.png",type:h.mimeType});}else g={name:h.name,image:h.image,roles:h.roles??[]};k(),m=await f.post({url:`/guilds/${h.guildId}/${a==="sticker"?"stickers":"emojis"}`,body:g,oldFormErrors:!0,failImmediatelyWhenRateLimited:!0});}if(m?.ok===!1||Number(m?.status??m?.statusCode)>=400)throw m;var w=m?.body??m;if((!d||a==="sticker")&&!w?.id)throw new Error(`Discord did not confirm the upload. Check the server\u2019s ${a==="sticker"?"stickers":"emoji"} before trying again.`);return k(),!d&&a==="sticker"&&n(()=>e.metro.common.FluxDispatcher?.dispatch?.({type:"GUILD_STICKERS_CREATE_SUCCESS",guildId:h.guildId,sticker:{...w,user:w.user??n(()=>e.metro.findByStoreName("UserStore")?.getCurrentUser?.())}})),w;};}return{resolve:s,files:r};}var pr=(()=>{"use strict";var e=typeof vendetta<"u"?vendetta:globalThis.vendetta;if(!e?.metro||!e?.patcher)throw new Error("SaveAsSticker needs Revenge's Vendetta plugin support.");var{React:t,ReactNative:n,constants:o}=e.metro.common,r=t.createElement,i=kt(e),s="SaveAsStickerPicker",a="save-as-sticker-action",u=512*1024,c=25*1024*1024,d=[5,15,30,60],f=[],h=!1,k=0,m=!1,w=(...l)=>{try{return e.metro.findByProps(...l);}catch{return;}},g=l=>{try{return e.metro.findByStoreName(l);}catch{return;}},p=(...l)=>{for(var x of l)try{var y=e.ui.assets.getAssetIDByName(x);if(y!=null)return y;}catch{}},R=(...l)=>e.logger?.error?.("[SaveAsSticker]",...l),I=l=>{try{e.ui.toasts.showToast(l,p("StickerIcon","ic_sticker_24px"));}catch{console.log("[SaveAsSticker]",l);}},E=w("openLazy","hideActionSheet"),F=w("ActionSheetRow")?.ActionSheetRow,N=e.ui.components?.Forms??{},C=w("ActionSheetTitleHeader")?.ActionSheetTitleHeader??w("BottomSheetTitleHeader")?.BottomSheetTitleHeader,O=w("ActionSheetCloseButton")?.ActionSheetCloseButton,M=w("GuildIconSizes"),V=M?.default,W=M?.GuildIconSizes,U=w("BottomSheetFlatList")?.BottomSheetFlatList??w("BottomSheetScrollView")?.BottomSheetFlatList??n.FlatList,K=w("ActionSheet")?.ActionSheet;if(!K)try{K=e.metro.find(l=>l?.render?.name==="ActionSheet");}catch{}function J(l){var x=String(l||"sticker").replace(/\.[a-z0-9]{1,6}$/i,"").replace(/[\u0000-\u001f]/g,"").trim().slice(0,30);return x.length>=2?x:"sticker";}function H(l,x=!1){if(!l)return null;var y=String(l.content_type??l.contentType??l.mimeType??""),v=l.mediaType??l.type,A=[l.url,l.sourceURI,l.mediaUrl,l.uri,l.proxy_url,l.proxyURL,l.image?.url,l.thumbnail?.url,l.video?.url].find(z=>typeof z=="string"&&/\.gif(?:[?#]|$)/i.test(z)),T=y==="image/gif"||!!A;if(!T&&(/^(video|audio)\//i.test(y)||/^(video|audio|file)$/i.test(String(v))))return null;var _=A??l.mediaUrl??l.sourceURI??l.url??l.uri??l.proxy_url??l.proxyURL;if(A&&(_=_.replace(/([?&])format=(?:webp|png|jpe?g|mp4)(?=&|$)/gi,"$1").replace(/([?&])animated=false(?=&|$)/gi,"$1").replace(/\?&/,"?").replace(/&&+/g,"&").replace(/[?&]$/,"")),typeof _!="string"||!/^https:\/\//i.test(_))return null;var L=l.filename??l.name??_.split(/[?#]/)[0].split("/").pop()??"sticker";return!x&&v!=="image"&&!y.startsWith("image/")&&!/\.(png|apng|jpe?g|webp|gif|avif|bmp)(?:[?#]|$)/i.test(L)&&!/\.(png|apng|jpe?g|webp|gif|avif|bmp)(?:[?#]|$)/i.test(_)?null:{url:_,filename:L,contentType:T?"image/gif":y,id:l.id??l.attachmentId};}function X(...l){var x=l.flatMap(v=>{if(!v||typeof v!="object")return[];var S=v.analyticsLocation;return S&&typeof S=="object"?[v,S]:[v];});for(var v of x)if(v.selectedMedia){var S=v.selectedMedia,A=H({...S.source,...S},S.mediaType==="image");return A?[A]:[];}for(var _v of x){var _S=_v.source;if(_v.syncer?.sources){var _A=_v.syncer.index?.value??_v.syncer.index??0;_S=_v.syncer.sources[_A];}if(Array.isArray(_S)&&(_S=_S[0]),_S){var _A2=H(_S);return _A2?[_A2]:[];}}var y=[];for(var _v2 of x){for(var _S2 of _v2.message?.attachments??[]){var _A3=H(_S2);_A3&&y.push(_A3);}for(var _S3 of _v2.message?.embeds??[])for(var _A4 of[_S3.image,...(_S3.images??[]),_S3.type==="image"?_S3:null,_S3.type==="gifv"&&/\.gif(?:[?#]|$)/i.test(_S3.video?.url??"")?{..._S3.video,contentType:"image/gif"}:null,_S3.type==="gifv"&&/\.gif(?:[?#]|$)/i.test(_S3.thumbnail?.url??"")?_S3.thumbnail:null]){var T=H(_A4,!0);T&&y.push(T);}}return y.filter((v,S)=>y.findIndex(A=>A.url===v.url)===S);}function j(l){if(!l?.id||l.unavailable)return!1;var x=g("UserStore")?.getCurrentUser?.()?.id;if(x&&(l.ownerId===x||l.owner_id===x))return!0;var y=o?.Permissions?.CREATE_GUILD_EXPRESSIONS??1n<<43n;try{return!!g("PermissionStore")?.can?.(y,l);}catch{return!1;}}function G(l){var x=Number(l.premiumTier??l.premium_tier??0),y=l.features,v=Array.isArray(y)?y.includes("MORE_STICKERS"):y?.has?.("MORE_STICKERS"),S=Number(l.premiumFeatures?.additionalStickerSlots??l.premium_features?.additional_sticker_slots??0),A=v&&x===3?120:d[x]??d[0],T=Number(l.maxStickers??l.max_stickers??0),_=Math.max(A+(Number.isFinite(S)?Math.max(0,S):0),T||0),z=(g("GuildStickersStore")??g("StickersStore")??g("StickerStore"))?.getStickersByGuildId?.(l.id)??l.stickers;return z&&!Array.isArray(z)&&(z=Object.values(z)),{max:_,used:Array.isArray(z)?z.length:null};}function we(){return Object.values(g("GuildStore")?.getGuilds?.()??{}).filter(j).sort((l,x)=>String(l.name).localeCompare(String(x.name)));}function le(l){var x=Number(l?.body?.code??l?.code);if(x===50013)return"You need Create Expressions permission in this server.";if(x===30039)return"This server has no free sticker slots. Choose another server.";for(var y of[l?.body?.message,l?.message,l?.text])if(!(typeof y!="string"||!y))try{return JSON.parse(y)?.message??y;}catch{return y;}return"Discord could not upload the sticker. Please try again.";}function ue(){return i.files();}function he(l){return new Promise((x,y)=>{var v=new FileReader();v.onerror=()=>y(v.error??new Error("Could not read the image.")),v.onload=()=>x(String(v.result).split(",")[1]),v.readAsDataURL(l);});}function te(l){return Math.floor(l.length*3/4)-(l.endsWith("==")?2:l.endsWith("=")?1:0);}function ce(l){var x="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/",y=[],v=0,S=0;for(var _ of l.slice(0,44)){var L=x.indexOf(_);if(L<0)break;S=S<<6|L,v+=6,v>=8&&(v-=8,y.push(S>>>v&255));}var A=[137,80,78,71,13,10,26,10];if(y.length<24||A.some((_,L)=>y[L]!==_)||String.fromCharCode(...y.slice(12,16))!=="IHDR")return null;var T=_=>y[_]*16777216+y[_+1]*65536+y[_+2]*256+y[_+3];return{width:T(16),height:T(20)};}function ne(l){if(typeof l!="string"||!l)throw new Error("Discord did not return a local image path.");return /^(file|content):\/\//.test(l)?l:"file://"+l;}async function xe(l,x){var y=ue();if(!y?.writeFile||!y?.removeFile)throw new Error("Discord's image file module is unavailable on this build.");var v=[],S=w("launchCropper","cleanSingle")??w("launchCropper"),A;async function T(){if(A&&S?.cleanSingle)try{await S.cleanSingle(A);}catch{}for(var _ of v)try{await y.removeFile("cache",_);}catch{}}try{var _=l.url,L=w("maybeRefreshAttachmentUrl");if(/^https:\/\/(?:cdn\.discordapp\.com|media\.discordapp\.net)\/attachments\//i.test(_))try{_=(await L?.maybeRefreshAttachmentUrl?.(_))||_;}catch{}var z=await(e.utils?.safeFetch??fetch)(_,{},2e4);if(!z.ok)throw new Error("Image download failed (HTTP "+z.status+"). Reopen the image and try again.");if(Number(z.headers?.get?.("content-length"))>c)throw new Error("Choose an image smaller than 25 MB.");var D=await z.blob();if(D.size>c)throw new Error("Choose an image smaller than 25 MB.");var P=await he(D);if(x(),!P)throw new Error("The image is empty.");var oe="save-as-sticker-"+Date.now()+"-"+Math.random().toString(36).slice(2);if(vt(P)){I("Preparing animated GIF\u2026");var Q=await St(P,x);x();var Se=oe+"-sticker.gif";v.push(Se);var ke=ne(await y.writeFile("cache",Se,Q.base64,"base64"));return x(),{uri:ke,mimeType:Q.mimeType,cleanup:T};}if(l.contentType==="image/gif"||D.type==="image/gif")throw new Error("This link returned a video or still preview. Share the original .gif file and try again.");var b=ce(P);if(!b||b.width!==320||b.height!==320||te(P)>u){if(!S?.launchCropper)throw new Error("Image cropping is unavailable. Choose a 320\xD7320 PNG under 512 KiB.");var _Q=D.type||l.contentType||"image/png",_Se=/jpeg/i.test(_Q)?"jpg":/webp/i.test(_Q)?"webp":/gif/i.test(_Q)?"gif":/avif/i.test(_Q)?"avif":"png",_ke=oe+"."+_Se;v.push(_ke);var Be=ne(await y.writeFile("cache",_ke,P,"base64"));x();var ye=await S.launchCropper({uri:Be,width:320,height:320,mimeType:"image/png",includeBase64:!0,freeStyleCropEnabled:!1});if(A=ye?.path??ye?.uri,x(),P=ye?.data??ye?.base64,!P&&A&&y.readFile&&(P=await y.readFile(A.replace(/^file:\/\//,""),"base64")),typeof P!="string"||!P)throw new Error("The cropper did not return an image.");P=P.replace(/^data:[^,]*,/,"").replace(/\s/g,"");}var Z=ce(P);if(!Z||Z.width!==320||Z.height!==320)throw new Error("The cropper did not produce a 320\xD7320 PNG. The sticker was not uploaded.");if(te(P)>u)throw new Error("The cropped sticker is over 512 KiB. Try a simpler image.");var ee=oe+"-sticker.png";v.push(ee);var ae=ne(await y.writeFile("cache",ee,P,"base64"));return x(),{uri:ae,mimeType:"image/png",cleanup:T};}catch(_){throw await T(),_;}}async function _e(l,x,y){if(m||!h)return;m=!0;var v=k,S=g("UserStore")?.getCurrentUser?.()?.id,A=()=>{if(!h||k!==v||!S||g("UserStore")?.getCurrentUser?.()?.id!==S)throw Object.assign(new Error("Cancelled"),{code:"E_PICKER_CANCELLED"});},T;try{if(y.length<2||y.length>30)throw new Error("Use a sticker name between 2 and 30 characters.");if(!S)throw new Error("Your Discord account is still loading. Reopen the picker and try again.");A();var _=i.resolve("sticker");E.hideActionSheet(s),n.Keyboard?.dismiss?.(),await new Promise(oe=>setTimeout(oe,300)),A(),I("Preparing your sticker\u2026"),T=await xe(x,A),A();var L=g("GuildStore"),z=L?.getGuild?.(l.id)??L?.getGuilds?.()?.[l.id];if(!j(z))throw new Error("You no longer have Create Expressions permission in this server.");var D=G(z);if(D.used!=null&&D.used>=D.max)throw new Error("This server has no free sticker slots. Choose another server.");I("Adding sticker to "+l.name+"\u2026");var P=await _({guildId:l.id,name:y,tags:"slight_smile",description:"",uri:T.uri,mimeType:T.mimeType,platform:"mobile",originalMd5:null},A);if(!P?.id&&!P?.body?.id)throw new Error("Discord did not confirm the upload. Check the server's stickers before trying again.");h&&k===v&&I("Sticker added to "+l.name);}catch(_){if(_?.code==="E_PICKER_CANCELLED"||/cancel/i.test(String(_?.message??"")))return;if(R("Upload failed",_),h&&k===v){var _L=le(_);n.Alert?.alert?n.Alert.alert("Sticker could not be added",_L):I(_L);}}finally{await T?.cleanup?.(),m=!1;}}function q({images:l}){var[x,y]=t.useState(l.length===1?l[0]:null),[v,S]=t.useState(null),[A,T]=t.useState(J(l[0]?.filename)),[,_]=t.useState(0),L=(g("ThemeStore")?.theme??n.Appearance?.getColorScheme?.())!=="light",z={text:L?"#f2f3f5":"#1e1f22",muted:L?"#b5bac1":"#4e5058",input:L?"#1e1f22":"#e3e5e8"};t.useEffect(()=>{var B=[g("GuildStore"),g("PermissionStore"),g("GuildStickersStore"),g("StickersStore")].filter(Boolean),Y=()=>_($=>$+1);return B.forEach($=>$.addChangeListener?.(Y)),()=>B.forEach($=>$.removeChangeListener?.(Y));},[]);var D=(B,Y={})=>r(n.Text,{style:{color:z.text,fontSize:16,...Y}},B),P=(B,Y,$=!1)=>r(n.Pressable,{accessibilityRole:"button",accessibilityLabel:B,disabled:$,onPress:Y,style:{padding:14,borderRadius:8,backgroundColor:$?"#555967":"#5865f2",marginTop:12}},D(B,{color:"#ffffff",fontWeight:"600",textAlign:"center"})),oe={color:z.text,backgroundColor:z.input,borderRadius:8,padding:12,fontSize:16,marginTop:10},b=()=>E.hideActionSheet(s),Z=x?r(n.Image,{source:{uri:x.url},resizeMode:"contain",accessibilityLabel:"Sticker preview",style:{width:26,height:26,marginRight:12}}):null,ee=v?"Sticker name":x?"Saving "+J(x.filename):"Choose image",ae=O?r(O,{onPress:b,accessibilityLabel:"Close"}):r(n.Pressable,{onPress:b,accessibilityRole:"button",accessibilityLabel:"Close",hitSlop:10,style:{width:40,height:40,alignItems:"center",justifyContent:"center"}},D("\xD7",{fontSize:32,lineHeight:36})),Q=C?r(C,{title:ee,leading:Z,trailing:ae}):r(n.View,{style:{flexDirection:"row",alignItems:"center",paddingHorizontal:28,minHeight:72}},Z,r(n.Text,{numberOfLines:1,style:{flex:1,color:z.text,fontSize:20,fontWeight:"600",textAlign:"center",paddingHorizontal:8}},ee),ae),Se=Math.min(640,(n.Dimensions?.get?.("window")?.height??800)*.62);function ke(B){if(V)return r(V,{guild:B,size:W?.MEDIUM,animate:!1});if(B.icon)return r(n.Image,{source:{uri:"https://cdn.discordapp.com/icons/"+B.id+"/"+B.icon+".png?size=96"},style:{width:44,height:44,borderRadius:14},resizeMode:"cover"});var Y=String(B.name).trim().split(/\s+/).map($=>$[0]).join("").slice(0,3);return r(n.View,{style:{width:44,height:44,borderRadius:14,backgroundColor:"#5865f2",alignItems:"center",justifyContent:"center"}},D(Y,{color:"#ffffff",fontWeight:"600"}));}function Be(B){var Y=G(B),$=Y.used!=null&&Y.used>=Y.max,fe=$?"No slots available":Y.used==null?"Check slots on upload":void 0,Ve=()=>{var Ue=g("GuildStore")?.getGuild?.(B.id)??B,Pe=G(Ue);!j(Ue)||Pe.used!=null&&Pe.used>=Pe.max||S(Ue);},Ke=p("ic_add_24px","PlusSmallIcon","PlusIcon"),Ye=N.FormIcon&&Ke!=null?r(N.FormIcon,{source:Ke,style:{opacity:1}}):D("+",{color:z.muted,fontSize:30,fontWeight:"300"});return N.FormRow?r(N.FormRow,{key:B.id,leading:ke(B),label:B.name,subLabel:fe,trailing:Ye,disabled:$,onPress:Ve,accessibilityLabel:B.name,accessibilityRole:"button",accessibilityState:{disabled:$}}):r(n.Pressable,{key:B.id,accessibilityRole:"button",accessibilityLabel:B.name,accessibilityState:{disabled:$},disabled:$,onPress:Ve,style:{minHeight:80,paddingHorizontal:32,flexDirection:"row",alignItems:"center",opacity:$?.4:1}},ke(B),r(n.View,{style:{flex:1,marginLeft:18,marginRight:16}},D(B.name,{fontWeight:"600",fontSize:18}),fe?D(fe,{color:z.muted,fontSize:13,marginTop:3}):null),Ye);}if(x&&!v){var B=we(),Y=r(n.View,{style:{padding:24}},D("No servers available. You need Create Expressions permission to add a sticker.",{color:z.muted,fontSize:14})),$=U?r(U,{style:{flex:1},contentContainerStyle:{paddingBottom:32},data:B,renderItem:({item:fe})=>Be(fe),keyExtractor:fe=>fe.id,extraData:B.map(fe=>fe.id+":"+G(fe).used).join(","),ListEmptyComponent:Y}):r(n.ScrollView,{style:{flex:1},contentContainerStyle:{paddingBottom:32}},B.length?B.map(Be):Y);return r(K,{scrollable:!0},r(n.View,{style:{height:Se}},Q,$));}var ye;if(!x)ye=l.map((B,Y)=>r(n.Pressable,{key:B.url,accessibilityRole:"button",accessibilityLabel:"Use image "+(Y+1),onPress:()=>{y(B),T(J(B.filename));},style:{flexDirection:"row",alignItems:"center",gap:12,paddingVertical:10}},r(n.Image,{source:{uri:B.url},style:{width:64,height:64},resizeMode:"contain"}),D(B.filename,{flex:1})));else{var _B=A.trim().length>=2&&A.trim().length<=30&&!/[\u0000-\u001f]/.test(A);ye=r(n.View,null,r(n.Image,{source:{uri:x.url},style:{height:128,width:"100%",marginBottom:12},resizeMode:"contain"}),D("Server: "+v.name,{fontWeight:"600"}),D("Sticker name",{marginTop:12}),r(n.TextInput,{value:A,onChangeText:T,maxLength:30,placeholder:"Sticker name",placeholderTextColor:z.muted,style:oe,selectTextOnFocus:!0}),D(x.contentType==="image/gif"?"GIFs keep their animation and resize automatically. Maximum 5 seconds and 512 KiB.":"Crop to 320\xD7320 if needed. GIFs keep their animation.",{color:z.muted,fontSize:13,marginTop:12}),P("Add sticker",()=>{_e(v,x,A.trim());},!_B),P("Choose another server",()=>S(null)));}return r(K,{scrollable:!0},Q,r(n.ScrollView,{keyboardShouldPersistTaps:"handled",style:{maxHeight:Se},contentContainerStyle:{padding:20,paddingBottom:40}},ye));}function pe(l,x){if(!h)return;if(m){I("A sticker upload is already in progress.");return;}if(!K){I("The server picker is unavailable on this Discord build.");return;}E.hideActionSheet(x);var y=e.ui.components?.ErrorBoundary,v=()=>{var S=r(q,{images:l});return y?r(y,null,S):S;};E.openLazy(Promise.resolve({default:v}),s,{});}function ge(l,x){var y=p("StickerIcon","ic_sticker_24px");return r(F,{key:a,label:"Save as Sticker",icon:F.Icon&&y!=null?r(F.Icon,{source:y}):void 0,iconSource:F.Icon?void 0:y,onPress:()=>pe(l,x)});}function me(l,x,y){var v=null,S=-1,A=!1,T=b=>String(b?.props?.label??b?.props?.message??""),_=b=>b?.props&&typeof b.props.onPress=="function"&&(b.type===F||b.props.label!=null||b.props.message!=null);function L(b,Z=0){if(!(!b||Z>40))if(Array.isArray(b)){var ee=b.filter(_);if(ee.length){var ae=ee.some(Q=>/save image/i.test(T(Q)))?1e3:ee.some(Q=>/copy image link/i.test(T(Q)))?900:10;ae+ee.length>S&&(v=b,S=ae+ee.length);}b.forEach(ae=>L(ae,Z+1));}else b.props&&((b.key===a||T(b)==="Save as Sticker")&&(A=!0),L(b.props.children,Z+1));}if(L(l),A||!v)return l;var z=ge(x,y),D=v.findIndex(b=>/save image/i.test(T(b))),P=D>=0?D+1:v.length;function oe(b){if(b===v)return[...v.slice(0,P),z,...v.slice(P)];if(Array.isArray(b)){var Z=b.map(oe);return Z.some((ee,ae)=>ee!==b[ae])?Z:b;}if(b?.props?.children!=null){var _Z=oe(b.props.children);return _Z!==b.props.children?t.cloneElement(b,{children:_Z}):b;}return b;}return oe(l);}function Ee(l,x,y,v){var S=(A,T)=>{if(!h||k!==v)return T;try{var _=X(A,x);return _.length?me(T,_,y):T;}catch(_){return R("Could not add image menu action",_),T;}};return typeof l=="function"&&!l.prototype?.isReactComponent?function(...T){return S(T[0],l.apply(this,T));}:l?.$$typeof===Symbol.for("react.memo")?t.memo(Ee(l.type,x,y,v),l.compare):l?.$$typeof===Symbol.for("react.forward_ref")?t.forwardRef((A,T)=>S(A,l.render(A,T))):l;}function ie(){if(!E?.openLazy||!F||!K||!g("GuildStore"))throw new Error("SaveAsSticker: required menu modules were not found on this Discord build.");h||(h=!0,k++,f.push(e.patcher.before("openLazy",E,l=>{var[x,y,v]=l;if(y!=="MessageLongPressActionSheet"&&y!=="MediaShareActionSheet"||!x?.then)return;var S=k;l[0]=Promise.resolve(x).then(A=>!h||S!==k||!A?.default?A:{...A,default:Ee(A.default,v,y,S)});})),I("SaveAsSticker 1.3.2 enabled"));}function Fe(){h=!1,k++;for(var l of f.splice(0).reverse())try{l();}catch{}try{E?.hideActionSheet?.(s);}catch{}}return{onLoad:ie,onUnload:Fe};})();
return module.exports.default;
})()
}, "SaveAsSticker");
})()
