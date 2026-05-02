import * as React from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { type DialogProps } from '@radix-ui/react-dialog';

import { Dialog, DialogContent } from '../dialog';
import { Input } from '../input';
import { SelectButton } from '../select';

const CommandButton = SelectButton;

interface CommandProps extends React.ComponentPropsWithoutRef<typeof View> {
	children?: React.ReactNode;
	ref?: React.Ref<View>;
}

function Command({ children, ref, ...props }: CommandProps) {
	return (
		<View ref={ref} {...props}>
			{children}
		</View>
	);
}
Command.displayName = 'Command';

interface CommandDialogProps extends DialogProps {
	children?: React.ReactNode;
}

function CommandDialog({ children, ...props }: CommandDialogProps) {
	return (
		<Dialog {...props}>
			<DialogContent>
				<Command>{children}</Command>
			</DialogContent>
		</Dialog>
	);
}
CommandDialog.displayName = 'CommandDialog';

interface CommandInputProps extends React.ComponentPropsWithoutRef<typeof Input> {
	value?: string;
	onValueChange?: (value: string) => void;
	ref?: React.Ref<TextInput>;
}

function CommandInput({ value, onValueChange, ref, ...props }: CommandInputProps) {
	return (
		<View>
			<Input ref={ref} value={value} onChangeText={onValueChange} clearable {...props} />
		</View>
	);
}
CommandInput.displayName = 'CommandInput';

interface CommandListProps extends React.ComponentPropsWithoutRef<typeof ScrollView> {
	onEndReached?: () => void;
	children?: React.ReactNode;
	ref?: React.Ref<ScrollView>;
}

function CommandList({ onEndReached, children, ref, ...props }: CommandListProps) {
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
CommandList.displayName = 'CommandList';

interface CommandEmptyProps extends React.ComponentPropsWithoutRef<typeof Text> {
	children?: React.ReactNode;
	ref?: React.Ref<Text>;
}

function CommandEmpty({ children, ref, ...props }: CommandEmptyProps) {
	return (
		<Text ref={ref} {...props}>
			{children}
		</Text>
	);
}
CommandEmpty.displayName = 'CommandEmpty';

interface CommandGroupProps extends React.ComponentPropsWithoutRef<typeof View> {
	children?: React.ReactNode;
	ref?: React.Ref<View>;
}

function CommandGroup({ children, ref, ...props }: CommandGroupProps) {
	return (
		<View ref={ref} {...props}>
			{children}
		</View>
	);
}
CommandGroup.displayName = 'CommandGroup';

type CommandSeparatorProps = React.ComponentPropsWithoutRef<typeof View> & {
	ref?: React.Ref<View>;
};

function CommandSeparator({ className, ref, ...props }: CommandSeparatorProps) {
	return <View ref={ref} className={`bg-border h-px ${className ?? ''}`} {...props} />;
}
CommandSeparator.displayName = 'CommandSeparator';

interface CommandItemProps extends React.ComponentPropsWithoutRef<typeof Pressable> {
	children?: React.ReactNode;
	onSelect?: () => void;
	ref?: React.Ref<React.ElementRef<typeof Pressable>>;
}

function CommandItem({ onSelect, children, ref, ...props }: CommandItemProps) {
	return (
		<Pressable ref={ref} onPress={onSelect} {...props}>
			{children}
		</Pressable>
	);
}
CommandItem.displayName = 'CommandItem';

interface CommandShortcutProps extends React.ComponentPropsWithoutRef<typeof Text> {
	children?: React.ReactNode;
	ref?: React.Ref<Text>;
}

function CommandShortcut({ children, ref, ...props }: CommandShortcutProps) {
	return (
		<Text ref={ref} {...props}>
			{children}
		</Text>
	);
}
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
