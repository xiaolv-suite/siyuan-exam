<div align="center">

# 🐴 Lv Exam (小驴考试)

> **Community & Support:** Join QQ group **871707735** for usage tips, feedback, and discussions.

**Local-first question bank and exam prep workspace in SiYuan: import & manual authoring, independent active-recall practice, wrongbook remediation, timed mock exams, A4 paper printing, FSRS flashcards, and reviewable AI assistance.**

> **Personal Notes → Independent Retrieval → Honest Evidence → Wrongbook Elimination → Timed Mock Verification**  
> Every question is a native, searchable, linkable **SiYuan block** in your own workspace — never locked in an external cloud.

[![Release](https://img.shields.io/badge/release-v0.15.7-blue.svg)](https://github.com/xiaolv-suite/siyuan-exam/releases)
[![CI](https://github.com/xiaolv-suite/siyuan-exam/actions/workflows/check.yml/badge.svg)](https://github.com/xiaolv-suite/siyuan-exam/actions/workflows/check.yml)
[![SiYuan](https://img.shields.io/badge/SiYuan-%3E%3D%203.8.4-blue)](https://github.com/siyuan-note/siyuan)
[![License](https://img.shields.io/badge/license-MIT-green)](#-license)

<img src="preview.png" alt="Lv Exam preview" width="640"/>

*[中文说明](README.md) · English Docs · [UI Components](docs/UI-COMPONENTS.md) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [Releases](https://github.com/xiaolv-suite/siyuan-exam/releases)*

</div>

---

## 🚀 What's New in v0.15.7 (2026-11-26 Milestone Release)

- **Home-First Landing & Session Resume Cards**: Opening Lv Exam via Xiaolv Launchpad, topbar icon, command palette, or tab reload always lands calmly on the **Today** home screen; unfinished practice or recite sessions appear as explicit Resume / Discard cards instead of auto-entering questions;
- **Unified `.lv-ai-thinking` Wait UI & True AbortSignal Cancellation**: Moved `/api/asset/ocr` and `/api/asset/upload` onto non-blocking transport to eliminate SiYuan's fullscreen `Requesting...` blocker during image/paper OCR; unified Socratic guidance, progressive hints, AI studio, variant drill, error diagnosis, and report AI explanations onto animated `.lv-ai-thinking` cards with full `AbortSignal` cancellation;
- **Shared Ecosystem Hubs & 4-Level Collapsible Diary Zone**: Integrated Launchpad, unified AI Router, Block Assistant 1–8 native base + custom double-click, Activity Stream, and Backup/Restore; practice and mock exam daily summaries probe native daily notes and write into `#### 🐴 小驴记录`, filtering out sync-conflict copies;
- **60fps Zero `:has()` / Zero Heavy-Blur Polish**: Eliminated CSS `:has()` selectors and `blur(>=15px)` across the compiled bundle, fixed variant modal type badges, wrongbook sprint button wrapping, mock blueprint headers, and duplicate manual option hints across light, dark, and `390×844` mobile viewports;
- **Startup Slim-Down & Lazy Loading**: Converged boot storage reads to 1 core slot, removed the closed-notebook keepalive scan, and lazy-loaded tab views and SheetJS at runtime;
- **Native Settings Gear & Micro-Capsule Tokens**: Implemented `openSetting()` for SiYuan's plugin manager gear icon and modernized setting group badges.

---

## 📦 Core Exam Loop

| Module | Capabilities |
|---|---|
| 📥 **Import & Authoring** | Extract from native SiYuan notes · Import XLSX/XLS, CSV, TSV, GIFT, Aiken · Manual authoring with pin attributes (`pinAttributes`), 4-layer structure with expansion & quick-solve tricks (`expansion`), rubric & image occlusion |
| ✏️ **Independent Practice** | Auto-next on correct with 3.5s countdown & instant advance/pause · Clean recite mode (`reciteToggle`) · Deterministic option shuffling (Fisher-Yates) · Scratchpad fluorescent highlighters · Dark mode diagram inverted filter |
| 🧭 **Diagnosis & Remediation** | Prerequisite DAG diagnostic engine (`diagnoseQuestionRootCauses`) · Automated root cause backtracking & topological learning path synthesis · Active / Eliminated / Archived wrongbook tabs |
| 🏛️ **Marketplace & Ecosystem** | Public domain zero-copyright catalog with 8 core disciplines · Cross-discipline cart & selective stash (`cartItemsToQuestions`) · Quality metrics & taxonomy tree · Non-destructive delta sync & merge · Packaging wizard & privacy sanitizer · Bidirectional interoperability with `siyuan-lv-cards` (`.lvcards`, `lvcards.v1`) · Ecosystem Protocol v1.0.0~v1.6.0 federation (`lvNoticeKit`, `lvTicker`, `withDocLock`, `lvAi`, `lvActivity`, `lvBackup`, `lvLaunchpad`, `lvOmnisearch`, `lvAutomation`) |
| 📝 **Timed Mock Exams** | 100+ CBT question accordion sheet groupings · Post-exam subjective self-rating rubric re-scoring (`rateSubjectiveQuestion`) · Wall-clock timer, snapshot & A4 double-column print sheets |
| 📊 **Evidence Report** | Independent vs. assisted vs. delayed-recall breakdown · 30-day trend, 53-week heatmap, confidence calibration & full local data backup |

---

## 🚀 Quick Start

1. **Manual Installation (Recommended)**:
   - Download `package.zip` from [GitHub Releases](https://github.com/xiaolv-suite/siyuan-exam/releases) and extract into `<Workspace>/data/plugins/siyuan-exam/`;
   - Enable **Lv Exam / 小驴考试** in SiYuan `Settings → Marketplace → Downloaded`, then press `Ctrl+Alt+P` (`⌥⌘P` on macOS).
2. **Developer Setup**:
   ```bash
   git clone https://github.com/xiaolv-suite/siyuan-exam.git
   cd siyuan-exam
   pnpm install
   pnpm make-link
   ```

---

## 🔒 Data Sovereignty & Privacy

- **Local-First & Zero Telemetry**: No analytics SDKs, no tracking beacons, 100% offline-capable without AI configured.
- **Native SiYuan Blocks**: Questions live in `题库/<BankName>` notebooks with `custom-exam-*` block attributes; uninstalling the plugin never deletes your questions.
- **Explicit AI Boundary**: Content is sent to your configured AI endpoint only when you explicitly trigger generation, hints, or explanations.

---

## 🧑‍💻 Engineering & Verification

```bash
pnpm check            # typecheck + svelte-check + i18n parity + arch assertions + style audit
pnpm test             # vitest unit & integration suite
pnpm guard            # full quality gate (types + svelte + i18n + arch + styles + lint + test)
pnpm smoke:journey    # live SiYuan kernel end-to-end 5-question journey verification
pnpm build            # production bundle & package.zip generation
```

---

## 📝 Recent Updates

- **SiYuan 3.8.10+ Native Adaptations**: Fullscreen CBT mock exam coordinates folding/restoring native docks (`toggleNativeDock`); report dashboards, review logs, and outline summaries support native document tree context menus (`showDocTreeNativeMenu`); `safeDocTitleFromHPath` protects titles with slashes.
- **Question Drawer Ghost Gap Resolution**: Cleaned up 5 residual malformed `<span>` open tags in `QuestionPeekDrawer`, eliminating ~50px spacing artifacts; restored explicit transition properties and added inline style integrity contracts.
- **Input Method & Touch Polish**: Import tag filter, quick-split input, and occlusion image URL input yield during IME composition; textarea resize grip disabled on touch and narrow viewports.
- **Performance & Engineering Gates**: Info/debug logging gated behind build-time `__LV_EXAM_DEV__`; drawer doc search debounced at 300ms with out-of-order response sequence guards; clipboard error-handling coverage enforced.

<details>
<summary>View Previous Release Highlights (v0.15.5 and earlier)</summary>

### v0.15.5 (2026-11-17)
- Official settings gear entry (`openSetting()`), daily note sync conflict exclusion, modern setting group badges, and idle timer power reduction.

### v0.15.4 (2026-11-15)
- Socratic AI mentor wait card overhaul, workspace switch anti-blank-screen recovery, mobile scroll & exit button fixes, and 3-day review reminder snooze.

### v0.15.3 (2026-11-13)
- Launchpad startup debounce & topbar alignment, LifeLog photo stream & atomic undo, unified ecosystem backup restore (`openEcosystemRestoreDialog`), and mobile touch terminology cleanup.

### v0.15.2 (2026-11-12)
- Question drawer option spacing fix, IME composition guards across filters/inputs, and clipboard error-handling coverage.

### v0.15.1 (2026-11-10)
- Mobile full-screen dialog exit upon opening question notes, paper assemble user notices, Launchpad convergence, and `xiaolv-suite` organization migration.

### v0.15.0 (2026-11-02)
- 3.5s auto-next countdown, recite mode, deterministic option shuffling, scratchpad highlighters, and Public Domain MarketplaceHub.

</details>

---

## 📄 License

Licensed under the [MIT License](LICENSE).
