import { validateCatName } from '../cat-name.moderation';

describe('validateCatName (Requirement 19)', () => {
  describe('valid names (Req 19.6)', () => {
    it.each([
      'Whiskers',
      'Mochi',
      'Si Comel',
      'Kunyit',
      '小花', // Chinese
      'மீனா', // Tamil
      'Oyen-2', // letters with number/punctuation mixed in
      'Mr. Butters',
    ])('accepts "%s"', (name) => {
      const result = validateCatName(name);
      expect(result).toEqual({ valid: true, name });
    });

    it('trims surrounding whitespace before storing', () => {
      expect(validateCatName('  Mochi  ')).toEqual({ valid: true, name: 'Mochi' });
    });
  });

  describe('length rule (Req 19.4)', () => {
    it('rejects names shorter than 2 characters', () => {
      const result = validateCatName('A');
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.reason).toContain('between 2 and 30');
    });

    it('rejects names longer than 30 characters', () => {
      expect(validateCatName('X'.repeat(31)).valid).toBe(false);
    });

    it('accepts the 2 and 30 character boundaries', () => {
      expect(validateCatName('Bo').valid).toBe(true);
      expect(validateCatName('C'.repeat(30)).valid).toBe(true);
    });

    it('whitespace does not count toward the minimum', () => {
      expect(validateCatName('  A  ').valid).toBe(false);
    });
  });

  describe('character rule (Req 19.5)', () => {
    it.each(['12345', '!!!???', '   --   ', '@#$%', '99 99'])(
      'rejects "%s" (no letters)',
      (name) => {
        const result = validateCatName(name);
        expect(result.valid).toBe(false);
        if (!result.valid) expect(result.reason).toContain('letter');
      },
    );
  });

  describe('blocklist (Req 19.2, 19.3)', () => {
    it.each([
      // plain
      'Fuck', 'ShitCat', 'Pukimak', 'Punda', 'Thevidiya',
      // leetspeak substitutions
      'Fvck'.replace('v', 'u'), 'Sh1t', 'F4ck'.replace('4', 'u'), 'Puk1mak', 'B1tch',
      // separator tricks
      'F.u.c.k', 'p u k i m a k', 'S-h-i-t',
      // multi-language scripts
      '傻逼猫', '草泥马', 'தேவிடியா',
      // embedded in a longer name
      'CaptainFuckles',
    ])('rejects "%s"', (name) => {
      const result = validateCatName(name);
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.reason).toContain('appropriate');
    });

    it('is case-insensitive', () => {
      expect(validateCatName('PUKIMAK').valid).toBe(false);
      expect(validateCatName('FuCk').valid).toBe(false);
    });

    it('does not reject clean names that merely share letters with blocked words', () => {
      // 'Puteh' and 'Comel' are common Malaysian cat names
      expect(validateCatName('Puteh').valid).toBe(true);
      expect(validateCatName('Comel').valid).toBe(true);
    });
  });
});
