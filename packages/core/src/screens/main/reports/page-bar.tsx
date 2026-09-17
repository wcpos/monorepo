import * as React from 'react';
import { View } from 'react-native';

import { format, parseISO, subDays } from 'date-fns';
import { useObservableState } from 'observable-hooks';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, ButtonText } from '@wcpos/components/button';
import { Calendar, type DateRange } from '@wcpos/components/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@wcpos/components/popover';
import { Tabs, TabsList, TabsTrigger } from '@wcpos/components/tabs';
import { Text } from '@wcpos/components/text';
import { HISTORY_DAYS } from '@wcpos/sync-core';
import { openExternalURL } from '@wcpos/utils/open-external-url';
import type { StoreDocument, WPCredentialsDocument } from '@wcpos/database';

import { useStoreSession } from '../../../contexts/app-state';
import { useT } from '../../../contexts/translations';
import { useAppInfo } from '../../../hooks/use-app-info';
import { useLocalDate } from '../../../hooks/use-local-date';
import { useStoreDay, zoneOptions } from '../../../hooks/use-store-day';
import {
	useRegisterBinding,
	useRegisterDirectory,
} from '../../../services/register/use-register-binding';
import { HeaderLeft } from '../components/header/left';
import { HeaderRight } from '../components/header/right';

import type { ClosureScope } from './closures/use-closure-rows';

