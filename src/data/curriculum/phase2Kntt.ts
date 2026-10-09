import type { CurriculumRequirement, TextbookLessonEntry } from './informaticsKntt';
import { CURRICULUM_REFERENCE_URL, normalizeVietnamese } from './informaticsKntt';

export type CurriculumSubjectKey = 'MATH' | 'LITERATURE' | 'SCIENCE';

export type CurriculumSubjectProfile = {
  key: CurriculumSubjectKey;
  label: string;
  aliases: string[];
  catalogVersion: string;
  referenceUrl: string;
  assessmentGuidance: string;
};

export const PHASE2_CATALOG_VERSION = 'KNTT-THCS-PHASE2A-2026.10';
const KNTT_REFERENCE_URL = 'https://nxbgd.vn/chuyen-muc/bo-sach-ket-noi-tri-thuc-voi-cuoc-song';

export const PHASE2_SUBJECT_PROFILES: CurriculumSubjectProfile[] = [
  {
    key: 'MATH',
    label: 'Toán',
    aliases: ['toan', 'mon toan', 'mathematics'],
    catalogVersion: 'KNTT-TOAN-THCS-2026.10',
    referenceUrl: KNTT_REFERENCE_URL,
    assessmentGuidance: 'Ưu tiên câu hỏi yêu cầu lập luận, tính toán có căn cứ, mô hình hóa và vận dụng vào tình huống; không biến mọi YCCD thành câu hỏi nhớ công thức.',
  },
  {
    key: 'LITERATURE',
    label: 'Ngữ văn',
    aliases: ['ngu van', 'van', 'mon ngu van', 'literature'],
    catalogVersion: 'KNTT-NGUVAN-THCS-2026.10',
    referenceUrl: KNTT_REFERENCE_URL,
    assessmentGuidance: 'Bảo đảm cân bằng đọc, viết, nói-nghe; câu hỏi đọc hiểu phải bám ngữ liệu, tránh suy diễn ngoài văn bản; nhiệm vụ viết/nói phải có sản phẩm hoặc tiêu chí minh chứng.',
  },
  {
    key: 'SCIENCE',
    label: 'Khoa học tự nhiên',
    aliases: ['khoa hoc tu nhien', 'khtn', 'science'],
    catalogVersion: 'KNTT-KHTN-THCS-2026.10',
    referenceUrl: KNTT_REFERENCE_URL,
    assessmentGuidance: 'Ưu tiên quan sát, thực hành/thí nghiệm, đọc dữ liệu, giải thích hiện tượng và vận dụng; câu thực hành phải có dữ liệu hoặc thao tác an toàn thay vì chỉ hỏi thuộc lòng.',
  },
];

const topic = (subject: CurriculumSubjectKey, grade: string, code: string, title: string) => `${subject}${grade}-${code}|${title}`;

