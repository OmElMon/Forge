from datetime import UTC, datetime
from uuid import uuid4

from app.models.customer import Customer
from app.models.enums import CustomerStatus, PreferredContact
from app.services.customer_profile import filter_customers

NOW = datetime(2026, 8, 27, 12, 0, 0, tzinfo=UTC)
COMPANY_ID = uuid4()


def make_customer(**overrides: object) -> Customer:
    defaults: dict[str, object] = {
        "company_id": COMPANY_ID,
        "created_at": NOW,
        "email": "customer@example.com",
        "id": uuid4(),
        "name": "Marianne Foster",
        "notes": None,
        "phone": "+15551234567",
        "preferred_contact": PreferredContact.EMAIL,
        "sms_opt_in": True,
        "source": "referral",
        "status": CustomerStatus.ACTIVE,
        "updated_at": NOW,
    }
    defaults.update(overrides)
    return Customer(**defaults)  # type: ignore[arg-type]


def test_no_filters_returns_all_customers() -> None:
    customers = [
        make_customer(),
        make_customer(name="Grace Hopper", status=CustomerStatus.LEAD),
    ]

    result = filter_customers(customers)

    assert result == customers


def test_search_matches_name_case_insensitively() -> None:
    customers = [make_customer(name="Acme Plumbing"), make_customer(name="Beta Electric")]

    result = filter_customers(customers, search="acme")

    assert [customer.name for customer in result] == ["Acme Plumbing"]


def test_search_matches_phone_and_email() -> None:
    customers = [
        make_customer(phone="+15559876543"),
        make_customer(email="second@example.com", phone="+15551112222"),
    ]

    by_phone = filter_customers(customers, search="98765")
    by_email = filter_customers(customers, search="SECOND@example.com")

    assert len(by_phone) == 1
    assert by_phone[0].phone == "+15559876543"
    assert [customer.name for customer in by_email] == [customers[1].name]


def test_status_filter_narrows_to_matching_status() -> None:
    customers = [
        make_customer(name="A", status=CustomerStatus.ACTIVE),
        make_customer(name="B", status=CustomerStatus.LEAD),
        make_customer(name="C", status=CustomerStatus.INACTIVE),
    ]

    result = filter_customers(customers, status=CustomerStatus.LEAD)

    assert [customer.name for customer in result] == ["B"]


def test_search_and_status_compose() -> None:
    customers = [
        make_customer(name="Acme Plumbing", status=CustomerStatus.ACTIVE),
        make_customer(name="Acme Heating", status=CustomerStatus.LEAD),
        make_customer(name="Beta Plumbing", status=CustomerStatus.ACTIVE),
    ]

    result = filter_customers(customers, search="acme", status=CustomerStatus.ACTIVE)

    assert [customer.name for customer in result] == ["Acme Plumbing"]


def test_blank_search_is_treated_as_no_filter() -> None:
    customers = [make_customer(name="Acme Plumbing"), make_customer(name="Beta Electric")]

    result = filter_customers(customers, search="   ")

    assert result == customers
