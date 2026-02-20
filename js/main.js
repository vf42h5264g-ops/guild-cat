// js/main.js
import { loadState, saveState } from "./storage.js";
import { getTodayKey, createNewState, ensureDaily, appendLog } from "./state.js";
import { render } from "./ui.js";
import { startDispatch, isDispatchActive, shouldSettle, clearDispatch } from "./timer.js";
import {
  calcSynergy,
  calcQuestTypeBonus,
  calcSuccessRate,
  calcGreatRate,
  rollOutcome,
  calcRewards,
  applyExpAndLevelUp
} from "./logic.js";

let state = null;
let tickHandle = null;

document.addEventListener("DOMContentLoaded", () => {
  boot();
});

function boot() {
  const todayKey = getTodayKey();
  state = loadState();

  if (!state) state = createNewState(todayKey);

  ensureDaily(state, todayKey);

  saveState(state);
  render(state);
  bindEvents();

  // ✅ 派遣中のみtick再開（pendingResult受取待ちはtick不要）
  if (isDispatchActive(state)) startTick();
}

function bindEvents() {
  const questsEl = document.getElementById("quests");
  if (!questsEl) throw new Error("Missing #quests");

  // ✅ dispatch と claim を同じ委譲で拾う
  questsEl.addEventListener("click", (ev) => {
    const btn = ev.target?.closest?.("button[data-action]");
    if (!btn) return;

    const action = btn.getAttribute("data-action");
    if (action === "dispatch") {
      const questId = btn.getAttribute("data-quest-id");
      if (!questId) return;
      onDispatchClick(questId);
      return;
    }

    if (action === "claim") {
      onClaimClick();
      return;
    }
  });
}

function onDispatchClick(questId) {
  // ✅ 派遣中 or 受取待ち があるなら開始できない
  if (state.dispatch?.inQuest) return;
  if (state.dispatch?.pendingResult) return;

  const q = state?.daily?.quests?.find((x) => x.id === questId);
  if (!q) return;

  // 派遣開始
  startDispatch(state, q);
  appendLog(state, `🚀 派遣開始：${q.icon} ${q.typeLabel}：${q.title}`);

  saveState(state);
  render(state);
  startTick();
}

function onClaimClick() {
  const pr = state.dispatch?.pendingResult;
  if (!pr) return;

  // ✅ 二重取り防止（保存データ側の防衛線）
  if (pr.claimed) return;

  const payload = pr.payload || {};
  const rewards = payload.rewards || { goldDelta: 0, expDelta: 0 };
  const goldDelta = rewards.goldDelta || 0;
  const expDelta = rewards.expDelta || 0;

  // 反映（ここで初めて付与）
  state.gold = (state.gold || 0) + goldDelta;

  // ✅ 参加ネコだけEXP
  const teamCatIds = payload.teamCatIds || state.dispatch?.teamCatIds || [];
  state.cats = (state.cats || []).map((c) => {
    if (!teamCatIds.includes(c.id)) return c;
    return applyExpAndLevelUp(c, expDelta);
  });

  // ログ
  const outcome = payload.outcome;
  if (outcome === "fail") {
    appendLog(state, `💦 失敗… +0G +${expDelta}EXP（受取）`);
  } else if (outcome === "success") {
    appendLog(state, `🎉 成功！ +${goldDelta}G +${expDelta}EXP（受取）`);
  } else if (outcome === "great") {
    appendLog(state, `✨ 大成功！ +${goldDelta}G +${expDelta}EXP（受取）`);
  } else {
    appendLog(state, `🎁 報酬受取：+${goldDelta}G +${expDelta}EXP`);
  }

  // ✅ claimed を立ててから、dispatchを完全クリア
  pr.claimed = true;
  clearDispatch(state);

  saveState(state);
  render(state);
}

function startTick() {
  stopTick();
  tickHandle = setInterval(() => {
    // 終了してたら「結果を確定（pendingResult作成）」へ
    if (shouldSettle(state)) {
      settleDispatchToPending();
      return;
    }
    render(state);
  }, 1000);
}

function stopTick() {
  if (tickHandle) {
    clearInterval(tickHandle);
    tickHandle = null;
  }
}

// ✅ M3：ここでは「反映」しない。pendingResult を作って保存するだけ。
function settleDispatchToPending() {
  stopTick();

  const quest = state.dispatch?.questSnapshot;
  if (!quest) {
    // 壊れてたら完全クリア
    clearDispatch(state);
    saveState(state);
    render(state);
    return;
  }

  // チーム集計（Phase1：全員参加）
  const teamPower = (state.cats || []).reduce((s, c) => s + (c.power || 0), 0);
  const teamLuck = (state.cats || []).reduce((s, c) => s + (c.luck || 0), 0);
  const teamPersonalities = (state.cats || []).map((c) => c.personality);

  // 相性・補正
  const synergy = calcSynergy(teamPersonalities);
  const questBonus = calcQuestTypeBonus(quest.type, teamPersonalities);

  const successRate = calcSuccessRate({
    teamPower,
    difficulty: quest.difficulty,
    synergyEffects: synergy.effects,
    questBonus,
  });
  const greatRate = calcGreatRate({
    teamLuck,
    difficulty: quest.difficulty,
    synergyEffects: synergy.effects,
  });

  // 判定
  const outcome = rollOutcome(successRate, greatRate);

  // 報酬（確定して pendingResult に固定）
  const { goldDelta, expDelta } = calcRewards(quest, outcome);

  // ✅ 参加ネコID（現状は全員参加。将来は選抜UIで差し替え）
　const teamCatIds = state.dispatch.teamCatIds || (state.cats || []).map(c => c.id);

  // ✅ pendingResult を「一度だけ」作る（二重生成を防ぐ）
  state.dispatch.settled = true;
  state.dispatch.inQuest = false;
  state.dispatch.pendingResult = {
    resultId: state.dispatch.dispatchId || `res_${Date.now()}`,
    createdAt: Date.now(),
    claimed: false,
    payload: {
      outcome,
      rewards: { goldDelta, expDelta },
      // 参考情報（UIやデバッグ用に残したければ）
      questTitle: `${quest.icon} ${quest.typeLabel}：${quest.title}`,
      teamCatIds, // ← 追加
    },
  };

  // ログ：受取待ちに入ったことだけ残す（付与はまだしない）
  appendLog(state, `🎁 帰還：${quest.icon} ${quest.typeLabel}：${quest.title}（報酬受取待ち）`);

  saveState(state);
  render(state);
}
