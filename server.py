#!/usr/bin/env python3
"""Lokaler Server für das Romberg-Assessment.

Liefert die Weboberfläche aus und speichert die Formulareingaben in einer
SQLite-Datenbank (Standard: daten/romberg.db). Nur Python-Standardbibliothek.

Start:  python server.py            -> http://127.0.0.1:8765
        python server.py --port 9000 --db pfad/zur/datei.db
"""
import argparse
import csv
import io
import json
import sqlite3
import webbrowser
from datetime import datetime
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

BASIS = Path(__file__).resolve().parent
SCHEMA_VERSION = 2

BEDINGUNGEN = {
    "ro_ao": ("romberg", "offen"),
    "ro_ag": ("romberg", "geschlossen"),
    "sr_ao": ("tandem", "offen"),
    "sr_ag": ("tandem", "geschlossen"),
}

SCHEMA = """
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS patient (
    id            INTEGER PRIMARY KEY,
    patient_ref   TEXT NOT NULL UNIQUE,      -- Name oder (empfohlen) Pseudonym-ID
    geburtsdatum  TEXT,                      -- ISO-Datum JJJJ-MM-TT
    geschlecht    TEXT,
    erstellt_am   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS untersuchung (
    id                    INTEGER PRIMARY KEY,
    patient_id            INTEGER NOT NULL REFERENCES patient(id) ON DELETE CASCADE,
    datum                 TEXT NOT NULL,
    untersucher           TEXT,
    station               TEXT,
    messzeitpunkt         TEXT,              -- Aufnahme / Verlauf / Entlassung
    diagnose              TEXT,
    diagnose_gruppe       TEXT,
    diagnose_frei         TEXT,
    icd                   TEXT,
    seite                 TEXT,
    ereignisdatum         TEXT,
    nebendiagnose         TEXT,
    untergrund            TEXT,
    schuhwerk             TEXT,
    maxdauer_s            INTEGER,
    sicherung             TEXT,
    durchfuehrbar         INTEGER,           -- 1 = ja, 0 = nein
    abbruchgrund          TEXT,
    einschaetzung         TEXT,              -- klinische Einschätzung
    auswertung_vorschlag  TEXT,              -- automatischer Vorschlag
    auswertung_befunde    TEXT,              -- JSON-Liste der Befundtexte
    symptome              TEXT,
    bemerkungen           TEXT,
    erstellt_am           TEXT NOT NULL,
    geaendert_am          TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messung (
    id               INTEGER PRIMARY KEY,
    untersuchung_id  INTEGER NOT NULL REFERENCES untersuchung(id) ON DELETE CASCADE,
    bedingung        TEXT NOT NULL,          -- ro_ao, ro_ag, sr_ao, sr_ag
    test             TEXT NOT NULL,          -- romberg / tandem
    augen            TEXT NOT NULL,          -- offen / geschlossen
    zeit_s           REAL,
    schwankung       INTEGER,                -- 0 keine, 1 leicht, 2 mäßig, 3 stark
    fallneigung      TEXT,
    ergebnis         TEXT,                   -- sicher / schritt / halt / nicht
    schritt_zeit_s   REAL,                   -- Zeit bis zum Ausfallschritt
    schritt_richtung TEXT,                   -- Richtung des Ausfallschritts
    UNIQUE (untersuchung_id, bedingung)
);

CREATE INDEX IF NOT EXISTS ix_untersuchung_patient ON untersuchung(patient_id);
CREATE INDEX IF NOT EXISTS ix_untersuchung_diagnose ON untersuchung(diagnose);
"""

# Spalten, die zu älteren Datenbankversionen nachträglich hinzugefügt werden.
MIGRATIONEN = {
    "messung": [("schritt_zeit_s", "REAL"), ("schritt_richtung", "TEXT")],
}

# Messwerte je Bedingung, die in v_analyse als eigene Spalten erscheinen.
PIVOT_SPALTEN = ["zeit_s", "schwankung", "fallneigung", "ergebnis", "schritt_zeit_s", "schritt_richtung"]


