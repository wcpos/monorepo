import * as React from 'react';

import { RadioGroup, RadioGroupOption } from '@wcpos/components/radio-group';
import { VStack } from '@wcpos/components/vstack';

import { RefundDestination } from '../../hooks/payment-gateway-contract';

interface Option {
	value: RefundDestination;
	label: string;
	description?: string;
	enabled: boolean;
	testID: string;
}

export function RefundDestinationRadioGroup({
	value,
	onValueChange,
	options,
}: {
	value: RefundDestination;
	onValueChange: (value: RefundDestination) => void;
	options: Option[];
}) {
	return (
		<RadioGroup value={value} onValueChange={(next) => onValueChange(next as RefundDestination)}>
			<VStack space="sm">
				{options.map((option) => (
					<RadioGroupOption
						key={option.value}
						value={option.value}
						label={option.label}
						description={option.description}
						disabled={!option.enabled}
						testID={option.testID}
					/>
				))}
			</VStack>
		</RadioGroup>
	);
}
