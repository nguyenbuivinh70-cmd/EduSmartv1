# EduSmart V6.67.0

**Structured Lesson Catalog & Class-Scoped Learning Analytics**

Bản nâng cấp từ EduSmart V6.66.2, tập trung vào hai nhóm chức năng:

- Quản lý bài học theo cấu trúc **Môn học → Khối → Bài số → Tên bài**.
- Theo dõi học tập theo **lớp / khối / bài**, không trộn học sinh và bài của nhiều khối/lớp trong cùng bảng điểm.

## Điểm mới chính

- Mặc định ưu tiên môn **Tin học** khi tạo bài mới nếu môn này đang hoạt động và áp dụng cho khối đã chọn.
- Bổ sung `lesson_number`, `lesson_name`, `lesson_key`; tiêu đề được sinh theo mẫu `Bài N: Tên bài`.
- Kiểm tra trùng số bài theo **năm học + học kỳ + môn + khối + phạm vi lớp**.
- Firestore `lessonNumberRegistry` dùng transaction để chống tạo trùng đồng thời.
- Bài cũ dạng `Bài 1: ...` vẫn được nhận diện/sắp xếp mà không phải xóa dữ liệu cũ.
- Theo dõi học tập có 3 chế độ: **Theo lớp**, **Theo khối**, **Theo bài theo khối/lớp**.
- Bảng theo lớp chỉ hiển thị một lớp cụ thể; cột bài dùng số bài thực thay vì chỉ số mảng.
- Khi chuyển lớp/kết chuyển năm học, `learningProgress` và `coLearningSessions` được giữ như snapshot lịch sử, không ghi đè lớp/khối/năm học đã phát sinh.

## Chạy mã nguồn

Yêu cầu Node.js.

```bash
npm install
npm run dev
```

Kiểm tra TypeScript/build khi môi trường đã cài đủ dependencies:

```bash
npm run lint
npm run build
```

## Triển khai đồng bộ

Frontend V6.67.0 phải được dùng cùng:

- Firestore Rules V6.67.0.
- Apps Script `code_v6.67.0.gs`.
- Google Sheet `DATA_V4_V6.67.0.xlsx` nếu hệ thống vẫn dùng phần legacy/fallback Google Sheet.

Khi cập nhật production, không tạo/chỉnh bài học trong khoảng thời gian đang thay Firestore Rules và frontend để tránh lệch phiên bản tạm thời.
