import {
	AUTO_COMPACT_UNDER,
	AUTO_SPACIOUS_FROM,
	MAX_FONT_SCALE,
	POINTER_FLOORS,
	resolveStep,
	SCALE_STEPS,
	scaleVariables,
} from './scale';

describe('resolveStep', () => {
	// The Auto breakpoints, read at their edges: a 639-wide phone is Compact and
	// a 640-wide one is not; a 1599-wide laptop is Regular and a 1600-wide
	// monitor is Spacious.
	it.each([
		[639, 'compact'],
		[AUTO_COMPACT_UNDER, 'regular'],
		[AUTO_SPACIOUS_FROM - 1, 'regular'],
		[AUTO_SPACIOUS_FROM, 'spacious'],
	])('Auto at %p resolves to %p', (extent, step) => {
		expect(resolveStep('auto', extent)).toBe(step);
	});

	it.each(['compact', 'regular', 'spacious'] as const)(
		'the %p override wins over the width',
		(override) => {
			expect(resolveStep(override, 390)).toBe(override);
			expect(resolveStep(override, 2560)).toBe(override);
		}
	);

	// A store with no scale field, and a value from outside the four, both read
	// as Auto rather than throwing or rendering an undefined step.
	it.each([undefined, null, '', 'tiny', 'AUTO'])('%p falls back to the window', (override) => {
		expect(resolveStep(override, 390)).toBe('compact');
		expect(resolveStep(override, 1024)).toBe('regular');
	});
});

describe('scaleVariables', () => {
	it('renders the Regular column the sheet declares', () => {
		expect(scaleVariables('regular', 'fine')).toEqual({
			'--spacing': 4,
			'--text-base': 14,
			'--spacing-ctl': 44,
			'--spacing-row': 44,
			'--spacing-tile': 64,
			'--radius': 8,
			'--text-amt': 40,
		});
	});

	// The floor is the whole point of the pointer: Compact on a finger keeps 44
	// for anything pressable, and densifies nothing it should not.
	it('floors the control and the row on a coarse pointer', () => {
		expect(scaleVariables('compact', 'coarse')).toEqual({
			'--spacing': 3.5,
			'--text-base': 13,
			'--spacing-ctl': 44,
			'--spacing-row': 44,
			'--spacing-tile': 56,
			'--radius': 6,
			'--text-amt': 34,
		});
	});

	it('leaves Compact at its real density on a fine pointer', () => {
		expect(scaleVariables('compact', 'fine')).toMatchObject({
			'--spacing-ctl': 40,
			'--spacing-row': 36,
		});
	});

	it.each(['compact', 'regular', 'spacious'] as const)('never floors the tile at %p', (step) => {
		expect(scaleVariables(step, 'coarse')['--spacing-tile']).toBe(SCALE_STEPS[step][4]);
		expect(scaleVariables(step, 'fine')['--spacing-tile']).toBe(SCALE_STEPS[step][4]);
	});

	it('keeps every step above the pointer floor for both pointers', () => {
		(['compact', 'regular', 'spacious'] as const).forEach((step) => {
			(['coarse', 'fine'] as const).forEach((pointer) => {
				const variables = scaleVariables(step, pointer);
				expect(variables['--spacing-ctl']).toBeGreaterThanOrEqual(POINTER_FLOORS[pointer]);
				expect(variables['--spacing-row']).toBeGreaterThanOrEqual(POINTER_FLOORS[pointer]);
			});
		});
	});
});

describe('the constants the sheet and the cap depend on', () => {
	it('caps the OS text multiplier at 1.3', () => {
		expect(MAX_FONT_SCALE).toBe(1.3);
	});

	it('declares exactly seven values per step', () => {
		Object.values(SCALE_STEPS).forEach((values) => expect(values).toHaveLength(7));
	});
});
