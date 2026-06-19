// ClusterPrep — single-page app (DECA Marketing Cluster Exam practice).
// - Username-based profiles (no password). Data scoped per user in localStorage.
// - All Tests → click card → take quiz → answers + explanations
// - My Stats → topic breakdown of wrong answers, most-missed topic, paste
//   extra codes you got wrong on paper tests.

const app = document.getElementById("app");

const state = {
  index: [],
  currentExam: null,          // loaded exam JSON
  currentSlug: null,
  selections: {},             // { [qNumber]: "A"|"B"|"C"|"D" }
  revealed: {},               // { [qNumber]: true } per-question reveal
  revealAll: false,
  user: null,                 // current username (or null)
  exams: {},                  // cache of loaded exam JSONs, keyed by slug
  cluster: "marketing",       // active DECA cluster (marketing | bma)
  crossCluster: false,        // Same-code practice: pull same-PI-code Qs from other clusters too
};

// Performance-indicator code prefix → topic name (matches DECA blueprint).
const TOPICS = {
  BL: "Business Law",
  CM: "Channel Management",
  CO: "Communications",
  CR: "Customer Relations",
  EC: "Economics",
  EI: "Emotional Intelligence",
  EN: "Entrepreneurship",
  FI: "Financial Analysis",
  FM: "Financial-Information Management",
  HR: "Human Resources Management",
  IM: "Marketing-Information Management",
  KM: "Knowledge Management",
  MP: "Market Planning",
  MK: "Marketing",
  NF: "Information Management",
  OP: "Operations",
  PI: "Pricing",
  PJ: "Project Management",
  PM: "Product/Service Management",
  PD: "Professional Development",
  PR: "Promotion",
  QM: "Quality Management",
  RM: "Risk Management",
  SE: "Selling",
  SM: "Strategic Management",
};

// ICDC weighting from the Marketing Cluster blueprint (IMCE column).
const ICDC_WEIGHT = {
  BL: 1, CM: 7, CO: 3, CR: 1, EC: 4, EI: 6, EN: 0, FI: 4, HR: 0,
  IM: 16, MP: 5, MK: 1, NF: 3, OP: 4, PI: 4, PM: 15, PD: 5, PR: 13,
  SE: 8, SM: 0,
};

// ---------- Routing ----------
function parseHash() {
  const h = (location.hash || "").replace(/^#\/?/, "");
  if (!h) return { route: "home" };
  const parts = h.split("/");
  return { route: parts[0], slug: parts[1], qnum: parts[2] ? Number(parts[2]) : null, extra: parts.slice(3) };
}

window.addEventListener("hashchange", render);
window.addEventListener("DOMContentLoaded", init);

// ---------- Boot ----------
// Invite-only password gate. Client-side only (not real security) — it just
// stops casual visitors. Set to true to re-enable the private-beta wall;
// false makes the whole app publicly accessible without a password.
const ACCESS_GATE_ENABLED = false;
// The access password is never stored in source as plaintext — only its
// SHA-256 hash lives here. The gate is still client-side (not real security),
// but viewing source no longer hands a casual visitor the password.
const ACCESS_PASSWORD_HASH = "3ca46f74f4c9856ae716cbe84dfb74739d2348797a30ee3c0b815a96fa627047";
async function sha256Hex(str) {
  const data = new TextEncoder().encode(str);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}
function accessGranted() {
  return localStorage.getItem("deca-access-granted") === ACCESS_PASSWORD_HASH;
}
function showAccessGate() {
  const root = document.createElement("div");
  root.id = "access-gate";
  root.style.cssText = "position:fixed;inset:0;z-index:9999;background:#0a0714;display:flex;align-items:center;justify-content:center;padding:24px;font-family:system-ui,sans-serif;color:#f5f3ff";
  root.innerHTML = `
    <form id="gate-form" style="max-width:360px;width:100%;background:#15102a;border:1px solid #2a2347;border-radius:12px;padding:24px">
      <h2 style="margin:0 0 6px;font-size:1.15rem">Private beta</h2>
      <p style="margin:0 0 16px;color:#a8a2c2;font-size:.88rem">Enter the access password to continue.</p>
      <input id="gate-pw" type="password" autocomplete="current-password" placeholder="Password"
        style="width:100%;padding:10px 12px;background:#0a0714;border:1px solid #3a2f5f;border-radius:8px;color:#fff;font-size:1rem;margin-bottom:10px;box-sizing:border-box" />
      <button type="submit" style="width:100%;padding:10px 12px;background:#7c3aed;color:#fff;border:0;border-radius:8px;font-weight:700;cursor:pointer">Enter</button>
      <div id="gate-err" style="color:#f87171;font-size:.82rem;margin-top:10px;min-height:1em"></div>
    </form>
  `;
  document.body.appendChild(root);
  const form = root.querySelector("#gate-form");
  const input = root.querySelector("#gate-pw");
  const err = root.querySelector("#gate-err");
  input.focus();
  form.addEventListener("submit", async e => {
    e.preventDefault();
    if (await sha256Hex(input.value) === ACCESS_PASSWORD_HASH) {
      localStorage.setItem("deca-access-granted", ACCESS_PASSWORD_HASH);
      root.remove();
      init(); // boot the app now that we're authed
    } else {
      err.textContent = "Wrong password.";
      input.select();
    }
  });
}

async function init() {
  if (ACCESS_GATE_ENABLED && !accessGranted()) {
    // Allow ?pw=… in URL as a shortcut (tester can bookmark a link with the pw)
    const qs = new URLSearchParams(location.search);
    if (await sha256Hex(qs.get("pw") || "") === ACCESS_PASSWORD_HASH) {
      localStorage.setItem("deca-access-granted", ACCESS_PASSWORD_HASH);
    } else {
      return showAccessGate();
    }
  }
  wireChrome();
  state.cluster = localStorage.getItem("deca-imce:cluster") || "marketing";
  if (!CLUSTERS[state.cluster]) state.cluster = "marketing";
  state.crossCluster = localStorage.getItem("deca-imce:crossCluster") === "1";
  await applyResetEpochIfChanged();
  // Hydrate current user from localStorage.
  state.user = localStorage.getItem("deca-imce:current-user") || null;
  refreshAuthUI();
  // Discover cloud profiles so Switch-user shows them even on a fresh browser.
  syncMergeKnownUsers();
  if (state.user) {
    // Pull server profile FIRST — if this device is behind another device's state,
    // we want to hydrate localStorage before seeding/migrating runs.
    await syncProfilePull(state.user);
    cleanupAutoImportedRohitCodes(state.user);
    migrateSeededProgressToLogTest(state.user);
    await maybeImportSeed(state.user);
    // Push whatever we just ended up with so the server has the latest snapshot.
    syncProfilePushDebounced(state.user, 500);
  }

  try {
    const res = await fetch(activeCluster().indexUrl, { cache: "no-store" });
    if (!res.ok) throw new Error("Could not load index.json");
    state.index = await res.json();
    restoreMockIfPresent();
  } catch (err) {
    app.innerHTML = `<div class="empty">
      <h2>Couldn't load the exams</h2>
      <p>${escapeHtml(err.message)}</p>
      <p>Please check your connection and refresh the page.</p>
    </div>`;
    return;
  }
  refreshClusterUI();
  render();
}

function wireChrome() {
  document.getElementById("nav-home").addEventListener("click", () => { location.hash = "#/"; });
  document.getElementById("nav-stats").addEventListener("click", () => { location.hash = "#/stats"; });
  document.getElementById("nav-study").addEventListener("click", () => { location.hash = "#/study"; });
  const lbBtn = document.getElementById("nav-leaderboard");
  if (lbBtn) lbBtn.addEventListener("click", () => { location.hash = "#/leaderboard"; });
  const qbBtn = document.getElementById("nav-qbank");
  if (qbBtn) qbBtn.addEventListener("click", () => { location.hash = "#/qbank"; });
  document.getElementById("login-btn").addEventListener("click", openLoginModal);

  // Modal close + submit.
  document.querySelectorAll("#login-modal [data-close]").forEach(el => {
    el.addEventListener("click", closeLoginModal);
  });
  document.getElementById("login-form").addEventListener("submit", e => {
    e.preventDefault();
    const name = document.getElementById("login-input").value.trim();
    const pass = document.getElementById("login-pass").value;
    if (!name) return;
    if (loginMode === "signup") {
      const pass2 = document.getElementById("login-pass2").value;
      if (pass.length < 4) { setLoginMsg("Password must be at least 4 characters.", "err"); return; }
      if (pass !== pass2) { setLoginMsg("Passwords don't match.", "err"); return; }
    }
    loginAs(name, pass, loginMode);
  });
  document.getElementById("login-toggle").addEventListener("click", () => {
    setLoginMode(loginMode === "signup" ? "login" : "signup");
    document.getElementById("login-input").focus();
  });
  document.getElementById("login-forgot").addEventListener("click", () => {
    const el = document.getElementById("login-msg");
    el.className = "login-msg";
    el.innerHTML = 'Forgot your password? Email the admin to reset it: ' +
      '<a href="mailto:clusterprep@gmail.com">clusterprep@gmail.com</a>';
  });
}

// ---------- Render dispatcher ----------
async function render() {
  const { route, slug, qnum } = parseHash();
  updateActiveNav(route);
  refreshStreakUI();
  if (route === "exam" && slug) {
    await renderExam(slug, qnum);
  } else if (route === "stats") {
    await renderStats();
  } else if (route === "study") {
    await renderStudy(slug /* topic prefix */, qnum /* not used */);
  } else if (route === "welcome") {
    renderWelcome();
    return;
  } else if (route === "countdown") {
    renderCountdown();
  } else if (route === "leaderboard") {
    await renderLeaderboardPage();
  } else if (route === "qbank") {
    await renderQuestionBank();
  } else {
    // Welcome page is no longer auto-shown. The React landing at :5173 is the
    // canonical intro; arriving at the vanilla app means the user already
    // clicked "Start studying" and wants the test list.
    renderHome();
  }
  // Any non-welcome route: make sure the welcome-active body class is off.
  document.body.classList.remove("welcome-active");
}

function updateActiveNav(route) {
  document.querySelectorAll("#nav .nav-btn[data-route]").forEach(b => {
    b.classList.toggle("active", b.getAttribute("data-route") === route ||
      (route === "exam" && b.getAttribute("data-route") === "home"));
  });
}

// ================================================================
//                       PROFILE / AUTH
// ================================================================

// Login modal mode: "login" (default) or "signup" (create account).
let loginMode = "login";

function setLoginMode(mode) {
  loginMode = mode;
  const isSignup = mode === "signup";
  document.getElementById("login-title").textContent = isSignup ? "Create an account" : "Log in";
  document.getElementById("login-sub").textContent = isSignup
    ? "Pick a username and password. This works on any device you log in from."
    : "Enter your username and password.";
  document.getElementById("login-go").textContent = isSignup ? "Create account" : "Log in";
  document.getElementById("login-toggle").textContent = isSignup
    ? "Already have an account? Log in"
    : "New here? Create an account";
  // Confirm-password field + forgot link only make sense in their mode.
  document.getElementById("login-pass2").classList.toggle("hidden", !isSignup);
  document.getElementById("login-pass").setAttribute("autocomplete", isSignup ? "new-password" : "current-password");
  document.getElementById("login-forgot").classList.toggle("hidden", isSignup);
  setLoginMsg("", "");
}

function openLoginModal() {
  const modal = document.getElementById("login-modal");
  modal.classList.remove("hidden");
  document.getElementById("login-input").value = "";
  document.getElementById("login-pass").value = "";
  document.getElementById("login-pass2").value = "";
  setLoginMode("login");
  document.getElementById("login-input").focus();
}

function setLoginMsg(text, kind) {
  const el = document.getElementById("login-msg");
  if (!el) return;
  el.textContent = text || "";
  el.className = "login-msg" + (kind ? " " + kind : "");
}

function closeLoginModal() {
  document.getElementById("login-modal").classList.add("hidden");
}

// ---- Credentials (client-side password gate) ----
// This is a static client app, so the gate stops casual "type a name and
// you're in" access — it is not cryptographically bulletproof. Passwords are
// stored as a salted SHA-256 hash under the user-scoped `:auth` key, which
// rides the existing cloud sync to every device automatically.
//
// NOTE: there are intentionally NO plaintext default passwords in this code.
// (Shipping known passwords for seeded accounts would let anyone log in as
// them.) Accounts are reachable only via their stored salted-hash credential;
// an account with no stored credential must be (re-)created via sign-up.

function authKey(user) { return `deca-imce:user:${user}:auth`; }

function randomSaltHex() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a, b => b.toString(16).padStart(2, "0")).join("");
}

async function hashPassword(salt, password) {
  const data = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}

async function makeCredential(password) {
  const salt = randomSaltHex();
  return { v: 1, salt, hash: await hashPassword(salt, password) };
}

async function verifyCredential(cred, password) {
  if (!cred || !cred.salt || !cred.hash) return false;
  return (await hashPassword(cred.salt, password)) === cred.hash;
}

function readLocalCredential(user) {
  try { return JSON.parse(localStorage.getItem(authKey(user)) || "null"); }
  catch { return null; }
}
function writeLocalCredential(user, cred) {
  localStorage.setItem(authKey(user), JSON.stringify(cred));
}

// Look up an existing credential WITHOUT applying any remote snapshot to local
// storage — so a wrong password never hydrates another user's data onto this
// device. Checks local first, then a direct cloud read.
async function fetchStoredCredential(user) {
  const local = readLocalCredential(user);
  if (local) return local;
  try {
    const backend = await awaitSyncBackend();
    if (backend && backend.ready) {
      const srv = await backend.getProfile(user);
      const raw = srv && srv.data && srv.data[authKey(user)];
      if (raw) { try { return JSON.parse(raw); } catch {} }
    }
  } catch (e) { console.warn("[auth] credential fetch failed:", e); }
  return null;
}

async function loginAs(name, password, mode = "login") {
  const clean = name.toLowerCase().replace(/[^a-z0-9_.-]/g, "").slice(0, 40);
  if (!clean) { setLoginMsg("Username must have letters or numbers.", "err"); return; }
  if (!password) { setLoginMsg("Enter your password.", "err"); return; }

  const goBtn = document.getElementById("login-go");
  if (goBtn) goBtn.disabled = true;
  setLoginMsg("Checking…", "");

  try {
    const stored = await fetchStoredCredential(clean);
    const accountExists = !!stored;
    let cred, isNew = false;

    if (mode === "signup") {
      // Create account — refuse if the username is already taken.
      if (accountExists) {
        setLoginMsg("That username is already taken. Log in instead.", "err");
        return;
      }
      cred = await makeCredential(password);
      isNew = true;
    } else if (stored) {
      // Existing account — password must match.
      if (!(await verifyCredential(stored, password))) {
        setLoginMsg("Incorrect password. Try again.", "err");
        return;
      }
      cred = stored;
    } else {
      // No such account — don't silently create one in login mode.
      setLoginMsg("No account with that username. Tap “Create an account” to sign up.", "err");
      return;
    }

    // Auth passed — commit the session.
    localStorage.setItem("deca-imce:current-user", clean);
    state.user = clean;
    writeLocalCredential(clean, cred);
    addKnownUser(clean);
    closeLoginModal();
    refreshAuthUI();

    // Pull from server first so switching to a profile on a new device hydrates
    // that user's existing progress before we decide whether to import seeds.
    await syncProfilePull(clean);
    // Pull may have replaced local keys with the remote snapshot; re-assert the
    // credential so a freshly-set/upgraded password isn't lost, then push.
    writeLocalCredential(clean, cred);
    cleanupAutoImportedRohitCodes(clean);
    await maybeImportSeed(clean);
    syncProfilePushDebounced(clean, 500);
    render();
  } catch (e) {
    console.error("[auth] login failed:", e);
    setLoginMsg("Something went wrong. Try again.", "err");
  } finally {
    if (goBtn) goBtn.disabled = false;
  }
}

// Reset / change the current account's password (requires the current one).
async function changePassword() {
  if (!state.user) return;
  const user = state.user;
  const stored = readLocalCredential(user) || await fetchStoredCredential(user);
  if (stored) {
    const cur = prompt("Enter your CURRENT password:");
    if (cur == null) return;
    const ok = await verifyCredential(stored, cur);
    if (!ok) { alert("Current password is incorrect."); return; }
  }
  const next = prompt("Enter a NEW password (at least 4 characters):");
  if (next == null) return;
  if (next.length < 4) { alert("Password must be at least 4 characters."); return; }
  const again = prompt("Re-enter the new password:");
  if (again == null) return;
  if (next !== again) { alert("Passwords didn't match. Nothing changed."); return; }
  writeLocalCredential(user, await makeCredential(next));
  syncProfilePushDebounced(user, 300);
  alert("Password updated.");
}

