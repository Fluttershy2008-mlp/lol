'use strict';
const fs = require('node:fs');
const path = require('node:path');
const sources = ['languages.cjs', 'core.cjs', 'service.cjs', 'outgoing.cjs']
    .map(name => fs.readFileSync(path.join(__dirname, '../src', name), 'utf8').split('// NODE_EXPORTS')[0]).join('\n');
module.exports = new Function(sources + '\nreturn { LANGUAGES, DEFAULTS, languageTable, languageName, normalizeSettings, getMessageContent, protectText, splitText, createTranslator, createVencordTranslator, createController, createOutgoingController };')();
