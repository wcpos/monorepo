import * as React from 'react';
import { View, Text } from 'react-native';
import { StoryWrapper } from '@storybook/addons';
import { action } from '@storybook/addon-actions';
import { Popover, PopoverProps } from './popover';
import Portal from '../portal';
import { usePopover } from './use-popover';
import Button from '../button';
import Menu from '../menu';

/**
 * Popovers require
 * - Portals
 */
const AppProvider: StoryWrapper = (Story, context) => {
	return (
		<Portal.Provider>
			<Story {...context} />
			<Portal.Manager />
		</Portal.Provider>
	);
};

export default {
	title: 'Components/Popover',
	component: Popover,
	decorators: [AppProvider],
};

export const BasicUsage = (props: PopoverProps) => {
	return (
		<View>
			<Popover
				{...props}
				content={
					<View style={{ backgroundColor: 'white', width: 200, height: 200 }}>
						<Text>Content</Text>
					</View>
				}
			>
				<View style={{ width: 60, height: 60 }}>
					<Text>Trigger</Text>
				</View>
			</Popover>
		</View>
	);
};

export const UsePopover = () => {
	const { ref, open, close } = usePopover();

	return (
		<>
			<Button title="Open Menu" onPress={open} />

			<Popover
				ref={ref}
				content={<Menu onSelect={close} items={['One', 'Two', 'Three', 'Four']} />}
			>
				<Text>Menu</Text>
			</Popover>
		</>
	);
};
