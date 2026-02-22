// js/logic.js

// clamp utility
function clamp01(x) { return Math.max(0, Math.min(1, x)); }
function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

// ===== 相性（優先順位1つのみ） =====
export function calcSynergy(teamPersonalities) {
  const p = teamPersonalities;
  const set = new Set(p);
  const counts = p.reduce((m, k) => (m[k] = (m[k] || 0) + 1, m), {});

  const has = (k) => counts[k] > 0;

  // 1) 火花：ツンデレ×やんちゃ -> 大成功 +10%
  if (has("tsundere") && has("yanch")) {
    return { label: "火花コンボ（大成功率 +10%）", effects: { greatDelta: 0.10 } };
  }

  // 2) 安心：クール×のんびり -> 失敗 -10%（=成功率に+10%相当だが、後で失敗率として扱う）
  if (has("cool") && has("nonbiri")) {
    return { label: "安心コンボ（失敗率 -10%）", effects: { failDelta: -0.10 } };
  }

  // 3) あまえんぼ団：2匹以上 -> 成功 +10%
  if ((counts["amaenbo"] || 0) >= 2) {
    return { label: "あまえんぼ団（成功率 +10%）", effects: { successDelta: 0.10 } };
  }

  // 4) バランス：全員別 -> 成功 +8%
  if (set.size === 3) {
    return { label: "バランス編成（成功率 +8%）", effects: { successDelta: 0.08 } };
  }

  // 5) 統一感：2匹以上同一 -> 成功 +5%
  const hasDup = Object.values(counts).some(v => v >= 2);
  if (hasDup) {
    return { label: "統一感（成功率 +5%）", effects: { successDelta: 0.05 } };
  }

  return { label: "なし", effects: {} };
}

// ===== クエタイプ補正（軽め） =====
export function calcQuestTypeBonus(questType, teamPersonalities) {
  const counts = teamPersonalities.reduce((m, k) => (m[k] = (m[k] || 0) + 1, m), {});
  let successDelta = 0;

  if (questType === "hunt") {
    successDelta += 0.03 * (counts["yanch"] || 0);
  } else if (questType === "explore") {
    successDelta += 0.03 * (counts["cool"] || 0);
  } else if (questType === "guard") {
    successDelta += 0.03 * (counts["nonbiri"] || 0);
  }
  return { successDelta };
}

// ===== 成功率/大成功率 =====
export function calcBaseSuccessRate(teamPower, difficulty) {
  // teamPower / (teamPower + difficulty)
  const denom = teamPower + difficulty;
  if (denom <= 0) return 0;
  return clamp01(teamPower / denom);
}

export function calcSuccessRate({ teamPower, difficulty, synergyEffects, questBonus }) {
  const base = calcBaseSuccessRate(teamPower, difficulty);

  let rate = base;

  // successDelta (相性/タイプ) を加算
  rate += (synergyEffects?.successDelta || 0);
  rate += (questBonus?.successDelta || 0);

  // failDelta（安心コンボ）: 失敗率を-10% => 成功率を+10%相当として扱う
  if (typeof synergyEffects?.failDelta === "number") {
    rate += (-synergyEffects.failDelta); // failDelta=-0.10 => +0.10
  }

  // clamp 5%〜95%
  rate = clamp(rate, 0.05, 0.95);
  return rate;
}

export function calcGreatRate({ teamLuck, difficulty, synergyEffects }) {
  const denom = teamLuck + difficulty;
  let rate = denom <= 0 ? 0 : clamp01(teamLuck / denom);

  rate += (synergyEffects?.greatDelta || 0);

  // cap 60%
  rate = clamp(rate, 0, 0.60);
  return rate;
}

// ===== 判定 =====
export function rollOutcome(successRate, greatRate) {
  const r = Math.random();
  if (r > successRate) return "fail";
  // 成功した場合だけ大成功抽選
  const r2 = Math.random();
  if (r2 < greatRate) return "great";
  return "success";
}

// ===== 報酬（Phase1確定） =====
export function calcRewards(quest, outcome) {
  const baseG = quest.rewardGold;
  const baseE = quest.rewardExp;

  if (outcome === "fail") {
    return {
      goldDelta: 0,
      expDelta: Math.floor(baseE * 0.30),
    };
  }
  if (outcome === "success") {
    return {
      goldDelta: baseG,
      expDelta: baseE,
    };
  }
  // great
  return {
    goldDelta: baseG * 2,                 // 大成功Gold 200%（確定）
    expDelta: Math.floor(baseE * 1.60),   // 大成功EXP 160%
  };
}

// ===== レベルアップ（Phase1確定） =====
export function expToNext(level) {
  return 20 * level;
}

export function levelUpDelta(personality) {
  // 基本：power +2 / luck +1
  let p = 2;
  let l = 1;
  // 性格補正
  if (personality === "yanch") p += 1;
  else if (personality === "tsundere") l += 1;
  else if (personality === "cool") { p += 1; l += 1; }
  else if (personality === "nonbiri") l += 1;
  // amaenbo：追加なし
  return { p, l };
}

export function applyExpAndLevelUp(cat, expDelta) {
  const MAX_LV = 20;
  let c = { ...cat };
  c.exp = (c.exp || 0) + expDelta;

  while (c.level < MAX_LV) {
    const need = expToNext(c.level);
    if (c.exp < need) break;
    c.exp -= need;
    c.level += 1;

    const d = levelUpDelta(c.personality);
    c.power += d.p;
    c.luck += d.l;
  }
  return c;
}

