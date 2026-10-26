# Đưa mã nguồn lên GitHub

Repository GitHub private: [tuannt2707/driver-training-verification](https://github.com/tuannt2707/driver-training-verification). Thư mục làm việc gốc giữ nguyên lịch sử và không thêm remote xuất bản. Lịch sử Git cũ từng chứa `db/app.db`; không push nguyên lịch sử đó. Mã nguồn xuất bản bắt đầu từ snapshot sạch không chứa database, backup hoặc dữ liệu vận hành.

## Nội dung được đưa lên

- Source `src/`, `server/`, `server.ts`, tài nguyên `public/`, script, cấu hình build và lockfile.
- README, tài liệu kỹ thuật và `.env.example` chỉ có giá trị cấu hình mẫu.
- `.github/workflows/ci.yml`: Node.js 24, npm ci, build và kiểm thử trên database tạm; workflow chỉ có quyền đọc repository.

Không đưa lên `.env`/các biến thể `.env.*` (trừ `.env.example`), `.git` cũ, `db/`, `backups/`, `storage/`, `node_modules/`, `dist/`, `test-output/`, `scratch/`, `release/` hoặc binary `runtime/node.exe`. Runtime portable chỉ dùng cho bản chạy Windows tại máy; môi trường GitHub dùng Node.js 24 được cài riêng.

## Bản mã nguồn sạch

`release/github-source/` là checkout xuất bản cục bộ, có lịch sử Git mới và origin trỏ tới repository trên. `release/github-source.zip` chứa source để bàn giao, không gồm `.git`. Bản sao không mang theo lịch sử Git cũ. Không đổi/xóa lịch sử repository làm việc ban đầu và không force-push vào repository đang có dữ liệu.

Để cập nhật lần sau: đồng bộ lại các thư mục/file source được phép sang checkout xuất bản, kiểm tra không có dữ liệu vận hành hoặc bí mật, rồi commit và push từ checkout đó. Không chép `.git` từ thư mục gốc vào checkout xuất bản; không thêm thư mục runtime, DB, storage hoặc backup. Token đăng nhập do Git Credential Manager quản lý, không lưu trong repository/remote URL.

Database vận hành tiếp tục ở máy hiện tại. Một triển khai mới cần DATA_DIR riêng và bootstrap admin bằng mật khẩu riêng qua môi trường; không đưa mật khẩu bootstrap vào source hoặc workflow.

## GitHub và nơi chạy ứng dụng

Đưa source lên GitHub cung cấp repository và CI, chưa tạo dịch vụ web online. Ứng dụng dùng Express và SQLite native `node:sqlite`, cần môi trường chạy Node.js 24 với ổ lưu trữ bền vững cho DATA_DIR. GitHub Pages chỉ phục vụ tài nguyên tĩnh, không thay backend hiện tại.

Khi triển khai ngoài loopback, cấu hình HOST phù hợp, HTTPS và proxy tin cậy đúng địa chỉ. Chưa cấu hình nhà cung cấp hosting, domain hoặc dịch vụ trả phí tự động trong bước chuẩn bị GitHub này.