// ================================================================
//                 TOPIC STUDY GUIDES (by code prefix)
// ================================================================
// Each guide: short summary + key terms + common traps.
// Kept concise so the page stays scannable on a phone.
// Comprehensive topic guides. Coverage was built by scanning every
// performance-indicator code that appears across all 41 exams in data/.
// Comprehensive topic study guides. Coverage built from scanning every
// performance-indicator code that appears across all 41 exams in data/.
// Each guide lists the actual concepts you'll see tested on that topic.
// Comprehensive topic study guides. Coverage was built by scanning every
// performance-indicator code that appears across all 41 exams in data/.
// Each guide is written in a tutoring voice — plain English, concrete
// examples, why it matters, common traps, and what DECA actually tests.
const TOPIC_GUIDES_V2 = {
  IM: {
    name: "Marketing-Information Management",
    summary: `<strong>This is the single biggest topic on the ICDC Marketing Cluster exam — ~16 questions.</strong> MIM is all about how businesses gather, organize, analyze, and use marketing information to make better decisions. DECA tests you on the ENTIRE research process end-to-end: identifying a problem, designing a study, collecting data, choosing a sample, analyzing results, and applying ethics to the whole thing. If you don't feel solid on IM, you're leaving easy points on the table. This guide covers every concept that has shown up in the 41 exams you have access to.`,
    sections: [
      { h: "Why MIM exists — the big picture", items: [
        "The whole point of MIM is to <strong>reduce guesswork</strong>. Every marketing decision — what product to launch, what price to charge, what channel to use, what ad to run — is a bet on what customers will do. Good information makes that bet smarter. Bad or missing information means you're flying blind.",
        "Marketers use MIM to <strong>develop new products, improve existing ones, monitor trends, understand customers, and evaluate campaigns</strong>. So when a DECA question asks 'why use marketing information?' the answer is almost always going to be one of those five purposes.",
        "Key distinction to lock in: <strong>data</strong> is raw numbers and facts (e.g. '500 people bought this yesterday'). <strong>Information</strong> is data that has been processed and given context ('sales are up 20% this week, driven by teen buyers'). Information supports decisions. Raw data doesn't. DECA asks this directly — 'what's the relationship between data and information?' The answer: data becomes information after processing.",
      ]},
      { h: "Types of research (IM:282, IM:284)", items: [
        "<strong>Exploratory research</strong> is used when you don't even know what you don't know. The problem is fuzzy — 'sales are dropping, but we have no idea why.' Exploratory digs around to generate ideas and form hypotheses. It's open-ended and qualitative — interviews, focus groups, literature reviews. Think of it like casting a wide net.",
        "<strong>Descriptive research</strong> describes who is buying, how much, how often, and where. It answers 'who and what,' not 'why.' Surveys and observations are typical. You use descriptive research when you already have a defined question but need facts about customers' demographics, behaviors, or preferences. 'What percentage of our customers are 18-24?' — descriptive.",
        "<strong>Causal research</strong> tests cause-and-effect. 'Does lowering the price of X cause sales of Y to rise?' You use experiments with controlled variables. This is the most rigorous and expensive type. DECA loves examples that boil down to 'we want to test whether A causes B' — that's always causal.",
        "The trap: test questions often describe a situation that COULD be exploratory OR descriptive. Ask yourself, is the problem already clearly defined? If yes → descriptive. If the researchers are still trying to figure out the problem → exploratory.",
      ]},
      { h: "Primary vs. secondary data (IM:001, IM:012)", items: [
        "<strong>Primary data</strong> is data YOU collected, for YOUR specific problem, for the first time. It's fresh, tailored, and usually more expensive. Examples: a survey your company runs, a focus group you moderate, a store observation you conduct.",
        "<strong>Secondary data</strong> is data someone ELSE collected for some OTHER purpose, and you're now using it. Examples: government census data, industry reports, competitor analyses, internal sales records from last year. Cheaper, faster, but may not fit your exact question.",
        "Internal secondary data (like your company's own past sales records) is a HUGE resource. It's free, already organized, and specific to you. That's why DECA's answer to 'cheapest source to find out why sales are declining' is often internal records.",
        "Quick test: if the question mentions 'company records,' 'government data,' 'published reports,' 'industry studies' → secondary. If it mentions 'we ran a survey,' 'we interviewed customers,' 'we watched shoppers' → primary.",
      ]},
      { h: "Qualitative vs. quantitative data (IM:191, IM:286, IM:289)", items: [
        "<strong>Quantitative data</strong> is numbers: counts, ratings, percentages, dollar amounts. You can do math on it — averages, medians, modes. It gives you statistical confidence.",
        "<strong>Qualitative data</strong> is words and observations: customer stories, complaint letters, focus-group quotes, open-ended survey responses. Rich but harder to generalize.",
        "Three measures of central tendency you MUST know cold: <strong>Mean</strong> = average (add them all up, divide). <strong>Median</strong> = middle value when you line them up. <strong>Mode</strong> = most frequent value. If 16 out of 25 respondents rate something 'five,' the number five is the MODE. Don't confuse it with median or mean — DECA tests this exact scenario.",
        "<strong>Constant-sum scale</strong>: you ask respondents to divide a fixed total (say, 100 points) across several options. It tells you relative importance. Good for comparing priorities.",
        "<strong>Focus group</strong>: qualitative, 6-12 people, a moderator asks open questions, discussion unfolds. Best when you want depth, not breadth. Think 'why do customers feel this way?' — focus group. Think 'how many customers feel this way?' — survey.",
      ]},
      { h: "Sampling (IM:285, IM:292)", items: [
        "You almost NEVER survey everyone. Even if you had the budget, it'd take too long. So you pick a <strong>sample</strong> — a subset chosen to represent the larger population. The whole point of a sampling plan is to make sure your sample's answers can be generalized to everybody.",
        "Common DECA phrasing: 'What does a sampling plan do?' Answer: it <strong>represents a larger group</strong>. Not 'reduces bias' or 'increases accuracy' — those are side effects of a well-designed sample.",
        "<strong>Random sampling</strong>: everyone in the population has an equal chance of being picked. Simple and unbiased.",
        "<strong>Stratified sampling</strong>: divide the population into subgroups (say, age brackets), then randomly sample from each. Useful when you want to make sure every subgroup is represented.",
        "<strong>Cluster sampling</strong>: divide population into clusters (say, zip codes), then randomly pick entire clusters. Cheaper but less representative.",
        "<strong>Convenience sampling</strong>: whoever you can reach. Fastest, cheapest, most biased. Use with caution.",
        "<strong>Respondent-selection plan</strong>: the screening criteria that determine who qualifies for your survey. 'Must be 18+, live in the Midwest, have bought our product in the last 6 months' — that's respondent selection. Different from a sampling plan — selection filters WHO can take the survey, sampling picks WHICH of the eligible people you'll actually contact.",
        "Bigger, more representative samples = more trustworthy results. But bigger costs more. Researchers balance budget vs. confidence. DECA may ask about 'factors that affect how much data you collect' — budget and time are the biggest ones.",
      ]},
      { h: "Data-collection methods (IM:287, IM:289, IM:296, IM:418, IM:428)", items: [
        "<strong>Surveys</strong> — structured questions, usually quantitative. Online, phone, mail, or in-person. Pros: cheap, scalable. Cons: shallow, people lie or skip.",
        "<strong>Personal interviews</strong> — face-to-face or one-on-one phone. Deep answers, can probe follow-ups. Pros: rich data. Cons: expensive, slow, interviewer bias.",
        "<strong>Focus groups</strong> — moderated discussion, 6-12 people. Great for brainstorming, catching emotional reactions, and seeing how people react to ideas together. Watch for the loudest person dominating the group — that's why moderators exist.",
        "<strong>Observation (direct-observation research)</strong> — watching customers in the wild. Researchers use video cameras in stores to study shopping behavior without influencing it. No questions asked — you just WATCH what they do.",
        "<strong>Point-of-sale scanners</strong> — every time a barcode is scanned at checkout, data is captured. Massive, real-time, quantitative dataset of what sold, when, for how much. A goldmine for retailers.",
        "<strong>Media-use diaries</strong> — people record what TV shows they watched, what websites they visited, what podcasts they listened to. Used by ratings companies like Nielsen to figure out audience sizes.",
        "<strong>Experiment</strong> — controlled test, usually for causal research. Split customers into two groups, show them different ads, measure which group buys more. Amazon and Google do this constantly.",
        "The biggest trap: DECA often describes an observation or POS scenario and tests whether you can NAME it. 'Retailer uses a device at checkout to track purchases' — that's a point-of-sale scanner, not a survey.",
      ]},
      { h: "The research brief + design (IM:290)", items: [
        "A <strong>marketing-research brief</strong> is a written document that <strong>defines the problem and states the objectives</strong> of the research. It's the blueprint for the whole project. Everybody on the team reads it and agrees on what you're trying to answer BEFORE collecting data.",
        "A good brief answers: What is the decision we need to make? What info do we need to make it? Who's the target audience for the research? What's the budget and timeline? What deliverable do we want at the end?",
        "If the brief is weak, everything that follows is wasted money. Researchers sometimes spend a whole meeting just tightening the brief before touching any data.",
        "Don't confuse a research brief with a research proposal. A brief is the client's written instructions. A proposal is the researcher's written plan to carry them out.",
      ]},
      { h: "Question-design traps (IM:293)", items: [
        "<strong>Leading questions</strong> are questions that subtly push the respondent toward a specific answer. 'Don't you agree our coffee tastes better than Starbucks?' — that's leading. It biases the whole dataset. Avoid them at all costs.",
        "<strong>Double-barreled questions</strong> ask two things at once: 'Do you like our product and would you recommend it?' What if someone likes it but wouldn't recommend it? Useless answer.",
        "<strong>Loaded questions</strong> use emotional or value-laden language. 'Do you support the harmful policy of X?' People react to the emotion, not the policy.",
        "Good questions are neutral, specific, and one-topic at a time.",
      ]},
      { h: "Info timeliness, credibility, and discussion relevance (IM:294, IM:295)", items: [
        "<strong>Timeliness</strong>: marketing info has a shelf life. Customer preferences today may not match last year's. Researchers assess timeliness to make sure their info is <strong>still current and relevant</strong>. Stale info = bad decisions.",
        "<strong>Credibility</strong>: where the info came from matters. Peer-reviewed studies and reputable research firms are more credible than random blog posts. DECA asks 'how do you assess the credibility of an online article?' Answer: check the author's credentials, date, publisher, and whether other sources agree.",
        "<strong>Discussion relevance</strong>: every question asked in a focus group or interview should tie back to the objectives. Tangents are fun but burn time.",
      ]},
      { h: "Data analysis (IM:062)", items: [
        "<strong>Transcribing</strong> is converting audio/video interviews to written text so you can analyze the content. It's tedious but essential — you can't search a video, but you CAN search a transcript for themes.",
        "<strong>Coding</strong> is the step after transcribing: you tag chunks of text with themes ('complaints about price,' 'positive about packaging,' 'confusion about usage') to see patterns.",
        "Analysis method affects everything: if you planned to do statistical tests, you need large quantitative samples. If you planned to do thematic coding, you need rich qualitative interviews. Always pick your method BEFORE collecting data.",
      ]},
      { h: "Ethics in research (IM:025, IM:419)", items: [
        "<strong>Top rule</strong>: businesses should NOT undertake non-research activities with data collected under the guise of research. Example: if you told people you were doing a survey but then used their answers as sales leads, you committed sugging.",
        "<strong>Sugging</strong> = 'selling under the guise of research.' It's the term DECA uses. It's unethical AND illegal in some jurisdictions.",
        "<strong>Data manipulation</strong> is another huge ethical issue — cherry-picking results that support a predetermined conclusion. If you ran a study expecting one answer and reported only the data that agreed, you're manipulating.",
        "Maintain the integrity of marketing info by: interpreting results correctly, not distorting them, protecting respondent anonymity, and getting informed consent before collecting.",
      ]},
      { h: "Marketing-info management systems (IM:183, IM:281)", items: [
        "A <strong>marketing information system (MIS)</strong> is the tech infrastructure for collecting, storing, and analyzing marketing data. Spreadsheets, CRM software, data warehouses — all part of it.",
        "<strong>Intranet</strong>: a private internal network only employees can access. Great for sharing internal reports and databases. NOT the Internet (which is public).",
        "<strong>Warranty agreements</strong>: when customers register their warranties, they give up tons of useful data — name, address, product purchased, date of purchase, sometimes even demographic info. It's free, accurate, and specific to your customers. Smart companies mine warranty data for insights.",
        "<strong>Customer loyalty programs</strong>: every swipe of a loyalty card adds to a customer's profile — what they bought, when, how often, alongside other items. This is why supermarkets push loyalty cards so hard.",
      ]},
      { h: "Digital analytics (IM:469)", items: [
        "Modern marketers use <strong>website analytics</strong> to see where traffic comes from, how visitors move through the site, and what converts. Tools like Google Analytics track these.",
        "Key insight from DECA: use analytics to figure out <strong>which social media platforms actually drive traffic</strong> to your site. If Instagram sends 10,000 visitors/month and TikTok sends 500, you now know where to invest your promo budget.",
        "Other digital data sources: email campaign metrics (open rates, click rates), social listening (monitoring what people say about your brand), search-engine data (what people search for).",
      ]},
      { h: "Common traps specific to IM questions", items: [
        "<strong>Survey vs. sampling plan</strong>: a SURVEY is the METHOD of asking questions. A SAMPLING PLAN is HOW you pick who to ask. Test questions that talk about 'representing a larger group' are almost always sampling plan, not survey.",
        "<strong>Primary vs. secondary trap</strong>: internal company records are SECONDARY data, not primary, even though they're 'yours.' Primary means YOU designed the study and collected the data yourself.",
        "<strong>Mode vs. median trap</strong>: if a question asks for 'the most common rating' → mode. If it asks for 'the middle value' → median. Don't let 'five' in a scale confuse you — it's about statistical concept, not the number.",
        "<strong>Focus group vs. personal interview</strong>: focus group is GROUP dynamic. Personal interview is ONE-ON-ONE. DECA often describes a scenario with '6 participants discussing a topic' — that's focus group.",
      ]},
    ],
    traps: `The single biggest IM mistake students make is confusing a <strong>sampling plan</strong> with a <strong>survey</strong>. A sampling plan is about WHO you ask. A survey is the method of asking. If a question describes 'choosing a portion of the target market to represent the whole' — that's sampling. Also lock in: <strong>sugging</strong> is always unethical, POS scanners are observation not survey, and internal company records are SECONDARY data.`,
  },

  PM: {
    name: "Product/Service Management",
    summary: `<strong>Second-biggest topic on ICDC — ~15 questions.</strong> PM covers the entire lifecycle of a product: from new-product development, to branding strategy, to packaging, to quality control, to positioning, to inventory decisions as the product ages. DECA tests very specific distinctions — brand extension vs. licensing vs. repositioning, PLC stages and what decisions happen in each, touchpoints vs. competitive advantage. These sound similar but are very different, and that's where students lose points.`,
    sections: [
      { h: "Product Life Cycle — the 4 stages (PM:024)", items: [
        "<strong>Every product moves through four stages: Introduction → Growth → Maturity → Decline.</strong> You need to know what happens at each stage AND what strategic decisions companies make in that stage. DECA loves scenario questions where you match a situation to a stage.",
        "<strong>Introduction</strong>: brand-new product, low sales, high costs. Marketing spends heavily on awareness. Few or no competitors yet. Prices can be high (skimming — target early adopters who'll pay more) or low (penetration — grab share fast before competitors show up). The company's main job is BUILDING AWARENESS.",
        "<strong>Growth</strong>: sales climbing fast. This is when COMPETITORS SHOW UP with copycat products, because they saw the money. Because of competitor entry, prices often DROP to defend market share. The company focuses on DIFFERENTIATION — 'here's why our version is better.'",
        "<strong>Maturity</strong>: sales plateau. Market is saturated — most potential buyers already own the product or a competitor's version. Prices STABILIZE. This is where most profits come from because R&D costs are paid off. Company tries to EXTEND this stage with product modifications (new features, new packaging, new use cases).",
        "<strong>Decline</strong>: sales are falling. Could be because of a new technology replacing it, changing customer tastes, or saturation. The company's key decision here is: do we kill this product, reposition it for a niche market, or modify it? You do NOT set production schedules in decline — that's growth/maturity thinking. You EVALUATE the product's future.",
        "Common trap: 'In which stage does a business most likely REDUCE prices because copycats entered the market?' → GROWTH, not maturity. Competitors come in during growth, and prices drop then. In maturity, prices are already stable.",
        "Another trap: 'How does technology extend the life cycle?' → By IMPROVING PERFORMANCE of the existing product so it stays relevant longer. New features keep a product in maturity instead of sliding into decline. It's cheaper to improve what you have than to invent something new.",
      ]},
      { h: "Pricing strategies during the PLC", items: [
        "<strong>Price skimming</strong>: set the price HIGH at launch, because early adopters will pay premium for the newest thing. Then lower the price gradually to reach more buyers. Apple does this with new iPhones. Works when you have a unique product and few competitors.",
        "<strong>Penetration pricing</strong>: set the price LOW at launch to grab market share fast. Sacrifice profit now to build a user base before competitors react. Streaming services often do this. Works when the market is price-sensitive and you need volume fast.",
        "<strong>Stable pricing (maturity)</strong>: prices flatten out. Everyone has a similar product and everyone is fighting to hold share. Price wars can happen but usually there's a negotiated stability.",
        "<strong>Clearance pricing (decline)</strong>: deep discounts to move remaining inventory before discontinuation.",
      ]},
      { h: "New product development — the NPD process (PM:127, PM:128, PM:134)", items: [
        "Full NPD funnel: <strong>Idea generation → Idea screening → Concept testing → Business analysis → Product development → Test marketing → Commercialization</strong>.",
        "<strong>Idea generation</strong>: casting a wide net. Brainstorming, customer suggestions, R&D breakthroughs. Quantity matters more than quality here.",
        "<strong>Idea screening</strong>: filtering bad ideas out cheaply. Kill losers before you waste money on them.",
        "<strong>Concept testing</strong>: showing the idea to potential customers in description form to see if there's interest. 'If we made a laundry stain remover that worked on ANY stain, would you buy it?'",
        "<strong>Business analysis</strong>: modeling sales, costs, profits. Is this financially viable?",
        "<strong>Product development</strong>: actually building a prototype.",
        "<strong>Test marketing</strong>: launching the product in a small, controlled market to see real-world performance. If sales come in strong → go to full launch. DECA specifically asks: 'If test marketing yields POSITIVE results, what's next?' Answer: <strong>commercialization</strong> (full launch).",
        "<strong>Commercialization</strong>: the full rollout. Scale up production, launch marketing, distribute widely. Most expensive phase.",
        "Key insight: new products often solve a <strong>customer problem</strong> that wasn't being solved. If there's a town with no gourmet burger restaurant, that's an opportunity — a customer problem waiting for a product to solve it.",
      ]},
      { h: "Brand strategies — the 4 big ones (PM:206, PM:207)", items: [
        "<strong>Brand extension</strong>: your brand is already successful, so you use that SAME brand name to launch a NEW product category. Apple sold computers, then used the Apple name to launch iPhones. Amazon sold books, then used the Amazon name to sell everything. Virgin → airlines, music, mobile, hotels. Same brand, new categories. The idea is customers already trust the brand, so they'll try the new thing.",
        "<strong>Brand licensing</strong>: you let ANOTHER company put YOUR brand name on THEIR product, and they pay you a fee. Ferrari lets a sunglasses company put the Ferrari logo on sunglasses. Disney lets a toy company put Elsa's face on a lunchbox. You don't make the product — you rent out the name.",
        "<strong>Brand repositioning</strong>: your brand has an image problem OR the old image stopped working. You deliberately change how people perceive the brand. Domino's openly admitted their pizza was bad, changed the recipe, and ran a whole campaign about 'we fixed it.' Old Spice went from grandpa aftershave to young-and-funny. You're not changing the product much — you're changing the STORY around it.",
        "<strong>Brand positioning</strong>: choosing a specific spot in customers' minds relative to competitors. Volvo = safety. BMW = performance. Toyota = reliability. You're ESTABLISHING where you sit, not changing it.",
        "Quick disambiguation: repositioning is MOVING from one spot to a new spot. Positioning is CHOOSING your spot. Extension = same brand, new product. Licensing = your brand, someone else's product.",
      ]},
      { h: "Brand ownership types — private vs. manufacturer vs. corporate (PM:021, PM:042)", items: [
        "<strong>Private brand (aka store brand, private label)</strong>: the RETAILER owns the brand name, but they don't make the product — they contract with a manufacturer to produce it. Costco's Kirkland, Target's Up & Up, Walmart's Great Value. Customer thinks it's Costco's brand even though some factory in Ohio made it.",
        "<strong>Manufacturer brand (aka national brand)</strong>: the company that MAKES the product puts their OWN name on it. Nike shoes, Samsung TVs, Coca-Cola drinks. The maker and the brand are the same company. These are usually sold through many retailers.",
        "<strong>Corporate brand</strong>: the COMPANY NAME itself IS the brand across all its product lines. Samsung is both a manufacturer brand AND a corporate brand because Samsung appears on TVs, phones, fridges, washing machines. Virgin is a corporate brand — Virgin Atlantic, Virgin Mobile, Virgin Records. The corporate identity IS the product brand.",
        "Test trap: Target's 'All in Motion' clothing. Target doesn't make the clothes — they contract with factories. What kind of brand? PRIVATE. Customer thinks of it as Target's brand. Don't call it corporate just because Target is big.",
      ]},
      { h: "Packaging and labeling (PM:040)", items: [
        "Packaging has three jobs: <strong>protect, promote, inform</strong>. Protect the product during shipping and storage, promote the brand through visual design, and inform customers with usage instructions, nutrition info, warnings, and ingredient lists.",
        "Labeling laws (especially for food) require listing ingredients so customers with allergies can check. Hazard symbols are required on dangerous chemicals. The more risk the product poses, the more regulation on labeling.",
      ]},
      { h: "Product quality and safety (PM:017, PM:019)", items: [
        "<strong>Product recall</strong>: pulling a defective or unsafe product from the market. Usually mandatory when a safety issue is found. Recalls hurt sales short-term but prevent lawsuits and worse reputational damage long-term.",
        "<strong>Why businesses meet quality standards</strong>: to <strong>satisfy customers and stay competitive</strong>. Quality is a differentiator and a defense. Weak quality → bad reviews → lost sales.",
        "<strong>Product grades</strong>: rating products by physical characteristics like weight, size, appearance, safety, and quality level. Government agencies set grade standards for many goods (beef grades, lumber grades, etc.).",
        "<strong>Cost standards</strong>: specifications about how much something COSTS to produce (materials, labor, production costs). Different concept from grades. If the question mentions weight/size/appearance → grades. Dollars → cost standards.",
      ]},
      { h: "Warranties (PM:020)", items: [
        "Warranties give customers recourse if a product fails. To make a warranty claim, the customer typically has to prove <strong>where the product was purchased</strong> (original retailer) and when. That's why you keep receipts.",
        "Express warranties are explicitly stated. Implied warranties come with every sale (the product must be fit for ordinary use).",
      ]},
      { h: "Bundling (PM:041)", items: [
        "<strong>Product bundling</strong> is packaging multiple products together for a single price, usually at a discount vs. buying separately. Microsoft Office bundles Word, Excel, and PowerPoint. Streaming services bundle music + video + storage.",
        "<strong>Primary strategic purpose</strong>: get customers to TRY products they wouldn't buy alone. If you needed Word but PowerPoint comes with it, you try PowerPoint. You like it. Now you use all three long-term. That's the real play — long-term product adoption.",
        "Secondary benefits: lower marketing costs (one campaign for three products) and increased perceived value ('three for $30 feels like a deal').",
        "DECA answer trap: if the question asks the PRIMARY purpose of bundling, pick <strong>long-term use / customer adoption</strong> over 'control expenses' or 'lower marketing.' Expense control is a side effect, not the strategy.",
        "Separately: companies also use bundling to <strong>deplete slow-moving inventory</strong> — pair an unpopular item with a hot one.",
      ]},
      { h: "Touchpoints vs. competitive advantage (PM:276, PM:042)", items: [
        "<strong>Touchpoints</strong>: every single moment a customer interacts with or sees your brand. The Instagram post, the store entrance, the cup your drink comes in, the email receipt, the loyalty notification, the customer-service call, the online review, the ad playing before a YouTube video. All touchpoints.",
        "Why touchpoints matter: the brand experience must be CONSISTENT across them. If your Instagram looks premium but your store is dirty, that's a touchpoint failure.",
        "<strong>Competitive advantage</strong>: what makes your company BETTER than competitors. Lower cost, better quality, unique feature, stronger brand, faster delivery. It's WHY customers choose you.",
        "Distinction: touchpoints are WHERE you connect. Competitive advantage is WHY you win. DECA often mixes these up in the answer choices — the question says 'communicating unique attributes' and both touchpoints and competitive advantage sound plausible. The answer is competitive advantage.",
        "Another angle: <strong>posting positive reviews prominently</strong> on your site = touchpoint-level reputation management. It reinforces the brand story at a moment a customer is considering buying.",
      ]},
      { h: "Brand associations and corporate positioning (PM:206, PM:207)", items: [
        "<strong>Brand associations</strong>: the thoughts, feelings, and experiences consumers link to your brand. Volvo → safe. Disney → magical. McDonald's → fast, cheap, predictable. These associations are built over years and are hard to change (hence why repositioning is difficult).",
        "<strong>Corporate brand positioning</strong>: how the WHOLE company is perceived, not just one product. PetFast positions itself as 'low prices and great value' across all its stores and products.",
      ]},
      { h: "Supply chain vs. CRM vs. MIM — the 'management' terms (often confused)", items: [
        "<strong>Supply chain management</strong>: managing the PHYSICAL flow of products from raw materials to end customer. Sourcing, manufacturing, warehousing, shipping, delivery. Operations-focused.",
        "<strong>CRM (Customer Relationship Management)</strong>: managing the RELATIONSHIP with customers. Tracks customer interactions, preferences, purchase history. Sales and marketing focused.",
        "<strong>MIM (Marketing-Information Management)</strong>: gathering and analyzing info to support marketing decisions. Broader than CRM.",
        "One-line disambiguation: supply chain = product flow. CRM = customer relationship. MIM = decision support via data.",
      ]},
      { h: "Project charter (PM:127 related)", items: [
        "A project charter is the document that OFFICIALLY AUTHORIZES a project to begin. It defines scope, objectives, stakeholders, budget, timeline, and who has decision authority. Without a charter, the project has no formal existence.",
        "Don't confuse with: project proposal (pitches the project before it's approved), project plan (the detailed work plan after charter), project review (evaluates after the fact).",
      ]},
      { h: "Creative thinking techniques (PM:127, for NPD)", items: [
        "<strong>Brainstorming</strong>: quantity over quality, no judging ideas in the generation phase.",
        "<strong>Six Thinking Hats</strong> (de Bono): look at a problem from six different perspectives one at a time — facts (white), emotions (red), positives (yellow), negatives (black), new ideas (green), organization (blue). Helps teams avoid jumping straight to criticism.",
        "<strong>Mind mapping</strong>: visual brainstorming. Central topic in the middle, branches radiating outward.",
        "<strong>Synectics</strong>: combining unrelated concepts to spark new ideas ('what if a car was more like a living room?').",
        "<strong>Forced association</strong>: combining two random things deliberately to force a new connection.",
        "<strong>Unconscious problem solving</strong>: stepping away from the problem and letting your subconscious work on it — 'sleeping on it.'",
        "<strong>Attribute listing</strong>: list every feature of a product, then ask 'what can I change about each one?' — programmed thinking, logical.",
      ]},
      { h: "Product placement (distinct from bundling)", items: [
        "<strong>Product placement</strong> = paying to have your product appear in entertainment — movies, TV shows, video games, YouTube videos. James Bond drives an Aston Martin. The main character uses an Apple laptop. It's advertising disguised as normal life — viewers associate the product with the character's lifestyle.",
        "Placement is a PROMOTION strategy (PR territory), NOT a product-management strategy. But since it's about how a product appears in the market, it touches PM too.",
        "Don't confuse bundling (selling products TOGETHER) with placement (putting product IN MEDIA).",
      ]},
    ],
    traps: `<strong>Decline stage</strong> = decide the product's future (continue, modify, kill) — NOT set production schedules (that's growth/maturity). <strong>Competitors enter in GROWTH</strong>, not maturity. That's when prices drop. <strong>Private brand</strong> = retailer owns the name. <strong>Manufacturer brand</strong> = maker owns the name. Target's 'All in Motion' = private, not corporate, even though Target is big. <strong>Brand extension</strong> (same brand, new category) vs. <strong>licensing</strong> (your name on someone else's product) — top mix-up.`,
  },

  PR: {
    name: "Promotion",
    summary: `<strong>Third-biggest topic on ICDC — ~13 questions.</strong> Promotion covers the promotional mix (advertising, personal selling, sales promotion, PR, direct marketing), ad elements, media types, sales-promotion tactics (push vs. pull), regulation, and the emerging role of social media and influencer marketing. Lots of vocabulary but most of it follows a pattern: 'here's a scenario, what type of promotion is it?'`,
    sections: [
      { h: "The 5 elements of the promotional mix (PR:003, PR:100)", items: [
        "<strong>Advertising</strong>: paid, non-personal mass communication. TV, radio, print, online display, billboards, transit ads. Reaches many but impersonal.",
        "<strong>Personal selling</strong>: face-to-face or one-on-one persuasion. High cost per contact but high conversion.",
        "<strong>Sales promotion</strong>: short-term incentives to drive immediate action. Coupons, samples, contests, rebates, loyalty points.",
        "<strong>Public relations (PR)</strong>: building goodwill through non-paid, non-personal communication. Press releases, sponsored events, corporate philanthropy, newsletters. Aim: positive coverage and brand reputation.",
        "<strong>Direct marketing</strong>: targeted communication directly to specific customers. Catalogs, telemarketing, direct mail, email marketing, SMS. Trackable and personal.",
        "<strong>Social media and digital</strong>: increasingly treated as its own category. DECA specifically points out social media is MORE COST-EFFECTIVE than traditional advertising — you can reach huge audiences for relatively little money.",
        "Classic trap: catalogs, telemarketing, and email are <strong>direct marketing</strong>, NOT advertising. Advertising is mass and non-personal; direct is targeted and personal.",
      ]},
      { h: "Product vs. institutional promotion (PR:001, PR:002)", items: [
        "<strong>Product promotion</strong>: promoting a specific good or service. 'Buy our laundry detergent,' 'Try our new pizza.' Features, benefits, price. Goal is to drive a specific sale.",
        "<strong>Institutional promotion</strong>: promoting the COMPANY, not a specific product. Goals include building corporate image, highlighting social/environmental work, recruiting employees, changing public attitudes. Public-service announcements are institutional.",
        "Top-level purpose of promotion in general: increase sales, by informing, reminding, and persuading customers. DECA's answer to 'why do businesses promote?' is almost always <strong>increased customer loyalty, sales, and awareness</strong>.",
      ]},
      { h: "Advertising elements and theme (PR:014)", items: [
        "Print ad components: <strong>headline</strong> (grabs attention), <strong>copy</strong> (the sales message body text), <strong>illustration</strong> (visual), <strong>signature</strong> (brand name/logo).",
        "These elements must be <strong>coordinated to strengthen the theme</strong> of the ad. A beach-vacation ad with a snow illustration confuses the message.",
        "Illustrations in a supermarket's print ad (a picture of fresh produce next to a sale price) serve a specific purpose: they prompt <strong>action</strong> — making the reader want to come in and buy.",
      ]},
      { h: "Media types (PR:007)", items: [
        "<strong>Print media</strong>: newspapers, magazines, <strong>catalogs</strong>, direct mail flyers, brochures.",
        "<strong>Broadcast media</strong>: TV and radio.",
        "<strong>Out-of-home (OOH)</strong>: billboards, transit ads (buses, subway), bus-stop ads, building wraps, people in costumes on sidewalks handing out flyers. Anything not in a home.",
        "<strong>Digital/online</strong>: display ads, search ads, social media ads, streaming ads.",
        "DECA will describe a scenario ('an employee dressed in an ice-cream cone costume stands near the store entrance') and ask what category. Out-of-home.",
      ]},
      { h: "Promotional budgets and objectives (PR:073)", items: [
        "<strong>Promotional objectives</strong>: the goals the company wants promotion to achieve. Could be awareness, trial, repeat purchase, brand image, market share, or specific sales targets.",
        "<strong>Promotional budget</strong>: how much money is allocated. Common methods: percent of sales (e.g. 5% of last year's sales), competitive parity (match what competitors spend), objective-and-task (figure out what objectives require, then price it out).",
        "<strong>Promotional mix</strong>: the blend of channels used. An app company might spend 60% on digital, 20% on social, 15% on PR, 5% on sales promotion. Different products and audiences need different mixes.",
        "Don't mix these up: objective = the goal. Budget = the money. Mix = the channel blend.",
      ]},
      { h: "Sales promotion tactics (PR:076, PR:247, PR:249)", items: [
        "<strong>Consumer sales promotion (pull)</strong>: incentives aimed directly at consumers to pull them toward the product. Coupons, rebates, free samples, contests, loyalty points, 'buy one get one free,' January white sales.",
        "<strong>Trade sales promotion (push)</strong>: incentives aimed at retailers and wholesalers to push the product through the channel. Trade shows, trade advertising, dealer incentives, co-op advertising, trade allowances.",
        "<strong>Product displays</strong> at point of sale drive impulse buys — put gum near the checkout lane.",
        "<strong>Trade shows</strong>: industry events where multiple companies set up booths to show products to retailers and media. You have <strong>limited control</strong> at trade shows because you're competing with everyone else for attention.",
        "Common test pattern: 'retailer offering a discount on a product' = consumer promotion / pull. 'manufacturer offering a bonus to distributors' = trade promotion / push.",
      ]},
      { h: "PR tactics (PR:250, PR:252, PR:253, PR:255)", items: [
        "<strong>Media kit</strong>: the package of materials a PR team gives journalists — press release, company background, executive bios, product specs, photos. Makes the journalist's job easier.",
        "<strong>Press release</strong>: a news-style announcement about company news (launch, acquisition, award, executive hire).",
        "<strong>Newsletters</strong>: regular communication to customers or industry folks — builds ongoing relationship.",
        "<strong>Sponsoring events</strong>: attach your brand to a positive community event (marathon, concert, charity gala).",
        "<strong>Speaker events</strong>: corporate execs giving talks at industry conferences — positions the company as thought leader.",
        "Goal of PR is to <strong>pass on positive information</strong> about the company to the public, via trusted third parties (journalists, influencers, event audiences).",
        "Financial consideration when deciding to participate in a trade show: <strong>cost vs. expected business</strong> — booth fees, travel, staff time, materials — is it worth it?",
      ]},
      { h: "Digital and email promotion (PR:089)", items: [
        "<strong>Targeted email with a personalized coupon</strong> = direct marketing + sales promotion combined. Personalization increases open rates and conversions.",
        "<strong>Retargeting ads</strong>: showing ads to people who already visited your site — higher conversion than cold ads.",
        "<strong>Influencer marketing</strong>: paying or partnering with social-media personalities to recommend your product. Works because consumers trust peers more than brands.",
      ]},
      { h: "Promotion regulation (PR:099, PR:101)", items: [
        "Advertising faces regulation because false or misleading claims harm consumers. The FTC (Federal Trade Commission) polices deceptive advertising in the US.",
        "<strong>Consent order</strong>: company voluntarily stops running an ad, without admitting guilt.",
        "<strong>Cease-and-desist order</strong>: stop running the ad until a hearing decides if it's legitimate.",
        "<strong>Corrective advertising</strong>: new ads must be run to correct misleading impressions caused by the original.",
        "<strong>Controversial products</strong> (alcohol, tobacco, prescription drugs, gambling) face stricter rules. Prescription-drug ads have been questioned for persuading customers to ask doctors for drugs they may not need.",
        "<strong>Paying people to post fake reviews / fake positive Twitter comments</strong> = deceptive, often illegal. Undermines consumer trust.",
        "<strong>Industry self-regulation</strong>: many industries (media, financial services, utilities) have their own rules beyond government regulation to protect credibility.",
      ]},
      { h: "Trade-show and event promotion (PR:254, PR:255)", items: [
        "<strong>Interactive displays</strong> at trade shows let attendees touch or try the product — far more effective than a static booth. 'Let them hold the tablet and explore it.'",
        "Follow up on trade-show leads quickly — leads get cold within days.",
      ]},
      { h: "Why trust matters — word-of-mouth and authenticity (PR:001)", items: [
        "<strong>Consumers trust other consumers more than brands</strong>. That's why word-of-mouth, reviews, and influencer marketing are so powerful.",
        "Ads that seem like they're hiding something breed skepticism. Being transparent about what your product does and doesn't do actually builds trust.",
        "Ads for products that seem too good to be true are often dismissed — consumers are more skeptical now than ever.",
      ]},
    ],
    traps: `Catalogs + telemarketing + email = <strong>direct marketing</strong>, NOT advertising. Public-service announcements = <strong>institutional</strong> promotion. Employee in a costume on a sidewalk = <strong>out-of-home (OOH)</strong> advertising. Consent order ≠ cease-and-desist. Paying for fake reviews/positive posts = deceptive practice. Trade shows offer <strong>limited control</strong> because you're competing with other booths.`,
  },

  FI: {
    name: "Financial Analysis",
    summary: `<strong>Only ~4 questions on ICDC, but this is where students lose the most points per question asked because they don't have the foundational framework.</strong> FI covers financial statements (income statement vs. balance sheet vs. cash-flow statement), budgeting, costs (fixed vs. variable vs. sunk), investment types (ownership vs. lending), personal finance (credit, CDs, savings), and ethical/compliance topics. If you can distinguish between the three financial statements AND between ownership vs. lending investments, you'll get most FI questions right.`,
    sections: [
      { h: "The three financial statements — the foundation", items: [
        "Every business has three primary financial documents. They each answer a different question, and DECA loves testing whether you know which one to use.",
        "<strong>Income statement (profit-and-loss statement)</strong>: answers 'how did we DO?' over a period of time (a month, quarter, or year). Shows revenue, expenses, and profit/loss. Revenue − expenses = profit. Think of it as a MOVIE — it captures what happened over time.",
        "<strong>Balance sheet</strong>: answers 'what do we HAVE and what do we OWE?' at a single moment in time. Shows assets, liabilities, and owner's equity. Think of it as a PHOTOGRAPH — one frozen moment.",
        "<strong>Cash-flow statement</strong>: answers 'where did cash come from and where did it go?' over a period. Tracks cash in (operations, investing, financing) and cash out. You can be profitable on paper and still run out of cash — that's what cash-flow reports catch.",
        "The core balance-sheet equation: <strong>Assets = Liabilities + Owner's Equity</strong>. Memorize it. Every balance sheet balances to this.",
        "If a question mentions revenue, expenses, profit, cost of goods sold, or net income → income statement. If it mentions assets, liabilities, debt, what the company owns/owes, equity → balance sheet. If it mentions cash flow in/out → cash-flow statement.",
      ]},
      { h: "Balance sheet components — assets, liabilities, equity (FI:093, FI:094)", items: [
        "<strong>Assets</strong> = everything the company OWNS or has the right to. Cash, accounts receivable (money customers owe you), inventory, equipment, buildings, investments, intellectual property.",
        "<strong>Liabilities</strong> = everything the company OWES. Accounts payable (money you owe suppliers), bank loans, bonds, salaries payable, taxes payable.",
        "<strong>Owner's equity</strong> = what's left after subtracting liabilities from assets. It includes the original capital invested plus retained earnings. Retained earnings = accumulated profits minus dividends paid out.",
        "CRITICAL distinction: <strong>accounts RECEIVABLE is an asset</strong> (money coming to you). <strong>accounts PAYABLE is a liability</strong> (money you owe). Students mix these up constantly.",
        "Sample calculation: business has $2,500 cash + $6,125 accounts receivable + $3,775 inventory + $10,350 machinery = <strong>$22,750 in total assets</strong>. Accounts payable ($4,280) is NOT included in total assets — it's a liability, the other side of the equation.",
        "<strong>Retained earnings</strong> sits under owner's equity. It is NOT the whole of equity — just the portion from accumulated profits.",
      ]},
      { h: "Income statement — revenue, expenses, profit", items: [
        "<strong>Revenue</strong> = money earned from selling goods or services. Also called 'sales' or 'top line.'",
        "<strong>Expenses</strong> = costs incurred to generate that revenue. Includes cost of goods sold (COGS), operating expenses (salaries, rent, marketing), interest, and taxes.",
        "<strong>Net profit / net income</strong> = revenue minus all expenses. Also called 'bottom line.' This is the real profit.",
        "<strong>Gross profit</strong> = revenue minus only COGS (not all expenses). Measures how profitable the product is before overhead.",
        "Revenue NEVER directly appears on the balance sheet. Only the leftover profit (retained earnings) flows onto the balance sheet under equity.",
      ]},
      { h: "Fixed vs. variable vs. sunk costs (FI:106, FI:355)", items: [
        "<strong>Fixed costs</strong>: don't change with volume of production/sales. Rent, salaried employees, insurance, property taxes, depreciation of equipment.",
        "<strong>Variable costs</strong>: change with volume. Raw materials, hourly labor, commissions, shipping costs, cost of goods sold.",
        "<strong>Sunk costs</strong>: money already spent that you CAN'T recover, regardless of future decisions. The sunk-cost fallacy is continuing a bad investment because you've already put money in. Don't do it. 'We've already spent $500K on this product, we have to keep going' — that's the fallacy.",
        "Key principle: sunk costs should NOT influence future decisions. Only future costs and benefits matter. DECA may ask 'what's likely to happen when a company has sunk costs associated with a poor decision?' Answer usually involves pressure to <strong>continue pouring money in / conform</strong> rather than cut losses.",
      ]},
      { h: "Budgets and variance analysis (FI:106)", items: [
        "A <strong>budget</strong> is a financial plan — expected revenue and expenses over a specific time period. Usually prepared for a <strong>fiscal year</strong>, broken down by quarter and month.",
        "<strong>Variance</strong> = the difference between what was BUDGETED and what actually happened. If you projected $50K in costs but actually spent $80K, the $30K gap is a variance. Not an 'error' — the forecast wasn't wrong, it was a prediction that didn't pan out.",
        "Analyzing variance tells you WHY actuals differed — were sales higher, was a supplier more expensive, did an emergency come up?",
        "Why communicate the budget to employees? So they can make aligned spending decisions. An employee with no budget knowledge will overspend or underspend without realizing it.",
        "Employees typically CANNOT adjust the budget themselves — that's a management decision. They report variances upward.",
      ]},
      { h: "Capital investment vs. working capital vs. market risk (FI:354, FI:579)", items: [
        "<strong>Capital investment decisions</strong>: long-term, high-cost commitments. New factory, major equipment, acquisitions, R&D programs. Payback takes years. If the question mentions large dollars + multi-year timeline, it's capital investment.",
        "<strong>Working capital management</strong>: short-term, day-to-day cash flow. Managing current assets and liabilities — when to pay vendors, how much inventory to hold, how fast to collect from customers. One year or less. Keeps the lights on.",
        "<strong>Market risk management</strong>: managing EXTERNAL threats the company can't directly control — interest rates, currency fluctuations, commodity price swings, economic recessions. You HEDGE against market risk (futures, options, insurance).",
        "Quick test: question mentions facility, years, big purchase → capital investment. Question mentions paying bills, daily operations, current assets/liabilities → working capital. Question mentions external forces, interest rates, hedging, economic trends → market risk.",
      ]},
      { h: "Investment types — ownership vs. lending (FI:077)", items: [
        "<strong>Ownership investment</strong>: you OWN an asset and earn money from having it. Stocks (you own a piece of the company), real estate (you own the property, earn rent or appreciation), business ownership, mutual funds (you own shares of the fund which owns stocks).",
        "<strong>Lending investment</strong>: you LEND your money to someone and they pay you interest. Savings accounts (you lend to the bank — the bank uses your deposit to make loans), bonds (you lend to the company or government), certificates of deposit (CDs).",
        "The counter-intuitive part: a savings account IS a lending investment. When you deposit money, you're lending it to the bank temporarily, and interest is your payment for the loan. It's still your money but the mechanism is lending.",
        "Apartment building bought and rented out = ownership (you OWN it and earn from the ownership).",
        "Mutual fund = ownership. You own shares of a pool of stocks.",
        "Bond = lending. You lent the issuer money, they pay you interest, they give you principal back at maturity.",
        "Benefit of mutual funds: you get access to a <strong>fund manager's expertise</strong> — professional management that you couldn't afford individually.",
      ]},
      { h: "Cash conversion cycle (CCC)", items: [
        "<strong>Cash conversion cycle</strong> = the number of days from when you pay for raw materials to when you receive cash from selling the finished product. It measures how long your money is tied up in the production cycle.",
        "<strong>Shorter is better</strong>. Short CCC = cash comes back fast = more liquidity, less need to borrow. Long CCC = cash stuck in limbo = may need loans to cover daily operations.",
        "The goal of keeping the CCC short is to <strong>have cash available to use</strong> — for operations, opportunities, or emergencies.",
        "Ways to shorten CCC: negotiate longer payment terms with suppliers (pay them later), turn inventory faster, collect from customers faster.",
      ]},
      { h: "Compensation vs. benefits — a small but tested distinction", items: [
        "<strong>Compensation</strong> = MONEY paid to employees for work. Salary, hourly wage, commission, bonus. If it's a dollar amount tied to employment, it's compensation.",
        "<strong>Benefits</strong> = non-monetary extras on top of pay. Health insurance, PTO, 401(k) match, gym memberships, dental plans.",
        "A <strong>bonus is compensation</strong>, not a benefit. It's money earned for performance. Students miss this because they think 'bonus = extra = benefit.' Wrong — it's extra MONEY, so compensation.",
      ]},
      { h: "Personal finance basics (FI:062, FI:064, FI:066, FI:625)", items: [
        "<strong>Savings account</strong>: easy access, low interest. Good for emergency fund and short-term savings.",
        "<strong>Money market account</strong>: higher interest than savings but requires a high minimum balance to avoid fees. Middle ground.",
        "<strong>Certificate of deposit (CD)</strong>: highest interest, but money is locked up for a set term (6 months to 5 years). Early withdrawal triggers penalties. Use for money you won't need soon.",
        "<strong>Checking account</strong>: basically zero interest but unlimited access.",
        "Interest-rate ranking low to high: Checking < Savings < Money market < CD. The more you commit, the more you earn.",
        "<strong>APR (Annual Percentage Rate)</strong>: the true yearly cost of credit, including fees. Truth-in-lending laws require lenders to disclose APR so borrowers can compare.",
        "<strong>Emergency fund</strong>: 3-6 months of living expenses in an easy-access account (typically savings or money market). Critical cushion.",
        "<strong>Impulsive spending</strong>: unplanned purchases driven by emotion. Top personal-finance budget killer.",
        "<strong>Time value of money</strong>: $1 today is worth more than $1 a year from now because today's dollar can earn interest. That's why Kimberly took the $1,000 now instead of in 2 years — she wanted it earning interest.",
        "<strong>Capital gains</strong>: profit when you sell an investment for more than you bought it for. Buy stock at $40, sell at $65 = $25 capital gain.",
      ]},
      { h: "Insurance types (FI:081)", items: [
        "<strong>Property insurance</strong>: covers damage to business property (fire, theft).",
        "<strong>Liability insurance</strong>: covers legal claims against the business (customer injury, product defect).",
        "<strong>Business-interruption insurance</strong>: replaces lost income if operations are forced to stop (fire, disaster).",
        "<strong>Dwelling insurance</strong>: covers your home's structure.",
      ]},
      { h: "Credit and debt (FI:560, FI:568)", items: [
        "<strong>Secured debt</strong>: backed by collateral (mortgage is secured by the house). Lower interest rate because the lender has recourse.",
        "<strong>Unsecured debt</strong>: not backed by collateral (credit card debt). Higher interest because higher risk.",
        "Using a mortgage (secured by house) to pay off credit card debt (unsecured) transfers the risk — you could lose your house if you default. Rarely a smart move.",
      ]},
      { h: "Business ethics in finance (FI:351-FI:356)", items: [
        "Codes of ethics <strong>act as a framework for ethical decision-making</strong>. They don't cover every situation but give guidance.",
        "Financial communications must be <strong>clear and consistent</strong> — investors and regulators demand this.",
        "The finance function <strong>boosts growth and reduces risks</strong>. It's not just bookkeeping — it's strategic.",
        "Strong financial controls <strong>prevent pressuring employees</strong> to meet numbers by cutting ethical corners.",
        "Businesses follow accounting standards <strong>to avoid penalties</strong> (SEC, IRS fines) and protect reputation.",
      ]},
      { h: "Product grades vs. cost standards (FI:355 tangent)", items: [
        "<strong>Product grades</strong>: ratings based on PHYSICAL characteristics — weight, size, appearance, safety, purity. 'USDA Prime beef' is a grade.",
        "<strong>Cost standards</strong>: specifications about how much something COSTS — materials cost per unit, labor cost per hour, standard overhead allocation. All about DOLLARS.",
        "Test them in scenarios: 'weight, size, and appearance' → grades. 'Materials, labor, cost per unit' → cost standards.",
      ]},
    ],
    traps: `Revenue lives on the <strong>income statement</strong>, NOT the balance sheet. Retained earnings = profits MINUS dividends, and it sits under owner's equity. A <strong>savings account is a lending investment</strong> (you're the lender, bank is the borrower). <strong>Mutual fund = ownership</strong>, even though a fund manager runs it. A <strong>bonus = compensation</strong>, not a benefit. Sunk costs should NOT influence future decisions — but they often create pressure to conform.`,
  },

  CM: {
    name: "Channel Management",
    summary: `<strong>~7 questions on ICDC.</strong> CM is about how products move from producer to consumer, which middlemen are involved, and how to manage that flow efficiently. Key topics: direct vs. indirect channels, intensive vs. selective vs. exclusive distribution, channel conflict (horizontal vs. vertical), efficiency tools (EDI, RFID), and ethical practices (gray marketing, slotting allowances).`,
    sections: [
      { h: "Channel basics — who's in the channel", items: [
        "A <strong>distribution channel</strong> is the path a product takes from producer to final consumer. Along the way it may pass through wholesalers, distributors, agents, retailers.",
        "Channel members share FUNCTIONS: storing, transporting, financing, risking, marketing, ordering. Each member takes on some part of getting the product to the end user.",
        "<strong>Direct channel</strong>: producer → consumer. No middlemen. Farmer at a roadside stand, factory outlet, company website selling direct.",
        "<strong>Indirect channel</strong>: producer → wholesaler → retailer → consumer. Most common for mass-market consumer goods.",
        "Why use indirect channels? Middlemen add efficiency — they aggregate many producers' goods, break bulk for smaller retailers, handle logistics, provide financing. One wholesaler servicing 500 retailers is more efficient than 500 retailers each talking to every producer.",
      ]},
      { h: "Distribution intensity — how widely available", items: [
        "<strong>Exclusive distribution</strong>: ONE outlet per geographic area. Luxury brands (Rolex, Bentley dealerships). Lets the manufacturer maintain full control over pricing, display, and image. Limits availability on purpose to preserve prestige.",
        "<strong>Selective distribution</strong>: a limited number of retailers in each area. Shopping goods like appliances, brand-name clothing, electronics. Balances availability with control. 'Available but not over-distributed' = selective / ideal market exposure.",
        "<strong>Intensive distribution</strong>: as many outlets as possible. Convenience goods — gum, soda, magazines, common snacks. You want the product EVERYWHERE customers might impulse-buy.",
        "Test pattern: 'available but not over-distributed' → selective. 'Maximum control over image' → exclusive. 'Everywhere possible' → intensive.",
      ]},
      { h: "Channel conflict — horizontal vs. vertical (CM:008)", items: [
        "<strong>Horizontal conflict</strong>: between channel members at the SAME level. Two retailers in the same town competing for customers. Two wholesalers fighting over the same regional market.",
        "<strong>Vertical conflict</strong>: between members at DIFFERENT levels in the channel. A manufacturer sells direct to big retailers, skipping wholesalers — wholesalers are furious. Or a manufacturer opens its own stores, competing with its retailers.",
        "Causes of vertical conflict: incompatible goals (manufacturer wants high volume, retailer wants high margin), unclear roles, poor communication, one party feeling exploited.",
        "<strong>Offering different products through each channel</strong> can also trigger vertical conflict — retailers think they're being undercut.",
        "Resolution strategies: clear contracts, exclusive territories, joint planning, mediation.",
      ]},
      { h: "Technology in channel management (CM:004)", items: [
        "<strong>EDI (Electronic Data Interchange)</strong>: computer-to-computer exchange of purchase orders, invoices, shipping notices. The big benefit is <strong>integrated information sharing</strong> — all parties see real-time inventory, orders, and shipments. Reduces errors, speeds cycle time.",
        "<strong>RFID (Radio-Frequency Identification)</strong>: small tags attached to products or pallets, read wirelessly without line-of-sight. Tracks location and inventory in real time. Used in warehouses, retail stores, shipping.",
        "<strong>Supply-chain management software</strong>: coordinates every stage — forecasting, production, inventory, logistics. SAP, Oracle, NetSuite.",
        "<strong>Common barrier</strong> to tech in channel management: cost and lack of technical skill. Small channel members may not afford the software or have people to run it.",
      ]},
      { h: "Ethical issues in channel management (CM:005, CM:006)", items: [
        "<strong>Slotting allowance</strong>: a fee manufacturers pay retailers to get shelf space. Big manufacturers can pay, new/small manufacturers often can't. Makes it <strong>hard for small manufacturers with limited budgets</strong> to get distribution equal to big brands. Controversial — some see it as extortion, some as a legitimate fee.",
        "<strong>Full-line forcing</strong>: a manufacturer requires a retailer to carry its ENTIRE product line, not just the popular items. Can be illegal depending on market power.",
        "<strong>Gray marketing</strong>: selling genuine products through UNAUTHORIZED channels, often at lower prices. Products are real but bypass the official distribution, angering authorized dealers.",
        "<strong>Channel stuffing</strong>: manufacturer pushes excess inventory onto distributors to hit quarterly numbers. Unethical because it creates fake sales that eventually reverse.",
      ]},
      { h: "Coordinating with partners (CM:007)", items: [
        "<strong>Before advertising a sale</strong>: make sure products are actually in stock at the channel members' locations. Nothing kills a promotion faster than 'sold out' on day 1.",
        "Share <strong>sales forecasts</strong> with vendors and distributors so they can plan inventory and production. Better forecasts = better allocation of resources across the channel.",
        "<strong>Facilitating customer service</strong> is a major role of channel members — they're on the front line, fielding complaints and returns.",
      ]},
      { h: "Affinity marketing (CM:021)", items: [
        "<strong>Affinity marketing</strong>: targeting groups with shared interests or affiliations — alumni associations, professional organizations, club memberships. The channel uses the affinity group's trust to introduce products.",
        "Example: a credit card offered to university alumni with the school's logo on it. The school gets a royalty, alumni get a card tied to their identity.",
      ]},
    ],
    traps: `"Available but not over-distributed" = <strong>selective distribution / ideal market exposure</strong>, NOT exclusive. <strong>Slotting allowances</strong> punish small manufacturers who can't afford shelf fees. <strong>EDI</strong>'s top benefit is integrated information sharing (not cost savings). <strong>Gray marketing</strong> uses GENUINE products through unauthorized channels. <strong>Vertical conflict</strong> = different levels fighting (manufacturer skipping wholesaler). <strong>Horizontal conflict</strong> = same level fighting (two retailers competing).`,
  },

  SE: {
    name: "Selling",
    summary: `<strong>~8 questions on ICDC.</strong> Selling covers the personal-selling process, feature-benefit selling, handling objections, closing, and post-sale follow-up. Also touches on ethics in selling (illegal practices, price discrimination) and technology tools (GPS for route optimization).`,
    sections: [
      { h: "The selling process — stages (SE:048)", items: [
        "<strong>Prospecting</strong>: finding potential customers. Referrals, lists, networking, inbound leads. Who might buy what you sell?",
        "<strong>Preparation / pre-approach</strong>: RESEARCHING the prospect before contacting them. What do they do? What are their needs? Who makes decisions? A new car salesperson preparing for a prospect researches the model they viewed and their trade-in value. Preparation dramatically improves close rates.",
        "<strong>Approach</strong>: first contact — phone, email, or in-person. Goal is to open a conversation, not close a sale.",
        "<strong>Presentation</strong>: showing how your product solves the customer's problem. Feature-benefit selling — translate features into benefits.",
        "<strong>Handling objections</strong>: listening to concerns, restating them, answering honestly, moving forward. Never argue.",
        "<strong>Close</strong>: asking for the sale. 'Are you ready to proceed?' 'Shall we go ahead?'",
        "<strong>Follow-up</strong>: post-sale contact. Build the clientele — thank-you, check-in, addressing any issues. Loyal customers buy again AND refer others.",
      ]},
      { h: "Feature-benefit selling (SE:109)", items: [
        "<strong>Feature</strong>: a product characteristic. '8-hour battery life,' 'noise-canceling microphones,' 'HEPA filter.'",
        "<strong>Benefit</strong>: what that feature MEANS for the customer. 'Use all day without charging,' 'join video calls from anywhere,' 'cleaner air for allergy sufferers.'",
        "Benefits sell. Features inform. The salesperson's job is to connect each feature to the customer's specific need.",
        "A salesperson who explains how a certain product offers <strong>comfort, safety, or convenience</strong> is using feature-benefit selling — tying product attributes to what the customer cares about.",
      ]},
      { h: "Building clientele (SE:076, SE:828)", items: [
        "<strong>Clientele</strong> = a group of loyal, repeat customers. Building clientele is the backbone of long-term sales success.",
        "<strong>Referrals</strong>: ask happy customers to refer friends, family, or colleagues. Referrals have the highest close rate of any prospecting method because they come pre-warmed with trust.",
        "<strong>Goodwill</strong> = intangible asset created by loyal customers, strong brand, and positive reputation. Shows up on the balance sheet when a company is acquired.",
        "Building clientele leads to <strong>increased sales volume</strong> — loyal customers buy more often, spend more per visit, and refer others.",
      ]},
      { h: "Handling objections", items: [
        "Objections aren't rejections — they're signals the customer is engaged but needs more info.",
        "LISTEN to the full objection without interrupting. Restate it to confirm understanding. Answer directly. Move forward.",
        "Common objections: price, timing, competition, need. Each has a standard response pattern.",
        "Don't argue. Don't get defensive. Treat objections as an opportunity to clarify value.",
      ]},
      { h: "Product knowledge (SE:062)", items: [
        "Salespeople need deep product knowledge to sell effectively. Sources include:",
        "<strong>Company promotions</strong> (brochures, ads, internal marketing materials) — give salespeople the official messaging and key features.",
        "<strong>Training materials</strong> and product demos from the manufacturer.",
        "<strong>Customer feedback and field experience</strong> — what real users say about the product.",
      ]},
      { h: "Technology in selling (SE:107)", items: [
        "<strong>GPS / route optimization</strong>: helps field sales reps plan efficient territory routes, cutting drive time and fuel costs.",
        "<strong>CRM software</strong>: tracks every touchpoint with every prospect and customer, ensuring no lead falls through cracks.",
        "<strong>Sales automation tools</strong>: email sequences, lead scoring, meeting schedulers — free up selling time for actual selling.",
      ]},
      { h: "Selling ethics and legal issues (SE:106, SE:108)", items: [
        "<strong>Giving gifts to customers</strong>: small branded items (pens, calendars) are fine. Lavish gifts can cross into bribery. Companies typically have gift-value limits in their ethics policies.",
        "<strong>Price discrimination</strong>: charging DIFFERENT customers DIFFERENT prices for the SAME product, when the customers are similarly situated. Illegal under the Robinson-Patman Act in B2B contexts if it harms competition.",
        "<strong>High-pressure selling</strong> to vulnerable customers (post-burglary, elderly, bereaved): can be illegal and always unethical. Respect the customer's state of mind.",
        "<strong>Misrepresentation</strong>: selling a product by claiming features it doesn't have = illegal deceptive practice.",
      ]},
      { h: "Guarantees and risk reduction (SE:932)", items: [
        "A <strong>guarantee</strong> is a risk reducer — tells the customer 'if you're unsatisfied, we'll make it right.' Lowers the perceived risk of buying.",
        "Money-back guarantees, satisfaction guarantees, warranty extensions — all reduce the buyer's risk and increase conversion.",
      ]},
      { h: "Patronage motives (SE:359)", items: [
        "<strong>Patronage motives</strong> = why customers repeatedly choose one business over competitors. Reasons include safety features, convenience, price, customer service, brand trust, quality.",
        "A customer who buys a specific car because of its safety ratings = patronage motive based on safety.",
        "Understanding patronage motives helps the salesperson know what to emphasize and build long-term loyalty.",
      ]},
      { h: "Customer testimonials and social proof (SE:109)", items: [
        "<strong>Customer testimonials</strong> are powerful selling tools — real users sharing how the product helped them. Because consumers trust other consumers more than brands, testimonials outperform traditional sales copy.",
        "Use them in emails, website, store displays, and sales presentations.",
      ]},
    ],
    traps: `<strong>Preparation</strong> (pre-approach) happens BEFORE you contact the prospect — research comes first. <strong>Price discrimination</strong> isn't about discounts in general — it's about charging different prices to similar customers for the same product. Feature-benefit selling = connecting what the product HAS to what the customer GETS. A <strong>guarantee</strong> primarily reduces buyer risk, not seller cost.`,
  },

  EI: {
    name: "Emotional Intelligence",
    summary: `<strong>~6 questions on ICDC.</strong> EI is about self-awareness, self-regulation, motivation, empathy, and social skills at work. DECA tests integrity and ethics scenarios heavily, plus conflict resolution, diversity, leadership, and professional relationships.`,
    sections: [
      { h: "Self-awareness (EI:001, EI:006, EI:030)", items: [
        "<strong>Confidence</strong>: believing in your own abilities. Not arrogance — it's grounded self-assessment.",
        "<strong>Self-understanding</strong>: knowing your strengths, weaknesses, triggers, and values. Drives better decisions and relationships.",
        "<strong>Contentment</strong>: satisfaction with what you have. Related to but distinct from happiness — it's more stable.",
        "Evaluating your strengths and weaknesses tells you <strong>what you prefer</strong> and where you'll excel.",
      ]},
      { h: "Integrity and character (EI:004, EI:009, EI:018, EI:041)", items: [
        "<strong>Integrity</strong>: doing the right thing even when no one is watching. Demetrius honestly admitting his mistake is integrity.",
        "<strong>Dependable / reliable</strong>: people trust you to deliver. Major professional asset.",
        "<strong>Honesty</strong>: truthful communication. Builds trust quickly and long-term.",
      ]},
      { h: "Self-regulation and stress management (EI:016, EI:019, EI:024, EI:028, EI:029)", items: [
        "Visualizing yourself as you'd like to be <strong>takes time and practice</strong>. It's not instant.",
        "Being positive/open-minded helps you <strong>learn new skills</strong> and adapt to change.",
        "<strong>Alertness and assertiveness</strong> = key traits for effective workers.",
        "Managing stress: prioritize tasks, break big projects into steps, rest properly, don't overcommit.",
        "When you're angry at work: <strong>leave the room and shut the door</strong> to cool down. Don't escalate.",
      ]},
      { h: "Ethics and moral reasoning (EI:124, EI:126, EI:127, EI:129, EI:131, EI:132)", items: [
        "<strong>Ethical principles</strong>: guide behavior beyond what rules require. Law is a floor; ethics is a ceiling.",
        "Reflect on your values to understand your reactions. Why did you feel uncomfortable with X?",
        "Fair people <strong>try not to let biases affect decision-making</strong>.",
        "<strong>Trust</strong> and <strong>transparency</strong> are the foundation of workplace ethics.",
        "Codes of ethics are helpful but <strong>sometimes aren't enough</strong> for hard dilemmas — you still have to reason through them.",
      ]},
      { h: "Diversity and inclusion (EI:017, EI:033, EI:036, EI:061, EI:062, EI:064, EI:092, EI:104)", items: [
        "<strong>Primary dimensions</strong> of diversity: age, gender, race, physical abilities — things largely beyond personal control.",
        "<strong>Secondary dimensions</strong>: religion, education, marital status, work experience, income — things that change over time.",
        "To emphasize diversity's value, employees should <strong>discourage stereotypes</strong> and share different perspectives.",
        "Different perspectives <strong>facilitate creativity</strong>. Diverse teams outperform homogeneous ones on complex problems.",
        "Show respect through <strong>active listening</strong> — let people finish speaking before you respond.",
        "<strong>Culture</strong> includes traditions, norms, and assumptions that shape behavior.",
        "<strong>Tolerance for ambiguity</strong>: comfort with uncertain situations, a valuable trait in diverse, fast-moving workplaces.",
        "<strong>Extraverts</strong> energize from social interaction. <strong>Introverts</strong> from solitude. Good teams leverage both.",
      ]},
      { h: "Leadership and motivation (EI:014, EI:037, EI:038, EI:045, EI:059, EI:060, EI:135, EI:137)", items: [
        "<strong>Praise the group</strong> for effort and results — builds morale.",
        "<strong>Determination</strong>: pushing through setbacks.",
        "<strong>Don't generate fear</strong> at work — backfires. Leads to cover-ups, disengagement, turnover.",
        "Team-building: take people to lunch after reaching a major milestone.",
        "Goals should be specific: 'be the industry leader; add one new product this year.'",
        "<strong>Reward</strong> positive behaviors to reinforce them.",
        "Good leaders often aim to <strong>make a positive change</strong> in the world.",
      ]},
      { h: "Influence, persuasion, and conflict (EI:011, EI:015, EI:034, EI:106, EI:108, EI:109)", items: [
        "Sometimes the path to persuading is to <strong>agree</strong> first — find common ground, then build.",
        "Conflict resolution: <strong>acknowledge → define → confront → discuss resolutions → define the resolution</strong>. Don't skip steps.",
        "Political relationships at work = <strong>influence others' behavior</strong> (not gossip, not politics-as-in-government).",
        "Negotiating with your boss: <strong>admit a weakness you're working on</strong> and ask what else you could improve. Shows self-awareness.",
        "When your boss pushes back on your vacation request: <strong>listen carefully and address her objections</strong>.",
        "When asked to do extra work: explain you <strong>can't because of current priorities</strong>.",
      ]},
      { h: "Workplace relationships and professionalism (EI:002, EI:003, EI:007, EI:075, EI:134)", items: [
        "<strong>Embarrassment</strong> over wages is a common reason people avoid discussing pay with coworkers.",
        "<strong>Poor grammar</strong> is unprofessional — undermines credibility.",
        "'We don't want to brag' is a common humility norm.",
        "<strong>Blaming another person</strong> for a communication breakdown is immature and usually inaccurate.",
        "Peer pressure often stems from desire to <strong>be accepted</strong>.",
      ]},
      { h: "Burnout and reflection (EI:077, EI:136)", items: [
        "<strong>Losing interest</strong> in activities you used to enjoy is a classic burnout/depression signal.",
        "<strong>Reflection</strong>: regular self-examination keeps you grounded and calibrated.",
      ]},
    ],
    traps: `"Accepting blame for failure AND credit for success" = <strong>accountability</strong>, not humility. "Don't bite off more than you can chew" = know your limits, NOT focus on goals. Political relationships = influence + getting things done, NOT gossip. Losing interest in hobbies you once enjoyed = burnout warning signal, NOT simply 'getting older.'`,
  },

  EC: {
    name: "Economics",
    summary: `<strong>~4 questions on ICDC.</strong> Economics covers supply and demand, elasticity, factors of production, economic systems, business cycles, monetary and fiscal policy, international trade, and competitive market structures. Conceptual — you don't need to be a math wizard, but you need to know the terms cold.`,
    sections: [
      { h: "Factors of production (EC:001, EC:003, EC:023)", items: [
        "Every economy has four factors of production: <strong>Natural resources (land)</strong>, <strong>Human resources (labor)</strong>, <strong>Capital goods</strong>, and <strong>Entrepreneurship</strong>.",
        "<strong>Natural resources</strong>: raw materials from the earth — land, coal, oil, water, forests, minerals.",
        "<strong>Human resources</strong>: the people who work — laborers, managers, professionals.",
        "<strong>Capital goods</strong>: tools and equipment used to produce things. A <strong>tractor bought by a farmer</strong> to use for crops is a capital good — it's a tool used to make something else. Not a consumer good.",
        "<strong>Entrepreneurship</strong>: the creativity and risk-taking that combines the other three factors into a business.",
        "<strong>Outputs</strong> = the goods and services produced from combining these inputs.",
      ]},
      { h: "Supply, demand, and elasticity (EC:005, EC:006)", items: [
        "<strong>Demand</strong>: what consumers are willing AND able to buy at various prices.",
        "<strong>Supply</strong>: what producers are willing AND able to offer at various prices.",
        "Market price settles where supply and demand meet (equilibrium).",
        "<strong>Elastic demand</strong>: small price changes cause BIG changes in quantity demanded. Luxury goods, optional purchases, vacations. Raise the price 10%, demand drops 30%.",
        "<strong>Inelastic demand</strong>: price changes have LITTLE effect on quantity demanded. Necessities — bread, gasoline, prescription drugs, utilities. Raise the price 10%, demand drops maybe 2%.",
        "Key test: 'which of the following has inelastic demand' — look for staples (bread, medicine) vs. luxury (jewelry, travel).",
        "When a farmer decides to shift resources from corn to wheat, the output might be 'more wheat than corn' — straightforward reallocation.",
      ]},
      { h: "Economic systems (EC:009, EC:013)", items: [
        "<strong>Market economy (private enterprise)</strong>: <strong>individuals and businesses are the primary decision makers; government regulates</strong>. Private property is central. US, Canada, UK, Japan.",
        "<strong>Command economy</strong>: government controls production and distribution. Private property is limited or absent. Historical USSR, North Korea.",
        "<strong>Mixed economy</strong>: blend of market and command. Most developed countries today.",
        "<strong>Traditional economy</strong>: decisions based on custom and tradition, usually in small agrarian societies.",
      ]},
      { h: "Business cycle and indicators (EC:018, EC:081, EC:082, EC:083)", items: [
        "Four phases: <strong>Expansion → Peak → Contraction (Recession) → Trough</strong>.",
        "<strong>Expansion</strong>: economic growth, rising GDP, falling unemployment, rising consumer spending. Lower taxes and low interest rates typically fuel expansion.",
        "<strong>Peak</strong>: the high point before contraction.",
        "<strong>Contraction / Recession</strong>: economic decline, falling GDP, rising unemployment.",
        "<strong>Trough</strong>: the low point before recovery.",
        "<strong>Economic indicators</strong> signal positive and negative trends. Leading indicators (stock prices, building permits) move BEFORE the economy. Coincident indicators (GDP, retail sales) move WITH it. Lagging indicators (unemployment, interest rates) move AFTER.",
        "<strong>Seasonal unemployment</strong>: jobs tied to seasons — agricultural, retail holiday help, ski-resort staff.",
        "<strong>Structural unemployment</strong>: mismatch between worker skills and job needs (technology disruption).",
        "<strong>Cyclical unemployment</strong>: caused by economic downturns.",
      ]},
      { h: "Monetary and fiscal policy (EC:072, EC:084)", items: [
        "<strong>Monetary policy</strong>: controlled by the central bank (Fed in the US). Adjusts money supply and interest rates.",
        "<strong>Tight money supply</strong>: Fed restricts how much money is in circulation to slow inflation. Higher interest rates, less borrowing, slower economy.",
        "<strong>Loose money supply</strong>: Fed lowers rates to stimulate growth.",
        "<strong>Fiscal policy</strong>: controlled by Congress and the president. Adjusts government spending and taxation.",
        "<strong>Federal income tax</strong>: tax on individual and business earnings.",
        "<strong>Excise tax</strong>: tax on specific goods (alcohol, tobacco, fuel).",
      ]},
      { h: "GDP and measurements (EC:017, EC:107)", items: [
        "<strong>GDP (gross domestic product)</strong>: total value of goods and services produced domestically in a given period. Most-used measure of economic size.",
        "<strong>Real GDP</strong>: adjusted for inflation. <strong>Nominal GDP</strong>: not adjusted.",
        "Consumer spending drives most of US GDP — monitoring <strong>consumer spending trends</strong> is a key forecasting task.",
      ]},
      { h: "International trade (EC:016, EC:100, EC:104, EC:141)", items: [
        "<strong>Global trade</strong> opens new markets and sources of supply. Tariffs and trade agreements shape the flow.",
        "<strong>Tariff</strong>: a tax on imported goods, usually to protect domestic industry.",
        "<strong>Trade deficit</strong>: imports exceed exports.",
        "<strong>Trade surplus</strong>: exports exceed imports.",
        "International business risks: <strong>political instability, terrorist threats, currency fluctuations, cultural and language barriers</strong>.",
        "<strong>Official passports</strong> are typically required for business travel to foreign countries.",
      ]},
      { h: "Competitive market structures (EC:012)", items: [
        "<strong>Perfect competition</strong>: many sellers, identical products, no one has pricing power. Theoretical ideal — rare in practice.",
        "<strong>Monopolistic competition</strong>: many sellers, differentiated products (restaurants, clothing brands).",
        "<strong>Oligopoly</strong>: few dominant sellers (airlines, telecom, automakers). Industry leaders influence prices.",
        "<strong>Monopoly</strong>: one seller dominates — rare, often regulated.",
      ]},
      { h: "Risk and ethics (EC:011, EC:106, EC:140)", items: [
        "<strong>Economic risk</strong>: threat of financial loss from liability, damage, or other external forces. <strong>Liability insurance</strong> protects against legal claims (economic risk).",
        "Investors increasingly prefer companies they perceive as <strong>ethical</strong>. ESG considerations affect capital flows.",
        "<strong>Loss of customer trust</strong> = massive long-term economic harm. Often underestimated.",
      ]},
      { h: "Opportunity cost and scarcity (EC:140 adj., EC:065)", items: [
        "<strong>Opportunity cost</strong>: the value of the next-best alternative you gave up when making a choice. Every decision has an opportunity cost.",
        "<strong>Scarcity</strong>: limited resources relative to unlimited wants. The fundamental economic problem.",
        "<strong>Innovation</strong> creates new jobs (while sometimes destroying old ones). Net effect on employment is usually positive long-term.",
      ]},
    ],
    traps: `<strong>Private enterprise</strong> means individuals + businesses decide, government regulates (NOT government controls). A farmer's tractor = <strong>capital good</strong>, not a consumer good. <strong>Inelastic demand</strong> = necessities (bread, medicine). <strong>Elastic demand</strong> = luxuries. <strong>Oligopoly</strong> has FEW dominant sellers, not many. <strong>Scarcity</strong> and <strong>opportunity cost</strong> are both about choosing between limited resources — don't mix them up.`,
  },

  // ---- Remaining topics (moderate depth) ----

  BL: {
    name: "Business Law",
    summary: `<strong>~1 question on ICDC</strong> but easy points if you know the patterns. Covers types of law, contracts, torts, intellectual property, agency relationships, consumer protection, and regulation.`,
    sections: [
      { h: "Sources of US law (BL:067, BL:068)", items: [
        "<strong>Constitutional law</strong>: based on the US Constitution — supreme law of the land.",
        "<strong>Statutory law</strong>: laws passed by Congress or state legislatures.",
        "<strong>Case law (common law)</strong>: built from prior court decisions. 'Based on previous rulings' = case law.",
        "<strong>Administrative law</strong>: regulations issued by agencies (FTC, FDA, EPA).",
        "<strong>Uniform laws</strong>: standardized across states that adopt them — promote consistency in commerce.",
        "The US judicial system <strong>interprets and applies</strong> the laws.",
      ]},
      { h: "Contracts (BL:002)", items: [
        "A contract is a legally enforceable agreement. Requires offer, acceptance, consideration, capacity, and legality.",
        "One business promising to do something for another in return for compensation = a contract.",
        "Co-signers are legally obligated even if they try to remove their name — you can't back out unilaterally.",
      ]},
      { h: "Business ownership (BL:003)", items: [
        "<strong>Sole proprietorship</strong>: one owner, full liability, easy to start.",
        "<strong>Partnership</strong>: two+ owners sharing capital and liability.",
        "<strong>Corporation</strong>: owned via stock; buying shares is the simplest way to acquire ownership.",
        "<strong>LLC</strong>: hybrid — limited liability like corporation, pass-through taxation like partnership.",
      ]},
      { h: "Intellectual property (BL:001, BL:051, BL:069)", items: [
        "<strong>Trademark</strong>: brand identifier (name, logo). Use ® when registered.",
        "<strong>Patent</strong>: protects an invention for a period (typically 20 years).",
        "<strong>Copyright</strong>: protects original creative work (books, music, software).",
        "<strong>Appropriation</strong>: using someone's name or image without permission — a type of invasion-of-privacy tort.",
      ]},
      { h: "Agency and fiduciary duty (BL:072)", items: [
        "An <strong>agent</strong> acts on behalf of a <strong>principal</strong>. A lawyer representing a business owner is the agent; the owner is the principal.",
        "<strong>Fiduciary relationship</strong>: the agent must act in the principal's best interest.",
      ]},
      { h: "Torts (BL:163)", items: [
        "<strong>Negligence</strong>: failing to use reasonable care — duty, breach, causation, damages.",
        "<strong>Strict liability</strong>: liable regardless of fault (often product defects causing harm).",
        "<strong>Defamation</strong>: false statements damaging reputation. <strong>Libel</strong> = written. <strong>Slander</strong> = spoken.",
        "Laws often pass in response to shifts in public opinion (tobacco regulations after public-health awareness rose).",
      ]},
      { h: "Consumer protection and credit (BL:071)", items: [
        "Credit is regulated by laws to ensure fair debtor-creditor relationships.",
        "<strong>Truth-in-lending</strong>: lenders must disclose <strong>APR</strong> and total repayment.",
      ]},
      { h: "Regulation and customs (BL:074, BL:073, BL:126, BL:145)", items: [
        "Federal regulatory agencies issue and <strong>enforce agency regulations</strong>. FTC, FDA, EPA, SEC.",
        "Compliance with regulations <strong>increases operating costs</strong> but reduces legal risk.",
        "<strong>Customs regulations</strong>: protect borders from illegal materials and shield domestic economy from unfair foreign competition.",
        "<strong>Tariff</strong>: tax on imported goods.",
      ]},
      { h: "Due process (BL:070)", items: [
        "Fundamental principle: <strong>providing notice</strong> before taking action. Right to hearing, confront accuser, consistent treatment.",
      ]},
    ],
    traps: `<strong>Case law</strong> = prior court decisions, NOT legislation. <strong>Principal</strong> = represented party; <strong>agent</strong> = representing party. <strong>Strict liability</strong> doesn't require proving fault. <strong>Appropriation</strong> uses someone's identity without permission — it's an invasion of privacy tort.`,
  },

  CO: {
    name: "Communications",
    summary: `<strong>~3 questions on ICDC.</strong> Covers speaking, writing, listening, presentations, meetings, and digital communication. Overlaps with EI.`,
    sections: [
      { h: "Direction of communication (CO:014, CO:092)", items: [
        "<strong>Downward</strong>: supervisor → staff (boss's memo).",
        "<strong>Upward</strong>: staff → supervisor (employee pitching a promotion case to their manager).",
        "<strong>Horizontal</strong>: peers at the same level.",
        "<strong>Formal</strong> communication follows chain of command (announcement in weekly meeting).",
      ]},
      { h: "Business writing (CO:039, CO:040, CO:086-CO:091, CO:094, CO:147)", items: [
        "<strong>Persuasive</strong> writing drives action.",
        "A <strong>letter of inquiry</strong>: sent to vendors to request information.",
        "Business writing should be <strong>concise</strong>.",
        "Memo headers: <strong>To, From, Date, Subject</strong>.",
        "<strong>Editing</strong> fixes grammar, clarity, and flow.",
        "Emails are often seen by people other than the recipient — keep it professional.",
        "<strong>Minutes</strong> = written record of a staff meeting.",
      ]},
      { h: "Listening (CO:017, CO:055, CO:060, CO:063)", items: [
        "<strong>Internal distractions</strong> come from you (headache, hunger).",
        "<strong>External distractions</strong> come from your environment (noise).",
        "Ask questions AFTER the speaker finishes.",
        "Acknowledge concerns and respond respectfully.",
      ]},
      { h: "Speaking and presentations (CO:083, CO:087, CO:133)", items: [
        "Visual aids <strong>support</strong> spoken info — show them when you share relevant info, not constantly.",
        "Give directions in the <strong>proper order</strong>.",
        "<strong>Outlines</strong> keep presentations organized.",
      ]},
      { h: "Digital communication (CO:201-CO:206)", items: [
        "Email security is harder than private chat.",
        "Social media has LESS legal protection than private conversations.",
        "<strong>Data visualization</strong>: communicating data via charts, graphs, infographics.",
        "<strong>Loss of privacy</strong> is a major digital risk.",
      ]},
    ],
    traps: `Visual aids support speech — don't show them constantly. Email tone is easily misinterpreted. Minutes ≠ agenda (agenda = plan ahead, minutes = record after).`,
  },

  CR: {
    name: "Customer Relations",
    summary: `<strong>~1 question on ICDC.</strong> Covers customer service, rapport building, complaint handling, CRM, and cultural awareness.`,
    sections: [
      { h: "Handling complaints (CR:001, CR:009)", items: [
        "Top goal with dissatisfied customers: <strong>resolve problems and complaints</strong>.",
        "With suspicious customers: <strong>don't jump to quick conclusions</strong>. Follow policy politely.",
      ]},
      { h: "Service quality (CR:002, CR:007)", items: [
        "Managers must <strong>communicate service expectations</strong> clearly to staff.",
        "<strong>Interpreting policies effectively</strong> + consistent service = <strong>clientele</strong> (loyal repeat customers).",
      ]},
      { h: "CRM (CR:016, CR:017)", items: [
        "<strong>CRM</strong>: systems + processes for managing long-term customer relationships through data and consistent service.",
        "<strong>Protect customer data</strong>: secure confidential information and comply with privacy law.",
      ]},
      { h: "Cultural awareness (CR:019)", items: [
        "Research <strong>personal space preferences</strong>, greetings, and gift customs before international meetings.",
      ]},
      { h: "Rapport (CR:029)", items: [
        "Build rapport to <strong>create positive connections</strong> — not to take advantage or extract info.",
      ]},
    ],
    traps: `"Interpreting policies effectively to customers" → builds <strong>clientele</strong>. With dishonest or suspicious customers → don't confront; follow policy.`,
  },

  EN: {
    name: "Entrepreneurship",
    summary: `<strong>0 guaranteed questions on Marketing ICDC</strong> but sometimes appears peripherally.`,
    sections: [
      { h: "Entrepreneurial traits (EN:039, EN:040)", items: [
        "<strong>Entrepreneur</strong>: starts and runs a business, takes risk for potential profit.",
        "<strong>Flexibility</strong>: top entrepreneur trait — adapting to change.",
      ]},
      { h: "International business (EN:041)", items: [
        "Expanding internationally: deal with <strong>cultural and language barriers</strong>.",
      ]},
      { h: "Social responsibility (EN:044)", items: [
        "Donating proceeds to charity = CSR / social responsibility.",
      ]},
    ],
    traps: null,
  },

  HR: {
    name: "Human Resources",
    summary: `<strong>~0 questions on ICDC</strong>, occasional crossover.`,
    sections: [
      { h: "Onboarding and training (HR:360)", items: [
        "<strong>Orientation</strong>: introduces new hires to company culture, policies, expectations.",
      ]},
      { h: "Hiring (HR:410-HR:412)", items: [
        "Match job applications to skills (newsletter editor = communication skills).",
        "<strong>Ethics violation</strong>: formal HR investigation, impartial and documented.",
        "HR tech: <strong>electronically processing</strong> applications, payroll, benefits.",
      ]},
    ],
    traps: null,
  },

  MK: {
    name: "Marketing (Nature)",
    summary: `<strong>~1 question on ICDC.</strong> Overview of the marketing function.`,
    sections: [
      { h: "What marketing does (MK:001, MK:002)", items: [
        "Marketing creates, communicates, delivers, and exchanges value for customers.",
        "Public-service campaign example: 'Campaign against texting while driving.'",
        "Seven marketing functions (Channel Management, Market Planning, MIM, Pricing, Product/Service Management, Promotion, Selling) <strong>all need to work together</strong>.",
      ]},
      { h: "Consumer vs. organizational buyers (MK:014)", items: [
        "<strong>Consumer</strong>: individual buying for personal use (Lynnette buying printer paper at the store).",
        "<strong>Organizational / industrial</strong>: business buying for operations.",
      ]},
      { h: "Measuring marketing results (MK:019)", items: [
        "<strong>Market-share gain</strong> is a key measure of marketing effectiveness.",
      ]},
    ],
    traps: null,
  },

  MP: {
    name: "Market Planning",
    summary: `<strong>~5 questions on ICDC.</strong> Covers strategy, SWOT, marketing mix, segmentation.`,
    sections: [
      { h: "The 4 Ps (MP:001)", items: [
        "<strong>Product, Price, Place, Promotion</strong> — the marketing mix.",
        "$5-off summer-menu coupon emailed to customers = PRICE tactic (discount) through DIRECT MARKETING (email channel = Place/Promotion blend).",
      ]},
      { h: "Segmentation bases (MP:003)", items: [
        "<strong>Demographic</strong>: age, income, gender, education.",
        "<strong>Psychographic</strong>: lifestyle, interests, values.",
        "<strong>Geographic</strong>: where they live.",
        "<strong>Behavioral / product usage</strong>: how often, how much, for what purpose. 'Frequently attends the opera' = product usage, NOT psychographic.",
        "Consumer-goods examples (soda, PCs, toothpaste) = mass market.",
      ]},
      { h: "Planning cycle (MP:006, MP:007, MP:008)", items: [
        "<strong>Marketing planning</strong> is an ongoing process — revise continuously with new data.",
        "<strong>Performance and implementation</strong>: monitor actual results vs. plan.",
        "<strong>External threats</strong>: SWOT's T — competitors, regulations, economic downturns.",
      ]},
      { h: "Competitive positioning (MP:013)", items: [
        "Competitive analysis compares your strengths and offers to rivals.",
      ]},
    ],
    traps: `Segmenting by 'how often someone attends the opera' = <strong>product usage</strong> (behavioral), NOT psychographic.`,
  },

  NF: {
    name: "Information Management",
    summary: `<strong>~3 questions on ICDC.</strong> Business info systems, data security, software, analytics.`,
    sections: [
      { h: "Records management (NF:001, NF:076, NF:081)", items: [
        "<strong>Legal</strong> records need long-term preservation.",
        "<strong>Obsolescence of format</strong>: convert old files before software changes make them unreadable.",
      ]},
      { h: "Environmental scanning (NF:002, NF:014, NF:015)", items: [
        "Purchasing contracts data + <strong>consumer spending habits</strong> = key economic-scan inputs.",
        "Technology can <strong>spawn new industries</strong> (streaming, EVs, AI).",
      ]},
      { h: "Software types (NF:004, NF:007-NF:011, NF:042, NF:085)", items: [
        "<strong>Autoresponder</strong>: auto-reply email.",
        "<strong>Word processing</strong>: documents.",
        "<strong>Presentation</strong>: decks.",
        "<strong>Spreadsheet</strong>: numbers + charts, operating-expense tracking.",
        "<strong>Groupware</strong>: team collaboration tools.",
        "<strong>HTML</strong>: web markup.",
        "<strong>Operating systems</strong>: Windows, macOS, Linux.",
      ]},
      { h: "Data security + policies (NF:078, NF:110, NF:111)", items: [
        "<strong>Database access</strong> is via login + queries.",
        "<strong>Spam</strong> is a filter/security concern.",
        "Employees <strong>shouldn't share confidential info</strong> from previous employers — ethical and legal violation.",
      ]},
      { h: "Analytics (NF:139-NF:152, NF:278)", items: [
        "Data-driven decisions outperform gut instinct.",
        "<strong>Data mining</strong>: discovering patterns in large datasets.",
        "<strong>Data visualization</strong>: charts, dashboards, infographics.",
        "Information systems <strong>turn raw data into useful info</strong>.",
        "Gaps in data → <strong>collect more data</strong>.",
      ]},
    ],
    traps: `Autoresponder = pure automatic reply (not a chatbot). Internal data = specific to company = primary (not secondary).`,
  },

  OP: {
    name: "Operations",
    summary: `<strong>~4 questions on ICDC.</strong> Daily business functions: safety, purchasing, inventory, project management.`,
    sections: [
      { h: "Projects (OP:001, OP:002, OP:003)", items: [
        "Projects must <strong>control costs</strong> and deliverables.",
        "Set goals early.",
        "Project budgets should include <strong>reserves for unexpected costs</strong>.",
      ]},
      { h: "Safety (OP:004-OP:010, OP:152)", items: [
        "Spills = clean immediately. Everyone is responsible for safety.",
        "<strong>Follow manufacturer instructions</strong>.",
        "<strong>Preventive maintenance</strong> stops problems before they happen.",
        "Fire: <strong>trigger the alarm</strong> first.",
      ]},
      { h: "Purchasing (OP:015-OP:019, OP:160-OP:190)", items: [
        "Purchase order formally authorizes a buy.",
        "Vendor selection: <strong>testimonials + years of experience</strong>.",
        "<strong>Communicate feedback</strong> to vendors to improve.",
        "Ethical red flag: purchasing employee accepting <strong>gifts from suppliers</strong>.",
        "Competitive bidding needs <strong>many qualified sellers</strong>.",
      ]},
      { h: "Nature of ops (OP:189, OP:191)", items: [
        "Service = <strong>intangible</strong>.",
        "<strong>MRP (Material Requirements Planning)</strong>: software for inventory + production.",
      ]},
      { h: "Quality and process (OP:032, OP:355, OP:519-OP:521)", items: [
        "<strong>Close</strong> out projects properly — evaluate, document.",
        "<strong>Analyze current processes</strong> before changing them.",
        "Cutting corners has negative effects.",
      ]},
      { h: "Costs (OP:024, OP:025)", items: [
        "Fixed costs: postage, taxes, insurance.",
        "Variable costs: payroll scales with volume.",
      ]},
    ],
    traps: `Competitive bidding = SELLERS compete (not buyers bidding up). Robbery response = follow policy, don't resist.`,
  },

  PI: {
    name: "Pricing",
    summary: `<strong>~4 questions on ICDC.</strong> Pricing strategies, ethics, automation, and psychological pricing.`,
    sections: [
      { h: "External factors (PI:001, PI:002)", items: [
        "<strong>Radio</strong>: cheap ad medium — affects promo pricing.",
        "Government regulation = <strong>minimal pricing flexibility</strong> in some industries.",
      ]},
      { h: "Ethics (PI:015)", items: [
        "<strong>Scanner fraud</strong>: charging higher than advertised price at checkout. Unethical.",
      ]},
      { h: "Pricing strategies (PI:017)", items: [
        "<strong>Loss leader</strong>: sell below cost to drive foot traffic; make margin on other items.",
        "<strong>Penetration</strong>: low entry price for share.",
        "<strong>Skimming</strong>: high entry price, lowered over time.",
        "<strong>Price lining</strong>: tiered (good/better/best).",
        "<strong>Odd pricing</strong>: $9.99 vs $10 — psychological.",
        "<strong>Bundle pricing</strong>: multi-item discount.",
      ]},
    ],
    traps: `Loss leader ≠ overall loss — it drives traffic that generates higher-margin sales elsewhere.`,
  },

  PD: {
    name: "Professional Development",
    summary: `<strong>~5 questions on ICDC.</strong> Career planning, interviewing, resume, problem-solving, workplace habits.`,
    sections: [
      { h: "Appearance (PD:002, PD:009)", items: [
        "Interview attire: conservative/professional (dark pantsuit, blouse, low-heel shoes).",
        "Basic hygiene — brush teeth daily.",
      ]},
      { h: "Problem-solving (PD:012, PD:077, PD:126, PD:179)", items: [
        "<strong>Forced association</strong>: combine unrelated ideas to spark new ones.",
        "Before analyzing, <strong>identify the problem</strong>.",
        "Problem-solving is a process.",
        "<strong>Realistic goals through prioritization</strong> = productive.",
      ]},
      { h: "Decision-making (PD:017)", items: [
        "<strong>Routine decisions</strong>: made daily by employees without manager input.",
      ]},
      { h: "Career planning (PD:013, PD:023-PD:025)", items: [
        "<strong>Aptitude</strong>: natural ability.",
        "<strong>Bachelor's degree</strong>: common entry requirement.",
      ]},
      { h: "Job search (PD:026-PD:031)", items: [
        "Research before interview → prepares you to ask good questions.",
        "<strong>Thank-you note</strong>: reminds interviewer of you.",
        "<strong>Customize cover letter</strong> per role.",
        "Resume: <strong>education, work experience, contact info</strong>.",
      ]},
      { h: "Soft skills (PD:032-PD:037)", items: [
        "Show <strong>initiative and commitment</strong>.",
        "<strong>Ongoing education</strong> even for experienced pros.",
        "Networking: connect with people who help your goals.",
      ]},
      { h: "Business mindset (PD:066, PD:252)", items: [
        "A business that exists <strong>just to make money</strong> (no real product/service purpose) is more likely to fail.",
        "Respect the <strong>chain of command</strong>.",
      ]},
    ],
    traps: `Thank-you note's primary purpose = reminds interviewer of the applicant. Ongoing education applies even to experienced workers.`,
  },

  SM: {
    name: "Strategic Management",
    summary: `<strong>0 guaranteed questions on ICDC Marketing</strong> but good to know.`,
    sections: [
      { h: "Management functions (SM:001)", items: [
        "<strong>Planning</strong>, <strong>Organizing</strong>, <strong>Directing</strong>, <strong>Controlling</strong>.",
        "Realistic expectations for workers = directing/leading.",
      ]},
      { h: "Financial KPIs (SM:075)", items: [
        "Revenue, profit, ROI — standard financial metrics.",
      ]},
    ],
    traps: null,
  },
};




