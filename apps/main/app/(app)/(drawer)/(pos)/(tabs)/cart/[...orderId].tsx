// Catch-all route: orderId param MUST be passed as an array (e.g. [uuid]),
// not a string. React Navigation calls .join('/') on catch-all params internally.
export { default } from './index';
