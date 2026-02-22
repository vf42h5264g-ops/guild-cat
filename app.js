// Cozy Cat Guild - MVP (Quest + Training + Save + Logs)
// ----------------------------------------------------

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
function randInt(min, max) { // inclusive
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function choice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function uid(prefix) {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

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
  // pick a name not used, else add suffix
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
  // 1 + 0.1*(rank-1) capped at 2.0
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
const QUEST_BASE = {
  10: 1200,
  30: 4000,
  60: 9000,
};
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

// Quest generation: always 3 slots (str/agi/int), each is random duration + random difficulty (unlocked)
function unlockedDifficulties(rank) {
  return Object.entries(DIFF)
    .filter(([, v]) => rank >= v.unlockRank)
    .map(([k]) => k);
}
function genQuest(statType, rank) {
  const durationMin = choice([10, 30, 60]);
  const diffList = unlockedDifficulties(rank);
  const difficulty = choice(diffList);
  return {
    id: uid("q"),
    statType,
    durationMin,
    difficulty,
    baseGold: QUEST_BASE[durationMin],
  };
}

// --- Success + reward (FLOOR) ---
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
      // caches (recalc on boot)
      dispatchSlots: 1,
      hireSlots: 3,
      trainingSlots: 1,
      goldMultiplier: 1.0,
      goldMultiplierCap: 2.0,
      // training unlocks (slot 1 is free)
      trainingSlotUnlocked: [true], // index 0 => slot1
    },
    cats: [],
    jobs: {
      active: [],
      pendingResults: [],
    },
    questBoard: {
      slots: { str: null, agi: null, int: null },
    },
    logs: {
      items: [],
      collapsed: true,
      unreadCount: 0,
    },
    tutorial: { completed: false },
  };

  // initial cats: pick 3 distinct personalities
  const persKeys = PERSONALITY.map(p => p.key);
  const shuffled = persKeys.sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, 3);

  const nameSet = new Set();
  s.cats = selected.map((pk) => {
    const p = personalityByKey(pk);
    const name = makeUniqueName(nameSet); nameSet.add(name);
    return {
      id: uid("cat"),
      name,
      personality: pk,
      level: 1,
      exp: 0,
      baseStats: { str: randInt(5,10), agi: randInt(5,10), int: randInt(5,10) },
      stats: null, // filled below
      state: { mode: "idle", jobId: null, endsAt: null },
    };
  });

  // set current stats = base stats at level 1
  s.cats.forEach(c => { c.stats = { ...c.baseStats }; });

  // init quest board
  s.questBoard.slots.str = genQuest("str", s.guild.rank);
  s.questBoard.slots.agi = genQuest("agi", s.guild.rank);
  s.questBoard.slots.int = genQuest("int", s.guild.rank);

  addLog(s, "system", "【開始】ギルド運営を開始しました");
  recalcDerived(s);
  saveToStorage(s);
  return s;
}

function recalcDerived(save) {
  const r = save.guild.rank;
  save.guild.dispatchSlots = dispatchSlots(r);
  save.guild.hireSlots = hireSlots(r);
  save.guild.trainingSlots = trainingSlotsTheo(r); // theoretical; usable depends on unlock array
  save.guild.goldMultiplier = Math.min(1 + 0.1 * (r - 1), save.guild.goldMultiplierCap);

  // ensure unlock array length >= theoretical slots (slot1 free only; others locked until paid)
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
    // very light validation
    if (!obj || obj.schemaVersion !== 1) return null;
    return obj;
  } catch {
    return null;
  }
}

// --- Logs + notifications ---
function addLog(save, kind, text) {
  const item = { id: uid("log"), at: nowMs(), kind, text };
  save.logs.items.unshift(item);
  if (save.logs.items.length > 100) save.logs.items.pop();
  save.logs.unreadCount = (save.logs.unreadCount ?? 0) + 1;
}

function markLogsRead(save) {
  save.logs.unreadCount = 0;
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
    // move to pending
    save.jobs.pendingResults.push({
      id: uid("pending"),
      jobId: job.id,
      type: job.type,
      endedAt: job.endsAt,
      catIds: job.catIds,
      payload: job.payload,
      result: job.result ?? null, // quest has result precomputed at start
    });

    // set cats idle
    for (const cid of job.catIds) {
      const c = save.cats.find(x => x.id === cid);
      if (!c) continue;
      c.state = { mode: "idle", jobId: null, endsAt: null };
    }

    // logs + tab dots
    if (job.type === "quest") {
      addLog(save, "quest_complete", `【完了】${STAT_TYPE[job.payload.statType].label} ${job.payload.difficulty} / ${job.payload.durationMin}分　${job.payload.catNames.join("・")}`);
      save.uiFlags = save.uiFlags ?? {};
      save.uiFlags.hasTabNotification = save.uiFlags.hasTabNotification ?? { quest:false, cats:false, training:false };
      save.uiFlags.hasTabNotification.quest = true;
    } else if (job.type === "training") {
      addLog(save, "training_complete", `【完了】訓練 ${job.payload.durationMin}分　${job.payload.catNames.join("・")}`);
      save.uiFlags = save.uiFlags ?? {};
      save.uiFlags.hasTabNotification = save.uiFlags.hasTabNotification ?? { quest:false, cats:false, training:false };
      save.uiFlags.hasTabNotification.training = true;
    }
  }
  save.jobs.active = stillActive;
}

