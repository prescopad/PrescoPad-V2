"""
Prescription PDF Generator — ReportLab Native (platypus)
========================================================
Generates a professional A4 medical prescription using ReportLab's
flowable-based layout engine.  Every section is a discrete flowable
with explicit spacing so nothing can overlap or clip.

Replaces the previous xhtml2pdf HTML-template approach.
"""

import io
import re
import base64
import logging
import httpx
from datetime import datetime

from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, Image, KeepTogether,
)
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from reportlab.lib import colors

log = logging.getLogger(__name__)

# ─── Color Palette ────────────────────────────────────────────────────────────
TEAL_PRIMARY   = colors.HexColor("#0B6E6E")   # headers, dividers, table header
TEAL_LIGHT     = colors.HexColor("#F0F7F7")   # alternating table rows
NAVY           = colors.HexColor("#1B3A6B")   # alternative accent
TEXT_PRIMARY    = colors.HexColor("#111827")   # main body text
TEXT_SECONDARY  = colors.HexColor("#555555")   # secondary / muted text
TEXT_MUTED      = colors.HexColor("#6b7280")   # labels, small text
TEXT_FAINT      = colors.HexColor("#9ca3af")   # footer, tiny labels
DIAG_BG        = colors.HexColor("#f0f9ff")   # diagnosis background
DIAG_BORDER    = colors.HexColor("#1d6fa4")   # diagnosis left border
ADVICE_BG      = colors.HexColor("#fffbeb")   # advice background
ADVICE_BORDER  = colors.HexColor("#d97706")   # advice left border
RED_ACCENT     = colors.HexColor("#dc2626")   # follow-up date
WHITE          = colors.white
GRID_LINE      = colors.HexColor("#e5e7eb")   # table grid lines
HASH_COLOR     = colors.HexColor("#d1d5db")   # verification hash

# ─── Page Setup ───────────────────────────────────────────────────────────────
PAGE_WIDTH, PAGE_HEIGHT = A4  # 595.27 × 841.89 pt
MARGIN_TOP    = 40
MARGIN_BOTTOM = 40
MARGIN_LEFT   = 50
MARGIN_RIGHT  = 50
CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT  # ~495 pt


