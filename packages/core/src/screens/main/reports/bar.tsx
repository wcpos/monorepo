import * as React from 'react';
import { View } from 'react-native';

import { format } from 'date-fns/format';

import { Button } from '@wcpos/components/button';
import { MenuRow, MenuRowGroup } from '@wcpos/components/menu-row';
import { Icon } from '@wcpos/components/icon';
import { IconButton } from '@wcpos/components/icon-button';
import { useIsPhone } from '@wcpos/components/lib/device';
import { Popover, PopoverContent, PopoverTrigger } from '@wcpos/components/popover';
import { Text } from '@wcpos/components/text';
import { openExternalURL } from '@wcpos/utils/open-external-url';

import { useStoreSession } from '../../../contexts/app-state';
import { useT } from '../../../contexts/translations';
import { useAppInfo } from '../../../hooks/use-app-info';
import { resolveDayTimezone, zoneOptions } from '../../../hooks/use-store-day';
import {
	useRegisterBinding,
	useRegisterDirectory,
} from '../../../services/register/use-register-binding';
import { ManagementBar } from '../components/management-bar';
import { clampClosureScope, type ClosureScope } from './closures/use-closure-rows';
import { MenuChip } from './menu-chip';
import { useReportsDirectories } from './scope';

type ScopeProps = { scope: ClosureScope; onScopeChange: (scope: ClosureScope) => void };

export function ScopeHint({
	locked,
	historyLimit = false,
}: {
	locked: string;
	historyLimit?: boolean;
}) {
	const t = useT();
	if (!locked && !historyLimit) return null;
	return (
		<View className="border-border gap-2 border-t p-2">
			<Text testID="reports-lock-hint">
				{historyLimit ? t('reports.history_limit') : t('reports.pro_scope', { scope: locked })}
			</Text>
			{!historyLimit && (
				<Button testID="reports-see-pro" onPress={() => openExternalURL('https://wcpos.com/pro')}>
					{t('reports.see_pro')}
				</Button>
			)}
		</View>
	);
}

