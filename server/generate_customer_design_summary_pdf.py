#!/usr/bin/env python3
"""
Customer Design Summary PDF Generator

"Your heating system design" — the information MIS 3005-D 5.9.2 (a)-(g)
requires the installer to give the customer in writing before installation.

The payload is built by client/src/utils/buildCustomerDesignSummaryPayload.js
from the same buildCustomerDesignInfo result the on-screen checklist shows.
Status per item: 'ok' | 'warning' | 'missing'. Wording here is written for
the customer; the designer-facing warnings stay in the app. An item that is
still missing prints as "To be confirmed before installation" so the
document is never silently incomplete.
"""

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table,
                                TableStyle, KeepTogether)
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
import json
import math
import sys
from datetime import datetime
from xml.sax.saxutils import escape

BLUE_DARK   = colors.HexColor('#1e3a8a')
BLUE_MID    = colors.HexColor('#1e40af')
BLUE_LIGHT  = colors.HexColor('#dbeafe')
GRAY_LIGHT  = colors.HexColor('#f3f4f6')
GRAY_TEXT   = colors.HexColor('#6b7280')
GRAY_LINE   = colors.HexColor('#d1d5db')
AMBER       = colors.HexColor('#b45309')
AMBER_LIGHT = colors.HexColor('#fef3c7')
AMBER_HEAD  = colors.HexColor('#fde68a')
GRAY_HEAD   = colors.HexColor('#e5e7eb')
GRAY_DARK   = colors.HexColor('#1f2937')

USABLE_W = 17.4 * cm   # A4 less 1.8 cm margins each side

TBC = 'To be confirmed before installation.'

HEAT_PUMP_TYPES = {
    'ASHP': 'air source heat pump',
    'GSHP': 'ground source heat pump',
    'WSHP': 'water source heat pump',
}


# ── Number formatting — tolerate None / NaN from the payload ────────────────
def num(v):
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if math.isfinite(f) else None


def fmt(v, dp=0, unit=''):
    f = num(v)
    if f is None:
        return '—'
    s = f"{f:,.{dp}f}"
    return f"{s} {unit}".strip() if unit else s


def temp(v, dp=0):
    """45 -> '45 °C', 48.6 -> '48.6 °C' (dp=1 drops a trailing .0)."""
    f = num(v)
    if f is None:
        return '—'
    s = f"{f:.{dp}f}"
    if dp and s.endswith('.0'):
        s = s[:-2]
    return f"{s} °C"


class PageNumCanvas(rl_canvas.Canvas):
    """Footer with a note and page x/y on every page (as the other reports)."""

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
        self.setFillColor(GRAY_TEXT)
        self.drawString(1.8 * cm, 1.1 * cm, self._footer_note)
        self.drawRightString(A4[0] - 1.8 * cm, 1.1 * cm, f"Page {page_num} of {total_pages}")
        self.setStrokeColor(GRAY_LINE)
        self.setLineWidth(0.5)
        self.line(1.8 * cm, 1.4 * cm, A4[0] - 1.8 * cm, 1.4 * cm)
        self.restoreState()


