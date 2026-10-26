# Triển khai và vận hành

Cập nhật: 21/10/2026. Các lệnh chạy từ thư mục project. Đây là hướng dẫn cho kiến trúc một process hiện tại; không khẳng định hạ tầng triển khai thực tế đã được cấu hình hoặc nghiệm thu.

## Chuẩn bị và khởi chạy

Khuyến nghị Node.js 24.x. Windows có thể dùng `runtime/node.exe` đi kèm để chạy bản build; cài dependency/build vẫn cần npm và bộ công cụ dự án. Kiểm tra runtime trước khi xử lý lỗi SQLite.

```powershell
node --version
npm ci
npm test
npm start
```

`npm ci` đọc đúng lockfile; package SheetJS tải từ CDN đã pin trong lockfile. Cần truy cập cả npm registry và nguồn tarball này khi cài mới. Không thay bằng `xlsx@latest` trên npm registry rồi giả định tương đương bản đang dùng.

Production mở `http://127.0.0.1:3000/lookup`. `npm start`, `start.bat`, `start-server.bat` dùng launcher `scripts/serve.mjs`. Launcher ép NODE_ENV=production, tạo process con và metadata phiên trong `storage/server-process.json`. Một checkout chỉ quản lý một phiên launcher qua file này.

`start.bat` ưu tiên runtime portable; nếu thiếu server bundle hoặc client index thì gọi build đầy đủ. Nếu đã có build, launcher không tự phát hiện source mới hơn: sau khi sửa source phải chủ động chạy `npm run build`.

Dừng bằng `stop.bat` đối với phiên launcher. Script gửi yêu cầu từ loopback kèm secret của đúng phiên; không taskkill theo port. Ctrl+C vẫn là cách dừng ở cửa sổ server; không giả định Windows luôn chuyển tiếp signal giống Unix. Nếu chạy trực tiếp bundle bỏ qua launcher thì không có metadata để stop.bat sử dụng.

## Khởi tạo hoặc đặt lại admin

Không có tài khoản/mật khẩu mặc định cho production mới. Tài khoản cũ còn dùng mật khẩu mẫu đã công bố sẽ bị vô hiệu hóa khi khởi động bản vá; các hồ sơ vẫn được giữ. Tài khoản dùng password riêng có thể tiếp tục đăng nhập, hash cũ được nâng sau lần xác thực thành công.

Đặt lại admin bằng secret riêng, tối thiểu 12 ký tự:

```powershell
$adminSecret = Read-Host 'Mật khẩu admin mới (12–128 ký tự)' -AsSecureString
$env:BOOTSTRAP_ADMIN_PASSWORD = [System.Net.NetworkCredential]::new('', $adminSecret).Password
try {
    npm start
} finally {
    Remove-Item Env:BOOTSTRAP_ADMIN_PASSWORD -ErrorAction SilentlyContinue
    Remove-Variable adminSecret -ErrorAction SilentlyContinue
}
```

BOOTSTRAP_ADMIN_PASSWORD tạo hoặc đặt lại user `admin`, kích hoạt và gán SUPERADMIN. Dùng biến này cũng đặt lại admin đã tồn tại, không chỉ khởi tạo database mới. Không để secret trong `.env` dùng lâu dài; dừng phiên bootstrap rồi chạy bình thường. Không ghi password vào issue, screenshot hoặc tài liệu.

Sau đó tạo cơ sở đào tạo, tạo user trường gắn cơ sở, đặt mật khẩu riêng và phân công vai trò. Mật khẩu tài khoản hiện được quản trị viên đặt lại qua quản lý user; chưa có email reset hoặc màn hình tự đổi mật khẩu.

## Biến môi trường

