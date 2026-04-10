#!/usr/bin/env python3
"""
MCS 031 Heat Pump Performance Estimate PDF Generator
Generates professional PDF reports for MCS certification
"""

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
import json
import sys
from datetime import datetime

def create_mcs_performance_pdf(data, output_filename):
    """
    Generate MCS 031 Performance Estimate PDF
    
    Args:
        data: Dictionary containing project and calculation data
        output_filename: Path to save the PDF
    """
    doc = SimpleDocTemplate(
        output_filename,
        pagesize=A4,
        rightMargin=2*cm,
        leftMargin=2*cm,
        topMargin=2*cm,
        bottomMargin=2*cm
    )
    
    # Styles
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=16,
        textColor=colors.HexColor('#1e3a8a'),
        spaceAfter=12,
        alignment=TA_CENTER
    )
    
    heading_style = ParagraphStyle(
        'CustomHeading',
        parent=styles['Heading2'],
        fontSize=12,
        textColor=colors.HexColor('#1e40af'),
        spaceAfter=6,
        spaceBefore=12
    )
    
    # Build document
    story = []
    
    # Header
    story.append(Paragraph("MCS 031 Heat Pump System Performance Estimate", title_style))
    story.append(Spacer(1, 0.5*cm))
    
    # Project Information
    story.append(Paragraph("Project Information", heading_style))
    project_data = [
        ["Project Name:", data.get('projectName', 'N/A')],
        ["Location:", data.get('location', 'N/A')],
        ["Designer:", data.get('designer', 'N/A')],
        ["Calculation Date:", data.get('calculatedAt', datetime.now().strftime('%d/%m/%Y'))],
        ["Report Generated:", datetime.now().strftime('%d/%m/%Y')]
    ]
    project_table = Table(project_data, colWidths=[5*cm, 12*cm])
    project_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#e5e7eb')),
        ('TEXTCOLOR', (0, 0), (-1, -1), colors.black),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(project_table)
    story.append(Spacer(1, 0.5*cm))
    
    # Customer Information
    story.append(Paragraph("Customer Information", heading_style))
    customer_data = [
        ["Name:", f"{data.get('customerTitle', '')} {data.get('customerFirstName', '')} {data.get('customerSurname', '')}".strip()],
        ["Address:", data.get('customerAddress', 'N/A')],
        ["Postcode:", data.get('customerPostcode', 'N/A')],
        ["Telephone:", data.get('customerTelephone', 'N/A')],
        ["Email:", data.get('customerEmail', 'N/A')]
    ]
    customer_table = Table(customer_data, colWidths=[5*cm, 12*cm])
    customer_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#e5e7eb')),
        ('TEXTCOLOR', (0, 0), (-1, -1), colors.black),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(customer_table)
    story.append(Spacer(1, 0.5*cm))
    
    # Star Rating
    stars = data.get('stars', 0)
    star_rating = '⭐' * stars if stars > 0 else 'No stars'
    
    star_data = [
        ["System Emitter Star Rating", star_rating],
    ]
    star_table = Table(star_data, colWidths=[10*cm, 7*cm])
    star_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#fef3c7')),
        ('TEXTCOLOR', (0, 0), (-1, -1), colors.black),
        ('ALIGN', (0, 0), (0, 0), 'LEFT'),
        ('ALIGN', (1, 0), (1, 0), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (0, 0), 10),
        ('FONTSIZE', (1, 0), (1, 0), 16),
        ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#fbbf24')),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
    ]))
    story.append(star_table)
    story.append(Spacer(1, 0.3*cm))
    story.append(Paragraph("<i>Based on the proposed design flow temperature of the system, ranging between 0 and 6 stars</i>", styles['Normal']))
    story.append(Spacer(1, 0.5*cm))
    
    # Energy Requirements
    story.append(Paragraph("Your Energy Requirements", heading_style))
    energy_data = [
        ["Energy required for heating", f"{data.get('spaceHeatingDemand', 0):.0f} kWh"],
        ["Demand supplied by heat pump", f"{data.get('spaceHeatingDemand', 0):.0f} kWh"],
        ["Energy required for hot water", f"{data.get('hotWaterDemand', 0):.0f} kWh"],
        ["Demand supplied by heat pump", f"{data.get('hotWaterDemand', 0):.0f} kWh"]
    ]
    energy_table = Table(energy_data, colWidths=[12*cm, 5*cm])
    energy_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#f3f4f6')),
        ('TEXTCOLOR', (0, 0), (-1, -1), colors.black),
        ('ALIGN', (0, 0), (0, -1), 'LEFT'),
        ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ('FONTNAME', (1, 0), (1, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(energy_table)
    story.append(Spacer(1, 0.5*cm))
    
    # Property Information
    story.append(Paragraph("Your Property", heading_style))
    property_data = [
        ["Postcode prefix", data.get('customerPostcode', 'N/A')],
        ["Total property floorspace", f"{data.get('totalFloorArea', 0):.0f} m²"],
        ["Average watts per square metre", f"{data.get('wattsPerM2', 0):.1f} W/m²"]
    ]
    property_table = Table(property_data, colWidths=[12*cm, 5*cm])
    property_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#f3f4f6')),
        ('TEXTCOLOR', (0, 0), (-1, -1), colors.black),
        ('ALIGN', (0, 0), (0, -1), 'LEFT'),
        ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ('FONTNAME', (1, 0), (1, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(property_table)
    story.append(Paragraph("<i>0-30W/m² is very low heat loss and 120-150W/m² is very high heat loss</i>", styles['Normal']))
    story.append(Spacer(1, 0.5*cm))
    
    # Proposed System
    story.append(Paragraph("Proposed System", heading_style))
    system_data = [
        ["Heat pump capacity", f"{data.get('heatPumpCapacity', 0):.1f} kW (indicative)"],
        ["Heat pump type", data.get('heatPumpType', 'N/A')],
        ["System provides", data.get('systemProvides', 'N/A')],
        ["Heating system", data.get('emitterType', 'N/A')],
        ["Proposed flow temperature", data.get('flowTempBand', 'N/A')]
    ]
    system_table = Table(system_data, colWidths=[10*cm, 7*cm])
    system_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#f3f4f6')),
        ('TEXTCOLOR', (0, 0), (-1, -1), colors.black),
        ('ALIGN', (0, 0), (0, -1), 'LEFT'),
        ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ('FONTNAME', (1, 0), (1, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(system_table)
    story.append(Spacer(1, 0.5*cm))
    
    # Performance
    story.append(Paragraph("Performance", heading_style))
    performance_data = [
        ["Seasonal Performance Factor (SPF)", f"{data.get('spf', 0):.1f}"],
        ["Low estimate", f"{data.get('lowEstimate', 0):.0f} kWh"],
        ["High estimate", f"{data.get('highEstimate', 0):.0f} kWh"]
    ]
    performance_table = Table(performance_data, colWidths=[12*cm, 5*cm])
    performance_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, 0), colors.HexColor('#dcfce7')),
        ('BACKGROUND', (1, 0), (1, 0), colors.HexColor('#dcfce7')),
        ('BACKGROUND', (0, 1), (0, -1), colors.HexColor('#f3f4f6')),
        ('TEXTCOLOR', (0, 0), (-1, -1), colors.black),
        ('ALIGN', (0, 0), (0, -1), 'LEFT'),
        ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ('FONTNAME', (1, 0), (1, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('FONTSIZE', (1, 0), (1, 0), 14),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(performance_table)
    story.append(Paragraph("<i>You can convert these figures to approximate running costs</i>", styles['Normal']))
    story.append(Spacer(1, 0.5*cm))
    
    # Warning Notes
    if data.get('warningNotes') and len(data.get('warningNotes', [])) > 0:
        story.append(Paragraph("Applicable Warning Notes", heading_style))
        for note in data.get('warningNotes', []):
            story.append(Paragraph(f"<b>Note {note['number']}:</b> {note['text']}", styles['Normal']))
            story.append(Spacer(1, 0.2*cm))
        story.append(Spacer(1, 0.3*cm))
    
    # Important Note
    story.append(Spacer(1, 0.5*cm))
    important_style = ParagraphStyle(
        'Important',
        parent=styles['Normal'],
        fontSize=9,
        textColor=colors.HexColor('#7f1d1d'),
        borderColor=colors.HexColor('#fee2e2'),
        borderWidth=1,
        borderPadding=8,
        backColor=colors.HexColor('#fef2f2')
    )
    story.append(Paragraph(
        "<b>Important Note:</b> This is not a detailed system design. It offers a reasonable estimate of likely "
        "performance and a description of the likely design. Details may change after the heat loss survey and design.",
        important_style
    ))
    
    # Build PDF
    doc.build(story)
    return output_filename

if __name__ == "__main__":
    # Read JSON data from stdin or file
    if len(sys.argv) > 1:
        with open(sys.argv[1], 'r') as f:
            data = json.load(f)
        output_file = sys.argv[2] if len(sys.argv) > 2 else "mcs_performance_estimate.pdf"
    else:
        data = json.load(sys.stdin)
        output_file = "mcs_performance_estimate.pdf"
    
    create_mcs_performance_pdf(data, output_file)
    print(f"PDF generated: {output_file}")
