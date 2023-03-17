// SPDX-License-Identifier: MIT

pragma solidity ^0.8.7;
pragma abicoder v2;

// swap imports
import "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";
import "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import "@chainlink/contracts/src/v0.8/KeeperCompatible.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

// BASE TOKEN; USDT - usdtToken
// TRADE TOKENL: ERC20 - tokenAmount

contract SleepSwap is Ownable {
    using SafeCast for int256;
    using SafeMath for uint256;

    //manager: execute trx
    address public manager;

    address public usdtAddress;

    uint256 public usdtBalance;
    uint256 public tokenBalance;

    // Fees
    uint256 public usdtFees;
    uint256 public tokenFees;
    uint256 public feePercent = 30;

    mapping(address => uint256) public userUsdtBalances;
    mapping(address => mapping(address => uint256)) public userTokenBalances;
    // 0x7D.  --> PBR --> 300
    // 0x7D.  --> ORARE --> 1700
    // 0x3E.  --> PBR --> 300
    // 0x3E.  --> API3 --> 2000

    struct Order {
        uint256 orderId;
        address tokenAddress;
        address user;
        uint256 price;
        uint256 amount;
        bool isBuy;
        bool open;
        bool executed;
    }

    uint256 public ordersCount = 0;

    // mappings
    mapping(uint256 => Order) public orders;

    mapping(address => uint256[]) public userOrders;

    // swap initializations
    ISwapRouter public immutable swapRouter;
    // For this example, we will set the pool fee to 0.3%.
    uint24 public constant poolFee = 3000;

    //modifiers
    modifier onlyManager() {
        require(msg.sender == manager);
        _;
    }

    // events:
    event Staked(
        address indexed user,
        uint256 amount,
        address tokenAddress,
        uint256 usdtForBuy,
        uint256 tokensForSell
    );
    event OrderCreated(
        uint256 orderId,
        address tokenAddress,
        address user,
        uint256 price,
        uint256 amount,
        bool isBuy,
        bool open,
        bool executed
    );

    event OrderExecuted(
        uint256 orderId,
        address tokenAddress,
        address user,
        uint256 price,
        uint256 amount,
        bool isBuy,
        uint256 recieved
    );

    event CancelOrder(address indexed user, uint256 orderId, bool isBuy);
    event Withdraw(
        address indexed user,
        uint256 usdtAmount,
        uint256 tokenAmount
    );

    // init contract
    constructor(
        address _usdtAddress,
        ISwapRouter _swapRouter,
        address _manager
    ) {
        usdtAddress = _usdtAddress;
        swapRouter = _swapRouter;
        manager = _manager;
    }

    function addManager(address _manager) public onlyOwner {
        manager = _manager;
    }

    // _isBuy: swapFrom , swapTo
    function swapTokenFromUsdt(
        uint256 _amountIn,
        address _tokenAddress
    ) public returns (uint256 amountOut) {
        // msg.sender must approve this contract

        //Deducting fees
        uint256 deductedFees = _amountIn.mul(feePercent).div(10000);
        usdtFees += deductedFees;
        uint256 _usdtForTrade = _amountIn - deductedFees;

        address _fromToken = usdtAddress;
        address _toToken = _tokenAddress;

        // Transfer the specified amount of DAI to this contract.
        TransferHelper.safeTransferFrom(
            usdtAddress,
            msg.sender,
            address(this),
            _usdtForTrade
        );

        // Approve the router to spend DAI.
        TransferHelper.safeApprove(
            _fromToken,
            address(swapRouter),
            _usdtForTrade
        );

        // Naively set amountOutMinimum to 0. In production, use an oracle or other data source to choose a safer value for amountOutMinimum.
        // We also set the sqrtPriceLimitx96 to be 0 to ensure we swap our exact input amount.
        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter
            .ExactInputSingleParams({
                tokenIn: _fromToken,
                tokenOut: _toToken,
                fee: poolFee,
                recipient: address(this),
                deadline: block.timestamp,
                amountIn: _usdtForTrade,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
            });

        // The call to exactInputSingle executes the swap.
        amountOut = swapRouter.exactInputSingle(params);
    }

    function swapUsdtFromToken(
        uint256 _amountIn,
        address _tokenAddress
    ) public returns (uint256 amountOut) {
        // msg.sender must approve this contract

        //Deducting fees
        uint256 deductedFees = _amountIn.mul(feePercent).div(10000);
        tokenFees += deductedFees;
        uint256 _tokenForTrade = _amountIn - deductedFees;

        address _fromToken = _tokenAddress;
        address _toToken = usdtAddress;

        // Transfer the specified amount of DAI to this contract.
        TransferHelper.safeTransferFrom(
            usdtAddress,
            msg.sender,
            address(this),
            _tokenForTrade
        );

        // Approve the router to spend DAI.
        TransferHelper.safeApprove(
            _fromToken,
            address(swapRouter),
            _tokenForTrade
        );

        // Naively set amountOutMinimum to 0. In production, use an oracle or other data source to choose a safer value for amountOutMinimum.
        // We also set the sqrtPriceLimitx96 to be 0 to ensure we swap our exact input amount.
        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter
            .ExactInputSingleParams({
                tokenIn: _fromToken,
                tokenOut: _toToken,
                fee: poolFee,
                recipient: address(this),
                deadline: block.timestamp,
                amountIn: _tokenForTrade,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
            });

        // The call to exactInputSingle executes the swap.
        amountOut = swapRouter.exactInputSingle(params);
    }

    // price price = 0.1;
    // 1000 usdt, +> 500usdt 5000 pbr -> grid size
    function stake(
        uint256[] memory _buyPrices,
        uint256[] memory _sellPrices,
        uint256 _amount,
        address _tokenAddress
    ) public {
        uint256 usdtForBuy = _amount.div(2); // usdt amount to purchase tokens for sell orders
        uint256 tokensForSell = swapTokenFromUsdt(
            _amount.div(2),
            _tokenAddress
        );
        uint256 singleOrderTokenAmountForSell = tokensForSell.div(
            _sellPrices.length
        );
        uint256 singleOrderUsdtAmountForBuy = usdtForBuy.div(_buyPrices.length);

        // Transfer the specified amount of DAI to this contract.
        TransferHelper.safeTransferFrom(
            usdtAddress,
            msg.sender,
            address(this),
            usdtForBuy
        );

        for (uint256 i = 0; i < _sellPrices.length; i++) {
            Order memory newOrder = Order({
                orderId: ordersCount + 1,
                tokenAddress: _tokenAddress,
                user: msg.sender,
                price: _sellPrices[i],
                amount: singleOrderTokenAmountForSell,
                isBuy: false,
                open: true,
                executed: false
            });

            orders[ordersCount++] = newOrder;

            userOrders[msg.sender].push(ordersCount - 1);

            // emit event
            emit OrderCreated(
                newOrder.orderId,
                _tokenAddress,
                msg.sender,
                newOrder.price,
                newOrder.amount,
                newOrder.isBuy,
                newOrder.open,
                newOrder.executed
            );
        }

        for (uint256 i = 0; i < _buyPrices.length; i++) {
            Order memory newOrder = Order({
                orderId: ordersCount + 1,
                tokenAddress: _tokenAddress,
                user: msg.sender,
                price: _buyPrices[i],
                amount: singleOrderUsdtAmountForBuy,
                isBuy: true,
                open: true,
                executed: false
            });

            orders[ordersCount++] = newOrder;
            userOrders[msg.sender].push(ordersCount - 1);

            emit OrderCreated(
                newOrder.orderId,
                _tokenAddress,
                msg.sender,
                newOrder.price,
                newOrder.amount,
                newOrder.isBuy,
                newOrder.open,
                newOrder.executed
            );
        }

        if (userUsdtBalances[msg.sender] != 0) {
            userUsdtBalances[msg.sender] += _amount.div(2);
        } else {
            userUsdtBalances[msg.sender] = _amount.div(2);
        }

        if (userTokenBalances[msg.sender][_tokenAddress] != 0) {
            userTokenBalances[msg.sender][_tokenAddress] += tokensForSell;
        } else {
            userTokenBalances[msg.sender][_tokenAddress] = tokensForSell;
        }

        //updating contract balances
        usdtBalance += usdtForBuy;
        tokenBalance += tokensForSell;
        emit Staked(
            msg.sender,
            _amount,
            _tokenAddress,
            usdtForBuy,
            tokensForSell
        );
    }

    function updateManager(address _address) public onlyOwner {
        manager = _address;
    }

    // Update fees
    function updateFeesPercentage(uint256 _newPercentage) public onlyOwner {
        feePercent = _newPercentage;
    }

    // only manager
    function executeOrders(uint256[] memory _orderIds) public onlyManager {
        //1. pick order
        //2. swap
        //3. update user balances
        for (uint256 i = 0; i < _orderIds.length; i++) {
            Order storage _order = orders[_orderIds[i]];

            require(_order.open, "Order removed!");
            require(!_order.executed, "Order already executed!");

            if (_order.isBuy) {
                //run buy order

                userUsdtBalances[msg.sender] -= _order.amount;
                usdtBalance -= _order.amount;

                uint256 tokenReceived = swapTokenFromUsdt(
                    _order.amount,
                    _order.tokenAddress
                );

                userTokenBalances[msg.sender][
                    _order.tokenAddress
                ] += tokenReceived;
                tokenBalance += tokenReceived;

                _order.executed = true;
                _order.open = false;

                // emit event
                emit OrderExecuted(
                    _order.orderId,
                    _order.tokenAddress,
                    msg.sender,
                    _order.price,
                    _order.amount,
                    _order.isBuy,
                    tokenReceived
                );
            } else {
                //run sell order

                userTokenBalances[msg.sender][_order.tokenAddress] -= _order
                    .amount;
                tokenBalance -= _order.amount;

                uint256 usdtReceived = swapUsdtFromToken(
                    _order.amount,
                    _order.tokenAddress
                );

                userUsdtBalances[msg.sender] += usdtReceived;
                usdtBalance += usdtReceived;

                _order.executed = true;
                _order.open = false;

                // emit event
                emit OrderExecuted(
                    _order.orderId,
                    _order.tokenAddress,
                    msg.sender,
                    _order.price,
                    _order.amount,
                    _order.isBuy,
                    usdtReceived
                );
            }
        }
    }

    function withdraw(address _tokenAddress) public {
        uint256[] storage _userOrders = userOrders[msg.sender];

        //close existing open orders
        for (uint256 i = 0; i < _userOrders.length; i++) {
            if (orders[_userOrders[i]].tokenAddress == _tokenAddress) {
                orders[_userOrders[i]].open = false;
                // emit event
                emit CancelOrder(
                    msg.sender,
                    orders[_userOrders[i]].orderId,
                    orders[_userOrders[i]].isBuy
                );
            }
        }

        uint256 _usdtAmount = userUsdtBalances[msg.sender];
        uint256 _tokenAmount = userTokenBalances[msg.sender][_tokenAddress];

        userUsdtBalances[msg.sender] = 0;
        userTokenBalances[msg.sender][_tokenAddress] = 0;

        IERC20(usdtAddress).transfer(msg.sender, _usdtAmount);
        IERC20(_tokenAddress).transfer(msg.sender, _tokenAmount);
    }
}
