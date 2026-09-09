const axios = require('axios');
const cheerio = require('cheerio');
const SMCSProvider = require('./smcsProvider');

/**
 * Live Provider kết nối trực tiếp vào https://smcs.vnpt.com.vn/client/productLookup
 * Tự động gửi request chuẩn PrimeFaces và bóc tách dữ liệu 4 trường.
 */
class LiveProvider extends SMCSProvider {
  constructor(config = {}) {
    super();
    this.baseUrl = config.baseUrl || 'https://smcs.vnpt.com.vn';
    this.lookupUrl = config.lookupUrl || `${this.baseUrl}/client/productLookup`;
    this.lastViewState = null;
    this.lastCookie = null;
  }

  /**
   * Cập nhật cấu hình endpoint và form payload
   */
  updateConfig(customConfig) {
    if (customConfig.baseUrl) this.baseUrl = customConfig.baseUrl;
    if (customConfig.lookupUrl) this.lookupUrl = customConfig.lookupUrl;
    if (customConfig.defaultViewState) this.lastViewState = customConfig.defaultViewState;
  }

  /**
   * Khởi tạo ViewState ban đầu từ trang HTML nếu chưa có
   */
  async initViewState(cookie) {
    try {
      const getRes = await axios.get(this.lookupUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Cookie': cookie.trim()
        },
        timeout: 10000,
        validateStatus: () => true
      });

      if (getRes.status === 401 || getRes.status === 403 || (getRes.data && getRes.data.includes('login.xhtml'))) {
        return {
          success: false,
          error: 'Cookie đã hết hạn hoặc phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại SMCS và lấy Cookie mới.'
        };
      }

