import { getDisplaySignaling } from './store';

describe('getDisplaySignaling', () => {
	it('returns the advertised non-empty signaling route', () => {
		expect(getDisplaySignaling({ display: { contract: 1, signaling: '/wcpos/v2/display' } })).toBe(
			'/wcpos/v2/display'
		);
	});

	it.each([undefined, null, '', '   '])('returns null for %p signaling', (signaling) => {
		expect(getDisplaySignaling({ display: { contract: 1, signaling } })).toBeNull();
	});
});
