import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { Platform } from '@wcpos/utils/platform';

import { ReceiptEdge } from './index';

jest.mock('react-native-svg', () => {
	const elements = jest.requireActual('react-native-svg/lib/commonjs/elements.web');
	return { ...elements, default: elements.Svg, __esModule: true };
});
jest.mock('uniwind', () => ({ useCSSVariable: () => '#f0ede6' }));
jest.mock('@wcpos/utils/platform', () => ({ Platform: { isWeb: true, isElectron: false } }));

it.each([true, false])(
	'bites 12 px semicircles of the page colour out of a 10 px strip (web=%s)',
	(web) => {
		Platform.isWeb = web;
		const { container } = render(<ReceiptEdge testID="edge" />);
		expect(screen.getByTestId('edge').tagName.toLowerCase()).toBe('svg');
		expect(screen.getByTestId('edge').getAttribute('height')).toBe('10');
		expect(screen.getByTestId('edge').style.position).not.toBe('absolute');
		expect(container.querySelector('pattern')?.getAttribute('width')).toBe('12');
		expect(container.querySelector('path')?.getAttribute('d')).toBe('M0 0 h12 a6 6 0 0 1 -12 0 Z');
		expect(container.querySelector('path')?.getAttribute('fill')).toBe(
			web ? 'var(--color-background)' : '#f0ede6'
		);
	}
);
