# Neurea Assessments – Romberg-Assessment

Webbasierte Eingabemaske für den Romberg-Test (inkl. Sharpened Romberg / Tandemstand) in der neurologischen Rehabilitation.

## Starten

Keine Installation nötig: `index.html` im Browser öffnen – oder lokal ausliefern, z. B. `npx serve .`

## Funktionen

- Patienten- und Untersuchungsdaten
- Hauptdiagnose und Nebendiagnose per Drop-down (gruppierte, übliche neurologische Krankheitsbilder mit ICD-10-GM-Vorschlag, Freitext-Option); Liste in `js/diagnosen.js`
- Rahmenbedingungen (Untergrund, Schuhwerk, Testdauer 30/60 s, Sicherung)
- Vier Testbedingungen: Romberg und Sharpened Romberg, jeweils mit offenen und geschlossenen Augen (Zeit, Schwankung, Fallneigung, Ergebnis)
- Automatischer Auswertungsvorschlag (Romberg positiv/negativ/nicht beurteilbar, Zeitquotient, Fallneigung, Sturzrisiko-Hinweis)
- Entwurf lokal im Browser speichern, JSON-Export/-Import, Druck/PDF

Die Daten verlassen den Browser nicht. Die automatische Auswertung ist eine Orientierungshilfe und ersetzt keine klinische Beurteilung.
