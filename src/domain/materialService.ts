import type { HostBridge } from "../bridge/hostBridge";
import type { StorageGateway } from "../storage/storageGateway";
import {
  MATERIALS_KEY,
  MATERIAL_NOTES_KEY,
  MATERIAL_QREFS_KEY,
  MISDIAGNOSIS_KEY,
  SYLLABUS_KEY,
  KP_RELATIONS_KEY,
} from "../constants";
import {
  EMPTY_REGISTRY,
  type MaterialDoc,
  type MaterialRegistry,
  type MaterialLocation,
  registerMaterial,
  removeMaterial,
  resolveMaterialUrl,
  canCopyIntoAssets,
  assetsPathFor,
  kindFromFileName,
  serializeRegistry,
} from "../core/materials";
import {
  EMPTY_NOTE_STORE,
  type MaterialNote,
  type MaterialNoteStore,
  type NoteInput,
  type NoteLocator,
  addNote,
  updateNote,
  deleteNote,
  notesOfMaterial,
  serializeNoteStore,
} from "../core/materialNotes";
import {
  EMPTY_LINK_STORE,
  type MaterialLinkStore,
  type QuestionMaterialRef,
  dropMaterial as dropMaterialLinks,
  linkQuestion,
  unlinkQuestion,
  refOf,
  questionsOfMaterial,
  serializeLinkStore,
} from "../core/materialLinks";
import {
  EMPTY_MISDIAGNOSIS,
  type MisdiagnosisRecord,
  type MisdiagnosisStore,
  addMisdiagnosis,
  latestOf,
  markAdopted,
  serializeMisdiagnosis,
} from "../core/misdiagnosis";
import {
  EMPTY_SYLLABUS,
  type SyllabusDoc,
  type SyllabusMeta,
  type SyllabusNode,
  parseSyllabus,
  serializeSyllabus,
} from "../core/syllabus";
import {
  EMPTY_RELATIONS,
  type KpRelation,
  type KpRelationsDoc,
  serializeRelations,
} from "../core/kpRelations";
import { getStandardMathTaxonomyPreset } from "../core/taxonomyAdapter";

export interface MaterialDomainDeps {
  bridge: HostBridge;
  storageGateway: StorageGateway;
  ensureTier2Loaded: () => Promise<void>;
  assertStorageWritable: () => void;
  isKernelOnline: () => boolean;
  now?: () => number;
}

export class MaterialDomainService {
  public materialsRegistry: MaterialRegistry = EMPTY_REGISTRY;
  public materialsVersionTooNew = false;
  public materialNoteStore: MaterialNoteStore = EMPTY_NOTE_STORE;
  public materialLinkStore: MaterialLinkStore = EMPTY_LINK_STORE;
  public misdiagnosisStore: MisdiagnosisStore = EMPTY_MISDIAGNOSIS;
  public syllabus: SyllabusDoc = EMPTY_SYLLABUS;
  public syllabusTooNew = false;
  public kpRelations: KpRelationsDoc = EMPTY_RELATIONS;
  public kpRelationsTooNew = false;

  constructor(private deps: MaterialDomainDeps) {}

  get materialsReadonly(): boolean { return this.materialsVersionTooNew; }
  get syllabusReadonly(): boolean { return this.syllabusTooNew; }
  get kpRelationsReadonly(): boolean { return this.kpRelationsTooNew; }

  materials(): MaterialDoc[] { return this.materialsRegistry.materials; }
  resolveLocationUrl(loc: MaterialLocation, origin?: string): string { return resolveMaterialUrl(loc, origin); }
  materialUrl(material: MaterialDoc, origin?: string): string | null {
    const loc = material.locations[0];
    return loc ? resolveMaterialUrl(loc, origin) : null;
  }

  listMaterialNotes(materialId: string): MaterialNote[] {
    return notesOfMaterial(this.materialNoteStore, materialId);
  }

  questionMaterialRef(qid: string): QuestionMaterialRef | null {
    return refOf(this.materialLinkStore, qid);
  }

  listQuestionRefs(materialId: string): QuestionMaterialRef[] {
    return questionsOfMaterial(this.materialLinkStore, materialId);
  }

