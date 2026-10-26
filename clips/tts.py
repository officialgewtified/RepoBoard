"""Reads the narration lines in data.json aloud with Kokoro (open-source TTS, Apache 2.0, runs on a plain CPU).
Writes one wav per scene into <outdir>, and adds to data.json how long each line runs (dur) and where each sentence
starts inside it (cues), so the video's scenes are cut to the voice.
usage: python tts.py data.json <outdir>   (env: VOICE=am_michael, SPEED=1.2, MODEL_DIR=.models)

Pronunciation fixes live in say.json. A plain value is just a respelling ("Doncic": "Donchich"). A value with | is
said syllable by syllable with the CAPITAL syllable stressed ("rebounds": "REE|bounds"), which pins down both the
sounds and the stress, since a respelled word can still come out stressed wrong."""
import json, os, re, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
SAY = json.load(open(os.path.join(HERE, "say.json")))
VOWEL = "aeiouæɑɐɒɔəɛɜɪʊʌɚɝyøœɨʉɯɤ"
_k = None

def kokoro():
    global _k
    if _k is None:
        from kokoro_onnx import Kokoro
        md = os.environ.get("MODEL_DIR", os.path.join(HERE, ".models"))
        _k = Kokoro(os.path.join(md, "kokoro-v1.0.int8.onnx"), os.path.join(md, "voices-v1.0.bin"))
    return _k

def phon(text):
    return kokoro().tokenizer.phonemize(text, "en-us").strip()

def syllables(spec):
    """'in|JIG|buh' -> phonemes with the stress on JIG"""
    out = ""
    for s in spec.split("|"):
        p = re.sub("[ˈˌ]", "", phon(s.lower()))
        if s.isupper():
            p = re.sub(f"([{VOWEL}])", "ˈ\\1", p, count=1)
        out += p
    return out

def override(value):
    return " ".join(syllables(t) if "|" in t else phon(t) for t in value.split())

def to_phonemes(text):
    """the sentence as phonemes, with the syllable-spec words dropped in exactly"""
    spec = {k: v for k, v in SAY.items() if "|" in v}
    for k, v in SAY.items():
        if "|" not in v:
            text = re.sub(r"\b" + re.escape(k) + r"\b", v, text)
    if not spec:
        return phon(text)
    pat = re.compile(r"\b(" + "|".join(re.escape(k) for k in sorted(spec, key=len, reverse=True)) + r")\b", re.I)
    parts, last = [], 0
    for m in pat.finditer(text):
        seg = text[last:m.start()]
        if seg.strip():
            parts.append(phon(seg))
        key = next(k for k in spec if k.lower() == m.group(1).lower())
        parts.append(override(spec[key]))
        last = m.end()
    if text[last:].strip():
        parts.append(phon(text[last:]))
    return re.sub(r"\s+", " ", " ".join(parts)).strip()

_styles = {}
def voice_arg(v):
    """'am_onyx*0.55+am_puck*0.45' blends voices (deeper with Onyx, livelier with Puck); a plain name is used as is"""
    if "+" not in v and "*" not in v:
        return v
    if v not in _styles:
        try:
            parts = [(p.partition("*")[0].strip(), float(p.partition("*")[2] or 1)) for p in v.split("+")]
            tot = sum(w for _, w in parts)
            _styles[v] = sum(kokoro().get_voice_style(nm) * w for nm, w in parts) / tot
        except Exception as e:
            print("voice blend failed, using the first voice:", e)
            _styles[v] = v.split("+")[0].partition("*")[0].strip()
    return _styles[v]

def speak(text, voice, speed):
    ph = to_phonemes(text)
    a, sr = kokoro().create(ph, voice=voice_arg(voice), speed=speed, lang="en-us", is_phonemes=True)
    return np.trim_zeros(np.asarray(a, dtype=np.float32), "fb"), sr, ph

if __name__ == "__main__":
    import soundfile as sf
    data_path, out = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    VOICE, SPEED = os.environ.get("VOICE", "am_michael"), float(os.environ.get("SPEED", "1.2"))
    D = json.load(open(data_path))
    D["dur"], D["cues"] = {}, {}
    GAP = 0.16
    for sid, text in D["voice"].items():
        sents = [s for s in re.split(r"(?<=[.!?])\s+", text.strip()) if s]
        parts, cues, t = [], [], 0.0
        for i, s in enumerate(sents):
            a, sr, ph = speak(s, VOICE, SPEED)
            cues.append(round(t, 3)); parts.append(a); t += len(a) / sr
            if i < len(sents) - 1:
                parts.append(np.zeros(int(GAP * sr), dtype=np.float32)); t += GAP
        wav = np.concatenate(parts)
        sf.write(os.path.join(out, sid + ".wav"), wav, sr)
        D["dur"][sid], D["cues"][sid] = round(len(wav) / sr, 3), cues
        print(f"{sid}: {D['dur'][sid]:.1f}s  {text[:70]}")
    D["voiceDir"] = os.path.abspath(out)
    json.dump(D, open(data_path, "w"), indent=1)
    print("voice", VOICE, "total", round(sum(D["dur"].values()), 1), "s")
