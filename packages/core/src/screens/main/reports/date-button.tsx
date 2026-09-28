import * as React from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';

import { format, parseISO, subDays } from 'date-fns';

import { Button, ButtonText } from '@wcpos/components/button';
import { Calendar, type DateRange } from '@wcpos/components/calendar';
import { Icon } from '@wcpos/components/icon';
import { Popover, PopoverContent, PopoverTrigger } from '@wcpos/components/popover';
import { Text } from '@wcpos/components/text';
import { HISTORY_DAYS } from '@wcpos/sync-core';

import { useTheme } from '../../../contexts/theme';
import { useT } from '../../../contexts/translations';
import { useAppInfo } from '../../../hooks/use-app-info';
import { useLocalDate } from '../../../hooks/use-local-date';
import {
	calendarDate,
	inZone,
	storeDayBounds,
	useStoreDay,
	zoneOptions,
} from '../../../hooks/use-store-day';
import { ScopeHint } from './bar';

import type { ClosureScope } from './closures/use-closure-rows';

/** The picker's body: a side-by-side row on tablet and desktop, a bounded scroll on phone. */
function PickerBody({
	phone,
	maxHeight,
	children,
}: {
	phone: boolean;
	maxHeight: number;
	children: React.ReactNode;
}) {
	return phone ? (
		<ScrollView style={{ maxHeight }} contentContainerClassName="gap-2">
			{children}
		</ScrollView>
	) : (
		<View className="flex-row">{children}</View>
	);
}

type Props = {
	scope: ClosureScope;
	onScopeChange: (scope: ClosureScope) => void;
	storeId?: number;
	lockedScopeName: string;
	initialLockedPeriod?: boolean;
	initialHistoryLimit?: boolean;
};

