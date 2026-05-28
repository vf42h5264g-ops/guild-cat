// Cozy Cat Guild - app.js (v0.5+ tutorial final)
// ✅ 起動時は必ずスタート画面（続き/新規）
// ✅ Tutorial最終：ギルド名 → 無料スカウト1匹選択 → 残り2匹自動加入（性格被りなし）
//   → 訓練紹介（タブ光らせ） → チュートクエ（確定成功/1分）
//   → 受取 → ランクアップ体験(Rank2) → 完了
// ✅ 成長：LvUpごとに合計+3（性格配分）＋10%で追加+1（性格寄り）＋節目(Lv5/10/15...)で+2
// ✅ あまえんぼは万能（+1/+1/+1）
// ✅ 解雇：Rank5解放、返却Gold = Lv * 500G
// ✅ クエスト：Lv1-10をランクに応じて解放（Max=min(10,Rank)）＆S/M/L時間タイプ
// ✅ 投資：Rank10でタブ解放。価格変動なし/売却不可/出資1000G単位/配当のみ変動（0:00締め）
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
    return Math.max(1, rank);
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
      case "ツンデレ": return { str: 2, spd: 1, int: 0 };
      case "やんちゃ": return { str: 0, spd: 2, int: 1 };
      case "クール":   return { str: 1, spd: 0, int: 2 };
      case "あまえんぼ": return { str: 1, spd: 1, int: 1 };
      default: return { str: 1, spd: 1, int: 1 };
    }
  },
  bonusPick(personality) {
    switch (personality) {
      case "ツンデレ": return "str";
      case "やんちゃ": return "spd";
      case "クール":   return "int";
      case "あまえんぼ": {
        const a = ["str", "spd", "int"];
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
    if (result === "大成功") return 1.8;
    if (result === "成功") return 1.3;
    return 0.7;
  },
};

const QUEST_RESULT_LINES = {
  battle: {
    success: [
      "いたずらモンスターを追い払ってきた。",
      "ちゃんと役目を果たしてきた。",
      "少し頼もしく見える。",
    ],
    great: [
      "思った以上に大活躍だった。",
      "周りの手伝いまでしてきた。",
      "街の人に感心されたらしい。",
    ],
    fail: [
      "相手の勢いに押されてしまったようだ。",
      "物陰で様子を見すぎてしまったらしい。",
      "少し慎重になりすぎたようだ。",
    ],
  },

  search: {
    success: [
      "荷物を無事に届けてきた。",
      "道順もしっかり覚えていたようだ。",
      "手際よく運び終えた。",
    ],
    great: [
      "ついでに追加の荷物まで運んできた。",
      "配達先でとても喜ばれた。",
      "予想より早く戻ってきた。",
    ],
    fail: [
      "途中で寄り道していたらしい。",
      "荷物より景色が気になったようだ。",
      "道草をして少し遅れてしまったらしい。",
    ],
  },

  invest: {
    success: [
      "森をひと回りして戻ってきた。",
      "ちゃんと手がかりを見つけてきた。",
      "落ち着いて探索できたようだ。",
    ],
    great: [
      "思いがけない発見があったようだ。",
      "珍しいものを見つけてきた。",
      "森の奥までしっかり見てきた。",
    ],
    fail: [
      "きれいな葉っぱに気を取られたらしい。",
      "途中で木陰に落ち着いてしまったようだ。",
      "森の静けさが心地よすぎたらしい。",
    ],
  },
};

const DEV_DAILY_BONUS = true;

const ITEM_MASTER = {
  matatabi: {
    id: "matatabi",
    icon: "🌿",
    name: "マタタビ",
    desc: "訓練EXPが2倍になる",
    stackMax: 9,
  },
};

const HELPER_BASE_MAX = 3;

function getHelperMax() {
  return HELPER_BASE_MAX + (state.helperSlotBonus || 0);
}

const AD_REWARD = {
  DAILY_LIMIT: 3,
  WAIT_MS: 3000
};

const HELPER_AD_DAILY_LIMIT = 3;

const DAILY_BONUS = {
  GOLD_TABLE: {
    1: [1000, 2000],
    2: [2000, 3000],
    4: [3000, 4000],
    5: [4000, 5000],
  },
};

const EVENT_HELPERS = [
  {
    eventId: "event_test_1",
    eventImage: "img/event/event_1.png",

    name: "祝祭のルナ",
    level: 12,
    personality: "イベント",

    str: 42,
    spd: 35,
    int: 58,
    hue: 0,

    startDate: "2026-05-28",
    endDate: "2026-05-28",
  },
];

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getQuestNeedTotal(level) {
  const fixed = QUEST.NEED_TOTAL[level - 1];
  if (fixed) return fixed;

  const last = QUEST.NEED_TOTAL[QUEST.NEED_TOTAL.length - 1];
  return Math.floor(last + Math.pow(level - 10, 1.35) * 70);
}

function getQuestDuration(level, timeKey) {
  const fixed = QUEST.DUR_TABLE[level]?.[timeKey];
  if (fixed) return fixed;

  const base = QUEST.DUR_TABLE[10][timeKey];
  return Math.floor(base + (level - 10) * 60);
}

function getQuestResultLine(questId, result) {
  const group = QUEST_RESULT_LINES[questId];
  if (!group) return "";

  let key = "fail";
  if (result === "大成功") key = "great";
  else if (result === "成功") key = "success";

  const lines = group[key];
  if (!lines || lines.length === 0) return "";
  return pickRandom(lines);
}
const INVEST = {
  unlockRank: {
    insure: 10,
    arms: 12,
    trade: 13,
    magic: 15,
  },
  shops: {
    insure: { name: "さかな組合", base: 0.16, var: 0.05, icon: "🐟" },
    arms:   { name: "武具商会", base: 0.125,  var: 0.10, icon: "🗡" },
    trade:  { name: "交易船団", base: 0.083,  var: 0.20, icon: "🚢" },
    magic:  { name: "魔導研究所", base: 0.071, var: 0.50, icon: "🔮" },
  },
  capPerRank: {
    insure: 15000,
    arms: 12000,
    trade: 10000,
    magic: 8000,
  },
  STEP: 1000,
};

const RANK_STORIES = {
  1:  {
    title: "ギルド開設",
    text: "小さなネコギルドが\n今日から始まる。",
    img: "img/story/rank01.png",
  },
  2:  {
    title: "最初の依頼",
    text: "街の人から\nはじめての依頼が届いた。",
    img: "img/story/rank02.png",
  },
  3:  {
    title: "訓練場",
    text: "ネコたちのために\n小さな訓練場を作った。",
    img: "img/story/rank03.png",
  },
  4:  {
    title: "仲間が増える",
    text: "少しずつ\nネコが集まってきた。",
    img: "img/story/rank04.png",
  },
  5:  {
    title: "街で噂に",
    text: "このギルドの名前が\n少しずつ知られてきた。",
    img: "img/story/rank05.png",
  },
  6:  {
    title: "アルパカ到着",
    text: "荷運び用のアルパカが\nギルドにやってきた。",
    img: "img/story/rank06.png",
  },
  7:  {
    title: "忙しい日々",
    text: "依頼が増えて\nギルドは少しにぎやかになった。",
    img: "img/story/rank07.png",
  },
  8:  {
    title: "遠くからの依頼",
    text: "少し遠くの町からも\n依頼が届くようになった。",
    img: "img/story/rank08.png",
  },
  9:  {
    title: "ギルド拡張",
    text: "ギルドの部屋を\n少し広くした。",
    img: "img/story/rank09.png",
  },
  10: {
    title: "さかな組合",
    text: "街のさかな組合が\n出資を持ちかけてきた。",
    img: "img/story/rank10.png",
  },
  11: {
    title: "アルパカ増員",
    text: "依頼が増えてきた。\nもう一頭アルパカを迎えた。",
    img: "img/story/rank11.png",
  },
  12: {
    title: "武具商会",
    text: "武具商会から\n共同出資の話が届いた。",
    img: "img/story/rank12.png",
  },
  13: {
    title: "交易船団",
    text: "港の交易船団が\n新しい商売を提案してきた。",
    img: "img/story/rank13.png",
  },
  14: {
    title: "大きなギルド",
    text: "街の人が\nこのギルドを頼りにしている。",
    img: "img/story/rank14.png",
  },
  15: {
    title: "魔導研究所",
    text: "魔導研究所から\n共同研究の誘いが届いた。",
    img: "img/story/rank15.png",
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
   Cat Images
   ========================= */

function getCatBaseImage(cat) {

  return cat.personality === "あまえんぼ"
    ? "img/cat2.png"
    : "img/cat.png";
}

function getTrainingImage(cat, frame = 1) {

  const isAmaenbo =
    cat?.personality === "あまえんぼ";

  if (frame === 2) {

    return isAmaenbo
      ? "img/jim2_cat2.png"
      : "img/jim2.png";
  }

  return isAmaenbo
    ? "img/jim1_cat2.png"
    : "img/jim1.png";
}

function getQuestCatImage(cat) {
  switch (cat.personality) {
    case "ツンデレ": return "img/cats/cat_tsundere.png";
    case "やんちゃ": return "img/cats/cat_yancha.png";
    case "クール": return "img/cats/cat_cool.png";
    case "あまえんぼ": return "img/cats/cat_amaenbo.png";
    default: return getCatBaseImage(cat);
  }
}

function getDisplayCatImage(cat) {

  const busy = isCatBusy(cat.id);

  if (busy === "quest")
    return getQuestCatImage(cat);

  if (busy === "training")
    return getTrainingImage(cat, 1);

  return getCatBaseImage(cat);
}

function getDetailCatImage(cat) {

  const busy = isCatBusy(cat.id);

  if (busy === "quest")
    return getQuestCatImage(cat);

  if (busy === "training")
    return getTrainingImage(cat, 1);

  return getCatBaseImage(cat);
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
  btnSettings: document.getElementById("btnSettings"),
   
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
  el.modalTitle.textContent = title || "";
  el.modalBody.innerHTML = html;

  const header = el.modal.querySelector(".modalHeader");
  if (header) {
    header.style.display = title ? "flex" : "none";
  }

  el.modalBackdrop.classList.remove("hidden");
  el.modal.classList.remove("hidden");
}
function closeModal() {
  el.modalBackdrop.classList.add("hidden");
  el.modal.classList.add("hidden");
  el.modalBody.innerHTML = "";

  const header = el.modal.querySelector(".modalHeader");
  if (header) {
    header.style.display = "flex";
  }
}
el.modalBackdrop?.addEventListener("click", closeModal);
el.modalClose?.addEventListener("click", closeModal);

function openRankStoryModal(rank, onDone) {
  const story = RANK_STORIES[rank];
  if (!story) {
    onDone?.();
    return;
  }

  const html = `
    <div class="storyWrap" id="storyWrapTap">
      <div class="storyStage">
        <img src="${story.img}" alt="" class="storyImage" />
        <div class="storyPaperCover" id="storyPaperCover"></div>
      </div>

      <div class="storyCaption">
        <div class="storyRank">Rank ${rank}</div>
        <div class="storyTitle">${escapeHtml(story.title)}</div>
        <div class="storyText">${escapeHtml(story.text)}</div>
        <div class="storyHint">タップでつづく</div>
      </div>
    </div>

    <div class="modalFooter">
      <button class="primary" id="storyNextBtn">つづく</button>
    </div>
  `;

  openModal("", html);

  const cover = document.getElementById("storyPaperCover");
  const nextBtn = document.getElementById("storyNextBtn");
  const storyWrapTap = document.getElementById("storyWrapTap");

  setTimeout(() => {
    cover?.classList.add("reveal");
  }, 60);

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    closeModal();
    onDone?.();
  };

  nextBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    finish();
  });

  storyWrapTap?.addEventListener("click", () => {
    finish();
  });
}

function openEndingModal() {
  let index = 1;

  const html = `
    <div class="endingWrap">
      <div class="endingFadeText" id="endingText">
        小さなギルドの物語を振り返ります
      </div>

      <img
        id="endingImage"
        class="endingImage"
        src="img/story/rank01.png"
        alt=""
      >

      <div class="modalFooter">
        <button class="primary" id="endingNext">つづける</button>
      </div>
    </div>
  `;

  openModal("", html);

  const img = document.getElementById("endingImage");
  const text = document.getElementById("endingText");
  const btn = document.getElementById("endingNext");

  btn?.addEventListener("click", () => {
    index++;

    if (index <= 15) {
      img.src = `img/story/rank${String(index).padStart(2, "0")}.png`;
      text.textContent = `Rank ${index}`;
      return;
    }

    showEndRoll();
  });
}

function showEndRoll() {
  const html = `
    <div class="endRollWrap">
      <div class="endRollText">
        <div class="endTitle">Cozy Cat Guild</div>
        <div>小さなギルドは、たくさんの出会いを重ねました。</div>
        <div>依頼と訓練の日々。</div>
        <div>帰ってくるネコたち。</div>
        <div>少しずつ賑やかになった部屋。</div>
        <div>そして今日も、ギルドは扉を開けます。</div>
        <div class="endTitle">The days continue...</div>
      </div>

      <div class="modalFooter">
        <button class="primary" id="endingDone">これからも続ける</button>
      </div>
    </div>
  `;

  openModal("", html);

  document.getElementById("endingDone")?.addEventListener("click", () => {
    state.endingSeen = true;
    state.postGame = true;

    save();
    closeModal();
    renderAll();

    pushLog("エンディングを見届けた。今日もギルドは続いていく。");
  });
}

function getGuildBg() {
  const bgRank = state.postGame
    ? 1
    : Math.min(state.guildRank, 15);

  return `img/guild/guild_rank_${String(bgRank).padStart(2, "0")}.png`;
}

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

function compressCats(cats) {
  return cats.map(c => ({
    i: c.id,
    n: c.name,
    l: c.level,
    e: c.exp,
    p: c.personality,
    s: [c.str, c.spd, c.int],
    h: c.hue
  }));
}
function decompressCats(cats) {
  return cats.map(c => ({
    id: c.i,
    name: c.n,
    level: c.l,
    exp: c.e,
    personality: c.p,
    str: c.s[0],
    spd: c.s[1],
    int: c.s[2],
    hue: c.h
  }));
}
function exportSaveCode() {
  save();

  const saveData = {
  guildName: state.guildName,
  guildRank: state.guildRank,
  gold: state.gold,

  cats: compressCats(state.cats),
  favoriteCatId: state.favoriteCatId,

  items: state.items,

  questJobs: state.questJobs,
  trainingSlots: state.trainingSlots,
  trainingJobs: state.trainingJobs,

  alpaca: state.alpaca,
  invest: state.invest,

  questOffers: null,
     
  dailyBonus: state.dailyBonus,
  adReward: state.adReward,
  bgUnlocks: state.bgUnlocks,

  hire: state.hire,
     
  tutorialDone: state.tutorialDone,
  tutorialStage: state.tutorialStage,

  endingSeen: state.endingSeen,
  postGame: state.postGame,

  // ログは復元時に空でOK
  logs: []
};

  const json =
    JSON.stringify(saveData);

  const compressed =
    pako.deflate(json);

  let binary = "";

  compressed.forEach(b => {
    binary += String.fromCharCode(b);
  });

  return btoa(binary);
}

