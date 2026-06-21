import { chromium } from 'playwright';

const EXTRACT_JS = `
(function() {
  if (!window.APP_INITIALIZATION_STATE || !window.APP_INITIALIZATION_STATE[3]) return null;
  const appState = window.APP_INITIALIZATION_STATE[3];
  for (const key of Object.keys(appState)) {
    const arr = appState[key];
    if (Array.isArray(arr)) {
      for (const idx of [6, 5]) {
        const item = arr[idx];
        if (typeof item === 'string' && item.startsWith(")]}'")) return item;
      }
    }
  }
  return null;
})()
`;

const COOKIE_REJECT_JS = `() => {
  try {
    const f = document.querySelector('form[action*="consent.google"]');
    if (f) { const b = f.querySelector('button, input[type="submit"]'); if (b) { b.click(); return true; } }
    for (const b of document.querySelectorAll('button, input[type="submit"]')) {
      const t = (b.textContent || b.value || '').toLowerCase();
      if (t.includes('reject') || t.includes('decline') || t.includes('ablehnen')) { b.click(); return true; }
    }
  } catch(e) {}
  return false;
}`;

function getVal(arr, ...indexes) {
  let c = arr;
  for (let i = 0; i < indexes.length - 1; i++) {
    const idx = indexes[i];
    if (!Array.isArray(c) || idx >= c.length || c[idx] == null) return null;
    c = c[idx];
  }
  const last = indexes[indexes.length - 1];
  if (!Array.isArray(c) || last >= c.length) return null;
  return c[last];
}
function getStr(a, ...i) { return getVal(a, ...i) ?? ''; }
function getNum(a, ...i) { const v = getVal(a, ...i); return typeof v === 'number' ? v : 0; }

function extractActualURL(u) {
  if (!u || !u.startsWith('/url?q=')) return u;
  try { return new URL(u, 'https://www.google.com').searchParams.get('q') || u; } catch { return u; }
}

function parseEntry(raw) {
  let c = raw.trim();
  if (c.startsWith(")]}'")) c = c.slice(4).trim();
  const jd = JSON.parse(c);
  if (!Array.isArray(jd) || jd.length < 7) return null;
  const d = jd[6];
  if (!Array.isArray(d)) return null;
  const cats = getVal(d, 13);
  const catList = Array.isArray(cats) ? cats.filter(x => typeof x === 'string') : [];
  const addr = getStr(d, 18);
  const title = getStr(d, 11);
  return {
    title, link: getStr(d, 27), cid: getStr(jd, 25, 3, 0, 13, 0, 0, 1),
    categories: catList, category: catList[0] || '',
    address: addr.startsWith(title + ',') ? addr.slice(title.length + 1).trim() : addr.trim(),
    phone: getStr(d, 178, 0, 0), website: extractActualURL(getStr(d, 7, 0)),
    plus_code: getStr(d, 183, 2, 2, 0),
    review_count: Math.floor(getNum(d, 4, 8)), review_rating: getNum(d, 4, 7),
    latitude: getNum(d, 9, 2), longitude: getNum(d, 9, 3),
    status: getStr(d, 34, 4, 4), description: getStr(d, 32, 1, 1),
    reviews_link: getStr(d, 4, 3, 0), thumbnail: getStr(d, 72, 0, 1, 6, 0),
    timezone: getStr(d, 30), price_range: getStr(d, 4, 2),
    data_id: getStr(d, 10), place_id: getStr(d, 78),
  };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

let persistentBrowser = null;
let persistentContext = null;

async function getBrowser() {
  if (persistentBrowser && persistentBrowser.isConnected()) return { browser: persistentBrowser, context: persistentContext };

  try { if (persistentContext) await persistentContext.close().catch(() => {}); } catch {}
  try { if (persistentBrowser) await persistentBrowser.close().catch(() => {}); } catch {}

  persistentBrowser = await chromium.launch({
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
      '--disable-gpu', '--disable-webgl', '--disable-extensions',
      '--disable-default-apps', '--disable-notifications', '--no-zygote',
      '--disable-ipc-flooding-protection',
      '--enable-features=NetworkService,NetworkServiceInProcess',
      '--ignore-certificate-errors', '--disable-web-security',
      '--window-size=1920,1080',
    ],
  });

  persistentContext = await persistentBrowser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'en-US', timezoneId: 'Europe/London',
  });

  await persistentContext.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    delete navigator.__proto__.webdriver;
    window.chrome = { runtime: {}, loadTimes: () => {}, csi: () => {} };
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
  });

  return { browser: persistentBrowser, context: persistentContext };
}

