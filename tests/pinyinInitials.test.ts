import { describe, it, expect } from "vitest";
import { getCharPinyinInitial, toPinyinInitials, matchesQueryWithPinyin } from "../src/ui/shared/pinyinInitials";

describe("CAND-13: 拼音首字母提取与模糊检索", () => {
  it("正确提取常见汉字声母首字母", () => {
    expect(getCharPinyinInitial("错")).toBe("c");
    expect(getCharPinyinInitial("题")).toBe("t");
    expect(getCharPinyinInitial("本")).toBe("b");
    expect(getCharPinyinInitial("A")).toBe("a");
    expect(getCharPinyinInitial("9")).toBe("9");
  });

  it("将词汇转为完整拼音首字母串", () => {
    expect(toPinyinInitials("错题本")).toBe("ctb");
    expect(toPinyinInitials("今日备考")).toBe("jrbk");
    expect(toPinyinInitials("全真模考")).toBe("qzmk");
    expect(toPinyinInitials("答题卡")).toBe("dtk");
    expect(toPinyinInitials("草稿纸")).toBe("cgz");
    expect(toPinyinInitials("快捷键")).toBe("kjj");
  });

  it("matchesQueryWithPinyin 支持中文直接匹配与拼音缩写匹配", () => {
    // 中文直接匹配
    expect(matchesQueryWithPinyin("错题本攻坚", "错题")).toBe(true);
    // 拼音首字母匹配
    expect(matchesQueryWithPinyin("错题本攻坚", "ctb")).toBe(true);
    expect(matchesQueryWithPinyin("今日备考", "jrbk")).toBe(true);
    expect(matchesQueryWithPinyin("全真模拟考试", "qzmn")).toBe(true);
    // 附加关键词匹配
    expect(matchesQueryWithPinyin("全真模拟考试", "mock", "mock exam cbt")).toBe(true);
    // 不匹配的情况
    expect(matchesQueryWithPinyin("今日备考", "xyz")).toBe(false);
  });
});