function importSaveCode(code) {

  const binary =
    atob(code.trim());

  const bytes =
    Uint8Array.from(binary, c => c.charCodeAt(0));

  const json =
    pako.inflate(bytes, { to: "string" });

  const data =
    JSON.parse(json);

  if (!data || typeof data !== "object") {
    throw new Error("invalid save data");
  }
  if (data.cats) {
  data.cats =
    decompressCats(data.cats);
}
  if (
  !data.questOffers ||
  Array.isArray(data.questOffers) ||
  typeof data.questOffers !== "object"
) {
  data.questOffers = null;
}
  if (!data.favoriteCatId) {
  data.favoriteCatId = null;
}
  Object.assign(state, data);

  ensureQuestOffers();
if (!state.questOffers) {
  rollQuestOffers();
}
  save();
  renderAll();
}
function exportHelperCode() {
  const cat = state.cats.find(c => c.id === state.favoriteCatId);

  if (!cat) {
    throw new Error("no favorite cat");
  }

  const helper = {
    g: state.guildId,

    n: cat.name,
    l: cat.level,
    p: cat.personality,

    s: cat.str,
    d: cat.spd,
    i: cat.int,

    h: cat.hue,
  };

  return btoa(
    encodeURIComponent(
      JSON.stringify(helper)
    )
  );
}

function importHelperCode(code) {
  const json = decodeURIComponent(atob(code.trim()));
  const h = JSON.parse(json);

  if (h.g === state.guildId) {
    throw new Error("own helper");
  }

  if (!Array.isArray(state.helpers)) {
    state.helpers = [];
  }

  if (state.helpers.length >= getHelperMax()) {
    throw new Error("helper full");
  }
  const helper = {
    id: uid(),
    sourceGuildId: h.g,

    name: h.n,
    level: h.l,
    personality: h.p,

    str: h.s,
    spd: h.d,
    int: h.i,

    hue: h.h,
    };

    state.helpers.push(helper);

    registerCatDex(helper);

  save();
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

　showToast(text);
   
  save();
}
function showToast(text) {
  const toast = document.createElement("div");

  toast.textContent = text;
  toast.style.cssText = `
    position:fixed;
    left:50%;
    bottom:24px;
    transform:translateX(-50%);
    z-index:9999;
    max-width:calc(100% - 32px);
    background:#202838;
    color:#fff;
    border:1px solid #3a465c;
    border-radius:999px;
    padding:10px 14px;
    font-weight:800;
    font-size:14px;
    box-shadow:0 8px 24px rgba(0,0,0,.35);
    text-align:center;
  `;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 2200);
}
function renderLogs() {
  const open = !el.logPanel?.classList.contains("hidden");
  if (!el.logUnreadPill) return;

  el.logUnreadPill.textContent = String(logUnread);
  el.logUnreadPill.style.display = logUnread > 0 ? "inline-block" : "none";
  if (!open) return;

  const items = (state.logs || []).slice(0, 40).map((x) => {
    return `<div class="logItem"><span class="logTime">${x.t}</span>${escapeHtml(x.text)}</div>`;
  }).join("");
  if (el.logPanel) el.logPanel.innerHTML = items || `<div class="dim">ログはまだありません</div>`;
}
el.logHeader?.addEventListener("click", () => {
  if (!el.logPanel || !el.logChevron) return;
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
function addItem(itemId, amount = 1) {
  if (!state.items[itemId]) {
    state.items[itemId] = 0;
  }

  const master = ITEM_MASTER[itemId];
  const max = master?.stackMax ?? 99;

  state.items[itemId] = Math.min(
    max,
    state.items[itemId] + amount
  );

  pushLog(`${master.icon} ${master.name} を${amount}個手に入れた`);
}

function consumeItem(itemId, amount = 1) {
  if ((state.items[itemId] || 0) < amount) {
    return false;
  }

  state.items[itemId] -= amount;
  return true;
}
function clamp(min, max, v) {
  return Math.max(min, Math.min(max, v));
}
function formatRemain(ms) {
  const sec = Math.floor(ms / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
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
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[c]));
}
function escapeAttr(s) { return escapeHtml(s).replace(/"/g, "&quot;"); }
function dateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}
function daysBetween(aKey, bKey) {
  const a = new Date(aKey + "T00:00:00");
  const b = new Date(bKey + "T00:00:00");
  const ms = b - a;
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}
function totalPower() {
  return (state.cats || []).reduce((sum, c) => sum + c.str + c.spd + c.int, 0);
}
function catById(id) {
  return (state.cats || []).find(c => c.id === id);
}
function randomName() {
  const names = ["モモ", "ハル", "ルナ", "コハク", "ソラ", "ミント", "サクラ", "マロン", "ユズ", "コテツ"];
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

function todayKey() {

  const now = new Date();

  return `${now.getFullYear()}-${
    now.getMonth() + 1
  }-${
    now.getDate()
  }`;
}

function ensureAdState() {

  state.adReward ??= {
    date: todayKey(),
    count: 0
  };

  if (state.adReward.date !== todayKey()) {
    state.adReward.date = todayKey();
    state.adReward.count = 0;
  }
}

function ensureHelperDailyUse() {

  state.helperDailyUse ??= {
    date: todayKey(),
    count: 0
  };

  if (
    state.helperDailyUse.date !== todayKey()
  ) {

    state.helperDailyUse.date =
      todayKey();

    state.helperDailyUse.count = 0;
  }

}
function ensureHelperAdBonus() {
  state.helperAdBonus ??= {
    date: todayKey(),
    count: 0
  };

  if (state.helperAdBonus.date !== todayKey()) {
    state.helperAdBonus.date = todayKey();
    state.helperAdBonus.count = 0;
  }
}
function getHelperUseLimit() {
  ensureHelperDailyUse();
  ensureHelperAdBonus();

  return getHelperMax() + state.helperAdBonus.count;
}

function getHelperUseLeft() {
  return Math.max(
    0,
    getHelperUseLimit() - state.helperDailyUse.count
  );
}
function watchMatatabiAd() {

  ensureAdState();

  if (state.adReward.count >= AD_REWARD.DAILY_LIMIT) {
    pushLog("今日の支援物資は受け取り済みにゃ");
    renderAll();
    save();
    return;
  }

  openModal(
    "ギルド協会からのお知らせ",
    `
      <div style="display:flex;flex-direction:column;gap:12px;">
        <img
          src="img/ads/ad_matatabi_farm.png"
          class="fakeAdImg"
          alt=""
        >

        <div class="dim" style="text-align:center;">
          支援物資を受け取っています...
        </div>
      </div>
    `
  );

  setTimeout(() => {

    closeModal();

    ensureAdState();

    if (state.adReward.count >= AD_REWARD.DAILY_LIMIT) {
      pushLog("今日の支援物資は受け取り済みにゃ");
      renderAll();
      save();
      return;
    }

    state.adReward.count++;

    state.items ??= {};
    state.items.matatabi =
      (state.items.matatabi || 0) + 1;

    // ←ここ重要
    save();

    pushLog("🎁 支援物資でマタタビを1個受け取った");

    renderAll();

  }, AD_REWARD.WAIT_MS);
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

function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function canClaimDailyBonus() {

  ensureDailyBonus();

  if (DEV_DAILY_BONUS) {
    return true;
  }

  return (
    state.dailyBonus.lastClaimDate !==
    dateKey(new Date())
  );
}

function getNextDailyDay() {
  ensureDailyBonus();
  return (state.dailyBonus.day % 7) + 1;
}

function unlockNextDailySpecial() {
  ensureDailyBonus();

  const unlockLine = state.dailyBonus.week % 2 === 0;

  if (unlockLine && state.bgUnlocks.lineIds.length < BG_UNLOCK_LINES.length) {
    const id = String(state.bgUnlocks.lineIds.length);
    state.bgUnlocks.lineIds.push(id);

    return {
      type: "line",
      text: BG_UNLOCK_LINES[Number(id)],
    };
  }

  if (state.bgUnlocks.motionIds.length < BG_UNLOCK_MOTIONS.length) {
    const motion = BG_UNLOCK_MOTIONS[state.bgUnlocks.motionIds.length];
    state.bgUnlocks.motionIds.push(motion.id);

    return {
      type: "motion",
      text: motion.name,
    };
  }

  return {
    type: "gold",
    text: "追加報酬",
  };
}

function openDailyBonusModal() {
  const day = getNextDailyDay();

  let title = `ログインボーナス ${day}日目`;
  let body = "";
  let rewardAction = null;

  if (DAILY_BONUS.GOLD_TABLE[day]) {
    const [min, max] = DAILY_BONUS.GOLD_TABLE[day];
    const gold = state.guildRank * randInt(min, max);

    body = `
      <div class="panelCard">
        <div style="font-size:18px;font-weight:900;">💰 ギルド支援金</div>
        <div class="dim" style="margin-top:8px;">
          ${gold.toLocaleString()}G を受け取れます
        </div>
      </div>
    `;

    rewardAction = () => {
      state.gold += gold;
      pushLog(`🎁 ログインボーナス：${gold.toLocaleString()}G`);
    };
  }

  if (day === 3 || day === 6) {
    body = `
      <div class="panelCard">
        <div style="font-size:18px;font-weight:900;">🌿 マタタビ</div>
        <div class="dim" style="margin-top:8px;">
          マタタビを1個受け取れます
        </div>
      </div>
    `;

    rewardAction = () => {
      state.items ??= {};
      state.items.matatabi = (state.items.matatabi || 0) + 1;
      pushLog("🎁 ログインボーナス：マタタビを1個受け取った");
    };
  }

  if (day === 7) {
  body = `
    <div class="panelCard dailySpecialCard">
      <div class="dailySparkles">✨ ✨ ✨</div>

      <div style="position:relative;z-index:1;">
        <div style="font-size:18px;font-weight:900;">✨ 新しい日常</div>
        <div class="dim" style="margin-top:8px;">
          新しいセリフ、または新しいモーションを解放できます
        </div>
      </div>
    </div>
  `;

  rewardAction = () => {
    const special = unlockNextDailySpecial();
    pushLog(`✨ ログインボーナス：${special.text} を解放`);
  };
}

  const html = `
    ${body}
    <div class="modalFooter">
      <button class="primary" id="dailyBonusClaim">受け取る</button>
    </div>
  `;

  openModal(title, html);

  document.getElementById("dailyBonusClaim")?.addEventListener("click", () => {
    rewardAction?.();

    state.dailyBonus.lastClaimDate = dateKey(new Date());
    state.dailyBonus.day = day;

    if (day === 7) {
      state.dailyBonus.week++;
    }

    save();
    renderAll();
    closeModal();
  });
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
  // 余分があれば切る（ランクダウンはないが保険）
  state.trainingSlots = state.trainingSlots.slice(0, slotCount);
  state.trainingJobs = state.trainingJobs.slice(0, slotCount);
}
function ensureDailyBonus() {
  if (!state.dailyBonus) {
    state.dailyBonus = {
      lastClaimDate: null,
      day: 0,
      week: 0,
    };
  }

  if (!state.bgUnlocks) {
    state.bgUnlocks = {
      motionIds: [],
      lineIds: [],
    };
  }

  if (!Array.isArray(state.bgUnlocks.motionIds)) state.bgUnlocks.motionIds = [];
  if (!Array.isArray(state.bgUnlocks.lineIds)) state.bgUnlocks.lineIds = [];
}
function ensureCatDex() {
  state.catDex ??= {
    normal: [],
    event: [],
  };

  if (!Array.isArray(state.catDex.normal)) {
    state.catDex.normal = [];
  }

  if (!Array.isArray(state.catDex.event)) {
    state.catDex.event = [];
  }
}

function registerCatDex(cat) {
  ensureCatDex();

  const key = cat.official
    ? `${cat.eventId || cat.name}`
    : `${cat.personality}_${cat.hue}`;

  const list = cat.official
    ? state.catDex.event
    : state.catDex.normal;

  if (list.some(x => x.key === key)) return;

  list.push({
    key,
    name: cat.name,
    personality: cat.personality,
    hue: cat.hue || 0,
    image: cat.eventImage || getQuestCatImage(cat),
    event: !!cat.official,
  });
}
function ensureItems() {
  if (!state.items) state.items = {};

  if (typeof state.items.matatabi !== "number") {
    state.items.matatabi = 0;
  }
}
function ensureQuestState() {
  const slots = getDispatchSlots();
  if (!Array.isArray(state.questJobs)) state.questJobs = [];
  while (state.questJobs.length < slots) state.questJobs.push(null);
  state.questJobs = state.questJobs.slice(0, slots);
}
function ensureQuestOffers() {
  if (!("questOffers" in state)) state.questOffers = null;
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
}
function ensureInvest() {
  if (!state.invest) {
    state.invest = {
      holdings: { insure: 0, arms: 0, trade: 0, magic: 0 },
      lastDividendDay: null,
    };
  }
  if (!state.invest.holdings) state.invest.holdings = { insure: 0, arms: 0, trade: 0, magic: 0 };
}
function ensureAlpaca() {
  if (!state.alpaca) {
    state.alpaca = {
      owned: 1,
      boughtAt6: false,
      boughtAt11: false,
    };
  }
  if (typeof state.alpaca.owned !== "number") state.alpaca.owned = 1;
  if (typeof state.alpaca.boughtAt6 !== "boolean") state.alpaca.boughtAt6 = false;
  if (typeof state.alpaca.boughtAt11 !== "boolean") state.alpaca.boughtAt11 = false;
}

function getDispatchSlots() {
  ensureAlpaca();
  return Math.max(1, state.alpaca.owned || 1);
}

function getAvailableAlpacaPurchase() {
  ensureAlpaca();

  if (state.guildRank >= 6 && !state.alpaca.boughtAt6) {
  return {
    stage: 6,
    cost: 50000,
    label: "アルパカを迎える",
    desc: "派遣できる数が1つ増えます",
  };
}

if (state.guildRank >= 11 && !state.alpaca.boughtAt11) {
  return {
    stage: 11,
    cost: 150000,
    label: "2頭目のアルパカを迎える",
    desc: "派遣枠が1つ増えます",
  };
}

  return null;
}

function buyAlpaca(stage) {
  ensureAlpaca();

  if (stage === 6) {
    const cost = 50000;
    if (state.guildRank < 6 || state.alpaca.boughtAt6) return;

    if (state.gold < cost) {
      pushLog(`Gold不足：アルパカ購入に ${cost.toLocaleString()}G 必要`);
      return;
    }

    state.gold -= cost;
    state.alpaca.boughtAt6 = true;
    state.alpaca.owned = 2;

    ensureQuestState();
    pushLog("🦙 アルパカを迎えた！派遣枠が1つ増えた");
    renderAll();
    save();
    return;
  }

  if (stage === 11) {
    const cost = 150000;
    if (state.guildRank < 11 || state.alpaca.boughtAt11) return;

    if (state.gold < cost) {
      pushLog(`Gold不足：アルパカ購入に ${cost.toLocaleString()}G 必要`);
      return;
    }

    state.gold -= cost;
    state.alpaca.boughtAt11 = true;
    state.alpaca.owned = 3;

    ensureQuestState();
    pushLog("🦙 2頭目のアルパカを迎えた！派遣枠が1つ増えた");
    renderAll();
    save();
  }
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
  let str = base, spd = base, intv = base;

  const g = LEVEL.gain3(personality);
  const initBoost = (x) => (x >= 2 ? 1 : 0);
  str += initBoost(g.str);
  spd += initBoost(g.spd);
  intv += initBoost(g.int);

  return {
    id: uid(),
    name,
    personality,
    level: 1,
    exp: 0,
    str,
    spd,
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
    cat.spd += g.spd;
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
    guildId: uid(),
    tutorialDone: false,
    tutorialStage: 0,

    cats: [],
    favoriteCatId: null,
    helpers: [],

    helperListOpen: false,
    helperAdBonus: {
      date: todayKey(),
      count: 0
    },
     
    helperSlotBonus: 0,

    helperDailyUse: {
      date: todayKey(),
      count: 0
    },

    logs: [],
    pendingResults: [],

    items: {
      matatabi: 0,
    },

    hire: { candidates: [], lastRefreshAt: 0 },

    questJobs: [],
    trainingSlots: [],
    trainingJobs: [],

    alpaca: {
      owned: 1,          // 初期1頭 = 派遣枠1
      boughtAt6: false,  // Rank6解放分を買ったか
      boughtAt11: false, // Rank11解放分を買ったか
    },

    invest: {
      holdings: { insure: 0, arms: 0, trade: 0, magic: 0 },
      lastDividendDay: null,
    },

    questOffers: null,

    dailyBonus: {
      lastClaimDate: null,
      day: 0,
      week: 0,
    },

    bgUnlocks: {
      motionIds: [],
      lineIds: [],
    },

    endingSeen: false,
    postGame: false,
  };
}

/* =========================
   UI Bindings
   ========================= */
function openResetModal() {
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

  document.getElementById("resetCancel")?.addEventListener("click", closeModal);

  input?.addEventListener("input", () => {
    confirmBtn.disabled =
  input.value.trim().toUpperCase() !== "RESET";
  });

  confirmBtn?.addEventListener("click", () => {
    localStorage.removeItem(LS_SAVE);
    closeModal();
    location.reload();
  });
}
function bindUI() {
  el.btnStart?.addEventListener("click", () => {
    openMain();
    if (!state.tutorialDone) startTutorialFlow();
  });

  el.btnContinue?.addEventListener("click", () => {
    openMain();
    if (!state.tutorialDone) startTutorialFlow();
  });

  el.btnNew?.addEventListener("click", () => {
     openResetModal(); 
     // 既存の新規開始処理
  });

  el.btnGuildName?.addEventListener("click", () => openGuildRenameModal());

  el.btnSettings?.addEventListener("click", () => {
    openSettingsModal();
  });

  el.btnRankUp?.addEventListener("click", () => doRankUp());
  el.btnCollectAll?.addEventListener("click", () => collectAll());

  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      if (tab === "invest" && !RANK.canInvest(state.guildRank)) return;
      switchTab(tab);
    });
  });
}
   

