// js/main.js
import { loadState, saveState } from "./storage.js";
import { getTodayKey, createNewState, ensureDaily, appendLog } from "./state.js";
import { render } from "./ui.js";
import { startDispatch, isDispatchActive, shouldSettle, getRemainingSec, clearDispatch } from "./timer.js";
import { calcSynergy, calcQuestTypeBonus, calcSuccessRate, calcGreatRate, rollOutcome, calcRewards, applyExpAndLevelUp } from "./logic.js";

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

  // 派遣中で復帰した場合はtick再開
  if (isDispatchActive(state)) startTick();
}

function bindEvents() {
  const questsEl = document.getElementById("quests");
  if (!questsEl) throw new Error("Missing #quests");

  questsEl.addEventListener("click", (ev) => {
    const btn = ev.target?.closest?.('button[data-action="dispatch"]');
    if (!btn) return;

    const questId = btn.getAttribute("data-quest-id");
    if (!questId) return;

    onDispatchClick(questId);
  });
}

function onDispatchClick(questId) {
  if (state.dispatch?.inQuest) return;

  const q = state?.daily?.quests?.find((x) => x.id === questId);
  if (!q) return;

  // 派遣開始
  startDispatch(state, q);
  appendLog(state, `🚀 派遣開始：${q.icon} ${q.typeLabel}：${q.title}`);

  saveState(state);
  render(state);
  startTick();
}

function startTick() {
  stopTick();
  tickHandle = setInterval(() => {
    // 終了してたら清算
    if (shouldSettle(state)) {
      settleDispatch();
      return;
    }
    // 表示更新（軽量化せず全renderでOK）
    render(state);
  }, 1000);
}

function stopTick() {
  if (tickHandle) {
    clearInterval(tickHandle);
    tickHandle = null;
  }
}

function settleDispatch() {
  // 念のため止める
  stopTick();

  const quest = state.dispatch?.questSnapshot;
  if (!quest) {
    clearDispatch(state);
    saveState(state);
    render(state);
    return;
  }

  // チーム集計
  const teamPower = (state.cats || []).reduce((s, c) => s + (c.power || 0), 0);
  const teamLuck  = (state.cats || []).reduce((s, c) => s + (c.luck || 0), 0);
  const teamPersonalities = (state.cats || []).map(c => c.personality);

  // 相性・補正
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

  // 判定
  const outcome = rollOutcome(successRate, greatRate);

  // 報酬
  const { goldDelta, expDelta } = calcRewards(quest, outcome);

  // 反映
  state.gold = (state.gold || 0) + goldDelta;
  state.cats = (state.cats || []).map(c => applyExpAndLevelUp(c, expDelta));

  // ログ
  if (outcome === "fail") {
    appendLog(state, `💦 失敗… +0G +${expDelta}EXP`);
  } else if (outcome === "success") {
    appendLog(state, `🎉 成功！ +${goldDelta}G +${expDelta}EXP`);
  } else {
    appendLog(state, `✨ 大成功！ +${goldDelta}G +${expDelta}EXP`);
  }

  // 派遣解除
  clearDispatch(state);

  saveState(state);
  render(state);
}
