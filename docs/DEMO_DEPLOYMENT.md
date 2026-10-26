# Demo online với backend Express và SQLite

Cấu hình ngày 26/10/2026: `render.yaml` chuẩn bị một Render Web Service gói Free, Node.js 24, giữ nguyên backend và API. Đây là cấu hình sẵn sàng triển khai, chưa phải xác nhận có dịch vụ online; chỉ URL/trạng thái triển khai thành công từ hosting mới xác nhận demo đã hoạt động.

## Cấu hình đã chuẩn bị

- Build: `npm ci --include=dev && npm run build`.
- Chạy: `npm run start:demo`; script chỉ chạy khi `DEMO_MODE=true`.
- Host `0.0.0.0`, port do Render cấp qua biến PORT; health check `/lookup` không tiêu thụ quota API.
- `VITE_DEMO_MODE=true` lúc build hiển thị nhãn BẢN DEMO; không bật nhãn trong bản build vận hành bình thường.
- Database mẫu: `/tmp/driver-training-web-demo/app.db`, không dùng db/app.db của máy hoặc DATA_DIR kế thừa. Script chặn lựa chọn thư mục db vận hành mặc định.
- Không tự tạo dịch vụ trả phí hoặc ổ đĩa trả phí. Tự động deploy khi push được tắt; triển khai thủ công sau khi kiểm tra source.

## Khởi tạo trên Render

1. Đăng nhập Render bằng tài khoản của người sở hữu repository.
2. Kết nối GitHub, chỉ chọn repository private `tuannt2707/driver-training-verification` khi cấp quyền cho Render.
3. Tạo Blueprint từ repository, nhánh main, file render.yaml; xác nhận service dùng gói Free trước khi triển khai.
4. Chờ build/deploy hoàn tất, mở URL HTTPS do Render trả về. Kiểm tra lookup, QR, đăng nhập, dashboard và cấp API key trên database demo.

Nếu Render yêu cầu đăng ký tài khoản, chấp nhận điều khoản hoặc cấp quyền GitHub mới, người sở hữu cần tự hoàn tất/xác nhận các bước đó. Không gửi token hay mật khẩu vào repository.

## Tài khoản mẫu riêng của demo

| Tài khoản | Mật khẩu mẫu | Quyền |
| --- | --- | --- |
| admin | Admin@2026! | SUPERADMIN |
| truong.gtvt | Gtvt@2026! | SCHOOL_ADMIN |
| thanhtra | Thanhtra@2026! | INSPECTOR |

Các tài khoản trên chỉ dùng trong môi trường demo có dữ liệu mẫu. Bản chạy production vẫn vô hiệu hóa mật khẩu mẫu theo quy tắc hiện hành. Không dùng mật khẩu admin vận hành trên máy cho demo. Form chương trình/đơn vị vận tải bắt đầu từ danh mục trống, có thể tạo dữ liệu mẫu khi thử.

Render Free sử dụng filesystem tạm, dữ liệu SQLite có thể mất khi restart/redeploy. Lần mở đầu có thể chậm khi service được đánh thức. Demo không phải nơi lưu dữ liệu lâu dài. Giới hạn hiện hành: https://render.com/docs/free.

## Kiểm tra cục bộ an toàn

`npm test` có thêm `test:demo`, chạy server demo trên port rảnh và thư mục tạm. Kiểm tra opt-in bắt buộc, bỏ qua DATA_DIR kế thừa, tạo dữ liệu mẫu và đăng nhập mẫu; không đụng database vận hành. `npm start` vẫn là launcher production hiện có.
