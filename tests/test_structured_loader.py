from pathlib import Path
from company_brain.loaders.structured import load_structured

REPO = Path(__file__).resolve().parents[1]
ATTR = REPO / "SIX_Data Attributes.xlsx"


def test_loads_regulation_attribute_pairs():
    doc = load_structured(str(ATTR), domain="general", sensitivity="C2 Internal")
    assert doc.source_type == "xlsx"
    recs = doc.records
    assert {"regulation": "MiFIR / MiFID", "attribute": "Reportable Instrument"} in recs
    assert {"regulation": "SFDR", "attribute": "Waste"} in recs
    assert {"regulation": "FATCA", "attribute": "FATCA Grandfathered"} in recs
    assert all(r["regulation"] for r in recs)
    regs = {r["regulation"] for r in recs}
    assert regs == {"MiFIR / MiFID", "SFDR", "FATCA"}
    assert len(recs) == 8
