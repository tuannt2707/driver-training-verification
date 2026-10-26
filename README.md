# Hệ thống tập huấn nghiệp vụ lái xe kinh doanh vận tải

Cổng quản lý, cấp và xác thực giấy chứng nhận. Cơ quan chủ quản: **Sở Xây dựng TP. Hồ Chí Minh**. Đơn vị hỗ trợ: **Trung tâm Quản lý Giao thông công cộng TP.HCM**, 27 Phạm Viết Chánh, Phường Cầu Ông Lãnh, TP. Hồ Chí Minh.

Cập nhật tài liệu: **21/10/2026**, theo mã nguồn sau sửa bảo mật và thiết kế lại giao diện. README dùng để bắt đầu; các tài liệu dưới đây mô tả chi tiết triển khai hiện tại.

## Bộ tài liệu

| Tài liệu | Nội dung |
| --- | --- |
| [Kiến trúc hệ thống](docs/ARCHITECTURE.md) | Thành phần, luồng dữ liệu, xác thực, ranh giới triển khai và giới hạn |
| [Mô hình dữ liệu và nghiệp vụ](docs/DATA_MODEL.md) | Schema, quan hệ logic, quy tắc điểm/ngày/trạng thái, cấp số và token QR |
| [Danh mục nghiệp vụ](docs/CATALOGS.md) | Quản lý chương trình tập huấn, đơn vị KDVT và gợi ý khi lập hồ sơ |
| [Hợp đồng API](docs/API.md) | Endpoint, ma trận quyền, request/response, rate limit và import/export |
| [Tích hợp bằng API key](docs/INTEGRATION.md) | Cấp/thu hồi khóa, tra cứu CCCD, response và ví dụ tích hợp |
| [Thiết kế giao diện](docs/UI_DESIGN.md) | Nhận diện mới, màn hình, component, responsive, bàn phím và in |
| [Triển khai và vận hành](docs/OPERATIONS.md) | Bootstrap admin, môi trường, launcher, backup/restore, nâng cấp và sự cố |
| [Xuất bản mã nguồn GitHub](docs/GITHUB.md) | Bản source sạch, loại dữ liệu vận hành/lịch sử cũ, CI và phân biệt repository với hosting |
| [Kiểm thử và nghiệm thu](docs/TESTING.md) | Bộ kiểm tra hồi quy, kết quả đã ghi nhận và checklist còn cần thực hiện |
| [Audit ban đầu](AUDIT-2026-10-21.md) | Bản ghi lịch sử trước sửa; không phải mô tả trạng thái hiện tại |
| [Kết quả sửa lỗi](REMEDIATION-2026-10-21.md) | Thay đổi sau audit, kiểm chứng và giới hạn còn lại |

## Chạy ứng dụng

- Node.js 24.x, khuyến nghị runtime được đóng gói tại `runtime/node.exe` trên Windows.
- Cài dependency bằng `npm ci`, build bằng `npm run build`.
- Chạy production bằng `npm start` hoặc `start.bat`; mở http://127.0.0.1:3000.
- Dừng bằng `stop.bat` cho phiên được launcher quản lý, hoặc Ctrl+C tại cửa sổ server.
- `npm run dev` chạy Express + Vite với HMR, không phục vụ frontend cũ trong dist.
- `npm test` chạy typecheck, build và kiểm thử hồi quy trên database tạm riêng.

Chạy các lệnh từ thư mục project. `start.bat` sử dụng runtime portable nếu có. Khi thiếu bản build, cần npm và node_modules để build đầy đủ cả client/server. Các launcher không tự giết tiến trình đang chiếm cổng; hãy xử lý ứng dụng chiếm cổng hoặc chọn PORT khác.

## Khởi tạo hoặc khôi phục quyền admin

Không còn mật khẩu mặc định hoặc nút đăng nhập demo trong giao diện. Các tài khoản còn dùng mật khẩu mẫu đã công bố sẽ bị vô hiệu hóa ở lần khởi động bản vá đầu tiên. Database và hồ sơ được giữ nguyên. Mật khẩu riêng của tài khoản cũ được giữ và tự nâng hash khi đăng nhập thành công.

Để đặt mật khẩu admin, mở PowerShell trong project, nhập mật khẩu riêng ít nhất 12 ký tự, sau đó chạy:

~~~powershell
$adminSecret = Read-Host 'Mật khẩu admin mới (12–128 ký tự)' -AsSecureString
$env:BOOTSTRAP_ADMIN_PASSWORD = [System.Net.NetworkCredential]::new('', $adminSecret).Password
try { npm start } finally { Remove-Item Env:BOOTSTRAP_ADMIN_PASSWORD -ErrorAction SilentlyContinue }
~~~

Server tạo hoặc đặt lại tài khoản `admin`, nâng quyền SUPERADMIN và kích hoạt tài khoản đó. Không lưu BOOTSTRAP_ADMIN_PASSWORD vào .env dùng hằng ngày. Sau khi dừng phiên khởi tạo, dùng start.bat hoặc npm start bình thường. Superadmin có thể đặt mật khẩu riêng và mở lại các tài khoản khác qua giao diện.

