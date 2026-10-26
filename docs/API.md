# Hợp đồng API hiện tại

Cập nhật: 21/10/2026. Nguồn: `server.ts`, `server/integration.ts`. Base URL mặc định: `http://127.0.0.1:3000`. API tích hợp dùng `/api/v1`; API giao diện giữ đường dẫn hiện tại.

## Quy ước chung

- Request dữ liệu dùng `Content-Type: application/json`; giới hạn parser 10 MB. API import nhận JSON rows, không nhận multipart workbook.
- API quản trị nhận `Authorization: Bearer <session-token>`; API tích hợp nhận `X-API-Key`. Không truyền khóa/phiên trong query string. Token QR ở path là loại token khác.
- Các endpoint tạo/sửa thông thường trả HTTP 200; cấp API key trả 201. Một số lỗi chỉ trả `{ "error": "..." }`; không giả định mọi response đều có khóa `success`.
- HTTP thường gặp: 400 đầu vào sai, 401 thiếu/hết/thu hồi phiên, 403 sai quyền, 404 không tìm thấy, 409 trùng dữ liệu, 413 body quá lớn, 429 quá giới hạn, 500 lỗi xử lý.
- HTTP 200 chưa đủ kết luận import thành công: luôn đọc `success`, `importedCount`, `errors`, `errorDetails`.
- Backend đặt no-store/no-cache, `nosniff`, SAMEORIGIN và referrer policy. Ứng dụng không tự cấp HTTPS.

| Bộ giới hạn theo IP | Mức hiện tại |
| --- | --- |
| Toàn bộ `/api/` thông thường | 200 request / 15 phút |
| Xác thực QR và public lookup, dùng chung limiter | 30 request / phút |
| Login | 15 request / 15 phút |
| Sự kiện browser | 10 request / phút, đồng thời chịu giới hạn chung |
| POST `/api/v1/certificates/verify` | 120 request / phút / IP, thay giới hạn chung; thêm 1–120 request / phút / key (mặc định 30) |

Limiter theo IP lưu trong RAM của process. Hạn mức theo API key lưu trong SQLite, cửa sổ phút cố định theo UTC và giữ qua restart. Endpoint dừng nội bộ có cơ chế riêng và đăng ký trước limiter chung.

## Ma trận endpoint

Hai nhóm endpoint danh mục mới `/api/admin/training-programs` và `/api/admin/transport-units` hỗ trợ GET (S/T/I), POST và PUT `/:id` (chỉ S). GET có tìm kiếm/phân trang/trạng thái, POST trả 201. Hợp đồng đầy đủ và ví dụ: [CATALOGS.md](CATALOGS.md).

S = SUPERADMIN, T = SCHOOL_ADMIN có trường, I = INSPECTOR. “Theo trường” là phạm vi `schoolCode` trong user hiện hành.

