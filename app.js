const STORAGE_KEY = "time-mirror-diary.entries.v1";
const DRAFT_KEY = "time-mirror-diary.drafts.v1";
const DELETED_KEY = "time-mirror-diary.deleted.v1";
const SYNC_KEY = "time-mirror-diary.sync.v1";
const SYNC_FILE_NAME = "duizhaori-sync.json";
const DURABLE_DB_NAME = "duizhaori-durable-store";
const DURABLE_STORE_NAME = "settings";

const moodMap = {
  sunny: { label: "明亮", icon: "☀️", color: "#f7c843", score: 8 },
  happy: { label: "开心", icon: "😊", color: "#ff9f43", score: 9 },
  grateful: { label: "感恩", icon: "💛", color: "#e9b949", score: 8 },
  hopeful: { label: "期待", icon: "🌱", color: "#35a66f", score: 8 },
  calm: { label: "平静", icon: "🌊", color: "#3f8cff", score: 7 },
  focused: { label: "专注", icon: "🎯", color: "#6c63ff", score: 7 },
  excited: { label: "激动", icon: "🔥", color: "#e84b3c", score: 6 },
  tired: { label: "疲惫", icon: "🪫", color: "#7d8790", score: 4 },
  anxious: { label: "焦虑", icon: "⚡", color: "#b75c2a", score: 3 },
  lonely: { label: "孤独", icon: "🌙", color: "#5c6f91", score: 3 },
  rainy: { label: "低落", icon: "🌧️", color: "#47708f", score: 3 },
  angry: { label: "生气", icon: "🟥", color: "#d73535", score: 2 },
  cloudy: { label: "迷茫", icon: "☁️", color: "#8a929b", score: 4 },
};

const viewMeta = {
  write: { kicker: "现在", title: "写下今天" },
  compare: { kicker: "时间对照", title: "和过去的自己并排看" },
  archive: { kicker: "全部记录", title: "日记库" },
  sync: { kicker: "跨设备", title: "云同步" },
};

let entries = loadEntries();
let deletedDates = loadDeletedDates();
let syncConfig = loadSyncConfig();
let activeCompareMode = "year";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const els = {
  navTabs: $$(".nav-tab"),
  views: $$(".view"),
  viewKicker: $("#viewKicker"),
  viewTitle: $("#viewTitle"),
  todayChip: $("#todayChip"),
  todayPulse: $("#todayPulse"),
  form: $("#entryForm"),
  entryDate: $("#entryDate"),
  entryMood: $("#entryMood"),
  entryEnergy: $("#entryEnergy"),
  entryTitle: $("#entryTitle"),
  entryBody: $("#entryBody"),
  newEntryButton: $("#newEntryButton"),
  quickInsight: $("#quickInsight"),
  compareBaseDate: $("#compareBaseDate"),
  compareTargetDate: $("#compareTargetDate"),
  compareView: $("#compareView"),
  compareSegments: $$(".segment"),
  moodVerdict: $("#moodVerdict"),
  currentCard: $("#currentCard"),
  pastCard: $("#pastCard"),
  searchInput: $("#searchInput"),
  resetDemoButton: $("#resetDemoButton"),
  exportBackupButton: $("#exportBackupButton"),
  importBackupButton: $("#importBackupButton"),
  importBackupInput: $("#importBackupInput"),
  entryList: $("#entryList"),
  storageState: $("#storageState"),
  syncToken: $("#syncToken"),
  syncGistId: $("#syncGistId"),
  syncAuto: $("#syncAuto"),
  syncStatusTitle: $("#syncStatusTitle"),
  syncPill: $("#syncPill"),
  syncLog: $("#syncLog"),
  saveSyncSettingsButton: $("#saveSyncSettingsButton"),
  createLaunchLinkButton: $("#createLaunchLinkButton"),
  copyLaunchLinkButton: $("#copyLaunchLinkButton"),
  launchLinkBox: $("#launchLinkBox"),
  launchLinkText: $("#launchLinkText"),
  syncNowButton: $("#syncNowButton"),
  pullCloudButton: $("#pullCloudButton"),
  pushCloudButton: $("#pushCloudButton"),
  clearSyncButton: $("#clearSyncButton"),
};

init();
registerServiceWorker();

