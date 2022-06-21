import * as React from 'react';
import { useReactToPrint } from 'react-to-print';
import Text from '@wcpos/components/src/text';
import Button from '@wcpos/components/src/button';
import Box from '@wcpos/components/src/box';

interface ReceiptProps {
	order: import('@wcpos/database').OrderDocument;
}

const ComponentToPrint = () => {
	return <Text>Hello World!</Text>;
};

export const Receipt = ({ order }: ReceiptProps) => {
	const componentRef = React.useRef<typeof Box>();

	const handlePrint = useReactToPrint({
		content: () => componentRef.current,
	});

	return (
		<>
			<Box ref={componentRef}>
				<Text>Hello World!</Text>
			</Box>
			<Button onPress={handlePrint}>Print this out!</Button>
		</>
	);
};
