# EduSmart V6.88.4 — Reliable Lesson Publish Capability

## 1. Lỗi được xử lý

Ở V6.88.3, nút **Xuất bản bài học** có thể dừng ngay tại `PUBLISH_PREFLIGHT` vì frontend bắt buộc ghi/xóa một probe có trường `rulesVersion: 6.88.3`. Khi Rules live khác bộ dự kiến hoặc thao tác xóa probe thất bại, giao diện kết luận rằng không có quyền xuất bản dù bài học có thể hoàn toàn hợp lệ.

V6.88.4 chuyển sang capability ổn định `lesson_publish_v2` và kiểm tra quyền theo đúng khối bài học.

## 2. Quy trình mới

`Đăng nhập → tải lại member → kiểm tra role → kiểm tra khối → capability lesson_publish_v2 → transaction registry + lesson metadata → content/main → activities → content_status=ready`.

Nếu content thất bại, cơ chế rollback hiện hữu vẫn được giữ để không tạo bài học hoặc số bài dở dang.

## 3. Mã chẩn đoán mới

- `PUBLISH_AUTH_REQUIRED`: chưa có phiên Firebase.
- `PUBLISH_ACCOUNT_INACTIVE`: tài khoản bị khóa/chưa kích hoạt.
- `PUBLISH_PROFILE_INVALID`: hồ sơ Firebase không hợp lệ.
- `PUBLISH_ROLE_DENIED`: không phải admin/teacher.
- `PUBLISH_GRADE_SCOPE_DENIED`: giáo viên không được phân công khối.
- `PUBLISH_RULES_CAPABILITY_DENIED`: Rules live chưa hỗ trợ `lesson_publish_v2` hoặc profile server-side không thỏa điều kiện.
- `PUBLISH_NETWORK_ERROR`: lỗi kết nối Firestore.
- `REGISTRY_PERMISSION_DENIED`: Firestore từ chối transaction giữ số bài + metadata.
- `CONTENT_CREATE_DENIED`: Firestore từ chối tạo nội dung.
- `LESSON_UPDATE_DENIED`: Firestore từ chối cập nhật bài.

## 4. Cập nhật hệ thống

### Bước A — Firestore Rules

Deploy gói Rules V6.88.4 trước. Không upload frontend mới trước khi Rules live đã được xác minh.

### Bước B — Frontend

Upload `EduSmart_V6.88.4_Reliable_Lesson_Publish.zip` lên Google AI Studio, chạy/cập nhật ứng dụng như các phiên bản trước. Không cần thay `htht.gs` hoặc cấu trúc Google Sheet cho bản sửa này.

### Bước C — kiểm tra

1. Đăng xuất và đăng nhập lại bằng tài khoản giáo viên/admin.
2. Tạo một bài thử ở đúng khối được phân công.
3. Nhấn **Xuất bản bài học**.
4. Xác nhận bài xuất hiện trong danh sách và mở được nội dung.
5. Thử tạo bài cùng số để chắc chắn registry chặn trùng đúng cách.
6. Nếu có lỗi, chụp nguyên thông báo có mã trong dấu `[]`; mã mới cho biết chính xác tầng đang bị chặn.

## 5. Lưu ý

Rules V6.88.4 vẫn chấp nhận probe V6.88.3 để triển khai theo thứ tự an toàn: **Rules trước, frontend sau**. Frontend V6.88.4 không phụ thuộc chuỗi số phiên bản Rules cho các lần nâng cấp sau nếu capability `lesson_publish_v2` không đổi.
