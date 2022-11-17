import { Fixture } from 'ethereum-waffle';
import { ethers, network } from 'hardhat';
import { DEPLOY_CONTRACT } from '../../typechain';
import { TestERC20 } from '../../typechain';
import { WETH9 } from '../../typechain';
import TokenJSON from '../../artifacts/contracts/test/TestERC20.sol/TestERC20.json';
import WETHJSON from '../../artifacts/contracts/test/WETH9.sol/WETH9.json';
import { expect } from 'chai';

const envConfig = require('dotenv').config();
const { NATIVE_POLYGON: TEST_NATIVE, SWAP_TOKEN_POLYGON: TEST_SWAP_TOKEN } = envConfig.parsed || {};

interface DeployContractFixture {
    // CONTRACT: DEPLOY_CONTRACT,
    swapToken: TestERC20;
    wnative: WETH9;
}

export const deployContractFixture: Fixture<DeployContractFixture> = async function (
    wallets
): Promise<DeployContractFixture> {
    const swapTokenFactory = ethers.ContractFactory.fromSolidity(TokenJSON);
    let swapToken = (await swapTokenFactory.deploy()) as TestERC20;
    swapToken = swapToken.connect(wallets[0]);

    const wnativeFactory = ethers.ContractFactory.fromSolidity(WETHJSON);
    let wnative = (await wnativeFactory.deploy()) as WETH9;
    wnative = wnative.connect(wallets[0]);

    const DeployContractFactory = await ethers.getContractFactory('RubicRouterV2');

    // const contract = (await cFactory.deploy(
    //         // constructor parameter
    // )) as /* contract name*/;

    // part for seting storage
    const abiCoder = ethers.utils.defaultAbiCoder;

    const storageBalancePositionSwap = ethers.utils.keccak256(
        abiCoder.encode(['address'], [wallets[0].address]) +
            abiCoder.encode(['uint256'], [0]).slice(2, 66)
    );

    await network.provider.send('hardhat_setStorageAt', [
        swapToken.address,
        storageBalancePositionSwap,
        abiCoder.encode(['uint256'], [ethers.utils.parseEther('100000')])
    ]);

    expect(await swapToken.balanceOf(wallets[0].address)).to.eq(ethers.utils.parseEther('100000'));

    await network.provider.send('hardhat_setBalance', [
        wallets[0].address,
        '0x152D02C7E14AF6800000' // 100000 eth
    ]);

    return {
        swapToken,
        wnative
    };
};

export const deployContractFixtureInFork: Fixture<DeployContractFixture> = async function (
    wallets
): Promise<DeployContractFixture> {
    const swapTokenFactory = ethers.ContractFactory.fromSolidity(TokenJSON);
    let swapToken = swapTokenFactory.attach(TEST_SWAP_TOKEN) as TestERC20;
    swapToken = swapToken.connect(wallets[0]);

    const wnativeFactory = ethers.ContractFactory.fromSolidity(WETHJSON);
    let wnative = wnativeFactory.attach(TEST_NATIVE) as WETH9;
    wnative = wnative.connect(wallets[0]);

    const DeployContractFactory = await ethers.getContractFactory('RubicRouterV2');

    // const contract = (await cFactory.deploy(
    //         // constructor parameter
    // )) as /* contract name*/;

    // part for seting storage
    const abiCoder = ethers.utils.defaultAbiCoder;

    const storageBalancePositionSwap = ethers.utils.keccak256(
        abiCoder.encode(['address'], [wallets[0].address]) +
            abiCoder.encode(['uint256'], [0]).slice(2, 66)
    );

    await network.provider.send('hardhat_setStorageAt', [
        swapToken.address,
        storageBalancePositionSwap,
        abiCoder.encode(['uint256'], [ethers.utils.parseEther('100000')])
    ]);

    expect(await swapToken.balanceOf(wallets[0].address)).to.eq(ethers.utils.parseEther('100000'));

    await network.provider.send('hardhat_setBalance', [
        wallets[0].address,
        '0x152D02C7E14AF6800000' // 100000 eth
    ]);

    return {
        swapToken,
        wnative
    };
};
