const axios = require('axios');
const cheerio = require('cheerio');
const SMCSProvider = require('./smcsProvider');

/**
 * Live Provider kết nối trực tiếp vào https://smcs.vnpt.com.vn
 * Chuẩn bị sẵn cấu trúc request PrimeFaces/JSF.
 * Khi khách hàng cung cấp cURL/HAR, chỉ cần điền các tham số form vào đây.
 */
class LiveProvider extends SMCSProvider {
  constructor(config = {}) {
    super();
    this.baseUrl = config.baseUrl || 'https://smcs.vnpt.com.vn';
    this.lookupUrl = config.lookupUrl || `${this.baseUrl}/index.xhtml`;
    this.lastViewState = null;
  }

  /**
   * Cập nhật cấu hình endpoint và form payload từ cURL khách cung cấp
   */
  updateConfig(customConfig) {
    if (customConfig.baseUrl) this.baseUrl = customConfig.baseUrl;
    if (customConfig.lookupUrl) this.lookupUrl = customConfig.lookupUrl;
    if (customConfig.defaultViewState) this.lastViewState = customConfig.defaultViewState;
  }

  async lookup(phoneNumber, cookie) {
    if (!cookie) {
      return {
        success: false,
        error: 'Chưa có Cookie đăng nhập. Vui lòng dán Cookie hợp lệ vào cài đặt.'
      };
    }

    try {
      // Header giả lập chính xác Chrome browser
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'application/xml, text/xml, */*; q=0.01',
        'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Faces-Request': 'partial/ajax',
        'X-Requested-With': 'XMLHttpRequest',
        'Cookie': cookie.trim(),
        'Origin': this.baseUrl,
        'Referer': `${this.baseUrl}/index.xhtml`
      };

      // Payload mẫu cho PrimeFaces Tra cứu TT sản phẩm hàng hóa
      // Sẽ được ánh xạ chính xác 100% khi khách hàng gửi cURL
      const params = new URLSearchParams();
      params.append('javax.faces.partial.ajax', 'true');
      params.append('javax.faces.partial.execute', '@all');
      params.append('javax.faces.partial.render', '@all');
      params.append('searchForm:phoneNumber', phoneNumber);
      if (this.lastViewState) {
        params.append('javax.faces.ViewState', this.lastViewState);
      }

      const response = await axios.post(this.lookupUrl, params.toString(), {
        headers,
        timeout: 10000,
        validateStatus: () => true
      });

      if (response.status === 401 || response.status === 403 || (response.data && response.data.includes('login.xhtml'))) {
        return {
          success: false,
          error: 'Cookie đã hết hạn hoặc phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại và lấy Cookie mới.'
        };
      }

      // Bóc tách dữ liệu từ phản hồi XML / HTML của PrimeFaces
      const parsedData = this.parseResponse(response.data, phoneNumber);
      return {
        success: true,
        rawResponse: response.data,
        data: parsedData
      };

    } catch (err) {
      return {
        success: false,
        error: `Lỗi kết nối mạng nội bộ: ${err.message}`
      };
    }
  }

  /**
   * Bóc tách 4 trường từ HTML/XML của PrimeFaces
   */
  parseResponse(rawHtml, phoneNumber) {
    const $ = cheerio.load(rawHtml, { xmlMode: true });

    // Cập nhật ViewState mới nếu có trong response
    const viewState = $('update[id*="ViewState"]').text() || $('input[name="javax.faces.ViewState"]').val();
    if (viewState) {
      this.lastViewState = viewState;
    }

    // Bóc tách động từ DOM của PrimeFaces (hỗ trợ cả input, select, textarea và table cell)
    let productStatus = $('[id*="trangThaiSanPham"]').val() 
      || $('[id*="trangThai"]').val() 
      || $('input[name*="trangThai"]').val()
      || '';

    let warehouse = $('[id*="hangDangTaiKho"]').val() 
      || $('[id*="khoHang"]').val() 
      || $('input[name*="kho"]').val()
      || '';

    let updatedDate = $('[id*="ngayThayDoi"]').val() 
      || $('[id*="ngayCapNhat"]').val() 
      || $('input[name*="ngay"]').val()
      || '';

    // Nếu là text hiển thị dạng thẻ span/div/td
    if (!productStatus) {
      productStatus = $('[id*="trangThaiSanPham"]').text().trim() 
        || $('[id*="trangThai"]').text().trim() 
        || '';
    }
    if (!warehouse) {
      warehouse = $('[id*="hangDangTaiKho"]').text().trim() 
        || $('[id*="khoHang"]').text().trim() 
        || '';
    }
    if (!updatedDate) {
      updatedDate = $('[id*="ngayThayDoi"]').text().trim() 
        || $('[id*="ngayCapNhat"]').text().trim() 
        || '';
    }

    return {
      phone: phoneNumber,
      productStatus: productStatus || 'Chưa cập nhật',
      warehouse: warehouse || 'Chưa cập nhật',
      updatedDate: updatedDate || new Date().toLocaleString('vi-VN')
    };
  }
}

module.exports = LiveProvider;
