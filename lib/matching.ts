/**
 * matching.ts
 *
 * Robust title and artist matching heuristics inspired by SpotiFLAC-Mobile's Go backend.
 * Provides normalization, version cleaning, and multi-strategy matching for music metadata.
 */

const VERSION_PATTERNS = [
  "remaster", "remastered", "deluxe", "bonus", "single",
  "album version", "radio edit", "original mix", "extended",
  "club mix", "remix", "live", "acoustic", "demo",
];

const DASH_PATTERNS = [
  " - remaster", " - remastered", " - single version", " - radio edit",
  " - live", " - acoustic", " - demo", " - remix",
];

/**
 * Normalizes a string for loose comparison by removing non-alphanumeric characters
 * and collapsing multiple spaces.
 */
export function normalizeLoose(text: string): string {
  if (!text) return "";
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Removes common version indicators from a title (e.g., "(Remastered)", "[Deluxe]").
 */
export function cleanTitle(title: string): string {
  let cleaned = title.toLowerCase();

  // Handle (Parentheses)
  while (true) {
    const start = cleaned.lastIndexOf("(");
    const end = cleaned.lastIndexOf(")");
    if (start >= 0 && end > start) {
      const content = cleaned.substring(start + 1, end);
      if (VERSION_PATTERNS.some(p => content.includes(p))) {
        cleaned = (cleaned.substring(0, start).trim() + " " + cleaned.substring(end + 1)).trim();
        continue;
      }
    }
    break;
  }

  // Handle [Brackets]
  while (true) {
    const start = cleaned.lastIndexOf("[");
    const end = cleaned.lastIndexOf("]");
    if (start >= 0 && end > start) {
      const content = cleaned.substring(start + 1, end);
      if (VERSION_PATTERNS.some(p => content.includes(p))) {
        cleaned = (cleaned.substring(0, start).trim() + " " + cleaned.substring(end + 1)).trim();
        continue;
      }
    }
    break;
  }

  // Handle suffixes
  for (const pattern of DASH_PATTERNS) {
    if (cleaned.endsWith(pattern)) {
      cleaned = cleaned.substring(0, cleaned.length - pattern.length).trim();
    }
  }

  return cleaned.replace(/\s+/g, " ").trim();
}

/**
 * Extracts the "core" title by stripping everything after common separators.
 */
export function extractCoreTitle(title: string): string {
  const lower = title.toLowerCase();
  const parenIdx = lower.indexOf("(");
  const bracketIdx = lower.indexOf("[");
  const dashIdx = lower.indexOf(" - ");

  let cutIdx = lower.length;
  if (parenIdx > 0 && parenIdx < cutIdx) cutIdx = parenIdx;
  if (bracketIdx > 0 && bracketIdx < cutIdx) cutIdx = bracketIdx;
  if (dashIdx > 0 && dashIdx < cutIdx) cutIdx = dashIdx;

  return title.substring(0, cutIdx).trim();
}

/**
 * Normalizes an artist name for loose comparison.
 */
export function normalizeArtist(name: string): string {
  if (!name) return "";
  // Simple normalization: lower case, remove accents if possible (simplified here)
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove accents
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Splits a multi-artist string into individual artist names.
 */
export function splitArtists(artists: string): string[] {
  const normalized = artists
    .replace(/\sfeat\.\s/gi, "|")
    .replace(/\sfeat\s/gi, "|")
    .replace(/\sft\.\s/gi, "|")
    .replace(/\sft\s/gi, "|")
    .replace(/\s&\s/gi, "|")
    .replace(/\sand\s/gi, "|")
    .replace(/,\s/g, "|")
    .replace(/\sx\s/gi, "|");

  return normalized
    .split("|")
    .map(p => p.trim())
    .filter(p => p.length > 0);
}

/**
 * Checks if two artist names match using loose comparison and multi-artist splitting.
 */
export function artistsMatch(expected: string, found: string): boolean {
  const normExpected = normalizeArtist(expected);
  const normFound = normalizeArtist(found);

  if (normExpected === normFound) return true;
  if (normExpected.includes(normFound) || normFound.includes(normExpected)) return true;

  const expectedList = splitArtists(normExpected);
  const foundList = splitArtists(normFound);

  for (const exp of expectedList) {
    for (const fnd of foundList) {
      if (exp === fnd) return true;
      if (exp.includes(fnd) || fnd.includes(exp)) return true;
    }
  }

  return false;
}

/**
 * Checks if two titles match using multiple strategies.
 */
export function titlesMatch(expected: string, found: string): boolean {
  const normExpected = expected.toLowerCase().trim();
  const normFound = found.toLowerCase().trim();

  if (normExpected === normFound) return true;
  if (normExpected.includes(normFound) || normFound.includes(normExpected)) return true;

  const cleanExpected = cleanTitle(normExpected);
  const cleanFound = cleanTitle(normFound);
  if (cleanExpected && cleanFound && cleanExpected === cleanFound) return true;

  const coreExpected = extractCoreTitle(normExpected);
  const coreFound = extractCoreTitle(normFound);
  if (coreExpected && coreFound && coreExpected === coreFound) return true;

  const looseExpected = normalizeLoose(normExpected);
  const looseFound = normalizeLoose(normFound);
  if (looseExpected && looseFound && (looseExpected === looseFound || looseExpected.includes(looseFound) || looseFound.includes(looseExpected))) {
    return true;
  }

  return false;
}

/**
 * High-level verification that a resolved track matches the requested track.
 */
export function trackMatches(
  request: { isrc?: string; title: string; artist: string; duration?: number },
  resolved: { isrc?: string; title: string; artist: string; duration?: number },
  options: { durationTolerance?: number } = {}
): boolean {
  // 1. ISRC Match (Highest Priority)
  if (request.isrc && resolved.isrc && request.isrc.trim().toLowerCase() === resolved.isrc.trim().toLowerCase()) {
    return true;
  }

  // 2. Artist Match
  if (!artistsMatch(request.artist, resolved.artist)) {
    return false;
  }

  // 3. Title Match
  if (!titlesMatch(request.title, resolved.title)) {
    return false;
  }

  // 4. Duration Match (Optional)
  if (request.duration && resolved.duration) {
    const diff = Math.abs(request.duration - resolved.duration);
    const tolerance = options.durationTolerance || 10;
    if (diff > tolerance) {
      return false;
    }
  }

  return true;
}
