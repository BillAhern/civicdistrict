import {load} from 'cheerio';
import type {
  FactCheckEntry,
  FactCheckOutletRecord,
  SocialChannel,
} from '../src/types/civic.ts';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

export function sanitizeHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

export function slugifyName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function fetchHtml(url: string, timeoutMs = 5000): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 1. Official Congressional Website Scraper (*.house.gov / *.senate.gov)
//    Discovers live social/community links (X, Instagram, Facebook, YouTube,
//    Bluesky, Threads, TikTok, Reddit, Discord, Mastodon) + contact URLs.
// ---------------------------------------------------------------------------
export interface ScrapedOfficialSiteData {
  socials: SocialChannel[];
  contactUrl: string | null;
  email: string | null;
}

const SOCIAL_MATCHERS: Array<{
  platform: string;
  hostPattern: RegExp;
  extractHandle: (url: URL) => string;
}> = [
  {
    platform: 'X',
    hostPattern: /(^|\.)(x\.com|twitter\.com)$/i,
    extractHandle: (u) => {
      const seg = u.pathname.split('/').filter(Boolean)[0];
      return seg && !['share', 'intent', 'home'].includes(seg.toLowerCase())
        ? `@${seg.replace(/^@/, '')}`
        : 'Official X';
    },
  },
  {
    platform: 'Instagram',
    hostPattern: /(^|\.)instagram\.com$/i,
    extractHandle: (u) => {
      const seg = u.pathname.split('/').filter(Boolean)[0];
      return seg ? `@${seg.replace(/^@/, '')}` : 'Official Instagram';
    },
  },
  {
    platform: 'Facebook',
    hostPattern: /(^|\.)facebook\.com$/i,
    extractHandle: (u) => {
      const seg = u.pathname.split('/').filter(Boolean)[0];
      return seg && seg.toLowerCase() !== 'sharer.php' ? seg : 'Official Facebook';
    },
  },
  {
    platform: 'YouTube',
    hostPattern: /(^|\.)(youtube\.com|youtu\.be)$/i,
    extractHandle: (u) => {
      const segs = u.pathname.split('/').filter(Boolean);
      if (segs[0]?.startsWith('@')) return segs[0];
      return segs[0] === 'channel' ? 'Official Channel' : segs[0] || 'Official YouTube';
    },
  },
  {
    platform: 'Bluesky',
    hostPattern: /(^|\.)bsky\.app$/i,
    extractHandle: (u) => {
      const segs = u.pathname.split('/').filter(Boolean);
      const handle = segs[0] === 'profile' ? segs[1] : segs[0];
      return handle ? `@${handle}` : 'Official Bluesky';
    },
  },
  {
    platform: 'Threads',
    hostPattern: /(^|\.)threads\.net$/i,
    extractHandle: (u) => {
      const seg = u.pathname.split('/').filter(Boolean)[0];
      return seg ? (seg.startsWith('@') ? seg : `@${seg}`) : 'Official Threads';
    },
  },
  {
    platform: 'TikTok',
    hostPattern: /(^|\.)tiktok\.com$/i,
    extractHandle: (u) => {
      const seg = u.pathname.split('/').filter(Boolean)[0];
      return seg ? (seg.startsWith('@') ? seg : `@${seg}`) : 'Official TikTok';
    },
  },
  {
    platform: 'Reddit',
    hostPattern: /(^|\.)reddit\.com$/i,
    extractHandle: (u) => {
      const segs = u.pathname.split('/').filter(Boolean);
      if (segs[0] && segs[1] && ['r', 'u', 'user'].includes(segs[0].toLowerCase())) {
        return `${segs[0]}/${segs[1]}`;
      }
      return 'Official Reddit';
    },
  },
  {
    platform: 'Discord',
    hostPattern: /(^|\.)(discord\.gg|discord\.com)$/i,
    extractHandle: () => 'Official Discord',
  },
];

