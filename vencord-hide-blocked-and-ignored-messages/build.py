"""Build the complete custom-plugin ZIP and installer checksums deterministically."""
from pathlib import Path
import hashlib
import zipfile

root = Path(__file__).resolve().parent
archive = root / 'HideBlockedAndIgnoredMessages-Vencord.zip'
with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as output:
    for file in sorted((root / 'hideBlockedAndIgnoredMessages').iterdir()):
        if not file.is_file():
            raise RuntimeError(f'Unexpected plugin directory: {file}')
        info = zipfile.ZipInfo(file.relative_to(root).as_posix(), (2026, 11, 10, 0, 0, 0))
        info.external_attr = 0o100644 << 16
        info.compress_type = zipfile.ZIP_DEFLATED
        output.writestr(info, file.read_bytes())
files = [archive, root / 'Install-HideBlockedAndIgnoredMessages.cmd']
(root / 'SHA256SUMS').write_text(''.join(f'{hashlib.sha256(f.read_bytes()).hexdigest()}  {f.name}\n' for f in files))
print('Built Vencord plugin ZIP and checksums.')
