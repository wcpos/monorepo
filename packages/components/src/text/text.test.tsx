import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { Text } from './index';

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
	Text: (props: any) => React.createElement('span', props),
	StyleSheet: { create: (styles: any) => styles },
}));

// Mock class-variance-authority
jest.mock('class-variance-authority', () => ({
	cva: (base: string) => () => base,
}));

// Mock tailwind-merge
jest.mock('tailwind-merge', () => ({
	twMerge: (...args: string[]) => args.filter(Boolean).join(' '),
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

	it('renders with className', () => {
		render(<Text className="custom-class">Styled text</Text>);
		expect(screen.getByText('Styled text')).toBeInTheDocument();
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
