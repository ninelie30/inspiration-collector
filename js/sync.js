/* ========================================
   灵感收藏家 - 坚果云 WebDAV 云同步模块
   通过坚果云 WebDAV API 实现多设备数据同步
   后端代理 WebDAV 请求，前端只需账号+密码
   国内直连，无需代理
   ======================================== */

const WEBDAV_SETTINGS_KEY = 'inspiration_webdav_settings';
const DELETED_IDS_KEY = 'inspiration_deleted_ids';
const SYNC_PUSH_DEBOUNCE = 3000;  // 数据变更后3秒防抖推送
const SYNC_PULL_INTERVAL = 60000; // 每60秒拉取一次

let syncState = {
  enabled: false,
  connected: false,
  autoSync: true,
  lastPush: 0,
  lastPull: 0,
  isSyncing: false,
  pushTimer: null,
  pullTimer: null,
};

// ---------- 设置管理 ----------
function getSyncSettings() {
  try {
    return JSON.parse(localStorage.getItem(WEBDAV_SETTINGS_KEY)) || {};
  } catch { return {}; }
}

function saveSyncSettings(settings) {
  localStorage.setItem(WEBDAV_SETTINGS_KEY, JSON.stringify(settings));
}

// ---------- API 调用 ----------
function apiUrl(path) {
  return window.location.origin + path;
}

async function webdavRequest(endpoint, settings) {
  const resp = await fetch(apiUrl(endpoint), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: settings.username,
      password: settings.password,
      server: settings.server || '',
    }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${resp.status}`);
  }
  return resp.json();
}

async function webdavPushData(settings, data) {
  const resp = await fetch(apiUrl('/api/webdav/push'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: settings.username,
      password: settings.password,
      server: settings.server || '',
      data: data,
    }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${resp.status}`);
  }
  return resp.json();
}

// ---------- 同步逻辑 ----------

// 初始化
function initSync() {
  const settings = getSyncSettings();

  if (settings.enabled && settings.username && settings.password) {
    syncState.enabled = true;
    syncState.autoSync = settings.autoSync !== false;

    // 测试连接
    webdavRequest('/api/webdav/test', settings).then(result => {
      if (result.ok) {
        syncState.connected = true;
        updateSyncUI();
        // 首次拉取
        setTimeout(() => syncPull(true), 1500);
        startPullLoop();
      } else {
        syncState.connected = false;
        updateSyncUI();
      }
    }).catch(() => {
      syncState.connected = false;
      updateSyncUI();
    });
  } else {
    updateSyncUI();
  }
}

// 推送（防抖）
function triggerSyncPush() {
  if (!syncState.enabled || !syncState.connected || !syncState.autoSync) return;
  if (syncState.pushTimer) clearTimeout(syncState.pushTimer);
  syncState.pushTimer = setTimeout(() => syncPush(), SYNC_PUSH_DEBOUNCE);
}

// 推送数据到坚果云
async function syncPush() {
  if (!syncState.enabled || !syncState.connected) return;
  if (syncState.isSyncing) return;

  syncState.isSyncing = true;
  updateSyncStatus('正在上传...', true);

  try {
    const settings = getSyncSettings();
    const data = {
      inspirations: getData(),
      reflections: getReflections(),
      streak: getStreak(),
      deletedIds: getDeletedIds(),
      lastModified: Date.now(),
    };

    await webdavPushData(settings, data);
    syncState.lastPush = Date.now();
    updateSyncStatus('已同步');
  } catch (e) {
    console.error('Sync push error:', e);
    if (e.message.includes('401') || e.message.includes('认证')) {
      syncState.connected = false;
      updateSyncStatus('账号或密码错误');
    } else {
      updateSyncStatus('上传失败: ' + e.message);
    }
  } finally {
    syncState.isSyncing = false;
  }
}

