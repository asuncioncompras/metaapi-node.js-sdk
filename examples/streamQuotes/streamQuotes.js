let MetaApi = require('metaapi.cloud-sdk').default;
let SynchronizationListener = require('metaapi.cloud-sdk').SynchronizationListener;

let token = process.env.TOKEN || '<put in your token here>';
let accountId = process.env.ACCOUNT_ID || '<put in your account id here>';

const api = new MetaApi(token);

class EURUSDListener extends SynchronizationListener {
  async onSymbolPriceUpdated(price) {
    if(price.symbol === 'EURUSD') {
      console.log('EURUSD price updated', price);
    }
  }
}

// eslint-disable-next-line
async function streamQuotes() {
  try {
    let account = await api.metatraderAccountApi.getAccount(accountId);

    // wait until account is deployed and connected to broker
    console.log('Deploying account');
    await account.deploy();
    console.log('Waiting for API server to connect to broker (may take couple of minutes)');
    await account.waitConnected();

    // connect to MetaApi API
    let connection = await account.connect();

    const eurUsdListener = new EURUSDListener();
    connection.addSynchronizationListener(eurUsdListener);

    // wait until terminal state synchronized to the local state
    console.log('Waiting for SDK to synchronize to terminal state (may take some time depending on your history ' + 
        'size), the price streaming will start once synchronization finishes');
    await connection.waitSynchronized(undefined, 1200);

    // Add symbol to MarketWatch if not yet added
    await connection.subscribeToMarketData('EURUSD');

    console.log('Streaming EURUSD price now...');

    // eslint-disable-next-line
    while(true){
      await new Promise(res => setTimeout(res, 1000));
    }

  } catch (err) {
    console.error(err);
  }
}

streamQuotes();
