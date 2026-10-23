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
import { fromMinor, type PaymentMethodDescriptor } from '@wcpos/order-math';

import { useT } from '../../../../../contexts/translations';
import { useCurrencyFormat } from '../../../hooks/use-currency-format';

type Facts = { method: PaymentMethodDescriptor; amountMinor: number };

/**
 * The cashier confirms a tender the store cannot hear yet (ADR 0040 Decided 1 rule 1: never
 * unaware): the amount and method in the title, the risk in one line. `useTenderFlow` asks it
 * and returns `dialog` for its host to render. Closing the question any way but the confirm
 * (Cancel, or the host unmounting) answers no.
 */
export function useConfirmOfflineTender({
	currencySymbol,
	dp,
	portalHost,
}: {
	currencySymbol?: string;
	/** The tender's decimals: the amount arrives in its minor units. */
	dp: number;
	/** The host's overlay layer: the checkout column paints in the POS host, the modal at the root. */
	portalHost?: string;
}) {
	const t = useT();
	const { format } = useCurrencyFormat({ currencySymbol });
	// The facts stay while the dialog animates out; `open` is the question.
	const [question, setQuestion] = React.useState<{ facts: Facts; open: boolean } | null>(null);
	const resolver = React.useRef<((confirmed: boolean) => void) | null>(null);
	const answer = React.useCallback((confirmed: boolean) => {
		resolver.current?.(confirmed);
		resolver.current = null;
		setQuestion((current) => (current ? { ...current, open: false } : current));
	}, []);
	React.useEffect(() => () => answer(false), [answer]);
	const confirmOfflineTender = React.useCallback(
		(facts: Facts) =>
			new Promise<boolean>((resolve) => {
				resolver.current?.(false);
				resolver.current = resolve;
				setQuestion({ facts, open: true });
			}),
		[]
	);
	const take = question && {
		amount: format(Number(fromMinor(question.facts.amountMinor, dp))),
		method: question.facts.method.title,
	};
	const dialog = take ? (
		<AlertDialog open={question.open} onOpenChange={(open) => !open && answer(false)}>
			<AlertDialogContent portalHost={portalHost} testID="checkout-offline-dialog">
				<AlertDialogHeader>
					<AlertDialogTitle>{t('pos_checkout.confirm_offline_title', take)}</AlertDialogTitle>
					<AlertDialogDescription>{t('pos_checkout.confirm_offline_body')}</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel testID="checkout-offline-cancel">
						{t('common.cancel')}
					</AlertDialogCancel>
					{/* Not destructive: taking the sale is the constructive act; red is a void. */}
					<AlertDialogAction
						variant="default"
						testID="checkout-offline-confirm"
						onPress={() => answer(true)}
					>
						{t('pos_checkout.take_amount_in', take)}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	) : null;
	return { confirmOfflineTender, dialog };
}
