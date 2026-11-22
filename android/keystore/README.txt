# Demo signing key

`aura-release.jks` is a **demo** release keystore committed so anyone can
reproduce the APK in this repo.

- alias: `aura`
- store password: `auraplayer`
- key password: `auraplayer`
- algorithm: RSA 2048, validity 10000 days

This key is public. Do not use it for a real product — generate your own
private key and keep it secret. If you publish updates, keep using the same key,
otherwise Android will reject the update over an installed copy.
