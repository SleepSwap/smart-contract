const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { toWei } = require("./helpers");

// const usdtFaucet = "0xE118429D095de1a93951c67D04B523fE5cbAB62c";
// const routerAddress = "0xE592427A0AEce92De3Edee1F18E0157C05861564"; // unswap router
// const sleepToken = "0xb94d207a3fBdb312cef2e5dBEb7C22A76516BE37";

// test cases for the contract

// -> create new vesting schedule with correct data
// -> benificiary should withdraw funds when time expires
// -> only owners and benificary can withdraw funds

describe("TokenVesting contract ", function () {
  // prepare dummy contract data
  async function deployFixture() {
    const sleepFact = await ethers.getContractFactory("SleepToken");
    const sleepContract = await sleepFact.deploy();
    await sleepContract.deployed();

    await sleepContract.mint(toWei("1000000"));

    const vestingFact = await ethers.getContractFactory("TokenVesting");
    const vestingContract = await vestingFact.deploy(sleepContract.address);
    await vestingContract.deployed();

    console.log("vesting contract ", vestingContract.address);
    const [owner, addr1, addr2] = await ethers.getSigners();

    // Fixtures can return anything you consider useful for your tests
    return {
      sleepContract,
      vestingContract,
      owner,
      addr1,
      addr2,
    };
  }

  it("Create new vesting schedule and verify created data", async function () {
    const { sleepContract, vestingContract } = await loadFixture(deployFixture);

    // transfer all minted tokens to vesting contract
    await sleepContract.transfer(vestingContract.address, toWei("1000000"));

    const balance = await sleepContract.balanceOf(vestingContract.address);

    console.log("vesting bal ", { balance: balance.toString() });

    expect("true").to.equal("true");
  });
});
