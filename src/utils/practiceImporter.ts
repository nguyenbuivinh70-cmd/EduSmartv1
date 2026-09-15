import type {
  InteractivePracticeActivity,
  InteractivePracticeImportSummary,
  InteractivePracticeManifest,
} from '../types';

class LiteralParser {
  private pos = 0;
  constructor(private readonly source: string) {}

  parse() {
    const value = this.parseValue();
    this.skipIgnored();
    return value;
  }

  private skipIgnored() {
    while (this.pos < this.source.length) {
      const ch = this.source[this.pos];
      if (/\s/.test(ch)) { this.pos += 1; continue; }
      if (ch === '/' && this.source[this.pos + 1] === '/') {
        this.pos += 2;
        while (this.pos < this.source.length && this.source[this.pos] !== '\n') this.pos += 1;
        continue;
      }
      if (ch === '/' && this.source[this.pos + 1] === '*') {
        this.pos += 2;
        const end = this.source.indexOf('*/', this.pos);
        this.pos = end >= 0 ? end + 2 : this.source.length;
        continue;
      }
      break;
    }
  }

  private parseValue(): any {
    this.skipIgnored();
    const ch = this.source[this.pos];
    if (ch === '{') return this.parseObject();
    if (ch === '[') return this.parseArray();
    if (ch === '"' || ch === "'") return this.parseString();
    if (ch === '-' || /\d/.test(ch || '')) return this.parseNumber();
    const identifier = this.parseIdentifier();
    if (identifier === 'true') return true;
    if (identifier === 'false') return false;
    if (identifier === 'null') return null;
    if (identifier === 'undefined') return undefined;
    if (identifier) return identifier;
    throw new Error(`Không đọc được dữ liệu tại vị trí ${this.pos}.`);
  }

  private parseObject() {
    const result: Record<string, any> = {};
    this.pos += 1;
    while (this.pos < this.source.length) {
      this.skipIgnored();
      if (this.source[this.pos] === '}') { this.pos += 1; break; }
      const key = this.source[this.pos] === '"' || this.source[this.pos] === "'" ? this.parseString() : this.parseIdentifier();
      if (!key) throw new Error(`Khóa dữ liệu không hợp lệ tại vị trí ${this.pos}.`);
      this.skipIgnored();
      if (this.source[this.pos] !== ':') throw new Error(`Thiếu dấu : sau khóa ${key}.`);
      this.pos += 1;
      result[String(key)] = this.parseValue();
      this.skipIgnored();
      if (this.source[this.pos] === ',') { this.pos += 1; continue; }
      if (this.source[this.pos] === '}') { this.pos += 1; break; }
      throw new Error(`Cấu trúc object không hợp lệ tại vị trí ${this.pos}.`);
    }
    return result;
  }

  private parseArray() {
    const result: any[] = [];
    this.pos += 1;
    while (this.pos < this.source.length) {
      this.skipIgnored();
      if (this.source[this.pos] === ']') { this.pos += 1; break; }
      result.push(this.parseValue());
      this.skipIgnored();
      if (this.source[this.pos] === ',') { this.pos += 1; continue; }
      if (this.source[this.pos] === ']') { this.pos += 1; break; }
      throw new Error(`Cấu trúc mảng không hợp lệ tại vị trí ${this.pos}.`);
    }
    return result;
  }

  private parseString() {
    const quote = this.source[this.pos++];
    let out = '';
    while (this.pos < this.source.length) {
      const ch = this.source[this.pos++];
      if (ch === quote) return out;
      if (ch !== '\\') { out += ch; continue; }
      if (this.pos >= this.source.length) break;
      const esc = this.source[this.pos++];
      if (esc === 'n') out += '\n';
      else if (esc === 'r') out += '\r';
      else if (esc === 't') out += '\t';
      else if (esc === 'b') out += '\b';
      else if (esc === 'f') out += '\f';
      else if (esc === 'v') out += '\v';
      else if (esc === '0') out += '\0';
      else if (esc === 'u') {
        const hex = this.source.slice(this.pos, this.pos + 4);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) throw new Error('Chuỗi Unicode không hợp lệ.');
        out += String.fromCharCode(parseInt(hex, 16));
        this.pos += 4;
      } else if (esc === 'x') {
        const hex = this.source.slice(this.pos, this.pos + 2);
        if (!/^[0-9a-fA-F]{2}$/.test(hex)) throw new Error('Chuỗi hex không hợp lệ.');
        out += String.fromCharCode(parseInt(hex, 16));
        this.pos += 2;
      } else out += esc;
    }
    throw new Error('Chuỗi dữ liệu chưa đóng dấu nháy.');
  }

  private parseNumber() {
    const start = this.pos;
    if (this.source[this.pos] === '-') this.pos += 1;
    while (/\d/.test(this.source[this.pos] || '')) this.pos += 1;
    if (this.source[this.pos] === '.') {
      this.pos += 1;
      while (/\d/.test(this.source[this.pos] || '')) this.pos += 1;
    }
    if (/[eE]/.test(this.source[this.pos] || '')) {
      this.pos += 1;
      if (/[+-]/.test(this.source[this.pos] || '')) this.pos += 1;
      while (/\d/.test(this.source[this.pos] || '')) this.pos += 1;
    }
    return Number(this.source.slice(start, this.pos));
  }

  private parseIdentifier() {
    this.skipIgnored();
    const start = this.pos;
    if (!/[A-Za-z_$À-ỹ]/.test(this.source[this.pos] || '')) return '';
    this.pos += 1;
    while (/[A-Za-z0-9_$À-ỹ-]/.test(this.source[this.pos] || '')) this.pos += 1;
    return this.source.slice(start, this.pos);
  }
}

