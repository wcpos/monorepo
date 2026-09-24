import '../popover/overlay.test-utils';
import * as React from 'react';
import type { PressableProps } from 'react-native';

export const mockPhone = { current: false };
export const mockPlatform = { OS: 'web' };
export const mockRoot = {
	open: true,
	onOpenChange: jest.fn(),
	value: { value: 'b', label: 'B' },
	onValueChange: jest.fn(),
};
const Part = React.forwardRef<HTMLDivElement, PressableProps & { 'data-testid'?: string }>(
	({ children, className, testID, onPress, disabled, role, ...props }, ref) => (
		<div
			ref={ref}
			className={className}
			data-testid={props['data-testid'] ?? testID}
			role={role}
			aria-checked={props['aria-checked']}
			aria-selected={props['aria-selected']}
			onClick={
				disabled ? undefined : (onPress as unknown as React.MouseEventHandler<HTMLDivElement>)
			}
		>
			{children as React.ReactNode}
		</div>
	)
);
Part.displayName = 'SheetTestPart';
// Retain the overlay harness, adding row semantics and native wrapper passthroughs.
Object.assign(jest.requireMock('react-native'), {
	Platform: mockPlatform,
	View: Part,
	Text: Part,
	Pressable: Part,
	ScrollView: Part,
	findNodeHandle: () => 1,
	AccessibilityInfo: { setAccessibilityFocus: jest.fn() },
	BackHandler: { addEventListener: () => ({ remove: jest.fn() }) },
});
jest.requireMock('react-native-reanimated').default.View = Part;
jest.requireMock('../keyboard-controller').KeyboardAvoidingView = Part;
jest.requireMock('../text').Text = Part;
function IconMock({ name, className }: { name: string; className?: string }) {
	return <span data-icon={name} className={className} />;
}
IconMock.displayName = 'SheetTestIcon';
jest.requireMock('../icon').Icon = IconMock;
jest.mock('../lib/device', () => ({ useIsPhone: () => mockPhone.current }));
jest.mock('../checkbox', () => ({ Checkbox: Part }));
jest.mock('../button', () => ({ Button: Part }));
jest.mock('@rn-primitives/slot', () => ({ Slot: Part }));
jest.mock('@rn-primitives/popover', () => ({}));
jest.mock('../select/trigger', () => ({ Trigger: Part, Value: Part }));
export function mockPrimitive(select = false) {
	return {
		...Object.fromEntries(
			'Root Portal Overlay Trigger Group RadioGroup Sub Viewport ItemIndicator ItemText ScrollUpButton ScrollDownButton'
				.split(' ')
				.map((name) => [name, Part])
		),
		...Object.fromEntries(
			'Content Item Label Separator SubContent SubTrigger CheckboxItem RadioItem'
				.split(' ')
				.map((name) => [
					name,
					({ children, ...props }: React.ComponentProps<typeof Part>) => (
						<Part {...props} testID={select ? undefined : props.testID}>
							<span
								data-primitive={name}
								data-testid={name === 'Content' ? 'primitive-content' : undefined}
							>
								{children as React.ReactNode}
							</span>
						</Part>
					),
				])
		),
		useRootContext: () => mockRoot,
		useSubContext: () => ({ open: true }),
	};
}
