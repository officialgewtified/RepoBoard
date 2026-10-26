"""Makes ref.wav, the ~12 second reference read that Chatterbox clones the narrator's voice from (a deep, clear male
read from Kokoro's am_onyx voice, so the narrator stays the same every day)."""
import numpy as np, soundfile as sf, tts
LINES = ["Good morning, and welcome to the daily recap.",
         "Here are yesterday's best performances from around the NFL and the NBA.",
         "Joe Burrow threw for two hundred ninety-two yards and four touchdowns in Cincinnati's win at Baltimore."]
parts = []
for l in LINES:
    a, sr, _ = tts.speak(l, "am_onyx", 0.95)
    parts += [a, np.zeros(int(.3 * sr), np.float32)]
sf.write("ref.wav", np.concatenate(parts), sr)
print("ref.wav", round(sum(len(p) for p in parts) / sr, 1), "s")