function extractTitle(html: string) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return String(match?.[1] || 'Bài luyện tập tương tác').replace(/<[^>]+>/g, '').trim();
}


function decodeHtmlText(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractFinalReflection(html: string) {
  const textareaMatch = /<textarea[^>]*id=["']final-answer["'][^>]*>/i.exec(html);
  if (!textareaMatch) return '';
  const before = html.slice(Math.max(0, textareaMatch.index - 2600), textareaMatch.index);
  const paragraphs = [...before.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match) => decodeHtmlText(match[1]))
    .filter(Boolean);
  const preferred = [...paragraphs].reverse().find((text) => /hãy tưởng tượng|ít nhất\s*3\s*ví dụ|cuộc sống sẽ thay đổi/i.test(text));
  const prompt = preferred || paragraphs[paragraphs.length - 1] || '';
  return prompt.replace(/^(["“])([\s\S]*)(["”])$/, '$2').trim();
}

function appendReflectionActivity(activities: InteractivePracticeActivity[], prompt: string) {
  if (!prompt) return;
  activities.push({
    id: 'activity_reflection',
    type: 'reflection',
    title: 'Thử thách cuối cùng',
    instructions: prompt,
    prompt,
    placeholder: 'Viết câu trả lời của em...',
    maxScore: 0,
    minExamples: /3\s*ví dụ/i.test(prompt) ? 3 : undefined,
  });
}

function extractManifestScript(html: string) {
  const match = html.match(/<script[^>]*id=["']edusmart-practice-manifest["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1].trim());
    return parsed && typeof parsed === 'object' ? parsed as InteractivePracticeManifest : null;
  } catch {
    throw new Error('Practice Manifest trong file không phải JSON hợp lệ.');
  }
}

function extractDataLiteral(html: string) {
  const assignment = /\b(?:const|let|var)\s+DATA\s*=\s*/g.exec(html);
  if (!assignment) throw new Error('Không tìm thấy khối dữ liệu const DATA trong file HTML.');
  const start = html.indexOf('{', assignment.index + assignment[0].length);
  if (start < 0) throw new Error('Không tìm thấy object DATA trong file HTML.');
  return new LiteralParser(html.slice(start)).parse();
}

function cleanString(value: unknown) {
  return String(value ?? '').trim();
}

function categoryLabel(id: string) {
  const labels: Record<string, string> = {
    'y-te': 'Y tế', y_te: 'Y tế',
    'giao-duc': 'Giáo dục', giao_duc: 'Giáo dục',
    'giao-thong': 'Giao thông', giao_thong: 'Giao thông',
    'khoa-hoc': 'Khoa học', khoa_hoc: 'Khoa học', 'nghien-cuu': 'Khoa học',
    'giai-tri': 'Giải trí', giai_tri: 'Giải trí',
    'san-xuat': 'Sản xuất', san_xuat: 'Sản xuất',
    'gia-dinh': 'Gia đình', gia_dinh: 'Gia đình',
  };
  return labels[id] || id.replace(/[-_]+/g, ' ').replace(/(^|\s)\S/g, (m) => m.toUpperCase());
}

