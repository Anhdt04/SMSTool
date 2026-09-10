const assert = require('assert');

// Hàm parse ngày
function parseDateForSort(dateStr) {
  if (!dateStr) return 0;
  const parts = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2}):(\d{1,2}))?/);
  if (parts) {
    const d = parseInt(parts[1], 10);
    const m = parseInt(parts[2], 10) - 1;
    const y = parseInt(parts[3], 10);
    const hh = parseInt(parts[4] || 0, 10);
    const mm = parseInt(parts[5] || 0, 10);
    const ss = parseInt(parts[6] || 0, 10);
    return new Date(y, m, d, hh, mm, ss).getTime();
  }
  const t = Date.parse(dateStr);
  return isNaN(t) ? 0 : t;
}

// Hàm lấy dữ liệu ĐK 1 đã sort
function getSortedCondition1Items(items, sort) {
  let res = [...items];
  if (sort === 'phone-asc') {
    res.sort((a, b) => a.phone.localeCompare(b.phone, 'vi', { numeric: true }));
  } else if (sort === 'phone-desc') {
    res.sort((a, b) => b.phone.localeCompare(a.phone, 'vi', { numeric: true }));
  } else if (sort === 'date-desc') {
    res.sort((a, b) => parseDateForSort(b.updatedDate) - parseDateForSort(a.updatedDate));
  } else if (sort === 'date-asc') {
    res.sort((a, b) => parseDateForSort(a.updatedDate) - parseDateForSort(b.updatedDate));
  }
  return res;
}

// Hàm lấy dữ liệu bảng chính đã lọc và sort
function getCurrentDisplayData(tableData, searchKeyword, sortCol, sortAsc) {
  let displayData = [...tableData];
  if (searchKeyword) {
    const kw = searchKeyword.toLowerCase().trim();
    displayData = displayData.filter(r => 
      (r.phone && r.phone.toLowerCase().includes(kw)) ||
      (r.productStatus && r.productStatus.toLowerCase().includes(kw)) ||
      (r.warehouse && r.warehouse.toLowerCase().includes(kw)) ||
      (r.updatedDate && r.updatedDate.toLowerCase().includes(kw))
    );
  }
  if (sortCol) {
    const factor = sortAsc ? 1 : -1;
    displayData.sort((a, b) => {
      if (sortCol === 'date') {
        const tA = parseDateForSort(a.updatedDate);
        const tB = parseDateForSort(b.updatedDate);
        return (tA - tB) * factor;
      }
      let valA = '';
      let valB = '';
      if (sortCol === 'phone') {
        valA = a.phone || '';
        valB = b.phone || '';
      } else if (sortCol === 'status') {
        valA = a.productStatus || '';
        valB = b.productStatus || '';
      } else if (sortCol === 'warehouse') {
        valA = a.warehouse || '';
        valB = b.warehouse || '';
      } else {
        valA = a[sortCol] || '';
        valB = b[sortCol] || '';
      }
      return valA.localeCompare(valB, 'vi', { numeric: true, sensitivity: 'base' }) * factor;
    });
  }
  return displayData;
}

console.log('--- TEST SORT & EXPORT / COPY LOGIC ---');

// 1. Test sort ĐK 1
const cond1Data = [
  { phone: '84942251121', updatedDate: '10/09/2026 10:00:00' },
  { phone: '84888441819', updatedDate: '10/09/2026 12:30:00' },
  { phone: '84912345001', updatedDate: '09/09/2026 08:15:00' }
];

const sortedByPhoneAsc = getSortedCondition1Items(cond1Data, 'phone-asc');
assert.strictEqual(sortedByPhoneAsc[0].phone, '84888441819');
assert.strictEqual(sortedByPhoneAsc[1].phone, '84912345001');
assert.strictEqual(sortedByPhoneAsc[2].phone, '84942251121');
console.log(' [PASS] ĐK 1: Sắp xếp số tăng dần');

const sortedByDateDesc = getSortedCondition1Items(cond1Data, 'date-desc');
assert.strictEqual(sortedByDateDesc[0].phone, '84888441819'); // 12:30 ngày 10/9
assert.strictEqual(sortedByDateDesc[1].phone, '84942251121'); // 10:00 ngày 10/9
assert.strictEqual(sortedByDateDesc[2].phone, '84912345001'); // ngày 9/9
console.log(' [PASS] ĐK 1: Sắp xếp ngày mới nhất');

// Test format copy ĐK 1: số + tab + ngày
const copyText = sortedByDateDesc.map(x => `${x.phone}\t${x.updatedDate}`).join('\n');
const lines = copyText.split('\n');
assert.strictEqual(lines[0], '84888441819\t10/09/2026 12:30:00');
assert.strictEqual(lines[1], '84942251121\t10/09/2026 10:00:00');
console.log(' [PASS] ĐK 1: Định dạng sao chép gồm cả SĐT và Ngày thay đổi chuẩn tab-separated');

// 2. Test Bảng chính: Thứ tự xuất Excel đúng thứ tự sắp xếp
const tableData = [
  { phone: '84942251121', productStatus: 'Sẵn sàng sử dụng', warehouse: 'Kho B', updatedDate: '10/09/2026 10:00:00' },
  { phone: '84888441819', productStatus: 'Đã book số', warehouse: 'Kho A', updatedDate: '10/09/2026 15:00:00' }
];

// Sort theo warehouse
const sortedByWh = getCurrentDisplayData(tableData, '', 'warehouse', true);
assert.strictEqual(sortedByWh[0].warehouse, 'Kho A');
assert.strictEqual(sortedByWh[1].warehouse, 'Kho B');
console.log(' [PASS] Bảng chính: Sắp xếp theo Kho');

// Sort theo date giảm dần
const sortedByDate = getCurrentDisplayData(tableData, '', 'date', false);
assert.strictEqual(sortedByDate[0].phone, '84888441819');
console.log(' [PASS] Bảng chính: Sắp xếp theo Ngày mới nhất');

console.log('\nTẤT CẢ CÁC KIỂM THỬ GIAO DIỆN & XUẤT DỮ LIỆU ĐÃ VƯỢT QUA!');
