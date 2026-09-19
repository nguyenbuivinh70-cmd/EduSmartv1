import type { Lesson, LessonContent, QuizQuestion } from '../types';

export type OfflineExportFormat = 'zip' | 'html';
export type OfflineVideoMode = 'omit' | 'link' | 'local';

export interface OfflineLessonExportOptions {
  format: OfflineExportFormat;
  videoMode: OfflineVideoMode;
  localVideoFile?: File | null;
}

interface ZipEntryInput {
  name: string;
  data: Uint8Array;
}

const textEncoder = new TextEncoder();

const normalizeText = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim();

const safeFileName = (value: string, fallback: string) => {
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 90);
  return normalized || fallback;
};

const sanitizeQuestion = (question: QuizQuestion) => ({
  id: question.id || '',
  type: question.type || 'single_choice',
  question: normalizeText(question.question),
  options: Array.isArray(question.options) ? question.options.map(normalizeText) : [],
  correctAnswer: normalizeText(question.correctAnswer),
  correctAnswers: Array.isArray(question.correctAnswers) ? question.correctAnswers.map(normalizeText).filter(Boolean) : [],
  explanation: normalizeText(question.explanation),
  hint: normalizeText(question.hint),
  suggestedAnswer: normalizeText(question.suggestedAnswer),
  sentence: normalizeText(question.sentence),
  choices: Array.isArray(question.choices) ? question.choices.map(normalizeText) : [],
});

