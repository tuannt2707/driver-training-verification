# Tra cứu giấy chứng nhận theo CCCD/GPLX bằng API key

Cập nhật: 21/10/2026. Endpoint tích hợp chỉ đọc, dành cho backend các ứng dụng được cấp quyền. Base URL mặc định `http://127.0.0.1:3000`; cổng demo riêng phụ thuộc phiên đang chạy.

## Sử dụng nhanh trên bản xem thử

1. Mở `http://127.0.0.1:31381/admin/api-keys`, đăng nhập SUPERADMIN.
2. Chọn **Cấp API key**, nhập ứng dụng/đơn vị, phạm vi cơ sở, ngày hết hạn và hạn mức, rồi lưu khóa vừa cấp (chỉ hiển thị một lần).
3. Tại **Kiểm tra kết nối**, dán khóa, nhập CCCD có hồ sơ trong database demo, chọn **Kiểm tra API**. Dữ liệu demo và khóa cổng 31381 độc lập với database cổng 3000.
4. Khi tích hợp backend, gửi POST theo ví dụ bên dưới. Không cần đăng nhập tài khoản cán bộ cho mỗi request. Đọc `data` là mảng vì một CCCD có thể có nhiều GCN.

## Cấp và quản lý khóa

Đăng nhập SUPERADMIN, mở **Hệ thống → API tích hợp** (`/admin/api-keys`), chọn **Cấp API key**. Nhập tên ứng dụng, đơn vị sử dụng, phạm vi một cơ sở hoặc toàn hệ thống, ngày hết hạn và hạn mức mỗi phút. Khóa được hiển thị đúng một lần: sao chép vào kho bí mật của backend sử dụng. Hệ thống không có chức năng xem lại khóa gốc.

Khóa có dạng `dtv_` + 64 ký tự hex, sinh ngẫu nhiên 256 bit. Database chỉ lưu SHA-256 và tiền tố nhận diện. Khóa không cấp quyền đăng nhập, sửa hồ sơ, xuất Excel hoặc quản trị hệ thống. Không nhúng vào frontend, URL, mã nguồn hay log; dùng HTTPS khi triển khai ngoài loopback.

Metadata có trạng thái ACTIVE/EXPIRED/REVOKED. Ngoài trạng thái khóa, mỗi request còn kiểm tra tài khoản người cấp vẫn ACTIVE và SUPERADMIN; khóa cũng bị chặn nếu tài khoản người cấp bị xóa, khóa hoặc hạ quyền. Nếu chỉ tạm khóa tài khoản/cơ sở rồi kích hoạt lại, khóa còn hạn chưa thu hồi có thể dùng lại. Thu hồi khóa là vĩnh viễn; để đổi khóa, cấp khóa mới, chuyển ứng dụng sử dụng rồi thu hồi khóa cũ.

### API quản lý (Bearer session SUPERADMIN)

| Method / path | Hợp đồng |
| --- | --- |
| GET `/api/admin/api-keys` | `{success,data:[metadata]}`; không trả secret/hash |
| POST `/api/admin/api-keys` | Body dưới đây; HTTP 201 `{success,apiKey,data:metadata}` |
| DELETE `/api/admin/api-keys/:id` | Thu hồi tức thời, giữ metadata/usage; gọi lại thành công, ID lạ trả 404 |
| GET `/api/admin/api-keys/:id/usage` | `{success,data:[{id,timestamp,ip,httpStatus,resultCount}]}`, 50 request gần nhất |

Ví dụ body cấp khóa (thay thời hạn thành thời điểm thực tế):

```json
{
  "name": "Cổng quản lý vận tải",
  "organization": "Đơn vị được cấp quyền",
  "schoolCode": "MA-CO-SO",
  "expiresAt": "2027-01-31T16:59:59.000Z",
  "rateLimit": 30
}
```

Tên ứng dụng 3–120 ký tự, đơn vị 2–200 ký tự. `schoolCode` phải tồn tại và đang hoạt động; `null` hoặc bỏ trường này nghĩa là toàn hệ thống. `expiresAt` là ngày giờ ISO có múi giờ, trong tương lai, không quá 365 ngày. `rateLimit` là số nguyên 1–120, mặc định 30. Phạm vi, hạn mức và thời hạn được cố định khi cấp; cần thay đổi thì cấp khóa mới.

## Gọi API xác minh

