import * as React from 'react';

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@wcpos/components/alert-dialog';

import { useT } from '../../../../../contexts/translations';

/** The staff clear's confirm (ADR 0040 c5-2); like the offline one, only the confirm says yes. */
export function useConfirmClearAttempt({ portalHost }: { portalHost?: string }) {
	const t = useT();
	// null until first asked; then `open` alone changes, so the dialog animates out.
	const [open, setOpen] = React.useState<boolean | null>(null);
	const resolver = React.useRef<((confirmed: boolean) => void) | null>(null);
	const answer = React.useCallback((confirmed: boolean) => {
		resolver.current?.(confirmed);
		resolver.current = null;
		setOpen((current) => (current === null ? current : false));
	}, []);
	// The host unmounting closes the question: a pending ask answers no instead of hanging.
	React.useEffect(() => () => answer(false), [answer]);
	const confirmClearAttempt = React.useCallback(
		() =>
			new Promise<boolean>((resolve) => {
				resolver.current?.(false);
				resolver.current = resolve;
				setOpen(true);
			}),
		[]
	);
	const dialog =
		open === null ? null : (
			<AlertDialog open={open} onOpenChange={(next) => !next && answer(false)}>
				<AlertDialogContent portalHost={portalHost} testID="checkout-clear-attempt-dialog">
					<AlertDialogHeader>
						<AlertDialogTitle>{t('pos_checkout.clear_attempt_title')}</AlertDialogTitle>
						<AlertDialogDescription>{t('pos_checkout.clear_attempt_body')}</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel testID="checkout-clear-attempt-cancel">
							{t('common.cancel')}
						</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							testID="checkout-clear-attempt-confirm"
							onPress={() => answer(true)}
						>
							{t('pos_checkout.clear_attempt')}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		);
	return { confirmClearAttempt, dialog };
}
