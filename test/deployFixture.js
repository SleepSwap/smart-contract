const { ethers } = require("hardhat");
const {
  toWei,
  MIN_AMOUNT,
  MIN_GRIDS,
  MIN_PERCENT_CHANGE,
  MIN_TRADE_AMOUNT,
  MIN_AMOUNT_DCA,
} = require("./helpers");

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
    "SleepSwapAccumulationTest"
  );

  const [owner, addr1, addr2] = await ethers.getSigners();

  const accumulationContract = await accumulationFactory.deploy(
    usdtContract.address,
    routerContract.address,
    MIN_AMOUNT,
    MIN_GRIDS,
    MIN_PERCENT_CHANGE
  );

  await accumulationContract.deployed();

  const dcaFactory = await ethers.getContractFactory(
    "SleepSwapDcaWithTestSwap"
  );
  const dcaContract = await dcaFactory.deploy(
    usdtContract.address,
    routerContract.address,
    MIN_AMOUNT_DCA,
    MIN_TRADE_AMOUNT
  );
  const SEC_IN_HR = 3600;
  await dcaContract.deployed();
  // Fixtures can return anything you consider useful for your tests
  return {
    accumulationContract,
    dcaContract,
    routerContract,
    usdtContract,
    sleepContract,
    owner,
    addr1,
    addr2,
    MIN_AMOUNT_DCA,
    SEC_IN_HR
  };
}

module.exports = { deployFixture };
