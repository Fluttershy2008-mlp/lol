import hashlib
import importlib.util
import io
import json
from pathlib import Path
import unittest
import zipfile

HERE = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("builder", HERE / "build.py")
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class PackageTests(unittest.TestCase):
    def test_pages_root_and_raw_catalogues_are_identical(self):
        self.assertEqual((HERE.parent / "index.json").read_bytes(), (HERE / "index.json").read_bytes())

    def test_all_downloads_match_manifest_size_hash_and_entrypoint(self):
        index = json.loads((HERE / "index.json").read_text())
        self.assertEqual(index["format"], 1)
        self.assertEqual(len(index["plugins"]), 25)
        for plugin_id, plugin in index["plugins"].items():
            for channel, version in plugin["channels"].items():
                self.assertIn(version, plugin["versions"], (plugin_id, channel))
            for version, artifact in plugin["versions"].items():
                path = HERE / "pool" / f"{plugin_id}@{version}.zip"
                data = path.read_bytes()
                self.assertEqual(artifact["size"], len(data), plugin_id)
                self.assertEqual(artifact["sha256"], hashlib.sha256(data).hexdigest(), plugin_id)
                self.assertEqual(artifact["url"], f"https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/revenge-next/pool/{path.name}")
                with zipfile.ZipFile(io.BytesIO(data)) as z:
                    self.assertIsNone(z.testzip())
                    manifest = json.loads(z.read("manifest.json"))
                    self.assertEqual(manifest["id"], plugin_id)
                    self.assertEqual(manifest["version"], version)
                    self.assertEqual(manifest["dependencies"], artifact["dependencies"])
                    self.assertIn(manifest["dist"]["script"], z.namelist())
                    self.assertTrue(all(not Path(p).is_absolute() and ".." not in Path(p).parts for p in z.namelist()))

    def test_every_package_declares_required_host_dependencies(self):
        for path in (HERE / "pool").glob("*.zip"):
            with zipfile.ZipFile(path) as z:
                manifest = json.loads(z.read("manifest.json"))
            builder.validate_manifest(manifest)
            for key in ("revenge.api", "discord"):
                self.assertIn(key, manifest["dependencies"])
                self.assertNotIn("optional", manifest["dependencies"][key])

    def test_sources_are_exact_versions_and_credits_are_preserved(self):
        sources = json.loads((HERE / "sources.json").read_text())["plugins"]
        index = json.loads((HERE / "index.json").read_text())["plugins"]
        for plugin_id, source in sources.items():
            data = (HERE.parent / source["path"]).read_bytes()
            self.assertEqual(source["sha256"], hashlib.sha256(data).hexdigest())
            if source["kind"] != "compatibility-preview":
                continue
            directory = (HERE.parent / source["path"]).parent
            version = index[plugin_id]["channels"]["latest"]
            package = HERE / "pool" / f"{plugin_id}@{version}.zip"
            with zipfile.ZipFile(package) as z:
                if (directory / "LICENSE").exists():
                    self.assertEqual(z.read("LICENSE"), (directory / "LICENSE").read_bytes())
                self.assertIn("NOTICE.txt", z.namelist())
                self.assertIn("ADAPTER_LICENSE.txt", z.namelist())

    def test_all_21_plugin_ports_offer_the_current_adapter_release(self):
        sources = json.loads((HERE / "sources.json").read_text())["plugins"]
        index = json.loads((HERE / "index.json").read_text())["plugins"]
        release = json.loads((HERE / "repo.config.json").read_text())["portVersion"]
        ports = {key: source for key, source in sources.items() if source["kind"] == "compatibility-preview"}
        self.assertEqual(len(ports), 21)
        for plugin_id in ports:
            plugin = index[plugin_id]
            self.assertEqual(plugin["channels"]["latest"], release, plugin_id)
            self.assertEqual(plugin["channels"]["beta"], release, plugin_id)
            self.assertIn(release, plugin["versions"], plugin_id)

    def test_native_theme_converts_dark_light_and_midnight(self):
        colors = builder.theme_colors({"semanticColors": {"A": ["#123", "#abcdef", "#00112233"], "B": ["#ff0011"]},
            "rawColors": {"ACCENT": "#abc", "INVALID": "oops"}})
        self.assertEqual(colors["semantic"]["dark"]["A"], "#112233")
        self.assertEqual(colors["semantic"]["light"]["A"], "#abcdef")
        self.assertEqual(colors["semantic"]["midnight"]["A"], "#00112233")
        self.assertEqual(colors["semantic"]["darker"]["B"], "#ff0011")
        self.assertEqual(colors["raw"], {"ACCENT": "#aabbcc"})

    def test_deterministic_zip_bytes(self):
        files = {"manifest.json": "{}", "index.js": "({ default: {} })"}
        self.assertEqual(builder.archive(files), builder.archive(files))

    def test_release_order_matches_revenge_numeric_and_label_rules(self):
        compare = builder.compare_versions
        self.assertGreater(compare("1.0.10", "1.0.9"), 0)
        self.assertGreater(compare("1.0.0-beta10", "1.0.0-beta2"), 0)
        self.assertGreater(compare("1.0.0", "1.0.0-beta10"), 0)
        self.assertEqual(compare("1", "1.0.0"), 0)


if __name__ == "__main__":
    unittest.main()