// --- UI elements ---
const el = {
  rankBar: document.getElementById("rankBar"),
  rankInfo: document.getElementById("rankInfo"),
  rankCostText: document.getElementById("rankCostText"),
  btnRankUp: document.getElementById("btnRankUp"),
  startScreen: document.getElementById("startScreen"),
  mainScreen: document.getElementById("mainScreen"),
  btnStart: document.getElementById("btnStart"),
  dailyTip: document.getElementById("dailyTip"),
  hud: document.getElementById("hud"),
  btnSave: document.getElementById("btnSave"),
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
  // time progression
  tickJobsToPending(SAVE);
  recalcDerived(SAVE);

  renderHud();
  renderRankBar();
  renderPendingBar();
  renderLog();
  renderDots();

  renderQuestTab();
  renderCatsTab();
  renderTrainingTab();

  saveToStorage(SAVE);
}

function renderRankBar() {
  const g = SAVE.guild;
  const nextRank = g.rank + 1;
  const cost = rankCost(nextRank);

  el.rankInfo.textContent = `Rank ${g.rank} → ${nextRank}`;
  el.rankCostText.textContent = `必要: ${cost.toLocaleString()}G`;

  const canPay = g.gold >= cost;
  el.btnRankUp.disabled = !canPay;

  // ランクアップは常時表示でOK（ゆる運営）
  el.rankBar.classList.remove("hidden");
}

function renderHud() {
  const g = SAVE.guild;
  const totalPower = SAVE.cats.reduce((acc, c) => acc + c.stats.str + c.stats.agi + c.stats.int, 0);

  const badges = [
    `Rank ${g.rank}`,
    `Gold ${g.gold.toLocaleString()}`,
    `総戦力 ${totalPower}`,
    `派遣枠 ${g.dispatchSlots}`,
    `雇用枠 ${SAVE.cats.length}/${g.hireSlots}`,
    `訓練枠 ${usableTrainingSlots()}/${g.trainingSlots}`,
    `倍率 ×${g.goldMultiplier.toFixed(1)}`,
  ];
  el.hud.innerHTML = badges.map(t => `<div class="badge">${t}</div>`).join("");
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

  // header dot not shown directly; we show unread pill and pending bar
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
  // usable = unlocked slots count, but can't exceed theoretical slots
  const theo = SAVE.guild.trainingSlots;
  const unlocked = SAVE.guild.trainingSlotUnlocked.slice(0, theo).filter(Boolean).length;
  return unlocked;
}

function renderQuestTab() {
  const panel = el.panels.quest;

  const slots = SAVE.questBoard.slots;
  const dispatchUsed = SAVE.jobs.active.filter(j => j.type === "quest").length;
  const dispatchCap = SAVE.guild.dispatchSlots;
  const dispatchFree = Math.max(0, dispatchCap - dispatchUsed);

  const cards = ["str","agi","int"].map((k) => {
    const q = slots[k];
    const st = STAT_TYPE[q.statType];
    return `
      <div class="panelCard">
        <div class="row">
          <div>
            <div><b>${st.icon} ${st.label}</b> <span class="dim mono">${q.difficulty}</span></div>
            <div class="dim">${q.durationMin}分 / 基準${q.baseGold.toLocaleString()}G</div>
          </div>
          <button class="primary smallBtn" data-act="openQuest" data-qid="${q.id}" ${dispatchFree<=0 ? "disabled":""}>
            受注
          </button>
        </div>
        <div class="dim" style="margin-top:8px;">派遣枠 空き: ${dispatchFree}/${dispatchCap}</div>
      </div>
    `;
  }).join("");

  const activeList = SAVE.jobs.active
    .filter(j => j.type === "quest")
    .map(j => `<div class="panelCard"><div class="row"><div><b>🔵 クエスト中</b><div class="dim">${escapeHtml(j.payload.title)}</div></div><div class="mono">${fmtTime(j.endsAt - nowMs())}</div></div></div>`)
    .join("");

  panel.innerHTML = `
    <div class="panelCard">
      <div><b>現在の依頼</b> <span class="dim">(STR/AGI/INT 各1)</span></div>
      <div class="dim" style="margin-top:6px;">受注で即補充 / キャンセル不可 / 訓練と両立不可</div>
    </div>
    ${cards}
    ${activeList}
  `;

  panel.querySelectorAll('button[data-act="openQuest"]').forEach(btn => {
    btn.addEventListener("click", () => {
      if (dispatchFree <= 0) return;
      const qid = btn.getAttribute("data-qid");
      const q = findQuestById(qid);
      openQuestModal(q);
    });
  });
}