```sh
curl --request POST 'http://127.0.0.1:3000/api/v1/certificates/verify' \
  --header 'Content-Type: application/json' \
  --header 'X-API-Key: <API_KEY_DA_CAP>' \
  --data '{"cccd":"000000000001"}'
```

Chỉ nhận `X-API-Key`; không chấp nhận Bearer session hoặc khóa trong query string. Body chứa **đúng một** trường `cccd` hoặc `licenseNumber`, là **chuỗi đúng 12 chữ số**, giữ số 0 đầu. Không gửi cả hai trường, mảng hoặc tra cứu gần đúng; đầu vào sai trả 400. Phạm vi luôn lấy từ khóa, không thể mở rộng bằng query/body. Mã cơ sở `ALL` được xử lý như mã cơ sở thật, không phải ký hiệu bỏ lọc. Khóa đã cấp còn hạn dùng được cho cả CCCD và GPLX; hai loại tra cứu dùng chung quota.

Tra cứu GPLX dùng cùng endpoint, header và response đầy đủ như CCCD:

```http
POST /api/v1/certificates/verify
Content-Type: application/json
X-API-Key: <API_KEY_DA_CAP>

{"licenseNumber":"000000000002"}
```

Trong PowerShell đổi body thành `@{ licenseNumber = '000000000002' } | ConvertTo-Json`; trong Node.js dùng `JSON.stringify({ licenseNumber: '000000000002' })`. Giao diện **Kiểm tra kết nối** có lựa chọn **Giấy phép lái xe** và ô **Số GPLX**.

Ví dụ PowerShell trên Windows (đặt biến môi trường `DTV_API_KEY` bằng khóa đã được cấp, không đưa khóa thật vào source):

```powershell
$baseUrl = 'http://127.0.0.1:31381'
$headers = @{ 'X-API-Key' = $env:DTV_API_KEY }
$body = @{ cccd = '000000000001' } | ConvertTo-Json
$response = Invoke-RestMethod -Method Post -Uri "$baseUrl/api/v1/certificates/verify" -Headers $headers -ContentType 'application/json' -Body $body
$response.data
```

Ví dụ Node.js, chạy từ backend tích hợp:

```js
const response = await fetch(`${process.env.DTV_BASE_URL}/api/v1/certificates/verify`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-API-Key': process.env.DTV_API_KEY },
  body: JSON.stringify({ cccd: '000000000001' }),
});
const result = await response.json();
if (!response.ok) throw new Error(`HTTP ${response.status}: ${result.error}`);
// result.data: các hồ sơ đầy đủ trong phạm vi của khóa.
```

Ví dụ response minh họa, không phải hồ sơ thực:

```json
{
  "success": true,
  "requestId": "<uuid>",
  "count": 1,
  "total": 1,
  "truncated": false,
  "hasValidCertificate": true,
  "data": [{
    "certificateNumber": "GCN-MAU",
    "qrToken": "<token-cua-chung-nhan>",
    "decisionNumber": "QD-MAU",
    "decisionDate": "01/01/2026",
    "fullName": "HỌ TÊN HỌC VIÊN MẪU",
    "dateOfBirthMasked": "15/01/1990",
    "cccd": "000000000001",
    "cccdMasked": "000000000001",
    "phoneNumberMasked": "*******123",
    "addressMasked": "Địa chỉ học viên mẫu",
    "avatarUrl": "",
    "licenseNumber": "000000000002",
    "licenseNumberMasked": "000000000002",
    "isTokenAccess": true,
    "schoolCode": "MA-CO-SO",
    "schoolName": "Tên cơ sở đào tạo",
    "courseCode": "TH-2026-01",
    "courseName": "Tập huấn nghiệp vụ lái xe",
    "coorganizingUnit": "",
    "transportUnit": "Đơn vị vận tải mẫu",
    "licenseClass": "Hạng B2",
    "examEligibility": "Đủ điều kiện",
    "examScore": "8/10",
    "examResult": "Đạt",
    "trainingStartDate": "28/12/2025",
    "trainingEndDate": "30/12/2025",
    "examDate": "31/12/2025",
    "issueDate": "01/01/2026",
    "validUntil": "01/01/2029",
    "status": "ISSUED",
    "statusLabel": "Đã cấp Giấy chứng nhận",
    "isIssued": true,
    "isExpired": false,
    "isRevoked": false,
    "signatoryName": "Người ký mẫu",
    "signatoryTitle": "Hiệu trưởng",
    "verifiedAt": "2026-10-21T00:00:00.000Z",
    "isValid": true
  }]
}
```

