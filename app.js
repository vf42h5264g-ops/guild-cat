// Cozy Cat Guild - app.js (v0.3)

const LS_SAVE = "ccg_save_v1";

/* =========================
   Economy / Rules
   ========================= */
const RANK = {
  cost(nextRank) {
    // 5,000 × (nextRank - 1)^3
    return 5000 * Math.pow(nextRank - 1, 3);
  },
  goldMult(rank) {
    // +10% / rank, cap 2.0倍
    const m = 1 + 0.1 * (rank - 1);
    return Math.min(2.0, m);
  },
  hireSlots(rank) {
    // 3 + floor(rank/2)
    return 3 + Math.floor(rank / 2);
  },
  trainingSlots(rank) {
    // 1 + floor((rank - 1)/2)
    return 1 + Math.floor((rank - 1) / 2);
  },
  dispatchSlots(rank) {
    // 今は固定1（UI一致優先）
    return 1;
  },
};

const TRAINING = {
  BASE_EXP_PER_MIN: 1,
  DURATIONS_MIN: [60, 120, 240, 480],
  // 枠2以降の開放費（1回）
  UNLOCK_BASE: 40000, // 40,000 × (slotNo-1)^2
  // 枠2以降の使用料（毎回）
  USE_COST_PER_MIN: 8,     // 調整しやすい：1分あたりのGold
  // 枠2以降のEXP倍率
  MULT_PER_PAID_SLOT: 0.5, // slot2=1.5x, slot3=2.0x ...
};

const HIRING = {
  hireCost(rank) {
    return rank * 5000;
  },
  refreshCost(rank) {
    return rank * 3000;
  },
  initialFreeCats: 3,
};

const LEVEL = {
  expToNext(level) {
    // ざっくり曲線（後で調整OK）
    return 60 * level * level;
  },
};

/* =========================
   Random appearance
   ========================= */
const CAT_HUES = [0, 25, 45, 80, 160, 210, 260, 320];
const EYE_COLORS = [
  "#1f1f1f", // 黒
  "#2e8b57", // 緑
  "#3b82f6", // 青
  "#a855f7", // 紫
  "#f59e0b", // オレンジ
  "#ef4444", // 赤
];

function randomHue() {
  return CAT_HUES[Math.floor(Math.random() * CAT_HUES.length)];
}
function randomEyeColor() {
  return EYE_COLORS[Math.floor(Math.random() * EYE_COLORS.length)];
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
  dailyTip: document.getElementById("dailyTip"),

  hud: document.getElementById("hud"),
  btnSave: document.getElementById("btnSave"),
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

  tabQuest: document.getElementById("tab-quest"),
  tabCats: document.getElementById("tab-cats"),
  tabTraining: document.getElementById("tab-training"),

  modalBackdrop: document.getElementById("modalBackdrop"),
  modal: document.getElementById("modal"),
  modalTitle: document.getElementById("modalTitle"),
  modalBody: document.getElementById("modalBody"),
  modalClose: document.getElementById("modalClose"),
};

let state = null;
let currentTab = "quest";
let logUnread = 0;

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
   Save/Load
   ========================= */
function save() {
  localStorage.setItem(LS_SAVE, JSON.stringify(state));
  pushLog("保存しました");
}
function load() {
  const raw = localStorage.getItem(LS_SAVE);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

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
}

