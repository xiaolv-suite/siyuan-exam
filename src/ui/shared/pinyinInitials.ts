// ============================================================
// 拼音首字母模糊提取工具（CAND-13）
// 纯函数、零依赖：利用 Unicode 与 Intl.Collator 汉字声母区间快速求取首字母
// 支持中文、英文、数字混合串。
// ============================================================

const PINYIN_BOUNDS: [string, string][] = [
  ["a", "啊"],
  ["b", "芭"],
  ["c", "擦"],
  ["d", "搭"],
  ["e", "蛾"],
  ["f", "发"],
  ["g", "噶"],
  ["h", "哈"],
  ["j", "击"],
  ["k", "喀"],
  ["l", "垃"],
  ["m", "妈"],
  ["n", "拿"],
  ["o", "哦"],
  ["p", "啪"],
  ["q", "期"],
  ["r", "然"],
  ["s", "撒"],
  ["t", "塌"],
  ["w", "挖"],
  ["x", "昔"],
  ["y", "压"],
  ["z", "匝"],
];

/**
 * 获取单个字符的拼音首字母（小写 a-z，若非汉字则保留小写英文/数字）
 */
export function getCharPinyinInitial(ch: string): string {
  if (!ch) return "";
  if (/[a-zA-Z0-9]/.test(ch)) return ch.toLowerCase();
  const code = ch.charCodeAt(0);
  if (code < 19968 || code > 40869) return "";
  for (let i = PINYIN_BOUNDS.length - 1; i >= 0; i--) {
    if (ch.localeCompare(PINYIN_BOUNDS[i][1], "zh-CN") >= 0) {
      return PINYIN_BOUNDS[i][0];
    }
  }
  return "";
}

/**
 * 转换文本为拼音首字母缩写字符串（如："错题本" -> "ctb"，"今日备考" -> "jrbk"）
 */
export function toPinyinInitials(text: string): string {
  if (!text) return "";
  return Array.from(text).map(getCharPinyinInitial).join("");
}

/**
 * 检查文本是否匹配查询串（支持包含匹配、拼音首字母匹配）
 */
export function matchesQueryWithPinyin(text: string, query: string, extraKeywords = ""): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const t = text.toLowerCase();
  if (t.includes(q)) return true;
  if (extraKeywords && extraKeywords.toLowerCase().includes(q)) return true;
  const pinyin = toPinyinInitials(text);
  if (pinyin && pinyin.includes(q)) return true;
  return false;
}
