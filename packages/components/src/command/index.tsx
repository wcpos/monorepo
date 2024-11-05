import * as React from 'react';
import { View } from 'react-native';

import { type DialogProps } from '@radix-ui/react-dialog';
import { Command as CommandPrimitive, useCommandState } from 'cmdk';

import useFocusTrap from '@wcpos/hooks/src/use-focus-trap';
import useMergedRef from '@wcpos/hooks/src/use-merged-ref';

import { Dialog, DialogContent } from '../dialog';
import { Icon } from '../icon';
import { Input } from '../input';
import { cn } from '../lib/utils';
import { SelectButton } from '../select';

const CommandButton = SelectButton;
CommandButton.displayName = 'CommandButton';

const Command = React.forwardRef<
	React.ElementRef<typeof CommandPrimitive>,
	React.ComponentPropsWithoutRef<typeof CommandPrimitive>
>(({ className, ...props }, ref) => (
	<CommandPrimitive
		ref={ref}
		className={cn(
			'flex h-full w-full flex-col overflow-hidden rounded-md bg-popover text-popover-foreground',
			className
		)}
		{...props}
	/>
));
Command.displayName = CommandPrimitive.displayName;

interface CommandDialogProps extends DialogProps {}

const CommandDialog = ({ children, ...props }: CommandDialogProps) => {
	return (
		<Dialog {...props}>
			<DialogContent className="overflow-hidden p-0 shadow-lg">
				<Command className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5">
					{children}
				</Command>
			</DialogContent>
		</Dialog>
	);
};

const CommandInput = React.forwardRef<
	React.ElementRef<typeof CommandPrimitive.Input>,
	React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input>
>(({ className, ...props }, ref) => {
	const focusTrapRef = useFocusTrap();

	return (
		<View className="flex items-center p-1" cmdk-input-wrapper="">
			{/* <Icon name="magnifyingGlass" className="mr-2 h-4 w-4 shrink-0 opacity-50" /> */}
			<CommandPrimitive.Input
				ref={focusTrapRef}
				className={cn(
					'web:flex h-10 native:h-12 web:w-full rounded-md border border-input bg-background px-3 web:py-2 text-base lg:text-sm native:text-lg native:leading-[1.25] text-foreground placeholder:text-muted-foreground file:border-0 file:bg-transparent file:font-medium',
					'web:ring-offset-background web:focus-visible:outline-none web:focus-visible:ring-2 web:focus-visible:ring-ring web:focus-visible:ring-offset-1',
					className
				)}
				autoFocus
				{...props}
			/>
		</View>
	);
});

CommandInput.displayName = CommandPrimitive.Input.displayName;

const CommandList = React.forwardRef<
	React.ElementRef<typeof CommandPrimitive.List>,
	React.ComponentPropsWithoutRef<typeof CommandPrimitive.List> & { onEndReached?: () => void }
>(({ className, onEndReached, ...props }, ref) => {
	const localRef = React.useRef<HTMLDivElement>(null);
	const mergedRef = useMergedRef(ref, localRef);

	/**
	 * Handle the scroll event to detect when the user is near the bottom of the list
	 */
	const handleScroll = React.useCallback(() => {
		if (localRef && localRef?.current) {
			const { scrollTop, scrollHeight, clientHeight } = localRef.current;
			const isNearBottom = scrollHeight - scrollTop - clientHeight < 20;
			if (isNearBottom && onEndReached) {
				onEndReached();
			}
		}
	}, [localRef, onEndReached]);

	React.useEffect(() => {
		const scrollContainer = localRef.current;
		if (scrollContainer) {
			scrollContainer.addEventListener('scroll', handleScroll);
			return () => scrollContainer.removeEventListener('scroll', handleScroll);
		}
	}, [handleScroll]);

	return (
		<CommandPrimitive.List
			ref={mergedRef}
			className={cn(
				'max-h-[300px] overflow-y-auto overflow-x-hidden group',
				'[&>*:first-child]:gap-2 [&>*:first-child]:pt-2',
				className
			)}
			{...props}
		/>
	);
});

CommandList.displayName = CommandPrimitive.List.displayName;

const CommandEmpty = React.forwardRef<
	React.ElementRef<typeof CommandPrimitive.Empty>,
	React.ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>
>((props, ref) => (
	<CommandPrimitive.Empty ref={ref} className="py-6 text-center text-sm" {...props} />
));

CommandEmpty.displayName = CommandPrimitive.Empty.displayName;

const CommandGroup = React.forwardRef<
	React.ElementRef<typeof CommandPrimitive.Group>,
	React.ComponentPropsWithoutRef<typeof CommandPrimitive.Group>
>(({ className, ...props }, ref) => (
	<CommandPrimitive.Group
		ref={ref}
		className={cn(
			'overflow-hidden p-1 text-foreground',
			'[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground',
			className
		)}
		{...props}
	/>
));

CommandGroup.displayName = CommandPrimitive.Group.displayName;

const CommandSeparator = React.forwardRef<
	React.ElementRef<typeof CommandPrimitive.Separator>,
	React.ComponentPropsWithoutRef<typeof CommandPrimitive.Separator>
>(({ className, ...props }, ref) => (
	<CommandPrimitive.Separator
		ref={ref}
		className={cn('-mx-1 h-px bg-border', className)}
		{...props}
	/>
));
CommandSeparator.displayName = CommandPrimitive.Separator.displayName;

const CommandItem = React.forwardRef<
	React.ElementRef<typeof CommandPrimitive.Item>,
	React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item>
>(({ className, ...props }, ref) => {
	return (
		<CommandPrimitive.Item
			ref={ref}
			className={cn(
				'relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none',
				'web:outline-none web:focus:bg-accent active:bg-accent web:hover:bg-accent group',
				'aria-selected:bg-accent aria-selected:text-accent-foreground',
				props.disabled && 'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
				className
			)}
			{...props}
		/>
	);
});

CommandItem.displayName = CommandPrimitive.Item.displayName;

const CommandShortcut = ({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) => {
	return (
		<span
			className={cn('ml-auto text-xs tracking-widest text-muted-foreground', className)}
			{...props}
		/>
	);
};
CommandShortcut.displayName = 'CommandShortcut';

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
