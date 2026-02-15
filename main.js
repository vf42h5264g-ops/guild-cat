let gold = 100;
let inQuest = false;

const cats = [
  { name: "ミケ", power: 50, luck: 10 },
  { name: "シロ", power: 40, luck: 20 },
  { name: "クロ", power: 60, luck: 5 }
];

const quests = {
  easy: { time: 5000, difficulty: 100, reward: 30 },
  normal: { time: 10000, difficulty: 150, reward: 60 },
  hard: { time: 15000, difficulty: 220, reward: 120 }
};

function renderCats() {
  const list = document.getElementById("catList");
  list.innerHTML = "";
  cats.forEach(cat => {
    list.innerHTML += `🐾${cat.name} ⚔${cat.power} 🍀${cat.luck}<br>`;
  });
}

function updateGold() {
  document.getElementById("gold").textContent = gold;
}

function startQuest(type) {
  if (inQuest) return;

  inQuest = true;
  const quest = quests[type];
  document.getElementById("status").textContent = "派遣中...";

  setTimeout(() => {
    resolveQuest(quest);
  }, quest.time);
}

function resolveQuest(quest) {
  const totalPower = cats.reduce((sum, c) => sum + c.power, 0);
  const totalLuck = cats.reduce((sum, c) => sum + c.luck, 0);

  let successRate = totalPower / quest.difficulty;
  let resultText = "";

  if (successRate >= 1) {
    let bigSuccessChance = totalLuck / 100;
    if (Math.random() < bigSuccessChance) {
      gold += quest.reward * 2;
      resultText = "✨大成功！報酬2倍！";
    } else {
      gold += quest.reward;
      resultText = "🎉成功！";
    }
  } else {
    if (Math.random() < successRate) {
      gold += quest.reward;
      resultText = "🎉成功！";
    } else {
      resultText = "💦失敗...";
    }
  }

  updateGold();
  document.getElementById("status").textContent = resultText;
  inQuest = false;
}

renderCats();
updateGold();

