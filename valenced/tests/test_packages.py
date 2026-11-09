import hashlib
import importlib.util
import json
from pathlib import Path
import unittest
import zipfile
import struct
import zlib

HERE = Path(__file__).resolve().parents[1]
ROOT = HERE.parent
spec = importlib.util.spec_from_file_location("valenced_builder", HERE / "build.py")
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class ValencedPackages(unittest.TestCase):
    def test_index_matches_every_download_and_host_dependency(self):
        index = json.loads((HERE / "index.json").read_text())
        self.assertEqual(index["format"], 1)
        sources = json.loads((HERE / "sources.json").read_text())["plugins"]
        self.assertEqual(set(index["plugins"]), set(sources))
        for plugin_id, plugin in index["plugins"].items():
            self.assertIn(plugin["channels"]["latest"], plugin["versions"])
            for version, entry in plugin["versions"].items():
                filename = f"{plugin_id}@{version}.zip"
                data = (HERE / "pool" / filename).read_bytes()
                self.assertEqual(entry["url"], f"https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/valenced/pool/{filename}")
                self.assertEqual(entry["size"], len(data))
                self.assertEqual(entry["sha256"], hashlib.sha256(data).hexdigest())
                with zipfile.ZipFile(HERE / "pool" / filename) as package:
                    self.assertIsNone(package.testzip())
                    manifest = json.loads(package.read("manifest.json"))
                    builder.validate_manifest(manifest)
                    self.assertEqual(manifest["id"], plugin_id)
                    self.assertEqual(manifest["version"], version)
                    self.assertEqual(manifest["dependencies"], entry["dependencies"])
                    self.assertNotIn("revenge.api", manifest["dependencies"])
                    self.assertIn("valenced.api", manifest["dependencies"])
                    self.assertIn(manifest["dist"]["script"], package.namelist())
                    self.assertTrue(all(not Path(p).is_absolute() and ".." not in Path(p).parts for p in package.namelist()))

    def test_every_unique_classic_plugin_is_included_or_replaced(self):
        config = json.loads((HERE / "repo.config.json").read_text())
        sources = json.loads((HERE / "sources.json").read_text())["plugins"]
        ports = {str(Path(info["path"]).parent) for info in sources.values() if info["kind"] in ("compatibility-preview", "compatibility-stable")}
        self.assertEqual(len(ports), 21)
        self.assertTrue({"info-commands", "auto-text", "valid-user"}.issubset(ports))
        for path in ROOT.glob("*/manifest.json"):
            manifest = json.loads(path.read_text())
            if manifest.get("main") and "authors" in manifest:
                self.assertTrue(path.parent.name in ports or config["exclude"].get(path.parent.name), path.parent.name)

    def test_sources_and_credits_are_preserved(self):
        sources = json.loads((HERE / "sources.json").read_text())["plugins"]
        index = json.loads((HERE / "index.json").read_text())["plugins"]
        for plugin_id, info in sources.items():
            source = ROOT / info["path"]
            self.assertEqual(info["sha256"], hashlib.sha256(source.read_bytes()).hexdigest())
            with zipfile.ZipFile(HERE / "pool" / f"{plugin_id}@{index[plugin_id]['channels']['latest']}.zip") as package:
                for name in ("LICENSE", "NOTICE", "THIRD_PARTY_LICENSES.txt", "THIRD_PARTY_NOTICES.md", "LICENSE.upstream"):
                    if info["kind"] in ("compatibility-preview", "compatibility-stable") and (source.parent / name).exists():
                        self.assertEqual(package.read(name), (source.parent / name).read_bytes())
                self.assertIn("NOTICE.txt", package.namelist())

    def test_next_repository_stays_separate(self):
        self.assertEqual((ROOT / "index.json").read_bytes(), (ROOT / "revenge-next/index.json").read_bytes())
        self.assertNotEqual((ROOT / "index.json").read_bytes(), (HERE / "index.json").read_bytes())
        config = json.loads((HERE / "repo.config.json").read_text())
        self.assertIn(config["repositoryUrl"], (HERE / "README.md").read_text())
        self.assertIn(config["repositoryUrl"], (ROOT / "README.md").read_text())

    def test_themes_use_valenced_themes_api(self):
        plugins = json.loads((HERE / "index.json").read_text())["plugins"]
        themes = [p for p in plugins.values() if "valenced.api.themes" in p["versions"][p["channels"]["latest"]]["dependencies"]]
        self.assertEqual(len(themes), 5)

    def test_native_theme_assets_ship_with_their_manifest_and_licences(self):
        config = json.loads((HERE / "repo.config.json").read_text())
        index = json.loads((HERE / "index.json").read_text())["plugins"]
        for slug, relative in config["nativeThemes"].items():
            directory = ROOT / relative
            manifest = json.loads((directory / "manifest.json").read_text())
            self.assertIn("valenced.api.themes", manifest["dependencies"])
            item = index[manifest["id"]]
            version = item["channels"]["latest"]
            with zipfile.ZipFile(HERE / "pool" / f"{manifest['id']}@{version}.zip") as package:
                for name in ("manifest.json", "index.js", "LICENSE", "NOTICE.txt"):
                    self.assertEqual(package.read(name), (directory / name).read_bytes())
                for path in (directory / "assets").rglob("*"):
                    if path.is_file():
                        self.assertEqual(package.read(path.relative_to(directory).as_posix()), path.read_bytes())
                native = manifest.get("dist", {}).get("android")
                if native:
                    payload = package.read(native["path"])
                    self.assertEqual(payload, (directory / native["path"]).read_bytes())
                    with zipfile.ZipFile(__import__('io').BytesIO(payload)) as jar:
                        dex = jar.read("classes.dex")
                    self.assertEqual(dex[:8], b"dex\n035\0")
                    self.assertEqual(hashlib.sha1(dex[32:]).digest(), dex[12:32])
                    self.assertEqual(zlib.adler32(dex[12:]) & 0xffffffff, struct.unpack_from("<I", dex, 8)[0])
                    self.assertIn(native["class"].replace(".", "/").encode(), dex)

    def test_shortcut_helper_is_bundled_only_with_configured_plugins(self):
        config = json.loads((HERE / "repo.config.json").read_text())
        wanted = {"custom-rpc", "friends-list", "more-alts", "server-leaver", "blocked-user-list", "relationship-notifier"}
        self.assertEqual(set(config["settingsShortcuts"]), wanted)
        native = {slug for slug, entry in config.get("nativePlugins", {}).items()
                  if isinstance(entry, dict) and entry.get("settingsShortcut")}
        self.assertEqual(native, {"quick-delete", "auto-quest", "long-video-share", "math-ai"})
        index = json.loads((HERE / "index.json").read_text())["plugins"]
        sources = json.loads((HERE / "sources.json").read_text())["plugins"]
        digest = hashlib.sha256((HERE / "settings-shortcut.cjs").read_bytes()).hexdigest()
        for plugin_id, item in index.items():
            slug = plugin_id.removeprefix("dev.fluttershy2008.")
            version = item["channels"]["latest"]
            with zipfile.ZipFile(HERE / "pool" / f"{plugin_id}@{version}.zip") as package:
                script = package.read("index.js").decode()
            if slug in wanted:
                self.assertEqual(version, config["pluginVersions"][slug])
                self.assertIn("withValencedSettingsShortcut(createValencedPlugin(", script)
                self.assertEqual(sources[plugin_id]["settingsShortcut"]["sha256"], digest)
                self.assertEqual(sources[plugin_id]["settingsShortcut"]["section"], "VALENCED")
            elif slug in native:
                self.assertIn("withValencedSettingsShortcut(nativeOptions.default,", script)
                self.assertEqual(sources[plugin_id]["settingsShortcut"]["sha256"], digest)
                self.assertEqual(sources[plugin_id]["settingsShortcut"]["section"], "VALENCED")
            else:
                self.assertNotIn("withValencedSettingsShortcut", script)

    def test_native_plugin_payloads_are_included_and_valid(self):
        config = json.loads((HERE / "repo.config.json").read_text())
        for slug, entry in config.get("nativePlugins", {}).items():
            directory = ROOT / (entry if isinstance(entry, str) else entry["path"])
            manifest = json.loads((directory / "manifest.json").read_text())
            native = manifest.get("dist", {}).get("android")
            if not native:
                continue
            with zipfile.ZipFile(HERE / "pool" / f"{manifest['id']}@{manifest['version']}.zip") as package:
                payload = package.read(native["path"])
            self.assertEqual(payload, (directory / native["path"]).read_bytes())
            with zipfile.ZipFile(__import__('io').BytesIO(payload)) as jar:
                dex = jar.read("classes.dex")
            # D8 emits DEX 039 for API 28+; legacy DX builds use 035.
            # https://source.android.com/docs/core/runtime/dex-format
            supported_magic = {b"dex\n035\0"}
            metadata_path = directory / "native-source.json"
            if metadata_path.exists():
                metadata = json.loads(metadata_path.read_text())
                if metadata.get("minAndroidApi", 0) >= 28:
                    supported_magic.add(b"dex\n039\0")
            self.assertIn(dex[:8], supported_magic)
            self.assertEqual(hashlib.sha1(dex[32:]).digest(), dex[12:32])
            self.assertEqual(zlib.adler32(dex[12:]) & 0xffffffff, struct.unpack_from("<I", dex, 8)[0])
            self.assertIn(native["class"].replace(".", "/").encode(), dex)


if __name__ == "__main__":
    unittest.main()


