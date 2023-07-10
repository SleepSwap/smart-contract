const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers')
const { expect } = require('chai')
const { ethers } = require('hardhat')
const { deployRSIFixture } = require('./deployRSIFixture')

describe('SleepRSI', function () {
  describe('Invest', function () {
    it('should allow users to invest and update pool balances', async function () {
      const { USDT, SLEEP, rsiContract, user } = await loadFixture(deployRSIFixture)
      const initialPoolUSDTBalance = await rsiContract.poolTokenBalances(USDT.address)
      const initialPoolSLEEPBalance = await rsiContract.poolTokenBalances(SLEEP.address)
      const initialUserUSDTBalance = await USDT.balanceOf(user.address)
      const initialPoolFeeUSDT = await rsiContract.fee(USDT.address)

      // approve usdt contract to spend 100 usdt
      await USDT.connect(user).approve(rsiContract.address, ethers.utils.parseEther('100'))

      const investAmount = ethers.utils.parseEther('100')
      const entryPrice = 10

      // Invest 100 dummy tokens
      await rsiContract.connect(user).invest(investAmount, entryPrice, USDT.address)

      const finalPoolUSDTBalance = await rsiContract.poolTokenBalances(USDT.address)
      const finalPoolSLEEPBalance = await rsiContract.poolTokenBalances(SLEEP.address)
      const finalUserUSDTBalance = await USDT.balanceOf(user.address)
      const finalPoolFeeUSDT = await rsiContract.fee(USDT.address)
      const orderCount = await rsiContract.ordersCount()

      const feeRecieved = finalPoolFeeUSDT.sub(initialPoolFeeUSDT)

      console.log('feeRecieved: ', feeRecieved.toString())
      console.log('initialPoolFeeUSDT: ', initialPoolUSDTBalance.toString())
      console.log('finalPoolUSDTBalance: ', finalPoolUSDTBalance.toString())

      console.log('initialPoolSLEEPBalance: ', initialPoolSLEEPBalance.toString())
      console.log('finalPoolSLEEPBalance: ', finalPoolSLEEPBalance.toString())

      // const feeDeductions = investAmount.div(2).mul(5).div(10000);
      const tokenRecieved = investAmount.div(2).sub(feeRecieved).div(entryPrice)
      expect(finalPoolUSDTBalance).to.equal(initialPoolUSDTBalance.add(investAmount.div(2)))
      // expect(finalPoolSLEEPBalance).to.equal(initialPoolSLEEPBalance.add(tokenRecieved))
      expect(finalUserUSDTBalance).to.equal(initialUserUSDTBalance.sub(investAmount))
      expect(orderCount).to.equal(1)
    })
  })
  // describe('ExecuteOrders', async function () {
  //   it('should execute buy orders when RSI <= 30, verify order and pool updates', async function () {
  //     const { USDT, rsiContract, sleepTokenContract, user } = await loadFixture(deployRSIFixture)
  //     // const initialPoolTokenBalance = await rsiContract.poolTokenBalances(
  //     //   USDT
  //     // );
  //     const initialUserTokenBalance = await USDT.balanceOf(user.address)

  //     const investAmount = ethers.utils.parseEther('100')

  //     const entryPrice = 10
  //     const investmentToken = sleepTokenContract.address

  //     // invest 100 usdt
  //     await USDT.connect(user).approve(rsiContract.address, ethers.utils.parseEther('100'))

  //     // Invest 100 dummy tokens
  //     await rsiContract.connect(user).invest(investAmount, entryPrice, USDT.address)

  //     const orderBefore = await rsiContract.orders(1)

  //     console.log('created order ', orderBefore)

  //     // pool balances before executing order
  //     const poolTokenBalanceBefore = await rsiContract.poolTokenBalances(sleepTokenContract.address)

  //     const poolUSDTBalanceBefore = await rsiContract.poolBalance()
  //     const poolFeeBefore = await rsiContract.fee(USDT.address)

  //     // console.log('created order ', order)
  //     // Execute  order when RSI <= 30
  //     const rsi = 25
  //     const orderIds = [1]
  //     const executionPrice = 5
  //     const grids = 3 // no of buy and sells of each position
  //     const executedBuyOrders = 1
  //     const executedSellOrders = 0

  //     await rsiContract.executeOrders(orderIds, rsi, executionPrice)

  //     const orderAfter = await rsiContract.orders(1)
  //     const poolTokenBalanceAfter = await rsiContract.poolTokenBalances(sleepTokenContract.address)
  //     const poolUSDTBalanceAfter = await rsiContract.poolBalance()
  //     const poolFeeAfter = await rsiContract.fee(USDT.address)

  //     console.log('created after ', orderAfter)

  //     // check order values after execution
  //     // uint256 orderId; 3316666666666666666
  //     // address user; 3331666666666666666
  //     // address tokenAddress; // token adddress which user want to buy or sell
  //     // uint256 investedAmount; // usdt invested amount
  //     // uint256 orderTokens;
  //     // uint256 orderFiats;
  //     // uint256 tokenBalance; // token balance in order
  //     // uint256 fiatBalance; // fiat balance in order
  //     // uint256 entryPrice; // entry price of order
  //     // OrderExecutionStatus executionStatus;
  //     // bool open;

  //     // fee deducted from contract
  //     const feeDeductionForEachOrder = poolFeeAfter.sub(poolFeeBefore)

  //     const fiatAfterFee = orderBefore?.orderFiats.sub(feeDeductionForEachOrder)
  //     const tokenRecieveOnExecution = fiatAfterFee.div(executionPrice)

  //     console.log(
  //       'token increased in contract ',
  //       orderAfter.tokenBalance.sub(orderBefore.tokenBalance)
  //     )
  //     console.log('pool fee increased in contract ', poolFeeAfter.sub(poolFeeBefore))
  //     console.log('token recieve calculated  ', tokenRecieveOnExecution)
  //     console.log('pool fee calculated  ', feeDeductionForEachOrder)

  //     console.log('pool token balance before ', poolTokenBalanceBefore.toString())
  //     console.log('pool token balance after ', poolTokenBalanceAfter.toString())
  //     console.log('pool usdt balance before ', poolUSDTBalanceBefore.toString())
  //     console.log('pool usdt balance after ', poolUSDTBalanceAfter.toString())

  //     // verify order updates post execution
  //     expect(orderAfter.fiatBalance).to.equal(orderBefore.fiatBalance.sub(orderBefore?.orderFiats))
  //     expect(orderAfter.tokenBalance).to.equal(
  //       orderBefore.tokenBalance.add(tokenRecieveOnExecution)
  //     )
  //     expect(orderAfter.executionStatus.buyCount).to.equal(ethers.BigNumber.from(executedBuyOrders))
  //     expect(orderAfter.executionStatus.sellCount).to.equal(
  //       ethers.BigNumber.from(executedSellOrders)
  //     )
  //     expect(orderAfter.open).to.equal(true)

  //     // verify pool balances post execution
  //     // expect(poolTokenBalanceAfter).to.equal(poolTokenBalanceBefore.add(tokenRecieveOnExecution))
  //     expect(poolUSDTBalanceAfter).to.equal(poolUSDTBalanceBefore.sub(orderBefore?.orderFiats))
  //   })
  //   // it('should execute sell orders when RSI >= 70 and verify order and pool updates', async function () {
  //   //   const { USDT, rsiContract, sleepTokenContract, user } = await loadFixture(
  //   //     deployRSIFixture
  //   //   )
  //   //   // const initialPoolTokenBalance = await rsiContract.poolTokenBalances(
  //   //   //   USDT
  //   //   // );
  //   //   const initialUserTokenBalance = await USDT.balanceOf(user.address)

  //   //   const investAmount = ethers.utils.parseEther('100')

  //   //   const entryPrice = 10
  //   //   const investmentToken = sleepTokenContract.address

  //   //   // invest 100 usdt
  //   //   await USDT
  //   //     .connect(user)
  //   //     .approve(rsiContract.address, ethers.utils.parseEther('100'))

  //   //   // Invest 100 dummy tokens
  //   //   await rsiContract.connect(user).invest(investAmount, entryPrice, USDT.address)

  //   //   const orderBefore = await rsiContract.orders(1)

  //   //   console.log('created order ', orderBefore)

  //   //   // pool balances before executing order
  //   //   const poolTokenBalanceBefore = await rsiContract.poolTokenBalances(
  //   //     sleepTokenContract.address
  //   //   )

  //   //   const poolUSDTBalanceBefore = await rsiContract.poolTokenBalances(USDT.address)
  //   //   const poolFeeBefore = await rsiContract.fee(sleepTokenContract.address)

  //   //   // console.log('created order ', order)
  //   //   // Execute  order when RSI <= 30
  //   //   const rsi = 72
  //   //   const orderIds = [1]
  //   //   const executionPrice = 15
  //   //   const grids = 3 // no of buy and sells of each position
  //   //   const executedBuyOrders = 0
  //   //   const executedSellOrders = 1

  //   //   await rsiContract.executeOrders(orderIds, rsi, executionPrice)

  //   //   const orderAfter = await rsiContract.orders(1)
  //   //   const poolTokenBalanceAfter = await rsiContract.poolTokenBalances(
  //   //     sleepTokenContract.address
  //   //   )
  //   //   const poolUSDTBalanceAfter = await rsiContract.poolTokenBalances(USDT.address)
  //   //   const poolFeeAfter = await rsiContract.fee(sleepTokenContract.address)

  //   //   console.log('created after ', orderAfter)

  //   //   // check order values after execution
  //   //   // uint256 orderId; 3316666666666666666
  //   //   // address user; 3331666666666666666
  //   //   // address tokenAddress; // token adddress which user want to buy or sell
  //   //   // uint256 investedAmount; // usdt invested amount
  //   //   // uint256 orderTokens;
  //   //   // uint256 orderFiats;
  //   //   // uint256 tokenBalance; // token balance in order
  //   //   // uint256 fiatBalance; // fiat balance in order
  //   //   // uint256 entryPrice; // entry price of order
  //   //   // OrderExecutionStatus executionStatus;
  //   //   // bool open;

  //   //   // fee deducted from contract
  //   //   const feeDeductionForEachOrder = poolFeeAfter.sub(poolFeeBefore)

  //   //   const fiatAfterFee = orderBefore?.orderFiats.sub(feeDeductionForEachOrder)
  //   //   const tokenRecieveOnExecution = fiatAfterFee.mul(executionPrice)

  //   //   // console.log(
  //   //   //   'token increased in contract ',
  //   //   //   orderAfter.tokenBalance.sub(orderBefore.tokenBalance)
  //   //   // )
  //   //   // console.log('pool fee increased in contract ', poolFeeAfter.sub(poolFeeBefore))
  //   //   // console.log('token recieve calculated  ', tokenRecieveOnExecution)
  //   //   // console.log('pool fee calculated  ', feeDeductionForEachOrder)

  //   //   console.log('pool token balance before ', poolTokenBalanceBefore.toString())
  //   //   console.log('pool token balance after ', poolTokenBalanceAfter.toString())
  //   //   console.log('pool usdt balance before ', poolUSDTBalanceBefore.toString())
  //   //   console.log('pool usdt balance after ', poolUSDTBalanceAfter.toString())

  //   //   // verify order updates post execution
  //   //   expect(orderAfter.fiatBalance).to.equal(orderBefore.fiatBalance.sub(orderBefore?.orderFiats))
  //   //   expect(orderAfter.tokenBalance).to.equal(
  //   //     orderBefore.tokenBalance.add(tokenRecieveOnExecution)
  //   //   )
  //   //   expect(orderAfter.executionStatus.buyCount).to.equal(ethers.BigNumber.from(executedBuyOrders))
  //   //   expect(orderAfter.executionStatus.sellCount).to.equal(
  //   //     ethers.BigNumber.from(executedSellOrders)
  //   //   )
  //   //   expect(orderAfter.open).to.equal(true)

  //   //   // verify pool balances post execution
  //   //   // expect(poolTokenBalanceAfter).to.equal(poolTokenBalanceBefore.add(tokenRecieveOnExecution))
  //   //   expect(poolUSDTBalanceAfter).to.equal(
  //   //     poolUSDTBalanceBefore.sub(orderBefore?.orderFiats).add(feeDeductionForEachOrder)
  //   //   )
  //   // })
  // })
  // Add more test cases as needed
})
