// Cozy Cat Guild - app.js (v0.5+)
// - 起動時は必ずスタート画面（続きから入る）
// - Tutorial強化：ギルド名 → 無料スカウト1匹選択 → 残り2匹自動加入（性格被りなし）
//   → チュートリアル専用クエ（確定成功/1分）→ 受取 → ランクアップ体験（Rank2）
// - 成長：LvUpごとに合計+3（性格配分）＋10%で追加+1（性格寄り）＋節目(Lv5/10/15...)で+2
// - あまえんぼは万能（+1/+1/+1）
// - 解雇：Rank5解放、返却Gold = Lv * 500G（スキルは将来だが、解雇で消える前提）
// - クエスト：Lv1-10をランクに応じて解放（Max=min(10,Rank)）＆S/M/L時間タイプ
// - 投資：Rank10でタブ解放。価格変動なし/売却不可/出資1000G単位/配当のみ変動（0:00締め）
//   ログイン時に配当が確定したらポップアップ（高配当/低配当商会に応じた一言）

const LS_SAVE = "ccg_save_v3";

/* =========================
   Economy / Rules
   ========================= */
const RANK = {
  cost(nextRank) {
    // 5,000 × (nextRank - 1)^3
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
    return Math.min(10, Math.max(1, rank)); // Rankに応じてLv解放（Lv1〜10）
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
  DURATIONS_MIN: [60, 120, 240, 480], // 1/2/4/8h
  UNLOCK_BASE: 40000,      // 40,000 × (slotNo-1)^2
  USE_COST_PER_MIN: 8,     // 毎分の使用料（slot2以降）
  MULT_PER_PAID_SLOT: 0.5, // slot2=1.5x, slot3=2.0x...
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
  // レベルアップ時の配分（合計+3）
  gain3(personality) {
    switch (personality) {
      case "ツンデレ": return { str: 2, agi: 1, int: 0 };
      case "やんちゃ": return { str: 1, agi: 2, int: 0 };
      case "クール":   return { str: 1, agi: 0, int: 2 }; // +1はSTR寄り（固定）
      case "あまえんぼ": return { str: 1, agi: 1, int: 1 }; // 万能
      default: return { str: 1, agi: 1, int: 1 };
    }
  },
  // 10% 追加+1（性格寄り）
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
  // 節目(Lv5/10/15...) +2（性格寄り）
  milestonePick(personality) {
    // クールはINT、ツンデレSTR、やんちゃAGI、あまえんぼはランダム
    return LEVEL.bonusPick(personality);
  },
};

const QUEST = {
  // 必要総戦力テーブル（Lv1〜10）
  NEED_TOTAL: [53, 70, 90, 115, 145, 180, 220, 265, 315, 370],
  // 時間タイプ（効率差：Sが最効率、Lは少し落ちる）
  TIME_TYPES: [
    { key: "S", label: "短", eff: 1.00 },
    { key: "M", label: "中", eff: 0.96 },
    { key: "L", label: "長", eff: 0.92 },
  ],
  // 難易度Lvごとの時間（分） S/M/L
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
  // ベースGold/分（Lvごとに上がる）※投資が主役にならないよう控えめ
  goldPerMin(level) {
    return 70 + level * 12; // Lv1=82, Lv10=190
  },
  // 結果倍率
  resultMult(result) {
    if (result === "大成功") return 1.6;
    if (result === "成功") return 1.0;
    return 0.3; // 失敗でも少しは出る（萎え防止）
  },
  // EXP/分（固定） ※失敗でもそこそこ入る
  expPerMin(result) {
    if (result === "大成功") return 1.2;
    if (result === "成功") return 1.0;
    return 0.8;
  },
};

const INVEST = {
  // 解放ランク
  unlockRank: {
    insure: 10,
    arms: 12,
    trade: 13,
    magic: 15,
  },
  // 配当（基本×(1±変動)）
  shops: {
    insure: { name: "保険組合", base: 0.025, var: 0.05, icon: "🛡" }, // 2.5% ±5%
    arms:   { name: "武具商会", base: 0.03,  var: 0.10, icon: "🗡" }, // 3% ±10%
    trade:  { name: "交易商会", base: 0.03,  var: 0.20, icon: "🚢" }, // 3% ±20%
    magic:  { name: "魔導研究所", base: 0.02, var: 0.50, icon: "🔮" }, // 2% ±50%
  },
  // 出資上限（商会別：Rank×係数）
  capPerRank: {
    insure: 15000,
    arms: 12000,
    trade: 10000,
    magic: 8000,
  },
  // 出資単位
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

  tabQuestBtn: document.querySelector(`.tab[data-tab="quest"]`),
  tabCatsBtn: document.querySelector(`.tab[data-tab="cats"]`),
  tabTrainingBtn: document.querySelector(`.tab[data-tab="training"]`),
  tabInvestBtn: document.querySelector(`.tab[data-tab="invest"]`),

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
  // aKey -> bKey の日数差（b-a）
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
  // 0=未開始,1=猫加入済み,2=チュートクエ開始済み,3=受取済み,4=Rank2済み→tutorialDone
}
function ensureInvest() {
  if (!state.invest) {
    state.invest = {
      holdings: { insure: 0, arms: 0, trade: 0, magic: 0 },
      lastDividendDay: null, // YYYY-MM-DD
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

  // 初期の性格寄り（ほんの少し）
  const g = LEVEL.gain3(personality);
  // gain3はレベルアップ配分だが、初期も軽く反映（+2/+1系を+1/+0に縮小）
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

    // 基本+3
    const g = LEVEL.gain3(cat.personality);
    cat.str += g.str;
    cat.agi += g.agi;
    cat.int += g.int;

    // 10% 追加+1
    if (Math.random() < 0.10) {
      const k = LEVEL.bonusPick(cat.personality);
      cat[k] += 1;
      pushLog(`${cat.name} の才能が花開いた！追加成長 +1`);
    }

    // 節目 +2（Lv5/10/15... 到達時）
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
    gold: 3500, // 初期Goldは少なめ（チュートリアルでランクアップ体験）

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

  // Backward-safe defaults
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

  // daily tip
  const tips = ["やる気はあるにゃ。","急がば回れ、にゃ。","訓練は裏切らないにゃ。","Goldは正義にゃ。"];
  if (el.dailyTip) el.dailyTip.textContent = tips[Math.floor(Math.random() * tips.length)];

  bindUI();

  // 起動時は必ずスタート画面に戻す
  showStartScreen();

  // 起動時：配当判定（Rank10以上）
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

  // 続きから（セーブあり）
  if (el.btnContinue) el.btnContinue.classList.toggle("hidden", !hasSave);
  if (el.btnNew) el.btnNew.classList.toggle("hidden", !hasSave);
  // セーブなしなら btnStart を使う（「開始」）
}

/* =========================
   Tutorial + Guild name
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
      <button class="primary" id="tutStart" disabled>開始</button>
    </div>
  `;
  openModal("チュートリアル", html);

  const input = document.getElementById("guildNameInput");
  const btnStart = document.getElementById("tutStart");
  document.getElementById("tutClose").addEventListener("click", closeModal);

  const update = () => {
    const v = input.value.trim();
    btnStart.disabled = (v.length === 0);
  };
  input.addEventListener("input", update);
  update();

  btnStart.addEventListener("click", () => {
    const v = input.value.trim();
    state.guildName = v || "Cozy Cat Guild";
    openTutorialScoutModal();
  });

  document.getElementById("tutScout").addEventListener("click", () => {
    const v = input.value.trim();
    state.guildName = v || "Cozy Cat Guild";
    openTutorialScoutModal();
  });
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
                  ${weapon ? `<img src="${weapon}" style="position:absolute;right:-4px;bottom:4px;width:22px;image-rendering:pixelated;">` : ""}
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

  // 既に猫がいる（古いセーブ等）場合は追加しない
  if ((state.cats || []).length > 0) {
    state.tutorialDone = true;
    state.tutorialStage = 4;
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

  // 次：確定成功クエへ誘導
  openTutorialQuestIntro();
}

function openTutorialQuestIntro() {
  const html = `
    <div class="panelCard">
      <div><b>次はクエストに出してみよう</b></div>
      <div class="dim" style="margin-top:6px;">
        チュートリアル専用クエスト（1分）です。<br>
        <b>確定成功</b>なので安心して受注できます。
      </div>
    </div>
    <div class="panelCard" style="margin-top:10px;">
      <div class="dim">終わったら「受取待ち」から報酬を受け取ろう。</div>
    </div>
    <div class="modalFooter">
      <button class="ghost" id="tqClose">あとで</button>
      <button class="primary" id="tqStart">チュートリアルクエスト開始</button>
    </div>
  `;
  openModal("チュートリアル：クエスト", html);
  document.getElementById("tqClose").addEventListener("click", closeModal);
  document.getElementById("tqStart").addEventListener("click", () => {
    closeModal();
    startTutorialQuest();
  });
}

function startTutorialQuest() {
  ensureQuestState();
  const slotIdx = state.questJobs.findIndex(x => !x);
  if (slotIdx < 0) return;

  const partyIds = state.cats.slice(0, 3).map(c => c.id);

  const now = Date.now();
  const endAt = now + 60 * 1000;

  // Rank2に届くように調整：初期3500 + 報酬2000 = 5500 → Rank2 5000支払い可能
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
    goldMult: 1.0, // チュートは倍率なし（説明を簡単に）
    startAt: now,
    endAt,
    tutorial: true,
  };

  state.tutorialStage = 2;
  pushLog(`チュートリアルクエスト開始（1分 / 確定成功）`);
  renderAll();
  save();
}

/* =========================
   UI Bindings
   ========================= */
function bindUI() {
  // Start / Continue
  el.btnStart?.addEventListener("click", () => {
    // セーブ無し or 初回：チュートリアルへ
    if (!state.tutorialDone) {
      openMainAndRunTutorial();
      return;
    }
    openMain();
  });

  el.btnContinue?.addEventListener("click", () => {
    // 必ずスタート画面から入るが、続きはここ
    openMainAndMaybeTutorial();
  });

  el.btnNew?.addEventListener("click", () => {
    const html = `
      <div class="panelCard">
        <div><b>新しく始めますか？</b></div>
        <div class="dim" style="margin-top:6px;">現在のデータは削除されます。</div>
        <div class="dim" style="margin-top:6px;">実行するには <b>RESET</b> と入力してください。</div>
      </div>
      <div class="panelCard" style="margin-top:10px;">
        <input id="resetInput2" placeholder="RESET と入力"
          style="width:100%;padding:10px;border-radius:10px;border:1px solid #232a36;background:#10141b;color:#e9ecf1;" />
      </div>
      <div class="modalFooter">
        <button class="ghost" id="newCancel">キャンセル</button>
        <button class="primary" id="newConfirm" disabled>新しく始める</button>
      </div>
    `;
    openModal("確認", html);
    const input = document.getElementById("resetInput2");
    const btn = document.getElementById("newConfirm");
    document.getElementById("newCancel").addEventListener("click", closeModal);
    input.addEventListener("input", () => { btn.disabled = input.value !== "RESET"; });
    btn.addEventListener("click", () => {
      localStorage.removeItem(LS_SAVE);
      closeModal();
      location.reload();
    });
  });

  if (el.btnGuildName) el.btnGuildName.addEventListener("click", () => openGuildRenameModal());

  // safe reset (type RESET)
  el.btnReset.addEventListener("click", () => {
    const html = `
      <div class="panelCard">
        <div><b>⚠ データリセット</b></div>
        <div class="dim" style="margin-top:6px;">ギルド・ネコ・Gold・進行状況がすべて削除されます。</div>
        <div class="dim" style="margin-top:6px;">実行するには <b>RESET</b> と入力してください。</div>
      </div>

      <div class="panelCard" style="margin-top:10px;">
        <input id="resetInput" placeholder="RESET と入力"
          style="width:100%;padding:10px;border-radius:10px;border:1px solid #232a36;background:#10141b;color:#e9ecf1;" />
      </div>

      <div class="modalFooter">
        <button class="ghost" id="resetCancel">キャンセル</button>
        <button class="primary" id="resetConfirm" disabled>完全削除</button>
      </div>
    `;
    openModal("データリセット確認", html);

    const input = document.getElementById("resetInput");
    const confirmBtn = document.getElementById("resetConfirm");
    document.getElementById("resetCancel").addEventListener("click", closeModal);

    input.addEventListener("input", () => {
      confirmBtn.disabled = input.value !== "RESET";
    });
    confirmBtn.addEventListener("click", () => {
      localStorage.removeItem(LS_SAVE);
      closeModal();
      location.reload();
    });
  });

  el.btnRankUp.addEventListener("click", () => doRankUp());
  el.btnCollectAll.addEventListener("click", () => collectAll());

  // tabs
  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      if (tab === "invest" && !RANK.canInvest(state.guildRank)) return;
      switchTab(tab);
    });
  });
}

