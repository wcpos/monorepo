import * as React from 'react';

import { Button, ButtonText } from '@wcpos/components/button';
import { Notice } from '@wcpos/components/notice';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@wcpos/components/collapsible';
import { HStack } from '@wcpos/components/hstack';
import { Icon } from '@wcpos/components/icon';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';

import { useT } from '../../../contexts/translations';
import { formatSkewMagnitude } from '../logs/logs-logic';
import { Section } from './components/section';
import {
	closuresSupported,
	duplicateSales,
	isExactDuplicateCount,
	isLeadingClosureGap,
	isUnstampedTill,
	orderNumberList,
	registerState,
	shortId,
	unknownSessionSales,
} from './registers-logic';
import { useRegisterHealth } from './use-register-health';

import type { CheckKind, RegisterCheck, RegisterReport, RegisterSkew } from './registers-logic';

type T = ReturnType<typeof useT>;

/** The one title a check shows when it passes. */
const PASS_TITLE: Record<CheckKind, string> = {
	gaps: 'health.registers.gaps_pass',
	duplicates: 'health.registers.duplicates_pass',
	clock: 'health.registers.clock_pass',
	closures: 'health.registers.closures_pass',
};

/** The same, scoped to the newest sales: a truncated report checked only those. */
const PASS_TITLE_SAMPLED: Record<CheckKind, string> = {
	gaps: 'health.registers.gaps_pass_sampled',
	duplicates: 'health.registers.duplicates_pass_sampled',
	clock: 'health.registers.clock_pass_sampled',
	// Closures are not windowed or truncated: the server checks every one.
	closures: 'health.registers.closures_pass',
};

/** A passing check's title; on a truncated report the sale checks claim only the newest sales. */
function passTitleKey(kind: CheckKind, truncated: boolean): string {
	return (truncated ? PASS_TITLE_SAMPLED : PASS_TITLE)[kind];
}

/**
 * The one row a clean register shows. Without closure lists (an older plugin) only the sale
 * checks ran; on a truncated report they ran on the newest sales only.
 */
function cleanTitleKey(closuresChecked: boolean, truncated: boolean): string {
	if (truncated) {
		return closuresChecked
			? 'health.registers.checks_passed_sampled'
			: 'health.registers.sales_checks_passed_sampled';
	}
	return closuresChecked ? 'health.registers.all_passed' : 'health.registers.sales_checks_passed';
}

/**
 * "2026-09-11 00:42 +02:00" from an ISO stamp; the device offset stays visible so a
 * finding reads against the UTC received time without mental arithmetic.
 */
function formatStampedTime(iso: string): string {
	const offset = /(?:Z|[+-]\d{2}:\d{2})$/.exec(iso)?.[0];
	const local = iso.replace('T', ' ').slice(0, 16);
	return offset && offset !== 'Z' ? `${local} ${offset}` : local;
}

/**
 * One check: status glyph, title, optional muted sub. With `children` it is a collapsed
 * disclosure whose trigger carries the chevron; without, a plain row that is not pressable.
 * `neutral` is a row that can neither pass nor fail (an info glyph, never the green check).
 */
function CheckRow({
	attention,
	neutral = false,
	title,
	sub,
	testID,
	children,
}: {
	attention: boolean;
	neutral?: boolean;
	title: string;
	sub?: string;
	testID: string;
	children?: React.ReactNode;
}) {
	const glyph = attention ? (
		<Icon name="warning" variant="warning" />
	) : neutral ? (
		<Icon name="info" variant="muted" />
	) : (
		<Icon name="confirmed" variant="ok" />
	);
	const lines = (
		<VStack className="flex-1 gap-0.5">
			<Text className="text-sm font-medium">{title}</Text>
			{sub ? <Text className="text-muted-foreground text-xs">{sub}</Text> : null}
		</VStack>
	);
	if (!children) {
		return (
			<HStack testID={testID} className="min-h-ctl items-start gap-3 py-2">
				{glyph}
				{lines}
			</HStack>
		);
	}
	return (
		<Collapsible testID={testID} className="gap-0">
			<CollapsibleTrigger testID={`${testID}-trigger`} className="min-h-ctl items-start gap-3 py-2">
				{glyph}
				{lines}
			</CollapsibleTrigger>
			<CollapsibleContent>
				<VStack className="gap-1 pb-2 pl-8">{children}</VStack>
			</CollapsibleContent>
		</Collapsible>
	);
}