const sanitizeContent = (content: LessonContent) => {
  const activities = Array.isArray(content.activities)
    ? content.activities.map((activity) => ({
        activity_id: activity.activity_id,
        title: normalizeText(activity.title),
        objective: normalizeText(activity.objective),
        activity_type: activity.activity_type || 'custom',
        estimated_minutes: Number(activity.estimated_minutes || 0),
        summary: normalizeText(activity.summary),
        pages: Array.isArray(activity.pages)
          ? activity.pages.map((page) => ({
              page_id: page.page_id,
              title: normalizeText(page.title),
              subtitle: normalizeText(page.subtitle),
              layout: page.layout || 'title_content',
              blocks: Array.isArray(page.blocks)
                ? page.blocks.map((block) => ({
                    type: block.type || 'paragraph',
                    title: normalizeText(block.title),
                    category: normalizeText(block.category),
                    theme: normalizeText(block.theme),
                    text: normalizeText(block.text),
                  }))
                : [],
              student_prompt: normalizeText(page.student_prompt),
              visual_hint: normalizeText(page.visual_hint),
              visual: page.visual
                ? {
                    type: page.visual.type,
                    title: normalizeText(page.visual.title),
                    items: Array.isArray(page.visual.items) ? page.visual.items.map(normalizeText) : [],
                    center_label: normalizeText(page.visual.center_label),
                    relationship: normalizeText(page.visual.relationship),
                  }
                : undefined,
            }))
          : [],
        interactions: Array.isArray(activity.interactions) ? activity.interactions.map(sanitizeQuestion) : [],
      }))
    : [];

  const sections = Array.isArray(content.sections)
    ? content.sections.map((section) => ({
        section_id: section.section_id,
        title: normalizeText(section.title),
        content: normalizeText(section.content),
        summary: normalizeText(section.summary),
        examples: Array.isArray(section.examples) ? section.examples.map(normalizeText) : [],
        content_blocks: Array.isArray(section.content_blocks)
          ? section.content_blocks.map((block) => ({
              type: block.type || 'paragraph',
              title: normalizeText(block.title),
              text: normalizeText(block.text),
            }))
          : [],
        interactive_questions: Array.isArray(section.interactive_questions) ? section.interactive_questions.map(sanitizeQuestion) : [],
      }))
    : [];

  const fallbackSections = activities.length || sections.length ? [] : [
    content.khoi_dong ? {
      section_id: 'khoi_dong',
      title: 'Khởi động',
      content: normalizeText(content.khoi_dong.tinh_huong || content.khoi_dong.yeu_cau),
      summary: '',
      examples: [],
      content_blocks: [
        ...(content.khoi_dong.muc_tieu ? [{ type: 'key_point', title: 'Mục tiêu', text: normalizeText(content.khoi_dong.muc_tieu) }] : []),
        ...(content.khoi_dong.yeu_cau ? [{ type: 'activity', title: 'Yêu cầu', text: normalizeText(content.khoi_dong.yeu_cau) }] : []),
        ...((content.khoi_dong.cau_hoi_goi_mo || []).map((item) => ({ type: 'paragraph', title: 'Câu hỏi gợi mở', text: normalizeText(item) }))),
      ],
      interactive_questions: [],
    } : null,
    ...((content.hinh_thanh_kien_thuc || []).map((unit, index) => ({
      section_id: unit.id || `kien_thuc_${index + 1}`,
      title: normalizeText(unit.tieu_muc || `Kiến thức ${index + 1}`),
      content: '',
      summary: '',
      examples: Array.isArray(unit.vi_du) ? unit.vi_du.map(normalizeText) : [],
      content_blocks: [
        ...((unit.noi_dung_chinh || []).map((item) => ({ type: 'paragraph', title: '', text: normalizeText(item) }))),
        ...((unit.ghi_nho || []).map((item) => ({ type: 'key_point', title: 'Ghi nhớ', text: normalizeText(item) }))),
      ],
      interactive_questions: [],
    }))),
    content.luyen_tap ? {
      section_id: 'luyen_tap',
      title: 'Luyện tập',
      content: normalizeText(content.luyen_tap.muc_tieu),
      summary: '',
      examples: [],
      content_blocks: [
        ...((content.luyen_tap.tu_luan_ngan || []).map((item) => ({ type: 'activity', title: 'Tự luận ngắn', text: normalizeText(item) }))),
        ...((content.luyen_tap.bai_tap_nhanh || []).map((item) => ({ type: 'activity', title: 'Bài tập nhanh', text: normalizeText(item) }))),
      ],
      interactive_questions: (content.luyen_tap.trac_nghiem || []).map(sanitizeQuestion),
    } : null,
    content.van_dung ? {
      section_id: 'van_dung',
      title: 'Vận dụng',
      content: normalizeText(content.van_dung.muc_tieu),
      summary: '',
      examples: [],
      content_blocks: [
        ...((content.van_dung.nhiem_vu || []).map((item) => ({ type: 'activity', title: 'Nhiệm vụ', text: normalizeText(item) }))),
        ...((content.van_dung.goi_y || []).map((item) => ({ type: 'note', title: 'Gợi ý', text: normalizeText(item) }))),
      ],
      interactive_questions: [],
    } : null,
    content.tong_ket ? {
      section_id: 'tong_ket',
      title: 'Tổng kết',
      content: '',
      summary: '',
      examples: [],
      content_blocks: [
        ...((content.tong_ket.ghi_nho_trong_tam || []).map((item) => ({ type: 'key_point', title: 'Ghi nhớ', text: normalizeText(item) }))),
        ...((content.tong_ket.canh_bao_loi_sai || []).map((item) => ({ type: 'note', title: 'Cần lưu ý', text: normalizeText(item) }))),
      ],
      interactive_questions: [],
    } : null,
  ].filter(Boolean);

  return {
    schema_version: content.schema_version || 'lesson_v3',
    title: normalizeText(content.title || content.metadata?.tieu_de),
    metadata: {
      tieu_de: normalizeText(content.metadata?.tieu_de),
      lesson_number: content.metadata?.lesson_number,
      lesson_name: normalizeText(content.metadata?.lesson_name),
      mon_hoc: normalizeText(content.metadata?.mon_hoc),
      khoi: normalizeText(content.metadata?.khoi),
      chu_de: normalizeText(content.metadata?.chu_de),
      tom_tat: normalizeText(content.metadata?.tom_tat),
      muc_tieu_bai_hoc: Array.isArray(content.metadata?.muc_tieu_bai_hoc) ? content.metadata.muc_tieu_bai_hoc.map(normalizeText) : [],
      tu_khoa: Array.isArray(content.metadata?.tu_khoa) ? content.metadata.tu_khoa.map(normalizeText) : [],
      thong_diep_chinh: normalizeText(content.metadata?.thong_diep_chinh),
    },
    activities,
    sections: sections.length ? sections : fallbackSections,
    final_quiz: Array.isArray(content.final_quiz) ? content.final_quiz.map(sanitizeQuestion) : [],
    assessment: content.assessment || { interactive_weight: 0, final_quiz_weight: 1, score_scale: 10, pass_score: 5 },
    legacy: {
      khoi_dong: content.khoi_dong,
      hinh_thanh_kien_thuc: content.hinh_thanh_kien_thuc,
      luyen_tap: content.luyen_tap,
      van_dung: content.van_dung,
      tong_ket: content.tong_ket,
    },
  };
};