// 从坚果云拉取数据
async function syncPull(isInitial) {
  if (!syncState.enabled || !syncState.connected) return;
  if (syncState.isSyncing && !isInitial) return;

  syncState.isSyncing = true;
  if (isInitial) updateSyncStatus('正在同步...', true);

  try {
    const settings = getSyncSettings();
    const result = await webdavRequest('/api/webdav/pull', settings);
    syncState.lastPull = Date.now();

    const cloud = result.data;

    if (!cloud) {
      // 云端没有数据，推送本地数据
      if (isInitial) {
        await syncPush();
      }
      updateSyncStatus('已同步');
      return;
    }

    // 合并灵感数据
    const localInspirations = getData();
    const cloudInspirations = cloud.inspirations || [];
    const allDeletedIds = [...new Set([...getDeletedIds(), ...(cloud.deletedIds || [])])];
    const deletedSet = new Set(allDeletedIds);

    const inspMap = new Map();
    for (const item of localInspirations) {
      if (!deletedSet.has(item.id)) inspMap.set(item.id, item);
    }
    for (const item of cloudInspirations) {
      if (deletedSet.has(item.id)) continue;
      const ex = inspMap.get(item.id);
      if (!ex) {
        inspMap.set(item.id, item);
      } else {
        const exTime = ex._modifiedAt || ex.createdAt || 0;
        const cloudTime = item._modifiedAt || item.createdAt || 0;
        if (cloudTime > exTime) inspMap.set(item.id, item);
      }
    }
    const mergedInspirations = [...inspMap.values()];

    // 合并反思数据（按date去重）
    const localReflections = getReflections();
    const cloudReflections = cloud.reflections || [];
    const reflMap = new Map();
    for (const r of localReflections) reflMap.set(r.date, r);
    for (const r of cloudReflections) {
      const ex = reflMap.get(r.date);
      if (!ex || (r.createdAt || 0) >= (ex.createdAt || 0)) {
        reflMap.set(r.date, r);
      }
    }
    const mergedReflections = [...reflMap.values()];

    // 合并连续天数
    const localStreak = getStreak();
    const cloudStreak = cloud.streak || { count: 0, lastDate: null };
    const mergedStreak = {
      count: Math.max(localStreak.count || 0, cloudStreak.count || 0),
      lastDate: cloudStreak.lastDate || localStreak.lastDate,
    };

    // 检查数据是否有变化
    const inspirationsChanged = JSON.stringify(mergedInspirations) !== JSON.stringify(localInspirations);
    const reflectionsChanged = JSON.stringify(mergedReflections) !== JSON.stringify(localReflections);
    const streakChanged = JSON.stringify(mergedStreak) !== JSON.stringify(localStreak);

    // 保存合并后的数据
    if (inspirationsChanged) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(mergedInspirations));
    }
    if (reflectionsChanged) {
      localStorage.setItem(REFLECT_KEY, JSON.stringify(mergedReflections));
    }
    if (streakChanged) {
      localStorage.setItem(STREAK_KEY, JSON.stringify(mergedStreak));
    }
    localStorage.setItem(DELETED_IDS_KEY, JSON.stringify(allDeletedIds));

    // 如果有新数据从云端拉下来，刷新 UI 并推送合并结果
    if (inspirationsChanged || reflectionsChanged || streakChanged) {
      if (typeof renderHome === 'function') renderHome();
      if (typeof renderLibrary === 'function') renderLibrary();
      if (typeof renderReflect === 'function' && document.getElementById('page-reflect')?.classList.contains('active')) {
        renderReflect();
      }
      if (!isInitial) {
        setTimeout(() => syncPush(), 1000);
      }
    }

    updateSyncStatus('已同步');
  } catch (e) {
    console.error('Sync pull error:', e);
    if (e.message.includes('401') || e.message.includes('认证')) {
      syncState.connected = false;
      updateSyncStatus('账号或密码错误');
    } else if (isInitial) {
      updateSyncStatus('同步失败，将稍后重试');
    }
  } finally {
    syncState.isSyncing = false;
  }
}

// ---------- 删除记录同步 ----------
function getDeletedIds() {
  try {
    return JSON.parse(localStorage.getItem(DELETED_IDS_KEY)) || [];
  } catch { return []; }
}

function recordDeletion(id) {
  const deletedIds = getDeletedIds();
  if (!deletedIds.includes(id)) {
    deletedIds.push(id);
    localStorage.setItem(DELETED_IDS_KEY, JSON.stringify(deletedIds));
  }
  triggerSyncPush();
}

// ---------- 定时拉取 ----------
function startPullLoop() {
  if (syncState.pullTimer) clearInterval(syncState.pullTimer);
  syncState.pullTimer = setInterval(() => {
    if (syncState.enabled && syncState.connected && !syncState.isSyncing) {
      syncPull(false);
    }
  }, SYNC_PULL_INTERVAL);
}

function stopPullLoop() {
  if (syncState.pullTimer) {
    clearInterval(syncState.pullTimer);
    syncState.pullTimer = null;
  }
}

// ---------- 立即同步 ----------
async function syncNow() {
  if (!syncState.enabled || !syncState.connected) {
    toast('请先配置并连接坚果云');
    return;
  }
  await syncPull(true);
  await syncPush();
  toast('同步完成');
}

// ---------- UI 交互 ----------

function toggleSync() {
  const checkbox = document.getElementById('setting-sync-enabled');
  const config = document.getElementById('sync-config');

  if (checkbox.checked) {
    syncState.enabled = true;
    config.style.display = 'block';
    const settings = getSyncSettings();
    settings.enabled = true;
    saveSyncSettings(settings);

    if (settings.username && settings.password) {
      // 已有配置，测试连接
      testWebDAVConnection();
    } else {
      updateSyncStatus('请填写坚果云账号和密码');
    }
  } else {
    syncState.enabled = false;
    syncState.connected = false;
    config.style.display = 'none';
    stopPullLoop();
    const settings = getSyncSettings();
    settings.enabled = false;
    saveSyncSettings(settings);
    updateSyncStatus('未开启');
  }
}

