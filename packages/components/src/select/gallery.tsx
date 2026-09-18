import { Select, SelectTrigger, SelectValue } from './index';

export const stories = [
	{
		id: 'default',
		render: () => (
			<Select value={{ value: 'canvas', label: 'Canvas tote' }}>
				<SelectTrigger testID="gallery-select">
					<SelectValue placeholder="Choose product" />
				</SelectTrigger>
			</Select>
		),
	},
];
