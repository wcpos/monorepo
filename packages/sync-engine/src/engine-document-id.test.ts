import { remoteId } from './testing';
import { describe, expect, it } from 'vitest';

import { engineDocumentIdFor } from './index';

describe('engineDocumentIdFor', () => {
	it('pins product and variation document ids', () => {
		expect(engineDocumentIdFor('product', remoteId(10))).toBe('woo-product:10');
		expect(engineDocumentIdFor('variation', remoteId(10))).toBe('woo-variation:10');
	});
});
