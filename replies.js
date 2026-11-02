/* Comment replies for the two video pages. Paste a viewer's comment, get three replies in the channel's voice.
   Free and instant: no AI service, nothing leaves the page. It works out what kind of comment it is (a score, a question,
   a correction, a suggestion, a debate, praise, a hater, a question about the AI voice, spam) and answers questions and
   corrections with the real numbers from the channel's checked fact tables (clips/game/legends.json,
   space/game/planets.json) or the video's own caption. Used by VP (videos.js); REPLY.make() is plain JS so it can be tested. */
"use strict";
(function (root) {
  const com = n => Math.round(n).toLocaleString("en-US");
  const rng = s => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return () => { h += 0x6D2B79F5; let t = h; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
  const WORDN = { zero: 0, none: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 };
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

  // ---- the channels' voices
  const CH = {
    crossover: { em: ["🔥", "🏀", "🏈", "💪", "👀", "🙌"], cta: ["New game every morning, new stats every night 🔥", "New legends game drops every morning 🏀🏈", "Run it back tomorrow, new game every morning 💪"],
      src: "regular-season career totals", nameOf: "Crossover" },
    liftoff: { em: ["🚀", "🪐", "🌌", "✨", "👀", "☄️"], cta: ["New space game every morning 🚀", "A new space game drops every morning 🪐", "Come back tomorrow for a new one 🚀"],
      src: "NASA's planetary fact sheet", nameOf: "Liftoff" }
  };

  // ---- what kind of comment is it
  const has = (t, re) => re.test(t);
  function kind(t, ch) {
    const s = t.toLowerCase();
    if (has(s, /https?:\/\/|www\.|\.(com|net|io|xyz|ly)\b|t\.me|telegram|whats ?app|dm me|check (out )?my (channel|page|profile)|sub(scribe)? to (me|my)|free (money|robux|vbucks|gift)|crypto signals|onlyfans/)) return "spam";
    if (has(s, /\b(n[i1]gg|f[a@]gg?ot|retard|kys|kill yourself)/)) return "abuse";
    if (has(s, /\b(ai|a\.i\.|bot|robot|tts|text to speech|computer|fake) ?(voice|narrat|generated|slop|video|channel)|\bai\b.*\bvoice|voice.*\b(ai|robot|bot)\b|is this ai|^ai\b/)) return "ai";
    if (score(s)) return "score";
    if (ch === "crossover" && has(s, /lebron|le bron|\bbron\b|james harden|curry|durant|\bkd\b|mahomes|rodgers|derrick henry/)) return "active";
    if (ch === "liftoff" && has(s, /pluto/)) return "pluto";
    if (has(s, /\b(wrong|incorrect|not true|not right|isn'?t right|that'?s false|fact ?check|misinformation|mistake|\bcap\b|lies?\b|lying|actually|no it'?s|it'?s not|nope|no way|pretty sure|should (be|have been)|(way |a lot )?(more|less|fewer) than that|than that|that'?s not)\b/)) return "correction";
    if (has(s, /\b(do|make|cover) (a |an |one |more |the )?(video|one|game|quiz)s? (on|about|with)|can you (do|make|cover)|you should (do|make|cover)|next (do|time)|pls do|please do|do one (on|about|with)|make one (on|about|with)|more (videos? )?(on|about)\b|what about\b/)) return "suggest";
    if (has(s, /\?|^(how|hows|how'?s|what|whats|what'?s|why|when|whens|where|wheres|who|whos|who'?s|which|is|are|does|do|did|can|could|will|would|was|were)\b/)) return "question";
    if (ch === "crossover" && has(s, /\bgoat\b|better than|\bvs\.?\b|overrated|underrated|\bover\b|>\s*\w/)) return "debate";
    if (has(s, /\b(boring|trash|garbage|mid|cringe|worst|dumb|stupid|lame|sucks?|bad|terrible|unsubscrib|who cares|nobody asked)\b|👎|🗑/)) return "hater";
    if (has(s, /\b(first|early)\b/) && s.length < 20) return "first";
    if (has(s, /\b(love|great|awesome|amazing|fire|lit|nice|cool|fun|best|goated|w channel|keep (it )?up|good|sick|dope|underrated|banger|addicted|learned|so cool|so good)\b|🔥|❤|👏|🙌|💯|😍|\bw\b/)) return "praise";
    if (!s.replace(/[\s\p{Emoji}\p{P}]/gu, "")) return "emoji";
    return "other";
  }
  // "3/4", "3 out of 4", "got all of them", "got 2 right", "perfect", "0/3"
  function score(s) {
    let m = s.match(/(\d+|zero|none|one|two|three|four|five|six)\s*(?:\/|out of|outta|of)\s*(\d+|one|two|three|four|five|six)/);
    if (m) { const n = WORDN[m[1]] ?? +m[1], d = WORDN[m[2]] ?? +m[2]; if (d > 0 && d <= 10 && n <= d) return { n, d }; }
    if (/\b(got|get) (them )?all\b|\ball (of them )?right\b|perfect( score)?\b|100 ?%|flawless|clean sweep|\bswept\b/.test(s)) return { n: null, d: null, perfect: true };
    m = s.match(/\bgot (\d|zero|none|one|two|three|four|five|six) (right|correct)\b/); if (m) return { n: WORDN[m[1]] ?? +m[1], d: null };
    if (/\bgot (none|zero|0)\b|\bnone right\b|\b0 right\b/.test(s)) return { n: 0, d: null };
    return null;
  }

  // ---- facts from the tables
  function players(L) {
    const P = new Map();
    for (const S of L.stats) for (const p of S.players) { const e = P.get(p.name) || { name: p.name, short: p.short, stats: [] }; e.stats.push({ S, v: p.v }); P.set(p.name, e); }
    return [...P.values()];
  }
  function findPlayers(t, L) {
    const s = t.toLowerCase(), out = [];
    for (const p of players(L)) {
      const last = p.name.split(" ").slice(-1)[0].replace(/\.$/, "").toLowerCase(), keys = [p.name.toLowerCase(), (p.short || "").toLowerCase()];
      // last names that are also everyday words or shared by two legends need the full name
      if (!["moon", "brown", "johnson", "smith", "malone", "miller", "thomas", "allen", "carter", "martin", "james", "jackson", "manning", "payton", "wayne", "bird", "west", "rice", "gore"].includes(last)) keys.push(last);
      if (keys.some(k => k && k.length > 2 && new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(s))) out.push(p);
    }
    return out;
  }
  const STATW = [["pyd", /passing yards|threw for|pass(ing)? yds/], ["ptd", /touchdown|\btds?\b|td pass/], ["rush", /rush|ran for|running/], ["rec", /receiv|catch|caught|rec yards/],
    ["reb", /rebound|boards|\breb/], ["ast", /assist|dimes|\bast/], ["pts", /points|scored|\bpts\b|scoring/]];
  const statKey = t => (STATW.find(([, re]) => re.test(t.toLowerCase())) || [])[0];
  function playerFact(p, key) {
    const e = (key && p.stats.find(x => x.S.key === key)) || p.stats[0];
    return `${p.name} finished with ${com(e.v)} ${e.S.noun}`;
  }
  const BODY = { mercury: "mercury", venus: "venus", earth: "earth", mars: "mars", jupiter: "jupiter", saturn: "saturn", uranus: "uranus", neptune: "neptune", moon: "moon" };
  function findBodies(t, Pl) { const s = t.toLowerCase(); return Pl.bodies.filter(b => new RegExp(`\\b${b.id}\\b`).test(s)); }
  function planetFact(b, t) {
    const s = t.toLowerCase(), nm = b.name, deg = x => `${x < 0 ? "minus " + com(-x) : com(x)}°F`, wt = Math.round(100 * b.grav / 32.1);
    if (/hot|cold|temp|warm|freez/.test(s)) return `${cap(nm)} averages about ${deg(b.temp)}`;
    if (/far|distance|close|away/.test(s) && b.dist) return `${cap(nm)} is about ${com(b.dist)} million miles from the Sun`;
    if (/gravity|weigh|heavy/.test(s)) return b.id === "earth" ? "Earth is our 100 lb baseline" : `a 100 lb person would weigh about ${wt} lb on ${nm}`;
    if (/ring/.test(s) && b.rings != null) return `${cap(nm)} ${b.rings ? "has" : "has no"} rings`;
    if (/moon/.test(s) && b.id !== "moon") return b.moons != null ? `${cap(nm)} has ${["no moons", "one moon", "two moons"][b.moons]}` : `${cap(nm)} has dozens of moons, and astronomers keep finding more`;
    if (/year|orbit|around the sun/.test(s) && b.orbit) return `one trip around the Sun takes ${nm} about ${b.orbit > 700 ? (b.orbit / 365.25).toFixed(1) + " Earth years" : com(b.orbit) + " Earth days"}`;
    if (/day|spin|rotat/.test(s) && b.day) return `a day on ${nm} lasts about ${b.day} hours`;
    if (/big|size|wide|small|diameter/.test(s) || true) return `${cap(nm)} is about ${com(b.diam)} miles wide`;
  }
  // a line from the video's own caption about the thing they asked about (reports: asteroid, aurora, launch, Sun, Moon)
  function captionFact(t, body) {
    const s = t.toLowerCase(), L = String(body || "").split("\n");
    const want = /asteroid|rock|flyby/.test(s) ? "☄️" : /aurora|northern lights/.test(s) ? "🌌" : /launch|rocket|spacex|liftoff/.test(s) ? "🚀" : /sun|flare/.test(s) ? "☀️" : /moon/.test(s) ? "🌕" : null;
    const line = want && L.find(l => l.startsWith(want));
    if (!line) return null;
    const txt = line.replace(/^\S+\s*/, "").trim();
    if (want !== "🚀") return txt;
    const m = txt.match(/^(.*?\bET|[A-Z]{3}, [A-Z]{3} \d+[^:]*?): (.*)$/), tc = x => x.replace(/\b([A-Z])([A-Z]{2,})\b/g, (_, a, b) => a + b.toLowerCase()).replace(/\bEt\b/, "ET").replace(/\b(Am|Pm)\b/, x => x.toUpperCase());
    return m ? `next launch: ${m[2]}, ${tc(m[1]).replace(/(\d) (\d)/, "$1 at $2")}. Times can slip, so check before you watch` : `next launch: ${txt}`;
  }

  // ---- the replies
  function make({ channel, comment, video, facts, seed }) {
    const C = CH[channel] || CH.crossover, t = String(comment || "").trim(), R = rng(t + "|" + (seed || 0)), pick = a => a[Math.floor(R() * a.length)];
    const e = () => pick(C.em), cta = () => pick(C.cta), K = kind(t, channel), title = (video && video.name) || "";
    const game = (title.match(/Higher or Lower|True or False|Who Has More|Odd One Out|Which Planet|Guess the Planet/i) || [])[0];
    const out = new Set(), note = [];
    const add = (...xs) => xs.forEach(x => x && out.add(x.replace(/\s+/g, " ").trim()));
    const L = facts && facts.legends, Pl = facts && facts.planets;
    if (K === "spam") return { kind: K, label: "Spam", tip: "Looks like spam. Delete it (or hide the user) rather than replying, so it doesn't get a boost.", replies: [] };
    if (K === "abuse") return { kind: K, label: "Abusive", tip: "Don't reply. Remove the comment and hide the user from your channel; replies only feed it.", replies: [] };
    if (K === "score") {
      const sc = score(t.toLowerCase()), r = sc.perfect ? 1 : sc.d ? sc.n / sc.d : sc.n === 0 ? 0 : null, x = sc.d ? `${sc.n}/${sc.d}` : sc.n != null ? `${sc.n}` : "";
      if (r === 1) add(`A perfect ${sc.d ? x : "score"}?! ${e()} You might be the one to beat. ${cta()}`, `Perfect score, no notes ${e()} See if you can keep the streak going tomorrow`, `Flawless ${e()} ${game ? game + " didn't stand a chance." : "Too easy for you."} New one drops tomorrow morning`, `Clean sweep! ${e()} Bet you can't do it twice 👀`);
      else if (r != null && r >= .5) add(`${x} is solid ${e()} Which one got you?`, `${x}, nice! ${e()} ${game ? game + " gets tricky fast." : "That last one trips up a lot of people."} ${cta()}`, `Respect, ${x} ${e()} Run it back tomorrow for the perfect score`, `${x} 👏 Which one was the toughest?`);
      else if (r != null) add(`${sc.d ? x + " is still a win" : "Still a win"}, these are tough ${e()} Tomorrow's your redemption game`, `Hey, everyone starts somewhere ${e()} New game every morning, you'll get it`,
        sc.d ? `That ${x} just means you learned ${sc.d - sc.n} new thing${sc.d - sc.n === 1 ? "" : "s"} today ${e()} Run it back tomorrow` : `Now you know all the answers for next time ${e()} Run it back tomorrow`);
      else add(`Nice ${e()} ${cta()}`, `Let's go ${e()} Which one got you?`, `Love it ${e()} New one tomorrow morning`);
      return { kind: K, label: `A score${sc.d ? " · " + x : ""}`, replies: [...out].slice(0, 3) };
    }
    if (K === "ai") {
      add(`Yep, the narrator is an AI voice 🎙️ Every ${channel === "liftoff" ? "fact comes from NASA" : "stat is checked against two sources"} though ${e()}`,
        `Good ear! It's an AI voice, but the ${channel === "liftoff" ? "facts are straight from NASA" : "numbers are real career totals"} ✅ ${cta()}`,
        `Guilty, AI narrator 🤖 The ${channel === "liftoff" ? "space facts" : "stats"} are all double-checked though ${e()}`);
      return { kind: K, label: "Asking about the AI voice", tip: "Be upfront about the AI voice; it builds trust.", replies: [...out] };
    }
    if (K === "active") {
      add(`Our legends games only use retired players, so the numbers never change ${e()} Active stars like that get their own videos in the nightly recaps`,
        `Great point! We keep the games to retired legends so the career totals stay locked in ${e()} The current guys are all over our nightly stat recaps`,
        `Totally, and that's why we stick to retired legends for the games: their numbers are final ✅ ${cta()}`);
      return { kind: K, label: "Mentions an active player", replies: [...out] };
    }
    if (K === "pluto") {
      add(`Pluto's a dwarf planet these days, so it sits out of the planet games 🥲 Justice for Pluto though`, `We miss Pluto too 🥲 It's officially a dwarf planet, so it's not in the eight-planet games. Maybe a bonus round someday 👀`, `Pluto fans unite 🪐 It's a dwarf planet now, which is why it's not in these, but it deserves its own video`);
      return { kind: K, label: "Pluto!", replies: [...out] };
    }
    // facts they might be asking about or correcting
    let fact = null, fsrc = C.src;
    const cmpw = /\b(more|most|better|bigger|biggest|larger|smaller|hotter|colder|farther|further|closer|heavier|higher|lower|longer|shorter)\b/i.test(t);
    if (channel === "crossover" && L) { const ps = findPlayers(t, L), key = statKey(t);
      if (ps.length >= 2) { const k = key || ps[0].stats.find(x => ps[1].stats.some(y => y.S.key === x.S.key))?.S.key;
        const a = ps[0].stats.find(x => x.S.key === k), b = ps[1].stats.find(x => x.S.key === k);
        fact = a && b ? `${ps[0].name} has ${com(a.v)} ${a.S.noun} and ${ps[1].name} has ${com(b.v)}` : `${playerFact(ps[0], key)}, and ${playerFact(ps[1], key)}`;
        if (a && b && cmpw && K === "question") { const w = a.v > b.v ? ps[0] : ps[1]; fact = `${w.short || w.name} has more: ` + fact; } }
      else if (ps.length) fact = playerFact(ps[0], key); }
    if (channel === "liftoff" && Pl) { const bs = findBodies(t, Pl);
      if (bs.length >= 2) { fact = `${planetFact(bs[0], t)}, and ${planetFact(bs[1], t).replace(/^A /, "a ")}`;
        const ATT = [[/hot|warm/, "temp", 1, "hotter"], [/cold|freez/, "temp", -1, "colder"], [/big|large|wide/, "diam", 1, "bigger"], [/small/, "diam", -1, "smaller"], [/far|further/, "dist", 1, "farther from the Sun"], [/close/, "dist", -1, "closer to the Sun"], [/heav|gravity|weigh/, "grav", 1, "where you'd weigh more"]];
        const at = cmpw && ATT.find(([re, k]) => re.test(t.toLowerCase()) && bs[0][k] != null && bs[1][k] != null);
        if (at) { const [, k, dir, word] = at, w = (bs[0][k] - bs[1][k]) * dir > 0 ? bs[0] : bs[1]; fact = `${cap(w.name)} is ${word}: ` + fact; } }
      else if (bs.length) fact = planetFact(bs[0], t);
      if (!fact) { const cf = captionFact(t, video && video.body); if (cf) { fact = cf; fsrc = "today's report"; } } }
    if (channel === "crossover" && !fact) fact = null;
    if (K === "correction") {
      if (fact) add(`Thanks for checking! Our numbers: ${fact} (${fsrc}) ${e()}`, `Good eye 👀 We go by ${fsrc}: ${fact}. Love that you're keeping us honest`, `Here's what we used: ${fact}, from ${fsrc} ✅ Happy to fix it if we ever slip`);
      else add(`Thanks for flagging! Every number comes from ${C.src}, but tell us which one and we'll double-check ${e()}`, `Appreciate it 🙏 Which part looked off? We check everything against ${C.src} and will fix it if we slipped`, `Good to keep us honest! Point me to the one you mean and I'll look into it ✅`);
      return { kind: K, label: "A correction", tip: fact ? "Double-check the number against the video's fact sheet before replying." : "Ask which number they mean, then check the video's fact sheet.", replies: [...out] };
    }
    if (K === "question") {
      if (fact) add(`${cap(fact)} ${e()}`, `Great question! ${cap(fact)} ${e()}`, fsrc === C.src ? `${cap(fact)}, per ${fsrc} ✅ ${cta()}` : `${cap(fact)} ✅ ${cta()}`);
      else add(`Great question ${e()} That could be a whole video, stay tuned`, `Ooh, good one 👀 Adding it to the list for a future game`, `Love this question ${e()} Drop a follow and we might answer it in a video`);
      return { kind: K, label: fact ? "A question (answered from the facts)" : "A question", tip: fact ? null : "No fact in the tables for this one, so these don't answer it. Reply yourself if you know the answer.", replies: [...out] };
    }
    if (K === "suggest") {
      let topic = (t.match(/\b(?:on|about|with)\s+([^.?!,]{3,40})/i) || t.match(/\b(?:what about|cover|do)\s+([^.?!,]{3,40})/i) || [])[1];
      if (topic) topic = topic.trim().replace(/^(a |an |the |one |some |more )?(video|game|quiz|one)s?\s+(on|about|with)\s+/i, "").replace(/^(a|an|the) /i, "");
      add(`Love that idea${topic ? ", " + topic + " is going on the list" : ""} 👀`, `${topic ? cap(topic) + "? " : ""}Great call ${e()} Follow so you catch it if it drops`, `Noted! ${e()} ${topic ? cap(topic) + " would make a great " + (channel === "liftoff" ? "space " : "") + "game" : "That would make a great game"}`);
      return { kind: K, label: "A suggestion", replies: [...out] };
    }
    if (K === "debate") {
      if (fact) add(`The numbers say: ${fact} ${e()} Who's your pick?`, `Here's the tape: ${fact} 👀 Settle it in the comments`, `${cap(fact)}. Stats only tell part of the story though, who you got? ${e()}`);
      else add(`Now that's a debate ${e()} Who's your pick and why?`, `The comments are about to get heated 👀 Make your case`, `Strong take ${e()} What's your top stat to back it up?`);
      return { kind: K, label: "A debate", replies: [...out] };
    }
    if (K === "hater") {
      add(`Fair, not every one's a hit. What would you want to see instead? ${e()}`, `Appreciate the honesty 🙏 Tomorrow's game might change your mind`, `All good, tough crowd 😅 Tell us what would make it better`);
      return { kind: K, label: "Negative", tip: "Short and calm wins here. Skip replying if it's just trolling.", replies: [...out] };
    }
    if (K === "first") { add(`Early gang ${e()}`, `Speed ${e()} How'd you do on the game?`, `First and fast 👀 ${cta()}`); return { kind: K, label: "First!", replies: [...out] }; }
    if (K === "praise") {
      add(`Appreciate you! ${e()} ${cta()}`, `Thank you 🙏 ${game ? "Did you beat the " + game + "? " : ""}Drop your score next time`, `This means a lot ${e()} More coming every morning`, `Glad you're enjoying it ${e()} Tell a friend who thinks they know ${channel === "liftoff" ? "space" : "sports"} 👀`);
      return { kind: K, label: "Praise", replies: [...out].slice(0, 3) };
    }
    if (K === "emoji") { add(`${e()}${e()}`, `${e()} ${cta()}`, `Appreciate it ${e()}`); return { kind: K, label: "Emoji", replies: [...out] }; }
    if (fact) add(`${cap(fact)} ${e()}`);
    add(`Appreciate you watching ${e()} ${cta()}`, `Thanks for the comment ${e()} How'd you do on the game?`, `Love it ${e()} What should the next game be about?`);
    return { kind: K, label: "A comment", replies: [...out].slice(0, 3) };
  }
  // ---- the panel on the videos page: paste a comment, pick the video, copy a reply
  function mount({ channel, el = "reply" }) {
    const box = document.getElementById(el); if (!box) return;
    const esc = x => String(x).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const CP = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>`;
    box.innerHTML = `<details class="rp"><summary><span class="rpi">💬</span><span><b>Reply to a comment</b><small>Paste a comment, copy a reply</small></span></summary><div class="rpb">
      <div class="rph"><label for="rpc">Their comment</label><button class="lnk" id="rpp" type="button">Paste</button><button class="lnk" id="rpx" type="button">Clear</button></div>
      <textarea id="rpc" rows="3" placeholder="e.g. I got 2/3! Is Venus really hotter than Mercury?"></textarea>
      <label for="rpv">On which video</label><select id="rpv"><option value="">Any video</option></select>
      <div id="rpk" class="rpk"></div><div id="rpo"></div>
      <button class="btn" id="rpm" type="button" hidden>Different replies</button>
      <p class="note">Answers come from the channel's checked facts (${channel === "liftoff" ? "NASA's planetary fact sheet and the video's caption" : "legends' career totals"}). Nothing you paste leaves this page.</p></div></details>`;
    let facts = {}, rel = [], seed = 0, tm = null;
    const base = "../";
    Promise.all([fetch(base + "clips/game/legends.json").then(r => r.ok ? r.json() : null).catch(() => null), fetch(base + "space/game/planets.json").then(r => r.ok ? r.json() : null).catch(() => null)])
      .then(([l, p]) => { facts = { legends: l, planets: p }; go(); });
    const fill = R => { rel = R || []; const v = document.getElementById("rpv"), cur = v.value;
      v.innerHTML = `<option value="">Any video</option>` + rel.slice(0, 30).map((r, i) => `<option value="${i}">${esc(String(r.name || r.tag_name).replace(/\s*#shorts\s*$/i, "").slice(0, 60))}</option>`).join("");
      v.value = cur || (rel.length ? "0" : ""); go(); };
    window.addEventListener("vp:rel", e => fill(e.detail)); if (root.VP && root.VP.rel) fill(root.VP.rel());
    const toast = t => { const e = document.getElementById("toast"); if (!e) return; e.textContent = t; e.classList.add("on"); clearTimeout(e._t); e._t = setTimeout(() => e.classList.remove("on"), 1400); };
    const copy = async t => { try { await navigator.clipboard.writeText(t); } catch (e) { const a = document.createElement("textarea"); a.value = t; document.body.appendChild(a); a.select(); try { document.execCommand("copy"); } catch (_) {} a.remove(); } toast("Reply copied"); };
    function go() {
      const c = document.getElementById("rpc").value.trim(), o = document.getElementById("rpo"), k = document.getElementById("rpk"), m = document.getElementById("rpm");
      if (!c) { o.innerHTML = ""; k.innerHTML = ""; m.hidden = true; return; }
      const vi = document.getElementById("rpv").value, R = make({ channel, comment: c, video: vi === "" ? null : rel[+vi], facts, seed });
      k.innerHTML = `<span class="rpt">${esc(R.label)}</span>${R.tip ? `<span class="rptip">${esc(R.tip)}</span>` : ""}`;
      o.innerHTML = R.replies.map((x, i) => `<div class="rpr"><p>${esc(x)}</p><button class="btn" data-rp="${i}" type="button">${CP}Copy</button></div>`).join("");
      o._r = R.replies; m.hidden = !R.replies.length;
    }
    box.addEventListener("input", e => { if (e.target.id === "rpc") { seed = 0; clearTimeout(tm); tm = setTimeout(go, 200); } });
    box.addEventListener("change", e => { if (e.target.id === "rpv") go(); });
    box.addEventListener("click", async e => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.rp != null) copy(document.getElementById("rpo")._r[+b.dataset.rp]);
      if (b.id === "rpm") { seed++; go(); }
      if (b.id === "rpx") { document.getElementById("rpc").value = ""; go(); document.getElementById("rpc").focus(); }
      if (b.id === "rpp") { try { const t = await navigator.clipboard.readText(); if (t) { document.getElementById("rpc").value = t; seed = 0; go(); } } catch (err) { toast("Long-press the box and tap Paste"); document.getElementById("rpc").focus(); } }
    });
  }
  const API = { make, kind, mount };
  if (typeof module !== "undefined") module.exports = API; else root.REPLY = API;
})(typeof window !== "undefined" ? window : globalThis);
