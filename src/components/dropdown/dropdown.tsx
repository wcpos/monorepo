import * as React from 'react';
import Popover, { PopoverProps } from '../popover';
import Menu from '../menu';
import * as Styled from './styles';

type TextAction = import('../menu/menu').TextAction;

/**
 *
 */
export type DropdownProps = Omit<PopoverProps, 'content'> & {
	/**
	 *
	 */
	items: string[] | TextAction[];
	/**
	 *
	 */
	onSelect?: (value: any) => void;
};

/**
 *
 */
export const Dropdown = ({ children, items, onSelect, style, ...props }: DropdownProps) => {
	return (
		<Popover
			{...props}
			content={<Menu items={items} onSelect={onSelect} />}
			placement="bottom-end"
			style={[{ paddingLeft: 0, paddingRight: 0 }, style]}
		>
			{children}
		</Popover>
	);
};
