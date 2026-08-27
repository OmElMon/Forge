"""Integration port definitions for external systems.

Ports (and their payload contracts) live here so domain services depend only on
stable interfaces. Concrete adapters live under ``app/integrations/`` and are
resolved by name from settings — every provider defaults to a disabled no-op
adapter, so landing adapters never changes production behavior.
"""

import importlib
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from typing import Protocol
from uuid import UUID

from app.core.config import settings

ADAPTER_MODULES = ("messaging", "voice", "payments", "accounting")


@dataclass(frozen=True)
class IntegrationResult:
    provider: str
    ok: bool
    disabled: bool = False
    external_id: str | None = None
    detail: str | None = None


# --- messaging ---------------------------------------------------------------


class MessageChannel(StrEnum):
    SMS = "sms"
    EMAIL = "email"


@dataclass(frozen=True)
class OutboundMessage:
    to: str
    channel: MessageChannel
    body: str
    company_id: UUID
    correlation_id: UUID
    subject: str | None = None


@dataclass(frozen=True)
class SendResult(IntegrationResult):
    message_id: str | None = None


class MessagingProvider(Protocol):
    provider: str

    def send(self, message: OutboundMessage) -> SendResult: ...


# --- voice -------------------------------------------------------------------


@dataclass(frozen=True)
class ReminderCallRequest:
    phone: str
    context: str
    at: datetime
    company_id: UUID
    correlation_id: UUID


@dataclass(frozen=True)
class CallBooking(IntegrationResult):
    scheduled_for: datetime | None = None


class VoiceProvider(Protocol):
    provider: str

    def book_reminder_call(self, request: ReminderCallRequest) -> CallBooking: ...


# --- payments ----------------------------------------------------------------


@dataclass(frozen=True)
class PaymentLinkRequest:
    invoice_id: UUID
    amount_cents: int
    description: str
    company_id: UUID
    correlation_id: UUID
    customer_email: str | None = None


@dataclass(frozen=True)
class PaymentLink(IntegrationResult):
    url: str | None = None


class PaymentGateway(Protocol):
    provider: str

    def create_payment_link(self, request: PaymentLinkRequest) -> PaymentLink: ...

    def verify_webhook_signature(self, payload: bytes, headers: Mapping[str, str]) -> bool: ...


# --- accounting --------------------------------------------------------------


@dataclass(frozen=True)
class InvoiceSnapshot:
    invoice_id: UUID
    company_id: UUID
    status: str
    total_cents: int
    issued_at: datetime | None = None


@dataclass(frozen=True)
class ExportReceipt(IntegrationResult):
    export_ref: str | None = None


class AccountingExporter(Protocol):
    provider: str

    def export_invoice(self, snapshot: InvoiceSnapshot) -> ExportReceipt: ...


# --- provider resolution -----------------------------------------------------


def get_messaging_provider() -> MessagingProvider:
    return _resolve("messaging", settings.messaging_provider)


def get_voice_provider() -> VoiceProvider:
    return _resolve("voice", settings.voice_provider)


def get_payment_gateway() -> PaymentGateway:
    return _resolve("payments", settings.payments_provider)


def get_accounting_exporter() -> AccountingExporter:
    return _resolve("accounting", settings.accounting_provider)


def _resolve(kind: str, name: str) -> object:
    module = importlib.import_module(f"app.integrations.{kind}")
    registry = module.REGISTRY
    return (registry.get(name) or registry["disabled"])()
