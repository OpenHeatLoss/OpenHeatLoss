#!/usr/bin/env python3
"""
Contract Terms PDF Generator
Renders company-supplied contract wording as-is, with merge tokens resolved.
No default content is shipped — trade-body model contract wording (e.g. RECC)
is typically copyrighted and must not be seeded by this tool. If no template
is set, a clear placeholder is shown so the gap is visible, not silently
omitted, in the generated pack.
"""

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_RIGHT
import json
import sys
from pdf_helpers import resolve_tokens, build_company_identity_line, FooterPageCanvas

BLUE_DARK  = colors.HexColor('#1e3a8a')
BLUE_LIGHT = colors.HexColor('#dbeafe')
GRAY_DARK  = colors.HexColor('#374151')
GRAY_MID   = colors.HexColor('#6b7280')
AMBER_BG   = colors.HexColor('#fef3c7')
AMBER_TXT  = colors.HexColor('#92400e')

TITLE = "Contract Terms & Conditions"
PLACEHOLDER = (
    "Contract terms have not yet been configured. Add your business's "
    "approved contract wording in Settings → Company Details before "
    "sending this pack to a customer."
)


def create_pdf(data, output_filename):
    template = data.get('template')
    client   = data.get('client', {})
    company  = data.get('company', {})

    client_full_name = ' '.join(
        p for p in [client.get('title', ''), client.get('firstName', ''), client.get('surname', '')] if p
    ) or 'Homeowner'

    tokens = {
        'client_full_name': client_full_name,
        'property_address': client.get('propertyAddress', ''),
        'company_name':     company.get('name', ''),
        'date':              '',
        'quote_ref':         client.get('quoteRef', ''),
    }

    doc = SimpleDocTemplate(output_filename, pagesize=A4,
        rightMargin=2.5*cm, leftMargin=2.5*cm, topMargin=2*cm, bottomMargin=2.5*cm)
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle('T', parent=styles['Heading1'], fontSize=15, textColor=BLUE_DARK,
        spaceAfter=12, alignment=TA_CENTER)
    body_style = ParagraphStyle('B', parent=styles['Normal'], fontSize=10, textColor=GRAY_DARK,
        leading=15, spaceAfter=8, alignment=TA_JUSTIFY)
    placeholder_style = ParagraphStyle('P', parent=styles['Normal'], fontSize=10, textColor=AMBER_TXT,
        backColor=AMBER_BG, borderPadding=10, leading=15)
    header_id_style = ParagraphStyle('HdrId', parent=styles['Normal'], fontSize=9.5,
        textColor=GRAY_DARK, alignment=TA_RIGHT, leading=13)
    between_label_style = ParagraphStyle('BetweenLbl', parent=styles['Normal'], fontSize=9,
        textColor=GRAY_MID, leading=13)
    between_value_style = ParagraphStyle('BetweenVal', parent=styles['Normal'], fontSize=10,
        textColor=GRAY_DARK, leading=14)
    and_style = ParagraphStyle('And', parent=styles['Normal'], fontSize=10,
        textColor=GRAY_MID, alignment=TA_CENTER)
    sig_label_style = ParagraphStyle('SigLbl', parent=styles['Normal'], fontSize=8.5,
        textColor=GRAY_MID)

    story = []

    # ── Company header block ──────────────────────────────────────────────
    # Left cell is reserved for the company logo — left blank for now since
    # logo upload isn't built yet (BACKLOG.md: needs logo_url column + R2
    # storage). Once that lands, this cell takes an Image() flowable instead
    # of an empty Paragraph — no other change needed here.
    id_lines = [l for l in [
        f"<b>{company.get('name','')}</b>" if company.get('name') else None,
        company.get('address'),
        f"Company Registration No. {company.get('companyRegistrationNumber')}"
            if company.get('companyRegistrationNumber') else None,
    ] if l]
    if id_lines:
        header_table = Table(
            [[Paragraph('', header_id_style), Paragraph('<br/>'.join(id_lines), header_id_style)]],
            colWidths=[8*cm, 9*cm],
        )
        header_table.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 0), ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ('TOPPADDING', (0, 0), (-1, -1), 0), ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ]))
        story.append(header_table)
        story.append(Spacer(1, 0.3*cm))
        story.append(HRFlowable(width='100%', thickness=1, color=BLUE_LIGHT))
        story.append(Spacer(1, 0.4*cm))

    story.append(Paragraph(TITLE, title_style))

    # ── "Contract for installation services between" table ────────────────
    story.append(Paragraph("This contract is for installation services between:", body_style))
    between_rows = [
        [
            Paragraph(
                f"<b>Company name:</b><br/>{company.get('name','') or 'N/A'}",
                between_value_style,
            ),
            Paragraph("AND", and_style),
            Paragraph(
                f"<b>Customer name:</b><br/>{client_full_name}",
                between_value_style,
            ),
        ],
        [
            Paragraph(
                f"<b>Company address:</b><br/>{company.get('address','') or 'N/A'}",
                between_value_style,
            ),
            '',
            Paragraph(
                f"<b>Customer address:</b><br/>{client.get('propertyAddress','') or 'N/A'}",
                between_value_style,
            ),
        ],
    ]
    between_table = Table(between_rows, colWidths=[6.7*cm, 1.6*cm, 6.7*cm])
    between_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('ALIGN', (1, 0), (1, -1), 'CENTER'),
        ('TOPPADDING', (0, 0), (-1, -1), 8), ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('LEFTPADDING', (0, 0), (-1, -1), 8), ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('GRID', (0, 0), (0, -1), 0.5, colors.HexColor('#d1d5db')),
        ('GRID', (2, 0), (2, -1), 0.5, colors.HexColor('#d1d5db')),
        ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#f3f4f6')),
        ('BACKGROUND', (2, 0), (2, -1), colors.HexColor('#f3f4f6')),
    ]))
    story.append(between_table)
    story.append(Spacer(1, 0.3*cm))

    date_ref_parts = ["Date: ____________________"]
    if client.get('quoteRef'):
        date_ref_parts.append(f"Quote reference: {client.get('quoteRef')}")
    story.append(Paragraph('        '.join(date_ref_parts), between_label_style))
    story.append(Spacer(1, 0.5*cm))

    # ── Company-supplied contract wording ───────────────────────────────────
    if template and template.strip():
        resolved = resolve_tokens(template, tokens)
        for para in resolved.strip().split('\n\n'):
            para = para.strip()
            if para:
                story.append(Paragraph(' '.join(l.strip() for l in para.split('\n') if l.strip()), body_style))
    else:
        story.append(Paragraph(PLACEHOLDER, placeholder_style))

    # ── Customer signature ───────────────────────────────────────────────────
    # Added 2026-09. Note: the RECC model contract this tool's default
    # structure is based on doesn't include a signature block either — added
    # here because a signed acknowledgement is what a lender/finance
    # provider (and the contract's own "you must sign both copies" wording
    # above) expects to see.
    story.append(Spacer(1, 0.8*cm))
    story.append(Paragraph(
        "Signed by the Customer in agreement to the terms set out above:",
        body_style,
    ))
    story.append(Spacer(1, 0.6*cm))
    sig_rows = [
        [Spacer(1, 1.2*cm), Spacer(1, 1.2*cm)],
        [Paragraph('Signature', sig_label_style), Paragraph('Date', sig_label_style)],
    ]
    sig_table = Table(sig_rows, colWidths=[10.5*cm, 4.5*cm], rowHeights=[1.2*cm, None])
    sig_table.setStyle(TableStyle([
        ('LINEBELOW', (0, 0), (0, 0), 0.75, GRAY_DARK),
        ('LINEBELOW', (1, 0), (1, 0), 0.75, GRAY_DARK),
        ('TOPPADDING', (0, 0), (-1, -1), 0), ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 1), (-1, 1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 0), ('RIGHTPADDING', (0, 0), (-1, -1), 0),
    ]))
    story.append(sig_table)

    # Footer added 2026-09 for consistency with the rest of the quote pack
    # (quote PDF, quote cover letter) — same shared canvas, same identity
    # line. Deliberately not added to the MCS performance estimate, which
    # is a separate generator with its own established layout.
    footer_company = build_company_identity_line(company)
    doc.build(story, canvasmaker=lambda *a, **kw: FooterPageCanvas(
        *a, footer_note='', footer_company=footer_company, **kw
    ))
    return output_filename


if __name__ == "__main__":
    with open(sys.argv[1], 'r') as f:
        data = json.load(f)
    output_file = sys.argv[2] if len(sys.argv) > 2 else "contract.pdf"
    create_pdf(data, output_file)
    print(f"PDF generated: {output_file}")
