"""Accounting export adapters behind the :class:`AccountingExporter` port.

Event contract: consumes `invoice.paid` and `job.completed` — completed work
and settled invoices are exported as immutable snapshots carrying the source
``correlation_id`` and ``company_id`` so exports map back to a tenant.
"""

from app.services.integrations import AccountingExporter, ExportReceipt, InvoiceSnapshot


class DisabledAccountingExporter(AccountingExporter):
    """Default: accounting export is off until an adapter is licensed."""

    provider = "disabled"

    def export_invoice(self, snapshot: InvoiceSnapshot) -> ExportReceipt:
        return ExportReceipt(
            provider=self.provider,
            ok=True,
            disabled=True,
            detail="Accounting disabled: no exporter configured.",
        )


REGISTRY: dict[str, type[AccountingExporter]] = {
    "disabled": DisabledAccountingExporter,
}
