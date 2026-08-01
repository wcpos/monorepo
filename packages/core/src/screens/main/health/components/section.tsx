import * as React from 'react';

import { cn } from '@wcpos/components/lib/utils';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';

/**
 * Line-separated Store health section: hairline on top, plain title, muted
 * sub — never a boxed card.
 */
export function Section({
	title,
	sub,
	first = false,
	children,
	testID,
}: {
	title: string;
	sub?: string;
	first?: boolean;
	children: React.ReactNode;
	testID?: string;
}) {
	return (
		<VStack testID={testID} className={cn('gap-3', first ? '' : 'border-border border-t pt-4')}>
			<VStack className="gap-0.5">
				<Text className="font-semibold">{title}</Text>
				{sub ? <Text className="text-muted-foreground text-xs">{sub}</Text> : null}
			</VStack>
			{children}
		</VStack>
	);
}
