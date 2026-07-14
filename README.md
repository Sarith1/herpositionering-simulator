# 🚔 Politie Herpositionering Simulator

Interactieve GitHub Pages-simulator voor het oefenen van politiedispatch en herpositionering binnen zeven districten.

## Sprint 1.3

Deze versie werkt zonder buildstap en gebruikt alleen:

- HTML
- CSS
- JavaScript ES Modules
- SVG
- de bestaande kaartafbeelding `assets/kaart_Eenheid_DEF.png`

## Functionaliteit

- 7 districten met ieder 3 politievoertuigen (21 totaal).
- Bedieningsknoppen werken uitsluitend in de volgorde 1 → 2 → 3 → 4.
- Knop 1 plaatst een boef in een willekeurig district.
- Knop 2 selecteert en markeert willekeurig één van de beschikbare gevangenissen.
- Knop 3 berekent een reistijd van 90 tot en met 120 seconden op basis van de kortste route naar de geselecteerde gevangenis.
- Knop 4 kiest het dichtstbijzijnde beschikbare voertuig, animeert dit naar de melding, verwijdert boef en voertuig tijdelijk en laat het voertuig daarna terugkeren.
- Dashboard, districtstatus en activiteitenlog worden live bijgewerkt.
- Alle interactieve kaartobjecten worden getekend in een SVG-overlay boven de bestaande kaart.

## Districten

- Rijnmond-Noord
- Zeehaven
- Rotterdam-Stad
- Rijnmond-Oost
- Rotterdam-Zuid
- Rijnmond-Zuidwest
- Zuid-Holland-Zuid

## Projectstructuur

```text
index.html
css/main.css
js/app.js
js/data.js
js/engine.js
js/map.js
js/routing.js
js/ui.js
assets/kaart_Eenheid_DEF.png
README.md
```

## Lokaal draaien

Er is geen installatie of bundler nodig. Open `index.html` direct in een browser of start een eenvoudige statische server:

```bash
python3 -m http.server 8000
```

Open daarna:

```text
http://localhost:8000
```

## GitHub Pages

Omdat alle paden relatief zijn en er geen buildproces nodig is, kan de repository rechtstreeks via GitHub Pages worden gepubliceerd.