function init() {
  const today = toDateKey(new Date());
  hydrateSyncConfigFromLaunchHash();
  els.entryDate.value = today;
  els.compareBaseDate.value = today;
  els.compareTargetDate.value = shiftDate(today, -365);
  els.todayChip.textContent = formatLongDate(today);

  hydrateSyncForm();
  hydrateSyncConfigFromDurableStore();
  hydrateForm(today);
  renderAll();
  bindEvents();
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js")
      .then(() => navigator.serviceWorker.ready)
      .then(() => setStorageState(navigator.onLine ? "本地缓存已开启，离线也可打开" : "离线模式，本地记录可用"))
      .catch(() => {
        setStorageState("本地缓存已开启");
      });
  });
  window.addEventListener("online", () => setStorageState("已联网，可进行云同步"));
  window.addEventListener("offline", () => setStorageState("离线模式，本地记录可用，云同步暂停"));
}

function bindEvents() {
  els.navTabs.forEach((tab) => {
    tab.addEventListener("click", () => switchView(tab.dataset.view));
  });

  els.entryDate.addEventListener("change", () => hydrateForm(els.entryDate.value));
  attachDraftAutosave();
  els.form.addEventListener("submit", saveEntry);
  els.newEntryButton.addEventListener("click", clearForm);

  els.compareBaseDate.addEventListener("change", () => {
    if (activeCompareMode === "year") {
      els.compareTargetDate.value = shiftYear(els.compareBaseDate.value, -1);
    }
    if (activeCompareMode === "week") {
      els.compareTargetDate.value = shiftDate(els.compareBaseDate.value, -7);
    }
    renderCompare();
  });

  els.compareTargetDate.addEventListener("change", renderCompare);

  els.compareSegments.forEach((segment) => {
    segment.addEventListener("click", () => {
      activeCompareMode = segment.dataset.compare;
      els.compareSegments.forEach((item) => item.classList.toggle("active", item === segment));
      els.compareView.classList.toggle("custom-mode", activeCompareMode === "custom");
      if (activeCompareMode === "year") {
        els.compareTargetDate.value = shiftYear(els.compareBaseDate.value, -1);
      }
      if (activeCompareMode === "week") {
        els.compareTargetDate.value = shiftDate(els.compareBaseDate.value, -7);
      }
      renderCompare();
    });
  });

  els.searchInput.addEventListener("input", renderArchive);
  els.exportBackupButton.addEventListener("click", exportBackup);
  els.importBackupButton.addEventListener("click", () => els.importBackupInput.click());
  els.importBackupInput.addEventListener("change", importBackup);
  els.syncToken.addEventListener("input", saveSyncConfigFromForm);
  els.syncGistId.addEventListener("input", saveSyncConfigFromForm);
  els.syncToken.addEventListener("change", saveSyncConfigFromForm);
  els.syncGistId.addEventListener("change", saveSyncConfigFromForm);
  els.syncAuto.addEventListener("change", saveSyncConfigFromForm);
  els.saveSyncSettingsButton.addEventListener("click", () => {
    saveSyncConfigFromForm();
    renderSyncStatus("同步设置已保存在这台设备。下次从同一个桌面图标或同一个浏览器打开会自动带出。");
  });
  els.createLaunchLinkButton.addEventListener("click", createLaunchLink);
  els.copyLaunchLinkButton.addEventListener("click", copyLaunchLink);
  els.syncNowButton.addEventListener("click", syncNow);
  els.pullCloudButton.addEventListener("click", () => pullCloud(true));
  els.pushCloudButton.addEventListener("click", () => pushCloud(true));
  els.clearSyncButton.addEventListener("click", clearSyncConfig);
  els.resetDemoButton.addEventListener("click", () => {
    entries = makeSeedEntries();
    deletedDates = {};
    persistEntries();
    persistDeletedDates();
    clearAllDrafts();
    hydrateForm(els.entryDate.value);
    renderAll();
  });
}

function switchView(viewName) {
  els.navTabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.view === viewName));
  els.views.forEach((view) => view.classList.toggle("active", view.id === `${viewName}View`));
  els.viewKicker.textContent = viewMeta[viewName].kicker;
  els.viewTitle.textContent = viewMeta[viewName].title;
  if (viewName === "compare") renderCompare();
  if (viewName === "archive") renderArchive();
  if (viewName === "sync") renderSyncStatus();
}

