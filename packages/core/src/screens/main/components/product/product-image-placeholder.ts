/**
 * Neutral 150×150 product-image fallback, inlined so it never touches the network
 * (an offline-first POS must not depend on an external placeholder host).
 *
 * Encoded as a **base64** data URI, not percent-encoded: expo-image on Android routes every
 * `data:` URI through a base64 decoder, so a percent-encoded SVG decodes to invalid bytes and
 * renders blank. Base64 renders on web and native alike. Precomputed from the source below (a
 * static asset) to avoid a runtime btoa/Buffer dependency; regenerate both if the artwork changes.
 *
 * Source SVG:
 *   <svg xmlns="http://www.w3.org/2000/svg" width="150" height="150" viewBox="0 0 150 150">
 *     <rect width="150" height="150" fill="#e5e7eb"/>
 *     <rect x="38" y="42" width="74" height="66" rx="5" fill="none" stroke="#9ca3af" stroke-width="6"/>
 *     <circle cx="61" cy="64" r="7" fill="#9ca3af"/>
 *     <path d="m43 99 22-22 15 15 11-11 16 18" fill="none" stroke="#9ca3af" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
 *   </svg>
 */
const PRODUCT_IMAGE_PLACEHOLDER_BASE64 =
	'PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNTAiIGhlaWdodD0iMTUwIiB2aWV3Qm94PSIwIDAgMTUwIDE1MCI+PHJlY3Qgd2lkdGg9IjE1MCIgaGVpZ2h0PSIxNTAiIGZpbGw9IiNlNWU3ZWIiLz48cmVjdCB4PSIzOCIgeT0iNDIiIHdpZHRoPSI3NCIgaGVpZ2h0PSI2NiIgcng9IjUiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzljYTNhZiIgc3Ryb2tlLXdpZHRoPSI2Ii8+PGNpcmNsZSBjeD0iNjEiIGN5PSI2NCIgcj0iNyIgZmlsbD0iIzljYTNhZiIvPjxwYXRoIGQ9Im00MyA5OSAyMi0yMiAxNSAxNSAxMS0xMSAxNiAxOCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjOWNhM2FmIiBzdHJva2Utd2lkdGg9IjYiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPjwvc3ZnPg==';

export const PRODUCT_IMAGE_PLACEHOLDER = `data:image/svg+xml;base64,${PRODUCT_IMAGE_PLACEHOLDER_BASE64}`;
