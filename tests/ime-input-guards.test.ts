import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * IME 合成期守卫契约（R18 全生态专项 / R19 固化为回归保护）：
 * 输入框挂载的 Enter 提交必须在 isComposing || keyCode === 229 时让路给输入法。
 * 全局热键流已由 practiceKeyboardService.shouldBlockGlobalHotkeys 的输入目标门控覆盖。
 */
describe('IME Input Guard Contracts (R18/R19)', () => {
  const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8');
  const guard = /(?:e|event)\.isComposing\s*\|\|\s*(?:e|event)\.keyCode === 229/g;
  const count = (src: string) => (src.match(guard) || []).length;

  it('ImportStudioView: 自定义标签检索让路', () => {
    expect(count(read('src/ui/practice/ImportStudioView.svelte'))).toBe(1);
  });

  it('ManualStudioView: 选项快拆提交让路', () => {
    expect(count(read('src/ui/practice/ManualStudioView.svelte'))).toBe(1);
  });

  it('OcclusionEditor: 图片遮盖 URL 加载让路', () => {
    expect(count(read('src/ui/practice/OcclusionEditor.svelte'))).toBe(1);
  });
});
