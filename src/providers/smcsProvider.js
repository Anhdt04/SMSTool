/**
 * Base SMCS Provider Interface
 */
class SMCSProvider {
  /**
   * Tra cứu 1 số thuê bao
   * @param {string} phoneNumber - Số điện thoại dạng 84...
   * @param {string} cookie - Chuỗi cookie phiên đăng nhập
   * @returns {Promise<{
   *    success: boolean,
   *    rawResponse?: any,
   *    data?: {
   *      phone: string,
   *      productStatus: string, // Trạng thái sản phẩm
   *      warehouse: string,      // Hàng đang tại kho
   *      updatedDate: string     // Ngày thay đổi
   *    },
   *    error?: string
   * }>}
   */
  async lookup(phoneNumber, cookie) {
    throw new Error('Method lookup() must be implemented by subclass.');
  }
}

module.exports = SMCSProvider;
