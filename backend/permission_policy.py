"""One permission resolver. Explicit lists replace role presets; never union them.

Documents without permission_mode keep legacy grants until deliberately saved.
Ordinary accounts default to explicit deny-all, including omitted lists.
Authorization recognizes active SUPER_ADMIN in the shared check below, without
rewriting any account's stored grants.
"""
from models.staff import Permission, ROLE_PERMISSIONS, StaffRole
from models.auth import UserRole

# These two operations were authorized by admin role before per-action guards:
# staff management and receiving clinical payments. Preserve that existing
# capability only for legacy accounts. Role presets and explicit lists are not
# expanded; payroll and all newly introduced delete/export keys stay explicit.
LEGACY_ADMIN_OPERATIONS = {'staff_edit', 'finance_edit'}

def effective_permissions(document):
    custom = document.get('custom_permissions', [])
    if not isinstance(custom, list):
        return []
    try:
        selected = [Permission(p).value for p in custom]
        mode = document.get('permission_mode', 'legacy')
        if mode == 'explicit':
            return sorted(set(selected))
        if mode != 'legacy':
            return []
        role = StaffRole(document.get('role'))
        base = ROLE_PERMISSIONS.get(role, [])
        permissions = set(selected + [p.value for p in base])
        if role in (StaffRole.ADMIN, StaffRole.SUPER_ADMIN):
            permissions |= LEGACY_ADMIN_OPERATIONS
        return sorted(permissions)
    except (ValueError, TypeError):
        return []


def has_permission(user, permission):
    return bool(user.is_active and (getattr(user, 'role', None) == UserRole.SUPER_ADMIN or permission in user.permissions))
