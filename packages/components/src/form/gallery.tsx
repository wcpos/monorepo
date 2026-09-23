import { useForm } from 'react-hook-form';

import { Form, FormDescription, FormField, FormItem, FormLabel, FormMessage } from './index';
import { Input } from '../input';

function Example({ refused }: { refused: boolean }) {
	const form = useForm({ defaultValues: { name: 'Canvas tote' } });
	return (
		<Form {...form}>
			<FormField
				control={form.control}
				name="name"
				render={({ field }) => (
					<FormItem>
						<FormLabel>Product name</FormLabel>
						<Input value={field.value} onChangeText={field.onChange} testID="gallery-form-input" />
						{refused ? (
							<FormMessage>Enter a product name</FormMessage>
						) : (
							<FormDescription>Printed on the receipt</FormDescription>
						)}
					</FormItem>
				)}
			/>
		</Form>
	);
}
const examples = [
	{ id: 'field', refused: false },
	{ id: 'refused', refused: true },
];
export const stories = examples.map(({ id, refused }) => ({
	id,
	render: () => <Example refused={refused} />,
}));
