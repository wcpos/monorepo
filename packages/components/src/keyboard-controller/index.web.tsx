import type { KeyboardAvoidingViewProps } from 'react-native-keyboard-controller';

/**
 * KeyboardProvider - Web implementation
 * This is an empty wrapper for web platforms
 */
export const KeyboardProvider = ({ children }) => {
	return <>{children}</>;
};

/**
 * KeyboardAvoidingView - Web implementation
 * This is an empty wrapper for web platforms
 */
export const KeyboardAvoidingView = ({ children }: KeyboardAvoidingViewProps) => {
	return <>{children}</>;
};
