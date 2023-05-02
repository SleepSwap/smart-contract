const { ethers } = require("hardhat");
const { toWei } = require("./helpers");

// prepare dummy contract data
async function deployFixture() {
  const usdtFact = await ethers.getContractFactory("FaucetToken");
  const usdtContract = await usdtFact.deploy();
  await usdtContract.deployed();

  const sleepFact = await ethers.getContractFactory("SleepToken");
  const sleepContract = await sleepFact.deploy();
  await sleepContract.deployed();

  await sleepContract.mint(toWei("1000000"));
  await usdtContract.mint(toWei("1000000"));

  console.log("usdt contrac ", usdtContract.address);
  const routerFactory = await ethers.getContractFactory("TestSwap");
  const routerContract = await routerFactory.deploy(
    usdtContract.address,
    sleepContract.address
  );
  await routerContract.deployed();

  // setup dummy swaps router with some tokens
  await sleepContract.approve(routerContract.address, toWei("1000000"));
  await routerContract.depositTokens(toWei("100000"));

  const accumulationFactory = await ethers.getContractFactory(
    "SleepSwapAccumulation"
  );

  const [owner, addr1, addr2] = await ethers.getSigners();

  const accumulationContract = await accumulationFactory.deploy(
    usdtContract.address,
    routerContract.address
  );

  await accumulationContract.deployed();

  await accumulationContract.enableTestMode();

  // Fixtures can return anything you consider useful for your tests
  return {
    accumulationContract,
    routerContract,
    usdtContract,
    sleepContract,
    owner,
    addr1,
    addr2,
  };
}

module.exports = { deployFixture };
