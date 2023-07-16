const { ethers } = require('hardhat')
const { config } = require('../configs/config')
const hre = require('hardhat')

// deploy and verify rsi contract
async function main() {
  const deployParams = [
    config.rsi.testnet.USDT,
    config.rsi.testnet.ROUTER,
    config.rsi.testnet.MIN_AMOUNT,
    config.rsi.testnet.RSI_PERIOD,
    config.rsi.testnet.RSI_THRESHOLD
  ]

  // verify rsi contract
  const deployedAddress = '0x6fadf9beBE9F4e76D33866fC7bbB700EB7E48824'

  await hre.run('verify:verify', {
    address: deployedAddress,
    constructorArguments: [...deployParams]
  })
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
