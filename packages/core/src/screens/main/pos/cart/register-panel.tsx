import * as React from 'react';
import { View } from 'react-native';

import { useRouter } from 'expo-router';
import { useObservableSuspense } from 'observable-hooks';

import { Icon } from '@wcpos/components/icon';
import { Button } from '@wcpos/components/button';
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@wcpos/components/dialog';
import { MenuRow } from '@wcpos/components/menu-row';
import { Text } from '@wcpos/components/text';
import { Tile } from '@wcpos/components/tile';
import { Toast } from '@wcpos/components/toast';
import { useDocField } from '@wcpos/query';

import { credentialsListResource } from '../../../../hooks/user-db-list-resources';
import { useStoreSession } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import { useRegisterSession } from '../../../../services/register-session/use-register-session';
import { useCurrencyFormat } from '../../hooks/use-currency-format';
import { usePaymentMethods } from '../../hooks/use-payment-methods';
import { usePanelSide } from '../contexts/overlay-side';
import { MovementSheet } from './movement-sheet';
import { useSessionReport } from '../../../../services/register-session/use-session-report';

/**
 * The panel is one list, as the cashier sheet is: every row starts at the MenuRow's inset
 * (`px-2.5`) so the labels share one left edge, and each row draws the list's hairline.
 */
const STATIC_ROW =
	'min-h-row border-border flex-row items-center justify-between gap-2 border-b px-2.5';
/** A pressable row of the same list: the MenuRow's surface, squared, with the hairline. */
const ACTION_ROW = 'border-border rounded-none border-b';
const NOTE = 'text-muted-foreground px-2.5 py-1 text-sm';

function Opener({ id }: { id?: number | null }) {
	const { site } = useStoreSession();
	const credentials = useObservableSuspense(credentialsListResource(site));
	const t = useT();
	return (
		<Text>
			{credentials.find((row) => row.id === id)?.display_name ?? t('register.unknown_cashier')}
		</Text>
	);
}

