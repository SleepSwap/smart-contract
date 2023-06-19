const { ethers } = require("hardhat");
const {
  MIN_AMOUNT,
  MIN_GRIDS,
  MIN_PERCENT_CHANGE,
} = require("../test/helpers");

async function main() {
  const accumulationFactory = await ethers.getContractFactory(
    "SleepSwapAccumulation"
  );

  const usdtFaucet = "0xE118429D095de1a93951c67D04B523fE5cbAB62c";
  const routerAddress = "0xE592427A0AEce92De3Edee1F18E0157C05861564";

  const accumulation = await accumulationFactory.deploy(
    usdtFaucet,
    routerAddress,
    MIN_AMOUNT,
    MIN_GRIDS,
    MIN_PERCENT_CHANGE
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