# ─── Paragraph Styles ────────────────────────────────────────────────────────
def _build_styles() -> dict:
    """Create all paragraph styles used in the prescription."""
    return {
        # ── Header ──
        "clinic_name": ParagraphStyle(
            "ClinicName",
            fontName="Helvetica-Bold",
            fontSize=20,
            leading=24,
            alignment=TA_CENTER,
            textColor=TEAL_PRIMARY,
            spaceAfter=2,
        ),
        "doctor_line": ParagraphStyle(
            "DoctorLine",
            fontName="Helvetica-Bold",
            fontSize=13,
            leading=16,
            alignment=TA_CENTER,
            textColor=TEXT_PRIMARY,
            spaceAfter=2,
        ),
        "clinic_sub": ParagraphStyle(
            "ClinicSub",
            fontName="Helvetica",
            fontSize=9,
            leading=12,
            alignment=TA_CENTER,
            textColor=TEXT_MUTED,
            spaceAfter=1,
        ),

        # ── Patient info labels / values ──
        "label": ParagraphStyle(
            "Label",
            fontName="Helvetica",
            fontSize=9,
            leading=11,
            textColor=TEXT_MUTED,
        ),
        "value": ParagraphStyle(
            "Value",
            fontName="Helvetica-Bold",
            fontSize=11,
            leading=14,
            textColor=TEXT_PRIMARY,
        ),
        "value_right": ParagraphStyle(
            "ValueRight",
            fontName="Helvetica-Bold",
            fontSize=11,
            leading=14,
            textColor=TEXT_PRIMARY,
            alignment=TA_RIGHT,
        ),
        "label_right": ParagraphStyle(
            "LabelRight",
            fontName="Helvetica",
            fontSize=9,
            leading=11,
            textColor=TEXT_MUTED,
            alignment=TA_RIGHT,
        ),

        # ── Section headers ──
        "section_title": ParagraphStyle(
            "SectionTitle",
            fontName="Helvetica-Bold",
            fontSize=12,
            leading=15,
            textColor=TEAL_PRIMARY,
            spaceBefore=10,
            spaceAfter=5,
        ),
        "rx_symbol": ParagraphStyle(
            "RxSymbol",
            fontName="Helvetica-Bold",
            fontSize=18,
            leading=22,
            textColor=TEAL_PRIMARY,
            spaceBefore=8,
            spaceAfter=4,
        ),

        # ── Body text ──
        "body": ParagraphStyle(
            "Body",
            fontName="Helvetica",
            fontSize=10,
            leading=14,
            textColor=TEXT_PRIMARY,
        ),
        "body_bold": ParagraphStyle(
            "BodyBold",
            fontName="Helvetica-Bold",
            fontSize=10,
            leading=14,
            textColor=TEXT_PRIMARY,
        ),

        # ── Styled boxes (diagnosis, advice) ──
        "diagnosis_text": ParagraphStyle(
            "DiagnosisText",
            fontName="Helvetica",
            fontSize=10,
            leading=14,
            textColor=TEXT_PRIMARY,
        ),
        "advice_text": ParagraphStyle(
            "AdviceText",
            fontName="Helvetica",
            fontSize=10,
            leading=14,
            textColor=TEXT_PRIMARY,
        ),

        # ── Follow-up ──
        "followup": ParagraphStyle(
            "Followup",
            fontName="Helvetica-Bold",
            fontSize=11,
            leading=14,
            textColor=RED_ACCENT,
            spaceBefore=8,
            spaceAfter=4,
        ),

        # ── Signature ──
        "sig_name": ParagraphStyle(
            "SigName",
            fontName="Helvetica-Bold",
            fontSize=11,
            leading=14,
            textColor=TEXT_PRIMARY,
            alignment=TA_RIGHT,
        ),
        "sig_detail": ParagraphStyle(
            "SigDetail",
            fontName="Helvetica",
            fontSize=9,
            leading=12,
            textColor=TEXT_MUTED,
            alignment=TA_RIGHT,
        ),

        # ── Footer ──
        "footer": ParagraphStyle(
            "Footer",
            fontName="Helvetica",
            fontSize=8,
            leading=11,
            textColor=TEXT_FAINT,
            alignment=TA_CENTER,
        ),
        "hash": ParagraphStyle(
            "Hash",
            fontName="Courier",
            fontSize=7,
            leading=10,
            textColor=HASH_COLOR,
            alignment=TA_CENTER,
        ),

        # ── Meta row (date / ID) ──
        "meta_right": ParagraphStyle(
            "MetaRight",
            fontName="Helvetica",
            fontSize=10,
            leading=13,
            textColor=TEXT_MUTED,
            alignment=TA_RIGHT,
        ),

        # ── Consultation type badge ──
        "consult_badge": ParagraphStyle(
            "ConsultBadge",
            fontName="Helvetica-Bold",
            fontSize=9,
            leading=12,
            textColor=TEAL_PRIMARY,
        ),

        # ── Lab test items ──
        "lab_item": ParagraphStyle(
            "LabItem",
            fontName="Helvetica",
            fontSize=10,
            leading=14,
            textColor=TEXT_PRIMARY,
            leftIndent=12,
            bulletIndent=0,
        ),
    }