  latestMisdiagnosis(qid: string): MisdiagnosisRecord | null {
    return latestOf(this.misdiagnosisStore, qid);
  }

  syllabusDoc(): SyllabusDoc { return this.syllabus; }
  kpRelationsDoc(): KpRelationsDoc { return this.kpRelations; }
  previewSyllabus(text: string): SyllabusNode[] { return parseSyllabus(text); }

  async saveMaterialsRegistry(): Promise<void> {
    await this.deps.ensureTier2Loaded();
    await this.deps.storageGateway.save(MATERIALS_KEY, serializeRegistry(this.materialsRegistry));
  }

  async saveMaterialNotes(): Promise<void> {
    await this.deps.ensureTier2Loaded();
    await this.deps.storageGateway.save(MATERIAL_NOTES_KEY, serializeNoteStore(this.materialNoteStore));
  }

  async registerMaterialFromFile(
    file: File,
    meta: { subject?: string; chapter?: string; title?: string } = {},
  ): Promise<{ material: MaterialDoc; deduped: boolean }> {
    this.deps.assertStorageWritable();
    if (this.materialsReadonly) throw new Error("注册表版本较新：只读（降级回滚场景），登记已拒绝");
    if (!this.deps.isKernelOnline()) throw new Error("离线：登记资料需要内核可写（拷入 assets）");
    const guard = canCopyIntoAssets(file.size);
    if (!guard.ok) throw new Error(guard.reason ?? "文件不可拷入");
    const path = assetsPathFor(file.name);
    await this.deps.bridge.putFile(path, file);
    const kind = kindFromFileName(file.name);
    const title = meta.title?.trim() || file.name.replace(/\.[^.]+$/, "");
    const result = registerMaterial(
      this.materialsRegistry,
      { title, kind, subject: meta.subject, chapter: meta.chapter, location: { kind: "assets", path } },
      this.deps.now?.() ?? Date.now(),
    );
    const previous = this.materialsRegistry;
    try {
      this.materialsRegistry = result.registry;
      await this.saveMaterialsRegistry();
    } catch (e) {
      this.materialsRegistry = previous;
      throw e;
    }
    return { material: result.material, deduped: result.deduped };
  }

  async registerMaterialFromLink(
    url: string,
    meta: { title?: string; subject?: string; chapter?: string } = {},
  ): Promise<{ material: MaterialDoc; deduped: boolean }> {
    if (this.materialsReadonly) throw new Error("注册表版本较新：只读（降级回滚场景），登记已拒绝");
    const clean = url.trim();
    if (!/^https?:\/\/\S+/i.test(clean)) throw new Error("仅支持 http(s) 链接");
    let name = clean;
    try {
      name = decodeURIComponent(new URL(clean).pathname.split("/").pop() ?? "") || clean;
    } catch { /* URL 解析失败按原文取名 */ }
    const result = registerMaterial(
      this.materialsRegistry,
      {
        title: meta.title?.trim() || name.replace(/\.[^.]+$/, ""),
        kind: kindFromFileName(name),
        subject: meta.subject,
        chapter: meta.chapter,
        location: { kind: "link", path: clean },
      },
      this.deps.now?.() ?? Date.now(),
    );
    const previous = this.materialsRegistry;
    try {
      this.materialsRegistry = result.registry;
      await this.saveMaterialsRegistry();
    } catch (e) {
      this.materialsRegistry = previous;
      throw e;
    }
    return { material: result.material, deduped: result.deduped };
  }