function boot() {
  state = load() || newGame();

  state.helpers = (state.helpers || []).filter(h => {
  if (!h.official) return true;
  if (!h.endDate) return true;

  return Date.now() <=
    new Date(h.endDate + "T23:59:59").getTime();
});
   
  if (typeof state.guildRank !== "number") state.guildRank = 1;
  if (typeof state.gold !== "number") state.gold = 0;
  if (!Array.isArray(state.cats)) state.cats = [];
  if (typeof state.guildName !== "string") state.guildName = "Cozy Cat Guild";
  if (!state.guildId)
  state.guildId = uid();
  if (!state.favoriteCatId)
  state.favoriteCatId = null;
   
  if (typeof state.endingSeen !== "boolean") state.endingSeen = false;
  if (typeof state.postGame !== "boolean") state.postGame = false;
   
  ensureQuestState();
  ensureTrainingState();
  ensurePending();
  ensureHire();
  ensureTutorial();
  ensureInvest();
  ensureAlpaca();
  ensureItems();
  ensureQuestOffers();

  const tips = ["やる気はあるにゃ。", "急がば回れ、にゃ。", "訓練は裏切らないにゃ。", "Goldは正義にゃ。"];
  if (el.dailyTip) el.dailyTip.textContent = tips[Math.floor(Math.random() * tips.length)];

  bindUI();
  showStartScreen();

  maybeGenerateDividendsOnLogin();
  applyEventHelpers();
  renderAll();

  setInterval(tick, 1000);
  setInterval(toggleDumbbells, 500);

}

/* =========================
   Start Screen
   ========================= */
function showStartScreen() {
  const hasSave = !!localStorage.getItem(LS_SAVE);
  el.startScreen?.classList.remove("hidden");
  el.mainScreen?.classList.add("hidden");

  const meta = [];
  if (hasSave) meta.push(`Rank ${state.guildRank}`);
  if (hasSave) meta.push(`Gold ${state.gold.toLocaleString()}G`);
  if (state.tutorialDone) meta.push(`ギルド「${state.guildName}」`);
  if (el.startMeta) el.startMeta.textContent = meta.join(" / ");

  el.btnContinue?.classList.toggle("hidden", !hasSave);
  el.btnNew?.classList.toggle("hidden", !hasSave);
}

/* =========================
   Main open
   ========================= */
function openMain() {
  el.startScreen?.classList.add("hidden");
  el.mainScreen?.classList.remove("hidden");
  renderAll();

  if (state.tutorialDone && canClaimDailyBonus()) {
    setTimeout(() => {
      openDailyBonusModal();
    }, 300);
  }
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

  document.getElementById("tutClose")?.addEventListener("click", closeModal);

  const setEnabled = (ok) => {
    btnStart.style.opacity = ok ? "1" : "0.5";
  };

  const update = () => {
    const v = input.value.trim();
    setEnabled(v.length > 0);
  };

  ["input", "change", "keyup", "blur"].forEach(ev => input.addEventListener(ev, update));
  update();

  const go = () => {
    const v = input.value.trim();
    if (!v) return;
    state.guildName = v;
    openTutorialScoutModal();
  };

  btnStart.addEventListener("click", go);
  btnScout.addEventListener("click", go);

  setTimeout(() => input.focus(), 50);
}

function generateCandidates(isTutorial = false) {
  const personalities = ["あまえんぼ", "ツンデレ", "クール", "やんちゃ"];
  const names = ["ミケ", "タマ", "モモ", "コテツ", "マロン", "ユズ", "コハク", "ルナ", "ソラ", "ハル","ちくわ","モカ","ココ","かにかま","きなこ"];

  const list = [];
  for (let i = 0; i < 3; i++) {
    const p = personalities[Math.floor(Math.random() * personalities.length)];
    const nm = names[Math.floor(Math.random() * names.length)] + (Math.random() < 0.35 ? String(Math.floor(Math.random() * 9) + 1) : "");
    list.push(makeCat(p, nm));
  }

  if (isTutorial) {
    const set = new Set(list.map(x => x.personality));
    if (set.size <= 1) return generateCandidates(true);
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
  return `
    <div class="modalItem" data-pick="${c.id}">
      <div style="display:flex;gap:10px;align-items:center;">
        <div style="width:56px;height:56px;position:relative;flex:0 0 56px;">
          <img src="${getCatBaseImage(c)}" class="catSprite colorized"
            style="--hue:${c.hue}deg;width:56px;height:56px;image-rendering:pixelated;" />
        </div>
        <div style="min-width:0;">
          <b>${escapeHtml(c.name)}</b> <span class="dim">Lv${c.level}</span>
          <div class="dim">${escapeHtml(c.personality)} / STR ${c.str} SPD ${c.spd} INT ${c.int}</div>
        </div>
      </div>
    </div>
  `;
}).join("")}
      </div>
    </div>

    <div class="modalFooter">
      <button class="ghost" id="tutBack">戻る</button>
      <button class="primary" id="tutPickConfirm" disabled>この子にする</button>
    </div>
  `;

  openModal("スカウト（無料）", html);

  document.getElementById("tutBack")?.addEventListener("click", () => {
    closeModal();
    startTutorialFlow();
  });

  let selectedId = null;

  const items = document.querySelectorAll("[data-pick]");
  const confirmBtn = document.getElementById("tutPickConfirm");

  items.forEach(item => {
    item.addEventListener("click", () => {
      selectedId = item.dataset.pick;

      items.forEach(x => x.style.outline = "");
      item.style.outline = "2px solid var(--blue)";

      if (confirmBtn) confirmBtn.disabled = false;
    });
  });

  confirmBtn?.addEventListener("click", () => {
    if (!selectedId) return;
    const picked = candidates.find(c => c.id === selectedId);
    if (picked) finishTutorialCats(picked);
  });
}

function finishTutorialCats(firstCat) {
  closeModal();

  if ((state.cats || []).length > 0) {
    // すでに猫がいるなら、チュート完了扱いにして暴走防止
    state.tutorialDone = true;
    state.tutorialStage = 5;
    save();
    return;
  }

  state.cats.push(firstCat);
  registerCatDex(firstCat);

  const personalities = ["あまえんぼ", "ツンデレ", "クール", "やんちゃ"];
  const remain = personalities.filter(p => p !== firstCat.personality);
  shuffleArray(remain);

  const extra1 = makeCat(remain[0], randomName());
  const extra2 = makeCat(remain[1], randomName());
  state.cats.push(extra1, extra2);
  registerCatDex(extra1);
  registerCatDex(extra2);

  state.tutorialStage = 1;

  pushLog(`ギルド「${state.guildName}」設立！`);
  pushLog(`${firstCat.name} が最初の仲間に！`);
  pushLog(`${extra1.name} が合流！`);
  pushLog(`${extra2.name} が合流！`);

  save();
  renderAll();

  openRankStoryModal(1, () => {
    openTutorialQuestFlowExplain();
  });
}

function openTutorialTrainingIntro() {
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

  document.getElementById("ttSkip")?.addEventListener("click", () => {
    closeModal();
    done();
    openTutorialQuestFlowExplain();
  });

  document.getElementById("ttGo")?.addEventListener("click", () => {
    closeModal();
    done();
    switchTab("training");
    openTutorialQuestFlowExplain(true);
  });
}

function openTutorialTrainingIntroAfterRankUp() {
  const html = `
    <div class="panelCard">
      <div><b>🏋 訓練もできるようになった</b></div>
      <div class="dim" style="margin-top:6px; line-height:1.6;">
        ネコたちは訓練で少しずつ成長します。<br>
        強くなると、難しい依頼にも挑みやすくなります。<br>
        ただし <b>訓練中はクエストに出せません</b>。
      </div>
    </div>

    <div class="panelCard" style="margin-top:10px;">
      <div class="dim">
        次は、訓練タブも試してみよう。<br>
        ここからは自由に遊べます。
      </div>
    </div>

    <div class="modalFooter">
      <button class="ghost" id="ttaQuest">クエストへ</button>
      <button class="primary" id="ttaTraining">訓練へ</button>
    </div>
  `;

  openModal("チュートリアル完了", html);

  document.getElementById("ttaQuest")?.addEventListener("click", () => {
    state.tutorialDone = true;
    pushLog("チュートリアル完了！");
    closeModal();
    switchTab("quest");
    renderAll();
    save();
  });

  document.getElementById("ttaTraining")?.addEventListener("click", () => {
    state.tutorialDone = true;
    pushLog("チュートリアル完了！");
    closeModal();
    switchTab("training");
    renderAll();
    save();
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

  document.getElementById("tqLater")?.addEventListener("click", closeModal);
  document.getElementById("tqGo")?.addEventListener("click", () => {
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

  const fixedLv = 1;
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

  document.getElementById("qCancel")?.addEventListener("click", closeModal);

  const selected = new Set();

  partyList.innerHTML = idle.map(c => `
    <div class="modalItem" data-cat="${c.id}">
      <b>${escapeHtml(c.name)}</b> Lv${c.level}
      <div class="dim">${escapeHtml(c.personality)} / STR ${c.str} SPD ${c.spd} INT ${c.int}</div>
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
    timeType: "S",
    durationMin: 1,
    baseGold: 2000000000,
    target: 0,
  };

  state.questJobs[slotIdx] = {
    slotNo: slotIdx + 1,
    def: tutDef,
    partyIds,
    pSuccess: 100,
    goldMult: 1.0,
    startAt: now,
    endAt,
    tutorial: true,
  };

  state.tutorialStage = Math.max(state.tutorialStage, 3);
  pushLog(`チュートリアルクエスト開始（1分 / 確定成功）`);
  renderAll();
  save();
}
function openSettingsModal() {
  const html = `
    <div class="panelCard">
      <div style="font-size:16px;font-weight:900;">☁ 自動保存済み</div>
      <div class="dim" style="margin-top:6px;">
        ゲームは自動で保存されています。<br>
        念のため、バックアップコード機能も今後追加予定です。
      </div>
    </div>

    <div class="panelCard" style="margin-top:10px;">
      <div><b>バックアップ</b></div>
      <div class="dim" style="margin-top:6px;">
        セーブコード発行・読込は次の段階で追加します。
      </div>

      <div class="row" style="margin-top:10px;">
        <button class="ghost smallBtn" id="btnExportSave">
          セーブコード発行
        </button>
        <button class="ghost smallBtn" id="btnImportSave">
          セーブコード読込
        </button>
      </div>
    </div>

    <div class="panelCard" style="margin-top:10px;">
      <div><b>その他</b></div>
      <div class="dim" style="margin-top:6px;">
        Version 0.6
      </div>

      <button class="ghost smallBtn" id="btnSettingsReset" style="margin-top:10px;">
        データリセット
      </button>
    </div>

    <div class="modalFooter">
      <button class="primary" id="settingsClose">閉じる</button>
    </div>
  `;

  openModal("設定", html);

  document.getElementById("settingsClose")
    ?.addEventListener("click", closeModal);

  document.getElementById("btnSettingsReset")
    ?.addEventListener("click", () => {
      closeModal();
      openResetModal();
    });
  document.getElementById("btnExportSave")
  ?.addEventListener("click", () => {
    const code = exportSaveCode();

    openModal("セーブコード発行", `
      <div class="panelCard">
        <div class="dim">
          このコードをメモ帳などに保存してください。
        </div>
        <textarea readonly
          style="width:100%;height:180px;margin-top:10px;padding:10px;border-radius:10px;border:1px solid #232a36;background:#10141b;color:#e9ecf1;">${code}</textarea>
      </div>

      <div class="modalFooter">
        <button class="primary" id="saveCodeClose">閉じる</button>
      </div>
    `);

    document.getElementById("saveCodeClose")
      ?.addEventListener("click", closeModal);
  });

document.getElementById("btnImportSave")
  ?.addEventListener("click", () => {
    openModal("セーブコード読込", `
      <div class="panelCard">
        <div class="dim">
          保存しておいたセーブコードを貼り付けてください。
        </div>
        <textarea id="importSaveCodeInput"
          style="width:100%;height:180px;margin-top:10px;padding:10px;border-radius:10px;border:1px solid #232a36;background:#10141b;color:#e9ecf1;"></textarea>
      </div>

      <div class="modalFooter">
        <button class="ghost" id="importCancel">キャンセル</button>
        <button class="primary" id="importConfirm">読込</button>
      </div>
    `);

    document.getElementById("importCancel")
      ?.addEventListener("click", closeModal);

    document.getElementById("importConfirm")
      ?.addEventListener("click", () => {
        try {
          const code = document.getElementById("importSaveCodeInput")?.value || "";
          importSaveCode(code);

          closeModal();
          pushLog("セーブコードから復元したにゃ");
          renderAll();

        } catch (e) {
          pushLog("セーブコードの読込に失敗したにゃ");
        }
      });
  });
}

