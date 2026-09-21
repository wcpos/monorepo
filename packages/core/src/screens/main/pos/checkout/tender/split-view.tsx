import * as React from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Button, ButtonText } from '@wcpos/components/button';
import { Icon } from '@wcpos/components/icon';
import { Text } from '@wcpos/components/text';

import { evenSplitShareMinor } from './tender-state';
import { useT } from '../../../../../contexts/translations';

import type { TenderPlan } from './tender-state';
import type { TenderFlow } from './use-tender-flow';

type SplitFlow = Pick<
	TenderFlow,
	| 'state'
	| 'dispatch'
	| 'balanceMinor'
	| 'paidMinor'
	| 'dp'
	| 'rows'
	| 'lines'
	| 'linesPaidBy'
	| 'plan'
	| 'busy'
>;

export function SplitView({
	flow,
	format,
	compact,
}: {
	flow: SplitFlow;
	format: (minor: number) => string;
	compact?: boolean;
}) {
	const t = useT();
	const { splitTab: tab, pickedLineIds } = flow.state;
	const balance = flow.balanceMinor;
	const picked = flow.lines.filter(
		(line) => pickedLineIds.includes(line.id) && !flow.linesPaidBy[line.id]
	);
	const sum = picked.reduce((total, line) => total + line.totalMinor, 0);
	const paidCount = flow.lines.filter((line) => flow.linesPaidBy[line.id]).length;
	const setPlan = (plan: TenderPlan) =>
		flow.dispatch({ type: 'set-plan', plan, balanceMinor: balance });
	const fixed = (firstMinor: number, title: string | null = null) =>
		setPlan({ kind: 'fixed', firstMinor, title, from: flow.rows.length });
	const items = (ways: number) =>
		setPlan({
			kind: 'items',
			lineIds: picked.map((line) => line.id),
			firstMinor: sum,
			ways,
			from: flow.rows.length,
		});
	const options =
		tab === 'even'
			? [2, 3, 4, 5, 6]
			: tab === 'percent'
				? [10, 20, 25, 30, 50, 75]
				: [5, 10, 20, 50].filter((value) => value * 10 ** flow.dp < balance);
	const hint =
		tab === 'item' && paidCount
			? t('pos_checkout.items_paid_of', { n: paidCount, total: flow.lines.length })
			: t(
					{
						even: 'pos_checkout.split_even_hint',
						amount: 'pos_checkout.split_amount_hint',
						percent: 'pos_checkout.split_percent_hint',
						item: 'pos_checkout.split_item_hint',
					}[tab]
				);
	return (
		<ScrollView className="bg-sidebar flex-1" contentContainerClassName="items-center gap-4 pb-4">
			<Text className="text-sidebar-foreground/70 text-xs font-semibold tracking-wider uppercase">
				{t(flow.paidMinor > 0 ? 'pos_checkout.split_the_remaining' : 'pos_checkout.split')}
			</Text>
			<Text
				className={`text-sidebar-foreground font-bold tabular-nums ${compact ? 'text-6xl' : 'text-8xl'}`}
			>
				{format(balance)}
			</Text>
			<View className="w-full max-w-2xl gap-4">
				<View className="bg-sidebar-foreground/10 flex-row rounded-2xl p-1">
					{(['even', 'amount', 'percent', 'item'] as const).map((value) => (
						<Button
							key={value}
							variant={tab === value ? 'sidebar-solid' : 'sidebar-quiet'}
							className="h-12 flex-1 rounded-xl px-1"
							testID={`checkout-split-tab-${value}`}
							onPress={() => flow.dispatch({ type: 'set-split-tab', tab: value })}
						>
							<ButtonText>
								{t(
									{
										even: 'pos_checkout.split_even',
										amount: 'pos_checkout.split_amount',
										percent: 'pos_checkout.split_percent',
										item: 'pos_checkout.split_item',
									}[value]
								)}
							</ButtonText>
						</Button>
					))}
				</View>
				{tab === 'item' ? (
					<>
						<View className="gap-2">
							{flow.lines.map((line) => {
								const paid = flow.linesPaidBy[line.id];
								const checked = pickedLineIds.includes(line.id) || Boolean(paid);
								return (
									<Pressable
										key={line.id}
										testID={`checkout-split-item-${line.id}`}
										accessibilityRole="checkbox"
										accessibilityState={{ checked, disabled: Boolean(paid) || flow.busy }}
										disabled={Boolean(paid) || flow.busy}
										onPress={() => flow.dispatch({ type: 'toggle-split-line', lineId: line.id })}
										className={`bg-sidebar-foreground/10 min-h-14 flex-row items-center gap-3 rounded-xl p-3 ${paid ? 'opacity-40' : ''}`}
									>
										<View
											className={`size-5 items-center justify-center rounded border ${checked ? 'bg-success border-success' : 'border-sidebar-border'}`}
										>
											{checked ? (
												<Icon name="check" size="xs" className="text-success-foreground" />
											) : null}
										</View>
										<View className="flex-1">
											<Text className="text-sidebar-foreground font-semibold" decodeHtml>
												{line.name}
											</Text>
											{paid ? (
												<Text className="text-sidebar-foreground/70 text-xs" decodeHtml>
													{t('pos_checkout.line_paid_by', { methods: paid.join(' + ') })}
												</Text>
											) : null}
										</View>
										<Text className="text-sidebar-foreground font-semibold tabular-nums">
											{format(line.totalMinor)}
										</Text>
									</Pressable>
								);
							})}
						</View>
						<Button
							variant="sidebar-solid"
							className="h-14"
							testID="checkout-split-items-go"
							disabled={sum <= 0 || flow.busy}
							onPress={() => items(1)}
						>
							<ButtonText>
								{sum > 0
									? t('pos_checkout.pay_for_these', { amount: format(sum) })
									: t('pos_checkout.tick_items')}
							</ButtonText>
						</Button>
						{sum > 0 ? (
							<View className="flex-row flex-wrap items-center justify-center gap-2">
								<Text className="text-sidebar-foreground/70 text-sm">
									{t('pos_checkout.share_these_between')}
								</Text>
								{[2, 3, 4].map((ways) => (
									<Button
										key={ways}
										variant="sidebar-quiet"
										className="rounded-full"
										size="sm"
										testID={`checkout-split-share-${ways}`}
										disabled={flow.busy}
										onPress={() => items(ways)}
									>
										<ButtonText>
											{t('pos_checkout.share_each', {
												ways,
												amount: format(evenSplitShareMinor(sum, ways)),
											})}
										</ButtonText>
									</Button>
								))}
							</View>
						) : null}
					</>
				) : (
					<View className="flex-row flex-wrap gap-2">
						{options.map((value) => {
							const minor =
								tab === 'even'
									? evenSplitShareMinor(balance, value)
									: tab === 'percent'
										? Math.round((balance * value) / 100)
										: value * 10 ** flow.dp;
							const title =
								tab === 'percent'
									? t('pos_checkout.split_percent_value', { percent: value })
									: null;
							const selected =
								flow.plan?.kind === 'even'
									? tab === 'even' && flow.plan.ways === value
									: flow.plan?.kind === 'fixed' &&
										flow.plan.firstMinor === minor &&
										flow.plan.title === title;
							return (
								<Button
									key={value}
									variant={selected ? 'sidebar-solid' : 'sidebar-quiet'}
									className={`h-24 flex-col gap-1 rounded-2xl ${tab === 'even' && !compact ? 'min-w-20 flex-1' : 'min-w-[30%] grow'}`}
									testID={`checkout-split-option-${value}`}
									disabled={flow.busy || minor <= 0}
									onPress={() =>
										tab === 'even'
											? setPlan({ kind: 'even', ways: value, from: flow.rows.length })
											: fixed(minor, title)
									}
								>
									<ButtonText>
										{tab === 'even'
											? t('pos_checkout.n_ways', { ways: value })
											: (title ?? format(minor))}
									</ButtonText>
									<ButtonText className="opacity-70">
										{tab === 'even'
											? t('pos_checkout.each_amount', { amount: format(minor) })
											: tab === 'amount'
												? t('pos_checkout.then_amount', { amount: format(balance - minor) })
												: format(minor)}
									</ButtonText>
								</Button>
							);
						})}
						{tab === 'amount' ? (
							<>
								<Button
									variant="sidebar-quiet"
									className="h-24 min-w-[30%] grow flex-col gap-1 rounded-2xl"
									testID="checkout-split-option-half"
									onPress={() => fixed(evenSplitShareMinor(balance, 2))}
								>
									<ButtonText>{t('pos_checkout.half')}</ButtonText>
									<ButtonText className="opacity-70">
										{format(evenSplitShareMinor(balance, 2))}
									</ButtonText>
								</Button>
								<Button
									variant="sidebar-quiet"
									className="h-20 w-full flex-col gap-1 rounded-2xl"
									testID="checkout-split-option-custom"
									onPress={() => flow.dispatch({ type: 'arm-custom' })}
								>
									<ButtonText>{t('pos_checkout.type_first_payment')}</ButtonText>
									<ButtonText className="opacity-70">
										{t('pos_checkout.type_first_hint')}
									</ButtonText>
								</Button>
							</>
						) : null}
					</View>
				)}
				<Text className="text-sidebar-foreground/70 text-center text-sm">{hint}</Text>
				{flow.plan ? (
					<Button
						variant="sidebar"
						size="sm"
						testID="checkout-split-none"
						onPress={() => flow.dispatch({ type: 'clear-plan', balanceMinor: balance })}
					>
						<ButtonText className="underline">{t('pos_checkout.no_split')}</ButtonText>
					</Button>
				) : null}
			</View>
		</ScrollView>
	);
}
