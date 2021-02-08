import * as React from 'react';
import DefaultFallbackComponent from './fallback';

interface Props {
	FallbackComponent?: React.ReactNode;
	fallback?: React.ReactNode;
	fallbackRender?: React.ReactNode;
	onError?: (error: Error, info: React.ErrorInfo) => void;
	onReset?: (args: any) => void;
	onResetKeysChange?: () => void;
	resetKeys?: any;
}

interface State {
	error: Error | null;
	info: React.ErrorInfo | null;
}

const changedArray = (a = [], b = []) =>
	a.length !== b.length || a.some((item, index) => !Object.is(item, b[index]));

const initialState = { error: null, info: null };

class ErrorBoundary extends React.Component<Props, State> {
	static defaultProps = {
		FallbackComponent: DefaultFallbackComponent,
	};

	constructor(props) {
		super(props);
		this.state = initialState;
	}

	resetErrorBoundary = (...args) => {
		this.props.onReset?.(...args);
		this.setState(initialState);
	};

	// eslint-disable-next-line react/sort-comp
	componentDidCatch(error: Error, info: React.ErrorInfo): void {
		this.props.onError?.(error, info?.componentStack);
		this.setState({ error, info });
	}

	componentDidUpdate(prevProps): void {
		const { error } = this.state;
		const { resetKeys, onResetKeysChange } = this.props;
		if (error !== null && changedArray(prevProps.resetKeys, resetKeys)) {
			onResetKeysChange?.(prevProps.resetKeys, resetKeys);
			// eslint-disable-next-line react/no-did-update-set-state
			this.setState(initialState);
		}
	}

	render(): React.ReactNode {
		const { error, info } = this.state;
		const { fallbackRender, FallbackComponent, fallback, children } = this.props;

		if (error !== null) {
			const props = {
				componentStack: info?.componentStack,
				error,
				resetErrorBoundary: this.resetErrorBoundary,
			};
			if (React.isValidElement(fallback)) {
				return fallback;
			}
			if (typeof fallbackRender === 'function') {
				return fallbackRender(props);
			}
			if (typeof FallbackComponent === 'function') {
				return <FallbackComponent {...props}>{children}</FallbackComponent>;
			}
			throw new Error(
				'react-error-boundary requires either a fallback, fallbackRender, or FallbackComponent prop'
			);
		}

		return children;
	}
}

export default ErrorBoundary;
