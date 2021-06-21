import * as React from 'react';
import get from 'lodash/get';
import Popover from '../popover';
import Menu from '../menu';
import Text from '../text';
import Pressable from '../pressable';
import Arrow from '../arrow';
import * as Styled from './styles';

type TextAction = import('../menu/menu').TextAction;

/**
 *
 */
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
	activator: React.ReactElement | string;
}

/**
 *
 */
export const Dropdown = ({ items, onSelect, activator }: DropdownProps) => {
	const [open, setOpen] = React.useState(false);
	const show = React.useCallback(() => setOpen(true), []);
	const hide = React.useCallback(() => setOpen(false), []);

	const _activator = React.useMemo(() => {
		// wrap string
		if (typeof activator === 'string') {
			return (
				<Text onPress={show} style={{ alignItems: 'center' }}>
					{activator}
					<Arrow direction={open ? 'up' : 'down'} />
				</Text>
			);
		}
		// special case for icon
		if (React.isValidElement(activator) && get(activator, 'type.name') === 'Icon') {
			// @ts-ignore
			return React.cloneElement(activator, { onPress: show });
		}
		// else wrap in Pressable
		return (
			<Pressable onPress={show} style={{ alignItems: 'center' }}>
				{activator}
				<Arrow direction={open ? 'up' : 'down'} />
			</Pressable>
		);
	}, [activator, open, show]);

	return (
		<Popover
			activator={_activator}
			onRequestClose={hide}
			open={open}
			hideBackdrop
			placement="bottom-end"
			popoverStyle={{ paddingLeft: 0, paddingRight: 0 }}
		>
			<Menu items={items} onSelect={onSelect} />
		</Popover>
	);
};
