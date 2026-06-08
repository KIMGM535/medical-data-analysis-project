export function buildHealthPayload({ config, aihubRagIndex, checkedAt = new Date().toISOString() }) {
  return {
    ok: true,
    service: 'psychological-counseling-ai',
    checkedAt,
    openaiConfigured: Boolean(config?.openaiApiKey),
    ragIndexConfigured: Boolean(config?.aihubRagIndexPath),
    ragIndexAvailable: Boolean(aihubRagIndex?.available),
    ragPrivacyMode: aihubRagIndex?.privacyMode ?? 'unknown',
  };
}
