import { View } from 'react-native';

/** The picked-one mark at the start of a found-device row (a `ListItem`). */
export function RadioDot({ selected }: { selected: boolean }) {
	return (
		<View
			className={`size-4 rounded-full border-2 ${selected ? 'border-primary bg-primary' : 'border-border'}`}
		/>
	);
}
