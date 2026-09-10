/**
 * Frontend Controller for SMCS Tool
 */

// State
let appState = {
  status: 'idle', // 'idle' | 'running' | 'paused' | 'stopped' | 'completed'
  mode: 'live',
  tableData: [], // { phone, productStatus, warehouse, updatedDate, isCondition1, isCondition2, cycle }
  condition1Items: [], // [{ phone, updatedDate }]
  sortCond1Col: 'default',
  sortCond1Asc: true,
  sortCol: null,
  sortAsc: true,
  searchKeyword: ''
};

// DOM Elements
const elements = {
  // Status & Connection
  connectionBadge: document.getElementById('connectionBadge'),
  connectionText: document.getElementById('connectionText'),
  autoSaveIndicator: document.getElementById('autoSaveIndicator'),

  // Form Controls
  inputCookie: document.getElementById('inputCookie'),
  inputDelay: document.getElementById('inputDelay'),
  checkLoop: document.getElementById('checkLoop'),
  checkTelegram: document.getElementById('checkTelegram'),
  telegramConfigBox: document.getElementById('telegramConfigBox'),
  inputTeleToken: document.getElementById('inputTeleToken'),
  inputTeleChatId: document.getElementById('inputTeleChatId'),
  btnTestTele: document.getElementById('btnTestTele'),
  btnResetTeleHistory: document.getElementById('btnResetTeleHistory'),
  teleHistoryStatus: document.getElementById('teleHistoryStatus'),
  btnSaveConfig: document.getElementById('btnSaveConfig'),

  // Phone input & Actions
  inputPhoneList: document.getElementById('inputPhoneList'),
  badgePhoneCount: document.getElementById('badgePhoneCount'),
  btnLoadSample: document.getElementById('btnLoadSample'),
  btnClearPhones: document.getElementById('btnClearPhones'),
  btnStart: document.getElementById('btnStart'),
  btnPause: document.getElementById('btnPause'),
  btnStop: document.getElementById('btnStop'),

  // Metrics
  valTotal: document.getElementById('valTotal'),
  valProcessed: document.getElementById('valProcessed'),
  valCond1: document.getElementById('valCond1'),
  valCond2: document.getElementById('valCond2'),

  // Ô Riêng ĐK 1
  badgeCond1Count: document.getElementById('badgeCond1Count'),
  selectSortCond1: document.getElementById('selectSortCond1'),
  btnCopyAllCond1: document.getElementById('btnCopyAllCond1'),
  btnClearAllCond1: document.getElementById('btnClearAllCond1'),
  cond1Table: document.getElementById('cond1Table'),
  cond1TableBody: document.getElementById('cond1TableBody'),
  emptyCond1Row: document.getElementById('emptyCond1Row'),
  thCond1Phone: document.getElementById('thCond1Phone'),
  thCond1Date: document.getElementById('thCond1Date'),

  // Table
  cycleBadge: document.getElementById('cycleBadge'),
  inputTableSearch: document.getElementById('inputTableSearch'),
  btnExportExcel: document.getElementById('btnExportExcel'),
  btnClearTable: document.getElementById('btnClearTable'),
  resultsTable: document.getElementById('resultsTable'),
  tableBody: document.getElementById('tableBody'),
  rowTableEmpty: document.getElementById('rowTableEmpty'),

  // Logs & Toast
  logsContainer: document.getElementById('logsContainer'),
  btnClearLogs: document.getElementById('btnClearLogs'),
  toastContainer: document.getElementById('toastContainer')
};

// Mẫu danh sách SĐT (có chứa các số trong tài liệu Word)
const SAMPLE_PHONES = [
  '84942251121', // Số trong doc: Lần 1 ra ĐK1, sau đó ra ĐK2
  '84888441819', // Số trong doc hình 4: Kho thu hồi
  '0912345001',  // Sẽ chuẩn hóa thành 84912345001 (ĐK 1)
  '84912345002', // ĐK 2 ("Đã book số")
  '0912345003',  // Kho số khác
  '84912345004'  // Trạng thái bình thường
].join('\n');

// Khởi chạy
document.addEventListener('DOMContentLoaded', () => {
  initEventListeners();
  loadSavedSettings();
  loadTeleHistoryStats();
  initEventSource();
});

