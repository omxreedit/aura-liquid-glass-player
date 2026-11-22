#!/system/bin/sh
# ============================================================
# AURA — build a signed, landscape-only APK on Termux
# (POSIX sh: runs with Android's /system/bin/sh, no env needed)
# ============================================================
# Requirements (Termux):
#   pkg install openjdk-17 aapt aapt2 d8 apksigner curl
#
# Usage:
#   ./android/build.sh
#
# Optional env:
#   AURA_VERSION=1.0.0
#   AURA_KS_PASS=auraplayer
#   AURA_KS_ALIAS=aura
# ============================================================

set -eu

ANDROID_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$ANDROID_DIR/.." && pwd)"

VERSION="${AURA_VERSION:-1.0.0}"
VERSION_CODE="${AURA_VERSION_CODE:-1}"
BUILD="$ANDROID_DIR/build"
GEN="$BUILD/gen"
CLASSES="$BUILD/classes"
DEX="$BUILD/dex"
ASSETS="$ANDROID_DIR/assets"
WEB="$ASSETS/www"
SDK_JAR="${ANDROID_JAR:-$ANDROID_DIR/libs/android.jar}"
KEYSTORE="${AURA_KEYSTORE:-$ANDROID_DIR/keystore/aura-release.jks}"
KS_PASS="${AURA_KS_PASS:-auraplayer}"
KS_ALIAS="${AURA_KS_ALIAS:-aura}"
OUT_DIR="$ROOT/release"
OUT="$OUT_DIR/aura-$VERSION.apk"

PREFIX="${PREFIX:-/data/data/com.termux/files/usr}"
AAPT="$PREFIX/bin/aapt"
JAVAC="$PREFIX/bin/javac"
KEYTOOL="$PREFIX/bin/keytool"
D8="$PREFIX/bin/d8"
APKSIGNER="$PREFIX/bin/apksigner"
CURL="$PREFIX/bin/curl"

for tool in "$AAPT" "$JAVAC" "$KEYTOOL" "$D8" "$APKSIGNER"; do
  if [ ! -x "$tool" ]; then
    echo "Missing tool: $tool" >&2
    echo "Install with: pkg install openjdk-17 aapt aapt2 d8 apksigner curl" >&2
    exit 1
  fi
done

# android.jar is large; fetch it once instead of committing it.
if [ ! -f "$SDK_JAR" ]; then
  echo "Downloading android.jar (API 34)…"
  mkdir -p "$(dirname "$SDK_JAR")"
  "$CURL" -L --fail --retry 3 -o "$SDK_JAR" \
    "https://raw.githubusercontent.com/Sable/android-platforms/master/android-34/android.jar"
fi

# icon (only if missing)
if [ ! -f "$ANDROID_DIR/res/drawable/ic_launcher.png" ]; then
  python3 "$ANDROID_DIR/tools/make_icon.py"
fi

rm -rf "$BUILD"
mkdir -p "$GEN" "$CLASSES" "$DEX" "$WEB" "$OUT_DIR"

# ---- bundle the web player into assets/www ----
cp "$ROOT/index.html" "$ROOT/styles.css" "$ROOT/app.js" "$WEB/"

# ---- resources -> R.java ----
"$AAPT" package -f -m \
  -J "$GEN" \
  -M "$ANDROID_DIR/AndroidManifest.xml" \
  -S "$ANDROID_DIR/res" \
  -I "$SDK_JAR"

# ---- Java -> class files ----
find "$ANDROID_DIR/src" "$GEN" -name '*.java' > "$BUILD/sources.txt"
"$JAVAC" -source 8 -target 8 -encoding UTF-8 -Xlint:-options \
  -bootclasspath "$SDK_JAR" \
  -d "$CLASSES" \
  @"$BUILD/sources.txt"

# ---- class files -> classes.dex ----
"$D8" --lib "$SDK_JAR" --min-api 23 --output "$DEX" \
  $(find "$CLASSES" -name '*.class')

# ---- resources + assets -> unsigned APK ----
"$AAPT" package -f \
  --version-code "$VERSION_CODE" \
  --version-name "$VERSION" \
  -M "$ANDROID_DIR/AndroidManifest.xml" \
  -S "$ANDROID_DIR/res" \
  -A "$ASSETS" \
  -I "$SDK_JAR" \
  -F "$BUILD/unsigned.apk"

# add the dex at the archive root
(cd "$DEX" && "$AAPT" add "$BUILD/unsigned.apk" classes.dex)

# ---- signing key (demo key, committed for reproducible builds) ----
if [ ! -f "$KEYSTORE" ]; then
  echo "Generating release keystore…"
  mkdir -p "$(dirname "$KEYSTORE")"
  "$KEYTOOL" -genkeypair \
    -keystore "$KEYSTORE" \
    -storepass "$KS_PASS" -keypass "$KS_PASS" \
    -alias "$KS_ALIAS" -keyalg RSA -keysize 2048 -validity 10000 \
    -dname "CN=AURA, OU=Liquid Crystal, O=AURA, L=Internet, C=IN"
fi

# ---- sign ----
"$APKSIGNER" sign \
  --ks "$KEYSTORE" \
  --ks-pass "pass:$KS_PASS" \
  --key-pass "pass:$KS_PASS" \
  --ks-key-alias "$KS_ALIAS" \
  --v4-signing-enabled false \
  --out "$OUT" \
  "$BUILD/unsigned.apk"

"$APKSIGNER" verify --verbose "$OUT" | head -n 12
( cd "$OUT_DIR" && sha256sum "$(basename "$OUT")" > "$(basename "$OUT").sha256" )

echo
echo "Built: $OUT"
echo "SHA256: $(cut -d' ' -f1 "$OUT.sha256")"
