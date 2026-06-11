import { z } from 'zod';

// Reusable translation map shape: { fr?: string, rw?: string, sw?: string }
const TranslationMap = z.record(z.string(), z.string()).optional();

export const CreateModuleDto = z.object({
  groupId: z.string().cuid(),
  code: z.string().regex(/^[A-Z]\d+$/, 'Code must be letter + number(s), e.g. C1'),
  title: z.string().min(2),
  emoji: z.string().optional(),
  description: z.string().optional(),
  whatToExpect: z.string().optional(),
  isPreview: z.boolean().default(false),
  status: z.enum(['DRAFT', 'PUBLISHED']).default('DRAFT'),
  sortOrder: z.number().int().min(0).default(0),
  // i18n translation maps — keys are language codes (fr, rw, sw)
  titleTranslations:       TranslationMap,
  descriptionTranslations: TranslationMap,
  whatToExpectTranslations: TranslationMap,
});

export const UpdateModuleDto = CreateModuleDto.partial();

export const CreateModuleGroupDto = z.object({
  name: z.string().min(2),
  emoji: z.string().min(1),
  description: z.string().optional(),
  sortOrder: z.number().int().min(0).default(0),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
  // i18n translation maps
  nameTranslations:        TranslationMap,
  descriptionTranslations: TranslationMap,
});

export const ModuleFeedbackDto = z.object({
  childResponse: z.number().int().min(1).max(5),   // how the child responded (1–5)
  confidence:    z.number().int().min(1).max(5),   // parent's confidence level (1–5)
  comment:       z.string().max(500).optional(),
});

export const CreateResourceDto = z.object({
  title: z.string().min(1),
  type: z.enum(['PDF', 'BOOK', 'LINK', 'AUDIO', 'WORKSHEET', 'IMAGE']),
  url: z.string().url().or(z.literal("")).optional().default(""),
  description: z.string().optional(),
  fileSize: z.number().int().positive().optional(),
  pageCount: z.number().int().positive().optional(),
  isPreviewClip: z.boolean().default(false),
  sortOrder: z.number().int().min(0).default(0),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).default('DRAFT'),
});

export const UpdateResourceDto = CreateResourceDto.partial();

export type CreateModuleInput = z.infer<typeof CreateModuleDto>;
export type UpdateModuleInput = z.infer<typeof UpdateModuleDto>;
export type CreateModuleGroupInput = z.infer<typeof CreateModuleGroupDto>;
export type ModuleFeedbackInput = z.infer<typeof ModuleFeedbackDto>;
export type CreateResourceInput = z.infer<typeof CreateResourceDto>;
export type UpdateResourceInput = z.infer<typeof UpdateResourceDto>;