## Cấu hình

Sao chép .env.example thành .env nếu cần thay mặc định:

| Biến | Mặc định / ý nghĩa |
| --- | --- |
| HOST | 127.0.0.1, chỉ nghe trên máy cục bộ |
| PORT | 3000 |
| DATA_DIR | ./db; chứa app.db và các file WAL/SHM |
| TRUSTED_PROXIES | Bỏ trống khi chạy trực tiếp. Chỉ khai báo địa chỉ proxy thực sự được tin cậy. |
| ENABLE_DEMO_DATA | false; chỉ có tác dụng trong development/test, seed theo từng bảng đang rỗng |

Muốn dùng trong LAN cần cấu hình HOST thích hợp. Khi triển khai có reverse proxy: dùng HTTPS ở proxy, chặn truy cập trực tiếp tới backend và khai báo đúng TRUSTED_PROXIES. Không dùng chặn F12 làm hàng rào bảo mật dữ liệu.

## Dữ liệu, backup và phục hồi

- Database vận hành và backups không được theo dõi trong Git. db/app.db đang có trên máy không bị xóa khi áp dụng bản vá.
- Không tự seed hồ sơ/trường mẫu ở production. Tạo cơ sở và tài khoản trường sau khi khởi tạo admin.
- `npm run backup` tạo snapshot SQLite nhất quán vào backups/ và chạy integrity_check. Có thể chỉ định đích mới: `npm run backup -- backups/ten-ban-sao.db`.
- Backup chứa dữ liệu cá nhân và hash mật khẩu; lưu ở nơi có giới hạn truy cập và sao chép sang thiết bị lưu trữ phù hợp.
- Phục hồi: dừng server, sao lưu nguyên trạng thư mục DATA_DIR hiện tại, đặt bản backup đã kiểm tra thành DATA_DIR/app.db trong một thư mục phục hồi mới, đặt DATA_DIR trỏ vào thư mục đó rồi khởi động. Không sao chép đè file db đang mở hoặc ghép app.db với WAL/SHM của database khác.
- Bản vá không tự tính lại điểm/kết quả hồ sơ cũ. Cần đối chiếu các hồ sơ từng được nhập thiếu điểm hoặc điểm 0 trước đây; không thể suy ra điểm đúng từ dữ liệu đã bị ghi sai.
- Audit log giữ tối đa 10.000 sự kiện gần nhất. Backup định kỳ nếu cần lưu lịch sử dài hơn. Log do browser gửi có action CLIENT_EVENT, tách khỏi sự kiện nghiệp vụ tin cậy.

## Đường dẫn và quyền truy cập

| Đường dẫn | Quyền / hành vi |
| --- | --- |
| /lookup | Công khai; CCCD hoặc GPLX + họ tên đầy đủ + ngày sinh |
| /verify-certificate/:token | Công khai khi có token QR, hiển thị số CCCD/GPLX đầy đủ để đối soát |
| /login | Đăng nhập cán bộ |
| /dashboard | Tổng quan sau đăng nhập; chỉ số, biểu đồ 6 tháng, hồ sơ gần đây và GCN sắp hết hạn theo phạm vi tài khoản |
| /certificates | Yêu cầu đăng nhập; tài khoản trường chỉ truy cập trường được gán |
| /schools | Giao diện yêu cầu đăng nhập; chỉ superadmin thêm/sửa. API danh bạ vẫn công khai và không trả token mẫu |
| /admin | Quản lý tài khoản; chỉ superadmin quản lý quyền |
| /admin/security | Cấu hình an ninh và audit log dành cho superadmin |

Tra cứu thường chỉ trả dữ liệu đã che, không trả token QR hoặc địa chỉ chi tiết. Muốn xem đầy đủ cần mã QR trên chứng nhận. Link QR là khả năng truy cập hồ sơ: không đưa danh sách token ra API công khai.

- SUPERADMIN: quản lý toàn hệ thống.
- SCHOOL_ADMIN: phải gắn với trường hợp lệ; tạo/sửa/xem/xuất hồ sơ trường mình, không xóa hồ sơ vĩnh viễn.
- INSPECTOR: đọc/đối soát, không tạo/sửa/nhập/xóa hồ sơ.
- API nội bộ chỉ nhận `Authorization: Bearer <token>`; không nhận session token qua query string.
- Session hết hạn sau 24 giờ, logout hủy ở server; cập nhật mật khẩu/quyền/trạng thái hoặc xóa tài khoản thu hồi các session cũ.
- Session và rate limit lưu trong RAM của từng process; restart yêu cầu đăng nhập lại. Đối soát họ tên/ngày sinh không phải MFA, và token QR không phải chữ ký số.

## Giao diện hiện tại

