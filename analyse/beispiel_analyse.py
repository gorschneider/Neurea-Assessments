"""Beispiel: Romberg-Daten aus der lokalen SQLite-Datenbank für Analysen laden.

Benötigt: pip install pandas
Start:    python analyse/beispiel_analyse.py
"""
import sqlite3
from pathlib import Path

import pandas as pd

DB = Path(__file__).resolve().parent.parent / "daten" / "romberg.db"

with sqlite3.connect(DB) as con:
    # Flache Tabelle: eine Zeile pro Untersuchung (ideal für Modelle)
    df = pd.read_sql_query("SELECT * FROM v_analyse", con, parse_dates=["datum"])
    # Langformat: eine Zeile pro Messung (z. B. für gemischte Modelle)
    messungen = pd.read_sql_query(
        """SELECT u.id AS untersuchung_id, u.patient_id, u.datum, u.messzeitpunkt,
                  u.diagnose, m.test, m.augen, m.zeit_s, m.schwankung, m.ergebnis
           FROM messung m JOIN untersuchung u ON u.id = m.untersuchung_id""",
        con,
    )

print(f"{len(df)} Untersuchungen, {df['patient_id'].nunique()} Patient/innen\n")

# Abgeleitete Merkmale
df["romberg_quotient"] = df["ro_ag_zeit_s"] / df["ro_ao_zeit_s"]
df["romberg_positiv"] = (df["einschaetzung"].fillna(df["auswertung_vorschlag"]) == "Romberg positiv").astype(int)

print("Anteil Romberg positiv je Diagnosegruppe:")
print(df.groupby("diagnose_gruppe")["romberg_positiv"].agg(["count", "mean"]).round(2), "\n")

print("Mittlere Standzeiten (s) je Test und Augen:")
print(messungen.groupby(["test", "augen"])["zeit_s"].mean().round(1))
