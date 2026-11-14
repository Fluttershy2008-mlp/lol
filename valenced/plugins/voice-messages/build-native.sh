#!/bin/sh
set -eu

plugin_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
tools_dir=$(CDPATH= cd -- "${1:?Pass the Android and Kotlin tools directory}" && pwd)
build_dir=$(mktemp -d)
trap 'rm -rf "$build_dir"' EXIT

android="$tools_dir/android.jar"
stdlib="$tools_dir/kotlin-stdlib-2.4.10.jar"
coroutines="$tools_dir/kotlinx-coroutines-core-jvm-1.11.0.jar"
xposed="$tools_dir/xposed.jar"

api_dir="$plugin_dir/source/valenced-api"
if [ ! -d "$api_dir" ]; then
    api_dir="$plugin_dir/../more-alts/source/valenced-api"
fi
find "$api_dir" -name '*.kt' | sort > "$build_dir/api.txt"
java -cp "$tools_dir/*" org.jetbrains.kotlin.cli.jvm.K2JVMCompiler \
    -no-stdlib -no-reflect -jvm-target 21 -language-version 2.0 -api-version 2.0 \
    -classpath "$stdlib:$coroutines:$android" -d "$build_dir/api" "@$build_dir/api.txt"

find "$plugin_dir/source/src/main/kotlin" -name '*.kt' | sort > "$build_dir/sources.txt"
java -cp "$tools_dir/*" org.jetbrains.kotlin.cli.jvm.K2JVMCompiler \
    -no-stdlib -no-reflect -jvm-target 21 -language-version 2.0 -api-version 2.0 \
    -classpath "$build_dir/api:$stdlib:$coroutines:$android:$xposed" -d "$build_dir/classes" "@$build_dir/sources.txt"
find "$build_dir/classes/com/rosie/voicemessages" -name '*.class' | sort > "$build_dir/plugin.txt"
mkdir "$build_dir/dex"
java -cp "$tools_dir/r8.jar" com.android.tools.r8.D8 --min-api 24 \
    --lib "$android" --classpath "$build_dir/api" --classpath "$stdlib" --classpath "$coroutines" --classpath "$xposed" \
    --output "$build_dir/dex" "@$build_dir/plugin.txt"
python3 - "$build_dir/dex/classes.dex" "$plugin_dir/plugin.jar" <<'PYTHON'
from pathlib import Path
import sys
from zipfile import ZipFile, ZipInfo

source, target = map(Path, sys.argv[1:])
with ZipFile(target, 'w') as jar:
    jar.writestr(ZipInfo('classes.dex', (1980, 1, 1, 0, 0, 0)), source.read_bytes())
PYTHON
