"""Payment gateway adapters behind the :class:`PaymentGateway` port.

Event contract: outbound — `invoice.sent` produces a hosted payment link;
inbound — a verified webhook emits `invoice.paid` onto the tenant's stream with
the provider's payment intent id correlated to ``invoice_id``. Webhook secrets
and API keys come only from settings/env; never from code, config, or seed data.
"""

from collections.abc import Mapping

from app.services.integrations import PaymentGateway, PaymentLink, PaymentLinkRequest


class DisabledPaymentGateway(PaymentGateway):
    """Default: payments are off until an adapter is licensed."""

    provider = "disabled"

    def create_payment_link(self, request: PaymentLinkRequest) -> PaymentLink:
        return PaymentLink(
            provider=self.provider,
            ok=True,
            disabled=True,
            detail="Payments disabled: no gateway configured.",
        )

    def verify_webhook_signature(self, payload: bytes, headers: Mapping[str, str]) -> bool:
        return False


REGISTRY: dict[str, type[PaymentGateway]] = {
    "disabled": DisabledPaymentGateway,
}
