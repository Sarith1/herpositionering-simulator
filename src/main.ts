import "./styles/main.css";

import { App } from "./app";

function bootstrap(): void {
    const root = document.getElementById("app");

    if (!root) {
        throw new Error("Root element #app kon niet worden gevonden.");
    }

    const app = new App(root);

    app.start();
}

bootstrap();
