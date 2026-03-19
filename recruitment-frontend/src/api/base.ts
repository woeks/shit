const runtimeApiBaseUrl = (() => {
  if (typeof window === 'undefined') {
    return 'http://localhost:3000';
  }

  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:3000`;
})();

export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || runtimeApiBaseUrl;

