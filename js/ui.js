import { personalityLabel } from "./gen.js";

function qs(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el;
}

function fmtDuration(sec) {
  if (sec < 60) return `${sec}秒`;
  if (sec % 60 === 0) return `${sec / 60}分`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}分${s}秒`;
}

// M1：まだ成功率計算は未接続なので、仮の見込みを置く
// M2で logic.js を繋いで「低/ふつう/高」を計算に差し替える
function roughChanceLabel(_state, quest) {
  // 固定テーブルに合わせた仮（あとで置換）
  if (quest.type === "guard") return { text: "高い", cls: "badge-high" };
  if (quest.type === "explore") return { text: "ふつう", cls: "badge-mid" };
  return { text: "低い", cls: "badge-low" };
}

export function render(state) {
  renderHeader(state);
  renderQuests(state);
  renderCats(state);
  renderSynergy(state);
  renderLog(state);
}

export function renderHeader(state) {
  qs("gold").textContent = `💰 ${state.gold ?? 0}G`;
  qs("status").textContent = state.dispatch?.inQuest ? `⏳ 派遣中` : `🟢 待機中`;
}

export function renderQuests(state) {
  const wrap = qs("quests");
  const daily = state.daily;
  if (!daily?.quests?.length) {
    wrap.innerHTML = `<div class="card">クエストがありません</div>`;
    return;
  }

  const inQuest = !!state.dispatch?.inQuest;
  const activeQuestId = state.dispatch?.questId;

  wrap.innerHTML = daily.quests.map((q) => {
    const chance = roughChanceLabel(state, q);
    const isActive = inQuest && activeQuestId === q.id;

    const actionsHtml = (() => {
      if (isActive) {
        return `<div class="actions"><div class="muted">⏳ 進行中…</div></div>`;
      }
      const disabled = inQuest ? "disabled" : "";
      return `
        <div class="actions">
          <button class="btn" ${disabled}
            data-action="dispatch"
            data-quest-id="${q.id}">
            派遣する
          </button>
        </div>
      `;
    })();

    const activeClass = isActive ? "isActive" : "";

    return `
      <div class="card ${activeClass}">
        <div class="cardTitle">${q.icon} ${q.typeLabel}：${q.title}</div>
        <div class="meta">
          <div>⏱ ${fmtDuration(q.durationSec)}</div>
          <div>💀 難易度 ${q.difficulty}</div>
        </div>
        <div class="rewards">
          <div>💰 ${q.rewardGold}</div>
          <div>⭐ ${q.rewardExp}</div>
        </div>
        <div class="muted">
          ${q.notes || ""}
          <span style="margin-left:10px;">成功見込み：</span>
          <span class="badge ${chance.cls}">${chance.text}</span>
        </div>
        ${actionsHtml}
      </div>
    `;
  }).join("");
}

export function renderCats(state) {
  const wrap = qs("cats");
  const cats = state.cats || [];
  wrap.innerHTML = cats.map((c) => {
    const pLabel = personalityLabel(c.personality);
    return `
      <div class="card">
        <div class="cardTitle">${c.name}（${pLabel}） Lv${c.level}</div>
        <div class="meta">
          <div>⚔ ${c.power}</div>
          <div>🍀 ${c.luck}</div>
        </div>
        <div class="muted">${c.coat} / ${c.pattern}</div>
      </div>
    `;
  }).join("");
}

// M1：相性はまだ計算未接続。表示だけ固定。
// M2で logic.calcSynergy() につなぐ
export function renderSynergy(_state) {
  qs("synergy").textContent = `🤝 相性：なし`;
}

export function renderLog(state) {
  const wrap = qs("log");
  const lines = Array.isArray(state.log) ? state.log : [];
  if (!lines.length) {
    wrap.innerHTML = `<div class="muted">まだログはありません</div>`;
    return;
  }
  wrap.innerHTML = lines.map((t) => `<div class="logLine">・${escapeHtml(t)}</div>`).join("");
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
