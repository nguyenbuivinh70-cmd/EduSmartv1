# EduSmart V6.88.5

**Reliable Student Self-Study Activity Access**

Bản này nâng cấp trực tiếp từ V6.88.4 và sửa lỗi học sinh thấy bài học nhưng khi bấm **Bắt đầu học** thì các activity A1/A2/A3 bị `permission-denied`, đặc biệt với chế độ **tự học theo lớp**.

## Thay đổi chính

- Firestore Rules đối chiếu phạm vi tự học theo cả `classId` canonical và `lop_id` legacy của hồ sơ học sinh.
- Quyền đọc `lessons/{lessonId}/activities/{activityId}` cho học sinh tự học được xác minh trực tiếp từ bài học cha; không phụ thuộc `teachingSession`.
- `studentActivityReleased()` cũng nhận self-study như một quyền hợp lệ để tránh lệch nhánh kiểm tra.
- Frontend đối chiếu class ID mềm hơn bằng chuẩn hóa ID, giúp hồ sơ/lớp legacy không bị sai chỉ do khác ký tự phân cách.
- Khi giáo viên mở **tự học theo một số lớp**, frontend kiểm tra capability `class_scoped_self_study_v1`. Rules cũ sẽ bị chặn ngay ở bước cấu hình thay vì để học sinh gặp lỗi sau đó.
- Thông báo lỗi học sinh có mã chẩn đoán `[SELF_STUDY_ACTIVITY_READ_DENIED]` hoặc `[SELF_STUDY_ACTIVITY_LOAD_INCOMPLETE]`.
- Giữ nguyên capability xuất bản `lesson_publish_v2` của V6.88.4.
- `firestore.rules` và `tests/firestore.rules` là cùng một nội dung.

## Thứ tự triển khai

1. Deploy `EduSmart_V6.88.5_Rules_REST_Deploy_FAST.zip` vào Firebase project `hthtv1`.
2. Chỉ tiếp tục khi Cloud Shell báo `REST DEPLOY COMPLETE - Firestore Rules V6.88.5`.
3. Chờ 2–5 phút cho Security Rules cập nhật.
4. Upload ZIP frontend V6.88.5 lên Google AI Studio.
5. Đăng xuất/đăng nhập lại tài khoản học sinh rồi mở lại bài học.

Không cần thay `htht.gs` hoặc cấu trúc Google Sheet cho bản sửa này.
