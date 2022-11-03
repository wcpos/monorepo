import parseLinkHeader from './parse-link-header';

// https://developer.mozilla.org/en-US/docs/Web/API/URL
// should be available in all modern browsers
const { URL, URLSearchParams } = window;

export { URL, URLSearchParams, parseLinkHeader };
