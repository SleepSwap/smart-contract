const { ethers } = require('hardhat')
const { config } = require('../configs/config')

// deploy and verify accumulation contract
async function main() {
  const accumulationFactory = await ethers.getContractFactory('SleepSwapAccumulation')

  const deployParams = [
    config.accumulation.testnet.USDT,
    config.accumulation.testnet.ROUTER,
    config.accumulation.testnet.MIN_AMOUNT,
    config.accumulation.testnet.MIN_GRIDS,
    config.accumulation.testnet.MIN_PERCENT_CHANGE
  ]
  const accumulation = await accumulationFactory.deploy(...deployParams)
  await accumulation.deployed()
  console.log('Accumulation:', accumulation.address)

  await hre.run('verify:verify', {
    address: accumulation.address,
    constructorArguments: [...deployParams]
  })
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
