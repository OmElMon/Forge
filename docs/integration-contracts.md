# Integration Contracts

CrewPilot OS talks to external systems — messaging, voice, payments, accounting —
through adapter ports defined in `apps/api/app/services/integrations.py`.
Concrete adapters live under `apps/api/app/integrations/` and are resolved by
name from `settings.*_provider`. Every provider defaults to a **disabled no-op
adapter**, so landing adapters never changes production behavior.

Activation is manual and owned by the user: provider licenses, payment/billing
accounts, permissions, and webhook registration. The slice stops at code
interfaces + contracts.

## Common rules

- **Tenancy**: every outbound call carries `company_id`; adapters never accept
  or emit cross-tenant data.
- **Correlation**: every outbound call carries a `correlation_id` that maps
  back to the triggering business event (per request the correlation is the
  originating `DomainEvent.correlation_id` or the aggregate event that caused it).
- **Events**: the `/events` stream is the integration surface. Adapters consume
  and emit typed `DomainEventType`s with the standard JSON payload shape. They
  never reach into business tables directly.
- **Credentials**: provider keys/secrets/webhook secrets come only from
  `settings`/env. Never assets, seed data, tests, or docs.
- **Flags**: provider choice is `settings.*_provider` (e.g. `messaging_provider`).
  Unknown names resolve to the disabled adapter.

## Messaging (SMS/email)

- Port: `MessagingProvider.send(OutboundMessage) -> SendResult` in
  `app/services/integrations.py`; adapters in `app/integrations/messaging.py`.
- Inbound events: `followup.due` (deliver the reminder), `invoice.sent`
  (payment-invite message).
- Delivery: when a follow-up crosses `due_at`, the automation pass
  (`run_followup_automation`) watermarks `delivered_at` and calls the messaging
  port with the follow-up's `correlation_id`, so exactly one outbound message is
  produced per due follow-up. Recipient resolution honors `preferred_contact`
  and `sms_opt_in` (SMS when opted-in with a phone, else email; skipped when
  unreachable).
- Outbound events: none (provider-side delivery receipts are logged, not
  streamed) — a future `message.delivered` may be added when delivery tracking ships.
- Channels: `MessageChannel.SMS | EMAIL`; subject only for email.
- Adapters today: `disabled`, `recording` (in-memory fake for tests/local dev).

## Voice

- Port: `VoiceProvider.book_reminder_call(ReminderCallRequest) -> CallBooking`
  in `app/services/integrations.py`; adapters in `app/integrations/voice.py`.
- Inbound events: `followup.due` (book a reminder call at the follow-up's
  window).
- Outbound events: future `call.completed` from the provider webhook,
  correlated via `correlation_id`.
- Adapters today: `disabled`.

## Payments

- Port: `PaymentGateway.create_payment_link(...) -> PaymentLink` and
  `PaymentGateway.verify_webhook_signature(payload, headers) -> bool` in
  `app/services/integrations.py`; adapters in `app/integrations/payments.py`.
- Outbound: `invoice.sent` -> hosted payment link (the gateway's payment intent
  id maps to `invoice_id`).
- Inbound: verified webhook emits `invoice.paid` with provider intent id in the
  payload and the originating `correlation_id`.
- Signature verification uses the provider secret from settings only.
- Adapters today: `disabled`.

## Accounting

- Port: `AccountingExporter.export_invoice(InvoiceSnapshot) -> ExportReceipt` in
  `app/services/integrations.py`; adapters in `app/integrations/accounting.py`.
- Inbound events: `invoice.paid`, `job.completed` -> immutable export
  snapshots carrying `correlation_id` and `company_id`.
- Adapters today: `disabled`.

## Wiring future adapters

1. Add the class in `apps/api/app/integrations/<domain>.py` implementing the port.
2. Register it in that module's `REGISTRY` dict (key = settings value).
3. Paste the real provider secret/credentials into environment settings.
4. Ask the user to activate the account and register webhooks — this is manual.