function saveWebDAVSettings() {
  const userInput = document.getElementById('setting-webdav-user');
  const passInput = document.getElementById('setting-webdav-pass');
  const urlInput = document.getElementById('setting-webdav-url');
  const username = userInput ? userInput.value.trim() : '';
  const password = passInput ? passInput.value.trim() : '';
  const server = urlInput ? urlInput.value.trim() : '';

  if (!username || !password) {
    toast('请填写账号和密码');
    return;
  }

  const settings = getSyncSettings();
  settings.username = username;
  settings.password = password;
  settings.server = server;
  saveSyncSettings(settings);
  toast('已保存，点击「测试连接」验证');

  // 自动测试
  testWebDAVConnection();
}

async function testWebDAVConnection() {
  const settings = getSyncSettings();
  if (!settings.username || !settings.password) {
    toast('请先填写账号和密码');
    return;
  }

  updateSyncStatus('正在连接...', true);
  const testBtn = document.getElementById('webdav-test-btn');
  if (testBtn) {
    testBtn.disabled = true;
    testBtn.textContent = '连接中...';
  }

  try {
    const result = await webdavRequest('/api/webdav/test', settings);
    if (result.ok) {
      syncState.connected = true;
      syncState.enabled = true;
      settings.enabled = true;
      saveSyncSettings(settings);
      updateSyncStatus('已连接');
      toast('坚果云连接成功！');

      // 首次同步
      setTimeout(() => syncPull(true), 1000);
      startPullLoop();
      updateSyncUI();
    } else {
      syncState.connected = false;
      updateSyncStatus('连接失败: ' + (result.error || '未知错误'));
      toast('连接失败: ' + (result.error || '请检查账号密码'));
    }
  } catch (e) {
    syncState.connected = false;
    updateSyncStatus('连接失败: ' + e.message);
    toast('连接失败: ' + e.message);
  } finally {
    if (testBtn) {
      testBtn.disabled = false;
      testBtn.textContent = '测试连接';
    }
  }
}

function saveSyncAutoSetting() {
  const autoSync = document.getElementById('setting-auto-sync').checked;
  syncState.autoSync = autoSync;
  const settings = getSyncSettings();
  settings.autoSync = autoSync;
  saveSyncSettings(settings);
  toast(autoSync ? '自动同步已开启' : '自动同步已关闭');
}

function disconnectSync() {
  if (!confirm('断开坚果云同步？\n\n本地数据保留，云端数据不删除。\n重新连接后可恢复同步。')) return;

  syncState.enabled = false;
  syncState.connected = false;
  stopPullLoop();

  const settings = getSyncSettings();
  settings.enabled = false;
  saveSyncSettings(settings);

  updateSyncUI();
  toast('已断开坚果云同步');
}

function updateSyncStatus(status, isWorking) {
  const desc = document.getElementById('sync-status-desc');
  if (desc) {
    desc.textContent = status;
    desc.style.color = isWorking ? 'var(--primary)' : (status.includes('失败') || status.includes('错误') ? '#FF6B6B' : 'var(--text-tertiary)');
  }

  const lastTime = document.getElementById('sync-last-time');
  if (lastTime) {
    if (syncState.lastPush) {
      const d = new Date(syncState.lastPush);
      const time = `${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`;
      lastTime.textContent = `上次同步: ${time}`;
    } else if (syncState.enabled && syncState.connected) {
      lastTime.textContent = '尚未同步';
    } else {
      lastTime.textContent = '';
    }
  }
}

function updateSyncUI() {
  const checkbox = document.getElementById('setting-sync-enabled');
  const config = document.getElementById('sync-config');
  const autoCheckbox = document.getElementById('setting-auto-sync');
  const userInput = document.getElementById('setting-webdav-user');
  const passInput = document.getElementById('setting-webdav-pass');
  const urlInput = document.getElementById('setting-webdav-url');

  if (checkbox) checkbox.checked = syncState.enabled;
  if (config) config.style.display = syncState.enabled ? 'block' : 'none';
  if (autoCheckbox) autoCheckbox.checked = syncState.autoSync;

  const settings = getSyncSettings();
  if (userInput) userInput.value = settings.username || '';
  if (passInput) passInput.value = settings.password || '';
  if (urlInput) urlInput.value = settings.server || '';

  if (syncState.enabled && syncState.connected && syncState.lastPush) {
    updateSyncStatus('已同步');
  } else if (syncState.enabled && syncState.connected) {
    updateSyncStatus('已连接');
  } else if (syncState.enabled) {
    updateSyncStatus('请测试连接');
  } else {
    updateSyncStatus('未开启');
  }
}
