"""Voiceover with Chatterbox (Resemble AI's open-source TTS, MIT licence: free, fine for monetized videos), which reads
with far more natural expression than Kokoro. The voice is cloned from a short reference clip (ref.wav, a deep male
read made with Kokoro at the start of the run, ref.py), so the narrator is the same every day.
Same output as tts.py: one wav per scene in <outdir>, and data.json gets dur, cues and voiceDir.
usage: python tts_cb.py data.json <outdir> ref.wav     (env: EXAGGERATION=0.5, CFG=0.5, TEMPO=1.07)
TEMPO speeds the read up without changing the pitch (ffmpeg's atempo), for a brisker, more natural broadcast pace."""
import json, os, re, sys, shutil, subprocess
import numpy as np, soundfile as sf
import torch
from chatterbox.tts import ChatterboxTTS

data_path, out, ref = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(out, exist_ok=True)
EXAG, CFG = float(os.environ.get("EXAGGERATION", "0.5")), float(os.environ.get("CFG", "0.5"))
torch.set_num_threads(os.cpu_count() or 4)
model = ChatterboxTTS.from_pretrained(device="cpu")

# names it could misread, spelled the way they sound (say.json: plain respellings; syllable specs become hyphenated)
SAY = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "say.json")))
CB = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "say_cb.json")))
ONES = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split()
TENS = "_ _ twenty thirty forty fifty sixty seventy eighty ninety".split()
def words(n):
    """292 -> two hundred ninety-two (spelled out, so the voice can't misread digits)"""
    if n < 20: return ONES[n]
    if n < 100: return TENS[n // 10] + ("-" + ONES[n % 10] if n % 10 else "")
    if n < 1000: return ONES[n // 100] + " hundred" + (" " + words(n % 100) if n % 100 else "")
    return words(n // 1000) + " thousand" + (" " + words(n % 1000) if n % 1000 else "")
def year(y):
    """1969 -> nineteen sixty-nine, 1908 -> nineteen oh eight, 1900 -> nineteen hundred"""
    hi, lo = divmod(y, 100)
    return words(hi) + (" hundred" if lo == 0 else " oh " + ONES[lo] if lo < 10 else " " + words(lo))
def say_numbers(t):
    # four-digit numbers from 1100 to 1999 written without a comma are years (counts always get commas)
    t = re.sub(r"(?<![\d,.])(1[1-9]\d\d)(?!\d|[.,]\d)", lambda m: year(int(m.group(1))), t)
    t = re.sub(r"(\d+)\.(\d+)", lambda m: words(int(m.group(1))) + " point " + " ".join(ONES[int(c)] for c in m.group(2)), t)
    t = re.sub(r"(?<=\d),(?=\d{3})", "", t)   # 1,250 -> 1250, other commas stay (they make the pauses)
    return re.sub(r"\d+", lambda m: words(int(m.group(0))), t)

def prep(t):
    """before splitting into sentences: periods that don't end a sentence (A.J., St. Brown, Jr.) and names with digits"""
    t = re.sub(r"\b(Jr|Sr)\.(?=[,.!?])", r"\1", t)                         # "Penix Jr.." -> "Penix Jr."
    t = re.sub(r"\b([A-Z])\.([A-Z])\.", r"\1\2", t)                       # A.J. Brown -> AJ Brown
    t = re.sub(r"\bSt\. (?=[A-Z])", "Saint ", t)                              # Amon-Ra St. Brown
    t = re.sub(r"\b(Jr|Sr)\.(?=\s+[a-z,])", lambda m: {"Jr": "Junior", "Sr": "Senior"}[m.group(1)], t)
    t = re.sub(r"\b(Jr|Sr)\.", lambda m: {"Jr": "Junior.", "Sr": "Senior."}[m.group(1)], t)   # ends the sentence
    t = re.sub(r"\b(Jr|Sr)\b", lambda m: {"Jr": "Junior", "Sr": "Senior"}[m.group(1)], t)
    t = re.sub(r"\bIII\b", "the Third", t); t = re.sub(r"\bII\b", "the Second", t)
    return re.sub(r"\b49ers\b", "Niners", t)

def fix(t):
    t = re.sub(r"\bN F L\b", "NFL", t); t = re.sub(r"\bN B A\b", "NBA", t)
    t = say_numbers(t)
    # this voice's own spellings first (say_cb.json), then the shared list for anything not covered
    for k in sorted(CB, key=len, reverse=True):
        t = re.sub(r"\b" + re.escape(k) + r"\b", CB[k], t)
    for k, v in SAY.items():
        if k in CB or any(k in c for c in CB):
            continue
        if v.startswith("/") or k in ("NFL", "NBA", "rebounds", "rebound"):
            continue
        t = re.sub(r"\b" + re.escape(k) + r"\b", v.replace("|", "").lower() if "|" in v else v, t)
    # hyphens inside names made this voice drop the rest of the name ("Cam Skat", "Jaxon Smith"): read them as one flow
    return re.sub(r"(?<=[A-Za-z])-(?=[A-Z])", " ", t)

def trim(a, sr):
    """cut leading/trailing near-silence"""
    loud = np.where(np.abs(a) > 0.01)[0]
    if not len(loud):
        return a
    return a[max(0, loud[0] - int(.03 * sr)):min(len(a), loud[-1] + int(.08 * sr))]

D = json.load(open(data_path))
D["dur"], D["cues"] = {}, {}
GAP = 0.16
TEMPO = float(os.environ.get("TEMPO", "1.07")) if shutil.which("ffmpeg") else 1.0
for sid, text in D["voice"].items():
    sents = [s for s in re.split(r"(?<=[.!?])\s+", prep(text).strip()) if s]
    parts, cues, t, sr = [], [], 0.0, model.sr
    for i, s in enumerate(sents):
        wav = model.generate(fix(s), audio_prompt_path=ref, exaggeration=EXAG, cfg_weight=CFG)
        a = trim(wav.squeeze(0).cpu().numpy().astype(np.float32), sr)
        cues.append(round(t, 3)); parts.append(a); t += len(a) / sr
        if i < len(sents) - 1:
            parts.append(np.zeros(int(GAP * sr), dtype=np.float32)); t += GAP
    w = np.concatenate(parts)
    f = os.path.join(out, sid + ".wav")
    sf.write(f, w, sr)
    if TEMPO != 1.0:
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", f, "-filter:a", f"atempo={TEMPO}", f + ".tmp.wav"], check=True)
        os.replace(f + ".tmp.wav", f); w, sr2 = sf.read(f); cues = [round(c / TEMPO, 3) for c in cues]; sr = sr2
    D["dur"][sid], D["cues"][sid] = round(len(w) / sr, 3), cues
    print(f"{sid}: {D['dur'][sid]:.1f}s  {text[:70]}", flush=True)
D["voiceDir"] = os.path.abspath(out)
D["voiceEngine"] = "chatterbox"
D["voiceTempo"] = TEMPO
json.dump(D, open(data_path, "w"), indent=1)
print("total voice", round(sum(D["dur"].values()), 1), "s")
