import * as React from 'react';

import { Text } from '@wcpos/components/src/text';

interface Props {}

const Versions: React.FC<Props> = () => {
	return <Text>React:{React.version}</Text>;
};

export default Versions;
