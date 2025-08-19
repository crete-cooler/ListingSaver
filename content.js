// content.js
function scrapeListing() {
  const text = (sel) => document.querySelector(sel)?.textContent?.trim();
  const allText = (sel) => Array.from(document.querySelectorAll(sel)).map(e => e.textContent.trim()).filter(Boolean);

  const getCleanText = (el) => (el?.innerText || el?.textContent || '').replace(/\s+/g, ' ').trim();

  function parseJsonLd() {
    const results = { address: null, beds: null, baths: null, price: null, description: null, amenities: [], zip: null };
    const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
    const entities = [];
    for (const s of scripts) {
      try {
        const json = JSON.parse(s.textContent.trim());
        if (Array.isArray(json)) entities.push(...json);
        else if (json && typeof json === 'object') {
          if (Array.isArray(json['@graph'])) entities.push(...json['@graph']);
          else entities.push(json);
        }
      } catch (_) {}
    }

    const flat = entities.flatMap(e => {
      if (!e || typeof e !== 'object') return [];
      return [e, ...(Array.isArray(e.itemListElement) ? e.itemListElement : [])];
    });

    const findFirst = (predicate) => flat.find(predicate);

    const place = findFirst(e => /^(Apartment|House|Residence|Accommodation|SingleFamilyResidence|Place|Organization)$/i.test(e['@type'] || '')) || findFirst(e => e.address);
    if (place && place.address) {
      const a = place.address;
      const parts = [a.streetAddress, a.addressLocality, a.addressRegion, a.postalCode].filter(Boolean);
      if (parts.length) results.address = parts.join(', ');
      if (a.postalCode) results.zip = String(a.postalCode).trim();
    }
    if (place && (place.description || place.name)) {
      results.description = (place.description || '').trim() || results.description;
      results.address = results.address || (place.name || '').trim();
    }

    const offer = findFirst(e => /Offer/i.test(e['@type'] || '') && (e.price || (e.priceSpecification && e.priceSpecification.price)));
    if (offer) {
      const price = offer.price || offer.priceSpecification?.price;
      const currency = offer.priceCurrency || offer.priceSpecification?.priceCurrency || 'USD';
      if (price) results.price = `$${String(price).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
    }

    const bedFields = ['numberOfBedrooms', 'bedroomCount', 'bedrooms', 'numberOfRooms'];
    const bathFields = ['numberOfBathroomsTotal', 'numberOfBathrooms', 'bathroomCount', 'bathrooms'];
    const candidates = [place, ...flat];
    for (const ent of candidates) {
      if (!ent || typeof ent !== 'object') continue;
      for (const k of bedFields) {
        const v = ent[k];
        const n = typeof v === 'object' ? v?.value || v?.minValue : v;
        if (n != null && !Number.isNaN(parseFloat(n))) {
          results.beds = parseFloat(n);
          break;
        }
      }
      for (const k of bathFields) {
        const v = ent[k];
        const n = typeof v === 'object' ? v?.value || v?.minValue : v;
        if (n != null && !Number.isNaN(parseFloat(n))) {
          results.baths = parseFloat(n);
          break;
        }
      }
      if (Array.isArray(ent.amenityFeature)) {
        for (const af of ent.amenityFeature) {
          const name = af?.name || af?.propertyID || af?.value;
          if (name) results.amenities.push(String(name).trim());
        }
      }
    }
    results.amenities = Array.from(new Set(results.amenities)).filter(Boolean);
    return results;
  }

  function extractZip() {
    const candidates = [];

    const push = (zip, weight) => {
      if (!zip) return;
      const z = String(zip).match(/\b(\d{5})\b/);
      if (!z) return;
      const code = z[1];
      // Favor NYC ranges
      const nyc = /^(10\d{3}|11\d{3})$/.test(code) ? 10 : 0;
      candidates.push({ zip: code, score: weight + nyc });
    };

    // 1) From URL (high for sites like Nooklyn)
    try {
      const url = new URL(location.href);
      const path = `${url.hostname}${url.pathname}`;
      const mUrl = path.match(/(?:-|\/)(1[01]\d{3})(?:-|\/|$)/);
      if (mUrl) push(mUrl[1], /nooklyn\.com/i.test(url.hostname) ? 95 : 75);
    } catch (_) {}

    // 2) From obvious address containers
    const addrSelectors = [
      'address', '[itemprop="address"]', '[data-test*="address" i]', '[data-testid*="address" i]',
      '[class*="address" i]', '.ds-address-container', '.ds-price-change-address-row', '.property-address'
    ];
    document.querySelectorAll(addrSelectors.join(',')).forEach(el => {
      const t = getCleanText(el);
      const mNY = t.match(/(?:NY|New\s*York)[\s,]+(\d{5})/i);
      if (mNY) push(mNY[1], 90);
      else {
        const m = t.match(/\b(\d{5})\b/);
        if (m) push(m[1], 70);
      }
    });

    // 3) From "About the building" or similar sections
    const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6'));
    const about = headings.find(h => /about the building|building info|building details|about this building/i.test(getCleanText(h)));
    if (about) {
      const section = about.closest('section') || about.parentElement || about.nextElementSibling;
      const t = getCleanText(section) || '';
      const mNY = t.match(/(?:NY|New\s*York)[\s,]+(\d{5})/i);
      if (mNY) push(mNY[1], 92);
      const m = t.match(/\b(\d{5})\b/);
      if (m) push(m[1], 75);
    }

    // 4) Top-of-page lines mentioning borough + NY + ZIP
    const boroughRe = /(brooklyn|queens|manhattan|bronx|staten\s*island)/i;
    const bodyLines = (document.body?.innerText || '').split(/\n+/).slice(0, 150);
    for (const line of bodyLines) {
      if (!/\b(\d{5})\b/.test(line)) continue;
      const scoreBase = 65;
      if (boroughRe.test(line) && /(NY|New\s*York)/i.test(line)) {
        const m = line.match(/\b(\d{5})\b/);
        if (m) push(m[1], scoreBase + 10);
      }
    }

    if (!candidates.length) return null;
    // Choose the highest scored candidate; in a tie, take the last (content near top often shows multiple; later tends to be more specific)
    candidates.sort((a, b) => a.score - b.score);
    return candidates.pop()?.zip || null;
  }

  function findDescription() {
    const headingLabels = [
      'description', 'about', 'overview', 'property description', 'home description', 'listing description', 'details', 'more information', 'read more'
    ];

    const isLikelyDescriptionContainer = (node) => {
      if (!node) return false;
      const attr = `${node.id} ${node.className}`.toLowerCase();
      return /desc|description|about|overview|property[-_\s]?description/.test(attr);
    };

    const longEnough = (s) => typeof s === 'string' && s.length >= 120; // avoid tiny snippets

    const collectBlockText = (container) => {
      if (!container) return '';
      const blocks = container.querySelectorAll('p, div, section, article, li');
      const pieces = [];
      for (const block of blocks) {
        const t = getCleanText(block);
        if (t && t.length > 40) pieces.push(t);
        if (pieces.length >= 8) break;
      }
      const combined = pieces.join(' ').replace(/\s+/g, ' ').trim();
      return combined;
    };

    const candidates = [];

    const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"]'));
    for (const h of headings) {
      const ht = getCleanText(h).toLowerCase();
      if (!ht) continue;
      if (headingLabels.some(lbl => new RegExp(`(^|[^a-z])${lbl}([^a-z]|$)`, 'i').test(ht))) {
        let container = h.nextElementSibling || h.parentElement;
        if (container && container !== document.body && !isLikelyDescriptionContainer(container)) {
          container = container.nextElementSibling || container;
        }
        const t = getCleanText(container) || collectBlockText(container);
        if (longEnough(t)) candidates.push(t);
      }
    }

    const descLikeNodes = Array.from(document.querySelectorAll('[data-testid*="desc" i], [data-test*="desc" i], [class*="desc" i], [id*="desc" i], [aria-label*="desc" i], [data-testid*="about" i], [class*="about" i], [id*="about" i], [class*="overview" i], [id*="overview" i]'));
    for (const node of descLikeNodes) {
      const t = getCleanText(node);
      if (longEnough(t)) candidates.push(t);
    }

    const metaDesc = document.querySelector('meta[name="description"], meta[property="og:description"], meta[name="twitter:description"]')?.getAttribute('content')?.trim();
    if (longEnough(metaDesc)) candidates.push(metaDesc);

    const unique = Array.from(new Set(candidates.map(s => s.replace(/\s+/g, ' ').trim())));
    unique.sort((a, b) => b.length - a.length);
    return unique[0] || '';
  }

  // Address
  let address = text('h1[data-test="address"]')
             || text('h1[itemprop="name"]')
             || text('address')
             || (document.title || '').split('|')[0].trim();

  // Beds / Baths (robust extraction across various formats and sites)
  function extractBedsBaths() {
    let foundBeds = null;
    let foundBaths = null;

    const bedRegex = /(\d+(?:\.\d+)?)\s*(?:bed(?:room)?s?|bd)\b/i;
    const bathRegex = /(\d+(?:\.\d+)?)\s*(?:bath(?:room)?s?|ba|bth)\b/i;
    const comboRegex = /(\d+(?:\.\d+)?)\s*(?:bed(?:room)?s?|bd)\b[^\d]{0,15}(\d+(?:\.\d+)?)\s*(?:bath(?:room)?s?|ba|bth)\b/i;

    const selectors = [
      '.ds-bed-bath-living-area',
      '.ds-summary-row',
      '.summary-container',
      '.details',
      '.facts-and-features',
      '.key-facts',
      '.listing-details',
      '.property-details',
      '.property-facts',
      '.unit-info',
      '.stats',
      '[data-testid*="bed" i]',
      '[data-testid*="bath" i]'
    ];

    const texts = new Set();
    for (const sel of selectors) {
      document.querySelectorAll(sel).forEach(el => {
        const t = getCleanText(el);
        if (t) texts.add(t);
      });
    }

    // Also include lines from body that mention bed/bath to catch plain text pages
    const bodyText = (document.body?.innerText || '').split(/\n+/).filter(l => /bed|bath|bd|ba|studio/i.test(l)).slice(0, 50);
    for (const line of bodyText) texts.add(line.trim());

    const tryParse = (s) => {
      // Combo like "3 bd 2 ba"
      const combo = s.match(comboRegex);
      if (combo) {
        const cb = parseFloat(combo[1]);
        const cba = parseFloat(combo[2]);
        if (!Number.isNaN(cb)) foundBeds = foundBeds == null ? cb : Math.max(foundBeds, cb);
        if (!Number.isNaN(cba)) foundBaths = foundBaths == null ? cba : Math.max(foundBaths, cba);
      }
      const b = s.match(bedRegex);
      if (b) {
        const val = parseFloat(b[1]);
        if (!Number.isNaN(val)) foundBeds = foundBeds == null ? val : Math.max(foundBeds, val);
      }
      const ba = s.match(bathRegex);
      if (ba) {
        const val = parseFloat(ba[1]);
        if (!Number.isNaN(val)) foundBaths = foundBaths == null ? val : Math.max(foundBaths, val);
      }
      if (/\bstudio\b/i.test(s) && (foundBeds == null || foundBeds === 0)) {
        // Treat studio as 0 beds (user can adjust)
        foundBeds = 0;
      }
    };

    for (const s of texts) {
      tryParse(s);
      if (foundBeds != null && foundBaths != null) break;
    }

    return {
      beds: Number.isFinite(foundBeds) ? foundBeds : 0,
      baths: Number.isFinite(foundBaths) ? foundBaths : 0
    };
  }

  // beds/baths will be resolved below combining structured data with text parsing

  function extractPrice(structuredPrice) {
    const formatPrice = (n) => `$${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
    const toNumber = (s) => {
      if (!s) return NaN;
      const m = String(s).match(/\$?\s*([\d,]+(?:\.\d{2})?)/);
      if (!m) return NaN;
      return parseFloat(m[1].replace(/,/g, ''));
    };

    // If structured price looks like a monthly rent, trust it
    const structuredNum = toNumber(structuredPrice);
    if (Number.isFinite(structuredNum) && structuredNum >= 700 && structuredNum <= 20000) {
      return formatPrice(structuredNum);
    }

    const selectors = [
      '[data-qa="PriceSection"]',
      '[data-qa="Headline"]',
      '[data-qa="ListingHeader"]',
      '[class*="Price" i]',
      '[class*="price" i]', '[id*="price" i]', '[data-testid*="price" i]', '[data-test*="price" i]',
      '[class*="rent" i]', '[id*="rent" i]', '[data-testid*="rent" i]', '[data-test*="rent" i]',
      '.summary', '.details', '.stats', 'h1', 'h2'
    ];

    const contexts = [];
    for (const sel of selectors) {
      document.querySelectorAll(sel).forEach(el => {
        const t = getCleanText(el);
        if (t && /\$\s?\d/.test(t)) contexts.push(t);
      });
    }

    // For StreetEasy and similar, scan top of the page for rent-like lines
    const bodyLines = (document.body?.innerText || '').split(/\n+/);
    const topLines = bodyLines.slice(0, 150);
    const extraLines = topLines.filter(l => /\$\s?\d/.test(l) && /(rent|per month|\/mo|monthly|month)/i.test(l));
    contexts.push(...extraLines);

    const dollarRegex = /\$\s?([\d,]+(?:\.\d{2})?)/g;
    const scored = [];
    for (const ctx of contexts) {
      const lower = ctx.toLowerCase();
      let m;
      while ((m = dollarRegex.exec(ctx)) !== null) {
        const val = parseFloat(m[1].replace(/,/g, ''));
        if (!Number.isFinite(val)) continue;
        let score = 0;
        if (/(rent|per month|\bmo\b|\/mo|monthly|month)/i.test(lower)) score += 5;
        if (/(price|amount|cost|headline|listingheader|pricesection)/i.test(lower)) score += 2;
        if (val >= 700 && val <= 20000) score += 3; // plausible monthly rent
        if (val < 700) score -= 3; // maintenance, fee, etc.
        scored.push({ val, score });
      }
    }

    if (!scored.length) return null;
    scored.sort((a, b) => b.score - a.score || b.val - a.val);
    const best = scored[0];
    if (!best) return null;
    return formatPrice(best.val);
  }

  // Price (prefer structured/semantic monthly amounts; avoid small fees like $465)
  let price = null;

  // Amenities
  let amenities = allText('.ds-home-fact-list li, .amenity-list li, ul li.amenity, [data-testid="amenities"] li, .features li, .amenities li');

  // Prefer structured data when available (Nooklyn often embeds JSON-LD)
  const structured = parseJsonLd();
  if (structured.address) address = address || structured.address;
  const extracted = extractBedsBaths();
  const beds = structured.beds ?? extracted.beds;
  const baths = structured.baths ?? extracted.baths;
  if (!price) price = extractPrice(structured.price) || null;
  if (!amenities?.length && structured.amenities?.length) amenities = structured.amenities;
  const description = structured.description || findDescription();
  const zip = structured.zip || extractZip();

  return { address, beds, baths, amenities, price, description, zip };
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.cmd === "SCRAPE") {
    reply(scrapeListing());
  }
});
