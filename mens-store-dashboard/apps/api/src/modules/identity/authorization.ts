import type { Role } from '@ahmed-store/contracts';

export const rolePermissions: Record<Role, readonly string[]> = {
  ADMIN: ['users:manage', 'sales:write', 'inventory:write', 'reports:read', 'treasury:manage', 'shifts:manage_own', 'shifts:review', 'returns:submit_no_invoice', 'returns:approve_no_invoice'],
  FINANCE: ['reports:read', 'treasury:manage', 'shifts:manage_own', 'shifts:review', 'returns:approve_no_invoice'],
  MANAGER: ['sales:write', 'inventory:write', 'reports:read', 'returns:submit_no_invoice'],
  CASHIER: ['sales:write', 'shifts:manage_own'],
  WAREHOUSE: ['inventory:write']
};

export function can(role: Role, permission: string) {
  return rolePermissions[role].includes(permission);
}
