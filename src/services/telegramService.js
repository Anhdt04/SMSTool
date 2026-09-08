const axios = require('axios');

/**
 * Service tích hợp Telegram Bot
 * - Có cơ chế chống trùng lặp: mỗi trạng thái của 1 số chỉ gửi 1 lần duy nhất
 * - Bắt lỗi mạng an toàn để không làm gián đoạn luồng tra cứu
 */
class TelegramService {
  constructor() {
    // Lưu lịch sử các trạng thái đã gửi: Map<phone, Set<status>>
    // Ví dụ: Map { '84942251121' => Set { 'Sẵn sàng sử dụng', 'Đã book số' } }
    this.sentHistory = new Map();
  }

  reset() {
    this.sentHistory.clear();
  }

  /**
   * Kiểm tra xem trạng thái này của số đã từng gửi Telegram chưa
   */
  hasSent(phone, status) {
    if (!this.sentHistory.has(phone)) return false;
    return this.sentHistory.get(phone).has(status);
  }

  /**
   * Đánh dấu đã gửi
   */
  markAsSent(phone, status) {
    if (!this.sentHistory.has(phone)) {
      this.sentHistory.set(phone, new Set());
    }
    this.sentHistory.get(phone).add(status);
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
   * @param {Object} params
   * @param {string} params.botToken
   * @param {string} params.chatId
   * @param {boolean} params.enableTelegram
   * @param {string} params.phone
   * @param {string} params.status
   * @param {string} params.message
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
