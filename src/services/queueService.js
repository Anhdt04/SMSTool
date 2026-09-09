const EventEmitter = require('events');
const parserService = require('./parserService');
const telegramService = require('./telegramService');
const LiveProvider = require('../providers/liveProvider');

/**
 * Queue Service điều phối hàng đợi tra cứu
 * - Quản lý trạng thái: IDLE, RUNNING, PAUSED, STOPPED
 * - Điều phối delay chính xác (mili-giây)
 * - Quản lý cơ chế xoay vòng (Loop)
 * - Tự động loại bỏ số gặp ĐK 2 khỏi các vòng xoay tiếp theo
 * - Bắn event thời gian thực cho UI
 */
class QueueService extends EventEmitter {
  constructor() {
    super();
    this.status = 'idle'; // 'idle' | 'running' | 'paused' | 'stopped'
    this.liveProvider = new LiveProvider();

    // Dữ liệu hàng đợi
    this.originalList = [];        // Toàn bộ danh sách số ban đầu
    this.activeQueue = [];         // Hàng đợi các số trong chu kỳ hiện tại
    this.nextCycleQueue = [];      // Hàng đợi các số chuẩn bị cho chu kỳ xoay vòng tiếp theo
    this.stoppedNumbers = new Set(); // Các số đã gặp ĐK 2, bị ngừng tra cứu ở các vòng sau
    this.condition1Numbers = [];  // Danh sách các số đạt ĐK 1 (dùng cho ô copy nhanh)

    // Thống kê
    this.stats = {
      total: 0,
      processed: 0,
      condition1Count: 0,
      condition2Count: 0,
      cycle: 1
    };

    // Điều khiển tiến trình
    this.isPaused = false;
    this.isStopping = false;
    this.timeoutId = null;

    // Cấu hình hiện thời
    this.options = {
      mode: 'live',
      cookie: '',
      delayMs: 500,
      enableLoop: true,
      enableTelegram: false,
      telegramToken: '',
      telegramChatId: ''
    };
  }

  getProvider() {
    return this.liveProvider;
  }

  getStatus() {
    return {
      status: this.status,
      stats: {
        ...this.stats,
        remainingInQueue: this.activeQueue.length,
        nextCycleCount: this.nextCycleQueue.length,
        stoppedCount: this.stoppedNumbers.size
      },
      condition1Numbers: [...this.condition1Numbers],
      options: this.options
    };
  }

  /**
   * Bắt đầu phiên tra cứu
   */
  async start(phoneListText, options) {
    if (this.status === 'running') {
      throw new Error('Hệ thống đang chạy, vui lòng tạm dừng hoặc dừng hẳn trước.');
    }

    const phones = parserService.parsePhoneList(phoneListText);
    if (!phones || phones.length === 0) {
      throw new Error('Danh sách số điện thoại rỗng hoặc không có số hợp lệ.');
    }

    this.options = { ...this.options, ...options };
    this.originalList = [...phones];
    this.activeQueue = [...phones];
    this.nextCycleQueue = [];
    this.stoppedNumbers.clear();
    this.condition1Numbers = [];

    this.stats = {
      total: phones.length,
      processed: 0,
      condition1Count: 0,
      condition2Count: 0,
      cycle: 1
    };

    this.status = 'running';
    this.isPaused = false;
    this.isStopping = false;

    this.emit('status_change', this.getStatus());
    this.emit('log', {
      type: 'info',
      message: `Bắt đầu phiên tra cứu: ${phones.length} số | Chế độ: TRỰC TIẾP SMCS | Delay: ${this.options.delayMs}ms | Xoay vòng: ${this.options.enableLoop ? 'BẬT' : 'TẮT'}`
    });

    this.processNext();
    return this.getStatus();
  }

  /**
   * Tạm dừng
   */
  pause() {
    if (this.status !== 'running') return;
    this.status = 'paused';
    this.isPaused = true;
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    this.emit('status_change', this.getStatus());
    this.emit('log', { type: 'warn', message: 'Đã tạm dừng tiến trình tra cứu.' });
  }

  /**
   * Tiếp tục
   */
  resume() {
    if (this.status !== 'paused') return;
    this.status = 'running';
    this.isPaused = false;
    this.emit('status_change', this.getStatus());
    this.emit('log', { type: 'info', message: 'Tiếp tục tiến trình tra cứu.' });
    this.processNext();
  }

  /**
   * Dừng hẳn
   */
  stop() {
    this.status = 'stopped';
    this.isStopping = true;
    this.isPaused = false;
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    this.emit('status_change', this.getStatus());
    this.emit('log', { type: 'warn', message: 'Đã dừng toàn bộ tiến trình tra cứu.' });
  }

  /**
   * Cập nhật tùy chọn runtime (ví dụ đổi delay ms, bật/tắt tele hoặc xoay vòng khi đang chạy)
   */
  updateOptions(newOptions) {
    this.options = { ...this.options, ...newOptions };
    this.emit('status_change', this.getStatus());
    this.emit('log', {
      type: 'info',
      message: `Đã cập nhật cài đặt: Delay ${this.options.delayMs}ms, Xoay vòng: ${this.options.enableLoop ? 'Bật' : 'Tắt'}, Telegram: ${this.options.enableTelegram ? 'Bật' : 'Tắt'}`
    });
  }

