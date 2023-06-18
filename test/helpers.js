const { default: BigNumber } = require("bignumber.js");

function fromWei(tokens, decimals = 18) {
  try {
    if (!tokens) {
      return new BigNumber(0).toString();
    }

    return new BigNumber(tokens)
      .div(new BigNumber(10).exponentiatedBy(decimals))
      .toString();
  } catch (error) {
    console.log("exeption in fromWei ", error);
    return null;
  }
}

function toWei(tokens, decimals = 18) {
  try {
    if (!tokens) {
      return new BigNumber(0).toString();
    }
    return new BigNumber(tokens)
      .multipliedBy(new BigNumber(10).exponentiatedBy(decimals))
      .toFixed(0)
      .toString();
  } catch (error) {
    console.log("exeption in toWei , ", error);
    return null;
  }
}

const MIN_AMOUNT = toWei("50");
const MIN_GRIDS = 4;
const MIN_PERCENT_CHANGE = 10;

module.exports = { fromWei, toWei, MIN_AMOUNT, MIN_GRIDS, MIN_PERCENT_CHANGE };
