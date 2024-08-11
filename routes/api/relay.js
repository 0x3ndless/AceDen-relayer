require('dotenv').config();
const express = require('express');
const Web3 = require('web3');
const axios = require('axios');

const router = express.Router();

// Contract variables
const ABI = require('../../abis/ABI.json');
const web3 = new Web3(process.env.BASE_RPC_URL);
const ACEDEN_CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
const PRIVATE_KEY = process.env.PRIVATE_KEY;

// Contract
const contract = new web3.eth.Contract(ABI, ACEDEN_CONTRACT_ADDRESS);

// Crypto IDs for fetching the latest price updates from pyth
const cryptoIds = {
  btc: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
  eth: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
  sol: '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
};

// Check for unsettled bets
async function checkUnsettledBets() {
  try {
    const hasUnsettledEndedBets = await contract.methods.hasUnsettledEndedBets().call();
    if (hasUnsettledEndedBets) {
      console.log('There are unsettled bets. Fetching price updates...');
      await fetchAndUpdatePrices();
      return 'Bets settled successfully.';
    } else {
      console.log('No unsettled bets at the moment.');
      return 'No unsettled bets at the moment.';
    }
  } catch (error) {
    console.error('Error checking for unsettled bets:', error);
    throw new Error('Failed to check unsettled bets.');
  }
}

// Fetch price updates and send a transaction
async function fetchAndUpdatePrices() {
  try {
    //Hermes API
    const response = await axios.get(
      'https://hermes.pyth.network/v2/updates/price/latest',
      {
        params: {
          'ids[]': Object.values(cryptoIds),
          encoding: 'hex',
          parsed: true,
        },
      }
    );

    const priceUpdates = response.data.binary.data.map((data) => `0x${data}`);

    //Relayer account
    const account = web3.eth.accounts.privateKeyToAccount(PRIVATE_KEY);
    web3.eth.accounts.wallet.add(account);

    // Transaction data
    const txData = contract.methods.updateLatestPrice(priceUpdates).encodeABI();

    // Transaction object
    const tx = {
      from: account.address,
      to: ACEDEN_CONTRACT_ADDRESS,
      gas: 2000000,
      data: txData,
    };

    const signedTx = await web3.eth.accounts.signTransaction(tx, PRIVATE_KEY);
    const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
    console.log('Transaction successful:', receipt);

    //Settle all expired bets
    console.log('Settling all expired bets...');

    // Transaction data for settling bets
    const settleBetsTxData = contract.methods.settleAllExpiredBets().encodeABI();

     // Transaction object for settling bets
     const settleBetsTx = {
      from: account.address,
      to: ACEDEN_CONTRACT_ADDRESS,
      gas: 2000000,
      data: settleBetsTxData,
    };

    // Sign and send the transaction for settling bets
    const signedSettleBetsTx = await web3.eth.accounts.signTransaction(settleBetsTx, PRIVATE_KEY);
    const settleBetsReceipt = await web3.eth.sendSignedTransaction(signedSettleBetsTx.rawTransaction);
    console.log('Settlement transaction successful:', settleBetsReceipt);


  } catch (error) {
    console.error('Error fetching price updates or sending transaction:', error);
    throw new Error('Failed to fetch price updates or send transaction.');
  }
}

// Define the route
router.get('/bets', async (req, res) => {
  try {
    const statusMessage = await checkUnsettledBets();
    res.status(200).json({result: statusMessage});
  } catch (error) {
    console.error('Error executing relayer:', error);
    res.status(500).json({error: 'An error occurred while executing the relayer.'});
  }
});

module.exports = router;