# ═════════════════════════════════════════════════════════════════════════════
# SVG Path → PNG rasteriser  (unchanged from original)
# ═════════════════════════════════════════════════════════════════════════════
def _svg_path_to_png_data_url(path_data: str, width: int = 300, height: int = 100) -> str:
    """Convert an SVG path `d` attribute into a base64 PNG data URL.

    Uses Pillow's ImageDraw so there are zero native/system-library dependencies
    beyond what Pillow already bundles. Bezier curves are approximated as short
    line segments which is more than adequate for hand-drawn signatures.
    """
    from PIL import Image as PILImage, ImageDraw

    # High-res render then scale down for antialiased look
    scale = 2
    img = PILImage.new("RGBA", (width * scale, height * scale), (255, 255, 255, 0))
    draw = ImageDraw.Draw(img)

    # Parse SVG path tokens
    tokens = re.findall(r'[MmLlCcQqSsTtHhVvZz]|[-+]?[0-9]*\.?[0-9]+', path_data)
    i = 0
    cx, cy = 0.0, 0.0
    sx, sy = 0.0, 0.0  # start of sub-path
    segments: list[tuple[float, float, float, float]] = []

    def _nf() -> float:
        nonlocal i
        i += 1
        return float(tokens[i])

    def _bezier_pts(p0, p1, p2, p3, n=12):
        """Approximate a cubic bezier with n line segments."""
        pts = []
        for t_i in range(n + 1):
            t = t_i / n
            u = 1 - t
            x = u**3*p0[0] + 3*u**2*t*p1[0] + 3*u*t**2*p2[0] + t**3*p3[0]
            y = u**3*p0[1] + 3*u**2*t*p1[1] + 3*u*t**2*p2[1] + t**3*p3[1]
            pts.append((x, y))
        return pts

    while i < len(tokens):
        cmd = tokens[i]
        if cmd == 'M':
            cx, cy = _nf(), _nf()
            sx, sy = cx, cy
            while i + 1 < len(tokens) and tokens[i + 1] not in 'MmLlCcQqSsTtHhVvZz':
                nx, ny = _nf(), _nf()
                segments.append((cx * scale, cy * scale, nx * scale, ny * scale))
                cx, cy = nx, ny
        elif cmd == 'm':
            cx += _nf(); cy += _nf()
            sx, sy = cx, cy
        elif cmd == 'L':
            nx, ny = _nf(), _nf()
            segments.append((cx * scale, cy * scale, nx * scale, ny * scale))
            cx, cy = nx, ny
        elif cmd == 'l':
            dx, dy = _nf(), _nf()
            nx, ny = cx + dx, cy + dy
            segments.append((cx * scale, cy * scale, nx * scale, ny * scale))
            cx, cy = nx, ny
        elif cmd == 'C':
            x1, y1 = _nf(), _nf()
            x2, y2 = _nf(), _nf()
            x, y = _nf(), _nf()
            pts = _bezier_pts((cx, cy), (x1, y1), (x2, y2), (x, y))
            for j in range(len(pts) - 1):
                segments.append((pts[j][0]*scale, pts[j][1]*scale, pts[j+1][0]*scale, pts[j+1][1]*scale))
            cx, cy = x, y
        elif cmd == 'c':
            dx1, dy1 = _nf(), _nf()
            dx2, dy2 = _nf(), _nf()
            dx, dy = _nf(), _nf()
            pts = _bezier_pts((cx, cy), (cx+dx1, cy+dy1), (cx+dx2, cy+dy2), (cx+dx, cy+dy))
            for j in range(len(pts) - 1):
                segments.append((pts[j][0]*scale, pts[j][1]*scale, pts[j+1][0]*scale, pts[j+1][1]*scale))
            cx, cy = cx + dx, cy + dy
        elif cmd == 'Q':
            qx1, qy1 = _nf(), _nf()
            x, y = _nf(), _nf()
            c1 = (cx + 2/3*(qx1-cx), cy + 2/3*(qy1-cy))
            c2 = (x + 2/3*(qx1-x), y + 2/3*(qy1-y))
            pts = _bezier_pts((cx, cy), c1, c2, (x, y))
            for j in range(len(pts) - 1):
                segments.append((pts[j][0]*scale, pts[j][1]*scale, pts[j+1][0]*scale, pts[j+1][1]*scale))
            cx, cy = x, y
        elif cmd == 'q':
            dqx1, dqy1 = _nf(), _nf()
            dx, dy = _nf(), _nf()
            qx1, qy1 = cx+dqx1, cy+dqy1
            x, y = cx+dx, cy+dy
            c1 = (cx + 2/3*(qx1-cx), cy + 2/3*(qy1-cy))
            c2 = (x + 2/3*(qx1-x), y + 2/3*(qy1-y))
            pts = _bezier_pts((cx, cy), c1, c2, (x, y))
            for j in range(len(pts) - 1):
                segments.append((pts[j][0]*scale, pts[j][1]*scale, pts[j+1][0]*scale, pts[j+1][1]*scale))
            cx, cy = x, y
        elif cmd == 'H':
            nx = _nf()
            segments.append((cx*scale, cy*scale, nx*scale, cy*scale))
            cx = nx
        elif cmd == 'h':
            dx = _nf()
            segments.append((cx*scale, cy*scale, (cx+dx)*scale, cy*scale))
            cx += dx
        elif cmd == 'V':
            ny = _nf()
            segments.append((cx*scale, cy*scale, cx*scale, ny*scale))
            cy = ny
        elif cmd == 'v':
            dy = _nf()
            segments.append((cx*scale, cy*scale, cx*scale, (cy+dy)*scale))
            cy += dy
        elif cmd in ('Z', 'z'):
            segments.append((cx*scale, cy*scale, sx*scale, sy*scale))
            cx, cy = sx, sy
        i += 1

    stroke_color = (15, 23, 42, 255)  # #0F172A
    stroke_w = max(2, int(2.5 * scale))
    for seg in segments:
        draw.line(seg, fill=stroke_color, width=stroke_w)

    # Downscale for antialiasing
    img = img.resize((width, height), PILImage.LANCZOS)

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    encoded = base64.b64encode(buf.getvalue()).decode("utf-8")
    return f"data:image/png;base64,{encoded}"


