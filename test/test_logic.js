const fs = require('fs');
const parserService = require('../src/services/parserService');
const telegramService = require('../src/services/telegramService');
const queueService = require('../src/services/queueService');

async function runTests() {
  console.log('--- BẮT ĐẦU KIỂM THỬ TỰ ĐỘNG CÁC MODULE NGHIỆP VỤ ---');
  let passed = 0;
  let total = 0;

  function assert(condition, testName) {
    total++;
    if (condition) {
      console.log(` [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}`);
    }
  }

  // 1. Kiểm thử Chuẩn hóa số điện thoại
  const phone1 = parserService.normalizePhoneNumber('0942251121');
  assert(phone1 === '84942251121', 'Chuẩn hóa số 0942251121 -> 84942251121');

  const phone2 = parserService.normalizePhoneNumber('+84942251121');
  assert(phone2 === '84942251121', 'Chuẩn hóa số +84942251121 -> 84942251121');

  const list = parserService.parsePhoneList('0942251121\n84888441819\n0942251121');
  assert(list.length === 2 && list[0] === '84942251121', 'Lọc trùng danh sách SĐT đầu vào');

  // 2. Kiểm thử Điều kiện 1
  const cond1Eval = parserService.evaluateConditions({
    phone: '84942251121',
    warehouse: 'Kho số chung VNP',
    productStatus: 'Sẵn sàng sử dụng',
    updatedDate: '25/11/2024 06:10:20'
  });
  assert(cond1Eval.isCondition1 === true, 'Nhận diện chính xác ĐK 1');
  assert(cond1Eval.telegramMessage === '84942251121 | Sẵn sàng sử dụng | 25/11/2024 06:10:20', 'Định dạng tin Telegram ĐK 1 đúng mẫu');

  // 3. Kiểm thử Điều kiện 2
  const cond2Eval = parserService.evaluateConditions({
    phone: '84942251121',
    warehouse: 'Kho số chung VNP',
    productStatus: 'Đã book số',
    updatedDate: '25/11/2024 06:10:20'
  });
  assert(cond2Eval.isCondition2 === true, 'Nhận diện chính xác ĐK 2');
  assert(cond2Eval.telegramMessage && cond2Eval.telegramMessage.includes('84942251121 | Đã book số |'), 'Định dạng tin Telegram ĐK 2 có chứa giờ thực');

  // 4. Kiểm thử Chống spam Telegram & Lưu vết bền vững
  telegramService.clearHistory();
  assert(!telegramService.hasSent('84812000013', 'Sẵn sàng sử dụng'), 'Lịch sử ban đầu trống');

  telegramService.markAsSent('84812000013', 'Sẵn sàng sử dụng');
  assert(telegramService.hasSent('84812000013', 'Sẵn sàng sử dụng') === true, 'Đã đánh dấu gửi thành công');
  assert(fs.existsSync(telegramService.storagePath), 'File sent_notifications.json được tự động tạo');

  const notifyDuplicate = await telegramService.notifyCondition({
    enableTelegram: true,
    botToken: 'mock_token',
    chatId: 'mock_chat',
    phone: '84812000013',
    status: 'Sẵn sàng sử dụng',
    message: 'Test duplicate'
  });
  assert(notifyDuplicate.skipped === true, 'Bỏ qua tin nhắn trùng trạng thái (Chỉ báo 1 lần duy nhất)');

  // 5. Kiểm thử khi queueService.start() chạy lại, lịch sử Telegram KHÔNG bị xóa
  try {
    await queueService.start('84812000013', { delayMs: 100 });
  } catch (e) {}
  assert(telegramService.hasSent('84812000013', 'Sẵn sàng sử dụng') === true, 'Khi bắt đầu lại tra cứu, lịch sử Telegram vẫn được giữ nguyên');
  queueService.stop();

  // Dọn dẹp file test
  telegramService.clearHistory();

  console.log(`\n KẾT QUẢ KIỂM THỬ: ${passed}/${total} bài test vượt qua!`);
  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests();