`isValid` chỉ đúng khi trạng thái hiệu lực là ISSUED; PENDING/REVOKED/EXPIRED đều false. Hết hiệu lực sau hết ngày validUntil theo giờ Việt Nam. `hasValidCertificate` xét **tất cả** hồ sơ trùng CCCD hoặc GPLX được gửi trong phạm vi, kể cả khi danh sách trả về bị giới hạn. Đây là kiểm tra dữ liệu trong hệ thống, không phải xác minh chữ ký số của văn bằng.

Trả tối đa 100 hồ sơ, sắp xếp issueDate giảm dần rồi createdAt giảm dần. `count` là số trả về, `total` là tổng trùng khớp, `truncated=true` khi tổng vượt 100; hiện không có phân trang tích hợp. Không có kết quả vẫn HTTP 200, data rỗng và hasValidCertificate=false.

Mỗi phần tử `data` dùng **cùng DTO với GET `/api/public/verify-certificate/:token`**, cộng thêm `isValid` tương thích API tích hợp. CCCD/GPLX, ngày sinh và địa chỉ được trả đầy đủ như xác thực QR; khóa `cccdMasked`, `licenseNumberMasked`, `dateOfBirthMasked`, `addressMasked` giữ tên tương thích nhưng trong luồng này chứa giá trị đầy đủ. Điện thoại vẫn che trong `phoneNumberMasked`, giống QR. Ngày nghiệp vụ được định dạng DD/MM/YYYY; verifiedAt là ISO. `qrToken` và `isTokenAccess=true` cũng giống DTO QR, thể hiện mức chi tiết dữ liệu chứ không có nghĩa request dùng token thay API key. Không trả hàng SQL thô, ID nội bộ, ghi chú quản trị hay hash khóa/mật khẩu.

Có thể mở chứng nhận bằng `${baseUrl}/verify-certificate/${certificate.qrToken}`. Link này cho phép xem hồ sơ đầy đủ mà không cần API key; chỉ chia sẻ cho đối tượng được phép. API key hiện cấp quyền đọc chi tiết trong phạm vi đã chọn cho cả khóa còn hạn được cấp trước thay đổi này.

| HTTP | Ý nghĩa |
| --- | --- |
| 200 | Đã kiểm tra, kể cả không có kết quả |
| 400 | CCCD/GPLX sai kiểu/định dạng, thiếu hoặc gửi cả hai, hoặc JSON không hợp lệ |
| 401 | Thiếu/sai/thu hồi/hết hạn khóa hoặc tài khoản người cấp không còn đủ điều kiện |
| 403 | Cơ sở trong phạm vi khóa bị vô hiệu hóa |
| 429 | Vượt hạn mức theo khóa hoặc IP; xem Retry-After |
| 500 | Lỗi xử lý máy chủ |

## Hạn mức và nhật ký

Endpoint có giới hạn 120 request/phút/IP, thay bộ giới hạn chung 200 request/15 phút. Mỗi khóa có thêm hạn mức 1–120 request/phút, cửa sổ phút cố định UTC lưu SQLite. Bộ đếm khóa và khóa giữ qua restart; limiter IP trong RAM được đặt lại khi restart. Các ứng dụng dùng chung IP chịu chung giới hạn IP.

Request đã xác thực khóa và qua kiểm tra cơ sở được tính vào requestCount/quota, kể cả CCCD sai hoặc vượt quota. Các response theo khóa có `X-RateLimit-Limit`, `X-RateLimit-Remaining`; vượt quota có `Retry-After` tính bằng giây. `X-Request-Id` dùng đối chiếu response và nhật ký sau lớp IP limiter. Lỗi parser/limiter xảy ra trước handler có thể không có mã request riêng.

Usage ghi thời điểm, request ID, IP, HTTP status và số kết quả; không ghi CCCD, body, khóa gốc hoặc nội dung response. Request hợp lệ theo khóa trả 200/400/429 được ghi; lỗi JSON trước handler, khóa không xác thực hoặc cơ sở bị chặn không được ghi trong usage. Giữ tối đa 10.000 dòng toàn hệ thống, UI/API xem 50 dòng gần nhất từng khóa. Cấp và thu hồi có audit event riêng. Backup database bao gồm hash khóa, metadata và usage; quản lý backup như dữ liệu hệ thống nhạy cảm.