def view_sql():
    """Flache Analyse-Ansicht: eine Zeile pro Untersuchung, Messungen als Spalten."""
    pivot = ",\n".join(
        f"    MAX(CASE WHEN m.bedingung = '{b}' THEN m.{spalte} END) AS {b}_{spalte}"
        for b in BEDINGUNGEN
        for spalte in PIVOT_SPALTEN
    )
    return f"""
DROP VIEW IF EXISTS v_analyse;
CREATE VIEW v_analyse AS
SELECT
    u.id AS untersuchung_id,
    p.id AS patient_id,
    p.patient_ref,
    p.geschlecht,
    CAST((julianday(u.datum) - julianday(p.geburtsdatum)) / 365.25 AS INTEGER) AS alter_jahre,
    u.datum,
    u.messzeitpunkt,
    u.diagnose,
    u.diagnose_gruppe,
    u.icd,
    u.seite,
    CAST(julianday(u.datum) - julianday(u.ereignisdatum) AS INTEGER) AS tage_seit_ereignis,
    u.nebendiagnose,
    u.untergrund,
    u.schuhwerk,
    u.maxdauer_s,
    u.durchfuehrbar,
    u.einschaetzung,
    u.auswertung_vorschlag,
    u.symptome,
{pivot}
FROM untersuchung u
JOIN patient p ON p.id = u.patient_id
LEFT JOIN messung m ON m.untersuchung_id = u.id
GROUP BY u.id;
"""


def jetzt():
    return datetime.now().isoformat(timespec="seconds")


def leer_zu_none(wert):
    if wert is None:
        return None
    wert = str(wert).strip()
    return wert or None


def zahl(wert, typ=float):
    wert = leer_zu_none(wert)
    if wert is None:
        return None
    try:
        return typ(float(wert.replace(",", ".")))
    except ValueError:
        return None


