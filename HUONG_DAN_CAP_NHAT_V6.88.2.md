# EduSmart V6.88.2 — sửa tạo bài và xóa/lưu trữ bài

Ngày hoàn thiện: 15/09/2026. Nền mã: EduSmart V6.88.1 trong tệp nguồn đã cung cấp.

## 1. Kết quả phân tích

Ứng dụng sử dụng React, TypeScript, Vite và Firebase. Hai chức năng đang lỗi đi trực tiếp qua Firestore; sửa Apps Script hoặc bảng Excel không xử lý được các điểm lỗi đã tìm thấy.

Ảnh chụp cho thấy Firebase trả lỗi `resource-exhausted`; ở màn hình tạo bài, lỗi xuất hiện tại bước giữ số bài (`REGISTRY_RESERVE`). Chưa có quyền truy cập mục Usage của dự án đang chạy nên chưa thể kết luận hạn mức đọc, ghi, xóa hay giới hạn tài nguyên nào đã bị chạm.

Trong mã V6.88.1 có các vấn đề cụ thể:

| Vấn đề | Hệ quả | Bản sửa V6.88.2 |
| --- | --- | --- |
| Trước khi tạo bài, ứng dụng ghi rồi xóa một bản ghi thử quyền | Hết hạn mức xóa cũng có thể chặn tạo bài | Bỏ bản ghi thử; kiểm tra tài khoản và dùng Rules khi ghi dữ liệu thực |
| Lưu trữ vẫn xóa bản ghi giữ số khi bản ghi này hết bài | Thao tác lưu trữ còn phụ thuộc hạn mức xóa | Giữ bản ghi số bài rỗng để tái sử dụng; cập nhật cùng trạng thái lưu trữ trong một transaction |
| Tạo bài lỗi giữa chừng kích hoạt dọn/xóa dữ liệu | Tốn thêm yêu cầu lúc quota đã cạn; khó tiếp tục bản đang làm | Giữ bài chưa hoàn tất ở trạng thái nháp riêng tư; thử lại cùng mã tạo bài |
| Tải lại dữ liệu diện rộng sau tạo/lưu trữ; danh sách quản trị tự chuyển đổi dữ liệu cũ | Tăng số lượt đọc/ghi không cần thiết | Cập nhật danh sách từ kết quả đã lưu; chuyển đổi dữ liệu cũ chỉ khi chạy chức năng sửa dữ liệu chủ động |
| Kiểm tra trùng số ở trình soạn tính cả bài đã lưu trữ | Không dùng lại được số bài vừa giải phóng | Bỏ qua bài đã lưu trữ và chính bản tạo đang tiếp tục |
| Hàm lọc `undefined` làm mất kiểu Timestamp/FieldValue của Firebase | Có thể lưu sai kiểu thời gian, ảnh hưởng điều kiện truy cập | Bảo toàn các đối tượng Firebase này |

## 2. Cập nhật ứng dụng

1. Giải nén gói mã nguồn V6.88.2. Thư mục gốc chứa `package.json`, `src/`, `README.md` và hướng dẫn này.
2. Cập nhật dự án web hiện tại bằng mã trong gói. Nếu trình biên tập không hỗ trợ nhập ZIP, giải nén rồi chép các tệp vào dự án, giữ đúng cấu trúc thư mục.
3. Giữ cấu hình kết nối và cấu hình AI đang dùng. Bản này tiếp tục dùng dự án Firebase `hthtv1` như mã gốc.
4. Với môi trường chạy lệnh, thực hiện `npm ci`, `npm run lint`, `npm run build`; chạy thử bằng `npm run dev`. Với nền tảng đang lưu trữ app, build và phát hành bản frontend theo quy trình hiện tại.
5. Mở lại trang để tải bản frontend mới. V6.88.2 đã được ghi trong `package.json`, `metadata.json` và mã khởi động.

**Không cần thay `htht.gs`, `HTHT.xlsx` hoặc triển khai lại Rules V6.88.1 cho bản sửa này.** Rules trong thư mục `tests/` chỉ là bản gốc dùng kiểm thử tương thích. Không chạy công cụ dọn dữ liệu/xóa hàng loạt để xử lý lỗi quota.

Bản sửa được bàn giao dưới dạng mã nguồn; chưa được triển khai lên ứng dụng đang hoạt động của thầy.

## 3. Nếu Firebase vẫn báo hết hạn mức

