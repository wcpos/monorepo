import React from 'react';
import { ViewProps } from 'react-native';
import { ArrowView } from './styles';

export type Props = ViewProps;

const Arrow: React.FunctionComponent<Props> = props => {
	return <ArrowView {...props} />;
};

export default Arrow;
