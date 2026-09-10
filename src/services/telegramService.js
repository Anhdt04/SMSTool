const fs = require('fs');
const path = require('path');
const axios = require('axios');

/**
 * Service tích hợp Telegram Bot
 * - Có cơ chế chống trùng lặp: mỗi trạng thái của 1 số chỉ gửi 1 lần duy nhất
 * - Lưu vết bền vững vào file sent_notifications.json (không mất khi dừng/chạy lại hoặc khởi động lại)
 * - Bắt lỗi mạng an toàn để không làm gián đoạn luồng tra cứu
 */
class TelegramService {
  constructor() {
    this.storagePath = path.join(process.cwd(), 'sent_notifications.json');
    // Lưu lịch sử các trạng thái đã gửi: Map<phone, Set<status>>
    this.sentHistory = new Map();
    this.loadHistory();
  }

  /**
   * Đọc lịch sử thông báo từ file sent_notifications.json
   */
  loadHistory() {
    try {
      if (fs.existsSync(this.storagePath)) {
        const raw = fs.readFileSync(this.storagePath, 'utf8');
        const data = JSON.parse(raw);
        this.sentHistory.clear();
        for (const [phone, statuses] of Object.entries(data)) {
          if (Array.isArray(statuses)) {
            this.sentHistory.set(phone, new Set(statuses));
          }
        }
      }
    } catch (err) {
      console.error('[TelegramService] Lỗi khi đọc file sent_notifications.json:', err.message);
    }
  }

  /**
   * Ghi lịch sử thông báo ra file sent_notifications.json
   */
  saveHistory() {
    try {
      const exportObj = {};
      for (const [phone, set] of this.sentHistory.entries()) {
        exportObj[phone] = Array.from(set);
      }
      fs.writeFileSync(this.storagePath, JSON.stringify(exportObj, null, 2), 'utf8');
    } catch (err) {
      console.error('[TelegramService] Lỗi khi ghi file sent_notifications.json:', err.message);
    }
  }

  /**
   * Xóa toàn bộ lịch sử thông báo (để bot có thể gửi lại từ đầu)
   */
  clearHistory() {
    this.sentHistory.clear();
    try {
      if (fs.existsSync(this.storagePath)) {
        fs.unlinkSync(this.storagePath);
      }
    } catch (err) {
      console.error('[TelegramService] Lỗi khi xóa file sent_notifications.json:', err.message);
    }
    return { success: true, count: 0 };
  }

  /**
   * Số lượng thông báo đã gửi
   */
  getHistoryStats() {
    let totalAlerts = 0;
    for (const set of this.sentHistory.values()) {
      totalAlerts += set.size;
    }
    return {
      uniquePhones: this.sentHistory.size,
      totalAlerts
    };
  }

  /**
   * Kiểm tra xem trạng thái này của số đã từng gửi Telegram chưa
   */
  hasSent(phone, status) {
    this.loadHistory();
    if (!this.sentHistory.has(phone)) return false;
    return this.sentHistory.get(phone).has(status);
  }

  /**
   * Đánh dấu đã gửi và lưu xuống file
   */
  markAsSent(phone, status) {
    this.loadHistory();
    if (!this.sentHistory.has(phone)) {
      this.sentHistory.set(phone, new Set());
    }
    this.sentHistory.get(phone).add(status);
    this.saveHistory();
  }

  /**
   * Gửi tin nhắn đến nhóm Telegram
   */
  async sendMessage(botToken, chatId, text, options = {}) {
    if (!botToken || !chatId || !text) {
      return { success: false, error: 'Thiếu Bot Token hoặc Chat ID' };
    }

    try {
      const url = `https://api.telegram.org/bot${botToken.trim()}/sendMessage`;
      const response = await axios.post(url, {
        chat_id: chatId.trim(),
        text: text,
        parse_mode: options.parse_mode || 'HTML',
        disable_web_page_preview: true
      }, {
        timeout: 8000
      });

      if (response.data && response.data.ok) {
        return { success: true, result: response.data.result };
      } else {
        return { success: false, error: response.data?.description || 'Lỗi không xác định từ Telegram' };
      }
    } catch (err) {
      const errMsg = err.response?.data?.description || err.message;
      return { success: false, error: `Lỗi kết nối Telegram: ${errMsg}` };
    }
  }

  /**
   * Xử lý thông báo theo điều kiện nghiệp vụ
   */
  async notifyCondition({ botToken, chatId, enableTelegram, phone, status, message }) {
    if (!enableTelegram) {
      return { skipped: true, reason: 'Chức năng gửi Telegram đang tắt' };
    }

    // Quy tắc: 1 trạng thái chỉ báo telegram 1 lần cho mỗi số
    if (this.hasSent(phone, status)) {
      return { skipped: true, reason: `Đã từng gửi thông báo trạng thái "${status}" cho số ${phone}` };
    }

    const result = await this.sendMessage(botToken, chatId, message);
    if (result.success) {
      this.markAsSent(phone, status);
      return { success: true, sentMessage: message };
    } else {
      return { success: false, error: result.error };
    }
  }
}

module.exports = new TelegramService();
