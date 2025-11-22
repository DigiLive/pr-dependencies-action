import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('config', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.INPUT_LABEL;
    delete process.env.INPUT_KEY_PHRASES;
  });

  describe('PR_LABEL', () => {
    beforeEach(() => {
      delete process.env.INPUT_LABEL;
      vi.resetModules();
    });

    it('should use default value when no input is provided', async () => {
      const config = await import('@/config.js');

      expect(config.BLOCK_LABEL).toBe('blocked');
    });

    it('should use provided input value', async () => {
      process.env.INPUT_LABEL = 'dependant';
      const config = await import('@/config.js');

      expect(config.BLOCK_LABEL).toBe('dependant');
    });
  });

  describe('getKeyPhrases', () => {
    beforeEach(() => {
      delete process.env.INPUT_PHRASES;
      vi.resetModules();
    });

    it('should return default key phrases when no input provided', async () => {
      const config = await import('@/config.js');

      expect(config.getKeyPhrases()).toBe('depends on|blocked by');
    });

    it('should use provided key phrases from input', async () => {
      process.env.INPUT_PHRASES = 'waits on|requires';
      const config = await import('@/config.js');

      expect(config.getKeyPhrases()).toBe('waits on|requires');
    });
  });

  describe('createMemoizedRegexString', () => {
    beforeEach(() => {
      vi.resetModules();
    });

    it('should escape special regex characters', async () => {
      process.env.INPUT_PHRASES = 'foo(bar).baz';
      const config = await import('@/config.js');

      expect(config.getKeyPhrases()).toContain('foo\\(bar\\)\\.baz');
    });

    it('should return cached value on subsequent calls', async () => {
      const config = await import('@/config.js');

      // Start spying on the replace function just before the first call to getIssueTypes.
      const replaceSpy = vi.spyOn(String.prototype, 'replace');
      try {
        // First call - should trigger replace.
        const firstCall = config.getIssueTypes();
        expect(replaceSpy).toHaveBeenCalledTimes(1);

        // Second call - should use cache.
        const secondCall = config.getIssueTypes();
        expect(replaceSpy).toHaveBeenCalledTimes(1);
        expect(secondCall).toBe(firstCall);

        // Third call - should trigger replace.
        const thirdCall = config.getKeyPhrases();
        expect(replaceSpy).toHaveBeenCalledTimes(2);
        expect(thirdCall).not.toBe(firstCall);

        // Fourth call - should use cache.
        const fourthCall = config.getKeyPhrases();
        expect(replaceSpy).toHaveBeenCalledTimes(2);
        expect(fourthCall).toBe(thirdCall);
      } finally {
        replaceSpy.mockRestore();
      }
    });
  });
});
