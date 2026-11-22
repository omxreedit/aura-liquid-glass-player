# AURA — Android wrapper

A tiny, **landscape-only** WebView shell around the web player in the repo root.

- `android:screenOrientation="sensorLandscape"` → never portrait, rotates between
  both landscape directions.
- Immersive fullscreen, transparent system bars, screen kept awake.
- Loads `assets/www/index.html` (the web player is copied there by `build.sh`).
- Native `ACTION_GET_CONTENT` file picker so "Add music" works inside the APK.
- `minSdk 23` (Android 6+), `targetSdk 34`.

## Build

```sh
pkg install openjdk-17 aapt aapt2 d8 apksigner curl
./android/build.sh
```

Output:

```
release/aura-1.0.0.apk
release/aura-1.0.0.apk.sha256
```

`build.sh` downloads `android.jar` (API 34) into `android/libs/` on the first
run, generates the launcher icon if needed, bundles the web app into
`android/assets/www/`, compiles the Java, dexes it with `d8`, packages with
`aapt`, and signs with `apksigner`.

Useful env vars:

| Variable | Default | Meaning |
| --- | --- | --- |
| `AURA_VERSION` | `1.0.0` | versionName and APK filename |
| `AURA_VERSION_CODE` | `1` | versionCode |
| `AURA_KS_PASS` | `auraplayer` | keystore / key password |
| `AURA_KS_ALIAS` | `aura` | key alias |
| `ANDROID_JAR` | `android/libs/android.jar` | platform jar |

## Signing key

The repo includes a **demo** release keystore so builds are reproducible:

- file: `android/keystore/aura-release.jks`
- alias: `aura`
- password: `auraplayer`

Anyone can sign with it — replace it with your own private key before shipping
a real product. Keep the same key between versions, otherwise Android will
refuse to install an update over the existing app.

## Install

```sh
adb install -r release/aura-1.0.0.apk
```

Or copy the APK to the phone and tap it (allow "install unknown apps" for the
file manager / browser you use).