// ICDC weights for the Marketing Cluster blueprint (Q's per topic on a real exam).
const ICDC_WEIGHT_TABLE = {
  BL: 1, CM: 7, CO: 3, CR: 1, EC: 4, EI: 6, EN: 0, FI: 4, HR: 0,
  IM: 16, MP: 5, MK: 1, NF: 3, OP: 4, PI: 4, PM: 15, PD: 5, PR: 13,
  SE: 8, SM: 0,
};

// ================================================================
//              CLUSTERS — multi-cluster support
// ================================================================
// Each DECA cluster has its own exam index, study guides, and ICDC blueprint
// weighting. state.cluster selects which set is live; switching reloads the
// matching exam index and re-renders. Exam slugs are unique per cluster, so
// per-user progress / wrong-answer stats stay naturally separated.
// BMA blueprint weighting (≈ questions per 100-question exam), derived from the
// actual instructional-area frequency across the 2017-2026 BMA exams.
const BMA_WEIGHTS = {
  OP: 20, EI: 11, CO: 9, FI: 8, NF: 8, EC: 7, SM: 7, PD: 6,
  PJ: 5, KM: 4, BL: 4, RM: 3, CR: 2, QM: 2, HR: 1, MK: 1, EN: 1,
};
// Hospitality & Tourism blueprint (≈ questions per 100-q exam), from PI-prefix
// frequency across the 2017-2026 H&T exams.
const HT_WEIGHTS = {
  NF: 13, OP: 12, EI: 10, FI: 8, CR: 8, PD: 7, EC: 7, CO: 6, PM: 6, SE: 5,
  BL: 3, PR: 3, SM: 2, HR: 2, MK: 1, MP: 1, PI: 1, EN: 1, QM: 1, RM: 1, IM: 1,
};
// Entrepreneurship blueprint (≈ questions per 100-q exam), from PI frequency
// across the 2018-2026 EP exams.
const EP_WEIGHTS = {
  EN: 14, OP: 13, FI: 9, SM: 7, EI: 6, PR: 6, PD: 6, MP: 5, HR: 5, BL: 4,
  NF: 4, PM: 4, EC: 3, CM: 3, IM: 2, PI: 2, RM: 2, CR: 1, MK: 1, CO: 1, SE: 1, QM: 1,
};
// Finance blueprint (≈ per 100-q exam), from the 2017-2026 Finance exams.
const FIN_WEIGHTS = {
  FI: 21, PD: 11, EI: 9, FM: 7, NF: 6, EC: 6, OP: 6, BL: 6, CO: 6, RM: 5,
  CR: 4, EN: 1, HR: 1, MK: 1, SM: 1,
};
// Personal Financial Literacy blueprint (≈ per 100-q exam), from the 2017-2026 PFL exams.
const PFL_WEIGHTS = {
  FI: 33, PD: 12, BL: 3, EC: 3, CR: 1, SE: 1, EI: 1, OP: 1, EN: 1, SM: 1, NF: 1, PM: 1, HR: 1,
};
const CLUSTERS = {
  marketing: {
    id: "marketing",
    name: "Marketing",
    short: "Marketing",
    indexUrl: "data/index.json",
    blurb: "Marketing Cluster Exam practice",
    get guides() { return TOPIC_GUIDES_V2; },
    get weights() { return ICDC_WEIGHT_TABLE; },
  },
  bma: {
    id: "bma",
    name: "Business Management & Administration",
    short: "Business Mgmt & Admin",
    indexUrl: "data/bma/index.json",
    blurb: "Business Management & Administration Cluster practice",
    get guides() { return window.TOPIC_GUIDES_BMA || {}; },
    get weights() { return BMA_WEIGHTS; },
  },
  ht: {
    id: "ht",
    name: "Hospitality & Tourism",
    short: "Hospitality & Tourism",
    indexUrl: "data/ht/index.json",
    blurb: "Hospitality & Tourism Cluster Exam practice",
    get guides() { return window.TOPIC_GUIDES_HT || {}; },
    get weights() { return HT_WEIGHTS; },
  },
  fin: {
    id: "fin",
    name: "Finance",
    short: "Finance",
    indexUrl: "data/fin/index.json",
    blurb: "Finance Cluster Exam practice",
    get guides() { return window.TOPIC_GUIDES_FIN || {}; },
    get weights() { return FIN_WEIGHTS; },
  },
  ep: {
    id: "ep",
    name: "Entrepreneurship",
    short: "Entrepreneurship",
    indexUrl: "data/ep/index.json",
    blurb: "Entrepreneurship Cluster Exam practice",
    get guides() { return window.TOPIC_GUIDES_EP || {}; },
    get weights() { return EP_WEIGHTS; },
  },
  pfl: {
    id: "pfl",
    name: "Personal Financial Literacy",
    short: "Personal Financial Literacy",
    indexUrl: "data/pfl/index.json",
    blurb: "Personal Financial Literacy Exam practice",
    get guides() { return window.TOPIC_GUIDES_PFL || {}; },
    get weights() { return PFL_WEIGHTS; },
  },
};
const CLUSTER_ORDER = ["marketing", "bma", "fin", "ep", "ht", "pfl"];
function activeClusterId() { return CLUSTERS[state.cluster] ? state.cluster : "marketing"; }
function activeCluster() { return CLUSTERS[activeClusterId()]; }
function activeGuides() { return activeCluster().guides || {}; }
function activeWeights() { return activeCluster().weights || {}; }

function refreshClusterUI() {
  const slot = document.getElementById("cluster-slot");
  if (slot) {
    const cur = activeClusterId();
    slot.innerHTML = `
      <span class="cluster-ico" aria-hidden="true">◆</span>
      <select id="cluster-select" aria-label="Choose DECA cluster">
        ${CLUSTER_ORDER.map(id => `<option value="${id}" ${id === cur ? "selected" : ""}>${escapeHtml(CLUSTERS[id].short)}</option>`).join("")}
      </select>`;
    const sel = document.getElementById("cluster-select");
    if (sel) sel.addEventListener("change", () => switchCluster(sel.value));
  }
  // Reflect the active cluster in the brand subtitle so it's obvious which
  // cluster you're studying.
  const sub = document.querySelector(".brand .sub");
  if (sub) {
    const c = activeCluster();
    const n = (state.index || []).filter(e => e.available !== false && !e._mock).length;
    sub.textContent = `${c.blurb}${n ? ` — ${n} tests` : ""}`;
  }
}

