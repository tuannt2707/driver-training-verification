# Kiểm thử và nghiệm thu

Cập nhật: 21/10/2026. Tách kết quả đã quan sát khỏi checklist cần thực hiện khi phát hành. Không chạy thử ghi dữ liệu trên database vận hành.

## Bộ kiểm tra tự động

| Lệnh | Phạm vi |
| --- | --- |
| `npm run lint` | `tsc --noEmit`; tên script là lint nhưng không có ESLint |
| `npm run build` | Typecheck, build Vite vào dist/client, bundle backend bằng esbuild |
| `npm run test:flow` | Chạy bộ hồi quy HTTP/SQLite, cần dist/server.cjs hiện có |
| `npm test` | Build mới rồi chạy test:flow; lệnh kiểm tra tổng hợp nên dùng trước bàn giao |
| `node scripts/auto-test-flow.mjs` | Entry tương thích, dẫn đến cùng bộ hồi quy an toàn |
| `npm audit --json` | Kiểm tra advisory dependency; cần mạng, kết quả phụ thuộc thời điểm registry |

Nguồn bộ hồi quy: `scripts/security-regression.mjs`. Script tạo database trong thư mục tạm hệ điều hành, dùng port rảnh, bootstrap mật khẩu ngẫu nhiên, khởi động backend production làm process con, rồi gọi HTTP thật và kiểm tra SQLite snapshot/hash. Process được dừng trong finally; dữ liệu tạm được giữ để chẩn đoán. Không xóa tự động hoặc sao chép vào DATA_DIR vận hành.

Test giữ nguồn client/server trong checkout hiện tại nhưng ghi database riêng. Nếu chỉ chạy test:flow sau khi sửa code mà chưa build, có thể đang kiểm tra bundle cũ. Không coi kết quả đó là bằng chứng cho source vừa sửa.

## Bao phủ hiện có

Bộ hiện tại thực thi **57 kiểm tra**, gồm các ca trong vòng lặp. Đây là số kiểm tra regression, không phải tỷ lệ bao phủ dòng code hay số test end-to-end trình duyệt.

| Nhóm | Điều được xác nhận |
| --- | --- |
| Xác thực | Token 256 bit, không dùng mật khẩu demo ở production, hash scrypt và nâng hash legacy, vô hiệu mật khẩu mẫu cũ |
| Phiên | Khóa/hạ quyền/đổi mật khẩu thu hồi session; logout hủy token; không nhận session từ query string |
| Phân quyền trường | Không đọc/sửa hồ sơ trường khác; list/stats đúng phạm vi; không tạo school admin thiếu trường hoặc role không hợp lệ |
| Quản trị | Không vô hiệu superadmin hoạt động cuối cùng; trường không đọc audit log; mã trường không đổi để làm mất liên kết |
| Dữ liệu công khai | Chặn list không đăng nhập; che cả khóa gốc; không trả địa chỉ/token QR; danh bạ không lộ sample token |
| Lookup/QR | Không bỏ đối soát, không khớp tên một phần; QR hợp lệ vẫn trả định danh đầy đủ |
| Đầu vào/nghiệp vụ | Phân trang sai bị chặn; ngày sinh sai bị chặn; điểm 0/trống không thành tối đa; không cấp khi chưa đạt |
| Batch Excel | Header xuất đọc lại được; export/import tạo mới; lỗi batch rollback; bỏ lỗi chỉ giữ dòng hợp lệ |
| Số GCN/trạng thái | Xóa hồ sơ không tái dùng số; lọc EXPIRED theo hiệu lực; ngày cuối Việt Nam vẫn có hiệu lực; REVOKED/PENDING được giữ |
| Dashboard | Database trống, 6 tháng đủ/đúng thứ tự, số liệu khớp tổng, DTO không lộ định danh/token, chặn khách, phạm vi trường và biên 30/31 ngày loại PENDING |
| API tích hợp | Cấp khóa ngẫu nhiên/hash một chiều, quyền quản lý, cấu hình sai, phạm vi trường kể cả ALL, 401/403, hết hạn/thu hồi/người cấp bị khóa, quota độc lập/429, usage không ghi CCCD/secret, DTO đầy đủ khớp endpoint QR (trừ verifiedAt) và trạng thái hiệu lực |
| Tính bền vững API key | Giữ khóa/bộ đếm qua restart; giới hạn 100 kết quả vẫn xét hasValidCertificate trên toàn bộ tập trùng khớp |
| Vận hành | Không phục vụ mã backend qua static; header IP giả không tách limiter; API không có trả 404; online backup đọc được và qua integrity_check |
| Audit/dừng server | Client không giả action server; dừng phiên cần secret và kết nối loopback phù hợp |

