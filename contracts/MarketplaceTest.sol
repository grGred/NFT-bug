// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0; // @audit SWC-102

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol"; // @audit 1 unused interface
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol"; // @audit no need in SafeMath for Solidity ^0.8.0 // reference https://github.com/OpenZeppelin/openzeppelin-contracts/commit/24a0bc23cfe3fbc76f8f2510b78af1e948ae6651#diff-f4b1737177aad965d94530b54ac4001a2e1f5fe6e4e34bafe023310cea599eca


interface IRewardToken is IERC20 {
    function rewardUser(address owner, uint256 amount) external;
}


contract Rewardable {
    using SafeMath for uint256; // @audit 1 unused interface

    error NothingForClaim();

    struct Reward {
        uint256 timestamp; // @audit make smaller to save gas? uint32
        uint256 amount;
    }

    uint256 constant public PCT_DENOMINATOR = 1000; // @audit private to save gas // cheaper to make smaller size?

    uint256 private constant SEED = 335813536577843457; // @audit Everything that is inside a contract is visible to all external observers
    IERC20 internal PAYMENT_TOKEN;
    IRewardToken internal REWARD_TOKEN;

    uint256 public _rewardsAmount;

    // user => reward
    mapping(address => Reward[]) internal _rewards;

    constructor(address rewardToken, address paymentToken) {
        REWARD_TOKEN = IRewardToken(rewardToken);
        PAYMENT_TOKEN = IERC20(paymentToken);
    }

    function claim(address user) external { // @audit why not msg.sender
        uint256 length = _rewards[user].length; // @audit gas optimize? 
        if (length == 0) revert NothingForClaim(); // @audit < can be cheaper? and too strict for buissnes logic

        for (uint256 i = 0; i < length; i++) { // @audit gas
            Reward storage reward = _rewards[user][length - i];

            withdrawLastDeposit(user, reward.amount);
            payRewards(user, reward);
        }

        delete _rewards[user]; // @audit does it deletes??
    }

    function payRewards(address user, Reward memory reward) internal { // @audit or calldata better?
        uint256 random = uint256(keccak256(abi.encodePacked(block.timestamp, SEED))); // @audit block.timestamp for random and  
        uint256 daysDelta = (block.timestamp - reward.timestamp) / 1 days; // @audit negative?
        uint256 userReward = reward.amount / PCT_DENOMINATOR * (random % daysDelta); // @audit small denominator?
        if (userReward > 0) { // @audit gas? !=
            REWARD_TOKEN.rewardUser(user, userReward); // @audit extcall in for cycle // @audit Try catch for ext call?? what if reverts
        }
    }

    function withdrawLastDeposit(address user, uint256 amount) internal {
        _rewards[user].pop();

        _rewardsAmount -= amount; // @audit if no rewards -> can't receive?
        PAYMENT_TOKEN.transfer(user, amount); // @audit transfer in for cycle
    }

    function depositForRewards(address user, address payer, uint256 amount) internal { // @audit if to but with contracts rewards are not written to user?
        PAYMENT_TOKEN.transferFrom(payer, address(this), amount); // @audit why not msg.sender?
        _rewardsAmount += amount;

        _rewards[user].push(Reward(block.timestamp, amount)); // @audit why not to payer?
    }
}


contract MarketplaceTest is Rewardable {
    error AlreadyOwner();
    error NotItemOwner();
    error InvalidSale();
    error AlreadyOnSale(); // @audit not used
    // @audit no events
    struct ItemSale {
        address seller;
        uint256 price;
        uint256 startTime; // @audit to uint32 and higher
    }
    // @audit order of params?
    IERC721 internal NFT_TOKEN;

    // nft tokenId => item
    mapping(uint256 => ItemSale) public items;

    constructor(
        address nftToken,
        address paymentToken,
        address rewardToken
    ) Rewardable(rewardToken, paymentToken) {
        NFT_TOKEN = IERC721(nftToken);
    }

    function setForSale(uint256 tokenId, uint256 price, uint256 startTime) external {
        if (NFT_TOKEN.ownerOf(tokenId) != msg.sender) revert NotItemOwner();
        if (block.timestamp > startTime) revert InvalidSale();
        if (items[tokenId].price == price) revert InvalidSale(); //@audit gas optimize // strange check

        items[tokenId] = ItemSale(msg.sender, price, startTime);
    }

    function discardFromSale(uint256 tokenId) external {
        if (NFT_TOKEN.ownerOf(tokenId) != msg.sender) revert NotItemOwner();

        delete items[tokenId];
    }

    function postponeSale(uint256 tokenId, uint256 postponeSeconds) external {
        if (NFT_TOKEN.ownerOf(tokenId) != msg.sender) revert NotItemOwner();

        ItemSale storage item = items[tokenId]; 
        assembly { // TODO add tests
            let s := add(item.slot, 2)
            sstore(s, add(sload(s), postponeSeconds))
        }
        // assembly {
        //     mstore(0x00, tokenId)
        //     mstore(0x20, items.slot)
        //     let s :=     add(keccak256(0x00, 0x40), 2)

        //     sstore(s, add(sload(s), postponeSeconds))
        // }
    }

    function buy(uint256 tokenId) external {
        address owner = NFT_TOKEN.ownerOf(tokenId);
        if (owner == msg.sender) revert AlreadyOwner();

        if (block.timestamp < items[tokenId].startTime) revert InvalidSale(); // @audit gas items

        if (items[tokenId].price == 0 ||
            items[tokenId].seller == address(0) ||
            items[tokenId].seller == msg.sender) revert InvalidSale(); // @audit last check is not needed?

        depositForRewards(owner, msg.sender, items[tokenId].price);
        NFT_TOKEN.transferFrom(owner, msg.sender, tokenId);
        delete items[tokenId]; // @audit test
    }
}