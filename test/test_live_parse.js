const cheerio = require('cheerio');

const sampleHtml = `
<partial-response id="j_id1">
  <changes>
    <update id="form_main:tabView"><![CDATA[
      <div id="form_main:tabView">
        <input id="form_main:tabView:product_status_master" name="form_main:tabView:product_status_master" type="text" value="Sẵn sàng sử dụng" readonly="readonly" class="ui-inputfield" />
        <input id="form_main:tabView:stock_name" name="form_main:tabView:stock_name" type="text" value="Kho số chung VNP" readonly="readonly" class="ui-inputfield" />
        <input id="form_main:tabView:change_date_input" name="form_main:tabView:change_date_input" type="text" value="23/08/2026 11:25:20" readonly="readonly" class="ui-inputfield" />
      </div>
    ]]></update>
    <update id="j_id1:javax.faces.ViewState:0"><![CDATA[3363288205916909403:-7381286807035626177]]></update>
  </changes>
</partial-response>
`;

function parseResponse(rawHtml, phoneNumber) {
  let productStatus = '';
  let warehouse = '';
  let updatedDate = '';
  let viewState = '';

  try {
    const $ = cheerio.load(rawHtml, { xmlMode: true });

    // Lấy viewState mới
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
    console.error('Cheerio parse error:', e);
  }

  // Regex fallback tìm trực tiếp trong raw response / CDATA
  if (!viewState) {
    const m = rawHtml.match(/<update id="[^"]*ViewState[^"]*"><!\[CDATA\[(.*?)\]\]><\/update>/i);
    if (m) viewState = m[1];
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

  return {
    phone: phoneNumber,
    viewState,
    productStatus: productStatus || 'Chưa cập nhật',
    warehouse: warehouse || 'Chưa cập nhật',
    updatedDate: updatedDate || new Date().toLocaleString('vi-VN')
  };
}

const res = parseResponse(sampleHtml, '84812000013');
console.log('Result:', JSON.stringify(res, null, 2));