const MATH_TOPICS: Record<string, Array<[string, string, number, number]>> = {
  '6': [
    ['I', 'Tập hợp các số tự nhiên', 1, 7], ['II', 'Tính chia hết trong tập hợp các số tự nhiên', 8, 12],
    ['III', 'Số nguyên', 13, 17], ['IV', 'Một số hình phẳng trong thực tiễn và đối xứng', 18, 22],
    ['V', 'Phân số', 23, 27], ['VI', 'Số thập phân', 28, 31], ['VII', 'Điểm, đường thẳng và đoạn thẳng', 32, 35],
    ['VIII', 'Góc', 36, 37], ['IX', 'Dữ liệu và xác suất thực nghiệm', 38, 43],
  ],
  '7': [
    ['I', 'Số hữu tỉ', 1, 4], ['II', 'Số thực', 5, 7], ['III', 'Góc và đường thẳng song song', 8, 11],
    ['IV', 'Tam giác bằng nhau', 12, 16], ['V', 'Thu thập và biểu diễn dữ liệu', 17, 19],
    ['VI', 'Tỉ lệ thức và đại lượng tỉ lệ', 20, 23], ['VII', 'Biểu thức đại số và đa thức một biến', 24, 28],
    ['VIII', 'Làm quen với biến cố và xác suất', 29, 30], ['IX', 'Quan hệ giữa các yếu tố trong một tam giác', 31, 35],
    ['X', 'Một số hình khối trong thực tiễn', 36, 37],
  ],
  '8': [
    ['I', 'Đa thức', 1, 5], ['II', 'Hằng đẳng thức đáng nhớ và ứng dụng', 6, 9], ['III', 'Tứ giác', 10, 14],
    ['IV', 'Định lí Thalès', 15, 17], ['V', 'Dữ liệu và biểu đồ', 18, 20], ['VI', 'Phân thức đại số', 21, 24],
    ['VII', 'Phương trình bậc nhất và hàm số bậc nhất', 25, 29], ['VIII', 'Mở đầu về tính xác suất của biến cố', 30, 32],
    ['IX', 'Tam giác đồng dạng', 33, 37], ['X', 'Một số hình khối trong thực tiễn', 38, 39],
  ],
  '9': [
    ['I', 'Phương trình và hệ hai phương trình bậc nhất hai ẩn', 1, 3], ['II', 'Phương trình và bất phương trình bậc nhất một ẩn', 4, 6],
    ['III', 'Căn bậc hai và căn bậc ba', 7, 10], ['IV', 'Hệ thức lượng trong tam giác vuông', 11, 12], ['V', 'Đường tròn', 13, 17],
    ['VI', 'Hàm số y = ax² và phương trình bậc hai một ẩn', 18, 21], ['VII', 'Tần số và tần số tương đối', 22, 24],
    ['VIII', 'Xác suất của biến cố trong một số mô hình xác suất đơn giản', 25, 26], ['IX', 'Đường tròn ngoại tiếp và đường tròn nội tiếp', 27, 30],
    ['X', 'Một số hình khối trong thực tiễn', 31, 32],
  ],
};