function saveEntry(event) {
  event.preventDefault();
  const date = els.entryDate.value;
  const body = els.entryBody.value.trim();
  const title = els.entryTitle.value.trim() || titleFromBody(body) || "无题日记";

  const entry = {
    id: date,
    date,
    title,
    body,
    mood: els.entryMood.value,
    energy: Number(els.entryEnergy.value),
    updatedAt: new Date().toISOString(),
  };

  entries = [entry, ...entries.filter((item) => item.date !== date)].sort((a, b) =>
    b.date.localeCompare(a.date)
  );
  persistEntries();
  deleteDraft(date);
  setStorageState(`已保存 ${formatShortDate(date)} 到本地`);
  renderAll();
  if (syncConfig.autoSync && syncConfig.token) {
    syncNow(false);
  }
  switchView("compare");
}

function clearForm() {
  els.entryTitle.value = "";
  els.entryBody.value = "";
  els.entryMood.value = "calm";
  els.entryEnergy.value = "6";
  saveDraft(els.entryDate.value);
}

function hydrateForm(date) {
  const draft = loadDraft(date);
  if (draft) {
    els.entryTitle.value = draft.title || "";
    els.entryBody.value = draft.body || "";
    els.entryMood.value = draft.mood || "calm";
    els.entryEnergy.value = draft.energy || "6";
    setStorageState(`正在读取 ${formatShortDate(date)} 的草稿`);
    return;
  }

  const entry = entries.find((item) => item.date === date);
  if (entry) {
    els.entryTitle.value = entry.title;
    els.entryBody.value = entry.body;
    els.entryMood.value = entry.mood;
    els.entryEnergy.value = entry.energy;
    setStorageState(`已载入 ${formatShortDate(date)} 的本地记录`);
    return;
  }

  els.entryTitle.value = "";
  els.entryBody.value = "";
  els.entryMood.value = "calm";
  els.entryEnergy.value = "6";
  setStorageState(`本地缓存已开启`);
}

function renderAll() {
  renderTodayPulse();
  renderQuickInsight();
  renderCompare();
  renderArchive();
  renderSyncStatus();
}

function renderTodayPulse() {
  const todayEntry = entries.find((entry) => entry.date === toDateKey(new Date()));
  if (!todayEntry) {
    els.todayPulse.innerHTML = '<span class="pulse-dot calm"></span><strong>还没有记录</strong>';
    return;
  }
  const mood = moodMap[todayEntry.mood];
  els.todayPulse.innerHTML = `
    <span class="pulse-dot" style="background:${mood.color}; box-shadow:0 0 0 6px ${hexToRgba(
      mood.color,
      0.16
    )}"></span>
    <strong>${mood.icon} ${mood.label} / ${todayEntry.energy}</strong>
  `;
}

function renderQuickInsight() {
  const today = els.entryDate.value || toDateKey(new Date());
  const configs = [
    { label: "去年今日", date: shiftYear(today, -1), mode: "year" },
    { label: "上周同日", date: shiftDate(today, -7), mode: "week" },
    { label: "前天附近", date: shiftDate(today, -2), mode: "near" },
  ];

  els.quickInsight.innerHTML = configs
    .map((config) => {
      const match = findNearestEntry(config.date, config.mode);
      if (!match.entry) {
        return `
          <article class="insight-item" style="border-color:#8a929b">
            <strong>${config.label}</strong>
            <span>还没有足够记录形成对照。</span>
          </article>
        `;
      }
      const mood = moodMap[match.entry.mood];
      return `
        <article class="insight-item" style="border-color:${mood.color}">
          <strong>${config.label} ${mood.icon}</strong>
          <span>${formatShortDate(match.entry.date)}：${escapeHtml(match.entry.title)}</span>
        </article>
      `;
    })
    .join("");
}

function renderCompare() {
  const baseDate = els.compareBaseDate.value || toDateKey(new Date());
  const targetDate =
    activeCompareMode === "year"
      ? shiftYear(baseDate, -1)
      : activeCompareMode === "week"
        ? shiftDate(baseDate, -7)
        : els.compareTargetDate.value;
  els.compareTargetDate.value = targetDate;

  const current = findNearestEntry(baseDate, "near");
  const past = findNearestEntry(targetDate, activeCompareMode);

  renderVerdict(current, past, baseDate, targetDate);
  renderCompareCard(els.currentCard, current, "今天附近", baseDate);
  renderCompareCard(els.pastCard, past, compareLabel(activeCompareMode), targetDate);
}

