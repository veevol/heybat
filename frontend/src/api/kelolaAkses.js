import { apiUrl } from './baseUrl';
import { apiJson } from './client';

const API_BASE = apiUrl('/api/kelola-akses');

export async function listUsersMenunggu() {
  return apiJson(`${API_BASE}/users-menunggu`);
}

export async function listAllUsers() {
  return apiJson(`${API_BASE}/users`);
}

export async function listGroups() {
  return apiJson(`${API_BASE}/groups`);
}

export async function createGroup(nama) {
  return apiJson(`${API_BASE}/groups`, {
    method: 'POST',
    body: JSON.stringify({ nama }),
  });
}

export async function getGroupDetail(id) {
  return apiJson(`${API_BASE}/groups/${encodeURIComponent(id)}`);
}

export async function saveGroupPermissions(id, menuAksiIds) {
  return apiJson(
    `${API_BASE}/groups/${encodeURIComponent(id)}/permissions`,
    {
      method: 'PUT',
      body: JSON.stringify({ menu_aksi_ids: menuAksiIds }),
    }
  );
}

export async function assignUserGroup(userId, groupId) {
  return apiJson(
    `${API_BASE}/users/${encodeURIComponent(userId)}/assign-group`,
    {
      method: 'PUT',
      body: JSON.stringify({ group_id: groupId }),
    }
  );
}

export async function cabutUserAkses(userId) {
  return apiJson(`${API_BASE}/users/${encodeURIComponent(userId)}/cabut`, {
    method: 'PUT',
    body: JSON.stringify({}),
  });
}