# ═════════════════════════════════════════════════════════════════════════════
# URL → base64 fetcher  (unchanged from original)
# ═════════════════════════════════════════════════════════════════════════════
async def get_base64_from_url(url: str) -> str | None:
    if not url:
        return None
    if url.startswith("data:"):
        return url
    # If it is a signature SVG path string (starts with M followed by coordinates)
    if re.match(r'^[Mm]\s*[\d\.\-]', url.strip()):
        return url
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                content_type = resp.headers.get("content-type", "image/jpeg")
                encoded = base64.b64encode(resp.content).decode("utf-8")
                return f"data:{content_type};base64,{encoded}"
            else:
                log.warning("Failed to fetch image from URL %s, status code: %d", url, resp.status_code)
    except Exception as e:
        log.error("Failed to download image from url %s: %s", url, e)
    return None


# ═════════════════════════════════════════════════════════════════════════════
# Signature image → ReportLab Image flowable
# ═════════════════════════════════════════════════════════════════════════════
def _decode_signature_to_image(signature_raw: str, img_width: float = 150, img_height: float = 60):
    """Decode a signature (SVG path, data-URL, or base64 PNG) into a
    ReportLab Image flowable with a fixed bounding box.

    Returns None if decoding fails.
    """
    try:
        png_bytes: bytes | None = None

        # Case 1: SVG path data  →  rasterise to PNG
        if re.match(r'^[Mm]\s*[\d\.\-]', signature_raw.strip()):
            data_url = _svg_path_to_png_data_url(signature_raw)
            # Strip the data-URL prefix to get raw base64
            _, encoded = data_url.split(",", 1)
            png_bytes = base64.b64decode(encoded)

        # Case 2: data:image/…;base64,…
        elif signature_raw.startswith("data:"):
            _, encoded = signature_raw.split(",", 1)
            png_bytes = base64.b64decode(encoded)

        # Case 3: raw base64 string (no prefix)
        else:
            png_bytes = base64.b64decode(signature_raw)

        if not png_bytes:
            return None

        img_buf = io.BytesIO(png_bytes)
        img_buf.seek(0)
        return Image(
            img_buf,
            width=img_width,
            height=img_height,
            kind="proportional",  # preserveAspectRatio
        )

    except Exception as e:
        log.warning("Failed to decode signature image: %s", e)
        return None