const MATH_TITLES: Record<string, string[]> = {
  '6': [
    'Tập hợp','Cách ghi số tự nhiên','Thứ tự trong tập hợp các số tự nhiên','Phép cộng và phép trừ số tự nhiên','Phép nhân và phép chia số tự nhiên','Lũy thừa với số mũ tự nhiên','Thứ tự thực hiện các phép tính',
    'Quan hệ chia hết và tính chất','Dấu hiệu chia hết','Số nguyên tố','Ước chung. Ước chung lớn nhất','Bội chung. Bội chung nhỏ nhất',
    'Tập hợp các số nguyên','Phép cộng và phép trừ số nguyên','Quy tắc dấu ngoặc','Phép nhân số nguyên','Phép chia hết. Ước và bội của một số nguyên',
    'Hình tam giác đều. Hình vuông. Hình lục giác đều','Hình chữ nhật. Hình thoi. Hình bình hành. Hình thang cân','Chu vi và diện tích một số tứ giác đã học','Hình có trục đối xứng','Hình có tâm đối xứng',
    'Mở rộng phân số. Phân số bằng nhau','So sánh phân số. Hỗn số dương','Phép cộng và phép trừ phân số','Phép nhân và phép chia phân số','Hai bài toán về phân số',
    'Số thập phân','Tính toán với số thập phân','Làm tròn và ước lượng','Một số bài toán về tỉ số và tỉ số phần trăm',
    'Điểm và đường thẳng','Điểm nằm giữa hai điểm. Tia','Đoạn thẳng. Độ dài đoạn thẳng','Trung điểm của đoạn thẳng','Góc','Số đo góc',
    'Dữ liệu và thu thập dữ liệu','Bảng thống kê và biểu đồ tranh','Biểu đồ cột','Biểu đồ cột kép','Kết quả có thể và sự kiện trong trò chơi, thí nghiệm','Xác suất thực nghiệm',
  ],
  '7': [
    'Số hữu tỉ','Cộng, trừ, nhân, chia số hữu tỉ','Lũy thừa với số mũ tự nhiên của một số hữu tỉ','Thứ tự thực hiện các phép tính. Quy tắc chuyển vế',
    'Làm quen với số thập phân vô hạn tuần hoàn','Số vô tỉ. Căn bậc hai số học','Tập hợp các số thực',
    'Góc ở vị trí đặc biệt. Tia phân giác của một góc','Hai đường thẳng song song và dấu hiệu nhận biết','Tiên đề Euclid. Tính chất của hai đường thẳng song song','Định lí và chứng minh định lí',
    'Tổng các góc trong một tam giác','Hai tam giác bằng nhau. Trường hợp bằng nhau thứ nhất của tam giác','Trường hợp bằng nhau thứ hai và thứ ba của tam giác','Các trường hợp bằng nhau của tam giác vuông','Tam giác cân. Đường trung trực của đoạn thẳng',
    'Thu thập và phân loại dữ liệu','Biểu đồ hình quạt tròn','Biểu đồ đoạn thẳng',
    'Tỉ lệ thức','Tính chất của dãy tỉ số bằng nhau','Đại lượng tỉ lệ thuận','Đại lượng tỉ lệ nghịch',
    'Biểu thức đại số','Đa thức một biến','Phép cộng và phép trừ đa thức một biến','Phép nhân đa thức một biến','Phép chia đa thức một biến',
    'Làm quen với biến cố','Làm quen với xác suất của biến cố',
    'Quan hệ giữa góc và cạnh đối diện trong một tam giác','Quan hệ giữa đường vuông góc và đường xiên','Quan hệ giữa ba cạnh của một tam giác','Sự đồng quy của ba đường trung tuyến, ba đường phân giác trong một tam giác','Sự đồng quy của ba đường trung trực, ba đường cao trong một tam giác',
    'Hình hộp chữ nhật và hình lập phương','Hình lăng trụ đứng tam giác và hình lăng trụ đứng tứ giác',
  ],
  '8': [
    'Đơn thức','Đa thức','Phép cộng và phép trừ đa thức','Phép nhân đa thức','Phép chia đa thức cho đơn thức',
    'Hiệu hai bình phương. Bình phương của một tổng hay một hiệu','Lập phương của một tổng hay một hiệu','Tổng và hiệu hai lập phương','Phân tích đa thức thành nhân tử',
    'Tứ giác','Hình thang cân','Hình bình hành','Hình chữ nhật','Hình thoi và hình vuông',
    'Định lí Thalès trong tam giác','Đường trung bình của tam giác','Tính chất đường phân giác của tam giác',
    'Thu thập và phân loại dữ liệu','Biểu diễn dữ liệu bằng bảng, biểu đồ','Phân tích số liệu thống kê dựa vào biểu đồ',
    'Phân thức đại số','Tính chất cơ bản của phân thức đại số','Phép cộng và phép trừ phân thức đại số','Phép nhân và phép chia phân thức đại số',
    'Phương trình bậc nhất một ẩn','Giải bài toán bằng cách lập phương trình','Khái niệm hàm số và đồ thị của hàm số','Hàm số bậc nhất và đồ thị của hàm số bậc nhất','Hệ số góc của đường thẳng',
    'Kết quả có thể và kết quả thuận lợi','Cách tính xác suất của biến cố bằng tỉ số','Mối liên hệ giữa xác suất thực nghiệm với xác suất và ứng dụng',
    'Hai tam giác đồng dạng','Ba trường hợp đồng dạng của hai tam giác','Định lí Pythagore và ứng dụng','Các trường hợp đồng dạng của hai tam giác vuông','Hình đồng dạng',
    'Hình chóp tam giác đều','Hình chóp tứ giác đều',
  ],
  '9': [
    'Khái niệm phương trình và hệ hai phương trình bậc nhất hai ẩn','Giải hệ hai phương trình bậc nhất hai ẩn','Giải bài toán bằng cách lập hệ phương trình',
    'Phương trình quy về phương trình bậc nhất một ẩn','Bất đẳng thức và tính chất','Bất phương trình bậc nhất một ẩn',
    'Căn bậc hai và căn thức bậc hai','Khai căn bậc hai với phép nhân và phép chia','Biến đổi đơn giản và rút gọn biểu thức chứa căn thức bậc hai','Căn bậc ba và căn thức bậc ba',
    'Tỉ số lượng giác của góc nhọn','Một số hệ thức giữa cạnh, góc trong tam giác vuông và ứng dụng',
    'Mở đầu về đường tròn','Cung và dây của một đường tròn','Độ dài của cung tròn. Diện tích hình quạt tròn và hình vành khuyên','Vị trí tương đối của đường thẳng và đường tròn','Vị trí tương đối của hai đường tròn',
    'Hàm số y = ax² (a ≠ 0)','Phương trình bậc hai một ẩn','Định lí Viète và ứng dụng','Giải bài toán bằng cách lập phương trình',
    'Bảng tần số và biểu đồ tần số','Bảng tần số tương đối và biểu đồ tần số tương đối','Bảng tần số, tần số tương đối ghép nhóm và biểu đồ',
    'Phép thử ngẫu nhiên và không gian mẫu','Xác suất của biến cố liên quan tới phép thử',
    'Góc nội tiếp','Đường tròn ngoại tiếp và đường tròn nội tiếp của một tam giác','Tứ giác nội tiếp','Đa giác đều','Hình trụ và hình nón','Hình cầu',
  ],
};

