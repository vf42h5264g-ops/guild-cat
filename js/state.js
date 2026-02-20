import { generateStarterCats, generateDaily } from "./gen.js";

export function getTodayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function emptyDispatch() {
  return {
    inQuest: false,
    questId: null,
    questSnapshot: null,
    dispatchId: null,
    startedAt: null,
    endAt: null,
    settled: false,
    pendingResult: null,
  };
}

export function createNewState(todayKey) {
  return {
    gold: 0,
    cats: generateStarterCats(),
    daily: generateDaily(todayKey),
    dispatch: emptyDispatch(),
    log: [],
  };
}

export function ensureDaily(state, todayKey) {
  if (!state.daily || typeof state.daily !== "object") {
    state.daily = generateDaily(todayKey);
    return state;
  }
  if (state.daily.dateKey !== todayKey) {
    state.daily = generateDaily(todayKey);
  }
  return state;
}

export function appendLog(state, message) {
  state.log = Array.isArray(state.log) ? state.log : [];
  state.log.unshift(message);
  state.log = state.log.slice(0, 5);
  return state;
}
