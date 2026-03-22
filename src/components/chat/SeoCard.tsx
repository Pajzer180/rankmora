'use client';

interface SeoCardProps {
  url: string;
  title: { ok: boolean; text: string };
  h1: { ok: boolean; text: string; jsRendered: boolean };
  h2s: string[];
  imgs: number;
  score: number | null;
  metaDescription?: string;
  canonical?: string;
  robots?: string;
  ogTitle?: string;
  ogDescription?: string;
  linksInternalCount?: number;
  linksExternalCount?: number;
  ctaCount?: number;
  ctaExamples?: string[];
  sectionCount?: number;
  imagesTotal?: number;
  imagesWithoutAlt?: number;
  hasMetaDescription?: boolean;
  hasCanonical?: boolean;
  hasRobots?: boolean;
}

export default function SeoCard({
  url,
  title,
  h1,
  h2s,
  imgs,
  score,
  metaDescription,
  canonical,
  robots,
  ogTitle,
  ogDescription,
  linksInternalCount,
  linksExternalCount,
  ctaCount,
  ctaExamples,
  sectionCount,
  imagesTotal,
  imagesWithoutAlt,
  hasMetaDescription,
  hasCanonical,
  hasRobots,
}: SeoCardProps) {
  const shortUrl = url.length > 40 ? url.slice(0, 40) + '...' : url;
  const shortTitle = title.text.length > 45 ? title.text.slice(0, 45) + '...' : title.text;

  const resolvedImagesWithoutAlt = typeof imagesWithoutAlt === 'number' ? imagesWithoutAlt : imgs;
  const metaOk =
    typeof hasMetaDescription === 'boolean'
      ? hasMetaDescription
      : !!metaDescription && metaDescription !== 'brak';
  const canonicalOk =
    typeof hasCanonical === 'boolean' ? hasCanonical : !!canonical && canonical !== 'brak';
  const robotsOk = typeof hasRobots === 'boolean' ? hasRobots : !!robots && robots !== 'brak';
  const ogTitleOk = !!ogTitle && ogTitle !== 'brak';
  const ogDescriptionOk = !!ogDescription && ogDescription !== 'brak';
  const ctaExamplesText = ctaExamples && ctaExamples.length > 0 ? ctaExamples.join(', ') : 'brak';

  const barColor =
    score === null
      ? 'bg-gray-600'
      : score >= 90
        ? 'bg-purple-500'
        : score >= 70
          ? 'bg-green-500'
          : score >= 40
            ? 'bg-yellow-500'
            : 'bg-red-500';

  return (
    <div className="my-3 rounded-xl border border-gray-700 bg-gray-900 p-4 text-sm">
      <div className="mb-3 flex items-center gap-2 font-mono text-xs text-gray-400">
        <span>URL</span>
        <span className="truncate">{shortUrl}</span>
      </div>

      <div className="space-y-2">
        <div className="flex items-start gap-2">
          <span>{title.ok ? 'OK' : 'NO'}</span>
          <span className="text-gray-300">
            <span className="mr-1 text-gray-500">&lt;title&gt;</span>
            {shortTitle}
          </span>
        </div>

        <div
          className={`flex items-start gap-2 rounded px-2 py-1 ${
            h1.jsRendered ? 'bg-yellow-900/30' : h1.ok ? 'bg-green-900/30' : 'bg-red-900/30'
          }`}
        >
          <span>{h1.jsRendered ? 'WARN' : h1.ok ? 'OK' : 'NO'}</span>
          <span className="text-gray-300">
            <span className="mr-1 text-gray-500">&lt;h1&gt;</span>
            {h1.jsRendered ? 'JS-rendered, nie mozna zweryfikowac' : h1.text}
          </span>
        </div>

        {h2s.length > 0 && (
          <div className="space-y-1">
            {h2s.map((h, i) => (
              <div key={i} className="flex items-center gap-2 overflow-hidden">
                <span className="flex-shrink-0">H2</span>
                <span className="min-w-0 text-gray-400">
                  <span className="mr-1 text-gray-500">&lt;h2&gt;</span>
                  {h.length > 60 ? h.slice(0, 60) + '...' : h}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 text-gray-400">
          <span>IMG</span>
          <span>{resolvedImagesWithoutAlt} obrazow bez atrybutu alt</span>
        </div>

        <div className="rounded-lg border border-gray-800 bg-gray-950/40 p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
            Sygnaly strony
          </div>
          <div className="space-y-1 text-xs text-gray-300">
            <div>Meta: {metaOk ? 'OK' : 'BRAK'}</div>
            <div>Canonical: {canonicalOk ? 'OK' : 'BRAK'}</div>
            <div>Robots: {robotsOk ? 'OK' : 'BRAK'}</div>
            <div>
              OG: title {ogTitleOk ? 'OK' : 'BRAK'} / description{' '}
              {ogDescriptionOk ? 'OK' : 'BRAK'}
            </div>
            <div>
              Linki wewn./zewn.: {linksInternalCount ?? 0} / {linksExternalCount ?? 0}
            </div>
            <div>CTA: {ctaCount ?? 0}</div>
            <div>Przykladowe CTA: {ctaExamplesText}</div>
            <div>Sekcje: {sectionCount ?? 0}</div>
            <div>
              Obrazy total / bez alt: {imagesTotal ?? 0} / {resolvedImagesWithoutAlt}
            </div>
          </div>
        </div>

        <div className="pt-1">
          <div className="mb-1 flex justify-between text-xs text-gray-400">
            <span>SEO Score</span>
            <span className="font-semibold text-gray-200">{score !== null ? `${score}/100` : 'N/A'}</span>
          </div>
          <div className="h-2 w-full rounded-full bg-gray-700">
            <div
              className={`h-2 rounded-full transition-all ${barColor}`}
              style={{ width: score !== null ? `${score}%` : '0%' }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}