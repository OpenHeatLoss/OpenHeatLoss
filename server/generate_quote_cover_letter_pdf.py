#!/usr/bin/env python3
"""
Quote Cover Letter PDF Generator
Distinct from generate_cover_letter_pdf.py (the heat-loss report cover
letter) — this one accompanies the quote/contract pack and focuses on
price, payment schedule, and next steps rather than calculation results.

Merge tokens:
  {client_first_name} {client_surname} {client_full_name}
  {property_address} {company_name} {company_phone} {company_email} {date}
  {quote_ref} {total_inc_vat} {deposit_amount} {advance_amount}
  {advance_trigger} {valid_days} {bus_grant_amount} {client_pays}
"""

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_JUSTIFY
import json
import sys
from datetime import datetime
from pdf_helpers import resolve_tokens

BLUE_DARK  = colors.HexColor('#1e3a8a')
BLUE_MID   = colors.HexColor('#1e40af')
BLUE_LIGHT = colors.HexColor('#dbeafe')
GRAY_MID   = colors.HexColor('#e5e7eb')
GRAY_DARK  = colors.HexColor('#374151')


class PageNumCanvas(rl_canvas.Canvas):
    def __init__(self, *args, footer_left='', **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []
        self._footer_left = footer_left

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
        self.setFont('Helvetica', 7.5)
        self.setFillColor(colors.HexColor('#6b7280'))
        self.drawString(1.8 * cm, 1.1 * cm, self._footer_left)
        self.drawRightString(A4[0] - 1.8 * cm, 1.1 * cm, f"Page {page_num} of {total_pages}")
        self.setStrokeColor(colors.HexColor('#d1d5db'))
        self.setLineWidth(0.5)
        self.line(1.8 * cm, 1.4 * cm, A4[0] - 1.8 * cm, 1.4 * cm)
        self.restoreState()


DEFAULT_TEMPLATE = """\
Dear {client_first_name},

Thank you for the opportunity to quote for your heat pump installation at {property_address}.

Please find enclosed your quotation, reference {quote_ref}. The total cost of the works is £{total_inc_vat} inc VAT{bus_grant_line}, leaving £{client_pays} for you to pay.

Payment is arranged in three stages: a deposit of £{deposit_amount} on confirmation of order, a further advance of £{advance_amount} {advance_trigger}, and the balance on commissioning.

This quotation is valid for {valid_days} days from the date above. Please take some time to review the enclosed documents, including the terms and conditions and your cancellation rights, before signing.

If you have any questions, I'm happy to talk you through any part of this.

Kind regards,

{company_name}
{company_phone}
{company_email}
"""


def create_quote_cover_letter_pdf(data, output_filename):
    company = data.get('company', {})
    client  = data.get('client', {})
    quote   = data.get('quote', {})

    client_title   = client.get('title', '')
    client_first   = client.get('firstName', '')
    client_surname = client.get('surname', '')
    full_name_parts = [p for p in [client_title, client_first, client_surname] if p]
    client_full_name = ' '.join(full_name_parts) or 'Homeowner'

    bus_grant = quote.get('busGrant', 0) or 0
    bus_grant_line = f", less a Boiler Upgrade Scheme grant of £{bus_grant:,.2f}" if bus_grant > 0 else ""

    tokens = {
        'client_first_name': client_first or 'Homeowner',
        'client_surname':    client_surname,
        'client_full_name':  client_full_name,
        'property_address':  client.get('propertyAddress', 'the property'),
        'company_name':      company.get('name', ''),
        'company_phone':     company.get('phone', ''),
        'company_email':     company.get('email', ''),
        'date':              datetime.now().strftime('%d %B %Y'),
        'quote_ref':         quote.get('reference', client.get('quoteRef', '')),
        'total_inc_vat':     f"{quote.get('totalIncVat', 0):,.2f}",
        'deposit_amount':    f"{quote.get('depositAmount', 0):,.2f}",
        'advance_amount':    f"{quote.get('advanceAmount', 0):,.2f}",
        'advance_trigger':   quote.get('advanceTrigger', 'on receipt of goods on site'),
        'valid_days':        quote.get('validDays', 30),
        'bus_grant_amount':  f"{bus_grant:,.2f}",
        'client_pays':       f"{quote.get('clientPays', 0):,.2f}",
        'bus_grant_line':    bus_grant_line,
    }

    raw_template = company.get('quoteCoverLetterTemplate') or DEFAULT_TEMPLATE
    letter_body = resolve_tokens(raw_template, tokens)

    doc = SimpleDocTemplate(
        output_filename, pagesize=A4,
        rightMargin=2.5*cm, leftMargin=2.5*cm, topMargin=2*cm, bottomMargin=2.5*cm,
    )

    footer_left = company.get('name', '')
    if company.get('mcsNumber'):
        footer_left += f"  |  MCS {company.get('mcsNumber')}"

    def make_canvas(*args, **kwargs):
        return PageNumCanvas(*args, footer_left=footer_left, **kwargs)

    styles = getSampleStyleSheet()
    brand_style = ParagraphStyle('Brand', parent=styles['Normal'],
        fontSize=11, textColor=BLUE_MID, alignment=TA_CENTER, spaceAfter=2)
    title_style = ParagraphStyle('Title', parent=styles['Heading1'],
        fontSize=17, textColor=BLUE_DARK, spaceAfter=4, alignment=TA_CENTER)
    date_style = ParagraphStyle('Date', parent=styles['Normal'],
        fontSize=10, textColor=colors.HexColor('#6b7280'), alignment=TA_RIGHT)
    address_style = ParagraphStyle('Addr', parent=styles['Normal'],
        fontSize=10, textColor=GRAY_DARK, spaceAfter=2, leading=14)
    body_style = ParagraphStyle('Body', parent=styles['Normal'],
        fontSize=10.5, textColor=GRAY_DARK, leading=16, spaceAfter=10, alignment=TA_JUSTIFY)

    story = []
    story.append(Paragraph("OpenHeatLoss.com", brand_style))
    story.append(Paragraph("Quotation & Contract Pack", title_style))
    story.append(Spacer(1, 0.4*cm))
    story.append(HRFlowable(width='100%', thickness=1, color=BLUE_LIGHT, spaceAfter=0.3*cm))

    company_lines = [l for l in [
        f"<b>{company.get('name','')}</b>" if company.get('name') else None,
        company.get('address'), company.get('phone'), company.get('email'),
    ] if l]
    header_table = Table(
        [[Paragraph('<br/>'.join(company_lines), address_style),
          Paragraph(datetime.now().strftime('%d %B %Y'), date_style)]],
        colWidths=[12*cm, 5*cm],
    )
    header_table.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('LEFTPADDING', (0,0), (-1,-1), 0), ('RIGHTPADDING', (0,0), (-1,-1), 0),
        ('TOPPADDING', (0,0), (-1,-1), 0), ('BOTTOMPADDING', (0,0), (-1,-1), 0),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 0.5*cm))

    for line in [p for p in [client_full_name, client.get('propertyAddress')] if p]:
        story.append(Paragraph(line, address_style))
    story.append(Spacer(1, 0.6*cm))

    for para in letter_body.strip().split('\n\n'):
        para = para.strip()
        if para:
            story.append(Paragraph(' '.join(l.strip() for l in para.split('\n') if l.strip()), body_style))

    doc.build(story, canvasmaker=make_canvas)
    return output_filename


if __name__ == "__main__":
    with open(sys.argv[1], 'r') as f:
        data = json.load(f)
    output_file = sys.argv[2] if len(sys.argv) > 2 else "quote_cover_letter.pdf"
    create_quote_cover_letter_pdf(data, output_file)
    print(f"PDF generated: {output_file}")