function openHelperGuideModal() {
  const html = `
    <div class="panelCard">
      <div><b>🤝 助っ人とは？</b></div>
      <div class="dim" style="margin-top:8px;line-height:1.7;">
        他のギルドのネコを、クエストに1匹だけ連れていける機能です。<br>
        助っ人は成功率に加算されます。
      </div>
    </div>

    <div class="panelCard" style="margin-top:10px;">
      <div><b>使い方</b></div>
      <div class="dim" style="margin-top:8px;line-height:1.7;">
        ① ネコ詳細で「助っ人登録」する<br>
        ② クエスト画面で「助っ人コード発行」する<br>
        ③ 受け取ったコードを「助っ人コード読込」で登録する<br>
        ④ クエスト受注時に助っ人を選ぶ
      </div>
    </div>

    <div class="panelCard" style="margin-top:10px;">
      <div><b>ルール</b></div>
      <div class="dim" style="margin-top:8px;line-height:1.7;">
        ・助っ人は1クエスト1匹まで<br>
        ・同じ助っ人は1日1回まで使用できます<br>
        ・通常助っ人は削除できます<br>
        ・イベント助っ人は削除できません
      </div>
    </div>

    <div class="modalFooter">
      <button class="primary" id="helperGuideClose">OK</button>
    </div>
  `;

  openModal("助っ人ガイド", html);

  document.getElementById("helperGuideClose")
    ?.addEventListener("click", closeModal);
}

function applyEventHelpers() {
  state.helpers ??= [];
  state.eventHelperClaims ??= {};

  // 初心者混乱防止：イベント助っ人はRank2以降に配布
  if (!state.tutorialDone || state.guildRank < 2) {
    return;
  }

  const now = Date.now();

  // 以下そのまま

  state.helpers = state.helpers.filter(h => {
    if (!h.official) return true;
    if (!h.endDate) return true;

    const end =
      new Date(h.endDate + "T23:59:59").getTime();

    return now <= end;
  });

  for (const event of EVENT_HELPERS) {
    const start =
      new Date(event.startDate + "T00:00:00").getTime();

    const end =
      new Date(event.endDate + "T23:59:59").getTime();

    if (now < start || now > end) continue;

    if (state.eventHelperClaims[event.eventId]) continue;

    const helper = {
      id: uid(),
      official: true,
      ...event,
    };

    state.helpers.push(helper);
    registerCatDex(helper);
    state.eventHelperClaims[event.eventId] = true;

    pushLog(`${helper.name} がイベント助っ人としてやってきたにゃ`);

    openEventHelperGiftModal(helper);
  }

  save();
}

