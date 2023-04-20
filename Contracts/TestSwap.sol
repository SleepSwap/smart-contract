// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";

contract TestSwap {
    using SafeCast for int256;
    using SafeMath for uint256;

    address public usdtAddress;
    address public tokenAddress;
    mapping(address => uint256) public tokenBalances;
    uint256 public usdtBalance;

    constructor(address _usdt, address _token) {
        usdtAddress = _usdt;
        tokenAddress = _token;
    }

    function swapFromUsdt(uint256 _amount) public returns (uint256) {
        require(
            tokenBalances[tokenAddress] > _amount,
            "Insufficient token liquidity!"
        );

        // Approve the router to spend USDT.
        TransferHelper.safeApprove(usdtAddress, address(this), _amount);

        TransferHelper.safeTransferFrom(
            usdtAddress,
            msg.sender,
            address(this),
            _amount
        );
        uint256 _tokensToSent = _amount;

        tokenBalances[tokenAddress] -= _tokensToSent;
        usdtBalance += _amount;
        IERC20(tokenAddress).transfer(msg.sender, _tokensToSent);
        return _tokensToSent;
    }

    function swapFromTokens(uint256 _amount) public {
        require(usdtBalance > _amount, "Insufficient usdt liquidity!");

        TransferHelper.safeTransferFrom(
            tokenAddress,
            msg.sender,
            address(this),
            _amount
        );

        tokenBalances[tokenAddress] += _amount;
        usdtBalance -= _amount;
        IERC20(usdtAddress).transfer(msg.sender, _amount);
    }

    function depositTokens(uint256 _amount) public {
        tokenBalances[tokenAddress] += _amount;
        TransferHelper.safeTransferFrom(
            tokenAddress,
            msg.sender,
            address(this),
            _amount
        );
    }
}
