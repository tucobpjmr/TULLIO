// src/lib/auth/mapMember.js
// Adatta la riga `public.users` di Supabase alla shape del TEAM mock
// usata dal monolite VoyageDesk (capacity hardcoded finché lo schema
// non la prevede; role machine → label umano).
const ROLE_LABELS = {
  admin: 'Admin',
  manager: 'Manager',
  agent: 'Agent',
  driver: 'Driver',
};

function initialsFromName(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

export function mapMember(u) {
  const machineRole = (u.role || 'agent').toLowerCase();
  return {
    id: u.id,
    name: u.name,
    role: ROLE_LABELS[machineRole] || 'Agent',
    avatar: u.avatar || initialsFromName(u.name),
    color: u.color || '#0F2044',
    capacity: 10,
    active: u.active !== false,
    pending: u.pending === true,
    email: u.email || undefined,
    phone: u.phone || undefined,
    photoUrl: u.photo_url || undefined,
  };
}
