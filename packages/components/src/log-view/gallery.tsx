import { View } from 'react-native';

import { type LogLine, LogView } from './index';

const lines: LogLine[] = [
	{
		time: '18:00:05',
		message: 'Sent to Paul Solo',
		fields: [
			['reader', 'rdr_20XYBCYC8C9SSVPYWEE63K88JX'],
			['action', '35223110-244a-4737-8c5c-7ae17ade1240'],
		],
	},
	{ time: '18:00:06', message: 'On the terminal, waiting for the customer' },
	{ time: '18:00:21', level: 'warn', message: 'Orders took 4.1 s to answer, trying again' },
	{
		time: '18:00:48',
		level: 'error',
		message: 'Cancelled on the terminal',
		fields: [['payment', '355e99b8-52f9-4922-8122-597ea8430a4a']],
	},
	{ time: '18:01:02', level: 'ok', message: 'Captured 16,00 €' },
];

export const stories = [
	{
		id: 'box',
		render: () => (
			<View className="w-[28rem]">
				<LogView title="Payment log" lines={lines} copyLabel="Copy" maxHeight={180} />
			</View>
		),
	},
	{
		id: 'flat',
		render: () => (
			<View className="bg-card w-[28rem] p-4">
				<LogView frame="none" lines={lines} />
			</View>
		),
	},
];
