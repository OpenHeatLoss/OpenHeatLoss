#!/usr/bin/env python3
"""
Radiator Schedule PDF Generator
Generates professional radiator schedule reports
"""

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
import json
import sys
from datetime import datetime

BLUE_DARK    = colors.HexColor('#1e3a8a')
BLUE_MID     = colors.HexColor('#1e40af')
BLUE_LIGHT   = colors.HexColor('#dbeafe')
GRAY_LIGHT   = colors.HexColor('#f3f4f6')
GRAY_DARK    = colors.HexColor('#374151')
GREEN        = colors.HexColor('#15803d')
GREEN_LIGHT  = colors.HexColor('#dcfce7')
RED          = colors.HexColor('#dc2626')
RED_LIGHT    = colors.HexColor('#fee2e2')
PURPLE       = colors.HexColor('#7c3aed')
PURPLE_LIGHT = colors.HexColor('#ede9fe')


class PageNumCanvas(rl_canvas.Canvas):
    """Draws a footer with a note and page x/y on every page."""

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
        self.drawString(1.8 * cm, 1.1 * cm, self._footer_note)
        self.drawRightString(A4[0] - 1.8 * cm, 1.1 * cm, f"Page {page_num} of {total_pages}")
        self.setStrokeColor(colors.HexColor('#d1d5db'))
        self.setLineWidth(0.5)
        self.line(1.8 * cm, 1.4 * cm, A4[0] - 1.8 * cm, 1.4 * cm)
        self.restoreState()


