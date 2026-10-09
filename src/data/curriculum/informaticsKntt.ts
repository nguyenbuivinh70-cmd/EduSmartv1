export type CurriculumRequirement = {
  id: string;
  grade: string;
  topicId: string;
  text: string;
  competency?: string;
  verbs?: string[];
  sourceKind?: 'official_normalized' | 'normalized_profile';
  sourceUrl?: string;
};

export type TextbookLessonEntry = {
  id: string;
  grade: string;
  lessonNumber: number;
  lessonCode: string;
  title: string;
  topicId: string;
  topicTitle: string;
  track?: 'core' | 'A' | 'B';
  requirementIds: string[];
  keywords?: string[];
};

export const CURRICULUM_PROGRAM = 'CTGDPT2018';
export const CURRICULUM_VERSION = 'TT32-2018-consolidated-2022';
export const TEXTBOOK_SERIES_KNTT = 'KNTT';
export const TEXTBOOK_CATALOG_VERSION = 'KNTT-TIN-THCS-2026.10';
export const CURRICULUM_REFERENCE_URL = 'https://moet.gov.vn/content/vanban/Lists/VBPQ/Attachments/1483/vbhn-ttu-322018-202021-132022-ttbgddt.pdf';
export const TEXTBOOK_REFERENCE_LABEL = 'Tin học THCS – Kết nối tri thức với cuộc sống';
export const TEXTBOOK_REFERENCE_URL = 'https://nxbgd.vn/chuyen-muc/bo-sach-ket-noi-tri-thuc-voi-cuoc-song';

