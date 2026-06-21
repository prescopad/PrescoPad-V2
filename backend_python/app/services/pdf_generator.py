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
        timing_instruction = f"{timing} - {notes}" if (timing and notes) else (timing or notes)

        medicine_rows += f"""
        <tr>
            <td style="padding:6px 8px;border-bottom:1px solid #eee;color:#334155;">{idx + 1}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #eee;">
                <strong style="color:#0F172A;">{medicine_name}</strong>
                <span style="color:#64748B;font-size:11px;"> ({med_type})</span>
            </td>
            <td style="padding:6px 8px;border-bottom:1px solid #eee;color:#334155;">{frequency}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #eee;color:#334155;">{duration}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #eee;color:#64748B;font-size:11px;">{timing_instruction}</td>
        </tr>"""

    # Build lab tests
    lab_tests = rx.get("lab_tests") or rx.get("labTests") or []
    lab_tests_html = ""
    if lab_tests:
        list_items = ""
        for t in lab_tests:
            test_name = t.get("test_name") or t.get("testName") or ""
            notes = t.get("notes") or ""
            notes_str = f" - <em>{notes}</em>" if notes else ""
            list_items += f'<li style="margin-bottom:4px;color:#334155;">{test_name}{notes_str}</li>'
        
        lab_tests_html = f"""
        <div class="section-title">Lab Tests / Investigations</div>
        <ul style="padding-left:20px;font-size:12px;">{list_items}</ul>
        """

    # Build diagnosis, symptoms, advice, follow-up
    symptoms = rx.get("symptoms") or []
    symptoms_html = ""
    if symptoms:
        symptoms_html = f"""
        <div class="section-title">Symptoms</div>
        <div style="font-size:12px;color:#334155;margin-bottom:8px;line-height:18px;">{', '.join(symptoms)}</div>
        """

    diagnosis = rx.get("diagnosis")
    diagnosis_html = ""
    if diagnosis:
        diagnosis_html = f"""
        <div class="section-title">Diagnosis</div>
        <div class="diagnosis-box">{diagnosis}</div>
        """

    advice = rx.get("advice")
    advice_html = ""
    if advice:
        advice_html = f"""
        <div class="section-title">Advice</div>
        <div class="advice-box">{advice}</div>
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
        <div class="follow-up">Follow-up: {fud_str}</div>
        """

    # QR Code markup
    qr_code_html = ""
    if clinic_qr_base64:
        qr_code_html = f"""
        <img src="{clinic_qr_base64}" style="height:80px;width:80px;margin-bottom:4px;" />
        <div style="font-size:9px;color:#64748B;">Scan for Payment / Details</div>
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
                signature_html = f'<img src="{sig_img_data_url}" style="height:50px;margin-bottom:4px;" />'
            except Exception as e:
                log.warning("Failed to rasterize SVG signature, skipping: %s", e)
                signature_html = ""
        else:
            signature_html = f'<img src="{signature_base64}" class="signature-img" />'

    reg_num_html = f'<div style="font-size:10px;color:#64748B;">Reg. No: {doctor_reg}</div>' if doctor_reg else ""
    clinic_contact_info = " | ".join(filter(None, [clinic_phone, clinic_email]))
    clinic_contact_html = f'<div class="clinic-info">{clinic_contact_info}</div>' if clinic_contact_info else ""

    # Generate HTML string (uses tables instead of flex for exact PDF formatting)
    html_content = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * {{ margin: 0; padding: 0; box-sizing: border-box; }}
    body {{ font-family: Helvetica, Arial, sans-serif; color: #0F172A; padding: 24px; background: #fff; }}
    .header {{ text-align: center; border-bottom: 3px solid #0077B6; padding-bottom: 16px; margin-bottom: 16px; }}
    .clinic-name {{ font-size: 22px; font-weight: 700; color: #0077B6; letter-spacing: 0.5px; }}
    .clinic-info {{ font-size: 11px; color: #64748B; margin-top: 4px; }}
    .doctor-info {{ font-size: 12px; color: #334155; margin-top: 6px; }}
    .patient-section-table {{ width: 100%; margin: 12px 0; padding: 10px; background: #F8FAFC; border-radius: 6px; border: none; }}
    .patient-label {{ color: #64748B; font-size: 10px; text-transform: uppercase; margin-bottom: 2px; }}
    .patient-value {{ color: #0F172A; font-weight: 600; font-size: 12px; }}
    .section-title {{ font-size: 13px; font-weight: 700; color: #0077B6; margin: 14px 0 8px; text-transform: uppercase; letter-spacing: 0.5px; }}
    table.med-table {{ width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px; }}
    th.med-th {{ background: #0077B6; color: #fff; padding: 8px; text-align: left; font-size: 11px; text-transform: uppercase; }}
    .diagnosis-box {{ background: #F0F9FF; border-left: 3px solid #0077B6; padding: 10px; margin: 8px 0; border-radius: 0 6px 6px 0; font-size: 12px; }}
    .advice-box {{ background: #FEF3C7; border-left: 3px solid #D97706; padding: 10px; margin: 8px 0; border-radius: 0 6px 6px 0; font-size: 12px; }}
    .follow-up {{ font-size: 12px; color: #DC2626; font-weight: 600; margin-top: 8px; }}
    .signature-img {{ max-height: 50px; margin-bottom: 4px; }}
    .footer {{ text-align: center; margin-top: 20px; padding-top: 10px; border-top: 1px solid #E2E8F0; font-size: 9px; color: #94A3B8; }}
    .hash {{ font-family: monospace; font-size: 8px; color: #94A3B8; word-break: break-all; }}
  </style>
</head>
<body>
  <div class="header">
    <div class="clinic-name">{clinic_name}</div>
    {f'<div class="clinic-info">{clinic_address}</div>' if clinic_address else ''}
    {clinic_contact_html}
    <div class="doctor-info">
      <strong>Dr. {doctor_name}</strong>{f' | {doctor_specialty}' if doctor_specialty else ''}{f' | Reg: {doctor_reg}' if doctor_reg else ''}
    </div>
  </div>

  <table style="width: 100%; margin-bottom: 8px; border: none;">
    <tr>
      <td style="font-size: 12px; color: #0077B6; font-weight: 700; text-transform: uppercase; vertical-align: middle;">
        {consultation_type_str}
      </td>
      <td style="font-size: 12px; color: #64748B; text-align: right; vertical-align: middle;">
        Date: <strong style="color: #0F172A;">{date_str}</strong> | ID: <strong style="color: #0077B6;">{rx.get('id') or rx.get('_id')}</strong>
      </td>
    </tr>
  </table>

  <table class="patient-section-table">
    <tr>
      <td style="width: 34%; vertical-align: top;">
        <div class="patient-label">Patient</div>
        <div class="patient-value">{rx.get('patient_name') or rx.get('patientName')}</div>
      </td>
      <td style="width: 33%; vertical-align: top;">
        <div class="patient-label">Age/Gender</div>
        <div class="patient-value">{rx.get('patient_age') or rx.get('patientAge')} yrs / {rx.get('patient_gender') or rx.get('patientGender')}</div>
      </td>
      <td style="width: 33%; vertical-align: top;">
        <div class="patient-label">Phone</div>
        <div class="patient-value">{rx.get('patient_phone') or rx.get('patientPhone') or 'N/A'}</div>
      </td>
    </tr>
  </table>

  {symptoms_html}
  {diagnosis_html}
  {lab_tests_html}

  {f'''
  <div class="section-title">Medicines</div>
  <table class="med-table">
    <thead>
      <tr>
        <th class="med-th" style="width:30px;">#</th>
        <th class="med-th">Medicine</th>
        <th class="med-th">Dosage</th>
        <th class="med-th">Duration</th>
        <th class="med-th">Instructions</th>
      </tr>
    </thead>
    <tbody>{medicine_rows}</tbody>
  </table>
  ''' if medicines else ''}

  {advice_html}
  {follow_up_html}

  <table style="width: 100%; margin-top: 30px; border: none;">
    <tr>
      <td style="width: 50%; text-align: left; vertical-align: bottom;">
        {qr_code_html}
      </td>
      <td style="width: 50%; text-align: right; vertical-align: bottom;">
        {signature_html}
        <div style="border-top: 1px solid #334155; width: 200px; margin-left: auto; padding-top: 4px; text-align: right;">
          <div style="font-size: 12px; font-weight: 600;">Dr. {doctor_name}</div>
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
