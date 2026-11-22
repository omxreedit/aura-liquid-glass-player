#!/usr/bin/env python3
"""Generate the AURA launcher icon (pure stdlib, no Pillow needed)."""

import math
import os
import struct
import zlib

SIZE = 512
SS = 2  # supersampling
C = SIZE / 2.0
DISC_R = 210.0

STOPS = [(0.0, (34, 211, 238)), (0.5, (124, 92, 255)), (1.0, (255, 95, 210))]


def lerp(a, b, t):
    return a + (b - a) * t


def grad3(t):
    t %= 1.0
    for i in range(len(STOPS) - 1):
        t0, c0 = STOPS[i]
        t1, c1 = STOPS[i + 1]
        if t0 <= t <= t1:
            k = (t - t0) / (t1 - t0)
            return tuple(lerp(c0[j], c1[j], k) for j in range(3))
    return STOPS[-1][1]


def shade(x, y):
    dx = x - C
    dy = y - C
    dist = math.hypot(dx, dy)

    # deep-space background
    bg_t = min(1.0, dist / (SIZE * 0.78))
    r = lerp(13, 5, bg_t)
    g = lerp(15, 6, bg_t)
    b = lerp(28, 11, bg_t)

    if dist <= DISC_R:
        t = (math.atan2(dy, dx) / (2.0 * math.pi)) % 1.0
        cr, cg, cb = grad3(t)

        # radial falloff
        k = 1.0 - 0.38 * (dist / DISC_R) ** 2
        # diagonal glass sheen
        sheen = max(0.0, 1.0 - abs((x * 0.6 + y * 0.8) / SIZE - 0.56) * 3.4)
        cr = min(255.0, cr * k + 78 * sheen)
        cg = min(255.0, cg * k + 78 * sheen)
        cb = min(255.0, cb * k + 78 * sheen)

        # vinyl grooves
        for rr in (150.0, 118.0, 86.0):
            if abs(dist - rr) < 1.3:
                cr = min(255.0, cr + 30)
                cg = min(255.0, cg + 30)
                cb = min(255.0, cb + 30)

        # center hole + rim
        if dist < 46.0:
            cr, cg, cb = 7.0, 8.0, 14.0
        elif dist < 53.0:
            cr, cg, cb = lerp(cr, 210, 0.35), lerp(cg, 228, 0.35), lerp(cb, 255, 0.35)

        r, g, b = cr, cg, cb

    # crisp outer rim
    if abs(dist - DISC_R) < 1.6:
        r, g, b = lerp(r, 255, 0.55), lerp(g, 255, 0.55), lerp(b, 255, 0.55)

    # glowing spindle dot
    if dist < 11.0:
        r, g, b = 190.0, 246.0, 255.0

    return r, g, b


def make_png(path):
    raw = bytearray()
    inv = 1.0 / (SS * SS)
    for y in range(SIZE):
        raw.append(0)  # filter: none
        for x in range(SIZE):
            ar = ag = ab = 0.0
            for sy in range(SS):
                for sx in range(SS):
                    sr, sg, sb = shade(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS)
                    ar += sr
                    ag += sg
                    ab += sb
            raw += bytes((int(ar * inv + 0.5), int(ag * inv + 0.5), int(ab * inv + 0.5), 255))

    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data +
                struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", SIZE, SIZE, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += chunk(b"IEND", b"")

    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as fh:
        fh.write(png)
    print("wrote", path, len(png), "bytes")


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    make_png(os.path.join(here, "..", "res", "drawable", "ic_launcher.png"))
