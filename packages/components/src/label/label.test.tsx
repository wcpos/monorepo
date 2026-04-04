import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { Label } from './index';

jest.mock('@rn-primitives/slot', () => ({
	Slot: ({ children, ...props }: any) => {
		if (React.isValidElement(children)) {
			return React.cloneElement(children, props);
		}
		return React.createElement('div', props, children);
	},
}));

jest.mock('react-native', () => ({
	Pressable: ({ children, onPress, ...props }: any) =>
		React.createElement('button', { ...props, onClick: onPress }, children),
	View: (props: any) => React.createElement('div', props),
	Text: (props: any) => React.createElement('span', props),
	StyleSheet: { create: (styles: any) => styles },
}));

jest.mock('@rn-primitives/label', () => ({
	Text: (props: any) => React.createElement('span', props),
}));

jest.mock('@rn-primitives/types', () => ({}));

jest.mock('tailwind-merge', () => ({
	twMerge: (...args: string[]) => args.filter(Boolean).join(' '),
}));

jest.mock('clsx', () => ({
	clsx: (...args: any[]) =>
		args
			.flat()
			.filter((x: any) => typeof x === 'string')
			.join(' '),
}));

describe('Label component', () => {
	it('renders with text content', () => {
		render(<Label>Username</Label>);
		expect(screen.getByText('Username')).toBeInTheDocument();
	});

	it('handles onPress', () => {
		const onPress = jest.fn();
		render(<Label onPress={onPress}>Click me</Label>);
		fireEvent.click(screen.getByRole('button'));
		expect(onPress).toHaveBeenCalled();
	});
});
