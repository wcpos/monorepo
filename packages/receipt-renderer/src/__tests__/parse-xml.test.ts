import { describe, expect, it } from 'vitest';

import { parseXml } from '../parse-xml';

describe('parseXml drawer nodes', () => {
	it('parses a pin5 drawer connector attribute', () => {
		expect(parseXml('<receipt><drawer connector="pin5" /></receipt>').children).toEqual([
			{ type: 'drawer', connector: 'pin5' },
		]);
	});
});
