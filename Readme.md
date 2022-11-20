# **Audit of the Marketplace**
 
### **Scope**
 
The code under review can be found within the NFT-bug repository, and is composed of 2 smart contracts written in the Solidity programming language and includes 144 lines of Solidity code.
 
### **Summary**
 
A total of 13 unique vulnerabilities. Of these vulnerabilities, 5 received a risk rating in the category of HIGH severity and 8 received a risk rating in the category of MEDIUM severity.
Additionally, I included 8 reports detailing issues with a risk rating of LOW severity or non-critical.
### **Classification of Issues**
 
High-level considerations for vulnerabilities span the following key areas when conducting assessments:
 
* Malicious Input Handling
* Escalation of privileges
* Arithmetic
* Gas use
 
Vulnerabilities are divided into three primary risk categories: high, medium, and low/non-critical.
 
---
 
# **High Risk Findings (5)**
 
### **[H-01] Unencrypted Private Data On-Chain**
 
```Solidity
File: contracts/Marketplace.sol
28:    uint256 private constant SEED = 335813536577843457
```
 
### **Impact**
 
It is a common misconception that private type variables cannot be read. Even if your contract is not published, attackers can look at contract transactions to determine values stored in the state of the contract. For this reason, it's important that unencrypted private data is not stored in the contract code or state.
 
### **Proof of Concept**
 
The attacker accesses the storage of your contract using:
```Python
web3.eth.getStorageAt("0x561...", 2)
```
 
See: [SWC-136](https://swcregistry.io/docs/SWC-136)
 
### **Recommended Mitigation Steps**

Any private data should either be stored off-chain, or carefully encrypted.

------
 
### **[H-02] Insecure Source of Randomness**
 
```Solidity
File: contracts/Marketplace.sol
56: function payRewards(address user, Reward memory reward) internal {
57:         uint256 random = uint256(keccak256(abi.encodePacked(block.timestamp, SEED)));
58:         uint256 daysDelta = (block.timestamp - reward.timestamp) / 1 days;
59:         uint256 userReward = reward.amount / PCT_DENOMINATOR * (random % daysDelta);
60:         if (userReward > 0) {
61:             REWARD_TOKEN.rewardUser(user, userReward);
62:         }
63:     }
```
 
### **Impact**

 
Use of `block.timestamp` is insecure, as a miner can choose to provide any timestamp within a few seconds and still get his block accepted by others.


### **Proof of Concept**

1) The attacker accesses the storage of your contract and gets the SEED.
2) The attacker copies the SEED and pre-compute the `keccak256` hash via his/her contract with different timestamps in order to find the most profitable and then send the result to the Marketplace contract.

