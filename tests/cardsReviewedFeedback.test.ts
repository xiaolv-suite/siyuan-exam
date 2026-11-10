import { describe, it, expect, vi } from "vitest";

describe("闪卡复习反哺错题消灭机制", () => {
  it("rating >= 3 (Good/Easy) 且命中错题本活跃试题时，调用 setWrongStatus(id, 'mastered')", async () => {
    const wrongQ = {
      id: "q-101",
      blockId: "20261101120000-block01",
      stem: "操作系统产生死锁的四个必要条件是什么？",
    };

    const mockApp = {
      listBanks: () => [{ id: "bank-1", name: "计算机考研" }],
      listQuestions: vi.fn().mockResolvedValue([wrongQ]),
      wrongItems: () => [{ qid: "q-101", status: "active", wrongCount: 3 }],
      setWrongStatus: vi.fn().mockResolvedValue(undefined),
    };

    const messages: string[] = [];
    const showMessage = (msg: string) => messages.push(msg);

    // 模拟 index.ts 中的 cardsReviewedHandler 核心逻辑
    async function handleCardReviewed(detail: { blockID?: string; rating?: number }) {
      if (!detail?.blockID || typeof detail.rating !== "number") return;
      if (detail.rating >= 3) {
        const blockID = String(detail.blockID).trim();
        const banks = mockApp.listBanks();
        for (const bank of banks) {
          const questions = await mockApp.listQuestions(bank.id);
          const matched = questions.find((q) => q.blockId === blockID || q.id === blockID);
          if (matched) {
            const wrongItems = mockApp.wrongItems();
            const wrong = wrongItems.find((w) => w.qid === matched.id);
            if (wrong && wrong.status === "active") {
              await mockApp.setWrongStatus(matched.id, "mastered");
              const stemPreview = (matched.stem || "").replace(/<[^>]*>/g, "").trim().slice(0, 16);
              showMessage(`[小驴考试] 错题「${stemPreview}…」已在小驴闪卡复习掌握（Good/Easy），已自动从错题本攻克归档！`);
              break;
            }
          }
        }
      }
    }

    // 1. rating = 1 (Again/忘却)：不消减
    await handleCardReviewed({ blockID: "20261101120000-block01", rating: 1 });
    expect(mockApp.setWrongStatus).not.toHaveBeenCalled();

    // 2. rating = 3 (Good)：成功攻克
    await handleCardReviewed({ blockID: "20261101120000-block01", rating: 3 });
    expect(mockApp.setWrongStatus).toHaveBeenCalledWith("q-101", "mastered");
    expect(messages[0]).toContain("死锁");
    expect(messages[0]).toContain("已自动从错题本攻克归档");
  });
});
