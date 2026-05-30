# Source-document upload guide

This maps every corpus document to the platform it should be hosted on, and is
the **fill-in template** for wiring real hyperlinks into the app.

## How the links work

The app reads `web/lib/provenance.json`. Each document has:

```json
"<exact-file-name>": { "chain": ["<Platform>", "<Space/Folder>"], "url": "<link>" }
```

- The `url` is what the **chat citation ↗** and the **tree "Open" button** point to.
- Today every `url` is a **dummy placeholder** in the right platform format.
- **To go live:** upload the file, copy its real share link, and paste it over the
  `url` value for that document. Nothing else to change — chat + tree update instantly.

Source files live in `./corpus/` (and the repo root).

---

## 1. Confluence — space "Regulatory Library" (key `REGLIB`)

| # | Local file (`corpus/…`) | Paste real link → `url` |
|---|---|---|
| 1 | `EU_MiFID_CELEX_32014L0065_EN_TXT.pdf` | |
| 2 | `EU_MIFIR_CELEX_32014R0600_EN_TXT.pdf` | |
| 3 | `EU_MiFID_2015-1787_-_guidelines_on_complex_debt_instruments_and_structured_deposits.pdf` | |
| 4 | `EU_MiFID_esma35-43-620_guidelines_on_mifid_ii_product_governance_requirements_0.pdf` | |
| 5 | `EU_SFDR_CELEX_32019R2088_EN_TXT.pdf` | |
| 6 | `EU_SFDR_jc_2021_03_joint_esas_final_report_on_rts_under_sfdr.pdf` | |
| 7 | `EU_ESG_jc_2021_50_-_final_report_on_taxonomy-related_product_disclosure_rts.pdf` | |
| 8 | `US_FATCA.pdf` | |
| 9 | `US_six-factsheet-fatca-en.pdf` | |

### Confluence — space "Reference Data" (key `REFDATA`)

| # | Local file | Paste real link |
|---|---|---|
| 10 | `EU-MiIFID_six-infographics-mifid-II-reference-data-en.pdf` | |

### Confluence — space "Product Knowledge Base" (key `PKB`)

| # | Local file | Paste real link |
|---|---|---|
| 11 | `six-handbook-regulatory-navigator-en.pdf` | |
| 12 | `six-handbook-tax-navigator-en.pdf` | |

---

## 2. SharePoint — site "Compliance" › Shared Documents › Templates

| # | Local file | Paste real link |
|---|---|---|
| 13 | `EU_ESG_Template_20260410- EET V1.1.3_Editorial update (1).xlsx` | |
| 14 | `EU_MIFID_Template_20251217 FinDatEx - EMT V4.3 (1).xlsx` | |

### SharePoint — site "MasterDataOps" › Shared Documents › Factsheets

| # | Local file | Sensitivity | Paste real link |
|---|---|---|---|
| 15 | `Confidential_SIX_master-data-openining-and-mutations-facsheet.pdf` | **Confidential — most restricted** | |

### SharePoint — site "ReferenceData" › Shared Documents

| # | Local file | Paste real link |
|---|---|---|
| 16 | `SIX_Data Attributes.xlsx` | |

---

## 3. Google Docs — folder "SME Interviews"

| # | Local file | Paste real link |
|---|---|---|
| 17 | `Product Coverage transcript (1).docx` | |
| 18 | `Regulatory Update transcript.docx` | |

### Google Docs — folder "Project Workspace"

| # | Local file | Paste real link |
|---|---|---|
| 19 | `Start Hack ZH_SIX_Presentation.pdf` | |

---

## Summary

- **Confluence:** 12 — regulations, ESMA/ESAs guidelines, FATCA, infographic, handbooks
- **SharePoint:** 4 — FinDatEx templates (EET/EMT), master-data factsheet, data attributes
- **Google Docs:** 3 — both SME transcripts, the presentation

After uploading, edit `web/lib/provenance.json` and replace each document's `url`
with the real share link. Keep `chain` as-is (it drives the tree grouping + logo).
