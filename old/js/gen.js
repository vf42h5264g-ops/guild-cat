// ====== マスター（Phase1） ======

const PERSONALITIES = [
  { key: "tsundere", label: "ツンデレ" },
  { key: "amaenbo",  label: "あまえんぼ" },
  { key: "cool",     label: "クール" },
  { key: "yanch",    label: "やんちゃ" },
  { key: "nonbiri",  label: "のんびり" },
];

const COATS = [
  "白", "黒", "茶トラ", "グレー", "ミントブルー",
  "クリーム", "三毛", "サバトラ", "ラベンダー", "金色"
];

// 模様10種（灼眼=15%、ハート=5%、他=均等）
const PATTERNS = [
  { key: "shima", label: "しましま", w: 10 },
  { key: "hachi", label: "ハチワレ", w: 10 },
  { key: "buchi", label: "ぶち", w: 10 },
  { key: "kamen", label: "仮面", w: 10 },
  { key: "socks", label: "ソックス", w: 10 },
  { key: "gyaku", label: "逆三角", w: 10 },
  { key: "hanten", label: "斑点", w: 10 },
  { key: "star", label: "星模様", w: 10 },
  { key: "shakugan", label: "灼眼", w: 15 },
  { key: "heart", label: "ハート模様", w: 5 },
];

// 名前：30×30（例として30ずつ用意）
const NAME_HEADS = [
  "ミ", "ル", "ソ", "コ", "タ", "ナ", "ハ", "ア", "レ", "ユ",
  "モ", "キ", "サ", "ト", "フ", "シ", "メ", "カ", "ホ", "リ",
  "オ", "マ", "チ", "ノ", "ヒ", "セ", "ワ", "ニ", "ス", "ク",
];

const NAME_TAILS = [
  "ント", "ナ", "ラ", "コ", "マル", "ミ", "ル", "ン", "トラ", "ネ",
  "コ", "リ", "チ", "サ", "ハ", "モ", "カ", "ホ", "キ", "ユ",
  "オ", "セ", "ワ", "ノ", "フ", "シ", "メ", "ニ", "ス", "ク",
];

// クエタイトル候補（5ずつ）
const QUEST_TITLES = {
  hunt: [
    "森のオオカミ討伐",
    "廃鉱山のスライム退治",
    "崖下の盗賊団掃討",
    "夜道の影獣ハント",
    "古城のゴースト討伐",
  ],
  explore: [
    "古代遺跡の調査",
    "霧の森の資源探索",
    "砂浜の漂流物回収",
    "山岳地帯の地図作成",
    "地下水路の調査任務",
  ],
  guard: [
    "商人の街道護衛",
    "王都への荷馬車護送",
    "研究者の森行き同行",
    "村人の移動支援",
    "交易船の港警備",
  ],
};

// Phase1 固定テーブル
const QUEST_TABLE = {
  hunt:    { type: "hunt",    durationSec: 30,  difficulty: 180, rewardGold: 180, rewardExp: 18, icon: "🗡" , label:"討伐" },
  explore: { type: "explore", durationSec: 120, difficulty: 140, rewardGold: 120, rewardExp: 15, icon: "🧭", label:"探索" },
  guard:   { type: "guard",   durationSec: 300, difficulty: 110, rewardGold: 90,  rewardExp: 12, icon: "🛡", label:"護衛" },
};

// ====== util ======

function randInt(min, max) { // inclusive
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function pickUnique(arr, n) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}
function weightedPick(items) {
  const total = items.reduce((s, it) => s + (it.w ?? 1), 0);
  let r = Math.random() * total;
  for (const it of items) {
    r -= (it.w ?? 1);
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}
function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// ====== exports ======

export function personalityLabel(key) {
  const p = PERSONALITIES.find(p => p.key === key);
  return p ? p.label : key;
}

export function generateStarterCats() {
  // 性格重複なしで3匹
  const picked = pickUnique(PERSONALITIES, 3).map(p => p.key);

  return picked.map((personalityKey) => {
    let power = randInt(45, 65);
    let luck  = randInt(8, 18);

    // 初期生成時の微補正（確定：A）
    if (personalityKey === "yanch") {
      power += randInt(2, 4);
    } else if (personalityKey === "tsundere") {
      luck += randInt(1, 3);
    } else if (personalityKey === "cool") {
      power += 1; luck += 1;
    } else if (personalityKey === "nonbiri") {
      luck += randInt(1, 2);
    } // amaenboは補正なし

    const cat = {
      id: uid("cat"),
      name: randomName(),
      personality: personalityKey,
      level: 1,
      exp: 0,
      power,
      luck,
      coat: randomCoat(),
      pattern: randomPattern().label,
      createdAt: Date.now(),
    };
    return cat;
  });
}

export function randomName() {
  return `${pick(NAME_HEADS)}${pick(NAME_TAILS)}`;
}

export function randomCoat() {
  return pick(COATS);
}

export function randomPattern() {
  return weightedPick(PATTERNS);
}

export function generateDaily(dateKey) {
  const qTypes = ["hunt", "explore", "guard"];
  const quests = qTypes.map((t) => {
    const base = QUEST_TABLE[t];
    return {
      id: uid(`q_${t}`),
      type: base.type,
      icon: base.icon,
      typeLabel: base.label,
      title: pick(QUEST_TITLES[t]),
      durationSec: base.durationSec,
      difficulty: base.difficulty,
      rewardGold: base.rewardGold,
      rewardExp: base.rewardExp,
      notes: recommendNote(base.type),
    };
  });

  // ✅ 追加：長時間（8時間）クエを1つ生成
  // 既存3クエの「1秒あたり報酬」を平均して8時間分にする（A：時間比例）
  const D8H = 8 * 60 * 60; // 28800 sec

  const avgGoldPerSec =
    quests.reduce((s, q) => s + (q.rewardGold / Math.max(1, q.durationSec)), 0) / quests.length;

  const avgExpPerSec =
    quests.reduce((s, q) => s + (q.rewardExp / Math.max(1, q.durationSec)), 0) / quests.length;

  const rewardGold = Math.max(1, Math.round(avgGoldPerSec * D8H * 0.90)); // Goldは少し抑制
  const rewardExp  = Math.max(1, Math.round(avgExpPerSec  * D8H * 1.00)); // EXPは比例

  const avgDiff =
    quests.reduce((s, q) => s + (q.difficulty || 0), 0) / quests.length;

  const difficulty = Math.max(1, Math.round(avgDiff * 1.15));

  quests.push({
    id: "long_8h", // 固定ID（重複防止＆デバッグしやすい）
    type: "explore",
    icon: "🌙",
    typeLabel: "長時間遠征",
    title: "夜通しパトロール",
    durationSec: D8H,
    difficulty,
    rewardGold,
    rewardExp,
    notes: "放置向け：報酬は時間に比例（Goldは少し控えめ）",
  });

  return { dateKey, quests, generatedAt: Date.now() };
}

function recommendNote(type) {
  // Phase1の雰囲気用（ロジックには未接続）
  if (type === "hunt") return "推奨：やんちゃ向き";
  if (type === "explore") return "推奨：クール向き";
  if (type === "guard") return "推奨：のんびり向き";
  return "";
}
