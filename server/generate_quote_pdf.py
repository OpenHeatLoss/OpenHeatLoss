#!/usr/bin/env python3
"""
Itemised Quote PDF Generator
Data-driven — not merge-token templated. Renders category rollups
(materials total + marked-up total per category, per-item markup already
applied), VAT, and an explicit numbered Payment Schedule sequence:
deposit → further advance (on trigger event) → balance minus BUS grant.
"""

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT
import json
import sys
from datetime import datetime
from pdf_helpers import build_company_identity_line, FooterPageCanvas

BLUE_DARK  = colors.HexColor('#1e3a8a')
BLUE_MID   = colors.HexColor('#1e40af')
BLUE_LIGHT = colors.HexColor('#dbeafe')
GRAY_LIGHT = colors.HexColor('#f3f4f6')
GRAY_DARK  = colors.HexColor('#374151')
GREEN      = colors.HexColor('#15803d')
GREEN_LIGHT = colors.HexColor('#dcfce7')


def make_style(header_bg=None):
    base = [
        ('FONTSIZE', (0,0), (-1,-1), 9),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#d1d5db')),
    ]
    if header_bg:
        base += [
            ('BACKGROUND', (0,0), (-1,0), header_bg),
            ('TEXTCOLOR', (0,0), (-1,0), colors.white),
            ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ]
    return base


