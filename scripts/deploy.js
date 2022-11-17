const hre = require("hardhat");

async function main() {
  const factory = await hre.ethers.getContractFactory("");

  const deploy = await factory.deploy(
      '',
  );

  await deploy.deployed();

  console.log("deployed to:", deploy.address);

  await new Promise(r => setTimeout(r, 10000));

    await hre.run("verify:verify", {
    address: deploy.address,
    constructorArguments: [
        '',
    ],
  });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
