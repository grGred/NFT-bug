/* eslint-disable @typescript-eslint/no-magic-numbers */
import { ethers, network, waffle } from 'hardhat';
import { deployContractFixture } from './shared/fixtures';
import { Wallet } from '@ethersproject/wallet';
import { Marketplace, MarketplaceTest, TestERC20, TestERC721 } from '../typechain';
import { getBlockData } from './shared/utils';
import { expect } from 'chai';
import { BigNumber as BN } from 'ethers';
const hre = require('hardhat');

const createFixtureLoader = waffle.createFixtureLoader;

describe('Tests', () => {
    let wallet: Wallet, other: Wallet;
    let marketplace: Marketplace;
    let marketplaceTest: MarketplaceTest;
    let nft: TestERC721;
    let rewardToken: TestERC20;
    let paymentToken: TestERC20;

    let loadFixture: ReturnType<typeof createFixtureLoader>;

    before('create fixture loader', async () => {
        [wallet, other] = await (ethers as any).getSigners();
        loadFixture = createFixtureLoader([wallet, other]);
    });

    beforeEach('deploy fixture', async () => {
        ({ marketplace, marketplaceTest, nft, rewardToken, paymentToken } = await loadFixture(
            deployContractFixture
        ));
    });

    describe('MarketplaceTest', () => {
        describe('#setForSale', () => {
            beforeEach('prepare before setForSale', async () => {
                nft.mint();
            });

            it('Should revert with timestamp in past', async () => {
                let { currentTimestamp } = await getBlockData();
                await expect(
                    marketplaceTest.setForSale(1, 1, BN.from(currentTimestamp - 100))
                ).to.be.revertedWith('InvalidSale');
            });

            it('Should not set for sale with 0 price for initial setting', async () => {
                let { currentTimestamp } = await getBlockData();
                await expect(
                    marketplaceTest.setForSale(1, 0, BN.from(currentTimestamp + 100))
                ).to.be.revertedWith('InvalidSale');
            });

            it('Should not not give setting other token for sale', async () => {
                let { currentTimestamp } = await getBlockData();
                await expect(
                    marketplaceTest.connect(other).setForSale(1, 0, BN.from(currentTimestamp + 100))
                ).to.be.revertedWith('NotItemOwner()');
            });

            // BUG
            it('Should set for sale with 0 price for token after setting for second time', async () => {
                let { currentTimestamp } = await getBlockData();
                await marketplaceTest.setForSale(1, 1, BN.from(currentTimestamp + 100));
                await marketplaceTest.setForSale(1, 0, BN.from(currentTimestamp + 100));

                await expect((await marketplaceTest.items(1)).seller).to.be.eq(wallet.address);
                await expect((await marketplaceTest.items(1)).price).to.be.eq(0);
                await expect((await marketplaceTest.items(1)).startTime).to.be.eq(
                    currentTimestamp + 100
                );
            });
        });

        describe('#discardFromSale', () => {
            beforeEach('prepare before discardFromSale', async () => {
                nft.mint();
                let { currentTimestamp } = await getBlockData();
                await marketplaceTest.setForSale(1, 1, BN.from(currentTimestamp + 100));
            });

            it('Should discard from sale', async () => {
                await marketplaceTest.discardFromSale(1);
                await expect((await marketplaceTest.items(1)).seller).to.be.eq(
                    ethers.constants.AddressZero
                );
                await expect((await marketplaceTest.items(1)).price).to.be.eq(0);
                await expect((await marketplaceTest.items(1)).startTime).to.be.eq(0);
            });

            it('Should discard from sale unlisted token', async () => {
                nft.mint();
                await marketplaceTest.discardFromSale(2);
            });

            it('Should not discard from sale with incorrect address', async () => {
                await expect(marketplaceTest.connect(other).discardFromSale(1)).to.be.revertedWith(
                    'NotItemOwner()'
                );
            });
        });

        describe('#postponeSale', () => {
            beforeEach('prepare before postponeSale', async () => {
                nft.mint();
                let { currentTimestamp } = await getBlockData();
                await marketplaceTest.setForSale(1, 1, BN.from(currentTimestamp + 100));
            });

            // INFO, should be more than 0
            it('Should pospone sale for 0 seconds', async () => {
                nft.mint();
                let { currentTimestamp } = await getBlockData();
                await marketplaceTest.setForSale(2, 1, BN.from(currentTimestamp + 100));

                await marketplaceTest.postponeSale(2, 0);

                await expect((await marketplaceTest.items(2)).seller).to.be.eq(wallet.address);
                await expect((await marketplaceTest.items(2)).price).to.be.eq(1);
                await expect((await marketplaceTest.items(2)).startTime).to.be.eq(
                    currentTimestamp + 100
                ); // equals
            });

            it('Should pospone sale for 10 seconds', async () => {
                nft.mint();
                let { currentTimestamp } = await getBlockData();
                await marketplaceTest.setForSale(2, 1, BN.from(currentTimestamp + 100));

                await marketplaceTest.postponeSale(2, 10);

                await expect((await marketplaceTest.items(2)).seller).to.be.eq(wallet.address);
                await expect((await marketplaceTest.items(2)).price).to.be.eq(1);
                await expect((await marketplaceTest.items(2)).startTime).to.be.eq(
                    currentTimestamp + 110
                ); // equals
            });

            // Overflow bug
            it('Should revert with overflow', async () => {
                nft.mint();
                let { currentTimestamp } = await getBlockData();
                await marketplaceTest.setForSale(2, 1, BN.from(currentTimestamp + 100));

                await marketplaceTest.postponeSale(2, ethers.constants.MaxUint256); // MAX UINT

                await expect((await marketplaceTest.items(2)).startTime).to.be.closeTo(
                    BN.from(currentTimestamp + 100),
                    1000
                ); // equals

                // console.log((await marketplaceTest.items(2)).startTime); // BigNumber { value: "1668939962" }
            });

            it('Should not discard from sale with incorrect address', async () => {
                await expect(marketplaceTest.connect(other).postponeSale(1, 0)).to.be.revertedWith(
                    'NotItemOwner()'
                );
            });
        });

        describe('#buy', () => {
            beforeEach('prepare before buy', async () => {
                nft.mint();
                let { currentTimestamp } = await getBlockData();
                await marketplaceTest.setForSale(1, 1, BN.from(currentTimestamp + 100));
                await paymentToken.transfer(other.address, ethers.utils.parseEther('1000'));
                await rewardToken.transfer(other.address, ethers.utils.parseEther('1000'));
            });

            it('Should revert with already owner', async () => {
                await expect(marketplaceTest.buy(1)).to.be.revertedWith('AlreadyOwner()');
            });

            // Error names are shit
            it('Should revert because of the time has not started', async () => {
                await expect(marketplaceTest.connect(other).buy(1)).to.be.revertedWith(
                    'InvalidSale()'
                );
            });

            it('Should buy', async () => {
                await nft.approve(marketplaceTest.address, 1);
                await paymentToken.connect(other).approve(marketplaceTest.address, 1);

                // wait some time after setting for sale
                await network.provider.send('evm_increaseTime', [Number(200)]);
                await marketplaceTest.connect(other).buy(1);

                await expect((await marketplaceTest.items(1)).seller).to.be.eq(
                    ethers.constants.AddressZero
                );
                await expect((await marketplaceTest.items(1)).price).to.be.eq(0);
                await expect((await marketplaceTest.items(1)).startTime).to.be.eq(0);
            });

            // BUG description
            it('Should revert because price of token is 0', async () => {
                await nft.approve(marketplaceTest.address, 1);
                await paymentToken.connect(other).approve(marketplaceTest.address, 1);

                // reset token price to 0
                let { currentTimestamp } = await getBlockData();
                await marketplaceTest.setForSale(1, 0, BN.from(currentTimestamp + 100));

                // wait some time after setting for sale
                await network.provider.send('evm_increaseTime', [Number(200)]);
                await expect(marketplaceTest.connect(other).buy(1)).to.be.revertedWith(
                    'InvalidSale'
                );
            });

            // items[tokenId].seller == msg.sender check is useless
            it('Check if statement', async () => {
                await nft.approve(marketplaceTest.address, 1);
                await paymentToken.connect(other).approve(marketplaceTest.address, 1);

                await expect((await marketplaceTest.items(1)).seller).to.be.eq(wallet.address);

                // wait some time after setting for sale
                await network.provider.send('evm_increaseTime', [Number(200)]);
                await expect(marketplaceTest.connect(wallet).buy(1)).to.be.revertedWith(
                    'AlreadyOwner()'
                );
            });

            it('should not buy not listed token', async () => {
                nft.mint();
                await nft.approve(marketplaceTest.address, 2);
                await paymentToken
                    .connect(other)
                    .approve(marketplaceTest.address, ethers.constants.MaxUint256);

                await expect((await marketplaceTest.items(2)).seller).to.be.eq(
                    ethers.constants.AddressZero
                );

                await expect(marketplaceTest.connect(other).buy(2)).to.be.revertedWith(
                    'InvalidSale()'
                );
            });
        });

        describe('#claim', () => {
            beforeEach('prepare before claim', async () => {
                nft.mint();
                let { currentTimestamp } = await getBlockData();
                await marketplaceTest.setForSale(1, 1, BN.from(currentTimestamp + 100));
                await network.provider.send('evm_increaseTime', [Number(200)]);
                await nft.approve(marketplaceTest.address, 1);
                await paymentToken
                    .connect(other)
                    .approve(marketplaceTest.address, ethers.constants.MaxUint256);
                await paymentToken.transfer(other.address, ethers.utils.parseEther('1000'));
                await rewardToken.transfer(other.address, ethers.utils.parseEther('1000'));
                await marketplaceTest.connect(other).buy(1);
            });

            // Length bug // Cannot test further, skip test
            it.skip('Should not claim because of the length bug', async () => {
                await expect(marketplaceTest.claim(wallet.address)).to.be.reverted;
                // reverted with panic code 0x32 (Array accessed at an out-of-bounds or negative index)
            });

            // BUG
            it('Should revert claim with 1 token the same day', async () => {
                await expect(marketplaceTest.claim(wallet.address)).to.be.reverted;
                // Error: VM Exception while processing transaction: reverted with panic code 0x12 (Division or modulo division by zero)
            });

            it('Should claim with 1 token after 3 weeks', async () => {
                await network.provider.send('evm_increaseTime', [Number(604800 * 3)]); // 3 weeks
                await hre.network.provider.send('hardhat_mine', ['0x3e8']); // mine 1000 blocks

                await marketplaceTest.claim(wallet.address);
            });

            it('Should claim token FOR the other user', async () => {
                await network.provider.send('evm_increaseTime', [Number(604800 * 3)]); // 3 weeks
                await hre.network.provider.send('hardhat_mine', ['0x3e8']); // mine 1000 blocks

                await marketplaceTest.connect(other).claim(wallet.address);
            });

            it('Should delete all the data after claim', async () => {
                await network.provider.send('evm_increaseTime', [Number(604800 * 3)]); // 3 weeks
                await hre.network.provider.send('hardhat_mine', ['0x3e8']); // mine 1000 blocks

                await marketplaceTest.claim(wallet.address);
                await expect(marketplaceTest.claim(wallet.address)).to.be.revertedWith(
                    'NothingForClaim()'
                );
            });

            it('Should claim with 2 tokens and get rewards', async () => {
                nft.mint();
                let { currentTimestamp } = await getBlockData();
                await marketplaceTest.setForSale(
                    2,
                    ethers.utils.parseEther('10'),
                    BN.from(currentTimestamp + 100)
                );
                await network.provider.send('evm_increaseTime', [Number(200)]);

                await nft.approve(marketplaceTest.address, 2);
                await marketplaceTest.connect(other).buy(2);

                nft.mint();

                await marketplaceTest.setForSale(
                    3,
                    ethers.utils.parseEther('100'),
                    BN.from(currentTimestamp + 1300)
                );
                await network.provider.send('evm_increaseTime', [Number(1300)]);

                await nft.approve(marketplaceTest.address, 3);
                await marketplaceTest.connect(other).buy(3);

                await network.provider.send('evm_increaseTime', [Number(604800 * 3)]); // 3 weeks
                await hre.network.provider.send('hardhat_mine', ['0x3e8']); // mine 1000 blocks

                await marketplaceTest.claim(wallet.address);
            });
        });
    });

    // Copy paste of previous tests, in order to check for gas optimizations
    describe('Marketplace', () => {
        describe('#setForSale', () => {
            beforeEach('prepare before setForSale', async () => {
                nft.mint();
            });

            it('Should revert with timestamp in past', async () => {
                let { currentTimestamp } = await getBlockData();
                await expect(
                    marketplace.setForSale(1, 1, BN.from(currentTimestamp - 100))
                ).to.be.revertedWith('InvalidSale');
            });

            it('Should not set for sale with 0 price for initial setting', async () => {
                let { currentTimestamp } = await getBlockData();
                await expect(
                    marketplace.setForSale(1, 0, BN.from(currentTimestamp + 100))
                ).to.be.revertedWith('InvalidSale');
            });

            it('Should not not give setting other token for sale', async () => {
                let { currentTimestamp } = await getBlockData();
                await expect(
                    marketplace.connect(other).setForSale(1, 0, BN.from(currentTimestamp + 100))
                ).to.be.revertedWith('NotItemOwner()');
            });

            // BUG
            it('Should set for sale with 0 price for token after setting for second time', async () => {
                let { currentTimestamp } = await getBlockData();
                await marketplace.setForSale(1, 1, BN.from(currentTimestamp + 100));
                await marketplace.setForSale(1, 0, BN.from(currentTimestamp + 100));

                await expect((await marketplace.items(1)).seller).to.be.eq(wallet.address);
                await expect((await marketplace.items(1)).price).to.be.eq(0);
                await expect((await marketplace.items(1)).startTime).to.be.eq(
                    currentTimestamp + 100
                );
            });
        });

        describe('#discardFromSale', () => {
            beforeEach('prepare before discardFromSale', async () => {
                nft.mint();
                let { currentTimestamp } = await getBlockData();
                await marketplace.setForSale(1, 1, BN.from(currentTimestamp + 100));
            });

            it('Should discard from sale', async () => {
                await marketplace.discardFromSale(1);
                await expect((await marketplace.items(1)).seller).to.be.eq(
                    ethers.constants.AddressZero
                );
                await expect((await marketplace.items(1)).price).to.be.eq(0);
                await expect((await marketplace.items(1)).startTime).to.be.eq(0);
            });

            it('Should not discard from sale with incorrect address', async () => {
                await expect(marketplace.connect(other).discardFromSale(1)).to.be.revertedWith(
                    'NotItemOwner()'
                );
            });
        });

        describe('#postponeSale', () => {
            beforeEach('prepare before postponeSale', async () => {
                nft.mint();
                let { currentTimestamp } = await getBlockData();
                await marketplace.setForSale(1, 1, BN.from(currentTimestamp + 100));
            });

            // INFO, should be more than 0
            it('Should pospone sale for 0 seconds', async () => {
                nft.mint();
                let { currentTimestamp } = await getBlockData();
                await marketplace.setForSale(2, 1, BN.from(currentTimestamp + 100));

                await marketplace.postponeSale(2, 0);

                await expect((await marketplace.items(2)).seller).to.be.eq(wallet.address);
                await expect((await marketplace.items(2)).price).to.be.eq(1);
                await expect((await marketplace.items(2)).startTime).to.be.eq(
                    currentTimestamp + 100
                ); // equals
            });

            it('Should pospone sale for 10 seconds', async () => {
                nft.mint();
                let { currentTimestamp } = await getBlockData();
                await marketplace.setForSale(2, 1, BN.from(currentTimestamp + 100));

                await marketplace.postponeSale(2, 10);

                await expect((await marketplace.items(2)).seller).to.be.eq(wallet.address);
                await expect((await marketplace.items(2)).price).to.be.eq(1);
                await expect((await marketplace.items(2)).startTime).to.be.eq(
                    currentTimestamp + 110
                ); // equals
            });

            // Overflow bug
            it('Should revert with overflow', async () => {
                nft.mint();
                let { currentTimestamp } = await getBlockData();
                await marketplace.setForSale(2, 1, BN.from(currentTimestamp + 100));

                await marketplace.postponeSale(2, ethers.constants.MaxUint256); // MAX UINT

                await expect((await marketplace.items(2)).startTime).to.be.closeTo(
                    BN.from(currentTimestamp + 100),
                    1000
                ); // equals

                // console.log((await marketplace.items(2)).startTime); // BigNumber { value: "1668939962" }
            });

            it('Should not discard from sale with incorrect address', async () => {
                await expect(marketplace.connect(other).postponeSale(1, 0)).to.be.revertedWith(
                    'NotItemOwner()'
                );
            });
        });

        describe('#buy', () => {
            beforeEach('prepare before buy', async () => {
                nft.mint();
                let { currentTimestamp } = await getBlockData();
                await marketplace.setForSale(1, 1, BN.from(currentTimestamp + 100));
                await paymentToken.transfer(other.address, ethers.utils.parseEther('1000'));
                await rewardToken.transfer(other.address, ethers.utils.parseEther('1000'));
            });

            it('Should revert with already owner', async () => {
                await expect(marketplace.buy(1)).to.be.revertedWith('AlreadyOwner()');
            });

            // Error names are shit
            it('Should revert because of the time has not started', async () => {
                await expect(marketplace.connect(other).buy(1)).to.be.revertedWith('InvalidSale()');
            });

            it('Should buy', async () => {
                await nft.approve(marketplace.address, 1);
                await paymentToken.connect(other).approve(marketplace.address, 1);

                // wait some time after setting for sale
                await network.provider.send('evm_increaseTime', [Number(200)]);
                await marketplace.connect(other).buy(1);

                await expect((await marketplace.items(1)).seller).to.be.eq(
                    ethers.constants.AddressZero
                );
                await expect((await marketplace.items(1)).price).to.be.eq(0);
                await expect((await marketplace.items(1)).startTime).to.be.eq(0);
            });

            // BUG description
            it('Should revert because price of token is 0', async () => {
                await nft.approve(marketplace.address, 1);
                await paymentToken.connect(other).approve(marketplace.address, 1);

                // reset token price to 0
                let { currentTimestamp } = await getBlockData();
                await marketplace.setForSale(1, 0, BN.from(currentTimestamp + 100));

                // wait some time after setting for sale
                await network.provider.send('evm_increaseTime', [Number(200)]);
                await expect(marketplace.connect(other).buy(1)).to.be.revertedWith('InvalidSale');
            });

            // items[tokenId].seller == msg.sender check is useless
            it('Check if statement', async () => {
                await nft.approve(marketplace.address, 1);
                await paymentToken.connect(other).approve(marketplace.address, 1);

                await expect((await marketplace.items(1)).seller).to.be.eq(wallet.address);

                // wait some time after setting for sale
                await network.provider.send('evm_increaseTime', [Number(200)]);
                await expect(marketplace.connect(wallet).buy(1)).to.be.revertedWith(
                    'AlreadyOwner()'
                );
            });

            it('should not buy not listed token', async () => {
                nft.mint();
                await nft.approve(marketplace.address, 2);
                await paymentToken
                    .connect(other)
                    .approve(marketplace.address, ethers.constants.MaxUint256);

                await expect((await marketplace.items(2)).seller).to.be.eq(
                    ethers.constants.AddressZero
                );

                await expect(marketplace.connect(other).buy(2)).to.be.revertedWith('InvalidSale()');
            });
        });

        describe('#claim', () => {
            beforeEach('prepare before claim', async () => {
                nft.mint();
                let { currentTimestamp } = await getBlockData();
                await marketplace.setForSale(1, 1, BN.from(currentTimestamp + 100));
                await network.provider.send('evm_increaseTime', [Number(200)]);
                await nft.approve(marketplace.address, 1);
                await paymentToken
                    .connect(other)
                    .approve(marketplace.address, ethers.constants.MaxUint256);
                await paymentToken.transfer(other.address, ethers.utils.parseEther('1000'));
                await rewardToken.transfer(other.address, ethers.utils.parseEther('1000'));
                await marketplace.connect(other).buy(1);
            });

            // Length bug // Cannot test further, skip test
            it('Should not claim because of the length bug', async () => {
                await expect(marketplace.claim(wallet.address)).to.be.reverted;
                // reverted with panic code 0x32 (Array accessed at an out-of-bounds or negative index)
            });

            // NEXT TESTS ARE SKIPPED BECAUSE OF THAT, BUT THERE ARE MORE BUGS

            // BUG
            it.skip('Should revert claim with 1 token the same day', async () => {
                await expect(marketplace.claim(wallet.address)).to.be.reverted;
                // reverted with panic code 0x32 (Array accessed at an out-of-bounds or negative index)
            });

            // reverted with panic code 0x32 (Array accessed at an out-of-bounds or negative index)
            it.skip('Should claim with 1 token after 3 weeks', async () => {
                await network.provider.send('evm_increaseTime', [Number(604800 * 3)]); // 3 weeks
                await hre.network.provider.send('hardhat_mine', ['0x3e8']); // mine 1000 blocks

                await marketplace.claim(wallet.address);
            });

            // reverted with panic code 0x32 (Array accessed at an out-of-bounds or negative index)
            it.skip('Should delete all the data after claim', async () => {
                await network.provider.send('evm_increaseTime', [Number(604800 * 3)]); // 3 weeks
                await hre.network.provider.send('hardhat_mine', ['0x3e8']); // mine 1000 blocks

                await marketplace.claim(wallet.address);
                await expect(marketplace.claim(wallet.address)).to.be.revertedWith(
                    'NothingForClaim()'
                );
            });

            // reverted with panic code 0x32 (Array accessed at an out-of-bounds or negative index)
            it.skip('Should claim with 2 tokens and get rewards', async () => {
                nft.mint();
                let { currentTimestamp } = await getBlockData();
                await marketplace.setForSale(
                    2,
                    ethers.utils.parseEther('10'),
                    BN.from(currentTimestamp + 100)
                );
                await network.provider.send('evm_increaseTime', [Number(200)]);

                await nft.approve(marketplace.address, 2);
                await marketplace.connect(other).buy(2);

                nft.mint();

                await marketplace.setForSale(
                    3,
                    ethers.utils.parseEther('100'),
                    BN.from(currentTimestamp + 1300)
                );
                await network.provider.send('evm_increaseTime', [Number(1300)]);

                await nft.approve(marketplace.address, 3);
                await marketplace.connect(other).buy(3);

                await network.provider.send('evm_increaseTime', [Number(604800 * 3)]); // 3 weeks
                await hre.network.provider.send('hardhat_mine', ['0x3e8']); // mine 1000 blocks

                await marketplace.claim(wallet.address);
            });
        });
    });
});