const LITERATURE_UNITS: Record<string, string[]> = {
  '6': ['Tôi và các bạn','Gõ cửa trái tim','Yêu thương và chia sẻ','Quê hương yêu dấu','Những nẻo đường xứ sở','Chuyện kể về những người anh hùng','Thế giới cổ tích','Khác biệt và gần gũi','Trái Đất - Ngôi nhà chung','Cuốn sách tôi yêu'],
  '7': ['Bầu trời tuổi thơ','Khúc nhạc tâm hồn','Cội nguồn yêu thương','Giai điệu đất nước','Màu sắc trăm miền','Bài học cuộc sống','Thế giới viễn tưởng','Trải nghiệm để trưởng thành','Hòa điệu với tự nhiên','Trang sách và cuộc sống'],
  '8': ['Câu chuyện của lịch sử','Vẻ đẹp cổ điển','Lời sông núi','Tiếng cười trào phúng trong thơ','Những câu chuyện hài','Chân dung cuộc sống','Tin yêu và ước vọng','Nhà văn và trang viết','Hôm nay và ngày mai','Sách - Người bạn đồng hành'],
  '9': ['Thế giới kì ảo','Những cung bậc tâm trạng','Hồn nước nằm trong tiếng mẹ cha','Khám phá vẻ đẹp văn chương','Đối diện với nỗi đau','Giải mã những bí mật','Hồn thơ muôn điệu','Tiếng nói của lương tri','Đi và suy ngẫm','Văn học - lịch sử tâm hồn'],
};

