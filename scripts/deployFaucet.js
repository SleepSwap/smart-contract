const { ethers } = require("hardhat");

async function main() {
  const faucetFactory = await ethers.getContractFactory("FaucetToken");

  // Deploying faucet contract
  const faucet = await faucetFactory.deploy();
  await faucet.deployed();
  console.log("USDT Faucet:", faucet.address);
  // const faucetContract = faucet.address;

  const sleepFactory = await ethers.getContractFactory("SleepToken");
  // Deploying sleep contract
  const sleep = await sleepFactory.deploy();
  await sleep.deployed();
  console.log("SleepToken Faucet:", sleep.address);
  // const sleepContract = sleep.address;
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
