import * as React from 'react';
import { View } from 'react-native';

import { useRootContext } from '@rn-primitives/dropdown-menu';

import * as C from './index';
import { Text } from '../text';
import { IconButton } from '../icon-button';
function Panel() {
	const onOpenChange = React.useRef(useRootContext().onOpenChange);
	// Open the external primitive once for the gallery; these roots are uncontrolled.
	React.useEffect(() => onOpenChange.current(true), []);
	return (
		<View className="border-border bg-background relative h-96 w-full overflow-hidden rounded-lg border">
			<C.DropdownMenuTrigger asChild>
				<IconButton name="ellipsisVertical" aria-label="⋯" testID="order-menu" />
			</C.DropdownMenuTrigger>
			<C.DropdownMenuContent inline align="start" testID="gallery-menu">
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
			</C.DropdownMenuContent>
		</View>
	);
}
export const stories = [
	{
		id: 'menu',
		render: () => (
			<C.DropdownMenu>
				<Panel />
			</C.DropdownMenu>
		),
	},
];