const SCIENCE_TITLES: Record<string, string[]> = {
  '6': [
    'Giới thiệu về Khoa học tự nhiên','An toàn trong phòng thực hành','Sử dụng kính lúp','Sử dụng kính hiển vi quang học','Đo chiều dài','Đo khối lượng','Đo thời gian','Đo nhiệt độ',
    'Sự đa dạng của chất','Các thể của chất và sự chuyển thể','Oxygen - Không khí','Một số vật liệu','Một số nguyên liệu','Một số nhiên liệu','Một số lương thực, thực phẩm','Hỗn hợp các chất','Tách chất khỏi hỗn hợp',
    'Tế bào - đơn vị cơ bản của sự sống','Cấu tạo và chức năng các thành phần của tế bào','Sự lớn lên và sinh sản của tế bào','Thực hành: Quan sát và phân biệt một số loại tế bào','Cơ thể sinh vật','Tổ chức cơ thể đa bào','Thực hành: Quan sát và mô tả cơ thể đơn bào, cơ thể đa bào',
    'Hệ thống phân loại sinh vật','Khóa lưỡng phân','Vi khuẩn','Thực hành: Làm sữa chua và quan sát vi khuẩn','Virus','Nguyên sinh vật','Thực hành: Quan sát nguyên sinh vật','Nấm','Thực hành: Quan sát các loại nấm','Thực vật','Thực hành: Quan sát và phân biệt một số nhóm thực vật','Động vật','Thực hành: Quan sát và nhận biết một số nhóm động vật ngoài thiên nhiên','Đa dạng sinh học','Tìm hiểu sinh vật ngoài thiên nhiên',
    'Lực là gì?','Biểu diễn lực','Biến dạng của lò xo','Trọng lượng, lực hấp dẫn','Lực ma sát','Lực cản của nước','Năng lượng và sự truyền năng lượng','Một số dạng năng lượng','Sự chuyển hóa năng lượng','Năng lượng hao phí','Năng lượng tái tạo','Tiết kiệm năng lượng','Chuyển động nhìn thấy của Mặt Trời. Thiên thể','Mặt Trăng','Hệ Mặt Trời','Ngân Hà',
  ],
  '7': [
    'Phương pháp và kĩ năng học tập môn Khoa học tự nhiên','Nguyên tử','Nguyên tố hóa học','Sơ lược về bảng tuần hoàn các nguyên tố hóa học','Phân tử - Đơn chất - Hợp chất','Giới thiệu về liên kết hóa học','Hóa trị và công thức hóa học','Tốc độ chuyển động','Đo tốc độ','Đồ thị quãng đường - thời gian','Thảo luận về ảnh hưởng của tốc độ trong an toàn giao thông','Sóng âm','Độ to và độ cao của âm','Phản xạ âm, chống ô nhiễm tiếng ồn','Năng lượng ánh sáng. Tia sáng, vùng tối','Sự phản xạ ánh sáng','Ảnh của vật qua gương phẳng','Nam châm','Từ trường','Chế tạo nam châm điện đơn giản',
    'Khái quát về trao đổi chất và chuyển hóa năng lượng','Quang hợp ở thực vật','Một số yếu tố ảnh hưởng đến quang hợp','Thực hành: Chứng minh quang hợp ở cây xanh','Hô hấp tế bào','Một số yếu tố ảnh hưởng đến hô hấp tế bào','Thực hành: Hô hấp ở thực vật','Trao đổi khí ở sinh vật','Vai trò của nước và chất dinh dưỡng đối với sinh vật','Trao đổi nước và chất dinh dưỡng ở thực vật','Trao đổi nước và chất dinh dưỡng ở động vật','Thực hành: Chứng minh thân vận chuyển nước và lá thoát hơi nước','Cảm ứng ở sinh vật và tập tính ở động vật','Vận dụng hiện tượng cảm ứng ở sinh vật vào thực tiễn','Thực hành: Cảm ứng ở sinh vật','Khái quát về sinh trưởng và phát triển ở sinh vật','Ứng dụng sinh trưởng và phát triển ở sinh vật vào thực tiễn','Thực hành: Quan sát, mô tả sự sinh trưởng và phát triển ở một số sinh vật','Sinh sản vô tính ở sinh vật','Sinh sản hữu tính ở sinh vật','Một số yếu tố ảnh hưởng và điều hòa, điều khiển sinh sản ở sinh vật','Cơ thể sinh vật là một thể thống nhất',
  ],
  '8': [
    'Sử dụng một số hóa chất, thiết bị cơ bản trong phòng thí nghiệm','Phản ứng hóa học','Mol và tỉ khối chất khí','Dung dịch và nồng độ','Định luật bảo toàn khối lượng và phương trình hóa học','Tính theo phương trình hóa học','Tốc độ phản ứng và chất xúc tác','Acid','Base. Thang pH','Oxide','Muối','Phân bón hóa học','Khối lượng riêng','Thực hành xác định khối lượng riêng','Áp suất trên một bề mặt','Áp suất chất lỏng. Áp suất khí quyển','Lực đẩy Archimedes','Tác dụng làm quay của lực. Moment lực','Đòn bẩy và ứng dụng','Hiện tượng nhiễm điện do cọ xát','Dòng điện, nguồn điện','Mạch điện đơn giản','Tác dụng của dòng điện','Cường độ dòng điện và hiệu điện thế','Thực hành đo cường độ dòng điện và hiệu điện thế','Năng lượng nhiệt và nội năng','Thực hành đo năng lượng nhiệt bằng Joulemeter','Sự truyền nhiệt','Sự nở vì nhiệt','Khái quát về cơ thể người','Hệ vận động ở người','Dinh dưỡng và tiêu hóa ở người','Máu và hệ tuần hoàn của cơ thể người','Hệ hô hấp ở người','Hệ bài tiết ở người','Điều hòa môi trường trong của cơ thể người','Hệ thần kinh và các giác quan ở người','Hệ nội tiết ở người','Da và điều hòa thân nhiệt ở người','Sinh sản ở người','Môi trường và các nhân tố sinh thái','Quần thể sinh vật','Quần xã sinh vật','Hệ sinh thái','Sinh quyển','Cân bằng tự nhiên','Bảo vệ môi trường',
  ],
  '9': [
    'Nhận biết một số dụng cụ, hóa chất. Thuyết trình một vấn đề khoa học','Động năng. Thế năng','Cơ năng','Công và công suất','Khúc xạ ánh sáng','Phản xạ toàn phần','Lăng kính','Thấu kính','Thực hành đo tiêu cự của thấu kính hội tụ','Kính lúp, bài tập thấu kính','Điện trở. Định luật Ohm','Đoạn mạch nối tiếp, song song','Năng lượng của dòng điện và công suất điện','Cảm ứng điện từ. Nguyên tắc tạo ra dòng điện xoay chiều','Tác dụng của dòng điện xoay chiều','Vòng năng lượng trên Trái Đất. Năng lượng hóa thạch','Một số dạng năng lượng tái tạo','Tính chất chung của kim loại','Dãy hoạt động hóa học','Tách kim loại và việc sử dụng hợp kim','Sự khác nhau cơ bản giữa phi kim và kim loại','Giới thiệu về hợp chất hữu cơ','Alkane','Alkene','Nguồn nhiên liệu','Ethylic alcohol','Acetic acid','Lipid','Carbohydrate. Glucose và saccharose','Tinh bột và cellulose','Protein','Polymer','Sơ lược về hóa học vỏ Trái Đất và khai thác tài nguyên từ vỏ Trái Đất','Khai thác đá vôi. Công nghiệp silicate','Khai thác nhiên liệu hóa thạch. Nguồn carbon. Chu trình carbon và sự ấm lên toàn cầu','Khái quát về di truyền học','Các quy luật di truyền của Mendel','Nucleic acid và gene','Tái bản DNA và phiên mã tạo RNA','Dịch mã và mối quan hệ từ gene đến tính trạng','Đột biến gene','Nhiễm sắc thể và bộ nhiễm sắc thể','Nguyên phân và giảm phân','Nhiễm sắc thể giới tính và cơ chế xác định giới tính','Di truyền liên kết','Đột biến nhiễm sắc thể','Di truyền học với con người','Ứng dụng công nghệ di truyền vào đời sống','Khái niệm tiến hóa và các hình thức chọn lọc','Cơ chế tiến hóa','Sự phát sinh và phát triển sự sống trên Trái Đất',
  ],
};

