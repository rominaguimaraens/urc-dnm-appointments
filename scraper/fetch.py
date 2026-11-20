"""Reads DNM's public Residencia Legal calendar for every office and saves
the next available appointments to data/appointments.json.

Usage:
    python scraper/fetch.py
"""

import html
import json
import os
import re
import ssl
import sys
import tempfile
import time
import unicodedata
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import certifi
import requests
from cryptography import x509
from cryptography.hazmat.primitives.serialization import Encoding
from cryptography.x509.oid import AuthorityInformationAccessOID, ExtensionOID

ROOT = Path(__file__).resolve().parent.parent
CONFIG_FILE = ROOT / "scraper" / "offices.json"
OUTPUT_FILE = ROOT / "data" / "appointments.json"

MONTEVIDEO = timezone(timedelta(hours=-3))
PAUSE_BETWEEN_OFFICES = 2  # seconds, to stay gentle with the server

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0 Safari/537.36"
)

MONTHS = {
    "enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6,
    "julio": 7, "agosto": 8, "septiembre": 9, "setiembre": 9, "octubre": 10,
    "noviembre": 11, "diciembre": 12,
}

# The first three open slots are buttons with the "btn-turno" class.
SLOT_BUTTON = re.compile(r'class="[^"]*\bbtn-turno\b[^"]*"[^>]*>\s*<span[^>]*>([^<]+)</span>', re.I)
SLOT_TEXT = re.compile(r"(\w+)\s+(\d{1,2})\s+de\s+(\w+)\s*-\s*(\d{1,2}):(\d{2})", re.U)


def strip_accents(text: str) -> str:
    text = unicodedata.normalize("NFKD", text)
    return "".join(c for c in text if not unicodedata.combining(c))


# ---------------------------------------------------------------- page reading

def parse_slots(page: str, today: date) -> list:
    """Return the open slots shown on an office page, oldest first.

    The page doesn't show the year, so a date earlier than today is taken to
    be next year (e.g. on 20 Nov, "4 de mayo" means May next year)."""
    slots = []
    for raw in SLOT_BUTTON.findall(page):
        label = " ".join(html.unescape(raw).split())
        m = SLOT_TEXT.search(label)
        if not m:
            continue
        _, day, month_name, hour, minute = m.groups()
        month = MONTHS.get(strip_accents(month_name).lower())
        if not month:
            continue
        year = today.year
        try:
            when = date(year, month, int(day))
            if when < today - timedelta(days=1):
                when = date(year + 1, month, int(day))
        except ValueError:
            continue
        slots.append({
            "date": when.isoformat(),
            "time": f"{int(hour):02d}:{minute}",
            "label": label,
        })
    return slots


def page_is_calendar(page: str) -> bool:
    """True when the page is the booking calendar (not an error page)."""
    text = strip_accents(page).lower()
    return "agendar reserva" in text or "turnos disponibles" in text


# ------------------------------------------------------------------ networking

_bundle_path = None


def _intermediate_bundle(host: str) -> str:
    """Some gub.uy servers don't send their intermediate certificates.
    Browsers download them automatically; this does the same."""
    global _bundle_path
    if _bundle_path:
        return _bundle_path
    cert = x509.load_pem_x509_certificate(ssl.get_server_certificate((host, 443)).encode())
    extra = []
    for _ in range(3):
        try:
            aia = cert.extensions.get_extension_for_oid(ExtensionOID.AUTHORITY_INFORMATION_ACCESS).value
        except x509.ExtensionNotFound:
            break
        urls = [d.access_location.value for d in aia if d.access_method == AuthorityInformationAccessOID.CA_ISSUERS]
        if not urls:
            break
        data = requests.get(urls[0], timeout=20).content
        try:
            issuer = x509.load_der_x509_certificate(data)
        except ValueError:
            issuer = x509.load_pem_x509_certificate(data)
        extra.append(issuer.public_bytes(Encoding.PEM).decode())
        if issuer.issuer == issuer.subject:
            break
        cert = issuer
    fd, path = tempfile.mkstemp(suffix=".pem")
    with os.fdopen(fd, "w") as f:
        f.write(Path(certifi.where()).read_text() + "\n" + "\n".join(extra))
    _bundle_path = path
    return path


def fetch(session: requests.Session, url: str) -> str:
    try:
        r = session.get(url, timeout=30)
    except requests.exceptions.SSLError:
        host = requests.utils.urlparse(url).hostname
        r = session.get(url, timeout=30, verify=_intermediate_bundle(host))
    r.raise_for_status()
    return r.text


# ------------------------------------------------------------------------ main

def office_url(config: dict, office_id: int) -> str:
    return f"{config['base_url']}?e={config['empresa']}&a={config['agenda']}&r={office_id}"


def collect(config: dict, get_page, today: date, pause: float = 0) -> list:
    results = []
    for i, office in enumerate(config["offices"]):
        if i and pause:
            time.sleep(pause)
        url = office_url(config, office["id"])
        entry = {**office, "url": url, "slots": [], "status": "error"}
        try:
            page = get_page(url)
            entry["slots"] = parse_slots(page, today)
            if entry["slots"]:
                entry["status"] = "open"
            elif page_is_calendar(page):
                entry["status"] = "full"
        except Exception as exc:
            entry["error"] = str(exc)[:200]
        print(f"{office['city']:<20} {entry['status']:<6} " + ", ".join(s["date"] for s in entry["slots"]))
        results.append(entry)
    return results


def main() -> int:
    config = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT, "Accept-Language": "es-UY,es;q=0.9"})

    now = datetime.now(MONTEVIDEO)
    offices = collect(config, lambda url: fetch(session, url), now.date(), PAUSE_BETWEEN_OFFICES)

    if all(o["status"] == "error" for o in offices) and OUTPUT_FILE.exists():
        print("Every office failed; keeping the previous data.")
        return 1

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_FILE.write_text(json.dumps({
        "checked_at": now.isoformat(timespec="minutes"),
        "offices": offices,
    }, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
