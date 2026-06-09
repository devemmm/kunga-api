const SUPPORTED_LANGS = ['en', 'fr', 'rw', 'sw'] as const;
type Lang = typeof SUPPORTED_LANGS[number];

/**
 * Extract the best language from Accept-Language header or ?lang= query param.
 * Falls back to 'en'.
 */
export function getLang(req: any): Lang {
  const q = req.query?.lang;
  if (q && SUPPORTED_LANGS.includes(q)) return q as Lang;
  const header = req.headers?.['accept-language']?.split(',')[0]?.split('-')[0]?.toLowerCase();
  if (header && SUPPORTED_LANGS.includes(header as Lang)) return header as Lang;
  return 'en';
}

/**
 * Given a base English string and a translations JSON object, return the
 * localized string for the requested language, falling back to English.
 */
export function localize(base: string | null | undefined, translations: any, lang: Lang): string {
  if (lang === 'en' || !translations) return base ?? '';
  return (translations as any)[lang] || base || '';
}

/**
 * Apply localization to a Module object in-place.
 */
export function localizeModule(m: any, lang: Lang) {
  if (!m) return m;
  return {
    ...m,
    title: localize(m.title, m.titleTranslations, lang),
    description: localize(m.description, m.descriptionTranslations, lang),
    whatToExpect: localize(m.whatToExpect, m.whatToExpectTranslations, lang),
    group: m.group ? {
      ...m.group,
      name: localize(m.group.name, m.group.nameTranslations, lang),
      description: localize(m.group.description, m.group.descriptionTranslations, lang),
    } : m.group,
    videos: m.videos?.map((v: any) => ({
      ...v,
      title: localize(v.title, v.titleTranslations, lang),
    })),
    resources: m.resources?.map((r: any) => ({
      ...r,
      title: localize(r.title, r.titleTranslations, lang),
      description: localize(r.description, r.descriptionTranslations, lang),
    })),
  };
}

export function localizeAnnouncement(a: any, lang: Lang) {
  if (!a) return a;
  return {
    ...a,
    title: localize(a.title, a.titleTranslations, lang),
    body: localize(a.body, a.bodyTranslations, lang),
  };
}
