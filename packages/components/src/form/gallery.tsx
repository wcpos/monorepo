import { useForm } from 'react-hook-form';

import { Form, FormDescription, FormField, FormItem, FormLabel, FormMessage } from './index';
import { Input } from '../input';

function Example({ refused }: { refused: boolean }) {
	// The refused story carries a real field error, so `FormMessage` renders the
	// Refused state the way a failed validation does, not a hard-coded line.
	const form = useForm({
		defaultValues: { name: refused ? '' : 'Canvas tote' },
		errors: refused ? { name: { type: 'required', message: 'Enter a product name' } } : undefined,
	});
	return (
		<Form {...form}>
			<FormField
				control={form.control}
				name="name"
				render={({ field }) => (
					<FormItem>
						<FormLabel>Product name</FormLabel>
						<Input
							value={field.value}
							onChangeText={field.onChange}
							placeholder="Product name"
							testID="gallery-form-input"
						/>
						{refused ? <FormMessage /> : <FormDescription>Printed on the receipt</FormDescription>}
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
