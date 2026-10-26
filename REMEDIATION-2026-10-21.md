# Kết quả sửa lỗi sau audit — 21/10/2026

Đây là báo cáo thay đổi theo thời điểm. Đặc tả hiện tại được tổ chức trong [bộ tài liệu README](README.md#bộ-tài-liệu); không dùng báo cáo này thay cho hợp đồng API hoặc hướng dẫn vận hành.

## Đã xử lý

| Phát hiện | Thay đổi |
| --- | --- |
| Danh sách công khai lộ token/hồ sơ | API danh sách bắt buộc Bearer auth, phân trang 1–200; danh bạ trường không trả sample token |
| Response tra cứu còn số nguyên bản | Dữ liệu public che cả khóa gốc và khóa hiển thị, không trả QR token hoặc địa chỉ chi tiết |
| Bỏ lookupType để vượt đối soát | Bắt buộc đúng loại, tên đầy đủ, ngày sinh và định danh 12 số; bỏ fallback và so tên một phần |
| Mật khẩu mẫu công khai | Bỏ preset frontend, production không seed demo; tài khoản còn dùng mật khẩu mẫu bị khóa khi khởi động; bootstrap admin bằng secret riêng |
| Phiên cũ giữ quyền | Kiểm tra user hiện hành ở mỗi request; thu hồi mọi phiên khi sửa/xóa user; frontend xác minh phiên khi tải lại và xử lý 401 |
| Đọc chéo trường | Kiểm tra schoolCode ở detail, list, update, create/import/export và thống kê; không tạo school admin thiếu trường; role phải thuộc danh sách cho phép |
| Điểm 0/thiếu điểm thành tối đa | Giữ 0, không suy diễn điểm trống; chưa đạt lưu PENDING, chặn cấp khi chưa đạt/chưa đủ điều kiện; bỏ điểm điền sẵn trong form |
| SheetJS có lỗ hổng | Pin xlsx 0.20.3 từ CDN chính thức và cập nhật lockfile |
| Cấp trùng số sau xóa | Sequence riêng theo năm, lấy mốc từ số lớn nhất đang có, tăng bằng câu lệnh SQLite nguyên tử; frontend để server cấp số |
| Logout chỉ xóa local | Gọi API hủy session, thông báo nếu chưa hủy được do lỗi mạng |
| Giả IP để né rate limit | Mặc định không tin X-Forwarded-For; cấu hình danh sách proxy tin cậy; mặc định listen loopback |
| Typecheck lỗi nhưng build vẫn qua | Input DTO cho địa chỉ string/object; build bắt buộc typecheck; loại thư mục artifacts tạm khỏi tsconfig |
| Export không import lại được | Chia sẻ ánh xạ header giữa client/server; kiểm thử xuất workbook rồi nhập lại dưới dạng hồ sơ mới |

## Củng cố vận hành

- Tách `dist/client` khỏi bundle/sourcemap backend, chỉ phục vụ thư mục client qua static.
- Dùng scrypt với salt ngẫu nhiên cho mật khẩu, tự nâng hash SHA-256 cũ sau lần đăng nhập thành công; token phiên dùng 32 byte ngẫu nhiên từ crypto.
- Chuẩn hóa ngày mới, tính hết hạn sau cuối ngày Việt Nam và dùng trạng thái hiệu lực cho danh sách, chi tiết, filter, thống kê và export.
- Create/update/import có validation backend; import không bỏ qua lỗi sẽ rollback toàn bộ batch, còn chế độ bỏ qua lỗi giữ dòng hợp lệ.
- Không còn tự tính lại điểm mọi hồ sơ khi server khởi động.
- Log client được ghi thành CLIENT_EVENT, không giả mạo action nghiệp vụ; có rate limit riêng và retention 10.000 sự kiện. Import có audit tổng kết.
- Có snapshot SQLite online kèm integrity_check; đã tạo backup database hiện có trong thư mục backups được Git ignore.
- Ngừng theo dõi db/app.db trong Git, giữ nguyên file local; ignore database, backup và metadata phiên launcher.
- Launcher không còn taskkill theo port, không mở browser trước khi server sẵn sàng. Dừng server bằng secret theo phiên, chỉ nhận từ loopback; build thiếu sẽ build cả client/server.
- Chế độ dev do script cấu hình rõ; module GCN/Excel được tải riêng, bundle chính giảm từ khoảng 797 kB xuống khoảng 390 kB.
- Bỏ script chặn phím inline khiến cấu hình server không tắt được; hook đọc lại cấu hình và không tạo vòng effect phụ thuộc trạng thái DevTools.
- Thay entry test cũ bằng bộ hồi quy trên database riêng có assertions; không tạo dữ liệu thử trong database vận hành.

## Kiểm chứng

- `npm test`: typecheck + production build + 49 ca hồi quy HTTP/SQLite.
- Các ca bao phủ phân quyền theo trường, khóa/hạ quyền/đổi mật khẩu/logout, JSON che dữ liệu, bỏ đối soát, điểm 0, import rollback, xuất/nhập workbook, sequence sau xóa, trạng thái hết hạn, hash migration, backup và endpoint dừng có xác thực.
- Dependency install/audit sau cập nhật báo 0 vulnerabilities. Báo cáo này mô tả kết quả công cụ, không thay thế kiểm thử mọi dạng khai thác.
- Không chạy server đã vá với database chính để thử đăng nhập; các ca kiểm thử dùng database tạm riêng. Database chính chỉ được đọc để backup.

## Khi sử dụng bản vá

1. Đọc mục **Khởi tạo hoặc khôi phục quyền admin** trong README và đặt mật khẩu riêng. Tài khoản còn dùng mật khẩu mẫu sẽ bị khóa khi khởi động bản vá. Hồ sơ vẫn giữ nguyên.
2. Khởi động lại bằng bản build mới; process cũ đang chạy sẽ chưa có các thay đổi.
3. Đối chiếu hồ sơ cũ từng thiếu điểm/nhập điểm 0. Bản vá ngăn dữ liệu sai mới, không thể suy ra điểm đúng hoặc thu hồi tự động các chứng nhận đã cấp sai.
4. Nếu token QR từng bị công bố qua các API cũ, cần đánh giá phạm vi lộ và việc cấp lại QR theo quy trình nghiệp vụ. Bản vá giữ token cũ để không làm hỏng thẻ đang lưu hành.
5. Việc ngừng theo dõi database không xóa các bản sao trong lịch sử Git. Nếu repo từng chứa dữ liệu thật, cần xử lý lịch sử và các bản clone theo phạm vi phân phối thực tế.

Giới hạn: chưa kiểm thử giao diện trực quan toàn bộ trình duyệt, hạ tầng reverse proxy/TLS, tải lớn hoặc diễn tập phục hồi trên máy khác. Backup đã kiểm tra tính toàn vẹn và dữ liệu snapshot trong test; chưa thay database vận hành bằng bản restore.

## Cập nhật sau thiết kế lại giao diện

Đã thay trang tra cứu, màn hình đăng nhập StaffLogin, Header/Sidebar/Footer và phong cách chung của bảng/form. Sidebar mới rộng 272px, hỗ trợ overlay và vòng focus trên mobile; lookup dùng container query và không trả nút lấy hồ sơ đầy đủ từ kết quả công khai. Giao diện mới không điền sẵn mật khẩu hoặc điểm/nhân thân mẫu vào form tạo mới.

Sau thay đổi giao diện, `npm test` tiếp tục đạt typecheck, build và 49 kiểm tra hồi quy. Đã quan sát giao diện hẹp khoảng 319px, đăng nhập/đăng xuất, mở sidebar và điều hướng bằng database demo riêng. Chưa có kiểm thử browser end-to-end đầy đủ cho mọi luồng hoặc nghiệm thu desktop/print/accessibility trên nhiều trình duyệt.

Chi tiết thiết kế: [UI_DESIGN.md](docs/UI_DESIGN.md). Phân biệt kết quả đã chạy và checklist cần làm: [TESTING.md](docs/TESTING.md). Các giới hạn về dữ liệu cũ, QR đã công bố và lịch sử Git ở trên vẫn áp dụng.
