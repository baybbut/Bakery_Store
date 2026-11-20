# Đối chiếu chức năng khách hàng với DoAn_HDT

Nguồn: phần 1.2, 1.3.2(c), use case UC9–UC14 và đăng xuất trong báo cáo người dùng cung cấp. Không triển khai chức năng quản trị/nhân viên trong UI khách hàng.

| Báo cáo           | Chức năng đã triển khai                                                                                                   | Cách kiểm tra                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| UC9.1             | Đăng ký họ tên/email/điện thoại/mật khẩu, kiểm tra trùng, xác nhận mật khẩu                                               | Nút Đăng nhập → Đăng ký                              |
| UC9.2             | Đăng nhập, phiên cookie, thông báo sai thông tin                                                                          | Đăng nhập và tải lại trang                           |
| UC9.3             | Yêu cầu đặt lại mật khẩu; liên kết ngẫu nhiên một lần, 30 phút                                                            | Quên mật khẩu → email hoặc hộp thư development       |
| UC10.1            | Tìm kiếm tên/hương vị, danh mục, khoảng giá, sắp xếp, trạng thái không tìm thấy                                           | Tủ bánh hôm nay                                      |
| UC10.2            | Xem ảnh, giá, mô tả, nguyên liệu/dị ứng/bảo quản, tồn kho, đánh giá                                                       | Bấm ảnh hoặc tên bánh                                |
| UC10.3            | Lọc theo danh mục                                                                                                         | Tất cả/Bánh kem/Bánh ngọt/Bánh nướng                 |
| UC11.1            | Thêm bánh, yêu cầu đăng nhập, kiểm tra hàng còn                                                                           | Nút + hoặc chi tiết bánh                             |
| UC11.2            | Tăng/giảm số lượng, kiểm tra số nguyên và giới hạn tồn kho                                                                | Giỏ bánh                                             |
| UC11.3            | Xóa bánh                                                                                                                  | Nút Xóa trong giỏ                                    |
| 1.3.2(c)          | Lưu và bỏ lưu yêu thích theo tài khoản                                                                                    | Trái tim trên thẻ hoặc chi tiết; danh sách Yêu thích |
| UC12.1            | Nhận thông tin giao hàng, chọn COD/VNPay, tổng hợp trước khi xác nhận, tạo mã đơn, trừ tồn kho, xóa lượng đã mua khỏi giỏ | Giỏ → Tiến hành đặt bánh                             |
| UC12.1 (ngoại lệ) | Thiếu thông tin, thiếu tồn kho, hủy bước xác nhận giữ giỏ; callback thanh toán thất bại giữ giỏ                           | Form, test API                                       |
| 1.2.5, UC14.4     | Danh sách/chi tiết đơn riêng theo khách, trạng thái và lịch sử mốc; lọc và làm mới                                        | Tài khoản → Đơn hàng của tôi                         |
| Bổ sung nghiệp vụ | Hủy đơn chưa xác nhận, chưa trả tiền; hoàn tồn kho đúng một lần                                                           | Đơn hàng → Hủy đơn                                   |
| UC13.1            | Đánh giá 1–5 sao (bắt buộc), nhận xét không bắt buộc (tối đa 2.000 ký tự), hạn chế ngôn từ, chỉ sau đơn đã giao, chống trùng                               | Chi tiết bánh sau nhận hàng                          |
| UC13.2            | Danh sách đánh giá, điểm trung bình, phản hồi cửa hàng nếu có; lỗi/thử lại và chưa có dữ liệu                             | Chi tiết bánh                                        |
| UC14.1–14.2       | Xem/sửa hồ sơ, email/điện thoại không trùng, địa chỉ mặc định                                                             | Tài khoản                                            |
| UC14.3            | Kiểm tra mật khẩu cũ, mật khẩu mới/xác nhận; băm mật khẩu, thu hồi phiên                                                  | Tài khoản → Đổi mật khẩu                             |
| Đăng xuất         | Thu hồi phiên phía server, xóa dữ liệu riêng khỏi UI                                                                      | Tài khoản → Đăng xuất                                |

## Quyết định triển khai

- Dùng Node.js + Express + SQLite để dự án chạy bằng một lệnh, không cần cài dịch vụ database riêng. SQLite và toàn bộ dữ liệu cá nhân nằm phía server, không lưu mật khẩu/phiên đăng nhập trong localStorage.
- Phần UC9.3 mô tả khởi tạo rồi trả mật khẩu. Thực hiện bằng liên kết đặt lại một lần qua email để tránh tiết lộ/đổi mật khẩu chỉ dựa vào tên tài khoản.
- Tạo đơn và cập nhật tồn kho trong transaction. Client không quyết định đơn giá/tổng tiền. Khóa yêu cầu chống tạo đơn lặp.
- Đơn đã thanh toán không cho khách tự hủy vì cần quy trình hoàn tiền phía cửa hàng. Tiện ích `order:status` dành cho kiểm thử local, không mở quyền cập nhật trạng thái qua API khách hàng.
- Chỉ tạo đơn VNPay sau callback có chữ ký hợp lệ và kết quả thành công. Trước đó giữ phiên thanh toán/đặt giữ tồn kho. Không giả lập thanh toán thành công trong UI.
- Backend không tự tăng trạng thái giao hàng. Trang khách tải lại khi mở, có nút làm mới và kiểm tra lại mỗi 30 giây.
- Các ảnh/giá/tồn kho ban đầu là dữ liệu mẫu, phải thay theo cửa hàng trước vận hành thực tế.

## Phần cần cấu hình/dịch vụ bên ngoài

- SMTP để gửi email thực (development có hộp thư file riêng phía server).
- Merchant VNPay, khóa ký, APP_URL HTTPS và IPN công khai; chưa kiểm chứng giao dịch sandbox trực tiếp vì chưa có cấu hình merchant.
- Quản trị viên/nhân viên tiếp nhận và cập nhật đơn; thanh toán hoàn tiền, vận chuyển và quản trị nằm ngoài UI khách hàng.
- Kiểm tra tuân thủ nội dung nâng cao chưa tích hợp dịch vụ kiểm duyệt; hiện giới hạn độ dài và kiểm tra từ khóa cơ bản phía server.

Thông báo VNPay đến muộn sau khi trả tồn kho: API thử giữ lại hàng trước khi tạo đơn. Nếu không còn đủ, ghi nhận đơn `payment_review` đã thanh toán để khách/cửa hàng đối soát, không làm âm tồn kho hoặc báo là đã có thể giao hàng. Hoàn tiền vẫn là nghiệp vụ của cửa hàng.