function renderCatsTab() {
  const panel = el.panels.cats;

  const totalPower = SAVE.cats.reduce((acc, c) => acc + c.stats.str + c.stats.agi + c.stats.int, 0);
  const sorted = [...SAVE.cats].sort((a,b) => stateOrder(a) - stateOrder(b));

  panel.innerHTML = `
    <div class="panelCard">
      <div class="row">
        <div><b>総戦力</b></div>
        <div class="mono">${totalPower}</div>
      </div>
      <div class="dim" style="margin-top:6px;">待機→クエスト→訓練 の順に表示</div>
    </div>
    ${sorted.map(c => catCardHtml(c)).join("")}
  `;

  panel.querySelectorAll('[data-act="rename"]').forEach(btn => {
    btn.addEventListener("click", () => {
      const cid = btn.getAttribute("data-cid");
      openRenameModal(cid);
    });
  });
}

function stateOrder(cat) {
  if (cat.state.mode === "idle") return 0;
  if (cat.state.mode === "quest") return 1;
  return 2; // training
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

function renderTrainingTab() {
  const panel = el.panels.training;

  const theo = SAVE.guild.trainingSlots;
  const unlocked = SAVE.guild.trainingSlotUnlocked.slice(0, theo);
  const activeTraining = SAVE.jobs.active.filter(j => j.type === "training").length;

  const cards = Array.from({ length: theo }, (_, i) => {
    const slotNo = i + 1;
    const isUnlocked = unlocked[i] === true;

    // show the active training job if any (simple: show list separately)
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

    // unlocked
    const trainCap = usableTrainingSlots();
    const trainUsed = activeTraining;
    const free = Math.max(0, trainCap - trainUsed);

    return `
      <div class="panelCard">
        <div class="row">
          <div><b>訓練枠 ${slotNo}</b> <span class="dim">(使用可)</span></div>
          <button class="primary smallBtn" data-act="startTrain" ${free<=0 ? "disabled":""}>訓練する</button>
        </div>
        <div class="dim" style="margin-top:6px;">空き: ${free}/${trainCap}（解放済み枠のみ）</div>
      </div>
    `;
  }).join("");

  const activeList = SAVE.jobs.active
    .filter(j => j.type === "training")
    .map(j => `<div class="panelCard"><div class="row"><div><b>🟣 訓練中</b><div class="dim">${escapeHtml(j.payload.title)}</div></div><div class="mono">${fmtTime(j.endsAt - nowMs())}</div></div></div>`)
    .join("");

  panel.innerHTML = `
    <div class="panelCard">
      <div><b>訓練</b> <span class="dim">1EXP/分 / 両立不可 / 受取式</span></div>
      <div class="dim" style="margin-top:6px;">開放費: 40,000×(枠番号-1)^2</div>
    </div>
    ${cards}
    ${activeList}
  `;

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

// --- Actions ---
function findQuestById(qid) {
  const s = SAVE.questBoard.slots;
  return [s.str, s.agi, s.int].find(q => q.id === qid) ?? null;
}
function replaceQuestSlot(statType) {
  SAVE.questBoard.slots[statType] = genQuest(statType, SAVE.guild.rank);
}

function openQuestModal(quest) {
  const st = STAT_TYPE[quest.statType];
  const diff = DIFF[quest.difficulty];

  // show eligible cats (idle only)
  const idleCats = SAVE.cats.filter(c => c.state.mode === "idle");

  const html = `
    <div class="panelCard">
      <div><b>${st.icon} ${st.label}</b> <span class="mono dim">${quest.difficulty}</span></div>
      <div class="dim">${quest.durationMin}分 / 基準${quest.baseGold.toLocaleString()}G</div>
      <div class="dim">成功率補正 -${diff.penalty}% / 報酬×${diff.mult}</div>
    </div>

    <div style="margin-top:10px"><b>編成（最大3匹）</b> <span class="dim">※待機中のみ</span></div>
    <div class="modalList" id="partyList">
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
  // capacity check
  const used = SAVE.jobs.active.filter(j => j.type === "quest").length;
  if (used >= SAVE.guild.dispatchSlots) return;

  // cats must be idle (and not in training/quest)
  const cats = catIds.map(id => SAVE.cats.find(c => c.id === id)).filter(Boolean);
  if (cats.some(c => c.state.mode !== "idle")) return;

  const st = STAT_TYPE[quest.statType];
  const title = `${st.label} ${quest.difficulty} / ${quest.durationMin}分`;
  const endsAt = nowMs() + quest.durationMin * 60 * 1000;

  // compute outcome at start (simple)
  const outcome = calcQuestOutcome(SAVE, quest, cats);

  const job = {
    id: uid("job"),
    type: "quest",
    createdAt: nowMs(),
    endsAt,
    catIds,
    payload: {
      title,
      ...quest,
      catNames: cats.map(c => c.name),
    },
    result: {
      success: outcome.success,
      goldGained: outcome.gold,
    },
  };

  SAVE.jobs.active.push(job);
  // lock cats
  for (const c of cats) {
    c.state = { mode: "quest", jobId: job.id, endsAt };
  }

  // replace quest slot immediately
  replaceQuestSlot(quest.statType);
}

function openTrainingModal() {
  const trainCap = usableTrainingSlots();
  const used = SAVE.jobs.active.filter(j => j.type === "training").length;
  if (used >= trainCap) return;

  const idleCats = SAVE.cats.filter(c => c.state.mode === "idle");
  const html = `
    <div><b>訓練するネコを選択</b> <span class="dim">（待機中のみ）</span></div>
    <div class="modalList" id="trainCatList" style="margin-top:8px">
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
          <div class="row">
            <div><b>${o.h}時間</b></div>
            <div class="dim mono">+${o.min} EXP</div>
          </div>
        </div>
      `).join("")}
    </div>
  `;

  // replace modal content in-place
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
  const used = SAVE.jobs.active.filter(j => j.type === "training").length;
  if (used >= trainCap) return;

  const endsAt = nowMs() + durationMin * 60 * 1000;

  const job = {
    id: uid("job"),
    type: "training",
    createdAt: nowMs(),
    endsAt,
    catIds: [catId],
    payload: {
      title: `訓練 ${durationMin}分`,
      durationMin,
      catNames: [c.name],
    },
  };

  SAVE.jobs.active.push(job);
  c.state = { mode: "training", jobId: job.id, endsAt };
}

function unlockTrainingSlot(slotNo) {
  // slotNo is 1-based
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

// --- Collect (pending) ---
function collectPending(p) {
  if (p.type === "quest") {
    const gold = p.result?.goldGained ?? 0;
    SAVE.guild.gold += gold;
    addLog(SAVE, "quest_reward", `【受取】+${gold.toLocaleString()}G`);
    // rank up is manual for now (we can add later)
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
  // move pending to local list then clear
  const pending = SAVE.jobs.pendingResults ?? [];
  if (!pending.length) return;

  // Collect in endedAt order
  pending.sort((a,b) => (a.endedAt ?? 0) - (b.endedAt ?? 0));
  for (const p of pending) collectPending(p);

  SAVE.jobs.pendingResults = [];
  // clear tab dots after acknowledging
  if (SAVE.uiFlags?.hasTabNotification) {
    SAVE.uiFlags.hasTabNotification.quest = false;
    SAVE.uiFlags.hasTabNotification.training = false;
  }
}

// --- Rename (simple) ---
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
  if (!SAVE.logs.collapsed) {
    // mark read when opened
    markLogsRead(SAVE);
  }
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

el.btnRankUp.addEventListener("click", () => {
  const g = SAVE.guild;
  const nextRank = g.rank + 1;
  const cost = rankCost(nextRank);
  if (g.gold < cost) return;

  g.gold -= cost;
  g.rank = nextRank;

  // derived値は起動時再計算方針なので、ここでも再計算
  recalcDerived(SAVE);

  // 新ランク到達ログ
  addLog(SAVE, "rank_up", `【昇格】ギルドランク ${nextRank}（-${cost.toLocaleString()}G）`);

  // ランクで解放される難易度が増えるので、クエストボードを再抽選しておく（任意だがおすすめ）
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
});

// --- Boot ---
function boot() {
  const loaded = loadFromStorage();
  SAVE = loaded ?? makeNewSave();

  // Ensure derived values and time progression
  recalcDerived(SAVE);
  tickJobsToPending(SAVE);

  // Show start screen always (per spec)
  el.startScreen.classList.remove("hidden");
  el.mainScreen.classList.add("hidden");
  setTab("quest");

  // render quietly in background so start->main is instant
  renderAll();

  // update countdowns
  setInterval(() => {
    if (!SAVE) return;
    // only update when main visible
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
