"""Listens back to the narrator so a bad read never reaches a video.

A speech recognizer (faster-whisper, free and open source, runs on the CPU) transcribes what was actually said, and the
words are compared with the script. Used two ways:
  tts_cb.py checks every sentence right after it's made and re-records it if it's wrong (then falls back to Kokoro);
  check.py checks the finished video before it's published.

What counts as a bad read: words missing or garbled, extra babble, a long pause in the middle, dead air or noise before
or after the words, or a pace far too fast or too slow for a person."""
import difflib, os, re

ONES = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split()
TENS = "_ _ twenty thirty forty fifty sixty seventy eighty ninety".split()

def words(n):
    if n < 20: return ONES[n]
    if n < 100: return TENS[n // 10] + (" " + ONES[n % 10] if n % 10 else "")
    if n < 1000: return ONES[n // 100] + " hundred" + (" " + words(n % 100) if n % 100 else "")
    if n < 1000000: return words(n // 1000) + " thousand" + (" " + words(n % 1000) if n % 1000 else "")
    return words(n // 1000000) + " million" + (" " + words(n % 1000000) if n % 1000000 else "")

def year(y):
    hi, lo = divmod(y, 100)
    return words(hi) + (" hundred" if lo == 0 else " oh " + ONES[lo] if lo < 10 else " " + words(lo))

def norm(t):
    """lowercase words only, every number spelled out, so the script and the recognizer can be compared word for word"""
    t = str(t).lower().replace("’", "'").replace("%", " percent").replace("&", " and ")
    t = re.sub(r"(?<=\d),(?=\d{3})", "", t)
    t = re.sub(r"(?<![\d.])(1[1-9]\d\d)(?![\d.]|,\d)", lambda m: " " + year(int(m.group(1))) + " ", t)
    t = re.sub(r"(\d+)\.(\d+)", lambda m: " " + words(int(m.group(1))) + " point " + " ".join(ONES[int(c)] for c in m.group(2)) + " ", t)
    t = re.sub(r"\d+", lambda m: " " + words(int(m.group(0))) + " ", t)
    t = re.sub(r"\b(\w+)'s\b", r"\1s", t)
    t = re.sub(r"[^a-z ]+", " ", t)
    # the recognizer writes "forty-two" and "forty two" both ways; nothing below cares
    return t.split()

def compare(expected, heard):
    """how much of the script was heard (recall, with near-misses on names allowed) and how much extra was heard"""
    e, h = norm(expected), norm(heard)
    if not e:
        return {"recall": 1.0, "extra": 0.0, "missing": []}
    sm = difflib.SequenceMatcher(None, e, h, autojunk=False)
    hit, used, missing = 0, 0, []
    for op, i1, i2, j1, j2 in sm.get_opcodes():
        if op == "equal":
            hit += i2 - i1; used += j2 - j1
        elif op == "replace":
            # a name spelled differently ("Doncic" / "Donchich") still counts if it's close
            hs = h[j1:j2]
            for w in e[i1:i2]:
                best = max(((difflib.SequenceMatcher(None, w, x).ratio(), k) for k, x in enumerate(hs)), default=(0, -1))
                if best[0] >= .7:
                    hit += 1; used += 1; hs = hs[:best[1]] + hs[best[1] + 1:]
                else:
                    missing.append(w)
        elif op == "delete":
            missing += e[i1:i2]
    return {"recall": hit / len(e), "extra": max(0, len(h) - used) / len(e), "missing": missing}

_model = None
def model():
    global _model
    if _model is None:
        from faster_whisper import WhisperModel
        _model = WhisperModel(os.environ.get("WHISPER_MODEL", "small.en"), device="cpu", compute_type="int8",
                              cpu_threads=os.cpu_count() or 4)
    return _model

def transcribe(path):
    """-> (text, [(start, end, word), ...])"""
    segs, _ = model().transcribe(path, language="en", beam_size=5, word_timestamps=True, vad_filter=False,
                                 condition_on_previous_text=False, temperature=0)
    text, ws = [], []
    for s in segs:
        text.append(s.text)
        ws += [(w.start, w.end, w.word) for w in (s.words or [])]
    return " ".join(text).strip(), ws

def check_line(path, expected, dur):
    """one recorded sentence -> (ok, score, problems). score: higher is better, used to keep the best of several takes"""
    heard, ws = transcribe(path)
    c = compare(expected, heard)
    n = max(1, len(norm(expected)))
    problems = []
    if c["recall"] < .8: problems.append(f"words missing or garbled ({', '.join(c['missing'][:6])})")
    if c["extra"] > .3: problems.append("extra words or babble")
    if ws:
        lead, tail = ws[0][0], dur - ws[-1][1]
        gaps = [b[0] - a[1] for a, b in zip(ws, ws[1:])]
        if lead > .6: problems.append(f"{lead:.1f}s of dead air or noise before the words")
        if tail > .8: problems.append(f"{tail:.1f}s of noise or dead air after the words")
        if gaps and max(gaps) > 1.0: problems.append(f"a {max(gaps):.1f}s pause mid-sentence")
    elif n:
        problems.append("nothing recognizable")
    rate = n / max(.1, dur)
    if rate > 5.2: problems.append(f"too fast ({rate:.1f} words/s)")
    if n >= 3 and rate < 1.4: problems.append(f"too slow ({rate:.1f} words/s)")
    if n <= 2 and dur > 2.2: problems.append(f"{dur:.1f}s for a {n}-word line")
    score = c["recall"] - .5 * c["extra"] - .25 * len(problems)
    return not problems, score, problems, heard
