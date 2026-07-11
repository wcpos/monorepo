// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { adoptStampedRevision } from './adopt-stamped-revision';

describe('adoptStampedRevision', () => {
  it('adopts a valid stamp and strips it from the payload', () => {
    const result = adoptStampedRevision(
      { id: 1, _rxdb_revision: 'sha256:abc', name: 'x' },
      () => 'legacy',
    );
    expect(result.revision).toBe('sha256:abc');
    expect(result.payload).toEqual({ id: 1, name: 'x' });
  });

  it('falls back to the legacy synthesis when no stamp is present', () => {
    const result = adoptStampedRevision({ id: 1 }, () => 'legacy');
    expect(result.revision).toBe('legacy');
    expect(result.payload).toEqual({ id: 1 });
  });

  it.each([
    ['empty string', ''],
    ['wrong type (number)', 7],
    ['wrong type (object)', { hash: 'sha256:abc' }],
    ['null', null],
  ])('strips an invalid stamp (%s) from the payload AND falls back', (_label, bad) => {
    const result = adoptStampedRevision(
      { id: 1, _rxdb_revision: bad },
      () => 'legacy',
    );
    expect(result.revision).toBe('legacy');
    // Transport metadata never reaches the stored payload, valid or not.
    expect(result.payload).toEqual({ id: 1 });
  });
});
