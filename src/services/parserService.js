/**
 * Parser & Business Rule Service
 */
class ParserService {
  /**
   * Chuẩn hóa số điện thoại về định dạng 84 đầu
   * Ví dụ: 0942251121 -> 84942251121
   *        +84942251121 -> 84942251121
   *        942251121 -> 84942251121
   */
  normalizePhoneNumber(rawPhone) {
    if (!rawPhone) return '';
    let cleaned = String(rawPhone).trim().replace(/[^\d+]/g, '');
    if (cleaned.startsWith('+')) cleaned = cleaned.substring(1);
    if (cleaned.startsWith('0')) {
      cleaned = '84' + cleaned.substring(1);
    } else if (!cleaned.startsWith('84') && cleaned.length === 9) {
      cleaned = '84' + cleaned;
    }
    return cleaned;
  }

  /**
   * Chuẩn hóa danh sách nhiều số điện thoại từ văn bản nhập vào
   * Hỗ trợ phân tách bằng xuống dòng, dấu phẩy, dấu chấm phẩy, khoảng trắng
   */
  parsePhoneList(rawText) {
    if (!rawText) return [];
    const lines = rawText.split(/[\r\n,;\t]+/);
    const result = [];
    const seen = new Set();

    for (let line of lines) {
      const normalized = this.normalizePhoneNumber(line);
      if (normalized && normalized.length >= 10 && !seen.has(normalized)) {
        seen.add(normalized);
        result.push(normalized);
      }
    }
    return result;
  }

  /**
   * Kiểm tra điều kiện nghiệp vụ
   * @param {Object} data - { phone, productStatus, warehouse, updatedDate }
   * @returns {{
   *    isCondition1: boolean,
   *    isCondition2: boolean,
   *    telegramMessage: string | null
   * }}
   */
  evaluateConditions(data) {
    const warehouse = (data.warehouse || '').trim();
    const status = (data.productStatus || '').trim();
    const phone = data.phone;

    // ĐK 1: Kho là "Kho số chung VNP" VÀ trạng thái là "Sẵn sàng sử dụng"
    // Nội dung báo Tele: “84942251121 | Sẵn sàng sử dụng | 06:10:20 25/11/2024” (thời gian lấy ở mục ngày thay đổi)
    const isCondition1 = (warehouse === 'Kho số chung VNP' && status === 'Sẵn sàng sử dụng');

    // ĐK 2: Kho là "Kho số chung VNP" VÀ trạng thái là "Đã book số"
    // Nội dung báo Tele: “84942251121 | Đã book số | 15:30:57 27/08/2026 ” (thời gian thực lấy theo giờ máy tính)
    const isCondition2 = (warehouse === 'Kho số chung VNP' && status === 'Đã book số');

    let telegramMessage = null;

    if (isCondition1) {
      const timeStr = this.formatDateTime(data.updatedDate);
      telegramMessage = `${phone} | Sẵn sàng sử dụng | ${timeStr}`;
    } else if (isCondition2) {
      const now = new Date();
      const pad = n => String(n).padStart(2, '0');
      const realTime = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())} ${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;
      telegramMessage = `${phone} | Đã book số | ${realTime}`;
    }

    return {
      isCondition1,
      isCondition2,
      telegramMessage
    };
  }

  /**
   * Định dạng chuỗi ngày giờ theo chuẩn: HH:mm:ss dd/MM/yyyy
   */
  formatDateTime(rawDate) {
    if (!rawDate) return '';
    return String(rawDate).trim();
  }
}

module.exports = new ParserService();
