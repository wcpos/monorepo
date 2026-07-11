import { describe, expect, it } from 'vitest';

type Glob = (pattern: string, options: { query: string; import: string; eager: true }) => Record<string, string>;
declare global { interface ImportMeta { glob: Glob } }

describe('RxDB bulk write result guard', () => {
  it('forbids raw unchecked bulk writes in sync-core and sync-engine-rxdb', () => {
    const modules = {
      ...import.meta.glob('../../sync-core/src/**/*.ts', { query: '?raw', import: 'default', eager: true }),
      ...import.meta.glob('../../sync-engine-rxdb/src/**/*.ts', { query: '?raw', import: 'default', eager: true }),
    };
    const offenders: string[] = [];
    for (const [path, source] of Object.entries(modules)) {
      if (path.endsWith('.test.ts') || path.endsWith('/assertBulkSuccess.ts')) continue;
      source.split('\n').forEach((line, index) => {
        if (/\.bulk(?:Insert|Upsert|Remove|Write)\s*\(/.test(line) && !line.includes('assertBulkSuccess(')) {
          offenders.push(`${path}:${index + 1}`);
        }
      });
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});
