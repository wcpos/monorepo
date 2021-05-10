import * as React from 'react';
import { View } from 'react-native';
import Popover from '../popover';
import Menu from '../menu';
import Text from '../text';

export interface DropdownProps {
	/**
	 *
	 */
	items: any[];
	/**
	 *
	 */
	onSelect: (value: any) => void;
	/**
	 *
	 */
	activator: React.ReactNode;
}

export const Dropdown = ({ items, onSelect, activator }: DropdownProps) => {
	const [open, setOpen] = React.useState(false);
	const show = React.useCallback(() => setOpen(true), []);
	const hide = React.useCallback(() => setOpen(false), []);

	return (
		<View style={{ padding: '300px' }}>
			<Popover
				activator={<Text onPress={show}>{activator}</Text>}
				onRequestClose={hide}
				open={open}
				hideBackdrop
			>
				<Menu items={items} onSelect={onSelect} />
			</Popover>
		</View>
	);
};
