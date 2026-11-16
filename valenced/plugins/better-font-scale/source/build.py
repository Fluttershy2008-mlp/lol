#!/usr/bin/env python3
"""Compile Better Font Scale's Android hook with Android SDK, Kotlin and D8."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import zipfile

SOURCE = Path(__file__).resolve().parent
PLUGIN = SOURCE.parent
STUBS = {
    "app/valenced/plugins/PluginBuilder.java": """
        package app.valenced.plugins;
        import kotlin.Unit;
        import kotlin.jvm.functions.Function1;
        public final class PluginBuilder {
            public void start(Function1<PluginScope, Unit> callback) {}
            public void stop(Function1<PluginScope, Unit> callback) {}
        }
    """,
    "app/valenced/plugins/PluginScope.java": """
        package app.valenced.plugins;
        public interface PluginScope extends app.valenced.xposed.api.HostScope {}
    """,
    "app/valenced/xposed/api/HostScope.java": """
        package app.valenced.xposed.api;
        import android.content.Context;
        import app.valenced.bridge.ValencedBridge;
        import kotlin.Unit;
        import kotlin.jvm.functions.Function1;
        public interface HostScope {
            ClassLoader getClassLoader();
            ValencedBridge getBridge();
            void withAppContext(Function1<Context, Unit> callback);
        }
    """,
    "app/valenced/bridge/ValencedBridge.java": """
        package app.valenced.bridge;
        import java.util.List;
        import kotlin.jvm.functions.Function1;
        public interface ValencedBridge {
            void registerMethod(String name, Function1<List<?>, Object> callback);
        }
    """,
    "de/robv/android/xposed/XC_MethodHook.java": """
        package de.robv.android.xposed;
        public abstract class XC_MethodHook {
            protected void beforeHookedMethod(MethodHookParam param) throws Throwable {}
            public static class MethodHookParam { public Object thisObject; }
            public class Unhook { public void unhook() {} }
        }
    """,
    "de/robv/android/xposed/XposedBridge.java": """
        package de.robv.android.xposed;
        import java.lang.reflect.Member;
        public final class XposedBridge {
            public static XC_MethodHook.Unhook hookMethod(Member method, XC_MethodHook callback) { return null; }
        }
    """,
}


def main():
    android, kotlin, d8 = (Path(os.environ[key]).resolve() for key in ("ANDROID_JAR", "KOTLIN_STDLIB", "D8_JAR"))
    source = SOURCE / "BetterFontScale.java"
    with tempfile.TemporaryDirectory(prefix="better-font-scale-") as temp:
        work = Path(temp)
        abi = work / "abi"
        classes = work / "classes"
        declarations = []
        for name, code in STUBS.items():
            path = work / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(code)
            declarations.append(path)

        compiler = ["javac"] if shutil.which("javac") else ["java", "com.sun.tools.javac.Main"]
        javac = [*compiler, "-source", "8", "-target", "8", "-Xlint:-options", "-g:none"]
        subprocess.run([*javac, "-cp", os.pathsep.join(map(str, (android, kotlin))),
                        "-d", abi, *declarations], check=True)
        subprocess.run([*javac, "-cp", os.pathsep.join(map(str, (android, kotlin, abi))),
                        "-d", classes, source], check=True)
        dex_jar = work / "dex.jar"
        subprocess.run(["java", "-cp", d8, "com.android.tools.r8.D8", "--min-api", "24",
                        "--lib", android, "--classpath", kotlin, "--classpath", abi,
                        "--output", dex_jar, *sorted(classes.rglob("*.class"))], check=True)
        with zipfile.ZipFile(dex_jar) as dex:
            payload = dex.read("classes.dex")

    output = PLUGIN / "plugin.jar"
    entry = zipfile.ZipInfo("classes.dex", (2026, 11, 16, 0, 0, 0))
    entry.external_attr = 0o100644 << 16
    with zipfile.ZipFile(output, "w") as archive:
        archive.writestr(entry, payload, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
    metadata = {
        "minAndroidApi": 24,
        "sourceSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        "sha256": hashlib.sha256(output.read_bytes()).hexdigest(),
    }
    (PLUGIN / "native-source.json").write_text(json.dumps(metadata, indent=2) + "\n")


if __name__ == "__main__":
    main()
