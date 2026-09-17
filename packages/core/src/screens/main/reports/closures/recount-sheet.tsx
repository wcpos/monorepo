import * as React from 'react';
import { ScrollView, View } from 'react-native';

import { Button } from '@wcpos/components/button';
import { Dialog, DialogContent, DialogTitle } from '@wcpos/components/dialog';
import { Input } from '@wcpos/components/input';
import { Text } from '@wcpos/components/text';
import type { ClosureRow } from '@wcpos/database';
import { useOnlineStatus } from '@wcpos/hooks/use-online-status';
import { useDocField } from '@wcpos/query';
import { fromMinor } from '@wcpos/order-math';

import { useAppState } from '../../../../contexts/app-state';
import { useTheme } from '../../../../contexts/theme';
import { useT } from '../../../../contexts/translations';
import { mintUuid } from '../../../../services/register/register-document';
import { useRestHttpClient } from '../../hooks/use-rest-http-client';
import { ApprovalFields } from '../../pos/cart/approve-sheet';
import { RegisterAmount } from '../../pos/cart/movement-sheet';
import { DenominationTile } from '../../pos/cart/register-count';
import { denominations } from '../../pos/cart/register-count.denominations';
import { denominationTotal, validAmount } from '../../pos/cart/register-count.helpers';

// Closures_Controller caps a correction reason at 500 characters.
const RECOUNT_REASON_LIMIT = 500;

export function RecountSheet({
	row,
	onSaved,
	onOpenChange,
}: {
	row: ClosureRow;
	onSaved: () => void;
	onOpenChange: (open: boolean) => void;
}) {
	const t = useT();
	const http = useRestHttpClient();
	const { wpCredentials, store } = useAppState();
	const capabilities = useDocField(wpCredentials, (value) => value.capabilities);
	const currency = useDocField(store, (value) => value.currency);
	const manager = capabilities?.includes('manage_woocommerce_pos_closures');
	const online = useOnlineStatus().status === 'online-website-available';
	const { screenSize } = useTheme();
	const [counted, setCounted] = React.useState<Record<string, string>>(() =>
		Object.fromEntries(Object.keys({ cash: '', ...row.counted }).map((key) => [key, '']))
	);
	const [pieces, setPieces] = React.useState<Record<string, number>>({});
	const [notesOpen, setNotesOpen] = React.useState(false);
	const [reason, setReason] = React.useState('');
	const [username, setUsername] = React.useState('');
	const [password, setPassword] = React.useState('');
	const [busy, setBusy] = React.useState(false);
	// Duplicate taps must not append two fiscal corrections.
	const busyRef = React.useRef(false);
	const request = React.useRef<{ key: string; id: string } | null>(null);
	const [error, setError] = React.useState('');
	const faces = denominations[currency ?? ''] ?? denominations.default;
	const amounts = {
		...counted,
		cash: Object.keys(pieces).length ? fromMinor(denominationTotal(pieces), 2) : counted.cash,
	};
	const invalid =
		!online ||
		Object.values(amounts).some((value) => !validAmount(value)) ||
		!reason.trim() ||
		[...reason.trim()].length > RECOUNT_REASON_LIMIT ||
		(!manager && (!username.trim() || !password));
	const save = async () => {
		if (invalid || busyRef.current) return;
		busyRef.current = true;
		setBusy(true);
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
			request.current = null;
			setPassword('');
			onSaved();
			onOpenChange(false);
		} catch {
			setError(t('reports.recount_failed'));
		} finally {
			busyRef.current = false;
			setBusy(false);
		}
	};
	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!busy) onOpenChange(open);
			}}
		>
			<DialogContent side={screenSize === 'sm' ? 'bottom' : 'right'} testID="recount-sheet">
				<DialogTitle>{t('reports.recount')}</DialogTitle>
				<ScrollView contentContainerClassName="gap-3">
					{!online && <Text testID="recount-offline">{t('reports.recount_offline')}</Text>}
					{Object.entries(amounts).map(([method, value]) => (
						<View key={method} testID={`recount-tender-${method}`} className="gap-2">
							<Text>{t('register.tender_counted', { method })}</Text>
							<RegisterAmount
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
						className="min-h-12"
						onPress={() => setNotesOpen(!notesOpen)}
					>
						{t('register.count_by_denominations')}
					</Button>
					{notesOpen &&
						Array.from({ length: Math.ceil(faces.length / 4) }, (_, index) => (
							<View key={index} className="flex-row gap-2">
								{Array.from({ length: 4 }, (_, column) => {
									const face = faces[index * 4 + column];
									return face ? (
										<DenominationTile
											key={face}
											value={face}
											count={pieces[face] ?? 0}
											add={(n) => {
												setPieces((previous) => ({
													...previous,
													[face]: (previous[face] ?? 0) + n,
												}));
											}}
										/>
									) : (
										<View key={column} className="flex-1" />
									);
								})}
							</View>
						))}
					<Text>{t('reports.recount_reason')}</Text>
					<Input
						testID="recount-reason"
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
				</ScrollView>
				<Button
					testID="recount-save"
					className="min-h-14"
					loading={busy}
					disabled={invalid}
					onPress={save}
				>
					{t('reports.recount_save')}
				</Button>
			</DialogContent>
		</Dialog>
	);
}
