// Cozy Cat Guild - app.js (v0.5)
// - AUTO SAVE（保存ボタン不要）
// - Tutorial復活：ギルド名入力 → 無料スカウトで1匹選択 → 残り2匹は性格被りなしで自動加入
// - いつでもギルド名変更
// - 雇用は「スカウトする」ボタンで候補モーダル表示（費用支払い）
// - 訓練モーダル：本文スクロール＋フッター固定（ボタン見切れ防止） ※CSS側で対応済想定
// - 訓練枠2以降：開放費＋使用料＋EXP倍率
// - 目は素体のまま（ランダム目なし）／毛色はhueでランダム／武器は性格で表示／訓練中はjim1/jim2でアニメ

const LS_SAVE = "ccg_save_v2";

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
    return 1; // 今は固定
  },
};

const TRAINING = {
  BASE_EXP_PER_MIN: 1,
  DURATIONS_MIN: [60, 120, 240, 480], // 1/2/4/8h
  UNLOCK_BASE: 40000,      // 40,000 × (slotNo-1)^2
  USE_COST_PER_MIN: 8,     // 毎分の使用料（slot2以降）
  MULT_PER_PAID_SLOT: 0.5, // slot2=1.5x, slot3=2.0x...
};

// 雇用：候補更新（スカウト費）を「ランクごとの固定額」
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
    return 60 * level * level; // ゆるめ曲線
  },
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
  dailyTip: document.getElementById("dailyTip"),

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
   Leveling
   ========================= */
function getMainStat(personality) {
  switch (personality) {
    case "ツンデレ": return "STR";
    case "やんちゃ": return "AGI";
    case "クール": return "INT";
    case "あまえんぼ": return ["STR","AGI","INT"][Math.floor(Math.random()*3)];
    default: return "STR";
  }
}
function addExp(cat, amount) {
  cat.exp = (cat.exp || 0) + amount;
  while (cat.exp >= LEVEL.expToNext(cat.level)) {
    cat.exp -= LEVEL.expToNext(cat.level);
    cat.level += 1;

    const main = getMainStat(cat.personality);
    const gainBase = 1;
    const gainMain = 2;

    cat.str += (main === "STR") ? gainMain : gainBase;
    cat.agi += (main === "AGI") ? gainMain : gainBase;
    cat.int += (main === "INT") ? gainMain : gainBase;

    pushLog(`${cat.name} が Lv${cat.level} に成長！`);
  }
}

/* =========================
   Create cats
   ========================= */
function makeCat(personality, name) {
  const base = 5 + Math.floor(Math.random() * 3);
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
  };
}

/* =========================
   New game / Boot
   ========================= */
function newGame() {
  // 初期ネコは「チュートリアルで 1匹選択 + 2匹自動加入」にするため、ここでは空
  return {
    version: 5,
    guildRank: 1,
    gold: 12000,

    guildName: "Cozy Cat Guild",
    tutorialDone: false,

    cats: [],

    logs: [],
    pendingResults: [],

    hire: { candidates: [], lastRefreshAt: 0 },

    questJobs: [],
    trainingSlots: [],
    trainingJobs: [],
  };
}

function boot() {
  state = load() || newGame();

  // Backward-safe defaults
  if (typeof state.guildRank !== "number") state.guildRank = 1;
  if (typeof state.gold !== "number") state.gold = 0;
  if (!Array.isArray(state.cats)) state.cats = [];
  if (typeof state.guildName !== "string") state.guildName = "Cozy Cat Guild";
  if (typeof state.tutorialDone !== "boolean") state.tutorialDone = false;

  ensureQuestState();
  ensureTrainingState();
  ensurePending();
  ensureHire();

  // daily tip
  const tips = ["やる気はあるにゃ。","急がば回れ、にゃ。","訓練は裏切らないにゃ。","Goldは正義にゃ。"];
  if (el.dailyTip) el.dailyTip.textContent = tips[Math.floor(Math.random() * tips.length)];

  bindUI();

  const hasSave = !!localStorage.getItem(LS_SAVE);
  if (!hasSave || !state.tutorialDone) {
    el.startScreen.classList.remove("hidden");
    el.mainScreen.classList.add("hidden");
  } else {
    el.startScreen.classList.add("hidden");
    el.mainScreen.classList.remove("hidden");
  }

  renderAll();

  setInterval(tick, 1000);
  setInterval(toggleDumbbells, 500);
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
      <div class="dim">スカウト→候補から1匹選択。残り2匹は性格が被らないように自動で合流します。</div>
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

  // ギルド名が空欄でも開始できる方がいいなら、ここは disabled 条件を消してOK
  btnStart.addEventListener("click", () => {
    const v = input.value.trim();
    state.guildName = v || "Cozy Cat Guild";
    // 次へ誘導（スカウトを促す）
    openTutorialScoutModal();
  });

  document.getElementById("tutScout").addEventListener("click", () => {
    const v = input.value.trim();
    state.guildName = v || "Cozy Cat Guild";
    openTutorialScoutModal();
  });
}

