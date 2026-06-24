import io
import re
import base64
import logging
import httpx
from xhtml2pdf import pisa
from datetime import datetime

log = logging.getLogger(__name__)


def _svg_path_to_png_data_url(path_data: str, width: int = 300, height: int = 100) -> str:
    """Convert an SVG path `d` attribute into a base64 PNG data URL.

    Uses Pillow's ImageDraw so there are zero native/system-library dependencies
    beyond what Pillow already bundles. Bezier curves are approximated as short
    line segments which is more than adequate for hand-drawn signatures.
    """
    from PIL import Image, ImageDraw

    # High-res render then scale down for antialiased look
    scale = 2
    img = Image.new("RGBA", (width * scale, height * scale), (255, 255, 255, 0))
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
    img = img.resize((width, height), Image.LANCZOS)

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    encoded = base64.b64encode(buf.getvalue()).decode("utf-8")
    return f"data:image/png;base64,{encoded}"


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

async def generate_prescription_pdf(rx: dict, clinic: dict | None, doctor: dict | None) -> bytes:
    # 1. Fetch images in-memory and convert to base64
    signature_base64 = rx.get("signature")
    if signature_base64 and (signature_base64.startswith("http://") or signature_base64.startswith("https://")):
        converted = await get_base64_from_url(signature_base64)
        if converted:
            signature_base64 = converted

    clinic_qr_base64 = clinic.get("qrCodeUrl") or clinic.get("qr_code_url") if clinic else None
    if clinic_qr_base64 and (clinic_qr_base64.startswith("http://") or clinic_qr_base64.startswith("https://")):
        converted = await get_base64_from_url(clinic_qr_base64)
        if converted:
            clinic_qr_base64 = converted

    # 2. Extract and format fields
    clinic_name = clinic.get("name") if clinic else "PrescoPad Clinic"
    clinic_address = clinic.get("address") if clinic else ""
    clinic_phone = clinic.get("phone") if clinic else ""
    clinic_email = clinic.get("email") if clinic else ""
    
    doctor_name = doctor.get("name") if doctor else "Doctor"
    doctor_specialty = doctor.get("specialty") if doctor else ""
    doctor_reg = doctor.get("reg_number") or doctor.get("regNumber") if doctor else ""

    created_at_val = rx.get("created_at")
    if isinstance(created_at_val, str):
        try:
            # Parse ISO format string from MongoDB serialization
            dt = datetime.fromisoformat(created_at_val)
        except Exception:
            dt = datetime.utcnow()
    elif isinstance(created_at_val, datetime):
        dt = created_at_val
    else:
        dt = datetime.utcnow()

    # Formatted date: e.g. "21 Jun 2026"
    date_str = dt.strftime("%d %b %Y")

    # Format Consultation Type
    consultation_type = rx.get("consultation_type") or rx.get("consultationType")
    consultation_type_str = ""
    if consultation_type == "new":
        consultation_type_str = "New Consultation"
    elif consultation_type == "follow_up":
        consultation_type_str = "Follow-up"

    # Build medicine rows
    medicines = rx.get("medicines") or []
    medicine_rows = ""
    for idx, m in enumerate(medicines):
        medicine_name = m.get("medicine_name") or m.get("medicineName") or ""
        med_type = m.get("type") or ""
        frequency = m.get("frequency") or ""
        duration = m.get("duration") or ""
        timing = m.get("timing") or ""
        notes = m.get("notes") or ""
        timing_instruction = f"{timing} ({notes})" if (timing and notes) else (timing or notes)

        med_display = f"{medicine_name} ({med_type})" if med_type else medicine_name
        medicine_rows += f"""
        <tr>
            <td style="padding:5px 8px;border-bottom:1px solid #e5e7eb;color:#374151;font-size:12px;">{idx + 1}</td>
            <td style="padding:5px 8px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#111827;font-weight:bold;">{med_display}</td>
            <td style="padding:5px 8px;border-bottom:1px solid #e5e7eb;color:#374151;font-size:12px;">{frequency}</td>
            <td style="padding:5px 8px;border-bottom:1px solid #e5e7eb;color:#374151;font-size:12px;">{duration}</td>
            <td style="padding:5px 8px;border-bottom:1px solid #e5e7eb;color:#374151;font-size:12px;">{timing_instruction}</td>
        </tr>"""

    # Build lab tests
    lab_tests = rx.get("lab_tests") or rx.get("labTests") or []
    lab_tests_html = ""
    if lab_tests:
        list_items = ""
        for t in lab_tests:
            test_name = t.get("test_name") or t.get("testName") or ""
            notes = t.get("notes") or ""
            notes_str = f" — {notes}" if notes else ""
            list_items += f'<li style="margin-bottom:3px;color:#374151;font-size:12px;">{test_name}{notes_str}</li>'

        lab_tests_html = f"""
        <div class="section-title">Lab Tests / Investigations</div>
        <ul style="padding-left:18px;">{list_items}</ul>
        """

    # Build diagnosis, symptoms, advice, follow-up
    symptoms = rx.get("symptoms") or []
    symptoms_html = ""
    if symptoms:
        symptoms_html = f"""
        <div class="section-title">Symptoms</div>
        <div class="plain-text">{', '.join(symptoms)}</div>
        """

    diagnosis = rx.get("diagnosis")
    diagnosis_html = ""
    if diagnosis:
        diagnosis_html = f"""
        <div class="section-title">Diagnosis</div>
        <div class="diagnosis-text">{diagnosis}</div>
        """

    advice = rx.get("advice")
    advice_html = ""
    if advice:
        advice_html = f"""
        <div class="section-title">Advice</div>
        <div class="advice-text">{advice}</div>
        """

    follow_up_date = rx.get("follow_up_date") or rx.get("followUpDate")
    follow_up_html = ""
    if follow_up_date:
        try:
            fud = datetime.fromisoformat(follow_up_date.replace("Z", "+00:00"))
            fud_str = fud.strftime("%d %b %Y")
        except Exception:
            fud_str = follow_up_date
        follow_up_html = f"""
        <div class="followup-text">Follow-up: {fud_str}</div>
        """

    # QR Code markup
    qr_code_html = ""
    if clinic_qr_base64:
        qr_code_html = f"""
        <img src="{clinic_qr_base64}" style="height:60px;width:60px;margin-bottom:2px;" />
        <div style="font-size:9px;color:#9ca3af;">Scan for Payment / Details</div>
        """

    # Signature markup
    signature_html = ""
    if signature_base64:
        # Check if it's an SVG path data string (e.g. "M10 20 L30 40...")
        if re.match(r'^[Mm]\s*[\d\.\-]', signature_base64.strip()):
            # xhtml2pdf does NOT reliably render inline SVG.
            # Convert the SVG path to a rasterized PNG via reportlab and embed as base64 img.
            try:
                sig_img_data_url = _svg_path_to_png_data_url(signature_base64)
                signature_html = f'<img src="{sig_img_data_url}" style="max-height:56px;max-width:160px;display:block;margin-left:auto;margin-bottom:4px;" />'
            except Exception as e:
                log.warning("Failed to rasterize SVG signature, skipping: %s", e)
                signature_html = ""
        else:
            signature_html = f'<img src="{signature_base64}" style="max-height:56px;max-width:160px;display:block;margin-left:auto;margin-bottom:4px;" />'

    reg_num_html = f'<div class="sig-reg">Reg. No: {doctor_reg}</div>' if doctor_reg else ""

    doctor_line_parts = [f"Dr. {doctor_name}"]
    if doctor_specialty:
        doctor_line_parts.append(doctor_specialty)
    if doctor_reg:
        doctor_line_parts.append(f"Reg: {doctor_reg}")
    doctor_line = " | ".join(doctor_line_parts)

    clinic_sub_html = ""
    if clinic_address:
        clinic_sub_html += f'<div class="clinic-sub">{clinic_address}</div>'
    contact_parts = [p for p in [clinic_phone, clinic_email] if p]
    if contact_parts:
        clinic_sub_html += f'<div class="clinic-sub">{" | ".join(contact_parts)}</div>'

    patient_name = rx.get("patient_name") or rx.get("patientName") or ""
    patient_age = rx.get("patient_age") or rx.get("patientAge") or ""
    patient_gender = rx.get("patient_gender") or rx.get("patientGender") or ""
    patient_phone = rx.get("patient_phone") or rx.get("patientPhone") or "—"
    rx_id = rx.get("id") or rx.get("_id") or ""

    html_content = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * {{ margin: 0; padding: 0; box-sizing: border-box; }}
    body {{ font-family: Helvetica, Arial, sans-serif; color: #111827; padding: 32px 36px; background: #fff; font-size: 12px; }}
    .clinic-name {{ font-size: 20px; font-weight: 700; color: #1d6fa4; text-align: center; }}
    .clinic-sub {{ font-size: 11px; color: #6b7280; margin-top: 3px; text-align: center; }}
    .doctor-line {{ font-size: 12px; font-weight: 700; color: #374151; margin-top: 4px; text-align: center; }}
    .divider {{ border: none; border-top: 2px solid #1d6fa4; margin: 10px 0; }}
    .meta-row {{ text-align: right; font-size: 11px; color: #6b7280; margin-bottom: 10px; }}
    .section-title {{ font-size: 11px; font-weight: 700; color: #1d6fa4; text-transform: uppercase; letter-spacing: 0.5px; margin: 12px 0 5px; }}
    table.patient-table {{ width: 100%; border-collapse: collapse; border-top: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; margin-bottom: 14px; }}
    .p-label {{ font-size: 9px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.6px; padding-bottom: 2px; }}
    .p-value {{ font-size: 13px; font-weight: 700; color: #111827; }}
    .plain-text {{ font-size: 12px; color: #374151; line-height: 1.5; margin-bottom: 2px; }}
    .diagnosis-text {{ font-size: 12px; color: #374151; line-height: 1.5; padding: 6px 10px; background: #f0f9ff; border-left: 3px solid #1d6fa4; margin-bottom: 2px; }}
    .advice-text {{ font-size: 12px; color: #374151; line-height: 1.5; padding: 6px 10px; background: #fffbeb; border-left: 3px solid #d97706; margin-bottom: 2px; }}
    .followup-text {{ font-size: 12px; color: #dc2626; font-weight: 600; margin-top: 10px; }}
    table.med-table {{ width: 100%; border-collapse: collapse; margin-bottom: 2px; }}
    th {{ background: #1d6fa4; color: #fff; padding: 7px 8px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; font-weight: 700; }}
    .sig-name {{ font-size: 12px; font-weight: 700; color: #111827; }}
    .sig-reg {{ font-size: 10px; color: #6b7280; margin-top: 1px; }}
    .footer {{ text-align: center; margin-top: 24px; padding-top: 8px; border-top: 1px solid #e5e7eb; font-size: 9px; color: #9ca3af; }}
    .hash {{ font-family: monospace; font-size: 8px; color: #d1d5db; word-break: break-all; margin-top: 2px; }}
  </style>
</head>
<body>

  <div class="clinic-name">{clinic_name}</div>
  {clinic_sub_html}
  <div class="doctor-line">{doctor_line}</div>
  <hr class="divider" />

  <div class="meta-row">
    Date: <strong>{date_str}</strong> &nbsp;|&nbsp; ID: <strong style="color:#1d6fa4;">{rx_id}</strong>
  </div>

  <table class="patient-table">
    <tr>
      <td style="width:34%;padding:8px 12px 8px 0;vertical-align:top;">
        <div class="p-label">Patient</div>
        <div class="p-value">{patient_name}</div>
      </td>
      <td style="width:33%;padding:8px 12px;vertical-align:top;">
        <div class="p-label">Age/Gender</div>
        <div class="p-value">{patient_age} yrs / {patient_gender}</div>
      </td>
      <td style="width:33%;padding:8px 0 8px 12px;vertical-align:top;">
        <div class="p-label">Phone</div>
        <div class="p-value">{patient_phone}</div>
      </td>
    </tr>
  </table>

  {symptoms_html}
  {diagnosis_html}

  {f'''
  <div class="section-title">Medicines</div>
  <table class="med-table">
    <thead>
      <tr>
        <th style="width:28px;">#</th>
        <th>Medicine</th>
        <th>Dosage</th>
        <th>Duration</th>
        <th>Instructions</th>
      </tr>
    </thead>
    <tbody>{medicine_rows}</tbody>
  </table>
  ''' if medicines else ''}

  {lab_tests_html}
  {advice_html}
  {follow_up_html}

  <table style="width:100%;margin-top:32px;border:none;border-collapse:collapse;">
    <tr>
      <td style="vertical-align:bottom;text-align:left;">
        {qr_code_html}
      </td>
      <td style="vertical-align:bottom;text-align:right;">
        {signature_html}
        <div style="border-top:1px solid #374151;display:inline-block;min-width:160px;padding-top:4px;text-align:right;">
          <div class="sig-name">Dr. {doctor_name}</div>
          {reg_num_html}
        </div>
      </td>
    </tr>
  </table>

  <div class="footer">
    <div>Generated by PrescoPad - Digital Prescription System</div>
    {f'<div class="hash">Verification Hash: {rx.get("pdf_hash") or rx.get("pdfHash")}</div>' if (rx.get("pdf_hash") or rx.get("pdfHash")) else ''}
  </div>

</body>
</html>"""

    pdf_buffer = io.BytesIO()
    try:
        pisa_status = pisa.CreatePDF(html_content, dest=pdf_buffer)
    except Exception as e:
        import traceback
        log.error("xhtml2pdf.CreatePDF raised: %s\n%s", e, traceback.format_exc())
        raise RuntimeError(f"xhtml2pdf failed: {e}") from e

    if pisa_status.err:
        log.error("xhtml2pdf compilation errors: %s", pisa_status.err)
        raise RuntimeError("xhtml2pdf failed to compile prescription HTML")

    result = pdf_buffer.getvalue()
    if not result or len(result) < 100:
        log.error("xhtml2pdf produced empty/tiny PDF (%d bytes)", len(result) if result else 0)
        raise RuntimeError("xhtml2pdf produced an empty PDF")

    log.info("PDF generated successfully: %d bytes", len(result))
    return result
