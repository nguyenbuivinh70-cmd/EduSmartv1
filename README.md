# EduSmart V6.75.2

Mô hình Firebase Authentication + Firestore + Google Sheets + Apps Script như dự án ban đầu. Frontend React/Vite dùng trên Google AI Studio và Netlify.

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

Triển khai đồng bộ Code.gs, appsscript.json, firestore.rules và frontend V6.75.2.
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

Đọc Huong_dan_trien_khai_EduSmart_V6.75.2.html trong bộ đầy đủ trước khi triển khai.
36 ca kiểm thử backend/Rules đã đạt; TypeScript và build thành công. Chưa triển khai hoặc kiểm chứng trên dự án Google thực của người dùng.
