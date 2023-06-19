const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const BigNumber = require("bignumber.js");
const { toWei, fromWei } = require("./helpers");

const { deployFixture } = require("./deployFixture");
// test cases for the contract

// -> only managers accounts can execute orders
// -> owner can add and remove  managers
// -> new account can start strategy
// -> fail when non manager execute orders
// -> all managers can execute orders
// -> order execution and updates checks in pool and order struct
// -> fee deduction checks on each order execution
// -> user can withdraw functions after invest at any point of time
// -> fail emergency withdraw if account is now an owner
// -> update checks on each emergency withdraw function execution

describe("DCA with single user ", function () {
  it("Deployer must be the owner ", async function () {
    const { dcaContract, owner } = await loadFixture(deployFixture);

    const isManager = await dcaContract.managers(owner.address);
    expect(isManager.toString()).to.equal("1");
  });
  it("New address must not be the owner", async function () {
    const { dcaContract, addr1 } = await loadFixture(deployFixture);

    const isManager = await dcaContract.managers(addr1.address);
    expect(isManager.toString()).to.equal("0");
  });

  it("Add manager", async function () {
    const { dcaContract, addr1 } = await loadFixture(deployFixture);

    await dcaContract.addManager(addr1.address);

    const isAddr1Manager = await dcaContract.managers(addr1.address);
    expect(isAddr1Manager.toString()).to.equal("1");
  });

  it("new account can start strategy", async function () {
    const { sleepContract, addr1, dcaContract, usdtContract } = await loadFixture(deployFixture);

    await usdtContract.transfer(addr1.address, "1000");
    await usdtContract.connect(addr1).approve(dcaContract.address, "1000");

    await dcaContract.connect(addr1).invest("10", 5, 1, sleepContract.address);
    const userOrder = await dcaContract.orders(1);

    expect(userOrder?.orderId?.toString()).to.equal("1");
    expect(userOrder?.user?.toString()).to.equal(addr1.address);
    expect(userOrder?.tokenAddress?.toString()).to.equal(sleepContract.address);
    expect(userOrder?.depositAmount?.toString()).to.equal("10");
    expect(userOrder?.remainingAmount?.toString()).to.equal("10");
    expect(userOrder?.tradeAmount?.toString()).to.equal("5");
    expect(userOrder?.tokenAccumulated?.toString()).to.equal("0");
    expect(userOrder?.numOfTrades?.toString()).to.equal("2");
    expect(userOrder?.frequency?.toString()).to.equal("1");
    expect(userOrder?.executedTrades?.toString()).to.equal("0");
    expect(userOrder?.status?.toString()).to.equal("0");
  });

  it("fail when non manager execute orders", async function () {
    const { sleepContract, addr1, dcaContract, usdtContract, addr2 } =
      await loadFixture(deployFixture);

    await usdtContract.transfer(addr1.address, "1000");
    await usdtContract.connect(addr1).approve(dcaContract.address, "1000");
    // seconds in 1 day = 86400
    await dcaContract.connect(addr1).invest("10", 5, 1, sleepContract.address);

    await time.increase(86400);
    await expect(dcaContract.connect(addr2).executeOrders([1])).to.be.reverted;
  });
  it("all managers can execute orders", async function () {
    const { sleepContract, addr1, dcaContract, usdtContract, addr2, owner } = await loadFixture(
      deployFixture
    );

    await usdtContract.transfer(addr1.address, "1000");
    await usdtContract.connect(addr1).approve(dcaContract.address, "1000");

    await dcaContract.connect(addr1).invest("80", 20, 1, sleepContract.address);
    time.increase(86500);
    await dcaContract.connect(owner).executeOrders([1]);

    const userOrder = await dcaContract.orders(1);

    await dcaContract.addManager(addr1.address);
    console.log("addr1:\n");
    time.increase(86500);

    await dcaContract.connect(addr1).executeOrders([1]);

    const userOrder2 = await dcaContract.orders(1);

    await dcaContract.addManager(addr2.address);
    console.log("addr1:\n");
    time.increase(86500);

    await dcaContract.connect(addr2).executeOrders([1]);

    const userOrder3 = await dcaContract.orders(1);

    // own can also execute orders after adding new managers
    console.log("addr1:\n");
    time.increase(86500);

    await dcaContract.connect(owner).executeOrders([1]);

    console.log(await dcaContract.orders(1));
    const userOrder4 = await dcaContract.orders(1);

    expect(userOrder?.executedTrades?.toString()).to.equal("1");
    expect(userOrder2?.executedTrades?.toString()).to.equal("2");
    expect(userOrder3?.executedTrades?.toString()).to.equal("3");
    expect(userOrder4?.executedTrades?.toString()).to.equal("4");
  });

  it("order mark completed when trades are done", async function () {
    const { sleepContract, addr1, dcaContract, usdtContract, owner } = await loadFixture(
      deployFixture
    );

    await usdtContract.transfer(addr1.address, toWei("1000000"));
    await usdtContract.connect(addr1).approve(dcaContract.address, toWei("1000000"));
    const tokenInvested = "80";
    const usdtForEachTrade = "40";
    const totalExpectedTrades = new BigNumber(tokenInvested).dividedBy(usdtForEachTrade).toString();
    const blocktimeBeforeInvest = await time.latest();
    await dcaContract
      .connect(addr1)
      .invest(tokenInvested, usdtForEachTrade, 1, sleepContract.address);

    // <---------------- ORDER CREATED NO TRADES EXECUTED ---------------->
    const freshOrder = await dcaContract.orders(1);
    expect(freshOrder?.status?.toString()).to.equal("0");
    expect(freshOrder?.executedTrades?.toString()).to.equal("0");
    expect(freshOrder?.remainingAmount?.toString()).to.equal(tokenInvested);
    expect(freshOrder?.numOfTrades?.toString()).to.equal(totalExpectedTrades);
    expect(freshOrder?.tokenAccumulated?.toString()).to.equal("0");
    expect(freshOrder?.tradeAmount?.toString()).to.equal(usdtForEachTrade);
    expect(freshOrder?.depositAmount?.toString()).to.equal(tokenInvested);
    expect(freshOrder?.user?.toString()).to.equal(addr1.address);
    expect(freshOrder?.tokenAddress?.toString()).to.equal(sleepContract.address);
    expect(freshOrder?.frequency?.toString()).to.equal("1");
    expect(freshOrder?.orderId?.toString()).to.equal("1");
    expect(freshOrder?.lastExecutionTime).to.greaterThanOrEqual(blocktimeBeforeInvest);
    // <xxxxxxxxxxxxxxxxxx DONE ORDER CREATED NO TRADES EXECUTED xxxxxxxxxxxxxxxxxx>

    const [prevPoolUsdtBalance, prevPoolTokenBalance] = await Promise.all([
      dcaContract.poolBalance(),
      dcaContract.poolTokenBalances(sleepContract.address),
    ]);
    console.log({
      prevPoolUsdtBalance,
      prevPoolTokenBalance,
    });
    // <---------------- 1st trade ---------------->
    let blockTimeForNextExecution = (await time.latest()) + 86400;
    await time.increase(86500);
    await dcaContract.connect(owner).executeOrders([1]);

    const [poolUsdtBalance, poolTokenBalance] = await Promise.all([
      dcaContract.poolBalance(),
      dcaContract.poolTokenBalances(sleepContract.address),
    ]);
    let expectedExecutedTrades = "1";
    let expectedStatus = "0";

    const tokensRecievedOnEachTrade = new BigNumber(usdtForEachTrade).toString();
    const userOrderOneTradeDone = await dcaContract.orders(1);

    expect(userOrderOneTradeDone?.status?.toString()).to.equal(expectedStatus);
    expect(userOrderOneTradeDone?.executedTrades?.toString()).to.equal(expectedExecutedTrades);
    expect(userOrderOneTradeDone?.remainingAmount?.toString()).to.equal(
      new BigNumber(tokenInvested)
        .minus(new BigNumber(usdtForEachTrade).multipliedBy(expectedExecutedTrades))
        .toString()
    );
    expect(userOrderOneTradeDone?.tokenAccumulated?.toString()).to.equal(
      new BigNumber(tokensRecievedOnEachTrade).multipliedBy(expectedExecutedTrades).toString()
    );
    expect(userOrderOneTradeDone?.tradeAmount?.toString()).to.equal(usdtForEachTrade);
    expect(userOrderOneTradeDone?.orderId?.toString()).to.equal("1");
    expect(userOrderOneTradeDone?.lastExecutionTime).to.greaterThanOrEqual(
      blockTimeForNextExecution
    );
    expect(poolUsdtBalance.toString()).to.equal(
      new BigNumber(prevPoolUsdtBalance.toString())
        .minus(new BigNumber(usdtForEachTrade))
        .toString()
    );
    expect(poolTokenBalance.toString()).to.equal(
      new BigNumber(prevPoolTokenBalance.toString())
        .plus(new BigNumber(tokensRecievedOnEachTrade))
        .toString()
    );
    // <xxxxxxxxxxxxxxxxxx DONE 1st trade xxxxxxxxxxxxxxxxxx>

    //  <---------------- 2nd trade ---------------->
    blockTimeForNextExecution = (await time.latest()) + 86400;
    time.increase(86500);

    await dcaContract.connect(owner).executeOrders([1]);

    expectedExecutedTrades = "2";
    expectedStatus = "1";

    const userOrderAllTradesDone = await dcaContract.orders(1);
    const [finalPoolUsdtBalance, finalPoolTokenBalance] = await Promise.all([
      dcaContract.poolBalance(),
      dcaContract.poolTokenBalances(sleepContract.address),
    ]);

    expect(userOrderAllTradesDone?.status?.toString()).to.equal(expectedStatus);
    expect(userOrderAllTradesDone?.executedTrades?.toString()).to.equal(expectedExecutedTrades);
    expect(userOrderAllTradesDone?.remainingAmount?.toString()).to.equal(
      new BigNumber(tokenInvested)
        .minus(new BigNumber(usdtForEachTrade).multipliedBy(expectedExecutedTrades))
        .toString()
    );
    expect(userOrderAllTradesDone?.tokenAccumulated?.toString()).to.equal(
      new BigNumber(tokensRecievedOnEachTrade).multipliedBy(expectedExecutedTrades).toString()
    );
    expect(userOrderAllTradesDone?.tradeAmount?.toString()).to.equal(usdtForEachTrade);
    expect(userOrderAllTradesDone?.orderId?.toString()).to.equal("1");
    expect(userOrderAllTradesDone?.lastExecutionTime).to.greaterThanOrEqual(
      blockTimeForNextExecution
    );
    expect(finalPoolUsdtBalance.toString()).to.equal(
      new BigNumber(poolUsdtBalance.toString()).minus(usdtForEachTrade).toString()
    );
    expect(finalPoolTokenBalance.toString()).to.equal(
      new BigNumber(poolTokenBalance.toString()).plus(tokensRecievedOnEachTrade).toString()
    );
    // <xxxxxxxxxxxxxxxxxx DONE 2nd FINAL TRADE xxxxxxxxxxxxxxxxxx>
  });

  it("withdrawByOrderId revert withdraw when try withdraw other orders , or owner try to withdraw", async function () {
    const { sleepContract, owner, addr1, addr2, dcaContract, usdtContract } = await loadFixture(
      deployFixture
    );

    await usdtContract.transfer(addr1.address, toWei("1000000"));
    await usdtContract.connect(addr1).approve(dcaContract.address, toWei("1000000"));

    const tokenInvested = "80";
    const usdtForEachTrade = "40";
    await dcaContract
      .connect(addr1)
      .invest(tokenInvested, usdtForEachTrade, 1, sleepContract.address);

    await expect(dcaContract.connect(addr2).withdrawByOrderId(1)).to.be.revertedWith(
      "Can't withdraw others order!"
    );
    await expect(dcaContract.connect(owner).withdrawByOrderId(1)).to.be.revertedWith(
      "Can't withdraw others order!"
    );
  });

  it("withdrawByOrderId when no order executed: should  withdraw tokens", async function () {
    const { sleepContract, addr1, dcaContract, usdtContract } = await loadFixture(deployFixture);

    await usdtContract.transfer(addr1.address, toWei("1000000"));
    await usdtContract.connect(addr1).approve(dcaContract.address, toWei("1000000"));

    const tokenInvested = "80";
    const usdtForEachTrade = "40";
    const totalExpectedTrades = new BigNumber(tokenInvested).dividedBy(usdtForEachTrade).toString();
    // prev pool balances
    const [prevPoolUsdtBalance, prevPoolTokenBalance, prevFee] = await Promise.all([
      dcaContract.poolBalance(),
      dcaContract.poolTokenBalances(sleepContract.address),
      dcaContract.fee(),
    ]);

    const userUsdtBalancePrev = await usdtContract.balanceOf(addr1.address);
    const userTokenBalancePrev = await sleepContract.balanceOf(addr1.address);

    await dcaContract
      .connect(addr1)
      .invest(tokenInvested, usdtForEachTrade, 1, sleepContract.address);
    // console.log("user usdt bal ", userUsdtBalancePrev.toString());
    // console.log("user token bal ", userTokenBalancePrev.toString());

    // execute 1st grid
    await dcaContract.connect(addr1).withdrawByOrderId(1);

    const executedTrades = "0";

    // check contract pool updates

    const [poolUsdtBalance, poolTokenBalance, updatedFee] = await Promise.all([
      dcaContract.poolBalance(),
      dcaContract.poolTokenBalances(sleepContract.address),
      dcaContract.fee(),
    ]);

    const userUsdtBalance = await usdtContract.balanceOf(addr1.address);
    const userTokenBalance = await sleepContract.balanceOf(addr1.address);
    const userOrder = await dcaContract.orders(1);

    // console.log("user usdt bal ", userUsdtBalance.toString());
    // console.log("user token bal ", userTokenBalance.toString());
    const totalUsdtDeductions = new BigNumber(usdtForEachTrade)
      .multipliedBy(executedTrades)
      .toString();

    const feeDeductionForEachTrade = new BigNumber(usdtForEachTrade)
      .multipliedBy(5)
      .div(10000)
      .toString();
    const totalFeeDeductions = new BigNumber(feeDeductionForEachTrade)
      .multipliedBy(executedTrades)
      .toString();

    const tokensRecievedOnEachTrade = new BigNumber(usdtForEachTrade)
      .minus(feeDeductionForEachTrade)
      .toString();
    const totalTokensRecieved = new BigNumber(tokensRecievedOnEachTrade)
      .multipliedBy(executedTrades)
      .toString();

    // check token balance after withdraw
    expect(userUsdtBalance?.toString()).to.equal(userUsdtBalancePrev);
    expect(userTokenBalance).to.equal(userTokenBalancePrev);

    // check pool and token details after withdraw
    expect(poolTokenBalance.toString()).to.equal(
      new BigNumber(prevPoolTokenBalance.toString()).plus(totalTokensRecieved).toString()
    );

    // console.log("pool data  ", {
    //   prevPoolUsdtBalance,
    //   poolUsdtBalance,
    //   prevPoolTokenBalance,
    //   poolTokenBalance,
    //   totalUsdtDeductions,
    // });
    expect(poolUsdtBalance?.toString()).to.equal(
      new BigNumber(prevPoolUsdtBalance.toString()).minus(totalUsdtDeductions).toString()
    );

    expect(updatedFee.toString()).to.equal(
      new BigNumber(prevFee.toString()).plus(totalFeeDeductions).toString()
    );
    expect(userOrder?.depositAmount?.toString()).to.equal(tokenInvested);
    expect(userOrder?.remainingAmount?.toString()).to.equal(
      new BigNumber("0").minus(totalUsdtDeductions).toString() // order remaining amount after token withdraw
    );
    expect(userOrder?.tradeAmount?.toString()).to.equal(
      new BigNumber(tokenInvested).div(totalExpectedTrades).toString()
    );
    expect(userOrder?.tokenAccumulated?.toString()).to.equal(totalTokensRecieved);
    expect(userOrder?.executedTrades?.toString()).to.equal(executedTrades);
    expect(userOrder?.status?.toString()).to.equal("2"); // cancelled
  });

  it("withdrawByOrderId when all trades executed: should ¯ withdraw tokens", async function () {
    const { sleepContract, addr1, dcaContract, usdtContract, owner } = await loadFixture(
      deployFixture
    );

    await usdtContract.transfer(addr1.address, toWei("1000000"));
    await usdtContract.connect(addr1).approve(dcaContract.address, toWei("1000000"));

    const tokenInvested = "80";
    const usdtForEachTrade = "40";
    const totalExpectedTrades = new BigNumber(tokenInvested).dividedBy(usdtForEachTrade).toString();
    // prev pool balances
    const [prevPoolUsdtBalance, prevPoolTokenBalance, prevFee] = await Promise.all([
      dcaContract.poolBalance(),
      dcaContract.poolTokenBalances(sleepContract.address),
      dcaContract.fee(),
    ]);

    const userUsdtBalancePrev = await usdtContract.balanceOf(addr1.address);

    await dcaContract
      .connect(addr1)
      .invest(tokenInvested, usdtForEachTrade, 1, sleepContract.address);

    // execute 1st grid
    await time.increase(86500);
    await dcaContract.connect(owner).executeOrders([1]);
    await time.increase(86500);
    console.log(await dcaContract.connect(owner).executeOrders([1]));
    const userOrderBeforeWithdraw = await dcaContract.orders(1);
    expect(userOrderBeforeWithdraw?.status?.toString()).to.equal("1"); // completed
    await dcaContract.connect(addr1).withdrawByOrderId(1);

    const executedTrades = "2";
    const openStatus = "3"; // "withdrawn"

    // check contract pool updates

    const [poolUsdtBalance, poolTokenBalance, updatedFee] = await Promise.all([
      dcaContract.poolBalance(),
      dcaContract.poolTokenBalances(sleepContract.address),
      dcaContract.fee(),
    ]);

    const userUsdtBalance = await usdtContract.balanceOf(addr1.address);
    const userTokenBalance = await sleepContract.balanceOf(addr1.address);
    const userOrder = await dcaContract.orders(1);

    const usdtForEachOrder = new BigNumber(tokenInvested).div(totalExpectedTrades).toString();
    const totalUsdtDeductions = new BigNumber(usdtForEachOrder)
      .multipliedBy(executedTrades)
      .toString();

    const feeDeductionForEachTrade = new BigNumber(usdtForEachOrder)
      .multipliedBy(0) // TODO: add fee logic in contracts
      .div(10000)
      .toString();
    const totalFeeDeductions = new BigNumber(feeDeductionForEachTrade)
      .multipliedBy(executedTrades)
      .toString();

    const tokensRecievedOnEachOrder = new BigNumber(usdtForEachOrder)
      .minus(feeDeductionForEachTrade)
      .toString();

    const totalTokensRecieved = new BigNumber(tokensRecievedOnEachOrder)
      .multipliedBy(executedTrades)
      .toString();
    // check token balance after withdraw
    expect(fromWei(userUsdtBalance?.toString())).to.equal(
      fromWei(new BigNumber(userUsdtBalancePrev?.toString()).minus(totalUsdtDeductions).toString())
    );
    expect(userTokenBalance?.toString()).to.equal(totalTokensRecieved);
    // check pool and token details after withdraw
    expect(poolTokenBalance.toString()).to.equal(
      new BigNumber(prevPoolTokenBalance.toString()).toString()
    );
    expect(poolUsdtBalance?.toString()).to.equal(
      new BigNumber(prevPoolUsdtBalance.toString()).toString()
    );
    expect(updatedFee.toString()).to.equal(
      new BigNumber(prevFee.toString()).plus(totalFeeDeductions).toString()
    );
    expect(userOrder?.depositAmount?.toString()).to.equal(tokenInvested);
    expect(userOrder?.remainingAmount?.toString()).to.equal("0"); // order remaining amount after token withdraw
    expect(userOrder?.tradeAmount?.toString()).to.equal(
      new BigNumber(tokenInvested).div(totalExpectedTrades).toString()
    );
    expect(userOrder?.tokenAccumulated?.toString()).to.equal("0"); // order token accumulated amount after token withdraw should be 0
    expect(userOrder?.executedTrades?.toString()).to.equal(executedTrades);
    expect(userOrder?.status?.toString()).to.equal(openStatus);
  });
});