const SCIENCE_TOPICS: Record<string, Array<[string,string,number,number]>> = {
  '6': [['I','Mở đầu về Khoa học tự nhiên',1,8],['II','Chất quanh ta',9,11],['III','Vật liệu, nguyên liệu, nhiên liệu, lương thực - thực phẩm',12,15],['IV','Hỗn hợp - tách chất',16,17],['V','Tế bào',18,21],['VI','Từ tế bào đến cơ thể',22,24],['VII','Đa dạng thế giới sống',25,39],['VIII','Lực và năng lượng trong đời sống',40,51],['IX','Trái Đất và bầu trời',52,55]],
  '7': [['I','Mở đầu và chất - cấu tạo chất',1,7],['II','Tốc độ',8,11],['III','Âm',12,14],['IV','Ánh sáng',15,17],['V','Từ',18,20],['VII','Trao đổi chất và chuyển hóa năng lượng',21,32],['VIII','Cảm ứng ở sinh vật',33,35],['IX','Sinh trưởng và phát triển',36,38],['X','Sinh sản và cơ thể thống nhất',39,42]],
  '8': [['I','Phản ứng hóa học',1,7],['II','Một số hợp chất thông dụng',8,12],['III','Khối lượng riêng và áp suất',13,17],['IV','Tác dụng làm quay của lực',18,19],['V','Điện',20,25],['VI','Nhiệt',26,29],['VII','Sinh học cơ thể người',30,40],['VIII','Sinh vật và môi trường',41,47]],
  '9': [['0','Kĩ năng khoa học',1,1],['I','Năng lượng cơ học',2,4],['II','Ánh sáng',5,10],['III','Điện',11,13],['IV','Điện từ',14,15],['V','Năng lượng với cuộc sống',16,17],['VI','Kim loại và phi kim',18,21],['VII','Hợp chất hữu cơ và hydrocarbon',22,25],['VIII','Ethylic alcohol và acetic acid',26,27],['IX','Lipid, carbohydrate, protein, polymer',28,32],['X','Khai thác tài nguyên từ vỏ Trái Đất',33,35],['XI','Di truyền học Mendel và cơ sở phân tử',36,41],['XII','Di truyền nhiễm sắc thể',42,46],['XIII','Di truyền học với con người và đời sống',47,48],['XIV','Tiến hóa',49,51]],
};

