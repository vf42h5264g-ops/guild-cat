// Cozy Cat Guild - app.js (v0.5+ tutorial final)
// - 起動時は必ずスタート画面（続き/新規）
// - Tutorial最終：ギルド名 → 無料スカウト1匹選択 → 残り2匹自動加入（性格被りなし）
//   → 訓練の紹介（タブ光らせ） → チュートクエ（確定成功/1分）で
//      「ネコ選択→難易度選択→受注」操作を体験 → 受取 → ランクアップ体験(Rank2) → 完了
// - 成長：LvUpごとに合計+3（性格配分）＋10%で追加+1（性格寄り）＋節目(Lv5/10/15...)で+2
// - あまえんぼは万能（+1/+1/+1）
// - 解雇：Rank5解放、返却Gold = Lv * 500G
// - クエスト：Lv1-10をランクに応じて解放（Max=min(10,Rank)）＆S/M/L時間タイプ
// - 投資：Rank10でタブ解放。価格変動なし/売却不可/出資1000G単位/配当のみ変動（0:00締め）
//   ログイン時に配当が確定したらポップアップ（高配当/低配当商会に応じた一言）

const LS_SAVE = "ccg_save_v3";

/* =========================
   Economy / Rules
   ========================= */
const RANK = {
  cost(nextRank) {
    return 5000 * Math.pow(nextRank - 1, 3);
  },
  goldMult(rank) {
    const m = 1 + 0.1 * (rank - 1);
    return Math.min(2.0, m);
  },
  hireSlots(rank) {
    return 3 + Math.floor(rank / 2);
  },
  trainingSlots(rank) {
    return 1 + Math.floor((rank - 1) / 2);
  },
  dispatchSlots(rank) {
    return 1;
  },
  maxQuestLevel(rank) {
    return Math.min(10, Math.max(1, rank));
  },
  canFire(rank) {
    return rank >= 5;
  },
  canInvest(rank) {
    return rank >= 10;
  },
};

const TRAINING = {
  BASE_EXP_PER_MIN: 1,
  DURATIONS_MIN: [60, 120, 240, 480],
  UNLOCK_BASE: 40000,
  USE_COST_PER_MIN: 8,
  MULT_PER_PAID_SLOT: 0.5,
};

const HIRING = {
  hireCost(rank) {
    return rank * 5000;
  },
  refreshCost(rank) {
    const TABLE = {
      1: 3000, 2: 6000, 3: 9000, 4: 12000, 5: 15000,
      6: 18000, 7: 21000, 8: 24000, 9: 27000, 10: 30000,
    };
    return TABLE[rank] ?? TABLE[10];
  },
};

const LEVEL = {
  expToNext(level) {
    return 60 * level * level;
  },
  gain3(personality) {
    switch (personality) {
      case "ツンデレ": return { str: 2, agi: 1, int: 0 };
      case "やんちゃ": return { str: 1, agi: 2, int: 0 };
      case "クール":   return { str: 1, agi: 0, int: 2 };
      case "あまえんぼ": return { str: 1, agi: 1, int: 1 };
      default: return { str: 1, agi: 1, int: 1 };
    }
  },
  bonusPick(personality) {
    switch (personality) {
      case "ツンデレ": return "str";
      case "やんちゃ": return "agi";
      case "クール":   return "int";
      case "あまえんぼ": {
        const a = ["str","agi","int"];
        return a[Math.floor(Math.random() * a.length)];
      }
      default: return "str";
    }
  },
  milestonePick(personality) {
    return LEVEL.bonusPick(personality);
  },
};

const QUEST = {
  NEED_TOTAL: [53, 70, 90, 115, 145, 180, 220, 265, 315, 370],
  TIME_TYPES: [
    { key: "S", label: "短", eff: 1.00 },
    { key: "M", label: "中", eff: 0.96 },
    { key: "L", label: "長", eff: 0.92 },
  ],
  DUR_TABLE: {
    1: { S: 10,  M: 20,  L: 40  },
    2: { S: 15,  M: 30,  L: 60  },
    3: { S: 20,  M: 40,  L: 80  },
    4: { S: 25,  M: 50,  L: 100 },
    5: { S: 30,  M: 60,  L: 120 },
    6: { S: 40,  M: 80,  L: 160 },
    7: { S: 50,  M: 100, L: 200 },
    8: { S: 60,  M: 120, L: 240 },
    9: { S: 90,  M: 180, L: 360 },
    10:{ S: 120, M: 240, L: 480 },
  },
  goldPerMin(level) {
    return 70 + level * 12;
  },
  resultMult(result) {
    if (result === "大成功") return 1.6;
    if (result === "成功") return 1.0;
    return 0.3;
  },
  expPerMin(result) {
    if (result === "大成功") return 1.2;
    if (result === "成功") return 1.0;
    return 0.8;
  },
};

const INVEST = {
  unlockRank: {
    insure: 10,
    arms: 12,
    trade: 13,
    magic: 15,
  },
  shops: {
    insure: { name: "保険組合", base: 0.025, var: 0.05, icon: "🛡" },
    arms:   { name: "武具商会", base: 0.03,  var: 0.10, icon: "🗡" },
    trade:  { name: "交易商会", base: 0.03,  var: 0.20, icon: "🚢" },
    magic:  { name: "魔導研究所", base: 0.02, var: 0.50, icon: "🔮" },
  },
  capPerRank: {
    insure: 15000,
    arms: 12000,
    trade: 10000,
    magic: 8000,
  },
  STEP: 1000,
};

/* =========================
   Random appearance (fur only)
   ========================= */
const CAT_HUES = [0, 25, 45, 80, 160, 210, 260, 320];
function randomHue() {
  return CAT_HUES[Math.floor(Math.random() * CAT_HUES.length)];
}

/* =========================
   Weapon mapping
   ========================= */
function getWeaponImageByPersonality(p) {
  switch (p) {
    case "ツンデレ": return "img/Bsword.png";
    case "やんちゃ": return "img/Dsword.png";
    case "クール": return "img/rod.png";
    case "あまえんぼ": return "img/fish.png";
    default: return null;
  }
}

/* =========================
   DOM
   ========================= */
const el = {
  startScreen: document.getElementById("startScreen"),
  mainScreen: document.getElementById("mainScreen"),
  btnStart: document.getElementById("btnStart"),
  btnContinue: document.getElementById("btnContinue"),
  btnNew: document.getElementById("btnNew"),
  dailyTip: document.getElementById("dailyTip"),
  startMeta: document.getElementById("startMeta"),

  guildTitle: document.getElementById("guildTitle"),
  btnGuildName: document.getElementById("btnGuildName"),

  hud: document.getElementById("hud"),
  btnReset: document.getElementById("btnReset"),
  btnRankUp: document.getElementById("btnRankUp"),
  rankInfo: document.getElementById("rankInfo"),
  rankCostText: document.getElementById("rankCostText"),

  logHeader: document.getElementById("logHeader"),
  logChevron: document.getElementById("logChevron"),
  logUnreadPill: document.getElementById("logUnreadPill"),
  logPanel: document.getElementById("logPanel"),

  pendingBar: document.getElementById("pendingBar"),
  pendingText: document.getElementById("pendingText"),
  btnCollectAll: document.getElementById("btnCollectAll"),

  dotQuest: document.getElementById("dotQuest"),
  dotCats: document.getElementById("dotCats"),
  dotTraining: document.getElementById("dotTraining"),
  dotInvest: document.getElementById("dotInvest"),

  tabQuest: document.getElementById("tab-quest"),
  tabCats: document.getElementById("tab-cats"),
  tabTraining: document.getElementById("tab-training"),
  tabInvest: document.getElementById("tab-invest"),

  modalBackdrop: document.getElementById("modalBackdrop"),
  modal: document.getElementById("modal"),
  modalTitle: document.getElementById("modalTitle"),
  modalBody: document.getElementById("modalBody"),
  modalClose: document.getElementById("modalClose"),
};

