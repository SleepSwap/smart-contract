import { ethers } from "hardhat";

async function main() {
  const sleepFactory = await ethers.getContractFactory("SleepSwap");
  const sleep = await sleepFactory.deploy();
  await sleep.deployed();
  console.log("sleepswap trading contract deployed to:", sleep.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
