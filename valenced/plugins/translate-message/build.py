#!/usr/bin/env python3
"""Build a self-contained Valenced format-1 installation ZIP; stdlib only."""
import base64
import hashlib
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parent
OUT = ROOT.parent / 'output'
OUT.mkdir(exist_ok=True)
manifest = {
    'format': 1,
    'id': 'dev.fluttershy2008.translate-message',
    'name': 'Translate (Vencord port)',
    'description': 'Mobile port of Vencord Translate: incoming/outgoing languages, Google/DeepL/Kagi, composer button and outgoing auto-translation.',
    'author': 'Vendicated and Vencord contributors',
    'contributors': ['fluttershy_simper67 <753962426407452713>'],
    'version': '2.0.4',
    'icon': 'data:image/png;base64,' + base64.b64encode((ROOT/'assets/translate.png').read_bytes()).decode(),
    'dependencies': {'valenced.api': {'version': '>=1 <2'}, 'discord': {'version': '*'}},
    'dist': {'script': 'index.js'},
}
sources = [(ROOT / 'src' / name).read_text().split('// NODE_EXPORTS')[0]
           for name in ('languages.cjs', 'core.cjs', 'service.cjs', 'icon.cjs', 'ui.cjs', 'outgoing.cjs', 'plugin.cjs')]
script = '(() => {\n' + '\n'.join(sources) + '\nreturn { default: createPluginOptions() };\n})()\n'
(ROOT / 'index.js').write_text(script)
(ROOT / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
archive = OUT / 'Vencord_Translate_Valenced_v2.0.4.zip'
with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for path in sorted(ROOT.rglob('*')):
        if not path.is_file() or any(part in path.parts for part in ('__pycache__', 'node_modules', '.git')) or path.suffix == '.zip':
            continue
        name = path.relative_to(ROOT).as_posix()
        info = zipfile.ZipInfo(name, (2026, 10, 31, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        z.writestr(info, path.read_bytes(), compresslevel=9)
print(json.dumps({'file': str(archive), 'bytes': archive.stat().st_size,
                  'sha256': hashlib.sha256(archive.read_bytes()).hexdigest()}, indent=2))
