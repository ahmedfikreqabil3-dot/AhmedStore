import type { Role } from '@ahmed-store/contracts';

export const rolePermissions: Record<Role, readonly string[]> = {
  ADMIN: ['users:manage', 'sales:write', 'inventory:write', 'reports:read', 'treasury:manage', 'returns:approve_no_invoice'],
  FINANCE: ['reports:read', 'treasury:manage', 'returns:approve_no_invoice'],
  MANAGER: ['sales:write', 'inventory:write', 'reports:read'],
  CASHIER: ['sales:write'],
  WAREHOUSE: ['inventory:write']
};

export function can(role: Role, permission: string) {
  return rolePermissions[role].includes(permission);
}
