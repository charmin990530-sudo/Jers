import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
    selector: 'app-not-found',
    imports: [RouterLink],
    template: `
        <section class="no-encontrado">
            <p class="codigo">404</p>
            <h1>Esta página no existe</h1>
            <p>Puede que el enlace haya cambiado o que el producto ya no esté disponible.</p>
            <div class="acciones">
                <a class="btn" routerLink="/">Volver al inicio</a>
                <a class="btn secundario" routerLink="/catalogo/maquillaje">Ver catálogo</a>
            </div>
        </section>
    `,
    styles: `
        .no-encontrado {
            display: grid;
            justify-items: center;
            gap: var(--space-3);
            max-width: 720px;
            margin: var(--space-24) auto;
            padding: var(--space-8) var(--space-4);
            text-align: center;
        }

        .codigo {
            font-family: var(--font-display);
            font-size: clamp(5rem, 3rem + 10vw, 10rem);
            line-height: 0.8;
            color: var(--accent);
        }

        h1 {
            font-size: clamp(1.8rem, 1.4rem + 2vw, 2.8rem);
        }

        p {
            max-width: 46ch;
            color: var(--text-muted);
        }

        .acciones {
            display: flex;
            flex-wrap: wrap;
            justify-content: center;
            gap: var(--space-3);
            margin-top: var(--space-4);
        }

        .btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: var(--space-3) var(--space-5);
            border: 1px solid var(--text);
            border-radius: var(--radius-full);
            background: var(--text);
            color: var(--bg);
            font-size: 0.85rem;
            font-weight: 700;
            text-decoration: none;
        }

        .btn.secundario {
            background: transparent;
            color: var(--text);
            border-color: var(--line);
        }
    `,
})
export class NotFound {}
