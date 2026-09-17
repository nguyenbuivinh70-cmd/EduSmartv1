# EduSmart V6.88.5 — Reliable Student Self-Study Activity Access

## Lỗi được sửa

Học sinh vẫn nhìn thấy bài học và nút **Bắt đầu học**, nhưng khi mở bài hệ thống báo kiểu:

`A1:permission-denied, A2:permission-denied, A3:permission-denied`

Lỗi xảy ra ở tầng đọc từng document `activities/{activityId}`. Client đã xác định học sinh thuộc phạm vi tự học, nhưng Rules có thể vẫn đánh giá lớp theo dữ liệu canonical/legacy khác nhau hoặc Rules live chưa hỗ trợ đầy đủ `self_study_scope = classes`.

## Cách sửa V6.88.5

1. Rules dùng cả `classId` và `lop_id` để đối chiếu `self_study_class_ids`.
2. Học sinh tự học được quyền `get` từng activity trực tiếp khi bài cha cho phép tự học và nội dung bài đang mở theo lịch/khóa.
3. Không mở quyền `list` activity cho học sinh; chỉ cho `get` đúng activity mà frontend cần. Điều này giữ mô hình an toàn hiện tại.
4. Giáo viên khi cấu hình tự học theo lớp phải vượt capability probe `class_scoped_self_study_v1`.
5. Frontend cung cấp mã lỗi rõ ràng nếu Rules live vẫn chưa đúng.

## Triển khai

### Bước 1 — Deploy Rules trước

Upload `EduSmart_V6.88.5_Rules_REST_Deploy_FAST.zip` vào Google Cloud Shell và chạy:

```bash
unzip -o EduSmart_V6.88.5_Rules_REST_Deploy_FAST.zip
cd EduSmart_V6.88.5_Rules_REST_Deploy_FAST
chmod +x DEPLOY_RULES_FAST.sh
./DEPLOY_RULES_FAST.sh
```

Chỉ tiếp tục khi thấy:

```text
REST DEPLOY COMPLETE - Firestore Rules V6.88.5
```

Chờ 2–5 phút.

### Bước 2 — Upload frontend

Upload `EduSmart_V6.88.5_Reliable_Student_Self_Study.zip` lên Google AI Studio và cập nhật ứng dụng.

### Bước 3 — Kiểm tra

- Đăng xuất và đăng nhập lại học sinh.
- Mở bài đang bật tự học cho đúng lớp.
- A1/A2/A3 phải tải bình thường.
- Kiểm tra một học sinh lớp không được chọn: không được nhận quyền tự học.
- Kiểm tra bài ở chế độ giáo viên điều khiển: vẫn chỉ mở activity đã release.

Không cần thay Apps Script `htht.gs` hoặc Google Sheet.
