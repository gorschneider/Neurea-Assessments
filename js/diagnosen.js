// Übliche Krankheitsbilder der neurologischen Rehabilitation, gruppiert nach Kategorie.
// Die ICD-10-GM-Codes dienen der Orientierung und ersetzen keine ärztliche Kodierung.
const DIAGNOSEN = [
  {
    gruppe: "Zerebrovaskuläre Erkrankungen",
    eintraege: [
      { code: "I63.9", name: "Ischämischer Schlaganfall (Hirninfarkt)" },
      { code: "I61.9", name: "Intrazerebrale Blutung (ICB)" },
      { code: "I60.9", name: "Subarachnoidalblutung (SAB)" },
      { code: "G45.9", name: "Transitorische ischämische Attacke (TIA)" },
      { code: "I67.3", name: "Subkortikale vaskuläre Enzephalopathie (SVE / Mikroangiopathie)" },
      { code: "I67.6", name: "Sinus- / Hirnvenenthrombose" },
    ],
  },
  {
    gruppe: "Schädel-Hirn- und Rückenmarksverletzungen",
    eintraege: [
      { code: "S06.9", name: "Schädel-Hirn-Trauma (SHT)" },
      { code: "G93.1", name: "Hypoxischer Hirnschaden (z. B. nach Reanimation)" },
      { code: "G82.2", name: "Querschnittlähmung – Paraplegie / Paraparese" },
      { code: "G82.5", name: "Querschnittlähmung – Tetraplegie / Tetraparese" },
      { code: "G95.9", name: "Myelopathie (nicht-traumatisch, z. B. zervikal)" },
    ],
  },
  {
    gruppe: "Entzündliche / autoimmune Erkrankungen",
    eintraege: [
      { code: "G35.1", name: "Multiple Sklerose – schubförmig remittierend (RRMS)" },
      { code: "G35.3", name: "Multiple Sklerose – sekundär progredient (SPMS)" },
      { code: "G35.2", name: "Multiple Sklerose – primär progredient (PPMS)" },
      { code: "G61.0", name: "Guillain-Barré-Syndrom (GBS)" },
      { code: "G61.8", name: "Chronisch inflammatorische demyelinisierende Polyneuropathie (CIDP)" },
      { code: "G04.9", name: "Enzephalitis / Enzephalomyelitis" },
      { code: "G36.0", name: "Neuromyelitis-optica-Spektrum-Erkrankung (NMOSD)" },
      { code: "G70.0", name: "Myasthenia gravis" },
    ],
  },
  {
    gruppe: "Bewegungsstörungen / Neurodegeneration",
    eintraege: [
      { code: "G20.9", name: "Idiopathisches Parkinson-Syndrom" },
      { code: "G23.2", name: "Multisystematrophie (MSA)" },
      { code: "G23.1", name: "Progressive supranukleäre Blickparese (PSP)" },
      { code: "G12.2", name: "Amyotrophe Lateralsklerose (ALS)" },
      { code: "G10", name: "Chorea Huntington" },
      { code: "G24.9", name: "Dystonie" },
      { code: "G25.0", name: "Essentieller Tremor" },
      { code: "G91.2", name: "Normaldruckhydrozephalus (NPH)" },
      { code: "F03", name: "Demenzielles Syndrom" },
    ],
  },
  {
    gruppe: "Ataxien / Gleichgewichtsstörungen",
    eintraege: [
      { code: "G11.9", name: "Zerebelläre Ataxie (hereditär, z. B. SCA)" },
      { code: "G11.1", name: "Friedreich-Ataxie" },
      { code: "G31.2", name: "Alkoholtoxische Kleinhirndegeneration" },
      { code: "H81.8", name: "Bilaterale Vestibulopathie" },
      { code: "H81.2", name: "Neuritis vestibularis" },
      { code: "H81.1", name: "Benigner paroxysmaler Lagerungsschwindel (BPLS)" },
      { code: "F45.8", name: "Funktioneller (phobischer) Schwankschwindel / PPPD" },
    ],
  },
  {
    gruppe: "Periphere Nerven- und Muskelerkrankungen",
    eintraege: [
      { code: "G62.9", name: "Polyneuropathie (unspezifisch)" },
      { code: "E11.40", name: "Diabetische Polyneuropathie" },
      { code: "G62.1", name: "Alkoholische Polyneuropathie" },
      { code: "G62.80", name: "Critical-Illness-Polyneuropathie / -Myopathie (CIP/CIM)" },
      { code: "E53.8", name: "Funikuläre Myelose (Vitamin-B12-Mangel)" },
      { code: "G71.0", name: "Muskeldystrophie" },
      { code: "G72.9", name: "Myopathie (sonstige)" },
    ],
  },
  {
    gruppe: "Sonstige",
    eintraege: [
      { code: "D43.2", name: "Hirntumor (Z. n. Resektion / Therapie)" },
      { code: "G40.9", name: "Epilepsie" },
      { code: "F44.4", name: "Funktionelle (dissoziative) Bewegungsstörung" },
      { code: "", name: "Sonstige Diagnose (Freitext)", freitext: true },
    ],
  },
];