Một kiểm tra có thể gồm nhiều assertion. Chưa có cơ chế test coverage, kiểm thử fuzz, stress, dependency exploit fixture hoặc CI workflow được cấu hình trong repo.

## Kết quả gần nhất đã ghi nhận

Trong đợt sửa bảo mật và giao diện ngày 21/10/2026:

- `npm test`: typecheck và production build thành công, 49 kiểm tra hồi quy đạt.
- `npm audit --json` sau cập nhật SheetJS: 0 advisory được báo cáo tại thời điểm chạy. Không coi đây là chứng nhận không có lỗ hổng hoặc cam kết cho các lần chạy sau.
- Kiểm tra trực quan trên browser ở viewport khoảng 319px: đã xem trang tra cứu, đăng nhập, sidebar mobile và trang quản trị/học viên; bề ngang trang không vượt viewport ở các màn hình đã đo sau tải.
- Đã xác nhận đăng nhập, đăng xuất, mở menu và điều hướng trên database demo riêng. Chưa có E2E browser hoàn chỉnh xác nhận mọi nhánh nhập ngày sinh và kết quả lookup.

Kết quả trên là lịch sử kiểm tra, không được cập nhật tự động khi source thay đổi. Đợt cập nhật tài liệu không cần chạy lại test ghi dữ liệu nếu không sửa logic ứng dụng; cần kiểm tra liên kết, endpoint và sự khớp giữa nội dung với source.

Sau bổ sung dashboard ngày 21/10/2026, `npm test` đạt build/typecheck và 57 kiểm tra. Mốc 49 phía trên là kết quả trước khi mở rộng stats và dashboard.

Sau bổ sung API key cùng ngày, `npm test` đạt typecheck, production build và **84 kiểm tra hồi quy** trên database tạm riêng. Đã mở trang API tích hợp và biểu mẫu cấp khóa trên browser demo riêng ở viewport khoảng 334px; nội dung không tràn ngang. Chưa cấp khóa qua browser trên database demo/vận hành; luồng cấp, dùng, thu hồi và quota được kiểm tra bằng HTTP trên database kiểm thử cô lập.

Sau yêu cầu trả đầy đủ dữ liệu như xác thực QR, đã chạy lại `npm test`: 84 kiểm tra đạt. Ca đối chiếu DTO so sánh toàn bộ trường của cùng chứng nhận giữa API key và QR, bỏ qua thời điểm verifiedAt và kiểm tra riêng alias isValid.

Ngày 22/10/2026, sau bổ sung tra cứu GPLX bằng `licenseNumber`, `npm test` đạt build/typecheck và **93 kiểm tra**. Các ca mới kiểm tra kết quả đầy đủ, phạm vi trường không bị mở rộng bởi body, không tự fallback sang CCCD, đầu vào thiếu/sai kiểu/mảng/gửi cả hai bị chặn và usage không lưu GPLX. Bộ test chạy ngoài sandbox do sandbox chặn HTTP localhost; database vẫn là thư mục kiểm thử tạm riêng.

## Checklist UI khi phát hành

Ngày 23/10/2026, sửa ngày trống trên form do dữ liệu lịch sử DD/MM/YYYY: `npm test` đạt **126 kiểm tra backend và 8 nhóm kiểm tra render**. Ca mới đối chiếu đủ 9 trường ngày qua list/detail, xác nhận đọc không ghi DB, ngày công khai khớp qua lookup/QR/API key và payload chỉnh sửa lưu lại giữ ngày sinh/hạn/ID/QR. Ngày không hợp lệ được giữ để báo lỗi thay vì chuyển rỗng. Sau backup và restart cổng 3000, hash dữ liệu ngày và liên kết của 8 hồ sơ vận hành không đổi.

Đã mở chính hồ sơ GCN-2026-00007 trên cổng 3000: form hiển thị ngày sinh 20/11/1998, quyết định/ngày cấp 20/10/2026, hạn lịch sử 20/10/2029 và đủ ngày tập huấn/kiểm tra. Chỉ đọc/mở form, không bấm lưu trên database vận hành.