const escapeScriptJson = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c').replace(/-->/g, '--\\u003e');

const youtubeEmbedUrl = (url: string) => {
  const raw = String(url || '').trim();
  if (!raw) return '';
  const short = raw.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/i)?.[1];
  const watch = raw.match(/[?&]v=([A-Za-z0-9_-]{6,})/i)?.[1];
  const embed = raw.match(/youtube(?:-nocookie)?\.com\/embed\/([A-Za-z0-9_-]{6,})/i)?.[1];
  const id = short || watch || embed;
  return id ? `https://www.youtube.com/embed/${id}` : raw;
};

const buildRuntimeHtml = (payload: any, videoSource: { mode: OfflineVideoMode; url: string; localPath?: string }) => `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${String(payload.lesson.title || 'Bài học offline').replace(/[<>&"]/g, '')}</title>
<style>
:root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#0f172a;background:#eef2ff}*{box-sizing:border-box}body{margin:0;background:linear-gradient(135deg,#eef2ff,#f8fafc 55%,#fdf4ff);min-height:100vh}.top{position:sticky;top:0;z-index:20;background:linear-gradient(90deg,#4f46e5,#7c3aed,#c026d3);color:#fff;padding:18px 24px;box-shadow:0 10px 30px rgba(79,70,229,.18)}.top h1{margin:0;font-size:clamp(20px,3vw,30px)}.top p{margin:6px 0 0;opacity:.88}.layout{display:grid;grid-template-columns:290px minmax(0,1fr);gap:18px;max-width:1450px;margin:0 auto;padding:18px}.side,.card{background:#fff;border:1px solid #e2e8f0;border-radius:22px;box-shadow:0 10px 30px rgba(15,23,42,.06)}.side{padding:16px;position:sticky;top:110px;height:calc(100vh - 132px);overflow:auto}.profile{display:grid;gap:8px;padding:12px;border-radius:16px;background:#f8fafc}.profile input{width:100%;padding:10px 12px;border:1px solid #cbd5e1;border-radius:12px}.nav{display:grid;gap:8px;margin-top:14px}.nav button{width:100%;border:0;background:#f8fafc;color:#334155;text-align:left;padding:11px 12px;border-radius:13px;font-weight:700;cursor:pointer}.nav button.active{background:#4f46e5;color:#fff}.nav button.done::after{content:" ✓";float:right}.main{display:grid;gap:16px}.card{padding:22px}.hero{background:linear-gradient(135deg,#312e81,#6d28d9,#a21caf);color:#fff}.hero .pill{display:inline-flex;background:rgba(255,255,255,.16);border-radius:999px;padding:6px 10px;font-size:12px;font-weight:800}.muted{color:#64748b}.grid2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.block{border-radius:16px;background:#f8fafc;padding:14px;border:1px solid #e2e8f0}.block strong{display:block;margin-bottom:6px}.question{border:1px solid #e2e8f0;border-radius:18px;padding:16px;margin-top:14px}.options{display:grid;gap:9px;margin-top:10px}.option{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border:1px solid #dbeafe;border-radius:13px;background:#fff}.question input[type=text],.question textarea{width:100%;border:1px solid #cbd5e1;border-radius:12px;padding:10px 12px;margin-top:10px}.btn{border:0;border-radius:14px;padding:11px 15px;font-weight:800;cursor:pointer}.btn.primary{background:#4f46e5;color:#fff}.btn.secondary{background:#eef2ff;color:#4338ca}.btn.success{background:#059669;color:#fff}.btn.danger{background:#fff1f2;color:#be123c}.actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:16px}.feedback{margin-top:10px;padding:10px 12px;border-radius:12px;background:#ecfdf5;color:#065f46}.feedback.bad{background:#fff1f2;color:#9f1239}.good{color:#047857}.bad{color:#be123c}.video iframe,.video video{width:100%;aspect-ratio:16/9;border:0;border-radius:18px;background:#020617}.notice{padding:12px 14px;border-radius:14px;background:#fff7ed;color:#9a3412;border:1px solid #fed7aa}.result{font-size:36px;font-weight:900;color:#4f46e5}.footer{max-width:1450px;margin:0 auto;padding:0 18px 28px;color:#64748b;font-size:13px}.hidden{display:none!important}@media(max-width:900px){.layout{grid-template-columns:1fr}.side{position:relative;top:auto;height:auto}.grid2{grid-template-columns:1fr}}
</style>
</head>
<body>
<header class="top"><h1>${String(payload.lesson.title || 'Bài học offline').replace(/</g,'&lt;')}</h1><p>${String(payload.lesson.subject || '')} • Khối ${String(payload.lesson.grade || '')} • Bản offline ${String(payload.packageVersion || '')}</p></header>
<div class="layout">
<aside class="side">
<div class="profile"><strong>Thông tin người học</strong><input id="studentName" placeholder="Họ và tên"/><input id="studentClass" placeholder="Lớp"/></div>
<div id="nav" class="nav"></div>
<div class="actions"><button id="exportResult" class="btn secondary">Xuất kết quả</button><button id="reset" class="btn danger">Làm lại bài</button></div>
</aside>
<main id="main" class="main"></main>
</div>
<footer class="footer">EduSmart Offline Lesson Package • Tiến độ được lưu trên trình duyệt của máy này. Gói offline không tự đồng bộ điểm lên hệ thống trực tuyến.</footer>
<script id="lessonData" type="application/json">${escapeScriptJson(payload)}</script>
<script>
(()=>{
const P=JSON.parse(document.getElementById('lessonData').textContent);const key='edusmart_offline_'+P.packageId;const qs=(s,r=document)=>r.querySelector(s);const main=qs('#main'),nav=qs('#nav');
const norm=v=>String(v??'').trim().toLowerCase().replace(/\\s+/g,' ');const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
let state={current:'intro',completed:[],answers:{},finalSubmitted:false,finalScore:null,studentName:'',studentClass:'',...JSON.parse(localStorage.getItem(key)||'{}')};
const save=()=>localStorage.setItem(key,JSON.stringify(state));
const activities=(P.content.activities||[]).length?P.content.activities:(P.content.sections||[]).map((s,i)=>({activity_id:s.section_id||('S'+(i+1)),title:s.title,pages:[{page_id:'p1',title:s.title,blocks:[...(s.content?[{type:'paragraph',text:s.content}]:[]),...(s.content_blocks||[])]}],interactions:s.interactive_questions||[],summary:s.summary||''}));
const navItems=[{id:'intro',title:'Tổng quan'},...activities.map((a,i)=>({id:a.activity_id,title:(i+1)+'. '+a.title})),{id:'final',title:'Kiểm tra cuối bài'},{id:'result',title:'Kết quả'}];
const answerOf=q=>norm((q.correctAnswers&&q.correctAnswers[0])||q.correctAnswer||q.suggestedAnswer||'');
const isCorrect=(q,val)=>{let a=answerOf(q),b=norm(val);if(!a)return null;const truth=v=>['true','dung','đúng','1','yes'].includes(v)?'true':['false','sai','0','no'].includes(v)?'false':v;a=truth(a);b=truth(b);if(a===b)return true;if(/^[a-f]$/.test(a)&&Array.isArray(q.options)){const idx=a.charCodeAt(0)-97;return norm(q.options[idx])===norm(val)}return false};
function renderNav(){nav.innerHTML='';navItems.forEach(it=>{const b=document.createElement('button');b.textContent=it.title;b.className=(state.current===it.id?'active ':'')+(state.completed.includes(it.id)?'done':'');if(it.id==='result'&&!state.finalSubmitted){b.disabled=true;b.title='Nộp bài kiểm tra cuối bài để xem kết quả';}else{b.onclick=()=>{state.current=it.id;save();render()}}nav.appendChild(b)})}
function blockHtml(b){return '<div class="block">'+(b.title?'<strong>'+esc(b.title)+'</strong>':'')+'<div>'+esc(b.text||'')+'</div></div>'}
function questionHtml(q,idx,prefix,allowCheck=true,disabled=false){const id=prefix+'_'+idx;const saved=state.answers[id]??'';const opts=(q.options&&q.options.length?q.options:(q.type==='true_false'?['Đúng','Sai']:q.choices||[]));let input='';const dis=disabled?' disabled':'';if(opts.length){input='<div class="options">'+opts.map((o,i)=>'<label class="option"><input type="radio" name="'+id+'" value="'+esc(o)+'" '+(saved===o?'checked':'')+dis+'><span>'+esc(o)+'</span></label>').join('')+'</div>'}else if(q.type==='short_answer'){input='<textarea rows="3" data-q="'+id+'" placeholder="Nhập câu trả lời"'+dis+'>'+esc(saved)+'</textarea>'}else{input='<input type="text" data-q="'+id+'" value="'+esc(saved)+'" placeholder="Nhập câu trả lời"'+dis+'>'}return '<div class="question" data-id="'+id+'"><strong>Câu '+(idx+1)+'. '+esc(q.question||q.sentence||'')+'</strong>'+input+(allowCheck?'<div class="actions"><button class="btn secondary checkQ" data-id="'+id+'">Kiểm tra</button></div>':'')+'<div class="feedback hidden"></div></div>'}
function bindQuestions(list,prefix,allowCheck=true){list.forEach((q,idx)=>{const id=prefix+'_'+idx;document.querySelectorAll('input[name="'+CSS.escape(id)+'"]').forEach(el=>el.addEventListener('change',e=>{state.answers[id]=e.target.value;save()}));const txt=document.querySelector('[data-q="'+CSS.escape(id)+'"]');if(txt)txt.addEventListener('input',e=>{state.answers[id]=e.target.value;save()});if(!allowCheck)return;const btn=document.querySelector('.checkQ[data-id="'+CSS.escape(id)+'"]');if(btn)btn.onclick=()=>{const wrap=btn.closest('.question'),fb=wrap.querySelector('.feedback'),result=isCorrect(q,state.answers[id]||'');fb.classList.remove('hidden','bad');if(result===true){fb.textContent='Chính xác. '+(q.explanation||'');}else if(result===false){fb.classList.add('bad');fb.textContent='Chưa chính xác. '+(q.explanation||('Đáp án: '+((q.correctAnswers&&q.correctAnswers[0])||q.correctAnswer||'')));}else{fb.textContent=q.suggestedAnswer?('Gợi ý đáp án: '+q.suggestedAnswer):(q.explanation||'Đã lưu câu trả lời.');}}})}
function renderIntro(){const m=P.content.metadata||{};let video='';if(P.video.mode==='local'&&P.video.url){video='<div class="card video"><h2>Video chuẩn bị</h2><video controls preload="metadata" src="'+esc(P.video.url)+'"></video></div>'}else if(P.video.mode==='link'&&P.video.url){video='<div class="card video"><h2>Video chuẩn bị</h2><div class="notice">Video này cần kết nối Internet.</div><iframe allowfullscreen src="'+esc(P.video.url)+'"></iframe></div>'}return '<section class="card hero"><span class="pill">BÀI HỌC OFFLINE</span><h2>'+esc(P.lesson.title)+'</h2><p>'+esc(P.lesson.summary||m.tom_tat||'')+'</p></section><section class="card"><h2>Mục tiêu bài học</h2><div class="grid2">'+((m.muc_tieu_bai_hoc||[]).map(x=>'<div class="block">'+esc(x)+'</div>').join('')||'<div class="muted">Nội dung bài học đã sẵn sàng để học ngoại tuyến.</div>')+'</div></section>'+video+'<section class="card"><div class="actions"><button class="btn primary" id="startBtn">Bắt đầu học</button></div></section>'}
function renderActivity(a){const pages=(a.pages||[]).map(p=>'<section class="card"><h2>'+esc(p.title||a.title)+'</h2>'+(p.subtitle?'<p class="muted">'+esc(p.subtitle)+'</p>':'')+'<div class="grid2">'+(p.blocks||[]).map(blockHtml).join('')+'</div>'+(p.student_prompt?'<div class="notice" style="margin-top:14px">'+esc(p.student_prompt)+'</div>':'')+'</section>').join('');const inter=(a.interactions||[]);return pages+'<section class="card"><h2>Tương tác</h2>'+(inter.length?inter.map((q,i)=>questionHtml(q,i,'act_'+a.activity_id)).join(''):'<p class="muted">Không có câu hỏi tương tác trong hoạt động này.</p>')+'<div class="actions"><button class="btn success" id="doneActivity">Hoàn thành hoạt động</button></div></section>'}
function renderFinal(){const q=P.content.final_quiz||[];if(!q.length)return '<section class="card"><h2>Kiểm tra cuối bài</h2><p class="muted">Bài học này chưa có câu hỏi cuối bài.</p><div class="actions"><button class="btn success" id="finishNoQuiz">Hoàn thành bài học</button></div></section>';return '<section class="card"><h2>Kiểm tra cuối bài</h2><p class="notice">Hãy hoàn thành tất cả câu hỏi rồi bấm <b>Nộp bài và xem kết quả</b>. Đáp án và giải thích chỉ hiển thị sau khi nộp.</p>'+q.map((x,i)=>questionHtml(x,i,'final',false,state.finalSubmitted)).join('')+(state.finalSubmitted?'<div class="notice">Bài đã được nộp. Mở mục Kết quả để xem điểm, đáp án và giải thích.</div>':'<div class="actions"><button class="btn success" id="submitFinal">Nộp bài và xem kết quả</button></div>')+'</section>'}
function renderResult(){if(!state.finalSubmitted)return '<section class="card"><h2>Kết quả</h2><div class="notice">Em cần nộp bài kiểm tra cuối bài trước khi xem kết quả và giải thích.</div></section>';const q=P.content.final_quiz||[];const review=q.map((x,i)=>{const id='final_'+i,val=state.answers[id]||'',ok=isCorrect(x,val),answer=(x.correctAnswers&&x.correctAnswers[0])||x.correctAnswer||x.suggestedAnswer||'';return '<div class="question"><strong>Câu '+(i+1)+'. '+esc(x.question||x.sentence||'')+'</strong><p><b>Em chọn:</b> '+esc(val||'Chưa trả lời')+'</p><p class="'+(ok===true?'good':'bad')+'"><b>'+(ok===true?'Đúng':'Chưa đúng')+'</b></p><p><b>Đáp án:</b> '+esc(answer||'-')+'</p>'+(x.explanation?'<div class="feedback"><b>Giải thích:</b> '+esc(x.explanation)+'</div>':'')+'</div>'}).join('');return '<section class="card hero"><span class="pill">KẾT QUẢ OFFLINE</span><h2>'+esc(state.studentName||'Người học')+'</h2><div class="result">'+(state.finalScore==null?'Chưa có điểm':Number(state.finalScore).toFixed(1)+'/10')+'</div><p>'+esc(P.lesson.title)+'</p></section><section class="card"><p><b>Lớp:</b> '+esc(state.studentClass||'-')+'</p><p><b>Hoạt động hoàn thành:</b> '+state.completed.filter(x=>x!=='final'&&x!=='result').length+'/'+activities.length+'</p><p><b>Thời điểm:</b> '+esc(state.completedAt||'-')+'</p><div class="actions"><button class="btn secondary" id="exportResult2">Xuất kết quả</button></div></section>'+(q.length?'<section class="card"><h2>Đáp án và giải thích</h2>'+review+'</section>':'')}
function render(){renderNav();if(state.current==='intro')main.innerHTML=renderIntro();else if(state.current==='final')main.innerHTML=renderFinal();else if(state.current==='result')main.innerHTML=renderResult();else{const a=activities.find(x=>x.activity_id===state.current);main.innerHTML=a?renderActivity(a):renderIntro()}bind();window.scrollTo({top:0,behavior:'smooth'})}
function bind(){const s=qs('#startBtn');if(s)s.onclick=()=>{state.current=activities[0]?.activity_id||'final';save();render()};const a=activities.find(x=>x.activity_id===state.current);if(a)bindQuestions(a.interactions||[],'act_'+a.activity_id);if(state.current==='final')bindQuestions(P.content.final_quiz||[],'final',false);const done=qs('#doneActivity');if(done)done.onclick=()=>{if(!state.completed.includes(state.current))state.completed.push(state.current);const idx=activities.findIndex(x=>x.activity_id===state.current);state.current=activities[idx+1]?.activity_id||'final';save();render()};const no=qs('#finishNoQuiz');if(no)no.onclick=()=>{state.finalScore=null;state.finalSubmitted=true;state.completedAt=new Date().toLocaleString('vi-VN');state.current='result';save();render()};const sub=qs('#submitFinal');if(sub)sub.onclick=()=>{const q=P.content.final_quiz||[];const unanswered=q.filter((x,i)=>!String(state.answers['final_'+i]??'').trim()).length;if(unanswered>0&&!confirm('Em còn '+unanswered+' câu chưa trả lời. Vẫn nộp bài?'))return;let correct=0;q.forEach((x,i)=>{if(isCorrect(x,state.answers['final_'+i]||'')===true)correct++});state.finalScore=q.length?Math.round((correct/q.length)*100)/10:0;state.finalSubmitted=true;state.completedAt=new Date().toLocaleString('vi-VN');if(!state.completed.includes('final'))state.completed.push('final');state.current='result';save();render()};const ex=qs('#exportResult2');if(ex)ex.onclick=exportResult}
function exportResult(){const result={packageId:P.packageId,lessonId:P.lesson.id,lessonTitle:P.lesson.title,studentName:state.studentName,studentClass:state.studentClass,score:state.finalScore,completedAt:state.completedAt,completedActivities:state.completed,answers:state.answers};const blob=new Blob([JSON.stringify(result,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='Ket_qua_'+(P.lesson.fileBase||'bai_hoc')+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000)}
qs('#studentName').value=state.studentName||'';qs('#studentClass').value=state.studentClass||'';qs('#studentName').oninput=e=>{state.studentName=e.target.value;save()};qs('#studentClass').oninput=e=>{state.studentClass=e.target.value;save()};qs('#exportResult').onclick=exportResult;qs('#reset').onclick=()=>{if(confirm('Xóa tiến độ offline và làm lại bài từ đầu?')){localStorage.removeItem(key);location.reload()}};render();
})();
</script>
</body>
</html>`;

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