async function switchCluster(id) {
  if (!CLUSTERS[id] || id === state.cluster) return;
  state.cluster = id;
  localStorage.setItem("deca-imce:cluster", id);
  try {
    const res = await fetch(activeCluster().indexUrl, { cache: "no-store" });
    state.index = res.ok ? await res.json() : [];
  } catch { state.index = []; }
  refreshClusterUI();
  // Land on the test list so the switch is immediately visible.
  if (location.hash && location.hash !== "#/" && location.hash !== "#") {
    location.hash = "#/";   // hashchange → render()
  } else {
    render();
  }
}

// ---- One-shot import of a named seed file for a specific user ----
// Maps username -> seed JSON path. The seed is keyed by exam slug:
//   { "sample-exam-1": { "17": { "chosen": "C", "wrong": true, "note": "..." }, ... } }
const SEED_FILES = {
  aryan: "data/seed-aryan.json",
  rohit: "data/seed-rohit.json",
  shreyas: "data/seed-shreyas.json",
};

// One-shot cleanup: wipe the auto-imported rohit-codes manualCodes entries that
// used to come from data/seed-rohit-codes.json. Those codes were never actually
// pasted by the user — they were a helper seed we've since retired. Keep this
// cleanup for a release cycle so existing browsers heal themselves on load.
function cleanupAutoImportedRohitCodes(username) {
  if (username !== "rohit") return;
  const doneKey = `deca-imce:user:rohit:cleanupAutoCodes:v1`;
  if (localStorage.getItem(doneKey)) return;
  try {
    const mcKey = `deca-imce:user:rohit:manualCodes`;
    const flagKeyOld = `deca-imce:user:rohit:seedImported:data/seed-rohit-codes.json`;
    const flagKeyV2 = `deca-imce:user:rohit:seedImported:data/seed-rohit-codes.json:v2`;
    // Only clear if the only entries look like the 10-code auto-seed (no notes, no timestamps).
    const raw = localStorage.getItem(mcKey);
    if (raw) {
      const arr = JSON.parse(raw);
      const looksLikeAutoSeed = Array.isArray(arr) && arr.length <= 12 &&
        arr.every(e => e && typeof e.code === "string" && !e.note && !e.pastedAt);
      if (looksLikeAutoSeed) localStorage.removeItem(mcKey);
    }
    localStorage.removeItem(flagKeyOld);
    localStorage.removeItem(flagKeyV2);
    localStorage.setItem(doneKey, "1");
  } catch {}
}

// One-shot migration for users whose seeded paper-log answers were previously
// written into their `progress:` keys (on-site bucket). Moves those into the
// new `logTest:` bucket so the two sources are cleanly separated.
function migrateSeededProgressToLogTest(username) {
  const doneKey = `deca-imce:user:${username}:migratedSeedV2`;
  if (localStorage.getItem(doneKey)) return;
  const seedPath = SEED_FILES[username];
  if (!seedPath) {
    localStorage.setItem(doneKey, "1");
    return;
  }
  // Fire-and-forget: fetch the seed to know which exam slugs came from it.
  fetch(seedPath, { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(seed => {
    if (!seed) return;
    const slugs = Object.keys(seed);
    for (const slug of slugs) {
      const progK = `deca-imce:user:${username}:progress:${slug}`;
      const logK  = `deca-imce:user:${username}:logTest:${slug}`;
      const rawProg = localStorage.getItem(progK);
      if (!rawProg) continue;
      let prog = {};
      try { prog = JSON.parse(rawProg); } catch { continue; }
      // Move selections into logTest; clear the progress bucket entirely
      // (these were never real site selections).
      const sel = prog.selections || {};
      if (Object.keys(sel).length === 0) continue;
      localStorage.setItem(logK, JSON.stringify({ selections: sel }));
      localStorage.removeItem(progK);
    }
    localStorage.setItem(doneKey, "1");
    console.log(`[migrate] Moved ${slugs.length} seeded exams for ${username} to logTest bucket.`);
    // Re-render so the current page reflects the fix.
    render();
  }).catch(() => {
    localStorage.setItem(doneKey, "1");
  });
}

// Optional extra import files per user (e.g. pre-generated manualCodes arrays).
// Extra seed: 10 inline-annotated PI codes that Rohit flagged as "missed" in
// his paper log notes but weren't already caught by seed-rohit.json (e.g.
// codes from tests where the question numbering didn't align). Loaded as
// manualCodes so they show up in "Starting Point" wrongs.
// Removed: seed-rohit-codes.json was auto-importing 10 PI codes as "manualCodes",
// which made the UI falsely claim Rohit had pasted codes. Those 10 codes are
// already covered by seed-rohit.json entries.
const EXTRA_SEEDS = {};

async function maybeImportSeed(username) {
  const path = SEED_FILES[username];
  if (path) {
    const flagKey = `deca-imce:user:${username}:seedImported:${path}:v8`;
    if (!localStorage.getItem(flagKey)) {
      try {
        const res = await fetch(path, { cache: "no-store" });
        if (res.ok) {
          const seed = await res.json();
          // Clean up logTest entries for slugs that used to be in the seed but
          // were removed (e.g. state-2/state-3 which had no answer keys and
          // were showing misleading 0% scores).
          // state-2 / state-3 were removed site-wide (no answer keys available),
          // so every user's seed should also drop any stale logTest entries for them.
          const GLOBAL_DROPPED = ["state-2", "state-3"];
          const DROPPED_SLUGS = { aryan: [...GLOBAL_DROPPED], rohit: [...GLOBAL_DROPPED], shreyas: [...GLOBAL_DROPPED] };
          for (const slug of (DROPPED_SLUGS[username] || GLOBAL_DROPPED)) {
            localStorage.removeItem(`deca-imce:user:${username}:logTest:${slug}`);
            localStorage.removeItem(`deca-imce:user:${username}:progress:${slug}`);
          }
          for (const [slug, qs] of Object.entries(seed)) {
            // Write to a SEPARATE bucket ("logTest"), not the site's progress bucket.
            const key = `deca-imce:user:${username}:logTest:${slug}`;
            const logTest = { selections: {} };
            for (const [qNum, info] of Object.entries(qs)) {
              if (info && info.chosen) logTest.selections[qNum] = info.chosen;
            }
            localStorage.setItem(key, JSON.stringify(logTest));
          }
          // Clean up any old progress data that the previous seed-loader
          // accidentally wrote before this separation existed.
          Object.keys(localStorage)
            .filter(k => k.startsWith(`deca-imce:user:${username}:progress:`))
            .forEach(k => {
              // Only remove if there's a matching logTest (i.e. seed placed it).
              const slug = k.split(":progress:")[1];
              if (seed[slug]) localStorage.removeItem(k);
            });
          localStorage.setItem(flagKey, String(Date.now()));
          console.log(`[seed] Imported ${Object.keys(seed).length} log-test exams for ${username}`);
        }
      } catch (err) {
        console.warn("[seed] import failed:", err);
      }
    }
  }

  // Extra seeds: manualCodes, etc.
  const extras = EXTRA_SEEDS[username] || [];
  for (const e of extras) {
    const flagKey = `deca-imce:user:${username}:seedImported:${e.path}:v2`;
    if (localStorage.getItem(flagKey)) continue;
    try {
      const res = await fetch(e.path, { cache: "no-store" });
      if (!res.ok) continue;
      const list = await res.json();
      if (e.type === "manualCodes") {
        const existingRaw = localStorage.getItem(`deca-imce:user:${username}:manualCodes`);
        let existing = [];
        try { existing = existingRaw ? JSON.parse(existingRaw) : []; } catch { existing = []; }
        // Simple dedupe on { code } - keep existing + add any not-already-present codes.
        const present = new Set(existing.map(x => x.code));
        for (const item of list) {
          if (!present.has(item.code)) {
            existing.push(item);
            present.add(item.code);
          }
        }
        localStorage.setItem(`deca-imce:user:${username}:manualCodes`, JSON.stringify(existing));
        console.log(`[seed] Loaded ${list.length} manualCodes for ${username}`);
      }
      localStorage.setItem(flagKey, String(Date.now()));
    } catch (err) {
      console.warn("[seed] extra failed:", err);
    }
  }
}

function logout() {
  if (!confirm("Log out? Your data is kept on this browser; you can log back in anytime.")) return;
  localStorage.removeItem("deca-imce:current-user");
  state.user = null;
  refreshAuthUI();
  render();
}

function refreshAuthUI() {
  const slot = document.getElementById("auth-slot");
  if (!state.user) {
    slot.classList.add("nologin");
    slot.innerHTML = `<button id="login-btn" class="nav-btn login">Log in</button>`;
    document.getElementById("login-btn").addEventListener("click", openLoginModal);
  } else {
    slot.classList.remove("nologin");
    const initial = state.user.slice(0, 2);
    // Account actions collapse into a dropdown behind the avatar chip so the
    // top bar stays a single clean row (no wrapping).
    slot.innerHTML = `
      <div class="user-menu">
        <button class="user-chip" id="user-menu-btn" aria-haspopup="true" aria-expanded="false" title="Account">
          <span class="avatar">${escapeHtml(initial)}</span>
          <span class="user-name">${escapeHtml(state.user)}</span>
          <span class="user-caret" aria-hidden="true">▾</span>
        </button>
        <div class="user-menu-pop hidden" id="user-menu-pop" role="menu">
          <button class="user-menu-item" id="change-pass" role="menuitem">Change password</button>
          <button class="user-menu-item" id="switch-user" role="menuitem">Switch user</button>
          <button class="user-menu-item danger" id="logout-btn" role="menuitem">Log out</button>
          <button class="user-menu-item danger" id="delete-acct" role="menuitem">Delete account</button>
        </div>
      </div>
    `;
    const menuBtn = document.getElementById("user-menu-btn");
    const pop = document.getElementById("user-menu-pop");
    const closeMenu = () => { pop.classList.add("hidden"); menuBtn.setAttribute("aria-expanded", "false"); };
    menuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = pop.classList.toggle("hidden");
      menuBtn.setAttribute("aria-expanded", open ? "false" : "true");
    });
    document.addEventListener("click", (e) => {
      if (!pop.classList.contains("hidden") && !e.target.closest(".user-menu")) closeMenu();
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenu(); });
    document.getElementById("change-pass").addEventListener("click", () => { closeMenu(); changePassword(); });
    document.getElementById("switch-user").addEventListener("click", () => { closeMenu(); openLoginModal(); });
    document.getElementById("logout-btn").addEventListener("click", () => { closeMenu(); logout(); });
    document.getElementById("delete-acct").addEventListener("click", () => { closeMenu(); deleteAccount(); });
  }
}

// Permanently delete the signed-in account: every local key for the user, the
// cloud profile doc, and each per-cluster leaderboard entry. Honors the
// deletion right promised in the privacy policy. Irreversible.
async function deleteAccount() {
  const user = state.user;
  if (!user) return;
  const typed = prompt(
    `This permanently deletes the account "${user}" and ALL of its study data — ` +
    `on this device and in the cloud. This cannot be undone.\n\n` +
    `Type your username to confirm:`);
  if (typed == null) return;
  if (typed.trim() !== user) { alert("Name didn't match. Nothing was deleted."); return; }

  // Stop any pending/periodic push from re-creating the profile after we wipe it.
  // _deletedUsers also blocks any push/report already in-flight past its guard.
  _deletedUsers.add(user);
  clearTimeout(_syncState.pushTimer);
  delete _syncState.lastPushed[user];

  // 1) Remove every local key for this user.
  const pfx = PROFILE_KEYS(user);
  const toKill = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(pfx)) toKill.push(k);
  }
  toKill.forEach(k => localStorage.removeItem(k));
  removeKnownUser(user);
  localStorage.removeItem("deca-imce:current-user");
  state.user = null;

  // 2) Remove the cloud profile + every per-cluster leaderboard entry.
  try {
    const backend = await awaitSyncBackend();
    if (backend && backend.ready && backend.deleteProfile) {
      await backend.deleteProfile(user);
      for (const cid of CLUSTER_ORDER) {
        try { await backend.deleteLeaderboardEntry(`${cid}__${user}`); } catch {}
      }
    }
  } catch (e) { console.warn("[delete] cloud delete failed:", e); }

  alert(`Account "${user}" has been deleted.`);
  refreshAuthUI();
  render();
}

function removeKnownUser(name) {
  const list = getKnownUsers().filter(u => u !== name);
  localStorage.setItem("deca-imce:users", JSON.stringify(list));
}

function getKnownUsers() {
  try {
    const raw = localStorage.getItem("deca-imce:users");
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function addKnownUser(name) {
  const list = getKnownUsers();
  if (!list.includes(name)) {
    list.push(name);
    localStorage.setItem("deca-imce:users", JSON.stringify(list));
  }
}

// ================================================================
//                         STORAGE KEYS
// ================================================================

function userScope() { return state.user || "_guest"; }
function progressKey(slug) { return `deca-imce:user:${userScope()}:progress:${slug}`; }
function logTestKey(slug)  { return `deca-imce:user:${userScope()}:logTest:${slug}`; }
function manualCodesKey()   { return `deca-imce:user:${userScope()}:manualCodes`; }

// Defensive load: only ever read manual codes for the CURRENT logged-in user.
// If somehow state.user is null we return an empty list (never cross-read).
function loadManualCodesSafe() {
  if (!state.user) return [];
  return loadManualCodes();
}

// A "log test" = answers imported from a paper/log PDF or text file
// (Aryan's prep log, Rohit's state/ICDC logs). These are NOT site selections —
// they're a separate bucket tracked for stats only. The exam page still reads
// from `progress` for on-site attempts.
function loadLogTest(slug) {
  try {
    const raw = localStorage.getItem(logTestKey(slug));
    return raw ? JSON.parse(raw) : { selections: {} };
  } catch { return { selections: {} }; }
}

function saveProgress() {
  try {
    localStorage.setItem(progressKey(state.currentSlug), JSON.stringify({
      selections: state.selections,
      revealed: state.revealed,
      timestamps: state.timestamps || {},
      gradeAtEnd: !!state.gradeAtEnd,
      submitted: !!state.submitted,
    }));
  } catch { /* quota */ }
}
function loadProgress(slug) {
  try {
    const raw = localStorage.getItem(progressKey(slug));
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function loadManualCodes() {
  try {
    const raw = localStorage.getItem(manualCodesKey());
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function saveManualCodes(list) {
  localStorage.setItem(manualCodesKey(), JSON.stringify(list));
}

// ================================================================
//        COMPLETIONS / ATTEMPTS  (site tests marked "done")
// ================================================================
// A completed attempt = the user finished a site test (either submitted in
// grade-at-end mode, or answered every Q). We archive the attempt to its own
// bucket so: (a) the card shows a "Done ✓" badge + retake button, (b) the
// Stats page can list each attempt separately ("Test 1", "Test 1 (again)").
function attemptsKey(slug) { return `deca-imce:user:${userScope()}:attempts:${slug}`; }
function loadAttempts(slug) {
  try { return JSON.parse(localStorage.getItem(attemptsKey(slug)) || "[]"); } catch { return []; }
}
function saveAttempts(slug, list) {
  localStorage.setItem(attemptsKey(slug), JSON.stringify(list));
}
function archiveAttempt(slug, { mock = false, timedMs = null } = {}) {
  const exam = state.exams[slug];
  if (!exam) return;
  const prog = loadProgress(slug);
  const sel = prog.selections || {};
  if (Object.keys(sel).length === 0) return; // nothing to archive
  const total = exam.questions.length;
  let correct = 0, scored = 0;
  for (const q of exam.questions) {
    const s = sel[q.number];
    if (s && q.answer) { scored++; if (s === q.answer) correct++; }
  }
  const list = loadAttempts(slug);
  list.push({
    at: Date.now(),
    answered: Object.keys(sel).length,
    total, correct, scored,
    selections: sel,
    mock, timedMs,
  });
  saveAttempts(slug, list);
}
function isTestDone(slug) {
  const prog = loadProgress(slug);
  if (prog.submitted) return true;
  const meta = state.index.find(e => e.slug === slug);
  if (!meta || !meta.available) return false;
  const sel = prog.selections || {};
  return Object.keys(sel).length >= meta.question_count;
}

// ================================================================
//                DAILY STREAK  (goal: one topic / day)
// ================================================================
// Topic-of-the-day = user answered >= STREAK_GOAL questions in a single topic
// on that date (Study tab or Exam page). Streak counts consecutive days that
// satisfied the goal.
const STREAK_GOAL = 50;  // Qs in a single topic → "topic of the day" credit
function streakKey() { return `deca-imce:user:${userScope()}:streak`; }
function loadStreak() {
  try {
    const raw = localStorage.getItem(streakKey());
    const d = raw ? JSON.parse(raw) : null;
    return d || { days: {}, current: 0, best: 0, lastActiveDay: null };
  } catch { return { days: {}, current: 0, best: 0, lastActiveDay: null }; }
}
function saveStreak(s) { localStorage.setItem(streakKey(), JSON.stringify(s)); }
function todayKey() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}
// Per-day activity map for the time-windowed leaderboard (today/week/month).
// Key: `deca-imce:user:<u>:activity-days` → { "YYYY-MM-DD": {answered, correct} }
function activityDaysKey() { return `deca-imce:user:${userScope()}:activity-days`; }
function loadActivityDays() {
  try { return JSON.parse(localStorage.getItem(activityDaysKey()) || "{}"); }
  catch { return {}; }
}
function saveActivityDays(m) {
  // Cap at the most recent 90 days so the Firestore doc stays small.
  const keys = Object.keys(m).sort();
  if (keys.length > 90) {
    const trim = {};
    for (const k of keys.slice(-90)) trim[k] = m[k];
    m = trim;
  }
  try { localStorage.setItem(activityDaysKey(), JSON.stringify(m)); } catch {}
}
function recordAnswerActivity(isCorrect) {
  if (!state.user) return;
  const t = todayKey();
  const m = loadActivityDays();
  if (!m[t]) m[t] = { answered: 0, correct: 0 };
  m[t].answered += 1;
  if (isCorrect) m[t].correct += 1;
  saveActivityDays(m);
  // Debounced push so the leaderboard reflects live activity instead of
  // only refreshing when the user navigates to Stats or Leaderboard.
  // Without this, answering 27 questions then opening the leaderboard
  // shows yesterday's counts for the today/week/month windows.
  scheduleLeaderboardPush();
}

// Recompute the user's full leaderboard payload from localStorage and push
// it to Firestore. Debounced (400ms) so rapid answer clicks coalesce into
// one write. Needs `state.exams` to be populated for accurate siteAnswered
// counts — skips the push silently if not (first-load race).
let _lbPushTimer = null;
function scheduleLeaderboardPush() {
  if (_lbPushTimer) clearTimeout(_lbPushTimer);
  _lbPushTimer = setTimeout(() => {
    _lbPushTimer = null;
    _pushLeaderboardFromLocal();
  }, 400);
}
async function _pushLeaderboardFromLocal() {
  try {
    if (!state.user || !state.index) return;
    let siteAnswered = 0, siteCorrect = 0, logAnswered = 0, logCorrect = 0, fixedFromLog = 0;
    for (const meta of state.index) {
      if (!meta.available) continue;
      const exam = state.exams && state.exams[meta.slug];
      if (!exam) continue;
      const siteSel = (loadProgress(meta.slug).selections) || {};
      const logSel  = (loadLogTest(meta.slug).selections)  || {};
      for (const q of exam.questions) {
        const sChosen = siteSel[q.number];
        if (sChosen && q.answer) {
          siteAnswered++;
          if (sChosen === q.answer) siteCorrect++;
        }
        const lChosen = logSel[q.number];
        if (lChosen && q.answer) {
          logAnswered++;
          if (lChosen === q.answer) logCorrect++;
          if (lChosen !== q.answer && sChosen && sChosen === q.answer) fixedFromLog++;
        }
      }
    }
    const testsCompleted = (() => {
      try { return JSON.parse(localStorage.getItem(`deca-imce:user:${state.user}:testsCompleted`) || "[]"); }
      catch { return []; }
    })();
    const streakInfo = (typeof loadStreak === "function") ? loadStreak() : null;
    const payload = computeLeaderboardPayload({
      siteAnswered, siteCorrect, logAnswered, logCorrect,
      testsCompletedCount: (testsCompleted && testsCompleted.length) || 0,
      wrongsFixed: fixedFromLog,
      streakCurrent: streakInfo && streakInfo.current ? streakInfo.current : 0,
    });
    await reportLeaderboard(payload);
  } catch (e) { /* silent — best-effort live push */ }
}

// Call when the user answers a question on any site page (exam or study).
function recordStreakActivity(topicPrefix) {
  if (!state.user) return;
  const s = loadStreak();
  const t = todayKey();
  if (!s.days[t]) s.days[t] = { byTopic: {}, completedTopics: [] };
  const day = s.days[t];
  if (topicPrefix) {
    day.byTopic[topicPrefix] = (day.byTopic[topicPrefix] || 0) + 1;
    if (day.byTopic[topicPrefix] >= STREAK_GOAL &&
        !day.completedTopics.includes(topicPrefix)) {
      day.completedTopics.push(topicPrefix);
      // Topic goal met today → refresh streak.
      recomputeStreak(s);
    }
  }
  saveStreak(s);
}
function dayMet(day) { return day && day.completedTopics && day.completedTopics.length > 0; }
function recomputeStreak(s) {
  // Count consecutive days ending today (or yesterday) that met the goal.
  const days = s.days;
  let cur = 0, best = s.best || 0;
  const now = new Date();
  // Start from today; if today didn't meet yet, walk back from yesterday.
  let cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const iso = d => d.toISOString().slice(0, 10);
  if (!dayMet(days[iso(cursor)])) cursor.setDate(cursor.getDate() - 1);
  while (dayMet(days[iso(cursor)])) {
    cur++;
    cursor.setDate(cursor.getDate() - 1);
  }
  // Best = rolling max
  let run = 0, maxRun = 0;
  const allDates = Object.keys(days).sort();
  for (const d of allDates) {
    if (dayMet(days[d])) { run++; if (run > maxRun) maxRun = run; }
    else run = 0;
  }
  s.current = cur;
  s.best = Math.max(best, maxRun);
  s.lastActiveDay = iso(now);
}
function streakBadgeHtml() {
  if (!state.user) return "";
  const s = loadStreak();
  const t = todayKey();
  const todayDay = s.days[t];
  const todayMet = dayMet(todayDay);
  const flame = todayMet ? "🔥" : "·";
  return `<span class="streak-pill ${todayMet ? "active" : ""}" title="Daily streak — finish a topic (${STREAK_GOAL} Qs) to earn today's day">
    <span class="streak-flame">${flame}</span>
    <span class="streak-num">${s.current}</span>
    <span class="streak-label">day${s.current === 1 ? "" : "s"}</span>
  </span>`;
}
function refreshStreakUI() {
  const slot = document.getElementById("streak-slot");
  if (slot) slot.innerHTML = streakBadgeHtml();
  refreshCountdownUI();
}

// --------- ICDC 2027 countdown ---------
// Next DECA ICDC runs Apr 17–20, 2027 in Anaheim, CA. The Marketing Cluster Exam
// (IMCE) is typically administered the Sunday morning of competition. We target
// Sun Apr 18, 2027 at 8:00 AM Pacific (15:00 UTC) as the exam moment.
// If the published schedule differs, update ICDC_EXAM_ISO below.
const ICDC_EXAM_ISO = "2027-04-18T15:00:00Z"; // 8:00 AM PDT, Anaheim
function countdownParts() {
  const target = new Date(ICDC_EXAM_ISO).getTime();
  const diff = target - Date.now();
  if (diff <= 0) return { done: true };
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return { done: false, d, h, m };
}
function countdownBadgeHtml() {
  const p = countdownParts();
  const title = "Countdown to DECA ICDC 2027 — Marketing Cluster Exam, Sun Apr 18 2027, Anaheim, CA";
  if (p.done) {
    return `<a href="#/countdown" class="icdc-pill" title="${title}">
      <span class="icdc-ico">🏆</span>
      <span class="icdc-txt">ICDC — good luck!</span>
    </a>`;
  }
  const urgent = p.d <= 7 ? "urgent" : "";
  // Days-based label (not a live-ticking clock); the full /countdown page has H:M:S.
  const label = p.d >= 1
    ? `ICDC 2027 in <strong>${p.d} ${p.d === 1 ? "day" : "days"}</strong>`
    : `ICDC <strong>${p.h}h ${p.m}m</strong> away`;
  return `<a href="#/countdown" class="icdc-pill ${urgent}" title="${title}">
    <span class="icdc-ico">⏳</span>
    <span class="icdc-txt">${label}</span>
  </a>`;
}
function refreshCountdownUI() {
  const slot = document.getElementById("countdown-slot");
  if (slot) slot.innerHTML = countdownBadgeHtml();
}

// Full-page countdown view. Big ticking digits (D / H / M / S) + animated
// skyblue grid (ported from the 21st.dev counter-loader).
let _countdownTickId = null;
function renderCountdown() {
  const app = document.getElementById("app");
  const render = () => {
    const target = new Date(ICDC_EXAM_ISO).getTime();
    const diff = target - Date.now();
    if (diff <= 0) {
      return {
        done: true, d: 0, h: 0, m: 0, s: 0,
      };
    }
    return {
      done: false,
      d: Math.floor(diff / 86400000),
      h: Math.floor((diff % 86400000) / 3600000),
      m: Math.floor((diff % 3600000) / 60000),
      s: Math.floor((diff % 60000) / 1000),
    };
  };
  const pad = (n) => String(n).padStart(2, "0");

  const initial = render();
  app.innerHTML = `
    <div class="countdown-page">
      <div class="countdown-bg" aria-hidden="true">
        <div class="cd-orb cd-orb-1"></div>
        <div class="cd-orb cd-orb-2"></div>
        <div class="cd-orb cd-orb-3"></div>
      </div>
      <div class="countdown-inner">
        <div class="countdown-eyebrow">
          <span class="cd-dot"></span>
          <span>DECA ICDC 2027 · Anaheim, CA</span>
        </div>
        <h1 class="countdown-title">
          ${initial.done ? "It's go time." : "Marketing Cluster Exam in"}
        </h1>
        <div class="countdown-grid">
          <div class="cd-unit"><div class="cd-num" id="cd-d">${initial.d}</div><div class="cd-lbl">days</div></div>
          <div class="cd-sep">:</div>
          <div class="cd-unit"><div class="cd-num" id="cd-h">${pad(initial.h)}</div><div class="cd-lbl">hours</div></div>
          <div class="cd-sep">:</div>
          <div class="cd-unit"><div class="cd-num" id="cd-m">${pad(initial.m)}</div><div class="cd-lbl">minutes</div></div>
          <div class="cd-sep">:</div>
          <div class="cd-unit"><div class="cd-num cd-num-seconds" id="cd-s">${pad(initial.s)}</div><div class="cd-lbl">seconds</div></div>
        </div>
        <div class="countdown-target">
          Target: Sun, Apr 18 2027 · 8:00 AM PDT
        </div>
        <div class="word-loader" aria-hidden="true">
          <div class="wl-grid" id="wl-grid"></div>
        </div>
        <div class="countdown-cta-row">
          <a href="#/" class="btn primary">Back to tests</a>
          <a href="#/study" class="btn ghost">Study now</a>
        </div>
      </div>
    </div>
  `;

  if (_countdownTickId) clearInterval(_countdownTickId);
  _countdownTickId = setInterval(() => {
    // If user navigated away, stop ticking.
    if (!document.querySelector(".countdown-page")) {
      clearInterval(_countdownTickId);
      _countdownTickId = null;
      return;
    }
    const p = render();
    const dEl = document.getElementById("cd-d");
    const hEl = document.getElementById("cd-h");
    const mEl = document.getElementById("cd-m");
    const sEl = document.getElementById("cd-s");
    if (dEl) dEl.textContent = p.d;
    if (hEl) hEl.textContent = pad(p.h);
    if (mEl) mEl.textContent = pad(p.m);
    if (sEl) {
      sEl.textContent = pad(p.s);
      // Pulse the seconds cell every tick.
      sEl.classList.remove("cd-tick");
      void sEl.offsetWidth;
      sEl.classList.add("cd-tick");
    }
  }, 1000);

  // Kick off the DECA ↔ ICDC word-morph loader.
  startWordLoader();
}

// ================================================================
//   Word-morph loader: cycles DECA → ICDC → DECA using a 3×5
//   pixel font in a shared grid. Each letter is 3 cols wide with
//   a 1-col gap, so a 4-letter word occupies 15 cols × 5 rows.
//   Cells fade in/out via CSS transition when their on/off class
//   flips each frame.
// ================================================================
const WL_FONT = {
  D: ["110", "101", "101", "101", "110"],
  E: ["111", "100", "110", "100", "111"],
  C: ["111", "100", "100", "100", "111"],
  A: ["010", "101", "111", "101", "101"],
  I: ["111", "010", "010", "010", "111"],
};
const WL_WORDS = ["DECA", "ICDC"];
const WL_ROWS = 5;
const WL_LETTER_W = 3;
const WL_GAP = 1;
let _wlTickId = null;
let _wlIdx = 0;

function wordToGrid(word) {
  // Returns a flat array of "1"/"0" strings, left-to-right, top-to-bottom.
  const cols = word.length * WL_LETTER_W + (word.length - 1) * WL_GAP;
  const out = new Array(cols * WL_ROWS).fill("0");
  for (let li = 0; li < word.length; li++) {
    const glyph = WL_FONT[word[li]];
    if (!glyph) continue;
    const colOffset = li * (WL_LETTER_W + WL_GAP);
    for (let r = 0; r < WL_ROWS; r++) {
      for (let c = 0; c < WL_LETTER_W; c++) {
        if (glyph[r][c] === "1") {
          out[r * cols + (colOffset + c)] = "1";
        }
      }
    }
  }
  return { cells: out, cols };
}

function startWordLoader() {
  const host = document.getElementById("wl-grid");
  if (!host) return;
  // Build cells on first word so grid size is right.
  const first = wordToGrid(WL_WORDS[0]);
  host.style.setProperty("--wl-cols", String(first.cols));
  host.innerHTML = first.cells
    .map((v, i) => `<span class="wl-cell ${v === "1" ? "on" : ""}" data-i="${i}"></span>`)
    .join("");
  _wlIdx = 0;
  if (_wlTickId) clearInterval(_wlTickId);
  // 1.8s per word — long enough to read, short enough to feel alive.
  _wlTickId = setInterval(() => {
    if (!document.querySelector(".countdown-page")) {
      clearInterval(_wlTickId);
      _wlTickId = null;
      return;
    }
    _wlIdx = (_wlIdx + 1) % WL_WORDS.length;
    const frame = wordToGrid(WL_WORDS[_wlIdx]);
    const cells = host.querySelectorAll(".wl-cell");
    // If column count changed (not today, but future-proof), rebuild.
    if (cells.length !== frame.cells.length) {
      host.style.setProperty("--wl-cols", String(frame.cols));
      host.innerHTML = frame.cells
        .map((v, i) => `<span class="wl-cell ${v === "1" ? "on" : ""}" data-i="${i}"></span>`)
        .join("");
      return;
    }
    // Stagger the on/off flip by column so the letters feel like they
    // "sweep" into the next word instead of snapping all at once.
    cells.forEach((el, i) => {
      const col = i % frame.cols;
      const on = frame.cells[i] === "1";
      const delay = col * 35;
      setTimeout(() => el.classList.toggle("on", on), delay);
    });
  }, 1800);
}
// Tick the countdown once a minute so the UI stays fresh without spamming.
setInterval(() => { refreshCountdownUI(); }, 60000);

// Panel for stats page: current streak, best, and last-30-days heatmap.
function streakPanelHtml() {
  if (!state.user) return "";
  const s = loadStreak();
  const today = new Date();
  const days = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const day = s.days[key];
    const qs = day ? Object.values(day.byTopic || {}).reduce((a, b) => a + b, 0) : 0;
    const completed = dayMet(day);
    days.push({ key, qs, completed, day: d.getDate() });
  }
  const todayKeyStr = todayKey();
  const todayDay = s.days[todayKeyStr];
  const todayQs = todayDay ? Object.values(todayDay.byTopic || {}).reduce((a, b) => a + b, 0) : 0;
  const topTopic = todayDay ? Object.entries(todayDay.byTopic || {})
      .sort((a, b) => b[1] - a[1])[0] : null;
  const prog = topTopic ? Math.min(100, Math.round(topTopic[1] / STREAK_GOAL * 100)) : 0;
  const todayDone = dayMet(todayDay);
  return `
    <section class="panel streak-panel">
      <div class="streak-head">
        <div>
          <h3 style="margin:0">Daily Streak</h3>
          <p class="panel-sub" style="margin:4px 0 0">Goal: answer ${STREAK_GOAL} questions in a single topic each day.</p>
        </div>
        <div class="streak-stats">
          <div><span class="streak-big">${s.current}</span><span class="streak-sub">current</span></div>
          <div><span class="streak-big">${s.best}</span><span class="streak-sub">best</span></div>
          <div title="Questions answered today toward the daily goal"><span class="streak-big" style="color:${prog>=100?'var(--good)':'var(--red-light)'}">${todayQs}</span><span class="streak-sub">today</span></div>
        </div>
      </div>
      <div class="streak-today">
        ${todayDone
          ? `<div class="streak-today-done">🔥 Today's topic complete — ${todayQs} Qs answered. Come back tomorrow to extend the streak.</div>`
          : topTopic
            ? `<div class="streak-today-prog">
                <div class="streak-prog-text">Closest topic today: <strong>${TOPICS[topTopic[0]] || topTopic[0]}</strong> — ${topTopic[1]} / ${STREAK_GOAL} Qs</div>
                <div class="streak-prog-bar"><span style="width:${prog}%"></span></div>
              </div>`
            : `<div class="streak-today-empty">No questions answered today yet. <a href="#/study">Start studying →</a></div>`}
      </div>
      <div class="streak-heatmap" title="Last 30 days — filled = goal met">
        ${days.map(d => `<span class="hm-cell ${d.completed ? "met" : d.qs > 0 ? "partial" : ""}"
          title="${d.key} · ${d.qs} Qs ${d.completed ? "· goal met" : ""}"></span>`).join("")}
      </div>
    </section>
  `;
}

// ================================================================
//                   MOCK EXAM   (100 Qs, timed)
// ================================================================
// Picks N random answer-keyed questions from across all available exams,
// builds a synthetic exam object, and plays it through the normal exam
// renderer with a countdown timer + forced grade-at-end.
const MOCK_Q_COUNT = 100;
const MOCK_MINUTES = 100;

function mockKey() { return `deca-imce:user:${userScope()}:mockCurrent`; }
function saveMockSnapshot(obj) { localStorage.setItem(mockKey(), JSON.stringify(obj)); }
function loadMockSnapshot() {
  try { return JSON.parse(localStorage.getItem(mockKey()) || "null"); }
  catch { return null; }
}
function clearMockSnapshot() { localStorage.removeItem(mockKey()); }

async function startNewMock() {
  // Ensure all exams are cached so we can sample.
  const available = state.index.filter(e => e.available);
  await Promise.all(available.map(e => getExam(e.slug).catch(() => null)));
  // Pool of questions that have answer keys.
  const pool = [];
  for (const meta of available) {
    const ex = state.exams[meta.slug];
    if (!ex) continue;
    for (const q of ex.questions) {
      if (q.answer) pool.push({ slug: meta.slug, title: meta.title, q });
    }
  }
  if (pool.length < 10) {
    alert("Not enough questions to run a mock exam yet.");
    return;
  }
  // Shuffle-pick
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const picked = pool.slice(0, Math.min(MOCK_Q_COUNT, pool.length));
  const slug = `_mock_${Date.now()}`;
  // Synthesize an exam: re-number 1..N, keep original source + code.
  const questions = picked.map((item, idx) => ({
    number: idx + 1,
    question: item.q.question,
    options: { ...item.q.options },
    answer: item.q.answer,
    explanation: item.q.explanation,
    sources: item.q.sources || [],
    code: item.q.code,
    topic: item.q.topic,
    // Trace back to origin exam so stats can still bucket by PI.
    _origin: { slug: item.slug, title: item.title, number: item.q.number },
  }));
  const fakeExam = { slug, questions, title: `Mock Exam · ${picked.length} Qs · ${MOCK_MINUTES} min` };
  state.exams[slug] = fakeExam;
  // Add to the in-memory index so the exam view can look up meta.
  state.index = state.index.filter(e => !e.slug.startsWith("_mock_") || e.slug === slug);
  state.index.push({
    slug, available: true, title: fakeExam.title,
    question_count: questions.length,
    answered_count: questions.length,
    json: null, _mock: true,
  });
  // Persist a snapshot so refreshing the tab keeps the mock alive.
  saveMockSnapshot({
    slug, title: fakeExam.title, questions,
    startedAt: Date.now(),
    endsAt: Date.now() + MOCK_MINUTES * 60 * 1000,
  });
  // Force grade-at-end mode for the mock.
  localStorage.setItem(progressKey(slug), JSON.stringify({
    selections: {}, revealed: {}, gradeAtEnd: true, submitted: false,
    mock: true, endsAt: Date.now() + MOCK_MINUTES * 60 * 1000,
  }));
  location.hash = `#/exam/${slug}`;
}

// On boot: if a mock snapshot exists, restore the synthetic exam into memory
// so /exam/_mock_<ts> works across reloads until the user finishes or aborts.
function restoreMockIfPresent() {
  const snap = loadMockSnapshot();
  if (!snap) return;
  state.exams[snap.slug] = { slug: snap.slug, title: snap.title, questions: snap.questions };
  if (!state.index.find(e => e.slug === snap.slug)) {
    state.index.push({
      slug: snap.slug, available: true, title: snap.title,
      question_count: snap.questions.length,
      answered_count: snap.questions.length,
      json: null, _mock: true,
    });
  }
}

// ================================================================
//                       WELCOME / INTRO PAGE
// ================================================================
// Cinematic first-visit landing page. Inspired by a React/GSAP hero but
// implemented in vanilla HTML/CSS/JS to match this project's stack.

function renderWelcome() {
  document.body.classList.add("welcome-active");
  // Remove any existing welcome root (re-renders)
  const existing = document.getElementById("welcome-root");
  if (existing) existing.remove();

  const root = document.createElement("div");
  root.id = "welcome-root";
  root.className = "welcome-root";
  root.innerHTML = `
    <div class="welcome-grid" aria-hidden="true"></div>
    <div class="welcome-spotlight" aria-hidden="true"></div>
    <button class="welcome-skip" id="welcome-skip">Skip intro →</button>
    <div class="welcome-inner">
      <div class="welcome-eyebrow">
        <span class="dot"></span>
        ClusterPrep · Marketing Cluster Exam prep
      </div>
      <h1 class="welcome-title">
        <span class="accent">Ready to take</span><br />
        <span class="red">1st place</span><br />
        <span class="accent">at DECA ICDC?</span>
      </h1>
      <p class="welcome-sub">
        38 practice tests. ~3,800 real questions. Comprehensive topic guides.
        Per-user stats that show every question you got wrong and every one
        you've fixed. Start studying now — the test is sooner than you think.
      </p>
      <div class="welcome-ctas">
        <button class="welcome-btn primary" id="welcome-start">
          Start studying
          <span aria-hidden="true">→</span>
        </button>
        <button class="welcome-btn secondary" id="welcome-login">
          Log in to my profile
        </button>
      </div>
      <div class="welcome-stats">
        <div class="welcome-stat">
          <div class="v">38</div>
          <div class="l">Practice tests</div>
        </div>
        <div class="welcome-stat">
          <div class="v">~3,800</div>
          <div class="l">Questions</div>
        </div>
        <div class="welcome-stat">
          <div class="v">20</div>
          <div class="l">Topic guides</div>
        </div>
        <div class="welcome-stat">
          <div class="v">100%</div>
          <div class="l">Per-user stats</div>
        </div>
      </div>
    </div>
    <div class="welcome-scroll-hint">Marketing Cluster · 2026</div>
  `;
  document.body.appendChild(root);

  const dismiss = () => {
    localStorage.setItem("deca-imce:welcomed", "1");
    document.body.classList.remove("welcome-active");
    root.remove();
  };
  document.getElementById("welcome-skip").addEventListener("click", () => {
    dismiss();
    location.hash = "#/";
  });
  document.getElementById("welcome-start").addEventListener("click", () => {
    dismiss();
    location.hash = "#/";
  });
  document.getElementById("welcome-login").addEventListener("click", () => {
    dismiss();
    location.hash = "#/";
    openLoginModal();
  });
}

// ================================================================
//                          HOME
// ================================================================

// Sort exams newest-first: year-stamped exams (e.g. "bma-2026", "Marketing
// 2024 ICDC") descending by year on top, then undated sample exams below
// (ascending by exam number).
function examYear(e) {
  const m = String(`${e.slug} ${e.title || ""}`).match(/(20\d{2})/);
  return m ? parseInt(m[1], 10) : 0;
}
function examNum(e) {
  const m = String(e.title || e.slug).match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}
function byRecency(a, b) {
  const ya = examYear(a), yb = examYear(b);
  if (ya !== yb) return yb - ya;
  return examNum(a) - examNum(b) || String(a.title || "").localeCompare(String(b.title || ""));
}

function renderHome() {
  state.currentExam = null;
  state.currentSlug = null;

  const totalQs = state.index.reduce((n, e) => n + (e.available ? e.question_count : 0), 0);
  const totalExams = state.index.filter(e => e.available).length;

  // Only show real, available exams on home — hide mock slugs and any
  // unavailable parses (e.g. PNG-only exams that never parsed cleanly).
  const realIndex = state.index.filter(e => !e._mock && e.available !== false).sort(byRecency);
  const mockSnap = loadMockSnapshot();
  const mockBanner = mockSnap ? `
    <div class="mock-banner">
      <div>
        <strong>Mock exam in progress</strong>
        <span class="mock-sub">${mockSnap.questions.length} Qs · ${MOCK_MINUTES} min · started ${new Date(mockSnap.startedAt).toLocaleTimeString()}</span>
      </div>
      <div style="display:flex;gap:8px">
        <a class="btn primary small" href="#/exam/${mockSnap.slug}">Resume →</a>
        <button class="btn ghost small" id="mock-abort">Abort</button>
      </div>
    </div>` : "";
  app.innerHTML = `
    ${loginBannerIfNeeded()}
    ${mockBanner}
    <section>
      <div class="home-head">
        <div>
          <h2>All Practice Tests</h2>
          <p class="hint">${totalExams} tests &bull; ${totalQs.toLocaleString()} questions &bull; tap a card to start</p>
        </div>
        <div class="home-head-actions">
          <button class="btn primary" id="mock-start">
            <span style="font-size:1.1em;margin-right:6px">⏱</span>
            Mock Exam · ${MOCK_Q_COUNT} Q / ${MOCK_MINUTES} min
          </button>
        </div>
      </div>
      <div class="filter-row">
        <input id="search" type="search" placeholder="Search tests (e.g. '12', 'Exam 7')" autocomplete="off" />
      </div>
      <div class="grid" id="grid">
        ${realIndex.map(cardHtml).join("")}
      </div>
    </section>
  `;
  wireBannerButtons();
  const mockStart = document.getElementById("mock-start");
  if (mockStart) mockStart.addEventListener("click", async () => {
    if (!state.user) { openLoginModal(); return; }
    if (mockSnap && !confirm("You have a mock in progress. Start a NEW one (this will abandon the old)?")) return;
    if (mockSnap) clearMockSnapshot();
    mockStart.disabled = true;
    mockStart.textContent = "Picking questions…";
    await startNewMock();
  });
  const mockAbort = document.getElementById("mock-abort");
  if (mockAbort) mockAbort.addEventListener("click", () => {
    if (!confirm("Abandon mock exam? Your selections will be lost.")) return;
    localStorage.removeItem(progressKey(mockSnap.slug));
    clearMockSnapshot();
    state.index = state.index.filter(e => e.slug !== mockSnap.slug);
    delete state.exams[mockSnap.slug];
    renderHome();
  });

  const search = document.getElementById("search");
  const grid = document.getElementById("grid");
  search.addEventListener("input", () => {
    const q = search.value.trim().toLowerCase();
    const filtered = state.index.filter(e =>
      e.title.toLowerCase().includes(q) || e.slug.includes(q)
    ).sort(byRecency);
    grid.innerHTML = filtered.map(cardHtml).join("") ||
      `<div class="empty">No tests match "${escapeHtml(q)}"</div>`;
    bindCardClicks();
  });

  bindCardClicks();
}

function loginBannerIfNeeded() {
  if (state.user) return "";
  return `
    <div class="banner">
      <div>You're browsing as a guest — <strong>your progress and stats won't be saved.</strong> Log in or create a free account to keep your work across devices.</div>
      <button class="btn primary small" id="banner-login">Log in</button>
    </div>
  `;
}
function wireBannerButtons() {
  const b = document.getElementById("banner-login");
  if (b) b.addEventListener("click", openLoginModal);
}

function cardHtml(e) {
  const badge = e.available
    ? `<span class="badge">${e.question_count} Qs</span>`
    : `<span class="badge warn">Unavailable</span>`;

  // Per-user progress snapshot + completion badge.
  let extra = "";
  let doneRibbon = "";
  let resetBtn = "";
  const attempts = e.available ? loadAttempts(e.slug) : [];
  const done = e.available && isTestDone(e.slug);
  if (e.available) {
    const prog = loadProgress(e.slug);
    const sel = prog.selections || {};
    const answered = Object.keys(sel).length;
    const attemptsCount = attempts.length;
    if (done) {
      const pcts = attempts
        .filter(a => a.scored)
        .map(a => Math.round((a.correct / a.scored) * 100));
      const bestPct = pcts.length ? Math.max(...pcts) : null;
      doneRibbon = `<span class="done-ribbon" title="You've completed this test">✓ Done${attemptsCount ? ` · ${attemptsCount + 1}×` : ""}</span>`;
      extra = `<div class="card-stats">
        ${bestPct != null ? `<span class="pill done">Best: ${bestPct}%</span>` : `<span class="pill done">Completed</span>`}
      </div>`;
      resetBtn = `<button class="card-reset" data-slug="${e.slug}" title="Clear and retake — prior attempt saved to stats">Retake</button>`;
    } else if (answered > 0) {
      extra = `<div class="card-stats">
        <span class="pill">${answered}/${e.question_count} answered</span>
      </div>`;
    } else if (attemptsCount > 0) {
      doneRibbon = `<span class="done-ribbon" title="You've completed this test">✓ Done · ${attemptsCount}×</span>`;
      resetBtn = `<button class="card-reset" data-slug="${e.slug}" title="Start a fresh attempt">Retake</button>`;
    }
  }

  return `
    <div class="card ${e.available ? "" : "disabled"} ${done ? "completed" : ""}" data-slug="${e.slug}">
      ${badge}
      ${doneRibbon}
      <div class="title">${escapeHtml(e.title)}</div>
      <div class="meta">${e.available
        ? `${e.answered_count} / ${e.question_count} with answer key`
        : "Image-based PDF &mdash; needs OCR to extract"}</div>
      ${extra}
      ${resetBtn}
    </div>
  `;
}

function bindCardClicks() {
  document.querySelectorAll(".card").forEach(el => {
    el.addEventListener("click", (ev) => {
      // Let the Retake button have its own handler.
      if (ev.target.closest(".card-reset")) return;
      if (el.classList.contains("disabled")) return;
      const slug = el.getAttribute("data-slug");
      location.hash = `#/exam/${slug}`;
    });
  });
  document.querySelectorAll(".card-reset").forEach(btn => {
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const slug = btn.getAttribute("data-slug");
      const meta = state.index.find(e => e.slug === slug);
      if (!confirm(`Retake "${meta ? meta.title : slug}"? Your current attempt will be archived to Stats → Tests completed (shown as "(again)").`)) return;
      // Archive current progress (if any) then clear progress so fresh start.
      archiveAttempt(slug);
      localStorage.removeItem(progressKey(slug));
      renderHome();
    });
  });
}

// ================================================================
//                          EXAM VIEW
// ================================================================

async function renderExam(slug, scrollToQ) {
  app.innerHTML = `<div class="empty">Loading…</div>`;

  const meta = state.index.find(e => e.slug === slug);
  if (!meta) {
    app.innerHTML = `<div class="empty"><h2>Unknown test</h2>
      <p><a href="#/">Back to all tests</a></p></div>`;
    return;
  }

  try {
    const exam = await getExam(slug);
    state.currentExam = exam;
    state.currentSlug = slug;
    const prog = loadProgress(slug);
    state.selections = prog.selections || {};
    state.revealed = prog.revealed || {};
    state.timestamps = prog.timestamps || {};
    state.revealAll = false;
    // Grade-at-end mode: if enabled, hide per-Q feedback until the user submits.
    state.gradeAtEnd = !!prog.gradeAtEnd;
    state.submitted = !!prog.submitted;
  } catch (err) {
    app.innerHTML = `<div class="empty"><h2>Couldn't load exam</h2>
      <p>${escapeHtml(err.message)}</p>
      <p><a href="#/">Back to all tests</a></p></div>`;
    return;
  }

  drawExam(meta);

  if (scrollToQ) {
    const target = document.getElementById(`q-${scrollToQ}`);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      target.style.boxShadow = "0 0 0 3px rgba(11,61,145,.35)";
      setTimeout(() => { target.style.boxShadow = ""; }, 1500);
    }
  }
}

