#!/usr/bin/env python3
"""Compile against an Android SDK and Valenced's documented Java/Kotlin ABI.

ANDROID_JAR selects a platform >= 28. D8_JAR or DX_JAR selects the dex compiler.
--check compiles the source against the SDK, verifies the
checked-in payload and source hashes without replacing the release compiler output.
Compile-only API declarations below are never included in plugin.jar.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parent.parent
NATIVE = ROOT / 'source/native'
STUBS = {
    'kotlin/Unit.java': 'package kotlin; public final class Unit { public static final Unit INSTANCE = new Unit(); }',
    'kotlin/jvm/functions/Function1.java': 'package kotlin.jvm.functions; public interface Function1<P,R> { R invoke(P p); }',
    'app/valenced/plugins/PluginBuilder.java': '''package app.valenced.plugins; import kotlin.Unit; import kotlin.jvm.functions.Function1;
        public class PluginBuilder { public void start(Function1<PluginScope,Unit> f) {} public void stop(Function1<PluginScope,Unit> f) {} }''',
    'app/valenced/plugins/PluginScope.java': 'package app.valenced.plugins; public interface PluginScope extends app.valenced.xposed.api.HostScope {}',
    'app/valenced/xposed/api/HostScope.java': '''package app.valenced.xposed.api; import kotlin.Unit; import kotlin.jvm.functions.Function1;
        public interface HostScope { app.valenced.bridge.ValencedBridge getBridge();
        void withAppContext(Function1<android.content.Context,Unit> f); void withAppActivity(Function1<android.app.Activity,Unit> f); }''',
    'app/valenced/bridge/ValencedBridge.java': '''package app.valenced.bridge; import java.util.List; import kotlin.jvm.functions.Function1;
        public interface ValencedBridge { void registerMethod(String name, Function1<List<?>,Object> f); }''',
    'de/robv/android/xposed/XC_MethodHook.java': '''package de.robv.android.xposed;
        public abstract class XC_MethodHook { protected void afterHookedMethod(MethodHookParam p) throws Throwable {}
        public static class MethodHookParam { public Object[] args; }
        public class Unhook { public void unhook() {} } }''',
    'de/robv/android/xposed/XposedBridge.java': '''package de.robv.android.xposed; import java.lang.reflect.Member;
        public final class XposedBridge { public static XC_MethodHook.Unhook hookMethod(Member m, XC_MethodHook hook) { return null; } }''',
}

def fingerprint():
    return {p.relative_to(ROOT).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(NATIVE.rglob('*.java'))}


def verify_companion():
    metadata = json.loads((ROOT / 'companion-build.json').read_text())
    apk = ROOT / metadata['apk']
    assert metadata['sha256'] == hashlib.sha256(apk.read_bytes()).hexdigest(), 'Companion APK hash mismatch.'
    for name, digest in metadata['sources'].items():
        assert digest == hashlib.sha256((ROOT / 'nano-companion' / name).read_bytes()).hexdigest(), 'Companion source changed: rebuild APK.'
    with zipfile.ZipFile(apk) as package:
        assert package.testzip() is None
        dex = b''.join(package.read(name) for name in package.namelist() if name.endswith('.dex'))
        assert b'Ldev/fluttershy2008/mathnano/NanoActivity;' in dex
        assert b'Lcom/google/mlkit/genai/prompt/Generation;' in dex
        assert b"Nano's answer was cut off." in dex
    print('Companion source fingerprints, APK integrity and real ML Kit classes verified.')

def sdk_path():
    if os.environ.get('ANDROID_JAR'):
        return Path(os.environ['ANDROID_JAR'])
    for var in ('ANDROID_HOME', 'ANDROID_SDK_ROOT'):
        directory = Path(os.environ.get(var, '/nonexistent')) / 'platforms'
        candidates = [p for p in directory.glob('android-*/android.jar') if p.parent.name.removeprefix('android-').isdigit()]
        candidates.sort(key=lambda p: int(p.parent.name[8:]), reverse=True)
        if candidates:
            return candidates[0]
    raise RuntimeError('Set ANDROID_JAR to an Android SDK platform >= 28.')

def run(args):
    subprocess.run([str(x) for x in args], check=True)

def main(check):
    sdk = sdk_path()
    if not zipfile.is_zipfile(sdk):
        raise RuntimeError('ANDROID_JAR is not a valid Android SDK jar.')
    javac = ['javac'] if shutil.which('javac') else ['java', 'com.sun.tools.javac.Main']
    with tempfile.TemporaryDirectory(prefix='math-nano-bridge-') as temporary:
        build = Path(temporary); declarations = build / 'stubs'; abi = build / 'abi'; classes = build / 'classes'
        for name, value in STUBS.items():
            p = declarations / name; p.parent.mkdir(parents=True, exist_ok=True); p.write_text(value)
        abi.mkdir(); classes.mkdir()
        run([*javac, '--release', '7', '-Xlint:-options', '-g:none', '-cp', sdk, '-d', abi, *sorted(declarations.rglob('*.java'))])
        run([*javac, '--release', '7', '-Xlint:-options', '-g:none', '-cp', str(sdk) + os.pathsep + str(abi), '-d', classes, *sorted(NATIVE.rglob('*.java'))])
        if check:
            verify_companion()
            metadata = json.loads((ROOT / 'native-source.json').read_text())
            assert metadata['sources'] == fingerprint(), 'Native source changed: rebuild plugin.jar.'
            assert metadata['sha256'] == hashlib.sha256((ROOT / 'plugin.jar').read_bytes()).hexdigest(), 'Payload hash mismatch.'
            with zipfile.ZipFile(ROOT / 'plugin.jar') as z:
                assert z.namelist() == ['classes.dex']
                dex = z.read('classes.dex')
                assert dex.startswith(b'dex\n') and b'Ldev/fluttershy2008/mathai/NanoBridge;' in dex
                assert b'Landroid/content/Intent;' in dex
            print('Android bridge compilation and checked-in DEX verified.')
            return
        raw = build / 'raw.jar'
        dx = os.environ.get('DX_JAR'); d8 = os.environ.get('D8_JAR')
        if dx:
            run(['java', '-jar', dx, '--dex', '--output=' + str(raw), classes])
        elif d8:
            run(['java', '-cp', d8, 'com.android.tools.r8.D8', '--min-api', '28', '--lib', sdk, '--classpath', abi,
                 '--output', raw, *sorted(classes.rglob('*.class'))])
        else:
            raise RuntimeError('Set D8_JAR or DX_JAR to build the Android payload.')
        with zipfile.ZipFile(raw) as z:
            dex = z.read('classes.dex')
        with zipfile.ZipFile(ROOT / 'plugin.jar', 'w', zipfile.ZIP_DEFLATED) as z:
            info = zipfile.ZipInfo('classes.dex', (2026, 11, 1, 0, 0, 0)); info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16; z.writestr(info, dex, compresslevel=9)
        metadata = {'minAndroidApi': 28, 'entryPoint': 'dev.fluttershy2008.mathai.NanoBridge',
                    'sources': fingerprint(), 'sha256': hashlib.sha256((ROOT / 'plugin.jar').read_bytes()).hexdigest()}
        (ROOT / 'native-source.json').write_text(json.dumps(metadata, indent=2) + '\n')
        print('Built plugin.jar: native classes only; compile-time API declarations excluded.')

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    main(parser.parse_args().check)
