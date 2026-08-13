from app.api.v1.endpoints.invoices import append_workflow_note, converted_invoice_title


def test_converted_invoice_title_replaces_estimate_language() -> None:
    assert converted_invoice_title("Furnace replacement estimate") == "Furnace Replacement Invoice"


def test_converted_invoice_title_appends_invoice_when_estimate_is_missing() -> None:
    assert converted_invoice_title("Seasonal maintenance") == "Seasonal maintenance invoice"


def test_append_workflow_note_preserves_existing_notes() -> None:
    result = append_workflow_note(
        "Customer approved by phone.",
        "Converted from approved estimate.",
    )

    assert result == "Customer approved by phone.\n\nConverted from approved estimate."
