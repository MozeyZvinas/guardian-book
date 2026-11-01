import { existsSync } from 'node:fs'
import path from 'node:path'
import express, { Router } from 'express'

/**
 * Serves the built web app (`apps/web/dist`) with a single-page-app fallback: any GET that is
 * not `/api/...` and not a real file gets `index.html`. Hashed assets are cached for a year;
 * `index.html` is never cached, so a fresh tab always gets the current bundle.
 */
export function webStatic(distDir: string): Router {
  const router = Router()
  const indexPath = path.join(distDir, 'index.html')
  const hasBuild = existsSync(indexPath)

  if (hasBuild) {
    router.use(
      express.static(distDir, {
        index: false,
        setHeaders: (res, filePath) => {
          const assets = `${path.sep}assets${path.sep}`
          res.setHeader(
            'Cache-Control',
            filePath.includes(assets) ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
          )
        },
      }),
    )
  }

  router.get('/{*splat}', (req, res, next) => {
    if (req.path === '/api' || req.path.startsWith('/api/')) {
      next()
      return
    }
    if (!hasBuild) {
      res
        .status(503)
        .type('text/plain')
        .send('Guardian Book API is running, but the web build (apps/web/dist) is missing. Run `pnpm build`.')
      return
    }
    res.setHeader('Cache-Control', 'no-cache')
    res.sendFile(indexPath)
  })

  return router
}
