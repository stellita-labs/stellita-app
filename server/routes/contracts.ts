import { Router } from 'express'
import { requireUser } from '../middleware/auth.js'
import { listManifests, getManifest } from '../_lib/contracts.js'
import { deployContract } from '../_lib/deploy.js'
import { mintDemoTokens, DEMO_TOKEN_ID } from '../_lib/faucet.js'
import { mintNft, DEMO_NFT_ID } from '../_lib/nft.js'
import { errorResponse } from '../_lib/errors.js'

const router = Router()

// ─────────────────────────────────────────────────────────────────────────────
// Contract catalog
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/contracts — list all manifests */
router.get('/contracts', requireUser, async (_req, res) => {
  const manifests = await listManifests()
  res.json(manifests)
})

// ─────────────────────────────────────────────────────────────────────────────
// Deploy
// ─────────────────────────────────────────────────────────────────────────────

/** POST /api/projects/:id/deploy — deploy a contract and record it */
router.post('/projects/:id/deploy', requireUser, async (req, res) => {
  const { id } = req.params
  const {
    manifestId,
    config,
    deployerSecret,
  } = req.body as {
    manifestId?: string
    config?: Record<string, unknown>
    deployerSecret?: string
  }

  if (!manifestId) { res.status(400).json({ error: 'manifestId required' }); return }

  const manifest = await getManifest(manifestId)
  if (!manifest) { res.status(404).json({ error: 'manifest not found' }); return }

  const result = await deployContract({
    manifest,
    config: config ?? {},
    deployerSecret,
  })

  // Record in the project
  const { data, error } = await req.supabase
    .from('deployed_contracts')
    .insert({
      project_id: id,
      manifest_id: manifestId,
      name: manifest.name,
      category: manifest.category,
      contract_id: result.contractId,
      network: 'testnet',
      tx_hash: result.txHash,
      explorer_url: result.explorerUrl,
      deployer: result.deployer ?? null,
      config: config ?? {},
    })
    .select()
    .single()

  if (error) {
    errorResponse(res, 500, 'Failed to save deployed contract record', error, {
      route: 'POST /api/projects/:id/deploy',
      projectId: id,
    })
    return
  }
  res.json({ ...result, record: data })
})

// ─────────────────────────────────────────────────────────────────────────────
// Faucet
// ─────────────────────────────────────────────────────────────────────────────

/** POST /api/faucet — mint demo tokens to the caller's address */
router.post('/faucet', requireUser, async (req, res) => {
  const { address, amount } = req.body as { address?: string; amount?: number }
  if (!address) { res.status(400).json({ error: 'address required' }); return }

  const hash = await mintDemoTokens(address, amount, process.env.FAUCET_SECRET)
  res.json({ hash, tokenId: DEMO_TOKEN_ID })
})

// ─────────────────────────────────────────────────────────────────────────────
// NFT mint
// ─────────────────────────────────────────────────────────────────────────────

/** POST /api/mint-nft — mint a demo NFT to the caller's address */
router.post('/mint-nft', requireUser, async (req, res) => {
  const { address } = req.body as { address?: string }
  if (!address) { res.status(400).json({ error: 'address required' }); return }

  const result = await mintNft(address, process.env.FAUCET_SECRET)
  res.json({ ...result, nftId: DEMO_NFT_ID })
})

export default router
