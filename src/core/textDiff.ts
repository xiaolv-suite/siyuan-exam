// ============================================================
// 纯函数轻量文本差异对比引擎（CAND-08）
// 基于 LCS (最长公共子序列) 算法，零外部依赖，支持中英文字词混合对比
// ============================================================

export type DiffOp = "equal" | "insert" | "delete";

export interface DiffPart {
  op: DiffOp;
  text: string;
}

/**
 * 对比新旧两段文本，输出增删等价差异序列
 * op: "equal" (无变动) | "insert" (新增文字，绿色) | "delete" (删除文字，红色删除线)
 */
export function computeTextDiff(oldText: string = "", newText: string = ""): DiffPart[] {
  if (oldText === newText) return oldText ? [{ op: "equal", text: oldText }] : [];
  if (!oldText) return [{ op: "insert", text: newText }];
  if (!newText) return [{ op: "delete", text: oldText }];

  // 按中文单字、英文单词、标点或空白切分
  const tokenize = (s: string) => s.match(/[\u4e00-\u9fa5]|[a-zA-Z0-9]+|[^\s\w\u4e00-\u9fa5]+|\s+/g) || [s];
  const a = tokenize(oldText);
  const b = tokenize(newText);

  const m = a.length;
  const n = b.length;
  const maxLen = 400; // 保护上限

  if (m > maxLen || n > maxLen) {
    return [
      { op: "delete", text: oldText },
      { op: "insert", text: newText },
    ];
  }

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      if (a[i] === b[j]) {
        dp[i + 1][j + 1] = dp[i][j] + 1;
      } else {
        dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  let i = m;
  let j = n;
  const rawParts: DiffPart[] = [];
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      rawParts.push({ op: "equal", text: a[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      rawParts.push({ op: "insert", text: b[j - 1] });
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      rawParts.push({ op: "delete", text: a[i - 1] });
      i--;
    }
  }

  rawParts.reverse();

  // 合并连续同类型节点
  const merged: DiffPart[] = [];
  for (const p of rawParts) {
    if (merged.length > 0 && merged[merged.length - 1].op === p.op) {
      merged[merged.length - 1].text += p.text;
    } else {
      merged.push({ ...p });
    }
  }

  return merged;
}

/**
 * 计算两道试题题干的语义相似度（0 ~ 1）
 * 1. 自动清洗题号前缀（如 "1. "、"（1）"、"【单选】"）与中英文首尾标点空白
 * 2. 结合前缀包含与 2-gram Jaccard 系数判定近重复
 */
export function computeStemSimilarity(s1: string = "", s2: string = ""): number {
  const clean = (s: string) =>
    s
      .toLowerCase()
      .replace(/^[0-9一二三四五六七八九十]+[.、\s]+|^[（(][0-9]+[)）]|^【[^】]+】|^\[[^\]]+\]|[？?。，,！!；;:：]/g, "")
      .replace(/\s+/g, "");

  const c1 = clean(s1);
  const c2 = clean(s2);
  if (!c1 || !c2) return 0;
  if (c1 === c2) return 1.0;
  if (c1.length >= 6 && c2.length >= 6) {
    if (c1.includes(c2) || c2.includes(c1)) {
      return Math.min(c1.length, c2.length) / Math.max(c1.length, c2.length);
    }
  }

  const getBigrams = (s: string) => {
    const set = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) {
      set.add(s.slice(i, i + 2));
    }
    return set;
  };

  const b1 = getBigrams(c1);
  const b2 = getBigrams(c2);
  if (!b1.size || !b2.size) return 0;

  let intersect = 0;
  for (const bg of b1) {
    if (b2.has(bg)) intersect++;
  }
  const union = b1.size + b2.size - intersect;
  return union > 0 ? intersect / union : 0;
}

/**
 * 将整段选项文本（如 "A. 选项1 B. 选项2 C. 选项3 D. 选项4"）智能秒拆为选项数组
 */
export function splitRawOptionsText(text: string): { options: string[]; answer?: string } {
  const raw = String(text ?? "").trim();
  if (!raw) return { options: [] };

  // 检查是否包含 "答案: B" 或 "【答案】B" 等显式答案标记
  let extractedAnswer: string | undefined;
  const ansMatch = raw.match(/(?:答案|参考答案|【答案】)[：:\s]*([A-Fa-f√×对错]+)/i);
  if (ansMatch) {
    extractedAnswer = ansMatch[1].toUpperCase();
  }

  // 剥除末尾答案部分避免混入最后一个选项
  const cleanedText = raw.replace(/(?:答案|参考答案|【答案】)[：:\s]*[A-Fa-f√×对错]+/i, "").trim();

  const normalized = cleanedText.replace(/\r\n/g, "\n");
  const pattern = /(?:^|\n|\s+)(?:[A-Fa-f][.、:：\s]|\([A-Fa-f]\)|[①②③④⑤⑥]|\d+[.、\s])/g;
  const indices: number[] = [];
  let m: RegExpExecArray | null;

  while ((m = pattern.exec(normalized)) !== null) {
    indices.push(m.index);
  }

  if (indices.length >= 2) {
    const parts: string[] = [];
    for (let i = 0; i < indices.length; i++) {
      const start = indices[i];
      const end = i < indices.length - 1 ? indices[i + 1] : normalized.length;
      const rawPart = normalized.slice(start, end).trim();
      const cleaned = rawPart.replace(/^(?:[A-Fa-f][.、:：\s]+|\([A-Fa-f]\)\s*|[①②③④⑤⑥]\s*|\d+[.、\s]+)/, "").trim();
      if (cleaned) parts.push(cleaned);
    }
    if (parts.length >= 2) return { options: parts, answer: extractedAnswer };
  }

  // 兜底按换行切分
  const lines = normalized.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length >= 2) {
    const cleanedLines = lines.map((l) => l.replace(/^[A-Fa-f][.、:：\s]+/, "").trim()).filter(Boolean);
    return { options: cleanedLines, answer: extractedAnswer };
  }

  return { options: [], answer: extractedAnswer };
}