async function getExam(slug) {
  if (state.exams[slug]) return state.exams[slug];
  const meta = state.index.find(e => e.slug === slug);
  if (!meta) throw new Error("unknown exam");
  const res = await fetch(meta.json, { cache: "no-store" });
  if (!res.ok) throw new Error(res.statusText);
  const data = await res.json();
  // Pre-compute code for each question.
  for (const q of data.questions) {
    q.code = extractCode(q.sources || []);
    q.topic = q.code ? TOPICS[q.code.split(":")[0]] || null : null;
  }
  state.exams[slug] = data;
  return data;
}

// ---- Cross-cluster same-code practice (opt-in) ----
// Load + cache an exam by its index meta (works for ANY cluster, since the
// meta carries its own `json` path). Slugs are unique across clusters, so the
// shared state.exams cache is safe.
async function getExamByMeta(meta) {
  if (state.exams[meta.slug]) return state.exams[meta.slug];
  const res = await fetch(meta.json, { cache: "no-store" });
  if (!res.ok) throw new Error(res.statusText);
  const data = await res.json();
  for (const q of data.questions) {
    q.code = extractCode(q.sources || []);
    q.topic = q.code ? TOPICS[q.code.split(":")[0]] || null : null;
  }
  state.exams[meta.slug] = data;
  return data;
}

// Lazy-load (and cache) every cluster's exam index.
async function loadAllClusterIndexes() {
  if (state._allClusterIndex) return state._allClusterIndex;
  const out = {};
  await Promise.all(CLUSTER_ORDER.map(async (cid) => {
    try {
      const r = await fetch(CLUSTERS[cid].indexUrl, { cache: "no-store" });
      out[cid] = r.ok ? await r.json() : [];
    } catch { out[cid] = []; }
  }));
  state._allClusterIndex = out;
  return out;
}

// Gather same-PI-code questions from OTHER clusters, deduped against the
// caller's `seenStems` set (so identical bank items don't repeat). Skips any
// cluster whose blueprint doesn't list this prefix (avoids loading exams that
// can't contain it). Each result is tagged with its source cluster.
async function crossClusterSameCode(prefix, seenStems) {
  const idx = await loadAllClusterIndexes();
  const active = activeClusterId();
  const out = [];
  for (const cid of CLUSTER_ORDER) {
    if (cid === active) continue;
    const weights = CLUSTERS[cid].weights || {};
    if (!(prefix in weights)) continue; // this cluster has no questions of this code
    for (const meta of (idx[cid] || [])) {
      if (meta.available === false) continue;
      let exam;
      try { exam = await getExamByMeta(meta); } catch { continue; }
      for (const q of exam.questions) {
        const p = q.code ? q.code.split(":")[0] : null;
        if (p !== prefix) continue;
        const key = (q.question || "").toLowerCase().replace(/\s+/g, " ").trim();
        if (!key || seenStems.has(key)) continue;
        seenStems.add(key);
        out.push({ slug: meta.slug, title: meta.title, number: q.number, code: q.code, cluster: cid });
      }
    }
  }
  return out;
}

function isMockSlug(slug) { return typeof slug === "string" && slug.startsWith("_mock_"); }