export async function scrapeOfficialMemberWebsite(
  websiteUrl: string | null
): Promise<ScrapedOfficialSiteData> {
  const empty: ScrapedOfficialSiteData = {
    socials: [],
    contactUrl: null,
    email: null,
  };
  if (!websiteUrl) return empty;

  let parsedBase: URL;
  try {
    parsedBase = new URL(websiteUrl);
    // Security guard: only scrape verified official U.S. Congressional .gov sites
    if (
      parsedBase.protocol !== 'https:' &&
      parsedBase.protocol !== 'http:'
    ) {
      return empty;
    }
    if (!/\.(house|senate)\.gov$/i.test(parsedBase.hostname)) {
      return empty;
    }
  } catch {
    return empty;
  }

  const html = await fetchHtml(parsedBase.toString(), 4500);
  if (!html) return empty;

  const $ = load(html);
  const foundByPlatform = new Map<string, SocialChannel>();
  let contactUrl: string | null = null;
  let email: string | null = null;

  $('a[href]').each((_, el) => {
    const rawHref = ($(el).attr('href') ?? '').trim();
    if (!rawHref) return;

    if (rawHref.toLowerCase().startsWith('mailto:')) {
      const candidate = rawHref.slice(7).split('?')[0].trim();
      if (!email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate)) {
        email = candidate;
      }
      return;
    }

    let resolved: URL;
    try {
      resolved = new URL(rawHref, parsedBase);
    } catch {
      return;
    }
    if (resolved.protocol !== 'https:' && resolved.protocol !== 'http:') return;

    // Look for official contact/email portal on same .gov domain
    if (
      !contactUrl &&
      resolved.hostname === parsedBase.hostname &&
      /\/(contact|email|write|message)/i.test(resolved.pathname)
    ) {
      contactUrl = resolved.toString();
    }

    // Match verified social & community platforms
    for (const matcher of SOCIAL_MATCHERS) {
      if (matcher.hostPattern.test(resolved.hostname)) {
        const lowerPath = resolved.pathname.toLowerCase();
        if (
          lowerPath.includes('/share') ||
          lowerPath.includes('/intent/') ||
          lowerPath.includes('sharer.php') ||
          lowerPath === '/' ||
          lowerPath === ''
        ) {
          break;
        }
        if (!foundByPlatform.has(matcher.platform)) {
          foundByPlatform.set(matcher.platform, {
            platform: matcher.platform,
            handle: matcher.extractHandle(resolved),
            url: resolved.toString(),
          });
        }
        break;
      }
    }
  });

  return {
    socials: [...foundByPlatform.values()],
    contactUrl,
    email,
  };
}

// ---------------------------------------------------------------------------
// 2. PolitiFact Direct HTML Scraper (Cheerio DOM Parsing)
//    Scrapes exact published Truth-O-Meter scorecard counts/percentages and
//    recent fact-checked statements with published verdict labels.
// ---------------------------------------------------------------------------
export async function scrapePolitiFactProfile(
  fullName: string,
  shortName: string
): Promise<FactCheckOutletRecord> {
  const candidateSlugs = [
    ...new Set([slugifyName(shortName), slugifyName(fullName)].filter(Boolean)),
  ];
  const searchUrl = `https://www.politifact.com/search/?q=${encodeURIComponent(
    shortName
  )}`;

  let matchedUrl: string | null = null;
  let html: string | null = null;

  for (const slug of candidateSlugs) {
    const url = `https://www.politifact.com/personalities/${slug}/`;
    const body = await fetchHtml(url, 4500);
    if (body && body.includes('pf-scorecard-item')) {
      matchedUrl = url;
      html = body;
      break;
    }
  }

  if (!matchedUrl || !html) {
    return {
      outlet: 'PolitiFact',
      summary: `PolitiFact does not currently maintain a standalone personality scorecard page for ${fullName}.`,
      profileUrl: searchUrl,
      availabilityNote:
        'Use the link above to search PolitiFact for articles mentioning this lawmaker.',
      recentChecks: [],
    };
  }

  const $ = load(html);

  // Extract published Truth-O-Meter scorecard breakdown
  const tallyParts: string[] = [];
  let totalChecks = 0;

  $('.pf-scorecard-item').each((_, el) => {
    const rawLabel = $(el).find('.pf-scorecard-label').text().trim();
    const pctAttr = $(el)
      .find('[data-pf-scorecard-stat]')
      .attr('data-pf-scorecard-stat');
    const countText = $(el).find('.pf-scorecard-count').text().trim();
    const countNum = Number.parseInt(countText.replace(/\D/g, ''), 10);
    if (!rawLabel || Number.isNaN(countNum)) return;

    totalChecks += countNum;
    if (countNum > 0) {
      const label = rawLabel.replace(/\b\w/g, (c) => c.toUpperCase());
      const pctSuffix = pctAttr ? ` (${pctAttr}%)` : '';
      tallyParts.push(`${countNum} ${label}${pctSuffix}`);
    }
  });

  // Extract recent fact-checked statements with published verdicts
  const recentChecks: FactCheckEntry[] = [];
  const seenUrls = new Set<string>();

  $('a.pf-statement-quote').each((_, el) => {
    if (recentChecks.length >= 3) return;
    const href = sanitizeHttpUrl($(el).attr('href'));
    if (!href || seenUrls.has(href)) return;
    seenUrls.add(href);

    const claim = $(el).text().replace(/\s+/g, ' ').trim();
    if (!claim) return;

    const cardContainer = $(el).parent().parent();
    let verdict =
      cardContainer.find('img[src*="meter-"]').first().attr('alt')?.trim() ?? '';

    if (!verdict) {
      const cls = $(el).attr('class') ?? '';
      const clsMatch = cls.match(/pf-statement-quote-([a-z-]+)/i);
      if (clsMatch) {
        verdict = clsMatch[1]
          .replace(/-/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase());
      }
    }

    const urlParts = href.split('/');
    const yearIdx = urlParts.findIndex((p) => /^\d{4}$/.test(p));
    let dateStr: string | null = null;
    if (yearIdx !== -1) {
      const year = urlParts[yearIdx];
      const month = urlParts[yearIdx + 1];
      dateStr = month
        ? `${month.charAt(0).toUpperCase()}${month.slice(1)} ${year}`
        : year;
    }

    recentChecks.push({
      claim,
      assessment: verdict ? `PolitiFact: ${verdict}` : 'PolitiFact Published Check',
      date: dateStr,
      url: href,
    });
  });

  const summary =
    tallyParts.length > 0
      ? `PolitiFact's Truth-O-Meter archive lists ${totalChecks} fact-check${
          totalChecks === 1 ? '' : 's'
        } for ${shortName}: ${tallyParts.join(', ')}.`
      : `PolitiFact maintains an archived personality profile for ${shortName}.`;

  return {
    outlet: 'PolitiFact',
    summary,
    profileUrl: matchedUrl,
    availabilityNote: null,
    recentChecks,
  };
}

