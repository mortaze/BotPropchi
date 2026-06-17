/**
 * Grapheme-safe string operations.
 * Uses Intl.Segmenter (available in Node.js 16+) for grapheme cluster segmentation.
 * NEVER splits surrogate pairs, ZWJ sequences, skin tones, flags, or emoji.
 */

let segmenter: Intl.Segmenter | null = null;

function getSegmenter(): Intl.Segmenter {
  if (!segmenter) {
    segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  }
  return segmenter;
}

export function graphemeCount(text: string): number {
  if (!text) return 0;
  return [...getSegmenter().segment(text)].length;
}

export function graphemeSlice(text: string, start: number, end?: number): string {
  if (!text) return text;
  const segments = [...getSegmenter().segment(text)];
  const result: string[] = [];
  for (let i = start; i < (end ?? segments.length); i++) {
    if (i >= segments.length) break;
    result.push(segments[i].segment);
  }
  return result.join('');
}

export function graphemeTruncate(text: string, maxGraphemes: number): string {
  if (!text) return text;
  const segments = [...getSegmenter().segment(text)];
  if (segments.length <= maxGraphemes) return text;
  return segments.slice(0, maxGraphemes).map(s => s.segment).join('');
}

export function graphemeSafeLength(text: string, maxGraphemes: number): boolean {
  if (!text) return true;
  return graphemeCount(text) <= maxGraphemes;
}

export function safeSubstring(text: string, start: number, end?: number): string {
  return graphemeSlice(text, start, end);
}
