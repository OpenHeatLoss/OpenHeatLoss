#!/usr/bin/env python3
"""
Installer Warranty PDF Generator
Renders company-supplied warranty wording as-is, with merge tokens resolved.
No default content is shipped — warranty wording is specific to each installer's
obligations and must not be seeded by this tool. If no template is set, a clear
placeholder is shown so the gap is visible, not silently omitted, in the generated pack.
"""

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
import json
import sys
from pdf_helpers import resolve_tokens

BLUE_DARK = colors.HexColor('#1e3a8a')
GRAY_DARK = colors.HexColor('#374151')
AMBER_BG  = colors.HexColor('#fef3c7')
AMBER_TXT = colors.HexColor('#92400e')

TITLE = "Installer Warranty"
PLACEHOLDER = (
    "Warranty wording has not yet been configured. Add your business's "
    "approved installer warranty in Settings → Company Details before "
    "sending this pack to a customer."
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
    title_style = ParagraphStyle('T', parent=styles['Heading1'], fontSize=15, textColor=BLUE_DARK,
        spaceAfter=12, alignment=TA_CENTER)
    body_style = ParagraphStyle('B', parent=styles['Normal'], fontSize=10, textColor=GRAY_DARK,
        leading=15, spaceAfter=8, alignment=TA_JUSTIFY)
    placeholder_style = ParagraphStyle('P', parent=styles['Normal'], fontSize=10, textColor=AMBER_TXT,
        backColor=AMBER_BG, borderPadding=10, leading=15)

    story = [Paragraph(TITLE, title_style)]
    if template and template.strip():
        resolved = resolve_tokens(template, tokens)
        for para in resolved.strip().split('\n\n'):
            para = para.strip()
            if para:
                story.append(Paragraph(' '.join(l.strip() for l in para.split('\n') if l.strip()), body_style))
    else:
        story.append(Spacer(1, 0.3*cm))
        story.append(Paragraph(PLACEHOLDER, placeholder_style))

    doc.build(story)
    return output_filename


if __name__ == "__main__":
    with open(sys.argv[1], 'r') as f:
        data = json.load(f)
    output_file = sys.argv[2] if len(sys.argv) > 2 else "warranty.pdf"
    create_pdf(data, output_file)
    print(f"PDF generated: {output_file}")