function skewRow(t: T, skew: RegisterSkew, registerId: string) {
	const row = t(
		skew.order_number === '' ? 'health.registers.skew_deleted' : 'health.registers.skew',
		{
			order: skew.order_number,
			id: skew.order_id,
			device: formatStampedTime(skew.sale_time),
			received: `${formatStampedTime(skew.received_gmt)} UTC`,
			magnitude: formatSkewMagnitude(skew.skew_seconds),
			direction:
				skew.direction === 'behind' ? t('health.registers.behind') : t('health.registers.ahead'),
		}
	);
	// An older plugin sends no till, so the row names none.
	let text = row;
	if (skew.till !== undefined) {
		text = isUnstampedTill(skew.till, registerId)
			? t('health.registers.skew_no_till', { row })
			: t('health.registers.skew_with_till', { till: shortId(skew.till), row });
	}
	return (
		<Text key={skew.order_id} testID="health-register-skew" className="text-sm">
			{text}
		</Text>
	);
}

/**
 * One direction's skew rows. With `skew_counts` the server caps each direction, so when the
 * total is larger than the rows sent, the list says how many it shows.
 */
function skewRows(
	t: T,
	rows: readonly RegisterSkew[],
	total: number,
	counted: boolean,
	registerId: string
) {
	return (
		<>
			{rows.map((skew) => skewRow(t, skew, registerId))}
			{counted && total > rows.length ? (
				<Text testID="health-register-skew-sample-note" className="text-muted-foreground text-xs">
					{t('health.registers.skew_sample_note', { count: total, shown: rows.length })}
				</Text>
			) : null}
		</>
	);
}

