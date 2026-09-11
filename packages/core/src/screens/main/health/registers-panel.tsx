import * as React from 'react';

import { Button, ButtonText } from '@wcpos/components/button';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';

import { useT } from '../../../contexts/translations';
import { formatSkewMagnitude } from '../logs/logs-logic';
import { Pill } from './components/pill';
import { Section } from './components/section';
import { useRegisterHealth } from './use-register-health';

export function RegistersPanel() {
	const t = useT();
	const { data, loading, error, refresh } = useRegisterHealth();
	return (
		<Section title={t('health.registers.title')} testID="health-registers">
			<Button
				variant="outline"
				size="sm"
				testID="health-registers-refresh"
				disabled={loading}
				onPress={() => void refresh()}
				className="self-start"
			>
				<ButtonText>{t('health.registers.refresh')}</ButtonText>
			</Button>
			{loading ? (
				<Text className="text-muted-foreground text-sm">{t('common.loading')}</Text>
			) : null}
			{error !== null ? (
				<Text testID="health-registers-error" className="text-destructive text-sm">
					{t('health.registers.error', { error })}
				</Text>
			) : null}
			{data?.registers.map((register) => (
				<VStack key={register.id} testID={`health-register-${register.id}`} className="gap-2">
					<Text className="font-medium">{register.name}</Text>
					<Text className="text-muted-foreground text-sm">
						{t('health.registers.summary', {
							n: register.orders,
							days: data.window_days,
							first: register.first_counter ?? '—',
							last: register.last_counter ?? '—',
						})}
					</Text>
					{register.gaps.length > 0 ? (
						<VStack className="gap-1">
							<Text className="text-sm font-semibold">{t('health.registers.gaps')}</Text>
							{register.gaps.map((gap) => (
								<Text key={gap.after} testID="health-register-gap" className="text-sm">
									{t('health.registers.gap', gap)}
								</Text>
							))}
						</VStack>
					) : null}
					{register.duplicates.length > 0 ? (
						<VStack className="gap-1">
							<Text className="text-sm font-semibold">{t('health.registers.duplicates')}</Text>
							{register.duplicates.map((duplicate) => (
								<Text
									key={duplicate.counter}
									testID="health-register-duplicate"
									className="text-sm"
								>
									{t('health.registers.duplicate', {
										counter: duplicate.counter,
										orders: duplicate.order_numbers.join(', '),
									})}
								</Text>
							))}
						</VStack>
					) : null}
					{register.skew.length > 0 ? (
						<VStack className="gap-1">
							<Text className="text-sm font-semibold">{t('health.registers.clock')}</Text>
							{register.skew.map((skew) => (
								<Text key={skew.order_id} testID="health-register-skew" className="text-sm">
									{t('health.registers.skew', {
										order: skew.order_number,
										device: skew.sale_time.replace('T', ' ').slice(0, 16),
										received: skew.received_gmt.replace('T', ' ').slice(0, 16),
										magnitude: formatSkewMagnitude(skew.skew_seconds),
										direction:
											skew.direction === 'behind'
												? t('health.registers.behind')
												: t('health.registers.ahead'),
									})}
								</Text>
							))}
							<Text className="text-muted-foreground text-xs">
								{t('health.registers.clock_help')}
							</Text>
						</VStack>
					) : null}
					{register.gaps.length + register.duplicates.length + register.skew.length === 0 ? (
						<Pill tone="success" className="self-start">
							{t('health.registers.clean')}
						</Pill>
					) : null}
				</VStack>
			))}
			{data && data.unregistered.length > 0 ? (
				<VStack testID="health-unregistered" className="gap-1">
					<Text className="text-sm font-semibold">{t('health.registers.unregistered')}</Text>
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
		</Section>
	);
}