function renderLogs() {
  const open = !el.logPanel.classList.contains("hidden");
  el.logUnreadPill.textContent = String(logUnread);
  el.logUnreadPill.style.display = logUnread > 0 ? "inline-block" : "none";
  if (!open) return;

  const items = (state.logs || []).slice(0, 30).map((x) => {
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
   State helpers
   ========================= */
function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function totalPower() {
  return (state.cats || []).reduce((sum, c) => sum + c.str + c.agi + c.int, 0);
}

function getTrainingSlotMeta(slotNo) {
  const unlockCost = TRAINING.UNLOCK_BASE * Math.pow(slotNo - 1, 2);
  const expMult = 1 + TRAINING.MULT_PER_PAID_SLOT * (slotNo - 1);
  return { unlockCost, expMult };
}
function calcTrainingUseCost(slotNo, durationMin) {
  if (slotNo === 1) return 0;
  return TRAINING.USE_COST_PER_MIN * durationMin * (slotNo - 1);
}

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

function isCatBusy(catId) {
  // quest
  for (const q of (state.questJobs || [])) {
    if (!q) continue;
    if (q.partyIds?.includes(catId)) return "quest";
  }
  // training
  for (const j of (state.trainingJobs || [])) {
    if (!j) continue;
    if (j.catId === catId) return "training";
  }
  return null;
}

function catById(id) {
  return (state.cats || []).find(c => c.id === id);
}

function addExp(cat, amount) {
  cat.exp = (cat.exp || 0) + amount;
  while (cat.exp >= LEVEL.expToNext(cat.level)) {
    cat.exp -= LEVEL.expToNext(cat.level);
    cat.level += 1;
    // レベルアップ：性格寄り+ランダム少し
    const main = getMainStat(cat.personality);
    const gainBase = 1;
    const gainMain = 2;
    if (main === "STR") cat.str += gainMain; else cat.str += gainBase;
    if (main === "AGI") cat.agi += gainMain; else cat.agi += gainBase;
    if (main === "INT") cat.int += gainMain; else cat.int += gainBase;
    pushLog(`${cat.name} が Lv${cat.level} に成長！`);
  }
}

function getMainStat(personality) {
  switch (personality) {
    case "ツンデレ": return "STR";
    case "やんちゃ": return "AGI";
    case "クール": return "INT";
    case "あまえんぼ": return ["STR","AGI","INT"][Math.floor(Math.random()*3)];
    default: return "STR";
  }
}

/* =========================
   Boot / New game
   ========================= */
function makeCat(personality, name) {
  // 初期値ざっくり
  const base = 5 + Math.floor(Math.random() * 3); // 5-7
  let str = base, agi = base, intv = base;
  const main = getMainStat(personality);
  if (main === "STR") str += 2;
  if (main === "AGI") agi += 2;
  if (main === "INT") intv += 2;

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
    eyeColor: randomEyeColor(),
  };
}

function newGame() {
  const starters = [
    makeCat("あまえんぼ", "ミケ"),
    makeCat("ツンデレ", "キナコ"),
    makeCat("やんちゃ", "サクラ"),
  ];

  return {
    version: 3,
    gold: 12000,
    guildRank: 1,
    cats: starters,

    logs: [],
    pendingResults: [],

    // hiring
    hire: {
      candidates: [],
      lastRefreshAt: 0,
    },

    // quest/training
    questJobs: [],
    trainingSlots: [],
    trainingJobs: [],
  };
}

function boot() {
  state = load() || newGame();
  // backward compat safe
  if (!Array.isArray(state.cats)) state.cats = [];
  if (typeof state.gold !== "number") state.gold = 0;
  if (typeof state.guildRank !== "number") state.guildRank = 1;

  ensureQuestState();
  ensureTrainingState();
  ensureCandidates();

  // daily tip (simple)
  const tips = ["やる気はあるにゃ。", "急がば回れ、にゃ。", "訓練は裏切らないにゃ。", "Goldは正義にゃ。"];
  el.dailyTip.textContent = tips[Math.floor(Math.random() * tips.length)];

  // UI events
  bindUI();

  // show main directly if already played (save exists)
  const hasSave = !!localStorage.getItem(LS_SAVE);
  if (hasSave) {
    el.startScreen.classList.add("hidden");
    el.mainScreen.classList.remove("hidden");
  }

  renderAll();

  // main tick
  setInterval(tick, 1000);

  // dumbbell animation
  setInterval(toggleDumbbells, 500);
}

function bindUI() {
  el.btnStart.addEventListener("click", () => {
    el.startScreen.classList.add("hidden");
    el.mainScreen.classList.remove("hidden");
    pushLog("ギルド運営を開始！");
    renderAll();
  });

  el.btnSave.addEventListener("click", () => save());

  // safe reset (type RESET)
  el.btnReset.addEventListener("click", () => {
    const html = `
      <div class="panelCard">
        <div><b>⚠ データリセット</b></div>
        <div class="dim" style="margin-top:6px;">
          ギルド・ネコ・Gold・進行状況がすべて削除されます。
        </div>
        <div class="dim" style="margin-top:6px;">
          実行するには <b>RESET</b> と入力してください。
        </div>
      </div>

      <div class="panelCard" style="margin-top:10px;">
        <input id="resetInput"
          placeholder="RESET と入力"
          style="width:100%;padding:10px;border-radius:10px;border:1px solid #232a36;background:#10141b;color:#e9ecf1;" />
      </div>

      <div class="row" style="margin-top:12px;">
        <button class="ghost smallBtn" id="resetCancel">キャンセル</button>
        <button class="primary smallBtn" id="resetConfirm" disabled>完全削除</button>
      </div>
    `;
    openModal("データリセット確認", html);

    const input = document.getElementById("resetInput");
    const confirmBtn = document.getElementById("resetConfirm");
    const cancelBtn = document.getElementById("resetCancel");

    input.addEventListener("input", () => {
      confirmBtn.disabled = input.value !== "RESET";
    });
    cancelBtn.addEventListener("click", closeModal);
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
      currentTab = btn.dataset.tab;
      document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      el.tabQuest.classList.toggle("hidden", currentTab !== "quest");
      el.tabCats.classList.toggle("hidden", currentTab !== "cats");
      el.tabTraining.classList.toggle("hidden", currentTab !== "training");

      renderTabs();
    });
  });
}

