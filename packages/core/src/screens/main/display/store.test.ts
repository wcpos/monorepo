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

describe('getDisplaySignaling contract gate', () => {
	it.each([0, 2, undefined])('returns null for contract %p', (contract) => {
		expect(
			getDisplaySignaling({ display: { contract, signaling: '/wcpos/v2/display' } })
		).toBeNull();
	});
});