/**
 * Tải cài đặt đã lưu từ Backend kết hợp LocalStorage của trình duyệt
 */
async function loadSavedSettings() {
  let serverSettings = null;
  try {
    const res = await fetch('/api/settings');
    const data = await res.json();
    if (data.success && data.settings) {
      serverSettings = data.settings;
    }
  } catch (err) {
    console.warn('Không thể tải cài đặt từ server:', err);
  }

  // Đọc từ LocalStorage trình duyệt phòng khi server chưa có hoặc mới mở lại
  let localSettings = null;
  try {
    const raw = localStorage.getItem('smcs_settings');
    if (raw) localSettings = JSON.parse(raw);
  } catch (err) {}

  const merged = { ...(localSettings || {}), ...(serverSettings || {}) };
  // Nếu server có trường rỗng nhưng localStorage có giá trị thì lấy từ local
  if (!merged.cookie && localSettings?.cookie) merged.cookie = localSettings.cookie;
  if (!merged.telegramToken && localSettings?.telegramToken) merged.telegramToken = localSettings.telegramToken;
  if (!merged.telegramChatId && localSettings?.telegramChatId) merged.telegramChatId = localSettings.telegramChatId;

  applySettingsToUI(merged);
}

function applySettingsToUI(s) {
  if (s.cookie) elements.inputCookie.value = s.cookie;
  if (s.delayMs) elements.inputDelay.value = s.delayMs;
  if (typeof s.enableLoop === 'boolean') elements.checkLoop.checked = s.enableLoop;
  if (typeof s.enableTelegram === 'boolean') {
    elements.checkTelegram.checked = s.enableTelegram;
    toggleTelegramBox(s.enableTelegram);
  }
  if (s.telegramToken) elements.inputTeleToken.value = s.telegramToken;
  if (s.telegramChatId) elements.inputTeleChatId.value = s.telegramChatId;
}

/**
 * Lưu cài đặt vào cả Server (config.json) và LocalStorage
 */
let saveTimeout = null;
function triggerAutoSave() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    saveSettings(false);
  }, 600);
}

async function saveSettings(manual = false) {
  const payload = getFormSettings();

  // 1. Lưu vào LocalStorage trình duyệt ngay lập tức
  try {
    localStorage.setItem('smcs_settings', JSON.stringify(payload));
  } catch (e) {}

  elements.autoSaveIndicator.textContent = 'Đang lưu...';
  elements.autoSaveIndicator.style.color = 'var(--warning)';

  // 2. Lưu vào backend config.json
  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    elements.autoSaveIndicator.textContent = 'Đã lưu';
    elements.autoSaveIndicator.style.color = 'var(--success)';

    if (manual) {
      showToast('💾 Đã lưu cấu hình hệ thống thành công (vào máy & trình duyệt)!', 'success');
      appendLog('success', 'Đã lưu cấu hình vào config.json và bộ nhớ trình duyệt.');
    }

    setTimeout(() => {
      elements.autoSaveIndicator.textContent = 'Tự động lưu';
      elements.autoSaveIndicator.style.color = 'var(--accent-glow)';
    }, 2000);
  } catch (err) {
    elements.autoSaveIndicator.textContent = 'Lỗi lưu';
    elements.autoSaveIndicator.style.color = 'var(--danger)';
    if (manual) {
      showToast(`Lỗi lưu cấu hình: ${err.message}`, 'error');
    }
  }
}

function getFormSettings() {
  return {
    mode: appState.mode,
    cookie: elements.inputCookie.value.trim(),
    delayMs: Math.max(50, Number(elements.inputDelay.value) || 500),
    enableLoop: elements.checkLoop.checked,
    enableTelegram: elements.checkTelegram.checked,
    telegramToken: elements.inputTeleToken.value.trim(),
    telegramChatId: elements.inputTeleChatId.value.trim()
  };
}

/**
 * Kết nối Server-Sent Events (SSE) để cập nhật dữ liệu thời gian thực
 */
