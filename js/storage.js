const LS_KEY = "neko_guild_state_v1";

export function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch (e) {
    console.warn("loadState failed:", e);
    return null;
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("saveState failed:", e);
  }
}

// デバッグ用（任意）
export function clearState() {
  try {
    localStorage.removeItem(LS_KEY);
  } catch (e) {
    console.warn("clearState failed:", e);
  }
}
