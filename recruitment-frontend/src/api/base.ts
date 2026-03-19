const runtimeApiBaseUrl = (() => {
  if (typeof window === 'undefined') {
    return '/api';
  }

  return '/api';
})();

export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || runtimeApiBaseUrl;
