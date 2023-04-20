// SPDX-License-Identifier: MIT

pragma solidity ^0.8.7;
pragma abicoder v2;

import "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./TestSwap.sol";

// BASE TOKEN; USDT - usdtToken
// TRADE TOKENL: ERC20 - tokenAmount

contract SleepSwapAccumulation is Ownable {
    using SafeCast for int256;
    using SafeMath for uint256;
    string public name = "SleepSwap Accumulation";

    //manager: execute trx
    mapping(address => uint256) public managers;
    address public usdtAddress;
    uint256 public poolBalance; // usdt balance in pool
    mapping(address => uint256) public poolTokenBalances; // balance mapping for all tokens

    uint256 internal testMode = 0; // 0/1

    // Fees
    uint256 public fee;
    uint256 public feePercent = 5;

    struct Order {
        uint256 orderId;
        address user;
        address tokenAddress;
        uint256 entryPrice;
        uint256 prevPrice;
        uint256 depositAmount;
        uint256 remainingAmount;
        uint256 fiatOrderAmount;
        uint256 tokenAccumulated;
        uint256 grids;
        uint256 percentage;
        uint256 executedGrids;
        bool open;
    }

    uint256 public ordersCount = 0;
    // mappings
    mapping(uint256 => Order) public orders;
    mapping(address => mapping(address => uint256[])) public userOrders;
    // 0x7D.  --> PBR --> [1,2,3]
    // 0x8c.  --> PBR --> [5,6]

    // swap initializations
    address public immutable swapRouter;

    // For this example, we will set the pool fee to 0.3%.
    uint24 public constant poolFee = 3000;

    // events:
    event Invested(
        uint256 orderId,
        address indexed user,
        uint256 amount,
        uint256 grids,
        uint256 percentage,
        uint256 entryPrice,
        address tokenAddress
    );

    event OrderExecuted(
        uint256 orderId,
        uint256 fiatAmount,
        uint256 tokenReceived,
        uint256 executionGrid,
        uint256 remainingAmount
    );

    event OrderCancelled(
        uint256 orderId,
        uint256 executedGrids,
        uint256 remainingAmount
    );

    event Withdraw(
        address indexed user,
        uint256[] orderIds,
        address tokenAddress,
        uint256 fiatAmount,
        uint256 tokenAmount
    );

    // init contract
    constructor(address _usdtAddress, address _swapRouter) {
        usdtAddress = _usdtAddress;
        swapRouter = _swapRouter;
        managers[msg.sender] = 1;
    }

    //modifiers
    modifier onlyManager() {
        require(managers[msg.sender] == 1);
        _;
    }

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
        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter
            .ExactInputSingleParams({
                tokenIn: from_token,
                tokenOut: to_token,
                fee: poolFee,
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

        // test version of swap
        amountOut = TestSwap(swapRouter).swapFromUsdt(usdt_for_trade);
    }

    function invest(
        uint256 _amount,
        uint256 _grids,
        uint256 _percentage,
        uint256 _entryPrice,
        address _tokenAddress
    ) public {
        // Transfer the specified amount of USDT to this contract.
        TransferHelper.safeTransferFrom(
            usdtAddress,
            msg.sender,
            address(this),
            _amount
        );
        ordersCount++;
        Order memory new_order = Order({
            orderId: ordersCount,
            tokenAddress: _tokenAddress,
            user: msg.sender,
            entryPrice: _entryPrice,
            prevPrice: _entryPrice,
            fiatOrderAmount: _amount.div(_grids),
            depositAmount: _amount,
            grids: _grids,
            percentage: _percentage,
            remainingAmount: _amount,
            tokenAccumulated: 0,
            executedGrids: 0,
            open: true
        });

        orders[ordersCount] = new_order;
        userOrders[msg.sender][_tokenAddress].push(ordersCount);

        // Updating  pool usdt balance when user deposit usdt
        poolBalance += _amount;

        emit Invested(
            ordersCount,
            msg.sender,
            _amount,
            _grids,
            _percentage,
            _entryPrice,
            _tokenAddress
        );
    }

    function withdraw(address _tokenAddress) public {
        uint256[] storage user_orders = userOrders[msg.sender][_tokenAddress];

        require(user_orders.length > 0, "No orders!");

        uint256 fiat_balance_to_return = 0;
        uint256 token_amount_to_return = 0;
        //close existing open orders
        for (uint256 i = 0; i < user_orders.length; i++) {
            Order storage selected_order = orders[user_orders[i]];

            fiat_balance_to_return += selected_order.remainingAmount;
            token_amount_to_return += selected_order.tokenAccumulated;
            selected_order.open = false;
            // token and usdt deduction from each order
            selected_order.remainingAmount = 0;
            selected_order.tokenAccumulated = 0;

            emit OrderCancelled(
                selected_order.orderId,
                selected_order.executedGrids,
                selected_order.remainingAmount
            );
        }

        // deducting  pool usdt balances
        poolBalance -= fiat_balance_to_return;
        IERC20(usdtAddress).transfer(msg.sender, fiat_balance_to_return);

        // return tokens if some grids have already executed
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

    // only manager
    function executeOrders(uint256[] memory _orderIds) public onlyManager {
        for (uint256 i = 0; i < _orderIds.length; i++) {
            require(_orderIds[i] > 0, "Order id must be greater than 0!");
            Order storage selected_order = orders[_orderIds[i]];
            require(selected_order.open, "Order removed!");
            require(
                selected_order.executedGrids < selected_order.grids,
                "All orders executed"
            );
            require(
                selected_order.remainingAmount >=
                    selected_order.fiatOrderAmount,
                "Insufficient balance to execute order"
            );

            poolBalance -= selected_order.fiatOrderAmount; // deduct usdt from pool on order executed
            selected_order.remainingAmount -= selected_order.fiatOrderAmount; // deduct usdt from order on order executed

            uint256 token_received;
            if (testMode == 1) {
                token_received = swapTokenFromUsdtTest(
                    selected_order.fiatOrderAmount,
                    selected_order.tokenAddress
                );
            } else {
                token_received = swapTokenFromUsdt(
                    selected_order.fiatOrderAmount,
                    selected_order.tokenAddress
                );
            }

            // update tokens recieved to order token balance
            selected_order.tokenAccumulated += token_received;

            // update tokens recieved to pool token balance
            poolTokenBalances[selected_order.tokenAddress] += token_received;

            selected_order.executedGrids += 1; // updated executed girds

            //stop the order if all grids executed
            if (selected_order.executedGrids == selected_order.grids) {
                selected_order.open = false;
            }

            emit OrderExecuted(
                _orderIds[i],
                selected_order.fiatOrderAmount,
                token_received,
                selected_order.executedGrids,
                selected_order.remainingAmount
            );
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

    function emergencyWithdrawByOrderId(uint256 _orderId) public onlyOwner {
        // if order id exists
        require(orders[_orderId].user != address(0), "Invalid order id!");

        Order storage _order = orders[_orderId];

        // deduct usdt from order
        uint256 orderUsdt = _order.remainingAmount;
        _order.remainingAmount = 0;
        _order.open = false;
        // deduct usdt from pool
        poolBalance -= orderUsdt;

        // deduct tokens from order if any
        uint256 orderToken = _order.tokenAccumulated;

        if (orderToken > 0) {
            // deduct tokens from order
            _order.tokenAccumulated = 0;

            // deduct tokens from pool
            poolTokenBalances[_order.tokenAddress] -= orderToken;

            IERC20(_order.tokenAddress).transfer(msg.sender, orderToken);
        }
        IERC20(usdtAddress).transfer(msg.sender, orderUsdt);
    }
}