def make_style(header_bg=None):
    base = [
        ('FONTSIZE',      (0, 0), (-1, -1), 8),
        ('VALIGN',        (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING',    (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING',   (0, 0), (-1, -1), 5),
        ('RIGHTPADDING',  (0, 0), (-1, -1), 5),
        ('GRID',          (0, 0), (-1, -1), 0.5, colors.HexColor('#d1d5db')),
    ]
    if header_bg:
        base += [
            ('BACKGROUND', (0, 0), (-1, 0), header_bg),
            ('TEXTCOLOR',  (0, 0), (-1, 0), colors.white),
            ('FONTNAME',   (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE',   (0, 0), (-1, 0), 8),
        ]
    return base


def create_radiator_schedule_pdf(data, output_filename):
    # 1.8cm margins each side -> 21.0 - 3.6 = 17.4cm usable
    doc = SimpleDocTemplate(
        output_filename, pagesize=A4,
        rightMargin=1.8*cm, leftMargin=1.8*cm,
        topMargin=2*cm, bottomMargin=2.5*cm
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle('T', parent=styles['Heading1'],
        fontSize=17, textColor=BLUE_DARK, spaceAfter=4, alignment=TA_CENTER)
    sub_style = ParagraphStyle('S', parent=styles['Normal'],
        fontSize=10, textColor=colors.HexColor('#6b7280'), alignment=TA_CENTER, spaceAfter=10)
    heading_style = ParagraphStyle('H', parent=styles['Heading2'],
        fontSize=11, textColor=BLUE_MID, spaceAfter=4, spaceBefore=12)
    note_style = ParagraphStyle('N', parent=styles['Normal'],
        fontSize=8, textColor=colors.HexColor('#6b7280'), spaceBefore=2)

    story = []

    # ── Header ──────────────────────────────────────────────────────────────
    story.append(Paragraph("Radiator Schedule", title_style))
    story.append(Paragraph(f"Generated: {datetime.now().strftime('%d/%m/%Y %H:%M')}", sub_style))

    # ── Project info  17.4cm: [2.4, 6.3, 2.4, 6.3] ───────────────────────
    cust_name = f"{data.get('customerTitle','')} {data.get('customerFirstName','')} {data.get('customerSurname','')}".strip()
    info_rows = [
        ['Project:', data.get('projectName', 'N/A'), 'Customer:', cust_name or 'N/A'],
        ['Location:', data.get('location', 'N/A'),   'Address:',  data.get('customerAddress', 'N/A')],
        ['Designer:', data.get('designer', 'N/A'),   'Postcode:', data.get('customerPostcode', 'N/A')],
    ]
    info_table = Table(info_rows, colWidths=[2.4*cm, 6.3*cm, 2.4*cm, 6.3*cm])
    info_table.setStyle(TableStyle([
        ('FONTNAME',     (0, 0), (0, -1),  'Helvetica-Bold'),
        ('FONTNAME',     (2, 0), (2, -1),  'Helvetica-Bold'),
        ('FONTSIZE',     (0, 0), (-1, -1), 9),
        ('BACKGROUND',   (0, 0), (-1, -1), GRAY_LIGHT),
        ('TEXTCOLOR',    (0, 0), (0, -1),  colors.HexColor('#374151')),
        ('TEXTCOLOR',    (2, 0), (2, -1),  colors.HexColor('#374151')),
        ('VALIGN',       (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING',   (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING',(0, 0), (-1, -1), 5),
        ('LEFTPADDING',  (0, 0), (-1, -1), 6),
        ('GRID',         (0, 0), (-1, -1), 0.5, colors.HexColor('#d1d5db')),
    ]))
    story.append(info_table)
    story.append(Spacer(1, 0.3*cm))

    # ── System design conditions  17.4cm: [2.9 x 6] ──────────────────────
    story.append(Paragraph("System Design Conditions", heading_style))
    flow     = data.get('flowTemp', 50)
    ret      = data.get('returnTemp', 40)
    ext_temp = data.get('externalTemp', -3)
    hdr = ParagraphStyle('SH', parent=styles['Normal'],
        fontSize=8, textColor=colors.white, fontName='Helvetica-Bold',
        alignment=TA_CENTER, leading=11)
    sys_rows = [
        [
            Paragraph('Flow Temperature', hdr),
            Paragraph('Return Temperature', hdr),
            Paragraph('Flow/Return \u0394T', hdr),
            Paragraph('Outdoor Design Temp', hdr),
            Paragraph('Total Emitter Sizing Load', hdr),
            Paragraph('No. Rooms', hdr),
        ],
        [
            f"{flow}\u00b0C",
            f"{ret}\u00b0C",
            f"{flow - ret:.1f} K",
            f"{ext_temp}\u00b0C",
            f"{data.get('totalHeatLoss', 0):.2f} kW",
            str(data.get('numberOfRooms', 0)),
        ]
    ]
    sys_table = Table(sys_rows, colWidths=[2.9*cm, 2.9*cm, 2.9*cm, 2.9*cm, 2.9*cm, 2.9*cm])
    sys_table.setStyle(TableStyle(make_style(header_bg=BLUE_DARK) + [
        ('ALIGN',        (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME',     (0, 1), (-1, 1),  'Helvetica-Bold'),
        ('FONTSIZE',     (0, 1), (-1, 1),  11),
        ('TOPPADDING',   (0, 1), (-1, 1),  8),
        ('BOTTOMPADDING',(0, 1), (-1, 1),  8),
    ]))
    story.append(sys_table)
    story.append(Spacer(1, 0.4*cm))

    # ── Overall summary  17.4cm: [3.5, 4.5, 4.5, 4.9] ──────────────────────
    story.append(Paragraph("Overall Schedule Summary", heading_style))
    rooms                   = data.get('rooms', [])
    total_rooms             = len(rooms)
    sufficient_rooms        = sum(1 for r in rooms if r.get('totalOutput', 0) >= r.get('heatLoss', 0))
    total_scheduled_output  = sum(r.get('totalOutput', 0) for r in rooms)
    total_heat_loss_w       = data.get('totalHeatLoss', 0) * 1000
    all_ok                  = sufficient_rooms == total_rooms
    output_diff             = total_scheduled_output - total_heat_loss_w
    output_pct              = (total_scheduled_output / total_heat_loss_w * 100) if total_heat_loss_w > 0 else 0

    # Output vs emitter sizing: green if >= , red if <
    if total_scheduled_output >= total_heat_loss_w:
        out_bg, out_tc = GREEN_LIGHT, GREEN
    else:
        out_bg, out_tc = RED_LIGHT, RED

    # Overall status cell — Paragraph so it wraps
    status_para_style = ParagraphStyle('SP', parent=styles['Normal'],
        fontSize=10, fontName='Helvetica-Bold', alignment=TA_CENTER,
        textColor=GREEN if all_ok else RED)
    if all_ok:
        status_cell = Paragraph("\u2714 All rooms\nscheduled", status_para_style)
    else:
        status_cell = Paragraph(
            f"\u2717 {total_rooms - sufficient_rooms} room(s)\nwith shortfall", status_para_style)

    summary_rows = [
        ['Total Rooms', 'Total Scheduled Output', 'Total Emitter Sizing', 'Overall Status'],
        [
            str(total_rooms),
            f"{total_scheduled_output:.0f} W  ({output_pct:.0f}%)",
            f"{total_heat_loss_w:.0f} W",
            status_cell,
        ]
    ]
    sum_table = Table(summary_rows, colWidths=[3.5*cm, 4.5*cm, 4.5*cm, 4.9*cm])
    sum_table.setStyle(TableStyle(make_style(header_bg=BLUE_DARK) + [
        ('ALIGN',        (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME',     (0, 1), (2, 1),   'Helvetica-Bold'),
        ('FONTSIZE',     (0, 1), (-1, 1),  10),
        ('BACKGROUND',   (1, 1), (1, 1),   out_bg),
        ('TEXTCOLOR',    (1, 1), (1, 1),   out_tc),
        ('BACKGROUND',   (3, 1), (3, 1),   GREEN_LIGHT if all_ok else RED_LIGHT),
        ('TOPPADDING',   (0, 1), (-1, 1),  8),
        ('BOTTOMPADDING',(0, 1), (-1, 1),  8),
    ]))
    story.append(sum_table)
    story.append(Spacer(1, 0.2*cm))

    # Legend  17.4cm: [5.8, 5.8, 5.8] ─────────────────────────────────────
    legend_rows = [[
        Paragraph(
            "<font color='#1e40af'><b>\u25a0 Blue rows</b></font> = Existing radiators",
            ParagraphStyle('l', parent=styles['Normal'], fontSize=8)),
        Paragraph(
            "<font color='#15803d'><b>\u25a0 New</b></font> = New radiators to be installed",
            ParagraphStyle('l', parent=styles['Normal'], fontSize=8)),
        Paragraph(
            "<font color='#7c3aed'><b>\u25a0 UFH</b></font> = Underfloor heating (EN 1264-2)",
            ParagraphStyle('l', parent=styles['Normal'], fontSize=8)),
    ]]
    legend = Table(legend_rows, colWidths=[5.8*cm, 5.8*cm, 5.8*cm])
    legend.setStyle(TableStyle([
        ('BACKGROUND',   (0, 0), (-1, -1), GRAY_LIGHT),
        ('TOPPADDING',   (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING',(0, 0), (-1, -1), 5),
        ('LEFTPADDING',  (0, 0), (-1, -1), 8),
        ('GRID',         (0, 0), (-1, -1), 0.5, colors.HexColor('#d1d5db')),
    ]))
    story.append(legend)
    story.append(Spacer(1, 0.4*cm))

    # ── Room-by-room schedules ─────────────────────────────────────────────
    story.append(Paragraph("Room Emitter Schedules", heading_style))

    for room in rooms:
        schedule     = room.get('schedule', [])
        heat_loss    = room.get('heatLoss', 0)
        total_output = room.get('totalOutput', 0)
        sufficient   = total_output >= heat_loss
        mwat         = room.get('mwat', 0)
        shortfall    = heat_loss - total_output if not sufficient else 0

        # Room header bar  17.4cm: [3.8, 8.0, 5.6] ────────────────────────
        pct = (total_output / heat_loss * 100) if heat_loss > 0 else 0
        if sufficient:
            excess = total_output - heat_loss
            status_sym = '\u2713 SUFFICIENT'
            status_detail = f"{total_output:.0f} W scheduled  (<b>+{excess:.0f} W, +{pct - 100:.0f}%</b>)"
        else:
            status_sym = '\u2717 SHORTFALL'
            status_detail = f"{total_output:.0f} W scheduled  (<b>shortfall: {shortfall:.0f} W, \u2212{100 - pct:.0f}%</b>)"

        header_data = [[
            Paragraph(
                f"<b>{room.get('name', 'Room')}</b>",
                ParagraphStyle('rn', parent=styles['Normal'], fontSize=10, textColor=BLUE_DARK)
            ),
            Paragraph(
                f"Heat Loss: <b>{heat_loss:.0f} W</b>"
                f"  |  MWAT: <b>{mwat:.1f} K</b>"
                f"  |  Temp: <b>{room.get('internalTemp', 21)}\u00b0C</b>"
                f"  |  Area: <b>{room.get('floorArea', 0):.1f} m\u00b2</b>",
                ParagraphStyle('ri', parent=styles['Normal'], fontSize=9)
            ),
            Paragraph(
                f"<b>{status_sym}</b><br/>{status_detail}",
                ParagraphStyle('rs', parent=styles['Normal'], fontSize=9,
                               textColor=GREEN if sufficient else RED, alignment=TA_RIGHT)
            ),
        ]]
        header_table = Table(header_data, colWidths=[3.8*cm, 8.0*cm, 5.6*cm])
        header_table.setStyle(TableStyle([
            ('BACKGROUND',   (0, 0), (-1, -1), GREEN_LIGHT if sufficient else RED_LIGHT),
            ('VALIGN',       (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING',   (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING',(0, 0), (-1, -1), 6),
            ('LEFTPADDING',  (0, 0), (-1, -1), 8),
            ('BOX',          (0, 0), (-1, -1), 1, GREEN if sufficient else RED),
            ('LINEBELOW',    (0, 0), (-1, -1), 1, GREEN if sufficient else RED),
        ]))
        story.append(header_table)

        if schedule:
            # Schedule table  17.4cm: [1.5, 9.1, 1.5, 0.9, 2.2, 2.2] ─────
            sched_rows = [['Status', 'Specification', 'Conn.', 'Qty',
                           'Output @\u0394T50', 'Output @Design']]
            spec_style = ParagraphStyle('spec', parent=styles['Normal'],
                fontSize=8, leading=10)
            for item in schedule:
                is_existing = item.get('isExisting', False)
                is_ufh      = item.get('isUFH', False)
                dt50 = item.get('outputDt50')
                sched_rows.append([
                    'UFH' if is_ufh else ('Existing' if is_existing else 'New'),
                    Paragraph(item.get('spec', 'N/A'), spec_style),
                    item.get('connectionType', 'BOE'),
                    str(item.get('quantity', 1)),
                    '—' if (is_ufh or dt50 is None) else f"{dt50:.0f} W",
                    f"{item.get('outputAtDesign', 0):.0f} W",
                ])

            sched_table = Table(sched_rows,
                colWidths=[1.5*cm, 9.1*cm, 1.5*cm, 0.9*cm, 2.2*cm, 2.2*cm],
                repeatRows=1)
            st = make_style(header_bg=GRAY_DARK)
            st += [
                ('ALIGN', (2, 0), (-1, -1), 'CENTER'),
                ('ALIGN', (0, 0), (1, -1),  'LEFT'),
            ]
            for i, item in enumerate(schedule, 1):
                if item.get('isUFH', False):
                    st.append(('BACKGROUND', (0, i), (-1, i), PURPLE_LIGHT))
                    st.append(('TEXTCOLOR',  (0, i), (0, i),  PURPLE))
                    st.append(('FONTNAME',   (0, i), (0, i),  'Helvetica-Bold'))
                elif item.get('isExisting', False):
                    st.append(('BACKGROUND', (0, i), (-1, i), BLUE_LIGHT))
                    st.append(('TEXTCOLOR',  (0, i), (0, i),  BLUE_MID))
                    st.append(('FONTNAME',   (0, i), (0, i),  'Helvetica-Bold'))
                else:
                    st.append(('TEXTCOLOR',  (0, i), (0, i),  GREEN))
                    st.append(('FONTNAME',   (0, i), (0, i),  'Helvetica-Bold'))
            sched_table.setStyle(TableStyle(st))
            story.append(sched_table)
        else:
            story.append(Paragraph("No emitters scheduled for this room.", note_style))

        story.append(Spacer(1, 0.3*cm))

    # ── Build with per-page footer ─────────────────────────────────────────
    footer_note = (
        "Output calculations use n=1.3 exponent. "
        "Sizing in accordance with BS EN 12831-1:2017 / CIBSE DHDG 2026."
    )
    doc.build(
        story,
        canvasmaker=lambda *a, **kw: PageNumCanvas(*a, footer_note=footer_note, **kw),
    )
    return output_filename


if __name__ == "__main__":
    if len(sys.argv) > 1:
        with open(sys.argv[1], 'r') as f:
            data = json.load(f)
        output_file = sys.argv[2] if len(sys.argv) > 2 else "radiator_schedule.pdf"
    else:
        data = json.load(sys.stdin)
        output_file = "radiator_schedule.pdf"

    create_radiator_schedule_pdf(data, output_file)
    print(f"PDF generated: {output_file}")
