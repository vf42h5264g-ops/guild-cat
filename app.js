// Cozy Cat Guild - Phase1 MVP (Quest + Training + Hiring + Tutorial + RankUp + Save + Logs)
// --------------------------------------------------------------------------------------

const LS_SAVE = "ccg_save_v1";
const LEVEL_CAP = 20;

// --- Tips ---
const DAILY_TIPS_JA = [
  "「やる気はあるにゃ。」",
  "「今日は探索日和だね。」",
  "「訓練…するの？」",
  "「依頼、まだ残ってるよ。」",
  "「焦らなくていいにゃ。」",
  "「コツコツが一番だよ。」",
  "「失敗しても、次がある。」",
  "「ゆっくりいこう。」",
  "「訓練の時間にゃ。」",
  "「ギルドはあなたのペースで。」",
];

// --- Helpers ---
const nowMs = () => Date.now();
const pad2 = (n) => String(n).padStart(2, "0");
function fmtTime(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(ss)}` : `${m}:${pad2(ss)}`;
}
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; } // inclusive
function choice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function uid(prefix) { return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`; }

// --- Personality growth (fixed) ---
const PERSONALITY = [
  { key: "amaenbo", label: "あまえんぼ", icon: "🌿", tag: "バランス", growth: { str: 2, agi: 2, int: 2 } },
  { key: "tsundere", label: "ツンデレ", icon: "🗡", tag: "STR寄り", growth: { str: 3, agi: 1, int: 1 } },
  { key: "yanchya", label: "やんちゃ", icon: "⚡", tag: "AGI寄り", growth: { str: 1, agi: 3, int: 1 } },
  { key: "cool",    label: "クール",   icon: "🧠", tag: "INT寄り", growth: { str: 1, agi: 1, int: 3 } },
];
function personalityByKey(key) {
  return PERSONALITY.find(p => p.key === key) ?? PERSONALITY[0];
}

// --- Names (pool) ---
const NAME_POOL = ["ミケ","シロ","クロ","タマ","コテツ","ハナ","レオ","モモ","ルナ","ソラ","マル","ユキ","サクラ","ナナ","ココ","リン","ムギ","フク","キナコ","アズキ"];
function makeUniqueName(existingNames) {
  let base = choice(NAME_POOL);
  if (!existingNames.has(base)) return base;
  let i = 2;
  while (existingNames.has(`${base}${i}`)) i++;
  return `${base}${i}`;
}

// --- Economy formulas ---
function rankCost(nextRank) {
  // 5,000 × (nextRank - 1)^3
  const x = (nextRank - 1);
  return 5000 * x * x * x;
}
function goldMultiplier(rank) {
  // +10% / rank (rank1=1.0) capped at 2.0
  return Math.min(1 + 0.1 * (rank - 1), 2.0);
}
function hireSlots(rank) { return 3 + Math.floor(rank / 2); }
function trainingSlotsTheo(rank) { return 1 + Math.floor((rank - 1) / 2); }
function dispatchSlots(rank) { return 1 + Math.floor((rank - 1) / 10); } // Rank10刻み
function trainingUnlockCost(slotNumber) {
  // 40,000 × (slotNumber - 1)^2
  const x = (slotNumber - 1);
  return 40000 * x * x;
}

// --- Hiring costs ---
function hireCost(rank) { return 5000 * rank; } // 2回目以降
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
}
function refreshCost(rank, refreshCountToday) {
  const base = 2000 * rank;
  return Math.floor(base * Math.pow(1.5, refreshCountToday));
}
function resetHiringDaily(save) {
  save.hiring = save.hiring ?? {};
  const t = todayKey();
  if (save.hiring.refreshDate !== t) {
    save.hiring.refreshDate = t;
    save.hiring.refreshCountToday = 0;
  }
}

// --- Leveling ---
function needExp(lv) { return 50 * lv * lv; }

function processLevelUps(cat) {
  let leveled = 0;
  const p = personalityByKey(cat.personality);
  while (cat.level < LEVEL_CAP) {
    const need = needExp(cat.level);
    if (cat.exp < need) break;
    cat.exp -= need;
    cat.level += 1;
    leveled += 1;
    cat.stats.str += p.growth.str;
    cat.stats.agi += p.growth.agi;
    cat.stats.int += p.growth.int;
  }
  return leveled;
}

// --- Quest definitions ---
const QUEST_BASE = { 10: 1200, 30: 4000, 60: 9000 };
const DIFF = {
  E: { penalty: 0,  mult: 1.0, unlockRank: 1 },
  D: { penalty: 10, mult: 1.2, unlockRank: 2 },
  C: { penalty: 20, mult: 1.4, unlockRank: 3 },
  B: { penalty: 30, mult: 1.6, unlockRank: 5 },
  A: { penalty: 40, mult: 1.8, unlockRank: 7 },
};
const STAT_TYPE = {
  str: { label: "戦闘", icon: "🗡" },
  agi: { label: "探索", icon: "⚡" },
  int: { label: "調査", icon: "🧠" },
};

function unlockedDifficulties(rank) {
  return Object.entries(DIFF).filter(([, v]) => rank >= v.unlockRank).map(([k]) => k);
}
function genQuest(statType, rank) {
  const durationMin = choice([10, 30, 60]);
  const difficulty = choice(unlockedDifficulties(rank));
  return { id: uid("q"), statType, durationMin, difficulty, baseGold: QUEST_BASE[durationMin] };
}
function calcQuestOutcome(save, quest, cats) {
  const sumStat = cats.reduce((acc, c) => acc + c.stats[quest.statType], 0);
  const diff = DIFF[quest.difficulty];

  const baseRate = Math.min(50 + sumStat * 0.25, 90);
  const finalRate = Math.max(baseRate - diff.penalty, 20);

  const roll = Math.random() * 100;
  const success = roll < finalRate;

  const successBonus = Math.min(1 + sumStat * 0.005, 1.5);
  const gMult = goldMultiplier(save.guild.rank);
  const gross = quest.baseGold * gMult * diff.mult * successBonus;
  const gold = Math.floor(success ? gross : gross * 0.5);

  return { success, finalRate, sumStat, gold };
}

