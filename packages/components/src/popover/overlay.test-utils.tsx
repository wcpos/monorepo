import * as React from 'react';
import type { ViewProps } from 'react-native';

const mockView = ({ children, className, testID, ...rest }: ViewProps) =>
	React.createElement(
		'div',
		{ className, 'data-testid': testID, onClick: (rest as { onPress?: () => void }).onPress },
		children
	);
export const mockOnOpenChange = jest.fn();
jest.mock('react-native', () => ({
	...jest.requireActual('react-native'),
	View: mockView,
	Text: mockView,
	useWindowDimensions: () => ({ width: 1024, height: 768, scale: 1, fontScale: 1 }),
}));
jest.mock('../keyboard-controller', () => ({ KeyboardAvoidingView: () => null }));
jest.mock('react-native-safe-area-context', () => ({
	useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
const mockAnimation = { duration: jest.fn().mockReturnThis(), easing: jest.fn().mockReturnThis() };
jest.mock('react-native-reanimated', () => ({
	__esModule: true,
	default: { View: () => null },
	Easing: { bezier: jest.fn() },
	...Object.fromEntries(
		'FadeIn FadeOut SlideInLeft SlideOutLeft SlideInRight SlideOutRight SlideInDown SlideOutDown'
			.split(' ')
			.map((name) => [name, mockAnimation])
	),
}));
jest.mock('../text', () => ({
	TextClassContext: React.createContext(''),
	Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));
jest.mock('../icon', () => ({ Icon: () => null }));

export function mockPrimitive() {
	const { View: Part } = jest.requireMock('react-native');
	return {
		...Object.fromEntries(
			'Root Portal Overlay Trigger Item Label Separator SubContent SubTrigger CheckboxItem RadioItem'
				.split(' ')
				.map((name) => [name, Part])
		),
		Content: ({ children, ...props }: ViewProps) => (
			<Part {...props}>
				<div data-testid="primitive-content">{children}</div>
			</Part>
		),
		useRootContext: () => ({ open: true, onOpenChange: mockOnOpenChange }),
		useSubContext: () => ({ open: true }),
	};
}
