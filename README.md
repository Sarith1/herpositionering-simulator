# 🚔 Politie Herpositionering Simulator

Interactieve, GitHub Pages-compatibele trainingssimulator voor het oefenen met politiedekking, dispatch, gevangenisritten en herpositionering tussen districten in de eenheid Rotterdam.

> **Status:** Sprint 1.5 afgerond — eerste bruikbare trainingsversie.

---

## Doel

De simulator ondersteunt trainingen en workshops waarin deelnemers direct zien wat een melding, voertuigkeuze en herpositionering doen met regionale dekking en responstijden.

---

## Sprint 1.5 functionaliteit

- Live dashboard met beschikbare voertuigen, ritstatussen, open en afgehandelde meldingen, dekking, gemiddelde responstijd, gemiddelde gevangenisrit, herpositioneringen en simulatietijd.
- Professionelere SVG-kaart met duidelijke routes, districtlabels, dekkingsringen, voertuigschaduw, blauwe zwaailichten en pulserende incidentmarkers.
- Vloeiende voertuiganimaties met easing en rotatie in rijrichting.
- Gevangenissen lichten goud op wanneer geselecteerd.
- Blauwe bewegingslijnen voor herpositioneringen.
- Mission Failed-scherm met rode fade-in.
- Reset met schone herinitialisatie van voertuigen, timers, kaart en statistieken.
- Professioneel activiteitenlog met tijd, categorie en bericht; nieuwste regels staan bovenaan en het log is begrensd op 100 regels.
- Instellingenpaneel voor voertuigen per district, animaties, activiteitenlog, routeweergave en voertuig-ID's.
- Apart statistiekenpaneel met sessiestatistieken.
- Ondersteuning voor meerdere voertuigen die tegelijk rijden of herpositioneren.
- Extra foutafhandeling tegen dubbele dispatch, dubbele timers, ontbrekende elementen en null-referenties.

---

## Districten

- Rijnmond-Noord
- Zeehaven
- Rotterdam-Stad
- Rijnmond-Oost
- Rotterdam-Zuid
- Rijnmond-Zuidwest
- Zuid-Holland-Zuid

Zeehaven en Rotterdam-Stad zijn gevangenisdistricten.

---

## Instellingen

Het instellingenpaneel biedt:

| Instelling | Opties | Effect |
| --- | --- | --- |
| Aantal voertuigen per district | 1, 2, 3, 4 | Reset de vloot en plaatst voertuigen opnieuw rond ieder district. |
| Animaties | Aan/Uit | Schakelt CSS/SVG-animaties en rijduurvisualisatie aan of uit. |
| Activiteitenlog | Aan/Uit | Nieuwe logregels worden wel of niet toegevoegd. |
| Routeweergave | Aan/Uit | Toont of verbergt actieve rijroutes. |
| Toon voertuig-ID's | Aan/Uit | Toont of verbergt labels zoals `RN-01`. |
| Reset simulator | Knop | Zet sessie, kaart, timers, meldingen, voertuigen en statistieken terug. |

---

## Statistieken

Tijdens de sessie worden bijgehouden:

- Totaal aantal meldingen
- Gemiddelde responstijd
- Gemiddelde gevangenisrit
- Aantal herpositioneringen
- Langste herpositioneringsketen
- Aantal Mission Failed-situaties
- Totale simulatietijd

---

## Gebruik

1. Klik **1. Melding** om een melding in een willekeurig district te maken.
2. Klik **2. Cel** om automatisch de dichtstbijzijnde gevangenis te selecteren.
3. Klik **3. Reistijd** om de gevangenisrit te berekenen.
4. Klik **4. Pak melding op** om het dichtstbijzijnde beschikbare voertuig te dispatchen.
5. Na afronding wordt knop 1 automatisch weer bruikbaar voor een nieuwe melding.

---

## Techniek

Het project gebruikt bewust een eenvoudige front-endarchitectuur zonder buildstap:

- HTML5
- CSS3
- JavaScript ES Modules
- SVG-overlay
- `requestAnimationFrame()` voor animatie-updates
- Geen frameworks
- Geen bundler
- Geschikt voor GitHub Pages

---

## Projectstructuur

```text
.
├── assets/
│   └── kaart_Eenheid_DEF.png
├── css/
│   └── main.css
├── js/
│   ├── app.js
│   ├── data.js
│   ├── engine.js
│   ├── map.js
│   ├── routing.js
│   └── ui.js
├── index.html
└── README.md
```

---

## Lokaal testen

Er is geen installatie of build nodig. Start een statische server vanuit de repositoryroot:

```bash
python3 -m http.server 8080
```

Open daarna:

```text
http://localhost:8080
```

### Handmatige testscenario's Sprint 1.5

- Voer 25 opeenvolgende meldingen uit met de knoppen 1 t/m 4.
- Start nieuwe meldingen na afronding en controleer dat knop 1 opnieuw werkt.
- Verlaag voertuigen per district naar 1 om herpositionering en Mission Failed sneller te kunnen controleren.
- Controleer meerdere gelijktijdige voertuigbewegingen door herpositionering tijdens dispatch te laten lopen.
- Zet animaties uit en aan.
- Zet routeweergave uit en aan.
- Zet voertuig-ID's uit en aan.
- Zet activiteitenlog uit en aan.
- Voer een volledige reset uit en controleer dat voertuigen, dashboard en statistieken opnieuw beginnen.
- Controleer in de browserconsole dat er geen errors verschijnen.

---

## Screenshots

Plaatsaanduidingen voor projectdocumentatie:

- `docs/screenshots/sprint-1-5-dashboard.png` — live dashboard en instellingenpaneel.
- `docs/screenshots/sprint-1-5-map.png` — kaart met routes, dekkingsringen en voertuigen.
- `docs/screenshots/sprint-1-5-mission-failed.png` — Mission Failed-overlay.

---

## Bekende beperkingen

- De kaart gebruikt vereenvoudigde districtcoördinaten en geen echte wegdata.
- Melding-, gevangenis- en reistijdkeuzes zijn simulatiemodellen en geen operationele adviezen.
- Browserhandelingen blijven nodig voor volledige visuele validatie.

---

## Aanbevelingen Sprint 2

- Scenario-editor voor trainingsleiders.
- Moeilijkheidsgraden en vooraf gedefinieerde oefeningen.
- Persistente rapportage/export van sessiestatistieken.
- Uitgebreidere routeweging met verkeersdrukte en prioriteitsritten.
- Toegankelijkheidscontrole en keyboard-only bediening.

---

## Auteur

Sarith Breedijk

Ontwikkeld met ondersteuning van ChatGPT.