| Method / path | Truy cập | Kết quả |
| --- | --- | --- |
| GET `/api/public/verify-certificate/:token` | Công khai có QR token | `{success,data}`; CCCD/GPLX đầy đủ |
| POST `/api/public/lookup` | Công khai, đối soát đầy đủ | `{success,count,data}`; DTO đã che |
| GET `/api/public/schools` | Công khai | `{success,count,data}`; `sampleToken` rỗng |
| GET `/api/public/security-config` | Công khai | `{success,data}`; cờ giao diện và watermark |
| POST `/api/security/log-event` | Công khai, có limiter riêng | `{success:true}`; ghi CLIENT_EVENT |
| POST `/api/auth/login` | Công khai | `{success,token,user}` |
| POST `/api/auth/logout` | S/T/I | Hủy token hiện tại |
| GET `/api/auth/me` | S/T/I | `{success,user}` từ database hiện hành |
| GET `/api/admin/stats` | S/T/I; T theo trường | `{success,data}` thống kê, chuỗi 6 tháng, sắp hết hạn và hồ sơ gần đây |
| GET `/api/admin/certificates` | S/T/I; T theo trường | `{success,items,total}` |
| GET `/api/admin/certificates/:id` | S/I toàn hệ thống; T theo trường | `{success,data}` hồ sơ nội bộ |
| POST `/api/admin/certificates` | S/T; T bị gán trường từ session | `{success,data}` hồ sơ mới |
| PUT `/api/admin/certificates/:id` | S/T; T theo trường | `{success,data}` hồ sơ sau sửa |
| DELETE `/api/admin/certificates/:id` | S | Xóa vĩnh viễn hồ sơ |
| GET `/api/admin/certificates/sample-excel` | Công khai | Tệp `.xlsx` mẫu |
| GET `/api/admin/certificates/export-excel` | S/I toàn hệ thống; T theo trường | Tệp `.xlsx`, có định danh đầy đủ và token QR |
| POST `/api/admin/certificates/import-excel` | S/T; T theo trường | Báo cáo nhập theo dòng |
| POST `/api/schools` | S | `{success,data}` cơ sở mới |
| PUT `/api/schools/:id` | S | `{success,data}`; hỗ trợ ngừng hoạt động |
| GET `/api/admin/users` | S | `{success,data}` danh sách user, không có passwordHash |
| POST `/api/admin/users` | S | `{success,data}` user mới |
| PUT `/api/admin/users/:id` | S | `{success,data}`; thu hồi phiên user đó |
| DELETE `/api/admin/users/:id` | S | Xóa user, thu hồi phiên; không xóa user `admin` |
| GET `/api/admin/security-settings` | S | `{success,data}` toàn bộ cấu hình |
| POST `/api/admin/security-settings` | S | `{success,data}` cấu hình cập nhật |
| GET `/api/admin/audit-logs` | S | `{success,data}` tối đa 100 sự kiện gần nhất |
| GET `/api/admin/api-keys` | S | Metadata các khóa; không trả hash/khóa gốc |
| POST `/api/admin/api-keys` | S | HTTP 201 `{success,apiKey,data}`; khóa gốc chỉ trả một lần |
| DELETE `/api/admin/api-keys/:id` | S | Thu hồi ngay, giữ lịch sử; lặp lại vẫn thành công |
| GET `/api/admin/api-keys/:id/usage` | S | Tối đa 50 request gần nhất của khóa |
| POST `/api/v1/certificates/verify` | X-API-Key hợp lệ | Tra cứu một CCCD hoặc GPLX trong phạm vi được cấp; mỗi hồ sơ là DTO xác thực QR đầy đủ + isValid |
| POST `/api/internal/stop` | Loopback + secret launcher | Chỉ tồn tại khi có APP_STOP_TOKEN; đóng server sau response |

Alias Excel còn được hỗ trợ: `/api/admin/sample-excel`, `/api/admin/export-excel`, `/api/admin/import-excel`. Không có API xóa cơ sở, rotate QR, đổi mật khẩu tự phục vụ, health check chuyên dụng hoặc phân trang audit log.

## Đăng nhập và quản lý user

Hợp đồng cấp khóa, ví dụ gọi và response API tích hợp: [INTEGRATION.md](INTEGRATION.md). Khóa API chỉ có quyền đọc chứng nhận qua endpoint tích hợp, không thay thế Bearer session của cán bộ.

Login body: `{ "username": "<tên được cấp>", "password": "<mật khẩu riêng>" }`. Token session là chuỗi hex 64 ký tự, sống tối đa 24 giờ từ lúc đăng nhập. Không dùng token session thay cho QR token hoặc ngược lại.

Tạo user: `username`, `password`, `fullName`, `role`; với T cần `schoolCode`. Username chấp nhận 3–64 ký tự chữ Latin/số/`.`/`_`/`-`, được lưu chữ thường. Mật khẩu mới 12–128 ký tự; không có fallback mật khẩu chung. Role chỉ nhận ba giá trị trong ma trận; status nhận ACTIVE/DISABLED.

PUT user hỗ trợ `fullName`, `role`, `schoolCode`, `schoolName`, `status`, `password`. Bỏ khóa password nếu giữ nguyên; không gửi chuỗi rỗng. Không cho hạ quyền/khóa superadmin hoạt động cuối cùng qua PUT. API cập nhật thông tin thường cũng thu hồi các phiên của user được cập nhật.

## Public lookup và QR

Ví dụ đầu vào tổng hợp, chỉ dùng để minh họa cấu trúc:

```json
{
  "lookupType": "cccd",
  "cccd": "000000000001",
  "fullName": "HỌ TÊN HỌC VIÊN MẪU",
  "dateOfBirth": "1990-01-15"
}
```

Nhánh GPLX dùng `lookupType: "license"` và `licenseNumber` thay cho `cccd`. Không hỗ trợ fallback chỉ số giấy tờ, `searchKey` hoặc số GCN ở endpoint này. Tên được bỏ dấu, chuẩn hóa hoa/thường/khoảng trắng rồi so đầy đủ. Ngày sinh được chuẩn hóa trước khi so sánh.

Response công khai giữ một số tên khóa cũ: `cccd` **và** `cccdMasked` đều đã che; `licenseNumber` **và** `licenseNumberMasked` đều đã che; `qrToken` là chuỗi rỗng; `addressMasked` là thông báo đã ẩn. Không có match hợp lệ thì HTTP 200, `count=0`, `data=[]`.

