"""Composes the channel's own background beats in code (so there's nothing to license and nothing for Content ID to
claim): a laid-back hip-hop groove with warm chords, a sub bass and light drums, built to sit quietly under the
narrator. Each track is a seamless 8-bar loop; render.js loops it to the video's length and ducks it under the voice.
usage: python make_music.py music/      (writes crossover-beat-1.mp3, crossover-beat-2.mp3)"""
import os, subprocess, sys
import numpy as np

SR = 44100
rng = np.random.default_rng(7)
NOTE = {n: i for i, n in enumerate(["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"])}
def hz(name, octave):
    return 440 * 2 ** ((NOTE[name] + 12 * (octave + 1) - 69) / 12)

def lowpass(x, cut):
    """one-pole low-pass, run forward then backward so it doesn't smear the timing"""
    a = np.exp(-2 * np.pi * cut / SR)
    def run(v):
        y = np.empty_like(v); acc = 0.0
        for i in range(len(v)):
            acc = (1 - a) * v[i] + a * acc; y[i] = acc
        return y
    return run(run(x)[::-1])[::-1]

def env(n, att, rel):
    t = np.arange(n) / SR
    return np.minimum(1, t / max(att, 1e-4)) * np.exp(-t / rel)

def pad(freqs, n):
    t = np.arange(n) / SR
    out = np.zeros(n)
    for f in freqs:
        for det in (-0.12, 0.0, 0.12):   # three slightly detuned voices per note: a soft chorus
            ph = rng.uniform(0, 2 * np.pi)
            out += np.sin(2 * np.pi * f * (1 + det / 100) * t + ph) + 0.25 * np.sin(4 * np.pi * f * t + ph)
    shape = np.minimum(1, t / 0.35) * np.minimum(1, (n / SR - t) / 0.25)
    return out / (len(freqs) * 3) * shape

def kick(n):
    t = np.arange(n) / SR
    f = 46 + 70 * np.exp(-t * 28)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7.5) + 0.15 * np.sin(2 * np.pi * 900 * t) * np.exp(-t * 120)

def snare(n):
    t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    noise = noise - lowpass(noise, 1500)          # keep the bright part of the noise
    return 0.55 * noise * np.exp(-t * 16) + 0.5 * np.sin(2 * np.pi * 185 * t) * np.exp(-t * 22)

def hat(n, open_=False):
    t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    noise = noise - lowpass(noise, 6500)
    return noise * np.exp(-t * (14 if open_ else 55))

def track(bpm, chords, bass_pattern, swing=0.12, seed=0):
    global rng
    rng = np.random.default_rng(seed)
    beat = 60 / bpm; bar = 4 * beat; bars = 8
    n = int(bars * bar * SR)
    mix = {k: np.zeros(n + SR) for k in ("pad", "bass", "drums")}
    def put(buf, at, sig, gain=1.0):
        i = int(at * SR); buf[i:i + len(sig)] += gain * sig[: len(buf) - i]
    for b in range(bars):
        root, quality = chords[b % len(chords)]
        t0 = b * bar
        # chord: root position seventh chord voiced in the 3rd/4th octave
        iv = {"m9": [0, 3, 7, 10, 14], "maj7": [0, 4, 7, 11], "7": [0, 4, 7, 10], "m7": [0, 3, 7, 10], "6": [0, 4, 7, 9]}[quality]
        base = hz(root, 3)
        put(mix["pad"], t0, pad([base * 2 ** (i / 12) for i in iv], int(bar * SR)))
        # bass: the root an octave down, on the pattern's 8th-note steps
        for step, length in bass_pattern:
            at = t0 + step * beat / 2
            m = int(length * beat / 2 * SR)
            tt = np.arange(m) / SR
            sig = np.tanh(1.6 * np.sin(2 * np.pi * hz(root, 1) * tt)) * env(m, 0.008, 0.45)
            put(mix["bass"], at, sig)
        # drums: kick on 1 and the "and" of 2 and 3, snare on 2 and 4, swung 8th-note hats
        for k_at in (0, 1.5, 2.5) if b % 2 == 0 else (0, 1.5, 2.75, 3.5):
            put(mix["drums"], t0 + k_at * beat, kick(int(0.5 * SR)), 0.9)
        for s_at in (1, 3):
            put(mix["drums"], t0 + s_at * beat, snare(int(0.35 * SR)), 0.5)
        for h in range(8):
            at = t0 + h * beat / 2 + (swing * beat / 2 if h % 2 else 0)
            put(mix["drums"], at, hat(int(0.12 * SR), open_=(h == 7 and b % 4 == 3)), 0.16 * (1.0 if h % 2 == 0 else 0.7) * rng.uniform(.85, 1.1))
    # anything ringing past the end wraps to the start, so the loop is seamless
    for k in mix:
        mix[k][:SR] += mix[k][n:n + SR]; mix[k] = mix[k][:n]
    pads = lowpass(mix["pad"], 2400) * 0.55
    out = pads + mix["bass"] * 0.30 + mix["drums"] * 0.5
    out = out - lowpass(out, 38)          # trim sub-rumble that only muddies phone speakers
    out = np.tanh(out * 1.2)
    out = out / np.max(np.abs(out)) * 0.85
    # a touch of stereo width on the pads
    left = out + 0.05 * np.roll(pads, int(0.011 * SR)); right = out - 0.05 * np.roll(pads, int(0.017 * SR))
    st = np.stack([left, right], 1); st = st / np.max(np.abs(st)) * 0.85
    return st

def save(st, path):
    raw = (st * 32767).astype("<i2").tobytes()
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "s16le", "-ar", str(SR), "-ac", "2", "-i", "-", "-c:a", "libmp3lame", "-b:a", "192k", path], input=raw, check=True)

if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "music"
    os.makedirs(out, exist_ok=True)
    # 1: smooth, minor (Am9 / Fmaj7 / Cmaj7 / G6)
    save(track(90, [("A", "m9"), ("F", "maj7"), ("C", "maj7"), ("G", "6")], [(0, 3), (3, 1), (4, 2), (7, 1)], seed=1), os.path.join(out, "crossover-beat-1.mp3"))
    # 2: brighter, a little quicker (Dm7 / G7 / Cmaj7 / Am7)
    save(track(96, [("D", "m7"), ("G", "7"), ("C", "maj7"), ("A", "m7")], [(0, 2), (2, 1), (3, 1), (4, 3), (7, 1)], swing=0.08, seed=2), os.path.join(out, "crossover-beat-2.mp3"))
    print("wrote", os.listdir(out))
