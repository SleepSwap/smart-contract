// SPDX-License-Identifier: MIT

pragma solidity ^0.8.7;
pragma abicoder v2;

import "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

// BASE TOKEN; USDT - usdtToken
// TRADE TOKENL: ERC20 - tokenAmount

contract SleepSwapAccumulation is Ownable {
    using SafeCast for int256;
    using SafeMath for uint256;
    string public name = "SleepSwap Accumulation";

    //manager: execute trx
    mapping(address => bool) public managers;
    address public usdtAddress;
    uint256 public poolBalance;
    mapping(address => uint256) public poolTokenBalances;

    // Fees
    uint256 public fee;
    uint256 public feePercent = 5;

    mapping(address => uint256) public userUsdtBalances;
    mapping(address => address[]) public userTokenAddreses;
    mapping(address => mapping(address => uint256)) public userTokenBalances;
    // 0x7D.  --> PBR --> 300

    struct Order {
        uint256 orderId;
        address user;
        address tokenAddress;
        uint256 entryPrice;
        uint256 prevPrice;
        uint256 depositAmount;
        uint256 remainingAmount;
        uint256 fiatOrderAmount;
        uint256 grids;
        uint256 percentage;
        uint256 executedGrids;
        bool open;
    }

    uint256 public ordersCount = 0;
    // mappings
    mapping(uint256 => Order) public orders;
    mapping(address => uint256[]) public userOrders;

    // swap initializations
    ISwapRouter public immutable swapRouter;
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
    constructor(address _usdtAddress, ISwapRouter _swapRouter) {
        usdtAddress = _usdtAddress;
        swapRouter = _swapRouter;
        managers[msg.sender] = true;
    }

    //modifiers
    modifier onlyManager() {
        require(managers[msg.sender] == true);
        _;
    }

    function addManager(address _manager) public onlyOwner {
        managers[_manager] = true;
    }

    function updateFeePercent(uint256 _newFeePercent) public onlyOwner {
        feePercent = _newFeePercent;
    }

    function swapTokenFromUsdt(
        uint256 _amountIn,
        address _tokenAddress
    ) public returns (uint256 amountOut) {
        // Fee deduction
        uint256 order_fee = _amountIn.mul(feePercent).div(10000);
        fee += order_fee;
        uint256 usdt_for_trade = _amountIn - order_fee;

        address from_token = usdtAddress;
        address to_token = _tokenAddress;

        // Approve the router to spend USDT.
        TransferHelper.safeApprove(
            from_token,
            address(swapRouter),
            usdt_for_trade
        );

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
        amountOut = swapRouter.exactInputSingle(params);
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
            executedGrids: 0,
            open: true
        });

        orders[ordersCount] = new_order;
        userOrders[msg.sender].push(ordersCount);

        // Updating  pool & user balances
        userUsdtBalances[msg.sender] += _amount;
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
        uint256[] storage user_all_orders = userOrders[msg.sender];
        uint256 fiat_balance_to_return = 0;
        //close existing open orders
        for (uint256 i = 0; i < user_all_orders.length; i++) {
            Order storage selected_order = orders[user_all_orders[i]];

            if (selected_order.tokenAddress == _tokenAddress) {
                fiat_balance_to_return += selected_order.remainingAmount;
                selected_order.open = false;
                emit OrderCancelled(
                    selected_order.orderId,
                    selected_order.executedGrids,
                    selected_order.remainingAmount
                );
            }
        }

        uint256 user_token_balance = userTokenBalances[msg.sender][
            _tokenAddress
        ];

        userUsdtBalances[msg.sender] -= fiat_balance_to_return;
        userTokenBalances[msg.sender][_tokenAddress] = 0;

        // reducing pool balances
        poolBalance -= fiat_balance_to_return;
        IERC20(usdtAddress).transfer(msg.sender, fiat_balance_to_return);
        IERC20(_tokenAddress).transfer(msg.sender, user_token_balance);

        emit Withdraw(
            msg.sender,
            user_all_orders,
            _tokenAddress,
            fiat_balance_to_return,
            user_token_balance
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

            //run buy order
            userUsdtBalances[msg.sender] -= selected_order.fiatOrderAmount; // updating user total fiat balance
            poolBalance -= selected_order.fiatOrderAmount; //  pool fiat balance
            selected_order.remainingAmount -= selected_order.fiatOrderAmount; // updating remaning balance of order for future trades

            uint256 token_received = swapTokenFromUsdt(
                selected_order.fiatOrderAmount,
                selected_order.tokenAddress
            );

            if (selected_order.executedGrids + 1 == selected_order.grids) {
                selected_order.open = false;
                selected_order.executedGrids += 1;
            } else {
                selected_order.executedGrids += 1;
            }

            userTokenBalances[msg.sender][
                selected_order.tokenAddress
            ] += token_received;
            poolTokenBalances[selected_order.tokenAddress] += token_received;

            emit OrderExecuted(
                _orderIds[i],
                selected_order.fiatOrderAmount,
                token_received,
                selected_order.executedGrids,
                selected_order.remainingAmount
            );
        }
    }
}