QR endpoint dùng token 40 ký tự hex do hệ thống sinh. Khi tìm thấy, `isTokenAccess=true`, CCCD/GPLX và địa chỉ chi tiết được trả để đối soát; điện thoại vẫn che. Các khóa dạng `dateOfBirthMasked` là tên tương thích, không có nghĩa mọi giá trị ngày bị ẩn. GCN PENDING/EXPIRED/REVOKED vẫn trả hồ sơ cùng trạng thái tương ứng; token không tồn tại trả 404.

## Danh sách và hồ sơ chứng nhận

API quản trị list/detail chuẩn hóa 9 trường ngày hồ sơ sang YYYY-MM-DD khi đọc dữ liệu cũ DD/MM/YYYY: ngày sinh, cấp CCCD/GPLX, quyết định, cấp GCN, hết hạn, bắt đầu/kết thúc tập huấn và ngày kiểm tra. Đây là chuyển đổi DTO, không sửa database khi đọc. Ngày cũ không hợp lệ không bị xóa âm thầm; form báo lỗi và backend tiếp tục validate khi lưu. DTO công khai/QR/API key tiếp tục định dạng ngày hiển thị như trước.

Chu kỳ mặc định từ 23/10/2026 là 5 năm kể từ issueDate (29/02 được chặn về 28/02 khi cần). POST/import không gửi hạn sẽ tính mặc định; hạn ngoại lệ hợp lệ luôn được giữ. PUT chỉ thay ngày cấp mà không gửi validUntil sẽ tính lại 5 năm; sửa thông tin khác giữ hạn cũ. Không có migration gia hạn các GCN đã lưu. Việc ẩn điện thoại/ngày cấp/người ký/chức danh trong giao diện công khai không loại các khóa này khỏi JSON API tích hợp.

### Dữ liệu dashboard

GET `/api/admin/stats` không nhận bộ lọc mở rộng phạm vi bằng query. Trường được xác định từ session của SCHOOL_ADMIN. Cấu trúc data:

| Trường | Ý nghĩa |
| --- | --- |
| totalDrivers | Tên khóa tương thích: tổng **hồ sơ**, không phải số người duy nhất |
| issuedCount / pendingCount / expiredCount / revokedCount | Số hồ sơ theo trạng thái hiệu lực hiện tại |
| schoolCount | Số cơ sở trong phạm vi; toàn hệ thống gồm cả cơ sở ngừng hoạt động |
| recentCertificates | Tối đa 5 hồ sơ tạo gần nhất, DTO đã che và qrToken rỗng |
| createdByMonth | 6 object `{month: "YYYY-MM", count: number}` theo thứ tự tăng dần, gồm tháng hiện tại; tháng không có hồ sơ trả 0 |
| expiringSoonCount | GCN còn hiệu lực có validUntil từ ngày VN hôm nay đến hết ngày thứ 30, bao gồm cả hai đầu |
| generatedAt | ISO timestamp lúc tổng hợp dữ liệu, dùng hiển thị lần cập nhật |

createdByMonth nhóm theo createdAt quy đổi UTC+7, không nhóm theo issueDate và không chỉ đếm ISSUED. Bản ghi cũ có createdAt không parse được không được tính vào biểu đồ tháng; vẫn có thể nằm trong tổng hồ sơ. Các trường mở rộng vẫn giữ các khóa stats cũ để trang quản lý GCN tiếp tục dùng.

### Danh sách và ghi hồ sơ

Query của GET list:

| Tham số | Quy ước |
| --- | --- |
| `limit`, `offset` | Số nguyên; limit 1–200, mặc định 50; offset >=0, mặc định 0 |
| `schoolCode`, `status`, `courseCode` | Bộ lọc; ALL bỏ lọc. Với T, schoolCode bị thay bằng trường trong session |
| `search` | LIKE trên tên, CCCD, GPLX, số GCN, mã khóa; không phải kiểm tra chính xác kiểu public lookup |
| `startDate`, `endDate` | Chuỗi ISO cho bộ lọc ngày; caller nên validate trước khi gửi |
| `dateType` | issueDate / validUntil / examDate / decisionDate; giá trị khác rơi về issueDate |

Kết quả sắp xếp theo createdAt giảm dần. `status` dùng trạng thái hiệu lực, không chỉ cột status đã lưu.

