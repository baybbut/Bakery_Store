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

## Cập nhật trạng thái đơn bằng dòng lệnh (ngoài trang quản trị)

Phần khách hàng không có quyền tự giao đơn. Để kiểm thử tại máy phát triển, sử dụng tiện ích nội bộ (không phải API cho khách):

```sh
npm run order:status -- RK-MA_DON processing
npm run order:status -- RK-MA_DON shipping
npm run order:status -- RK-MA_DON delivered
```

Dùng mã đơn thực trong lịch sử, thực hiện đúng thứ tự. Công cụ cập nhật lịch sử trạng thái, đánh dấu COD đã thu tiền khi giao xong. Sau đó khách mở chi tiết bánh để đánh giá. Trang quản trị/nhân viên và vận hành giao hàng nằm ngoài phần khách hàng của yêu cầu này.

Ảnh bánh được tạo riêng và lưu tại `public/images/bakery.png`. Icon túi mua sắm từ [Flaticon](https://www.flaticon.com/), có ghi nguồn ở footer. Nếu mạng chặn CDN Flaticon thì icon ẩn, nút giỏ vẫn sử dụng được. Font cài qua Fontsource và phục vụ trong bundle.

## Dữ liệu dùng chung (file .sql)

Dữ liệu chạy nằm trong `data/rookie.sqlite` (không đưa lên Git). Dữ liệu mẫu của nhóm nằm trong **`database/rookie.sql`** và được commit. Máy chưa có `data/rookie.sqlite` sẽ tự tạo từ file này: 4 bánh mẫu, 3 danh mục và các tài khoản:

| Vai trò | Email | Mật khẩu |
|---|---|---|
| Quản trị viên | admin@gmail.com | 1234 |
| Nhân viên (Đơn hàng, Khách hàng, Đánh giá) | nhanvien1@gmail.com | Nhanvien123 |
| Nhân viên (Sản phẩm, Danh mục, Đơn hàng) | nhanvien2@gmail.com | Nhanvien123 |

Mật khẩu demo yếu, chỉ dùng trên máy phát triển.

```sh
npm run db:export   # ghi dữ liệu hiện tại ra database/rookie.sql để commit cho cả nhóm
npm run db:import   # dựng lại data/rookie.sqlite từ database/rookie.sql (dừng npm run dev trước)
```

`db:import` giữ bản cũ thành `data/rookie.sqlite.<thời gian>.bak`. File `.sql` chứa thông tin khách hàng và mật khẩu đã mã hóa, repo công khai thì chỉ export dữ liệu demo. Phiên đăng nhập và mã đặt lại mật khẩu không được xuất.

## Cấu trúc cơ sở dữ liệu (SQLite)

Định nghĩa trong `server/db.js`. Bật khóa ngoại (`PRAGMA foreign_keys=ON`), tiền lưu số nguyên đồng (INTEGER), thời gian lưu chuỗi ISO 8601 (TEXT).

| Bảng | Nội dung | Khóa / quan hệ chính |
|---|---|---|
| `users` | Tài khoản khách hàng (cột `locked` để khóa) | PK `id`; `email`, `phone` UNIQUE |
| `staff` | Tài khoản quản trị viên/nhân viên, vai trò, quyền | PK `id`; `email` UNIQUE |
| `categories` | Danh mục bánh | PK `id`; `name` UNIQUE |
| `products` | Sản phẩm: tên, mô tả, giá, ảnh, tồn kho, trạng thái | PK `id`; FK `category_id` → `categories` |
| `cart` | Giỏ hàng | PK (`user_id`, `product_id`); FK → `users`, `products` |
| `favorites` | Bánh yêu thích | PK (`user_id`, `product_id`) |
| `orders` | Đơn hàng: trạng thái, thanh toán, địa chỉ giao (JSON), tiền | PK `id`; FK `user_id` → `users` |
| `order_items` | Chi tiết đơn: tên, giá, số lượng tại thời điểm đặt | PK (`order_id`, `line`); FK → `orders` (CASCADE), `products` (SET NULL) |
| `order_events` | Lịch sử trạng thái đơn | FK `order_id` → `orders` |
| `payment_attempts` | Phiên thanh toán VNPay đang giữ hàng (bản chụp JSON tạm) | PK `id`; FK `user_id` → `users` |
| `reviews` | Đánh giá 1–5 sao và phản hồi của tiệm (`reply`) | UNIQUE (`user_id`, `product_id`) |
| `purchases` | Phiếu nhập hàng | PK `id` |
| `purchase_items` | Chi tiết phiếu nhập: số lượng, giá nhập | PK (`purchase_id`, `line`); FK → `purchases` (CASCADE), `products` (SET NULL) |
| `settings` | Cài đặt cửa hàng (khóa – giá trị JSON) | PK `key` |
| `sessions`, `staff_sessions`, `resets` | Phiên đăng nhập, mã đặt lại mật khẩu (băm) | FK → `users` / `staff` (CASCADE) |

Chi tiết đơn và phiếu nhập lưu bản chụp tên/giá nên vẫn đúng khi sản phẩm đổi giá hoặc bị xóa. Database của phiên bản cũ (cột JSON `products.data`, `orders.items`, `purchases.items`) được tự chuyển sang cấu trúc này khi khởi động, không mất dữ liệu.

## Trang quản trị

Mở `http://localhost:5173/admin`. Tài khoản quản trị/nhân viên nằm trong bảng riêng, tách hẳn khỏi tài khoản khách hàng (không dùng chung đăng nhập, không hiện trong danh sách khách). Tạo quản trị viên đầu tiên:

```sh
npm run admin:create -- admin@gmail.com 1234
```

Lệnh này cũng dùng để đặt lại mật khẩu quản trị viên khi quên. Các nhân viên khác do quản trị viên tạo trong trang quản trị. Phiên quản trị dùng cookie riêng, hết hạn sau 8 giờ và tự đăng xuất khi tải lại hoặc rời trang.

Chức năng theo báo cáo DoAn_HDT:

- **Phân quyền:** vai trò Quản trị viên (toàn quyền) và Nhân viên. Quản trị viên chọn quyền cho từng nhân viên: Thống kê, Đơn hàng, Sản phẩm, Danh mục, Khách hàng, Đánh giá, Nhập hàng. Nhân viên, Cài đặt, xóa và thống kê đánh giá chỉ dành cho quản trị viên. Máy chủ kiểm tra quyền ở mọi API.
- **Tổng quan:** doanh thu, số đơn, giá trị TB/đơn, số khách, biểu đồ 30 ngày, bánh bán chạy, trạng thái đơn, sắp hết hàng.
- **Thống kê doanh thu:** chọn khoảng ngày, nhóm theo ngày/tháng/năm; biểu đồ, bảng số liệu, doanh thu theo danh mục, top 10 bánh. Doanh thu tính trên đơn không bị hủy, theo giờ Việt Nam.
- **Đơn hàng:** tìm (mã, tên, email, SĐT), lọc trạng thái và ngày, xem chi tiết; xác nhận → đang chuẩn bị → đang giao → đã giao, hoặc hủy (hoàn tồn kho, có xác nhận).
- **Sản phẩm:** thêm, sửa, xóa, ẩn/bán lại, xem chi tiết; tìm và lọc theo tên, danh mục, khoảng giá, trạng thái (còn hàng/hết hàng/ngừng kinh doanh). Ảnh chọn từ ảnh có sẵn hoặc đường link https.
- **Nhập hàng:** tạo phiếu nhập (nhà cung cấp, nhiều dòng bánh, số lượng, giá nhập), tồn kho được cộng ngay trong một giao dịch; xem, tìm, lọc theo ngày và chi tiết phiếu. Phiếu không sửa/xóa được để giữ lịch sử kho. Có quyền riêng "Nhập hàng" để cấp cho nhân viên.
- **Danh mục:** thêm, sửa (đổi tên cập nhật luôn sản phẩm), xóa (chặn khi còn sản phẩm), tìm. Bộ lọc danh mục ở trang khách lấy từ đây.
- **Khách hàng:** danh sách, tìm, xem chi tiết và lịch sử mua hàng, thêm, sửa thông tin, khóa/mở khóa (khách bị khóa bị đăng xuất và không đăng nhập được).
- **Đánh giá:** xem, lọc theo sao/trạng thái, phản hồi; quản trị viên xem thống kê và xóa đánh giá.
- **Nhân viên:** thêm, sửa, xóa, tìm, xem chi tiết, vô hiệu hóa, đặt lại mật khẩu. Hệ thống luôn giữ ít nhất một quản trị viên đang hoạt động.
- **Cài đặt:** thông tin cửa hàng (hiện ở chân trang khách), banner thông báo, bật/tắt COD và VNPay, phí giao hàng và mức miễn phí, tạm đóng/mở cửa hàng (khách không thêm giỏ/đặt bánh được), tải bản sao lưu `.sql` (khôi phục: `sqlite3 data/rookie.sqlite < file.sql`).
- **Tài khoản:** xem thông tin, sửa họ tên/SĐT, đổi mật khẩu.

Chưa làm: tự khôi phục mật khẩu qua email cho nhân viên (quản trị viên đặt lại giúp, hoặc dùng lệnh `admin:create`), tải ảnh sản phẩm lên máy chủ.