Mở [Usage của Firestore dự án hthtv1](https://console.firebase.google.com/project/hthtv1/firestore/usage) bằng tài khoản quản lý dự án. Kiểm tra thông báo và loại hạn mức thực tế bị chạm.

Nếu chỉ hết hạn mức xóa, luồng tạo mới và lưu trữ đã sửa không cần xóa document; chúng có thể chạy khi hạn mức đọc và ghi còn đủ. Nếu đã hết hạn mức đọc hoặc ghi theo ngày, vẫn phải đợi Firebase cấp lại hạn mức trước khi hoàn tất lưu.

Theo [tài liệu hạn mức Firestore](https://firebase.google.com/docs/firestore/quotas), hạn mức miễn phí theo ngày được đặt lại vào khoảng nửa đêm giờ Thái Bình Dương. Sửa mã hoặc thay Rules không cấp lại quota. Tránh bấm xuất bản liên tục khi vẫn báo cùng lỗi.

## 4. Tiếp tục bài đang tạo

- Khi thao tác lưu lỗi, trình soạn vẫn giữ nội dung và hiển thị công đoạn bị lỗi.
- Bản nháp được lưu tự động trên trình duyệt, theo tài khoản đang đăng nhập. Dùng **Tải bản nháp** để giữ thêm một tệp JSON trên máy.
- Sau khi hạn mức/kết nối phục hồi, tiếp tục ngay trong trình soạn hoặc mở **Tạo bài mới** trên cùng trình duyệt, cùng tài khoản. Bản nháp gần nhất sẽ được khôi phục. Có thể dùng **Mở bản nháp** để nạp tệp JSON đã tải.
- Bấm lưu hoặc xuất bản lại. Mã yêu cầu được giữ nguyên để tiếp tục bài đang dở; gửi lại cùng nội dung sau lần lưu đã thành công không tạo thêm bản sao.
- Bản nháp JSON giữ nội dung bài, cấu hình và đường dẫn video; không chứa dữ liệu nhị phân của tệp PDF/Word nguồn. Nếu cần phân tích lại từ tệp nguồn sau khi khôi phục, chọn lại tệp đó.
- **Bản nháp mới** bắt đầu một bài khác. Nếu bản nháp cũ đã giữ số bài trên Firebase, cần tiếp tục hoàn tất hoặc lưu trữ bài nháp đó trước khi dùng lại cùng số trong cùng phạm vi.

Bản nháp trình duyệt có thể mất khi xóa dữ liệu trang web hoặc dùng thiết bị khác; tệp JSON là cách giữ nội dung độc lập. Cơ chế khôi phục mới áp dụng từ V6.88.2, không thể lấy lại nội dung chỉ nằm trong bộ nhớ của một tab V6.88.1 đã đóng.

## 5. Xóa/lưu trữ bài học

Giữ hành vi an toàn đã có từ V6.88.0: thao tác xóa thông thường lưu trữ bài, ẩn bài khỏi danh sách đang hoạt động và giải phóng số bài. Nội dung cũ và lịch sử điểm vẫn được giữ để đối chiếu.

Bản V6.88.2 thực hiện cập nhật trạng thái bài và giải phóng số bài cùng một transaction. Nếu Firebase từ chối ghi, không báo thành công hoặc ẩn bài như thể đã lưu trữ. Lỗi được giữ trên màn hình để thầy xem và thử lại khi điều kiện đã phục hồi.

Chức năng xóa vĩnh viễn dành cho quản trị viên vẫn chịu hạn mức xóa của Firebase và các điều kiện bảo vệ dữ liệu học sinh có sẵn.

## 6. Kiểm tra đã thực hiện

| Kiểm tra | Kết quả |
| --- | --- |
| TypeScript (`npm run lint`) | Đạt |
| Build sản phẩm (`npm run build`) | Đạt |
| Bản nháp, nhận diện lỗi, giới hạn thử lại | 3/3 đạt |
| Vòng đời bài học với Firebase Emulator và Rules V6.88.1 gốc | 8/8 đạt |

Các tình huống tích hợp gồm: tạo/gửi lại/lưu trữ/dùng lại số khi mọi lệnh xóa document bị chặn; quota ở bước giữ số; quota ở bước ghi nội dung và tiếp tục sau đó; hai yêu cầu cùng số bài; lưu trữ bị từ chối rồi thử lại; phân quyền học sinh/giáo viên/khối; đọc danh sách cũ không tự ghi chuyển đổi; quản trị viên xuất bản và lưu trữ bài của giáo viên. Điểm và dữ liệu chuẩn bị bài được kiểm tra còn nguyên sau lưu trữ.

Đây là kiểm thử dịch vụ với dữ liệu giả lập và lỗi quota được chèn tại lớp truyền yêu cầu của SDK. Chưa kiểm thử trực tiếp trên dữ liệu thật hoặc toàn bộ giao diện trình duyệt. Hạn mức thực tế và Rules đang triển khai cần được đối chiếu trong Firebase Console nếu sau cập nhật vẫn có lỗi.

Sau khi cập nhật và khi Usage còn hạn mức, thầy có thể tạo một bài thử, mở xem nội dung, lưu trữ bài rồi tạo lại cùng số để xác nhận trên môi trường đang sử dụng.
