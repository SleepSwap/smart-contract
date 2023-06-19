// SPDX-License-Identifier: MIT

pragma solidity ^0.8.7;
pragma abicoder v2;

import "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./TestSwap.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
// BASE TOKEN; USDT - usdtToken
// TRADE TOKENL: ERC20 - tokenAmount

contract SleepSwapDcaWithTestSwap is Ownable {
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
  mapping(address => mapping(address => uint256[])) public userOrdersMap;
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

  function addManager(address _manager) public onlyOwner {
    managers[_manager] = 1;
  }

  function updateFeePercent(uint256 _newFeePercent) public onlyOwner {
    feePercent = _newFeePercent;
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
    userOrdersMap[msg.sender][_tokenAddress].push(ordersCount);

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
    uint256[] storage userOrders = userOrdersMap[msg.sender][_tokenAddress];

    require(userOrders.length > 0, "No orders!");

    uint256 fiatBalanceToReturn = 0;
    uint256 tokenAmountToReturn = 0;
    //close existing open orders
    for (uint256 i = 0; i < userOrders.length; i++) {
      Order storage selectedOrder = orders[userOrders[i]];
       // because cancelled state only comes after withdraw.
      if(selectedOrder.status == orderStatus.CANCELLED || selectedOrder.status == orderStatus.WITHDRAWN )  continue;

      selectedOrder.status = orderStatus.WITHDRAWN;
      if (selectedOrder.executedTrades < selectedOrder.numOfTrades) {
        selectedOrder.status = orderStatus.CANCELLED;
      }

      fiatBalanceToReturn += selectedOrder.remainingAmount;
      tokenAmountToReturn += selectedOrder.tokenAccumulated;
      // token and usdt deduction from each order
      selectedOrder.remainingAmount = 0;
      selectedOrder.tokenAccumulated = 0;
      if (selectedOrder.status == orderStatus.CANCELLED) {
        emit OrderCancelled(
          selectedOrder.orderId,
          selectedOrder.executedTrades,
          selectedOrder.remainingAmount
        );
      }
    }

    // deducting  pool usdt balances
    poolBalance -= fiatBalanceToReturn;
    IERC20(usdtAddress).transfer(msg.sender, fiatBalanceToReturn);

    // return tokens if some numOfTrades have already executed
    if (tokenAmountToReturn > 0) {
      poolTokenBalances[_tokenAddress] -= tokenAmountToReturn;

      IERC20(_tokenAddress).transfer(msg.sender, tokenAmountToReturn);
    }

    emit Withdraw(
      msg.sender,
      userOrders,
      _tokenAddress,
      fiatBalanceToReturn,
      tokenAmountToReturn
    );
  }

  function _executeOrder(uint256 orderId) internal onlyManager {
    require(orderId > 0, "Order id must be greater than 0!");
    require(orderId <= ordersCount, "Invalid order id!");

    Order storage selectedOrder = orders[orderId];
    require(selectedOrder.status == orderStatus.OPEN, "Order removed!");
    require(
      selectedOrder.lastExecutionTime + selectedOrder.frequency.mul(SECONDS_IN_A_DAY) <= block.timestamp,
      "Order can't be executed yet!"
    );
    require(
      selectedOrder.executedTrades < selectedOrder.numOfTrades,
      "All trades executed! Order completed!"
    );
    uint256 amountToSell;
    if ( selectedOrder.remainingAmount < selectedOrder.tradeAmount) {
      amountToSell = selectedOrder.remainingAmount;
      selectedOrder.remainingAmount = 0;
    }
    else {
      amountToSell = selectedOrder.tradeAmount;
      selectedOrder.remainingAmount -= selectedOrder.tradeAmount;
    }
    poolBalance -= amountToSell; // deduct usdt from pool on order executed
    selectedOrder.executedTrades += 1;
    selectedOrder.lastExecutionTime = block.timestamp;


    uint256 tokenReceived = swapTokenFromUsdtTest(
        amountToSell
      );

    // update tokens recieved to order token balance
    selectedOrder.tokenAccumulated += tokenReceived;

    // update tokens recieved to pool token balance
    poolTokenBalances[selectedOrder.tokenAddress] += tokenReceived;

    //stop the order if all numOfTrades executed
    if (selectedOrder.executedTrades == selectedOrder.numOfTrades) {
      selectedOrder.status = orderStatus.COMPLETED;
    }

    emit OrderExecuted(
      orderId,
      amountToSell,
      tokenReceived,
      selectedOrder.executedTrades,
      selectedOrder.remainingAmount
    );

    if(selectedOrder.status == orderStatus.COMPLETED) {
      emit OrderCompleted(orderId, selectedOrder.depositAmount, selectedOrder.tokenAccumulated, selectedOrder.tokenAddress);
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
