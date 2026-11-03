#!/usr/bin/env python3
"""Run host-side input-span checks with compile-only Android ABI declarations."""
from pathlib import Path
import os
import runpy
import shutil
import subprocess
import tempfile

HERE = Path(__file__).resolve().parent
STUBS = dict(runpy.run_path(str(HERE / 'build_native.py'))['STUBS'])
STUBS.update({
    'android/content/Context.java': 'package android.content; public class Context { public ClassLoader getClassLoader() { return getClass().getClassLoader(); } }',
    'android/view/View.java': 'package android.view; public class View {}',
    'android/app/Activity.java': 'package android.app; public class Activity { public android.view.View getCurrentFocus() { return null; } }',
    'android/os/Looper.java': 'package android.os; public class Looper { public static Looper getMainLooper() { return null; } }',
    'android/os/Handler.java': 'package android.os; public class Handler { public Handler(Looper l) {} public boolean post(Runnable r) { return true; } }',
    'android/text/Spanned.java': 'package android.text; public interface Spanned extends CharSequence { <T> T[] getSpans(int s,int e,Class<T> t); int getSpanStart(Object s); int getSpanEnd(Object s); int getSpanFlags(Object s); }',
    'android/text/Spannable.java': 'package android.text; public interface Spannable extends Spanned { void setSpan(Object o,int s,int e,int f); void removeSpan(Object o); }',
    'android/text/Editable.java': 'package android.text; public interface Editable extends Spannable {}',
    'android/text/TextWatcher.java': 'package android.text; public interface TextWatcher { void beforeTextChanged(CharSequence s,int a,int b,int c); void onTextChanged(CharSequence s,int a,int b,int c); void afterTextChanged(Editable t); }',
    'android/graphics/Paint.java': 'package android.graphics; public class Paint { public static class FontMetricsInt {} public int getFontMetricsInt(FontMetricsInt m) { return 20; } public float measureText(String t) { return t.length()*10f; } }',
    'android/graphics/Canvas.java': 'package android.graphics; public class Canvas { public void drawText(String t,float x,float y,Paint p) {} }',
    'android/text/style/ReplacementSpan.java': 'package android.text.style; import android.graphics.*; public abstract class ReplacementSpan { public abstract int getSize(Paint p,CharSequence t,int s,int e,Paint.FontMetricsInt m); public abstract void draw(Canvas c,CharSequence t,int s,int e,float x,int top,int y,int b,Paint p); }',
    'android/widget/TextView.java': 'package android.widget; import android.text.*; public class TextView extends android.view.View { public Editable getEditableText() { return null; } public void addTextChangedListener(TextWatcher w) {} public void removeTextChangedListener(TextWatcher w) {} public int getSelectionStart() { return 0; } public int getSelectionEnd() { return 0; } public boolean hasFocus() { return true; } public void requestLayout() {} public void invalidate() {} protected void onTextChanged(CharSequence s,int a,int b,int c) {} protected void onSelectionChanged(int a,int b) {} }',
})

with tempfile.TemporaryDirectory(prefix='math-currency-tests-') as temporary:
    root = Path(temporary); declarations = root / 'stubs'; abi = root / 'abi'; classes = root / 'classes'
    abi.mkdir(); classes.mkdir()
    for name, content in STUBS.items():
        p = declarations / name; p.parent.mkdir(parents=True, exist_ok=True); p.write_text(content)
    compiler = ['javac'] if shutil.which('javac') else ['java', 'com.sun.tools.javac.Main']
    compiler += ['--release', '7', '-Xlint:-options']
    subprocess.run([*compiler, '-d', str(abi), *map(str, sorted(declarations.rglob('*.java')))], check=True)
    subprocess.run([*compiler, '-cp', str(abi), '-d', str(classes), str(HERE / 'native/dev/fluttershy2008/mathai/CurrencyPreview.java'), str(HERE / 'CurrencyPreviewTest.java')], check=True)
    subprocess.run(['java', '-cp', str(abi) + os.pathsep + str(classes), 'dev.fluttershy2008.mathai.CurrencyPreviewTest'], check=True)
