import * as React from 'react';

import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { ScopedVariables } from 'uniwind';

import { stories } from '../../../packages/components/src/text/gallery';
import { GalleryCells } from '../components/gallery/cells';

// Uniwind's native runtime is not available in jest-expo; keep the scope boundary.
jest.mock('uniwind', () => ({
	ScopedVariables: ({ children }: React.PropsWithChildren) => children,
}));
// Text's default story never takes the asChild/Slot branch (the package ships JSX).
jest.mock('@rn-primitives/slot', () => ({ Slot: 'Slot' }));
jest.resetModules();

it('renders every text story in six scoped cells with floored scale values', () => {
	let renderer: ReactTestRenderer;
	act(() => {
		renderer = create(<GalleryCells component="text" stories={stories} />);
	});
	const scopes = renderer!.root.findAllByType(ScopedVariables);
	expect(scopes).toHaveLength(24);
	const cases = [
		['compact-coarse', 3.5, 13, 44, 44, 56, 6, 34],
		['compact-fine', 3.5, 13, 40, 36, 56, 6, 34],
		['regular-coarse', 4, 14, 44, 44, 64, 8, 40],
		['regular-fine', 4, 14, 44, 44, 64, 8, 40],
		['spacious-coarse', 5, 16, 52, 52, 80, 10, 48],
		['spacious-fine', 5, 16, 52, 52, 80, 10, 48],
	];
	['default', 'link', 'muted', 'small'].forEach((story, storyIndex) => {
		cases.forEach(([suffix, spacing, base, ctl, row, tile, radius, amt], cellIndex) => {
			const index = storyIndex * 6 + cellIndex;
			expect(scopes[index].props.variables).toEqual({
				'--spacing': spacing,
				'--text-base': base,
				'--spacing-ctl': ctl,
				'--spacing-row': row,
				'--spacing-tile': tile,
				'--radius': radius,
				'--text-amt': amt,
			});
			expect(scopes[index].props.children.props.testID).toBe(`text--${story}--${suffix}`);
			expect(scopes[index].props.children.props.dataSet).toEqual({
				cellId: `text--${story}--${suffix}`,
			});
		});
	});
	act(() => {
		renderer!.unmount();
	});
});
