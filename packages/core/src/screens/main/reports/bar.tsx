import * as React from 'react';
import { View } from 'react-native';

import { format } from 'date-fns';
import { useObservableState } from 'observable-hooks';

import { Button, ButtonText } from '@wcpos/components/button';
import { Icon } from '@wcpos/components/icon';
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
import { HeaderLeft } from '../components/header/left';
import { HeaderRight } from '../components/header/right';
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
				<Button
					testID="reports-see-pro"
					className="min-h-12"
					onPress={() => openExternalURL('https://wcpos.com/pro')}
				>
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
		<Button
			key={id}
			testID={id}
			variant="ghost"
			className={`min-h-12 flex-row justify-start gap-2 px-3 ${!license?.isPro && !allowed ? 'opacity-50' : ''}`}
			onPress={() => choose(changes, allowed, name)}
		>
			<View className="w-5 items-center">{checked && <Icon name="check" size="sm" />}</View>
			<ButtonText numberOfLines={1} className="min-w-0 flex-1 text-left">
				{label}
			</ButtonText>
			{!license?.isPro && !allowed && (
				<Icon name="lock" size="sm" className="text-muted-foreground" />
			)}
		</Button>
	);
	return (
		<View testID="reports-bar" className="bg-background">
			<View className="h-ctl border-border bg-background flex-row items-center gap-2 border-b pr-2 pl-4">
				{room === 'closures' ? (
					<Button
						testID="reports-back-sales"
						variant="ghost"
						className="h-12 min-w-12 shrink-0"
						accessibilityLabel={t('reports.sales')}
						onPress={onBack}
					>
						<Icon name="arrowLeft" />
					</Button>
				) : (
					<HeaderLeft className="h-12 min-w-12 shrink-0" />
				)}
				<Popover onOpenChange={() => setLocked('')}>
					<PopoverTrigger ref={trigger} asChild>
						<Button
							testID="reports-scope"
							variant="ghost"
							className="min-h-12 min-w-0 shrink flex-row items-center gap-1 px-1"
						>
							<ButtonText numberOfLines={1} className="min-w-0 shrink font-semibold">
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
							</ButtonText>
							{!license?.isPro && <Icon name="lock" className="text-muted-foreground" />}
							<Icon name="chevronDown" className="text-muted-foreground" />
						</Button>
					</PopoverTrigger>
					<PopoverContent testID="reports-scope-menu">
						{[{ id: '', name: t('reports.all_registers') }, ...directory.registers].map((row) =>
							option(
								`reports-register-${row.id || 'all'}`,
								row.name,
								{ registerId: row.id },
								!!row.id && row.id === binding.registerId,
								t('reports.other_registers'),
								row.id === scope.registerId
							)
						)}
						{stores.length > 1 && (
							<Text className="text-muted-foreground p-2">{t('common.store')}</Text>
						)}
						{stores.length > 1 &&
							stores.map((row) =>
								option(
									`reports-store-${row.id}`,
									row.name ?? '',
									{
										storeId: row.id,
										// Reselecting the current store keeps the scope as it is (on an unbound Free till, `unbound`).
										registerId: row.id === store.id ? binding.registerId || scope.registerId : '',
									},
									row.id === store.id,
									t('reports.other_stores'),
									row.id === (scope.storeId ?? store.id)
								)
							)}
						<ScopeHint locked={locked} />
					</PopoverContent>
				</Popover>
				<View className="ml-auto shrink-0">
					<HeaderRight />
				</View>
			</View>
		</View>
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
				<Button testID="reports-cashier" variant="outline" className="min-h-12">
					{cashiers.find((row) => row.id === scope.cashier)?.display_name ?? t('common.cashier')}
				</Button>
			</PopoverTrigger>
			<PopoverContent>
				{[{ id: undefined, display_name: t('reports.all_cashiers') }, ...cashiers].map((row) => (
					<Button
						key={row.id ?? 'all'}
						testID={`reports-cashier-${row.id ?? 'all'}`}
						variant="ghost"
						className="min-h-12 flex-row justify-start gap-2 px-3"
						onPress={() => {
							onScopeChange({ ...scope, cashier: row.id });
							trigger.current?.close();
						}}
					>
						<View className="w-5 items-center">
							{row.id === scope.cashier && <Icon name="check" size="sm" />}
						</View>
						<ButtonText numberOfLines={1} className="min-w-0 flex-1 text-left">
							{row.display_name ?? ''}
						</ButtonText>
					</Button>
				))}
			</PopoverContent>
		</Popover>
	);
}