Trang tra cứu dùng intro và card form tập trung, hỗ trợ đổi loại CCCD/GPLX, loading/lỗi và kết quả đã che. Màn hình đăng nhập có nhận diện riêng, xem/ẩn mật khẩu và không có preset tài khoản. Khu cán bộ dùng sidebar xanh rừng, header/breadcrumb và phong cách bảng/form đồng bộ.

Sidebar rộng 272px trên desktop, chuyển overlay ở màn hình hẹp; form tra cứu đổi bố cục theo container. Màn hình xác thực QR vẫn giữ các nhóm thông tin xếp dọc để đối chiếu trên điện thoại. Token màu, breakpoint, trạng thái màn hình và checklist accessibility được ghi trong [thiết kế giao diện](docs/UI_DESIGN.md).

Sau đăng nhập, hệ thống mở `/dashboard`. Dashboard lấy dữ liệu thật qua API stats, có nút làm mới; chọn chỉ số/trạng thái sẽ mở danh sách đã lọc. Biểu đồ đếm **hồ sơ theo ngày tạo** trong 6 tháng theo giờ Việt Nam, không phải số người duy nhất hay số GCN đã cấp. Khối sắp hết hạn chỉ đếm GCN còn hiệu lực từ hôm nay đến hết ngày thứ 30; lối tắt của khối mở danh sách GCN còn hiệu lực, không tự áp bộ lọc ngày 30 ngày.

## Quy tắc cấp GCN và Excel

- CCCD/GPLX phải có 12 chữ số, ngày sinh hợp lệ và đủ 18 tuổi; trường phải tồn tại và đang hoạt động khi tạo hồ sơ mới.
- Điểm kiểm tra được chuẩn hóa về thang 10, đạt từ 5/10. Điểm trống giữ trạng thái chưa đạt/chưa cấp; điểm 0 không trở thành điểm tối đa.
- Không cho chuyển ISSUED/EXPIRED khi chưa đạt hoặc chưa đủ điều kiện. Hồ sơ không đạt có thể lưu PENDING để bổ sung sau.
- Ngày lưu mới chuẩn ISO YYYY-MM-DD; nhận thêm DD/MM/YYYY khi nhập. Hết hiệu lực sau khi kết thúc ngày validUntil theo giờ Việt Nam.
- Số GCN tự tăng theo năm, không tái sử dụng số đã xóa.
- Dùng mẫu Excel tải từ giao diện. Số định danh nên đặt kiểu Text để giữ số 0 đầu.
- Header export được nhận lại bởi import, không phân biệt hoa/thường cho nhóm thông tin nhân thân/điểm. Tối đa 1.000 dòng mỗi request.
- Import là **tạo hồ sơ mới**, không phải backup/restore: sinh ID, số GCN và token QR mới; không phục hồi trạng thái thu hồi hay lịch sử từ file export. Dùng SQLite backup để phục hồi nguyên trạng.
- Nếu không chọn bỏ qua dòng lỗi, batch sẽ không ghi khi có lỗi; nếu chọn bỏ qua, chỉ lưu những dòng hợp lệ và trả số dòng nhập được cùng chi tiết lỗi.
- Thư viện SheetJS được pin từ CDN chính thức trong package-lock.json; npm registry cũ không cung cấp bản vá tương ứng.

## Cấu trúc kỹ thuật

SUPERADMIN quản lý khóa tại `/admin/api-keys`; ứng dụng được cấp khóa gọi `POST /api/v1/certificates/verify` với header `X-API-Key` và body `{"cccd":"<12 chữ số>"}` hoặc `{"licenseNumber":"<12 chữ số>"}`. Khóa có phạm vi cơ sở/toàn hệ thống, ngày hết hạn, hạn mức và thu hồi tức thời. Khóa gốc chỉ hiện một lần; hướng dẫn đầy đủ trong [tài liệu tích hợp](docs/INTEGRATION.md).

- React 19 + TypeScript + Tailwind 4 + Vite; trang quản lý GCN/Excel được tải theo nhu cầu.
- Express + SQLite native `node:sqlite`; không dùng better-sqlite3.
- server/db.ts quản lý database, server/rules.ts chuẩn hóa ngày và quy tắc đầu vào.
- src/utils/excel.ts chia sẻ ánh xạ header Excel giữa browser và API.
- dist/client/ chỉ chứa tài nguyên web; dist/server.cjs và sourcemap backend nằm ngoài thư mục static.
- scripts/security-regression.mjs kiểm thử HTTP trên database tạm; scripts/auto-test-flow.mjs là entry tương thích dẫn tới cùng bộ test an toàn.
- scripts/serve.mjs và scripts/stop.mjs quản lý phiên server riêng; yêu cầu dừng dùng secret ngẫu nhiên theo phiên và chỉ chấp nhận kết nối loopback.

Khi thay đổi source, cập nhật tài liệu đúng chủ đề và chạy kiểm tra phù hợp theo [hướng dẫn kiểm thử](docs/TESTING.md). Các báo cáo audit/sửa lỗi là bằng chứng theo thời điểm; không tự coi số liệu kiểm tra cũ là kết quả của bản build mới.
