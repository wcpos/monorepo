import * as React from 'react';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@wcpos/components/collapsible';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';

interface CollapsibleSectionProps {
	title: string;
	/** Shown in the header while collapsed, so configured state is never hidden. */
	summary: string;
	defaultOpen?: boolean;
	testID?: string;
	children: React.ReactNode;
}

export function CollapsibleSection({
	title,
	summary,
	defaultOpen = false,
	testID,
	children,
}: CollapsibleSectionProps) {
	const [open, setOpen] = React.useState(defaultOpen);

	return (
		<Collapsible open={open} onOpenChange={setOpen} className="border-border rounded-md border">
			<CollapsibleTrigger testID={testID} className="w-full justify-between px-3 py-2">
				<Text className="font-medium">{title}</Text>
				{!open && (
					<Text className="text-muted-foreground ml-auto pr-2 text-sm" numberOfLines={1}>
						{summary}
					</Text>
				)}
			</CollapsibleTrigger>
			<CollapsibleContent>
				<VStack className="gap-4 px-3 pb-3">{children}</VStack>
			</CollapsibleContent>
		</Collapsible>
	);
}