async function extractPlaceData(page) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const raw = await Promise.race([
        page.evaluate(EXTRACT_JS),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 20000)),
      ]);
      if (raw && typeof raw === 'string' && raw.length > 10) return parseEntry(raw);
    } catch {
      if (attempt < 2) {
        await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
        await sleep(3000);
      }
    }
  }
  return null;
}

async function scrapeGmaps(query, options = {}) {
  const { depth = 5, lang = 'en', geo = '', zoom = 0, onProgress } = options;

  let searchURL;
  if (query.startsWith('http')) {
    searchURL = query;
  } else {
    // Don't use @geo,zoom format - Google Maps overrides it in headless mode
    // Instead, let Google infer location from query text
    const encoded = query.replace(/ /g, '+');
    searchURL = `https://www.google.com/maps/search/${encoded}?hl=${lang}`;
  }

  console.log(`[gmaps] Starting: ${searchURL}`);
  const { context } = await getBrowser();
  const page = await context.newPage();

  try {
    onProgress?.({ phase: 'navigating', message: 'Opening Google Maps...' });
    await page.goto(searchURL, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await sleep(4000);
    await page.evaluate(COOKIE_REJECT_JS).catch(() => {});
    await sleep(2000);

    const currentUrl = page.url();
    console.log(`[gmaps] URL: ${currentUrl}`);

    if (currentUrl.includes('/maps/place/')) {
      onProgress?.({ phase: 'extracting', message: 'Found single result...' });
      const entry = await extractPlaceData(page);
      return entry ? [entry] : [];
    }

    onProgress?.({ phase: 'scrolling', message: 'Loading results...' });
    try {
      await page.waitForSelector("div[role='feed']", { timeout: 20000 });
    } catch {
      console.log('[gmaps] Feed not found');
      return [];
    }

    // Wait a bit for initial results to render
    await sleep(3000);

    // Scroll to load more
    let prevHeight = 0;
    let stable = 0;
    for (let i = 0; i < depth; i++) {
      const height = await page.evaluate(() => {
        const el = document.querySelector("div[role='feed']");
        if (!el) return 0;
        el.scrollTop = el.scrollHeight;
        return el.scrollHeight;
      }).catch(() => 0);
      console.log(`[gmaps] Scroll ${i+1}: h=${height}`);
      if (height === prevHeight) { stable++; if (stable >= 2) break; } else stable = 0;
      prevHeight = height;
      onProgress?.({ phase: 'scrolling', message: `Scrolling... (${i + 1}/${depth})` });
      await sleep(1500 + Math.random() * 1000);
    }

    // Collect ALL place links on the entire page
    const placeLinks = await page.evaluate(() => {
      return [...new Set(Array.from(document.querySelectorAll('a[href*="/maps/place/"]')).map(a => a.href))];
    });

    console.log(`[gmaps] Found ${placeLinks.length} place links`);
    if (!placeLinks.length) return [];

    onProgress?.({ phase: 'extracting', message: `Found ${placeLinks.length} places, extracting data...` });

    const results = [];
    for (let i = 0; i < placeLinks.length; i++) {
      onProgress?.({ phase: 'extracting', message: `Extracting ${i + 1}/${placeLinks.length}...`, current: i + 1, total: placeLinks.length });

      const p = await context.newPage();
      try {
        await p.goto(placeLinks[i], { waitUntil: 'domcontentloaded', timeout: 30000 });
        await sleep(3000 + Math.random() * 2000);
        await p.evaluate(COOKIE_REJECT_JS).catch(() => {});
        await sleep(1500);
        const entry = await extractPlaceData(p);
        if (entry) results.push(entry);
      } catch (e) {
        console.log(`[gmaps] Failed to extract place ${i+1}: ${e.message}`);
      } finally {
        await p.close().catch(() => {});
      }
      await sleep(1000 + Math.random() * 1500);
    }

    console.log(`[gmaps] Done: ${results.length} results`);
    return results;
  } finally {
    await page.close().catch(() => {});
  }
}

export { scrapeGmaps, parseEntry };
