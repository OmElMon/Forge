from uuid import uuid4

from app.core.config import settings
from app.integrations.messaging import DisabledMessagingProvider, RecordingMessagingProvider
from app.services.integrations import (
    MessageChannel,
    OutboundMessage,
    get_accounting_exporter,
    get_messaging_provider,
    get_payment_gateway,
    get_voice_provider,
)


def make_message() -> OutboundMessage:
    return OutboundMessage(
        to="+15550123",
        channel=MessageChannel.SMS,
        body="Your estimate follow-up is due.",
        company_id=uuid4(),
        correlation_id=uuid4(),
    )


def test_messaging_defaults_to_disabled_provider() -> None:
    provider = get_messaging_provider()

    assert isinstance(provider, DisabledMessagingProvider)
    result = provider.send(make_message())
    assert result.disabled is True
    assert result.ok is True
    assert "no provider" in (result.detail or "")


def test_messaging_resolves_recording_adapter_from_settings(monkeypatch) -> None:
    monkeypatch.setattr(settings, "messaging_provider", "recording")

    provider = get_messaging_provider()

    assert isinstance(provider, RecordingMessagingProvider)
    result = provider.send(make_message())
    assert result.disabled is False
    assert result.message_id == "rec:1"
    assert len(provider.sent) == 1
    assert provider.sent[0].channel == MessageChannel.SMS


def test_unknown_provider_falls_back_to_disabled(monkeypatch) -> None:
    monkeypatch.setattr(settings, "messaging_provider", "not-a-real-provider")

    provider = get_messaging_provider()

    assert isinstance(provider, DisabledMessagingProvider)


def test_voice_payments_accounting_factories_return_disabled_adapters() -> None:
    voice = get_voice_provider()
    payments = get_payment_gateway()
    accounting = get_accounting_exporter()

    assert voice.provider == "disabled"
    assert payments.provider == "disabled"
    assert accounting.provider == "disabled"
