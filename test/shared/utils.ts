import { ethers } from 'hardhat';

export const getBlockData = async function (): Promise<{
    currentTimestamp: Number;
    blockNum: Number;
}> {
    let blockNum = await ethers.provider.getBlockNumber();
    let block = await ethers.provider.getBlock(blockNum);
    let currentTimestamp = block.timestamp;
    return { currentTimestamp, blockNum };
};

export function hexStringToByteArray(hexString) {
    if (hexString.length % 2 !== 0) {
        // eslint-disable-next-line @typescript-eslint/no-throw-literal
        throw 'Must have an even number of hex digits to convert to bytes';
    }
    var numBytes = hexString.length / 2;
    var byteArray = new Uint8Array(numBytes);
    for (var i = 0; i < numBytes; i++) {
        byteArray[i] = parseInt(hexString.substr(i * 2, 2), 16);
    }
    return byteArray;
}
