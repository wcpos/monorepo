import { resolveOption } from './resolve-option';

const OPTIONS = [
	{ value: 'standard', label: 'Standard' },
	{ value: 'reduced-rate', label: 'Reduced rate' },
];

describe('resolveOption', () => {
	/**
	 * The regression. `@rn-primitives/select` on web emits `{ value: val, label: val }`
	 * (its `select.web.js`), so the label mirrors the raw value. Forwarding that to
	 * callers hands them `label: 'standard'` where they expect `'Standard'` — on web
	 * only, which is what makes it easy to miss.
	 */
	it('replaces the web-shaped option with the canonical entry', () => {
		expect(resolveOption(OPTIONS, { value: 'standard', label: 'standard' })).toEqual({
			value: 'standard',
			label: 'Standard',
		});
	});

	it('passes a native-shaped option through unchanged', () => {
		expect(resolveOption(OPTIONS, { value: 'standard', label: 'Standard' })).toEqual({
			value: 'standard',
			label: 'Standard',
		});
	});

	/**
	 * A value outside `options` must still reach the caller rather than becoming
	 * undefined — dropping it would turn an unknown selection into a silent no-op.
	 */
	it('falls back to the emitted option when nothing matches', () => {
		expect(resolveOption(OPTIONS, { value: 'luxury', label: 'luxury' })).toEqual({
			value: 'luxury',
			label: 'luxury',
		});
	});

	it('returns undefined when the selection is cleared', () => {
		expect(resolveOption(OPTIONS, undefined)).toBeUndefined();
	});
});
