<script lang="ts">
  import Icon from "../shared/Icon.svelte";

  interface Props {
    practiceQuestionsCount: number;
    teacherPrintBusy: boolean;
    syncDocsBusy: boolean;
    offline: boolean;
    hasBank: boolean;
    t: (k: string, fb?: string) => string;
    onprintPaper: () => void;
    onexportTeacherPaper: () => void;
    onprintHomework: () => void;
    onopenReport: () => void;
    onopenMock: () => void;
    onnavManual: () => void;
    onnavImport: () => void;
    onnavAi: () => void;
    onnavMaterials: () => void;
    onnavBrowse: () => void;
    onsyncBankDocs: () => void;
    oncopyChallengeCode: () => void;
    onimportChallengeCode: () => void;
    onexportBank: () => void;
  }

  let {
    practiceQuestionsCount,
    teacherPrintBusy,
    syncDocsBusy,
    offline,
    hasBank,
    t,
    onprintPaper,
    onexportTeacherPaper,
    onprintHomework,
    onopenReport,
    onopenMock,
    onnavManual,
    onnavImport,
    onnavAi,
    onnavMaterials,
    onnavBrowse,
    onsyncBankDocs,
    oncopyChallengeCode,
    onimportChallengeCode,
    onexportBank,
  }: Props = $props();
</script>