function openTutorialScoutModal() {
  // チュートリアル用：無料スカウト（支払いなし）
  const candidates = generateCandidates();

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

  openModal("スカウト", html);

  document.getElementById("tutBack").addEventListener("click", () => {
    closeModal();
    startTutorialFlow();
  });

  document.querySelectorAll("[data-pick]").forEach(item => {
    item.addEventListener("click", () => {
      const picked = candidates.find(c => c.id === item.dataset.pick);
      if (picked) finishTutorial(picked);
    });
  });
}

function finishTutorial(firstCat) {
  closeModal();

  // 既に猫がいる（古いセーブ等）場合は、チュートリアル猫追加をしない
  if ((state.cats || []).length > 0) {
    state.tutorialDone = true;
    save();
    el.startScreen.classList.add("hidden");
    el.mainScreen.classList.remove("hidden");
    renderAll();
    return;
  }

  state.cats.push(firstCat);

  // 残り2匹：性格被りなし（firstCat以外から2つ選ぶ）
  const personalities = ["あまえんぼ","ツンデレ","クール","やんちゃ"];
  const remain = personalities.filter(p => p !== firstCat.personality);
  shuffleArray(remain);
  const extra1 = makeCat(remain[0], randomName());
  const extra2 = makeCat(remain[1], randomName());

  state.cats.push(extra1, extra2);

  state.tutorialDone = true;

  pushLog(`ギルド「${state.guildName}」設立！`);
  pushLog(`${firstCat.name} が最初の仲間に！`);
  pushLog(`${extra1.name} が合流！`);
  pushLog(`${extra2.name} が合流！`);

  save();

  el.startScreen.classList.add("hidden");
  el.mainScreen.classList.remove("hidden");
  renderAll();
}

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
   UI Bindings
   ========================= */
