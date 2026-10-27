"""The Liftoff music bed, "Cosmos": an original ambient space track made from scratch with numpy/scipy (no samples,
nothing to license). 84 BPM in D minor (Dm9 - Bbmaj7 - Fmaj7 - C6): a slow-breathing pad drenched in reverb, twinkling
bell arpeggios like stars, a deep sub drone, radar pings, a soft heartbeat kick, and risers into each new section.
Writes music/liftoff-cosmos.mp3 (needs ffmpeg).
usage: python make_music.py"""
import numpy as np, subprocess, os
from scipy.signal import lfilter
SR, BPM = 44100, 84
beat = 60 / BPM; bar = 4 * beat; BARS = 32; N = int(BARS * bar * SR)
rng = np.random.default_rng(11)
f = lambda m: 440 * 2 ** ((m - 69) / 12)
CH = [[50, 53, 57, 60, 64], [46, 50, 53, 57, 62], [41, 45, 48, 52, 57], [48, 52, 55, 57, 64]]   # Dm9 Bbmaj7 Fmaj7 C6
L = np.zeros(N); R = np.zeros(N); WL = np.zeros(N); WR = np.zeros(N)   # dry and reverb-send buses
def add(bus, s0, x, g=1.0):
    e = min(len(x), N - s0)
    if e > 0: bus[s0:s0 + e] += x[:e] * g

def comb(x, D, g):
    """y[n] = x[n] + g*y[n-D], a block of D samples at a time"""
    y = x.copy()
    for i in range(D, len(x), D): y[i:i + D] += g * y[i - D:i - D + len(y[i:i + D])]
    return y
def allpass(x, D, g):
    """y[n] = -g*x[n] + x[n-D] + g*y[n-D]"""
    y = -g * x
    y[D:] += x[:-D]
    for i in range(D, len(x), D): y[i:i + D] += g * y[i - D:i - D + len(y[i:i + D])]
    return y
def reverb(x, size=1.0):
    """Schroeder reverb: four combs into two allpasses (long, dark tail)"""
    y = sum(comb(x, int(d * size * 2.2), g) for d, g in ((1557, .84), (1617, .83), (1491, .85), (1422, .86)))
    for d, g in ((225, .7), (556, .7)): y = allpass(y, int(d * size * 2.2), g)
    return lfilter([0.25], [1, -0.75], y) * 0.18   # roll off the highs