export function RegisterPanel({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const {
		session,
		binding,
		expected,
		salesCount,
		blind,
		movements,
		refusedMovements,
		lastClosure,
		actions,
	} = useRegisterSession();
	const [movement, setMovement] = React.useState<'paid_in' | 'paid_out' | 'no_sale' | null>(null);
	const [expanded, setExpanded] = React.useState(false);
	const [error, setError] = React.useState('');
	const { format } = useCurrencyFormat();
	const { print } = useSessionReport();
	const { print: reprint } = useSessionReport(lastClosure, true);
	const t = useT();
	const { wpCredentials } = useStoreSession();
	const capabilities = useDocField(wpCredentials, (value) => value.capabilities);
	const reportsDenied = !!capabilities && !capabilities.includes('view_woocommerce_pos_reports');
	const router = useRouter();
	const side = usePanelSide('cart');
	// The store's own name for each tender (the gateway title), never its id: the drawer
	// lists what the cashier took money as, and `stripe_terminal_for_woocommerce` is not that.
	// The same fallback as the closure document for a method the store no longer advertises.
	const { byId } = usePaymentMethods();
	const tenderLabel = (method: string) =>
		method === 'cash'
			? t('register.cash')
			: (byId.get(method)?.title ?? method.charAt(0).toUpperCase() + method.slice(1));
	const attempt = async (action: () => Promise<unknown>) => {
		try {
			await action();
		} catch (e) {
			setError(
				e instanceof Error && e.message === 'reports.reprint_failed'
					? t('reports.reprint_failed')
					: String(e)
			);
		}
	};
	// Refused cash keeps the pane open on its own: it is the only record that the money moved,
	// so it must not depend on there also being a current session or a written closure.
	if (!session && !lastClosure && refusedMovements.length === 0) return null;
	const activeMovements = movements.filter(
		(row) =>
			row.type !== 'void' && !row.voided_by && !movements.some((entry) => entry.voids === row.id)
	);
	// A movement the server refused is cash in the drawer that the ledger will never show.
	// Nothing in this pane used to read sync_status, so it went missing in silence. The list
	// comes from the hook already scoped to this register and NOT to the current session, so
	// the banner survives the close that would otherwise hide the last record of the cash.
	const refused = refusedMovements;
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent side={side} size="lg" portalHost="pos" testID="register-panel">
				{/* The header block: on the phone the panel is a page, and its padding comes from here. */}
				<DialogHeader>
					<DialogTitle testID="register-panel-amount" className="text-amt tabular-nums">
						{blind ? binding.registerName : format(Number(expected.cash ?? 0))}
					</DialogTitle>
					{/* The identity line under the figure, in the order modal's recipe: muted, small. */}
					{blind ? (
						<DialogDescription>
							{t('register.sales_count', { count: salesCount })}
						</DialogDescription>
					) : (
						<DialogDescription>
							{t('register.in_the_drawer')} · {binding.registerName} ·{' '}
							{t('register.opened_at_by', {
								time: new Date(session?.opened_at_gmt ?? lastClosure!.closed_at).toLocaleTimeString(
									[],
									{
										hour: '2-digit',
										minute: '2-digit',
									}
								),
							})}{' '}
							<React.Suspense fallback={null}>
								<Opener id={session?.opened_by} />
							</React.Suspense>
						</DialogDescription>
					)}
				</DialogHeader>
				{refused.length > 0 && (
					<View className="border-destructive mx-4 flex-row items-center gap-2 border px-3 py-2">
						<Text testID="register-panel-refused" className="text-destructive flex-1">
							{t('register.refused', { count: refused.length })}
						</Text>
						<Button
							testID="register-panel-retry-refused"
							onPress={() =>
								attempt(() => Promise.all(refused.map((row) => actions.retryMovement(row.id))))
							}
						>
							{t('register.retry')}
						</Button>
					</View>
				)}
				<View className="flex-row gap-2 px-4">
					{(['paid_in', 'paid_out', 'no_sale'] as const).map((type) => (
						<Tile
							key={type}
							testID={`register-panel-${type.replace('_', '-')}`}
							className="flex-1"
							disabled={session?.status !== 'open'}
							onPress={() => setMovement(type)}
						>
							<Icon
								name={
									type === 'paid_in' ? 'arrowDown' : type === 'paid_out' ? 'arrowUp' : 'register'
								}
							/>
							<Text numberOfLines={1} className="font-medium">
								{t(`register.${type}`)}
							</Text>
						</Tile>
					))}
				</View>
				<DialogBody className="gap-0">
					{/* Cash always has a row (the float lives there); every other tender only once it holds money. */}
					{Object.entries({ cash: '0', ...expected }).map(([method, amount]) => (
						<View key={method} className={STATIC_ROW}>
							<Text numberOfLines={1} className="min-w-0 flex-1">
								{tenderLabel(method)}
							</Text>
							{!blind && <Text className="tabular-nums">{format(Number(amount))}</Text>}
						</View>
					))}
					<MenuRow
						testID="register-panel-movements"
						className={ACTION_ROW}
						onPress={() => setExpanded(!expanded)}
						label={t('register.paid_in_out')}
						trailing={
							<Icon
								name={expanded ? 'chevronUp' : 'chevronDown'}
								size="sm"
								className="text-muted-foreground"
							/>
						}
					/>
					{expanded &&
						activeMovements.map((row) => (
							<View key={row.id} className={STATIC_ROW}>
								<Text
									testID={`movement-row-${row.id}`}
									className={`flex-1 ${row.sync_status === 'failed' ? 'text-destructive' : ''}`}
								>
									{t(`register.${row.type}`)}
									{!blind ? ` · ${format(Number(row.amount))} · ${row.reason}` : ''}
									{row.sync_status === 'failed' ? ` · ${t('register.refused_row')}` : ''}
								</Text>
								<Button
									variant="ghost"
									size="sm"
									testID={`movement-void-${row.id}`}
									disabled={session?.status !== 'open'}
									onPress={() => attempt(() => actions.voidMovement(row.id))}
								>
									{t('register.void')}
								</Button>
							</View>
						))}
					{!blind && !!session && (
						<MenuRow
							testID="register-panel-print"
							className={ACTION_ROW}
							onPress={() => attempt(print)}
							label={t('register.print_x_report')}
							trailing={<Icon name="print" size="sm" className="text-muted-foreground" />}
						/>
					)}
					{lastClosure && (
						<View testID="register-panel-last-closure" className="border-border border-b">
							<MenuRow
								testID="register-panel-open-closure"
								disabled={reportsDenied}
								onPress={() => {
									router.push({
										pathname: '/reports',
										params: {
											closureId: lastClosure.id,
											businessDay: lastClosure.business_day,
											openedAt: lastClosure.opened_at,
											registerId: lastClosure.register_id,
										},
									});
									onOpenChange(false);
								}}
								label={`${t('register.closure_written_n', {
									n: lastClosure.server_number ?? lastClosure.number,
								})}${blind ? '' : ` · ${format(Number(lastClosure.counted.cash))}`}`}
								trailing={<Icon name="chevronRight" size="sm" className="text-muted-foreground" />}
							/>
							{blind && (
								<Text testID="register-panel-closure-restricted" className={NOTE}>
									{t('register.closure_blind_restricted')}
								</Text>
							)}
							{!lastClosure.synced_rows_at ? (
								<Text testID="closure-unsynced" className={NOTE}>
									{t('register.unsynced')}
								</Text>
							) : !blind ? (
								<MenuRow
									testID="closure-reprint"
									onPress={() => attempt(reprint)}
									label={t('register.reprint_copy')}
									trailing={<Icon name="print" size="sm" className="text-muted-foreground" />}
								/>
							) : null}
							{lastClosure.sync_status === 'failed' && (
								<Text testID="closure-sync-error" className="text-destructive px-2.5 py-1 text-sm">
									{lastClosure.sync_error}
								</Text>
							)}
							{lastClosure.server_findings &&
								Object.keys(lastClosure.server_findings).length > 0 && (
									<Text className={NOTE}>{t('register.listed_in_health')}</Text>
								)}
						</View>
					)}
					{!!error && <Text className="text-destructive px-2.5 py-2 text-sm">{error}</Text>}
				</DialogBody>
				<DialogFooter>
					{/* Closing is not destructive: the primary, at the register's own height (decision 2). */}
					<Button
						testID="register-panel-close-register"
						disabled={!session}
						size="lg"
						className="flex-1"
						onPress={() =>
							attempt(async () => {
								await actions.startCounting();
								onOpenChange(false);
							})
						}
					>
						{t('register.close_register')}
					</Button>
				</DialogFooter>
				{movement && (
					<MovementSheet
						type={movement}
						onOpenChange={(value) => {
							if (!value) setMovement(null);
						}}
						onDone={(id, type, amount) => {
							Toast.show({
								title: `${t(`register.${type}`)}${blind || type === 'no_sale' ? '' : ` ${format(Number(amount))}`}`,
								action: (
									<Button
										testID="toast-undo"
										variant="ghost"
										onPress={() => attempt(() => actions.voidMovement(id))}
									>
										{t('register.undo')}
									</Button>
								),
							});
						}}
					/>
				)}
			</DialogContent>
		</Dialog>
	);
}