function initEventSource() {
  const evtSource = new EventSource('/api/stream');

  evtSource.addEventListener('initial_state', (e) => {
    const state = JSON.parse(e.data);
    updateRuntimeStatus(state.status);
    if (state.stats) updateStats(state.stats);
    if (state.condition1Items && state.condition1Items.length > 0) {
      appState.condition1Items = [...state.condition1Items];
      renderCondition1Table();
    } else if (state.condition1Numbers && state.condition1Numbers.length > 0) {
      appState.condition1Items = state.condition1Numbers.map(p => ({
        phone: p,
        updatedDate: new Date().toLocaleString('vi-VN')
      }));
      renderCondition1Table();
    }
  });

  evtSource.addEventListener('status_change', (e) => {
    const state = JSON.parse(e.data);
    updateRuntimeStatus(state.status);
    if (state.stats) updateStats(state.stats);
  });

  evtSource.addEventListener('item_processed', (e) => {
    const item = JSON.parse(e.data);
    addTableRow(item);
    loadTeleHistoryStats();
  });

  evtSource.addEventListener('condition1_found', (e) => {
    const data = JSON.parse(e.data);
    addCondition1Item(data.phone, data.updatedDate);
    showToast(`🟢 Tìm thấy số ĐK 1: ${data.phone}`, 'success');
  });

  evtSource.addEventListener('stats_update', (e) => {
    const stats = JSON.parse(e.data);
    updateStats(stats);
  });

  evtSource.addEventListener('log', (e) => {
    const log = JSON.parse(e.data);
    appendLog(log.type, log.message);
  });

  evtSource.onerror = () => {
    elements.connectionText.textContent = 'Mất kết nối máy chủ';
    elements.connectionBadge.querySelector('.status-indicator').className = 'status-indicator paused';
  };
}

/**
 * Lắng nghe các sự kiện tương tác
 */
function initEventListeners() {
  // Tự động lưu khi thay đổi form
  [elements.inputCookie, elements.inputDelay, elements.inputTeleToken, elements.inputTeleChatId].forEach(el => {
    el.addEventListener('input', triggerAutoSave);
  });

  elements.checkLoop.addEventListener('change', triggerAutoSave);
  elements.checkTelegram.addEventListener('change', (e) => {
    toggleTelegramBox(e.target.checked);
    triggerAutoSave();
  });

  // Số lượng số nhập vào
  elements.inputPhoneList.addEventListener('input', updatePhoneInputCount);

  // Nạp mẫu & Xóa
  elements.btnLoadSample.addEventListener('click', () => {
    elements.inputPhoneList.value = SAMPLE_PHONES;
    updatePhoneInputCount();
    showToast('Đã nạp 6 số mẫu thử nghiệm!', 'success');
  });

  elements.btnClearPhones.addEventListener('click', () => {
    elements.inputPhoneList.value = '';
    updatePhoneInputCount();
  });

  // Nút Lưu Cấu Hình Hệ Thống
  if (elements.btnSaveConfig) {
    elements.btnSaveConfig.addEventListener('click', () => saveSettings(true));
  }

  // Điều khiển
  elements.btnStart.addEventListener('click', handleStart);
  elements.btnPause.addEventListener('click', handlePause);
  elements.btnStop.addEventListener('click', handleStop);

  // Test Telegram & Quản lý lịch sử Telegram
  elements.btnTestTele.addEventListener('click', handleTestTelegram);
  if (elements.btnResetTeleHistory) {
    elements.btnResetTeleHistory.addEventListener('click', handleResetTeleHistory);
  }

  // Ô Riêng ĐK 1: Sắp xếp, Copy tất cả, Xóa tất cả
  if (elements.selectSortCond1) {
    elements.selectSortCond1.addEventListener('change', (e) => {
      setCond1Sort(e.target.value);
    });
  }

  if (elements.thCond1Phone) {
    elements.thCond1Phone.addEventListener('click', () => {
      toggleCond1HeaderSort('phone');
    });
  }

  if (elements.thCond1Date) {
    elements.thCond1Date.addEventListener('click', () => {
      toggleCond1HeaderSort('date');
    });
  }

  if (elements.btnCopyAllCond1) {
    elements.btnCopyAllCond1.addEventListener('click', handleCopyAllCond1);
  }

  if (elements.btnClearAllCond1) {
    elements.btnClearAllCond1.addEventListener('click', handleClearAllCond1);
  }

  // Event delegation cho các nút Sao Chép và Xóa từng hàng trong bảng ĐK 1
  if (elements.cond1TableBody) {
    elements.cond1TableBody.addEventListener('click', (e) => {
      const btnCopy = e.target.closest('.btn-cell-copy');
      const btnDelete = e.target.closest('.btn-cell-delete');

      if (btnCopy) {
        const phone = btnCopy.dataset.phone;
        const date = btnCopy.dataset.date || '';
        if (phone) {
          const textToCopy = date ? `${phone}\t${date}` : phone;
          navigator.clipboard.writeText(textToCopy);
          showToast(`Đã sao chép: ${phone}${date ? ' - ' + date : ''}`, 'success');
        }
      } else if (btnDelete) {
        const phone = btnDelete.dataset.phone;
        if (phone) {
          removeCondition1Item(phone);
        }
      }
    });
  }

  // Copy ra Excel
  elements.btnExportExcel.addEventListener('click', handleExportExcel);

  // Xóa bảng & Xóa logs
  elements.btnClearTable.addEventListener('click', () => {
    appState.tableData = [];
    renderTable();
    showToast('Đã xóa dữ liệu bảng hiển thị.');
  });

  elements.btnClearLogs.addEventListener('click', () => {
    elements.logsContainer.innerHTML = '';
  });

  // Lọc bảng
  elements.inputTableSearch.addEventListener('input', (e) => {
    appState.searchKeyword = e.target.value.toLowerCase().trim();
    renderTable();
  });

  // Sắp xếp các cột bảng
  document.querySelectorAll('.data-table th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (appState.sortCol === col) {
        appState.sortAsc = !appState.sortAsc;
      } else {
        appState.sortCol = col;
        appState.sortAsc = true;
      }
      renderTable();
    });
  });
}

