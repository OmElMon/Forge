import asyncio
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.api.deps import BACK_OFFICE_ROLES, CONFIG_ROLES, OPERATIONS_ROLES, require_roles
from app.models.enums import UserRole
from app.schemas.principal import Principal

ALL_ROLES = tuple(UserRole)


def make_principal(*, role: UserRole) -> Principal:
    return Principal(
        user_id=uuid4(),
        company_id=uuid4(),
        email=f"{role}@example.com",
        full_name="Test User",
        company_name="Ace Plumbing",
        role=role,
    )


@pytest.mark.parametrize(
    ("roles", "role"),
    [
        (group, role)
        for group in (BACK_OFFICE_ROLES, OPERATIONS_ROLES, CONFIG_ROLES)
        for role in ALL_ROLES
    ],
)
def test_require_roles_membership(roles: tuple[UserRole, ...], role: UserRole) -> None:
    dependency = require_roles(*roles)
    principal = make_principal(role=role)
    if role in roles:
        result = asyncio.run(dependency(principal=principal))
        assert result is principal
    else:
        with pytest.raises(HTTPException) as exc:
            asyncio.run(dependency(principal=principal))
        assert exc.value.status_code == 403
        assert exc.value.detail == "Insufficient role"


def test_require_roles_denies_unknown_role_with_403() -> None:
    dependency = require_roles(*BACK_OFFICE_ROLES)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(dependency(principal=make_principal(role=UserRole.TECHNICIAN)))
    assert exc.value.status_code == 403


def test_rbac_groups_cover_mutations_only_not_all_roles() -> None:
    assert UserRole.TECHNICIAN not in BACK_OFFICE_ROLES
    assert UserRole.TECHNICIAN not in OPERATIONS_ROLES
    assert UserRole.TECHNICIAN not in CONFIG_ROLES
    assert UserRole.DISPATCHER not in BACK_OFFICE_ROLES