function topicFor(subject: CurriculumSubjectKey, grade: string, n: number) {
  const source = subject === 'MATH' ? MATH_TOPICS[grade] : subject === 'SCIENCE' ? SCIENCE_TOPICS[grade] : [];
  const hit = source?.find(([, , start, end]) => n >= start && n <= end);
  if (!hit) return { id: `${subject}${grade}-CORE`, title: subject === 'LITERATURE' ? `Ngữ văn ${grade}` : `Nội dung lớp ${grade}` };
  return { id: `${subject}${grade}-${hit[0]}`, title: hit[1] };
}

function requirementProfiles(subject: CurriculumSubjectKey, grade: string, lessonCode: string, title: string, topicId: string): CurriculumRequirement[] {
  if (subject === 'MATH') return [
    { id: `TOAN${grade}-${lessonCode}-K1`, grade, topicId, text: `Nhận biết, mô tả và thực hiện được kiến thức, kĩ năng trọng tâm của nội dung “${title}” ở lớp ${grade}.`, competency: 'Tư duy và lập luận toán học', verbs: ['nhận biết','mô tả','thực hiện'], sourceKind: 'normalized_profile', sourceUrl: CURRICULUM_REFERENCE_URL } as CurriculumRequirement,
    { id: `TOAN${grade}-${lessonCode}-K2`, grade, topicId, text: `Giải thích được cách làm, lựa chọn phương pháp và trình bày được lập luận phù hợp khi giải bài toán liên quan đến “${title}”.`, competency: 'Giải quyết vấn đề toán học', verbs: ['giải thích','lập luận','giải quyết'], sourceKind: 'normalized_profile', sourceUrl: CURRICULUM_REFERENCE_URL } as CurriculumRequirement,
    { id: `TOAN${grade}-${lessonCode}-K3`, grade, topicId, text: `Vận dụng kiến thức của “${title}” vào bài toán hoặc tình huống thực tiễn phù hợp với yêu cầu lớp ${grade}.`, competency: 'Mô hình hóa và vận dụng toán học', verbs: ['vận dụng','mô hình hóa'], sourceKind: 'normalized_profile', sourceUrl: CURRICULUM_REFERENCE_URL } as CurriculumRequirement,
  ];
  if (subject === 'LITERATURE') return [
    { id: `NV${grade}-${lessonCode}-DOC`, grade, topicId, text: `Đọc hiểu được văn bản/ngữ liệu tiêu biểu của bài “${title}”, nhận biết và phân tích được nội dung, hình thức và bằng chứng phù hợp với lớp ${grade}.`, competency: 'Đọc', verbs: ['đọc hiểu','nhận biết','phân tích'], sourceKind: 'normalized_profile', sourceUrl: CURRICULUM_REFERENCE_URL } as CurriculumRequirement,
    { id: `NV${grade}-${lessonCode}-VIET`, grade, topicId, text: `Viết được văn bản hoặc đoạn văn phù hợp với kiểu bài, mục đích và yêu cầu ngôn ngữ được tích hợp trong bài “${title}”.`, competency: 'Viết', verbs: ['viết','tạo lập','chỉnh sửa'], sourceKind: 'normalized_profile', sourceUrl: CURRICULUM_REFERENCE_URL } as CurriculumRequirement,
    { id: `NV${grade}-${lessonCode}-NOI`, grade, topicId, text: `Trình bày, trao đổi và phản hồi được ý kiến về nội dung của bài “${title}” bằng ngôn ngữ rõ ràng, có căn cứ.`, competency: 'Nói và nghe', verbs: ['trình bày','trao đổi','phản hồi'], sourceKind: 'normalized_profile', sourceUrl: CURRICULUM_REFERENCE_URL } as CurriculumRequirement,
  ];
  return [
    { id: `KHTN${grade}-${lessonCode}-K1`, grade, topicId, text: `Nêu, mô tả hoặc giải thích được kiến thức cốt lõi của nội dung “${title}” trong phạm vi Khoa học tự nhiên lớp ${grade}.`, competency: 'Nhận thức khoa học tự nhiên', verbs: ['nêu','mô tả','giải thích'], sourceKind: 'normalized_profile', sourceUrl: CURRICULUM_REFERENCE_URL } as CurriculumRequirement,
    { id: `KHTN${grade}-${lessonCode}-K2`, grade, topicId, text: `Thực hiện được quan sát, đo, xử lí thông tin/dữ liệu hoặc thao tác thực hành phù hợp để tìm hiểu nội dung “${title}”, bảo đảm yêu cầu an toàn khi có thí nghiệm.`, competency: 'Tìm hiểu tự nhiên', verbs: ['quan sát','thực hiện','đo','xử lí'], sourceKind: 'normalized_profile', sourceUrl: CURRICULUM_REFERENCE_URL } as CurriculumRequirement,
    { id: `KHTN${grade}-${lessonCode}-K3`, grade, topicId, text: `Vận dụng kiến thức của “${title}” để giải thích hiện tượng hoặc giải quyết tình huống gần gũi trong học tập và đời sống.`, competency: 'Vận dụng kiến thức, kĩ năng', verbs: ['vận dụng','giải thích','giải quyết'], sourceKind: 'normalized_profile', sourceUrl: CURRICULUM_REFERENCE_URL } as CurriculumRequirement,
  ];
}

