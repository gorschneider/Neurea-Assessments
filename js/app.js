(function () {
  "use strict";

  const SPEICHER_KEY = "romberg-assessment-entwurf";

  const BEDINGUNGEN = [
    { id: "ro_ao", titel: "Romberg – Füße geschlossen, Augen offen" },
    { id: "ro_ag", titel: "Romberg – Füße geschlossen, Augen geschlossen" },
    { id: "sr_ao", titel: "Sharpened Romberg (Tandemstand) – Augen offen" },
    { id: "sr_ag", titel: "Sharpened Romberg (Tandemstand) – Augen geschlossen" },
  ];

  const formular = document.getElementById("formular");
  const selDiagnose = document.getElementById("sel-diagnose");
  const selNeben = document.getElementById("sel-nebendiagnose");
  const inpIcd = document.getElementById("inp-icd");
  const feldFrei = document.getElementById("feld-diagnose-frei");
  const auswertungEl = document.getElementById("auswertung");
  const selEinschaetzung = document.getElementById("sel-einschaetzung");

  // ---------- Aufbau ----------

  function diagnoseOptionenFuellen(select, platzhalter) {
    select.appendChild(new Option(platzhalter, ""));
    DIAGNOSEN.forEach(function (gruppe) {
      const og = document.createElement("optgroup");
      og.label = gruppe.gruppe;
      gruppe.eintraege.forEach(function (e) {
        const opt = new Option(e.code ? e.name + " (" + e.code + ")" : e.name, e.name);
        opt.dataset.code = e.code;
        if (e.freitext) opt.dataset.freitext = "1";
        og.appendChild(opt);
      });
      select.appendChild(og);
    });
  }

  function bedingungenAufbauen() {
    const container = document.getElementById("bedingungen");
    const tpl = document.getElementById("tpl-bedingung");
    BEDINGUNGEN.forEach(function (b) {
      const knoten = tpl.content.firstElementChild.cloneNode(true);
      knoten.dataset.bedingung = b.id;
      knoten.querySelector("legend").textContent = b.titel;
      knoten.querySelectorAll("[data-feld]").forEach(function (el) {
        el.name = b.id + "_" + el.dataset.feld;
      });
      container.appendChild(knoten);
    });
  }

  diagnoseOptionenFuellen(selDiagnose, "– Krankheitsbild auswählen –");
  diagnoseOptionenFuellen(selNeben, "– keine –");
  bedingungenAufbauen();

  // ---------- Interaktion ----------

  function diagnoseGeaendert(icdUeberschreiben) {
    const opt = selDiagnose.selectedOptions[0];
    const frei = !!(opt && opt.dataset.freitext);
    feldFrei.classList.toggle("versteckt", !frei);
    feldFrei.querySelector("input").required = frei;
    if (icdUeberschreiben && opt) inpIcd.value = opt.dataset.code || "";
  }

  function durchfuehrbarGeaendert() {
    const nein = formular.durchfuehrbar.value === "nein";
    document.getElementById("inp-abbruchgrund").classList.toggle("versteckt", !nein);
    document.getElementById("karte-test").classList.toggle("deaktiviert", nein);
    document.querySelectorAll("#bedingungen input, #bedingungen select").forEach(function (el) {
      el.disabled = nein;
    });
  }

  selDiagnose.addEventListener("change", function () { diagnoseGeaendert(true); });
  formular.addEventListener("change", function (e) {
    if (e.target.name === "durchfuehrbar") durchfuehrbarGeaendert();
    // Bei erreichter Maximalzeit "sicher gehalten" vorschlagen
    const m = /^(\w+)_zeit$/.exec(e.target.name || "");
    if (m) {
      const ergebnis = formular[m[1] + "_ergebnis"];
      if (!ergebnis.value && Number(e.target.value) >= maxDauer()) ergebnis.value = "sicher";
    }
    auswerten();
  });
  formular.addEventListener("input", auswerten);

  // ---------- Auswertung ----------

  function maxDauer() {
    return Number(formular.maxdauer.value) || 30;
  }

  function bedingungLesen(id) {
    const zeitRoh = formular[id + "_zeit"].value;
    const schwRoh = formular[id + "_schwankung"].value;
    const ergebnis = formular[id + "_ergebnis"].value;
    const d = {
      zeit: zeitRoh === "" ? null : Number(zeitRoh),
      schwankung: schwRoh === "" ? null : Number(schwRoh),
      richtung: formular[id + "_richtung"].value,
      ergebnis: ergebnis,
    };
    d.erhoben = ergebnis !== "nicht" && (d.zeit !== null || d.schwankung !== null || ergebnis !== "");
    // Bestanden = Maximalzeit gehalten ohne Ausfallschritt / Hilfe
    d.bestanden = d.erhoben && ergebnis !== "schritt" && ergebnis !== "halt" &&
      (d.zeit === null || d.zeit >= maxDauer());
    d.stabil = d.bestanden && (d.schwankung === null || d.schwankung <= 1);
    return d;
  }

  function verschlechterung(ao, ag) {
    if (ao.bestanden && !ag.bestanden) return true;
    if (ao.schwankung !== null && ag.schwankung !== null && ag.schwankung - ao.schwankung >= 2) return true;
    return false;
  }

  function quotient(ao, ag) {
    if (ao.zeit && ag.zeit !== null) return ag.zeit / ao.zeit;
    return null;
  }

  function auswerten() {
    const befunde = [];
    let vorschlag = "";

    if (formular.durchfuehrbar.value === "nein") {
      befunde.push({ typ: "warn", text: "Test nicht durchführbar – kein freier Stand. Erhöhtes Sturzrisiko anzunehmen." });
      vorschlag = "nicht beurteilbar";
      return anzeigen(befunde, vorschlag);
    }

    const d = {};
    BEDINGUNGEN.forEach(function (b) { d[b.id] = bedingungLesen(b.id); });

    // Standard-Romberg
    const ao = d.ro_ao, ag = d.ro_ag;
    if (ao.erhoben && ag.erhoben) {
      if (!ao.stabil) {
        befunde.push({ typ: "warn", text: "Bereits mit offenen Augen instabil – Hinweis auf zerebelläre / zentrale Standataxie oder motorisches Defizit. Romberg-Zeichen nur eingeschränkt verwertbar." });
        if (verschlechterung(ao, ag)) {
          befunde.push({ typ: "info", text: "Zusätzlich deutliche Verschlechterung bei Augenschluss – mögliche kombinierte (sensorisch + zerebelläre) Komponente." });
        }
        vorschlag = "nicht beurteilbar";
      } else if (verschlechterung(ao, ag)) {
        befunde.push({ typ: "positiv", text: "Romberg positiv: stabil mit offenen Augen, deutliche Verschlechterung bei Augenschluss – Hinweis auf sensorische Ataxie (propriozeptiv, z. B. Hinterstrang / Polyneuropathie) oder vestibuläres Defizit." });
        vorschlag = "Romberg positiv";
      } else {
        befunde.push({ typ: "negativ", text: "Romberg negativ: keine relevante Verschlechterung bei Augenschluss." });
        vorschlag = "Romberg negativ";
      }
      const q = quotient(ao, ag);
      if (q !== null) {
        befunde.push({ typ: "info", text: "Zeitquotient AG/AO: " + q.toFixed(2) + (q < 1 ? " (Standzeit mit Augenschluss verkürzt)" : "") });
      }
    } else {
      befunde.push({ typ: "info", text: "Für die Romberg-Beurteilung beide Standard-Bedingungen (Augen offen / geschlossen) erfassen." });
    }

    // Sharpened Romberg
    const sao = d.sr_ao, sag = d.sr_ag;
    if (sao.erhoben || sag.erhoben) {
      if (sao.erhoben && !sao.bestanden) {
        befunde.push({ typ: "warn", text: "Tandemstand mit offenen Augen nicht über " + maxDauer() + " s gehalten." });
      }
      if (sag.erhoben) {
        befunde.push(sag.bestanden
          ? { typ: "negativ", text: "Sharpened Romberg mit Augenschluss " + maxDauer() + " s gehalten – unauffällig." }
          : { typ: "warn", text: "Sharpened Romberg mit Augenschluss auffällig" + (sag.zeit !== null ? " (" + sag.zeit + " s)" : "") + ". Altersabhängige Normwerte beachten." });
      }
    }

    // Fallneigung
    const richtungen = BEDINGUNGEN.map(function (b) { return d[b.id].richtung; })
      .filter(function (r) { return r && r !== "ungerichtet"; });
    if (richtungen.length) {
      const gleich = richtungen.every(function (r) { return r === richtungen[0]; });
      befunde.push({ typ: "info", text: gleich
        ? "Konstante Fallneigung " + richtungen[0] + (/(rechts|links)/.test(richtungen[0]) ? " – bei vestibulärer oder zerebellärer Läsion meist zur Seite der Läsion." : ".")
        : "Wechselnde Fallneigung (" + richtungen.join(", ") + ")." });
    }

    // Sturzrisiko
    const hilfe = BEDINGUNGEN.some(function (b) { return d[b.id].ergebnis === "halt"; });
    if (hilfe) befunde.push({ typ: "warn", text: "Festhalten / Hilfe in mindestens einer Bedingung nötig – erhöhtes Sturzrisiko, Sturzprophylaxe prüfen." });

    anzeigen(befunde, vorschlag);
  }

  function anzeigen(befunde, vorschlag) {
    auswertungEl.innerHTML = "";
    if (!befunde.length) {
      auswertungEl.innerHTML = '<p class="leer">Noch keine Messwerte erfasst.</p>';
    }
    befunde.forEach(function (b) {
      const p = document.createElement("p");
      p.className = "befund befund-" + b.typ;
      p.textContent = b.text;
      auswertungEl.appendChild(p);
    });
    selEinschaetzung.options[0].textContent = vorschlag
      ? "Vorschlag: " + vorschlag
      : "– automatisch vorgeschlagen –";
    formular.dataset.vorschlag = vorschlag;
  }

  // ---------- Speichern / Laden ----------

  function datenSammeln() {
    const daten = {};
    new FormData(formular).forEach(function (wert, schluessel) { daten[schluessel] = wert; });
    // Deaktivierte Felder fehlen in FormData – explizit ergänzen
    formular.querySelectorAll("[name]:disabled").forEach(function (el) { daten[el.name] = el.value; });
    daten.diagnose_icd_vorschlag = (selDiagnose.selectedOptions[0] || {}).dataset?.code || "";
    daten.auswertung_vorschlag = formular.dataset.vorschlag || "";
    daten.auswertung_befunde = Array.from(auswertungEl.querySelectorAll(".befund")).map(function (p) { return p.textContent; });
    daten._erstellt = new Date().toISOString();
    daten._version = 1;
    return daten;
  }

  function datenLaden(daten) {
    formular.reset();
    Object.keys(daten).forEach(function (k) {
      const el = formular.elements[k];
      if (!el) return;
      if (el instanceof RadioNodeList) el.value = daten[k];
      else el.value = daten[k];
    });
    diagnoseGeaendert(false);
    durchfuehrbarGeaendert();
    auswerten();
  }

  function pflichtfelderPruefen() {
    const fehlend = Array.from(formular.querySelectorAll("[required]")).filter(function (el) {
      el.classList.toggle("fehler", !el.value.trim());
      return !el.value.trim();
    });
    if (fehlend.length) {
      fehlend[0].focus();
      alert("Bitte Pflichtfelder (*) ausfüllen.");
      return false;
    }
    return true;
  }

  function dateiname() {
    const p = (formular.patient.value || "patient").replace(/[^\wäöüÄÖÜß-]+/g, "_");
    return "romberg_" + p + "_" + (formular.datum.value || "ohne-datum") + ".json";
  }

  document.getElementById("btn-speichern").addEventListener("click", function () {
    try {
      localStorage.setItem(SPEICHER_KEY, JSON.stringify(datenSammeln()));
      meldung("Entwurf lokal gespeichert.");
    } catch (e) {
      meldung("Speichern im Browser nicht möglich.");
    }
  });

  document.getElementById("btn-export").addEventListener("click", function () {
    if (!pflichtfelderPruefen()) return;
    const blob = new Blob([JSON.stringify(datenSammeln(), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = dateiname();
    a.click();
    URL.revokeObjectURL(a.href);
  });

  document.getElementById("inp-import").addEventListener("change", function (e) {
    const datei = e.target.files[0];
    if (!datei) return;
    datei.text().then(function (text) {
      datenLaden(JSON.parse(text));
      meldung("Daten importiert.");
    }).catch(function () { alert("Datei konnte nicht gelesen werden."); });
    e.target.value = "";
  });

  document.getElementById("btn-drucken").addEventListener("click", function () {
    if (pflichtfelderPruefen()) window.print();
  });

  document.getElementById("btn-reset").addEventListener("click", function () {
    if (!confirm("Formular leeren und gespeicherten Entwurf verwerfen?")) return;
    try { localStorage.removeItem(SPEICHER_KEY); } catch (e) { /* ignorieren */ }
    formular.reset();
    initialisieren();
  });

  function meldung(text) {
    let el = document.getElementById("meldung");
    if (!el) {
      el = document.createElement("div");
      el.id = "meldung";
      el.className = "meldung kein-druck";
      el.setAttribute("role", "status");
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.classList.add("sichtbar");
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove("sichtbar"); }, 2500);
  }

  function initialisieren() {
    formular.datum.value = new Date().toISOString().slice(0, 10);
    diagnoseGeaendert(false);
    durchfuehrbarGeaendert();
    auswerten();
  }

  initialisieren();
  try {
    const entwurf = localStorage.getItem(SPEICHER_KEY);
    if (entwurf) {
      datenLaden(JSON.parse(entwurf));
      meldung("Gespeicherter Entwurf geladen.");
    }
  } catch (e) { /* kein Entwurf */ }
})();
