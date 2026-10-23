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
import { fromMinor } from '@wcpos/order-math';
import { useDocField } from '@wcpos/query';

import { useStoreSession } from '../../../../../contexts/app-state';
import { useT } from '../../../../../contexts/translations';
import { useCurrencyFormat } from '../../../hooks/use-currency-format';

import type { TenderFlowOptions } from './use-tender-flow';

type Facts = Parameters<NonNullable<TenderFlowOptions['confirmOfflineTender']>>[0];

/**
 * The cashier confirms a tender the store cannot hear yet (ADR 0040 Decided 1 rule 1: never
 * unaware): the amount and method in the title, the risk in one line. A host passes
 * `confirmOfflineTender` to `useTenderFlow` and renders `dialog` in its own tree. Closing the
 * question any way but the confirm (Cancel, or the host unmounting) answers no.
 */
export function useConfirmOfflineTender({
	currencySymbol,
	portalHost,
}: {
	currencySymbol?: string;
	/** The host's overlay layer: the checkout column paints in the POS host, the modal at the root. */
	portalHost?: string;
}) {
	const t = useT();
	const { store } = useStoreSession();
	// The tender's own figures (see use-tender-flow): minor units at the store's decimals.
	const dp = useDocField(store, (value) => value.price_num_decimals) ?? 2;
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
