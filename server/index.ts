import express from 'express'
import path from 'node:path'
import fs from 'node:fs'
import { loadConfig, assetsDir, dataDir, distDir } from './config.ts'
import { createMapRouter } from './routes/map.ts'
import { createHousesRouter } from './routes/houses.ts'
import { createQuestMapRouter } from './routes/quests.ts'

const config = loadConfig()
const app = express()

// API routes
app.use('/api', createMapRouter(config))
app.use('/api', createHousesRouter(config))
app.use('/api', createQuestMapRouter(config))

// Serve client assets (appearances.dat, sprites, etc.)
app.use(express.static(assetsDir))
app.use('/sprites-png', express.static(assetsDir))

// Serve data files (materials, items.xml, etc.)
app.use('/data', express.static(dataDir))

// Serve built frontend
app.use(express.static(distDir))

// SPA fallback
app.get('*path', (_req, res) => {
  const indexPath = path.join(distDir, 'index.html')
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath)
  } else {
    res.status(404).send('Frontend not built. Run npm run build first.')
  }
})

app.listen(config.port, () => {
  console.log(`Server listening on http://localhost:${config.port}`)
  console.log(`  Map dir: ${config.mapDir}`)
  console.log(`  Quests: ${config.questsDir}`)
  console.log(`  Read-only: ${config.readOnly}`)
  console.log(`  Viewer allowed origins: ${config.viewerAllowedOrigins.length > 0 ? config.viewerAllowedOrigins.join(', ') : 'none configured (same-origin only)'}`)
  console.log(`  Houses:  ${config.housesUrl ?? 'not configured'}`)
})