| Biến | Ý nghĩa |
| --- | --- |
| `HOST` | Mặc định 127.0.0.1. Muốn LAN phải cấu hình địa chỉ bind phù hợp |
| `PORT` | Mặc định 3000; stop.bat đọc môi trường/.env để xác định port, nên giữ cấu hình đồng nhất với phiên đã start |
| `DATA_DIR` | Mặc định ./db, tính từ cwd; chứa app.db/WAL/SHM |
| `TRUSTED_PROXIES` | Danh sách địa chỉ proxy ngăn bằng dấu phẩy; bỏ trống khi truy cập trực tiếp |
| `ENABLE_DEMO_DATA` | Chỉ bật khi giá trị true và NODE_ENV=development/test; seed theo từng bảng khi bảng đó rỗng |
| `BOOTSTRAP_ADMIN_PASSWORD` | Secret bootstrap/reset admin, dùng tạm thời |
| `NODE_ENV` | Launcher ép production; script dev ép development; chỉ development gắn Vite middleware |
| `DISABLE_HMR` | Tùy chọn cấu hình Vite cho development; không phải chế độ bảo mật production |
| `APP_STOP_TOKEN` | Biến nội bộ do launcher sinh; không phải password admin, không cần tự cấu hình |

`.env` do dotenv đọc từ cwd. Launcher chuyển cwd về project; khi chạy script khác trực tiếp cần giữ đúng cwd. `.env.example` không chứa secret.

## Phát triển và dữ liệu demo riêng

```powershell
$env:DATA_DIR = Join-Path $env:TEMP ('driver-demo-' + [guid]::NewGuid())
$env:ENABLE_DEMO_DATA = 'true'
try {
    npm run dev
} finally {
    Remove-Item Env:DATA_DIR -ErrorAction SilentlyContinue
    Remove-Item Env:ENABLE_DEMO_DATA -ErrorAction SilentlyContinue
}
```

Đây là database demo mới, không trỏ vào thư mục dữ liệu vận hành. Muốn xem bằng vai trò cán bộ mà không dùng thông tin seed, có thể giữ demo tắt, chạy lần đầu bằng biến bootstrap riêng rồi tạo dữ liệu thử qua API/giao diện. Không bật demo hoặc dùng dữ liệu thật để thử import.

Các URL xem thử ở port khác trong quá trình thiết kế là phiên tạm, không phải địa chỉ production được bảo đảm tồn tại.

## Backup và phục hồi

```powershell
npm run backup
npm run backup -- backups/ban-sao-truoc-cap-nhat.db
```

Script dùng API backup SQLite khi database đang mở, kiểm tra `PRAGMA integrity_check`, từ chối ghi đè file đã có. Backup mặc định vào `backups/`; tên chứa thời gian UTC và suffix ngẫu nhiên. Không copy riêng app.db đang hoạt động và bỏ qua WAL để thay cho snapshot.

Quy trình phục hồi đề xuất:

1. Chọn backup đã kiểm tra; dừng server và xác nhận process cũ đã kết thúc.
2. Giữ lại nguyên trạng thư mục DATA_DIR đang có làm điểm quay lui.
3. Tạo một thư mục phục hồi mới, chép snapshot thành `app.db` trong đó; không trộn WAL/SHM từ database khác.
4. Đặt DATA_DIR trỏ vào thư mục phục hồi, khởi động, kiểm tra tài khoản, trường, số lượng hồ sơ, vài GCN và trạng thái.
5. Chỉ dùng dữ liệu phục hồi cho vận hành sau khi đã đối chiếu. Nếu có lỗi, dừng phiên phục hồi và quay về cấu hình DATA_DIR trước đó.

Backup chứa định danh, QR token và hash mật khẩu. Lưu bản sao ngoài máy chạy và giới hạn quyền đọc ở hệ điều hành. Ứng dụng chưa có lịch backup, mã hóa backup, chính sách xóa backup hay mục tiêu RPO/RTO tự động; đơn vị vận hành cần xác định tần suất và thời gian phục hồi chấp nhận được.

## Cập nhật phiên bản và quay lui

Backup trước khi thay source/dependency, chạy `npm ci` và `npm test`, rồi dừng server cũ và start bản build mới. Giữ cùng DATA_DIR nếu không chủ động chuyển database. Kiểm tra đăng nhập, tra cứu, QR, phạm vi trường và thao tác Excel sau cập nhật.