function drawExam(meta) {
  // Clear any lingering mock timer before re-rendering.
  if (state._mockTimer) { clearInterval(state._mockTimer); state._mockTimer = null; }
  const exam = state.currentExam;
  const answered = Object.keys(state.selections).length;
  const total = exam.questions.length;
  const correct = exam.questions.reduce((n, q) => {
    const sel = state.selections[q.number];
    return sel && q.answer && sel === q.answer ? n + 1 : n;
  }, 0);
  const scoredCount = exam.questions.filter(q =>
    state.selections[q.number] && q.answer).length;

  const allAnswered = answered >= total;
  const gradingGated = state.gradeAtEnd && !state.submitted;
  const isMock = isMockSlug(meta.slug);
  const prog = loadProgress(meta.slug);
  const endsAt = prog.endsAt;
  const mockTimerHtml = (isMock && endsAt && !state.submitted) ? `
    <div class="mock-timer" id="mock-timer" data-ends-at="${endsAt}">
      <span class="mock-timer-label">Time left</span>
      <span class="mock-timer-val" id="mock-timer-val">—</span>
    </div>` : "";
  app.innerHTML = `
    ${loginBannerIfNeeded()}
    <div class="exam-head">
      <div>
        <h2>${escapeHtml(meta.title)}</h2>
        <p class="hint" style="color:var(--muted);margin:2px 0 0">
          ${total} questions &bull; ${state.gradeAtEnd
            ? (state.submitted
                ? "test submitted — answers revealed below"
                : "grade-at-end mode: answer all questions, then submit")
            : "click an option to answer"}
        </p>
      </div>
      ${mockTimerHtml}
      <div class="actions">
        <button class="btn ghost" id="back-btn">&larr; All tests</button>
        <button class="btn" id="reset-btn">Reset</button>
        ${!state.gradeAtEnd
          ? `<button class="btn" id="reveal-btn">${state.revealAll ? "Hide" : "Reveal"} all answers</button>`
          : (state.submitted
              ? `<button class="btn" id="unsubmit-btn">Keep trying</button>`
              : `<button class="btn primary" id="submit-btn" ${allAnswered ? "" : "disabled"}
                   title="${allAnswered ? "Grade the whole test now" : "Answer every question first"}">
                   Submit test (${answered}/${total})
                 </button>`)}
      </div>
    </div>

    ${isMock ? `
      <div class="mock-notice">
        <strong>Mock exam mode.</strong> Timed, grade-at-end, no show-answer.
        On submit you'll see a full breakdown, and this attempt is saved under
        Stats → Tests completed. You can abort from the All Tests page.
      </div>
    ` : `
    <div class="mode-toggle-row">
      <label class="mode-toggle">
        <input type="checkbox" id="grade-end-toggle" ${state.gradeAtEnd ? "checked" : ""} />
        <span class="slider"></span>
        <span class="mode-label">
          <strong>Grade at end</strong>
          <span class="mode-desc">${state.gradeAtEnd
            ? "Feedback is hidden until you submit — practice like the real exam."
            : "Feedback shows as soon as you pick an option."}</span>
        </span>
      </label>
    </div>`}

    <div class="progress">
      <div class="bar"><span id="bar-fill"></span></div>
      <div class="stats">
        <strong id="answered-count">${answered}</strong> / ${total} answered
        ${gradingGated
          ? `&nbsp;·&nbsp; <span style="color:var(--muted)">Score hidden until submit</span>`
          : `&nbsp;·&nbsp; Score (on answered): <strong id="score-text">${correct}/${scoredCount}</strong>`}
      </div>
    </div>

    <div class="q-list" id="q-list">
      ${exam.questions.map(qHtml).join("")}
    </div>

    ${state.gradeAtEnd && !state.submitted && total > 0 ? `
      <div class="submit-bar">
        <div>
          ${allAnswered
            ? "All questions answered. Ready to grade?"
            : `${total - answered} question${total - answered === 1 ? "" : "s"} remaining before you can submit.`}
        </div>
        <button class="btn primary" id="submit-btn-bottom" ${allAnswered ? "" : "disabled"}>
          Submit test
        </button>
      </div>
    ` : ""}
  `;
  wireBannerButtons();

  document.getElementById("back-btn").addEventListener("click", () => {
    location.hash = "#/";
  });
  document.getElementById("reset-btn").addEventListener("click", () => {
    if (!confirm("Clear your answers for this test?")) return;
    state.selections = {};
    state.revealed = {};
    state.revealAll = false;
    state.submitted = false;
    saveProgress();
    drawExam(meta);
  });
  const revealBtn = document.getElementById("reveal-btn");
  if (revealBtn) revealBtn.addEventListener("click", () => {
    state.revealAll = !state.revealAll;
    drawExam(meta);
  });
  const submitBtn = document.getElementById("submit-btn");
  const submitBtnBottom = document.getElementById("submit-btn-bottom");
  const submit = () => {
    if (answered < total) {
      alert(`Answer all ${total} questions before submitting. You have ${total - answered} left.`);
      return;
    }
    state.submitted = true;
    state.revealAll = true;
    saveProgress();
    // Archive as a completed attempt.
    archiveAttempt(meta.slug, { mock: isMock, timedMs: isMock ? MOCK_MINUTES * 60000 : null });
    if (isMock) {
      clearMockSnapshot();
      if (state._mockTimer) { clearInterval(state._mockTimer); state._mockTimer = null; }
    }
    drawExam(meta);
    // scroll to top to show overall score
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  if (submitBtn) submitBtn.addEventListener("click", submit);
  if (submitBtnBottom) submitBtnBottom.addEventListener("click", submit);
  const unsubmitBtn = document.getElementById("unsubmit-btn");
  if (unsubmitBtn) unsubmitBtn.addEventListener("click", () => {
    state.submitted = false;
    state.revealAll = false;
    saveProgress();
    drawExam(meta);
  });

  // Mock timer tick (if present)
  if (isMock && endsAt && !state.submitted) {
    const tick = () => {
      const val = document.getElementById("mock-timer-val");
      if (!val) return; // re-rendered
      const left = endsAt - Date.now();
      if (left <= 0) {
        val.textContent = "0:00";
        clearInterval(state._mockTimer);
        // Auto-submit on time-up.
        state.submitted = true;
        state.revealAll = true;
        saveProgress();
        archiveAttempt(meta.slug, { mock: true, timedMs: MOCK_MINUTES * 60000 });
        clearMockSnapshot();
        alert("Time's up! Your mock exam has been auto-submitted.");
        drawExam(meta);
        return;
      }
      const mins = Math.floor(left / 60000);
      const secs = Math.floor((left % 60000) / 1000);
      val.textContent = `${mins}:${String(secs).padStart(2, "0")}`;
      val.classList.toggle("urgent", left < 5 * 60000);
    };
    if (state._mockTimer) clearInterval(state._mockTimer);
    state._mockTimer = setInterval(tick, 1000);
    tick();
  }

  // Mode toggle (skipped in mock mode — toggle element doesn't exist)
  const toggle = document.getElementById("grade-end-toggle");
  if (toggle) toggle.addEventListener("change", () => {
    state.gradeAtEnd = toggle.checked;
    // When turning on grade-at-end: hide any currently-revealed answers.
    if (state.gradeAtEnd) {
      state.revealAll = false;
      state.revealed = {};
      // If no answers submitted yet, make sure submitted=false too.
      if (!allAnswered) state.submitted = false;
    } else {
      // turning off: reset submitted state so feedback flows like before
      state.submitted = false;
    }
    saveProgress();
    drawExam(meta);
  });

  document.querySelectorAll(".opt").forEach(el => {
    el.addEventListener("click", () => {
      const qNum = Number(el.getAttribute("data-q"));
      const letter = el.getAttribute("data-letter");
      const wasAlreadyAnswered = !!state.selections[qNum];
      state.selections[qNum] = letter;
      if (!state.timestamps) state.timestamps = {};
      state.timestamps[qNum] = Date.now();
      saveProgress();
      updateQuestionUI(qNum);
      updateProgressBar();
      // Streak + per-day leaderboard activity: count only FIRST answer per Q.
      const q = state.currentExam.questions.find(x => x.number === qNum);
      if (!wasAlreadyAnswered) {
        if (q && q.code) {
          recordStreakActivity(q.code.split(":")[0]);
          refreshStreakUI();
        }
        if (q && q.answer) recordAnswerActivity(letter === q.answer);
      }
    });
  });
  document.querySelectorAll(".reveal-one").forEach(el => {
    el.addEventListener("click", () => {
      const qNum = Number(el.getAttribute("data-q"));
      state.revealed[qNum] = !state.revealed[qNum];
      saveProgress();
      updateQuestionUI(qNum);
    });
  });

  updateProgressBar();
  exam.questions.forEach(q => updateQuestionUI(q.number));
}

function qHtml(q) {
  const opts = ["A", "B", "C", "D"].map(letter => {
    const text = q.options[letter] || "";
    return `
      <div class="opt" data-q="${q.number}" data-letter="${letter}">
        <div class="letter">${letter}</div>
        <div class="text">${escapeHtml(text)}</div>
      </div>
    `;
  }).join("");

  const sources = (q.sources || []).map(s => escapeHtml(s)).join("<br>");
  const codeBadge = q.code
    ? `<span class="q-code" title="Performance indicator (${q.topic || "unknown topic"})">${escapeHtml(q.code)}</span>`
    : "";
  return `
    <article class="q-card" id="q-${q.number}">
      <div class="q-num">Question ${q.number}${codeBadge}</div>
      <div class="q-text">${escapeHtml(q.question)}</div>
      <div class="options">${opts}</div>
      <div class="q-actions">
        <button class="btn ghost reveal-one" data-q="${q.number}">Show answer</button>
      </div>
      <div class="explain hidden">
        <div class="explain-body"></div>
        <div class="sources">${sources}</div>
      </div>
    </article>
  `;
}

function updateQuestionUI(qNum) {
  const exam = state.currentExam;
  const q = exam.questions.find(x => x.number === qNum);
  if (!q) return;
  const card = document.getElementById(`q-${qNum}`);
  if (!card) return;

  const sel = state.selections[qNum];
  // In grade-at-end mode: ONLY show feedback after submission.
  const gated = state.gradeAtEnd && !state.submitted;
  const show = !gated && (state.revealAll || state.revealed[qNum] || !!sel);
  const correctLetter = q.answer;

  card.querySelectorAll(".opt").forEach(opt => {
    opt.classList.remove("selected", "correct", "wrong");
    const letter = opt.getAttribute("data-letter");
    if (sel && letter === sel) opt.classList.add("selected");
    if (show && correctLetter) {
      if (letter === correctLetter) opt.classList.add("correct");
      else if (sel && letter === sel && sel !== correctLetter) opt.classList.add("wrong");
    }
  });

  // Reveal button visibility:
  //   - Hidden while grade-at-end is still gated
  //   - Hidden once user has selected (answer is already shown, toggle is redundant)
  //   - Visible only when the user hasn't picked yet
  const revealBtn = card.querySelector(".reveal-one");
  if (revealBtn) {
    if (gated || sel) {
      revealBtn.classList.add("hidden");
    } else {
      revealBtn.classList.remove("hidden");
      revealBtn.textContent = state.revealed[qNum] || state.revealAll ? "Hide answer" : "Show answer";
    }
  }

  const explainEl = card.querySelector(".explain");
  const body = card.querySelector(".explain-body");

  if (show && correctLetter) {
    explainEl.classList.remove("hidden");
    const exp = q.explanation
      ? `<strong>Answer ${correctLetter}.</strong> ${escapeHtml(q.explanation)}`
      : `<strong>Answer ${correctLetter}.</strong>`;
    body.innerHTML = exp;
  } else if (show && !correctLetter) {
    explainEl.classList.remove("hidden");
    body.innerHTML = `<em>No answer key available for this question.</em>`;
  } else {
    explainEl.classList.add("hidden");
  }
}

function updateProgressBar() {
  const exam = state.currentExam;
  if (!exam) return;
  const total = exam.questions.length;
  const answered = Object.keys(state.selections).length;
  const correct = exam.questions.reduce((n, q) => {
    const sel = state.selections[q.number];
    return sel && q.answer && sel === q.answer ? n + 1 : n;
  }, 0);
  const scored = exam.questions.filter(q =>
    state.selections[q.number] && q.answer).length;
  const pct = total ? Math.round((answered / total) * 100) : 0;
  const fill = document.getElementById("bar-fill");
  if (fill) fill.style.width = pct + "%";
  const a = document.getElementById("answered-count");
  if (a) a.textContent = answered;
  const s = document.getElementById("score-text");
  if (s) s.textContent = `${correct}/${scored}`;
  // Update the submit button counter + enabled state live in grade-at-end mode.
  const submitTop = document.getElementById("submit-btn");
  const submitBot = document.getElementById("submit-btn-bottom");
  const ready = answered >= total;
  if (submitTop) {
    submitTop.textContent = `Submit test (${answered}/${total})`;
    submitTop.disabled = !ready;
  }
  if (submitBot) submitBot.disabled = !ready;
}

// ================================================================
//                          STATS PAGE
// ================================================================

async function renderStats() {
  if (!state.user) {
    app.innerHTML = `
      <div class="stats-head">
        <h2>My Stats</h2>
        <p class="hint">Log in to see per-user stats and paste codes you got wrong.</p>
      </div>
      <div class="panel" style="text-align:center">
        <p>No profile is logged in yet.</p>
        <button class="btn primary" id="stats-login">Log in</button>
      </div>
    `;
    document.getElementById("stats-login").addEventListener("click", openLoginModal);
    return;
  }
  // Figure out which sub-tab: hash = #/stats/<view>
  const { extra } = parseHash();
  const parts = (location.hash || "").replace(/^#\/?/, "").split("/");
  const sub = parts[1] || "start";  // "start" | "site" | "tests"

  app.innerHTML = `<div class="empty">Crunching your data…</div>`;

  // Load every available exam to compute wrongs.
  const slugs = state.index.filter(e => e.available).map(e => e.slug);
  await Promise.all(slugs.map(s => getExam(s).catch(() => null)));

  // Build wrong-answer lists from TWO sources kept separately:
  // 1) siteWrong  — user actually clicked answers on the site
  // 2) logWrong   — imported from a paper-log seed (PDF/txt upload)
  const siteWrong = [];
  const logWrong  = [];
  let siteAnswered = 0, siteCorrect = 0;
  let logAnswered  = 0, logCorrect  = 0;

  for (const meta of state.index) {
    if (!meta.available) continue;
    const exam = state.exams[meta.slug];
    if (!exam) continue;

    const siteSel = (loadProgress(meta.slug).selections) || {};
    const logSel  = (loadLogTest(meta.slug).selections)  || {};

    for (const q of exam.questions) {
      // --- site bucket ---
      const sChosen = siteSel[q.number];
      if (sChosen) {
        siteAnswered++;
        if (q.answer) {
          if (sChosen === q.answer) siteCorrect++;
          else siteWrong.push({
            code: q.code || null, topic: q.topic || null,
            slug: meta.slug, title: meta.title, number: q.number,
            chosen: sChosen, correct: q.answer, source: "site",
          });
        }
      }
      // --- log-test bucket (only if no site selection for same Q — prefer site) ---
      const lChosen = !sChosen ? logSel[q.number] : null;
      if (lChosen) {
        logAnswered++;
        if (q.answer) {
          if (lChosen === q.answer) logCorrect++;
          else logWrong.push({
            code: q.code || null, topic: q.topic || null,
            slug: meta.slug, title: meta.title, number: q.number,
            chosen: lChosen, correct: q.answer, source: "log",
          });
        }
      }
    }
  }
  const autoWrong = [...siteWrong, ...logWrong];
  const totalAnswered = siteAnswered + logAnswered;
  const totalCorrect  = siteCorrect  + logCorrect;

  // Manual codes the user pasted.
  const manualCodes = loadManualCodesSafe(); // [{ code, addedAt }] — always current user only
  const manualWrong = manualCodes.map(m => ({
    code: m.code,
    topic: m.code ? TOPICS[m.code.split(":")[0]] || null : null,
    slug: null,
    title: null,
    number: null,
    source: "manual",
    addedAt: m.addedAt,
  }));

  const allWrong = autoWrong.concat(manualWrong);

  // Aggregate by topic.
  const byTopic = {};
  for (const w of allWrong) {
    const key = w.topic || "Unknown";
    if (!byTopic[key]) byTopic[key] = {
      topic: key,
      count: 0,
      siteCount: 0,
      logCount: 0,
      manualCount: 0,
      codes: new Set(),
      questions: [],    // array of { slug, title, number, code, source }
    };
    byTopic[key].count++;
    if (w.source === "site")       byTopic[key].siteCount++;
    else if (w.source === "log")   byTopic[key].logCount++;
    else                           byTopic[key].manualCount++;
    if (w.code) byTopic[key].codes.add(w.code);
    if (w.slug) byTopic[key].questions.push({ slug: w.slug, title: w.title, number: w.number, code: w.code, source: w.source });
  }

  const topicsSorted = Object.values(byTopic).sort((a, b) => b.count - a.count);
  // "Unknown" topics are codes we couldn't match to a DECA PI — don't
  // promote them to "most missed" since the student can't study by them.
  const mostMissed = topicsSorted.find(t => t.topic && t.topic !== "Unknown") || null;
  const totalWrong = allWrong.length;
  const maxCount = mostMissed ? mostMissed.count : 1;

  const accuracy = totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : null;

  // Compute per-test completion records (score + which bucket).
  const testsCompleted = [];
  for (const meta of state.index) {
    if (!meta.available) continue;
    const exam = state.exams[meta.slug];
    if (!exam) continue;
    const siteSel = (loadProgress(meta.slug).selections) || {};
    const siteTs  = (loadProgress(meta.slug).timestamps) || {};
    const logSel  = (loadLogTest(meta.slug).selections)  || {};
    const total = exam.questions.length;
    const siteAns = Object.keys(siteSel).length;
    const logAns  = Object.keys(logSel).filter(q => !siteSel[q]).length;
    const totalAns = siteAns + logAns;
    if (totalAns === 0) continue;
    let correct = 0;
    for (const q of exam.questions) {
      const c = siteSel[q.number] || logSel[q.number];
      if (c && q.answer && c === q.answer) correct++;
    }
    // latest activity timestamp (site only, since logs don't have timestamps)
    const lastTs = Object.values(siteTs).reduce((a, b) => b > a ? b : a, 0);
    testsCompleted.push({
      slug: meta.slug,
      title: meta.title,
      total,
      answered: totalAns,
      correct,
      siteAnswered: siteAns,
      logAnswered: logAns,
      source: siteAns > 0 && logAns > 0 ? "mixed" : (siteAns > 0 ? "site" : "log"),
      lastTs,
      attemptIdx: 0, // current open attempt
    });
    // Add any archived attempts as separate rows ("(again)", "(3rd attempt)").
    const attempts = loadAttempts(meta.slug);
    attempts.forEach((a, i) => {
      const suffix = i === 0 ? "(again)" : `(attempt ${i + 2})`;
      testsCompleted.push({
        slug: meta.slug,
        title: `${meta.title} ${suffix}`,
        total: a.total,
        answered: a.answered,
        correct: a.correct,
        siteAnswered: a.answered,
        logAnswered: 0,
        source: a.mock ? "mock" : "site",
        lastTs: a.at,
        attemptIdx: i + 1,
        archived: true,
      });
    });
  }
  testsCompleted.sort((a, b) => (b.lastTs || 0) - (a.lastTs || 0) || a.title.localeCompare(b.title));

  // Site-progress metrics: day/week counts + "previously wrong, now right"
  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;
  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  const weekStart = now - 7 * DAY;
  let todayAns = 0, todayCorrect = 0;
  let weekAns  = 0, weekCorrect  = 0;
  // Also compute "previously wrong in log, now correct on site"
  let fixedFromLog = 0;
  const fixedList = [];
  const studyAll = loadAllStudy();
  for (const meta of state.index) {
    if (!meta.available) continue;
    const exam = state.exams[meta.slug];
    if (!exam) continue;
    const siteSel = (loadProgress(meta.slug).selections) || {};
    const siteTs  = (loadProgress(meta.slug).timestamps) || {};
    const logSel  = (loadLogTest(meta.slug).selections)  || {};
    const studySlug = studyAll[meta.slug] || {};
    for (const q of exam.questions) {
      const chosen = siteSel[q.number];
      const ts = siteTs[q.number] || 0;
      if (chosen && q.answer) {
        if (ts >= todayStart.getTime()) {
          todayAns++;
          if (chosen === q.answer) todayCorrect++;
        }
        if (ts >= weekStart) {
          weekAns++;
          if (chosen === q.answer) weekCorrect++;
        }
      }
      // Check if they previously got it wrong in a log AND now got it right on site OR in study.
      const origLog = logSel[q.number];
      const studyChosen = studySlug[q.number] && studySlug[q.number].chosen;
      const fixedOnSite  = chosen && q.answer && chosen === q.answer && origLog && origLog !== q.answer;
      const fixedInStudy = studyChosen && q.answer && studyChosen === q.answer && origLog && origLog !== q.answer;
      if (fixedOnSite || fixedInStudy) {
        fixedFromLog++;
        fixedList.push({
          slug: meta.slug, title: meta.title, number: q.number, code: q.code,
          originallyChose: origLog, correct: q.answer,
          where: fixedOnSite ? "site" : "study",
        });
      }
    }
  }

  const tabsHtml = `
    <div class="stats-head">
      <h2>My Stats — <span style="color:var(--accent)">${escapeHtml(state.user)}</span></h2>
      <p class="hint">Track what you started with, what you've done on the site, and every test you've completed.</p>
    </div>
    <div class="sub-tabs" style="margin-bottom:14px">
      <button class="${sub === "start" ? "active" : ""}" data-stats-sub="start">Starting Point <span class="count">${logAnswered}</span></button>
      <button class="${sub === "site"  ? "active" : ""}" data-stats-sub="site">Site Progress <span class="count">${siteAnswered}</span></button>
      <button class="${sub === "tests" ? "active" : ""}" data-stats-sub="tests">Tests Completed <span class="count">${testsCompleted.length}</span></button>
    </div>
  `;

  let body = "";
  if (sub === "site") {
    body = renderStatsSite({
      siteAnswered, siteCorrect, siteWrong,
      todayAns, todayCorrect, weekAns, weekCorrect,
      fixedFromLog, fixedList, manualWrong,
    });
  } else if (sub === "tests") {
    body = renderStatsTests(testsCompleted);
  } else if (sub === "leaderboard") {
    // Leaderboard is now a top-level route — redirect old links there.
    location.hash = "#/leaderboard";
    return;
  } else {
    body = renderStatsStart({
      logAnswered, logCorrect, logWrong, manualWrong,
      accuracy: logAnswered > 0 ? Math.round(logCorrect / logAnswered * 100) : null,
      topicsSorted, maxCount, mostMissed,
    });
  }

  app.innerHTML = tabsHtml + body;

  // wire sub-tabs
  document.querySelectorAll("[data-stats-sub]").forEach(el => {
    el.addEventListener("click", () => {
      const s = el.getAttribute("data-stats-sub");
      location.hash = `#/stats/${s}`;
    });
  });

  // wire starting-point paste actions if present
  const addBtn = document.getElementById("paste-add");
  if (addBtn) addBtn.addEventListener("click", onPasteAdd);
  const clrBtn = document.getElementById("paste-clear");
  if (clrBtn) clrBtn.addEventListener("click", onPasteClear);
  document.querySelectorAll("[data-remove]").forEach(btn => {
    btn.addEventListener("click", () => removeManualAt(Number(btn.getAttribute("data-remove"))));
  });

  // --- Leaderboard: report my stats + hydrate board if on that sub-tab ---
  const streakInfo = loadStreak();
  const payload = computeLeaderboardPayload({
    siteAnswered, siteCorrect, logAnswered, logCorrect,
    testsCompletedCount: testsCompleted.length,
    wrongsFixed: fixedFromLog,
    streakCurrent: streakInfo && streakInfo.current ? streakInfo.current : 0,
  });
  // Push first, THEN hydrate — otherwise the board snapshot we read from
  // Firestore races the put and the user sees stale numbers.
  (async () => {
    try { await reportLeaderboard(payload); } catch {}
    if (sub === "leaderboard") hydrateLeaderboard(payload);
  })();
}

// ---- Starting-point view (log-imported data + pasted codes) ----
function renderStatsStart(d) {
  const { logAnswered, logCorrect, logWrong, manualWrong, accuracy, topicsSorted, maxCount, mostMissed } = d;
  const panels = `
    ${streakPanelHtml()}
    <div class="banner" style="background:#f3ecff;border-color:#e0d0ff;color:#5b1a8e">
      <div><strong>Starting Point</strong> = your baseline. This is from test logs you uploaded plus codes you pasted. This data doesn't change when you answer on the site — think of it as where you stood before studying here.</div>
    </div>
    <div class="kpi-row">
      <div class="kpi"><div class="k-label">Starting answers</div><div class="k-value">${logAnswered.toLocaleString()}</div><div class="k-sub">from your uploaded logs</div></div>
      <div class="kpi good"><div class="k-label">Correct</div><div class="k-value">${logCorrect.toLocaleString()}</div><div class="k-sub">${accuracy == null ? "—" : accuracy + "% baseline accuracy"}</div></div>
      <div class="kpi accent"><div class="k-label">Wrong</div><div class="k-value">${logWrong.length.toLocaleString()}</div><div class="k-sub">+ ${manualWrong.length} manually-pasted codes</div></div>
      <div class="kpi"><div class="k-label">Most missed topic</div><div class="k-value" style="font-size:1.15rem">${mostMissed ? escapeHtml(mostMissed.topic) : "—"}</div><div class="k-sub">${mostMissed ? mostMissed.count + " wrong" : "Upload or paste codes"}</div></div>
    </div>

    <section class="panel">
      <h3>Breakdown by topic</h3>
      <p class="panel-sub">Sorted by most-missed. Click a question number to jump to it.</p>
      ${topicsSorted.length === 0 ? `<p class="empty" style="padding:16px">Nothing yet. Upload logs or paste codes below.</p>`
        : `<table class="topics-table">
          <thead><tr><th>Topic</th><th>Wrong</th><th>Codes missed</th><th>Questions</th></tr></thead>
          <tbody>
            ${topicsSorted.map(t => {
              const pct = Math.round((t.count / maxCount) * 100);
              const codeChips = [...t.codes].sort().map(c => `<code>${escapeHtml(c)}</code>`).join("");
              const qlinks = t.questions.map(q =>
                `<a href="#/exam/${q.slug}/${q.number}" title="${escapeHtml(q.title)}">${escapeHtml(shortTitle(q.title))} #${q.number}</a>`
              ).join("");
              return `<tr>
                <td><span class="topic-bar" style="width:${Math.max(6, pct * 0.7)}px"></span><strong>${escapeHtml(t.topic)}</strong></td>
                <td><strong>${t.count}</strong> <span style="color:var(--muted);font-size:.8rem">(${t.logCount} log / ${t.manualCount} paste)</span></td>
                <td>${codeChips || `<span style="color:var(--muted)">—</span>`}</td>
                <td class="qlinks">${qlinks || `<span style="color:var(--muted)">—</span>`}</td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>`}
    </section>

    <section class="panel">
      <h3>Paste codes you got wrong</h3>
      <p class="panel-sub">
        <strong>Pasting under profile: <span style="color:var(--accent)">${escapeHtml(state.user || "(not logged in)")}</span></strong>.
        Codes are saved only on this profile. From a paper test or another source. Example: <code>PR:001</code>, <code>BL:067</code>.
        Separated by commas, spaces, or new lines.
      </p>
      <textarea id="paste-area" class="paste-area" placeholder="PR:001
BL:067, IM:025
PM:123"></textarea>
      <div class="paste-actions">
        <button class="btn primary" id="paste-add">Add to my wrongs</button>
        <button class="btn danger" id="paste-clear">Clear all pasted</button>
      </div>
      <div id="paste-feedback" class="paste-feedback"></div>
      ${manualWrong.length === 0 ? "" : `
        <div style="margin-top:14px">
          <strong>Your pasted codes (${manualWrong.length}):</strong>
          <div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:6px">
            ${manualWrong.map((w, i) => `
              <span class="user-chip" style="background:#fdecef;color:var(--bad)">
                <code>${escapeHtml(w.code)}</code>
                ${w.topic ? `· ${escapeHtml(w.topic)}` : ""}
                <button class="btn small ghost" data-remove="${i}" title="Remove"
                        style="padding:0 6px;font-weight:900;color:var(--bad);border:none">×</button>
              </span>
            `).join("")}
          </div>
        </div>
      `}
    </section>
  `;
  return panels;
}

// ---- Site Progress view (clicks on the website only) ----
function renderStatsSite(d) {
  const { siteAnswered, siteCorrect, siteWrong,
          todayAns, todayCorrect, weekAns, weekCorrect,
          fixedFromLog, fixedList } = d;
  const siteAcc = siteAnswered > 0 ? Math.round(siteCorrect / siteAnswered * 100) : null;
  const todayAcc = todayAns > 0 ? Math.round(todayCorrect / todayAns * 100) : null;
  const weekAcc  = weekAns  > 0 ? Math.round(weekCorrect  / weekAns  * 100) : null;

  return `
    <div class="banner">
      <div><strong>Site Progress</strong> = what you've done on this site. Today, this week, your improvement from the baseline.</div>
    </div>
    <div class="kpi-row">
      <div class="kpi" style="border-color:#d0defc">
        <div class="k-label">Today</div>
        <div class="k-value" style="color:var(--accent)">${todayAns}</div>
        <div class="k-sub">${todayCorrect} correct · ${todayAcc == null ? "—" : todayAcc + "%"}</div>
      </div>
      <div class="kpi">
        <div class="k-label">This week</div>
        <div class="k-value">${weekAns}</div>
        <div class="k-sub">${weekCorrect} correct · ${weekAcc == null ? "—" : weekAcc + "%"}</div>
      </div>
      <div class="kpi good">
        <div class="k-label">All-time on site questions</div>
        <div class="k-value">${siteAnswered}</div>
        <div class="k-sub">${siteCorrect} correct · ${siteAcc == null ? "—" : siteAcc + "%"}</div>
      </div>
      <div class="kpi" style="border-color:#f5d9a0">
        <div class="k-label">Previously wrong, now right</div>
        <div class="k-value" style="color:#c86a00">${fixedFromLog}</div>
        <div class="k-sub">questions you missed in a log that you re-answered correctly here</div>
      </div>
    </div>

    ${siteAnswered === 0 && fixedFromLog === 0 ? `
      <div class="panel" style="text-align:center">
        <h3>No on-site activity yet</h3>
        <p class="panel-sub">Answer some questions on a test or in the Study tab. Every click is tracked with a timestamp so your daily/weekly counts build over time.</p>
        <a class="btn primary" href="#/">Open a test</a>
      </div>
    ` : ""}

    ${fixedList.length > 0 ? `
      <section class="panel">
        <h3>Wrongs you've fixed (${fixedList.length})</h3>
        <p class="panel-sub">These are questions you originally got wrong in a test log, then answered correctly on the site or in the Study tab.</p>
        <table class="topics-table">
          <thead><tr><th>Code</th><th>Test</th><th>Your old pick → correct</th><th>Where</th></tr></thead>
          <tbody>
            ${fixedList.slice(0, 100).map(f => `
              <tr>
                <td>${f.code ? `<code>${escapeHtml(f.code)}</code>` : "—"}</td>
                <td><a href="#/exam/${f.slug}/${f.number}">${escapeHtml(shortTitle(f.title))} #${f.number}</a></td>
                <td><span style="color:var(--bad)">${escapeHtml(f.originallyChose)}</span> → <strong style="color:var(--good)">${escapeHtml(f.correct)}</strong></td>
                <td>${f.where === "study" ? "Study tab" : "Test page"}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </section>
    ` : ""}
  `;
}

// ---- Tests Completed view ----
function renderStatsTests(list) {
  if (list.length === 0) {
    return `<div class="panel" style="text-align:center">
      <h3>No tests completed yet</h3>
      <p class="panel-sub">A test counts as completed once you've answered at least one question on it — either on site or from an uploaded log.</p>
      <a class="btn primary" href="#/">Browse tests</a>
    </div>`;
  }
  return `
    <section class="panel">
      <h3>Tests Completed (${list.length})</h3>
      <p class="panel-sub">Ranked by most-recent activity. 'Log' = imported from your uploaded prep log. 'Site' = answered on this website.</p>
      <table class="topics-table">
        <thead><tr>
          <th>Test</th><th>Score</th><th>Accuracy</th><th>Source</th><th style="text-align:right"></th>
        </tr></thead>
        <tbody>
          ${list.map(t => {
            const acc = t.answered > 0 ? Math.round(t.correct / t.answered * 100) : 0;
            const src = t.source === "site" ? `<span class="user-chip" style="background:#eef3ff;color:var(--accent)">Site${t.archived ? " · archived" : ""}</span>`
                     : t.source === "log"   ? `<span class="user-chip" style="background:#f3ecff;color:#5b1a8e">Log</span>`
                     : t.source === "mock"  ? `<span class="user-chip" style="background:#fdecef;color:#9b2a2a">Mock</span>`
                     : `<span class="user-chip" style="background:#fff4e5;color:#9a5600">Mixed</span>`;
            const color = acc >= 90 ? "var(--good)" : acc >= 75 ? "var(--ink)" : "var(--bad)";
            return `<tr>
              <td><strong>${escapeHtml(t.title)}</strong></td>
              <td><strong style="color:${color}">${t.correct}/${t.answered}</strong> <span style="color:var(--muted);font-size:.8rem"> of ${t.total}</span></td>
              <td style="color:${color};font-weight:700">${acc}%</td>
              <td>${src}</td>
              <td style="text-align:right"><a class="btn small ghost" href="#/exam/${t.slug}">Open →</a></td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </section>
  `;
}

function shortTitle(t) {
  // "Sample Exam 12" -> "Exam 12"
  return t.replace(/^Sample Exam /, "Exam ").replace(/^Sample /, "");
}

function onPasteAdd() {
  if (!state.user) {
    alert("Log in to a profile before pasting codes.");
    return;
  }
  const area = document.getElementById("paste-area");
  const fb = document.getElementById("paste-feedback");
  const text = area.value || "";
  const tokens = text.split(/[\s,;]+/).map(s => s.trim()).filter(Boolean);
  const added = [];
  const bad = [];
  for (const t of tokens) {
    const m = t.match(/^([A-Z]{2,3}):\s*(\d{1,4})$/i);
    if (!m) { bad.push(t); continue; }
    const code = `${m[1].toUpperCase()}:${m[2].padStart(3, "0").slice(-Math.max(3, m[2].length))}`;
    added.push(code);
  }
  if (added.length === 0) {
    fb.className = "paste-feedback err";
    fb.textContent = bad.length
      ? `No valid codes found. Invalid: ${bad.slice(0,5).join(", ")}${bad.length>5?"…":""}`
      : `Please paste at least one code like PR:001`;
    return;
  }
  const list = loadManualCodes();
  for (const code of added) list.push({ code, addedAt: Date.now() });
  saveManualCodes(list);
  fb.className = "paste-feedback ok";
  fb.textContent = `Added ${added.length} code${added.length === 1 ? "" : "s"}.` +
    (bad.length ? ` Skipped ${bad.length} unrecognized entr${bad.length === 1 ? "y" : "ies"}.` : "");
  area.value = "";
  // Re-render to reflect new stats.
  setTimeout(renderStats, 300);
}

function onPasteClear() {
  if (!confirm("Clear all codes you've pasted? (Does not affect answers on tests.)")) return;
  saveManualCodes([]);
  renderStats();
}

function removeManualAt(idx) {
  const list = loadManualCodes();
  list.splice(idx, 1);
  saveManualCodes(list);
  renderStats();
}

// ================================================================
//                          STUDY TAB
// ================================================================
//
// Routes:
//   #/study                 — overview (sorted by wrong count, picks a default topic)
//   #/study/<prefix>        — topic page (guide by default)
//   #/study/<prefix>/missed — topic: questions you missed (with this code prefix)
//   #/study/<prefix>/all    — topic: other practice questions (same prefix, not missed)

async function renderStudy(prefix, _qnum) {
  if (!state.user) {
    app.innerHTML = `
      <div class="stats-head">
        <h2>Study</h2>
        <p class="hint">Log in to see a personalized study plan based on your wrongs.</p>
      </div>
      <div class="panel" style="text-align:center">
        <p>Log in first to unlock per-topic study guides and targeted practice.</p>
        <button class="btn primary" id="study-login">Log in</button>
      </div>
    `;
    document.getElementById("study-login").addEventListener("click", openLoginModal);
    return;
  }

  app.innerHTML = `<div class="empty">Loading study plan…</div>`;

  // Load everything so we can partition questions by topic and track wrongs.
  const availableSlugs = state.index.filter(e => e.available).map(e => e.slug);
  await Promise.all(availableSlugs.map(s => getExam(s).catch(() => null)));

  // Aggregate: per topic prefix we track TWO counts.
  //   wrongCount    = historical "most missed" count — built from BOTH log-test
  //                   wrongs AND on-site (progress) wrongs, so every miss the
  //                   user has made counts toward the ranking. Re-doing a
  //                   question correctly on the site does NOT decrement it, so
  //                   the sidebar sort order stays stable — you missed it,
  //                   that's history; the ranking shouldn't reshuffle just
  //                   because you've since fixed some. This drives the sidebar
  //                   sort order and the "Most missed topic" KPI.
  //   wrongQs       = the list of questions STILL effectively wrong (original
  //                   log-test pick if user hasn't retried, their site pick if
  //                   they have). This is what the "Review wrongs" tab shows
  //                   so the "N to review" counter ticks down as they nail
  //                   questions one by one.
  const byTopic = {};
  for (const code of Object.keys(activeGuides())) {
    byTopic[code] = { prefix: code, name: activeGuides()[code].name, wrongCount: 0, total: 0, wrongQs: [], allQs: [] };
  }
  byTopic._OTHER = { prefix: "_OTHER", name: "Other / Uncoded", wrongCount: 0, total: 0, wrongQs: [], allQs: [] };

  // DECA reuses the same question stems across multiple exams (same
  // "Which of the following..." shows up in ICDC 2014 AND state 2016).
  //
  // Two-pass algorithm:
  //   Pass 1: group every (wrong in log OR wrong on site) occurrence by
  //           normalized stem. Per group, note whether the user has EVER
  //           answered any instance correctly on site — if so, the whole
  //           group is "done" (answering once anywhere counts).
  //   Pass 2: walk exams again; push ONE representative per still-wrong
  //           stem into bucket.wrongQs. This way the list has no dupes
  //           AND the counter ticks down by exactly 1 per correct answer,
  //           even if that question existed in 3 exams.
  const normStem = (s) => (s || "").toLowerCase().replace(/\s+/g, " ").trim();
  const stemAnyRight = new Map(); // normStem -> true if user has answered any instance correctly

  for (const meta of state.index) {
    if (!meta.available) continue;
    const exam = state.exams[meta.slug];
    if (!exam) continue;
    const siteSel = (loadProgress(meta.slug).selections) || {};
    for (const q of exam.questions) {
      if (!q.answer) continue;
      const key = normStem(q.question);
      if (!key) continue;
      const siteChosen = siteSel[q.number];
      if (siteChosen === q.answer) stemAnyRight.set(key, true);
    }
  }

  const seenWrongStemPerBucket = {}; // { prefix: Set<stem> }

  for (const meta of state.index) {
    if (!meta.available) continue;
    const exam = state.exams[meta.slug];
    if (!exam) continue;
    const siteSel = (loadProgress(meta.slug).selections) || {};
    const logSel  = (loadLogTest(meta.slug).selections)  || {};
    for (const q of exam.questions) {
      const codePrefix = q.code ? q.code.split(":")[0] : null;
      const bucket = byTopic[codePrefix] || byTopic._OTHER;
      bucket.total++;
      bucket.allQs.push({ slug: meta.slug, title: meta.title, number: q.number, code: q.code });
      // "wrongCount" = how many questions the user has MISSED in this topic.
      // Counts BOTH imported LOG TEST wrongs and on-site (progress) wrongs, so
      // the sidebar ranking reflects everything they've gotten wrong — not just
      // imported logs. Historical: it never decrements when a question is later
      // fixed, so the order stays stable instead of reshuffling mid-session.
      const logChosen = logSel[q.number];
      if (logChosen && q.answer && logChosen !== q.answer) {
        bucket.wrongCount++;
      }
      const siteChosenForCount = siteSel[q.number];
      if (siteChosenForCount && q.answer && siteChosenForCount !== q.answer) {
        bucket.wrongCount++;
      }
      // "wrongQs" = effective still-wrong stems (deduped).
      const siteChosen = siteSel[q.number];
      const key = q.question ? normStem(q.question) : null;
      if (!q.answer || !key) continue;
      // Group considered "done" if user nailed any instance on site.
      if (stemAnyRight.get(key)) continue;
      // Otherwise, is this instance effectively wrong?
      const effective = siteChosen || logChosen;
      const isEffectivelyWrong = effective && effective !== q.answer;
      if (!isEffectivelyWrong) continue;
      // First representative of this stem within this bucket → push.
      if (!seenWrongStemPerBucket[bucket.prefix]) seenWrongStemPerBucket[bucket.prefix] = new Set();
      if (seenWrongStemPerBucket[bucket.prefix].has(key)) continue;
      seenWrongStemPerBucket[bucket.prefix].add(key);
      const source = siteChosen ? "site" : "log";
      bucket.wrongQs.push({
        slug: meta.slug, title: meta.title, number: q.number, code: q.code,
        chosen: effective, correct: q.answer, source,
      });
    }
  }
  // "completed" = had log wrongs, now zero still effectively wrong.
  for (const t of Object.values(byTopic)) {
    t.completed = t.wrongCount > 0 && t.wrongQs.length === 0;
  }

  // Topic list sorted by historical wrongCount desc, then by ICDC weight desc.
  // We deliberately use wrongCount (not wrongQs.length) so the order is stable
  // even as the user completes topics. Completed topics are still shown at
  // their original rank but styled as completed (strikethrough + check).
  const topicList = Object.values(byTopic)
    .filter(t => t.prefix !== "_OTHER" || t.wrongCount > 0)
    .sort((a, b) => {
      if (a.prefix === "_OTHER" && b.prefix !== "_OTHER") return 1;
      if (b.prefix === "_OTHER" && a.prefix !== "_OTHER") return -1;
      if (b.wrongCount !== a.wrongCount) return b.wrongCount - a.wrongCount;
      const aw = activeWeights()[a.prefix] || 0;
      const bw = activeWeights()[b.prefix] || 0;
      return bw - aw;
    });

  // Decide which topic & sub-section is active.
  const parts = (location.hash || "").replace(/^#\/?/, "").split("/");
  // parts[0] = "study"; parts[1] = prefix; parts[2] = sub
  const activePrefix = parts[1] && byTopic[parts[1]] ? parts[1] : null;
  const sub = parts[2] || "guide"; // guide | missed | all

  const sideHtml = `
    <aside class="study-side">
      <h3>Topics</h3>
      <div class="topic-nav">
        <button class="topic-link ${activePrefix === null ? "active" : ""}" data-prefix="">
          <span>Overview</span>
        </button>
        ${topicList.map(t => {
          const badge = t.wrongCount > 0
            ? `<span class="wrong-badge">${t.wrongCount}</span>`
            : `<span class="code-chip">${t.prefix === "_OTHER" ? "?" : t.prefix}</span>`;
          return `<button class="topic-link ${t.prefix === activePrefix ? "active" : ""}" data-prefix="${t.prefix}">
            <span><span class="code-chip" style="margin-right:6px">${t.prefix === "_OTHER" ? "??" : t.prefix}</span>${escapeHtml(t.name)}</span>
            ${badge}
          </button>`;
        }).join("")}
      </div>
    </aside>
  `;

  // Opt-in: on the Same-code practice tab, fold in same-PI-code questions from
  // OTHER clusters (deduped vs this cluster's questions). Loaded here (async)
  // so they render in one pass and share the normal answer wiring below.
  if (activePrefix && activePrefix !== "_OTHER" && sub === "all" && state.crossCluster) {
    const topic = byTopic[activePrefix];
    const seen = new Set();
    for (const it of topic.allQs) {
      const ex = state.exams[it.slug];
      const q = ex && ex.questions.find(x => x.number === it.number);
      if (q) seen.add(normStem(q.question));
    }
    try { topic.crossQs = await crossClusterSameCode(activePrefix, seen); }
    catch { topic.crossQs = []; }
  }

  let mainHtml = "";
  if (!activePrefix) {
    mainHtml = renderStudyOverview(topicList);
  } else {
    mainHtml = renderStudyTopic(byTopic[activePrefix], sub);
  }

  app.innerHTML = `<div class="study-layout">${sideHtml}<div class="study-main">${mainHtml}</div></div>`;

  // Wire nav
  document.querySelectorAll(".topic-link").forEach(el => {
    el.addEventListener("click", () => {
      const p = el.getAttribute("data-prefix");
      location.hash = p ? `#/study/${p}` : `#/study`;
    });
  });

  if (activePrefix) {
    document.querySelectorAll(".sub-tabs button").forEach(el => {
      el.addEventListener("click", () => {
        const s = el.getAttribute("data-sub");
        location.hash = `#/study/${activePrefix}/${s}`;
      });
    });
    const crossCb = document.getElementById("cross-cluster-cb");
    if (crossCb) crossCb.addEventListener("change", () => {
      state.crossCluster = crossCb.checked;
      localStorage.setItem("deca-imce:crossCluster", crossCb.checked ? "1" : "0");
      render(); // re-render Study; renderStudy lazy-loads cross-cluster Qs when on
    });
    document.querySelectorAll(".study-q .opt").forEach(el => {
      el.addEventListener("click", () => {
        const qNum = Number(el.getAttribute("data-q"));
        const slug = el.getAttribute("data-slug");
        const letter = el.getAttribute("data-letter");
        setStudyState(slug, qNum, { chosen: letter, answeredAt: Date.now() });
        updateStudyQuestion(slug, qNum);
        // Live-update the "Review wrongs" count badge so when the user nails
        // a question the "28 to review" counter ticks down immediately.
        refreshWrongsCount(activePrefix);
        // Streak: study tab counts toward goal on the topic's prefix.
        if (activePrefix && activePrefix !== "_OTHER") {
          recordStreakActivity(activePrefix);
          refreshStreakUI();
        }
      });
    });
    document.querySelectorAll(".study-q .reveal-one").forEach(el => {
      el.addEventListener("click", () => {
        const qNum = Number(el.getAttribute("data-q"));
        const slug = el.getAttribute("data-slug");
        const s = getStudyState(slug, qNum);
        setStudyState(slug, qNum, { revealed: !s.revealed });
        updateStudyQuestion(slug, qNum);
      });
    });
    // Per-question "Reset answer" — wipes study + progress + logTest state
    // for that single question, then re-renders the topic so the list updates.
    document.querySelectorAll(".study-q .q-reset").forEach(el => {
      el.addEventListener("click", () => {
        const qNum = Number(el.getAttribute("data-q"));
        const slug = el.getAttribute("data-slug");
        clearStudyAnswer(slug, qNum);
        // Re-render the study view so the question pops off the wrongs list
        // (if it was right) or clears its selected/correct highlight.
        render();
      });
    });
    // Top "Reset all answers" button — wipes every question under this prefix.
    const resetAllBtn = document.querySelector(".wrongs-reset-all");
    if (resetAllBtn) {
      resetAllBtn.addEventListener("click", () => {
        const pfx = resetAllBtn.getAttribute("data-prefix");
        const name = (byTopic[pfx] && byTopic[pfx].name) || pfx;
        if (!confirm(`Reset your picks on every "${name}" question?\n\nThis only deselects the answers you've clicked on this site so you can re-attempt. Your original test logs are NEVER touched — every question you missed in those logs will still be here.`)) return;
        const n = clearStudyAnswersForPrefix(pfx);
        render();
        if (typeof toast === "function") toast(`Reset ${n} answer${n === 1 ? "" : "s"}.`);
      });
    }
    // Initial render of selection state
    document.querySelectorAll(".study-q").forEach(el => {
      const qNum = Number(el.getAttribute("data-q"));
      const slug = el.getAttribute("data-slug");
      updateStudyQuestion(slug, qNum);
    });
    // Flashcards: wire interactivity when that sub-tab is mounted.
    if (sub === "cards" && document.getElementById("fc-card")) {
      wireFlashcards(byTopic[activePrefix]);
    }
  }

  // Clean up any legacy floating tutor UI from previous builds.
  document.querySelectorAll(".tutor-fab, .tutor-panel").forEach(el => el.remove());
}

// Bump this epoch when you want every user's localStorage stats wiped on their
// next page load. Client compares against localStorage and, if different,
// nukes every deca-imce:* key except login identity + the epoch marker itself.
// Server has its own epoch too (POST /api/admin/reset-all bumps it) and the
// client takes max(localConst, server).
const RESET_EPOCH_LOCAL = 6;

function renderStudyOverview(topicList) {
  // "Wrongs to review" KPI uses wrongQs.length (the effective still-wrong
  // list) so it ticks down as the user nails questions and back up when
  // they reset. Sidebar badge + ranking still use wrongCount (historical)
  // so the topic order stays stable.
  const totalWrong = topicList.reduce((n, t) => n + (t.wrongQs ? t.wrongQs.length : 0), 0);
  // Focus KPIs: skip uncoded — we can't study specific codes there.
  const activeTopics = topicList.filter(t => t.wrongCount > 0 && t.prefix !== "_OTHER");
  const top5 = activeTopics.slice(0, 5);
  const activeCount = activeTopics.length;
  return `
    <div class="study-overview">
      <div class="stats-head">
        <h2>Study Plan</h2>
        <p class="hint">Topics are ranked by how many questions you've missed — <strong>your most-missed topic shows at the top</strong> and they descend from there. Click one on the left to dive in.</p>
      </div>
      <div class="kpi-row">
        <div class="kpi accent">
          <div class="k-label">Wrongs to review</div>
          <div class="k-value">${totalWrong.toLocaleString()}</div>
          <div class="k-sub">across ${activeCount} active topic${activeCount === 1 ? "" : "s"}</div>
        </div>
        <div class="kpi">
          <div class="k-label">Focus #1</div>
          <div class="k-value" style="font-size:1.25rem">${top5[0] ? escapeHtml(top5[0].name) : "—"}</div>
          <div class="k-sub">${top5[0] ? top5[0].wrongCount + " missed" : "No wrongs yet"}</div>
        </div>
        <div class="kpi">
          <div class="k-label">Focus #2</div>
          <div class="k-value" style="font-size:1.25rem">${top5[1] ? escapeHtml(top5[1].name) : "—"}</div>
          <div class="k-sub">${top5[1] ? top5[1].wrongCount + " missed" : ""}</div>
        </div>
        <div class="kpi">
          <div class="k-label">Focus #3</div>
          <div class="k-value" style="font-size:1.25rem">${top5[2] ? escapeHtml(top5[2].name) : "—"}</div>
          <div class="k-sub">${top5[2] ? top5[2].wrongCount + " missed" : ""}</div>
        </div>
      </div>
      <div class="panel">
        <h3>How to use this tab</h3>
        <p class="panel-sub">The topic list on the left is personalized to you: <strong>your most-missed topics show at the top</strong>, ordered by how many questions you've gotten wrong (on-site answers and imported test logs both count). For each topic you'll see three sub-pages:</p>
        <ol>
          <li><strong>Study guide</strong> — concise notes with key terms, concepts, and common traps.</li>
          <li><strong>Review wrongs</strong> — every question you've missed with that code prefix, so you can re-attempt.</li>
          <li><strong>Same-code practice</strong> — other questions with that same code prefix you haven't missed, for extra reps.</li>
        </ol>
      </div>
    </div>
  `;
}

function renderStudyTopic(topic, sub) {
  if (!topic) return `<div class="empty">Unknown topic.</div>`;
  const guide = activeGuides()[topic.prefix];
  const weight = activeWeights()[topic.prefix];
  const blueprint = typeof weight === "number"
    ? `<div class="blueprint"><strong>ICDC blueprint:</strong> ≈${weight} question${weight === 1 ? "" : "s"} per exam</div>`
    : "";

  const head = `
    <div class="study-topic-header">
      <div>
        <h2>${escapeHtml(topic.name)} <span class="code-chip">${escapeHtml(topic.prefix)}</span></h2>
        ${blueprint}
      </div>
    </div>
    <div class="sub-tabs">
      <button class="${sub === "guide" ? "active" : ""}" data-sub="guide">Study guide</button>
      <button class="${sub === "cards" ? "active" : ""}" data-sub="cards">Flashcards</button>
      <button class="${sub === "missed" ? "active" : ""}" data-sub="missed">Review wrongs <span class="count">${topic.wrongQs.length}</span></button>
      <button class="${sub === "all" ? "active" : ""}" data-sub="all">Same-code practice <span class="count">${topic.allQs.length - topic.wrongQs.length}</span></button>
    </div>
  `;

  if (sub === "cards") {
    return head + renderFlashcards(guide, topic);
  }
  if (sub === "missed") {
    const toolbar = topic.wrongQs.length > 0
      ? `<div class="wrongs-toolbar">
           <span class="wrongs-toolbar-label">${topic.wrongQs.length} question${topic.wrongQs.length === 1 ? "" : "s"} to review</span>
           <button class="btn ghost wrongs-reset-all" data-prefix="${escapeHtml(topic.prefix)}">Reset all answers</button>
         </div>`
      : "";
    return head + toolbar + renderStudyQuestionList(topic.wrongQs,
      topic.wrongQs.length === 0
        ? "You haven't missed any questions with this code yet. Check 'Same-code practice' for more reps."
        : null,
      { showPrevious: true, showReset: true });
  }
  if (sub === "all") {
    const wrongSet = new Set(topic.wrongQs.map(q => `${q.slug}:${q.number}`));
    const rest = topic.allQs.filter(q => !wrongSet.has(`${q.slug}:${q.number}`));
    const toggle = `
      <label class="cross-toggle">
        <input type="checkbox" id="cross-cluster-cb" ${state.crossCluster ? "checked" : ""} />
        <span>Include same-code (<strong>${escapeHtml(topic.prefix)}</strong>) questions from other clusters</span>
      </label>`;
    let body = renderStudyQuestionList(rest,
      rest.length === 0 ? "No other practice questions with this code are available in this cluster." : null,
      { showPrevious: false });
    if (state.crossCluster) {
      const cross = topic.crossQs || [];
      if (cross.length) {
        body += `<div class="cross-divider">From other clusters · <strong>${cross.length}</strong> more ${escapeHtml(topic.prefix)} question${cross.length === 1 ? "" : "s"} <span class="hint">— deduplicated; practice only, doesn't affect this cluster's stats</span></div>`;
        body += renderStudyQuestionList(cross, null, { showPrevious: false });
      } else {
        body += `<div class="cross-divider hint">No additional same-code questions found in other clusters.</div>`;
      }
    }
    return head + toggle + body;
  }
  // Default: study guide
  return head + renderStudyGuide(guide, topic);
}

function renderStudyGuide(guide, topic) {
  if (!guide) {
    return `<div class="guide-body"><p>No study guide yet for <strong>${escapeHtml(topic.prefix)}</strong>.</p></div>`;
  }
  const sections = (guide.sections || []).map(sec => `
    <h4>${escapeHtml(sec.h)}</h4>
    <ul>${sec.items.map(it => `<li>${it}</li>`).join("")}</ul>
  `).join("");
  const traps = guide.traps
    ? `<div class="callout"><strong>Common traps:</strong> ${guide.traps}</div>`
    : "";
  return `
    <div class="guide-body">
      <h3>${escapeHtml(guide.name)} — overview</h3>
      <p>${guide.summary}</p>
      ${sections}
      ${traps}
    </div>
  `;
}

// Build flashcards from a topic's study guide.
// Only items that LOOK like a term/definition produce a card:
//   "<strong>Term</strong>: definition…"
//   "<strong>Term</strong> — definition…"
//   "<strong>Term</strong> is/are/means …"
// Front = the term. Back = the rest of the item (with HTML intact).
// Overview sentences, traps, lists, and meta-commentary are skipped so the
// student is tested on concrete concepts, not paragraphs.
function stripTags(s) { return String(s || "").replace(/<[^>]+>/g, "").trim(); }

const FLASHCARD_SKIP_TERMS = /^(common\s+trap|another\s+trap|test\s+trap|deca\s+answer\s+trap|quick\s+disambiguation|another\s+angle|key\s+insight|secondary\s+benefits?|top\s+rule|separately|distinction|trap|note|tip|example|quick\s+test)\b/i;

function extractCard(itemHtml, sectionHeading) {
  // Case A: "<strong>Term</strong>[:|—|–|-|=] rest"
  const mA = itemHtml.match(/^\s*<strong>([^<]+)<\/strong>\s*[:\—\–\-=]\s*([\s\S]*)$/);
  if (mA) return makeCard(mA[1], mA[2], itemHtml, sectionHeading);
  // Case B: "<strong>Term</strong> is/are/means/refers to rest"
  const mB = itemHtml.match(/^\s*<strong>([^<]+)<\/strong>\s+((?:is|are|means|refers\s+to)\b[\s\S]*)$/i);
  if (mB) return makeCard(mB[1], mB[2], itemHtml, sectionHeading);
  return null;
}
function makeCard(rawTerm, rawBack, fullItem, sectionHeading) {
  const term = rawTerm.replace(/[—–\-:]+\s*$/, "").trim();
  const plainTerm = stripTags(term);
  if (!plainTerm || plainTerm.length > 70) return null;
  if (plainTerm.includes("→")) return null;
  if (FLASHCARD_SKIP_TERMS.test(plainTerm)) return null;
  const backText = rawBack.trim();
  if (stripTags(backText).length < 25) return null;
  return { front: plainTerm, back: backText, section: sectionHeading };
}

function buildFlashcardDeck(guide) {
  if (!guide) return [];
  const cards = [];
  const seen = new Set();
  for (const sec of guide.sections || []) {
    for (const item of sec.items || []) {
      const card = extractCard(item, sec.h);
      if (!card) continue;
      // De-duplicate by term (case-insensitive).
      const key = card.front.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      cards.push(card);
    }
  }
  return cards;
}

// --- Flashcard confidence (Quizlet-style Learn mode) ---
// Per-user, per-topic map of cardKey -> "weak"|"good"|"confident".
// Confident cards are removed from future decks until the user resets.
function fcKey(prefix) { return `deca-imce:user:${userScope()}:fc:${prefix}`; }
function loadFcState(prefix) {
  try { return JSON.parse(localStorage.getItem(fcKey(prefix)) || "{}"); }
  catch { return {}; }
}
function saveFcState(prefix, map) {
  localStorage.setItem(fcKey(prefix), JSON.stringify(map));
}
function cardKeyOf(c) { return (c.front || "").trim().toLowerCase(); }

function renderFlashcards(guide, topic) {
  const fullDeck = buildFlashcardDeck(guide);
  if (fullDeck.length === 0) {
    return `<div class="empty">No flashcards for <strong>${escapeHtml(topic.prefix)}</strong> yet.</div>`;
  }
  const state = loadFcState(topic.prefix);
  let confident = 0, good = 0, weak = 0;
  for (const c of fullDeck) {
    const s = state[cardKeyOf(c)];
    if (s === "confident") confident++;
    else if (s === "good") good++;
    else if (s === "weak") weak++;
  }
  const total = fullDeck.length;
  const pct = Math.round((confident / total) * 100);
  return `
    <div class="flashcards" data-topic="${topic.prefix}">
      <div class="fc-header">
        <div class="fc-progress-ring">
          <div class="fc-ring-label"><strong>${confident}</strong><span>/ ${total}</span></div>
        </div>
        <div class="fc-legend">
          <div><span class="fc-dot fc-dot-confident"></span> Confident <strong>${confident}</strong></div>
          <div><span class="fc-dot fc-dot-good"></span> Good <strong>${good}</strong></div>
          <div><span class="fc-dot fc-dot-weak"></span> Weak <strong>${weak}</strong></div>
        </div>
        <div class="fc-header-actions">
          <button class="btn ghost" id="fc-reset">Reset progress</button>
        </div>
      </div>
      <div class="fc-meta">Click the card to flip. Then rate yourself — <strong>Weak</strong> (left) keeps it in rotation, <strong>Good</strong> (middle) shows it less often, <strong>Confident</strong> (right) retires it. Shortcuts: <kbd>Space</kbd> flip · <kbd>1</kbd>/<kbd>2</kbd>/<kbd>3</kbd> rate.</div>
      <div class="fc-stage">
        <div class="fc-card" id="fc-card" tabindex="0">
          <div class="fc-inner">
            <div class="fc-face fc-front">
              <div class="fc-section" id="fc-section"></div>
              <div class="fc-term" id="fc-term"></div>
              <div class="fc-hint">click to flip</div>
            </div>
            <div class="fc-face fc-back">
              <div class="fc-body" id="fc-body"></div>
              <div class="fc-hint fc-hint-back">rate yourself below ↓</div>
            </div>
          </div>
        </div>
      </div>
      <div class="fc-rate-row" id="fc-rate-row">
        <button class="btn fc-rate fc-rate-weak" id="fc-weak" disabled>
          <span class="fc-rate-ico">✗</span>
          <span class="fc-rate-lbl">Weak</span>
          <span class="fc-rate-kbd">1</span>
        </button>
        <button class="btn fc-rate fc-rate-good" id="fc-good" disabled>
          <span class="fc-rate-ico">≈</span>
          <span class="fc-rate-lbl">Good</span>
          <span class="fc-rate-kbd">2</span>
        </button>
        <button class="btn fc-rate fc-rate-confident" id="fc-confident" disabled>
          <span class="fc-rate-ico">✓</span>
          <span class="fc-rate-lbl">Confident</span>
          <span class="fc-rate-kbd">3</span>
        </button>
      </div>
      <div class="fc-controls">
        <button class="btn ghost" id="fc-skip">Skip card →</button>
        <span class="fc-session-progress" id="fc-session-progress"></span>
        <button class="btn ghost" id="fc-shuffle">Shuffle remaining</button>
      </div>
    </div>
  `;
}

function wireFlashcards(topic) {
  const guide = activeGuides()[topic.prefix];
  const fullDeck = buildFlashcardDeck(guide);
  if (fullDeck.length === 0) return;

  // Tear down any previous flashcard keydown listener (per-topic OR mega)
  // before installing ours. See wireMegaFlashcards for the full rationale —
  // stale wires keep handling 1/2/3 and paint wrong counts otherwise.
  if (window.__decaFcKeyHandler) {
    document.removeEventListener("keydown", window.__decaFcKeyHandler);
    window.__decaFcKeyHandler = null;
  }

  // Wire-instance id stamped on the DOM so any stale wire's count repaint
  // is rejected by updateHeaderCounts.
  const wireId = "wire-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
  const stampWireId = () => {
    const hdr = document.querySelector(".flashcards .fc-header");
    if (hdr) hdr.dataset.wireId = wireId;
  };

  // Build the session queue: drop "confident" cards; show weak + good + unrated.
  // Order: weak first (need most review), then unrated, then good.
  let confidenceMap = loadFcState(topic.prefix);
  const rank = (c) => {
    const s = confidenceMap[cardKeyOf(c)];
    if (s === "weak") return 0;
    if (s === "good") return 2;
    if (s === "confident") return 99;
    return 1; // unrated
  };
  let queue = fullDeck
    .filter(c => confidenceMap[cardKeyOf(c)] !== "confident")
    .slice()
    .sort((a, b) => rank(a) - rank(b));

  const stageEl = document.querySelector(".fc-stage");
  const card = document.getElementById("fc-card");
  const front = document.getElementById("fc-term");
  const sectionEl = document.getElementById("fc-section");
  const back = document.getElementById("fc-body");
  const sessProg = document.getElementById("fc-session-progress");
  const rateRow = document.getElementById("fc-rate-row");
  const btnWeak = document.getElementById("fc-weak");
  const btnGood = document.getElementById("fc-good");
  const btnConf = document.getElementById("fc-confident");

  let flipped = false;
  let completed = 0; // cards rated this session (any rating)
  const totalSession = queue.length;

  const showDone = () => {
    const state = loadFcState(topic.prefix);
    let confident = 0;
    for (const c of fullDeck) if (state[cardKeyOf(c)] === "confident") confident++;
    const done = confident === fullDeck.length;
    stageEl.innerHTML = `
      <div class="fc-done">
        <div class="fc-done-ico">${done ? "🏆" : "✓"}</div>
        <h3>${done ? "Deck mastered!" : "Session complete"}</h3>
        <p>${done
          ? `You've marked all ${fullDeck.length} cards as Confident. Reset to review them again.`
          : `${confident} of ${fullDeck.length} cards are now Confident. Cards rated Weak or Good will reappear next session.`}</p>
        <div class="fc-done-actions">
          <button class="btn primary" id="fc-again">Review again</button>
          <button class="btn ghost" id="fc-reset2">Reset all progress</button>
        </div>
      </div>
    `;
    rateRow.style.display = "none";
    document.getElementById("fc-skip").style.display = "none";
    document.getElementById("fc-shuffle").style.display = "none";
    sessProg.textContent = `${completed} / ${totalSession} rated this session`;
    document.getElementById("fc-again").addEventListener("click", () => {
      // Rebuild queue including any non-confident cards (re-runs session)
      location.hash = location.hash; // force re-render
      setTimeout(() => { render(); }, 0); // re-render this view
      // Simplest: re-invoke the whole sub-render
      const subHash = location.hash;
      location.hash = "#/_fcreload_";
      setTimeout(() => { location.hash = subHash; }, 0);
    });
    document.getElementById("fc-reset2").addEventListener("click", () => {
      saveFcState(topic.prefix, {});
      const subHash = location.hash;
      location.hash = "#/_fcreload_";
      setTimeout(() => { location.hash = subHash; }, 0);
    });
  };

  const updateProgress = () => {
    sessProg.textContent = `${completed} / ${totalSession} this session`;
  };

  const render = () => {
    if (queue.length === 0) { showDone(); return; }
    const c = queue[0];
    sectionEl.textContent = c.section;
    front.textContent = c.front;
    back.innerHTML = c.back;
    flipped = false;
    card.classList.remove("flipped");
    // Disable rating until flipped (must see the answer first)
    [btnWeak, btnGood, btnConf].forEach(b => b.disabled = true);
    updateProgress();
  };

  const flip = () => {
    flipped = !flipped;
    card.classList.toggle("flipped", flipped);
    [btnWeak, btnGood, btnConf].forEach(b => b.disabled = !flipped);
  };

  // Live-repaint the Confident / Good / Weak numbers in the header so
  // the counter ticks as the user rates, no reload required.
  const updateHeaderCounts = () => {
    const hdr = document.querySelector(".flashcards .fc-header");
    if (!hdr) return;
    if (hdr.dataset.wireId && hdr.dataset.wireId !== wireId) return; // stale wire, bail
    let confident = 0, good = 0, weak = 0;
    for (const c of fullDeck) {
      const s = confidenceMap[cardKeyOf(c)];
      if (s === "confident") confident++;
      else if (s === "good") good++;
      else if (s === "weak") weak++;
    }
    // Hard cap so display can never exceed deck size.
    const total = fullDeck.length;
    confident = Math.min(confident, total);
    good = Math.min(good, total);
    weak = Math.min(weak, total);
    const ringStrong = hdr.querySelector(".fc-ring-label strong");
    const ringTotal  = hdr.querySelector(".fc-ring-label span");
    if (ringStrong) ringStrong.textContent = String(confident);
    if (ringTotal)  ringTotal.textContent  = `/ ${total}`;
    const legendItems = hdr.querySelectorAll(".fc-legend > div");
    if (legendItems[0]) legendItems[0].querySelector("strong").textContent = String(confident);
    if (legendItems[1]) legendItems[1].querySelector("strong").textContent = String(good);
    if (legendItems[2]) legendItems[2].querySelector("strong").textContent = String(weak);
  };

  const rate = (level) => {
    if (queue.length === 0) return;
    if (!flipped) return; // must flip first
    const c = queue.shift();
    confidenceMap[cardKeyOf(c)] = level;
    saveFcState(topic.prefix, confidenceMap);
    // Cross-device sync — fc: keys are auto-snapshotted by syncProfilePush.
    try { if (state.user) syncProfilePushDebounced(state.user, 500); } catch {}
    completed++;
    // Weak cards get re-queued toward the end of the session so they come back.
    // Good cards are done for this session. Confident is retired.
    if (level === "weak") {
      // Insert 3-5 positions ahead so it doesn't come back immediately.
      const insertAt = Math.min(queue.length, 3 + Math.floor(Math.random() * 3));
      queue.splice(insertAt, 0, c);
    }
    updateHeaderCounts();
    render();
  };

  const skip = () => {
    if (queue.length <= 1) return;
    const c = queue.shift();
    queue.push(c);
    render();
  };

  const shuffle = () => {
    for (let k = queue.length - 1; k > 0; k--) {
      const j = Math.floor(Math.random() * (k + 1));
      [queue[k], queue[j]] = [queue[j], queue[k]];
    }
    render();
  };

  card.addEventListener("click", flip);
  btnWeak.addEventListener("click", () => rate("weak"));
  btnGood.addEventListener("click", () => rate("good"));
  btnConf.addEventListener("click", () => rate("confident"));
  document.getElementById("fc-skip").addEventListener("click", skip);
  document.getElementById("fc-shuffle").addEventListener("click", shuffle);
  document.getElementById("fc-reset").addEventListener("click", () => {
    if (!confirm("Reset confidence for all " + fullDeck.length + " cards in this topic?")) return;
    saveFcState(topic.prefix, {});
    const subHash = location.hash;
    location.hash = "#/_fcreload_";
    setTimeout(() => { location.hash = subHash; }, 0);
  });

  const onKey = (e) => {
    if (!document.getElementById("fc-card")) {
      document.removeEventListener("keydown", onKey); return;
    }
    const tag = (e.target && e.target.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    if (e.key === " " || e.key === "Enter") { e.preventDefault(); flip(); }
    else if (e.key === "1") { e.preventDefault(); if (flipped) rate("weak"); }
    else if (e.key === "2") { e.preventDefault(); if (flipped) rate("good"); }
    else if (e.key === "3") { e.preventDefault(); if (flipped) rate("confident"); }
    else if (e.key === "ArrowRight") { e.preventDefault(); skip(); }
  };
  window.__decaFcKeyHandler = onKey;
  document.addEventListener("keydown", onKey);
  stampWireId();
  card.focus();
  render();
}

// ============================================================
//                    MEGA FLASHCARDS
// ============================================================
// Same concept as per-topic flashcards in the Study tab, but lets the
// user mix multiple topics into one deck (or include ALL topics). Lives
// inside the Question Bank page as an alternate "mode". Confidence for
// each card is saved back to its ORIGINAL topic's state, so if the user
// marks "Penetration pricing" Confident here, it stays Confident when
// they later study Pricing alone.

function buildMegaFlashcardDeck(selectedPrefixes) {
  const allPrefixes = Object.keys(activeGuides());
  const prefixes = (selectedPrefixes && selectedPrefixes.length)
    ? selectedPrefixes.filter(p => activeGuides()[p])
    : allPrefixes;
  const cards = [];
  const seen = new Set();
  for (const prefix of prefixes) {
    const guide = activeGuides()[prefix];
    if (!guide) continue;
    for (const sec of guide.sections || []) {
      for (const item of sec.items || []) {
        const card = extractCard(item, sec.h);
        if (!card) continue;
        const key = card.front.toLowerCase();
        if (seen.has(key)) continue; // de-dupe across topics too
        seen.add(key);
        cards.push({
          ...card,
          topicPrefix: prefix,
          topicName: guide.name || prefix,
        });
      }
    }
  }
  return cards;
}

function renderMegaFlashcards(selectedPrefixes) {
  const fullDeck = buildMegaFlashcardDeck(selectedPrefixes);
  const allPrefixes = Object.keys(activeGuides());
  const activePrefixes = (selectedPrefixes && selectedPrefixes.length) ? selectedPrefixes : allPrefixes;
  const scopeLabel = (selectedPrefixes && selectedPrefixes.length)
    ? `${selectedPrefixes.length} topic${selectedPrefixes.length === 1 ? "" : "s"}`
    : `All ${allPrefixes.length} topics`;

  if (fullDeck.length === 0) {
    return `
      <div class="mega-fc">
        <div class="mega-fc-head">
          <h3>🧠 Mega Flashcards</h3>
          <p class="hint">Pick any mix of topics above, or leave them all off to include every topic.</p>
        </div>
        <div class="empty" style="padding:40px">No flashcards in the selected topics yet.</div>
      </div>
    `;
  }

  // Aggregate confidence across every card's own topic state.
  let confident = 0, good = 0, weak = 0;
  const stateCache = {};
  for (const c of fullDeck) {
    if (!stateCache[c.topicPrefix]) stateCache[c.topicPrefix] = loadFcState(c.topicPrefix);
    const s = stateCache[c.topicPrefix][cardKeyOf(c)];
    if (s === "confident") confident++;
    else if (s === "good") good++;
    else if (s === "weak") weak++;
  }
  const total = fullDeck.length;

  return `
    <div class="mega-fc">
      <div class="mega-fc-head">
        <h3>🧠 Mega Flashcards</h3>
        <p class="hint">Deck scope: <strong>${escapeHtml(scopeLabel)}</strong> · ${total} card${total === 1 ? "" : "s"}. Confidence is shared with the per-topic flashcards in the Study tab.</p>
      </div>
      <div class="flashcards mega" data-topics="${escapeHtml(activePrefixes.join(","))}">
        <div class="fc-header">
          <div class="fc-progress-ring">
            <div class="fc-ring-label"><strong>${confident}</strong><span>/ ${total}</span></div>
          </div>
          <div class="fc-legend">
            <div><span class="fc-dot fc-dot-confident"></span> Confident <strong>${confident}</strong></div>
            <div><span class="fc-dot fc-dot-good"></span> Good <strong>${good}</strong></div>
            <div><span class="fc-dot fc-dot-weak"></span> Weak <strong>${weak}</strong></div>
          </div>
          <div class="fc-header-actions">
            <button class="btn ghost" id="mfc-reset">Reset progress</button>
          </div>
        </div>
        <div class="fc-meta">Click the card to flip. Then rate yourself — <strong>Weak</strong> (left) keeps it in rotation, <strong>Good</strong> (middle) shows it less often, <strong>Confident</strong> (right) retires it. Shortcuts: <kbd>Space</kbd> flip · <kbd>1</kbd>/<kbd>2</kbd>/<kbd>3</kbd> rate.</div>
        <div class="fc-stage">
          <div class="fc-card" id="mfc-card" tabindex="0">
            <div class="fc-inner">
              <div class="fc-face fc-front">
                <div class="fc-section"><span class="mfc-topic-badge" id="mfc-topic"></span> <span id="mfc-section"></span></div>
                <div class="fc-term" id="mfc-term"></div>
                <div class="fc-hint">click to flip</div>
              </div>
              <div class="fc-face fc-back">
                <div class="fc-body" id="mfc-body"></div>
                <div class="fc-hint fc-hint-back">rate yourself below ↓</div>
              </div>
            </div>
          </div>
        </div>
        <div class="fc-rate-row" id="mfc-rate-row">
          <button class="btn fc-rate fc-rate-weak" id="mfc-weak" disabled>
            <span class="fc-rate-ico">✗</span>
            <span class="fc-rate-lbl">Weak</span>
            <span class="fc-rate-kbd">1</span>
          </button>
          <button class="btn fc-rate fc-rate-good" id="mfc-good" disabled>
            <span class="fc-rate-ico">≈</span>
            <span class="fc-rate-lbl">Good</span>
            <span class="fc-rate-kbd">2</span>
          </button>
          <button class="btn fc-rate fc-rate-confident" id="mfc-confident" disabled>
            <span class="fc-rate-ico">✓</span>
            <span class="fc-rate-lbl">Confident</span>
            <span class="fc-rate-kbd">3</span>
          </button>
        </div>
        <div class="fc-controls">
          <button class="btn ghost" id="mfc-skip">Skip card →</button>
          <span class="fc-session-progress" id="mfc-session-progress"></span>
          <button class="btn ghost" id="mfc-shuffle">Shuffle remaining</button>
        </div>
      </div>
    </div>
  `;
}

// ---- Post-flashcard-session quiz helpers ----
// Given a term (card front) plus the card's topic prefix, find real exam
// questions in the pool that reference the term — so we can test whether
// the user actually understands it, not just recognized it on a card.
// Match is whole-word, case-insensitive, against the question text + all
// four option texts. Topic prefix is required so we don't mistakenly
// pull an unrelated question that happens to share a common English word.
function findQuestionsForTerm(term, topicPrefix) {
  if (!term || term.length < 3) return [];
  const cleaned = String(term).trim();
  // Escape regex metacharacters in the term before wrapping it in word
  // boundaries. Without this, terms like "C.O.D." blow up the regex.
  const esc = cleaned.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\b${esc}\\b`, "i");
  const matches = [];
  for (const meta of state.index || []) {
    if (!meta.available) continue;
    const exam = state.exams[meta.slug];
    if (!exam) continue;
    for (const q of exam.questions) {
      if (!q.answer) continue;
      if (topicPrefix) {
        const qp = q.code ? q.code.split(":")[0] : "_OTHER";
        if (qp !== topicPrefix) continue;
      }
      const optsText = ["A","B","C","D"].map(L => (q.options && q.options[L]) || "").join(" ");
      const bag = (q.question || "") + " " + optsText;
      if (re.test(bag)) matches.push({ slug: meta.slug, title: meta.title, number: q.number, q });
    }
  }
  return matches;
}

