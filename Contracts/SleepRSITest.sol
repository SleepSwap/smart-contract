// SPDX-License-Identifier: MIT

pragma solidity ^0.8.7;
pragma abicoder v2;

import "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./TestSwapRSI.sol";

// BASE TOKEN; USDT - usdtToken
// TRADE TOKENL: ERC20 - tokenAmount

contract SleepRSITest is Ownable {
    using SafeCast for int256;
    using SafeMath for uint256;
    string public name = "SleepSwap RSI";

    //manager: execute trx
    mapping(address => uint256) public managers;
    address public usdtAddress;

    mapping(address => uint256) public poolTokenBalances; // balance mapping for all tokens

    // Fees 0.005%
    mapping(address => uint256) public fee;
    uint256 public feePercent = 5;

    // RSI period in seconds: time interval for RSI calculation
    uint256 public rsiPeriod = 1 * 60; // 1 minute

    // RSI threshold: time interval for two consecutive buys and sell orders
    uint256 public rsiThreshold = 8 * 60 * 60; // 8 hours

    uint256 public gridSize = 3; //  no of buy and sell for each order

    // minimum order amount
    uint256 public minimumInvestmentAmount;

    struct OrderExecutionStatus {
        uint256 buyCount;
        uint256 sellCount;
    }

    struct Order {
        uint256 orderId;
        address user;
        address tokenAddress; // token adddress which user want to buy or sell
        uint256 investedAmount; // usdt invested amount
        uint256 orderTokens;
        uint256 orderFiats;
        uint256 tokenBalance; // token balance in order
        uint256 fiatBalance; // fiat balance in order
        uint256 entryPrice; // entry price of order
        OrderExecutionStatus executionStatus;
        bool open;
    }

    // total orders in contarct
    uint256 public ordersCount = 0;

    // mappings: orderId => Order
    mapping(uint256 => Order) public orders;

    // user => tokenAddress => orderId
    mapping(address => mapping(address => uint256)) public userOrders;
    // 0x7D.  --> PBR --> 1
    // 0x7D.  --> BTC --> 2
    // 0x7D.  --> ETH --> 3
    // 0x8c.  --> PBR --> 4
    // 0x8c.  --> BTC --> 5
    // 0x8c.  --> ETH --> 6

    // router address where swap trade will happen
    address public immutable swapRouter;

    // For this example, we will set the swap pool fee to 0.3%.
    uint24 public constant poolFee = 3000;

    // events:
    event Invested(
        uint256 orderId,
        address indexed user,
        uint256 amount,
        uint256 entryPrice,
        address tokenAddress
    );

    event OrderExecuted(
        uint256 orderId,
        uint256 fiatAmount,
        uint256 tokenAmount,
        uint256 rsiValue,
        string orderType
    );

    event OrderCancelled(uint256 orderId, address indexed user);

    event Withdraw(
        address indexed user,
        uint256 orderId,
        address tokenAddress,
        uint256 fiatAmount,
        uint256 tokenAmount
    );

    // init contract
    constructor(
        address _usdtAddress,
        address _swapRouter,
        uint256 _minimumInvestment,
        uint256 _rsiPeriod,
        uint256 _rsiThresold
    ) {
        usdtAddress = _usdtAddress;
        swapRouter = _swapRouter;
        managers[msg.sender] = 1; // set deployer as manager
        minimumInvestmentAmount = _minimumInvestment;
        rsiPeriod = _rsiPeriod;
        rsiThreshold = _rsiThresold;
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
        require(_newFeePercent > 0, "Invalid fee percent!");

        feePercent = _newFeePercent;
    }

    function updateInvestmentAmount(uint256 _amount) public onlyOwner {
        require(_amount > 0, "Invalid amount!");

        minimumInvestmentAmount = _amount;
    }

    function updateRsiPeriod(uint256 _period) public onlyOwner {
        require(_period > 0, "Invalid rsi period!");

        rsiPeriod = _period;
    }

    function updateRsiThresold(uint256 _rsiThresold) public onlyOwner {
        require(_rsiThresold > 0, "Invalid RSI thresold!");
        rsiThreshold = _rsiThresold;
    }

    // // generic swap function to buy and sell tokens on uniswap
    // function swapTokens(
    //     uint256 _amountIn,
    //     address _fromTokenAddress,
    //     address _toTokenAddress,
    // ) internal returns (uint256 amountOut) {
    //     // Fee deduction
    //     uint256 order_fee = _amountIn.mul(feePercent).div(10000);
    //     fee += order_fee;
    //     uint256 amountInAfterFee = _amountIn - order_fee;

    //     address from_token = _fromTokenAddress;
    //     address to_token = _toTokenAddress;

    //     // Approve the router to spend input token
    //     TransferHelper.safeApprove(from_token, swapRouter, amountInAfterFee);

    //     // Naively set amountOutMinimum to 0. In production, use an oracle or other data source to choose a safer value for amountOutMinimum.
    //     // We also set the sqrtPriceLimitx96 to be 0 to ensure we swap our exact input amount.
    //     ISwapRouter.ExactInputSingleParams memory params = ISwapRouter
    //         .ExactInputSingleParams({
    //             tokenIn: from_token,
    //             tokenOut: to_token,
    //             fee: poolFee,
    //             recipient: address(this),
    //             deadline: block.timestamp,
    //             amountIn: amountInAfterFee,
    //             amountOutMinimum: 0,
    //             sqrtPriceLimitX96: 0
    //         });

    //     // The call to exactInputSingle executes the swap.
    //     amountOut = ISwapRouter(swapRouter).exactInputSingle(params);
    // }

    // buy and sell tokens on uniswap
    function swapTokens(
        uint256 _amountIn,
        address _from,
        address _to,
        uint256 _price
    ) internal returns (uint256 amountOut) {
        // Fee deduction
        uint256 order_fee = _amountIn.mul(feePercent).div(10000);
        fee[_from] += order_fee;
        uint256 amountInAfterFee = _amountIn - order_fee;

        address from_token = _from;
        address to_token = _to;

        // Approve the router to spend input token
        TransferHelper.safeApprove(from_token, swapRouter, amountInAfterFee);

        // Naively set amountOutMinimum to 0. In production, use an oracle or other data source to choose a safer value for amountOutMinimum.
        // We also set the sqrtPriceLimitx96 to be 0 to ensure we swap our exact input amount.
        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter
            .ExactInputSingleParams({
                tokenIn: from_token,
                tokenOut: to_token,
                fee: poolFee,
                recipient: address(this),
                deadline: block.timestamp,
                amountIn: amountInAfterFee,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
            });

        // The call to exactInputSingle executes the swap.
        amountOut = ISwapRouter(swapRouter).exactInputSingle(params);
    }

    // buy and sell tokens on TestSwap
    function swapTokensTest(
        uint256 _amountIn,
        address _from,
        address _to,
        uint256 _swapPrice // swap price to simulate swap from mock router
    ) internal returns (uint256 amountOut) {
        // Fee deduction
        uint256 order_fee = _amountIn.mul(feePercent).div(10000);
        fee[_from] += order_fee;
        uint256 _amountInAfterFee = _amountIn - order_fee;

        // check if buy
        if (_from == usdtAddress) {
            // buy tokens with usdt
            // Approve the router to spend USDT.
            TransferHelper.safeApprove(_from, swapRouter, _amountInAfterFee);

            // test version of swap
            amountOut = TestSwapRSI(swapRouter).swapFromUsdt(
                _amountInAfterFee,
                _swapPrice
            );
        } else {
            // sell tokens for usdt
            // Approve the router to spend USDT.
            TransferHelper.safeApprove(_from, swapRouter, _amountInAfterFee);

            // test version of swap
            amountOut = TestSwapRSI(swapRouter).swapFromTokens(
                _amountInAfterFee,
                _swapPrice
            );
        }
    }

    function invest(
        uint256 _amount,
        uint256 _entryPrice,
        address _tokenAddress
    ) public {
        require(
            _amount >= minimumInvestmentAmount,
            "amount less than minimum investment limit!"
        );
        require(_entryPrice > 0, "Invalid entry price!");
        require(_tokenAddress != address(0), "Invalid entry price!");

        // Transfer the specified amount of USDT to this contract.
        TransferHelper.safeTransferFrom(
            usdtAddress,
            msg.sender,
            address(this),
            _amount
        );
        ordersCount++;

        // swap half of the tokens to usdt with current price
        uint256 tokenReceived = swapTokensTest(
            _amount.div(2),
            usdtAddress,
            _tokenAddress,
            _entryPrice
        );

        uint256 remainingFiat = _amount.div(2);

        OrderExecutionStatus memory status = OrderExecutionStatus({
            buyCount: 0,
            sellCount: 0
        });
        Order memory new_order = Order({
            orderId: ordersCount,
            user: msg.sender,
            tokenAddress: _tokenAddress,
            investedAmount: _amount,
            orderTokens: tokenReceived.div(gridSize),
            orderFiats: remainingFiat.div(gridSize),
            tokenBalance: tokenReceived,
            fiatBalance: remainingFiat,
            entryPrice: _entryPrice,
            executionStatus: status,
            open: true
        });

        orders[ordersCount] = new_order;
        userOrders[msg.sender][_tokenAddress] = ordersCount;

        // update pool token balance on token swap
        poolTokenBalances[_tokenAddress] += tokenReceived;
        // Updating  pool usdt balance when user deposit usdt
        poolTokenBalances[usdtAddress] += remainingFiat;

        emit Invested(
            ordersCount,
            msg.sender,
            _amount,
            _entryPrice,
            _tokenAddress
        );
    }

    function _runBuyOrders(
        uint256[] memory _orderIds,
        uint256 _rsiValue,
        uint256 _price
    ) internal onlyManager {
        for (uint256 i = 0; i < _orderIds.length; i++) {
            require(_orderIds[i] > 0, "Order id must be greater than 0!");
            Order storage selected_order = orders[_orderIds[i]];
            require(selected_order.open, "Order removed!");
            require(
                selected_order.executionStatus.buyCount < gridSize,
                "All orders executed"
            );
            require(
                selected_order.fiatBalance >= selected_order.orderFiats,
                "Insufficient usdt to execute buy order!"
            );

            uint256 amountIn = selected_order.orderFiats;
            //: change this to uniswap swap in production
            uint256 amountOut = swapTokensTest(
                amountIn,
                usdtAddress,
                selected_order.tokenAddress,
                _price
            );

            selected_order.fiatBalance -= amountIn;
            selected_order.executionStatus.buyCount += 1;
            selected_order.tokenBalance += amountOut;

            poolTokenBalances[usdtAddress] -= selected_order.orderFiats; // deduct usdt from pool on order executed
            poolTokenBalances[selected_order.tokenAddress] += amountOut; // add tokens to pool on order executed

            if (
                selected_order.executionStatus.sellCount == gridSize &&
                selected_order.executionStatus.buyCount == gridSize
            ) {
                selected_order.open = false;
            }

            emit OrderExecuted(
                selected_order.orderId,
                amountIn,
                amountOut,
                _rsiValue,
                "Buy"
            );
        }
    }

    function _runSellOrders(
        uint256[] memory _orderIds,
        uint _rsiValue,
        uint256 _price
    ) internal onlyManager {
        for (uint256 i = 0; i < _orderIds.length; i++) {
            require(_orderIds[i] > 0, "Order id must be greater than 0!");
            Order storage selected_order = orders[_orderIds[i]];
            require(selected_order.open, "Order removed!");
            require(
                selected_order.executionStatus.sellCount < gridSize,
                "All orders executed"
            );
            require(
                selected_order.tokenBalance >= selected_order.orderTokens,
                "Insufficient tokens to execute sell order!"
            );

            uint256 amountIn = selected_order.orderTokens;
            //: change this to uniswap swap in production
            uint256 amountOut = swapTokensTest(
                amountIn,
                selected_order.tokenAddress,
                usdtAddress,
                _price
            );

            selected_order.tokenBalance -= amountIn;
            selected_order.executionStatus.sellCount += 1;
            selected_order.fiatBalance += amountOut;

            poolTokenBalances[usdtAddress] += amountOut; // add usdt to pool on order executed
            poolTokenBalances[selected_order.tokenAddress] -= amountIn; // deduct tokens from pool on order executed

            if (
                selected_order.executionStatus.sellCount == gridSize &&
                selected_order.executionStatus.buyCount == gridSize
            ) {
                selected_order.open = false;
            }

            emit OrderExecuted(
                selected_order.orderId,
                amountIn,
                amountOut,
                _rsiValue,
                "Sell"
            );
        }
    }

    // only manager
    function executeOrders(
        uint256[] memory _orderIds,
        uint256 _rsiValue,
        uint256 _price
    ) public onlyManager {
        require(_orderIds.length > 0, "No orders to execute!");
        require(_rsiValue > 0, "RSI value must greater than 0!");
        require(_rsiValue < 100, "RSI value must less than 100!");
        require(
            _rsiValue <= 30 || _rsiValue >= 70,
            "RSI value must between 30,70!"
        );

        if (_rsiValue <= 30) {
            _runBuyOrders(_orderIds, _rsiValue, _price);
            // run buy order
        } else {
            _runSellOrders(_orderIds, _rsiValue, _price);
            // run sell order
        }
    }

    function withdrawByOrderId(uint256 _orderId) public {
        // if order id exists
        require(orders[_orderId].user != address(0), "Invalid order id!");
        require(
            orders[_orderId].user == msg.sender,
            "Can't withdraw others order!"
        );

        Order storage _order = orders[_orderId];

        uint256 usdtInOrder = _order.fiatBalance;

        if (usdtInOrder > 0) {
            // deduct usdt from order
            _order.fiatBalance = 0;
            // deduct usdt from pool
            poolTokenBalances[usdtAddress] -= usdtInOrder;

            IERC20(usdtAddress).transfer(msg.sender, usdtInOrder);
        }

        // deduct tokens from order if any
        uint256 tokenInOrder = _order.tokenBalance;
        if (tokenInOrder > 0) {
            _order.tokenBalance = 0;
            poolTokenBalances[_order.tokenAddress] -= tokenInOrder;
            IERC20(_order.tokenAddress).transfer(msg.sender, tokenInOrder);
        }

        _order.open = false;

        emit OrderCancelled(_order.orderId, msg.sender);
    }

    function withdraw(address _tokenAddress) public {
        require(_tokenAddress != address(0), "Invalid token address!");

        uint256 user_orderId = userOrders[msg.sender][_tokenAddress];

        uint256 fiat_balance_to_return = 0;
        uint256 token_amount_to_return = 0;

        Order storage selected_order = orders[user_orderId];

        fiat_balance_to_return = selected_order.fiatBalance;
        token_amount_to_return = selected_order.tokenBalance;
        selected_order.open = false;
        // token and usdt deduction from each order
        selected_order.fiatBalance = 0;
        selected_order.tokenBalance = 0;

        emit OrderCancelled(selected_order.orderId, msg.sender);

        // deducting  pool usdt balances
        if (fiat_balance_to_return > 0) {
            poolTokenBalances[usdtAddress] -= fiat_balance_to_return;
            IERC20(usdtAddress).transfer(msg.sender, fiat_balance_to_return);
        }

        // return tokens if some grids have already executed
        if (token_amount_to_return > 0) {
            poolTokenBalances[_tokenAddress] -= token_amount_to_return;

            IERC20(_tokenAddress).transfer(msg.sender, token_amount_to_return);
        }

        emit Withdraw(
            msg.sender,
            user_orderId,
            _tokenAddress,
            fiat_balance_to_return,
            token_amount_to_return
        );
    }

    function emergencyWithdrawPoolTokens(address _token) public onlyOwner {
        require(poolTokenBalances[_token] > 0, "Empty pool!");

        uint256 balanceToWtithdraw = poolTokenBalances[_token];
        poolTokenBalances[_token] = 0;
        IERC20(_token).transfer(msg.sender, balanceToWtithdraw);
    }

    function emergencyWithdrawPoolUsdt() public onlyOwner {
        require(poolTokenBalances[usdtAddress] > 0, "Zero usdt in pool!");

        uint256 usdtToWithdraw = poolTokenBalances[usdtAddress];
        poolTokenBalances[usdtAddress] = 0;
        IERC20(usdtAddress).transfer(msg.sender, usdtToWithdraw);
    }
}
