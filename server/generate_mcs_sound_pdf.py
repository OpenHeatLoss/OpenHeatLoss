#!/usr/bin/env python3
"""
MCS 020 a) Sound Calculation PDF Generator
Generates professional PDF reports for permitted development compliance
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

def create_mcs_sound_pdf(data, output_filename):
    """
    Generate MCS 020 a) Sound Calculation PDF
    
    Args:
        data: Dictionary containing project and assessment data
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
        textColor=colors.HexColor('#c2410c'),
        spaceAfter=12,
        alignment=TA_CENTER
    )
    
    heading_style = ParagraphStyle(
        'CustomHeading',
        parent=styles['Heading2'],
        fontSize=12,
        textColor=colors.HexColor('#ea580c'),
        spaceAfter=6,
        spaceBefore=12
    )
    
    # Build document
    story = []
    
    # Header
    brand_style = ParagraphStyle('Brand', parent=styles['Normal'],
        fontSize=11, textColor=colors.HexColor('#1e40af'), alignment=TA_CENTER, spaceAfter=2)
    story.append(Paragraph("OpenHeatLoss.com", brand_style))
    story.append(Paragraph("MCS 020 a) Sound Calculation Assessment", title_style))
    story.append(Spacer(1, 0.3*cm))
    
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
        ["Postcode:", data.get('customerPostcode', 'N/A')]
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
    
    # Heat Pump Sound Data
    story.append(Paragraph("Heat Pump Sound Data", heading_style))
    sound_data = [
        ["A-weighted Sound Power Level:", f"{data.get('soundPowerLevel', 0)} dB(A)"]
    ]
    sound_table = Table(sound_data, colWidths=[10*cm, 7*cm])
    sound_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#e5e7eb')),
        ('TEXTCOLOR', (0, 0), (-1, -1), colors.black),
        ('ALIGN', (0, 0), (0, -1), 'LEFT'),
        ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (1, 0), (1, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(sound_table)
    story.append(Paragraph("<i>From manufacturer's data (not low noise mode)</i>", styles['Normal']))
    story.append(Spacer(1, 0.5*cm))
    
    # Assessment Positions
    story.append(Paragraph("Assessment Positions", heading_style))
    
    assessments = data.get('assessments', [])
    for idx, assessment in enumerate(assessments, 1):
        story.append(Paragraph(f"<b>Assessment Position {idx}</b>", styles['Normal']))
        story.append(Spacer(1, 0.2*cm))
        
        # Assessment details table
        assessment_data = [
            ["Date of Calculation:", assessment.get('date', 'N/A')],
            ["Description:", assessment.get('description', 'N/A')],
            ["Sound Power Level:", f"{assessment.get('soundPowerLevel', 0)} dB(A)"],
            ["Directivity (Q):", assessment.get('directivity', 'N/A')],
            ["Distance:", f"{assessment.get('distance', 0)} m"],
            ["Barrier Type:", get_barrier_description(assessment.get('barrierType', 'none'))],
            ["Line of Sight:", get_line_of_sight_description(assessment.get('lineOfSight', 'full'))],
        ]
        
        assessment_table = Table(assessment_data, colWidths=[6*cm, 11*cm])
        assessment_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#f3f4f6')),
            ('TEXTCOLOR', (0, 0), (-1, -1), colors.black),
            ('ALIGN', (0, 0), (0, -1), 'LEFT'),
            ('ALIGN', (1, 0), (1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ]))
        story.append(assessment_table)
        story.append(Spacer(1, 0.2*cm))
        
        # Result
        result = assessment.get('result', 0)
        passes = assessment.get('passes', False)
        
        result_data = [
            ["Calculated Sound Pressure Level:", f"{result:.1f} dB(A)"],
            ["Permitted Development Limit:", "37.0 dB(A)"],
            ["Result:", "PASS ✓" if passes else "FAIL ✗"]
        ]
        
        result_table = Table(result_data, colWidths=[8*cm, 9*cm])
        bg_color = colors.HexColor('#dcfce7') if passes else colors.HexColor('#fee2e2')
        text_color = colors.HexColor('#15803d') if passes else colors.HexColor('#dc2626')
        
        result_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), bg_color),
            ('TEXTCOLOR', (0, 0), (1, 1), colors.black),
            ('TEXTCOLOR', (1, 2), (1, 2), text_color),
            ('ALIGN', (0, 0), (0, -1), 'LEFT'),
            ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTNAME', (1, 2), (1, 2), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('FONTSIZE', (1, 2), (1, 2), 12),
            ('GRID', (0, 0), (-1, -1), 1, colors.grey),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ]))
        story.append(result_table)
        story.append(Spacer(1, 0.5*cm))
    
    # Overall Result
    story.append(PageBreak())
    story.append(Paragraph("Overall Assessment Result", heading_style))
    story.append(Spacer(1, 0.3*cm))
    
    all_pass = all(a.get('passes', False) for a in assessments)
    overall_status = "COMPLIES WITH PERMITTED DEVELOPMENT" if all_pass else "DOES NOT COMPLY"
    overall_color = colors.HexColor('#15803d') if all_pass else colors.HexColor('#dc2626')
    overall_bg = colors.HexColor('#dcfce7') if all_pass else colors.HexColor('#fee2e2')
    
    overall_style = ParagraphStyle(
        'Overall',
        parent=styles['Normal'],
        fontSize=14,
        textColor=overall_color,
        alignment=TA_CENTER,
        borderColor=overall_color,
        borderWidth=2,
        borderPadding=12,
        backColor=overall_bg,
        spaceAfter=12
    )
    
    story.append(Paragraph(f"<b>{overall_status}</b>", overall_style))
    story.append(Spacer(1, 0.5*cm))
    
    # Summary Table
    story.append(Paragraph("Summary of All Assessment Positions", heading_style))
    
    summary_header = [["Position", "Description", "Distance (m)", "Result dB(A)", "Status"]]
    summary_data = []
    
    for idx, assessment in enumerate(assessments, 1):
        summary_data.append([
            str(idx),
            assessment.get('description', 'N/A')[:40],  # Truncate long descriptions
            f"{assessment.get('distance', 0):.1f}",
            f"{assessment.get('result', 0):.1f}",
            "PASS" if assessment.get('passes', False) else "FAIL"
        ])
    
    summary_table = Table(summary_header + summary_data, 
                          colWidths=[1.5*cm, 7*cm, 2.5*cm, 3*cm, 3*cm])
    
    style_list = [
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#374151')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 10),
        ('FONTSIZE', (0, 1), (-1, -1), 9),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]
    
    # Color rows based on pass/fail
    for idx, assessment in enumerate(assessments, 1):
        row_idx = idx
        if assessment.get('passes', False):
            style_list.append(('BACKGROUND', (0, row_idx), (-1, row_idx), colors.white))
            style_list.append(('TEXTCOLOR', (4, row_idx), (4, row_idx), colors.HexColor('#15803d')))
        else:
            style_list.append(('BACKGROUND', (0, row_idx), (-1, row_idx), colors.HexColor('#fef2f2')))
            style_list.append(('TEXTCOLOR', (4, row_idx), (4, row_idx), colors.HexColor('#dc2626')))
        style_list.append(('FONTNAME', (4, row_idx), (4, row_idx), 'Helvetica-Bold'))
    
    summary_table.setStyle(TableStyle(style_list))
    story.append(summary_table)
    story.append(Spacer(1, 0.5*cm))
    
    # Recommendations (if not compliant)
    if not all_pass:
        story.append(Paragraph("Recommendations", heading_style))
        recommendations = [
            "• Relocate the heat pump further from neighbouring properties",
            "• Install acoustic barriers between the heat pump and assessment positions",
            "• Select a quieter heat pump model with lower sound power level",
            "• Apply for planning permission instead of relying on permitted development"
        ]
        for rec in recommendations:
            story.append(Paragraph(rec, styles['Normal']))
            story.append(Spacer(1, 0.1*cm))
        story.append(Spacer(1, 0.5*cm))
    
    # Important Notes
    story.append(Paragraph("Important Notes", heading_style))
    notes = [
        "• Assessment positions are 1m from the center of doors/windows to habitable rooms",
        "• Habitable rooms include bedrooms and living rooms, NOT bathrooms, toilets, or utility rooms",
        "• A reflecting surface is any surface within 1m of the heat pump",
        "• Heat pumps with more than 3 reflecting surfaces will NOT meet MCS 020 a)",
        "• Sound power level must NOT be in 'low noise mode'",
        "• This assessment should be retained for records and provided to the customer"
    ]
    for note in notes:
        story.append(Paragraph(note, styles['Normal']))
        story.append(Spacer(1, 0.1*cm))
    
    # Build PDF
    doc.build(story)
    return output_filename

def get_barrier_description(barrier_type):
    descriptions = {
        'type1': 'Type 1 - Solid brick/masonry wall or ≥18mm fence',
        'type2': 'Type 2 - Solid fence <18mm thick',
        'none': 'No Barrier'
    }
    return descriptions.get(barrier_type, barrier_type)

def get_line_of_sight_description(los):
    descriptions = {
        'full': 'Full View',
        'partial': 'Partial View',
        'no_view': 'No View'
    }
    return descriptions.get(los, los)

if __name__ == "__main__":
    # Read JSON data from stdin or file
    if len(sys.argv) > 1:
        with open(sys.argv[1], 'r') as f:
            data = json.load(f)
        output_file = sys.argv[2] if len(sys.argv) > 2 else "mcs_sound_assessment.pdf"
    else:
        data = json.load(sys.stdin)
        output_file = "mcs_sound_assessment.pdf"
    
    create_mcs_sound_pdf(data, output_file)
    print(f"PDF generated: {output_file}")
