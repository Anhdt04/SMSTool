const express = require('express');
const path = require('path');
const settingsManager = require('./src/config/settings');
const queueService = require('./src/services/queueService');
const telegramService = require('./src/services/telegramService');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
let embeddedAssets = { html: '', css: '', js: '' };
try {
  embeddedAssets = require('./src/public/embeddedAssets');
} catch (e) {}

// Hỗ trợ thư mục tĩnh nếu có ngoài ổ đĩa
app.use(express.static(path.join(__dirname, 'src/public')));
app.use(express.static(path.join(process.cwd(), 'src/public')));

// Fallback phục vụ giao diện từ bộ nhớ nhúng trong file exe (khi chạy không có thư mục đính kèm)
app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(embeddedAssets.html || '<h1>SMCS Tool</h1>');
});

app.get('/style.css', (req, res) => {
  res.setHeader('Content-Type', 'text/css; charset=utf-8');
  res.send(embeddedAssets.css || '');
});

app.get('/app.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.send(embeddedAssets.js || '');
});

// Quản lý các kết nối Server-Sent Events (SSE) để cập nhật giao diện thời gian thực
const sseClients = new Set();

function broadcastSSE(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    client.write(payload);
  }
}

// Đăng ký lắng nghe các sự kiện từ queueService để đẩy xuống trình duyệt
queueService.on('status_change', data => broadcastSSE('status_change', data));
queueService.on('item_processed', data => broadcastSSE('item_processed', data));
queueService.on('condition1_found', data => broadcastSSE('condition1_found', data));
queueService.on('stats_update', data => broadcastSSE('stats_update', data));
queueService.on('log', data => broadcastSSE('log', data));

let shutdownTimer = null;

function checkAutoShutdown() {
  if (sseClients.size === 0) {
    if (shutdownTimer) clearTimeout(shutdownTimer);
    // Khi người dùng đóng cửa sổ app, sau 6 giây tự động thoát server
    shutdownTimer = setTimeout(() => {
      if (sseClients.size === 0) {
        console.log('\n[SMCS Tool] Cửa sổ ứng dụng đã đóng. Đang thoát chương trình...');
        process.exit(0);
      }
    }, 6000);
  } else {
    if (shutdownTimer) {
      clearTimeout(shutdownTimer);
      shutdownTimer = null;
    }
  }
}

// API: Endpoint SSE
app.get('/api/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  if (shutdownTimer) {
    clearTimeout(shutdownTimer);
    shutdownTimer = null;
  }
  sseClients.add(res);

  // Gửi trạng thái ban đầu ngay khi client kết nối
  res.write(`event: initial_state\ndata: ${JSON.stringify(queueService.getStatus())}\n\n`);

  req.on('close', () => {
    sseClients.delete(res);
    checkAutoShutdown();
  });
});

// API: Lấy cấu hình đã lưu
app.get('/api/settings', (req, res) => {
  res.json({ success: true, settings: settingsManager.get() });
});

