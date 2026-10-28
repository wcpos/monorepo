import * as React from 'react';

import { HStack } from '../hstack';
import { Text } from '../text';
import { VStack } from '../vstack';

export type KVEntry = { label: string; value: string };

/**
 * Correlation key/value block for expanded log detail: muted labels, mono
 * values, built to be read alongside an exported bundle.
 */
export function KVGrid({ entries, testID }: { entries: KVEntry[]; testID?: string }) {
	return (
		<VStack testID={testID} className="gap-1">
			{entries.map((entry) => (
				<HStack key={entry.label} className="items-baseline gap-3">
					<Text variant="help" className="w-24">
						{entry.label}
					</Text>
					<Text selectable className="flex-1 font-mono text-xs">
						{entry.value}
					</Text>
				</HStack>
			))}
		</VStack>
	);
}
