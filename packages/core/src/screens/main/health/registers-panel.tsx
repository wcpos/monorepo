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
	registerState,
	SERVER_SAMPLE_LIMIT,
	shortTill,
	unknownSessionSales,
} from './registers-logic';
import { useRegisterHealth } from './use-register-health';

import type { RegisterCheck, RegisterReport, RegisterSkew } from './registers-logic';

type T = ReturnType<typeof useT>;

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
			{t('health.registers.skew', {
				order: skew.order_number,
				device: formatStampedTime(skew.sale_time),
				received: `${formatStampedTime(skew.received_gmt)} UTC`,
				magnitude: formatSkewMagnitude(skew.skew_seconds),
				direction:
					skew.direction === 'behind' ? t('health.registers.behind') : t('health.registers.ahead'),
			})}
		</Text>
	);
}

function CheckView({ check }: { check: RegisterCheck }) {
	const t = useT();
	const testID = `health-register-check-${check.kind}`;
	switch (check.kind) {
		case 'gaps':
			if (!check.failing) {
				return (
					<CheckRow attention={false} testID={testID} title={t('health.registers.gaps_pass')} />
				);
			}
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
							{t('health.registers.gap_row', { ...gap, till: shortTill(gap.till) })}
						</Text>
					))}
				</CheckRow>
			);
		case 'duplicates':
			if (!check.failing) {
				return (
					<CheckRow
						attention={false}
						testID={testID}
						title={t('health.registers.duplicates_pass')}
					/>
				);
			}
			return (
				<CheckRow
					attention
					testID={testID}
					title={t('health.registers.duplicates_title', { count: check.groups.length })}
					sub={t('health.registers.duplicates_sub')}
				>
					{check.groups.flatMap((group) =>
						group.duplicates.map((duplicate, index) => (
							<VStack
								key={`${group.till}:${duplicate.counter}:${index}`}
								testID="health-register-duplicate"
								className="gap-0.5"
							>
								<Text className="text-sm">
									{t(
										duplicate.order_ids.length >= SERVER_SAMPLE_LIMIT
											? 'health.registers.duplicate_row_many'
											: 'health.registers.duplicate_row',
										{
											till: shortTill(group.till),
											count: duplicate.order_ids.length,
											counter: duplicate.counter,
										}
									)}
								</Text>
								<Text className="text-muted-foreground text-xs">
									{t('health.registers.duplicate_orders', {
										orders: duplicate.order_numbers.join(', '),
									})}
								</Text>
							</VStack>
						))
					)}
				</CheckRow>
			);
		case 'clock':
			if (check.failing) {
				return (
					<CheckRow
						attention
						testID={testID}
						title={t('health.registers.clock_title', { count: check.ahead.length })}
						sub={t('health.registers.clock_sub')}
					>
						{check.ahead.map((skew) => skewRow(t, skew))}
					</CheckRow>
				);
			}
			return (
				<CheckRow
					attention={false}
					testID={testID}
					title={t('health.registers.clock_pass')}
					sub={
						check.behind.length > 0
							? t('health.registers.clock_behind', { count: check.behind.length })
							: undefined
					}
				>
					{check.behind.length > 0 ? check.behind.map((skew) => skewRow(t, skew)) : null}
				</CheckRow>
			);
		case 'closures': {
			if (!check.failing) {
				return (
					<CheckRow attention={false} testID={testID} title={t('health.registers.closures_pass')} />
				);
			}
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
							{t('health.registers.closure_gap_row', gap)}
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
					<Text className="text-muted-foreground text-xs">{register.id.slice(0, 8)}</Text>
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
				state.checks.map((check) => <CheckView key={check.kind} check={check} />)
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
					{data.unregistered.map((till) => (
						<Text key={till.register_id} className="text-sm">
							{t('health.registers.unregistered_row', {
								id: till.register_id.slice(0, 8),
								n: till.orders,
								orders: till.order_numbers.join(', '),
							})}
						</Text>
					))}
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
