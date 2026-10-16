/** Hemi mainnet: the only network the game talks to. */
import { defineChain } from 'viem'

export const HEMI = defineChain({
  id: 43111,
  name: 'Hemi',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.hemi.network/rpc'] } },
  blockExplorers: { default: { name: 'Hemi Explorer', url: 'https://explorer.hemi.xyz' } },
})

/** Human label shown in the UI. */
export const NETWORK_LABEL = `Hemi Mainnet · chainId ${HEMI.id}`
/** Where players can bridge ETH to Hemi. */
export const BRIDGE_URL = 'https://app.hemi.xyz/'