// --- Save schema ---
function makeNewSave() {
  const createdAt = nowMs();
  const s = {
    schemaVersion: 1,
    createdAt,
    updatedAt: createdAt,
    guild: {
      name: "ネコギルド",
      rank: 1,
      gold: 0,
      dispatchSlots: 1,
      hireSlots: 3,
      trainingSlots: 1,
      goldMultiplier: 1.0,
      goldMultiplierCap: 2.0,
      trainingSlotUnlocked: [true], // slot1 free
    },
    cats: [],
    jobs: { active: [], pendingResults: [] },
    questBoard: { slots: { str: null, agi: null, int: null } },
    logs: { items: [], collapsed: true, unreadCount: 0 },
    hiring: { candidates: [], tutorialFreeHireUsed: false, refreshCountToday: 0, refreshDate: "" },
    tutorial: { completed: false },
  };

  // initial cats: pick 2 distinct personalities (B方針)
  const persKeys = PERSONALITY.map(p => p.key).sort(() => Math.random() - 0.5);
  const selected = persKeys.slice(0, 2);

  const nameSet = new Set();
  s.cats = selected.map((pk) => {
    const name = makeUniqueName(nameSet); nameSet.add(name);
    return {
      id: uid("cat"),
      name,
      personality: pk,
      level: 1,
      exp: 0,
      baseStats: { str: randInt(5,10), agi: randInt(5,10), int: randInt(5,10) },
      stats: null,
      state: { mode: "idle", jobId: null, endsAt: null },
    };
  });
  s.cats.forEach(c => { c.stats = { ...c.baseStats }; });

  // init quest board
  s.questBoard.slots.str = genQuest("str", s.guild.rank);
  s.questBoard.slots.agi = genQuest("agi", s.guild.rank);
  s.questBoard.slots.int = genQuest("int", s.guild.rank);

  addLog(s, "system", "【開始】ギルド運営を開始しました（最初は2匹です）");
  recalcDerived(s);
  ensureHireCandidates(s);
  saveToStorage(s);
  return s;
}

function recalcDerived(save) {
  const r = save.guild.rank;
  save.guild.dispatchSlots = dispatchSlots(r);
  save.guild.hireSlots = hireSlots(r);
  save.guild.trainingSlots = trainingSlotsTheo(r);
  save.guild.goldMultiplier = Math.min(1 + 0.1 * (r - 1), save.guild.goldMultiplierCap);

  // ensure unlock array length >= theoretical slots
  const theo = save.guild.trainingSlots;
  while (save.guild.trainingSlotUnlocked.length < theo) save.guild.trainingSlotUnlocked.push(false);

  save.updatedAt = nowMs();
}

function saveToStorage(save) {
  save.updatedAt = nowMs();
  localStorage.setItem(LS_SAVE, JSON.stringify(save));
}
function loadFromStorage() {
  const raw = localStorage.getItem(LS_SAVE);
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    if (!obj || obj.schemaVersion !== 1) return null;
    return obj;
  } catch { return null; }
}

// --- Logs + notifications ---
function addLog(save, kind, text) {
  const item = { id: uid("log"), at: nowMs(), kind, text };
  save.logs.items.unshift(item);
  if (save.logs.items.length > 100) save.logs.items.pop();
  save.logs.unreadCount = (save.logs.unreadCount ?? 0) + 1;
}
function markLogsRead(save) { save.logs.unreadCount = 0; }

// --- Hiring (candidates + reroll + hire) ---
function genHireCandidate(existingNamesSet) {
  const pk = choice(PERSONALITY).key;
  const name = makeUniqueName(existingNamesSet);
  return { id: uid("cand"), name, personality: pk, baseStats: { str: randInt(5,10), agi: randInt(5,10), int: randInt(5,10) } };
}

function ensureHireCandidates(save) {
  save.hiring = save.hiring ?? { candidates: [], tutorialFreeHireUsed: false, refreshCountToday: 0, refreshDate: "" };
  resetHiringDaily(save);

  const existing = new Set(save.cats.map(c => c.name));
  for (const cand of save.hiring.candidates) existing.add(cand.name);

  while (save.hiring.candidates.length < 3) {
    const cand = genHireCandidate(existing);
    existing.add(cand.name);
    save.hiring.candidates.push(cand);
  }
}

function rerollHireCandidates(save) {
  ensureHireCandidates(save);

  const cost = refreshCost(save.guild.rank, save.hiring.refreshCountToday);
  if (save.guild.gold < cost) return { ok:false, reason:"gold" };

  save.guild.gold -= cost;
  save.hiring.refreshCountToday += 1;

  save.hiring.candidates = [];
  ensureHireCandidates(save);

  addLog(save, "hire_refresh", `【更新】雇用候補を更新（-${cost.toLocaleString()}G）`);
  return { ok:true, cost };
}

function hireCandidate(save, candId) {
  ensureHireCandidates(save);

  const idx = save.hiring.candidates.findIndex(c => c.id === candId);
  if (idx < 0) return { ok:false, reason:"not_found" };

  if (save.cats.length >= save.guild.hireSlots) return { ok:false, reason:"cap" };

  const isFree = !save.hiring.tutorialFreeHireUsed;
  const cost = isFree ? 0 : hireCost(save.guild.rank);
  if (save.guild.gold < cost) return { ok:false, reason:"gold", cost };

  if (!isFree) save.guild.gold -= cost;

  const cand = save.hiring.candidates[idx];
  const cat = {
    id: uid("cat"),
    name: cand.name,
    personality: cand.personality,
    level: 1,
    exp: 0,
    baseStats: { ...cand.baseStats },
    stats: { ...cand.baseStats },
    state: { mode: "idle", jobId: null, endsAt: null },
  };

  save.cats.push(cat);
  save.hiring.candidates.splice(idx, 1);
  ensureHireCandidates(save);

  if (isFree) save.hiring.tutorialFreeHireUsed = true;

  addLog(save, "hire", isFree
    ? `【雇用】初回無料で「${cat.name}」が仲間になりました`
    : `【雇用】「${cat.name}」が仲間になりました（-${cost.toLocaleString()}G）`
  );

  return { ok:true, isFree, cost, catId: cat.id };
}

