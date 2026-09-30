/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { FormProvider, useForm } from 'react-hook-form';

import { Text } from '@wcpos/components/text';

import { SAVED_HOLD_MS, SavedFieldProvider, useMarkSaved } from './saved-mark';
import { SettingsRow } from './settings-row';

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

let mockReduced = false;
// The fade is reanimated's exit animation; the mock exposes which one the mark asked for.
jest.mock('react-native-reanimated', () => ({
	__esModule: true,
	default: {
		View: ({ children, exiting }: React.PropsWithChildren<{ exiting?: string }>) => (
			<div data-testid="saved-mark-motion" data-exiting={exiting ?? 'none'}>
				{children}
			</div>
		),
	},
	FadeOut: { duration: (ms: number) => `fade-out:${ms}` },
	useReducedMotion: () => mockReduced,
}));
jest.mock('@wcpos/components/lib/motion', () => ({ BEAT: 220 }));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children, testID }: React.PropsWithChildren<{ testID?: string }>) => (
		<div data-testid={testID}>{children}</div>
	),
}));
jest.mock('../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));

function MarkButton({ names }: { names: string[] }) {
	const markSaved = useMarkSaved();
	return <button data-testid="mark" onClick={() => markSaved(names)} />;
}

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

describe('SettingsRow Saved mark', () => {
	const renderRows = () =>
		render(
			<SavedFieldProvider>
				<WithForm>
					<SettingsRow name="name" label="Store name">
						<Text>UK Store</Text>
					</SettingsRow>
					<SettingsRow name="locale" label="Language">
						<Text>English</Text>
					</SettingsRow>
				</WithForm>
				<MarkButton names={['name']} />
			</SavedFieldProvider>
		);

	beforeEach(() => {
		jest.useFakeTimers();
		mockReduced = false;
	});
	afterEach(() => jest.useRealTimers());

	it('shows Saved beside the written field only, then leaves after the hold', () => {
		renderRows();
		expect(screen.queryByTestId('settings-saved-name')).not.toBeInTheDocument();

		fireEvent.click(screen.getByTestId('mark'));
		expect(screen.getByTestId('settings-saved-name')).toHaveTextContent('settings.saved');
		expect(screen.queryByTestId('settings-saved-locale')).not.toBeInTheDocument();

		act(() => jest.advanceTimersByTime(SAVED_HOLD_MS - 1));
		expect(screen.getByTestId('settings-saved-name')).toBeInTheDocument();
		act(() => jest.advanceTimersByTime(1));
		expect(screen.queryByTestId('settings-saved-name')).not.toBeInTheDocument();
	});

	it('fades out by opacity on the motion beat', () => {
		renderRows();
		fireEvent.click(screen.getByTestId('mark'));
		expect(screen.getByTestId('saved-mark-motion')).toHaveAttribute('data-exiting', 'fade-out:220');
	});

	it('appears and disappears with no fade under reduce-motion', () => {
		mockReduced = true;
		renderRows();
		fireEvent.click(screen.getByTestId('mark'));
		expect(screen.getByTestId('saved-mark-motion')).toHaveAttribute('data-exiting', 'none');
	});

	it('renders no mark on a page without a provider', () => {
		render(
			<WithForm>
				<SettingsRow name="name" label="Store name">
					<Text>UK Store</Text>
				</SettingsRow>
				<MarkButton names={['name']} />
			</WithForm>
		);
		fireEvent.click(screen.getByTestId('mark'));
		expect(screen.queryByTestId('settings-saved-name')).not.toBeInTheDocument();
	});
});
