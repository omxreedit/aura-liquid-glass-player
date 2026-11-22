# AURA — Liquid Crystal Music Player

A 3D **liquid-crystal glass** music player that runs entirely in the browser.
No build step, no frameworks, no external audio files — the three built-in
ambient tracks are synthesised on the fly with the Web Audio API.

<img src="banner.svg" alt="AURA — liquid crystal music player" width="100%" />

## Features

- **3D glass player** — pointer-reactive tilt with layered depth, glare and
  refraction highlights.
- **Liquid crystal disc** — animated conic gradients distorted through an SVG
  turbulence/displacement filter.
- **Generative ambient library** — 3 tracks (Neon Tide, Chrome Bloom, Glass
  Horizon) rendered offline with pads, bass, arpeggios, delay and convolution
  reverb, then encoded to WAV in the browser.
- **Reactive visualizer** — canvas bars driven by a real `AnalyserNode`, with a
  calm idle waveform when paused.
- **Full transport** — play/pause, previous/next, seek, volume, mute, shuffle
  and repeat (off / all / one).
- **Bring your own music** — add local audio via the file picker or drag & drop.
- **Extras** — keyboard shortcuts, Media Session lock-screen controls, dynamic
  colour themes per track, responsive layout, reduced-motion support.

## Run it

It's a static site. Open `index.html` directly, or serve the folder:

```bash
python3 -m http.server 8080
# then visit http://localhost:8080
```

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `Space` | Play / pause |
| `←` / `→` | Seek 5 seconds |
| `N` / `P` | Next / previous track |
| `M` | Mute |

## How the audio works

Each preset is rendered with `OfflineAudioContext` into a stereo buffer, then
converted to a 16-bit WAV `Blob` and played through a single `<audio>` element.
That element is routed into an `AnalyserNode`, so the same visualizer works for
both generated tracks and files you add.

## Tech

Vanilla HTML, CSS and JavaScript. No dependencies. Fonts (Manrope, Space
Grotesk) load from Google Fonts with system fallbacks.

## License

MIT
