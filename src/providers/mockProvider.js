const SMCSProvider = require('./smcsProvider');

/**
 * Mock Provider mô phỏng hệ thống SMCS VNPT
 * Giúp kiểm thử toàn bộ luồng nghiệp vụ (ĐK1, ĐK2, xoay vòng, lọc trùng Telegram, dừng tra cứu)
 */
class MockProvider extends SMCSProvider {
  constructor() {
    super();
    // Bộ đếm số lần tra cứu của từng số để mô phỏng sự chuyển đổi trạng thái khi xoay vòng
    this.lookupCount = new Map();
  }

  reset() {
    this.lookupCount.clear();
  }

  async lookup(phoneNumber, cookie) {
    // Mô phỏng độ trễ mạng ngẫu nhiên 30 - 80ms
    await new Promise(resolve => setTimeout(resolve, 30 + Math.floor(Math.random() * 50)));

    const count = (this.lookupCount.get(phoneNumber) || 0) + 1;
    this.lookupCount.set(phoneNumber, count);

    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())} ${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;

    // Kịch bản mô phỏng thông minh:
    // 1. Số 84942251121 (Số mẫu trong tài liệu Word):
    //    - Lần 1: Trả về ĐK 1 ("Sẵn sàng sử dụng", "Kho số chung VNP")
    //    - Lần 2 trở đi: Chuyển sang ĐK 2 ("Đã book số", "Kho số chung VNP") để kiểm thử tính năng dừng xoay vòng!
    if (phoneNumber === '84942251121') {
      if (count === 1) {
        return {
          success: true,
          data: {
            phone: phoneNumber,
            productStatus: 'Sẵn sàng sử dụng',
            warehouse: 'Kho số chung VNP',
            updatedDate: '25/11/2024 06:10:20'
          }
        };
      } else {
        return {
          success: true,
          data: {
            phone: phoneNumber,
            productStatus: 'Đã book số',
            warehouse: 'Kho số chung VNP',
            updatedDate: timeStr
          }
        };
      }
    }

    // 2. Số kết thúc bằng 1: Giả lập ĐK 1 ("Sẵn sàng sử dụng" + "Kho số chung VNP")
    if (phoneNumber.endsWith('1')) {
      return {
        success: true,
        data: {
          phone: phoneNumber,
          productStatus: 'Sẵn sàng sử dụng',
          warehouse: 'Kho số chung VNP',
          updatedDate: timeStr
        }
      };
    }

    // 3. Số kết thúc bằng 2: Giả lập ĐK 2 ("Đã book số" + "Kho số chung VNP")
    if (phoneNumber.endsWith('2')) {
      return {
        success: true,
        data: {
          phone: phoneNumber,
          productStatus: 'Đã book số',
          warehouse: 'Kho số chung VNP',
          updatedDate: timeStr
        }
      };
    }

    // 4. Số kết thúc bằng 9 (như số mẫu 84888441819 trong hình 4):
    if (phoneNumber.endsWith('9')) {
      return {
        success: true,
        data: {
          phone: phoneNumber,
          productStatus: 'Sẵn sàng sử dụng',
          warehouse: 'Kho số thu hồi',
          updatedDate: '11/10/2024 05:55:57'
        }
      };
    }

    // 5. Các trường hợp thông thường khác
    const statuses = ['Đang giữ số', 'Đã hòa mạng', 'Chờ đấu nối', 'Sẵn sàng sử dụng'];
    const warehouses = ['Kho số thu hồi', 'Kho số nghiệp vụ', 'Kho số chung TTP'];
    
    return {
      success: true,
      data: {
        phone: phoneNumber,
        productStatus: statuses[count % statuses.length],
        warehouse: warehouses[count % warehouses.length],
        updatedDate: timeStr
      }
    };
  }
}

module.exports = MockProvider;