export function Bar({
	room,
	scope,
	onScopeChange,
	onBack,
}: ScopeProps & { room: 'sales' | 'closures'; onBack: () => void }) {
	const t = useT();
	const phone = useIsPhone();
	const { store, site } = useStoreSession();
	const binding = useRegisterBinding();
	const { license } = useAppInfo();
	const stores = useReportsDirectories().stores ?? [];
	// Store 0 is also a single-store install's own id: All stores only with stores to choose from.
	const allStores = room === 'sales' && scope.storeId === 0 && stores.length > 1;
	const directory = useRegisterDirectory(
		license?.isPro && stores.some((row) => row.id === scope.storeId) ? scope.storeId : store.id
	);
	const [locked, setLocked] = React.useState('');
	const trigger = React.useRef<React.ComponentRef<typeof PopoverTrigger>>(null);
	const choose = (changes: Partial<ClosureScope>, allowed: boolean, name: string) => {
		if (!license?.isPro && !allowed) {
			setLocked(name);
			return;
		}
		setLocked('');
		const next = { ...scope, ...changes };
		const destination =
			(room === 'sales' && next.storeId === 0) || next.storeId === store.id
				? store
				: stores.find((row) => row.id === next.storeId);
		const destinationZone = resolveDayTimezone(destination, site).timezone;
		onScopeChange(
			changes.storeId === undefined
				? next
				: clampClosureScope(next, format(new Date(), 'yyyy-MM-dd', zoneOptions(destinationZone)))
		);
		trigger.current?.close();
	};
	const option = (
		id: string,
		label: string,
		changes: Partial<ClosureScope>,
		allowed: boolean,
		name: string,
		checked: boolean
	) => (
		<View key={id} className={!license?.isPro && !allowed ? 'opacity-50' : undefined}>
			<MenuRow
				testID={id}
				choice
				selected={checked}
				label={label}
				onPress={() => choose(changes, allowed, name)}
				trailing={
					!license?.isPro &&
					!allowed && <Icon name="lock" size="sm" className="text-muted-foreground" />
				}
			/>
		</View>
	);
	// Closures returns to Sales: the page bar's crumb on a phone, an arrow before the scope on
	// wider widths, where the page bar carries no back (its ledger line 3).
	const back =
		room === 'closures'
			? { label: t('reports.sales'), onPress: onBack, testID: 'reports-back-sales' }
			: undefined;
	return (
		<>
			<ManagementBar
				testID="reports-bar"
				back={phone ? back : undefined}
				titleSlot={
					<>
						{!phone && back && (
							<IconButton
								name="arrowLeft"
								testID={back.testID}
								className="shrink-0"
								accessibilityLabel={back.label}
								onPress={back.onPress}
							/>
						)}
						<Popover onOpenChange={() => setLocked('')}>
							<PopoverTrigger ref={trigger} asChild>
								<Button
									testID="reports-scope"
									variant="ghost"
									className="min-w-0 shrink flex-row items-center gap-1 px-1"
								>
									{/* The bar's title, not a quiet action: it keeps the foreground over the ghost's muted label.
									    Store · Register: the larger container first, as every line that names both reads. */}
									<Text numberOfLines={1} className="text-foreground min-w-0 shrink font-semibold">
										{stores.length > 1
											? `${allStores ? t('reports.all_stores') : (stores.find((row) => row.id === scope.storeId)?.name ?? store.name)} · `
											: ''}
										{directory.registers.find((row) => row.id === scope.registerId)?.name ??
											(scope.registerId && binding.registerId
												? binding.registerName
												: !license?.isPro && !binding.registerId
													? // Free with no bound register sees nothing until one is chosen; say so.
														t('common.select_register')
													: t('reports.all_registers'))}
									</Text>
									{!license?.isPro && <Icon name="lock" className="text-muted-foreground" />}
									<Icon name="chevronDown" className="text-muted-foreground" />
								</Button>
							</PopoverTrigger>
							<PopoverContent testID="reports-scope-menu">
								{/* Store group above the Register group, in the title's order; one store needs no store group and no labels. */}
								{stores.length > 1 && (
									<Text className="text-muted-foreground p-2">{t('common.store')}</Text>
								)}
								{stores.length > 1 && (
									<MenuRowGroup accessibilityLabel={t('common.store')}>
										{[
											...(room === 'sales' ? [{ id: 0, name: t('reports.all_stores') }] : []),
											...stores,
										].map((row) =>
											option(
												`reports-store-${row.id === 0 ? 'all' : row.id}`,
												row.name ?? '',
												{
													storeId: row.id,
													// Reselecting the bound store while already on it keeps the register scope (a chosen Pro
													// register, or `unbound` on an unbound Free till); returning to it from another store
													// restores the binding, so another store's register never rides along.
													registerId:
														row.id === 0
															? ''
															: row.id === store.id
																? (scope.storeId ?? store.id) === store.id
																	? scope.registerId
																	: (binding.registerId ?? '')
																: '',
												},
												row.id !== 0 && row.id === store.id,
												row.id === 0 ? t('reports.all_stores') : t('reports.other_stores'),
												row.id === 0 ? scope.storeId === 0 : row.id === (scope.storeId ?? store.id)
											)
										)}
									</MenuRowGroup>
								)}
								{stores.length > 1 && (
									<Text className="text-muted-foreground p-2">{t('common.register')}</Text>
								)}
								<MenuRowGroup accessibilityLabel={t('common.register')}>
									{[
										{ id: '', name: t('reports.all_registers') },
										...(allStores ? [] : directory.registers),
									].map((row) =>
										option(
											`reports-register-${row.id || 'all'}`,
											row.name,
											{ registerId: row.id },
											!!row.id && row.id === binding.registerId,
											t('reports.other_registers'),
											row.id === scope.registerId
										)
									)}
								</MenuRowGroup>
								<ScopeHint locked={license?.isPro ? '' : locked} />
							</PopoverContent>
						</Popover>
					</>
				}
			/>
		</>
	);
}

export function ClosuresCashierChip({
	scope,
	onScopeChange,
	stretch,
}: ScopeProps & { stretch?: boolean }) {
	const t = useT();
	const cashiers = useReportsDirectories().cashiers ?? [];
	return (
		<MenuChip
			stretch={stretch}
			name="cashier"
			icon="cashier"
			scroll
			value={scope.cashier === undefined ? 'all' : String(scope.cashier)}
			defaultValue="all"
			onChange={(next) =>
				onScopeChange({ ...scope, cashier: next === 'all' ? undefined : Number(next) })
			}
			choices={[
				{ value: 'all', label: t('reports.all_cashiers') },
				...cashiers.map((row) => ({ value: String(row.id), label: row.display_name ?? '' })),
			]}
			ids={{
				trigger: 'reports-cashier',
				menu: 'reports-cashier-menu',
				row: (v) => `reports-cashier-${v}`,
				clear: 'reports-cashier-clear',
			}}
		/>
	);
}
