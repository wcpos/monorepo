import * as React from 'react';
import Button from '@wcpos/common/src/components/button';

interface VoidButtonProps {
	order: import('@wcpos/common/src/database').OrderDocument;
}

const VoidButton = ({ order }: VoidButtonProps) => {
	return (
		<Button
			fill
			size="large"
			title="Void"
			onPress={() => {
				order.remove();
			}}
			type="critical"
			// style={{ width: '33%' }}
		/>
	);
};

export default VoidButton;
