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


def test_regulatory_parenthetical_not_anonymized():
    # No speaker labels -> nothing is treated as a person; prose untouched.
    text = "The Directive (2014/65/EU) applies. The Directive is binding on firms."
    assert anonymize(text) == text


def test_ambiguous_first_name_keeps_governance():
    text = (
        "Participants: Mark Jensen (Client), Mark Weber (Analyst)\n"
        "Mark Jensen: hello\n"
        "Mark Weber: hi\n"
    )
    out = anonymize(text)
    # Full names are replaced; no personal name survives.
    assert "Jensen" not in out and "Weber" not in out
    assert "Client" in out and "Analyst" in out