/**
 * Tải số lượng thông báo Telegram đã gửi
 */
async function loadTeleHistoryStats() {
  try {
    const res = await fetch('/api/telegram/history-stats');
    const data = await res.json();
    if (data.success && data.stats && elements.teleHistoryStatus) {
      if (data.stats.totalAlerts > 0) {
        elements.teleHistoryStatus.textContent = `📁 Đã lưu vết: ${data.stats.totalAlerts} thông báo (${data.stats.uniquePhones} số) - không gửi trùng khi chạy lại.`;
      } else {
        elements.teleHistoryStatus.textContent = '📁 Lịch sử thông báo trống (chưa có số nào được gửi).';
      }
    }
  } catch (err) {}
}

/**
 * Xử lý xóa lịch sử thông báo Telegram
 */
async function handleResetTeleHistory() {
  const ok = confirm('Bạn có chắc chắn muốn xóa lịch sử các số đã gửi thông báo Telegram?\n\nSau khi xóa, nếu bạn tra cứu lại các số đó thì bot sẽ gửi lại thông báo.');
  if (!ok) return;

  try {
    if (elements.btnResetTeleHistory) elements.btnResetTeleHistory.disabled = true;
    const res = await fetch('/api/telegram/reset-history', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast('Đã xóa sạch lịch sử thông báo Telegram!', 'success');
      appendLog('info', 'Đã đặt lại lịch sử thông báo Telegram (file sent_notifications.json đã được xóa).');
      loadTeleHistoryStats();
    }
  } catch (err) {
    showToast(`Lỗi khi xóa: ${err.message}`, 'error');
  } finally {
    if (elements.btnResetTeleHistory) elements.btnResetTeleHistory.disabled = false;
  }
}

function toggleTelegramBox(enable) {
  if (enable) {
    elements.telegramConfigBox.classList.add('visible');
  } else {
    elements.telegramConfigBox.classList.remove('visible');
  }
}

function updatePhoneInputCount() {
  const text = elements.inputPhoneList.value;
  const lines = text.split(/[\r\n,;\t]+/).filter(l => l.trim().length > 0);
  elements.badgePhoneCount.textContent = `${lines.length} số`;
}

/**
 * Xử lý Start / Pause / Stop
 */
async function handleStart() {
  const phoneList = elements.inputPhoneList.value.trim();
  if (!phoneList) {
    showToast('Vui lòng nhập danh sách số điện thoại cần tra cứu!', 'error');
    elements.inputPhoneList.focus();
    return;
  }

  const options = getFormSettings();

  try {
    elements.btnStart.disabled = true;
    const res = await fetch('/api/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneList, options })
    });
    const data = await res.json();
    if (!data.success) {
      showToast(data.error || 'Không thể bắt đầu tra cứu', 'error');
      elements.btnStart.disabled = false;
    }
  } catch (err) {
    showToast(`Lỗi gửi lệnh: ${err.message}`, 'error');
    elements.btnStart.disabled = false;
  }
}

