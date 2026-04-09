import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { ButtonPill } from './index';

jest.mock('react-native', () => ({
	Platform: { OS: 'web' },
	Pressable: ({ children, onPress, accessibilityLabel, ...props }: any) =>
		React.createElement(
			'button',
			{
				...props,
				'aria-label': accessibilityLabel,
				onClick: onPress,
			},
			typeof children === 'function' ? children({ pressed: false }) : children
		),
	View: (props: any) => React.createElement('div', props),
	StyleSheet: { create: (styles: any) => styles },
}));

jest.mock('expo-haptics', () => ({
	impactAsync: jest.fn(),
	ImpactFeedbackStyle: { Light: 'light' },
}));

jest.mock('class-variance-authority', () => ({
	cva:
		(base: string) =>
		({ className }: { className?: string } = {}) =>
			[base, className].filter(Boolean).join(' '),
}));

jest.mock('../hstack', () => ({
	HStack: ({ children, ...props }: any) => React.createElement('div', props, children),
}));

jest.mock('../icon', () => ({
	Icon: ({ name }: { name: string }) => React.createElement('span', null, name),
}));

jest.mock('../loader', () => ({
	Loader: () => React.createElement('span', null, 'loading'),
}));

jest.mock('../lib/utils', () => ({
	cn: (...args: any[]) => args.filter(Boolean).join(' '),
}));

jest.mock('../text', () => {
	const TextClassContext = React.createContext('');

	return {
		TextClassContext,
		Text: ({ children, numberOfLines: _numberOfLines, ...props }: any) =>
			React.createElement('span', props, children),
	};
});

describe('ButtonPill', () => {
	it('does not bubble remove clicks to a surrounding trigger', () => {
		const onParentClick = jest.fn();
		const onRemove = jest.fn();

		render(
			<div onClick={onParentClick}>
				<ButtonPill removable onRemove={onRemove}>
					Cashier
				</ButtonPill>
			</div>
		);

		fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

		expect(onRemove).toHaveBeenCalledTimes(1);
		expect(onParentClick).not.toHaveBeenCalled();
	});
});
