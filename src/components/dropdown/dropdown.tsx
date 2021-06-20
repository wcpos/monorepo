import * as React from 'react';
import Popover from '../popover';
import Menu from '../menu';
import Text from '../text';
import Pressable from '../pressable';
import Arrow from '../arrow';
import * as Styled from './styles';

type TextAction = import('../menu/menu').TextAction;

export interface DropdownProps {
	/**
	 *
	 */
	items: string[] | TextAction[];
	/**
	 *
	 */
	onSelect?: (value: any) => void;
	/**
	 *
	 */
	activator: React.ReactNode | string;
}

export const Dropdown = ({ items, onSelect, activator }: DropdownProps) => {
	const [open, setOpen] = React.useState(false);
	const show = React.useCallback(() => setOpen(true), []);
	const hide = React.useCallback(() => setOpen(false), []);

	const _activator =
		typeof activator === 'string' ? (
			<Text onPress={show}>
				{activator}
				<Arrow direction={open ? 'up' : 'down'} />
			</Text>
		) : (
			<Pressable onPress={show}>
				{activator}
				<Arrow direction={open ? 'up' : 'down'} />
			</Pressable>
		);

	return (
		<Popover
			activator={_activator}
			onRequestClose={hide}
			open={open}
			hideBackdrop
			placement="bottom-end"
		>
			<Menu items={items} onSelect={onSelect} />
		</Popover>
	);
};
