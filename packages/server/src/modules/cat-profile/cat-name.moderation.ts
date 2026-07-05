/**
 * Requirement 19 — Cat name content moderation.
 *
 * Validates a submitted cat name against:
 *  - length 2–30 characters after trimming (19.4)
 *  - must contain at least one letter — names of only special characters,
 *    numbers, or whitespace are rejected (19.5)
 *  - a profanity blocklist covering Malay, English, Chinese, and Tamil,
 *    with common leetspeak substitutions and separator tricks (19.3)
 *
 * Invalid names are never stored (19.6) — callers must reject the request
 * with the returned reason.
 */

export type CatNameValidation =
  | { valid: true; name: string }
  | { valid: false; reason: string };

/**
 * Blocklist of prohibited words (Req 19.3). Matched as substrings of the
 * normalized name (lowercased, leetspeak-decoded, separators stripped), so
 * "F.u.c.k" and "fuk3r" variants are caught. Chinese entries are matched
 * against the raw name since they need no normalization.
 */
const BLOCKLIST: readonly string[] = [
  // English
  'fuck', 'fuk', 'shit', 'bitch', 'cunt', 'asshole', 'dickhead', 'bastard',
  'whore', 'slut', 'nigger', 'nigga', 'faggot', 'retard',
  // Malay
  'pukimak', 'puki', 'kimak', 'lancau', 'lanciau', 'pantat', 'bangsat',
  'sundal', 'babisial', 'celaka', 'pepek', 'kote',
  // Tamil (romanized)
  'punda', 'pundai', 'otha', 'oombu', 'thevidiya', 'thevdiya', 'baadu',
  // Tamil (script)
  'புண்ட', 'ஓத்த', 'தேவிடியா',
  // Chinese (script)
  '傻逼', '沙比', '操你', '肏你', '妈的', '他妈的', '草泥马', '婊子', '妓女', '屌你',
];

/**
 * Common leetspeak / lookalike substitutions decoded before blocklist
 * matching (Req 19.3 "leetspeak substitutions").
 */
const LEET_MAP: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '6': 'g',
  '7': 't',
  '8': 'b',
  '9': 'g',
  '@': 'a',
  $: 's',
  '!': 'i',
  '+': 't',
  '€': 'e',
};

/** Lowercase, decode leetspeak, and strip everything that isn't a letter. */
function normalizeForMatching(name: string): string {
  const lowered = name.toLowerCase();
  let decoded = '';
  for (const char of lowered) {
    decoded += LEET_MAP[char] ?? char;
  }
  // Strip separators/punctuation so "p.u.k.i" collapses to "puki".
  return decoded.replace(/[^\p{L}]/gu, '');
}

/**
 * Validate a cat name (Req 19.1–19.5). Returns the trimmed name on success
 * or a user-facing rejection reason (Req 19.2) on failure.
 */
export function validateCatName(rawName: string): CatNameValidation {
  const name = rawName.trim();

  // Req 19.4: length 2–30
  if (name.length < 2 || name.length > 30) {
    return { valid: false, reason: 'Cat name must be between 2 and 30 characters' };
  }

  // Req 19.5: reject names of only special characters, numbers, or whitespace
  if (!/\p{L}/u.test(name)) {
    return {
      valid: false,
      reason: 'Cat name must contain at least one letter',
    };
  }

  // Req 19.3: blocklist with leetspeak variants and multi-language coverage
  const normalized = normalizeForMatching(name);
  const rawLowered = name.toLowerCase();
  for (const blocked of BLOCKLIST) {
    if (normalized.includes(blocked) || rawLowered.includes(blocked)) {
      return {
        valid: false,
        reason: 'This name contains inappropriate language — please choose a more appropriate name',
      };
    }
  }

  return { valid: true, name };
}