// --- Time progression (active -> pending) ---
function tickJobsToPending(save) {
  const n = nowMs();
  const stillActive = [];
  for (const job of save.jobs.active) {
    if (job.endsAt > n) {
      stillActive.push(job);
      continue;
    }

    save.jobs.pendingResults.push({
      id: uid("pending"),
      jobId: job.id,
      type: job.type,
      endedAt: job.endsAt,
      catIds: job.catIds,
      payload: job.payload,
      result: job.result ?? null,
    });

    for (const cid of job.catIds) {
      const c = save.cats.find(x => x.id === cid);
      if (!c) continue;
      c.state = { mode: "idle", jobId: null, endsAt: null };
    }

    if (job.type === "quest") {
      addLog(save, "quest_complete",
        `【完了】${STAT_TYPE[job.payload.statType].label} ${job.payload.difficulty} / ${job.payload.durationMin}分　${job.payload.catNames.join("・")}`
      );
      save.uiFlags = save.uiFlags ?? {};
      save.uiFlags.hasTabNotification = save.uiFlags.hasTabNotification ?? { quest:false, cats:false, training:false };
      save.uiFlags.hasTabNotification.quest = true;
    } else if (job.type === "training") {
      addLog(save, "training_complete",
        `【完了】訓練 ${job.payload.durationMin}分　${job.payload.catNames.join("・")}`
      );
      save.uiFlags = save.uiFlags ?? {};
      save.uiFlags.hasTabNotification = save.uiFlags.hasTabNotification ?? { quest:false, cats:false, training:false };
      save.uiFlags.hasTabNotification.training = true;
    }
  }
  save.jobs.active = stillActive;
}

// --- UI elements ---
const el = {
  startScreen: document.getElementById("startScreen"),
  mainScreen: document.getElementById("mainScreen"),
  btnStart: document.getElementById("btnStart"),
  dailyTip: document.getElementById("dailyTip"),

  hud: document.getElementById("hud"),
  btnSave: document.getElementById("btnSave"),

  rankRow: document.getElementById("rankRow"),
  rankInfo: document.getElementById("rankInfo"),
  rankCostText: document.getElementById("rankCostText"),
  btnRankUp: document.getElementById("btnRankUp"),

  tabButtons: [...document.querySelectorAll(".tab")],
  panels: {
    quest: document.getElementById("tab-quest"),
    cats: document.getElementById("tab-cats"),
    training: document.getElementById("tab-training"),
  },

  logHeader: document.getElementById("logHeader"),
  logPanel: document.getElementById("logPanel"),
  logChevron: document.getElementById("logChevron"),
  logUnreadPill: document.getElementById("logUnreadPill"),

  pendingBar: document.getElementById("pendingBar"),
  pendingText: document.getElementById("pendingText"),
  btnCollectAll: document.getElementById("btnCollectAll"),

  dotQuest: document.getElementById("dotQuest"),
  dotCats: document.getElementById("dotCats"),
  dotTraining: document.getElementById("dotTraining"),

  modalBackdrop: document.getElementById("modalBackdrop"),
  modal: document.getElementById("modal"),
  modalTitle: document.getElementById("modalTitle"),
  modalBody: document.getElementById("modalBody"),
  modalClose: document.getElementById("modalClose"),
};

