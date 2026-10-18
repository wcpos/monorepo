import * as React from 'react';

import { Button, ButtonText } from '@wcpos/components/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@wcpos/components/collapsible';
import { HStack } from '@wcpos/components/hstack';
import { Icon } from '@wcpos/components/icon';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';

import { useT } from '../../../contexts/translations';
import { formatSkewMagnitude } from '../logs/logs-logic';
import { Section } from './components/section';
import {
	duplicateSales,
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
 */
function CheckRow({
	attention,
	title,
	sub,
	testID,
	children,
}: {
	attention: boolean;
	title: string;
	sub?: string;
	testID: string;
	children?: React.ReactNode;
}) {
	const glyph = (
		<Icon
			name={attention ? 'triangleExclamation' : 'circleCheck'}
			variant={attention ? 'warning' : 'success'}
		/>
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

function skewRow(t: T, skew: RegisterSkew) {
	return (
		<Text key={skew.order_id} testID="health-register-skew" className="text-sm">
			{t(skew.order_number === '' ? 'health.registers.skew_deleted' : 'health.registers.skew', {
				order: skew.order_number,
				id: skew.order_id,
				device: formatStampedTime(skew.sale_time),
				received: `${formatStampedTime(skew.received_gmt)} UTC`,
				magnitude: formatSkewMagnitude(skew.skew_seconds),
				direction:
					skew.direction === 'behind' ? t('health.registers.behind') : t('health.registers.ahead'),
			})}
		</Text>
	);
}

function CheckView({ check, registerId }: { check: RegisterCheck; registerId: string }) {
	const t = useT();
	const testID = `health-register-check-${check.kind}`;
	if (!check.failing) {
		// Only the clock has something to show when it passes: sales received late.
		const behind = check.kind === 'clock' ? check.behind : [];
		return (
			<CheckRow
				attention={false}
				testID={testID}
				title={t(PASS_TITLE[check.kind])}
				sub={
					check.kind === 'clock' && behind.length > 0
						? t('health.registers.clock_behind', { count: check.behindCount })
						: undefined
				}
			>
				{behind.length > 0 ? behind.map((skew) => skewRow(t, skew)) : null}
			</CheckRow>
		);
	}
	switch (check.kind) {
		case 'gaps':
			return (
				<CheckRow
					attention
					testID={testID}
					title={t('health.registers.gaps_title', {
						missing: t('health.registers.gaps_count', { count: check.missing }),
						tills: t('health.registers.till_count', { count: check.tills }),
					})}
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
					title={t('health.registers.duplicates_title', { count: check.tills })}
					sub={t('health.registers.duplicates_sub')}
				>
					{check.rows.map((duplicate, index) => {
						const orders = orderNumberList(duplicate.order_numbers);
						const values = {
							till: shortId(duplicate.till),
							count: duplicateSales(duplicate),
							counter: duplicate.counter,
						};
						return (
							<VStack
								key={`${duplicate.till}:${duplicate.counter}:${index}`}
								testID="health-register-duplicate"
								className="gap-0.5"
							>
								<Text className="text-sm">
									{isUnstampedTill(duplicate.till, registerId)
										? t('health.registers.duplicate_row_no_till', values)
										: t('health.registers.duplicate_row', values)}
								</Text>
								{orders !== '' ? (
									<Text className="text-muted-foreground text-xs">
										{t('health.registers.duplicate_orders', { orders })}
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
					title={t('health.registers.clock_title', { count: check.aheadCount })}
					sub={t('health.registers.clock_sub')}
				>
					{check.ahead.map((skew) => skewRow(t, skew))}
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
					sub={t('health.registers.closures_sub')}
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

function RegisterBlock({ register, days }: { register: RegisterReport; days: number }) {
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
						? t('health.registers.no_sales', { days })
						: t('health.registers.sales_counters', {
								count: register.orders,
								first: first ?? '—',
								last: last ?? '—',
							})}
				</Text>
			</HStack>
			{state.kind === 'clean' ? (
				<CheckRow
					attention={false}
					testID="health-register-clean"
					title={t('health.registers.all_passed')}
					sub={
						first !== null && last !== null
							? t('health.registers.in_order', { first, last })
							: undefined
					}
				/>
			) : (
				state.checks.map((check) => (
					<CheckView key={check.kind} check={check} registerId={register.id} />
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
					{t('health.registers.truncated')}
				</Text>
			) : null}
			{loading ? (
				<Text className="text-muted-foreground text-sm">{t('common.loading')}</Text>
			) : null}
			{error !== null ? (
				<Text testID="health-registers-error" className="text-destructive text-sm">
					{t('health.registers.error', { error })}
				</Text>
			) : null}
			{data?.registers.map((register) => (
				<RegisterBlock key={register.id} register={register} days={data.window_days} />
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