<div class="stack-md" style="margin-top:14px">
  <!-- 模块一：教研出版与分层印卷中心 -->
  <div class="lv-section-title">
    <span style="display:inline-flex;align-items:center;gap:6px"><Icon name="printer" size={15} /> 模块一：教研出版与分层印卷中心</span>
    <span class="lv-muted" style="font-size:12px;font-weight:400">出版级 A4 排版 · 教学讲义 · 课后作业单</span>
  </div>
  <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));gap:14px">
    <div class="lv-card" style="padding:18px;background:var(--lv-surface);border:1px solid var(--lv-border);border-top:3px solid var(--lv-brand);border-radius:var(--lv-r-3);box-shadow:var(--lv-sh-card);display:flex;flex-direction:column;justify-content:space-between">
      <div>
        <b style="font-size:15px;color:var(--lv-text);display:flex;align-items:center;gap:6px">
          <Icon name="printer" size={16} /> A4 双栏试卷印刷
        </b>
        <p class="lv-muted" style="font-size:12px;margin:8px 0 16px;line-height:1.5">
          按考点智能排版、带考生密封线与主客观答题区，排版规整，可直接导出送印。
        </p>
      </div>
      <button class="lv-btn lv-btn--primary sm" style="width:100%" onclick={onprintPaper} disabled={!practiceQuestionsCount || teacherPrintBusy}>
        <Icon name="printer" size={13} /> {teacherPrintBusy ? "正在排版…" : "打印 A4 双栏卷"}
      </button>
    </div>

    <div class="lv-card" style="padding:18px;background:var(--lv-surface);border:1px solid var(--lv-border);border-top:3px solid var(--lv-accent);border-radius:var(--lv-r-3);box-shadow:var(--lv-sh-card);display:flex;flex-direction:column;justify-content:space-between">
      <div>
        <b style="font-size:15px;color:var(--lv-text);display:flex;align-items:center;gap:6px">
          <Icon name="book" size={16} /> 教师讲义教案卷
        </b>
        <p class="lv-muted" style="font-size:12px;margin:8px 0 16px;line-height:1.5">
          导出包含题目、正确答案、深度解析、考点大纲与主观采分点细则的教师专用教案。
        </p>
      </div>
      <button class="lv-btn sm" style="width:100%" onclick={onexportTeacherPaper} disabled={!practiceQuestionsCount || teacherPrintBusy}>
        <Icon name="book" size={13} /> 导出教师讲义
      </button>
    </div>

    <div class="lv-card" style="padding:18px;background:var(--lv-surface);border:1px solid var(--lv-border);border-top:3px solid var(--lv-green);border-radius:var(--lv-r-3);box-shadow:var(--lv-sh-card);display:flex;flex-direction:column;justify-content:space-between">
      <div>
        <b style="font-size:15px;color:var(--lv-text);display:flex;align-items:center;gap:6px">
          <Icon name="file" size={16} /> 课后分层作业单
        </b>
        <p class="lv-muted" style="font-size:12px;margin:8px 0 16px;line-height:1.5">
          生成带学生班级学号填写栏、分步作答区与订正反思框的课后分层导学练习单。
        </p>
      </div>
      <button class="lv-btn sm" style="width:100%" onclick={onprintHomework} disabled={!practiceQuestionsCount || teacherPrintBusy}>
        <Icon name="file" size={13} /> 打印课后作业单
      </button>
    </div>

    <div class="lv-card" style="padding:18px;background:var(--lv-surface);border:1px solid var(--lv-border);border-top:3px solid var(--lv-amber);border-radius:var(--lv-r-3);box-shadow:var(--lv-sh-card);display:flex;flex-direction:column;justify-content:space-between">
      <div>
        <b style="font-size:15px;color:var(--lv-text);display:flex;align-items:center;gap:6px">
          <Icon name="chart" size={16} /> 试题质量与区分度
        </b>
        <p class="lv-muted" style="font-size:12px;margin:8px 0 16px;line-height:1.5">
          基于答题真实数据诊断全库题目区分度、难度系数分布、零命中死干扰项与考点断层。
        </p>
      </div>
      <button class="lv-btn sm lv-btn--ghost" style="width:100%" onclick={onopenReport}>
        <Icon name="chart" size={13} /> 查看试题诊断
      </button>
    </div>
  </div>

  <!-- 模块二：命题与知识库工坊 -->
  <div class="lv-section-title" style="margin-top:14px">
    <span style="display:inline-flex;align-items:center;gap:6px"><Icon name="pencil" size={15} /> 模块二：命题与知识库工坊</span>
    <span class="lv-muted" style="font-size:12px;font-weight:400">精准手工录题 · 试卷批量导入 · AI命题审校 · 原文资料切片</span>
  </div>
  <div class="lv-modes">
    <button class="lv-mode" onclick={onnavManual}>
      <span class="lv-mode-icon lv-mode-icon--daily"><Icon name="clipboard" /></span>
      <span class="lv-mode-body">
        <b>手工录题工坊</b>
        <span class="lv-muted">单选/多选/判断/填空/简答，含数学物理公式坞</span>
      </span>
    </button>
    <button class="lv-mode" onclick={onnavImport}>
      <span class="lv-mode-icon lv-mode-icon--quick"><Icon name="import" /></span>
      <span class="lv-mode-body">
        <b>批量导入试题</b>
        <span class="lv-muted">支持思源文档、Excel/CSV、Aiken 与划重点挖空</span>
      </span>
    </button>
    <button class="lv-mode" onclick={onnavAi}>
      <span class="lv-mode-icon lv-mode-icon--cram"><Icon name="sparkles" /></span>
      <span class="lv-mode-body">
        <b>AI 智能命题</b>
        <span class="lv-muted">阅读长材料提炼考点，进入 Inbox 审核收件箱</span>
      </span>
    </button>
    <button class="lv-mode lv-mode--minor" onclick={onnavMaterials}>
      <span class="lv-mode-icon lv-mode-icon--fav"><Icon name="book" /></span>
      <span class="lv-mode-body">
        <b>参考教材与资料</b>
        <span class="lv-muted">PDF 讲义、网课音视频时间戳与考点双链笔记</span>
      </span>
    </button>
    <button class="lv-mode lv-mode--minor" onclick={onnavBrowse}>
      <span class="lv-mode-icon lv-mode-icon--recite"><Icon name="grid" /></span>
      <span class="lv-mode-body">
        <b>全库题目管理与体检</b>
        <span class="lv-muted">批量修改考点、查重合并、大纲树状图排查</span>
      </span>
    </button>
    <button class="lv-mode lv-mode--minor" onclick={onopenMock}>
      <span class="lv-mode-icon lv-mode-icon--cram"><Icon name="clock" /></span>
      <span class="lv-mode-body">
        <b>组卷蓝图与考场配置</b>
        <span class="lv-muted">大题配比、分值设置、及格线与防作弊洗牌</span>
      </span>
    </button>
  </div>

  <!-- 模块三：教研归档与协作 -->
  <div class="lv-section-title" style="margin-top:14px">
    <span style="display:inline-flex;align-items:center;gap:6px"><Icon name="save" size={15} /> 模块三：题库归档与协作分发</span>
    <span class="lv-muted" style="font-size:12px;font-weight:400">离线同步思源文档 · 挑战码分享 · 题库包导出</span>
  </div>
  <div class="lv-row" style="margin:0;gap:8px;flex-wrap:wrap">
    <button class="lv-btn" onclick={onsyncBankDocs} disabled={syncDocsBusy || offline || !hasBank} title={t("sync.docsTip")}>
      <Icon name="save" size={15} /> {syncDocsBusy ? "…" : "同步整套题册至思源文档"}
    </button>
    <button class="lv-btn" onclick={oncopyChallengeCode}>
      <Icon name="target" size={15} /> 复制友谊赛挑战码
    </button>
    <button class="lv-btn" onclick={onimportChallengeCode}>
      <Icon name="import" size={15} /> 导入挑战码试卷
    </button>
    <button class="lv-btn" disabled={offline} onclick={onexportBank}>
      <Icon name="export" size={15} /> 导出标准题库备份包
    </button>
  </div>
</div>
