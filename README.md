# Rookie Bakery

Website bán bánh React + Vite, API Express và SQLite, triển khai chức năng khách hàng theo báo cáo **DoAn_HDT**. Giữ phong cách scrapbook, giấy xé và ảnh Polaroid.

## Chạy trên máy

Cần **Node.js 22.13 trở lên** (khuyến nghị Node.js 24 LTS; dùng SQLite có sẵn trong Node).

```sh
npm install
npm run dev
```

Một lệnh khởi động cả API ở cổng 3001 và React ở cổng 5173. Mở địa chỉ Vite in trong terminal. Nếu 5173 đang bận, Vite chọn cổng tiếp theo. Dừng cả hai bằng Ctrl+C. Không chạy qua Live Server hoặc mở trực tiếp `index.html`.

Đăng ký tài khoản mới trên web để sử dụng. Không có tài khoản/mật khẩu mặc định. Dữ liệu được giữ trong `data/rookie.sqlite`, không đưa vào Git. Danh mục khởi tạo có 4 sản phẩm với tồn kho mẫu.

## Chức năng khách hàng

- Đăng ký, đăng nhập, đăng xuất, phiên đăng nhập bằng cookie HttpOnly; mật khẩu băm scrypt.
- Quên mật khẩu qua liên kết hết hạn sau 30 phút, dùng một lần; đổi mật khẩu hủy phiên cũ.
- Tìm kiếm không phân biệt dấu, lọc danh mục/khoảng giá, sắp xếp giá.
- Xem chi tiết bánh: ảnh, mô tả, thành phần, dị ứng, bảo quản, tồn kho và đánh giá.
- Lưu/bỏ yêu thích và giỏ hàng theo từng tài khoản, giữ sau khi tải lại trang hoặc đăng nhập lại.
- Thêm, tăng/giảm số lượng, xóa bánh, kiểm tra tồn kho ở máy chủ.
- Đặt hàng hai bước: thông tin nhận hàng, phương thức thanh toán, kiểm tra lại và xác nhận. Giá, phí giao hàng, tổng tiền được tính ở API. Phí mẫu 25.000đ, miễn phí từ 300.000đ.
- COD: tạo đơn thực trong SQLite, trừ tồn kho, xóa số lượng đã mua khỏi giỏ, hiển thị mã đơn.
- VNPay: tạo URL có chữ ký, kiểm tra chữ ký/số tiền/mã cửa hàng ở callback, chống xử lý lặp. Chỉ bật khi có cấu hình.
- Lịch sử, chi tiết, trạng thái và các mốc xử lý đơn; lọc trạng thái, làm mới. Hủy đơn COD chưa xác nhận, trả tồn kho một lần.
- Xem đánh giá công khai, gửi đánh giá 1–5 sao sau khi nhận bánh; mỗi khách một đánh giá/sản phẩm.
- Xem/sửa họ tên, email, số điện thoại, địa chỉ mặc định; kiểm tra email/số điện thoại trùng; đổi mật khẩu.

Đối chiếu chi tiết với use case: [docs/customer-requirements.md](docs/customer-requirements.md).

## Kiểm thử và bản build

```sh
npm test
npm run build
```

Kiểm thử API dùng SQLite trong bộ nhớ, không thay dữ liệu phát triển. Bao gồm tài khoản, quyền truy cập, giỏ/yêu thích, tồn kho, đặt hàng lặp/đồng thời, đánh giá, reset mật khẩu và callback VNPay có chữ ký giả lập **chỉ trong test**. Chưa thực hiện giao dịch với ngân hàng/VNPay thật.

`npm run preview` chỉ xem bundle; vẫn cần API chạy riêng. Để chạy cả bản build và API:

```sh
cp .env.example .env
# Cấu hình APP_URL theo địa chỉ triển khai và NODE_ENV=production trong .env
npm run build
npm start
```

API phục vụ bundle từ `dist/`. Server lắng nghe loopback; khi triển khai cần reverse proxy HTTPS và cài đặt APP_URL đúng nguồn truy cập. Cookie production yêu cầu HTTPS. Không public máy chủ bằng chế độ development.

## Email khôi phục mật khẩu

Development không cần SMTP: thư được ghi **chỉ trên máy chủ** vào `data/dev-mailbox.jsonl` (bị Git bỏ qua). Để thử quên mật khẩu: gửi yêu cầu trên web, mở liên kết của email mới nhất trong file này. File chứa liên kết nhạy cảm; không commit/chia sẻ. Không có đường API công khai để đọc thư.

Muốn gửi email thật, cấu hình `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM` và nếu cần `SMTP_USER`, `SMTP_PASSWORD` trong `.env`. Chế độ production không dùng hộp thư giả, trả thông báo chưa cấu hình nếu thiếu SMTP. Không gửi mật khẩu mới trực tiếp cho người dùng.

## VNPay

Đặt `APP_URL`, `VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET`, tùy chọn `VNPAY_URL` trong `.env`. Mặc định URL sandbox; chỉ đổi sang production khi đã được VNPay cấp cấu hình. Đăng ký IPN: `<APP_URL>/api/payments/vnpay/ipn`; return URL: `<APP_URL>/api/payments/vnpay/return`. Server phải được VNPay truy cập qua HTTPS. Nếu Vite chạy cổng khác, sửa APP_URL cho khớp.

Không cần và không nên gửi khóa bí mật qua chat. Khi chưa cấu hình, tùy chọn VNPay bị vô hiệu hóa; COD vẫn dùng được. Phiên VNPay giữ tồn kho tối đa 15 phút; phiên thất bại hoặc hết hạn được hoàn tồn kho, giỏ vẫn giữ nguyên. Trang danh mục/checkout thu hồi phiên hết hạn. Đơn thanh toán thành công được ghi nhận duy nhất một lần. Đơn đã trả tiền không tự hủy; xử lý hoàn tiền cần phía cửa hàng. Cần xác nhận toàn bộ luồng trên sandbox và cấu hình merchant trước khi nhận tiền thật.

## Kiểm tra theo dõi đơn và đánh giá khi chưa có trang quản trị

Phần khách hàng không có quyền tự giao đơn. Để kiểm thử tại máy phát triển, sử dụng tiện ích nội bộ (không phải API cho khách):

```sh
npm run order:status -- RK-MA_DON processing
npm run order:status -- RK-MA_DON shipping
npm run order:status -- RK-MA_DON delivered
```

Dùng mã đơn thực trong lịch sử, thực hiện đúng thứ tự. Công cụ cập nhật lịch sử trạng thái, đánh dấu COD đã thu tiền khi giao xong. Sau đó khách mở chi tiết bánh để đánh giá. Trang quản trị/nhân viên và vận hành giao hàng nằm ngoài phần khách hàng của yêu cầu này.

Ảnh bánh được tạo riêng và lưu tại `public/images/bakery.png`. Icon túi mua sắm từ [Flaticon](https://www.flaticon.com/), có ghi nguồn ở footer. Nếu mạng chặn CDN Flaticon thì icon ẩn, nút giỏ vẫn sử dụng được. Font cài qua Fontsource và phục vụ trong bundle.
