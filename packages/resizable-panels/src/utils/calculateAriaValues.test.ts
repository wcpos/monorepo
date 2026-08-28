import { calculateAriaValues } from './calculateAriaValues';

describe('calculateAriaValues', () => {
	test('calculates the reachable size range for the panel before a handle', () => {
		expect(
			calculateAriaValues({
				layout: [50, 50],
				panelConstraints: [
					{ minSize: 20, maxSize: 90 },
					{ minSize: 30, maxSize: 80 },
				],
				panelIndex: 0,
			})
		).toEqual({ valueMin: 20, valueMax: 70, valueNow: 50 });
	});

	test('uses collapsedSize as the minimum for a collapsible panel', () => {
		expect(
			calculateAriaValues({
				layout: [40, 60],
				panelConstraints: [
					{ collapsedSize: 5, collapsible: true, minSize: 20, maxSize: 80 },
					{ minSize: 10, maxSize: 95 },
				],
				panelIndex: 0,
			})
		).toEqual({ valueMin: 5, valueMax: 80, valueNow: 40 });
	});
});
