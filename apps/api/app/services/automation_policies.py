from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.automation_policy import AutomationPolicy
from app.schemas.principal import Principal


async def load_policy_overrides(
    db: AsyncSession,
    principal: Principal,
) -> dict[str, bool]:
    """Return per-company automation rule toggles that explicitly diverge."""
    result = await db.execute(
        select(AutomationPolicy).where(AutomationPolicy.company_id == principal.company_id)
    )
    return {policy.rule_type: policy.enabled for policy in result.scalars().all()}


async def enabled_policy_types(
    db: AsyncSession,
    principal: Principal,
    rule_types: Sequence[str],
) -> set[str]:
    """Return the rule types currently enabled, defaulting to enabled."""
    overrides = await load_policy_overrides(db, principal)
    return {rule_type for rule_type in rule_types if overrides.get(rule_type, True)}


async def set_policy_enabled(
    db: AsyncSession,
    principal: Principal,
    rule_type: str,
    enabled: bool,
) -> bool:
    """Create or update a company's enable/disable toggle for a rule type."""
    result = await db.execute(
        select(AutomationPolicy).where(
            AutomationPolicy.company_id == principal.company_id,
            AutomationPolicy.rule_type == rule_type,
        )
    )
    policy = result.scalar_one_or_none()
    if policy is None:
        policy = AutomationPolicy(
            company_id=principal.company_id,
            rule_type=rule_type,
            enabled=enabled,
        )
        db.add(policy)
    elif policy.enabled != enabled:
        policy.enabled = enabled
    return policy.enabled