function buildT9Manifest(data: any, title: string, sourceFileName: string, reflectionPrompt = ''): InteractivePracticeManifest {
  const activities: InteractivePracticeActivity[] = [];
  const task1 = Array.isArray(data.task1) ? data.task1 : [];
  if (task1.length) {
    activities.push({
      id: 'activity_1', type: 'classification', title: 'Săn tìm bộ xử lí',
      instructions: 'Phân loại từng thiết bị vào nhóm có bộ xử lí hoặc không có bộ xử lí.', maxScore: 2.5,
      categories: [{ id: 'yes', label: 'Có bộ xử lí' }, { id: 'no', label: 'Không có bộ xử lí' }],
      items: task1.map((item: any, index: number) => ({
        id: cleanString(item.id) || `t1_${index + 1}`, label: cleanString(item.name), icon: cleanString(item.emoji),
        correctCategory: item.hasCpu === true ? 'yes' : 'no', explanation: cleanString(item.explain),
      })),
    });
  }
  const task2 = Array.isArray(data.task2) ? data.task2 : [];
  if (task2.length) {
    activities.push({
      id: 'activity_2', type: 'sequence', title: 'Bên trong thiết bị',
      instructions: 'Sắp xếp đúng thứ tự Thông tin vào → Xử lí → Kết quả ra cho từng thiết bị.', maxScore: 2.5,
      sequences: task2.map((item: any, index: number) => ({
        id: cleanString(item.id) || `t2_${index + 1}`, title: cleanString(item.name),
        steps: [cleanString(item.in), cleanString(item.proc || item.process), cleanString(item.out)].filter(Boolean),
      })),
    });
  }
  const task3 = data.task3 && typeof data.task3 === 'object' ? data.task3 : null;
  if (task3 && Array.isArray(task3.apps)) {
    const fields = Array.isArray(task3.fields) ? task3.fields : [];
    const abilities = Array.isArray(task3.skills) ? task3.skills.map(cleanString).filter(Boolean) : Array.from(new Set(task3.apps.map((item: any) => cleanString(item.skill)).filter(Boolean)));
    activities.push({
      id: 'activity_3', type: 'categorization', title: 'Máy tính quanh ta',
      instructions: 'Chọn lĩnh vực phù hợp và khả năng của máy tính hỗ trợ cho từng ứng dụng.', maxScore: 2.5,
      categories: fields.map((field: any) => ({ id: cleanString(field.id), label: cleanString(field.name) || categoryLabel(cleanString(field.id)) })),
      abilities,
      items: task3.apps.map((item: any, index: number) => ({
        id: cleanString(item.id) || `t3_${index + 1}`, label: cleanString(item.text), correctCategory: cleanString(item.field), correctAbility: cleanString(item.skill),
      })),
    });
  }
  const task4 = Array.isArray(data.task4) ? data.task4 : [];
  if (task4.length) {
    activities.push({
      id: 'activity_4', type: 'scenario_reasoning', title: 'Công nghệ - Lợi hay hại?',
      instructions: 'Đánh giá tác động của tình huống và chọn lí do phù hợp nhất.', maxScore: 2.5,
      scenarios: task4.map((item: any, index: number) => ({
        id: cleanString(item.id) || `t4_${index + 1}`, prompt: cleanString(item.q), correctImpact: cleanString(item.ans),
        reasons: Array.isArray(item.reasons) ? item.reasons.map(cleanString) : [], correctReasonIndex: Number(item.correctReason ?? 0),
      })),
    });
  }
  appendReflectionActivity(activities, reflectionPrompt);
  return {
    schemaVersion: 'practice_v1', title, sourceFormat: 'legacy_html_t9', sourceFileName, maxScore: 10,
    activities, importedAt: new Date().toISOString(), importWarnings: activities.length < 4 ? ['File chưa nhận diện đủ 4 nhóm nhiệm vụ chuẩn.'] : [],
  };
}

