import { lvLaunchpad } from "@/libs/lv-notice-kit";
import type { LvSearchResultItem } from "@/libs/lv-notice-kit";
import { emitExamEvent } from "../core/bus";
import { openPracticeView } from "../core/pluginTab";
import { streak } from "../core/replayer";
import type { PluginHost } from "./pluginContext";

export function handleQuickAction(plugin: PluginHost, action: string): void {
  void plugin.ensureTier2Loaded().catch((err) => console.warn("[LvExam] handleQuickAction ensureTier2Loaded catch:", err));
  switch (action) {
    case "继续上次练习":
      plugin.resumeLastPractice();
      break;
    case "错题复仇特训":
      void (typeof plugin.startWrongQuestionsDrill === "function" ? plugin.startWrongQuestionsDrill() : startWrongQuestionsDrill(plugin));
      break;
    case "每日一练":
    case "开启薄弱知识点10题特训":
      void (typeof plugin.startWeakSpotTraining === "function" ? plugin.startWeakSpotTraining(10) : startWeakSpotTraining(plugin, 10));
      break;
    case "全真计时模拟考试":
    case "开启全真计时模拟考试":
      plugin.openMock();
      break;
    case "打开今日错题本复习":
      plugin.openWrongbook();
      break;
    case "导入新试卷与Markdown题库":
      openPracticeView(plugin, "import");
      break;
    default:
      plugin.openExamHome();
      break;
  }
}

export async function startWrongQuestionsDrill(plugin: PluginHost): Promise<boolean> {
  if (!plugin.examApp || !plugin.examApp.kernelOnline) {
    plugin.openWrongbook();
    return false;
  }
  try {
    const banks = plugin.examApp.listBanks();
    if (!banks.length) {
      plugin.openWrongbook();
      return false;
    }
    const prefBank = (typeof window !== "undefined" && window.localStorage?.getItem("lv-exam/activeBank")) || "";
    const activeBankId = prefBank && banks.some((b) => b.id === prefBank) ? prefBank : banks[0].id;
    const questions = await plugin.examApp.listQuestions(activeBankId);
    const derived = plugin.examApp.derived();
    const wrongQids = new Set(
      [...derived.wrongbook.values()].filter((w) => w.status === "active").map((w) => w.qid),
    );
    let wrongQuestions = questions.filter((q) => wrongQids.has(q.id));
    if (!wrongQuestions.length) {
      for (const b of banks) {
        if (b.id === activeBankId) continue;
        const bQuestions = await plugin.examApp.listQuestions(b.id);
        const bWrong = bQuestions.filter((q) => wrongQids.has(q.id));
        if (bWrong.length) {
          wrongQuestions = bWrong;
          break;
        }
      }
    }
    if (wrongQuestions.length) {
      const picked = wrongQuestions.slice(0, 20);
      plugin.pendingPractice = picked;
      plugin.pendingPracticeBankId = activeBankId;
      emitExamEvent("open-practice-questions", { qids: picked.map((q) => q.id), bank: activeBankId });
      lvLaunchpad.haptic(10);
      plugin.openPractice();
      return true;
    }
    plugin.openWrongbook();
    return true;
  } catch (err) {
    console.warn("[LvExam] startWrongQuestionsDrill error:", err);
    plugin.openWrongbook();
    return false;
  }
}

export async function startWeakSpotTraining(plugin: PluginHost, count = 10): Promise<boolean> {
  if (!plugin.examApp || !plugin.examApp.kernelOnline) {
    plugin.openPractice();
    return false;
  }
  try {
    const banks = plugin.examApp.listBanks();
    if (!banks.length) {
      plugin.openPractice();
      return false;
    }
    const prefBank = (typeof window !== "undefined" && window.localStorage?.getItem("lv-exam/activeBank")) || "";
    const activeBankId = prefBank && banks.some((b) => b.id === prefBank) ? prefBank : banks[0].id;
    const questions = await plugin.examApp.listQuestions(activeBankId);
    if (!questions.length) {
      plugin.openPractice();
      return false;
    }
    const derived = plugin.examApp.derived();
    const { masteryByKp, weakTop } = await import("@/core/report");
    const { sampleWeakSpotDrill } = await import("@/core/weakSpot");
    const mastery = masteryByKp(questions, derived.byQuestion, plugin.examApp.attempts.all());
    const weak = weakTop(mastery, 10);
    const weakRoots = weak.map((w) => w.root);
    const wrongQids = new Set<string>(
      [...derived.wrongbook.values()].filter((w) => w.status === "active").map((w) => w.qid),
    );
    const attemptedQids = new Set<string>(derived.byQuestion.keys());

    let picked = sampleWeakSpotDrill({
      bank: questions,
      weakRoots,
      wrongQids,
      attemptedQids,
      count,
    });

    if (!picked.length) {
      const cram = plugin.examApp.cramDrill(questions);
      picked = (cram.length ? cram : questions).slice(0, count);
    }

    if (picked.length) {
      plugin.pendingPractice = picked;
      plugin.pendingPracticeBankId = activeBankId;
      emitExamEvent("open-practice-questions", { qids: picked.map((q) => q.id), bank: activeBankId });
      lvLaunchpad.haptic(10);
    }
    plugin.openPractice();
    return true;
  } catch (err) {
    console.warn("[LvExam] startWeakSpotTraining error:", err);
    plugin.openPractice();
    return false;
  }
}

