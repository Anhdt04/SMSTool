const parserService = require('../src/services/parserService');
const telegramService = require('../src/services/telegramService');
const queueService = require('../src/services/queueService');
const MockProvider = require('../src/providers/mockProvider');

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

  // 4. Kiểm thử Chống spam Telegram (Chỉ báo 1 lần cho 1 trạng thái)
  telegramService.reset();
  const notify1 = await telegramService.notifyCondition({
    enableTelegram: true,
    botToken: 'mock_token',
    chatId: 'mock_chat',
    phone: '84942251121',
    status: 'Sẵn sàng sử dụng',
    message: 'Test message 1'
  });
  // Giả lập đã đánh dấu gửi
  telegramService.markAsSent('84942251121', 'Sẵn sàng sử dụng');

  const notify2 = await telegramService.notifyCondition({
    enableTelegram: true,
    botToken: 'mock_token',
    chatId: 'mock_chat',
    phone: '84942251121',
    status: 'Sẵn sàng sử dụng',
    message: 'Test message 1 lặp lại'
  });
  assert(notify2.skipped === true, 'Bỏ qua tin nhắn trùng trạng thái (Chỉ báo 1 lần)');

  // 5. Kiểm thử Mock Provider
  const mock = new MockProvider();
  const mockRes1 = await mock.lookup('84942251121', 'fake_cookie');
  assert(mockRes1.data.productStatus === 'Sẵn sàng sử dụng' && mockRes1.data.warehouse === 'Kho số chung VNP', 'Mock Provider lần 1 trả về ĐK 1');

  const mockRes2 = await mock.lookup('84942251121', 'fake_cookie');
  assert(mockRes2.data.productStatus === 'Đã book số' && mockRes2.data.warehouse === 'Kho số chung VNP', 'Mock Provider lần 2 chuyển trạng thái sang ĐK 2');

  console.log(`\n KẾT QUẢ KIỂM THỬ: ${passed}/${total} bài test vượt qua!`);
  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests();