Restart sẽ mất session trong RAM; cán bộ phải đăng nhập lại. Quay lui bundle không đảm bảo tự quay lui dữ liệu/schema. Nếu phiên bản tương lai thay schema cần migration có version và kế hoạch phục hồi; hiện chưa có migration manager để thực hiện tự động.

## Triển khai LAN/Internet

Khi cần truy cập ngoài máy cục bộ: cấu hình HOST, firewall, reverse proxy và HTTPS; chỉ tin địa chỉ proxy thực tế, chặn đường truy cập trực tiếp bỏ qua proxy. Không cấu hình trust proxy rộng chỉ để làm mất lỗi rate limit. Bộ đếm IP dùng chung có thể ảnh hưởng nhiều cán bộ cùng mạng NAT; cần đo trước khi thay hạn mức.

Session RAM và SQLite đồng bộ chưa được kiểm chứng cho nhiều replica hoặc tải lớn. Chưa có endpoint health chuyên dụng, hệ thống metrics, cảnh báo tự động hay service manager đi kèm. Tổ chức chạy nền cần dùng công cụ quản lý service của môi trường triển khai và xác định trách nhiệm restart/giám sát.

## Vận hành API key

Sau build và restart backend, hai bảng khóa/usage được tạo bổ sung trên DATA_DIR hiện hành; không tự cấp API key hoặc đổi tài khoản. SUPERADMIN cấp khóa tại `/admin/api-keys`. Cấp riêng từng ứng dụng và chọn phạm vi cơ sở phù hợp; lưu secret bên backend đơn vị tích hợp. Chi tiết giao thức và vòng đời: [INTEGRATION.md](INTEGRATION.md).

Khóa và quota theo khóa giữ qua restart. Khi mất khóa, cấp khóa mới rồi thu hồi khóa cũ; không thể khôi phục secret từ hash. Khóa phụ thuộc tài khoản người cấp còn hoạt động và quyền SUPERADMIN; khi chuyển người quản trị, cấp lại khóa từ tài khoản phù hợp trước khi vô hiệu hóa tài khoản cũ. Kiểm tra cả trạng thái cơ sở nếu nhận 403. Thu hồi là vĩnh viễn; kích hoạt lại tài khoản/cơ sở có thể cho phép khóa chưa thu hồi còn hạn hoạt động lại.

## Xử lý sự cố thường gặp

| Dấu hiệu | Hướng kiểm tra |
| --- | --- |
| Không nhận `node:sqlite`, lỗi runtime | Kiểm tra phiên bản Node; dùng runtime 24.x phù hợp |
| EADDRINUSE | Xác minh ứng dụng chiếm port hoặc đổi PORT; không tự giết PID bất kỳ |
| Launcher báo phiên đang chạy | Kiểm tra phiên theo metadata và process thực tế; không xóa metadata của phiên còn sống |
| Đăng nhập bằng tài khoản mẫu bị từ chối | Bootstrap mật khẩu admin riêng, rồi đặt lại/mở tài khoản cần dùng |
| Frontend cũ sau sửa source | Build lại và tải lại trang; npm start phục vụ dist/client, không source |
| 401 sau sửa tài khoản/restart | Đăng nhập lại; thu hồi phiên là hành vi dự kiến |
| 429 | Kiểm tra lưu lượng và cấu hình proxy; chờ hết cửa sổ, không đổi IP/header để né |
| Import báo lỗi hoặc nhập một phần | Đọc importedCount, errors và errorDetails; kiểm tra mã trường và dữ liệu từng dòng |
| SQLITE_BUSY / database locked | Kiểm tra các process cùng mở DB, thao tác SQL ngoài ứng dụng và vị trí lưu; không xóa WAL/SHM khi đang hoạt động |

Chi tiết API: [API.md](API.md). Phạm vi đã/ chưa kiểm chứng: [TESTING.md](TESTING.md).
