/* ============================================================
   AURA — Liquid Crystal Music Player
   Generative ambient audio + reactive liquid-glass visuals
   ============================================================ */

(() => {
  "use strict";

  /* ---------------- helpers ---------------- */

  const $ = (sel, root = document) => root.querySelector(sel);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const NOTE = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

  const fmt = (sec) => {
    if (!isFinite(sec) || sec < 0) sec = 0;
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  const esc = (str) =>
    String(str).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c]));

  /* ---------------- palettes ---------------- */

  const PALETTES = [
    ["#7c5cff", "#22d3ee", "#ff5fd2"],
    ["#ff9a3d", "#ff3d81", "#7c5cff"],
    ["#2ee6a8", "#22d3ee", "#5b8cff"],
    ["#f5d76e", "#ff7a59", "#c86bff"],
    ["#8ef0ff", "#6a7dff", "#ff6ad5"],
    ["#b6ff6a", "#2ee6a8", "#22d3ee"],
  ];

  /* ---------------- presets ---------------- */

  const PRESETS = [
    {
      title: "Neon Tide",
      artist: "AURA Ensemble",
      palette: 0,
      bpm: 74,
      brightness: 1350,
      chords: [
        [57, 60, 64, 67, 71],
        [53, 57, 60, 64, 67],
        [48, 52, 55, 59, 62],
        [55, 59, 62, 67, 69],
      ],
      bass: [45, 41, 36, 43],
    },
    {
      title: "Chrome Bloom",
      artist: "AURA Ensemble",
      palette: 1,
      bpm: 68,
      brightness: 1100,
      chords: [
        [50, 53, 57, 60, 64],
        [46, 50, 53, 57, 60],
        [43, 46, 50, 53, 57],
        [45, 49, 52, 55, 59],
      ],
      bass: [38, 34, 31, 33],
    },
    {
      title: "Glass Horizon",
      artist: "AURA Ensemble",
      palette: 2,
      bpm: 82,
      brightness: 1600,
      chords: [
        [52, 55, 59, 62, 66],
        [48, 52, 55, 59, 62],
        [43, 47, 50, 55, 59],
        [50, 54, 57, 62, 66],
      ],
      bass: [40, 36, 31, 38],
    },
  ];

  /* ---------------- state ---------------- */

  const state = {
    tracks: [],
    index: 0,
    playing: false,
    repeat: "off", // off | all | one
    shuffle: false,
    seeking: false,
    theme: PALETTES[0],
    booted: false,
  };

  const audio = new Audio();
  audio.preload = "auto";
  audio.volume = 0.82;

  let actx = null;
  let analyser = null;
  let freqData = null;
  let mediaSrc = null;

  /* ---------------- dom ---------------- */

  const dom = {
    body: document.body,
    title: $("#title"),
    artist: $("#artist"),
    badge: $("#badgeText"),
    stateText: $("#stateText"),
    disc: $("#disc"),
    discArt: $("#discArt"),
    discGlow: $("#discGlow"),
    seek: $("#seek"),
    cur: $("#cur"),
    dur: $("#dur"),
    play: $("#play"),
    prev: $("#prev"),
    next: $("#next"),
    shuffle: $("#shuffle"),
    repeat: $("#repeat"),
    mute: $("#mute"),
    vol: $("#vol"),
    tracks: $("#tracks"),
    count: $("#count"),
    viz: $("#viz"),
    player: $("#player"),
    glare: $("#glare"),
    boot: $("#boot"),
    bootText: $("#bootText"),
    toast: $("#toast"),
    drop: $("#drop"),
    fileInput: $("#fileInput"),
    addBtn: $("#addBtn"),
  };

  /* ---------------- theme / disc ---------------- */

  function applyTheme(palette) {
    state.theme = palette;
    const root = document.documentElement.style;
    root.setProperty("--a1", palette[0]);
    root.setProperty("--a2", palette[1]);
    root.setProperty("--a3", palette[2]);
  }

  function paintDisc(palette) {
    const [a, b, c] = palette;
    dom.discArt.style.background = `
      radial-gradient(circle at 30% 26%, ${a} 0%, transparent 52%),
      radial-gradient(circle at 74% 70%, ${b} 0%, transparent 56%),
      radial-gradient(circle at 50% 50%, ${c} 0%, transparent 72%),
      linear-gradient(135deg, #0a0c14, #161a2a)`;
    dom.discGlow.style.background = `radial-gradient(circle, ${a}, transparent 68%)`;
  }

  /* ---------------- audio graph ---------------- */

  function ensureAudio() {
    if (actx) {
      if (actx.state === "suspended") actx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    actx = new Ctx();
    analyser = actx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.82;
    freqData = new Uint8Array(analyser.frequencyBinCount);
    try {
      mediaSrc = actx.createMediaElementSource(audio);
      mediaSrc.connect(analyser);
      analyser.connect(actx.destination);
    } catch (err) {
      console.warn("Audio graph unavailable:", err);
    }
  }

  /* ---------------- wav encoding ---------------- */

  function audioBufferToWav(buffer) {
    const numCh = buffer.numberOfChannels;
    const len = buffer.length;
    const bytesPerSample = 2;
    const blockAlign = numCh * bytesPerSample;
    const dataSize = len * blockAlign;
    const ab = new ArrayBuffer(44 + dataSize);
    const view = new DataView(ab);

    const writeStr = (offset, str) => {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    };

    writeStr(0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    writeStr(8, "WAVE");
    writeStr(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numCh, true);
    view.setUint32(24, buffer.sampleRate, true);
    view.setUint32(28, buffer.sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true);
    writeStr(36, "data");
    view.setUint32(40, dataSize, true);

    const channels = [];
    for (let c = 0; c < numCh; c++) channels.push(buffer.getChannelData(c));

    let offset = 44;
    for (let i = 0; i < len; i++) {
      for (let c = 0; c < numCh; c++) {
        let s = channels[c][i];
        s = s < -1 ? -1 : s > 1 ? 1 : s;
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        offset += 2;
      }
    }

    return new Blob([ab], { type: "audio/wav" });
  }

  /* ---------------- synth ---------------- */

  function makeImpulse(ctx, seconds = 3.6, decay = 2.6) {
    const rate = ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  async function renderPreset(preset) {
    const sr = 44100;
    const beat = 60 / preset.bpm;
    const chordDur = beat * 4;
    const progression = [...preset.chords, ...preset.chords];
    const total = chordDur * progression.length;

    const off = new OfflineAudioContext(2, Math.ceil(sr * total), sr);

    const master = off.createGain();
    master.gain.value = 0.72;

    const comp = off.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 22;
    comp.ratio.value = 3;
    comp.attack.value = 0.02;
    comp.release.value = 0.3;
    master.connect(comp);
    comp.connect(off.destination);

    // reverb
    const conv = off.createConvolver();
    conv.buffer = makeImpulse(off);
    const wet = off.createGain();
    wet.gain.value = 0.34;
    master.connect(conv);
    conv.connect(wet);
    wet.connect(off.destination);

    // delay send
    const delay = off.createDelay(2);
    delay.delayTime.value = beat * 0.75;
    const fb = off.createGain();
    fb.gain.value = 0.3;
    const dWet = off.createGain();
    dWet.gain.value = 0.22;
    delay.connect(fb);
    fb.connect(delay);
    delay.connect(dWet);
    dWet.connect(master);
    delay.connect(wet);

    progression.forEach((chord, i) => {
      const t0 = i * chordDur;
      const secondPass = i >= preset.chords.length;

      // ---- pad ----
      chord.forEach((midi, j) => {
        const osc = off.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.value = NOTE(midi);
        osc.detune.value = j % 2 ? 6 : -6;

        const filt = off.createBiquadFilter();
        filt.type = "lowpass";
        filt.frequency.value = preset.brightness;
        filt.Q.value = 0.6;

        const gain = off.createGain();
        const atk = 1.8;
        const rel = 2.6;
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(0.032, t0 + atk);
        gain.gain.setValueAtTime(0.032, t0 + chordDur - 0.1);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + chordDur + rel);

        const pan = off.createStereoPanner();
        pan.pan.value = (j / Math.max(1, chord.length - 1)) * 1.2 - 0.6;

        osc.connect(filt);
        filt.connect(gain);
        gain.connect(pan);
        pan.connect(master);

        osc.start(t0);
        osc.stop(t0 + chordDur + rel + 0.05);
      });

      // ---- bass ----
      const bassOsc = off.createOscillator();
      bassOsc.type = "sine";
      bassOsc.frequency.value = NOTE(preset.bass[i % preset.bass.length]);

      const bassGain = off.createGain();
      bassGain.gain.setValueAtTime(0.0001, t0);
      bassGain.gain.exponentialRampToValueAtTime(0.1, t0 + 0.7);
      bassGain.gain.setValueAtTime(0.1, t0 + chordDur - 0.45);
      bassGain.gain.exponentialRampToValueAtTime(0.0001, t0 + chordDur + 0.85);

      bassOsc.connect(bassGain);
      bassGain.connect(master);
      bassOsc.start(t0);
      bassOsc.stop(t0 + chordDur + 0.9);

      // ---- arpeggio ----
      const steps = 8;
      const stepDur = chordDur / steps;
      const arpNotes = chord.map((n) => n + 12);

      for (let s = 0; s < steps; s++) {
        if (s % 2 === 1 && Math.random() < 0.32) continue;

        const midi =
          arpNotes[(s + i) % arpNotes.length] + (secondPass && s % 4 === 2 ? 12 : 0);
        const t = t0 + s * stepDur;

        const osc = off.createOscillator();
        osc.type = "triangle";
        osc.frequency.value = NOTE(midi);

        const gain = off.createGain();
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.05, t + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.52);

        osc.connect(gain);
        gain.connect(master);
        gain.connect(delay);

        osc.start(t);
        osc.stop(t + 0.62);
      }
    });

    return off.startRendering();
  }

  /* ---------------- library ---------------- */

  async function buildLibrary() {
    for (let i = 0; i < PRESETS.length; i++) {
      const preset = PRESETS[i];
      dom.bootText.textContent = `Synthesizing crystal audio… ${i + 1}/${PRESETS.length}`;

      const buffer = await renderPreset(preset);
      const blob = audioBufferToWav(buffer);
      const palette = PALETTES[preset.palette % PALETTES.length];

      state.tracks.push({
        id: `gen-${i}`,
        title: preset.title,
        artist: preset.artist,
        kind: "Generated · Ambient",
        palette,
        url: URL.createObjectURL(blob),
        duration: buffer.duration,
        generated: true,
      });

      renderQueue();

      if (i === 0) {
        state.index = 0;
        applyTheme(palette);
        paintDisc(palette);
        updateMeta();
        audio.src = state.tracks[0].url;
        dom.dur.textContent = fmt(buffer.duration);
      }
    }
  }

  /* ---------------- queue ---------------- */

  function renderQueue() {
    dom.tracks.innerHTML = "";
    state.tracks.forEach((track, i) => {
      const li = document.createElement("li");
      li.className = "track" + (i === state.index ? " active" : "");
      li.dataset.i = String(i);
      li.innerHTML = `
        <span class="tnum">${String(i + 1).padStart(2, "0")}</span>
        <span class="tmeta"><b>${esc(track.title)}</b><small>${esc(track.artist)}</small></span>
        <span class="tdur">${track.duration ? fmt(track.duration) : "--:--"}</span>`;
      dom.tracks.appendChild(li);
    });
    dom.count.textContent = `${state.tracks.length} track${state.tracks.length === 1 ? "" : "s"}`;
  }

  function markActive() {
    [...dom.tracks.children].forEach((li, i) => {
      li.classList.toggle("active", i === state.index);
    });
  }

  /* ---------------- metadata / ui ---------------- */

  function updateMeta() {
    const track = state.tracks[state.index];
    if (!track) return;

    dom.title.textContent = track.title;
    dom.artist.textContent = track.artist;
    dom.badge.textContent = track.kind || "Your library";
    dom.dur.textContent = track.duration ? fmt(track.duration) : "0:00";

    applyTheme(track.palette);
    paintDisc(track.palette);
    markActive();
    updateMediaSession(track);
  }

  function syncPlayingUI() {
    state.playing = !audio.paused && !!audio.src;
    dom.body.classList.toggle("playing", state.playing);
    dom.play.setAttribute("aria-label", state.playing ? "Pause" : "Play");
    dom.play.title = state.playing ? "Pause" : "Play";
    dom.stateText.textContent = state.playing ? "Now playing" : "Paused";
  }

  function updateMediaSession(track) {
    if (!("mediaSession" in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist,
        album: "AURA — Liquid Crystal",
      });
      navigator.mediaSession.setActionHandler("play", () => togglePlay());
      navigator.mediaSession.setActionHandler("pause", () => audio.pause());
      navigator.mediaSession.setActionHandler("previoustrack", () => prevTrack());
      navigator.mediaSession.setActionHandler("nexttrack", () => nextTrack());
    } catch (err) {
      /* ignore */
    }
  }

  /* ---------------- playback ---------------- */

  async function playIndex(i, autoplay = true) {
    if (!state.tracks.length) return;
    const len = state.tracks.length;
    i = ((i % len) + len) % len;

    state.index = i;
    const track = state.tracks[i];

    audio.src = track.url;
    audio.loop = state.repeat === "one";
    audio.load();

    updateMeta();

    if (autoplay) {
      ensureAudio();
      try {
        await audio.play();
      } catch (err) {
        console.warn("Playback blocked:", err);
      }
    }
  }

  async function togglePlay() {
    ensureAudio();
    if (!state.tracks.length) return;

    if (!audio.src) {
      await playIndex(state.index, true);
      return;
    }

    if (audio.paused) {
      try {
        await audio.play();
      } catch (err) {
        console.warn("Playback blocked:", err);
      }
    } else {
      audio.pause();
    }
  }

  function nextTrack() {
    if (!state.tracks.length) return;
    if (state.shuffle && state.tracks.length > 1) {
      let n = state.index;
      while (n === state.index) n = Math.floor(Math.random() * state.tracks.length);
      playIndex(n, true);
    } else {
      playIndex(state.index + 1, true);
    }
  }

  function prevTrack() {
    if (!state.tracks.length) return;
    if (audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    playIndex(state.index - 1, true);
  }

  function onEnded() {
    if (state.repeat === "one") {
      audio.currentTime = 0;
      audio.play().catch(() => {});
      return;
    }
    if (state.shuffle && state.tracks.length > 1) {
      nextTrack();
      return;
    }
    if (state.index < state.tracks.length - 1) {
      playIndex(state.index + 1, true);
    } else if (state.repeat === "all") {
      playIndex(0, true);
    } else {
      syncPlayingUI();
    }
  }

  /* ---------------- files ---------------- */

  function addFiles(fileList) {
    const files = [...fileList].filter(
      (f) =>
        (f.type && f.type.startsWith("audio/")) ||
        /\.(mp3|wav|ogg|oga|m4a|aac|flac|webm|opus)$/i.test(f.name)
    );

    if (!files.length) {
      toast("No audio files found");
      return;
    }

    files.forEach((file, k) => {
      const url = URL.createObjectURL(file);
      const track = {
        id: `file-${Date.now()}-${k}`,
        title: file.name.replace(/\.[^.]+$/, ""),
        artist: "Local file",
        kind: "Your library",
        palette: PALETTES[(state.tracks.length + k) % PALETTES.length],
        url,
        duration: 0,
        generated: false,
      };

      const probe = new Audio();
      probe.preload = "metadata";
      probe.src = url;
      probe.addEventListener("loadedmetadata", () => {
        track.duration = isFinite(probe.duration) ? probe.duration : 0;
        renderQueue();
        if (state.tracks[state.index] === track) {
          dom.dur.textContent = track.duration ? fmt(track.duration) : "0:00";
        }
      });

      state.tracks.push(track);
    });

    renderQueue();
    toast(`${files.length} track${files.length > 1 ? "s" : ""} added`);
  }

  /* ---------------- range fill ---------------- */

  function setFill(el, pct) {
    el.style.setProperty("--p", `${clamp(pct, 0, 100)}%`);
  }

  /* ---------------- visualizer ---------------- */

  const viz = dom.viz;
  const vctx = viz.getContext("2d");
  let vw = 0;
  let vh = 0;
  let barCount = 42;
  let smooth = new Float32Array(96);
  let idleT = 0;

  function resizeViz() {
    const rect = viz.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    vw = rect.width;
    vh = rect.height;
    viz.width = Math.max(1, Math.round(vw * dpr));
    viz.height = Math.max(1, Math.round(vh * dpr));
    vctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    barCount = clamp(Math.floor(vw / 8), 26, 64);
    if (smooth.length < barCount) smooth = new Float32Array(barCount);
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(x, y, w, h, r);
    } else {
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }
  }

  function drawViz() {
    if (!vw || !vh) return;
    idleT += 0.016;

    vctx.clearRect(0, 0, vw, vh);

    const [a1, a2, a3] = state.theme;
    const mid = vh / 2;
    const gap = vw / barCount;
    const bw = Math.max(2, gap * 0.46);

    const grad = vctx.createLinearGradient(0, 0, 0, vh);
    grad.addColorStop(0, a2);
    grad.addColorStop(0.5, a1);
    grad.addColorStop(1, a3);

    vctx.fillStyle = grad;
    vctx.shadowColor = a1;
    vctx.shadowBlur = 16;

    const live = analyser && state.playing;
    if (live) analyser.getByteFrequencyData(freqData);

    for (let i = 0; i < barCount; i++) {
      let v;

      if (live) {
        const idx = Math.floor(Math.pow(i / barCount, 1.55) * (freqData.length * 0.62));
        v = Math.pow(freqData[idx] / 255, 1.45);
      } else {
        v =
          (Math.sin(idleT * 2.2 + i * 0.42) * 0.5 + 0.5) * 0.26 +
          (Math.sin(idleT * 1.05 - i * 0.23) * 0.5 + 0.5) * 0.12 +
          0.035;
      }

      smooth[i] = smooth[i] * 0.72 + v * 0.28;

      const h = Math.max(2, smooth[i] * vh * 0.94);
      const x = i * gap + (gap - bw) / 2;
      const y = mid - h / 2;

      roundRect(vctx, x, y, bw, h, bw / 2);
      vctx.fill();
    }

    vctx.shadowBlur = 0;
  }

  function loop() {
    requestAnimationFrame(loop);
    drawViz();

    const dur = audio.duration;
    if (dur && isFinite(dur) && !state.seeking) {
      const p = clamp(audio.currentTime / dur, 0, 1);
      dom.seek.value = String(Math.round(p * 1000));
      setFill(dom.seek, p * 100);
      dom.cur.textContent = fmt(audio.currentTime);
    }
  }

  /* ---------------- 3d tilt ---------------- */

  function initTilt() {
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    if (coarse) return;

    const player = dom.player;
    let frame = 0;

    player.addEventListener("pointermove", (e) => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const r = player.getBoundingClientRect();
        const px = clamp((e.clientX - r.left) / r.width, 0, 1);
        const py = clamp((e.clientY - r.top) / r.height, 0, 1);

        const rx = (0.5 - py) * 7;
        const ry = (px - 0.5) * 9;

        player.style.transform = `rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
        dom.glare.style.setProperty("--gx", `${(px * 100).toFixed(1)}%`);
        dom.glare.style.setProperty("--gy", `${(py * 100).toFixed(1)}%`);
      });
    });

    player.addEventListener("pointerleave", () => {
      player.style.transform = "";
    });
  }

  /* ---------------- toast ---------------- */

  let toastTimer = 0;
  function toast(message) {
    dom.toast.textContent = message;
    dom.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => dom.toast.classList.remove("show"), 2200);
  }

  /* ---------------- events ---------------- */

  function wire() {
    dom.play.addEventListener("click", togglePlay);
    dom.next.addEventListener("click", nextTrack);
    dom.prev.addEventListener("click", prevTrack);

    dom.tracks.addEventListener("click", (e) => {
      const li = e.target.closest(".track");
      if (!li) return;
      playIndex(Number(li.dataset.i), true);
    });

    dom.shuffle.addEventListener("click", () => {
      state.shuffle = !state.shuffle;
      dom.shuffle.classList.toggle("on", state.shuffle);
      dom.shuffle.setAttribute("aria-pressed", String(state.shuffle));
      toast(state.shuffle ? "Shuffle on" : "Shuffle off");
    });

    dom.repeat.addEventListener("click", () => {
      state.repeat = state.repeat === "off" ? "all" : state.repeat === "all" ? "one" : "off";
      const on = state.repeat !== "off";
      dom.repeat.classList.toggle("on", on);
      dom.repeat.classList.toggle("one-mode", state.repeat === "one");
      dom.repeat.setAttribute("aria-pressed", String(on));
      dom.repeat.setAttribute(
        "aria-label",
        state.repeat === "one" ? "Repeat one" : state.repeat === "all" ? "Repeat all" : "Repeat off"
      );
      audio.loop = state.repeat === "one";
      toast(state.repeat === "one" ? "Repeat one" : state.repeat === "all" ? "Repeat all" : "Repeat off");
    });

    dom.seek.addEventListener("input", () => {
      if (!audio.duration || !isFinite(audio.duration)) return;
      state.seeking = true;
      const p = Number(dom.seek.value) / 1000;
      audio.currentTime = p * audio.duration;
      setFill(dom.seek, p * 100);
      dom.cur.textContent = fmt(audio.currentTime);
    });
    dom.seek.addEventListener("change", () => {
      state.seeking = false;
    });
    dom.seek.addEventListener("pointerup", () => {
      state.seeking = false;
    });

    dom.vol.addEventListener("input", () => {
      const v = Number(dom.vol.value) / 100;
      audio.volume = v;
      audio.muted = v === 0;
      setFill(dom.vol, v * 100);
      dom.mute.classList.toggle("muted", audio.muted);
    });

    dom.mute.addEventListener("click", () => {
      audio.muted = !audio.muted;
      dom.mute.classList.toggle("muted", audio.muted);
      const pct = audio.muted ? 0 : audio.volume * 100;
      setFill(dom.vol, pct);
      toast(audio.muted ? "Muted" : "Unmuted");
    });

    dom.addBtn.addEventListener("click", () => dom.fileInput.click());
    dom.fileInput.addEventListener("change", (e) => {
      addFiles(e.target.files);
      e.target.value = "";
    });

    // drag & drop
    let dragDepth = 0;
    window.addEventListener("dragenter", (e) => {
      if (!e.dataTransfer || ![...e.dataTransfer.types].includes("Files")) return;
      e.preventDefault();
      dragDepth++;
      dom.drop.classList.add("show");
    });
    window.addEventListener("dragover", (e) => {
      if (!e.dataTransfer || ![...e.dataTransfer.types].includes("Files")) return;
      e.preventDefault();
    });
    window.addEventListener("dragleave", (e) => {
      e.preventDefault();
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) dom.drop.classList.remove("show");
    });
    window.addEventListener("drop", (e) => {
      e.preventDefault();
      dragDepth = 0;
      dom.drop.classList.remove("show");
      if (e.dataTransfer && e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
    });

    // keyboard
    window.addEventListener("keydown", (e) => {
      const tag = (e.target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || e.target.isContentEditable) return;

      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        if (audio.duration) audio.currentTime = clamp(audio.currentTime + 5, 0, audio.duration);
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        if (audio.duration) audio.currentTime = clamp(audio.currentTime - 5, 0, audio.duration);
      } else if (e.key.toLowerCase() === "n") {
        nextTrack();
      } else if (e.key.toLowerCase() === "p") {
        prevTrack();
      } else if (e.key.toLowerCase() === "m") {
        dom.mute.click();
      }
    });

    // audio events
    audio.addEventListener("play", syncPlayingUI);
    audio.addEventListener("pause", syncPlayingUI);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("loadedmetadata", () => {
      if (isFinite(audio.duration)) {
        const track = state.tracks[state.index];
        if (track) track.duration = audio.duration;
        dom.dur.textContent = fmt(audio.duration);
        renderQueue();
      }
    });
    audio.addEventListener("error", () => {
      if (audio.src) toast("Could not play this track");
    });

    window.addEventListener("resize", resizeViz);
    if ("ResizeObserver" in window) {
      new ResizeObserver(resizeViz).observe(viz);
    }
  }

  /* ---------------- boot ---------------- */

  async function boot() {
    wire();
    initTilt();
    resizeViz();
    requestAnimationFrame(loop);

    dom.vol.value = "82";
    setFill(dom.vol, 82);
    dom.seek.value = "0";
    setFill(dom.seek, 0);
    renderQueue();

    try {
      await buildLibrary();
      state.booted = true;
      dom.bootText.textContent = "Crystal ready";
      setTimeout(() => dom.boot.classList.add("hide"), 420);
    } catch (err) {
      console.error(err);
      dom.bootText.textContent = "Audio synth unavailable — add your own files";
      setTimeout(() => dom.boot.classList.add("hide"), 1400);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
