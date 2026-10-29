#!/usr/bin/env python3
"""Build deterministic, self-contained Valenced packages with stdlib only."""
import argparse
from functools import cmp_to_key
import hashlib
import io
import json
from pathlib import Path
import re
import zipfile

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
ID_RE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9.-]*$")
VERSION_RE = re.compile(r"^\d+(?:\.\d+)*(?:-[a-z0-9]+)?$")


def dump(value):
    return json.dumps(value, ensure_ascii=False, indent=2) + "\n"


def color(value):
    if not isinstance(value, str):
        return None
    if re.fullmatch(r"#[0-9a-fA-F]{3}", value):
        return "#" + "".join(x * 2 for x in value[1:])
    return value if re.fullmatch(r"#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?", value) else None


def theme_colors(theme):
    bases = {base: {} for base in ("dark", "darker", "light", "midnight")}
    for key, values in theme.get("semanticColors", {}).items():
        if not isinstance(values, list) or not values:
            continue
        for base, idx in (("dark", 0), ("darker", 0), ("light", 1), ("midnight", 2)):
            value = color(values[idx] if len(values) > idx else values[0])
            if value:
                bases[base][key] = value
    raw = {key: valid for key, value in theme.get("rawColors", {}).items() if (valid := color(value))}
    return {"semantic": bases, "raw": raw}


def author_string(author):
    if isinstance(author, str):
        return author
    name = author.get("name", "Unknown author")
    # Contributor syntax puts IDs before links. Parentheses in legacy names are plain text.
    name = name.replace("(", "[").replace(")", "]")
    return name + (f" <{author['id']}>" if str(author.get("id", "")).isdigit() else "")


def manifest_for(slug, legacy, version, theme=False):
    authors = [author_string(a) for a in legacy.get("authors", [])]
    authors = authors or ["Fluttershy2008-mlp <753962426407452713>"]
    dependencies = {"valenced.api": {"version": ">=1 <2"}, "discord": {"version": "*"}}
    if theme:
        dependencies["valenced.api.themes"] = {"version": ">=1 <2"}
        dependencies["discord"] = {"version": ">=352.2"}
    manifest = {"format": 1, "id": "dev.fluttershy2008." + slug,
                "name": legacy["name"] + " (Valenced)",
                "description": "Valenced preview. " + legacy.get("description", "").replace("Revenge", "Valenced"),
                "author": authors[0], "version": version, "dependencies": dependencies,
                "icon": "PaintPaletteIcon" if theme else legacy.get("vendetta", {}).get("icon", "PuzzlePieceIcon"),
                "dist": {"script": "index.js"}}
    if len(authors) > 1:
        manifest["contributors"] = authors[1:]
    return manifest


def archive(files):
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for name, value in sorted(files.items()):
            entry = zipfile.ZipInfo(name, (2026, 10, 28, 0, 0, 0))
            entry.compress_type = zipfile.ZIP_DEFLATED
            entry.external_attr = 0o100644 << 16
            z.writestr(entry, value.encode() if isinstance(value, str) else value, compresslevel=9)
    return stream.getvalue()


def validate_manifest(manifest):
    assert manifest["format"] == 1
    assert ID_RE.fullmatch(manifest["id"]) and ".." not in manifest["id"]
    assert VERSION_RE.fullmatch(manifest["version"])
    assert all(k in manifest["dependencies"] for k in ("valenced.api", "discord"))
    assert all(not dep.get("optional") for dep in manifest["dependencies"].values())
    assert manifest["dist"]["script"] == "index.js"


