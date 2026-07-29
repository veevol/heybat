import { apiUrl } from './baseUrl';
import { apiFetch, apiJson } from './client';

export async function getMe() {
  return apiJson(apiUrl('/api/me'));
}

export async function updateMe(payload) {
  return apiJson(apiUrl('/api/me'), {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function uploadMyAvatar(file) {
  const form = new FormData();
  form.append('file', file);
  const res = await apiFetch(apiUrl('/api/me/avatar'), {
    method: 'POST',
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || 'Gagal upload avatar');
  }
  return data;
}
