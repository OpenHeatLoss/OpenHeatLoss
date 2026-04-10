#!/usr/bin/env python3
"""
Pipe Sizing Installation Report PDF Generator
Consistent with heat loss and radiator schedule PDFs:
  - 2cm margins -> 17.0cm usable width
  - PageNumCanvas for page x/y footer + method note
  - Paragraph objects for wrapping text in section name column
  - Material key mapped to display name
  - Title appears once (in story only; canvas header removed)
"""

import sys
import json
from datetime import datetime
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from reportlab.pdfgen import canvas as rl_canvas

# ── Colour palette (aligned with other PDFs) ─────────────────────────────────
BLUE_DARK   = colors.HexColor('#1a5490')
BLUE_MID    = colors.HexColor('#1e40af')
BLUE_LIGHT  = colors.HexColor('#dbeafe')
BLUE_BG     = colors.HexColor('#e8f4f8')
BLUE_RULE   = colors.HexColor('#c0d0e0')
GRAY_LIGHT  = colors.HexColor('#f3f4f6')
GRAY_MID    = colors.HexColor('#e5e7eb')
GRAY_DARK   = colors.HexColor('#374151')
AMBER       = colors.HexColor('#ffc107')
AMBER_TEXT  = colors.HexColor('#856404')
AMBER_LIGHT = colors.HexColor('#fff3cd')
RED         = colors.HexColor('#d9534f')
USABLE_W    = 17.0  # cm — A4 minus 2cm margins each side

# ── Material key → display name ───────────────────────────────────────────────
MATERIAL_NAMES = {
    'copper_tableX': 'Copper (Table X)',
    'copper_tableY': 'Copper (Table Y)',
    'polybutylene':  'Polybutylene',
    'mlcp_riifo':    'MLCP (Riifo)',
    'mlcp_maincor':  'MLCP (Maincor)',
    'pex':           'PEX',
}

def material_label(key):
    return MATERIAL_NAMES.get(key, key)


