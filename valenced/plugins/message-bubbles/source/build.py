#!/usr/bin/env python3
"""Compile the Android payload with the SDK, Valenced ABI, Xposed and D8."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import zipfile

SOURCE = Path(__file__).resolve().parent
PLUGIN = SOURCE.parent


def main():
    android, xposed, kotlin, d8 = (
        Path(os.environ[name]).resolve()
        for name in ("ANDROID_JAR", "XPOSED_JAR", "KOTLIN_STDLIB", "D8_JAR")
    )
    javac = ["javac"] if shutil.which("javac") else ["java", "com.sun.tools.javac.Main"]
    with tempfile.TemporaryDirectory(prefix="message-bubbles-") as temp:
        build = Path(temp)
        abi = build / "abi"
        classes = build / "classes"
        compiler = [*javac, "-source", "8", "-target", "8", "-Xlint:-options", "-g:none"]
        subprocess.run([*compiler, "-cp", str(kotlin), "-d", abi, *sorted((SOURCE / "abi").rglob("*.java"))], check=True)
        classpath = os.pathsep.join(map(str, (android, xposed, kotlin, abi)))
        subprocess.run([*compiler, "-cp", classpath, "-d", classes, *sorted(SOURCE.glob("*.java"))], check=True)
        dex_jar = build / "dex.jar"
        subprocess.run([
            "java", "-cp", d8, "com.android.tools.r8.D8", "--min-api", "24", "--lib", android,
            "--classpath", xposed, "--classpath", kotlin, "--classpath", abi,
            "--output", dex_jar, *sorted(classes.rglob("*.class")),
        ], check=True)
        with zipfile.ZipFile(dex_jar) as compiled:
            dex = compiled.read("classes.dex")
        entry = zipfile.ZipInfo("classes.dex", (2026, 11, 11, 0, 0, 0))
        entry.external_attr = 0o100644 << 16
        with zipfile.ZipFile(PLUGIN / "plugin.jar", "w") as package:
            package.writestr(entry, dex, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)


if __name__ == "__main__":
    main()
