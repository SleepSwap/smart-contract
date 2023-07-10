const { expect } = require('chai')
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers')
const { deployRSIFixture } = require('./deployRSIFixture')
const { toWei, fromWei } = require('./helpers')
const { default: BigNumber } = require('bignumber.js')

function BN(value) {
  return new BigNumber(value)
}

describe('Mock swaps with custom price', function () {
  describe('Swaps:', function () {
    it('Should swap USDT to Tokens correctly', async function () {
      const { testSwapRSI, USDT, SLEEP, user } = await loadFixture(deployRSIFixture)
      // user approves USDT for contract

      const inputAmount = toWei('10')
      const swapPrice = 100

      const initialTokenBalance = await SLEEP.balanceOf(user.address)

      // console.log("initialTokenBalance: ", initialTokenBalance.toString());
      await USDT.connect(user).approve(testSwapRSI.address, inputAmount)
      await testSwapRSI.connect(user).swapFromUsdt(toWei('10'), swapPrice)

      const finalTokenBalance = await SLEEP.balanceOf(user.address)
      // console.log("finalTokenBalance: ", finalTokenBalance.toString());
      expect(BN(finalTokenBalance.toString()).toString()).to.equal(
        BN(initialTokenBalance.toString())
          .plus(BN(toWei('10')).div(swapPrice).toString())
          .toString()
      )
    })

    it('Should swap Tokens to USDT correctly', async function () {
      const { testSwapRSI, USDT, SLEEP, owner, addr1, addr2 } = await loadFixture(deployRSIFixture)
      // Owner approves Tokens for contract

      // initial usdt balance
      const initialUsdtBalance = await USDT.balanceOf(owner.address)
      const initialTokenBalance = await SLEEP.balanceOf(owner.address)

      const tokenPrice = 2
      const inputAmount = ethers.utils.parseEther('100')

      // approve 100 sleep tokens for contract
      await SLEEP.connect(owner).approve(testSwapRSI.address, inputAmount)
      await testSwapRSI.connect(owner).swapFromTokens(inputAmount, tokenPrice)

      const finalUsdtBalance = await USDT.balanceOf(owner.address)
      const finalTokenBalance = await SLEEP.balanceOf(owner.address)

      // calculate expected usdt to be recieved for 100 token at 2$ per token

      const usdtRecieved = BN(inputAmount.toString()).multipliedBy(2).toString()

      expect(fromWei(finalUsdtBalance.toString())).to.equal(
        fromWei(BN(initialUsdtBalance.toString()).plus(usdtRecieved.toString()).toString())
      )
      expect(fromWei(finalTokenBalance.toString())).to.equal(
        fromWei(BN(initialTokenBalance.toString()).minus(inputAmount.toString()))
      )
    })
  })

  describe('depositTokens', function () {
    it('Should deposit Tokens correctly', async function () {
      const { testSwapRSI, USDT, SLEEP, owner } = await loadFixture(deployRSIFixture)

      const initialTokenBalance = await SLEEP.balanceOf(owner.address)

      // Owner approves Tokens for contract
      await SLEEP.connect(owner).approve(testSwapRSI.address, ethers.utils.parseEther('100'))
      await testSwapRSI.connect(owner).depositTokens(SLEEP.address, ethers.utils.parseEther('100'))

      const finalTokenBalance = await SLEEP.balanceOf(owner.address)
      const depositAmount = initialTokenBalance.sub(finalTokenBalance)

      expect(depositAmount).to.equal(ethers.utils.parseEther('100'))
    })

    it('Should deposit USDT correctly', async function () {
      const { testSwapRSI, USDT, SLEEP, owner } = await loadFixture(deployRSIFixture)

      const initialUSDT = await USDT.balanceOf(owner.address)

      // Owner approves Tokens for contract
      await USDT.connect(owner).approve(testSwapRSI.address, ethers.utils.parseEther('100'))
      await testSwapRSI.connect(owner).depositTokens(USDT.address, ethers.utils.parseEther('100'))

      const finalUSDT = await USDT.balanceOf(owner.address)
      const depositAmount = initialUSDT.sub(finalUSDT)

      expect(depositAmount).to.equal(ethers.utils.parseEther('100'))
    })
  })

  describe('swapFromUsdt - error cases', async function () {
    it("Should revert if there's insufficient token liquidity", async function () {
      const { testSwapRSI, USDT, SLEEP, owner, user, addr1 } = await loadFixture(deployRSIFixture)

      await expect(testSwapRSI.connect(addr1).swapFromUsdt(ethers.utils.parseEther('1000000'), 2))
        .to.be.reverted
    })

    it('Should revert if swap price is zero', async function () {
      const { testSwapRSI, USDT, SLEEP, owner, user, addr1 } = await loadFixture(deployRSIFixture)

      // Owner approves USDT for contract
      await USDT.connect(owner).approve(testSwapRSI.address, ethers.utils.parseEther('100'))
      await expect(
        testSwapRSI.connect(owner).swapFromUsdt(ethers.utils.parseEther('100'), 0)
      ).to.be.revertedWith('Swap price should be greater than 0!')
    })
  })

  describe('swapFromTokens - error cases', function () {
    it("Should revert if there's insufficient token liquidity", async function () {
      const { testSwapRSI, USDT, SLEEP, owner, user, addr1 } = await loadFixture(deployRSIFixture)
      await expect(testSwapRSI.connect(addr1).swapFromTokens(ethers.utils.parseEther('100'), 2)).to
        .be.reverted
    })

    it('Should revert if swap price is zero', async function () {
      const { testSwapRSI, USDT, SLEEP, owner, user, addr1 } = await loadFixture(deployRSIFixture)

      // Owner approves Tokens for contract
      await SLEEP.connect(owner).approve(testSwapRSI.address, ethers.utils.parseEther('100'))
      await expect(
        testSwapRSI.connect(owner).swapFromTokens(ethers.utils.parseEther('100'), 0)
      ).to.be.revertedWith('Swap price should be greater than 0!')
    })
  })
})