// ---------------------------------------------------------------------------
// 3. FactCheck.org Open WordPress JSON API Scraper
// ---------------------------------------------------------------------------
export async function scrapeFactCheckOrg(
  shortName: string
): Promise<FactCheckOutletRecord> {
  const searchUrl = `https://www.factcheck.org/?s=${encodeURIComponent(shortName)}`;
  try {
    const res = await fetch(
      `https://www.factcheck.org/wp-json/wp/v2/posts?search=${encodeURIComponent(
        shortName
      )}&per_page=3`,
      {
        headers: {'User-Agent': BROWSER_UA, Accept: 'application/json'},
        signal: AbortSignal.timeout(5000),
      }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const posts = (await res.json()) as Array<{
      date?: string;
      link?: string;
      title?: {rendered?: string};
    }>;

    const recentChecks: FactCheckEntry[] = [];
    for (const post of posts) {
      const url = sanitizeHttpUrl(post.link);
      const rawTitle = post.title?.rendered ?? '';
      const title = load(`<span>${rawTitle}</span>`).text().trim();
      if (!url || !title) continue;

      let dateStr: string | null = null;
      if (post.date) {
        const d = new Date(post.date);
        if (!Number.isNaN(d.getTime())) {
          dateStr = d.toLocaleDateString('en-US', {
            month: 'short',
            year: 'numeric',
          });
        }
      }

      recentChecks.push({
        claim: title,
        assessment: 'FactCheck.org Report',
        date: dateStr,
        url,
      });
    }

    return {
      outlet: 'FactCheck.org',
      summary:
        recentChecks.length > 0
          ? `FactCheck.org (Annenberg Public Policy Center) has ${recentChecks.length} recent published report${
              recentChecks.length === 1 ? '' : 's'
            } referencing ${shortName}.`
          : `No recent FactCheck.org articles were returned in the public archive for ${shortName}.`,
      profileUrl: searchUrl,
      availabilityNote:
        recentChecks.length === 0
          ? 'FactCheck.org primarily reviews major national statements rather than every congressional office.'
          : null,
      recentChecks,
    };
  } catch {
    return {
      outlet: 'FactCheck.org',
      summary: `Search FactCheck.org's nonpartisan archive for reports mentioning ${shortName}.`,
      profileUrl: searchUrl,
      availabilityNote: 'Archive temporarily unreachable; use link above.',
      recentChecks: [],
    };
  }
}

// ---------------------------------------------------------------------------
// 4. RSS / XML Feed Scraper Helper (Cheerio XML Mode)
// ---------------------------------------------------------------------------
function scrapeRssFeedItems(
  xml: string,
  limit = 3
): Array<{title: string; link: string; date: string | null}> {
  const $ = load(xml, {xmlMode: true});
  const results: Array<{title: string; link: string; date: string | null}> = [];

  $('item').each((_, el) => {
    if (results.length >= limit) return;
    const title = $(el).find('title').first().text().replace(/\s+/g, ' ').trim();
    const link = sanitizeHttpUrl($(el).find('link').first().text());
    const pubDate = $(el).find('pubDate').first().text().trim();
    if (!title || !link) return;

    let dateStr: string | null = null;
    if (pubDate) {
      const d = new Date(pubDate);
      if (!Number.isNaN(d.getTime())) {
        dateStr = d.toLocaleDateString('en-US', {
          month: 'short',
          year: 'numeric',
        });
      }
    }
    results.push({title, link, date: dateStr});
  });

  return results;
}

// ---------------------------------------------------------------------------
// 5. Snopes Live RSS Feed Scraper
// ---------------------------------------------------------------------------
export async function scrapeSnopes(
  shortName: string
): Promise<FactCheckOutletRecord> {
  const searchUrl = `https://www.snopes.com/?s=${encodeURIComponent(shortName)}`;
  const xml = await fetchHtml(
    `https://www.snopes.com/feed/?s=${encodeURIComponent(shortName)}`,
    4500
  );

  const items = xml ? scrapeRssFeedItems(xml, 3) : [];
  const recentChecks: FactCheckEntry[] = items.map((item) => ({
    claim: item.title,
    assessment: 'Snopes Fact Check',
    date: item.date,
    url: item.link,
  }));

  return {
    outlet: 'Snopes',
    summary:
      recentChecks.length > 0
        ? `Snopes lists ${recentChecks.length} recent fact-check entry${
            recentChecks.length === 1 ? '' : 's'
          } referencing ${shortName}.`
        : `No recent Snopes fact-check entries were returned for ${shortName}.`,
    profileUrl: searchUrl,
    availabilityNote:
      recentChecks.length === 0
        ? 'Snopes focuses primarily on viral claims and social media rumors.'
        : null,
    recentChecks,
  };
}

// ---------------------------------------------------------------------------
// 6. The Washington Post Fact Checker (RSS Index Scraper — direct site is
//    paywalled/WAF-blocked, so indexed Fact Checker columns are scraped via RSS)
// ---------------------------------------------------------------------------
export async function scrapeWashingtonPostFactChecker(
  shortName: string
): Promise<FactCheckOutletRecord> {
  const archiveUrl = `https://www.washingtonpost.com/search/?query=${encodeURIComponent(
    `${shortName} "Fact Checker"`
  )}`;
  const xml = await fetchHtml(
    `https://news.google.com/rss/search?q=${encodeURIComponent(
      `site:washingtonpost.com "Fact Checker" "${shortName}"`
    )}&hl=en-US&gl=US&ceid=US:en`,
    4500
  );

  const items = xml ? scrapeRssFeedItems(xml, 3) : [];
  const recentChecks: FactCheckEntry[] = items.map((item) => ({
    claim: item.title.replace(/\s*-\s*The Washington Post$/i, '').trim(),
    assessment: 'Washington Post Fact Checker',
    date: item.date,
    url: item.link,
  }));

  return {
    outlet: 'The Washington Post Fact Checker',
    summary:
      recentChecks.length > 0
        ? `The Washington Post Fact Checker has published indexed columns referencing ${shortName}.`
        : `No indexed Washington Post Fact Checker columns were found for ${shortName}.`,
    profileUrl: archiveUrl,
    availabilityNote:
      recentChecks.length === 0
        ? 'Direct scraping of washingtonpost.com is restricted by paywall; results reflect publicly indexed Fact Checker columns.'
        : 'Retrieved via public headline index (full text on washingtonpost.com may require a subscription).',
    recentChecks,
  };
}

// ---------------------------------------------------------------------------
// 7. Associated Press Fact Check (Supplementary Nonpartisan Wire Scraper)
// ---------------------------------------------------------------------------
export async function scrapeApFactCheck(
  shortName: string
): Promise<FactCheckOutletRecord | null> {
  const xml = await fetchHtml(
    `https://news.google.com/rss/search?q=${encodeURIComponent(
      `site:apnews.com ("Fact Focus" OR "Fact Check") "${shortName}"`
    )}&hl=en-US&gl=US&ceid=US:en`,
    4000
  );
  const items = xml ? scrapeRssFeedItems(xml, 2) : [];
  if (items.length === 0) return null;

  return {
    outlet: 'Associated Press Fact Check',
    summary: `AP News Fact Check has published verification reporting referencing ${shortName}.`,
    profileUrl: 'https://apnews.com/hub/ap-fact-check',
    availabilityNote: null,
    recentChecks: items.map((item) => ({
      claim: item.title.replace(/\s*-\s*AP News$/i, '').trim(),
      assessment: 'AP Fact Check',
      date: item.date,
      url: item.link,
    })),
  };
}
