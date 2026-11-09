#!/bin/sh
set -eu
project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$project_dir"
mkdir -p native-build/stub-classes native-build/classes native-build/test-classes native-build/fixtures native-build/bundled-storage/frame-cache
find native-build/classes native-build/test-classes -name '*.class' -delete
find source/android/compile-stubs -name '*.java' > native-build/stubs.txt
find tests/native -name '*.java' > native-build/tests.txt
# JVM-only tests target Java 8 so current JDKs (including 21) can run them.
# This does not rebuild or alter the packaged Android DEX helper.
java com.sun.tools.javac.Main -source 8 -target 8 -Xlint:-options -d native-build/stub-classes @native-build/stubs.txt
java com.sun.tools.javac.Main -source 8 -target 8 -Xlint:-options -cp native-build/stub-classes -d native-build/classes source/android/AlwaysAnimateNative.java source/android/ApngFrames.java source/android/BundledFramePlayer.java
java com.sun.tools.javac.Main -source 8 -target 8 -Xlint:-options -cp native-build/stub-classes:native-build/classes -d native-build/test-classes @native-build/tests.txt
cp tests/fixtures/*.png native-build/fixtures/
python3 - <<'PY'
from pathlib import Path
from hashlib import sha256
url='https://cdn.discordapp.com/avatar-decoration-presets/a_fixture.png?passthrough=true'
for address in [url,'https://cdn.discordapp.com/media/v1/collectibles-shop/123456/animated']:
 Path('native-build/bundled-storage/frame-cache/'+sha256(address.encode()).hexdigest()+'.png').write_bytes(Path('tests/fixtures/frames.png').read_bytes())
PY
for test in NativeSmoke RenamedSmoke ChatAvatarSmoke OverlayVisibilitySmoke ModernDecorationSmoke RequestDecorationSmoke FrescoImagesSmoke BundledPixelsSmoke BundledDecorationSmoke MetadataCacheSmoke; do
 java -cp native-build/stub-classes:native-build/classes:native-build/test-classes "$test"
done
