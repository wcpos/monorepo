export function detectWebEngine(userAgent: string): 'chromium' | 'gecko' | 'webkit' {
	if (/Firefox\//.test(userAgent)) return 'gecko';
	// Every browser on iOS is WebKit underneath (CriOS, EdgiOS, FxiOS); only the desktop tokens
	// with a version slash mark a real Blink engine.
	if (/AppleWebKit/.test(userAgent) && !/(?:Chrome|Chromium|Edg|OPR)\//.test(userAgent))
		return 'webkit';
	return 'chromium';
}