/* =========================
   Candidates / Hiring
   ========================= */
function ensureCandidates() {
  if (!state.hire) state.hire = { candidates: [], lastRefreshAt: 0 };
  if (!Array.isArray(state.hire.candidates)) state.hire.candidates = [];

  // if empty, generate
  if (state.hire.candidates.length === 0) {
    refreshCandidates(true);
  }
}

function refreshCandidates(free = false) {
  const cost = HIRING.refreshCost(state.guildRank);
  if (!free) {
    if (state.gold < cost) {
      pushLog(`Gold不足：候補更新に ${cost.toLocaleString()}G 必要`);
      return;
    }
    state.gold -= cost;
  }

  const personalities = ["あまえんぼ","ツンデレ","クール","やんちゃ"];
  const names = ["ミケ","タマ","モモ","コテツ","マロン","ユズ","コハク","ルナ","ソラ","ハル"];
  const list = [];
  for (let i = 0; i < 3; i++) {
    const p = personalities[Math.floor(Math.random() * personalities.length)];
    const nm = names[Math.floor(Math.random() * names.length)] + (Math.random()<0.35 ? String(Math.floor(Math.random()*9)+1) : "");
    list.push(makeCat(p, nm));
  }
  state.hire.candidates = list;
  state.hire.lastRefreshAt = Date.now();
  pushLog(free ? "雇用候補が更新されました" : `雇用候補を更新（${cost.toLocaleString()}G）`);
  renderAll();
}

function hireCat(catId) {
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
  state.gold -= cost;
  state.guildRank = nextRank;

  // unlock changes
  ensureQuestState();
  ensureTrainingState();

  const hs = RANK.hireSlots(state.guildRank);
  const ts = RANK.trainingSlots(state.guildRank);
  pushLog(`🎉 ギルドランク ${state.guildRank} に昇格！`);
  pushLog(`アンロック：雇用枠 ${hs} / 訓練枠 ${ts}`);
  renderAll();
}

/* =========================
   Quests
   ========================= */
function getQuestList() {
  // rankに応じて少し強く
  const r = state.guildRank;
  const base = [
    { id:"battle", icon:"🗡", name:"戦闘", main:"STR" },
    { id:"search", icon:"⚡", name:"探索", main:"AGI" },
    { id:"invest", icon:"🧠", name:"調査", main:"INT" },
  ];

  // duration: 10/30/60 で雰囲気
  const options = [
    { diff:"E", min:10, gold:1200 },
    { diff:"D", min:30, gold:4000 },
    { diff:"C", min:60, gold:9000 },
  ];

  // rankが上がると上側が出やすい
  const pick = (i) => options[Math.min(options.length-1, Math.floor((r-1)/2) + i) % options.length];

  return base.map((b, i) => {
    const o = pick(i);
    return {
      ...b,
      diff: o.diff,
      durationMin: o.min,
      baseGold: o.gold,
      // target scaling
      target: 12 + (r-1) * 6 + i * 2,
    };
  });
}

