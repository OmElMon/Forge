"""Messaging adapters (SMS/email) behind the :class:`MessagingProvider` port.

Event contract: consumes `followup.due` and `invoice.sent` — the outbound
message carries the follow-up/invoice ``correlation_id`` and ``company_id`` so
a delivery receipt can be traced back to the tenant's stream. All sends are
tenant-scoped and never bypass authorization.
"""

from app.services.integrations import MessagingProvider, OutboundMessage, SendResult


class DisabledMessagingProvider(MessagingProvider):
    """Default: messaging is off until an adapter is licensed."""

    provider = "disabled"

    def send(self, message: OutboundMessage) -> SendResult:
        return SendResult(
            provider=self.provider,
            ok=True,
            disabled=True,
            detail="Messaging disabled: no provider configured.",
        )


class RecordingMessagingProvider(MessagingProvider):
    """In-memory sender for local dev and tests. Never use in production."""

    provider = "recording"

    def __init__(self) -> None:
        self.sent: list[OutboundMessage] = []

    def send(self, message: OutboundMessage) -> SendResult:
        self.sent.append(message)
        return SendResult(
            provider=self.provider,
            ok=True,
            message_id=f"rec:{len(self.sent)}",
            detail="Recorded in memory.",
        )


REGISTRY: dict[str, type[MessagingProvider]] = {
    "disabled": DisabledMessagingProvider,
    "recording": RecordingMessagingProvider,
}
