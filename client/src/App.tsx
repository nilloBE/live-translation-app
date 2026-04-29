import { Languages, Radio, Users } from "lucide-react";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";

export function App() {
  return (
    <main className="app-shell">
      <section className="panel intro-panel" aria-labelledby="app-title">
        <div className="brand-row">
          <span className="brand-mark" aria-hidden="true">
            <Languages size={28} />
          </span>
          <div>
            <p className="eyebrow">Phase 1 scaffold</p>
            <h1 id="app-title">Live Translation App</h1>
          </div>
        </div>
        <p className="lede">
          The frontend and backend foundations are ready for the Speech token broker,
          browser microphone translation, and audience captions in the next phases.
        </p>
      </section>

      <section className="workspace-grid" aria-label="Application areas">
        <article className="status-card">
          <Radio aria-hidden="true" />
          <h2>Speaker View</h2>
          <p>Microphone capture and translation controls land here in Phase 2.</p>
        </article>

        <article className="status-card">
          <Users aria-hidden="true" />
          <h2>Audience View</h2>
          <p>Live translated subtitles and room joining land here in Phase 3.</p>
        </article>
      </section>

      <section className="panel config-panel" aria-labelledby="config-title">
        <h2 id="config-title">Local Configuration</h2>
        <dl>
          <div>
            <dt>Backend API</dt>
            <dd>{apiBaseUrl}</dd>
          </div>
          <div>
            <dt>Translation pairs</dt>
            <dd>French to Dutch, Spanish to French</dd>
          </div>
          <div>
            <dt>Authentication</dt>
            <dd>Microsoft Entra ID via Azure CLI locally and managed identity in Azure</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