function renderVerdict(current, past, baseDate, targetDate) {
  if (!current.entry || !past.entry) {
    els.moodVerdict.innerHTML = `
      <div class="verdict-icons">🪞</div>
      <div class="verdict-copy">
        <h3>记录还不够，先写下一篇</h3>
        <p>系统会优先找 ${formatShortDate(targetDate)}，没有时自动在附近顺延，尽量给你一个真实可看的对照。</p>
      </div>
      <div class="score-pill" style="background:#8a929b">等待</div>
    `;
    return;
  }

  const currentMood = moodMap[current.entry.mood];
  const pastMood = moodMap[past.entry.mood];
  const currentScore = moodScore(current.entry);
  const pastScore = moodScore(past.entry);
  const delta = currentScore - pastScore;
  const verdict =
    delta >= 2
      ? "今天明显更开心"
      : delta > 0
        ? "今天稍微更轻"
        : delta === 0
          ? "今天和那时差不多"
          : delta <= -2
            ? "今天更沉一些"
            : "今天略微低一点";
  const color = delta >= 0 ? currentMood.color : pastMood.color;

  els.moodVerdict.innerHTML = `
    <div class="verdict-icons">${pastMood.icon}<span>→</span>${currentMood.icon}</div>
    <div class="verdict-copy">
      <h3>${verdict}</h3>
      <p>${formatShortDate(current.entry.date)} 与 ${formatShortDate(
        past.entry.date
      )} 并排看：情绪分差 ${delta > 0 ? "+" : ""}${delta}。${distanceCopy(past, targetDate)}</p>
    </div>
    <div class="score-pill" style="background:${color}">${delta > 0 ? "+" : ""}${delta}</div>
  `;
}

function renderCompareCard(target, match, label, requestedDate) {
  if (!match.entry) {
    target.innerHTML = `
      <div class="card-band" style="background:#8a929b"></div>
      <div class="card-body">
        <div class="card-meta"><span>${label}</span></div>
        <h3>还没有可对照的记录</h3>
        <div class="entry-content">写下几天之后，这里会自动出现最接近的那篇。</div>
      </div>
    `;
    return;
  }

  const entry = match.entry;
  const mood = moodMap[entry.mood];
  target.innerHTML = `
    <div class="card-band" style="background:${mood.color}"></div>
    <div class="card-body">
      <div class="card-meta">
        <span>${label}</span>
        <span>${formatLongDate(entry.date)}</span>
        <span class="mood-badge" style="background:${mood.color}">${mood.icon} ${mood.label}</span>
        <span class="shift-badge" style="background:${energyColor(entry.energy)}">强度 ${entry.energy}</span>
      </div>
      <h3>${escapeHtml(entry.title)}</h3>
      <div class="entry-content">${escapeHtml(entry.body || "这一天只留下了心情，没有写正文。")}</div>
      <div class="match-note">${distanceCopy(match, requestedDate)}</div>
    </div>
  `;
}

function renderArchive() {
  const query = els.searchInput.value.trim().toLowerCase();
  const filtered = entries.filter((entry) => {
    const haystack = `${entry.date} ${entry.title} ${entry.body}`.toLowerCase();
    return haystack.includes(query);
  });

  els.entryList.innerHTML = filtered
    .map((entry) => {
      const mood = moodMap[entry.mood];
      return `
        <article class="entry-row">
          <div class="entry-color" style="background:${mood.color}"></div>
          <div class="entry-summary">
            <h3>${mood.icon} ${escapeHtml(entry.title)}</h3>
            <p>${formatLongDate(entry.date)} · ${mood.label} · ${escapeHtml(entry.body)}</p>
          </div>
          <div class="row-actions">
            <button class="ghost" type="button" data-edit="${entry.date}">编辑</button>
            <button class="ghost danger" type="button" data-delete="${entry.date}">删除</button>
          </div>
        </article>
      `;
    })
    .join("");

  $$("[data-edit]").forEach((button) => {
    button.addEventListener("click", () => {
      els.entryDate.value = button.dataset.edit;
      hydrateForm(button.dataset.edit);
      switchView("write");
    });
  });

  $$("[data-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      entries = entries.filter((entry) => entry.date !== button.dataset.delete);
      recordDeletedDate(button.dataset.delete);
      persistEntries();
      renderAll();
      if (syncConfig.autoSync && syncConfig.token) {
        syncNow(false);
      }
    });
  });
}

function hydrateSyncForm() {
  els.syncToken.value = syncConfig.token || "";
  els.syncGistId.value = syncConfig.gistId || "";
  els.syncAuto.checked = Boolean(syncConfig.autoSync);
}

