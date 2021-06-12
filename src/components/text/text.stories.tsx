import * as React from 'react';
import { action } from '@storybook/addon-actions';
import Text from '.';
import { TextProps } from './text';
import AutoSize from './auto-size';
import type {
	MaxLinesProps,
	MinFontSizeProps,
	GroupProps,
	StepGranularityProps,
	PresetFontSizesProps,
	OverflowReplacementProps,
} from './auto-size';

export default {
	title: 'Components/Text',
	component: Text,
	subcomponents: { Skeleton: Text.Skeleton },
};

const lorem =
	'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Suspendisse iaculis, nulla at luctus ultrices, dolor.';

/**
 *
 */
export const BasicUsage = (props: TextProps) => <Text {...props} />;
BasicUsage.args = {
	children: lorem,
};

/**
 *
 */
export const CascadingStyles = () => (
	<Text style={{ color: 'blue', fontSize: 22 }}>
		Test
		<Text style={{ color: 'red' }}>Nested test</Text>
	</Text>
);

/**
 *
 */
export const Links = () => <Text onPress={action('click')}>Link</Text>;

/**
 *
 */
export const MaxLines = (props: MaxLinesProps) => <AutoSize.MaxLines {...props} />;
MaxLines.args = {
	children: 'This string will be automatically resized to fit on two lines.',
	fontSize: 32,
	numberOfLines: 2,
};

/**
 *
 */
export const MinFontSize = (props: MinFontSizeProps) => <AutoSize.MinFontSize {...props} />;
MinFontSize.args = {
	children:
		"This string's size will not be smaller than 21. It will be automatically resized to fit on 3 lines.",
	minFontSize: 21,
	numberOfLines: 3,
};

/**
 *
 */
export const Group = (props: GroupProps) => <AutoSize.Group {...props} />;
Group.args = {
	children: 'This mode will fit the available space and sync their text size',
};

/**
 *
 */
export const StepGranularity = (props: StepGranularityProps) => (
	<AutoSize.StepGranularity {...props} />
);
StepGranularity.args = {
	children:
		'This String changes its size with a stepGranularity of 10. It will be automatically resized to fit on 4 lines.',
	fontSize: 48,
	numberOfLines: 4,
	granularity: 10,
};

/**
 *
 */
export const PresetFontSizes = (props: PresetFontSizesProps) => (
	<AutoSize.PresetFontSizes {...props} />
);
PresetFontSizes.args = {
	children:
		'This String has only three allowed sizes: 64, 42 and 24. It will be automatically resized to fit on 4 lines. With this setting, you have most control',
	fontSizePresets: [64, 42, 24],
	numberOfLines: 4,
};

/**
 *
 */
export const OverflowReplacement = (props: OverflowReplacementProps) => (
	<AutoSize.OverflowReplacement {...props} />
);
OverflowReplacement.args = {
	children:
		"This String's size will not be smaller than 32. It will be automatically resized to fit on 3 lines. Otherwise it will be replaced by a replacement string. Here's an example.",
	fontSize: 32,
	numberOfLines: 3,
	overFlowReplacement: 'Text overflowing',
};

/**
 *
 */
export const Skeleton = () => {
	return <Text.Skeleton />;
};
