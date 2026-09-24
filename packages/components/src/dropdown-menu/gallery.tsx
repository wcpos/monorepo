import * as React from 'react';
import { View } from 'react-native';

import { useRootContext } from '@rn-primitives/dropdown-menu';

import * as C from './index';
import { Text } from '../text';
import { IconButton } from '../icon-button';
import { Icon } from '../icon';
import { DeviceScope } from '../lib/device';
import { cn } from '../lib/utils';
function Panel({ sheet = false }: { sheet?: boolean }) {
	const onOpenChange = React.useRef(useRootContext().onOpenChange);
	// Open the external primitive once for the gallery; these roots are uncontrolled.
	React.useEffect(() => onOpenChange.current(true), []);
	return (
		<View
			className={cn(
				'border-border bg-background relative h-96 w-full overflow-hidden rounded-lg border',
				sheet && '[&>*]:flex-1'
			)}
		>
			<C.DropdownMenuTrigger asChild>
				<IconButton name="ellipsisVertical" aria-label="⋯" testID="order-menu" />
			</C.DropdownMenuTrigger>
			<C.DropdownMenuContent inline align="start" avoidCollisions={false} testID="gallery-menu">
				<C.DropdownMenuLabel>Order</C.DropdownMenuLabel>
				<C.DropdownMenuItem testID="edit">
					<Text>Edit</Text>
				</C.DropdownMenuItem>
				<C.DropdownMenuItem testID="print">
					<Text>Print bill</Text>
					<C.DropdownMenuShortcut>⌘P</C.DropdownMenuShortcut>
				</C.DropdownMenuItem>
				<C.DropdownMenuSeparator />
				<C.DropdownMenuCheckboxItem checked onCheckedChange={() => {}} testID="notes">
					<Text>Show notes</Text>
				</C.DropdownMenuCheckboxItem>
				<C.DropdownMenuRadioGroup value="Newest" onValueChange={() => {}}>
					{['Newest', 'Oldest'].map((value) => (
						<C.DropdownMenuRadioItem key={value} value={value} testID={value}>
							<Text>{value}</Text>
						</C.DropdownMenuRadioItem>
					))}
				</C.DropdownMenuRadioGroup>
				<C.DropdownMenuSeparator />
				<C.DropdownMenuItem variant="destructive" testID="void">
					<Text>Void</Text>
				</C.DropdownMenuItem>
				{sheet && (
					<C.DropdownMenuItem disabled testID="refund">
						<Text>Refund</Text>
						<Icon name="lock" className="text-muted-foreground ml-auto" />
					</C.DropdownMenuItem>
				)}
			</C.DropdownMenuContent>
		</View>
	);
}
export const stories = [
	{
		id: 'menu',
		isolated: true,
		render: () => (
			<C.DropdownMenu>
				<Panel />
			</C.DropdownMenu>
		),
	},
	{
		id: 'sheet',
		isolated: true,
		render: () => (
			<DeviceScope phone>
				<C.DropdownMenu>
					<Panel sheet />
				</C.DropdownMenu>
			</DeviceScope>
		),
	},
];
