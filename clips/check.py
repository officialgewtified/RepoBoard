"""The last check before a video is published: if anything is off, it fails, the publish step never runs, and no
release (and so no notification) goes out.

Checks: the file plays (1080-wide video with sound), it's at least as long as the template asked for (data.min), the
sound isn't silent or clipped, and, if the video is narrated, a speech recognizer hears the script: each narration
line has to be clearly there, in order, without garbling.
usage: python check.py video.mp4 data.json [report.json]"""
import json, os, re, subprocess, sys, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import voiceqa

video, data_path = sys.argv[1], sys.argv[2]
report_path = sys.argv[3] if len(sys.argv) > 3 else None
D = json.load(open(data_path))
fails, notes = [], []

def probe():
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height", "-of", "json", video],
                       capture_output=True, text=True)
    return json.loads(r.stdout or "{}")

p = probe()
dur = float(p.get("format", {}).get("duration", 0) or 0)
kinds = [s.get("codec_type") for s in p.get("streams", [])]
vid = next((s for s in p.get("streams", []) if s.get("codec_type") == "video"), {})
if "video" not in kinds: fails.append("no video stream")
if "audio" not in kinds: fails.append("no sound")
if vid and vid.get("width") not in (1080, 1920): fails.append(f"odd size {vid.get('width')}x{vid.get('height')}")
if D.get("min") and dur < D["min"] - .3: fails.append(f"only {dur:.1f}s long (needs {D['min']}s)")
notes.append(f"{dur:.1f}s long")

if "audio" in kinds:
    r = subprocess.run(["ffmpeg", "-hide_banner", "-i", video, "-vn", "-af", "volumedetect", "-f", "null", "-"], capture_output=True, text=True)
    mv = re.search(r"mean_volume: (-?[\d.]+) dB", r.stderr); xv = re.search(r"max_volume: (-?[\d.]+) dB", r.stderr)
    mean, peak = float(mv.group(1)) if mv else -99, float(xv.group(1)) if xv else -99
    notes.append(f"loudness {mean:.1f} dB average, {peak:.1f} dB peak")
    if mean < -32: fails.append(f"sound is nearly silent ({mean:.1f} dB)")
    if peak > -.05: fails.append("sound is clipping")

voice = D.get("voice") or {}
if voice and "audio" in kinds:
    if not D.get("dur"):
        fails.append("narration is missing (the voiceover step didn't produce any)")
    else:
        wav = os.path.join(tempfile.mkdtemp(), "a.wav")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", video, "-vn", "-ac", "1", "-ar", "16000", wav], check=True)
        heard, _ = voiceqa.transcribe(wav)
        lines = [(k, v) for k, v in voice.items() if k in D["dur"]]
        whole = voiceqa.compare(" ".join(v for _, v in lines), heard)
        notes.append(f"narration heard: {whole['recall']:.0%} of the script")
        if whole["recall"] < .9: fails.append(f"narration only {whole['recall']:.0%} recognizable")
        if whole["extra"] > .25: fails.append("extra babble in the narration")
        # each line on its own: find the stretch of the transcript that best matches it, and it has to be clearly there
        hw = voiceqa.norm(heard)
        for k, v in lines:
            e = voiceqa.norm(v)
            if not e: continue
            L = len(e) + 4
            best = max((voiceqa.compare(" ".join(e), " ".join(hw[i:i + L]))["recall"] for i in range(0, max(1, len(hw) - len(e) + 1))), default=0)
            if best < .8:
                fails.append(f"line '{k}' garbled or missing ({best:.0%} heard): {v[:60]}")
        qa = D.get("voiceQA") or {}
        redo = {k: v for k, v in qa.items() if v.get("takes", 1) > 1 or v.get("engine", "chatterbox") != "chatterbox"}
        if redo: notes.append("re-recorded while making it: " + ", ".join(f"{k} ({v.get('takes')} takes{', ' + v.get('engine') if v.get('engine', 'chatterbox') != 'chatterbox' else ''})" for k, v in redo.items()))

ok = not fails
print(("PASS" if ok else "FAIL") + f": {os.path.basename(video)}")
for n in notes: print("  ·", n)
for f in fails: print("  ✗", f)
if report_path:
    json.dump({"ok": ok, "fails": fails, "notes": notes}, open(report_path, "w"), indent=1)
sys.exit(0 if ok else 1)
