import { ethers, network, waffle } from 'hardhat';
import { deployContractFixture } from './shared/fixtures';
import { Wallet } from '@ethersproject/wallet';
import { MarketplaceTest, TestERC20 } from '../typechain';
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
        ({ marketplace, nft, rewardToken, paymentToken } = await loadFixture(deployContractFixture));
    });

    describe('#Tests', () => {
        describe('#funcName', () => {
            it('Should do smth', async () => {
                console.log(marketplace.address)
            });
        });
    });
});
