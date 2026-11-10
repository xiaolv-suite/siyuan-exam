import { describe, it, expect } from "vitest";
import { exportQCardsJson, parseQCardsJson, QCARD_PROTOCOL_VERSION } from "../src/core/qcard";
import type { Question } from "../src/core/types";

describe("标准 Agent 题卡互操作协议 (qcard)", () => {
  const sampleQuestions: Question[] = [
    {
      id: "q-101",
      type: "single",
      stem: "计算机网络体系结构中，传输层的主要协议包括？",
      options: ["TCP 和 UDP", "IP 和 ICMP", "HTTP 和 FTP", "ARP 和 RARP"],
      answer: "A",
      analysis: "TCP 和 UDP 分别提供面向连接与无连接的端到端传输服务。",
      kp: "计算机网络/传输层",
      difficulty: 2,
      score: 2,
      origin: "manual",
      hash: "h-101",
    },
    {
      id: "q-102",
      type: "fill",
      stem: "标准 IPv4 地址由____位二进制数组成，IPv6 地址由____位组成。",
      options: [],
      answer: "32;;128",
      analysis: "IPv4 为 32 位（4 字节），IPv6 扩展为 128 位（16 字节）。",
      kp: "计算机网络/网络层",
      difficulty: 1,
      score: 3,
      origin: "manual",
      hash: "h-102",
    },
  ];

  it("1. exportQCardsJson：输出规范的 Agent QCard Bundle 结构", () => {
    const jsonStr = exportQCardsJson("网络考研卷", sampleQuestions);
    const parsed = JSON.parse(jsonStr);

    expect(parsed.version).toBe(QCARD_PROTOCOL_VERSION);
    expect(parsed.type).toBe("qcard-bundle");
    expect(parsed.title).toBe("网络考研卷");
    expect(parsed.total).toBe(2);
    expect(parsed.cards).toHaveLength(2);
    expect(parsed.cards[0].stem).toContain("传输层");
    expect(parsed.cards[0].options).toHaveLength(4);
    expect(parsed.cards[1].answer).toBe("32;;128");
  });

  it("2. parseQCardsJson：成功解析 Bundle 并恢复有效试题", () => {
    const jsonStr = exportQCardsJson("网络考研卷", sampleQuestions);
    const res = parseQCardsJson(jsonStr);

    expect(res.valid).toBe(true);
    expect(res.count).toBe(2);
    expect(res.title).toBe("网络考研卷");
    expect(res.questions[0].type).toBe("single");
    expect(res.questions[0].options).toEqual(["TCP 和 UDP", "IP 和 ICMP", "HTTP 和 FTP", "ARP 和 RARP"]);
    expect(res.questions[1].answer).toBe("32;;128");
  });

  it("3. parseQCardsJson：支持纯数组形式与中文题型别名容错", () => {
    const rawArray = [
      {
        type: "单选题",
        stem: "1 + 1 = ?",
        options: ["1", "2", "3"],
        answer: "B",
      },
      {
        type: "填空题",
        stem: "三角形内角和为____度。",
        answer: "180",
      },
    ];

    const res = parseQCardsJson(JSON.stringify(rawArray));
    expect(res.valid).toBe(true);
    expect(res.count).toBe(2);
    expect(res.questions[0].type).toBe("single");
    expect(res.questions[1].type).toBe("fill");
  });

  it("4. parseQCardsJson：空数据或非法 JSON 防御报错", () => {
    expect(parseQCardsJson("").valid).toBe(false);
    expect(parseQCardsJson("{ invalid json").valid).toBe(false);
    expect(parseQCardsJson(JSON.stringify({ cards: [] })).valid).toBe(false);
  });
});
