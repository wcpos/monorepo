/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { FormProvider, useForm } from 'react-hook-form';

import { Text } from '@wcpos/components/text';

import { SettingsRow } from './settings-row';
import { SavedFieldProvider, useMarkSaved } from './saved-mark';
jest.mock('react-native-reanimated', () => ({
	__esModule: true,
	default: { View: jest.requireActual<typeof import('react-native')>('react-native').View },
	FadeOut: { duration: jest.fn() },
	useReducedMotion: () => true,
}));
jest.mock('@wcpos/components/lib/motion', () => ({ BEAT: 220 }));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));

// The real Label pulls in @rn-primitives, which this jest environment cannot
// parse, so both label paths are stubbed. FormLabel keeps the contract that
// matters here: it reads react-hook-form's context and throws without a
// provider, exactly like packages/components/src/form/context.ts.
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/label', () => ({
	Label: ({ children }: React.PropsWithChildren) => (
		<label data-testid="plain-label">{children}</label>
	),
}));
jest.mock('@wcpos/components/form', () => {
	const { useFormContext } = jest.requireActual('react-hook-form');
	return {
		FormItem: ({ children, testID }: React.PropsWithChildren<{ testID?: string }>) => (
			<div data-testid={testID}>{children}</div>
		),
		FormLabel: ({ children }: React.PropsWithChildren) => {
			const { getFieldState, formState } = useFormContext();
			getFieldState('', formState);
			return <label data-testid="form-label">{children}</label>;
		},
	};
});

function WithForm({ children }: React.PropsWithChildren) {
	const form = useForm({ defaultValues: { name: '' } });
	return <FormProvider {...form}>{children}</FormProvider>;
}

describe('SettingsRow', () => {
	it('renders on a screen with no form provider', () => {
		render(
			<SettingsRow label="Pairing code" description="Six digits" testID="row">
				<Text>123456</Text>
			</SettingsRow>
		);

		expect(screen.getByTestId('row')).toBeInTheDocument();
		expect(screen.getByTestId('plain-label')).toHaveTextContent('Pairing code');
		expect(screen.getByText('Six digits')).toBeInTheDocument();
		expect(screen.getByText('123456')).toBeInTheDocument();
	});

	it('renders the inline variant with no form provider', () => {
		render(
			<SettingsRow label="Second screen" inline testID="row">
				<Text>Open</Text>
			</SettingsRow>
		);

		expect(screen.getByTestId('plain-label')).toHaveTextContent('Second screen');
		expect(screen.getByText('Open')).toBeInTheDocument();
	});

	it('keeps the form label wiring inside a react-hook-form provider', () => {
		render(
			<WithForm>
				<SettingsRow label="Store name" testID="row">
					<Text>UK Store</Text>
				</SettingsRow>
			</WithForm>
		);

		expect(screen.getByTestId('form-label')).toHaveTextContent('Store name');
		expect(screen.queryByTestId('plain-label')).not.toBeInTheDocument();
		expect(screen.getByText('UK Store')).toBeInTheDocument();
	});
});

it.each([false, true])('puts Saved only beside the named control (inline=%s)', (inline) => {
	function Rows() {
		const markSaved = useMarkSaved();
		return (
			<>
				<button onClick={() => markSaved(['name'])}>Change</button>
				<SettingsRow label="Name" name="name" inline={inline}>
					<Text>Store</Text>
				</SettingsRow>
				<SettingsRow label="Currency" name="currency" inline={inline}>
					<Text>USD</Text>
				</SettingsRow>
			</>
		);
	}
	jest.useFakeTimers();
	render(
		<SavedFieldProvider>
			<Rows />
		</SavedFieldProvider>
	);
	fireEvent.click(screen.getByText('Change'));
	expect(screen.getByTestId('settings-saved-name')).toBeInTheDocument();
	expect(screen.queryByTestId('settings-saved-currency')).not.toBeInTheDocument();
	act(() => jest.advanceTimersByTime(1200));
	expect(screen.queryByTestId('settings-saved-name')).not.toBeInTheDocument();
	jest.useRealTimers();
});
