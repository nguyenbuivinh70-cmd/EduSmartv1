# EduSmart V6.74.0

## Mobile Lesson Viewer UX

V6.74.0 nâng cấp mạnh giao diện **màn hình học bài trên điện thoại** để thao tác nhanh, ít che nội dung và phù hợp với iPhone/Android.

### Nâng cấp chính
- **Cấu trúc bài học** trên mobile chuyển từ khối chiếm chỗ trong luồng nội dung sang **bottom-sheet drawer** mở/đóng theo nhu cầu.
- Bổ sung thanh điều hướng cố định phía dưới: **Trước / Mục hiện tại / Sau**.
- Header mobile gọn hơn, giữ tiêu đề bài, đồng hồ, menu và đóng bài với vùng chạm lớn.
- Trợ lý AI trên mobile thu gọn thành nút nổi nhỏ và chuyển sang bên trái để tránh che nội dung/nút Netlify.
- Tối ưu khoảng cách, cỡ chữ, card nội dung, nút hỏi AI và phần hướng dẫn hoàn thành mục học trên màn hình hẹp.
- Bổ sung hỗ trợ `safe-area` cho iPhone có notch/home indicator.
- Khi đang làm **kiểm tra cuối bài**, menu điều hướng mobile bị ẩn để tránh thoát khỏi bài kiểm tra.
- Giữ nguyên toàn bộ logic tiến độ, điểm, câu hỏi, comment, AI và kiểm soát lịch học từ V6.73.5.

### Backend
Không thay đổi backend/schema trong V6.74.0. Tiếp tục sử dụng Firestore Rules V6.73.5, Code.gs V6.71.2 và DATA V4 V6.68.0.