let state = null;
let currentTab = "quest";
let logUnread = 0;
let jimFlip = false;

/* =========================
   Modal
   ========================= */
function openModal(title, html) {
  el.modalTitle.textContent = title;
  el.modalBody.innerHTML = html;
  el.modalBackdrop.classList.remove("hidden");
  el.modal.classList.remove("hidden");
}
function closeModal() {
  el.modalBackdrop.classList.add("hidden");
  el.modal.classList.add("hidden");
  el.modalBody.innerHTML = "";
}
el.modalBackdrop.addEventListener("click", closeModal);
el.modalClose.addEventListener("click", closeModal);

/* =========================
   Save/Load (AUTO SAVE)
   ========================= */
function save() {
  try {
    localStorage.setItem(LS_SAVE, JSON.stringify(state));
  } catch (e) {
    console.warn("save failed", e);
  }
}
function load() {
  const raw = localStorage.getItem(LS_SAVE);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
window.addEventListener("beforeunload", () => save());

/* =========================
   Logs
   ========================= */
function nowStr() {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}
function pushLog(text) {
  if (!Array.isArray(state.logs)) state.logs = [];
  state.logs.unshift({ t: nowStr(), text });
  logUnread++;
  renderHeaderBadges();
  renderLogs();
  save();
}
function renderLogs() {
  const open = !el.logPanel.classList.contains("hidden");
  el.logUnreadPill.textContent = String(logUnread);
  el.logUnreadPill.style.display = logUnread > 0 ? "inline-block" : "none";
  if (!open) return;

  const items = (state.logs || []).slice(0, 40).map((x) => {
    return `<div class="logItem"><span class="logTime">${x.t}</span>${escapeHtml(x.text)}</div>`;
  }).join("");
  el.logPanel.innerHTML = items || `<div class="dim">ログはまだありません</div>`;
}
el.logHeader.addEventListener("click", () => {
  const isHidden = el.logPanel.classList.contains("hidden");
  if (isHidden) {
    el.logPanel.classList.remove("hidden");
    el.logChevron.textContent = "▼";
    logUnread = 0;
  } else {
    el.logPanel.classList.add("hidden");
    el.logChevron.textContent = "▶";
  }
  renderLogs();
});



/* =========================
   Helpers
   ========================= */
function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}
function clamp(min, max, v) {
  return Math.max(min, Math.min(max, v));
}
function formatRemain(ms) {
  const sec = Math.floor(ms / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  return `${m}:${String(s).padStart(2,"0")}`;
}
function burstConfetti() {
  const root = document.getElementById("confetti");
  if (!root) return;

  root.innerHTML = "";

  const count = 70;
  const colors = ["#ffffff", "#2b6cff", "#9bd1ff", "#ffd28a", "#caa6ff"];

  for (let i = 0; i < count; i++) {
    const d = document.createElement("div");
    d.className = "confettiPiece";

    const x = Math.random() * 100;
    const dx = (Math.random() * 2 - 1) * 120 + "px";
    const rot = (Math.random() * 720 - 360) + "deg";
    const delay = Math.random() * 120;
    const dur = 750 + Math.random() * 450;

    d.style.left = x + "vw";
    d.style.top = (-10 - Math.random() * 20) + "px";
    d.style.background = colors[Math.floor(Math.random() * colors.length)];
    d.style.setProperty("--dx", dx);
    d.style.setProperty("--rot", rot);
    d.style.animationDuration = dur + "ms";
    d.style.animationDelay = delay + "ms";

    root.appendChild(d);
  }

  setTimeout(() => { root.innerHTML = ""; }, 1600);
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}
function escapeAttr(s){ return escapeHtml(s).replace(/"/g, "&quot;"); }
function dateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const da = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${da}`;
}
function daysBetween(aKey, bKey) {
  const a = new Date(aKey + "T00:00:00");
  const b = new Date(bKey + "T00:00:00");
  const ms = b - a;
  return Math.floor(ms / (24*60*60*1000));
}
function totalPower() {
  return (state.cats || []).reduce((sum, c) => sum + c.str + c.agi + c.int, 0);
}
function catById(id) {
  return (state.cats || []).find(c => c.id === id);
}
function randomName() {
  const names = ["モモ","ハル","ルナ","コハク","ソラ","ミント","サクラ","マロン","ユズ","コテツ"];
  return names[Math.floor(Math.random() * names.length)];
}
function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
function setTabGlow(tabKey, on) {
  const btn = document.querySelector(`.tab[data-tab="${tabKey}"]`);
  if (!btn) return;
  btn.classList.toggle("glow", !!on);
}

/* =========================
   Training slot economy
   ========================= */
function getTrainingSlotMeta(slotNo) {
  const unlockCost = TRAINING.UNLOCK_BASE * Math.pow(slotNo - 1, 2);
  const expMult = 1 + TRAINING.MULT_PER_PAID_SLOT * (slotNo - 1);
  return { unlockCost, expMult };
}
function calcTrainingUseCost(slotNo, durationMin) {
  if (slotNo === 1) return 0;
  return TRAINING.USE_COST_PER_MIN * durationMin * (slotNo - 1);
}

/* =========================
   State ensure
   ========================= */
function ensureTrainingState() {
  const slotCount = RANK.trainingSlots(state.guildRank);
  if (!Array.isArray(state.trainingSlots)) state.trainingSlots = [];
  if (!Array.isArray(state.trainingJobs)) state.trainingJobs = [];

  while (state.trainingSlots.length < slotCount) {
    const nextNo = state.trainingSlots.length + 1;
    state.trainingSlots.push({ unlocked: nextNo === 1 });
  }
  while (state.trainingJobs.length < slotCount) {
    state.trainingJobs.push(null);
  }
}
function ensureQuestState() {
  const slots = RANK.dispatchSlots(state.guildRank);
  if (!Array.isArray(state.questJobs)) state.questJobs = [];
  while (state.questJobs.length < slots) state.questJobs.push(null);
}
function ensureQuestOffers() {
  if (!state.questOffers) state.questOffers = null;
}
function ensurePending() {
  if (!Array.isArray(state.pendingResults)) state.pendingResults = [];
}
function ensureHire() {
  if (!state.hire) state.hire = { candidates: [], lastRefreshAt: 0 };
  if (!Array.isArray(state.hire.candidates)) state.hire.candidates = [];
}
function ensureTutorial() {
  if (typeof state.tutorialDone !== "boolean") state.tutorialDone = false;
  if (typeof state.tutorialStage !== "number") state.tutorialStage = 0;
  // stage:
  // 0=未開始
  // 1=猫加入完了
  // 2=訓練紹介済み（またはスキップ）
  // 3=チュートクエ受注済み
  // 4=チュートクエ受取済み（ランクアップ誘導待ち）
  // 5=Rank2達成 → tutorialDone
}
function ensureInvest() {
  if (!state.invest) {
    state.invest = {
      holdings: { insure: 0, arms: 0, trade: 0, magic: 0 },
      lastDividendDay: null,
    };
  }
  if (!state.invest.holdings) state.invest.holdings = { insure:0, arms:0, trade:0, magic:0 };
}

/* =========================
   Busy check (quest/training)
   ========================= */
function isCatBusy(catId) {
  for (const q of (state.questJobs || [])) {
    if (!q) continue;
    if (q.partyIds?.includes(catId)) return "quest";
  }
  for (const j of (state.trainingJobs || [])) {
    if (!j) continue;
    if (j.catId === catId) return "training";
  }
  return null;
}

/* =========================
   Create cats
   ========================= */
function makeCat(personality, name) {
  const base = 5 + Math.floor(Math.random() * 3);
  let str = base, agi = base, intv = base;

  const g = LEVEL.gain3(personality);
  const initBoost = (x) => (x >= 2 ? 1 : 0);
  str += initBoost(g.str);
  agi += initBoost(g.agi);
  intv += initBoost(g.int);

  return {
    id: uid(),
    name,
    personality,
    level: 1,
    exp: 0,
    str,
    agi,
    int: intv,
    hue: randomHue(),
  };
}

/* =========================
   Leveling
   ========================= */
function addExp(cat, amount) {
  cat.exp = (cat.exp || 0) + amount;

  while (cat.exp >= LEVEL.expToNext(cat.level)) {
    cat.exp -= LEVEL.expToNext(cat.level);
    cat.level += 1;

    const g = LEVEL.gain3(cat.personality);
    cat.str += g.str;
    cat.agi += g.agi;
    cat.int += g.int;

    if (Math.random() < 0.10) {
      const k = LEVEL.bonusPick(cat.personality);
      cat[k] += 1;
      pushLog(`${cat.name} の才能が花開いた！追加成長 +1`);
    }

    if (cat.level % 5 === 0) {
      const k2 = LEVEL.milestonePick(cat.personality);
      cat[k2] += 2;
      pushLog(`${cat.name} が節目成長！${k2.toUpperCase()} +2`);
    }

    pushLog(`${cat.name} が Lv${cat.level} に成長！`);
  }
}

/* =========================
   New game / Boot
   ========================= */
function newGame() {
  return {
    version: 5,
    guildRank: 1,
    gold: 3500,

    guildName: "Cozy Cat Guild",
    tutorialDone: false,
    tutorialStage: 0,

    cats: [],

    logs: [],
    pendingResults: [],

    hire: { candidates: [], lastRefreshAt: 0 },

    questJobs: [],
    trainingSlots: [],
    trainingJobs: [],

    invest: {
      holdings: { insure: 0, arms: 0, trade: 0, magic: 0 },
      lastDividendDay: null,
    },
  };
}

function boot() {
  state = load() || newGame();

  if (typeof state.guildRank !== "number") state.guildRank = 1;
  if (typeof state.gold !== "number") state.gold = 0;
  if (!Array.isArray(state.cats)) state.cats = [];
  if (typeof state.guildName !== "string") state.guildName = "Cozy Cat Guild";

  ensureQuestState();
  ensureTrainingState();
  ensurePending();
  ensureHire();
  ensureTutorial();
  ensureInvest();

  const tips = ["やる気はあるにゃ。","急がば回れ、にゃ。","訓練は裏切らないにゃ。","Goldは正義にゃ。"];
  if (el.dailyTip) el.dailyTip.textContent = tips[Math.floor(Math.random() * tips.length)];

  bindUI();

  showStartScreen();

  maybeGenerateDividendsOnLogin();

  renderAll();

  setInterval(tick, 1000);
  setInterval(toggleDumbbells, 500);
}

/* =========================
   Start Screen
   ========================= */
function showStartScreen() {
  const hasSave = !!localStorage.getItem(LS_SAVE);
  el.startScreen.classList.remove("hidden");
  el.mainScreen.classList.add("hidden");

  const meta = [];
  if (hasSave) meta.push(`Rank ${state.guildRank}`);
  if (hasSave) meta.push(`Gold ${state.gold.toLocaleString()}G`);
  if (state.tutorialDone) meta.push(`ギルド「${state.guildName}」`);
  if (el.startMeta) el.startMeta.textContent = meta.join(" / ");

  el.btnContinue?.classList.toggle("hidden", !hasSave);
  el.btnNew?.classList.toggle("hidden", !hasSave);
}

/* =========================
   Tutorial (FINAL)
   ========================= */
function startTutorialFlow() {
  const html = `
    <div class="panelCard">
      <div><b>ようこそ！ギルド名を決めよう</b></div>
      <div class="dim" style="margin-top:6px;">あとからいつでも変更できます。</div>
      <input id="guildNameInput"
        placeholder="例：もふもふギルド"
        value="${escapeAttr(state.guildName || "")}"
        style="width:100%;padding:10px;border-radius:10px;border:1px solid #232a36;background:#10141b;color:#e9ecf1;margin-top:10px;" />
    </div>

    <div class="panelCard" style="margin-top:10px;">
      <div><b>最初の仲間を選ぼう（無料）</b></div>
      <div class="dim">候補3匹から1匹を選びます。残り2匹は性格が被らないように自動で加入します。</div>
      <button class="primary" id="tutScout" style="margin-top:10px;">スカウトする</button>
    </div>

    <div class="modalFooter">
      <button class="ghost" id="tutClose">閉じる</button>
      <button class="primary" id="tutStart">開始</button>
    </div>
  `;
  openModal("チュートリアル", html);

  const input = document.getElementById("guildNameInput");
const btnStart = document.getElementById("tutStart");
const btnScout = document.getElementById("tutScout");

document.getElementById("tutClose").addEventListener("click", closeModal);

const setEnabled = (ok) => {
  btnStart.style.opacity = ok ? "1" : "0.5";
  btnStart.style.pointerEvents = "auto"; // ←disabledじゃないので常に押せる
};

const update = () => {
  const v = input.value.trim();
  setEnabled(v.length > 0);
};

// iOS対策：inputだけじゃなく複数拾う
["input", "change", "keyup", "blur"].forEach(ev => input.addEventListener(ev, update));
update();

const go = () => {
  const v = input.value.trim();
  if (!v) return;               // ←空なら何もしない（実質disabled）
  state.guildName = v;
  openTutorialScoutModal();
};

btnStart.addEventListener("click", go);
btnScout.addEventListener("click", go);

// iOSでフォーカス入れておくと change/blur も安定する
setTimeout(() => input.focus(), 50);
}

function generateCandidates(isTutorial = false) {
  const personalities = ["あまえんぼ","ツンデレ","クール","やんちゃ"];
  const names = ["ミケ","タマ","モモ","コテツ","マロン","ユズ","コハク","ルナ","ソラ","ハル"];

  const list = [];
  for (let i = 0; i < 3; i++) {
    const p = personalities[Math.floor(Math.random() * personalities.length)];
    const nm = names[Math.floor(Math.random() * names.length)] + (Math.random()<0.35 ? String(Math.floor(Math.random()*9)+1) : "");
    list.push(makeCat(p, nm));
  }

  if (isTutorial) {
    const set = new Set(list.map(x => x.personality));
    if (set.size <= 1) return generateCandidates(false);
  }

  return list;
}

function openTutorialScoutModal() {
  const candidates = generateCandidates(true);

  const html = `
    <div class="panelCard">
      <div><b>最初の仲間を選択（無料）</b></div>
      <div class="dim">この1匹はあなたが選びます。</div>
    </div>

    <div class="panelCard" style="margin-top:10px;">
      <div class="modalList">
        ${candidates.map(c => {
          const weapon = getWeaponImageByPersonality(c.personality);
          return `
            <div class="modalItem" data-pick="${c.id}">
              <div style="display:flex;gap:10px;align-items:center;">
                <div style="width:56px;height:56px;position:relative;flex:0 0 56px;">
                  <img src="img/cat.png" class="catSprite colorized"
                    style="--hue:${c.hue}deg;width:56px;height:56px;" />
                  ${weapon ? `<img src="${weapon}" style="position:absolute;left:0;top:0;width:56px;height:56px;image-rendering:pixelated;">` : ""}
                </div>
                <div style="min-width:0;">
                  <b>${escapeHtml(c.name)}</b> <span class="dim">Lv${c.level}</span>
                  <div class="dim">${escapeHtml(c.personality)} / STR ${c.str} AGI ${c.agi} INT ${c.int}</div>
                </div>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    </div>

    <div class="modalFooter">
      <button class="ghost" id="tutBack">戻る</button>
      <button class="primary" id="tutPickHint" disabled>候補をタップして選択</button>
    </div>
  `;

  openModal("スカウト（無料）", html);

  document.getElementById("tutBack").addEventListener("click", () => {
    closeModal();
    startTutorialFlow();
  });

  document.querySelectorAll("[data-pick]").forEach(item => {
    item.addEventListener("click", () => {
      const picked = candidates.find(c => c.id === item.dataset.pick);
      if (picked) finishTutorialCats(picked);
    });
  });
}

function finishTutorialCats(firstCat) {
  closeModal();

  if ((state.cats || []).length > 0) {
    state.tutorialDone = true;
    state.tutorialStage = 5;
    save();
    return;
  }

  state.cats.push(firstCat);

  const personalities = ["あまえんぼ","ツンデレ","クール","やんちゃ"];
  const remain = personalities.filter(p => p !== firstCat.personality);
  shuffleArray(remain);
  const extra1 = makeCat(remain[0], randomName());
  const extra2 = makeCat(remain[1], randomName());
  state.cats.push(extra1, extra2);

  state.tutorialStage = 1;

  pushLog(`ギルド「${state.guildName}」設立！`);
  pushLog(`${firstCat.name} が最初の仲間に！`);
  pushLog(`${extra1.name} が合流！`);
  pushLog(`${extra2.name} が合流！`);

  save();
  renderAll();

  openTutorialTrainingIntro();
}

function openTutorialTrainingIntro() {
  // 訓練タブを光らせる
  setTabGlow("training", true);

  const html = `
    <div class="panelCard">
      <div><b>🏋 訓練もできるよ</b></div>
      <div class="dim" style="margin-top:6px;">
        訓練は <b>ネコを成長</b> させる手段です。<br>
        クエストの前に少し育てて挑むこともできます。
      </div>
    </div>
    <div class="panelCard" style="margin-top:10px;">
      <div class="dim">
        ただし <b>訓練中はクエストに出せません</b>（両立不可）。
      </div>
    </div>
    <div class="modalFooter">
      <button class="ghost" id="ttSkip">今はスキップ</button>
      <button class="primary" id="ttGo">訓練を見てみる</button>
    </div>
  `;
  openModal("チュートリアル：訓練", html);

  const done = () => {
    setTabGlow("training", false);
    if (state.tutorialStage < 2) state.tutorialStage = 2;
    save();
  };

  document.getElementById("ttSkip").addEventListener("click", () => {
    closeModal();
    done();
    openTutorialQuestFlowExplain();
  });

  document.getElementById("ttGo").addEventListener("click", () => {
    closeModal();
    done();
    switchTab("training");
    // 訓練を見に行った後、ユーザーが戻ってきても迷子にならないように
    // すぐ次を出さず、上のドットやログで誘導する。だが初回だけ軽く案内は出す。
    openTutorialQuestFlowExplain(true);
  });
}

function openTutorialQuestFlowExplain(fromTraining = false) {
  const html = `
    <div class="panelCard">
      <div><b>📜 クエストの流れ</b></div>
      <div class="dim" style="margin-top:6px; line-height:1.6;">
        ①ネコを選ぶ → ②難易度Lvを確認 → ③受注を押す<br>
        これでクエストが始まります。<br>
        （クエスト中はキャンセルできません）
      </div>
    </div>
    <div class="panelCard" style="margin-top:10px;">
      <div class="dim">
        次は <b>チュートリアル専用クエスト（1分・確定成功）</b> を受けてみよう。
      </div>
    </div>
    <div class="modalFooter">
      <button class="ghost" id="tqLater">${fromTraining ? "あとで" : "閉じる"}</button>
      <button class="primary" id="tqGo">チュートリアルクエストへ</button>
    </div>
  `;
  openModal("チュートリアル：クエスト", html);

  document.getElementById("tqLater").addEventListener("click", closeModal);

  document.getElementById("tqGo").addEventListener("click", () => {
    closeModal();
    switchTab("quest");
    openTutorialQuestSetupModal();
  });
}

function openTutorialQuestSetupModal() {
  ensureQuestState();

  const slotIdx = state.questJobs.findIndex(x => !x);
  if (slotIdx < 0) {
    pushLog("派遣枠が空いていません");
    return;
  }

  const idle = state.cats.filter(c => !isCatBusy(c.id));
  if (idle.length === 0) {
    pushLog("待機中のネコがいません");
    return;
  }

  const fixedLv = 1; // チュートはLv1固定（操作体験）
  const html = `
    <div class="panelCard">
      <div><b>📦 チュートリアルクエスト（1分）</b></div>
      <div class="dim">確定成功 / まずは操作の流れを体験しよう。</div>
      <div class="dim">最大3匹まで選択（訓練と両立不可 / キャンセル不可）</div>
    </div>

    <div class="panelCard" style="margin-top:10px;">
      <div class="dim" style="margin-bottom:8px;">① 参加ネコ（最大3）</div>
      <div id="partyList" class="modalList"></div>
    </div>

    <div class="panelCard" style="margin-top:10px;">
      <div class="dim" style="margin-bottom:8px;">② 難易度Lv（固定）</div>
      <div class="row">
        <div><b>Lv${fixedLv}</b></div>
        <div class="dim">（チュートリアル）</div>
      </div>
    </div>

    <div class="panelCard" style="margin-top:10px;">
      <div class="dim" style="margin-bottom:8px;">③ 受注</div>
      <div class="dim" id="qPreview" style="margin-top:6px;">ネコを選択してください</div>
    </div>

    <div class="modalFooter">
      <button class="ghost" id="qCancel">戻る</button>
      <button class="primary" id="qStart" disabled>受注</button>
    </div>
  `;
  openModal("クエスト受注（チュートリアル）", html);

  const partyList = document.getElementById("partyList");
  const qPreview = document.getElementById("qPreview");
  const btnStart = document.getElementById("qStart");

  document.getElementById("qCancel").addEventListener("click", closeModal);

  const selected = new Set();

  partyList.innerHTML = idle.map(c => `
    <div class="modalItem" data-cat="${c.id}">
      <b>${escapeHtml(c.name)}</b> Lv${c.level}
      <div class="dim">${escapeHtml(c.personality)} / STR ${c.str} AGI ${c.agi} INT ${c.int}</div>
    </div>
  `).join("");

  partyList.addEventListener("click", (e) => {
    const item = e.target.closest(".modalItem");
    if (!item) return;
    const id = item.dataset.cat;

    if (selected.has(id)) {
      selected.delete(id);
      item.style.outline = "";
    } else {
      if (selected.size >= 3) return;
      selected.add(id);
      item.style.outline = "2px solid var(--blue)";
    }
    updatePreview();
  });

  function updatePreview() {
    const partyIds = Array.from(selected);
    const ok = partyIds.length > 0;
    btnStart.disabled = !ok;

    if (!ok) {
      qPreview.textContent = "ネコを選択してください";
      return;
    }
    qPreview.innerHTML = `時間: 1分 / 確定成功 / 受取待ちに入ります`;
  }

  btnStart.addEventListener("click", () => {
    const partyIds = Array.from(selected);
    closeModal();
    startTutorialQuest(partyIds, slotIdx);
  });
}

function startTutorialQuest(partyIds, slotIdx) {
  ensureQuestState();

  for (const id of partyIds) {
    if (isCatBusy(id)) {
      pushLog("パーティに待機中でないネコがいます");
      return;
    }
  }

  const now = Date.now();
  const endAt = now + 60 * 1000;

  const tutDef = {
    id: "tut",
    name: "配達",
    icon: "📦",
    level: 1,
    main: "STR",
    diff: "TUT",
    timeType: "S",
    durationMin: 1,
    baseGold: 2000,
    target: 0,
  };

  state.questJobs[slotIdx] = {
    slotNo: slotIdx + 1,
    def: tutDef,
    partyIds,
    score: 0,
    pSuccess: 100,
    goldMult: 1.0,
    startAt: now,
    endAt,
    tutorial: true,
  };

  state.tutorialStage = 3;
  pushLog(`チュートリアルクエスト開始（1分 / 確定成功）`);
  renderAll();
  save();
}
/* =========================
   Quests (Lv1-10 / S M L)
   ========================= */

function questTypes() {
  return [
    { id:"battle", icon:"🗡", name:"戦闘", main:"STR" },
    { id:"search", icon:"⚡", name:"探索", main:"AGI" },
    { id:"invest", icon:"🧠", name:"調査", main:"INT" },
  ];
}

function openQuestSetupModal(type) {
  ensureQuestOffers();
  if (!state.questOffers) rollQuestOffers();

  const fixedLv = state.questOffers[type.id];
  ensureQuestState();

  const slotIdx = state.questJobs.findIndex(x => !x);
  if (slotIdx < 0) {
    pushLog("派遣枠が空いていません");
    return;
  }

  const idle = state.cats.filter(c => !isCatBusy(c.id));
  if (idle.length === 0) {
    pushLog("待機中のネコがいません");
    return;
  }

  const maxLv = RANK.maxQuestLevel(state.guildRank);

  const html = `
    <div class="panelCard">
      <div><b>${type.icon} ${type.name}</b></div>
      <div class="dim">難易度Lvは Rank に応じて解放（最大 Lv${maxLv}）</div>
      <div class="dim">最大3匹まで選択（訓練と両立不可 / キャンセル不可）</div>
    </div>

    <div class="panelCard" style="margin-top:10px;">
      <div class="dim" style="margin-bottom:8px;">参加ネコ（最大3）</div>
      <div id="partyList" class="modalList"></div>
    </div>

    <div class="panelCard" style="margin-top:10px;">
      <div class="dim" style="margin-bottom:8px;">難易度Lv（自動）</div>
      <div class="row">
        <div><b>Lv${fixedLv}</b></div>
        <div class="dim">必要総戦力: ${QUEST.NEED_TOTAL[fixedLv - 1]}</div>
      </div>
    </div>

    <div class="panelCard" style="margin-top:10px;">
      <div class="dim" style="margin-bottom:8px;">時間タイプ</div>
      <div id="timeList" class="modalList"></div>
    </div>

    <div class="panelCard" style="margin-top:10px;">
      <div class="dim" id="qPreview">ネコと時間を選択してください</div>
    </div>

    <div class="modalFooter">
      <button class="ghost" id="qCancel">戻る</button>
      <button class="primary" id="qStart" disabled>受注</button>
    </div>
  `;

  openModal("クエスト受注", html);

  const partyList = document.getElementById("partyList");
  const timeList = document.getElementById("timeList");
  const qPreview = document.getElementById("qPreview");
  const btnStart = document.getElementById("qStart");

  document.getElementById("qCancel").addEventListener("click", closeModal);

  let pickTime = null;
  const selected = new Set();

  // ===== ネコ選択 =====
  partyList.innerHTML = idle.map(c => `
    <div class="modalItem" data-cat="${c.id}">
      <b>${escapeHtml(c.name)}</b> Lv${c.level}
      <div class="dim">${escapeHtml(c.personality)} / STR ${c.str} AGI ${c.agi} INT ${c.int}</div>
    </div>
  `).join("");

  partyList.addEventListener("click", (e) => {
    const item = e.target.closest(".modalItem");
    if (!item) return;

    const id = item.dataset.cat;

    if (selected.has(id)) {
      selected.delete(id);
      item.style.outline = "";
    } else {
      if (selected.size >= 3) return;
      selected.add(id);
      item.style.outline = "2px solid var(--blue)";
    }

    updatePreview();
  });

  // ===== 時間タイプ =====
  timeList.innerHTML = QUEST.TIME_TYPES.map(t => `
    <div class="modalItem" data-time="${t.key}">
      <b>${t.key}（${t.label}）</b>
      <div class="dim">効率 ${Math.round(t.eff * 100)}%</div>
    </div>
  `).join("");

  timeList.addEventListener("click", (e) => {
    const item = e.target.closest(".modalItem");
    if (!item) return;

    timeList.querySelectorAll(".modalItem")
      .forEach(x => x.style.outline = "");

    item.style.outline = "2px solid var(--blue)";
    pickTime = item.dataset.time;

    updatePreview();
  });

  // ===== プレビュー更新 =====
  function updatePreview() {
    const partyIds = Array.from(selected);
    const ok = partyIds.length > 0 && !!pickTime;

    btnStart.disabled = !ok;

    qPreview.innerHTML = `
      <div class="dim">
        【${type.icon} ${type.name}】 Lv${fixedLv} / ${pickTime ?? "?"}
      </div>
    `;

    if (!ok) return;

    const def = makeQuestDef(type, fixedLv, pickTime);
    const calc = calcQuestChance(def, partyIds);

    qPreview.innerHTML = `
      時間: ${def.durationMin}分 /
      基準Gold: ${def.baseGold.toLocaleString()}G<br>
      成功率(概算):
      <b>${calc.p}%</b>
      （属性ボーナス ${calc.attrBonus >= 0 ? "+" : ""}${calc.attrBonus}%）
    `;
  }

  // ===== 受注 =====
  btnStart.addEventListener("click", () => {
    const partyIds = Array.from(selected);
    const def = makeQuestDef(type, fixedLv, pickTime);

    closeModal();
    startQuest(def, partyIds, slotIdx);
  });
}

function makeQuestDef(type, level, timeKey) {
  const dur = QUEST.DUR_TABLE[level][timeKey];
  const eff = QUEST.TIME_TYPES.find(x => x.key === timeKey)?.eff ?? 1.0;

  const baseGold = Math.floor(dur * QUEST.goldPerMin(level) * eff);
  const target = QUEST.NEED_TOTAL[level - 1];

  return {
    id: `${type.id}_lv${level}_${timeKey}`,
    icon: type.icon,
    name: type.name,
    main: type.main,
    level,
    timeType: timeKey,
    durationMin: dur,
    baseGold,
    target,
  };
}

/* =========================
   Invest (dividends)
   ========================= */
function isShopUnlocked(key) {
  return state.guildRank >= INVEST.unlockRank[key];
}
function shopCap(key) {
  return state.guildRank * (INVEST.capPerRank[key] || 0);
}
function randDividendRate(key) {
  const s = INVEST.shops[key];
  const r = (Math.random() * 2 - 1) * s.var;
  const rate = s.base * (1 + r);
  return clamp(0, 1, rate);
}

function maybeGenerateDividendsOnLogin() {
  if (!RANK.canInvest(state.guildRank)) return;

  const today = dateKey(new Date());
  const last = state.invest.lastDividendDay;

  if (!last) {
    state.invest.lastDividendDay = today;
    save();
    return;
  }

  const diff = daysBetween(last, today);
  if (diff <= 0) return;

  let totalGold = 0;
  const breakdown = [];

  for (let day = 0; day < diff; day++) {
    for (const key of Object.keys(INVEST.shops)) {
      if (!isShopUnlocked(key)) continue;
      const amount = state.invest.holdings[key] || 0;
      if (amount <= 0) continue;

      const rate = randDividendRate(key);
      const gold = Math.floor(amount * rate);

      if (gold > 0) {
        totalGold += gold;
        breakdown.push({ key, gold, rate });
      }
    }
  }

  state.invest.lastDividendDay = today;

  if (totalGold > 0) {
    ensurePending();
    const summary = makeDividendSummary(breakdown);
    state.pendingResults.push({
      type: "dividend",
      finishedAt: Date.now(),
      gold: totalGold,
      breakdown,
      summary,
    });

    pushLog(`配当が届いた（受取待ち） +${totalGold.toLocaleString()}G`);
    save();

    openDividendPopup(totalGold, breakdown);
  } else {
    save();
  }
}

function makeDividendSummary(breakdown) {
  const by = {};
  for (const b of breakdown) {
    by[b.key] = (by[b.key] || 0) + b.gold;
  }
  const bestKey = Object.keys(by).sort((a,b)=>by[b]-by[a])[0];
  if (!bestKey) return "配当";
  return `${INVEST.shops[bestKey].name}中心`;
}

function dividendFlavor(breakdown) {
  if (!breakdown.length) return "今日は静かな相場だ。";

  const best = breakdown.reduce((p,c)=> (c.rate > p.rate ? c : p), breakdown[0]);
  const worst = breakdown.reduce((p,c)=> (c.rate < p.rate ? c : p), breakdown[0]);

  const bestShop = INVEST.shops[best.key];
  const worstShop = INVEST.shops[worst.key];

  const up = (best.rate / bestShop.base) - 1;
  const down = 1 - (worst.rate / worstShop.base);

  if (up >= 0.30 && best.key === "magic") return "🔮 新魔法の特許が成立！研究成果が爆発！";
  if (up >= 0.15 && best.key === "trade") return "🚢 交易路が大当たり！商人たちが賑わっている。";
  if (up >= 0.08 && best.key === "arms") return "🗡 武具の需要が堅調だ。戦の気配か？";
  if (up >= 0.03 && best.key === "insure") return "🛡 堅実な運営が実を結んでいる。";

  if (down >= 0.30 && worst.key === "magic") return "🔮 実験は難航しているようだ…";
  if (down >= 0.15 && worst.key === "trade") return "🚢 風向きが悪い日もある。";
  if (down >= 0.08 && worst.key === "arms") return "🗡 鍛冶場は静かだが、安定している。";
  if (down >= 0.03 && worst.key === "insure") return "🛡 今日も静かな黒字だ。";

  return "街の経済は穏やかに動いている。";
}

function openDividendPopup(totalGold, breakdown) {
  const sumByKey = {};
  const rateByKey = {};
  for (const b of breakdown) {
    sumByKey[b.key] = (sumByKey[b.key] || 0) + b.gold;
    rateByKey[b.key] = b.rate;
  }

  const lines = Object.keys(INVEST.shops)
    .filter(k => (sumByKey[k] || 0) > 0)
    .map(k => {
      const s = INVEST.shops[k];
      const amt = state.invest.holdings[k] || 0;
      const g = sumByKey[k];
      const r = rateByKey[k] || s.base;
      return `・${s.icon} ${s.name}：出資 ${amt.toLocaleString()}G / 配当率 ${(r*100).toFixed(2)}% → +${g.toLocaleString()}G`;
    }).join("<br>");

  const flavor = dividendFlavor(breakdown);

  const html = `
    <div class="panelCard">
      <div style="font-size:16px;font-weight:900;">📈 本日の配当が届いた！</div>
      <div class="dim" style="margin-top:6px;">合計：<b>+${totalGold.toLocaleString()}G</b>（受取待ちに追加）</div>
    </div>
    <div class="panelCard" style="margin-top:10px;">
      <div class="dim">${lines || "（配当なし）"}</div>
    </div>
    <div class="panelCard" style="margin-top:10px;">
      <div class="dim">${escapeHtml(flavor)}</div>
    </div>
    <div class="modalFooter">
      <button class="ghost" id="dvClose">閉じる</button>
      <button class="primary" id="dvGo">受取待ちを見る</button>
    </div>
  `;
  openModal("配当", html);
  document.getElementById("dvClose").addEventListener("click", closeModal);
  document.getElementById("dvGo").addEventListener("click", () => {
    closeModal();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}

function openInvestDepositModal(key) {
  const s = INVEST.shops[key];
  if (!isShopUnlocked(key)) return;

  const cap = shopCap(key);
  const cur = state.invest.holdings[key] || 0;
  const remain = Math.max(0, cap - cur);

  const html = `
    <div class="panelCard">
      <div><b>${s.icon} ${escapeHtml(s.name)}</b></div>
      <div class="dim" style="margin-top:6px;">
        出資は <b>${INVEST.STEP.toLocaleString()}G</b> 単位 / 売却不可 / 価格変動なし
      </div>
    </div>
    <div class="panelCard" style="margin-top:10px;">
      <div class="dim">出資額：${cur.toLocaleString()}G / 上限：${cap.toLocaleString()}G</div>
      <div class="dim">追加できる残り：${remain.toLocaleString()}G</div>
    </div>
    <div class="panelCard" style="margin-top:10px;">
      <div class="dim">追加出資額（${INVEST.STEP.toLocaleString()}G単位）</div>
      <input id="depInput" inputmode="numeric" placeholder="例：5000"
        style="width:100%;padding:10px;border-radius:10px;border:1px solid #232a36;background:#10141b;color:#e9ecf1;margin-top:8px;" />
      <div class="dim" style="margin-top:6px;">所持Gold：${state.gold.toLocaleString()}G</div>
    </div>
    <div class="modalFooter">
      <button class="ghost" id="depCancel">キャンセル</button>
      <button class="primary" id="depOk">出資する</button>
    </div>
  `;
  openModal("追加出資", html);

  document.getElementById("depCancel").addEventListener("click", closeModal);
  document.getElementById("depOk").addEventListener("click", () => {
    const raw = document.getElementById("depInput").value.trim();
    const val = Number(raw);
    if (!Number.isFinite(val) || val <= 0) { closeModal(); return; }

    const amt = Math.floor(val / INVEST.STEP) * INVEST.STEP;
    if (amt <= 0) { closeModal(); return; }

    const cap2 = shopCap(key);
    const cur2 = state.invest.holdings[key] || 0;
    if (cur2 + amt > cap2) {
      pushLog("出資上限を超えています");
      closeModal();
      return;
    }
    if (state.gold < amt) {
      pushLog("Goldが足りません");
      closeModal();
      return;
    }

    state.gold -= amt;
    state.invest.holdings[key] = cur2 + amt;
    pushLog(`${s.name} に出資 +${amt.toLocaleString()}G`);
    save();
    renderAll();
    closeModal();
  });
}

/* =========================
   Rendering
   ========================= */
function renderAll() {
  ensureQuestState();
  ensureTrainingState();
  ensurePending();
  ensureHire();
  ensureTutorial();
  ensureInvest();
  ensureQuestOffers();
   
  renderGuildTitle();
  renderHeaderBadges();
  renderRankUp();
  renderPending();
  renderTabs();
  renderLogs();

  const investUnlocked = RANK.canInvest(state.guildRank);
  document.querySelector(`.tab[data-tab="invest"]`)?.classList.toggle("hidden", !investUnlocked);
  el.tabInvest?.classList.toggle("hidden", currentTab !== "invest");
}

function renderGuildTitle() {
  if (el.guildTitle) el.guildTitle.textContent = state.guildName || "Cozy Cat Guild";
}

function renderHeaderBadges() {
  const rank = state.guildRank;
  const mult = RANK.goldMult(rank);
  const hs = RANK.hireSlots(rank);
  const ts = RANK.trainingSlots(rank);
  const ds = RANK.dispatchSlots(rank);

  const usedDispatch = (state.questJobs || []).filter(Boolean).length;
  const usedTraining = (state.trainingJobs || []).filter(Boolean).length;

  const badges = [
    ["Rank", String(rank)],
    ["Gold", state.gold.toLocaleString()],
    ["倍率", `×${mult.toFixed(1)}`],
    ["総戦力", String(totalPower())],
    ["派遣枠", `${usedDispatch}/${ds}`],
    ["訓練枠", `${usedTraining}/${ts}`],
    ["雇用枠", `${state.cats.length}/${hs}`],
  ];

  el.hud.innerHTML = badges.map(([k,v]) => `
    <div class="badge"><span class="k">${escapeHtml(k)}</span><span class="v">${escapeHtml(v)}</span></div>
  `).join("");
}

function renderRankUp() {
  const next = state.guildRank + 1;
  const cost = RANK.cost(next);
  el.rankInfo.textContent = `Rank ${state.guildRank} → ${next}`;
  el.rankCostText.textContent = `必要: ${cost.toLocaleString()}G`;
  el.btnRankUp.disabled = state.gold < cost;
  el.btnRankUp.style.opacity = state.gold < cost ? "0.6" : "1";
}

function renderPending() {
  const n = (state.pendingResults || []).length;
  if (n <= 0) el.pendingBar.classList.add("hidden");
  else {
    el.pendingBar.classList.remove("hidden");
    el.pendingText.textContent = `受取待ち: ${n}`;
  }

  const hasTrainingDone = (state.pendingResults || []).some(r => r.type === "training");
  const hasQuestDone = (state.pendingResults || []).some(r => r.type === "quest");
  const hasDividend = (state.pendingResults || []).some(r => r.type === "dividend");

  el.dotTraining?.classList.toggle("hidden", !hasTrainingDone);
  el.dotQuest?.classList.toggle("hidden", !hasQuestDone);
  el.dotInvest?.classList.toggle("hidden", !hasDividend);
}

function renderTabs() {
  if (currentTab === "quest") renderQuestTab();
  if (currentTab === "cats") renderCatsTab();
  if (currentTab === "training") renderTrainingTab();
  if (currentTab === "invest") renderInvestTab();
}

function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
  document.querySelector(`.tab[data-tab="${tab}"]`)?.classList.add("active");

  el.tabQuest.classList.toggle("hidden", tab !== "quest");
  el.tabCats.classList.toggle("hidden", tab !== "cats");
  el.tabTraining.classList.toggle("hidden", tab !== "training");
  el.tabInvest.classList.toggle("hidden", tab !== "invest");

  renderTabs();
}

function renderQuestTab() {
  ensureQuestOffers();
  if (!state.questOffers) rollQuestOffers();
  const types = questTypes();
  const ds = RANK.dispatchSlots(state.guildRank);
  const used = (state.questJobs || []).filter(Boolean).length;
  const maxLv = RANK.maxQuestLevel(state.guildRank);

  el.tabQuest.innerHTML = `
    <div class="panelCard">
      <div class="row">
        <div>
          <div><b>クエスト</b> <span class="dim">(Lv1〜${maxLv} 解放中)</span></div>
          <div class="dim">S/M/Lで時間選択（Sが最効率）。訓練と両立不可 / キャンセル不可</div>
        </div>
        <div class="mono">派遣枠 ${used}/${ds}</div>
      </div>
    </div>

    ${types.map(t => `
      <div class="panelCard">
        <div class="row">
          <div>
            <div><b>${t.icon} ${t.name}</b></div>
            <div class="dim">属性：${t.main} / 今日の提示：<b>Lv${state.questOffers[t.id]}</b>（受注ごと再抽選）</div>
          </div>
          <button class="primary smallBtn" data-qtype="${t.id}">受注</button>
        </div>
      </div>
    `).join("")}

    ${renderQuestRunning()}
  `;

  el.tabQuest.querySelectorAll("[data-qtype]").forEach(btn => {
    btn.addEventListener("click", () => {
      const t = types.find(x => x.id === btn.dataset.qtype);
      if (t) openQuestSetupModal(t);
    });
  });
}

function renderQuestRunning() {
  const running = (state.questJobs || []).filter(Boolean);
  if (running.length === 0) return "";

  return running.map(job => {
    const remain = Math.max(0, job.endAt - Date.now());
    const label = job.tutorial
      ? `チュートリアル（1分）`
      : `${job.def.name} Lv${job.def.level}${job.def.timeType} / ${job.def.durationMin}分`;
    return `
      <div class="panelCard">
        <div class="row">
          <div>
            <div><span class="statusDot quest"></span><b>クエスト中</b></div>
            <div class="dim">${escapeHtml(label)}</div>
          </div>
          <div class="mono">${formatRemain(remain)}</div>
        </div>
      </div>
    `;
  }).join("");
}

function renderCatsTab() {
  const hs = RANK.hireSlots(state.guildRank);
  const hireCost = HIRING.hireCost(state.guildRank);
  const scoutCost = HIRING.refreshCost(state.guildRank);
  const hasCandidates = (state.hire?.candidates?.length || 0) > 0;
  const canFire = RANK.canFire(state.guildRank);

  const catsHtml = (state.cats || []).map(c => {
    const busy = isCatBusy(c.id);
    const statusText = busy === "quest" ? "クエスト" : busy === "training" ? "訓練" : "待機";
    const dotClass = busy === "quest" ? "quest" : busy === "training" ? "training" : "";

  const weaponImg = getWeaponImageByPersonality(c.personality);
　　const training = busy === "training";
　　const onQuest = busy === "quest";

　　return `
 　　 <div class="panelCard catCard" style="display:flex;align-items:center;gap:12px;">
  <div class="catSpriteWrap" style="position:relative;width:64px;height:64px;flex:0 0 64px;">
    <!-- 素体（32px素材を64px表示で固定） -->
    <img
      src="img/cat.png"
      class="catSprite colorized"
      style="--hue:${c.hue}deg;width:64px;height:64px;display:block;image-rendering:pixelated;"
      alt=""
    />

    ${
      training
        ? `
          <img
            src="img/jim1.png"
            class="catDumbbell"
            data-jim="${c.id}"
            style="position:absolute;inset:0;width:64px;height:64px;image-rendering:pixelated;pointer-events:none;"
            alt=""
          />
        `
        : (onQuest && weaponImg)
          ? `
            <img
              src="${weaponImg}"
              class="catWeapon"
              style="position:absolute;inset:0;width:64px;height:64px;image-rendering:pixelated;pointer-events:none;"
              alt=""
            />
          `
          : ""
    }
  </div>

        <div style="min-width:0;flex:1;">
          <div class="row">
            <div style="min-width:0;">
              <b>${escapeHtml(c.name)}</b> <span class="dim">Lv${c.level}</span>
            </div>
            <div><span class="statusDot ${dotClass}"></span>${statusText}</div>
          </div>
          <div class="dim">${escapeHtml(c.personality)}</div>
          <div class="mono catStats">STR ${c.str} / AGI ${c.agi} / INT ${c.int}</div>

          <div class="row" style="margin-top:8px;">
            <div class="dim">EXP ${c.exp}/${LEVEL.expToNext(c.level)}</div>
            <div style="display:flex;gap:8px;">
              <button class="ghost smallBtn" data-rename="${c.id}">名前変更</button>
              ${canFire ? `<button class="ghost smallBtn" data-fire="${c.id}" ${busy ? "disabled" : ""} style="${busy ? "opacity:.6;" : ""}">解雇</button>` : ""}
            </div>
          </div>
        </div>
      </div>
    `;
  }).join("");

  el.tabCats.innerHTML = `
    <div class="panelCard">
      <div class="row">
        <div>
          <div><b>ギルド戦力</b></div>
          <div class="dim">待機→クエスト→訓練（両立不可）</div>
        </div>
        <div class="mono">${totalPower()}</div>
      </div>
    </div>

    ${catsHtml || `<div class="panelCard"><div class="dim">ネコがいません。チュートリアルから開始してください。</div></div>`}

    <div class="panelCard">
      <div><b>雇用</b> <span class="dim">雇用枠 ${state.cats.length}/${hs}</span></div>
      <div class="dim">雇用費: ${hireCost.toLocaleString()}G</div>
      <div class="dim">候補は「スカウト」で確認できます</div>

      <div class="row" style="margin-top:10px;">
        <button class="primary smallBtn" id="btnScout">スカウトする ${scoutCost.toLocaleString()}G</button>
        <button class="ghost smallBtn" id="btnViewCandidates" ${hasCandidates ? "" : "disabled"} style="${hasCandidates ? "" : "opacity:.6;"}">
          候補を見る
        </button>
      </div>

      ${canFire ? `<div class="dim" style="margin-top:10px;">解雇はRank5から可能（待機中のみ）</div>` : `<div class="dim" style="margin-top:10px;">解雇はRank5で解放</div>`}
    </div>
  `;

  el.tabCats.querySelectorAll("[data-rename]").forEach(btn => {
    btn.addEventListener("click", () => openRenameCatModal(btn.dataset.rename));
  });
  el.tabCats.querySelectorAll("[data-fire]").forEach(btn => {
    btn.addEventListener("click", () => openFireCatModal(btn.dataset.fire));
  });

  document.getElementById("btnScout")?.addEventListener("click", () => scoutPayAndOpen());
  document.getElementById("btnViewCandidates")?.addEventListener("click", () => openScoutModal(false));
}

function renderTrainingTab() {
  ensureTrainingState();

  const slotCount = state.trainingJobs.length;
  const usedTraining = state.trainingJobs.filter(Boolean).length;

  const cards = [];
  for (let slotNo = 1; slotNo <= slotCount; slotNo++) {
    const slot = state.trainingSlots[slotNo - 1];
    const job = state.trainingJobs[slotNo - 1];
    const { unlockCost, expMult } = getTrainingSlotMeta(slotNo);

    if (job) {
      const remain = Math.max(0, job.endAt - Date.now());
      cards.push(`
        <div class="panelCard">
          <div class="row">
            <div>
              <div><b>訓練枠 ${slotNo}</b> <span class="dim">（訓練中）</span></div>
              <div class="dim">EXP: ${job.expGain} / 使用料: ${job.useCost.toLocaleString()}G / 倍率: x${expMult.toFixed(1)}</div>
            </div>
            <div class="mono">${formatRemain(remain)}</div>
          </div>
        </div>
      `);
      continue;
    }

    if (!slot.unlocked) {
      cards.push(`
        <div class="panelCard">
          <div class="row">
            <div>
              <div><b>訓練枠 ${slotNo}</b> <span class="dim">（未開放）</span></div>
              <div class="dim">開放費: ${unlockCost.toLocaleString()}G / 倍率: x${expMult.toFixed(1)}</div>
            </div>
            <button class="primary smallBtn" data-unlock-slot="${slotNo}">開放</button>
          </div>
        </div>
      `);
      continue;
    }

    cards.push(`
      <div class="panelCard">
        <div class="row">
          <div>
            <div><b>訓練枠 ${slotNo}</b> <span class="dim">（使用可）</span></div>
            <div class="dim">倍率: x${expMult.toFixed(1)} / ${slotNo === 1 ? "使用料: 0G" : "使用料: 時間に応じて発生"}</div>
          </div>
          <button class="primary smallBtn" data-start-slot="${slotNo}">訓練する</button>
        </div>
      </div>
    `);
  }

  el.tabTraining.innerHTML = `
    <div class="panelCard">
      <div><b>訓練</b> <span class="dim">1EXP/分 / 受取式 / クエストと両立不可</span></div>
      <div class="dim">空き: ${(slotCount - usedTraining)}/${slotCount}（枠2以降は開放費＋使用料あり）</div>
    </div>
    ${cards.join("")}
  `;

  el.tabTraining.querySelectorAll("[data-unlock-slot]").forEach(btn => {
    btn.addEventListener("click", () => unlockTrainingSlot(Number(btn.dataset.unlockSlot)));
  });
  el.tabTraining.querySelectorAll("[data-start-slot]").forEach(btn => {
    btn.addEventListener("click", () => openTrainingStartModal(Number(btn.dataset.startSlot)));
  });
}

function renderInvestTab() {
  ensureInvest();

  if (!RANK.canInvest(state.guildRank)) {
    el.tabInvest.innerHTML = `<div class="panelCard"><div class="dim">Rank10で解放</div></div>`;
    return;
  }

  const today = dateKey(new Date());
  const nextMidnight = (() => {
    const d = new Date();
    const n = new Date(d.getFullYear(), d.getMonth(), d.getDate()+1, 0, 0, 0);
    return n.getTime();
  })();
  const remain = nextMidnight - Date.now();

  const cards = Object.keys(INVEST.shops).map(key => {
    const s = INVEST.shops[key];
    const unlocked = isShopUnlocked(key);
    const cap = shopCap(key);
    const cur = state.invest.holdings[key] || 0;
    const lockedMsg = unlocked ? "" : `（Rank${INVEST.unlockRank[key]}で解放）`;

    const basePct = (s.base * 100).toFixed(2);
    const varPct = (s.var * 100).toFixed(0);

    const canDeposit = unlocked && cur < cap;

    return `
      <div class="panelCard">
        <div class="row">
          <div style="min-width:0;">
            <div><b>${s.icon} ${escapeHtml(s.name)}</b> <span class="dim">${escapeHtml(lockedMsg)}</span></div>
            <div class="dim">配当：${basePct}% / 変動：±${varPct}%（価格変動なし・売却不可）</div>
            <div class="dim">出資：${cur.toLocaleString()}G / 上限：${cap.toLocaleString()}G</div>
          </div>
          <button class="primary smallBtn" data-dep="${key}" ${canDeposit ? "" : "disabled"} style="${canDeposit ? "" : "opacity:.6;"}">出資</button>
        </div>
      </div>
    `;
  }).join("");

  el.tabInvest.innerHTML = `
    <div class="panelCard">
      <div><b>投資</b> <span class="dim">（放置収入 / クエストが主役）</span></div>
      <div class="dim">締め：毎日 0:00 / 次の配当まで：${formatRemain(remain)}</div>
      <div class="dim">配当はログイン時に確定し、受取待ちに入ります。</div>
      <div class="dim">今日：${today}</div>
    </div>
    ${cards}
  `;

  el.tabInvest.querySelectorAll("[data-dep]").forEach(btn => {
    btn.addEventListener("click", () => openInvestDepositModal(btn.dataset.dep));
  });
}

/* =========================
   Tick
   ========================= */
function tick() {
  finishTrainingIfDone();
  finishQuestsIfDone();
  renderPending();

  if (currentTab === "quest") renderQuestTab();
  if (currentTab === "training") renderTrainingTab();

  document.documentElement.scrollLeft = 0;
  document.body.scrollLeft = 0;
}

/* Training dumbbell animation */
function toggleDumbbells() {
  jimFlip = !jimFlip;
  const jobs = state.trainingJobs || [];
  for (const job of jobs) {
    if (!job) continue;
    const img = document.querySelector(`img[data-jim="${job.catId}"]`);
    if (!img) continue;
    img.src = jimFlip ? "img/jim2.png" : "img/jim1.png";
  }
}

/* =========================
   Start
   ========================= */
boot();
console.log("END");
