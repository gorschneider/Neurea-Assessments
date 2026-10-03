(function () {
  "use strict";

  const SPEICHER_KEY = "romberg-assessment-entwurf";

  const BEDINGUNGEN = [
    { id: "ro_ao", titel: "Romberg – Füße geschlossen, Augen offen" },
    { id: "ro_ag", titel: "Romberg – Füße geschlossen, Augen geschlossen" },
    { id: "sr_ao", titel: "Sharpened Romberg (Tandemstand) – Augen offen" },
    { id: "sr_ag", titel: "Sharpened Romberg (Tandemstand) – Augen geschlossen" },
  ];

  const KURZNAMEN = {
    ro_ao: "Romberg AO",
    ro_ag: "Romberg AG",
    sr_ao: "Tandem AO",
    sr_ag: "Tandem AG",
  };

  const formular = document.getElementById("formular");
  const selDiagnose = document.getElementById("sel-diagnose");
  const selNeben = document.getElementById("sel-nebendiagnose");
  const inpIcd = document.getElementById("inp-icd");
  const feldFrei = document.getElementById("feld-diagnose-frei");
  const auswertungEl = document.getElementById("auswertung");
  const selEinschaetzung = document.getElementById("sel-einschaetzung");

  let aktuelleId = null;     // ID des Datensatzes in der Datenbank (falls gespeichert)
  let dbVerfuegbar = false;

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

  // Felder zum Ausfallschritt nur bei Ergebnis "Ausfallschritt" anzeigen
  function schrittDetailsAktualisieren(id, leeren) {
    const schritt = formular[id + "_ergebnis"].value === "schritt";
    const details = document.querySelector('[data-bedingung="' + id + '"] .schritt-details');
    details.classList.toggle("versteckt", !schritt);
    if (!schritt && leeren) {
      formular[id + "_schritt_zeit"].value = "";
      formular[id + "_schritt_richtung"].value = "";
    }
  }

  function alleSchrittDetailsAktualisieren() {
    BEDINGUNGEN.forEach(function (b) { schrittDetailsAktualisieren(b.id, false); });
  }

  selDiagnose.addEventListener("change", function () { diagnoseGeaendert(true); });
  formular.addEventListener("change", function (e) {
    const name = e.target.name || "";
    if (name === "durchfuehrbar") durchfuehrbarGeaendert();
    // Bei erreichter Maximalzeit "sicher gehalten" vorschlagen
    const m = /^(\w\w_\w\w)_zeit$/.exec(name);
    if (m) {
      const ergebnis = formular[m[1] + "_ergebnis"];
      if (!ergebnis.value && Number(e.target.value) >= maxDauer()) ergebnis.value = "sicher";
    }
    const erg = /^(\w\w_\w\w)_ergebnis$/.exec(name);
    if (erg) {
      schrittDetailsAktualisieren(erg[1], true);
      if (e.target.value === "schritt") formular[erg[1] + "_schritt_zeit"].focus();
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
    const schrittZeitRoh = formular[id + "_schritt_zeit"].value;
    const d = {
      zeit: zeitRoh === "" ? null : Number(zeitRoh),
      schwankung: schwRoh === "" ? null : Number(schwRoh),
      richtung: formular[id + "_richtung"].value,
      ergebnis: ergebnis,
      schrittZeit: ergebnis === "schritt" && schrittZeitRoh !== "" ? Number(schrittZeitRoh) : null,
      schrittRichtung: ergebnis === "schritt" ? formular[id + "_schritt_richtung"].value : "",
    };
    // Ohne eigene Standzeit gilt die Zeit bis zum Ausfallschritt
    if (d.zeit === null && d.schrittZeit !== null) d.zeit = d.schrittZeit;
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

    // Ausfallschritte
    const schritte = BEDINGUNGEN.filter(function (b) { return d[b.id].ergebnis === "schritt"; });
    if (schritte.length) {
      befunde.push({ typ: "info", text: "Ausfallschritt: " + schritte.map(function (b) {
        const s = d[b.id];
        return KURZNAMEN[b.id] + (s.schrittZeit !== null ? " nach " + s.schrittZeit + " s" : "") +
          (s.schrittRichtung ? " " + s.schrittRichtung : "");
      }).join("; ") + "." });
      const seiten = schritte.map(function (b) {
        const m = /(rechts|links)/.exec(d[b.id].schrittRichtung);
        return m && m[1];
      });
      if (schritte.length > 1 && seiten[0] && seiten.every(function (x) { return x === seiten[0]; })) {
        befunde.push({ typ: "info", text: "Ausfallschritte konstant nach " + seiten[0] + " – seitenkonstante Gleichgewichtsstörung (z. B. vestibulär oder zerebellär ipsilateral) prüfen." });
      }
      const unvollstaendig = schritte.filter(function (b) {
        return d[b.id].schrittZeit === null || !d[b.id].schrittRichtung;
      });
      if (unvollstaendig.length) {
        befunde.push({ typ: "warn", text: "Bitte Zeit und Richtung des Ausfallschritts ergänzen: " +
          unvollstaendig.map(function (b) { return KURZNAMEN[b.id]; }).join(", ") + "." });
      }
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
    formular.querySelectorAll("[name]:disabled").forEach(function (el) {
      if (el.type === "radio") {
        if (el.checked) daten[el.name] = el.value;
        else if (!(el.name in daten)) daten[el.name] = "";
      } else {
        daten[el.name] = el.value;
      }
    });
    const diagOpt = selDiagnose.selectedOptions[0];
    daten.diagnose_icd_vorschlag = (diagOpt && diagOpt.dataset.code) || "";
    daten.diagnose_gruppe = diagOpt && diagOpt.parentElement.tagName === "OPTGROUP" ? diagOpt.parentElement.label : "";
    daten.auswertung_vorschlag = formular.dataset.vorschlag || "";
    daten.auswertung_befunde = Array.from(auswertungEl.querySelectorAll(".befund")).map(function (p) { return p.textContent; });
    daten._erstellt = new Date().toISOString();
    if (aktuelleId) daten._db_id = aktuelleId;
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
    aktuelleIdSetzen(daten._db_id || null);
    alleSchrittDetailsAktualisieren();
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
    aktuelleIdSetzen(null);
    initialisieren();
  });

  // ---------- Datenbank (lokaler Server) ----------

  const dlgListe = document.getElementById("dlg-liste");
  const tblListe = document.getElementById("tbl-liste");
  const inpSuche = document.getElementById("inp-suche");
  let listeCache = [];

  function api(pfad, optionen) {
    return fetch(pfad, Object.assign({ headers: { "Content-Type": "application/json" } }, optionen))
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (body) {
          if (!r.ok) throw new Error(body.fehler || "HTTP " + r.status);
          return body;
        });
      });
  }

  function aktuelleIdSetzen(id) {
    aktuelleId = id;
    const el = document.getElementById("db-status");
    el.textContent = id ? "Datensatz #" + id : "Neuer Datensatz";
    document.getElementById("btn-db-speichern").textContent = id ? "Aktualisieren" : "Sichern";
  }

  function dbPruefen() {
    if (location.protocol === "file:") return;
    api("/api/status").then(function (s) {
      dbVerfuegbar = true;
      document.querySelectorAll(".db-only").forEach(function (el) { el.classList.remove("versteckt"); });
      document.querySelectorAll(".nur-ohne-db").forEach(function (el) { el.classList.add("versteckt"); });
      document.getElementById("fuss-speicherort").textContent = "Datenbank: " + s.datenbank;
      aktuelleIdSetzen(aktuelleId);
    }).catch(function () { /* ohne Server: nur Browser-Entwurf */ });
  }

  document.getElementById("btn-db-speichern").addEventListener("click", function () {
    if (!dbVerfuegbar || !pflichtfelderPruefen()) return;
    const daten = datenSammeln();
    const anfrage = aktuelleId
      ? api("/api/untersuchungen/" + aktuelleId, { method: "PUT", body: JSON.stringify(daten) })
      : api("/api/untersuchungen", { method: "POST", body: JSON.stringify(daten) });
    anfrage.then(function (r) {
      aktuelleIdSetzen(r.id);
      try { localStorage.removeItem(SPEICHER_KEY); } catch (e) { /* ignorieren */ }
      meldung("In Datenbank gespeichert (Datensatz #" + r.id + ").");
    }).catch(function (e) { alert("Speichern fehlgeschlagen: " + e.message); });
  });

  function listeZeichnen() {
    const suche = inpSuche.value.trim().toLowerCase();
    tblListe.innerHTML = "";
    const zeilen = listeCache.filter(function (u) {
      return !suche || [u.patient_ref, u.diagnose, u.datum, u.messzeitpunkt]
        .join(" ").toLowerCase().includes(suche);
    });
    if (!zeilen.length) {
      tblListe.innerHTML = '<tr><td colspan="7" class="leer">Keine Einträge.</td></tr>';
      return;
    }
    zeilen.forEach(function (u) {
      const tr = document.createElement("tr");
      [u.id, u.datum, u.patient_ref, u.messzeitpunkt, u.diagnose, u.einschaetzung].forEach(function (w) {
        const td = document.createElement("td");
        td.textContent = w == null ? "" : w;
        tr.appendChild(td);
      });
      const td = document.createElement("td");
      td.className = "zeilen-aktionen";
      const laden = document.createElement("button");
      laden.type = "button";
      laden.textContent = "Öffnen";
      laden.addEventListener("click", function () {
        api("/api/untersuchungen/" + u.id).then(function (d) {
          datenLaden(d);
          dlgListe.close();
          meldung("Datensatz #" + u.id + " geladen.");
        }).catch(function (e) { alert(e.message); });
      });
      const loeschen = document.createElement("button");
      loeschen.type = "button";
      loeschen.className = "gefahr";
      loeschen.textContent = "Löschen";
      loeschen.addEventListener("click", function () {
        if (!confirm("Untersuchung #" + u.id + " (" + u.patient_ref + ", " + u.datum + ") endgültig löschen?")) return;
        api("/api/untersuchungen/" + u.id, { method: "DELETE" }).then(function () {
          if (aktuelleId === u.id) aktuelleIdSetzen(null);
          listeLaden();
        }).catch(function (e) { alert(e.message); });
      });
      td.append(laden, loeschen);
      tr.appendChild(td);
      tblListe.appendChild(tr);
    });
  }

  function listeLaden() {
    return api("/api/untersuchungen").then(function (l) { listeCache = l; listeZeichnen(); });
  }

  document.getElementById("btn-db-liste").addEventListener("click", function () {
    listeLaden().then(function () { dlgListe.showModal(); })
      .catch(function (e) { alert("Liste konnte nicht geladen werden: " + e.message); });
  });
  document.getElementById("btn-dlg-schliessen").addEventListener("click", function () { dlgListe.close(); });
  inpSuche.addEventListener("input", listeZeichnen);

  // ---------- Apple-typische Bedienelemente ----------

  // Aktionsmenü schließen: nach Auswahl, bei Klick daneben und mit Escape
  const menue = document.getElementById("menue");
  menue.querySelector(".menue-panel").addEventListener("click", function (e) {
    if (e.target.closest("button, a")) menue.open = false;
  });
  document.getElementById("inp-import").addEventListener("change", function () { menue.open = false; });
  document.addEventListener("click", function (e) {
    if (menue.open && !menue.contains(e.target)) menue.open = false;
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") menue.open = false;
  });

  // Navigationsleiste: Titel und Trennlinie erst nach dem Scrollen einblenden
  const navleiste = document.querySelector(".navleiste");
  const grosserTitel = document.getElementById("grosser-titel");
  function navAktualisieren() {
    navleiste.classList.toggle("gescrollt", grosserTitel.getBoundingClientRect().bottom < navleiste.offsetHeight);
  }
  window.addEventListener("scroll", navAktualisieren, { passive: true });
  navAktualisieren();

  // Segmente mit Klasse "abwaehlbar": erneutes Tippen hebt die Auswahl auf
  let warGewaehlt = null;
  formular.addEventListener("pointerdown", function (e) {
    const label = e.target.closest(".segment.abwaehlbar label");
    const input = label && label.querySelector("input");
    warGewaehlt = input && input.checked && !input.disabled ? input : null;
  });
  formular.addEventListener("click", function (e) {
    const input = warGewaehlt;
    warGewaehlt = null;
    if (!input || e.target !== input) return;
    input.checked = false;
    formular.dispatchEvent(new Event("change", { bubbles: true }));
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
    alleSchrittDetailsAktualisieren();
    diagnoseGeaendert(false);
    durchfuehrbarGeaendert();
    auswerten();
  }

  aktuelleIdSetzen(null);
  initialisieren();
  dbPruefen();
  try {
    const entwurf = localStorage.getItem(SPEICHER_KEY);
    if (entwurf) {
      datenLaden(JSON.parse(entwurf));
      meldung("Gespeicherter Entwurf geladen.");
    }
  } catch (e) { /* kein Entwurf */ }
})();
