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
  await page.evaluate(() => window.ready ? window.ready() : document.fonts.ready);
  const total = await page.evaluate(d => window.build(d), data);
  // wait for the player photos too
  await page.evaluate(() => Promise.all([...document.images].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; }))));
  const SC = await page.evaluate(() => SC), SFX = await page.evaluate(() => typeof SFX === "undefined" ? [] : SFX);
  const frames = Math.round(total * fps), voice = data.voiceDir && fs.existsSync(data.voiceDir), sound = voice || SFX.length;
  const silent = sound ? out.replace(/\.mp4$/, "") + ".silent.mp4" : out;
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
  if (sound) {
    // sound effects are made right here (no sound files to license): a whoosh for each swipe, a pop for each pop-up, a thump for the stamp
    const tmp = fs.mkdtempSync(path.join(require("os").tmpdir(), "sfx-"));
    const SYN = { whoosh: ["anoisesrc=d=0.5:c=pink:a=0.5", "highpass=f=350,lowpass=f=6500,afade=t=in:st=0:d=0.2,afade=t=out:st=0.2:d=0.3,volume=0.5"],
      pop: ["aevalsrc=sin(2*PI*(620*t+2600*t*t))*exp(-26*t):d=0.18:s=48000", "volume=0.35"],
      stamp: ["aevalsrc=sin(2*PI*85*t)*exp(-12*t)+0.3*(random(0)*2-1)*exp(-70*t):d=0.4:s=48000", "volume=0.7"] };
    for (const [k, [src, fx]] of Object.entries(SYN)) await run(["-y", "-loglevel", "error", "-f", "lavfi", "-i", src, "-af", fx, "-ar", "48000", "-ac", "1", path.join(tmp, k + ".wav")]);
    const ins = [];
    if (voice) SC.forEach(s => { const f = path.join(data.voiceDir, s.id + ".wav"); if (fs.existsSync(f)) ins.push([f, s.va]); });
    SFX.forEach(e => { if (SYN[e.k] && e.t < total) ins.push([path.join(tmp, e.k + ".wav"), e.t]); });
    const args = ["-y", "-loglevel", "error", "-i", silent];
    ins.forEach(([f]) => args.push("-i", f));
    const f = ins.map(([, at], i) => `[${i + 1}:a]aresample=48000,adelay=delays=${Math.round(at * 1000)}:all=1[a${i}]`).join(";") +
      `;${ins.map((_, i) => `[a${i}]`).join("")}amix=inputs=${ins.length}:normalize=0,apad,atrim=0:${total.toFixed(3)},loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[a]`;
    args.push("-filter_complex", f, "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", out);
    await run(args); fs.unlinkSync(silent); fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log(`${out}: ${frames} frames, ${total.toFixed(1)}s${voice ? ", with voiceover" : ""}, ${SFX.length} sound effects`);
})().catch(e => { console.error(e); process.exit(1); });
