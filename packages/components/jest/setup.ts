import '@testing-library/jest-dom';

if (typeof global.__DEV__ === 'undefined') {
	(global as any).__DEV__ = true;
}