# Table headers are deliberately quiet (light band, dark text) so the section
# headings are the strongest thing on the page.
def grid_style(header_bg=GRAY_HEAD, header_text=GRAY_DARK):
    return [
        ('FONTSIZE',      (0, 0), (-1, -1), 8.5),
        ('VALIGN',        (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING',    (0, 0), (-1, -1), 3.5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3.5),
        ('LEFTPADDING',   (0, 0), (-1, -1), 5),
        ('RIGHTPADDING',  (0, 0), (-1, -1), 5),
        ('GRID',          (0, 0), (-1, -1), 0.5, GRAY_LINE),
        ('BACKGROUND',    (0, 0), (-1, 0), header_bg),
        ('TEXTCOLOR',     (0, 0), (-1, 0), header_text),
        ('FONTNAME',      (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE',      (0, 0), (-1, 0), 8),
    ]


def create_customer_design_summary_pdf(data, output_filename):
    doc = SimpleDocTemplate(
        output_filename, pagesize=A4,
        rightMargin=1.8 * cm, leftMargin=1.8 * cm,
        topMargin=2 * cm, bottomMargin=2.5 * cm,
        title='Your Heating System Design',
    )

    ss = getSampleStyleSheet()
    S = {
        'brand':   ParagraphStyle('brand', parent=ss['Normal'], fontSize=11, textColor=BLUE_MID,
                                  alignment=TA_CENTER, spaceAfter=2),
        'title':   ParagraphStyle('title', parent=ss['Heading1'], fontSize=17, textColor=BLUE_DARK,
                                  alignment=TA_CENTER, spaceAfter=4),
        'sub':     ParagraphStyle('sub', parent=ss['Normal'], fontSize=9.5, textColor=GRAY_TEXT,
                                  alignment=TA_CENTER, spaceAfter=8, leading=12),
        'h':       ParagraphStyle('h', parent=ss['Heading2'], fontSize=11, textColor=BLUE_MID,
                                  spaceBefore=10, spaceAfter=3),
        'body':    ParagraphStyle('body', parent=ss['Normal'], fontSize=9, leading=12.5, spaceAfter=3),
        'note':    ParagraphStyle('note', parent=ss['Normal'], fontSize=8, leading=10.5,
                                  textColor=GRAY_TEXT, spaceAfter=2),
        'tbc':     ParagraphStyle('tbc', parent=ss['Normal'], fontSize=9, leading=12,
                                  textColor=AMBER, fontName='Helvetica-Oblique'),
        'cell':    ParagraphStyle('cell', parent=ss['Normal'], fontSize=8.5, leading=10.5),
        'big':     ParagraphStyle('big', parent=ss['Normal'], fontSize=11.5, leading=15,
                                  textColor=GRAY_DARK, fontName='Helvetica-Bold', spaceAfter=2),
        'secletter': ParagraphStyle('secletter', parent=ss['Normal'], fontSize=12, leading=14,
                                  textColor=colors.white, fontName='Helvetica-Bold', alignment=TA_CENTER),
        'sectitle': ParagraphStyle('sectitle', parent=ss['Normal'], fontSize=11.5, leading=14,
                                  textColor=BLUE_DARK, fontName='Helvetica-Bold'),
        'secclause': ParagraphStyle('secclause', parent=ss['Normal'], fontSize=7, leading=9,
                                  textColor=GRAY_TEXT, alignment=TA_RIGHT),
    }

    std = data.get('standard') or {}
    std_label = std.get('label', 'MIS 3005-D')
    clause = std.get('clause', '')
    items = {i.get('key'): i for i in (data.get('items') or [])}

    story = []

    # ── Header ──────────────────────────────────────────────────────────────
    story.append(Paragraph("OpenHeatLoss.com", S['brand']))
    story.append(Paragraph("Your Heating System Design", S['title']))
    story.append(Paragraph(
        f"Design information given to you before installation, as required by "
        f"{escape(std_label)} ({escape(std.get('title', ''))}), clause {escape(clause)}"
        f"<br/>Generated: {datetime.now().strftime('%d/%m/%Y %H:%M')}",
        S['sub']))

    cust = ' '.join(filter(None, [data.get('customerTitle', ''), data.get('customerFirstName', ''),
                                  data.get('customerSurname', '')])).strip()
    info_rows = [
        ['Customer:', cust or '—',                               'Project:',  data.get('projectName') or '—'],
        ['Address:',  data.get('customerAddress') or '—',        'Designer:', data.get('designer') or '—'],
        ['Postcode:', data.get('customerPostcode') or '—',       'Outdoor design temp:', temp(data.get('externalTemp'), 1)],
    ]
    info_rows = [[r[0], Paragraph(escape(str(r[1])), S['cell']), r[2], Paragraph(escape(str(r[3])), S['cell'])]
                 for r in info_rows]
    info = Table(info_rows, colWidths=[2.2 * cm, 6.2 * cm, 3.6 * cm, 5.4 * cm])
    info.setStyle(TableStyle([
        ('FONTNAME',      (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME',      (2, 0), (2, -1), 'Helvetica-Bold'),
        ('FONTSIZE',      (0, 0), (-1, -1), 8.5),
        ('BACKGROUND',    (0, 0), (-1, -1), GRAY_LIGHT),
        ('VALIGN',        (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING',    (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('GRID',          (0, 0), (-1, -1), 0.5, GRAY_LINE),
    ]))
    story.append(info)

    def section(item, body):
        """Heading '(a) Title' with the clause reference, then the body flowables."""
        band = Table([[
            Paragraph(escape(str(item.get('key', ''))), S['secletter']),
            Paragraph(escape(item.get('title', '')), S['sectitle']),
            Paragraph(f"Clause {escape(item.get('clause', ''))}", S['secclause']),
        ]], colWidths=[0.9 * cm, 14.2 * cm, 2.3 * cm])
        band.setStyle(TableStyle([
            ('BACKGROUND',    (0, 0), (0, 0), BLUE_DARK),
            ('BACKGROUND',    (1, 0), (-1, 0), BLUE_LIGHT),
            ('VALIGN',        (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING',    (0, 0), (-1, -1), 5),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
            ('LEFTPADDING',   (1, 0), (1, 0), 8),
            ('LINEBELOW',     (0, 0), (-1, 0), 1.2, BLUE_DARK),
        ]))
        head = [Spacer(1, 0.45 * cm), band, Spacer(1, 0.2 * cm)]
        # Keep the heading with at least the start of its content
        story.append(KeepTogether(head + body[:1]))
        story.extend(body[1:])

    # ── (a) Room heat losses ────────────────────────────────────────────────
    a = items.get('a', {})
    if a.get('status') == 'missing' or not a.get('rooms'):
        section(a, [Paragraph(TBC, S['tbc'])])
    else:
        rows = [['Room', 'Floor area', 'Heat loss', 'Heat loss per m²']]
        total_area = 0
        for r in a['rooms']:
            total_area += num(r.get('floorArea')) or 0
            rows.append([Paragraph(escape(str(r.get('name', 'Room'))), S['cell']),
                         fmt(r.get('floorArea'), 1, 'm²'),
                         fmt(r.get('heatLossW'), 0, 'W'),
                         fmt(r.get('wPerM2'), 0, 'W/m²')])
        rows.append(['Whole house', fmt(total_area, 1, 'm²'), '', fmt(a.get('buildingWPerM2'), 0, 'W/m²')])
        t = Table(rows, colWidths=[7.4 * cm, 3.2 * cm, 3.2 * cm, 3.6 * cm], repeatRows=1)
        t.setStyle(TableStyle(grid_style() + [
            ('ALIGN',      (1, 0), (-1, -1), 'RIGHT'),
            ('BACKGROUND', (0, -1), (-1, -1), BLUE_LIGHT),
            ('FONTNAME',   (0, -1), (-1, -1), 'Helvetica-Bold'),
        ]))
        section(a, [
            Paragraph(f"The heat each room loses when it is at its design temperature and it is "
                      f"{temp(data.get('externalTemp'), 1)} outside, calculated to BS EN 12831-1:2017.",
                      S['body']),
            t,
        ])

    # ── (b) Daily hot water demand ──────────────────────────────────────────
    b = items.get('b', {})
    demand = b.get('demand')
    if b.get('status') == 'missing' or not demand:
        section(b, [Paragraph(TBC, S['tbc'])])
    else:
        n = demand.get('n')
        basis = ('the number of people living in the home' if demand.get('basis') == 'occupants'
                 else 'the number of bedrooms plus one')
        section(b, [
            Paragraph(f"{fmt(demand.get('litres'))} litres per day", S['big']),
            Paragraph(f"45 litres per person per day for {fmt(n)} people. The number of people is the "
                      f"greater of the number of bedrooms plus one, or the number of people living in the "
                      f"home; here it is set by {basis}.", S['body']),
        ])

    # ── (c) Emitters ────────────────────────────────────────────────────────
    c = items.get('c', {})
    if c.get('status') == 'missing':
        section(c, [Paragraph(TBC, S['tbc'])])
    else:
        rows = [['Room', 'Emitter', 'Qty']]
        for r in c.get('rooms', []):
            ems = r.get('emitters') or []
            for j, e in enumerate(ems):
                desc = escape(str(e.get('description') or ''))
                if e.get('retained'):
                    desc += " <font color='#1e40af'>(existing, retained)</font>"
                rows.append([
                    Paragraph(escape(str(r.get('name', 'Room'))), S['cell']) if j == 0 else '',
                    Paragraph(desc, S['cell']),
                    str(e.get('quantity') or 1),
                ])
        t = Table(rows, colWidths=[4.2 * cm, 11.9 * cm, 1.3 * cm], repeatRows=1)
        t.setStyle(TableStyle(grid_style() + [
            ('ALIGN',  (2, 0), (2, -1), 'CENTER'),
            ('VALIGN', (0, 1), (-1, -1), 'TOP'),
        ]))
        body = [t]
        without = c.get('roomsWithoutEmitters') or []
        if without:
            body.append(Spacer(1, 0.1 * cm))
            body.append(Paragraph("No heat emitter in: " + escape(', '.join(map(str, without))) + '.', S['note']))
        section(c, body)

    # ── (d) Design emitter temperature ──────────────────────────────────────
    d = items.get('d', {})
    if d.get('status') == 'missing':
        section(d, [Paragraph(TBC, S['tbc'])])
    else:
        key = Table([
            ['Design flow temperature', 'Design return temperature', 'Mean water temperature'],
            [temp(d.get('flowTemp'), 1), temp(d.get('returnTemp'), 1), temp(d.get('meanWaterTemp'), 1)],
        ], colWidths=[USABLE_W / 3] * 3)
        key.setStyle(TableStyle(grid_style() + [
            ('ALIGN',         (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME',      (0, 1), (-1, 1), 'Helvetica-Bold'),
            ('FONTSIZE',      (0, 1), (-1, 1), 10),
            ('TOPPADDING',    (0, 1), (-1, 1), 6),
            ('BOTTOMPADDING', (0, 1), (-1, 1), 6),
        ]))
        body = [
            Paragraph("The emitters are sized for the water temperatures below, with the outdoor "
                      "temperature at its design value.", S['body']),
            key, Spacer(1, 0.15 * cm),
        ]
        if d.get('worstRoom'):
            body.append(Paragraph(
                f"The worst performing room — the room whose emitters need the hottest water to "
                f"reach its design temperature — is <b>{escape(str(d['worstRoom']))}</b>, which needs a "
                f"flow temperature of <b>{temp(d.get('worstRoomFlowTemp'), 1)}</b>.", S['body']))
        if num(d.get('ufhMinFlowTemp')) is not None:
            body.append(Paragraph(
                f"The underfloor heating needs a flow temperature of at least "
                f"{temp(d.get('ufhMinFlowTemp'), 1)}.", S['body']))

        # Rooms whose emitters are below their heat loss — accepted ones with
        # the reason, plus any the designer has not yet resolved (the app
        # warns before printing those).
        short = [{'name': s.get('name'), 'shortfallW': s.get('shortfallW'), 'reason': s.get('reason')}
                 for s in (d.get('acceptedShortfalls') or [])]
        short += [{'name': s.get('name'), 'shortfallW': s.get('shortfallW'), 'reason': None}
                  for s in (d.get('unresolvedShortRooms') or [])]
        if short:
            if d.get('wholeHouseCovered'):
                intro = ("In the rooms below the emitters give out less heat than the room loses at the "
                         "design conditions. A larger or additional emitter was not practical. The emitters across "
                         "the whole house still cover its total heat loss, but on the "
                         "coldest days these rooms may not quite reach their design temperature.")
            else:
                intro = ("In the rooms below the emitters give out less heat than the room loses at the "
                         "design conditions, and the total emitter output is below the whole-house heat "
                         "loss at this flow temperature.")
            rows = [['Room', 'Shortfall', 'Reason']]
            for s in short:
                reason = (s.get('reason') or '').strip() or '—'
                rows.append([Paragraph(escape(str(s.get('name') or 'Room')), S['cell']),
                             fmt(s.get('shortfallW'), 0, 'W'),
                             Paragraph(escape(reason), S['cell'])])
            t = Table(rows, colWidths=[4.2 * cm, 2.2 * cm, 11.0 * cm], repeatRows=1)
            t.setStyle(TableStyle(grid_style(header_bg=AMBER_HEAD, header_text=AMBER) + [
                ('BACKGROUND', (0, 1), (-1, -1), AMBER_LIGHT),
                ('ALIGN',      (1, 0), (1, -1), 'CENTER'),
                ('VALIGN',     (0, 1), (-1, -1), 'TOP'),
            ]))
            # Keep the explanation with its table rather than split across pages
            body.append(KeepTogether([Paragraph(intro, S['body']), t]))
        section(d, body)

    # ── (e) New hot water cylinder and recovery ─────────────────────────────
    e = items.get('e', {})
    if e.get('isNew') is False:
        vol = f" ({fmt(e.get('litres'))} litres)" if num(e.get('litres')) else ''
        section(e, [Paragraph(f"Your existing hot water cylinder{vol} is being kept. "
                              f"No new cylinder is being fitted.", S['body'])])
    else:
        make_model = ' '.join(filter(None, [e.get('manufacturer'), e.get('model')])).strip()
        rows = []
        if make_model:
            rows.append(['Cylinder', Paragraph(escape(make_model), S['cell'])])
        if num(e.get('litres')):
            rows.append(['Volume', fmt(e.get('litres'), 0, 'litres')])
        if num(e.get('coilAreaM2')):
            rows.append(['Heat exchanger coil area', fmt(e.get('coilAreaM2'), 2, 'm²')])
        if num(e.get('recoveryMin')):
            conditions = escape(e.get('conditions') or 'From a fully cold cylinder')
            rows.append(['Heat-up time', Paragraph(
                f"<b>{fmt(e.get('recoveryMin'))} minutes</b> — {conditions}", S['cell'])])
            if num(e.get('recoveryLph')):
                rows.append(['Recovery rate', Paragraph(
                    f"{fmt(e.get('recoveryLph'))} litres per hour — {conditions}", S['cell'])])
            if e.get('recoveryBasis') == 'heat_pump' and num(e.get('hpOutputKw')):
                basis = f"Calculated from the heat pump's hot water output of {fmt(e.get('hpOutputKw'), 1, 'kW')}"
            elif e.get('recoveryBasis') == 'heat_pump':
                basis = "Calculated from the heat pump's hot water output"
            else:
                basis = "Cylinder manufacturer's published figure"
            rows.append(['Basis', Paragraph(basis, S['cell'])])
        if e.get('reheatAgreed') and num(e.get('reheatAgreedMin')):
            rows.append(['Reheat time agreed with you', fmt(e.get('reheatAgreedMin'), 0, 'minutes')])

        body = []
        if rows:
            t = Table(rows, colWidths=[5.0 * cm, 12.4 * cm])
            t.setStyle(TableStyle([
                ('FONTSIZE',      (0, 0), (-1, -1), 8.5),
                ('FONTNAME',      (0, 0), (0, -1), 'Helvetica-Bold'),
                ('BACKGROUND',    (0, 0), (0, -1), GRAY_LIGHT),
                ('VALIGN',        (0, 0), (-1, -1), 'MIDDLE'),
                ('TOPPADDING',    (0, 0), (-1, -1), 3.5),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 3.5),
                ('GRID',          (0, 0), (-1, -1), 0.5, GRAY_LINE),
            ]))
            body.append(t)
        if e.get('status') == 'missing':
            body.append(Spacer(1, 0.1 * cm))
            body.append(Paragraph(('Remaining details: ' if rows else '') + TBC, S['tbc']))
        section(e, body)

    # ── (f) Flow temperature leaving the heat pump ──────────────────────────
    f = items.get('f', {})
    if f.get('status') == 'missing' or num(f.get('leavingTemp')) is None:
        section(f, [Paragraph(TBC, S['tbc'])])
    else:
        body = [Paragraph(temp(f.get('leavingTemp'), 1), S['big']),
                Paragraph("The temperature of the water leaving the heat pump on the coldest design day, "
                          "before any mixing (blending) valve.", S['body'])]
        blended = f.get('blendedCircuits') or []
        if blended:
            parts = ', '.join(f"{escape(str(u.get('name')))} ({temp(u.get('flowTemp'), 1)})" for u in blended)
            body.append(Paragraph(f"Underfloor heating blended down to a lower temperature: {parts}.", S['body']))
        section(f, body)

    # ── (g) Seasonal performance ────────────────────────────────────────────
    g = items.get('g', {})
    if g.get('basis') == 'listed_scop':
        # No-EPC route: the heat pump's SCoP as listed on the MCS website
        if g.get('status') == 'missing' or num(g.get('scop')) is None:
            section(g, [Paragraph(TBC, S['tbc'])])
        else:
            hp = HEAT_PUMP_TYPES.get(g.get('heatPumpType'), 'heat pump')
            article = 'an' if hp[0] in 'aeiou' else 'a'
            section(g, [
                Paragraph(f"Seasonal coefficient of performance (SCoP): {fmt(g.get('scop'), 2)}", S['big']),
                Paragraph(
                    f"The SCoP for {article} {hp} as listed on the MCS website ({escape(str(g.get('source') or ''))}). "
                    f"It is the expected heat delivered for each unit of electricity used over a year; actual "
                    f"performance depends on the weather and how the system is used.", S['body']),
            ])
    elif g.get('status') == 'missing' or num(g.get('spf')) is None:
        section(g, [Paragraph(TBC, S['tbc'])])
    else:
        hp = HEAT_PUMP_TYPES.get(g.get('heatPumpType'), 'heat pump')
        article = 'an' if hp[0] in 'aeiou' else 'a'
        section(g, [
            Paragraph(f"Seasonal performance factor (SPF): {fmt(g.get('spf'), 1)}", S['big']),
            Paragraph(
                f"Taken from MCS 031 ({escape(data.get('mcs031Calculator') or '')}) for {article} {hp} with a "
                f"design flow temperature of {temp(f.get('leavingTemp'), 1)} "
                f"(the {escape(str(g.get('flowTempBand', '')))} °C band). "
                f"MCS 031 version 4 gives this SPF in place of a SCoP. It is the expected heat delivered "
                f"for each unit of electricity used over a year; actual performance depends on the weather "
                f"and how the system is used.", S['body']),
        ])

    footer_note = (f"Design information to {std_label} clause {clause}. "
                   f"Heat losses to BS EN 12831-1:2017 / CIBSE DHDG 2026.")
    doc.build(story, canvasmaker=lambda *a, **kw: PageNumCanvas(*a, footer_note=footer_note, **kw))
    return output_filename


if __name__ == "__main__":
    if len(sys.argv) > 1:
        with open(sys.argv[1], 'r') as fh:
            data = json.load(fh)
        output_file = sys.argv[2] if len(sys.argv) > 2 else "customer_design_summary.pdf"
    else:
        data = json.load(sys.stdin)
        output_file = "customer_design_summary.pdf"

    create_customer_design_summary_pdf(data, output_file)
    print(f"PDF generated: {output_file}")
