// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";

contract TestSwapRSI {
    using SafeCast for int256;
    using SafeMath for uint256;

    address public usdtAddress;
    address public tokenAddress;
    mapping(address => uint256) public tokenBalances;

    constructor(address _usdt, address _token) {
        usdtAddress = _usdt;
        tokenAddress = _token;
    }

    function swapFromUsdt(
        uint256 _amountIn,
        uint256 _swapPrice
    ) public returns (uint256) {
        require(_amountIn > 0, "Invalid input amount!");
        require(_swapPrice > 0, "Swap price should be greater than 0!");

        uint256 _amountOut = _amountIn.div(_swapPrice);
        require(
            tokenBalances[tokenAddress] >= _amountOut,
            "Insufficient token liquidity to fulfill swap!"
        );

        // Transfer tokens in from sender
        TransferHelper.safeTransferFrom(
            usdtAddress,
            msg.sender,
            address(this),
            _amountIn
        );

        // Update token balances
        tokenBalances[tokenAddress] -= _amountOut;
        tokenBalances[usdtAddress] += _amountIn;

        // Transfer tokens out to sender
        IERC20(tokenAddress).transfer(msg.sender, _amountOut);

        return _amountOut;
    }

    function swapFromTokens(
        uint256 _amountIn,
        uint256 _swapPrice
    ) public returns (uint256) {
        require(_amountIn > 0, "Invalid amount!");
        require(_swapPrice > 0, "Swap price should be greater than 0!");

        uint256 _amountOut = _amountIn.mul(_swapPrice);
        require(
            tokenBalances[usdtAddress] >= _amountOut,
            "Insufficient token liquidity to fulfill swap!"
        );

        // Transfer tokens in from sender
        TransferHelper.safeTransferFrom(
            tokenAddress,
            msg.sender,
            address(this),
            _amountIn
        );

        // Update token balances
        tokenBalances[tokenAddress] += _amountIn;
        tokenBalances[usdtAddress] -= _amountOut;

        // Transfer tokens out to sender
        IERC20(usdtAddress).transfer(msg.sender, _amountOut);

        return _amountOut;
    }

    function depositTokens(address _tokenAddress, uint256 _amount) public {
        tokenBalances[_tokenAddress] += _amount;
        TransferHelper.safeTransferFrom(
            _tokenAddress,
            msg.sender,
            address(this),
            _amount
        );
    }
}
