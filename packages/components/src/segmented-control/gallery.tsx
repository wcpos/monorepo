import * as React from 'react';

import { SegmentedControl } from './index';

const payment = { value: 'payments', label: 'Payments' };
const legacy = { value: 'legacy', label: 'Legacy' };
const regular = { value: 'regular', label: 'Regular' };
const examples: Record<string, React.ComponentProps<typeof SegmentedControl>['segments']> = {
	two: [payment, legacy],
	three: [
		{ value: 'compact', label: 'Compact' },
		regular,
		{ value: 'spacious', label: 'Spacious' },
	],
	four: [
		payment,
		legacy,
		{ value: 'sales', label: 'Sales' },
		{ value: 'closures', label: 'Closures' },
	],
	icons: [
		{ ...payment, icon: 'plus' },
		{ ...legacy, icon: 'minus' },
	],
	disabled: [payment, legacy, { value: 'period', label: 'Period', disabled: true, icon: 'lock' }],
};
function Example({
	segments,
	id,
}: {
	segments: React.ComponentProps<typeof SegmentedControl>['segments'];
	id: string;
}) {
	const [value, setValue] = React.useState(segments[0].value);
	return (
		<SegmentedControl
			segments={segments}
			value={value}
			onValueChange={setValue}
			testID={`gallery-segmented-control-${id}`}
		/>
	);
}
export const stories = Object.entries(examples).map(([id, segments]) => ({
	id,
	render: () => <Example segments={segments} id={id} />,
}));
