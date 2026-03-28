'use strict';

/**
 * deploy.js
 * Hardhat deployment script for LubiesFactoryPass.
 *
 * Usage:
 *   npx hardhat run scripts/deploy.js --network localhost
 *   npx hardhat run scripts/deploy.js --network sepolia
 *   npx hardhat run scripts/deploy.js --network mainnet
 *
 * Required environment variables (see .env.example):
 *   DEPLOY_NAME, DEPLOY_SYMBOL, DEPLOY_MAX_SUPPLY, DEPLOY_GENESIS_SUPPLY,
 *   DEPLOY_UNREVEALED_URI, DEPLOY_ROYALTY_RECEIVER, DEPLOY_ROYALTY_BPS
 */

require('dotenv').config();
const { ethers, network } = require('hardhat');

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log(`\n--- Lubies Factory Pass Deployment ---`);
  console.log(`Network:   ${network.name}`);
  console.log(`Deployer:  ${deployer.address}`);
  console.log(`Balance:   ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH\n`);

  // ---------------------------------------------------------------------------
  // Config
  // ---------------------------------------------------------------------------
  const config = {
    name:            process.env.DEPLOY_NAME            || 'Lubies Factory Pass',
    symbol:          process.env.DEPLOY_SYMBOL          || 'LFP',
    maxSupply:       Number(process.env.DEPLOY_MAX_SUPPLY    || 5000),
    genesisSupply:   Number(process.env.DEPLOY_GENESIS_SUPPLY || 100),
    unrevealedURI:   process.env.DEPLOY_UNREVEALED_URI  || 'ipfs://UNREVEALED_CID/',
    royaltyReceiver: process.env.DEPLOY_ROYALTY_RECEIVER || deployer.address,
    royaltyBps:      Number(process.env.DEPLOY_ROYALTY_BPS   || 500),
  };

  console.log('Deployment config:');
  console.log(JSON.stringify(config, null, 2));
  console.log('');

  // ---------------------------------------------------------------------------
  // Deploy
  // ---------------------------------------------------------------------------
  console.log('Deploying LubiesFactoryPass...');

  const Factory = await ethers.getContractFactory('LubiesFactoryPass');
  const contract = await Factory.deploy(
    config.name,
    config.symbol,
    config.maxSupply,
    config.genesisSupply,
    config.unrevealedURI,
    config.royaltyReceiver,
    config.royaltyBps,
  );

  await contract.waitForDeployment();
  const address = await contract.getAddress();

  console.log(`\nLubiesFactoryPass deployed to: ${address}`);
  console.log(`Transaction hash:              ${contract.deploymentTransaction()?.hash}`);

  // ---------------------------------------------------------------------------
  // Post-deploy verification
  // ---------------------------------------------------------------------------
  console.log('\n--- Post-deploy checks ---');
  console.log(`name():          ${await contract.name()}`);
  console.log(`symbol():        ${await contract.symbol()}`);
  console.log(`maxSupply():     ${await contract.maxSupply()}`);
  console.log(`genesisSupply(): ${await contract.genesisSupply()}`);
  console.log(`isRevealed():    ${await contract.isRevealed()}`);
  console.log(`totalMinted():   ${await contract.totalMinted()}`);

  // ---------------------------------------------------------------------------
  // Save deployment artifact
  // ---------------------------------------------------------------------------
  const fs = require('fs');
  const path = require('path');

  const artifact = {
    network:   network.name,
    chainId:   (await ethers.provider.getNetwork()).chainId.toString(),
    address,
    deployer:  deployer.address,
    timestamp: new Date().toISOString(),
    txHash:    contract.deploymentTransaction()?.hash,
    config,
  };

  const artifactDir  = path.join(__dirname, '..', 'deployments');
  const artifactPath = path.join(artifactDir, `${network.name}.json`);

  if (!fs.existsSync(artifactDir)) fs.mkdirSync(artifactDir, { recursive: true });
  fs.writeFileSync(artifactPath, JSON.stringify(artifact, null, 2));

  console.log(`\nDeployment artifact saved to: ${artifactPath}`);
  console.log('\nNext steps:');
  console.log('  1. Set mint price:     contract.setMintPrice(ethers.parseEther("0.05"))');
  console.log('  2. Enable admin mint:  contract.adminMint(address, quantity)');
  console.log('  3. Set base URI:       contract.setBaseURI("ipfs://YOUR_METADATA_CID/")');
  console.log('  4. Reveal collection:  contract.revealCollection()');
  console.log('  5. Verify on etherscan: npx hardhat verify --network', network.name, address,
    `"${config.name}" "${config.symbol}" ${config.maxSupply} ${config.genesisSupply}`,
    `"${config.unrevealedURI}" "${config.royaltyReceiver}" ${config.royaltyBps}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
