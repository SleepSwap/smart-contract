const { ethers } = require('hardhat')
const { config } = require('../configs/config')
const hre = require('hardhat')

// deploy and verify rsi contract
async function main() {
  const rsiFactory = await ethers.getContractFactory('SleepRSI')

  const deployParams = [
    config.rsi.testnet.USDT,
    config.rsi.testnet.ROUTER,
    config.rsi.testnet.MIN_AMOUNT,
    config.rsi.testnet.RSI_PERIOD,
    config.rsi.testnet.RSI_THRESHOLD
  ]
  const rsiContract = await rsiFactory.deploy(...deployParams)
  await rsiContract.deployed()

  console.log('Final deployed RSI contract:', rsiContract.address)
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
