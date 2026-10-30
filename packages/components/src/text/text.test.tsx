import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { Text } from './index';
import { MAX_FONT_SCALE } from '../lib/scale';
import { ThemeTraitsContext } from '../lib/theme-traits';

jest.mock('@wcpos/utils/platform', () => ({ Platform: { isWeb: false } }));

// Mock rn-primitives slot to provide a generic Slot
jest.mock('@rn-primitives/slot', () => ({
	Slot: ({ children, ...props }: any) => {
		if (React.isValidElement(children)) {
			return React.cloneElement(children, props);
		}
		return children;
	},
}));

// Mock react-native with createElement instead of JSX
jest.mock('react-native', () => ({
	Text: ({ style, ...props }: import('react-native').TextProps) =>
		React.createElement('span', {
			...props,
			style: jest.requireActual('react-native').StyleSheet.flatten(style),
		}),
	StyleSheet: { create: (styles: any) => styles },
}));

// Mock class-variance-authority
jest.mock('class-variance-authority', () => ({
	cva: (base: string) => () => base,
}));

// Mock tailwind-merge
jest.mock('tailwind-merge', () => ({
	twMerge: (...args: string[]) => args.filter(Boolean).join(' '),
	extendTailwindMerge:
		() =>
		(...args: string[]) =>
			args.filter(Boolean).join(' '),
}));

// Mock clsx
jest.mock('clsx', () => ({
	clsx: (...args: any[]) =>
		args
			.flat()
			.filter((x: any) => typeof x === 'string')
			.join(' '),
}));

describe('Text component', () => {
	it('renders children text', () => {
		render(<Text>Hello World</Text>);
		expect(screen.getByText('Hello World')).toBeInTheDocument();
	});

	it('decodes HTML entities when decodeHtml is true', () => {
		render(<Text decodeHtml>{'Tom &amp; Jerry'}</Text>);
		expect(screen.getByText('Tom & Jerry')).toBeInTheDocument();
	});

	it('does not decode HTML when decodeHtml is false', () => {
		render(<Text>{'Raw &amp; text'}</Text>);
		expect(screen.getByText('Raw &amp; text')).toBeInTheDocument();
	});

	it('renders with asChild using Slot', () => {
		render(
			<Text asChild>
				<span data-testid="child">Slotted content</span>
			</Text>
		);
		expect(screen.getByTestId('child')).toBeInTheDocument();
		expect(screen.getByText('Slotted content')).toBeInTheDocument();
	});
});

describe('Text theme type', () => {
	it('leaves the font family unset without a provider', () => {
		render(<Text>System</Text>);
		expect(screen.getByText('System').style.fontFamily).toBe('');
	});

	it('uses the body and number families and lets a caller override them', () => {
		render(
			<ThemeTraitsContext.Provider value={{ type: { body: 'Manrope', num: 'JetBrains Mono' } }}>
				<Text>Body</Text>
				<Text tabular>123</Text>
				<Text style={{ fontFamily: 'X' }}>Override</Text>
			</ThemeTraitsContext.Provider>
		);
		expect(screen.getByText('Body')).toHaveStyle({ fontFamily: 'Manrope' });
		expect(screen.getByText('123')).toHaveStyle({ fontFamily: 'JetBrains Mono' });
		expect(screen.getByText('Override')).toHaveStyle({ fontFamily: 'X' });
	});
});

/**
 * The OS text-size cap. `react-native` is mocked to a `span` here, so the prop
 * arrives as a DOM attribute — which is exactly what makes it observable.
 */
describe('Text OS text-size cap', () => {
	it('caps the multiplier at 1.3 by default', () => {
		render(<Text>Capped</Text>);

		expect(screen.getByText('Capped')).toHaveAttribute(
			'maxfontsizemultiplier',
			String(MAX_FONT_SCALE)
		);
	});

	it("lets a caller's prop win", () => {
		render(<Text maxFontSizeMultiplier={2}>Raised</Text>);

		expect(screen.getByText('Raised')).toHaveAttribute('maxfontsizemultiplier', '2');
	});
});
