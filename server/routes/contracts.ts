import { Router } from 'express'
import { StrKey } from '@stellar/stellar-sdk'
import { requireUser } from '../middleware/auth.js'
import { listManifests, getManifest } from '../_lib/contracts.js'
import { deployContract } from '../_lib/deploy.js'
import { mintDemoTokens, DEMO_TOKEN_ID } from '../_lib/faucet.js'
import { mintNft, DEMO_NFT_ID } from '../_lib/nft.js'
import { errorResponse } from '../_lib/errors.js'
import { logger } from '../_lib/logger.js'

const router = Router()

/**
 * Neutral client-facing message for an unconfigured faucet. Deliberately names
 * no environment variable — an unconfigured deployment is not a server bug, and
 * the response must not advertise which secret is missing. The detailed reason
 * goes to the server log only.
 */
const FAUCET_UNAVAILABLE = 'the testnet faucet is unavailable'

/** Validate a Stellar account (G…) address using the same StrKey parser the SDK
 *  uses internally, so a malformed address is rejected before any mint attempt. */
function isValidAddress(address: string): boolean {
  return StrKey.isValidEd25519PublicKey(address)
}

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
  if (!isValidAddress(address)) {
    res.status(400).json({ error: 'invalid Stellar address' })
    return
  }

  // Validate configuration AFTER the request body, so a malformed address is a
  // 400 regardless of deployment state. An unconfigured faucet is a 503 (the
  // service is unavailable), not a 500.
  const secret = process.env.FAUCET_SECRET
  if (!secret) {
    logger.error('[faucet] FAUCET_SECRET is not set; refusing to mint demo tokens')
    res.status(503).json({ error: FAUCET_UNAVAILABLE })
    return
  }

  const hash = await mintDemoTokens(address, amount, secret)
  res.json({ hash, tokenId: DEMO_TOKEN_ID })
})

// ─────────────────────────────────────────────────────────────────────────────
// NFT mint
// ─────────────────────────────────────────────────────────────────────────────

/** POST /api/mint-nft — mint a demo NFT to the caller's address */
router.post('/mint-nft', requireUser, async (req, res) => {
  const { address } = req.body as { address?: string }
  if (!address) { res.status(400).json({ error: 'address required' }); return }
  if (!isValidAddress(address)) {
    res.status(400).json({ error: 'invalid Stellar address' })
    return
  }

  const secret = process.env.FAUCET_SECRET
  if (!secret) {
    logger.error('[mint-nft] FAUCET_SECRET is not set; refusing to mint the demo NFT')
    res.status(503).json({ error: FAUCET_UNAVAILABLE })
    return
  }

  const result = await mintNft(address, secret)
  res.json({ ...result, nftId: DEMO_NFT_ID })
})

export default router
