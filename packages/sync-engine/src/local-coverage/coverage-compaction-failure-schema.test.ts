// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { coverageCompactionFailureSchema } from './coverage-compaction-failure-schema';

describe('coverageCompactionFailureSchema', () => {
	it('does not index nullable failure timestamps', () => {
		expect(coverageCompactionFailureSchema).not.toHaveProperty('indexes');
	});
});
