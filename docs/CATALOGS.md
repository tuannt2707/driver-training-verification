# Chương trình tập huấn và đơn vị kinh doanh vận tải

Cập nhật: 22/10/2026. Hai danh mục dùng chung toàn hệ thống, không tự tạo dữ liệu mẫu hoặc chuyển đổi hồ sơ cũ.

## Sử dụng

Trong nhóm **Nghiệp vụ** của sidebar:

- **Chương trình tập huấn** (`/training-programs`): quản lý mã, tên, nội dung/mô tả và thời lượng giờ.
- **Đơn vị kinh doanh vận tải** (`/transport-units`): quản lý mã, tên, mã số thuế, số giấy phép KDVT, địa chỉ, điện thoại, email và người liên hệ.

SUPERADMIN thêm/sửa và đổi trạng thái. SCHOOL_ADMIN và INSPECTOR có quyền xem, tìm kiếm danh mục dùng chung; không được sửa kể cả gọi API trực tiếp. Người chưa đăng nhập không được truy cập. API key tra cứu chứng nhận không có quyền dùng API quản lý danh mục.

Chọn **Thêm chương trình/đơn vị**, nhập mã và tên bắt buộc, bổ sung thông tin còn lại rồi lưu. Mã 2–64 ký tự Latin/số/dấu chấm/gạch ngang/gạch dưới, bắt đầu bằng chữ hoặc số; được chuẩn hóa viết hoa, không trùng mã trong cùng danh mục. Tên 2–250 ký tự. Thời lượng nhận chuỗi số giờ nguyên 1–1000 hoặc rỗng; không phải thời gian thực tế của từng lớp. Mã số thuế có 10 hoặc 13 chữ số, hỗ trợ dấu gạch trước 3 số chi nhánh. Email/điện thoại nếu nhập phải hợp lệ.

Để ngừng dùng, chọn biểu tượng sửa, đặt **Ngừng sử dụng**, lưu. Có thể bật lại. Không có thao tác xóa vĩnh viễn. Bộ lọc trạng thái cho xem cả các mục đã ngừng. Tìm theo mã hoặc tên, 25 dòng mỗi trang trên giao diện.

## Dùng trong hồ sơ chứng nhận

Form tạo/sửa học viên có hai **danh sách chọn** Chương trình tập huấn và Đơn vị kinh doanh vận tải, hiển thị [MÃ] Tên đầy đủ từ danh mục đang hoạt động. Không nhập tên tự do. Chương trình bắt buộc chọn khi tạo mới, đơn vị KDVT có thể để “Chưa chọn đơn vị”. Danh sách được nạp đủ qua phân trang API; nếu tải lỗi có nút tải lại.

Mỗi danh mục dùng một combobox: gõ trực tiếp trong ô đang chọn để lọc mã/tên, không phân biệt hoa/thường và dấu tiếng Việt. Không có ô tìm riêng. Chọn bằng chuột hoặc ↑/↓ và Enter; Escape hoặc rời ô sẽ hủy từ khóa và giữ lựa chọn cũ. Chỉ chọn kết quả trong danh mục mới thay ID; gõ tên tự do không tạo liên kết. Nút × bỏ lựa chọn; chương trình bắt buộc chọn lại trước khi lưu. Enter trong combobox không gửi form hồ sơ.

Hồ sơ lưu `trainingProgramId` liên kết chương trình và `transportUnitId` liên kết đơn vị KDVT. Backend kiểm tra ID tồn tại/đang hoạt động khi chọn mới và tự lấy tên vào `courseName`/`transportUnit`; không tin tên do client tự gửi. Chương trình không phải lớp: `courseCode` vẫn là mã lớp và không tự đổi theo mã chương trình. Không tự điền ngày tập huấn, điểm hoặc điều kiện cấp. API/import Excel cũ vẫn nhận văn bản khi không gửi ID để giữ tương thích.

