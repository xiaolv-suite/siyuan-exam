import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 内联样式完整性契约（R20）：
 * R8 批量 transition:all 改造曾在 QuestionPeekDrawer.svelte:510 产生跨行捕获损坏——
 * 5 个残缺 `<span style="display:grid, background var(...)">` 开标签被静默遗留，
 * 造成试题抽屉选项行 ~50px 幽灵空隙与 5 条 svelte-check element_implicitly_closed 警告。
 * 本契约扫描全部 Svelte 内联 style，封禁 `display:<kind>,`（逗号非法 CSS）损坏签名。
 */
describe('Inline Style Integrity Contracts (R20)', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

  it('全部 .svelte 内联 style 不含 "display:<kind>," 损坏签名', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (['node_modules', 'dist', 'build'].includes(entry.name)) continue;
          walk(p);
        } else if (entry.name.endsWith('.svelte')) {
          const src = fs.readFileSync(p, 'utf8');
          for (const m of src.matchAll(/style="[^"]*display:\s*\w+,/g)) {
            offenders.push(`${path.relative(root, p)} :: ${m[0].slice(0, 60)}`);
          }
        }
      }
    };
    walk(path.join(root, 'src'));
    expect(offenders).toEqual([]);
  });
});