export async function searchOmni(plugin: PluginHost, keyword: string): Promise<LvSearchResultItem[]> {
  if (!plugin.examApp || !keyword.trim()) return [];
  const kw = keyword.trim().toLowerCase();
  const banks = plugin.examApp.listBanks();
  if (!banks.length) return [];

  const derived = plugin.examApp.derived();
  const results: LvSearchResultItem[] = [];

  // 1. 匹配题库高频实体
  for (const bank of banks) {
    if (bank.name.toLowerCase().includes(kw)) {
      results.push({
        id: `bank-${bank.id}`,
        source: "考试",
        category: "题库",
        badge: "题库",
        title: `题库：${bank.name}`,
        snippet: bank.category ? `【分类: ${bank.category}】包含本库试题与错题，点击直达` : `包含试题与专项分类，点击切换至此题库`,
        onClick: () => {
          try {
            if (typeof window !== "undefined" && window.localStorage) {
              window.localStorage.setItem("lv-exam/activeBank", bank.id);
            }
          } catch { /* ignore */ }
          plugin.openExamHome();
        },
      });
      if (results.length >= 30) break;
    }
  }

  // 2. 匹配试题与错题实体
  for (const bank of banks) {
    try {
      const questions = await plugin.examApp.listQuestions(bank.id);
      for (const q of questions) {
        const stem = q.stem || "";
        const analysis = q.analysis || "";
        const kp = q.kp || "";
        const optionsText = (q.options || []).join(" ");
        if (
          stem.toLowerCase().includes(kw) ||
          analysis.toLowerCase().includes(kw) ||
          kp.toLowerCase().includes(kw) ||
          optionsText.toLowerCase().includes(kw)
        ) {
          const isWrong = derived.wrongbook.get(q.id)?.status === "active";
          const category = isWrong ? "错题本" : "题库试题";
          const badge = isWrong ? "错题" : bank.name;
          const title = stem.slice(0, 60).replace(/\n/g, " ");
          const snippet = analysis
            ? `【解析】${analysis.slice(0, 80).replace(/\n/g, " ")}`
            : kp
            ? `【考点】${kp}`
            : stem.slice(60, 120).replace(/\n/g, " ");

          results.push({
            id: `exam-${q.id}`,
            source: "考试",
            category,
            badge,
            title,
            snippet,
            linkBlockId: q.blockId || (q as unknown as { docId?: string }).docId || (q as unknown as { rootId?: string }).rootId,
            onClick: () => {
              if (isWrong) {
                plugin.openWrongbook();
              } else {
                emitExamEvent("open-in-browse", { qid: q.id, bank: bank.id });
                plugin.openPractice();
              }
            },
          });
          if (results.length >= 30) break;
        }
      }
      if (results.length >= 30) break;
    } catch (e) {
      console.warn(`[LvExam] searchOmni bank ${bank.id} failed:`, e);
    }
  }
  return results;
}

export function dispatchPublicStats(plugin: PluginHost): void {
  if (!plugin.examApp || plugin.isUnloaded) return;
  try {
    import("@/core/publicStats").then((m) => {
      if (!plugin.examApp || plugin.isUnloaded) return;
      const d = plugin.examApp.derived();
      const snapshot = m.buildPublicStats(d, plugin.examApp!.attempts.all(), streak(d)) as unknown as Record<
        string,
        unknown
      >;
      plugin.lastPublicStats = snapshot;
      emitExamEvent("stats", snapshot);
      window.dispatchEvent(
        new CustomEvent("lv-exam:stats", {
          detail: snapshot,
        }),
      );
    });
  } catch {
    /* 统计失败不影响主流程 */
  }
}
