import * as React from 'react';
import { ActivityIndicator } from './styles';

export interface ILoaderProps {
	size?: 'small' | 'large';
};

export const Loader = (props: ILoaderProps) => {
	return <ActivityIndicator {...props} />;
};

export default Loader;