async function handlePause() {
  try {
    if (appState.status === 'running') {
      await fetch('/api/pause', { method: 'POST' });
    } else if (appState.status === 'paused') {
      await fetch('/api/resume', { method: 'POST' });
    }
  } catch (err) {
    showToast(`Lỗi: ${err.message}`, 'error');
  }
}

async function handleStop() {
  try {
    await fetch('/api/stop', { method: 'POST' });
  } catch (err) {
    showToast(`Lỗi: ${err.message}`, 'error');
  }
}

async function handleTestTelegram() {
  const botToken = elements.inputTeleToken.value.trim();
  const chatId = elements.inputTeleChatId.value.trim();

  if (!botToken || !chatId) {
    showToast('Vui lòng nhập đủ Telegram Bot Token và Chat ID', 'error');
    return;
  }

  elements.btnTestTele.disabled = true;
  elements.btnTestTele.textContent = '⏳ Đang gửi tin thử...';

  try {
    const res = await fetch('/api/test-telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ botToken, chatId })
    });
    const data = await res.json();
    if (data.success) {
      showToast(' Đã gửi tin nhắn thử nghiệm thành công!', 'success');
      appendLog('success', 'Gửi tin nhắn thử nghiệm Telegram thành công.');
    } else {
      showToast(` Gửi thất bại: ${data.error}`, 'error');
      appendLog('error', `Lỗi Telegram: ${data.error}`);
    }
  } catch (err) {
    showToast(`Lỗi kết nối: ${err.message}`, 'error');
  } finally {
    elements.btnTestTele.disabled = false;
    elements.btnTestTele.textContent = '🔔 Kiểm tra gửi thử Telegram';
  }
}

/**
 * Cập nhật trạng thái Runtime
 */
function updateRuntimeStatus(status) {
  appState.status = status;
  const ind = elements.connectionBadge.querySelector('.status-indicator');

  if (status === 'running') {
    elements.connectionText.textContent = 'Đang tra cứu...';
    ind.className = 'status-indicator running';
    elements.btnStart.disabled = true;
    elements.btnPause.disabled = false;
    elements.btnPause.textContent = '⏸ Tạm Dừng';
    elements.btnStop.disabled = false;
  } else if (status === 'paused') {
    elements.connectionText.textContent = 'Tạm dừng';
    ind.className = 'status-indicator paused';
    elements.btnStart.disabled = true;
    elements.btnPause.disabled = false;
    elements.btnPause.textContent = '▶ Tiếp Tục';
    elements.btnStop.disabled = false;
  } else if (status === 'stopped' || status === 'completed') {
    elements.connectionText.textContent = status === 'completed' ? 'Hoàn thành' : 'Đã dừng';
    ind.className = 'status-indicator ready';
    elements.btnStart.disabled = false;
    elements.btnPause.disabled = true;
    elements.btnPause.textContent = '⏸ Tạm Dừng';
    elements.btnStop.disabled = true;
  } else {
    elements.connectionText.textContent = 'Sẵn sàng';
    ind.className = 'status-indicator ready';
    elements.btnStart.disabled = false;
    elements.btnPause.disabled = true;
    elements.btnStop.disabled = true;
  }
}

function updateStats(stats) {
  if (stats.total !== undefined) elements.valTotal.textContent = stats.total;
  if (stats.processed !== undefined) elements.valProcessed.textContent = stats.processed;
  if (stats.condition1Count !== undefined) elements.valCond1.textContent = stats.condition1Count;
  if (stats.condition2Count !== undefined) elements.valCond2.textContent = stats.condition2Count;
  if (stats.cycle !== undefined) elements.cycleBadge.textContent = `Vòng: ${stats.cycle}`;
}

/**
 * Quản lý và hiển thị Bảng Ô Riêng ĐK 1 (Hàng dọc, sắp xếp, xóa từng số, xóa tất cả)
 */
