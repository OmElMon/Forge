import asyncio
from uuid import uuid4

from app.models.customer import Customer
from app.models.domain_event import DomainEvent
from app.models.enums import (
    CustomerStatus,
    DomainAggregateType,
    DomainEventType,
    PreferredContact,
    UserRole,
)
from app.schemas.principal import Principal
from app.services.customer_import import (
    CUSTOMER_CSV_TEMPLATE,
    ImportCustomer,
    materialize_customer_import,
    parse_customer_rows,
)


class FakeSession:
    def __init__(self) -> None:
        self.objects: list[object] = []

    def add(self, value: object) -> None:
        self.objects.append(value)

    async def flush(self) -> None:  # noqa: D102
        return None

    async def commit(self) -> None:  # noqa: D102
        return None


def make_principal() -> Principal:
    return Principal(
        company_id=uuid4(),
        company_name="CrewPilot",
        email="owner@example.com",
        full_name="Omar Owner",
        role=UserRole.OWNER,
        user_id=uuid4(),
    )


def materialize(rows: list[ImportCustomer], principal: Principal, session: FakeSession) -> int:
    return asyncio.run(
        materialize_customer_import(
            rows,
            session,  # type: ignore[arg-type]
            principal,
        )
    )


def test_parse_valid_rows_uses_defaults_and_parses_bools() -> None:
    content = (
        "name,phone,email,status,source,preferred_contact,sms_opt_in,notes\n"
        "Dana Reyes,+15550123,dana@example.com,,web,email,yes,Wants a heat pump quote\n"
        "Marcus Chen,+15559999,marcus@example.com,active,,,,\n"
    )

    rows, errors = parse_customer_rows(content)

    assert errors == []
    assert len(rows) == 2
    assert rows[0].name == "Dana Reyes"
    assert rows[0].phone == "+15550123"
    assert rows[0].email == "dana@example.com"
    assert rows[0].status == CustomerStatus.LEAD
    assert rows[0].source == "web"
    assert rows[0].preferred_contact == PreferredContact.EMAIL
    assert rows[0].sms_opt_in is True
    assert rows[1].status == CustomerStatus.ACTIVE
    assert rows[1].sms_opt_in is False


def test_parse_ignores_bom_and_unknown_columns() -> None:
    content = "\ufeffname,email,ignored_extra_column\nAda King,ada@example.com,whatever\n"

    rows, errors = parse_customer_rows(content)

    assert errors == []
    assert len(rows) == 1
    assert rows[0].name == "Ada King"
    assert rows[0].email == "ada@example.com"


def test_parse_missing_name_column_flags_header_error() -> None:
    rows, errors = parse_customer_rows("email,phone\nsomeone@example.com,+15550000\n")

    assert rows == []
    assert len(errors) == 1
    assert errors[0].field == "name"
    assert errors[0].row == 1
    assert "Missing required 'name' column" in errors[0].message


def test_parse_blank_name_skips_row_with_error() -> None:
    content = "name,email\n,blank@example.com\n"

    rows, errors = parse_customer_rows(content)

    assert rows == []
    assert len(errors) == 1
    assert errors[0].field == "name"
    assert errors[0].row == 2


def test_parse_invalid_email_skips_row() -> None:
    content = "name,email\nDana Reyes,not-an-email\n"

    rows, errors = parse_customer_rows(content)

    assert rows == []
    assert len(errors) == 1
    assert errors[0].field == "email"
    assert "Invalid email" in errors[0].message


def test_parse_invalid_status_and_preferred_contact_skip_row() -> None:
    content = "name,status,preferred_contact\nDana Reyes,royal,smoke-signal\n"

    rows, errors = parse_customer_rows(content)

    assert rows == []
    fields = {error.field for error in errors}
    assert fields == {"status", "preferred_contact"}


def test_parse_invalid_sms_value_skips_row() -> None:
    content = "name,sms_opt_in\nDana Reyes,maybe\n"

    rows, errors = parse_customer_rows(content)

    assert rows == []
    assert len(errors) == 1
    assert errors[0].field == "sms_opt_in"


def test_parse_duplicate_email_skips_second_row() -> None:
    content = "name,email\nFirst,dup@example.com\nSecond,dup@example.com\n"

    rows, errors = parse_customer_rows(content)

    assert len(rows) == 1
    assert rows[0].name == "First"
    assert len(errors) == 1
    assert errors[0].field == "email"
    assert "Duplicate email" in errors[0].message


def test_parse_empty_content_returns_no_rows() -> None:
    rows, errors = parse_customer_rows("")

    assert rows == []
    assert errors == []


def test_materialize_import_creates_customers_with_events_and_audit() -> None:
    principal = make_principal()
    session = FakeSession()
    rows = [
        ImportCustomer(name="Dana Reyes", phone="+15550123", source="web form"),
        ImportCustomer(
            name="Marcus Chen", status=CustomerStatus.ACTIVE, email="marcus@example.com"
        ),
    ]

    created = materialize(rows, principal, session)

    assert created == 2
    customers = [obj for obj in session.objects if isinstance(obj, Customer)]
    assert len(customers) == 2
    assert all(customer.company_id == principal.company_id for customer in customers)
    assert customers[0].source == "web form"
    assert customers[1].status == CustomerStatus.ACTIVE

    events = [obj for obj in session.objects if isinstance(obj, DomainEvent)]
    event_types = {event.event_type for event in events}
    assert event_types == {DomainEventType.CUSTOMER_CREATED.value}
    assert all(
        event.aggregate_type == DomainAggregateType.CUSTOMER.value
        and event.company_id == principal.company_id
        and event.payload["imported"] is True
        for event in events
    )

    audit_actions = [getattr(obj, "action", None) for obj in session.objects]
    assert audit_actions.count("customer.import") == 1


def test_materialize_import_no_rows_writes_no_audit() -> None:
    principal = make_principal()
    session = FakeSession()

    created = materialize([], principal, session)

    assert created == 0
    audit_actions = [getattr(obj, "action", None) for obj in session.objects]
    assert "customer.import" not in audit_actions


def test_customer_csv_template_matches_columns() -> None:
    expected = "name,phone,email,status,source,preferred_contact,sms_opt_in,notes"
    assert CUSTOMER_CSV_TEMPLATE == expected
