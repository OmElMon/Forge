"""Voice adapters behind the :class:`VoiceProvider` port.

Event contract: consumes `followup.due` (book a reminder call) and
`inspector.verify-caller` style requests. Calls are booked per tenant with the
follow-up ``correlation_id``; outcomes arrive later as webhooks that emit
`call.completed` onto the tenant's stream.
"""

from app.services.integrations import CallBooking, ReminderCallRequest, VoiceProvider


class DisabledVoiceProvider(VoiceProvider):
    """Default: voice is off until an adapter is licensed."""

    provider = "disabled"

    def book_reminder_call(self, request: ReminderCallRequest) -> CallBooking:
        return CallBooking(
            provider=self.provider,
            ok=True,
            disabled=True,
            scheduled_for=request.at,
            detail="Voice disabled: no provider configured.",
        )


REGISTRY: dict[str, type[VoiceProvider]] = {
    "disabled": DisabledVoiceProvider,
}