export const INFORMATICS_REQUIREMENTS: CurriculumRequirement[] = [
  // Lớp 6
  { id: 'TIN6-A1-01', grade: '6', topicId: '6-A', text: 'Phân biệt được thông tin, dữ liệu và vật mang tin; nêu được ví dụ về mối quan hệ giữa thông tin và dữ liệu.', competency: 'NLa', verbs: ['phân biệt', 'nhận biết', 'nêu'] },
  { id: 'TIN6-A1-02', grade: '6', topicId: '6-A', text: 'Nêu được tầm quan trọng của thông tin và giải thích được máy tính là công cụ hiệu quả để thu thập, lưu trữ, xử lí và truyền thông tin.', competency: 'NLa', verbs: ['nêu', 'giải thích'] },
  { id: 'TIN6-A1-03', grade: '6', topicId: '6-A', text: 'Nêu được các bước cơ bản trong xử lí thông tin.', competency: 'NLa', verbs: ['nêu'] },
  { id: 'TIN6-A2-01', grade: '6', topicId: '6-A', text: 'Giải thích được việc có thể biểu diễn thông tin chỉ với hai kí hiệu 0 và 1; biết bit là đơn vị nhỏ nhất trong lưu trữ thông tin.', competency: 'NLa', verbs: ['giải thích', 'biết'] },
  { id: 'TIN6-A2-02', grade: '6', topicId: '6-A', text: 'Nêu được tên và độ lớn gần đúng của các đơn vị đo dung lượng thông tin, thực hiện được quy đổi gần đúng và ước lượng khả năng lưu trữ của thiết bị nhớ thông dụng.', competency: 'NLa', verbs: ['nêu', 'quy đổi', 'ước lượng'] },
  { id: 'TIN6-B-01', grade: '6', topicId: '6-B', text: 'Nêu được khái niệm, lợi ích và các thành phần chủ yếu của mạng máy tính.', competency: 'NLa', verbs: ['nêu'] },
  { id: 'TIN6-B-02', grade: '6', topicId: '6-B', text: 'Nêu được ví dụ trường hợp mạng không dây tiện dụng hơn mạng có dây và nhận biết được một số thiết bị mạng cơ bản.', competency: 'NLa', verbs: ['nêu', 'nhận biết'] },
  { id: 'TIN6-B-03', grade: '6', topicId: '6-B', text: 'Giới thiệu tóm tắt được đặc điểm và ích lợi chính của Internet.', competency: 'NLc', verbs: ['giới thiệu', 'nêu'] },
  { id: 'TIN6-C-01', grade: '6', topicId: '6-C', text: 'Trình bày được sơ lược các khái niệm WWW, website, địa chỉ website, trình duyệt; khai thác được thông tin trên một số trang web thông dụng.', competency: 'NLc', verbs: ['trình bày', 'khai thác'] },
  { id: 'TIN6-C-02', grade: '6', topicId: '6-C', text: 'Nêu được công dụng của máy tìm kiếm và xác định được từ khoá phù hợp với mục đích tìm kiếm.', competency: 'NLc', verbs: ['nêu', 'xác định', 'tìm kiếm'] },
  { id: 'TIN6-C-03', grade: '6', topicId: '6-C', text: 'Nêu được ưu, nhược điểm cơ bản của thư điện tử và thực hiện được các thao tác cơ bản với tài khoản thư điện tử.', competency: 'NLc', verbs: ['nêu', 'thực hiện'] },
  { id: 'TIN6-D-01', grade: '6', topicId: '6-D', text: 'Nhận biết được một số nguy cơ trên Internet; biết bảo vệ thông tin cá nhân, chia sẻ thông tin có trách nhiệm và ứng xử an toàn trong môi trường số.', competency: 'NLb', verbs: ['nhận biết', 'bảo vệ', 'ứng xử'] },
  { id: 'TIN6-E1-01', grade: '6', topicId: '6-E', text: 'Sử dụng được phần mềm để tạo sơ đồ tư duy đơn giản phục vụ học tập và trao đổi thông tin.', competency: 'NLd', verbs: ['sử dụng', 'tạo'] },
  { id: 'TIN6-E2-01', grade: '6', topicId: '6-E', text: 'Thực hiện được các thao tác cơ bản với phần mềm soạn thảo văn bản để tạo, chỉnh sửa và định dạng văn bản phục vụ học tập.', competency: 'NLd', verbs: ['thực hiện', 'tạo', 'chỉnh sửa', 'định dạng'] },
  { id: 'TIN6-E2-02', grade: '6', topicId: '6-E', text: 'Trình bày được thông tin bằng bảng và sử dụng được các công cụ tìm kiếm, thay thế để hoàn thiện văn bản.', competency: 'NLd', verbs: ['trình bày', 'sử dụng', 'hoàn thiện'] },
  { id: 'TIN6-F-01', grade: '6', topicId: '6-F', text: 'Diễn tả được sơ lược khái niệm thuật toán và nêu được một vài ví dụ minh hoạ.', competency: 'NLe', verbs: ['diễn tả', 'nêu'] },
  { id: 'TIN6-F-02', grade: '6', topicId: '6-F', text: 'Mô tả được thuật toán đơn giản có cấu trúc tuần tự, rẽ nhánh và lặp dưới dạng liệt kê hoặc sơ đồ khối.', competency: 'NLe', verbs: ['mô tả'] },
  { id: 'TIN6-F-03', grade: '6', topicId: '6-F', text: 'Biết được chương trình là mô tả một thuật toán để máy tính có thể hiểu và thực hiện.', competency: 'NLe', verbs: ['biết', 'giải thích'] },

  // Lớp 7
  { id: 'TIN7-A1-01', grade: '7', topicId: '7-A', text: 'Nhận biết được các thiết bị vào – ra, chức năng của chúng trong thu thập, lưu trữ, xử lí và truyền thông tin.', competency: 'NLa', verbs: ['nhận biết', 'nêu'] },
  { id: 'TIN7-A1-02', grade: '7', topicId: '7-A', text: 'Thực hiện đúng thao tác với thiết bị thông dụng và nêu được ví dụ về thao tác không đúng có thể gây lỗi cho thiết bị hoặc hệ thống.', competency: 'NLa', verbs: ['thực hiện', 'nêu'] },
  { id: 'TIN7-A2-01', grade: '7', topicId: '7-A', text: 'Giải thích được sơ lược chức năng điều khiển, quản lí của hệ điều hành và phân biệt được hệ điều hành với phần mềm ứng dụng.', competency: 'NLa', verbs: ['giải thích', 'phân biệt'] },
  { id: 'TIN7-A2-02', grade: '7', topicId: '7-A', text: 'Giải thích được ý nghĩa phần mở rộng tên tệp và thao tác thành thạo với tệp, thư mục: tạo, sao chép, di chuyển, đổi tên, xoá.', competency: 'NLa', verbs: ['giải thích', 'thực hiện'] },
  { id: 'TIN7-A2-03', grade: '7', topicId: '7-A', text: 'Nêu được một số biện pháp bảo vệ dữ liệu như sao lưu và phòng chống phần mềm độc hại.', competency: 'NLb', verbs: ['nêu', 'bảo vệ'] },
  { id: 'TIN7-C-01', grade: '7', topicId: '7-C', text: 'Nêu được một số chức năng cơ bản của mạng xã hội và một số kênh trao đổi thông tin thông dụng trên Internet; sử dụng được kênh phù hợp với nhu cầu.', competency: 'NLc', verbs: ['nêu', 'sử dụng'] },
  { id: 'TIN7-D-01', grade: '7', topicId: '7-D', text: 'Thực hiện được giao tiếp, ứng xử phù hợp trên mạng; nhận biết và phòng tránh một số tình huống có nguy cơ gây mất an toàn hoặc tổn hại cho người khác.', competency: 'NLb', verbs: ['thực hiện', 'nhận biết', 'phòng tránh'] },
  { id: 'TIN7-E1-01', grade: '7', topicId: '7-E', text: 'Nhận biết được thành phần cơ bản của bảng tính điện tử và nhập, chỉnh sửa dữ liệu trong trang tính.', competency: 'NLd', verbs: ['nhận biết', 'nhập', 'chỉnh sửa'] },
  { id: 'TIN7-E1-02', grade: '7', topicId: '7-E', text: 'Sử dụng được công thức, địa chỉ ô và một số hàm đơn giản để tính toán tự động trên bảng tính.', competency: 'NLd', verbs: ['sử dụng', 'tính toán'] },
  { id: 'TIN7-E1-03', grade: '7', topicId: '7-E', text: 'Thực hiện được một số thao tác định dạng, trình bày và hoàn thiện bảng tính.', competency: 'NLd', verbs: ['thực hiện', 'trình bày', 'hoàn thiện'] },
  { id: 'TIN7-E1-04', grade: '7', topicId: '7-E', text: 'Sử dụng được bảng tính điện tử để giải quyết một số công việc thực tế đơn giản.', competency: 'NLd', verbs: ['sử dụng', 'giải quyết'] },
  { id: 'TIN7-E2-01', grade: '7', topicId: '7-E', text: 'Nêu được một số chức năng cơ bản của phần mềm trình chiếu.', competency: 'NLd', verbs: ['nêu'] },
  { id: 'TIN7-E2-02', grade: '7', topicId: '7-E', text: 'Tạo được bài trình chiếu có tiêu đề, cấu trúc phân cấp, ảnh minh hoạ và hiệu ứng; sử dụng định dạng hợp lí.', competency: 'NLd', verbs: ['tạo', 'sử dụng'] },
  { id: 'TIN7-E2-03', grade: '7', topicId: '7-E', text: 'Sao chép được dữ liệu từ tệp văn bản sang trang trình chiếu và hoàn thiện một sản phẩm trình chiếu.', competency: 'NLd', verbs: ['sao chép', 'hoàn thiện'] },
  { id: 'TIN7-F-01', grade: '7', topicId: '7-F', text: 'Giải thích và mô phỏng được hoạt động của thuật toán tìm kiếm tuần tự trên bộ dữ liệu nhỏ.', competency: 'NLe', verbs: ['giải thích', 'mô phỏng'] },
  { id: 'TIN7-F-02', grade: '7', topicId: '7-F', text: 'Giải thích và mô phỏng được hoạt động của thuật toán tìm kiếm nhị phân trên bộ dữ liệu đã sắp xếp.', competency: 'NLe', verbs: ['giải thích', 'mô phỏng'] },
  { id: 'TIN7-F-03', grade: '7', topicId: '7-F', text: 'Giải thích và mô phỏng được một thuật toán sắp xếp cơ bản trên bộ dữ liệu nhỏ.', competency: 'NLe', verbs: ['giải thích', 'mô phỏng'] },
  { id: 'TIN7-F-04', grade: '7', topicId: '7-F', text: 'Giải thích được mối liên quan giữa sắp xếp và tìm kiếm, đồng thời nêu được ý nghĩa của việc chia bài toán thành các bài toán nhỏ hơn.', competency: 'NLe', verbs: ['giải thích', 'nêu'] },

  // Lớp 8
  { id: 'TIN8-A-01', grade: '8', topicId: '8-A', text: 'Trình bày được sơ lược lịch sử phát triển máy tính.', competency: 'NLa', verbs: ['trình bày'] },
  { id: 'TIN8-A-02', grade: '8', topicId: '8-A', text: 'Nêu được ví dụ cho thấy sự phát triển máy tính đã đem đến những thay đổi lớn đối với xã hội loài người.', competency: 'NLa', verbs: ['nêu'] },
  { id: 'TIN8-C-01', grade: '8', topicId: '8-C', text: 'Nêu được các đặc điểm của thông tin số: đa dạng, tăng nhanh, dung lượng lớn, có bản quyền và độ tin cậy khác nhau.', competency: 'NLc', verbs: ['nêu'] },
  { id: 'TIN8-C-02', grade: '8', topicId: '8-C', text: 'Trình bày được tầm quan trọng của việc khai thác nguồn thông tin đáng tin cậy và nêu được ví dụ minh hoạ.', competency: 'NLc', verbs: ['trình bày', 'nêu'] },
  { id: 'TIN8-C-03', grade: '8', topicId: '8-C', text: 'Sử dụng được công cụ tìm kiếm, xử lí và trao đổi thông tin trong môi trường số.', competency: 'NLc', verbs: ['sử dụng'] },
  { id: 'TIN8-D-01', grade: '8', topicId: '8-D', text: 'Nhận biết và giải thích được một số vấn đề đạo đức, văn hoá và trách nhiệm khi sử dụng công nghệ kĩ thuật số; tôn trọng bản quyền và quyền riêng tư.', competency: 'NLb', verbs: ['nhận biết', 'giải thích', 'tôn trọng'] },
  { id: 'TIN8-E1-01', grade: '8', topicId: '8-E', text: 'Sử dụng được bảng tính điện tử để xử lí dữ liệu phục vụ giải quyết một số bài toán thực tế.', competency: 'NLd', verbs: ['sử dụng', 'xử lí'] },
  { id: 'TIN8-E1-02', grade: '8', topicId: '8-E', text: 'Thực hiện được sắp xếp, lọc dữ liệu và lựa chọn cách trình bày dữ liệu phù hợp.', competency: 'NLd', verbs: ['thực hiện', 'lựa chọn'] },
  { id: 'TIN8-E1-03', grade: '8', topicId: '8-E', text: 'Tạo và sử dụng được biểu đồ để trực quan hoá dữ liệu, rút ra được nhận xét phù hợp từ dữ liệu.', competency: 'NLd', verbs: ['tạo', 'sử dụng', 'nhận xét'] },
  { id: 'TIN8-E2A-01', grade: '8', topicId: '8-EA', text: 'Sử dụng được một số chức năng nâng cao của phần mềm soạn thảo văn bản để trình bày văn bản có danh sách, hình ảnh, đầu trang và chân trang.', competency: 'NLd', verbs: ['sử dụng', 'trình bày'] },
  { id: 'TIN8-E2A-02', grade: '8', topicId: '8-EA', text: 'Sử dụng được một số chức năng nâng cao của phần mềm trình chiếu như định dạng trang chiếu và bản mẫu để tạo sản phẩm phù hợp.', competency: 'NLd', verbs: ['sử dụng', 'tạo'] },
  { id: 'TIN8-E2B-01', grade: '8', topicId: '8-EB', text: 'Nêu được một số chức năng cơ bản và thực hiện được thao tác cơ bản với phần mềm chỉnh sửa ảnh.', competency: 'NLd', verbs: ['nêu', 'thực hiện'] },
  { id: 'TIN8-E2B-02', grade: '8', topicId: '8-EB', text: 'Chỉnh sửa được khung hình, kích thước, văn bản và hiệu ứng để tạo sản phẩm ảnh đáp ứng một nhu cầu cụ thể.', competency: 'NLd', verbs: ['chỉnh sửa', 'tạo'] },
  { id: 'TIN8-F-01', grade: '8', topicId: '8-F', text: 'Mô tả được kịch bản đơn giản dưới dạng thuật toán và tạo được chương trình đơn giản; hiểu chương trình là dãy lệnh điều khiển máy tính thực hiện thuật toán.', competency: 'NLe', verbs: ['mô tả', 'tạo', 'giải thích'] },
  { id: 'TIN8-F-02', grade: '8', topicId: '8-F', text: 'Nêu và sử dụng được hằng, biến, kiểu dữ liệu và biểu thức trong chương trình đơn giản.', competency: 'NLe', verbs: ['nêu', 'sử dụng'] },
  { id: 'TIN8-F-03', grade: '8', topicId: '8-F', text: 'Thể hiện được cấu trúc tuần tự, rẽ nhánh và lặp trong chương trình ở môi trường lập trình trực quan.', competency: 'NLe', verbs: ['thể hiện', 'sử dụng'] },
  { id: 'TIN8-F-04', grade: '8', topicId: '8-F', text: 'Chạy thử, tìm lỗi và sửa được lỗi cho chương trình.', competency: 'NLe', verbs: ['chạy thử', 'tìm lỗi', 'sửa lỗi'] },
  { id: 'TIN8-G-01', grade: '8', topicId: '8-G', text: 'Nêu được một số nghề nghiệp mà ứng dụng tin học làm tăng hiệu quả công việc và một số nghề thuộc lĩnh vực tin học.', competency: 'NLa', verbs: ['nêu'] },
  { id: 'TIN8-G-02', grade: '8', topicId: '8-G', text: 'Nhận thức và trình bày được vấn đề bình đẳng giới trong sử dụng máy tính và ứng dụng tin học.', competency: 'NLb', verbs: ['nhận thức', 'trình bày'] },

  // Lớp 9
  { id: 'TIN9-A-01', grade: '9', topicId: '9-A', text: 'Nhận biết được sự có mặt của các thiết bị có gắn bộ xử lí thông tin ở nhiều nơi, nhiều lĩnh vực và nêu được ví dụ minh hoạ.', competency: 'NLa', verbs: ['nhận biết', 'nêu'] },
  { id: 'TIN9-A-02', grade: '9', topicId: '9-A', text: 'Nêu được khả năng của máy tính, một số ứng dụng thực tế và giải thích được tác động của công nghệ thông tin lên giáo dục và xã hội.', competency: 'NLa', verbs: ['nêu', 'giải thích'] },
  { id: 'TIN9-C-01', grade: '9', topicId: '9-C', text: 'Giải thích được sự cần thiết phải quan tâm đến chất lượng thông tin khi tìm kiếm, tiếp nhận và trao đổi thông tin.', competency: 'NLc', verbs: ['giải thích'] },
  { id: 'TIN9-C-02', grade: '9', topicId: '9-C', text: 'Giải thích được tính mới, tính chính xác, tính đầy đủ và tính sử dụng được của thông tin; nêu được ví dụ minh hoạ.', competency: 'NLc', verbs: ['giải thích', 'nêu'] },
  { id: 'TIN9-C-03', grade: '9', topicId: '9-C', text: 'Tìm kiếm được thông tin và đánh giá được chất lượng thông tin để giải quyết vấn đề.', competency: 'NLc', verbs: ['tìm kiếm', 'đánh giá'] },
  { id: 'TIN9-D-01', grade: '9', topicId: '9-D', text: 'Trình bày được một số tác động tiêu cực của công nghệ kĩ thuật số đối với đời sống con người và xã hội, có ví dụ minh hoạ.', competency: 'NLb', verbs: ['trình bày', 'nêu'] },
  { id: 'TIN9-D-02', grade: '9', topicId: '9-D', text: 'Nêu được một số nội dung pháp lí liên quan đến công nghệ thông tin, sử dụng dịch vụ Internet, sở hữu, sử dụng và trao đổi thông tin.', competency: 'NLb', verbs: ['nêu'] },
  { id: 'TIN9-D-03', grade: '9', topicId: '9-D', text: 'Nhận biết và nêu được ví dụ về hành vi vi phạm pháp luật, trái đạo đức hoặc thiếu văn hoá trong môi trường số.', competency: 'NLb', verbs: ['nhận biết', 'nêu'] },
  { id: 'TIN9-E1-01', grade: '9', topicId: '9-E', text: 'Nêu được ví dụ về phần mềm mô phỏng.', competency: 'NLd', verbs: ['nêu'] },
  { id: 'TIN9-E1-02', grade: '9', topicId: '9-E', text: 'Nêu được kiến thức thu nhận từ việc khai thác một vài phần mềm mô phỏng.', competency: 'NLd', verbs: ['nêu', 'khai thác'] },
  { id: 'TIN9-E1-03', grade: '9', topicId: '9-E', text: 'Nhận biết được mô phỏng thế giới thực bằng máy tính có thể giúp con người khám phá tri thức và giải quyết vấn đề.', competency: 'NLd', verbs: ['nhận biết', 'giải thích'] },
  { id: 'TIN9-E2-01', grade: '9', topicId: '9-E', text: 'Sử dụng được bài trình chiếu và sơ đồ tư duy trong trao đổi thông tin và hợp tác.', competency: 'NLd', verbs: ['sử dụng', 'hợp tác'] },
  { id: 'TIN9-E2-02', grade: '9', topicId: '9-E', text: 'Biết được khả năng đính kèm tệp văn bản, ảnh, video và trang tính vào sơ đồ tư duy để hỗ trợ trình bày và hợp tác.', competency: 'NLd', verbs: ['biết', 'sử dụng'] },
  { id: 'TIN9-E3A-01', grade: '9', topicId: '9-EA', text: 'Sử dụng được một số công cụ nâng cao của bảng tính như xác thực dữ liệu để kiểm soát dữ liệu nhập.', competency: 'NLd', verbs: ['sử dụng'] },
  { id: 'TIN9-E3A-02', grade: '9', topicId: '9-EA', text: 'Sử dụng được các hàm điều kiện và thống kê có điều kiện phù hợp để xử lí dữ liệu trong bảng tính.', competency: 'NLd', verbs: ['sử dụng', 'xử lí'] },
  { id: 'TIN9-E3A-03', grade: '9', topicId: '9-EA', text: 'Thực hiện được dự án sử dụng bảng tính điện tử góp phần giải quyết một bài toán thực tế như quản lí tài chính hoặc dữ liệu dân số.', competency: 'NLd', verbs: ['thực hiện', 'giải quyết'] },
  { id: 'TIN9-E3B-01', grade: '9', topicId: '9-EB', text: 'Nêu được một số chức năng và thực hiện được một số thao tác cơ bản trong phần mềm làm video.', competency: 'NLd', verbs: ['nêu', 'thực hiện'] },
  { id: 'TIN9-E3B-02', grade: '9', topicId: '9-EB', text: 'Tạo được video đáp ứng nhu cầu của cá nhân, gia đình, nhà trường hoặc địa phương.', competency: 'NLd', verbs: ['tạo'] },
  { id: 'TIN9-F-01', grade: '9', topicId: '9-F', text: 'Trình bày được quá trình giải quyết vấn đề và mô tả được giải pháp dưới dạng thuật toán.', competency: 'NLe', verbs: ['trình bày', 'mô tả'] },
  { id: 'TIN9-F-02', grade: '9', topicId: '9-F', text: 'Sử dụng được cấu trúc tuần tự, rẽ nhánh và lặp trong mô tả thuật toán.', competency: 'NLe', verbs: ['sử dụng'] },
  { id: 'TIN9-F-03', grade: '9', topicId: '9-F', text: 'Giải thích được khái niệm bài toán trong tin học, chương trình và quy trình giao bài toán cho máy tính giải quyết; nêu được ví dụ.', competency: 'NLe', verbs: ['giải thích', 'nêu'] },
  { id: 'TIN9-F-04', grade: '9', topicId: '9-F', text: 'Giải thích được trong quy trình giải quyết vấn đề có những bước có thể chuyển giao cho máy tính thực hiện.', competency: 'NLe', verbs: ['giải thích'] },
  { id: 'TIN9-G-01', grade: '9', topicId: '9-G', text: 'Trình bày được công việc đặc thù và sản phẩm chính của người làm tin học trong ít nhất ba nhóm nghề.', competency: 'NLa', verbs: ['trình bày'] },
  { id: 'TIN9-G-02', grade: '9', topicId: '9-G', text: 'Nêu và giải thích được ý kiến cá nhân về một nhóm nghề trong lĩnh vực tin học.', competency: 'NLa', verbs: ['nêu', 'giải thích'] },
  { id: 'TIN9-G-03', grade: '9', topicId: '9-G', text: 'Nhận biết được đặc trưng cơ bản của nhóm nghề thuộc hướng Tin học ứng dụng và nhóm nghề thuộc hướng Khoa học máy tính.', competency: 'NLa', verbs: ['nhận biết'] },
];