// ===== M3: pendingResult + 二重取り防止 =====

// resultId（nonce）
export function makeResultId() {
  return `res_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

// 1回の派遣結果を「確定」して返す（※受取時に再計算しない）
export function computeDispatchResult({ quest, teamCats }) {
  const teamPower = teamCats.reduce((s, c) => s + (c.power || 0), 0);
  const teamLuck  = teamCats.reduce((s, c) => s + (c.luck  || 0), 0);
  const teamPersonalities = teamCats.map(c => c.personality);

  const synergy = calcSynergy(teamPersonalities);
  const questBonus = calcQuestTypeBonus(quest.type, teamPersonalities);

  const successRate = calcSuccessRate({
    teamPower,
    difficulty: quest.difficulty,
    synergyEffects: synergy.effects,
    questBonus
  });

  const greatRate = calcGreatRate({
    teamLuck,
    difficulty: quest.difficulty,
    synergyEffects: synergy.effects
  });

  const outcome = rollOutcome(successRate, greatRate);
  const rewards = calcRewards(quest, outcome);

  return {
    outcome,
    successRate,
    greatRate,
    synergyLabel: synergy.label,
    rewards, // { goldDelta, expDelta }
  };
}

/**
 * dispatching -> pendingResult への遷移を「一度だけ」確定させる
 * - endAtを過ぎたら pendingResult を生成して固定
 * - すでに pendingResult があれば再生成しない（＝二重取りの根絶）
 *
 * 想定state例：
 * state.guild.dispatch = {
 *   state: "idle"|"dispatching"|"pendingResult",
 *   endAt: number,
 *   questId: string,
 *   teamCatIds: string[],
 *   pendingResult: null | { resultId, createdAt, payload, claimed }
 * }
 */
export function tickDispatchToPending(state, { getQuestById } = {}) {
  const d = state?.guild?.dispatch;
  if (!d) return false;

  if (d.state !== "dispatching") return false;
  if (Date.now() < (d.endAt || 0)) return false;

  // 既に確定済みなら再生成しない（重要）
  if (d.pendingResult?.resultId) {
    d.state = "pendingResult";
    return true;
  }

  // quest取得
  const quest = getQuestById ? getQuestById(d.questId) : null;
  if (!quest) {
    // questが取れない場合は壊れないように pending にだけしておく（※UIで要救済表示推奨）
    d.pendingResult = {
      resultId: makeResultId(),
      createdAt: Date.now(),
      claimed: false,
      payload: { error: "QUEST_NOT_FOUND", questId: d.questId }
    };
    d.state = "pendingResult";
    return true;
  }

  // team取得（idで引ける想定。state.cats or state.guild.cats のどちらでも動くようにする）
  const allCats = state.cats || state.guild?.cats || [];
  const teamCats = (d.teamCatIds || [])
    .map(id => allCats.find(c => c.id === id))
    .filter(Boolean);

  const payload = computeDispatchResult({ quest, teamCats });

  d.pendingResult = {
    resultId: makeResultId(),
    createdAt: Date.now(),
    claimed: false,
    payload, // outcome/rewards 等
  };
  d.state = "pendingResult";
  return true;
}

// 連打・二重クリック対策ロック（メモリ上）
let __claimLock = false;

/**
 * pendingResult を受け取る（1回だけ）
 * - claimedフラグで二重取り防止（保存データ側の最終防衛線）
 * - lockで連打防止（UI側の事故防止）
 *
 * applyGold / updateCats は外から注入できる形にして、既存実装に合わせやすくする
 */
export function claimPendingResult(
  state,
  { applyGold, updateCats, save } = {}
) {
  const d = state?.guild?.dispatch;
  if (!d || d.state !== "pendingResult" || !d.pendingResult) {
    return { ok: false, reason: "no_pending" };
  }

  if (__claimLock) return { ok: false, reason: "locked" };
  __claimLock = true;

  try {
    const pr = d.pendingResult;
    if (pr.claimed) return { ok: false, reason: "already_claimed" };

    // ここで付与（payload.rewards を消費するだけ！再計算しない）
    const payload = pr.payload || {};
    const rewards = payload.rewards || { goldDelta: 0, expDelta: 0 };

    // Gold
    if (typeof applyGold === "function") {
      applyGold(rewards.goldDelta || 0);
    } else {
      // フォールバック：state.guild.gold を直接加算
      state.guild.gold = (state.guild.gold || 0) + (rewards.goldDelta || 0);
    }

    // EXP（派遣に出した猫へ）
    if (typeof updateCats === "function") {
      // updateCats 側で teamCatIds を見て applyExpAndLevelUp を回す想定
      updateCats(rewards.expDelta || 0);
    } else {
      // フォールバック：teamCatIds を使ってここで更新
      const allCats = state.cats || state.guild?.cats || [];
      const ids = d.teamCatIds || [];
      const next = allCats.map(c => {
        if (!ids.includes(c.id)) return c;
        return applyExpAndLevelUp(c, rewards.expDelta || 0);
      });
      if (state.cats) state.cats = next;
      else if (state.guild?.cats) state.guild.cats = next;
    }

    // 二重取り防止：先に claimed を立てる
    pr.claimed = true;

    // 受取後は idle に戻して pending を消す（事故りにくい）
    d.pendingResult = null;
    d.state = "idle";
    d.endAt = 0;
    d.questId = null;
    d.teamCatIds = [];

    if (typeof save === "function") save();

    return { ok: true, payload };
  } finally {
    setTimeout(() => { __claimLock = false; }, 250);
  }
}
