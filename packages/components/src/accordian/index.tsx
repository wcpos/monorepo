import * as React from 'react';

import * as AccordionPrimitive from '@rn-primitives/accordion';
import { Platform, View } from '@rn-primitives/core';
import { renderPressableChildren } from '@rn-primitives/utils';
import {
	FadeIn,
	FadeOutUp,
	LayoutAnimationConfig,
	LinearTransition,
} from 'react-native-reanimated';

import { Icon } from '../icon';
import { cn } from '../lib/utils';
import { TextClassContext } from '../text';

const WEB_AS_CHILD_PROPS = { asChild: true };

const NATIVE_ROOT_PROPS = {
	isAnimated: true,
	layout: LinearTransition,
};

const INNER_NATIVE_PROPS = {
	isAnimated: true,
	layout: LinearTransition.duration(200),
};

const Accordion = ({ children, ...props }: AccordionPrimitive.RootProps) => {
	return (
		<LayoutAnimationConfig skipEntering>
			<AccordionPrimitive.Root native={NATIVE_ROOT_PROPS} {...props}>
				<View web={WEB_AS_CHILD_PROPS} native={INNER_NATIVE_PROPS}>
					{children}
				</View>
			</AccordionPrimitive.Root>
		</LayoutAnimationConfig>
	);
};

const AccordionItem = ({ className, value, ...props }: AccordionPrimitive.ItemProps) => {
	return (
		<AccordionPrimitive.Item
			className={cn('border-border border-b', className)}
			native={{ isAnimated: true, layout: LinearTransition.duration(200) }}
			value={value}
			{...props}
		/>
	);
};

const AccordionTrigger = ({ className, children, ...props }: AccordionPrimitive.TriggerProps) => {
	const { isExpanded } = AccordionPrimitive.useItemContext();

	return (
		<TextClassContext.Provider value="native:text-lg font-medium">
			<AccordionPrimitive.Header className="flex">
				<AccordionPrimitive.Trigger
					className={cn(
						'flex flex-row items-center justify-between py-4',
						Platform.select({
							web: 'focus-visible:ring-muted-foreground flex-1 transition-all hover:underline focus-visible:outline-none focus-visible:ring-1 [&[data-state=open]>svg]:rotate-180',
							native: 'active:opacity-50',
						}),
						className
					)}
					{...props}
				>
					{renderPressableChildren(children, (children) => {
						return (
							<>
								{children}
								<View
									native={{
										isAnimated: true,
										style: { transform: [{ rotate: isExpanded ? '180deg' : '0deg' }] },
									}}
									web={WEB_AS_CHILD_PROPS}
								>
									<Icon
										name="chevronDown"
										className={cn(
											'text-foreground shrink-0',
											Platform.select({ web: 'transition-transform duration-200' })
										)}
									/>
								</View>
							</>
						);
					})}
				</AccordionPrimitive.Trigger>
			</AccordionPrimitive.Header>
		</TextClassContext.Provider>
	);
};

const AccordionContent = ({ className, children, ...props }: AccordionPrimitive.ContentProps) => {
	return (
		<TextClassContext.Provider value="native:text-lg">
			<AccordionPrimitive.Content
				className={cn(
					'overflow-hidden',
					Platform.select({
						web: 'data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down overflow-hidden text-sm transition-all',
					})
				)}
				{...props}
			>
				<View
					native={{ isAnimated: true, entering: FadeIn, exiting: FadeOutUp.duration(200) }}
					className={cn('pb-4', className)}
				>
					{children}
				</View>
			</AccordionPrimitive.Content>
		</TextClassContext.Provider>
	);
};

export { Accordion, AccordionContent, AccordionItem, AccordionTrigger };
