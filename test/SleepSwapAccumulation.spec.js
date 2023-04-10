const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

const usdtFaucet = "0xE118429D095de1a93951c67D04B523fE5cbAB62c";
const routerAddress = "0xE592427A0AEce92De3Edee1F18E0157C05861564";

describe("Accumulation contract ", function () {
  // prepare dummy contract data
  async function deployFixture() {
    const accumulationFactory = await ethers.getContractFactory(
      "SleepSwapAccumulation"
    );

    const [owner, addr1, addr2] = await ethers.getSigners();

    const accumulationContract = await accumulationFactory.deploy(
      usdtFaucet,
      routerAddress
    );

    await accumulationContract.deployed();

    // Fixtures can return anything you consider useful for your tests
    return { accumulationContract, owner, addr1, addr2 };
  }

  it("Deployer must be the owner ", async function () {
    const { accumulationContract, owner } = await loadFixture(deployFixture);

    const isManager = await accumulationContract.managers(owner.address);
    // console.log("isManager ", isManager.);
    expect(isManager.toString()).to.equal("1");
  });
  it("New address must not be the owner", async function () {
    const { accumulationContract, addr1 } = await loadFixture(deployFixture);

    const isManager = await accumulationContract.managers(addr1.address);
    // console.log("isManager new address ", { isManager: isManager.toString() });
    expect(isManager.toString()).to.equal("0");
  });
});
