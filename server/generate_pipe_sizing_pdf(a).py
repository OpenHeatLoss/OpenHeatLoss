#!/usr/bin/env python3
"""
Pipe Sizing Installation Report PDF Generator
Generates professional PDF documentation for heating system pipe sizing and pump selection
"""

import sys
import json
from datetime import datetime
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from reportlab.pdfgen import canvas

def create_header_footer(canvas_obj, doc):
    """Add header and footer to each page"""
    canvas_obj.saveState()
    
    # Header
    canvas_obj.setFont('Helvetica-Bold', 12)
    canvas_obj.drawString(2*cm, A4[1] - 1.5*cm, "Pipe Sizing Installation Report")
    
    # Footer
    canvas_obj.setFont('Helvetica', 8)
    canvas_obj.drawString(2*cm, 1*cm, f"Generated: {datetime.now().strftime('%d/%m/%Y %H:%M')}")
    canvas_obj.drawRightString(A4[0] - 2*cm, 1*cm, f"Page {doc.page}")
    
    canvas_obj.restoreState()

def generate_pipe_sizing_pdf(data, output_path):
    """Generate pipe sizing installation report PDF"""
    
    # Create PDF document
    doc = SimpleDocTemplate(
        output_path,
        pagesize=A4,
        rightMargin=2*cm,
        leftMargin=2*cm,
        topMargin=2.5*cm,
        bottomMargin=2*cm
    )
    
    # Container for PDF elements
    story = []
    
    # Styles
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=24,
        textColor=colors.HexColor('#1a5490'),
        spaceAfter=30,
        alignment=TA_CENTER
    )
    heading_style = ParagraphStyle(
        'CustomHeading',
        parent=styles['Heading2'],
        fontSize=14,
        textColor=colors.HexColor('#1a5490'),
        spaceAfter=12,
        spaceBefore=12
    )
    normal_style = styles['Normal']
    
    # Title
    story.append(Paragraph("Pipe Sizing Installation Report", title_style))
    story.append(Spacer(1, 0.5*cm))
    
    # Project Information Section
    story.append(Paragraph("Project Information", heading_style))
    
    project_data = [
        ['Project Name:', data.get('projectName', 'N/A')],
        ['Location:', data.get('location', 'N/A')],
        ['Designer:', data.get('designer', 'N/A')],
        ['Date:', datetime.now().strftime('%d %B %Y')],
    ]
    
    if data.get('customerName'):
        project_data.append(['Customer:', data.get('customerName', 'N/A')])
    
    project_table = Table(project_data, colWidths=[5*cm, 12*cm])
    project_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('TEXTCOLOR', (0, 0), (0, -1), colors.HexColor('#1a5490')),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
    ]))
    
    story.append(project_table)
    story.append(Spacer(1, 0.5*cm))
    
    # System Overview Section
    story.append(Paragraph("System Overview", heading_style))
    
    system_data = [
        ['Heat Pump Output:', f"{data.get('heatPumpOutput', 0)} kW"],
        ['Design Flow Temperature:', f"{data.get('designFlowTemp', 50)}°C"],
        ['Design Return Temperature:', f"{data.get('designReturnTemp', 40)}°C"],
        ['Design ΔT:', f"{data.get('designFlowTemp', 50) - data.get('designReturnTemp', 40)}°C"],
        ['System Flow Rate:', f"{data.get('systemFlowRate', 0)} l/s ({round(data.get('systemFlowRate', 0) * 3.6, 2)} m³/h)"],
    ]
    
    system_table = Table(system_data, colWidths=[6*cm, 11*cm])
    system_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('TEXTCOLOR', (0, 0), (0, -1), colors.HexColor('#1a5490')),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#f0f4f8')),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#c0d0e0')),
    ]))
    
    story.append(system_table)
    story.append(Spacer(1, 0.8*cm))
    
    # All Pipe Sections Table
    story.append(Paragraph("All Pipe Sections", heading_style))
    
    sections = data.get('sections', [])
    
    if sections:
        # Table header
        section_table_data = [
            ['Section', 'Material', 'Diameter', 'Length\n(m)', 'Flow Rate\n(l/s)', 'Velocity\n(m/s)', 'Pressure\nDrop (kPa)', 'Index\nCircuit']
        ]
        
        # Add each section
        for idx, section in enumerate(sections):
            is_index = section.get('includeInIndexCircuit', False)
            section_table_data.append([
                section.get('name', f'Section {idx + 1}'),
                section.get('material', 'N/A'),
                section.get('diameter', 'N/A'),
                f"{section.get('length', 0):.1f}",
                f"{section.get('flowRate', 0):.3f}",
                f"{section.get('velocity', 0):.2f}",
                f"{section.get('pressureDrop', 0):.2f}",
                '✓' if is_index else ''
            ])
        
        section_table = Table(section_table_data, colWidths=[3.5*cm, 2*cm, 2*cm, 1.5*cm, 1.8*cm, 1.8*cm, 2*cm, 1.5*cm])
        
        # Base table style
        table_style = [
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a5490')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f9f9f9')]),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ]
        
        # Highlight index circuit sections in yellow
        for idx, section in enumerate(sections):
            if section.get('includeInIndexCircuit', False):
                table_style.append(('BACKGROUND', (0, idx + 1), (-1, idx + 1), colors.HexColor('#fff3cd')))
                table_style.append(('TEXTCOLOR', (7, idx + 1), (7, idx + 1), colors.HexColor('#856404')))
                table_style.append(('FONTNAME', (7, idx + 1), (7, idx + 1), 'Helvetica-Bold'))
        
        section_table.setStyle(TableStyle(table_style))
        story.append(section_table)
    else:
        story.append(Paragraph("No pipe sections defined.", normal_style))
    
    story.append(Spacer(1, 0.8*cm))
    
    # Index Circuit & Pump Requirements Section
    index_circuit = data.get('indexCircuit', {})
    
    if index_circuit and index_circuit.get('sections'):
        story.append(Paragraph("Index Circuit & Pump Requirements", heading_style))
        
        # Index circuit path box
        story.append(Paragraph("<b>Index Circuit Path (Critical Path):</b>", normal_style))
        story.append(Spacer(1, 0.2*cm))
        
        # List sections in the index circuit
        index_sections_data = [['Step', 'Section Name', 'Material', 'Diameter', 'Length (m)', 'Pressure Drop (kPa)']]
        
        for idx, section in enumerate(index_circuit['sections']):
            index_sections_data.append([
                str(idx + 1),
                section.get('name', 'Unnamed'),
                section.get('material', 'N/A'),
                section.get('diameter', 'N/A'),
                f"{section.get('length', 0):.1f}",
                f"{section.get('pressureDrop', 0):.2f}"
            ])
        
        index_table = Table(index_sections_data, colWidths=[1.5*cm, 5*cm, 2.5*cm, 2.5*cm, 2*cm, 3*cm])
        index_table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#ffc107')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor('#856404')),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#fff3cd')),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ]))
        
        story.append(index_table)
        story.append(Spacer(1, 0.5*cm))
        
        # Pump requirements summary
        total_pressure_drop = index_circuit.get('totalPressureDrop', 0)
        total_length = index_circuit.get('totalLength', 0)
        pressure_head_meters = total_pressure_drop * 0.102  # kPa to meters
        
        pump_data = [
            ['Total Circuit Length:', f"{total_length:.1f} m"],
            ['Total Pressure Drop:', f"{total_pressure_drop:.2f} kPa"],
            ['Required Pump Head:', f"{pressure_head_meters:.2f} m ({total_pressure_drop:.2f} kPa)"],
            ['System Flow Rate:', f"{data.get('systemFlowRate', 0):.3f} l/s ({round(data.get('systemFlowRate', 0) * 3.6, 2)} m³/h)"],
        ]
        
        pump_table = Table(pump_data, colWidths=[6*cm, 11*cm])
        pump_table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTNAME', (1, 0), (1, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 11),
            ('TEXTCOLOR', (0, 0), (0, -1), colors.HexColor('#1a5490')),
            ('TEXTCOLOR', (1, 0), (1, -1), colors.HexColor('#d9534f')),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#e8f4f8')),
            ('BOX', (0, 0), (-1, -1), 2, colors.HexColor('#1a5490')),
        ]))
        
        story.append(pump_table)
        story.append(Spacer(1, 0.5*cm))
        
        # Pump selection guidance
        story.append(Paragraph("<b>Pump Selection Guidance:</b>", normal_style))
        story.append(Spacer(1, 0.2*cm))
        
        guidance = [
            f"• Select a pump capable of delivering <b>{pressure_head_meters:.2f}m head</b> at <b>{round(data.get('systemFlowRate', 0) * 3.6, 2)} m³/h</b> flow rate",
            "• Add 10-20% safety margin for fouling and system expansion",
            "• Consider using a variable speed pump for improved energy efficiency",
            "• Verify that the pump operating point falls within the manufacturer's efficiency curve",
            "• If using the heat pump's internal pump, ensure its residual head exceeds the system requirement",
        ]
        
        for item in guidance:
            story.append(Paragraph(item, normal_style))
            story.append(Spacer(1, 0.1*cm))
        
    else:
        story.append(Paragraph("Index Circuit & Pump Requirements", heading_style))
        story.append(Paragraph("No index circuit selected. Please select pipe sections that form the critical path.", normal_style))
    
    story.append(Spacer(1, 1*cm))
    
    # Installation Notes
    story.append(Paragraph("Installation Notes", heading_style))
    notes = [
        "• All pipe sections must be installed according to manufacturer specifications",
        "• Ensure proper insulation of all pipework to minimize heat loss",
        "• Install isolation valves at strategic points for maintenance access",
        "• Verify all connections are leak-free before system commissioning",
        "• Flush the system thoroughly before final commissioning",
        "• Install pressure and temperature gauges at key locations",
        "• Ensure adequate pipe supports to prevent sagging and stress",
    ]
    
    for note in notes:
        story.append(Paragraph(note, normal_style))
        story.append(Spacer(1, 0.1*cm))
    
    # Build PDF
    doc.build(story, onFirstPage=create_header_footer, onLaterPages=create_header_footer)
    
    return output_path

def main():
    """Main function to handle command line execution"""
    if len(sys.argv) < 3:
        print("Usage: python3 generate_pipe_sizing_pdf.py <input_json_file> <output_pdf_file>")
        sys.exit(1)
    
    try:
        input_file = sys.argv[1]
        output_file = sys.argv[2]
        
        # Read JSON data from file
        with open(input_file, 'r') as f:
            data = json.load(f)
        
        # Generate PDF
        generate_pipe_sizing_pdf(data, output_file)
        
        print(f"PDF generated successfully: {output_file}")
        
    except Exception as e:
        print(f"Error generating PDF: {str(e)}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