// --- Modal helpers ---
function openModal(title, innerHtml) {
  el.modalTitle.textContent = title;
  el.modalBody.innerHTML = innerHtml;
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

// --- App state ---
let SAVE = null;
let activeTab = "quest";

// --- Rendering ---
function renderAll() {
  if (!SAVE) return;

  tickJobsToPending(SAVE);
  recalcDerived(SAVE);
  ensureHireCandidates(SAVE);

  renderHud();
  renderRankRow();
  renderPendingBar();
  renderLog();
  renderDots();

  renderQuestTab();
  renderCatsTab();
  renderTrainingTab();

  saveToStorage(SAVE);
}

function totalPower() {
  return SAVE.cats.reduce((acc, c) => acc + c.stats.str + c.stats.agi + c.stats.int, 0);
}

function renderHud() {
  const g = SAVE.guild;
  const items = [
    { k: "Rank", v: String(g.rank) },
    { k: "Gold", v: g.gold.toLocaleString() },
    { k: "倍率", v: `×${g.goldMultiplier.toFixed(1)}` },
    { k: "総戦力", v: String(totalPower()) },
    { k: "派遣枠", v: `${activeQuestCount()}/${g.dispatchSlots}` },
    { k: "訓練枠", v: `${activeTrainingCount()}/${usableTrainingSlots()}` },
    { k: "雇用枠", v: `${SAVE.cats.length}/${g.hireSlots}` },
  ];
  el.hud.innerHTML = items.map(o =>
    `<div class="badge"><span class="k">${o.k}</span><span class="v">${o.v}</span></div>`
  ).join("");
}

function renderRankRow() {
  const g = SAVE.guild;
  const nextRank = g.rank + 1;
  const cost = rankCost(nextRank);
  el.rankInfo.textContent = `Rank ${g.rank} → ${nextRank}`;
  el.rankCostText.textContent = `必要: ${cost.toLocaleString()}G`;
  el.btnRankUp.disabled = g.gold < cost;
  el.rankRow.classList.remove("hidden");
}

function renderLog() {
  el.logUnreadPill.textContent = String(SAVE.logs.unreadCount ?? 0);
  el.logUnreadPill.style.display = (SAVE.logs.unreadCount ?? 0) > 0 ? "inline-block" : "none";

  const collapsed = SAVE.logs.collapsed ?? true;
  el.logChevron.textContent = collapsed ? "▶" : "▼";
  el.logPanel.classList.toggle("hidden", collapsed);

  if (!collapsed) {
    const items = SAVE.logs.items ?? [];
    el.logPanel.innerHTML = items.length
      ? items.map(it => {
          const d = new Date(it.at);
          const t = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
          return `<div class="logItem"><span class="logTime">${t}</span>${escapeHtml(it.text)}</div>`;
        }).join("")
      : `<div class="logItem dim">ログはまだありません</div>`;
  }
}

function renderDots() {
  const pending = (SAVE.jobs.pendingResults?.length ?? 0) > 0;
  const unread = (SAVE.logs.unreadCount ?? 0) > 0;
  const tabNoti = SAVE.uiFlags?.hasTabNotification ?? { quest:false, cats:false, training:false };

  el.dotQuest.classList.toggle("hidden", !(pending || tabNoti.quest));
  el.dotTraining.classList.toggle("hidden", !(pending || tabNoti.training));
  el.dotCats.classList.toggle("hidden", !(unread || tabNoti.cats));
}

function renderPendingBar() {
  const n = SAVE.jobs.pendingResults?.length ?? 0;
  el.pendingText.textContent = `受取待ち: ${n}`;
  el.pendingBar.classList.toggle("hidden", n === 0);
}

function usableTrainingSlots() {
  const theo = SAVE.guild.trainingSlots;
  const unlocked = SAVE.guild.trainingSlotUnlocked.slice(0, theo).filter(Boolean).length;
  return unlocked;
}
function activeQuestCount() { return SAVE.jobs.active.filter(j => j.type === "quest").length; }
function activeTrainingCount() { return SAVE.jobs.active.filter(j => j.type === "training").length; }

// --- Tabs ---
function setTab(tab) {
  activeTab = tab;
  for (const b of el.tabButtons) b.classList.toggle("active", b.dataset.tab === tab);
  Object.entries(el.panels).forEach(([k, node]) => node.classList.toggle("hidden", k !== tab));
}
el.tabButtons.forEach(btn => btn.addEventListener("click", () => setTab(btn.dataset.tab)));

// --- Log collapse ---
el.logHeader.addEventListener("click", () => {
  SAVE.logs.collapsed = !(SAVE.logs.collapsed ?? true);
  if (!SAVE.logs.collapsed) markLogsRead(SAVE);
  renderAll();
});

// --- Collect all ---
el.btnCollectAll.addEventListener("click", () => {
  collectAll();
  renderAll();
});

// --- Save button (manual) ---
el.btnSave.addEventListener("click", () => {
  saveToStorage(SAVE);
  addLog(SAVE, "system", "【保存】セーブしました");
  renderAll();
});

// --- Rank Up ---
el.btnRankUp.addEventListener("click", () => {
  const g = SAVE.guild;
  const nextRank = g.rank + 1;
  const cost = rankCost(nextRank);
  if (g.gold < cost) return;

  g.gold -= cost;
  g.rank = nextRank;

  recalcDerived(SAVE);
  addLog(SAVE, "rank_up", `【昇格】ギルドランク ${nextRank}（-${cost.toLocaleString()}G）`);

  // ランク到達の体感：ボード再抽選
  SAVE.questBoard.slots.str = genQuest("str", g.rank);
  SAVE.questBoard.slots.agi = genQuest("agi", g.rank);
  SAVE.questBoard.slots.int = genQuest("int", g.rank);

  renderAll();
});

// --- Start ---
el.dailyTip.textContent = choice(DAILY_TIPS_JA);
el.btnStart.addEventListener("click", () => {
  el.startScreen.classList.add("hidden");
  el.mainScreen.classList.remove("hidden");
  renderAll();

  if (!SAVE.tutorial?.completed) runTutorial();
});

// --- Quest Tab ---
function findQuestById(qid) {
  const s = SAVE.questBoard.slots;
  return [s.str, s.agi, s.int].find(q => q.id === qid) ?? null;
}
function replaceQuestSlot(statType) {
  SAVE.questBoard.slots[statType] = genQuest(statType, SAVE.guild.rank);
}

function renderQuestTab() {
  const panel = el.panels.quest;

  const slots = SAVE.questBoard.slots;
  const used = activeQuestCount();
  const cap = SAVE.guild.dispatchSlots;
  const free = Math.max(0, cap - used);

  const top = `
    <div class="panelCard">
      <div class="row">
        <div>
          <div><b>現在の依頼</b> <span class="dim">(STR/AGI/INT 各1)</span></div>
          <div class="dim" style="margin-top:6px;">受注で即補充 / キャンセル不可 / 訓練と両立不可</div>
        </div>
        <div class="mono dim">派遣枠 ${used}/${cap}</div>
      </div>
    </div>
  `;

  const cards = ["str","agi","int"].map((k) => {
    const q = slots[k];
    const st = STAT_TYPE[q.statType];
    return `
      <div class="panelCard">
        <div class="row">
          <div>
            <div><b>${st.icon} ${st.label}</b> <span class="mono dim">${q.difficulty}</span></div>
            <div class="dim">${q.durationMin}分 / 基準${q.baseGold.toLocaleString()}G</div>
          </div>
          <button class="primary smallBtn" data-act="openQuest" data-qid="${q.id}" ${free<=0 ? "disabled":""}>受注</button>
        </div>
      </div>
    `;
  }).join("");

  const activeList = SAVE.jobs.active
    .filter(j => j.type === "quest")
    .map(j => `
      <div class="panelCard">
        <div class="row">
          <div><b>🔵 クエスト中</b><div class="dim">${escapeHtml(j.payload.title)}</div></div>
          <div class="mono">${fmtTime(j.endsAt - nowMs())}</div>
        </div>
      </div>
    `).join("");

  panel.innerHTML = top + cards + activeList;

  panel.querySelectorAll('button[data-act="openQuest"]').forEach(btn => {
    btn.addEventListener("click", () => {
      if (free <= 0) return;
      const qid = btn.getAttribute("data-qid");
      const q = findQuestById(qid);
      openQuestModal(q);
    });
  });
}

function openQuestModal(quest) {
  const st = STAT_TYPE[quest.statType];
  const diff = DIFF[quest.difficulty];

  const idleCats = SAVE.cats.filter(c => c.state.mode === "idle");

  const html = `
    <div class="panelCard">
      <div><b>${st.icon} ${st.label}</b> <span class="mono dim">${quest.difficulty}</span></div>
      <div class="dim">${quest.durationMin}分 / 基準${quest.baseGold.toLocaleString()}G</div>
      <div class="dim">成功率補正 -${diff.penalty}% / 報酬×${diff.mult}</div>
    </div>

    <div style="margin-top:10px"><b>編成（最大3匹）</b> <span class="dim">※待機中のみ</span></div>
    <div class="modalList" id="partyList" style="margin-top:8px">
      ${idleCats.length ? idleCats.map(c => {
        const p = personalityByKey(c.personality);
        return `
          <div class="modalItem" data-act="toggleCat" data-cid="${c.id}">
            <div class="row">
              <div>
                <div><b>${escapeHtml(c.name)}</b> <span class="dim">Lv${c.level}</span></div>
                <div class="dim">${p.label} ${p.icon}（${p.tag}）</div>
                <div class="mono dim">STR ${c.stats.str} / AGI ${c.stats.agi} / INT ${c.stats.int}</div>
              </div>
              <div class="mono dim">選択</div>
            </div>
          </div>
        `;
      }).join("") : `<div class="panelCard dim">待機中のネコがいません</div>`}
    </div>

    <div class="panelCard" style="margin-top:10px">
      <div class="row">
        <div>
          <div><b>予測</b></div>
          <div class="dim" id="predText">ネコを選ぶと表示されます</div>
        </div>
        <button class="primary smallBtn" id="btnConfirmQuest" disabled>派遣</button>
      </div>
    </div>
  `;

  openModal("クエスト詳細", html);

  const selected = new Set();
  const partyList = document.getElementById("partyList");
  const predText = document.getElementById("predText");
  const btnConfirm = document.getElementById("btnConfirmQuest");

  function updatePred() {
    const cats = [...selected].map(id => SAVE.cats.find(c => c.id === id)).filter(Boolean);
    if (cats.length === 0) {
      predText.textContent = "ネコを選ぶと表示されます";
      btnConfirm.disabled = true;
      return;
    }
    const { finalRate, gold } = calcQuestOutcome(SAVE, quest, cats);
    predText.textContent = `成功率 ${finalRate.toFixed(1)}% / 受取 ${gold.toLocaleString()}G（成功/失敗込み）`;
    btnConfirm.disabled = false;
  }

  partyList?.querySelectorAll('[data-act="toggleCat"]').forEach(item => {
    item.addEventListener("click", () => {
      const cid = item.getAttribute("data-cid");
      if (!cid) return;
      if (selected.has(cid)) {
        selected.delete(cid);
        item.style.outline = "";
      } else {
        if (selected.size >= 3) return;
        selected.add(cid);
        item.style.outline = "2px solid #2b6cff";
      }
      updatePred();
    });
  });

  btnConfirm.addEventListener("click", () => {
    const catIds = [...selected];
    if (catIds.length === 0) return;
    startQuest(quest, catIds);
    closeModal();
    renderAll();
  });
}

function startQuest(quest, catIds) {
  if (activeQuestCount() >= SAVE.guild.dispatchSlots) return;

  const cats = catIds.map(id => SAVE.cats.find(c => c.id === id)).filter(Boolean);
  if (cats.some(c => c.state.mode !== "idle")) return;

  const st = STAT_TYPE[quest.statType];
  const title = `${st.label} ${quest.difficulty} / ${quest.durationMin}分`;
  const endsAt = nowMs() + quest.durationMin * 60 * 1000;

  const outcome = calcQuestOutcome(SAVE, quest, cats);

  const job = {
    id: uid("job"),
    type: "quest",
    createdAt: nowMs(),
    endsAt,
    catIds,
    payload: { title, ...quest, catNames: cats.map(c => c.name) },
    result: { success: outcome.success, goldGained: outcome.gold },
  };

  SAVE.jobs.active.push(job);
  for (const c of cats) c.state = { mode: "quest", jobId: job.id, endsAt };

  replaceQuestSlot(quest.statType);
}

// --- Cats Tab (list + rename + hiring) ---
function stateOrder(cat) {
  if (cat.state.mode === "idle") return 0;
  if (cat.state.mode === "quest") return 1;
  return 2;
}
function catStatusBadge(cat) {
  const remain = cat.state.endsAt ? fmtTime(cat.state.endsAt - nowMs()) : "";
  if (cat.state.mode === "idle") return `🟢 <span class="dim">待機</span>`;
  if (cat.state.mode === "quest") return `🔵 <span class="dim">クエスト</span> <span class="mono">${remain}</span>`;
  return `🟣 <span class="dim">訓練</span> <span class="mono">${remain}</span>`;
}
function catCardHtml(cat) {
  const p = personalityByKey(cat.personality);
  const st = cat.stats;
  return `
    <div class="panelCard">
      <div class="row">
        <div>
          <div><b>${escapeHtml(cat.name)}</b> <span class="dim">Lv${cat.level}</span></div>
          <div class="dim">${p.label} ${p.icon}（${p.tag}）</div>
          <div class="mono dim">STR ${st.str} / AGI ${st.agi} / INT ${st.int}</div>
        </div>
        <div style="text-align:right">
          <div>${catStatusBadge(cat)}</div>
          <button class="ghost smallBtn" data-act="rename" data-cid="${cat.id}" style="margin-top:8px;">名前変更</button>
        </div>
      </div>
    </div>
  `;
}

// ★ 追加：候補に「性格説明（得意ステ）」を一行表示
function candidateFlavorLine(personalityKey) {
  const p = personalityByKey(personalityKey);
  if (p.key === "tsundere") return "得意：戦闘（STR）";
  if (p.key === "yanchya") return "得意：探索（AGI）";
  if (p.key === "cool")    return "得意：調査（INT）";
  return "得意：バランス";
}

function renderHiringPanel() {
  ensureHireCandidates(SAVE);

  const canHire = SAVE.cats.length < SAVE.guild.hireSlots;
  const capText = `雇用枠 ${SAVE.cats.length}/${SAVE.guild.hireSlots}`;

  const isFree = !SAVE.hiring.tutorialFreeHireUsed;
  const costHire = isFree ? 0 : hireCost(SAVE.guild.rank);

  resetHiringDaily(SAVE);
  const costRefresh = refreshCost(SAVE.guild.rank, SAVE.hiring.refreshCountToday);
  const canRefresh = SAVE.guild.gold >= costRefresh;

  const costText = isFree
    ? `<div class="dim" style="margin-top:6px;">🎁 初回の雇用は無料（3匹目を雇ってみよう）</div>`
    : `<div class="dim" style="margin-top:6px;">雇用費：${costHire.toLocaleString()}G（Rank×5,000）</div>`;

  return `
    <div class="panelCard">
      <div class="row">
        <div><b>雇用</b> <span class="dim">${capText}</span></div>
        <button class="ghost smallBtn" data-act="reroll" ${canRefresh ? "" : "disabled"}>
          候補更新 ${costRefresh.toLocaleString()}G
        </button>
      </div>

      <div class="dim" style="margin-top:6px;">候補から1匹を雇用できます</div>
      ${costText}

      <div class="modalList" style="margin-top:10px">
        ${SAVE.hiring.candidates.map(c => {
          const p = personalityByKey(c.personality);
          const disabled = (!canHire) || (!isFree && SAVE.guild.gold < costHire);
          return `
            <div class="modalItem">
              <div class="row">
                <div>
                  <div><b>${escapeHtml(c.name)}</b> <span class="dim">Lv1</span></div>
                  <div class="dim">${p.label} ${p.icon}（${p.tag}）</div>
                  <div class="dim">${candidateFlavorLine(c.personality)}</div>
                  <div class="mono dim">STR ${c.baseStats.str} / AGI ${c.baseStats.agi} / INT ${c.baseStats.int}</div>
                </div>
                <button class="primary smallBtn" data-act="hire" data-cid="${c.id}" ${disabled ? "disabled" : ""}>
                  雇用
                </button>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

function renderCatsTab() {
  const panel = el.panels.cats;
  const sorted = [...SAVE.cats].sort((a,b) => stateOrder(a) - stateOrder(b));

  panel.innerHTML = `
    <div class="panelCard">
      <div class="row">
        <div><b>ギルド戦力</b></div>
        <div class="mono">${totalPower()}</div>
      </div>
      <div class="dim" style="margin-top:6px;">待機→クエスト→訓練 の順に表示</div>
    </div>

    ${sorted.map(c => catCardHtml(c)).join("")}

    ${renderHiringPanel()}
  `;

  panel.querySelectorAll('[data-act="rename"]').forEach(btn => {
    btn.addEventListener("click", () => openRenameModal(btn.getAttribute("data-cid")));
  });

  panel.querySelectorAll('button[data-act="hire"]').forEach(btn => {
    btn.addEventListener("click", () => {
      const cid = btn.getAttribute("data-cid");
      if (!cid) return;
      const res = hireCandidate(SAVE, cid);
      if (!res.ok) return;
      renderAll();
    });
  });

  panel.querySelectorAll('button[data-act="reroll"]').forEach(btn => {
    btn.addEventListener("click", () => {
      const res = rerollHireCandidates(SAVE);
      if (!res.ok) return;
      renderAll();
    });
  });
}

// --- Rename ---
function openRenameModal(catId) {
  const c = SAVE.cats.find(x => x.id === catId);
  if (!c) return;

  const html = `
    <div class="panelCard">
      <div class="dim">最大8文字 / 空欄不可 / 同名OK</div>
    </div>
    <div class="panelCard" style="margin-top:10px">
      <div><b>現在：</b>${escapeHtml(c.name)}</div>
      <div style="margin-top:8px">
        <input id="renameInput" value="${escapeAttr(c.name)}" maxlength="8"
               style="width:100%;padding:10px;border-radius:10px;border:1px solid #232a36;background:#10141b;color:#e9ecf1;" />
      </div>
      <div class="row" style="margin-top:10px">
        <button class="ghost smallBtn" id="btnRenameCancel">キャンセル</button>
        <button class="primary smallBtn" id="btnRenameOk">決定</button>
      </div>
    </div>
  `;
  openModal("名前変更", html);

  document.getElementById("btnRenameCancel").addEventListener("click", closeModal);
  document.getElementById("btnRenameOk").addEventListener("click", () => {
    const input = document.getElementById("renameInput");
    const v = (input.value ?? "").trim();
    if (!v) return;
    c.name = v;
    closeModal();
    renderAll();
  });
}

// --- Training Tab ---
function renderTrainingTab() {
  const panel = el.panels.training;

  const theo = SAVE.guild.trainingSlots;
  const unlocked = SAVE.guild.trainingSlotUnlocked.slice(0, theo);
  const activeTraining = activeTrainingCount();
  const trainCap = usableTrainingSlots();
  const free = Math.max(0, trainCap - activeTraining);

  const intro = `
    <div class="panelCard">
      <div><b>訓練</b> <span class="dim">1EXP/分 / 両立不可 / 受取式</span></div>
      <div class="dim" style="margin-top:6px;">開放費: 40,000×(枠番号-1)^2 / 空き: ${activeTraining}/${trainCap}</div>
    </div>
  `;

  const slots = Array.from({ length: theo }, (_, i) => {
    const slotNo = i + 1;
    const isUnlocked = unlocked[i] === true;

    if (!isUnlocked) {
      const cost = trainingUnlockCost(slotNo);
      const canPay = SAVE.guild.gold >= cost;
      return `
        <div class="panelCard">
          <div class="row">
            <div><b>訓練枠 ${slotNo}</b> <span class="dim">(未開放)</span></div>
            <button class="primary smallBtn" data-act="unlockTrain" data-slot="${slotNo}" ${canPay ? "" : "disabled"}>
              開放 ${cost.toLocaleString()}G
            </button>
          </div>
          <div class="dim" style="margin-top:6px;">永久開放 / キャンセル不可</div>
        </div>
      `;
    }

    return `
      <div class="panelCard">
        <div class="row">
          <div><b>訓練枠 ${slotNo}</b> <span class="dim">(使用可)</span></div>
          <button class="primary smallBtn" data-act="startTrain" ${free<=0 ? "disabled":""}>訓練する</button>
        </div>
      </div>
    `;
  }).join("");

  const activeList = SAVE.jobs.active
    .filter(j => j.type === "training")
    .map(j => `
      <div class="panelCard">
        <div class="row">
          <div><b>🟣 訓練中</b><div class="dim">${escapeHtml(j.payload.title)}</div></div>
          <div class="mono">${fmtTime(j.endsAt - nowMs())}</div>
        </div>
      </div>
    `).join("");

  panel.innerHTML = intro + slots + activeList;

  panel.querySelectorAll('[data-act="unlockTrain"]').forEach(btn => {
    btn.addEventListener("click", () => {
      const slotNo = Number(btn.getAttribute("data-slot"));
      unlockTrainingSlot(slotNo);
      renderAll();
    });
  });

  panel.querySelectorAll('[data-act="startTrain"]').forEach(btn => {
    btn.addEventListener("click", () => openTrainingModal());
  });
}

function unlockTrainingSlot(slotNo) {
  if (slotNo <= 1) return;
  const theo = SAVE.guild.trainingSlots;
  if (slotNo > theo) return;

  const idx = slotNo - 1;
  if (SAVE.guild.trainingSlotUnlocked[idx] === true) return;

  const cost = trainingUnlockCost(slotNo);
  if (SAVE.guild.gold < cost) return;

  SAVE.guild.gold -= cost;
  SAVE.guild.trainingSlotUnlocked[idx] = true;
  addLog(SAVE, "system", `【開放】訓練枠 ${slotNo}（-${cost.toLocaleString()}G）`);
  SAVE.uiFlags = SAVE.uiFlags ?? {};
  SAVE.uiFlags.hasTabNotification = SAVE.uiFlags.hasTabNotification ?? { quest:false, cats:false, training:false };
  SAVE.uiFlags.hasTabNotification.training = true;
}

function openTrainingModal() {
  const trainCap = usableTrainingSlots();
  const used = activeTrainingCount();
  if (used >= trainCap) return;

  const idleCats = SAVE.cats.filter(c => c.state.mode === "idle");
  const html = `
    <div><b>訓練するネコを選択</b> <span class="dim">（待機中のみ）</span></div>
    <div class="modalList" style="margin-top:8px">
      ${idleCats.length ? idleCats.map(c => {
        const p = personalityByKey(c.personality);
        return `
          <div class="modalItem" data-act="pickTrainCat" data-cid="${c.id}">
            <div class="row">
              <div>
                <div><b>${escapeHtml(c.name)}</b> <span class="dim">Lv${c.level}</span></div>
                <div class="dim">${p.label} ${p.icon}（${p.tag}）</div>
                <div class="mono dim">STR ${c.stats.str} / AGI ${c.stats.agi} / INT ${c.stats.int}</div>
              </div>
              <div class="mono dim">選択</div>
            </div>
          </div>
        `;
      }).join("") : `<div class="panelCard dim">待機中のネコがいません</div>`}
    </div>
  `;
  openModal("訓練", html);

  document.querySelectorAll('[data-act="pickTrainCat"]').forEach(item => {
    item.addEventListener("click", () => {
      const cid = item.getAttribute("data-cid");
      if (!cid) return;
      openTrainingDurationModal(cid);
    });
  });
}

function openTrainingDurationModal(catId) {
  const c = SAVE.cats.find(x => x.id === catId);
  if (!c || c.state.mode !== "idle") return;

  const options = [
    { h: 1, min: 60 },
    { h: 2, min: 120 },
    { h: 4, min: 240 },
    { h: 8, min: 480 },
  ];

  const html = `
    <div class="panelCard">
      <div><b>${escapeHtml(c.name)}</b> <span class="dim">Lv${c.level}</span></div>
      <div class="dim">訓練はキャンセル不可 / クエストと両立不可</div>
    </div>
    <div style="margin-top:10px"><b>時間を選択</b></div>
    <div class="modalList" style="margin-top:8px">
      ${options.map(o => `
        <div class="modalItem" data-act="pickTrainDur" data-min="${o.min}">
          <div class="row"><div><b>${o.h}時間</b></div><div class="dim mono">+${o.min} EXP</div></div>
        </div>
      `).join("")}
    </div>
  `;

  el.modalTitle.textContent = "訓練時間";
  el.modalBody.innerHTML = html;

  document.querySelectorAll('[data-act="pickTrainDur"]').forEach(item => {
    item.addEventListener("click", () => {
      const min = Number(item.getAttribute("data-min"));
      startTraining(catId, min);
      closeModal();
      renderAll();
    });
  });
}

function startTraining(catId, durationMin) {
  const c = SAVE.cats.find(x => x.id === catId);
  if (!c || c.state.mode !== "idle") return;

  const trainCap = usableTrainingSlots();
  const used = activeTrainingCount();
  if (used >= trainCap) return;

  const endsAt = nowMs() + durationMin * 60 * 1000;

  const job = {
    id: uid("job"),
    type: "training",
    createdAt: nowMs(),
    endsAt,
    catIds: [catId],
    payload: { title: `訓練 ${durationMin}分`, durationMin, catNames: [c.name] },
  };

  SAVE.jobs.active.push(job);
  c.state = { mode: "training", jobId: job.id, endsAt };
}

// --- Collect (pending) ---
function collectPending(p) {
  if (p.type === "quest") {
    const gold = p.result?.goldGained ?? 0;
    SAVE.guild.gold += gold;
    addLog(SAVE, "quest_reward", `【受取】+${gold.toLocaleString()}G`);
  } else if (p.type === "training") {
    const catId = p.catIds[0];
    const c = SAVE.cats.find(x => x.id === catId);
    if (!c) return;

    const exp = p.payload?.durationMin ?? 0; // 1exp/min
    c.exp += exp;

    addLog(SAVE, "training_reward", `【受取】+${exp}EXP（${escapeLogName(c.name)}）`);

    const beforeLv = c.level;
    const leveled = processLevelUps(c);
    if (leveled > 0) {
      const afterLv = c.level;
      addLog(SAVE, "level_up", `【成長】${escapeLogName(c.name)} Lv${beforeLv} → Lv${afterLv} (+${leveled})`);
      SAVE.uiFlags = SAVE.uiFlags ?? {};
      SAVE.uiFlags.hasTabNotification = SAVE.uiFlags.hasTabNotification ?? { quest:false, cats:false, training:false };
      SAVE.uiFlags.hasTabNotification.cats = true;
    }
  }
}

function collectAll() {
  const pending = SAVE.jobs.pendingResults ?? [];
  if (!pending.length) return;

  pending.sort((a,b) => (a.endedAt ?? 0) - (b.endedAt ?? 0));
  for (const p of pending) collectPending(p);

  SAVE.jobs.pendingResults = [];
  if (SAVE.uiFlags?.hasTabNotification) {
    SAVE.uiFlags.hasTabNotification.quest = false;
    SAVE.uiFlags.hasTabNotification.training = false;
  }
}

// --- Tutorial (simple modal chain) ---
function runTutorial() {
  const steps = [
    {
      title: "ようこそ",
      body: `
        <div class="panelCard">
          <div><b>Cozy Cat Guild</b></div>
          <div class="dim" style="margin-top:6px;">
            依頼をこなし、訓練で育てて、ギルドを大きくしよう。
          </div>
        </div>
        <div class="row" style="margin-top:10px">
          <button class="ghost smallBtn" id="tSkip">スキップ</button>
          <button class="primary smallBtn" id="tNext">次へ</button>
        </div>
      `,
    },
    {
      title: "まずは雇用",
      body: `
        <div class="panelCard">
          <div><b>最初は2匹</b>。もう1匹雇って3匹にしよう。</div>
          <div class="dim" style="margin-top:6px;">
            ネコタブの「雇用」から、初回無料で仲間にできます。
          </div>
        </div>
        <div class="row" style="margin-top:10px">
          <button class="ghost smallBtn" id="tSkip">スキップ</button>
          <button class="primary smallBtn" id="tGoCats">ネコへ</button>
        </div>
      `,
    },
    {
      title: "依頼を受けよう",
      body: `
        <div class="panelCard">
          <div><b>クエスト</b>を受注してみよう。</div>
          <div class="dim" style="margin-top:6px;">
            クエストは受注で即補充。キャンセルはできないよ。
          </div>
        </div>
        <div class="row" style="margin-top:10px">
          <button class="ghost smallBtn" id="tSkip">スキップ</button>
          <button class="primary smallBtn" id="tGoQuest">クエストへ</button>
        </div>
      `,
    },
    {
      title: "訓練で育てよう",
      body: `
        <div class="panelCard">
          <div><b>訓練</b>でEXPが増えるよ。</div>
          <div class="dim" style="margin-top:6px;">
            クエストと訓練は同時にできない。うまく使い分けよう。
          </div>
        </div>
        <div class="row" style="margin-top:10px">
          <button class="ghost smallBtn" id="tSkip">スキップ</button>
          <button class="primary smallBtn" id="tGoTraining">訓練へ</button>
        </div>
      `,
    },
    {
      title: "完了！",
      body: `
        <div class="panelCard">
          <div><b>準備完了</b></div>
          <div class="dim" style="margin-top:6px;">
            ●が付いたら受取やログを確認してみよう。
          </div>
        </div>
        <div class="row" style="margin-top:10px">
          <button class="primary smallBtn" id="tDone">はじめる</button>
        </div>
      `,
    }
  ];

  let i = 0;
  showStep();

  function finishTutorial() {
    SAVE.tutorial = SAVE.tutorial ?? {};
    SAVE.tutorial.completed = true;
    addLog(SAVE, "system", "【案内】チュートリアルを完了しました");
    closeModal();
    renderAll();
  }

  function showStep() {
    const s = steps[i];
    openModal(s.title, s.body);

    const skip = document.getElementById("tSkip");
    if (skip) skip.addEventListener("click", finishTutorial);

    const next = document.getElementById("tNext");
    if (next) next.addEventListener("click", () => { i++; showStep(); });

    const goCats = document.getElementById("tGoCats");
    if (goCats) goCats.addEventListener("click", () => { setTab("cats"); i++; showStep(); });

    const goQuest = document.getElementById("tGoQuest");
    if (goQuest) goQuest.addEventListener("click", () => { setTab("quest"); i++; showStep(); });

    const goTraining = document.getElementById("tGoTraining");
    if (goTraining) goTraining.addEventListener("click", () => { setTab("training"); i++; showStep(); });

    const done = document.getElementById("tDone");
    if (done) done.addEventListener("click", finishTutorial);
  }
}

// --- Boot ---
function boot() {
  const loaded = loadFromStorage();
  SAVE = loaded ?? makeNewSave();

  recalcDerived(SAVE);
  tickJobsToPending(SAVE);
  ensureHireCandidates(SAVE);

  el.startScreen.classList.remove("hidden");
  el.mainScreen.classList.add("hidden");
  setTab("quest");

  renderAll();

  setInterval(() => {
    if (!SAVE) return;
    if (!el.mainScreen.classList.contains("hidden")) renderAll();
  }, 1000);
}
boot();

// --- Utilities (safe) ---
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}
function escapeAttr(s) { return escapeHtml(s).replace(/"/g, "&quot;"); }
function escapeLogName(s) { return String(s).replace(/\n/g, " "); }
