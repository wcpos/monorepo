import * as React from 'react';

import type { AlertDialogFooterProps } from '@wcpos/components/alert-dialog';
import type { DialogFooterProps, FooterButton } from '@wcpos/components/dialog';

// The dialog's own footer fake, for suites that still mock the dialog shell themselves. Core's
// Jest maps the dialog to that module, so a plain import would answer with the suite's mock.
export const { DialogFooter, DismissIsClose } = jest.requireActual<
	typeof import('@wcpos/components/dialog/testing')
>('@wcpos/components/dialog/testing');

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