Ngày 23/10/2026, chu kỳ mặc định 5 năm và ẩn bốn trường công khai: `npm test` đạt typecheck/build, **122 kiểm tra backend** và **8 nhóm kiểm tra render công khai**. Bao gồm cộng năm lịch/29-02, ngày Việt Nam, đổi ngày cấp, giữ hạn lịch sử, ưu tiên hạn ngoại lệ, Excel có/không có hạn, ngày sai và hạn trước ngày cấp. Form cổng 3000 xác nhận 23/10/2026 → 23/10/2031; trang QR không còn điện thoại/ngày cấp/người ký/chức danh. Bản sao SQLite trước triển khai và đối chiếu SHA-256 trên id/issueDate/validUntil/status xác nhận cả 8 hồ sơ cũ không đổi. Không tạo hồ sơ thử trên database vận hành.

Ngày 23/10/2026 bổ sung `npm run test:public-view`: 7 nhóm kiểm tra render HTML dùng chung của lookup/QR, gồm ẩn hạng GPLX, giữ DTO đã che, bỏ dòng trống, không điền giá trị giả, hiển thị khoảng ngày một phần, giữ điểm 0 và trạng thái thu hồi. Lệnh này được nối vào cuối npm test.

Đã tra cứu thật trên browser cổng 3000 bằng CCCD + họ tên + ngày sinh, nhận 1 chứng nhận với banner và đủ 4 nhóm thông tin; CCCD/GPLX/điện thoại vẫn che, địa chỉ vẫn ẩn và không có hạng GPLX trên kết quả. Build/typecheck và 7 nhóm kiểm tra render đạt.

Sửa header cửa sổ hồ sơ: build/typecheck đạt; kiểm tra browser cổng 3000 thấy tiêu đề/nút đóng khi mở form và sau cuộn xuống cuối, bấm nút đóng thành công. Không ghi dữ liệu hồ sơ trong lần kiểm tra.

Sau đổi sang combobox gộp tìm/chọn: build/typecheck đạt; kiểm tra browser gõ trực tiếp tên không dấu, chọn đơn vị bằng chuột, chọn chương trình bằng Enter, tìm từ khóa không khớp rồi Escape giữ lại mục đã chọn. Không lưu hồ sơ thử. Các ghi nhận về ô tìm riêng bên dưới thuộc phiên bản trước.

Sau bổ sung ô tìm trong hai danh sách chọn, build/typecheck đạt. Đã kiểm tra browser trên cổng 3000: lọc theo mã, tên không dấu, không tìm thấy vẫn giữ lựa chọn và Enter ở ô tìm không gửi form. Không ghi hồ sơ thử vào database vận hành.

Ngày 22/10/2026, chuyển hai ô chương trình/đơn vị KDVT sang select và lưu ID: `npm test` đạt build/typecheck và **115 kiểm tra**. Bổ sung kiểm tra lưu ID/tên từ server, chặn ID lạ/mục ngừng khi chọn mới, giữ tên lịch sử khi sửa hồ sơ đã liên kết và đổi/bỏ liên kết đơn vị. Đồng thời sửa lỗi trường văn bản tùy chọn NULL trong SQLite khiến cập nhật hồ sơ cũ trả 400.

Đã mở form cấp mới trên cổng 3000 và chọn được chương trình/đơn vị từ hai danh mục thực tế qua select; chưa lưu học viên mới trong kiểm tra giao diện. Mô tả kiểm tra datalist bên dưới thuộc phiên bản trước thay đổi này.

Ngày 22/10/2026, bổ sung danh mục chương trình tập huấn/đơn vị KDVT: `npm test` đạt build/typecheck và **110 kiểm tra**. Các ca mới kiểm tra quyền đọc/ghi, mã trùng không phân biệt hoa/thường, ràng buộc riêng từng danh mục, tìm kiếm, phân trang sai, ID không có, ngừng hoạt động và bảo toàn hồ sơ cũ.

Đã đăng nhập admin trên cổng 3000, mở cả hai trang và biểu mẫu thêm ở viewport 1280px; menu, nhãn và bố cục hiển thị đúng, trang chương trình không tràn ngang. Không tạo bản ghi mẫu trên database vận hành. Luồng lưu/sửa/ngừng được kiểm tra qua HTTP trên database tạm; chưa có E2E tự động cho gợi ý datalist trên điện thoại.

Các mục sau là tiêu chí nghiệm thu cần thực hiện, không đánh dấu mặc định là đã đạt.