POST/PUT hồ sơ nhận trường theo `DriverCertificate` và input address string/object; các điều kiện bắt buộc, chấm điểm, ngày và trạng thái nằm trong [mô hình dữ liệu](DATA_MODEL.md). Khi sửa, `id`, `qrToken`, `certificateNumber`, `createdAt`, `createdBy` không thuộc các cột được UPDATE; không dùng PUT để đổi số GCN hoặc QR. Backend vẫn validate đầu vào được gửi, nên nên bỏ các trường không sửa.

Mẫu tối thiểu tạo thủ công, cần thay mã trường bằng cơ sở đang có:

```json
{
  "fullName": "HỌ TÊN HỌC VIÊN MẪU",
  "dateOfBirth": "1990-01-15",
  "cccdNumber": "000000000001",
  "licenseNumber": "000000000002",
  "licenseClass": "Hạng B2",
  "schoolCode": "MA-CO-SO",
  "courseCode": "TH-2026-01",
  "courseName": "Tập huấn nghiệp vụ lái xe kinh doanh vận tải",
  "examScore": "8/10",
  "examEligibility": "Đủ điều kiện kiểm tra"
}
```

Không truyền certificateNumber thì server cấp số. Nhập quyết định, người ký và ngày thực tế cho hồ sơ vận hành; mẫu tối thiểu trên không khẳng định đủ hồ sơ pháp lý để cấp thật.

## Import/export Excel

Browser đọc workbook bằng SheetJS, chuẩn hóa header và gửi:

```json
{
  "schoolCode": "MA-CO-SO",
  "courseCode": "TH-2026-01",
  "courseName": "Tập huấn nghiệp vụ lái xe kinh doanh vận tải",
  "importValidOnly": false,
  "rows": [
    {
      "Họ và tên": "HỌ TÊN HỌC VIÊN MẪU",
      "Ngày sinh": "15/01/1990",
      "Số CCCD": "000000000001",
      "Số GPLX": "000000000002",
      "Điểm Kiểm Tra": "8/10"
    }
  ]
}
```

`rows` có 1–1.000 object. Với S nên chỉ định `Mã Cơ Sở` từng dòng hoặc `schoolCode` cấp batch; không dựa vào mã trường mẫu legacy. Với T, trường luôn lấy từ session.

Các nhóm header có ánh xạ chung không phân biệt hoa/thường: họ tên, ngày sinh, CCCD, GPLX, điện thoại, điểm. Những cột còn lại được nhận theo alias cụ thể trong code/mẫu Excel, không có cam kết bỏ dấu hoặc không phân biệt hoa/thường cho mọi cột. Bước import có thể thêm số 0 đầu cho CCCD/GPLX chỉ còn 11 chữ số; vẫn cần đối chiếu giấy tờ vì không chứng minh được số gốc.

| Tình huống | HTTP / cách đọc |
| --- | --- |
| Sai thông tin cơ bản và chưa chọn bỏ lỗi | 400, có `errorDetails`, không ghi batch |
| Lỗi khi validate/lưu dòng, chưa chọn bỏ lỗi | 200, `success=false`, `importedCount=0`, rollback batch, xem `errors` |
| Chọn bỏ lỗi | 200, giữ dòng hợp lệ; đọc importedCount và cả hai nhóm lỗi. Có lỗi lưu dòng thì success có thể false dù đã nhập một phần |
| Tất cả dòng hợp lệ | 200, success true, importedCount bằng số dòng được tạo |

`validCount`/`errorCount` phản ánh bước kiểm tra cơ bản, không bao gồm mọi lỗi phát sinh khi lưu. Không lấy `errorCount` làm tổng lỗi cuối nếu chưa đọc `errors`.

Import luôn tạo bản ghi mới và token/số GCN mới; không upsert, không khôi phục quyết định/trạng thái/QR từ export. Export trả tất cả hồ sơ được quyền đọc, không dùng bộ lọc hiện tại của trang quản lý. File export có dữ liệu đầy đủ, cần quản lý quyền truy cập tương ứng.

## Cấu hình và audit

API public config chỉ trả antiF12Enabled, disableRightClick, detectDevTools, watermarkText. Cấu hình UI không cấp quyền xem dữ liệu; sửa các cờ legacy về mask/đối soát không vô hiệu hóa kiểm tra bắt buộc ở API.

Client event nhận `action` tối đa 64 ký tự, `target` tùy chọn tối đa 128 ký tự; server lưu action CLIENT_EVENT và reportedAction trong details. Nội dung details tùy ý do client gửi không được ghi nguyên trạng. Audit log trả details dưới dạng chuỗi JSON hoặc null; caller cần parse khi muốn hiển thị cấu trúc.

Chi tiết vận hành token, proxy và dữ liệu: [OPERATIONS.md](OPERATIONS.md).
