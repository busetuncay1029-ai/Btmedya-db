/* BTMEDYA editorial publication guardrails.
 * Browser checks are advisory; publication and social distribution use this module.
 */

export const MIN_PUBLICATION_SEO = 70;
const RIGHTS = new Set(['btmedya', 'licensed', 'cc0', 'public_domain', 'cc_by', 'cc_by_sa', 'ai_original']);

function text(value) { return String(value ?? '').trim(); }
export function normalizeMediaRights(value) {
  const v = text(value).toLowerCase().replace(/[-\s]+/g, '_');
  return RIGHTS.has(v) ? v : '';
}
export function mediaRightsFromNote(note) {
  const match = text(note).match(/MEDYA_HAKKI:([a-z0-9_]+)/i);
  return normalizeMediaRights(match?.[1] || '');
}
export function mediaRightsLabel(rights) {
  return ({
    btmedya: 'BTMEDYA arşiv/özgün medya', licensed: 'lisanslı kullanım izni',
    cc0: 'CC0', public_domain: 'kamu malı', cc_by: 'CC BY atıflı açık lisans',
    cc_by_sa: 'CC BY-SA atıflı açık lisans', ai_original: 'BTMEDYA özgün yapay zekâ görseli'
  })[normalizeMediaRights(rights)] || '';
}
function wordCount(body) { return text(body).split(/\s+/).filter(Boolean).length; }
function paragraphCount(body) { return text(body).split(/\n\s*\n/).map(x => x.trim()).filter(Boolean).length; }

export function editorialSeoScore(input = {}) {
  const title = text(input.title), excerpt = text(input.excerpt), body = text(input.body);
  const slug = text(input.slug), source = text(input.source_url || input.sourceUrl);
  const cover = text(input.cover_url || input.coverUrl);
  const words = wordCount(body), paragraphs = paragraphCount(body);
  const checks = [
    [title.length >= 10 && title.length <= 65, 20, 'Başlık 10–65 karakter olmalı'],
    [excerpt.length >= 50 && excerpt.length <= 170, 15, 'Meta açıklama 50–170 karakter olmalı'],
    [slug.length >= 5 && slug.length <= 100, 10, 'SEO slug eksik veya geçersiz'],
    [/^https?:\/\//i.test(source), 15, 'Kaynak URL eksik veya geçersiz'],
    [Boolean(cover), 15, 'Kapak görseli eksik'],
    [words >= 250, 15, `Haber gövdesi kısa (${words}/250 kelime)`],
    [paragraphs >= 4, 10, `Paragraf yapısı kısa (${paragraphs}/4)`]
  ];
  const score = checks.reduce((sum, [ok, points]) => sum + (ok ? points : 0), 0);
  return { score, passed: score >= MIN_PUBLICATION_SEO, words, paragraphs, missing: checks.filter(([ok]) => !ok).map(([, , reason]) => reason) };
}

export function publicationGuard(input = {}) {
  const seo = editorialSeoScore(input);
  const rights = normalizeMediaRights(input.media_rights || input.mediaRights || mediaRightsFromNote(input.archive_note));
  const cover = text(input.cover_url || input.coverUrl);
  const rightsOk = Boolean(cover && rights);
  const reasons = [...seo.missing];
  if (!cover) reasons.push('Kapak görseli olmadan yayınlanamaz');
  else if (!rights) reasons.push('Görsel kullanım hakkı/lisansı belirtilmeli');
  return { ok: seo.passed && rightsOk, seo, media: { rights, rightsOk, label: mediaRightsLabel(rights) }, reasons };
}

export function appendMediaRightsNote(note, rights) {
  const cleanNote = text(note).replace(/\s*MEDYA_HAKKI:[a-z0-9_]+/ig, '').trim();
  const normalized = normalizeMediaRights(rights);
  return [cleanNote, normalized ? `MEDYA_HAKKI:${normalized}` : ''].filter(Boolean).join(' · ').slice(0, 2000);
}
