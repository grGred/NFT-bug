/* eslint-disable @typescript-eslint/no-magic-numbers */
import { ethers, network, waffle } from 'hardhat';
import { deployContractFixture } from './shared/fixtures';
import { Wallet } from '@ethersproject/wallet';
import { MarketplaceTest, TestERC20, TestERC721 } from '../typechain';
import { getBlockData } from './shared/utils';
import { expect } from 'chai';
import { DEADLINE } from './shared/consts';
import { BigNumber as BN, BigNumberish, ContractTransaction } from 'ethers';
const hre = require('hardhat');

const createFixtureLoader = waffle.createFixtureLoader;

describe('Tests', () => {
    let wallet: Wallet, other: Wallet;
    let marketplace: MarketplaceTest;
    let nft: TestERC721;
    let rewardToken: TestERC20;
    let paymentToken: TestERC20;

    let loadFixture: ReturnType<typeof createFixtureLoader>;

    before('create fixture loader', async () => {
        [wallet, other] = await (ethers as any).getSigners();
        loadFixture = createFixtureLoader([wallet, other]);
    });

    beforeEach('deploy fixture', async () => {
        ({ marketplace, nft, rewardToken, paymentToken } = await loadFixture(
            deployContractFixture
        ));
    });

    describe('Test marketplace', () => {
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
                // TODO discard after buy?
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

            it('Should not discard from sale with incorrect address', async () => {
                await expect(marketplace.connect(other).postponeSale(1, 0)).to.be.revertedWith(
                    'NotItemOwner()'
                );
            });
        });
    });
});
