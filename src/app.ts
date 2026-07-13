export class App {
    private readonly root: HTMLElement;

    constructor(root: HTMLElement) {
        this.root = root;
    }

    public start(): void {
        this.render();
        this.registerEvents();

        console.info("🚔 Politie Herpositionering Simulator gestart.");
    }

    private render(): void {
        this.root.innerHTML = `
            <div class="simulator">

                <header class="topbar">
                    <div class="logo">
                        🚔 Politie Herpositionering Simulator
                    </div>

                    <div class="dashboard">

                        <div class="dashboard-card">
                            <span class="value">21</span>
                            <span class="label">Beschikbaar</span>
                        </div>

                        <div class="dashboard-card">
                            <span class="value">0</span>
                            <span class="label">Onderweg</span>
                        </div>

                        <div class="dashboard-card">
                            <span class="value">0</span>
                            <span class="label">Open meldingen</span>
                        </div>

                        <div class="dashboard-card">
                            <span class="value">100%</span>
                            <span class="label">Dekking</span>
                        </div>

                    </div>
                </header>

                <main class="workspace">

                    <aside class="sidebar">

                        <h2>Activiteiten</h2>

                        <div class="log">

                            <div class="log-item">
                                <span class="time">09:00</span>
                                <span>Simulator gestart</span>
                            </div>

                            <div class="log-item">
                                <span class="time">09:00</span>
                                <span>21 voertuigen beschikbaar</span>
                            </div>

                        </div>

                    </aside>

                    <section class="map-container">

                        <div class="map-placeholder">

                            <h2>Kaart</h2>

                            <p>
                                Plaats later:
                                <br>
                                assets/kaart_Eenheid_DEF.png
                            </p>

                            <div class="district-grid">

                                <div class="district">
                                    Rijnmond-Noord
                                </div>

                                <div class="district">
                                    Zeehaven
                                </div>

                                <div class="district">
                                    Rotterdam-Stad
                                </div>

                                <div class="district">
                                    Rijnmond-Oost
                                </div>

                                <div class="district">
                                    Rotterdam-Zuid
                                </div>

                                <div class="district">
                                    Rijnmond-Zuidwest
                                </div>

                                <div class="district">
                                    Zuid-Holland-Zuid
                                </div>

                            </div>

                        </div>

                    </section>

                    <aside class="status-panel">

                        <h2>Status</h2>

                        <ul>

                            <li>🟢 Rijnmond-Noord</li>
                            <li>🟢 Zeehaven</li>
                            <li>🟢 Rotterdam-Stad</li>
                            <li>🟢 Rijnmond-Oost</li>
                            <li>🟢 Rotterdam-Zuid</li>
                            <li>🟢 Rijnmond-Zuidwest</li>
                            <li>🟢 Zuid-Holland-Zuid</li>

                        </ul>

                    </aside>

                </main>

                <footer class="toolbar">

                    <button id="incidentBtn">
                        1. Melding
                    </button>

                    <button id="prisonBtn">
                        2. Cel
                    </button>

                    <button id="travelBtn">
                        3. Reistijd
                    </button>

                    <button id="dispatchBtn">
                        4. Pak melding op
                    </button>

                </footer>

            </div>
        `;
    }

    private registerEvents(): void {

        const buttons = this.root.querySelectorAll("button");

        buttons.forEach(button => {

            button.addEventListener("click", () => {

                console.log(`${button.id} geklikt`);

            });

        });

    }
}
