// Compile and (optionally) deploy the HemiWyrmArcade contract to Hemi Sepolia.
//   node scripts/contract.mjs compile          -> writes src/chain/artifact.json
//   DEPLOYER_PRIVATE_KEY=0x... node scripts/contract.mjs deploy
//     -> deploys and writes the address into src/chain/deployment.json
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const require = createRequire(import.meta.url)
const solc = require('solc')
const SOURCE = 'contracts/HemiWyrmArcade.sol'
const ARTIFACT = 'src/chain/artifact.json'
const DEPLOYMENT = 'src/chain/deployment.json'

const hemiSepolia = {
  id: 743111,
  name: 'Hemi Sepolia',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://testnet.rpc.hemi.network/rpc'] } },
}

function compile() {
  const input = {
    language: 'Solidity',
    sources: { [SOURCE]: { content: readFileSync(SOURCE, 'utf8') } },
    settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: 'paris', outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } } },
  }
  const out = JSON.parse(solc.compile(JSON.stringify(input)))
  const errors = (out.errors ?? []).filter(e => e.severity === 'error')
  if (errors.length) {
    for (const e of errors) console.error(e.formattedMessage)
    process.exit(1)
  }
  const c = out.contracts[SOURCE].HemiWyrmArcade
  const artifact = { contractName: 'HemiWyrmArcade', compiler: solc.version(), abi: c.abi, bytecode: `0x${c.evm.bytecode.object}` }
  mkdirSync('src/chain', { recursive: true })
  writeFileSync(ARTIFACT, JSON.stringify(artifact, null, 2) + '\n')
  console.log(`compiled with ${artifact.compiler} -> ${ARTIFACT} (${(artifact.bytecode.length - 2) / 2} bytes)`)
  return artifact
}

async function deploy() {
  const artifact = compile()
  const key = process.env.DEPLOYER_PRIVATE_KEY
  if (!key) throw new Error('DEPLOYER_PRIVATE_KEY is required')
  const account = privateKeyToAccount(key)
  const transport = http(hemiSepolia.rpcUrls.default.http[0])
  const pub = createPublicClient({ chain: hemiSepolia, transport })
  const wallet = createWalletClient({ chain: hemiSepolia, transport, account })
  const balance = await pub.getBalance({ address: account.address })
  console.log(`deployer ${account.address} balance ${balance} wei`)
  const hash = await wallet.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode })
  console.log(`tx ${hash}`)
  const receipt = await pub.waitForTransactionReceipt({ hash })
  if (!receipt.contractAddress) throw new Error('deployment failed')
  writeFileSync(DEPLOYMENT, JSON.stringify({ chainId: hemiSepolia.id, address: receipt.contractAddress, txHash: hash, block: Number(receipt.blockNumber) }, null, 2) + '\n')
  console.log(`deployed at ${receipt.contractAddress}`)
}

const cmd = process.argv[2] ?? 'compile'
if (cmd === 'compile') compile()
else if (cmd === 'deploy') await deploy()
else throw new Error(`unknown command ${cmd}`)
