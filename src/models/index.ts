import { z } from 'zod';

// ─── VIDEO ───────────────────────────────────────────────────────────────────

// Reusable i18n translation map
const TranslationMap = z.record(z.string(), z.string()).optional();

export const CreateVideoDto = z.object({
  moduleId: z.string().cuid(),
  title: z.string().min(2),
  type: z.enum(['EXPLANATION', 'PRACTICE', 'TASTER', 'DEMONSTRATION', 'ASSESSMENT']),
  cloudflareVideoId: z.string().optional(),
  youtubeUrl: z.string().optional(),
  durationSecs: z.number().int().positive().optional(),
  thumbnailUrl: z.string().url().optional(),
  isPreviewClip: z.boolean().default(false),
  closedCaptions: z.string().optional(),
  sortOrder: z.number().int().min(0).default(0),
  titleTranslations: TranslationMap,
});

export const UpdateVideoDto = CreateVideoDto.partial().extend({
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
});

export const VideoUploadUrlDto = z.object({
  moduleId: z.string().cuid(),
  title: z.string().min(2),
  maxDurationSeconds: z.number().int().positive().default(1800),
});

export const VideoNoteDto = z.object({
  timestampSec: z.number().int().min(0),
  noteText: z.string().min(1).max(1000),
});

export type CreateVideoInput = z.infer<typeof CreateVideoDto>;
export type UpdateVideoInput = z.infer<typeof UpdateVideoDto>;
export type VideoUploadUrlInput = z.infer<typeof VideoUploadUrlDto>;
export type VideoNoteInput = z.infer<typeof VideoNoteDto>;

// ─── ANNOUNCEMENT ────────────────────────────────────────────────────────────

export const CreateAnnouncementDto = z.object({
  title: z.string().min(2).max(80),
  body: z.string().min(2).max(300),
  targetAudience: z
    .enum(['ALL_SUBSCRIBERS', 'ACTIVE_ONLY', 'ALL_REGISTERED', 'SPEECH_MODULE_USERS'])
    .default('ALL_SUBSCRIBERS'),
  deepLink: z.string().optional(),
  scheduledAt: z.string().datetime({ offset: true }).optional(),
  titleTranslations: TranslationMap,
  bodyTranslations:  TranslationMap,
});

export const UpdateAnnouncementDto = CreateAnnouncementDto.partial();

export type CreateAnnouncementInput = z.infer<typeof CreateAnnouncementDto>;
export type UpdateAnnouncementInput = z.infer<typeof UpdateAnnouncementDto>;

// ─── SUBSCRIPTION ────────────────────────────────────────────────────────────

export const OverrideSubscriptionDto = z.object({
  status: z.enum(['ACTIVE', 'TRIAL', 'CANCELLED', 'EXPIRED', 'SCHOLARSHIP']),
  plan: z.enum(['monthly', 'annual', 'trial', 'scholarship']).optional(),
  periodEnd: z.string().datetime({ offset: true }).optional(),
  reason: z.string().optional(),
});

export const RevenueCatSyncDto = z.object({
  subscriberId: z.string(),
  entitlements: z.record(
    z.object({
      isActive: z.boolean(),
      expiresDate: z.string().optional(),
      store: z.string().optional(),
    }),
  ),
});

export type OverrideSubscriptionInput = z.infer<typeof OverrideSubscriptionDto>;
export type RevenueCatSyncInput = z.infer<typeof RevenueCatSyncDto>;

// ─── PAYMENT ─────────────────────────────────────────────────────────────────

export const FlutterwaveInitiateDto = z.object({
  plan: z.enum(['monthly', 'annual']),
  currency: z.string().length(3).default('USD'),
  // phone/provider are optional — Flutterwave hosted checkout handles all payment methods
  phone: z.string().min(8).optional(),
  provider: z.enum(['mpesa', 'mtn_momo', 'mtn', 'airtel_money', 'airtel', 'vodacom_mpesa', 'orange', 'orange_money']).optional(),
});

export const StripeCheckoutDto = z.object({
  plan: z.enum(['monthly', 'annual']),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});

export type FlutterwaveInitiateInput = z.infer<typeof FlutterwaveInitiateDto>;
export type StripeCheckoutInput = z.infer<typeof StripeCheckoutDto>;

// ─── DONATION ────────────────────────────────────────────────────────────────

export const InitiateDonationDto = z.object({
  amount: z.number().positive(),
  currency: z.string().length(3).default('USD'),
  email: z.string().email(),
  donorName: z.string().optional(),
  method: z.enum(['stripe', 'flutterwave']),
  campaign: z.enum(['Scholarship Fund', 'New Module Dev', 'General']).default('Scholarship Fund'),
  showOnDonorWall: z.boolean().default(true),
});

export const GrantScholarshipDto = z.object({
  email: z.string().email(),
  notes: z.string().optional(),
});

export type InitiateDonationInput = z.infer<typeof InitiateDonationDto>;
export type GrantScholarshipInput = z.infer<typeof GrantScholarshipDto>;

// ─── ASK DR. GAD ─────────────────────────────────────────────────────────────

export const AskGadSubmissionDto = z.object({
  // Renamed from 'question' to 'questionText' to match the DB field (AskGadSubmission.questionText)
  questionText: z.string().min(10).max(1000),
  videoR2Key: z.string().optional(),
});

export const AskGadResponseDto = z.object({
  responseText: z.string().min(1),
  responseVideoR2Key: z.string().optional(),
});

export type AskGadSubmissionInput = z.infer<typeof AskGadSubmissionDto>;
export type AskGadResponseInput = z.infer<typeof AskGadResponseDto>;

// ─── PROGRESS / ROUTINE ──────────────────────────────────────────────────────

export const UpdateProgressDto = z.object({
  videoId: z.string().cuid().optional(),
  watchedPercent: z.number().min(0).max(100).optional(),
  completed: z.boolean().optional(),
  lastPositionSecs: z.number().int().min(0).optional(),
});

export const SyncRoutineDto = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  entries: z.array(
    z.object({
      category: z.string(),
      taskKey: z.string(),
      completed: z.boolean(),
      completedAt: z.string().datetime({ offset: true }).optional(),
    }),
  ),
});

export const JournalEntryDto = z.object({
  // DB fields: date (YYYY-MM-DD), noteText, photoR2Key — one entry per user per day
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  noteText: z.string().max(5000).optional(),
  photoR2Key: z.string().optional(),
});

export const MilestoneReportDto = z.object({
  // DB fields: weekStart (YYYY-MM-DD Monday), responseName, eyeContact, sitting, sounds, calmness, notes
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  responseName: z.number().int().min(1).max(5).optional(),
  eyeContact:   z.number().int().min(1).max(5).optional(),
  sitting:      z.number().int().min(1).max(5).optional(),
  sounds:       z.number().int().min(1).max(5).optional(),
  calmness:     z.number().int().min(1).max(5).optional(),
  notes: z.string().max(2000).optional(),
});

export type UpdateProgressInput = z.infer<typeof UpdateProgressDto>;
export type SyncRoutineInput = z.infer<typeof SyncRoutineDto>;
export type JournalEntryInput = z.infer<typeof JournalEntryDto>;
export type MilestoneReportInput = z.infer<typeof MilestoneReportDto>;