function CheckView({
	check,
	registerId,
	days,
	truncated,
}: {
	check: RegisterCheck;
	registerId: string;
	days: number;
	truncated: boolean;
}) {
	const t = useT();
	const testID = `health-register-check-${check.kind}`;
	if (check.kind === 'clock' && check.sampled && !check.failing) {
		// An older plugin's skew is one capped sample across both directions: behind rows can
		// hide an ahead one, so with no ahead row the check neither passes nor fails; it shows
		// what it has. (An ahead row in the sample fails below, its count a lower bound.)
		return (
			<CheckRow
				attention={false}
				neutral
				testID={testID}
				title={t('health.registers.clock_sampled')}
				sub={t('health.registers.clock_sampled_sub')}
			>
				{check.behind.map((skew) => skewRow(t, skew, registerId))}
			</CheckRow>
		);
	}
	if (!check.failing) {
		// Only the clock has rows to show when it passes: sales received late. A late sale
		// is usually an offline one, but the payload cannot rule out a clock running behind,
		// so that row does not claim the clocks agree.
		const behind = check.kind === 'clock' ? check.behind : [];
		const title =
			behind.length > 0
				? 'health.registers.clock_pass_behind'
				: passTitleKey(check.kind, truncated);
		let sub: string | undefined;
		if (check.kind === 'clock' && behind.length > 0) {
			sub = t('health.registers.clock_behind', { count: check.behindCount });
		} else if (check.kind === 'closures') {
			// Closures are not windowed; the section sub's "last N days" does not cover them.
			sub = t('health.registers.closures_scope', { days });
		}
		return (
			<CheckRow attention={false} testID={testID} title={t(title)} sub={sub}>
				{check.kind === 'clock' && behind.length > 0
					? skewRows(t, behind, check.behindCount, check.counted, registerId)
					: null}
			</CheckRow>
		);
	}
	switch (check.kind) {
		case 'gaps':
			return (
				<CheckRow
					attention
					testID={testID}
					title={
						// Every gap on sales without a till stamp: there is no till to count.
						check.tills === 0
							? t('health.registers.gaps_title_no_till', {
									missing: t('health.registers.gaps_count', { count: check.missing }),
								})
							: t('health.registers.gaps_title', {
									missing: t('health.registers.gaps_count', { count: check.missing }),
									tills: t('health.registers.till_count', { count: check.tills }),
								})
					}
					sub={t('health.registers.gaps_sub')}
				>
					{check.rows.map((gap, index) => (
						<Text
							key={`${gap.till}:${gap.after}:${index}`}
							testID="health-register-gap"
							className="text-sm"
						>
							{isUnstampedTill(gap.till, registerId)
								? t('health.registers.gap_row_no_till', gap)
								: t('health.registers.gap_row', { ...gap, till: shortId(gap.till) })}
						</Text>
					))}
				</CheckRow>
			);
		case 'duplicates':
			return (
				<CheckRow
					attention
					testID={testID}
					title={
						check.tills === 0
							? t('health.registers.duplicates_title_no_till')
							: t('health.registers.duplicates_title', { count: check.tills })
					}
					sub={t('health.registers.duplicates_sub')}
				>
					{check.rows.map((duplicate, index) => {
						const orders = orderNumberList(duplicate.order_numbers);
						const values = {
							till: shortId(duplicate.till),
							count: duplicateSales(duplicate),
							counter: duplicate.counter,
						};
						// Without the server's count the capped sample is only a lower bound.
						const exact = isExactDuplicateCount(duplicate);
						const key = isUnstampedTill(duplicate.till, registerId)
							? exact
								? 'health.registers.duplicate_row_no_till'
								: 'health.registers.duplicate_row_no_till_atleast'
							: exact
								? 'health.registers.duplicate_row'
								: 'health.registers.duplicate_row_atleast';
						return (
							<VStack
								key={`${duplicate.till}:${duplicate.counter}:${index}`}
								testID="health-register-duplicate"
								className="gap-0.5"
							>
								<Text className="text-sm">{t(key, values)}</Text>
								{orders !== '' ? (
									<Text className="text-muted-foreground text-xs">
										{t(
											// The ids are a capped sample whenever the true count is unknown or larger.
											!exact || duplicateSales(duplicate) > duplicate.order_ids.length
												? 'health.registers.duplicate_orders_sample'
												: 'health.registers.duplicate_orders',
											{ orders }
										)}
									</Text>
								) : null}
							</VStack>
						);
					})}
				</CheckRow>
			);
		case 'clock':
			return (
				<CheckRow
					attention
					testID={testID}
					title={
						// Without skew_counts the ahead rows are from a capped sample: a lower bound.
						check.counted
							? t('health.registers.clock_title', { count: check.aheadCount })
							: t('health.registers.clock_title_atleast', { count: check.aheadCount })
					}
					sub={t('health.registers.clock_sub')}
				>
					{skewRows(t, check.ahead, check.aheadCount, check.counted, registerId)}
				</CheckRow>
			);
		case 'closures': {
			const parts = [
				check.gaps.length > 0 ? t('health.registers.closure_gaps', { count: check.missing }) : null,
				check.conflicts.length > 0
					? t('health.registers.closure_conflicts', { count: check.conflicts.length })
					: null,
				check.mismatches.length > 0
					? t('health.registers.closure_mismatches', { count: check.mismatches.length })
					: null,
			].filter((part): part is string => part !== null);
			return (
				<CheckRow
					attention
					testID={testID}
					title={parts.join(' · ')}
					sub={t('health.registers.closures_sub', { days })}
				>
					{check.gaps.map((gap, index) => (
						<Text
							key={`gap:${gap.after}:${index}`}
							testID="health-register-closure"
							className="text-sm"
						>
							{isLeadingClosureGap(gap)
								? t('health.registers.closure_gap_leading', {
										count: gap.missing,
										last: gap.before - 1,
									})
								: t('health.registers.closure_gap_row', gap)}
						</Text>
					))}
					{check.conflicts.map((conflict) => (
						<Text
							key={`conflict:${conflict.id}`}
							testID="health-register-closure"
							className="text-sm"
						>
							{t('health.registers.closure_conflict_row', conflict)}
						</Text>
					))}
					{check.mismatches.map((mismatch) => (
						<Text
							key={`mismatch:${mismatch.id}`}
							testID="health-register-closure"
							className="text-sm"
						>
							{t('health.registers.closure_mismatch_row', { number: mismatch.number })}
						</Text>
					))}
				</CheckRow>
			);
		}
	}
}

