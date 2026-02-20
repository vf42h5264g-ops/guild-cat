// js/timer.js

export function startDispatch(state, quest, mult = 1) {
  const now = Date.now();

  const teamCatIds = (state.cats || []).map(c => c.id);

  // 最大8時間（秒）
  const MAX_SEC = 8 * 60 * 60;

  const baseSec = quest.durationSec;
  const durationSec = Math.min(baseSec * mult, MAX_SEC);

  state.dispatch = {
    inQuest: true,
    questId: quest.id,
    questSnapshot: { ...quest, durationSec }, // 実際の派遣時間でスナップ
    dispatchId: `d_${now}_${Math.random().toString(36).slice(2, 8)}`,
    startedAt: now,
    endAt: now + durationSec * 1000,
    settled: false,
    pendingResult: null,
    teamCatIds,
    mult, // ついでに保存
  };

  return state;
}

export function isDispatchActive(state) {
  return !!state.dispatch?.inQuest;
}

export function getRemainingSec(state) {
  if (!state.dispatch?.inQuest) return 0;
  const rem = Math.ceil((state.dispatch.endAt - Date.now()) / 1000);
  return Math.max(0, rem);
}

export function shouldSettle(state) {
  return !!state.dispatch?.inQuest
    && !state.dispatch.settled
    && Date.now() >= state.dispatch.endAt;
}

export function clearDispatch(state) {
  state.dispatch = {
    inQuest: false,
    questId: null,
    questSnapshot: null,
    dispatchId: null,
    startedAt: null,
    endAt: null,
    settled: false,
    pendingResult: null,
  };
  return state;
}

export function markDispatchPending(state, pendingResult) {
  // 派遣自体は終了。結果は pendingResult に保持
  state.dispatch.inQuest = false;
  state.dispatch.settled = true;
  state.dispatch.pendingResult = pendingResult; // { resultId, payload, claimed:false } など
  return state;
}