const crc32 = (data: Uint8Array) => {
  let crc = 0xffffffff;
  for (const byte of data) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

const dosDateTime = (date = new Date()) => {
  const year = Math.max(1980, date.getFullYear());
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = (year - 1980) << 9 | (date.getMonth() + 1) << 5 | date.getDate();
  return { time, day };
};

const makeStoredZip = (entries: ZipEntryInput[]) => {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;
  const { time, day } = dosDateTime();
  for (const entry of entries) {
    const name = textEncoder.encode(entry.name.replace(/\\/g, '/'));
    const data = entry.data;
    const crc = crc32(data);
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true); lv.setUint16(8, 0, true);
    lv.setUint16(10, time, true); lv.setUint16(12, day, true); lv.setUint32(14, crc, true); lv.setUint32(18, data.length, true); lv.setUint32(22, data.length, true);
    lv.setUint16(26, name.length, true); lv.setUint16(28, 0, true); local.set(name, 30);
    localParts.push(local, data);

    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true); cv.setUint16(10, 0, true);
    cv.setUint16(12, time, true); cv.setUint16(14, day, true); cv.setUint32(16, crc, true); cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true);
    cv.setUint16(28, name.length, true); cv.setUint16(30, 0, true); cv.setUint16(32, 0, true); cv.setUint16(34, 0, true); cv.setUint16(36, 0, true); cv.setUint32(38, 0, true); cv.setUint32(42, offset, true); central.set(name, 46);
    centralParts.push(central);
    offset += local.length + data.length;
  }
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(4, 0, true); ev.setUint16(6, 0, true); ev.setUint16(8, entries.length, true); ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true); ev.setUint32(16, offset, true); ev.setUint16(20, 0, true);
  return new Blob([...localParts, ...centralParts, end], { type: 'application/zip' });
};