# ── PageNumCanvas — page x of y footer ───────────────────────────────────────
class PageNumCanvas(rl_canvas.Canvas):
    def __init__(self, *args, footer_note='', **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []
        self._footer_note = footer_note

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
        self.drawString(2 * cm, 1.1 * cm, self._footer_note)
        self.drawRightString(A4[0] - 2 * cm, 1.1 * cm, f"Page {page_num} of {total_pages}")
        self.setStrokeColor(colors.HexColor('#d1d5db'))
        self.setLineWidth(0.5)
        self.line(2 * cm, 1.4 * cm, A4[0] - 2 * cm, 1.4 * cm)
        self.restoreState()


# ── Shared table style helper ─────────────────────────────────────────────────
def make_style(header_bg=None, grid_color=None):
    gc = grid_color or colors.HexColor('#d1d5db')
    base = [
        ('FONTSIZE',      (0, 0), (-1, -1), 9),
        ('VALIGN',        (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING',    (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LEFTPADDING',   (0, 0), (-1, -1), 5),
        ('RIGHTPADDING',  (0, 0), (-1, -1), 5),
        ('GRID',          (0, 0), (-1, -1), 0.5, gc),
    ]
    if header_bg:
        base += [
            ('BACKGROUND', (0, 0), (-1, 0), header_bg),
            ('TEXTCOLOR',  (0, 0), (-1, 0), colors.white),
            ('FONTNAME',   (0, 0), (-1, 0), 'Helvetica-Bold'),
        ]
    return base


# ── Main generator ────────────────────────────────────────────────────────────
def generate_pipe_sizing_pdf(data, output_path):
    doc = SimpleDocTemplate(
        output_path, pagesize=A4,
        rightMargin=2*cm, leftMargin=2*cm,
        topMargin=2*cm, bottomMargin=2.5*cm
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle('PT', parent=styles['Heading1'],
        fontSize=17, textColor=BLUE_DARK, spaceAfter=6, alignment=TA_CENTER)
    sub_style = ParagraphStyle('PS', parent=styles['Normal'],
        fontSize=10, textColor=colors.HexColor('#6b7280'), alignment=TA_CENTER, spaceAfter=10)
    heading_style = ParagraphStyle('PH', parent=styles['Heading2'],
        fontSize=11, textColor=BLUE_MID, spaceAfter=4, spaceBefore=12)
    small_style = ParagraphStyle('PSm', parent=styles['Normal'],
        fontSize=8, textColor=colors.HexColor('#6b7280'), spaceBefore=2)
    cell_style = ParagraphStyle('PC', parent=styles['Normal'],
        fontSize=9, leading=11)
    hdr_style = ParagraphStyle('PHdr', parent=styles['Normal'],
        fontSize=9, textColor=colors.white, fontName='Helvetica-Bold',
        alignment=TA_CENTER, leading=11)

    story = []

    # ── Title ─────────────────────────────────────────────────────────────────
    story.append(Paragraph("Pipe Sizing Installation Report", title_style))
    story.append(Paragraph(f"Generated: {datetime.now().strftime('%d/%m/%Y %H:%M')}", sub_style))

    # ── Project info  17.0cm: [5.0, 12.0] ────────────────────────────────────
    story.append(Paragraph("Project Information", heading_style))
    kv_style = [
        ('FONTNAME',     (0, 0), (0, -1),  'Helvetica-Bold'),
        ('FONTSIZE',     (0, 0), (-1, -1), 10),
        ('TEXTCOLOR',    (0, 0), (0, -1),  BLUE_DARK),
        ('VALIGN',       (0, 0), (-1, -1), 'TOP'),
        ('BOTTOMPADDING',(0, 0), (-1, -1), 7),
        ('BACKGROUND',   (0, 0), (-1, -1), GRAY_LIGHT),
        ('GRID',         (0, 0), (-1, -1), 0.5, BLUE_RULE),
    ]
    proj_rows = [
        ['Project:', data.get('projectName', 'N/A')],
        ['Location:', data.get('location', '') or 'N/A'],
        ['Designer:', data.get('designer', 'N/A')],
        ['Date:', datetime.now().strftime('%d %B %Y')],
    ]
    if data.get('customerName'):
        proj_rows.append(['Customer:', data['customerName']])
    proj_table = Table(proj_rows, colWidths=[5.0*cm, 12.0*cm])
    proj_table.setStyle(TableStyle(kv_style))
    story.append(proj_table)
    story.append(Spacer(1, 0.4*cm))

    # ── System overview  17.0cm: [6.0, 11.0] ─────────────────────────────────
    story.append(Paragraph("System Overview", heading_style))
    flow     = data.get('designFlowTemp', 50)
    ret      = data.get('designReturnTemp', 40)
    flow_rate = data.get('systemFlowRate', 0)
    sys_rows = [
        ['Heat Pump Output:',          f"{data.get('heatPumpOutput', 0)} kW"],
        ['Design Flow Temperature:',   f"{flow}\u00b0C"],
        ['Design Return Temperature:', f"{ret}\u00b0C"],
        ['Design \u0394T:',            f"{flow - ret}\u00b0C"],
        ['System Flow Rate:',          f"{flow_rate:.3f} l/s  ({flow_rate * 3.6:.2f} m\u00b3/h)"],
    ]
    sys_table = Table(sys_rows, colWidths=[6.0*cm, 11.0*cm])
    sys_table.setStyle(TableStyle([
        ('FONTNAME',     (0, 0), (0, -1),  'Helvetica-Bold'),
        ('FONTSIZE',     (0, 0), (-1, -1), 10),
        ('TEXTCOLOR',    (0, 0), (0, -1),  BLUE_DARK),
        ('VALIGN',       (0, 0), (-1, -1), 'TOP'),
        ('BOTTOMPADDING',(0, 0), (-1, -1), 7),
        ('BACKGROUND',   (0, 0), (-1, -1), colors.HexColor('#f0f4f8')),
        ('GRID',         (0, 0), (-1, -1), 0.5, BLUE_RULE),
    ]))
    story.append(sys_table)
    story.append(Spacer(1, 0.6*cm))

    # ── All pipe sections  17.0cm: [4.8, 2.6, 1.6, 1.5, 1.8, 1.8, 1.9, 1.0] ─
    story.append(Paragraph("All Pipe Sections", heading_style))
    sections = data.get('sections', [])

    if sections:
        hdr = [
            Paragraph('Section', hdr_style),
            Paragraph('Material', hdr_style),
            Paragraph('Diameter', hdr_style),
            Paragraph('Length\n(m)', hdr_style),
            Paragraph('Flow Rate\n(l/s)', hdr_style),
            Paragraph('Velocity\n(m/s)', hdr_style),
            Paragraph('Pressure\nDrop (kPa)', hdr_style),
            Paragraph('Index', hdr_style),
        ]
        sec_rows = [hdr]
        for idx, s in enumerate(sections):
            is_index = s.get('includeInIndexCircuit', False)
            sec_rows.append([
                Paragraph(s.get('name', f'Section {idx+1}'), cell_style),
                Paragraph(material_label(s.get('material', '')), cell_style),
                s.get('diameter', 'N/A'),
                f"{s.get('length', 0):.1f}",
                f"{s.get('flowRate', 0):.3f}",
                f"{s.get('velocity', 0):.2f}",
                f"{s.get('pressureDrop', 0):.2f}",
                '\u2713' if is_index else '',
            ])

        col_w = [4.8*cm, 2.6*cm, 1.6*cm, 1.5*cm, 1.8*cm, 1.8*cm, 1.9*cm, 1.0*cm]
        sec_table = Table(sec_rows, colWidths=col_w, repeatRows=1)
        ts = make_style(header_bg=BLUE_DARK)
        ts += [
            ('ALIGN',   (2, 0), (-1, -1), 'CENTER'),
            ('ALIGN',   (0, 0), (1, -1),  'LEFT'),
            ('FONTSIZE',(0, 0), (-1, -1),  8),
        ]
        for idx, s in enumerate(sections):
            if s.get('includeInIndexCircuit', False):
                ts.append(('BACKGROUND', (0, idx+1), (-1, idx+1), AMBER_LIGHT))
                ts.append(('TEXTCOLOR',  (7, idx+1), (7, idx+1), AMBER_TEXT))
                ts.append(('FONTNAME',   (7, idx+1), (7, idx+1), 'Helvetica-Bold'))
            elif idx % 2 == 0:
                ts.append(('BACKGROUND', (0, idx+1), (-1, idx+1), GRAY_LIGHT))
        sec_table.setStyle(TableStyle(ts))
        story.append(sec_table)
        story.append(Paragraph(
            "\u25a0 Amber rows = included in index circuit (critical path).",
            small_style))
    else:
        story.append(Paragraph("No pipe sections defined.", styles['Normal']))

    story.append(Spacer(1, 0.6*cm))

    # ── Index circuit  17.0cm: [1.2, 5.6, 2.6, 1.8, 1.8, 4.0] ──────────────
    index_circuit = data.get('indexCircuit', {})
    story.append(Paragraph("Index Circuit & Pump Requirements", heading_style))

    if index_circuit and index_circuit.get('sections'):
        idx_hdr = [
            Paragraph('Step', hdr_style),
            Paragraph('Section Name', hdr_style),
            Paragraph('Material', hdr_style),
            Paragraph('Diameter', hdr_style),
            Paragraph('Length (m)', hdr_style),
            Paragraph('Pressure Drop (kPa)', hdr_style),
        ]
        idx_rows = [idx_hdr]
        for i, s in enumerate(index_circuit['sections']):
            idx_rows.append([
                str(i + 1),
                Paragraph(s.get('name', 'Unnamed'), cell_style),
                Paragraph(material_label(s.get('material', '')), cell_style),
                s.get('diameter', 'N/A'),
                f"{s.get('length', 0):.1f}",
                f"{s.get('pressureDrop', 0):.2f}",
            ])

        idx_col_w = [1.2*cm, 5.6*cm, 2.6*cm, 1.8*cm, 1.8*cm, 4.0*cm]
        idx_table = Table(idx_rows, colWidths=idx_col_w, repeatRows=1)
        idx_ts = make_style(header_bg=AMBER, grid_color=colors.grey)
        idx_ts[2] = ('TEXTCOLOR', (0, 0), (-1, 0), AMBER_TEXT)  # override white->amber text
        idx_ts += [
            ('ALIGN',      (0, 0), (-1, -1), 'CENTER'),
            ('ALIGN',      (1, 0), (2, -1),  'LEFT'),
            ('BACKGROUND', (0, 1), (-1, -1), AMBER_LIGHT),
            ('FONTSIZE',   (0, 0), (-1, -1), 8),
        ]
        idx_table.setStyle(TableStyle(idx_ts))
        story.append(idx_table)
        story.append(Spacer(1, 0.4*cm))

        # Pump summary  17.0cm: [6.0, 11.0]
        total_pd   = index_circuit.get('totalPressureDrop', 0)
        total_len  = index_circuit.get('totalLength', 0)
        head_m     = total_pd * 0.102
        pump_rows = [
            ['Total Circuit Length:',  f"{total_len:.1f} m"],
            ['Total Pressure Drop:',   f"{total_pd:.2f} kPa"],
            ['Required Pump Head:',    f"{head_m:.2f} m  ({total_pd:.2f} kPa)"],
            ['System Flow Rate:',      f"{flow_rate:.3f} l/s  ({flow_rate * 3.6:.2f} m\u00b3/h)"],
        ]
        pump_table = Table(pump_rows, colWidths=[6.0*cm, 11.0*cm])
        pump_table.setStyle(TableStyle([
            ('FONTNAME',     (0, 0), (0, -1),  'Helvetica-Bold'),
            ('FONTNAME',     (1, 0), (1, -1),  'Helvetica-Bold'),
            ('FONTSIZE',     (0, 0), (-1, -1), 11),
            ('TEXTCOLOR',    (0, 0), (0, -1),  BLUE_DARK),
            ('TEXTCOLOR',    (1, 0), (1, -1),  RED),
            ('VALIGN',       (0, 0), (-1, -1), 'TOP'),
            ('BOTTOMPADDING',(0, 0), (-1, -1), 9),
            ('BACKGROUND',   (0, 0), (-1, -1), BLUE_BG),
            ('BOX',          (0, 0), (-1, -1), 2, BLUE_DARK),
            ('GRID',         (0, 0), (-1, -1), 0.5, BLUE_RULE),
        ]))
        story.append(pump_table)
        story.append(Spacer(1, 0.4*cm))

        # Pump guidance
        story.append(Paragraph("<b>Pump Selection Guidance:</b>", styles['Normal']))
        story.append(Spacer(1, 0.15*cm))
        guidance = [
            f"Select a pump capable of delivering <b>{head_m:.2f} m head</b> at <b>{flow_rate * 3.6:.2f} m\u00b3/h</b>.",
            "Add 10\u201320% safety margin for fouling and system expansion.",
            "Consider a variable speed pump for improved seasonal efficiency.",
            "If using the heat pump\u2019s internal pump, verify its residual head exceeds the above requirement.",
            "Confirm the operating point falls within the pump manufacturer\u2019s efficiency curve.",
        ]
        for item in guidance:
            story.append(Paragraph(f"\u2022 {item}", small_style))
    else:
        story.append(Paragraph(
            "No index circuit selected. Mark the pipe sections that form the critical path "
            "(highest resistance flow route) to generate pump requirements.",
            styles['Normal']))

    # ── System Water Volume  17.0cm ───────────────────────────────────────────
    sv = data.get('systemVolume', {})
    if sv:
        story.append(Spacer(1, 0.4*cm))
        story.append(Paragraph("System Water Volume", heading_style))

        rad_l  = sv.get('radiatorLitres',  0)
        pip_l  = sv.get('pipeworkLitres',  0)
        ufh_l  = sv.get('ufhLitres',       0)
        hp_l   = sv.get('heatPumpLitres',  0)
        buf_l  = sv.get('bufferLitres',    0)
        tot_l  = sv.get('totalLitres',     0)
        eff_l  = sv.get('effectiveVolumeLitres',   0)
        req_l  = sv.get('requiredMinVolumeLitres',  0)
        exp_l  = sv.get('expansionGuidanceLitres',  0)

        vol_rows = [
            ['Component', 'Volume (L)'],
            ['Radiators',               f"{rad_l:.1f}"],
            ['Pipework (flow + return)', f"{pip_l:.1f}"],
            ['Underfloor heating',       f"{ufh_l:.1f}"],
            ['Heat pump internal',       f"{hp_l:.1f}"],
            ['Buffer vessel',            f"{buf_l:.1f}"],
            ['TOTAL SYSTEM VOLUME',      f"{tot_l:.1f}"],
        ]
        vol_table = Table(vol_rows, colWidths=[13.0*cm, 4.0*cm])
        vts = make_style(header_bg=BLUE_DARK)
        vts += [
            ('ALIGN',         (1, 0),  (1, -1),  'RIGHT'),
            ('ALIGN',         (0, 0),  (0, -1),  'LEFT'),
            ('FONTNAME',      (0, -1), (-1, -1), 'Helvetica-Bold'),
            ('BACKGROUND',    (0, -1), (-1, -1), BLUE_LIGHT),
            ('TEXTCOLOR',     (0, -1), (-1, -1), BLUE_DARK),
            ('LINEABOVE',     (0, -1), (-1, -1), 1.5, BLUE_MID),
            ('FONTSIZE',      (0, -1), (-1, -1), 10),
            ('TOPPADDING',    (0, -1), (-1, -1), 8),
            ('BOTTOMPADDING', (0, -1), (-1, -1), 8),
        ]
        for i in range(1, len(vol_rows) - 1):
            if i % 2 == 0:
                vts.append(('BACKGROUND', (0, i), (-1, i), GRAY_LIGHT))
        vol_table.setStyle(TableStyle(vts))
        story.append(vol_table)

        # Modulation volume check
        if req_l > 0:
            story.append(Spacer(1, 0.2*cm))
            pass_fail = '\u2714 Pass' if eff_l >= req_l else '\u2717 Fail'
            mod_color = colors.HexColor('#15803d') if eff_l >= req_l else colors.HexColor('#dc2626')
            mod_bg    = colors.HexColor('#dcfce7') if eff_l >= req_l else colors.HexColor('#fee2e2')
            mod_rows = [
                [
                    Paragraph('<b>Minimum modulation volume check (20 L/kW)</b>',
                              ParagraphStyle('MC', parent=styles['Normal'], fontSize=9)),
                    Paragraph(f'<b>{pass_fail}</b>',
                              ParagraphStyle('MV', parent=styles['Normal'], fontSize=10,
                                             textColor=mod_color, alignment=TA_RIGHT)),
                ],
                [
                    Paragraph(f'Effective open volume: <b>{eff_l:.1f} L</b>  '
                              f'(pipes + HP + buffer + open emitters)',
                              ParagraphStyle('MD', parent=styles['Normal'], fontSize=8)),
                    Paragraph(f'Required: <b>{req_l:.1f} L</b>',
                              ParagraphStyle('MR', parent=styles['Normal'], fontSize=8,
                                             alignment=TA_RIGHT)),
                ],
            ]
            mod_table = Table(mod_rows, colWidths=[11.0*cm, 6.0*cm])
            mod_table.setStyle(TableStyle([
                ('BACKGROUND',   (0, 0), (-1, -1), mod_bg),
                ('VALIGN',       (0, 0), (-1, -1), 'MIDDLE'),
                ('TOPPADDING',   (0, 0), (-1, -1), 6),
                ('BOTTOMPADDING',(0, 0), (-1, -1), 6),
                ('LEFTPADDING',  (0, 0), (-1, -1), 8),
                ('RIGHTPADDING', (0, 0), (-1, -1), 8),
                ('BOX',          (0, 0), (-1, -1), 1, mod_color),
                ('LINEBELOW',    (0, 0), (-1, 0),  0.5, mod_color),
            ]))
            story.append(mod_table)

        if tot_l > 0:
            story.append(Spacer(1, 0.15*cm))
            story.append(Paragraph(
                f'<b>Expansion vessel guidance:</b> Minimum pre-charge vessel \u2248 '
                f'<b>{exp_l:.1f} L</b> (10% of system volume). '
                'Actual sizing depends on fill pressure, maximum working pressure '
                'and inhibitor/glycol concentration \u2014 confirm at commissioning.',
                small_style))

    # ── Radiator Flow Rates  17.0cm ───────────────────────────────────────────
    flow_rows_data = data.get('radiatorFlowRates', [])
    if flow_rows_data:
        story.append(Spacer(1, 0.5*cm))
        story.append(Paragraph("Radiator Flow Rates", heading_style))
        flow_temp   = data.get('designFlowTemp', 50)
        return_temp = data.get('designReturnTemp', 40)
        delta_t     = flow_temp - return_temp
        story.append(Paragraph(
            f'Design flow rates at {flow_temp}\u00b0C / {return_temp}\u00b0C ({delta_t}K \u0394T). '
            'Use with valve manufacturer\u2019s charts to determine PITRV or flow regulating '
            'valve pre-settings. Replaced radiators excluded.',
            small_style))
        story.append(Spacer(1, 0.2*cm))

        PURPLE_DARK  = colors.HexColor('#6d28d9')
        PURPLE_LIGHT = colors.HexColor('#ede9fe')

        fr_hdr = [
            Paragraph('Room',        ParagraphStyle('FH', parent=styles['Normal'], fontSize=8, textColor=colors.white, fontName='Helvetica-Bold')),
            Paragraph('Radiator',    ParagraphStyle('FH', parent=styles['Normal'], fontSize=8, textColor=colors.white, fontName='Helvetica-Bold')),
            Paragraph('Qty',         ParagraphStyle('FH', parent=styles['Normal'], fontSize=8, textColor=colors.white, fontName='Helvetica-Bold', alignment=TA_CENTER)),
            Paragraph('Output (W)',  ParagraphStyle('FH', parent=styles['Normal'], fontSize=8, textColor=colors.white, fontName='Helvetica-Bold', alignment=TA_RIGHT)),
            Paragraph('Flow (l/s)',  ParagraphStyle('FH', parent=styles['Normal'], fontSize=8, textColor=colors.white, fontName='Helvetica-Bold', alignment=TA_RIGHT)),
            Paragraph('Flow (l/h)',  ParagraphStyle('FH', parent=styles['Normal'], fontSize=8, textColor=colors.white, fontName='Helvetica-Bold', alignment=TA_RIGHT)),
        ]
        fr_rows = [fr_hdr]
        spec_style_fr = ParagraphStyle('FS', parent=styles['Normal'], fontSize=8, leading=10)
        for r in flow_rows_data:
            fr_rows.append([
                r.get('room', ''),
                Paragraph(r.get('spec', ''), spec_style_fr),
                str(r.get('qty', 1)),
                f"{r.get('outputW', 0)}",
                f"{r.get('flowLs', 0):.4f}",
                f"{r.get('flowLh', 0):.1f}",
            ])
        # Totals row
        tot_w  = sum(r.get('outputW', 0) for r in flow_rows_data)
        tot_ls = sum(r.get('flowLs', 0) for r in flow_rows_data)
        tot_lh = sum(r.get('flowLh', 0) for r in flow_rows_data)
        fr_rows.append(['TOTAL', '', '', f"{tot_w}", f"{tot_ls:.4f}", f"{tot_lh:.1f}"])

        fr_col_w = [3.5*cm, 6.5*cm, 1.0*cm, 2.0*cm, 2.0*cm, 2.0*cm]
        fr_table = Table(fr_rows, colWidths=fr_col_w, repeatRows=1)
        fr_ts = make_style(header_bg=PURPLE_DARK)
        fr_ts += [
            ('ALIGN',  (2, 0), (-1, -1), 'RIGHT'),
            ('ALIGN',  (2, 0), (2, -1),  'CENTER'),
            ('ALIGN',  (0, 0), (1, -1),  'LEFT'),
            ('FONTSIZE',(0, 0),(-1, -1),  8),
        ]
        for i in range(1, len(fr_rows) - 1):
            if i % 2 == 0:
                fr_ts.append(('BACKGROUND', (0, i), (-1, i), PURPLE_LIGHT))
        last = len(fr_rows) - 1
        fr_ts += [
            ('BACKGROUND', (0, last), (-1, last), PURPLE_LIGHT),
            ('FONTNAME',   (0, last), (-1, last), 'Helvetica-Bold'),
            ('LINEABOVE',  (0, last), (-1, last), 1.5, PURPLE_DARK),
            ('TEXTCOLOR',  (5, last), (5, last),  PURPLE_DARK),
        ]
        fr_table.setStyle(TableStyle(fr_ts))
        story.append(fr_table)
        story.append(Paragraph(
            'For UFH, commission on \u0394T rather than flow rate.',
            small_style))

    # ── Build ─────────────────────────────────────────────────────────────────
    footer_note = "Pipe sizing calculated in accordance with CIBSE Guide C / BS EN 12828."
    doc.build(
        story,
        canvasmaker=lambda *a, **kw: PageNumCanvas(*a, footer_note=footer_note, **kw),
    )
    return output_path


def main():
    if len(sys.argv) < 3:
        print("Usage: python3 generate_pipe_sizing_pdf.py <input_json_file> <output_pdf_file>")
        sys.exit(1)
    try:
        with open(sys.argv[1], 'r') as f:
            data = json.load(f)
        generate_pipe_sizing_pdf(data, sys.argv[2])
        print(f"PDF generated successfully: {sys.argv[2]}")
    except Exception as e:
        print(f"Error generating PDF: {str(e)}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
