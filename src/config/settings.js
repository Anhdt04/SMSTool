const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, '../../config.json');

const DEFAULT_SETTINGS = {
  mode: 'mock', // 'mock' hoặc 'live'
  cookie: '',
  telegramToken: '',
  telegramChatId: '',
  enableTelegram: false,
  enableLoop: true, // Xoay vòng tra cứu
  delayMs: 500, // Độ trễ giữa các lần tra (ms), mặc định 500ms, có thể chỉnh 100ms (0.1s)
  port: 3000
};

class SettingsManager {
  constructor() {
    this.settings = { ...DEFAULT_SETTINGS };
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        this.settings = { ...DEFAULT_SETTINGS, ...parsed };
      } else {
        this.save(this.settings);
      }
    } catch (err) {
      console.error('[SettingsManager] Lỗi đọc config.json:', err.message);
      this.settings = { ...DEFAULT_SETTINGS };
    }
    return this.settings;
  }

  get() {
    return this.settings;
  }

  save(newSettings) {
    try {
      this.settings = { ...this.settings, ...newSettings };
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(this.settings, null, 2), 'utf-8');
      return this.settings;
    } catch (err) {
      console.error('[SettingsManager] Lỗi lưu config.json:', err.message);
      throw err;
    }
  }
}

module.exports = new SettingsManager();
