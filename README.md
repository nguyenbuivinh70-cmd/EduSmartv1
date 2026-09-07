# EduSmart V6.75.4

Mô hình Firebase Authentication + Firestore + Google Sheets + Apps Script như dự án ban đầu. Frontend React/Vite dùng trên Google AI Studio và Netlify.


## V6.75.4 - Tương thích truy cập bài học legacy

### Bổ sung V6.75.4
- Khắc phục trường hợp Rules vẫn từ chối `content/main` sau V6.75.3 do `access_start_at` / `access_end_at` legacy không phải Firestore Timestamp.
- Rules chỉ áp dụng so sánh thời gian ở server khi field là Timestamp; dữ liệu mới vẫn được bảo vệ đầy đủ.
- Hỗ trợ hồ sơ thành viên legacy dùng `lop_id` / `khoi` và tự chuẩn hóa sang `classId` / `grade` khi chính chủ đăng nhập.
- Hỗ trợ khối `6`, `6.0`, số 6 (tương tự 7–9).
- Khi còn lỗi, frontend phân biệt rõ bị chặn ở metadata hay ở `content/main` thay vì chỉ báo permission-denied chung.


- Firestore Rules chấp nhận dữ liệu khối legacy lưu dạng số (`9`) và schema mới dạng chuỗi (`"9"`) khi kiểm tra audience, studentRoster, học cùng và tiến độ.
- Nội dung bài học đã duyệt chỉ chặn khi `content_status = preparing`; các trạng thái legacy khác không còn gây `permission-denied` nếu bài đúng khối/lớp, đang mở khóa và trong thời gian học.
- Danh sách học cùng đọc được cả `grade` dạng chuỗi và số; lỗi tải danh sách học cùng không chặn lựa chọn **Học một mình**.
- Thông báo `permission-denied` không còn ghi nhầm rằng mọi lỗi đều do tài khoản giáo viên.
- Không thay đổi Google Sheet hoặc nghiệp vụ Apps Script; chỉ cần cập nhật frontend và Firestore Rules cho lỗi này.

## Chạy trên máy

Trong thư mục có package.json, dùng Node.js 24:

```sh
npm ci
npm run lint
npm run build
npm run dev
```

Bản build ở dist. Netlify dùng npm run build, publish dist (đã có netlify.toml).

## Cấu hình

Firebase project/school: hthtv1, giữ theo mã nguồn người dùng cung cấp.
Firebase web config ở src/services/firebase.ts.
BACKEND_URL ở src/constants.ts; dùng URL Web App kết thúc /exec.

Với bản vá V6.75.4 này, triển khai đồng bộ **frontend + firestore.rules**. Code.gs, appsscript.json và Google Sheet V6.75.2 hiện tại không cần thay đổi.
Indexes đi kèm giữ cấu trúc V6.75.0; dùng Google Sheet hiện có, không nhập đè dữ liệu.
Bản này bỏ yêu cầu liên kết dự án Google Cloud riêng, vai trò IAM, service account và Cloud Functions.
Backend xác minh Firebase ID token của quản trị viên và truy cập dữ liệu theo Firestore Rules.
Sheets/Drive dùng các dịch vụ Apps Script có sẵn và quyền Google thông thường của người triển khai.

## Quản lý tài khoản

Tạo mới: Firebase Auth REST bằng web API key, ghi hồ sơ Firestore.
Sửa họ tên, lớp, khối, vai trò và khóa trong ứng dụng: Firestore.
Tên đăng nhập/mã học sinh được giữ cố định sau khi tạo.
Đổi/reset mật khẩu: xác thực mật khẩu hiện tại của tài khoản; không lưu mật khẩu nhập vào.
Khi không nhập mật khẩu, backend có thể thử một lần giá trị cũ trong Sheet hoặc mã học sinh theo chính sách mật khẩu ban đầu. Sai mật khẩu thì dừng, không tạo lại danh tính và không báo thành công.
Quên mật khẩu: chế độ này không có quyền ép reset Auth của người khác. Email định danh nội bộ không nhận được thư reset. Không xóa/tạo lại Auth để reset vì sẽ đổi UID và có thể mất liên kết học tập.
Xóa: dùng xác thực hiện tại hoặc xóa Auth trong Firebase Console rồi xác nhận để dọn dữ liệu. Kết quả phân biệt xóa bằng API với xác nhận thủ công.
Dữ liệu bài học, kết quả, nhóm và tham chiếu được dọn theo schema của bộ mã nguồn này. Tệp Drive được chuyển vào Thùng rác, chưa xóa vĩnh viễn.

kiemTraCauHinhQuanTri trong trình soạn thảo kiểm tra Sheet/Drive; Firebase được ghi not_tested vì không có phiên đăng nhập web app trong trình soạn thảo.

Đọc `HUONG_DAN_TRIEN_KHAI_V6.75.4.txt` đi kèm bản vá trước khi triển khai.
Mã nguồn giữ nguyên kiến trúc V6.75.2 và chỉ thay đổi luồng truy cập học sinh/Rules. Cần triển khai `firestore.rules` V6.75.4 trước khi kiểm thử thực tế trên Firebase project của trường.
