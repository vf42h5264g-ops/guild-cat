// js/ui.js
import { personalityLabel } from "./gen.js";
import { calcSynergy, calcQuestTypeBonus, calcSuccessRate } from "./logic.js";
import { getRemainingSec } from "./timer.js";

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

function fmtMMSS(totalSec) {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function chanceToLabel(rate) {
  // 低い: 5〜44 / ふつう: 45〜64 / 高い: 65〜95
  const pct = rate * 100;
  if (pct <= 44) return { text: "低い", cls: "badge-low" };
  if (pct <= 64) return { text: "ふつう", cls: "badge-mid" };
  return { text: "高い", cls: "badge-high" };
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
    if (state.dispatch?.inQuest) {
    const rem = getRemainingSec(state);
    qs("status").textContent = `⏳ 派遣中 ${fmtMMSS(rem)}`;
  } else if (state.dispatch?.pendingResult) {
    qs("status").textContent = `🎁 帰還！報酬受取待ち`;
  } else {
    qs("status").textContent = `🟢 待機中`;
  }
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
  const teamPersonalities = (state.cats || []).map(c => c.personality);
  const teamPower = (state.cats || []).reduce((s, c) => s + (c.power || 0), 0);
  const synergy = calcSynergy(teamPersonalities);

  wrap.innerHTML = daily.quests.map((q) => {
    const questBonus = calcQuestTypeBonus(q.type, teamPersonalities);
    const successRate = calcSuccessRate({
      teamPower,
      difficulty: q.difficulty,
      synergyEffects: synergy.effects,
      questBonus,
    });
    const chance = chanceToLabel(successRate);
    const isActive = inQuest && activeQuestId === q.id;

    const actionsHtml = (() => {
      if (isActive) {
        const rem = getRemainingSec(state);
        return `<div class="actions"><div class="muted">⏳ 進行中…（残り ${fmtMMSS(rem)}）</div></div>`;
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
    // 次LV必要EXP（表示用）
    const need = 20 * (c.level || 1);
    const exp = c.exp || 0;
    return `
      <div class="card">
        <div class="cardTitle">${c.name}（${pLabel}） Lv${c.level}</div>
        <div class="meta">
          <div>⚔ ${c.power}</div>
          <div>🍀 ${c.luck}</div>
        </div>
        <div class="muted">${c.coat} / ${c.pattern}</div>
        <div class="muted" style="margin-top:6px;">EXP: ${exp}/${need}</div>
      </div>
    `;
  }).join("");
}

export function renderSynergy(state) {
  const teamPersonalities = (state.cats || []).map(c => c.personality);
  const synergy = calcSynergy(teamPersonalities);
  const prefix =
    synergy.label.startsWith("火花") ? "🔥" :
    synergy.label.startsWith("安心") ? "🧊" :
    synergy.label.startsWith("あまえんぼ") ? "🍯" :
    synergy.label.startsWith("バランス") ? "🤝" :
    synergy.label.startsWith("統一") ? "🧩" : "🤝";
  qs("synergy").textContent = `${prefix} 相性：${synergy.label}`;
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