# pad: detuned saws, slow swell, filter breathing with a slow LFO
t = np.arange(N) / SR
for b in range(0, BARS, 2):
    c = CH[(b // 2) % 4]; s0 = int(b * bar * SR); n = int(2 * bar * SR) + int(.8 * SR); tt = np.arange(n) / SR
    env = np.minimum(1, tt / 1.6) * np.minimum(1, (n / SR - tt) / 1.2)
    for m in c:
        for d in (-.08, .0, .08):
            ph = rng.random(); x = 2 * ((tt * f(m) * 2 ** (d / 12) + ph) % 1) - 1
            add(L, s0, x * env, .012 * (1.2 if d < 0 else .8)); add(R, s0, x * env, .012 * (1.2 if d > 0 else .8))
cut = .02 + .025 * (1 + np.sin(2 * np.pi * t / (bar * 4)))       # breathing low-pass
def lp_var(x, a):
    y = np.empty_like(x); s = 0.0
    for i in range(0, len(x), 64):                                 # block-wise so it stays fast
        k = a[i]; blk = lfilter([k], [1, -(1 - k)], x[i:i + 64], zi=[s * (1 - k)])
        y[i:i + 64] = blk[0]; s = y[min(i + 63, len(x) - 1)]
    return y
L = lp_var(L, cut); R = lp_var(R, cut); WL += L * .9; WR += R * .9

# shimmer: the chord an octave up, soft, mostly reverb
for b in range(4, BARS, 2):
    c = CH[(b // 2) % 4]; s0 = int(b * bar * SR); n = int(2 * bar * SR); tt = np.arange(n) / SR
    env = np.sin(np.pi * tt / (n / SR)) ** 2
    for m in c[2:]:
        x = np.sin(2 * np.pi * f(m + 12) * tt) * env * .01; add(WL, s0, x, 1.3); add(WR, s0, x, 1.3)

# bells: FM "star" tones, sparse 8th-note arpeggio, from bar 5
for b in range(4, BARS):
    if 24 <= b < 26: continue                                     # a breath before the last section
    c = CH[(b // 2) % 4]; pat = [c[2] + 12, c[4] + 12, c[3] + 12, c[4] + 24, c[1] + 24, c[4] + 12, c[2] + 24, c[3] + 12]
    for k in range(8):
        if rng.random() < .3: continue
        s0 = int((b * bar + k * beat / 2) * SR); n = int(1.6 * SR); tt = np.arange(n) / SR; fr = f(pat[k])
        x = np.sin(2 * np.pi * fr * tt + 2.2 * np.exp(-tt * 6) * np.sin(2 * np.pi * fr * 3.5 * tt)) * np.exp(-tt * 3.2) * .05
        pan = .25 + .5 * rng.random(); add(L, s0, x, 1 - pan); add(R, s0, x, pan); add(WL, s0, x, .9); add(WR, s0, x, .9)

# sub drone: the root, gently pulsing, from bar 5
for b in range(4, BARS):
    r = CH[(b // 2) % 4][0] - 12; s0 = int(b * bar * SR); n = int(bar * SR); tt = np.arange(n) / SR
    x = np.sin(2 * np.pi * f(r) * tt) * (.7 + .3 * np.sin(2 * np.pi * tt / beat)) * .09 * np.minimum(1, tt * 8) * np.minimum(1, (bar - tt) * 8)
    add(L, s0, x); add(R, s0, x)

# heartbeat kick (beat 1 and the "and" of 2) from bar 9, with an impact on bar 9 and bar 17
for b in range(8, BARS):
    if 24 <= b < 26: continue
    for q in (0, 1.5):
        s0 = int((b * bar + q * beat) * SR); n = int(.6 * SR); tt = np.arange(n) / SR
        k = np.sin(2 * np.pi * np.cumsum(42 + 60 * np.exp(-tt * 28)) / SR) * np.exp(-tt * 6) * (.42 if q == 0 else .28)
        add(L, s0, k); add(R, s0, k)
for b in (8, 16, 26):
    s0 = int(b * bar * SR); n = int(3 * SR); tt = np.arange(n) / SR
    boom = np.sin(2 * np.pi * np.cumsum(30 + 50 * np.exp(-tt * 4)) / SR) * np.exp(-tt * 1.6) * .5 + rng.standard_normal(n) * np.exp(-tt * 9) * .05
    add(L, s0, boom); add(R, s0, boom); add(WL, s0, boom, .4); add(WR, s0, boom, .4)

# radar pings every 4 bars, with an echo
for b in range(2, BARS, 4):
    s0 = int((b * bar + 2 * beat) * SR); n = int(1.2 * SR); tt = np.arange(n) / SR
    x = np.sin(2 * np.pi * 1480 * tt) * np.exp(-tt * 7) * .035
    for e, g in ((0, 1), (beat * .75, .45), (beat * 1.5, .2)):
        add(L if e == 0 else R, s0 + int(e * SR), x, g); add(WL, s0, x, .6); add(WR, s0, x, .6)

# risers (filtered noise sweeping up) into bars 9, 17 and 27
for b in (7, 15, 25):
    s0 = int(b * bar * SR); n = int(bar * SR); tt = np.arange(n) / n
    z = rng.standard_normal(n); z = lfilter([1, -1], [1], z) * tt ** 2.5 * .05
    add(L, s0, z); add(R, s0, z * .9); add(WL, s0, z, .5); add(WR, s0, z, .5)

L += reverb(WL, 1.0); R += reverb(WR, 1.07)
st = np.stack([L, R], 1); st = np.tanh(st / np.abs(st).max() * 1.4) / np.tanh(1.4) * .9
here = os.path.dirname(os.path.abspath(__file__)); os.makedirs(os.path.join(here, "music"), exist_ok=True)
raw = os.path.join(here, "music", "cosmos.f32"); st.astype(np.float32).tofile(raw)
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", raw, "-af", "afade=t=in:d=1.5",
                "-c:a", "libmp3lame", "-q:a", "2", os.path.join(here, "music", "liftoff-cosmos.mp3")], check=True)
os.remove(raw); print("music/liftoff-cosmos.mp3", round(N / SR, 1), "s")