function openMain() {
  el.startScreen.classList.add("hidden");
  el.mainScreen.classList.remove("hidden");
  renderAll();
}
function openMainAndMaybeTutorial() {
  openMain();
  if (!state.tutorialDone) startTutorialFlow();
}
function openMainAndRunTutorial() {
  openMain();
  startTutorialFlow();
}

/* =========================
   Rank Up
   ========================= */
function doRankUp() {
  const nextRank = state.guildRank + 1;
  const cost = RANK.cost(nextRank);
  if (state.gold < cost) {
    pushLog(`Gold不足：昇格に ${cost.toLocaleString()}G 必要`);
    return;
  }

  const prev = {
    rank: state.guildRank,
    mult: RANK.goldMult(state.guildRank),
    hs: RANK.hireSlots(state.guildRank),
    ts: RANK.trainingSlots(state.guildRank),
    maxQL: RANK.maxQuestLevel(state.guildRank),
    invest: RANK.canInvest(state.guildRank),
  };

  state.gold -= cost;
  state.guildRank = nextRank;

  ensureQuestState();
  ensureTrainingState();

  const now = {
    rank: state.guildRank,
    mult: RANK.goldMult(state.guildRank),
    hs: RANK.hireSlots(state.guildRank),
    ts: RANK.trainingSlots(state.guildRank),
    maxQL: RANK.maxQuestLevel(state.guildRank),
    invest: RANK.canInvest(state.guildRank),
  };

  pushLog(`🎉 ギルドランク ${state.guildRank} に昇格！`);

  // ランクアップポップアップ（紙吹雪はCSS/DOM演出に任せる想定 → ここでは内容表示）
  openRankUpPopup(prev, now);

  // チュートリアル到達（Rank2）
  if (!state.tutorialDone && state.tutorialStage >= 3 && state.guildRank >= 2) {
    state.tutorialStage = 4;
    state.tutorialDone = true;
    pushLog("チュートリアル完了！");
  }

  renderAll();
  save();
}

