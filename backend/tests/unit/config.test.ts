import { describe, expect, it } from 'vitest';
import { configSchema } from '../../src/config/config';

describe('Configuration parsing', () => {
  describe('Boolean parsing for DEV_AUTH', () => {
    it('parses truthy values correctly', () => {
      expect(configSchema.parse({ DEV_AUTH: 'true' }).DEV_AUTH).toBe(true);
      expect(configSchema.parse({ DEV_AUTH: 'TRUE' }).DEV_AUTH).toBe(true);
      expect(configSchema.parse({ DEV_AUTH: '1' }).DEV_AUTH).toBe(true);
    });

    it('parses falsy values correctly', () => {
      expect(configSchema.parse({ DEV_AUTH: 'false' }).DEV_AUTH).toBe(false);
      expect(configSchema.parse({ DEV_AUTH: 'FALSE' }).DEV_AUTH).toBe(false);
      expect(configSchema.parse({ DEV_AUTH: '0' }).DEV_AUTH).toBe(false);
    });

    it('fails on invalid boolean strings', () => {
      expect(() => configSchema.parse({ DEV_AUTH: 'yes' })).toThrow();
      expect(() => configSchema.parse({ DEV_AUTH: 'no' })).toThrow();
      expect(() => configSchema.parse({ DEV_AUTH: 'random' })).toThrow();
    });
  });

  describe('Production safety', () => {
    it('fails closed when DEV_AUTH=true in production', () => {
      expect(() =>
        configSchema.parse({ NODE_ENV: 'production', DEV_AUTH: 'true' })
      ).toThrow(/DEV_AUTH=true is strictly forbidden in production/i);
    });

    it('allows DEV_AUTH=false in production with Firebase credentials', () => {
      const result = configSchema.parse({
        NODE_ENV: 'production',
        DEV_AUTH: 'false',
        FIREBASE_PROJECT_ID: 'test-proj',
        FIREBASE_CLIENT_EMAIL: 'test@example.com',
        FIREBASE_PRIVATE_KEY: 'test-key',
      });
      expect(result.NODE_ENV).toBe('production');
      expect(result.DEV_AUTH).toBe(false);
    });

    it('fails when Firebase credentials missing in production', () => {
      expect(() =>
        configSchema.parse({ NODE_ENV: 'production', DEV_AUTH: 'false' })
      ).toThrow(/FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY are required in production/i);
    });
  });
});
