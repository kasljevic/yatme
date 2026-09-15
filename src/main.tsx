import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/theme.css'
import App from './App.tsx'
import { QuestViewer } from './QuestViewer.tsx'
import { parseViewerModeSearch } from './lib/questSlug.ts'

const viewerMode = parseViewerModeSearch(window.location.search)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {viewerMode.mode === 'quest'
      ? <QuestViewer quest={viewerMode.quest} />
      : viewerMode.mode === 'invalid-quest'
        ? (
          <main className="flex h-screen w-screen items-center justify-center bg-void">
            <section className="panel max-w-[400px] p-10 text-center" role="alert">
              <div className="mb-3 font-display text-lg font-semibold text-danger">
                Invalid quest viewer link
              </div>
              <p className="font-mono text-sm text-fg-muted">{viewerMode.reason}</p>
            </section>
          </main>
        )
        : <App />}
  </StrictMode>,
)
