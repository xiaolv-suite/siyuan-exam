export {
  isStubbornWrong,
  getStubbornRemediation,
  filterStubbornWrongs,
  type StubbornRemediation,
} from "./core/stubborn";
export {
  identifyBlindspots,
  calculateReadinessDimensions,
  generateReadinessReport,
  exportReadinessReportMarkdown,
  exportReadinessReportCsv,
  type ReadinessDimensionKey,
  type DimensionHealthStatus,
  type ReadinessDimensionScore,
  type BlindspotRiskLevel,
  type BlindspotItem,
  type ReadinessGrade,
  type ReadinessHealthReport,
  type ReadinessRadarOptions,
} from "./core/readinessRadar";
export {
  assembleAdaptiveSprintPaper,
  convertSprintPaperToBlueprint,
  exportSprintPaperMarkdown,
  exportSprintPaperCsv,
  type SprintQuestionTier,
  type SprintQuestionMeta,
  type AdaptiveSprintPaperOptions,
  type AdaptiveSprintPaperComposition,
  type AdaptiveSprintPaper,
} from "./core/adaptiveMockAssembler";
export {
  parseOcrQuestionText,
  ocrResultToQuestion,
  buildVisionOcrPrompt,
  type OcrParseOptions,
  type ParsedOcrQuestion,
} from "./core/ocr";
export {
  normalizeLatexFormula,
  renderLatex,
  renderSemanticLatex,
  renderMathInText,
  getMathPrintStyles,
} from "./core/math";
