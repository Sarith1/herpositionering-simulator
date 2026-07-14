# 🚔 Politie Herpositionering Simulator

Interactieve GitHub Pages-simulator voor het oefenen met politievoertuigen, meldingen, dekking en automatische herpositionering tussen de zeven districten van de eenheid.

## Sprint 1.4

Sprint 1.4 voegt automatische herpositionering en dekkingsfalen toe. Na iedere dispatch, terugkeer en herpositionering controleert de engine hoeveel beschikbare voertuigen ieder district heeft:

- groen: 2 of meer beschikbare voertuigen;
- oranje: precies 1 beschikbaar voertuig;
- rood: 0 beschikbare voertuigen.

Het dashboard toont live beschikbaarheid, onderweg, herpositionerend, tijdelijk bezet, open meldingen, afgehandelde meldingen en het dekkingspercentage. Dekking is het percentage districten met minimaal één beschikbaar voertuig.

## Herpositioneringslogica

Wanneer een district geen beschikbaar voertuig meer heeft, zoekt de simulator automatisch een donor in de aangrenzende districten uit `data.js`.

De donorselectie is voorspelbaar:

1. kies het aangrenzende district met de meeste beschikbare voertuigen;
2. kies bij gelijke beschikbaarheid de kortste route;
3. kies bij verdere gelijkstand op district-ID.

Een donor mag alleen een voertuig afstaan als het donor-district daarna minimaal één beschikbaar voertuig overhoudt. Het gekozen voertuig krijgt de centrale status `repositioning`, rijdt zichtbaar over de bestaande SVG-overlay naar het lege district en krijgt na aankomst weer de status `available`. `homeDistrict` blijft ongewijzigd, zodat de oorspronkelijke herkomst behouden blijft.

De engine ondersteunt kettingherpositionering tot maximaal zeven stappen per controlecyclus en houdt verwerkte districten bij om loops te voorkomen. Als geen veilige aanvulling mogelijk is, stopt de simulator met een rood `MISSION FAILED`-scherm en kan de gebruiker via **Opnieuw beginnen** volledig resetten.

## Bediening

Gebruik de vaste knopvolgorde:

1. **Melding** — maakt een willekeurige melding aan.
2. **Cel** — selecteert een gevangenisdistrict.
3. **Reistijd** — berekent 90 t/m 120 seconden op basis van routeafstand.
4. **Pak melding op** — selecteert het dichtstbijzijnde beschikbare voertuig en start de dispatch.

Na stap 4 kan direct een nieuwe melding worden gestart. Eerder ingezette voertuigen kunnen tegelijkertijd tijdelijk bezet blijven en worden niet opnieuw geselecteerd zolang ze niet beschikbaar zijn.

## Handmatig testen

Open `index.html` rechtstreeks of via GitHub Pages en test minimaal:

1. maak herhaaldelijk meldingen in hetzelfde district totdat automatisch een aangrenzend voertuig bijspringt;
2. controleer dat een aangrenzend district met slechts één beschikbaar voertuig geen donor wordt;
3. creëer een kettingreactie waarbij een tweede donor een leeggevallen donor-district aanvult;
4. bezet zoveel voertuigen dat een district niet meer veilig kan worden aangevuld en controleer het rode `MISSION FAILED`-scherm;
5. handel meerdere meldingen achter elkaar af voordat eerdere voertuigen terugkomen;
6. klik **Opnieuw beginnen** en controleer dat alle 21 voertuigen beschikbaar zijn en de dekking 100% is.

## Techniek

- HTML
- CSS
- JavaScript ES Modules
- SVG
- Geen buildstap
- Geen Node/npm/Vite/TypeScript/framework/externe libraries in de applicatie

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

## Bekende beperkingen

- Meldingen en gevangenissen worden willekeurig gekozen; er is nog geen handmatige districtselectie.
- De routetijden zijn gesimuleerd en gebaseerd op het aantal route-segmenten, niet op echte verkeersdata.
- Mission-failed-scenario's vragen in de normale UI meerdere dispatches omdat ieder district met drie voertuigen start.

## Auteur

Sarith Breedijk

Ontwikkeld met ondersteuning van ChatGPT.