  /**
   * Vòng lặp xử lý từng số trong hàng đợi
   */
  async processNext() {
    if (this.status !== 'running' || this.isPaused || this.isStopping) {
      return;
    }

    // Nếu hết số trong vòng hiện tại
    if (this.activeQueue.length === 0) {
      if (this.options.enableLoop && this.nextCycleQueue.length > 0) {
        // Chuyển sang vòng xoay tiếp theo
        this.stats.cycle += 1;
        this.activeQueue = [...this.nextCycleQueue];
        this.nextCycleQueue = [];
        this.emit('log', {
          type: 'info',
          message: `🔁 Bắt đầu vòng xoay số #${this.stats.cycle} với ${this.activeQueue.length} số còn lại.`
        });
      } else {
        // Kết thúc hoàn toàn
        this.status = 'completed';
        this.emit('status_change', this.getStatus());
        this.emit('log', {
          type: 'success',
          message: ` Hoàn thành toàn bộ tiến trình tra cứu! Tổng lượt tra: ${this.stats.processed}.`
        });
        return;
      }
    }

    const currentPhone = this.activeQueue.shift();

    // Kiểm tra xem số này có bị đánh dấu ngừng (gặp ĐK 2 ở chu kỳ trước) không
    if (this.stoppedNumbers.has(currentPhone)) {
      this.processNext();
      return;
    }

    try {
      const provider = this.getProvider();
      const result = await provider.lookup(currentPhone, this.options.cookie);

      if (result.success && result.data) {
        this.stats.processed += 1;
        const data = result.data;
        const evalResult = parserService.evaluateConditions(data);

        let telegramLog = null;

        // XỬ LÝ ĐIỀU KIỆN 1: Kho số chung VNP + Sẵn sàng sử dụng
        if (evalResult.isCondition1) {
          this.stats.condition1Count += 1;

          // Thêm vào ô copy nhanh nếu chưa có
          if (!this.condition1Numbers.includes(currentPhone)) {
            this.condition1Numbers.push(currentPhone);
            this.emit('condition1_found', {
              phone: currentPhone,
              allCondition1: this.condition1Numbers
            });
          }

          // Gửi Telegram
          if (evalResult.telegramMessage) {
            const teleRes = await telegramService.notifyCondition({
              botToken: this.options.telegramToken,
              chatId: this.options.telegramChatId,
              enableTelegram: this.options.enableTelegram,
              phone: currentPhone,
              status: data.productStatus,
              message: evalResult.telegramMessage
            });
            telegramLog = teleRes;
          }

          // Giữ lại số này cho vòng xoay sau (không dừng)
          if (this.options.enableLoop) {
            this.nextCycleQueue.push(currentPhone);
          }
        }
        // XỬ LÝ ĐIỀU KIỆN 2: Kho số chung VNP + Đã book số
        else if (evalResult.isCondition2) {
          this.stats.condition2Count += 1;

          // QUY TẮC: Lượt sau ngừng tra cứu số đó
          this.stoppedNumbers.add(currentPhone);

          // Gửi Telegram
          if (evalResult.telegramMessage) {
            const teleRes = await telegramService.notifyCondition({
              botToken: this.options.telegramToken,
              chatId: this.options.telegramChatId,
              enableTelegram: this.options.enableTelegram,
              phone: currentPhone,
              status: data.productStatus,
              message: evalResult.telegramMessage
            });
            telegramLog = teleRes;
          }

          this.emit('log', {
            type: 'warn',
            message: `🛑 Số ${currentPhone} đạt ĐK 2 ("Đã book số") -> Đã dừng tra cứu số này ở các lượt sau.`
          });
        }
        // CÁC TRƯỜNG HỢP KHÁC
        else {
          if (this.options.enableLoop) {
            this.nextCycleQueue.push(currentPhone);
          }
        }

        // Phát sự kiện dữ liệu để cập nhật bảng giao diện
        this.emit('item_processed', {
          phone: data.phone,
          productStatus: data.productStatus,
          warehouse: data.warehouse,
          updatedDate: data.updatedDate,
          isCondition1: evalResult.isCondition1,
          isCondition2: evalResult.isCondition2,
          telegramLog,
          cycle: this.stats.cycle
        });

      } else {
        this.emit('log', {
          type: 'error',
          message: `Lỗi tra cứu số ${currentPhone}: ${result.error || 'Không có dữ liệu'}`
        });

        // Nếu lỗi tạm thời và có bật xoay vòng, vẫn giữ lại số để thử lại ở vòng sau
        if (this.options.enableLoop) {
          this.nextCycleQueue.push(currentPhone);
        }
      }

    } catch (err) {
      this.emit('log', {
        type: 'error',
        message: `Ngoại lệ khi tra cứu ${currentPhone}: ${err.message}`
      });
      if (this.options.enableLoop) {
        this.nextCycleQueue.push(currentPhone);
      }
    }

    // Phát cập nhật thống kê
    this.emit('stats_update', this.getStatus().stats);

    // Chờ theo thời gian Delay (hỗ trợ 100ms / 0.1s trở lên)
    const delay = Math.max(50, Number(this.options.delayMs) || 500);
    this.timeoutId = setTimeout(() => {
      this.processNext();
    }, delay);
  }
}

module.exports = new QueueService();
