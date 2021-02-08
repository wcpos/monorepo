import * as React from 'react';
import { ActivityIndicator } from './styles';

export type Props = {
	size?: 'large' | 'small';
};

const Loader = (props: Props) => {
	return <ActivityIndicator {...props} />;
};

export default Loader;
