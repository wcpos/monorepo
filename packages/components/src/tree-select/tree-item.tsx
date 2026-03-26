import * as React from 'react';
import { Pressable, View } from 'react-native';

import { Icon } from '../icon';
import { cn } from '../lib/utils';

import type { FlatTreeItem } from '../lib/use-hierarchy';

const INDENT_PX = 16;

interface TreeItemRowProps {
	item: FlatTreeItem<any>;
	onToggle: (id: string) => void;
	children: React.ReactNode;
	className?: string;
}

function TreeItemRow({ item, onToggle, children, className }: TreeItemRowProps) {
	const handleToggle = React.useCallback(() => {
		onToggle(item.value);
	}, [onToggle, item.value]);

	return (
		<View className={cn('flex flex-row items-center', className)}>
			<View style={{ width: item.depth * INDENT_PX }} />
			{item.hasChildren ? (
				<Pressable
					onPress={handleToggle}
					className="h-6 w-6 items-center justify-center"
					hitSlop={4}
				>
					<Icon
						name={item.isExpanded ? 'chevronDown' : 'chevronRight'}
						size="xs"
						className="text-muted-foreground"
					/>
				</Pressable>
			) : (
				<View className="w-6" />
			)}
			{children}
		</View>
	);
}

export { TreeItemRow, INDENT_PX };
export type { TreeItemRowProps };
