import * as React from 'react';

import { ErrorBoundary, ErrorBoundaryPropsWithComponent } from 'react-error-boundary';

import DefaultFallback from './fallback';

type Props = Omit<React.PropsWithChildren<ErrorBoundaryPropsWithComponent>, 'FallbackComponent'> & {
	FallbackComponent?: React.ComponentType<any>;
};

const Boundary = ({ FallbackComponent = DefaultFallback, ...props }: Props) => {
	return <ErrorBoundary FallbackComponent={FallbackComponent} {...props} />;
};

export default Boundary;
