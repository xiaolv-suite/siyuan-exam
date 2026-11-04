/**
 * 错题自适应先修根因溯源与攻克诊断引擎 (Diagnostic Engine - DIAG-01 / DIAG-02 / DIAG-03)
 * 深度吸收 cn-math-taxonomy 算法架构：
 * 1. 沿先修拓扑图向下溯源回溯薄弱根因 (Root Cause Backtracking)；
 * 2. 识别关键阻断考点与掌握度（薄弱 / 不稳 / 掌握 / 未测）；
 * 3. 自动生成按逻辑先修拓扑排序的精准攻克路线图 (Clearance Path)。
 */
import type { Question } from "./types";

export interface DiagnosticNode {
  kp: string;
  status: "root_cause" | "shaky" | "mastered" | "untested";
  accuracy: number;
  attemptsCount: number;
  reason: string;
  isDirectPrereq: boolean;
  recommendedQuestions: Question[];
}

export interface AdaptiveDiagnosisReport {
  targetQid: string;
  targetStem: string;
  targetKp: string;
  rootCauses: DiagnosticNode[];
  shakyNodes: DiagnosticNode[];
  learningPath: {
    stage: number;
    title: string;
    kp: string;
    status: DiagnosticNode["status"];
    recommendedQuestions: Question[];
  }[];
  summaryText: string;
}

export interface SimpleAttemptRecord {
  questionId: string;
  correct: boolean;
  kp?: string;
}

/**
 * 针对错题执行自适应前置诊断与根因溯源
 */