See: [SWC-120](https://swcregistry.io/docs/SWC-120)
 
 
### **Recommended Mitigation Steps**
* Using external sources of randomness via oracles, e.g. [Chainlink](https://docs.chain.link/vrf/v2/introduction). Note that this approach requires trusting in oracle, thus it may be reasonable to use multiple oracles.
* Using [Gnosis chain for random](https://developers.gnosischain.com/for-developers/on-chain-random-numbers/randomness-faqs).

 
------

### **[H-03] Incorrect length in for loop**
 
```Solidity
contracts/Marketplace.sol
46:         for (uint256 i = 0; i < length; i++) {
47:             Reward storage reward = _rewards[user][length - i];
...
```
 
### **Impact**
 
For loop trys to access an out-of-bounds index.
 
### **Proof of Concept**
 
For e.g. let's imagine that the user has one deposit and tries to deposit it.
Since on the first cycle `i = 0` and `length = 1` in for loop `_rewards[user][length - i]` is trying to read the first element of the array, while the deposit of the user is stored on zero position.
 
### **Recommended Mitigation Steps**
 
Change the following code to:
 
```Solidity
contracts/Marketplace.sol
46:         for (uint256 i = 0; i < length; i++) {
47:             Reward storage reward = _rewards[user][length - 1 - i];
```

------

### **[H-04] Popping all the data about reward before sending it**

```Solidity
contracts/Marketplace.sol
...
46:         for (uint256 i = 0; i < length; i++) {
47:             Reward storage reward = _rewards[user][length - i];
48:
49:             withdrawLastDeposit(user, reward.amount);
50:             payRewards(user, reward);
...
 
contracts/MarketplaceTest.sol
...
65: function withdrawLastDeposit(address user, uint256 amount) internal {
66:         _rewards[user].pop();
...
```


### **Impact**

The user can't claim a reward because the withdrawal of the deposit popped all the data about the user. The amount used in calculations of the users rewards equals 0.

### **Proof of Concept**

```Solidity
contracts/Marketplace.sol
...
46:         for (uint256 i = 0; i < length; i++) {
47:             Reward storage reward = _rewards[user][length - i];
48:
49:             withdrawLastDeposit(user, reward.amount); // @audit popped all the reward data
50:             payRewards(user, reward); // @audit reward.amount is 0 for now
...
 
contracts/Marketplace.sol
...
65: function withdrawLastDeposit(address user, uint256 amount) internal {
66:         _rewards[user].pop(); // @audit deleting the users reward
...
```

Since the calculation of random uses a reward amount from storage - it always is zero in this scenario.

```Solidity
contracts/Marketplace.sol
59: uint256 userReward = reward.amount / PCT_DENOMINATOR * (random % daysDelta); // @audit 0 * 100...
```
 
### **Recommended Mitigation Steps**
 
Change the following code to:
 
```Solidity
contracts/Marketplace.sol
45:         for (uint256 i = 0; i < length; i++) {
46:             Reward storage reward = _rewards[user][length - 1 - i];
47:
48:             payRewards(user, reward);
49:             withdrawLastDeposit(user, reward.amount);
50:         }
```
 
------
 
### **[H-05] Overflow in assembly**
 
```Solidity
contracts/Marketplace.sol
...
123:         ItemSale storage item = items[tokenId];
124:         assembly {
125:             let s := add(item.slot, 2)
126:             sstore(s, add(sload(s), postponeSeconds))
127:         }
...
```

### **Impact**

Since [Solidity v0.8](https://docs.soliditylang.org/en/v0.8.3/080-breaking-changes.html), the compiler has checks for {over,under}flow by default for all arithmetic operations. But these checks don't apply to assembly (yul) arithmetic operations.

### **Proof of Concept**

```Typescript
test/marketplace.spec.ts
417:             // Overflow bug
418:             it('Should revert with overflow', async () => {
419:                 nft.mint();
420:                 let { currentTimestamp } = await getBlockData();
421:                 await marketplace.setForSale(2, 1, BN.from(currentTimestamp + 100));
422:
423:                 await marketplace.postponeSale(2, ethers.constants.MaxUint256); // MAX UINT
424:
425:                 await expect((await marketplace.items(2)).startTime).to.be.closeTo(
426:                     BN.from(currentTimestamp + 100),
427:                     1000
428:                 ); // equals
429:
430:                 // marketplace.items(2).startTime == "1668939962"
431:             });
```

 
### **Recommended Mitigation Steps**

 
------

### **[H-06] Division or modulo division by zero**

```Solidity
contracts/Marketplace.sol
...
File: /Users/vlad/Desktop/Solidity/20_NFT_bug/contracts/Marketplace.sol
58:         uint256 daysDelta = (block.timestamp - reward.timestamp) / 1 days;
59:         uint256 userReward = reward.amount / PCT_DENOMINATOR * (random % daysDelta);
...
```

### **Impact**

If 1 day doesn't pass from the moment of the buy `daysDelta` will be 0 and the following division will result in a panic error `(random % daysDelta)`. "When claiming, the seller additionally gets a random reward in `REWARD_TOKEN` which depends on sale price and the number of days passed from sale." From this text I think that the following behavior is unexpected, that's why I identify this as a High risk vulnerability connected with arithmetic operations.

### **Proof of Concept**

```Typescript
test/marketplace.spec.ts
261:             it('Should revert claim with 1 token the same day', async () => {
262:                 await expect(marketplaceTest.claim(wallet.address)).to.be.reverted;
263:                 // Error: VM Exception while processing transaction: reverted with panic code 0x12 (Division or modulo division by zero)
264:             });
```

### **Recommended Mitigation Steps**

You can always add 1 day to `daysDelta`, or create an if statement in which you will operate with this situation.
 
------

# **Medium Risk Findings (8)**

### **[M-01] DoS With Block Gas Limit**

```Solidity
contracts/Marketplace.sol
42:     function claim(address user) external {
43:         uint256 length = _rewards[user].length;
44:         if (length == 0) revert NothingForClaim();
45:
46:         for (uint256 i = 0; i < length; i++) {
47:             Reward storage reward = _rewards[user][length - i];
48:
49:             withdrawLastDeposit(user, reward.amount);
50:             payRewards(user, reward);
51:         }
...
```

### **Impact**
 
Loops that do not have a fixed number of iterations, for example, loops that depend on storage values, have to be used carefully: Due to the block gas limit, transactions can only consume a certain amount of gas. Either explicitly or just due to normal operation, the number of iterations in a loop can grow beyond the block gas limit which can cause the complete contract to be stalled at a certain point.
 
### **Proof of Concept**
 
For loop in `claim` function is a gas heavy function with external calls, writing to storage and transfers of tokens. If the user creates a lot of deposits, user won't be able to withdraw them because of the gas limitations, funds will be lost.
 
See:
* [SWC-128](https://swcregistry.io/docs/SWC-128)
*  [Solidity Doc -> gas-limit-and-loops](https://docs.soliditylang.org/en/v0.4.24/security-considerations.html#gas-limit-and-loops)
 
### **Recommended Mitigation Steps**
 
If you absolutely must loop over an array of unknown size, then you should plan for it to potentially take multiple blocks, and therefore require multiple transactions. I recommend limiting the maximum amount of deposits.
 
------
 
### **[M-02] Floating Compiler Version**
 
```Solidity
contracts/Marketplace.sol
3: pragma solidity ^0.8.0;
```
 
### **Impact**
 
In the contracts, floating pragmas should not be used. Contracts should be deployed with the same compiler version and flags that they have been tested with thoroughly. Locking the pragma helps to ensure that contracts do not accidentally get deployed using, for example, an outdated compiler version that might introduce bugs that affect the contract system negatively.
 
### **Proof of Concept**
 
See: [SWC-103](https://swcregistry.io/docs/SWC-103)
 
 
### **Recommended Mitigation Steps**
 
Lock the pragma version and also consider known bugs (https://github.com/ethereum/solidity/releases) for the compiler version that is chosen.
 
Pragma statements can be allowed to float when a contract is intended for consumption by other developers, as in the case with contracts in a library. Otherwise, the developer would need to manually update the pragma in order to compile locally.
 
------
 
### **[M-03] Outdated Compiler Version**
 
```Solidity
contracts/Marketplace.sol
3: pragma solidity ^0.8.0;
```
 
### **Impact**
 
Using an outdated compiler version can be problematic especially if there are publicly disclosed bugs and issues that affect the current compiler version.
 
 
### **Proof of Concept**
 
Contract uses custom errors that appeared on 0.8.4. Contract can't be compiled with previous versions.
 
See: [SWC-102](https://swcregistry.io/docs/SWC-102)
 
 
### **Recommended Mitigation Steps**
 
Using newer compiler versions and the optimizer gives gas optimizations and additional safety checks for free!
 
The advantages of versions `0.8.*` over `<0.8.0` are:
 
* Safemath by default from `0.8.0` (can be more gas efficient than some library based safemath).
* [Low level inliner](https://blog.soliditylang.org/2021/03/02/saving-gas-with-simple-inliner/) from `0.8.2`, leads to cheaper runtime gas. Especially relevant when the contract has small functions. For example, OpenZeppelin libraries typically have a lot of small helper functions and if they are not inlined, they cost an additional 20 to 40 gas because of 2 extra jump instructions and additional stack operations needed for function calls.
* [Optimizer improvements in packed structs](https://blog.soliditylang.org/2021/03/23/solidity-0.8.3-release-announcement/#optimizer-improvements): Before `0.8.3`, storing packed structs, in some cases used an additional storage read operation. After [EIP-2929](https://eips.ethereum.org/EIPS/eip-2929), if the slot was already cold, this means unnecessary stack operations and extra deployment time costs. However, if the slot was already warm, this means an additional cost of 100 gas alongside the same unnecessary stack operations and extra deployment time costs.
* [Custom errors](https://blog.soliditylang.org/2021/04/21/custom-errors) from `0.8.4`, leads to cheaper deployment time cost and run time cost. Note: the run time cost is only relevant when the revert condition is met. In short, replace revert strings by custom errors.
* Solidity `0.8.10` has a useful change which [reduced gas costs of external calls](https://blog.soliditylang.org/2021/11/09/solidity-0.8.10-release-announcement/) which expects a return value.  Code Generator skips existence checks for external contracts if return data is expected. In this case, the ABI decoder will revert if the contract does not exist. `0.8.10` also enables the new EVM code generator for pure Yul mode.
* [Improved Inlining Heuristics in Yul Optimizer](https://blog.soliditylang.org/2022/06/15/solidity-0.8.15-release-announcement/). The compiler used to be very conservative before Solidity version `0.8.15` in deciding whether to inline a function or not. This was necessary due to the fact that inlining may easily increase stack pressure and lead to the dreaded `Stack too deep` error. In `0.8.15` the conditions necessary for inlining are relaxed. Benchmarks show that the change significantly decreases the bytecode size (which impacts the deployment cost) while the effect on the runtime gas usage is smaller.
* [Overflow checks on multiplication more efficient](https://blog.soliditylang.org/2022/09/08/solidity-0.8.17-release-announcement/) in Solidity v0.8.17. Yul Optimizer: Prevent the incorrect removal of storage writes before calls to Yul functions that conditionally terminate the external EVM call;  Simplify the starting offset of zero-length operations to zero.  Code Generator: More efficient overflow checks for multiplication.
 
------
 
### **[M-04] Use a safe transfer helper library for ERC20 transfers**
 
### **Impact**
 
`Marketplace#claim` and `Marketplace#buy` calls `IERC20#transfer` and `transferFrom` directly. There are two issues with using this interface directly:
1) Function does not check the return value of these calls. Tokens that return false rather than revert to indicate failed transfers may silently fail rather than reverting as expected.
2) Since the IERC20 interface requires a boolean return value, attempting to transfer ERC20s with [missing return values](https://github.com/d-xo/weird-erc20#missing-return-values) will revert. This means Marketplace cannot support a number of popular ERC20s, including USDT and BNB.
 
 
### **Recommended Mitigation Steps**
 
Use a safe transfer library like OpenZeppelin [SafeERC20](https://docs.openzeppelin.com/contracts/4.x/api/token/erc20#SafeERC20) to ensure consistent handling of ERC20 return values and abstract over [inconsistent ERC20](https://github.com/d-xo/weird-erc20) implementations.

------

### **[M-05] Incompatibility with rebasing / deflationary / inflationary tokens**

```Solidity
contracts/Marketplace.sol
73:         PAYMENT_TOKEN.transferFrom(payer, address(this), amount);
74:         _rewardsAmount += amount;
```
 
### **Impact**

Contract doesn't support rebasing/deflationary/inflationary tokens whose balance changes during transfers or over time. The necessary checks include at least verifying the amount of tokens transferred to contracts before and after the actual transfer to infer any fees/interest.

### **Recommended Mitigation Steps**

Ensure that to check previous balance/after balance equals to amount for any rebasing/inflation/deflation
Add support in contracts for such tokens before accepting user-supplied tokens
Consider supporting deflationary / rebasing / etc tokens by extra checking the balances before/after or strictly inform your users not to use such tokens if they don’t want to lose them.

------

### **[M-06] Set For Sale missing additional check**

```Solidity
contracts/Marketplace.sol
85: error AlreadyOnSale();
...
106: function setForSale(uint256 tokenId, uint256 price, uint256 startTime) external {
```

### **Impact**

Contract doesn't support rebasing/deflationary/inflationary tokens whose balance changes during transfers or over time. The necessary checks include at least verifying the amount of tokens transferred to contracts before and after the actual transfer to infer any fees/interest.

### **Recommended Mitigation Steps**

Ensure that to check previous balance/after balance equals to amount for any rebasing/inflation/deflation
Add support in contracts for such tokens before accepting user-supplied tokens
Consider supporting deflationary / rebasing / etc tokens by extra checking the balances before/after or strictly inform your users not to use such tokens if they don’t want to lose them.

------
 
### **[M-07] NFT can be set for sale with 0 price and can't be sold**

```Solidity
contracts/Marketplace.sol
106:     function setForSale(uint256 tokenId, uint256 price, uint256 startTime) external {
107:         if (NFT_TOKEN.ownerOf(tokenId) != msg.sender) revert NotItemOwner();
108:         if (block.timestamp > startTime) revert InvalidSale();
109:         if (items[tokenId].price == price) revert InvalidSale();
110:
111:         items[tokenId] = ItemSale(msg.sender, price, startTime);
112:     }
...
contracts/Marketplace.sol
130:     function buy(uint256 tokenId) external {
131:         address owner = NFT_TOKEN.ownerOf(tokenId);
132:         if (owner == msg.sender) revert AlreadyOwner();
133:
134:         if (block.timestamp < items[tokenId].startTime) revert InvalidSale();
135:
136:         if (items[tokenId].price == 0 ||
```

### **Impact**

Since `setForSale` is missing the check `AlreadyOnSale`, users can set a token for sale with 0 price. This token can't be bought.

### **Proof of Concept**

```Typescript
test/marketplace.spec.ts
62:             it('Should set for sale with 0 price for token after setting for second time', async () => {
63:                 let { currentTimestamp } = await getBlockData();
64:                 await marketplaceTest.setForSale(1, 1, BN.from(currentTimestamp + 100));
65:                 await marketplaceTest.setForSale(1, 0, BN.from(currentTimestamp + 100));
66:
67:                 await expect((await marketplaceTest.items(1)).seller).to.be.eq(wallet.address);
68:                 await expect((await marketplaceTest.items(1)).price).to.be.eq(0);
69:                 await expect((await marketplaceTest.items(1)).startTime).to.be.eq(
70:                     currentTimestamp + 100
71:                 );
72:             });
```

 
### **Recommended Mitigation Steps**
 
Add check `AlreadyOnSale` in `setForSale`, or add:
```Solidity
109:         if (items[tokenId].price == price || price == 0) revert InvalidSale();
```

------

### **[M-08] DoS with Failed Call**

```Solidity
contracts/Marketplace.sol
60:         if (userReward > 0) {
61:             REWARD_TOKEN.rewardUser(user, userReward);
62:         }
```

### **Impact**

External calls can fail accidentally or deliberately, which can cause a DoS condition in the contract. To minimize the damage caused by such failures, it is better to isolate each external call into its own transaction that can be initiated by the recipient of the call. This is especially relevant for payments, where it is better to let users withdraw funds rather than push funds to them automatically (this also reduces the chance of problems with the gas limit).

### **Proof of Concept**

See: [SWC-113](https://swcregistry.io/docs/SWC-113)

### **Recommended Mitigation Steps**
 
Since the reward token is out of scope, I can only recommend you to follow call best practices:
 
1) Avoid combining multiple calls in a single transaction, especially when calls are executed as part of a loop.
2) Always assume that external calls can fail.
3) Implement the contract logic to handle failed calls.
 
In our case: if one of the calls fails - all user's deposits and rewards are stuck.
------
# **Low Risk and Non-Critical Issues (8)**

### ***LOW RISK ISSUES***
----
 
### **[L-01] Important functions doesn't emit events**
 
### **Impact**
Consider emitting events when a token was set for sale or bought. This will be more transparent, and it will make it easier for clients to subscribe to the events when they want to keep track of the status of the system.
### **Proof of Concept**

See similar High-severity H03 finding OpenZeppelin’s Audit of Audius (https://blog.openzeppelin.com/audius-contracts-audit/#high) and Medium-severity M01 finding OpenZeppelin’s Audit of UMA Phase 4 (https://blog.openzeppelin.com/uma-audit-phase-4/)
### **Recommended Mitigation Steps**

Add events for `setForSale`, `discardFromSale`, `postponeSale`, `claim` functions.
------
 
### **[L-02] Any existing token can be discarded from sale**
 
```Solidity
contracts/Marketplace.sol
114:     function discardFromSale(uint256 tokenId) external {
115:         if (NFT_TOKEN.ownerOf(tokenId) != msg.sender) revert NotItemOwner();
```

### **Impact**

Any existing ERC721 token can be successfully discarded from the sale, while not being setted on sale.

### **Proof of Concept**
```Typescript
            it('Should discard from sale unlisted token', async () => {
               nft.mint();
               await marketplaceTest.discardFromSale(2);
           });
```
### **Recommended Mitigation Steps**

Add `NotSettedYet` check in `discardFromSale` function.
------
 
### **[L-03] Sale can be postponed on 0 seconds**
 
```Solidity
contracts/Marketplace.sol
120: function postponeSale(uint256 tokenId, uint256 postponeSeconds) external {
```
 
### **Impact**

Sale can be postponed on 0 seconds, which doesn't make sence.

### **Proof of Concept**
 
```Typescript
test/marketplace.spec.ts
111:             it('Should pospone sale for 0 seconds', async () => {
112:                 nft.mint();
113:                 let { currentTimestamp } = await getBlockData();
114:                 await marketplaceTest.setForSale(2, 1, BN.from(currentTimestamp + 100));
115:
116:                 await marketplaceTest.postponeSale(2, 0);
117:
118:                 await expect((await marketplaceTest.items(2)).seller).to.be.eq(wallet.address);
119:                 await expect((await marketplaceTest.items(2)).price).to.be.eq(1);
120:                 await expect((await marketplaceTest.items(2)).startTime).to.be.eq(
121:                     currentTimestamp + 100
122:                 ); // equals
123:             });
```
### **Recommended Mitigation Steps**

Add if statement with error:
```Solidity
error CannotPostponeOnZero();
...
if (postponeSeconds == 0) revert CannotPostponeOnZero();
```
------
 
### **[L-04] InvalidSale() error used too often**
 
```Solidity
contracts/Marketplace.sol
106:     function setForSale(uint256 tokenId, uint256 price, uint256 startTime) external {
107:         if (NFT_TOKEN.ownerOf(tokenId) != msg.sender) revert NotItemOwner();
108:         if (block.timestamp > startTime) revert InvalidSale();
109:         if (items[tokenId].price == price) revert InvalidSale();
...
contracts/Marketplace.sol
130:     function buy(uint256 tokenId) external {
131:         address owner = NFT_TOKEN.ownerOf(tokenId);
132:         if (owner == msg.sender) revert AlreadyOwner();
133:
134:         if (block.timestamp < items[tokenId].startTime) revert InvalidSale();
135:
136:         if (items[tokenId].price == 0 ||
137:             items[tokenId].seller == address(0) ||
138:             items[tokenId].seller == msg.sender) revert InvalidSale();
 
```
 
### **Impact**

`InvalidSale()` error message is used in a lot of cases and doesn't provide helpful information for debugging.

### **Recommended Mitigation Steps**

Add additional errors for different cases.
 
------
 
### **[L-05] No need to check if `seller` is `msg.sender`**
 
```Solidity
contracts/Marketplace.sol
131:         address owner = NFT_TOKEN.ownerOf(tokenId);
...
contracts/Marketplace.sol
136:         if (items[tokenId].price == 0 ||
137:             items[tokenId].seller == address(0) ||
138:             items[tokenId].seller == msg.sender) revert InvalidSale();
```
 
### **Impact**

Check that `seller` can't be a `msg.sender` is already done on line 131.
 
### **Proof of Concept**
 
```Typescript
test/marketplace.spec.ts
214:             it('Check if statement', async () => {
215:                 await nft.approve(marketplaceTest.address, 1);
216:                 await paymentToken.connect(other).approve(marketplaceTest.address, 1);
217:
218:                 await expect((await marketplaceTest.items(1)).seller).to.be.eq(wallet.address);
219:
220:                 // wait some time after setting for sale
221:                 await network.provider.send('evm_increaseTime', [Number(200)]);
222:                 await expect(marketplaceTest.connect(wallet).buy(1)).to.be.revertedWith(
223:                     'AlreadyOwner()'
224:                 );
225:             });
```
### **Recommended Mitigation Steps**

Remove `items[tokenId].seller == msg.sender` from the if condition.
 
------
### ***Non-Critical Issues***
----
 
### **[N-01] You can't sweep tokens that were sent to contract by mistake**
 
### **Impact**

If a user sends tokens to the contract address by mistake, they will be lost forever.

### **Recommended Mitigation Steps**

You can add a `sweep` function with authentication in order to withdraw stuck tokens.
 
------
 
### **[N-02] You should remove unused import**
 
```Solidity
contracts/Marketplace.sol
6: import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
```
 
### **Impact**

`IERC20Metadata.sol` can be removed from the contract.

### **Recommended Mitigation Steps**

Remove unused import from line 6.
 
### **[N-03] No need in SafeMath for Solidity ^0.8.0**

```Solidity
contracts/Marketplace.sol
8: import "@openzeppelin/contracts/utils/math/SafeMath.sol";
...
contracts/Marketplace.sol
17: using SafeMath for uint256;
```
 
### **Impact**

`SafeMath.sol` can be removed from the contract.
 
### **Proof of Concept**
 
See: https://github.com/OpenZeppelin/openzeppelin-contracts/commit/24a0bc23cfe3fbc76f8f2510b78af1e948ae6651#diff-f4b1737177aad965d94530b54ac4001a2e1f5fe6e4e34bafe023310cea599eca

### **Recommended Mitigation Steps**

Remove unused import from line 8 and 17.
 




