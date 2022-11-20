import { Fixture } from 'ethereum-waffle';
import { ethers, network } from 'hardhat';
import { MarketplaceTest } from '../../typechain';
import { TestERC20, TestERC721 } from '../../typechain';
import { expect } from 'chai';

interface DeployContractFixture {
    marketplace: MarketplaceTest;
    nft: TestERC721;
    rewardToken: TestERC20;
    paymentToken: TestERC20;
}

export const deployContractFixture: Fixture<DeployContractFixture> = async function (
    wallets
): Promise<DeployContractFixture> {
    const TokenFactory = await ethers.getContractFactory('TestERC20');
    const NFTFactory = await ethers.getContractFactory('TestERC721');

    let rewardToken = (await TokenFactory.deploy()) as TestERC20;
    rewardToken = rewardToken.connect(wallets[0]);

    let paymentToken = (await TokenFactory.deploy()) as TestERC20;
    paymentToken = paymentToken.connect(wallets[0]);

    let nft = (await NFTFactory.deploy()) as TestERC721;
    nft = nft.connect(wallets[0]);

    const marketplaceFactory = await ethers.getContractFactory('MarketplaceTest');
    const marketplace = (await marketplaceFactory.deploy(
        nft.address,
        paymentToken.address,
        rewardToken.address
    )) as MarketplaceTest;

    // part for seting storage
    const abiCoder = ethers.utils.defaultAbiCoder;

    const storageBalancePosition = ethers.utils.keccak256(
        abiCoder.encode(['address'], [wallets[0].address]) +
            abiCoder.encode(['uint256'], [0]).slice(2, 66)
    );

    await network.provider.send('hardhat_setStorageAt', [
        rewardToken.address,
        storageBalancePosition,
        abiCoder.encode(['uint256'], [ethers.utils.parseEther('100000')])
    ]);

    await network.provider.send('hardhat_setStorageAt', [
        paymentToken.address,
        storageBalancePosition,
        abiCoder.encode(['uint256'], [ethers.utils.parseEther('100000')])
    ]);

    expect(await rewardToken.balanceOf(wallets[0].address)).to.eq(
        ethers.utils.parseEther('100000')
    );
    expect(await paymentToken.balanceOf(wallets[0].address)).to.eq(
        ethers.utils.parseEther('100000')
    );

    await network.provider.send('hardhat_setBalance', [
        wallets[0].address,
        '0x152D02C7E14AF6800000' // 100000 eth
    ]);

    return {
        marketplace,
        nft,
        rewardToken,
        paymentToken
    };
};
