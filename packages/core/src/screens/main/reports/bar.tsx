import * as React from 'react';
import { View } from 'react-native';

import { format } from 'date-fns/format';
import { useObservableState } from 'observable-hooks';

import { Button } from '@wcpos/components/button';
import { MenuRow, MenuRowGroup } from '@wcpos/components/menu-row';
import { Icon } from '@wcpos/components/icon';
import { IconButton } from '@wcpos/components/icon-button';
import { useIsPhone } from '@wcpos/components/lib/device';
import { Popover, PopoverContent, PopoverTrigger } from '@wcpos/components/popover';
import { Text } from '@wcpos/components/text';
import type { StoreDocument, WPCredentialsDocument } from '@wcpos/database';
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
import { UpgradeNotice } from '../components/upgrade-notice';
import { UpgradeNoticeContext } from '../components/upgrade-notice/context';
import { clampClosureScope, type ClosureScope } from './closures/use-closure-rows';

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
	const { showUpgrade, setShowUpgrade } = React.useContext(UpgradeNoticeContext);
	const { store, site, wpCredentials } = useStoreSession();
	const binding = useRegisterBinding();
	const { license } = useAppInfo();
	const source = React.useMemo(() => wpCredentials.populate$('stores'), [wpCredentials]);
	const stores = useObservableState(source, []) as StoreDocument[];
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
			next.storeId === store.id ? store : stores.find((row) => row.id === next.storeId);
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
									{/* The bar's title, not a quiet action: it keeps the foreground over the ghost's muted label. */}
									<Text numberOfLines={1} className="text-foreground min-w-0 shrink font-semibold">
										{directory.registers.find((row) => row.id === scope.registerId)?.name ??
											(scope.registerId && binding.registerId
												? binding.registerName
												: !license?.isPro && !binding.registerId
													? // Free with no bound register sees nothing until one is chosen; say so.
														t('common.select_register')
													: t('reports.all_registers'))}
										{stores.length > 1
											? ` · ${stores.find((row) => row.id === scope.storeId)?.name ?? store.name}`
											: ''}
									</Text>
									{!license?.isPro && <Icon name="lock" className="text-muted-foreground" />}
									<Icon name="chevronDown" className="text-muted-foreground" />
								</Button>
							</PopoverTrigger>
							<PopoverContent testID="reports-scope-menu">
								<MenuRowGroup accessibilityLabel={t('common.register')}>
									{[{ id: '', name: t('reports.all_registers') }, ...directory.registers].map(
										(row) =>
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
								{stores.length > 1 && (
									<Text className="text-muted-foreground p-2">{t('common.store')}</Text>
								)}
								{stores.length > 1 && (
									<MenuRowGroup accessibilityLabel={t('common.store')}>
										{stores.map((row) =>
											option(
												`reports-store-${row.id}`,
												row.name ?? '',
												{
													storeId: row.id,
													// Reselecting the bound store while already on it keeps the register scope (a chosen Pro
													// register, or `unbound` on an unbound Free till); returning to it from another store
													// restores the binding, so another store's register never rides along.
													registerId:
														row.id === store.id
															? (scope.storeId ?? store.id) === store.id
																? scope.registerId
																: (binding.registerId ?? '')
															: '',
												},
												row.id === store.id,
												t('reports.other_stores'),
												row.id === (scope.storeId ?? store.id)
											)
										)}
									</MenuRowGroup>
								)}
								<ScopeHint locked={license?.isPro ? '' : locked} />
							</PopoverContent>
						</Popover>
					</>
				}
			/>
			{showUpgrade && !license?.isPro && <UpgradeNotice setShowUpgrade={setShowUpgrade} />}
		</>
	);
}

export function CashierButton({ scope, onScopeChange }: ScopeProps) {
	const t = useT();
	const { site } = useStoreSession();
	const source = React.useMemo(() => site.populate$('wp_credentials'), [site]);
	const cashiers = useObservableState(source, []) as WPCredentialsDocument[];
	const trigger = React.useRef<React.ComponentRef<typeof PopoverTrigger>>(null);
	return (
		<Popover>
			<PopoverTrigger ref={trigger} asChild>
				<Button testID="reports-cashier" variant="outline">
					{cashiers.find((row) => row.id === scope.cashier)?.display_name ?? t('common.cashier')}
				</Button>
			</PopoverTrigger>
			<PopoverContent>
				<MenuRowGroup accessibilityLabel={t('common.cashier')}>
					{[{ id: undefined, display_name: t('reports.all_cashiers') }, ...cashiers].map((row) => (
						<MenuRow
							key={row.id ?? 'all'}
							testID={`reports-cashier-${row.id ?? 'all'}`}
							choice
							selected={row.id === scope.cashier}
							label={row.display_name ?? ''}
							onPress={() => {
								onScopeChange({ ...scope, cashier: row.id });
								trigger.current?.close();
							}}
						/>
					))}
				</MenuRowGroup>
			</PopoverContent>
		</Popover>
	);
}
