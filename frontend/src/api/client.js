import { supabase } from '../lib/supabase';

/**
 * fetch() ke backend dengan Authorization: Bearer dari session Supabase.
 * Jangan set Content-Type untuk FormData (browser yang isi boundary).
 */
export async function apiFetch(input, init = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers = new Headers(init.headers || {});
  if (session?.access_token) {
    headers.set('Authorization', `Bearer ${session.access_token}`);
  }

  const isFormData =
    typeof FormData !== 'undefined' && init.body instanceof FormData;
  if (init.body && !isFormData && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  return fetch(input, { ...init, headers });
}

export async function parseResponse(res) {
  if (res.status === 204) return null;
  const raw = await res.text();
  let data = {};
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = {};
    }
  }
  if (!res.ok) {
    const message =
      data?.error ||
      (raw && raw.length < 200 && !raw.trim().startsWith('<')
        ? raw.trim()
        : null) ||
      `Terjadi kesalahan (${res.status})`;
    const error = new Error(message);
    error.status = res.status;
    error.data = data;
    throw error;
  }
  return data;
}

/** apiFetch + parseResponse */
export async function apiJson(input, init = {}) {
  const res = await apiFetch(input, init);
  return parseResponse(res);
}
