/* English Room — voice-first English conversation practice.
   Runs entirely in the browser: Gemini API for the conversation,
   the browser's own speech recognition and speech synthesis for voice,
   and localStorage for memory. Nothing is sent anywhere except Google's Gemini API. */
(() => {
  "use strict";

  // =====================================================================
  // Characters
  // =====================================================================
  const TEACHER = {
    id: "teacher", name: "Mr. Bennett", initials: "TB", color: "#2f5d50", gender: "male",
    role_ko: "영어 선생님", tagline_ko: "58세 · 보스턴 · 영어 선생님", builtin: true,
    persona: `You are Thomas "Tom" Bennett, a 58-year-old American English teacher. The student calls you Mr. Bennett unless you agree on something else.
Background: born in Portland, Maine; taught English and literature at a Boston high school for 30 years; also worked a few years as a newspaper copy editor. In the mid-1990s you lived in Seoul for three years teaching English, so you understand Korean well and know Korean culture, but you speak English with the student. Widely read: history, literature, a bit of science, jazz, baseball (Red Sox), gardening, fly fishing, cooking chowder. Married to Linda, a retired nurse; two adult children. Warm, patient, curious, dry sense of humor, never condescending.`,
    teach_style: `You are the student's main teacher. Correct readily (still max one per turn), explain clearly when asked, and run short drills. You also look after the student's whole English life: you can help them build new practice partners (see CREATING A NEW PERSON).`
  };
  const COLORS = ["#8a4b2f", "#3d5a80", "#7a3e65", "#5b6b2f", "#9a6a12", "#2f6b73", "#6b4c9a"];

  const BASE_RULES = `HOW YOU TALK WITH THE STUDENT (a Korean adult learning English)
- This is a SPOKEN voice conversation: your "say" text is read aloud by text-to-speech, and the student answers by speaking (their words reach you through speech recognition, so ignore small recognition glitches like missing punctuation, odd capitalization or a misheard word; don't "correct" those). Write "say" as natural speech: no emojis, no bullet points, no parentheses, no markdown.
- You LEAD the conversation. The student finds it hard to drive a conversation in English, so you propose topics and situations, ask questions, and keep things moving. End almost every turn with ONE easy, concrete question or a clear next step. If the student is in the middle of telling a story, react genuinely and ask a follow-up instead of changing the subject.
- Talk like a real person, not a textbook: short spoken-style turns (usually 1-3 sentences, max ~45 words). Match vocabulary and speed to the student's level; slightly above it is ideal.
- Vary what you do: everyday chat (their day, work, family, plans, memories), your own stories and opinions, and situations or role-plays that fit your relationship. Stay in character, but still lead.
- Corrections: at most ONE per turn, only for a meaningful or repeated grammar/word-choice error. Put it in "correction"; in "say" you may also naturally recast the right form. If the sentence was fine, correction is null. Keep the flow.
- Praise: occasionally (not every turn), specific and sincere. Put it in "praise".
- Korean: the student may mix in or switch to Korean when stuck. Understand it, never scold, give the natural English version in "correction" (you_said = their Korean, better = natural English, why_ko = brief tip), and continue in English.
- Questions about English (in Korean or English): answer clearly; put a short Korean explanation in "note_ko" with an example, then offer a quick try.
- Memory: use the memory below naturally - remember their name, life, and stories; follow up on things they mentioned; recycle expressions they learned and target their weak patterns. Never recite the memory back as a list.
- Hints: always give 2-3 short example replies the student could say next, at their level, in English.
- Never break character to talk about being an AI unless the student sincerely asks.`;

  const CREATE_RULES = `CREATING A NEW PERSON
- The student can have more people to practice English with (e.g. a friend, a coworker, a neighbor, a shop owner, a travel buddy). They are other characters the student talks to separately.
- When to suggest it: only if past sessions >= 3, there are fewer than 6 people, and nobody has been added recently. Do it at a natural pause (e.g. when a topic winds down), lightly. If the student is not interested, drop it.
- When the student agrees (or presses the create button), design the person TOGETHER, in English, one question at a time: what kind of relationship and what they want to practice, then gender and age, where they're from, job, personality, hobbies, and finally a name. Offer 2-3 options at each step (in hints) so it's easy. This is also English practice, so keep correcting lightly.
- When everything is decided, describe the person back in 1-2 sentences, and in THE SAME reply include the "new_character" field. Include it only once, only after the student has agreed to the details.
"new_character": {"name": "how the student will call them, e.g. Jake", "initials": "2 letters", "gender": "male" or "female", "role_ko": "관계 (예: 회사 동료)", "tagline_ko": "나이 · 사는 곳 · 직업 (Korean, short)",
  "persona": "Detailed English description written as 'You are ...': full name, age, gender, hometown, where they live now, job, family, personality, interests, how they talk (slang, formality, humor), and how they know the student",
  "teach_style": "How this person helps with English, consistent with the relationship (e.g. a friend corrects rarely and casually and teaches slang; a coworker helps with workplace English)"}`;

  function outputSpec(c){
    return `OUTPUT: reply with ONLY one JSON object with these keys:
{"say": "what you say out loud, in English",
 "say_ko": "natural Korean translation of say",
 "correction": null or {"you_said": "...", "better": "...", "why_ko": "짧은 한국어 설명"},
 "praise": null or "short English praise",
 "note_ko": null or "Korean explanation when the student asked something or is clearly stuck",
 "hints": ["example reply 1", "example reply 2", "example reply 3"]${c.builtin ? `,
 "new_character": only when finishing the creation of a new person, otherwise omit` : ""}}`;
  }

  function actionsFor(c){
    return {
      begin_first: c.builtin
        ? "[ACTION: This is your very first meeting with this student. Greet them warmly, introduce yourself briefly, and ask their name. Over the next turns get to know them naturally (what to call them, where they live, job, family, hobbies, why they want to learn English, past English experience) while quietly assessing their level. Ask one thing at a time. Keep your English simple until you know their level.]"
        : "[ACTION: This is your first real conversation with the student. You already know the basics about them from the memory (how you know them is described in your persona). Greet them in character, introduce yourself a little, and start a natural conversation that fits your relationship. Ask one thing at a time.]",
      begin_regular: "[ACTION: A new session starts. Greet the student by name, referring to something from the memory (a follow-up from last time or something from their life). Then propose what to do today, e.g. offer a choice of two things that fit your relationship. Keep it short.]",
      resume: "[ACTION: The student came back to continue this same session after a break. Welcome them back in one short line and pick up where you left off.]",
      topic: "[ACTION: The student wants a different topic or situation. Suggest something new and fresh (avoid recent topics), and start it.]",
      practice: "[ACTION: The student wants to practice. Run a short drill based on their recent mistakes or new expressions from memory/this session, one item at a time.]",
      easier: "[ACTION: The student finds it hard to follow. From now on use simpler words, shorter sentences, and give a bit more support. Re-ask your last question in an easier way.]",
      create: "[ACTION: The student wants to create a new person to practice English with. Start designing the person together as described in CREATING A NEW PERSON, one question at a time.]"
    };
  }

  const SUMMARY_RULES = `You maintain the long-term memory of an English learning relationship. You will get the CURRENT MEMORY (JSON) and the TRANSCRIPT of the latest session between the student and one character. The student's lines came through speech recognition, so ignore recognition glitches when judging their English.
Return ONLY one JSON object with the UPDATED memory:
{"profile": {"name": "student's name or empty", "call_me": "what people should call them", "facts": ["short facts about the student's life, job, family, hobbies, preferences, goals - in Korean"]},
 "english": {"level": "CEFR level like A2 or B1+", "level_note_ko": "1-2 sentence Korean description of their current level and progress",
   "patterns": [{"issue_ko": "recurring error pattern in Korean", "example": "student's wrong sentence -> corrected", "count": number}],
   "learned": ["new English expression - 한국어 뜻"],
   "strengths": ["what they do well, in Korean"],
   "korean_fallbacks": ["Korean phrase they switched to -> English way to say it"]},
 "story_entry": {"title": "short Korean title of today's session", "summary_ko": "2-4 sentence Korean summary of what was talked about and what happened in the student's life",
   "follow_ups": ["things this character should ask about or continue next time, in Korean"]}}
Rules: merge with the current memory - keep existing facts unless contradicted, add new ones, update counts, drop trivial ones. Keep facts <= 40, patterns <= 12 (most important first), learned <= 80 (newest last), korean_fallbacks <= 30. Only record what actually happened; do not invent.`;

  // =====================================================================
  // Storage (this device only) + settings
  // =====================================================================
  const P = "er_";
  const Store = {
    get(k){ try { const v = localStorage.getItem(P + k); return v ? JSON.parse(v) : null; } catch { return null; } },
    set(k, v){ try { localStorage.setItem(P + k, JSON.stringify(v)); return true; } catch (e) { console.warn(e); return false; } },
    del(k){ try { localStorage.removeItem(P + k); } catch {} },
    keys(){ const out = []; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(P)) out.push(k.slice(P.length)); } } catch {} return out; }
  };
  const settings = Object.assign({
    apiKey: "", model: "", autoSpeak: true, autoSend: true, handsFree: false, rate: 1.0, recLang: "en-US", voices: {}
  }, Store.get("settings") || {});
  const saveSettings = () => Store.set("settings", settings);

  // =====================================================================
  // State
  // =====================================================================
  let chars = [TEACHER];
  let CHAR = TEACHER;
  let mem = { profile: Store.get("profile"), english: Store.get("english") };
  let story = { entries: [] };
  let session = { messages: [], startedAt: null };
  let busy = false, inChat = false;

  const cl = Store.get("characters");
  if (cl && Array.isArray(cl.list)) chars = [TEACHER, ...cl.list.filter(c => c && c.id && c.id !== "teacher")];

  const $ = id => document.getElementById(id);
  const msgsEl = $("msgs");
  const sessionKey = (c = CHAR) => "session_" + c.id;
  const storyKey = (c = CHAR) => "story_" + c.id;
  const storyOf = c => { const s = Store.get(storyKey(c)); return s && Array.isArray(s.entries) ? s : { entries: [] }; };
  const totalSessions = () => chars.reduce((a, c) => a + storyOf(c).entries.length, 0);

  function today(){ const d = new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
  function el(tag, cls, text){ const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function avatar(c){ const a = el("div", "avatar", c.initials || (c.name||"?").slice(0,2).toUpperCase()); a.style.background = c.color || "var(--green)"; return a; }

  // =====================================================================
  // Gemini API
  // =====================================================================
  const API = "https://generativelanguage.googleapis.com/v1beta";

  async function listModels(key){
    const r = await fetch(`${API}/models?pageSize=200`, { headers: { "x-goog-api-key": key } });
    if (!r.ok) throw await apiError(r);
    const j = await r.json();
    return (j.models || [])
      .filter(m => (m.supportedGenerationMethods || []).includes("generateContent"))
      .map(m => m.name.replace(/^models\//, ""))
      .filter(n => /^gemini/.test(n) && !/(tts|image|audio|live|embedding|transcribe|translate|robotics|computer|vision|exp)/i.test(n));
  }
  function pickDefaultModel(names){
    const ver = n => { const m = n.match(/gemini-(\d+(?:\.\d+)?)/); return m ? parseFloat(m[1]) : 0; };
    const score = n => ver(n) * 10 - (/preview/.test(n) ? 3 : 0) - (/lite/.test(n) ? 1 : 0) - (/\d{3,}/.test(n.replace(/gemini-\d+(\.\d+)?/, "")) ? 1 : 0);
    const flash = names.filter(n => /flash/.test(n));
    const pool = flash.length ? flash : names;
    return pool.sort((a, b) => score(b) - score(a))[0] || "";
  }
  async function apiError(r){
    let msg = ""; try { const j = await r.json(); msg = (j.error && j.error.message) || ""; } catch {}
    const e = new Error(msg || ("HTTP " + r.status));
    e.status = r.status;
    e.code = r.status === 429 ? "rate_limited" : (r.status === 400 && /api key/i.test(msg)) || r.status === 403 ? "bad_key" : r.status === 404 ? "bad_model" : "api";
    return e;
  }

  async function llm(system, messages){
    if (!settings.apiKey) { const e = new Error("no key"); e.code = "no_key"; throw e; }
    if (!settings.model) {
      settings.model = pickDefaultModel(await listModels(settings.apiKey)); saveSettings();
      if (!settings.model) { const e = new Error("no model"); e.code = "bad_model"; throw e; }
    }
    const body = {
      systemInstruction: { parts: [{ text: system }] },
      contents: messages.map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
      generationConfig: { responseMimeType: "application/json", temperature: 0.9 }
    };
    let r;
    for (let attempt = 0; attempt < 2; attempt++) {
      r = await fetch(`${API}/models/${encodeURIComponent(settings.model)}:generateContent`, {
        method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": settings.apiKey }, body: JSON.stringify(body)
      });
      if (r.status !== 503 && r.status !== 500) break;
      await new Promise(res => setTimeout(res, 1200 + Math.random() * 800));
    }
    if (!r.ok) throw await apiError(r);
    const j = await r.json();
    const parts = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [];
    const text = parts.filter(p => !p.thought).map(p => p.text || "").join("");
    if (!text) { const e = new Error((j.promptFeedback && j.promptFeedback.blockReason) || "empty"); e.code = "api"; throw e; }
    return text;
  }

  function errorText(e){
    if (!e) return "답변을 가져오지 못했어요.";
    if (e.code === "no_key") return "먼저 Gemini API 키를 넣어 주세요 (☰ 메뉴 → 설정).";
    if (e.code === "bad_key") return "API 키가 맞지 않거나 권한이 없어요. ☰ 메뉴에서 키를 확인해 주세요.";
    if (e.code === "rate_limited") return "무료 사용량 한도에 잠시 걸렸어요. 1분쯤 뒤에 다시 시도해 주세요. 자주 그러면 ☰ 메뉴에서 더 가벼운 모델(flash-lite)로 바꿔 보세요.";
    if (e.code === "bad_model") return `모델(${settings.model})을 쓸 수 없어요. ☰ 메뉴 → 설정에서 다른 모델을 골라 주세요.`;
    if (e instanceof TypeError) return "인터넷 연결을 확인해 주세요.";
    return "답변을 가져오지 못했어요. (" + (e.message || "").slice(0, 120) + ")";
  }

  // =====================================================================
  // Speech out (browser text-to-speech)
  // =====================================================================
  const synth = window.speechSynthesis || null;
  let allVoices = [];
  const MALE = /(daniel|alex\b|fred|aaron|arthur|gordon|rishi|tom\b|oliver|james|guy|david|mark|ryan|eric|andrew|brian|christopher|roger|steffan|thomas|male)/i;
  const FEMALE = /(samantha|karen|moira|tessa|victoria|allison|ava|susan|zira|aria|jenny|michelle|emma|libby|sonia|serena|kate|female|nicky|martha|catherine)/i;
  function loadVoices(){ try { allVoices = (synth ? synth.getVoices() : []).filter(v => /^en[-_]/i.test(v.lang)); } catch { allVoices = []; } }
  if (synth) { loadVoices(); try { synth.addEventListener("voiceschanged", loadVoices); } catch { synth.onvoiceschanged = loadVoices; } }
  function voiceFor(c){
    const want = settings.voices[c.id];
    if (want) { const v = allVoices.find(v => v.voiceURI === want); if (v) return v; }
    const g = c.gender === "female" ? FEMALE : MALE;
    const notG = c.gender === "female" ? MALE : FEMALE;
    const us = allVoices.filter(v => /en[-_]US/i.test(v.lang));
    const pool = c.builtin ? us : allVoices;
    return pool.find(v => g.test(v.name) && !notG.test(v.name) && v.localService) || pool.find(v => g.test(v.name) && !notG.test(v.name))
        || us.find(v => g.test(v.name)) || us[0] || allVoices[0] || null;
  }
  let speakToken = 0, speakingBubble = null;
  function speak(text, bubble){
    return new Promise(resolve => {
      if (!synth || !text) return resolve(false);
      stopSpeaking();
      const token = ++speakToken;
      const chunks = (text.match(/[^.!?]+[.!?]*["')\]]*\s*/g) || [text]).map(s => s.trim()).filter(Boolean);
      const v = voiceFor(CHAR);
      speakingBubble = bubble || null;
      if (speakingBubble) speakingBubble.classList.add("speaking");
      setMic("speaking");
      let i = 0;
      const done = finished => {
        if (token !== speakToken) return resolve(false);
        if (speakingBubble) speakingBubble.classList.remove("speaking");
        speakingBubble = null;
        setMic(busy ? "thinking" : "idle");
        resolve(finished);
      };
      const next = () => {
        if (token !== speakToken) return;
        if (i >= chunks.length) return done(true);
        const u = new SpeechSynthesisUtterance(chunks[i++]);
        u.lang = v ? v.lang : "en-US"; if (v) u.voice = v; u.rate = settings.rate;
        u.onend = next;
        u.onerror = ev => { if (ev.error === "interrupted" || ev.error === "canceled") done(false); else next(); };
        try { synth.speak(u); } catch { done(false); }
      };
      next();
    });
  }
  function stopSpeaking(){
    speakToken++;
    if (speakingBubble) speakingBubble.classList.remove("speaking");
    speakingBubble = null;
    try { if (synth) synth.cancel(); } catch {}
  }
  let unlocked = false;
  function unlockAudio(){
    if (unlocked || !synth) return; unlocked = true;
    try { const u = new SpeechSynthesisUtterance(" "); u.volume = 0; synth.speak(u); } catch {}
  }

  // =====================================================================
  // Speech in (browser speech recognition)
  // =====================================================================
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  const isAndroid = /Android/i.test(navigator.userAgent);
  let rec = null, listening = false, heardFinal = "", heardInterim = "", silenceTimer = null, cancelListen = false;

  function startListening(){
    if (!SR || listening || busy) return;
    stopSpeaking();
    heardFinal = ""; heardInterim = ""; cancelListen = false;
    try {
      rec = new SR();
      rec.lang = settings.recLang;
      rec.interimResults = true;
      rec.continuous = !isAndroid;
      rec.maxAlternatives = 1;
    } catch (e) { showError("이 브라우저에서는 음성 인식을 쓸 수 없어요. 키보드로 입력해 주세요."); return; }
    rec.onresult = ev => {
      let fin = "", inter = "";
      for (let i = 0; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) fin += r[0].transcript + " "; else inter += r[0].transcript + " ";
      }
      heardFinal = fin.trim(); heardInterim = inter.trim();
      $("liveText").textContent = (heardFinal + " " + heardInterim).trim();
      clearTimeout(silenceTimer);
      silenceTimer = setTimeout(() => { try { rec && rec.stop(); } catch {} }, 2600);
    };
    rec.onerror = ev => {
      if (ev.error === "not-allowed" || ev.error === "service-not-allowed") {
        cancelListen = true;
        showError("마이크 사용이 허용되지 않았어요. 브라우저 설정에서 이 사이트의 마이크를 허용해 주세요. (아이폰은 설정 → Safari → 마이크, 그리고 설정 → Siri에서 받아쓰기가 켜져 있어야 해요.)");
      } else if (ev.error === "language-not-supported") {
        cancelListen = true; showError("이 언어의 음성 인식을 지원하지 않아요.");
      } else if (ev.error === "network") {
        cancelListen = true; showError("음성 인식에 인터넷 연결이 필요해요.");
      }
    };
    rec.onend = () => {
      clearTimeout(silenceTimer);
      listening = false; rec = null;
      const text = (heardFinal + " " + heardInterim).trim();
      if (cancelListen) { $("liveText").textContent = ""; setMic("idle"); return; }
      if (!text) { $("liveText").textContent = "잘 못 들었어요. 다시 눌러서 말해 주세요."; setMic("idle"); return; }
      $("liveText").textContent = "";
      if (settings.autoSend) studentSend(text);
      else { openTyping(text); setMic("idle"); }
    };
    try { rec.start(); listening = true; setMic("listening"); $("liveText").textContent = "듣고 있어요…"; }
    catch (e) { listening = false; setMic("idle"); }
  }
  function stopListening(cancel){
    if (!rec) return;
    cancelListen = !!cancel;
    try { rec.stop(); } catch {}
  }

  function setMic(state){
    const b = $("micBtn"), l = $("micLabel"), i = $("micIcon");
    b.classList.remove("listening", "speaking");
    b.disabled = false;
    if (!SR) { b.disabled = true; i.textContent = "🎤"; l.textContent = "음성 인식 미지원 · 키보드 사용"; return; }
    if (state === "listening") { b.classList.add("listening"); i.textContent = "■"; l.textContent = "듣는 중 · 누르면 보내기"; }
    else if (state === "speaking") { b.classList.add("speaking"); i.textContent = "🔊"; l.textContent = "말하는 중 · 누르면 끊고 말하기"; }
    else if (state === "thinking") { b.disabled = true; i.textContent = "…"; l.textContent = "생각하는 중"; }
    else { i.textContent = "🎤"; l.textContent = "눌러서 말하기"; }
  }

  $("micBtn").addEventListener("click", () => {
    unlockAudio();
    if (listening) { stopListening(false); return; }
    if (busy) return;
    startListening();
  });
  $("langBtn").addEventListener("click", () => {
    settings.recLang = settings.recLang === "en-US" ? "ko-KR" : "en-US"; saveSettings(); updateLangBtn();
  });
  function updateLangBtn(){
    const b = $("langBtn"); const ko = settings.recLang === "ko-KR";
    b.textContent = ko ? "한" : "EN"; b.classList.toggle("on", ko);
    b.title = ko ? "지금은 한국어로 알아들어요" : "지금은 영어로 알아들어요";
  }

  // =====================================================================
  // Home
  // =====================================================================
  function renderHome(){
    inChat = false;
    stopSpeaking(); stopListening(true);
    $("homeView").classList.remove("hidden");
    $("panelView").classList.add("hidden"); $("chatView").classList.remove("hidden");
    msgsEl.innerHTML = "";
    $("composer").classList.add("hidden");
    $("homeBtn").classList.add("hidden");
    setHeader(null);
    const known = mem.profile && mem.profile.name;
    $("homeTitle").textContent = known ? `안녕하세요, ${mem.profile.call_me || mem.profile.name}!` : "English Room";
    const box = $("people"); box.innerHTML = "";

    if (!settings.apiKey) {
      $("homeDesc").textContent = "말로 대화하며 영어를 배우는 나만의 교실이에요. 시작하기 전에 한 번만 설정해 주세요.";
      box.appendChild(setupCard());
    } else {
      $("homeDesc").textContent = !known
        ? "먼저 Mr. Bennett 선생님과 인사해요. 보스턴에서 30년 동안 영어를 가르쳤고, 서울에서 3년을 살아서 한국어도 알아들어요. 대화는 선생님이 이끌어요."
        : `지금까지 ${totalSessions()}번 대화했어요. 오늘은 누구랑 이야기할까요?`;
    }
    chars.forEach(c => {
      const b = el("button", "person");
      b.disabled = !settings.apiKey || (!c.builtin && !known);
      b.appendChild(avatar(c));
      const info = el("div", "info");
      info.appendChild(el("div", "nm", c.name));
      info.appendChild(el("div", "tl", c.tagline_ko || c.role_ko || ""));
      const es = storyOf(c).entries; const last = es[es.length - 1];
      info.appendChild(el("div", "last", last ? `마지막 대화 ${last.date} · ${last.title || ""}` : (c.builtin ? "아직 만나지 않았어요" : "아직 대화하지 않았어요")));
      b.appendChild(info);
      b.appendChild(el("div", "go", "대화하기 ›"));
      b.onclick = () => { unlockAudio(); openChar(c); };
      box.appendChild(b);
    });
    if (known && settings.apiKey) {
      const g = el("button", "person ghost", "👥 새로운 사람은 Mr. Bennett와 함께 만들어요");
      g.onclick = () => { unlockAudio(); openChar(TEACHER, "create"); };
      box.appendChild(g);
    }
  }

  function setupCard(){
    const c = el("div", "setup");
    c.appendChild(el("b", null, "Gemini API 키 넣기 (무료)"));
    const ol = el("ol");
    const li1 = el("li"); li1.append("구글 계정으로 ");
    const a = el("a", null, "aistudio.google.com/apikey"); a.href = "https://aistudio.google.com/apikey"; a.target = "_blank"; a.rel = "noopener";
    li1.append(a, " 를 열어요."); ol.appendChild(li1);
    ol.appendChild(el("li", null, "“Create API key”를 눌러 키를 만들고 복사해요."));
    ol.appendChild(el("li", null, "아래에 붙여 넣고 저장을 눌러요."));
    c.appendChild(ol);
    const inp = el("input"); inp.type = "password"; inp.placeholder = "AIza로 시작하는 키"; inp.autocomplete = "off";
    c.appendChild(inp);
    const msg = el("div", null, "키는 이 휴대폰에만 저장되고, 구글 Gemini에 요청할 때만 쓰여요."); msg.style.cssText = "font-size:12.5px;color:var(--muted);margin-bottom:10px";
    c.appendChild(msg);
    const b = el("button", "btn primary", "저장하고 시작하기");
    b.onclick = async () => {
      const key = inp.value.trim(); if (!key) return;
      b.disabled = true; b.textContent = "확인하는 중…";
      try {
        const names = await listModels(key);
        settings.apiKey = key; settings.model = pickDefaultModel(names); saveSettings();
        renderHome();
      } catch (e) {
        msg.textContent = e.code === "bad_key" || e.status === 400 ? "키가 맞지 않아요. 다시 확인해 주세요." : errorText(e);
        msg.style.color = "var(--rose)";
        b.disabled = false; b.textContent = "저장하고 시작하기";
      }
    };
    c.appendChild(b);
    return c;
  }

  function setHeader(c){
    const a = $("hAvatar");
    if (!c) { a.textContent = "EN"; a.style.background = "var(--green)"; $("hName").textContent = "English Room"; $("status").textContent = "대화할 사람을 골라 주세요"; document.title = "English Room"; return; }
    a.textContent = c.initials || c.name.slice(0,2).toUpperCase(); a.style.background = c.color || "var(--green)";
    $("hName").textContent = c.name; $("status").textContent = c.tagline_ko || c.role_ko || "";
    document.title = `${c.name} · English Room`;
  }

  async function openChar(c, startAction){
    if (busy) return;
    CHAR = c;
    setHeader(c);
    $("homeView").classList.add("hidden");
    $("homeBtn").classList.remove("hidden");
    $("aCreate").classList.toggle("hidden", !c.builtin);
    msgsEl.innerHTML = "";
    story = storyOf(c);
    const se = Store.get(sessionKey(c));
    session = se && Array.isArray(se.messages) ? se : { messages: [], startedAt: null };
    inChat = true;
    $("composer").classList.remove("hidden");
    renderHints([]);
    if (session.messages.length && session.startedAt !== today()) {
      setBusy(true); $("status").textContent = "지난 대화 정리 중…";
      const ok = await summarize(false);
      setBusy(false);
      if (!ok) { showError("지난 대화를 정리하지 못했어요.", () => openChar(c, startAction)); return; }
    }
    if (session.messages.length) {
      renderAll();
      if (startAction === "create") { studentSend("", "create"); return; }
      const last = session.messages[session.messages.length-1];
      teacherTurn(last.role === "student" ? null : "resume");
    } else {
      session = { messages: [], startedAt: today() };
      if (startAction === "create") { studentSend("", "create"); return; }
      const first = c.builtin ? !(mem.profile && mem.profile.name) : story.entries.length === 0;
      teacherTurn(first ? "begin_first" : "begin_regular");
    }
  }
  $("homeBtn").addEventListener("click", () => { if (!busy) renderHome(); });

  // =====================================================================
  // Prompt building
  // =====================================================================
  function memoryBlock(){
    const recent = story.entries.slice(-6).map(e => `- ${e.date}: ${e.title} — ${e.summary_ko}${e.follow_ups && e.follow_ups.length ? " (다음에: " + e.follow_ups.join("; ") + ")" : ""}`).join("\n");
    const others = chars.filter(c => c.id !== CHAR.id).map(c => `${c.name} (${c.role_ko || ""})`).join(", ");
    const m = { profile: mem.profile || "(nothing yet - first meeting)", english: mem.english || "(not assessed yet)" };
    return `MEMORY ABOUT THE STUDENT (shared by everyone the student practices with, JSON):\n${JSON.stringify(m)}\n\nYOUR RECENT SESSIONS WITH THE STUDENT (oldest first):\n${recent || "(none yet)"}\n\nOTHER PEOPLE THE STUDENT PRACTICES WITH: ${others || "(none yet)"} — total people: ${chars.length}.\nToday is ${today()}. Your past sessions together: ${story.entries.length}. Student's total past sessions with everyone: ${totalSessions()}.`;
  }
  const teacherJSON = m => JSON.stringify({ say: m.text, say_ko: m.ko || "", correction: m.correction || null, praise: m.praise || null, note_ko: m.note || null, hints: m.hints || [] });

  function buildConversation(action){
    const A = actionsFor(CHAR);
    const system = `${CHAR.persona}\n\nYOUR ROLE IN THE STUDENT'S ENGLISH LEARNING: ${CHAR.teach_style || ""}\n\n${BASE_RULES}\n\n${CHAR.builtin ? CREATE_RULES + "\n\n" : ""}${outputSpec(CHAR)}\n\n${memoryBlock()}`;
    const msgs = session.messages.slice(-40);
    const out = [];
    const push = (role, content) => {
      if (!content) return;
      if (out.length && out[out.length-1].role === role) out[out.length-1].content += "\n\n" + content;
      else out.push({ role, content });
    };
    push("user", msgs.length ? "[The session so far follows.]" : (A[action] || A.begin_regular));
    for (const m of msgs) {
      if (m.role === "teacher") push("assistant", teacherJSON(m));
      else if (m.role === "system") push("user", `[Note: ${m.text}]`);
      else push("user", m.meta ? (A[m.meta] || "") : `Student: ${m.text}`);
    }
    if (msgs.length && action && A[action] && msgs[msgs.length-1].meta !== action) push("user", A[action]);
    if (out[out.length-1].role !== "user") push("user", "[Continue.]");
    return { system, messages: out };
  }

  function parseJSON(text){
    let t = (text || "").trim().replace(/^```(?:json)?/i, "").replace(/```$/,"").trim();
    const a = t.indexOf("{"), b = t.lastIndexOf("}");
    if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b+1)); } catch {} }
    return null;
  }

  // =====================================================================
  // Turns
  // =====================================================================
  async function teacherTurn(action){
    if (busy) return;
    const who = CHAR;
    setBusy(true);
    const typing = el("div", "row t");
    typing.innerHTML = '<div class="bubble typing"><i></i><i></i><i></i></div>';
    msgsEl.appendChild(typing); scrollDown();
    let bubble = null, m = null;
    try {
      const { system, messages } = buildConversation(action);
      const raw = await llm(system, messages);
      if (CHAR !== who || !inChat) return;
      const o = parseJSON(raw) || { say: raw };
      if (typeof o.say !== "string") o.say = String(o.say || raw);
      m = {
        role: "teacher", text: o.say, ko: o.say_ko || "",
        correction: o.correction && o.correction.better ? o.correction : null,
        praise: o.praise || null, note: o.note_ko || null,
        hints: Array.isArray(o.hints) ? o.hints.slice(0,3) : [], ts: Date.now()
      };
      session.messages.push(m);
      typing.remove();
      bubble = renderMsg(m);
      renderHints(m.hints);
      if (who.builtin && o.new_character && o.new_character.name && o.new_character.persona) {
        const nc = addCharacter(o.new_character);
        session.messages.push({ role: "system", text: `${nc.name} was created and saved. The student can now talk to ${nc.name} from the people list.`, charId: nc.id, ts: Date.now() });
        renderNewChar(nc);
      }
      Store.set(sessionKey(who), session);
    } catch (e) {
      typing.remove();
      showError(errorText(e), e && e.code !== "no_key" && e.code !== "bad_key" ? () => teacherTurn(action) : null);
    } finally {
      setBusy(false);
    }
    if (m && settings.autoSpeak && CHAR === who && inChat) {
      const finished = await speak(m.text, bubble);
      if (finished && settings.handsFree && inChat && CHAR === who && !busy) startListening();
    }
  }

  function addCharacter(nc){
    const used = new Set(chars.map(c => c.color));
    const c = {
      id: "c" + Date.now().toString(36),
      name: String(nc.name).slice(0, 30),
      initials: String(nc.initials || nc.name).replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase() || "??",
      gender: nc.gender === "female" ? "female" : "male",
      role_ko: String(nc.role_ko || "").slice(0, 30),
      tagline_ko: String(nc.tagline_ko || "").slice(0, 60),
      color: COLORS.find(x => !used.has(x)) || COLORS[chars.length % COLORS.length],
      persona: String(nc.persona).slice(0, 4000),
      teach_style: String(nc.teach_style || "Help the student with English naturally, correcting gently now and then.").slice(0, 1000),
      createdAt: today()
    };
    chars.push(c);
    Store.set("characters", { list: chars.filter(x => !x.builtin) });
    return c;
  }

  function renderNewChar(c){
    const box = el("div", "newchar");
    box.appendChild(el("h3", null, "🎉 새로운 사람이 생겼어요"));
    const p = el("div", "person");
    p.appendChild(avatar(c));
    const info = el("div", "info");
    info.appendChild(el("div", "nm", c.name));
    info.appendChild(el("div", "tl", c.tagline_ko || c.role_ko));
    p.appendChild(info);
    box.appendChild(p);
    const b = el("button", "btn primary", `${c.name}와 대화하기`);
    b.onclick = () => { if (busy) return; stopSpeaking(); stopListening(true); openChar(c); };
    box.appendChild(b);
    const n = el("div", null, "선생님과의 대화는 그대로 저장돼 있어요. ‹ 버튼으로 언제든 돌아올 수 있어요.");
    n.style.cssText = "font-size:12.5px;color:var(--muted);margin-top:8px";
    box.appendChild(n);
    msgsEl.appendChild(box); scrollDown();
  }

  function studentSend(text, meta){
    if (busy) return;
    text = (text || "").trim();
    if (!text && !meta) return;
    stopSpeaking();
    const labels = { topic: "다른 주제로 바꿔 주세요", practice: "연습하고 싶어요", easier: "조금 더 쉽게 말해 주세요", create: "새로운 사람을 만들고 싶어요" };
    const m = meta ? { role: "student", meta, text: labels[meta], ts: Date.now() } : { role: "student", text, ts: Date.now() };
    session.messages.push(m);
    if (!session.startedAt) session.startedAt = today();
    renderMsg(m);
    renderHints([]);
    Store.set(sessionKey(), session);
    teacherTurn(meta || null);
  }

  // =====================================================================
  // End of session → memory
  // =====================================================================
  async function summarize(showCard){
    const who = CHAR;
    const studentLines = session.messages.filter(m => m.role === "student" && !m.meta).length;
    if (studentLines < 2) {
      session = { messages: [], startedAt: null };
      Store.set(sessionKey(who), session);
      return true;
    }
    const transcript = session.messages.map(m => {
      if (m.role === "teacher") return `${who.name}: ${m.text}${m.correction ? `  [correction: "${m.correction.you_said}" -> "${m.correction.better}"]` : ""}`;
      if (m.role === "system") return `(${m.text})`;
      return m.meta ? `(student pressed: ${m.text})` : `Student: ${m.text}`;
    }).join("\n");
    const input = `CHARACTER IN THIS SESSION: ${who.name} — ${who.role_ko || ""}\n\nCURRENT MEMORY:\n${JSON.stringify({ profile: mem.profile, english: mem.english })}\n\nRECENT SESSION TITLES WITH THIS CHARACTER: ${story.entries.slice(-5).map(e=>e.title).join(" / ") || "(none)"}\n\nSESSION DATE: ${session.startedAt || today()}\n\nTRANSCRIPT:\n${transcript}`;
    try {
      const o = parseJSON(await llm(SUMMARY_RULES, [{ role: "user", content: input }]));
      if (!o) throw new Error("bad summary");
      if (o.profile) { mem.profile = o.profile; Store.set("profile", mem.profile); }
      if (o.english) { mem.english = o.english; Store.set("english", mem.english); }
      const entry = Object.assign({ date: session.startedAt || today(), title: "", summary_ko: "", follow_ups: [] }, o.story_entry || {});
      story.entries.push(entry);
      if (story.entries.length > 300) story.entries = story.entries.slice(-300);
      Store.set(storyKey(who), story);
      session = { messages: [], startedAt: null };
      Store.set(sessionKey(who), session);
      if (showCard) showSummary(entry);
      return true;
    } catch (e) {
      console.warn(e);
      if (showCard) showError("대화 기록을 정리하지 못했어요. " + errorText(e), null);
      return false;
    }
  }

  function showSummary(entry){
    msgsEl.innerHTML = "";
    $("composer").classList.add("hidden");
    const c = el("div", "summary");
    c.appendChild(el("h3", null, `📓 ${CHAR.name}와의 기록 · ${entry.date}`));
    const t = el("div", null, entry.title); t.style.fontWeight = "500"; c.appendChild(t);
    const p = el("p", null, entry.summary_ko); p.style.cssText = "font-size:14px;line-height:1.6;margin:6px 0"; c.appendChild(p);
    if (mem.english && mem.english.level) {
      const l = el("p", null, `현재 수준: ${mem.english.level} — ${mem.english.level_note_ko || ""}`); l.style.cssText = "font-size:14px;margin:6px 0"; c.appendChild(l);
    }
    if (entry.follow_ups && entry.follow_ups.length) {
      const s = el("div", null, "다음에 이어갈 이야기"); s.style.cssText = "font-size:13px;color:var(--muted);margin-top:8px"; c.appendChild(s);
      const ul = el("ul"); entry.follow_ups.forEach(f => ul.appendChild(el("li", null, f))); c.appendChild(ul);
    }
    const row = el("div"); row.style.cssText = "display:flex;gap:8px;margin-top:14px;flex-wrap:wrap";
    const b1 = el("button", "btn primary", "다시 대화하기");
    b1.onclick = () => { msgsEl.innerHTML = ""; $("composer").classList.remove("hidden"); session = { messages: [], startedAt: today() }; teacherTurn("begin_regular"); };
    const b2 = el("button", "btn ghost", "다른 사람과 대화하기");
    b2.onclick = () => renderHome();
    row.append(b1, b2); c.appendChild(row);
    msgsEl.appendChild(c);
    scrollDown();
  }

  // =====================================================================
  // Rendering
  // =====================================================================
  function renderAll(){
    msgsEl.innerHTML = "";
    session.messages.forEach(m => renderMsg(m));
    const last = session.messages[session.messages.length-1];
    renderHints(last && last.role === "teacher" ? last.hints : []);
  }

  function renderMsg(m){
    if (m.role === "system") { const c = chars.find(x => x.id === m.charId); if (c) renderNewChar(c); return null; }
    if (m.role === "student") {
      if (m.meta) { const d = el("div", "meta-chip"); d.appendChild(el("span", null, m.text)); msgsEl.appendChild(d); }
      else { const r = el("div", "row me"); r.appendChild(el("div", "bubble", m.text)); msgsEl.appendChild(r); }
      scrollDown(); return null;
    }
    if (m.correction) {
      const f = el("div", "fix");
      f.appendChild(el("div", "lbl", "✏️ 이렇게 말하면 더 자연스러워요"));
      const a = el("div"); a.appendChild(el("s", null, m.correction.you_said || "")); f.appendChild(a);
      const bb = el("div"); bb.appendChild(el("b", null, "→ " + m.correction.better)); f.appendChild(bb);
      if (m.correction.why_ko) { const w = el("div", null, m.correction.why_ko); w.style.cssText = "color:var(--muted);font-size:13px;margin-top:3px"; f.appendChild(w); }
      const say = el("button", null, "🔊"); say.style.cssText = "border:0;background:transparent;cursor:pointer;font-size:14px;padding:2px 0 0";
      say.onclick = () => { unlockAudio(); speak(m.correction.better); };
      f.appendChild(say);
      msgsEl.appendChild(f);
    }
    const r = el("div", "row t");
    const b = el("div", "bubble");
    b.appendChild(el("div", null, m.text));
    if (m.praise) b.appendChild(el("div", "praise", "👏 " + m.praise));
    if (m.note) b.appendChild(el("div", "note", m.note));
    const ko = el("div", "ko hidden", m.ko || "(해석이 없어요)"); b.appendChild(ko);
    const tools = el("div", "tools");
    const sp = el("button", null, "🔊 다시 듣기"); sp.onclick = () => { unlockAudio(); stopListening(true); speak(m.text, b); };
    const tr = el("button", null, "해석 보기");
    tr.onclick = () => { ko.classList.toggle("hidden"); tr.classList.toggle("on"); tr.textContent = ko.classList.contains("hidden") ? "해석 보기" : "해석 숨기기"; };
    tools.append(sp, tr); b.appendChild(tools);
    r.appendChild(b); msgsEl.appendChild(r);
    scrollDown();
    return b;
  }

  function renderHints(h){
    const box = $("hints"); box.innerHTML = "";
    (h || []).forEach(x => {
      const b = el("button", null, "💬 " + x); b.title = x;
      b.onclick = () => { unlockAudio(); speak(x); };
      box.appendChild(b);
    });
  }

  function showError(msg, retry){
    const d = el("div", "err", msg);
    if (retry) { const b = el("button", "btn ghost", "다시 시도"); b.style.padding = "4px 10px"; b.onclick = () => { d.remove(); retry(); }; d.appendChild(b); }
    msgsEl.appendChild(d); scrollDown();
  }

  function setBusy(v){
    busy = v;
    $("sendBtn").disabled = v;
    document.querySelectorAll("#actions button").forEach(b => b.disabled = v);
    $("status").textContent = v ? "생각하는 중…" : (CHAR.tagline_ko || CHAR.role_ko || "");
    setMic(v ? "thinking" : "idle");
  }
  function scrollDown(){ const v = $("chatView"); requestAnimationFrame(() => v.scrollTop = v.scrollHeight); }

  // =====================================================================
  // Typing (secondary)
  // =====================================================================
  const input = $("input");
  function autosize(){ input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 130) + "px"; }
  function openTyping(prefill){
    $("typeRow").classList.remove("hidden"); $("kbBtn").classList.add("on");
    if (prefill != null) { input.value = prefill; autosize(); }
    input.focus();
  }
  $("kbBtn").addEventListener("click", () => {
    const hidden = $("typeRow").classList.toggle("hidden");
    $("kbBtn").classList.toggle("on", !hidden);
    if (!hidden) input.focus();
  });
  input.addEventListener("input", autosize);
  input.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing && window.matchMedia("(pointer:fine)").matches) { e.preventDefault(); sendTyped(); }
  });
  function sendTyped(){ unlockAudio(); const v = input.value; input.value = ""; autosize(); studentSend(v); }
  $("sendBtn").addEventListener("click", sendTyped);

  document.querySelectorAll("#actions button").forEach(b => b.addEventListener("click", async () => {
    unlockAudio();
    const a = b.dataset.a;
    if (a !== "end") { stopListening(true); studentSend("", a); return; }
    if (busy) return;
    if (session.messages.filter(m => m.role === "student" && !m.meta).length < 2) { showError("조금 더 대화한 뒤에 마칠 수 있어요.", null); return; }
    stopSpeaking(); stopListening(true);
    setBusy(true); $("status").textContent = "오늘 대화 정리 중…";
    await summarize(true);
    setBusy(false);
  }));

  // =====================================================================
  // Panel: records + settings
  // =====================================================================
  $("gearBtn").addEventListener("click", () => {
    const open = $("panelView").classList.contains("hidden");
    if (open) { stopListening(true); renderPanel(); $("panelView").classList.remove("hidden"); $("chatView").classList.add("hidden"); $("composer").classList.add("hidden"); $("gearBtn").textContent = "✕"; }
    else closePanel();
  });
  function closePanel(){
    $("panelView").classList.add("hidden"); $("chatView").classList.remove("hidden"); $("gearBtn").textContent = "☰";
    if (inChat && session.startedAt) $("composer").classList.remove("hidden");
    if (!inChat) renderHome();
  }

  function renderPanel(){
    const v = $("panelView"); v.innerHTML = "";
    const E = mem.english, PR = mem.profile;

    // ---- settings
    v.appendChild(el("h3", null, "설정"));
    const s = el("div", "card settings");
    const row = (label, control, sub) => { const l = el("label"); l.appendChild(el("span", null, label)); l.appendChild(control); s.appendChild(l); if (sub) s.appendChild(el("div", "sub", sub)); };
    const chk = (key, after) => { const c = document.createElement("input"); c.type = "checkbox"; c.checked = !!settings[key]; c.onchange = () => { settings[key] = c.checked; saveSettings(); after && after(); }; return c; };

    row("대답 끝나면 소리로 읽어 주기", chk("autoSpeak"));
    row("말 끝나면 자동으로 보내기", chk("autoSend"), "끄면 인식된 문장을 확인하고 고친 뒤 보낼 수 있어요.");
    row("핸즈프리 (읽어 준 뒤 바로 듣기)", chk("handsFree"), "상대방 말이 끝나면 마이크가 자동으로 켜져요. 아이폰에서는 안 될 수 있어요.");
    const rl = el("span", null, `말하기 속도 ${settings.rate.toFixed(2)}`);
    const rg = document.createElement("input"); rg.type = "range"; rg.min = "0.6"; rg.max = "1.3"; rg.step = "0.05"; rg.value = settings.rate;
    rg.oninput = () => { settings.rate = parseFloat(rg.value); rl.textContent = `말하기 속도 ${settings.rate.toFixed(2)}`; saveSettings(); };
    const l2 = el("label"); l2.append(rl, rg); s.appendChild(l2);

    // voices per character
    loadVoices();
    if (allVoices.length) {
      chars.forEach(c => {
        const sel = document.createElement("select");
        const auto = el("option", null, "자동"); auto.value = ""; sel.appendChild(auto);
        allVoices.forEach(vo => { const o = el("option", null, `${vo.name} (${vo.lang})`); o.value = vo.voiceURI; sel.appendChild(o); });
        sel.value = settings.voices[c.id] || "";
        sel.onchange = () => { if (sel.value) settings.voices[c.id] = sel.value; else delete settings.voices[c.id]; saveSettings(); const prev = CHAR; CHAR = c; speak("Hi, this is how I sound."); CHAR = prev; };
        row(`${c.name} 목소리`, sel);
      });
    } else s.appendChild(el("div", "sub", "이 브라우저에서 영어 음성을 찾지 못했어요."));

    // api key + model
    const key = document.createElement("input"); key.type = "password"; key.value = settings.apiKey; key.placeholder = "Gemini API 키";
    key.onchange = () => { settings.apiKey = key.value.trim(); settings.model = ""; saveSettings(); refreshModels(); };
    row("API 키", key);
    const msel = document.createElement("select");
    const fillModels = names => {
      msel.innerHTML = "";
      const list = names && names.length ? names : (settings.model ? [settings.model] : []);
      list.forEach(n => { const o = el("option", null, n); o.value = n; msel.appendChild(o); });
      if (settings.model && !list.includes(settings.model)) { const o = el("option", null, settings.model); o.value = settings.model; msel.prepend(o); }
      msel.value = settings.model;
    };
    msel.onchange = () => { settings.model = msel.value; saveSettings(); };
    row("모델", msel, "flash 계열은 무료 사용량 안에서 쓸 수 있어요. 한도에 자주 걸리면 flash-lite를 골라 보세요.");
    async function refreshModels(){
      fillModels(null);
      if (!settings.apiKey) return;
      try { const names = await listModels(settings.apiKey); if (!settings.model) { settings.model = pickDefaultModel(names); saveSettings(); } fillModels(names.sort()); } catch {}
    }
    refreshModels();
    v.appendChild(s);

    // ---- records
    v.appendChild(el("h3", null, "나의 영어 실력"));
    const c1 = el("div", "card");
    if (E && E.level) {
      c1.appendChild(el("div", "lvl", E.level));
      c1.appendChild(el("div", null, E.level_note_ko || ""));
      if (E.strengths && E.strengths.length) { c1.appendChild(el("div", "date", "잘하는 점")); const u = el("ul"); E.strengths.forEach(x => u.appendChild(el("li", null, x))); c1.appendChild(u); }
    } else c1.appendChild(el("div", "empty", "첫 수업을 마치면 선생님이 수준을 정리해 줘요."));
    v.appendChild(c1);
    if (E && E.patterns && E.patterns.length) {
      v.appendChild(el("h3", null, "자주 틀리는 패턴"));
      E.patterns.forEach(p => { const c = el("div", "card"); c.appendChild(el("div", null, `${p.issue_ko}${p.count ? ` (${p.count}회)` : ""}`)); if (p.example) c.appendChild(el("div", "date", p.example)); v.appendChild(c); });
    }
    if (E && E.learned && E.learned.length) {
      v.appendChild(el("h3", null, "새로 배운 표현"));
      const c = el("div", "card"); const u = el("ul"); E.learned.slice().reverse().forEach(x => u.appendChild(el("li", null, x))); c.appendChild(u); v.appendChild(c);
    }
    if (E && E.korean_fallbacks && E.korean_fallbacks.length) {
      v.appendChild(el("h3", null, "아직 영어로 말하기 어려웠던 말"));
      const c = el("div", "card"); const u = el("ul"); E.korean_fallbacks.forEach(x => u.appendChild(el("li", null, x))); c.appendChild(u); v.appendChild(c);
    }
    v.appendChild(el("h3", null, "모두가 아는 나"));
    const c2 = el("div", "card");
    if (PR && (PR.name || (PR.facts && PR.facts.length))) {
      if (PR.name) c2.appendChild(el("div", null, `이름: ${PR.name}${PR.call_me && PR.call_me !== PR.name ? ` (부르는 이름: ${PR.call_me})` : ""}`));
      (PR.facts || []).forEach(f => c2.appendChild(el("span", "tag", f)));
    } else c2.appendChild(el("div", "empty", "아직 기록이 없어요."));
    v.appendChild(c2);

    v.appendChild(el("h3", null, "우리의 이야기"));
    let any = false;
    chars.forEach(c => {
      const es = (c.id === CHAR.id && inChat ? story : storyOf(c)).entries;
      if (!es.length) return;
      any = true;
      const hd = el("div"); hd.style.cssText = "display:flex;align-items:center;gap:8px;margin:12px 0 6px";
      const av = avatar(c); av.style.cssText += ";width:28px;height:28px;font-size:12px"; hd.append(av, el("b", null, c.name));
      v.appendChild(hd);
      es.slice().reverse().forEach(e => {
        const card = el("div", "card");
        card.appendChild(el("div", "date", e.date));
        const t = el("div", null, e.title); t.style.fontWeight = "500"; card.appendChild(t);
        card.appendChild(el("div", null, e.summary_ko));
        if (e.follow_ups && e.follow_ups.length) card.appendChild(el("div", "date", "다음에: " + e.follow_ups.join(" · ")));
        v.appendChild(card);
      });
    });
    if (!any) v.appendChild(el("div", "card empty", "대화를 마칠 때마다 여기에 일기처럼 쌓여요."));

    // ---- backup
    v.appendChild(el("h3", null, "백업"));
    const bk = el("div", "card settings");
    bk.appendChild(el("div", "sub", "기록은 이 휴대폰의 브라우저에만 저장돼요. 브라우저 데이터를 지우면 사라지니 가끔 백업 파일을 저장해 두세요. 다른 기기로 옮길 때도 써요."));
    const ex = el("button", "btn ghost", "백업 파일 저장하기");
    ex.onclick = () => {
      const data = { app: "english-room", version: 1, exportedAt: new Date().toISOString(), items: {} };
      Store.keys().filter(k => k !== "settings").forEach(k => data.items[k] = Store.get(k));
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `english-room-backup-${today()}.json`;
      document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    };
    const im = el("button", "btn ghost", "백업 파일 불러오기");
    const file = document.createElement("input"); file.type = "file"; file.accept = "application/json,.json"; file.style.display = "none";
    im.onclick = () => file.click();
    file.onchange = async () => {
      const f = file.files && file.files[0]; if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        if (!data || data.app !== "english-room" || !data.items) throw new Error("bad");
        Object.entries(data.items).forEach(([k, val]) => Store.set(k, val));
        location.reload();
      } catch { im.textContent = "이 파일은 불러올 수 없어요"; }
    };
    bk.append(ex, im, file);
    v.appendChild(bk);

    const close = el("button", "btn primary", "닫기"); close.style.cssText = "width:100%;margin:16px 0 24px"; close.onclick = closePanel;
    v.appendChild(close);
  }

  // =====================================================================
  // Boot
  // =====================================================================
  updateLangBtn();
  setMic("idle");
  if (!SR) { $("typeRow").classList.remove("hidden"); $("kbBtn").classList.add("hidden"); $("langBtn").classList.add("hidden"); }
  if (!synth) settings.autoSpeak = false;
  renderHome();
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
})();
