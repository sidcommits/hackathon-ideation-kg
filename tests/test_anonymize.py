from company_brain.anonymize import anonymize


def test_replaces_declared_names_with_roles():
    text = (
        "Participants: Walter (Compliance Officer), Mark Jensen (Client - Wealth Platform)\n"
        "Walter: Hi Mark, how are things?\n"
        "Mark: All good, Walter.\n"
    )
    out = anonymize(text)
    assert "Walter" not in out
    assert "Mark" not in out
    assert "Compliance Officer:" in out
    assert "Client - Wealth Platform" in out


def test_no_names_is_noop():
    text = "MiFIR requires reporting of certain instruments."
    assert anonymize(text) == text
