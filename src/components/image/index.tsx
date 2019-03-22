import React from 'react';
import Image from './image';
import ActivityIndicator from '../activity-indicator';

const SuspenseImage = props => (
	<React.Suspense fallback={<ActivityIndicator />}>
		<Image {...props} />
	</React.Suspense>
);
export default SuspenseImage;