def create_quote_pdf(data, output_filename):
    quote   = data.get('quote', {})
    client  = data.get('client', {})
    company = data.get('company', {})

    doc = SimpleDocTemplate(
        output_filename, pagesize=A4,
        rightMargin=1.8*cm, leftMargin=1.8*cm, topMargin=2*cm, bottomMargin=2.5*cm,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle('T', parent=styles['Heading1'],
        fontSize=17, textColor=BLUE_DARK, spaceAfter=4, alignment=TA_CENTER)
    sub_style = ParagraphStyle('S', parent=styles['Normal'],
        fontSize=10, textColor=colors.HexColor('#6b7280'), alignment=TA_CENTER, spaceAfter=10)
    heading_style = ParagraphStyle('H', parent=styles['Heading2'],
        fontSize=11, textColor=BLUE_MID, spaceAfter=6, spaceBefore=14)
    small_style = ParagraphStyle('Sm', parent=styles['Normal'],
        fontSize=8, textColor=colors.HexColor('#6b7280'))
    wrap_style = ParagraphStyle('Wrap', parent=styles['Normal'],
        fontSize=9, leading=12)
    body_style = ParagraphStyle('Body', parent=styles['Normal'],
        fontSize=10, textColor=colors.HexColor('#374151'), leading=15, spaceAfter=8)

    story = []
    brand_style = ParagraphStyle('Brand', parent=styles['Normal'],
        fontSize=11, textColor=BLUE_MID, alignment=TA_CENTER, spaceAfter=2)
    story.append(Paragraph("OpenHeatLoss.com", brand_style))
    story.append(Paragraph("Quotation", title_style))
    story.append(Paragraph(f"Reference: {quote.get('reference','')}  ·  Generated: {datetime.now().strftime('%d/%m/%Y')}", sub_style))
    story.append(Spacer(1, 0.3*cm))

    # ── Client / quote details ──────────────────────────────────────────
    client_name = ' '.join(p for p in [client.get('title',''), client.get('firstName',''), client.get('surname','')] if p)
    details_rows = [
        ['Customer:', client_name or 'N/A', 'Prepared by:', quote.get('preparedBy', 'N/A')],
        ['Address:', Paragraph(client.get('propertyAddress', 'N/A'), wrap_style), 'Valid for:', f"{quote.get('validDays', 30)} days"],
    ]
    details_table = Table(details_rows, colWidths=[2.3*cm, 6.4*cm, 2.5*cm, 6.2*cm])
    details_table.setStyle(TableStyle([
        ('FONTNAME', (0,0), (0,-1), 'Helvetica-Bold'), ('FONTNAME', (2,0), (2,-1), 'Helvetica-Bold'),
        ('FONTSIZE', (0,0), (-1,-1), 9), ('BACKGROUND', (0,0), (-1,-1), GRAY_LIGHT),
        ('VALIGN', (0,0), (-1,-1), 'TOP'), ('TOPPADDING', (0,0), (-1,-1), 6), ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('LEFTPADDING', (0,0), (-1,-1), 6), ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#d1d5db')),
    ]))
    story.append(details_table)
    story.append(Spacer(1, 0.4*cm))

    # ── Scope of Works ───────────────────────────────────────────────────
    job_spec = quote.get('jobSpecification')
    install_est = quote.get('installationEstimate')
    subcontractor = quote.get('subcontractorDisclosure')
    hourly_rate = quote.get('hourlyRate', 0) or 0

    if job_spec or install_est or subcontractor or hourly_rate > 0:
        story.append(Paragraph("Scope of Works", heading_style))
        if job_spec and job_spec.strip():
            for para in job_spec.strip().split('\n\n'):
                para = para.strip()
                if para:
                    story.append(Paragraph(' '.join(l.strip() for l in para.split('\n') if l.strip()), body_style))
            story.append(Spacer(1, 0.2*cm))

        facts_rows = []
        if install_est and install_est.strip():
            facts_rows.append(['Estimated installation time:', install_est.strip()])
        if subcontractor and subcontractor.strip():
            facts_rows.append(['Sub-contracted works:', subcontractor.strip()])
        if hourly_rate > 0:
            facts_rows.append(['Rate for additional/variation works:', f"£{hourly_rate:,.2f} per hour"])

        if facts_rows:
            facts_table = Table(facts_rows, colWidths=[5.5*cm, 11.3*cm])
            facts_table.setStyle(TableStyle([
                ('FONTSIZE', (0,0), (-1,-1), 9),
                ('FONTNAME', (0,0), (0,-1), 'Helvetica-Bold'),
                ('VALIGN', (0,0), (-1,-1), 'TOP'),
                ('TOPPADDING', (0,0), (-1,-1), 5), ('BOTTOMPADDING', (0,0), (-1,-1), 5),
                ('BACKGROUND', (0,0), (-1,-1), GRAY_LIGHT),
                ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#d1d5db')),
            ]))
            story.append(facts_table)
        story.append(Spacer(1, 0.4*cm))

    # ── Category rollups ─────────────────────────────────────────────────
    story.append(Paragraph("Quotation Summary", heading_style))
    cat_rows = [['Category', 'Price']]
    for row in quote.get('categoryRows', []):
        price = row.get('quotePrice', 0)
        if price > 0 or row.get('materialsTotal', 0) > 0:
            cat_rows.append([row.get('label', row.get('key','')), f"£{price:,.2f}"])
    cat_table = Table(cat_rows, colWidths=[12.4*cm, 4.4*cm])
    ts = make_style(header_bg=BLUE_DARK)
    ts += [('ALIGN', (1,0), (1,-1), 'RIGHT')]
    cat_table.setStyle(TableStyle(ts))
    story.append(cat_table)
    story.append(Spacer(1, 0.3*cm))

    # ── Totals ────────────────────────────────────────────────────────────
    vat_rate = quote.get('vatRate', 0)
    totals_rows = [
        ['Subtotal (ex VAT)', f"£{quote.get('totalExVat', 0):,.2f}"],
        [f"VAT ({vat_rate}%)", f"£{quote.get('vatAmount', 0):,.2f}"],
        ['Grand total (inc VAT)', f"£{quote.get('totalIncVat', 0):,.2f}"],
    ]
    bus_grant = quote.get('busGrant', 0) or 0
    if bus_grant > 0:
        totals_rows.append(['Boiler Upgrade Scheme grant', f"− £{bus_grant:,.2f}"])
    totals_rows.append(['Client pays', f"£{quote.get('clientPays', 0):,.2f}"])

    totals_table = Table(totals_rows, colWidths=[12.4*cm, 4.4*cm])
    tts = [
        ('FONTSIZE', (0,0), (-1,-1), 10), ('ALIGN', (1,0), (1,-1), 'RIGHT'),
        ('TOPPADDING', (0,0), (-1,-1), 5), ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LINEABOVE', (0,-1), (-1,-1), 1.5, BLUE_MID),
        ('FONTNAME', (0,-1), (-1,-1), 'Helvetica-Bold'), ('FONTSIZE', (0,-1), (-1,-1), 12),
        ('BACKGROUND', (0,-1), (-1,-1), BLUE_LIGHT), ('TEXTCOLOR', (0,-1), (-1,-1), BLUE_DARK),
    ]
    totals_table.setStyle(TableStyle(tts))
    story.append(totals_table)
    story.append(Spacer(1, 0.5*cm))

    # ── Payment Schedule — explicit numbered sequence ────────────────────
    story.append(Paragraph("Payment Schedule", heading_style))
    deposit  = quote.get('depositAmount', 0) or 0
    advance  = quote.get('advanceAmount', 0) or 0
    trigger  = quote.get('advanceTrigger', 'on receipt of goods on site')
    balance  = quote.get('balanceOnCompletion', 0) or 0

    step_style = ParagraphStyle('Step', parent=styles['Normal'], fontSize=10, leading=14)
    pay_rows = [
        [Paragraph('<b>1. Deposit</b><br/>Payable on confirmation of order', step_style), f"£{deposit:,.2f}"],
        [Paragraph(f'<b>2. Further advance</b><br/>Payable {trigger}', step_style), f"£{advance:,.2f}"],
    ]
    balance_label = '<b>3. Balance</b><br/>Payable on commissioning'
    if bus_grant > 0:
        balance_label += f'<br/><font size="8" color="#15803d">less Boiler Upgrade Scheme grant of £{bus_grant:,.2f}</font>'
    pay_rows.append([Paragraph(balance_label, step_style), f"£{balance:,.2f}"])

    pay_table = Table(pay_rows, colWidths=[12.4*cm, 4.4*cm])
    pay_table.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'), ('ALIGN', (1,0), (1,-1), 'RIGHT'),
        ('FONTSIZE', (1,0), (1,-1), 12), ('FONTNAME', (1,0), (1,-1), 'Helvetica-Bold'),
        ('TOPPADDING', (0,0), (-1,-1), 10), ('BOTTOMPADDING', (0,0), (-1,-1), 10),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#d1d5db')),
        ('BACKGROUND', (0,0), (-1,0), GREEN_LIGHT),
        ('BACKGROUND', (0,1), (-1,1), GREEN_LIGHT),
        ('BACKGROUND', (0,2), (-1,2), GREEN_LIGHT),
    ]))
    story.append(pay_table)
    story.append(Spacer(1, 0.2*cm))
    story.append(Paragraph(
        "Payment protection limits: deposit does not exceed 25% of the total contract price; "
        "deposit and further advance combined do not exceed 60%. Cancellation rights are set "
        "out in the enclosed cancellation form.",
        small_style,
    ))

    footer_note = "Quote does not constitute a contract. See enclosed terms of business."
    footer_company = build_company_identity_line(company)
    doc.build(story, canvasmaker=lambda *a, **kw: FooterPageCanvas(
        *a, footer_note=footer_note, footer_company=footer_company, **kw
    ))
    return output_filename


if __name__ == "__main__":
    with open(sys.argv[1], 'r') as f:
        data = json.load(f)
    output_file = sys.argv[2] if len(sys.argv) > 2 else "quote.pdf"
    create_quote_pdf(data, output_file)
    print(f"PDF generated: {output_file}")
