/**
 * 语音跟读发音相似度测评算法（纯函数领域层）
 * 1. 文本规范化与标点符号过滤；
 * 2. 基于 Levenshtein 编辑距离与字符重合度计算发音匹配得分 (0 - 100)；
 * 3. 评级等级映射：优秀 (≥80) / 良好 (≥55) / 需练习 (<55)。
 */

export interface SpeechEvalResult {
  transcript: string;
  target: string;
  score: number; // 0 - 100
  grade: "excellent" | "good" | "practice";
  feedback: string;
}

export function evaluateSpeechSimilarity(
  transcriptRaw: string,
  targetRaw: string,
): SpeechEvalResult {
  const transcript = String(transcriptRaw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[[\](),.!?:;，。！？；、"'“”‘’]/g, "")
    .replace(/\s+/g, " ");

  const target = String(targetRaw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[[\](),.!?:;，。！？；、"'“”‘’]/g, "")
    .replace(/\s+/g, " ");

  if (!transcript || !target) {
    return {
      transcript: transcriptRaw,
      target: targetRaw,
      score: 0,
      grade: "practice",
      feedback: "未检测到有效语音输入",
    };
  }

  // 完全匹配或互相包含子串
  if (transcript === target || target.includes(transcript) || transcript.includes(target)) {
    return {
      transcript: transcriptRaw,
      target: targetRaw,
      score: 100,
      grade: "excellent",
      feedback: "发音极其精准，与目标原声完全契合！",
    };
  }

  // Levenshtein 距离换算相似度
  const d = levenshteinDistance(transcript, target);
  const maxLen = Math.max(transcript.length, target.length);
  const similarityRatio = Math.max(0, 1 - d / maxLen);
  const score = Math.round(similarityRatio * 100);

  const grade: SpeechEvalResult["grade"] = score >= 80 ? "excellent" : score >= 55 ? "good" : "practice";
  const feedback =
    grade === "excellent"
      ? `发音优异（相似度 ${score}%），语调清晰！`
      : grade === "good"
      ? `发音良好（相似度 ${score}%），部分音节可更饱满。`
      : `相似度 ${score}%，建议点击上方朗读多听两遍再跟读。`;

  return {
    transcript: transcriptRaw,
    target: targetRaw,
    score,
    grade,
    feedback,
  };
}

export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1, // deletion
        dp[i][j - 1] + 1, // insertion
        dp[i - 1][j - 1] + cost, // substitution
      );
    }
  }
  return dp[m][n];
}