function openEventHelperGiftModal(helper) {
  const html = `
    <div class="panelCard" style="text-align:center;">

      <div style="font-size:18px;font-weight:900;">
        🎁 期間限定助っ人！
      </div>

      <img
        src="${helper.eventImage || getQuestCatImage(helper)}"
        alt=""
        style="
          width:160px;
          margin-top:12px;
          image-rendering:pixelated;
        "
      >

      <div style="margin-top:10px;font-size:18px;font-weight:900;">
        ${escapeHtml(helper.name)} がやってきた！
      </div>

      <div class="dim" style="margin-top:6px;">
        開催期間：${helper.startDate} ～ ${helper.endDate}
      </div>

    </div>

    <div class="modalFooter">
      <button class="primary" id="eventHelperGiftClose">OK</button>
    </div>
  `;

  openModal("イベント助っ人", html);

  document.getElementById("eventHelperGiftClose")
    ?.addEventListener("click", closeModal);
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

  document.getElementById("rgCancel")?.addEventListener("click", closeModal);
  document.getElementById("rgOk")?.addEventListener("click", () => {
    const v = document.getElementById("renameGuildInput")?.value?.trim() || "";
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

  burstConfetti();

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

  const shouldShowTrainingIntro =
    !state.tutorialDone &&
    state.tutorialStage >= 4 &&
    state.guildRank >= 2;

  if (shouldShowTrainingIntro) {
    state.tutorialStage = 5;
  }

  renderAll();
  save();

  if (now.rank === 16 && !state.endingSeen) {
  openEndingModal();
  return;
}

openRankStoryModal(now.rank, () => {
  openRankUpPopup(prev, now, () => {
    if (!state.tutorialDone && state.tutorialStage >= 5 && state.guildRank >= 2) {
      openTutorialTrainingIntroAfterRankUp();
    }
  });
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
function openRankUpPopup(prev, now, onDone) {
  const changes = [];
  if (now.mult !== prev.mult) changes.push(`Gold倍率：×${prev.mult.toFixed(1)} → ×${now.mult.toFixed(1)}`);
  if (now.hs !== prev.hs) changes.push(`🐾 雇用枠：${prev.hs} → ${now.hs}`);
  if (now.ts !== prev.ts) changes.push(`🏋 訓練枠：${prev.ts} → ${now.ts}`);
  if (now.maxQL !== prev.maxQL) changes.push(`📜 クエストLv：${prev.maxQL} → ${now.maxQL}`);
  if (!prev.invest && now.invest) changes.push(`📈 投資タブ解禁！`);

  if (now.rank === 6) changes.push(`🦙 アルパカ購入解放！`);
  if (now.rank === 11) changes.push(`🦙 2頭目のアルパカ購入解放！`);
  if (now.rank === 10) changes.push(`🐟 さかな組合への出資が解放！`);
  if (now.rank === 12) changes.push(`🗡 武具商会への出資が解放！`);
  if (now.rank === 13) changes.push(`🚢 交易船団への出資が解放！`);
  if (now.rank === 15) changes.push(`🔮 魔導研究所への出資が解放！`);

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

  document.getElementById("ruClose")?.addEventListener("click", () => {
    closeModal();
    onDone?.();
  });

  document.getElementById("ruGo")?.addEventListener("click", () => {
    closeModal();
    switchTab(rec.tab);
    onDone?.();
  });
}

/* =========================
   Quests (Lv1-10 / S M L)
   ========================= */
function questTypes() {
  return [
    { id: "battle", icon: "⚔", name: "モンスター退治", main: "STR" },
    { id: "search", icon: "📦", name: "おつかい運び", main: "SPD" },
    { id: "invest", icon: "🌿", name: "森の探索", main: "INT" },
  ];
}

function getQuestDangerLabel(level) {
  if (level <= 2) return "やさしい";
  if (level <= 4) return "ふつう";
  if (level <= 6) return "しっかり準備";
  if (level <= 8) return "むずかしい";
  return "かなり危険";
}

function getQuestFlavor(typeId, level) {
  const map = {
    battle: [
      "近くの原っぱで困りごとがあるらしい。",
      "街はずれから相談が届いている。",
      "少し手強そうな気配がする。",
    ],
    search: [
      "荷物を待っている人がいるようだ。",
      "急ぎの配達らしい。",
      "今日は少し遠くまで運ぶみたい。",
    ],
    invest: [
      "森の奥で何か見つかるかもしれない。",
      "静かな森を調べてみよう。",
      "小さな手がかりを探しにいく。",
    ],
  };

  const list = map[typeId] || ["依頼が届いている。"];
  return list[(level - 1) % list.length];
}

function makeQuestLevelBadge(level) {
  let cls = "mid";

  if (level <= 2) cls = "easy";
  else if (level <= 4) cls = "mid";
  else if (level <= 7) cls = "hard";
  else cls = "danger";

  return `<span class="qBadge ${cls}">Lv${level}</span>`;
}
function makeSuccessRateLabel(p) {
  const rate = Math.round(p);

  let cls = "mid";
  if (rate >= 80) cls = "good";
  else if (rate >= 60) cls = "mid";
  else if (rate >= 40) cls = "warn";
  else cls = "bad";

  return `<span class="qRate ${cls}">${rate}%</span>`;
}
function getQuestMainLabel(main) {
  if (main === "STR") return "STR";
  if (main === "SPD") return "SPD";
  if (main === "INT") return "INT";
  return main;
}
function rollQuestOffers() {
  const cap = RANK.maxQuestLevel(state.guildRank); // 1..10
  let minLv = Math.max(1, cap - 2);

  let low = minLv;
  let high = cap;
  while (high - low + 1 < 3 && low > 1) low--;
  while (high - low + 1 < 3 && high < 10) high++;

  const pool = [];
  for (let lv = low; lv <= high; lv++) pool.push(lv);
  shuffleArray(pool);

  const types = questTypes();
  const offers = {};
  for (let i = 0; i < types.length; i++) {
    offers[types[i].id] = pool[i];
  }
  state.questOffers = offers;
  save();
}

function openQuestSetupModal(type) {
  ensureQuestOffers();
  if (!state.questOffers) rollQuestOffers();
  const fixedLv = state.questOffers[type.id];

  ensureQuestState();
  const slotIdx = state.questJobs.findIndex(x => !x);
  if (slotIdx < 0) { pushLog("派遣枠が空いていません"); return; }

  const idle = state.cats.filter(c => !isCatBusy(c.id));
  if (idle.length === 0) { pushLog("待機中のネコがいません"); return; }

  const maxLv = RANK.maxQuestLevel(state.guildRank);

  const html = `
    <div class="panelCard">
      <div><b>${type.icon} ${type.name}</b></div>
      <div class="dim">難易度Lvは Rank に応じて解放（最大 Lv${maxLv}）</div>
      <div class="dim">最大3匹まで選択（訓練と両立不可 / キャンセル不可）</div>
    </div>

    <div class="panelCard" style="margin-top:10px;">
      <div class="dim" style="margin-bottom:8px;">
        助っ人（任意・1匹まで / 本日あと ${getHelperUseLeft()} 回）
      </div>
      <div id="helperPickList" class="modalList"></div>
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
  const helperPickList = document.getElementById("helperPickList");
  const timeList = document.getElementById("timeList");
  const qPreview = document.getElementById("qPreview");
  const btnStart = document.getElementById("qStart");

  document.getElementById("qCancel")?.addEventListener("click", closeModal);

  let pickTime = null;
  let pickHelperId = null;
  const selected = new Set();

  partyList.innerHTML = idle.map(c => `
    <div class="modalItem" data-cat="${c.id}">
      <b>${escapeHtml(c.name)}</b> Lv${c.level}
      <div class="dim">${escapeHtml(c.personality)} / STR ${c.str} SPD ${c.spd} INT ${c.int}</div>
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

 helperPickList.innerHTML = (state.helpers || []).map(h => {
  return `
    <div class="modalItem" data-helper="${h.id}">
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
        <b>${escapeHtml(h.name)}</b>
        <span class="dim">Lv${h.level}</span>
      </div>

      <div class="dim" style="margin-top:6px;">
        ${escapeHtml(h.personality)}
        / STR ${h.str}
        / SPD ${h.spd}
        / INT ${h.int}
      </div>
    </div>
  `;
}).join("") || `<div class="dim">登録助っ人なし</div>`;

helperPickList.addEventListener("click", (e) => {
  const item = e.target.closest(".modalItem");
  if (!item) return;

  const helper = (state.helpers || []).find(
    h => h.id === item.dataset.helper
  );

  if (!helper) return;

  const alreadyHelping = (state.questJobs || []).some(
    q => q?.helper?.id === helper.id
  );

  if (alreadyHelping) {
    pushLog("この助っ人は別のクエストを手伝い中にゃ");
    return;
  }

  if (getHelperUseLeft() <= 0) {
    pushLog("今日の助っ人使用回数を使い切ったにゃ");
    return;
  }

  if (pickHelperId === item.dataset.helper) {
    pickHelperId = null;
    item.style.outline = "";
  } else {
    helperPickList.querySelectorAll(".modalItem").forEach(x => {
      x.style.outline = "";
    });

    pickHelperId = item.dataset.helper;
    item.style.outline = "2px solid var(--blue)";
  }

  updatePreview();
});
   
  timeList.innerHTML = QUEST.TIME_TYPES.map(t => `
    <div class="modalItem" data-time="${t.key}">
      <b>${t.key}（${t.label}）</b>
      <div class="dim">効率 ${Math.round(t.eff * 100)}%</div>
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
    const ok = partyIds.length > 0 && !!pickTime;
    btnStart.disabled = !ok;

    qPreview.innerHTML = `
      <div class="dim">【${type.icon} ${type.name}】 Lv${fixedLv} / ${pickTime ?? "?"}</div>
    `;
    if (!ok) return;

    const def = makeQuestDef(type, fixedLv, pickTime);

    const helper =
      (state.helpers || []).find(h => h.id === pickHelperId) || null;

    const calc = calcQuestChance(def, partyIds, helper);
    qPreview.innerHTML = `
      時間: ${def.durationMin}分 / 基準Gold: ${def.baseGold.toLocaleString()}G<br>
      成功率(概算): <b>${calc.p}%</b>（属性ボーナス ${calc.attrBonus >= 0 ? "+" : ""}${calc.attrBonus}%）
    `;
  }

  btnStart.addEventListener("click", () => {
    const partyIds = Array.from(selected);
    const def = makeQuestDef(type, fixedLv, pickTime);

    const helper =
      (state.helpers || []).find(h => h.id === pickHelperId) || null;

    closeModal();
    startQuest(def, partyIds, slotIdx, helper);
  });
}

function makeQuestDef(type, level, timeKey) {
  const dur = getQuestDuration(level, timeKey);
  const eff = QUEST.TIME_TYPES.find(x => x.key === timeKey)?.eff ?? 1.0;

  const baseGold = Math.floor(dur * QUEST.goldPerMin(level) * eff);
  const target = getQuestNeedTotal(level);

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

function calcPersonalityBonus(def, party) {
  let bonus = 0;

  for (const c of party) {
    switch (c.personality) {

      // ツンデレ：戦闘でちょい強い
      case "ツンデレ":
        if (def.type === "battle") bonus += 5;
        break;

      // やんちゃ：短時間クエで元気
      case "やんちゃ":
        if (def.durationMin <= 120) bonus += 5;
        break;

      // クール：長時間クエで安定
      case "クール":
        if (def.durationMin >= 240) bonus += 5;
        break;

      // あまえんぼ：人数が多いほど頑張る
      case "あまえんぼ":
        bonus += party.length * 2; // 1匹あたり +2
        break;
    }
  }

  return bonus;
}

function calcQuestChance(def, partyIds, helper = null) {
  const party = partyIds.map(catById).filter(Boolean);

  if (helper) {
    party.push(helper);
  }

  if (party.length === 0) {
    return { p: 10, attrBonus: 0 };
  }

  const getMainStat = (cat) => {
    if (def.main === "STR") return cat.str;
    if (def.main === "SPD") return cat.spd;
    return cat.int;
  };

  const getSubStat = (cat) => {
    if (def.main === "STR") return cat.spd; // STRクエではSPDを副能力
    if (def.main === "SPD") return cat.int; // SPDクエではINTを副能力
    return cat.spd; // INTクエではSPDを副能力
  };

  const getOffStat = (cat) => {
    if (def.main === "STR") return cat.int;
    if (def.main === "SPD") return cat.str;
    return cat.str;
  };

  const total = party.reduce((s, c) => s + c.str + c.spd + c.int, 0);
  const mainSum = party.reduce((s, c) => s + getMainStat(c), 0);
  const subSum = party.reduce((s, c) => s + getSubStat(c), 0);
  const offSum = party.reduce((s, c) => s + getOffStat(c), 0);

  // 主能力をしっかり重視しつつ、
  // 副能力・その他能力もそこそこ効くようにして極端さを緩和
  const score =
    mainSum * 0.75 +
    subSum * 0.35 +
    offSum * 0.20;

  // 旧targetは総戦力基準なので、適性スコア制に合わせて少し圧縮
  const need = def.target * 0.68;

  // 基本成功率
  const pBase = 62 + (score - need) * 0.85;

  // 主能力の比率ボーナス
  // 旧式より効かせるが、尖りすぎないように抑えめ
  const ratio = total > 0 ? (mainSum / total) : 0;
  const pAttrRaw = (ratio - 1 / 3) * 60;
  const attrBonus = clamp(-8, 12, Math.round(pAttrRaw));

  // 人数ボーナスは軽め
  let teamBonus = 0;
  if (party.length === 2) teamBonus += 2;
  if (party.length >= 3) teamBonus += 4;

  // ★ここ追加（性格補正）
  const personalityBonus = calcPersonalityBonus(def, party);

  const p = clamp(
    10,
    90,
    Math.round(pBase + attrBonus + teamBonus + personalityBonus)
  );

  return {
    p,
    attrBonus: attrBonus + teamBonus + personalityBonus,
  };
}

function startQuest(def, partyIds, slotIdx, helper = null) {

  ensureHelperDailyUse();

  if (helper) {

    const limit = getHelperUseLimit();

    if (
      state.helperDailyUse.count >= limit
    ) {

      pushLog(
        "今日の助っ人使用回数を使い切ったにゃ"
      );

      return;
    }

  }
  ensureQuestState();

  for (const id of partyIds) {
    if (isCatBusy(id)) {
      pushLog("パーティに待機中でないネコがいます");
      return;
    }
  }

  const calc = calcQuestChance(def, partyIds, helper);
  const goldMult = RANK.goldMult(state.guildRank);

  const now = Date.now();
  const endAt = now + def.durationMin * 60 * 1000;

  if (helper) {
  state.helperDailyUse.count++;
}
  state.questJobs[slotIdx] = {
    slotNo: slotIdx + 1,
    def,
    partyIds,
    helper,
    pSuccess: calc.p,
    goldMult,
    startAt: now,
    endAt,
  };

  pushLog(`受注：${def.name} Lv${def.level}${def.timeType}（${def.durationMin}分 / 成功率 ${calc.p}%）`);
  
  // ✅ 受注したら「3種まとめて」次回提示Lvを再抽選
  rollQuestOffers();
  renderAll();
  save();
}

function finishQuestsIfDone() {
  const now = Date.now();
  for (let i = 0; i < (state.questJobs || []).length; i++) {
    const job = state.questJobs[i];
    if (!job) continue;
    if (job.endAt > now) continue;

    const isTut = !!job.tutorial;

    let result = "失敗";
    let gold = 0;
    let expEach = 0;
    let resultLine = "";
    let foundItem = null;
     
    if (isTut) {
      result = "成功";
      gold = job.def.baseGold;
      expEach = 20;
      resultLine = "はじめてのおしごとを、ちゃんと終わらせてきた。";
    } else {
      const roll = Math.random() * 100;
      if (roll <= job.pSuccess) {
        result = (roll <= job.pSuccess * 0.8) ? "大成功" : "成功";
      } else {
        result = "失敗";
      }

      if (result === "大成功" && Math.random() < 0.8) {
        addItem("matatabi", 1);
        foundItem = {
          id: "matatabi",
          amount: 1,
        };
      }

      const effGold = Math.floor(job.def.baseGold * QUEST.resultMult(result) * job.goldMult);
      const effExp = Math.floor(
        job.def.durationMin *
        QUEST.expPerMin(result) *
        (job.def.timeType === "S" ? 1.0 : job.def.timeType === "M" ? 0.96 : 0.92)
      );

      gold = effGold;
      expEach = effExp;
      resultLine = getQuestResultLine(job.def.id.split("_")[0], result);
    }

    ensurePending();
    state.pendingResults.push({
      type: "quest",
      finishedAt: now,
      questName: job.def.name,
      level: job.def.level,
      timeType: job.def.timeType,
      result,
      resultLine,
      gold,
      expEach,
      partyIds: job.partyIds,
      tutorial: isTut,
      foundItem,
    });

    state.questJobs[i] = null;

    pushLog(
      `クエスト完了：${job.def.name}${isTut ? "" : ` Lv${job.def.level}${job.def.timeType}`} → ${result}` +
      (resultLine ? `「${resultLine}」` : "") +
      `（受取待ち）`
    );

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

    <div class="checkRow ${((state.items?.matatabi || 0) <= 0) ? "disabled" : ""}">

  <label>

    <input
      type="checkbox"
      id="useMatatabi"
      ${((state.items?.matatabi || 0) <= 0) ? "disabled" : ""}
    >

    🌿 マタタビを使う

    <span class="dim">
      (所持: ${state.items?.matatabi || 0})
    </span>

  </label>

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
  document.getElementById("tCancel")?.addEventListener("click", closeModal);

  let pickCat = null;
  let pickMin = null;

  tCats.innerHTML = idle.map(c => `
    <div class="modalItem" data-cat="${c.id}">
      <b>${escapeHtml(c.name)}</b> Lv${c.level}
      <div class="dim">${escapeHtml(c.personality)} / STR ${c.str} SPD ${c.spd} INT ${c.int}</div>
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
  const useMatatabi =
    !!document.getElementById("useMatatabi")?.checked;

  if (useMatatabi && (state.items?.matatabi || 0) <= 0) {
    pushLog("マタタビがありません");
    return;
  }

  closeModal();
  startTraining(slotNo, pickCat, pickMin, useMatatabi);
});
}

function startTraining(slotNo, catId, durationMin, useMatatabi = false) {
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

const expGain =
  Math.floor(
    durationMin *
    TRAINING.BASE_EXP_PER_MIN *
    expMult
  );

if (useMatatabi) {

  if ((state.items?.matatabi || 0) <= 0) {

    pushLog("マタタビがないにゃ");
    return;
  }

  state.items.matatabi--;
}

const now = Date.now();

const endAt =
  now + durationMin * 60 * 1000;

state.trainingJobs[slotNo - 1] = {

  slotNo,
  catId,
  durationMin,
  useCost,
  expGain,

  matatabi: useMatatabi,

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

    const cat = catById(job.catId);

    let expGain = job.expGain;

    if (job.matatabi) {

      expGain *= 2;

      pushLog(`🌿 ${cat.name} はマタタビ効果でEXP2倍！`);
    }
    
     state.pendingResults.push({
      type: "training",
      finishedAt: now,
      slotNo: job.slotNo,
      catId: job.catId,
      durationMin: job.durationMin,
      useCost: job.useCost,
      exp: expGain,
    });

    pushLog(`訓練完了：枠${job.slotNo} / EXP ${job.expGain}（受取待ち）`);
    state.trainingJobs[i] = null;
  }
}

/* =========================
   Hiring (Scout)
   ========================= */
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
        ${list.map(c => {
  return `
    <div class="modalItem" style="display:flex; gap:10px; align-items:center;">
      <div style="width:56px;height:56px;position:relative;flex:0 0 56px;">
        <img src="${getCatBaseImage(c)}" class="catSprite colorized"
          style="--hue:${c.hue}deg; width:56px; height:56px; image-rendering:pixelated;" />
      </div>
      <div style="flex:1;min-width:0;">
        <div><b>${escapeHtml(c.name)}</b> <span class="dim">Lv${c.level}</span></div>
        <div class="dim">${escapeHtml(c.personality)} / STR ${c.str} SPD ${c.spd} INT ${c.int}</div>
      </div>
      <button class="primary smallBtn" data-hire="${c.id}" ${canHireMore ? "" : "disabled"}
        style="${canHireMore ? "" : "opacity:.6;"}">雇用</button>
    </div>
  `;
}).join("")}
        
      </div>
    </div>

    <div class="modalFooter">
      <button class="ghost" id="scoutClose">閉じる</button>
      <button class="primary" id="scoutGoCats">ネコへ戻る</button>
    </div>
  `;
  openModal("スカウト", html);

  document.getElementById("btnRescout")?.addEventListener("click", () => {
    closeModal();
    openScoutConfirmModal();
  });

  document.querySelectorAll("[data-hire]").forEach(btn => {
    btn.addEventListener("click", () => {
      hireCat(btn.dataset.hire);
      closeModal();
      openScoutModal(false);
      renderAll();
    });
  });

  document.getElementById("scoutClose")?.addEventListener("click", closeModal);
  document.getElementById("scoutGoCats")?.addEventListener("click", () => {
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
  registerCatDex(hired);
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

  document.getElementById("nCancel")?.addEventListener("click", closeModal);
  document.getElementById("nOk")?.addEventListener("click", () => {
    const v = document.getElementById("nameInput")?.value?.trim() || "";
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
  if ((state.cats || []).length <= 1) {
  pushLog("最後の1匹は解雇できません");
  return;
}

if (c.level <= 1) {
  pushLog("Lv1のネコは解雇できません");
  return;
}
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

  document.getElementById("fCancel")?.addEventListener("click", closeModal);
  document.getElementById("fOk")?.addEventListener("click", () => {
    closeModal();
    state.gold += refund;
    state.cats = state.cats.filter(x => x.id !== catId);
    pushLog(`${c.name} は街へ戻った。+${refund.toLocaleString()}G`);
    renderAll();
    save();
  });
}

function openRemoveHelperModal(helperId) {

  const helper =
    (state.helpers || []).find(
      h => h.id === helperId
    );

  if (!helper) return;

  const html = `
    <div class="panelCard">

      <div>
        <b>${escapeHtml(helper.name)}</b>
        を助っ人一覧から削除しますか？
      </div>

      <div class="dim" style="margin-top:8px;">
        この操作は取り消せません。
      </div>

    </div>

    <div class="modalFooter">

      <button
        class="ghost"
        id="helperRemoveCancel"
      >
        キャンセル
      </button>

      <button
        class="primary"
        id="helperRemoveConfirm"
      >
        削除
      </button>

    </div>
  `;

  openModal("助っ人削除", html);

  document
    .getElementById("helperRemoveCancel")
    ?.addEventListener("click", closeModal);

  document
    .getElementById("helperRemoveConfirm")
    ?.addEventListener("click", () => {

      state.helpers =
        state.helpers.filter(
          h => h.id !== helperId
        );

      pushLog(
        `${helper.name} を助っ人一覧から削除したにゃ`
      );

      save();

      closeModal();

      renderQuestTab();

    });

}
/* =========================
   Pending / Collect
   ========================= */
function openQuestResultModal(result, onNext) {
  const html = `
    <div class="panelCard">
      <div style="font-size:18px;font-weight:900;">🐾 クエスト報告</div>
      <div class="dim" style="margin-top:6px;">
        ${escapeHtml(result.questName)}${result.tutorial ? "" : ` Lv${result.level}${result.timeType}`}
      </div>
    </div>

    <div class="panelCard" style="margin-top:10px;">
      <div style="font-size:16px;font-weight:900;">${escapeHtml(result.result)}</div>
      <div class="dim" style="margin-top:8px;">
        ${escapeHtml(result.resultLine || "")}
      </div>
    </div>

    <div class="panelCard" style="margin-top:10px;">
      <div class="dim">Gold：+${result.gold.toLocaleString()}G</div>
      <div class="dim">EXP：+${result.expEach}</div>
      <div class="dim">対象ネコ：${result.partyIds.length}匹</div>
    </div>

    ${
  result.foundItem ? `
    <div class="panelCard" style="margin-top:10px;">
      <div style="font-size:16px;font-weight:900;">🌿 マタタビを見つけた！</div>
      <div class="dim" style="margin-top:6px;">
        訓練で使うとEXPが2倍になる特別なアイテムです。
      </div>
    </div>
  ` : ""
}

    <div class="modalFooter">
      <button class="primary" id="questResultNext">OK</button>
    </div>
  `;

  openModal("クエスト結果", html);

  document.getElementById("questResultNext")?.addEventListener("click", () => {
    closeModal();
    onNext?.();
  });
}

function showQuestResultsSequentially(results, onDone) {
  if (!results || results.length === 0) {
    onDone?.();
    return;
  }

  let index = 0;

  function next() {
    if (index >= results.length) {
      onDone?.();
      return;
    }
    openQuestResultModal(results[index], () => {
      index++;
      next();
    });
  }

  next();
}
function collectAll() {
  ensurePending();
  const list = state.pendingResults;
  if (list.length === 0) return;

  const questResults = list.filter(r => r.type === "quest");
  const otherResults = list.filter(r => r.type !== "quest");

  function applyAllResults() {
    // クエスト結果を反映
    for (const r of questResults) {
      state.gold += r.gold;

      for (const id of r.partyIds) {
        const c = catById(id);
        if (c) addExp(c, r.expEach);
      }

      pushLog(
        `受取：${r.questName}${r.tutorial ? "" : ` Lv${r.level}${r.timeType}`} ${r.result}` +
        (r.resultLine ? `「${r.resultLine}」` : "") +
        ` / +${r.gold.toLocaleString()}G / EXP+${r.expEach}×${r.partyIds.length}`
      );

      if (!state.tutorialDone && r.tutorial) {
        state.tutorialStage = Math.max(state.tutorialStage, 4);
      }
    }

    // 訓練・配当を反映
    for (const r of otherResults) {
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

    maybeShowTutorialRankUpPrompt();
  }

  if (questResults.length > 0) {
    showQuestResultsSequentially(questResults, applyAllResults);
  } else {
    applyAllResults();
  }
}

function maybeShowTutorialRankUpPrompt() {
  if (state.tutorialDone) return;
  if (state.tutorialStage < 4) return;
  if (state.guildRank !== 1) return;

  const cost = RANK.cost(2);
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
  document.getElementById("trOk")?.addEventListener("click", closeModal);
}

/* =========================
   Invest (dividends)
   ========================= */
function isShopUnlocked(key) {
  return state.guildRank >= (INVEST.unlockRank[key] || 999);
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

function makeDividendSummary(breakdown) {
  const by = {};
  for (const b of breakdown) {
    by[b.key] = (by[b.key] || 0) + b.gold;
  }
  const bestKey = Object.keys(by).sort((a, b) => by[b] - by[a])[0];
  if (!bestKey) return "配当";
  return `${INVEST.shops[bestKey].name}中心`;
}

function dividendFlavor(breakdown) {
  if (!breakdown.length) return "今日は静かな相場だ。";

  const best = breakdown.reduce((p, c) => (c.rate > p.rate ? c : p), breakdown[0]);
  const worst = breakdown.reduce((p, c) => (c.rate < p.rate ? c : p), breakdown[0]);

  const bestShop = INVEST.shops[best.key];
  const worstShop = INVEST.shops[worst.key];

  const up = (best.rate / bestShop.base) - 1;
  const down = 1 - (worst.rate / worstShop.base);

  if (up >= 0.30 && best.key === "magic") return "🔮 新魔法の特許が成立！研究成果が爆発！";
  if (up >= 0.15 && best.key === "trade") return "🚢 交易路が大当たり！商人たちが賑わっている。";
  if (up >= 0.08 && best.key === "arms") return "🗡 武具の需要が堅調だ。戦の気配か？";
  if (up >= 0.03 && best.key === "insure") return "🐟 大漁だ！さかな組合が賑わっている。";

  if (down >= 0.30 && worst.key === "magic") return "🔮 実験は難航しているようだ…";
  if (down >= 0.15 && worst.key === "trade") return "🚢 風向きが悪い日もある。";
  if (down >= 0.08 && worst.key === "arms") return "🗡 鍛冶場は静かだが、安定している。";
  if (down >= 0.03 && worst.key === "insure") return "🐟 今日は漁獲が少なかったようだ。";

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
      return `・${s.icon} ${s.name}：出資 ${amt.toLocaleString()}G / 配当率 ${(r * 100).toFixed(2)}% → +${g.toLocaleString()}G`;
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
  document.getElementById("dvClose")?.addEventListener("click", closeModal);
  document.getElementById("dvGo")?.addEventListener("click", () => {
    closeModal();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
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

  document.getElementById("depCancel")?.addEventListener("click", closeModal);
  document.getElementById("depOk")?.addEventListener("click", () => {
    const raw = document.getElementById("depInput")?.value?.trim() || "";
    const val = Number(raw);
    if (!Number.isFinite(val) || val <= 0) { closeModal(); return; }

    const amt = Math.floor(val / INVEST.STEP) * INVEST.STEP;
    if (amt <= 0) { closeModal(); return; }

    const cap2 = shopCap(key);
    const cur2 = state.invest.holdings[key] || 0;

    if (cur2 + amt > cap2) { pushLog("出資上限を超えています"); closeModal(); return; }
    if (state.gold < amt) { pushLog("Goldが足りません"); closeModal(); return; }

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

 const bg = document.getElementById("guildBg");
if (bg) {
  bg.src = getGuildBg();
}
   
  ensureQuestState();
  ensureTrainingState();
  ensurePending();
  ensureHire();
  ensureTutorial();
  ensureInvest();
  ensureAlpaca();
  ensureItems();
  ensureQuestOffers();
  ensureDailyBonus();

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
  const ds = getDispatchSlots();

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

  if (el.hud) {
    el.hud.innerHTML = badges.map(([k, v]) => `
      <div class="badge"><span class="k">${escapeHtml(k)}</span><span class="v">${escapeHtml(v)}</span></div>
    `).join("");
  }
}

function renderRankUp() {
  const next = state.guildRank + 1;
  const cost = RANK.cost(next);
  if (el.rankInfo) el.rankInfo.textContent = `Rank ${state.guildRank} → ${next}`;
  if (el.rankCostText) el.rankCostText.textContent = `必要: ${cost.toLocaleString()}G`;
  if (el.btnRankUp) {
    el.btnRankUp.disabled = state.gold < cost;
    el.btnRankUp.style.opacity = state.gold < cost ? "0.6" : "1";
  }
}

function renderPending() {
  const n = (state.pendingResults || []).length;
  if (!el.pendingBar || !el.pendingText) return;

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

  el.tabQuest?.classList.toggle("hidden", tab !== "quest");
  el.tabCats?.classList.toggle("hidden", tab !== "cats");
  el.tabTraining?.classList.toggle("hidden", tab !== "training");
  el.tabInvest?.classList.toggle("hidden", tab !== "invest");

  renderTabs();
}

function renderQuestTab() {
  ensureQuestOffers();
  ensureAlpaca();
  ensureHelperDailyUse();
  ensureHelperAdBonus();

  if (!Array.isArray(state.helpers)) {
    state.helpers = [];
  }

  if (!state.questOffers) rollQuestOffers();

  const types = questTypes();
  const ds = getDispatchSlots();
  const used = (state.questJobs || []).filter(Boolean).length;
  const maxLv = RANK.maxQuestLevel(state.guildRank);
  const alpacaOffer = getAvailableAlpacaPurchase();

  const normalHelpers =
  state.helpers.filter(h => !h.official);

const eventHelpers =
  state.helpers.filter(h => h.official);

const renderHelperCard = h => `
  <div class="panelCard helperQuestCard" style="margin-top:8px;">

    <div class="helperQuestRow">

      ${
        h.official
          ? ""
          : `
            <button
              class="ghost smallBtn"
              data-remove-helper="${h.id}"
              style="margin-left:auto;"
            >
              削除
            </button>
          `
      }

      <img
        class="helperQuestIcon colorized"
        src="${h.eventImage || getQuestCatImage(h)}"
        style="--hue:${h.hue || 0}deg;"
        alt=""
      >

      <div class="helperQuestMain">

        <div class="helperQuestTop">

          <b>${escapeHtml(h.name)}</b>

          <span class="dim">
            Lv${h.level}
          </span>

          <span class="dim">
            ${escapeHtml(h.personality)}
          </span>

        </div>

        <div class="dim" style="margin-top:6px;">

          STR ${h.str}
          / SPD ${h.spd}
          / INT ${h.int}

        </div>

        ${
          h.official && h.startDate && h.endDate
            ? `
              <div class="dim" style="margin-top:4px;">
                開催期間：${h.startDate} ～ ${h.endDate}
              </div>
            `
            : ""
        }

        ${
          h.expiresAt
            ? `
              <div class="dim" style="margin-top:4px;">
                開催期間：
                ${h.startDate}
                ～
                ${h.endDate}
              </div>
            `
            : ""
        }
      </div>
    </div>
  </div>
`;

const normalHelperRows =
  normalHelpers.map(renderHelperCard).join("");

const eventHelperRows =
  eventHelpers.map(renderHelperCard).join("");

  el.tabQuest.innerHTML = `
    <div class="panelCard">
      <div class="row">
        <div>
          <div><b>クエスト</b> <span class="dim">(Lv1〜${maxLv} 解放中)</span></div>
          <div class="dim">S/M/Lで時間選択</div>
          <div class="dim">派遣枠 ${used}/${ds}</div>
        </div>
        <div class="mono">派遣枠 ${used}/${ds}</div>
      </div>
    </div>

    <div class="panelCard">
      <div class="row">
        <div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <b>🤝 助っ人</b>
            <button class="ghost smallBtn" id="btnHelperGuide">❓</button>
          </div>

          <div
            class="dim"
            style="
              margin-top:4px;
              display:flex;
              gap:12px;
              flex-wrap:wrap;
            "
          >
            <span>
              登録 ${state.helpers.length}/${getHelperMax()}
            </span>

            <span>
              使用 ${getHelperUseLeft()}/${getHelperUseLimit()}
            </span>
          </div>
        </div>
      </div>

      <div class="row" style="margin-top:10px;">
  <button class="ghost smallBtn" id="btnExportHelper">
    助っ人コード発行
  </button>

  <button class="ghost smallBtn" id="btnImportHelper">
    助っ人コード読込
  </button>
</div>

<div style="margin-top:10px;">

  <button
    class="primary"
    id="btnHelperAd"
    style="width:100%;"
  >
    ▶ 助っ人支援を見る
  </button>

  <div
    class="dim"
    style="
      margin-top:8px;
      text-align:center;
    "
  >
    視聴で助っ人使用回数 +1
    /
    本日あと
    ${HELPER_AD_DAILY_LIMIT - state.helperAdBonus.count}
    /
    ${HELPER_AD_DAILY_LIMIT}
    回
  </div>

</div>
      <div style="margin-top:10px;">

  <button
    class="ghost smallBtn"
    id="btnToggleHelpers"
    style="width:100%;"
  >
    ${
      state.helperListOpen
        ? "▼ 助っ人一覧を閉じる"
        : "▶ 助っ人一覧を開く"
    }
  </button>

  ${
    state.helperListOpen
      ? `
        <div style="margin-top:10px;">
          ${
  normalHelpers.length > 0
    ? `
      <div style="margin-top:10px;">

        <div class="helperSectionTitle normal">
          🤝 通常助っ人
        </div>

        ${normalHelperRows}

      </div>
    `
    : ""
}

${
  eventHelpers.length > 0
    ? `
      <div style="margin-top:14px;">

       <div class="helperSectionTitle event">
        🎁 イベント助っ人
      </div> 

        ${eventHelperRows}

      </div>
    `
    : ""
}

${
  state.helpers.length <= 0
    ? `<div class="dim">助っ人なし</div>`
    : ""
}
        </div>
      `
      : ""
  }

</div>

    ${
      alpacaOffer ? `
        <div class="panelCard">
          <div class="row">
            <div>
              <div><b>🦙 ${escapeHtml(alpacaOffer.label)}</b></div>
              <div class="dim">${escapeHtml(alpacaOffer.desc)} / 費用 ${alpacaOffer.cost.toLocaleString()}G</div>
            </div>
            <button class="primary smallBtn" id="btnBuyAlpaca"
              ${state.gold >= alpacaOffer.cost ? "" : "disabled"}
              style="${state.gold >= alpacaOffer.cost ? "" : "opacity:.6;"}">
              迎える
            </button>
          </div>
        </div>
      ` : ""
    }

    ${types.map(t => {
      const lv = state.questOffers[t.id];
      const danger = getQuestDangerLabel(lv);
      const flavor = getQuestFlavor(t.id, lv);

      return `
        <div class="panelCard">
          <div class="row">
            <div style="min-width:0; flex:1;">
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                <b>${t.icon} ${t.name}</b>
                ${makeQuestLevelBadge(lv)}
              </div>

              <div class="dim" style="margin-top:6px;">${danger}</div>
              <div class="dim" style="margin-top:4px;">${flavor}</div>
              <div class="dim" style="margin-top:4px;">属性：${getQuestMainLabel(t.main)}</div>
            </div>

            <button class="primary smallBtn" data-qtype="${t.id}">受注</button>
          </div>
        </div>
      `;
    }).join("")}

    ${renderQuestRunning()}
  `;

  document.getElementById("btnExportHelper")?.addEventListener("click", () => {
    try {
      const code = exportHelperCode();

      openModal("助っ人コード発行", `
        <div class="panelCard">
          <div class="dim">このコードを相手に渡してください。</div>
          <textarea readonly style="width:100%;height:150px;margin-top:10px;">${code}</textarea>
        </div>
        <div class="modalFooter">
          <button class="primary" id="helperCodeClose">閉じる</button>
        </div>
      `);

      document.getElementById("helperCodeClose")?.addEventListener("click", closeModal);
    } catch {
      pushLog("助っ人登録ネコがいないにゃ");
    }
  });

  document.getElementById("btnImportHelper")?.addEventListener("click", () => {
    openModal("助っ人コード読込", `
      <div class="panelCard">
        <textarea id="helperCodeInput" placeholder="助っ人コードを貼り付け"
          style="width:100%;height:150px;"></textarea>
      </div>
      <div class="modalFooter">
        <button class="ghost" id="helperImportCancel">キャンセル</button>
        <button class="primary" id="helperImportOk">読込</button>
      </div>
    `);

    document.getElementById("helperImportCancel")?.addEventListener("click", closeModal);

    document.getElementById("helperImportOk")?.addEventListener("click", () => {
      try {
        const code = document.getElementById("helperCodeInput")?.value || "";
        importHelperCode(code);
        closeModal();
        pushLog("助っ人を登録したにゃ");
        renderAll();
      } catch {
        pushLog("助っ人コード読込失敗");
      }
    });
  });

  document.getElementById("btnHelperGuide")
  ?.addEventListener("click", openHelperGuideModal);

  el.tabQuest.querySelectorAll("[data-qtype]").forEach(btn => {
    btn.addEventListener("click", () => {
      const t = types.find(x => x.id === btn.dataset.qtype);
      if (t) openQuestSetupModal(t);
    });
  });

  el.tabQuest
  .querySelectorAll("[data-remove-helper]")
  .forEach(btn => {

    btn.addEventListener("click", () => {

      const helperId =
        btn.dataset.removeHelper;

      openRemoveHelperModal(helperId);

    });

  });

document.getElementById("btnBuyAlpaca")
?.addEventListener("click", () => {

  if (alpacaOffer) {
    buyAlpaca(alpacaOffer.stage);
  }

});

document.getElementById("btnHelperAd")
?.addEventListener("click", () => {

  ensureHelperAdBonus();

  if (state.helperAdBonus.count >= HELPER_AD_DAILY_LIMIT) {
    pushLog("今日はこれ以上支援を受けられないにゃ");
    return;
  }

  openModal("助っ人支援", `
    <div class="panelCard">
      <img
        src="img/helper_support.png"
        alt=""
        style="
          width:100%;
          border-radius:14px;
          display:block;
        "
      >

      <div class="dim" style="margin-top:10px;text-align:center;">
        助っ人支援を受け取っています...
      </div>
    </div>
  `);

  setTimeout(() => {
    closeModal();

    ensureHelperAdBonus();

    if (state.helperAdBonus.count >= HELPER_AD_DAILY_LIMIT) {
      pushLog("今日はこれ以上支援を受けられないにゃ");
      renderQuestTab();
      save();
      return;
    }

    state.helperAdBonus.count++;

    pushLog("助っ人使用回数が1回増えたにゃ");

    save();
    renderQuestTab();

  }, 3000);

});

   document.getElementById("btnToggleHelpers")
?.addEventListener("click", () => {

  state.helperListOpen =
    !state.helperListOpen;

  save();

  renderQuestTab();

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

  const fireLockedReason =
  !RANK.canFire(state.guildRank) ? "Rank5で解放" :
  c.level <= 1 ? "Lv2から解雇可" :
  (state.cats || []).length <= 1 ? "最後の1匹は不可" :
  busy ? "待機中のみ解雇可" :
  "";
  
  const training = busy === "training";
  
     
  return `
    <div class="panelCard catCompactCard">
      <div class="catCompactRow">
        <div class="catMiniSpriteWrap">
          <img
            src="${getDetailCatImage(c)}"
            class="catSprite colorized ${training ? "catDumbbell" : ""} ${
              (state.trainingJobs || []).some(j => j?.catId === c.id && j.matatabi)
                ? "matatabiBoost"
                : ""
            }"
            ${training ? `data-jim="${c.id}"` : ""}
            style="--hue:${c.hue}deg;width:32px;height:32px;display:block;image-rendering:pixelated;"
            alt=""
          />
        </div>

        <div class="catCompactName">
          <b>
            ${
              state.favoriteCatId === c.id
                ? "★ "
                : ""
            }${escapeHtml(c.name)}
          </b>
          <span class="dim">Lv${c.level} / ${escapeHtml(c.personality)}</span>
        </div>

        <div class="catCompactStatus">
          <span class="statusDot ${dotClass}"></span>${statusText}
        </div>

        <button class="ghost smallBtn" data-cat-detail="${c.id}">詳細</button>
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

    <div class="panelCard">
      <div><b>📖 ネコ図鑑</b></div>
      <div class="dim" style="margin-top:6px;">
        出会ったネコやイベントネコを確認できます
      </div>
      <button class="ghost smallBtn" id="btnCatDex" style="margin-top:10px;">
        図鑑を見る
      </button>
    </div>
  `;

  el.tabCats.querySelectorAll("[data-cat-detail]").forEach(btn => {
  btn.addEventListener("click", () => openCatDetailModal(btn.dataset.catDetail));
});

  document.getElementById("btnScout")
  ?.addEventListener("click", openScoutConfirmModal);
  document.getElementById("btnViewCandidates")?.addEventListener("click", () => openScoutModal(false));

document.getElementById("btnCatDex")
  ?.addEventListener("click", openCatDexModal);
}

function openScoutConfirmModal() {

  const scoutCost =
    HIRING.refreshCost(state.guildRank);

  openModal(
    "スカウト確認",

    `
      <div class="panelCard">

        <div>
          スカウト候補を更新しますか？
        </div>

        <div class="dim" style="margin-top:8px;">
          ${scoutCost.toLocaleString()}G 消費します
        </div>

      </div>

      <div class="modalFooter">
        <button class="ghost" id="cancelScout">
          キャンセル
        </button>

        <button class="primary" id="confirmScout">
          スカウトする
        </button>
      </div>
    `
  );

  document.getElementById("cancelScout")
    ?.addEventListener("click", closeModal);

  document.getElementById("confirmScout")
    ?.addEventListener("click", () => {

      closeModal();

      scoutPayAndOpen();
    });
}

function openBgDexModal() {

  const unlockedMotionIds =
    state.bgUnlocks?.motionIds || [];

  const unlockedLineIds =
    state.bgUnlocks?.lineIds || [];

  const motionHtml = BG_UNLOCK_MOTIONS.map(m => {
  const unlocked = unlockedMotionIds.includes(m.id);
  const img = m.frames?.[0] || "";

  return `
    <div class="dexRow dexMotionRow">
      <div class="dexIcon ${unlocked ? "" : "locked"}"
        style="background-image:url('${img}')">
      </div>

      <div>
        <div>${unlocked ? "✔" : "❓"} ${unlocked ? escapeHtml(m.name) : "？？？"}</div>
        <div class="dim">${unlocked ? "解放済み" : "未解放"}</div>
      </div>
    </div>
  `;
}).join("");

  const lineHtml = BG_UNLOCK_LINES.map((line, i) => {

    const unlocked =
      unlockedLineIds.includes(String(i));

    return `
      <div class="dexRow">
        <span>
          ${unlocked ? "✔" : "❓"}
        </span>

        <span>
          ${unlocked ? escapeHtml(line) : "？？？"}
        </span>
      </div>
    `;

  }).join("");

  const html = `

    <div class="panelCard">

      <div class="sectionTitle">
        🐱 モーション図鑑
      </div>

      ${motionHtml}

    </div>

    <div class="panelCard" style="margin-top:12px;">

      <div class="sectionTitle">
        💬 セリフ図鑑
      </div>

      ${lineHtml}

    </div>

  `;

  openModal("背景ネコ図鑑", html);
}
function openCatDexModal() {
  ensureCatDex();

  const personalities = ["ツンデレ", "やんちゃ", "クール", "あまえんぼ"];
const hues = CAT_HUES;

const normalRows = personalities.map(p => `
  <div class="dexGridRow">
    <div class="dexGridLabel">${escapeHtml(p)}</div>

    ${hues.map(hue => {
      const found = state.catDex.normal.find(
        c => c.personality === p && Number(c.hue) === Number(hue)
      );

      return `
        <div class="dexCatIcon ${found ? "" : "locked"}">
          ${
            found
              ? `
                <img
                  src="${found.image}"
                  class="colorized"
                  style="--hue:${hue}deg;width:42px;height:42px;image-rendering:pixelated;"
                  alt=""
                >
              `
              : "？"
          }
        </div>
      `;
    }).join("")}
  </div>
`).join("");

  const eventRows = state.catDex.event.map(c => `
    <div class="dexRow">
      <img
        src="${c.image}"
        class="helperQuestIcon"
        alt=""
      >

      <div>
        <div><b>${escapeHtml(c.name)}</b></div>
      </div>
    </div>
  `).join("");

  const html = `
    <div class="panelCard">
      <div class="sectionTitle">🐱 通常ネコ</div>
      ${normalRows || `<div class="dim">未登録</div>`}
    </div>

    <div class="panelCard" style="margin-top:12px;">
      <div class="sectionTitle">🎁 イベントネコ</div>
      ${eventRows || `<div class="dim">未登録</div>`}
    </div>

    <div class="panelCard" style="margin-top:12px;">

  <div class="sectionTitle">
    🏠 背景ネコ
  </div>

  <button
    class="ghost smallBtn"
    id="btnOpenBgDex"
    style="margin-top:10px;"
  >
    背景ネコ図鑑を見る
  </button>

</div>
  `;

  openModal("ネコ図鑑", html);
  document.getElementById("btnOpenBgDex")
  ?.addEventListener("click", () => {

    closeModal();

    openBgDexModal();

  });
}
/* =========================
   Background Cat
   ========================= */
const ROOM_AREAS = {
  1: [
    { name: "左木箱", x1: 4,  x2: 13, y1: 60, y2: 66 },
    { name: "左通路", x1: 24, x2: 34, y1: 68, y2: 77 },
    { name: "中央ラグ", x1: 16, x2: 66, y1: 78, y2: 92 },
    { name: "右イス前", x1: 82, x2: 92, y1: 76, y2: 91 },
    { name: "右小箱", x1: 82, x2: 88, y1: 60, y2: 66 },
  ],

  2: [
    { name: "左木箱",   x1: 4,  x2: 13, y1: 60, y2: 66 },
    { name: "左床",     x1: 3,  x2: 14, y1: 78, y2: 95 },
    { name: "中央ラグ", x1: 31, x2: 67, y1: 78, y2: 95 },
    { name: "右床",     x1: 81, x2: 94, y1: 78, y2: 95 },
    { name: "右イス",   x1: 82, x2: 89, y1: 60, y2: 66 },
  ],

  3: [
    { name: "左本棚前", x1: 5,  x2: 12, y1: 60, y2: 67 },
    { name: "左床",     x1: 2,  x2: 14, y1: 79, y2: 95 },
    { name: "中央ラグ", x1: 31, x2: 67, y1: 79, y2: 96 },
    { name: "訓練場前", x1: 63, x2: 72, y1: 67, y2: 83 },
    { name: "右床",     x1: 84, x2: 96, y1: 79, y2: 95 },
  ],

   4: [
    { name: "左棚前",   x1: 5,  x2: 11, y1: 58, y2: 67 },
    { name: "左床",     x1: 2,  x2: 14, y1: 80, y2: 96 },
    { name: "中央ラグ", x1: 31, x2: 68, y1: 80, y2: 96 },
    { name: "中央右",   x1: 65, x2: 72, y1: 60, y2: 70 },
    { name: "右床",     x1: 84, x2: 96, y1: 80, y2: 96 },
  ],

   5: [
    { name: "左棚前",   x1: 4,  x2: 11, y1: 56, y2: 67 },
    { name: "左床",     x1: 2,  x2: 13, y1: 79, y2: 95 },
    { name: "中央ラグ", x1: 28, x2: 65, y1: 80, y2: 96 },
    { name: "中央右",   x1: 64, x2: 72, y1: 62, y2: 73 },
    { name: "右床",     x1: 82, x2: 94, y1: 80, y2: 95 },
  ],

   6: [
    { name: "左棚前",   x1: 3,  x2: 10, y1: 56, y2: 67 },
    { name: "左床",     x1: 2,  x2: 12, y1: 79, y2: 94 },
    { name: "中央ラグ", x1: 26, x2: 54, y1: 81, y2: 96 },
    { name: "中央右",   x1: 63, x2: 69, y1: 66, y2: 75 },
    { name: "右下",     x1: 82, x2: 92, y1: 88, y2: 96 },
  ],

   7: [
    { name: "ソファ前", x1: 5,  x2: 13, y1: 74, y2: 84 },
    { name: "左床",     x1: 20, x2: 35, y1: 88, y2: 96 },
    { name: "中央ラグ", x1: 36, x2: 49, y1: 79, y2: 96 },
    { name: "中央右",   x1: 63, x2: 70, y1: 66, y2: 76 },
    { name: "右床",     x1: 82, x2: 93, y1: 88, y2: 96 },
  ],

   8: [
    { name: "ソファ前", x1: 5,  x2: 13, y1: 74, y2: 84 },
    { name: "左中央",   x1: 16, x2: 22, y1: 82, y2: 91 },
    { name: "左床",     x1: 24, x2: 38, y1: 89, y2: 97 },
    { name: "中央ラグ", x1: 37, x2: 52, y1: 79, y2: 97 },
    { name: "中央右",   x1: 63, x2: 70, y1: 66, y2: 76 },
    { name: "右床",     x1: 82, x2: 92, y1: 92, y2: 98 },
  ],

   9: [
    { name: "ソファ前", x1: 5,  x2: 13, y1: 74, y2: 84 },
    { name: "左中央",   x1: 15, x2: 21, y1: 82, y2: 91 },
    { name: "中央左",   x1: 42, x2: 50, y1: 79, y2: 94 },
    { name: "中央下",   x1: 52, x2: 61, y1: 92, y2: 98 },
    { name: "中央右",   x1: 63, x2: 69, y1: 66, y2: 76 },
    { name: "右中央",   x1: 58, x2: 66, y1: 82, y2: 91 },
    { name: "右床",     x1: 82, x2: 92, y1: 92, y2: 98 },
  ],

   10: [
    { name: "左下",     x1: 1,  x2: 12, y1: 92, y2: 98 },
    { name: "ソファ前", x1: 5,  x2: 13, y1: 74, y2: 84 },
    { name: "左中央",   x1: 15, x2: 21, y1: 82, y2: 91 },
    { name: "中央",     x1: 42, x2: 50, y1: 79, y2: 95 },
    { name: "中央下",   x1: 53, x2: 60, y1: 93, y2: 98 },
    { name: "中央右",   x1: 63, x2: 69, y1: 66, y2: 76 },
    { name: "右中央",   x1: 58, x2: 66, y1: 82, y2: 91 },
    { name: "右床",     x1: 82, x2: 92, y1: 92, y2: 98 },
  ],

   11: [
    { name: "ソファ前", x1: 5,  x2: 13, y1: 74, y2: 84 },
    { name: "左中央",   x1: 16, x2: 22, y1: 82, y2: 91 },
    { name: "中央",     x1: 43, x2: 50, y1: 80, y2: 95 },
    { name: "中央下",   x1: 52, x2: 58, y1: 93, y2: 98 },
    { name: "中央右",   x1: 63, x2: 69, y1: 66, y2: 76 },
    { name: "右床",     x1: 82, x2: 92, y1: 92, y2: 98 },
  ],

   12: [
    { name: "ソファ前", x1: 5,  x2: 13, y1: 74, y2: 84 },
    { name: "左中央",   x1: 16, x2: 22, y1: 82, y2: 91 },
    { name: "中央",     x1: 43, x2: 50, y1: 80, y2: 95 },
    { name: "中央上",   x1: 51, x2: 57, y1: 56, y2: 66 },
    { name: "中央右",   x1: 63, x2: 69, y1: 66, y2: 76 },
    { name: "右中央",   x1: 58, x2: 66, y1: 82, y2: 91 },
  ],

   13: [
    { name: "ソファ前", x1: 5,  x2: 13, y1: 74, y2: 84 },
    { name: "中央左",   x1: 37, x2: 45, y1: 56, y2: 66 },
    { name: "中央上",   x1: 54, x2: 60, y1: 56, y2: 66 },
    { name: "中央",     x1: 43, x2: 51, y1: 80, y2: 95 },
    { name: "右中央",   x1: 62, x2: 68, y1: 82, y2: 91 },
    { name: "中央右",   x1: 65, x2: 71, y1: 66, y2: 76 },
  ],

   14: [
    { name: "ソファ前", x1: 5,  x2: 13, y1: 74, y2: 84 },
    { name: "左中央",   x1: 16, x2: 22, y1: 82, y2: 91 },
    { name: "中央",     x1: 43, x2: 51, y1: 80, y2: 95 },
    { name: "中央上",   x1: 54, x2: 60, y1: 56, y2: 66 },
    { name: "右中央",   x1: 62, x2: 68, y1: 82, y2: 91 },
    { name: "中央右",   x1: 65, x2: 71, y1: 66, y2: 76 },
  ],

   15: [
    { name: "ソファ前", x1: 5,  x2: 13, y1: 74, y2: 84 },
    { name: "左中央",   x1: 16, x2: 22, y1: 82, y2: 91 },
    { name: "中央",     x1: 43, x2: 51, y1: 80, y2: 95 },
    { name: "中央上",   x1: 41, x2: 62, y1: 57, y2: 66 },
    { name: "右中央",   x1: 62, x2: 68, y1: 82, y2: 91 },
    { name: "中央右",   x1: 65, x2: 71, y1: 66, y2: 76 },
  ],
   
};

function randRange(min, max) {
  return min + Math.random() * (max - min);
}

function pickBgCatSpot() {
  const areas =
    ROOM_AREAS[state.guildRank] || ROOM_AREAS[1];

  const area =
    areas[Math.floor(Math.random() * areas.length)];

  return {
    x: randRange(area.x1, area.x2),
    y: randRange(area.y1, area.y2),
    area,
  };
}

function createBgCat(){

  const layer = document.getElementById("catLayer");
  if (!layer) return null;

  const cat = document.createElement("div");

  cat.className = "bgCat idle";
  cat.style.left = "50%";
  cat.style.top = "72%";

  layer.appendChild(cat);

  return cat;
}

function moveBgCat(cat){

  const spot = pickBgCatSpot();

  const currentX =
    parseFloat(cat.style.left);

  if (spot.x < currentX) {

    cat.classList.add("flip");

  } else {

    cat.classList.remove("flip");
  }

  const bubble =
    cat.querySelector(".bgCatBubble");

  if (bubble) {

    bubble.classList.toggle(
      "flipFix",
      cat.classList.contains("flip")
    );
  }

  cat.classList.remove("idle", "sleep");
  cat.classList.add("walk");

  clearBgCatAnim(cat);
  cat.style.backgroundImage = "";

  if (Math.random() < 0.25) {
    showBgCatBubble(cat, "walk");
  }
   
  cat.style.left = spot.x + "%";
  cat.style.top  = spot.y + "%";

  setTimeout(()=>{

    cat.classList.remove("walk");

    if (Math.random() < 0.2) {
  cat.classList.add("sleep");
  clearBgCatAnim(cat);
  cat.style.backgroundImage = "";

  if (Math.random() < 0.25) {
    showBgCatBubble(cat, "sleep");
  }

} else {
  const motion = Math.random() < 0.35
    ? pickUnlockedBgMotion()
    : null;

  if (motion) {
    cat.classList.add("idle");
    setBgCatImage(cat, motion.frames);

    if (Math.random() < 0.25) {
      showBgCatBubble(cat, "idle");
    }

  } else {
    cat.classList.add("idle");
    clearBgCatAnim(cat);
    cat.style.backgroundImage = "";

    if (Math.random() < 0.18) {
      showBgCatBubble(cat, "idle");
    }
  }
}

  }, 4000);
}

function getUnlockedBgMotions() {

  const ids =
    state.bgUnlocks?.motionIds || [];

  return BG_UNLOCK_MOTIONS.filter(m =>
    ids.includes(m.id)
  );
}

function clearBgCatAnim(cat) {
  if (cat._motionTimer) {
    clearInterval(cat._motionTimer);
    cat._motionTimer = null;
  }
}

function setBgCatImage(cat, frames) {
  if (!cat || !frames || frames.length === 0) return;

  clearBgCatAnim(cat);

  let index = 0;
  cat.style.backgroundImage = `url("${frames[index]}")`;

  if (frames.length >= 2) {
    cat._motionTimer = setInterval(() => {
      index = (index + 1) % frames.length;
      cat.style.backgroundImage = `url("${frames[index]}")`;
    }, 700);
  }
}

function pickUnlockedBgMotion() {
  const motions = getUnlockedBgMotions();

  if (motions.length === 0) return null;

  return motions[Math.floor(Math.random() * motions.length)];
}

/* =========================
   Background Cat
   ========================= */

const BG_UNLOCK_MOTIONS = [

  {
    id: "cat_1",
    name: "おすわり",
    frames: ["img/cats/cat_1.png"]
  },

  {
    id: "cat_2",
    name: "のび～",
    frames: ["img/cats/cat_2.png"]
  },

  {
    id: "cat_3",
    name: "ぺろぺろ",
    frames: ["img/cats/cat_3.png"]
  },

  {
    id: "cat_4",
    name: "ふりふり",
    frames: [
      "img/cats/cat_4_1.png",
      "img/cats/cat_4_2.png"
    ]
  },

  {
    id: "cat_5",
    name: "きょろきょろ",
    frames: ["img/cats/cat_5.png"]
  },

  {
    id: "cat_6",
    name: "うとうと",
    frames: ["img/cats/cat_6.png"]
  },

  {
    id: "cat_7",
    name: "へそてん",
    frames: ["img/cats/cat_7.png"]
  },

  {
    id: "cat_8",
    name: "小走り",
    frames: [
      "img/cats/cat_8_1.png",
      "img/cats/cat_8_2.png"
    ]
  },

  {
    id: "cat_9",
    name: "びっくり",
    frames: ["img/cats/cat_9.png"]
  },

  {
    id: "cat_10",
    name: "ごろん",
    frames: ["img/cats/cat_10.png"]
  },

  {
    id: "cat_11",
    name: "ナイト",
    frames: ["img/cats/cat_11.png"]
  },

  {
    id: "cat_12",
    name: "シーフ",
    frames: ["img/cats/cat_12.png"]
  },

  {
    id: "cat_13",
    name: "マジシャン",
    frames: ["img/cats/cat_13.png"]
  },

  {
    id: "cat_14",
    name: "トレーニング",
    frames: [
      "img/cats/cat_14_1.png",
      "img/cats/cat_14_2.png"
    ]
  },

];

const BG_UNLOCK_LINES = [

  "今日の風は気持ちいいにゃ",
  "なんだか静かだにゃ〜",
  "ランタンの灯りって落ち着くにゃ",
  "今日はゆっくり過ごしたいにゃ",
  "床があったかいにゃ",
  "みんな頑張ってるにゃ",
  "ちょっとだけ眠るにゃ…",
  "お魚の夢を見そうだにゃ",
  "今日は誰が帰ってくるかにゃ？",
  "この時間、好きだにゃ",
  "なんだか安心するにゃ〜",
  "今日も平和でうれしいにゃ",
  "ここにいると眠くなるにゃ",
  "ずっとこんな日が続くといいにゃ",

];

const BG_CAT_LINES = {
  idle: [
    "今日は静かだね",
    "ぽかぽかする〜",
    "なにしようかな",
  ],
  walk: [
    "見回り中！",
    "ちょっと行ってくる",
    "お仕事お仕事〜",
  ],
  sleep: [
    "すぅ…",
    "おやすみ〜",
    "もうだめにゃ…",
  ],
};
function getBgLines(mode) {

  const baseLines =
    BG_CAT_LINES[mode] || BG_CAT_LINES.idle;

  const unlockedLines =
    (state.bgUnlocks?.lineIds || [])
      .map(id => BG_UNLOCK_LINES[Number(id)])
      .filter(Boolean);

  return [...baseLines, ...unlockedLines];
}
function showBgCatBubble(cat, mode) {
  if (!cat) return;

  const lines = getBgLines(mode);

  const text =
    lines[Math.floor(Math.random() * lines.length)];

  let bubble = cat.querySelector(".bgCatBubble");

  if (!bubble) {
    bubble = document.createElement("div");
    bubble.className = "bgCatBubble";
    cat.appendChild(bubble);
  }

  bubble.textContent = text;
  bubble.classList.add("show");

  clearTimeout(cat._bubbleTimer);
  cat._bubbleTimer = setTimeout(() => {
    bubble.classList.remove("show");
  }, 2600);
}

function openCatDetailModal(catId) {
  const c = catById(catId);
  if (!c) return;

  const busy = isCatBusy(c.id);
  const statusText = busy === "quest" ? "クエスト中" : busy === "training" ? "訓練中" : "待機中";

  const fireLockedReason =
    !RANK.canFire(state.guildRank) ? "Rank5で解放" :
    c.level <= 1 ? "Lv2から解雇可" :
    (state.cats || []).length <= 1 ? "最後の1匹は不可" :
    busy ? "待機中のみ解雇可" :
    "";

  const canFire = fireLockedReason === "";
  
  const html = `
  <div class="panelCard" style="display:flex;gap:12px;align-items:center;">
    <div class="catSpriteWrap" style="position:relative;width:64px;height:64px;flex:0 0 64px;">
      <img
        src="${getDetailCatImage(c)}"
        class="catSprite colorized"
        style="--hue:${c.hue}deg;width:64px;height:64px;display:block;image-rendering:pixelated;"
        alt=""
      />

      <button
        class="ghost smallBtn"
        id="catDetailZoom"
        style="position:absolute;right:-6px;bottom:-6px;border-radius:999px;"
      >
        🔍
      </button>
    </div>

      <div style="min-width:0;">
        <div><b>${escapeHtml(c.name)}</b> <span class="dim">Lv${c.level}</span></div>
        <div class="dim">${escapeHtml(c.personality)} / ${statusText}</div>
        <div class="mono catStats">STR ${c.str} / SPD ${c.spd} / INT ${c.int}</div>
      </div>
    </div>

    <div class="panelCard" style="margin-top:10px;">
      <div class="dim">EXP ${c.exp}/${LEVEL.expToNext(c.level)}</div>
    </div>

    <div style="margin-top:12px;">
  <button class="ghost" id="catDetailFavorite" style="width:100%;">
    ${
      state.favoriteCatId === c.id
        ? "★ 助っ人中"
        : "☆ 助っ人登録"
    }
  </button>
</div>

<div class="modalFooter">
  <button class="ghost" id="catDetailClose">閉じる</button>

  <button class="ghost" id="catDetailRename">
    名前変更
  </button>

  <button
    class="ghost"
    id="catDetailFire"
    ${canFire ? "" : "disabled"}
    style="${canFire ? "" : "opacity:.6;"}"
  >
    ${canFire ? "解雇" : fireLockedReason}
  </button>
</div>
  `;

  openModal("ネコ詳細", html);

  document.getElementById("catDetailClose")?.addEventListener("click", closeModal);

  document.getElementById("catDetailRename")?.addEventListener("click", () => {
    closeModal();
    openRenameCatModal(catId);
  });
  document.getElementById("catDetailZoom")
  ?.addEventListener("click", () => {

    openCatZoomModal(c);

  }); 
  document.getElementById("catDetailFire")?.addEventListener("click", () => {
  closeModal();
  openFireCatModal(catId);
});
   document.getElementById("catDetailFavorite")?.addEventListener("click", () => {
  if (state.favoriteCatId === c.id) {
    state.favoriteCatId = null;
    pushLog(`${c.name} を助っ人登録から外したにゃ`);
  } else {
    state.favoriteCatId = c.id;
    pushLog(`${c.name} を助っ人登録したにゃ`);
  }

  save();
  renderAll();

  openCatDetailModal(c.id);
});
}

function openCatZoomModal(cat) {

  const img = getDisplayCatImage(cat);

  const html = `
    <div style="text-align:center;">

      <img
        src="${img}"
        class="colorized"
        style="
          --hue:${cat.hue}deg;
          width:240px;
          image-rendering:pixelated;
        "
      >

      <div style="margin-top:12px;font-size:20px;">
        ${
  state.favoriteCatId === cat.id
    ? "★ "
    : ""
}${escapeHtml(cat.name)}
      </div>

    </div>
  `;

  openModal("ネコ鑑賞", html);
}

function renderTrainingTab() {
  ensureTrainingState();
  ensureAdState();

  const adLeft =
    AD_REWARD.DAILY_LIMIT -
    state.adReward.count;

  const itemAndAdHtml = `
    <div class="panelCard">
      <div class="row">
        <div>
          <div><b>アイテム</b></div>
          <div class="dim">訓練で使える支援アイテム</div>
        </div>

        <div class="mono">
          🌿 ×${state.items?.matatabi || 0}
        </div>
      </div>
    </div>

    <div class="panelCard">
      <div><b>🎁 ギルド協会の支援物資</b></div>

      <div class="dim" style="margin-top:6px;">
        広告を見るとマタタビを1個もらえます
      </div>

      <div class="dim">
        本日あと ${adLeft}/${AD_REWARD.DAILY_LIMIT} 回
      </div>

      <button
        id="watchMatatabiAd"
        class="primary adBtn"
        style="margin-top:10px;width:100%;"
        ${adLeft <= 0 ? "disabled" : ""}
      >
        ${adLeft <= 0 ? "本日の受取済み" : "広告を見る"}
      </button>
    </div>
  `;

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
  ${itemAndAdHtml}

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
  document.getElementById("watchMatatabiAd")
  ?.addEventListener("click", watchMatatabiAd);
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
    const n = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0);
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
    const cat =
  state.cats.find(c => c.id === job.catId);

img.src = getTrainingImage(
  cat,
  jimFlip ? 2 : 1
);
  }
}

/* =========================
   Start
   ========================= */
boot();

const bgCat = createBgCat();

if (bgCat) {
  setInterval(()=>{
    moveBgCat(bgCat);
  }, 8000);
}

console.log("END");
