import type { FC } from "hono/jsx";
import { Layout } from "./layout";

export const NotFoundPage: FC = () => {
  return (
    <Layout title="404 — Nicht gefunden">
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 40vh; text-align: center;">
        <div style="font-family: var(--font-mono); font-size: 4rem; font-weight: 700; color: var(--color-border); margin-bottom: 1rem;">404</div>
        <h1 style="font-size: 1.38rem; margin-bottom: 0.62rem;">Seite nicht gefunden</h1>
        <p style="color: var(--color-muted); margin-bottom: 1.85rem;">Die angeforderte Seite existiert nicht.</p>
        <a href="/" style="padding: 0.62rem 1.23rem; background: var(--color-ink); color: var(--color-page); border-radius: 0.46rem; font-weight: 600; text-decoration: none;">
          Zurück zum Dashboard
        </a>
      </div>
    </Layout>
  );
};
