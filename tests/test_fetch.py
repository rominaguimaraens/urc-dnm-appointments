import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scraper"))

import fetch  # noqa: E402

# Trimmed from the real Montevideo page, Nov 2026.
REAL_PAGE = """
<div id="form:turnosDisponibles" class="ui-outputpanel ui-widget turnos-block">
<span class="label control-label">Turnos disponibles</span>
<div id="primeros-turnos" class="d-grid gap-2 mb-3"><button id="form:j_idt72:0:j_idt73" name="form:j_idt72:0:j_idt73" class="ui-button ui-widget ui-state-default ui-corner-all ui-button-text-only btn-lg btn-turno turno-seleccionado" onclick="return false;" type="submit"><span class="ui-button-text ui-c">Mi&eacute;rcoles 25 de noviembre - 13:15 h</span></button><script>x</script><button id="form:j_idt72:1:j_idt73" class="ui-button btn-lg btn-turno" type="submit"><span class="ui-button-text ui-c">Viernes 27 de noviembre - 13:15 h</span></button><button id="form:j_idt72:2:j_idt73" class="ui-button btn-lg btn-turno" type="submit"><span class="ui-button-text ui-c">Martes 4 de mayo - 9:00 h</span></button>
</div>
<span>Agendar reserva</span>
<span style="display:none">En la oficina seleccionada no hay cupos disponibles</span>
"""

FULL_PAGE = "<span>Agendar reserva</span><span>En la oficina seleccionada no hay cupos disponibles</span>"
ERROR_PAGE = "<h2>Acceso denegado</h2>"

TODAY = date(2026, 11, 20)


def test_reads_three_slots_with_years():
    slots = fetch.parse_slots(REAL_PAGE, TODAY)
    assert [s["date"] for s in slots] == ["2026-11-25", "2026-11-27", "2027-05-04"]
    assert [s["time"] for s in slots] == ["13:15", "13:15", "09:00"]
    assert slots[0]["label"] == "Miércoles 25 de noviembre - 13:15 h"


def test_setiembre_spelling():
    page = '<button class="btn-turno"><span>Lunes 6 de setiembre - 10:00 h</span></button>'
    assert fetch.parse_slots(page, TODAY)[0]["date"] == "2027-09-06"


def _run(pages):
    config = {
        "base_url": "https://example.test/Paso1.xhtml", "empresa": 4, "agenda": 16,
        "offices": [{"id": i, "city": f"City {i}", "department": "X", "address": ""} for i in range(len(pages))],
    }
    lookup = {fetch.office_url(config, i): p for i, p in enumerate(pages)}

    def get_page(url):
        page = lookup[url]
        if isinstance(page, Exception):
            raise page
        return page

    return fetch.collect(config, get_page, TODAY)


def test_status_per_office():
    result = _run([REAL_PAGE, FULL_PAGE, ERROR_PAGE, RuntimeError("timeout")])
    assert [o["status"] for o in result] == ["open", "full", "error", "error"]
    assert result[0]["url"].endswith("?e=4&a=16&r=0")
    assert "timeout" in result[3]["error"]