// API: Lưu cấu hình
app.post('/api/settings', (req, res) => {
  try {
    const updated = settingsManager.save(req.body);
    queueService.updateOptions(updated);
    res.json({ success: true, settings: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Thử nghiệm kết nối Telegram
app.post('/api/test-telegram', async (req, res) => {
  const { botToken, chatId } = req.body;
  const testMsg = `🔔 <b>Test Kết Nối SMCS Tool</b>\nThời gian: ${new Date().toLocaleString('vi-VN')}\nKết nối Telegram thành công!`;
  const result = await telegramService.sendMessage(botToken, chatId, testMsg);
  res.json(result);
});

// API: Lấy thống kê lịch sử thông báo Telegram
app.get('/api/telegram/history-stats', (req, res) => {
  res.json({ success: true, stats: telegramService.getHistoryStats() });
});

// API: Xóa lịch sử thông báo Telegram để cho phép gửi lại
app.post('/api/telegram/reset-history', (req, res) => {
  const result = telegramService.clearHistory();
  res.json(result);
});

// API: Bắt đầu chạy
app.post('/api/start', async (req, res) => {
  try {
    const { phoneList, options } = req.body;
    // Tự động lưu các thiết lập người dùng truyền lên
    if (options) {
      settingsManager.save(options);
    }
    const result = await queueService.start(phoneList, options || settingsManager.get());
    res.json({ success: true, status: result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// API: Tạm dừng
app.post('/api/pause', (req, res) => {
  queueService.pause();
  res.json({ success: true, status: queueService.getStatus() });
});

// API: Tiếp tục
app.post('/api/resume', (req, res) => {
  queueService.resume();
  res.json({ success: true, status: queueService.getStatus() });
});

// API: Dừng hẳn
app.post('/api/stop', (req, res) => {
  queueService.stop();
  res.json({ success: true, status: queueService.getStatus() });
});

// API: Lấy trạng thái hiện tại
app.get('/api/status', (req, res) => {
  res.json({ success: true, status: queueService.getStatus() });
});

const PORT = process.env.PORT || settingsManager.get().port || 3000;
const { exec } = require('child_process');

function launchDesktopApp(url) {
  if (process.platform !== 'win32') {
    const cmd = process.platform === 'darwin' ? 'open' : 'xdg-open';
    exec(`${cmd} ${url}`).unref();
    return;
  }

  const fs = require('fs');
  const path = require('path');

  // Danh sách đường dẫn Chrome và Edge trên Windows
  const browserCandidates = [
    // 1. Google Chrome
    path.join(process.env['ProgramFiles'] || '', 'Google/Chrome/Application/chrome.exe'),
    path.join(process.env['ProgramFiles(x86)'] || '', 'Google/Chrome/Application/chrome.exe'),
    path.join(process.env['LOCALAPPDATA'] || '', 'Google/Chrome/Application/chrome.exe'),
    // 2. Microsoft Edge (luôn có sẵn 100% trên mọi máy Windows 10 & 11)
    path.join(process.env['ProgramFiles(x86)'] || '', 'Microsoft/Edge/Application/msedge.exe'),
    path.join(process.env['ProgramFiles'] || '', 'Microsoft/Edge/Application/msedge.exe'),
    path.join(process.env['LOCALAPPDATA'] || '', 'Microsoft/Edge/Application/msedge.exe')
  ];

  let selectedBrowser = null;
  for (const p of browserCandidates) {
    if (fs.existsSync(p)) {
      selectedBrowser = p;
      break;
    }
  }

  if (selectedBrowser) {
    // Mở ở chế độ Application Window (--app), kích thước chuẩn Desktop
    // Không có thanh địa chỉ URL, không có thanh tab hay bookmark, như app riêng biệt
    const appCommand = `"${selectedBrowser}" --app="${url}" --window-size=1440,920`;
    exec(appCommand, (err) => {
      if (err) {
        exec(`start ${url}`).unref();
      }
    }).unref();
  } else {
    // Dự phòng mở trình duyệt mặc định
    exec(`start ${url}`).unref();
  }
}

app.listen(PORT, () => {
  console.log(`=================================================`);
  console.log(`🚀 SMCS VNPT Lookup Tool - Ứng Dụng Độc Lập`);
  console.log(`👉 Cửa sổ ứng dụng đang được khởi chạy...`);
  console.log(`ℹ️ Đóng cửa sổ ứng dụng để thoát chương trình.`);
  console.log(`=================================================`);

  // Đổi tiêu đề console
  if (process.platform === 'win32') {
    try { process.title = 'SMCS VNPT Tool - Running'; } catch (e) {}
  }

  // Tự động mở cửa sổ App Window riêng biệt
  launchDesktopApp(`http://localhost:${PORT}`);

  // Sau 25 giây khởi động, bắt đầu giám sát để tự tắt khi người dùng đóng cửa sổ app
  setTimeout(() => {
    checkAutoShutdown();
  }, 25000);
});
