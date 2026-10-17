import * as React from 'react';

import { cn } from '@wcpos/components/lib/utils';
import { HStack } from '@wcpos/components/hstack';
import { TABLE_HEAD_TEXT } from '@wcpos/components/table';
import { Text } from '@wcpos/components/text';

/**
 * Hairline-table primitives shared by the Store health tabs: uppercase muted
 * column headings over rows separated by hairlines — no boxed cards. The heading
 * text is the shared table-header recipe (`TABLE_HEAD_TEXT`), never its own.
 */
export function HairlineHeaderRow({
	children,
	className,
	testID,
}: {
	children: React.ReactNode;
	className?: string;
	testID?: string;
}) {
	return (
		<HStack
			testID={testID}
			className={cn('border-border items-center gap-3 border-b pb-1', className)}
		>
			{children}
		</HStack>
	);
}

export function HairlineHeaderCell({
	children,
	className,
	testID,
}: {
	children: React.ReactNode;
	className?: string;
	testID?: string;
}) {
	return (
		<Text testID={testID} className={cn(TABLE_HEAD_TEXT, className)}>
			{children}
		</Text>
	);
}

export function HairlineRow({
	children,
	className,
	testID,
}: {
	children: React.ReactNode;
	className?: string;
	testID?: string;
}) {
	return (
		<HStack
			testID={testID}
			className={cn('border-border/50 items-start gap-3 border-b py-2', className)}
		>
			{children}
		</HStack>
	);
}
