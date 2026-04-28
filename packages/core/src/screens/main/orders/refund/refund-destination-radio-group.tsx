import * as React from 'react';

import { Label } from '@wcpos/components/label';
import { RadioGroup, RadioGroupItem } from '@wcpos/components/radio-group';
import { Text } from '@wcpos/components/text';
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
					<VStack key={option.value} className={option.enabled ? '' : 'opacity-50'}>
						<Label nativeID={`refund-destination-${option.value}`}>
							<RadioGroupItem
								value={option.value}
								disabled={!option.enabled}
								testID={option.testID}
								aria-labelledby={`refund-destination-${option.value}`}
							/>
							{option.label}
						</Label>
						{option.description ? (
							<Text className="text-muted-foreground text-sm">{option.description}</Text>
						) : null}
					</VStack>
				))}
			</VStack>
		</RadioGroup>
	);
}
