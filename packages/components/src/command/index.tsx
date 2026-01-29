import * as React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { type DialogProps } from '@radix-ui/react-dialog';

import { Dialog, DialogContent } from '../dialog';
import { Input } from '../input';
import { SelectButton } from '../select';

const CommandButton = SelectButton;

interface CommandProps extends React.ComponentPropsWithoutRef<typeof View> {
	children?: React.ReactNode;
}

const Command = React.forwardRef<View, CommandProps>(({ children, ...props }, ref) => (
	<View ref={ref} {...props}>
		{children}
	</View>
));
Command.displayName = 'Command';

interface CommandDialogProps extends DialogProps {
	children?: React.ReactNode;
}

const CommandDialog = ({ children, ...props }: CommandDialogProps) => {
	return (
		<Dialog {...props}>
			<DialogContent>
				<Command>{children}</Command>
			</DialogContent>
		</Dialog>
	);
};
CommandDialog.displayName = 'CommandDialog';

interface CommandInputProps extends React.ComponentPropsWithoutRef<typeof Input> {
	value?: string;
	onValueChange?: (value: string) => void;
}

const CommandInput = React.forwardRef<Input, CommandInputProps>(
	({ value, onValueChange, ...props }, ref) => {
		return (
			<View>
				<Input ref={ref} value={value} onChangeText={onValueChange} clearable {...props} />
			</View>
		);
	}
);
CommandInput.displayName = 'CommandInput';

interface CommandListProps extends React.ComponentPropsWithoutRef<typeof ScrollView> {
	onEndReached?: () => void;
	children?: React.ReactNode;
}

const CommandList = React.forwardRef<ScrollView, CommandListProps>(
	({ onEndReached, children, ...props }, ref) => {
		const handleScroll = React.useCallback(
			(event: any) => {
				const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
				const paddingToBottom = 20;
				const isCloseToBottom =
					layoutMeasurement.height + contentOffset.y >= contentSize.height - paddingToBottom;
				if (isCloseToBottom && onEndReached) {
					onEndReached();
				}
			},
			[onEndReached]
		);

		return (
			<ScrollView ref={ref} onScroll={handleScroll} scrollEventThrottle={400} {...props}>
				{children}
			</ScrollView>
		);
	}
);
CommandList.displayName = 'CommandList';

interface CommandEmptyProps extends React.ComponentPropsWithoutRef<typeof Text> {
	children?: React.ReactNode;
}

const CommandEmpty = React.forwardRef<Text, CommandEmptyProps>(({ children, ...props }, ref) => (
	<Text ref={ref} {...props}>
		{children}
	</Text>
));
CommandEmpty.displayName = 'CommandEmpty';

interface CommandGroupProps extends React.ComponentPropsWithoutRef<typeof View> {
	children?: React.ReactNode;
}

const CommandGroup = React.forwardRef<View, CommandGroupProps>(({ children, ...props }, ref) => (
	<View ref={ref} {...props}>
		{children}
	</View>
));
CommandGroup.displayName = 'CommandGroup';

type CommandSeparatorProps = React.ComponentPropsWithoutRef<typeof View>;

const CommandSeparator = React.forwardRef<View, CommandSeparatorProps>((props, ref) => (
	<View ref={ref} style={[{ height: 1, backgroundColor: '#e5e7eb' }]} {...props} />
));
CommandSeparator.displayName = 'CommandSeparator';

interface CommandItemProps extends React.ComponentPropsWithoutRef<typeof Pressable> {
	children?: React.ReactNode;
	onSelect?: () => void;
}

const CommandItem = React.forwardRef<typeof Pressable, CommandItemProps>(
	({ onSelect, children, ...props }, ref) => {
		return (
			<Pressable ref={ref} onPress={onSelect} {...props}>
				{children}
			</Pressable>
		);
	}
);
CommandItem.displayName = 'CommandItem';

interface CommandShortcutProps extends React.ComponentPropsWithoutRef<typeof Text> {
	children?: React.ReactNode;
}

const CommandShortcut = React.forwardRef<Text, CommandShortcutProps>(
	({ children, ...props }, ref) => (
		<Text ref={ref} {...props}>
			{children}
		</Text>
	)
);
CommandShortcut.displayName = 'CommandShortcut';

// Dummy implementation of useCommandState since we don't have cmdk
const useCommandState = () => {
	return {
		value: '',
		search: '',
		selected: 0,
		items: [],
	};
};

export {
	Command,
	CommandDialog,
	CommandInput,
	CommandList,
	CommandEmpty,
	CommandGroup,
	CommandItem,
	CommandShortcut,
	CommandSeparator,
	CommandButton,
	useCommandState,
};
