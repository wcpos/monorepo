import * as React from 'react';

import type { AlertDialogFooterProps } from '@wcpos/components/alert-dialog';
import type { DialogFooterProps, FooterButton, FooterSlot } from '@wcpos/components/dialog';

const isButton = (entry: FooterSlot): entry is FooterButton => !!entry;

function actionButton(
	{ label, onPress, testID, loading, disabled }: FooterButton,
	size: DialogFooterProps['size'] = 'default'
) {
	return (
		<button
			key={testID ?? label}
			data-testid={testID}
			data-size={size}
			data-loading={String(!!loading)}
			disabled={disabled || loading}
			onClick={onPress as unknown as React.MouseEventHandler}
		>
			<span data-loading={String(!!loading)}>{label}</span>
		</button>
	);
}

/** Slot-aware stand-ins for suites that already mock the dialog shell. */
export function DialogFooter({
	children,
	intent,
	secondary,
	record,
	destructive,
	close,
	aside,
	size = 'default',
}: DialogFooterProps & React.PropsWithChildren) {
	if (children) return <>{children}</>;
	const Close = jest.requireMock('@wcpos/components/dialog').DialogClose;
	if (close && !Close) {
		throw new Error(
			`${expect.getState().testPath}: @wcpos/components/dialog mock needs DialogClose for the close slot`
		);
	}
	return (
		<>
			{aside}
			{[destructive, record]
				.flat()
				.filter(isButton)
				.map((action) => actionButton(action, size))}
			{close ? (
				<Close size={size} {...(typeof close === 'object' ? close : {})}>
					{intent ? 'Cancel' : 'Close'}
				</Close>
			) : null}
			{[secondary, intent]
				.flat()
				.filter(isButton)
				.map((action) => actionButton(action, size))}
		</>
	);
}

export function AlertDialogFooter({
	children,
	confirm,
	cancel = true,
}: AlertDialogFooterProps & React.PropsWithChildren) {
	if (children) return <>{children}</>;
	const Cancel = jest.requireMock('@wcpos/components/alert-dialog').AlertDialogCancel;
	return (
		<>
			{cancel && Cancel ? (
				<Cancel {...(typeof cancel === 'object' ? cancel : {})}>Cancel</Cancel>
			) : null}
			{confirm &&
				React.cloneElement(actionButton(confirm), {
					'data-variant': confirm.destructive ? 'destructive' : 'default',
				} as React.HTMLAttributes<HTMLButtonElement>)}
		</>
	);
}