# ═════════════════════════════════════════════════════════════════════════════
# Styled box helpers (diagnosis / advice with accent border)
# ═════════════════════════════════════════════════════════════════════════════
def _accent_box(text: str, style: ParagraphStyle, bg_color, border_color) -> Table:
    """Wrap text in a single-cell table that visually has a left accent
    border and a light background — mimics a CSS border-left + bg block."""
    para = Paragraph(text, style)
    tbl = Table(
        [[para]],
        colWidths=[CONTENT_WIDTH - 4],  # slight inset for the border
    )
    tbl.setStyle(TableStyle([
        ("BACKGROUND",   (0, 0), (-1, -1), bg_color),
        ("LEFTPADDING",  (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING",   (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 8),
        # Left accent border (thick colored line on the left edge)
        ("LINEBEFORE",   (0, 0), (0, -1), 3, border_color),
    ]))
    return tbl


# ═════════════════════════════════════════════════════════════════════════════
# Main PDF generator
# ═════════════════════════════════════════════════════════════════════════════
async def generate_prescription_pdf(rx: dict, clinic: dict | None, doctor: dict | None) -> bytes:
    """Generate a professional A4 prescription PDF using ReportLab platypus.

    Args:
        rx:     Prescription dict (medicines, patient info, signature, etc.)
        clinic: Clinic document (name, address, phone, email, qrCodeUrl)
        doctor: Doctor document (name, specialty, reg_number)

    Returns:
        Raw PDF bytes ready for StreamingResponse.
    """

    styles = _build_styles()
    story: list = []  # list of flowables that build the PDF

    # ── 1. Fetch / resolve images ─────────────────────────────────────────
    signature_raw = rx.get("signature")
    if signature_raw and (signature_raw.startswith("http://") or signature_raw.startswith("https://")):
        converted = await get_base64_from_url(signature_raw)
        if converted:
            signature_raw = converted

    clinic_qr_base64 = clinic.get("qrCodeUrl") or clinic.get("qr_code_url") if clinic else None
    if clinic_qr_base64 and (clinic_qr_base64.startswith("http://") or clinic_qr_base64.startswith("https://")):
        converted = await get_base64_from_url(clinic_qr_base64)
        if converted:
            clinic_qr_base64 = converted

    # ── 2. Extract fields ─────────────────────────────────────────────────
    clinic_name    = clinic.get("name") if clinic else "PrescoPad Clinic"
    clinic_address = clinic.get("address") if clinic else ""
    clinic_phone   = clinic.get("phone") if clinic else ""
    clinic_email   = clinic.get("email") if clinic else ""

    doctor_name      = doctor.get("name") if doctor else "Doctor"
    doctor_specialty = doctor.get("specialty") if doctor else ""
    doctor_reg       = doctor.get("reg_number") or (doctor.get("regNumber") if doctor else "") if doctor else ""

    # Date parsing
    created_at_val = rx.get("created_at")
    if isinstance(created_at_val, str):
        try:
            dt = datetime.fromisoformat(created_at_val)
        except Exception:
            dt = datetime.utcnow()
    elif isinstance(created_at_val, datetime):
        dt = created_at_val
    else:
        dt = datetime.utcnow()
    date_str = dt.strftime("%d %b %Y")

    # Consultation type
    consultation_type = rx.get("consultation_type") or rx.get("consultationType")
    consultation_type_str = ""
    if consultation_type == "new":
        consultation_type_str = "New Consultation"
    elif consultation_type == "follow_up":
        consultation_type_str = "Follow-up"

    patient_name   = rx.get("patient_name") or rx.get("patientName") or ""
    patient_age    = rx.get("patient_age") or rx.get("patientAge") or ""
    patient_gender = rx.get("patient_gender") or rx.get("patientGender") or ""
    patient_phone  = rx.get("patient_phone") or rx.get("patientPhone") or "—"
    rx_id          = rx.get("id") or rx.get("_id") or ""
    pdf_hash       = rx.get("pdf_hash") or rx.get("pdfHash") or ""

    # ══════════════════════════════════════════════════════════════════════
    # BUILD THE STORY  (each section is a discrete flowable)
    # ══════════════════════════════════════════════════════════════════════

    # ── HEADER SECTION ────────────────────────────────────────────────────
    # Clinic name — bold, large, teal, centered
    story.append(Paragraph(clinic_name, styles["clinic_name"]))

    # Doctor name + qualification + reg number
    doctor_line_parts = [f"Dr. {doctor_name}"]
    if doctor_specialty:
        doctor_line_parts.append(doctor_specialty)
    if doctor_reg:
        doctor_line_parts.append(f"Reg: {doctor_reg}")
    story.append(Paragraph(" &nbsp;|&nbsp; ".join(doctor_line_parts), styles["doctor_line"]))

    # Clinic address, phone, email — small muted text
    if clinic_address:
        story.append(Paragraph(clinic_address, styles["clinic_sub"]))
    contact_parts = [p for p in [clinic_phone, clinic_email] if p]
    if contact_parts:
        story.append(Paragraph(" &nbsp;|&nbsp; ".join(contact_parts), styles["clinic_sub"]))

    # Full-width horizontal rule separating header from body
    story.append(Spacer(1, 6))
    story.append(HRFlowable(
        width="100%", thickness=2, color=TEAL_PRIMARY,
        spaceAfter=8, spaceBefore=2,
    ))

    # ── META ROW (Date + Prescription ID) ─────────────────────────────────
    meta_left_text = ""
    if consultation_type_str:
        meta_left_text = f'<font color="#0B6E6E"><b>{consultation_type_str}</b></font>'

    meta_right_text = (
        f'Date: <b>{date_str}</b>'
        f' &nbsp;|&nbsp; ID: <font color="#0B6E6E"><b>{rx_id}</b></font>'
    )
    meta_table = Table(
        [[
            Paragraph(meta_left_text, styles["consult_badge"]),
            Paragraph(meta_right_text, styles["meta_right"]),
        ]],
        colWidths=[CONTENT_WIDTH * 0.4, CONTENT_WIDTH * 0.6],
    )
    meta_table.setStyle(TableStyle([
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING",   (0, 0), (-1, -1), 0),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
        ("TOPPADDING",    (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 6))

    # ── PATIENT INFO SECTION ──────────────────────────────────────────────
    # 3-column layout: Patient Name | Age/Gender | Phone
    # Each cell has a small label on top and the value below
    col_w = CONTENT_WIDTH / 3

    patient_data = [[
        # Column 1 — Patient Name
        [Paragraph("PATIENT", styles["label"]),
         Paragraph(patient_name, styles["value"])],
        # Column 2 — Age / Gender
        [Paragraph("AGE / GENDER", styles["label"]),
         Paragraph(f"{patient_age} yrs / {patient_gender}", styles["value"])],
        # Column 3 — Phone
        [Paragraph("PHONE", styles["label"]),
         Paragraph(patient_phone, styles["value"])],
    ]]

    # Flatten: each cell is a mini-table of two rows (label, value)
    def _cell_stack(items):
        """Stack Paragraph items vertically inside a cell."""
        t = Table([[p] for p in items], colWidths=[col_w - 12])
        t.setStyle(TableStyle([
            ("LEFTPADDING",   (0, 0), (-1, -1), 0),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
            ("TOPPADDING",    (0, 0), (-1, -1), 1),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
        ]))
        return t

    patient_row = [[_cell_stack(cell) for cell in patient_data[0]]]
    patient_table = Table(patient_row, colWidths=[col_w, col_w, col_w])
    patient_table.setStyle(TableStyle([
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING",   (0, 0), (-1, -1), 6),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 6),
        ("TOPPADDING",    (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        # Top and bottom border
        ("LINEABOVE",  (0, 0), (-1, 0),  0.5, GRID_LINE),
        ("LINEBELOW",  (0, -1), (-1, -1), 0.5, GRID_LINE),
    ]))
    story.append(patient_table)
    story.append(Spacer(1, 6))

    # ── SYMPTOMS SECTION ──────────────────────────────────────────────────
    symptoms = rx.get("symptoms") or []
    if symptoms:
        story.append(Paragraph("Symptoms", styles["section_title"]))
        story.append(Paragraph(", ".join(symptoms), styles["body"]))
        story.append(Spacer(1, 6))

    # ── DIAGNOSIS SECTION ─────────────────────────────────────────────────
    diagnosis = rx.get("diagnosis")
    if diagnosis:
        story.append(Paragraph("Diagnosis", styles["section_title"]))
        story.append(_accent_box(diagnosis, styles["diagnosis_text"], DIAG_BG, DIAG_BORDER))
        story.append(Spacer(1, 6))

    # ── MEDICINES / Rx SECTION ────────────────────────────────────────────
    medicines = rx.get("medicines") or []
    if medicines:
        # "℞" symbol as section header
        story.append(Paragraph("℞ &nbsp;Medicines", styles["rx_symbol"]))

        # Build table data — header row + medicine rows
        header_row = ["#", "Medicine", "Dosage", "Duration", "Instructions"]
        table_data = [header_row]

        for idx, m in enumerate(medicines):
            medicine_name = m.get("medicine_name") or m.get("medicineName") or ""
            med_type      = m.get("type") or ""
            frequency     = m.get("frequency") or ""
            duration      = m.get("duration") or ""
            timing        = m.get("timing") or ""
            notes         = m.get("notes") or ""
            timing_instruction = f"{timing} ({notes})" if (timing and notes) else (timing or notes)

            med_display = f"{medicine_name} ({med_type})" if med_type else medicine_name
            table_data.append([
                str(idx + 1),
                Paragraph(f"<b>{med_display}</b>", styles["body_bold"]),
                frequency,
                duration,
                timing_instruction,
            ])

        # Column widths: # | Medicine | Dosage | Duration | Instructions
        med_col_widths = [
            28,                          # #
            CONTENT_WIDTH * 0.32,        # Medicine
            CONTENT_WIDTH * 0.15,        # Dosage
            CONTENT_WIDTH * 0.15,        # Duration
            CONTENT_WIDTH - 28 - CONTENT_WIDTH * 0.62,  # Instructions (remainder)
        ]

        med_table = Table(table_data, colWidths=med_col_widths, repeatRows=1)

        # Build alternating row styles
        med_style_cmds = [
            # Header row — dark teal background, white bold text
            ("BACKGROUND",    (0, 0), (-1, 0), TEAL_PRIMARY),
            ("TEXTCOLOR",     (0, 0), (-1, 0), WHITE),
            ("FONTNAME",      (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE",      (0, 0), (-1, 0), 9),

            # All cells — padding, alignment, font
            ("FONTNAME",      (0, 1), (-1, -1), "Helvetica"),
            ("FONTSIZE",      (0, 1), (-1, -1), 10),
            ("TEXTCOLOR",     (0, 1), (-1, -1), TEXT_PRIMARY),
            ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING",   (0, 0), (-1, -1), 6),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 6),
            ("TOPPADDING",    (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),

            # Grid lines
            ("GRID",          (0, 0), (-1, -1), 0.5, GRID_LINE),

            # # column — center aligned
            ("ALIGN",         (0, 0), (0, -1), "CENTER"),
        ]

        # Alternating row shading for data rows
        for row_idx in range(1, len(table_data)):
            if row_idx % 2 == 0:
                med_style_cmds.append(
                    ("BACKGROUND", (0, row_idx), (-1, row_idx), TEAL_LIGHT)
                )

        med_table.setStyle(TableStyle(med_style_cmds))
        story.append(med_table)
        story.append(Spacer(1, 8))

    # ── LAB TESTS SECTION ─────────────────────────────────────────────────
    lab_tests = rx.get("lab_tests") or rx.get("labTests") or []
    if lab_tests:
        story.append(Paragraph("Lab Tests / Investigations", styles["section_title"]))
        for t in lab_tests:
            test_name = t.get("test_name") or t.get("testName") or ""
            notes = t.get("notes") or ""
            bullet_text = f"• &nbsp;<b>{test_name}</b>"
            if notes:
                bullet_text += f' — <font color="#555555">{notes}</font>'
            story.append(Paragraph(bullet_text, styles["lab_item"]))
            story.append(Spacer(1, 2))
        story.append(Spacer(1, 6))

    # ── ADVICE SECTION ────────────────────────────────────────────────────
    advice = rx.get("advice")
    if advice:
        story.append(Paragraph("Special Instructions / Doctor's Notes", styles["section_title"]))
        story.append(_accent_box(advice, styles["advice_text"], ADVICE_BG, ADVICE_BORDER))
        story.append(Spacer(1, 6))

    # ── FOLLOW-UP DATE ────────────────────────────────────────────────────
    follow_up_date = rx.get("follow_up_date") or rx.get("followUpDate")
    if follow_up_date:
        try:
            fud = datetime.fromisoformat(follow_up_date.replace("Z", "+00:00"))
            fud_str = fud.strftime("%d %b %Y")
        except Exception:
            fud_str = follow_up_date
        story.append(Paragraph(f"Follow-up: {fud_str}", styles["followup"]))
        story.append(Spacer(1, 6))

    # ── SIGNATURE SECTION (bottom of page) ────────────────────────────────
    # Wrapped in KeepTogether so it never splits across pages
    sig_elements: list = []

    # Horizontal rule above signature area
    sig_elements.append(Spacer(1, 16))
    sig_elements.append(HRFlowable(
        width="100%", thickness=0.5, color=GRID_LINE,
        spaceAfter=8, spaceBefore=0,
    ))

    # Build the QR code flowable (left side) if available
    qr_flowable = None
    if clinic_qr_base64:
        try:
            if clinic_qr_base64.startswith("data:"):
                _, qr_encoded = clinic_qr_base64.split(",", 1)
                qr_bytes = base64.b64decode(qr_encoded)
            else:
                qr_bytes = base64.b64decode(clinic_qr_base64)
            qr_buf = io.BytesIO(qr_bytes)
            qr_buf.seek(0)
            qr_flowable = Image(qr_buf, width=60, height=60, kind="proportional")
        except Exception as e:
            log.warning("Failed to decode QR code image: %s", e)

    # Build the signature image flowable (right side)
    sig_img = None
    if signature_raw:
        sig_img = _decode_signature_to_image(signature_raw, img_width=150, img_height=60)

    # Right-side content: signature image + doctor name + designation
    right_items = []
    if sig_img:
        # Wrap the image in a right-aligned table cell
        img_table = Table([[sig_img]], colWidths=[160])
        img_table.setStyle(TableStyle([
            ("ALIGN",         (0, 0), (-1, -1), "RIGHT"),
            ("LEFTPADDING",   (0, 0), (-1, -1), 0),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
            ("TOPPADDING",    (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        right_items.append(img_table)

    right_items.append(Paragraph(f"Dr. {doctor_name}", styles["sig_name"]))
    if doctor_specialty:
        right_items.append(Paragraph(doctor_specialty, styles["sig_detail"]))
    if doctor_reg:
        right_items.append(Paragraph(f"Reg. No: {doctor_reg}", styles["sig_detail"]))

    # Stack right items vertically
    right_stack = Table([[item] for item in right_items], colWidths=[CONTENT_WIDTH * 0.45])
    right_stack.setStyle(TableStyle([
        ("ALIGN",         (0, 0), (-1, -1), "RIGHT"),
        ("LEFTPADDING",   (0, 0), (-1, -1), 0),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
        ("TOPPADDING",    (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
    ]))

    # Left-side content: QR code (if available) or empty
    left_items = []
    if qr_flowable:
        left_items.append(qr_flowable)
        left_items.append(Spacer(1, 2))
        left_items.append(Paragraph(
            '<font color="#9ca3af" size="7">Scan for Payment / Details</font>',
            styles["body"],
        ))

    if left_items:
        left_stack = Table([[item] for item in left_items], colWidths=[CONTENT_WIDTH * 0.35])
        left_stack.setStyle(TableStyle([
            ("ALIGN",         (0, 0), (-1, -1), "LEFT"),
            ("VALIGN",        (0, 0), (-1, -1), "BOTTOM"),
            ("LEFTPADDING",   (0, 0), (-1, -1), 0),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
            ("TOPPADDING",    (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
        ]))
    else:
        left_stack = Paragraph("", styles["body"])  # empty placeholder

    # Combine left and right in a 2-column layout table
    sig_layout = Table(
        [[left_stack, right_stack]],
        colWidths=[CONTENT_WIDTH * 0.5, CONTENT_WIDTH * 0.5],
    )
    sig_layout.setStyle(TableStyle([
        ("VALIGN",        (0, 0), (-1, -1), "BOTTOM"),
        ("LEFTPADDING",   (0, 0), (-1, -1), 0),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
        ("TOPPADDING",    (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    sig_elements.append(sig_layout)

    # Keep signature block together — never split across pages
    story.append(KeepTogether(sig_elements))

    # ── FOOTER SECTION ────────────────────────────────────────────────────
    story.append(Spacer(1, 12))
    story.append(HRFlowable(
        width="100%", thickness=0.5, color=GRID_LINE,
        spaceAfter=6, spaceBefore=0,
    ))
    story.append(Paragraph("Generated by PrescoPad — Digital Prescription System", styles["footer"]))
    if pdf_hash:
        story.append(Paragraph(f"Verification Hash: {pdf_hash}", styles["hash"]))

    # ══════════════════════════════════════════════════════════════════════
    # BUILD PDF
    # ══════════════════════════════════════════════════════════════════════
    pdf_buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        pdf_buffer,
        pagesize=A4,
        topMargin=MARGIN_TOP,
        bottomMargin=MARGIN_BOTTOM,
        leftMargin=MARGIN_LEFT,
        rightMargin=MARGIN_RIGHT,
        title=f"Prescription - {patient_name}",
        author=f"Dr. {doctor_name}",
        subject="Medical Prescription",
        creator="PrescoPad",
    )

    try:
        doc.build(story)
    except Exception as e:
        import traceback
        log.error("ReportLab doc.build raised: %s\n%s", e, traceback.format_exc())
        raise RuntimeError(f"ReportLab failed to build PDF: {e}") from e

    result = pdf_buffer.getvalue()
    if not result or len(result) < 100:
        log.error("ReportLab produced empty/tiny PDF (%d bytes)", len(result) if result else 0)
        raise RuntimeError("ReportLab produced an empty PDF")

    log.info("PDF generated successfully: %d bytes", len(result))
    return result
