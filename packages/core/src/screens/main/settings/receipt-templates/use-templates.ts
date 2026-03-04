import * as React from 'react';

import { getLogger } from '@wcpos/utils/logger';

import { useRestHttpClient } from '../../hooks/use-rest-http-client';

const logger = getLogger(['wcpos', 'receipt', 'templates']);

export type TemplateEngine = 'logicless' | 'legacy-php';

/**
 * Matches the response shape from GET /wcpos/v1/templates
 * (virtual filesystem templates + database custom templates)
 */
export interface ReceiptTemplate {
	id: string | number;
	title: string;
	type: string;
	language: string;
	engine: TemplateEngine;
	output_type: string;
	is_virtual: boolean;
	is_active: boolean;
	source?: string;
	content?: string;
}

interface UseTemplatesResult {
	templates: ReceiptTemplate[];
	isLoading: boolean;
	error: Error | null;
	refetch: () => void;
}

/**
 * Fetches receipt templates from the templates REST endpoint.
 * Returns template metadata including engine type and output type
 * for displaying badges and enabling the field picker.
 */
export function useTemplates(): UseTemplatesResult {
	const http = useRestHttpClient();
	const [templates, setTemplates] = React.useState<ReceiptTemplate[]>([]);
	const [isLoading, setIsLoading] = React.useState(false);
	const [error, setError] = React.useState<Error | null>(null);

	const fetchTemplates = React.useCallback(async () => {
		setIsLoading(true);
		setError(null);

		try {
			const response = await http.get('/templates', {
				params: { type: 'receipt', context: 'edit' },
			});
			const data = (response?.data ?? []) as ReceiptTemplate[];
			setTemplates(data);
		} catch (err) {
			const e = err instanceof Error ? err : new Error(String(err));
			logger.error('Failed to fetch receipt templates', {
				saveToDb: true,
				context: { error: e.message },
			});
			setError(e);
		} finally {
			setIsLoading(false);
		}
	}, [http]);

	React.useEffect(() => {
		fetchTemplates();
	}, [fetchTemplates]);

	return { templates, isLoading, error, refetch: fetchTemplates };
}