export type PageBarProps = {
	room: string;
	onRoomChange: (room: string) => void;
	scope: ClosureScope;
	onScopeChange: (scope: ClosureScope) => void;
};
export function PageBar({ room, onRoomChange, scope, onScopeChange }: PageBarProps) {
	const t = useT();
	const { formatDate } = useLocalDate();
	const { top } = useSafeAreaInsets();
	const { store, site, wpCredentials } = useStoreSession();
	const binding = useRegisterBinding();
	const { license } = useAppInfo();
	const { presets, timezone } = useStoreDay();
	const sources = React.useMemo(
		() => ({
			stores: wpCredentials.populate$('stores'),
			cashiers: site.populate$('wp_credentials'),
		}),
		[wpCredentials, site]
	);
	const stores = useObservableState(sources.stores, []) as StoreDocument[];
	const directory = useRegisterDirectory(
		license?.isPro && stores.some((row) => row.id === scope.storeId) ? scope.storeId : store.id
	);
	const cashiers = useObservableState(sources.cashiers, []) as WPCredentialsDocument[];
	const [locked, setLocked] = React.useState('');
	const [menu, setMenu] = React.useState('');
	const [custom, setCustom] = React.useState(false);
	const [draft, setDraft] = React.useState<DateRange>({
		from: parseISO(scope.from),
		to: parseISO(scope.to),
	});
	const day = (date: Date) => format(date, 'yyyy-MM-dd', zoneOptions(timezone));
	const ranges = presets();
	const today = day(ranges.today.from);
	const min = format(subDays(parseISO(today), HISTORY_DAYS), 'yyyy-MM-dd');
	const labels = {
		today: t('common.today'),
		yesterday: t('common.yesterday'),
		thisWeek: t('common.this_week'),
		lastWeek: t('common.last_week'),
		thisMonth: t('common.this_month'),
		lastMonth: t('common.last_month'),
	};
	const choose = (changes: Partial<ClosureScope>, allowed: boolean, name: string) => {
		if (!license?.isPro && !allowed) {
			setLocked(name);
			return;
		}
		setLocked('');
		setMenu('');
		onScopeChange({ ...scope, ...changes });
	};
	const period = (from: string, to: string, name: string) => {
		const start = from < min ? min : from > today ? today : from;
		choose(
			{ from: start, to: to < start ? start : to > today ? today : to },
			from === today && to === today,
			name
		);
	};
	const selected = Object.entries(ranges).find(
		([, range]) =>
			day(range.from) === scope.from && (day(range.to) > today ? today : day(range.to)) === scope.to
	)?.[0] as keyof typeof labels | undefined;
	const hint = locked && (
		<View className="gap-2 border-t p-2">
			<Text testID="reports-lock-hint">{t('reports.pro_scope', { scope: locked })}</Text>
			<Button
				testID="reports-see-pro"
				className="min-h-12"
				onPress={() => openExternalURL('https://wcpos.com/pro')}
			>
				{t('reports.see_pro')}
			</Button>
		</View>
	);
	const option = (id: string, label: string, onPress: () => void, locked = false) => (
		<Button
			key={id}
			testID={id}
			variant="ghost"
			className={`min-h-12 ${locked ? 'opacity-50' : ''}`}
			onPress={onPress}
		>
			{`${label}${locked ? ` · ${t('reports.locked')}` : ''}`}
		</Button>
	);
	return (
		<View
			testID="reports-page-bar"
			className="bg-card gap-2 border-b p-2"
			style={{ paddingTop: top + 8 }}
		>
			<View className="flex-row items-center justify-between gap-2">
				<View className="bg-sidebar rounded-md">
					<HeaderLeft />
				</View>
				<Tabs value={room} onValueChange={onRoomChange}>
					<TabsList className="flex-row gap-2">
						{['sales', 'closures'].map((value) => (
							<TabsTrigger
								key={value}
								value={value}
								testID={`reports-room-${value}`}
								className="min-h-12"
							>
								<Text>{t(`reports.${value}`)}</Text>
							</TabsTrigger>
						))}
					</TabsList>
				</Tabs>
				<HeaderRight />
			</View>
			<View className="flex-row items-center gap-2">
				<Popover
					onOpenChange={(open) => {
						setMenu(open ? 'period' : '');
						setLocked('');
					}}
				>
					<PopoverTrigger asChild>
						<Button testID="reports-period" variant="ghost" className="min-h-12 flex-1">
							{selected
								? labels[selected]
								: `${formatDate(parseISO(scope.from), 'd MMM')} – ${formatDate(parseISO(scope.to), 'd MMM')}`}
						</Button>
					</PopoverTrigger>
					<PopoverContent>
						{option(
							'reports-period-previous',
							'‹',
							() =>
								period(
									format(subDays(parseISO(scope.from), 1), 'yyyy-MM-dd'),
									format(subDays(parseISO(scope.to), 1), 'yyyy-MM-dd'),
									t('reports.earlier_closures')
								),
							!license?.isPro
						)}
						{Object.entries(ranges).map(([key, range]) =>
							option(
								`reports-period-${key}`,
								labels[key as keyof typeof labels],
								() =>
									period(
										day(range.from),
										day(range.to),
										key === 'yesterday'
											? t('reports.earlier_closures')
											: labels[key as keyof typeof labels]
									),
								!license?.isPro && key !== 'today'
							)
						)}
						{option(
							'reports-period-custom',
							t('reports.custom_range'),
							() => (license?.isPro ? setCustom(true) : setLocked(t('reports.custom_ranges'))),
							!license?.isPro
						)}
						{custom && license?.isPro && (
							<>
								<Calendar
									testID="reports-calendar"
									minDate={min}
									maxDate={today}
									dateRange={draft}
									onDateRangeChange={setDraft}
								/>
								{option('reports-period-apply', t('common.done'), () =>
									period(
										format(draft.from, 'yyyy-MM-dd'),
										format(draft.to, 'yyyy-MM-dd'),
										t('reports.custom_ranges')
									)
								)}
							</>
						)}
						{menu === 'period' && hint}
					</PopoverContent>
				</Popover>
				<Popover
					onOpenChange={(open) => {
						setMenu(open ? 'scope' : '');
						setLocked('');
					}}
				>
					<PopoverTrigger asChild>
						<Button testID="reports-scope" variant="outline" className="min-h-12 flex-1">
							<ButtonText numberOfLines={1}>
								{directory.registers.find((row) => row.id === scope.registerId)?.name ??
									(scope.registerId ? binding.registerName : t('reports.all_registers'))}
								{(stores?.length ?? 0) > 1
									? ` · ${stores?.find((row) => row.id === scope.storeId)?.name ?? store.name}`
									: ''}
							</ButtonText>
						</Button>
					</PopoverTrigger>
					<PopoverContent>
						{[{ id: '', name: t('reports.all_registers') }, ...directory.registers].map((row) =>
							option(
								`reports-register-${row.id || 'all'}`,
								row.name,
								() =>
									choose(
										{ registerId: row.id },
										row.id === binding.registerId,
										t('reports.other_registers')
									),
								!license?.isPro && row.id !== binding.registerId
							)
						)}
						{(stores?.length ?? 0) > 1 &&
							stores?.map((row) =>
								option(
									`reports-store-${row.id}`,
									row.name ?? '',
									() =>
										choose(
											{
												storeId: row.id,
												registerId: row.id === store.id ? (binding.registerId ?? '') : '',
											},
											row.id === store.id,
											t('reports.other_stores')
										),
									!license?.isPro && row.id !== store.id
								)
							)}
						{menu === 'scope' && hint}
					</PopoverContent>
				</Popover>
				<Popover>
					<PopoverTrigger asChild>
						<Button testID="reports-cashier" variant="outline" className="min-h-12">
							{cashiers?.find((row) => row.id === scope.cashier)?.display_name ??
								t('common.cashier')}
						</Button>
					</PopoverTrigger>
					<PopoverContent>
						{option('reports-cashier-all', t('reports.all_cashiers'), () =>
							choose({ cashier: undefined }, true, '')
						)}
						{cashiers?.map((row) =>
							option(`reports-cashier-${row.id}`, row.display_name ?? '', () =>
								choose({ cashier: row.id }, true, '')
							)
						)}
					</PopoverContent>
				</Popover>
			</View>
		</View>
	);
}