Đổi tên, đổi mã hoặc ngừng danh mục **không cập nhật ngược hồ sơ đã lưu**. Khi sửa hồ sơ giữ nguyên ID, tên lịch sử được giữ kể cả mục đã ngừng. Đổi sang ID khác sẽ lấy tên của mục mới. Hồ sơ cũ chưa có ID được hiển thị là “hồ sơ cũ, chưa liên kết”, có thể giữ nguyên hoặc chọn lại từ danh mục. Không tự ghép tên lịch sử vào danh mục vì có thể trùng tên. Đây là quan hệ logic kiểm tra trong ứng dụng, chưa có SQL FOREIGN KEY, báo cáo theo catalog ID hoặc chức năng hợp nhất tên cũ.

POST/PUT hồ sơ hỗ trợ `trainingProgramId`, `transportUnitId` (chuỗi ID). ID lạ/sai kiểu hoặc mục ngừng khi liên kết mới trả 400. Để bỏ liên kết đơn vị, gửi `transportUnitId: ""` và `transportUnit: ""`. Hai ID chỉ trả trong API quản trị, không thêm vào DTO công khai/QR/API key. Migration thêm hai cột TEXT mặc định rỗng vào certificates, bảo toàn dữ liệu cũ.

## API quản trị

Tất cả route yêu cầu `Authorization: Bearer <session-token>`, nhận JSON và chịu limiter chung.

| Method | Path | Quyền / response |
| --- | --- | --- |
| GET | `/api/admin/training-programs` | S/T/I, `{success,data,total}` |
| POST | `/api/admin/training-programs` | S, HTTP 201 `{success,data}` |
| PUT | `/api/admin/training-programs/:id` | S, cập nhật từng phần, HTTP 200 |
| GET | `/api/admin/transport-units` | S/T/I, `{success,data,total}` |
| POST | `/api/admin/transport-units` | S, HTTP 201 `{success,data}` |
| PUT | `/api/admin/transport-units/:id` | S, cập nhật từng phần, HTTP 200 |

GET nhận `search` (mã/tên, tối đa 250 ký tự), `status` ALL/ACTIVE/DISABLED, `limit` nguyên 1–200 (mặc định 50), `offset` nguyên >=0 (mặc định 0). Sắp xếp mục hoạt động trước rồi tên và ID. `data` là trang hiện tại, `total` là tổng sau lọc. Không lọc theo cơ sở vì đây là danh mục dùng chung.

Ví dụ tạo chương trình:

```json
{"code":"CT-01","name":"Tập huấn nghiệp vụ lái xe","description":"Nội dung chương trình","durationHours":"16","isActive":true}
```

Ví dụ tạo đơn vị:

```json
{"code":"DV-01","name":"Đơn vị vận tải mẫu","taxCode":"0123456789","businessLicense":"GP-MAU","address":"Địa chỉ đơn vị","phone":"02812345678","email":"contact@example.test","contactPerson":"Đầu mối đơn vị","isActive":true}
```

Các trường tùy chọn mặc định chuỗi rỗng, trạng thái mặc định true. PUT chỉ thay các trường đã gửi; `id`, createdAt/updatedAt do server quản lý. Sai đầu vào 400, thiếu phiên 401, sai quyền ghi 403, ID không có 404, mã trùng 409. Không nhận số JSON cho durationHours/phone/taxCode; gửi chuỗi để giữ số 0 đầu.

## Lưu trữ và vận hành

`server/catalogs.ts` tạo bổ sung hai bảng khi server khởi động bằng CREATE TABLE IF NOT EXISTS, không xóa bảng cũ:

| Bảng | Cột |
| --- | --- |
| training_programs | id PK, code UNIQUE COLLATE NOCASE, name, description, durationHours, isActive, createdAt, updatedAt |
| transport_units | id PK, code UNIQUE COLLATE NOCASE, name, taxCode, businessLicense, address, phone, email, contactPerson, isActive, createdAt, updatedAt |

Trường văn bản lưu TEXT, isActive INTEGER; DTO trả boolean. Không khai báo FOREIGN KEY. Tạo/sửa ghi audit CREATE/UPDATE_TRAINING_PROGRAM hoặc TRANSPORT_UNIT, gồm người thực hiện, mã và trạng thái khi sửa; không ghi toàn bộ nội dung liên hệ vào audit. Backup SQLite bao gồm hai bảng mới. Sau build cần restart backend để có schema/route mới; các phiên cán bộ cần đăng nhập lại.