function startQuest(questDef) {
  ensureQuestState();
  const slotIdx = state.questJobs.findIndex(x => !x);
  if (slotIdx < 0) {
    pushLog("派遣枠が空いていません");
    return;
  }

  // select up to 3 cats (idle only)
  const idle = state.cats.filter(c => !isCatBusy(c.id));
  if (idle.length === 0) {
    pushLog("待機中のネコがいません");
    return;
  }

  const html = `
    <div class="panelCard">
      <div><b>${questDef.icon} ${questDef.name} ${questDef.diff}</b></div>
      <div class="dim">時間: ${questDef.durationMin}分 / 基準Gold: ${questDef.baseGold.toLocaleString()}G</div>
      <div class="dim">最大3匹まで選択（クエスト/訓練と両立不可）</div>
    </div>

    <div class="panelCard" style="margin-top:10px;">
      <div class="dim" style="margin-bottom:8px;">参加ネコ（最大3）</div>
      <div id="partyList" class="modalList"></div>
    </div>

    <div class="row" style="margin-top:12px;">
      <button class="ghost smallBtn" id="qCancel">キャンセル</button>
      <button class="primary smallBtn" id="qStart" disabled>受注</button>
    </div>
  `;
  openModal("クエスト受注", html);

  const partyList = document.getElementById("partyList");
  const selected = new Set();

  partyList.innerHTML = idle.map(c => `
    <div class="modalItem" data-cat="${c.id}">
      <b>${escapeHtml(c.name)}</b> Lv${c.level}
      <div class="dim">${escapeHtml(c.personality)} / STR ${c.str} AGI ${c.agi} INT ${c.int}</div>
    </div>
  `).join("");

  const btnStart = document.getElementById("qStart");
  const btnCancel = document.getElementById("qCancel");

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
    btnStart.disabled = selected.size === 0;
  });

  btnCancel.addEventListener("click", closeModal);

  btnStart.addEventListener("click", () => {
    closeModal();

    const partyIds = Array.from(selected);
    const score = partyIds.reduce((s, id) => {
      const c = catById(id);
      return s + (questDef.main === "STR" ? c.str : questDef.main === "AGI" ? c.agi : c.int);
    }, 0);

    // success prob (displayed-ish): clamp 20~85
    const p = clamp(20, 85, Math.floor(50 + (score - questDef.target) * 3));
    const goldMult = RANK.goldMult(state.guildRank);

    const now = Date.now();
    const endAt = now + questDef.durationMin * 60 * 1000;

    state.questJobs[slotIdx] = {
      slotNo: slotIdx + 1,
      def: questDef,
      partyIds,
      score,
      pSuccess: p,
      goldMult,
      startAt: now,
      endAt,
    };

    pushLog(`受注：${questDef.name}${questDef.diff}（${questDef.durationMin}分 / 成功率 ${p}%）`);
    renderAll();
  });
}

