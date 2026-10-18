import { View } from 'react-native';

import { Text } from '../text';
import { Derivation, DerivationStep } from './index';

function Panel({ children }: { children: React.ReactNode }) {
	return <View className="bg-card w-96 p-4">{children}</View>;
}

function Line({ name, value, strong }: { name: string; value: string; strong?: boolean }) {
	const tone = strong ? 'font-semibold' : 'text-muted-foreground';
	return (
		<View className="flex-row items-baseline gap-3">
			<Text className={`flex-1 text-base ${tone} ${strong ? '' : 'pl-3'}`}>{name}</Text>
			<Text className={`w-16 text-right text-base tabular-nums ${tone}`}>{value}</Text>
		</View>
	);
}

export const stories = [
	{
		id: 'default',
		render: () => (
			<Panel>
				<Derivation>
					<DerivationStep label="Calculated from" title="Customer billing address" />
					<DerivationStep
						label="Address on the order"
						title="Edinburgh EH1 1YZ, United Kingdom (UK)"
					/>
					<DerivationStep state="result" label="Rates that match it">
						<View className="mt-1.5 gap-1">
							<Line name="Standard rate" value="22%" strong />
							<Line name="VAT · anywhere in GB" value="20%" />
							<Line name="Edinburgh Levy · city" value="2%" />
						</View>
					</DerivationStep>
				</Derivation>
			</Panel>
		),
	},
	{
		id: 'failed-at-2',
		render: () => (
			<Panel>
				<Derivation>
					<DerivationStep label="Calculated from" title="Customer billing address" />
					<DerivationStep
						state="failed"
						label="No address on the order"
						title="This order has no billing address, so no rate can match"
						detail="Add a customer with an address, or change the setting"
					/>
					<DerivationStep state="quiet" label="Rates that match it" detail="None" />
				</Derivation>
			</Panel>
		),
	},
	{
		id: 'failed-at-3',
		render: () => (
			<Panel>
				<Derivation>
					<DerivationStep label="Calculated from" title="Customer shipping address" />
					<DerivationStep label="Address on the order" title="Reykjavík 101, Iceland" />
					<DerivationStep
						state="failed"
						label="No rate matches it"
						title="The store has no tax rate for Iceland"
						detail="Add one in WooCommerce › Tax, or change the setting"
					/>
				</Derivation>
			</Panel>
		),
	},
];