const L = (grade: string, lessonNumber: number, lessonCode: string, title: string, topicId: string, topicTitle: string, requirementIds: string[], track: 'core' | 'A' | 'B' = 'core', keywords: string[] = []): TextbookLessonEntry => ({
  id: `KNTT-TIN${grade}-${lessonCode.toUpperCase()}`,
  grade, lessonNumber, lessonCode, title, topicId, topicTitle, requirementIds, track, keywords,
});

export const KNTT_INFORMATICS_LESSONS: TextbookLessonEntry[] = [
  // Tin học 6
  L('6', 1, 'B01', 'Thông tin và dữ liệu', '6-A', 'Máy tính và cộng đồng', ['TIN6-A1-01', 'TIN6-A1-02']),
  L('6', 2, 'B02', 'Xử lí thông tin', '6-A', 'Máy tính và cộng đồng', ['TIN6-A1-02', 'TIN6-A1-03']),
  L('6', 3, 'B03', 'Thông tin trong máy tính', '6-A', 'Máy tính và cộng đồng', ['TIN6-A2-01', 'TIN6-A2-02']),
  L('6', 4, 'B04', 'Mạng máy tính', '6-B', 'Mạng máy tính và Internet', ['TIN6-B-01', 'TIN6-B-02']),
  L('6', 5, 'B05', 'Internet', '6-B', 'Mạng máy tính và Internet', ['TIN6-B-03']),
  L('6', 6, 'B06', 'Mạng thông tin toàn cầu', '6-C', 'Tổ chức lưu trữ, tìm kiếm và trao đổi thông tin', ['TIN6-C-01']),
  L('6', 7, 'B07', 'Tìm kiếm thông tin trên Internet', '6-C', 'Tổ chức lưu trữ, tìm kiếm và trao đổi thông tin', ['TIN6-C-02']),
  L('6', 8, 'B08', 'Thư điện tử', '6-C', 'Tổ chức lưu trữ, tìm kiếm và trao đổi thông tin', ['TIN6-C-03']),
  L('6', 9, 'B09', 'An toàn thông tin trên Internet', '6-D', 'Đạo đức, pháp luật và văn hoá trong môi trường số', ['TIN6-D-01']),
  L('6', 10, 'B10', 'Sơ đồ tư duy', '6-E', 'Ứng dụng tin học', ['TIN6-E1-01']),
  L('6', 11, 'B11', 'Định dạng văn bản', '6-E', 'Ứng dụng tin học', ['TIN6-E2-01']),
  L('6', 12, 'B12', 'Trình bày thông tin ở dạng bảng', '6-E', 'Ứng dụng tin học', ['TIN6-E2-01', 'TIN6-E2-02']),
  L('6', 13, 'B13', 'Thực hành: Tìm kiếm và thay thế', '6-E', 'Ứng dụng tin học', ['TIN6-E2-02']),
  L('6', 14, 'B14', 'Thực hành tổng hợp: Hoàn thiện Sổ lưu niệm', '6-E', 'Ứng dụng tin học', ['TIN6-E2-01', 'TIN6-E2-02']),
  L('6', 15, 'B15', 'Thuật toán', '6-F', 'Giải quyết vấn đề với sự trợ giúp của máy tính', ['TIN6-F-01']),
  L('6', 16, 'B16', 'Các cấu trúc điều khiển', '6-F', 'Giải quyết vấn đề với sự trợ giúp của máy tính', ['TIN6-F-02']),
  L('6', 17, 'B17', 'Chương trình máy tính', '6-F', 'Giải quyết vấn đề với sự trợ giúp của máy tính', ['TIN6-F-03']),

  // Tin học 7
  L('7', 1, 'B01', 'Thiết bị vào - ra', '7-A', 'Máy tính và cộng đồng', ['TIN7-A1-01', 'TIN7-A1-02']),
  L('7', 2, 'B02', 'Phần mềm máy tính', '7-A', 'Máy tính và cộng đồng', ['TIN7-A2-01']),
  L('7', 3, 'B03', 'Quản lí dữ liệu trong máy tính', '7-A', 'Máy tính và cộng đồng', ['TIN7-A2-02', 'TIN7-A2-03']),
  L('7', 4, 'B04', 'Mạng xã hội và một số kênh trao đổi thông tin trên Internet', '7-C', 'Tổ chức lưu trữ, tìm kiếm và trao đổi thông tin', ['TIN7-C-01']),
  L('7', 5, 'B05', 'Ứng xử trên mạng', '7-D', 'Đạo đức, pháp luật và văn hoá trong môi trường số', ['TIN7-D-01']),
  L('7', 6, 'B06', 'Làm quen với phần mềm bảng tính', '7-E', 'Ứng dụng tin học', ['TIN7-E1-01']),
  L('7', 7, 'B07', 'Tính toán tự động trên bảng tính', '7-E', 'Ứng dụng tin học', ['TIN7-E1-02']),
  L('7', 8, 'B08', 'Công cụ hỗ trợ tính toán', '7-E', 'Ứng dụng tin học', ['TIN7-E1-02']),
  L('7', 9, 'B09', 'Trình bày bảng tính', '7-E', 'Ứng dụng tin học', ['TIN7-E1-03']),
  L('7', 10, 'B10', 'Hoàn thiện bảng tính', '7-E', 'Ứng dụng tin học', ['TIN7-E1-03', 'TIN7-E1-04']),
  L('7', 11, 'B11', 'Tạo bài trình chiếu', '7-E', 'Ứng dụng tin học', ['TIN7-E2-01', 'TIN7-E2-02']),
  L('7', 12, 'B12', 'Định dạng đối tượng trên trang chiếu', '7-E', 'Ứng dụng tin học', ['TIN7-E2-02']),
  L('7', 13, 'B13', 'Thực hành tổng hợp: Hoàn thiện bài trình chiếu', '7-E', 'Ứng dụng tin học', ['TIN7-E2-02', 'TIN7-E2-03']),
  L('7', 14, 'B14', 'Thuật toán tìm kiếm tuần tự', '7-F', 'Giải quyết vấn đề với sự trợ giúp của máy tính', ['TIN7-F-01', 'TIN7-F-04']),
  L('7', 15, 'B15', 'Thuật toán tìm kiếm nhị phân', '7-F', 'Giải quyết vấn đề với sự trợ giúp của máy tính', ['TIN7-F-02', 'TIN7-F-04']),
  L('7', 16, 'B16', 'Thuật toán sắp xếp', '7-F', 'Giải quyết vấn đề với sự trợ giúp của máy tính', ['TIN7-F-03', 'TIN7-F-04']),

  // Tin học 8
  L('8', 1, 'B01', 'Lược sử công cụ tính toán', '8-A', 'Máy tính và cộng đồng', ['TIN8-A-01', 'TIN8-A-02']),
  L('8', 2, 'B02', 'Thông tin trong môi trường số', '8-C', 'Tổ chức lưu trữ, tìm kiếm và trao đổi thông tin', ['TIN8-C-01', 'TIN8-C-02']),
  L('8', 3, 'B03', 'Thực hành: Khai thác thông tin số', '8-C', 'Tổ chức lưu trữ, tìm kiếm và trao đổi thông tin', ['TIN8-C-02', 'TIN8-C-03']),
  L('8', 4, 'B04', 'Đạo đức và văn hoá trong sử dụng công nghệ kĩ thuật số', '8-D', 'Đạo đức, pháp luật và văn hoá trong môi trường số', ['TIN8-D-01']),
  L('8', 5, 'B05', 'Sử dụng bảng tính giải quyết bài toán thực tế', '8-E', 'Ứng dụng tin học', ['TIN8-E1-01']),
  L('8', 6, 'B06', 'Sắp xếp và lọc dữ liệu', '8-E', 'Ứng dụng tin học', ['TIN8-E1-02']),
  L('8', 7, 'B07', 'Trực quan hoá dữ liệu', '8-E', 'Ứng dụng tin học', ['TIN8-E1-03']),
  L('8', 8, 'B08A', 'Làm việc với danh sách dạng liệt kê và hình ảnh trong văn bản', '8-EA', 'Ứng dụng tin học – Soạn thảo văn bản và trình chiếu nâng cao', ['TIN8-E2A-01'], 'A'),
  L('8', 9, 'B09A', 'Tạo đầu trang, chân trang cho văn bản', '8-EA', 'Ứng dụng tin học – Soạn thảo văn bản và trình chiếu nâng cao', ['TIN8-E2A-01'], 'A'),
  L('8', 10, 'B10A', 'Định dạng nâng cao cho trang chiếu', '8-EA', 'Ứng dụng tin học – Soạn thảo văn bản và trình chiếu nâng cao', ['TIN8-E2A-02'], 'A'),
  L('8', 11, 'B11A', 'Sử dụng bản mẫu tạo bài trình chiếu', '8-EA', 'Ứng dụng tin học – Soạn thảo văn bản và trình chiếu nâng cao', ['TIN8-E2A-02'], 'A'),
  L('8', 8, 'B08B', 'Phần mềm chỉnh sửa ảnh', '8-EB', 'Ứng dụng tin học – Làm quen với phần mềm chỉnh sửa ảnh', ['TIN8-E2B-01'], 'B'),
  L('8', 9, 'B09B', 'Thay đổi khung hình, kích thước ảnh', '8-EB', 'Ứng dụng tin học – Làm quen với phần mềm chỉnh sửa ảnh', ['TIN8-E2B-01', 'TIN8-E2B-02'], 'B'),
  L('8', 10, 'B10B', 'Thêm văn bản, tạo hiệu ứng cho ảnh', '8-EB', 'Ứng dụng tin học – Làm quen với phần mềm chỉnh sửa ảnh', ['TIN8-E2B-02'], 'B'),
  L('8', 11, 'B11B', 'Thực hành tổng hợp', '8-EB', 'Ứng dụng tin học – Làm quen với phần mềm chỉnh sửa ảnh', ['TIN8-E2B-01', 'TIN8-E2B-02'], 'B'),
  L('8', 12, 'B12', 'Từ thuật toán đến chương trình', '8-F', 'Giải quyết vấn đề với sự trợ giúp của máy tính', ['TIN8-F-01']),
  L('8', 13, 'B13', 'Biểu diễn dữ liệu', '8-F', 'Giải quyết vấn đề với sự trợ giúp của máy tính', ['TIN8-F-02']),
  L('8', 14, 'B14', 'Cấu trúc điều khiển', '8-F', 'Giải quyết vấn đề với sự trợ giúp của máy tính', ['TIN8-F-03']),
  L('8', 15, 'B15', 'Gỡ lỗi', '8-F', 'Giải quyết vấn đề với sự trợ giúp của máy tính', ['TIN8-F-04']),
  L('8', 16, 'B16', 'Tin học với nghề nghiệp', '8-G', 'Hướng nghiệp với tin học', ['TIN8-G-01', 'TIN8-G-02']),

  // Tin học 9
  L('9', 1, 'B01', 'Thế giới kĩ thuật số', '9-A', 'Máy tính và cộng đồng', ['TIN9-A-01', 'TIN9-A-02']),
  L('9', 2, 'B02', 'Thông tin trong giải quyết vấn đề', '9-C', 'Tổ chức lưu trữ, tìm kiếm và trao đổi thông tin', ['TIN9-C-01', 'TIN9-C-02']),
  L('9', 3, 'B03', 'Thực hành: Đánh giá chất lượng thông tin', '9-C', 'Tổ chức lưu trữ, tìm kiếm và trao đổi thông tin', ['TIN9-C-02', 'TIN9-C-03']),
  L('9', 4, 'B04', 'Một số vấn đề pháp lí về sử dụng dịch vụ Internet', '9-D', 'Đạo đức, pháp luật và văn hoá trong môi trường số', ['TIN9-D-01', 'TIN9-D-02', 'TIN9-D-03']),
  L('9', 5, 'B05', 'Tìm hiểu phần mềm mô phỏng', '9-E', 'Ứng dụng tin học', ['TIN9-E1-01', 'TIN9-E1-03']),
  L('9', 6, 'B06', 'Thực hành: Khai thác phần mềm mô phỏng', '9-E', 'Ứng dụng tin học', ['TIN9-E1-02', 'TIN9-E1-03']),
  L('9', 7, 'B07', 'Trình bày thông tin trong trao đổi và hợp tác', '9-E', 'Ứng dụng tin học', ['TIN9-E2-01', 'TIN9-E2-02']),
  L('9', 8, 'B08', 'Thực hành: Sử dụng công cụ trực quan trình bày thông tin trong trao đổi và hợp tác', '9-E', 'Ứng dụng tin học', ['TIN9-E2-01', 'TIN9-E2-02']),
  L('9', 9, 'B09A', 'Sử dụng công cụ xác thực dữ liệu', '9-EA', 'Ứng dụng tin học – Sử dụng bảng tính điện tử nâng cao', ['TIN9-E3A-01'], 'A'),
  L('9', 10, 'B10A', 'Sử dụng hàm COUNTIF', '9-EA', 'Ứng dụng tin học – Sử dụng bảng tính điện tử nâng cao', ['TIN9-E3A-02'], 'A'),
  L('9', 11, 'B11A', 'Sử dụng hàm SUMIF', '9-EA', 'Ứng dụng tin học – Sử dụng bảng tính điện tử nâng cao', ['TIN9-E3A-02'], 'A'),
  L('9', 12, 'B12A', 'Sử dụng hàm IF', '9-EA', 'Ứng dụng tin học – Sử dụng bảng tính điện tử nâng cao', ['TIN9-E3A-02'], 'A'),
  L('9', 13, 'B13A', 'Hoàn thiện bảng tính quản lí tài chính gia đình', '9-EA', 'Ứng dụng tin học – Sử dụng bảng tính điện tử nâng cao', ['TIN9-E3A-01', 'TIN9-E3A-02', 'TIN9-E3A-03'], 'A'),
  L('9', 9, 'B09B', 'Các chức năng chính của phần mềm làm video', '9-EB', 'Ứng dụng tin học – Làm quen với phần mềm làm video', ['TIN9-E3B-01'], 'B'),
  L('9', 10, 'B10B', 'Chuẩn bị dữ liệu và dựng video', '9-EB', 'Ứng dụng tin học – Làm quen với phần mềm làm video', ['TIN9-E3B-01', 'TIN9-E3B-02'], 'B'),
  L('9', 11, 'B11B', 'Thực hành: Dựng video theo kịch bản', '9-EB', 'Ứng dụng tin học – Làm quen với phần mềm làm video', ['TIN9-E3B-02'], 'B'),
  L('9', 12, 'B12B', 'Hoàn thành việc dựng video', '9-EB', 'Ứng dụng tin học – Làm quen với phần mềm làm video', ['TIN9-E3B-02'], 'B'),
  L('9', 13, 'B13B', 'Biên tập và xuất video', '9-EB', 'Ứng dụng tin học – Làm quen với phần mềm làm video', ['TIN9-E3B-01', 'TIN9-E3B-02'], 'B'),
  L('9', 14, 'B14', 'Giải quyết vấn đề', '9-F', 'Giải quyết vấn đề với sự trợ giúp của máy tính', ['TIN9-F-01', 'TIN9-F-04']),
  L('9', 15, 'B15', 'Bài toán tin học', '9-F', 'Giải quyết vấn đề với sự trợ giúp của máy tính', ['TIN9-F-01', 'TIN9-F-03']),
  L('9', 16, 'B16', 'Thực hành: Lập chương trình máy tính', '9-F', 'Giải quyết vấn đề với sự trợ giúp của máy tính', ['TIN9-F-02', 'TIN9-F-03', 'TIN9-F-04']),
  L('9', 17, 'B17', 'Tin học và thế giới nghề nghiệp', '9-G', 'Hướng nghiệp với tin học', ['TIN9-G-01', 'TIN9-G-02', 'TIN9-G-03']),
];