function openRankUpPopup(prev, now) {
  const changes = [];
  if (now.mult !== prev.mult) changes.push(`Gold倍率：×${prev.mult.toFixed(1)} → ×${now.mult.toFixed(1)}`);
  if (now.hs !== prev.hs) changes.push(`🐾 雇用枠：${prev.hs} → ${now.hs}`);
  if (now.ts !== prev.ts) changes.push(`🏋 訓練枠：${prev.ts} → ${now.ts}`);
  if (now.maxQL !== prev.maxQL) changes.push(`📜 クエストLv：${prev.maxQL} → ${now.maxQL}`);
  if (!prev.invest && now.invest) changes.push(`📈 投資タブ解禁！`);

  const flavor = pickRankUpFlavor(now.rank);
  const rec = pickRankUpRecommend(prev, now);

  const html = `
    <div class="panelCard">
      <div style="font-size:18px;font-weight:900;">Guild Rank ${now.rank}！</div>
      <div class="dim" style="margin-top:6px;">${escapeHtml(flavor)}</div>
    </div>

    <div class="panelCard" style="margin-top:10px;">
      <div><b>今回の解放</b></div>
      <div class="dim" style="margin-top:6px;">
        ${changes.length ? changes.map(x => `・${escapeHtml(x)}`).join("<br>") : "（変化なし）"}
      </div>
    </div>

    <div class="modalFooter">
      <button class="ghost" id="ruClose">閉じる</button>
      <button class="primary" id="ruGo">${escapeHtml(rec.label)}</button>
    </div>
  `;
  openModal("ランクアップ！", html);
  document.getElementById("ruClose").addEventListener("click", closeModal);
  document.getElementById("ruGo").addEventListener("click", () => {
    closeModal();
    switchTab(rec.tab);
  });
}

