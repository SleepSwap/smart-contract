const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");
const BigNumber = require("bignumber.js");

// const usdtFaucet = "0xE118429D095de1a93951c67D04B523fE5cbAB62c";
// const routerAddress = "0xE592427A0AEce92De3Edee1F18E0157C05861564"; // unswap router
// const sleepToken = "0xb94d207a3fBdb312cef2e5dBEb7C22A76516BE37";

// test cases for the contract

// -> only managers accounts can execute orders

// -> only owner account can run emergency functions

// -> emergeyncy contract funds withdraw functions:emergencyWithdrawPoolTokens, emergencyWithdrawPoolUsdt  from pool without any pending orders

// -> emergeyncy contract funds withdraw functions:emergencyWithdrawPoolTokens, emergencyWithdrawPoolUsdt, emergencyWithdrawByOrderId  from pool with  pending orders

describe("Accumulation contract ", function () {
  // prepare dummy contract data
  async function deployFixture() {
    const usdtFact = await ethers.getContractFactory("FaucetToken");
    const usdtContract = await usdtFact.deploy();
    await usdtContract.deployed();

    const sleepFact = await ethers.getContractFactory("SleepToken");
    const sleepContract = await sleepFact.deploy();
    await sleepContract.deployed();

    await sleepContract.mint("1000000000000");
    await usdtContract.mint("1000000000000");

    console.log("usdt contrac ", usdtContract.address);
    const routerFactory = await ethers.getContractFactory("TestSwap");
    const routerContract = await routerFactory.deploy(
      usdtContract.address,
      sleepContract.address
    );
    await routerContract.deployed();

    // setup dummy swaps router with some tokens
    await sleepContract.approve(routerContract.address, "1000000000000");
    await routerContract.depositTokens("100000");

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

  it("Deployer must be the owner ", async function () {
    const { accumulationContract, owner } = await loadFixture(deployFixture);

    const isManager = await accumulationContract.managers(owner.address);
    expect(isManager.toString()).to.equal("1");
  });
  it("New address must not be the owner", async function () {
    const { accumulationContract, addr1 } = await loadFixture(deployFixture);

    const isManager = await accumulationContract.managers(addr1.address);
    expect(isManager.toString()).to.equal("0");
  });

  it("Add manager", async function () {
    const { accumulationContract, addr1 } = await loadFixture(deployFixture);

    await accumulationContract.addManager(addr1.address);

    const isAddr1Manager = await accumulationContract.managers(addr1.address);
    expect(isAddr1Manager.toString()).to.equal("1");
  });

  it("new account can start strategy", async function () {
    const { sleepContract, addr1, accumulationContract, usdtContract } =
      await loadFixture(deployFixture);

    await usdtContract.transfer(addr1.address, "1000");
    await usdtContract
      .connect(addr1)
      .approve(accumulationContract.address, "1000");

    await accumulationContract
      .connect(addr1)
      .invest("100", 5, 10, 10, sleepContract.address);
    const userOrder = await accumulationContract.orders(1);

    // console.log("deposit order ", {
    //   deposit: userOrder?.depositAmount?.toString(),
    // });
    // console.log(userOrder?.toString());
    expect(userOrder?.orderId?.toString()).to.equal("1");
    expect(userOrder?.user?.toString()).to.equal(addr1.address);
    expect(userOrder?.tokenAddress?.toString()).to.equal(sleepContract.address);
    expect(userOrder?.entryPrice?.toString()).to.equal("10");
    expect(userOrder?.prevPrice?.toString()).to.equal("10");
    expect(userOrder?.depositAmount?.toString()).to.equal("100");
    expect(userOrder?.remainingAmount?.toString()).to.equal("100");
    expect(userOrder?.fiatOrderAmount?.toString()).to.equal("20");
    expect(userOrder?.tokenAccumulated?.toString()).to.equal("0");
    expect(userOrder?.grids?.toString()).to.equal("5");
    expect(userOrder?.percentage?.toString()).to.equal("10");
    expect(userOrder?.executedGrids?.toString()).to.equal("0");
    expect(userOrder?.open?.toString()).to.equal("true");
  });

  it("fail when non  manager  execute orders", async function () {
    const { sleepContract, addr1, accumulationContract, usdtContract, addr2 } =
      await loadFixture(deployFixture);

    await usdtContract.transfer(addr1.address, "1000");
    await usdtContract
      .connect(addr1)
      .approve(accumulationContract.address, "1000");

    await accumulationContract
      .connect(addr1)
      .invest("100", 5, 10, 10, sleepContract.address);

    await expect(accumulationContract.connect(addr2).executeOrders([1])).to.be
      .reverted;
  });
  it("all managers can execute orders", async function () {
    const {
      sleepContract,
      addr1,
      accumulationContract,
      usdtContract,
      addr2,
      owner,
    } = await loadFixture(deployFixture);

    await usdtContract.transfer(addr1.address, "1000");
    await usdtContract
      .connect(addr1)
      .approve(accumulationContract.address, "1000");

    await accumulationContract
      .connect(addr1)
      .invest("100", 5, 10, 10, sleepContract.address);

    await accumulationContract.connect(owner).executeOrders([1]);
    const userOrder = await accumulationContract.orders(1);

    await accumulationContract.addManager(addr1.address);

    await accumulationContract.connect(addr1).executeOrders([1]);

    const userOrder2 = await accumulationContract.orders(1);

    await accumulationContract.addManager(addr2.address);

    await accumulationContract.connect(addr2).executeOrders([1]);

    const userOrder3 = await accumulationContract.orders(1);

    // own can also execute orders after adding new managers

    await accumulationContract.connect(owner).executeOrders([1]);

    const userOrder4 = await accumulationContract.orders(1);

    expect(userOrder?.executedGrids?.toString()).to.equal("1");
    expect(userOrder2?.executedGrids?.toString()).to.equal("2");
    expect(userOrder3?.executedGrids?.toString()).to.equal("3");
    expect(userOrder4?.executedGrids?.toString()).to.equal("4");
  });

  it("order execution and values update checks: [1/5] grids executed", async function () {
    const { sleepContract, addr1, accumulationContract, usdtContract, owner } =
      await loadFixture(deployFixture);

    await usdtContract.transfer(addr1.address, "1000");
    await usdtContract
      .connect(addr1)
      .approve(accumulationContract.address, "1000");

    const tokenInvested = "100";
    const grids = "5";
    const percent = "10";
    const entryPrice = "10";

    await accumulationContract
      .connect(addr1)
      .invest(tokenInvested, grids, percent, entryPrice, sleepContract.address);

    // prev pool balances
    const [prevPoolUsdtBalance, prevPoolTokenBalance] = await Promise.all([
      accumulationContract.poolBalance(),
      accumulationContract.poolTokenBalances(sleepContract.address),
    ]);

    // execute 1st grid
    await accumulationContract.connect(owner).executeOrders([1]);
    const gridsExecuted = "1";
    const openStatus = "true";

    const [poolUsdtBalance, poolTokenBalance] = await Promise.all([
      accumulationContract.poolBalance(),
      accumulationContract.poolTokenBalances(sleepContract.address),
    ]);

    const userOrder = await accumulationContract.orders(1);

    const usdtDeduction = new BigNumber(tokenInvested)
      .div(grids)
      .multipliedBy(gridsExecuted)
      .toString();
    const tokenRecieved = new BigNumber(tokenInvested)
      .div(grids)
      .multipliedBy(gridsExecuted)
      .toString();

    expect(poolUsdtBalance?.toString()).to.equal(
      new BigNumber(prevPoolUsdtBalance.toString())
        .minus(usdtDeduction)
        .toString()
    );
    expect(poolTokenBalance).to.equal(
      new BigNumber(prevPoolTokenBalance.toString())
        .plus(tokenRecieved)
        .toString()
    );
    expect(userOrder?.entryPrice?.toString()).to.equal(entryPrice);
    expect(userOrder?.prevPrice?.toString()).to.equal(entryPrice);

    expect(userOrder?.depositAmount?.toString()).to.equal(tokenInvested);
    expect(userOrder?.remainingAmount?.toString()).to.equal(
      new BigNumber(tokenInvested).minus(usdtDeduction).toString()
    );
    expect(userOrder?.fiatOrderAmount?.toString()).to.equal(
      new BigNumber(tokenInvested).div(grids).toString()
    );
    expect(userOrder?.tokenAccumulated?.toString()).to.equal(tokenRecieved);
    expect(userOrder?.executedGrids?.toString()).to.equal(gridsExecuted);
    expect(userOrder?.open?.toString()).to.equal(openStatus);
  });

  it("order execution and values update checks: [2/5] grids executed", async function () {
    const { sleepContract, addr1, accumulationContract, usdtContract, owner } =
      await loadFixture(deployFixture);

    await usdtContract.transfer(addr1.address, "1000");
    await usdtContract
      .connect(addr1)
      .approve(accumulationContract.address, "1000");

    const tokenInvested = "100";
    const grids = "5";
    const percent = "10";
    const entryPrice = "10";

    await accumulationContract
      .connect(addr1)
      .invest(tokenInvested, grids, percent, entryPrice, sleepContract.address);

    // prev pool balances
    const [prevPoolUsdtBalance, prevPoolTokenBalance] = await Promise.all([
      accumulationContract.poolBalance(),
      accumulationContract.poolTokenBalances(sleepContract.address),
    ]);

    // execute 1st grid
    await accumulationContract.connect(owner).executeOrders([1]);
    await accumulationContract.connect(owner).executeOrders([1]);
    const gridsExecuted = "2";
    const openStatus = "true";

    // check contract pool updates

    const [poolUsdtBalance, poolTokenBalance] = await Promise.all([
      accumulationContract.poolBalance(),
      accumulationContract.poolTokenBalances(sleepContract.address),
    ]);
    const userOrder = await accumulationContract.orders(1);

    const usdtDeduction = new BigNumber(tokenInvested)
      .div(grids)
      .multipliedBy(gridsExecuted)
      .toString();
    const tokenRecieved = new BigNumber(tokenInvested)
      .div(grids)
      .multipliedBy(gridsExecuted)
      .toString();

    expect(poolUsdtBalance?.toString()).to.equal(
      new BigNumber(prevPoolUsdtBalance.toString())
        .minus(usdtDeduction)
        .toString()
    );
    expect(poolTokenBalance).to.equal(
      new BigNumber(prevPoolTokenBalance.toString())
        .plus(tokenRecieved)
        .toString()
    );
    expect(userOrder?.entryPrice?.toString()).to.equal(entryPrice);
    expect(userOrder?.prevPrice?.toString()).to.equal(entryPrice);

    expect(userOrder?.depositAmount?.toString()).to.equal(tokenInvested);
    expect(userOrder?.remainingAmount?.toString()).to.equal(
      new BigNumber(tokenInvested).minus(usdtDeduction).toString()
    );
    expect(userOrder?.fiatOrderAmount?.toString()).to.equal(
      new BigNumber(tokenInvested).div(grids).toString()
    );
    expect(userOrder?.tokenAccumulated?.toString()).to.equal(tokenRecieved);
    expect(userOrder?.executedGrids?.toString()).to.equal(gridsExecuted);
    expect(userOrder?.open?.toString()).to.equal(openStatus);
  });

  it("order execution and values update checks: [3/5] grids executed", async function () {
    const { sleepContract, addr1, accumulationContract, usdtContract, owner } =
      await loadFixture(deployFixture);

    await usdtContract.transfer(addr1.address, "1000");
    await usdtContract
      .connect(addr1)
      .approve(accumulationContract.address, "1000");

    const tokenInvested = "100";
    const grids = "5";
    const percent = "10";
    const entryPrice = "10";

    await accumulationContract
      .connect(addr1)
      .invest(tokenInvested, grids, percent, entryPrice, sleepContract.address);

    // prev pool balances
    const [prevPoolUsdtBalance, prevPoolTokenBalance] = await Promise.all([
      accumulationContract.poolBalance(),
      accumulationContract.poolTokenBalances(sleepContract.address),
    ]);

    // execute 1st grid
    await accumulationContract.connect(owner).executeOrders([1]);
    await accumulationContract.connect(owner).executeOrders([1]);
    await accumulationContract.connect(owner).executeOrders([1]);
    const gridsExecuted = "3";
    const openStatus = "true";

    // check contract pool updates

    const [poolUsdtBalance, poolTokenBalance] = await Promise.all([
      accumulationContract.poolBalance(),
      accumulationContract.poolTokenBalances(sleepContract.address),
    ]);
    const userOrder = await accumulationContract.orders(1);

    const usdtDeduction = new BigNumber(tokenInvested)
      .div(grids)
      .multipliedBy(gridsExecuted)
      .toString();
    const tokenRecieved = new BigNumber(tokenInvested)
      .div(grids)
      .multipliedBy(gridsExecuted)
      .toString();

    expect(poolUsdtBalance?.toString()).to.equal(
      new BigNumber(prevPoolUsdtBalance.toString())
        .minus(usdtDeduction)
        .toString()
    );
    expect(poolTokenBalance).to.equal(
      new BigNumber(prevPoolTokenBalance.toString())
        .plus(tokenRecieved)
        .toString()
    );
    expect(userOrder?.entryPrice?.toString()).to.equal(entryPrice);
    expect(userOrder?.prevPrice?.toString()).to.equal(entryPrice);

    expect(userOrder?.depositAmount?.toString()).to.equal(tokenInvested);
    expect(userOrder?.remainingAmount?.toString()).to.equal(
      new BigNumber(tokenInvested).minus(usdtDeduction).toString()
    );
    expect(userOrder?.fiatOrderAmount?.toString()).to.equal(
      new BigNumber(tokenInvested).div(grids).toString()
    );
    expect(userOrder?.tokenAccumulated?.toString()).to.equal(tokenRecieved);
    expect(userOrder?.executedGrids?.toString()).to.equal(gridsExecuted);
    expect(userOrder?.open?.toString()).to.equal(openStatus);
  });

  it("order execution and values update checks: [4/5] grids executed", async function () {
    const { sleepContract, addr1, accumulationContract, usdtContract, owner } =
      await loadFixture(deployFixture);

    await usdtContract.transfer(addr1.address, "1000");
    await usdtContract
      .connect(addr1)
      .approve(accumulationContract.address, "1000");

    const tokenInvested = "100";
    const grids = "5";
    const percent = "10";
    const entryPrice = "10";

    await accumulationContract
      .connect(addr1)
      .invest(tokenInvested, grids, percent, entryPrice, sleepContract.address);

    // prev pool balances
    const [prevPoolUsdtBalance, prevPoolTokenBalance] = await Promise.all([
      accumulationContract.poolBalance(),
      accumulationContract.poolTokenBalances(sleepContract.address),
    ]);

    // execute 1st grid
    await accumulationContract.connect(owner).executeOrders([1]);
    await accumulationContract.connect(owner).executeOrders([1]);
    await accumulationContract.connect(owner).executeOrders([1]);
    await accumulationContract.connect(owner).executeOrders([1]);
    const gridsExecuted = "4";
    const openStatus = "true";

    // check contract pool updates

    const [poolUsdtBalance, poolTokenBalance] = await Promise.all([
      accumulationContract.poolBalance(),
      accumulationContract.poolTokenBalances(sleepContract.address),
    ]);
    const userOrder = await accumulationContract.orders(1);

    const usdtDeduction = new BigNumber(tokenInvested)
      .div(grids)
      .multipliedBy(gridsExecuted)
      .toString();
    const tokenRecieved = new BigNumber(tokenInvested)
      .div(grids)
      .multipliedBy(gridsExecuted)
      .toString();

    expect(poolUsdtBalance?.toString()).to.equal(
      new BigNumber(prevPoolUsdtBalance.toString())
        .minus(usdtDeduction)
        .toString()
    );
    expect(poolTokenBalance).to.equal(
      new BigNumber(prevPoolTokenBalance.toString())
        .plus(tokenRecieved)
        .toString()
    );
    expect(userOrder?.entryPrice?.toString()).to.equal(entryPrice);
    expect(userOrder?.prevPrice?.toString()).to.equal(entryPrice);

    expect(userOrder?.depositAmount?.toString()).to.equal(tokenInvested);
    expect(userOrder?.remainingAmount?.toString()).to.equal(
      new BigNumber(tokenInvested).minus(usdtDeduction).toString()
    );
    expect(userOrder?.fiatOrderAmount?.toString()).to.equal(
      new BigNumber(tokenInvested).div(grids).toString()
    );
    expect(userOrder?.tokenAccumulated?.toString()).to.equal(tokenRecieved);
    expect(userOrder?.executedGrids?.toString()).to.equal(gridsExecuted);
    expect(userOrder?.open?.toString()).to.equal(openStatus);
  });

  it("order execution and values update checks: [5/5] grids executed", async function () {
    const { sleepContract, addr1, accumulationContract, usdtContract, owner } =
      await loadFixture(deployFixture);

    await usdtContract.transfer(addr1.address, "1000");
    await usdtContract
      .connect(addr1)
      .approve(accumulationContract.address, "1000");

    const tokenInvested = "100";
    const grids = "5";
    const percent = "10";
    const entryPrice = "10";

    await accumulationContract
      .connect(addr1)
      .invest(tokenInvested, grids, percent, entryPrice, sleepContract.address);

    // prev pool balances
    const [prevPoolUsdtBalance, prevPoolTokenBalance] = await Promise.all([
      accumulationContract.poolBalance(),
      accumulationContract.poolTokenBalances(sleepContract.address),
    ]);

    // execute 1st grid
    await accumulationContract.connect(owner).executeOrders([1]);
    await accumulationContract.connect(owner).executeOrders([1]);
    await accumulationContract.connect(owner).executeOrders([1]);
    await accumulationContract.connect(owner).executeOrders([1]);
    await accumulationContract.connect(owner).executeOrders([1]);
    const gridsExecuted = "5";
    const openStatus = "false";

    // check contract pool updates

    const [poolUsdtBalance, poolTokenBalance] = await Promise.all([
      accumulationContract.poolBalance(),
      accumulationContract.poolTokenBalances(sleepContract.address),
    ]);
    const userOrder = await accumulationContract.orders(1);

    const usdtDeduction = new BigNumber(tokenInvested)
      .div(grids)
      .multipliedBy(gridsExecuted)
      .toString();
    const tokenRecieved = new BigNumber(tokenInvested)
      .div(grids)
      .multipliedBy(gridsExecuted)
      .toString();

    expect(poolUsdtBalance?.toString()).to.equal(
      new BigNumber(prevPoolUsdtBalance.toString())
        .minus(usdtDeduction)
        .toString()
    );
    expect(poolTokenBalance).to.equal(
      new BigNumber(prevPoolTokenBalance.toString())
        .plus(tokenRecieved)
        .toString()
    );
    expect(userOrder?.entryPrice?.toString()).to.equal(entryPrice);
    expect(userOrder?.prevPrice?.toString()).to.equal(entryPrice);

    expect(userOrder?.depositAmount?.toString()).to.equal(tokenInvested);
    expect(userOrder?.remainingAmount?.toString()).to.equal(
      new BigNumber(tokenInvested).minus(usdtDeduction).toString()
    );
    expect(userOrder?.fiatOrderAmount?.toString()).to.equal(
      new BigNumber(tokenInvested).div(grids).toString()
    );
    expect(userOrder?.tokenAccumulated?.toString()).to.equal(tokenRecieved);
    expect(userOrder?.executedGrids?.toString()).to.equal(gridsExecuted);
    expect(userOrder?.open?.toString()).to.equal(openStatus);
  });

  // it("User can withdraw funds without order execution", async function () {
  //   const { sleepContract, addr1, accumulationContract, usdtContract, addr2 } =
  //     await loadFixture(deployFixture);

  //   await usdtContract.transfer(addr1.address, "1000");
  //   await usdtContract
  //     .connect(addr1)
  //     .approve(accumulationContract.address, "1000");

  //   await accumulationContract
  //     .connect(addr1)
  //     .invest("100", 5, 10, 10, sleepContract.address);

  //   const isManager = await accumulationContract.managers(addr1.address);
  //   console.log("isManager ", isManager?.toString());
  //   await expect(accumulationContract.connect(addr2).executeOrders([1])).to.be
  //     .reverted;
  // });

  // it("User can withdraw funds after some order executed", async function () {
  //   const { sleepContract, addr1, accumulationContract, usdtContract, addr2 } =
  //     await loadFixture(deployFixture);

  //   await usdtContract.transfer(addr1.address, "1000");
  //   await usdtContract
  //     .connect(addr1)
  //     .approve(accumulationContract.address, "1000");

  //   await accumulationContract
  //     .connect(addr1)
  //     .invest("100", 5, 10, 10, sleepContract.address);

  //   const isManager = await accumulationContract.managers(addr1.address);
  //   console.log("isManager ", isManager?.toString());
  //   await expect(accumulationContract.connect(addr2).executeOrders([1])).to.be
  //     .reverted;
  // });

  // it("User can withdraw funds after all order executed", async function () {
  //   const { sleepContract, addr1, accumulationContract, usdtContract, addr2 } =
  //     await loadFixture(deployFixture);

  //   await usdtContract.transfer(addr1.address, "1000");
  //   await usdtContract
  //     .connect(addr1)
  //     .approve(accumulationContract.address, "1000");

  //   await accumulationContract
  //     .connect(addr1)
  //     .invest("100", 5, 10, 10, sleepContract.address);

  //   const isManager = await accumulationContract.managers(addr1.address);
  //   console.log("isManager ", isManager?.toString());
  //   await expect(accumulationContract.connect(addr2).executeOrders([1])).to.be
  //     .reverted;
  // });
});
