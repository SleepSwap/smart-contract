// SPDX-License-Identifier: MIT

pragma solidity ^0.8.7;
pragma abicoder v2;

import "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./TestSwap.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";// BASE TOKEN; USDT - usdtToken
// TRADE TOKENL: ERC20 - tokenAmount

contract SleepSwapDca is Ownable {
  using SafeCast for int256;
  using SafeMath for uint256;
  string public name = "DCA";

  //manager: allowed to execute trades
  mapping(address => uint256) public managers;
  //allowed stragies for dca
  mapping(uint256 => uint256) public frequenciesMapInDays;

  enum orderStatus {
    OPEN,
    COMPLETED,
    CANCELLED,
    WITHDRAWN
  }

  address public usdtAddress;
  uint256 public poolBalance; // usdt balance in pool
  mapping(address => uint256) public poolTokenBalances; // balance mapping for all tokens

  uint256 internal testMode = 0; // 0/1

  // Fees 0.005%
  uint256 public fee;
  uint256 public feePercent = 5;

  struct Order {
    uint256 orderId; // to identify order
    address user; // user address
    address tokenAddress; // token address of the buying token
    uint256 lastExecutionTime; // last execution time of this order
    uint256 depositAmount; // amount of sellling token deposited
    uint256 remainingAmount; // remaining amount of deposit token (usdt)
    uint256 tokenAccumulated; // amount buying token accumulated
    uint256 frequency; // frequency of trades [daily, weekly, monthly]
    uint256 tradeAmount; // amount of usdt per trade
    uint256 numOfTrades; // number of trades
    uint256 executedTrades; // number of trades executed
    orderStatus status; // order status
  }

  uint256 public ordersCount = 0;
  // mappings
  mapping(uint256 => Order) public orders;
  mapping(address => mapping(address => uint256[])) public userOrders;
  // 0x7D.  --> PBR --> [1,2,3]
  // 0x8c.  --> PBR --> [5,6]

  // swap initializations
  address public immutable swapRouter;

  uint24 public constant POOL_FEE = 3000;
  uint128 public constant SECONDS_IN_A_DAY = 86400;

  // events:
  event Invested(
    address indexed user,
    uint256 orderId,
    uint256 amount,
    uint256 numberOfMaxTrades,
    uint256 amountPerTrade,
    uint256 frequencyInDays,
    uint256 creationTimeStampInMs,
    address tokenAddress
  );

  //trade executed
  event OrderExecuted(
    uint256 orderId,
    uint256 fiatAmount,
    uint256 tokenReceived,
    uint256 executionGrid,
    uint256 remainingAmount
  );
  event OrderCompleted (
    uint256 orderId,
    uint256 fiatAmount,
    uint256 tokenReceived,
    address tokenAddress
  );

  event OrderCancelled(
    uint256 orderId,
    uint256 executedTrades,
    uint256 remainingAmount
  );

  event Withdraw(
    address indexed user,
    uint256[] orderIds,
    address tokenAddress,
    uint256 fiatAmount,
    uint256 tokenAmount
  );
  event ExecutionError(uint256 orderId, string error);


  // init contract
  constructor(address _usdtAddress, address _swapRouter) {
    usdtAddress = _usdtAddress;
    swapRouter = _swapRouter;
    managers[msg.sender] = 1;
    frequenciesMapInDays[1] = 1;
    frequenciesMapInDays[7] = 7;
    frequenciesMapInDays[8] = 30;
  }

  //modifiers
  modifier onlyManager() {
    require(managers[msg.sender] == 1);
    _;
  }

  // methods
  function enableTestMode() public onlyOwner {
    testMode = 1;
  }

  function disableTestMode() public onlyOwner {
    testMode = 0;
  }

  function addManager(address _manager) public onlyOwner {
    managers[_manager] = 1;
  }

  function updateFeePercent(uint256 _newFeePercent) public onlyOwner {
    feePercent = _newFeePercent;
  }

  function swapTokenFromUsdt(
    uint256 _amountIn,
    address _tokenAddress
  ) internal returns (uint256 amountOut) {
    // Fee deduction
    uint256 order_fee = _amountIn.mul(feePercent).div(10000);
    fee += order_fee;
    uint256 usdt_for_trade = _amountIn - order_fee;
    address from_token = usdtAddress;
    address to_token = _tokenAddress;

    // Approve the router to spend USDT.
    TransferHelper.safeApprove(from_token, swapRouter, usdt_for_trade);

    // Naively set amountOutMinimum to 0. In production, use an oracle or other data source to choose a safer value for amountOutMinimum.
    // We also set the sqrtPriceLimitx96 to be 0 to ensure we swap our exact input amount.
    ISwapRouter.ExactInputSingleParams memory params = ISwapRouter.ExactInputSingleParams({
      tokenIn: from_token,
      tokenOut: to_token,
      fee: POOL_FEE,
      recipient: address(this),
      deadline: block.timestamp,
      amountIn: usdt_for_trade,
      amountOutMinimum: 0,
      sqrtPriceLimitX96: 0
    });

    // The call to exactInputSingle executes the swap.
    amountOut = ISwapRouter(swapRouter).exactInputSingle(params);
  }

  // function to be used for testing swaps
  function swapTokenFromUsdtTest(
    uint256 _amountIn
  ) internal returns (uint256 amountOut) {
    // Fee deduction
    uint256 order_fee = _amountIn.mul(feePercent).div(10000);
    fee += order_fee;
    uint256 usdt_for_trade = _amountIn - order_fee;

    address from_token = usdtAddress;
    // Approve the router to spend USDT.
    TransferHelper.safeApprove(from_token, swapRouter, usdt_for_trade);

    // test version of swap
    amountOut = TestSwap(swapRouter).swapFromUsdt(usdt_for_trade);
  }

  function invest(uint256 _amount, uint256 amountPerTrade, uint256 frequency, address _tokenAddress) public {
    // Transfer the specified amount of USDT to this contract.
    require(_amount > 0, "Amount must be greater than 0");
    require(amountPerTrade > 0, "amountPerTrade must be greater than 0");
    require(amountPerTrade < _amount, "amountPerTrade must be smaller than amount");
    require(frequenciesMapInDays[frequency] > 0, "Frequency must be daily, weekly or monthly");

    TransferHelper.safeTransferFrom(usdtAddress, msg.sender, address(this), _amount);

    // find number of trades to be executed according to amount and step size, last trade is done on whatever amount is left in the order
    uint256 remainder = _amount.mod(amountPerTrade);
    uint256 numOfTrades = uint256((_amount.sub(remainder).div(amountPerTrade)));
    if (remainder > 0) {
      numOfTrades++;
    }

    ordersCount++;
    Order memory newOrder = Order({
      orderId: ordersCount,
      user: msg.sender,
      tokenAddress: _tokenAddress, // WHICH COIN TO BUY
      lastExecutionTime: block.timestamp,
      depositAmount: _amount, // TOTAL AMOUNT
      remainingAmount: _amount, // REMAINING AMOUNT
      tokenAccumulated: 0, // TOKEN ACCUMULATED
      tradeAmount: amountPerTrade, // AMOUNT PER TRADE
      numOfTrades: numOfTrades, // max number trades to mark this order as completed
      executedTrades: 0, // NUMBER OF TRADES EXECUTED
      frequency: frequenciesMapInDays[frequency], // FREQUENCY OF TRADES
      status: orderStatus.OPEN
    });

    orders[ordersCount] = newOrder;
    userOrders[msg.sender][_tokenAddress].push(ordersCount);

    // Updating  pool usdt balance when user deposit usdt
    poolBalance += _amount;

    emit Invested(
      msg.sender,
      ordersCount,
      _amount,
      newOrder.numOfTrades,
      newOrder.tradeAmount,
      newOrder.frequency,
      newOrder.lastExecutionTime,
      _tokenAddress
    );
  }

  function withdrawByOrderId(uint256 _orderId) public {
    // if order id exists
    require(orders[_orderId].user != address(0), "Invalid order id!");
    require(orders[_orderId].user == msg.sender, "Can't withdraw others order!");
    require(orders[_orderId].status == orderStatus.OPEN || orders[_orderId].status == orderStatus.COMPLETED, "Order is already withdrawn from and processed!");

    Order storage _order = orders[_orderId];
    uint256 orderUsdt;

    orderStatus originalStatus = _order.status;
    _order.status = orderStatus.CANCELLED;
    if (originalStatus == orderStatus.COMPLETED) {
      _order.status = orderStatus.WITHDRAWN;
    }

    orderUsdt = _order.remainingAmount;
    _order.remainingAmount = 0;// deduct usdt from order
    poolBalance -= orderUsdt;// deduct usdt from pool


    IERC20(usdtAddress).transfer(msg.sender, orderUsdt);

    // deduct tokens from order if any
    uint256 orderToken = _order.tokenAccumulated;

    if (orderToken > 0) {
      // deduct tokens from order
      _order.tokenAccumulated = 0;

      // deduct tokens from pool
      poolTokenBalances[_order.tokenAddress] -= orderToken;

      IERC20(_order.tokenAddress).transfer(msg.sender, orderToken);
    }
    if(_order.status == orderStatus.CANCELLED) {
      emit OrderCancelled(
        _order.orderId,
        _order.executedTrades,
        _order.remainingAmount
        );
    } else {
      uint256[] memory orderIds = new uint256[](1);
      orderIds[0] = _order.orderId;
      emit Withdraw(
        msg.sender,
        orderIds,
        _order.tokenAddress,
        _order.remainingAmount,
        _order.tokenAccumulated
      );
    }
  }

  function withdraw(address _tokenAddress) public {
    uint256[] storage user_orders = userOrders[msg.sender][_tokenAddress];

    require(user_orders.length > 0, "No orders!");

    uint256 fiat_balance_to_return = 0;
    uint256 token_amount_to_return = 0;
    //close existing open orders
    for (uint256 i = 0; i < user_orders.length; i++) {
      Order storage selected_order = orders[user_orders[i]];
       // because cancelled state only comes after withdraw.
      if(selected_order.status == orderStatus.CANCELLED || selected_order.status == orderStatus.WITHDRAWN )  continue;

      selected_order.status = orderStatus.WITHDRAWN;
      if (selected_order.executedTrades < selected_order.numOfTrades) {
        selected_order.status = orderStatus.CANCELLED;
      }

      fiat_balance_to_return += selected_order.remainingAmount;
      token_amount_to_return += selected_order.tokenAccumulated;
      // token and usdt deduction from each order
      selected_order.remainingAmount = 0;
      selected_order.tokenAccumulated = 0;
      if (selected_order.status == orderStatus.CANCELLED) {
        emit OrderCancelled(
          selected_order.orderId,
          selected_order.executedTrades,
          selected_order.remainingAmount
        );
      }
    }

    // deducting  pool usdt balances
    poolBalance -= fiat_balance_to_return;
    IERC20(usdtAddress).transfer(msg.sender, fiat_balance_to_return);

    // return tokens if some numOfTrades have already executed
    if (token_amount_to_return > 0) {
      poolTokenBalances[_tokenAddress] -= token_amount_to_return;

      IERC20(_tokenAddress).transfer(msg.sender, token_amount_to_return);
    }

    emit Withdraw(
      msg.sender,
      user_orders,
      _tokenAddress,
      fiat_balance_to_return,
      token_amount_to_return
    );
  }

  function _executeOrder(uint256 orderId) internal onlyManager {
    require(orderId > 0, "Order id must be greater than 0!");
    require(orderId <= ordersCount, "Invalid order id!");

    Order storage selected_order = orders[orderId];
    require(selected_order.status == orderStatus.OPEN, "Order removed!");
    require(
      selected_order.lastExecutionTime + selected_order.frequency.mul(SECONDS_IN_A_DAY) <= block.timestamp,
      "Order can't be executed yet!"
    );
    require(
      selected_order.executedTrades < selected_order.numOfTrades,
      "All trades executed! Order completed!"
    );
    uint256 amountToSell;
    if ( selected_order.remainingAmount < selected_order.tradeAmount) {
      amountToSell = selected_order.remainingAmount;
      selected_order.remainingAmount = 0;
    }
    else {
      amountToSell = selected_order.tradeAmount;
      selected_order.remainingAmount -= selected_order.tradeAmount;
    }
    poolBalance -= amountToSell; // deduct usdt from pool on order executed
    selected_order.executedTrades += 1;
    selected_order.lastExecutionTime = block.timestamp;


    // TODO: remove this in production code
    uint256 token_received;
    if (testMode == 1) {
      token_received = swapTokenFromUsdtTest(
        amountToSell
      );
    } else {
      token_received = swapTokenFromUsdt(
        amountToSell,
        selected_order.tokenAddress
      );
    }

    // update tokens recieved to order token balance
    selected_order.tokenAccumulated += token_received;

    // update tokens recieved to pool token balance
    poolTokenBalances[selected_order.tokenAddress] += token_received;

    //stop the order if all numOfTrades executed
    if (selected_order.executedTrades == selected_order.numOfTrades) {
      selected_order.status = orderStatus.COMPLETED;
    }

    emit OrderExecuted(
      orderId,
      amountToSell,
      token_received,
      selected_order.executedTrades,
      selected_order.remainingAmount
    );

    if(selected_order.status == orderStatus.COMPLETED) {
      emit OrderCompleted(orderId, selected_order.depositAmount, selected_order.tokenAccumulated, selected_order.tokenAddress);
    }
    }

  // only manager
  function executeOrders(uint256[] memory _orderIds) public onlyManager {
    for (uint256 i = 0; i < _orderIds.length; i++) {
      _executeOrder(_orderIds[i]);
    }
  }

  function emergencyWithdrawPoolTokens(address _token) public onlyOwner {
    require(poolTokenBalances[_token] > 0, "Empty pool!");

    uint256 balanceToWtithdraw = poolTokenBalances[_token];
    poolTokenBalances[_token] = 0;
    IERC20(_token).transfer(msg.sender, balanceToWtithdraw);
  }

  function emergencyWithdrawPoolUsdt() public onlyOwner {
    require(poolBalance > 0, "Zero usdt in pool!");

    uint256 usdtToWithdraw = poolBalance;
    poolBalance = 0;
    IERC20(usdtAddress).transfer(msg.sender, usdtToWithdraw);
  }
}
