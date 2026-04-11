#!/usr/bin/env python3
"""
Heat Loss Summary PDF Generator
Generates professional heat loss calculation reports
Supports both EN 12831 CIBSE 2026 reduced method and legacy ACH method
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

BLUE_DARK   = colors.HexColor('#1e3a8a')
BLUE_MID    = colors.HexColor('#1e40af')
BLUE_LIGHT  = colors.HexColor('#dbeafe')
GRAY_LIGHT  = colors.HexColor('#f3f4f6')
GRAY_MID    = colors.HexColor('#e5e7eb')
GRAY_DARK   = colors.HexColor('#374151')
GREEN       = colors.HexColor('#15803d')
GREEN_LIGHT = colors.HexColor('#dcfce7')
RED         = colors.HexColor('#dc2626')
RED_LIGHT   = colors.HexColor('#fee2e2')
AMBER       = colors.HexColor('#b45309')
AMBER_LIGHT = colors.HexColor('#fef3c7')


class PageNumCanvas(rl_canvas.Canvas):
    """Canvas subclass that draws a footer with method note and page x/y on every page."""

    def __init__(self, *args, method_note='', **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []
        self._method_note = method_note

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
        # Left: method note
        self.drawString(1.8 * cm, 1.1 * cm, self._method_note)
        # Right: page count
        page_text = f"Page {page_num} of {total_pages}"
        self.drawRightString(A4[0] - 1.8 * cm, 1.1 * cm, page_text)
        # Hairline rule above footer
        self.setStrokeColor(colors.HexColor('#d1d5db'))
        self.setLineWidth(0.5)
        self.line(1.8 * cm, 1.4 * cm, A4[0] - 1.8 * cm, 1.4 * cm)
        self.restoreState()


def make_table_style(header_bg=None, alternate=True, grid=True):
    base = [
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ]
    if header_bg:
        base += [
            ('BACKGROUND', (0, 0), (-1, 0), header_bg),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ]
    if grid:
        base.append(('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#d1d5db')))
    return base


def create_heat_loss_pdf(data, output_filename):
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
    small_style = ParagraphStyle('Sm', parent=styles['Normal'],
        fontSize=8, textColor=colors.HexColor('#6b7280'), spaceBefore=1)
    warn_style = ParagraphStyle('W', parent=styles['Normal'],
        fontSize=8, textColor=AMBER, spaceBefore=2)

    is_en12831 = data.get('isEN12831', False)

    story = []

    # ── Header ──────────────────────────────────────────────────────────────
    brand_style = ParagraphStyle('Brand', parent=styles['Normal'],
        fontSize=11, textColor=BLUE_MID, alignment=TA_CENTER, spaceAfter=2)
    story.append(Paragraph("OpenHeatLoss.com", brand_style))
    story.append(Paragraph("Heat Loss Calculation Report", title_style))
    story.append(Paragraph(f"Generated: {datetime.now().strftime('%d/%m/%Y %H:%M')}", sub_style))
    story.append(Spacer(1, 0.3*cm))

    # ── Project & Customer info side by side ─────────────────────────────
    proj = [
        ['Project:', data.get('projectName', 'N/A')],
        ['Location:', data.get('location', 'N/A')],
        ['Designer:', data.get('designer', 'N/A')],
        ['External Design Temp:', f"{data.get('externalTemp', -3)}°C"],
    ]
    cust_name = f"{data.get('customerTitle','')} {data.get('customerFirstName','')} {data.get('customerSurname','')}".strip()
    cust = [
        ['Customer:', cust_name or 'N/A'],
        ['Address:', data.get('customerAddress', 'N/A')],
        ['Postcode:', data.get('customerPostcode', 'N/A')],
        ['Telephone:', data.get('customerTelephone', 'N/A')],
    ]

    def kv_table(rows, col_widths):
        t = Table(rows, colWidths=col_widths)
        s = make_table_style(grid=False)
        s += [
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('TEXTCOLOR', (0, 0), (0, -1), colors.HexColor('#374151')),
            ('BACKGROUND', (0, 0), (-1, -1), GRAY_LIGHT),
        ]
        t.setStyle(TableStyle(s))
        return t

    side_by_side = Table(
        [[kv_table(proj, [4.1*cm, 4.6*cm]), kv_table(cust, [3.0*cm, 5.7*cm])]],
        colWidths=[8.7*cm, 8.7*cm], hAlign='LEFT'
    )
    side_by_side.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('LEFTPADDING', (0,0), (-1,-1), 0),
        ('RIGHTPADDING', (0,0), (-1,-1), 0),
        ('TOPPADDING', (0,0), (-1,-1), 0),
        ('BOTTOMPADDING', (0,0), (-1,-1), 0),
    ]))
    story.append(side_by_side)
    story.append(Spacer(1, 0.4*cm))

    # ── Heat Pump Specification ──────────────────────────────────────────
    hp = data.get('heatPump', {})
    if hp.get('manufacturer'):
        story.append(Paragraph("Heat Pump Specification", heading_style))
        min_mod = hp.get('minModulation', 0)
        if min_mod and min_mod > 0:
            hp_data = [
                ['Manufacturer', 'Model', 'Rated Output', 'Min Modulation', 'Flow Temp', 'Return Temp'],
                [
                    hp.get('manufacturer', 'N/A'),
                    hp.get('model', 'N/A'),
                    f"{hp.get('ratedOutput', 0)} kW",
                    f"{min_mod} kW",
                    f"{hp.get('flowTemp', 50)}\u00b0C",
                    f"{hp.get('returnTemp', 40)}\u00b0C",
                ]
            ]
            hp_table = Table(hp_data, colWidths=[4.1*cm, 4.3*cm, 2.7*cm, 2.7*cm, 1.8*cm, 1.8*cm])
        else:
            hp_data = [
                ['Manufacturer', 'Model', 'Rated Output', 'Flow Temp', 'Return Temp'],
                [
                    hp.get('manufacturer', 'N/A'),
                    hp.get('model', 'N/A'),
                    f"{hp.get('ratedOutput', 0)} kW",
                    f"{hp.get('flowTemp', 50)}\u00b0C",
                    f"{hp.get('returnTemp', 40)}\u00b0C",
                ]
            ]
            hp_table = Table(hp_data, colWidths=[4.9*cm, 5.0*cm, 3.0*cm, 2.25*cm, 2.25*cm])
        hp_table.setStyle(TableStyle(make_table_style(header_bg=BLUE_DARK) + [
            ('ALIGN', (2,0), (-1,-1), 'CENTER'),
            ('FONTNAME', (0,1), (-1,-1), 'Helvetica-Bold'),
        ]))
        story.append(hp_table)
        story.append(Spacer(1, 0.2*cm))

    # ── System Heat Load Summary ─────────────────────────────────────────
    story.append(Paragraph("System Heat Load Summary", heading_style))

    if is_en12831:
        generator_load  = data.get('totalGeneratorLoad', 0)
        emitter_load    = data.get('totalHeatLossEmitter', 0)
        fabric_loss     = data.get('totalFabricLoss', 0)
        vent_generator  = data.get('totalVentGeneratorW', 0) / 1000
        vent_emitter    = data.get('totalVentEmitterW', 0) / 1000
        typical_load    = data.get('totalTypicalLoad', 0)
        ref_temp        = data.get('referenceTemp', 10.6)

        # Use Paragraph objects for headers so they wrap and centre cleanly
        cell_head = ParagraphStyle('CH', parent=styles['Normal'],
            fontSize=9, textColor=colors.white, fontName='Helvetica-Bold',
            alignment=TA_CENTER, leading=12)
        cell_head_dark = ParagraphStyle('CHD', parent=styles['Normal'],
            fontSize=9, textColor=BLUE_DARK, fontName='Helvetica-Bold',
            alignment=TA_CENTER, leading=12)

        load_data = [
            [
                Paragraph('Fabric Heat Loss', cell_head),
                Paragraph('Ventilation\n(generator)', cell_head),
                Paragraph('Ventilation\n(emitter)', cell_head),
                Paragraph('Generator\nSizing Load', cell_head_dark),
                Paragraph('Emitter\nSizing Load', cell_head),
            ],
            [
                f"{fabric_loss:.2f} kW",
                f"{vent_generator:.2f} kW",
                f"{vent_emitter:.2f} kW",
                f"{generator_load:.2f} kW",
                f"{emitter_load:.2f} kW",
            ]
        ]
        # 17.4cm total — generator column slightly wider as the key figure
        load_table = Table(load_data, colWidths=[3.4*cm, 3.4*cm, 3.4*cm, 3.8*cm, 3.4*cm])
        load_table.setStyle(TableStyle(make_table_style(header_bg=BLUE_DARK) + [
            ('ALIGN', (0,0), (-1,-1), 'CENTER'),
            ('VALIGN', (0,0), (-1,0), 'MIDDLE'),
            ('FONTSIZE', (0,1), (-1,-1), 11),
            ('FONTNAME', (0,1), (-1,-1), 'Helvetica-Bold'),
            ('TEXTCOLOR', (0,1), (2,1), GRAY_DARK),
            ('TEXTCOLOR', (4,1), (4,1), GRAY_DARK),
            # Generator column: light blue bg in header, stronger blue bg in value row
            ('BACKGROUND', (3,0), (3,0), BLUE_LIGHT),
            ('BACKGROUND', (3,1), (3,1), BLUE_MID),
            ('TEXTCOLOR', (3,1), (3,1), colors.white),
            ('FONTSIZE', (3,1), (3,1), 14),
            ('TOPPADDING', (0,1), (-1,-1), 10),
            ('BOTTOMPADDING', (0,1), (-1,-1), 10),
            ('TOPPADDING', (0,0), (-1,0), 6),
            ('BOTTOMPADDING', (0,0), (-1,0), 6),
        ]))
        story.append(load_table)
        story.append(Paragraph(
            "Generator sizing load used for heat pump selection (no wind orientation factor). "
            "Emitter sizing load is higher due to orientation factor x2 on ventilation leakage "
            "(CIBSE DHDG 2026 s.2.5.4.4).",
            small_style
        ))

    else:
        # Legacy ACH path — unchanged behaviour
        total_hl   = data.get('totalHeatLoss', 0)
        fabric     = data.get('totalFabricLoss', 0)
        vent_leg   = data.get('totalVentilationLoss', 0)
        load_data = [
            ['Fabric Heat Loss', 'Ventilation Heat Loss', 'Total Emitter Sizing Load'],
            [
                f"{fabric:.2f} kW",
                f"{vent_leg:.2f} kW",
                f"{total_hl:.2f} kW",
            ]
        ]
        load_table = Table(load_data, colWidths=[5.8*cm, 5.8*cm, 5.8*cm])
        load_table.setStyle(TableStyle(make_table_style(header_bg=BLUE_DARK) + [
            ('ALIGN', (0,0), (-1,-1), 'CENTER'),
            ('FONTSIZE', (0,1), (-1,-1), 14),
            ('FONTNAME', (0,1), (-1,-1), 'Helvetica-Bold'),
            ('TEXTCOLOR', (0,1), (1,1), colors.HexColor('#374151')),
            ('TEXTCOLOR', (2,1), (2,1), BLUE_MID),
            ('BACKGROUND', (2,0), (2,1), BLUE_LIGHT),
            ('TOPPADDING', (0,1), (-1,-1), 10),
            ('BOTTOMPADDING', (0,1), (-1,-1), 10),
        ]))
        story.append(load_table)

    story.append(Spacer(1, 0.3*cm))

    # ── Property statistics ──────────────────────────────────────────────
    sizing_base = data.get('totalGeneratorLoad', data.get('totalHeatLoss', 0)) if is_en12831 else data.get('totalHeatLoss', 0)
    total_floor = data.get('totalFloorArea', 0)
    hl_per_m2   = (sizing_base / total_floor * 1000) if total_floor > 0 else 0

    stats_data = [
        ['Total Floor Area', 'Total Volume', 'Heat Loss / m\u00b2', 'Heat Loss Coeff.', 'No. Rooms'],
        [
            f"{total_floor:.1f} m\u00b2",
            f"{data.get('totalVolume', 0):.1f} m\u00b3",
            f"{hl_per_m2:.1f} W/m\u00b2",
            f"{data.get('heatLossCoefficient', 0):.1f} W/K",
            str(data.get('numberOfRooms', 0)),
        ]
    ]
    stats_table = Table(stats_data, colWidths=[3.48*cm, 3.48*cm, 3.48*cm, 3.48*cm, 3.48*cm])
    stats_table.setStyle(TableStyle(make_table_style(header_bg=GRAY_DARK) + [
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('FONTNAME', (0,1), (-1,-1), 'Helvetica-Bold'),
    ]))
    story.append(stats_table)
    story.append(Spacer(1, 0.4*cm))

    # ── Heat Pump Sizing Check ───────────────────────────────────────────
    if hp.get('manufacturer') and hp.get('ratedOutput', 0) > 0:
        story.append(Paragraph("Heat Pump Sizing Check", heading_style))

        rated   = hp.get('ratedOutput', 0)
        margin  = hp.get('sizingMargin', 0)
        margin_pct = margin * 100

        if is_en12831:
            generator_load = data.get('totalGeneratorLoad', 0)
            sizing_label   = "generator sizing load (BS EN 12831 / CIBSE DHDG 2026)"
            sizing_value   = generator_load
        else:
            sizing_value  = data.get('totalHeatLoss', 0)
            sizing_label  = "building heat load"

        if margin >= 1.0 and margin <= 1.2:
            bg, tc, verdict = GREEN_LIGHT, GREEN, f"\u2714 Sizing margin: {margin_pct:.0f}%"
        elif margin < 1.0:
            bg, tc, verdict = RED_LIGHT, RED, f"\u26a0 Undersized — {margin_pct:.0f}% of {sizing_label}"
        else:
            bg, tc, verdict = GREEN_LIGHT, GREEN, f"\u2714 Sizing margin: {margin_pct:.0f}%"

        sizing_rows = [
            [
                Paragraph(f"<b>Rated output:</b> {rated} kW", styles['Normal']),
                Paragraph(f"<b>Sizing load:</b> {sizing_value:.2f} kW", styles['Normal']),
                Paragraph(f"<b>{verdict}</b>",
                          ParagraphStyle('V', parent=styles['Normal'], textColor=tc)),
            ]
        ]
        sizing_table = Table(sizing_rows, colWidths=[3.5*cm, 4.0*cm, 9.9*cm])
        sizing_table.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), bg),
            ('TOPPADDING', (0,0), (-1,-1), 8),
            ('BOTTOMPADDING', (0,0), (-1,-1), 8),
            ('LEFTPADDING', (0,0), (-1,-1), 8),
            ('RIGHTPADDING', (0,0), (-1,-1), 8),
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
            ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#d1d5db')),
        ]))
        story.append(sizing_table)

        # Modulation check (EN 12831 only)
        if is_en12831:
            typical_load     = data.get('totalTypicalLoad', 0)
            ref_temp         = data.get('referenceTemp', 10.6)
            min_mod_kw       = data.get('minModKw', 0)
            min_mod_temp     = data.get('minModulationTemp', None)

            if typical_load > 0:
                mod_text = (
                    f"<b>Typical load at Te,ref ({ref_temp}\u00b0C):</b> {typical_load:.2f} kW "
                    f"— verify heat pump can modulate to this level without short-cycling "
                    f"(CIBSE DHDG 2026 s.5.7.2)."
                )
                if min_mod_kw and min_mod_temp is not None:
                    direction = "below" if min_mod_temp < ref_temp else "at or above"
                    adequate = " Modulation range adequate across the heating season." if min_mod_temp >= ref_temp else ""
                    mod_text += (
                        f" At minimum modulation of {min_mod_kw} kW, minimum modulation is reached at "
                        f"approximately {min_mod_temp:.1f}\u00b0C outdoor temperature "
                        f"({direction} Te,ref).{adequate}"
                    )
                story.append(Spacer(1, 0.15*cm))
                story.append(Paragraph(mod_text,
                    ParagraphStyle('Mod', parent=styles['Normal'],
                        fontSize=8, textColor=colors.HexColor('#374151'), spaceBefore=2)))

        story.append(Spacer(1, 0.3*cm))

    # ── Room-by-Room Summary ─────────────────────────────────────────────
    story.append(Paragraph("Room-by-Room Heat Loss", heading_style))
    rooms = data.get('rooms', [])

    if rooms:
        if is_en12831:
            # EN 12831 mode: fabric / vent emitter / total emitter / generator / W/m²
            room_header = [
                'Room', 'Int. Temp', 'Area (m\u00b2)', 'Volume (m\u00b3)',
                'Fabric (W)', 'Vent emitter (W)', 'Total emitter (W)', 'Generator (W)', 'W/m\u00b2'
            ]
            room_rows = [room_header]
            total_fabric    = 0
            total_vent_emit = 0
            total_emit      = 0
            total_gen       = 0

            for r in rooms:
                fab  = r.get('fabricLoss', 0)
                ve   = r.get('ventEmitter', 0)
                emit = r.get('emitterTotal', 0)
                gen  = r.get('generatorTotal', 0)
                wm2  = r.get('wPerM2', 0)
                total_fabric    += fab
                total_vent_emit += ve
                total_emit      += emit
                total_gen       += gen
                room_rows.append([
                    r.get('name', 'N/A'),
                    f"{r.get('internalTemp', 21)}\u00b0C",
                    f"{r.get('floorArea', 0):.1f}",
                    f"{r.get('volume', 0):.1f}",
                    f"{fab:.0f}",
                    f"{ve:.0f}",
                    f"{emit:.0f}",
                    f"{gen:.0f}",
                    f"{wm2:.0f}",
                ])

            floor_area = data.get('totalFloorArea', 0)
            gen_wm2 = (total_gen / floor_area) if floor_area > 0 else 0
            room_rows.append([
                'TOTAL', '',
                f"{floor_area:.1f}",
                f"{data.get('totalVolume', 0):.1f}",
                f"{total_fabric:.0f}",
                f"{total_vent_emit:.0f}",
                f"{total_emit:.0f}",
                f"{total_gen:.0f}",
                f"{gen_wm2:.0f}",
            ])

            col_w = [3.7*cm, 1.5*cm, 1.5*cm, 1.7*cm, 1.7*cm, 2.1*cm, 2.1*cm, 2.1*cm, 1.0*cm]
            room_table = Table(room_rows, colWidths=col_w, repeatRows=1)
            style = make_table_style(header_bg=BLUE_DARK)
            style += [
                ('ALIGN', (1,0), (-1,-1), 'RIGHT'),
                ('ALIGN', (0,0), (0,-1), 'LEFT'),
                ('FONTSIZE', (0,0), (-1,-1), 8),
            ]
            for i in range(1, len(room_rows)-1):
                if i % 2 == 0:
                    style.append(('BACKGROUND', (0,i), (-1,i), GRAY_LIGHT))
            last = len(room_rows) - 1
            style += [
                ('BACKGROUND', (0, last), (-1, last), BLUE_LIGHT),
                ('FONTNAME', (0, last), (-1, last), 'Helvetica-Bold'),
                ('LINEABOVE', (0, last), (-1, last), 1.5, BLUE_MID),
                ('TEXTCOLOR', (7, last), (7, last), BLUE_MID),  # Generator total in blue
            ]
            # Highlight generator column header
            style += [
                ('BACKGROUND', (7, 0), (7, 0), BLUE_MID),
            ]
            room_table.setStyle(TableStyle(style))
            story.append(room_table)
            story.append(Paragraph(
                "W/m\u00b2 and heat pump sizing are based on the generator load. "
                "Emitter total includes orientation factor \u00d72 on ventilation leakage (CIBSE DHDG 2026 s.2.5.4.4).",
                small_style
            ))

        else:
            # Legacy ACH mode — original layout
            room_header = ['Room', 'Int. Temp', 'Area (m\u00b2)', 'Volume (m\u00b3)', 'Fabric (W)', 'Ventilation (W)', 'Total (W)', 'W/m\u00b2']
            room_rows = [room_header]
            for r in rooms:
                room_rows.append([
                    r.get('name', 'N/A'),
                    f"{r.get('internalTemp', 21)}\u00b0C",
                    f"{r.get('floorArea', 0):.1f}",
                    f"{r.get('volume', 0):.1f}",
                    f"{r.get('fabricLoss', 0):.0f}",
                    f"{r.get('ventilationLoss', 0):.0f}",
                    f"{r.get('totalHeatLoss', 0):.0f}",
                    f"{r.get('wPerM2', 0):.0f}",
                ])
            total_hl = data.get('totalHeatLoss', 0) * 1000
            room_rows.append([
                'TOTAL', '',
                f"{data.get('totalFloorArea',0):.1f}",
                f"{data.get('totalVolume',0):.1f}",
                f"{data.get('totalFabricLoss',0)*1000:.0f}",
                f"{data.get('totalVentilationLoss',0)*1000:.0f}",
                f"{total_hl:.0f}",
                f"{data.get('heatLossPerM2',0):.0f}",
            ])
            col_w = [4.6*cm, 1.7*cm, 1.7*cm, 2.0*cm, 2.0*cm, 2.4*cm, 1.9*cm, 1.1*cm]
            room_table = Table(room_rows, colWidths=col_w, repeatRows=1)
            style = make_table_style(header_bg=BLUE_DARK)
            style += [
                ('ALIGN', (1,0), (-1,-1), 'RIGHT'),
                ('ALIGN', (0,0), (0,-1), 'LEFT'),
            ]
            for i in range(1, len(room_rows)-1):
                if i % 2 == 0:
                    style.append(('BACKGROUND', (0,i), (-1,i), GRAY_LIGHT))
            last = len(room_rows) - 1
            style += [
                ('BACKGROUND', (0, last), (-1, last), BLUE_LIGHT),
                ('FONTNAME', (0, last), (-1, last), 'Helvetica-Bold'),
                ('LINEABOVE', (0, last), (-1, last), 1.5, BLUE_MID),
                ('TEXTCOLOR', (6, last), (6, last), BLUE_MID),
            ]
            room_table.setStyle(TableStyle(style))
            story.append(room_table)

    else:
        story.append(Paragraph("No rooms have been added to this project.", styles['Normal']))

    story.append(Spacer(1, 0.4*cm))

    # ── SCOP Estimator ───────────────────────────────────────────────────
    scop = data.get('scop')
    if scop:
        story.append(Paragraph("Performance Estimator (SCOP)", heading_style))

        green_light = colors.HexColor('#dcfce7')
        blue_light2  = colors.HexColor('#dbeafe')
        purple_light = colors.HexColor('#ede9fe')
        purple_mid   = colors.HexColor('#7c3aed')

        # ── Three headline figures ────────────────────────────────────────
        sh_scop  = scop.get('shScop', '—')
        dhw_scop = scop.get('dhwScop')
        ws_scop  = scop.get('wholeScop')

        sh_sub  = f"Without defrost: {scop.get('shScopNoDefrost', '—')}"
        dhw_sub = (
            f"{scop.get('occupants')} occupants · {scop.get('cylinderLitres')}L · "
            f"Pasteurisation COP: {scop.get('dhwCopPast', '—')}"
            if dhw_scop else "Enter occupants & cylinder volume in MCS031 to enable"
        )
        ws_sub = (
            f"{scop.get('wholeTotalHeatKwh', 0):,.0f} kWh heat · "
            f"{scop.get('wholeTotalElecKwh', 0):,.0f} kWh electricity"
            if ws_scop else "Requires DHW data"
        )

        scop_header_style = ParagraphStyle('SCH', parent=styles['Normal'],
            fontSize=8, textColor=colors.HexColor('#6b7280'), alignment=TA_CENTER)
        scop_value_style  = ParagraphStyle('SCV', parent=styles['Normal'],
            fontSize=20, fontName='Helvetica-Bold', alignment=TA_CENTER)
        scop_sub_style    = ParagraphStyle('SCS', parent=styles['Normal'],
            fontSize=7.5, textColor=colors.HexColor('#6b7280'), alignment=TA_CENTER)

        def scop_cell(label, value, sub, bg, value_color):
            return [
                Paragraph(label, scop_header_style),
                Paragraph(str(value) if value else '—',
                          ParagraphStyle('SCV2', parent=scop_value_style, textColor=value_color)),
                Paragraph(sub, scop_sub_style),
            ]

        scop_rows = [
            [
                scop_cell("Space Heating SCOP", sh_scop,
                          sh_sub, green_light, GREEN),
                scop_cell("DHW SCOP", dhw_scop,
                          dhw_sub, blue_light2, BLUE_MID),
                scop_cell("Whole-System SCOP", ws_scop,
                          ws_sub, purple_light, purple_mid),
            ]
        ]

        scop_table = Table(scop_rows, colWidths=[5.8*cm, 5.8*cm, 5.8*cm])
        scop_style = [
            ('BACKGROUND', (0, 0), (0, 0), green_light),
            ('BACKGROUND', (1, 0), (1, 0), blue_light2 if dhw_scop else GRAY_LIGHT),
            ('BACKGROUND', (2, 0), (2, 0), purple_light if ws_scop else GRAY_LIGHT),
            ('ALIGN',      (0, 0), (-1, -1), 'CENTER'),
            ('VALIGN',     (0, 0), (-1, -1), 'TOP'),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#d1d5db')),
        ]
        scop_table.setStyle(TableStyle(scop_style))
        story.append(scop_table)
        story.append(Spacer(1, 0.3*cm))

        # ── Annual energy table ───────────────────────────────────────────
        energy_rows = [['', 'Heat demand', 'Electricity']]
        energy_rows.append([
            'Space heating',
            f"{scop.get('shHeatKwh', 0):,.0f} kWh",
            f"{scop.get('shElecKwh', 0):,.0f} kWh",
        ])
        if dhw_scop:
            energy_rows.append([
                'Domestic hot water',
                f"{scop.get('dhwHeatKwh', 0):,.0f} kWh",
                f"{scop.get('dhwElecKwh', 0):,.0f} kWh",
            ])
        if ws_scop:
            energy_rows.append([
                'TOTAL',
                f"{scop.get('wholeTotalHeatKwh', 0):,.0f} kWh",
                f"{scop.get('wholeTotalElecKwh', 0):,.0f} kWh",
            ])

        energy_table = Table(energy_rows, colWidths=[5.8*cm, 5.8*cm, 5.8*cm])
        energy_style = make_table_style(header_bg=GRAY_DARK) + [
            ('ALIGN', (1, 0), (-1, -1), 'RIGHT'),
            ('ALIGN', (0, 0), (0, -1), 'LEFT'),
            ('FONTNAME', (0, len(energy_rows)-1), (-1, len(energy_rows)-1), 'Helvetica-Bold'),
            ('BACKGROUND', (0, len(energy_rows)-1), (-1, len(energy_rows)-1), BLUE_LIGHT),
            ('LINEABOVE', (0, len(energy_rows)-1), (-1, len(energy_rows)-1), 1, BLUE_MID),
        ] if ws_scop else make_table_style(header_bg=GRAY_DARK) + [
            ('ALIGN', (1, 0), (-1, -1), 'RIGHT'),
            ('ALIGN', (0, 0), (0, -1), 'LEFT'),
        ]
        energy_table.setStyle(TableStyle(energy_style))
        story.append(energy_table)
        story.append(Spacer(1, 0.15*cm))
        story.append(Paragraph(
            f"Carnot efficiency model fitted from EN 14511 test data. Flow temperature derived from building W/K "
            f"via LMTD exponent method. Balance point {scop.get('balancePoint', 12.5)}\u00b0C. "
            f"UK bin hours per EN 14825:2022 Annex C extended climate. "
            f"This is an engineering estimate, not a replacement for MCS compliance calculation.",
            small_style
        ))
        story.append(Spacer(1, 0.3*cm))

    # ── Ventilation Warnings ─────────────────────────────────────────────
    vent_warnings = data.get('ventWarnings', [])
    if is_en12831 and vent_warnings:
        warn_cell_style = ParagraphStyle('WC', parent=styles['Normal'],
            fontSize=9, textColor=colors.HexColor('#374151'), leading=12)
        warn_head_style = ParagraphStyle('WH', parent=styles['Normal'],
            fontSize=9, textColor=colors.white, fontName='Helvetica-Bold')

        warn_rows = [
            [Paragraph('Room', warn_head_style), Paragraph('Notice', warn_head_style)]
        ]
        for w in vent_warnings:
            msgs = []
            if w.get('belowMinimum'):
                msgs.append("Calculated leakage rate below EN 12831-1 Table B.7 minimum — minimum rate used for heat loss.")
            if w.get('contVentWarning') == 'mev_unbalanced':
                msgs.append("Unbalanced continuous extract (MEV) — outside CIBSE 2026 reduced method scope. Full EN 12831-1 calculation required.")
            if msgs:
                warn_rows.append([
                    Paragraph(w.get('roomName', ''), warn_cell_style),
                    Paragraph(' '.join(msgs), warn_cell_style),
                ])

        if len(warn_rows) > 1:
            story.append(Paragraph("Ventilation Notices", heading_style))
            story.append(Paragraph(
                "The following rooms show infiltration rates below the BS EN 12831-1 Table B.7 minimum (0.5 ACH). "
                "The minimum rate is used for heat loss purposes in these rooms. This does not indicate a Building "
                "Regulations ventilation compliance issue. Ventilation adequacy should be considered separately.",
                small_style
            ))
            story.append(Spacer(1, 0.15*cm))
            warn_table = Table(warn_rows, colWidths=[4.0*cm, 13.4*cm], repeatRows=1)
            warn_table.setStyle(TableStyle(make_table_style(header_bg=AMBER) + [
                ('ALIGN', (0,0), (-1,-1), 'LEFT'),
                ('BACKGROUND', (0,1), (-1,-1), AMBER_LIGHT),
            ]))
            story.append(warn_table)
            story.append(Spacer(1, 0.3*cm))

    # ── Build — footer drawn on every page via PageNumCanvas ─────────────
    method_note = (
        "Heat loss calculations performed in accordance with BS EN 12831-1:2017 "
        "using the CIBSE DHDG 2026 reduced method."
        if is_en12831 else
        "Heat loss calculations performed in accordance with BS EN 12831. "
        "This report is for design purposes only."
    )
    doc.build(
        story,
        canvasmaker=lambda *a, **kw: PageNumCanvas(*a, method_note=method_note, **kw),
    )
    return output_filename


if __name__ == "__main__":
    if len(sys.argv) > 1:
        with open(sys.argv[1], 'r') as f:
            data = json.load(f)
        output_file = sys.argv[2] if len(sys.argv) > 2 else "heat_loss_report.pdf"
    else:
        data = json.load(sys.stdin)
        output_file = "heat_loss_report.pdf"

    create_heat_loss_pdf(data, output_file)
    print(f"PDF generated: {output_file}")
