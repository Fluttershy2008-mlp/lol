(() => {
    'use strict';
    const SIGMA_ICON = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAYAAADimHc4AAAEpUlEQVR4nO2dzW4cRRDH/7XrjZGTB8ohBHEKkjFC8ABceAdOyDlx8EvAlQOKYhuJG8Rw4CF4Aq4kIvZ+/Dh0dXb9gWd3ZpzuWddPGlmWPa2equ7pf1X3dEtBEARBEARBEATBe8X6KggYSxr1VV7FzM1sUboSQU906gGASZKZATyT9FjSQtvZE/Jz/WZmr4BRHz1hp+2NbvyRpBHwk6SDrpUZCEeSXkkaKzmlE60dIMnMbA68UDL+vI8KVcxU0kTS6z4LbeUAYOzG/0TJ+FMva9xn5Spkop5fr20Ly/c91bLV96ao7hN9eDMM34G2Dsit/kzJAduoet4LrQzn7/+xmf2ipSKYtSiKAV690qnlAiNJ3yoZf0ebV9AGdE10B729tQxd6QW/A59L+lHSAy9znXFhIelvSY80DPmaG9m/fRbaeQAFds3sHDiU9FzSuaTdhtsWSg/0laQXkvb895oHdJTqd25m56Ur8w7AgAnwEDglccHtLIA58BZ4XPoZStJLiwPM80FjSS8l7StFxrcFZrlL/yHpYy3Hj6pfR2bW+0DcC8DIrzFw4i181tAT8t9P/b5RTvAFLXBVJGAPeOPGnTc4Ib+uToEdv8IJbVlpyfvewucbOOHYy5iUfo5BQxoLtOIESAPvOk448HvDCV3IBnQnvHYD3+aEBTD1a3+1jKAlwK7/PHQjv23oBVmezlacsO0p7ruDdjFCHjNmwBMvp8vE0f0GVzSkwTk7oUmeTv3nGctBPTKubSFihPIQMUJ5iBihPESMUB4iRigPESOUhYgRykPECOUhYoTyEDFCeYgYoTz0EyOEMuoC3WKET70nhRO6wOYxQn5V/YOPBcR40B5ujhGaxoOZO+qZlzGIXlClfva1NzMzeyPpC6Vlj+j2NUMLpRV5H/nvVT7bVaqtpC/0emBmF5J+UFro1bQoqs5FU0OE64po0TAYZ+k6qFdQleD5HeDJimHXMf6ffl+1Pfsq1VXUjbfwFvydlp+DNqmakaS/SAoqFFAbXP3kvNC6ybnc+k+AXSIv1A43fs7pbJKehpQ/2vNyquvVg4BlBHy8gfHfTdDknlP6OQbJivEP1jR+HpBjdqwrXM795JxOU+7ngpQnivnhLnBd6zfJTVjmhQ793qbv0YKb4Gatv8kkzENSvigUz6ZweRryzI06vWbuy1yahvRywvibQnetHxPxbSG0flkIrV8OQuuXg9D65SC0fjkIrV8OQuuXg9D65SC0flkIrV8OQuuXg9D6rejl8x7S5n35A7qXurzb4P8xV9qJ8MjMfgYeSTofgBPqOj+Adlo//9/3petfmj7OD8jXr5I+1HIvuFtvVdrw+0jShf9/XvtT6/LCOzk/oLUDWJ4fIK2/Ud82cGRm3wATM5t2LayP8wOOlYyf99ffhJnqbfFXqf78gDaD59C+8a36/ICgBRHuF6aP8wNyGUN5l1dFl/MDRn5+wInSuzFvyF16f/97c34Anrf5UskJYy23rt/Gq7rzAwAWkhZm9hnp06Cnkr6W9EFfFayIOs8PuIrndLZxcK/z/IAMaRZraLq+OHfRA7Z6Drfa8wOCIAiCIAiCIBgM/wHBRUp2UjlY0wAAAABJRU5ErkJggg==';
    const DEFAULTS = { angle: 'DEG', steps: true, inline: true, currency: true, autoSend: true, aiSend: false };
    const optional = fn => { try { return fn(); } catch { return undefined; } };
    const listeners = new Set();
    let current, writes = Promise.resolve();
    const changed = () => { for (const fn of [...listeners]) optional(fn); };

    // A bounded arithmetic parser: user text is never executable JavaScript.
    function calculate(source, angle = 'DEG', ans = 0) {
        if (typeof source !== 'string' || !source.trim()) throw new Error('Enter an expression first.');
        if (source.length > 2000) throw new Error('Expression is too long (maximum 2,000 characters).');
        const text = source.toLowerCase().replace(/(\d|\)|!|%)\s*x\s*(?=[\d.(])/g, '$1*').replace(/[×·]/g, '*').replace(/÷/g, '/').replace(/[−–]/g, '-')
            .replace(/π/g, 'pi').replace(/τ/g, 'tau').replace(/∛/g, 'cbrt').replace(/√/g, 'sqrt').replace(/²/g, '^2').replace(/³/g, '^3').replace(/\*\*/g, '^');
        const tokens = []; let at = 0, depth = 0, i = 0;
        while (at < text.length) {
            if (/\s/.test(text[at])) { at++; continue; }
            const m = text.slice(at).match(/^(?:(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|[a-z][a-z0-9]*|[+\-*/^!%(),])/);
            if (!m) throw new Error('Unsupported symbol. Use Calculate for expressions, or AI solve for written questions.');
            tokens.push(m[0]); at += m[0].length;
            if (tokens.length > 512) throw new Error('Expression has too many terms.');
        }
        const peek = () => tokens[i];
        const take = t => peek() === t ? (i++, true) : false;
        const finite = n => { if (!Number.isFinite(n)) throw new Error('Result is undefined, outside the real-number domain, or too large.'); return Object.is(n, -0) ? 0 : n; };
        const integer = n => { if (!Number.isInteger(n) || n < 0 || n > 170) throw new Error('Use whole numbers from 0 to 170 for factorials and combinations.'); return n; };
        const factorial = n => { integer(n); let r = 1; for (let k = 2; k <= n; k++) r *= k; return finite(r); };
        const choose = (n, r, perm) => { integer(n); integer(r); if (r > n) throw new Error('r must be less than or equal to n.'); let v = 1; if (!perm) r = Math.min(r, n - r); for (let k = 0; k < r; k++) v = v * (n - k) / (perm ? 1 : k + 1); return finite(v); };
        const toRad = n => angle === 'DEG' ? n * Math.PI / 180 : n;
        const fromRad = n => angle === 'DEG' ? n * 180 / Math.PI : n;
        const unary = { sin: n => Math.sin(toRad(n)), cos: n => Math.cos(toRad(n)),
            tan: n => { if (Math.abs(Math.cos(toRad(n))) < 1e-14) throw new Error('tan is undefined at this angle.'); return Math.tan(toRad(n)); },
            asin: n => fromRad(Math.asin(n)), acos: n => fromRad(Math.acos(n)), atan: n => fromRad(Math.atan(n)),
            sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, asinh: Math.asinh, acosh: Math.acosh, atanh: Math.atanh, sqrt: Math.sqrt, cbrt: Math.cbrt,
            ln: Math.log, log: Math.log10, log10: Math.log10, log2: Math.log2, exp: Math.exp,
            abs: Math.abs, floor: Math.floor, ceil: Math.ceil, round: Math.round, fact: factorial };
        const binary = { pow: Math.pow, mod: (a, b) => a % b, root: (n, x) => { if (!n) throw new Error('Root degree cannot be zero.'); return x < 0 && Number.isInteger(n) && Math.abs(n % 2) === 1 ? -Math.pow(-x, 1 / n) : Math.pow(x, 1 / n); },
            ncr: (n, r) => choose(n, r, false), npr: (n, r) => choose(n, r, true) };
        function primary() {
            if (++depth > 64) throw new Error('Too many nested brackets.');
            try {
                if (take('(')) { const v = sum(); if (!take(')')) throw new Error('Missing closing bracket.'); return v; }
                const t = tokens[i++];
                if (t && /^(?:\d|\.)/.test(t)) return finite(Number(t));
                if (t === 'pi') return Math.PI;
                if (t === 'tau') return 2 * Math.PI;
                if (t === 'e') return Math.E;
                if (t === 'ans') return finite(ans);
                if (Object.hasOwn(unary, t ?? '') || Object.hasOwn(binary, t ?? '')) {
                    if (!take('(')) throw new Error('Use brackets after ' + t + '.');
                    const a = sum(); let v;
                    if (Object.hasOwn(binary, t)) {
                        if (!take(',')) throw new Error(t + ' needs two arguments separated by a comma.');
                        v = binary[t](a, sum());
                    } else v = unary[t](a);
                    if (!take(')')) throw new Error('Missing closing bracket or too many function arguments.');
                    return finite(v);
                }
                throw new Error('Unknown term ' + (t ?? '(end)') + '. Use AI solve for equations and word problems.');
            } finally { depth--; }
        }
        function postfix() { let v = primary(); while (true) { if (take('!')) v = factorial(v); else if (take('%')) v /= 100; else break; } return finite(v); }
        function power() { const v = postfix(); return take('^') ? finite(Math.pow(v, sign())) : v; }
        function sign() { if (++depth > 64) throw new Error('Expression is too deeply nested.'); try { if (take('+')) return sign(); if (take('-')) return -sign(); return power(); } finally { depth--; } }
        function product() {
            let v = sign();
            while (true) {
                if (take('*')) v *= sign();
                else if (take('/')) v /= sign();
                else if (peek() && /^(?:[a-z]|\(|\d|\.)/.test(peek())) v *= sign();
                else break;
                finite(v);
            }
            return finite(v);
        }
        function sum() { let v = product(); while (true) { if (take('+')) v += product(); else if (take('-')) v -= product(); else break; finite(v); } return finite(v); }
        const value = sum();
        if (i !== tokens.length) throw new Error('Unexpected term ' + peek() + '.');
        return value;
    }
    const format = n => String(Number(n.toPrecision(14)));
    function solveOutgoing(content, angle = 'DEG', ans = 0) {
        if (typeof content !== 'string' || !content.trim() || content.length > 6000) return content;
        const text = content.trim(), explicit = /^=(?!=)/.test(text), query = explicit ? text.replace(/^=\s*/, '') : text;
        // A bare number/ID, date, phone number, equation, code or URL is not an
        // instruction to calculate. Scientific expressions are tried whole.
        const dateLike = /^\+?\d{1,4}(?:[-/]\d{1,4}){2,}$/;
        const mathLike = /[\d)!%][ \t]*[+\-*/÷×^x][ \t]*(?:[+\-]?[\d.(]|[a-zτπ√∛])/i.test(query)
            || /(?:[a-z]+\(|[√∛]|\d[!%²³]|\d[ \t]*(?:π|τ|\bpi\b|\btau\b)|(?:\b(?:pi|tau|ans|e)|[πτ])[ \t]*[+\-*/÷×^]|\s+(?:to|in)\s+)/i.test(query);
        const mathWords = new Set('sin cos tan asin acos atan sinh cosh tanh asinh acosh atanh sqrt cbrt ln log log10 log2 exp abs floor ceil round fact pow mod root ncr npr pi tau e ans'.split(' '));
        const wholeExpression = mathLike && /^[\da-z\s.+\-*/÷×^()!%,πτ√∛²³−–]+$/i.test(query)
            && (query.match(/[a-z]+\d*/gi) ?? []).every(word => mathWords.has(word.toLowerCase()));
        if ((explicit || mathLike) && !/[`<>@#:$£€]|https?:\/\//i.test(query)
            && (explicit || !dateLike.test(query.replace(/[ \t]/g, ''))) && !/\d[ \t]+\d/.test(query)) {
            try {
                const result = inlineAnswer('= ' + query, angle, ans);
                if (result && result.kind !== 'currency') return result.text;
            } catch { /* Invalid math is sent unchanged, never blocked. */ }
        }
        if (explicit || wholeExpression) return content;
        // Basic arithmetic can also appear inside prose, like the original
        // Math plugin. Preserve literal spans and require clear boundaries.
        const literals = /```[\s\S]*?(?:```|$)|`[^`\n]*(?:`|$)|https?:\/\/\S+|<[^>\n]+>|!?\[[^\]\n]*\]\([^\)\n]*\)/g;
        const numbers = /[+\-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[ \t]*[+\-*/÷×][ \t]*[+\-]?(?:\d+(?:\.\d+)?|\.\d+))+/g;
        const replace = plain => plain.replace(numbers, (match, offset) => {
            const left = plain[offset - 1] ?? '', right = plain[offset + match.length] ?? '';
            if (/[\p{L}\p{N}_.,:/\\#@$€£%=+\-*/÷×^~]/u.test(left)
                || /[\p{L}\p{N}_:/\\#@$€£%=+\-*/÷×^~!°]/u.test(right)
                || /^[ \t]*=/.test(plain.slice(offset + match.length)) || dateLike.test(match.replace(/[ \t]/g, ''))) return match;
            try { return format(calculate(match, angle, ans)); } catch { return match; }
        });
        let result = '', cursor = 0;
        for (const literal of content.matchAll(literals)) {
            result += replace(content.slice(cursor, literal.index)) + literal[0]; cursor = literal.index + literal[0].length;
        }
        return result + replace(content.slice(cursor));
    }
    // Linear SI conversions plus affine temperature scales. Currency rates are
    // fetched separately; no exchange-rate numbers are bundled in the plugin.
    const UNITS = Object.create(null);
    function unit(names, dimension, factor, offset = 0) {
        for (const name of names.split('|')) UNITS[name] = { dimension, factor, offset };
    }
    unit('m|metre|metres|meter|meters', 'length', 1);
    unit('mm|millimetre|millimetres|millimeter|millimeters', 'length', 0.001);
    unit('cm|centimetre|centimetres|centimeter|centimeters', 'length', 0.01);
    unit('km|kilometre|kilometres|kilometer|kilometers', 'length', 1000);
    unit('in|inch|inches', 'length', 0.0254); unit('ft|foot|feet', 'length', 0.3048);
    unit('yd|yard|yards', 'length', 0.9144); unit('mi|mile|miles', 'length', 1609.344);
    unit('kg|kilogram|kilograms', 'mass', 1); unit('g|gram|grams', 'mass', 0.001);
    unit('mg|milligram|milligrams', 'mass', 0.000001); unit('lb|lbs|pound|pounds', 'mass', 0.45359237);
    unit('oz|ounce|ounces', 'mass', 0.028349523125); unit('t|tonne|tonnes', 'mass', 1000);
    unit('s|sec|second|seconds', 'time', 1); unit('min|minute|minutes', 'time', 60);
    unit('h|hr|hour|hours', 'time', 3600); unit('d|day|days', 'time', 86400);
    unit('l|litre|litres|liter|liters', 'volume', 1); unit('ml|millilitre|millilitres|milliliter|milliliters', 'volume', 0.001);
    unit('m3|m³', 'volume', 1000); unit('cm3|cm³|cc', 'volume', 0.001);
    unit('m2|m²', 'area', 1); unit('cm2|cm²', 'area', 0.0001); unit('km2|km²', 'area', 1000000);
    unit('ft2|ft²|sqft', 'area', 0.09290304); unit('ha|hectare|hectares', 'area', 10000);
    unit('m/s|mps', 'speed', 1); unit('km/h|kmph|kph', 'speed', 1 / 3.6);
    unit('mph', 'speed', 0.44704); unit('ft/s|fps', 'speed', 0.3048);
    unit('pa', 'pressure', 1); unit('kpa', 'pressure', 1000); unit('mpa', 'pressure', 1000000);
    unit('bar', 'pressure', 100000); unit('psi', 'pressure', 6894.757293168);
    unit('rad|radian|radians', 'angle', 1); unit('deg|degree|degrees|°', 'angle', Math.PI / 180);
    unit('c|°c|celsius', 'temperature', 1, 273.15); unit('f|°f|fahrenheit', 'temperature', 5 / 9, 273.15 - 32 * 5 / 9);
    unit('k|kelvin', 'temperature', 1);
    function inlineAnswer(draft, angle = 'DEG', ans = 0) {
        if (typeof draft !== 'string' || !/^\s*=(?!=)/.test(draft)) return null;
        const query = draft.replace(/^\s*=\s*/, '').trim();
        if (!query) return null;
        if (query.length > 2000) throw new Error('Expression is too long.');
        const conversion = query.match(/^(.+?)\s+([a-z°][a-z0-9°²³/]*|°)\s+(?:in|to)\s+([a-z°][a-z0-9°²³/]*|°)$/i);
        if (!conversion) { const value = calculate(query, angle, ans); return { kind: 'calculator', text: format(value), value }; }
        const [, source, from, to] = conversion, a = UNITS[from.toLowerCase()], b = UNITS[to.toLowerCase()];
        const amount = calculate(source, angle, ans);
        if (a && b) {
            if (a.dimension !== b.dimension) throw new Error('These units measure different quantities.');
            const base = amount * a.factor + a.offset;
            if (a.dimension === 'temperature' && base < -1e-9) throw new Error('Temperature is below absolute zero.');
            const value = (base - b.offset) / b.factor;
            if (!Number.isFinite(value)) throw new Error('Conversion result is too large.');
            return { kind: 'unit', text: format(a.dimension === 'temperature' && Math.abs(value) < 1e-12 ? 0 : value) + ' ' + to, value };
        }
        if (!a && !b && /^[a-z]{3}$/i.test(from) && /^[a-z]{3}$/i.test(to))
            return { kind: 'currency', amount, from: from.toUpperCase(), to: to.toUpperCase() };
        throw new Error('Unknown or incompatible units. Try 5 ft in cm or 10 USD to SGD.');
    }
    function rateRequest(session, from, to) {
        const id = from + '/' + to, cached = session.rates.get(id);
        if (from === to) return { promise: Promise.resolve({ rate: 1, date: '', same: true }), cancel() {} };
        if (cached && Date.now() - cached.saved < 600000) return { promise: Promise.resolve(cached), cancel() {} };
        const controller = typeof AbortController === 'function' ? new AbortController() : undefined;
        let reject, timer;
        const job = { cancel() { controller?.abort(); reject?.(new Error('Cancelled.')); } };
        const cancelled = new Promise((_, fail) => { reject = fail; });
        session.fxJobs.add(job);
        timer = setTimeout(() => { controller?.abort(); reject(new Error('Exchange-rate lookup timed out.')); }, 10000);
        job.promise = Promise.race([cancelled, (async () => {
            if (typeof globalThis.fetch !== 'function') throw new Error('Currency conversion needs an internet connection.');
            const response = await globalThis.fetch('https://api.frankfurter.dev/v2/rate/' + from.toLowerCase() + '/' + to.toLowerCase(),
                { ...(controller ? { signal: controller.signal } : {}), redirect: 'error' });
            if (!response.ok) throw new Error([404, 422].includes(response.status) ? 'This currency pair is unavailable.' : 'Could not load exchange rates.');
            const raw = await response.text();
            if (raw.length > 12000) throw new Error('Invalid exchange-rate response.');
            let data; try { data = JSON.parse(raw); } catch { throw new Error('Invalid exchange-rate response.'); }
            if (data.base !== from || data.quote !== to || typeof data.rate !== 'number' || !(data.rate > 0) || !Number.isFinite(data.rate) || !/^\d{4}-\d{2}-\d{2}$/.test(data.date))
                throw new Error('Invalid exchange-rate response.');
            return { rate: data.rate, date: data.date, saved: Date.now() };
        })()]).then(data => { if (session.active && !data.same) { if (session.rates.size >= 20) session.rates.delete(session.rates.keys().next().value); session.rates.set(id, data); } return data; })
            .finally(() => { clearTimeout(timer); session.fxJobs.delete(job); });
        return job;
    }
    function currencyText(value, to) {
        if (!Number.isFinite(value) || Math.abs(value) >= 1e15) throw new Error('Currency amount is too large.');
        const digits = optional(() => new Intl.NumberFormat('en', { style: 'currency', currency: to }).resolvedOptions().maximumFractionDigits) ?? 2;
        return value.toFixed(digits) + ' ' + to;
    }
    function currencyQuery(draft, angle = 'DEG', ans = 0) {
        if (typeof draft !== 'string' || draft.length > 2000) return null;
        const query = draft.replace(/^\s*=(?!=)\s*/, '').trim();
        if (!/^[+\-]?(?:\d+(?:\.\d+)?|\.\d+)\s+[a-z]{3}\s+(?:to|in)\s+[a-z]{3}$/i.test(query)) return null;
        try { const result = inlineAnswer('= ' + query, angle, ans); return result?.kind === 'currency' ? result : null; }
        catch { return null; }
    }
    function currencyLabel(query, rate) {
        return format(query.amount) + ' ' + query.from + ' ≈ ' + currencyText(query.amount * rate.rate, query.to)
            + (rate.date ? ' · ' + rate.date : '');
    }
    async function currencyInline(session, snapshot, source, label) {
        if (snapshot && (!session.active || snapshot !== session.snapshot())) return false;
        session.currencyNativeUsed = source !== '';
        const revision = ++session.currencyRevision;
        try {
            const native = session.api.unscoped.modules?.native;
            if (typeof native?.callNativeMethod !== 'function') return false;
            const result = await native.callNativeMethod('dev.fluttershy2008.math-ai.currency.preview', [revision, source, label]);
            return (result?.result ?? result)?.ready === true;
        } catch { return false; }
    }
    function settingsOf(value) {
        return { angle: value?.angle === 'RAD' ? 'RAD' : 'DEG', steps: value?.steps !== false,
            inline: value?.inline !== false, currency: value?.currency !== false, autoSend: value?.autoSend !== false, aiSend: value?.aiSend === true };
    }
    function saveSettings(session, key, value) {
        if (!session.active) return;
        if (['aiSend', 'currency', 'autoSend'].includes(key) && value !== session.settings[key]) { session.sendEpoch++; cancel(session); }
        session.settings = settingsOf({ ...session.settings, [key]: value }); changed();
        const next = { ...session.settings };
        writes = writes.catch(() => {}).then(() => session.api.jsonStorage.set(next, true)).catch(() => {
            if (session.active) { session.error = 'Could not save settings.'; changed(); }
        });
    }
    const NANO_PREFIX = 'dev.fluttershy2008.math-ai.nano.';
    async function nanoCall(session, action, args = []) {
        const native = session.api.unscoped.modules?.native;
        if (typeof native?.callNativeMethod !== 'function') throw new Error('The Android Nano bridge is unavailable. Install the updated ZIP and fully restart Valenced.');
        let result;
        try { result = await native.callNativeMethod(NANO_PREFIX + action, args); }
        catch { throw new Error('Could not reach the Android Nano bridge. Install the updated ZIP and fully restart Valenced.'); }
        const value = result?.result?.phase ? result.result : result;
        if (!value || typeof value.phase !== 'string') throw new Error('The Android Nano bridge did not respond. Fully restart Valenced after updating.');
        return value;
    }
    function cancel(session) { session?.request?.cancel(); session?.sendFx?.cancel(); }
    async function runNano(session, setup = false, options = {}) {
        if (!session?.active || session.busy) return;
        const question = session.question.trim();
        session.error = ''; session.notice = '';
        if (!setup && (!question || question.length > 6000)) { session.error = 'Enter a question from 1 to 6,000 characters.'; changed(); return; }
        const replyStyle = 'Reply in plain, natural chat language. Give just the answer with units and all solutions, or 1–2 short sentences if needed. No working steps, headings, lists, greetings or extra commentary. If unclear, ask one short question.';
        const input = !setup && options.shortReply ? replyStyle + '\n\nQuestion: ' + question : question;
        if (!setup && input.length > 6000) {
            session.error = 'This question is too long for a short AI reply. Shorten it and try again.'; changed(); return;
        }
        session.busy = true; session.result = ''; session.nanoMode = setup ? 'setup' : 'solve'; changed();
        let rejectCancel, timer, pollTimer, id;
        const job = { cancelled: false, cancel() {
            job.cancelled = true;
            if (id) void nanoCall(session, 'cancel', [id]).catch(() => {});
            rejectCancel(new Error('Nano operation cancelled.'));
        } };
        session.request = job;
        const cancelled = new Promise((_, reject) => { rejectCancel = reject; });
        timer = setTimeout(() => job.cancel(), 20 * 60 * 1000);
        try {
            const response = await Promise.race([cancelled, (async () => {
                let status = await nanoCall(session, setup ? 'setup' : 'solve', setup ? [] : [input, session.settings.angle, options.steps ?? session.settings.steps]);
                id = status.jobId;
                if (job.cancelled || !session.active) { if (id) await nanoCall(session, 'cancel', [id]); throw new Error('Nano operation cancelled.'); }
                while (session.active && !job.cancelled) {
                    if (status.phase === 'error') throw new Error(status.error || 'Open Math Nano and check the device status.');
                    if (status.phase === 'cancelled') throw new Error('Nano operation cancelled.');
                    if (status.phase === 'done') return status;
                    if (!id || status.jobId !== id || status.phase !== 'opening') throw new Error('Nano returned an unexpected job status. Try again.');
                    await new Promise(resolve => { pollTimer = setTimeout(resolve, 500); });
                    if (!session.active || job.cancelled) throw new Error('Nano operation cancelled.');
                    status = await nanoCall(session, 'status');
                    if (status.jobId !== id) throw new Error('Nano session changed. Reopen the question and try again.');
                }
                throw new Error('Nano operation cancelled.');
            })()]);
            if (session.active && current === session && session.request === job) {
                session.nanoAvailability = response.availability || 'unknown';
                if (setup) session.notice = session.nanoAvailability === 'ready' ? 'Gemini Nano is ready. You can use AI solve without an API key.' : 'Device status: ' + session.nanoAvailability + '. Open Nano setup for preparation or troubleshooting.';
                else {
                    if (typeof response.answer !== 'string' || !response.answer.trim() || response.answer.length > 16000) throw new Error('Nano returned no usable answer. Try a shorter question.');
                    session.result = response.answer.trim(); session.resultKind = 'Gemini Nano · on-device answer · check the working';
                    session.history.unshift({ question, result: session.result }); session.history.length = Math.min(10, session.history.length);
                    return session.result;
                }
            }
        } catch (error) { if (session.active && current === session) session.error = error.message || 'Could not finish the Nano operation.'; }
        finally {
            clearTimeout(timer); clearTimeout(pollTimer);
            if (id) void nanoCall(session, 'clear', [id]).catch(() => {});
            if (session.request === job) session.request = undefined;
            session.busy = false; if (session.active && current === session) changed();
        }
    }
    async function solveAI(session) { return runNano(session, false); }
    function sendSolved(session, receiver, args, original, conversion = null) {
        args = [...args];
        const message = { ...args[1] }, question = message.content.trim(), channel = args[0], account = session.user();
        const fail = error => {
            if (session.active) { session.error = error.message; session.visible = true; changed(); }
            return Promise.reject(error);
        };
        if (session.pendingSend) {
            const pending = session.pendingSend;
            if (pending.channel === channel && pending.account === account && pending.content === message.content
                && pending.nonce === message.nonce) return pending.promise;
            return fail(new Error('An answer is already being prepared. Wait or cancel it first.'));
        }
        if (session.busy) return fail(new Error('Finish or cancel the current Nano operation before sending.'));
        if (!question || question.length > 6000 || !account || !channel || session.selected() !== channel)
            return fail(new Error('Open the original chat and enter a question from 1 to 6,000 characters.'));
        // The explicit Sigma mode solves the entire question, never a partial
        // arithmetic fragment inside a written problem.
        let localAnswer = conversion;
        try {
            if (!localAnswer) localAnswer = inlineAnswer('= ' + question.replace(/^=(?!=)\s*/, ''), session.settings.angle, session.ans);
        } catch { /* Written questions and equations use Nano. */ }
        conversion = localAnswer?.kind === 'currency' ? localAnswer : null;
        if (conversion && !session.settings.currency) return fail(new Error('Currency conversion is off in Math AI settings.'));
        if (localAnswer && localAnswer.kind !== 'currency')
            return Reflect.apply(original, receiver, [channel, { ...message, content: localAnswer.text }, ...args.slice(2)]);
        session.channel = channel; session.account = account; session.question = question;
        const epoch = session.sendEpoch;
        let moved = false;
        const remove = session.subscribeDraft(() => {
            if (session.selected() !== channel || session.user() !== account) { moved = true; cancel(session); }
        });
        const pending = { channel, account, content: message.content, nonce: message.nonce };
        session.pendingSend = pending;
        pending.promise = (async () => {
            try {
                let answer;
                if (conversion) {
                    session.error = ''; session.busy = true; session.nanoMode = 'currency'; changed();
                    session.sendFx = rateRequest(session, conversion.from, conversion.to);
                    answer = currencyLabel(conversion, await session.sendFx.promise);
                } else answer = await runNano(session, false, { steps: false, shortReply: true });
                const modeEnabled = conversion ? session.settings.currency && (session.settings.aiSend || session.settings.autoSend) : session.settings.aiSend;
                if (!session.active || current !== session || moved || session.sendEpoch !== epoch || !modeEnabled
                    || session.selected() !== channel || session.user() !== account)
                    throw new Error('Send cancelled because the chat, account or conversion/auto-solve mode changed.');
                if (!answer) throw new Error(session.error || 'AI solve was cancelled. Nothing was sent.');
                if (answer.length > 1900) throw new Error('The AI answer is too long to send. Copy it from the calculator panel.');
                session.notice = conversion ? 'Sending currency conversion…' : 'Sending AI answer…'; changed();
                // Call the captured sender once with the captured chat and metadata.
                const sent = await Reflect.apply(original, receiver, [channel, { ...message, content: answer }, ...args.slice(2)]);
                if (session.active) { session.notice = conversion ? 'Currency conversion sent.' : 'AI answer sent.'; changed(); }
                return sent;
            } catch (error) {
                if (session.active && current === session) { session.error = error.message || 'Could not send the AI answer.'; session.visible = true; changed(); }
                throw error;
            } finally {
                if (conversion) { session.sendFx = undefined; session.busy = false; if (session.active) changed(); }
                remove(); if (session.pendingSend === pending) session.pendingSend = undefined;
            }
        })();
        return pending.promise;
    }
    function stop(session) {
        if (!session?.active) return;
        session.active = false; session.visible = false; cancel(session);
        for (const job of [...session.fxJobs]) job.cancel();
        for (const remove of [...session.previewDisposers]) remove();
        for (const remove of [...session.draftSubscriptions]) remove();
        session.rates.clear();
        for (const remove of session.removers.splice(0).reverse()) optional(remove);
        session.question = ''; session.result = ''; session.history = [];
        if (current === session) current = undefined;
        changed();
    }
    function addButton(React, node, button, depth = 0) {
        if (depth > 24 || !React.isValidElement(node)) return node;
        const children = node.props?.children;
        const list = Array.isArray(children) ? children : [children];
        if (list.some(x => x?.key === 'fluttershy-math-ai')) return node;
        const at = list.findIndex(x => React.isValidElement(x) && x.props?.children?.props?.onPressExpression);
        if (at >= 0) { const next = [...list]; next.splice(at, 0, button); return React.cloneElement(node, {}, next); }
        for (let i = 0; i < list.length; i++) {
            const patched = addButton(React, list[i], button, depth + 1);
            if (patched !== list[i]) { const next = [...list]; next[i] = patched; return React.cloneElement(node, {}, Array.isArray(children) ? next : patched); }
        }
        return node;
    }
    async function start(api) {
        if (current?.active) return;
        const U = api.unscoped, F = U.modules.finders, paths = U.discord.utils?.modules?.finders;
        const session = { api, active: true, settings: settingsOf(api.jsonStorage.cache), nanoAvailability: 'unknown', nanoMode: '', question: '', result: '', resultKind: '',
            error: '', notice: '', ans: 0, history: [], visible: false, busy: false, removers: [], account: null, channel: null,
            rates: new Map(), fxJobs: new Set(), draftSubscriptions: new Set(), previewDisposers: new Set(), ActionButton: null, sendReady: false, sendEpoch: 0,
            currencyRevision: Date.now() * 1000, currencyNativeUsed: false };
        current = session; api.cleanup(() => stop(session));
        const data = api.jsonStorage.loaded ? api.jsonStorage.cache : await api.jsonStorage.get();
        if (!session.active) return;
        session.settings = settingsOf(data);
        const byProps = (...props) => optional(() => F.lookupModule(F.filters.withProps(...props), { initialize: false })[0]);
        const stores = U.discord.flux.Stores;
        session.selected = () => optional(() => stores.SelectedChannelStore.getChannelId());
        session.user = () => optional(() => stores.UserStore.getCurrentUser()?.id);
        const draftStore = () => optional(() => stores.DraftStore) ?? byProps('getDraft', 'getState');
        session.snapshot = () => JSON.stringify([session.user() ?? '', session.selected() ?? '',
            optional(() => draftStore()?.getDraft(session.selected(), 0)) ?? '']);
        session.subscribeDraft = callback => {
            const removes = []; let timer, disposed = false;
            for (const store of [draftStore(), optional(() => stores.SelectedChannelStore), optional(() => stores.UserStore)]) {
                if (store?.addChangeListener && store?.removeChangeListener) {
                    store.addChangeListener(callback); removes.push(() => store.removeChangeListener(callback));
                } else if (!timer) timer = setInterval(callback, 250);
            }
            const remove = () => { if (disposed) return; disposed = true; for (const fn of removes) optional(fn); if (timer) clearInterval(timer); session.draftSubscriptions.delete(remove); };
            session.draftSubscriptions.add(remove); return remove;
        };
        session.readDraft = () => {
            if (!session.active || current !== session || session.busy) return;
            const channel = session.selected();
            const draft = optional(() => stores.DraftStore.getDraft(channel, 0)) ?? optional(() => byProps('getDraft', 'getState')?.getDraft(channel, 0));
            if (typeof draft !== 'string') { session.notice = 'Could not read this chat draft. Use Paste question below.'; return; }
            session.channel = channel; session.account = session.user(); session.question = draft.replace(/^\s*=(?!=)\s*/, '').slice(0, 6000);
            session.result = ''; session.error = ''; session.notice = draft.length > 6000 ? 'Only the first 6,000 characters were loaded.' : ''; changed();
        };
        session.append = () => {
            if (!session.active || current !== session || !session.result || session.result.length > 1900) return;
            try {
                if (!session.channel || session.selected() !== session.channel || session.user() !== session.account) throw new Error('Return to the original chat, then load its draft before inserting.');
                const dispatch = byProps('dispatchToLastSubscribed');
                if (!dispatch?.dispatchToLastSubscribed) throw new Error('Composer insertion is unavailable. Use Copy answer, then paste it.');
                dispatch.dispatchToLastSubscribed('INSERT_TEXT', { rawText: '\n' + session.result, plainText: '\n' + session.result });
                session.visible = false; session.notice = 'Answer inserted. Review it before sending.'; changed();
            } catch (error) { session.error = error.message; changed(); }
        };
        const watch = (path, fn) => {
            const remove = optional(() => paths?.getModuleWithImportedPath(path, value => { if (session.active) fn(value); }));
            if (typeof remove === 'function') session.removers.push(remove);
        };
        const patched = new WeakSet();
        const sending = new WeakSet();
        const acceptSending = mod => {
            for (const actions of [mod?.default, mod]) {
                if (!actions || typeof actions.sendMessage !== 'function' || sending.has(actions)) continue;
                sending.add(actions);
                session.removers.push(U.patcher.instead(actions, 'sendMessage', function(args, original) {
                    if (!session.active || typeof args[1]?.content !== 'string')
                        return Reflect.apply(original, this, args);
                    const conversion = session.settings.currency && (session.settings.autoSend || session.settings.aiSend)
                        ? currencyQuery(args[1].content, session.settings.angle, session.ans) : null;
                    if (conversion) return sendSolved(session, this, args, original, conversion);
                    if (session.settings.aiSend && args[1].content.trim()) return sendSolved(session, this, args, original);
                    if (!session.settings.autoSend) return Reflect.apply(original, this, args);
                    const content = solveOutgoing(args[1].content, session.settings.angle, session.ans);
                    const next = content === args[1].content ? args : [args[0], { ...args[1], content }, ...args.slice(2)];
                    return Reflect.apply(original, this, next);
                }));
                session.sendReady = true; changed();
            }
        };
        watch('actions/MessageActionCreators.tsx', acceptSending);
        acceptSending(byProps('sendMessage', 'revealMessage'));
        const removeSendWatcher = optional(() => F.getModules(F.filters.withProps('sendMessage', 'revealMessage'), value => { if (session.active) acceptSending(value); }));
        if (typeof removeSendWatcher === 'function') session.removers.push(removeSendWatcher);
        watch('modules/chat_input/native/action_buttons/ChatInputActionButton.tsx', mod => { session.ActionButton = mod.default; changed(); });
        watch('modules/chat_input/native/ChatInput.tsx', mod => {
            let holder = mod.default, key = 'type';
            if (typeof holder?.type !== 'function') { holder = mod; key = 'default'; }
            if (!holder || typeof holder[key] !== 'function' || patched.has(holder)) return;
            patched.add(holder);
            session.removers.push(U.patcher.after(holder, key, result => {
                if (!session.active || !U.react.React.isValidElement(result)) return result;
                const h = U.react.React.createElement;
                const tree = addButton(U.react.React, result, h(MathButton, { key: 'fluttershy-math-ai', api, session }));
                return h(Composer, { api, session }, tree);
            }));
        });
        changed();
    }
    function useRefresh(React) {
        const [, set] = React.useState(0);
        React.useEffect(() => { const fn = () => set(x => x + 1); listeners.add(fn); return () => listeners.delete(fn); }, []);
    }
    function flatStyle(RN, style) {
        const resolved = optional(() => RN.StyleSheet.flatten(style));
        if (resolved && typeof resolved === 'object') return resolved;
        if (Array.isArray(style)) return Object.assign({}, ...style.map(value => flatStyle(RN, value)));
        return style && typeof style === 'object' ? style : {};
    }
    function hasMathButton(React, node, depth = 0) {
        if (depth > 24) return false;
        if (Array.isArray(node)) return node.some(value => hasMathButton(React, value, depth + 1));
        if (!React.isValidElement(node)) return false;
        return node.key === 'fluttershy-math-ai' || hasMathButton(React, node.props?.children, depth + 1);
    }
    function attachPreview(React, RN, node, preview, depth = 0) {
        if (depth > 24 || !React.isValidElement(node) || !hasMathButton(React, node)) return node;
        const props = node.props ?? {}, children = props.children;
        if ((Array.isArray(children) ? children : [children]).some(child => child?.key === 'math-ai-composer-content')) return node;
        // Keep Discord's positioning/animation/ref on its own layout root.
        // An outside sibling is not included in a floating input's height and
        // can end up under it. Put the preview in the same measured column.
        const layout = node.type === RN.View || node.type === RN.Animated?.View || props.style !== undefined;
        if (layout) {
            const style = flatStyle(RN, props.style), content = {}, outer = {
                flexDirection: 'column', alignItems: 'stretch', justifyContent: 'flex-start',
                height: undefined, minHeight: undefined, maxHeight: undefined, overflow: 'visible',
            };
            for (const key of ['flexDirection', 'flexWrap', 'alignItems', 'justifyContent', 'alignContent', 'gap', 'rowGap', 'columnGap',
                'height', 'minHeight', 'maxHeight', 'padding', 'paddingHorizontal', 'paddingVertical', 'paddingTop', 'paddingBottom',
                'paddingLeft', 'paddingRight', 'paddingStart', 'paddingEnd', 'backgroundColor', 'borderWidth', 'borderTopWidth',
                'borderBottomWidth', 'borderLeftWidth', 'borderRightWidth', 'borderStartWidth', 'borderEndWidth', 'borderColor',
                'borderTopColor', 'borderBottomColor', 'borderLeftColor', 'borderRightColor', 'borderRadius', 'borderTopLeftRadius',
                'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius', 'borderCurve', 'boxShadow', 'elevation',
                'shadowColor', 'shadowOpacity', 'shadowOffset', 'shadowRadius', 'overflow']) {
                if (style[key] === undefined) continue;
                content[key] = style[key];
                if (key.startsWith('padding') || /Width$|Radius$/.test(key) && key.startsWith('border') || key === 'elevation') outer[key] = 0;
                else if (key === 'backgroundColor') outer[key] = 'transparent';
                else if (!['flexDirection', 'alignItems', 'justifyContent', 'height', 'minHeight', 'maxHeight', 'overflow'].includes(key)) outer[key] = undefined;
            }
            // The existing controls keep their original direction, padding,
            // size and capsule styling; only the native root grows by the pill.
            content.flexShrink = 0;
            return React.cloneElement(node, { style: [props.style, outer] }, [
                preview, React.createElement(RN.View, { key: 'math-ai-composer-content', style: content }, children),
            ]);
        }
        const list = Array.isArray(children) ? children : [children];
        for (let i = 0; i < list.length; i++) {
            const next = attachPreview(React, RN, list[i], preview, depth + 1);
            if (next !== list[i]) {
                const updated = [...list]; updated[i] = next;
                return React.cloneElement(node, {}, Array.isArray(children) ? updated : next);
            }
        }
        return node;
    }
    function Composer({ api, session, children }) {
        const { React, ReactNative: RN } = api.unscoped.react;
        useRefresh(React);
        if (!session.active || !session.settings.inline) return children;
        return attachPreview(React, RN, children,
            React.createElement(InlinePreview, { key: 'math-ai-inline-preview', api, session }));
    }
    function InlinePreview({ api, session }) {
        const { React, ReactNative: RN } = api.unscoped.react, h = React.createElement;
        useRefresh(React);
        const [snapshot, setSnapshot] = React.useState(session.snapshot), [answer, setAnswer] = React.useState(null), [copied, setCopied] = React.useState(false);
        React.useEffect(() => {
            const update = () => { if (session.active) setSnapshot(session.snapshot()); };
            const remove = session.subscribeDraft(update); update(); return remove;
        }, [session]);
        React.useEffect(() => {
            let live = true, timer, job;
            const remove = () => {
                live = false; clearTimeout(timer); job?.cancel(); session.previewDisposers.delete(remove);
                if (session.currencyNativeUsed) void currencyInline(session, null, '', '');
            };
            session.previewDisposers.add(remove);
            const show = value => { if (live && session.active) setAnswer({ ...value, snapshot }); };
            setCopied(false);
            try {
                const draft = JSON.parse(snapshot)[2];
                const result = session.active && session.settings.inline
                    ? currencyQuery(draft, session.settings.angle, session.ans) || inlineAnswer(draft, session.settings.angle, session.ans) : null;
                if (!result) setAnswer(null);
                else if (result.kind !== 'currency') show(result);
                else if (!session.settings.currency) show({ error: 'Currency lookup is off in Math AI settings.' });
                else {
                    show({ kind: 'currency', loading: true });
                    timer = setTimeout(async () => {
                        if (!live || !session.active) return;
                        job = rateRequest(session, result.from, result.to);
                        try {
                            const rate = await job.promise;
                            if (!live || !session.active || snapshot !== session.snapshot()) return;
                            const label = currencyLabel(result, rate);
                            const native = await currencyInline(session, snapshot, draft, '≈ ' + currencyText(result.amount * rate.rate, result.to));
                            session.lastCurrencyLabel = label;
                            show({ kind: 'currency', text: currencyText(result.amount * rate.rate, result.to), label, date: rate.date, native });
                        } catch (error) { show({ error: error.message || 'Could not load exchange rates.' }); }
                    }, 550);
                }
            } catch (error) { show({ error: error.message }); }
            return remove;
        }, [snapshot, session, session.settings.inline, session.settings.currency, session.settings.angle, session.ans]);
        // Hide old results immediately, even before the next effect runs.
        if (!session.active || !session.settings.inline || !answer || answer.snapshot !== snapshot) return null;
        if (answer.kind === 'currency' && (answer.native || answer.loading)) return null;
        const light = optional(() => api.unscoped.discord.flux.Stores.ThemeStore.theme) === 'light';
        const fg = light ? '#17191C' : '#F2F3F5', card = light ? '#E9EAF0' : '#2B2D31';
        const label = answer.loading ? 'Loading exchange rate…' : answer.error || '= ' + answer.text;
        async function copy() {
            if (!answer.text || snapshot !== session.snapshot()) return;
            try { await api.unscoped.externals.ReactNativeClipboard.Clipboard.setString(answer.text); if (session.active) setCopied(true); }
            catch { if (session.active) setAnswer({ ...answer, error: 'Could not copy. Long-press the answer or open ∑.' }); }
        }
        return h(RN.View, { pointerEvents: 'box-none', style: { flexShrink: 0, alignSelf: 'stretch', alignItems: 'flex-start', paddingHorizontal: 12, paddingTop: 6, paddingBottom: 8 } },
            h(RN.Pressable, { accessibilityRole: 'button', accessibilityLabel: label, accessibilityHint: 'Tap to copy the answer',
                disabled: !answer.text, onPress: () => { void copy(); },
                style: { maxWidth: '100%', backgroundColor: card, paddingVertical: 9, paddingHorizontal: 13, borderRadius: 12 } },
                h(RN.Text, { selectable: true, style: { color: answer.error ? light ? '#B42318' : '#F2A6A6' : fg,
                    fontSize: 17, fontWeight: '600', lineHeight: 23, includeFontPadding: false } }, copied ? 'Copied · ' + label : label),
                answer.date ? h(RN.Text, { style: { color: light ? '#5C5E66' : '#B5BAC1', fontSize: 11, marginTop: 3 } }, 'Frankfurter · ' + answer.date) : null));
    }
    function MathButton({ api, session }) {
        const { React, ReactNative: RN } = api.unscoped.react, h = React.createElement;
        useRefresh(React);
        const held = React.useRef(false);
        if (!session.active) return null;
        const open = () => { if (!session.busy) session.readDraft(); session.visible = true; RN.Keyboard?.dismiss(); changed(); };
        const toggle = () => saveSettings(session, 'aiSend', !session.settings.aiSend);
        const label = 'Auto AI solve: ' + (session.settings.aiSend ? 'ON' : 'OFF');
        // Native action buttons can discard onLongPress. The outer Pressable
        // owns gestures; the native child only supplies the usual chat spacing.
        const IconComponent = ({ style } = {}) => h(RN.View, {
            pointerEvents: 'none', style: [{ width: 24, height: 24 }, style,
                { alignItems: 'center', justifyContent: 'center' }] },
            h(RN.Image, { source: { uri: SIGMA_ICON }, resizeMode: 'contain',
                style: { width: 20, height: 20, tintColor: session.settings.aiSend ? '#949CF7' : '#B5BAC1',
                    // Centre the visible ink within the transparent PNG.
                    transform: [{ translateX: 0.42 }, { translateY: -0.1 }] } }));
        return h(React.Fragment, null,
            h(RN.Pressable, { accessibilityRole: 'button', accessibilityLabel: label,
                accessibilityHint: 'Tap to toggle. Hold to open Math AI settings.',
                accessibilityState: { selected: session.settings.aiSend }, delayLongPress: 350,
                onPressIn: () => { held.current = false; },
                onLongPress: () => { held.current = true; open(); },
                onPress: () => { if (!held.current) toggle(); },
                style: { alignSelf: 'center', alignItems: 'center', justifyContent: 'center', flexShrink: 0 } },
                h(RN.View, { pointerEvents: 'none', accessible: false, accessibilityElementsHidden: true,
                    importantForAccessibility: 'no-hide-descendants' },
                    session.ActionButton ? h(session.ActionButton, { active: session.settings.aiSend,
                        IconComponent, onPress: () => {} })
                        : h(RN.View, { style: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' } }, h(IconComponent)))),
            h(RN.Modal, { visible: session.visible, animationType: 'slide', onRequestClose: () => { session.visible = false; changed(); } },
                h(RN.SafeAreaView, { style: { flex: 1, backgroundColor: '#1E1F22' } },
                    h(Panel, { api, session, modal: true }))));
    }
    function Panel({ api, session, modal = false }) {
        const { React, ReactNative: RN } = api.unscoped.react, h = React.createElement;
        useRefresh(React);
        const [setup, setSetup] = React.useState(false);
        if (!session?.active) return h(RN.Text, { style: { padding: 20 } }, 'Enable Math AI to open the calculator.');
        const light = !modal && optional(() => api.unscoped.discord.flux.Stores.ThemeStore.theme) === 'light';
        const fg = light ? '#16181C' : '#F2F3F5', muted = light ? '#4E5058' : '#B5BAC1', card = light ? '#EAECF0' : '#2B2D31';
        const text = (value, style = {}) => h(RN.Text, { selectable: true, style: { color: muted, marginBottom: 10, lineHeight: 21, ...style } }, value);
        const row = children => h(RN.View, { style: { flexDirection: 'row', flexWrap: 'wrap' } }, children);
        const button = (label, onPress, disabled = false, selected = false) => h(RN.Pressable, { key: label, accessibilityRole: 'button',
            accessibilityLabel: label, accessibilityState: { disabled, selected }, disabled, onPress,
            style: { padding: 11, borderRadius: 9, marginRight: 6, marginBottom: 8, backgroundColor: selected ? '#5865F2' : card, opacity: disabled ? 0.45 : 1 } },
            h(RN.Text, { style: { color: selected ? '#FFFFFF' : fg, fontWeight: '600' } }, label));
        const input = (label, value, onChangeText, extra = {}) => h(RN.TextInput, { accessibilityLabel: label, value, onChangeText,
            placeholder: label, placeholderTextColor: muted, autoCapitalize: 'none', autoCorrect: false,
            style: { color: fg, backgroundColor: card, padding: 12, borderRadius: 9, fontSize: 16, marginBottom: 10 }, ...extra });
        function save(key, value) {
            saveSettings(session, key, value);
        }
        function edit(value) { if (session.busy) return; session.question = value; session.result = ''; session.error = ''; session.notice = ''; changed(); }
        function calc() {
            try {
                const value = calculate(session.question, session.settings.angle, session.ans);
                session.ans = value; session.result = format(value); session.resultKind = 'Calculator result'; session.error = ''; session.notice = '';
                session.history.unshift({ question: session.question, result: session.result }); session.history.length = Math.min(10, session.history.length);
            } catch (error) { session.result = ''; session.error = error.message; }
            changed();
        }
        async function paste() {
            try {
                const value = await api.unscoped.externals.ReactNativeClipboard.Clipboard.getString();
                if (session.active && !session.busy) edit(String(value).slice(0, 6000));
            } catch { session.error = 'Clipboard unavailable. Long-press the question box and paste.'; changed(); }
        }
        async function copy() {
            try { await api.unscoped.externals.ReactNativeClipboard.Clipboard.setString(session.result); session.notice = 'Answer copied.'; }
            catch { session.error = 'Clipboard unavailable. Long-press the answer to copy it.'; }
            if (session.active) changed();
        }
        const keys = [
            [['7','7'],['8','8'],['9','9'],['÷','÷'],['(','(']],
            [['4','4'],['5','5'],['6','6'],['×','×'],[')',')']],
            [['1','1'],['2','2'],['3','3'],['−','-'],['xʸ','^']],
            [['0','0'],['.','.'],['π','π'],['+','+'],['%','%']],
            [['x²','²'],['x³','³'],['√','sqrt('],['∛','cbrt('],['ⁿ√','root(']],
            [['sin','sin('],['cos','cos('],['tan','tan('],['ln','ln('],['log₁₀','log(']],
            [['sin⁻¹','asin('],['cos⁻¹','acos('],['tan⁻¹','atan('],['log₂','log2('],['n!','!']],
            [['sinh','sinh('],['cosh','cosh('],['tanh','tanh('],['10ˣ','10^('],['eˣ','exp(']],
            [['asinh','asinh('],['acosh','acosh('],['atanh','atanh('],['|x|','abs('],['1/x','1/(']],
            [['nCr','ncr('],['nPr','npr('],['mod','mod('],['τ','τ'],[',',',']],
            [['floor','floor('],['ceil','ceil('],['round','round('],['e','e'],['ANS','ans']],
            [['EE','e'],['±',null]],
        ];
        return h(RN.ScrollView, { keyboardShouldPersistTaps: 'handled', contentContainerStyle: { padding: 18, paddingBottom: 50 } },
            row([text('Math AI', { color: fg, fontSize: 27, fontWeight: '700' }), modal ? button('Close', () => { session.visible = false; changed(); }) : null]),
            text('Calculate offline, or use Gemini Nano on this device for an AI answer. No API key is needed. Review answers before sending.'),
            button(session.settings.aiSend ? 'Auto AI solve: ON' : 'Auto AI solve: OFF', () => save('aiSend', !session.settings.aiSend), false, session.settings.aiSend),
            text('Tap Σ in chat to turn Auto AI solve on or off. When ON, Discord Send solves your whole question and sends a short, natural answer without working steps. Simple expressions solve immediately; written questions open Math Nano and send after it returns. Hold Σ to open this calculator. Turn it OFF for normal chat.'),
            row([button(session.settings.inline ? 'Inline Calculator: ON' : 'Inline Calculator: OFF', () => save('inline', !session.settings.inline)),
                button(session.settings.currency ? 'Currency conversions: ON' : 'Currency conversions: OFF', () => save('currency', !session.settings.currency)),
                button(session.settings.autoSend ? 'Solve when sending: ON' : 'Solve when sending: OFF', () => save('autoSend', !session.settings.autoSend))]),
            text('Send 2+2 using Discord’s normal send button and your message becomes 4. Scientific expressions and offline unit conversions also work. This switch is independent of the inline preview and needs no AI key.'),
            (session.settings.autoSend || session.settings.aiSend) && !session.sendReady ? text('Open a chat or fully restart Discord to connect automatic solving.') : null,
            text('Type = and a sum or a unit conversion, like = 12 * 4.5 or = 5 ft in cm, and see the answer above the message box. Tap a calculator result to copy it. Currency conversions use the inline chat display below.'),
            text('Currency inside the chat bar: type 10 MYR to SGD (no = needed). After a short pause the native input displays the converted amount. The latest rate date is shown here and included when sending. Your original query stays editable. With Solve when sending or Auto AI solve enabled, Send posts the dated conversion. Internet is required; a rate is never invented by AI. Fully restart Valenced after installing this native update.'),
            session.lastCurrencyLabel ? text('Last currency conversion: ' + session.lastCurrencyLabel) : null,
            input('Math question or expression', session.question, edit, { multiline: true, maxLength: 6000, editable: !session.busy, textAlignVertical: 'top', style: { minHeight: 90, padding: 12, borderRadius: 9, backgroundColor: card, color: fg, fontSize: 17, marginBottom: 10 } }),
            row([button('Load chat draft', () => session.readDraft(), session.busy), button('Paste question', () => { void paste(); }, session.busy),
                button('Clear', () => edit(''), session.busy), button('⌫', () => edit(session.question.slice(0, -1)), session.busy)]),
            row(['DEG', 'RAD'].map(mode => button(mode, () => save('angle', mode), session.busy, session.settings.angle === mode))),
            ...keys.map((keys, i) => h(RN.View, { key: 'keys-' + i, style: { flexDirection: 'row', flexWrap: 'wrap' } },
                keys.map(([label, value]) => button(label, () => edit((value === null ? session.question.trim() ? '-(' + session.question + ')' : '-' : session.question + value).slice(0, 6000)), session.busy)))),
            row([button('Calculate', calc, session.busy || !session.question.trim(), true),
                button(session.busy ? session.nanoMode === 'currency' ? 'Converting currency…' : 'Nano is open…' : 'AI solve', () => { void solveAI(session); }, session.busy || !session.question.trim(), true),
                session.busy ? button(session.nanoMode === 'currency' ? 'Cancel conversion' : 'Cancel AI', () => cancel(session)) : null]),
            session.busy ? h(RN.ActivityIndicator, { color: '#949CF7' }) : null,
            session.error ? text(session.error, { color: light ? '#B42318' : '#F2A6A6' }) : null,
            session.result ? h(RN.View, { style: { backgroundColor: card, padding: 14, borderRadius: 10, marginVertical: 10 } },
                text(session.resultKind, { fontWeight: '700', color: fg }), text(session.result, { color: fg, fontSize: 17 }),
                row([button('Copy answer', () => { void copy(); }), button('Append answer to draft', session.append, !session.channel || session.result.length > 1900)])) : null,
            session.notice ? text(session.notice) : null,
            button(setup ? 'Hide AI setup' : 'AI setup', () => setSetup(!setup)),
            setup ? h(RN.View, null,
                text('AI solve uses Gemini Nano on your Android device. No API key, cloud AI endpoint or paid API account is used. A small Math Nano companion app is required because the AI permission cannot be added by a Valenced plugin ZIP.'),
                text('Install the Math Nano companion APK from this repository, then fully restart Discord after installing the updated plugin ZIP. Open Nano setup to check your device and prepare/download the model. Initial model setup needs internet and storage. Keep the Nano screen open while solving; the answer returns here.'),
                text('Nano device status: ' + session.nanoAvailability),
                row([button('Open Nano setup', () => { void runNano(session, true); }, session.busy),
                    button(session.settings.steps ? 'Working steps: ON' : 'Working steps: OFF', () => save('steps', !session.settings.steps), session.busy)])) : null,
            text('Scientific: powers, roots, factorials, percentages, sin/cos/tan, inverse and hyperbolic trig, logs, ncr(n,r), npr(n,r), root(n,x), mod(a,b), abs, floor, ceil, round. Examples: 2(3+4), sin(30), 5!, 1e-3. Percent is division by 100.'),
            session.history.length ? text('Recent answers (this session)', { color: fg, fontWeight: '700' }) : null,
            ...session.history.map((entry, i) => text(entry.question.slice(0, 120) + ' = ' + entry.result.slice(0, 300), { fontSize: 13 })),
            session.history.length ? button('Clear recent answers', () => { session.history = []; changed(); }) : null);
    }
    function SettingsComponent({ api }) { return api.unscoped.react.React.createElement(Panel, { api, session: current }); }
    return { default: { jsonStorage: { load: true, default: { ...DEFAULTS } }, start, stop() { stop(current); }, SettingsComponent } };
})()

