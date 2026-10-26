/* Renders recap.html into a vertical 1080x1920 MP4: poses every frame with render(t), screenshots it, pipes the frames
   to ffmpeg, then lays the narration (tts.py's wavs, if any) under it at each scene's start.
   usage: node render.js data.json out.mp4 [fps] */
"use strict";
const { chromium } = require("playwright"), { spawn } = require("child_process"), path = require("path"), fs = require("fs");
const run = args => new Promise((res, rej) => { const p = spawn("ffmpeg", args, { stdio: ["ignore", "inherit", "inherit"] }); p.on("close", c => c ? rej(new Error("ffmpeg " + c)) : res()); });
(async () => {
  const [dataFile, out, fpsArg] = process.argv.slice(2), fps = +fpsArg || 30;
  const data = JSON.parse(fs.readFileSync(dataFile, "utf8"));
  const browser = await chromium.launch(), page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  page.on("pageerror", e => { console.error("page error:", e.message); process.exit(1); });
  await page.goto("file://" + path.join(__dirname, "recap.html"));
  await page.evaluate(() => document.fonts.ready);
  const total = await page.evaluate(d => window.build(d), data);
  const SC = await page.evaluate(() => SC);
  const frames = Math.round(total * fps), voice = data.voiceDir && fs.existsSync(data.voiceDir);
  const silent = voice ? out.replace(/\.mp4$/, "") + ".silent.mp4" : out;
  const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(fps), "-c:v", "mjpeg", "-i", "-",
    "-c:v", "libx264", "-preset", process.env.PRESET || "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", silent], { stdio: ["pipe", "inherit", "inherit"] });
  const done = new Promise((res, rej) => ff.on("close", c => c ? rej(new Error("ffmpeg " + c)) : res()));
  for (let i = 0; i < frames; i++) {
    await page.evaluate(t => window.render(t), i / fps);
    const buf = await page.screenshot({ type: "jpeg", quality: 94 });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once("drain", r));
    if (i % 300 === 0) process.stderr.write(`frame ${i}/${frames}\n`);
  }
  ff.stdin.end(); await done; await browser.close();
  if (voice) {
    const lines = SC.filter(s => fs.existsSync(path.join(data.voiceDir, s.id + ".wav")));
    const args = ["-y", "-loglevel", "error", "-i", silent];
    lines.forEach(s => args.push("-i", path.join(data.voiceDir, s.id + ".wav")));
    const f = lines.map((s, i) => `[${i + 1}:a]aresample=48000,adelay=delays=${Math.round(s.va * 1000)}:all=1[a${i}]`).join(";") +
      `;${lines.map((_, i) => `[a${i}]`).join("")}amix=inputs=${lines.length}:normalize=0,apad,atrim=0:${total.toFixed(3)},loudnorm=I=-15:TP=-1.5:LRA=11,aresample=48000[a]`;
    args.push("-filter_complex", f, "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", out);
    await run(args); fs.unlinkSync(silent);
  }
  console.log(`${out}: ${frames} frames, ${total.toFixed(1)}s${voice ? ", with voiceover" : ""}`);
})().catch(e => { console.error(e); process.exit(1); });