function addCondition1Item(phone, updatedDate) {
  const existing = appState.condition1Items.find(x => x.phone === phone);
  if (!existing) {
    appState.condition1Items.push({
      phone,
      updatedDate: updatedDate || new Date().toLocaleString('vi-VN')
    });
    renderCondition1Table();
  }
}

function removeCondition1Item(phone) {
  appState.condition1Items = appState.condition1Items.filter(x => x.phone !== phone);
  renderCondition1Table();
  showToast(`Đã xóa số ${phone} khỏi ô riêng`, 'info');
}

function handleClearAllCond1() {
  if (appState.condition1Items.length === 0) {
    showToast('Ô ĐK 1 đang trống', 'info');
    return;
  }
  const ok = confirm(`Bạn có chắc muốn xóa toàn bộ ${appState.condition1Items.length} số khỏi ô riêng này?`);
  if (!ok) return;

  appState.condition1Items = [];
  renderCondition1Table();
  showToast('Đã xóa tất cả các số khỏi ô ĐK 1', 'info');
}

function getSortedCondition1Items() {
  let items = [...appState.condition1Items];
  const sort = appState.sortCond1Col;

  if (sort === 'phone-asc') {
    items.sort((a, b) => a.phone.localeCompare(b.phone, 'vi', { numeric: true }));
  } else if (sort === 'phone-desc') {
    items.sort((a, b) => b.phone.localeCompare(a.phone, 'vi', { numeric: true }));
  } else if (sort === 'date-desc') {
    items.sort((a, b) => parseDateForSort(b.updatedDate) - parseDateForSort(a.updatedDate));
  } else if (sort === 'date-asc') {
    items.sort((a, b) => parseDateForSort(a.updatedDate) - parseDateForSort(b.updatedDate));
  }
  return items;
}

function handleCopyAllCond1() {
  const items = getSortedCondition1Items();
  if (items.length === 0) {
    showToast('Chưa có số nào trong ô ĐK 1 để sao chép', 'error');
    return;
  }
  // Sao chép cả số điện thoại và ngày thay đổi theo đúng thứ tự hiển thị (tab-delimited để dán vào Excel thành 2 cột)
  const allLines = items.map(x => `${x.phone}\t${x.updatedDate || ''}`).join('\n');
  navigator.clipboard.writeText(allLines);
  showToast(`📋 Đã sao chép ${items.length} số ĐK 1 (kèm ngày giờ, đúng thứ tự)!`, 'success');
}

function parseDateForSort(dateStr) {
  if (!dateStr) return 0;
  // Hỗ trợ dạng: "DD/MM/YYYY HH:mm:ss" hoặc "YYYY-MM-DD"
  const parts = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2}):(\d{1,2}))?/);
  if (parts) {
    const d = parseInt(parts[1], 10);
    const m = parseInt(parts[2], 10) - 1;
    const y = parseInt(parts[3], 10);
    const hh = parseInt(parts[4] || 0, 10);
    const mm = parseInt(parts[5] || 0, 10);
    const ss = parseInt(parts[6] || 0, 10);
    return new Date(y, m, d, hh, mm, ss).getTime();
  }
  const t = Date.parse(dateStr);
  return isNaN(t) ? 0 : t;
}

function setCond1Sort(sortVal) {
  appState.sortCond1Col = sortVal;
  renderCondition1Table();
}

function toggleCond1HeaderSort(col) {
  if (col === 'phone') {
    if (appState.sortCond1Col === 'phone-asc') {
      setCond1Sort('phone-desc');
      if (elements.selectSortCond1) elements.selectSortCond1.value = 'phone-desc';
    } else {
      setCond1Sort('phone-asc');
      if (elements.selectSortCond1) elements.selectSortCond1.value = 'phone-asc';
    }
  } else if (col === 'date') {
    if (appState.sortCond1Col === 'date-desc') {
      setCond1Sort('date-asc');
      if (elements.selectSortCond1) elements.selectSortCond1.value = 'date-asc';
    } else {
      setCond1Sort('date-desc');
      if (elements.selectSortCond1) elements.selectSortCond1.value = 'date-desc';
    }
  }
}

