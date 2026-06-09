import { prisma } from '../lib/prisma.js';
import { presignedPut, publicUrl } from '../lib/r2.js';
import { randomUUID } from 'crypto';
import path from 'path';
import { getLang, localizeModule } from '../lib/i18n.js';
import type {
  CreateModuleInput,
  UpdateModuleInput,
  CreateModuleGroupInput,
  ModuleFeedbackInput,
  CreateResourceInput,
  UpdateResourceInput,
} from '../models/module.model.js';

export const ModuleService = {
  async getGroups(userId: string, hasSubscription: boolean, req?: any) {
    const lang = req ? getLang(req) : 'en';
    const groups = await prisma.moduleGroup.findMany({
      orderBy: { sortOrder: 'asc' },
      include: {
        modules: {
          where: { status: 'PUBLISHED' },
          orderBy: { sortOrder: 'asc' },
          include: {
            videos: {
              where: { status: 'PUBLISHED' },
              select: { id: true, title: true, type: true, durationSecs: true, thumbnailUrl: true, isPreviewClip: true },
            },
            progress: {
              where: { userId },
              select: { completed: true, watchedPercent: true },
            },
            _count: {
              select: { resources: true },
            },
          },
        },
      },
    });

    return groups.map(group => ({
      ...group,
      name: lang !== 'en' && (group as any).nameTranslations ? ((group as any).nameTranslations[lang] || group.name) : group.name,
      description: lang !== 'en' && (group as any).descriptionTranslations ? ((group as any).descriptionTranslations[lang] || group.description) : group.description,
      modules: group.modules.map(mod => {
        // Compute progress fields the mobile app reads: progressPercent, isCompleted
        const userProgress = (mod.progress as any[])?.[0];
        const progressPercent = Math.round(userProgress?.watchedPercent ?? 0);
        const isCompleted     = userProgress?.completed ?? false;

        // emoji: use module-level emoji when set, otherwise inherit from parent group
        const emoji = mod.emoji ?? group.emoji ?? '📖';

        // Compute convenience counts for the mobile home card
        const videosCount      = mod.videos.length;
        const resourcesCount   = (mod as any)._count?.resources ?? 0;
        const totalDurationMin = Math.round(
          mod.videos.reduce((sum, v) => sum + ((v as any).durationSecs ?? 0), 0) / 60
        );

        const localizedMod = localizeModule({ ...mod, group }, lang);

        if (!hasSubscription && !mod.isPreview) {
          return { ...localizedMod, emoji, videos: [], locked: true, progressPercent, isCompleted, videosCount: 0, resourcesCount: 0, totalDurationMin: 0 };
        }
        return { ...localizedMod, emoji, locked: false, progressPercent, isCompleted, videosCount, resourcesCount, totalDurationMin };
      }),
    }));
  },

  async listModules(params: { isAdmin: boolean; search?: string; status?: string; groupId?: string; req?: any }) {
    const { isAdmin, search, status, groupId, req } = params;
    const lang = req ? getLang(req) : 'en';
    const where: any = isAdmin ? {} : { status: 'PUBLISHED' };
    if (status && isAdmin) where.status = status;
    if (groupId) where.groupId = groupId;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }
    const mods = await prisma.module.findMany({
      where,
      orderBy: [{ group: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
      include: {
        group: true,
        videos: {
          where: isAdmin ? {} : { status: 'PUBLISHED' },
          select: { id: true, title: true, type: true, durationSecs: true, status: true },
        },
        _count: { select: { progress: { where: { completed: true } } } },
      },
    });
    if (lang === 'en') return mods;
    return mods.map(m => localizeModule(m, lang));
  },

  async getModuleAdmin(id: string) {
    const mod = await prisma.module.findUnique({
      where: { id },
      include: {
        group: true,
        videos: { orderBy: { sortOrder: 'asc' } },
        // resources NOT included here — fetched separately via raw prisma client
        // to avoid relation-resolution failures on raw-SQL-created tables
        _count: { select: { progress: true, feedback: true } },
        feedback: {
          take: 100,
        },
      },
    });
    if (!mod) throw Object.assign(new Error('Module not found'), { status: 404 });

    // Fetch resources separately (table created via raw SQL, use any-cast)
    let resources: any[] = [];
    try {
      resources = await (prisma as any).moduleResource.findMany({
        where: { moduleId: id },
        orderBy: { sortOrder: 'asc' },
      });
    } catch { /* non-critical — empty array if table not yet created */ }

    const feedbackArr = (mod as any).feedback ?? [];
    const avgRating = feedbackArr.length > 0
      ? (feedbackArr.reduce((a: number, f: any) => a + ((f.childResponse + f.confidence) / 2), 0) / feedbackArr.length).toFixed(1)
      : null;

    return { module: { ...mod, resources, avgRating } };
  },

  async getModuleById(id: string, userId: string, hasSubscription: boolean, req?: any) {
    const lang = req ? getLang(req) : 'en';
    const mod = await prisma.module.findUnique({
      where: { id },
      include: {
        group: true,
        videos: { where: { status: 'PUBLISHED' }, orderBy: { sortOrder: 'asc' } },
        progress: { where: { userId } },
        feedback: { where: { userId } },
      },
    });
    if (!mod) throw Object.assign(new Error('Module not found'), { status: 404 });
    if (!hasSubscription && !mod.isPreview) {
      throw Object.assign(new Error('Subscription required'), { status: 402, locked: true });
    }
    return { module: lang === 'en' ? mod : localizeModule(mod, lang) };
  },

  async createModule(data: CreateModuleInput) {
    const mod = await prisma.module.create({ data, include: { group: true } });
    return { module: mod };
  },

  async updateModule(id: string, data: UpdateModuleInput) {
    const mod = await prisma.module.update({ where: { id }, data });
    return { module: mod };
  },

  async publishModule(id: string) {
    const mod = await prisma.module.update({ where: { id }, data: { status: 'PUBLISHED' } });
    return { module: mod };
  },

  async unpublishModule(id: string) {
    const mod = await prisma.module.update({ where: { id }, data: { status: 'DRAFT' } });
    return { module: mod };
  },

  async archiveModule(id: string) {
    await prisma.module.update({ where: { id }, data: { status: 'ARCHIVED' } });
    return { message: 'Module archived' };
  },

  async listGroups() {
    return prisma.moduleGroup.findMany({
      orderBy: { sortOrder: 'asc' },
      include: {
        modules: {
          orderBy: { sortOrder: 'asc' },
          select: { id: true, code: true, title: true, status: true },
        },
      },
    });
  },

  async createGroup(data: CreateModuleGroupInput) {
    const group = await prisma.moduleGroup.create({ data });
    return { group };
  },

  async updateGroup(id: string, data: Partial<CreateModuleGroupInput>) {
    const group = await prisma.moduleGroup.update({ where: { id }, data });
    return { group };
  },

  async deleteGroup(id: string) {
    const count = await prisma.module.count({ where: { groupId: id } });
    if (count > 0) throw Object.assign(new Error(`Cannot delete group with ${count} module${count > 1 ? 's' : ''} — reassign them first`), { status: 409 });
    await prisma.moduleGroup.delete({ where: { id } });
    return { message: 'Group deleted' };
  },

  async submitFeedback(moduleId: string, userId: string, data: ModuleFeedbackInput) {
    const feedback = await prisma.moduleFeedback.upsert({
      where: { userId_moduleId: { userId, moduleId } },
      update: data,
      create: { userId, moduleId, ...data },
    });
    return { feedback };
  },

  // ─── Resources ──────────────────────────────────────────────────────────────

  async listResources(moduleId: string) {
    const resources = await (prisma as any).moduleResource.findMany({
      where: { moduleId },
      orderBy: { sortOrder: 'asc' },
    });
    return { resources };
  },

  async createResource(moduleId: string, data: CreateResourceInput) {
    const resource = await (prisma as any).moduleResource.create({
      data: { moduleId, ...data },
    });
    return { resource };
  },

  async updateResource(id: string, data: UpdateResourceInput) {
    const resource = await (prisma as any).moduleResource.update({ where: { id }, data });
    return { resource };
  },

  async deleteResource(id: string) {
    await (prisma as any).moduleResource.delete({ where: { id } });
    return { message: 'Resource deleted' };
  },

  /**
   * Generate a presigned R2 PUT URL for a direct browser-to-R2 upload.
   * Returns the upload URL and the public CDN URL the file will be available at.
   */
  async getResourceUploadUrl(filename: string, contentType: string) {
    const ext = path.extname(filename).toLowerCase() || '';
    const key = `resources/${randomUUID()}${ext}`;
    const uploadUrl = await presignedPut(key, contentType);
    const fileUrl = publicUrl(key);
    return { uploadUrl, fileUrl, key, expiresIn: 900 };
  },
};
