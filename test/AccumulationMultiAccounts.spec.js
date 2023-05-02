const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const BigNumber = require("bignumber.js");
const { toWei } = require("./helpers");
const { deployFixture } = require("./deployFixture");

// test cases for the contract

// -> only managers accounts can execute orders✅
// -> owner can add and remove  managers✅
// -> new acc ount can start strategy✅
// -> fail when non manager execute orders✅
// -> all managers can execute orders✅
// -> order execution and updates checks in pool and order struct✅
// -> fee deduction checks on each order execution✅
// -> user can withdraw functions after invest at any point of time
// -> fail emergency withdraw if account is now an owner
// -> update checks on each emergency withdraw function execution

describe("Accumulations with multi users ", function () {
  it("multiple accounts can start strategy", async function () {
    const { sleepContract, addr1, addr2, accumulationContract, usdtContract } =
      await loadFixture(deployFixture);

    await usdtContract.transfer(addr1.address, toWei("1000"));
    await usdtContract.transfer(addr2.address, toWei("1000"));
    await usdtContract
      .connect(addr1)
      .approve(accumulationContract.address, toWei("1000"));
    await usdtContract
      .connect(addr2)
      .approve(accumulationContract.address, toWei("1000"));

    await accumulationContract
      .connect(addr1)
      .invest(toWei("100"), 5, 10, 10, sleepContract.address);
    await accumulationContract
      .connect(addr2)
      .invest(toWei("100"), 5, 10, 10, sleepContract.address);

    const userOrder = await accumulationContract.orders(1);
    const userOrder2 = await accumulationContract.orders(2);

    expect(userOrder?.orderId?.toString()).to.equal("1");
    expect(userOrder?.user?.toString()).to.equal(addr1.address);
    expect(userOrder?.tokenAddress?.toString()).to.equal(sleepContract.address);
    expect(userOrder?.entryPrice?.toString()).to.equal("10");
    expect(userOrder?.prevPrice?.toString()).to.equal("10");
    expect(userOrder?.depositAmount?.toString()).to.equal(toWei("100"));
    expect(userOrder?.remainingAmount?.toString()).to.equal(toWei("100"));
    expect(userOrder?.fiatOrderAmount?.toString()).to.equal(toWei("20"));
    expect(userOrder?.tokenAccumulated?.toString()).to.equal("0");
    expect(userOrder?.grids?.toString()).to.equal("5");
    expect(userOrder?.percentage?.toString()).to.equal("10");
    expect(userOrder?.executedGrids?.toString()).to.equal("0");
    expect(userOrder?.open?.toString()).to.equal("true");

    expect(userOrder2?.orderId?.toString()).to.equal("2");
    expect(userOrder2?.user?.toString()).to.equal(addr2.address);
    expect(userOrder2?.tokenAddress?.toString()).to.equal(
      sleepContract.address
    );
    expect(userOrder2?.entryPrice?.toString()).to.equal("10");
    expect(userOrder2?.prevPrice?.toString()).to.equal("10");
    expect(userOrder2?.depositAmount?.toString()).to.equal(toWei("100"));
    expect(userOrder2?.remainingAmount?.toString()).to.equal(toWei("100"));
    expect(userOrder2?.fiatOrderAmount?.toString()).to.equal(toWei("20"));
    expect(userOrder2?.tokenAccumulated?.toString()).to.equal("0");
    expect(userOrder2?.grids?.toString()).to.equal("5");
    expect(userOrder2?.percentage?.toString()).to.equal("10");
    expect(userOrder2?.executedGrids?.toString()).to.equal("0");
    expect(userOrder2?.open?.toString()).to.equal("true");
  });

  it("order execution and values update checks: [1/5] grids executed", async function () {
    const {
      sleepContract,
      addr1,
      addr2,
      accumulationContract,
      usdtContract,
      owner,
    } = await loadFixture(deployFixture);

    await usdtContract.transfer(addr1.address, toWei("1000"));
    await usdtContract.transfer(addr2.address, toWei("1000"));
    await usdtContract
      .connect(addr1)
      .approve(accumulationContract.address, toWei("1000"));
    await usdtContract
      .connect(addr2)
      .approve(accumulationContract.address, toWei("1000"));

    const tokenInvested = toWei(100);
    const grids = "5";
    const percent = "10";
    const entryPrice = toWei(10, 8);

    await accumulationContract
      .connect(addr1)
      .invest(tokenInvested, grids, percent, entryPrice, sleepContract.address);

    await accumulationContract
      .connect(addr2)
      .invest(tokenInvested, grids, percent, entryPrice, sleepContract.address);

    // prev pool balances
    const [prevPoolUsdtBalance, prevPoolTokenBalance, prevFee] =
      await Promise.all([
        accumulationContract.poolBalance(),
        accumulationContract.poolTokenBalances(sleepContract.address),
        accumulationContract.fee(),
      ]);

    // console.log("prev pool fee", { fee: prevFee.toString() });
    // execute 1st grid
    await accumulationContract.connect(owner).executeOrders([1]);
    const gridsExecuted = "1";
    const openStatus = "true";

    const [poolUsdtBalance, poolTokenBalance, updatedFee] = await Promise.all([
      accumulationContract.poolBalance(),
      accumulationContract.poolTokenBalances(sleepContract.address),
      accumulationContract.fee(),
    ]);

    // console.log("updated pool fee", { fee: updatedFee.toString() });
    const userOrder = await accumulationContract.orders(1);

    const usdtForEachOrder = new BigNumber(tokenInvested).div(grids).toString();
    const totalUsdtDeductions = new BigNumber(usdtForEachOrder)
      .multipliedBy(gridsExecuted)
      .toString();

    const feeDeductionForEachOrder = new BigNumber(usdtForEachOrder)
      .multipliedBy(5)
      .div(10000)
      .toString();
    const totalFeeDeductions = new BigNumber(feeDeductionForEachOrder)
      .multipliedBy(gridsExecuted)
      .toString();

    const tokensRecievedOnEachOrder = new BigNumber(usdtForEachOrder)
      .minus(feeDeductionForEachOrder)
      .toString();
    const totalTokensRecieved = new BigNumber(tokensRecievedOnEachOrder)
      .multipliedBy(gridsExecuted)
      .toString();

    // console.log("usdtForEachOrder calculated", usdtForEachOrder.toString());
    // console.log(
    //   "feeDeductionForEachOrder --> calculated ",
    //   feeDeductionForEachOrder.toString()
    // );
    // console.log(
    //   "tokensRecievedOnEachOrder: calculated ",
    //   tokensRecievedOnEachOrder.toString()
    // );

    expect(poolTokenBalance.toString()).to.equal(
      new BigNumber(prevPoolTokenBalance.toString())
        .plus(totalTokensRecieved)
        .toString()
    );

    expect(poolUsdtBalance?.toString()).to.equal(
      new BigNumber(prevPoolUsdtBalance.toString())
        .minus(totalUsdtDeductions)
        .toString()
    );

    expect(updatedFee.toString()).to.equal(
      new BigNumber(prevFee.toString()).plus(totalFeeDeductions).toString()
    );
    expect(userOrder?.entryPrice?.toString()).to.equal(entryPrice);
    expect(userOrder?.prevPrice?.toString()).to.equal(entryPrice);

    expect(userOrder?.depositAmount?.toString()).to.equal(tokenInvested);
    expect(userOrder?.remainingAmount?.toString()).to.equal(
      new BigNumber(tokenInvested).minus(totalUsdtDeductions).toString()
    );
    expect(userOrder?.fiatOrderAmount?.toString()).to.equal(
      new BigNumber(tokenInvested).div(grids).toString()
    );
    expect(userOrder?.tokenAccumulated?.toString()).to.equal(
      totalTokensRecieved
    );
    expect(userOrder?.executedGrids?.toString()).to.equal(gridsExecuted);
    expect(userOrder?.open?.toString()).to.equal(openStatus);
  });
});
