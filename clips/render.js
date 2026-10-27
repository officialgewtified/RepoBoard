/* Renders recap.html into a vertical 1080x1920 MP4: poses every frame with render(t), screenshots it, pipes the frames
   to ffmpeg, then lays the narration (tts.py's wavs, if any) under it at each scene's start.
   usage: node render.js data.json out.mp4 [fps] */
"use strict";
const { chromium } = require("playwright"), { spawn } = require("child_process"), path = require("path"), fs = require("fs");
const run = args => new Promise((res, rej) => { const p = spawn("ffmpeg", args, { stdio: ["ignore", "inherit", "inherit"] }); p.on("close", c => c ? rej(new Error("ffmpeg " + c)) : res()); });
(async () => {
  const [dataFile, out, fpsArg] = process.argv.slice(2), fps = +fpsArg || 30;
  const data = JSON.parse(fs.readFileSync(dataFile, "utf8"));
  const W = data.w || 1080, H = data.h || 1920;   // the shorts are 1080x1920; the weekly long-form is 1920x1080
  const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {}), page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on("pageerror", e => { console.error("page error:", e.message); process.exit(1); });
  await page.goto("file://" + path.join(__dirname, data.template || "recap.html"));
  await page.evaluate(() => window.ready ? window.ready() : document.fonts.ready);
  const total = await page.evaluate(d => window.build(d), data);
  // wait for the player photos too
  await page.evaluate(() => Promise.all([...document.images].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; }))));
  const SC = await page.evaluate(() => SC), SFX = await page.evaluate(() => typeof SFX === "undefined" ? [] : SFX);
  const frames = Math.round(total * fps), voice = data.voiceDir && fs.existsSync(data.voiceDir), sound = voice || SFX.length;
  const silent = sound ? out.replace(/\.mp4$/, "") + ".silent.mp4" : out;
  // background footage (the space videos): one clip per scene by topic (data.broll), cut at the scene changes; the page
  // is then shot with a transparent background and laid over it
  let bg = null;
  if (data.broll && Object.keys(data.broll).length) {
    bg = out.replace(/\.mp4$/, "") + ".bg.mp4";
    const topic = id => (data.scenes.find(x => x.id === id) || {}).bg, used = {}, ins = [], parts = [];
    const segs = [{ t0: 0, t1: SC[0].t0, f: null }, ...SC.map((s, j) => ({ t0: s.t0, t1: j + 1 < SC.length ? SC[j + 1].t0 : total, f: data.broll[topic(s.id)] || null, k: topic(s.id) }))];
    segs.forEach((g, i) => { const d = Math.max(.04, g.t1 - g.t0).toFixed(3);
      if (g.f) { const off = 7 * (used[g.k] = (used[g.k] || 0) + 1) - 7; ins.push("-stream_loop", "-1", "-i", g.f);
        parts.push(`[${ins.filter(x => x === "-i").length - 1}:v]trim=start=${off}:duration=${d},setpts=PTS-STARTPTS,fps=${fps},scale=${W}:${H},setsar=1,fade=t=in:st=0:d=0.3[s${i}]`); }
      else parts.push(`color=c=black:s=${W}x${H}:r=${fps}:d=${d},setsar=1[s${i}]`); });
    await run(["-y", "-loglevel", "error", ...ins, "-filter_complex", parts.join(";") + ";" + segs.map((_, i) => `[s${i}]`).join("") + `concat=n=${segs.length}:v=1:a=0,format=yuv420p[v]`,
      "-map", "[v]", "-t", total.toFixed(3), "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", bg]);
  }
  const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", ...(bg ? ["-i", bg] : []), "-f", "image2pipe", "-framerate", String(fps), "-c:v", bg ? "png" : "mjpeg", "-i", "-",
    ...(bg ? ["-filter_complex", "[1:v]format=rgba[o];[0:v][o]overlay=0:0:shortest=1:format=auto,format=yuv420p[v]", "-map", "[v]"] : []),
    "-c:v", "libx264", "-preset", process.env.PRESET || "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", silent], { stdio: ["pipe", "inherit", "inherit"] });
  const done = new Promise((res, rej) => ff.on("close", c => c ? rej(new Error("ffmpeg " + c)) : res()));
  for (let i = 0; i < frames; i++) {
    await page.evaluate(t => window.render(t), i / fps);
    const buf = bg ? await page.screenshot({ type: "png", omitBackground: true }) : await page.screenshot({ type: "jpeg", quality: 94 });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once("drain", r));
    if (i % 300 === 0) process.stderr.write(`frame ${i}/${frames}\n`);
  }
  ff.stdin.end(); await done; if (bg) fs.unlinkSync(bg);
  // long-form extras: YouTube chapters (from each scene's start) and a thumbnail
  const base = out.replace(/\.mp4$/, "");
  const ch = SC.filter(s => s.chapter);
  if (ch.length) { const ts = x => { const s = Math.max(0, Math.floor(x)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
    fs.writeFileSync(base + ".chapters.txt", ch.map((s, i) => `${ts(i ? s.t0 : 0)} ${s.chapter}`).join("\n") + "\n"); }
  if (await page.evaluate(() => typeof window.thumb === "function")) { await page.evaluate(() => window.thumb()); await page.screenshot({ path: base + "-thumbnail.jpg", type: "jpeg", quality: 90 }); }
  await browser.close();
  if (sound) {
    // sound effects are made right here (no sound files to license): a whoosh for each swipe, a pop for each pop-up, a thump for the stamp
    const tmp = fs.mkdtempSync(path.join(require("os").tmpdir(), "sfx-"));
    const SYN = { whoosh: ["anoisesrc=d=0.5:c=pink:a=0.5", "highpass=f=350,lowpass=f=6500,afade=t=in:st=0:d=0.2,afade=t=out:st=0.2:d=0.3,volume=0.5"],
      pop: ["aevalsrc=sin(2*PI*(620*t+2600*t*t))*exp(-26*t):d=0.18:s=48000", "volume=0.35"],
      stamp: ["aevalsrc=sin(2*PI*85*t)*exp(-12*t)+0.3*(random(0)*2-1)*exp(-70*t):d=0.4:s=48000", "volume=0.7"],
      // the Crossover sting: a deep hit and a rising three-note chime, the same at the end of every video
      sting: ["aevalsrc=0.9*sin(2*PI*55*t)*exp(-3.5*t)+0.25*(random(0)*2-1)*exp(-40*t)+0.32*sin(2*PI*329.6*(t-0.05))*exp(-5*(t-0.05))*(1+sgn(t-0.05))/2+0.32*sin(2*PI*493.9*(t-0.22))*exp(-5*(t-0.22))*(1+sgn(t-0.22))/2+0.36*sin(2*PI*659.3*(t-0.39))*exp(-3.2*(t-0.39))*(1+sgn(t-0.39))/2:d=1.8:s=48000", "volume=0.6"] };
    for (const [k, [src, fx]] of Object.entries(SYN)) await run(["-y", "-loglevel", "error", "-f", "lavfi", "-i", src, "-af", fx, "-ar", "48000", "-ac", "1", path.join(tmp, k + ".wav")]);
    // the voice: optionally shifted deeper (PITCH < 1, Kokoro only) without changing its speed
    const P = data.voiceEngine === "chatterbox" ? 1 : Math.min(1, Math.max(.8, +process.env.PITCH || 1));   // the Chatterbox voice is already deep
    // a touch of presence for the female narrator (no bass boost: that was for the old deep male voice)
    const VFX = (P < 1 ? `,asetrate=${Math.round(48000 * P)},aresample=48000,atempo=${(1 / P).toFixed(4)}` : "") + (process.env.VOICE_EQ || ",highpass=f=70,equalizer=f=3000:t=q:w=1:g=2");
    const ins = [];
    if (voice) SC.forEach(s => { const f = path.join(data.voiceDir, s.id + ".wav"); if (fs.existsSync(f)) ins.push([f, s.va, "v"]); });
    SFX.forEach(e => { if (SYN[e.k] && e.t < total) ins.push([path.join(tmp, e.k + ".wav"), e.t, "s"]); });
    const args = ["-y", "-loglevel", "error", "-i", silent];
    ins.forEach(([f]) => args.push("-i", f));
    // background music: one of the tracks in music/ (picked by date, so it rotates), looped to length, quiet,
    // ducked further whenever the narrator talks, faded in and out
    const MD = data.music ? path.resolve(__dirname, data.music) : path.join(__dirname, "music"), tracks = fs.existsSync(MD) ? fs.readdirSync(MD).filter(x => /\.(mp3|m4a|wav|ogg)$/i.test(x)).sort() : [];
    const track = tracks.length ? path.join(MD, tracks[[...String(data.day || "")].reduce((h, c) => h * 31 + c.charCodeAt(0) >>> 0, 7) % tracks.length]) : null;
    if (track) args.push("-stream_loop", "-1", "-i", track);
    const T = total.toFixed(3), mi = ins.length + 1;
    let f = ins.map(([, at, kind], i) => `[${i + 1}:a]aresample=48000${kind === "v" ? VFX : ""},adelay=delays=${Math.round(at * 1000)}:all=1[a${i}]`).join(";");
    const vs = ins.map((x, i) => x[2] === "v" ? `[a${i}]` : "").join(""), sx = ins.map((x, i) => x[2] !== "v" ? `[a${i}]` : "").join("");
    const nv = ins.filter(x => x[2] === "v").length, ns = ins.length - nv;
    if (track && nv) {
      f += `;${vs}amix=inputs=${nv}:normalize=0,apad,atrim=0:${T},asplit=2[v1][v2]` +
        `;[${mi}:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:${T},volume=${process.env.MUSIC_VOL || "0.16"},afade=t=in:d=1.2,afade=t=out:st=${Math.max(0, total - 2.5).toFixed(3)}:d=2.5[m0]` +
        `;[v2]aformat=channel_layouts=stereo[sc];[m0][sc]sidechaincompress=threshold=0.02:ratio=6:attack=15:release=400[m1]` +
        `;[v1]${sx}[m1]amix=inputs=${2 + ns}:normalize=0,atrim=0:${T},loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[a]`;
    } else {
      f += `;${ins.map((_, i) => `[a${i}]`).join("")}amix=inputs=${ins.length}:normalize=0,apad,atrim=0:${T},loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[a]`;
    }
    if (track) console.log("music:", path.basename(track));
    args.push("-filter_complex", f, "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", out);
    await run(args); fs.unlinkSync(silent); fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log(`${out}: ${frames} frames, ${total.toFixed(1)}s${voice ? ", with voiceover" : ""}, ${SFX.length} sound effects`);
})().catch(e => { console.error(e); process.exit(1); });