  async removeMaterialById(materialId: string, purgeAssets = false): Promise<void> {
    this.deps.assertStorageWritable();
    if (this.materialsReadonly) throw new Error("注册表版本较新：只读（降级回滚场景），移除已拒绝");
    const material = this.materialsRegistry.materials.find((m) => m.id === materialId);
    if (!material) throw new Error("资料不存在");
    const previousRegistry = this.materialsRegistry;
    const previousNotes = this.materialNoteStore;
    const previousLinks = this.materialLinkStore;
    this.materialsRegistry = removeMaterial(this.materialsRegistry, materialId);
    try {
      await this.saveMaterialsRegistry();
    } catch (e) {
      this.materialsRegistry = previousRegistry;
      throw e;
    }
    if (purgeAssets) {
      for (const loc of material.locations) {
        if (loc.kind !== "assets") continue;
        try {
          await this.deps.bridge.removeFile(loc.path);
        } catch { /* 忽略 */ }
      }
    }
    const orphanCount = notesOfMaterial(this.materialNoteStore, materialId).length;
    if (orphanCount) {
      this.materialNoteStore = { v: 1, notes: this.materialNoteStore.notes.filter((n) => n.materialId !== materialId) };
      try { await this.saveMaterialNotes(); } catch (e) {
        this.materialNoteStore = previousNotes;
        this.materialsRegistry = previousRegistry;
        throw e;
      }
    }
    if (questionsOfMaterial(this.materialLinkStore, materialId).length) {
      this.materialLinkStore = dropMaterialLinks(this.materialLinkStore, materialId);
      try {
        await this.deps.storageGateway.save(MATERIAL_QREFS_KEY, serializeLinkStore(this.materialLinkStore));
      } catch (e) {
        this.materialLinkStore = previousLinks;
        this.materialsRegistry = previousRegistry;
        throw e;
      }
    }
  }

  async addMaterialNote(input: NoteInput): Promise<MaterialNote> {
    if (this.materialsReadonly) throw new Error("存储版本较新：只读（降级回滚场景），写入已拒绝");
    const r = addNote(this.materialNoteStore, input, this.deps.now?.() ?? Date.now());
    const previous = this.materialNoteStore;
    this.materialNoteStore = r.store;
    try { await this.saveMaterialNotes(); } catch (e) { this.materialNoteStore = previous; throw e; }
    return r.note;
  }

  async updateMaterialNote(noteId: string, patch: { locator?: NoteLocator | null; text?: string; tags?: string[] }): Promise<MaterialNote> {
    if (this.materialsReadonly) throw new Error("存储版本较新：只读（降级回滚场景），写入已拒绝");
    const r = updateNote(this.materialNoteStore, noteId, patch, this.deps.now?.() ?? Date.now());
    if (!r.note) throw new Error("笔记不存在");
    const previous = this.materialNoteStore;
    this.materialNoteStore = r.store;
    try { await this.saveMaterialNotes(); } catch (e) { this.materialNoteStore = previous; throw e; }
    return r.note;
  }

  async deleteMaterialNote(noteId: string): Promise<void> {
    if (this.materialsReadonly) throw new Error("存储版本较新：只读（降级回滚场景），删除已拒绝");
    const previous = this.materialNoteStore;
    this.materialNoteStore = deleteNote(this.materialNoteStore, noteId);
    try { await this.saveMaterialNotes(); } catch (e) { this.materialNoteStore = previous; throw e; }
  }

  async linkQuestionMaterial(qid: string, materialId: string, locator?: NoteLocator | null): Promise<{ replaced: boolean }> {
    this.deps.assertStorageWritable();
    if (this.materialsReadonly) throw new Error("存储版本较新：只读（降级回滚场景），写入已拒绝");
    const material = this.materialsRegistry.materials.find((m) => m.id === materialId);
    if (!material) throw new Error("资料不存在");
    await this.deps.ensureTier2Loaded();
    const r = linkQuestion(
      this.materialLinkStore,
      { qid, materialId, revision: material.revision, locator },
      this.deps.now?.() ?? Date.now(),
    );
    const previous = this.materialLinkStore;
    this.materialLinkStore = r.store;
    try {
      await this.deps.storageGateway.save(MATERIAL_QREFS_KEY, serializeLinkStore(this.materialLinkStore));
    } catch (e) {
      this.materialLinkStore = previous;
      throw e;
    }
    return { replaced: r.replaced };
  }

  async unlinkQuestionMaterial(qid: string): Promise<void> {
    await this.deps.ensureTier2Loaded();
    this.deps.assertStorageWritable();
    if (this.materialsReadonly) throw new Error("存储版本较新：只读（降级回滚场景），删除已拒绝");
    const r = unlinkQuestion(this.materialLinkStore, qid);
    if (!r.removed) return;
    const previous = this.materialLinkStore;
    this.materialLinkStore = r.store;
    try {
      await this.deps.storageGateway.save(MATERIAL_QREFS_KEY, serializeLinkStore(this.materialLinkStore));
    } catch (e) {
      this.materialLinkStore = previous;
      throw e;
    }
  }