function pickRankUpRecommend(prev, now) {
  if (now.invest && !prev.invest) return { tab: "invest", label: "投資へ" };
  if (now.hs > prev.hs) return { tab: "cats", label: "ネコへ" };
  if (now.ts > prev.ts) return { tab: "training", label: "訓練へ" };
  return { tab: "quest", label: "クエストへ" };
}
function pickRankUpFlavor(rank) {
  const low = [
    "街のねこ達の信頼が高まった！",
    "依頼主が増えてきたようだ…",
    "噂が広まり、評判が上がっている。",
    "新しい仕事の話が舞い込んできた。",
  ];
  const mid = [
    "遠方からの依頼が届き始めた。",
    "ギルドの名が少しずつ知られてきた。",
    "街の商会が注目している…",
  ];
  const high = [
    "名の知れたギルドとなった！",
    "街の経済にも影響を与えはじめている。",
    "次は…さらに大きな舞台だ。",
  ];
  const pool = rank >= 10 ? mid.concat(high) : low.concat(mid);
  return pool[Math.floor(Math.random() * pool.length)];
}

/* =========================
   Guild rename
   ========================= */
function openGuildRenameModal() {
  const html = `
    <div class="panelCard">
      <div class="dim">新しいギルド名</div>
      <input id="renameGuildInput"
        value="${escapeAttr(state.guildName || "")}"
        style="width:100%;padding:10px;border-radius:10px;border:1px solid #232a36;background:#10141b;color:#e9ecf1;margin-top:8px;" />
    </div>
    <div class="modalFooter">
      <button class="ghost" id="rgCancel">キャンセル</button>
      <button class="primary" id="rgOk">変更</button>
    </div>
  `;
  openModal("ギルド名変更", html);

  document.getElementById("rgCancel").addEventListener("click", closeModal);
  document.getElementById("rgOk").addEventListener("click", () => {
    const v = document.getElementById("renameGuildInput").value.trim();
    if (v) {
      state.guildName = v;
      pushLog(`ギルド名を「${v}」に変更`);
      renderAll();
      save();
    }
    closeModal();
  });
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
      <div class="dim" style="margin-bottom:8px;">難易度Lv</div>
      <div id="lvList" class="modalList"></div>
    </div>

    <div class="panelCard" style="margin-top:10px;">
      <div class="dim" style="margin-bottom:8px;">時間タイプ</div>
      <div id="timeList" class="modalList"></div>
    </div>

    <div class="panelCard" style="margin-top:10px;">
      <div class="dim">表示される成功率は概算です（総戦力＋属性ボーナス）。</div>
      <div class="dim" id="qPreview" style="margin-top:6px;">選択してください</div>
    </div>

    <div class="modalFooter">
      <button class="ghost" id="qCancel">戻る</button>
      <button class="primary" id="qStart" disabled>受注</button>
    </div>
  `;
  openModal("クエスト受注", html);

  const partyList = document.getElementById("partyList");
  const lvList = document.getElementById("lvList");
  const timeList = document.getElementById("timeList");
  const qPreview = document.getElementById("qPreview");
  const btnStart = document.getElementById("qStart");

  document.getElementById("qCancel").addEventListener("click", closeModal);

  // party pick
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

  // lv pick
  let pickLv = null;
  lvList.innerHTML = Array.from({ length: maxLv }, (_, i) => i + 1).map(lv => `
    <div class="modalItem" data-lv="${lv}">
      <b>Lv${lv}</b>
      <div class="dim">必要総戦力: ${QUEST.NEED_TOTAL[lv-1]}</div>
    </div>
  `).join("");
  lvList.addEventListener("click", (e) => {
    const item = e.target.closest(".modalItem");
    if (!item) return;
    lvList.querySelectorAll(".modalItem").forEach(x => x.style.outline = "");
    item.style.outline = "2px solid var(--blue)";
    pickLv = Number(item.dataset.lv);
    updatePreview();
  });

  // time pick
  let pickTime = null;
  timeList.innerHTML = QUEST.TIME_TYPES.map(t => `
    <div class="modalItem" data-time="${t.key}">
      <b>${t.key}（${t.label}）</b>
      <div class="dim">効率 ${Math.round(t.eff*100)}%</div>
    </div>
  `).join("");
  timeList.addEventListener("click", (e) => {
    const item = e.target.closest(".modalItem");
    if (!item) return;
    timeList.querySelectorAll(".modalItem").forEach(x => x.style.outline = "");
    item.style.outline = "2px solid var(--blue)";
    pickTime = item.dataset.time;
    updatePreview();
  });

  function updatePreview() {
    const partyIds = Array.from(selected);
    const ok = partyIds.length > 0 && pickLv && pickTime;
    btnStart.disabled = !ok;

    if (!ok) {
      qPreview.innerHTML = "選択してください";
      return;
    }

    const def = makeQuestDef(type, pickLv, pickTime);
    const calc = calcQuestChance(def, partyIds);
    qPreview.innerHTML = `
      時間: ${def.durationMin}分 / 基準Gold: ${def.baseGold.toLocaleString()}G<br>
      成功率(概算): <b>${calc.p}%</b>（属性ボーナス ${calc.attrBonus >= 0 ? "+" : ""}${calc.attrBonus}%）
    `;
  }

  btnStart.addEventListener("click", () => {
    closeModal();
    const partyIds = Array.from(selected);
    const def = makeQuestDef(type, pickLv, pickTime);
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
    main: type.main, // "STR"|"AGI"|"INT"
    level,
    timeType: timeKey,
    durationMin: dur,
    baseGold,
    target,
  };
}

function calcQuestChance(def, partyIds) {
  const party = partyIds.map(catById).filter(Boolean);

  const total = party.reduce((s,c)=> s + c.str + c.agi + c.int, 0);
  const mainSum = party.reduce((s,c)=> s + (def.main==="STR"?c.str:def.main==="AGI"?c.agi:c.int), 0);
  const ratio = total > 0 ? (mainSum / total) : 0;

  const need = def.target;
  const pBase = 60 + (total - need) * 1.0;

  const pAttrRaw = (ratio - 1/3) * 30;
  const attrBonus = clamp(-5, 10, Math.round(pAttrRaw));

  const p = clamp(40, 90, Math.round(pBase + attrBonus));
  return { p, attrBonus };
}

function startQuest(def, partyIds, slotIdx) {
  ensureQuestState();

  // busy check
  for (const id of partyIds) {
    if (isCatBusy(id)) {
      pushLog("パーティに待機中でないネコがいます");
      return;
    }
  }

  const calc = calcQuestChance(def, partyIds);
  const goldMult = RANK.goldMult(state.guildRank);

  const now = Date.now();
  const endAt = now + def.durationMin * 60 * 1000;

  state.questJobs[slotIdx] = {
    slotNo: slotIdx + 1,
    def,
    partyIds,
    pSuccess: calc.p,
    goldMult,
    startAt: now,
    endAt,
  };

  pushLog(`受注：${def.name} Lv${def.level}${def.timeType}（${def.durationMin}分 / 成功率 ${calc.p}%）`);
  renderAll();
  save();
}

function finishQuestsIfDone() {
  const now = Date.now();
  for (let i = 0; i < state.questJobs.length; i++) {
    const job = state.questJobs[i];
    if (!job) continue;
    if (job.endAt > now) continue;

    const isTut = !!job.tutorial;

    let result = "失敗";
    let gold = 0;
    let expEach = 0;

    if (isTut) {
      result = "成功";
      gold = job.def.baseGold;
      expEach = 20;
    } else {
      const roll = Math.random() * 100;
      if (roll <= job.pSuccess) {
        if (roll <= job.pSuccess * 0.2) result = "大成功";
        else result = "成功";
      } else {
        result = "失敗";
      }

      const effGold = Math.floor(job.def.baseGold * QUEST.resultMult(result) * job.goldMult);
      const effExp = Math.floor(job.def.durationMin * QUEST.expPerMin(result) * (job.def.timeType==="S"?1.0:job.def.timeType==="M"?0.96:0.92));
      gold = effGold;
      expEach = effExp;
    }

    ensurePending();
    state.pendingResults.push({
      type: "quest",
      finishedAt: now,
      questName: job.def.name,
      level: job.def.level,
      timeType: job.def.timeType,
      result,
      gold,
      expEach,
      partyIds: job.partyIds,
      tutorial: isTut,
    });

    pushLog(`クエスト完了：${job.def.name}${isTut ? "" : ` Lv${job.def.level}${job.def.timeType}`} → ${result}（受取待ち）`);
    state.questJobs[i] = null;

    if (!state.tutorialDone && state.tutorialStage === 2 && isTut) {
      // 次は受取→ランクアップへ誘導
      // stage=2のまま、受取時にstageを進める
    }
  }
}

/* =========================
   Training
   ========================= */
function unlockTrainingSlot(slotNo) {
  ensureTrainingState();
  const slot = state.trainingSlots[slotNo - 1];
  if (!slot || slot.unlocked) return;

  const { unlockCost, expMult } = getTrainingSlotMeta(slotNo);
  if (state.gold < unlockCost) {
    pushLog(`Gold不足：開放に ${unlockCost.toLocaleString()}G 必要`);
    return;
  }
  state.gold -= unlockCost;
  slot.unlocked = true;
  pushLog(`訓練枠${slotNo}を開放（EXP倍率 x${expMult.toFixed(1)}）`);
  renderAll();
  save();
}

function openTrainingStartModal(slotNo) {
  ensureTrainingState();

  const slot = state.trainingSlots[slotNo - 1];
  const job = state.trainingJobs[slotNo - 1];
  if (job) return;
  if (!slot?.unlocked) return;

  const idle = state.cats.filter(c => !isCatBusy(c.id));
  if (idle.length === 0) {
    pushLog("待機中のネコがいません");
    return;
  }

  const { expMult } = getTrainingSlotMeta(slotNo);

  const html = `
    <div class="panelCard">
      <div><b>訓練枠 ${slotNo}</b></div>
      <div class="dim">EXP: 1/分 × 倍率 x${expMult.toFixed(1)}（受取式 / 両立不可）</div>
    </div>

    <div class="panelCard" style="margin-top:10px;">
      <div class="dim" style="margin-bottom:8px;">ネコを選択</div>
      <div id="tCats" class="modalList"></div>
    </div>

    <div class="panelCard" style="margin-top:10px;">
      <div class="dim" style="margin-bottom:8px;">時間を選択</div>
      <div id="tDur" class="modalList"></div>
    </div>

    <div class="modalFooter">
      <button class="ghost" id="tCancel">戻る</button>
      <button class="primary" id="tStart" disabled>開始</button>
    </div>
  `;
  openModal("訓練開始", html);

  const tCats = document.getElementById("tCats");
  const tDur = document.getElementById("tDur");
  const btnStart = document.getElementById("tStart");
  document.getElementById("tCancel").addEventListener("click", closeModal);

  let pickCat = null;
  let pickMin = null;

  tCats.innerHTML = idle.map(c => `
    <div class="modalItem" data-cat="${c.id}">
      <b>${escapeHtml(c.name)}</b> Lv${c.level}
      <div class="dim">${escapeHtml(c.personality)} / STR ${c.str} AGI ${c.agi} INT ${c.int}</div>
    </div>
  `).join("");

  tDur.innerHTML = TRAINING.DURATIONS_MIN.map(min => {
    const useCost = calcTrainingUseCost(slotNo, min);
    const expGain = Math.floor(min * TRAINING.BASE_EXP_PER_MIN * expMult);
    return `
      <div class="modalItem" data-min="${min}">
        <b>${min}分</b>
        <div class="dim">使用料: ${useCost.toLocaleString()}G / EXP: ${expGain}</div>
      </div>
    `;
  }).join("");

  const updateBtn = () => { btnStart.disabled = !(pickCat && pickMin); };

  tCats.addEventListener("click", (e) => {
    const item = e.target.closest(".modalItem");
    if (!item) return;
    tCats.querySelectorAll(".modalItem").forEach(x => x.style.outline = "");
    item.style.outline = "2px solid var(--blue)";
    pickCat = item.dataset.cat;
    updateBtn();
  });

  tDur.addEventListener("click", (e) => {
    const item = e.target.closest(".modalItem");
    if (!item) return;
    tDur.querySelectorAll(".modalItem").forEach(x => x.style.outline = "");
    item.style.outline = "2px solid var(--blue)";
    pickMin = Number(item.dataset.min);
    updateBtn();
  });

  btnStart.addEventListener("click", () => {
    closeModal();
    startTraining(slotNo, pickCat, pickMin);
  });
}

function startTraining(slotNo, catId, durationMin) {
  ensureTrainingState();

  if (state.trainingJobs[slotNo - 1]) {
    pushLog("訓練枠が使用中です");
    return;
  }
  if (isCatBusy(catId)) {
    pushLog("そのネコは待機中ではありません");
    return;
  }

  const slot = state.trainingSlots[slotNo - 1];
  if (!slot?.unlocked) {
    pushLog("この訓練枠は未開放です");
    return;
  }

  const useCost = calcTrainingUseCost(slotNo, durationMin);
  if (state.gold < useCost) {
    pushLog(`Gold不足：訓練に ${useCost.toLocaleString()}G 必要`);
    return;
  }
  state.gold -= useCost;

  const { expMult } = getTrainingSlotMeta(slotNo);
  const expGain = Math.floor(durationMin * TRAINING.BASE_EXP_PER_MIN * expMult);

  const now = Date.now();
  const endAt = now + durationMin * 60 * 1000;

  state.trainingJobs[slotNo - 1] = {
    slotNo,
    catId,
    durationMin,
    useCost,
    expGain,
    startAt: now,
    endAt,
  };

  pushLog(`訓練開始：枠${slotNo} / ${durationMin}分 / 使用料 ${useCost.toLocaleString()}G / EXP ${expGain}`);
  renderAll();
  save();
}

function finishTrainingIfDone() {
  ensureTrainingState();
  const now = Date.now();

  for (let i = 0; i < state.trainingJobs.length; i++) {
    const job = state.trainingJobs[i];
    if (!job) continue;
    if (job.endAt > now) continue;

    ensurePending();
    state.pendingResults.push({
      type: "training",
      finishedAt: now,
      slotNo: job.slotNo,
      catId: job.catId,
      durationMin: job.durationMin,
      useCost: job.useCost,
      exp: job.expGain,
    });

    pushLog(`訓練完了：枠${job.slotNo} / EXP ${job.expGain}（受取待ち）`);
    state.trainingJobs[i] = null;
  }
}

/* =========================
   Hiring (Scout)
   ========================= */
function generateCandidates(isTutorial = false) {
  const personalities = ["あまえんぼ","ツンデレ","クール","やんちゃ"];
  const names = ["ミケ","タマ","モモ","コテツ","マロン","ユズ","コハク","ルナ","ソラ","ハル"];

  const list = [];
  for (let i = 0; i < 3; i++) {
    const p = personalities[Math.floor(Math.random() * personalities.length)];
    const nm = names[Math.floor(Math.random() * names.length)] + (Math.random()<0.35 ? String(Math.floor(Math.random()*9)+1) : "");
    list.push(makeCat(p, nm));
  }

  // チュートリアル候補はなるべく性格バラける（軽い配慮）
  if (isTutorial) {
    // 重複が多い場合、1回だけ作り直し
    const set = new Set(list.map(x => x.personality));
    if (set.size <= 1) return generateCandidates(false);
  }

  return list;
}

function scoutPayAndOpen() {
  ensureHire();
  const cost = HIRING.refreshCost(state.guildRank);
  if (state.gold < cost) {
    pushLog(`Gold不足：スカウトに ${cost.toLocaleString()}G 必要`);
    return;
  }
  state.gold -= cost;
  state.hire.candidates = generateCandidates(false);
  state.hire.lastRefreshAt = Date.now();
  pushLog(`スカウト実行（${cost.toLocaleString()}G）`);
  openScoutModal(true);
  renderAll();
  save();
}

function openScoutModal(fromPaidScout) {
  ensureHire();
  const hs = RANK.hireSlots(state.guildRank);
  const hireCost = HIRING.hireCost(state.guildRank);
  const scoutCost = HIRING.refreshCost(state.guildRank);

  const canHireMore = state.cats.length < hs;
  const list = state.hire.candidates || [];

  const html = `
    <div class="panelCard">
      <div><b>スカウト候補</b></div>
      <div class="dim">雇用枠 ${state.cats.length}/${hs} / 雇用費 ${hireCost.toLocaleString()}G</div>
      <div class="dim">再スカウト: ${scoutCost.toLocaleString()}G</div>
      ${fromPaidScout ? `<div class="dim" style="margin-top:6px;">候補を確認して雇用できます</div>` : ""}
    </div>

    <div class="panelCard" style="margin-top:10px;">
      <div class="row">
        <div class="dim">候補リスト</div>
        <button class="ghost smallBtn" id="btnRescout">再スカウト</button>
      </div>
      <div class="modalList" style="margin-top:10px;">
        ${
          list.length === 0
            ? `<div class="dim">候補がありません。スカウトしてください</div>`
            : list.map(c => {
                const weapon = getWeaponImageByPersonality(c.personality);
                return `
                  <div class="modalItem" style="display:flex; gap:10px; align-items:center;">
                    <div style="width:56px;height:56px;position:relative;flex:0 0 56px;">
                      <img src="img/cat.png" class="catSprite colorized"
                        style="--hue:${c.hue}deg; width:56px; height:56px;" />
                      ${weapon ? `<img src="${weapon}" style="position:absolute;right:-4px;bottom:4px;width:22px;image-rendering:pixelated;">` : ""}
                    </div>
                    <div style="flex:1;min-width:0;">
                      <div><b>${escapeHtml(c.name)}</b> <span class="dim">Lv${c.level}</span></div>
                      <div class="dim">${escapeHtml(c.personality)} / STR ${c.str} AGI ${c.agi} INT ${c.int}</div>
                    </div>
                    <button class="primary smallBtn" data-hire="${c.id}" ${canHireMore ? "" : "disabled"}
                      style="${canHireMore ? "" : "opacity:.6;"}">雇用</button>
                  </div>
                `;
              }).join("")
        }
      </div>
    </div>

    <div class="modalFooter">
      <button class="ghost" id="scoutClose">閉じる</button>
      <button class="primary" id="scoutGoCats">ネコへ戻る</button>
    </div>
  `;
  openModal("スカウト", html);

  document.getElementById("btnRescout").addEventListener("click", () => {
    closeModal();
    scoutPayAndOpen();
  });

  document.querySelectorAll("[data-hire]").forEach(btn => {
    btn.addEventListener("click", () => {
      hireCat(btn.dataset.hire);
      closeModal();
      openScoutModal(false);
      renderAll();
    });
  });

  document.getElementById("scoutClose").addEventListener("click", closeModal);
  document.getElementById("scoutGoCats").addEventListener("click", () => {
    closeModal();
    switchTab("cats");
  });
}

function hireCat(catId) {
  ensureHire();
  const slots = RANK.hireSlots(state.guildRank);
  if (state.cats.length >= slots) {
    pushLog("雇用枠が満杯です");
    return;
  }

  const idx = state.hire.candidates.findIndex(c => c.id === catId);
  if (idx < 0) return;

  const cost = HIRING.hireCost(state.guildRank);
  if (state.gold < cost) {
    pushLog(`Gold不足：雇用に ${cost.toLocaleString()}G 必要`);
    return;
  }
  state.gold -= cost;

  const hired = state.hire.candidates.splice(idx, 1)[0];
  state.cats.push(hired);
  pushLog(`${hired.name} を雇用！（${cost.toLocaleString()}G）`);
  renderAll();
  save();
}

/* =========================
   Cat rename / Fire
   ========================= */
function openRenameCatModal(catId) {
  const c = catById(catId);
  if (!c) return;

  const html = `
    <div class="panelCard">
      <div class="dim">新しい名前を入力</div>
      <input id="nameInput" value="${escapeAttr(c.name)}"
        style="width:100%;padding:10px;border-radius:10px;border:1px solid #232a36;background:#10141b;color:#e9ecf1;margin-top:8px;" />
    </div>
    <div class="modalFooter">
      <button class="ghost" id="nCancel">キャンセル</button>
      <button class="primary" id="nOk">変更</button>
    </div>
  `;
  openModal("名前変更", html);

  document.getElementById("nCancel").addEventListener("click", closeModal);
  document.getElementById("nOk").addEventListener("click", () => {
    const v = document.getElementById("nameInput").value.trim();
    if (v) {
      c.name = v;
      pushLog(`名前変更：${v}`);
      renderAll();
      save();
    }
    closeModal();
  });
}

function openFireCatModal(catId) {
  const c = catById(catId);
  if (!c) return;
  if (!RANK.canFire(state.guildRank)) return;

  const busy = isCatBusy(catId);
  if (busy) {
    pushLog("そのネコは待機中ではありません");
    return;
  }

  const refund = c.level * 500;

  const html = `
    <div class="panelCard">
      <div><b>本当に解雇しますか？</b></div>
      <div class="dim" style="margin-top:6px;">
        ${escapeHtml(c.name)}（Lv${c.level} / ${escapeHtml(c.personality)}）
      </div>
      <div class="dim" style="margin-top:6px;">
        街へ戻ります。<br>
        解雇報酬：<b>${refund.toLocaleString()}G</b>
      </div>
    </div>
    <div class="modalFooter">
      <button class="ghost" id="fCancel">キャンセル</button>
      <button class="primary" id="fOk" style="background:#c94b4b;">解雇する</button>
    </div>
  `;
  openModal("解雇確認", html);

  document.getElementById("fCancel").addEventListener("click", closeModal);
  document.getElementById("fOk").addEventListener("click", () => {
    closeModal();
    state.gold += refund;
    state.cats = state.cats.filter(x => x.id !== catId);
    pushLog(`${c.name} は街へ戻った。+${refund.toLocaleString()}G`);
    renderAll();
    save();
  });
}

/* =========================
   Pending / Collect
   ========================= */
function collectAll() {
  ensurePending();
  const list = state.pendingResults;
  if (list.length === 0) return;

  for (const r of list) {
    if (r.type === "quest") {
      state.gold += r.gold;
      for (const id of r.partyIds) {
        const c = catById(id);
        if (c) addExp(c, r.expEach);
      }
      pushLog(`受取：${r.questName}${r.tutorial ? "" : ` Lv${r.level}${r.timeType}`} ${r.result} / +${r.gold.toLocaleString()}G / EXP+${r.expEach}×${r.partyIds.length}`);
      if (!state.tutorialDone && state.tutorialStage === 2 && r.tutorial) {
        state.tutorialStage = 3; // 受取済み → ランクアップ誘導
      }
    }
    if (r.type === "training") {
      const c = catById(r.catId);
      if (c) addExp(c, r.exp);
      pushLog(`受取：訓練 枠${r.slotNo} / EXP+${r.exp}`);
    }
    if (r.type === "dividend") {
      state.gold += r.gold;
      pushLog(`配当受取：+${r.gold.toLocaleString()}G（${escapeHtml(r.summary)}）`);
    }
  }

  state.pendingResults = [];
  renderAll();
  save();

  // チュート誘導：受取後にランクアップ促し
  maybeShowTutorialRankUpPrompt();
}

function maybeShowTutorialRankUpPrompt() {
  if (state.tutorialDone) return;
  if (state.tutorialStage !== 3) return;
  if (state.guildRank !== 1) return;

  const next = 2;
  const cost = RANK.cost(next);

  const html = `
    <div class="panelCard">
      <div><b>次はランクアップしてみよう</b></div>
      <div class="dim" style="margin-top:6px;">
        ランクアップすると枠が増えます。<br>
        今なら Rank1 → 2 に昇格できます。
      </div>
    </div>
    <div class="panelCard" style="margin-top:10px;">
      <div class="dim">必要Gold：<b>${cost.toLocaleString()}G</b></div>
      <div class="dim">ヘッダーの「昇格」ボタンを押してみてね。</div>
    </div>
    <div class="modalFooter">
      <button class="primary" id="trOk">OK</button>
    </div>
  `;
  openModal("チュートリアル", html);
  document.getElementById("trOk").addEventListener("click", closeModal);
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
  const r = (Math.random() * 2 - 1) * s.var; // -var..+var
  const rate = s.base * (1 + r); // 乗算で「損なし」
  return clamp(0, 1, rate);
}

function maybeGenerateDividendsOnLogin() {
  if (!RANK.canInvest(state.guildRank)) return;

  const today = dateKey(new Date());
  const last = state.invest.lastDividendDay;

  // 初回は今日にセット（「0:00締め」のため、初回ログインで過去は出ない）
  if (!last) {
    state.invest.lastDividendDay = today;
    save();
    return;
  }

  const diff = daysBetween(last, today);
  if (diff <= 0) return;

  // 複数日ぶんまとめて（上限14日など付けても良いが一旦無制限）
  let totalGold = 0;
  const breakdown = [];

  // 1日ずつ計算して加算
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
  // 合計が大きい商会を主役に
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

  // 率の最大/最小を見る
  const best = breakdown.reduce((p,c)=> (c.rate > p.rate ? c : p), breakdown[0]);
  const worst = breakdown.reduce((p,c)=> (c.rate < p.rate ? c : p), breakdown[0]);

  const bestShop = INVEST.shops[best.key];
  const worstShop = INVEST.shops[worst.key];

  const up = (best.rate / bestShop.base) - 1;
  const down = 1 - (worst.rate / worstShop.base);

  // 上振れ強い
  if (up >= 0.30 && best.key === "magic") return "🔮 新魔法の特許が成立！研究成果が爆発！";
  if (up >= 0.15 && best.key === "trade") return "🚢 交易路が大当たり！商人たちが賑わっている。";
  if (up >= 0.08 && best.key === "arms") return "🗡 武具の需要が堅調だ。戦の気配か？";
  if (up >= 0.03 && best.key === "insure") return "🛡 堅実な運営が実を結んでいる。";

  // 下振れ強い
  if (down >= 0.30 && worst.key === "magic") return "🔮 実験は難航しているようだ…";
  if (down >= 0.15 && worst.key === "trade") return "🚢 風向きが悪い日もある。";
  if (down >= 0.08 && worst.key === "arms") return "🗡 鍛冶場は静かだが、安定している。";
  if (down >= 0.03 && worst.key === "insure") return "🛡 今日も静かな黒字だ。";

  return "街の経済は穏やかに動いている。";
}

function openDividendPopup(totalGold, breakdown) {
  // 商会ごとの合算
  const sumByKey = {};
  const rateByKey = {};
  for (const b of breakdown) {
    sumByKey[b.key] = (sumByKey[b.key] || 0) + b.gold;
    rateByKey[b.key] = b.rate; // 最後の率でもOK（詳細こだわるなら平均）
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
    // 受取待ちバーが見えるようにトップへ
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

  renderGuildTitle();
  renderHeaderBadges();
  renderRankUp();
  renderPending();
  renderTabs();
  renderLogs();

  // 投資タブの表示制御
  const investUnlocked = RANK.canInvest(state.guildRank);
  el.tabInvestBtn?.classList.toggle("hidden", !investUnlocked);
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
            <div class="dim">属性：${t.main} / 難易度と時間を選んで受注</div>
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

    return `
      <div class="panelCard catCard">
        <div class="catSpriteWrap">
          <img src="img/cat.png" class="catSprite colorized" style="--hue:${c.hue}deg;" />
          ${
            training
              ? `<img src="img/jim1.png" class="catDumbbell" data-jim="${c.id}" />`
              : weaponImg ? `<img src="${weaponImg}" class="catWeapon" />` : ""
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
          <div class="mono">STR ${c.str} / AGI ${c.agi} / INT ${c.int}</div>

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

  // iOS横ズレ保険
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