function bindUI() {
  el.btnStart.addEventListener("click", () => {
    if (!state.tutorialDone) {
      startTutorialFlow();
      return;
    }
    el.startScreen.classList.add("hidden");
    el.mainScreen.classList.remove("hidden");
    renderAll();
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

  ensureQuestState();
  ensureTrainingState();

  const hs = RANK.hireSlots(state.guildRank);
  const ts = RANK.trainingSlots(state.guildRank);

  pushLog(`🎉 ギルドランク ${state.guildRank} に昇格！`);
  pushLog(`アンロック：雇用枠 ${hs} / 訓練枠 ${ts}`);
  renderAll();
  save();
}

/* =========================
   Quests
   ========================= */
function getQuestList() {
  const r = state.guildRank;
  const base = [
    { id:"battle", icon:"🗡", name:"戦闘", main:"STR" },
    { id:"search", icon:"⚡", name:"探索", main:"AGI" },
    { id:"invest", icon:"🧠", name:"調査", main:"INT" },
  ];
  const options = [
    { diff:"E", min:10, gold:1200 },
    { diff:"D", min:30, gold:4000 },
    { diff:"C", min:60, gold:9000 },
  ];
  const pick = (i) => options[Math.min(options.length-1, Math.floor((r-1)/2) + i) % options.length];

  return base.map((b, i) => {
    const o = pick(i);
    return {
      ...b,
      diff: o.diff,
      durationMin: o.min,
      baseGold: o.gold,
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

  const idle = state.cats.filter(c => !isCatBusy(c.id));
  if (idle.length === 0) {
    pushLog("待機中のネコがいません");
    return;
  }

  const html = `
    <div class="panelCard">
      <div><b>${questDef.icon} ${questDef.name} ${questDef.diff}</b></div>
      <div class="dim">時間: ${questDef.durationMin}分 / 基準Gold: ${questDef.baseGold.toLocaleString()}G</div>
      <div class="dim">最大3匹まで選択（訓練と両立不可 / キャンセル不可）</div>
    </div>

    <div class="panelCard" style="margin-top:10px;">
      <div class="dim" style="margin-bottom:8px;">参加ネコ（最大3）</div>
      <div id="partyList" class="modalList"></div>
    </div>

    <div class="modalFooter">
      <button class="ghost" id="qCancel">戻る</button>
      <button class="primary" id="qStart" disabled>受注</button>
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
  document.getElementById("qCancel").addEventListener("click", closeModal);

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

  btnStart.addEventListener("click", () => {
    closeModal();

    const partyIds = Array.from(selected);
    const score = partyIds.reduce((s, id) => {
      const c = catById(id);
      return s + (questDef.main === "STR" ? c.str : questDef.main === "AGI" ? c.agi : c.int);
    }, 0);

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
    save();
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

    ensurePending();
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
function generateCandidates() {
  const personalities = ["あまえんぼ","ツンデレ","クール","やんちゃ"];
  const names = ["ミケ","タマ","モモ","コテツ","マロン","ユズ","コハク","ルナ","ソラ","ハル"];
  const list = [];
  for (let i = 0; i < 3; i++) {
    const p = personalities[Math.floor(Math.random() * personalities.length)];
    const nm = names[Math.floor(Math.random() * names.length)] + (Math.random()<0.35 ? String(Math.floor(Math.random()*9)+1) : "");
    list.push(makeCat(p, nm));
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
  state.hire.candidates = generateCandidates();
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
      pushLog(`受取：${r.questName}${r.diff} ${r.result} / +${r.gold.toLocaleString()}G / EXP+${r.expEach}×${r.partyIds.length}`);
    }
    if (r.type === "training") {
      const c = catById(r.catId);
      if (c) addExp(c, r.exp);
      pushLog(`受取：訓練 枠${r.slotNo} / EXP+${r.exp}`);
    }
  }

  state.pendingResults = [];
  renderAll();
  save();
}

/* =========================
   Rendering
   ========================= */
function renderAll() {
  ensureQuestState();
  ensureTrainingState();
  ensurePending();
  ensureHire();

  renderGuildTitle();
  renderHeaderBadges();
  renderRankUp();
  renderPending();
  renderTabs();
  renderLogs();
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
  if (n <= 0) {
    el.pendingBar.classList.add("hidden");
  } else {
    el.pendingBar.classList.remove("hidden");
    el.pendingText.textContent = `受取待ち: ${n}`;
  }

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

function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
  document.querySelector(`.tab[data-tab="${tab}"]`)?.classList.add("active");

  el.tabQuest.classList.toggle("hidden", tab !== "quest");
  el.tabCats.classList.toggle("hidden", tab !== "cats");
  el.tabTraining.classList.toggle("hidden", tab !== "training");

  renderTabs();
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
          <div class="dim">受注で即補充 / 訓練と両立不可 / キャンセル不可</div>
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

  el.tabQuest.querySelectorAll("[data-quest]").forEach(btn => {
    btn.addEventListener("click", () => {
      const q = list.find(x => x.id === btn.dataset.quest);
      if (q) startQuest(q);
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
  const scoutCost = HIRING.refreshCost(state.guildRank);
  const hasCandidates = (state.hire?.candidates?.length || 0) > 0;

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
    </div>
  `;

  el.tabCats.querySelectorAll("[data-rename]").forEach(btn => {
    btn.addEventListener("click", () => openRenameCatModal(btn.dataset.rename));
  });

  document.getElementById("btnScout")?.addEventListener("click", () => scoutPayAndOpen());
  document.getElementById("btnViewCandidates")?.addEventListener("click", () => openScoutModal(false));
}

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
  const jobs = state.trainingJobs || [];
  for (const job of jobs) {
    if (!job) continue;
    const img = document.querySelector(`img[data-jim="${job.catId}"]`);
    if (!img) continue;
    img.src = img.src.includes("jim1") ? "img/jim2.png" : "img/jim1.png";
  }
}

/* =========================
   Start
   ========================= */
boot();
