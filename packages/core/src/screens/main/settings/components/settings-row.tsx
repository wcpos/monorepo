import * as React from 'react';
import { View } from 'react-native';

import { useFormContext } from 'react-hook-form';

import { FormItem, FormLabel } from '@wcpos/components/form';
import { Label } from '@wcpos/components/label';
import { Text } from '@wcpos/components/text';

interface SettingsRowProps {
	label: string;
	description?: string;
	/**
	 * Keep label and control on one line at every screen size (switches and
	 * other compact controls). Default rows go label-left on md+, stacked on sm.
	 */
	inline?: boolean;
	children: React.ReactNode;
	testID?: string;
}

/**
 * One setting: label (+ optional hint) on the left, control on the right.
 * No divider — rows separate by rhythm alone. Stacks label-above-control on
 * small screens with a full-width control.
 */
export function SettingsRow({ label, description, inline, children, testID }: SettingsRowProps) {
	// Inside a react-hook-form <Form>, FormItem + FormLabel wire the label to its
	// control. Screens without a form (customer display) have no provider, where
	// FormLabel's useFormField() throws, so those rows fall back to a plain label.
	const inForm = useFormContext() !== null;
	const Row = inForm ? FormItem : View;
	const RowLabel = inForm ? FormLabel : PlainLabel;

	if (inline) {
		return (
			<Row testID={testID} className="flex-row items-center justify-between gap-4 py-2.5">
				<View className="flex-1 gap-0.5">
					<RowLabel>{label}</RowLabel>
					{!!description && <Text className="text-muted-foreground text-xs">{description}</Text>}
				</View>
				{children}
			</Row>
		);
	}

	return (
		<Row testID={testID} className="gap-2 py-2.5 md:flex-row md:items-center md:gap-6">
			<View className="shrink-0 gap-0.5 md:w-64 lg:w-72">
				<RowLabel>{label}</RowLabel>
				{!!description && <Text className="text-muted-foreground text-xs">{description}</Text>}
			</View>
			<View className="md:flex-1 md:flex-row md:justify-end">
				<View className="w-full md:max-w-80">{children}</View>
			</View>
		</Row>
	);
}

/** Same padding as FormLabel so rows look identical with or without a form. */
function PlainLabel({ children }: { children: React.ReactNode }) {
	return <Label className="p-1">{children}</Label>;
}
