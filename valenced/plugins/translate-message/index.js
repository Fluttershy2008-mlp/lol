(() => {
/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2023 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

/*
To generate:
- Visit https://translate.google.com/?sl=auto&tl=en&op=translate
- Open Language dropdown
- Open Devtools and use the element picker to pick the root of the language picker
- Right click on the element in devtools and click "Store as global variable"

copy(Object.fromEntries(
    Array.from(
        temp1.querySelectorAll("[data-language-code]"),
        e => [e.dataset.languageCode, e.children[1].textContent]
    ).sort((a, b) => a[1] === "Detect language" ? -1 : b[1] === "Detect language" ? 1 : a[1].localeCompare(b[1]))
))
*/

                                                          
                                                        
                                                      

const GoogleLanguages = {
    "auto": "Detect language",
    "af": "Afrikaans",
    "sq": "Albanian",
    "am": "Amharic",
    "ar": "Arabic",
    "hy": "Armenian",
    "as": "Assamese",
    "ay": "Aymara",
    "az": "Azerbaijani",
    "bm": "Bambara",
    "eu": "Basque",
    "be": "Belarusian",
    "bn": "Bengali",
    "bho": "Bhojpuri",
    "bs": "Bosnian",
    "bg": "Bulgarian",
    "ca": "Catalan",
    "ceb": "Cebuano",
    "ny": "Chichewa",
    "zh-CN": "Chinese (Simplified)",
    "zh-TW": "Chinese (Traditional)",
    "co": "Corsican",
    "hr": "Croatian",
    "cs": "Czech",
    "da": "Danish",
    "dv": "Dhivehi",
    "doi": "Dogri",
    "nl": "Dutch",
    "en": "English",
    "eo": "Esperanto",
    "et": "Estonian",
    "ee": "Ewe",
    "tl": "Filipino",
    "fi": "Finnish",
    "fr": "French",
    "fy": "Frisian",
    "gl": "Galician",
    "ka": "Georgian",
    "de": "German",
    "el": "Greek",
    "gn": "Guarani",
    "gu": "Gujarati",
    "ht": "Haitian Creole",
    "ha": "Hausa",
    "haw": "Hawaiian",
    "iw": "Hebrew",
    "hi": "Hindi",
    "hmn": "Hmong",
    "hu": "Hungarian",
    "is": "Icelandic",
    "ig": "Igbo",
    "ilo": "Ilocano",
    "id": "Indonesian",
    "ga": "Irish",
    "it": "Italian",
    "ja": "Japanese",
    "jw": "Javanese",
    "kn": "Kannada",
    "kk": "Kazakh",
    "km": "Khmer",
    "rw": "Kinyarwanda",
    "gom": "Konkani",
    "ko": "Korean",
    "kri": "Krio",
    "ku": "Kurdish (Kurmanji)",
    "ckb": "Kurdish (Sorani)",
    "ky": "Kyrgyz",
    "lo": "Lao",
    "la": "Latin",
    "lv": "Latvian",
    "ln": "Lingala",
    "lt": "Lithuanian",
    "lg": "Luganda",
    "lb": "Luxembourgish",
    "mk": "Macedonian",
    "mai": "Maithili",
    "mg": "Malagasy",
    "ms": "Malay",
    "ml": "Malayalam",
    "mt": "Maltese",
    "mi": "Maori",
    "mr": "Marathi",
    "mni-Mtei": "Meiteilon (Manipuri)",
    "lus": "Mizo",
    "mn": "Mongolian",
    "my": "Myanmar (Burmese)",
    "ne": "Nepali",
    "no": "Norwegian",
    "or": "Odia (Oriya)",
    "om": "Oromo",
    "ps": "Pashto",
    "fa": "Persian",
    "pl": "Polish",
    "pt": "Portuguese",
    "pa": "Punjabi",
    "qu": "Quechua",
    "ro": "Romanian",
    "ru": "Russian",
    "sm": "Samoan",
    "sa": "Sanskrit",
    "gd": "Scots Gaelic",
    "nso": "Sepedi",
    "sr": "Serbian",
    "st": "Sesotho",
    "sn": "Shona",
    "sd": "Sindhi",
    "si": "Sinhala",
    "sk": "Slovak",
    "sl": "Slovenian",
    "so": "Somali",
    "es": "Spanish",
    "su": "Sundanese",
    "sw": "Swahili",
    "sv": "Swedish",
    "tg": "Tajik",
    "ta": "Tamil",
    "tt": "Tatar",
    "te": "Telugu",
    "th": "Thai",
    "ti": "Tigrinya",
    "ts": "Tsonga",
    "tr": "Turkish",
    "tk": "Turkmen",
    "ak": "Twi",
    "uk": "Ukrainian",
    "ur": "Urdu",
    "ug": "Uyghur",
    "uz": "Uzbek",
    "vi": "Vietnamese",
    "cy": "Welsh",
    "xh": "Xhosa",
    "yi": "Yiddish",
    "yo": "Yoruba",
    "zu": "Zulu"
}         ;

const DeeplLanguages = {
    "": "Detect language",
    "ace": "Acehnese",
    "af": "Afrikaans",
    "sq": "Albanian",
    "ar": "Arabic",
    "an": "Aragonese",
    "hy": "Armenian",
    "as": "Assamese",
    "ay": "Aymara",
    "az": "Azerbaijani",
    "ba": "Bashkir",
    "eu": "Basque",
    "be": "Belarusian",
    "bn": "Bengali",
    "bho": "Bhojpuri",
    "bs": "Bosnian",
    "br": "Breton",
    "bg": "Bulgarian",
    "my": "Burmese",
    "yue": "Cantonese",
    "ca": "Catalan",
    "ceb": "Cebuano",
    "zh-hans": "Chinese (Simplified)",
    "zh-hant": "Chinese (Traditional)",
    "hr": "Croatian",
    "cs": "Czech",
    "da": "Danish",
    "prs": "Dari",
    "nl": "Dutch",
    "en-us": "English (American)",
    "en-gb": "English (British)",
    "eo": "Esperanto",
    "et": "Estonian",
    "fi": "Finnish",
    "fr": "French",
    "gl": "Galician",
    "ka": "Georgian",
    "de": "German",
    "el": "Greek",
    "gn": "Guarani",
    "gu": "Gujarati",
    "ht": "Haitian Creole",
    "ha": "Hausa",
    "he": "Hebrew",
    "hi": "Hindi",
    "hu": "Hungarian",
    "is": "Icelandic",
    "ig": "Igbo",
    "id": "Indonesian",
    "ga": "Irish",
    "it": "Italian",
    "ja": "Japanese",
    "jv": "Javanese",
    "ko": "Korean",
    "pam": "Kapampangan",
    "kk": "Kazakh",
    "kmr": "Kurdish (Kurmanji)",
    "ckb": "Kurdish (Sorani)",
    "ky": "Kyrgyz",
    "lo": "Lao",
    "la": "Latin",
    "lv": "Latvian",
    "ln": "Lingala",
    "lt": "Lithuanian",
    "lmo": "Lombard",
    "lb": "Luxembourgish",
    "mk": "Macedonian",
    "mai": "Maithili",
    "mg": "Malagasy",
    "ms": "Malay",
    "ml": "Malayalam",
    "mt": "Maltese",
    "mi": "Maori",
    "mr": "Marathi",
    "mn": "Mongolian",
    "ne": "Nepali",
    "nb": "Norwegian (Bokmål)",
    "oc": "Occitan",
    "om": "Oromo",
    "pag": "Pangasinan",
    "ps": "Pashto",
    "fa": "Persian",
    "pl": "Polish",
    "pt-br": "Portuguese (Brazilian)",
    "pt-pt": "Portuguese (European)",
    "pa": "Punjabi",
    "qu": "Quechua",
    "ro": "Romanian",
    "ru": "Russian",
    "sm": "Samoan",
    "sa": "Sanskrit",
    "gd": "Scottish Gaelic",
    "sr": "Serbian",
    "st": "Sesotho",
    "sn": "Shona",
    "scn": "Sicilian",
    "sd": "Sindhi",
    "si": "Sinhala",
    "sk": "Slovak",
    "sl": "Slovenian",
    "so": "Somali",
    "es": "Spanish",
    "es-419": "Spanish (Latin American)",
    "su": "Sundanese",
    "sw": "Swahili",
    "sv": "Swedish",
    "tl": "Tagalog",
    "tg": "Tajik",
    "ta": "Tamil",
    "tt": "Tatar",
    "te": "Telugu",
    "th": "Thai",
    "ti": "Tigrinya",
    "ts": "Tsonga",
    "tn": "Tswana",
    "tr": "Turkish",
    "tk": "Turkmen",
    "uk": "Ukrainian",
    "ur": "Urdu",
    "ug": "Uyghur",
    "uz": "Uzbek",
    "vi": "Vietnamese",
    "cy": "Welsh",
    "wo": "Wolof",
    "xh": "Xhosa",
    "yi": "Yiddish",
    "yo": "Yoruba",
    "zu": "Zulu"
}         ;

function deeplLanguageToGoogleLanguage(language        ) {
    switch (language) {
        case "": return "auto";
        case "nb": return "no";
        case "zh-hans": return "zh-CN";
        case "zh-hant": return "zh-TW";
        case "en-us":
        case "en-gb":
            return "en";
        case "pt-br":
        case "pt-pt":
            return "pt";
        default:
            return language;
    }
}

// Generated using:
// curl https://translate.kagi.com/api/list-languages | jq 'map({(.language | ascii_downcase): .name}) | add | to_entries | sort_by(.value) | from_entries'
// Add "auto": "Detect language", as Kagi has no "language" for Detect Language, however anything not
// in the list will work as auto. Using "auto" will have this work using Google Translate defaults.
// Retrieved 2026-05-02. Meme languages and redundant entries removed.
const KagiLanguages = {
    "auto": "Detect language",
    "om": "(Afan)/Oromoor/Oriya",
    "ab": "Abkhazian",
    "ace": "Acehnese",
    "ach": "Acholi",
    "aa": "Afar",
    "af": "Afrikaans",
    "ak": "Akan",
    "sq": "Albanian",
    "alz": "Alur",
    "am": "Amharic",
    "ar": "Arabic",
    "an": "Aragonese",
    "hy": "Armenian",
    "as": "Assamese",
    "av": "Avaric",
    "ae": "Avestan",
    "ava": "Awadhi",
    "ay": "Aymara",
    "az": "Azerbaijani",
    "ban": "Balinese",
    "bal": "Baluchi",
    "bm": "Bambara",
    "bci": "Baoulé",
    "ba": "Bashkir",
    "eu": "Basque",
    "btk": "Batak",
    "bar": "Bavarian",
    "be": "Belarusian",
    "bem": "Bemba",
    "bn": "Bengali",
    "bew": "Betawi",
    "bho": "Bhojpuri",
    "dz": "Bhutani",
    "bh": "Bihari",
    "bcl": "Bikol",
    "bi": "Bislama",
    "bs": "Bosnian",
    "br": "Breton",
    "bg": "Bulgarian",
    "my": "Burmese",
    "bua": "Buryat",
    "km": "Cambodian",
    "yue": "Cantonese",
    "ca": "Catalan",
    "ceb": "Cebuano",
    "ch": "Chamorro",
    "ce": "Chechen",
    "chr": "Cherokee",
    "ny": "Chichewa",
    "zh_cn": "Chinese (Simplified)",
    "zh_tw": "Chinese (Traditional)",
    "cu": "Church Slavonic",
    "chk": "Chuukese",
    "cv": "Chuvash",
    "kw": "Cornish",
    "co": "Corsican",
    "cr": "Cree",
    "crh": "Crimean Tatar",
    "hr": "Croatian",
    "cs": "Czech",
    "da": "Danish",
    "din": "Dinka",
    "div": "Divehi",
    "doi": "Dogri",
    "dov": "Dombe",
    "nl": "Dutch",
    "dyu": "Dyula",
    "en_gb": "English (UK)",
    "en_us": "English (US)",
    "eo": "Esperanto",
    "et": "Estonian",
    "ee": "Ewe",
    "fo": "Faroese",
    "fj": "Fiji",
    "fil": "Filipino",
    "fi": "Finnish",
    "fon": "Fon",
    "fr": "French",
    "fy": "Frisian",
    "fur": "Friulian",
    "ff": "Fulah",
    "gaa": "Ga",
    "gl": "Galician",
    "lg": "Ganda",
    "ka": "Georgian",
    "de": "German",
    "hac": "Gorani (Hawrami)",
    "el": "Greek",
    "kl": "Greenlandic",
    "gn": "Guarani",
    "gu": "Gujarati",
    "ht": "Haitian",
    "ha": "Hausa",
    "haw": "Hawaiian",
    "he": "Hebrew",
    "hz": "Herero",
    "hil": "Hiligaynon",
    "hi": "Hindi",
    "ho": "Hiri Motu",
    "hu": "Hungarian",
    "hrx": "Hunsrik",
    "iba": "Iban",
    "is": "Icelandic",
    "io": "Ido",
    "ig": "Igbo",
    "ilo": "Ilocano",
    "id": "Indonesian",
    "ia": "Interlingua",
    "ie": "Interlingue",
    "iu": "Inuktitut",
    "ik": "Inupiak",
    "ga": "Irish Gaelic",
    "it": "Italian",
    "jam": "Jamaican Patois",
    "ja": "Japanese",
    "jv": "Javanese",
    "cpe": "Jingpo",
    "kn": "Kannada",
    "kr": "Kanuri",
    "ks": "Kashmiri",
    "kk": "Kazakh",
    "kha": "Khasi",
    "ki": "Kikuyu",
    "rw": "Kinyarwanda",
    "ky": "Kirghiz",
    "rn": "Kirundi",
    "ktu": "Kituba",
    "kv": "Komi",
    "kg": "Kongo",
    "kok": "Konkani",
    "ko": "Korean",
    "kj": "Kuanyama",
    "ku": "Kurdish (Kurmanji)",
    "ckb": "Kurdish (Sorani)",
    "sdh": "Kurdish (Xwarin)",
    "lo": "Laothian",
    "ltg": "Latgalian",
    "la": "Latin",
    "lv": "Latvian",
    "lij": "Ligurian",
    "li": "Limburgan",
    "lim": "Limburgish",
    "ln": "Lingala",
    "lt": "Lithuanian",
    "lmo": "Lombard",
    "lu": "Luba_Katanga",
    "luo": "Luo",
    "lb": "Luxembourgish",
    "mk": "Macedonian",
    "mad": "Madurese",
    "mai": "Maithili",
    "mak": "Makassar",
    "mg": "Malagasy",
    "ms": "Malay",
    "ml": "Malayalam",
    "mt": "Maltese",
    "gv": "Manx Gaelic",
    "mi": "Maori",
    "mr": "Marathi",
    "mh": "Marshallese",
    "mwr": "Marwadi",
    "mo": "Moldavian",
    "mn": "Mongolian",
    "cnr": "Montenegrin",
    "nqo": "NKo",
    "nhe": "Nahuatl",
    "na": "Nauru",
    "nv": "Navajo",
    "ndc": "Ndau",
    "ng": "Ndonga",
    "new": "Nepalbhasa",
    "ne": "Nepali",
    "nd": "North Ndebele",
    "se": "Northern Sami",
    "ns": "Northern Sotho",
    "no": "Norwegian",
    "nb": "Norwegian (Bokmål)",
    "nn": "Norwegian (Nynorsk)",
    "nus": "Nuer",
    "oc": "Occitan",
    "oj": "Ojibwa",
    "or": "Oriya",
    "os": "Ossetian",
    "pi": "Pali",
    "pag": "Pangasinan",
    "pap": "Papiamento",
    "ps": "Pashto/Pushto",
    "fa": "Persian",
    "pl": "Polish",
    "pt_br": "Portuguese (Brazil)",
    "pt_pt": "Portuguese (Portugal)",
    "pa": "Punjabi",
    "qu": "Quechua",
    "kek": "Qʼeqchiʼ",
    "rm": "Rhaeto_Romanic",
    "rom": "Romani",
    "ro": "Romanian",
    "ru": "Russian",
    "sm": "Samoan",
    "sg": "Sangro",
    "sa": "Sanskrit",
    "sat": "Santali",
    "sc": "Sardinian",
    "sco": "Scots",
    "gd": "Scottish Gaelic",
    "sr": "Serbian",
    "sh": "Serbo_Croatian",
    "st": "Sesotho",
    "seto": "Seto",
    "shn": "Shan",
    "sn": "Shona",
    "ii": "Sichuan Yi",
    "scn": "Sicilian",
    "szl": "Silesian",
    "sd": "Sindhi",
    "si": "Sinhalese",
    "ss": "Siswati",
    "sk": "Slovak",
    "sl": "Slovenian",
    "so": "Somali",
    "sb": "Sorbian",
    "nr": "South Ndebele",
    "sma": "Southern Sami",
    "es": "Spanish",
    "su": "Sundanese",
    "sus": "Susu",
    "sx": "Sutu",
    "sw": "Swahili",
    "sv": "Swedish",
    "gsw": "Swiss German",
    "syr": "Syriac",
    "tl": "Tagalog",
    "ty": "Tahitian",
    "tg": "Tajik",
    "ta": "Tamil",
    "tt": "Tatar",
    "te": "Telugu",
    "tet": "Tetum",
    "th": "Thai",
    "bo": "Tibetan",
    "ti": "Tigrinya",
    "tiv": "Tiv",
    "tpi": "Tok Pisin",
    "to": "Tonga",
    "ts": "Tsonga",
    "tn": "Tswana",
    "tum": "Tumbuka",
    "tr": "Turkish",
    "tk": "Turkmen",
    "tyv": "Tuvan",
    "tw": "Twi",
    "udm": "Udmurt",
    "ug": "Uighur",
    "uk": "Ukrainian",
    "ur": "Urdu",
    "uz": "Uzbek",
    "ve": "Venda",
    "vec": "Venetian",
    "vi": "Vietnamese",
    "vo": "Volapuk",
    "vro": "Võro",
    "wa": "Walloon",
    "war": "Waray",
    "cy": "Welsh",
    "wo": "Wolof",
    "xh": "Xhosa",
    "sah": "Yakut",
    "yi": "Yiddish",
    "yo": "Yoruba",
    "yua": "Yucatec Maya",
    "zap": "Zapotec",
    "diq": "Zazaki",
    "za": "Zhuang",
    "zu": "Zulu"
}         ;



// SPDX-License-Identifier: GPL-3.0-or-later
// Vencord incoming translation settings and message selection adapted for Valenced.
// The v1 session/cancellation utilities were originally MIT licensed.
'use strict';

// Vencord language settings adapted to Valenced, with v1 preferences migrated.
const LANGUAGES = Object.freeze(Object.entries(GoogleLanguages).filter(([code]) => code !== 'auto').map(Object.freeze));
const DEFAULTS = Object.freeze({
    receivedInput: 'auto', receivedOutput: 'en', sentInput: 'auto', sentOutput: 'en',
    service: 'google', deeplApiKey: '', kagiSession: '', autoTranslate: false,
    showAutoTranslateTooltip: true, showToasts: true, displayMode: 'replace',
});
function languageTable(service = 'google') {
    return service === 'kagi' ? KagiLanguages : service.startsWith('deepl') ? DeeplLanguages : GoogleLanguages;
}
function languageName(code, service = 'google') {
    const table = languageTable(service), lowered = String(code ?? '').toLowerCase();
    return table[code] ?? table[lowered] ?? GoogleLanguages[lowered] ?? (lowered === 'en' ? 'English' : lowered === 'zh' ? 'Chinese' : String(code ?? 'Unknown language'));
}
function normalizeSettings(value) {
    value ??= {};
    const service = ['google', 'deepl', 'deepl-pro', 'kagi'].includes(value.service) ? value.service : 'google';
    const table = languageTable(service), deep = service.startsWith('deepl');
    const defaults = { ...DEFAULTS, service,
        receivedInput: deep ? '' : 'auto', sentInput: deep ? '' : 'auto',
        receivedOutput: deep ? 'en-us' : service === 'kagi' ? 'en_us' : 'en',
        sentOutput: deep ? 'en-us' : service === 'kagi' ? 'en_us' : 'en' };
    const result = { ...defaults };
    for (const key of ['receivedInput', 'receivedOutput', 'sentInput', 'sentOutput']) {
        const candidate = value[key] ?? (key === 'receivedOutput' ? value.target : undefined);
        if (typeof candidate === 'string' && Object.prototype.hasOwnProperty.call(table, candidate)
            && (key.endsWith('Input') || (candidate !== 'auto' && candidate !== ''))) result[key] = candidate;
    }
    for (const key of ['autoTranslate', 'showAutoTranslateTooltip', 'showToasts'])
        if (typeof value[key] === 'boolean') result[key] = value[key];
    for (const key of ['deeplApiKey', 'kagiSession'])
        if (typeof value[key] === 'string') result[key] = value[key].trim().slice(0, 4096);
    // Always use the v1.0.2 inline display, including saved v2.0.0 preferences.
    result.displayMode = 'replace';
    return result;
}
// Adapted from Vencord Translate/index.tsx getMessageContent.
function getMessageContent(message) {
    return message?.content || message?.messageSnapshots?.[0]?.message?.content
        || message?.message_snapshots?.[0]?.message?.content
        || message?.embeds?.find(embed => embed.type === 'auto_moderation_message')?.rawDescription || '';
}
const refKey = ref => ref.channelId + ':' + ref.messageId;
const validId = value => typeof value === 'string' && /^\d{16,22}$/.test(value);
const cancelled = () => Object.assign(new Error('Cancelled'), { code: 'CANCELLED' });
const failure = (code, message) => Object.assign(new Error(message), { code });

function abortController(env) {
    if (typeof env.AbortController === 'function') return new env.AbortController();
    const subscribers = new Set();
    const signal = { aborted: false,
        addEventListener(type, fn) { if (type === 'abort') subscribers.add(fn); },
        removeEventListener(type, fn) { if (type === 'abort') subscribers.delete(fn); } };
    return { signal, abort() {
        if (signal.aborted) return;
        signal.aborted = true;
        for (const notify of [...subscribers]) notify();
        subscribers.clear();
    } };
}

// Keep code, spoilers, mentions, emoji IDs and link destinations byte-for-byte.
// The service only receives ordinary message text and opaque placeholders.
function protectText(text) {
    let prefix = '__VLT_';
    while (text.includes(prefix)) prefix += 'X';
    const values = [];
    const pattern = /```[\s\S]*?(?:```|$)|`+[^`\n]*`+|\|\|[\s\S]*?(?:\|\||$)|<(?:(?:@!?|@&|#)\d+|a?:[A-Za-z0-9_]+:\d+|t:\d+(?::[A-Za-z])?|https?:\/\/[^>]+)>|https?:\/\/[^\s<>\])]+|\]\([^\n)]*\)|@(?:everyone|here|silent)\b/g;
    const protectedText = text.replace(pattern, value => {
        const token = prefix + values.length + '__';
        values.push({ token, value });
        return token;
    });
    return {
        text: protectedText,
        hasProse: /[\p{L}\p{N}]/u.test(protectedText.replace(new RegExp(prefix + '\\d+__', 'g'), '')),
        restore(translated) {
            for (const { token } of values) {
                if (translated.split(token).length !== 2)
                    throw failure('FORMATTING', 'Translation could not preserve the message formatting. Original kept.');
            }
            let result = translated;
            for (const { token, value } of values) result = result.replace(token, () => value);
            return result;
        },
    };
}

function splitText(text, max = 1100) {
    const chunks = [];
    while (text.length > max) {
        let end = max;
        // Never split a surrogate pair or a placeholder.
        if (/[\uD800-\uDBFF]/.test(text[end - 1])) end--;
        const marker = text.lastIndexOf('__VLT_', end);
        if (marker >= 0 && text.indexOf('__', marker + 6) + 2 > end) end = marker;
        let boundary = -1;
        for (let i = end - 1; i >= Math.floor(end / 2); i--) {
            if (/\s/.test(text[i])) { boundary = i + 1; break; }
        }
        if (boundary > 0) end = boundary;
        if (!end) throw failure('LENGTH', 'This message contains an unusually long protected section.');
        chunks.push(text.slice(0, end)); text = text.slice(end);
    }
    if (text) chunks.push(text);
    return chunks;
}

function createController(io, env = globalThis) {
    const entries = new Map(), pending = new Map(), cache = new Map();
    let active = true, disposing = false, account = io.account(), settings = normalizeSettings(io.settings);
    const emit = () => io.changed?.();
    const tell = (message, important = false) => { if (active && (important || settings.showToasts)) io.notify(message); };
    function reset() {
        for (const operation of pending.values()) operation.cancel();
        pending.clear(); entries.clear(); cache.clear(); emit();
    }
    function live() {
        if (!active) return false;
        const next = io.account();
        if (next !== account) { reset(); account = next; }
        return Boolean(account);
    }
    const read = ref => { try { return io.message(ref); } catch { return undefined; } };
    function entryFor(ref) {
        const key = refKey(ref), entry = entries.get(key);
        if (entry && read(ref)?.content !== entry.text) { entries.delete(key); emit(); return undefined; }
        return entry;
    }
    function invalidate(key) {
        pending.get(key)?.cancel(); pending.delete(key); entries.delete(key);
    }
    async function revert(ref, announce = true) {
        if (!live()) return false;
        const key = refKey(ref), busy = pending.has(key), entry = entryFor(ref);
        pending.get(key)?.cancel(); pending.delete(key);
        if (!entry) {
            emit();
            if (announce) tell(busy ? 'Translation cancelled.' : 'This message is already showing its original text.');
            return busy;
        }
        try {
            await io.display(ref, entry.original);
            if (read(ref)?.content !== entry.original) throw failure('DISPLAY', 'Could not restore this message. Reopen the channel to refresh it.');
            if (entries.get(key) === entry) entries.delete(key);
            emit();
            if (announce) tell('Original message restored.');
            return true;
        } catch (error) {
            if (announce) tell(error.code === 'DISPLAY' ? error.message : 'Could not restore this message. Reopen the channel to refresh it.', true);
            return false;
        }
    }
    async function translate(ref) {
        if (disposing || !live()) return false;
        const key = refKey(ref);
        if (pending.has(key)) { tell('This message is already being translated.'); return false; }
        const current = read(ref), previous = entryFor(ref), target = settings.receivedOutput;
        const configKey = settings.service + ':' + settings.receivedInput + ':' + target;
        if (!current || !getMessageContent(current).trim()) { tell('This message has no text to translate.', true); return false; }
        if (pending.size >= 2) { tell('Please wait for your other translations to finish.', true); return false; }
        if (!previous && entries.size >= 100) { tell('Revert some translated messages before translating more.', true); return false; }
        if (previous?.configKey === configKey) { tell('Already translated to ' + languageName(target) + '.'); return true; }
        const original = previous?.originalText ?? getMessageContent(current);
        const originalDisplay = previous?.original ?? current.content ?? '';
        const aborter = abortController(env);
        let wasCancelled = false;
        const operation = { cancel() { wasCancelled = true; aborter?.abort(); } };
        const owner = account, before = current.content ?? '', beforeSource = getMessageContent(current);
        const stillCurrent = () => live() && owner === account && !wasCancelled
            && pending.get(key) === operation && (read(ref)?.content ?? '') === before && getMessageContent(read(ref)) === beforeSource;
        pending.set(key, operation); emit();
        try {
            const cacheKey = configKey + '\0' + original;
            let result = cache.get(cacheKey);
            if (!result) {
                result = await io.translate(original, target, aborter?.signal, { source: settings.receivedInput, service: settings.service, settings: { ...settings } });
                if (!stillCurrent()) return false;
                if (!result || typeof result.text !== 'string' || !result.text.trim()) throw failure('PROVIDER', 'No translation was returned. Original kept.');
                if (cache.size >= 30) cache.delete(cache.keys().next().value);
                cache.set(cacheKey, result);
            }
            if (!stillCurrent()) return false;
            if (result.text === original) {
                pending.delete(key);
                if (previous) await revert(ref, false);
                tell('No change needed. The message may already be in ' + languageName(target) + '.');
                return true;
            }
            const source = result.sourceLanguage ?? languageName(result.source ?? settings.receivedInput, settings.service);
            const display = result.text;
            const entry = { ...ref, original: originalDisplay, originalText: original, translation: result.text, text: display, target, source, configKey };
            entries.set(key, entry);
            try {
                await io.display(ref, display);
                if (!live() || owner !== account || wasCancelled) return false;
                if (read(ref)?.content !== display) {
                    if (entries.get(key) === entry) entries.delete(key);
                    throw failure('DISPLAY', 'This Discord build could not display the translation. Original kept.');
                }
            } catch (error) {
                if (entries.get(key) === entry && read(ref)?.content !== display) entries.delete(key);
                throw error;
            }
            // Match v1.0.2: successful translations are silent.
            return true;
        } catch (error) {
            if (!wasCancelled && live() && owner === account)
                tell(error?.code && error.code !== 'CANCELLED' ? error.message : 'Translation failed. Check your connection and try again.', true);
            return false;
        } finally {
            if (pending.get(key) === operation) pending.delete(key);
            emit();
        }
    }
    async function restoreAll() {
        if (!live()) return;
        for (const operation of pending.values()) operation.cancel();
        pending.clear();
        for (const entry of [...entries.values()]) await revert(entry, false);
        cache.clear(); emit();
    }
    function onEvent(event) {
        if (!active) return event;
        if (['LOGOUT', 'LOGIN_SUCCESS'].includes(event.type)) { reset(); return event; }
        if (!live()) return event;
        const message = event.message;
        const channelId = message?.channel_id ?? message?.channelId ?? event.channelId ?? event.channel_id;
        const messageId = message?.id ?? event.messageId ?? event.id;
        if (event.type === 'MESSAGE_UPDATE' && message && (Object.prototype.hasOwnProperty.call(message, 'content') || message.messageSnapshots || message.message_snapshots || message.embeds?.some(embed => embed.type === 'auto_moderation_message'))) {
            invalidate(channelId + ':' + messageId); emit();
        } else if (event.type === 'MESSAGE_DELETE') {
            invalidate(channelId + ':' + messageId); emit();
        } else if (event.type === 'MESSAGE_DELETE_BULK') {
            for (const id of event.ids ?? event.messageIds ?? []) invalidate(channelId + ':' + id);
            emit();
        } else if (['LOAD_MESSAGES_SUCCESS', 'LOAD_MESSAGES_AROUND_SUCCESS', 'LOAD_RECENT_MESSAGES_SUCCESS'].includes(event.type)) {
            for (const item of Array.isArray(event.messages) ? event.messages : [])
                invalidate((item.channel_id ?? channelId) + ':' + item.id);
            emit();
        } else if (['MESSAGE_START_EDIT', 'MESSAGE_EDIT_START'].includes(event.type)) {
            const ref = { channelId, messageId }, entry = entryFor(ref);
            if (entry) {
                // Keep edit drafts in the original language, including keyboard shortcuts.
                const corrected = { ...event, content: entry.original };
                if (message) corrected.message = { ...message, content: entry.original };
                Promise.resolve().then(() => revert(ref, false));
                return corrected;
            }
        }
        return event;
    }
    return {
        translate, revert, restoreAll, onEvent,
        settings: () => settings,
        configure(value) { settings = normalizeSettings(value); emit(); },
        status(ref) { live(); return { entry: entryFor(ref), pending: pending.has(refKey(ref)) }; },
        stats() { live(); return { translated: entries.size, pending: pending.size, cached: cache.size }; },
        clearCache() { cache.clear(); emit(); },
        async dispose() { if (!active || disposing) return; disposing = true; await restoreAll(); active = false; reset(); },
    };
}


/*
 * Adapted from Vencord Translate/utils.ts and native.ts.
 * Copyright (c) 2023-2026 Vendicated and contributors.
 * SPDX-License-Identifier: GPL-3.0-or-later
 * React Native transport, cancellation and protected markup added for Valenced.
 */
'use strict';

const GOOGLE_TRANSLATE_PUBLIC_KEY = 'AIzaSyDLEeFI5OtFBwYBIoK_jj5m32rZK5CkCXA';
function createVencordTranslator(env = globalThis, notice = () => {}) {
    let quotaNoticed = false;
    async function request(url, options, signal) {
        if (signal?.aborted) throw cancelled();
        if (typeof env.fetch !== 'function') throw failure('NETWORK', 'Translation networking is unavailable.');
        const native = typeof env.AbortController === 'function' ? new env.AbortController() : undefined;
        let timer, abort;
        const stopped = new Promise((_, reject) => {
            abort = () => { native?.abort(); reject(cancelled()); };
            signal?.addEventListener?.('abort', abort, { once: true });
            timer = env.setTimeout(() => {
                native?.abort();
                reject(failure('TIMEOUT', 'Translation timed out. Check your connection and try again.'));
            }, 12000);
        });
        try {
            return await Promise.race([
                (async () => {
                    const response = await env.fetch(url, { credentials: 'omit', ...options,
                        ...(native ? { signal: native.signal } : {}) });
                    const status = Number(response.status);
                    if (status === 429) throw failure('RATE_LIMIT', 'The translation service is busy. Wait a moment and try again.');
                    let data;
                    if (response.ok) {
                        try { data = await response.json(); }
                        catch { throw failure('PROVIDER', 'The translation service returned an unreadable response.'); }
                    }
                    return { ok: response.ok, status, data };
                })(), stopped,
            ]);
        } catch (error) {
            if (signal?.aborted) throw cancelled();
            if (error?.code) throw error;
            throw failure('NETWORK', 'Could not reach the translation service. Check your connection and try again.');
        } finally {
            env.clearTimeout(timer);
            signal?.removeEventListener?.('abort', abort);
        }
    }
    function result(text, source, table) {
        if (typeof text !== 'string' || !text.trim() || text.length > 24000)
            throw failure('PROVIDER', 'The translation service returned an invalid translation.');
        const code = typeof source === 'string' ? source : '';
        const name = table[code] ?? table[code.toLowerCase()] ?? GoogleLanguages[code.toLowerCase()] ?? code;
        return { text, sourceLanguage: String(name || 'Unknown language').replace(/[\r\n<>]/g, '').slice(0, 100) };
    }
    async function googleTranslate(text, sourceLang, targetLang, signal) {
        // These endpoint, parameters and public client key are from Vencord's googleTranslate.
        const params = {
            'params.client': 'gtx', dataTypes: 'TRANSLATION', key: GOOGLE_TRANSLATE_PUBLIC_KEY,
            'query.sourceLanguage': sourceLang, 'query.targetLanguage': targetLang, 'query.text': text,
        };
        const url = 'https://translate-pa.googleapis.com/v1/translate?' + Object.entries(params)
            .map(([key, value]) => encodeURIComponent(key) + '=' + encodeURIComponent(value)).join('&');
        const response = await request(url, { method: 'GET', headers: { Accept: 'application/json' } }, signal);
        if (!response.ok) throw failure('NETWORK', 'Google Translate is unavailable (' + response.status + ').');
        return result(response.data?.translation, response.data?.sourceLanguage, GoogleLanguages);
    }
    function fallbackToGoogle(text, sourceLang, targetLang, signal) {
        return googleTranslate(text, deeplLanguageToGoogleLanguage(sourceLang), deeplLanguageToGoogleLanguage(targetLang), signal);
    }
    async function deeplTranslate(text, sourceLang, targetLang, config, signal) {
        if (!config.deeplApiKey) {
            notice('DeepL API key is not set. Using Google Translate.');
            return fallbackToGoogle(text, sourceLang, targetLang, signal);
        }
        if (/[\r\n]/.test(config.deeplApiKey)) throw failure('AUTH', 'The DeepL API key contains an invalid line break.');
        const url = config.service === 'deepl-pro' ? 'https://api.deepl.com/v2/translate' : 'https://api-free.deepl.com/v2/translate';
        const body = { text: [text], target_lang: targetLang.toUpperCase() };
        // DeepL autodetection is represented by the empty source option in Vencord.
        if (sourceLang) body.source_lang = sourceLang.split('-')[0].toUpperCase();
        const response = await request(url, { method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'DeepL-Auth-Key ' + config.deeplApiKey },
            body: JSON.stringify(body) }, signal);
        if (response.status === 456) {
            if (!quotaNoticed) { notice('DeepL API quota exceeded. Falling back to Google Translate.'); quotaNoticed = true; }
            return fallbackToGoogle(text, sourceLang, targetLang, signal);
        }
        if (response.status === 403) throw failure('AUTH', 'Invalid DeepL API key or Free/Pro selection.');
        if (!response.ok) throw failure('PROVIDER', 'DeepL could not translate this message (' + response.status + ').');
        const first = response.data?.translations?.[0];
        return result(first?.text, first?.detected_source_language, DeeplLanguages);
    }
    async function kagiTranslate(text, sourceLang, targetLang, config, signal) {
        if (!config.kagiSession) throw failure('AUTH', 'Enter your Kagi session token in the plugin settings first.');
        if (/[\r\n;]/.test(config.kagiSession)) throw failure('AUTH', 'The Kagi session token has an invalid format.');
        const response = await request('https://translate.kagi.com/api/translate', {
            method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: 'kagi_session=' + config.kagiSession },
            body: JSON.stringify({ text, from: sourceLang, to: targetLang }),
        }, signal);
        if (response.status === 401) throw failure('AUTH', 'The Kagi session token is invalid or expired.');
        if (!response.ok) throw failure('PROVIDER', 'Kagi could not translate this message (' + response.status + ').');
        return result(response.data?.translation, response.data?.detected_language?.label, KagiLanguages);
    }
    return async function translate(kind, original, values, signal) {
        const config = normalizeSettings(values);
        const source = config[kind === 'sent' ? 'sentInput' : 'receivedInput'];
        const target = config[kind === 'sent' ? 'sentOutput' : 'receivedOutput'];
        if (typeof original !== 'string' || original.length > 8000)
            throw failure('LENGTH', 'This message is too long to translate (maximum 8,000 characters).');
        const protectedMessage = protectText(original);
        if (!protectedMessage.hasProse) {
            if (kind === 'sent') return { text: original, sourceLanguage: languageName(source, config.service) };
            throw failure('NO_TEXT', 'There is no ordinary text to translate in this message.');
        }
        let text = '', sourceLanguage;
        for (const chunk of splitText(protectedMessage.text)) {
            if (signal?.aborted) throw cancelled();
            const [, leading, middle, trailing] = /^(\s*)([\s\S]*?)(\s*)$/.exec(chunk);
            if (!middle) { text += chunk; continue; }
            const part = config.service === 'google' ? await googleTranslate(middle, source, target, signal)
                : config.service === 'kagi' ? await kagiTranslate(middle, source, target, config, signal)
                : await deeplTranslate(middle, source, target, config, signal);
            if (signal?.aborted) throw cancelled();
            text += leading + part.text + trailing;
            sourceLanguage ??= part.sourceLanguage;
        }
        return { text: protectedMessage.restore(text), sourceLanguage: sourceLanguage ?? 'Unknown language' };
    };
}

// Compatibility helper for the v1 transport's test and developer interface.
function createTranslator(env = globalThis) {
    const service = createVencordTranslator(env);
    return async (text, target, signal) => {
        const result = await service('received', text, { receivedOutput: target }, signal);
        return { ...result, source: result.sourceLanguage };
    };
}


// SPDX-License-Identifier: GPL-3.0-or-later
// Vencord TranslateIcon.tsx rasterized for React Native Image; see upstream/SOURCE.json.
const TRANSLATE_ICON_URI = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAYAAADimHc4AAAACXBIWXMAAAsTAAALEwEAmpwYAAAFc0lEQVR4nO2ceahXRRTHj6btaplRpLZIm2TRZoKlGQXRRkliYRRaGSQ8ElpsIbPIigL/KAnaowSDLMIWIyqLihayF0JYUKa0l2llu+Ynhnd/9Lr87j0zv7v97p35wO+vd+fMme+5c2fmzMwTCQQCgUAgEAgEAoGSQSEEJASg2RB6QAiA1xB6QAiA1xB6QAhArd7IpiNVg+dI1eA5UjV4jlQNniNVg+dI1eA5UjV4jgTcABYqmi50NBmwBdgB+E4JwDhrgwE3gIsV8T9yNBlwAehVAnCtk8GAPcAURfwtwD4OJgMuAMuVADzpZDBgDzARnVMcTAZcAFYq4q8GBohvWAjzAzAsYx1nWbz9F4qPAMdbiHNHBvsDgQ8V+18A24uvAC8rAv0B7Neh7VkWAe4Rn7HsBcs6sLtn9AlLY71ZHYvvACssgjDV0ebjFjZnF9eqGgGMBf5SxPoa2M3S3lQL8T8BBhffupoA3GYh2mMWdkYDP1rYOr2cltUEYGdgXZYpIzAYeN3CxrPltq4mAGdbiPcLcFBC+cUW5c2s6sCMft5r4eOuUkdMTsZCxF7TY2LlZmNHpownsCOw0aKeWVJHzEAbTQ81lrXSByaPYzGIG1ZlHXiB87HjTakrwGRgq0UjrwbGA5stnv0zj90u4EXsGSt1xaQgLBq4FdhkKcYVOfg00vLFaHGX1JVoRvMe+fB0HtlO4DrHer+t9VrD7FABX2UUfz0wPCd/1nRQv9MKvusATrAcYNvxK3B0iZs67XhO6g4ws4OGbwPOy9GH+zsMgBkzRkvdsVj8xLkhx7p3UgZ7Mzb8lvL366XuALfg9tZNzrHuC1Lq+hsYATyR8syntd7yBBbQ2fd/SgmbRsujZ85U/DlJPBK/fxAy9QRglDL3nx49NyiadiaxRDwTP5cgAPNJ5mczPvR79h4lCbi7eCZ+f6EmdODDgOj7ncRDsecnkM4c8VD8Fj8Bxzn6cSKO33Xg45TnV0nDxL8JmOcYhPEOvjySYutLYDvHT5bhKGmK+PJfuTnRwssGM58/1sKXXaKNlSRuTyi3v+LLYmmS+LENmX8cgnCMZFt9H55S9i2lF/5vM6n24rcAZkTHzG3YmBYE4LWUsr1J5aKylyt1z5Cair/Awt70aHXacb4eGKN8Rq5UfNhDSSC+Kk168+MAZ0Tzbo0jEsrfnFLGfOZGtisXs/FMio1tWQ8GdK34sRsxaVuVH0jy3P+zlHIvtSvXxs40pU23SlPFbwFMihZh7ZgrbQBOVvy5qF25hNMTm1ynsY0Rv4UZaIENMbtmoN5b3M+UmpTzkHblEmw90FWn88oWvwVwJPB9PIMZBxiq5PWX5LySfkqaLn4L4NCo2xvOlTZYHO46TRyIxpPPU+wl9sRGid8COAB4P+lOgLKAMjfsB0n+h46vcrVZ6Tw/KyniH6zM/dcC93Xwe15p85rGv/k5Ho8violSwc30Ut/8NMx0MLqsVxUPSxFYpoorffMNwKlUi9m1GyoVBKFy8Q3AUqrnUimKhCB0i/jDgN+pnreLbui8bhPfMnVcJodJkUSzokoH3DjAO4oodwOX5fTTrlAtEp8ADlEE2ZznXa/o9k/aPsEGry6OA3cqAXiwgDpfUOqcJj5A30k2c/k7jUkF1HuJUucK8QH0s5xrizhQG21XblF23PaVpkPfLcs05hdY9ytK3TdKkwGGR7cmkzBJuTEF1m/OMaVhUtgDpakAPYoAKwuufy+L25bN/R929F3YTmNmCT68ofiwVJoIMM4iMTakBD/mKn6Y9cIIaRrAIqXhj5bkxyiL86w9TZz7f9MtV4mAdxVfVkuTAM5RGryuzNkHcA066knuQCAQCAQCgUAgII3mX2WUjAtfpUQiAAAAAElFTkSuQmCC";

/*
 * React Native adaptation of Vencord TranslateModal.tsx, settings.tsx and TranslateIcon.tsx.
 * Copyright (c) 2023-2026 Vendicated and contributors.
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
'use strict';

function TranslationSettingsView({ api, getSession, subscribe, save, compact = false, onClose }) {
    const U = api.unscoped, { React, ReactNative: RN } = U.react, h = React.createElement;
    const [, refresh] = React.useState(0);
    const [picker, setPicker] = React.useState(null), [query, setQuery] = React.useState('');
    const [deepKey, setDeepKey] = React.useState(api.jsonStorage.cache?.deeplApiKey ?? '');
    const [kagiToken, setKagiToken] = React.useState(api.jsonStorage.cache?.kagiSession ?? '');
    const optional = fn => { try { return fn(); } catch { return undefined; } };
    const scheme = RN.useColorScheme?.(), theme = optional(() => U.discord.flux.Stores.ThemeStore.theme);
    const light = theme ? theme === 'light' : scheme === 'light';
    const C = light
        ? { bg: '#F3F3F7', card: '#FFFFFF', text: '#20212B', muted: '#656775', line: '#E6E5EE', accent: '#6750C8', soft: '#EEE9FF' }
        : { bg: '#18191F', card: '#25262E', text: '#F3F2F7', muted: '#B0AFBF', line: '#383842', accent: '#B5A4FF', soft: '#383049' };
    React.useEffect(() => {
        let mounted = true;
        const update = () => { if (mounted) refresh(value => value + 1); };
        const remove = subscribe(update), removeStorage = api.jsonStorage.subscribe?.(update);
        Promise.resolve(api.jsonStorage.loaded ? api.jsonStorage.cache : api.jsonStorage.get()).then(update).catch(() => {});
        return () => { mounted = false; remove?.(); removeStorage?.(); };
    }, [api]);
    const session = getSession(), config = session?.controller.settings() ?? normalizeSettings(api.jsonStorage.cache);
    const stats = session?.controller.stats() ?? { translated: 0, pending: 0, cached: 0 };
    const outgoing = session?.outgoing;
    const recoveries = outgoing?.recoveries() ?? [];
    const openPicker = key => { setQuery(''); setPicker(key); };
    const text = (value, style = {}, props = {}) => h(RN.Text, { ...props, style: { color: C.text, fontSize: 16, ...style } }, value);
    const detail = value => text(value, { color: C.muted, fontSize: 13, lineHeight: 19, marginTop: 4 });
    const card = (key, ...children) => h(RN.View, { key, style: { backgroundColor: C.card, borderRadius: 18, marginBottom: 16, overflow: 'hidden' } }, ...children);
    const line = key => h(RN.View, { key, style: { height: 1, marginHorizontal: 18, backgroundColor: C.line } });
    function row(key, label, description, press, trailing, disabled = false) {
        return h(RN.Pressable, { key, onPress: press, disabled,
            accessibilityRole: press ? 'button' : undefined,
            accessibilityLabel: description ? label + '. ' + description : label,
            accessibilityState: { disabled },
            style: ({ pressed }) => ({ padding: 17, flexDirection: 'row', alignItems: 'center', opacity: disabled ? 0.45 : pressed ? 0.65 : 1 }),
        }, h(RN.View, { style: { flex: 1, marginRight: 12 } }, text(label, { fontWeight: '600' }), description ? detail(description) : null), trailing);
    }
    const switchRow = (key, label, description, value, change, disabled = false) => row(key, label, description, undefined,
        h(RN.Switch, { value, disabled, onValueChange: change, accessibilityLabel: label,
            trackColor: { false: C.line, true: '#7963CD' } }), disabled);
    const definitions = [
        ['receivedInput', 'Incoming messages from'], ['receivedOutput', 'Incoming messages to'],
        ['sentInput', 'Your messages from'], ['sentOutput', 'Your messages to'],
    ];
    const providers = [ ['google', 'Google Translate'], ['deepl', 'DeepL Free'], ['deepl-pro', 'DeepL Pro'], ['kagi', 'Kagi Translate'] ];
    const providerName = providers.find(([id]) => id === config.service)?.[1] ?? 'Google Translate';
    const sections = [];
    sections.push(card('languages', ...definitions.flatMap(([key, label], i) => [
        ...(i ? [line(key + '-line')] : []),
        row(key, label, languageName(config[key], config.service), () => openPicker(key), text('⌄', { color: C.accent, fontSize: 22 })),
    ])));
    sections.push(card('auto',
        switchRow('autoTranslate', 'Auto Translate', 'Automatically translate your messages before sending. Tap the chat-bar Translate button to toggle. Hold it to open settings.',
            config.autoTranslate, value => save({ autoTranslate: value }), Boolean(session && !session.outgoingConnected)),
        line('auto-line'), switchRow('tooltip', 'Auto-translation notice', 'Briefly show the target language after an outgoing translation.',
            config.showAutoTranslateTooltip, value => save({ showAutoTranslateTooltip: value })),
        !session?.outgoingConnected ? h(RN.View, { key: 'waiting', style: { padding: 17, paddingTop: 0 } }, detail('Open a chat to connect outgoing translation.')) : null));
    sections.push(card('provider', row('service', 'Translation provider', providerName, () => openPicker('service'), text('⌄', { color: C.accent, fontSize: 22 })),
        config.service.startsWith('deepl') ? h(RN.View, { key: 'deepl-key', style: { padding: 17, paddingTop: 0 } },
            detail('DeepL API key · stored in this plugin’s local settings'),
            h(RN.TextInput, { value: deepKey, onChangeText: setDeepKey, secureTextEntry: true,
                accessibilityLabel: 'DeepL API key', placeholder: 'Enter your DeepL API key', placeholderTextColor: C.muted,
                autoCapitalize: 'none', autoCorrect: false,
                onBlur: () => save({ deeplApiKey: deepKey }), onSubmitEditing: () => save({ deeplApiKey: deepKey }),
                style: { color: C.text, borderColor: C.line, borderWidth: 1, borderRadius: 10, padding: 12, marginTop: 10 } }),
            detail('As in Vencord, a missing key or exhausted DeepL quota falls back to Google Translate.')) : null,
        config.service === 'kagi' ? h(RN.View, { key: 'kagi-key', style: { padding: 17, paddingTop: 0 } },
            detail('Kagi session token · stored in this plugin’s local settings'),
            h(RN.TextInput, { value: kagiToken, onChangeText: setKagiToken, secureTextEntry: true,
                accessibilityLabel: 'Kagi session token', placeholder: 'Enter your Kagi session token', placeholderTextColor: C.muted,
                autoCapitalize: 'none', autoCorrect: false,
                onBlur: () => save({ kagiSession: kagiToken }), onSubmitEditing: () => save({ kagiSession: kagiToken }),
                style: { color: C.text, borderColor: C.line, borderWidth: 1, borderRadius: 10, padding: 12, marginTop: 10 } })) : null));
    sections.push(card('incoming-options',
        switchRow('feedback', 'Message translation notices', 'Brief notices when restoring originals or when no translation is needed. Successful translations are silent.',
            config.showToasts, value => save({ showToasts: value }))));
    sections.push(card('session', row('count', 'This session', stats.translated + ' translated · ' + (stats.pending + (outgoing?.count() ?? 0)) + ' in progress'),
        line('restore-line'), row('restore', 'Revert all messages', 'Restore incoming messages and cancel pending incoming translations.',
            () => session?.controller.restoreAll(), text('↶', { color: C.accent, fontSize: 25 }), !session || (!stats.translated && !stats.pending)),
        line('cache-line'), row('cache', 'Clear translation cache', stats.cached + ' incoming results kept in memory.',
            () => session?.controller.clearCache(), undefined, !session || !stats.cached)));
    if (recoveries.length) sections.push(card('recoveries',
        h(RN.View, { style: { padding: 17 } }, text('Unsent originals', { fontWeight: '700' }), detail('These messages were not sent because outgoing translation stopped. Select the text to copy it.')),
        ...recoveries.map((item, index) => h(RN.View, { key: index, style: { padding: 17, paddingTop: 0 } },
            text(item.content, { lineHeight: 23 }, { selectable: true }),
            h(RN.Pressable, { onPress: () => outgoing.forgetRecovery(index), accessibilityRole: 'button', accessibilityLabel: 'Dismiss unsent original', style: { paddingVertical: 10 } }, text('Dismiss', { color: C.accent }))))));
    if (!compact) sections.push(card('about', h(RN.View, { style: { padding: 17 } },
        text('Vencord Translate, on mobile', { fontWeight: '700', marginBottom: 8 }),
        detail('The language tables, provider requests, four language controls and outgoing auto-translation are ported from Vendicated/Vencord. The desktop modal and chat button are adapted to native mobile controls.'),
        text('Hold a received message', { fontWeight: '700', marginTop: 16 }),
        detail('Translate replaces the text locally, like Translate Message v1.0.2. The same menu button becomes Revert Message to restore the original, or Cancel Translation while waiting. Other people still see the original. Open this panel from the Translate icon beside the chat input.'),
        text('Text and privacy', { fontWeight: '700', marginTop: 16 }),
        detail('Only selected message text, or messages you send while Auto Translate is enabled, goes to your chosen service. Code, spoilers, mentions and links are replaced with placeholders. Your Discord token, identity and attachments are never sent to translation providers. Originals and translations are kept only in memory.'))));
    const title = h(RN.View, { style: { padding: compact ? 17 : 0, paddingBottom: 18, flexDirection: 'row', alignItems: 'center' } },
        h(RN.View, { style: { width: 50, height: 50, backgroundColor: C.soft, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginRight: 13 } },
            h(RN.Image, { source: { uri: TRANSLATE_ICON_URI }, style: { width: 27, height: 27, tintColor: C.accent } })),
        h(RN.View, { style: { flex: 1 } }, text('Translate', { fontSize: 25, fontWeight: '700' }), detail('Vencord → Valenced')),
        onClose ? h(RN.Pressable, { onPress: onClose, hitSlop: 12, accessibilityLabel: 'Close Translate', accessibilityRole: 'button', style: { padding: 8 } }, text('×', { fontSize: 30, color: C.muted })) : null);
    let choices = [];
    if (picker === 'service') choices = providers;
    else if (picker) choices = Object.entries(languageTable(config.service)).filter(([code]) => picker.endsWith('Input') || (code !== 'auto' && code !== ''));
    choices = choices.filter(([code, name]) => (name + ' ' + code).toLowerCase().includes(query.toLowerCase().trim()));
    function choose(code) {
        if (picker === 'service') {
            const defaults = normalizeSettings({ service: code });
            void save({ service: code, receivedInput: defaults.receivedInput, receivedOutput: defaults.receivedOutput,
                sentInput: defaults.sentInput, sentOutput: defaults.sentOutput });
        } else void save({ [picker]: code });
        setPicker(null);
    }
    return h(React.Fragment, null,
        h(RN.View, { style: { flex: 1, backgroundColor: C.bg } }, compact ? title : null,
            h(RN.ScrollView, { style: { flex: 1 }, keyboardShouldPersistTaps: 'handled', contentContainerStyle: { padding: compact ? 16 : 20, paddingBottom: 36 } },
                compact ? null : title, ...sections,
                detail('Vencord Translate 2.0.4 · ' + (session?.composerConnected ? 'Chat-bar button connected' : 'Waiting for the chat composer')))),
        h(RN.Modal, { visible: picker !== null, transparent: true, animationType: 'slide', onRequestClose: () => setPicker(null) },
            h(RN.View, { style: { flex: 1, backgroundColor: '#00000090', justifyContent: 'flex-end' } },
                h(RN.Pressable, { style: { flex: 1 }, onPress: () => setPicker(null), accessibilityLabel: 'Close language picker', accessibilityRole: 'button' }),
                h(RN.SafeAreaView, { style: { height: '76%', backgroundColor: C.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' } },
                    h(RN.View, { style: { padding: 20, flexDirection: 'row', alignItems: 'center' } },
                        text(picker === 'service' ? 'Translation provider' : definitions.find(([key]) => key === picker)?.[1] ?? 'Choose language', { flex: 1, fontSize: 21, fontWeight: '700' }),
                        h(RN.Pressable, { onPress: () => setPicker(null), accessibilityLabel: 'Close language picker', accessibilityRole: 'button', hitSlop: 12 }, text('Done', { color: C.accent, fontWeight: '600' }))),
                    h(RN.TextInput, { value: query, onChangeText: setQuery, placeholder: picker === 'service' ? 'Search providers' : 'Search languages',
                        placeholderTextColor: C.muted, accessibilityLabel: 'Search languages', autoCorrect: false, autoCapitalize: 'none',
                        style: { color: C.text, backgroundColor: C.card, borderRadius: 12, padding: 14, marginHorizontal: 20, marginBottom: 10 } }),
                    h(RN.FlatList, { data: choices, keyExtractor: item => item[0], keyboardShouldPersistTaps: 'handled',
                        contentContainerStyle: { paddingHorizontal: 20, paddingBottom: 30 }, ListEmptyComponent: detail('No matching option.'),
                        renderItem: ({ item: [code, name] }) => row(code, name, code || 'Automatic detection', () => choose(code),
                            code === config[picker] ? text('✓', { color: C.accent, fontSize: 22 }) : null) })))));
}


// SPDX-License-Identifier: GPL-3.0-or-later
// Mobile adaptation of Vencord Translate's onBeforeMessageSend lifecycle.
'use strict';

function createOutgoingController(io, env = globalThis) {
    let active = true, account = io.account();
    const operations = new Set(), byObject = new WeakMap(), byNonce = new Map(), recoveries = [];
    const changed = () => io.changed?.();
    function cancelAll() { for (const operation of [...operations]) operation.cancel(); }
    function syncAccount() {
        const next = io.account();
        if (next !== account) { cancelAll(); account = next; recoveries.length = 0; changed(); }
    }
    function hook(args, original, receiver) {
        syncAccount();
        const [channelId, message] = args, config = normalizeSettings(io.settings());
        if (!active || !config.autoTranslate || !validId(channelId) || !message
            || typeof message.content !== 'string' || !message.content.trim()) return Reflect.apply(original, receiver, args);
        const nonce = typeof message.nonce === 'string' ? channelId + ':' + message.nonce : undefined;
        const previous = byObject.get(message) ?? (nonce ? byNonce.get(nonce) : undefined);
        if (previous) return previous;
        const owner = account, content = message.content, controller = abortController(env);
        let rejectStop, handedToDiscord = false;
        const stopped = new Promise((_, reject) => { rejectStop = reject; });
        const operation = { cancel() { controller.abort(); rejectStop(cancelled()); } };
        operations.add(operation); changed();
        const unchanged = () => {
            const now = normalizeSettings(io.settings());
            return active && owner === io.account() && now.autoTranslate
                && ['service', 'sentInput', 'sentOutput', 'deeplApiKey', 'kagiSession'].every(key => now[key] === config[key]);
        };
        const promise = Promise.resolve().then(async () => {
            try {
                const translated = await Promise.race([io.translate('sent', content, config, controller.signal), stopped]);
                if (!unchanged() || controller.signal.aborted) throw cancelled();
                if (typeof translated?.text !== 'string' || !translated.text.trim())
                    throw failure('PROVIDER', 'No outgoing translation was returned.');
                // Preserve nonce, attachments, reply metadata, allowed mentions and receiver.
                const next = [channelId, { ...message, content: translated.text }, ...args.slice(2)];
                operations.delete(operation); changed();
                handedToDiscord = true;
                const result = Reflect.apply(original, receiver, next);
                if (config.showAutoTranslateTooltip) io.notify('Auto Translate → ' + languageName(config.sentOutput, config.service));
                return await result;
            } catch (error) {
                if (handedToDiscord) throw error;
                if (owner === io.account()) {
                    let restored = false;
                    try { restored = await io.recoverDraft?.(channelId, content); } catch {}
                    if (!restored) {
                        if (recoveries.length >= 3) recoveries.shift();
                        recoveries.push({ channelId, content }); changed();
                    }
                    io.notify('Message not sent. ' + (restored ? 'Your original draft was restored.' : 'Your original text is available in Translate settings.'));
                }
                throw failure(error?.code === 'CANCELLED' ? 'CANCELLED' : 'TRANSLATION_SEND_FAILED',
                    'Outgoing translation stopped before sending. Your original message was kept.');
            } finally {
                operations.delete(operation); byObject.delete(message);
                if (nonce && byNonce.get(nonce) === promise) byNonce.delete(nonce);
                changed();
            }
        });
        byObject.set(message, promise);
        if (nonce) byNonce.set(nonce, promise);
        operation.promise = promise;
        return promise;
    }
    return {
        hook, syncAccount,
        count: () => operations.size,
        recoveries: () => [...recoveries],
        forgetRecovery(index) { recoveries.splice(index, 1); changed(); },
        async dispose() {
            if (!active) return;
            active = false;
            const pending = [...operations].map(operation => operation.promise);
            cancelAll(); await Promise.allSettled(pending);
            byNonce.clear(); changed();
        },
    };
}

function connectMobileComposer(session, api, env = globalThis) {
    const U = api.unscoped, { React, ReactNative: RN } = U.react, h = React.createElement;
    const F = U.modules.finders;
    const optional = fn => { try { return fn(); } catch { return undefined; } };
    const byProps = (...props) => optional(() => F.lookupModule(F.filters.withProps(...props), { initialize: false })[0]);
    const stores = () => U.discord.flux.Stores;
    session.outgoing = createOutgoingController({
        account: () => optional(() => stores().UserStore.getCurrentUser()?.id),
        settings: () => session.controller.settings(),
        translate: session.translator, notify: session.notify, changed: session.changed,
        async recoverDraft(channelId, content) {
            const store = optional(() => stores().DraftStore);
            const actions = byProps('saveDraft', 'clearDraft') ?? byProps('saveDraft');
            if (typeof store?.getDraft !== 'function' || typeof actions?.saveDraft !== 'function') return false;
            const draft = store.getDraft(channelId, 0);
            const current = typeof draft === 'string' ? draft : draft?.content;
            if (typeof current !== 'string' || (current && current !== content)) return false;
            await actions.saveDraft(channelId, content, 0);
            const saved = store.getDraft(channelId, 0);
            return (typeof saved === 'string' ? saved : saved?.content) === content;
        },
    }, env);
    const hookedSenders = new WeakSet();
    function attachSender(module) {
        if (!session.live() || typeof module?.sendMessage !== 'function' || hookedSenders.has(module)) return;
        hookedSenders.add(module);
        session.removers.push(U.patcher.instead(module, 'sendMessage', function (args, original) {
            return session.outgoing.hook(args, original, this);
        }));
        session.outgoingConnected = true; session.changed();
    }
    attachSender(byProps('sendMessage', 'deleteMessage'));
    if (typeof F.getModules === 'function') session.removers.push(F.getModules(
        F.filters.withProps('sendMessage', 'deleteMessage'), attachSender, { max: 1 }));

    const imported = U.discord.utils?.modules?.finders;
    const ACTIONS_PATH = 'modules/chat_input/native/action_buttons/ChatInputRightActions.tsx';
    const buttonKey = 'valenced.vencord-translate.composer';
    function TranslationIcon(props = {}) {
        // Native composer buttons may memoize their icon independently of the button.
        const [, update] = React.useState(0);
        React.useEffect(() => session.ui.subscribe(() => update(value => value + 1)), []);
        const theme = optional(() => stores().ThemeStore.theme);
        const enabled = session.controller.settings().autoTranslate;
        const width = props.width ?? 24, height = props.height ?? 24;
        return h(RN.View, { pointerEvents: 'none', accessible: false,
            style: [props.style, { width, height, borderRadius: 7, alignItems: 'center', justifyContent: 'center',
                backgroundColor: enabled ? '#145A3A' : 'transparent', borderWidth: enabled ? 1 : 0,
                borderColor: enabled ? '#62FFAD' : 'transparent',
                shadowColor: '#62FFAD', shadowOpacity: enabled ? 0.7 : 0,
                shadowRadius: 5, shadowOffset: { width: 0, height: 0 }, elevation: enabled ? 3 : 0 }] },
            h(RN.Image, { source: { uri: TRANSLATE_ICON_URI }, resizeMode: 'contain',
                style: { width: enabled ? width - 4 : width, height: enabled ? height - 4 : height,
                    tintColor: enabled ? '#62FFAD' : props.color ?? (theme === 'light' ? '#535461' : '#B9B8C6') },
                accessible: false }),
            enabled ? h(RN.View, { testID: 'valenced.translate.active-indicator',
                style: { position: 'absolute', top: -3, right: -3, width: 8, height: 8, borderRadius: 4,
                    backgroundColor: '#62FFAD', borderWidth: 1, borderColor: '#145A3A' } }) : null);
    }
    function TranslateChatBarButton() {
        const [, update] = React.useState(0), [open, setOpen] = React.useState(false);
        const held = React.useRef(false);
        React.useEffect(() => {
            const notify = () => update(value => value + 1);
            return session.ui.subscribe(notify);
        }, []);
        if (!session.live()) return null;
        const config = session.controller.settings();
        const onLongPress = () => {
            if (!session.live()) return;
            held.current = true;
            setOpen(true);
        };
        const onPress = () => {
            // Releasing a hold must never toggle auto-translation as well.
            if (!session.live() || held.current) return;
            if (!session.outgoingConnected) { session.notify('Open a chat before enabling Auto Translate.'); return; }
            const next = !session.controller.settings().autoTranslate;
            void session.ui.save({ autoTranslate: next });
            session.notify('Auto Translate ' + (next ? 'on → ' + languageName(config.sentOutput, config.service) : 'off'));
        };
        const props = { accessibilityLabel: 'Auto Translate', accessibilityRole: 'button',
            chatButtonsId: 'dev.fluttershy2008.translate-message', chatButtonsLabel: 'Auto Translate', IconComponent: TranslationIcon,
            accessibilityHint: 'Tap to toggle outgoing auto-translation. Hold to open translation settings.',
            accessibilityState: { checked: config.autoTranslate }, onPress, onLongPress,
            onPressIn: () => { held.current = false; }, delayLongPress: 450 };
        // Own the touch surface: Discord's private action button can discard onLongPress.
        const button = h(RN.Pressable, { ...props, testID: 'valenced.translate.composer-button', hitSlop: 4,
            style: { width: 36, height: 40, justifyContent: 'center', alignItems: 'center' } }, h(TranslationIcon));
        return h(React.Fragment, null, button,
            h(RN.Modal, { visible: open, transparent: true, animationType: 'slide', onRequestClose: () => setOpen(false) },
                h(RN.View, { style: { flex: 1, backgroundColor: '#00000090', justifyContent: 'flex-end' } },
                    h(RN.Pressable, { style: { flex: 1 }, onPress: () => setOpen(false), accessibilityLabel: 'Close Translate', accessibilityRole: 'button' }),
                    h(RN.SafeAreaView, { style: { height: '86%', borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden', backgroundColor: '#202127' } },
                        h(TranslationSettingsView, { ...session.ui, compact: true, onClose: () => setOpen(false) })))));
    }
    function insertButton(tree) {
        let target, visited = 0;
        function scan(node, depth = 0) {
            if (!node || target || depth > 24 || ++visited > 1000) return;
            if (Array.isArray(node)) { for (const child of node) scan(child, depth + 1); return; }
            if (!node.props) return;
            if (Array.isArray(node.props.children)) { target = node.props.children; return; }
            scan(node.props.children, depth + 1);
        }
        scan(tree);
        if (!target || target.some(child => String(child?.key ?? '').includes(buttonKey))) return tree;
        const added = [h(TranslateChatBarButton, { key: buttonKey }), ...target];
        let copied = 0;
        function replace(node, depth = 0) {
            if (!node || depth > 24 || ++copied > 1000) return node;
            if (node === target) return added;
            if (Array.isArray(node)) {
                const children = node.map(child => replace(child, depth + 1));
                return children.some((child, i) => child !== node[i]) ? children : node;
            }
            if (!node.props || node.props.children == null) return node;
            const children = replace(node.props.children, depth + 1);
            return children === node.props.children ? node : React.cloneElement(node, { children });
        }
        return replace(tree);
    }
    let composerAttached = false;
    function attachActions(module) {
        if (!session.live() || composerAttached || !module?.default) return;
        let parent = module, key = 'default';
        for (let i = 0; i < 8; i++) {
            const component = parent[key];
            if (component?.$$typeof === Symbol.for('react.memo')) { parent = component; key = 'type'; }
            else if (component?.$$typeof === Symbol.for('react.forward_ref')) { parent = component; key = 'render'; }
            else if (component?.prototype?.isReactComponent) { parent = component.prototype; key = 'render'; break; }
            else break;
        }
        if (typeof parent[key] !== 'function') return;
        session.removers.push(U.patcher.instead(parent, key, function (args, original) {
            const tree = Reflect.apply(original, this, args);
            return session.live() ? insertButton(tree) : tree;
        }));
        composerAttached = true; session.composerConnected = true; session.changed();
    }
    if (typeof imported?.getModuleWithImportedPath === 'function') {
        session.removers.push(imported.getModuleWithImportedPath(ACTIONS_PATH, attachActions));
    }
    attachActions(optional(() => imported.lookupModuleWithImportedPath(ACTIONS_PATH)[0]));
}


// SPDX-License-Identifier: GPL-3.0-or-later
// Valenced native shell for the Vencord Translate port; upstream attribution in THIRD_PARTY_NOTICES.md.
'use strict';

function createPluginOptions(env = globalThis) {
    let current, writes = Promise.resolve();
    const listeners = new Set();
    const broadcast = () => { for (const listener of [...listeners]) { try { listener(); } catch {} } };
    const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
    function saveSettings(api, updates) {
        const old = current?.controller?.settings() ?? normalizeSettings(api.jsonStorage.cache);
        const values = normalizeSettings({ ...old, ...updates });
        current?.controller?.configure(values);
        broadcast();
        writes = writes.catch(() => {}).then(() => api.jsonStorage.set(values));
        return writes.then(() => true, () => {
            current?.notify?.('Could not save Translate settings. Try again.'); return false;
        });
    }
    const optional = fn => { try { return fn(); } catch { return undefined; } };
    const MENU_KEYS = new Set(['MessageLongPressActionSheet', 'MessageActionSheet', 'MessageActionsSheet']);
    const TRANSLATE_KEY = 'valenced.translate-message.translate';
    const REVERT_KEY = 'valenced.translate-message.revert';

    async function shutdown(session) {
        if (!session) return;
        if (session.stopping) return session.stopping;
        session.stopping = (async () => {
            await session.outgoing?.dispose();
            await session.controller?.dispose();
            session.active = false;
            env.clearTimeout(session.retry);
            for (const remove of session.removers.splice(0).reverse()) optional(remove);
            if (current === session) current = undefined;
            broadcast();
        })();
        return session.stopping;
    }

    async function start(api) {
        if (current?.active) return;
        const U = api.unscoped, { React, ReactNative: RN } = U.react;
        const h = React.createElement, F = U.modules.finders;
        const session = { active: true, connected: false, removers: [] };
        current = session;
        api.cleanup(() => shutdown(session));
        const live = () => session.active && current === session && !session.stopping;
        const byProps = (...props) => optional(() => F.lookupModule(F.filters.withProps(...props), { initialize: false })[0]);
        const stores = () => U.discord.flux.Stores;
        const getMessage = ref => optional(() => stores().MessageStore.getMessage(ref.channelId, ref.messageId));
        const notify = text => {
            if (!session.active) return;
            if (typeof RN.ToastAndroid?.show === 'function') RN.ToastAndroid.show(text, RN.ToastAndroid.SHORT ?? 0);
            else optional(() => RN.Alert?.alert?.('Translate Message', text));
        };
        const localEvent = Symbol('translate-message.local-display');
        session.live = live; session.changed = broadcast; session.notify = notify;
        session.ui = { api, getSession: () => current, subscribe, save: values => saveSettings(api, values) };
        const translator = createVencordTranslator(env, notify);
        session.translator = translator;
        session.controller = createController({
            account: () => optional(() => stores().UserStore.getCurrentUser()?.id),
            message: getMessage, notify, changed: broadcast,
            settings: api.jsonStorage?.cache,
            translate: (text, target, signal, options) => translator('received', text, options.settings, signal),
            display(ref, content) {
                const dispatcher = U.discord.common.flux.Dispatcher;
                if (typeof dispatcher?.dispatch !== 'function') throw failure('DISPLAY', 'Discord message updates are unavailable.');
                // A partial local Flux update; no Discord REST or send/edit API is called.
                return dispatcher.dispatch({
                    type: 'MESSAGE_UPDATE', [localEvent]: true,
                    message: { id: ref.messageId, channel_id: ref.channelId, content },
                });
            },
        }, env);

        const watch = U.discord.flux.onAnyFluxEventDispatched;
        if (typeof watch !== 'function') {
            await shutdown(session);
            throw new Error('Update Valenced: its Flux event API is required by Translate Message.');
        }
        session.removers.push(watch(event => {
            if (!session.active || event[localEvent]) return event;
            try { return session.controller.onEvent(event); }
            catch { return event; }
        }));
        const removeUserListener = optional(() => {
            const store = stores().UserStore;
            const update = () => { session.controller.stats(); session.outgoing?.syncAccount(); broadcast(); };
            store.addChangeListener?.(update);
            return () => store.removeChangeListener?.(update);
        });
        if (removeUserListener) session.removers.push(removeUserListener);
        try {
            const loaded = api.jsonStorage.loaded ? api.jsonStorage.cache : await api.jsonStorage.get();
            if (live()) session.controller.configure(loaded);
        } catch {
            optional(() => api.logger?.warn?.('Translate Message could not load language settings; using English.'));
        }
        if (!live()) return;
        connectMobileComposer(session, api, env);

        let host, Row;
        const asset = names => names.map(name => optional(() => U.assets.getAssetIdByName(name))).find(value => value != null);
        function rowType() {
            return Row ??= optional(() => U.discord.design.Design.ActionSheetRow) ?? byProps('ActionSheetRow')?.ActionSheetRow;
        }
        function resolveRef(props) {
            if (!props || typeof props !== 'object') return;
            const message = props.message ?? props.messageRecord ?? props.targetMessage;
            const channelId = message?.channel_id ?? message?.channelId ?? props.channelId ?? props.channel_id ?? props.channel?.id;
            const messageId = message?.id ?? props.messageId ?? props.message_id;
            if (!validId(channelId) || !validId(messageId)) return;
            const ref = { channelId, messageId };
            const value = getMessage(ref) ?? message;
            return getMessageContent(value).trim() ? ref : undefined;
        }
        function icon(source, fallback) {
            return source != null && rowType()?.Icon
                ? h(Row.Icon, { source })
                : h(RN.Text, { style: { fontSize: 24, fontWeight: '600', color: '#B6A8FF', width: 24, textAlign: 'center' } }, fallback);
        }
        function TranslationAction({ messageRef: ref, sheetKey }) {
            const [, redraw] = React.useState(0);
            React.useEffect(() => subscribe(() => redraw(value => value + 1)), []);
            const { entry, pending } = session.controller.status(ref);
            const revertIcon = asset(['ArrowCounterClockwiseIcon', 'HistoryIcon', 'ic_history_24px', 'ic_reply_24px']);
            const action = async () => {
                if (!live()) return;
                // Recheck at press time: an open menu may outlive a request or edit.
                const state = session.controller.status(ref);
                const kind = state.entry || state.pending ? 'revert' : 'translate';
                optional(() => host.hideActionSheet(sheetKey));
                try { await session.controller[kind](ref); }
                catch { notify('Could not ' + kind + ' this message. Try again.'); }
            };
            const config = session.controller.settings();
            const restore = Boolean(entry || pending);
            return h(Row, {
                label: pending ? 'Cancel Translation' : entry ? 'Revert Message' : 'Translate',
                subLabel: pending ? 'Translation in progress… Tap to cancel' : entry ? 'Restore original text'
                    : ((config.receivedInput === 'auto' || config.receivedInput === '') ? 'Auto-detect' : languageName(config.receivedInput, config.service)) + ' → ' + languageName(config.receivedOutput, config.service),
                icon: restore ? icon(revertIcon, '↶') : h(RN.Image, {
                    source: { uri: TRANSLATE_ICON_URI }, style: { width: 24, height: 24,
                        tintColor: optional(() => stores().ThemeStore.theme) === 'light' ? '#535461' : '#F2F1F6' } }),
                onPress: action,
                accessibilityLabel: pending ? 'Cancel translation' : entry ? 'Revert message to its original text'
                    : 'Translate message to ' + languageName(config.receivedOutput, config.service),
                accessibilityRole: 'button',
            });
        }
        function buttons(ref, sheetKey) {
            return [h(TranslationAction, { key: TRANSLATE_KEY, messageRef: ref, sheetKey })];
        }
        const labelOf = node => String(node?.props?.label ?? node?.props?.text ?? '');
        const isRow = node => node?.props && typeof node.props.onPress === 'function'
            && (node.type === rowType() || node.props.label != null || node.props.text != null);
        function transformMenu(tree, ref, sheetKey) {
            let target, best = -1, duplicate = false, scanned = 0;
            function scan(node, depth = 0) {
                if (!node || depth > 32 || ++scanned > 1800) return;
                if (Array.isArray(node)) {
                    const rows = node.filter(isRow);
                    const score = rows.length + (rows.some(row => /copy text/i.test(labelOf(row))) ? 1000 : 0);
                    if (rows.length && score > best) { target = node; best = score; }
                    for (const child of node) scan(child, depth + 1);
                } else if (node.props) {
                    if ([TRANSLATE_KEY, REVERT_KEY].includes(node.key)) duplicate = true;
                    scan(node.props.children, depth + 1);
                }
            }
            scan(tree);
            if (duplicate) return { tree, done: true };
            if (!target || !rowType()) return { tree, done: false };
            const index = target.findIndex(row => /copy text/i.test(labelOf(row)));
            const at = index >= 0 ? index + 1 : target.length;
            const added = [...target.slice(0, at), ...buttons(ref, sheetKey), ...target.slice(at)];
            let changed = 0;
            function replace(node, depth = 0) {
                if (!node || depth > 32 || ++changed > 1800) return node;
                if (node === target) return added.map(wrapEdit);
                if (Array.isArray(node)) {
                    const children = node.map(child => replace(child, depth + 1));
                    return children.some((child, i) => child !== node[i]) ? children : node;
                }
                if (!node.props) return node;
                const guarded = wrapEdit(node);
                if (guarded.props.children == null) return guarded;
                const children = replace(guarded.props.children, depth + 1);
                return children !== guarded.props.children ? React.cloneElement(guarded, { children }) : guarded;
            }
            function wrapEdit(node) {
                if (!isRow(node) || !(/^(?:edit|edit message)$/i.test(labelOf(node)) || /(?:^|[.:-])edit(?:$|[.:-])/i.test(String(node.key ?? '')))) return node;
                const original = node.props.onPress;
                return React.cloneElement(node, { onPress: async (...args) => {
                    if (!live()) return;
                    await session.controller.revert(ref, false);
                    if (session.controller.status(ref).entry) {
                        notify('Could not restore this message. Reopen the channel before editing it.');
                        return;
                    }
                    return original(...args);
                } });
            }
            return { tree: replace(tree), done: true };
        }

        function wrapSheet(component, opening, sheetKey) {
            const caches = Array.from({ length: 5 }, () => new WeakMap());
            let ref = resolveRef(opening) ?? resolveRef(opening?.analyticsLocation);
            function finish(props, tree, level) {
                if (!live()) return tree;
                try {
                    ref ??= resolveRef(props) ?? resolveRef(props?.analyticsLocation);
                    if (ref) {
                        const result = transformMenu(tree, ref, sheetKey);
                        if (result.done) return result.tree;
                    }
                    let visited = 0;
                    function descend(node, depth = 0) {
                        if (!node || depth > 32 || ++visited > 1800) return node;
                        if (Array.isArray(node)) return node.map(child => descend(child, depth + 1));
                        if (!node.props) return node;
                        const children = node.props.children == null ? node.props.children : descend(node.props.children, depth + 1);
                        const native = [RN.View, RN.ScrollView, RN.Text, RN.Image, RN.Pressable, RN.TouchableOpacity, Row];
                        const type = level < 4 && !native.includes(node.type) ? wrap(node.type, level + 1) : node.type;
                        return type !== node.type ? h(type, { ...node.props, children, key: node.key })
                            : children !== node.props.children ? React.cloneElement(node, { children }) : node;
                    }
                    return descend(tree);
                } catch { return tree; }
            }
            function wrap(original, level = 0) {
                if (!original || !['function', 'object'].includes(typeof original) || level > 4) return original;
                const cache = caches[level];
                if (cache.has(original)) return cache.get(original);
                let wrapped = original;
                if (typeof original === 'function') {
                    wrapped = original.prototype?.isReactComponent
                        ? class TranslationSheet extends original { render() { return finish(this.props, super.render(), level); } }
                        : function TranslationSheet(...args) { return finish(args[0], original.apply(this, args), level); };
                } else if (original.$$typeof === Symbol.for('react.memo')) {
                    wrapped = React.memo(wrap(original.type, level), original.compare);
                } else if (original.$$typeof === Symbol.for('react.forward_ref')) {
                    wrapped = React.forwardRef((props, ref) => finish(props, original.render(props, ref), level));
                }
                cache.set(original, wrapped);
                return wrapped;
            }
            return wrap(component);
        }

        function connect() {
            if (!live() || session.connected) return;
            host = optional(() => U.discord.actions.ActionSheetActionCreators) ?? byProps('openLazy', 'hideActionSheet');
            if (typeof host?.openLazy !== 'function') return;
            session.removers.push(U.patcher.instead(host, 'openLazy', function (args, original) {
                const [lazy, key, context] = args;
                if (!live() || !MENU_KEYS.has(key) || typeof lazy?.then !== 'function') return Reflect.apply(original, this, args);
                const next = [...args];
                next[0] = Promise.resolve(lazy).then(module => {
                    if (!live() || !module?.default) return module;
                    return { ...module, default: wrapSheet(module.default, context, key) };
                });
                return Reflect.apply(original, this, next);
            }));
            session.connected = true; broadcast();
        }
        connect();
        let attempts = 0;
        const retry = () => {
            session.retry = undefined;
            if (!live()) return;
            optional(connect);
            if (!session.connected && ++attempts < 20) session.retry = env.setTimeout(retry, 1500);
        };
        if (!session.connected) session.retry = env.setTimeout(retry, 1500);
        const appSubscription = optional(() => RN.AppState?.addEventListener('change', state => {
            if (state === 'active') optional(connect);
        }));
        if (appSubscription) session.removers.push(() => appSubscription.remove());
    }

    function SettingsComponent({ api }) {
        return api.unscoped.react.React.createElement(TranslationSettingsView,
            { api, getSession: () => current, subscribe, save: values => saveSettings(api, values) });
    }

    return { jsonStorage: { default: { ...DEFAULTS } }, start,
        stop() { return shutdown(current); }, SettingsComponent };
}


return { default: createPluginOptions() };
})()