      if (getRes.data) {
        const $ = cheerio.load(getRes.data);
        const vs = $('input[name="javax.faces.ViewState"]').val();
        if (vs) {
          this.lastViewState = vs;
        } else {
          const vsMatch = getRes.data.match(/name="javax\.faces\.ViewState"[^>]*value="([^"]*)"/i)
            || getRes.data.match(/value="([^"]*)"[^>]*name="javax\.faces\.ViewState"/i);
          if (vsMatch) {
            this.lastViewState = vsMatch[1] || vsMatch[2];
          }
        }
      }
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: `Lỗi kết nối khởi tạo trang SMCS: ${err.message}`
      };
    }
  }

  async lookup(phoneNumber, cookie) {
    if (!cookie) {
      return {
        success: false,
        error: 'Chưa có Cookie đăng nhập. Vui lòng dán Cookie hợp lệ vào cài đặt.'
      };
    }

    // Nếu đổi cookie mới, reset lại ViewState để khởi tạo lại
    if (this.lastCookie !== cookie.trim()) {
      this.lastCookie = cookie.trim();
      this.lastViewState = null;
    }

    try {
      // Nếu chưa có ViewState, lấy trước từ trang web
      if (!this.lastViewState) {
        const initRes = await this.initViewState(cookie);
        if (!initRes.success) {
          return initRes;
        }
      }

      // Header giả lập chính xác Chrome browser gửi request PrimeFaces AJAX
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'application/xml, text/xml, */*; q=0.01',
        'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Faces-Request': 'partial/ajax',
        'X-Requested-With': 'XMLHttpRequest',
        'Cookie': cookie.trim(),
        'Origin': this.baseUrl,
        'Referer': this.lookupUrl
      };

      // Payload chính xác theo cấu trúc Form tra cứu của SMCS VNPT
      const params = new URLSearchParams();
      params.append('javax.faces.partial.ajax', 'true');
      params.append('javax.faces.source', 'form_main:btnSearch');
      params.append('javax.faces.partial.execute', '@all');
      params.append('javax.faces.partial.render', 'form_main:panelInput form_main:tabView form_main:mes');
      params.append('form_main:btnSearch', 'form_main:btnSearch');
      params.append('form_main', 'form_main');
      params.append('form_main:ddlAtributeSet_input', '4'); // Loại sản phẩm: Số thuê bao
      params.append('form_main:productId_input', '-1');
      params.append('form_main:serial', phoneNumber.trim()); // Serial/Số thuê bao cần tra cứu
      params.append('form_main:checkSum_input', 'on');
      params.append('form_main:tabView_activeIndex', '0');

      if (this.lastViewState) {
        params.append('javax.faces.ViewState', this.lastViewState);
      }

      const response = await axios.post(this.lookupUrl, params.toString(), {
        headers,
        timeout: 12000,
        validateStatus: () => true
      });

      if (response.status === 401 || response.status === 403 || (response.data && response.data.includes('login.xhtml'))) {
        return {
          success: false,
          error: 'Cookie đã hết hạn hoặc phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại và lấy Cookie mới.'
        };
      }

      // Xử lý khi phiên làm việc JSF hết hạn (ViewExpiredException)
      if (response.data && response.data.includes('ViewExpiredException')) {
        this.lastViewState = null;
        return {
          success: false,
          error: 'Phiên ViewState hết hạn, đang tự động khôi phục lại ở lượt tra tiếp theo.'
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
    let productStatus = '';
    let warehouse = '';
    let updatedDate = '';
    let viewState = '';

    if (rawHtml && typeof rawHtml === 'string') {
      try {
        const $ = cheerio.load(rawHtml, { xmlMode: true });

        // Cập nhật ViewState mới nếu có trong response
        viewState = $('update[id*="ViewState"]').text() || $('input[name="javax.faces.ViewState"]').val() || '';

        // Bóc tách theo ID chính xác từ SMCS PrimeFaces
        productStatus = $('[id="form_main:tabView:product_status_master"]').val()
          || $('[id="form_main:tabView:product_status_master"]').attr('value')
          || $('[id*="product_status_master"]').val()
          || $('[id*="product_status_master"]').attr('value')
          || $('[id*="product_status_master"]').text().trim()
          || '';

        warehouse = $('[id="form_main:tabView:stock_name"]').val()
          || $('[id="form_main:tabView:stock_name"]').attr('value')
          || $('[id*="stock_name"]').val()
          || $('[id*="stock_name"]').attr('value')
          || $('[id*="stock_name"]').text().trim()
          || '';

        updatedDate = $('[id="form_main:tabView:change_date_input"]').val()
          || $('[id="form_main:tabView:change_date_input"]').attr('value')
          || $('[id*="change_date_input"]').val()
          || $('[id*="change_date_input"]').attr('value')
          || $('[id*="change_date"]').val()
          || $('[id*="change_date"]').attr('value')
          || $('[id*="change_date"]').text().trim()
          || '';
      } catch (e) {
        // bỏ qua lỗi xml parse để chạy regex fallback bên dưới
      }

      // Regex fallback dự phòng trực tiếp trong CDATA nếu parser XML không bắt được
      if (!viewState) {
        const vsMatch = rawHtml.match(/<update id="[^"]*ViewState[^"]*"><!\[CDATA\[(.*?)\]\]><\/update>/i)
          || rawHtml.match(/name="javax\.faces\.ViewState"[^>]*value="([^"]*)"/i);
        if (vsMatch) viewState = vsMatch[1];
      }

      if (!productStatus) {
        const m = rawHtml.match(/id="[^"]*product_status_master"[^>]*value="([^"]*)"/i) 
               || rawHtml.match(/value="([^"]*)"[^>]*id="[^"]*product_status_master"/i);
        if (m) productStatus = m[1] || m[2];
      }

      if (!warehouse) {
        const m = rawHtml.match(/id="[^"]*stock_name"[^>]*value="([^"]*)"/i)
               || rawHtml.match(/value="([^"]*)"[^>]*id="[^"]*stock_name"/i);
        if (m) warehouse = m[1] || m[2];
      }

      if (!updatedDate) {
        const m = rawHtml.match(/id="[^"]*change_date_input"[^>]*value="([^"]*)"/i)
               || rawHtml.match(/value="([^"]*)"[^>]*id="[^"]*change_date_input"/i);
        if (m) updatedDate = m[1] || m[2];
      }

      if (viewState) {
        this.lastViewState = viewState;
      }
    }

    return {
      phone: phoneNumber,
      productStatus: (productStatus && productStatus.trim()) || 'Chưa cập nhật',
      warehouse: (warehouse && warehouse.trim()) || 'Chưa cập nhật',
      updatedDate: (updatedDate && updatedDate.trim()) || new Date().toLocaleString('vi-VN')
    };
  }
}

module.exports = LiveProvider;