const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 3000);
};

const fileToDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(reader.error || new Error('Không đọc được file video.'));
  reader.readAsDataURL(file);
});

export async function exportOfflineLessonPackage(lesson: Lesson, content: LessonContent, options: OfflineLessonExportOptions) {
  const fileBase = safeFileName(`${lesson.mon_hoc || 'Mon'}_Khoi${lesson.khoi || ''}_Bai${lesson.lesson_number || ''}_${lesson.lesson_name || lesson.tieu_de}`, 'EduSmart_Offline_Lesson');
  const exportedAt = new Date().toISOString();
  const packageId = `${lesson.lesson_id || fileBase}_v68818`;
  const publicLesson = {
    id: lesson.lesson_id,
    title: lesson.tieu_de,
    number: lesson.lesson_number || null,
    name: lesson.lesson_name || '',
    summary: lesson.mo_ta || content.metadata?.tom_tat || '',
    subject: lesson.mon_hoc || content.metadata?.mon_hoc || '',
    grade: lesson.khoi || content.metadata?.khoi || '',
    fileBase,
  };
  const cleanContent = sanitizeContent(content);
  let videoUrl = '';
  let localVideoBytes: Uint8Array | null = null;
  let localVideoName = '';

  if (options.videoMode === 'link') {
    videoUrl = youtubeEmbedUrl(lesson.intro_video_embed_url || lesson.intro_video_url || content.intro_video_embed_url || content.intro_video_url || '');
  } else if (options.videoMode === 'local' && options.localVideoFile) {
    if (options.format === 'html') {
      videoUrl = await fileToDataUrl(options.localVideoFile);
    } else {
      const ext = options.localVideoFile.name.split('.').pop()?.toLowerCase() || 'mp4';
      localVideoName = `assets/preparation-video.${safeFileName(ext, 'mp4')}`;
      localVideoBytes = new Uint8Array(await options.localVideoFile.arrayBuffer());
      videoUrl = localVideoName;
    }
  }

  const payload = {
    packageVersion: '6.88.21',
    schemaVersion: 1,
    packageId,
    exportedAt,
    lesson: publicLesson,
    content: cleanContent,
    video: { mode: options.videoMode, url: videoUrl },
  };
  const html = buildRuntimeHtml(payload, { mode: options.videoMode, url: videoUrl, localPath: localVideoName });

  if (options.format === 'html') {
    downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), `${fileBase}_Offline.html`);
    return { fileName: `${fileBase}_Offline.html`, format: 'html' as const, size: new Blob([html]).size };
  }

  const manifest = {
    package_version: '6.88.21',
    schema_version: 1,
    lesson_id: lesson.lesson_id,
    lesson_title: lesson.tieu_de,
    subject: publicLesson.subject,
    grade: publicLesson.grade,
    exported_at: exportedAt,
    offline_runtime: 'browser-file-v1',
    video_mode: options.videoMode,
  };
  const guide = `<!doctype html><meta charset="utf-8"><title>Hướng dẫn sử dụng</title><style>body{font-family:system-ui;max-width:850px;margin:40px auto;padding:0 20px;line-height:1.7;color:#0f172a}code{background:#f1f5f9;padding:2px 6px;border-radius:6px}</style><h1>EduSmart – Bài học Offline</h1><p>Giải nén toàn bộ file ZIP, sau đó mở <code>index.html</code> bằng Chrome, Edge hoặc Firefox. Không đổi vị trí thư mục <code>assets</code> nếu gói có video cục bộ.</p><p>Tiến độ và điểm được lưu trên chính trình duyệt/máy tính đang sử dụng. Gói offline không tự đồng bộ kết quả về hệ thống EduSmart trực tuyến.</p><p>Nếu gói sử dụng liên kết video trực tuyến, phần video cần Internet; các nội dung còn lại vẫn học offline.</p>`;
  const entries: ZipEntryInput[] = [
    { name: 'index.html', data: textEncoder.encode(html) },
    { name: 'lesson.json', data: textEncoder.encode(JSON.stringify({ lesson: publicLesson, content: cleanContent }, null, 2)) },
    { name: 'manifest.json', data: textEncoder.encode(JSON.stringify(manifest, null, 2)) },
    { name: 'HUONG_DAN.html', data: textEncoder.encode(guide) },
  ];
  if (localVideoBytes && localVideoName) entries.push({ name: localVideoName, data: localVideoBytes });
  const zip = makeStoredZip(entries);
  downloadBlob(zip, `${fileBase}_Offline.zip`);
  return { fileName: `${fileBase}_Offline.zip`, format: 'zip' as const, size: zip.size };
}