// Build a short post-session quiz drawn from the cards the user just
// rated. Pulls up to `perTerm` questions per term, capped at `target`
// total. Dedupes across cards so the same question can't appear twice.
function buildFlashcardPostQuiz(ratedCards, target = 8, perTerm = 2) {
  if (!ratedCards || ratedCards.length === 0) return [];
  const picks = [];
  const seenQ = new Set();
  // Shuffle rated order so the first terms don't monopolize the quiz.
  const cards = ratedCards.slice();
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  for (const c of cards) {
    const candidates = findQuestionsForTerm(c.front, c.topicPrefix);
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    let added = 0;
    for (const m of candidates) {
      const k = `${m.slug}#${m.number}`;
      if (seenQ.has(k)) continue;
      seenQ.add(k);
      picks.push({ ...m, sourceCard: c });
      added++;
      if (added >= perTerm) break;
      if (picks.length >= target) break;
    }
    if (picks.length >= target) break;
  }
  return picks.slice(0, target);
}

function wireMegaFlashcards(selectedPrefixes) {
  const fullDeck = buildMegaFlashcardDeck(selectedPrefixes);
  if (fullDeck.length === 0) return;

  // Tear down any previous flashcard keydown listener before installing
  // ours. Without this, a stale wire (e.g. user changed topic chips and
  // a fresh deck got built) keeps responding to 1/2/3 and runs its OLD
  // rate() against its OLD fullDeck — then its updateHeaderCounts
  // paints the OLD (larger) confident count onto the NEW (smaller)
  // ring, producing values like "29 / 28".
  if (window.__decaFcKeyHandler) {
    document.removeEventListener("keydown", window.__decaFcKeyHandler);
    window.__decaFcKeyHandler = null;
  }

  // Per-topic confidence cache. Any rating writes straight back to the
  // card's original topic bucket so it syncs with the per-topic deck.
  const stateCache = {};
  const getConf = (c) => {
    if (!stateCache[c.topicPrefix]) stateCache[c.topicPrefix] = loadFcState(c.topicPrefix);
    return stateCache[c.topicPrefix][cardKeyOf(c)];
  };
  const setConf = (c, level) => {
    if (!stateCache[c.topicPrefix]) stateCache[c.topicPrefix] = loadFcState(c.topicPrefix);
    stateCache[c.topicPrefix][cardKeyOf(c)] = level;
    saveFcState(c.topicPrefix, stateCache[c.topicPrefix]);
    // Persist to Firestore too so progress follows the user across
    // devices/browsers. syncProfilePush already snapshots every
    // `deca-imce:user:<name>:...` key, so fc: state is auto-included.
    try { if (state.user) syncProfilePushDebounced(state.user, 500); } catch {}
  };
  const clearAllConf = () => {
    const touched = new Set(fullDeck.map(c => c.topicPrefix));
    for (const p of touched) {
      const st = loadFcState(p);
      let changed = false;
      for (const c of fullDeck) {
        if (c.topicPrefix !== p) continue;
        const k = cardKeyOf(c);
        if (st[k]) { delete st[k]; changed = true; }
      }
      if (changed) saveFcState(p, st);
    }
    try { if (state.user) syncProfilePushDebounced(state.user, 500); } catch {}
  };

  // Wire-instance id stamped on the DOM. Any updateHeaderCounts call
  // from a STALE wire (whose DOM has been replaced) sees a different
  // id and bails out instead of painting wrong numbers into the live
  // mega-fc DOM that belongs to a different deck.
  const wireId = "wire-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
  const stampWireId = () => {
    const hdr = document.querySelector(".mega-fc .fc-header");
    if (hdr) hdr.dataset.wireId = wireId;
  };

  // Recompute Confident/Good/Weak totals from the live stateCache and
  // paint them into the header — called after every rate so the user
  // sees numbers tick without a reload.
  const updateHeaderCounts = () => {
    const hdr = document.querySelector(".mega-fc .fc-header");
    if (!hdr) return;
    if (hdr.dataset.wireId && hdr.dataset.wireId !== wireId) return; // stale wire, bail
    let confident = 0, good = 0, weak = 0;
    for (const c of fullDeck) {
      const s = getConf(c);
      if (s === "confident") confident++;
      else if (s === "good") good++;
      else if (s === "weak") weak++;
    }
    // Hard cap so the display can never exceed the deck size, even if
    // some other code path corrupts the cache.
    const total = fullDeck.length;
    confident = Math.min(confident, total);
    good = Math.min(good, total);
    weak = Math.min(weak, total);
    const ringStrong = hdr.querySelector(".fc-ring-label strong");
    const ringTotal  = hdr.querySelector(".fc-ring-label span");
    if (ringStrong) ringStrong.textContent = String(confident);
    if (ringTotal)  ringTotal.textContent  = `/ ${total}`;
    const legendItems = hdr.querySelectorAll(".fc-legend > div");
    if (legendItems[0]) legendItems[0].querySelector("strong").textContent = String(confident);
    if (legendItems[1]) legendItems[1].querySelector("strong").textContent = String(good);
    if (legendItems[2]) legendItems[2].querySelector("strong").textContent = String(weak);
  };

  const rank = (c) => {
    const s = getConf(c);
    if (s === "weak") return 0;
    if (s === "good") return 2;
    if (s === "confident") return 99;
    return 1;
  };
  let queue = fullDeck
    .filter(c => getConf(c) !== "confident")
    .slice()
    .sort((a, b) => rank(a) - rank(b));

  const stageEl = document.querySelector(".mega-fc .fc-stage");
  const card = document.getElementById("mfc-card");
  const front = document.getElementById("mfc-term");
  const topicBadge = document.getElementById("mfc-topic");
  const sectionEl = document.getElementById("mfc-section");
  const back = document.getElementById("mfc-body");
  const sessProg = document.getElementById("mfc-session-progress");
  const rateRow = document.getElementById("mfc-rate-row");
  const btnWeak = document.getElementById("mfc-weak");
  const btnGood = document.getElementById("mfc-good");
  const btnConf = document.getElementById("mfc-confident");

  if (!card) return;

  let flipped = false;
  let completed = 0;
  const totalSession = queue.length;
  // Cards the user rated during THIS session, in order. Fed into the
  // post-session quiz so we test them on what they just studied.
  const sessionRated = [];
  let postQuizRan = false;
  // Filled in by the quiz so showDone can surface the results.
  let lastQuizStats = null;

  const hideInteractiveRow = () => {
    rateRow.style.display = "none";
    const skipBtn = document.getElementById("mfc-skip"); if (skipBtn) skipBtn.style.display = "none";
    const shufBtn = document.getElementById("mfc-shuffle"); if (shufBtn) shufBtn.style.display = "none";
  };

  const showDone = () => {
    let confident = 0;
    for (const c of fullDeck) if (getConf(c) === "confident") confident++;
    const done = confident === fullDeck.length;
    const quizLine = lastQuizStats ? `
      <div class="fc-quiz-recap">
        Quiz: <strong>${lastQuizStats.right}</strong> / ${lastQuizStats.total} correct${lastQuizStats.demoted
          ? ` · <span class="fc-quiz-recap-weak">${lastQuizStats.demoted} term${lastQuizStats.demoted === 1 ? "" : "s"} moved back to Weak</span>`
          : ""}.
      </div>` : "";
    stageEl.innerHTML = `
      <div class="fc-done">
        <div class="fc-done-ico">${done ? "🏆" : "✓"}</div>
        <h3>${done ? "Mega deck mastered!" : "Session complete"}</h3>
        <p>${done
          ? `You've marked all ${fullDeck.length} cards as Confident. Reset to review them again.`
          : `${confident} of ${fullDeck.length} cards are Confident. Cards rated Weak or Good will reappear next session.`}</p>
        ${quizLine}
        <div class="fc-done-actions">
          <button class="btn primary" id="mfc-again">Review again</button>
          <button class="btn ghost" id="mfc-reset2">Reset all progress</button>
        </div>
      </div>
    `;
    hideInteractiveRow();
    sessProg.textContent = `${completed} / ${totalSession} rated this session${lastQuizStats ? ` · quiz ${lastQuizStats.right}/${lastQuizStats.total}` : ""}`;
    const againBtn = document.getElementById("mfc-again");
    if (againBtn) againBtn.addEventListener("click", () => renderQuestionBank());
    const reset2Btn = document.getElementById("mfc-reset2");
    if (reset2Btn) reset2Btn.addEventListener("click", () => {
      clearAllConf();
      renderQuestionBank();
    });
  };

  // Post-session quiz — actually tests whether the user understands the
  // terms they just reviewed, using real exam questions. Missing a
  // question demotes that card back to Weak so it cycles in again.
  const startPostQuiz = () => {
    const picks = buildFlashcardPostQuiz(sessionRated, 8, 2);
    if (picks.length === 0) {
      // No matching questions exist for any rated term in the selected
      // topic(s). Fall straight through to the done panel.
      showDone();
      return;
    }
    hideInteractiveRow();
    let qIdx = 0;
    const results = []; // { right, pick }
    const demotedTerms = new Set();

    const renderQuiz = () => {
      if (qIdx >= picks.length) {
        const right = results.filter(r => r.right).length;
        lastQuizStats = { right, total: results.length, demoted: demotedTerms.size };
        showDone();
        return;
      }
      const pick = picks[qIdx];
      const q = pick.q;
      const optsHtml = ["A","B","C","D"].map(L => {
        const text = (q.options && q.options[L]) || "";
        if (!text) return "";
        return `<button class="fc-quiz-opt" data-letter="${L}">
          <span class="fc-quiz-letter">${L}</span>
          <span class="fc-quiz-text">${escapeHtml(text)}</span>
        </button>`;
      }).join("");
      stageEl.innerHTML = `
        <div class="fc-quiz">
          <div class="fc-quiz-head">
            <div class="fc-quiz-head-l">
              <span class="mfc-topic-badge">${escapeHtml(pick.sourceCard.topicPrefix)}</span>
              <span class="fc-quiz-term">tests: <strong>${escapeHtml(pick.sourceCard.front)}</strong></span>
            </div>
            <span class="fc-quiz-prog">Question ${qIdx + 1} / ${picks.length}</span>
          </div>
          <div class="fc-quiz-q">${escapeHtml(q.question)}</div>
          <div class="fc-quiz-opts">${optsHtml}</div>
          <div class="fc-quiz-verdict hidden"></div>
          <div class="fc-quiz-nav"><button class="btn primary hidden" id="mfc-quiz-next">${qIdx + 1 === picks.length ? "Finish quiz" : "Next →"}</button></div>
        </div>
      `;
      // Option click → lock, verdict, demote on wrong
      stageEl.querySelectorAll(".fc-quiz-opt").forEach(el => {
        el.addEventListener("click", () => {
          const letter = el.getAttribute("data-letter");
          const correct = q.answer;
          const right = letter === correct;
          stageEl.querySelectorAll(".fc-quiz-opt").forEach(opt => {
            const L = opt.getAttribute("data-letter");
            if (L === correct) opt.classList.add("right");
            if (L === letter && !right) opt.classList.add("wrong");
            opt.disabled = true;
            opt.classList.add("locked");
          });
          const verdictEl = stageEl.querySelector(".fc-quiz-verdict");
          verdictEl.classList.remove("hidden");
          if (right) {
            verdictEl.classList.add("ok");
            const explain = (q.explanation || "").split(". ").slice(0, 2).join(". ");
            verdictEl.innerHTML = `<strong>Correct.</strong> ${escapeHtml(explain)}`;
          } else {
            // Demote the card back to Weak so it comes around again.
            setConf(pick.sourceCard, "weak");
            demotedTerms.add(pick.sourceCard.front);
            updateHeaderCounts();
            const correctText = (q.options && q.options[correct]) || "";
            verdictEl.classList.add("bad");
            verdictEl.innerHTML = `<strong>Answer: ${correct} — ${escapeHtml(correctText)}.</strong> Marked <em>${escapeHtml(pick.sourceCard.front)}</em> as <strong>Weak</strong> for another round.`;
          }
          results.push({ right, pick });
          const nextBtn = document.getElementById("mfc-quiz-next");
          nextBtn.classList.remove("hidden");
          nextBtn.focus();
        });
      });
      const nb = document.getElementById("mfc-quiz-next");
      if (nb) nb.addEventListener("click", () => { qIdx++; renderQuiz(); });
      sessProg.textContent = `${completed} / ${totalSession} rated · quiz ${qIdx + 1}/${picks.length}`;
    };
    renderQuiz();
  };

  const updateProgress = () => {
    sessProg.textContent = `${completed} / ${totalSession} this session`;
  };

  const renderTop = () => {
    if (queue.length === 0) {
      // Session just drained. Try to test what they just learned with
      // real questions; fall back to the plain done panel if nothing
      // matches or the user hasn't actually rated anything.
      if (!postQuizRan && sessionRated.length > 0) {
        postQuizRan = true;
        startPostQuiz();
      } else {
        showDone();
      }
      return;
    }
    const c = queue[0];
    topicBadge.textContent = c.topicPrefix;
    topicBadge.title = c.topicName;
    sectionEl.textContent = c.section || "";
    front.textContent = c.front;
    back.innerHTML = c.back;
    flipped = false;
    card.classList.remove("flipped");
    [btnWeak, btnGood, btnConf].forEach(b => b.disabled = true);
    updateProgress();
  };

  const flip = () => {
    flipped = !flipped;
    card.classList.toggle("flipped", flipped);
    [btnWeak, btnGood, btnConf].forEach(b => b.disabled = !flipped);
  };

  const rate = (level) => {
    if (queue.length === 0) return;
    if (!flipped) return;
    const c = queue.shift();
    setConf(c, level);
    // Only remember the first time we rate each card this session —
    // avoids quizzing the same term twice if it got demoted + re-rated.
    if (!sessionRated.some(r => cardKeyOf(r) === cardKeyOf(c))) {
      sessionRated.push(c);
    }
    completed++;
    if (level === "weak") {
      const insertAt = Math.min(queue.length, 3 + Math.floor(Math.random() * 3));
      queue.splice(insertAt, 0, c);
    }
    updateHeaderCounts();
    renderTop();
  };

  const skip = () => {
    if (queue.length <= 1) return;
    const c = queue.shift();
    queue.push(c);
    renderTop();
  };

  const shuffle = () => {
    for (let k = queue.length - 1; k > 0; k--) {
      const j = Math.floor(Math.random() * (k + 1));
      [queue[k], queue[j]] = [queue[j], queue[k]];
    }
    renderTop();
  };

  card.addEventListener("click", flip);
  btnWeak.addEventListener("click", () => rate("weak"));
  btnGood.addEventListener("click", () => rate("good"));
  btnConf.addEventListener("click", () => rate("confident"));
  document.getElementById("mfc-skip").addEventListener("click", skip);
  document.getElementById("mfc-shuffle").addEventListener("click", shuffle);
  document.getElementById("mfc-reset").addEventListener("click", () => {
    if (!confirm(`Reset confidence for all ${fullDeck.length} cards in this mega deck?`)) return;
    clearAllConf();
    renderQuestionBank();
  });

  const onKey = (e) => {
    if (!document.getElementById("mfc-card")) {
      document.removeEventListener("keydown", onKey); return;
    }
    const tag = (e.target && e.target.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    if (e.key === " " || e.key === "Enter") { e.preventDefault(); flip(); }
    else if (e.key === "1") { e.preventDefault(); if (flipped) rate("weak"); }
    else if (e.key === "2") { e.preventDefault(); if (flipped) rate("good"); }
    else if (e.key === "3") { e.preventDefault(); if (flipped) rate("confident"); }
    else if (e.key === "ArrowRight") { e.preventDefault(); skip(); }
  };
  // Save a reference so the NEXT wireMegaFlashcards (or wireFlashcards)
  // call can rip this listener out before installing its own. Otherwise
  // both wires fire on 1/2/3 and the older one paints stale numbers
  // (e.g. "29 / 28") into the new wire's DOM.
  window.__decaFcKeyHandler = onKey;
  document.addEventListener("keydown", onKey);
  // Stamp the live header so any stale wire's updateHeaderCounts (if it
  // somehow fires) sees a different wireId and bails.
  stampWireId();
  card.focus();
  renderTop();
}

function renderStudyQuestionList(list, emptyMsg, opts = {}) {
  if (!list || list.length === 0) {
    return `<div class="empty">${escapeHtml(emptyMsg || "Nothing here yet.")}</div>`;
  }
  return `<div class="q-list">${list.map(item => renderStudyQuestionCard(item, opts)).join("")}</div>`;
}

function renderStudyQuestionCard(item, opts = {}) {
  const exam = state.exams[item.slug];
  if (!exam) return "";
  const q = exam.questions.find(x => x.number === item.number);
  if (!q) return "";
  const codeBadge = q.code
    ? `<span class="q-code">${escapeHtml(q.code)}</span>`
    : "";
  const titleChip = `<a href="#/exam/${item.slug}/${q.number}" style="margin-left:8px;font-size:.75rem;color:var(--accent);text-decoration:none">${escapeHtml(shortTitle(item.title))} #${q.number} ↗</a>`;
  const sources = (q.sources || []).map(s => escapeHtml(s)).join("<br>");

  // For the "Review wrongs" tab: show what the user originally chose — but ONLY
  // after they've re-answered in this Study tab (no spoilers on first look).
  // Render hidden initially; updateStudyQuestion() toggles it once .chosen is set.
  let prevBadge = "";
  if (opts.showPrevious) {
    // The original wrong pick ALWAYS comes from the logTest bucket here
    // (that's literally what makes the question appear in "Previously wrong").
    // The progress-bucket selection is the user's fresh retry — we don't want
    // to show that as "previously picked". So only pull from logTest.
    const logSel  = (loadLogTest(item.slug).selections)  || {};
    const origChosen = logSel[q.number];
    if (origChosen) {
      prevBadge = `<div class="prev-picked hidden" data-prev="1" data-orig="${escapeHtml(origChosen)}" data-slug="${item.slug}" data-q="${q.number}">You previously picked <strong>${escapeHtml(origChosen)}</strong> <span class="prev-picked-verdict">— try again fresh</span></div>`;
    }
  }

  const optsHtml = ["A","B","C","D"].map(letter => {
    const text = q.options[letter] || "";
    return `
      <div class="opt" data-q="${q.number}" data-slug="${item.slug}" data-letter="${letter}">
        <div class="letter">${letter}</div>
        <div class="text">${escapeHtml(text)}</div>
      </div>
    `;
  }).join("");

  return `
    <article class="q-card study-q" id="sq-${item.slug}-${q.number}" data-q="${q.number}" data-slug="${item.slug}">
      <div class="q-num">Question ${q.number}${codeBadge}${titleChip}</div>
      <div class="q-text">${escapeHtml(q.question)}</div>
      ${prevBadge}
      <div class="options">${optsHtml}</div>
      <div class="q-actions">
        <button class="btn ghost reveal-one" data-q="${q.number}" data-slug="${item.slug}">Show answer</button>
        ${opts.showReset ? `<button class="btn ghost q-reset" data-q="${q.number}" data-slug="${item.slug}">Reset answer</button>` : ""}
      </div>
      <div class="explain hidden">
        <div class="explain-body"></div>
        <div class="sources">${sources}</div>
      </div>
    </article>
  `;
}

// --- Study-only selections (don't pollute main exam progress) ---
function studyKey() { return `deca-imce:user:${userScope()}:study`; }
function loadAllStudy() {
  try { return JSON.parse(localStorage.getItem(studyKey()) || "{}"); } catch { return {}; }
}
function getStudyState(slug, qNum) {
  const all = loadAllStudy();
  return (all[slug] && all[slug][qNum]) || {};
}
function setStudyState(slug, qNum, patch) {
  const all = loadAllStudy();
  if (!all[slug]) all[slug] = {};
  all[slug][qNum] = { ...(all[slug][qNum] || {}), ...patch };
  localStorage.setItem(studyKey(), JSON.stringify(all));

  // Push to Firestore so the answered-state propagates to other devices —
  // otherwise a study answer on laptop wouldn't show as done on phone until
  // the 5s periodic interval fires. Debounced so rapid clicks coalesce.
  try { if (state.user) syncProfilePushDebounced(state.user, 500); } catch {}

  // Mirror an actual answer (chosen letter) into the main `progress:` bucket
  // so Study-tab / Review-wrongs attempts count toward Site-progress stats
  // (today counter, weekly counter, accuracy, streak — all of it). We ALWAYS
  // overwrite both the selection and the timestamp so re-attempting a
  // previously-answered question still shows up in "today's activity".
  //
  // EXCEPTION: cross-cluster Same-code practice questions (slugs NOT in the
  // active cluster's index) must stay pure practice — never mirror them into
  // another cluster's progress bucket or the leaderboard activity, or they'd
  // pollute that cluster's stats. They still persist in the study: bucket above.
  const inActiveCluster = !!(state.index && state.index.some(e => e.slug === slug));
  if (patch && patch.chosen && inActiveCluster) {
    try {
      const pKey = progressKey(slug);
      const prev = (() => {
        try { return JSON.parse(localStorage.getItem(pKey) || "{}"); }
        catch { return {}; }
      })();
      const selections = prev.selections || {};
      const timestamps = prev.timestamps || {};
      const revealed = prev.revealed || {};
      const now = patch.answeredAt || Date.now();
      selections[qNum] = patch.chosen;
      timestamps[qNum] = now;
      revealed[qNum] = true;
      localStorage.setItem(pKey, JSON.stringify({
        ...prev, selections, revealed, timestamps,
      }));
      // Also bump the per-day activity map so the leaderboard's
      // today/week/month windows pick this answer up.
      try {
        // `recordActivityDay` increments answered (+1) and correct (+1 if right)
        // for today's date. Only record on-the-day write; no backdating.
        if (typeof recordAnswerActivity === "function") {
          const exam = state.exams && state.exams[slug];
          const q = exam && exam.questions.find(x => x.number === Number(qNum));
          if (q && q.answer) {
            recordAnswerActivity(patch.chosen === q.answer);
          }
        }
      } catch {}
    } catch { /* quota or parse — ignore */ }
  }
}

// Clear the user's re-attempt PICK on a question — deselects the answer
// choice so they can try again. Does NOT touch the logTest bucket, so the
// original seed-imported "wrong" pick stays intact and the question stays
// in the "previously wrong" list (which is the whole point — they came to
// this view BECAUSE they missed it; reset is just "let me try again").
function clearStudyAnswer(slug, qNum) {
  try {
    const all = loadAllStudy();
    if (all[slug] && all[slug][qNum]) {
      delete all[slug][qNum];
      if (Object.keys(all[slug]).length === 0) delete all[slug];
      localStorage.setItem(studyKey(), JSON.stringify(all));
    }
  } catch {}
  try {
    const pKey = progressKey(slug);
    const prev = JSON.parse(localStorage.getItem(pKey) || "{}");
    let changed = false;
    ["selections", "timestamps", "revealed"].forEach(field => {
      if (prev[field] && prev[field][qNum] !== undefined) {
        delete prev[field][qNum];
        changed = true;
      }
    });
    if (changed) localStorage.setItem(pKey, JSON.stringify(prev));
  } catch {}
  // NOTE: intentionally NOT touching logTest — the seed-imported wrong pick
  // is what makes the question appear in "Previously wrong" at all.
  try { if (state.user) syncProfilePushDebounced(state.user, 500); } catch {}
}

// Clear every re-attempt PICK under a given code-prefix (e.g. "IM"). Only
// wipes the student's Study-tab picks + progress mirror; the original
// logTest wrongs stay so the question list itself is unchanged.
function clearStudyAnswersForPrefix(prefix) {
  if (!prefix) return 0;
  let count = 0;
  for (const meta of state.index || []) {
    if (!meta.available) continue;
    const exam = state.exams[meta.slug];
    if (!exam) continue;
    for (const q of exam.questions) {
      const qp = q.code ? q.code.split(":")[0] : "_OTHER";
      if (qp !== prefix) continue;
      const siteSel = (loadProgress(meta.slug).selections) || {};
      const stu = getStudyState(meta.slug, q.number);
      if (siteSel[q.number] || stu.chosen || stu.revealed) {
        clearStudyAnswer(meta.slug, q.number);
        count++;
      }
    }
  }
  return count;
}

// Recompute how many questions under `prefix` are still wrong and update
// the sub-tab count badge + the "N questions to review" toolbar label.
// Called after every answer click so counters feel live.
function refreshWrongsCount(prefix) {
  if (!prefix) return;
  let wrong = 0;
  let total = 0;
  // Two-pass dedupe — must match renderStudy() exactly. Pass 1: any stem
  // the user has now answered correctly on site anywhere is considered
  // "nailed" and every instance of that stem is dropped from the wrong
  // list. Pass 2: count one representative per still-wrong stem. This
  // way answering 5 correctly drops the count by 5, and resetting brings
  // those same 5 back. A single-pass dedupe was letting duplicate stems
  // shuffle into the freed slot, so the number never moved.
  const normStem = (s) => (s || "").toLowerCase().replace(/\s+/g, " ").trim();
  const stemAnyRight = new Map();
  for (const meta of state.index || []) {
    if (!meta.available) continue;
    const exam = state.exams[meta.slug];
    if (!exam) continue;
    const siteSel = (loadProgress(meta.slug).selections) || {};
    for (const q of exam.questions) {
      if (!q.answer) continue;
      const key = normStem(q.question);
      if (!key) continue;
      if (siteSel[q.number] === q.answer) stemAnyRight.set(key, true);
    }
  }
  const seenStem = new Set();
  for (const meta of state.index || []) {
    if (!meta.available) continue;
    const exam = state.exams[meta.slug];
    if (!exam) continue;
    const siteSel = (loadProgress(meta.slug).selections) || {};
    const logSel  = (loadLogTest(meta.slug).selections)  || {};
    for (const q of exam.questions) {
      const qp = q.code ? q.code.split(":")[0] : "_OTHER";
      if (qp !== prefix) continue;
      total++;
      if (!q.answer) continue;
      const key = normStem(q.question);
      if (!key) continue;
      if (stemAnyRight.get(key)) continue;
      if (seenStem.has(key)) continue;
      const siteChosen = siteSel[q.number];
      const logChosen  = !siteChosen ? logSel[q.number] : null;
      const effective = siteChosen || logChosen;
      if (effective && effective !== q.answer) {
        seenStem.add(key);
        wrong++;
      }
    }
  }
  // Update the "Review wrongs" sub-tab badge
  const missedBtn = document.querySelector('.sub-tabs button[data-sub="missed"] .count');
  if (missedBtn) missedBtn.textContent = String(wrong);
  // Update the "Same-code practice" sub-tab badge (total - wrong, but only
  // an estimate since "total" doesn't dedupe — good enough for a preview).
  const allBtn = document.querySelector('.sub-tabs button[data-sub="all"] .count');
  if (allBtn) allBtn.textContent = String(Math.max(0, total - wrong));
  // Update the toolbar label above the wrongs list, if it's currently shown
  const toolbarLabel = document.querySelector(".wrongs-toolbar-label");
  if (toolbarLabel) toolbarLabel.textContent = `${wrong} question${wrong === 1 ? "" : "s"} to review`;
}