  async saveMisdiagnosis(rec: MisdiagnosisRecord): Promise<void> {
    await this.deps.ensureTier2Loaded();
    this.deps.assertStorageWritable();
    if (this.materialsReadonly) throw new Error("存储版本较新：只读（降级回滚场景），写入已拒绝");
    const previous = this.misdiagnosisStore;
    this.misdiagnosisStore = addMisdiagnosis(this.misdiagnosisStore, rec);
    try {
      await this.deps.storageGateway.save(MISDIAGNOSIS_KEY, serializeMisdiagnosis(this.misdiagnosisStore));
    } catch (e) {
      this.misdiagnosisStore = previous;
      throw e;
    }
  }

  async markMisdiagnosisAdopted(qid: string): Promise<void> {
    await this.deps.ensureTier2Loaded();
    this.deps.assertStorageWritable();
    if (this.materialsReadonly) throw new Error("存储版本较新：只读（降级回滚场景），写入已拒绝");
    const previous = this.misdiagnosisStore;
    this.misdiagnosisStore = markAdopted(this.misdiagnosisStore, qid, this.deps.now?.() ?? Date.now());
    try {
      await this.deps.storageGateway.save(MISDIAGNOSIS_KEY, serializeMisdiagnosis(this.misdiagnosisStore));
    } catch (e) {
      this.misdiagnosisStore = previous;
      throw e;
    }
  }

  async setSyllabusDoc(meta: SyllabusMeta, roots: SyllabusNode[]): Promise<void> {
    await this.deps.ensureTier2Loaded();
    this.deps.assertStorageWritable();
    if (this.syllabusTooNew) throw new Error("考纲存储版本较新：只读（降级回滚场景），写入已拒绝");
    if (!roots.length) throw new Error("考纲为空（解析后无节点）");
    const previous = this.syllabus;
    this.syllabus = { v: 1, meta, roots, importedAt: this.deps.now?.() ?? Date.now() };
    try {
      await this.deps.storageGateway.save(SYLLABUS_KEY, serializeSyllabus(this.syllabus));
    } catch (e) {
      this.syllabus = previous;
      throw e;
    }
  }

  async setKpRelations(relations: KpRelation[]): Promise<void> {
    await this.deps.ensureTier2Loaded();
    this.deps.assertStorageWritable();
    if (this.kpRelationsTooNew) throw new Error("考点关系存储版本较新：只读（降级回滚场景），写入已拒绝");
    const previous = this.kpRelations;
    this.kpRelations = { v: 1, relations: [...relations] };
    try {
      await this.deps.storageGateway.save(KP_RELATIONS_KEY, serializeRelations(this.kpRelations));
    } catch (e) {
      this.kpRelations = previous;
      throw e;
    }
  }

  async applyTaxonomyPreset(options: { overwriteSyllabus?: boolean; mergeRelations?: boolean } = {}): Promise<{
    roots: SyllabusNode[];
    relations: KpRelation[];
  }> {
    const preset = getStandardMathTaxonomyPreset();

    if (options.overwriteSyllabus !== false) {
      await this.setSyllabusDoc(
        {
          publisher: "教育部新课标",
          year: "2025",
          source: "cn-math-taxonomy 开源学科知识图谱",
        },
        preset.syllabusRoots,
      );
    }

    let finalRelations = preset.relations;
    if (options.mergeRelations) {
      const existingKeys = new Set(this.kpRelations.relations.map((r) => `${r.from}\0${r.to}\0${r.kind}`));
      const newItems = preset.relations.filter((r) => !existingKeys.has(`${r.from}\0${r.to}\0${r.kind}`));
      finalRelations = [...this.kpRelations.relations, ...newItems];
    }
    await this.setKpRelations(finalRelations);
    return {
      roots: preset.syllabusRoots,
      relations: finalRelations,
    };
  }
}
