# EduSmart V6.73.2

## Clean Lesson & Arena Cards

V6.73.2 tinh gọn giao diện **Quản lý bài học** và **Quản lý Đấu trường tri thức** bằng cách bỏ các thông tin bị lặp lại trên cùng một card.

### Nâng cấp chính
- Cover bài học/Đấu trường **không còn lặp lại Bài số + tên/chủ đề** ở góc trên trái.
- Phần nội dung card chỉ giữ **một tiêu đề chính** dạng `Bài N: Tên bài`.
- Bỏ dòng chủ đề màu xanh nằm dưới tiêu đề khi nó trùng với tên bài.
- Cover vẫn giữ **trạng thái Đang mở / Đã khóa** và dòng **Môn học • Khối • Lớp** để nhận diện nhanh.
- Card Đấu trường vẫn giữ nhãn **Đấu trường tri thức**, ngày cập nhật, số câu hỏi và trạng thái sẵn sàng.
- Giữ nguyên toàn bộ thao tác **Mở/Xem, ..., Sửa, Theo dõi, Khóa/Mở khóa, Xóa** theo quyền.

### Backend
Không thay đổi schema trong V6.73.2. Tiếp tục sử dụng Firestore Rules V6.71.2, Code.gs V6.71.2 và DATA V4 V6.68.0.
