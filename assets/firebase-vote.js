import { initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import {
  collection,
  doc,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  writeBatch
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

const voteData = window.__MSC_VOTE_DATA__ || {};
const firebaseConfig = window.__MSC_FIREBASE_CONFIG__ || {};
const DAY_KEYS = Object.keys(voteData);
const RANK_POINTS = [2, 1];
const SESSION_STORAGE_KEY = "msc-grandiosa-browser-session-v1";

const voteMeta = Object.fromEntries(
  Object.entries(voteData).map(([dayKey, rows]) => [
    dayKey,
    {
      label: rows[0].dayLabel,
      titles: Object.fromEntries(rows.slice(1).map(item => [item.code, item.title]))
    }
  ])
);

let firebaseApp = null;
let db = null;
let votesUnsubscribe = null;
let historyUnsubscribe = null;
let votesLoaded = false;
let historyLoaded = false;
let sharedVotes = [];
let sharedHistory = [];

function collapseWhitespace(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function normalizeDays(days) {
  const normalized = {};
  DAY_KEYS.forEach(dayKey => {
    const rawRanks = days && Array.isArray(days[dayKey]) ? days[dayKey] : [];
    normalized[dayKey] = rawRanks
      .filter(code => typeof code === "string" && code)
      .slice(0, 2);
  });
  return normalized;
}

function getTimestampIso(value) {
  if (!value) return new Date().toISOString();
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  if (typeof value.seconds === "number") {
    return new Date(value.seconds * 1000).toISOString();
  }
  return new Date().toISOString();
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeCsv(value) {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function formatDateTime(isoString) {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function getDownloadStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function downloadText(filename, mimeType, content) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function getActorSession() {
  const existing = localStorage.getItem(SESSION_STORAGE_KEY);
  if (existing) return existing;

  const randomPart = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
  const sessionId = `browser-${Date.now().toString(36)}-${randomPart}`;
  localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
  return sessionId;
}

function getNameKey(name) {
  return collapseWhitespace(name).toLocaleLowerCase("zh-CN");
}

function getVoteDocId(name) {
  return encodeURIComponent(getNameKey(name));
}

function validateRanks(values) {
  const filtered = values.filter(Boolean);
  return filtered.length === 3 && new Set(filtered).size === 3;
}

function serializeVoteDoc(snapshot) {
  const data = snapshot.data() || {};
  return {
    id: snapshot.id,
    name: collapseWhitespace(data.name),
    nameKey: collapseWhitespace(data.nameKey),
    days: normalizeDays(data.days),
    updatedAt: getTimestampIso(data.updatedAt),
    updatedBySession: collapseWhitespace(data.updatedBySession)
  };
}

function serializeHistoryDoc(snapshot) {
  const data = snapshot.data() || {};
  return {
    id: snapshot.id,
    type: data.type === "reset" ? "reset" : "submit",
    name: collapseWhitespace(data.name),
    nameKey: collapseWhitespace(data.nameKey),
    days: normalizeDays(data.days),
    submittedAt: getTimestampIso(data.submittedAt),
    actorSession: collapseWhitespace(data.actorSession)
  };
}

function setSyncStatus(message, tone = "loading") {
  const node = document.getElementById("sync-status");
  if (!node) return;
  node.textContent = message;
  node.className = "vote-sync-status";
  if (tone) node.classList.add(`is-${tone}`);
}

function setFormDisabled(disabled) {
  const form = document.getElementById("vote-form");
  if (!form) return;

  Array.from(form.elements).forEach(element => {
    if (!(element instanceof HTMLElement)) return;
    if (element.id === "refresh-shared-votes") return;
    element.disabled = disabled;
  });

  const refreshButton = document.getElementById("refresh-shared-votes");
  if (refreshButton) refreshButton.disabled = false;
}

function buildForm() {
  const container = document.getElementById("day-groups");
  const fragments = [];

  Object.entries(voteData).forEach(([dayKey, rows]) => {
    const meta = rows[0];
    const options = rows.slice(1);
    const optionHtml = options
      .map(item => `<option value="${item.code}">${item.code} | ${item.title}</option>`)
      .join("");

    fragments.push(`
      <section class="day-vote-card">
        <h3>${meta.dayLabel}</h3>
        <p class="small-note">请按最想去的顺序选出 2 个不同项目。</p>
        <div class="rank-grid">
          <label class="field">
            <span>第 1 名</span>
            <select name="${dayKey}-1" required>
              <option value="">请选择</option>
              ${optionHtml}
            </select>
          </label>
          <label class="field">
            <span>第 2 名</span>
            <select name="${dayKey}-2" required>
              <option value="">请选择</option>
              ${optionHtml}
            </select>
          </label>
        </div>
      </section>
    `);
  });

  container.innerHTML = fragments.join("");
}

function getAnnotatedHistory() {
  const counters = {};
  const ascending = sharedHistory
    .slice()
    .sort((a, b) => new Date(a.submittedAt) - new Date(b.submittedAt));

  const withRevision = ascending.map(entry => {
    if (entry.type === "submit") {
      counters[entry.nameKey] = (counters[entry.nameKey] || 0) + 1;
      return { ...entry, revision: counters[entry.nameKey] };
    }

    return {
      ...entry,
      revision: counters[entry.nameKey] || 0
    };
  });

  return withRevision.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
}

function renderResults() {
  const resultsNode = document.getElementById("results");
  if (!resultsNode) return;

  if (!votesLoaded && !sharedVotes.length) {
    resultsNode.innerHTML = '<p class="small-note">正在从共享数据库加载结果…</p>';
    return;
  }

  if (!sharedVotes.length) {
    resultsNode.innerHTML = '<p class="small-note">共享数据库里还没有有效投票。</p>';
    return;
  }

  const scoreMap = {};
  DAY_KEYS.forEach(dayKey => {
    scoreMap[dayKey] = {
      label: voteMeta[dayKey].label,
      titles: voteMeta[dayKey].titles,
      tallies: {}
    };
  });

  sharedVotes.forEach(vote => {
    Object.entries(vote.days).forEach(([dayKey, ranks]) => {
      if (!scoreMap[dayKey]) return;

      RANK_POINTS.forEach((points, index) => {
        const code = ranks[index];
        if (!code) return;

        if (!scoreMap[dayKey].tallies[code]) {
          scoreMap[dayKey].tallies[code] = { points: 0, first: 0, second: 0 };
        }

        scoreMap[dayKey].tallies[code].points += points;
        if (index === 0) scoreMap[dayKey].tallies[code].first += 1;
        if (index === 1) scoreMap[dayKey].tallies[code].second += 1;
      });
    });
  });

  const dayHtml = Object.values(scoreMap).map(entry => {
    const rankedRows = Object.entries(entry.tallies)
      .sort((a, b) => b[1].points - a[1].points || b[1].first - a[1].first || a[0].localeCompare(b[0], "zh-CN"))
      .map(([code, stats]) => `
        <tr>
          <td>${escapeHtml(code)}</td>
          <td>${escapeHtml(entry.titles[code] || code)}</td>
          <td>${stats.points}</td>
          <td>${stats.first}</td>
          <td>${stats.second}</td>
        </tr>
      `)
      .join("");

    return `
      <section class="result-day-card">
        <h3>${escapeHtml(entry.label)}</h3>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>代码</th><th>项目</th><th>总分</th><th>第 1 名票数</th><th>第 2 名票数</th></tr>
            </thead>
            <tbody>
              ${rankedRows || '<tr><td colspan="5">这一日还没有投票。</td></tr>'}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }).join("");

  const voters = sharedVotes
    .map(vote => vote.name)
    .sort((a, b) => a.localeCompare(b, "zh-CN"));

  resultsNode.innerHTML = `
    <div class="vote-summary">
      <p><strong>当前投票人数：</strong>${sharedVotes.length}</p>
      <p><strong>已投票名单：</strong>${voters.map(escapeHtml).join("、")}</p>
    </div>
    ${dayHtml}
  `;
}

function renderVoteHistory() {
  const historyNode = document.getElementById("vote-history");
  const jsonButton = document.getElementById("export-vote-history-json");
  const csvButton = document.getElementById("export-vote-history-csv");
  if (!historyNode || !jsonButton || !csvButton) return;

  const annotatedHistory = getAnnotatedHistory();
  const hasHistory = annotatedHistory.length > 0;
  jsonButton.disabled = !hasHistory;
  csvButton.disabled = !hasHistory;

  if (!historyLoaded && !annotatedHistory.length) {
    historyNode.innerHTML = '<p class="small-note">正在从共享数据库加载投票记录…</p>';
    return;
  }

  if (!hasHistory) {
    historyNode.innerHTML = '<p class="small-note">共享数据库里还没有投票记录。</p>';
    return;
  }

  const submitCount = annotatedHistory.filter(entry => entry.type === "submit").length;
  const resetCount = annotatedHistory.filter(entry => entry.type === "reset").length;
  const latestEntry = annotatedHistory[0];

  const listHtml = annotatedHistory.map(entry => {
    if (entry.type === "reset") {
      return `
        <div class="vote-log-card vote-log-card-static">
          <div class="vote-log-summary">
            <span class="vote-log-summary-name">${escapeHtml(entry.name)}</span>
            <span class="vote-log-summary-meta">清除了当前共享投票 · ${escapeHtml(formatDateTime(entry.submittedAt))}</span>
          </div>
        </div>
      `;
    }

    const dayHtml = DAY_KEYS.map(dayKey => {
      const ranks = entry.days[dayKey] || [];
      const rankHtml = ranks.map((code, index) => `
        <li>${index + 1}. ${escapeHtml(code)} | ${escapeHtml(voteMeta[dayKey].titles[code] || code)}</li>
      `).join("");

      return `
        <div class="vote-log-day">
          <p><strong>${escapeHtml(voteMeta[dayKey].label)}</strong></p>
          <ol class="vote-log-ranks">
            ${rankHtml}
          </ol>
        </div>
      `;
    }).join("");

    return `
      <details class="vote-log-card">
        <summary>
          <span class="vote-log-summary-name">${escapeHtml(entry.name)}</span>
          <span class="vote-log-summary-meta">第 ${entry.revision} 次提交 · ${escapeHtml(formatDateTime(entry.submittedAt))}</span>
        </summary>
        <div class="vote-log-body">
          ${dayHtml}
        </div>
      </details>
    `;
  }).join("");

  historyNode.innerHTML = `
    <div class="vote-summary">
      <p><strong>累计记录条数：</strong>${annotatedHistory.length}</p>
      <p><strong>提交记录：</strong>${submitCount} 条；<strong>清除记录：</strong>${resetCount} 条</p>
      <p><strong>最近一条：</strong>${escapeHtml(latestEntry.name)} · ${latestEntry.type === "reset" ? "清除当前共享投票" : `第 ${latestEntry.revision} 次提交`} · ${escapeHtml(formatDateTime(latestEntry.submittedAt))}</p>
    </div>
    <div class="vote-log-list">
      ${listHtml}
    </div>
  `;
}

function exportVoteHistoryJson() {
  const payload = {
    exportedAt: new Date().toISOString(),
    activeVotes: sharedVotes,
    voteHistory: getAnnotatedHistory()
  };

  downloadText(
    `msc-grandiosa-vote-history-${getDownloadStamp()}.json`,
    "application/json;charset=utf-8",
    JSON.stringify(payload, null, 2)
  );
}

function exportVoteHistoryCsv() {
  const rows = [[
    "action",
    "name",
    "revision",
    "submitted_at",
    "day_key",
    "day_label",
    "rank_1_code",
    "rank_1_title",
    "rank_2_code",
    "rank_2_title"
  ]];

  getAnnotatedHistory().forEach(entry => {
    if (entry.type === "reset") {
      rows.push(["reset", entry.name, "", entry.submittedAt, "", "", "", "", "", ""]);
      return;
    }

    DAY_KEYS.forEach(dayKey => {
      const ranks = entry.days[dayKey] || [];
      rows.push([
        "submit",
        entry.name,
        String(entry.revision),
        entry.submittedAt,
        dayKey,
        voteMeta[dayKey].label,
        ranks[0] || "",
        ranks[0] ? voteMeta[dayKey].titles[ranks[0]] || "" : "",
        ranks[1] || "",
        ranks[1] ? voteMeta[dayKey].titles[ranks[1]] || "" : ""
      ]);
    });
  });

  const csv = rows.map(row => row.map(escapeCsv).join(",")).join("\n");
  downloadText(
    `msc-grandiosa-vote-history-${getDownloadStamp()}.csv`,
    "text/csv;charset=utf-8",
    csv
  );
}

function initializeFirestore() {
  if (db) return db;

  if (!firebaseConfig || !firebaseConfig.projectId || !firebaseConfig.apiKey) {
    throw new Error("missing-firebase-config");
  }

  firebaseApp = firebaseApp || initializeApp(firebaseConfig);
  db = db || getFirestore(firebaseApp);
  return db;
}

function stopRealtimeSync() {
  if (typeof votesUnsubscribe === "function") votesUnsubscribe();
  if (typeof historyUnsubscribe === "function") historyUnsubscribe();
  votesUnsubscribe = null;
  historyUnsubscribe = null;
}

function updateReadyState() {
  if (!votesLoaded || !historyLoaded) return;

  setFormDisabled(false);
  setSyncStatus(
    `共享投票已连通：当前 ${sharedVotes.length} 人有效投票，累计 ${sharedHistory.length} 条记录。`,
    "success"
  );
}

function handleSyncError(error, prefix) {
  console.error(prefix, error);
  setFormDisabled(false);
  const detail = error && typeof error.code === "string" ? `（${error.code}）` : "";
  setSyncStatus(`${prefix}${detail}。如果你刚刚开启 Firestore，稍等片刻后点“刷新共享数据”再试。`, "error");
}

function startRealtimeSync() {
  try {
    initializeFirestore();
  } catch (error) {
    handleSyncError(error, "Firebase 配置加载失败");
    return;
  }

  stopRealtimeSync();
  votesLoaded = false;
  historyLoaded = false;
  setFormDisabled(true);
  setSyncStatus("正在同步共享投票数据…", "loading");

  votesUnsubscribe = onSnapshot(
    query(collection(db, "votes"), orderBy("nameKey")),
    snapshot => {
      sharedVotes = snapshot.docs
        .map(serializeVoteDoc)
        .filter(vote => vote.name);
      votesLoaded = true;
      renderResults();
      updateReadyState();
    },
    error => {
      handleSyncError(error, "读取共享投票失败");
    }
  );

  historyUnsubscribe = onSnapshot(
    query(collection(db, "voteHistory"), orderBy("submittedAt", "desc")),
    snapshot => {
      sharedHistory = snapshot.docs
        .map(serializeHistoryDoc)
        .filter(entry => entry.name);
      historyLoaded = true;
      renderVoteHistory();
      updateReadyState();
    },
    error => {
      handleSyncError(error, "读取共享投票记录失败");
    }
  );
}

function getCurrentFormVote(form) {
  const name = collapseWhitespace(document.getElementById("voter-name").value);
  if (!name) {
    throw new Error("请先输入名字。");
  }

  const days = {};
  DAY_KEYS.forEach(dayKey => {
    const ranks = [1, 2].map(rank => form.elements[`${dayKey}-${rank}`].value);
    if (!validateRanks(ranks)) {
      throw new Error(`${voteData[dayKey][0].dayLabel} 需要选择 2 个不同项目。`);
    }
    days[dayKey] = ranks;
  });

  return {
    name,
    nameKey: getNameKey(name),
    days
  };
}

async function submitSharedVote(event) {
  event.preventDefault();

  const form = document.getElementById("vote-form");
  if (!votesLoaded || !historyLoaded || !db) {
    alert("共享投票还没准备好，请稍后再试。");
    return;
  }

  let vote;
  try {
    vote = getCurrentFormVote(form);
  } catch (error) {
    alert(error.message || "请检查投票内容。");
    return;
  }

  const existingVote = sharedVotes.find(item => item.nameKey === vote.nameKey);
  if (existingVote) {
    const shouldOverwrite = confirm("共享数据库里已经有这个名字的当前投票。继续会覆盖当前结果，并新增一条历史记录。是否继续？");
    if (!shouldOverwrite) return;
  }

  setFormDisabled(true);
  setSyncStatus("正在提交共享投票…", "loading");

  try {
    const batch = writeBatch(db);
    const actorSession = getActorSession();
    const voteRef = doc(db, "votes", getVoteDocId(vote.name));
    const historyRef = doc(collection(db, "voteHistory"));

    batch.set(voteRef, {
      name: vote.name,
      nameKey: vote.nameKey,
      days: vote.days,
      updatedAt: serverTimestamp(),
      updatedBySession: actorSession
    });

    batch.set(historyRef, {
      type: "submit",
      name: vote.name,
      nameKey: vote.nameKey,
      days: vote.days,
      submittedAt: serverTimestamp(),
      actorSession
    });

    await batch.commit();
    setSyncStatus("共享投票已提交，正在等待结果面板同步刷新…", "loading");
  } catch (error) {
    console.error("submitSharedVote", error);
    setFormDisabled(false);
    const detail = error && typeof error.code === "string" ? `（${error.code}）` : "";
    setSyncStatus(`提交共享投票失败${detail}。请稍后再试。`, "error");
  }
}

async function resetSharedVote() {
  if (!votesLoaded || !historyLoaded || !db) {
    alert("共享投票还没准备好，请稍后再试。");
    return;
  }

  const name = collapseWhitespace(document.getElementById("voter-name").value);
  if (!name) {
    alert("请先输入要清除的名字。");
    return;
  }

  const nameKey = getNameKey(name);
  const existingVote = sharedVotes.find(item => item.nameKey === nameKey);
  if (!existingVote) {
    alert("共享数据库里没有这个名字的当前投票。");
    return;
  }

  const shouldReset = confirm("这会清除这个名字当前的共享投票，并写入一条清除记录。是否继续？");
  if (!shouldReset) return;

  setFormDisabled(true);
  setSyncStatus("正在清除共享投票…", "loading");

  try {
    const batch = writeBatch(db);
    const actorSession = getActorSession();
    const voteRef = doc(db, "votes", getVoteDocId(existingVote.name));
    const historyRef = doc(collection(db, "voteHistory"));

    batch.delete(voteRef);
    batch.set(historyRef, {
      type: "reset",
      name: existingVote.name,
      nameKey: existingVote.nameKey,
      days: {},
      submittedAt: serverTimestamp(),
      actorSession
    });

    await batch.commit();
    setSyncStatus("共享投票已清除，正在等待结果面板同步刷新…", "loading");
  } catch (error) {
    console.error("resetSharedVote", error);
    setFormDisabled(false);
    const detail = error && typeof error.code === "string" ? `（${error.code}）` : "";
    setSyncStatus(`清除共享投票失败${detail}。请稍后再试。`, "error");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  buildForm();
  renderResults();
  renderVoteHistory();
  startRealtimeSync();

  document.getElementById("vote-form").addEventListener("submit", submitSharedVote);
  document.getElementById("reset-my-vote").addEventListener("click", resetSharedVote);
  document.getElementById("refresh-shared-votes").addEventListener("click", startRealtimeSync);
  document.getElementById("export-vote-history-json").addEventListener("click", exportVoteHistoryJson);
  document.getElementById("export-vote-history-csv").addEventListener("click", exportVoteHistoryCsv);
});
