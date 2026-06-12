#!/usr/bin/env python3
"""
Customer Pack Cover Letter PDF Generator
Generates a plain-English cover letter to accompany the heat loss and emitter design pack.
Supports merge tokens in the letter body:
  {client_title} {client_first_name} {client_surname} {client_full_name}
  {property_address} {total_heat_loss_kw} {design_flow_temp}
  {company_name} {company_phone} {company_email} {date} {quote_ref}
"""

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT, TA_JUSTIFY
import json
import sys
from datetime import datetime

# ── Colour palette — matches heat loss report ────────────────────────────────
BLUE_DARK   = colors.HexColor('#1e3a8a')
BLUE_MID    = colors.HexColor('#1e40af')
BLUE_LIGHT  = colors.HexColor('#dbeafe')
GRAY_LIGHT  = colors.HexColor('#f3f4f6')
GRAY_MID    = colors.HexColor('#e5e7eb')
GRAY_DARK   = colors.HexColor('#374151')
GREEN       = colors.HexColor('#15803d')
GREEN_LIGHT = colors.HexColor('#dcfce7')
AMBER       = colors.HexColor('#b45309')
AMBER_LIGHT = colors.HexColor('#fef3c7')


class PageNumCanvas(rl_canvas.Canvas):
    """Draws a footer with company name and page x/y on every page."""

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

Thank you for the opportunity to survey your property at {property_address}. I'm pleased to share the results of your heat loss assessment and emitter design.

This pack contains a full room-by-room heat loss calculation carried out in accordance with BS EN 12831-1 using the CIBSE Domestic Heating Design Guide 2026 method, along with a detailed emitter schedule showing the radiators specified for your home.

Your home has a calculated peak heat loss of {total_heat_loss_kw} kW at the design external temperature. The system has been designed to operate at a flow temperature of {design_flow_temp}°C, which is well suited to a heat pump installation and will allow the system to run efficiently.

Please take some time to look through the enclosed documents. If you have any questions about the calculations or the proposed emitter sizes, I'm happy to talk you through them.

Next steps:
Once you're happy with the design, I'll prepare a detailed quotation covering all works, equipment, and MCS registration. I'll also provide the MCS 031 Performance Estimate, which gives you an independent indication of how the system is expected to perform over a typical year.

I look forward to hearing from you.

Kind regards,

