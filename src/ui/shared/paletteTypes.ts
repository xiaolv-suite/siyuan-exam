export interface PaletteCommand {
  group: string;
  icon: string;
  label: string;
  /** 搜索别名（en 关键词等；对 label 之外的关键词命中） */
  keywords?: string;
  kbd?: string;
  run: () => void;
}
