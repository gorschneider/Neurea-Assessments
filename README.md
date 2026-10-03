# Neurea Assessments – Romberg-Assessment

Webbasierte Eingabemaske für den Romberg-Test (inkl. Sharpened Romberg / Tandemstand) in der neurologischen Rehabilitation – mit lokaler SQLite-Datenbank für spätere Auswertungen und Datenmodelle.

## Starten

Voraussetzung: [Python 3](https://www.python.org/downloads/) (unter Windows bei der Installation „Add Python to PATH“ anhaken). Weitere Pakete sind nicht nötig.

- **Windows:** Doppelklick auf `start.bat`
- **macOS / Linux:** `./start.sh`

Der Browser öffnet sich automatisch unter <http://127.0.0.1:8765/>. Der Server ist nur vom eigenen PC aus erreichbar. Beenden mit `Strg+C` im Konsolenfenster.

Optionen: `python server.py --port 9000 --db D:\Pfad\romberg.db --kein-browser`

Ohne Server (`index.html` direkt öffnen) funktioniert die Maske weiterhin, speichert dann aber nur Entwürfe im Browser.

## Funktionen

- Patienten- und Untersuchungsdaten, Haupt- und Nebendiagnose per Drop-down (gruppierte neurologische Krankheitsbilder mit ICD-10-GM-Vorschlag, Freitext-Option; Liste in `js/diagnosen.js`)
- Vier Testbedingungen: Romberg und Sharpened Romberg, jeweils Augen offen / geschlossen
- Bei Ergebnis „Ausfallschritt“: Zeit bis zum Ausfallschritt und Richtung (8 Richtungen oder wechselnd)
- Automatischer Auswertungsvorschlag
- **In Datenbank speichern**, bestehende Untersuchungen öffnen, ändern, löschen und durchsuchen
- **CSV-Export** der Analyse-Tabelle (Semikolon-getrennt, Excel-kompatibel)
- JSON-Export/-Import, Druck/PDF

## Datenbank

Standardpfad: `daten/romberg.db` (eine SQLite-Datei; regelmäßig sichern). Bestehende Datenbanken werden beim Start automatisch um neue Spalten ergänzt. Der Ordner `daten/` ist per `.gitignore` von der Versionierung ausgeschlossen.

| Tabelle / View | Inhalt |
|---|---|
| `patient` | eine Zeile pro Patient/in (`patient_ref`, Geburtsdatum, Geschlecht) |
| `untersuchung` | eine Zeile pro Untersuchung (Diagnose, Rahmenbedingungen, Einschätzung …) |
| `messung` | eine Zeile pro Testbedingung (`test` romberg/tandem, `augen` offen/geschlossen, `zeit_s`, `schwankung` 0–3, `fallneigung`, `ergebnis`, bei Ausfallschritt `schritt_zeit_s` und `schritt_richtung`) |
| `v_analyse` | flache Sicht: eine Zeile pro Untersuchung, Messungen als Spalten, plus `alter_jahre` und `tage_seit_ereignis` |

Mehrere Untersuchungen derselben Person (Aufnahme / Verlauf / Entlassung) hängen über `patient_ref` am selben Patienten – damit sind Verlaufsanalysen möglich.

**Datenschutz:** Für Auswertungen statt Klarnamen eine Pseudonym-ID (z. B. `PSN-001`) als Patient eintragen und die Zuordnungsliste getrennt aufbewahren.

### Auswertung

```python
import sqlite3, pandas as pd
df = pd.read_sql_query("SELECT * FROM v_analyse", sqlite3.connect("daten/romberg.db"))
```

Ein vollständiges Beispiel steht in `analyse/beispiel_analyse.py` (`pip install pandas`). Die Datei lässt sich ebenso mit R (`RSQLite`), DB Browser for SQLite oder Excel (über den CSV-Export) öffnen.

Die automatische Auswertung ist eine Orientierungshilfe und ersetzt keine klinische Beurteilung.