function buildT7Manifest(data: any, title: string, sourceFileName: string, reflectionPrompt = ''): InteractivePracticeManifest {
  const activities: InteractivePracticeActivity[] = [];
  const task1 = Array.isArray(data.t1_devices) ? data.t1_devices : [];
  if (task1.length) activities.push({
    id: 'activity_1', type: 'classification', title: 'Săn tìm bộ xử lí', maxScore: 2.5,
    instructions: 'Phân loại các thiết bị theo việc có hay không có bộ xử lí điện tử.',
    categories: [{ id: 'yes', label: 'Có bộ xử lí điện tử' }, { id: 'no', label: 'Không có bộ xử lí' }],
    items: task1.map((item: any, index: number) => ({ id: cleanString(item.id) || `t1_${index + 1}`, label: cleanString(item.name), icon: cleanString(item.icon), correctCategory: item.hasProc === true ? 'yes' : 'no', explanation: cleanString(item.exp) })),
  });
  const task2 = data.t2_devices && typeof data.t2_devices === 'object' ? data.t2_devices : null;
  if (task2) {
    const entries = Object.entries(task2);
    activities.push({
      id: 'activity_2', type: 'sequence', title: 'Bên trong thiết bị', maxScore: 2.5,
      instructions: 'Sắp xếp đúng trình tự Thông tin vào → Bộ xử lí → Kết quả ra.',
      sequences: entries.map(([id, item]: [string, any]) => ({ id, title: cleanString(item.name), steps: [cleanString(item.in), cleanString(item.process || item.proc), cleanString(item.out)].filter(Boolean) })),
    });
  }
  const task3 = Array.isArray(data.t3_cards) ? data.t3_cards : [];
  if (task3.length) {
    const categoryIds = Array.from(new Set<string>(task3.map((item: any) => cleanString(item.target)).filter(Boolean)));
    const abilities = Array.from(new Set<string>(task3.map((item: any) => cleanString(item.ability)).filter(Boolean)));
    activities.push({
      id: 'activity_3', type: 'categorization', title: 'Máy tính quanh ta', maxScore: 2.5,
      instructions: 'Ghép từng ứng dụng với lĩnh vực và khả năng máy tính phù hợp.',
      categories: categoryIds.map((id) => ({ id, label: categoryLabel(id) })), abilities,
      items: task3.map((item: any, index: number) => ({ id: cleanString(item.id) || `t3_${index + 1}`, label: cleanString(item.text), correctCategory: cleanString(item.target), correctAbility: cleanString(item.ability) })),
    });
  }
  const task4 = Array.isArray(data.t4_scenarios) ? data.t4_scenarios : [];
  if (task4.length) activities.push({
    id: 'activity_4', type: 'scenario_reasoning', title: 'Công nghệ - Lợi hay hại?', maxScore: 2.5,
    instructions: 'Đánh giá tác động của từng tình huống và chọn một lí do đúng.',
    scenarios: task4.map((item: any, index: number) => ({
      id: cleanString(item.id) || `t4_${index + 1}`, prompt: cleanString(item.text), correctImpact: cleanString(item.type),
      reasons: Array.isArray(item.reasons) ? item.reasons.map(cleanString) : [], correctReasonIndex: 0,
      correctReasonIndices: Array.isArray(item.reasons) ? item.reasons.map((_: unknown, reasonIndex: number) => reasonIndex) : [0],
    })),
  });
  appendReflectionActivity(activities, reflectionPrompt);
  return {
    schemaVersion: 'practice_v1', title, sourceFormat: 'legacy_html_t7', sourceFileName, maxScore: 10,
    activities, importedAt: new Date().toISOString(), importWarnings: activities.length < 4 ? ['File chưa nhận diện đủ 4 nhóm nhiệm vụ chuẩn.'] : [],
  };
}

function countScoredItems(manifest: InteractivePracticeManifest) {
  return manifest.activities.reduce((total, activity) => {
    if (activity.type === 'sequence') return total + (activity.sequences?.length || 0);
    if (activity.type === 'scenario_reasoning') return total + (activity.scenarios?.length || 0);
    if (activity.type === 'reflection') return total;
    return total + (activity.items?.length || 0);
  }, 0);
}

export function summarizePracticeManifest(manifest: InteractivePracticeManifest): InteractivePracticeImportSummary {
  return {
    title: manifest.title,
    sourceFormat: manifest.sourceFormat,
    activityCount: manifest.activities.length,
    scoredItemCount: countScoredItems(manifest),
    maxScore: Number(manifest.maxScore || 10),
    warnings: Array.isArray(manifest.importWarnings) ? manifest.importWarnings : [],
  };
}

export function parseInteractivePracticeHtml(html: string, sourceFileName = 'practice.html'): InteractivePracticeManifest {
  if (!html || html.length < 100) throw new Error('File HTML rỗng hoặc không hợp lệ.');
  if (html.length > 900_000) throw new Error('File HTML vượt quá 900 KB. Hãy tối ưu file trước khi nhập.');
  const embedded = extractManifestScript(html);
  if (embedded) {
    const manifest: InteractivePracticeManifest = {
      ...embedded,
      schemaVersion: 'practice_v1',
      sourceFormat: 'edusmart_manifest',
      sourceFileName,
      importedAt: new Date().toISOString(),
    };
    if (!Array.isArray(manifest.activities) || !manifest.activities.length) throw new Error('Practice Manifest không có hoạt động luyện tập.');
    return manifest;
  }
  const title = extractTitle(html);
  const reflectionPrompt = extractFinalReflection(html);
  const data = extractDataLiteral(html);
  if (Array.isArray(data?.task1) || Array.isArray(data?.task4)) return buildT9Manifest(data, title, sourceFileName, reflectionPrompt);
  if (Array.isArray(data?.t1_devices) || Array.isArray(data?.t4_scenarios)) return buildT7Manifest(data, title, sourceFileName, reflectionPrompt);
  throw new Error('Chưa nhận diện được cấu trúc bài tập. File cần dùng Practice Manifest hoặc cùng cấu trúc với T7B1/T9B1.');
}