function buildLessons(subject: CurriculumSubjectKey, titlesByGrade: Record<string,string[]>): { lessons: TextbookLessonEntry[]; requirements: CurriculumRequirement[] } {
  const lessons: TextbookLessonEntry[] = [];
  const requirements: CurriculumRequirement[] = [];
  for (const [grade, titles] of Object.entries(titlesByGrade)) {
    titles.forEach((title, index) => {
      const number = index + 1;
      const lessonCode = `B${number}`;
      const t = subject === 'LITERATURE'
        ? { id: `${subject}${grade}-${number <= 5 ? 'HK1' : 'HK2'}`, title: `Ngữ văn ${grade} – ${number <= 5 ? 'Học kì I' : 'Học kì II'}` }
        : topicFor(subject, grade, number);
      const reqs = requirementProfiles(subject, grade, lessonCode, title, t.id);
      requirements.push(...reqs);
      lessons.push({
        id: `KNTT-${subject}-${grade}-${lessonCode}`,
        grade,
        lessonNumber: number,
        lessonCode,
        title,
        topicId: t.id,
        topicTitle: t.title,
        requirementIds: reqs.map((item) => item.id),
        keywords: normalizeVietnamese(title).split(/\s+/).filter((token) => token.length > 2),
      });
    });
  }
  return { lessons, requirements };
}

const math = buildLessons('MATH', MATH_TITLES);
const literature = buildLessons('LITERATURE', LITERATURE_UNITS);
const science = buildLessons('SCIENCE', SCIENCE_TITLES);

export const PHASE2_LESSONS: TextbookLessonEntry[] = [...math.lessons, ...literature.lessons, ...science.lessons];
export const PHASE2_REQUIREMENTS: CurriculumRequirement[] = [...math.requirements, ...literature.requirements, ...science.requirements];

export function resolvePhase2Subject(subjectName: string): CurriculumSubjectProfile | undefined {
  const n = normalizeVietnamese(subjectName);
  return PHASE2_SUBJECT_PROFILES.find((profile) => profile.aliases.some((alias) => n === normalizeVietnamese(alias) || n.includes(normalizeVietnamese(alias))));
}