class Datenbank:
    def __init__(self, pfad):
        self.pfad = Path(pfad)
        self.pfad.parent.mkdir(parents=True, exist_ok=True)
        with self.verbindung() as con:
            con.executescript(SCHEMA)
            for tabelle, spalten in MIGRATIONEN.items():
                vorhanden = {z[1] for z in con.execute(f"PRAGMA table_info({tabelle})")}
                for name, typ in spalten:
                    if name not in vorhanden:
                        con.execute(f"ALTER TABLE {tabelle} ADD COLUMN {name} {typ}")
            con.executescript(view_sql())
            con.execute(f"PRAGMA user_version = {SCHEMA_VERSION}")

    def verbindung(self):
        con = sqlite3.connect(self.pfad)
        con.row_factory = sqlite3.Row
        con.execute("PRAGMA foreign_keys = ON")
        return con

    def speichern(self, d, untersuchung_id=None):
        """Legt eine Untersuchung an oder aktualisiert sie. Gibt die ID zurück."""
        patient_ref = leer_zu_none(d.get("patient"))
        datum = leer_zu_none(d.get("datum"))
        if not patient_ref or not datum:
            raise ValueError("Patient und Untersuchungsdatum sind Pflichtfelder.")

        zeit = jetzt()
        with self.verbindung() as con:
            con.execute(
                """INSERT INTO patient (patient_ref, geburtsdatum, geschlecht, erstellt_am)
                   VALUES (?, ?, ?, ?)
                   ON CONFLICT(patient_ref) DO UPDATE SET
                       geburtsdatum = COALESCE(excluded.geburtsdatum, geburtsdatum),
                       geschlecht   = COALESCE(excluded.geschlecht, geschlecht)""",
                (patient_ref, leer_zu_none(d.get("geburtsdatum")),
                 leer_zu_none(d.get("geschlecht")), zeit),
            )
            patient_id = con.execute(
                "SELECT id FROM patient WHERE patient_ref = ?", (patient_ref,)
            ).fetchone()[0]

            felder = {
                "patient_id": patient_id,
                "datum": datum,
                "untersucher": leer_zu_none(d.get("untersucher")),
                "station": leer_zu_none(d.get("station")),
                "messzeitpunkt": leer_zu_none(d.get("messzeitpunkt")),
                "diagnose": leer_zu_none(d.get("diagnose")),
                "diagnose_gruppe": leer_zu_none(d.get("diagnose_gruppe")),
                "diagnose_frei": leer_zu_none(d.get("diagnose_frei")),
                "icd": leer_zu_none(d.get("icd")),
                "seite": leer_zu_none(d.get("seite")),
                "ereignisdatum": leer_zu_none(d.get("ereignisdatum")),
                "nebendiagnose": leer_zu_none(d.get("nebendiagnose")),
                "untergrund": leer_zu_none(d.get("untergrund")),
                "schuhwerk": leer_zu_none(d.get("schuhwerk")),
                "maxdauer_s": zahl(d.get("maxdauer"), int),
                "sicherung": leer_zu_none(d.get("sicherung")),
                "durchfuehrbar": 0 if d.get("durchfuehrbar") == "nein" else 1,
                "abbruchgrund": leer_zu_none(d.get("abbruchgrund")),
                "einschaetzung": leer_zu_none(d.get("einschaetzung")),
                "auswertung_vorschlag": leer_zu_none(d.get("auswertung_vorschlag")),
                "auswertung_befunde": json.dumps(d.get("auswertung_befunde") or [], ensure_ascii=False),
                "symptome": leer_zu_none(d.get("symptome")),
                "bemerkungen": leer_zu_none(d.get("bemerkungen")),
                "geaendert_am": zeit,
            }

            if untersuchung_id is None:
                felder["erstellt_am"] = zeit
                spalten = ", ".join(felder)
                platzhalter = ", ".join("?" * len(felder))
                cur = con.execute(
                    f"INSERT INTO untersuchung ({spalten}) VALUES ({platzhalter})",
                    tuple(felder.values()),
                )
                untersuchung_id = cur.lastrowid
            else:
                zuweisung = ", ".join(f"{k} = ?" for k in felder)
                cur = con.execute(
                    f"UPDATE untersuchung SET {zuweisung} WHERE id = ?",
                    (*felder.values(), untersuchung_id),
                )
                if cur.rowcount == 0:
                    raise KeyError(untersuchung_id)
                con.execute("DELETE FROM messung WHERE untersuchung_id = ?", (untersuchung_id,))

            for bed, (test, augen) in BEDINGUNGEN.items():
                werte = (
                    zahl(d.get(f"{bed}_zeit")),
                    zahl(d.get(f"{bed}_schwankung"), int),
                    leer_zu_none(d.get(f"{bed}_richtung")),
                    leer_zu_none(d.get(f"{bed}_ergebnis")),
                    zahl(d.get(f"{bed}_schritt_zeit")),
                    leer_zu_none(d.get(f"{bed}_schritt_richtung")),
                )
                if all(w is None for w in werte):
                    continue
                con.execute(
                    """INSERT INTO messung (untersuchung_id, bedingung, test, augen,
                           zeit_s, schwankung, fallneigung, ergebnis,
                           schritt_zeit_s, schritt_richtung)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (untersuchung_id, bed, test, augen, *werte),
                )
        return untersuchung_id

    def liste(self):
        with self.verbindung() as con:
            zeilen = con.execute(
                """SELECT u.id, p.patient_ref, u.datum, u.messzeitpunkt, u.diagnose,
                          u.einschaetzung, u.geaendert_am
                   FROM untersuchung u JOIN patient p ON p.id = u.patient_id
                   ORDER BY u.datum DESC, u.id DESC"""
            ).fetchall()
        return [dict(z) for z in zeilen]

    def laden(self, untersuchung_id):
        """Gibt eine Untersuchung im Formularformat zurück."""
        with self.verbindung() as con:
            u = con.execute(
                """SELECT u.*, p.patient_ref, p.geburtsdatum, p.geschlecht
                   FROM untersuchung u JOIN patient p ON p.id = u.patient_id
                   WHERE u.id = ?""",
                (untersuchung_id,),
            ).fetchone()
            if u is None:
                raise KeyError(untersuchung_id)
            messungen = con.execute(
                "SELECT * FROM messung WHERE untersuchung_id = ?", (untersuchung_id,)
            ).fetchall()

        u = dict(u)
        form = {k: ("" if v is None else v) for k, v in u.items()}
        form["patient"] = u["patient_ref"]
        form["maxdauer"] = str(u["maxdauer_s"] or 30)
        form["durchfuehrbar"] = "ja" if u["durchfuehrbar"] else "nein"
        for m in messungen:
            b = m["bedingung"]
            form[f"{b}_zeit"] = "" if m["zeit_s"] is None else f"{m['zeit_s']:g}"
            form[f"{b}_schwankung"] = "" if m["schwankung"] is None else str(m["schwankung"])
            form[f"{b}_richtung"] = m["fallneigung"] or ""
            form[f"{b}_ergebnis"] = m["ergebnis"] or ""
            form[f"{b}_schritt_zeit"] = "" if m["schritt_zeit_s"] is None else f"{m['schritt_zeit_s']:g}"
            form[f"{b}_schritt_richtung"] = m["schritt_richtung"] or ""
        form["_db_id"] = u["id"]
        return form

    def loeschen(self, untersuchung_id):
        with self.verbindung() as con:
            cur = con.execute("DELETE FROM untersuchung WHERE id = ?", (untersuchung_id,))
            if cur.rowcount == 0:
                raise KeyError(untersuchung_id)
            # Patienten ohne Untersuchungen entfernen
            con.execute(
                "DELETE FROM patient WHERE id NOT IN (SELECT DISTINCT patient_id FROM untersuchung)"
            )

    def export_csv(self):
        with self.verbindung() as con:
            cur = con.execute("SELECT * FROM v_analyse ORDER BY datum, untersuchung_id")
            puffer = io.StringIO()
            schreiber = csv.writer(puffer, delimiter=";")
            schreiber.writerow([s[0] for s in cur.description])
            schreiber.writerows(cur.fetchall())
        # BOM, damit Excel Umlaute korrekt erkennt
        return "﻿" + puffer.getvalue()


class Handler(SimpleHTTPRequestHandler):
    db: Datenbank = None
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, ".webmanifest": "application/manifest+json"}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(BASIS), **kwargs)

    def log_message(self, fmt, *args):
        pass  # Konsole ruhig halten

    # ----- Hilfen -----
    def json_antwort(self, daten, status=HTTPStatus.OK):
        inhalt = json.dumps(daten, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(inhalt)))
        self.end_headers()
        self.wfile.write(inhalt)

    def body_lesen(self):
        laenge = int(self.headers.get("Content-Length", 0))
        return json.loads(self.rfile.read(laenge) or b"{}")

    def api_id(self, pfad):
        teile = pfad.rstrip("/").split("/")
        return int(teile[3]) if len(teile) == 4 and teile[3].isdigit() else None

    def fehler(self, exc):
        if isinstance(exc, KeyError):
            self.json_antwort({"fehler": "Untersuchung nicht gefunden."}, HTTPStatus.NOT_FOUND)
        elif isinstance(exc, (ValueError, json.JSONDecodeError)):
            self.json_antwort({"fehler": str(exc)}, HTTPStatus.BAD_REQUEST)
        else:
            self.json_antwort({"fehler": f"Serverfehler: {exc}"}, HTTPStatus.INTERNAL_SERVER_ERROR)

    # ----- Routen -----
    def do_GET(self):
        pfad = urlparse(self.path).path
        if not pfad.startswith("/api/"):
            if pfad.startswith("/daten/") or pfad.endswith(".db"):
                self.send_error(HTTPStatus.FORBIDDEN)
                return
            return super().do_GET()
        try:
            if pfad == "/api/status":
                self.json_antwort({"ok": True, "datenbank": str(self.db.pfad)})
            elif pfad == "/api/untersuchungen":
                self.json_antwort(self.db.liste())
            elif pfad == "/api/export.csv":
                inhalt = self.db.export_csv().encode("utf-8")
                self.send_response(HTTPStatus.OK)
                self.send_header("Content-Type", "text/csv; charset=utf-8")
                self.send_header("Content-Disposition",
                                 f'attachment; filename="romberg_export_{datetime.now():%Y-%m-%d}.csv"')
                self.send_header("Content-Length", str(len(inhalt)))
                self.end_headers()
                self.wfile.write(inhalt)
            elif (uid := self.api_id(pfad)) is not None:
                self.json_antwort(self.db.laden(uid))
            else:
                self.send_error(HTTPStatus.NOT_FOUND)
        except Exception as exc:  # noqa: BLE001
            self.fehler(exc)

    def do_POST(self):
        if urlparse(self.path).path.rstrip("/") != "/api/untersuchungen":
            return self.send_error(HTTPStatus.NOT_FOUND)
        try:
            uid = self.db.speichern(self.body_lesen())
            self.json_antwort({"id": uid}, HTTPStatus.CREATED)
        except Exception as exc:  # noqa: BLE001
            self.fehler(exc)

    def do_PUT(self):
        uid = self.api_id(urlparse(self.path).path)
        if uid is None:
            return self.send_error(HTTPStatus.NOT_FOUND)
        try:
            self.db.speichern(self.body_lesen(), uid)
            self.json_antwort({"id": uid})
        except Exception as exc:  # noqa: BLE001
            self.fehler(exc)

    def do_DELETE(self):
        uid = self.api_id(urlparse(self.path).path)
        if uid is None:
            return self.send_error(HTTPStatus.NOT_FOUND)
        try:
            self.db.loeschen(uid)
            self.json_antwort({"geloescht": uid})
        except Exception as exc:  # noqa: BLE001
            self.fehler(exc)


def main():
    parser = argparse.ArgumentParser(description="Romberg-Assessment – lokaler Server mit SQLite")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--db", default=str(BASIS / "daten" / "romberg.db"))
    parser.add_argument("--kein-browser", action="store_true", help="Browser nicht automatisch öffnen")
    args = parser.parse_args()

    Handler.db = Datenbank(args.db)
    # Nur an 127.0.0.1 binden: von anderen Rechnern im Netz nicht erreichbar.
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    url = f"http://127.0.0.1:{args.port}/"
    print(f"Romberg-Assessment läuft: {url}")
    print(f"Datenbank: {Handler.db.pfad}")
    print("Beenden mit Strg+C")
    if not args.kein_browser:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer beendet.")


if __name__ == "__main__":
    main()