{company_name}
{company_phone}
{company_email}
"""


def resolve_tokens(text, tokens):
    """Replace all {token} placeholders in text with values from the tokens dict."""
    for key, value in tokens.items():
        text = text.replace('{' + key + '}', str(value) if value else '')
    # Clean up any unreplaced tokens
    import re
    text = re.sub(r'\{[a-z_]+\}', '', text)
    return text


def create_cover_letter_pdf(data, output_filename):
    """
    Generate the cover letter page.

    data keys expected:
      company: { name, phone, email, mcsNumber, address, coverLetterTemplate }
      client:  { title, firstName, surname }
      project: { name, propertyAddress, totalHeatLossKw, designFlowTemp, quoteRef }
    """
    company = data.get('company', {})
    client  = data.get('client',  {})
    project = data.get('project', {})

    # ── Assemble merge tokens ────────────────────────────────────────────────
    client_title   = client.get('title', '')
    client_first   = client.get('firstName', '')
    client_surname = client.get('surname', '')
    full_name_parts = [p for p in [client_title, client_first, client_surname] if p]
    client_full_name = ' '.join(full_name_parts) or 'Homeowner'

    heat_loss_kw = project.get('totalHeatLossKw')
    heat_loss_str = f"{float(heat_loss_kw):.1f}" if heat_loss_kw is not None else 'N/A'

    flow_temp = project.get('designFlowTemp')
    flow_temp_str = f"{int(float(flow_temp))}" if flow_temp is not None else 'N/A'

    tokens = {
        'client_title':      client_title,
        'client_first_name': client_first or 'Homeowner',
        'client_surname':    client_surname,
        'client_full_name':  client_full_name,
        'property_address':  project.get('propertyAddress', 'the property'),
        'total_heat_loss_kw': heat_loss_str,
        'design_flow_temp':  flow_temp_str,
        'company_name':      company.get('name', ''),
        'company_phone':     company.get('phone', ''),
        'company_email':     company.get('email', ''),
        'date':              datetime.now().strftime('%d %B %Y'),
        'quote_ref':         project.get('quoteRef', ''),
    }

    # ── Letter body ──────────────────────────────────────────────────────────
    raw_template = company.get('coverLetterTemplate') or DEFAULT_TEMPLATE
    letter_body = resolve_tokens(raw_template, tokens)

    # ── Document setup ───────────────────────────────────────────────────────
    doc = SimpleDocTemplate(
        output_filename,
        pagesize=A4,
        rightMargin=2.5*cm,
        leftMargin=2.5*cm,
        topMargin=2*cm,
        bottomMargin=2.5*cm,
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
        fontSize=10, textColor=colors.HexColor('#6b7280'), alignment=TA_RIGHT, spaceAfter=0)
    address_style = ParagraphStyle('Addr', parent=styles['Normal'],
        fontSize=10, textColor=GRAY_DARK, spaceAfter=2, leading=14)
    body_style = ParagraphStyle('Body', parent=styles['Normal'],
        fontSize=10.5, textColor=GRAY_DARK, leading=16, spaceAfter=10, alignment=TA_JUSTIFY)
    section_heading_style = ParagraphStyle('SH', parent=styles['Normal'],
        fontSize=10.5, textColor=BLUE_MID, fontName='Helvetica-Bold',
        spaceBefore=10, spaceAfter=4)

    story = []

    # ── Company header ───────────────────────────────────────────────────────
    story.append(Paragraph("OpenHeatLoss.com", brand_style))
    story.append(Paragraph("Heat Loss &amp; Emitter Design — Customer Pack", title_style))
    story.append(Spacer(1, 0.4*cm))
    story.append(HRFlowable(width='100%', thickness=1, color=BLUE_LIGHT, spaceAfter=0.3*cm))

    # Company info left, date right
    company_lines = []
    if company.get('name'):
        company_lines.append(f"<b>{company['name']}</b>")
    if company.get('address'):
        company_lines.append(company['address'])
    if company.get('phone'):
        company_lines.append(company['phone'])
    if company.get('email'):
        company_lines.append(company['email'])
    if company.get('mcsNumber'):
        company_lines.append(f"MCS: {company['mcsNumber']}")

    company_block = Paragraph('<br/>'.join(company_lines), address_style)
    date_block    = Paragraph(datetime.now().strftime('%d %B %Y'), date_style)

    header_table = Table([[company_block, date_block]],
        colWidths=[12*cm, 5*cm])
    header_table.setStyle(TableStyle([
        ('VALIGN',  (0,0), (-1,-1), 'TOP'),
        ('LEFTPADDING',  (0,0), (-1,-1), 0),
        ('RIGHTPADDING', (0,0), (-1,-1), 0),
        ('TOPPADDING',   (0,0), (-1,-1), 0),
        ('BOTTOMPADDING',(0,0), (-1,-1), 0),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 0.5*cm))

    # ── Client address block ─────────────────────────────────────────────────
    client_lines = [p for p in [client_full_name, project.get('propertyAddress')] if p]
    for line in client_lines:
        story.append(Paragraph(line, address_style))
    story.append(Spacer(1, 0.6*cm))

    # ── Letter body ──────────────────────────────────────────────────────────
    # Split on blank lines to create paragraphs; lines starting with a keyword
    # followed by a colon become section headings.
    paragraphs = letter_body.strip().split('\n\n')
    for para in paragraphs:
        para = para.strip()
        if not para:
            continue
        lines = para.split('\n')
        # Detect inline list items (lines starting with a bullet or dash)
        if all(l.strip().startswith(('-', '•', '*')) for l in lines if l.strip()):
            for line in lines:
                clean = line.strip().lstrip('-•* ').strip()
                if clean:
                    story.append(Paragraph(f"&bull; &nbsp; {clean}", body_style))
        # Detect a section heading pattern: short line ending with colon
        elif len(lines) == 1 and lines[0].endswith(':') and len(lines[0]) < 60:
            story.append(Paragraph(lines[0], section_heading_style))
        else:
            # Regular paragraph — join lines with a space
            text = ' '.join(l.strip() for l in lines if l.strip())
            story.append(Paragraph(text, body_style))

    story.append(Spacer(1, 0.5*cm))
    story.append(HRFlowable(width='100%', thickness=0.5, color=GRAY_MID))
    story.append(Spacer(1, 0.3*cm))

    # ── Pack contents box ────────────────────────────────────────────────────
    contents = data.get('packContents', [])
    if contents:
        contents_heading = Paragraph("Documents enclosed in this pack:", section_heading_style)
        story.append(contents_heading)
        for item in contents:
            story.append(Paragraph(f"&bull; &nbsp; {item}", body_style))

    doc.build(story, canvasmaker=make_canvas)
    return output_filename


if __name__ == "__main__":
    if len(sys.argv) > 1:
        with open(sys.argv[1], 'r') as f:
            data = json.load(f)
        output_file = sys.argv[2] if len(sys.argv) > 2 else "cover_letter.pdf"
    else:
        data = json.load(sys.stdin)
        output_file = "cover_letter.pdf"

    create_cover_letter_pdf(data, output_file)
    print(f"PDF generated: {output_file}")
