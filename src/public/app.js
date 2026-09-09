/**
 * Frontend Controller for SMCS Tool
 */

// State
let appState = {
  status: 'idle', // 'idle' | 'running' | 'paused' | 'stopped' | 'completed'
  mode: 'live',
  tableData: [], // { phone, productStatus, warehouse, updatedDate, isCondition1, isCondition2, cycle }
  condition1List: [],
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

  // Quick Copy
  cond1Container: document.getElementById('cond1Container'),
  emptyCond1: document.getElementById('emptyCond1'),
  badgeCond1Count: document.getElementById('badgeCond1Count'),
  btnCopyAllCond1: document.getElementById('btnCopyAllCond1'),

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
 * Tải cài đặt đã lưu từ Backend
 */
async function loadSavedSettings() {
  try {
    const res = await fetch('/api/settings');
    const data = await res.json();
    if (data.success && data.settings) {
      applySettingsToUI(data.settings);
    }
  } catch (err) {
    console.warn('Không thể tải cài đặt:', err);
  }
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
 * Tự động lưu cài đặt
 */
let saveTimeout = null;
function triggerAutoSave() {
  if (saveTimeout) clearTimeout(saveTimeout);
  elements.autoSaveIndicator.textContent = 'Đang lưu...';
  elements.autoSaveIndicator.style.color = 'var(--warning)';

  saveTimeout = setTimeout(async () => {
    const payload = getFormSettings();
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      elements.autoSaveIndicator.textContent = 'Đã lưu';
      elements.autoSaveIndicator.style.color = 'var(--success)';
      setTimeout(() => {
        elements.autoSaveIndicator.textContent = 'Tự động lưu';
        elements.autoSaveIndicator.style.color = 'var(--accent-glow)';
      }, 2000);
    } catch (err) {
      elements.autoSaveIndicator.textContent = 'Lỗi lưu';
      elements.autoSaveIndicator.style.color = 'var(--danger)';
    }
  }, 600);
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
    if (state.condition1Numbers) {
      state.condition1Numbers.forEach(p => addCondition1Tag(p));
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
    addCondition1Tag(data.phone);
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

  // Điều khiển
  elements.btnStart.addEventListener('click', handleStart);
  elements.btnPause.addEventListener('click', handlePause);
  elements.btnStop.addEventListener('click', handleStop);

  // Test Telegram & Quản lý lịch sử Telegram
  elements.btnTestTele.addEventListener('click', handleTestTelegram);
  if (elements.btnResetTeleHistory) {
    elements.btnResetTeleHistory.addEventListener('click', handleResetTeleHistory);
  }

  // Copy All Condition 1
  elements.btnCopyAllCond1.addEventListener('click', handleCopyAllCond1);

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
 * Thêm số vào ô Copy nhanh ĐK 1
 */
function addCondition1Tag(phone) {
  if (appState.condition1List.includes(phone)) return;
  appState.condition1List.push(phone);

  if (elements.emptyCond1) {
    elements.emptyCond1.style.display = 'none';
  }

  elements.badgeCond1Count.textContent = `${appState.condition1List.length} số`;

  const tag = document.createElement('div');
  tag.className = 'phone-tag';
  tag.innerHTML = `<span>${phone}</span><span class="copy-icon">📋</span>`;
  tag.title = 'Bấm để sao chép số này';
  tag.addEventListener('click', () => {
    navigator.clipboard.writeText(phone);
    showToast(`Đã sao chép: ${phone}`, 'success');
  });

  elements.cond1Container.appendChild(tag);
}

function handleCopyAllCond1() {
  if (appState.condition1List.length === 0) {
    showToast('Chưa có số nào trong ô ĐK 1', 'error');
    return;
  }
  const allText = appState.condition1List.join('\n');
  navigator.clipboard.writeText(allText);
  showToast(`Đã sao chép tất cả ${appState.condition1List.length} số ĐK 1!`, 'success');
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
 * Vẽ lại bảng theo bộ lọc và sắp xếp
 */
function renderTable() {
  let displayData = [...appState.tableData];

  // Lọc theo từ khóa
  if (appState.searchKeyword) {
    const kw = appState.searchKeyword;
    displayData = displayData.filter(r => 
      r.phone.includes(kw) ||
      r.productStatus.toLowerCase().includes(kw) ||
      r.warehouse.toLowerCase().includes(kw) ||
      r.updatedDate.toLowerCase().includes(kw)
    );
  }

  // Sắp xếp
  if (appState.sortCol) {
    const col = appState.sortCol;
    const factor = appState.sortAsc ? 1 : -1;
    displayData.sort((a, b) => {
      let valA = a[col] || '';
      let valB = b[col] || '';
      return valA.localeCompare(valB) * factor;
    });
  }

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
 */
function handleExportExcel() {
  if (appState.tableData.length === 0) {
    showToast('Bảng chưa có dữ liệu để xuất!', 'error');
    return;
  }

  // Header
  const headers = ['Số thuê bao', 'Trạng thái sản phẩm', 'Hàng đang tại kho', 'Ngày thay đổi'];
  const rows = [headers.join('\t')];

  for (const r of appState.tableData) {
    rows.push([r.phone, r.productStatus, r.warehouse, r.updatedDate].join('\t'));
  }

  const tsvText = rows.join('\n');
  navigator.clipboard.writeText(tsvText);
  showToast(` Đã sao chép ${appState.tableData.length} dòng dữ liệu! Bạn có thể dán (Ctrl+V) thẳng vào Excel.`, 'success');
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
