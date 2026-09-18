import * as React from 'react';

import { render } from '@testing-library/react';

import map from '../../scripts/icons/tabler-map.json';
import * as FontAwesome from './components/fontawesome/solid';
import * as Tabler from './components/tabler';
import { Icon } from './index';

jest.mock('@wcpos/utils/platform', () => ({ Platform: { isWeb: false, isElectron: false } }));
const { Platform: mockPlatform } = jest.requireMock('@wcpos/utils/platform');
jest.mock('uniwind', () => ({ useCSSVariable: () => '#123456' }));
jest.mock('../text', () => ({ TextClassContext: React.createContext('') }));
jest.mock('../loader', () => ({ Loader: () => null }));
jest.mock('react-native-svg', () => {
	const elements = jest.requireActual('react-native-svg/lib/commonjs/elements.web');
	return { ...elements, default: elements.Svg, __esModule: true };
});

it('colours Tabler strokes without filling their outlines', () => {
	const { container } = render(<Icon name="check" variant="primary" fill="#abcdef" />);
	const svg = container.querySelector('svg');
	expect(svg).toHaveAttribute('stroke', 'currentColor');
	expect(svg).toHaveAttribute('color', '#abcdef');
	expect(svg).toHaveAttribute('fill', 'none');
	expect(svg).toHaveAttribute('viewBox', '0 0 24 24');
	expect(svg).toHaveAttribute('width', '100%');
	expect(svg).toHaveAttribute('height', '100%');
	expect(svg).toHaveAttribute('stroke-width', '1.5');
});

it('passes the resolved native theme colour to the stroke currentColor', () => {
	const { container } = render(<Icon name="check" variant="primary" />);
	expect(container.querySelector('svg')).toHaveAttribute('color', '#123456');
	expect(container.querySelector('svg')).toHaveAttribute('stroke', 'currentColor');
});

it.each(['manhole', 'wcpos', 'lock'] as const)('keeps the unmapped %s glyph', (name) => {
	const { container } = render(<Icon name={name} fill="#abcdef" />);
	expect(container.querySelector('svg')).toHaveAttribute('fill', '#abcdef');
	expect(container.querySelector('path')).toHaveAttribute('d');
	if (name !== 'lock') {
		const original = render(
			React.createElement(name === 'manhole' ? FontAwesome.manhole : FontAwesome.wcpos)
		);
		expect(container.querySelector('path')?.getAttribute('d')).toBe(
			original.container.querySelector('path')?.getAttribute('d')
		);
	}
});

it('generates every mapped name and preserves the existing name set', () => {
	const mapped = Object.keys(map).map((name) =>
		name.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase())
	);
	expect(Object.keys(Tabler).sort()).toEqual(mapped.sort());
	expect(Object.keys({ ...FontAwesome, ...Tabler }).sort()).toEqual(
		Object.keys(FontAwesome).sort()
	);
});

it('keeps CSS currentColor inheritance on web', () => {
	mockPlatform.isWeb = true;
	try {
		const { container } = render(<Icon name="check" />);
		expect(container.querySelector('svg')).toHaveAttribute('color', 'currentColor');
		expect(container.querySelector('svg')).toHaveAttribute('stroke', 'currentColor');
	} finally {
		mockPlatform.isWeb = false;
	}
});
