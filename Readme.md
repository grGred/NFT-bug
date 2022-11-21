# **Audit of the Marketplace**
 
### **Scope**
 
The code under review can be found within the NFT-bug repository, and is composed of 2 smart contracts written in the Solidity programming language and includes 144 lines of Solidity code.
 
### **Summary**
 
A total of 14 unique vulnerabilities. Of these vulnerabilities, 5 received a risk rating in the category of HIGH severity and 9 received a risk rating in the category of MEDIUM severity.
Additionally, I included 8 reports detailing issues with a risk rating of LOW severity or non-critical. There were also 5 reports recommending gas optimizations.
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

 
Use of `block.timestamp` is insecure, as a miner can choose to provide any timestamp within a few seconds and still get his block accepted by others. Any user can brute force pre-computing block.timestamps and send claim transactions with big rewards.  


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
 
For loop tries to access an out-of-bounds index.
 
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

# **Medium Risk Findings (9)**

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

### **[M-09] Possible to claim rewards for user**

```Solidity
contracts/Marketplace.sol
42:     function claim(address user) external {
```

### **Impact**

Any user can claim rewards and withdraw funds to other user. Even if the owner of the deposit doesn't want it.

### **Proof of Concept**

```Typescript
            it('Should claim token FOR the other user', async () => {
                await network.provider.send('evm_increaseTime', [Number(604800 * 3)]); // 3 weeks
                await hre.network.provider.send('hardhat_mine', ['0x3e8']); // mine 1000 blocks

                await marketplaceTest.connect(other).claim(wallet.address);
            });
```

### **Recommended Mitigation Steps**
 
Change `user` to `msg.sender`. If you want to have this functioanality it's recommended to create new function `claimFor` with additioanal checks.

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
 
----

# **Gas optimizations (5)**

### **[G-01] Optimize assembly code**

```Solidity
contracts/Marketplace.sol
123:         ItemSale storage item = items[tokenId]; 
124:         assembly {
125:             let s := add(item.slot, 2)
126:             sstore(s, add(sload(s), postponeSeconds))
127:         }
```

Can be optimized by wrapping in assembly:

```Solidity
        assembly {
            mstore(0x00, tokenId)
            mstore(0x20, items.slot)
            let s := add(keccak256(0x00, 0x40), 2)

            sstore(s, add(sload(s), postponeSeconds))
        }
```

Gas savings: about 10 gas.

----

### **[G-02] Declare constant as private variable**

```Solidity
contracts/Marketplace.sol
26: uint256 constant public PCT_DENOMINATOR = 1000;
```

Can be declared as a private variable to save bytecode. Compilator won't create view function for the access, while this parameter will be still available for reading through storage.

```Solidity
26: uint256 constant private PCT_DENOMINATOR = 1000;
```

----

### **[G-03] Caching storage variables in memory to save gas**

```Solidity
contracts/Marketplace.sol
47: Reward storage reward = _rewards[user][length - i];
```

Anytime you are reading from storage more than once, it is cheaper in gas cost to cache the variable in memory: a SLOAD cost 100gas, while MLOAD and MSTORE cost 3 gas.

E.g.:
```Solidity
Reward memory reward = _rewards[user][length - i];
```
And:
```Solidity
    function buy(uint256 tokenId) external {
        address owner = NFT_TOKEN.ownerOf(tokenId);
        if (owner == msg.sender) revert AlreadyOwner();
        ItemSale memory item = items[tokenId]; // copy to memory
        if (block.timestamp < item.startTime) revert InvalidSale();

        if (item.price == 0 ||
            item.seller == address(0) ||
            item.seller == msg.sender) revert InvalidSale();
            
        depositForRewards(owner, msg.sender, item.price);
        NFT_TOKEN.transferFrom(owner, msg.sender, tokenId);
        delete items[tokenId]; // delete actual storage slot
    }
```

Gas savings: at least 97 gas.

----

### **[G-04] Taking off externall calls from for cycle**

```Solidity
contracts/Marketplace.sol
60:         if (userReward > 0) {
61:             REWARD_TOKEN.rewardUser(user, userReward);
62:         }
...
contracts/Marketplace.sol
68:         _rewardsAmount -= amount;
69:         PAYMENT_TOKEN.transfer(user, amount);
```

It's recommened to make `withdrawLastDeposit` and `payRewards` return the value that should be sent, write it to memory variable, and after the for loop execute all externall calls.

Gas savings: >20000 gas.

----

### **[G-05] improve for loop**

```Solidity
contracts/Marketplace.sol
46: for (uint256 i = 0; i < length; i++) {
```

* **Caching the length in for loops**

Reading array length at each iteration of the loop takes 6 gas (3 for `mload` and 3 to place `memory_offset` ) in the stack.
Caching the array length in the stack saves around 3 gas per iteration.
I suggest storing the array’s length in a variable before the for-loop.