function renderCondition1Table() {
  if (!elements.cond1TableBody) return;

  const count = appState.condition1Items.length;
  if (elements.badgeCond1Count) {
    elements.badgeCond1Count.textContent = `${count} số`;
  }

  // Cập nhật icon mũi tên ở tiêu đề cột ĐK 1
  if (elements.thCond1Phone) {
    const icon = elements.thCond1Phone.querySelector('.sort-icon');
    if (appState.sortCond1Col === 'phone-asc') {
      if (icon) icon.textContent = '▲';
      elements.thCond1Phone.classList.add('sorted');
    } else if (appState.sortCond1Col === 'phone-desc') {
      if (icon) icon.textContent = '▼';
      elements.thCond1Phone.classList.add('sorted');
    } else {
      if (icon) icon.textContent = '⇅';
      elements.thCond1Phone.classList.remove('sorted');
    }
  }
  if (elements.thCond1Date) {
    const icon = elements.thCond1Date.querySelector('.sort-icon');
    if (appState.sortCond1Col === 'date-asc') {
      if (icon) icon.textContent = '▲';
      elements.thCond1Date.classList.add('sorted');
    } else if (appState.sortCond1Col === 'date-desc') {
      if (icon) icon.textContent = '▼';
      elements.thCond1Date.classList.add('sorted');
    } else {
      if (icon) icon.textContent = '⇅';
      elements.thCond1Date.classList.remove('sorted');
    }
  }

  if (count === 0) {
    elements.cond1TableBody.innerHTML = `
      <tr class="empty-row" id="emptyCond1Row">
        <td colspan="4" style="text-align: center; padding: 24px; color: var(--text-muted); font-style: italic;">
          Chưa có số nào thỏa mãn ĐK 1. Khi tìm thấy số sẵn sàng sử dụng tại Kho chung VNP, số sẽ xuất hiện tại đây theo từng hàng dọc.
        </td>
      </tr>
    `;
    return;
  }

  // Lấy danh sách đã sắp xếp đúng theo thứ tự hiển thị
  const items = getSortedCondition1Items();

  // Render HTML
  const rowsHtml = items.map((item, index) => {
    return `
      <tr>
        <td class="col-stt">${index + 1}</td>
        <td class="col-phone">${item.phone}</td>
        <td class="col-date">${item.updatedDate || '--:--:--'}</td>
        <td class="col-action">
          <div class="cond1-action-buttons">
            <button type="button" class="btn-cell-copy" data-phone="${item.phone}" data-date="${item.updatedDate || ''}" title="Sao chép số ${item.phone} và ngày thay đổi">
              📋 Sao chép
            </button>
            <button type="button" class="btn-cell-delete" data-phone="${item.phone}" title="Xóa số ${item.phone} khỏi ô riêng">
              🗑️ Xóa
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  elements.cond1TableBody.innerHTML = rowsHtml;
}

/**
 * Thêm hàng vào bảng kết quả
 */
function addTableRow(item) {
  // Cập nhật hoặc thêm mới vào mảng dữ liệu
  const existingIdx = appState.tableData.findIndex(row => row.phone === item.phone);
  if (existingIdx >= 0) {
    appState.tableData[existingIdx] = item;
  } else {
    appState.tableData.unshift(item);
  }

  renderTable();
}

/**
 * Lấy dữ liệu bảng chính hiện tại theo đúng bộ lọc và thứ tự sắp xếp hiển thị
 */
function getCurrentDisplayData() {
  let displayData = [...appState.tableData];

  // Lọc theo từ khóa
  if (appState.searchKeyword) {
    const kw = appState.searchKeyword.toLowerCase().trim();
    displayData = displayData.filter(r => 
      (r.phone && r.phone.toLowerCase().includes(kw)) ||
      (r.productStatus && r.productStatus.toLowerCase().includes(kw)) ||
      (r.warehouse && r.warehouse.toLowerCase().includes(kw)) ||
      (r.updatedDate && r.updatedDate.toLowerCase().includes(kw))
    );
  }

  // Sắp xếp
  if (appState.sortCol) {
    const col = appState.sortCol;
    const factor = appState.sortAsc ? 1 : -1;
    displayData.sort((a, b) => {
      if (col === 'date') {
        const tA = parseDateForSort(a.updatedDate);
        const tB = parseDateForSort(b.updatedDate);
        return (tA - tB) * factor;
      }
      let valA = '';
      let valB = '';
      if (col === 'phone') {
        valA = a.phone || '';
        valB = b.phone || '';
      } else if (col === 'status') {
        valA = a.productStatus || '';
        valB = b.productStatus || '';
      } else if (col === 'warehouse') {
        valA = a.warehouse || '';
        valB = b.warehouse || '';
      } else {
        valA = a[col] || '';
        valB = b[col] || '';
      }
      return valA.localeCompare(valB, 'vi', { numeric: true, sensitivity: 'base' }) * factor;
    });
  }

  return displayData;
}

/**
 * Vẽ lại bảng theo bộ lọc và sắp xếp
 */
function renderTable() {
  const displayData = getCurrentDisplayData();

  // Cập nhật biểu tượng mũi tên sắp xếp ở tiêu đề cột bảng chính
  document.querySelectorAll('.data-table th.sortable').forEach(th => {
    const col = th.dataset.col;
    const icon = th.querySelector('.sort-icon');
    if (icon) {
      if (appState.sortCol === col) {
        icon.textContent = appState.sortAsc ? '▲' : '▼';
        th.classList.add('sorted');
      } else {
        icon.textContent = '⇅';
        th.classList.remove('sorted');
      }
    }
  });

  // Render HTML
  if (displayData.length === 0) {
    elements.tableBody.innerHTML = `
      <tr class="empty-row">
        <td colspan="5">Không có dữ liệu phù hợp.</td>
      </tr>
    `;
    return;
  }

  let html = '';
  for (const row of displayData) {
    let rowClass = '';
    if (row.isCondition1) rowClass = 'row-cond1';
    else if (row.isCondition2) rowClass = 'row-cond2';

    let statusTagClass = 'neutral';
    if (row.productStatus === 'Sẵn sàng sử dụng') statusTagClass = 'ready';
    else if (row.productStatus === 'Đã book số') statusTagClass = 'booked';

    html += `
      <tr class="${rowClass}">
        <td class="cell-phone">${row.phone}</td>
        <td>
          <span class="status-tag ${statusTagClass}">${row.productStatus}</span>
        </td>
        <td>
          <span class="warehouse-tag">${row.warehouse}</span>
        </td>
        <td class="cell-date">${row.updatedDate}</td>
        <td>
          <button type="button" class="btn-row-copy" title="Sao chép dòng này" onclick="copySingleRow('${row.phone}', '${row.productStatus}', '${row.warehouse}', '${row.updatedDate}')">
            📋 Copy
          </button>
        </td>
      </tr>
    `;
  }

  elements.tableBody.innerHTML = html;
}

window.copySingleRow = function(phone, status, warehouse, date) {
  const text = `${phone}\t${status}\t${warehouse}\t${date}`;
  navigator.clipboard.writeText(text);
  showToast(`Đã sao chép dòng số ${phone} (chuẩn dán Excel)!`, 'success');
};

/**
 * Xuất dữ liệu bảng để dán trực tiếp vào Excel (Tab-Separated Values - TSV)
 * Đảm bảo xuất đúng 100% theo thứ tự người dùng đã lọc và sắp xếp trên màn hình!
 */
function handleExportExcel() {
  const displayData = getCurrentDisplayData();
  if (displayData.length === 0) {
    showToast('Bảng chưa có dữ liệu để xuất!', 'error');
    return;
  }

  // Header
  const headers = ['Số thuê bao', 'Trạng thái sản phẩm', 'Hàng đang tại kho', 'Ngày thay đổi'];
  const rows = [headers.join('\t')];

  for (const r of displayData) {
    rows.push([r.phone, r.productStatus, r.warehouse, r.updatedDate].join('\t'));
  }

  const tsvText = rows.join('\n');
  navigator.clipboard.writeText(tsvText);
  showToast(`📋 Đã sao chép ${displayData.length} dòng dữ liệu theo đúng thứ tự hiển thị! Bạn có thể dán (Ctrl+V) thẳng vào Excel.`, 'success');
}

/**
 * Ghi nhật ký (Log)
 */
function appendLog(type, message) {
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;

  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

  entry.innerHTML = `<span class="log-time">${timeStr}</span><span class="log-text">${escapeHtml(message)}</span>`;
  elements.logsContainer.appendChild(entry);
  elements.logsContainer.scrollTop = elements.logsContainer.scrollHeight;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);
}

/**
 * Toast thông báo
 */
function showToast(msg, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  elements.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}
