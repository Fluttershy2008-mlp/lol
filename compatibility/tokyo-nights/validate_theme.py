#!/usr/bin/env python3
"""Validate Tokyo Nights against the pinned Discord colour extraction.

Run from any directory. Uses Python's standard library. Reference JSON files can
be supplied locally with --reference-dir to perform the same checks offline.
"""
import argparse
import json
from pathlib import Path
import re
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
HEX = re.compile(r"^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$")


def unique_object(pairs):
    out = {}
    for key, value in pairs:
        if key in out:
            raise ValueError(f"Duplicate JSON key: {key}")
        out[key] = value
    return out


def read(path):
    return json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=unique_object)


def reference(channel, kind, args, migration):
    if args.reference_dir:
        return read(args.reference_dir / f"{channel}-{kind}.json")
    url = ("https://raw.githubusercontent.com/everestmcarthur/decord/"
           f"{migration['referenceCommit']}/{channel}/{kind}.json")
    with urlopen(Request(url, headers={"User-Agent": "TokyoNightsValidator"}), timeout=30) as response:
        return json.load(response, object_pairs_hook=unique_object)


def luminance(value):
    channels = [int(value[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    linear = [v / 12.92 if v <= 0.04045 else ((v + .055) / 1.055) ** 2.4 for v in channels]
    return sum(a * b for a, b in zip(linear, (.2126, .7152, .0722)))


def contrast(fg, bg):
    assert len(fg) == len(bg) == 7, "Contrast check requires opaque colours"
    a, b = sorted((luminance(fg), luminance(bg)))
    return (b + .05) / (a + .05)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reference-dir", type=Path)
    args = parser.parse_args()
    theme = read(ROOT / "Tokyo_Nights_Theme.json")
    original = read(HERE / "original-v298.json")
    migration = read(HERE / "migration.json")
    fonts = read(ROOT / "Tokyo_Nights_Fonts.json")
    semantic_reference = {}
    for channel in ("stable", "beta", "alpha"):
        semantic_reference.update(reference(channel, "semantic", args, migration))
    raw_reference = reference("stable", "raw", args, migration)
    semantic, raw = theme["semanticColors"], theme["rawColors"]
    assert theme["spec"] == 2 and fonts["spec"] == 1
    for key, values in semantic.items():
        assert isinstance(values, list) and len(values) == 2, f"Two mode values required: {key}"
        assert all(isinstance(v, str) and HEX.fullmatch(v) for v in values), f"Invalid colour: {key}"
    for key, value in raw.items():
        assert isinstance(value, str) and HEX.fullmatch(value), f"Invalid raw colour: {key}"
    for key, value in theme["plus"]["icons"].items():
        assert HEX.fullmatch(value) or value in raw, f"Invalid icon colour/reference: {key}"
    assert not any(key.startswith("RREDESIGN") for key in semantic)
    for field in ("authors", "fonts", "background"):
        assert theme[field] == original[field], f"Unexpected change to {field}"
    for key, values in original["semanticColors"].items():
        new_key = migration["renamedKeys"].get(key, key)
        wanted = migration["adjustedLegacyColors"].get(new_key, values[0])
        assert semantic[new_key] == [wanted, wanted], f"Unexpected legacy edit: {key}"
    for key, value in original["rawColors"].items():
        assert raw[key] == value, f"Unexpected legacy raw edit: {key}"
    for key, value in original["plus"]["icons"].items():
        expected = "#ff00d9" if key in ("icon-qs-links", "toast_copy_link") else value
        assert theme["plus"]["icons"][key] == expected, f"Unexpected icon edit: {key}"
    new_semantic = set(semantic) - set(original["semanticColors"])
    corrected_legacy = set(migration["renamedKeys"].values())
    assert not (new_semantic - corrected_legacy - set(semantic_reference)), "Unknown modern semantic keys"
    assert not (set(raw) - set(original["rawColors"]) - set(raw_reference)), "Unknown modern raw keys"
    for source, target in migration["renamedKeys"].items():
        assert source not in semantic and target in semantic
    for key in ("CHANNEL_BACKGROUND_DEFAULT", "MOBILE_CHATINPUT_BACKGROUND_DEFAULT",
                "MOBILE_CHATINPUT_BORDER_DEFAULT", "MOBILE_ACTIONSHEET_BACKGROUND",
                "TEXT_DEFAULT", "ICON_DEFAULT", "CONTROL_PRIMARY_TEXT_DEFAULT",
                "INPUT_TEXT_DEFAULT", "BACKGROUND_BASE_LOWEST", "MOBILE_TOAST_BACKGROUND_DEFAULT"):
        assert key in semantic_reference and key in semantic, f"Missing current token: {key}"
    for prefix in ("NEUTRAL", "BLURPLE"):
        assert all(f"{prefix}_{i}" in raw for i in range(1, 101)), f"Incomplete {prefix} ramp"
    for alias, source in migration["iconAliases"].items():
        assert theme["plus"]["icons"][alias] == theme["plus"]["icons"][source]
    assert set(fonts["main"]) == set(original["fonts"])
    for key, value in fonts["main"].items():
        expected = original["fonts"][key].replace(
            "https://github.com/LuckyJinx13/Public-Themes/raw/main/",
            "https://raw.githubusercontent.com/LuckyJinx13/Public-Themes/main/")
        assert value == expected
    pairs = [
        ("TEXT_DEFAULT", "CHANNEL_BACKGROUND_DEFAULT", 4.5),
        ("TEXT_STRONG", "BACKGROUND_BASE_LOWEST", 4.5),
        ("INPUT_TEXT_DEFAULT", "MOBILE_CHATINPUT_BACKGROUND_DEFAULT", 4.5),
        ("INPUT_PLACEHOLDER_TEXT_DEFAULT", "MOBILE_CHATINPUT_BACKGROUND_DEFAULT", 4.5),
        ("REDESIGN_CHANNEL_NAME_MUTED_TEXT", "CHANNEL_BACKGROUND_DEFAULT", 4.5),
        ("INTERACTIVE_ICON_HOVER", "BACKGROUND_BASE_LOWER", 3),
        ("CONTROL_PRIMARY_TEXT_DEFAULT", "CONTROL_PRIMARY_BACKGROUND_DEFAULT", 4.5),
        ("CONTROL_PRIMARY_TEXT_DEFAULT", "CONTROL_PRIMARY_BACKGROUND_ACTIVE", 4.5),
        ("CONTROL_CRITICAL_PRIMARY_TEXT_DEFAULT", "CONTROL_CRITICAL_PRIMARY_BACKGROUND_DEFAULT", 4.5),
        ("CONTROL_CRITICAL_PRIMARY_TEXT_DEFAULT", "CONTROL_CRITICAL_PRIMARY_BACKGROUND_ACTIVE", 4.5),
        ("CHAT_INPUT_SEND_BUTTON_ICON_ACTIVE_TINT", "CHAT_INPUT_SEND_BUTTON_ACTIVE_BACKGROUND", 4.5),
    ]
    for fg, bg, minimum in pairs:
        ratio = contrast(semantic[fg][0], semantic[bg][0])
        assert ratio >= minimum, f"Low contrast {fg}/{bg}: {ratio:.2f}:1"
        print(f"Contrast {fg}/{bg}: {ratio:.2f}:1")
    print(f"PASS: {len(semantic)} semantic colours, {len(raw)} raw colours, "
          f"{len(theme['plus']['icons'])} icon colours/references, {len(fonts['main'])} fonts")
    print(f"Validated {len(new_semantic - corrected_legacy)} added modern token names against "
          f"Decord {migration['referenceCommit']} ({migration['versions']})")
    print("Static validation only; no Android device rendering is claimed.")


if __name__ == "__main__":
    main()