export function diagnoseQuestionRootCauses(
  targetQ: Question,
  allBankQuestions: Question[],
  attempts: SimpleAttemptRecord[] = [],
  wrongQids: Set<string> = new Set(),
): AdaptiveDiagnosisReport {
  const targetKp = targetQ.kp || "未分类考点";

  // 1. 提取所有先修考点（直接声明的 prerequisites + 考点层级前置）
  const directPrereqs = new Set<string>();
  if (targetQ.prerequisites && targetQ.prerequisites.length) {
    for (const p of targetQ.prerequisites) directPrereqs.add(p.trim());
  }

  // 自动从考点层级（例如 "初中数学/几何/全等三角形" -> 前置 "初中数学/几何/线段与角"）提取父级考点
  if (targetQ.kp && targetQ.kp.includes("/")) {
    const segments = targetQ.kp.split("/");
    if (segments.length >= 2) {
      directPrereqs.add(segments.slice(0, -1).join("/"));
    }
  }

  // 2. 统计各考点历史作答情况
  const kpStats = new Map<string, { total: number; correct: number }>();
  for (const att of attempts) {
    const q = allBankQuestions.find((item) => item.id === att.questionId);
    const kp = att.kp || q?.kp;
    if (!kp) continue;
    const cur = kpStats.get(kp) || { total: 0, correct: 0 };
    cur.total++;
    if (att.correct) cur.correct++;
    kpStats.set(kp, cur);
  }

  // 3. 构建候选先修考点列表
  const candidateKps = new Set<string>(directPrereqs);

  // 在题库中查找包含前置标签或属于先修知识点的题目
  const questionsByKp = new Map<string, Question[]>();
  for (const q of allBankQuestions) {
    if (q.id === targetQ.id) continue;
    if (q.kp) {
      const list = questionsByKp.get(q.kp) || [];
      list.push(q);
      questionsByKp.set(q.kp, list);
    }
  }

  // 如果没有显式先修，根据考点相近性推荐基础题
  if (candidateKps.size === 0 && targetQ.kp) {
    candidateKps.add(`${targetQ.kp}（基础筑基）`);
  }

  const rootCauses: DiagnosticNode[] = [];
  const shakyNodes: DiagnosticNode[] = [];
  const allNodes: DiagnosticNode[] = [];

  for (const kp of candidateKps) {
    const st = kpStats.get(kp);
    const matchingQs = (questionsByKp.get(kp) || []).filter((q) => q.id !== targetQ.id);
    const hasWrong = matchingQs.some((q) => wrongQids.has(q.id));

    let status: DiagnosticNode["status"] = "untested";
    let reason = "尚未练习过该前置考点，建议先行摸底测试";
    let acc = 0;
    const total = st?.total ?? 0;

    if (total > 0) {
      acc = st!.correct / total;
      if (acc >= 0.8) {
        status = "mastered";
        reason = `该前置考点历史正确率 ${Math.round(acc * 100)}%，已基本掌握`;
      } else if (acc >= 0.5) {
        status = "shaky";
        reason = `该前置考点历史正确率 ${Math.round(acc * 100)}%，掌握不稳，可能存在概念混淆`;
      } else {
        status = "root_cause";
        reason = `该前置考点历史正确率仅 ${Math.round(acc * 100)}%，是导致本题失分的薄弱根因！`;
      }
    } else if (hasWrong) {
      status = "root_cause";
      reason = "该前置考点存在历史错题未攻克，是导致本题失分的薄弱根因！";
    }

    const node: DiagnosticNode = {
      kp,
      status,
      accuracy: acc,
      attemptsCount: total,
      reason,
      isDirectPrereq: directPrereqs.has(kp),
      recommendedQuestions: matchingQs.slice(0, 3),
    };

    allNodes.push(node);
    if (status === "root_cause") rootCauses.push(node);
    else if (status === "shaky") shakyNodes.push(node);
  }

  // 4. 合成靶向攻克路线（按根因 -> 不稳 -> 目标题目 阶段推进）
  const learningPath: AdaptiveDiagnosisReport["learningPath"] = [];
  let stageIdx = 1;

  for (const rc of rootCauses) {
    learningPath.push({
      stage: stageIdx++,
      title: `【阶段 ${stageIdx - 1}】根因筑基：${rc.kp}`,
      kp: rc.kp,
      status: "root_cause",
      recommendedQuestions: rc.recommendedQuestions,
    });
  }

  for (const sh of shakyNodes) {
    learningPath.push({
      stage: stageIdx++,
      title: `【阶段 ${stageIdx - 1}】强化巩固：${sh.kp}`,
      kp: sh.kp,
      status: "shaky",
      recommendedQuestions: sh.recommendedQuestions,
    });
  }

  const untestedPrereqs = allNodes.filter((n) => n.status === "untested");
  for (const un of untestedPrereqs) {
    learningPath.push({
      stage: stageIdx++,
      title: `【阶段 ${stageIdx - 1}】前置摸底：${un.kp}`,
      kp: un.kp,
      status: "untested",
      recommendedQuestions: un.recommendedQuestions,
    });
  }

  learningPath.push({
    stage: stageIdx,
    title: `【阶段 ${stageIdx}】冲刺目标：攻克原题与同类变式`,
    kp: targetKp,
    status: "untested",
    recommendedQuestions: [targetQ],
  });

  // 5. 诊断总结建议
  const summaryText =
    rootCauses.length > 0
      ? `经自适应前置诊断，定位到 ${rootCauses.length} 个薄弱根因考点（${rootCauses.map((r) => r.kp).join("、")}），建议暂缓盲目刷难题，从根因筑基开始按路线图逐级突破。`
      : shakyNodes.length > 0
        ? `本题前置知识基础较完备，主要失分原因在于「${shakyNodes[0].kp}」考点掌握不够牢固，重点巩固细节即可突破。`
        : `未检测到直接的前置知识短板，该题可能属于计算失误或题型不熟练，建议重做原题并查看【思路拓展与秒杀技巧】。`;

  return {
    targetQid: targetQ.id,
    targetStem: targetQ.stem,
    targetKp,
    rootCauses,
    shakyNodes,
    learningPath,
    summaryText,
  };
}
