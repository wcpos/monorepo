import * as React from 'react';

import { render } from '@testing-library/react';

import { Icon, type IconName, IconSetProvider } from './index';
import { ICON_NAMES } from './names';
import { ICON_SET_IDS, ICON_SETS } from './sets';

jest.mock('@wcpos/utils/platform', () => ({ Platform: { isWeb: false, isElectron: false } }));
const { Platform: mockPlatform } = jest.requireMock('@wcpos/utils/platform');
jest.mock('uniwind', () => ({ useCSSVariable: () => '#123456' }));
jest.mock('../text', () => ({ TextClassContext: React.createContext('') }));
jest.mock('../loader', () => ({ Loader: () => null }));
jest.mock('react-native-svg', () => {
	const elements = jest.requireActual('react-native-svg/lib/commonjs/elements.web');
	return { ...elements, default: elements.Svg, __esModule: true };
});

it('resolves the same name through the provider-selected filled set', () => {
	const { container, rerender } = render(<Icon name="check" fill="#abcdef" />);
	const defaultPath = container.querySelector('path')?.getAttribute('d');
	rerender(
		<IconSetProvider set="phosphor">
			<Icon name="check" fill="#abcdef" />
		</IconSetProvider>
	);
	expect(container.querySelector('path')).toHaveAttribute('fill', 'currentColor');
	expect(container.querySelector('svg')).toHaveAttribute('color', '#abcdef');
	expect(container.querySelector('path')?.getAttribute('d')).not.toBe(defaultPath);
});

it('colours Tabler strokes without filling their outlines', () => {
	const { container } = render(<Icon name="check" variant="primary" fill="#abcdef" />);
	const svg = container.querySelector('svg');
	expect(container.querySelector('[stroke]')).toHaveAttribute('stroke', 'currentColor');
	expect(svg).toHaveAttribute('color', '#abcdef');
	expect(container.querySelector('path')).toHaveAttribute('fill', 'none');
	expect(svg).toHaveAttribute('viewBox', '0 0 24 24');
	expect(svg).toHaveAttribute('width', '100%');
	expect(svg).toHaveAttribute('height', '100%');
	expect(container.querySelector('[stroke-width]')).toHaveAttribute('stroke-width', '1.5');
});

it('passes the resolved native theme colour to the stroke currentColor', () => {
	const { container } = render(<Icon name="check" variant="primary" />);
	expect(container.querySelector('svg')).toHaveAttribute('color', '#123456');
	expect(container.querySelector('[stroke]')).toHaveAttribute('stroke', 'currentColor');
});

it.each(ICON_SET_IDS)('%s provides every vocabulary glyph', (set) => {
	expect(Object.keys(ICON_SETS[set]).sort()).toEqual([...ICON_NAMES].sort());
	for (const name of ICON_NAMES) {
		expect(typeof ICON_SETS[set][name]).toBe('function');
	}
});

it.each(ICON_SET_IDS)('falls back to the active %s alert for an unknown dynamic name', (set) => {
	const { container, rerender } = render(
		<IconSetProvider set={set}>
			<Icon name={'unknown-dynamic-icon' as IconName} />
		</IconSetProvider>
	);
	const fallback = container.querySelector('svg')?.innerHTML;
	expect(container.querySelector('path')).not.toBeNull();
	rerender(
		<IconSetProvider set={set}>
			<Icon name="alert" />
		</IconSetProvider>
	);
	expect(container.querySelector('svg')?.innerHTML).toBe(fallback);
});

it('keeps CSS currentColor inheritance on web', () => {
	mockPlatform.isWeb = true;
	try {
		const { container } = render(<Icon name="check" />);
		expect(container.querySelector('svg')).toHaveAttribute('color', 'currentColor');
		expect(container.querySelector('[stroke]')).toHaveAttribute('stroke', 'currentColor');
	} finally {
		mockPlatform.isWeb = false;
	}
});
