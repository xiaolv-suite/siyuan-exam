<div align="center">

# 🐴 Lv Study (Beta) (小驴学习（原小驴考试）)

> **Beta Notice:** Features and UI are continuously evolving. Try with sample banks or your personal study materials first. Join QQ group **871707735** for feedback, bug reports, and discussions.

**Local-first learning, question bank, and exam workspace in SiYuan: language acquisition (Cantonese/English), flashcards, practice, mock exams, wrongbook, teacher worksheets, and reviewable AI assistance.**

> **Personal Notes → Independent Retrieval → Reflective Action → Scheduled Retest → Knowledge Compounding**  
> Your questions live in your own SiYuan notebooks — every question is a searchable, linkable, syncable **SiYuan block**, not rows in someone else's cloud.

[![Release](https://img.shields.io/github/v/release/ai68298100/siyuan-exam?logo=github)](https://github.com/ai68298100/siyuan-exam/releases)
[![CI](https://github.com/ai68298100/siyuan-exam/actions/workflows/check.yml/badge.svg)](https://github.com/ai68298100/siyuan-exam/actions/workflows/check.yml)
[![Tests](https://img.shields.io/badge/tests-1411%20passed-brightgreen)](#-development)
[![SiYuan](https://img.shields.io/badge/SiYuan-%3E%3D%203.8.4-blue)](https://github.com/siyuan-note/siyuan)
[![License](https://img.shields.io/badge/license-MIT-green)](#-license)

<img src="preview.png" alt="Lv Study (Beta) preview" width="640"/>

*[中文说明](README.md) · English Docs · [Current Status](docs/STATUS.md) · [Delivery Guide](docs/DELIVERY.md) · [UI Components](docs/UI-COMPONENTS.md) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [Releases](https://github.com/ai68298100/siyuan-exam/releases)*

</div>

---

## 🌟 Latest Release: v0.12.0 (2026-10-27)

This milestone release delivers the physical architecture decoupling of the Teacher Research & Preparation workspace and printing center.

- **Teacher Workspace Physical Decoupling:**
  - Extracted the entire teaching and prep cockpit into `src/ui/practice/TeacherWorkspaceView.svelte`, completely separating student practice journeys from educator publishing and item analysis workflows.
  - Encapsulated three core divisions: Publishing & Printing Center (A4 double-column, worksheets, teacher lecture keys), Question Authoring Studio, and Bank Archival & Distribution.
- **Item Quality Diagnostics & Revision Loop:**
  - Direct bridge between classical test theory (CTT) discrimination diagnostics and inline question revisions.
- **Automated Verification:**
  - 100% green test suite across **181 test files and 1411 unit tests**.

---

## ⚡ Recent Major Milestones

- **v0.11.99 MaterialGroupContextCard Decoupling & Expansion Memory:**
  - Extracted `MaterialGroupContextCard.svelte` and persistent reading passage expansion across sub-questions.

- **v0.11.98 GroupBatchSummaryCard Decoupling & Wrongbook Sorting:**
  - Extracted `GroupBatchSummaryCard.svelte` and persisted wrongbook multi-dimensional sorting preferences.

- **v0.11.97 SpeechEvalCapsule Decoupling & Recitation Loop:**
  - Extracted `SpeechEvalCapsule.svelte` and completed the speech pronunciation feedback loop in recitation mode.

- **v0.11.96 ScratchpadDrawer Decoupling & Block Deep-Link Highlighting:**
  - Extracted `ScratchpadDrawer.svelte` and enabled `siyuan://blocks/` flash-focus navigation.

- **v0.11.95 SessionSheetModal Decoupling & Mother-Question Provenance:**
  - Extracted `SessionSheetModal.svelte` and added bidirectional block provenance links for variations.

- **v0.11.94 Onboarding Note-to-Quiz Direct & BankGalleryModal Decoupling:**
  - Direct note-to-quiz extraction shortcut on empty screens and extracted `BankGalleryModal.svelte`.

- **v0.11.93 Floating Dock Tactile Overhaul & ShortcutsModal Decoupling:**
  - 20px Bento Floating Dock with tactile micro-elastic feedback and standalone `ShortcutsHelpModal.svelte`.

- **v0.11.92 Leech Flashcard Escalation & DoneCard Decoupling:**
  - Dedicated push-to-flashcard actions for Leech errors and extracted `PracticeDoneCard.svelte`.

- **v0.11.91 SiYuan 3.8.9 Metadata Resilience & Note Import:**
  - Auto self-healing for `metadata not ready` on SiYuan 3.8.9-beta.2, normalized note extraction errors, Extract to Quiz bridge, and weakness alert federation.

- **v0.11.90 Mock Exam Federation Event & Repo Hygiene:**
  - Aligned CBT Mock Exam completion with `lv-exam:session-ended` ecosystem standard events and added `SHA256SUMS` to `.gitignore`.

- **v0.11.89 Multilingual Speech & Pronunciation Evaluation:**
  - Pure-function edit distance and character-matching evaluation algorithm (`speechEval.ts`) filtering punctuation and casing.
  - Interactive recording microphone in practice and recitation modes with 3-tier feedback (Excellent / Good / Needs Practice) for `en-US`, `zh-HK`, and `zh-CN`.
- **v0.11.88 K12 Pinyin Tone Conversion & Pure Retest Sheet:**
  - Pinyin tone converter (`pinyinToNumbered`) normalizing numbered tones (e.g., `qie4`) with diacritic marks (e.g., `qiè`).
  - Professional A4 double-column Wrongbook Retest Worksheet generator (`buildWrongbookRetestSheetPro`) with zero answer leakage.
- **v0.11.87 Clearance Roadmap & Bottleneck Chain:**
  - Topological knowledge-point prerequisite induction engine (`planClearanceStudy`), segmenting preparation into progressive stages with dedicated drill triggers.
  - Visual root bottleneck warnings identifying upstream prerequisites impeding advanced mastery.
- **v0.11.85-v0.11.86 Mock Rich Text, Ruled Paper & Full-Score Passes:**
  - LaTeX and Markdown rich formula rendering in mock exams; 28px ruled paper background mode for subjective essays.
  - Highlighting Bento pass cards for 100% correct sessions guiding students to next-stage mock tests or reports.
- **v0.11.79-v0.11.84 Decoupled Dual Roles (Student vs. Teacher) & Item Discrimination:**
  - Completely separated student prep workspace from teacher research workspace.
  - A4/A3 double-column compact exam paper printing with OMR bubbles (`printPro.ts`).
  - Item discrimination ($D$-index) and facility value ($P$-value) quality diagnostics under Classical Test Theory (CTT) with Ebel 4-tier ratings and CSV export.

---

## 📦 Core Capability Matrix

| Module | Features & Capabilities |
|---|---|
| 📥 **Question Ingestion** | Extract from native SiYuan notes (Markdown question tables, `<details>` flashcards, `**Concept**:` definitions, `==cloze==` highlights, task lists) · Import XLSX/XLS, CSV, TSV (Anki front/back & header modes), GIFT (Moodle), Aiken · 5-row trial preview · Duplicate strategies (skip/coexist/update) · Breakpoint checkpoints & readback verification |
| ✏️ **Adaptive Practice** | Keyboard-first workflow (A-J select, Enter submit, 1-3 confidence) · 3 font size options (16/19/22px) · Delayed wrong-answer review cycle · Submission undo & rollback · Virtual viewport avoidance (`visualViewport`) for mobile keyboards · Speech pronunciation evaluation (`speechEval.ts`) |
| 📖 **Recitation Mode** | Paper-like card recitation · Adaptive progress bar & spacebar reveals · Bento evaluation ratings · Clean TTS auto-narration (stripping Markdown/LaTeX noise) · Ebbinghaus memory rescue banner |
| 📝 **CBT Mock Exams** | Standard exam blueprints (Professional Certification, University Higher Math, K12 Education, Civil Service/Law, Language Micro-tests) · Adaptive sprint paper assembly (`adaptiveMockAssembler`) · 2D answer-grid keyboard navigation · Ruled essay background & live word-count guard · Immutable paper snapshots |
| 🧠 **Wrongbook & Diagnosis** | 4-element structured error self-diagnosis (`selfDiagnosis.ts`) · Stubborn error mitigation · Ghost-button degradation for FSRS flashcard export (`siyuan-lv-cards`) · Pure retest exam sheet printing |
| 🧑‍🏫 **Teacher & Print Pro** | Dedicated teaching workspace · A4/A3 double-column compact exam paper and OMR answer card printing (`printPro.ts`) · Item discrimination ($D$) & facility ($P$) diagnostic reports with CSV export |
| 📊 **Evidence Analytics** | 5-dimension readiness radar · Knowledge point hierarchical tree & Clearance Roadmap · Critical bottleneck chain tracing · Confidence calibration curves & 4-quadrant diagnostic (Blindspot/Lucky/Mastered/Careless) |
| 🤖 **Reviewable AI** | Dual channels (SiYuan kernel proxy + custom OpenAI-compatible endpoints) · Budget & rate guards · Step-by-step option explanations · Socratic follow-ups · Rejection repair pipeline |
| 🔗 **Ecosystem Federation** | Standard envelope events (`lv-exam:session-ended`, `lv-exam:wrongbook-changed`) · Seamless soft-bridges to Check-in (`siyuan-checkin`), Raikiri (`siyuan-speed-switch`), Glean (`siyuan-glean`), and Cards (`siyuan-lv-cards`) |

---

## 🚀 Quick Start

### Installation
1. **Via SiYuan Bazaar (Recommended)**: Search for **"小驴学习"** or **"Lv Study"** in SiYuan's Plugin Marketplace and click Install.
2. **Manual Installation**: Download `package.zip` from [GitHub Releases](https://github.com/ai68298100/siyuan-exam/releases), extract into `<Workspace>/data/plugins/siyuan-exam/`, restart SiYuan and enable it in Settings.
3. **Developer Setup**:
   ```bash
   git clone https://github.com/ai68298100/siyuan-exam.git
   cd siyuan-exam
   pnpm install
   pnpm make-link
   ```

### 30-Second Fast Tour
1. Open the plugin via the top bar icon or the ⌘K command palette.
2. Click **Create Sample Bank (12 Questions)** in Practice to immediately experience single choice, multi-choice, judge, fill-in, and speech evaluation questions.
3. Complete a quick drill, intentionally miss a question to inspect the Wrongbook and 4-element self-diagnosis, then review your learning curve in the Report Center.

---

## 🔒 Data Sovereignty & Privacy

- **Local-First**: All questions, attempt logs, error reflections, and test papers reside exclusively inside your own SiYuan workspace. Zero telemetry.
- **Pure Blocks**: Every question is a native SiYuan block with standard `custom-exam-*` attributes, fully searchable, linkable, and backed up by SiYuan's native history and sync.
- **Explicit AI Boundary**: Question content is dispatched to AI endpoints only when explicitly invoked by user actions (explanation, variation derivation, generation). When unconfigured, AI operations remain 100% silent.

---

## 🧑‍💻 Engineering & Quality

```bash
pnpm check            # typecheck + svelte-check + i18n parity + arch assertions + style audit
pnpm test             # vitest (181 test files, 1407 passed tests)
pnpm guard            # full pre-commit security and quality validation
pnpm build            # production bundle & package.zip generation
pnpm verify:package   # release whitelist and asset size verification
```

- **Architecture Guard**: 42 strict architectural integrity assertions verified on every build.
- **Style Discipline**: 100% tokenized styles conforming to the Prussian Academy Blue & Cinnabar Seal Bento design token system.

---

## 🤝 Community & Feedback

- 🐛 **Issue Tracker**: [GitHub Issues](https://github.com/ai68298100/siyuan-exam/issues)
- 💬 **Discussions**: [GitHub Discussions](https://github.com/ai68298100/siyuan-exam/discussions)
- 👥 **QQ User Group**: **871707735**

---

## 📄 License

Licensed under the [MIT License](LICENSE).
