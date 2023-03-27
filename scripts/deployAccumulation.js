const { ethers } = require("hardhat");

async function main() {
  const sleepFactory = await ethers.getContractFactory("SleepSwapAccumulation");
  const fiat_contract = "0xBDf3e573F6d28d0F96Ad60a34529e88D82501135";
  const router_contract = "0xE592427A0AEce92De3Edee1F18E0157C05861564";

  const sleep = await sleepFactory.deploy(fiat_contract, router_contract);
  await sleep.deployed();
  console.log("sleepswap trading contract deployed to:", sleep.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
