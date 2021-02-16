import * as React from 'react';
import Loader from './loader';

type ILoaderProps = import('./loader').ILoaderProps;

export default {
	title: 'Components/Loader',
	component: Loader
};

export const basicUsage = ({ size }: ILoaderProps) => <Loader size={size} />;