export function DateButton({
	scope,
	onScopeChange,
	storeId,
	lockedScopeName,
	initialLockedPeriod = false,
	initialHistoryLimit = false,
}: Props) {
	const t = useT();
	const { formatDate } = useLocalDate();
	const { width, height } = useWindowDimensions();
	const { screenSize } = useTheme();
	const phone = screenSize === 'sm';
	const { license } = useAppInfo();
	const { presets, timezone } = useStoreDay(storeId);
	const [locked, setLocked] = React.useState(initialLockedPeriod ? lockedScopeName : '');
	const [historyLimit, setHistoryLimit] = React.useState(initialHistoryLimit);
	const trigger = React.useRef<React.ComponentRef<typeof PopoverTrigger>>(null);
	const openInitially = initialLockedPeriod || initialHistoryLimit;
	const linkOpen = React.useRef(openInitially);
	// The popover primitive is uncontrolled; a deep link that arrives locked opens it once so
	// the hint is where the cashier is looking.

	React.useEffect(() => {
		if (openInitially) trigger.current?.open();
	}, [openInitially]);
	const [selectingStart, setSelectingStart] = React.useState(scope.from !== scope.to);
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
	const period = (from: string, to: string, name: string) => {
		if (!license?.isPro && (from !== today || to !== today)) {
			setLocked(name);
			return false;
		}
		setLocked('');
		setHistoryLimit(false);
		const start = from < min ? min : from > today ? today : from;
		const end = to < start ? start : to > today ? today : to;
		onScopeChange({ ...scope, from: start, to: end });
		setDraft({ from: parseISO(start), to: parseISO(end) });
		setSelectingStart(start !== end);
		return true;
	};
	const selected = Object.entries(ranges).find(
		([, range]) =>
			day(range.from) === scope.from && (day(range.to) > today ? today : day(range.to)) === scope.to
	)?.[0] as keyof typeof labels | undefined;
	const date = (value: string, pattern: string) =>
		formatDate(
			inZone(timezone, storeDayBounds(calendarDate(parseISO(value)), timezone).from),
			pattern
		);
	// Phone: the calendar column is the sheet's content width (window minus the sheet's p-2),
	// and seven days plus the calendar's own 5-pt side padding must fit it: 44-pt days from
	// 360 pt up, smaller only on narrower phones (302 pt at 320 → 42-pt days).
	// A window without a measured width (jsdom) keeps the 44-pt days.
	const calendarWidth = Math.min(360, (width || 360) - (phone ? 16 : 0)) - 2;
	const daySize = Math.max(36, Math.min(44, Math.floor((calendarWidth - 10) / 7)));
	// Phone: the body scrolls inside what the 92%-high sheet leaves after the footer and,
	// when a lock is showing, the hint with See Pro; no floor, so a rotated phone still fits.
	const bodyMaxHeight = Math.max(96, height * 0.92 - 80 - (locked || historyLimit ? 104 : 0));
	const dates =
		selected === 'thisMonth' || selected === 'lastMonth'
			? date(scope.from, 'MMMM')
			: scope.from === scope.to
				? date(scope.from, 'EEE d MMM')
				: `${date(scope.from, scope.from.slice(0, 7) === scope.to.slice(0, 7) ? 'd' : 'd MMM')}–${date(scope.to, 'd MMM')}`;
	return (
		<Popover
			onOpenChange={(value) => {
				if (value) {
					setDraft({ from: parseISO(scope.from), to: parseISO(scope.to) });
					setSelectingStart(scope.from !== scope.to);
					// A locked deep link opens the picker to show its hint; only a cashier's own tap clears it.
					if (!linkOpen.current) setLocked('');
					linkOpen.current = false;
				}
			}}
		>
			<PopoverTrigger ref={trigger} asChild>
				<Button
					testID="reports-period"
					variant="ghost"
					className="min-h-12 min-w-0 shrink flex-row items-center gap-1 px-1"
				>
					<ButtonText numberOfLines={1} className="min-w-0 shrink">
						{selected && <Text className="font-semibold">{labels[selected]} · </Text>}
						<Text className="text-muted-foreground font-normal">{dates}</Text>
					</ButtonText>
					{!license?.isPro && <Icon name="lock" className="text-muted-foreground" />}
					<Icon name="chevronDown" className="text-muted-foreground" />
				</Button>
			</PopoverTrigger>
			<PopoverContent
				testID="reports-period-menu"
				className="p-0"
				// Tablet and desktop: the 192-pt preset column beside the 360-pt calendar, plus borders.
				style={{ width: phone ? Math.min(360, width) : Math.min(556, width) }}
			>
				{/* On a short phone the stacked body scrolls inside the sheet; the footer and the hint stay reachable below it. */}
				<PickerBody phone={phone} maxHeight={bodyMaxHeight}>
					<View className={phone ? 'flex-row flex-wrap gap-2 p-2' : 'w-48 shrink-0 p-2'}>
						{Object.entries(ranges).map(([key, range]) => (
							<Button
								key={key}
								testID={`reports-period-${key}`}
								variant="ghost"
								className={`min-h-12 flex-row justify-start gap-2 px-3 ${phone ? 'grow rounded-full' : ''} ${selected === key ? 'bg-muted' : ''} ${!license?.isPro && key !== 'today' ? 'opacity-50' : ''}`}
								onPress={() => period(day(range.from), day(range.to), lockedScopeName)}
							>
								<View className="w-5 items-center">
									{selected === key && <Icon name="check" size="sm" />}
								</View>
								<ButtonText numberOfLines={1} className="min-w-0 flex-1 text-left">
									{labels[key as keyof typeof labels]}
								</ButtonText>
								{!license?.isPro && key !== 'today' && (
									<Icon name="lock" size="sm" className="text-muted-foreground" />
								)}
							</Button>
						))}
					</View>
					{/* On phone the sheet is full width with its own p-2, so the calendar fits inside that. */}
					<View className="self-center" style={{ width: calendarWidth }}>
						<Calendar
							testID="reports-calendar"
							minDate={license?.isPro ? min : today}
							maxDate={today}
							// Free: earlier days stay drawn as out of range, but their presses must reach the
							// handler below to show the hint; the calendar swallows them otherwise.
							allowSelectionOutOfRange={!license?.isPro}
							dateRange={draft}
							onDateRangeChange={setDraft}
							theme={{
								...({
									'stylesheet.day.basic': {
										base: { width: daySize, height: daySize, alignItems: 'center' },
									},
								} as Record<string, unknown>),
							}}
							{...(!license?.isPro
								? {
										onDayPress: ({ dateString }: { dateString: string }) => {
											if (dateString !== today) {
												setLocked(lockedScopeName);
												return;
											}
											setDraft({ from: parseISO(today), to: parseISO(today) });
										},
									}
								: selectingStart
									? {
											onDayPress: ({ dateString }: { dateString: string }) => {
												if (dateString < min || dateString > today) return;
												const date = parseISO(dateString);
												setDraft({ from: date, to: date });
												setSelectingStart(false);
											},
										}
									: {})}
						/>
					</View>
				</PickerBody>
				<View className="border-border flex-row items-center gap-2 border-t p-2">
					<Text className="text-muted-foreground flex-1">{t('reports.tap_a_day')}</Text>
					<Button
						testID="reports-period-apply"
						className="min-h-12"
						onPress={() => {
							if (
								period(
									format(draft.from, 'yyyy-MM-dd'),
									format(draft.to, 'yyyy-MM-dd'),
									t('reports.custom_ranges')
								)
							)
								trigger.current?.close();
						}}
					>
						{t('common.done')}
					</Button>
				</View>
				<ScopeHint locked={locked} historyLimit={historyLimit} />
			</PopoverContent>
		</Popover>
	);
}
