import { apiBaseUrl } from '@/lib/env';
import { createApiClient } from '@/lib/http/apiClient';
import { SessionManager } from '@/lib/http/session';
import { tokenStore } from '@/lib/tokenStore';

import { authApi } from './api';

export const sessionManager = new SessionManager(tokenStore, authApi.refresh);

/** The shared authenticated client; features use it for every non-auth route. */
export const api = createApiClient(sessionManager, apiBaseUrl);
