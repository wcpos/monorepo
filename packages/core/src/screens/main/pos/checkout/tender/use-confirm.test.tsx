/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { useConfirm } from './use-confirm';

jest.mock('../../../../../contexts/translations', () => ({
	useT: () => jest.requireActual('../../../../../../jest/translate').createTestT(),
}));
const mockOpenChange = React.createContext<(open: boolean) => void>(() => {});
jest.mock('@wcpos/components/alert-dialog', () => {
	const div = ({ children, testID }: React.PropsWithChildren<{ testID?: string }>) => (
		<div data-testid={testID}>{children}</div>
	);
	return {
		AlertDialog: ({
			children,
			open,
			onOpenChange,
		}: React.PropsWithChildren<{ open: boolean; onOpenChange: (open: boolean) => void }>) =>
			open ? (
				<mockOpenChange.Provider value={onOpenChange}>
					{/* The platform's own close (Escape, Android back). */}
					<button data-testid="dismiss" onClick={() => onOpenChange(false)} />
					{children}
				</mockOpenChange.Provider>
			) : null,
		AlertDialogContent: div,
		AlertDialogHeader: div,
		AlertDialogTitle: ({ children }: React.PropsWithChildren) => (
			<div data-testid="title">{children}</div>
		),
		AlertDialogDescription: ({ children }: React.PropsWithChildren) => (
			<div data-testid="body">{children}</div>
		),
		AlertDialogFooter: div,
		AlertDialogCancel: ({ children, testID }: React.PropsWithChildren<{ testID: string }>) => {
			const onOpenChange = React.useContext(mockOpenChange);
			return (
				<button data-testid={testID} onClick={() => onOpenChange(false)}>
					{children}
				</button>
			);
		},
		AlertDialogAction: ({
			children,
			testID,
			onPress,
			variant,
		}: React.PropsWithChildren<{ testID: string; onPress: () => void; variant: string }>) => (
			<button data-testid={testID} data-variant={variant} onClick={onPress}>
				{children}
			</button>
		),
	};
});

// The two callers' questions, as the tender flow builds them.
const offline = {
	title: 'Take $10.50 in Cash while offline?',
	body: 'The sale is held on this device.',
	action: 'Take $10.50 in Cash',
	testID: 'checkout-offline',
};
const clear = {
	title: 'Clear this payment attempt?',
	body: 'Only clear it once the dashboard shows no charge.',
	action: 'Clear attempt',
	destructive: true,
	testID: 'checkout-clear-attempt',
};
const asked: { answer?: Promise<boolean> } = {};
// The flow asks from an event (the Take or Clear attempt press), as here.
function Host({ question }: { question: typeof offline }) {
	const { confirm, dialog } = useConfirm({});
	return (
		<>
			<button data-testid="ask" onClick={() => (asked.answer = confirm(question))} />
			{dialog}
		</>
	);
}
const ask = () => {
	fireEvent.click(screen.getByTestId('ask'));
	return asked.answer!;
};

it.each([
	['the offline tender', offline, 'default'],
	// A loss: the confirm is the solid destructive red; taking a sale never is.
	['the clear', clear, 'destructive'],
])(
	'asks %s with its own copy and testIDs; the confirm answers yes',
	async (_, question, variant) => {
		render(<Host question={question} />);
		expect(screen.queryByTestId(`${question.testID}-dialog`)).toBeNull();
		const answer = ask();
		expect(screen.getByTestId(`${question.testID}-dialog`)).not.toBeNull();
		expect(screen.getByTestId('title').textContent).toBe(question.title);
		expect(screen.getByTestId('body').textContent).toBe(question.body);
		expect(screen.getByTestId(`${question.testID}-cancel`).textContent).toBe('Cancel');
		const confirm = screen.getByTestId(`${question.testID}-confirm`);
		expect(confirm.textContent).toBe(question.action);
		expect(confirm.dataset.variant).toBe(variant);
		fireEvent.click(confirm);
		await expect(answer).resolves.toBe(true);
		expect(screen.queryByTestId(`${question.testID}-dialog`)).toBeNull();
	}
);

it.each(['checkout-clear-attempt-cancel', 'dismiss'])('%s answers no', async (testID) => {
	render(<Host question={clear} />);
	const answer = ask();
	fireEvent.click(screen.getByTestId(testID));
	await expect(answer).resolves.toBe(false);
	expect(screen.queryByTestId('checkout-clear-attempt-dialog')).toBeNull();
});

it('unmounting with the question open answers no', async () => {
	const view = render(<Host question={offline} />);
	const answer = ask();
	view.unmount();
	await expect(answer).resolves.toBe(false);
});
