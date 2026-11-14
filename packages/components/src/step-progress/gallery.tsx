import { View } from 'react-native';

import { StepProgress } from './index';

const terminal = [
	{ label: 'Sent', caption: '18:00:05' },
	{ label: 'On terminal', caption: '18:00:06' },
	{ label: 'Approved' },
	{ label: 'Captured' },
];
const refund = [{ label: 'Requested' }, { label: 'On terminal' }, { label: 'Refunded' }];

function Row({ children }: { children: React.ReactNode }) {
	return <View className="bg-card w-96 p-4">{children}</View>;
}

export const stories = [
	{
		id: 'active',
		render: () => (
			<Row>
				<StepProgress steps={terminal} current={1} />
			</Row>
		),
	},
	{
		id: 'complete',
		render: () => (
			<Row>
				<StepProgress steps={terminal} current={3} status="complete" />
			</Row>
		),
	},
	{
		id: 'failed',
		render: () => (
			<Row>
				<StepProgress steps={terminal} current={1} status="failed" />
			</Row>
		),
	},
	{
		id: 'stopped',
		render: () => (
			<Row>
				<StepProgress steps={terminal} current={1} status="stopped" />
			</Row>
		),
	},
	{
		id: 'compact',
		render: () => (
			<Row>
				<View className="w-32">
					<StepProgress steps={refund} current={1} size="compact" />
				</View>
			</Row>
		),
	},
];
