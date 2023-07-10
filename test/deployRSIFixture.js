const { ethers } = require('hardhat')
const { toWei } = require('./helpers')

// prepare dummy contract data
async function deployRSIFixture() {
  const [owner, user, addr1, addr2, ...addrs] = await ethers.getSigners()

  const usdtFact = await ethers.getContractFactory('FaucetToken')
  const USDT = await usdtFact.deploy()
  await USDT.deployed()

  const usdcFact = await ethers.getContractFactory('FaucetToken')
  const USDC = await usdtFact.deploy()
  await USDC.deployed()

  const sleepFact = await ethers.getContractFactory('SleepToken')
  const SLEEP = await sleepFact.deploy()
  await SLEEP.deployed()

  await SLEEP.mint(toWei('1000000'))
  await USDT.mint(toWei('1000000'))
  await USDC.mint(toWei('1000000'))

  // console.log("USDT deployed to:", USDT.address);
  // console.log("SLEEP deployed to:", SLEEP.address);
  // Deploy the contract

  const testSwapRSIFactory = await ethers.getContractFactory('TestSwapRSI')
  const testSwapRSI = await testSwapRSIFactory.deploy(
    USDT.address, // Dummy USDT address
    SLEEP.address // Dummy Token address
  )

  await testSwapRSI.deployed()

  // Mint some tokens and USDT to use in tests
  await USDT.mint(toWei('1000000'))
  await SLEEP.mint(toWei('1000000'))

  // sent 1000 USDT and SleepTokens to user
  await USDT.transfer(user.address, toWei('1000'))
  await SLEEP.transfer(user.address, toWei('1000'))

  // console.log("testSwapRSI deployed to:", testSwapRSI.address);
  await USDT.approve(testSwapRSI.address, toWei('1000'))

  await testSwapRSI.depositTokens(USDT.address, ethers.utils.parseEther('1000'))

  await SLEEP.approve(testSwapRSI.address, ethers.utils.parseEther('1000'))

  await testSwapRSI.depositTokens(SLEEP.address, ethers.utils.parseEther('1000'))

  await USDT.approve(testSwapRSI.address, ethers.utils.parseEther('1000'))

  await testSwapRSI.depositTokens(USDT.address, ethers.utils.parseEther('1000'))

  // const balance = await SLEEP.balanceOf(owner.address);
  // console.log("owner balance: ", balance.toString());
  // const tokenBalance = await testSwapRSI.tokenBalances(
  //   SLEEP.address
  // );
  // console.log("contract tokenBalance: ", tokenBalance.toString());

  const MINIMUN_INVESTMENT = toWei('10')
  const RSI_PERIOD = 60
  const RSI_THRESHOLD = 8 * 60 * 60
  const SleepRSI = await ethers.getContractFactory('SleepRSI')
  const rsiContract = await SleepRSI.deploy(
    USDT.address,
    testSwapRSI.address,
    MINIMUN_INVESTMENT,
    RSI_PERIOD, // RSI period
    RSI_THRESHOLD // RSI threshold
  )
  await rsiContract.deployed()

  // console.log("rsiContract deployed to:", rsiContract.address);

  // Fixtures can return anything you consider useful for your tests
  return {
    testSwapRSI,
    USDT,
    SLEEP,
    USDC,
    rsiContract,
    user,
    owner,
    addr1,
    addr2,
    addrs
  }
}

module.exports = { deployRSIFixture }
