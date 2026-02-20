import { loadState, saveState } from "./storage.js";
import { getTodayKey, createNewState, ensureDaily, appendLog } from "./state.js";
import { render } from "./ui.js";

let state = null;

document.addEventListener("DOMContentLoaded", () => {
  boot();
});

function boot() {
  const todayKey = getTodayKey();
  state = loadState();

  if (!state) {
    state = createNewState(todayKey);
  }

  ensureDaily(state, todayKey);

  // M1から保存を入れる（確定）
  saveState(state);

  render(state);
  bindEvents();
}

function bindEvents() {
  const questsEl = document.getElementById("quests");
  if (!questsEl) throw new Error("Missing #quests");

  // イベント委譲：再描画しても生きる
  questsEl.addEventListener("click", (ev) => {
    const btn = ev.target?.closest?.('button[data-action="dispatch"]');
    if (!btn) return;

    const questId = btn.getAttribute("data-quest-id");
    if (!questId) return;

    onDispatchClick(questId);
  });
}

function onDispatchClick(questId) {
  const q = state?.daily?.quests?.find((x) => x.id === questId);
  const title = q ? `${q.icon} ${q.typeLabel}：${q.title}` : `questId=${questId}`;

  appendLog(state, `（準備中）派遣：${title}`);
  saveState(state);
  render(state);
}
