#Herpositionering Simulator

Browsergebaseerde ES Modules-simulator voor politievoertuigen, meldingen, celritten en automatische herpositionering. De applicatie gebruikt alleen statische HTML, CSS en JavaScript en blijft daardoor rechtstreeks geschikt voor GitHub Pages.

## Oorzaak van de oorspronkelijke knop-4-fout

De oude engine hield exact één `activeDispatch` bij en gebruikte daarnaast `simulator.maxIncidents = 5` als vaste sprintlimiet. Knop 4 zette het voertuig direct op één algemene `busy`-status en de UI blokkeerde vervolgens nieuwe meldingen zolang `activeDispatch` bestond. Daardoor raakten invoercyclus, melding, route en voertuigstatus snel uit sync: er was geen aparte fase voor rijden naar melding, rijden naar cel, tijdelijke celbezetting en terugkeer. Als een verwachte waarde ontbrak, kreeg de gebruiker alleen een algemene fout of blokkade in het activiteitenlog.

## Nieuwe multi-dispatcharchitectuur

De engine gebruikt nu twee beheerde verzamelingen:

- `activeDispatches: Map` voor alle lopende meldingsopdrachten.
- `activeRepositions: Map` voor alle automatische herpositioneringen.

Iedere dispatch bevat een uniek ID, voertuig-ID, melding-ID, fase, oorsprong, meldingsdistrict, gevangenisdistrict, routes, starttijden, berekende bezettijd en actuele routecoördinaten. De centrale `requestAnimationFrame`-loop werkt alle dispatches en herpositioneringen afzonderlijk bij. Hetzelfde voertuig kan niet tegelijk in meerdere opdrachten worden geplaatst.

Na een succesvolle klik op **4. Pak melding op** wordt de invoercyclus direct teruggezet naar stap 1. Het ingezette voertuig blijft zelfstandig doorrijden, terwijl de gebruiker meteen een nieuwe cyclus 1 → 2 → 3 → 4 kan starten.

## Voertuigfasen

Een melding doorloopt de volgende zichtbare voertuigflow:

1. `AVAILABLE` — voertuig staat op een vaste slotpositie rond het district.
2. `TO_INCIDENT` — dichtstbijzijnde beschikbare voertuig rijdt via het routenetwerk naar de melding.
3. `TO_PRISON` — na aankomst verdwijnt de melding en rijdt het voertuig door naar de geselecteerde cel.
4. `BUSY` — voertuig is 90–120 seconden tijdelijk niet beschikbaar bij de cel.
5. `RETURNING` — voertuig rijdt zichtbaar terug naar zijn actuele toegewezen standplaats.
6. `AVAILABLE` — voertuig telt weer mee voor districtdekking.

Voertuigen worden tijdens iedere frame-update op hun actuele SVG-viewBox-coördinaten getekend en draaien mee met de rijrichting.

## Automatische herpositionering

Zodra een inzet of andere statuswijziging een district zonder beschikbare voertuigen achterlaat, controleert de engine de dekking. Als aanvulling nodig is:

- worden alleen buurrelaties uit `data.js` gebruikt;
- mag een donor alleen afstaan wanneer er minimaal één beschikbaar voertuig overblijft;
- krijgt het district met de meeste beschikbare voertuigen voorrang;
- breken routeafstand en district-ID gelijke afwegingen;
- rijdt het gekozen voertuig zichtbaar als `REPOSITIONING` naar het doeldistrict;
- blijft `homeDistrict` ongewijzigd, maar verandert `district` bij aankomst naar het nieuwe dekkingsdistrict.

Als geen veilig donor-district beschikbaar is, toont de simulator **MISSION FAILED** en worden nieuwe invoercycli geblokkeerd tot reset.

## Kaart en layout

De achtergrondkaart (`assets/kaart_Eenheid_DEF.png`) heeft een natuurlijke resolutie van 4872 × 3530 pixels. De interactieve SVG-laag gebruikt één consistent coördinatensysteem met `viewBox="0 0 1100 800"`. Districtmarkeringen, labels, gevangenissen, meldingen en voertuigslots liggen binnen deze viewBox en schalen responsief mee met de kaartcontainer.

## Handmatige testinstructies

Open `index.html` rechtstreeks in een browser of serveer de map statisch, bijvoorbeeld met:

```bash
python3 -m http.server 8000
```

Voer daarna minimaal deze scenario's uit:

1. **Volledige enkele cyclus** — klik 1 → 2 → 3 → 4 en controleer melding, celrit, bezettijd en terugkeer.
2. **Parallelle meldingen** — start minimaal vijf cycli kort na elkaar en controleer dat vijf verschillende voertuigen tegelijk bezig zijn.
3. **Geen dubbel voertuig** — controleer in kaart en dashboard dat geen voertuig aan twee opdrachten gekoppeld raakt.
4. **Herpositionering** — maak herhaaldelijk meldingen in of rond hetzelfde district en controleer automatische aanvulling.
5. **Kaartgrenzen** — test desktopbreedte en een smaller venster; alle objecten moeten zichtbaar blijven.
6. **Reset onder belasting** — start meerdere dispatches en herpositioneringen, klik reset en controleer dat alle processen verdwijnen.
7. **Langdurige sessie** — handel minimaal 25 meldingen af; er is geen vaste limiet van vijf meldingen meer.

## Ontwikkelnotities

- Geen frameworks, npm, buildstap, Vite of TypeScript.
- Alle animaties lopen via één `requestAnimationFrame`-loop.
- Reset wist alle actieve dispatches, herpositioneringen, routes, timers, incidenten en UI-status.
