"""Reads the narration lines in data.json aloud with Kokoro (open-source TTS, Apache 2.0, runs on a plain CPU).
Writes one wav per scene into <outdir>, and adds to data.json how long each line runs (dur) and where each sentence
starts inside it (cues), so the video's scenes are cut to the voice.
usage: python tts.py data.json <outdir>   (env: VOICE=af_heart, SPEED=1.1, MODEL_DIR=.models)"""
import json, os, re, sys
import numpy as np, soundfile as sf
from kokoro_onnx import Kokoro

data_path, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
MD = os.environ.get("MODEL_DIR", ".models")
VOICE, SPEED = os.environ.get("VOICE", "af_heart"), float(os.environ.get("SPEED", "1.1"))
k = Kokoro(os.path.join(MD, "kokoro-v1.0.int8.onnx"), os.path.join(MD, "voices-v1.0.bin"))

# names and words the voice gets wrong, spelled the way they sound
SAY = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "say.json")))
def fix(t):
    for a, b in SAY.items():
        t = re.sub(r"\b" + re.escape(a) + r"\b", b, t)
    return t

D = json.load(open(data_path))
D["dur"], D["cues"] = {}, {}
GAP = 0.16
for sid, text in D["voice"].items():
    sents = [s for s in re.split(r"(?<=[.!?])\s+", text.strip()) if s]
    parts, cues, t = [], [], 0.0
    for i, s in enumerate(sents):
        a, sr = k.create(fix(s), voice=VOICE, speed=SPEED, lang="en-us")
        a = np.trim_zeros(np.asarray(a, dtype=np.float32), "fb")
        cues.append(round(t, 3)); parts.append(a); t += len(a) / sr
        if i < len(sents) - 1:
            parts.append(np.zeros(int(GAP * sr), dtype=np.float32)); t += GAP
    wav = np.concatenate(parts)
    sf.write(os.path.join(out, sid + ".wav"), wav, sr)
    D["dur"][sid], D["cues"][sid] = round(len(wav) / sr, 3), cues
    print(f"{sid}: {D['dur'][sid]:.1f}s  {text[:70]}")
D["voiceDir"] = os.path.abspath(out)
json.dump(D, open(data_path, "w"), indent=1)
print("total voice", round(sum(D["dur"].values()), 1), "s")