function saveSyncConfigFromForm() {
  syncConfig = {
    ...syncConfig,
    token: els.syncToken.value.trim(),
    gistId: els.syncGistId.value.trim(),
    autoSync: els.syncAuto.checked,
  };
  persistSyncConfig();
  renderSyncStatus();
  setStorageState("同步设置已缓存到本机");
}

function hydrateSyncConfigFromLaunchHash() {
  const hash = window.location.hash || "";
  const match = hash.match(/(?:^#|&)sync=([^&]+)/);
  if (!match) return;

  try {
    const decoded = JSON.parse(base64UrlDecode(match[1]));
    if (!decoded || (!decoded.token && !decoded.gistId)) return;
    syncConfig = {
      token: decoded.token || "",
      gistId: decoded.gistId || "",
      autoSync: Boolean(decoded.autoSync),
      lastSyncAt: syncConfig.lastSyncAt || null,
    };
    persistSyncConfig();
  } catch {
    syncConfig = loadSyncConfig();
  }
}

async function hydrateSyncConfigFromDurableStore() {
  const durableConfig = await readDurableValue(SYNC_KEY);
  if (!durableConfig) return;

  const hasCurrentConfig = Boolean(syncConfig.token || syncConfig.gistId);
  const hasDurableConfig = Boolean(durableConfig.token || durableConfig.gistId);
  if (!hasDurableConfig || hasCurrentConfig) return;

  syncConfig = {
    token: "",
    gistId: "",
    autoSync: false,
    lastSyncAt: null,
    ...durableConfig,
  };
  safeWrite(SYNC_KEY, JSON.stringify(syncConfig));
  hydrateSyncForm();
  renderSyncStatus("已从本机持久存储恢复同步设置。");
}

function renderSyncStatus(message) {
  const connected = Boolean(syncConfig.token && syncConfig.gistId);
  const readyToCreate = Boolean(syncConfig.token && !syncConfig.gistId);
  els.syncStatusTitle.textContent = connected
    ? "已连接私密云端库"
    : readyToCreate
      ? "可创建云端库"
      : "本地优先";
  els.syncPill.textContent = connected ? "已连接" : readyToCreate ? "待创建" : "未连接";
  els.syncPill.className = `sync-pill ${connected ? "connected" : readyToCreate ? "pending" : ""}`;
  if (message) els.syncLog.textContent = message;
}

async function syncNow(showResult = true) {
  try {
    saveSyncConfigFromForm();
    if (!syncConfig.token) {
      renderSyncStatus("请先填写 GitHub Token。");
      return;
    }
    if (syncConfig.gistId) {
      await pullCloud(false);
    }
    await pushCloud(false);
    if (showResult) renderSyncStatus("同步完成，本地和云端已合并。");
  } catch (error) {
    renderSyncStatus(`同步失败：${error.message}`);
  }
}

async function pullCloud(showResult = true) {
  try {
    saveSyncConfigFromForm();
    if (!syncConfig.token || !syncConfig.gistId) {
      renderSyncStatus("请先填写 Token 和 Gist ID。");
      return;
    }

    renderSyncStatus("正在从云端拉取...");
    const gist = await githubRequest(`https://api.github.com/gists/${syncConfig.gistId}`);
    const file = gist.files && gist.files[SYNC_FILE_NAME];
    if (!file || !file.content) throw new Error("云端库里没有对照日数据文件");

    const cloudPayload = JSON.parse(file.content);
    mergeCloudPayload(cloudPayload);
    syncConfig.lastSyncAt = new Date().toISOString();
    persistSyncConfig();
    hydrateForm(els.entryDate.value);
    renderAll();
    if (showResult) renderSyncStatus("已从云端拉取并合并。");
  } catch (error) {
    renderSyncStatus(`拉取失败：${error.message}`);
  }
}

async function pushCloud(showResult = true) {
  try {
    saveSyncConfigFromForm();
    if (!syncConfig.token) {
      renderSyncStatus("请先填写 GitHub Token。");
      return;
    }

    renderSyncStatus(syncConfig.gistId ? "正在推送到云端..." : "正在创建私密云端库...");
    const payload = makeCloudPayload();
    const body = {
      description: "对照日云同步",
      files: {
        [SYNC_FILE_NAME]: {
          content: JSON.stringify(payload, null, 2),
        },
      },
    };

    const gist = syncConfig.gistId
      ? await githubRequest(`https://api.github.com/gists/${syncConfig.gistId}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        })
      : await githubRequest("https://api.github.com/gists", {
          method: "POST",
          body: JSON.stringify({ ...body, public: false }),
        });

    syncConfig.gistId = gist.id;
    syncConfig.lastSyncAt = new Date().toISOString();
    persistSyncConfig();
    hydrateSyncForm();
    renderAll();
    if (showResult) renderSyncStatus(`已推送到云端。Gist ID：${gist.id}`);
  } catch (error) {
    renderSyncStatus(`推送失败：${error.message}`);
  }
}

async function githubRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${syncConfig.token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status} ${response.statusText}${text ? `：${text.slice(0, 90)}` : ""}`);
  }
  return response.json();
}

function makeCloudPayload() {
  return {
    app: "对照日",
    schema: 2,
    exportedAt: new Date().toISOString(),
    entries,
    drafts: loadDrafts(),
    deletedDates,
  };
}

function mergeCloudPayload(payload) {
  if (!payload || !Array.isArray(payload.entries)) throw new Error("云端数据格式无效");

  deletedDates = mergeDeletedDates(deletedDates, payload.deletedDates || {});
  const byDate = new Map();
  [...entries, ...payload.entries].forEach((entry) => {
    if (!entry || !entry.date || deletedDates[entry.date]) return;
    const current = byDate.get(entry.date);
    if (!current || entryTime(entry) > entryTime(current)) {
      byDate.set(entry.date, entry);
    }
  });
  entries = Array.from(byDate.values()).sort((a, b) => b.date.localeCompare(a.date));
  persistEntries();
  persistDeletedDates();

  const localDrafts = loadDrafts();
  const cloudDrafts = payload.drafts && typeof payload.drafts === "object" ? payload.drafts : {};
  const mergedDrafts = { ...localDrafts };
  Object.entries(cloudDrafts).forEach(([date, draft]) => {
    if (!mergedDrafts[date] || new Date(draft.updatedAt || 0) > new Date(mergedDrafts[date].updatedAt || 0)) {
      mergedDrafts[date] = draft;
    }
  });
  safeWrite(DRAFT_KEY, JSON.stringify(mergedDrafts));
}

function mergeDeletedDates(localDeleted, cloudDeleted) {
  const merged = { ...localDeleted };
  Object.entries(cloudDeleted).forEach(([date, deletedAt]) => {
    if (!merged[date] || new Date(deletedAt) > new Date(merged[date])) {
      merged[date] = deletedAt;
    }
  });
  return merged;
}

function entryTime(entry) {
  return new Date(entry.updatedAt || entry.date || 0).getTime();
}

function recordDeletedDate(date) {
  deletedDates[date] = new Date().toISOString();
  persistDeletedDates();
}

function clearSyncConfig() {
  syncConfig = { token: "", gistId: "", autoSync: false, lastSyncAt: null };
  persistSyncConfig();
  deleteDurableValue(SYNC_KEY);
  hydrateSyncForm();
  renderSyncStatus("已清除这台设备上的同步设置。");
}

function createLaunchLink() {
  saveSyncConfigFromForm();
  if (!syncConfig.token || !syncConfig.gistId) {
    renderSyncStatus("请先填写 Token 和 Gist ID，再生成免输入链接。");
    return;
  }

  const payload = {
    token: syncConfig.token,
    gistId: syncConfig.gistId,
    autoSync: syncConfig.autoSync,
  };
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = `sync=${base64UrlEncode(JSON.stringify(payload))}`;
  els.launchLinkText.value = url.toString();
  els.launchLinkBox.hidden = false;
  renderSyncStatus("已生成免输入启动链接。用这个链接添加到桌面，以后打开会自动带出同步设置。");
}

async function copyLaunchLink() {
  const value = els.launchLinkText.value;
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
    renderSyncStatus("免输入启动链接已复制。");
  } catch {
    els.launchLinkText.select();
    document.execCommand("copy");
    renderSyncStatus("免输入启动链接已复制。");
  }
}

function attachDraftAutosave() {
  const fields = [els.entryTitle, els.entryBody, els.entryMood, els.entryEnergy];
  fields.forEach((field) => {
    field.addEventListener("input", () => saveDraft(els.entryDate.value));
    field.addEventListener("change", () => saveDraft(els.entryDate.value));
  });
}

function compareLabel(mode) {
  if (mode === "year") return "去年那周";
  if (mode === "week") return "上周同日";
  return "自定义对照";
}

function findNearestEntry(targetDate, mode) {
  const exact = entries.find((entry) => entry.date === targetDate);
  if (exact) return { entry: exact, distance: 0, requestedDate: targetDate };

  const target = parseDateKey(targetDate);
  const windowDays = mode === "year" ? 3 : mode === "week" ? 2 : 7;
  const candidates = entries
    .map((entry) => ({ entry, distance: diffDays(parseDateKey(entry.date), target) }))
    .filter((item) => Math.abs(item.distance) <= windowDays)
    .sort((a, b) => Math.abs(a.distance) - Math.abs(b.distance) || a.distance - b.distance);

  return {
    entry: candidates[0]?.entry || null,
    distance: candidates[0]?.distance ?? null,
    requestedDate: targetDate,
  };
}

function distanceCopy(match, requestedDate) {
  if (!match.entry) return "";
  if (match.distance === 0) return `精确匹配 ${formatShortDate(requestedDate)}。`;
  const direction = match.distance > 0 ? "后" : "前";
  return `${formatShortDate(requestedDate)} 没有记录，已自动顺延到${Math.abs(
    match.distance
  )}天${direction}的 ${formatShortDate(match.entry.date)}。`;
}

function moodScore(entry) {
  return moodMap[entry.mood].score + Number(entry.energy) - 5;
}

function energyColor(value) {
  if (value >= 8) return "#e84b3c";
  if (value >= 5) return "#3f8cff";
  return "#47708f";
}

function titleFromBody(body) {
  return body.replace(/\s+/g, " ").slice(0, 24);
}

function loadEntries() {
  const raw = safeRead(STORAGE_KEY);
  if (!raw) {
    const seed = makeSeedEntries();
    safeWrite(STORAGE_KEY, JSON.stringify(seed));
    return seed;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return makeSeedEntries();
  }
}

function persistEntries() {
  safeWrite(STORAGE_KEY, JSON.stringify(entries));
}

function loadDeletedDates() {
  const raw = safeRead(DELETED_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

function persistDeletedDates() {
  safeWrite(DELETED_KEY, JSON.stringify(deletedDates));
}

function loadSyncConfig() {
  const raw = safeRead(SYNC_KEY);
  if (!raw) {
    return { token: "", gistId: "", autoSync: false, lastSyncAt: null };
  }
  try {
    return { token: "", gistId: "", autoSync: false, lastSyncAt: null, ...JSON.parse(raw) };
  } catch {
    return { token: "", gistId: "", autoSync: false, lastSyncAt: null };
  }
}

function persistSyncConfig() {
  safeWrite(SYNC_KEY, JSON.stringify(syncConfig));
  writeDurableValue(SYNC_KEY, syncConfig);
}

function openDurableDb() {
  if (!("indexedDB" in window)) return Promise.resolve(null);

  return new Promise((resolve) => {
    const request = indexedDB.open(DURABLE_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DURABLE_STORE_NAME)) {
        db.createObjectStore(DURABLE_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

async function readDurableValue(key) {
  const db = await openDurableDb();
  if (!db) return null;

  return new Promise((resolve) => {
    const tx = db.transaction(DURABLE_STORE_NAME, "readonly");
    const request = tx.objectStore(DURABLE_STORE_NAME).get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => resolve(null);
    tx.oncomplete = () => db.close();
    tx.onerror = () => db.close();
  });
}

async function writeDurableValue(key, value) {
  const db = await openDurableDb();
  if (!db) return;

  await new Promise((resolve) => {
    const tx = db.transaction(DURABLE_STORE_NAME, "readwrite");
    tx.objectStore(DURABLE_STORE_NAME).put(value, key);
    tx.oncomplete = resolve;
    tx.onerror = resolve;
  });
  db.close();
}

async function deleteDurableValue(key) {
  const db = await openDurableDb();
  if (!db) return;

  await new Promise((resolve) => {
    const tx = db.transaction(DURABLE_STORE_NAME, "readwrite");
    tx.objectStore(DURABLE_STORE_NAME).delete(key);
    tx.oncomplete = resolve;
    tx.onerror = resolve;
  });
  db.close();
}

function saveDraft(date) {
  const draft = {
    title: els.entryTitle.value,
    body: els.entryBody.value,
    mood: els.entryMood.value,
    energy: els.entryEnergy.value,
    updatedAt: new Date().toISOString(),
  };
  const drafts = loadDrafts();
  drafts[date] = draft;
  safeWrite(DRAFT_KEY, JSON.stringify(drafts));
  setStorageState(`草稿已自动缓存：${formatShortDate(date)}`);
}

function loadDraft(date) {
  const drafts = loadDrafts();
  return drafts[date] || null;
}

function deleteDraft(date) {
  const drafts = loadDrafts();
  delete drafts[date];
  safeWrite(DRAFT_KEY, JSON.stringify(drafts));
}

function clearAllDrafts() {
  safeRemove(DRAFT_KEY);
}

function loadDrafts() {
  const raw = safeRead(DRAFT_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

function safeRead(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return window.__timeMirrorMemoryStore?.[key] || null;
  }
}

function safeWrite(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    window.__timeMirrorMemoryStore = window.__timeMirrorMemoryStore || {};
    window.__timeMirrorMemoryStore[key] = value;
  }
}

function safeRemove(key) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    if (window.__timeMirrorMemoryStore) delete window.__timeMirrorMemoryStore[key];
  }
}

function setStorageState(text) {
  els.storageState.textContent = text;
}

function exportBackup() {
  const payload = {
    app: "对照日",
    schema: 2,
    exportedAt: new Date().toISOString(),
    entries,
    drafts: loadDrafts(),
    deletedDates,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `duizhaori-backup-${toDateKey(new Date())}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  setStorageState("已导出本地备份");
}

async function importBackup() {
  const file = els.importBackupInput.files && els.importBackupInput.files[0];
  if (!file) return;
  const text = await file.text();
  try {
    const payload = JSON.parse(text);
    if (!payload || !Array.isArray(payload.entries)) throw new Error("invalid backup");
    entries = payload.entries.sort((a, b) => b.date.localeCompare(a.date));
    safeWrite(STORAGE_KEY, JSON.stringify(entries));
    if (payload.deletedDates && typeof payload.deletedDates === "object") {
      deletedDates = payload.deletedDates;
      persistDeletedDates();
    }
    if (payload.drafts && typeof payload.drafts === "object") {
      safeWrite(DRAFT_KEY, JSON.stringify(payload.drafts));
    }
    hydrateForm(els.entryDate.value);
    renderAll();
    setStorageState("已导入本地备份");
  } catch {
    setStorageState("备份文件无效");
  } finally {
    els.importBackupInput.value = "";
  }
}

function makeSeedEntries() {
  const today = toDateKey(new Date());
  return [
    {
      id: today,
      date: today,
      title: "把想法做成真的东西",
      mood: "sunny",
      energy: 8,
      body: "今天最重要的感觉是：一个念头开始有形状了。不是单纯写日记，而是把现在的我和过去的我放在一起看。",
      updatedAt: new Date().toISOString(),
    },
    {
      id: shiftDate(today, -7),
      date: shiftDate(today, -7),
      title: "有点乱，但还在推进",
      mood: "cloudy",
      energy: 5,
      body: "上周这个时候，我还在整理很多没有落地的念头。事情不算轻松，但没有停下来。",
      updatedAt: new Date().toISOString(),
    },
    {
      id: shiftDate(shiftYear(today, -1), -1),
      date: shiftDate(shiftYear(today, -1), -1),
      title: "去年这周的低气压",
      mood: "rainy",
      energy: 4,
      body: "那天没有写在同一个日期，而是差了一天。现在回头看，系统自动找到它，比空白提示更像一种温柔提醒。",
      updatedAt: new Date().toISOString(),
    },
    {
      id: shiftDate(today, -2),
      date: shiftDate(today, -2),
      title: "安静的一点恢复",
      mood: "calm",
      energy: 6,
      body: "没有特别大的事。只是做完一件拖了很久的小事，心里松了一块。",
      updatedAt: new Date().toISOString(),
    },
  ].sort((a, b) => b.date.localeCompare(a.date));
}

function shiftDate(dateKey, amount) {
  const date = parseDateKey(dateKey);
  date.setDate(date.getDate() + amount);
  return toDateKey(date);
}

function shiftYear(dateKey, amount) {
  const date = parseDateKey(dateKey);
  date.setFullYear(date.getFullYear() + amount);
  return toDateKey(date);
}

function parseDateKey(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function diffDays(a, b) {
  const day = 24 * 60 * 60 * 1000;
  return Math.round((a - b) / day);
}

function formatLongDate(dateKey) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(parseDateKey(dateKey));
}

function formatShortDate(dateKey) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).format(parseDateKey(dateKey));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function hexToRgba(hex, alpha) {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function base64UrlEncode(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlDecode(value) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
