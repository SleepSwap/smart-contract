// configs for testnet and mainnet contract deployments
const config = {
  accumulation: {
    testnet: {
      USDT: '0xE118429D095de1a93951c67D04B523fE5cbAB62c',
      ROUTER: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
      MIN_AMOUNT: '50000000000000000000', // 50 USDT 18 decimals
      MIN_GRIDS: 4, // 4
      MIN_PERCENT_CHANGE: 50 // 0.5% added 2 decimals for precision
    },
    mainnet: {
      USDT: '0xE118429D095de1a93951c67D04B523fE5cbAB62c',
      ROUTER: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
      MIN_AMOUNT: '50000000000000000000', //1 USDT 18 decimals
      MIN_GRIDS: 4, // 4
      MIN_PERCENT_CHANGE: 1000 // 10
    }
  },
  dca: {
    testnet: {},
    mainnet: {}
  },
  rsi: {
    testnet: {
      USDT: '0xE118429D095de1a93951c67D04B523fE5cbAB62c',
      ROUTER: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
      MIN_AMOUNT: '50000000000000000000', // 50 USDT 18 decimals
      RSI_PERIOD: 60, //seconds  time period for rsi checks
      RSI_THRESHOLD: 24 * 60 * 60 // seconds duration for which no two consecutive buy and sell orders can be placed
    },
    mainnet: {}
  }
}

module.exports = { config }
