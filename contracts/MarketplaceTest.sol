// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0; // @audit SWC-102 0 8 4 min, MEDIUM

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol"; // @audit 1 unused interface, NON
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol"; // @audit no need in SafeMath for Solidity ^0.8.0 // reference https://github.com/OpenZeppelin/openzeppelin-contracts/commit/24a0bc23cfe3fbc76f8f2510b78af1e948ae6651#diff-f4b1737177aad965d94530b54ac4001a2e1f5fe6e4e34bafe023310cea599eca , NON

interface IRewardToken is IERC20 {
    function rewardUser(address owner, uint256 amount) external;
}


contract Rewardable { //@audit safeTransfer MEDIUM
    using SafeMath for uint256; // @audit 1 unused interface, NON

    error NothingForClaim();

    struct Reward {
        uint256 timestamp; // @audit make smaller to save gas? uint32, GAS
        uint256 amount;
    }

    uint256 constant public PCT_DENOMINATOR = 1000; // @audit private to save gas, GAS

    uint256 private constant SEED = 335813536577843457; // @audit Everything that is inside a contract is visible to all external observers Swc136, CRIT
    IERC20 internal PAYMENT_TOKEN;
    IRewardToken internal REWARD_TOKEN;

    uint256 public _rewardsAmount;

    // user => reward
    mapping(address => Reward[]) internal _rewards;

    constructor(address rewardToken, address paymentToken) {
        REWARD_TOKEN = IRewardToken(rewardToken);
        PAYMENT_TOKEN = IERC20(paymentToken);
    }

    function claim(address user) external { // @audit recommend to rename this fundtion claimTo, NON
        uint256 length = _rewards[user].length; // @audit gas optimize?, GAS 
        if (length == 0) revert NothingForClaim(); // @audit < can be cheaper?, GAS

        for (uint256 i = 0; i < length; i++) { // @audit gas // may be out of gas SWC-128, MEDIUM
            Reward storage reward = _rewards[user][length - 1 - i]; // @audit lenth - 1, recommended to change to i for gas + memory? CANNOT TEST WITH THIS BUG, CRIT
            // @audit pop all the data about pending reward, CRIT
            payRewards(user, reward);
            withdrawLastDeposit(user, reward.amount);
        }

        delete _rewards[user]; // @audit-ok does it deletes?
    }

    function payRewards(address user, Reward memory reward) internal { // @audit or calldata better?, GAS
        uint256 random = uint256(keccak256(abi.encodePacked(block.timestamp, SEED))); // @audit block.timestamp for random and SWC-120, CRIT
        uint256 daysDelta = (block.timestamp - reward.timestamp) / 1 days; // @audit div 0, CRIT

        uint256 userReward = reward.amount / PCT_DENOMINATOR * (random % daysDelta); // @audit div 0, CRIT
        if (userReward > 0) { // @audit gas? !=
            REWARD_TOKEN.rewardUser(user, userReward); // @audit extcall in for cycle GAS // @audit Try catch for ext call?? what if reverts SWC-113, MEDIUM
        }
    }

    function withdrawLastDeposit(address user, uint256 amount) internal {
        _rewards[user].pop();

        _rewardsAmount -= amount; // @audit-ok if no rewards -> can't receive?
        PAYMENT_TOKEN.transfer(user, amount); // @audit transfer in for cycle, GAS
    }

    function depositForRewards(address user, address payer, uint256 amount) internal { // @audit-ok if buy with contract rewards are not written to user?
        PAYMENT_TOKEN.transferFrom(payer, address(this), amount); // @audit-ok why not msg.sender?
        _rewardsAmount += amount; // @audit won't work with deflitioanary tokens, MEDIUM

        _rewards[user].push(Reward(block.timestamp, amount)); // @audit-ok why not to payer?
    }
}


contract MarketplaceTest is Rewardable {
    error AlreadyOwner();
    error NotItemOwner();
    error InvalidSale();
    error AlreadyOnSale(); // @audit not used, MEDUIM
    // @audit no events, See similar High-severity H03 finding OpenZeppelin’s Audit of Audius (https://blog.openzeppelin.com/audius-contracts-audit/#high) and Medium-severity M01 finding OpenZeppelin’s Audit of UMA Phase 4 (https://blog.openzeppelin.com/uma-audit-phase-4/) LOW
    struct ItemSale {
        address seller;
        uint256 price;
        uint256 startTime; // @audit to uint32 and higher, GAS
    }

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

    function setForSale(uint256 tokenId, uint256 price, uint256 startTime) external { // @audit already on sale, MEDIUM
        if (NFT_TOKEN.ownerOf(tokenId) != msg.sender) revert NotItemOwner();
        if (block.timestamp > startTime) revert InvalidSale();
        if (items[tokenId].price == price) revert InvalidSale(); //@audit gas optimize // setting for second time allows to set 0 price, GAS, MEDIUM

        items[tokenId] = ItemSale(msg.sender, price, startTime);
    }

    function discardFromSale(uint256 tokenId) external { // @audit check if on sale, LOW
        if (NFT_TOKEN.ownerOf(tokenId) != msg.sender) revert NotItemOwner();

        delete items[tokenId];
    }

    function postponeSale(uint256 tokenId, uint256 postponeSeconds) external { // @audit should be more than 0, LOW
        if (NFT_TOKEN.ownerOf(tokenId) != msg.sender) revert NotItemOwner();

        ItemSale storage item = items[tokenId]; 
        assembly { // @audit overflow, CRIT
            let s := add(item.slot, 2)
            sstore(s, add(sload(s), postponeSeconds))
        }
        // assembly { // @audit gas
        //     mstore(0x00, tokenId)
        //     mstore(0x20, items.slot)
        //     let s := add(keccak256(0x00, 0x40), 2)

        //     sstore(s, add(sload(s), postponeSeconds))
        // }
    }

    function buy(uint256 tokenId) external {
        address owner = NFT_TOKEN.ownerOf(tokenId);
        if (owner == msg.sender) revert AlreadyOwner();

        if (block.timestamp < items[tokenId].startTime) revert InvalidSale(); // @audit gas items, GAS // recommend to add new error, LOW

        if (items[tokenId].price == 0 ||
            items[tokenId].seller == address(0) || // @audit gas mload seller and price, GAS
            items[tokenId].seller == msg.sender) revert InvalidSale(); // @audit last check is not needed, LOW

        depositForRewards(owner, msg.sender, items[tokenId].price);
        NFT_TOKEN.transferFrom(owner, msg.sender, tokenId);
        delete items[tokenId]; // @audit-ok test
    }
} // @audit no functionts for tokens that were sent by mistake, NON