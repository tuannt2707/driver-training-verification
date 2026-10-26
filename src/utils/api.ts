export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, init);
  if (response.status === 401 && new Headers(init?.headers).has('Authorization')) {
    window.dispatchEvent(new Event('auth-invalidated'));
  }
  return response;
}
