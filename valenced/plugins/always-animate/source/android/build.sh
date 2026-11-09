#!/bin/sh
# Rebuild the native helper using a local JDK and Android's dx.jar.
set -eu
: "${DX_JAR:?Set DX_JAR to your local Android dx.jar}"
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
project_dir=$(CDPATH= cd -- "$script_dir/../.." && pwd)
build_dir="$project_dir/native-build"
mkdir -p "$build_dir/stub-classes" "$build_dir/classes" "$project_dir/android"
find "$build_dir/classes" -name '*.class' -delete
find "$script_dir/compile-stubs" -name '*.java' > "$build_dir/stubs.txt"
java com.sun.tools.javac.Main --release 7 -Xlint:-options -d "$build_dir/stub-classes" @"$build_dir/stubs.txt"
java com.sun.tools.javac.Main --release 7 -Xlint:-options -cp "$build_dir/stub-classes" -d "$build_dir/classes" "$script_dir/AlwaysAnimateNative.java" "$script_dir/ApngFrames.java" "$script_dir/BundledFramePlayer.java"
java -cp "$DX_JAR" com.android.dx.command.Main --dex --output="$project_dir/android/always-animate.jar" "$build_dir/classes"
