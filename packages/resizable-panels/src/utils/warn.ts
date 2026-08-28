// This public package cannot depend on the monorepo-only logger.
export const warn = (message: string) => console.warn(`[react-native-resizable-panels] ${message}`);
