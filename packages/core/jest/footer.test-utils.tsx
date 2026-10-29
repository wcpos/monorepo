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
	intent,
	secondary,
	record,
	destructive,
	close,
	aside,
	size = 'default',
	testID,
}: DialogFooterProps) {
	const closeProps = typeof close === 'object' ? close : {};
	const buttons = (
		<>
			{aside}
			{[destructive, record]
				.flat()
				.filter(isButton)
				.map((action) => actionButton(action, size))}
			{close ? (
				<button
					data-testid={closeProps.testID}
					disabled={closeProps.disabled}
					onClick={closeProps.onPress as unknown as React.MouseEventHandler}
				>
					{intent ? 'Cancel' : 'Close'}
				</button>
			) : null}
			{[secondary, intent]
				.flat()
				.filter(isButton)
				.map((action) => actionButton(action, size))}
		</>
	);
	return testID ? <div data-testid={testID}>{buttons}</div> : buttons;
}

export function AlertDialogFooter({
	confirm,
	cancel = true,
	secondary,
	size,
	testID,
}: AlertDialogFooterProps) {
	const cancelProps = typeof cancel === 'object' ? cancel : {};
	return (
		<div data-testid={testID}>
			{cancel ? (
				<button
					data-testid={cancelProps.testID}
					disabled={cancelProps.disabled}
					onClick={cancelProps.onPress as unknown as React.MouseEventHandler}
				>
					Cancel
				</button>
			) : null}
			{secondary &&
				React.cloneElement(actionButton(secondary, size), {
					'data-variant': 'outline',
				} as React.HTMLAttributes<HTMLButtonElement>)}
			{React.cloneElement(actionButton(confirm, size), {
				'data-variant': confirm.destructive ? 'destructive' : 'default',
			} as React.HTMLAttributes<HTMLButtonElement>)}
		</div>
	);
}
