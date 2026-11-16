#!/usr/bin/env python3
"""Build the Android payload using a JDK, ANDROID_JAR and D8_JAR."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

ROOT = Path(__file__).resolve().parent.parent
SOURCE_FILES = sorted((ROOT / "source").glob("*.java"))
STUBS = {
    "app/valenced/plugins/PluginBuilder.java": """package app.valenced.plugins;
        import kotlin.Unit;
        import kotlin.jvm.functions.Function1;
        public class PluginBuilder {
            public void start(Function1<PluginScope, Unit> handler) {}
            public void stop(Function1<PluginScope, Unit> handler) {}
        }""",
    "app/valenced/plugins/PluginScope.java": """package app.valenced.plugins;
        public interface PluginScope extends app.valenced.xposed.api.HostScope {}""",
    "app/valenced/xposed/api/HostScope.java": """package app.valenced.xposed.api;
        public interface HostScope {
            ClassLoader getClassLoader();
            app.valenced.bridge.ValencedBridge getBridge();
        }""",
    "app/valenced/bridge/ValencedBridge.java": """package app.valenced.bridge;
        public interface ValencedBridge {
            void registerMethod(String name, kotlin.jvm.functions.Function1<java.util.List<?>, Object> handler);
        }""",
    "kotlin/Unit.java": "package kotlin; public final class Unit { public static final Unit INSTANCE = new Unit(); }",
    "kotlin/jvm/functions/Function1.java": """package kotlin.jvm.functions;
        public interface Function1<P, R> { R invoke(P value); }""",
    "de/robv/android/xposed/XC_MethodHook.java": """package de.robv.android.xposed;
        public abstract class XC_MethodHook {
            protected void beforeHookedMethod(MethodHookParam param) throws Throwable {}
            protected void afterHookedMethod(MethodHookParam param) throws Throwable {}
            public static class MethodHookParam { public Object thisObject; public Object[] args; }
            public class Unhook { public void unhook() {} }
        }""",
    "de/robv/android/xposed/XposedBridge.java": """package de.robv.android.xposed;
        public class XposedBridge {
            public static XC_MethodHook.Unhook hookMethod(java.lang.reflect.Member member, XC_MethodHook hook) { return null; }
            public static void log(String message) {}
        }""",
}


def main():
    sdk = Path(os.environ["ANDROID_JAR"]).resolve()
    d8 = Path(os.environ["D8_JAR"]).resolve()
    javac = ["java", "com.sun.tools.javac.Main", "-source", "8", "-target", "8", "-Xlint:-options", "-g:none"]
    with tempfile.TemporaryDirectory(prefix="better-font-scale-") as temporary:
        build = Path(temporary)
        for name, content in STUBS.items():
            path = build / "stubs" / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content)
        abi = build / "abi"
        classes = build / "classes"
        subprocess.run([*javac, "-d", abi, *sorted((build / "stubs").rglob("*.java"))], check=True)
        subprocess.run([*javac, "-cp", f"{sdk}{os.pathsep}{abi}", "-d", classes, *SOURCE_FILES], check=True)
        output = build / "dex.zip"
        subprocess.run(["java", "-cp", d8, "com.android.tools.r8.D8", "--min-api", "24", "--lib", sdk,
                        "--classpath", abi, "--output", output, *sorted(classes.rglob("*.class"))], check=True)
        with ZipFile(output) as archive:
            dex = archive.read("classes.dex")

    target = ROOT / "plugin.jar"
    with ZipFile(target, "w") as archive:
        info = ZipInfo("classes.dex", (2026, 11, 16, 0, 0, 0))
        info.compress_type = ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        archive.writestr(info, dex, compresslevel=9)
    metadata = {
        "minAndroidApi": 24,
        "entryPoint": "dev.fluttershy2008.fontscale.BetterFontScale",
        "sources": {path.relative_to(ROOT).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
                    for path in SOURCE_FILES},
        "sha256": hashlib.sha256(target.read_bytes()).hexdigest(),
    }
    (ROOT / "native-source.json").write_text(json.dumps(metadata, indent=2) + "\n")


if __name__ == "__main__":
    main()