- [ ] Desktop 1280/1440px: header/sidebar không chồng nội dung, hero/form đúng hai phần khi đủ bề ngang, bảng có cuộn vùng riêng.
- [ ] Dashboard: mở mặc định sau login, làm mới, trạng thái trống/lỗi, số liệu theo từng vai trò, liên kết KPI/legend đến bộ lọc hồ sơ đúng và biểu đồ không tràn ngang.
- [ ] API tích hợp: cấp/sao chép/đóng secret, thu hồi có xác nhận, lịch sử request, form thử HTTP, loading/lỗi và bảng có dữ liệu dài trên desktop/mobile.
- [ ] Tablet 768px và mobile 320/375/390px: menu, card, modal, ngày sinh và nội dung dài không tràn ngang.
- [ ] Lookup bằng CCCD/GPLX: đúng/sai họ tên, ngày sinh, số định danh; zero/multiple results, 429, mất mạng; định danh trong response vẫn che.
- [ ] Native date input: thao tác thật trên Chrome/Edge và trình duyệt điện thoại; định dạng hiển thị không làm gửi sai ngày.
- [ ] Login: lỗi sai mật khẩu, hiện/ẩn mật khẩu, loading, Enter để submit, khôi phục phiên, server restart và phiên bị thu hồi.
- [ ] Sidebar: Tab/Shift+Tab, Escape, backdrop, đổi trang/bộ lọc, khôi phục focus và khóa cuộn mobile.
- [ ] Hồ sơ: tạo/sửa/PENDING/ISSUED/REVOKED/EXPIRED đúng vai trò; lỗi backend hiện rõ và không làm người dùng tưởng lưu thành công.
- [ ] Excel: file rỗng, quá 1.000 dòng, lỗi cơ bản/lỗi khi lưu, nhập một phần, giữ số 0 đầu, download template/export.
- [ ] QR: hồ sơ hợp lệ/thu hồi/hết hạn/không tồn tại; không làm trạng thái “Đạt” lấn át trạng thái thu hồi.
- [ ] Accessibility: chỉ dùng bàn phím, zoom 200%, contrast, screen reader, reduced motion; không mặc định tuyên bố đạt WCAG từ CSS.
- [ ] In: kiểm tra bản giấy/PDF ở các trạng thái, không có sidebar/header/footer và không mất dữ liệu quan trọng.

## Checklist vận hành

- [ ] Cài từ lockfile trên máy sạch, không dựa vào dist/node_modules có sẵn.
- [ ] Bootstrap password riêng, không để secret trong cấu hình lâu dài; không dùng tài khoản demo với dữ liệu thật.
- [ ] Chạy/dừng launcher đúng phiên; port đang bị chiếm không làm giết ứng dụng khác.
- [ ] Xác minh backup thực tế, diễn tập phục hồi sang DATA_DIR riêng và đối chiếu dữ liệu trước khi chuyển vận hành.
- [ ] Reverse proxy/TLS/firewall/trust proxy đúng cấu hình thực tế; thử trường hợp truy cập bỏ qua proxy.
- [ ] Đo tải dự kiến, số request khi nhiều cán bộ dùng cùng IP/NAT và tác động SQLite đồng bộ.
- [ ] Xác định lịch backup, lưu trữ ngoài máy, audit archive và người xử lý sự cố; hiện chưa có tự động hóa các bước này.
- [ ] Đối chiếu dữ liệu điểm cũ và phạm vi QR/database từng bị công bố nếu có; bản vá không tự khôi phục dữ liệu sai hoặc xóa lịch sử Git.

## Cách báo lỗi tái hiện được

Ghi phiên bản source/build, Node/OS, loại database thử, bước thao tác, vai trò tài khoản, kết quả mong đợi/thực tế và thời điểm. Với API, ghi method/path/status và cấu trúc response đã bỏ dữ liệu nhạy cảm. Không đưa password, bearer token, QR token đang dùng, CCCD/GPLX đầy đủ hoặc bản database thật vào báo lỗi.

Khi thêm quy tắc cấp GCN, thay quyền hoặc DTO công khai, cần thêm ca kiểm thử bảo vệ hành vi tương ứng và cập nhật [API](API.md), [dữ liệu](DATA_MODEL.md) cùng [thiết kế giao diện](UI_DESIGN.md) nếu có thay đổi nhìn thấy được.
