const { ethers } = require("hardhat");

async function main() {
  const faucetFactory = await ethers.getContractFactory("FaucetToken");

  // Deploying faucet contract
  const faucet = await faucetFactory.deploy();
  await faucet.deployed();
  console.log("Faucet:", faucet.address);
  let faucetContract = faucet.address;

  const sleepFactory = await ethers.getContractFactory("SleepToken");
  // Deploying sleep contract
  const sleep = await sleepFactory.deploy();
  await sleep.deployed();
  console.log("SleepToken:", sleep.address);
  let sleepContract = sleep.address;

  const accumulationFactory = await ethers.getContractFactory(
    "SleepSwapAccumulation"
  );

  const fiat_contract = faucetContract;
  // const fiat_contract = "0xBDf3e573F6d28d0F96Ad60a34529e88D82501135";
  const router_contract = "0xE592427A0AEce92De3Edee1F18E0157C05861564";

  const accumulation = await accumulationFactory.deploy(
    fiat_contract,
    router_contract
  );
  await accumulation.deployed();
  console.log("Accumulation:", accumulation.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
