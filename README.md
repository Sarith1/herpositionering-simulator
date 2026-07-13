# 🚔 Politie Herpositionering Simulator

Een interactieve trainingssimulator voor het visualiseren van de herpositionering van politievoertuigen tussen districten.

> **Status:** In ontwikkeling (v0.1)

---

# Doel

Deze simulator ondersteunt trainingen en workshops waarin deelnemers inzicht krijgen in de gevolgen van voertuigverplaatsingen, dekking en capaciteitsverdeling tussen politiedistricten.

---

# Functionaliteiten (Roadmap)

## Sprint 1
- [x] Projectstructuur
- [x] Dashboard
- [x] Activiteitenlog
- [x] Statuspaneel
- [x] Kaartcontainer
- [x] Donkere meldkamerstijl

## Sprint 2
- [ ] Achtergrondkaart
- [ ] 7 districten
- [ ] SVG-overlay
- [ ] Politievoertuigen
- [ ] Animatie-engine

## Sprint 3
- [ ] Melding genereren
- [ ] Gevangenis selecteren
- [ ] Reistijd berekenen
- [ ] Automatische dispatch

## Sprint 4
- [ ] Slimme herpositionering
- [ ] Dekkingscontrole
- [ ] Mission Failed

## Sprint 5
- [ ] Score
- [ ] Statistieken
- [ ] Meerdere meldingen
- [ ] Moeilijkheidsgraden

---

# Districten

De simulator gebruikt de volgende districten:

- Rijnmond-Noord
- Zeehaven
- Rotterdam-Stad
- Rijnmond-Oost
- Rotterdam-Zuid
- Rijnmond-Zuidwest
- Zuid-Holland-Zuid

---

# Techniek

Het project wordt gebouwd met:

- TypeScript
- Vite
- HTML5
- CSS3
- SVG
- requestAnimationFrame()

---

# Projectstructuur

```
src/
│
├── engine/
├── models/
├── ui/
├── services/
├── styles/
└── assets/
```

---

# Installatie

```bash
npm install
npm run dev
```

Open vervolgens:

```
http://localhost:5173
```

---

# Ontwikkelprincipes

Bij de ontwikkeling gelden de volgende uitgangspunten:

- Simulatielogica en gebruikersinterface zijn volledig gescheiden.
- De simulator maakt gebruik van een game-loop (`requestAnimationFrame`) voor vloeiende animaties.
- Alle kaartobjecten worden als SVG boven op de kaart weergegeven.
- Nieuwe functionaliteit wordt toegevoegd zonder bestaande code te herschrijven.
- Iedere sprint levert een volledig werkende versie op.

---

# Roadmap

| Versie | Omschrijving |
|---------|--------------|
| v0.1 | Foundation |
| v0.2 | Kaart & voertuigen |
| v0.3 | Meldingen |
| v0.4 | Routering |
| v0.5 | Herpositionering |
| v1.0 | Complete simulator |

---

# Auteur

Sarith Breedijk

Ontwikkeld met ondersteuning van ChatGPT.