def compare_versions(a, b):
    left, _, left_label = a.partition("-")
    right, _, right_label = b.partition("-")
    nums_a, nums_b = list(map(int, left.split("."))), list(map(int, right.split(".")))
    length = max(len(nums_a), len(nums_b))
    nums_a += [0] * (length - len(nums_a))
    nums_b += [0] * (length - len(nums_b))
    if nums_a != nums_b:
        return (nums_a > nums_b) - (nums_a < nums_b)
    if left_label == right_label:
        return 0
    if not left_label:
        return 1
    if not right_label:
        return -1
    runs_a, runs_b = re.findall(r"\d+|\D+", left_label), re.findall(r"\d+|\D+", right_label)
    for x, y in zip(runs_a, runs_b):
        if x.isdigit() and y.isdigit():
            x, y = int(x), int(y)
        if x != y:
            return (x > y) - (x < y)
    return (len(runs_a) > len(runs_b)) - (len(runs_a) < len(runs_b))


def write(path, value, check):
    data = value.encode() if isinstance(value, str) else value
    if check:
        if not path.exists() or path.read_bytes() != data:
            raise RuntimeError(f"Out-of-date generated file: {path.relative_to(ROOT)}")
    else:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)


def build(check=False):
    config = json.loads((HERE / "repo.config.json").read_text())
    runtime = (HERE / "runtime.cjs").read_text().split("module.exports =")[0]
    shortcut_runtime = (HERE / "settings-shortcut.cjs").read_text().split("module.exports =")[0]
    entries = []
    source_info = {}
    for directory in sorted(ROOT.iterdir()):
        manifest_path = directory / "manifest.json"
        if not directory.is_dir() or not manifest_path.exists() or directory.name in config["exclude"]:
            continue
        legacy = json.loads(manifest_path.read_text())
        if not legacy.get("main") or "authors" not in legacy:
            continue
        source_path = directory / legacy["main"]
        if not source_path.exists():
            raise RuntimeError(f"Missing source bundle: {source_path}")
        source = source_path.read_text()
        slug = "addon-list" if directory.name == "addonList" else directory.name
        version = config.get("pluginVersions", {}).get(slug, config["portVersion"])
        source_ref = config.get("sourceRefs", {}).get(slug, config["sourceCommit"])
        manifest = manifest_for(slug, legacy, version)
        shortcut = config.get("settingsShortcuts", {}).get(slug)
        if shortcut and shortcut.get("description"):
            manifest["description"] = "Valenced preview. " + shortcut["description"]
        metadata = {"id": manifest["id"], "legacyManifest": legacy,
                    "repository": config["repositoryUrl"], "host": "valenced", "version": version}
        transformed = source.rstrip().rstrip(";")
        plugin_runtime = runtime
        if directory.name in ("stealmoji", "save-as-sticker"):
            # These packages open their custom pages from chat. The ordinary
            # legacy navigation bridge is used by plugins already in Settings.
            start = runtime.index("    function openLegacyPage(")
            end = runtime.index("    function wrapNavigation(", start)
            navigation_file = "stealmoji-navigation.cjs" if directory.name == "stealmoji" else "expression-navigation.cjs"
            page_navigation = (HERE / navigation_file).read_text()
            plugin_runtime = runtime[:start] + page_navigation + "\n" + runtime[end:]
        if directory.name == "addonList":
            transformed = transformed.replace("entry.enabled ? 'Enabled' : 'Disabled'",
                "entry.enabled === undefined ? 'Installed' : entry.enabled ? 'Enabled' : 'Disabled'")
            transformed = transformed.replace("entry.selected ? 'Selected' : 'Not selected'", "'Installed'")
        if directory.name == "info-commands":
            # Classic's helper depends on a window global and an old lodash
            # barrel. Use the scoped local-message adapter for Valenced output.
            old = "if (window.sendMessage) return window.sendMessage(...arguments);"
            if transformed.count(old) != 1:
                raise RuntimeError("InfoCommands local-output bridge needs updating")
            transformed = transformed.replace(old,
                "return vendetta.commands.sendLocalMessage(arguments[0].channelId, arguments[0], arguments[1]);")
        if directory.name == "auto-text":
            transformed = transformed.replace("Stopped because Revenge moved to the background.", "Stopped because Valenced moved to the background.")
            # A saved phrase card and its suggestion share one sibling list.
            # Give them separate React keys so suggestions cannot reuse a card.
            for old, new in (("key: phrase.shortcut", "key: 'phrase.' + phrase.shortcut"),
                             ("key: p.shortcut", "key: 'suggestion.' + p.shortcut")):
                if transformed.count(old) != 1:
                    raise RuntimeError("AutoText React key bridge needs updating")
                transformed = transformed.replace(old, new)
        factory = "function(vendetta, setTimeout, clearTimeout, setInterval, clearInterval) { return (\n" + transformed + "\n); }"
        script = "(() => {\n" + plugin_runtime + "\nreturn { default: createValencedPlugin(" + factory + ", " + json.dumps(metadata, ensure_ascii=False) + ") };\n})()\n"
        if shortcut:
            shortcut_meta = {"id": manifest["id"], "title": shortcut["title"], "icon": shortcut["icon"]}
            script = ("(() => {\n" + plugin_runtime + "\n" + shortcut_runtime
                + "\nreturn { default: withValencedSettingsShortcut(createValencedPlugin(" + factory + ", "
                + json.dumps(metadata, ensure_ascii=False) + "), " + json.dumps(shortcut_meta, ensure_ascii=False) + ") };\n})()\n")
        files = {"manifest.json": dump(manifest), "index.js": script}
        for name in ("LICENSE", "NOTICE", "THIRD_PARTY_LICENSES.txt", "THIRD_PARTY_NOTICES.md", "LICENSE.upstream"):
            if (directory / name).exists():
                files[name] = (directory / name).read_bytes()
        files["ADAPTER_LICENSE.txt"] = (ROOT / "revenge-next/LICENSE").read_text()
        files["NOTICE.txt"] = (f"Source: https://github.com/Fluttershy2008-mlp/lol/tree/{source_ref}/{directory.name}\n"
            f"Original version: {legacy['version']}\nValenced adapter: {version}\n"
            "Experimental compatibility port; not tested on a physical device.\n"
            "Classic settings/accounts are not imported automatically.\n")
        source_info[manifest["id"]] = {"path": str(source_path.relative_to(ROOT)),
            "sha256": hashlib.sha256(source.encode()).hexdigest(), "originalVersion": legacy["version"],
            "kind": "compatibility-preview"}
        if source_ref != config["sourceCommit"]:
            source_info[manifest["id"]]["sourceRef"] = source_ref
        if shortcut:
            source_info[manifest["id"]]["settingsShortcut"] = {
                "path": "valenced/settings-shortcut.cjs",
                "sha256": hashlib.sha256((HERE / "settings-shortcut.cjs").read_bytes()).hexdigest(),
                "section": "VALENCED", "title": shortcut["title"],
            }
        entries.append((slug, manifest, files))

    for slug, filename in config["themes"].items():
        theme = json.loads((ROOT / filename).read_text())
        manifest = manifest_for(slug, theme, config["themeVersion"], theme=True)
        background = theme.get("background", {})
        definition = {"name": theme["name"], "description": theme.get("description", "")}
        if re.match(r"^https://", background.get("url", "")):
            definition["background"] = {"path": background["url"], "opacity": background.get("alpha", 1),
                "blur": background.get("blur", 0)}
        script = ("(() => {\nconst colors = " + json.dumps(theme_colors(theme), ensure_ascii=False) + ";\n"
            "const definition = " + json.dumps(definition, ensure_ascii=False) + ";\n"
            "return { default: { preInit({ themes }) {\n"
            "themes.registerGroup('fluttershy', { name: \"Fluttershy's Themes\" });\n"
            "themes.registerTheme('fluttershy', " + json.dumps(slug) + ", { ...definition, getColors: () => colors });\n"
            "} } };\n})()\n")
        files = {"manifest.json": dump(manifest), "index.js": script, "LICENSE": (ROOT / "revenge-next/LICENSE").read_text(),
            "NOTICE.txt": f"Theme source: https://github.com/Fluttershy2008-mlp/lol/blob/{config['sourceCommit']}/{filename}\n"
                "Colours and background use Valenced's Themes API. No Classic wallpaper companion is required.\n"
                "Font packs are separate and are not included in this colour theme package.\n"}
        source_info[manifest["id"]] = {"path": filename, "sha256": hashlib.sha256((ROOT / filename).read_bytes()).hexdigest(),
            "originalVersion": theme.get("version", ""), "kind": "native-theme"}
        entries.append((slug, manifest, files))

    for slug, relative in config.get("nativeThemes", {}).items():
        directory = ROOT / relative
        manifest = json.loads((directory / "manifest.json").read_text())
        files = {name: (directory / name).read_bytes()
                 for name in ("manifest.json", "index.js", "LICENSE", "NOTICE.txt")}
        native = manifest.get("dist", {}).get("android")
        if native:
            native_path = Path(native["path"])
            if native_path.is_absolute() or ".." in native_path.parts:
                raise RuntimeError(f"Unsafe native payload path: {native_path}")
            files[native_path.as_posix()] = (directory / native_path).read_bytes()
        for path in sorted((directory / "assets").rglob("*")):
            if path.is_file():
                files[path.relative_to(directory).as_posix()] = path.read_bytes()
        source_path = directory / "index.js"
        source_info[manifest["id"]] = {
            "path": source_path.relative_to(ROOT).as_posix(),
            "sha256": hashlib.sha256(source_path.read_bytes()).hexdigest(),
            "originalVersion": manifest["version"], "kind": "native-theme",
        }
        entries.append((slug, manifest, files))

    for slug, manifest, files in entries:
        validate_manifest(manifest)
        write(HERE / ".build" / "plugins" / slug / "manifest.json", dump(manifest), False)
        write(HERE / ".build" / "plugins" / slug / "index.js", files["index.js"], False)
        write(HERE / "pool" / f"{manifest['id']}@{manifest['version']}.zip", archive(files), check)
    # The pool is the release history: never silently remove previous versions.
    plugins, manifests = {}, {}
    for path in sorted((HERE / "pool").glob("*.zip")):
        data = path.read_bytes()
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            manifest = json.loads(z.read("manifest.json"))
        validate_manifest(manifest)
        assert path.name == f"{manifest['id']}@{manifest['version']}.zip"
        manifests.setdefault(manifest["id"], {})[manifest["version"]] = manifest
        item = plugins.setdefault(manifest["id"], {})
        item.setdefault("versions", {})[manifest["version"]] = {
            "url": config["baseUrl"] + "/pool/" + path.name,
            "sha256": hashlib.sha256(data).hexdigest(), "size": len(data), "dependencies": manifest["dependencies"]}
    for plugin_id, item in plugins.items():
        versions = sorted(item["versions"], key=cmp_to_key(compare_versions))
        newest = versions[-1]
        stable = [v for v in versions if "-" not in v]
        latest = stable[-1] if stable else newest
        # A new repository with only previews can still use the default channel.
        item["channels"] = {"latest": latest, "beta": newest}
        item["channels"].update(config.get("channels", {}).get(plugin_id, {}))
        if not all(v in item["versions"] for v in item["channels"].values()):
            raise RuntimeError(f"Channel points at an unpublished version: {plugin_id}")
        item.update({key: value for key, value in manifests[plugin_id][newest].items()
            if key in ("name", "description", "author", "contributors", "icon")})
    index = {key: config[key] for key in ("name", "description", "icon")}
    index = {"format": 1, **index, "plugins": plugins}
    write(HERE / "index.json", dump(index), check)
    write(HERE / "sources.json", dump({"sourceCommit": config["sourceCommit"], "plugins": source_info}), check)
    theme_count = len(config["themes"]) + len(config.get("nativeThemes", {}))
    print(f"{'Verified' if check else 'Built'} {len(entries)} packages ({theme_count} native theme plugins); {len(plugins)} catalogue entries.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Verify checked-in packages without rewriting them")
    build(parser.parse_args().check)
