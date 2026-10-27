"""Makes ref.wav, the ~10 second reference read that Chatterbox clones the narrator's voice from: a clear, upbeat
female read from Kokoro's af_heart voice (REF_VOICE / REF_SPEED to change it), so the narrator is the same every day."""
import os, numpy as np, soundfile as sf, tts
VOICE, SPEED = os.environ.get("REF_VOICE", "af_heart"), float(os.environ.get("REF_SPEED", "1.08"))
LINES = ["What a night around the league!",
         "Fifty-two points from Luka Doncic, and four touchdown passes from Joe Burrow!",
         "Here are the best performances from the NFL and the NBA!"]
parts = []
for l in LINES:
    a, sr, _ = tts.speak(l, VOICE, SPEED)
    parts += [a, np.zeros(int(.25 * sr), np.float32)]
sf.write("ref.wav", np.concatenate(parts), sr)
print("ref.wav", VOICE, round(sum(len(p) for p in parts) / sr, 1), "s")
