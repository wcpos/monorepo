import * as React from 'react';

import { Button } from '@wcpos/components/button';
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@wcpos/components/dialog';
import { RadioGroup, RadioGroupOption } from '@wcpos/components/radio-group';
import { Text } from '@wcpos/components/text';
import { useOnlineStatus } from '@wcpos/hooks/use-online-status';
import {
	isTenderCorrectable,
	type MetaDataEntry,
	type PaymentRow,
	tenderCorrectionTargets,
	toMinor,
} from '@wcpos/order-math';
import type { EngineRecord } from '@wcpos/query';

import { useT } from '../../../../../contexts/translations';
import { usePaymentMethods } from '../../../hooks/use-payment-methods';
import { useCorrectTender } from '../../../pos/checkout/payments/use-correct-tender';
import { useStoreCapability } from '../../use-store-capability';

import type { LedgerView } from '../../../pos/checkout/tender/use-ledger-view';

/**
 * Change tender (#3647) on the order modal's legs, and the sheet it opens. Offered only when the
 * store would very likely accept it: Pro (not `readOnly`), healthy storage, online, the store
 * advertises `tender_correction`, the row is correctable and another manual method can take it.
 */
export function useChangeTender(
	order: EngineRecord<'orders'>,
	view: LedgerView & { format: (minor: number) => string },
	meta: readonly MetaDataEntry[] | undefined,
	enabled: boolean
) {
	const t = useT();
	const online = useOnlineStatus().status === 'online-website-available';
	const { refunds, status } = order.getLatest?.().payload ?? order.payload;
	const anyRefund = status === 'refunded' || !!refunds?.length; // the store refuses `correct` then
	const live = useStoreCapability('tender_correction') && enabled && online && !anyRefund;
	const { methods } = usePaymentMethods();
	const correct = useCorrectTender();
	const [open, setOpen] = React.useState<PaymentRow | null>(null);
	const [picked, setPicked] = React.useState('');
	const [busy, setBusy] = React.useState(false);
	const show = (row: PaymentRow | null) => {
		setPicked('');
		setOpen(row);
	};
	const targetsOf = (row: PaymentRow) =>
		live && isTenderCorrectable(row, view.rows, meta)
			? tenderCorrectionTargets(row, methods, view.dp)
			: [];
	const legAction = live
		? (row: PaymentRow) =>
				targetsOf(row).length > 0 ? (
					<Button
						variant="outline"
						size="sm"
						testID={`order-payment-change-tender-${row.id}`}
						onPress={() => show(row)}
					>
						{t('orders.change_tender')}
					</Button>
				) : null
		: undefined;
	const targets = open ? targetsOf(open) : [];
	const target = targets.find(({ id }) => id === picked);
	const confirm = async () => {
		if (!open || !target || busy) return;
		setBusy(true);
		const outcome = await correct(order, open.id, { id: target.id, title: target.title });
		setBusy(false);
		if (outcome !== 'refused') show(null);
	};
	const titleOf = (id: string) => methods.find((method) => method.id === id)?.title ?? id;
	const sheet =
		open && targets.length > 0 ? (
			<Dialog open onOpenChange={(next) => !next && !busy && show(null)}>
				<DialogContent side="right" size="md" testID="change-tender-sheet">
					<DialogHeader>
						<DialogTitle>{t('orders.change_tender')}</DialogTitle>
					</DialogHeader>
					<DialogBody>
						<Text decodeHtml>
							{`${titleOf(open.method_id)} ${view.format(toMinor(open.amount, view.dp))}`}
						</Text>
						<RadioGroup value={picked} onValueChange={setPicked} disabled={busy}>
							{targets.map((method) => (
								<RadioGroupOption
									key={method.id}
									value={method.id}
									label={method.title}
									testID={`change-tender-method-${method.id}`}
								/>
							))}
						</RadioGroup>
					</DialogBody>
					<DialogFooter
						intent={{
							label: target
								? t('orders.change_tender_to', { method: target.title })
								: t('orders.change_tender'),
							testID: 'change-tender-confirm',
							disabled: !target || busy,
							loading: busy,
							onPress: () => void confirm(),
						}}
					/>
				</DialogContent>
			</Dialog>
		) : null;
	return { legAction, sheet };
}
