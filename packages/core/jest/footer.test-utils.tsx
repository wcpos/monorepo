import * as React from 'react';

import type { AlertDialogFooterProps } from '@wcpos/components/alert-dialog';
import type { DialogFooterProps, FooterButton, FooterSlot } from '@wcpos/components/dialog';

const DismissIsCloseContext = React.createContext(false);
export function DismissIsClose({ children }: React.PropsWithChildren): React.JSX.Element {
	return <DismissIsCloseContext.Provider value={true}>{children}</DismissIsCloseContext.Provider>;
}
export function useDismissIsClose(): boolean {
	return React.useContext(DismissIsCloseContext);
}

const isButton = (entry: FooterSlot): entry is FooterButton => !!entry;

function actionButton(
	{ label, onPress, testID, loading, disabled }: FooterButton,
	size: DialogFooterProps['size'] = 'default',
	variant = 'default'
) {
	return (
		<button
			key={testID ?? label}
			data-testid={testID}
			data-size={size}
			data-variant={variant}
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
	close = true,
	aside,
	size = 'default',
	testID,
}: DialogFooterProps) {
	const dismissIsClose = useDismissIsClose();
	const closeProps = typeof close === 'object' ? close : {};
	const own = [destructive, record].flat().filter(isButton);
	const leading = (
		<>
			{aside}
			{[destructive]
				.flat()
				.filter(isButton)
				.map((action) => actionButton(action, size, 'outline-destructive'))}
			{[record]
				.flat()
				.filter(isButton)
				.map((action) => actionButton(action, size, 'outline'))}
		</>
	);
	const trailing = (
		<>
			{close ? (
				<button
					data-testid={closeProps.testID ?? (testID ? `${testID}-close` : 'dialog-footer-close')}
					data-variant="outline"
					disabled={closeProps.disabled}
					onClick={closeProps.onPress as unknown as React.MouseEventHandler}
				>
					{intent && !dismissIsClose ? 'Cancel' : 'Close'}
				</button>
			) : null}
			{[secondary]
				.flat()
				.filter(isButton)
				.map((action) => actionButton(action, size, 'outline'))}
			{intent && actionButton(intent, size)}
		</>
	);
	const buttons = own.length ? (
		<>
			<div>{leading}</div>
			<div>{trailing}</div>
		</>
	) : (
		<>
			{leading}
			{trailing}
		</>
	);

	return testID ? <div data-testid={testID}>{buttons}</div> : buttons;
}

export function AlertDialogFooter({ confirm, cancel = true }: AlertDialogFooterProps) {
	const cancelProps = typeof cancel === 'object' ? cancel : {};
	return (
		<>
			{cancel ? (
				<button
					data-testid={cancelProps.testID}
					disabled={cancelProps.disabled}
					onClick={cancelProps.onPress as unknown as React.MouseEventHandler}
				>
					Cancel
				</button>
			) : null}
			{React.cloneElement(actionButton(confirm), {
				'data-variant': confirm.destructive ? 'destructive' : 'default',
			} as React.HTMLAttributes<HTMLButtonElement>)}
		</>
	);
}
