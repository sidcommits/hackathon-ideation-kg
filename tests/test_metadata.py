from company_brain.metadata import infer_domain, infer_sensitivity, make_doc_id


def test_infer_domain():
    assert infer_domain("EU_MIFIR_CELEX_x.pdf") == "mifir"
    assert infer_domain("EU_MiFID_xyz.pdf") == "mifid"
    assert infer_domain("EU_SFDR_x.pdf") == "sfdr"
    assert infer_domain("EU_ESG_Template.xlsx") == "esg"
    assert infer_domain("US_FATCA.pdf") == "fatca"
    assert infer_domain("six-handbook-tax-navigator-en.pdf") == "tax"
    assert infer_domain("random.pdf") == "general"


def test_infer_sensitivity():
    assert infer_sensitivity("Confidential_SIX_master-data.pdf") == "Confidential"
    assert infer_sensitivity("EU_SFDR_x.pdf") == "C2 Internal"


def test_make_doc_id_stable():
    a = make_doc_id("/a/b/US_FATCA.pdf")
    b = make_doc_id("/a/b/US_FATCA.pdf")
    assert a == b and a.startswith("us_fatca")
