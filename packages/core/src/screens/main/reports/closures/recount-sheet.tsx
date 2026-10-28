import * as React from 'react';
import { View } from 'react-native';

import { useIsPhone } from '@wcpos/components/lib/device';
import { Button } from '@wcpos/components/button';
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@wcpos/components/dialog';
import { Input } from '@wcpos/components/input';
import { Text } from '@wcpos/components/text';
import { TileGrid } from '@wcpos/components/tile-grid';
import { useOnlineStatus } from '@wcpos/hooks/use-online-status';
import { useDocField } from '@wcpos/query';
import { fromMinor } from '@wcpos/order-math';
import { type ClosureRow, mintUuid } from '@wcpos/query/register-session';

import { useAppState } from '../../../../contexts/app-state';
import { useViewedStore } from '../../../../hooks/use-store-day';
import { useT } from '../../../../contexts/translations';
import { useExclusive } from '../../hooks/use-exclusive';
import { useRestHttpClient } from '../../hooks/use-rest-http-client';
import { ApprovalFields } from '../../pos/cart/approve-sheet';
import { RegisterAmount } from '../../pos/cart/movement-sheet';
import { DenominationTile } from '../../pos/cart/register-count';
import { denominations } from '../../pos/cart/register-count.denominations';
import { denominationTotal, validAmount } from '../../pos/cart/register-count.helpers';
import {
	type Correction,
	deriveSettled,
} from '../../../../services/register-session/settled-figures';

// Closures_Controller caps a correction reason at 500 characters.
const RECOUNT_REASON_LIMIT = 500;

export function RecountSheet({
	row,
	corrections = [],
	onSaved,
	onOpenChange,
}: {
	row: ClosureRow;
	corrections?: readonly Correction[];
	onSaved: () => void | Promise<void>;
	onOpenChange: (open: boolean) => void;
}) {
	const t = useT();
	const http = useRestHttpClient();
	const { wpCredentials } = useAppState();
	const store = useViewedStore(row.store_id ?? 0);
	const capabilities = useDocField(wpCredentials, (value) => value.capabilities);
	const settings = useDocField(store, (value) => value);
	const currency = settings?.currency;
	const currencyOptions = {
		currency,
		currencyPosition: settings?.currency_pos,
		decimalScale: settings?.price_num_decimals,
		decimalSeparator: settings?.price_decimal_sep,
		thousandSeparator: settings?.price_thousand_sep,
	};
	const manager = capabilities?.includes('manage_woocommerce_pos_closures');
	const online = useOnlineStatus().status === 'online-website-available';
	const phone = useIsPhone();
	const [counted, setCounted] = React.useState<Record<string, string>>(() => {
		const { settled } = deriveSettled(row, corrections);
		return Object.fromEntries(
			Object.keys({ cash: '', ...settled.expected, ...settled.counted }).map((key) => [key, ''])
		);
	});
	const [pieces, setPieces] = React.useState<Record<string, number>>({});
	const [notesOpen, setNotesOpen] = React.useState(false);
	const [reason, setReason] = React.useState('');
	const [username, setUsername] = React.useState('');
	const [password, setPassword] = React.useState('');
	// Duplicate taps must not append two fiscal corrections.
	const { busy, exclusive } = useExclusive();
	const request = React.useRef<{ key: string; id: string } | null>(null);
	const [error, setError] = React.useState('');
	const faces = denominations[currency ?? ''] ?? denominations.default;
	const amounts = {
		...counted,
		cash: Object.keys(pieces).length ? fromMinor(denominationTotal(pieces), 2) : counted.cash,
	};
	const reasonTooLong = [...reason.trim()].length > RECOUNT_REASON_LIMIT;
	const invalid =
		!online ||
		Object.values(amounts).some((value) => !validAmount(value)) ||
		!reason.trim() ||
		reasonTooLong ||
		(!manager && (!username.trim() || !password));
	const runSave = async () => {
		if (invalid) return;
		setError('');
		const key = JSON.stringify([row.id, amounts, reason.trim(), username.trim(), password]);
		if (request.current?.key !== key) request.current = { key, id: mintUuid() };
		try {
			await http.post(`closures/${row.server_closure_id ?? row.id}/recount`, {
				id: request.current.id,
				counted: amounts,
				reason: reason.trim(),
				...(!manager ? { approval: { username: username.trim(), password } } : {}),
			});
			await onSaved();
			request.current = null;
			setPassword('');
			onOpenChange(false);
		} catch {
			setError(t('reports.recount_failed'));
		}
	};
	const save = () => exclusive('save', runSave);
	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!busy) onOpenChange(open);
			}}
		>
			<DialogContent
				side={phone ? 'bottom' : 'right'}
				testID="recount-sheet"
				closeLabel={t('common.close')}
				closeButtonProps={{ testID: 'recount-close' }}
			>
				<DialogHeader>
					<DialogTitle>{t('reports.recount')}</DialogTitle>
				</DialogHeader>
				<DialogBody contentContainerClassName="gap-3">
					{!online && <Text testID="recount-offline">{t('reports.recount_offline')}</Text>}
					{Object.entries(amounts).map(([method, value]) => (
						<View key={method} testID={`recount-tender-${method}`} className="gap-2">
							<Text>{t('register.tender_counted', { method })}</Text>
							<RegisterAmount
								currencyOptions={currencyOptions}
								testID={`recount-${method}`}
								value={value}
								onChangeText={(amount) => {
									if (method === 'cash') setPieces({});
									setCounted({ ...counted, [method]: amount });
								}}
							/>
						</View>
					))}
					<Button
						testID="recount-denominations"
						variant="ghost"
						onPress={() => setNotesOpen(!notesOpen)}
					>
						{t('register.count_by_denominations')}
					</Button>
					{notesOpen && (
						<TileGrid columns={4}>
							{faces.map((face) => (
								<DenominationTile
									currencyOptions={currencyOptions}
									key={face}
									value={face}
									pieces={pieces[face] ?? 0}
									add={(n) =>
										setPieces((previous) => ({ ...previous, [face]: (previous[face] ?? 0) + n }))
									}
								/>
							))}
						</TileGrid>
					)}
					<Text>{t('reports.recount_reason')}</Text>
					<Input
						testID="recount-reason"
						maxLength={RECOUNT_REASON_LIMIT}
						className="min-h-12"
						value={reason}
						onChangeText={setReason}
					/>
					{!manager && (
						<>
							<Text>{t('register.manager_approval')}</Text>
							<ApprovalFields {...{ username, password, setUsername, setPassword }} />
						</>
					)}
					{!!error && <Text testID="recount-error">{error}</Text>}
				</DialogBody>
				{reasonTooLong && (
					<Text testID="recount-reason-error" className="text-destructive">
						{t('reports.recount_reason_too_long', { limit: RECOUNT_REASON_LIMIT })}
					</Text>
				)}
				<DialogFooter
					intent={{
						label: t('reports.recount_save'),
						testID: 'recount-save',
						loading: busy,
						disabled: invalid,
						onPress: () => void save(),
					}}
				/>
			</DialogContent>
		</Dialog>
	);
}