function RegisterBlock({
	register,
	days,
	truncated,
}: {
	register: RegisterReport;
	days: number;
	/** The server checked only the newest sales, so a clean register is clean for those only. */
	truncated: boolean;
}) {
	const t = useT();
	const state = registerState(register);
	const { first_counter: first, last_counter: last } = register;
	return (
		<VStack testID={`health-register-${register.id}`} className="gap-1">
			<HStack className="flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
				<HStack className="items-baseline gap-2">
					<Text className="font-medium">{register.name}</Text>
					<Text className="text-muted-foreground text-xs">{shortId(register.id)}</Text>
				</HStack>
				<Text className="text-muted-foreground text-xs">
					{register.orders === 0
						? truncated
							? t('health.registers.no_sales_sampled')
							: t('health.registers.no_sales', { days })
						: t(
								// A truncated report counted only the sales it checked, not the window.
								truncated
									? 'health.registers.sales_counters_sampled'
									: 'health.registers.sales_counters',
								{ count: register.orders, first: first ?? '—', last: last ?? '—' }
							)}
				</Text>
			</HStack>
			{state.kind === 'clean' ? (
				<CheckRow
					attention={false}
					testID="health-register-clean"
					title={t(cleanTitleKey(state.closuresChecked, truncated))}
					sub={
						truncated
							? t('health.registers.checks_passed_sampled_sub')
							: first !== null && last !== null
								? t('health.registers.in_order', { first, last })
								: undefined
					}
				/>
			) : (
				state.checks.map((check) => (
					<CheckView
						key={check.kind}
						check={check}
						registerId={register.id}
						days={days}
						truncated={truncated}
					/>
				))
			)}
		</VStack>
	);
}

export function RegistersPanel() {
	const t = useT();
	const { data, loading, error, refresh } = useRegisterHealth();
	const unknownSales = data ? unknownSessionSales(data.unknown_sessions) : 0;
	return (
		<Section
			title={t('health.registers.title')}
			sub={data ? t('health.registers.sub', { days: data.window_days }) : undefined}
			action={
				<Button
					variant="outline"
					size="sm"
					testID="health-registers-refresh"
					disabled={loading}
					onPress={() => void refresh()}
				>
					<ButtonText>{t('health.registers.refresh')}</ButtonText>
				</Button>
			}
			testID="health-registers"
		>
			{data?.truncated ? (
				<Text testID="health-registers-truncated" className="text-muted-foreground text-xs">
					{t(
						// The "closures are checked in full" clause holds only if the plugin audits them.
						closuresSupported(data.registers)
							? 'health.registers.truncated'
							: 'health.registers.truncated_sales_only'
					)}
				</Text>
			) : null}
			{loading ? (
				<Text className="text-muted-foreground text-sm">{t('common.loading')}</Text>
			) : null}
			{error !== null ? (
				<Notice
					testID="health-registers-error"
					tone="bad"
					title={t('health.registers.error', { error })}
				/>
			) : null}
			{data?.registers.map((register) => (
				<RegisterBlock
					key={register.id}
					register={register}
					days={data.window_days}
					truncated={data.truncated}
				/>
			))}
			{data && data.unregistered.length > 0 ? (
				<VStack testID="health-unregistered" className="gap-1">
					<Text className="font-medium">{t('health.registers.unregistered_title')}</Text>
					<Text className="text-muted-foreground text-xs">
						{t('health.registers.unregistered_sub')}
					</Text>
					{data.unregistered.map((till) => {
						const orders = orderNumberList(till.order_numbers);
						const values = { id: shortId(till.register_id), count: till.orders, orders };
						return (
							<Text key={till.register_id} testID="health-unregistered-row" className="text-sm">
								{orders !== ''
									? t('health.registers.unregistered_sales', values)
									: t('health.registers.unregistered_count', values)}
							</Text>
						);
					})}
				</VStack>
			) : null}
			{unknownSales > 0 ? (
				<Text testID="health-unknown-sessions" className="text-muted-foreground text-xs">
					{t('health.registers.unknown_sessions', { count: unknownSales })}
				</Text>
			) : null}
		</Section>
	);
}