function updateStudyQuestion(slug, qNum) {
  const exam = state.exams[slug];
  if (!exam) return;
  const q = exam.questions.find(x => x.number === qNum);
  if (!q) return;
  const card = document.getElementById(`sq-${slug}-${qNum}`);
  if (!card) return;
  const s = getStudyState(slug, qNum);
  const sel = s.chosen;
  const revealed = !!s.revealed;
  const show = revealed || !!sel;
  const correctLetter = q.answer;

  card.querySelectorAll(".opt").forEach(opt => {
    opt.classList.remove("selected", "correct", "wrong");
    const letter = opt.getAttribute("data-letter");
    if (sel && letter === sel) opt.classList.add("selected");
    if (show && correctLetter) {
      if (letter === correctLetter) opt.classList.add("correct");
      else if (sel && letter === sel && sel !== correctLetter) opt.classList.add("wrong");
    }
  });

  const explainEl = card.querySelector(".explain");
  const body = card.querySelector(".explain-body");
  const revealBtn = card.querySelector(".reveal-one");

  // Toggle prev-picked badge: only show AFTER user answers in this tab.
  // Verdict text changes based on whether their fresh attempt was right.
  const prevEl = card.querySelector(".prev-picked[data-prev]");
  if (prevEl) {
    if (sel) {
      prevEl.classList.remove("hidden");
      prevEl.classList.remove("good", "bad");
      const verdict = prevEl.querySelector(".prev-picked-verdict");
      if (verdict && correctLetter) {
        if (sel === correctLetter) {
          verdict.textContent = "— Great job! ✓";
          prevEl.classList.add("good");
        } else {
          verdict.textContent = "— not quite, try again";
          prevEl.classList.add("bad");
        }
      } else if (verdict) {
        verdict.textContent = "— try again fresh";
      }
    } else {
      prevEl.classList.add("hidden");
    }
  }

  // Reveal button: if user has selected, the answer is already shown — hide toggle.
  // Only show the button as an active toggle BEFORE selecting.
  if (revealBtn) {
    if (sel) {
      revealBtn.classList.add("hidden");
    } else {
      revealBtn.classList.remove("hidden");
      revealBtn.textContent = revealed ? "Hide answer" : "Show answer";
    }
  }

  if (show && correctLetter) {
    explainEl.classList.remove("hidden");
    const exp = q.explanation
      ? `<strong>Answer ${correctLetter}.</strong> ${escapeHtml(q.explanation)}`
      : `<strong>Answer ${correctLetter}.</strong>`;
    body.innerHTML = exp;
  } else if (show && !correctLetter) {
    explainEl.classList.remove("hidden");
    body.innerHTML = `<em>No answer key available.</em>`;
  } else {
    explainEl.classList.add("hidden");
  }
}

// ================================================================
//                         UTILITIES
// ================================================================

function extractCode(sources) {
  for (const s of sources) {
    const m = String(s).match(/SOURCE\s*:\s*([A-Z]{2,3})\s*:\s*(\d+)/i);
    if (m) return `${m[1].toUpperCase()}:${m[2]}`;
  }
  return null;
}

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
function escapeAttr(s) { return escapeHtml(s).replace(/`/g, "&#96;"); }

// ================================================================
//                  RESET EPOCH + LEADERBOARD
// ================================================================
// Reset-epoch mechanism:
//   - RESET_EPOCH_LOCAL is a hardcoded int in this file.
//   - Server (optional) exposes GET /api/reset-epoch returning { epoch }.
//   - On boot we take max(local, server) and compare to the value stored in
//     localStorage under "deca-imce:reset-epoch". If it differs, we nuke
//     every deca-imce:* key (preserving current-user + the epoch marker).
// This is how "reset ALL statistics for all users" works — bump the constant
// or hit the admin endpoint and every browser wipes itself on next load.
async function applyResetEpochIfChanged() {
  let serverEpoch = 0;
  try {
    const backend = await awaitSyncBackend(2500);
    if (backend && backend.ready) {
      serverEpoch = Number(await backend.getResetEpoch()) || 0;
    }
  } catch { /* offline — fall back to local const */ }
  const target = Math.max(RESET_EPOCH_LOCAL, serverEpoch);
  const seen = Number(localStorage.getItem("deca-imce:reset-epoch") || 0);
  if (seen >= target) return;
  // Wipe all deca-imce:* keys except identity + epoch marker.
  const keep = new Set(["deca-imce:current-user", "deca-imce:reset-epoch"]);
  const toKill = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith("deca-imce:") && !keep.has(k)) toKill.push(k);
  }
  toKill.forEach(k => localStorage.removeItem(k));
  localStorage.setItem("deca-imce:reset-epoch", String(target));
  // IMPORTANT: after wipe, plant "seedImported" flags for every known seeded
  // user so that maybeImportSeed() doesn't immediately re-fill the log-test
  // bucket from data/seed-*.json. Without this, wiping is pointless because
  // the next init() would just re-import Rohit's 896 starting answers etc.
  const seedFiles = { aryan: "data/seed-aryan.json", rohit: "data/seed-rohit.json", shreyas: "data/seed-shreyas.json" };
  for (const [user, path] of Object.entries(seedFiles)) {
    localStorage.setItem(`deca-imce:user:${user}:seedImported:${path}:v6`, "reset-" + target);
    // also older flag forms, just in case
    localStorage.setItem(`deca-imce:user:${user}:seedImported:${path}:v3`, "reset-" + target);
    localStorage.setItem(`deca-imce:user:${user}:seedImported:${path}`, "reset-" + target);
  }
  console.log(`[deca] reset epoch → ${target}, wiped ${toKill.length} keys, seed auto-import blocked`);
}

// ================================================================
//     Profile sync — cross-device via server (/api/profile)
// ================================================================
// Persists all per-user localStorage keys (`deca-imce:user:<name>:*`)
// to the server so switching devices/browsers doesn't wipe progress.
// Last-write-wins by mtime. Pull on login; push debounced after writes
// + periodic interval as a safety net.
const PROFILE_KEYS = (user) => `deca-imce:user:${user}:`;
const PROFILE_MTIME_KEY = (user) => `deca-imce:user:${user}:_mtime`;
const _syncState = { lastPushed: {}, pushTimer: null, pulling: {} };

function snapshotUserLocal(user) {
  const out = {};
  const pfx = PROFILE_KEYS(user);
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(pfx) && k !== PROFILE_MTIME_KEY(user)) {
      out[k] = localStorage.getItem(k);
    }
  }
  return out;
}

function applyUserSnapshotLocal(user, data) {
  const pfx = PROFILE_KEYS(user);
  // Remove existing user-scoped keys first so deletions sync too.
  const toKill = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(pfx) && k !== PROFILE_MTIME_KEY(user)) toKill.push(k);
  }
  toKill.forEach(k => localStorage.removeItem(k));
  for (const [k, v] of Object.entries(data || {})) {
    if (k.startsWith(pfx) && typeof v === "string") localStorage.setItem(k, v);
  }
}

// Wait for the Firebase bootstrap in app.html to finish. Returns the
// window.decaSync object (or null if Firebase failed to init).
function awaitSyncBackend(timeoutMs = 4000) {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (window.decaSync) return Promise.resolve(window.decaSync);
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (done) return; done = true; resolve(v); };
    window.addEventListener("deca-sync-ready", () => finish(window.decaSync || null), { once: true });
    setTimeout(() => finish(window.decaSync || null), timeoutMs);
  });
}

async function syncProfilePull(user) {
  if (!user || _syncState.pulling[user]) return false;
  _syncState.pulling[user] = true;
  try {
    const backend = await awaitSyncBackend();
    if (!backend || !backend.ready) {
      console.warn("[sync] no Firestore backend available — profile will stay local");
      return false;
    }
    const srv = await backend.getProfile(user);
    const srvMtime = Number(srv && srv.mtime) || 0;
    const localMtime = Number(localStorage.getItem(PROFILE_MTIME_KEY(user)) || 0);
    if (srv && srvMtime > localMtime && srv.data && Object.keys(srv.data).length) {
      applyUserSnapshotLocal(user, srv.data);
      localStorage.setItem(PROFILE_MTIME_KEY(user), String(srvMtime));
      _syncState.lastPushed[user] = JSON.stringify(snapshotUserLocal(user));
      addKnownUser(user);
      console.log(`[sync] pulled profile for ${user} (Firestore mtime ${srvMtime} > local ${localMtime})`);
      return true;
    }
    console.log(`[sync] no newer remote data for ${user} (remote mtime ${srvMtime}, local ${localMtime})`);
  } catch (e) { console.warn("[sync] pull failed:", e); }
  finally { _syncState.pulling[user] = false; }
  return false;
}

// Usernames deleted this session. The cloud writers below re-check this set
// AFTER their awaits so an in-flight push/report can't resurrect a profile or
// leaderboard doc that deleteAccount() just removed.
const _deletedUsers = new Set();

async function syncProfilePush(user) {
  if (!user || _deletedUsers.has(user)) return;
  try {
    const backend = await awaitSyncBackend();
    if (!backend || !backend.ready || _deletedUsers.has(user)) return;
    const snap = snapshotUserLocal(user);
    const serialized = JSON.stringify(snap);
    if (_syncState.lastPushed[user] === serialized) return; // no change
    const mtime = Date.now();
    localStorage.setItem(PROFILE_MTIME_KEY(user), String(mtime));
    await backend.putProfile(user, { user, mtime, data: snap });
    _syncState.lastPushed[user] = serialized;
    console.log(`[sync] pushed profile for ${user} (${Object.keys(snap).length} keys, mtime ${mtime})`);
  } catch (e) { console.warn("[sync] push failed:", e); }
}

function syncProfilePushDebounced(user, delay = 1500) {
  if (!user) return;
  clearTimeout(_syncState.pushTimer);
  _syncState.pushTimer = setTimeout(() => syncProfilePush(user), delay);
}

// Pull the list of cloud-known usernames so Switch-user can show profiles
// that exist on other devices but not yet on this browser.
async function syncMergeKnownUsers() {
  try {
    const backend = await awaitSyncBackend();
    if (!backend || !backend.ready) return;
    const users = await backend.listProfiles();
    (users || []).forEach(u => addKnownUser(u));
    console.log(`[sync] discovered ${users.length} cloud profiles`);
  } catch (e) { console.warn("[sync] listProfiles failed:", e); }
}

// Kick off a periodic push so any local changes get synced up within 5s
// even if a specific callsite forgot to call the debounced push.
if (typeof window !== "undefined" && !window.__decaSyncInterval) {
  window.__decaSyncInterval = setInterval(() => {
    if (typeof state !== "undefined" && state && state.user) {
      syncProfilePushDebounced(state.user, 0);
    }
  }, 5000);
}

// ---- Leaderboard client ----
function computeLeaderboardPayload({ siteAnswered, siteCorrect, logAnswered, logCorrect,
                                     testsCompletedCount, wrongsFixed, streakCurrent }) {
  const answered = siteAnswered + logAnswered;
  const correct  = siteCorrect + logCorrect;
  const accuracy = answered > 0 ? Math.round(correct / answered * 100) : 0;
  // Simple score = total questions answered (site + logs + pasted, all equal).
  const score = answered;
  // Per-day activity for time-windowed leaderboards.
  const days = loadActivityDays();
  return {
    user: state.user,
    answered, correct, accuracy,
    streak: streakCurrent || 0,
    tests: testsCompletedCount,
    wrongsFixed: wrongsFixed || 0,
    score,
    days,
  };
}

async function reportLeaderboard(payload) {
  if (!state.user || _deletedUsers.has(payload && payload.user)) return;
  try {
    const backend = await awaitSyncBackend();
    if (!backend || !backend.ready) return;
    const { user, ...entry } = payload;
    if (_deletedUsers.has(user)) return; // deleted mid-flight — don't recreate
    // Per-cluster leaderboards: key the doc by "<cluster>__<user>" and tag the
    // entry so reads can filter to the active cluster and show the real name.
    const cluster = activeClusterId();
    entry.cluster = cluster;
    entry.name = user;
    await backend.putLeaderboardEntry(`${cluster}__${user}`, entry);
  } catch (e) { console.warn("[lb] report failed:", e); }
}

async function fetchLeaderboard() {
  try {
    const backend = await awaitSyncBackend();
    if (!backend || !backend.ready) return null;
    const rows = await backend.getLeaderboardAll();
    rows.sort((a, b) => (b.score || 0) - (a.score || 0));
    const epoch = await backend.getResetEpoch().catch(() => 1);
    return { epoch, rows };
  } catch (e) {
    console.warn("[lb] fetch failed:", e);
    return null;
  }
}

function renderStatsLeaderboard(selfPayload) {
  const win = state.lbWindow || "all";
  return `
    <div id="lb-mount" class="panel">
      <div class="lb-header">
        <div>
          <h3>Leaderboard</h3>
          <p class="panel-sub" id="lb-subtitle">Live rankings across everyone studying.</p>
        </div>
        <div class="lb-window-tabs" role="tablist">
          <button class="lb-tab ${win==="today" ? "active" : ""}" data-lb-window="today">Today</button>
          <button class="lb-tab ${win==="week"  ? "active" : ""}" data-lb-window="week">This Week</button>
          <button class="lb-tab ${win==="month" ? "active" : ""}" data-lb-window="month">This Month</button>
          <button class="lb-tab ${win==="all"   ? "active" : ""}" data-lb-window="all">All Time</button>
        </div>
      </div>
      <div id="lb-body"><div class="empty" style="padding:24px">Loading rankings…</div></div>
    </div>
  `;
}

// ================================================================
//                          QUESTION BANK
// ================================================================
// A combined pool of every question across every exam, with filters for
// topic, exam type, answer status, etc. Uses renderStudyQuestionCard so
// answers count toward the same progress mirror as the Study tab.

function qbankClassify(slug) {
  if (/^icdc/i.test(slug)) return "icdc";
  // Cluster exams (bma-2026, fin-2021, mkt-2018, …) are all ICDC exams.
  if (/^(bma|ht|fin|ep|pfl|mkt)-\d{4}$/i.test(slug)) return "icdc";
  if (/^state/i.test(slug)) return "state";
  if (/^sample/i.test(slug)) return "sample";
  return "other";
}

function qbankDefaultFilters() {
  return {
    mode: "questions",   // "questions" | "flashcards" — Mega Flashcard mode reuses the same topic chips
    topics: [],          // array of topic prefixes, empty = all
    examTypes: [],       // array of "icdc" | "state" | "sample" | "other", empty = all
    status: "all",       // "all" | "unanswered" | "correct" | "wrong"
    randomize: false,
    showPrevious: true,
    limit: 50,           // page size
  };
}

// Seeded shuffle so "randomize" stays stable across re-renders within a session.
function qbankShuffle(arr, seed) {
  const out = arr.slice();
  let s = seed || 1;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

async function renderQuestionBank() {
  app.innerHTML = `<div class="empty">Loading question bank…</div>`;

  // Persist filter state on `state` so tab switches don't wipe it.
  if (!state.qbank) state.qbank = qbankDefaultFilters();
  const f = state.qbank;

  // Gather exam metas — the active cluster, plus (opt-in) every other cluster.
  const cross = !!state.crossCluster;
  const metas = state.index
    .filter(e => e.available !== false)
    .map(m => ({ ...m, cluster: activeClusterId() }));
  if (cross) {
    const allIdx = await loadAllClusterIndexes();
    for (const cid of CLUSTER_ORDER) {
      if (cid === activeClusterId()) continue;
      for (const m of (allIdx[cid] || [])) {
        if (m.available === false) continue;
        metas.push({ ...m, cluster: cid });
      }
    }
  }
  // Load every needed exam so we can pool every question.
  await Promise.all(metas.map(m => getExamByMeta(m).catch(() => null)));

  // Build the pool. When cross-cluster is on, dedup the shared item bank by
  // stem (active cluster wins — its metas come first).
  const pool = [];
  const topicCounts = {};
  const typeCounts = { icdc: 0, state: 0, sample: 0, other: 0 };
  const seenStem = new Set();
  for (const meta of metas) {
    const exam = state.exams[meta.slug];
    if (!exam) continue;
    const examType = qbankClassify(meta.slug);
    for (const q of exam.questions) {
      if (cross) {
        const stem = (q.question || "").toLowerCase().replace(/\s+/g, " ").trim();
        if (seenStem.has(stem)) continue;
        seenStem.add(stem);
      }
      const prefix = q.code ? q.code.split(":")[0] : "_OTHER";
      topicCounts[prefix] = (topicCounts[prefix] || 0) + 1;
      typeCounts[examType] = (typeCounts[examType] || 0) + 1;
      pool.push({
        slug: meta.slug,
        title: meta.title,
        number: q.number,
        code: q.code,
        prefix,
        examType,
        cluster: meta.cluster,
      });
    }
  }

  // Apply filters.
  const filtered = pool.filter(item => {
    if (f.examTypes.length && !f.examTypes.includes(item.examType)) return false;
    if (f.topics.length && !f.topics.includes(item.prefix)) return false;
    if (f.status !== "all") {
      const siteSel = (loadProgress(item.slug).selections) || {};
      const logSel  = (loadLogTest(item.slug).selections)  || {};
      const effective = siteSel[item.number] || logSel[item.number];
      const exam = state.exams[item.slug];
      const q = exam && exam.questions.find(x => x.number === item.number);
      const correct = q && q.answer;
      if (f.status === "unanswered" && effective) return false;
      if (f.status === "correct" && (!effective || effective !== correct)) return false;
      if (f.status === "wrong" && (!effective || effective === correct)) return false;
    }
    return true;
  });

  const ordered = f.randomize ? qbankShuffle(filtered, 42) : filtered;
  const paged = ordered.slice(0, f.limit);

  const isFlashMode = f.mode === "flashcards";

  // Flashcard counts per topic — the real number of term/definition
  // cards extractCard() produces from the topic's study guide. In
  // flashcard mode we show THIS on each chip instead of the question
  // count, so the chip and the deck size match.
  const flashcardCounts = {};
  for (const p of Object.keys(activeGuides())) {
    flashcardCounts[p] = buildFlashcardDeck(activeGuides()[p]).length;
  }

  // Build topic chip options sorted by count desc. In flashcard mode,
  // hide topics with zero flashcards (including _OTHER, which has no
  // guide) and sort by flashcard count so the biggest decks surface.
  const topicsSorted = Object.keys(isFlashMode ? flashcardCounts : topicCounts)
    .filter(p => {
      if (isFlashMode) return (flashcardCounts[p] || 0) > 0;
      return p !== "_OTHER" || topicCounts[p] > 0;
    })
    .sort((a, b) => {
      if (a === "_OTHER") return 1;
      if (b === "_OTHER") return -1;
      const src = isFlashMode ? flashcardCounts : topicCounts;
      return (src[b] || 0) - (src[a] || 0);
    });

  const topicChips = topicsSorted.map(p => {
    const name = (activeGuides()[p] && activeGuides()[p].name) || (p === "_OTHER" ? "Other / Uncoded" : p);
    const active = f.topics.includes(p);
    const count = isFlashMode ? (flashcardCounts[p] || 0) : (topicCounts[p] || 0);
    return `<button class="qb-chip ${active ? "active" : ""}" data-topic="${escapeHtml(p)}" title="${isFlashMode ? count + " flashcard" + (count === 1 ? "" : "s") : count + " question" + (count === 1 ? "" : "s")}">
      <span class="qb-chip-code">${escapeHtml(p)}</span>
      <span class="qb-chip-name">${escapeHtml(name)}</span>
      <span class="qb-chip-count">${count}</span>
    </button>`;
  }).join("");

  const typeChips = [
    { k: "icdc", name: "ICDC" },
    { k: "state", name: "State" },
    { k: "sample", name: "Sample" },
    { k: "other", name: "Other" },
  ].filter(t => typeCounts[t.k]).map(t => {
    const active = f.examTypes.includes(t.k);
    return `<button class="qb-chip ${active ? "active" : ""}" data-type="${t.k}">
      <span class="qb-chip-name">${t.name}</span>
      <span class="qb-chip-count">${typeCounts[t.k]}</span>
    </button>`;
  }).join("");

  const statusChips = [
    { k: "all", name: "All" },
    { k: "unanswered", name: "Unanswered" },
    { k: "correct", name: "Correct" },
    { k: "wrong", name: "Wrong" },
  ].map(s => `<button class="qb-chip ${f.status === s.k ? "active" : ""}" data-status="${s.k}">
    <span class="qb-chip-name">${s.name}</span>
  </button>`).join("");

  const isFlash = f.mode === "flashcards";

  const list = paged.length === 0
    ? `<div class="empty" style="padding:40px">No questions match these filters. Loosen a filter above.</div>`
    : `<div class="q-list">${paged.map(item => renderStudyQuestionCard(item, { showPrevious: f.showPrevious })).join("")}</div>`;

  const modeTabs = `
    <div class="qbank-mode-tabs" role="tablist">
      <button class="qbank-mode-tab ${!isFlash ? "active" : ""}" data-mode="questions" role="tab" aria-selected="${!isFlash}">
        <span class="qbmt-ico">📝</span>
        <span class="qbmt-lbl">Questions</span>
        <span class="qbmt-sub">${filtered.length.toLocaleString()} Q</span>
      </button>
      <button class="qbank-mode-tab ${isFlash ? "active" : ""}" data-mode="flashcards" role="tab" aria-selected="${isFlash}">
        <span class="qbmt-ico">🧠</span>
        <span class="qbmt-lbl">Mega Flashcards</span>
        <span class="qbmt-sub">Pick topics → mix into one deck</span>
      </button>
    </div>
  `;

  // In flashcard mode we only need the topic chips — exam type / status /
  // randomize / show-previous don't apply to a term→definition deck. We
  // reuse the same `f.topics` array so topic selection carries over when
  // the user toggles modes.
  const filterPanel = isFlash ? `
    <div class="qbank-filters flashmode">
      <div class="qbank-filter-group" style="grid-column: 1 / -1">
        <div class="qbank-filter-label">Topics in deck <span class="hint">(click to toggle — leave all off to include every topic)</span></div>
        <div class="qb-chips qb-chips-topics">${topicChips}</div>
      </div>
      <div class="qbank-flash-actions">
        <button class="btn ghost" id="qb-select-all">Select all topics</button>
        ${f.topics.length ? `<button class="btn ghost qb-clear" id="qb-clear">Clear selection</button>` : ""}
      </div>
    </div>
  ` : `
    <div class="qbank-filters">
      <div class="qbank-filter-group">
        <div class="qbank-filter-label">Exam type</div>
        <div class="qb-chips">${typeChips || '<span class="hint">No exams loaded.</span>'}</div>
      </div>
      <div class="qbank-filter-group">
        <div class="qbank-filter-label">Answer status</div>
        <div class="qb-chips">${statusChips}</div>
      </div>
      <div class="qbank-filter-group">
        <div class="qbank-filter-label">Topic <span class="hint">(click to toggle multiple)</span></div>
        <div class="qb-chips qb-chips-topics">${topicChips}</div>
      </div>
      ${(f.topics.length || f.examTypes.length || f.status !== "all") ? `<button class="btn ghost qb-clear" id="qb-clear">Clear filters</button>` : ""}
    </div>
  `;

  const body = isFlash
    ? renderMegaFlashcards(f.topics)
    : `
      <div class="qbank-list">${list}</div>
      ${paged.length < filtered.length ? `
        <div class="qbank-loadmore-wrap">
          <button class="btn" id="qb-more">Load more questions</button>
        </div>
      ` : ""}
    `;

  const toggles = isFlash ? "" : `
    <div class="qbank-toggle-row">
      <label class="qb-toggle">
        <input type="checkbox" id="qb-rand" ${f.randomize ? "checked" : ""} />
        <span class="qb-toggle-label">🎲 Randomize order</span>
      </label>
      <label class="qb-toggle">
        <input type="checkbox" id="qb-prev" ${f.showPrevious ? "checked" : ""} />
        <span class="qb-toggle-label">🗂️ Show previous attempts</span>
      </label>
      <label class="qb-toggle" title="Pool questions from every DECA cluster (shared item bank), deduplicated. Practice only — answers don't affect any cluster's stats.">
        <input type="checkbox" id="qb-cross" ${cross ? "checked" : ""} />
        <span class="qb-toggle-label">🌐 All clusters</span>
      </label>
      <div class="qbank-count">
        ${filtered.length.toLocaleString()} question${filtered.length === 1 ? "" : "s"}
        ${paged.length < filtered.length ? ` <span class="hint" style="margin-left:6px">(showing first ${paged.length})</span>` : ""}
      </div>
    </div>
  `;

  app.innerHTML = `
    <section class="qbank-page">
      <div class="qbank-head">
        <div class="qbank-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 4h16v16H4z"/><path d="M9 9h6"/><path d="M9 13h6"/><path d="M9 17h3"/>
          </svg>
        </div>
        <div>
          <h2>Question Bank</h2>
          <p class="hint">Every question across every exam in one pool — or flip to <strong>Mega Flashcards</strong> to mix term/definition cards across any topics you choose.</p>
        </div>
      </div>

      ${modeTabs}
      ${toggles}
      ${filterPanel}
      ${body}
    </section>
  `;

  // ---- Wire filter interactions ----
  const rerender = () => renderQuestionBank();

  // Mode tabs (Questions vs Mega Flashcards)
  document.querySelectorAll(".qbank-mode-tab").forEach(el => {
    el.addEventListener("click", () => {
      const m = el.getAttribute("data-mode");
      if (m === f.mode) return;
      f.mode = m;
      rerender();
    });
  });

  document.querySelectorAll(".qb-chip[data-topic]").forEach(el => {
    el.addEventListener("click", () => {
      const p = el.getAttribute("data-topic");
      const idx = f.topics.indexOf(p);
      if (idx >= 0) f.topics.splice(idx, 1);
      else f.topics.push(p);
      rerender();
    });
  });
  document.querySelectorAll(".qb-chip[data-type]").forEach(el => {
    el.addEventListener("click", () => {
      const t = el.getAttribute("data-type");
      const idx = f.examTypes.indexOf(t);
      if (idx >= 0) f.examTypes.splice(idx, 1);
      else f.examTypes.push(t);
      rerender();
    });
  });
  document.querySelectorAll(".qb-chip[data-status]").forEach(el => {
    el.addEventListener("click", () => {
      f.status = el.getAttribute("data-status");
      rerender();
    });
  });
  const randEl = document.getElementById("qb-rand");
  if (randEl) randEl.addEventListener("change", () => { f.randomize = randEl.checked; rerender(); });
  const prevEl = document.getElementById("qb-prev");
  if (prevEl) prevEl.addEventListener("change", () => { f.showPrevious = prevEl.checked; rerender(); });
  const crossEl = document.getElementById("qb-cross");
  if (crossEl) crossEl.addEventListener("change", () => {
    state.crossCluster = crossEl.checked;
    localStorage.setItem("deca-imce:crossCluster", crossEl.checked ? "1" : "0");
    rerender();
  });
  const clearBtn = document.getElementById("qb-clear");
  if (clearBtn) clearBtn.addEventListener("click", () => {
    // Preserve the current mode — the user explicitly asked to clear
    // filters, not switch out of flashcards.
    const keepMode = f.mode;
    state.qbank = qbankDefaultFilters();
    state.qbank.mode = keepMode;
    rerender();
  });
  const selectAllBtn = document.getElementById("qb-select-all");
  if (selectAllBtn) selectAllBtn.addEventListener("click", () => {
    // Populate with every topic that has a TOPIC_GUIDE (what flashcards
    // can be built from). Leaving the array empty also means "all", but
    // some users want the explicit visual confirmation that every chip
    // is active.
    f.topics = Object.keys(activeGuides());
    rerender();
  });
  const moreBtn = document.getElementById("qb-more");
  if (moreBtn) moreBtn.addEventListener("click", () => {
    f.limit = (f.limit || 50) + 50;
    rerender();
  });

  // ---- Mega Flashcards wiring (only present in flashcards mode) ----
  if (isFlash) {
    wireMegaFlashcards(f.topics);
    return; // no question-card handlers needed
  }

  // ---- Wire question cards (answer + reveal + reset) ----
  document.querySelectorAll(".qbank-list .study-q .opt").forEach(el => {
    el.addEventListener("click", () => {
      const qNum = Number(el.getAttribute("data-q"));
      const slug = el.getAttribute("data-slug");
      const letter = el.getAttribute("data-letter");
      setStudyState(slug, qNum, { chosen: letter, answeredAt: Date.now() });
      updateStudyQuestion(slug, qNum);
    });
  });
  document.querySelectorAll(".qbank-list .study-q .reveal-one").forEach(el => {
    el.addEventListener("click", () => {
      const qNum = Number(el.getAttribute("data-q"));
      const slug = el.getAttribute("data-slug");
      const s = getStudyState(slug, qNum);
      setStudyState(slug, qNum, { revealed: !s.revealed });
      updateStudyQuestion(slug, qNum);
    });
  });
  document.querySelectorAll(".qbank-list .study-q").forEach(el => {
    const qNum = Number(el.getAttribute("data-q"));
    const slug = el.getAttribute("data-slug");
    updateStudyQuestion(slug, qNum);
  });
}

// Top-level Leaderboard route — same UI as the stats sub-tab, but on its
// own route (#/leaderboard) with a dedicated nav button. Computes the
// self-payload inline from localStorage so we can push/hydrate without
// needing renderStats() to run.
async function renderLeaderboardPage() {
  if (!state.user) {
    app.innerHTML = `
      <section class="panel" style="max-width:560px;margin:40px auto;text-align:center">
        <h2>Leaderboard</h2>
        <p class="hint">Log in to see rankings and show up on the board.</p>
        <button class="btn primary" id="lb-login">Log in</button>
      </section>
    `;
    const btn = document.getElementById("lb-login");
    if (btn) btn.addEventListener("click", openLoginModal);
    return;
  }
  app.innerHTML = `<div class="empty">Loading leaderboard…</div>`;

  // Load every available exam so we can compute the user's payload.
  const slugs = state.index.filter(e => e.available).map(e => e.slug);
  await Promise.all(slugs.map(s => getExam(s).catch(() => null)));

  let siteAnswered = 0, siteCorrect = 0, logAnswered = 0, logCorrect = 0;
  let fixedFromLog = 0;
  const testsCompleted = (() => {
    try { return JSON.parse(localStorage.getItem(`deca-imce:user:${state.user}:testsCompleted`) || "[]"); }
    catch { return []; }
  })();
  for (const meta of state.index) {
    if (!meta.available) continue;
    const exam = state.exams[meta.slug];
    if (!exam) continue;
    const siteSel = (loadProgress(meta.slug).selections) || {};
    const logSel  = (loadLogTest(meta.slug).selections)  || {};
    for (const q of exam.questions) {
      const sChosen = siteSel[q.number];
      if (sChosen && q.answer) {
        siteAnswered++;
        if (sChosen === q.answer) siteCorrect++;
      }
      const lChosen = logSel[q.number];
      if (lChosen && q.answer) {
        logAnswered++;
        if (lChosen === q.answer) logCorrect++;
        // "wrong in log, correct on site" — counts as a fixed wrong
        if (lChosen !== q.answer && sChosen && sChosen === q.answer) fixedFromLog++;
      }
    }
  }
  const streakInfo = (typeof loadStreak === "function") ? loadStreak() : null;
  const payload = computeLeaderboardPayload({
    siteAnswered, siteCorrect, logAnswered, logCorrect,
    testsCompletedCount: (testsCompleted && testsCompleted.length) || 0,
    wrongsFixed: fixedFromLog,
    streakCurrent: streakInfo && streakInfo.current ? streakInfo.current : 0,
  });

  app.innerHTML = `
    <section class="leaderboard-page">
      <div class="stats-head" style="margin-bottom:14px">
        <h2>Leaderboard</h2>
        <p class="hint">Live rankings across everyone studying — showing the <strong>top 100 players</strong>. You're logged in as <strong>${escapeHtml(state.user)}</strong>.</p>
      </div>
      ${renderStatsLeaderboard(payload)}
    </section>
  `;
  // CRITICAL: await the push before hydrating. Otherwise fetchLeaderboard()
  // races the put and we render stale data — the user's 27 new answers
  // land in Firestore a half-second after the board snapshot is read,
  // so the daily/weekly/monthly columns show yesterday's numbers.
  try { await reportLeaderboard(payload); } catch {}
  hydrateLeaderboard(payload);
}

// Compute window-filtered ranking rows. For time windows, we derive
// {answered, correct, score} from each user's per-day `days` map.
function _lbWindowDateRange(win) {
  const now = new Date();
  const iso = d => d.toISOString().slice(0, 10);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (win === "today") return { from: iso(today), to: iso(today) };
  if (win === "week") {
    const d = new Date(today);
    // Week = last 7 days ending today (rolling window)
    d.setDate(d.getDate() - 6);
    return { from: iso(d), to: iso(today) };
  }
  if (win === "month") {
    const d = new Date(today);
    d.setDate(d.getDate() - 29);
    return { from: iso(d), to: iso(today) };
  }
  return null; // "all"
}
function _lbRowsForWindow(rawRows, win) {
  if (win === "all" || !win) {
    // Score = total answered (already set in payload). Sort by it.
    return rawRows
      .map(r => ({ ...r, score: r.answered || r.score || 0 }))
      .sort((a,b) => (b.score||0) - (a.score||0));
  }
  const range = _lbWindowDateRange(win);
  const out = [];
  for (const r of rawRows) {
    const days = r.days || {};
    let answered = 0, correct = 0;
    for (const [d, v] of Object.entries(days)) {
      if (d < range.from || d > range.to) continue;
      answered += (v.answered || 0);
      correct  += (v.correct  || 0);
    }
    if (answered === 0) continue; // exclude users with no activity in window
    const accuracy = answered > 0 ? Math.round(correct / answered * 100) : 0;
    // Simple score = answered questions in window.
    out.push({
      user: r.user, score: answered, answered, correct, accuracy,
      streak: r.streak || 0, tests: r.tests || 0, wrongsFixed: r.wrongsFixed || 0,
    });
  }
  out.sort((a,b) => (b.score||0) - (a.score||0));
  return out;
}

async function hydrateLeaderboard(selfPayload) {
  const mount = document.getElementById("lb-body");
  if (!mount) return;
  const data = await fetchLeaderboard();
  if (!data || !Array.isArray(data.rows)) {
    mount.innerHTML = `<div class="empty" style="padding:24px">
      <p>Couldn't reach the leaderboard server.</p>
      <p class="hint">Firebase sync may be down. Try reloading.</p>
    </div>`;
    return;
  }
  // Cache raw rows so the tab switcher can re-filter without another Firestore hit.
  state._lbRawRows = data.rows;
  _redrawLeaderboardWindow();
  // Wire up tab clicks
  document.querySelectorAll("[data-lb-window]").forEach(btn => {
    btn.addEventListener("click", () => {
      state.lbWindow = btn.getAttribute("data-lb-window");
      document.querySelectorAll(".lb-tab").forEach(b =>
        b.classList.toggle("active", b.getAttribute("data-lb-window") === state.lbWindow));
      _redrawLeaderboardWindow();
    });
  });
}

function _redrawLeaderboardWindow() {
  const mount = document.getElementById("lb-body");
  const sub = document.getElementById("lb-subtitle");
  // Filter to the active cluster and surface the real username (the Firestore
  // doc id is "<cluster>__<user>"). Legacy rows with no cluster tag are treated
  // as Marketing and keep their plain-username doc id.
  const _cl = activeClusterId();
  const raw = (state._lbRawRows || [])
    .filter(r => (r.cluster || "marketing") === _cl)
    .map(r => ({ ...r, user: r.name || r.user }));
  const win = state.lbWindow || "all";
  const rows = _lbRowsForWindow(raw, win);
  const winLabel = {today:"today", week:"this week", month:"this month", all:"all time"}[win];
  if (sub) {
    const clusterName = activeCluster().short;
    sub.textContent = win === "all"
      ? `${clusterName} cluster · top 100 players, ranked by total questions answered (site, pasted codes, and test logs all count equally).`
      : `${clusterName} cluster · top 100, ranked by questions answered ${winLabel}. Users with zero activity in this window are hidden.`;
  }
  if (rows.length === 0) {
    mount.innerHTML = `<div class="empty" style="padding:24px">
      <p>No one has been active ${winLabel}.</p>
      <p class="hint">Answer some questions on a test and you'll show up here.</p>
    </div>`;
    return;
  }
  const me = (state.user || "").toLowerCase();
  const podium = rows.slice(0, 3);
  const rest = rows.slice(3, 100);
  const podiumHtml = `
    <div class="lb-podium">
      ${podium.map((r, i) => `
        <div class="lb-podium-card lb-rank-${i + 1} ${r.user.toLowerCase() === me ? "is-me" : ""}">
          <div class="lb-medal">${["🥇", "🥈", "🥉"][i]}</div>
          <div class="lb-user">${escapeHtml(r.user)}</div>
          <div class="lb-score">${(r.answered || 0).toLocaleString()}</div>
          <div class="lb-sub">answered · ${r.accuracy}% acc</div>
        </div>
      `).join("")}
    </div>
  `;
  const rowsHtml = rest.length === 0 ? "" : `
    <table class="topics-table lb-table">
      <thead><tr>
        <th style="width:52px">#</th><th>Player</th>
        <th>Answered</th><th>Accuracy</th>
      </tr></thead>
      <tbody>
        ${rest.map((r, i) => `
          <tr class="${r.user.toLowerCase() === me ? "lb-me" : ""}">
            <td><strong>${i + 4}</strong></td>
            <td><strong>${escapeHtml(r.user)}</strong></td>
            <td><strong>${(r.answered || 0).toLocaleString()}</strong></td>
            <td>${r.accuracy}% <span style="color:var(--muted)">(${r.correct}/${r.answered})</span></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
  const myRank = rows.findIndex(r => r.user.toLowerCase() === me);
  const myLine = myRank === -1 ? `
    <div class="lb-you" style="margin-top:12px">
      You're not on the ${winLabel} board yet. ${win === "all" ? "Answer some questions" : `Answer some questions ${winLabel}`} and your rank will appear here.
    </div>
  ` : myRank >= 100 ? `
    <div class="lb-you" style="margin-top:12px">
      Your rank: <strong>#${myRank + 1}</strong> · ${(rows[myRank].answered || 0).toLocaleString()} answered
    </div>
  ` : "";
  mount.innerHTML = podiumHtml + rowsHtml + myLine;
}
