import hre from "hardhat";

async function main() {
  const { viem } = hre;

  const publicClient = await viem.getPublicClient();
  const [deployer] = await viem.getWalletClients();

  const memoryVault = await viem.deployContract("MemoryVault", [], {
    walletClient: deployer,
  });

  console.log("MemoryVault deployed to:", memoryVault.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
