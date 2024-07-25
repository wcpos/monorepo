import * as React from 'react';

import { ErrorBoundary as Boundary, ErrorBoundaryPropsWithComponent } from 'react-error-boundary';

import DefaultFallback from './fallback';

type Props = Omit<React.PropsWithChildren<ErrorBoundaryPropsWithComponent>, 'FallbackComponent'> & {
	FallbackComponent?: React.ComponentType<any>;
};

export const ErrorBoundary = ({ FallbackComponent = DefaultFallback, ...props }: Props) => {
	return <Boundary FallbackComponent={FallbackComponent} {...props} />;
};
