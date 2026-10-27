"""The Liftoff music bed: an original cinematic synth track made from scratch with numpy (no samples, nothing to
license). 96 BPM, A minor, Am-F-C-G: a wide detuned pad, a 16th-note arpeggio with echo, a sub-bass pulse, a soft
half-time kick and ticking hats, with a riser every 8 bars. Writes music/liftoff-1.mp3 (needs ffmpeg).
usage: python make_music.py"""
import numpy as np, subprocess, os
SR, BPM = 44100, 96
beat = 60 / BPM; bar = 4 * beat; BARS = 32; N = int(BARS * bar * SR)
t = np.arange(N) / SR
L = np.zeros(N); R = np.zeros(N)
f = lambda m: 440 * 2 ** ((m - 69) / 12)
CH = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]   # Am F C G (MIDI)
rng = np.random.default_rng(7)

def lp(x, a):   # one-pole low-pass
    y = np.empty_like(x); s = 0.0
    for i in range(len(x)): s += a * (x[i] - s); y[i] = s
    return y

def saw(fr, n, ph=0.0):
    x = (np.arange(n) / SR * fr + ph) % 1.0
    return 2 * x - 1

# pad: two bars per chord, three detuned saws per note, slow swell
for b in range(0, BARS, 2):
    c = CH[(b // 2) % 4]; s0 = int(b * bar * SR); n = int(2 * bar * SR)
    env = np.minimum(1, np.arange(n) / (0.6 * SR)) * np.minimum(1, (n - np.arange(n)) / (0.4 * SR))
    for m in c + [c[0] - 12]:
        for d, pan in ((-0.07, .3), (0, .5), (0.07, .7)):
            w = saw(f(m) * 2 ** (d / 12), n, rng.random()) * env * 0.035
            L[s0:s0 + n] += w * (1 - pan); R[s0:s0 + n] += w * pan
L = lp(L, 0.06); R = lp(R, 0.06)

# arpeggio: 16ths up the chord over two octaves, plucky, from bar 3
arp = np.zeros(N); step = beat / 4
for b in range(2, BARS):
    c = CH[(b // 2) % 4]; notes = [c[0] + 12, c[1] + 12, c[2] + 12, c[0] + 24, c[2] + 12, c[1] + 12, c[0] + 24, c[2] + 24]
    for k in range(16):
        s0 = int((b * bar + k * step) * SR); n = int(0.28 * SR); tt = np.arange(n) / SR
        fr = f(notes[k % 8]); tone = (np.sin(2 * np.pi * fr * tt) + 0.35 * np.sin(2 * np.pi * 2 * fr * tt)) * np.exp(-tt * 14)
        arp[s0:s0 + n] += tone[:max(0, min(n, N - s0))] * (0.05 if k % 4 else 0.07)
dl = int(beat * 0.75 * SR)
L += arp + 0.45 * np.concatenate([np.zeros(dl), arp[:-dl]]); R += arp * 0.8 + 0.45 * np.concatenate([np.zeros(dl + 600), arp[:-(dl + 600)]])

# kick (half time) + sub pulse ducked by it, from bar 5
duck = np.ones(N)
for b in range(4, BARS):
    for q in (0, 2):
        s0 = int((b * bar + q * beat) * SR); n = int(0.5 * SR); tt = np.arange(n) / SR
        fr = 45 + 75 * np.exp(-tt * 30); k = np.sin(2 * np.pi * np.cumsum(fr) / SR) * np.exp(-tt * 7) * 0.5
        e = min(n, N - s0); L[s0:s0 + e] += k[:e]; R[s0:s0 + e] += k[:e]
        duck[s0:s0 + e] = np.minimum(duck[s0:s0 + e], 1 - 0.7 * np.exp(-tt[:e] * 9))
sub = np.zeros(N)
for b in range(4, BARS):
    r = CH[(b // 2) % 4][0] - 24
    for k in range(8):
        s0 = int((b * bar + k * beat / 2) * SR); n = int(beat / 2 * SR); tt = np.arange(n) / SR
        sub[s0:s0 + n] += np.sin(2 * np.pi * f(r) * tt) * np.minimum(1, tt * 60) * np.exp(-tt * 3) * 0.16
sub *= duck; L = L * (0.55 + 0.45 * duck) + sub; R = R * (0.55 + 0.45 * duck) + sub

# hats on the offbeats, from bar 9
for b in range(8, BARS):
    for k in range(8):
        if k % 2 == 0: continue
        s0 = int((b * bar + k * beat / 2) * SR); n = int(0.05 * SR)
        h = np.diff(rng.standard_normal(n + 1)) * np.exp(-np.arange(n) / SR * 90) * 0.018
        L[s0:s0 + n] += h; R[s0:s0 + n] += h * 0.8

# riser into every 8th bar
for b in range(7, BARS, 8):
    s0 = int(b * bar * SR); n = int(bar * SR); tt = np.arange(n) / n
    z = lp(rng.standard_normal(n), 0.02 + 0.3 * 0) * tt ** 2 * 0.25
    L[s0:s0 + n] += z; R[s0:s0 + n] += z

m = max(np.abs(L).max(), np.abs(R).max()); st = (np.stack([L, R], 1) / m * 0.89).astype(np.float32)
here = os.path.dirname(os.path.abspath(__file__)); os.makedirs(os.path.join(here, "music"), exist_ok=True)
raw = os.path.join(here, "music", "liftoff-1.f32")
st.tofile(raw)
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", raw, "-c:a", "libmp3lame", "-q:a", "3", os.path.join(here, "music", "liftoff-1.mp3")], check=True)
os.remove(raw); print("music/liftoff-1.mp3", round(N / SR, 1), "s")
