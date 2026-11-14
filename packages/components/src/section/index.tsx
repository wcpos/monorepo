import * as React from 'react';

import { HStack } from '../hstack';
import { cn } from '../lib/utils';
import { Text } from '../text';
import { VStack } from '../vstack';

/**
 * Line-separated Store health section: hairline on top, plain title, muted
 * sub — never a boxed card. An `action` sits at the right of the header row.
 */
export function Section({
	title,
	sub,
	action,
	first = false,
	children,
	testID,
}: {
	title: string;
	sub?: string;
	action?: React.ReactNode;
	first?: boolean;
	children: React.ReactNode;
	testID?: string;
}) {
	return (
		<VStack testID={testID} className={cn('gap-3', first ? '' : 'border-border border-t pt-4')}>
			<HStack className="items-start justify-between gap-3">
				<VStack className="flex-1 gap-0.5">
					<Text variant="section">{title}</Text>
					{sub ? <Text variant="help">{sub}</Text> : null}
				</VStack>
				{action}
			</HStack>
			{children}
		</VStack>
	);
}
