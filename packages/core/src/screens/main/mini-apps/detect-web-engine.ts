export function detectWebEngine(userAgent: string): 'chromium' | 'gecko' | 'webkit' {
	if (/Firefox\//.test(userAgent)) return 'gecko';
	if (/AppleWebKit/.test(userAgent) && !/Chrome|Chromium|Edg|OPR/.test(userAgent)) return 'webkit';
	return 'chromium';
}