export function normalizeVietnamese(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function isInformaticsSubjectName(value: unknown) {
  const normalized = normalizeVietnamese(value);
  return normalized === 'tin hoc' || normalized.includes('tin hoc');
}

export function getKnttInformaticsLessons(grade: unknown) {
  const g = String(grade || '').trim();
  return KNTT_INFORMATICS_LESSONS.filter((item) => item.grade === g);
}

export function getTextbookLessonById(id: unknown) {
  const key = String(id || '').trim();
  return KNTT_INFORMATICS_LESSONS.find((item) => item.id === key) || null;
}

export function getCurriculumRequirementsByIds(ids: unknown) {
  const keys = new Set((Array.isArray(ids) ? ids : []).map((item) => String(item || '').trim()).filter(Boolean));
  return INFORMATICS_REQUIREMENTS.filter((item) => keys.has(item.id));
}

export function getCurriculumRequirementsForLesson(lesson: TextbookLessonEntry | null | undefined) {
  return getCurriculumRequirementsByIds(lesson?.requirementIds || []);
}

export function getTopicOptionsForGrade(grade: unknown) {
  const lessons = getKnttInformaticsLessons(grade);
  const seen = new Set<string>();
  return lessons.reduce<Array<{ id: string; title: string }>>((acc, item) => {
    if (!seen.has(item.topicId)) {
      seen.add(item.topicId);
      acc.push({ id: item.topicId, title: item.topicTitle });
    }
    return acc;
  }, []);
}

export function textbookLessonNumberLabel(lesson: TextbookLessonEntry | null | undefined) {
  if (!lesson) return '';
  const suffix = lesson.track === 'A' ? 'a' : lesson.track === 'B' ? 'b' : '';
  return `${lesson.lessonNumber}${suffix}`;
}

export function buildTextbookLessonTitle(lesson: TextbookLessonEntry | null | undefined) {
  if (!lesson) return '';
  return `Bài ${textbookLessonNumberLabel(lesson)}: ${lesson.title}`;
}

export function textbookLessonOptionLabel(lesson: TextbookLessonEntry | null | undefined) {
  if (!lesson) return '';
  return `Bài ${textbookLessonNumberLabel(lesson)} – ${lesson.title}`;
}
