#!/usr/bin/env python3
"""
Shared helpers for PDF generators.
resolve_tokens: extracted from generate_cover_letter_pdf.py so it is defined
once rather than duplicated across every generator that supports merge tokens.

build_company_identity_line / FooterPageCanvas: extracted 2026-09 when the
quote pack footer (company name / registration / VAT / MCS) was added to a
third generator (the contract). Three generators were independently
defining near-identical PageNumCanvas classes and footer-line logic — moved
here once a third copy would have been needed, so the whole pack's footers
now share one implementation and one place to change the look.
"""
import re

from reportlab.pdfgen import canvas as rl_canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib import colors


def resolve_tokens(text, tokens):
    """Replace all {token} placeholders in text with values from the tokens dict.
    Any unresolved {token}-shaped placeholders are stripped afterwards."""
    if not text:
        return text
    for key, value in tokens.items():
        text = text.replace('{' + key + '}', str(value) if value else '')
    text = re.sub(r'\{[a-z_]+\}', '', text)
    return text


def build_company_identity_line(company, separator='   |   '):
    """One line combining name, company registration number, VAT
    registration number, and MCS number — used in the footer of every
    document in the quote/contract pack. Missing fields are omitted rather
    than printed blank (company registration is N/A for sole traders; VAT
    registration is N/A for non-VAT-registered businesses)."""
    parts = []
    if company.get('name'):
        parts.append(company['name'])
    if company.get('companyRegistrationNumber'):
        parts.append(f"Company Registration No. {company['companyRegistrationNumber']}")
    if company.get('vatRegistrationNumber'):
        parts.append(f"VAT Registration No. {company['vatRegistrationNumber']}")
    if company.get('mcsNumber'):
        parts.append(f"MCS {company['mcsNumber']}")
    return separator.join(parts)


class FooterPageCanvas(rl_canvas.Canvas):
    """Shared footer canvas: an optional bold company-identity line, a
    left-aligned note (e.g. a disclaimer — pass '' for none), and a
    right-aligned page number. When footer_company is set, the identity
    line sits above the note/page-number row; when it isn't, the note/page
    row sits directly under the rule."""
    def __init__(self, *args, footer_note='', footer_company='', **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []
        self._footer_note = footer_note
        self._footer_company = footer_company

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        total = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self._draw_footer(self._pageNumber, total)
            rl_canvas.Canvas.showPage(self)
        rl_canvas.Canvas.save(self)

    def _draw_footer(self, page_num, total_pages):
        self.saveState()
        rule_y = 1.75 * cm if self._footer_company else 1.4 * cm
        self.setStrokeColor(colors.HexColor('#d1d5db'))
        self.setLineWidth(0.5)
        self.line(1.8 * cm, rule_y, A4[0] - 1.8 * cm, rule_y)

        if self._footer_company:
            self.setFont('Helvetica-Bold', 7.5)
            self.setFillColor(colors.HexColor('#374151'))
            self.drawString(1.8 * cm, 1.45 * cm, self._footer_company)

        self.setFont('Helvetica', 7.5)
        self.setFillColor(colors.HexColor('#6b7280'))
        self.drawString(1.8 * cm, 1.1 * cm, self._footer_note)
        self.drawRightString(A4[0] - 1.8 * cm, 1.1 * cm, f"Page {page_num} of {total_pages}")
        self.restoreState()
