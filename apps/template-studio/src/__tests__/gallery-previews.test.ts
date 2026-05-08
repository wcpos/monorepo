import { describe, expect, it } from 'vitest';

import {
	buildGalleryFixture,
	pageHtml,
	resolveGalleryPaperWidth,
} from '../../scripts/generate-gallery-previews';

describe('gallery preview generation', () => {
	it('uses Coffee Monster fixture data with the Studio logo URL', () => {
		const fixture = buildGalleryFixture();

		expect(fixture.store).toMatchObject({ name: 'Coffee Monster' });
		expect(fixture.store.logo).toBe('/coffee-monster.png');
		expect(fixture.lines).toHaveLength(3);
		expect(fixture.discounts.length).toBeGreaterThan(0);
		expect(fixture.fees.length).toBeGreaterThan(0);
		expect(fixture.shipping.length).toBeGreaterThan(0);
		expect(fixture.payments.length).toBeGreaterThan(1);
		expect(fixture.fiscal).toHaveProperty('qr_payload');
	});

	it('uses A4 for logicless gallery templates and physical widths for thermal templates', () => {
		expect(resolveGalleryPaperWidth({ engine: 'logicless' })).toBe('a4');
		expect(resolveGalleryPaperWidth({ engine: 'thermal', paperWidth: '58mm' })).toBe('58mm');
		expect(resolveGalleryPaperWidth({ engine: 'thermal' })).toBe('80mm');
	});

	it('renders screenshots inside the same paper frame classes as Template Studio', () => {
		expect(pageHtml('<p>A4 receipt</p>', 'a4')).toContain('class="paper-frame a4"');
		expect(pageHtml('<p>Thermal receipt</p>', '80mm')).toContain('class="paper-frame thermal-80"');
		expect(pageHtml('<p>Thermal receipt</p>', '58mm')).toContain('class="paper-frame thermal-58"');
		expect(pageHtml('<p>Thermal receipt</p>', '80mm')).not.toContain('class="preview"');
	});
});
