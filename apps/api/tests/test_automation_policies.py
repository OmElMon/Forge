from uuid import uuid4

from app.models.automation_policy import AutomationPolicy
from app.models.enums import UserRole
from app.schemas.principal import Principal
from app.services.automation_policies import (
    enabled_policy_types,
    load_policy_overrides,
    set_policy_enabled,
)

COMPANY_ID = uuid4()
USER_ID = uuid4()


def make_principal() -> Principal:
    return Principal(
        company_id=COMPANY_ID,
        company_name="Demo Services",
        email="owner@example.com",
        full_name="Demo Owner",
        role=UserRole.OWNER,
        user_id=USER_ID,
    )


class PolicyRows:
    def __init__(self, rows: list[object]) -> None:
        self._rows = list(rows)

    def scalars(self):
        return self

    def all(self) -> list[object]:
        return self._rows

    def scalar_one_or_none(self):
        return self._rows[0] if len(self._rows) == 1 else None


class FakeSession:
    def __init__(self, policies: list[object] | None = None) -> None:
        self.policies = list(policies or [])
        self.added: list[object] = []

    async def execute(self, statement):
        if "automation_policies" in str(statement):
            loaded = self.policies + [
                obj for obj in self.added if isinstance(obj, AutomationPolicy)
            ]
            return PolicyRows(loaded)
        return PolicyRows([])

    def add(self, obj: object) -> None:
        self.added.append(obj)


async def test_policy_overrides_default_to_empty() -> None:
    session = FakeSession()
    assert await load_policy_overrides(session, make_principal()) == {}


async def test_enabled_policy_types_defaults_all_enabled() -> None:
    session = FakeSession()
    rule_types = ["estimate.sent", "estimate.approved", "invoice.sent", "invoice.create"]
    assert await enabled_policy_types(session, make_principal(), rule_types) == set(rule_types)


async def test_enabled_policy_types_honors_disabled_override() -> None:
    session = FakeSession(
        policies=[
            AutomationPolicy(company_id=COMPANY_ID, rule_type="invoice.create", enabled=False)
        ]
    )
    enabled = await enabled_policy_types(
        session,
        make_principal(),
        ["estimate.sent", "estimate.approved", "invoice.sent", "invoice.create"],
    )
    assert enabled == {"estimate.sent", "estimate.approved", "invoice.sent"}


async def test_set_policy_enabled_creates_override() -> None:
    session = FakeSession()

    enabled = await set_policy_enabled(session, make_principal(), "invoice.create", False)

    assert enabled is False
    (policy,) = session.added
    assert isinstance(policy, AutomationPolicy)
    assert policy.rule_type == "invoice.create"
    assert policy.enabled is False
    assert policy.company_id == COMPANY_ID


async def test_set_policy_enabled_updates_existing_override() -> None:
    existing = AutomationPolicy(company_id=COMPANY_ID, rule_type="invoice.create", enabled=False)
    session = FakeSession(policies=[existing])

    enabled = await set_policy_enabled(session, make_principal(), "invoice.create", True)

    assert enabled is True
    assert existing.enabled is True
    assert len(session.added) == 0


async def test_set_policy_enabled_is_noop_when_state_matches() -> None:
    existing = AutomationPolicy(company_id=COMPANY_ID, rule_type="invoice.create", enabled=False)
    session = FakeSession(policies=[existing])

    enabled = await set_policy_enabled(session, make_principal(), "invoice.create", False)

    assert enabled is False
    assert existing.enabled is False
    assert len(session.added) == 0