function finishQuestsIfDone() {
  const now = Date.now();
  for (let i = 0; i < state.questJobs.length; i++) {
    const job = state.questJobs[i];
    if (!job) continue;
    if (job.endAt > now) continue;

    const roll = Math.random() * 100;
    let result = "失敗";
    let gold = 0;
    let exp = 0;

    // great success when roll <= p*0.2 (and success)
    if (roll <= job.pSuccess) {
      if (roll <= job.pSuccess * 0.2) {
        result = "大成功";
        gold = Math.floor(job.def.baseGold * 1.6 * job.goldMult);
        exp = Math.floor(job.def.durationMin * 1.2);
      } else {
        result = "成功";
        gold = Math.floor(job.def.baseGold * job.goldMult);
        exp = Math.floor(job.def.durationMin * 1.0);
      }
    } else {
      result = "失敗";
      gold = Math.floor(job.def.baseGold * 0.2);
      exp = Math.floor(job.def.durationMin * 0.4);
    }

    if (!Array.isArray(state.pendingResults)) state.pendingResults = [];
    state.pendingResults.push({
      type: "quest",
      finishedAt: now,
      questName: job.def.name,
      diff: job.def.diff,
      result,
      gold,
      expEach: exp,
      partyIds: job.partyIds,
    });

    pushLog(`クエスト完了：${job.def.name}${job.def.diff} → ${result}（受取待ち）`);
    state.questJobs[i] = null;
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
}

function openTrainingStartModal(slotNo) {
  ensureTrainingState();

  const slot = state.trainingSlots[slotNo - 1];
  const job = state.trainingJobs[slotNo - 1];
  if (job) return; // 念のため
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

    <div class="row" style="margin-top:12px;">
      <button class="ghost smallBtn" id="tCancel">キャンセル</button>
      <button class="primary smallBtn" id="tStart" disabled>開始</button>
    </div>
  `;
  openModal("訓練開始", html);

  const tCats = document.getElementById("tCats");
  const tDur = document.getElementById("tDur");
  const btnStart = document.getElementById("tStart");
  const btnCancel = document.getElementById("tCancel");

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

  const updateBtn = () => {
    btnStart.disabled = !(pickCat && pickMin);
  };

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

  btnCancel.addEventListener("click", closeModal);
  btnStart.addEventListener("click", () => {
    closeModal();
    startTraining(slotNo, pickCat, pickMin);
  });
}

function startTraining(slotNo, catId, durationMin) {
  ensureTrainingState();

  // slot busy?
  if (state.trainingJobs[slotNo - 1]) {
    pushLog("訓練枠が使用中です");
    return;
  }

  // cat busy?
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
}

function finishTrainingIfDone() {
  ensureTrainingState();
  const now = Date.now();

  for (let i = 0; i < state.trainingJobs.length; i++) {
    const job = state.trainingJobs[i];
    if (!job) continue;
    if (job.endAt > now) continue;

    if (!Array.isArray(state.pendingResults)) state.pendingResults = [];
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
   Pending / Collect
   ========================= */
function collectAll() {
  const list = state.pendingResults || [];
  if (list.length === 0) return;

  let totalGold = 0;
  let totalExp = 0;

  for (const r of list) {
    if (r.type === "quest") {
      state.gold += r.gold;
      totalGold += r.gold;
      for (const id of r.partyIds) {
        const c = catById(id);
        if (c) addExp(c, r.expEach);
      }
      totalExp += (r.expEach * r.partyIds.length);
      pushLog(`受取：${r.questName}${r.diff} ${r.result} / +${r.gold.toLocaleString()}G / EXP+${r.expEach}×${r.partyIds.length}`);
    }
    if (r.type === "training") {
      const c = catById(r.catId);
      if (c) addExp(c, r.exp);
      totalExp += r.exp;
      pushLog(`受取：訓練 枠${r.slotNo} / EXP+${r.exp}`);
    }
  }

  state.pendingResults = [];
  el.dotTraining.classList.add("hidden");
  renderAll();
}

/* =========================
   Rendering
   ========================= */
function renderAll() {
  ensureQuestState();
  ensureTrainingState();

  renderHeaderBadges();
  renderRankUp();
  renderPending();
  renderTabs();
  renderLogs();
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
  if (n <= 0) {
    el.pendingBar.classList.add("hidden");
  } else {
    el.pendingBar.classList.remove("hidden");
    el.pendingText.textContent = `受取待ち: ${n}`;
  }

  // notifications
  const hasTrainingDone = (state.pendingResults || []).some(r => r.type === "training");
  const hasQuestDone = (state.pendingResults || []).some(r => r.type === "quest");
  el.dotTraining.classList.toggle("hidden", !hasTrainingDone);
  el.dotQuest.classList.toggle("hidden", !hasQuestDone);
}

function renderTabs() {
  if (currentTab === "quest") renderQuestTab();
  if (currentTab === "cats") renderCatsTab();
  if (currentTab === "training") renderTrainingTab();
}

function renderQuestTab() {
  const list = getQuestList();
  const ds = RANK.dispatchSlots(state.guildRank);
  const used = (state.questJobs || []).filter(Boolean).length;

  el.tabQuest.innerHTML = `
    <div class="panelCard">
      <div class="row">
        <div>
          <div><b>現在の依頼</b> <span class="dim">(STR/AGI/INT)</span></div>
          <div class="dim">受注で即補充 / キャンセル不可 / 訓練と両立不可</div>
        </div>
        <div class="mono">派遣枠 ${used}/${ds}</div>
      </div>
    </div>

    ${list.map(q => `
      <div class="panelCard">
        <div class="row">
          <div>
            <div><b>${q.icon} ${q.name} ${q.diff}</b></div>
            <div class="dim">${q.durationMin}分 / 基準${q.baseGold.toLocaleString()}G</div>
          </div>
          <button class="primary smallBtn" data-quest="${q.id}">受注</button>
        </div>
      </div>
    `).join("")}

    ${renderQuestRunning()}
  `;

  // bind
  el.tabQuest.querySelectorAll("[data-quest]").forEach(btn => {
    btn.addEventListener("click", () => {
      const q = list.find(x => x.id === btn.dataset.quest);
      if (!q) return;
      startQuest(q);
    });
  });
}

function renderQuestRunning() {
  const running = (state.questJobs || []).filter(Boolean);
  if (running.length === 0) return "";

  return running.map(job => {
    const remain = Math.max(0, job.endAt - Date.now());
    return `
      <div class="panelCard">
        <div class="row">
          <div>
            <div><span class="statusDot quest"></span><b>クエスト中</b></div>
            <div class="dim">${job.def.name} ${job.def.diff} / ${job.def.durationMin}分</div>
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
  const refreshCost = HIRING.refreshCost(state.guildRank);

  const catsHtml = state.cats.map(c => {
    const busy = isCatBusy(c.id);
    const statusText = busy === "quest" ? "クエスト" : busy === "training" ? "訓練" : "待機";
    const dotClass = busy === "quest" ? "quest" : busy === "training" ? "training" : "";

    const weaponImg = getWeaponImageByPersonality(c.personality);
    const training = busy === "training";

    return `
      <div class="panelCard catCard">
        <div class="catSpriteWrap">
          <img src="img/cat.png" class="catSprite colorized"
               style="--hue:${c.hue}deg;" />
          <span class="eyeDot left" style="--eye:${c.eyeColor};"></span>
          <span class="eyeDot right" style="--eye:${c.eyeColor};"></span>

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
          <div class="dim">${escapeHtml(c.personality)}（${getMainStat(c.personality)}寄り）</div>
          <div class="mono">STR ${c.str} / AGI ${c.agi} / INT ${c.int}</div>

          <div class="row" style="margin-top:8px;">
            <div class="dim">EXP ${c.exp}/${LEVEL.expToNext(c.level)}</div>
            <button class="ghost smallBtn" data-rename="${c.id}">名前変更</button>
          </div>
        </div>
      </div>
    `;
  }).join("");

  const candHtml = state.hire.candidates.map(c => `
    <div class="panelCard catCard">
      <div class="catSpriteWrap">
        <img src="img/cat.png" class="catSprite colorized" style="--hue:${c.hue}deg;" />
       
        ${getWeaponImageByPersonality(c.personality) ? `<img src="${getWeaponImageByPersonality(c.personality)}" class="catWeapon" />` : ""}
      </div>
      <div style="min-width:0;flex:1;">
        <div><b>${escapeHtml(c.name)}</b> <span class="dim">Lv${c.level}</span></div>
        <div class="dim">${escapeHtml(c.personality)}（${getMainStat(c.personality)}寄り）</div>
        <div class="mono">STR ${c.str} / AGI ${c.agi} / INT ${c.int}</div>
      </div>
      <button class="primary smallBtn" data-hire="${c.id}">雇用</button>
    </div>
  `).join("");

  el.tabCats.innerHTML = `
    <div class="panelCard">
      <div class="row">
        <div>
          <div><b>ギルド戦力</b></div>
          <div class="dim">待機→クエスト→訓練 の順に表示</div>
        </div>
        <div class="mono">${totalPower()}</div>
      </div>
    </div>

    ${catsHtml}

    <div class="panelCard">
      <div class="row">
        <div>
          <div><b>雇用</b> <span class="dim">雇用枠 ${state.cats.length}/${hs}</span></div>
          <div class="dim">雇用費: ${hireCost.toLocaleString()}G（Rank×5,000）</div>
        </div>
        <button class="ghost smallBtn" id="btnRefresh">候補更新 ${refreshCost.toLocaleString()}G</button>
      </div>
    </div>

    ${candHtml || `<div class="panelCard dim">候補がありません</div>`}
  `;

  el.tabCats.querySelectorAll("[data-rename]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.rename;
      const c = catById(id);
      if (!c) return;
      const html = `
        <div class="panelCard">
          <div class="dim">新しい名前を入力</div>
          <input id="nameInput" value="${escapeAttr(c.name)}"
            style="width:100%;padding:10px;border-radius:10px;border:1px solid #232a36;background:#10141b;color:#e9ecf1;margin-top:8px;" />
        </div>
        <div class="row" style="margin-top:12px;">
          <button class="ghost smallBtn" id="nCancel">キャンセル</button>
          <button class="primary smallBtn" id="nOk">変更</button>
        </div>
      `;
      openModal("名前変更", html);
      document.getElementById("nCancel").addEventListener("click", closeModal);
      document.getElementById("nOk").addEventListener("click", () => {
        const v = document.getElementById("nameInput").value.trim();
        if (v) {
          c.name = v;
          pushLog(`名前変更：${v}`);
        }
        closeModal();
        renderAll();
      });
    });
  });

  const btnRefresh = document.getElementById("btnRefresh");
  btnRefresh?.addEventListener("click", () => refreshCandidates(false));

  el.tabCats.querySelectorAll("[data-hire]").forEach(btn => {
    btn.addEventListener("click", () => hireCat(btn.dataset.hire));
  });
}

