"""One permission resolver. Explicit lists replace role presets; never union them.

Documents without permission_mode keep legacy grants until deliberately saved.
New accounts default to explicit deny-all, including when the list is omitted.
"""
from models.staff import Permission, ROLE_PERMISSIONS, StaffRole


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
        base = ROLE_PERMISSIONS.get(StaffRole(document.get('role')), [])
        return sorted(set(selected + [p.value for p in base]))
    except (ValueError, TypeError):
        return []


def has_permission(user, permission):
    return bool(user.is_active and permission in user.permissions)
