#!/usr/bin/env python3
"""
Express Request Form PDF Generator
Distinct from the other compliance documents — this form is operationally
critical (it's what lets work start before the cancellation period ends),
so it gets a deliberately different visual treatment: amber header band and
an explicit plain-English callout, so it can't be missed when flicking
through a merged pack. Placed early in the pack order for the same reason.
"""

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
import json
import sys
from pdf_helpers import resolve_tokens

AMBER      = colors.HexColor('#b45309')
AMBER_BG   = colors.HexColor('#fef3c7')
AMBER_DARK = colors.HexColor('#92400e')
GRAY_DARK  = colors.HexColor('#374151')

CALLOUT = (
    "Action required if you want work to start before your cancellation "
    "period ends. Sign and return this form to confirm."
)
PLACEHOLDER = (
    "The express request form has not yet been configured. Add your "
    "business's approved wording in Settings → Company Details."
)


def create_pdf(data, output_filename):
    template = data.get('template')
    client   = data.get('client', {})

    tokens = {
        'client_full_name': ' '.join(p for p in [client.get('title',''), client.get('firstName',''), client.get('surname','')] if p) or 'Homeowner',
        'property_address': client.get('propertyAddress', ''),
        'company_name':     client.get('companyName', ''),
        'date':              '',
        'quote_ref':         client.get('quoteRef', ''),
    }

    doc = SimpleDocTemplate(output_filename, pagesize=A4,
        rightMargin=2.5*cm, leftMargin=2.5*cm, topMargin=2*cm, bottomMargin=2.5*cm)
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle('T', parent=styles['Heading1'], fontSize=15, textColor=AMBER_DARK,
        spaceAfter=8, alignment=TA_CENTER)
    body_style = ParagraphStyle('B', parent=styles['Normal'], fontSize=10, textColor=GRAY_DARK,
        leading=15, spaceAfter=8, alignment=TA_JUSTIFY)
    placeholder_style = ParagraphStyle('P', parent=styles['Normal'], fontSize=10, textColor=AMBER_DARK,
        backColor=AMBER_BG, borderPadding=10, leading=15)

    # Amber header band — always present, regardless of template content
    callout_table = Table([[Paragraph(f"<b>⚠ {CALLOUT}</b>",
        ParagraphStyle('C', parent=styles['Normal'], fontSize=11, textColor=colors.white))]],
        colWidths=[16*cm])
    callout_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), AMBER),
        ('TOPPADDING', (0,0), (-1,-1), 12), ('BOTTOMPADDING', (0,0), (-1,-1), 12),
        ('LEFTPADDING', (0,0), (-1,-1), 12), ('RIGHTPADDING', (0,0), (-1,-1), 12),
    ]))

    story = [
        Paragraph("Express Request for Work to Commence", title_style),
        Spacer(1, 0.2*cm),
        callout_table,
        Spacer(1, 0.4*cm),
    ]

    if template and template.strip():
        resolved = resolve_tokens(template, tokens)
        for para in resolved.strip().split('\n\n'):
            para = para.strip()
            if para:
                story.append(Paragraph(' '.join(l.strip() for l in para.split('\n') if l.strip()), body_style))
    else:
        story.append(Paragraph(PLACEHOLDER, placeholder_style))

    doc.build(story)
    return output_filename


if __name__ == "__main__":
    with open(sys.argv[1], 'r') as f:
        data = json.load(f)
    output_file = sys.argv[2] if len(sys.argv) > 2 else "express_request.pdf"
    create_pdf(data, output_file)
    print(f"PDF generated: {output_file}")