function renderTrainingTab() {
  ensureTrainingState();

  const slotCount = state.trainingJobs.length;
  const usedTraining = state.trainingJobs.filter(Boolean).length;

  const info = `
    <div class="panelCard">
      <div><b>訓練</b> <span class="dim">1EXP/分 / 両立不可 / 受取式</span></div>
      <div class="dim">開放費: 40,000×(枠番号-1)^2 / 空き: ${(slotCount - usedTraining)}/${slotCount}</div>
      <div class="dim">有料枠は使用料が発生し、EXP倍率が上がります</div>
    </div>
  `;

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
              <div class="dim">EXP: ${job.expGain} / 使用料: ${job.useCost.toLocaleString()}G</div>
              <div class="dim">倍率: x${expMult.toFixed(1)}</div>
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
              <div class="dim">開放費: ${unlockCost.toLocaleString()}G</div>
              <div class="dim">倍率: x${expMult.toFixed(1)}</div>
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
            <div class="dim">倍率: x${expMult.toFixed(1)}</div>
            <div class="dim">${slotNo === 1 ? "使用料: 0G" : "使用料: 時間に応じて発生"}</div>
          </div>
          <button class="primary smallBtn" data-start-slot="${slotNo}">訓練する</button>
        </div>
      </div>
    `);
  }

  // running summary (training jobs already shown above, but keep)
  const running = state.trainingJobs.filter(Boolean);
  const runningCards = running.map(job => {
    const remain = Math.max(0, job.endAt - Date.now());
    return `
      <div class="panelCard">
        <div class="row">
          <div>
            <div><span class="statusDot training"></span><b>訓練中</b></div>
            <div class="dim">訓練 ${job.durationMin}分 / 枠${job.slotNo}</div>
          </div>
          <div class="mono">${formatRemain(remain)}</div>
        </div>
      </div>
    `;
  }).join("");

  el.tabTraining.innerHTML = info + cards.join("") + (runningCards ? runningCards : "");

  // bind
  el.tabTraining.querySelectorAll("[data-unlock-slot]").forEach(btn => {
    btn.addEventListener("click", () => unlockTrainingSlot(Number(btn.dataset.unlockSlot)));
  });
  el.tabTraining.querySelectorAll("[data-start-slot]").forEach(btn => {
    btn.addEventListener("click", () => openTrainingStartModal(Number(btn.dataset.startSlot)));
  });
}

/* =========================
   Tick
   ========================= */
function tick() {
  finishTrainingIfDone();
  finishQuestsIfDone();

  // pending show
  renderPending();

  // update timers in visible tab
  if (currentTab === "quest") renderQuestTab();
  if (currentTab === "training") renderTrainingTab();

  // iOS weird scroll-left stuck (保険)
  document.documentElement.scrollLeft = 0;
  document.body.scrollLeft = 0;
}

function toggleDumbbells() {
  // 訓練中の猫だけ jim1/jim2 を切替
  const jobs = state.trainingJobs || [];
  for (const job of jobs) {
    if (!job) continue;
    const img = document.querySelector(`img[data-jim="${job.catId}"]`);
    if (!img) continue;
    img.src = img.src.includes("jim1") ? "img/jim2.png" : "img/jim1.png";
  }
}

/* =========================
   Utils
   ========================= */
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

/* =========================
   Start
   ========================= */
boot();
