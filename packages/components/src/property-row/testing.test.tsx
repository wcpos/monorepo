import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { SavedFieldProvider, useMarkSaved } from '../form/saved-mark';
import * as real from './index';
import * as fake from './testing';

/**
 * Pins `./testing` to the real row: the same props give the same testIDs, the same form-item ids
 * (ledger line 9), the same verb and add buttons, locked's switch and Open, and the Saved mark
 * beside the key with the verb kept (ledger line 21). The harness is `property-row.test.tsx`'s.
 */

// Keep RNW rendering; Jest does not compile Uniwind classes, so expose them on the DOM.
const mockWindow = { width: 1024, height: 768, scale: 1, fontScale: 1 };
jest.mock('react-native', () => {
	const actual = jest.requireActual('react-native');
	return {
		...actual,
		useWindowDimensions: () => mockWindow,
		Pressable: ({ className, ...props }: import('react-native').PressableProps) =>
			React.createElement(actual.Pressable, { ...props, dataSet: { classes: className } }),
		View: ({ className, ...props }: import('react-native').ViewProps) =>
			React.createElement(actual.View, { ...props, dataSet: { classes: className } }),
		Text: ({ className, ...props }: import('react-native').TextProps) =>
			React.createElement(actual.Text, { ...props, dataSet: { classes: className } }),
	};
});
jest.mock('expo-haptics', () => ({
	impactAsync: jest.fn(),
	ImpactFeedbackStyle: { Light: 'light' },
}));
jest.mock('../icon', () => ({
	Icon: ({ name }: { name: string }) => {
		const { Text } = jest.requireActual('react-native');
		return <Text testID={`icon-${name}`} />;
	},
}));
jest.mock('../loader', () => ({ Loader: () => null }));
jest.mock('react-native-reanimated', () => ({
	__esModule: true,
	default: { View: jest.requireActual<typeof import('react-native')>('react-native').View },
	FadeOut: { duration: () => undefined },
	ZoomIn: { duration: () => ({ easing: () => undefined }) },
	useReducedMotion: () => true,
	Keyframe: jest.fn(() => ({ duration: jest.fn() })),
	Easing: { bezier: () => undefined },
}));
jest.mock('../switch', () => ({
	Switch: ({
		checked,
		disabled,
		testID,
	}: {
		checked: boolean;
		disabled?: boolean;
		testID?: string;
	}) => (
		<input type="checkbox" data-testid={testID} checked={checked} disabled={disabled} readOnly />
	),
}));
// The fake reads the Saved mark and the form item through the form's index, which needs a native
// component here; serve it the same submodules the real row imports.
jest.mock('../form', () => ({
	...jest.requireActual('../form/saved-mark'),
	...jest.requireActual('../form/common'),
}));
jest.mock('@wcpos/utils/open-external-url', () => ({ openExternalURL: jest.fn() }));
// On web `useIsPhone` reads the layout viewport (`window.innerHeight`); keep it on the mocked window.
Object.defineProperty(window, 'innerHeight', {
	configurable: true,
	get: () => mockWindow.height,
});

type Module = typeof fake;
const both: [string, Module][] = [
	['real', real as unknown as Module],
	['fake', fake],
];

function Save({ name }: { name: string }) {
	const markSaved = useMarkSaved();
	return <button onClick={() => markSaved([name])}>{`save ${name}`}</button>;
}

describe.each(both)('%s property row', (_name, m) => {
	it('names the list, the row and its key from the prefix and id', () => {
		render(
			<m.PropertyList prefix="customer">
				<m.PropertyRow id="email" label="Email">
					a@b.c
				</m.PropertyRow>
				<m.PropertyRow prefix="billing" id="city" label="City" testID="city" />
			</m.PropertyList>
		);
		expect(screen.getByTestId('customer-form')).toBeTruthy();
		expect(screen.getByTestId('customer-row-email')).toHaveTextContent('Emaila@b.c');
		expect(screen.getByText('Email')).toHaveAttribute('id', 'customer-email-form-item');
		expect(screen.getByTestId('city')).toBeTruthy();
		expect(screen.getByText('City')).toHaveAttribute('id', 'billing-city-form-item');
	});

	it('presses its verb and its add buttons by testID', () => {
		const onPress = jest.fn();
		render(
			<m.PropertyList prefix="x">
				<m.PropertyRow
					id="note"
					label="Note"
					verb={
						<m.PropertyVerb testID="edit" onPress={onPress}>
							Edit
						</m.PropertyVerb>
					}
				>
					<m.PropertyPlaceholder>Add a note</m.PropertyPlaceholder>
				</m.PropertyRow>
				<m.PropertyAddRow>
					<m.PropertyAdd label="Phone" testID="add-phone" onPress={onPress} />
				</m.PropertyAddRow>
			</m.PropertyList>
		);
		expect(screen.getByTestId('x-row-note')).toHaveTextContent('NoteAdd a noteEdit');
		fireEvent.click(screen.getByTestId('edit'));
		fireEvent.click(screen.getByTestId('add-phone'));
		expect(onPress).toHaveBeenCalledTimes(2);
		expect(screen.getByTestId('add-phone')).toHaveTextContent('Phone');
	});

	it('locks a value: a boolean is a disabled switch, then where it is set and Open', () => {
		render(
			<m.PropertyRow
				testID="taxes"
				label="Enable taxes"
				locked={{ where: 'Set in WooCommerce', href: 'https://example.com' }}
			>
				{true}
			</m.PropertyRow>
		);
		expect(screen.getByTestId('taxes-switch')).toBeDisabled();
		expect(screen.getByTestId('taxes')).toHaveTextContent('Set in WooCommerce');
		expect(screen.getByText('Open')).toBeTruthy();
	});

	it('marks a saved field beside the key and keeps the verb', () => {
		render(
			<SavedFieldProvider>
				<Save name="tax_class" />
				<m.PropertyRow
					prefix="line"
					id="tax"
					name={['tax_status', 'tax_class']}
					label="Tax"
					verb={<m.PropertyVerb testID="verb">Edit</m.PropertyVerb>}
				>
					Standard
				</m.PropertyRow>
			</SavedFieldProvider>
		);
		expect(screen.queryByTestId('saved-tax_class')).toBeNull();
		fireEvent.click(screen.getByText('save tax_class'));
		expect(screen.getByTestId('saved-tax_class')).toBeTruthy();
		expect(screen.getByTestId('line-row-tax')).toHaveTextContent(/^Tax.*Standard.*Edit$/);
		expect(screen.getByTestId('verb')).toBeTruthy();
	});
});