Example of an array arr and the following loop:
```Solidity
for (uint i = 0; i < length; i++) {
    // do something that doesn't change the value of i
}
``` 
In the above case, the solidity compiler will always read the length of the array during each iteration. 
1. If it is a storage array, this is an extra `sload` operation (100 additional extra gas ([EIP-2929](https://eips.ethereum.org/EIPS/eip-2929)) for each iteration except for the first),
2. If it is a `memory` array, this is an extra `mload` operation (3 additional gas for each iteration except for the first),
3. If it is a `calldata` array, this is an extra `calldataload` operation (3 additional gas for each iteration except for the first)
This extra costs can be avoided by caching the array length (in stack):

```Solidity
uint length = arr.length;
for (uint i = 0; i < length; i++) {
    // do something that doesn't change arr.length
}
```
In the above example, the `sload` or `mload` or `calldataload` operation is only called once and subsequently replaced by a cheap `dupN` instruction. Even though `mload`, `calldataload` and `dupN` have the same gas cost, `mload` and `calldataload` needs an additional `dupN` to put the offset in the stack, i.e., an extra 3 gas.

This optimization is especially important if it is a storage array or if it is a lengthy for loop.

* **The increment in for loop post condition can be made unchecked**

In Solidity 0.8+, there’s a default overflow check on unsigned integers. It’s possible to uncheck this in for-loops and save some gas at each iteration, but at the cost of some code readability, as this uncheck [cannot be made inline](https://github.com/ethereum/solidity/issues/10695).

Example for loop:

```Solidity
for (uint i = 0; i < length; i++) {
    // do something that doesn't change the value of i
}
```

In this example, the for loop post condition, i.e., `i++` involves checked arithmetic, which is not required. This is because the value of i is always strictly less than `length <= 2**256 - 1`. Therefore, the theoretical maximum value of i to enter the for-loop body `is 2**256 - 2`. This means that the `i++` in the for loop can never overflow. Regardless, the overflow checks are performed by the compiler.

Unfortunately, the Solidity optimizer is not smart enough to detect this and remove the checks. You should manually do this by:

```Solidity
for (uint i = 0; i < length; i = unchecked_inc(i)) {
    // do something that doesn't change the value of i
}

function unchecked_inc(uint i) returns (uint) {
    unchecked {
        return i + 1;
    }
}
```
Or just:
```Solidity
for (uint i = 0; i < length;) {
    // do something that doesn't change the value of i
    unchecked { i++; }
}
```

Note that it’s important that the call to `unchecked_inc` is inlined. This is only possible for solidity versions starting from `0.8.2`.

Gas savings: roughly speaking this can save 30-40 gas per loop iteration. For lengthy loops, this can be significant!
(This is only relevant if you are using the default solidity checked arithmetic.)

* **`++i` costs less gas compared to `i++` or `i += 1`**

`++i `costs less gas compared to `i++` or` i += 1` for unsigned integer, as pre-increment is cheaper (about 5 gas per iteration). This statement is true even with the optimizer enabled.

Example:
`i++` increments `i` and returns the initial value of `i`. Which means:
```Solidity
uint i = 1; 
i++; // == 1 but i == 2 
```
But `++i` returns the actual incremented value:
```Solidity
uint i = 1; 
++i; // == 2 and i == 2 too, so no need for a temporary variable 
```
In the first case, the compiler has to create a temporary variable (when used) for returning 1 instead of 2

* **No need to explicitly initialize variables with default values**

If a variable is not set/initialized, it is assumed to have the default value (0 for uint, false for bool, address(0) for address…). Explicitly initializing it with its default value is an anti-pattern and wastes gas.
As an example:
`for (uint256 i = 0; i < numIterations; ++i) {` 
should be replaced with:
`for (uint256 i; i < numIterations; ++i) {`

* **Don't remove initialization of `i` varible in for loops**

I see a lot of projects where developers mistakenly believe that the removal of `i` vatiable outside of the for loop will save gas. In following snippets you can see that this is wrong:

```Solidity
    function loopCheck1(uint256[] memory arr) external returns (uint256[] memory) {
        gas = gasleft(); // 29863 gas
        uint length = arr.length;
        for (uint i; i < length;) {
            unchecked { ++i; }
        }
        return arr;
        gas -= gasleft();
    }
    
    function loopCheck2(uint256[] memory arr) external  returns (uint256[] memory) {
        gas = gasleft();
        uint i;
        uint length = arr.length;
        for (; i < length;) { // 29912 gas
            unchecked { ++i; }
        }
        return arr;
        gas -= gasleft();
    }
```

* **To sum up, the best gas optimized loop will be:**
```Solidity
uint length = arr.length;
for (uint i; i < length;) {
    unchecked { ++i; }
}
```
