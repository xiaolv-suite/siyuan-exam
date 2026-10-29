import { describe, it, expect } from "vitest";
import {
  recordAnswerTrailInput,
  assignLastEditReason,
  type AnswerTrail,
} from "@/ui/practice/services/answerTrailService";

describe("试题改答轨迹服务 (answerTrailService)", () => {
  it("1. recordAnswerTrailInput：首次作答记录初始轨迹不提示原因", () => {
    const trails = new Map<string, AnswerTrail>();
    const res = recordAnswerTrailInput(trails, "q-1", "A");
    expect(res.promptReason).toBe(false);
    expect(trails.has("q-1")).toBe(true);
    expect(trails.get("q-1")?.first).toBe("A");
    expect(trails.get("q-1")?.edits).toHaveLength(0);
  });

  it("2. recordAnswerTrailInput：空值输入与重复输入不触发改答事件", () => {
    const trails = new Map<string, AnswerTrail>();
    const emptyRes = recordAnswerTrailInput(trails, "q-1", "");
    expect(emptyRes.promptReason).toBe(false);
    expect(trails.has("q-1")).toBe(false);

    recordAnswerTrailInput(trails, "q-1", "A");
    const dupRes = recordAnswerTrailInput(trails, "q-1", "A");
    expect(dupRes.promptReason).toBe(false);
    expect(trails.get("q-1")?.edits).toHaveLength(0);
  });

  it("3. recordAnswerTrailInput：真实修改答案触发改答原因提示", () => {
    const trails = new Map<string, AnswerTrail>();
    recordAnswerTrailInput(trails, "q-1", "A");

    const editRes = recordAnswerTrailInput(trails, "q-1", "B");
    expect(editRes.promptReason).toBe(true);
    expect(trails.get("q-1")?.edits).toHaveLength(1);
    expect(trails.get("q-1")?.edits[0].to).toBe("B");
  });

  it("4. assignLastEditReason：为最后一次修改记录改答原因", () => {
    const trails = new Map<string, AnswerTrail>();
    recordAnswerTrailInput(trails, "q-1", "A");
    recordAnswerTrailInput(trails, "q-1", "B");

    assignLastEditReason(trails, "q-1", "evidence");
    expect(trails.get("q-1")?.edits[0].reason).toBe("evidence");

    // 不存在的 qid 容错
    expect(() => assignLastEditReason(trails, "q-none", "unsure")).not.toThrow();
  });
});
