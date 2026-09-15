# EduSmart V6.88.4

**Reliable Lesson Publish Capability** — bản nâng cấp trực tiếp từ V6.88.3.

Mục tiêu chính của V6.88.4 là sửa lỗi tạo bài học dừng tại `PUBLISH_PREFLIGHT` dù dữ liệu bài học hợp lệ. Frontend không còn kiểm tra Firestore Rules bằng chuỗi phiên bản cứng; thay vào đó dùng capability `lesson_publish_v2`, kiểm tra đúng tài khoản và đúng khối giáo viên đang quản lý.

## Điểm thay đổi chính

- Capability probe `lesson_publish_v2` thay cho `rulesVersion == 6.88.3`.
- Probe xác minh quyền theo `khoi`; cache cũng theo UID + khối.
- Ghi probe thành công là đủ để tiếp tục. Xóa probe chỉ là best-effort và không còn làm hỏng phiên xuất bản nếu Firestore từ chối/gián đoạn ở bước dọn.
- Phân loại lỗi rõ hơn: tài khoản, vai trò, phạm vi khối, Rules capability, mạng, registry, content và cập nhật bài học.
- Giữ transaction giữ số bài + metadata và cơ chế rollback để tránh bài/số bài dở dang.
- Đồng bộ `firestore.rules` và `tests/firestore.rules` cùng một nội dung V6.88.4.
- Giữ tương thích probe V6.88.3 trong Rules để có thể deploy Rules trước khi thay frontend.

## Thứ tự cập nhật bắt buộc

1. Deploy gói `EduSmart_V6.88.4_Rules_REST_Deploy_FAST.zip` vào project Firebase `hthtv1`.
2. Chỉ tiếp tục khi Cloud Shell báo `REST DEPLOY COMPLETE - Firestore Rules V6.88.4`.
3. Chờ 2–5 phút để Rules cập nhật.
4. Upload ZIP frontend V6.88.4 lên Google AI Studio.
5. Đăng xuất rồi đăng nhập lại trước khi tạo thử bài học.

Xem `HUONG_DAN_CAP_NHAT_V6.88.4.md` để biết chi tiết kiểm tra sau triển khai.
