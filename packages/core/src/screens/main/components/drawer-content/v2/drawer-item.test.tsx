/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { DrawerItem } from './drawer-item';
let mockOS = 'web';
jest.mock('react-native', () => ({
	...jest.requireActual('react-native'),
	Pressable: ({
		children,
		testID,
		accessibilityLabel,
		onPress,
		className,
	}: React.PropsWithChildren<{
		testID?: string;
		accessibilityLabel?: string;
		onPress?: () => void;
		className?: string;
	}>) => (
		<button
			data-testid={testID}
			aria-label={accessibilityLabel}
			onClick={onPress}
			className={className}
		>
			{children}
		</button>
	),
}));
jest.mock('@wcpos/utils/platform', () => ({
	Platform: {
		get OS() {
			return mockOS;
		},
	},
}));
jest.mock('@wcpos/components/text', () => ({ Text: jest.requireActual('react-native').Text }));
jest.mock('@wcpos/components/tooltip', () => ({
	Tooltip: ({ children }: React.PropsWithChildren) => <div data-testid="tooltip">{children}</div>,
	TooltipTrigger: ({ children }: React.PropsWithChildren) => <>{children}</>,
	TooltipContent: () => null,
}));
it.each(['web', 'ios'])('renders an icon-only active tile with web-only tooltip (%s)', (os) => {
	mockOS = os;
	const onPress = jest.fn();
	const props = { label: 'Products', testID: 'route', onPress, icon: () => <span>icon</span> };
	const { rerender } = render(<DrawerItem {...props} focused />);
	expect(screen.getByTestId('route').className).toContain('bg-card');
	expect(screen.getByTestId('route').getAttribute('aria-label')).toBe('Products');
	expect(screen.queryByText('Products')).toBeNull();
	expect(!!screen.queryByTestId('tooltip')).toBe(os === 'web');
	fireEvent.click(screen.getByTestId('route'));
	expect(onPress).toHaveBeenCalledTimes(1);
	rerender(<DrawerItem {...props} focused={false} />);
	expect(screen.getByTestId('route').className.split(' ')).not.toContain('bg-card');
});
