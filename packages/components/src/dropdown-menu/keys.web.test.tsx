import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';

import * as C from './index';

// The real web primitive (Radix underneath), anchored: a key on a focused item must press it once.
jest.mock('@rn-primitives/dropdown-menu', () =>
	jest.requireActual(
		require.resolve('@rn-primitives/dropdown-menu').replace(/index\.js$/, 'dropdown-menu.web.js')
	)
);
jest.mock('../lib/device', () => ({ useIsPhone: () => false, usePointer: () => 'fine' }));
jest.mock('react-native-safe-area-context', () => ({
	useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../keyboard-controller', () => ({ KeyboardAvoidingView: () => null }));
jest.mock('react-native-reanimated', () => {
	const anim = { duration: () => anim, easing: () => anim };
	return {
		__esModule: true,
		default: { View: () => null },
		Keyframe: jest.fn(() => ({ duration: jest.fn() })),
		Easing: { bezier: () => null },
		...Object.fromEntries(
			'FadeIn FadeOut SlideInLeft SlideOutLeft SlideInRight SlideOutRight SlideInDown SlideOutDown'
				.split(' ')
				.map((n) => [n, anim])
		),
	};
});
jest.mock('../icon', () => ({ Icon: () => null }));

function Open() {
	const { onOpenChange } = C.useRootContext();
	React.useEffect(() => onOpenChange(true), [onOpenChange]);
	return null;
}

// A real key is a keydown and a keyup; three handlers can answer it: the primitive's keydown,
// Radix's click and react-native-web's keyup press.
it.each([
	[' ', true],
	[' ', false],
	['Enter', true],
	['Enter', false],
])('presses an anchored menu item once on %p (closeOnPress %p)', async (key, closeOnPress) => {
	const onPress = jest.fn();
	render(
		<C.DropdownMenu>
			<C.DropdownMenuTrigger testID="trigger" />
			<Open />
			<C.DropdownMenuContent>
				<C.DropdownMenuItem onPress={onPress} closeOnPress={closeOnPress}>
					Print
				</C.DropdownMenuItem>
			</C.DropdownMenuContent>
		</C.DropdownMenu>
	);
	const item = await screen.findByRole('menuitem');
	act(() => item.focus());
	fireEvent.keyDown(item, { key });
	fireEvent.keyUp(document.activeElement ?? item, { key });
	expect(onPress).toHaveBeenCalledTimes(1);
});

it.each([' ', 'Enter'])('toggles an anchored checkbox item once on %p', async (key) => {
	const onCheckedChange = jest.fn();
	render(
		<C.DropdownMenu>
			<C.DropdownMenuTrigger testID="trigger" />
			<Open />
			<C.DropdownMenuContent>
				<C.DropdownMenuCheckboxItem
					checked={false}
					onCheckedChange={onCheckedChange}
					closeOnPress={false}
				>
					Notes
				</C.DropdownMenuCheckboxItem>
			</C.DropdownMenuContent>
		</C.DropdownMenu>
	);
	const item = await screen.findByRole('menuitemcheckbox');
	act(() => item.focus());
	fireEvent.keyDown(item, { key });
	fireEvent.keyUp(document.activeElement ?? item, { key });
	expect(onCheckedChange).toHaveBeenCalledTimes(1);
});

it('leaves a disabled anchored checkbox item alone on a click', async () => {
	const onCheckedChange = jest.fn();
	render(
		<C.DropdownMenu>
			<C.DropdownMenuTrigger testID="trigger" />
			<Open />
			<C.DropdownMenuContent>
				<C.DropdownMenuCheckboxItem checked={false} onCheckedChange={onCheckedChange} disabled>
					Notes
				</C.DropdownMenuCheckboxItem>
			</C.DropdownMenuContent>
		</C.DropdownMenu>
	);
	const item = await screen.findByRole('menuitemcheckbox');
	fireEvent.click(item);
	expect(onCheckedChange).not.toHaveBeenCalled();
});
