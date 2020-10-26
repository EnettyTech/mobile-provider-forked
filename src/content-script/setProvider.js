/* global Web3 */
const { HttpProvider } = TronWeb.providers;

class ProxiedProvider extends HttpProvider {
  constructor() {
    super('http://127.0.0.1');
    this.ready = false;
    this.queue = [];
  }

  configure(url) {
    console.log('Received new node:', url);
    this.ready = true;

    while (this.queue.length) {
      const {
        args,
        resolve,
        reject
      } = this.queue.shift();

      this.request(...args)
        .then(resolve)
        .catch(reject)
        .then(() => (
          console.log(`Completed the queued request to ${args[0]}`)
        ));
    }
  }

  request(endpoint, payload = {}, method = 'get') {
    if (!this.ready) {
      console.log(`Request to ${endpoint} has been queued`);

      return new Promise((resolve, reject) => {
        this.queue.push({
          args: [endpoint, payload, method],
          resolve,
          reject
        });
      });
    }

    return super.request(endpoint, payload, method).then(res => {
      const response = res.transaction || res;

      Object.defineProperty(response, '__payload__', {
        writable: false,
        enumerable: false,
        configurable: false,
        value: payload
      });

      return res;
    });
  }
}

let lastTimeUsed
let didInjectWeb3 = false

const pageHook = {
  proxiedMethods: {
    setAddress: false,
    sign: false
  },
  init() {
    this._brindWeb3();
    this._bindTronWeb();
  },

  _brindWeb3() {
    if (typeof window.ethereum !== 'undefined') {
      console.warn('EzDefi detected another ethereum provider. EzDefi will not work reliably with another ethereum extension. This usually happens if you have both ExDefi and MetaMask installed, or EzDefi and another web3 extension. Please remove one and try again.')
    }

    if (!window.chrome) {
      window.chrome = { webstore: true }
    }

    // inject web3
    if (window.web3) {
      console.warn(`ezDefi detected another web3.
          ezDefi may not work reliably with web3 versions other than 0.20.7.`)
    } else {
      window.web3 = new Web3(window.ethereum)
      window.solana = window.ethereum;

      window.web3.setProvider = function () {
        console.debug('ezDefi - overrode web3.setProvider')
      }

      this.setupWeb3AccountSync()
      this.setWeb3AsProxy()
      didInjectWeb3 = true
      console.debug('ezDefi - injected web3')
    }

    this.setupDappAutoReload(window.ethereum._publicConfigStore)
  },

  _bindTronWeb() {
    if (window.tronWeb !== undefined) {
      console.warn('TronWeb is already initiated. EzDefi-TronWeb will overwrite the current instance');
    } else {
      const tronWeb = new TronWeb(
        new ProxiedProvider(),
        new ProxiedProvider(),
        new ProxiedProvider()
      );

      this.proxiedMethods = {
        setAddress: tronWeb.setAddress.bind(tronWeb),
        sign: tronWeb.trx.sign.bind(tronWeb)
      };
      ['setPrivateKey', 'setAddress', 'setFullNode', 'setSolidityNode', 'setEventServer'].forEach(method => (
        tronWeb[method] = () => new Error('EzDefi-TronWeb has disabled this method')
      ));

      tronWeb.trx.sign = (...args) => (
        this.sign(...args)
      );

      window.tronWeb = tronWeb;
    }
  },

  // functions
  setupWeb3AccountSync() {
    // set web3 defaultAccount
    window.ethereum._publicConfigStore.subscribe(state => {
      window.web3.eth.defaultAccount = state.selectedAddress
    })
  },

  setWeb3AsProxy() {
    let hasBeenWarned = false

    window.web3 = new Proxy(window.web3, {
      get: (_web3, key) => {
        // get the time of use
        lastTimeUsed = Date.now()
        // show warning once on web3 access
        if (!hasBeenWarned && key !== 'currentProvider') {
          // console.warn(`ezDefi: ezDefi will soon stop injecting web3. For more information, see: https://medium.com/metamask/no-longer-injecting-web3-js-4a899ad6e59e`)
          hasBeenWarned = true
        }
        // return value normally
        return _web3[key]
      },
      set: (_web3, key, value) => {
        // set value normally
        _web3[key] = value
      },
    })

  },

  setupDappAutoReload(observable) {
    // export web3 as a window, checking for usage
    let reloadInProgress = false
    let lastSeenNetwork

    observable.subscribe(state => {
      // if the auto refresh on network change is false do not
      // do anything
      if (!window.ethereum.autoRefreshOnNetworkChange) {
        return
      }

      // if reload in progress, no need to check reload logic
      if (reloadInProgress) {
        return
      }

      const currentNetwork = state.networkVersion

      // set the initial network
      if (!lastSeenNetwork) {
        lastSeenNetwork = currentNetwork
        return
      }

      // skip reload logic if web3 not used
      if (!didInjectWeb3) {
        return
      }

      // if network did not change, exit
      if (currentNetwork === lastSeenNetwork) {
        return
      }

      // initiate page reload
      reloadInProgress = true
      const timeSinceUse = Date.now() - lastTimeUsed
      // if web3 was recently used then delay the reloading of the page
      if (timeSinceUse > 500) {
        this.triggerReset()
      } else {
        setTimeout(this.triggerReset, 500)
      }
    })
  },
  // reload the page
  triggerReset() {
    window.location.reload()
  },

  _bindEvents() {
    this.eventChannel.on('setAccountTron', address => {
      this.setAddress(address)
    });

    this.eventChannel.on('setNodeTron', node => {
      this.setNode({
        fullNode: node,
        solidityNode: node,
        eventServer: node
      })
    });

    this.eventChannel.on('ezFrame', this.frameHandler)
  },
}

pageHook.init();